// ═══════════════════════════════════════════════════════════════════════════════
// flux-solver-worker.js — Web Worker for PBD constraint solver
// Runs the solver off the main thread. Communicates via SharedArrayBuffer +
// Atomics for synchronous calls, or postMessage for async batch calls.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── State ───
let N = 0;                    // node count
let restPositions = null;     // Float64Array(N * 3) — rest positions
let baseEdges = null;         // Uint32Array(numBaseEdges * 2)
let repulsionPairs = null;    // Uint32Array(numRepPairs * 2)
let numBaseEdges = 0;
let numRepulsionPairs = 0;

// SharedArrayBuffer views for sync path
let syncView = null;          // Int32Array(4) — command/result flags
let dataView = null;          // Float64Array — positions + constraints

// GPU state (Phase 3)
let gpuDevice = null;
let gpuReady = false;

// ─── CPU Solver (identical to _solve in flux-solver-render.js) ───
function cpuSolve(scPairs, iters, noBailout) {
    // Copy rest positions
    const p = new Array(N);
    for (let i = 0; i < N; i++) {
        const off = i * 3;
        p[i] = [restPositions[off], restPositions[off + 1], restPositions[off + 2]];
    }

    // Build constraint array: BASE_EDGES + SC pairs
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

// ─── Sync solve via SharedArrayBuffer + Atomics ───
// Layout of dataView (Float64Array):
//   [0 .. N*3-1]                  = result positions (worker writes)
//   [N*3 .. N*3 + maxC*2 - 1]    = constraint SC pairs as flat [i0,j0,i1,j1,...] (main writes)
//
// syncView (Int32Array[8]):
//   [0] = command (0=idle, 1=solve_requested, 2=result_ready)
//   [1] = constraint count (number of SC pairs)
//   [2] = converged (0/1)
//   [3] = iters param
//   [4] = noBailout (0/1)
//   [5..7] = reserved

function syncSolveLoop() {
    while (true) {
        // Wait for work (blocks this worker thread)
        Atomics.wait(syncView, 0, 0);

        const cmd = Atomics.load(syncView, 0);
        if (cmd !== 1) continue; // spurious wake

        const numSC = Atomics.load(syncView, 1);
        const iters = Atomics.load(syncView, 3) || 5000;
        const noBailout = Atomics.load(syncView, 4) !== 0;

        // Read SC pairs from dataView
        const scPairs = [];
        const scOffset = N * 3;
        for (let c = 0; c < numSC; c++) {
            scPairs.push([dataView[scOffset + c * 2], dataView[scOffset + c * 2 + 1]]);
        }

        // Solve
        const result = cpuSolve(scPairs, iters, noBailout);

        // Write positions back
        for (let i = 0; i < N; i++) {
            dataView[i * 3]     = result.p[i][0];
            dataView[i * 3 + 1] = result.p[i][1];
            dataView[i * 3 + 2] = result.p[i][2];
        }

        // Signal completion
        Atomics.store(syncView, 2, result.converged ? 1 : 0);
        Atomics.store(syncView, 0, 2); // result_ready
        Atomics.notify(syncView, 0);
    }
}

// ─── Async batch solve (for canMaterialiseQuick batching) ───
function handleSolveBatch(msg) {
    const { basePairs, candidateScPairs, baseEdgeFlat, requestId } = msg;

    const results = [];
    for (const candidate of candidateScPairs) {
        const pairs = [...basePairs, candidate];
        const result = cpuSolve(pairs, 5000, false);

        // Evaluate strain on base edges (same logic as canMaterialiseQuick)
        let worst = 0, sum = 0, edgeLenSum = 0;
        for (let e = 0; e < numBaseEdges; e++) {
            const bi = baseEdges[e * 2], bj = baseEdges[e * 2 + 1];
            const dx = result.p[bi][0] - result.p[bj][0];
            const dy = result.p[bi][1] - result.p[bj][1];
            const dz = result.p[bi][2] - result.p[bj][2];
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const err = Math.abs(d - 1.0);
            if (err > worst) worst = err;
            sum += err;
            edgeLenSum += d;
        }
        const avg = sum / numBaseEdges;
        const pass = worst <= 5e-4 && avg <= 1e-5;
        results.push({ pass, worst, avg, converged: result.converged, edgeLenSum });
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

            // Set up SharedArrayBuffer views if provided
            if (msg.syncBuffer && msg.dataBuffer) {
                syncView = new Int32Array(msg.syncBuffer);
                dataView = new Float64Array(msg.dataBuffer);

                // Write rest positions into dataBuffer so main thread can read them
                // (not needed — main thread has its own copy)

                // Start the sync solve loop in this thread
                // Use setTimeout to not block the message handler
                setTimeout(syncSolveLoop, 0);
            }

            // Try WebGPU init (Phase 3)
            initGPU().then(hasGPU => {
                self.postMessage({ type: 'ready', gpu: hasGPU, sabReady: !!syncView });
            });
            break;
        }
        case 'solveBatch':
            handleSolveBatch(msg);
            break;
        case 'updateLattice': {
            // Lattice changed (e.g., L1→L2 switch)
            N = msg.N;
            numBaseEdges = msg.numBaseEdges;
            numRepulsionPairs = msg.numRepulsionPairs;
            restPositions = new Float64Array(msg.restPositions);
            baseEdges = new Uint32Array(msg.baseEdges);
            repulsionPairs = new Uint32Array(msg.repulsionPairs);
            break;
        }
    }
};

// ─── WebGPU init (Phase 3 — stub for now) ───
async function initGPU() {
    try {
        if (typeof navigator === 'undefined' || !navigator.gpu) return false;
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return false;
        gpuDevice = await adapter.requestDevice();
        gpuReady = true;
        return true;
    } catch (e) {
        return false;
    }
}
