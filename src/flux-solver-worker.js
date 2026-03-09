// ═══════════════════════════════════════════════════════════════════════════════
// flux-solver-worker.js — Web Worker for PBD constraint solver
// Runs the solver off the main thread. CPU Gauss-Seidel fallback +
// GPU-accelerated Jacobi PBD via WebGPU compute shaders.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── State ───
let N = 0;                    // node count
let restPositions = null;     // Float64Array(N * 3) — rest positions
let baseEdges = null;         // Uint32Array(numBaseEdges * 2)
let repulsionPairs = null;    // Uint32Array(numRepPairs * 2)
let numBaseEdges = 0;
let numRepulsionPairs = 0;

// GPU state
let gpuDevice = null;
let gpuReady = false;
let gpuPipelines = null;      // { projectConstraints, applyCorrections, projectRepulsion, clearMaxError }
let gpuBindGroupLayout = null;
let gpuShaderModule = null;
let gpuPersistentBuffers = null; // { restPositions, repulsionPairs, params }

// Max constraints per instance (padded to handle varying SC counts)
const MAX_CONSTRAINTS = 800;
// Max batch size
const MAX_BATCH = 32;
// GPU Jacobi iterations (needs more than GS to converge)
const GPU_MAX_ITERS = 2000;
// Convergence check frequency (readback every N iters)
const CONVERGENCE_CHECK_FREQ = 100;
// Convergence threshold (for applyCorrections maxError — sum of |dx|+|dy|+|dz|)
const CONVERGENCE_THRESHOLD = 1e-6;

// ─── CPU Solver (identical to _solve in flux-solver-render.js) ───
function cpuSolve(scPairs, iters, noBailout) {
    const p = new Array(N);
    for (let i = 0; i < N; i++) {
        const off = i * 3;
        p[i] = [restPositions[off], restPositions[off + 1], restPositions[off + 2]];
    }

    const C = [];
    for (let e = 0; e < numBaseEdges; e++) {
        C.push({ i: baseEdges[e * 2], j: baseEdges[e * 2 + 1], d: 1 });
    }
    for (const [i, j] of scPairs) {
        C.push({ i, j, d: 1 });
    }

    let mx = 0, mx50 = Infinity;
    for (let it = 0; it < iters; it++) {
        mx = 0;
        for (const c of C) {
            const dx = p[c.j][0] - p[c.i][0];
            const dy = p[c.j][1] - p[c.i][1];
            const dz = p[c.j][2] - p[c.i][2];
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d < 1e-10) continue;
            const f = (d - c.d) / d * 0.5;
            mx = Math.max(mx, Math.abs(d - c.d));
            p[c.i][0] += f * dx; p[c.i][1] += f * dy; p[c.i][2] += f * dz;
            p[c.j][0] -= f * dx; p[c.j][1] -= f * dy; p[c.j][2] -= f * dz;
        }
        for (let r = 0; r < numRepulsionPairs; r++) {
            const ri = repulsionPairs[r * 2], rj = repulsionPairs[r * 2 + 1];
            const dx = p[rj][0] - p[ri][0];
            const dy = p[rj][1] - p[ri][1];
            const dz = p[rj][2] - p[ri][2];
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d < 1.0 - 1e-6) {
                const f = (d - 1.0) / d * 0.5;
                p[ri][0] += f * dx; p[ri][1] += f * dy; p[ri][2] += f * dz;
                p[rj][0] -= f * dx; p[rj][1] -= f * dy; p[rj][2] -= f * dz;
            }
        }
        if (mx < 1e-9) break;
        if (!noBailout) {
            if (it === 49) mx50 = mx;
            if (it === 99 && mx > mx50 * 0.5) break;
        }
    }
    return { p, converged: mx < 1e-9 };
}

