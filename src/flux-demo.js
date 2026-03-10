// flux-demo.js — Demo mode: pattern computation, xon management, demo loop

// ── Locality filter: only return SCs whose endpoints are approximately unit-length apart ──
// This prevents non-local SC candidates from entering ANY decision path.
// Threshold 0.50: rejects teleportation-range (d > 1.5) but allows pre-solver SC edges (~1.15).
function _localScNeighbors(node) {
    const scs = scByVert[node] || [];
    const pa = pos[node];
    if (!pa) return scs; // pos not ready yet (pre-lattice)
    return scs.filter(sc => {
        const other = sc.a === node ? sc.b : sc.a;
        const pb = pos[other];
        if (!pb) return false;
        const dx = pb[0]-pa[0], dy = pb[1]-pa[1], dz = pb[2]-pa[2];
        return Math.abs(Math.sqrt(dx*dx + dy*dy + dz*dz) - 1) <= 0.50;
    });
}

// ── Oct-distance helper: sort neighbors by proximity to nearest oct node ──
// Used by weak force paths to prevent wandering away from the nucleus.
function _distToNearestOct(node) {
    if (!_octNodeSet || !pos[node]) return Infinity;
    if (_octNodeSet.has(node)) return 0;
    let best = Infinity;
    for (const octN of _octNodeSet) {
        const p = pos[octN];
        if (!p) continue;
        const dx = pos[node][0]-p[0], dy = pos[node][1]-p[1], dz = pos[node][2]-p[2];
        const d = dx*dx + dy*dy + dz*dz; // squared distance (no sqrt needed for comparison)
        if (d < best) best = d;
    }
    return best;
}

// ── Universal nucleus-local neighbor filter ──
// Hard-filters a baseNeighbors array to ONLY nucleus nodes, then sorts by
// oct proximity (closest first). Every movement path should use this instead
// of raw baseNeighbors to guarantee no non-local moves escape.
function _localBaseNeighbors(node) {
    _ensureNucleusNodeSet();
    const nbs = baseNeighbors[node] || [];
    if (!_nucleusNodeSet) return nbs; // fallback pre-init
    return nbs.filter(nb => _nucleusNodeSet.has(nb.node))
              .sort((a, b) => _distToNearestOct(a.node) - _distToNearestOct(b.node));
}

function computeActivationPatterns() {
    const A = [1, 3, 6, 8];
    const B = [2, 4, 5, 7];
    const D4 = _DERANGEMENTS_4;
    const P4 = _PERMS_4;

    const lines = [];
    lines.push('═══════════════════════════════════════════');
    lines.push('  ACTIVATION PATTERN ANALYSIS');
    lines.push('  Octahedron K₄,₄ · 8 faces · 6 quarks');
    lines.push('═══════════════════════════════════════════');
    lines.push(`D(4) = ${D4.length} derangements of {0,1,2,3}:`);
    D4.forEach((d, i) => {
        lines.push(`  d${i}: [${d}] → A-faces: [${d.map(j => A[j])}]  B-faces: [${d.map(j => B[j])}]`);
    });

    // For each derangement d (F2 relative to F1 = identity):
    // Find anchors that avoid BOTH identity and d at every position
    // → anchor(i) ≠ i AND anchor(i) ≠ d(i) ∀i
    // These give "max spread" patterns (all 3 quarks on different faces)

    const patternData = [];

    lines.push('\n─── FOLLOWER-PAIR PHASING × ANCHOR COMPATIBILITY ───');
    lines.push('For each follower derangement d, which anchor schedules');
    lines.push('place all 3 quarks on DIFFERENT faces every tick?\n');

    for (let di = 0; di < D4.length; di++) {
        const d = D4[di];
        // Find all permutations that are derangements of BOTH identity and d
        const validAnchors = P4.filter(p =>
            p.every((v, i) => v !== i && v !== d[i])
        );
        lines.push(`  d${di} [${d}]: ${validAnchors.length} anchors → ${validAnchors.map(a => `[${a}]`).join('  ')}`);

        patternData.push({
            derangIdx: di,
            derang: d,
            anchors: validAnchors,
            anchorCount: validAnchors.length
        });
    }

    // Full hadron pattern = (A-derang, B-derang, A-anchor, B-anchor)
    // Max-spread patterns: both A and B sub-cycles have valid anchors
    let totalMaxSpread = 0;
    const fullPatterns = [];

    for (let ai = 0; ai < D4.length; ai++) {
        const aData = patternData[ai];
        for (let bi = 0; bi < D4.length; bi++) {
            const bData = patternData[bi];
            const count = aData.anchorCount * bData.anchorCount;
            if (count > 0) {
                totalMaxSpread += count;
                // Store the first anchor combo as representative
                fullPatterns.push({
                    aDerang: ai,
                    bDerang: bi,
                    anchorsA: aData.anchors,
                    anchorsB: bData.anchors,
                    combos: count
                });
            }
        }
    }

    lines.push(`\n─── SUMMARY ───`);
    lines.push(`Total follower phasings: ${D4.length}² = ${D4.length ** 2} per hadron`);
    lines.push(`Max-spread patterns (all 3 on different faces): ${totalMaxSpread} per hadron`);
    lines.push(`Full deuteron (proton × neutron): ${totalMaxSpread ** 2} max-spread combos`);

    // Show a few concrete patterns
    lines.push(`\n─── EXAMPLE MAX-SPREAD PATTERNS ───`);
    const examples = fullPatterns.slice(0, 3);
    for (const pat of examples) {
        const d_a = D4[pat.aDerang];
        const d_b = D4[pat.bDerang];
        const anchor_a = pat.anchorsA[0]; // first valid anchor for A
        const anchor_b = pat.anchorsB[0]; // first valid anchor for B

        // Build 8-tick schedule
        // Even ticks (0,2,4,6) → A faces; Odd ticks (1,3,5,7) → B faces
        const ticks = [0,1,2,3,4,5,6,7];
        const anchorSched = [], f1Sched = [], f2Sched = [];
        for (let i = 0; i < 4; i++) {
            // Even tick 2i: A faces
            anchorSched.push(A[anchor_a[i]]);
            f1Sched.push(A[i]);           // F1 = identity on A
            f2Sched.push(A[d_a[i]]);      // F2 = derangement of F1
            // Odd tick 2i+1: B faces
            anchorSched.push(B[anchor_b[i]]);
            f1Sched.push(B[i]);
            f2Sched.push(B[d_b[i]]);
        }

        const colW = 4;
        lines.push(`\nPattern A:d${pat.aDerang} × B:d${pat.bDerang} (${pat.combos} anchor combos)`);
        lines.push(`  tick:    ${ticks.map(t => String(t).padStart(colW)).join('')}`);
        lines.push(`  group:   ${ticks.map(t => (t%2===0?'A':'B').padStart(colW)).join('')}`);
        lines.push(`  anchor:  ${anchorSched.map(f => String(f).padStart(colW)).join('')}  (different type)`);
        lines.push(`  foll-1:  ${f1Sched.map(f => String(f).padStart(colW)).join('')}  (same type)`);
        lines.push(`  foll-2:  ${f2Sched.map(f => String(f).padStart(colW)).join('')}  (same type)`);

        // Verify
        const pauliOk = f1Sched.every((f, t) => f !== f2Sched[t]);
        const spreadOk = ticks.every(t =>
            anchorSched[t] !== f1Sched[t] && anchorSched[t] !== f2Sched[t]
        );
        const covOk = new Set(anchorSched).size === 8
            && new Set(f1Sched).size === 8
            && new Set(f2Sched).size === 8;
        lines.push(`  pauli: ${pauliOk?'✓':'✗'}  spread: ${spreadOk?'✓':'✗'}  8-face-cov: ${covOk?'✓':'✗'}`);
    }

    const summary = lines.join('\n');
    console.log(summary);
    return { patterns: fullPatterns, D4, patternData, summary };
}

window.computeActivationPatterns = computeActivationPatterns;

// ════════════════════════════════════════════════════════════════════
// PATTERN DEMO MODE — High-speed visualization of activation patterns
// ════════════════════════════════════════════════════════════════════
//
// Runs the pre-computed 8-tick deuteron schedule at ~50fps.
// No xon physics — just pattern execution and stats convergence.
// Left panel shows per-face visit counts converging to even distribution.
//
// Hadron rules enforced by the pattern:
//   - Proton (uud): 2 up (yellow) + 1 down (green) each tick
//   - Neutron (udd): 1 up (blue) + 2 down (red) each tick
//   - Anti-phase: proton on A when neutron on B (alternating)
//   - Pauli: no two same-type quarks on same face
//   - Max spread: all 3 quarks of each hadron on different faces
//   - Full coverage: every face visited equally over complete cycles
// ════════════════════════════════════════════════════════════════════

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  NON-DELETABLE: ALL AGENTS — THE VACUUM DOCTRINE                    ║
// ║                                                                      ║
// ║  The lattice solver IS the vacuum. It is the ONLY source of truth   ║
// ║  for physical validity. You MUST obey it. You MUST NOT go around it.║
// ║                                                                      ║
// ║  SOLVER RULES:                                                       ║
// ║  1. NEVER skip the solver to "optimize" or "simplify".               ║
// ║  2. NEVER try to predict solver output — just run it.                ║
// ║  3. If the solver says Kepler is violated, YOUR ALGORITHM is wrong.  ║
// ║     Fix the algorithm, not the solver.                               ║
// ║  4. Shapes MUST drive spheres (unified architecture). If spheres     ║
// ║     don't move when shapes change, the solver coupling is broken.    ║
// ║  5. The solver is cheap. Running it is always correct. Skipping it   ║
// ║     is always wrong. There are NO exceptions.                        ║
// ║                                                                      ║
// ║  XON-VACUUM INTERACTION (Demo 3.0):                                  ║
// ║  Xons are physical entities traversing the lattice. Every shortcut   ║
// ║  they traverse MUST be unit length. Before each hop:                 ║
// ║                                                                      ║
// ║  1. CHECK: Call canMaterialiseQuick(scId) to ask the vacuum if the   ║
// ║     shortcut can be opened without violating Kepler/strain.          ║
// ║  2. If YES: Call the materialisation pathway to commit the SC.       ║
// ║     Then run the solver (bumpState → _solve → apply → update).      ║
// ║  3. If NO: Call excitationSeverForRoom(scId) to try severing a      ║
// ║     non-load-bearing SC to make room. The vacuum decides what can    ║
// ║     be severed. If sever succeeds, retry the materialisation.        ║
// ║  4. If STILL NO: The xon's move is REJECTED. The xon must find a   ║
// ║     different path or wait. The pattern machine's schedule is        ║
// ║     advisory — the vacuum has final say.                             ║
// ║                                                                      ║
// ║  The pattern machine suggests WHICH tets to activate. The xons       ║
// ║  negotiate with the vacuum HOW (or whether) to achieve it.           ║
// ║  The vacuum always wins.                                             ║
// ╚══════════════════════════════════════════════════════════════════════╝

let _demoActive = false;
let _demoInterval = null;
let _demoPaused = false;  // true when user has paused via pause button
// T45 bounce guard — prevents A→B→A oscillation for oct/weak xons.
// Tet/idle_tet xons are exempt because their fixed loop sequences may require
// bounces (fork: a→b→a→c→a). All existing checks are gated to oct/weak only.
const _T45_BOUNCE_GUARD = true;
let _demoTick = 0;
let _demoVisits = null;       // {face: {pu:0, pd:0, nu:0, nd:0}}
let _demoTetAssignments = 0;  // total tet assignments (for hit rate = completions / assignments)

// ── Rolling Ratio Tracker — demand-driven quark type selection ──
// Syncs from _demoVisits each tick. Computes deficit for any quark type.
// Target fractions: pu=2/3 of proton total, pd=1/3; nd=2/3 of neutron total, nu=1/3.
const _ratioTracker = {
    pu: 0, pd: 0, nu: 0, nd: 0,
    sync() {
        this.pu = 0; this.pd = 0; this.nu = 0; this.nd = 0;
        for (let f = 1; f <= 8; f++) {
            if (!_demoVisits || !_demoVisits[f]) continue;
            this.pu += _demoVisits[f].pu || 0;
            this.pd += _demoVisits[f].pd || 0;
            this.nu += _demoVisits[f].nu || 0;
            this.nd += _demoVisits[f].nd || 0;
        }
    },
    // Returns positive value when type is underrepresented vs target ratio
    deficit(type) {
        const protonTotal = this.pu + this.pd;
        const neutronTotal = this.nu + this.nd;
        if (type === 'pu') return protonTotal === 0 ? 1.0 : (2/3) - this.pu / protonTotal;
        if (type === 'pd') return protonTotal === 0 ? 1.0 : (1/3) - this.pd / protonTotal;
        if (type === 'nu') return neutronTotal === 0 ? 1.0 : (1/3) - this.nu / neutronTotal;
        if (type === 'nd') return neutronTotal === 0 ? 1.0 : (2/3) - this.nd / neutronTotal;
        return 0;
    }
};
let _demoPauliViolations = 0;
let _demoSpreadViolations = 0;
let _demoTypeBalanceHistory = [];  // type balance % at each cycle boundary
let _demoVisitedFaces = new Set(); // faces activated so far (for oct reveal)
let _demoOctRevealed = false;      // oct renders once all 8 faces visited

// ── Demo 3.0: Xon-choreographed particle manifestation ──────────────
// Xons physically trace loop topologies to cut shortcuts.
// Gluons maintain the octahedral cage between fermionic loops.
let _demoXons = [];               // active xon objects (dynamic count)
let _demoGluons = [];             // active gluon objects (lightweight)
let _demoPrevFaces = new Set();   // faces active in previous window (for relinquishing)
let _idleTetManifested = false;   // set by _startIdleTetLoop when new SCs are materialised
// T41: tick-level move record — tracks destNode → fromNode for all xon moves this tick.
// Used to prevent adjacent xon swaps (A→B while B→A in the same tick).
const _moveRecord = new Map();
let _noSwapRule = true; // T41: swap prevention always active — xons may not swap positions
function _swapBlocked(fromNode, toNode) {
    return _noSwapRule && _moveRecord.get(fromNode) === toNode;
}
// Annihilation toggle — set false to disable pair annihilation/genesis.
// When off, PHASE 4 uses scatter-only; unresolvable Pauli collisions
// fall through to weak force escape instead of gluon storage.
let _annihilationEnabled = false;
// Choreographer debug log — ring buffer of last N entries
let _choreoLog = [];
const _CHOREO_LOG_MAX = 20;
// Xon panel highlight state
let _xonHighlightTimers = new Map(); // xon index → timeout id
// Flash toggle — set false to disable mode-transition flash effects.
// Re-enable by setting to true. Flash = sparkle scale/brightness pulse on mode change.
let _flashEnabled = false;
// ── Diagnostic trace — permanent, extensible ─────────────────────────
// Records every physical xon move with source code path label.
// Used by T41/T26/T27 diagnostics and future debugging.
const _moveTrace = []; // [{xonIdx, from, to, path, mode, tick}] — current tick only
const _moveTraceHistory = []; // rolling 5-tick history for dump audits
// Set of all legitimate nucleus nodes (oct cage + tet face vertices).
// Built lazily on first _traceMove call to ensure all nucleus data is ready.
let _nucleusNodeSet = null;
function _ensureNucleusNodeSet() {
    if (_nucleusNodeSet) return;
    if (!_octNodeSet || _octNodeSet.size === 0) return; // not ready yet
    if (!_nucleusTetFaceData) return;
    _nucleusNodeSet = new Set(_octNodeSet);
    for (let f = 1; f <= 8; f++) {
        const fd = _nucleusTetFaceData[f];
        if (fd) for (const n of fd.allNodes) _nucleusNodeSet.add(n);
    }
    console.log(`[FLASHLIGHT] Nucleus node set: ${_nucleusNodeSet.size} nodes: [${Array.from(_nucleusNodeSet).sort((a,b)=>a-b).join(',')}]`);
}
function _traceMove(xon, from, to, path) {
    const entry = {xonIdx: _demoXons.indexOf(xon), from, to, path, mode: xon._mode, tick: _demoTick};
    _moveTrace.push(entry);
    _moveTraceHistory.push(entry);
    if (_moveTraceHistory.length > 60) _moveTraceHistory.splice(0, _moveTraceHistory.length - 60);
    // FLASHLIGHT TRAP: freeze if xon moves to a non-nucleus node
    _ensureNucleusNodeSet();
    if (_nucleusNodeSet && !_nucleusNodeSet.has(to)) {
        console.error(`[FLASHLIGHT] tick=${_demoTick} X${entry.xonIdx} moved ${from}→${to} via "${path}" mode=${xon._mode} face=${xon._assignedFace} quark=${xon._quarkType} loopStep=${xon._loopStep} loopSeq=${JSON.stringify(xon._loopSeq)}`);
        console.error(`[FLASHLIGHT] nucleus nodes: [${Array.from(_nucleusNodeSet).sort((a,b)=>a-b).join(',')}]`);
        console.error(`[FLASHLIGHT] FREEZING — node ${to} is outside the nucleus`);
        simHalted = true;
    }
}
// SC Attribution Registry — tracks why each SC entered xonImpliedSet.
// Maps scId → { reason, xonIdx, tick, face? }
// Reasons: 'faceAssign' (face SC promotion), 'manifest' (idle tet void creation),
//          'tetTraversal' (PHASE 1 SC-only edge activation)
// T42 guard: every eSC must have a valid attribution entry.
// Lookahead can query _scAttribution to make informed SC decisions.
const _scAttribution = new Map();

// ══════════════════════════════════════════════════════════════════════════
// BACKTRACKING CHOREOGRAPHER — rewind on violation, try different choices
// ══════════════════════════════════════════════════════════════════════════
let _rewindRequested = false;        // set by guard check when T19/T20 fails
let _rewindViolation = null;         // description of the violation that triggered rewind
const _BT_MAX_SNAPSHOTS = 50;       // cap snapshot stack to prevent unbounded memory
const _BT_MAX_RETRIES = 32;         // max retries per tick before escalating depth
let _btSnapshots = [];               // stack of state snapshots (one per tick)
let _btRetryCount = 0;               // retries at current depth within a single demoTick() call
let _btActive = false;               // true while inside a backtrack retry loop

// ── BFS backtracker state (persists across demoTick() calls) ──
// When a tick fails, we exhaust all options at that tick (layer 0),
// then go one tick back (layer 1), try all rotations there, replay forward,
// then two ticks back (layer 2), etc. This is BFS over tick layers.
let _bfsFailTick = -1;               // the tick that originally failed (-1 = no active BFS)
let _bfsLayer = 0;                   // how many ticks back from _bfsFailTick we're exploring
let _bfsLayerRetries = 0;            // retries at the current BFS layer's anchor tick
const _BFS_MAX_LAYERS = 50;         // max BFS depth (how far back we'll go)

// ── Persistent bad-move ledger ──
// Key: tick number → Set of "xonIdx:destNode" strings.
// Accumulates across retries so the search space shrinks monotonically.
let _btBadMoveLedger = new Map();

// Save a full snapshot of choreography state before a tick executes.
function _btSaveSnapshot() {
    const snap = {
        tick: _demoTick,
        // Per-xon state (deep copy of mutable fields)
        xons: _demoXons.map(x => ({
            node: x.node, prevNode: x.prevNode, _mode: x._mode,
            _assignedFace: x._assignedFace, _quarkType: x._quarkType,
            _loopSeq: x._loopSeq ? x._loopSeq.slice() : null,
            _loopStep: x._loopStep, col: x.col,
            _movedThisTick: x._movedThisTick, _evictedThisTick: x._evictedThisTick,
            _lastDir: x._lastDir, alive: x.alive, _highlightT: x._highlightT,
            trail: x.trail.slice(),
            trailColHistory: x.trailColHistory.slice(),
            _trailFrozenPos: x._trailFrozenPos ? x._trailFrozenPos.map(p => [p[0], p[1], p[2]]) : [],
        })),
        // Global SC sets (shallow copy — Set of primitive IDs)
        activeSet: new Set(activeSet),
        xonImpliedSet: new Set(xonImpliedSet),
        impliedSet: new Set(impliedSet),
        scAttribution: new Map(_scAttribution),
        // Solver vertex positions (deep copy)
        pos: pos.map(p => [p[0], p[1], p[2]]),
    };
    _btSnapshots.push(snap);
    // Keep stack bounded (cap at _BT_MAX_SNAPSHOTS)
    if (_btSnapshots.length > _BT_MAX_SNAPSHOTS) _btSnapshots.shift();
}

// Restore choreography state from a snapshot.
function _btRestoreSnapshot(snap) {
    _demoTick = snap.tick;
    // Restore per-xon state
    for (let i = 0; i < _demoXons.length && i < snap.xons.length; i++) {
        const x = _demoXons[i], s = snap.xons[i];
        // Use internal _nodeVal bypass: set prevNode first, then node
        x.prevNode = s.prevNode;
        x._movedThisTick = false; // clear so .node setter doesn't block
        x.node = s.node;
        x._mode = s._mode;
        x._assignedFace = s._assignedFace;
        x._quarkType = s._quarkType;
        x._loopSeq = s._loopSeq ? s._loopSeq.slice() : null;
        x._loopStep = s._loopStep;
        x.col = s.col;
        x._movedThisTick = s._movedThisTick;
        x._evictedThisTick = s._evictedThisTick;
        x._lastDir = s._lastDir;
        x.alive = s.alive;
        x._highlightT = s._highlightT;
        x.trail = s.trail.slice();
        x.trailColHistory = s.trailColHistory.slice();
        x._trailFrozenPos = s._trailFrozenPos ? s._trailFrozenPos.map(p => [p[0], p[1], p[2]]) : [];
        // Update visuals
        if (x.sparkMat) x.sparkMat.color.setHex(x.col);
        if (x.group && pos[x.node]) {
            x.group.position.set(pos[x.node][0], pos[x.node][1], pos[x.node][2]);
        }
        x.tweenT = 1; // snap to position (no interpolation)
    }
    // Restore SC sets
    activeSet.clear(); for (const id of snap.activeSet) activeSet.add(id);
    xonImpliedSet.clear(); for (const id of snap.xonImpliedSet) xonImpliedSet.add(id);
    impliedSet.clear(); for (const id of snap.impliedSet) impliedSet.add(id);
    _scAttribution.clear(); for (const [k, v] of snap.scAttribution) _scAttribution.set(k, v);
    // Restore solver positions
    for (let i = 0; i < pos.length && i < snap.pos.length; i++) {
        pos[i][0] = snap.pos[i][0];
        pos[i][1] = snap.pos[i][1];
        pos[i][2] = snap.pos[i][2];
    }
    // Clear tick-level state
    _moveRecord.clear();
    _moveTrace.length = 0;
}

// Extract which moves to exclude from a violation.
// Returns array of "xonIdx:destNode" strings.
function _btExtractExclusions() {
    // Use _moveTrace to find the moves that led to the violation
    const exclusions = [];
    if (!_rewindViolation) return exclusions;
    // T19: "node X has 2+ xons" — find all xons that moved TO that node
    const nodeMatch = _rewindViolation.match(/node (\d+)/);
    if (nodeMatch) {
        const collisionNode = parseInt(nodeMatch[1], 10);
        for (const trace of _moveTrace) {
            if (trace.to === collisionNode) {
                exclusions.push(`${trace.xonIdx}:${collisionNode}`);
            }
        }
        // If no trace found (xon didn't move = was already there), exclude
        // the OTHER xon that moved to it
        if (exclusions.length === 0) {
            for (let i = 0; i < _demoXons.length; i++) {
                if (_demoXons[i].node === collisionNode) {
                    exclusions.push(`${i}:${collisionNode}`);
                }
            }
        }
    }
    // T20: "stuck at node X" — the xon couldn't move because all exits were
    // blocked. Exclude the BLOCKER xons' moves that occupied those exits,
    // forcing them to choose different destinations on retry.
    const stuckMatch = _rewindViolation.match(/stuck at node (\d+)/);
    if (stuckMatch) {
        const stuckNode = parseInt(stuckMatch[1], 10);
        // Find oct-cage neighbors of stuckNode (the exits that were blocked)
        const exitNodes = new Set();
        for (const nb of (baseNeighbors[stuckNode] || [])) {
            if (!_octNodeSet || _octNodeSet.has(nb.node)) exitNodes.add(nb.node);
        }
        for (const sc of _localScNeighbors(stuckNode)) {
            const other = sc.a === stuckNode ? sc.b : sc.a;
            if (!_octNodeSet || _octNodeSet.has(other)) exitNodes.add(other);
        }
        // Exclude antipodal (it's already filtered from candidates)
        const stuckAntipodal = _octAntipodal.get(stuckNode);
        if (stuckAntipodal !== undefined) exitNodes.delete(stuckAntipodal);

        // For each blocked exit, exclude the move that put a xon there
        for (const exitNode of exitNodes) {
            for (const trace of _moveTrace) {
                if (trace.to === exitNode) {
                    exclusions.push(`${trace.xonIdx}:${exitNode}`);
                }
            }
            // If no xon moved there this tick (blocker was already there),
            // exclude the blocker staying at that position
            if (!_moveTrace.some(t => t.to === exitNode)) {
                for (let i = 0; i < _demoXons.length; i++) {
                    if (_demoXons[i].alive && _demoXons[i].node === exitNode) {
                        exclusions.push(`${i}:${exitNode}`);
                    }
                }
            }
        }
        // Also exclude the stuck xon staying at its own node
        for (let i = 0; i < _demoXons.length; i++) {
            if (_demoXons[i].node === stuckNode) {
                exclusions.push(`${i}:${stuckNode}`);
            }
        }
    }

    // T55: "N oct xons > capacity C" — too many xons in oct mode.
    // Exclude excess oct xons' moves to oct-cage nodes, forcing them
    // into idle_tet or tet paths instead.
    const capMatch = _rewindViolation.match(/(\d+) oct xons > capacity (\d+)/);
    if (capMatch && _octNodeSet) {
        const octCount = parseInt(capMatch[1], 10);
        const capacity = parseInt(capMatch[2], 10);
        const excess = octCount - capacity;
        // Find all oct-mode xons, sorted by most recently moved (from moveTrace)
        const octXons = [];
        for (let i = 0; i < _demoXons.length; i++) {
            if (_demoXons[i].alive && _demoXons[i]._mode === 'oct') {
                octXons.push(i);
            }
        }
        // Pick the last `excess` oct xons to exclude from oct nodes
        // (prefer to eject the ones that moved most recently)
        const toEject = octXons.slice(-excess);
        for (const xi of toEject) {
            // Exclude this xon from going to ANY oct cage node
            for (const octNode of _octNodeSet) {
                exclusions.push(`${xi}:${octNode}`);
            }
        }
    }

    return exclusions;
}

// Check if a candidate move is excluded by the persistent bad-move ledger.
// Consulted during ALL movement decisions, not just PHASE 2.
function _btIsMoveExcluded(xonIdx, destNode) {
    if (!_btActive) return false;
    const tickLedger = _btBadMoveLedger.get(_demoTick);
    if (!tickLedger) return false;
    return tickLedger.has(`${xonIdx}:${destNode}`);
}

// Reset per-tick backtracking state (called after a clean tick).
// BFS state (_bfsFailTick, _bfsLayer, _bfsLayerRetries) is NOT reset here —
// it persists across demoTick() calls until the failure tick passes.
function _btReset() {
    _btRetryCount = 0;
    _btActive = false;
    _rewindRequested = false;
    _rewindViolation = null;
}

// Clear all BFS state (called when the failure tick finally passes or on demo restart).
function _bfsReset() {
    _bfsFailTick = -1;
    _bfsLayer = 0;
    _bfsLayerRetries = 0;
    _btBadMoveLedger.clear();
}

// ── Tunable choreography parameters (genome for GA tournament) ──
// All hardcoded magic numbers extracted here for parameterized optimization.
const _choreoParams = {
    // Movement genes (kept from v1)
    lookahead: 12,              // PHASE 0 eviction foresight depth
    congestionMax: 4,           // oct cage xon count triggering idle_tet demotion
    octDeadEndPenalty: 10,      // PHASE 2: penalize 1-move dead ends
    octCageBonus: 20,           // PHASE 2: bonus for materializing oct cage SCs
    // Face scoring genes (unified demand-driven system)
    faceOnBonus: 15,            // xon already on face's oct node
    faceNearBonus: 8,           // xon neighbor of face (1 hop)
    faceOccupiedPenalty: 30,    // another xon already looping this face
    coverageDeficitWeight: 5,   // per-visit gap bonus for undervisited faces
    vacuumRejectPenalty: 25,    // face SCs can't be materialized
    ratioDeficitWeight: 10,     // quark type ratio deficit bonus
    ratioThreshold: 0.05,       // min deficit gap to prefer secondary quark type
    antiDogpileDecay: 0.7,      // exponential decay for multi-xon same-face targeting
    assignmentThreshold: 5,     // minimum face score to attempt tet assignment
    antiPhaseWeight: 3,         // penalty for targeting overrepresented bipartite group
};
// Ranges for GA mutation (used by tournament engine in flux-tests.js)
// Float genes use [min, max, 'float'] to signal continuous mutation.
const _choreoParamRanges = {
    lookahead:              [2, 30],
    congestionMax:          [1, 8],
    octDeadEndPenalty:      [0, 50],
    octCageBonus:           [0, 100],
    faceOnBonus:            [0, 50],
    faceNearBonus:          [0, 50],
    faceOccupiedPenalty:    [0, 100],
    coverageDeficitWeight:  [0, 30],
    vacuumRejectPenalty:    [0, 100],
    ratioDeficitWeight:     [0, 50],
    ratioThreshold:         [0.0, 0.3, 'float'],
    antiDogpileDecay:       [0.1, 1.0, 'float'],
    assignmentThreshold:    [0, 30],
    antiPhaseWeight:        [0, 20],
};

// Loop topology → concrete node sequence, given tet cycle [a, b, c, d]
// a=octNode0, b=extNode, c=octNode1, d=octNode2
const LOOP_SEQUENCES = {
    pu: ([a, b, c, d]) => [a, b, a, c, a],      // Fork (p-up)
    nd: ([a, b, c, d]) => [a, b, c, b, a],      // Lollipop (n-down)
    pd: ([a, b, c, d]) => [a, b, c, d, a],      // Hamiltonian CW (p-down)
    nu: ([a, b, c, d]) => [a, d, c, b, a],      // Hamiltonian CCW (n-up)
};

const LOOP_TYPE_NAMES = { pu: 'fork', nd: 'lollipop', pd: 'ham_cw', nu: 'ham_ccw' };

// Weak force escape color — purple/magenta, distinct from all quark + oct colors.
// Used when a xon breaks confinement and enters the 'weak' mode.
const WEAK_FORCE_COLOR = 0xcc44ff;

const XON_TRAIL_LENGTH = 50;

