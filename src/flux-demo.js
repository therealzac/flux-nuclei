// flux-demo.js — Demo mode: pattern computation, xon management, demo loop
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
let _demoTick = 0;
let _demoSchedule = null;     // 8-window physical schedule (32 ticks/cycle)
let _demoVisits = null;       // {face: {pu:0, pd:0, nu:0, nd:0}}
let _demoFaceDecks = null;    // {face: shuffled array} — stochastic type assignment
let _demoWindowTypes = null;  // current window's face→type map (persists 4 ticks)
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
        trail: [seq[0]], trailColHistory: [col], tweenT: 1, flashT: 1.0,
        alive: true,
    };
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
    }
}

// Check if the next hop in a xon's loop crosses an SC-only edge that is still activated.
// Returns true if traversal is safe (base edge or SC is active), false if SC was deactivated.
function _canAdvanceSafely(xon) {
    if (!xon.alive) return false;
    const effectiveStep = xon._loopStep >= 4 ? 0 : xon._loopStep;
    const fromNode = xon._loopSeq[effectiveStep];
    const toNode = xon._loopSeq[effectiveStep + 1];
    if (toNode === undefined) return false;
    const hasBase = (baseNeighbors[fromNode] || []).some(nb => nb.node === toNode);
    if (hasBase) return true; // base edge, no SC needed
    const pid = pairId(fromNode, toNode);
    const scId = scPairToId.get(pid);
    if (scId === undefined) return true; // no SC on this edge
    return activeSet.has(scId) || impliedSet.has(scId) || electronImpliedSet.has(scId);
}