// ─── Evaluate strain on base edges (shared logic) ───
function evaluateStrain(positions) {
    let worst = 0, sum = 0, edgeLenSum = 0;
    for (let e = 0; e < numBaseEdges; e++) {
        const bi = baseEdges[e * 2], bj = baseEdges[e * 2 + 1];
        const dx = positions[bi][0] - positions[bj][0];
        const dy = positions[bi][1] - positions[bj][1];
        const dz = positions[bi][2] - positions[bj][2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const err = Math.abs(d - 1.0);
        if (err > worst) worst = err;
        sum += err;
        edgeLenSum += d;
    }
    const avg = sum / numBaseEdges;
    const pass = worst <= 5e-4 && avg <= 1e-5;
    return { pass, worst, avg, edgeLenSum };
}

// ─── CPU batch solve ───
function cpuBatchSolve(basePairs, candidateScPairs) {
    const results = [];
    for (const candidate of candidateScPairs) {
        const pairs = [...basePairs, candidate];
        const result = cpuSolve(pairs, 5000, false);
        const strain = evaluateStrain(result.p);
        results.push({ ...strain, converged: result.converged });
    }
    return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GPU Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

async function initGPU() {
    try {
        if (typeof navigator === 'undefined' || !navigator.gpu) return false;
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return false;
        gpuDevice = await adapter.requestDevice();

        // Fetch WGSL shader
        let shaderCode;
        try {
            const resp = await fetch('flux-solver-gpu.wgsl');
            shaderCode = await resp.text();
        } catch (e) {
            console.warn('[Worker] Failed to load WGSL shader:', e.message);
            return false;
        }

        gpuShaderModule = gpuDevice.createShaderModule({ code: shaderCode });

        // Check for compilation errors
        const compilationInfo = await gpuShaderModule.getCompilationInfo();
        for (const msg of compilationInfo.messages) {
            if (msg.type === 'error') {
                console.error('[Worker] WGSL compile error:', msg.message);
                return false;
            }
        }

        // Create bind group layout
        gpuBindGroupLayout = gpuDevice.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            ]
        });

        const pipelineLayout = gpuDevice.createPipelineLayout({
            bindGroupLayouts: [gpuBindGroupLayout]
        });

        // Create compute pipelines for each pass
        gpuPipelines = {
            projectConstraints: gpuDevice.createComputePipeline({
                layout: pipelineLayout,
                compute: { module: gpuShaderModule, entryPoint: 'projectConstraints' }
            }),
            applyCorrections: gpuDevice.createComputePipeline({
                layout: pipelineLayout,
                compute: { module: gpuShaderModule, entryPoint: 'applyCorrections' }
            }),
            projectRepulsion: gpuDevice.createComputePipeline({
                layout: pipelineLayout,
                compute: { module: gpuShaderModule, entryPoint: 'projectRepulsion' }
            }),
            clearMaxError: gpuDevice.createComputePipeline({
                layout: pipelineLayout,
                compute: { module: gpuShaderModule, entryPoint: 'clearMaxError' }
            }),
        };

        gpuReady = true;
        console.log('[Worker] GPU pipeline ready');
        return true;
    } catch (e) {
        console.warn('[Worker] GPU init failed:', e.message);
        return false;
    }
}

// Create/update persistent GPU buffers for lattice data (called after init or lattice change)
function updateGPULatticeBuffers() {
    if (!gpuReady) return;

    // Rest positions: N × vec4<f32>
    const restData = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
        restData[i * 4]     = restPositions[i * 3];
        restData[i * 4 + 1] = restPositions[i * 3 + 1];
        restData[i * 4 + 2] = restPositions[i * 3 + 2];
        restData[i * 4 + 3] = 0;
    }

    // Repulsion pairs: numRep × vec2<u32>
    const repData = new Uint32Array(numRepulsionPairs * 2);
    for (let i = 0; i < numRepulsionPairs; i++) {
        repData[i * 2]     = repulsionPairs[i * 2];
        repData[i * 2 + 1] = repulsionPairs[i * 2 + 1];
    }

    gpuPersistentBuffers = {
        restPositions: createGPUBuffer(restData, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
        repulsionPairs: createGPUBuffer(
            repData.byteLength > 0 ? repData : new Uint32Array(2), // min 1 pair for WebGPU
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        ),
    };
}