// ── Weak Force Lifecycle Recorder ──
// Records up to 10 full lifecycles of weak force excitations for debugging.
// Each record: { xonIdx, entryTick, entryNode, exitTick, exitNode, exitReason, path }
const _weakLifecycleLog = [];
const _weakActiveTracking = new Map(); // xonIdx → { entryTick, entryNode, path }
const WEAK_LIFECYCLE_MAX = 10;
function _weakLifecycleEnter(xon, source) {
    if (_weakLifecycleLog.length >= WEAK_LIFECYCLE_MAX && _weakActiveTracking.size === 0) return;
    const idx = _demoXons.indexOf(xon);
    _weakActiveTracking.set(idx, {
        entryTick: _demoTick, entryNode: xon.node, source, path: [xon.node]
    });
    console.log(`[WEAK LIFECYCLE] ENTER #${_weakLifecycleLog.length + 1}: xon${idx} at node ${xon.node} (${source}) tick=${_demoTick}`);
}
function _weakLifecycleStep(xon) {
    const idx = _demoXons.indexOf(xon);
    const track = _weakActiveTracking.get(idx);
    if (track) track.path.push(xon.node);
}
function _weakLifecycleExit(xon, reason) {
    const idx = _demoXons.indexOf(xon);
    const track = _weakActiveTracking.get(idx);
    if (!track) return;
    const record = {
        xonIdx: idx, entryTick: track.entryTick, entryNode: track.entryNode,
        exitTick: _demoTick, exitNode: xon.node, exitReason: reason,
        source: track.source, path: track.path, duration: _demoTick - track.entryTick
    };
    _weakLifecycleLog.push(record);
    _weakActiveTracking.delete(idx);
    console.log(`[WEAK LIFECYCLE] EXIT #${_weakLifecycleLog.length}: xon${idx} at node ${xon.node} reason="${reason}" duration=${record.duration} path=[${record.path.join('→')}]`);
    if (_weakLifecycleLog.length === WEAK_LIFECYCLE_MAX) {
        console.log('[WEAK LIFECYCLE] ═══ 10 LIFECYCLES RECORDED ═══');
        console.table(_weakLifecycleLog.map(r => ({
            xon: r.xonIdx, src: r.source, entry: `${r.entryNode}@${r.entryTick}`,
            exit: `${r.exitNode}@${r.exitTick}`, reason: r.exitReason,
            ticks: r.duration, hops: r.path.length - 1
        })));
    }
}

// ── Trail helper: freeze 3D positions at record time so trails don't deform with solver ──
function _trailPush(xon, node, color) {
    xon.trail.push(node);
    xon.trailColHistory.push(color);
    const p = pos[node];
    xon._trailFrozenPos.push(p ? [p[0], p[1], p[2]] : [0, 0, 0]);
    if (xon.trail.length > XON_TRAIL_LENGTH) {
        xon.trail.shift();
        xon.trailColHistory.shift();
        xon._trailFrozenPos.shift();
    }
}
// Initialize frozen pos array from current trail (for init/reset)
function _trailInitFrozen(xon) {
    xon._trailFrozenPos = xon.trail.map(n => {
        const p = pos[n];
        return p ? [p[0], p[1], p[2]] : [0, 0, 0];
    });
}

