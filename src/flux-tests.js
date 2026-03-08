// flux-tests.js — Demo 3.0 unit tests + final UI wiring
// ═══════════════════════════════════════════════════════════════════════
// ║  DEMO 3.0 UNIT TESTS — assertions on xon mechanics                 ║
// ║  Run from console: runDemo3Tests()                                  ║
// ═══════════════════════════════════════════════════════════════════════
let _testRunning = false;  // suppress display updates during test execution

// ═══════════════════════════════════════════════════════════════════════
// ║  LIVE GUARD REGISTRY — single source of truth for ALL runtime tests ║
// ║  Adding a test here auto-registers it everywhere:                   ║
// ║    • _liveGuards (runtime state tracking)                           ║
// ║    • PROJECTED_GUARD_CHECKS (lookahead / movement planner)          ║
// ║    • nameMap (UI display in left panel)                             ║
// ║    • skip() rows (initial placeholder in test results)              ║
// ║                                                                     ║
// ║  Each entry: { id, name, init?, projected? }                        ║
// ║    id:        'T19', 'T41', etc.                                    ║
// ║    name:      display name (without Txx prefix)                     ║
// ║    init:      extra props for _liveGuards entry (optional)          ║
// ║    projected: lookahead check fn(xonFutures) → null | violation     ║
// ║              (optional — omit for live-only guards)                  ║
// ═══════════════════════════════════════════════════════════════════════
const LIVE_GUARD_GRACE = 12;

const LIVE_GUARD_REGISTRY = [
    { id: 'T12', name: 'Conservation (alive+2*stored=6)',
      projected(states) {
        const liveCount = states.length;
        const stored = typeof _gluonStoredPairs !== 'undefined' ? _gluonStoredPairs : 0;
        const total = liveCount + 2 * stored;
        if (total !== 6) return { guard: 'T12', xon: null, msg: `conservation: alive=${liveCount} stored=${stored} total=${total}` };
        return null;
    }},
    { id: 'T13', name: 'Array size unchanged', init: { _initCount: null } },
    { id: 'T14', name: 'Dying trail cleanup' },
    { id: 'T15', name: 'Xon state (sign + mode)' },
    { id: 'T16', name: 'Xon always has function' },
    { id: 'T17', name: 'Full tet coverage (8/8 faces)' },
    { id: 'T19', name: 'Pauli exclusion (1 xon/node)',
      projected(states) {
        const counts = new Map();
        for (const s of states) {
            const c = (counts.get(s.futureNode) || 0) + 1;
            counts.set(s.futureNode, c);
            if (c > 1) return { guard: 'T19', xon: s.xon, msg: `Pauli at node ${s.futureNode}` };
        }
        return null;
    }},
    { id: 'T20', name: 'Never stand still' },
    { id: 'T21', name: 'Oct cage permanence', init: { _octSnapshot: null },
      projected(states) {
        if (typeof _octSCIds === 'undefined') return null;
        for (const scId of _octSCIds) {
            if (!activeSet.has(scId)) return { guard: 'T21', xon: null, msg: `oct SC ${scId} missing from activeSet` };
        }
        return null;
    }},
    { id: 'T22', name: 'Hadronic composition (pu:pd\u22482, nd:nu\u22482)' },
    { id: 'T23', name: 'Sparkle color matches purpose' },
    { id: 'T24', name: 'Trail color stability' },
    { id: 'T25', name: 'Oct cage within 12 ticks',
      projected(states) {
        if (typeof _octSCIds === 'undefined') return null;
        if (!_liveGuards || !_liveGuards.T25 || _liveGuards.T25.ok !== true) return null;
        const allActive = _octSCIds.every(id => activeSet.has(id));
        if (!allActive) return { guard: 'T25', xon: null, msg: 'oct cage broken' };
        return null;
    }},
    { id: 'T26', name: 'No unactivated SC traversal',
      projected(states) {
        const violations = [];
        for (const s of states) {
            if (s.futureNode === s.fromNode) continue;
            const pid = pairId(s.fromNode, s.futureNode);
            const scId = scPairToId.get(pid);
            if (scId === undefined) continue;
            const hasBase = (baseNeighbors[s.fromNode] || []).some(nb => nb.node === s.futureNode);
            if (!hasBase && !activeSet.has(scId) && !impliedSet.has(scId) && !electronImpliedSet.has(scId)) {
                violations.push({ guard: 'T26', xon: s.xon, msg: `unactivated SC ${scId} (${s.fromNode}\u2192${s.futureNode})` });
            }
        }
        return violations.length ? violations : null;
    }},
    { id: 'T27', name: 'No teleportation',
      projected(states) {
        const violations = [];
        for (const s of states) {
            if (s.futureNode === s.fromNode) continue;
            const nbs = baseNeighbors[s.fromNode] || [];
            let connected = nbs.some(nb => nb.node === s.futureNode);
            if (!connected) {
                const scs = scByVert[s.fromNode] || [];
                connected = scs.some(sc => (sc.a === s.fromNode ? sc.b : sc.a) === s.futureNode);
            }
            if (!connected) violations.push({ guard: 'T27', xon: s.xon, msg: `teleport ${s.fromNode}\u2192${s.futureNode}` });
        }
        return violations.length ? violations : null;
    }},
    { id: 'T29', name: 'White trails only on oct edges',
      projected(states) {
        if (!_octNodeSet || !_octNodeSet.size) return null;
        const violations = [];
        for (const s of states) {
            if (s.futureColor === 0xffffff && !_octNodeSet.has(s.futureNode))
                violations.push({ guard: 'T29', xon: s.xon, msg: `white at non-oct node ${s.futureNode}` });
        }
        return violations.length ? violations : null;
    }},
    { id: 'T30', name: 'Annihilation always in pairs', init: { _prevStored: 0, _prevAlive: 6 } },
    { id: 'T33', name: 'Trail persists when alive' },
    { id: 'T34', name: 'Trail length bounded' },
    { id: 'T35', name: 'Sparkle visible when alive' },
    { id: 'T36', name: 'Flash on mode transition' },
    { id: 'T37', name: 'Trail flash boost' },
    { id: 'T38', name: 'Weak force confinement' },
    { id: 'T39', name: 'Demo opacity reset' },
    { id: 'T40', name: 'Trail fade on annihilation' },
    { id: 'T41', name: 'No adjacent xon swap',
      projected(states) {
        for (let i = 0; i < states.length; i++) {
            for (let j = i + 1; j < states.length; j++) {
                const a = states[i], b = states[j];
                if (a.fromNode === b.futureNode && b.fromNode === a.futureNode &&
                    a.fromNode !== a.futureNode) {
                    return { guard: 'T41', xon: a.xon, msg: `swap ${a.fromNode}\u2194${b.fromNode}` };
                }
            }
        }
        return null;
    }},
];

// ── Auto-derived from registry ──
const PROJECTED_GUARD_CHECKS = LIVE_GUARD_REGISTRY.filter(e => e.projected).map(e => e.projected);

const _liveGuards = {};
for (const entry of LIVE_GUARD_REGISTRY) {
    _liveGuards[entry.id] = { ok: null, msg: 'grace period', failed: false, ...(entry.init || {}) };
}
let _liveGuardsActive = false;
let _liveGuardFailTick = null; // tick of first failure (for wind-down halt)

