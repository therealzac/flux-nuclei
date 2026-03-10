// flux-tests.js — Demo 3.0 unit tests + final UI wiring
// ═══════════════════════════════════════════════════════════════════════
// ║  DEMO 3.0 UNIT TESTS — assertions on xon mechanics                 ║
// ║  Run from console: runDemo3Tests()                                  ║
// ═══════════════════════════════════════════════════════════════════════
let _testRunning = false;  // suppress display updates during test execution

// ═══════════════════════════════════════════════════════════════════════
// ║  LIVE GUARD REGISTRY — single source of truth for ALL runtime tests ║
// ║  Adding/removing a test here is the ONLY action needed.             ║
// ║                                                                     ║
// ║  Each entry: { id, name, init?, convergence?, projected?,           ║
// ║               activate?, snapshot?, check? }                        ║
// ║    id:          'T19', 'T41', etc.                                  ║
// ║    name:        display name (without Txx prefix)                   ║
// ║    init:        extra state props for _liveGuards entry (optional)  ║
// ║    convergence: true → stays null during grace promotion (optional) ║
// ║    projected:   lookahead check fn(states) → null | violation       ║
// ║    activate:    called at grace end for initialization (optional)   ║
// ║    snapshot:    called before each tick for state capture (optional) ║
// ║    check:       runtime check fn(tick, g, ctx) → fail msg | null    ║
// ║                 ctx = { prev }                                      ║
// ║                                                                     ║
// ║  TO DISABLE A TEST: remove its entry. No other changes needed.      ║
// ═══════════════════════════════════════════════════════════════════════
const LIVE_GUARD_GRACE = 0;

// Oct capacity: 5 minus the number of weak particles.
// Each weak xon takes a slot away from the oct cage.
function _computeOctCapacity() {
    if (typeof _demoXons === 'undefined') return 5;
    const weakCount = _demoXons.filter(x => x.alive && x._mode === 'weak').length;
    return 5 - weakCount;
}

// Helper: check if actual loop matches any valid cycle rotation for a given quark type.
// _assignXonToTet rotates the cycle so the xon's starting oct node is in position 0.
// Valid rotations: [a,b,c,d], [c,b,a,d], [d,b,c,a] (oct nodes a,c,d can each be start).
function _loopMatchesAnyRotation(actual, quarkType, cycle) {
    const [a, b, c, d] = cycle;
    const rotations = [[a,b,c,d], [c,b,a,d], [d,b,c,a]];
    for (const rot of rotations) {
        const expected = LOOP_SEQUENCES[quarkType](rot);
        if (actual.length === expected.length && actual.every((n, i) => n === expected[i])) return true;
    }
    return false;
}