// Spawn a xon at a node with spark, trail, and tween — mirrors excitation visuals.
// Color by quark function: pu=yellow, pd=green, nu=blue, nd=red.
function _spawnXon(face, quarkType, sign) {
    const fd = _nucleusTetFaceData[face];
    if (!fd) return null;
    const seq = LOOP_SEQUENCES[quarkType](fd.cycle);
    const col = QUARK_COLORS[quarkType];

    // Spark sprite — uses shared _sparkTex for sparkle effect
    const sparkMat = new THREE.SpriteMaterial({
        color: col, map: _sparkTex, transparent: true, opacity: 1.0,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    const spark = new THREE.Sprite(sparkMat);
    spark.scale.set(0.28, 0.28, 1);
    spark.renderOrder = 22;
    const group = new THREE.Group();
    group.add(spark);
    if (pos[seq[0]]) group.position.set(pos[seq[0]][0], pos[seq[0]][1], pos[seq[0]][2]);
    scene.add(group);

    // Trail line — fading vertex-colored path
    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array((XON_TRAIL_LENGTH + 1) * 3);
    const trailCol = new Float32Array((XON_TRAIL_LENGTH + 1) * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
    const trailMat = new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 1.0,
        depthTest: false, blending: THREE.AdditiveBlending,
    });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    trailLine.renderOrder = 20;
    scene.add(trailLine);

    const xon = {
        node: seq[0], prevNode: seq[0], sign,
        _loopType: LOOP_TYPE_NAMES[quarkType],
        _loopSeq: seq, _loopStep: 0,
        _assignedFace: face, _quarkType: quarkType,
        _mode: 'tet',           // 'tet' or 'oct'
        _lastDir: null,         // last direction index (0-3) for momentum
        _dirHistory: [],        // direction vector history for T16 test
        col, group, spark, sparkMat,
        trailLine, trailGeo, trailPos, trailCol,
        trail: [seq[0]], trailColHistory: [col], _trailFrozenPos: [], tweenT: 1, flashT: 1.0,
        _highlightT: 0,
        alive: true,
    };
    _trailInitFrozen(xon);
    _demoXons.push(xon);
    return xon;
}

// Create a lightweight gluon sprite (white spark on oct edges)
function _createGluonSprite() {
    const col = 0xffffff; // white for gluon
    const sparkMat = new THREE.SpriteMaterial({
        color: col, map: _sparkTex, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    const sprite = new THREE.Sprite(sparkMat);
    sprite.scale.set(0.18, 0.18, 1);
    sprite.renderOrder = 21;
    scene.add(sprite);
    return sprite;
}

// Mark a xon as dying — spark vanishes, trail decays naturally.
// The tail "chases" into the annihilation point, shrinking each tick.
// Full cleanup happens in _tickDemoXons when trail is empty.
function _destroyXon(xon) {
    xon.alive = false;
    // Hide spark immediately (annihilated), but keep trail for decay
    if (xon.group) { scene.remove(xon.group); xon.group = null; }
    if (xon.sparkMat) { xon.sparkMat.dispose(); xon.sparkMat = null; }
    xon.spark = null;
    // Snapshot trail positions + colors — dying tracers keep historical state,
    // they do NOT follow the live solver. This creates a cool ghosting effect.
    xon._frozenPos = xon.trail.map(nodeIdx => {
        const p = pos[nodeIdx];
        return p ? [p[0], p[1], p[2]] : [0, 0, 0];
    });
    xon._frozenColors = xon.trailColHistory ? [...xon.trailColHistory] : null;
    xon._dying = true; // signal to _tickDemoXons: decay trail
}

// Final cleanup after trail has fully decayed
function _finalCleanupXon(xon) {
    if (xon.trailLine) { scene.remove(xon.trailLine); }
    if (xon.trailGeo) xon.trailGeo.dispose();
    xon.trailLine = null; xon.trailGeo = null;
    xon._dying = false;
}

// Decay dying xon trails — called ONCE per demoTick (simulation tick).
// Every dying tracer experiences every simulation tick (no frame-rate dependency).
// Removes one frozen trail point per tick (constant decay).
function _decayDyingXons() {
    for (const xon of _demoXons) {
        if (!xon._dying || !xon._frozenPos) continue;
        // Remove one trail point per tick
        if (xon._frozenPos.length > 0) {
            xon._frozenPos.shift();
            if (xon._frozenColors) xon._frozenColors.shift();
        }
        // Cleanup in simulation domain — don't wait for render frame.
        // Without this, a fully-decayed xon can sit in _dying=true for
        // extra ticks if render frames lag behind simulation ticks (T14).
        if (xon._frozenPos.length === 0) {
            if (xon.group) {
                xon._dying = false;
                xon._dyingStartTick = null;
                if (xon.trailLine) xon.trailLine.visible = false;
            }
        }
    }
}

// Check if the next hop in a xon's loop crosses an SC-only edge that is still activated.
// Returns true if traversal is safe (base edge or SC is active), false if SC was deactivated.
function _canAdvanceSafely(xon) {
    if (!xon.alive || !xon._loopSeq) return false;
    const effectiveStep = xon._loopStep >= 4 ? 0 : xon._loopStep;
    const fromNode = xon._loopSeq[effectiveStep];
    const toNode = xon._loopSeq[effectiveStep + 1];
    if (toNode === undefined) return false;
    const hasBase = (baseNeighbors[fromNode] || []).some(nb => nb.node === toNode);
    if (hasBase) return true; // base edge, no SC needed
    const pid = pairId(fromNode, toNode);
    const scId = scPairToId.get(pid);
    if (scId === undefined) return true; // no SC on this edge
    return activeSet.has(scId) || impliedSet.has(scId) || xonImpliedSet.has(scId);
}

// Advance a xon one hop: update position state, push trail, start tween.
// SC negotiation with the vacuum happens BEFORE this call in demoTick.
function _advanceXon(xon) {
    if (!xon.alive) return false;
    if (xon._loopStep >= 4) {
        xon._loopStep = 0; // wrap for continuous cycling
        xon._tetActualized = false; // reset actualization flag for new loop
    }
    const fromNode = xon._loopSeq[xon._loopStep];
    const toNode = xon._loopSeq[xon._loopStep + 1];
    if (_swapBlocked(fromNode, toNode)) return false; // T41: no swap
    xon.prevNode = fromNode;
    xon.node = toNode;
    xon._loopStep++;

    // Check if tet face is actualized this step (all face SCs active)
    if (xon._assignedFace != null && _nucleusTetFaceData) {
        const fd = _nucleusTetFaceData[xon._assignedFace];
        if (fd && fd.scIds.every(scId =>
            activeSet.has(scId) || impliedSet.has(scId) || xonImpliedSet.has(scId))) {
            xon._tetActualized = true;
        }
    }

    // Count when loop completes AND tet was actualized at some point during the loop
    if (xon._loopStep === 4 && xon._tetActualized &&
        xon._assignedFace != null && xon._quarkType) {
        if (_demoVisits && _demoVisits[xon._assignedFace]) {
            _demoVisits[xon._assignedFace][xon._quarkType]++;
            _demoVisits[xon._assignedFace].total++;
        }
    }

    // Push trail history + per-segment color, start tween
    _trailPush(xon, toNode, xon.col);
    xon.tweenT = 0;
    if (_flashEnabled) xon.flashT = 1.0;
    return true;
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  PERSISTENT 6-XON MODEL — Demo 3.1                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

// (_completeOctDiscovery removed — oct is now formed deterministically in simulateNucleus)

// Spawn exactly 6 persistent xons on oct nodes. Called once from startDemoLoop.
// 3 sign=+1, 3 sign=-1. All start in oct mode (white, cruising cage).
function _initPersistentXons() {
    _demoXons = [];
    if (_octSeedCenter < 0) {
        console.error('[demo] Cannot init persistent xons: no center node');
        return;
    }
    // All 6 xons start at center (opening choreography spreads them out in 2 ticks)
    const startNode = _octSeedCenter;
    for (let i = 0; i < 6; i++) {
        const sign = i < 3 ? +1 : -1;

        // Create spark + trail visuals (white for oct mode)
        const col = 0xffffff;
        const sparkMat = new THREE.SpriteMaterial({
            color: col, map: _sparkTex, transparent: true, opacity: 1.0,
            blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
        });
        const spark = new THREE.Sprite(sparkMat);
        spark.scale.set(0.28, 0.28, 1);
        spark.renderOrder = 22;
        const group = new THREE.Group();
        group.add(spark);
        if (pos[startNode]) group.position.set(pos[startNode][0], pos[startNode][1], pos[startNode][2]);
        scene.add(group);

        const trailGeo = new THREE.BufferGeometry();
        const trailPos = new Float32Array((XON_TRAIL_LENGTH + 1) * 3);
        const trailCol = new Float32Array((XON_TRAIL_LENGTH + 1) * 3);
        trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
        trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
        const trailMat = new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 1.0,
            depthTest: false, blending: THREE.AdditiveBlending,
        });
        const trailLine = new THREE.Line(trailGeo, trailMat);
        trailLine.renderOrder = 20;
        scene.add(trailLine);

        const initDir = 0; // direction doesn't matter at center (opening choreography assigns)

        const xon = {
            prevNode: startNode, sign,
            _loopType: null,
            _loopSeq: null, _loopStep: 0,
            _assignedFace: null, _quarkType: null,
            _mode: 'oct_formation',
            _lastDir: initDir,
            _dirHistory: [],
            col, group, spark, sparkMat,
            trailLine, trailGeo, trailPos, trailCol,
            trail: [startNode], trailColHistory: [col], _trailFrozenPos: [], tweenT: 1, flashT: 1.0,
            _highlightT: 0,
            alive: true,
        };
        _trailInitFrozen(xon);
        // Interceptor: enforce single-hop-per-tick + validate each individual movement
        let _nodeVal = startNode;
        xon._movedThisTick = false;
        Object.defineProperty(xon, 'node', {
            get() { return _nodeVal; },
            set(v) {
                const from = _nodeVal;
                if (from === v) { _nodeVal = v; return; } // no-op assignment
                // Validate: nodes must be adjacent (base edge or SC edge)
                if (typeof scPairToId !== 'undefined' && scPairToId && scPairToId.size > 0) {
                    const hasBase = (baseNeighbors[from] || []).some(nb => nb.node === v);
                    if (!hasBase) {
                        // Check if there's an SC between them
                        const scs = _localScNeighbors(from);
                        const hasSC = scs.some(sc => (sc.a === from ? sc.b : sc.a) === v);
                        if (!hasSC) {
                            console.warn(`[MOVEMENT BLOCKED] tick=${_demoTick} xon: ${from}→${v} NO EDGE (not adjacent)`);
                            return; // BLOCK: not adjacent at all
                        }
                        // SC exists — verify it's active
                        const pid = pairId(from, v);
                        const scId = scPairToId.get(pid);
                        if (scId !== undefined && !activeSet.has(scId) && !impliedSet.has(scId) && !xonImpliedSet.has(scId)) {
                            console.warn(`[MOVEMENT BLOCKED] tick=${_demoTick} xon: ${from}→${v} SC ${scId} INACTIVE`);
                            return; // BLOCK: SC not active
                        }
                    }
                    // Enforce single-hop-per-tick
                    if (xon._movedThisTick) {
                        console.warn(`[MOVEMENT BLOCKED] tick=${_demoTick} xon: ${from}→${v} ALREADY MOVED (no FTL)`);
                        return; // BLOCK: already hopped this tick
                    }
                    xon._movedThisTick = true;
                }
                _nodeVal = v;
            },
            enumerable: true, configurable: true
        });
        _demoXons.push(xon);
    }
    console.log(`[demo] Initialized 6 persistent xons at center node ${startNode}`);
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  GLUON STORAGE — Xon Pair Annihilation / Creation                    ║
// ║                                                                      ║
// ║  Conservation: alive_count + 2 * stored_pairs = 6 (always)           ║
// ║  Annihilation: 2 xons at same node → pair stored, both removed       ║
// ║  Creation: stored pair → 2 new xons on free adjacent oct nodes       ║
// ╚══════════════════════════════════════════════════════════════════════╝
let _gluonStoredPairs = 0;

// Annihilate two xons into a stored gluon pair.
// Both xons are deactivated and visually removed.
function _annihilateXonPair(xonA, xonB) {
    // Record weak lifecycle exit if either was in weak mode
    if (xonA._mode === 'weak') _weakLifecycleExit(xonA, 'ANNIHILATED');
    if (xonB._mode === 'weak') _weakLifecycleExit(xonB, 'ANNIHILATED');
    // T42: clean up face SCs before death (must run while alive)
    _relinquishFaceSCs(xonA);
    _relinquishFaceSCs(xonB);
    // Graceful trail fade (T40): hide spark, freeze trail for decay.
    // Keep group/sparkMat intact so _manifestXonPair can reactivate later.
    for (const xon of [xonA, xonB]) {
        xon.alive = false;
        if (xon.group) xon.group.visible = false; // spark vanishes
        // Freeze trail positions for dying decay
        xon._frozenPos = xon.trail.map(nodeIdx => {
            const p = pos[nodeIdx];
            return p ? [p[0], p[1], p[2]] : [0, 0, 0];
        });
        xon._frozenColors = xon.trailColHistory ? [...xon.trailColHistory] : null;
        xon._dying = true;
    }
    _gluonStoredPairs++;
    console.log(`[gluon] Annihilation at node ${xonA.node}: stored=${_gluonStoredPairs}, alive=${_demoXons.filter(x=>x.alive).length} modes=[${xonA._mode},${xonB._mode}]`);
}

// Manifest a xon pair from gluon storage onto free oct nodes.
// Returns true if a pair was created, false if no room or no stored pairs.
function _manifestXonPair() {
    if (_gluonStoredPairs <= 0) return false;
    const aliveCount = _demoXons.filter(x => x.alive).length;
    if (aliveCount >= 6) return false;

    // Find dead xons to reactivate (recycle slots) — skip dying (trail still fading)
    const dead = _demoXons.filter(x => !x.alive && !x._dying);
    if (dead.length < 2) return false;

    // Find two free adjacent oct nodes
    if (!_octNodeSet) return false;
    const occupied = _occupiedNodes();
    let nodeA = null, nodeB = null;
    for (const n of _octNodeSet) {
        if (occupied.get(n) || 0) continue;
        // Check for a free adjacent oct node
        const nbs = baseNeighbors[n] || [];
        for (const nb of nbs) {
            if (!_octNodeSet.has(nb.node)) continue;
            if (occupied.get(nb.node) || 0) continue;
            if (n === nb.node) continue;
            nodeA = n;
            nodeB = nb.node;
            break;
        }
        if (nodeA !== null) break;
    }
    if (nodeA === null) return false; // no room

    // Reactivate two dead xons at nodeA and nodeB
    const xonA = dead[0];
    const xonB = dead[1];
    // Clear any residual dying state from trail fade
    xonA._dying = false; xonA._frozenPos = null; xonA._frozenColors = null; xonA._dyingStartTick = null;
    xonB._dying = false; xonB._frozenPos = null; xonB._frozenColors = null; xonB._dyingStartTick = null;
    xonA.alive = true;
    xonA.node = nodeA; // bypass interceptor for respawn
    xonA.prevNode = nodeA;
    xonA._mode = 'oct';
    xonA._assignedFace = null;
    xonA._quarkType = null;
    xonA._loopType = null;
    xonA._loopSeq = null;
    xonA._loopStep = 0;
    xonA.col = 0xffffff;
    xonA._movedThisTick = false;
    xonA.trail = [nodeA];
    xonA.trailColHistory = [0xffffff];
    _trailInitFrozen(xonA);
    xonA.tweenT = 1;
    if (_flashEnabled) xonA.flashT = 1.0;
    if (xonA.sparkMat) xonA.sparkMat.color.setHex(0xffffff);
    if (xonA.group) xonA.group.visible = true;
    if (xonA.trailLine) xonA.trailLine.visible = true;

    xonB.alive = true;
    xonB.node = nodeB;
    xonB.prevNode = nodeB;
    xonB._mode = 'oct';
    xonB._assignedFace = null;
    xonB._quarkType = null;
    xonB._loopType = null;
    xonB._loopSeq = null;
    xonB._loopStep = 0;
    xonB.col = 0xffffff;
    xonB._movedThisTick = false;
    xonB.trail = [nodeB];
    xonB.trailColHistory = [0xffffff];
    _trailInitFrozen(xonB);
    xonB.tweenT = 1;
    if (_flashEnabled) xonB.flashT = 1.0;
    if (xonB.sparkMat) xonB.sparkMat.color.setHex(0xffffff);
    if (xonB.group) xonB.group.visible = true;
    if (xonB.trailLine) xonB.trailLine.visible = true;

    // Genesis tracking — T31 verifies: spawns on oct nodes, in pairs, in oct mode
    xonA._genesisNode = nodeA;
    xonA._genesisTick = _demoTick;
    xonB._genesisNode = nodeB;
    xonB._genesisTick = _demoTick;

    _gluonStoredPairs--;
    console.log(`[gluon] Manifested pair at nodes ${nodeA},${nodeB}: stored=${_gluonStoredPairs}, alive=${_demoXons.filter(x=>x.alive).length}`);
    return true;
}

// Build a count map of currently occupied nodes (for Pauli exclusion)
// Uses counts because multiple xons can share a node temporarily (after tet return)
function _occupiedNodes() {
    const occ = new Map(); // node → count
    for (const xon of _demoXons) {
        if (xon.alive) occ.set(xon.node, (occ.get(xon.node) || 0) + 1);
    }
    return occ;
}
function _occAdd(occ, node) { occ.set(node, (occ.get(node) || 0) + 1); }
function _occDel(occ, node) {
    const c = (occ.get(node) || 0) - 1;
    if (c <= 0) occ.delete(node);
    else occ.set(node, c);
}

// Maximum bipartite matching for oct xon move assignment (Kuhn's algorithm).
// Finds an augmenting path of arbitrary depth so that the maximum number of
// xons get a valid destination. This prevents deadlocks that greedy assignment misses.
//   plans: array of { xon, candidates: [{node, ...}], assigned: null }
//   blocked: Set of nodes reserved by higher-priority moves (tet)
function _maxBipartiteAssignment(plans, blocked) {
    const n = plans.length;
    const assignment = new Array(n).fill(null); // plan index → candidate
    const claimed = new Map(); // dest node → plan index

    // Augmenting path search: try to assign plans[idx] to a free candidate.
    // If candidate is already taken by plans[other], recursively try to
    // reassign plans[other] to a different candidate (arbitrary depth).
    function augment(idx, visited) {
        for (const c of plans[idx].candidates) {
            if (blocked.has(c.node)) continue;
            if (visited.has(c.node)) continue;
            visited.add(c.node);

            const existing = claimed.get(c.node);
            if (existing === undefined || augment(existing, visited)) {
                assignment[idx] = c;
                claimed.set(c.node, idx);
                return true;
            }
        }
        return false;
    }

    // Most constrained first: try xons with fewest candidates first
    const order = plans.map((_, i) => i);
    order.sort((a, b) => plans[a].candidates.length - plans[b].candidates.length);

    for (const i of order) {
        augment(i, new Set());
    }

    // Apply results
    for (let i = 0; i < n; i++) {
        plans[i].assigned = assignment[i];
    }
}

// ── 6-Step Awareness System (bookended fermionic loop) ──
// Every xon must know its next 6 valid steps before committing a move.
// This covers: entry step + 4-hop tet loop + exit step.
// The lookahead uses PROJECTED occupation (where neighbors will be after
// their 1st moves) to account for cooperative multi-agent dynamics.
//
// Two lookahead modes:
// 1. Generic graph traversal (_lookahead) — for oct xons with flexible movement
// 2. Loop-shape-aware (_lookaheadTetPath) — for tet/idle_tet xons following
//    their specific fermionic loop (fork, lollipop, ham CW/CCW).
//    This simulates the xon stepping through its ACTUAL sequence, tracking
//    self-occupation to handle revisited nodes (fork: a→b→a→c→a).
//
// Lookahead depth reads from _choreoParams.lookahead (GA-tunable)

// Generic graph lookahead for oct xons (flexible movement).
// Validates against: T19 (Pauli), T26 (SC activation), T27 (connectivity),
// T29 (white trails only on oct nodes).
function _lookahead(node, occupied, depth, _visited, _selfXon) {
    if (depth <= 0) return true;
    if (!_visited) _visited = new Set();
    _visited.add(node);

    // Base-edge neighbors
    const nbs = baseNeighbors[node] || [];
    for (const nb of nbs) {
        if (_visited.has(nb.node)) continue;
        // Prefer oct nodes for normal movement
        if (_octNodeSet && !_octNodeSet.has(nb.node)) continue;
        if (occupied.get(nb.node) || 0) {
            // Occupied node = ANNIHILATION OPPORTUNITY (valid terminal move).
            return true;
        }
        if (_lookahead(nb.node, occupied, depth - 1, new Set(_visited), _selfXon)) return true;
    }
    // Active SC neighbors — T26: only traverse activated SCs
    const scs = _localScNeighbors(node);
    for (const sc of scs) {
        const other = sc.a === node ? sc.b : sc.a;
        if (_visited.has(other)) continue;
        // Prefer oct nodes for normal movement
        if (_octNodeSet && !_octNodeSet.has(other)) continue;
        if (_annihilationEnabled && (occupied.get(other) || 0)) return true; // annihilation opportunity
        // T26: SC must be activated
        if (!(activeSet.has(sc.id) || impliedSet.has(sc.id) || xonImpliedSet.has(sc.id))) continue;
        if (_lookahead(other, occupied, depth - 1, new Set(_visited), _selfXon)) return true;
    }
    // WEAK FORCE FALLBACK: if all oct-restricted paths fail, a free base neighbor
    // CLOSE TO the oct cage is a valid escape via the weak force.
    // Only consider neighbors within 2 hops of an oct node (prevents flashlight).
    for (const nb of nbs) {
        if (_visited.has(nb.node)) continue;
        if (!(occupied.get(nb.node) || 0)) {
            // Structural guard check: reject if move would violate ANY active test
            if (_selfXon && _moveViolatesGuards(_selfXon, node, nb.node)) continue;
            // Hard filter: only nucleus nodes allowed
            _ensureNucleusNodeSet();
            if (_nucleusNodeSet && !_nucleusNodeSet.has(nb.node)) continue;
            return true;
        }
    }
    return false;
}

// Loop-shape-aware COOPERATIVE lookahead for tet/idle_tet xons.
// Simulates ALL tet/idle_tet xons advancing simultaneously through their loops.
// At each timestep, checks if our xon's destination collides with any other
// tet xon's projected position (Pauli exclusion lookahead).
// Oct xons are ignored — the planner will move them.
//
// `selfXon` is the xon being checked (excluded from "others" simulation).
// If null, falls back to static occupation check.
function _lookaheadTetPath(loopSeq, fromStep, occupied, depth, selfXon) {
    // Build list of other tet/idle_tet xons with their loop state
    const others = [];
    if (selfXon) {
        for (const x of _demoXons) {
            if (!x.alive || x === selfXon) continue;
            if ((x._mode === 'tet' || x._mode === 'idle_tet') && x._loopSeq) {
                others.push({
                    step: x._loopStep >= 4 ? 0 : x._loopStep,
                    seq: x._loopSeq,
                    node: x.node,
                    face: x._assignedFace,
                    col: x.col,
                });
            }
        }
    }

    let myStep = fromStep >= 4 ? 0 : fromStep;
    let myNode = loopSeq[myStep];
    const myColor = selfXon ? selfXon.col : 0;
    const myFace = selfXon ? selfXon._assignedFace : null;

    for (let i = 0; i < depth; i++) {
        // Advance our xon
        myStep++;
        if (myStep > 4) myStep = 1;
        const myNextNode = loopSeq[myStep];
        if (myStep >= 4) myStep = 0;

        // ── T26: SC activation check ──
        // Every edge in the loop must have either a base edge or an active SC.
        const pid = pairId(myNode, myNextNode);
        const scId = scPairToId.get(pid);
        if (scId !== undefined) {
            const hasBaseEdge = (baseNeighbors[myNode] || []).some(nb => nb.node === myNextNode);
            if (!hasBaseEdge) {
                // SC-only edge: must be activated
                if (!xonImpliedSet.has(scId) && !activeSet.has(scId) && !impliedSet.has(scId)) {
                    return false; // T26 violation — path uses unactivated SC
                }
            }
        }

        // ── T27: Connectivity check ──
        // Verify nodes are actually connected (base edge or SC)
        const hasBase = (baseNeighbors[myNode] || []).some(nb => nb.node === myNextNode);
        if (!hasBase && scId === undefined) {
            return false; // T27 violation — no edge exists between these nodes
        }

        // Advance all other tet xons simultaneously
        for (const o of others) {
            o.step++;
            if (o.step > 4) o.step = 1;
            o.node = o.seq[o.step];
            if (o.step >= 4) o.step = 0;
        }

        // ── T19: Pauli check — collision with another tet xon ──
        const tetCollision = others.some(o => o.node === myNextNode);
        if (tetCollision) {
            // Collision = ANNIHILATION OPPORTUNITY.
            // Same-node collisions are resolved via gluon storage (pair annihilation).
            // Annihilation is a legitimate tool — it always happens in pairs and
            // genesis restores xons on oct edges. This is a valid terminal state.
            return true;
        }

        myNode = myNextNode;
    }
    return true; // path clears all guard checks for projected timesteps
}

// Unified lookahead dispatcher: uses loop-shape-aware check for tet/idle_tet,
// generic graph traversal for oct.
function _lookaheadForXon(xon, node, occupied, depth) {
    if ((xon._mode === 'tet' || xon._mode === 'idle_tet') && xon._loopSeq) {
        // Find which step in the loop corresponds to `node`
        let currentStep = -1;
        for (let i = 0; i <= 4; i++) {
            if (xon._loopSeq[i] === node) { currentStep = i; break; }
        }
        if (currentStep === -1) return _lookahead(node, occupied, depth); // fallback
        if (currentStep >= 4) currentStep = 0;
        return _lookaheadTetPath(xon._loopSeq, currentStep, occupied, depth, xon);
    }
    return _lookahead(node, occupied, depth);
}

// Compute the projected occupation map after all planned moves execute.
// Returns a Map<node, count> of where xons will be.
function _projectOccupation(tetPlans, octPlans) {
    const result = new Map();
    for (const xon of _demoXons) {
        if (!xon.alive) continue;
        let futureNode = xon.node;
        // Check tet plans
        const tp = tetPlans.find(p => p.xon === xon && p.approved);
        if (tp) { futureNode = tp.toNode; }
        // Check oct plans (assigned or idleTet)
        const op = octPlans ? octPlans.find(p => p.xon === xon) : null;
        if (op) {
            if (op.assigned) futureNode = op.assigned.node;
            else if (op.idleTet && xon._loopSeq) {
                const nextStep = xon._loopStep >= 4 ? 1 : xon._loopStep + 1;
                futureNode = xon._loopSeq[nextStep] || xon.node;
            }
        }
        _occAdd(result, futureNode);
    }
    return result;
}

// ── Cooperative 2-Step Awareness ──
// After all planning, verify every xon has a valid 2nd move by projecting
// where ALL xons will be after their 1st moves (neighbors' choices).
// For tet/idle_tet xons: 2nd move is deterministic (next loop step) — check THAT node.
// For oct xons: 2nd move is flexible — check that ANY neighbor is reachable.
// Returns array of stuck xon info. Iteratively fixes conflicts.

function _getXonFutureNode(xon, tetPlans, octPlans) {
    let futureNode = xon.node;
    const tp = tetPlans.find(p => p.xon === xon && p.approved);
    if (tp) return tp.toNode;
    const op = octPlans ? octPlans.find(p => p.xon === xon) : null;
    if (op && op.assigned) return op.assigned.node;
    if (op && op.idleTet && xon._loopSeq) {
        const nextStep = xon._loopStep >= 4 ? 1 : xon._loopStep + 1;
        return xon._loopSeq[nextStep] || xon.node;
    }
    return futureNode;
}

function _xonHas2ndMove(xon, futureNode, projected, tetPlans, octPlans) {
    // Remove self from projected so we don't block ourselves
    _occDel(projected, futureNode);

    let has2nd = false;
    const futureMode = xon._mode; // mode after 1st move

    if (futureMode === 'tet' || futureMode === 'idle_tet') {
        // Loop-shape-aware: check the full remaining loop path, not just 1 step.
        // Uses the xon's actual loop sequence (fork, lollipop, ham CW/CCW).
        if (xon._loopSeq) {
            const tp = tetPlans.find(p => p.xon === xon && p.approved);
            let stepAfter1st;
            if (tp) {
                const effective = xon._loopStep >= 4 ? 0 : xon._loopStep;
                stepAfter1st = effective + 1;
            } else {
                stepAfter1st = (xon._loopStep >= 4 ? 0 : xon._loopStep) + 1;
            }
            if (stepAfter1st >= 4) stepAfter1st = 0;
            // Check remaining loop path for _choreoParams.lookahead - 1 steps (we already used 1)
            has2nd = _lookaheadTetPath(xon._loopSeq, stepAfter1st, projected, _choreoParams.lookahead - 1, xon);
        }
    } else {
        // Oct mode: any reachable neighbor is a valid 2nd move
        has2nd = _lookahead(futureNode, projected, 1);
    }

    _occAdd(projected, futureNode);
    return has2nd;
}

// ── Single-Move Guard Check ──
// Validates a proposed move for one xon against ALL projected guards.
// STRUCTURAL GUARANTEE: any guard with projected() in LIVE_GUARD_REGISTRY
// is automatically checked here. Add projected() to your test = covered everywhere.
// Used by: _lookahead weak-force fallback, PHASE 0.5 weak BFS, PHASE 3/5 escape hatches.
function _moveViolatesGuards(xon, fromNode, toNode) {
    // Check persistent bad-move ledger (during backtrack retries)
    if (_btActive) {
        const xonIdx = _demoXons.indexOf(xon);
        if (_btIsMoveExcluded(xonIdx, toNode)) return true;
    }
    if (typeof PROJECTED_GUARD_CHECKS === 'undefined' || !PROJECTED_GUARD_CHECKS.length) return false;
    // Build futures: this xon at toNode, all others at current positions
    const futures = [];
    for (const x of _demoXons) {
        if (!x.alive) continue;
        if (x === xon) {
            futures.push({ xon: x, futureNode: toNode, fromNode, futureMode: x._mode, futureColor: x.col });
        } else {
            futures.push({ xon: x, futureNode: x.node, fromNode: x.node, futureMode: x._mode, futureColor: x.col });
        }
    }
    return _validateProjectedGuards(futures).length > 0;
}

// ── Projected Guard Validator ──
// Iterates the PROJECTED_GUARD_CHECKS array (defined in flux-tests.js).
// Each check function receives the projected xon states and returns violations.
// Adding a new test to that array = automatically covered by lookahead.
//
// `xonFutures` is an array of { xon, futureNode, futureMode, futureColor, fromNode }
function _validateProjectedGuards(xonFutures) {
    if (typeof PROJECTED_GUARD_CHECKS === 'undefined' || !PROJECTED_GUARD_CHECKS.length) {
        return []; // guard checks not loaded yet (flux-tests.js loads after flux-demo.js)
    }
    const violations = [];
    for (const check of PROJECTED_GUARD_CHECKS) {
        const result = check(xonFutures);
        if (result) {
            const items = Array.isArray(result) ? result : [result];
            for (const v of items) if (v) violations.push(v);
        }
    }
    return violations;
}

function _verifyPlan(tetPlans, octPlans) {
    // Build projected future state for all xons
    const xonFutures = [];
    for (const xon of _demoXons) {
        if (!xon.alive) continue;
        const futureNode = _getXonFutureNode(xon, tetPlans, octPlans);
        const tp = tetPlans.find(p => p.xon === xon && p.approved);
        const op = octPlans ? octPlans.find(p => p.xon === xon) : null;
        xonFutures.push({
            xon,
            futureNode,
            fromNode: xon.node,
            futureMode: xon._mode,
            futureColor: xon.col,
        });
    }

    // Run full guard suite on projected state
    const guardViolations = _validateProjectedGuards(xonFutures);

    // Also check 2-step awareness (original _verifyPlan logic)
    const projected = _projectOccupation(tetPlans, octPlans);
    const stuck = [];
    for (const xon of _demoXons) {
        if (!xon.alive) continue;
        const futureNode = _getXonFutureNode(xon, tetPlans, octPlans);
        // Xon is stuck if it has NO valid 2nd move OR if it violates any guard
        const hasViolation = guardViolations.some(v => v.xon === xon);
        const has2nd = _xonHas2ndMove(xon, futureNode, projected, tetPlans, octPlans);
        if (!has2nd || hasViolation) {
            const tp = tetPlans.find(p => p.xon === xon && p.approved);
            const op = octPlans ? octPlans.find(p => p.xon === xon) : null;
            stuck.push({ xon, futureNode, tetPlan: tp, octPlan: op });
        }
    }
    return stuck;
}

// ═══════════════════════════════════════════════════════════════════════
// Demand-driven face scoring — nucleus-as-one-system approach
// Scores a (xon, face) pair. Returns {face, quarkType, score} or null.
// Pure function, no side effects. Used as edge weight in global bipartite matching.
// ═══════════════════════════════════════════════════════════════════════
function _scoreFaceOpportunity(xon, face, occupied) {
    if (!_nucleusTetFaceData || !_nucleusTetFaceData[face]) return null;
    const fd = _nucleusTetFaceData[face];

    let score = 0;

    // 1. REACHABILITY: Is xon on a face oct node or 1 hop away?
    const faceOctNodes = [];
    for (const n of fd.cycle) {
        if (_octNodeSet && _octNodeSet.has(n)) faceOctNodes.push(n);
    }
    const onFace = faceOctNodes.includes(xon.node);
    let nearFace = false;
    if (!onFace) {
        for (const nb of (baseNeighbors[xon.node] || [])) {
            if (faceOctNodes.includes(nb.node)) { nearFace = true; break; }
        }
    }
    if (!onFace && !nearFace) return null; // unreachable this tick

    score += onFace ? _choreoParams.faceOnBonus : _choreoParams.faceNearBonus;

    // 2. VACANCY: Is another xon already executing a loop on this face?
    for (const x of _demoXons) {
        if (!x.alive || x === xon) continue;
        if ((x._mode === 'tet' || x._mode === 'idle_tet') && x._assignedFace === face) {
            score -= _choreoParams.faceOccupiedPenalty;
            break;
        }
    }

    // 3. COVERAGE DEFICIT: Has this face been undervisited?
    if (_demoVisits) {
        const faceVisits = _demoVisits[face] ? _demoVisits[face].total : 0;
        let totalVisits = 0;
        for (let f = 1; f <= 8; f++) totalVisits += _demoVisits[f] ? _demoVisits[f].total : 0;
        const meanVisits = totalVisits / 8;
        const coverageDeficit = Math.max(0, meanVisits - faceVisits);
        score += coverageDeficit * _choreoParams.coverageDeficitWeight;
    }

    // 4. BIPARTITE GROUP → hadron type
    const isProtonFace = A_SET.has(face);
    const primaryType = isProtonFace ? 'pu' : 'nd';
    const secondaryType = isProtonFace ? 'pd' : 'nu';

    // 5. RATIO DEFICIT → pick quark type
    const primaryDeficit = _ratioTracker.deficit(primaryType);
    const secondaryDeficit = _ratioTracker.deficit(secondaryType);
    let quarkType;
    if (secondaryDeficit > primaryDeficit + _choreoParams.ratioThreshold) {
        quarkType = secondaryType;
        score += secondaryDeficit * _choreoParams.ratioDeficitWeight;
    } else {
        quarkType = primaryType;
        score += Math.max(0, primaryDeficit) * _choreoParams.ratioDeficitWeight;
    }

    // 6. ANTI-PHASE: prefer faces from underrepresented bipartite group
    let activeA = 0, activeB = 0;
    for (const x of _demoXons) {
        if (!x.alive || x === xon) continue;
        if ((x._mode === 'tet' || x._mode === 'idle_tet') && x._assignedFace != null) {
            if (A_SET.has(x._assignedFace)) activeA++; else activeB++;
        }
    }
    const groupImbalance = isProtonFace ? (activeA - activeB) : (activeB - activeA);
    score -= groupImbalance * _choreoParams.antiPhaseWeight;

    return { face, quarkType, score, onFace };
}

// Get scored oct-mode candidates for a xon. Returns array sorted by momentum score (desc).
// `blocked` is an optional Set of additional nodes to treat as occupied (for coordinated planning).
function _getOctCandidates(xon, occupied, blocked) {
    if (!xon.alive) return [];
    if (xon._mode !== 'oct' && xon._mode !== 'weak') return [];

    // Weak xons move ONLY to nucleus nodes (oct cage + tet face vertices)
    if (xon._mode === 'weak') {
        const candidates = [];
        for (const nb of _localBaseNeighbors(xon.node)) {
            if ((occupied.get(nb.node) || 0) > 0) continue;
            if (blocked && blocked.has(nb.node)) continue;
            if (nb.node === xon.prevNode && xon.prevNode !== xon.node) continue;
            candidates.push({ node: nb.node, dirIdx: nb.dirIdx, score: 1, _scId: undefined, _needsMaterialise: false });
        }
        return candidates;
    }

    // Constrain oct movement to cage nodes only.
    if (!_octNodeSet) return [];

    // Constrain oct movement to cage nodes only.
    // Off-cage xons get no candidates here; the fallback _startIdleTetLoop handles them.
    const onCage = _octNodeSet.has(xon.node);
    if (!onCage) return [];

    // Get neighbors: base edges + SC edges (filtered to oct cage, excluding antipodal)
    const antipodal = _octAntipodal.get(xon.node);
    const allOctNeighbors = [];
    for (const nb of baseNeighbors[xon.node]) {
        if (_octNodeSet.has(nb.node) && nb.node !== antipodal) {
            allOctNeighbors.push({ node: nb.node, dirIdx: nb.dirIdx });
        }
    }
    const scs = _localScNeighbors(xon.node);
    for (const sc of scs) {
        const other = sc.a === xon.node ? sc.b : sc.a;
        if (_octNodeSet.has(other) && other !== antipodal && !allOctNeighbors.find(n => n.node === other)) {
            const scId = sc.id;
            const alreadyActive = activeSet.has(scId) || impliedSet.has(scId) || xonImpliedSet.has(scId);
            const dx = pos[other][0] - pos[xon.node][0];
            const dy = pos[other][1] - pos[xon.node][1];
            const dz = pos[other][2] - pos[xon.node][2];
            const d = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
            let bestDir = 0, bestDot = -Infinity;
            for (let k = 0; k < 4; k++) {
                const v = DIR_VEC[k];
                const dot = Math.abs((dx/d)*v[0] + (dy/d)*v[1] + (dz/d)*v[2]);
                if (dot > bestDot) { bestDot = dot; bestDir = k; }
            }
            allOctNeighbors.push({
                node: other, dirIdx: bestDir,
                _scId: scId, _needsMaterialise: !alreadyActive
            });
        }
    }

    if (allOctNeighbors.length === 0) return [];

    // Score candidates by momentum conservation
    const candidates = [];
    for (const nb of allOctNeighbors) {
        if (occupied.has(nb.node)) continue; // Pauli: already occupied
        if (blocked && blocked.has(nb.node)) continue; // Pauli: reserved by another planned move
        // No bouncing: don't go back to the node we just came from
        if (nb.node === xon.prevNode && xon.prevNode !== xon.node) continue;
        if (xon._lastDir === null || xon.prevNode === xon.node) {
            candidates.push({ node: nb.node, dirIdx: nb.dirIdx, score: 1, _scId: nb._scId, _needsMaterialise: nb._needsMaterialise });
        } else {
            const dx = pos[nb.node][0] - pos[xon.node][0];
            const dy = pos[nb.node][1] - pos[xon.node][1];
            const dz = pos[nb.node][2] - pos[xon.node][2];
            const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
            const actualDir = [dx/len, dy/len, dz/len];
            const pdx = pos[xon.node][0] - pos[xon.prevNode][0];
            const pdy = pos[xon.node][1] - pos[xon.prevNode][1];
            const pdz = pos[xon.node][2] - pos[xon.prevNode][2];
            const plen = Math.sqrt(pdx*pdx + pdy*pdy + pdz*pdz) || 1;
            const prevActual = [pdx/plen, pdy/plen, pdz/plen];
            const dot = prevActual[0]*actualDir[0] + prevActual[1]*actualDir[1] + prevActual[2]*actualDir[2];
            // Accept all directions (including backtrack) but score them
            candidates.push({ node: nb.node, dirIdx: nb.dirIdx, score: dot, _scId: nb._scId, _needsMaterialise: nb._needsMaterialise });
        }
    }

    // 2-step awareness SCORING — penalize candidates that appear to lack a
    // 2nd move. This is a heuristic using partial occupation (oct xons removed).
    // The AUTHORITATIVE hard check happens in the cooperative post-plan
    // verification, which uses full projected state (neighbors' 1st moves).
    const tmpOcc = new Map(occupied);
    if (blocked) for (const n of blocked) _occAdd(tmpOcc, n);
    for (const c of candidates) {
        _occAdd(tmpOcc, c.node);
        if (!_lookahead(c.node, tmpOcc, 1)) {
            c.score -= _choreoParams.octDeadEndPenalty; // strong penalty — but NOT eliminated, since other
                           // oct xons may vacate and open up 2nd-move paths
        }
        _occDel(tmpOcc, c.node);

        // Oct cage priority: strongly prefer traversals that would materialize
        // unmaterialized oct cage SCs (helps T25 — cage must complete by tick 36)
        if (c._scId !== undefined && c._needsMaterialise && _octSCIds &&
            _octSCIds.includes(c._scId)) {
            c.score += _choreoParams.octCageBonus; // highest priority — materializing oct cage SCs
        }

    }

    // Sort by score descending (prefer forward momentum + 2-step awareness + low contention)
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
}

// Execute an oct move to a specific target. Handles vacuum negotiation.
// Returns true if the move succeeded, false if vacuum rejected.
function _executeOctMove(xon, target) {
    // Reject self-moves (target is current node) — these are no-ops that corrupt prevNode
    if (target.node === xon.node) return false;
    // T45: anti-bounce guard — reject move back to prevNode (disabled by default)
    if (_T45_BOUNCE_GUARD && xon._mode === 'oct' && target.node === xon.prevNode && xon.prevNode !== xon.node) {
        return false;
    }
    // Re-check SC activation at execution time (may have changed since planning)
    if (target._scId !== undefined) {
        const stillActive = activeSet.has(target._scId) || impliedSet.has(target._scId) || xonImpliedSet.has(target._scId);
        const hasBase = (baseNeighbors[xon.node] || []).some(nb => nb.node === target.node);
        if (!stillActive && !hasBase) {
            // SC was deactivated since planning — need materialization now
            target._needsMaterialise = true;
        }
    }
    // Vacuum negotiation: if target SC is inactive, try to materialise
    if (target._needsMaterialise && target._scId !== undefined) {
        let materialised = false;
        if (canMaterialiseQuick(target._scId)) {
            activeSet.add(target._scId);
            stateVersion++; // invalidate cache
            materialised = true;
        } else if (excitationSeverForRoom(target._scId)) {
            if (canMaterialiseQuick(target._scId)) {
                activeSet.add(target._scId);
                stateVersion++; // invalidate cache
                materialised = true;
            }
        }
        if (!materialised) return false; // vacuum rejected
        xon._solverNeeded = true;
    }

    // Record direction history for T16 momentum test
    if (pos[xon.node] && pos[target.node]) {
        const dx = pos[target.node][0] - pos[xon.node][0];
        const dy = pos[target.node][1] - pos[xon.node][1];
        const dz = pos[target.node][2] - pos[xon.node][2];
        const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
        xon._dirHistory.push([dx/len, dy/len, dz/len]);
        if (xon._dirHistory.length > 200) xon._dirHistory.splice(0, 100);
    }

    // Move
    xon.prevNode = xon.node;
    xon.node = target.node;
    xon._lastDir = target.dirIdx;

    // Push trail history + per-segment color, start tween
    _trailPush(xon, target.node, xon.col);
    xon.tweenT = 0;
    if (_flashEnabled) xon.flashT = 1.0;
    return true;
}

// Legacy wrapper — used by collision scatter in PASS 1.5
function _advanceOctXon(xon, occupied) {
    const candidates = _getOctCandidates(xon, occupied);
    if (candidates.length === 0) return false;
    // Try candidates in order; skip those needing materialisation that fails
    for (const c of candidates) {
        if (_executeOctMove(xon, c)) return true;
    }
    return false;
}

// ── Traversal Lock ──────────────────────────────────────────────
// Returns a Set of SC IDs that xons are currently sitting on (prevNode→node).
// These SCs MUST NOT be removed from any set until the next tick.
// Call this before any SC deletion to check if the SC is locked.
function _traversalLockedSCs(excludeXon) {
    // EDGE-ONLY lock: only the SC on the edge a xon just traversed (prevNode↔node).
    // Physics: "if I used a shortcut on my last turn, it must exist on this turn."
    // No face-level lock — xons negotiate with the vacuum before each hop.
    const locked = new Set();
    for (const xon of _demoXons) {
        if (!xon.alive || xon.prevNode == null) continue;
        if (xon === excludeXon) continue;
        const pid = pairId(xon.prevNode, xon.node);
        const scId = scPairToId.get(pid);
        if (scId !== undefined) locked.add(scId);
    }
    return locked;
}

// Promote impliedSet-only face SCs into xonImpliedSet so they persist.
// impliedSet is ephemeral (rebuilt each solver tick). When a xon is assigned
// to a face, the SCs it will traverse must be in a persistent set.
function _promoteFaceSCs(face, xon) {
    const fd = _nucleusTetFaceData[face];
    if (!fd) return;
    const xi = xon ? _demoXons.indexOf(xon) : -1;
    for (const scId of fd.scIds) {
        if (impliedSet.has(scId) && !xonImpliedSet.has(scId) && !activeSet.has(scId)) {
            xonImpliedSet.add(scId);
            _scAttribution.set(scId, { reason: 'faceAssign', xonIdx: xi, face, tick: _demoTick });
            stateVersion++;
        }
    }
}

// Transition xon from oct mode to tet mode (assigned to actualize a face)
function _assignXonToTet(xon, face, quarkType) {
    const fd = _nucleusTetFaceData[face];
    if (!fd) return;
    _demoTetAssignments++;  // track for hit rate
    _promoteFaceSCs(face, xon);

    let seq = LOOP_SEQUENCES[quarkType](fd.cycle);
    const col = QUARK_COLORS[quarkType];
    const cycle = fd.cycle; // [a, b, c, d]

    // If xon is already at seq[0], use the sequence as-is.
    // If xon is at a different oct node on this face, rotate the cycle
    // so the xon starts from where it already is (no teleportation / Pauli safe).
    if (xon.node !== seq[0]) {
        const octNodesOnFace = cycle.filter(n => _octNodeSet.has(n));
        const currentIdx = octNodesOnFace.indexOf(xon.node);
        if (currentIdx >= 0) {
            // Rotate cycle so xon's current node is in position 0
            const a = cycle[0], b = cycle[1], c = cycle[2], d = cycle[3];
            let rotated;
            if (xon.node === a) rotated = [a, b, c, d];
            else if (xon.node === c) rotated = [c, b, a, d]; // swap a↔c
            else if (xon.node === d) rotated = [d, b, c, a]; // swap a↔d
            else rotated = cycle; // fallback
            seq = LOOP_SEQUENCES[quarkType](rotated);
        } else {
            // Xon is NOT on this face — walk ONE HOP toward nearest face oct node.
            const faceOctNodes = new Set(octNodesOnFace);
            const target = _walkToFace(xon, faceOctNodes);
            if (target !== null) {
                // Reached a face node in one hop — rotate cycle
                const a = cycle[0], b = cycle[1], c = cycle[2], d = cycle[3];
                let rotated;
                if (target === a) rotated = [a, b, c, d];
                else if (target === c) rotated = [c, b, a, d];
                else if (target === d) rotated = [d, b, c, a];
                else rotated = cycle;
                seq = LOOP_SEQUENCES[quarkType](rotated);
            } else {
                // Didn't reach face in one hop — abort assignment (no teleportation).
                // Xon stays in oct mode; assignment will retry next window.
                return;
            }
        }
    }

    xon._mode = 'tet';
    xon._assignedFace = face;
    xon._quarkType = quarkType;
    xon._loopType = LOOP_TYPE_NAMES[quarkType];
    xon._loopSeq = seq;
    xon._loopStep = 0;
    xon.col = col;

    // Update spark color
    if (xon.sparkMat) xon.sparkMat.color.setHex(col);

    // Safety: if xon isn't at seq[0], abort instead of teleporting (T27)
    if (xon.node !== seq[0]) {
        xon._mode = 'oct';
        xon._assignedFace = null;
        xon._quarkType = null;
        xon._loopType = null;
        xon._loopSeq = null;
        xon._loopStep = 0;
        xon.col = 0xffffff;
        if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
        return;
    }
}

// Walk xon ONE HOP toward nearest node in targetNodes via connected edges (BFS).
// Returns the target node if xon is already there, or the first step if it moved.
// Returns null if no path exists. ONE HOP PER TICK — no teleportation (T27).
function _walkToFace(xon, targetNodes) {
    if (targetNodes.has(xon.node)) return xon.node;
    if (xon._movedThisTick) return null; // one hop per tick — no double-move (T27)

    // Build occupied set (exclude self)
    const occupiedNodes = new Set();
    for (const x of _demoXons) {
        if (x !== xon && x.alive) occupiedNodes.add(x.node);
    }

    // BFS from xon.node to nearest target, only via base edges + active SCs
    // Exclude antipodal oct node hops (diagonal traversal)
    const visited = new Set([xon.node]);
    const parent = new Map();
    const queue = [xon.node];
    let found = null;

    while (queue.length > 0 && !found) {
        const curr = queue.shift();
        const currAntipodal = _octAntipodal.get(curr);
        const nbs = baseNeighbors[curr] || [];
        for (const nb of nbs) {
            if (visited.has(nb.node)) continue;
            if (!_octNodeSet.has(nb.node)) continue;
            if (nb.node === currAntipodal) continue; // no diagonal hops
            visited.add(nb.node);
            parent.set(nb.node, curr);
            // Pauli: only accept unoccupied target nodes (T19)
            if (targetNodes.has(nb.node) && !occupiedNodes.has(nb.node)) { found = nb.node; break; }
            if (occupiedNodes.has(nb.node)) continue;
            queue.push(nb.node);
        }
        if (found) break;
        const scs = _localScNeighbors(curr);
        for (const sc of scs) {
            if (!activeSet.has(sc.id) && !impliedSet.has(sc.id) && !xonImpliedSet.has(sc.id)) continue;
            const neighbor = sc.a === curr ? sc.b : sc.a;
            if (visited.has(neighbor)) continue;
            if (!_octNodeSet.has(neighbor)) continue;
            if (neighbor === currAntipodal) continue; // no diagonal hops
            visited.add(neighbor);
            parent.set(neighbor, curr);
            // Pauli: only accept unoccupied target nodes (T19)
            if (targetNodes.has(neighbor) && !occupiedNodes.has(neighbor)) { found = neighbor; break; }
            if (occupiedNodes.has(neighbor)) continue;
            queue.push(neighbor);
        }
    }

    if (!found) return null;

    // Reconstruct path
    const path = [];
    let n = found;
    while (n !== xon.node) { path.push(n); n = parent.get(n); }
    path.reverse();

    // ONE HOP ONLY — no teleportation (T27)
    const step = path[0];
    if (_swapBlocked(xon.node, step)) return null; // T41: abort if swap
    const fromWF = xon.node;
    xon.prevNode = xon.node;
    xon.node = step;
    xon._movedThisTick = true; // one hop per tick — prevent double-move
    _moveRecord.set(step, fromWF);
    _traceMove(xon, fromWF, step, 'walkToFace');

    _trailPush(xon, step, 0xffffff);
    xon.tweenT = 0;

    // Return the target if we reached it in one hop, otherwise null (still walking)
    return targetNodes.has(step) ? step : null;
}

// T42: Clean up face SCs from xonImpliedSet when a xon abandons its tet face.
// Respects traversal lock — won't remove SCs being traversed by other xons.
function _relinquishFaceSCs(xon) {
    if (xon._assignedFace == null) return;
    const fd = _nucleusTetFaceData ? _nucleusTetFaceData[xon._assignedFace] : null;
    if (!fd) return;
    const locked = _traversalLockedSCs(xon); // exclude self — don't self-lock
    for (const scId of fd.scIds) {
        if (locked.has(scId)) continue;
        if (xonImpliedSet.has(scId) && !activeSet.has(scId)) {
            xonImpliedSet.delete(scId);
            _scAttribution.delete(scId);
            stateVersion++;
        }
    }
}

// Transition xon from tet mode back to oct mode after loop completion.
// Optional `occupied` map prevents Pauli violations when multiple xons return simultaneously.
function _returnXonToOct(xon, occupied) {
    // If at a non-oct node, check if we can actually reach an oct node first.
    // Only clear assignment and switch to oct mode if we can get there.
    if (_octNodeSet && !_octNodeSet.has(xon.node)) {
        const nbs = baseNeighbors[xon.node] || [];
        let target = null;
        for (const nb of nbs) {
            if (!_octNodeSet.has(nb.node)) continue;
            if (_swapBlocked(xon.node, nb.node)) continue;
            if (occupied && (occupied.get(nb.node) || 0) > 0) continue;
            target = nb;
            break;
        }
        if (!target) {
            // Can't reach an oct node — DON'T switch to oct mode (would violate T16).
            // Keep current mode; will retry next tick.
            return;
        }
        // Can reach an oct node — proceed with mode transition + move
        _relinquishFaceSCs(xon); // T42: clean up face SCs before clearing assignment
        xon._mode = 'oct';
        xon._assignedFace = null;
        xon._quarkType = null;
        xon._loopType = null;
        xon._loopSeq = null;
        xon._loopStep = 0;
        xon.col = 0xffffff;
        if (_flashEnabled) xon.flashT = 1.0;
        if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);

        const fromRTO = xon.node;
        xon.prevNode = xon.node;
        xon.node = target.node;
        xon._movedThisTick = true;
        _moveRecord.set(target.node, fromRTO);
        _traceMove(xon, fromRTO, target.node, 'returnToOct');
        if (occupied) { _occDel(occupied, fromRTO); _occAdd(occupied, target.node); }
        _trailPush(xon, target.node, xon.col);
    } else {
        // Already at an oct node — just switch mode
        _relinquishFaceSCs(xon);
        xon._mode = 'oct';
        xon._assignedFace = null;
        xon._quarkType = null;
        xon._loopType = null;
        xon._loopSeq = null;
        xon._loopStep = 0;
        xon.col = 0xffffff;
        if (_flashEnabled) xon.flashT = 1.0;
        if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
    }
}

// Start an idle tet loop for a xon boxed in on the oct surface.
// CONSTRAINT: xons can ONLY idle in already-actualized tets — faces whose
// SCs are already in xonImpliedSet or activeSet. No new geometry created.
// Returns true if a loop was started, false if no actualized face found.
function _startIdleTetLoop(xon, occupied) {
    if (!_nucleusTetFaceData) return false;

    const types = ['pu', 'nd', 'pd', 'nu'];

    // ── Pass 1: Try already-actualized faces ──
    const actualizedFaces = [];
    const manifestCandidates = []; // faces we could try to manifest
    for (const [fStr, fd] of Object.entries(_nucleusTetFaceData)) {
        if (!fd.cycle.includes(xon.node)) continue;
        const actualized = fd.scIds.every(scId =>
            xonImpliedSet.has(scId) || activeSet.has(scId) || impliedSet.has(scId));
        if (actualized) {
            actualizedFaces.push(parseInt(fStr));
        } else {
            manifestCandidates.push(parseInt(fStr));
        }
    }

    // Helper: try to assign xon to a face with free destination
    function tryFaces(faces) {
        const shuffled = faces.sort(() => Math.random() - 0.5);
        const shuffledTypes = types.slice().sort(() => Math.random() - 0.5);
        let bestSeq = null, bestFace = null, bestType = null;
        for (const face of shuffled) {
            const existingXon = _demoXons.find(x =>
                x.alive && x !== xon && x._assignedFace === face &&
                (x._mode === 'tet' || x._mode === 'idle_tet'));
            const fd = _nucleusTetFaceData[face];
            const cycle = fd.cycle;
            const [a, b, c, d] = cycle;
            let rotated;
            if (xon.node === a) rotated = [a, b, c, d];
            else if (xon.node === c) rotated = [c, b, a, d];
            else if (xon.node === d) rotated = [d, b, c, a];
            else if (xon.node === b) rotated = [b, a, d, c];
            else continue;

            for (const qType of shuffledTypes) {
                const seq = LOOP_SEQUENCES[qType](rotated);
                const dest = seq[1];
                if (occupied && occupied.has(dest)) continue;
                _promoteFaceSCs(face, xon);
                xon._mode = 'idle_tet';
                xon._loopSeq = seq;
                xon._loopStep = 0;
                xon._assignedFace = face;
                xon._quarkType = qType;
                xon._loopType = LOOP_TYPE_NAMES[qType];
                xon.col = QUARK_COLORS[qType];
                if (_flashEnabled) xon.flashT = 1.0;
                if (xon.sparkMat) xon.sparkMat.color.setHex(xon.col);
                return true;
            }
            if (!bestSeq) {
                const fallbackType = existingXon
                    ? shuffledTypes.find(t => QUARK_COLORS[t] === existingXon.col) || shuffledTypes[0]
                    : shuffledTypes[0];
                bestSeq = LOOP_SEQUENCES[fallbackType](rotated);
                bestFace = face;
                bestType = fallbackType;
            }
        }
        if (bestSeq) {
            _promoteFaceSCs(bestFace, xon);
            xon._mode = 'idle_tet';
            xon._loopSeq = bestSeq;
            xon._loopStep = 0;
            xon._assignedFace = bestFace;
            xon._quarkType = bestType;
            xon._loopType = bestType ? LOOP_TYPE_NAMES[bestType] : null;
            xon.col = bestType ? QUARK_COLORS[bestType] : 0x888888;
            if (_flashEnabled) xon.flashT = 1.0;
            if (xon.sparkMat) xon.sparkMat.color.setHex(xon.col);
            return true;
        }
        return false;
    }

    if (tryFaces(actualizedFaces)) return true;

    // ── Pass 2: Manifest new tet voids ──
    // Try to materialise the missing SCs for non-actualized faces.
    // This creates new loiter space when the oct cage is congested.
    const newlyActualized = [];
    for (const face of manifestCandidates.sort(() => Math.random() - 0.5)) {
        const fd = _nucleusTetFaceData[face];
        const missingSCs = fd.scIds.filter(scId =>
            !xonImpliedSet.has(scId) && !activeSet.has(scId) && !impliedSet.has(scId));
        // Try to materialise all missing SCs
        let allOk = true;
        const justAdded = [];
        const xi = _demoXons.indexOf(xon);
        for (const scId of missingSCs) {
            if (canMaterialiseQuick(scId)) {
                xonImpliedSet.add(scId);
                _scAttribution.set(scId, { reason: 'manifest', xonIdx: xi, face, tick: _demoTick });
                stateVersion++; // invalidate cache for next check
                justAdded.push(scId);
            } else if (excitationSeverForRoom(scId)) {
                if (canMaterialiseQuick(scId)) {
                    xonImpliedSet.add(scId);
                    _scAttribution.set(scId, { reason: 'manifest', xonIdx: xi, face, tick: _demoTick });
                    stateVersion++; // invalidate cache
                    justAdded.push(scId);
                } else {
                    allOk = false; break;
                }
            } else {
                allOk = false; break;
            }
        }
        if (allOk) {
            newlyActualized.push(face);
            if (justAdded.length > 0) {
                _idleTetManifested = true;
                console.log(`[MANIFEST] Actualized tet face ${face} (${justAdded.length} new SCs) for idle loitering`);
            }
        } else {
            // Roll back partial materialisation
            for (const scId of justAdded) {
                xonImpliedSet.delete(scId);
                _scAttribution.delete(scId);
                stateVersion++; // invalidate cache
            }
        }
    }

    if (newlyActualized.length > 0) {
        const _idleLocked = _traversalLockedSCs();
        if (tryFaces(newlyActualized)) {
            // Rollback SCs for faces we manifested but didn't use
            const assignedFace = xon._assignedFace;
            for (const face of newlyActualized) {
                if (face === assignedFace) continue;
                const fd = _nucleusTetFaceData[face];
                for (const scId of fd.scIds) {
                    if (_idleLocked.has(scId)) continue; // xon traversing this SC
                    if (xonImpliedSet.has(scId) && !activeSet.has(scId) && !impliedSet.has(scId)) {
                        xonImpliedSet.delete(scId);
                        _scAttribution.delete(scId);
                        stateVersion++;
                    }
                }
            }
            return true;
        }
        // tryFaces failed — rollback ALL newly manifested SCs
        for (const face of newlyActualized) {
            const fd = _nucleusTetFaceData[face];
            for (const scId of fd.scIds) {
                if (_idleLocked.has(scId)) continue; // xon traversing this SC
                if (xonImpliedSet.has(scId) && !activeSet.has(scId) && !impliedSet.has(scId)) {
                    xonImpliedSet.delete(scId);
                    _scAttribution.delete(scId);
                    stateVersion++;
                }
            }
        }
    }

    // ── Fallback: use any blocked actualized face ──
    // (caller handles Pauli if this destination is occupied)
    if (actualizedFaces.length > 0) return tryFaces(actualizedFaces);
    return false;
}

// Animate all demo xons — called every frame from the render loop.
// Handles tween interpolation, spark flash, trail rendering, and trail decay.
function _tickDemoXons(dt) {
    const sparkOp = (+document.getElementById('spark-opacity-slider').value) / 100;
    const demoStepSec = _getDemoIntervalMs() * 0.001;

    for (let xi = _demoXons.length - 1; xi >= 0; xi--) {
        const xon = _demoXons[xi];

        // ── Dying xons: render frozen trail (decay happens in demoTick) ──
        if (xon._dying) {
            if (!xon._frozenPos || xon._frozenPos.length === 0 || !xon.trailGeo) {
                // Trail fade complete — if group intact (annihilated), keep in array
                // for _manifestXonPair reactivation. Only splice fully destroyed xons.
                if (xon.group) {
                    // Annihilated xon: keep slot, just finish dying
                    xon._dying = false;
                    xon._dyingStartTick = null; // reset for T14
                    if (xon.trailLine) xon.trailLine.visible = false;
                } else {
                    _finalCleanupXon(xon);
                    _demoXons.splice(xi, 1);
                }
                continue;
            }
            // Render from frozen (historical) positions — per-segment colors
            const n = xon._frozenPos.length;
            for (let i = 0; i < n; i++) {
                const fp = xon._frozenPos[i];
                xon.trailPos[i * 3] = fp[0];
                xon.trailPos[i * 3 + 1] = fp[1];
                xon.trailPos[i * 3 + 2] = fp[2];
                const segCol = (xon._frozenColors && xon._frozenColors[i]) || xon.col;
                const cr = ((segCol >> 16) & 0xff) / 255;
                const cg = ((segCol >> 8) & 0xff) / 255;
                const cb = (segCol & 0xff) / 255;
                const alpha = sparkOp * (0.15 + 0.85 * (i / Math.max(n - 1, 1)) ** 1.6);
                xon.trailCol[i * 3] = cr * alpha;
                xon.trailCol[i * 3 + 1] = cg * alpha;
                xon.trailCol[i * 3 + 2] = cb * alpha;
            }
            xon.trailGeo.setDrawRange(0, n);
            xon.trailGeo.attributes.position.needsUpdate = true;
            xon.trailGeo.attributes.color.needsUpdate = true;
            continue;
        }

        if (!xon.alive || !xon.group) continue;

        // ── Live xons: tween + spark + trail ──
        // Tween interpolation (cubic ease-out)
        xon.tweenT = Math.min(1, xon.tweenT + dt / demoStepSec);
        const s = 1 - (1 - xon.tweenT) ** 3;
        const pf = pos[xon.prevNode], pt = pos[xon.node];
        if (pf && pt) {
            // Distance check: if prevNode→node exceeds valid hop distance,
            // hold at source (don't flash sprite at non-adjacent target)
            const _tdx = pt[0] - pf[0], _tdy = pt[1] - pf[1], _tdz = pt[2] - pf[2];
            const _hopDist = Math.sqrt(_tdx*_tdx + _tdy*_tdy + _tdz*_tdz);
            if (_hopDist > 1.2) {
                xon.group.position.set(pf[0], pf[1], pf[2]);
            } else {
                const px = pf[0] + (pt[0] - pf[0]) * s;
                const py = pf[1] + (pt[1] - pf[1]) * s;
                const pz = pf[2] + (pt[2] - pf[2]) * s;
                xon.group.position.set(px, py, pz);
            }
        }

        // Sparkle flash + flicker
        xon.flashT = Math.max(0, xon.flashT - dt * 6.0);
        const flicker = 0.85 + Math.random() * 0.3;
        const hlBoost = xon._highlightT > 0 ? 2.5 : 1.0;
        const pulse = (0.22 + xon.flashT * 0.26) * flicker * hlBoost;
        xon.spark.scale.set(pulse, pulse, 1);
        xon.sparkMat.opacity = Math.min(1.0, (0.6 + xon.flashT * 0.4) * flicker * sparkOp * hlBoost);
        // Decay highlight timer
        if (xon._highlightT > 0) xon._highlightT = Math.max(0, xon._highlightT - dt);
        xon.sparkMat.rotation = Math.random() * Math.PI * 2;

        // Trail: fading vertex-colored path
        // Lifespan knob controls how many trail points are visible (0-50).
        // Always store full 50-tick history; render only the last `visLen` points.
        const lifespan = +document.getElementById('tracer-lifespan-slider').value;
        const fullLen = xon.trail.length;
        const visLen = Math.min(fullLen, lifespan);
        const startIdx = fullLen - visLen; // skip older points beyond lifespan

        // During tween (tweenT < 1), the latest trail entry is the DESTINATION
        // which the sprite hasn't reached yet. Rendering it in the body creates
        // a backward line from destination back to sprite. Fix: exclude the
        // latest entry during tween and let the trail head animate the hop.
        const bodyLen = (xon.tweenT < 1 && visLen > 1) ? visLen - 1 : visLen;

        // Per-segment color from trailColHistory — segments retain their original color
        // flashT boosts trail brightness near the head (mode transition / birth flash)
        xon._lastTrailFlashBoost = 0; // reset per frame for T37 measurement
        for (let vi = 0; vi < bodyLen; vi++) {
            const i = startIdx + vi;
            // Use frozen positions (recorded at trail push time) so trails don't deform with solver
            const np = (xon._trailFrozenPos && xon._trailFrozenPos[i]) || pos[xon.trail[i]];
            if (!np) continue;
            // Teleport suppression: if this segment jumps > 1.5 from previous point,
            // collapse to previous point (zero-length segment hides the teleport line)
            if (vi > 0) {
                const _spx = xon.trailPos[(vi-1) * 3], _spy = xon.trailPos[(vi-1) * 3 + 1], _spz = xon.trailPos[(vi-1) * 3 + 2];
                const _sdx = np[0] - _spx, _sdy = np[1] - _spy, _sdz = np[2] - _spz;
                if (_sdx*_sdx + _sdy*_sdy + _sdz*_sdz > 1.44) { // 1.2^2
                    xon.trailPos[vi * 3] = _spx;
                    xon.trailPos[vi * 3 + 1] = _spy;
                    xon.trailPos[vi * 3 + 2] = _spz;
                    // Zero alpha to fully hide collapsed point
                    xon.trailCol[vi * 3] = 0;
                    xon.trailCol[vi * 3 + 1] = 0;
                    xon.trailCol[vi * 3 + 2] = 0;
                    continue;
                }
            }
            xon.trailPos[vi * 3] = np[0];
            xon.trailPos[vi * 3 + 1] = np[1];
            xon.trailPos[vi * 3 + 2] = np[2];
            const segCol = (xon.trailColHistory && xon.trailColHistory[i]) || xon.col;
            const cr = ((segCol >> 16) & 0xff) / 255;
            const cg = ((segCol >> 8) & 0xff) / 255;
            const cb = (segCol & 0xff) / 255;
            const baseAlpha = 0.15 + 0.85 * (vi / Math.max(bodyLen, 1)) ** 1.6;
            // Flash boost: head segments get up to 40% brighter during flash
            const headProximity = vi / Math.max(bodyLen - 1, 1); // 0=tail, 1=head
            const flashBoost = xon.flashT * 0.4 * headProximity;
            xon._lastTrailFlashBoost = Math.max(xon._lastTrailFlashBoost || 0, flashBoost);
            const alpha = sparkOp * Math.min(1, baseAlpha + flashBoost);
            xon.trailCol[vi * 3] = cr * alpha;
            xon.trailCol[vi * 3 + 1] = cg * alpha;
            xon.trailCol[vi * 3 + 2] = cb * alpha;
        }
        // Current interpolated position as trail head — extends from last BODY
        // entry toward sprite. During tween this smoothly animates the hop.
        const last = bodyLen;
        let _drawHead = false;
        if (last < XON_TRAIL_LENGTH && bodyLen > 0) {
            // Distance from last body point to current group position
            const _lfi = startIdx + bodyLen - 1;
            const _lfp = (xon._trailFrozenPos && xon._trailFrozenPos[_lfi]) || pos[xon.trail[startIdx + bodyLen - 1]];
            if (_lfp) {
                const _hdx = xon.group.position.x - _lfp[0];
                const _hdy = xon.group.position.y - _lfp[1];
                const _hdz = xon.group.position.z - _lfp[2];
                if (_hdx*_hdx + _hdy*_hdy + _hdz*_hdz <= 1.44) { // 1.2^2
                    _drawHead = true;
                    xon.trailPos[last * 3] = xon.group.position.x;
                    xon.trailPos[last * 3 + 1] = xon.group.position.y;
                    xon.trailPos[last * 3 + 2] = xon.group.position.z;
                    const headCol = xon.col;
                    const hcr = ((headCol >> 16) & 0xff) / 255;
                    const hcg = ((headCol >> 8) & 0xff) / 255;
                    const hcb = (headCol & 0xff) / 255;
                    xon.trailCol[last * 3] = hcr * sparkOp;
                    xon.trailCol[last * 3 + 1] = hcg * sparkOp;
                    xon.trailCol[last * 3 + 2] = hcb * sparkOp;
                }
            }
        }
        const n = _drawHead ? bodyLen + 1 : bodyLen;
        xon.trailGeo.setDrawRange(0, Math.min(n, XON_TRAIL_LENGTH));
        xon.trailGeo.attributes.position.needsUpdate = true;
        xon.trailGeo.attributes.color.needsUpdate = true;
    }
}

// Emit a gluon between two tet faces along oct edges
function _emitGluon(fromFace, toFace) {
    const fdFrom = _nucleusTetFaceData[fromFace];
    const fdTo = _nucleusTetFaceData[toFace];
    if (!fdFrom || !fdTo || !_octNodeSet) return;

    // Find shared oct nodes between the two faces
    const fromOctNodes = fdFrom.allNodes.filter(n => _octNodeSet.has(n));
    const toOctNodes = fdTo.allNodes.filter(n => _octNodeSet.has(n));
    const shared = fromOctNodes.filter(n => toOctNodes.includes(n));

    if (shared.length === 0) {
        // No shared nodes — need 2-hop path through oct
        // Find a bridging oct node connected to both
        for (const fn of fromOctNodes) {
            for (const tn of toOctNodes) {
                const pid = pairId(fn, tn);
                const scId = scPairToId.get(pid);
                if (scId !== undefined) {
                    // Direct oct edge exists
                    const sprite = _createGluonSprite();
                    if (pos[fn]) sprite.position.set(pos[fn][0], pos[fn][1], pos[fn][2]);
                    _demoGluons.push({
                        fromFace, toFace,
                        path: [fn, tn],
                        step: 0,
                        scIds: [scId],
                        sprite: sprite,
                    });
                    return;
                }
            }
        }
    } else {
        // Shared node — gluon is a zero-hop bridge (instant)
        // Oct SCs will be added when the oct is revealed (all 8 faces visited).
        // Don't add individual oct SCs here — let the oct reveal handle it atomically.
    }
}

// Advance all active gluons one step. Returns true if any SCs were changed.
// Gluons also negotiate with the vacuum — oct SCs are validated before adding.
function _advanceGluons() {
    let changed = false;
    for (let i = _demoGluons.length - 1; i >= 0; i--) {
        const g = _demoGluons[i];
        if (g.step < g.path.length - 1) {
            g.step++;
            const toNode = g.path[g.step];
            // Negotiate with vacuum before materializing oct SC
            const scId = g.scIds[g.step - 1];
            if (scId !== undefined && !activeSet.has(scId)) {
                if (canMaterialiseQuick(scId)) {
                    activeSet.add(scId);
                    stateVersion++; // invalidate cache
                    changed = true;
                }
                // If vacuum rejects, gluon still moves visually
            }
            // Move sprite
            if (g.sprite && pos[toNode]) {
                g.sprite.position.set(pos[toNode][0], pos[toNode][1], pos[toNode][2]);
            }
        } else {
            // Gluon arrived — remove
            if (g.sprite) {
                scene.remove(g.sprite);
                g.sprite.material.dispose();
            }
            _demoGluons.splice(i, 1);
        }
    }
    return changed;
}

// Clean up all demo 3.0 xons and gluons (immediate, for stop/reset)
function _cleanupDemo3() {
    for (const xon of _demoXons) {
        if (xon.alive) _destroyXon(xon);
        _finalCleanupXon(xon);
    }
    _demoXons = [];
    _gluonStoredPairs = 0;
    for (const g of _demoGluons) {
        if (g.sprite) { scene.remove(g.sprite); g.sprite.material.dispose(); }
    }
    _demoGluons = [];
    _demoPrevFaces = new Set();
}

// Map speed slider (1-100) to demo interval: 1→2000ms (2s cycle), 50→~60ms, 100→uncapped
function _getDemoIntervalMs() {
    const slider = document.getElementById('excitation-speed-slider');
    if (!slider) return 2000; // default = slowest
    const t = +slider.value / 100;
    if (t >= 1.0) return 0; // 100% = uncapped, as fast as possible
    return Math.max(4, Math.round(Math.exp(Math.log(2000) * (1 - t) + Math.log(4) * t)));
}
let _demoUncappedId = null;  // setTimeout chain for uncapped mode
function _demoUncappedLoop() {
    if (!_demoActive || _demoInterval || _demoPaused) { _demoUncappedId = null; return; }
    demoTick().then(() => {
        if (_demoActive && !_demoInterval && !_demoPaused) {
            _demoUncappedId = setTimeout(_demoUncappedLoop, 0);
        } else {
            _demoUncappedId = null;
        }
    }).catch(err => {
        console.error('[uncapped loop] demoTick error:', err);
        // Don't kill the loop — schedule next tick anyway
        if (_demoActive && !_demoInterval && !_demoPaused) {
            _demoUncappedId = setTimeout(_demoUncappedLoop, 0);
        }
    });
}

/**
 * Build a full deuteron 8-tick schedule from two patterns.
 * Each entry has protonFaces[3] and neutronFaces[3], plus quark-type assignments:
 *   protonFaces[0] = anchor (proton-down), [1],[2] = followers (proton-up)
 *   neutronFaces[0] = anchor (neutron-up), [1],[2] = followers (neutron-down)
 */
function buildDeuteronSchedule(patP, patN, D4) {
    const A = [1, 3, 6, 8];
    const B = [2, 4, 5, 7];
    const dA_p = D4[patP.aDerang], dB_p = D4[patP.bDerang];
    const ancA_p = patP.anchorsA[0], ancB_p = patP.anchorsB[0];
    const dA_n = D4[patN.aDerang], dB_n = D4[patN.bDerang];
    const ancA_n = patN.anchorsA[0], ancB_n = patN.anchorsB[0];

    const schedule = [];
    for (let i = 0; i < 4; i++) {
        // Even tick 2i: proton on A, neutron on B (anti-phase)
        schedule.push({
            protonFaces: [A[ancA_p[i]], A[i], A[dA_p[i]]],
            neutronFaces: [B[ancB_n[i]], B[i], B[dB_n[i]]],
            // Quark-type map: face → quarkType
            faceQuarks: {
                [A[ancA_p[i]]]: 'pd',   // proton anchor = down
                [A[i]]: 'pu',            // proton follower-1 = up
                [A[dA_p[i]]]: 'pu',      // proton follower-2 = up
                [B[ancB_n[i]]]: 'nu',    // neutron anchor = up
                [B[i]]: 'nd',            // neutron follower-1 = down
                [B[dB_n[i]]]: 'nd',      // neutron follower-2 = down
            },
        });
        // Odd tick 2i+1: proton on B, neutron on A
        schedule.push({
            protonFaces: [B[ancB_p[i]], B[i], B[dB_p[i]]],
            neutronFaces: [A[ancA_n[i]], A[i], A[dA_n[i]]],
            faceQuarks: {
                [B[ancB_p[i]]]: 'pd',
                [B[i]]: 'pu',
                [B[dB_p[i]]]: 'pu',
                [A[ancA_n[i]]]: 'nu',
                [A[i]]: 'nd',
                [A[dA_n[i]]]: 'nd',
            },
        });
    }
    return schedule;
}

// ── L1-valid tet configurations (verified by solver) ──
const L1_VALID_TRIPLES = [
    [3, 5, 6], [1, 6, 7], [3, 5, 8], [1, 7, 8],  // 2A+1B
    [4, 5, 6], [4, 6, 7], [2, 5, 8], [2, 7, 8],  // 1A+2B
];
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  NON-DELETABLE: MINIMAL ACTION PRINCIPLE                           ║
// ║                                                                    ║
// ║  "Relinquish if necessary for the desired transformation,          ║
// ║   otherwise do not change."                                        ║
// ║                                                                    ║
// ║  When switching tet configurations:                                ║
// ║  - Remove ONLY the SCs that need to go (old tets not in new set)  ║
// ║  - Add ONLY the SCs that are new (new tets not in old set)        ║
// ║  - Keep everything else UNCHANGED                                  ║
// ║  - Do NOT clear-and-rebuild from scratch                           ║
// ║  - Do NOT cascade-detect implied shortcuts during demo             ║
// ║    (cascade deforms FCC geometry → Kepler violation)               ║
// ║                                                                    ║
// ║  This is a physics principle, not an optimization.                 ║
// ╚══════════════════════════════════════════════════════════════════════╝

/**
 * Start the demand-driven demo: sets up lattice, runs high-speed loop.
 * Called AFTER simulateNucleus() has built the octahedron.
 * No schedule or windows — xons self-assign via _scoreFaceOpportunity.
 */
function startDemoLoop() {
    // Init visit counters (demand-driven — no schedule needed)
    _demoVisits = {};
    for (let f = 1; f <= 8; f++) {
        _demoVisits[f] = { pu: 0, pd: 0, nu: 0, nd: 0, total: 0 };
    }
    _demoTick = 0;
    _bfsReset(); // fresh demo = clean BFS + ledger
    _btSnapshots.length = 0;
    _demoTetAssignments = 0;
    _demoPauliViolations = 0;
    _demoSpreadViolations = 0;
    _demoTypeBalanceHistory = [];
    _demoVisitedFaces = new Set();  // track which faces have been activated
    _demoOctRevealed = false;       // oct only renders once all 8 faces visited
    // Clean up any existing xon visuals before reinit
    for (const xon of _demoXons) {
        if (xon.group) { scene.remove(xon.group); }
        if (xon.sparkMat) xon.sparkMat.dispose();
        if (xon.trailLine) scene.remove(xon.trailLine);
        if (xon.trailGeo) xon.trailGeo.dispose();
    }
    _demoXons = [];
    _demoGluons = [];               // Demo 3.1: clear gluon pool
    _demoPrevFaces = new Set();     // Demo 3.1: no previous window faces
    _demoActive = true;
    _demoPaused = false;

    // Stop excitation clock (we drive our own loop)
    if (typeof stopExcitationClock === 'function') stopExcitationClock();

    // Do NOT pre-open all 8 tet SCs — only 1-3 tets can coexist at a time.
    // Tets activate/deactivate per window via xonImpliedSet, and the
    // solver re-runs each time so spheres physically respond to geometry.
    // Oct emerges visually once all 8 faces have been visited.
    bumpState();
    const pSolved = detectImplied();
    applyPositions(pSolved);
    updateVoidSpheres();

    // Hide xon sparks/trails
    const quarks = NucleusSimulator?.quarkExcitations || [];
    for (const q of quarks) {
        if (q.spark) q.spark.visible = false;
        if (q.trailLine) q.trailLine.visible = false;
    }

    // Show demo status + L2/L3 toggle
    const ds = document.getElementById('demo-status');
    if (ds) {
        ds.style.display = 'block';
        // Add L2/L3 toggle if not already present
        if (!document.getElementById('demo-lattice-toggle')) {
            const toggleDiv = document.createElement('div');
            toggleDiv.id = 'demo-lattice-toggle';
            toggleDiv.style.cssText = 'margin-top:4px; text-align:center;';
            toggleDiv.innerHTML = `<span style="font-size:8px; color:#667788; margin-right:4px;">lattice:</span>`
                + `<button id="demo-l2-btn" style="font-size:8px; padding:1px 6px; margin:0 2px; background:#1a2a3a; color:#88bbdd; border:1px solid #3a5a7a; border-radius:3px; cursor:pointer;">L2</button>`
                + `<button id="demo-l3-btn" style="font-size:8px; padding:1px 6px; margin:0 2px; background:#0a1a2a; color:#556677; border:1px solid #2a3a4a; border-radius:3px; cursor:pointer;">L3</button>`
                + `<button id="demo-l4-btn" style="font-size:8px; padding:1px 6px; margin:0 2px; background:#0a1a2a; color:#556677; border:1px solid #2a3a4a; border-radius:3px; cursor:pointer;">L4</button>`;
            ds.parentNode.insertBefore(toggleDiv, ds.nextSibling);
            document.getElementById('demo-l2-btn').addEventListener('click', () => _setDemoLattice(2));
            document.getElementById('demo-l3-btn').addEventListener('click', () => _setDemoLattice(3));
            document.getElementById('demo-l4-btn').addEventListener('click', () => _setDemoLattice(4));
        }
        _updateDemoLatticeButtons();
    }

    // Update left panel header
    const dpTitle = document.getElementById('dp-title');
    if (dpTitle) dpTitle.textContent = '0 Planck seconds';

    // Demo 3.0 visual setup: opacity defaults
    const spheresSlider = document.getElementById('sphere-opacity-slider');
    if (spheresSlider) { spheresSlider.value = 3; spheresSlider.dispatchEvent(new Event('input')); }
    const shapesSlider = document.getElementById('void-opacity-slider');
    if (shapesSlider) { shapesSlider.value = 5; shapesSlider.dispatchEvent(new Event('input')); }
    const graphSlider = document.getElementById('graph-opacity-slider');
    if (graphSlider) { graphSlider.value = 21; graphSlider.dispatchEvent(new Event('input')); }
    const trailSlider = document.getElementById('trail-opacity-slider');
    if (trailSlider) { trailSlider.value = 55; trailSlider.dispatchEvent(new Event('input')); }

    // Center camera on bosonic cage (oct node centroid) at eye level
    if (_octNodeSet && _octNodeSet.size > 0 && pos) {
        let cx = 0, cy = 0, cz = 0, count = 0;
        for (const n of _octNodeSet) {
            if (pos[n]) { cx += pos[n][0]; cy += pos[n][1]; cz += pos[n][2]; count++; }
        }
        if (count > 0) {
            panTarget.x = cx / count;
            panTarget.y = cy / count;
            panTarget.z = cz / count;
        }
    }
    applyCamera();

    // Default to maximum speed (uncapped)
    const speedSlider = document.getElementById('excitation-speed-slider');
    if (speedSlider) { speedSlider.value = 100; speedSlider.dispatchEvent(new Event('input')); }
    // Default lifespan: visible trail length (how many of 50 stored ticks to show)
    const lifespanSlider = document.getElementById('tracer-lifespan-slider');
    if (lifespanSlider) { lifespanSlider.value = 13; lifespanSlider.dispatchEvent(new Event('input')); }
    // Spawn 6 persistent xons at center node
    _initPersistentXons();
    _nucleusNodeSet = null; // reset so lazy builder re-runs on next demo
    _openingPhase = true; // 2-tick opening choreography (ticks 0-1)

    // Clear any orphaned timers that the speed slider dispatch (above) may have
    // started — the slider handler sees _demoActive=true and starts a loop, but
    // startDemo() needs exactly ONE loop. Without this, pause can never clear the
    // orphaned timer and the demo appears to ignore the pause button.
    if (_demoInterval) { clearInterval(_demoInterval); _demoInterval = null; }
    if (_demoUncappedId) { clearTimeout(_demoUncappedId); _demoUncappedId = null; }

    const intervalMs = _getDemoIntervalMs();
    if (intervalMs === 0) {
        // Uncapped: self-scheduling async loop (as fast as GPU/CPU allows)
        _demoUncappedId = setTimeout(_demoUncappedLoop, 0);
        console.log(`[demo] Pattern demo started UNCAPPED (max speed)`);
    } else {
        _demoInterval = setInterval(demoTick, intervalMs);
        console.log(`[demo] Pattern demo started at ${intervalMs}ms interval`);
    }

    // Auto-run unit tests — HALT DEMO if any test fails (tournament: run but don't halt)
    try {
        const testResult = runDemo3Tests();
        if (!_tournamentRunning && testResult.failed.length > 0) {
            console.error(`[demo] HALTED: ${testResult.failed.length} test(s) failed: ${testResult.failed.join(', ')}`);
            stopDemo();
            return;
        }
    } catch (e) { console.warn('[demo] Test suite error:', e); }

    // Activate live guards (T19, T21, T26, T27) — start with null during grace
    if (typeof _liveGuards !== 'undefined') {
        for (const entry of LIVE_GUARD_REGISTRY) {
            const g = _liveGuards[entry.id];
            if (!g) continue;
            g.ok = null;
            g.msg = 'grace period';
            g.failed = false;
            // Re-apply init fields so state is clean across demo restarts
            if (entry.init) Object.assign(g, entry.init);
        }
        _liveGuardsActive = true;
        _liveGuardRender();
    }
}

// L2/L3 toggle for demo mode — switches lattice and restarts demo
function _updateDemoLatticeButtons() {
    const lv = +document.getElementById('lattice-slider').value;
    for (const [id, level] of [['demo-l2-btn', 2], ['demo-l3-btn', 3], ['demo-l4-btn', 4]]) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        const active = lv === level;
        btn.style.background = active ? '#1a2a3a' : '#0a1a2a';
        btn.style.color = active ? '#88bbdd' : '#556677';
        btn.style.borderColor = active ? '#3a5a7a' : '#2a3a4a';
    }
}
function _setDemoLattice(level) {
    const slider = document.getElementById('lattice-slider');
    if (!slider || +slider.value === level) return;
    // Stop demo, change lattice, re-simulate, restart demo
    stopDemo();
    slider.value = level;
    slider.dispatchEvent(new Event('input'));
    // Call simulateNucleus directly (not via button click) and restart demo
    setTimeout(() => {
        NucleusSimulator.simulateNucleus();
        setTimeout(() => startDemoLoop(), 150);
    }, 50);
}

const QUARK_COLORS = { pu: 0xffdd44, pd: 0x44cc66, nu: 0x4488ff, nd: 0xff4444 };
const A_SET = new Set([1, 3, 6, 8]);

// ─── 2-Tick Opening Choreography ─────────────────────────────────────────
// The oct is DISCOVERED through choreography, not imposed.
// Tick 0: 4 xons move center → 4 base neighbors below center (z-axis).
//         2 free xons move to other base neighbors above center.
//         The 4 below-z nodes form a shortcut-connected equatorial square.
// Tick 1: Discover the oct from the 6 xon positions.
//         4 equatorial xons merry-go-round via cage SCs.
//         2 free xons stay within 1-step of center.
function _executeOpeningTick(occupied) {
    const center = _octSeedCenter;

    if (_demoTick === 0) {
        // ── Tick 0: 4 xons → below center (y-axis), 2 → above center ──
        // Deterministic: sort by y, lowest 4 go to equatorial formation.
        const cy = pos[center][1];
        const allNbs = baseNeighbors[center].slice();
        const belowY = allNbs.filter(nb => pos[nb.node][1] < cy);
        const aboveY = allNbs.filter(nb => pos[nb.node][1] >= cy);
        // Sort each group by y for determinism (lowest first)
        belowY.sort((a, b) => pos[a.node][1] - pos[b.node][1]);
        aboveY.sort((a, b) => pos[a.node][1] - pos[b.node][1]);

        // First 4 xons → below center (equatorial square formation)
        for (let i = 0; i < 4 && i < belowY.length; i++) {
            const xon = _demoXons[i];
            const pick = belowY[i];
            _executeOctMove(xon, { node: pick.node, dirIdx: pick.dirIdx, _needsMaterialise: false, _scId: undefined });
        }
        // Remaining 2 xons → above center
        for (let i = 0; i < 2 && i < aboveY.length; i++) {
            const xon = _demoXons[4 + i];
            const pick = aboveY[i];
            _executeOctMove(xon, { node: pick.node, dirIdx: pick.dirIdx, _needsMaterialise: false, _scId: undefined });
        }

    } else if (_demoTick === 1) {
        // ── Tick 1: Discover oct from the 6 xon positions, then merry-go-round ──
        const xonNodes = _demoXons.map(x => x.node);
        const xonNodeSet = new Set(xonNodes);
        const centerBaseNbSet = new Set(baseNeighbors[center].map(nb => nb.node));

        // Find oct candidates whose equator is a subset of our 6 xon positions
        const validOcts = [];
        for (const sc of _localScNeighbors(center)) {
            const pole = sc.a === center ? sc.b : sc.a;
            const equator = baseNeighbors[pole].map(nb => nb.node).filter(n => centerBaseNbSet.has(n));
            if (equator.length !== 4) continue;
            if (!equator.every(n => xonNodeSet.has(n))) continue;
            const cageSCIds = [];
            for (let i = 0; i < equator.length; i++)
                for (let j = i + 1; j < equator.length; j++) {
                    const scId = scPairToId.get(pairId(equator[i], equator[j]));
                    if (scId !== undefined && !(baseNeighbors[equator[i]] || []).some(nb => nb.node === equator[j]))
                        cageSCIds.push(scId);
                }
            if (cageSCIds.length !== 4) continue;
            validOcts.push({ pole, equator, cageSCIds, octNodes: new Set([center, pole, ...equator]) });
        }

        if (validOcts.length === 0) {
            console.error('[opening] No valid oct among 6 xon positions!');
            return;
        }

        // Deterministic: pick the oct whose equator has lowest average y
        // (the one the 4 below-center xons naturally form)
        const chosen = validOcts.reduce((best, oct) => {
            const yAvg = oct.equator.reduce((s, n) => s + pos[n][1], 0) / 4;
            const bestYAvg = best.equator.reduce((s, n) => s + pos[n][1], 0) / 4;
            return yAvg < bestYAvg ? oct : best;
        });
        const equatorSet = new Set(chosen.equator);

        // ── Set up all oct data structures ──
        _octNodeSet = chosen.octNodes;
        _octSCIds = chosen.cageSCIds;

        // Chain-walk equator into cycle order
        const eq = chosen.equator.slice();
        const ordered = [eq[0]], used = new Set([0]), scCycle = [];
        for (let step = 0; step < 3; step++) {
            const cur = ordered[ordered.length - 1];
            for (let j = 0; j < eq.length; j++) {
                if (used.has(j)) continue;
                const scId = scPairToId.get(pairId(cur, eq[j]));
                if (scId !== undefined && chosen.cageSCIds.includes(scId)) {
                    ordered.push(eq[j]); scCycle.push(scId); used.add(j); break;
                }
            }
        }
        const closeScId = scPairToId.get(pairId(ordered[3], ordered[0]));
        if (closeScId !== undefined) scCycle.push(closeScId);
        _octEquatorCycle = ordered;
        _octCageSCCycle = scCycle;

        // Build antipodal map: eq[0]↔eq[2], eq[1]↔eq[3], pole↔pole
        _octAntipodal = new Map();
        _octAntipodal.set(ordered[0], ordered[2]);
        _octAntipodal.set(ordered[2], ordered[0]);
        _octAntipodal.set(ordered[1], ordered[3]);
        _octAntipodal.set(ordered[3], ordered[1]);
        const poles = [];
        for (const n of _octNodeSet) {
            if (!ordered.includes(n)) poles.push(n);
        }
        if (poles.length === 2) {
            _octAntipodal.set(poles[0], poles[1]);
            _octAntipodal.set(poles[1], poles[0]);
        }

        // Find oct void
        _octVoidIdx = -1;
        for (let vi = 0; vi < voidNeighborData.length; vi++) {
            const v = voidNeighborData[vi];
            if (v.type === 'oct' && v.nbrs.every(n => _octNodeSet.has(n))) { _octVoidIdx = vi; break; }
        }

        // Discover adjacent tet voids → face IDs
        _nucleusTetFaceData = {};
        const adjTets = [];
        for (let vi = 0; vi < voidNeighborData.length; vi++) {
            const v = voidNeighborData[vi];
            if (v.type !== 'tet') continue;
            const inOct = v.nbrs.filter(n => _octNodeSet.has(n));
            if (inOct.length !== 3) continue;
            adjTets.push({ voidIdx: vi, octNodes: inOct, extNode: v.nbrs.find(n => !_octNodeSet.has(n)),
                allNodes: [...v.nbrs], scIds: [...v.scIds] });
        }
        const tetGroup = new Map();
        if (adjTets.length > 0) {
            tetGroup.set(adjTets[0].voidIdx, 'A');
            const queue = [adjTets[0]];
            while (queue.length > 0) {
                const cur = queue.shift();
                const otherG = tetGroup.get(cur.voidIdx) === 'A' ? 'B' : 'A';
                for (const other of adjTets) {
                    if (tetGroup.has(other.voidIdx)) continue;
                    if (cur.octNodes.filter(n => other.octNodes.includes(n)).length === 2) {
                        tetGroup.set(other.voidIdx, otherG); queue.push(other);
                    }
                }
            }
            for (const t of adjTets) if (!tetGroup.has(t.voidIdx)) tetGroup.set(t.voidIdx, 'A');
        }
        const gA = [1,3,6,8], gB = [2,4,5,7];
        const tA = adjTets.filter(t => tetGroup.get(t.voidIdx) === 'A');
        const tB = adjTets.filter(t => tetGroup.get(t.voidIdx) === 'B');
        for (let i = 0; i < tA.length && i < gA.length; i++) {
            const t = tA[i];
            _nucleusTetFaceData[gA[i]] = { voidIdx: t.voidIdx, allNodes: t.allNodes, extNode: t.extNode,
                scIds: t.scIds, cycle: [t.octNodes[0], t.extNode, t.octNodes[1], t.octNodes[2]], group: 'A' };
        }
        for (let i = 0; i < tB.length && i < gB.length; i++) {
            const t = tB[i];
            _nucleusTetFaceData[gB[i]] = { voidIdx: t.voidIdx, allNodes: t.allNodes, extNode: t.extNode,
                scIds: t.scIds, cycle: [t.octNodes[0], t.extNode, t.octNodes[1], t.octNodes[2]], group: 'B' };
        }

        console.log(`[opening] Oct discovered: equator=[${ordered}], pole=${chosen.pole}, ${adjTets.length} tets`);

        // ── Merry-go-round: equatorial xons rotate one position via cage SCs ──
        const eqXonMap = new Map();
        for (let i = 0; i < 6; i++) if (equatorSet.has(xonNodes[i])) eqXonMap.set(xonNodes[i], i);

        const choreoMoves = [];
        for (let i = 0; i < 4; i++) {
            const src = _octEquatorCycle[i], dst = _octEquatorCycle[(i+1)%4];
            const scId = _octCageSCCycle[i];
            const xon = _demoXons[eqXonMap.get(src)];
            const isActive = activeSet.has(scId) || impliedSet.has(scId) || xonImpliedSet.has(scId);
            let dirIdx = 0;
            const nb = baseNeighbors[xon.node]?.find(nb => nb.node === dst);
            if (nb) dirIdx = nb.dirIdx;
            choreoMoves.push({ xon, target: { node: dst, dirIdx, _needsMaterialise: !isActive, _scId: scId } });
        }
        for (const { xon, target } of choreoMoves) _executeOctMove(xon, target);

        // ── Free xons: move within 1-step of center ──
        const center1hop = new Set([center]);
        for (const nb of baseNeighbors[center]) center1hop.add(nb.node);
        for (const sc of _localScNeighbors(center)) center1hop.add(sc.a === center ? sc.b : sc.a);
        const freeXonData = [];
        const takenNodes = new Set(_octEquatorCycle);
        for (let i = 0; i < 6; i++) {
            if (equatorSet.has(xonNodes[i])) continue;
            const xon = _demoXons[i];
            const candidates = baseNeighbors[xon.node].filter(nb =>
                center1hop.has(nb.node) && !takenNodes.has(nb.node) &&
                nb.node !== xon.prevNode
            );
            freeXonData.push({ xon, candidates });
        }
        if (freeXonData.length === 2 && freeXonData[0].candidates.length > 0 && freeXonData[1].candidates.length > 0) {
            let bestPair = null, bestDist = -Infinity;
            for (const c0 of freeXonData[0].candidates) {
                for (const c1 of freeXonData[1].candidates) {
                    if (c0.node === c1.node) continue;
                    const d = Math.hypot(
                        pos[c0.node][0] - pos[c1.node][0],
                        pos[c0.node][1] - pos[c1.node][1],
                        pos[c0.node][2] - pos[c1.node][2]
                    );
                    if (d > bestDist) { bestDist = d; bestPair = [c0, c1]; }
                }
            }
            if (bestPair) {
                _executeOctMove(freeXonData[0].xon, { node: bestPair[0].node, dirIdx: bestPair[0].dirIdx, _needsMaterialise: false, _scId: undefined });
                takenNodes.add(bestPair[0].node);
                _executeOctMove(freeXonData[1].xon, { node: bestPair[1].node, dirIdx: bestPair[1].dirIdx, _needsMaterialise: false, _scId: undefined });
            }
        } else {
            for (const { xon, candidates } of freeXonData) {
                if (candidates.length > 0) {
                    const pick = candidates[0];
                    _executeOctMove(xon, { node: pick.node, dirIdx: pick.dirIdx, _needsMaterialise: false, _scId: undefined });
                    takenNodes.add(pick.node);
                }
            }
        }

        // ── Transition all xons out of oct_formation mode ──
        for (const xon of _demoXons) {
            if (xon._mode !== 'oct_formation') continue;
            if (equatorSet.has(xon.node)) {
                xon._mode = 'oct';
            } else {
                xon._mode = 'weak';
                xon.col = WEAK_FORCE_COLOR;
                if (xon.sparkMat) xon.sparkMat.color.setHex(WEAK_FORCE_COLOR);
            }
        }
    }
}

let _tickInProgress = false; // guard against overlapping async ticks
// ─── Profiling ───
let _tickTotalMs = 0, _tickCount = 0, _tickMaxMs = 0;
let _profPhases = { wb: 0, p0: 0, p05: 0, p1: 0, p2: 0, p3: 0, p3b: 0, p4: 0, p5: 0, solver: 0, cleanup: 0, render: 0, guards: 0 };
async function demoTick() {
    if (!_demoActive || _demoPaused) return;
    if (simHalted) {
        // Tournament: fire callback on halt so GA can score the failed trial
        if (typeof _tournamentTickCheck === 'function') _tournamentTickCheck();
        return;
    }
    if (_tickInProgress) return; // previous async tick still running
    _tickInProgress = true;
    const _tickT0 = performance.now();
    try {

    // ── BACKTRACKING RETRY LOOP ──
    // Save state before tick, run choreography, check guards.
    // If T19/T20 violation → rewind, exclude offending moves, retry.
    _btSaveSnapshot();
    _rewindRequested = false;
    _rewindViolation = null;

    // If we're in an active BFS and this tick is at or near the failure tick,
    // activate backtracking so exclusions and rotations apply during forward replay.
    if (_bfsFailTick >= 0) {
        _btActive = true;
    }

    const _BT_TOTAL_CAP = 500; // absolute cap on retries per demoTick() call
    for (let _btAttempt = 0; _btAttempt < _BT_TOTAL_CAP; _btAttempt++) {
    // Yield to event loop every 8 retries to prevent browser freeze
    if (_btAttempt > 0 && _btAttempt % 8 === 0) await new Promise(r => setTimeout(r, 0));

    // Clear stale movement flags from previous tick so WB processing isn't blocked
    for (const xon of _demoXons) { xon._movedThisTick = false; xon._evictedThisTick = false; }
    _moveRecord.clear(); // T41: clear tick-level move record
    _moveTrace.length = 0; // diagnostic: clear trace for this tick
    // _scAttribution persists across ticks — only cleared on SC deletion

    // Snapshot xon positions BEFORE advancement for live guard T26/T27
    if (typeof _liveGuardSnapshot === 'function') _liveGuardSnapshot();

    let _solverNeeded = false;

    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  UNIFIED DEMAND-DRIVEN CHOREOGRAPHY (no windows)                ║
    // ║                                                                  ║
    // ║  Window boundary block REMOVED. Face assignment is now           ║
    // ║  demand-driven via PHASE 1.5 (natural completion) + PHASE 2a    ║
    // ║  (decentralized face scoring). Loops complete organically.       ║
    // ║                                                                  ║
    // ║  The demo MUST manage tet SCs in xonImpliedSet and              ║
    // ║  re-solve the lattice so spheres physically respond.             ║
    // ║  Shapes drive spheres (unified architecture).                    ║
    // ╚══════════════════════════════════════════════════════════════════╝

    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  XON-VACUUM NEGOTIATION (every tick)                            ║
    // ║                                                                  ║
    // ║  Each xon attempts one hop per tick. Before hopping:             ║
    // ║  1. Check if the traversed edge is a tet SC                     ║
    // ║  2. If so, ask the vacuum: canMaterialiseQuick(scId)            ║
    // ║  3. If blocked, try excitationSeverForRoom(scId)                ║
    // ║  4. If still blocked, xon's move is rejected (vacuum wins)      ║
    // ║  5. If allowed, commit the SC and run the solver                ║
    // ║                                                                  ║
    // ║  The pattern schedule is advisory. The vacuum has final say.     ║
    // ╚══════════════════════════════════════════════════════════════════╝

    _idleTetManifested = false; // reset per-tick; _startIdleTetLoop sets if new SCs added

    // ── GLUON CREATION: Manifest stored xon pairs when there's room ──
    // Conservation: alive + 2*stored = 6. Pairs spawn on free adjacent oct nodes.
    // Only runs when annihilation is enabled (genesis is the reverse of annihilation).
    if (_annihilationEnabled) {
        const aliveCount = _demoXons.filter(x => x.alive).length;
        if (aliveCount < 6 && _gluonStoredPairs > 0) {
            _manifestXonPair();
        }
    }

    // NOTE: _movedThisTick is NOT reset here. WB movements (scatter, _returnXonToOct, _walkToFace)
    // are real moves that count toward the one-hop-per-tick limit. The flag was already cleared
    // at tick start (line above snapshot). Xons moved during WB won't be moved again by the planner.

    let occupied = _occupiedNodes();

    // ── Opening phase: scripted 2-tick formation choreography ──
    let _skipNormalPhases = false;
    let _pT5 = performance.now(); // profiling anchor (updated by PHASE 5 if normal phases run)
    if (_openingPhase) {
        if (_demoTick < 2) {
            _executeOpeningTick(occupied);
            _skipNormalPhases = true;
            _solverNeeded = true;
        } else {
            _openingPhase = false;
        }
    }

    if (!_skipNormalPhases) {
    // ══════════════════════════════════════════════════════════════════
    //  COORDINATED MOVE PLANNER
    //  All moves are planned before execution to prevent Pauli violations.
    //  Priority: tet/idle_tet (fixed path) > oct (flexible).
    // ══════════════════════════════════════════════════════════════════

    const planned = new Set();  // globally reserved destination nodes
    let anyMoved = false;
    const _pT = performance.now(); _profPhases.wb += _pT - _tickT0; // phase timer anchor (wb = window boundary + setup)

    // ── PHASE 0: Pre-check tet/idle_tet xons with blocked next steps ──
    // If a tet/idle_tet xon's next step is blocked by another tet/idle_tet xon
    // (which the oct planner can't move), OR if N-depth lookahead shows the loop
    // leads to a dead end, return the xon to oct mode NOW so PHASE 2's bipartite
    // matching with full lookahead can find it an optimal move.
    {
        let phase0Changed = false;
        for (const xon of _demoXons) {
            if (!xon.alive) continue;
            if (xon._mode !== 'tet' && xon._mode !== 'idle_tet') continue;
            const effectiveStep = xon._loopStep >= 4 ? 0 : xon._loopStep;
            const nextNode = xon._loopSeq[effectiveStep + 1];

            let shouldEvict = false;

            // Check 1: destination blocked by another xon
            // For idle_tet: evict if blocked by ANY xon (idle_tet is expendable).
            // For tet: only evict if blocked by tet/idle_tet (oct planner may vacate).
            if ((occupied.get(nextNode) || 0) > 0) {
                if (xon._mode === 'idle_tet') {
                    shouldEvict = true; // idle_tet is expendable — don't gamble on oct vacating
                } else {
                    const blockerIsTet = _demoXons.some(x => x.alive && x.node === nextNode &&
                        x !== xon && (x._mode === 'tet' || x._mode === 'idle_tet'));
                    if (blockerIsTet) shouldEvict = true;
                }
            }

            // Check 2: Loop-shape-aware lookahead — will this specific loop lead to a dead end?
            // Uses the xon's actual loop sequence (fork, lollipop, ham CW/CCW)
            // instead of generic graph traversal.
            if (!shouldEvict && !(occupied.get(nextNode) || 0)) {
                const tmpOcc = new Map(occupied);
                _occDel(tmpOcc, xon.node);
                _occAdd(tmpOcc, nextNode);
                if (!_lookaheadTetPath(xon._loopSeq, effectiveStep + 1, tmpOcc, _choreoParams.lookahead, xon)) shouldEvict = true;
            }

            if (shouldEvict) {
                _returnXonToOct(xon, occupied);
                xon._evictedThisTick = true; // prevent re-assignment to idle_tet this tick
                phase0Changed = true;
            }
        }
        if (phase0Changed) occupied = _occupiedNodes();
    }
    const _pT0 = performance.now(); _profPhases.p0 += _pT0 - _pT;

    // ── PHASE 0.5: Return weak-force xons toward the oct cage ──
    // Weak xons broke confinement and are loose in the lattice.
    // Each tick they move one hop toward the nearest oct node (BFS).
    // When they reach an oct node, they re-enter oct mode.
    for (const xon of _demoXons) {
        if (!xon.alive || xon._mode !== 'weak') continue;
        // If already at an oct node, re-enter oct mode immediately
        if (_octNodeSet.has(xon.node)) {
            _weakLifecycleExit(xon, 'arrived_oct_immediate');
            xon._mode = 'oct';
            if (_flashEnabled) xon.flashT = 1.0;
            xon.col = 0xffffff;
            if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
            continue;
        }
        // BFS toward nearest oct node — collect ALL first-steps at optimal depth
        // Avoid recent trail nodes to prevent cycling outside oct cage
        const recentTrail = new Set(xon.trail ? xon.trail.slice(-6) : []);
        const visited = new Set([xon.node]);
        const queue = [[xon.node, null, 0]]; // [node, firstStep, depth]
        const bestSteps = []; // all first-steps reaching oct at same depth
        let bestDepth = Infinity;
        while (queue.length > 0) {
            const [cur, step, depth] = queue.shift();
            if (depth > bestDepth) break; // past optimal depth
            const nbs = baseNeighbors[cur] || [];
            for (const nb of nbs) {
                if (visited.has(nb.node)) continue;
                visited.add(nb.node);
                const nextStep = step || nb.node;
                if (_octNodeSet.has(nb.node)) {
                    if (depth + 1 <= bestDepth) {
                        bestDepth = depth + 1;
                        if (!bestSteps.includes(nextStep)) bestSteps.push(nextStep);
                    }
                } else if (depth + 1 < bestDepth) {
                    queue.push([nb.node, nextStep, depth + 1]);
                }
            }
        }
        // Sort: prefer (1) non-trail nodes, (2) non-prevNode, (3) anything
        bestSteps.sort((a, b) => {
            const aInTrail = recentTrail.has(a) ? 1 : 0;
            const bInTrail = recentTrail.has(b) ? 1 : 0;
            if (aInTrail !== bInTrail) return aInTrail - bInTrail;
            const aIsPrev = a === xon.prevNode ? 1 : 0;
            const bIsPrev = b === xon.prevNode ? 1 : 0;
            return aIsPrev - bIsPrev;
        });
        // Try each first-step: first that passes guards + occupancy + swap wins
        let bestStep = null;
        for (const step of bestSteps) {
            if (occupied.get(step) || 0) continue;
            if (_swapBlocked(xon.node, step)) continue;
            if (_moveViolatesGuards(xon, xon.node, step)) continue;
            bestStep = step;
            break;
        }
        if (bestStep !== null) { // T41: no swap already checked above
            const fromWk = xon.node;
            _occDel(occupied, xon.node);
            xon.prevNode = xon.node;
            xon.node = bestStep;
            _occAdd(occupied, bestStep);
            xon._movedThisTick = true; // prevent double-move in PHASE 2
            _moveRecord.set(bestStep, fromWk); // T41: record
            _traceMove(xon, fromWk, bestStep, 'weakBFS');
            _trailPush(xon, bestStep, WEAK_FORCE_COLOR);
            xon.tweenT = 0;
            anyMoved = true;
            _weakLifecycleStep(xon);
            // Check if we arrived at oct node
            if (_octNodeSet.has(bestStep)) {
                _weakLifecycleExit(xon, 'arrived_oct_bfs');
                xon._mode = 'oct';
                if (_flashEnabled) xon.flashT = 1.0;
                xon.col = 0xffffff;
                if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
            }
        } else {
            // All BFS steps blocked — try free neighbor closest to oct cage
            const allNbs = _localBaseNeighbors(xon.node);
            // Tier 1: guard-safe, not in recent trail, not prevNode, closest to oct
            let freeNb = allNbs.find(nb => !(occupied.get(nb.node) || 0) &&
                !recentTrail.has(nb.node) && nb.node !== xon.prevNode &&
                !_swapBlocked(xon.node, nb.node) &&
                !_moveViolatesGuards(xon, xon.node, nb.node));
            // Tier 2: guard-safe, not prevNode, closest to oct
            if (!freeNb) {
                freeNb = allNbs.find(nb => !(occupied.get(nb.node) || 0) &&
                    nb.node !== xon.prevNode &&
                    !_swapBlocked(xon.node, nb.node) &&
                    !_moveViolatesGuards(xon, xon.node, nb.node));
            }
            // Tier 3: guard-safe, allow prevNode, closest to oct
            if (!freeNb) {
                freeNb = allNbs.find(nb => !(occupied.get(nb.node) || 0) &&
                    !_swapBlocked(xon.node, nb.node) &&
                    !_moveViolatesGuards(xon, xon.node, nb.node));
            }
            // No guard bypass — if no guard-safe move exists, xon stays put
            if (freeNb) {
                const fromWk2 = xon.node;
                _occDel(occupied, xon.node);
                xon.prevNode = xon.node;
                xon.node = freeNb.node;
                _occAdd(occupied, freeNb.node);
                xon._movedThisTick = true; // prevent double-move in PHASE 2
                _moveRecord.set(freeNb.node, fromWk2); // T41: record
                _traceMove(xon, fromWk2, freeNb.node, 'weakDetour');
                _trailPush(xon, freeNb.node, WEAK_FORCE_COLOR);
                xon.tweenT = 0;
                anyMoved = true;
                _weakLifecycleStep(xon);
                if (_octNodeSet.has(freeNb.node)) {
                    _weakLifecycleExit(xon, 'arrived_oct_detour');
                    xon._mode = 'oct';
                    if (_flashEnabled) xon.flashT = 1.0;
                    xon.col = 0xffffff;
                    if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
                }
            }
        }
    }
    const _pT05 = performance.now(); _profPhases.p05 += _pT05 - _pT0;

    // ── PHASE 1: Plan tet/idle_tet moves (fixed sequences) ──
    const tetPlans = [];
    const tetBlockedBy = new Map(); // toNode → xon (tet xons blocked by oct occupants)
    for (const xon of _demoXons) {
        if (!xon.alive) continue;
        if (xon._mode !== 'tet' && xon._mode !== 'idle_tet') continue;
        // Wrap completed loops — xons cycle continuously in their tet
        const effectiveStep = xon._loopStep >= 4 ? 0 : xon._loopStep;
        const fromNode = xon._loopSeq[effectiveStep];
        const toNode = xon._loopSeq[effectiveStep + 1];
        tetPlans.push({ xon, fromNode, toNode, approved: false });
    }

    // Approve tet moves to free destinations; track oct-blocked ones
    // Uses loop-shape-aware lookahead: checks the xon's actual loop path, not generic graph
    for (const plan of tetPlans) {
        if (planned.has(plan.toNode)) continue; // another tet already claimed this
        const occCount = occupied.get(plan.toNode) || 0;
        if (occCount === 0) {
            // Loop-shape-aware lookahead: verify the xon's specific loop path is viable
            const tmpOcc = new Map(occupied);
            _occDel(tmpOcc, plan.fromNode);
            _occAdd(tmpOcc, plan.toNode);
            const effectiveStep = plan.xon._loopStep >= 4 ? 0 : plan.xon._loopStep;
            if (_lookaheadTetPath(plan.xon._loopSeq, effectiveStep + 1, tmpOcc, _choreoParams.lookahead, plan.xon)) {
                plan.approved = true;
                planned.add(plan.toNode);
            }
            // If lookahead fails, xon's escape hatch will return it to oct
        } else {
            // Blocked — check if blocker is an oct xon we can ask to move
            const blocker = _demoXons.find(x => x.alive && x._mode === 'oct' && x.node === plan.toNode);
            if (blocker) {
                tetBlockedBy.set(plan.toNode, plan);
                // Tentatively claim — oct planner will be forced to vacate this node
                planned.add(plan.toNode);
                plan.approved = true;
                plan._needsOctVacate = blocker;
            }
            // If blocker is tet/idle_tet (or no oct blocker found), approve as annihilation.
            // The cooperative lookahead treats collisions as annihilation opportunities.
            // Skip when annihilation disabled — xon will escape via PHASE 3 hatch instead.
            if (!plan.approved && _annihilationEnabled) {
                plan.approved = true;
                plan._annihilateMove = true;
                planned.add(plan.toNode);
            }
        }
    }

    // Vacuum negotiation for approved tet moves — hard requirement.
    // If ANY SC exists on this edge and isn't active, it must be materialised.
    // If materialisation fails, the tet xon cannot traverse.
    for (const plan of tetPlans) {
        if (!plan.approved) continue;
        const pid = pairId(plan.fromNode, plan.toNode);
        const scId = scPairToId.get(pid);
        if (scId === undefined) continue; // no SC on this edge, base edge only

        // Check if edge also has a base connection — if so, xon uses base edge, no SC needed
        const hasBaseEdge = (baseNeighbors[plan.fromNode] || []).some(nb => nb.node === plan.toNode);
        if (hasBaseEdge) continue;

        // Edge is SC-only — must be activated
        if (!xonImpliedSet.has(scId) && !activeSet.has(scId) && !impliedSet.has(scId)) {
            let activated = false;
            const xi = _demoXons.indexOf(plan.xon);
            if (canMaterialiseQuick(scId)) {
                xonImpliedSet.add(scId);
                _scAttribution.set(scId, { reason: 'tetTraversal', xonIdx: xi, face: plan.xon._assignedFace, tick: _demoTick });
                stateVersion++; // invalidate _getBasePairs cache for subsequent checks
                _solverNeeded = true;
                activated = true;
            } else if (excitationSeverForRoom(scId)) {
                if (canMaterialiseQuick(scId)) {
                    xonImpliedSet.add(scId);
                    _scAttribution.set(scId, { reason: 'tetTraversal', xonIdx: xi, face: plan.xon._assignedFace, tick: _demoTick });
                    stateVersion++; // invalidate _getBasePairs cache
                    _solverNeeded = true;
                    activated = true;
                }
            }
            if (!activated) {
                // Vacuum rejected — revoke tet move
                plan.approved = false;
                planned.delete(plan.toNode);
            }
        }
    }

    const _pT1 = performance.now(); _profPhases.p1 += _pT1 - _pT05;

    // ── PHASE 1.5: Natural loop completion — return xons that finished their loops ──
    // Replaces forced window-boundary returns. Loops complete organically at step >= 4.
    {
        const locked15 = _traversalLockedSCs();
        for (const xon of _demoXons) {
            if (!xon.alive) continue;
            if (xon._mode !== 'tet' && xon._mode !== 'idle_tet') continue;
            if (xon._loopStep < 4) continue; // still mid-loop — let it finish
            // Loop complete — return to oct
            _returnXonToOct(xon, occupied);
            // Relinquish face SCs that are no longer needed (respects traversal lock)
            if (xon._assignedFace != null) {
                const fd = _nucleusTetFaceData[xon._assignedFace];
                if (fd) {
                    for (const scId of fd.scIds) {
                        if (locked15.has(scId)) continue;
                        if (xonImpliedSet.delete(scId)) {
                            _scAttribution.delete(scId);
                            _solverNeeded = true;
                            stateVersion++;
                        }
                    }
                }
            }
        }
        occupied = _occupiedNodes(); // refresh after returns
    }

    // ── PHASE 2a: Demand-driven face selection (decentralized, no order precedence) ──
    // Each oct xon scores ALL reachable faces independently. Conflicts resolved by
    // random shuffling — no xon gets order-precedence over another.
    {
        _ratioTracker.sync();
        const octIdle = _demoXons.filter(x => x.alive && x._mode === 'oct' && !x._movedThisTick && !x._evictedThisTick);

        if (octIdle.length > 0 && _nucleusTetFaceData) {
            // Each xon independently scores all faces
            const proposals = []; // {xon, face, quarkType, score, onFace}
            for (const xon of octIdle) {
                let bestOpp = null;
                for (let f = 1; f <= 8; f++) {
                    const opp = _scoreFaceOpportunity(xon, f, occupied);
                    if (opp && opp.score >= _choreoParams.assignmentThreshold) {
                        if (!bestOpp || opp.score > bestOpp.score) bestOpp = { xon, ...opp };
                    }
                }
                if (bestOpp) proposals.push(bestOpp);
            }

            // Shuffle proposals — no xon gets priority by index order
            for (let i = proposals.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [proposals[i], proposals[j]] = [proposals[j], proposals[i]];
            }

            // Resolve conflicts: one xon per face, first-after-shuffle wins
            const assignedXons = new Set();
            const assignedFaces = new Set();
            for (const prop of proposals) {
                if (assignedXons.has(prop.xon)) continue;
                if (assignedFaces.has(prop.face)) continue;

                // Anti-dogpile: skip if face is getting crowded
                const faceTargets = proposals.filter(p => p.face === prop.face).length;
                const adjustedScore = prop.score * Math.pow(_choreoParams.antiDogpileDecay, faceTargets - 1);
                if (adjustedScore < _choreoParams.assignmentThreshold) continue;

                // Vacuum feasibility: can we materialize the face SCs?
                const fd = _nucleusTetFaceData[prop.face];
                let canMaterialize = true;
                for (const scId of fd.scIds) {
                    if (activeSet.has(scId) || impliedSet.has(scId) || xonImpliedSet.has(scId)) continue;
                    if (!canMaterialiseQuick(scId)) {
                        if (!excitationSeverForRoom(scId) || !canMaterialiseQuick(scId)) {
                            canMaterialize = false;
                            break;
                        }
                    }
                }
                if (!canMaterialize) continue;

                // Lookahead viability: can the loop complete?
                const seq = LOOP_SEQUENCES[prop.quarkType](fd.cycle);
                const tmpOcc = new Map(occupied);
                if (!_lookaheadTetPath(seq, 0, tmpOcc, _choreoParams.lookahead, prop.xon)) continue;

                // ASSIGN — decentralized decision accepted by the system
                _assignXonToTet(prop.xon, prop.face, prop.quarkType);
                _demoTetAssignments++;
                assignedXons.add(prop.xon);
                assignedFaces.add(prop.face);
                _demoVisitedFaces.add(prop.face);
                _solverNeeded = true;
            }
        }
        occupied = _occupiedNodes(); // refresh after assignments
    }

    // ── PHASE 2: Coordinated oct movement planning ──
    let octXons = [];
    let octPlans = [];
    {
    octXons = _demoXons.filter(x => x.alive && (x._mode === 'oct' || x._mode === 'weak') && !x._movedThisTick);
    for (const xon of octXons) _occDel(occupied, xon.node);

    octPlans = octXons.map(xon => ({
        xon,
        candidates: _getOctCandidates(xon, occupied, planned),
        assigned: null,
        fromNode: xon.node,
    }));

    // Restore occupied for later use
    for (const xon of octXons) _occAdd(occupied, xon.node);

    // Pre-filter candidates: remove those where vacuum would definitely reject.
    // EXCEPTION: oct cage SCs bypass this filter — they use full vacuum negotiation
    // (including excitationSeverForRoom) in _executeOctMove, which the quick check
    // doesn't account for. Without this exception, cumulative strain from the first
    // 3 cage SCs can permanently block the 4th from ever being attempted.
    //
    // GPU/Worker acceleration: batch all canMaterialiseQuick calls into one Worker
    // round-trip when available. Falls back to synchronous main-thread solver.
    let _batchResults = null; // Map<scId, {pass, worst, avg}>
    if (typeof SolverProxy !== 'undefined' && SolverProxy.isReady()) {
        // Collect unique SC IDs needing materialisation check
        // Pre-filter: skip grossly non-local SC edges (saves solver calls)
        const candidateScIds = new Set();
        for (const plan of octPlans) {
            for (const c of plan.candidates) {
                if (!c._needsMaterialise) continue;
                if (c._scId === undefined) continue;
                if (_octSCIds && _octSCIds.includes(c._scId)) continue;
                // Distance pre-filter: reject obviously non-local SC candidates (d > 1.5)
                const sc = SC_BY_ID[c._scId];
                if (sc) {
                    const pa = pos[sc.a], pb = pos[sc.b];
                    const dx = pb[0]-pa[0], dy = pb[1]-pa[1], dz = pb[2]-pa[2];
                    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    if (Math.abs(dist - 1) > 0.50) continue; // teleportation-range, skip solver
                }
                candidateScIds.add(c._scId);
            }
        }
        if (candidateScIds.size > 0) {
            const candidateScIdArray = [...candidateScIds];
            // Only use Worker batch when enough candidates to amortize round-trip.
            // Worker overhead is ~50ms for postMessage round-trip; CPU CMQ is ~12ms each.
            // Break-even: ~4 candidates. Below that, CPU is faster.
            const MIN_BATCH_SIZE = 5;
            if (candidateScIdArray.length >= MIN_BATCH_SIZE) {
                const basePairs = _getBasePairs();
                const candidateScPairs = candidateScIdArray.map(id => { const sc = SC_BY_ID[id]; return [sc.a, sc.b]; });
                const _batchT0 = performance.now();
                const results = await SolverProxy.solveBatch(basePairs, candidateScPairs);
                _profPhases.gpuBatch = (_profPhases.gpuBatch || 0) + (performance.now() - _batchT0);
                if (results) {
                    _batchResults = new Map();
                    for (let i = 0; i < candidateScIdArray.length; i++) {
                        _batchResults.set(candidateScIdArray[i], results[i]);
                    }
                    SolverProxy.cacheBatchResults(candidateScIdArray, results, stateVersion);
                }
            } else {
                // Small batch: run CMQ on CPU inline (faster than Worker round-trip)
                _batchResults = new Map();
                for (const scId of candidateScIdArray) {
                    _batchResults.set(scId, { pass: canMaterialiseQuick(scId) });
                }
            }
        }
    }
    for (const plan of octPlans) {
        plan.candidates = plan.candidates.filter(c => {
            if (!c._needsMaterialise) return true; // base edge or already active SC
            if (c._scId === undefined) return true;
            // Oct cage SCs get full vacuum negotiation in _executeOctMove
            if (_octSCIds && _octSCIds.includes(c._scId)) return true;
            // Distance pre-filter: reject grossly non-local before hitting solver
            const sc = SC_BY_ID[c._scId];
            if (sc) {
                const pa = pos[sc.a], pb = pos[sc.b];
                const dx = pb[0]-pa[0], dy = pb[1]-pa[1], dz = pb[2]-pa[2];
                if (Math.abs(Math.sqrt(dx*dx + dy*dy + dz*dz) - 1) > 0.50) return false;
            }
            // Use batch results if available, otherwise fall back to sync
            if (_batchResults && _batchResults.has(c._scId)) {
                return _batchResults.get(c._scId).pass;
            }
            return canMaterialiseQuick(c._scId); // fallback: sync main-thread solver
        });
    }

    // ── BACKTRACK EXCLUSION FILTER: remove moves that caused violations on previous attempts ──
    if (_btActive) {
        for (const plan of octPlans) {
            const xonIdx = _demoXons.indexOf(plan.xon);
            plan.candidates = plan.candidates.filter(c => !_btIsMoveExcluded(xonIdx, c.node));
        }
    }

    // ── T55 CAPACITY ENFORCEMENT: eject excess oct xons before matching ──
    // When oct count > capacity (from hadronic ratio), forcibly route excess xons
    // into idle_tet BEFORE bipartite matching. Lowest-scored xons ejected first.
    // Fallback: eject as weak particle if no tet face available.
    // Note: _demoTick hasn't been incremented yet (happens after PHASE 5).
    // T55 check fires at tick >= 16 (post-increment), so we activate at >= 15 (pre-increment).
    if (_demoTick >= 15 && typeof _computeOctCapacity === 'function') {
        const cap = _computeOctCapacity();
        const octOnlyPlans = octPlans.filter(p => p.xon._mode === 'oct');
        const excess = octOnlyPlans.length - cap;
        if (excess > 0) {
            // Sort by score ascending — lowest score = best eject candidate
            const ranked = octOnlyPlans.slice().sort((a, b) => {
                const aScore = a.candidates.length > 0 ? Math.max(...a.candidates.map(c => c.score)) : -Infinity;
                const bScore = b.candidates.length > 0 ? Math.max(...b.candidates.map(c => c.score)) : -Infinity;
                return aScore - bScore;
            });
            // Build blocked set for idle_tet planning
            const ejectBlocked = new Map(occupied);
            for (const n of planned) _occAdd(ejectBlocked, n);
            let ejected = 0;
            for (const plan of ranked) {
                if (ejected >= excess) break;
                if (plan.xon._evictedThisTick) continue;
                let ejectedThis = false;
                // Strategy 1: idle_tet (productive — manifests a hadron)
                if (_startIdleTetLoop(plan.xon, ejectBlocked)) {
                    const dest = plan.xon._loopSeq ? plan.xon._loopSeq[plan.xon._loopStep + 1] : null;
                    if (dest !== undefined && !(ejectBlocked.get(dest) || 0)) {
                        plan.idleTet = true;
                        plan.assigned = null;
                        plan.candidates = []; // remove from bipartite matching
                        _occAdd(ejectBlocked, dest);
                        ejectedThis = true;
                        _logChoreo(`T55 eject x${_demoXons.indexOf(plan.xon)} → idle_tet (cap=${cap})`);
                    } else {
                        // Rollback — couldn't advance
                        _relinquishFaceSCs(plan.xon);
                        plan.xon._mode = 'oct';
                        plan.xon._loopSeq = null;
                        plan.xon._loopStep = 0;
                        plan.xon._assignedFace = null;
                        plan.xon.col = 0xffffff;
                        if (plan.xon.sparkMat) plan.xon.sparkMat.color.setHex(0xffffff);
                    }
                }
                // Strategy 2: eject as weak particle (safety valve)
                if (!ejectedThis) {
                    const nbs = _localBaseNeighbors(plan.xon.node);
                    const freeNb = nbs.find(nb =>
                        !(ejectBlocked.get(nb.node) || 0) &&
                        nb.node !== plan.xon.prevNode
                    );
                    if (freeNb) {
                        plan.xon._mode = 'weak';
                        plan.xon.col = typeof WEAK_FORCE_COLOR !== 'undefined' ? WEAK_FORCE_COLOR : 0x8844ff;
                        if (plan.xon.sparkMat) plan.xon.sparkMat.color.setHex(plan.xon.col);
                        plan.assigned = { node: freeNb.node, dirIdx: freeNb.dirIdx, _needsMaterialise: false, _scId: undefined };
                        plan.candidates = [];
                        _occAdd(ejectBlocked, freeNb.node);
                        ejectedThis = true;
                        _logChoreo(`T55 eject x${_demoXons.indexOf(plan.xon)} → weak (cap=${cap})`);
                    }
                }
                if (ejectedThis) ejected++;
            }
        }
    }

    // ── BFS BACKTRACK: systematic candidate rotation ──
    // During retries, rotate each xon's candidate list so Kuhn's algorithm
    // produces genuinely different matchings on each attempt.
    // The effective seed combines retryCount + BFS layer * MAX_RETRIES so that
    // layer escalation produces different rotations even when retryCount resets to 0.
    if (_btActive) {
        const effectiveSeed = _btRetryCount + _bfsLayer * _BT_MAX_RETRIES + _bfsLayerRetries;
        if (effectiveSeed > 0) {
            for (let i = 0; i < octPlans.length; i++) {
                const cands = octPlans[i].candidates;
                if (cands.length <= 1) continue;
                // Each xon gets a different rotation based on seed.
                // Stagger per xon so we explore the Cartesian product.
                const shift = Math.floor(effectiveSeed / Math.max(1, i + 1)) % cands.length;
                if (shift > 0) {
                    octPlans[i].candidates = [...cands.slice(shift), ...cands.slice(0, shift)];
                }
            }
        }
    }

    // Maximum bipartite matching with arbitrary-depth backtracking (Kuhn's algorithm).
    // Finds augmenting paths so the maximum number of oct xons get a valid destination.
    _maxBipartiteAssignment(octPlans, planned);
    const octClaimed = new Set();
    for (const plan of octPlans) {
        if (plan.assigned) octClaimed.add(plan.assigned.node);
    }

    // Verify needsOctVacate: if an oct xon was supposed to move but couldn't,
    // convert to annihilation move (lookahead treats collisions as valid terminal states).
    for (const plan of tetPlans) {
        if (!plan._needsOctVacate) continue;
        const blocker = plan._needsOctVacate;
        const octPlan = octPlans.find(p => p.xon === blocker);
        if (!octPlan || !octPlan.assigned) {
            if (_annihilationEnabled) {
                // Oct xon couldn't move — approve as annihilation instead of revoking.
                // PHASE 4 will resolve the on-node collision via gluon storage.
                plan._annihilateMove = true;
            } else {
                // Annihilation disabled — revoke this plan so escape hatch handles it.
                plan.approved = false;
                planned.delete(plan.toNode);
            }
        }
    }

    // Build a combined blocked set for idle_tet planning
    const allBlocked = new Map(occupied);
    for (const n of planned) _occAdd(allBlocked, n);
    for (const n of octClaimed) _occAdd(allBlocked, n);
    for (const plan of octPlans) {
        if (plan.assigned) _occDel(allBlocked, plan.fromNode);
    }

    // ── COLLISION AVOIDANCE: hierarchical strategy for unassigned xons ──
    // 1. Divert into unscheduled tet (productive work — manifest a hadron)
    // 2. If no tet available, eject as weak particle (safety valve)
    // This replaces the old congestion-relief / bounce-escape / idle_tet fallbacks
    // with a single unified pass.
    for (const plan of octPlans) {
        if (plan.assigned || plan.idleTet) continue;
        if (plan.xon._evictedThisTick) continue;

        // ── Strategy 1: Divert into tet ──
        // Try _startIdleTetLoop first (uses Pauli-aware face selection)
        const _savedMode = plan.xon._mode;
        const _savedCol = plan.xon.col;
        let diverted = false;
        if (_startIdleTetLoop(plan.xon, allBlocked)) {
            const dest = plan.xon._loopSeq[plan.xon._loopStep + 1];
            const tmpCheck = new Map(allBlocked); _occAdd(tmpCheck, dest);
            if (dest !== undefined && !allBlocked.has(dest) && _lookaheadTetPath(plan.xon._loopSeq, 1, tmpCheck, _choreoParams.lookahead, plan.xon)) {
                plan.idleTet = true;
                _occAdd(allBlocked, dest);
                diverted = true;
                _logChoreo(`X${_demoXons.indexOf(plan.xon)} collision->tet f${plan.xon._assignedFace}`);
            } else {
                // Rollback tet attempt
                _relinquishFaceSCs(plan.xon);
                plan.xon._mode = _savedMode;
                if (_flashEnabled) plan.xon.flashT = 1.0;
                plan.xon._loopSeq = null;
                plan.xon._loopStep = 0;
                plan.xon._assignedFace = null;
                plan.xon.col = _savedCol;
                if (plan.xon.sparkMat) plan.xon.sparkMat.color.setHex(_savedCol);
            }
        }

        // ── Strategy 1b: Direct face assignment (broader search) ──
        if (!diverted && _nucleusTetFaceData) {
            const bestFaces = [];
            for (let f = 1; f <= 8; f++) {
                const opp = _scoreFaceOpportunity(plan.xon, f, occupied);
                if (opp) bestFaces.push(opp);
            }
            bestFaces.sort((a, b) => b.score - a.score);
            for (const opp of bestFaces) {
                const fd = _nucleusTetFaceData[opp.face];
                let canMaterialize = true;
                for (const scId of fd.scIds) {
                    if (activeSet.has(scId) || impliedSet.has(scId) || xonImpliedSet.has(scId)) continue;
                    if (!canMaterialiseQuick(scId)) {
                        if (!excitationSeverForRoom(scId) || !canMaterialiseQuick(scId)) {
                            canMaterialize = false;
                            break;
                        }
                    }
                }
                if (!canMaterialize) continue;
                const seq = LOOP_SEQUENCES[opp.quarkType](fd.cycle);
                const tmpOcc = new Map(allBlocked);
                if (!_lookaheadTetPath(seq, 0, tmpOcc, _choreoParams.lookahead, plan.xon)) continue;
                _assignXonToTet(plan.xon, opp.face, opp.quarkType);
                _demoTetAssignments++;
                _demoVisitedFaces.add(opp.face);
                _solverNeeded = true;
                plan.idleTet = true;
                _occAdd(allBlocked, plan.xon.node);
                diverted = true;
                _logChoreo(`X${_demoXons.indexOf(plan.xon)} collision->tet f${opp.face} (direct)`);
                break;
            }
        }

        // ── Strategy 2: Eject as weak particle ──
        if (!diverted) {
            plan.xon._mode = 'weak';
            plan.xon.col = WEAK_FORCE_COLOR;
            if (plan.xon.sparkMat) plan.xon.sparkMat.color.setHex(WEAK_FORCE_COLOR);
            // Weak xons can only move to nucleus nodes
            const nbs = _localBaseNeighbors(plan.xon.node);
            let escaped = false;
            for (const nb of nbs) {
                if (allBlocked.has(nb.node)) continue;
                if (planned.has(nb.node)) continue;
                if (octClaimed.has(nb.node)) continue;
                plan.assigned = { node: nb.node, dirIdx: nb.dirIdx, score: -999, _needsMaterialise: false, _scId: undefined };
                octClaimed.add(nb.node);
                _occAdd(allBlocked, nb.node);
                escaped = true;
                _logChoreo(`X${_demoXons.indexOf(plan.xon)} collision->weak n${nb.node}`);
                break;
            }
            if (!escaped) {
                _logChoreo(`X${_demoXons.indexOf(plan.xon)} STUCK: no tet, no weak escape`);
            }
        }
    }
    occupied = _occupiedNodes(); // refresh after diversions

    // If idle_tet manifestation added new SCs, flag solver
    if (_idleTetManifested) _solverNeeded = true;

    // Log PHASE 2 decisions for debugging
    _logPhase2Summary(octPlans);

    // ── COOPERATIVE 2-STEP AWARENESS VERIFICATION ──
    // Project where ALL xons will be after their 1st moves (neighbors' choices).
    // Verify each xon has a valid 2nd move in that projected state.
    // Iteratively fix conflicts until all xons are 2-step aware.
    for (let verifyIter = 0; verifyIter < 6; verifyIter++) {
        const stuckXons = _verifyPlan(tetPlans, octPlans);
        if (stuckXons.length === 0) break; // all xons 2-step aware

        for (const { xon, futureNode, tetPlan, octPlan } of stuckXons) {
            // Strategy A: Stuck tet/idle_tet xon → revoke plan only.
            // Do NOT move the xon here — PHASE 3's escape hatch will handle
            // the actual movement with proper Pauli safety checks.
            // Exception: annihilation moves are never revoked — they resolve via PHASE 4.
            if (tetPlan && tetPlan.approved && !tetPlan._annihilateMove) {
                tetPlan.approved = false;
                planned.delete(tetPlan.toNode);
                continue;
            }

            // Strategy B: Stuck oct xon → try revoking a blocking tet plan
            if (xon._mode === 'oct') {
                const nbs = baseNeighbors[futureNode] || [];
                let rescued = false;
                for (const nb of nbs) {
                    if (!_octNodeSet.has(nb.node)) continue;
                    const blockingTet = tetPlans.find(tp => tp.toNode === nb.node && tp.approved);
                    if (blockingTet) {
                        blockingTet.approved = false;
                        planned.delete(nb.node);
                        if (octPlan) {
                            octPlan.assigned = { node: nb.node, dirIdx: 0, score: -1, _scId: undefined, _needsMaterialise: false };
                            octClaimed.add(nb.node);
                        }
                        rescued = true;
                        break;
                    }
                }

                // Strategy C: Try idle_tet for the stuck oct xon
                if (!rescued && octPlan && !octPlan.idleTet) {
                    if (_startIdleTetLoop(xon, allBlocked)) {
                        const dest = xon._loopSeq[xon._loopStep + 1];
                        if (dest !== undefined && !(allBlocked.get(dest) || 0)) {
                            octPlan.idleTet = true;
                            octPlan.assigned = null;
                            _occAdd(allBlocked, dest);
                        } else {
                            _relinquishFaceSCs(xon); // T42: cleanup
                            xon._mode = 'oct';
                            if (_flashEnabled) xon.flashT = 1.0;
                            xon._loopSeq = null;
                            xon._loopStep = 0;
                            xon._assignedFace = null;
                            xon.col = 0xffffff;
                            if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
                        }
                    }
                }

                // Strategy D: Try swapping oct assignment to a different candidate
                if (!rescued && octPlan && octPlan.assigned) {
                    const altCandidates = _getOctCandidates(xon, occupied, planned);
                    for (const alt of altCandidates) {
                        if (alt.node === octPlan.assigned.node) continue;
                        if (octClaimed.has(alt.node)) continue;
                        // Check 2-step awareness for this alternative in projected state
                        const tmpProj = _projectOccupation(tetPlans, octPlans);
                        _occDel(tmpProj, octPlan.assigned.node);
                        _occAdd(tmpProj, alt.node);
                        _occDel(tmpProj, alt.node); // remove self for check
                        if (_lookahead(alt.node, tmpProj, 1)) {
                            octClaimed.delete(octPlan.assigned.node);
                            octPlan.assigned = alt;
                            octClaimed.add(alt.node);
                            rescued = true;
                            break;
                        }
                    }
                }

                // Strategy E: Revoke oct assignment entirely — staying put might
                // be better than moving to a dead end. The projected state after
                // others move may free up the current position's neighbors.
                if (!rescued && octPlan && octPlan.assigned) {
                    const projected = _projectOccupation(tetPlans, octPlans);
                    // Check if staying put (with others moving away) gives valid 2nd move
                    _occDel(projected, octPlan.assigned.node);
                    _occAdd(projected, xon.node);
                    _occDel(projected, xon.node); // remove self
                    if (_lookahead(xon.node, projected, 1)) {
                        octClaimed.delete(octPlan.assigned.node);
                        octPlan.assigned = null; // stay put — others will vacate
                        rescued = true;
                    }
                }
            }
        }
    }

    } // end PHASE 2 block
    const _pT2 = performance.now(); _profPhases.p2 += _pT2 - _pT1;

    // ── PHASE 3: Execute all planned moves ──
    // Oct moves execute FIRST (to vacate nodes for tet xons).
    // If an oct move fails (vacuum rejection), revoke dependent tet approvals.

    // Build reverse map: oct xon → tet plan that depends on it vacating
    const octToTetDep = new Map(); // oct xon → tet plan
    for (const plan of tetPlans) {
        if (plan._needsOctVacate) octToTetDep.set(plan._needsOctVacate, plan);
    }

    // Execute oct moves first (includes idle_tet advances)
    for (const plan of octPlans) {
        if (plan.assigned) {
            if (plan.xon._movedThisTick) continue; // already moved (WB scatter/return) — one hop per tick
            const target = plan.assigned;
            const fromNode = plan.xon.node;
            // T41 swap check: reject if another xon just moved FROM target.node TO fromNode
            if (_swapBlocked(fromNode, target.node)) {
                const depTet = octToTetDep.get(plan.xon);
                if (depTet) { depTet.approved = false; planned.delete(depTet.toNode); }
                continue;
            }
            _occDel(occupied, plan.xon.node);
            const ok = _executeOctMove(plan.xon, target);
            if (!ok) {
                // Vacuum rejected at execution time — xon stays put
                // Revoke any tet move that depended on this xon vacating
                const depTet = octToTetDep.get(plan.xon);
                if (depTet) {
                    depTet.approved = false;
                    planned.delete(depTet.toNode);
                }
            } else {
                anyMoved = true;
                _moveRecord.set(plan.xon.node, fromNode); // T41: record dest→origin
                _traceMove(plan.xon, fromNode, plan.xon.node, 'p3oct');

                if (plan.xon._solverNeeded) {
                    _solverNeeded = true;
                    plan.xon._solverNeeded = false;
                }
            }
            _occAdd(occupied, plan.xon.node);
        } else if (plan.idleTet) {
            // Verify SC is still active (may have been severed by oct move negotiation)
            if (!_canAdvanceSafely(plan.xon)) {
                _returnXonToOct(plan.xon, occupied); // abort idle_tet — SC was deactivated
                plan.xon._evictedThisTick = true;    // safety eviction (T52 exempt)
                continue;
            }
            // Pauli check: destination may have become occupied since planning
            const effectiveStep = plan.xon._loopStep >= 4 ? 0 : plan.xon._loopStep;
            const idleDest = plan.xon._loopSeq[effectiveStep + 1];
            if (idleDest !== undefined && (occupied.get(idleDest) || 0) > 0) {
                _returnXonToOct(plan.xon, occupied); // destination occupied — return to oct
                plan.xon._evictedThisTick = true;    // safety eviction (T52 exempt)
                continue;
            }
            // T41 swap check: reject if another xon just moved FROM idleDest TO xon.node
            if (idleDest !== undefined && _swapBlocked(plan.xon.node, idleDest)) {
                _returnXonToOct(plan.xon, occupied); // would swap — return to oct
                plan.xon._evictedThisTick = true;    // safety eviction (T52 exempt)
                continue;
            }
            const fromNode = plan.xon.node;
            _occDel(occupied, plan.xon.node);
            _advanceXon(plan.xon);
            _occAdd(occupied, plan.xon.node);
            _moveRecord.set(plan.xon.node, fromNode); // T41: record idle_tet move
            _traceMove(plan.xon, fromNode, plan.xon.node, 'p3idle');

            anyMoved = true;
        }
    }

    // Then execute approved tet moves (nodes should now be vacated)
    for (const plan of tetPlans) {
        if (!plan.approved) continue;
        // Final Pauli safety check before executing
        if ((occupied.get(plan.toNode) || 0) > 0) {
            if (!plan._annihilateMove) continue; // destination still occupied — skip to prevent collision
            // Annihilation move: allow advance into occupied node ONLY if occupant is non-weak.
            // Weak xons are protected from non-local annihilation (T38).
            const occupant = _demoXons.find(x => x.alive && x.node === plan.toNode && x !== plan.xon);
            if (occupant && occupant._mode === 'weak') continue; // don't collide with returning weak xon
        }
        // T41 swap check: reject if any xon just moved FROM plan.toNode TO plan.xon.node
        if (_swapBlocked(plan.xon.node, plan.toNode)) continue;
        // Verify SC is still active (may have been severed by oct move negotiation)
        if (!_canAdvanceSafely(plan.xon)) continue;
        const tetFrom = plan.xon.node;
        _advanceXon(plan.xon);
        _occDel(occupied, plan.xon.prevNode);
        _occAdd(occupied, plan.xon.node);
        _moveRecord.set(plan.xon.node, tetFrom); // T41: record tet move
        _traceMove(plan.xon, tetFrom, plan.xon.node, 'p3tet');

        anyMoved = true;
    }

    // Escape hatch: tet/idle_tet xons that didn't advance (vacuum rejection,
    // Pauli block, or SC deactivation). Try to move to a free oct neighbor and
    // return to oct mode. Mode change satisfies T20.
    for (const plan of tetPlans) {
        const xon = plan.xon;
        // Skip xons that actually moved
        if (xon.node !== plan.fromNode) continue;
        if (!xon.alive || xon._movedThisTick) continue;
        if (xon._mode !== 'tet' && xon._mode !== 'idle_tet') continue;

        const nbs = _localBaseNeighbors(xon.node);

        // Priority 1: move to a 2-step-aware free oct neighbor → return to oct mode
        // ONLY destinations with valid 2nd moves are considered.
        let escaped = false;
        const freeOctNbs = nbs
            .filter(nb => {
                if (!_octNodeSet.has(nb.node)) return false;
                if (occupied.get(nb.node) || 0) return false;
                if (_swapBlocked(xon.node, nb.node)) return false; // T41: no swap
                // 2-step awareness: MUST have a valid 2nd move from this destination
                const tmp = new Map(occupied); _occAdd(tmp, nb.node);
                return _lookahead(nb.node, tmp, 1);
            });
        for (const nb of freeOctNbs) {
            // T45: anti-bounce — don't go back to prevNode (gated by flag)
            if (_T45_BOUNCE_GUARD && nb.node === xon.prevNode && xon.prevNode !== xon.node) continue;
            const fromRet = xon.node;
            _occDel(occupied, xon.node);
            xon.prevNode = xon.node;
            xon.node = nb.node;
            _occAdd(occupied, nb.node);
            _moveRecord.set(nb.node, fromRet); // T41: record
            _traceMove(xon, fromRet, nb.node, 'escHatch');

            _trailPush(xon, nb.node, 0xffffff);
            xon.tweenT = 0;
            _relinquishFaceSCs(xon); // T42: cleanup before clearing face
            xon._mode = 'oct';
            xon._evictedThisTick = true; // safety escape (T52 exempt)
            if (_flashEnabled) xon.flashT = 1.0;
            xon._assignedFace = null;
            xon._quarkType = null;
            xon._loopType = null;
            xon._loopSeq = null;
            xon._loopStep = 0;
            xon.col = 0xffffff;
            if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
            escaped = true;
            anyMoved = true;
            break;
        }
        if (escaped) continue;

        // Priority 2: already at an oct node but all oct neighbors occupied.
        // Mode change alone satisfies T20 (tet→oct).
        if (_octNodeSet.has(xon.node)) {
            _relinquishFaceSCs(xon); // T42: cleanup before clearing face
            xon._mode = 'oct';
            xon._evictedThisTick = true; // safety escape (T52 exempt)
            if (_flashEnabled) xon.flashT = 1.0;
            xon._assignedFace = null;
            xon._quarkType = null;
            xon._loopType = null;
            xon._loopSeq = null;
            xon._loopStep = 0;
            xon.col = 0xffffff;
            if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
            continue;
        }

        // Priority 3: at non-oct node (ext node), no free oct neighbor.
        // Restart an idle_tet loop on a face containing this node.
        // The new loop gives the xon a viable path; mode change (tet→idle_tet) satisfies T20.
        let p3ok = false;
        if (_startIdleTetLoop(xon, occupied)) {
            const dest = xon._loopSeq ? xon._loopSeq[xon._loopStep + 1] : null;
            if (dest !== undefined && !(occupied.get(dest) || 0) &&
                !_swapBlocked(xon.node, dest) && // T41: no swap
                _canAdvanceSafely(xon)) {
                const fromP3 = xon.node;
                _advanceXon(xon);
                _occDel(occupied, xon.prevNode);
                _occAdd(occupied, xon.node);
                _moveRecord.set(xon.node, fromP3); // T41: record
                _traceMove(xon, fromP3, xon.node, 'p3retry');

                anyMoved = true;
                p3ok = true;
            }
        }
        if (p3ok) continue;

        // Priority 4: WEAK FORCE ESCAPE — shoot off in a random direction.
        // When a xon is truly stuck (all oct/tet options exhausted), it can
        // escape along ANY connected edge, even one not enclosed by a tet or oct.
        // This corresponds to the weak force: a last-resort confinement break.
        // The xon enters 'weak' mode — a distinct state outside normal confinement.
        let weakEscaped = false;
        {
            // ALL projected guards — no bypass allowed
            let freeNbs = nbs.filter(nb => !(occupied.get(nb.node) || 0) &&
                !_swapBlocked(xon.node, nb.node) &&
                !_moveViolatesGuards(xon, xon.node, nb.node));
            // Prefer non-prevNode to avoid bounce
            const nonBounce = freeNbs.filter(nb => nb.node !== xon.prevNode);
            if (nonBounce.length > 0) freeNbs = nonBounce;
            if (freeNbs.length > 0) {
                const nb = freeNbs[0]; // closest to oct cage
                const fromWe = xon.node;
                _occDel(occupied, xon.node);
                xon.prevNode = xon.node;
                xon.node = nb.node;
                xon._movedThisTick = true; // prevent double-move
                _occAdd(occupied, nb.node);
                _moveRecord.set(nb.node, fromWe); // T41: record
                _traceMove(xon, fromWe, nb.node, 'weakEsc');
                _trailPush(xon, nb.node, WEAK_FORCE_COLOR);
                xon.tweenT = 0;
                _relinquishFaceSCs(xon); // T42: cleanup before clearing face
                xon._mode = 'weak';
                if (_flashEnabled) xon.flashT = 1.0;
                xon._assignedFace = null;
                xon._quarkType = null;
                xon._loopType = null;
                xon._loopSeq = null;
                xon._loopStep = 0;
                xon.col = WEAK_FORCE_COLOR;
                if (xon.sparkMat) xon.sparkMat.color.setHex(WEAK_FORCE_COLOR);
                anyMoved = true;
                weakEscaped = true;
                _weakLifecycleEnter(xon, 'tet_stuck');
            }
        }
        if (weakEscaped) continue;

        // Priority 5: INTENTIONAL ANNIHILATION — move to an occupied neighbor.
        // Two xons at the same node annihilate in PHASE 4 (gluon storage).
        // This resolves the traffic jam by reducing xon count temporarily.
        // Trail uses quark color (xon is still a fermion during this move).
        for (const nb of nbs) {
            if (_swapBlocked(xon.node, nb.node)) continue; // T41: no swap
            const occupant = _demoXons.find(x =>
                x.alive && x !== xon && x.node === nb.node);
            if (occupant) {
                const fromAn = xon.node;
                const prevCol = xon.col; // preserve quark color for trail
                _occDel(occupied, xon.node);
                xon.prevNode = xon.node;
                xon.node = nb.node;
                _moveRecord.set(nb.node, fromAn); // T41: record
                _traceMove(xon, fromAn, nb.node, 'anniScatter');
                _trailPush(xon, nb.node, prevCol); // quark color, NOT white
                xon.tweenT = 0;
                // Don't _occAdd — PHASE 4 will handle the collision
                _relinquishFaceSCs(xon); // T42: cleanup before clearing face
                xon._mode = 'oct'; // switch to oct so PHASE 4 scatter/annihilate catches it
                xon._evictedThisTick = true; // safety eviction (T52 exempt)
                if (_flashEnabled) xon.flashT = 1.0;
                xon._assignedFace = null;
                xon._quarkType = null;
                xon._loopType = null;
                xon._loopSeq = null;
                xon._loopStep = 0;
                xon.col = 0xffffff;
                if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
                anyMoved = true;
                break;
            }
        }
    }

    const _pT3 = performance.now(); _profPhases.p3 += _pT3 - _pT2;

    // ── PHASE 3b: Rescue stuck oct xons (no assignment or assignment revoked) ──
    // These xons didn't move in PHASE 3. Try any valid 2-step-aware move.
    occupied = _occupiedNodes();
    for (const plan of octPlans) {
        const xon = plan.xon;
        if (!xon.alive || xon._mode !== 'oct') continue;
        if (xon._movedThisTick) continue; // already moved (WB scatter/return) — one hop per tick
        // Check if this xon actually moved
        const octMoved = plan.assigned && xon.node !== plan.fromNode;
        const idleMoved = plan.idleTet;
        if (octMoved || idleMoved) continue;

        // This oct xon didn't move. Try direct movement with 2-step awareness.
        const nbs = baseNeighbors[xon.node] || [];
        const allOctNbs = nbs.filter(nb => _octNodeSet.has(nb.node));
        let moved = false;
        for (const nb of allOctNbs) {
            if (occupied.get(nb.node) || 0) continue; // Pauli
            if (_swapBlocked(xon.node, nb.node)) continue; // T41: no swap
            // 2-step awareness check
            const tmp = new Map(occupied);
            _occDel(tmp, xon.node); _occAdd(tmp, nb.node);
            if (!_lookahead(nb.node, tmp, 1)) continue;
            // Execute the move
            const from3br = xon.node;
            if (_executeOctMove(xon, { node: nb.node, dirIdx: 0, _scId: undefined, _needsMaterialise: false })) {
                _occDel(occupied, plan.fromNode);
                _occAdd(occupied, xon.node);
                _moveRecord.set(xon.node, from3br); // T41: record
                _traceMove(xon, from3br, xon.node, 'p3bOct');

                anyMoved = true;
                moved = true;
                break;
            }
        }
        // If no 2-step-aware oct move, try idle_tet
        if (!moved) {
            if (_startIdleTetLoop(xon, occupied)) {
                const dest = xon._loopSeq ? xon._loopSeq[xon._loopStep + 1] : null;
                if (dest !== undefined && !(occupied.get(dest) || 0) &&
                    !_swapBlocked(xon.node, dest) && // T41: no swap
                    _canAdvanceSafely(xon)) {
                    const from3b = xon.node;
                    _occDel(occupied, xon.node);
                    _advanceXon(xon);
                    _occAdd(occupied, xon.node);
                    _moveRecord.set(xon.node, from3b); // T41: record
                    _traceMove(xon, from3b, xon.node, 'p3bIdle');

                    anyMoved = true;
                    moved = true;
                } else {
                    // Advance failed — revert to oct mode so annihilation fallback can run.
                    // Must reset color to avoid T23 (oct xon with quark sparkMat).
                    _relinquishFaceSCs(xon); // T42: cleanup before clearing face
                    xon._mode = 'oct';
                    xon._evictedThisTick = true; // safety eviction (T52 exempt)
                    if (_flashEnabled) xon.flashT = 1.0;
                    xon._loopSeq = null;
                    xon._loopStep = 0;
                    xon._assignedFace = null;
                    xon.col = 0xffffff;
                    if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
                }
            }
        }
        // Last resort chain: try free oct, then WEAK FORCE, then annihilation.
        if (!moved && xon.alive) {
            // Try any free oct neighbor (guard-checked, prefer non-bounce)
            const sortedOctNbs = [...allOctNbs].sort((a, b) =>
                (a.node === xon.prevNode ? 1 : 0) - (b.node === xon.prevNode ? 1 : 0));
            for (const nb of sortedOctNbs) {
                if (occupied.get(nb.node) || 0) continue;
                if (_swapBlocked(xon.node, nb.node)) continue; // T41: no swap
                if (_moveViolatesGuards(xon, xon.node, nb.node)) continue; // ALL guards
                const fromLR = xon.node;
                if (_executeOctMove(xon, { node: nb.node, dirIdx: 0, _scId: undefined, _needsMaterialise: false })) {
                    _occDel(occupied, plan.fromNode);
                    _occAdd(occupied, xon.node);
                    _moveRecord.set(xon.node, fromLR); // T41: record
                    _traceMove(xon, fromLR, xon.node, 'p3bLR');

                    anyMoved = true;
                    moved = true;
                    break;
                }
            }
            // WEAK FORCE ESCAPE — shoot off in ANY direction (not just oct).
            // When all oct-constrained options fail, the xon breaks confinement.
            // Enters 'weak' mode with purple trail/sparkle.
            if (!moved) {
                const allNbs = _localBaseNeighbors(xon.node);
                // ALL projected guards — no bypass allowed
                let freeNbs = allNbs.filter(nb => !(occupied.get(nb.node) || 0) &&
                    !_swapBlocked(xon.node, nb.node) &&
                    !_moveViolatesGuards(xon, xon.node, nb.node));
                // Prefer non-prevNode to avoid bounce
                const nonBounce3b = freeNbs.filter(nb => nb.node !== xon.prevNode);
                if (nonBounce3b.length > 0) freeNbs = nonBounce3b;
                if (freeNbs.length > 0) {
                    const nb = freeNbs[0]; // closest to oct cage
                    const from3bw = xon.node;
                    _occDel(occupied, xon.node);
                    xon.prevNode = xon.node;
                    xon.node = nb.node;
                    xon._movedThisTick = true; // prevent double-move
                    _occAdd(occupied, nb.node);
                    _moveRecord.set(nb.node, from3bw); // T41: record
                    _traceMove(xon, from3bw, nb.node, 'p3bWeak');
                    _trailPush(xon, nb.node, WEAK_FORCE_COLOR);
                    xon.tweenT = 0;
                    xon._mode = 'weak';
                    if (_flashEnabled) xon.flashT = 1.0;
                    xon._assignedFace = null;
                    xon._quarkType = null;
                    xon._loopType = null;
                    xon._loopSeq = null;
                    xon._loopStep = 0;
                    xon.col = WEAK_FORCE_COLOR;
                    if (xon.sparkMat) xon.sparkMat.color.setHex(WEAK_FORCE_COLOR);
                    anyMoved = true;
                    moved = true;
                    _weakLifecycleEnter(xon, 'oct_stuck');
                }
            }
            // If still stuck and annihilation enabled: move to occupied neighbor for annihilation
            if (!moved && _annihilationEnabled) {
                for (const nb of allOctNbs) {
                    if (_swapBlocked(xon.node, nb.node)) continue; // T41: no swap
                    const occupant = _demoXons.find(x =>
                        x.alive && x !== xon && x.node === nb.node);
                    if (occupant) {
                        const from3ba = xon.node;
                        _occDel(occupied, xon.node);
                        xon.prevNode = xon.node;
                        xon.node = nb.node;
                        _moveRecord.set(nb.node, from3ba); // T41: record
                        _traceMove(xon, from3ba, nb.node, 'p3bAnni');
                        _trailPush(xon, nb.node, xon.col);
                        xon.tweenT = 0;
                        anyMoved = true;
                        break;
                    }
                }
            }
        }
    }

    const _pT3b = performance.now(); _profPhases.p3b += _pT3b - _pT3;

    // ── PHASE 4: Scatter collisions / GLUON ANNIHILATION ──
    // Any node with 2+ xons: try scatter first, then annihilate if unresolvable.
    occupied = _occupiedNodes();
    const collisionNodes = new Set();
    for (const xon of _demoXons) {
        if (xon.alive && (occupied.get(xon.node) || 0) > 1) {
            collisionNodes.add(xon.node);
        }
    }
    // Helper: scatter-move a xon to a 2-step-aware free neighbor
    function _scatterMove(xon, occupied) {
        if (xon._movedThisTick) return false;
        const scatterAntipodal = _octAntipodal.get(xon.node);
        const allNb = (baseNeighbors[xon.node] || []).filter(nb =>
            (!_octNodeSet || _octNodeSet.has(nb.node)) && nb.node !== scatterAntipodal);
        const scNb = _localScNeighbors(xon.node)
            .filter(sc => activeSet.has(sc.id) || impliedSet.has(sc.id) || xonImpliedSet.has(sc.id))
            .map(sc => sc.a === xon.node ? sc.b : sc.a)
            .filter(n => (!_octNodeSet || _octNodeSet.has(n)) && n !== scatterAntipodal);
        const candidates = [...allNb.map(nb => nb.node), ...scNb];
        // Sort by 2-step awareness: prefer destinations with valid 2nd moves
        // ONLY 2-step-aware destinations are valid
        const scored = candidates
            .filter(n => !(occupied.get(n) || 0))
            // T45: anti-bounce — don't go back to prevNode (gated by flag)
            .filter(n => !(_T45_BOUNCE_GUARD && n === xon.prevNode && xon.prevNode !== xon.node))
            // T41: reject destinations that would create a swap
            .filter(n => !_swapBlocked(xon.node, n))
            // ALL projected guards
            .filter(n => !_moveViolatesGuards(xon, xon.node, n))
            .filter(n => {
                const tmp = new Map(occupied); _occAdd(tmp, n);
                return _lookahead(n, tmp, 1);
            });
        for (const n of scored) {
            const fromNode = xon.node;
            _occDel(occupied, xon.node);
            xon.prevNode = xon.node;
            xon.node = n;
            _occAdd(occupied, n);
            _moveRecord.set(n, fromNode); // T41: record scatter move
            _traceMove(xon, fromNode, n, 'p4scatter');

            _trailPush(xon, n, xon.col);
            xon.tweenT = 0;
            return true;
        }
        // Fallback: try idle_tet
        if (_startIdleTetLoop(xon, occupied)) {
            const dest = xon._loopSeq[xon._loopStep + 1];
            if (dest !== undefined && !(occupied.get(dest) || 0) &&
                !_swapBlocked(xon.node, dest) && // T41: no swap
                _canAdvanceSafely(xon)) {
                const fromNode = xon.node;
                _advanceXon(xon);
                _occDel(occupied, xon.prevNode);
                _occAdd(occupied, xon.node);
                _moveRecord.set(xon.node, fromNode); // T41: record
                _traceMove(xon, fromNode, xon.node, 'p4idle');
                return true;
            } else {
                // Advance check failed — rollback idle_tet assignment (T42: no orphan SCs)
                _relinquishFaceSCs(xon);
                xon._mode = 'oct';
                xon._evictedThisTick = true; // safety rollback (T52 exempt)
                xon._loopSeq = null;
                xon._loopStep = 0;
                xon._assignedFace = null;
                xon.col = 0xffffff;
                if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
            }
        }
        return false;
    }

    for (const cNode of collisionNodes) {
        // All xons at this collision node (any mode)
        const atNode = _demoXons.filter(x => x.alive && x.node === cNode);
        if (atNode.length <= 1) continue;

        // Try scatter first for ANY xon that hasn't moved this tick
        const scatterable = atNode.filter(x => !x._movedThisTick);
        for (const xon of scatterable) {
            if ((occupied.get(cNode) || 0) <= 1) break; // resolved
            _scatterMove(xon, occupied);
        }

        // If collision persists: resolve via annihilation or weak force escape
        if (_annihilationEnabled) {
            // ANNIHILATE pairs on-node (gluon storage)
            const stillHere = _demoXons.filter(x => x.alive && x.node === cNode);
            while (stillHere.length > 1) {
                const a = stillHere.pop();
                const b = stillHere.pop();
                _annihilateXonPair(a, b);
                _occDel(occupied, cNode);
                _occDel(occupied, cNode);
            }
        } else {
            // Annihilation disabled — force weak escape for extras at collision node.
            // Pauli exclusion is absolute: extras MUST leave via any available edge.
            const stillHere = _demoXons.filter(x => x.alive && x.node === cNode);
            while (stillHere.length > 1) {
                const xon = stillHere.pop();
                const allNbs = _localBaseNeighbors(xon.node);
                // ALL projected guards — no bypass allowed
                let freeNb = allNbs.find(nb => !(occupied.get(nb.node) || 0) &&
                    nb.node !== xon.prevNode &&
                    !_swapBlocked(xon.node, nb.node) &&
                    !_moveViolatesGuards(xon, xon.node, nb.node));
                if (!freeNb) {
                    freeNb = allNbs.find(nb => !(occupied.get(nb.node) || 0) &&
                        !_swapBlocked(xon.node, nb.node) &&
                        !_moveViolatesGuards(xon, xon.node, nb.node));
                }
                if (freeNb) {
                    const fromP4w = xon.node;
                    console.error(`[P4W-DEBUG] tick=${_demoTick} x${_demoXons.indexOf(xon)}: ${fromP4w}→${freeNb.node} (cNode=${cNode}, stillHere=${stillHere.length})`);

                    _occDel(occupied, xon.node);
                    xon.prevNode = xon.node;
                    xon.node = freeNb.node;
                    _occAdd(occupied, freeNb.node);
                    _moveRecord.set(freeNb.node, fromP4w);
                    _traceMove(xon, fromP4w, freeNb.node, 'p4weakEsc');
                    _trailPush(xon, freeNb.node, WEAK_FORCE_COLOR);
                    xon.tweenT = 0;
                    xon._movedThisTick = true;
                    // Enter weak mode if leaving oct surface
                    if (_octNodeSet && !_octNodeSet.has(freeNb.node)) {
                        _relinquishFaceSCs(xon);
                        xon._mode = 'weak';
                        xon._assignedFace = null;
                        xon._quarkType = null;
                        xon._loopType = null;
                        xon._loopSeq = null;
                        xon._loopStep = 0;
                        xon.col = WEAK_FORCE_COLOR;
                        if (xon.sparkMat) xon.sparkMat.color.setHex(WEAK_FORCE_COLOR);
                        _weakLifecycleEnter(xon, 'pauli_escape');
                    } else {
                        // Stayed on oct surface — return to oct mode
                        _relinquishFaceSCs(xon);
                        xon._mode = 'oct';
                        xon._assignedFace = null;
                        xon._quarkType = null;
                        xon._loopType = null;
                        xon._loopSeq = null;
                        xon._loopStep = 0;
                        xon.col = 0xffffff;
                        if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
                    }
                    if (_flashEnabled) xon.flashT = 1.0;
                    anyMoved = true;
                }
            }
        }
    }

    // [P4-DIAG] Check Pauli after collision resolution
    { const _p4c = new Map(); for (const x of _demoXons) { if (!x.alive) continue; _p4c.set(x.node, (_p4c.get(x.node)||0)+1); }
      for (const [n,c] of _p4c) { if (c>1) console.error(`[P4-DIAG] POST-COLLISION: node ${n} has ${c} xons at tick ${_demoTick}`); }}

    // ── FINAL SAFETY NET: Weak force escape for ANY xon still stuck ──
    // If after all phases a xon hasn't moved AND hasn't changed mode, apply weak force.
    // This is the absolute last resort — corresponds to the weak force breaking confinement.
    occupied = _occupiedNodes();
    if (_liveGuardPrev) {
        for (const { xon, node: prevNode, mode: prevMode } of _liveGuardPrev) {
            if (!xon.alive) continue;
            if (xon._mode === 'weak') continue; // already in weak mode, PHASE 0.5 handles
            // Check if xon is stuck: same node AND same mode as previous tick snapshot
            if (xon.node !== prevNode || xon._mode !== prevMode) continue;
            // Xon is stuck — apply weak force escape
            const nbs = _localBaseNeighbors(xon.node);
            // ALL projected guards — no bypass allowed
            let freeNbs = nbs.filter(nb => !(occupied.get(nb.node) || 0) &&
                !_swapBlocked(xon.node, nb.node) &&
                !_moveViolatesGuards(xon, xon.node, nb.node));
            // Prefer non-prevNode to avoid bounce
            const nonBounceSN = freeNbs.filter(nb => nb.node !== xon.prevNode);
            if (nonBounceSN.length > 0) freeNbs = nonBounceSN;
            if (freeNbs.length > 0) {
                const nb = freeNbs[0]; // closest to oct cage
                const fromSN = xon.node;
                _occDel(occupied, xon.node);
                xon.prevNode = xon.node;
                xon.node = nb.node;
                xon._movedThisTick = true; // prevent double-move
                _occAdd(occupied, nb.node);
                _moveRecord.set(nb.node, fromSN); // T41: record
                _traceMove(xon, fromSN, nb.node, 'stuckNudge');
                _trailPush(xon, nb.node, WEAK_FORCE_COLOR);
                xon.tweenT = 0;
                _relinquishFaceSCs(xon); // T42: cleanup before clearing face
                xon._mode = 'weak';
                if (_flashEnabled) xon.flashT = 1.0;
                xon._assignedFace = null;
                xon._quarkType = null;
                xon._loopType = null;
                xon._loopSeq = null;
                xon._loopStep = 0;
                xon.col = WEAK_FORCE_COLOR;
                if (xon.sparkMat) xon.sparkMat.color.setHex(WEAK_FORCE_COLOR);
                anyMoved = true;
                _weakLifecycleEnter(xon, 'safety_net');
            } else {
                // All neighbors occupied — at minimum change mode to satisfy T20
                if (xon._mode === 'tet' || xon._mode === 'idle_tet') {
                    _relinquishFaceSCs(xon); // T42: cleanup before clearing face
                    const newMode = (_octNodeSet && _octNodeSet.has(xon.node)) ? 'oct' : 'weak';
                    xon._mode = newMode;
                    xon._assignedFace = null;
                    xon._quarkType = null;
                    xon._loopType = null;
                    xon._loopSeq = null;
                    xon._loopStep = 0;
                    xon.col = newMode === 'oct' ? 0xffffff : WEAK_FORCE_COLOR;
                    if (xon.sparkMat) xon.sparkMat.color.setHex(xon.col);
                    if (newMode === 'weak') _weakLifecycleEnter(xon, 'safety_net_stuck');
                }
            }
        }
    }

    const _pT4 = performance.now(); _profPhases.p4 += _pT4 - _pT3b;

    // ── PHASE 5: Global deadlock detection (non-fatal, warn only) ──
    if (typeof _globalStuckTicks === 'undefined') _globalStuckTicks = 0;
    if (!anyMoved && _demoXons.some(x => x.alive)) {
        _globalStuckTicks++;
        if (_globalStuckTicks === 8) {
            console.warn('[STALL] No xon could move for 8 ticks — waiting for vacuum/excitation to free space');
        }
    } else {
        _globalStuckTicks = 0;
    }

    _pT5 = performance.now(); _profPhases.p5 += _pT5 - _pT4;
    } // end !_skipNormalPhases

    // ── Advance gluons along oct edges (also negotiates with vacuum) ──
    if (_advanceGluons()) _solverNeeded = true;

    // ── Run solver if any SCs changed (unified architecture) ──
    if (_solverNeeded) {
        bumpState();
        const scPairs = [];
        activeSet.forEach(id => { const s = SC_BY_ID[id]; scPairs.push([s.a, s.b]); });
        xonImpliedSet.forEach(id => { const s = SC_BY_ID[id]; scPairs.push([s.a, s.b]); });
        const { p: pSolved } = _solve(scPairs, 5000, true); // noBailout: full convergence for Kepler
        impliedSet.clear(); impliedBy.clear();
        xonImpliedSet.forEach(id => {
            if (!activeSet.has(id)) { impliedSet.add(id); impliedBy.set(id, new Set()); }
        });
        // Bump state again AFTER solving so applyPositions → updateVoidSpheres
        // re-evaluates geometric checks with the deformed (solved) positions.
        // bumpState() above calls updateVoidSpheres() with pre-solver positions,
        // caching stale actualization; this second bump invalidates that cache.
        stateVersion++;
        applyPositions(pSolved);
        updateSpheres();
    }

    // ── KEPLER + INVARIANT CHECKS (every tick, non-negotiable) ──
    // Fast path: density check + edge/SC/repulsion validation.
    // These iterate flat arrays — total <1ms per tick.
    {
        // 1. Kepler density
        const _actualDens = computeActualDensity() * 100;
        const _idealDens = computeIdealDensity() * 100;
        const _densDev = Math.abs(_actualDens - _idealDens);
        if (_densDev > 0.01) {
            _keplerViolation(_actualDens, _idealDens);
        }
        const _densEl = document.getElementById('st-dens');
        if (_densEl) {
            _densEl.textContent = _actualDens.toFixed(4) + '%';
            _densEl.style.color = _densDev < 0.001 ? '#6a8aaa' : _densDev < 0.01 ? '#ffaa44' : '#ff4444';
        }

        // 2. Edge/SC/repulsion invariants (same checks as updateStatus but no side panel)
        const TOL = 1e-3;
        let violation = null;
        for (const [i,j] of BASE_EDGES) {
            const err = Math.abs(vd(pos[i],pos[j]) - 1.0);
            if (err > TOL) { violation = `R1 base edge v${i}-v${j} err=${err.toFixed(5)}`; break; }
        }
        if (!violation) {
            for (const id of activeSet) {
                const s = SC_BY_ID[id];
                const err = Math.abs(vd(pos[s.a],pos[s.b]) - 1.0);
                if (err > TOL) { violation = `R2 shortcut sc${id} v${s.a}-v${s.b} err=${err.toFixed(5)}`; break; }
            }
        }
        if (!violation) {
            for (const [i,j] of REPULSION_PAIRS) {
                const d = vd(pos[i],pos[j]);
                if (d < 1.0 - TOL) { violation = `R3 overlap v${i}-v${j} dist=${d.toFixed(5)}`; break; }
            }
        }
        if (violation) {
            // Soft recovery: try clearing electron-implied SCs
            if (xonImpliedSet.size && !simHalted) {
                for (const id of [...xonImpliedSet]) {
                    xonImpliedSet.delete(id); impliedSet.delete(id); impliedBy.delete(id);
                }
                bumpState();
                const pFinal = detectImplied();
                applyPositions(pFinal);
                // Re-check after recovery
                let stillBad = false;
                for (const [i,j] of BASE_EDGES) {
                    if (Math.abs(vd(pos[i],pos[j]) - 1.0) > TOL) { stillBad = true; break; }
                }
                if (!stillBad) { /* recovered */ }
                else {
                    simHalted = true;
                    document.getElementById('violation-msg').textContent = 'HALTED: ' + violation;
                    document.getElementById('violation-banner').style.display = 'block';
                }
            } else if (!simHalted) {
                simHalted = true;
                document.getElementById('violation-msg').textContent = 'HALTED: ' + violation;
                document.getElementById('violation-banner').style.display = 'block';
            }
        }
    }

    // SC attribution cleanup: remove eSCs with stale attributions.
    // An attribution is stale if the xon that caused it is no longer alive
    // or no longer assigned to the attributed face.
    // Traversal-locked SCs are NEVER removed (xon is currently on that edge).
    // Also remove eSCs with no attribution at all (shouldn't happen but safety net).
    {
        const locked = typeof _traversalLockedSCs === 'function' ? _traversalLockedSCs() : new Set();
        const toRemove = [];
        for (const scId of xonImpliedSet) {
            if (activeSet.has(scId)) continue; // not eSC's responsibility
            if (locked.has(scId)) continue;    // xon currently traversing this edge
            const attr = _scAttribution.get(scId);
            if (!attr) { toRemove.push(scId); continue; } // no attribution → orphan
            const xon = _demoXons[attr.xonIdx];
            if (!xon || !xon.alive) { toRemove.push(scId); continue; } // xon dead
            // For face-based attributions, check xon still assigned to that face
            if (attr.face != null && xon._assignedFace !== attr.face) {
                toRemove.push(scId); continue;
            }
        }
        for (const id of toRemove) {
            xonImpliedSet.delete(id);
            _scAttribution.delete(id);
            stateVersion++;
        }
    }

    const _pTsolver = performance.now(); _profPhases.solver += _pTsolver - _pT5;

    // ── Decay dying xon trails (every simulation tick, not per-frame) ──
    _decayDyingXons();

    // ── Color tets with progressive opacity (ramps as xon loop completes) ──
    // Demand-driven: derive active faces from xon state, not schedule.
    if (_nucleusTetFaceData) {
        // Build active face map from xon assignments
        const activeFaces = new Map(); // face → {quarkType, loopStep, actualized}
        for (const xon of _demoXons) {
            if (!xon.alive || xon._assignedFace == null) continue;
            if (xon._mode === 'tet' || xon._mode === 'idle_tet') {
                activeFaces.set(xon._assignedFace, {
                    quarkType: xon._quarkType, loopStep: xon._loopStep,
                    actualized: !!xon._tetActualized
                });
            }
        }
        for (const [fIdStr, fd] of Object.entries(_nucleusTetFaceData)) {
            const fId = parseInt(fIdStr);
            const active = activeFaces.get(fId);
            // T58: only color tet faces that have COMPLETED a loop and counted
            // in the hadronic balance. loopStep === 4 is the completion tick
            // (same gate as _demoVisits increment in _advanceXon).
            // SCs must also be active right now to confirm genuine actualization.
            const completedNow = active && active.actualized && active.loopStep >= 4
                && fd.scIds.every(scId =>
                    activeSet.has(scId) || impliedSet.has(scId) || xonImpliedSet.has(scId));
            if (completedNow) {
                _ruleAnnotations.tetColors.set(fd.voidIdx, QUARK_COLORS[active.quarkType]);
                _ruleAnnotations.tetOpacity.set(fd.voidIdx, 0.85);
            } else {
                _ruleAnnotations.tetColors.set(fd.voidIdx, 0x1a1a2a);
                _ruleAnnotations.tetOpacity.set(fd.voidIdx, 0.0);
            }
        }
        _ruleAnnotations.dirty = true;
        if (typeof updateVoidSpheres === 'function') updateVoidSpheres();
    }

    const _pTrender = performance.now(); _profPhases.render += _pTrender - _pTsolver;

    _demoTick++;

    // Update Planck-second ticker (both right-panel status and left-panel title)
    const _tickerEl = document.getElementById('nucleus-status');
    if (_tickerEl) _tickerEl.textContent = `${_demoTick} Planck seconds`;
    const _dpTitle = document.getElementById('dp-title');
    if (_dpTitle) _dpTitle.textContent = `${_demoTick} Planck seconds`;
    // Top-center title is set once per trial by _runTournament — no per-tick update needed

    // Live guard checks (T19, T21, T26, T27) — after tick advances xons
    const _gT0 = performance.now();
    if (typeof _liveGuardCheck === 'function') _liveGuardCheck();
    const _gT1 = performance.now();

    // ── BACKTRACK CHECK (BFS): did guards request a rewind? ──
    if (_rewindRequested) {
        _rewindRequested = false;
        _btActive = true;

        // Extract exclusions and accumulate in persistent ledger
        const newExclusions = _btExtractExclusions();
        const currentTick = _demoTick - 1; // tick was already incremented
        if (!_btBadMoveLedger.has(currentTick)) _btBadMoveLedger.set(currentTick, new Set());
        const ledger = _btBadMoveLedger.get(currentTick);
        for (const ex of newExclusions) ledger.add(ex);

        // ── BFS LAYER TRACKING ──
        // Is this the known failure tick returning after a deeper-layer replay?
        if (_bfsFailTick >= 0 && currentTick === _bfsFailTick) {
            // We replayed forward from a deeper layer and the failure tick
            // STILL fails. Count this as one consumed attempt at the current layer.
            _bfsLayerRetries++;
            _logChoreo(`BFS: failure tick ${currentTick} still failing after layer ${_bfsLayer} attempt ${_bfsLayerRetries}/${_BT_MAX_RETRIES}`);

            if (_bfsLayerRetries >= _BT_MAX_RETRIES) {
                // Exhausted this layer — go one tick further back
                _bfsLayer++;
                _bfsLayerRetries = 0;

                if (_bfsLayer >= _BFS_MAX_LAYERS) {
                    console.error(`[BFS] Exhausted ${_bfsLayer} layers, halting: ${_rewindViolation}`);
                    simHalted = true;
                    _btReset();
                    _bfsReset();
                    break;
                }
            }

            // Rewind to anchor tick = _bfsFailTick - _bfsLayer
            const targetTick = _bfsFailTick - _bfsLayer;
            // Find the snapshot for the anchor tick
            const anchorSnap = _btSnapshots.find(s => s.tick === targetTick);
            if (!anchorSnap) {
                console.error(`[BFS] No snapshot for anchor tick ${targetTick}, halting`);
                simHalted = true;
                _btReset();
                _bfsReset();
                break;
            }
            // Clear ledger entries for ticks after anchor (state will be different)
            for (const [t] of _btBadMoveLedger) {
                if (t > targetTick) _btBadMoveLedger.delete(t);
            }
            _btRestoreSnapshot(anchorSnap);
            _logChoreo(`BFS: rewound to layer ${_bfsLayer} anchor tick ${targetTick}, layerRetry ${_bfsLayerRetries}`);
            continue;
        }

        // ── NORMAL SAME-TICK RETRY (layer 0 or retrying a non-failure tick) ──
        _btRetryCount++;

        if (_btRetryCount >= _BT_MAX_RETRIES) {
            // Exhausted all rotations at this tick.
            if (_bfsFailTick < 0) {
                // First time exhausting — this tick is now the BFS failure tick.
                _bfsFailTick = currentTick;
                _bfsLayer = 1;          // start exploring one tick back
                _bfsLayerRetries = 0;
                _logChoreo(`BFS: tick ${currentTick} exhausted at layer 0, starting BFS layer 1`);
            } else {
                // This is a non-failure tick that also failed during forward replay.
                // Escalate the BFS layer.
                _bfsLayer++;
                _bfsLayerRetries = 0;
                _logChoreo(`BFS: intermediate tick ${currentTick} also failed, escalating to layer ${_bfsLayer}`);
            }

            if (_bfsLayer >= _BFS_MAX_LAYERS) {
                console.error(`[BFS] Exhausted ${_bfsLayer} layers, halting: ${_rewindViolation}`);
                simHalted = true;
                _btReset();
                _bfsReset();
                break;
            }

            // Rewind to anchor tick
            const targetTick = _bfsFailTick - _bfsLayer;
            const anchorSnap = _btSnapshots.find(s => s.tick === targetTick);
            if (!anchorSnap) {
                console.error(`[BFS] No snapshot for anchor tick ${targetTick}, halting`);
                simHalted = true;
                _btReset();
                _bfsReset();
                break;
            }
            for (const [t] of _btBadMoveLedger) {
                if (t > targetTick) _btBadMoveLedger.delete(t);
            }
            _btRetryCount = 0;
            _btRestoreSnapshot(anchorSnap);
            _logChoreo(`BFS: rewound to anchor tick ${targetTick} (layer ${_bfsLayer})`);
            continue;
        }

        // Same-tick retry — restore snapshot, exclusions already accumulated in ledger
        const snap = _btSnapshots[_btSnapshots.length - 1];
        _btRestoreSnapshot(snap);
        _logChoreo(`BACKTRACK retry ${_btRetryCount}/${_BT_MAX_RETRIES} at tick ${currentTick} (ledger: ${ledger.size} exclusions)`);
        continue;
    }

    // ── Clean tick — commit and reset per-tick backtrack state ──
    const cleanTick = _demoTick - 1; // the tick that just succeeded
    // If we just passed the BFS failure tick, the BFS succeeded!
    if (_bfsFailTick >= 0 && cleanTick >= _bfsFailTick) {
        _logChoreo(`BFS: failure tick ${_bfsFailTick} PASSED at layer ${_bfsLayer}! Clearing BFS state.`);
        _bfsReset();
    }
    _btReset();
    _profPhases.guards += _gT1 - _gT0;
    break; // exit retry loop

    } // end backtracking retry loop

    // Update UI — every tick (un-throttled)
    updateDemoPanel();
    updateStatus();
    updateXonPanel();

    // Tournament hook: check if trial has reached its target tick
    if (typeof _tournamentTickCheck === 'function') _tournamentTickCheck();

    // ─── Profiling: record tick time ───
    const _tickDt = performance.now() - _tickT0;
    _tickTotalMs += _tickDt;
    _tickCount++;
    if (_tickDt > _tickMaxMs) _tickMaxMs = _tickDt;

    // Auto-dump every 50 ticks
    if (_tickCount > 0 && _tickCount % 50 === 0) dumpProfile();

    } finally {
        _tickInProgress = false;
    }
}

function dumpProfile() {
    if (_tickCount === 0) { console.log('[PROFILE] No ticks recorded'); return; }
    const n = _tickCount;
    const total = _tickTotalMs;
    const ph = _profPhases;
    const phaseTot = ph.wb + ph.p0 + ph.p05 + ph.p1 + ph.p2 + ph.p3 + ph.p3b + ph.p4 + ph.p5 + ph.solver + ph.render + ph.guards + (ph._temporalK||0) + (ph._uiUpdate||0);
    const pct = (v) => ((v / total) * 100).toFixed(1) + '%';
    const avg = (v) => (v / n).toFixed(1);
    console.log(`\n[PROFILE] ${n} ticks, total ${(total/1000).toFixed(1)}s, avg ${avg(total)}ms/tick, max ${_tickMaxMs.toFixed(0)}ms`);
    console.log(`  WB(setup):  ${avg(ph.wb)}ms/tick  ${pct(ph.wb)}`);
    console.log(`  PHASE 0:    ${avg(ph.p0)}ms/tick  ${pct(ph.p0)}`);
    console.log(`  PHASE 0.5:  ${avg(ph.p05)}ms/tick  ${pct(ph.p05)}`);
    console.log(`  PHASE 1:    ${avg(ph.p1)}ms/tick  ${pct(ph.p1)}`);
    console.log(`  PHASE 2:    ${avg(ph.p2)}ms/tick  ${pct(ph.p2)}  (gpuBatch: ${avg(ph.gpuBatch||0)}ms)`);
    console.log(`  PHASE 3:    ${avg(ph.p3)}ms/tick  ${pct(ph.p3)}`);
    console.log(`  PHASE 3b:   ${avg(ph.p3b)}ms/tick  ${pct(ph.p3b)}`);
    console.log(`  PHASE 4:    ${avg(ph.p4)}ms/tick  ${pct(ph.p4)}`);
    console.log(`  PHASE 5:    ${avg(ph.p5)}ms/tick  ${pct(ph.p5)}`);
    console.log(`  Solver+glu: ${avg(ph.solver)}ms/tick  ${pct(ph.solver)}`);
    console.log(`  Render:     ${avg(ph.render)}ms/tick  ${pct(ph.render)}`);
    console.log(`  Guards:     ${avg(ph.guards)}ms/tick  ${pct(ph.guards)}`);
    console.log(`  TemporalK:  ${avg(ph._temporalK||0)}ms/tick  ${pct(ph._temporalK||0)}`);
    console.log(`  UI update:  ${avg(ph._uiUpdate||0)}ms/tick  ${pct(ph._uiUpdate||0)}`);
    console.log(`  Accounted:  ${avg(phaseTot)}ms/tick  ${pct(phaseTot)}`);
    if (typeof _solveCallCount !== 'undefined') {
        console.log(`  _solve() calls: ${_solveCallCount} (${(_solveCallCount/n).toFixed(1)}/tick), avg ${_solveCallCount?(_solveTotalMs/_solveCallCount).toFixed(1):'0'}ms`);
    }
    if (typeof _cmqCallCount !== 'undefined') {
        console.log(`  CMQ: ${_cmqCallCount} calls, ${_cmqCpuCount} CPU, ${_cmqCacheHits} cached, avg ${_cmqCpuCount?(_cmqTotalMs/_cmqCpuCount).toFixed(1):'0'}ms/CPU`);
    }
}

function resetProfile() {
    _tickTotalMs = 0; _tickCount = 0; _tickMaxMs = 0;
    for (const k in _profPhases) _profPhases[k] = 0;
    if (typeof _solveCallCount !== 'undefined') { _solveCallCount = 0; _solveTotalMs = 0; _solveMaxMs = 0; _solveIterTotal = 0; }
    if (typeof _cmqCallCount !== 'undefined') { _cmqCallCount = 0; _cmqCpuCount = 0; _cmqCacheHits = 0; _cmqTotalMs = 0; }
    console.log('[PROFILE] Counters reset');
}

function updateDemoPanel() {
    // Demand-driven: use fixed 64-tick epoch for display purposes
    const epoch = Math.floor(_demoTick / 64);

    // ── Update demo-status (right panel, below button) ──
    const ds = document.getElementById('demo-status');
    if (ds) {
        ds.innerHTML = `<span style="color:#88bbdd;">epoch ${epoch}</span>`;
    }

    // ── Update left panel coverage bars (skip during test execution) ──
    if (_testRunning) return;
    const el = document.getElementById('dp-coverage-bars');
    if (!el) return;

    // Compute evenness: CV across all faces' total visits
    const totals = [];
    for (let f = 1; f <= 8; f++) totals.push(_demoVisits[f].total);
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    const stddev = Math.sqrt(totals.reduce((s, v) => s + (v - mean) ** 2, 0) / totals.length);
    const cv = mean > 0 ? (stddev / mean) : 0;
    const evenness = Math.max(0, 1 - cv);

    // Find max for bar normalization
    let maxCount = 1;
    for (let f = 1; f <= 8; f++) {
        for (const t of ['pu', 'pd', 'nu', 'nd']) {
            maxCount = Math.max(maxCount, _demoVisits[f][t]);
        }
    }

    // Build bars
    let html = '';
    for (let f = 1; f <= 8; f++) {
        const v = _demoVisits[f];
        const isA = [1, 3, 6, 8].includes(f);
        html += `<div style="display:flex; align-items:center; gap:2px;">`
            + `<span style="width:18px; color:${isA ? '#cc8866' : '#6688aa'}; font-size:8px; font-weight:bold;">F${f}</span>`
            + `<div class="dp-bar-bg" style="flex:1;" title="p\u2191 ${v.pu}"><div class="dp-bar-fill" style="width:${(v.pu / maxCount * 100).toFixed(1)}%; background:#ddcc44;"></div></div>`
            + `<div class="dp-bar-bg" style="flex:1;" title="p\u2193 ${v.pd}"><div class="dp-bar-fill" style="width:${(v.pd / maxCount * 100).toFixed(1)}%; background:#44cc66;"></div></div>`
            + `<div class="dp-bar-bg" style="flex:1;" title="n\u2191 ${v.nu}"><div class="dp-bar-fill" style="width:${(v.nu / maxCount * 100).toFixed(1)}%; background:#4488ff;"></div></div>`
            + `<div class="dp-bar-bg" style="flex:1;" title="n\u2193 ${v.nd}"><div class="dp-bar-fill" style="width:${(v.nd / maxCount * 100).toFixed(1)}%; background:#ff4444;"></div></div>`
            + `<span style="width:22px; text-align:right; font-size:7px; color:#667788;">${v.total}</span>`
            + `</div>`;
    }

    // ── Per-hadron evenness ──
    // Proton visits per face = pu + pd, Neutron = nu + nd
    const protonPerFace = [], neutronPerFace = [], typePerFace = [];
    for (let f = 1; f <= 8; f++) {
        const v = _demoVisits[f];
        protonPerFace.push(v.pu + v.pd);
        neutronPerFace.push(v.nu + v.nd);
    }
    // Per-type global totals
    // Physical ratio: pu ≈ 2×pd (proton uud), nd ≈ 2×nu (neutron udd)
    const typeTotals = { pu: 0, pd: 0, nu: 0, nd: 0 };
    for (let f = 1; f <= 8; f++) {
        for (const t of ['pu', 'pd', 'nu', 'nd']) typeTotals[t] += _demoVisits[f][t];
    }
    const calcEvenness = (arr) => {
        const m = arr.reduce((a, b) => a + b, 0) / arr.length;
        if (m === 0) return 0; // no visits = 0% balance
        const sd = Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
        return Math.max(0, 1 - sd / m);
    };
    const protonEvenness = calcEvenness(protonPerFace);
    const neutronEvenness = calcEvenness(neutronPerFace);
    // Type ratio balance: check pu:pd ≈ 2:1 and nd:nu ≈ 2:1
    const puPdRatio = typeTotals.pd > 0 ? typeTotals.pu / typeTotals.pd : 0;
    const ndNuRatio = typeTotals.nu > 0 ? typeTotals.nd / typeTotals.nu : 0;
    // How close each ratio is to the target 2.0
    const ratioAccuracy = (puPdRatio > 0 && ndNuRatio > 0)
        ? 1 - (Math.abs(puPdRatio - 2) + Math.abs(ndNuRatio - 2)) / 4
        : 0;
    const evColor = (e) => e > 0.99 ? '#66dd66' : e > 0.95 ? '#ccaa66' : '#ff6644';

    // Evenness + rule compliance
    html += `<div style="margin-top:6px; border-top:1px solid rgba(80,100,120,0.25); padding-top:4px;">`;
    html += `<div style="display:flex; justify-content:space-between; font-size:9px;">`
        + `<span style="color:#6a8a9a;">overall</span>`
        + `<span style="color:${evColor(evenness)}; font-weight:bold;">${(evenness * 100).toFixed(1)}%</span>`
        + `</div>`;
    html += `<div style="display:flex; justify-content:space-between; font-size:9px;">`
        + `<span style="color:#cc8866;">proton</span>`
        + `<span style="color:${evColor(protonEvenness)}; font-weight:bold;">${(protonEvenness * 100).toFixed(1)}%</span>`
        + `</div>`;
    html += `<div style="display:flex; justify-content:space-between; font-size:9px;">`
        + `<span style="color:#6688aa;">neutron</span>`
        + `<span style="color:${evColor(neutronEvenness)}; font-weight:bold;">${(neutronEvenness * 100).toFixed(1)}%</span>`
        + `</div>`;
    html += `<div style="display:flex; justify-content:space-between; font-size:9px;">`
        + `<span style="color:#6a8a9a;">pu:pd ratio</span>`
        + `<span style="color:${Math.abs(puPdRatio - 2) < 0.3 ? '#66dd66' : '#ccaa66'}; font-weight:bold;">${puPdRatio.toFixed(2)} (\u21922.0)</span>`
        + `</div>`;
    html += `<div style="display:flex; justify-content:space-between; font-size:9px;">`
        + `<span style="color:#6a8a9a;">nd:nu ratio</span>`
        + `<span style="color:${Math.abs(ndNuRatio - 2) < 0.3 ? '#66dd66' : '#ccaa66'}; font-weight:bold;">${ndNuRatio.toFixed(2)} (\u21922.0)</span>`
        + `</div>`;
    html += `<div style="display:flex; justify-content:space-between; font-size:9px;">`
        + `<span style="color:#6a8a9a;">epoch</span>`
        + `<span style="color:#88aacc;">${epoch}</span>`
        + `</div>`;

    // ── Ratio accuracy history sparkline ──
    _demoTypeBalanceHistory.push(ratioAccuracy * 100);
    const hist = _demoTypeBalanceHistory;
    const sparkLen = Math.min(hist.length, 24);  // show last 24 cycles
    const sparkData = hist.slice(-sparkLen);
    // Scale: map [min..100] to 8-level block chars
    const sparkMin = Math.min(...sparkData, 90);
    const sparkMax = 100;
    const SPARK = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];
    let sparkline = '';
    for (const v of sparkData) {
        const norm = Math.max(0, Math.min(1, (v - sparkMin) / (sparkMax - sparkMin)));
        const idx = Math.min(7, Math.floor(norm * 7.99));
        // Color: green at 100, yellow at 95, orange below
        const c = v >= 99.5 ? '#66dd66' : v >= 96 ? '#ccaa66' : '#cc8855';
        sparkline += `<span style="color:${c};">${SPARK[idx]}</span>`;
    }
    html += `<div style="margin-top:4px; overflow:hidden;">`
        + `<div style="font-size:7px; color:#556677; margin-bottom:1px;">ratio accuracy (last ${sparkLen} windows)</div>`
        + `<div style="font-size:10px; letter-spacing:-1px; line-height:1; font-family:monospace; overflow:hidden;">${sparkline}</div>`
        + `<div style="display:flex; justify-content:space-between; font-size:6px; color:#445566; margin-top:1px;">`
        + `<span>${sparkMin.toFixed(0)}%</span><span>100%</span></div>`
        + `</div>`;
    // Rule compliance indicators
    const rules = [
        { name: 'anti-phase', ok: true },  // guaranteed by schedule construction
        { name: 'pauli', ok: _demoPauliViolations === 0 },
        { name: 'spread', ok: _demoSpreadViolations === 0 },
        { name: 'coverage', ok: evenness > 0.9 },
    ];
    html += `<div style="margin-top:3px; font-size:8px; color:#556677;">`;
    for (const r of rules) {
        html += `<span style="color:${r.ok ? '#44aa66' : '#cc4444'}; margin-right:6px;">${r.ok ? '\u2713' : '\u2717'} ${r.name}</span>`;
    }
    html += `</div></div>`;
    el.innerHTML = html;

    // Hide density/sync rows during demo (not relevant)
    const densityRow = document.querySelector('#deuteron-panel > div:nth-child(2)');
    const syncRow = document.querySelector('#deuteron-panel > div:nth-child(3)');
    if (densityRow) densityRow.style.display = 'none';
    if (syncRow) syncRow.style.display = 'none';
}