function createGPUBuffer(data, usage) {
    const buf = gpuDevice.createBuffer({
        size: Math.max(data.byteLength, 4), // WebGPU requires non-zero
        usage,
        mappedAtCreation: true,
    });
    new data.constructor(buf.getMappedRange()).set(data);
    buf.unmap();
    return buf;
}

// ─── GPU Batch Solve ───
async function gpuBatchSolve(basePairs, candidateScPairs) {
    const B = candidateScPairs.length;
    if (B === 0) return [];
    if (B > MAX_BATCH) {
        // Split into chunks
        const results = [];
        for (let i = 0; i < B; i += MAX_BATCH) {
            const chunk = candidateScPairs.slice(i, i + MAX_BATCH);
            const chunkResults = await gpuBatchSolve(basePairs, chunk);
            results.push(...chunkResults);
        }
        return results;
    }

    // Build per-instance constraint arrays
    const constraintData = new Uint32Array(B * MAX_CONSTRAINTS * 2);
    constraintData.fill(0xFFFFFFFF); // sentinel
    const instanceCounts = new Uint32Array(B);

    for (let b = 0; b < B; b++) {
        const offset = b * MAX_CONSTRAINTS * 2;
        let idx = 0;
        // Base pairs (shared across all instances)
        for (const [i, j] of basePairs) {
            if (idx >= MAX_CONSTRAINTS) break;
            constraintData[offset + idx * 2]     = i;
            constraintData[offset + idx * 2 + 1] = j;
            idx++;
        }
        // Candidate SC pair (unique to this instance)
        if (idx < MAX_CONSTRAINTS) {
            constraintData[offset + idx * 2]     = candidateScPairs[b][0];
            constraintData[offset + idx * 2 + 1] = candidateScPairs[b][1];
            idx++;
        }
        instanceCounts[b] = idx;
    }

    // Build initial positions: B × N × vec4<f32> (copy rest for each instance)
    const posData = new Float32Array(B * N * 4);
    for (let b = 0; b < B; b++) {
        for (let i = 0; i < N; i++) {
            posData[(b * N + i) * 4]     = restPositions[i * 3];
            posData[(b * N + i) * 4 + 1] = restPositions[i * 3 + 1];
            posData[(b * N + i) * 4 + 2] = restPositions[i * 3 + 2];
            posData[(b * N + i) * 4 + 3] = 0;
        }
    }

    // Create GPU buffers
    const paramsData = new ArrayBuffer(32);
    const paramsView = new DataView(paramsData);
    paramsView.setUint32(0, N, true);
    paramsView.setUint32(4, MAX_CONSTRAINTS, true);
    paramsView.setUint32(8, Math.max(numRepulsionPairs, 1), true);
    paramsView.setUint32(12, B, true);
    paramsView.setFloat32(16, 1.0, true); // omega (SOR factor)
    paramsView.setUint32(20, 0, true); // iteration (updated per iter)
    paramsView.setUint32(24, 0, true); // pad
    paramsView.setUint32(28, 0, true); // pad

    const paramsBuf = createGPUBuffer(new Uint8Array(paramsData), GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    const positionsBuf = createGPUBuffer(posData, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST);
    const constraintsBuf = createGPUBuffer(constraintData, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const correctionsBuf = gpuDevice.createBuffer({
        size: B * N * 4 * 4, // B × N × 4 i32
        usage: GPUBufferUsage.STORAGE,
    });
    const instanceCountsBuf = createGPUBuffer(instanceCounts, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const maxErrorBuf = gpuDevice.createBuffer({
        size: Math.max(B * 4, 4), // B × u32
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Readback buffer for positions
    const posReadbackBuf = gpuDevice.createBuffer({
        size: posData.byteLength,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    // Readback buffer for maxError
    const errorReadbackBuf = gpuDevice.createBuffer({
        size: Math.max(B * 4, 4),
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Create bind group
    const bindGroup = gpuDevice.createBindGroup({
        layout: gpuBindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: paramsBuf } },
            { binding: 1, resource: { buffer: gpuPersistentBuffers.restPositions } },
            { binding: 2, resource: { buffer: positionsBuf } },
            { binding: 3, resource: { buffer: constraintsBuf } },
            { binding: 4, resource: { buffer: correctionsBuf } },
            { binding: 5, resource: { buffer: instanceCountsBuf } },
            { binding: 6, resource: { buffer: maxErrorBuf } },
            { binding: 7, resource: { buffer: gpuPersistentBuffers.repulsionPairs } },
        ]
    });

    // Workgroup dispatch sizes
    const constraintWorkgroups = Math.ceil((B * MAX_CONSTRAINTS) / 256);
    const nodeWorkgroups = Math.ceil((B * N) / 256);
    const repulsionWorkgroups = Math.ceil((B * Math.max(numRepulsionPairs, 1)) / 256);
    const clearWorkgroups = Math.ceil(B / 64);

    // Iteration loop
    let converged = false;
    for (let iter = 0; iter < GPU_MAX_ITERS; iter++) {
        const encoder = gpuDevice.createCommandEncoder();

        // Pass 0: Clear maxError
        {
            const pass = encoder.beginComputePass();
            pass.setPipeline(gpuPipelines.clearMaxError);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(clearWorkgroups);
            pass.end();
        }
        // Pass 1: Project distance constraints
        {
            const pass = encoder.beginComputePass();
            pass.setPipeline(gpuPipelines.projectConstraints);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(constraintWorkgroups);
            pass.end();
        }
        // Pass 2: Project repulsion
        if (numRepulsionPairs > 0) {
            const pass = encoder.beginComputePass();
            pass.setPipeline(gpuPipelines.projectRepulsion);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(repulsionWorkgroups);
            pass.end();
        }
        // Pass 3: Apply corrections
        {
            const pass = encoder.beginComputePass();
            pass.setPipeline(gpuPipelines.applyCorrections);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(nodeWorkgroups);
            pass.end();
        }

        // Convergence check every N iterations
        if ((iter + 1) % CONVERGENCE_CHECK_FREQ === 0 || iter === GPU_MAX_ITERS - 1) {
            encoder.copyBufferToBuffer(maxErrorBuf, 0, errorReadbackBuf, 0, B * 4);
            gpuDevice.queue.submit([encoder.finish()]);

            await errorReadbackBuf.mapAsync(GPUMapMode.READ);
            const errorData = new Uint32Array(errorReadbackBuf.getMappedRange().slice(0));
            errorReadbackBuf.unmap();

            // Check if all instances converged
            let allConverged = true;
            for (let b = 0; b < B; b++) {
                // maxError is stored as float bits via atomicMax
                const errFloat = new Float32Array(new Uint32Array([errorData[b]]).buffer)[0];
                if (errFloat > CONVERGENCE_THRESHOLD) {
                    allConverged = false;
                    break;
                }
            }
            if (allConverged) {
                converged = true;
                break;
            }
        } else {
            gpuDevice.queue.submit([encoder.finish()]);
        }
    }

    // Readback final positions
    {
        const encoder = gpuDevice.createCommandEncoder();
        encoder.copyBufferToBuffer(positionsBuf, 0, posReadbackBuf, 0, posData.byteLength);
        gpuDevice.queue.submit([encoder.finish()]);

        await posReadbackBuf.mapAsync(GPUMapMode.READ);
        const finalPos = new Float32Array(posReadbackBuf.getMappedRange().slice(0));
        posReadbackBuf.unmap();

        // Evaluate strain per instance
        const results = [];
        for (let b = 0; b < B; b++) {
            // Extract positions for this instance as [x,y,z] arrays
            const p = new Array(N);
            for (let i = 0; i < N; i++) {
                const off = (b * N + i) * 4;
                p[i] = [finalPos[off], finalPos[off + 1], finalPos[off + 2]];
            }
            const strain = evaluateStrain(p);
            results.push({ ...strain, converged });
        }

        // Cleanup temporary buffers
        paramsBuf.destroy();
        positionsBuf.destroy();
        constraintsBuf.destroy();
        correctionsBuf.destroy();
        instanceCountsBuf.destroy();
        maxErrorBuf.destroy();
        posReadbackBuf.destroy();
        errorReadbackBuf.destroy();

        return results;
    }
}

// ─── Batch solve handler (GPU with CPU fallback + validation) ───
let _gpuValidationMode = true;  // Compare GPU vs CPU for first N batches
let _gpuValidationCount = 0;
const GPU_VALIDATION_BATCHES = 50;  // validate first 50 batches, then trust GPU

async function handleSolveBatch(msg) {
    const { basePairs, candidateScPairs, requestId } = msg;

    let results;
    if (gpuReady && gpuPersistentBuffers) {
        try {
            const gpuResults = await gpuBatchSolve(basePairs, candidateScPairs);

            // Validation: compare GPU vs CPU for early batches
            if (_gpuValidationMode && _gpuValidationCount < GPU_VALIDATION_BATCHES) {
                const cpuResults = cpuBatchSolve(basePairs, candidateScPairs);
                _gpuValidationCount++;
                let mismatches = 0;
                for (let i = 0; i < gpuResults.length; i++) {
                    if (gpuResults[i].pass !== cpuResults[i].pass) {
                        mismatches++;
                        self.postMessage({ type: 'warn', text: `GPU/CPU mismatch #${i}: gpu=${gpuResults[i].pass} cpu=${cpuResults[i].pass} (worst: gpu=${gpuResults[i].worst.toFixed(6)} cpu=${cpuResults[i].worst.toFixed(6)})` });
                    }
                }
                if (mismatches > 0) {
                    self.postMessage({ type: 'warn', text: `Batch ${_gpuValidationCount}: ${mismatches}/${gpuResults.length} GPU/CPU mismatches` });
                    results = cpuResults;
                } else {
                    results = gpuResults;
                    if (_gpuValidationCount % 10 === 0) {
                        self.postMessage({ type: 'log', text: `GPU validation ${_gpuValidationCount}/${GPU_VALIDATION_BATCHES}: all pass/fail match` });
                    }
                }
                if (_gpuValidationCount >= GPU_VALIDATION_BATCHES) {
                    self.postMessage({ type: 'log', text: `GPU validation complete (${GPU_VALIDATION_BATCHES} batches). Trusting GPU.` });
                    _gpuValidationMode = false;
                }
            } else {
                results = gpuResults;
            }
        } catch (e) {
            console.warn('[Worker] GPU batch solve failed, falling back to CPU:', e.message);
            results = cpuBatchSolve(basePairs, candidateScPairs);
        }
    } else {
        results = cpuBatchSolve(basePairs, candidateScPairs);
    }

    self.postMessage({ type: 'solveBatchResult', requestId, results });
}

// ─── Message handler ───
self.onmessage = function(e) {
    const msg = e.data;
    switch (msg.type) {
        case 'init': {
            N = msg.N;
            numBaseEdges = msg.numBaseEdges;
            numRepulsionPairs = msg.numRepulsionPairs;

            // Copy lattice data
            restPositions = new Float64Array(msg.restPositions);
            baseEdges = new Uint32Array(msg.baseEdges);
            repulsionPairs = new Uint32Array(msg.repulsionPairs);

            // Init GPU + create persistent buffers
            initGPU().then(hasGPU => {
                if (hasGPU) updateGPULatticeBuffers();
                self.postMessage({ type: 'ready', gpu: hasGPU });
            });
            break;
        }
        case 'solveBatch':
            handleSolveBatch(msg);
            break;
        case 'updateLattice': {
            N = msg.N;
            numBaseEdges = msg.numBaseEdges;
            numRepulsionPairs = msg.numRepulsionPairs;
            restPositions = new Float64Array(msg.restPositions);
            baseEdges = new Uint32Array(msg.baseEdges);
            repulsionPairs = new Uint32Array(msg.repulsionPairs);
            if (gpuReady) updateGPULatticeBuffers();
            break;
        }
    }
};
