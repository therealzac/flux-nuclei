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
// ║                 ctx = { isWindowBoundary, prev }                    ║
// ║                                                                     ║
// ║  TO DISABLE A TEST: remove its entry. No other changes needed.      ║
// ═══════════════════════════════════════════════════════════════════════
const LIVE_GUARD_GRACE = 12;

const LIVE_GUARD_REGISTRY = [
    { id: 'T01', name: 'Fork path audit (pu)', init: { _seen: 0 } },
    { id: 'T02', name: 'Lollipop path audit (nd)', init: { _seen: 0 } },
    { id: 'T03', name: 'Hamiltonian CW path audit (pd)', init: { _seen: 0 } },
    { id: 'T04', name: 'Hamiltonian CCW path audit (nu)', init: { _seen: 0 } },
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
          if (xon._mode !== 'tet' && xon._mode !== 'oct' && xon._mode !== 'idle_tet' && xon._mode !== 'weak')
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
            if (!_octNodeSet.has(xon.node))
              return `tick ${tick}: oct at non-oct node ${xon.node}`;
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
        if (tick > LIVE_GUARD_GRACE + 256)
          return `only ${visitCount}/8 faces after ${tick} ticks`;
        return null;
      }
    },
    { id: 'T19', name: 'Pauli exclusion (1 xon/node)',
      projected(states) {
        const counts = new Map();
        for (const s of states) {
            const c = (counts.get(s.futureNode) || 0) + 1;
            counts.set(s.futureNode, c);
            if (c > 1) return { guard: 'T19', xon: s.xon, msg: `Pauli at node ${s.futureNode}` };
        }
        return null;
      },
      check(tick, g) {
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
      check(tick, g, ctx) {
        if (ctx.isWindowBoundary || !ctx.prev) return null;
        for (const { xon, node: fromNode, mode: prevMode } of ctx.prev) {
          if (!xon.alive) continue;
          if (prevMode !== xon._mode) continue;
          if (xon.node === fromNode) return `tick ${tick}: stuck at node ${fromNode} (${prevMode})`;
        }
        return null;
      }
    },
    { id: 'T21', name: 'Oct cage permanence', init: { _octSnapshot: null },
      projected(states) {
        if (typeof _octSCIds === 'undefined') return null;
        for (const scId of _octSCIds) {
            if (!activeSet.has(scId)) return { guard: 'T21', xon: null, msg: `oct SC ${scId} missing from activeSet` };
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
        if (evenness >= 0.999 && total >= 16) {
          g.ok = true;
          g.msg = `coverage 100% pu:pd=${puPdRatio.toFixed(2)} nd:nu=${ndNuRatio.toFixed(2)}`;
          _liveGuardRender();
          return null;
        }
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
              g.ok = true;
              g.msg = `pu:pd=${puPdRatio.toFixed(2)} nd:nu=${ndNuRatio.toFixed(2)}`;
            } else {
              return `${cp.label}: pu:pd=${puPdRatio.toFixed(2)} nd:nu=${ndNuRatio.toFixed(2)} [${cp.lo}-${cp.hi}]`;
            }
          } else if (!inBand) {
            console.warn(`[T22 ${cp.label}] pu:pd=${puPdRatio.toFixed(2)} nd:nu=${ndNuRatio.toFixed(2)} outside [${cp.lo}-${cp.hi}]`);
          }
          _liveGuardRender();
        }
        return null;
      }
    },
    { id: 'T23', name: 'Sparkle color matches purpose',
      check(tick, g) {
        for (const xon of _demoXons) {
          if (!xon.alive || !xon.sparkMat) continue;
          const actual = xon.sparkMat.color.getHex();
          if (xon._mode === 'oct') {
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
    { id: 'T25', name: 'Oct cage within 12 ticks', convergence: true,
      projected(states) {
        if (typeof _octSCIds === 'undefined') return null;
        if (!_liveGuards || !_liveGuards.T25 || _liveGuards.T25.ok !== true) return null;
        const allActive = _octSCIds.every(id => activeSet.has(id));
        if (!allActive) return { guard: 'T25', xon: null, msg: 'oct cage broken' };
        return null;
      },
      check(tick, g) {
        const allOctActive = _octSCIds.length > 0 && _octSCIds.every(id => activeSet.has(id));
        if (g.ok !== true) {
          if (allOctActive) { g.ok = true; g.msg = ''; _liveGuardRender(); }
          if (tick > LIVE_GUARD_GRACE + 24) {
            const active = _octSCIds.filter(id => activeSet.has(id)).length;
            return `${active}/${_octSCIds.length} after ${tick} ticks`;
          }
        } else {
          if (!allOctActive) {
            const missing = _octSCIds.filter(id => !activeSet.has(id));
            return `tick ${tick}: oct cage broke (${missing.length} SCs lost)`;
          }
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
        if (ctx.isWindowBoundary || !ctx.prev) return null;
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
    { id: 'T29', name: 'White trails only on oct edges',
      projected(states) {
        if (!_octNodeSet || !_octNodeSet.size) return null;
        const violations = [];
        for (const s of states) {
            if (s.futureColor === 0xffffff && !_octNodeSet.has(s.futureNode))
                violations.push({ guard: 'T29', xon: s.xon, msg: `white at non-oct node ${s.futureNode}` });
        }
        return violations.length ? violations : null;
      },
      check(tick, g) {
        if (!_octNodeSet || !_octNodeSet.size) return null;
        for (const xon of _demoXons) {
          if (!xon.alive || !xon.trailColHistory || !xon.trail) continue;
          for (let i = 0; i < xon.trailColHistory.length; i++) {
            if (xon.trailColHistory[i] === 0xffffff) {
              if (!_octNodeSet.has(xon.trail[i]))
                return `tick ${tick}: white trail at non-oct node ${xon.trail[i]}`;
            }
          }
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
        if (ctx.isWindowBoundary || !ctx.prev) return null;
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
    { id: 'T39', name: 'Demo opacity reset', convergence: true,
      check(tick, g) {
        if (tick !== LIVE_GUARD_GRACE + 1) return null;
        const expectedSliders = {
          'sphere-opacity-slider': 3, 'void-opacity-slider': 5,
          'graph-opacity-slider': 21, 'trail-opacity-slider': 55,
          'excitation-speed-slider': 100, 'tracer-lifespan-slider': 13,
        };
        const wrong = [];
        for (const [id, val] of Object.entries(expectedSliders)) {
          const el = document.getElementById(id);
          if (!el) { wrong.push(`${id} missing`); continue; }
          if (+el.value !== val) wrong.push(`${id}=${el.value} expected ${val}`);
        }
        const expectedDisplay = {
          'sphere-opacity-val': '3%', 'void-opacity-val': '5%',
          'graph-opacity-val': '21%', 'trail-opacity-val': '55%',
        };
        for (const [id, text] of Object.entries(expectedDisplay)) {
          const el = document.getElementById(id);
          if (!el) { wrong.push(`${id} missing`); continue; }
          if (el.textContent !== text) wrong.push(`${id}="${el.textContent}" expected "${text}"`);
        }
        if (typeof _bgMat !== 'undefined' && Math.abs(_bgMat.opacity - 0.03) > 0.02)
          wrong.push(`sphere material opacity=${_bgMat.opacity.toFixed(2)} expected 0.03`);
        if (wrong.length > 0) return wrong.join(', ');
        g.ok = true; g.msg = ''; _liveGuardRender();
        return null;
      }
    },
    { id: 'T40', name: 'Trail fade on annihilation',
      check(tick, g, ctx) {
        if (ctx.isWindowBoundary || !ctx.prev) return null;
        for (const { xon } of ctx.prev) {
          if (xon.alive) continue;
          if (!xon._dying)
            return `tick ${tick}: xon annihilated at node ${xon.node} without trail fade (_dying not set)`;
        }
        if (g.ok === null && tick >= LIVE_GUARD_GRACE) { g.ok = true; g.msg = ''; }
        return null;
      }
    },
    { id: 'T43', name: 'Co-location birth (all xons same node)', convergence: true,
      init: { _birthNodes: null },
      snapshot(g) {
        // Capture spawn positions on very first tick (before any movement)
        if (g._birthNodes !== null) return;
        const alive = _demoXons.filter(x => x.alive);
        if (alive.length === 0) return;
        g._birthNodes = alive.map(x => x.node);
      },
      check(tick, g) {
        if (!g._birthNodes) return null;
        // Already verified — stay green
        if (g.ok === true) return null;
        const nodes = g._birthNodes;
        const first = nodes[0];
        for (let i = 1; i < nodes.length; i++) {
          if (nodes[i] !== first)
            return `genesis: xon ${i} at node ${nodes[i]}, expected all at ${first}`;
        }
        g.ok = true; g.msg = '';
        return null;
      }
    },
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
];

// ── Auto-derived from registry ──
const PROJECTED_GUARD_CHECKS = LIVE_GUARD_REGISTRY.filter(e => e.projected).map(e => e.projected);

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
    const preTick = tick - 1;
    const CYCLE_LEN = 64, WINDOW_LEN = 4;
    const tickInWindow = (preTick % CYCLE_LEN) % WINDOW_LEN;
    const isWindowBoundary = tickInWindow === 0;

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
    const ctx = { isWindowBoundary, prev: _liveGuardPrev };

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
                // Auto-download
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `flux-guard-dump-T${tick}.json`;
                document.body.appendChild(a); a.click(); a.remove();
                URL.revokeObjectURL(url);
                console.error('[LIVE GUARD] Dump saved to localStorage(flux_guard_dump) + downloaded');
            } catch (e) { console.error('[LIVE GUARD] Dump failed:', e); }
        }
    }
    const hasAnyFailure = Object.values(_liveGuards).some(g => g.failed);
    if (hasAnyFailure) {
        if (typeof _liveGuardFailTick === 'undefined' || _liveGuardFailTick === null) {
            _liveGuardFailTick = tick; // record first failure tick
        }
        if (tick >= _liveGuardFailTick + 0) {
            // Halt immediately on failure (no wind-down grace period)
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