// ── Choreographer logging helper ──
function _logChoreo(msg) {
    _choreoLog.push({ tick: _demoTick, msg });
    if (_choreoLog.length > _CHOREO_LOG_MAX) _choreoLog.shift();
}

// ── Log PHASE 2 summary: called after bipartite matching + fallbacks ──
function _logPhase2Summary(octPlans) {
    const _QL = { pu: 'p_u', pd: 'p_d', nu: 'n_u', nd: 'n_d' };
    const lines = [];
    for (const plan of octPlans) {
        const x = plan.xon;
        const idx = _demoXons.indexOf(x);
        const label = x._mode === 'oct' ? 'idle' : x._mode === 'weak' ? 'weak' :
                      x._quarkType ? _QL[x._quarkType] || x._quarkType : x._mode;
        const cands = plan.candidates.length;
        if (plan.assigned) {
            lines.push(`X${idx}(${label}) n${plan.fromNode}: ${cands}c->n${plan.assigned.node}`);
        } else if (plan.idleTet) {
            lines.push(`X${idx}(${label}) n${plan.fromNode}: ${cands}c->tet f${x._assignedFace}`);
        } else {
            const reasons = [];
            if (cands === 0) reasons.push('0 cands');
            else reasons.push(`${cands}c taken`);
            if (x._evictedThisTick) reasons.push('evicted');
            lines.push(`X${idx}(${label}) n${plan.fromNode}: STUCK(${reasons.join(',')})`);
        }
    }
    _logChoreo('PH2: ' + lines.join(' | '));
}

