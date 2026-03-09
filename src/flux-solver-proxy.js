// ═══════════════════════════════════════════════════════════════════════════════
// flux-solver-proxy.js — Main-thread proxy for the solver Web Worker
//
// Strategy: The CPU solver stays on the main thread for synchronous calls
// (canMaterialiseQuick, detectImplied, etc.). The Worker handles:
//   1. Async batch pre-solve: many canMaterialiseQuick candidates in one round-trip
//   2. Future: WebGPU compute shader for GPU-accelerated Jacobi PBD
//
// Note: Atomics.wait is NOT available on Chrome main thread, so we cannot do
// synchronous Worker delegation. All Worker communication is async via postMessage.
//
// Must load BEFORE flux-solver-render.js in the HTML.
// ═══════════════════════════════════════════════════════════════════════════════

const SolverProxy = (function() {
    let worker = null;
    let ready = false;
    let hasGPU = false;
    let _forceDisable = false;

    let currentN = 0;

    // Batch pre-solve state
    const pendingCallbacks = new Map();
    let requestCounter = 0;
    let batchCache = new Map();    // scId → {pass, worst, avg}
    let batchCacheVersion = -1;

    // ─── Init ───
    function init() {
        if (_forceDisable) {
            console.log('[SolverProxy] Force-disabled');
            return;
        }

        try {
            worker = new Worker('src/flux-solver-worker.js');
        } catch (e) {
            console.warn('[SolverProxy] Worker creation failed:', e.message);
            return;
        }

        worker.onmessage = handleWorkerMessage;
        worker.onerror = function(e) {
            console.error('[SolverProxy] Worker error:', e.message);
        };

        console.log('[SolverProxy] Worker created, waiting for lattice init...');
    }

    // Called after rebuildLatticeGeometry when N, REST, BASE_EDGES, REPULSION_PAIRS are ready
    function initLattice() {
        if (!worker || _forceDisable) return;

        currentN = N; // global N from flux-solver-render.js

        // Flatten lattice data for transfer
        const restFlat = new Float64Array(currentN * 3);
        for (let i = 0; i < currentN; i++) {
            restFlat[i * 3]     = REST[i][0];
            restFlat[i * 3 + 1] = REST[i][1];
            restFlat[i * 3 + 2] = REST[i][2];
        }

        const baseFlat = new Uint32Array(BASE_EDGES.length * 2);
        for (let i = 0; i < BASE_EDGES.length; i++) {
            baseFlat[i * 2]     = BASE_EDGES[i][0];
            baseFlat[i * 2 + 1] = BASE_EDGES[i][1];
        }

        const repFlat = new Uint32Array(REPULSION_PAIRS.length * 2);
        for (let i = 0; i < REPULSION_PAIRS.length; i++) {
            repFlat[i * 2]     = REPULSION_PAIRS[i][0];
            repFlat[i * 2 + 1] = REPULSION_PAIRS[i][1];
        }

        worker.postMessage({
            type: 'init',
            N: currentN,
            numBaseEdges: BASE_EDGES.length,
            numRepulsionPairs: REPULSION_PAIRS.length,
            restPositions: restFlat.buffer,
            baseEdges: baseFlat.buffer,
            repulsionPairs: repFlat.buffer,
        }, [restFlat.buffer, baseFlat.buffer, repFlat.buffer]);
    }

    // ─── Worker message handler ───
    function handleWorkerMessage(e) {
        const msg = e.data;
        switch (msg.type) {
            case 'ready':
                ready = true;
                hasGPU = msg.gpu;
                console.log(`[SolverProxy] Ready (gpu: ${hasGPU})`);
                break;
            case 'solveBatchResult': {
                const cb = pendingCallbacks.get(msg.requestId);
                if (cb) {
                    pendingCallbacks.delete(msg.requestId);
                    cb(msg.results);
                }
                break;
            }
        }
    }

    // ─── Async batch pre-solve ───
    // Solves basePairs + each candidate individually in the Worker.
    // Returns Promise<{pass, worst, avg}[]> or null if not available.
    function solveBatch(basePairs, candidateScPairs) {
        if (!ready || !worker || _forceDisable) return Promise.resolve(null);

        return new Promise((resolve) => {
            const requestId = requestCounter++;
            pendingCallbacks.set(requestId, resolve);
            worker.postMessage({
                type: 'solveBatch',
                basePairs,
                candidateScPairs,
                requestId,
            });
        });
    }

    // ─── Batch cache for canMaterialiseQuick ───
    // After a batch pre-solve completes, cache results keyed by scId
    function cacheBatchResults(scIds, results, version) {
        batchCache.clear();
        for (let i = 0; i < scIds.length; i++) {
            batchCache.set(scIds[i], results[i]);
        }
        batchCacheVersion = version;
    }

    // Check if we have a pre-computed result for this scId
    function getBatchResult(scId) {
        if (batchCacheVersion !== stateVersion) return null;
        return batchCache.get(scId) || null;
    }

    // Invalidate batch cache (called when state changes)
    function invalidateCache() {
        batchCacheVersion = -1;
    }

    return {
        init,
        initLattice,
        solveBatch,
        cacheBatchResults,
        getBatchResult,
        invalidateCache,
        isReady() { return ready && !_forceDisable; },
        hasGPU() { return hasGPU; },
        get _forceDisable() { return _forceDisable; },
        set _forceDisable(v) { _forceDisable = v; },
    };
})();