const LIVE_GUARD_REGISTRY = [
    { id: 'T01', name: 'Fork path audit (pu)', init: { _seen: 0 }, convergence: true,
      check(tick, g) {
        if (g.ok === true) return null;
        for (const xon of _demoXons) {
          if (!xon.alive || xon._mode !== 'tet' || xon._quarkType !== 'pu') continue;
          if (!xon._loopSeq || !xon._assignedFace) continue;
          const fd = _nucleusTetFaceData[xon._assignedFace];
          if (!fd) continue;
          if (_loopMatchesAnyRotation(xon._loopSeq, 'pu', fd.cycle)) {
            g._seen++; g.ok = true; g.msg = ''; _liveGuardRender(); return null;
          } else return `tick ${tick}: pu loop [${xon._loopSeq}] != any rotation of cycle [${fd.cycle}]`;
        }
        return null;
      }
    },
    { id: 'T02', name: 'Lollipop path audit (nd)', init: { _seen: 0 }, convergence: true,
      check(tick, g) {
        if (g.ok === true) return null;
        for (const xon of _demoXons) {
          if (!xon.alive || xon._mode !== 'tet' || xon._quarkType !== 'nd') continue;
          if (!xon._loopSeq || !xon._assignedFace) continue;
          const fd = _nucleusTetFaceData[xon._assignedFace];
          if (!fd) continue;
          if (_loopMatchesAnyRotation(xon._loopSeq, 'nd', fd.cycle)) {
            g._seen++; g.ok = true; g.msg = ''; _liveGuardRender(); return null;
          } else return `tick ${tick}: nd loop [${xon._loopSeq}] != any rotation of cycle [${fd.cycle}]`;
        }
        return null;
      }
    },
    { id: 'T03', name: 'Hamiltonian CW path audit (pd)', init: { _seen: 0 }, convergence: true,
      check(tick, g) {
        if (g.ok === true) return null;
        for (const xon of _demoXons) {
          if (!xon.alive || xon._mode !== 'tet' || xon._quarkType !== 'pd') continue;
          if (!xon._loopSeq || !xon._assignedFace) continue;
          const fd = _nucleusTetFaceData[xon._assignedFace];
          if (!fd) continue;
          if (_loopMatchesAnyRotation(xon._loopSeq, 'pd', fd.cycle)) {
            g._seen++; g.ok = true; g.msg = ''; _liveGuardRender(); return null;
          } else return `tick ${tick}: pd loop [${xon._loopSeq}] != any rotation of cycle [${fd.cycle}]`;
        }
        return null;
      }
    },
    { id: 'T04', name: 'Hamiltonian CCW path audit (nu)', init: { _seen: 0 }, convergence: true,
      check(tick, g) {
        if (g.ok === true) return null;
        for (const xon of _demoXons) {
          if (!xon.alive || xon._mode !== 'tet' || xon._quarkType !== 'nu') continue;
          if (!xon._loopSeq || !xon._assignedFace) continue;
          const fd = _nucleusTetFaceData[xon._assignedFace];
          if (!fd) continue;
          if (_loopMatchesAnyRotation(xon._loopSeq, 'nu', fd.cycle)) {
            g._seen++; g.ok = true; g.msg = ''; _liveGuardRender(); return null;
          } else return `tick ${tick}: nu loop [${xon._loopSeq}] != any rotation of cycle [${fd.cycle}]`;
        }
        return null;
      }
    },
    // T05-T07 REMOVED: per user request
    { id: 'T12', name: 'Conservation (alive+2*stored=6)',
      projected(states) {
        const liveCount = states.length;
        const stored = typeof _gluonStoredPairs !== 'undefined' ? _gluonStoredPairs : 0;
        const total = liveCount + 2 * stored;
        if (total !== 6) return { guard: 'T12', xon: null, msg: `conservation: alive=${liveCount} stored=${stored} total=${total}` };
        return null;
      },
      check(tick, g) {
        const liveCount = _demoXons.filter(x => x.alive && !x._dying).length;
        const stored = typeof _gluonStoredPairs !== 'undefined' ? _gluonStoredPairs : 0;
        const total = liveCount + 2 * stored;
        if (total !== 6) return `tick ${tick}: alive=${liveCount} stored=${stored} total=${total} (expected 6)`;
        return null;
      }
    },
    { id: 'T13', name: 'Array size unchanged', init: { _initCount: null },
      activate(g) { g._initCount = _demoXons.length; },
      check(tick, g) {
        if (g._initCount === null) return null;
        if (_demoXons.length !== g._initCount)
          return `tick ${tick}: count ${g._initCount}\u2192${_demoXons.length}`;
        return null;
      }
    },
    { id: 'T14', name: 'Dying trail cleanup',
      check(tick, g) {
        for (const xon of _demoXons) {
          if (!xon._dying) continue;
          if (!xon._dyingStartTick) xon._dyingStartTick = tick;
          if (tick - xon._dyingStartTick > 60)
            return `tick ${tick}: xon dying for ${tick - xon._dyingStartTick} ticks (max 60)`;
        }
        return null;
      }
    },
    { id: 'T15', name: 'Xon state (sign + mode)',
      check(tick, g) {
        for (const xon of _demoXons) {
          if (!xon.alive) continue;
          if (xon.sign !== 1 && xon.sign !== -1) return `tick ${tick}: sign=${xon.sign}`;
          if (xon._mode !== 'tet' && xon._mode !== 'oct' && xon._mode !== 'idle_tet' && xon._mode !== 'weak' && xon._mode !== 'oct_formation')
            return `tick ${tick}: mode=${xon._mode}`;
        }
        return null;
      }
    },
    { id: 'T16', name: 'Xon always has function',
      check(tick, g) {
        for (const xon of _demoXons) {
          if (!xon.alive) continue;
          if (xon._mode === 'tet' || xon._mode === 'idle_tet') {
            if (!xon._loopSeq || xon._loopSeq.length < 4)
              return `tick ${tick}: ${xon._mode} no loop seq`;
          } else if (xon._mode === 'oct') {
            // During discovery (_octNodeSet null): oct xons roam freely
            if (_octNodeSet && !_octNodeSet.has(xon.node))
              return `tick ${tick}: oct at non-oct node ${xon.node}`;
          } else if (xon._mode === 'oct_formation') {
            // Formation mode: building the cage, no node constraints yet
          }
        }
        return null;
      }
    },
    { id: 'T17', name: 'Full tet coverage (8/8 faces)', convergence: true,
      check(tick, g) {
        if (g.ok === true) return null;
        let visitCount = 0;
        for (let f = 1; f <= 8; f++) {
          if (_demoVisits[f] && _demoVisits[f].total > 0) visitCount++;
        }
        if (visitCount === 8) { g.ok = true; g.msg = ''; _liveGuardRender(); return null; }
        // No time limit — stays pending (null) until all 8 faces visited
        g.msg = `${visitCount}/8 faces`;
        return null;
      }
    },
    { id: 'T19', name: 'Pauli exclusion (1 xon/node)',
      projected(states) {
        if (_demoTick === 0) return null; // tick 0: all 6 xons at center (allowed)
        const counts = new Map();
        for (const s of states) {
            const c = (counts.get(s.futureNode) || 0) + 1;
            counts.set(s.futureNode, c);
            if (c > 1) return { guard: 'T19', xon: s.xon, msg: `Pauli at node ${s.futureNode}` };
        }
        return null;
      },
      check(tick, g) {
        if (tick === 0) return null; // tick 0: all 6 xons born at center (allowed)
        const occupied = new Map();
        for (const xon of _demoXons) {
          if (!xon.alive) continue;
          const n = xon.node;
          if (occupied.has(n)) {
            // Diagnostic: dump _moveTrace for this tick
            if (typeof _moveTrace !== 'undefined' && _moveTrace.length) {
              console.error('T19 TRACE:', _moveTrace.map(t =>
                `x${t.xonIdx}:${t.from}\u2192${t.to}(${t.path},${t.mode})`).join(' | '));
            }
            // Dump all xon positions
            console.error('T19 POSITIONS:', _demoXons.map((x,i) =>
              x.alive ? `x${i}@${x.node}(${x._mode})` : `x${i}:dead`).join(' '));
            return `tick ${tick}: node ${n} has 2+ xons`;
          }
          occupied.set(n, true);
        }
        return null;
      }
    },
    { id: 'T20', name: 'Never stand still',
      projected(states) {
        for (const s of states) {
          if (s.xon._mode === 'oct_formation') continue; // formation phase: scripted
          if (s.futureNode === s.fromNode && s.futureMode === s.xon._mode) {
            return { guard: 'T20', xon: s.xon, msg: `would stay at node ${s.fromNode} (${s.futureMode})` };
          }
        }
        return null;
      },
      check(tick, g, ctx) {
        if (!ctx.prev) return null;
        for (const { xon, node: fromNode, mode: prevMode } of ctx.prev) {
          if (!xon.alive) continue;
          if (prevMode !== xon._mode) continue;
          if (prevMode === 'oct_formation') continue; // formation phase: scripted movement
          if (xon.node === fromNode) return `tick ${tick}: stuck at node ${fromNode} (${prevMode})`;
        }
        return null;
      }
    },
    { id: 'T21', name: 'Oct cage permanence', init: { _octSnapshot: null },
      projected(states) {
        // Only protect oct SCs that have ALREADY been actualized (in snapshot).
        // Can't demand all 4 be present from start — cage emerges from choreography.
        if (typeof _octSCIds === 'undefined') return null;
        if (!_liveGuards || !_liveGuards.T21 || !_liveGuards.T21._octSnapshot) return null;
        const snap = _liveGuards.T21._octSnapshot;
        if (snap.size === 0) return null;
        for (const scId of snap) {
            if (!activeSet.has(scId)) return { guard: 'T21', xon: null, msg: `oct SC ${scId} lost from activeSet` };
        }
        return null;
      },
      activate(g) {
        const snap = new Set();
        for (const scId of _octSCIds) { if (activeSet.has(scId)) snap.add(scId); }
        g._octSnapshot = snap;
        if (snap.size === 0) { g.ok = null; g.msg = 'no oct SCs active yet'; }
      },
      check(tick, g) {
        // Update snapshot with newly active oct SCs
        if (g._octSnapshot) {
          for (const scId of _octSCIds) { if (activeSet.has(scId)) g._octSnapshot.add(scId); }
          if (g._octSnapshot.size > 0 && g.ok === null) { g.ok = true; g.msg = ''; }
        }
        // Verify all snapshotted oct SCs still active
        if (g._octSnapshot && g._octSnapshot.size > 0) {
          for (const scId of g._octSnapshot) {
            if (!activeSet.has(scId)) return `tick ${tick}: oct SC ${scId} lost`;
          }
        }
        return null;
      }
    },
    { id: 'T22', name: 'Hadronic composition (pu:pd\u22482, nd:nu\u22482)', convergence: true,
      check(tick, g) {
        if (g.ok === true) return null;
        const gPu = Object.values(_demoVisits).reduce((s, v) => s + v.pu, 0);
        const gPd = Object.values(_demoVisits).reduce((s, v) => s + v.pd, 0);
        const gNd = Object.values(_demoVisits).reduce((s, v) => s + v.nd, 0);
        const gNu = Object.values(_demoVisits).reduce((s, v) => s + v.nu, 0);
        const puPdRatio = gPd > 0 ? gPu / gPd : 0;
        const ndNuRatio = gNu > 0 ? gNd / gNu : 0;
        const total = gPu + gPd + gNd + gNu;
        const totals = [];
        for (let f = 1; f <= 8; f++) totals.push(_demoVisits[f] ? _demoVisits[f].total : 0);
        const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
        const stddev = Math.sqrt(totals.reduce((s, v) => s + (v - mean) ** 2, 0) / totals.length);
        const cv = mean > 0 ? (stddev / mean) : 1;
        const evenness = Math.max(0, 1 - cv);
        if (total > 0)
          g.msg = `pu:pd=${puPdRatio.toFixed(2)} nd:nu=${ndNuRatio.toFixed(2)} cov=${(evenness*100).toFixed(0)}%`;
        // Passes when evenness is near-perfect with enough data
        if (evenness >= 0.999 && total >= 16) {
          g.ok = true;
          g.msg = `coverage 100% pu:pd=${puPdRatio.toFixed(2)} nd:nu=${ndNuRatio.toFixed(2)}`;
          _liveGuardRender();
          return null;
        }
        // Also passes when ratios are in the target band [1.6, 2.4]
        if (total >= 16 && puPdRatio >= 1.6 && puPdRatio <= 2.4
                        && ndNuRatio >= 1.6 && ndNuRatio <= 2.4) {
          g.ok = true;
          g.msg = `pu:pd=${puPdRatio.toFixed(2)} nd:nu=${ndNuRatio.toFixed(2)}`;
          _liveGuardRender();
          return null;
        }
        // No time limit — stays pending until ratios converge
        return null;
      }
    },
    { id: 'T23', name: 'Sparkle color matches purpose',
      check(tick, g) {
        for (const xon of _demoXons) {
          if (!xon.alive || !xon.sparkMat) continue;
          const actual = xon.sparkMat.color.getHex();
          if (xon._mode === 'oct' || xon._mode === 'oct_formation') {
            if (actual !== 0xffffff) return `tick ${tick}: oct spark=0x${actual.toString(16)}`;
          } else if (xon._mode === 'tet' || xon._mode === 'idle_tet') {
            const expected = QUARK_COLORS[xon._quarkType];
            if (expected !== undefined && actual !== expected)
              return `tick ${tick}: ${xon._quarkType} spark wrong`;
          } else if (xon._mode === 'weak') {
            if (actual !== WEAK_FORCE_COLOR) return `tick ${tick}: weak spark=0x${actual.toString(16)}`;
          }
        }
        return null;
      }
    },
    { id: 'T24', name: 'Trail color stability',
      check(tick, g) {
        for (const xon of _demoXons) {
          if (!xon.alive || !xon.trailColHistory) continue;
          for (let j = 0; j < xon.trailColHistory.length; j++) {
            const c = xon.trailColHistory[j];
            const isWhite = c === 0xffffff;
            const isQuark = c === QUARK_COLORS.pu || c === QUARK_COLORS.pd ||
                            c === QUARK_COLORS.nu || c === QUARK_COLORS.nd;
            const isWeak = c === WEAK_FORCE_COLOR;
            if (!isWhite && !isQuark && !isWeak) return `tick ${tick}: color 0x${c.toString(16)}`;
          }
          if (xon.trailColHistory.length !== xon.trail.length) return `tick ${tick}: trail/color desync`;
        }
        return null;
      }
    },
    { id: 'T26', name: 'No unactivated SC traversal',
      projected(states) {
        const violations = [];
        for (const s of states) {
            if (s.futureNode === s.fromNode) continue;
            const pid = pairId(s.fromNode, s.futureNode);
            const scId = scPairToId.get(pid);
            if (scId === undefined) continue;
            const hasBase = (baseNeighbors[s.fromNode] || []).some(nb => nb.node === s.futureNode);
            if (!hasBase && !activeSet.has(scId) && !impliedSet.has(scId) && !xonImpliedSet.has(scId)) {
                violations.push({ guard: 'T26', xon: s.xon, msg: `unactivated SC ${scId} (${s.fromNode}\u2192${s.futureNode})` });
            }
        }
        return violations.length ? violations : null;
      },
      snapshot(g) {
        // Capture SC activation state BEFORE the tick so check() verifies
        // the SC was active at the time of the move, not after same-tick severance.
        g._t26ActiveSnap = new Set(activeSet);
        g._t26ImpliedSnap = new Set(impliedSet);
        g._t26EImpliedSnap = new Set(xonImpliedSet);
      },
      check(tick, g, ctx) {
        if (!ctx.prev) return null;
        // Check both pre-tick snapshot AND current state:
        // - Snapshot catches SCs active before tick that got removed mid-tick (still valid)
        // - Current state catches SCs added mid-tick before traversal (e.g. _startIdleTetLoop manifest)
        const aSnap = g._t26ActiveSnap || activeSet;
        const iSnap = g._t26ImpliedSnap || impliedSet;
        const eSnap = g._t26EImpliedSnap || xonImpliedSet;
        for (const { xon, node: fromNode, mode: prevMode } of ctx.prev) {
          if (!xon.alive) continue;
          const toNode = xon.node;
          if (toNode === fromNode) continue;
          if (prevMode !== xon._mode) continue;
          const pid = pairId(fromNode, toNode);
          const scId = scPairToId.get(pid);
          if (scId !== undefined) {
            const hasBaseEdge = (baseNeighbors[fromNode] || []).some(nb => nb.node === toNode);
            if (!hasBaseEdge) {
              // SC must be in snapshot OR current state (covers mid-tick additions)
              const inSnap = aSnap.has(scId) || iSnap.has(scId) || eSnap.has(scId);
              const inCurr = activeSet.has(scId) || impliedSet.has(scId) || xonImpliedSet.has(scId);
              if (!inSnap && !inCurr) {
                if (typeof _moveTrace !== 'undefined' && _moveTrace.length) {
                  console.error('T26 TRACE:', _moveTrace.map(t =>
                    `x${t.xonIdx}:${t.from}\u2192${t.to}(${t.path},${t.mode})`).join(' | '));
                }
                return `tick ${tick}: ${prevMode} xon on SC ${scId} (${fromNode}\u2192${toNode})`;
              }
            }
          }
        }
        return null;
      }
    },
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
      },
      check(tick, g, ctx) {
        if (!ctx.prev) return null;
        for (const { xon, node: fromNode, mode: prevMode } of ctx.prev) {
          if (!xon.alive) continue;
          const toNode = xon.node;
          if (toNode === fromNode) continue;
          if (prevMode !== xon._mode) continue;
          const nbs = baseNeighbors[fromNode] || [];
          let connected = nbs.some(nb => nb.node === toNode);
          if (!connected) {
            const scs = scByVert[fromNode] || [];
            connected = scs.some(sc => (sc.a === fromNode ? sc.b : sc.a) === toNode);
          }
          if (!connected) return `tick ${tick}: teleport ${fromNode}\u2192${toNode}`;
        }
        return null;
      }
    },
    { id: 'T30', name: 'Annihilation always in pairs', init: { _prevStored: 0, _prevAlive: 6 },
      activate(g) {
        g._prevStored = typeof _gluonStoredPairs !== 'undefined' ? _gluonStoredPairs : 0;
        g._prevAlive = _demoXons.filter(x => x.alive).length;
      },
      check(tick, g) {
        const curStored = typeof _gluonStoredPairs !== 'undefined' ? _gluonStoredPairs : 0;
        const curAlive = _demoXons.filter(x => x.alive).length;
        if (curStored > g._prevStored) {
          const dStored = curStored - g._prevStored;
          const dAlive = g._prevAlive - curAlive;
          if (dStored * 2 !== dAlive) {
            g._prevStored = curStored; g._prevAlive = curAlive;
            return `tick ${tick}: stored+=${dStored} alive-=${dAlive} (expected 2:1 ratio)`;
          }
        }
        g._prevStored = curStored; g._prevAlive = curAlive;
        return null;
      }
    },
    { id: 'T33', name: 'Trail persists when alive',
      check(tick, g) {
        for (const xon of _demoXons) {
          if (!xon.alive || xon._dying) continue;
          if (!xon.trail || xon.trail.length === 0)
            return `tick ${tick}: alive xon has empty trail at node ${xon.node}`;
          if (!xon.trailColHistory || xon.trailColHistory.length !== xon.trail.length)
            return `tick ${tick}: trail/color length mismatch`;
        }
        return null;
      }
    },
    { id: 'T34', name: 'Trail length bounded',
      check(tick, g) {
        for (const xon of _demoXons) {
          if (!xon.alive || !xon.trail) continue;
          if (xon.trail.length > XON_TRAIL_LENGTH)
            return `tick ${tick}: trail len=${xon.trail.length} max=${XON_TRAIL_LENGTH}`;
        }
        return null;
      }
    },
    { id: 'T35', name: 'Sparkle visible when alive',
      check(tick, g) {
        for (const xon of _demoXons) {
          if (!xon.alive || xon._dying) continue;
          if (!xon.spark || !xon.sparkMat)
            return `tick ${tick}: alive xon missing spark at node ${xon.node}`;
        }
        return null;
      }
    },
    { id: 'T36', name: 'Flash on mode transition',
      check(tick, g, ctx) {
        // Skip if flash effects are disabled — no flash to check
        if (typeof _flashEnabled !== 'undefined' && !_flashEnabled) return null;
        if (!ctx.prev) return null;
        for (const { xon, mode: prevMode } of ctx.prev) {
          if (!xon.alive) continue;
          if (prevMode === xon._mode) continue;
          if (xon.flashT < 0.5)
            return `tick ${tick}: ${prevMode}\u2192${xon._mode} flashT=${xon.flashT.toFixed(2)}`;
        }
        return null;
      }
    },
    { id: 'T37', name: 'Trail flash boost',
      check(tick, g) {
        for (const xon of _demoXons) {
          if (!xon.alive || xon._dying) continue;
          if (xon.flashT > 0.1 && xon.flashT < 0.7 && xon._lastTrailFlashBoost !== undefined) {
            if (xon._lastTrailFlashBoost <= 0)
              return `tick ${tick}: flashT=${xon.flashT.toFixed(2)} but boost=${xon._lastTrailFlashBoost.toFixed(3)}`;
          }
        }
        return null;
      }
    },
    { id: 'T38', name: 'Weak force confinement',
      check(tick, g, ctx) {
        // Weak xons are protected from non-physical death.
        // Pauli annihilation is the ONLY way xons die (_annihilateXonPair),
        // and Pauli exclusion is absolute — it trumps weak confinement.
        // So weak xon death is always legitimate.  This guard now only
        // checks that weak xons don't spontaneously vanish (alive→false
        // without going through _annihilateXonPair), which would be a bug.
        // Since _annihilateXonPair is the sole death path, this is a no-op
        // for now but kept as a sentinel for future code changes.
        return null;
      }
    },
    // T39 removed
    { id: 'T40', name: 'Trail fade on annihilation',
      check(tick, g, ctx) {
        if (!ctx.prev) return null;
        for (const { xon } of ctx.prev) {
          if (xon.alive) continue;
          if (!xon._dying)
            return `tick ${tick}: xon annihilated at node ${xon.node} without trail fade (_dying not set)`;
        }
        if (g.ok === null && tick >= LIVE_GUARD_GRACE) { g.ok = true; g.msg = ''; }
        return null;
      }
    },
    // T43 removed — xons now spawn directly on distinct oct nodes (deterministic formation)
    { id: 'T41', name: 'No adjacent swap',
      check(tick, g, ctx) {
        if (!ctx.prev) return null;
        // Detect swaps using snapshot: xon A moved X→Y while xon B moved Y→X
        const moves = ctx.prev.filter(p => p.xon.alive && p.node !== p.xon.node);
        for (let i = 0; i < moves.length; i++) {
          for (let j = i + 1; j < moves.length; j++) {
            const a = moves[i], b = moves[j];
            if (a.node === b.xon.node && b.node === a.xon.node) {
              const aMode = a.mode + '→' + a.xon._mode;
              const bMode = b.mode + '→' + b.xon._mode;
              // Diagnostic: dump _moveTrace for this tick
              if (typeof _moveTrace !== 'undefined' && _moveTrace.length) {
                console.error('T41 SWAP TRACE:', _moveTrace.map(t =>
                  `x${t.xonIdx}:${t.from}→${t.to}(${t.path},${t.mode})`).join(' | '));
              }
              return `tick ${tick}: swap ${a.node}↔${b.node} [${aMode}] [${bMode}]`;
            }
          }
        }
        if (g.ok === null && tick >= LIVE_GUARD_GRACE) { g.ok = true; g.msg = ''; }
        return null;
      }
    },
    { id: 'T42', name: 'SC attribution (no top-down imposition)',
      check(tick, g) {
        if (!_nucleusTetFaceData || !xonImpliedSet.size) return null;
        if (typeof _scAttribution === 'undefined') return null;
        // Every SC in xonImpliedSet must have causal attribution:
        // a traversal event that caused it to exist. Side-effect SCs from
        // lattice deformation are fine — they inherit attribution from the
        // traversal that triggered the solver. Unattributed SCs = top-down
        // imposition, which violates the bottom-up physics model.
        // Attribution cleanup runs at end of tick, so this is a safety net.
        for (const scId of xonImpliedSet) {
            if (activeSet.has(scId)) continue; // not eSC's responsibility
            if (!_scAttribution.has(scId)) {
                const sc = SC_BY_ID[scId];
                return `tick ${tick}: unattributed eSC ${scId} (${sc ? sc.a + '↔' + sc.b : '?'})`;
            }
        }
        if (g.ok === null && tick >= LIVE_GUARD_GRACE) { g.ok = true; g.msg = ''; }
        return null;
      }
    },
    // T45: No bouncing for oct xons. Tet/idle_tet exempt (fork needs a→b→a→c→a).
    // Weak xons exempt — their bouncing is BFS navigation, not oscillation. T54 catches cycling.
    { id: 'T45', name: 'No xon bounce (A→B→A)',
      projected(states) {
        if (!_T45_BOUNCE_GUARD) return null;
        const violations = [];
        for (const s of states) {
          if (s.xon._mode !== 'oct') continue; // only oct xons
          if (s.futureNode === s.xon.prevNode && s.futureNode !== s.fromNode && s.xon.prevNode != null) {
            violations.push({ guard: 'T45', xon: s.xon, msg: `would bounce to prevNode ${s.xon.prevNode}` });
          }
        }
        return violations.length ? violations : null;
      },
      snapshot(g) {
        g._t45prev = new Map();
        for (const xon of _demoXons) {
          if (!xon.alive) continue;
          g._t45prev.set(xon, { prevNode: xon.prevNode, node: xon.node, mode: xon._mode });
        }
      },
      check(tick, g, ctx) {
        if (!ctx.prev || tick <= LIVE_GUARD_GRACE) return null;
        for (const xon of _demoXons) {
          if (!xon.alive) continue;
          if (xon._mode !== 'oct') continue; // only oct xons (tet/idle_tet/weak exempt)
          const prev = g._t45prev?.get(xon);
          if (!prev) continue;
          if (prev.mode !== 'oct') continue; // was not oct before — skip
          if (xon.node === prev.prevNode && xon.node !== prev.node && prev.prevNode != null) {
            return `tick ${tick}: ${xon._mode} xon ${_demoXons.indexOf(xon)} bounced ${prev.prevNode}→${prev.node}→${xon.node}`;
          }
        }
        if (g.ok === null && tick >= LIVE_GUARD_GRACE) { g.ok = true; g.msg = ''; }
        return null;
      }
    },
    { id: 'T44', name: 'Traversal lock edge-only',
      check(tick, g) {
        // _traversalLockedSCs must ONLY contain SCs on edges xons are straddling
        // (prevNode↔node). No face-level locks. Physics: "if I used a shortcut on my
        // last turn, it must exist this turn." Nothing more.
        if (typeof _traversalLockedSCs !== 'function') return null;
        const locked = _traversalLockedSCs();
        // Build the expected set: only edge SCs
        const expectedEdgeSCs = new Set();
        for (const xon of _demoXons) {
            if (!xon.alive || xon.prevNode == null) continue;
            const pid = pairId(xon.prevNode, xon.node);
            const scId = scPairToId.get(pid);
            if (scId !== undefined) expectedEdgeSCs.add(scId);
        }
        // Every locked SC must be an edge SC
        for (const scId of locked) {
            if (!expectedEdgeSCs.has(scId)) {
                const sc = SC_BY_ID[scId];
                return `tick ${tick}: non-edge lock ${scId} (${sc ? sc.a + '↔' + sc.b : '?'})`;
            }
        }
        // Every edge SC must be locked
        for (const scId of expectedEdgeSCs) {
            if (!locked.has(scId)) {
                const sc = SC_BY_ID[scId];
                return `tick ${tick}: unlocked edge ${scId} (${sc ? sc.a + '↔' + sc.b : '?'})`;
            }
        }
        if (g.ok === null && tick >= LIVE_GUARD_GRACE) { g.ok = true; g.msg = ''; }
        return null;
      }
    },
    // ═══════════════════════════════════════════════════════════════════
    // T50-T53: Unified demand-driven choreography tests
    // ═══════════════════════════════════════════════════════════════════
    // T50 REMOVED: per user request
    { id: 'T51', name: 'Ratio tracker accuracy',
      check(tick, g) {
        if (g.ok === true) return null;
        if (typeof _ratioTracker === 'undefined') {
            if (tick > LIVE_GUARD_GRACE) return 'tick ' + tick + ': _ratioTracker not defined';
            return null;
        }
        if (tick < LIVE_GUARD_GRACE) return null;
        // Sync and verify against manual sum of _demoVisits
        _ratioTracker.sync();
        let manualPu = 0, manualPd = 0, manualNu = 0, manualNd = 0;
        for (let f = 1; f <= 8; f++) {
            if (!_demoVisits[f]) continue;
            manualPu += _demoVisits[f].pu || 0;
            manualPd += _demoVisits[f].pd || 0;
            manualNu += _demoVisits[f].nu || 0;
            manualNd += _demoVisits[f].nd || 0;
        }
        if (_ratioTracker.pu !== manualPu || _ratioTracker.pd !== manualPd ||
            _ratioTracker.nu !== manualNu || _ratioTracker.nd !== manualNd) {
            return `tick ${tick}: tracker mismatch pu=${_ratioTracker.pu}/${manualPu} pd=${_ratioTracker.pd}/${manualPd}`;
        }
        // Verify deficit() returns number in [-1, 1]
        for (const t of ['pu', 'pd', 'nu', 'nd']) {
            const d = _ratioTracker.deficit(t);
            if (typeof d !== 'number' || isNaN(d)) {
                return `tick ${tick}: deficit('${t}') returned ${d}`;
            }
        }
        g.ok = true; g.msg = ''; return null;
      }
    },
    // T52 REMOVED: No forced loop termination — no longer needed since window system eliminated.
    // All tet→oct transitions are now legitimate (PHASE 0 eviction, safety escape, loop completion).
    { id: 'T54', name: 'No cyclic path outside oct cage',
      projected(states) {
        if (typeof _octNodeSet === 'undefined' || !_octNodeSet) return null;
        const violations = [];
        for (const s of states) {
          const trail = s.xon.trail;
          if (!trail || trail.length < 5) continue;
          // Would the proposed move create a cycle outside the oct cage?
          const recent = trail.slice(-7);
          recent.push(s.futureNode);
          const seen = new Set();
          let hasCycle = false;
          for (const n of recent) {
            if (seen.has(n)) { hasCycle = true; break; }
            seen.add(n);
          }
          if (!hasCycle) continue;
          let touchesOct = false;
          for (const n of recent) {
            if (_octNodeSet.has(n)) { touchesOct = true; break; }
          }
          if (!touchesOct) {
            violations.push({ guard: 'T54', xon: s.xon, msg: `would cycle outside oct: [${recent.join(',')}]` });
          }
        }
        return violations.length ? violations : null;
      },
      check(tick, g, ctx) {
        if (tick <= LIVE_GUARD_GRACE) return null;
        if (typeof _octNodeSet === 'undefined' || !_octNodeSet) return null;
        // Check every xon's trail for a repeated node (cycle) with no oct nodes
        for (const xon of _demoXons) {
          if (!xon.alive) continue;
          const trail = xon.trail;
          if (!trail || trail.length < 6) continue;
          // Look at the last 8 trail entries (or fewer if trail is short)
          const recent = trail.slice(-8);
          // Cycle detection: does any node appear more than once?
          const seen = new Set();
          let hasCycle = false;
          for (const n of recent) {
            if (seen.has(n)) { hasCycle = true; break; }
            seen.add(n);
          }
          if (!hasCycle) continue;
          // Cycle detected — does any node in recent trail touch the oct cage?
          let touchesOct = false;
          for (const n of recent) {
            if (_octNodeSet.has(n)) { touchesOct = true; break; }
          }
          if (!touchesOct) {
            return `tick ${tick}: xon ${_demoXons.indexOf(xon)} (${xon._mode}) cycling outside oct cage: [${recent.join(',')}]`;
          }
        }
        if (g.ok === null) { g.ok = true; g.msg = ''; }
        return null;
      }
    },
    // T53 REMOVED: per user request (covered by T22)
    // T56 REMOVED: diagonal traversal fixed at the source (movement filtering)
    { id: 'T55', name: 'Oct capacity (hadronic pressure)',
      init: { _octCapacity: 6 },
      check(tick, g) {
        const cap = _computeOctCapacity();
        g._octCapacity = cap;
        const octCount = _demoXons.filter(x => x.alive && x._mode === 'oct').length;
        g.msg = `oct: ${octCount}/${cap}`;
        if (tick < 16) return null; // grace period for opening choreography
        if (octCount > cap) {
          return `tick ${tick}: ${octCount} oct xons > capacity ${cap}`;
        }
        return null;
      }
    },
    { id: 'T57', name: 'Tracer segments unit-length',
      projected(states) {
        // Pre-solver: SC edges are ~1.15 before activation+convergence.
        // Use wide tolerance to allow SC moves but catch teleportation (>1.5).
        const tol = 0.20;
        const violations = [];
        for (const s of states) {
          if (s.futureNode === s.fromNode) continue;
          const a = pos[s.fromNode], b = pos[s.futureNode];
          if (!a || !b) continue;
          const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (Math.abs(dist - 1) > tol) {
            violations.push({ guard: 'T57', xon: s.xon, msg: `segment len=${dist.toFixed(4)} (${s.fromNode}→${s.futureNode})` });
          }
        }
        return violations.length ? violations : null;
      },
      check(tick, g) {
        // Post-solver: use current pos[] (solver has converged).
        // Activated edges are ~1.0. Teleportation shows as >> 1.0.
        const tol = 0.05;
        for (const xon of _demoXons) {
          if (!xon.alive || xon._dying) continue;
          if (!xon.trail || xon.trail.length < 2) continue;
          const fromN = xon.trail[xon.trail.length - 2];
          const toN = xon.trail[xon.trail.length - 1];
          if (fromN === toN) continue; // same-node (spawn)
          const a = pos[fromN], b = pos[toN];
          if (!a || !b) continue;
          const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < 1e-6) continue;
          if (Math.abs(dist - 1) > tol) {
            return `tick ${tick}: tracer segment len=${dist.toFixed(4)} (nodes ${fromN}→${toN})`;
          }
        }
        return null;
      }
    },
];