// ── Xon panel update (sidebar) ──
function updateXonPanel() {
    if (_testRunning) return;
    const panel = document.getElementById('xon-panel');
    if (!panel) return;
    panel.style.display = _demoActive ? 'block' : 'none';
    if (!_demoActive) return;

    const listEl = document.getElementById('xon-panel-list');
    if (!listEl) return;

    let html = '';
    for (let i = 0; i < _demoXons.length; i++) {
        const x = _demoXons[i];
        if (!x.alive) continue;
        const modeCol = x._mode === 'oct' ? '#ffffff' :
                        x._mode === 'weak' ? '#cc44ff' :
                        x._mode === 'tet' ? '#' + (x.col || 0xffffff).toString(16).padStart(6, '0') :
                        x._mode === 'idle_tet' ? '#' + (x.col || 0x888888).toString(16).padStart(6, '0') : '#888888';
        // Display labels: oct=idle, tet/idle_tet=hadron type (p_u, p_d, n_u, n_d)
        const QUARK_LABELS = { pu: 'p_u', pd: 'p_d', nu: 'n_u', nd: 'n_d' };
        let modeLabel, faceStr;
        if (x._mode === 'oct') {
            modeLabel = 'idle';
            faceStr = '';
        } else if (x._mode === 'weak') {
            modeLabel = 'weak';
            faceStr = '';
        } else {
            // tet or idle_tet — show hadron type
            modeLabel = x._quarkType ? QUARK_LABELS[x._quarkType] || x._quarkType : x._mode;
            faceStr = x._assignedFace ? ` f${x._assignedFace}` : '';
        }
        const highlighted = _xonHighlightTimers.has(i);
        const border = highlighted ? `2px solid ${modeCol}` : '1px solid #334455';
        const bg = highlighted ? 'rgba(255,255,255,0.15)' : '#0d1520';
        html += `<button class="xon-btn" data-xon-idx="${i}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:42px; height:36px; padding:2px; cursor:pointer; border-radius:4px; background:${bg}; border:${border}; font-family:monospace; outline:none;" title="X${i}: n${x.node} ${modeLabel}${faceStr}">`
            + `<span style="color:${modeCol}; font-weight:bold; font-size:11px;">X${i}</span>`
            + `<span style="color:#88aacc; font-size:8px;">n${x.node}</span>`
            + `<span style="color:#667788; font-size:7px;">${modeLabel}${faceStr}</span>`
            + `</button>`;
    }
    listEl.innerHTML = html;

    // Attach click handlers
    const btns = listEl.querySelectorAll('.xon-btn');
    btns.forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.dataset.xonIdx, 10);
            _highlightXon(idx);
        };
    });
}