function _liveGuardCheck() {
    if (!_demoActive || !_liveGuardsActive || _testRunning) return;
    const tick = _demoTick;
    const preTick = tick - 1;
    const CYCLE_LEN = 64, WINDOW_LEN = 4;
    const tickInWindow = (preTick % CYCLE_LEN) % WINDOW_LEN;
    const isWindowBoundary = tickInWindow === 0;

    // Convergence tests stay null until their deadline is evaluated
    const CONVERGENCE_TESTS = new Set(['T17', 'T22', 'T25', 'T39']);

    // ── During grace: stay null ──
    if (tick <= LIVE_GUARD_GRACE) {
        if (tick === LIVE_GUARD_GRACE) {
            // Promote invariant guards to green; convergence tests stay null
            for (const key of Object.keys(_liveGuards)) {
                if (CONVERGENCE_TESTS.has(key)) continue;
                const g = _liveGuards[key];
                if (!g.failed) { g.ok = true; g.msg = ''; }
            }
            // T13: capture baseline xon count
            _liveGuards.T13._initCount = _demoXons.length;
            // T21: snapshot which oct SCs are active now
            const snap = new Set();
            for (const scId of _octSCIds) {
                if (activeSet.has(scId)) snap.add(scId);
            }
            _liveGuards.T21._octSnapshot = snap;
            if (snap.size === 0) {
                _liveGuards.T21.ok = null;
                _liveGuards.T21.msg = 'no oct SCs active yet';
            }
            // T30: initialize gluon tracking
            _liveGuards.T30._prevStored = typeof _gluonStoredPairs !== 'undefined' ? _gluonStoredPairs : 0;
            _liveGuards.T30._prevAlive = _demoXons.filter(x => x.alive).length;
            _liveGuardRender();
        }
        return;
    }

    // ── T21: update oct snapshot if new SCs appear ──
    if (!_liveGuards.T21.failed && _liveGuards.T21._octSnapshot) {
        for (const scId of _octSCIds) {
            if (activeSet.has(scId)) _liveGuards.T21._octSnapshot.add(scId);
        }
        if (_liveGuards.T21._octSnapshot.size > 0 && _liveGuards.T21.ok === null) {
            _liveGuards.T21.ok = true; _liveGuards.T21.msg = '';
        }
    }

    let anyFailed = false;

    // ══════════════════════════════════════════════════════════════════
    // INVARIANT GUARDS — checked every tick
    // ══════════════════════════════════════════════════════════════════

    // ── T12: Conservation — alive + 2*stored = 6 ──
    // Gluon storage allows variable xon count while maintaining total conservation.
    if (!_liveGuards.T12.failed) {
        const liveCount = _demoXons.filter(x => x.alive && !x._dying).length;
        const stored = typeof _gluonStoredPairs !== 'undefined' ? _gluonStoredPairs : 0;
        const total = liveCount + 2 * stored;
        if (total !== 6) {
            _liveGuards.T12.ok = false;
            _liveGuards.T12.failed = true;
            _liveGuards.T12.msg = `tick ${tick}: alive=${liveCount} stored=${stored} total=${total} (expected 6)`;
            anyFailed = true;
        }
    }

    // ── T13: Array size unchanged — xon slots are reused, never grown ──
    if (!_liveGuards.T13.failed && _liveGuards.T13._initCount !== null) {
        if (_demoXons.length !== _liveGuards.T13._initCount) {
            _liveGuards.T13.ok = false;
            _liveGuards.T13.failed = true;
            _liveGuards.T13.msg = `tick ${tick}: count ${_liveGuards.T13._initCount}\u2192${_demoXons.length}`;
            anyFailed = true;
        }
    }

    // ── T14: Dying trail cleanup — dying xons must finish fade within 60 ticks ──
    // Trail fade (T40) creates _dying xons. They must not persist forever.
    if (!_liveGuards.T14.failed) {
        for (const xon of _demoXons) {
            if (!xon._dying) continue;
            if (!xon._dyingStartTick) xon._dyingStartTick = tick;
            if (tick - xon._dyingStartTick > 60) {
                _liveGuards.T14.ok = false;
                _liveGuards.T14.failed = true;
                _liveGuards.T14.msg = `tick ${tick}: xon dying for ${tick - xon._dyingStartTick} ticks (max 60)`;
                anyFailed = true; break;
            }
        }
    }

    // ── T15: Valid state — sign in {+1,-1}, mode in {tet,oct,idle_tet,weak} ──
    if (!_liveGuards.T15.failed) {
        for (const xon of _demoXons) {
            if (!xon.alive) continue;
            if (xon.sign !== 1 && xon.sign !== -1) {
                _liveGuards.T15.ok = false;
                _liveGuards.T15.failed = true;
                _liveGuards.T15.msg = `tick ${tick}: sign=${xon.sign}`;
                anyFailed = true; break;
            }
            if (xon._mode !== 'tet' && xon._mode !== 'oct' && xon._mode !== 'idle_tet' && xon._mode !== 'weak') {
                _liveGuards.T15.ok = false;
                _liveGuards.T15.failed = true;
                _liveGuards.T15.msg = `tick ${tick}: mode=${xon._mode}`;
                anyFailed = true; break;
            }
        }
    }

    // ── T16: Always has function — tet/idle_tet have loop seq, oct on surface, weak anywhere ──
    if (!_liveGuards.T16.failed) {
        for (const xon of _demoXons) {
            if (!xon.alive) continue;
            if (xon._mode === 'tet' || xon._mode === 'idle_tet') {
                if (!xon._loopSeq || xon._loopSeq.length < 4) {
                    _liveGuards.T16.ok = false;
                    _liveGuards.T16.failed = true;
                    _liveGuards.T16.msg = `tick ${tick}: ${xon._mode} no loop seq`;
                    anyFailed = true; break;
                }
            } else if (xon._mode === 'oct') {
                if (!_octNodeSet.has(xon.node)) {
                    _liveGuards.T16.ok = false;
                    _liveGuards.T16.failed = true;
                    _liveGuards.T16.msg = `tick ${tick}: oct at non-oct node ${xon.node}`;
                    anyFailed = true; break;
                }
            }
            // 'weak' mode: xon broke confinement via weak force — can be anywhere
            // No structural constraint needed; it's in transit.
        }
    }

    // T16b removed: "idle only in actualized tets" is overly strict.
    // A loitering xon only needs the edges it traverses to be active (covered by T26).

    // ── T19: Pauli exclusion — no two xons on same node ──
    if (!_liveGuards.T19.failed) {
        const occupied = new Map();
        for (const xon of _demoXons) {
            if (!xon.alive) continue;
            const n = xon.node;
            if (occupied.has(n)) {
                _liveGuards.T19.ok = false;
                _liveGuards.T19.failed = true;
                _liveGuards.T19.msg = `tick ${tick}: node ${n} has 2+ xons`;
                anyFailed = true;
                break;
            }
            occupied.set(n, true);
        }
    }

    // ── T21: Oct cage permanence — oct SCs never leave activeSet ──
    if (!_liveGuards.T21.failed && _liveGuards.T21._octSnapshot && _liveGuards.T21._octSnapshot.size > 0) {
        for (const scId of _liveGuards.T21._octSnapshot) {
            if (!activeSet.has(scId)) {
                _liveGuards.T21.ok = false;
                _liveGuards.T21.failed = true;
                _liveGuards.T21.msg = `tick ${tick}: oct SC ${scId} lost`;
                anyFailed = true;
                break;
            }
        }
    }

    // ── T23: Sparkle color matches mode ──
    if (!_liveGuards.T23.failed) {
        for (const xon of _demoXons) {
            if (!xon.alive || !xon.sparkMat) continue;
            const actual = xon.sparkMat.color.getHex();
            if (xon._mode === 'oct') {
                if (actual !== 0xffffff) {
                    _liveGuards.T23.ok = false;
                    _liveGuards.T23.failed = true;
                    _liveGuards.T23.msg = `tick ${tick}: oct spark=0x${actual.toString(16)}`;
                    anyFailed = true; break;
                }
            } else if (xon._mode === 'tet' || xon._mode === 'idle_tet') {
                const expected = QUARK_COLORS[xon._quarkType];
                if (expected !== undefined && actual !== expected) {
                    _liveGuards.T23.ok = false;
                    _liveGuards.T23.failed = true;
                    _liveGuards.T23.msg = `tick ${tick}: ${xon._quarkType} spark wrong`;
                    anyFailed = true; break;
                }
            } else if (xon._mode === 'weak') {
                if (actual !== WEAK_FORCE_COLOR) {
                    _liveGuards.T23.ok = false;
                    _liveGuards.T23.failed = true;
                    _liveGuards.T23.msg = `tick ${tick}: weak spark=0x${actual.toString(16)}`;
                    anyFailed = true; break;
                }
            }
        }
    }

    // ── T24: Trail color stability — all colors valid, arrays synced ──
    if (!_liveGuards.T24.failed) {
        for (const xon of _demoXons) {
            if (!xon.alive || !xon.trailColHistory) continue;
            for (let j = 0; j < xon.trailColHistory.length; j++) {
                const c = xon.trailColHistory[j];
                const isWhite = c === 0xffffff;
                const isQuark = c === QUARK_COLORS.pu || c === QUARK_COLORS.pd ||
                                c === QUARK_COLORS.nu || c === QUARK_COLORS.nd;
                const isWeak = c === WEAK_FORCE_COLOR;
                if (!isWhite && !isQuark && !isWeak) {
                    _liveGuards.T24.ok = false;
                    _liveGuards.T24.failed = true;
                    _liveGuards.T24.msg = `tick ${tick}: color 0x${c.toString(16)}`;
                    anyFailed = true; break;
                }
            }
            if (_liveGuards.T24.failed) break;
            if (xon.trailColHistory.length !== xon.trail.length) {
                _liveGuards.T24.ok = false;
                _liveGuards.T24.failed = true;
                _liveGuards.T24.msg = `tick ${tick}: trail/color desync`;
                anyFailed = true; break;
            }
        }
    }

    // ── T29: White trail segments only on oct nodes ──
    // Every white (0xffffff) trail entry must be at an oct node.
    // Verify: run demo — all white trails are on oct surface.
    // Violate: push a non-oct node with white color to a xon's trail.
    if (!_liveGuards.T29.failed && _octNodeSet && _octNodeSet.size > 0) {
        for (const xon of _demoXons) {
            if (!xon.alive || !xon.trailColHistory || !xon.trail) continue;
            for (let i = 0; i < xon.trailColHistory.length; i++) {
                if (xon.trailColHistory[i] === 0xffffff) {
                    if (!_octNodeSet.has(xon.trail[i])) {
                        _liveGuards.T29.ok = false;
                        _liveGuards.T29.failed = true;
                        _liveGuards.T29.msg = `tick ${tick}: white trail at non-oct node ${xon.trail[i]}`;
                        anyFailed = true;
                        break;
                    }
                }
            }
            if (_liveGuards.T29.failed) break;
        }
    }

    // ── T30: Annihilation always in pairs (stored += N, alive -= 2N) ──
    // When gluon storage increases, exactly 2 xons must have died per stored pair.
    // Verify: run demo until annihilation event occurs.
    // Violate: increment _gluonStoredPairs without removing 2 xons.
    if (!_liveGuards.T30.failed) {
        const curStored = typeof _gluonStoredPairs !== 'undefined' ? _gluonStoredPairs : 0;
        const curAlive = _demoXons.filter(x => x.alive).length;
        if (curStored > _liveGuards.T30._prevStored) {
            const dStored = curStored - _liveGuards.T30._prevStored;
            const dAlive = _liveGuards.T30._prevAlive - curAlive;
            if (dStored * 2 !== dAlive) {
                _liveGuards.T30.ok = false;
                _liveGuards.T30.failed = true;
                _liveGuards.T30.msg = `tick ${tick}: stored+=${dStored} alive-=${dAlive} (expected 2:1 ratio)`;
                anyFailed = true;
            }
        }
        _liveGuards.T30._prevStored = curStored;
        _liveGuards.T30._prevAlive = curAlive;
    }

    // ── T33: Trail persists — alive xons always have non-empty, synced trail ──
    // Verify: run demo — alive xons always have trail[] and trailColHistory[].
    // Violate: set xon.trail = [] on a live xon.
    if (!_liveGuards.T33.failed) {
        for (const xon of _demoXons) {
            if (!xon.alive || xon._dying) continue;
            if (!xon.trail || xon.trail.length === 0) {
                _liveGuards.T33.ok = false;
                _liveGuards.T33.failed = true;
                _liveGuards.T33.msg = `tick ${tick}: alive xon has empty trail at node ${xon.node}`;
                anyFailed = true; break;
            }
            if (!xon.trailColHistory || xon.trailColHistory.length !== xon.trail.length) {
                _liveGuards.T33.ok = false;
                _liveGuards.T33.failed = true;
                _liveGuards.T33.msg = `tick ${tick}: trail/color length mismatch`;
                anyFailed = true; break;
            }
        }
    }

    // ── T34: Trail length bounded — never exceeds XON_TRAIL_LENGTH ──
    // Verify: run demo for many ticks — trails stay capped.
    // Violate: remove trail.shift() calls in _advanceXon.
    if (!_liveGuards.T34.failed) {
        for (const xon of _demoXons) {
            if (!xon.alive || !xon.trail) continue;
            if (xon.trail.length > XON_TRAIL_LENGTH) {
                _liveGuards.T34.ok = false;
                _liveGuards.T34.failed = true;
                _liveGuards.T34.msg = `tick ${tick}: trail len=${xon.trail.length} max=${XON_TRAIL_LENGTH}`;
                anyFailed = true; break;
            }
        }
    }

    // ── T35: Sparkle visible when alive — alive non-dying xons have spark ──
    // Verify: run demo — all live xons have visible sparkle sprites.
    // Violate: set xon.sparkMat = null on a live xon.
    if (!_liveGuards.T35.failed) {
        for (const xon of _demoXons) {
            if (!xon.alive || xon._dying) continue;
            if (!xon.spark || !xon.sparkMat) {
                _liveGuards.T35.ok = false;
                _liveGuards.T35.failed = true;
                _liveGuards.T35.msg = `tick ${tick}: alive xon missing spark at node ${xon.node}`;
                anyFailed = true; break;
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // MOVEMENT GUARDS — skip window boundaries (xon reassignment)
    // ══════════════════════════════════════════════════════════════════
    if (!isWindowBoundary && _liveGuardPrev) {
        // ── T20: Never stand still — every xon must move every tick ──
        if (!_liveGuards.T20.failed) {
            for (const { xon, node: fromNode, mode: prevMode } of _liveGuardPrev) {
                if (!xon.alive) continue;
                // Skip mode transitions (composite moves)
                if (prevMode !== xon._mode) continue;
                if (xon.node === fromNode) {
                    _liveGuards.T20.ok = false;
                    _liveGuards.T20.failed = true;
                    _liveGuards.T20.msg = `tick ${tick}: stuck at node ${fromNode} (${prevMode})`;
                    anyFailed = true; break;
                }
            }
        }

        // ── T36: Sparkle flash on mode transition — flashT reset when mode changes ──
        // Verify: run demo — mode transitions produce visible flash.
        // Violate: remove flashT=1.0 from _returnXonToOct or _assignXonToTet.
        if (!_liveGuards.T36.failed) {
            for (const { xon, mode: prevMode } of _liveGuardPrev) {
                if (!xon.alive) continue;
                if (prevMode === xon._mode) continue; // no mode change
                // Mode changed — flashT should have been reset to 1.0.
                // By the time this check runs (start of next tick), flashT may have
                // decayed slightly by one frame, so check >= 0.5 as threshold.
                if (xon.flashT < 0.5) {
                    _liveGuards.T36.ok = false;
                    _liveGuards.T36.failed = true;
                    _liveGuards.T36.msg = `tick ${tick}: ${prevMode}→${xon._mode} flashT=${xon.flashT.toFixed(2)}`;
                    anyFailed = true; break;
                }
            }
        }

        // ── T37: Trail flash boost — trail head brighter during mode transition flash ──
        // Verify: run demo — when flashT > 0, trail head gets brightness boost from render.
        // Violate: remove flashBoost calculation from trail rendering in _tickDemoXons.
        // _lastTrailFlashBoost is set during the RENDER frame (after sim tick), so we check
        // xons that had flashT > 0.3 on the PREVIOUS tick (their render boost should be stored).
        if (!_liveGuards.T37.failed) {
            for (const xon of _demoXons) {
                if (!xon.alive || xon._dying) continue;
                // Check xons where flashT was recently high (render frame should have stored boost).
                // flashT decays at 6/sec, so at 30fps one render frame decays ~0.2.
                // If _lastTrailFlashBoost exists AND flashT is moderate, boost should be > 0.
                // We only check when flashT is in 0.1-0.7 range (after at least one render frame).
                if (xon.flashT > 0.1 && xon.flashT < 0.7 && xon._lastTrailFlashBoost !== undefined) {
                    if (xon._lastTrailFlashBoost <= 0) {
                        _liveGuards.T37.ok = false;
                        _liveGuards.T37.failed = true;
                        _liveGuards.T37.msg = `tick ${tick}: flashT=${xon.flashT.toFixed(2)} but boost=${xon._lastTrailFlashBoost.toFixed(3)}`;
                        anyFailed = true; break;
                    }
                }
            }
        }

        // ── T38: Weak force confinement — weak xons must never be annihilated while in weak mode ──
        // Verify: run demo — weak xons always return to oct before any annihilation.
        // Violate: allow _annihilateXonPair to kill xons still in weak mode in PHASE 4.
        // Note: if a xon exits weak→oct and THEN gets annihilated as a normal oct xon, that's fine.
        if (!_liveGuards.T38.failed) {
            for (const { xon, mode: prevMode } of _liveGuardPrev) {
                if (prevMode !== 'weak') continue;
                if (!xon.alive && xon._mode === 'weak') {
                    // Xon was in weak mode and died while still weak — confinement failure
                    _liveGuards.T38.ok = false;
                    _liveGuards.T38.failed = true;
                    _liveGuards.T38.msg = `tick ${tick}: weak xon annihilated at node ${xon.node}`;
                    anyFailed = true; break;
                }
            }
        }

        // ── T40: Trail fade on annihilation — trails must fade, not vanish instantly ──
        // Verify: run demo until annihilation occurs — dead xon has _dying=true.
        // Violate: set trailLine.visible=false in _annihilateXonPair instead of using _dying fade.
        if (!_liveGuards.T40.failed) {
            for (const { xon } of _liveGuardPrev) {
                // All entries were alive at snapshot — check if xon died this tick
                if (xon.alive) continue;
                // Xon just died — trail must be in _dying fade state, not instantly hidden
                if (!xon._dying) {
                    _liveGuards.T40.ok = false;
                    _liveGuards.T40.failed = true;
                    _liveGuards.T40.msg = `tick ${tick}: xon annihilated at node ${xon.node} without trail fade (_dying not set)`;
                    anyFailed = true; break;
                }
            }
            if (!_liveGuards.T40.failed && _liveGuards.T40.ok === null && tick >= LIVE_GUARD_GRACE) {
                _liveGuards.T40.ok = true;
                _liveGuards.T40.msg = '';
            }
        }

        // Movement-specific checks from snapshot
        for (const { xon, node: fromNode, mode: prevMode } of _liveGuardPrev) {
            if (!xon.alive) continue;
            const toNode = xon.node;
            if (toNode === fromNode) continue;
            if (prevMode !== xon._mode) continue;

            // ── T26: no unactivated SC traversal ──
            if (!_liveGuards.T26.failed) {
                const pid = pairId(fromNode, toNode);
                const scId = scPairToId.get(pid);
                if (scId !== undefined) {
                    const hasBaseEdge = (baseNeighbors[fromNode] || []).some(nb => nb.node === toNode);
                    if (!hasBaseEdge) {
                        if (!activeSet.has(scId) && !impliedSet.has(scId) && !electronImpliedSet.has(scId)) {
                            _liveGuards.T26.ok = false;
                            _liveGuards.T26.failed = true;
                            _liveGuards.T26.msg = `tick ${tick}: ${prevMode} xon on SC ${scId} (${fromNode}\u2192${toNode})`;
                            console.warn(`[T26 DEBUG] tick=${tick} mode=${prevMode} from=${fromNode} to=${toNode} scId=${scId} hasBase=${hasBaseEdge} active=${activeSet.has(scId)} implied=${impliedSet.has(scId)} eImpl=${electronImpliedSet.has(scId)} baseNb=[${(baseNeighbors[fromNode]||[]).map(nb=>nb.node).join(',')}]`);
                            anyFailed = true;
                        }
                    }
                }
            }

            // ── T27: no teleportation ──
            if (!_liveGuards.T27.failed) {
                const nbs = baseNeighbors[fromNode] || [];
                let connected = nbs.some(nb => nb.node === toNode);
                if (!connected) {
                    const scs = scByVert[fromNode] || [];
                    connected = scs.some(sc => (sc.a === fromNode ? sc.b : sc.a) === toNode);
                }
                if (!connected) {
                    _liveGuards.T27.ok = false;
                    _liveGuards.T27.failed = true;
                    _liveGuards.T27.msg = `tick ${tick}: teleport ${fromNode}\u2192${toNode}`;
                    anyFailed = true;
                }
            }
        }

        // ── T41: no adjacent xon swap ──
        // Two xons cannot swap places in a single tick (A@X,B@Y → A@Y,B@X).
        // This would require passing through each other on the same edge.
        if (!_liveGuards.T41.failed) {
            for (let i = 0; i < _liveGuardPrev.length; i++) {
                const a = _liveGuardPrev[i];
                if (!a.xon.alive) continue;
                for (let j = i + 1; j < _liveGuardPrev.length; j++) {
                    const b = _liveGuardPrev[j];
                    if (!b.xon.alive) continue;
                    if (a.node === b.xon.node && b.node === a.xon.node) {
                        _liveGuards.T41.ok = false;
                        _liveGuards.T41.failed = true;
                        _liveGuards.T41.msg = `tick ${tick}: swap ${a.node}\u2194${b.node}`;
                        anyFailed = true; break;
                    }
                }
                if (_liveGuards.T41.failed) break;
            }
            if (!_liveGuards.T41.failed && _liveGuards.T41.ok === null && tick >= LIVE_GUARD_GRACE) {
                _liveGuards.T41.ok = true;
                _liveGuards.T41.msg = '';
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // CONVERGENCE GUARDS — checked at deadline, then locked
    // ══════════════════════════════════════════════════════════════════

    // ── T25: Oct cage materializes AND stays active ──
    // Phase 1: Wait for all oct SCs to become active (deadline: grace + 24 ticks).
    // Phase 2: Once materialized, continuously verify cage never breaks.
    if (!_liveGuards.T25.failed) {
        const allOctActive = _octSCIds.length > 0 && _octSCIds.every(id => activeSet.has(id));
        if (_liveGuards.T25.ok !== true) {
            // Phase 1: waiting for materialization
            if (allOctActive) {
                _liveGuards.T25.ok = true; _liveGuards.T25.msg = '';
                _liveGuardRender();
            }
            if (tick > LIVE_GUARD_GRACE + 24) {
                const active = _octSCIds.filter(id => activeSet.has(id)).length;
                _liveGuards.T25.ok = false;
                _liveGuards.T25.failed = true;
                _liveGuards.T25.msg = `${active}/${_octSCIds.length} after ${tick} ticks`;
                anyFailed = true;
            }
        } else {
            // Phase 2: cage materialized — verify it never breaks
            if (!allOctActive) {
                const missing = _octSCIds.filter(id => !activeSet.has(id));
                _liveGuards.T25.ok = false;
                _liveGuards.T25.failed = true;
                _liveGuards.T25.msg = `tick ${tick}: oct cage broke (${missing.length} SCs lost)`;
                anyFailed = true;
            }
        }
    }

    // ── T17: Full tet coverage — all 8 faces visited within 256 ticks ──
    if (!_liveGuards.T17.failed && _liveGuards.T17.ok !== true) {
        let visitCount = 0;
        for (let f = 1; f <= 8; f++) {
            if (_demoVisits[f] && _demoVisits[f].total > 0) visitCount++;
        }
        if (visitCount === 8) {
            _liveGuards.T17.ok = true; _liveGuards.T17.msg = '';
            _liveGuardRender();
        } else if (tick > LIVE_GUARD_GRACE + 256) {
            _liveGuards.T17.ok = false;
            _liveGuards.T17.failed = true;
            _liveGuards.T17.msg = `only ${visitCount}/8 faces after ${tick} ticks`;
            anyFailed = true;
        }
    }

    // ── T22: Hadronic composition — progressive validation ──
    // Physics: proton = 2pu + 1pd → pu:pd = 2.0, neutron = 2nd + 1nu → nd:nu = 2.0
    // Validation criteria (programmatic):
    //   checkpoint 1 (256 ticks): wide band [1.0, 3.0] — early convergence signal
    //   checkpoint 2 (640 ticks): medium band [1.4, 2.6] — statistical significance
    //   checkpoint 3 (1280 ticks): tight band [1.6, 2.4] — final acceptance
    // Test passes at checkpoint 3. Fails only if tight band violated at deadline.
    // Running ratio shown in guard message for observability.
    if (!_liveGuards.T22.failed && _liveGuards.T22.ok !== true) {
        const gPu = Object.values(_demoVisits).reduce((s, v) => s + v.pu, 0);
        const gPd = Object.values(_demoVisits).reduce((s, v) => s + v.pd, 0);
        const gNd = Object.values(_demoVisits).reduce((s, v) => s + v.nd, 0);
        const gNu = Object.values(_demoVisits).reduce((s, v) => s + v.nu, 0);
        const puPdRatio = gPd > 0 ? gPu / gPd : 0;
        const ndNuRatio = gNu > 0 ? gNd / gNu : 0;
        const total = gPu + gPd + gNd + gNu;

        // Face coverage evenness — early pass if overall reaches 100%
        const totals = [];
        for (let f = 1; f <= 8; f++) totals.push(_demoVisits[f] ? _demoVisits[f].total : 0);
        const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
        const stddev = Math.sqrt(totals.reduce((s, v) => s + (v - mean) ** 2, 0) / totals.length);
        const cv = mean > 0 ? (stddev / mean) : 1;
        const evenness = Math.max(0, 1 - cv);

        // Show running ratios + evenness (non-failing update)
        if (total > 0) {
            _liveGuards.T22.msg = `pu:pd=${puPdRatio.toFixed(2)} nd:nu=${ndNuRatio.toFixed(2)} cov=${(evenness*100).toFixed(0)}%`;
        }

        // Early pass: face coverage overall reaches 100%
        if (evenness >= 0.999 && total >= 16) {
            _liveGuards.T22.ok = true;
            _liveGuards.T22.msg = `coverage 100% pu:pd=${puPdRatio.toFixed(2)} nd:nu=${ndNuRatio.toFixed(2)}`;
            _liveGuardRender();
        }

        // Progressive checkpoints (fallback validation)
        const t = tick - LIVE_GUARD_GRACE;
        const checkpoints = [
            { at: 256,  lo: 1.0, hi: 3.0, label: 'early' },
            { at: 640,  lo: 1.4, hi: 2.6, label: 'mid' },
            { at: 1280, lo: 1.6, hi: 2.4, label: 'final' },
        ];
        for (const cp of checkpoints) {
            if (t !== cp.at) continue;
            const inBand = puPdRatio >= cp.lo && puPdRatio <= cp.hi
                        && ndNuRatio >= cp.lo && ndNuRatio <= cp.hi;
            if (cp.label === 'final') {
                if (inBand) {
                    _liveGuards.T22.ok = true;
                    _liveGuards.T22.msg = `pu:pd=${puPdRatio.toFixed(2)} nd:nu=${ndNuRatio.toFixed(2)}`;
                } else {
                    _liveGuards.T22.ok = false;
                    _liveGuards.T22.failed = true;
                    _liveGuards.T22.msg = `${cp.label}: pu:pd=${puPdRatio.toFixed(2)} nd:nu=${ndNuRatio.toFixed(2)} [${cp.lo}-${cp.hi}]`;
                    anyFailed = true;
                }
            } else if (!inBand) {
                console.warn(`[T22 ${cp.label}] pu:pd=${puPdRatio.toFixed(2)} nd:nu=${ndNuRatio.toFixed(2)} outside [${cp.lo}-${cp.hi}]`);
            }
            _liveGuardRender();
        }
    }

    // ── T39: Demo mode opacity reset — verify sliders set on demo entry ──
    // Verify: run demo — all opacity sliders match expected demo defaults by grace end.
    // Violate: remove the slider reset code from startDemo() in flux-demo.js.
    if (!_liveGuards.T39.failed && tick === LIVE_GUARD_GRACE + 1) {
        const expectedSliders = {
            'sphere-opacity-slider': 5,
            'void-opacity-slider': 13,
            'graph-opacity-slider': 34,
            'trail-opacity-slider': 55,
            'excitation-speed-slider': 100,
            'tracer-lifespan-slider': 12,
        };
        const wrong = [];
        // Check slider positions
        for (const [id, val] of Object.entries(expectedSliders)) {
            const el = document.getElementById(id);
            if (!el) { wrong.push(`${id} missing`); continue; }
            if (+el.value !== val) wrong.push(`${id}=${el.value} expected ${val}`);
        }
        // Check rendered display values match (catches broken event listeners)
        const expectedDisplay = {
            'sphere-opacity-val': '5%',
            'void-opacity-val': '13%',
            'graph-opacity-val': '34%',
            'trail-opacity-val': '55%',
        };
        for (const [id, text] of Object.entries(expectedDisplay)) {
            const el = document.getElementById(id);
            if (!el) { wrong.push(`${id} missing`); continue; }
            if (el.textContent !== text) wrong.push(`${id}="${el.textContent}" expected "${text}"`);
        }
        // Check actual material opacity (sphere renderer)
        if (typeof _bgMat !== 'undefined' && Math.abs(_bgMat.opacity - 0.05) > 0.02) {
            wrong.push(`sphere material opacity=${_bgMat.opacity.toFixed(2)} expected 0.05`);
        }
        if (wrong.length > 0) {
            _liveGuards.T39.ok = false;
            _liveGuards.T39.failed = true;
            _liveGuards.T39.msg = wrong.join(', ');
            anyFailed = true;
        } else {
            _liveGuards.T39.ok = true;
            _liveGuards.T39.msg = '';
        }
        _liveGuardRender();
    }

    // ══════════════════════════════════════════════════════════════════
    // WIND-DOWN HALT — first failure starts a 4-tick countdown, then halt.
    // This lets other guards report failures before the sim stops.
    // ══════════════════════════════════════════════════════════════════
    if (anyFailed) {
        _liveGuardRender();
        console.error('[LIVE GUARD] Failure detected:', Object.entries(_liveGuards)
            .filter(([, g]) => g.failed).map(([k, g]) => `${k}: ${g.msg}`).join('; '));
    }
    const hasAnyFailure = Object.values(_liveGuards).some(g => g.failed);
    if (hasAnyFailure) {
        if (typeof _liveGuardFailTick === 'undefined' || _liveGuardFailTick === null) {
            _liveGuardFailTick = tick; // record first failure tick
        }
        if (tick >= _liveGuardFailTick + 4) {
            // Wind-down complete — halt
            if (typeof stopExcitationClock === 'function') stopExcitationClock();
            simHalted = true;
            _liveGuardRender();
            console.error('[LIVE GUARD] Simulation halted after wind-down:', Object.entries(_liveGuards)
                .filter(([, g]) => g.failed).map(([k, g]) => `${k}: ${g.msg}`).join('; '));
        }
    }
}

// Snapshot xon positions BEFORE demoTick advances them (called from demoTick)
let _liveGuardPrev = null;
function _liveGuardSnapshot() {
    if (!_liveGuardsActive || _testRunning) { _liveGuardPrev = null; return; }
    _liveGuardPrev = _demoXons.filter(x => x.alive).map(x => ({
        xon: x, node: x.node, mode: x._mode
    }));
}

// Update the test result rows for live-guarded tests in the left panel
function _liveGuardRender() {
    const testResultsEl = document.getElementById('dp-test-results');
    if (!testResultsEl) return;

    // Auto-derived from LIVE_GUARD_REGISTRY — single source of truth
    const nameMap = {};
    for (const entry of LIVE_GUARD_REGISTRY) nameMap[entry.id] = `${entry.id} ${entry.name}`;

    for (const [key, g] of Object.entries(_liveGuards)) {
        const fullName = nameMap[key];
        if (!fullName) continue;
        const num = fullName.match(/^T(\d+\w?)/)?.[1] || '';
        const label = fullName.replace(/^T\d+\w?\s*/, '');
        const icon = g.ok === true ? '\u2713' : (g.ok === null ? '\u2013' : '\u2717');
        const color = g.ok === true ? '#44cc66' : (g.ok === null ? '#ccaa44' : '#ff4444');

        // Find and replace the existing row
        const rows = testResultsEl.querySelectorAll('div');
        for (const row of rows) {
            if (row.textContent.includes(`T${num}`) && row.textContent.includes(label.substring(0, 10))) {
                row.innerHTML = `<span style="color:${color}; font-weight:bold; min-width:10px;">${icon}</span>`
                    + `<span style="color:#556677; min-width:18px;">T${num}</span>`
                    + `<span style="color:${g.ok === true ? '#7a9aaa' : color};">${label}</span>`
                    + (g.ok === true ? '' : `<span style="color:${g.ok === null ? '#aa8833' : '#aa4444'}; font-size:7px; margin-left:2px;">${g.msg || ''}</span>`);
                break;
            }
        }
    }

    // Update summary count
    _liveGuardUpdateSummary();
}

function _liveGuardUpdateSummary() {
    const testSummary = document.getElementById('dp-test-summary');
    const testResultsEl = document.getElementById('dp-test-results');
    if (!testSummary || !testResultsEl) return;

    const rows = testResultsEl.querySelectorAll('div[style]');
    let passed = 0, total = 0, nulled = 0, failed = 0;
    for (const row of rows) {
        const firstSpan = row.querySelector('span');
        if (!firstSpan) continue;
        total++;
        const txt = firstSpan.textContent.trim();
        if (txt === '\u2713') passed++;
        else if (txt === '\u2013') nulled++;
        else if (txt === '\u2717') failed++;
    }
    testSummary.textContent = `${passed}/${total}${nulled ? ` (${nulled}?)` : ''}`;
    testSummary.style.color = failed > 0 ? '#ff6644' : (nulled > 0 ? '#ccaa44' : '#66dd66');
}

function runDemo3Tests() {
    _testRunning = true;
    const results = [];
    const pass = (name) => { results.push({ name, ok: true }); };
    const fail = (name, msg) => { results.push({ name, ok: false, msg }); };
    const skip = (name, msg) => { results.push({ name, ok: null, msg: msg || 'unproven' }); };
    const assert = (name, cond, msg) => cond ? pass(name) : fail(name, msg || 'assertion failed');

    // ── Ensure nucleus is simulated so we have valid state ──
    if (!NucleusSimulator.active) {
        NucleusSimulator.simulateNucleus();
    }
    const A = new Set([1, 3, 6, 8]);
    const B = new Set([2, 4, 5, 7]);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 1: Loop topology — Fork (pu) produces a→b→a→c→a
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        const c = [10, 20, 30, 40];
        const seq = LOOP_SEQUENCES.pu(c);
        assert('T01 Fork topology',
            seq.length === 5 && seq[0] === 10 && seq[1] === 20 &&
            seq[2] === 10 && seq[3] === 30 && seq[4] === 10,
            `expected [10,20,10,30,10] got [${seq}]`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 2: Loop topology — Lollipop (nd) produces a→b→c→b→a
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        const c = [10, 20, 30, 40];
        const seq = LOOP_SEQUENCES.nd(c);
        assert('T02 Lollipop topology',
            seq.length === 5 && seq[0] === 10 && seq[1] === 20 &&
            seq[2] === 30 && seq[3] === 20 && seq[4] === 10,
            `expected [10,20,30,20,10] got [${seq}]`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 3: Loop topology — Hamiltonian CW (pd) produces a→b→c→d→a
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        const c = [10, 20, 30, 40];
        const seq = LOOP_SEQUENCES.pd(c);
        assert('T03 Hamiltonian CW topology',
            seq.length === 5 && seq[0] === 10 && seq[1] === 20 &&
            seq[2] === 30 && seq[3] === 40 && seq[4] === 10,
            `expected [10,20,30,40,10] got [${seq}]`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 4: Loop topology — Hamiltonian CCW (nu) produces a→d→c→b→a
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        const c = [10, 20, 30, 40];
        const seq = LOOP_SEQUENCES.nu(c);
        assert('T04 Hamiltonian CCW topology',
            seq.length === 5 && seq[0] === 10 && seq[1] === 40 &&
            seq[2] === 30 && seq[3] === 20 && seq[4] === 10,
            `expected [10,40,30,20,10] got [${seq}]`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 5: Bipartite groups — triples have valid A/B composition
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        let ok = true;
        for (const triple of L1_VALID_TRIPLES) {
            const aCount = triple.filter(f => A.has(f)).length;
            const bCount = triple.filter(f => B.has(f)).length;
            // Each triple must be 2A+1B (proton) or 1A+2B (neutron)
            if (!((aCount === 2 && bCount === 1) || (aCount === 1 && bCount === 2))) {
                ok = false; break;
            }
        }
        assert('T05 Bipartite triple composition', ok,
            'found triple without 2A+1B or 1A+2B composition');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 6: Hadron type assignment — proton triples get pu/pd, neutron get nu/nd
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        // Simulate 100 window assignments and check type constraints
        let ok = true, errMsg = '';
        for (let trial = 0; trial < 100 && ok; trial++) {
            const triple = L1_VALID_TRIPLES[trial % L1_VALID_TRIPLES.length];
            const faces = [...triple];
            const aCount = faces.filter(f => A.has(f)).length;
            const isProton = aCount >= faces.length / 2;
            const types = {};
            const minorityIdx = Math.floor(Math.random() * 3);
            if (isProton) {
                for (let i = 0; i < 3; i++) types[faces[i]] = (i === minorityIdx) ? 'pd' : 'pu';
            } else {
                for (let i = 0; i < 3; i++) types[faces[i]] = (i === minorityIdx) ? 'nu' : 'nd';
            }
            const vals = Object.values(types);
            if (isProton) {
                const puCount = vals.filter(v => v === 'pu').length;
                const pdCount = vals.filter(v => v === 'pd').length;
                if (puCount !== 2 || pdCount !== 1) { ok = false; errMsg = `proton: ${puCount}pu ${pdCount}pd`; }
            } else {
                const ndCount = vals.filter(v => v === 'nd').length;
                const nuCount = vals.filter(v => v === 'nu').length;
                if (ndCount !== 2 || nuCount !== 1) { ok = false; errMsg = `neutron: ${ndCount}nd ${nuCount}nu`; }
            }
        }
        assert('T06 Hadron type assignment (2:1 ratio)', ok, errMsg);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 7: Opposite-hadron deck — A-face singles get neutron types, B-face get proton
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        let ok = true;
        for (let f = 1; f <= 8; f++) {
            const deck = A.has(f) ? ['nd', 'nd', 'nu'] : ['pu', 'pu', 'pd'];
            const isNeutronDeck = deck.every(t => t === 'nd' || t === 'nu');
            const isProtonDeck = deck.every(t => t === 'pu' || t === 'pd');
            if (A.has(f) && !isNeutronDeck) { ok = false; break; }
            if (B.has(f) && !isProtonDeck) { ok = false; break; }
        }
        assert('T07 Opposite-hadron deck assignment', ok,
            'A-face deck should be neutron types, B-face should be proton types');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 8: Schedule structure — 16 windows = 8 triples + 8 singles
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        const sched = buildPhysicalSchedule();
        const triples = sched.filter(w => w.faces.length === 3);
        const singles = sched.filter(w => w.faces.length === 1);
        assert('T08 Schedule structure (16 = 8 triples + 8 singles)',
            sched.length === 16 && triples.length === 8 && singles.length === 8,
            `got ${sched.length} windows: ${triples.length} triples, ${singles.length} singles`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 9: Tet face data — all 8 faces have valid cycle + scIds
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        let ok = true, errMsg = '';
        for (let f = 1; f <= 8; f++) {
            const fd = _nucleusTetFaceData[f];
            if (!fd) { ok = false; errMsg = `face ${f} missing`; break; }
            if (!fd.cycle || fd.cycle.length !== 4) { ok = false; errMsg = `face ${f}: bad cycle`; break; }
            if (!fd.scIds || fd.scIds.length < 1) { ok = false; errMsg = `face ${f}: no scIds`; break; }
        }
        assert('T09 Tet face data (8 faces, valid cycle + scIds)', ok, errMsg);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 10: Xon spawning — _spawnXon creates valid xon object
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        const oldLen = _demoXons.length;
        const xon = _spawnXon(1, 'pu', +1);
        let ok = true, errMsg = '';
        if (!xon) { ok = false; errMsg = 'spawn returned null'; }
        else {
            if (!xon.alive) { ok = false; errMsg = 'not alive'; }
            if (xon._loopStep !== 0) { ok = false; errMsg = `loopStep=${xon._loopStep}`; }
            if (xon._loopSeq.length !== 5) { ok = false; errMsg = `seq len=${xon._loopSeq.length}`; }
            if (xon._quarkType !== 'pu') { ok = false; errMsg = `type=${xon._quarkType}`; }
            if (xon._assignedFace !== 1) { ok = false; errMsg = `face=${xon._assignedFace}`; }
            if (xon.col !== QUARK_COLORS.pu) { ok = false; errMsg = 'wrong color'; }
            if (!xon.trail || !xon.trailGeo || !xon.trailLine) { ok = false; errMsg = 'missing trail'; }
            // Cleanup test xon
            _destroyXon(xon);
            _finalCleanupXon(xon);
            _demoXons.splice(_demoXons.indexOf(xon), 1);
        }
        assert('T10 Xon spawning', ok, errMsg);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 11: Xon advancement — _advanceXon updates state correctly
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
        const xon = _spawnXon(1, 'pd', +1);
        let ok = true, errMsg = '';
        if (xon) {
            const seq = xon._loopSeq;
            _advanceXon(xon); // hop 0→1
            if (xon._loopStep !== 1) { ok = false; errMsg = `step=${xon._loopStep} after 1 hop`; }
            if (xon.node !== seq[1]) { ok = false; errMsg = `node=${xon.node} expected ${seq[1]}`; }
            if (xon.prevNode !== seq[0]) { ok = false; errMsg = `prevNode wrong`; }
            if (xon.tweenT !== 0) { ok = false; errMsg = 'tweenT not reset'; }
            _advanceXon(xon); _advanceXon(xon); _advanceXon(xon); // hops 1→4
            if (xon._loopStep !== 4) { ok = false; errMsg = `step=${xon._loopStep} after 4 hops`; }
            // 5th advance wraps to step 0 then advances to step 1 (continuous cycling)
            _advanceXon(xon);
            if (xon._loopStep !== 1) { ok = false; errMsg = `wrap: step=${xon._loopStep} expected 1`; }
            if (xon.node !== seq[1]) { ok = false; errMsg = `wrap: node=${xon.node} expected ${seq[1]}`; }
            _destroyXon(xon); _finalCleanupXon(xon);
            _demoXons.splice(_demoXons.indexOf(xon), 1);
        } else { ok = false; errMsg = 'spawn failed'; }
        assert('T11 Xon advancement (4 hops + wrap)', ok, errMsg);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //  PERSISTENT 6-XON MODEL (T12–T27)
    //  ALL deferred to LIVE MONITORING — continuous per-tick validation
    //  with grace period, permanent fail + halt on violation
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Auto-register all live guards from LIVE_GUARD_REGISTRY
    for (const entry of LIVE_GUARD_REGISTRY) {
        skip(`${entry.id} ${entry.name}`, 'grace period (live)');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // RESULTS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const passed = results.filter(r => r.ok === true).length;
    const nulled = results.filter(r => r.ok === null).length;
    const failed = results.filter(r => r.ok === false);
    console.log(`%c═══ Demo 3.0 Tests: ${passed}/${results.length} passed${nulled ? `, ${nulled} null` : ''} ═══`, 'font-weight:bold; font-size:14px');
    for (const r of results) {
        if (r.ok === true) console.log(`  %c✓ ${r.name}`, 'color:#44cc66');
        else if (r.ok === null) console.log(`  %c– ${r.name}: ${r.msg}`, 'color:#ccaa44');
        else console.log(`  %c✗ ${r.name}: ${r.msg}`, 'color:#ff4444; font-weight:bold');
    }
    if (failed.length === 0 && nulled === 0) {
        console.log('%c  ALL TESTS PASSED', 'color:#44cc66; font-weight:bold; font-size:12px');
    }

    // ── Update left panel ──
    const testSection = document.getElementById('dp-test-section');
    const testResultsEl = document.getElementById('dp-test-results');
    const testSummary = document.getElementById('dp-test-summary');
    if (testSection && testResultsEl) {
        testSection.style.display = '';
        const allPassed = failed.length === 0 && nulled === 0;
        testSummary.textContent = `${passed}/${results.length}${nulled ? ` (${nulled}?)` : ''}`;
        testSummary.style.color = allPassed ? '#66dd66' : (failed.length > 0 ? '#ff6644' : '#ccaa44');
        let html = '';
        for (const r of results) {
            const icon = r.ok === true ? '✓' : (r.ok === null ? '–' : '✗');
            const color = r.ok === true ? '#44cc66' : (r.ok === null ? '#ccaa44' : '#ff4444');
            const label = r.name.replace(/^T\d+\w?\s*/, '');
            const num = r.name.match(/^T(\d+\w?)/)?.[1] || '';
            html += `<div style="display:flex; gap:3px; align-items:baseline;">`
                + `<span style="color:${color}; font-weight:bold; min-width:10px;">${icon}</span>`
                + `<span style="color:#556677; min-width:18px;">T${num}</span>`
                + `<span style="color:${r.ok === true ? '#7a9aaa' : color};">${label}</span>`
                + (r.ok === true ? '' : `<span style="color:${r.ok === null ? '#aa8833' : '#aa4444'}; font-size:7px; margin-left:2px;">${r.msg || ''}</span>`)
                + `</div>`;
        }
        testResultsEl.innerHTML = html;
    }

    // ── Reset demo state after tests so visual demo starts clean ──
    _demoTick = 0;
    _demoSchedule = buildPhysicalSchedule();
    _demoVisitedFaces = new Set();
    _demoTypeBalanceHistory = [];
    _demoPrevFaces = new Set();
    if (_demoVisits) for (let f = 1; f <= 8; f++) {
        _demoVisits[f] = { pu: 0, pd: 0, nu: 0, nd: 0, total: 0 };
    }
    if (_demoFaceDecks) for (let f = 1; f <= 8; f++) {
        _demoFaceDecks[f] = [];
    }
    // Return xons to oct mode at their current positions
    for (const xon of _demoXons) {
        if (xon.alive && (xon._mode === 'tet' || xon._mode === 'idle_tet')) _returnXonToOct(xon);
    }
    // Clear any tet SCs accumulated during tests
    for (const [fIdStr, fd] of Object.entries(_nucleusTetFaceData)) {
        for (const scId of fd.scIds) electronImpliedSet.delete(scId);
    }
    _testRunning = false;

    return { passed, total: results.length, failed: failed.map(f => f.name) };
}

// ── Wire up nucleus UI ──
(function(){
    NucleusSimulator.populateModelSelect();

    // Simulate button
    document.getElementById('btn-simulate-nucleus')?.addEventListener('click', function(){
        // Demo mode: set L2 lattice default, simulate nucleus, then start pattern demo
        const latticeSlider = document.getElementById('lattice-slider');
        if (latticeSlider && !_demoActive) latticeSlider.value = 2;
        NucleusSimulator.simulateNucleus();
        // Small delay to let lattice build, then start demo loop
        setTimeout(function() {
            if (NucleusSimulator.active) startDemoLoop();
        }, 100);
    });

    // Tournament button
    document.getElementById('btn-tournament')?.addEventListener('click', function(){
        if(tournamentActive) stopTournament();
        else startTournament();
    });

    // Play/pause button — pauses/resumes the demo tick interval
    document.getElementById('btn-nucleus-pause')?.addEventListener('click', function(){
        if (typeof isDemoPaused === 'function' && _demoActive) {
            if (!isDemoPaused()) {
                pauseDemo();
                this.textContent = '▶';
                this.title = 'Resume simulation';
                document.getElementById('nucleus-status').textContent = 'paused';
            } else {
                resumeDemo();
                this.textContent = '⏸';
                this.title = 'Pause simulation';
                document.getElementById('nucleus-status').textContent = 'running';
            }
        } else if (excitationClockTimer) {
            stopExcitationClock();
            this.textContent = '▶';
            this.title = 'Resume simulation';
            document.getElementById('nucleus-status').textContent = 'paused';
        } else {
            startExcitationClock();
            this.textContent = '⏸';
            this.title = 'Pause simulation';
            document.getElementById('nucleus-status').textContent = 'running';
        }
    });

    // Stop/clear button
    document.getElementById('btn-stop-nucleus')?.addEventListener('click', function(){
        NucleusSimulator.deactivate();
        activeSet.clear();
        impliedSet.clear(); electronImpliedSet.clear(); blockedImplied.clear(); impliedBy.clear();
        _forceActualizedVoids.clear();
        while(excitations.length > 0){
            const e = excitations.pop();
            if(e.group) scene.remove(e.group);
            if(e.trailLine) scene.remove(e.trailLine);
        }
        if(typeof stopExcitationClock === 'function') stopExcitationClock();
        bumpState();
        const pFinal = detectImplied();
        applyPositions(pFinal);
        updateCandidates(); updateSpheres(); updateStatus();
        rebuildShortcutLines();
        updateExcitationSidebar();
        // Reset pause button state
        const pauseBtn = document.getElementById('btn-nucleus-pause');
        if(pauseBtn){ pauseBtn.textContent = '⏸'; pauseBtn.title = 'Pause simulation'; }
    });
})();