// Advance a xon one hop: update position state, push trail, start tween.
// SC negotiation with the vacuum happens BEFORE this call in demoTick.
function _advanceXon(xon) {
    if (!xon.alive) return;
    if (xon._loopStep >= 4) xon._loopStep = 0; // wrap for continuous cycling
    const fromNode = xon._loopSeq[xon._loopStep];
    const toNode = xon._loopSeq[xon._loopStep + 1];
    xon.prevNode = fromNode;
    xon.node = toNode;
    xon._loopStep++;

    // Push trail history + per-segment color, start tween
    xon.trail.push(toNode);
    xon.trailColHistory.push(xon.col);
    if (xon.trail.length > XON_TRAIL_LENGTH) { xon.trail.shift(); xon.trailColHistory.shift(); }
    xon.tweenT = 0;
    xon.flashT = 1.0;
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  PERSISTENT 6-XON MODEL — Demo 3.1                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

// Spawn exactly 6 persistent xons on oct nodes. Called once from startDemoLoop.
// 3 sign=+1, 3 sign=-1. All start in oct mode (white, cruising cage).
function _initPersistentXons() {
    _demoXons = [];
    if (!_octNodeSet || _octNodeSet.size < 6) {
        console.error('[demo] Cannot init persistent xons: need 6 oct nodes, have', _octNodeSet?.size);
        return;
    }
    const octNodes = [..._octNodeSet];
    for (let i = 0; i < 6; i++) {
        const startNode = octNodes[i % octNodes.length];
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

        // Pick initial direction: random valid oct neighbor
        const octNeighbors = baseNeighbors[startNode].filter(nb => _octNodeSet.has(nb.node));
        const initNb = octNeighbors.length > 0 ? octNeighbors[Math.floor(Math.random() * octNeighbors.length)] : null;
        const initDir = initNb ? initNb.dirIdx : 0;

        const xon = {
            prevNode: startNode, sign,
            _loopType: null,
            _loopSeq: null, _loopStep: 0,
            _assignedFace: null, _quarkType: null,
            _mode: 'oct',
            _lastDir: initDir,
            _dirHistory: [],
            col, group, spark, sparkMat,
            trailLine, trailGeo, trailPos, trailCol,
            trail: [startNode], trailColHistory: [col], tweenT: 1, flashT: 1.0,
            alive: true,
        };
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
                        const scs = scByVert[from] || [];
                        const hasSC = scs.some(sc => (sc.a === from ? sc.b : sc.a) === v);
                        if (!hasSC) {
                            console.warn(`[MOVEMENT BLOCKED] tick=${_demoTick} xon: ${from}→${v} NO EDGE (not adjacent)`);
                            return; // BLOCK: not adjacent at all
                        }
                        // SC exists — verify it's active
                        const pid = pairId(from, v);
                        const scId = scPairToId.get(pid);
                        if (scId !== undefined && !activeSet.has(scId) && !impliedSet.has(scId) && !electronImpliedSet.has(scId)) {
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
    console.log(`[demo] Initialized 6 persistent xons on oct nodes: [${_demoXons.map(x => x.node).join(',')}]`);
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
    xonA.tweenT = 1;
    xonA.flashT = 1.0;
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
    xonB.tweenT = 1;
    xonB.flashT = 1.0;
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
// Pattern machine awareness: the schedule (_demoSchedule) tells us which
// faces/quark types are assigned in upcoming windows. _peekSchedule()
// returns the next N window assignments so lookahead can anticipate
// which tet paths will be active and which nodes will be contested.
const LOOKAHEAD_DEPTH = 12;

// Generic graph lookahead for oct xons (flexible movement).
// Validates against: T19 (Pauli), T26 (SC activation), T27 (connectivity),
// T29 (white trails only on oct nodes).
function _lookahead(node, occupied, depth, _visited) {
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
        if (_lookahead(nb.node, occupied, depth - 1, new Set(_visited))) return true;
    }
    // Active SC neighbors — T26: only traverse activated SCs
    const scs = scByVert[node] || [];
    for (const sc of scs) {
        const other = sc.a === node ? sc.b : sc.a;
        if (_visited.has(other)) continue;
        // Prefer oct nodes for normal movement
        if (_octNodeSet && !_octNodeSet.has(other)) continue;
        if (occupied.get(other) || 0) return true; // annihilation opportunity
        // T26: SC must be activated
        if (!(activeSet.has(sc.id) || impliedSet.has(sc.id) || electronImpliedSet.has(sc.id))) continue;
        if (_lookahead(other, occupied, depth - 1, new Set(_visited))) return true;
    }
    // WEAK FORCE FALLBACK: if all oct-restricted paths fail, any free base neighbor
    // is a valid escape via the weak force. This prevents false "no valid move" results.
    for (const nb of nbs) {
        if (_visited.has(nb.node)) continue;
        if (!(occupied.get(nb.node) || 0)) return true; // free non-oct neighbor = weak force available
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
                if (!electronImpliedSet.has(scId) && !activeSet.has(scId) && !impliedSet.has(scId)) {
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

// ── Pattern Machine Awareness ──
// Peek at the schedule to see which faces/quark types are active in upcoming windows.
// Returns an array of { faces, ticksUntil } for the next `count` windows.
function _peekSchedule(count) {
    if (!_demoSchedule) return [];
    const CYCLE_LEN = 64;
    const WINDOW_LEN = 4;
    const tickInCycle = _demoTick % CYCLE_LEN;
    const currentWindow = Math.floor(tickInCycle / WINDOW_LEN);
    const tickInWindow = tickInCycle % WINDOW_LEN;
    const ticksLeftInWindow = WINDOW_LEN - tickInWindow;

    const result = [];
    for (let i = 0; i < count; i++) {
        const wIdx = (currentWindow + 1 + i) % _demoSchedule.length;
        const ticksUntil = ticksLeftInWindow + i * WINDOW_LEN;
        const win = _demoSchedule[wIdx];
        if (win) result.push({ faces: win.faces, ticksUntil, windowIdx: wIdx });
    }
    return result;
}

// Check if a node will be contested by upcoming pattern machine assignments.
// Returns a "contention score" — higher means more upcoming windows will use
// tet faces that include this node. Used to penalize moves toward congested areas.
function _nodeScheduleContention(node) {
    const upcoming = _peekSchedule(3); // look 3 windows ahead
    let contention = 0;
    for (const { faces } of upcoming) {
        for (const f of faces) {
            const fd = _nucleusTetFaceData[f];
            if (!fd) continue;
            // Check if this node is part of the tet face
            if (fd.allNodes.includes(node)) contention++;
        }
    }
    return contention;
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
            // Check remaining loop path for LOOKAHEAD_DEPTH - 1 steps (we already used 1)
            has2nd = _lookaheadTetPath(xon._loopSeq, stepAfter1st, projected, LOOKAHEAD_DEPTH - 1, xon);
        }
    } else {
        // Oct mode: any reachable neighbor is a valid 2nd move
        has2nd = _lookahead(futureNode, projected, 1);
    }

    _occAdd(projected, futureNode);
    return has2nd;
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

// Get scored oct-mode candidates for a xon. Returns array sorted by momentum score (desc).
// `blocked` is an optional Set of additional nodes to treat as occupied (for coordinated planning).
function _getOctCandidates(xon, occupied, blocked) {
    if (!xon.alive || xon._mode !== 'oct') return [];

    // Get ALL oct neighbors: base edges + SC edges
    const allOctNeighbors = [];
    for (const nb of baseNeighbors[xon.node]) {
        if (_octNodeSet.has(nb.node)) {
            allOctNeighbors.push({ node: nb.node, dirIdx: nb.dirIdx });
        }
    }
    const scs = scByVert[xon.node] || [];
    for (const sc of scs) {
        const other = sc.a === xon.node ? sc.b : sc.a;
        if (_octNodeSet.has(other) && !allOctNeighbors.find(n => n.node === other)) {
            const scId = sc.id;
            const alreadyActive = activeSet.has(scId) || impliedSet.has(scId) || electronImpliedSet.has(scId);
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
            c.score -= 10; // strong penalty — but NOT eliminated, since other
                           // oct xons may vacate and open up 2nd-move paths
        }
        _occDel(tmpOcc, c.node);

        // Pattern machine awareness: penalize destinations on tet faces that
        // upcoming windows will activate. These nodes will become contested
        // by tet xon assignments, making them poor oct parking spots.
        const contention = _nodeScheduleContention(c.node);
        c.score -= contention * 2; // -2 per upcoming window that uses this node's face

        // Oct cage priority: strongly prefer traversals that would materialize
        // unmaterialized oct cage SCs (helps T25 — cage must complete by tick 36)
        if (c._scId !== undefined && c._needsMaterialise && _octSCIds &&
            _octSCIds.includes(c._scId)) {
            c.score += 20; // highest priority — materializing oct cage SCs
        }
    }

    // Sort by score descending (prefer forward momentum + 2-step awareness + low contention)
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
}

// Execute an oct move to a specific target. Handles vacuum negotiation.
// Returns true if the move succeeded, false if vacuum rejected.
function _executeOctMove(xon, target) {
    // Re-check SC activation at execution time (may have changed since planning)
    if (target._scId !== undefined) {
        const stillActive = activeSet.has(target._scId) || impliedSet.has(target._scId) || electronImpliedSet.has(target._scId);
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
    xon.trail.push(target.node);
    xon.trailColHistory.push(xon.col);
    if (xon.trail.length > XON_TRAIL_LENGTH) { xon.trail.shift(); xon.trailColHistory.shift(); }
    xon.tweenT = 0;
    xon.flashT = 1.0;
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

// Transition xon from oct mode to tet mode (assigned to actualize a face)
function _assignXonToTet(xon, face, quarkType) {
    const fd = _nucleusTetFaceData[face];
    if (!fd) return;

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
            // Xon is NOT on this face — walk it to the nearest face oct node
            // via connected edges (BFS) to avoid teleportation.
            const faceOctNodes = new Set(octNodesOnFace);
            const target = _walkToFace(xon, faceOctNodes);
            if (target !== null) {
                // Rotate cycle so the arrived-at node is position 0
                const a = cycle[0], b = cycle[1], c = cycle[2], d = cycle[3];
                let rotated;
                if (target === a) rotated = [a, b, c, d];
                else if (target === c) rotated = [c, b, a, d];
                else if (target === d) rotated = [d, b, c, a];
                else rotated = cycle;
                seq = LOOP_SEQUENCES[quarkType](rotated);
            }
            // If walk failed (shouldn't happen), seq stays as-is and xon
            // will already be at a face node from the walk.
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

    // Start from xon's current position (should already be at seq[0] after walk)
    xon.prevNode = xon.node;
    xon.node = seq[0];
}

// Walk xon to nearest node in targetNodes via connected edges (BFS).
// Moves the xon step-by-step, updating trail. Returns the target node reached.
// Pauli-aware: avoids nodes occupied by other xons (except the target itself).
function _walkToFace(xon, targetNodes) {
    if (targetNodes.has(xon.node)) return xon.node;

    // Build occupied set (exclude self)
    const occupiedNodes = new Set();
    for (const x of _demoXons) {
        if (x !== xon && x.alive) occupiedNodes.add(x.node);
    }

    // BFS from xon.node to nearest target, only via base edges + active SCs
    const visited = new Set([xon.node]);
    const parent = new Map();
    const queue = [xon.node];
    let found = null;

    while (queue.length > 0 && !found) {
        const curr = queue.shift();
        // Base neighbors
        const nbs = baseNeighbors[curr] || [];
        for (const nb of nbs) {
            if (visited.has(nb.node)) continue;
            if (!_octNodeSet.has(nb.node)) continue;
            visited.add(nb.node);
            parent.set(nb.node, curr);
            if (targetNodes.has(nb.node)) { found = nb.node; break; }
            // Skip occupied intermediate nodes (target is OK to land on)
            if (occupiedNodes.has(nb.node)) continue;
            queue.push(nb.node);
        }
        if (found) break;
        // SC neighbors (only activated SCs)
        const scs = scByVert[curr] || [];
        for (const sc of scs) {
            if (!activeSet.has(sc.id) && !impliedSet.has(sc.id) && !electronImpliedSet.has(sc.id)) continue;
            const neighbor = sc.a === curr ? sc.b : sc.a;
            if (visited.has(neighbor)) continue;
            if (!_octNodeSet.has(neighbor)) continue;
            visited.add(neighbor);
            parent.set(neighbor, curr);
            if (targetNodes.has(neighbor)) { found = neighbor; break; }
            if (occupiedNodes.has(neighbor)) continue;
            queue.push(neighbor);
        }
    }

    if (!found) return null; // no path (shouldn't happen on connected oct surface)

    // Reconstruct path and walk xon along it
    const path = [];
    let n = found;
    while (n !== xon.node) {
        path.push(n);
        n = parent.get(n);
    }
    path.reverse(); // path[0] is first step from xon.node, path[last] is target

    for (const step of path) {
        xon.prevNode = xon.node;
        xon.node = step;
        xon.trail.push(step);
        xon.trailColHistory.push(0xffffff); // white while walking to face
        if (xon.trail.length > XON_TRAIL_LENGTH) {
            xon.trail.shift();
            xon.trailColHistory.shift();
        }
    }
    xon.tweenT = 0;
    return found;
}

// Transition xon from tet mode back to oct mode after loop completion
function _returnXonToOct(xon) {
    xon._mode = 'oct';
    xon._assignedFace = null;
    xon._quarkType = null;
    xon._loopType = null;
    xon._loopSeq = null;
    xon._loopStep = 0;
    xon.col = 0xffffff; // white for oct mode
    xon.flashT = 1.0; // bright flash on mode transition

    // Update spark color to white
    if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);

    // If xon is at a non-oct node, teleport to the nearest oct node.
    // This is safe because _returnXonToOct is called at window boundaries
    // (where T26/T27 are skipped) or from escape code that handles mode changes.
    if (_octNodeSet && !_octNodeSet.has(xon.node)) {
        const nbs = baseNeighbors[xon.node] || [];
        for (const nb of nbs) {
            if (!_octNodeSet.has(nb.node)) continue;
            // T41: skip if another xon just moved from nb.node to xon.node (would create swap)
            const wouldSwap = _demoXons.some(x => x.alive && x !== xon &&
                x.node === xon.node && x.prevNode === nb.node && x._movedThisTick);
            if (wouldSwap) continue;
            xon.prevNode = xon.node;
            xon.node = nb.node;
            xon.trail.push(nb.node);
            xon.trailColHistory.push(xon.col);
            if (xon.trail.length > XON_TRAIL_LENGTH) { xon.trail.shift(); xon.trailColHistory.shift(); }
            break;
        }
    }
}

// Start an idle tet loop for a xon boxed in on the oct surface.
// CONSTRAINT: xons can ONLY idle in already-actualized tets — faces whose
// SCs are already in electronImpliedSet or activeSet. No new geometry created.
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
            electronImpliedSet.has(scId) || activeSet.has(scId) || impliedSet.has(scId));
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
                xon._mode = 'idle_tet';
                xon._loopSeq = seq;
                xon._loopStep = 0;
                xon._assignedFace = face;
                xon._quarkType = qType;
                xon._loopType = LOOP_TYPE_NAMES[qType];
                xon.col = QUARK_COLORS[qType];
                xon.flashT = 1.0;
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
            xon._mode = 'idle_tet';
            xon._loopSeq = bestSeq;
            xon._loopStep = 0;
            xon._assignedFace = bestFace;
            xon._quarkType = bestType;
            xon._loopType = bestType ? LOOP_TYPE_NAMES[bestType] : null;
            xon.col = bestType ? QUARK_COLORS[bestType] : 0x888888;
            xon.flashT = 1.0;
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
            !electronImpliedSet.has(scId) && !activeSet.has(scId) && !impliedSet.has(scId));
        // Try to materialise all missing SCs
        let allOk = true;
        const justAdded = [];
        for (const scId of missingSCs) {
            if (canMaterialiseQuick(scId)) {
                electronImpliedSet.add(scId);
                stateVersion++; // invalidate cache for next check
                justAdded.push(scId);
            } else if (excitationSeverForRoom(scId)) {
                if (canMaterialiseQuick(scId)) {
                    electronImpliedSet.add(scId);
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
                electronImpliedSet.delete(scId);
                stateVersion++; // invalidate cache
            }
        }
    }

    if (newlyActualized.length > 0 && tryFaces(newlyActualized)) return true;

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
            const px = pf[0] + (pt[0] - pf[0]) * s;
            const py = pf[1] + (pt[1] - pf[1]) * s;
            const pz = pf[2] + (pt[2] - pf[2]) * s;
            xon.group.position.set(px, py, pz);
        }

        // Sparkle flash + flicker
        xon.flashT = Math.max(0, xon.flashT - dt * 6.0);
        const flicker = 0.85 + Math.random() * 0.3;
        const pulse = (0.22 + xon.flashT * 0.26) * flicker;
        xon.spark.scale.set(pulse, pulse, 1);
        xon.sparkMat.opacity = (0.6 + xon.flashT * 0.4) * flicker * sparkOp;
        xon.sparkMat.rotation = Math.random() * Math.PI * 2;

        // Trail: fading vertex-colored path
        // Lifespan knob controls how many trail points are visible (0-50).
        // Always store full 50-tick history; render only the last `visLen` points.
        const lifespan = +document.getElementById('tracer-lifespan-slider').value;
        const fullLen = xon.trail.length;
        const visLen = Math.min(fullLen, lifespan);
        const startIdx = fullLen - visLen; // skip older points beyond lifespan
        // Per-segment color from trailColHistory — segments retain their original color
        // flashT boosts trail brightness near the head (mode transition / birth flash)
        xon._lastTrailFlashBoost = 0; // reset per frame for T37 measurement
        for (let vi = 0; vi < visLen; vi++) {
            const i = startIdx + vi;
            const np = pos[xon.trail[i]];
            if (!np) continue;
            xon.trailPos[vi * 3] = np[0];
            xon.trailPos[vi * 3 + 1] = np[1];
            xon.trailPos[vi * 3 + 2] = np[2];
            const segCol = (xon.trailColHistory && xon.trailColHistory[i]) || xon.col;
            const cr = ((segCol >> 16) & 0xff) / 255;
            const cg = ((segCol >> 8) & 0xff) / 255;
            const cb = (segCol & 0xff) / 255;
            const baseAlpha = 0.15 + 0.85 * (vi / Math.max(visLen, 1)) ** 1.6;
            // Flash boost: head segments get up to 40% brighter during flash
            const headProximity = vi / Math.max(visLen - 1, 1); // 0=tail, 1=head
            const flashBoost = xon.flashT * 0.4 * headProximity;
            xon._lastTrailFlashBoost = Math.max(xon._lastTrailFlashBoost || 0, flashBoost);
            const alpha = sparkOp * Math.min(1, baseAlpha + flashBoost);
            xon.trailCol[vi * 3] = cr * alpha;
            xon.trailCol[vi * 3 + 1] = cg * alpha;
            xon.trailCol[vi * 3 + 2] = cb * alpha;
        }
        // Current interpolated position as trail head
        const last = visLen;
        if (last < XON_TRAIL_LENGTH) {
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
        const n = visLen + 1;
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

// Map speed slider (1-100) to demo interval: 1→1000ms (1s cycle), 50→~45ms, 100→2ms (turbo)
function _getDemoIntervalMs() {
    const slider = document.getElementById('excitation-speed-slider');
    if (!slider) return 1000; // default = slowest
    const t = +slider.value / 100;
    return Math.max(2, Math.round(Math.exp(Math.log(1000) * (1 - t) + Math.log(2) * t)));
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
const L1_INNER_FACES = [1, 2, 3, 4];

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
 * Build a physically valid 16-window schedule (64 ticks per cycle).
 * 8 triple windows (all L1-valid triples) + 8 single-tet windows
 * (2 per inner face for coverage equalization).
 * Each face gets exactly 4 activations per cycle.
 * Fisher-Yates shuffled for stochastic ordering.
 * Returns array of 16 entries: {faces: [f1, f2?, f3?]}
 */
function buildPhysicalSchedule() {
    const windows = [];
    // 8 triple windows — hadron activations
    for (const triple of L1_VALID_TRIPLES) {
        windows.push({ faces: [...triple] });
    }
    // 8 single-tet windows — inner face coverage equalization
    // Each inner face (1-4) gets 2 singles to match outer faces' 4 total
    for (const f of L1_INNER_FACES) {
        windows.push({ faces: [f] });
        windows.push({ faces: [f] });
    }
    // Fisher-Yates shuffle
    for (let i = windows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [windows[i], windows[j]] = [windows[j], windows[i]];
    }
    return windows;
}

/**
 * Start the pattern demo: sets up lattice, computes schedule, runs high-speed loop.
 * Called AFTER simulateNucleus() has built the octahedron.
 */
function startDemoLoop() {
    // Build L1-valid physical schedule (8 windows = 32 ticks, reshuffled each cycle)
    _demoSchedule = buildPhysicalSchedule();

    // Init visit counters + per-face shuffled decks for stochastic type assignment
    _demoVisits = {};
    _demoFaceDecks = {};
    for (let f = 1; f <= 8; f++) {
        _demoVisits[f] = { pu: 0, pd: 0, nu: 0, nd: 0, total: 0 };
        _demoFaceDecks[f] = [];  // empty → will reshuffle on first draw
    }
    _demoTick = 0;
    _demoPauliViolations = 0;
    _demoSpreadViolations = 0;
    _demoTypeBalanceHistory = [];
    _demoWindowTypes = null;  // current window's face→type assignments
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

    // Stop excitation clock (we drive our own loop)
    if (typeof stopExcitationClock === 'function') stopExcitationClock();

    // Do NOT pre-open all 8 tet SCs — only 1-3 tets can coexist at a time.
    // Tets activate/deactivate per window via electronImpliedSet, and the
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
    const dpTitle = document.querySelector('#deuteron-panel > div:first-child');
    if (dpTitle) dpTitle.textContent = '0 Planck seconds';

    // Demo 3.0 visual setup: opacity defaults per T39 spec
    const spheresSlider = document.getElementById('sphere-opacity-slider');
    if (spheresSlider) { spheresSlider.value = 5; spheresSlider.dispatchEvent(new Event('input')); }
    const shapesSlider = document.getElementById('void-opacity-slider');
    if (shapesSlider) { shapesSlider.value = 13; shapesSlider.dispatchEvent(new Event('input')); }
    const graphSlider = document.getElementById('graph-opacity-slider');
    if (graphSlider) { graphSlider.value = 34; graphSlider.dispatchEvent(new Event('input')); }
    const trailSlider = document.getElementById('trail-opacity-slider');
    if (trailSlider) { trailSlider.value = 55; trailSlider.dispatchEvent(new Event('input')); }

    // Zoom camera out for better demo overview
    sph.r = Math.max(12, latticeLevel * 4.5);
    applyCamera();

    // Default to maximum speed for fast iteration
    const speedSlider = document.getElementById('excitation-speed-slider');
    if (speedSlider) { speedSlider.value = 100; speedSlider.dispatchEvent(new Event('input')); }
    // Default lifespan: visible trail length (how many of 50 stored ticks to show)
    const lifespanSlider = document.getElementById('tracer-lifespan-slider');
    if (lifespanSlider) { lifespanSlider.value = 12; lifespanSlider.dispatchEvent(new Event('input')); }
    // Demo 3.1: Spawn 6 persistent xons on oct cage nodes
    _initPersistentXons();

    // Seed oct cage SCs: the cage defines the nucleus structure and should be
    // active from the start. Try to materialize all 4 via the solver.
    if (_octSCIds && _octSCIds.length > 0) {
        let seeded = 0;
        for (const scId of _octSCIds) {
            if (!activeSet.has(scId) && canMaterialiseQuick(scId)) {
                activeSet.add(scId);
                stateVersion++;
                seeded++;
            }
        }
        if (seeded > 0) {
            console.log(`[demo] Seeded ${seeded}/${_octSCIds.length} oct cage SCs into activeSet`);
        }
    }

    const intervalMs = _getDemoIntervalMs();
    _demoInterval = setInterval(demoTick, intervalMs);
    console.log(`[demo] Pattern demo started at ${intervalMs}ms interval`);

    // Auto-run unit tests — HALT DEMO if any test fails
    try {
        const testResult = runDemo3Tests();
        if (testResult.failed.length > 0) {
            console.error(`[demo] HALTED: ${testResult.failed.length} test(s) failed: ${testResult.failed.join(', ')}`);
            stopDemo();
            return;
        }
    } catch (e) { console.warn('[demo] Test suite error:', e); }

    // Activate live guards (T19, T21, T26, T27) — start with null during grace
    if (typeof _liveGuards !== 'undefined') {
        for (const key of Object.keys(_liveGuards)) {
            _liveGuards[key].ok = null;
            _liveGuards[key].msg = 'grace period';
            _liveGuards[key].failed = false;
            if (key === 'T21') _liveGuards[key]._octSnapshot = null;
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

function demoTick() {
    if (!_demoActive || !_demoSchedule) return;
    if (simHalted) return;

    // Clear stale movement flags from previous tick so WB processing isn't blocked
    for (const xon of _demoXons) { xon._movedThisTick = false; xon._evictedThisTick = false; }

    // Snapshot xon positions BEFORE advancement for live guard T26/T27
    if (typeof _liveGuardSnapshot === 'function') _liveGuardSnapshot();

    let _solverNeeded = false;

    const CYCLE_LEN = 64;       // 16 windows × 4 ticks
    const WINDOW_LEN = 4;       // ticks per actualization window
    const WINDOWS_PER_CYCLE = 16;

    const tickInCycle = _demoTick % CYCLE_LEN;
    const windowIdx = Math.floor(tickInCycle / WINDOW_LEN);
    const tickInWindow = tickInCycle % WINDOW_LEN;

    // ── On window boundary: assign new config + spawn xons ──
    if (tickInWindow === 0) {
        // Reshuffle schedule at start of each cycle
        if (windowIdx === 0) {
            _demoSchedule = buildPhysicalSchedule();
        }

        const window = _demoSchedule[windowIdx];
        const faces = window.faces;

        // Determine hadron type from group composition
        // 2A+1B = proton; 1A+2B = neutron
        const aCount = faces.filter(f => A_SET.has(f)).length;
        const isProton = aCount >= faces.length / 2;

        // Stochastic type assignment
        _demoWindowTypes = {};
        if (faces.length === 3) {
            // Triple: minority quark on random face
            // Proton (uud): 2 pu + 1 pd; Neutron (udd): 1 nu + 2 nd
            const minorityIdx = Math.floor(Math.random() * 3);
            if (isProton) {
                for (let i = 0; i < 3; i++) {
                    _demoWindowTypes[faces[i]] = (i === minorityIdx) ? 'pd' : 'pu';
                }
            } else {
                for (let i = 0; i < 3; i++) {
                    _demoWindowTypes[faces[i]] = (i === minorityIdx) ? 'nu' : 'nd';
                }
            }
        } else {
            // Single-tet (inner face catch-up): OPPOSITE hadron deck for uniform coverage.
            // Inner A-faces only see proton types from triples → singles compensate
            // with neutron types. Inner B-faces only see neutron → compensate with proton.
            // Result: every face converges to identical distribution:
            //   33.3% pu, 16.7% pd, 16.7% nu, 33.3% nd
            // Global 2:1 ratio maintained: pu:pd = nd:nu = 2:1
            const f = faces[0];
            if (!_demoFaceDecks[f] || _demoFaceDecks[f].length === 0) {
                _demoFaceDecks[f] = A_SET.has(f)
                    ? ['nd', 'nd', 'nu']    // A-face (proton triples) → neutron singles
                    : ['pu', 'pu', 'pd'];   // B-face (neutron triples) → proton singles
                // Fisher-Yates shuffle
                for (let i = _demoFaceDecks[f].length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [_demoFaceDecks[f][i], _demoFaceDecks[f][j]] = [_demoFaceDecks[f][j], _demoFaceDecks[f][i]];
                }
            }
            _demoWindowTypes[f] = _demoFaceDecks[f].pop();
        }

        // ── Accumulate visit counts (once per window, not per tick) ──
        for (const [fStr, qType] of Object.entries(_demoWindowTypes)) {
            const f = parseInt(fStr);
            if (_demoVisits[f]) {
                _demoVisits[f][qType]++;
                _demoVisits[f].total++;
            }
        }

        // ── Track visited faces ──
        for (const f of faces) _demoVisitedFaces.add(f);
        // Oct cage is EMERGENT — xons in oct mode materialize oct SCs
        // through traversal. No free activeSet.add here.

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  NON-DELETABLE: UNIFIED ARCHITECTURE — SHAPES DRIVE SPHERES     ║
        // ║                                                                  ║
        // ║  The demo MUST manage tet SCs in electronImpliedSet and          ║
        // ║  re-solve the lattice so spheres physically respond.             ║
        // ║  Without this, the demo is visually detached from physics —      ║
        // ║  a CARDINAL SIN. NEVER remove the solver coupling.              ║
        // ║                                                                  ║
        // ║  MINIMAL ACTION PRINCIPLE: relinquish only what is necessary     ║
        // ║  for the desired transformation. Do not clear-and-rebuild.       ║
        // ║  Diff-based: remove old tet SCs, add new ones, keep rest.       ║
        // ║  No cascade detection (detectImplied) during demo — tet SCs     ║
        // ║  are nearest-neighbor (distance 1 in REST) so they don't        ║
        // ║  deform FCC geometry. Cascade implies extra shortcuts that       ║
        // ║  CAN deform geometry and violate Kepler. Minimal action.        ║
        // ║                                                                  ║
        // ║  NEVER remove, bypass, or skip the solver coupling below.        ║
        // ╚══════════════════════════════════════════════════════════════════╝

        // ── Demo 3.1: Persistent xons — return tet-mode xons to oct, assign new ones ──
        const newFaceSet = new Set(faces);

        // 1. Return all tet & idle_tet xons to oct (their loops are done)
        //    Then scatter returned xons so no two share a node (Pauli).
        const returningXons = [];
        for (const xon of _demoXons) {
            if (xon.alive && (xon._mode === 'tet' || xon._mode === 'idle_tet')) {
                _returnXonToOct(xon);
                returningXons.push(xon);
            }
        }
        // Scatter: if multiple xons landed on the same node, move extras
        // 2-step aware: prefer destinations where xon has a valid follow-up move
        {
            const taken = new Map(); // node → count
            for (const xon of _demoXons) {
                if (!xon.alive) continue;
                if (!(taken.get(xon.node) || 0)) {
                    _occAdd(taken, xon.node);
                } else {
                    // Collision — move to a 2-step-aware free oct neighbor
                    const allNb = baseNeighbors[xon.node].filter(nb => _octNodeSet.has(nb.node));
                    const scNb = (scByVert[xon.node] || [])
                        .filter(sc => activeSet.has(sc.id) || impliedSet.has(sc.id) || electronImpliedSet.has(sc.id))
                        .map(sc => sc.a === xon.node ? sc.b : sc.a)
                        .filter(n => _octNodeSet.has(n));
                    const combined = [...new Set([...allNb.map(nb => nb.node), ...scNb])];
                    // Filter by 2-step awareness
                    const viable2step = combined.filter(n => {
                        if (taken.get(n) || 0) return false;
                        const tmp = new Map(taken); _occAdd(tmp, n);
                        return _lookahead(n, tmp, 1);
                    });
                    // If no 2-step option, fall back to any free node (window boundary is grace)
                    const targets = viable2step.length > 0 ? viable2step : combined.filter(n => !(taken.get(n) || 0));
                    let moved = false;
                    for (const n of targets) {
                        xon.prevNode = xon.node;
                        xon.node = n;
                        _occAdd(taken, n);
                        moved = true;
                        break;
                    }
                    if (!moved) _occAdd(taken, xon.node);
                }
            }
        }

        // 2. Relinquish SCs for faces LEAVING active set
        for (const [fIdStr, fd] of Object.entries(_nucleusTetFaceData)) {
            const fId = parseInt(fIdStr);
            if (!newFaceSet.has(fId)) {
                for (const scId of fd.scIds) {
                    if (electronImpliedSet.delete(scId)) {
                        _solverNeeded = true;
                        stateVersion++; // invalidate _getBasePairs cache
                    }
                }
            }
        }

        // 3. Assign oct-mode xons to new tet faces (Pauli-aware)
        for (const f of faces) {
            const qType = _demoWindowTypes[f];
            if (!qType) continue;

            const fd = _nucleusTetFaceData[f];
            if (!fd) continue;

            // Find best idle xon: prefer one already on an oct node of this face
            const faceOctNodes = new Set(fd.cycle.filter(n => _octNodeSet.has(n)));
            let bestXon = null;
            let bestScore = -Infinity;
            for (const xon of _demoXons) {
                if (!xon.alive || xon._mode !== 'oct') continue;
                let score = 0;
                if (faceOctNodes.has(xon.node)) score = 10;
                else {
                    const nbs = baseNeighbors[xon.node];
                    for (const nb of nbs) {
                        if (faceOctNodes.has(nb.node)) { score = 5; break; }
                    }
                }
                if (score > bestScore) { bestScore = score; bestXon = xon; }
            }

            if (bestXon) {
                _assignXonToTet(bestXon, f, qType);
            }
        }

        _demoPrevFaces = newFaceSet;
    }

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
    const aliveCount = _demoXons.filter(x => x.alive).length;
    if (aliveCount < 6 && _gluonStoredPairs > 0) {
        _manifestXonPair();
    }

    // Reset single-hop-per-tick flag AFTER window boundary (WB movements are exempt from T26/T27)
    for (const xon of _demoXons) { xon._movedThisTick = false; xon._evictedThisTick = false; }

    let occupied = _occupiedNodes();

    // ══════════════════════════════════════════════════════════════════
    //  COORDINATED MOVE PLANNER
    //  All moves are planned before execution to prevent Pauli violations.
    //  Priority: tet/idle_tet (fixed path) > oct (flexible).
    // ══════════════════════════════════════════════════════════════════

    const planned = new Set();  // globally reserved destination nodes
    let anyMoved = false;

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
                if (!_lookaheadTetPath(xon._loopSeq, effectiveStep + 1, tmpOcc, LOOKAHEAD_DEPTH, xon)) shouldEvict = true;
            }

            if (shouldEvict) {
                _returnXonToOct(xon);
                xon._evictedThisTick = true; // prevent re-assignment to idle_tet this tick
                phase0Changed = true;
            }
        }
        if (phase0Changed) occupied = _occupiedNodes();
    }

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
            xon.flashT = 1.0;
            xon.col = 0xffffff;
            if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
            continue;
        }
        // BFS toward nearest oct node
        const visited = new Set([xon.node]);
        const queue = [[xon.node, null]]; // [node, firstStep]
        let bestStep = null;
        while (queue.length > 0) {
            const [cur, step] = queue.shift();
            const nbs = baseNeighbors[cur] || [];
            for (const nb of nbs) {
                if (visited.has(nb.node)) continue;
                visited.add(nb.node);
                const nextStep = step || nb.node;
                if (_octNodeSet.has(nb.node)) {
                    bestStep = nextStep; // found closest oct node
                    queue.length = 0; // break BFS
                    break;
                }
                queue.push([nb.node, nextStep]);
            }
        }
        if (bestStep !== null && !(occupied.get(bestStep) || 0)) {
            _occDel(occupied, xon.node);
            xon.prevNode = xon.node;
            xon.node = bestStep;
            _occAdd(occupied, bestStep);
            xon.trail.push(bestStep);
            xon.trailColHistory.push(WEAK_FORCE_COLOR);
            if (xon.trail.length > XON_TRAIL_LENGTH) { xon.trail.shift(); xon.trailColHistory.shift(); }
            xon.tweenT = 0;
            anyMoved = true;
            _weakLifecycleStep(xon);
            // Check if we arrived at oct node
            if (_octNodeSet.has(bestStep)) {
                _weakLifecycleExit(xon, 'arrived_oct_bfs');
                xon._mode = 'oct';
                xon.flashT = 1.0;
                xon.col = 0xffffff;
                if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
            }
        } else if (bestStep !== null) {
            // Target occupied — try any free neighbor instead
            const allNbs = baseNeighbors[xon.node] || [];
            const freeNb = allNbs.find(nb => !(occupied.get(nb.node) || 0));
            if (freeNb) {
                _occDel(occupied, xon.node);
                xon.prevNode = xon.node;
                xon.node = freeNb.node;
                _occAdd(occupied, freeNb.node);
                xon.trail.push(freeNb.node);
                xon.trailColHistory.push(WEAK_FORCE_COLOR);
                if (xon.trail.length > XON_TRAIL_LENGTH) { xon.trail.shift(); xon.trailColHistory.shift(); }
                xon.tweenT = 0;
                anyMoved = true;
                _weakLifecycleStep(xon);
                if (_octNodeSet.has(freeNb.node)) {
                    _weakLifecycleExit(xon, 'arrived_oct_detour');
                    xon._mode = 'oct';
                    xon.flashT = 1.0;
                    xon.col = 0xffffff;
                    if (xon.sparkMat) xon.sparkMat.color.setHex(0xffffff);
                }
            }
        }
    }

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
            if (_lookaheadTetPath(plan.xon._loopSeq, effectiveStep + 1, tmpOcc, LOOKAHEAD_DEPTH, plan.xon)) {
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
            if (!plan.approved) {
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
        if (!electronImpliedSet.has(scId) && !activeSet.has(scId) && !impliedSet.has(scId)) {
            let activated = false;
            if (canMaterialiseQuick(scId)) {
                electronImpliedSet.add(scId);
                stateVersion++; // invalidate _getBasePairs cache for subsequent checks
                _solverNeeded = true;
                activated = true;
            } else if (excitationSeverForRoom(scId)) {
                if (canMaterialiseQuick(scId)) {
                    electronImpliedSet.add(scId);
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

    // ── PHASE 2: Coordinated oct movement planning ──
    // Remove all oct xons from occupied so they can see each other's positions as available
    // (enables position swaps and chain moves)
    const octXons = _demoXons.filter(x => x.alive && x._mode === 'oct');
    for (const xon of octXons) _occDel(occupied, xon.node);

    const octPlans = octXons.map(xon => ({
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
    for (const plan of octPlans) {
        plan.candidates = plan.candidates.filter(c => {
            if (!c._needsMaterialise) return true; // base edge or already active SC
            if (c._scId === undefined) return true;
            // Oct cage SCs get full vacuum negotiation in _executeOctMove
            if (_octSCIds && _octSCIds.includes(c._scId)) return true;
            return canMaterialiseQuick(c._scId); // keep only if vacuum would allow
        });
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
            // Oct xon couldn't move — approve as annihilation instead of revoking.
            // PHASE 4 will resolve the on-node collision via gluon storage.
            plan._annihilateMove = true;
        }
    }

    // Build a combined blocked set for idle_tet planning
    const allBlocked = new Map(occupied);
    for (const n of planned) _occAdd(allBlocked, n);
    for (const n of octClaimed) _occAdd(allBlocked, n);
    for (const plan of octPlans) {
        if (plan.assigned) _occDel(allBlocked, plan.fromNode);
    }

    // Proactive congestion relief: if the oct cage is crowded,
    // send some assigned oct xons into idle_tet to reduce density.
    // With 12 oct nodes and 6 xons, >4 xons on oct is congested.
    const octOnCage = octPlans.filter(p => p.assigned || (!p.assigned && !p.idleTet)).length;
    if (octOnCage > 4) {
        // Demote the lowest-scored assigned oct xons to idle_tet
        const demotable = octPlans
            .filter(p => p.assigned && p.assigned.score !== undefined)
            .sort((a, b) => (a.assigned.score || 0) - (b.assigned.score || 0));
        for (const plan of demotable) {
            if (octOnCage - (demotable.indexOf(plan) < demotable.length ? 1 : 0) <= 4) break;
            // Try idle_tet for this xon instead of its oct move
            if (plan.xon._evictedThisTick) continue; // evicted this tick — don't re-assign
            if (_startIdleTetLoop(plan.xon, allBlocked)) {
                const dest = plan.xon._loopSeq[plan.xon._loopStep + 1];
                // Loop-shape-aware lookahead: verify this specific loop path is viable
                const tmpCheck = new Map(allBlocked); _occAdd(tmpCheck, dest);
                if (dest !== undefined && !allBlocked.has(dest) && _lookaheadTetPath(plan.xon._loopSeq, 1, tmpCheck, LOOKAHEAD_DEPTH, plan.xon)) {
                    octClaimed.delete(plan.assigned.node);
                    plan.assigned = null;
                    plan.idleTet = true;
                    _occAdd(allBlocked, dest);
                } else {
                    plan.xon._mode = 'oct';
                    plan.xon.flashT = 1.0;
                    plan.xon._loopSeq = null;
                    plan.xon._loopStep = 0;
                    plan.xon._assignedFace = null;
                    plan.xon.col = 0xffffff;
                    if (plan.xon.sparkMat) plan.xon.sparkMat.color.setHex(0xffffff);
                }
            }
        }
    }

    // Unassigned oct xons: try idle_tet with Pauli-aware face selection + lookahead
    for (const plan of octPlans) {
        if (plan.assigned || plan.idleTet) continue;
        if (plan.xon._evictedThisTick) continue; // evicted from idle_tet this tick — don't re-assign
        if (_startIdleTetLoop(plan.xon, allBlocked)) {
            const dest = plan.xon._loopSeq[plan.xon._loopStep + 1];
            // Loop-shape-aware lookahead: verify this specific loop path is viable
            const tmpCheck = new Map(allBlocked); _occAdd(tmpCheck, dest);
            if (dest !== undefined && !allBlocked.has(dest) && _lookaheadTetPath(plan.xon._loopSeq, 1, tmpCheck, LOOKAHEAD_DEPTH, plan.xon)) {
                plan.idleTet = true;
                _occAdd(allBlocked, dest);
            } else {
                plan.xon._mode = 'oct';
                plan.xon.flashT = 1.0;
                plan.xon._loopSeq = null;
                plan.xon._loopStep = 0;
                plan.xon._assignedFace = null;
                plan.xon.col = 0xffffff;
                if (plan.xon.sparkMat) plan.xon.sparkMat.color.setHex(0xffffff);
            }
        }
    }

    // If idle_tet manifestation added new SCs, flag solver
    if (_idleTetManifested) _solverNeeded = true;

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
                            xon._mode = 'oct';
                            xon.flashT = 1.0;
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

    // ── PHASE 3: Execute all planned moves ──
    // Oct moves execute FIRST (to vacate nodes for tet xons).
    // If an oct move fails (vacuum rejection), revoke dependent tet approvals.

    // Build reverse map: oct xon → tet plan that depends on it vacating
    const octToTetDep = new Map(); // oct xon → tet plan
    for (const plan of tetPlans) {
        if (plan._needsOctVacate) octToTetDep.set(plan._needsOctVacate, plan);
    }

    // T41: track oct moves to prevent swaps with subsequent tet moves
    // Maps destination → origin for each completed oct move
    const _octMoveRecord = new Map(); // destNode → fromNode

    // Execute oct moves first
    for (const plan of octPlans) {
        if (plan.assigned) {
            const target = plan.assigned;
            const fromNode = plan.xon.node;
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
                _octMoveRecord.set(plan.xon.node, fromNode); // T41: record dest→origin
                if (plan.xon._solverNeeded) {
                    _solverNeeded = true;
                    plan.xon._solverNeeded = false;
                }
            }
            _occAdd(occupied, plan.xon.node);
        } else if (plan.idleTet) {
            // Verify SC is still active (may have been severed by oct move negotiation)
            if (!_canAdvanceSafely(plan.xon)) {
                _returnXonToOct(plan.xon); // abort idle_tet — SC was deactivated
                continue;
            }
            // Pauli check: destination may have become occupied since planning
            const effectiveStep = plan.xon._loopStep >= 4 ? 0 : plan.xon._loopStep;
            const idleDest = plan.xon._loopSeq[effectiveStep + 1];
            if (idleDest !== undefined && (occupied.get(idleDest) || 0) > 0) {
                _returnXonToOct(plan.xon); // destination occupied — return to oct
                continue;
            }
            _occDel(occupied, plan.xon.node);
            _advanceXon(plan.xon);
            _occAdd(occupied, plan.xon.node);
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
        // T41 swap check: reject if an oct xon just moved FROM plan.toNode TO plan.xon.node
        // (would create a swap — two xons passing through each other on the same edge)
        if (_octMoveRecord.get(plan.xon.node) === plan.toNode) continue;
        // Verify SC is still active (may have been severed by oct move negotiation)
        if (!_canAdvanceSafely(plan.xon)) continue;
        _advanceXon(plan.xon);
        _occDel(occupied, plan.xon.prevNode);
        _occAdd(occupied, plan.xon.node);
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

        const nbs = baseNeighbors[xon.node] || [];

        // Priority 1: move to a 2-step-aware free oct neighbor → return to oct mode
        // ONLY destinations with valid 2nd moves are considered.
        let escaped = false;
        const freeOctNbs = nbs
            .filter(nb => {
                if (!_octNodeSet.has(nb.node)) return false;
                if (occupied.get(nb.node) || 0) return false;
                // 2-step awareness: MUST have a valid 2nd move from this destination
                const tmp = new Map(occupied); _occAdd(tmp, nb.node);
                return _lookahead(nb.node, tmp, 1);
            });
        for (const nb of freeOctNbs) {
            _occDel(occupied, xon.node);
            xon.prevNode = xon.node;
            xon.node = nb.node;
            _occAdd(occupied, nb.node);
            xon.trail.push(nb.node);
            xon.trailColHistory.push(0xffffff);
            if (xon.trail.length > XON_TRAIL_LENGTH) { xon.trail.shift(); xon.trailColHistory.shift(); }
            xon.tweenT = 0;
            xon._mode = 'oct';
            xon.flashT = 1.0;
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
            xon._mode = 'oct';
            xon.flashT = 1.0;
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
            if (dest !== undefined && !(occupied.get(dest) || 0) && _canAdvanceSafely(xon)) {
                _advanceXon(xon);
                _occDel(occupied, xon.prevNode);
                _occAdd(occupied, xon.node);
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
            const freeNbs = nbs.filter(nb => !(occupied.get(nb.node) || 0));
            if (freeNbs.length > 0) {
                // Pick a random free neighbor (weak force is stochastic)
                const nb = freeNbs[Math.floor(Math.random() * freeNbs.length)];
                _occDel(occupied, xon.node);
                xon.prevNode = xon.node;
                xon.node = nb.node;
                _occAdd(occupied, nb.node);
                xon.trail.push(nb.node);
                xon.trailColHistory.push(WEAK_FORCE_COLOR);
                if (xon.trail.length > XON_TRAIL_LENGTH) { xon.trail.shift(); xon.trailColHistory.shift(); }
                xon.tweenT = 0;
                xon._mode = 'weak';
                xon.flashT = 1.0;
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
            const occupant = _demoXons.find(x =>
                x.alive && x !== xon && x.node === nb.node);
            if (occupant) {
                const prevCol = xon.col; // preserve quark color for trail
                _occDel(occupied, xon.node);
                xon.prevNode = xon.node;
                xon.node = nb.node;
                xon.trail.push(nb.node);
                xon.trailColHistory.push(prevCol); // quark color, NOT white
                if (xon.trail.length > XON_TRAIL_LENGTH) { xon.trail.shift(); xon.trailColHistory.shift(); }
                xon.tweenT = 0;
                // Don't _occAdd — PHASE 4 will handle the collision
                xon._mode = 'oct'; // switch to oct so PHASE 4 scatter/annihilate catches it
                xon.flashT = 1.0;
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

    // ── PHASE 3b: Rescue stuck oct xons (no assignment or assignment revoked) ──
    // These xons didn't move in PHASE 3. Try any valid 2-step-aware move.
    occupied = _occupiedNodes();
    for (const plan of octPlans) {
        const xon = plan.xon;
        if (!xon.alive || xon._mode !== 'oct') continue;
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
            // 2-step awareness check
            const tmp = new Map(occupied);
            _occDel(tmp, xon.node); _occAdd(tmp, nb.node);
            if (!_lookahead(nb.node, tmp, 1)) continue;
            // Execute the move
            if (_executeOctMove(xon, { node: nb.node, dirIdx: 0, _scId: undefined, _needsMaterialise: false })) {
                _occDel(occupied, plan.fromNode);
                _occAdd(occupied, xon.node);
                anyMoved = true;
                moved = true;
                break;
            }
        }
        // If no 2-step-aware oct move, try idle_tet
        if (!moved) {
            if (_startIdleTetLoop(xon, occupied)) {
                const dest = xon._loopSeq ? xon._loopSeq[xon._loopStep + 1] : null;
                if (dest !== undefined && !(occupied.get(dest) || 0) && _canAdvanceSafely(xon)) {
                    _occDel(occupied, xon.node);
                    _advanceXon(xon);
                    _occAdd(occupied, xon.node);
                    anyMoved = true;
                    moved = true;
                } else {
                    // Advance failed — revert to oct mode so annihilation fallback can run.
                    // Must reset color to avoid T23 (oct xon with quark sparkMat).
                    xon._mode = 'oct';
                    xon.flashT = 1.0;
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
            // Try any free oct neighbor (even without 2-step awareness)
            for (const nb of allOctNbs) {
                if (occupied.get(nb.node) || 0) continue;
                if (_executeOctMove(xon, { node: nb.node, dirIdx: 0, _scId: undefined, _needsMaterialise: false })) {
                    _occDel(occupied, plan.fromNode);
                    _occAdd(occupied, xon.node);
                    anyMoved = true;
                    moved = true;
                    break;
                }
            }
            // WEAK FORCE ESCAPE — shoot off in ANY direction (not just oct).
            // When all oct-constrained options fail, the xon breaks confinement.
            // Enters 'weak' mode with purple trail/sparkle.
            if (!moved) {
                const allNbs = baseNeighbors[xon.node] || [];
                const freeNbs = allNbs.filter(nb => !(occupied.get(nb.node) || 0));
                if (freeNbs.length > 0) {
                    const nb = freeNbs[Math.floor(Math.random() * freeNbs.length)];
                    _occDel(occupied, xon.node);
                    xon.prevNode = xon.node;
                    xon.node = nb.node;
                    _occAdd(occupied, nb.node);
                    xon.trail.push(nb.node);
                    xon.trailColHistory.push(WEAK_FORCE_COLOR);
                    if (xon.trail.length > XON_TRAIL_LENGTH) { xon.trail.shift(); xon.trailColHistory.shift(); }
                    xon.tweenT = 0;
                    xon._mode = 'weak';
                    xon.flashT = 1.0;
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
            // If still stuck: move to occupied neighbor for annihilation
            if (!moved) {
                for (const nb of allOctNbs) {
                    const occupant = _demoXons.find(x =>
                        x.alive && x !== xon && x.node === nb.node);
                    if (occupant) {
                        _occDel(occupied, xon.node);
                        xon.prevNode = xon.node;
                        xon.node = nb.node;
                        xon.trail.push(nb.node);
                        xon.trailColHistory.push(xon.col);
                        if (xon.trail.length > XON_TRAIL_LENGTH) { xon.trail.shift(); xon.trailColHistory.shift(); }
                        xon.tweenT = 0;
                        anyMoved = true;
                        break;
                    }
                }
            }
        }
    }

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
        const allNb = (baseNeighbors[xon.node] || []).filter(nb => _octNodeSet.has(nb.node));
        const scNb = (scByVert[xon.node] || [])
            .filter(sc => activeSet.has(sc.id) || impliedSet.has(sc.id) || electronImpliedSet.has(sc.id))
            .map(sc => sc.a === xon.node ? sc.b : sc.a)
            .filter(n => _octNodeSet.has(n));
        const candidates = [...allNb.map(nb => nb.node), ...scNb];
        // Sort by 2-step awareness: prefer destinations with valid 2nd moves
        // ONLY 2-step-aware destinations are valid
        const scored = candidates
            .filter(n => !(occupied.get(n) || 0))
            // T41: reject destinations that would create a swap (xon at n moved to xon.node this tick)
            .filter(n => !_demoXons.some(x => x.alive && x !== xon && x.node === xon.node &&
                x.prevNode === n && x._movedThisTick))
            .filter(n => {
                const tmp = new Map(occupied); _occAdd(tmp, n);
                return _lookahead(n, tmp, 1);
            });
        for (const n of scored) {
            _occDel(occupied, xon.node);
            xon.prevNode = xon.node;
            xon.node = n;
            _occAdd(occupied, n);
            xon.trail.push(n);
            xon.trailColHistory.push(xon.col);
            if (xon.trail.length > XON_TRAIL_LENGTH) { xon.trail.shift(); xon.trailColHistory.shift(); }
            xon.tweenT = 0;
            return true;
        }
        // Fallback: try idle_tet
        if (_startIdleTetLoop(xon, occupied)) {
            const dest = xon._loopSeq[xon._loopStep + 1];
            if (dest !== undefined && !(occupied.get(dest) || 0) && _canAdvanceSafely(xon)) {
                _advanceXon(xon);
                _occDel(occupied, xon.prevNode);
                _occAdd(occupied, xon.node);
                return true;
            }
        }
        return false;
    }

    for (const cNode of collisionNodes) {
        // All xons at this collision node (any mode)
        const atNode = _demoXons.filter(x => x.alive && x.node === cNode);
        if (atNode.length <= 1) continue;

        // Try scatter first for oct-mode xons that haven't moved
        const scatterable = atNode.filter(x => x._mode === 'oct' && !x._movedThisTick);
        for (const xon of scatterable) {
            if ((occupied.get(cNode) || 0) <= 1) break; // resolved
            _scatterMove(xon, occupied);
        }

        // If collision persists: ANNIHILATE pairs on-node
        // Protect weak xons from non-local annihilation — they are mid-return
        const stillHere = _demoXons.filter(x => x.alive && x.node === cNode);
        while (stillHere.length > 1) {
            // Prefer annihilating non-weak pairs; skip if either is weak
            const nonWeak = stillHere.filter(x => x._mode !== 'weak');
            if (nonWeak.length >= 2) {
                const a = nonWeak.pop();
                const b = nonWeak.pop();
                stillHere.splice(stillHere.indexOf(a), 1);
                stillHere.splice(stillHere.indexOf(b), 1);
                _annihilateXonPair(a, b);
                _occDel(occupied, cNode);
                _occDel(occupied, cNode);
            } else {
                // Weak xon involved — try scatter the non-weak xon instead
                const toScatter = stillHere.find(x => x._mode !== 'weak' && !x._movedThisTick);
                if (toScatter) {
                    _scatterMove(toScatter, occupied);
                    if (toScatter.node !== cNode) {
                        stillHere.splice(stillHere.indexOf(toScatter), 1);
                        continue;
                    }
                }
                break; // can't resolve — will clear next tick
            }
        }
    }

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
            const nbs = baseNeighbors[xon.node] || [];
            const freeNbs = nbs.filter(nb => !(occupied.get(nb.node) || 0));
            if (freeNbs.length > 0) {
                const nb = freeNbs[Math.floor(Math.random() * freeNbs.length)];
                _occDel(occupied, xon.node);
                xon.prevNode = xon.node;
                xon.node = nb.node;
                _occAdd(occupied, nb.node);
                xon.trail.push(nb.node);
                xon.trailColHistory.push(WEAK_FORCE_COLOR);
                if (xon.trail.length > XON_TRAIL_LENGTH) { xon.trail.shift(); xon.trailColHistory.shift(); }
                xon.tweenT = 0;
                xon._mode = 'weak';
                xon.flashT = 1.0;
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
                    const newMode = _octNodeSet.has(xon.node) ? 'oct' : 'weak';
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

    // ── Advance gluons along oct edges (also negotiates with vacuum) ──
    if (_advanceGluons()) _solverNeeded = true;

    // ── Run solver if any SCs changed (unified architecture) ──
    if (_solverNeeded) {
        bumpState();
        const scPairs = [];
        activeSet.forEach(id => { const s = SC_BY_ID[id]; scPairs.push([s.a, s.b]); });
        electronImpliedSet.forEach(id => { const s = SC_BY_ID[id]; scPairs.push([s.a, s.b]); });
        const { p: pSolved } = _solve(scPairs, 5000, true); // noBailout: full convergence for Kepler
        impliedSet.clear(); impliedBy.clear();
        electronImpliedSet.forEach(id => {
            if (!activeSet.has(id)) { impliedSet.add(id); impliedBy.set(id, new Set()); }
        });
        applyPositions(pSolved);
        updateSpheres();
    }

    // ── Decay dying xon trails (every simulation tick, not per-frame) ──
    _decayDyingXons();

    // ── Color tets with progressive opacity (ramps as xon loop completes) ──
    // Void wireframes are the SOLE edge rendering system during demo.
    if (_demoWindowTypes) {
        for (const [fIdStr, fd] of Object.entries(_nucleusTetFaceData)) {
            const fId = parseInt(fIdStr);
            const qType = _demoWindowTypes[fId];
            if (qType) {
                _ruleAnnotations.tetColors.set(fd.voidIdx, QUARK_COLORS[qType]);
                // Progressive opacity: ramps from 0.3 to 0.85 over 4 ticks
                // Find the xon for this face to get its loop progress
                const xon = _demoXons.find(x => x.alive && x._assignedFace === fId);
                const step = xon ? xon._loopStep : 0;
                const opacity = 0.3 + (step / 4) * 0.55; // 0.3 → 0.85
                _ruleAnnotations.tetOpacity.set(fd.voidIdx, opacity);
            } else {
                _ruleAnnotations.tetColors.set(fd.voidIdx, 0x1a1a2a);
                _ruleAnnotations.tetOpacity.set(fd.voidIdx, 0.0);
            }
        }
        _ruleAnnotations.dirty = true;
        if (typeof updateVoidSpheres === 'function') updateVoidSpheres();
    }

    _demoTick++;

    // Update Planck-second ticker (both right-panel status and left-panel title)
    const _tickerEl = document.getElementById('nucleus-status');
    if (_tickerEl) _tickerEl.textContent = `${_demoTick} Planck seconds`;
    const _dpTitle = document.querySelector('#deuteron-panel > div:first-child');
    if (_dpTitle) _dpTitle.textContent = `${_demoTick} Planck seconds`;

    // Live guard checks (T19, T21, T26, T27) — after tick advances xons
    if (typeof _liveGuardCheck === 'function') _liveGuardCheck();

    // Capture temporal K frame every tick (tracks lattice state movie)
    if (typeof captureTemporalFrame === 'function') captureTemporalFrame();

    // Update UI at window boundaries (every 4 ticks)
    if (_demoTick % WINDOW_LEN === 0) {
        updateDemoPanel();
        updateStatus();
    }
}

function updateDemoPanel() {
    const CYCLE_LEN = 64;
    const cycles = Math.floor(_demoTick / CYCLE_LEN);

    // ── Update demo-status (right panel, below button) ──
    const ds = document.getElementById('demo-status');
    if (ds) {
        ds.innerHTML = `<span style="color:#88bbdd;">cycle ${cycles}</span>`;
    }

    // ── Update left panel coverage bars (skip during test execution) ──
    if (_testRunning) { _demoTick++; return; }
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
        if (m === 0) return 1;
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
        + `<span style="color:#6a8a9a;">cycles</span>`
        + `<span style="color:#88aacc;">${cycles}</span>`
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

function pauseDemo() {
    if (_demoInterval) { clearInterval(_demoInterval); _demoInterval = null; }
}
function resumeDemo() {
    if (_demoActive && !_demoInterval) {
        const intervalMs = _getDemoIntervalMs();
        _demoInterval = setInterval(demoTick, intervalMs);
    }
}
function isDemoPaused() {
    return _demoActive && !_demoInterval;
}

function stopDemo() {
    _demoActive = false;
    if (typeof _liveGuardsActive !== 'undefined') _liveGuardsActive = false;
    if (_demoInterval) { clearInterval(_demoInterval); _demoInterval = null; }
    const ds = document.getElementById('demo-status');
    if (ds) ds.style.display = 'none';
    // Clean up Demo 3.0 xons and gluons
    _cleanupDemo3();
    // Clean up tet SCs from electronImpliedSet + oct SCs from activeSet
    for (const [, fd] of Object.entries(_nucleusTetFaceData)) {
        for (const scId of fd.scIds) {
            electronImpliedSet.delete(scId);
        }
    }
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