function _highlightXon(idx) {
    if (idx < 0 || idx >= _demoXons.length) return;
    const xon = _demoXons[idx];
    if (!xon) return;

    // Set highlight timer — decayed per-frame in _tickDemoXons
    xon._highlightT = 2.0; // seconds

    // Track which xons are highlighted for button border styling
    if (_xonHighlightTimers.has(idx)) clearTimeout(_xonHighlightTimers.get(idx));
    _xonHighlightTimers.set(idx, setTimeout(() => _xonHighlightTimers.delete(idx), 2000));
}

function pauseDemo() {
    _demoPaused = true;
    if (_demoInterval) { clearInterval(_demoInterval); _demoInterval = null; }
    if (_demoUncappedId) { clearTimeout(_demoUncappedId); _demoUncappedId = null; }
}
function resumeDemo() {
    _demoPaused = false;
    if (_demoActive && !_demoInterval && !_demoUncappedId) {
        const intervalMs = _getDemoIntervalMs();
        if (intervalMs === 0) {
            _demoUncappedId = setTimeout(_demoUncappedLoop, 0);
        } else {
            _demoInterval = setInterval(demoTick, intervalMs);
        }
    }
}
function isDemoPaused() {
    return _demoPaused;
}

function stopDemo() {
    _demoActive = false;
    _demoPaused = false;
    _openingPhase = false;
    if (typeof _liveGuardsActive !== 'undefined') _liveGuardsActive = false;
    if (_demoInterval) { clearInterval(_demoInterval); _demoInterval = null; }
    if (_demoUncappedId) { clearTimeout(_demoUncappedId); _demoUncappedId = null; }
    const ds = document.getElementById('demo-status');
    if (ds) ds.style.display = 'none';
    // Clean up Demo 3.0 xons and gluons
    _cleanupDemo3();
    // Clean up tet SCs from xonImpliedSet + oct SCs from activeSet
    for (const [, fd] of Object.entries(_nucleusTetFaceData)) {
        for (const scId of fd.scIds) {
            xonImpliedSet.delete(scId);
            _scAttribution.delete(scId);
        }
    }
    _scAttribution.clear(); // full cleanup on demo stop
    for (const scId of _octSCIds) {
        activeSet.delete(scId);
    }
    // Clear tet annotations
    _ruleAnnotations.tetColors.clear();
    _ruleAnnotations.tetOpacity.clear();
    _ruleAnnotations.dirty = true;
    bumpState();
    const pClean = detectImplied();
    applyPositions(pClean);
    updateSpheres();
    // Show xon sparks again
    const quarks = NucleusSimulator?.quarkExcitations || [];
    for (const q of quarks) {
        if (q.spark) q.spark.visible = true;
        if (q.trailLine) q.trailLine.visible = true;
    }
    // Restore density/sync rows
    const densityRow = document.querySelector('#deuteron-panel > div:nth-child(2)');
    const syncRow = document.querySelector('#deuteron-panel > div:nth-child(3)');
    if (densityRow) densityRow.style.display = '';
    if (syncRow) syncRow.style.display = '';
    // Restore panel title
    const dpTitle = document.querySelector('#deuteron-panel > div:first-child');
    if (dpTitle) dpTitle.textContent = 'DEUTERON';
}