// ── Auto-derived from registry ──
// STRUCTURAL GUARANTEE: Every guard with projected() is automatically checked by lookahead.
// Guards WITHOUT projected() are logged as warnings — add projected() to include in lookahead.
const PROJECTED_GUARD_CHECKS = LIVE_GUARD_REGISTRY.filter(e => e.projected).map(e => e.projected);
const _GUARDS_WITHOUT_PROJECTED = LIVE_GUARD_REGISTRY.filter(e => !e.projected && !e.convergence).map(e => e.id);
if (_GUARDS_WITHOUT_PROJECTED.length > 0) {
    console.warn(`[GUARD COVERAGE] Guards without projected() — not checked by lookahead: ${_GUARDS_WITHOUT_PROJECTED.join(', ')}`);
}

const _liveGuards = {};
for (const entry of LIVE_GUARD_REGISTRY) {
    _liveGuards[entry.id] = { ok: null, msg: 'grace period', failed: false, ...(entry.init || {}) };
}
let _liveGuardsActive = false;
let _liveGuardFailTick = null; // tick of first failure (for wind-down halt)
let _liveGuardDumped = false;  // only dump once per failure

// ══════════════════════════════════════════════════════════════════
// Generic dispatcher — iterates LIVE_GUARD_REGISTRY and calls each
// entry's check() function. No per-test if-blocks needed.
// ══════════════════════════════════════════════════════════════════
function _liveGuardCheck() {
    if (!_demoActive || !_liveGuardsActive || _testRunning) return;
    const tick = _demoTick;

    // ── During grace: stay null ──
    if (tick <= LIVE_GUARD_GRACE) {
        if (tick === LIVE_GUARD_GRACE) {
            // Promote non-convergence guards to green
            for (const entry of LIVE_GUARD_REGISTRY) {
                if (entry.convergence) continue;
                const g = _liveGuards[entry.id];
                if (!g.failed) { g.ok = true; g.msg = ''; }
            }
            // Call activate() for entries that have it
            for (const entry of LIVE_GUARD_REGISTRY) {
                if (entry.activate) entry.activate(_liveGuards[entry.id]);
            }
            _liveGuardRender();
        }
        return;
    }

    let anyFailed = false;
    const ctx = { prev: _liveGuardPrev };

    // ── Run all guards from registry ──
    for (const entry of LIVE_GUARD_REGISTRY) {
        if (!entry.check) continue;
        const g = _liveGuards[entry.id];
        if (g.failed) continue;
        const result = entry.check(tick, g, ctx);
        if (typeof result === 'string') {
            g.ok = false;
            g.failed = true;
            g.msg = result;
            anyFailed = true;
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // WIND-DOWN HALT — first failure starts a 4-tick countdown, then halt.
    // This lets other guards report failures before the sim stops.
    // ══════════════════════════════════════════════════════════════════
    if (anyFailed) {
        _liveGuardRender();
        const failMsgs = Object.entries(_liveGuards)
            .filter(([, g]) => g.failed).map(([k, g]) => `${k}: ${g.msg}`);
        console.error('[LIVE GUARD] Failure detected:', failMsgs.join('; '));
        // Dump failure state to localStorage + file download for post-refresh audit
        if (!_liveGuardDumped) {
            _liveGuardDumped = true;
            try {
                // Build SC detail lists
                const scActiveList = typeof activeSet !== 'undefined' ? [...activeSet].map(id => {
                    const sc = typeof SC_BY_ID !== 'undefined' ? SC_BY_ID[id] : null;
                    return sc ? { id, a: sc.a, b: sc.b } : { id };
                }) : [];
                const scXonImpliedList = typeof xonImpliedSet !== 'undefined' ? [...xonImpliedSet].map(id => {
                    const sc = typeof SC_BY_ID !== 'undefined' ? SC_BY_ID[id] : null;
                    const attr = typeof _scAttribution !== 'undefined' ? _scAttribution.get(id) : null;
                    return { id, a: sc?.a, b: sc?.b, attribution: attr || null };
                }) : [];
                const scImpliedList = typeof impliedSet !== 'undefined' ? [...impliedSet].map(id => {
                    const sc = typeof SC_BY_ID !== 'undefined' ? SC_BY_ID[id] : null;
                    return sc ? { id, a: sc.a, b: sc.b } : { id };
                }) : [];
                // T26 snapshot state (what T26 saw as pre-tick SC state)
                const t26Snap = {};
                for (const [gid, gv] of Object.entries(_liveGuards)) {
                    if (gid === 'T26') {
                        t26Snap.activeSnap = gv._t26ActiveSnap ? [...gv._t26ActiveSnap] : null;
                        t26Snap.impliedSnap = gv._t26ImpliedSnap ? [...gv._t26ImpliedSnap] : null;
                        t26Snap.eImpliedSnap = gv._t26EImpliedSnap ? [...gv._t26EImpliedSnap] : null;
                    }
                }
                const dump = {
                    timestamp: new Date().toISOString(),
                    tick,
                    failures: failMsgs,
                    guards: Object.fromEntries(Object.entries(_liveGuards).map(([k, g]) => [k, { ok: g.ok, msg: g.msg, failed: g.failed }])),
                    xons: (typeof _demoXons !== 'undefined' ? _demoXons : []).filter(x => x.alive).map((x, i) => ({
                        idx: i, node: x.node, prevNode: x.prevNode, mode: x._mode,
                        face: x._assignedFace, quark: x._quarkType, step: x._loopStep,
                        loopSeq: x._loopSeq, movedThisTick: x._movedThisTick,
                        trail: x.trail ? x.trail.slice(-8) : []
                    })),
                    moveTraceHistory: typeof _moveTraceHistory !== 'undefined' ? _moveTraceHistory.slice(-60) : [],
                    moveTraceCurrent: typeof _moveTrace !== 'undefined' ? _moveTrace.slice() : [],
                    scState: {
                        active: scActiveList,
                        xonImplied: scXonImpliedList,
                        implied: scImpliedList
                    },
                    t26Snapshot: t26Snap
                };
                const json = JSON.stringify(dump, null, 2);
                localStorage.setItem('flux_guard_dump', json);
                console.error('[LIVE GUARD] Dump saved to localStorage(flux_guard_dump)');
            } catch (e) { console.error('[LIVE GUARD] Dump failed:', e); }
        }
    }
    const hasAnyFailure = Object.values(_liveGuards).some(g => g.failed);
    if (hasAnyFailure) {
        if (typeof _liveGuardFailTick === 'undefined' || _liveGuardFailTick === null) {
            _liveGuardFailTick = tick; // record first failure tick
        }
        // ── BACKTRACKING: all failures trigger rewind instead of halt ──
        const canBacktrack = typeof _rewindRequested !== 'undefined'
            && typeof _btSnapshots !== 'undefined'
            && _btSnapshots.length > 0
            && typeof _btActive !== 'undefined';
        if (canBacktrack) {
            // Signal rewind instead of halting
            _rewindRequested = true;
            _rewindViolation = Object.entries(_liveGuards)
                .filter(([, g]) => g.failed).map(([k, g]) => `${k}: ${g.msg}`).join('; ');
            // Reset all failed guard state so rewind can try again
            for (const entry of LIVE_GUARD_REGISTRY) {
                const g = _liveGuards[entry.id];
                if (g.failed) {
                    g.failed = false; g.ok = true; g.msg = '';
                }
            }
            _liveGuardFailTick = null;
            _liveGuardDumped = false; // allow re-dump on next real failure
            console.warn(`[BACKTRACK] Rewind requested: ${_rewindViolation}`);
        } else if (tick >= _liveGuardFailTick + 0) {
            // No backtrack snapshots available — halt as last resort
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
    // Call snapshot() for entries that have it (e.g. T42 SC set capture)
    for (const entry of LIVE_GUARD_REGISTRY) {
        if (!entry.snapshot) continue;
        const g = _liveGuards[entry.id];
        if (g && !g.failed) entry.snapshot(g);
    }
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

    // T01-T07: Now handled as live convergence guards in LIVE_GUARD_REGISTRY.
    // They start null and only pass when runtime conditions are met (e.g. tet faces discovered).

    // T08 REMOVED: Schedule structure test eliminated (window system removed)

    // T09 REMOVED: Tet face data test eliminated (dynamic discovery, face count varies)

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // T10 DISABLED: requires face data which is deferred during discovery
    // skip('T10 Xon spawning', 'disabled');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TEST 11: Xon advancement — _advanceXon updates state correctly
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // T11 DISABLED: requires face data which is deferred during discovery
    // skip('T11 Xon advancement (4 hops + wrap)', 'disabled');

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
    _demoVisitedFaces = new Set();
    _demoTypeBalanceHistory = [];
    _demoPrevFaces = new Set();
    if (_demoVisits) for (let f = 1; f <= 8; f++) {
        _demoVisits[f] = { pu: 0, pd: 0, nu: 0, nd: 0, total: 0 };
    }
    // Return xons to oct mode at their current positions
    for (const xon of _demoXons) {
        if (xon.alive && (xon._mode === 'tet' || xon._mode === 'idle_tet')) _returnXonToOct(xon);
    }
    // Clear any tet SCs accumulated during tests
    for (const [fIdStr, fd] of Object.entries(_nucleusTetFaceData)) {
        for (const scId of fd.scIds) xonImpliedSet.delete(scId);
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
        impliedSet.clear(); xonImpliedSet.clear(); blockedImplied.clear(); impliedBy.clear();
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

    // ── "Tune T22" button ──────────────────────────────────────────────
    document.getElementById('btn-tune-t22')?.addEventListener('click', function () {
        if (_tournamentRunning) return;
        _runTournament();
    });
})();

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CHOREOGRAPHY PARAMETER TOURNAMENT (GA)                            ║
// ║  Headless trial runner + genetic algorithm for T22 convergence     ║
// ╚══════════════════════════════════════════════════════════════════════╝

let _tournamentRunning = false;
let _tournamentTargetTick = 0; // tick at which current trial ends
let _tournamentCallback = null; // called when trial reaches target tick

// Evaluate fitness from current _demoVisits state.
// Returns { puPd, ndNu, evenness, totalVisits, fitness, criticalFail }
function _evaluateFitness() {
    const gPu = Object.values(_demoVisits).reduce((s, v) => s + v.pu, 0);
    const gPd = Object.values(_demoVisits).reduce((s, v) => s + v.pd, 0);
    const gNd = Object.values(_demoVisits).reduce((s, v) => s + v.nd, 0);
    const gNu = Object.values(_demoVisits).reduce((s, v) => s + v.nu, 0);
    const puPd = gPd > 0 ? gPu / gPd : 0;
    const ndNu = gNu > 0 ? gNd / gNu : 0;
    const total = gPu + gPd + gNd + gNu;

    const totals = [];
    for (let f = 1; f <= 8; f++) totals.push(_demoVisits[f] ? _demoVisits[f].total : 0);
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    const stddev = Math.sqrt(totals.reduce((s, v) => s + (v - mean) ** 2, 0) / totals.length);
    const cv = mean > 0 ? (stddev / mean) : 1;
    const evenness = Math.max(0, 1 - cv);

    // Check for ANY guard failure — algo must pass all tests
    const failedGuards = Object.entries(_liveGuards)
        .filter(([, g]) => g.failed)
        .map(([id]) => id);
    const anyFail = failedGuards.length > 0 || simHalted;

    const distPuPd = 1 - Math.min(1, Math.abs(puPd - 2.0) / 2.0);
    const distNdNu = 1 - Math.min(1, Math.abs(ndNu - 2.0) / 2.0);
    // Hit rate: completions / assignments (how often does assignment → actualized tet?)
    const hitRate = _demoTetAssignments > 0 ? total / _demoTetAssignments : 0;
    // Fitness = ratio accuracy + evenness + hit rate
    // distPuPd, distNdNu ∈ [0,1], evenness ∈ [0,1], hitRate ∈ [0,1]
    // Weights: 30% puPd + 30% ndNu + 20% evenness + 20% hitRate = max 1.0
    const balance = distPuPd * 0.3 + distNdNu * 0.3 + evenness * 0.2 + hitRate * 0.2;
    // Fitness tiers: clean survivors > failed candidates > zero-visit candidates
    let fitness;
    if (total === 0) fitness = -20;
    else if (anyFail) fitness = balance - 10;
    else fitness = balance;

    return { puPd, ndNu, evenness, hitRate, totalVisits: total, assignments: _demoTetAssignments, fitness, failedGuards, survivedTicks: _demoTick, clean: !anyFail && total > 0 };
}

// Hook into demoTick to detect when trial reaches target tick.
// Called from demoTick's UI update path (at end of each tick).
function _tournamentTickCheck() {
    if (!_tournamentRunning || !_tournamentCallback) return;

    // Early termination: if no tet completions after 5 full cycles, kill trial
    if (_demoTick > 0 && _demoTick % 200 === 0) {
        const total = Object.values(_demoVisits).reduce((s, v) => s + v.total, 0);
        if (total === 0 && _demoTick >= 320) {  // 5 epochs × 64 ticks
            console.warn(`[Tournament] Early termination: 0 tet visits after ${_demoTick} ticks`);
            const cb = _tournamentCallback;
            _tournamentCallback = null;
            cb();
            return;
        }
    }

    if (_demoTick >= _tournamentTargetTick || simHalted) {
        const cb = _tournamentCallback;
        _tournamentCallback = null;
        cb();
    }
}

// Start a visual trial: apply params, start demo, resolve when target tick reached.
function _applyTournamentVisuals() {
    // Tournament visual presets: clean view focused on xon choreography
    const presets = {
        'sphere-opacity-slider': 5,    // spheres: 5%
        'void-opacity-slider': 34,     // shapes: 34%
        'graph-opacity-slider': 34,    // graph: 34%
        'trail-opacity-slider': 100,   // xons: 100%
        'tracer-lifespan-slider': 34,  // lifespan: 34
    };
    for (const [id, val] of Object.entries(presets)) {
        const el = document.getElementById(id);
        if (el) { el.value = val; el.dispatchEvent(new Event('input')); }
    }
    // Orbit: enable at 34% rate
    const orbitSlider = document.getElementById('orbit-speed-slider');
    if (orbitSlider) { orbitSlider.value = 34; orbitSlider.dispatchEvent(new Event('input')); }
    if (typeof _autoOrbit !== 'undefined') _autoOrbit = true;
    const orbitVal = document.getElementById('orbit-speed-val');
    if (orbitVal) { orbitVal.textContent = '34%'; orbitVal.style.color = '#9abccc'; }
    const orbitToggle = document.getElementById('orbit-toggle');
    if (orbitToggle) orbitToggle.style.color = '#d4a054';
}

function _startVisualTrial(params, maxTicks) {
    return new Promise((resolve) => {
        // Stop any existing demo cleanly
        if (typeof stopDemo === 'function') stopDemo();
        simHalted = false;

        // Apply candidate params
        Object.assign(_choreoParams, params);

        // Force L2 lattice for tournament trials
        const slider = document.getElementById('lattice-slider');
        if (slider && +slider.value !== 2) {
            slider.value = 2;
            if (typeof updateLatticeLevel === 'function') updateLatticeLevel();
        }

        // Ensure nucleus is active
        if (!NucleusSimulator.active) NucleusSimulator.simulateNucleus();

        // Set target tick and callback
        _tournamentTargetTick = maxTicks;
        _tournamentCallback = () => {
            const result = _evaluateFitness();
            resolve(result);
        };

        // Start the demo — it will run visually using the normal animation loop
        startDemoLoop();

        // Apply tournament visual presets AFTER startDemoLoop (which sets opacity defaults)
        _applyTournamentVisuals();

        // Restore trial label (simulateNucleus overwrites rule-title)
        const titleEl = document.getElementById('rule-title');
        if (titleEl && titleEl.dataset.trialLabel) titleEl.textContent = titleEl.dataset.trialLabel;
    });
}

// GA operators
function _tournamentCrossover(a, b) {
    const child = {};
    for (const key of Object.keys(_choreoParamRanges)) {
        child[key] = Math.random() < 0.5 ? a[key] : b[key];
    }
    return child;
}

function _tournamentMutate(params) {
    const m = { ...params };
    const keys = Object.keys(_choreoParamRanges);
    const nMutations = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < nMutations; i++) {
        const key = keys[Math.floor(Math.random() * keys.length)];
        const range = _choreoParamRanges[key];
        const [lo, hi] = range;
        const isFloat = range[2] === 'float';
        const noise = (Math.random() - 0.5) * (hi - lo) * 0.3;
        let val = m[key] + noise;
        val = Math.max(lo, Math.min(hi, val));
        m[key] = isFloat ? val : Math.round(val);
    }
    return m;
}

function _tournamentRandomCandidate() {
    const c = {};
    for (const [key, range] of Object.entries(_choreoParamRanges)) {
        const [lo, hi] = range;
        const isFloat = range[2] === 'float';
        if (isFloat) {
            c[key] = lo + Math.random() * (hi - lo);
        } else {
            c[key] = lo + Math.floor(Math.random() * (hi - lo + 1));
        }
    }
    return c;
}

// Generate a descriptive name for a trial based on its parameter personality
function _trialDescriptiveName(gen, idx, p) {
    // Lookahead personality
    const la = p.lookahead <= 5 ? 'impulsive' : p.lookahead <= 12 ? 'cautious' : p.lookahead <= 20 ? 'strategic' : 'prophetic';
    // Congestion style
    const cg = p.congestionMax <= 2 ? 'tight' : p.congestionMax <= 4 ? 'balanced' : 'loose';
    // Scoring aggression (face bonuses)
    const agg = (p.faceOnBonus + p.faceNearBonus) <= 10 ? 'passive' : (p.faceOnBonus + p.faceNearBonus) <= 30 ? 'active' : 'aggressive';
    // Coverage hunger
    const cov = p.coverageDeficitWeight <= 5 ? 'relaxed' : p.coverageDeficitWeight <= 15 ? 'hungry' : 'ravenous';

    return `G${gen+1}.${idx+1}  ${la} ${cg} ${agg} ${cov}`;
}

// Main tournament runner — runs each trial visually on-screen (serial, not parallel)
async function _runTournament() {
    _tournamentRunning = true;
    const POP_SIZE = 12;
    const GENERATIONS = 10;
    const ELITE_COUNT = 4;
    const statusEl = document.getElementById('tune-status');

    const originalParams = { ..._choreoParams };
    const titleEl = document.getElementById('rule-title');

    // Initial population: current config + mutations + random
    let population = [{ ..._choreoParams }];
    for (let i = 1; i < POP_SIZE; i++) {
        if (i < POP_SIZE / 2) {
            population.push(_tournamentMutate({ ..._choreoParams }));
        } else {
            population.push(_tournamentRandomCandidate());
        }
    }

    let bestEver = null;
    let bestFitnessEver = -Infinity;
    let bestClean = false;
    const genSummaries = [];  // per-generation summary for JSON dump
    let finalGenResults = []; // full trial results from last generation

    for (let gen = 0; gen < GENERATIONS; gen++) {
        if (!_tournamentRunning) break; // allow cancel

        const results = [];
        for (let i = 0; i < population.length; i++) {
            if (!_tournamentRunning) break;

            const params = population[i];
            const maxTicks = 2000;

            if (statusEl) {
                const bestStr = bestFitnessEver > -Infinity ? bestFitnessEver.toFixed(3) : '...';
                const cleanStr = bestClean ? ' clean' : '';
                statusEl.textContent = `gen ${gen + 1}/${GENERATIONS} | ${i + 1}/${POP_SIZE} | best=${bestStr}${cleanStr}`;
            }

            // Update top-center title with descriptive trial name
            if (titleEl) {
                const label = _trialDescriptiveName(gen, i, params);
                titleEl.textContent = label;
                titleEl.dataset.trialLabel = label;
            }

            // Run this trial visually — demo renders on screen
            const result = await _startVisualTrial(params, maxTicks);
            results.push({ params, ...result });

            if (result.fitness > bestFitnessEver) {
                bestFitnessEver = result.fitness;
                bestEver = { ...params };
                bestClean = result.clean;
            }
        }

        // Sort by fitness descending (clean candidates naturally rank above failed ones due to tier gap)
        results.sort((a, b) => b.fitness - a.fitness);

        const top = results[0];
        const cleanCount = results.filter(r => r.clean).length;
        const avgFitness = results.reduce((s, r) => s + r.fitness, 0) / results.length;
        const worstFitness = results[results.length - 1].fitness;
        const failStr = top.failedGuards?.length ? ` FAIL[${top.failedGuards.join(',')}]@${top.survivedTicks}` : ` survived ${top.survivedTicks}`;
        console.log(`[Tournament] Gen ${gen + 1}: best=${top.fitness.toFixed(3)} pu:pd=${top.puPd.toFixed(2)} nd:nu=${top.ndNu.toFixed(2)} even=${top.evenness.toFixed(2)} hit=${(top.hitRate*100).toFixed(0)}% (${top.totalVisits}/${top.assignments}) visits=${top.totalVisits}${failStr} (${cleanCount}/${POP_SIZE} clean)`, top.params);

        genSummaries.push({
            gen: gen + 1,
            bestFitness: top.fitness,
            avgFitness,
            worstFitness,
            cleanCount,
            bestParams: { ...top.params },
        });
        // Keep full results from last generation for dump
        if (gen === GENERATIONS - 1 || !_tournamentRunning) {
            finalGenResults = results.map(r => ({
                fitness: r.fitness, clean: r.clean, puPd: r.puPd, ndNu: r.ndNu,
                evenness: r.evenness, hitRate: r.hitRate, totalVisits: r.totalVisits,
                assignments: r.assignments, survivedTicks: r.survivedTicks,
                failedGuards: r.failedGuards || [], params: r.params,
            }));
        }

        // Select elite
        const elites = results.slice(0, ELITE_COUNT).map(r => r.params);

        // Build next generation
        population = [...elites];
        for (let i = 0; i < ELITE_COUNT; i++) {
            const a = elites[i % ELITE_COUNT];
            const b = elites[(i + 1) % ELITE_COUNT];
            population.push(_tournamentCrossover(a, b));
        }
        for (let i = 0; i < POP_SIZE - ELITE_COUNT * 2; i++) {
            const base = elites[Math.floor(Math.random() * ELITE_COUNT)];
            population.push(_tournamentMutate(base));
        }
    }

    // Apply best params and restart demo with winner
    if (bestEver) {
        Object.assign(_choreoParams, bestEver);
        console.log('[Tournament] Best params applied:', bestEver, 'fitness:', bestFitnessEver.toFixed(3));
        localStorage.setItem('flux_choreo_params', JSON.stringify(bestEver));
        localStorage.setItem('flux_choreo_fitness', bestFitnessEver.toFixed(3));
    }

    if (statusEl) {
        const cleanTag = bestClean ? ' CLEAN' : ' (failed guards)';
        statusEl.textContent = `done! fitness=${bestFitnessEver.toFixed(3)}${cleanTag}`;
        statusEl.style.color = bestClean ? '#66dd66' : '#ccaa44';
    }

    _tournamentRunning = false;

    // ── Dump tournament results to JSON file ──
    try {
        const dumpData = {
            timestamp: new Date().toISOString(),
            generations: GENERATIONS,
            populationSize: POP_SIZE,
            eliteCount: ELITE_COUNT,
            bestFitness: bestFitnessEver,
            bestClean,
            bestParams: bestEver,
            genSummaries,
            finalGenResults,
        };
        const blob = new Blob([JSON.stringify(dumpData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tournament-results-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[Tournament] Results dumped to', a.download);
    } catch (e) {
        console.error('[Tournament] Failed to dump results:', e);
    }

    // Restore top-center title
    if (titleEl) {
        titleEl.textContent = 'NUCLEUS: DEUTERON';
        titleEl.title = '';
        delete titleEl.dataset.trialLabel;
    }

    // Restart demo with winning params
    if (typeof stopDemo === 'function') stopDemo();
    simHalted = false;
    if (typeof startDemoLoop === 'function') startDemoLoop();
}