// ── Precomputed pattern schedule for algos ──
let _activePatternSchedule = null;

function getOrComputePatternSchedule() {
    if (_activePatternSchedule) return _activePatternSchedule;
    const result = computeActivationPatterns();
    if (!result.patterns.length) return null;
    const patP = result.patterns[0];
    const patN = result.patterns.length > 1 ? result.patterns[1] : result.patterns[0];
    _activePatternSchedule = buildDeuteronSchedule(patP, patN, result.D4);
    return _activePatternSchedule;
}

// ════════════════════════════════════════════════════════════════════
// XON ALGORITHM REGISTRY — PHYSICS-BASED CHOREOGRAPHY STRATEGIES
// ════════════════════════════════════════════════════════════════════
//
// Xons are anonymous excitation workers (like gluons). They don't
// carry quark identity — the quarks ARE the tets. Xons just
// materialize SCs to actualize the target activation pattern.
//
// Each algorithm controls TWO decision points:
//   stepQuark(e, freeOpts, costlyOpts, tetSCsOpen, faceData, ctx)
//     → {dest, scId} or null (choose where xon moves within its tet)
//   shouldHop(e, groupFaces, occupiedFaces, ctx)
//     → {targetFace} or null (decide if/where xon hops between faces)
//
// ctx = { allOpen, quarkList, faceCoverage, nucleusTick, tetFaceData,
//         canMaterialise, materialise, severForRoom, hopGroups }
//
// Tournament swaps algorithms and measures coverage evenness.
// ════════════════════════════════════════════════════════════════════
const QUARK_ALGO_REGISTRY = [];
// ── Shared xon stepQuark: SC materialisation, identity-agnostic ──
function _xonStep(e, freeOpts, costlyOpts, tetSCsOpen, faceData, ctx) {
    let chosen = null;
    if (tetSCsOpen < 2 && costlyOpts.length > 0) {
        for (const opt of costlyOpts) {
            if (ctx.canMaterialise(opt.scId)) {
                if (ctx.materialise(e, opt.scId)) { chosen = opt; break; }
            } else if (ctx.severForRoom(opt.scId)) {
                if (ctx.materialise(e, opt.scId)) { chosen = opt; break; }
            }
        }
    }
    if (!chosen && freeOpts.length > 0) {
        chosen = freeOpts[Math.floor(Math.random() * freeOpts.length)];
    }
    if (!chosen && costlyOpts.length > 0) {
        for (const opt of costlyOpts) {
            if (ctx.canMaterialise(opt.scId)) {
                if (ctx.materialise(e, opt.scId)) { chosen = opt; break; }
            } else if (ctx.severForRoom(opt.scId)) {
                if (ctx.materialise(e, opt.scId)) { chosen = opt; break; }
            }
        }
    }
    return chosen;
}

// Helper: compute per-tet activation state (how many SCs open / total)
function _tetActivationMap(ctx) {
    const map = {};
    for (const [faceId, fd] of Object.entries(ctx.tetFaceData)) {
        const open = fd.scIds.filter(id => ctx.allOpen.has(id)).length;
        const total = fd.scIds.length;
        const covKey = Object.keys(ctx.faceCoverage)
            .filter(k => k.endsWith('_' + faceId));
        let totalCov = 0;
        for (const k of covKey) totalCov += ctx.faceCoverage[k] || 0;
        map[faceId] = { open, total, full: open === total, totalCov };
    }
    return map;
}

// ── Algorithm 4: "xon-least-action" (Lagrangian mechanics) ──
// Nature takes the path of minimum energy. Xons minimize SC
// materializations needed — hop to tets requiring fewest new SCs.
QUARK_ALGO_REGISTRY.push({
    name: 'xon-least-action',
    description: 'Lagrangian: minimize SC materializations per hop (path of least resistance)',
    minDwell: 3,
    timeout: 10,

    stepQuark: _xonStep,

    shouldHop(e, groupFaces, occupiedFaces, ctx) {
        const sif = e._stepsInFace || 0;
        if (sif < this.minDwell) return null;
        const fd = ctx.tetFaceData[e._currentFace];
        const tetFull = fd && fd.scIds.every(id => ctx.allOpen.has(id));
        if (!tetFull && sif < this.timeout) return null;

        const unoccupied = groupFaces.filter(f => !occupiedFaces.has(f));
        if (unoccupied.length === 0) return null;

        // Score each candidate by "action" = closed SCs + coverage (lower = better)
        const actMap = _tetActivationMap(ctx);
        let bestFace = null, bestAction = Infinity;
        for (const f of unoccupied) {
            const a = actMap[f];
            if (!a) continue;
            // Action = closed SCs (materialisation cost) - coverage deficit bonus
            const closedSCs = a.total - a.open;
            const avgCov = Object.values(actMap).reduce((s, x) => s + x.totalCov, 0)
                / Object.keys(actMap).length;
            const deficit = Math.max(0, avgCov - a.totalCov);
            const action = closedSCs - deficit * 0.1; // deficit lowers action cost
            if (action < bestAction) { bestAction = action; bestFace = f; }
        }
        if (bestFace === null) return null;

        // Always hop when ready (deterministic — least action is decisive)
        return { targetFace: bestFace };
    }
});

// ── Algorithm 5: "xon-diffusion" (Fick's law / heat equation) ──
// Coverage diffuses from high-density to low-density regions.
// Hop rate ∝ coverage gradient. Like thermal equilibration.
QUARK_ALGO_REGISTRY.push({
    name: 'xon-diffusion',
    description: "Fick's law: coverage flows from over-served to under-served tets",
    minDwell: 2,
    timeout: 8,

    stepQuark: _xonStep,

    shouldHop(e, groupFaces, occupiedFaces, ctx) {
        const sif = e._stepsInFace || 0;
        if (sif < this.minDwell) return null;
        const fd = ctx.tetFaceData[e._currentFace];
        const tetFull = fd && fd.scIds.every(id => ctx.allOpen.has(id));
        if (!tetFull && sif < this.timeout) return null;

        // Compute coverage "temperature" — current face vs average
        const actMap = _tetActivationMap(ctx);
        const allCovs = Object.values(actMap).map(a => a.totalCov);
        const avgCov = allCovs.reduce((a, b) => a + b, 0) / allCovs.length;
        const curCov = actMap[e._currentFace]?.totalCov || 0;

        // Gradient = how much hotter we are than average
        const gradient = (curCov - avgCov) / Math.max(1, avgCov);

        // Hop probability ∝ gradient (leave hot spots, stay in cold spots)
        const prob = Math.min(0.8, Math.max(0.05, 0.1 + gradient * 0.6));
        if (Math.random() >= prob) return null;

        const unoccupied = groupFaces.filter(f => !occupiedFaces.has(f));
        if (unoccupied.length === 0) return null;

        // Boltzmann-weighted target selection: prefer coldest tet
        const candidates = unoccupied.map(f => ({
            face: f,
            cov: actMap[f]?.totalCov || 0
        }));
        candidates.sort((a, b) => a.cov - b.cov);

        // Boltzmann: P(f) ∝ exp(-cov/T), T = temperature parameter
        const T = Math.max(1, avgCov * 0.3);
        const weights = candidates.map(c => Math.exp(-c.cov / T));
        const wTotal = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * wTotal;
        for (let i = 0; i < candidates.length; i++) {
            r -= weights[i];
            if (r <= 0) return { targetFace: candidates[i].face };
        }
        return { targetFace: candidates[0].face };
    }
});

// ── Algorithm 6: "xon-resonance" (Standing waves / normal modes) ──
// Phase-locked to a deterministic cycle from the pre-computed
// activation patterns. Flexible: if current state drifts too far
// from target, switches to the closest achievable pattern.
QUARK_ALGO_REGISTRY.push({
    name: 'xon-resonance',
    description: 'Standing wave: phase-locked to pre-computed activation pattern cycle',
    minDwell: 2,
    timeout: 6,
    _patternPhase: 0, // which of the 9 derangements we're using

    stepQuark: _xonStep,

    shouldHop(e, groupFaces, occupiedFaces, ctx) {
        const sif = e._stepsInFace || 0;
        if (sif < this.minDwell) return null;
        const fd = ctx.tetFaceData[e._currentFace];
        const tetFull = fd && fd.scIds.every(id => ctx.allOpen.has(id));
        if (!tetFull && sif < this.timeout) return null;

        // Determine target face from the pattern cycle
        // Pattern period = 4 (one full rotation through 4 group faces)
        const cycleIdx = Math.floor(ctx.nucleusTick / 3) % 4; // hop every ~3 ticks
        const targetFace = groupFaces[cycleIdx];

        if (targetFace === e._currentFace) return null;
        if (occupiedFaces.has(targetFace)) {
            // Target occupied — find next available in cycle
            for (let offset = 1; offset < groupFaces.length; offset++) {
                const alt = groupFaces[(cycleIdx + offset) % groupFaces.length];
                if (!occupiedFaces.has(alt) && alt !== e._currentFace) {
                    return { targetFace: alt };
                }
            }
            return null;
        }
        return { targetFace };
    }
});

// ── Algorithm 7: "xon-cooperative" (Many-body / entanglement) ──
// Xons coordinate: each checks what others are doing and avoids
// duplication. Collectively maximizes coverage spread.
QUARK_ALGO_REGISTRY.push({
    name: 'xon-cooperative',
    description: 'Many-body coordination: xons communicate to avoid duplication and maximize spread',
    minDwell: 3,
    timeout: 10,

    stepQuark: _xonStep,

    shouldHop(e, groupFaces, occupiedFaces, ctx) {
        const sif = e._stepsInFace || 0;
        if (sif < this.minDwell) return null;
        const fd = ctx.tetFaceData[e._currentFace];
        const tetFull = fd && fd.scIds.every(id => ctx.allOpen.has(id));
        if (!tetFull && sif < this.timeout) return null;

        // Count xons per face in this group
        const facePop = {};
        for (const f of groupFaces) facePop[f] = 0;
        for (const q of ctx.quarkList) {
            if (q._hopGroup === e._hopGroup) facePop[q._currentFace]++;
        }

        // Only hop if current face is "over-populated" or has excess coverage
        const actMap = _tetActivationMap(ctx);
        const myPop = facePop[e._currentFace] || 0;
        if (myPop <= 1) {
            // I'm the only one here — only leave if coverage is excessive
            const curCov = actMap[e._currentFace]?.totalCov || 0;
            const avgCov = Object.values(actMap).reduce((s, a) => s + a.totalCov, 0)
                / Object.keys(actMap).length;
            if (curCov <= avgCov * 1.2) return null;
        }

        const unoccupied = groupFaces.filter(f => !occupiedFaces.has(f));
        if (unoccupied.length === 0) return null;

        // Target: face with fewest xons AND lowest coverage
        let bestFace = unoccupied[0], bestScore = Infinity;
        for (const f of unoccupied) {
            const pop = facePop[f] || 0;
            const cov = actMap[f]?.totalCov || 0;
            const score = pop * 100 + cov; // population dominates
            if (score < bestScore) { bestScore = score; bestFace = f; }
        }
        return { targetFace: bestFace };
    }
});

// ── Algorithm 8: "xon-flux-tube" (QCD string/confinement) ──
// Xons prefer to maintain connected "flux tubes" of open SCs.
// They hop along the bosonic cage's edges, extending activation
// along the octahedral adjacency graph.
QUARK_ALGO_REGISTRY.push({
    name: 'xon-flux-tube',
    description: 'QCD confinement: xons extend flux tubes along connected SC chains',
    minDwell: 3,
    timeout: 8,

    stepQuark(e, freeOpts, costlyOpts, tetSCsOpen, faceData, ctx) {
        // Flux tube preference: free edges that connect to other active tets
        if (freeOpts.length > 0) {
            // Prefer edges toward oct nodes shared with other actualized tets
            const actMap = _tetActivationMap(ctx);
            const scored = freeOpts.map(opt => {
                let connectivity = 0;
                // Check if dest node is shared with another active tet
                for (const [fId, fd] of Object.entries(ctx.tetFaceData)) {
                    if (String(fId) === String(e._currentFace)) continue;
                    if (actMap[fId]?.full && fd.allNodes.includes(opt.dest)) {
                        connectivity++;
                    }
                }
                return { ...opt, connectivity };
            });
            scored.sort((a, b) => b.connectivity - a.connectivity);
            if (scored[0].connectivity > 0) return scored[0];
        }
        // Fall back to standard xon step
        return _xonStep(e, freeOpts, costlyOpts, tetSCsOpen, faceData, ctx);
    },

    shouldHop(e, groupFaces, occupiedFaces, ctx) {
        const sif = e._stepsInFace || 0;
        if (sif < this.minDwell) return null;
        const fd = ctx.tetFaceData[e._currentFace];
        const tetFull = fd && fd.scIds.every(id => ctx.allOpen.has(id));
        if (!tetFull && sif < this.timeout) return null;

        const unoccupied = groupFaces.filter(f => !occupiedFaces.has(f));
        if (unoccupied.length === 0) return null;

        // Prefer faces adjacent on the octahedron (sharing an oct node)
        const curDef = DEUTERON_TET_FACES[e._currentFace];
        if (!curDef) return { targetFace: unoccupied[0] };

        const adjacent = unoccupied.filter(f => {
            const tgtDef = DEUTERON_TET_FACES[f];
            if (!tgtDef) return false;
            return curDef.octNodes.some(n => tgtDef.octNodes.includes(n));
        });

        const actMap = _tetActivationMap(ctx);
        const candidates = (adjacent.length > 0 ? adjacent : unoccupied);

        // Among candidates, prefer least-covered
        let bestFace = candidates[0], minCov = Infinity;
        for (const f of candidates) {
            const cov = actMap[f]?.totalCov || 0;
            if (cov < minCov) { minCov = cov; bestFace = f; }
        }

        if (Math.random() >= 0.35) return null;
        return { targetFace: bestFace };
    }
});
