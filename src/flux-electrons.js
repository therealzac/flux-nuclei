// flux-electrons.js — Excitation system, electron pathfinding, Big Bang
// ─── Excitation system ──────────────────────────────────────────────────────────
const ELECTRON_COLORS=[0xffee44,0x44ffcc,0xff44aa,0x44aaff,0xffaa44,0xaa44ff];
const ELECTRON_COLORS_CSS=['#ffee44','#44ffcc','#ff44aa','#44aaff','#ffaa44','#aa44ff'];
let excitations=[], electronNextId=0, placingExcitation=false;
let _deferUIUpdates = false, _uiDirty = false; // batch UI updates during tick
const ELECTRON_ALPHA=3.0, TRAIL_LENGTH=24;
let ELECTRON_STEP_MS=30;  // fastest default — tournament needs throughput

// scPairToId hoisted to early block (line ~315) to avoid TDZ in computeVoidNeighbors
function rebuildScPairLookup(){ scPairToId = new Map(); ALL_SC.forEach(s=>{ scPairToId.set(pairId(s.a, s.b), s.id); }); }

// ─── excitationInduceShortcut — with post-induction rollback ────────────────
// WHY ROLLBACK EXISTS:
//   shortcutCompatible() is a greedy one-at-a-time check. With multiple
//   excitations firing in the same interval, each new SC passes because it's
//   checked against the set at the moment it was queried. But the combined set
//   of all 7–9 simultaneous implied SCs can be overconstrained — the PBD solver
//   drifts, base edges stretch, updateStatus() detects R1 and HALTS THE SIM.
//
//   The fix: after adding the SC and running the solver, measure the actual
//   worst base-edge error. If it exceeds tolerance, roll back immediately:
//   remove the SC from all sets, revert positions, and return. This is far
//   better than letting the violation accumulate and halt the sim.
//
// DO NOT remove the rollback block. It is the only thing that prevents the
// multi-excitation overconstrained-set halt that has recurred multiple times.
// ─────────────────────────────────────────────────────────────────────────────
// ─── Excitation SC materialisation ────────────────────────────────────────────
// Takes an explicit scId. Adds to xonImpliedSet, runs solver, rolls back
// if overconstrained. Returns true on success, false on rollback.
// Preserves ownShortcut for tet completion detection.
function excitationMaterialiseSC(e, scId, isBridge){
    if(xonImpliedSet.has(scId)){ e.ownShortcut=scId; return true; }
    if(activeSet.has(scId)){ e.ownShortcut=scId; return true; }
    const prevShortcut = e.ownShortcut;
    const posBefore = pos.map(p=>[p[0],p[1],p[2]]);
    e.ownShortcut = scId;
    xonImpliedSet.add(scId);
    impliedSet.add(scId);
    impliedBy.set(scId, new Set());
    bumpState();
    const pFinal = detectImplied();
    applyPositions(pFinal);

    // Strain check
    const ROLLBACK_TOL = 5e-4, AVG_TOL = 1e-5;
    let worstErr=0, sumErr=0;
    for(const [i,j] of BASE_EDGES){
        const err=Math.abs(vd(pos[i],pos[j])-1.0);
        if(err>worstErr) worstErr=err;
        sumErr+=err;
    }
    if(worstErr>ROLLBACK_TOL || sumErr/BASE_EDGES.length>AVG_TOL){
        if(isBridge){
            // Bridge shortcut: solver may have bailed out early (slow convergence
            // with many constraints). Re-solve with no bail-out to give it a fair
            // chance — bridge shortcuts are known tet partners and should converge.
            const pairs=[];
            activeSet.forEach(id=>{ const s=SC_BY_ID[id]; pairs.push([s.a,s.b]); });
            impliedSet.forEach(id=>{ const s=SC_BY_ID[id]; pairs.push([s.a,s.b]); });
            const {p:p2, converged}=_solve(pairs, 10000, /*noBailout=*/true);
            if(converged){
                applyPositions(p2);
                worstErr=0; sumErr=0;
                for(const [i,j] of BASE_EDGES){
                    const err=Math.abs(vd(pos[i],pos[j])-1.0);
                    if(err>worstErr) worstErr=err;
                    sumErr+=err;
                }
            }
        }
        if(worstErr>ROLLBACK_TOL || sumErr/BASE_EDGES.length>AVG_TOL){
            xonImpliedSet.delete(scId);
            impliedSet.delete(scId);
            impliedBy.delete(scId);
            e.ownShortcut = prevShortcut;
            applyPositions(posBefore);
            bumpState();
            return false;
        }
    }

    // Tet completion: if prevShortcut + scId are tet partners, record zero-point
    // Quark excitations skip void-binding (confinement via rankCandidates instead)
    if(prevShortcut !== null && !e._isQuark){
        const partners = tetPartnerMap.get(prevShortcut);
        if(partners && partners.includes(scId)){
            for(const v of voidNeighborData){
                if(v.type==='tet' && v.scIds.length===2 &&
                   v.scIds.includes(prevShortcut) && v.scIds.includes(scId)){
                    e.zeroPoint = v.nbrs.reduce((acc,i)=>
                        [acc[0]+pos[i][0]/4, acc[1]+pos[i][1]/4, acc[2]+pos[i][2]/4], [0,0,0]);
                    e.voidType = 'tet';
                    e.voidScIds = [prevShortcut, scId];
                    e.voidNodes = new Set(v.nbrs);
                    break;
                }
            }
        }
    }
    if(_deferUIUpdates){
        _uiDirty = true;
    } else {
        updateVoidSpheres(); updateCandidates(); updateSpheres(); updateStatus();
    }
    return true;
}

// ─── canMaterialiseQuick: lightweight dry-run strain check ─────────────────
// Returns true iff adding scId to the constraint system passes the strain
// thresholds. Uses a SINGLE solver call (no detectImplied) and never
// leaves side effects — safe to call in lookahead.
let _cmqCallCount = 0, _cmqCpuCount = 0, _cmqCacheHits = 0, _cmqTotalMs = 0;
function canMaterialiseQuick(scId){
    _cmqCallCount++;
    if(activeSet.has(scId)||impliedSet.has(scId)||xonImpliedSet.has(scId)) return true;
    // Fast rejection: SC endpoints must be near the ideal FCC shortcut
    // length 2/sqrt(3) ≈ 1.1547 (unactivated) or already at unit length.
    const _sc=SC_BY_ID[scId];
    if(_sc && pos[_sc.a] && pos[_sc.b]){
        const _dx=pos[_sc.b][0]-pos[_sc.a][0],_dy=pos[_sc.b][1]-pos[_sc.a][1],_dz=pos[_sc.b][2]-pos[_sc.a][2];
        const _dist=Math.sqrt(_dx*_dx+_dy*_dy+_dz*_dz);
        const _SC_IDEAL=2/Math.sqrt(3); // 1.1547
        if(Math.abs(_dist-1)>0.05 && Math.abs(_dist-_SC_IDEAL)>0.10) return false;
    }
    // Check GPU batch cache first (avoids redundant CPU solve)
    if (typeof SolverProxy !== 'undefined' && SolverProxy.isReady()) {
        const cached = SolverProxy.getBatchResult(scId);
        if (cached) { _cmqCacheHits++; }
        if (cached) return cached.pass;
    }
    // Build constraint pairs with the candidate SC added (cached base pairs)
    _cmqCpuCount++;
    const _cmqT0 = performance.now();
    const basePairs = _getBasePairs();
    const sc=SC_BY_ID[scId];
    const pairs = [...basePairs, [sc.a, sc.b]];
    // 500 iters is enough for strain check (don't need full convergence)
    const {p}=_solve(pairs, 500);
    _cmqTotalMs += performance.now() - _cmqT0;
    // Don't bail on !converged — solver may not reach 1e-9 on L3+
    // but positions can still be within strain tolerance. Let strain check decide.
    const ROLLBACK_TOL=5e-4, AVG_TOL=1e-5;
    let worst=0,sum=0,edgeLenSum=0;
    for(const [i,j] of BASE_EDGES){
        const dx=p[i][0]-p[j][0],dy=p[i][1]-p[j][1],dz=p[i][2]-p[j][2];
        const d=Math.sqrt(dx*dx+dy*dy+dz*dz);
        const err=Math.abs(d-1.0);
        if(err>worst) worst=err; sum+=err;
        edgeLenSum+=d;
    }
    if(worst>ROLLBACK_TOL || sum/BASE_EDGES.length>AVG_TOL) return false;
    // Kepler density check: reject if adding this SC would push density beyond 0.01%
    const lAvg=edgeLenSum/BASE_EDGES.length;
    const idealDens=computeIdealDensity();
    const actualDens=idealDens/(lAvg*lAvg*lAvg);
    const densDev=Math.abs(actualDens*100 - idealDens*100);
    if(densDev > 0.01) return false;
    return true;
}

// ─── excitationSeverForRoom: sever a non-load-bearing implied SC ────────
// When an excitation needs to materialise a shortcut but strain is too high,
// it may try severing ONE non-load-bearing xonImplied shortcut to make
// room. Candidates are ranked by fewest excitation references (orphans first).
// The function tries each candidate in rank order: sever it, check if the
// target SC can now be materialized, and if so keep the sever. If not, undo
// and try the next. Only ONE SC is ever severed.
// "Load-bearing" means: part of a completed tet pair, part of an actualized
// oct cycle, or part of any excitation's claimed void.
// Returns true if a sever enabled the target materialization.
function excitationSeverForRoom(targetScId){
    if(!xonImpliedSet.size) return false;

    // Build protected set (same logic as strainMonitorCheck)
    const protectedSCs = new Set();
    // Protect tet pairs
    for(const scId of xonImpliedSet){
        const partners = tetPartnerMap.get(scId);
        if(partners){
            for(const pid of partners){
                if(xonImpliedSet.has(pid) || activeSet.has(pid)){
                    protectedSCs.add(scId);
                    protectedSCs.add(pid);
                }
            }
        }
    }
    // Protect complete oct cycles (real-time check, not cached flag)
    for(const v of voidNeighborData){
        if(v.type !== 'oct' || !v.cycles) continue;
        for(const cycle of v.cycles){
            const allPresent = cycle.scIds.every(id =>
                xonImpliedSet.has(id) || activeSet.has(id) || impliedSet.has(id));
            if(!allPresent) continue;
            for(const id of cycle.scIds) protectedSCs.add(id);
        }
    }
    // Protect voidScIds of all void-bound excitations
    for(const ex of excitations){
        if(ex.voidScIds){
            for(const id of ex.voidScIds) protectedSCs.add(id);
        }
    }
    // Protect oct SCs (bosonic cage must never be severed)
    for(const id of _octSCIds) protectedSCs.add(id);

    // Protect SCs currently being traversed by xons (traversal lock).
    // If a xon is on an SC or needs it for its face loop, it cannot be severed.
    if (typeof _traversalLockedSCs === 'function') {
        for (const id of _traversalLockedSCs()) protectedSCs.add(id);
    }

    // Collect severable candidates, scored by fewest excitation references
    // (prefer severing orphan shortcuts that no excitation currently owns)
    const ranked = [];
    for(const scId of xonImpliedSet){
        if(protectedSCs.has(scId)) continue;
        let refs = 0;
        for(const ex of excitations){
            if(ex.ownShortcut === scId) refs++;
        }
        ranked.push({ scId, score: refs + Math.random() * 0.5 });
    }
    if(!ranked.length) return false;
    ranked.sort((a,b) => a.score - b.score);

    // Try each candidate: sever, check if target SC can now materialize,
    // undo if not, try next. Only ONE sever is kept.
    for(const {scId: victimId} of ranked){
        // Temporarily sever
        xonImpliedSet.delete(victimId);
        impliedSet.delete(victimId);
        stateVersion++; // invalidate cache so canMaterialiseQuick sees removal

        // Check if target SC can now be materialized
        if(canMaterialiseQuick(targetScId)){
            // Success — finalize the sever
            impliedBy.delete(victimId);
            for(const ex of excitations){
                if(ex.ownShortcut === victimId) ex.ownShortcut = null;
                if(ex.voidScIds && ex.voidScIds.includes(victimId)){
                    ex.zeroPoint = null; ex.voidType = null;
                    ex.voidScIds = null; ex.voidNodes = null;
                }
            }
            bumpState();
            return true;
        }

        // Undo — this sever didn't help
        xonImpliedSet.add(victimId);
        impliedSet.add(victimId);
        stateVersion++; // invalidate cache after undo
    }
    return false;
}

// ══════════════════════════════════════════════════════════════════════════
// DO NOT DELETE — EXCITATION MOVEMENT RULES (comprehensive reference)
// ══════════════════════════════════════════════════════════════════════════
//
// An excitation is a sparkle that hops between lattice nodes. Its movement
// obeys a strict hierarchy that determines how it travels and what actions
// it may take at each step.
//
// ── PRIMARY MOVEMENT: BASE-DIRECTION 2-HOP TRAVERSAL ────────────────────
//
// The preferred, highest-priority way for an excitation to move is along
// TWO consecutive base-direction edges: node → mid → far. This 2-hop
// traversal REQUIRES the shortcut (node ↔ far) to exist. The excitation
// may CREATE this shortcut if it doesn't already exist — this is the
// preferred, canonical way excitations travel and build structure.
//
// If the shortcut cannot be materialized (solver strain too high), the
// excitation may SEVER a non-load-bearing implied shortcut elsewhere in
// the lattice to relieve strain, then retry. "Load-bearing" means:
//   • Part of a completed tet void (both tet-pair SCs present)
//   • Part of an actualized oct cycle (all cycle SCs present)
//   • Part of any excitation's claimed void (voidScIds)
//
// All base-direction candidates are ranked by ZERO-SUM BALANCE: the
// excitation tracks how many times it has used each of the 4 base
// directions (dirCounts), and prefers the least-used pair (d1, d2).
// This balance constraint causes the walk to converge to a closed cycle,
// naturally producing the 4-step tetrahedral fermion loop.
//
// OVERLAPPING TRAVERSAL: A continuous path w → x → y → z implies TWO
// shortcuts: w–y AND x–z. When the excitation moves node → mid → far,
// the overlapping shortcut lastMid–mid is also materialized if possible.
//
// ── VOID STICKING ───────────────────────────────────────────────────────
//
// Once an excitation claims a void (tet or oct cycle), it restricts its
// candidates to only those whose mid AND far nodes are within voidNodes.
// The excitation traces the boundary of its void shape and never strays.
//
// ── VOID DETECTION ──────────────────────────────────────────────────────
//
// After each successful base traversal, the excitation proactively checks
// whether its current node, mid, or far is part of a complete void:
//   Priority 1: Tetrahedral void (fermion, max 1 excitation per tet)
//   Priority 2: Octahedral cycle (boson, up to 8 excitations per cycle)
// An oct excitation needs only a single square cycle (4 nodes) of the
// full octahedron — not all 3 cycles.
//
// ── FALLBACK: SHORTCUT-DIRECTION TRAVEL ─────────────────────────────────
//
// If NO base-direction 2-hop traversal is possible (all candidates fail
// even after attempting sever-for-room), the excitation falls back to
// traveling directly along a shortcut edge (single hop, shortcut
// direction rather than base direction):
//   1. Prefer existing open shortcuts from the current node
//   2. Last resort: materialize a new shortcut and travel along it
//      (with sever-for-room if strain blocks materialization)
//
// ── STUCK / DISSOLUTION ─────────────────────────────────────────────────
//
// If neither base-direction nor shortcut-direction movement is possible,
// the excitation increments stuckTicks. Seeking excitations (no void
// claimed) are subject to stochastic decay: each step has probability
// 1/avgLifespan of dissolving (radioactive-decay model). Stuck
// excitations decay 4x faster. Void-bound excitations are immortal —
// they only dissolve via dedup (tet=1, oct cycle=8 max).
//
// ── DEGENERATE LOOP DETECTION ─────────────────────────────────────────────
//
// A seeking excitation whose trail (last 24 nodes) visits fewer than
// 4 unique nodes after 12+ steps is stuck in a degenerate cycle (e.g.
// a 3-node equilateral triangle). Both tet and oct voids require at
// least 4 distinct nodes, so such a loop can never converge to a valid
// void. These excitations are dissolved immediately.
//
// ── SEVERANCE HEURISTICS (excitationSeverForRoom) ───────────────────────
//
// When materialization fails due to lattice strain, the excitation may
// sever exactly ONE non-load-bearing implied shortcut to make room.
// The algorithm:
//   1. Build a protected set (tet pairs, actualized oct cycles, voidScIds)
//   2. Rank severable candidates by fewest excitation references (orphan
//      shortcuts first — those not owned by any excitation)
//   3. Try each in rank order: temporarily sever it, check if the target
//      SC can now be materialized (canMaterialiseQuick). If yes, finalize
//      the sever and return success. If no, undo and try the next.
//   4. At most ONE shortcut is ever severed per attempt. If no single
//      sever enables the target, the excitation is simply stuck.
//
// ── RULE ARENA MODE ─────────────────────────────────────────────────────
//
// In arena mode, candidate ranking is driven by pluggable rules from
// RULE_REGISTRY[activeRuleIndex]. Each rule's rankCandidates() sets a
// .score property on candidates; highest score wins (ties shuffled).
//
// The arena framework tests rules headlessly, measuring TEMPORAL
// K-complexity — LZ76 on the concatenated sequence of state strings
// over time. This captures how much new information each state change
// adds to the "3D movie" of lattice events.
//
// Built-in rules: 'classic' (zero-sum direction balance, index 0),
// 'adam' (genome-weighted features). New rules are added to
// RULE_REGISTRY by Claude across conversations.
//
// ── MAINTAINER NOTE ─────────────────────────────────────────────────────
//
// When excitation movement rules change, UPDATE THIS COMMENT BLOCK to
// keep it as the single source of truth. Do not let the code and this
// comment diverge.
//
// ══════════════════════════════════════════════════════════════════════════
//
// canMaterialise: when false, excitation only walks on already-open
// shortcuts (no solver calls). Used to keep ticks fast at L2+ with many
// excitations — only a few per tick get to materialise.
function excitationStep(e, canMaterialise){
    // ── Phase 2: complete pending traversal (second base step) ────────
    if(e.travelDest !== null){
        e.trail.push(e.node); if(e.trail.length>TRAIL_LENGTH) e.trail.shift();
        e.prevNode = e.node;
        e.node = e.travelDest;
        e.travelDest = null;
        e.tweenT = 0; e.flashT = 1.0;
        return;
    }

    // ── Phase 1: build candidate direction pairs, ranked by balance ──
    // Base-direction 2-hop traversal WITH materialization is the preferred
    // primary movement. If shortcut isn't open, the excitation creates it.
    const allOpen = getAllOpen();
    const candidates = [];
    for(let d1=0; d1<4; d1++){
        const mid = basePosNeighbor[e.node]?.[d1];
        if(mid === undefined) continue;
        for(let d2=0; d2<4; d2++){
            if(d2 === d1) continue;
            const far = basePosNeighbor[mid]?.[d2];
            if(far === undefined) continue;
            const scId = scPairToId.get(pairId(e.node, far));
            if(scId === undefined) continue;
            candidates.push({d1, d2, mid, far, scId,
                priority: e.dirCounts[d1] + e.dirCounts[d2]});
        }
    }

    // Void-sticking: once excitation has claimed a void (tet or oct),
    // strictly stay on void nodes. Both mid AND far must be in voidNodes
    // so the excitation never strays off its shape.
    if(e.voidNodes && candidates.length){
        const voidLocal = candidates.filter(c =>
            e.voidNodes.has(c.mid) && e.voidNodes.has(c.far));
        if(voidLocal.length){
            candidates.length = 0;
            candidates.push(...voidLocal);
        }
    }

    // ── Rank candidates using active rule (if it provides rankCandidates) ──
    const rule = getActiveRule();
    if(rule && rule.rankCandidates){
        const needsK = activeRuleIndex > 0 && canMaterialise;
        const { stateStr: kStr, baseline: kBase } = needsK
            ? getKStateAndBaseline() : { stateStr: '', baseline: 0 };
        const ruleCtx = {
            allOpen, kStr, kBase, pos, ALL_SC,
            frameCount: _temporalFrames.length, temporalK: _temporalKValue,
            avgHamming: _avgHamming, stuckTicks: _stuckTickCount,
            isFallback: false,
            quarks: (typeof NucleusSimulator !== 'undefined') ? NucleusSimulator.quarkExcitations : [],
            basePosNeighbor: basePosNeighbor,
        };
        rule.rankCandidates(candidates, e, ruleCtx);
    } else {
        // No rankCandidates: random movement (excitation dynamics driven by tick())
        for(const c of candidates) c.score = Math.random();
    }
    candidates.sort((a, b) => b.score - a.score);
    // Shuffle within top-score tier (epsilon tolerance for floats)
    if(candidates.length){
        const topScore = candidates[0].score;
        let shuffleEnd = candidates.findIndex(c => topScore - c.score > 0.01);
        if(shuffleEnd < 0) shuffleEnd = candidates.length;
        for(let i = shuffleEnd - 1; i > 0; i--){
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
    }

    // ── Try each candidate: materialise shortcut if not already open ──
    for(const {d1, d2, mid, far, scId} of candidates){
        // If shortcut isn't open, try to materialise it (preferred primary movement).
        // If strain is too high, sever a non-load-bearing implied SC to make room.
        if(!allOpen.has(scId)){
            if(!canMaterialise) continue;
            if(!canMaterialiseQuick(scId)){
                // Try severing a non-load-bearing SC to make room for this one
                if(!excitationSeverForRoom(scId)) continue;
            }
            if(!excitationMaterialiseSC(e, scId)) continue;
        } else {
            e.ownShortcut = scId;
        }

        // Overlapping traversal shortcut: the continuous base-edge path
        // lastMid → node → mid implies a shortcut lastMid–mid.
        // (path w→x→y→z implies both w-y and x-z)
        if(e.lastMid !== null && canMaterialise){
            const overlapScId = scPairToId.get(pairId(e.lastMid, mid));
            if(overlapScId !== undefined && !allOpen.has(overlapScId)){
                if(canMaterialiseQuick(overlapScId)){
                    const savedOwn = e.ownShortcut;
                    excitationMaterialiseSC(e, overlapScId, /*isBridge=*/true);
                    e.ownShortcut = savedOwn;
                }
            }
        }

        // Proactive tet detection: check if the excitation's current node,
        // mid node, or far node is part of a COMPLETE tet void (both scIds open).
        // This handles tets whose two shortcuts don't share endpoints —
        // the excitation just needs to VISIT any node of the tet.
        // Quark excitations skip void-binding — their confinement is handled
        // by nucleus-sustain rankCandidates, not by zeroPoint sticking.
        if(e.zeroPoint === null && !e._isQuark){
            for(const checkNode of [e.node, mid, far]){
                const tetVoids = _nodeTetVoids.get(checkNode);
                if(!tetVoids) continue;
                for(const tv of tetVoids){
                    if(tv.scIds.every(id => allOpen.has(id))){
                        e.zeroPoint = tv.nbrs.reduce((acc,i)=>
                            [acc[0]+pos[i][0]/4, acc[1]+pos[i][1]/4, acc[2]+pos[i][2]/4], [0,0,0]);
                        e.voidType = 'tet';
                        e.voidScIds = [...tv.scIds];
                        e.voidNodes = new Set(tv.nbrs);
                        break;
                    }
                }
                if(e.zeroPoint !== null) break;
            }
        }

        // Priority 2: oct void CYCLES (boson — up to 8 per void)
        // An excitation can survive on a single square cycle (4-node loop)
        // of an oct void — it doesn't need the full octahedron to be complete.
        // The cycle must be a geometric square (per-cycle actualized flag).
        if(e.zeroPoint === null && !e._isQuark){
            for(const checkNode of [e.node, mid, far]){
                const octVoids = _nodeOctVoids.get(checkNode);
                if(!octVoids) continue;
                for(const ov of octVoids){
                    if(!ov.cycles) continue;
                    for(const cycle of ov.cycles){
                        if(!cycle.actualized) continue;
                        // Check that this node is actually part of this cycle
                        if(!cycle.verts.includes(checkNode)) continue;
                        const nv = cycle.verts.length;
                        let cx=0,cy=0,cz=0;
                        for(const n of cycle.verts){ cx+=pos[n][0]; cy+=pos[n][1]; cz+=pos[n][2]; }
                        e.zeroPoint = [cx/nv, cy/nv, cz/nv];
                        e.voidType = 'oct';
                        e.voidScIds = [...cycle.scIds];
                        e.voidNodes = new Set(cycle.verts);
                        break;
                    }
                    if(e.zeroPoint !== null) break;
                }
                if(e.zeroPoint !== null) break;
            }
        }

        // Bridge + tet partner materialization only when allowed
        if(canMaterialise){
            if(e.lastMid !== null && e.lastMid !== mid){
                const bridgeScId = scPairToId.get(pairId(e.lastMid, mid));
                if(bridgeScId !== undefined && !allOpen.has(bridgeScId)){
                    excitationMaterialiseSC(e, bridgeScId, /*isBridge=*/true);
                }
            }
            if(e.ownShortcut !== null){
                const tetPartners = tetPartnerMap.get(e.ownShortcut);
                if(tetPartners){
                    const savedOwn = e.ownShortcut;
                    for(const pid of tetPartners){
                        if(!xonImpliedSet.has(pid) && !activeSet.has(pid)){
                            if(canMaterialiseQuick(pid)){
                                excitationMaterialiseSC(e, pid, /*isBridge=*/true);
                                e.ownShortcut = savedOwn;
                            }
                        }
                    }
                }
            }
        }
        e.lastMid = mid;

        // Update direction counts
        e.dirCounts[d1]++;
        e.dirCounts[d2]++;

        // Take first base step
        e.stuckTicks = 0;
        e.trail.push(e.node); if(e.trail.length>TRAIL_LENGTH) e.trail.shift();
        e.prevNode = e.node;
        e.node = mid;
        e.travelDest = far;
        e.tweenT = 0; e.flashT = 1.0;
        return;
    }

    // ── All base-direction candidates failed → shortcut-direction fallback ──
    // Prefer existing open shortcuts; materialize new ones as a last resort.
    // 1. Try existing open shortcuts
    const scFallback = [];
    for(const sc of scByVert[e.node]){
        if(!allOpen.has(sc.id)) continue;
        const dest = sc.a === e.node ? sc.b : sc.a;
        if(dest === e.prevNode) continue;
        scFallback.push({scId: sc.id, dest});
    }
    if(scFallback.length){
        // Rank fallback using active rule (if available)
        if(rule && rule.rankCandidates){
            const fbCtx = { ...ruleCtx, isFallback: true };
            rule.rankCandidates(scFallback, e, fbCtx);
        } else {
            for(const c of scFallback) c.score = Math.random();
        }
        scFallback.sort((a, b) => b.score - a.score);
        const pick = scFallback[0];
        e.ownShortcut = pick.scId;
        e.stuckTicks = 0;
        e.trail.push(e.node); if(e.trail.length>TRAIL_LENGTH) e.trail.shift();
        e.prevNode = e.node;
        e.node = pick.dest;
        e.tweenT = 0; e.flashT = 1.0;
        return;
    }
    // 2. Last resort: materialize a new shortcut and travel on it
    if(canMaterialise){
        const scNew = [];
        for(const sc of scByVert[e.node]){
            if(allOpen.has(sc.id)) continue;
            const dest = sc.a === e.node ? sc.b : sc.a;
            if(dest === e.prevNode) continue;
            scNew.push({sc, dest});
        }
        // Rank last-resort candidates using active rule (add scId for feature extraction)
        for(const item of scNew) item.scId = item.sc.id;
        if(rule && rule.rankCandidates){
            const lrCtx = { ...ruleCtx, isFallback: true };
            rule.rankCandidates(scNew, e, lrCtx);
        } else {
            for(const c of scNew) c.score = Math.random();
        }
        scNew.sort((a, b) => b.score - a.score);
        for(const {sc, dest} of scNew){
            if(!canMaterialiseQuick(sc.id)){
                if(!excitationSeverForRoom(sc.id)) continue;
            }
            if(!excitationMaterialiseSC(e, sc.id)) continue;
            e.ownShortcut = sc.id;
            e.stuckTicks = 0;
            e.trail.push(e.node); if(e.trail.length>TRAIL_LENGTH) e.trail.shift();
            e.prevNode = e.node;
            e.node = dest;
            e.tweenT = 0; e.flashT = 1.0;
            return;
        }
    }
    e.stuckTicks++;
}

function createExcitation(nodeIdx){
    // Verify at least one shortcut traversal is possible from this node
    let hasPath = false;
    for(let d1=0; d1<4 && !hasPath; d1++){
        const mid = basePosNeighbor[nodeIdx]?.[d1];
        if(mid === undefined) continue;
        for(let d2=0; d2<4; d2++){
            if(d2===d1) continue;
            if(basePosNeighbor[mid]?.[d2] !== undefined){ hasPath=true; break; }
        }
    }
    if(!hasPath){
        setStatus('\u26a0 no valid excitation path from this node');
        return null;
    }

    const id=electronNextId++; const colIdx=id%ELECTRON_COLORS.length; const col=ELECTRON_COLORS[colIdx];
    // Spark sprite — sparkle point that travels along base edges
    const sparkMat=new THREE.SpriteMaterial({color:col,map:_sparkTex,transparent:true,opacity:1.0,
        blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false});
    const spark=new THREE.Sprite(sparkMat); spark.scale.set(0.28,0.28,1); spark.renderOrder=22;
    const group=new THREE.Group(); group.add(spark);
    group.position.set(...pos[nodeIdx]); scene.add(group);
    const trailGeo=new THREE.BufferGeometry();
    const trailPos=new Float32Array(TRAIL_LENGTH*3); const trailCol=new Float32Array(TRAIL_LENGTH*3);
    trailGeo.setAttribute('position',new THREE.BufferAttribute(trailPos,3));
    trailGeo.setAttribute('color',new THREE.BufferAttribute(trailCol,3));
    const trailMat=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:1.0,depthTest:false,blending:THREE.AdditiveBlending});
    const trailLine=new THREE.Line(trailGeo,trailMat); trailLine.renderOrder=20; scene.add(trailLine);
    const e={id,node:nodeIdx,prevNode:nodeIdx,travelDest:null,stuckTicks:0,
        dirCounts:[0,0,0,0],lastMid:null,sameSCSteps:0,totalSteps:0,
        trail:[],tweenT:1,flashT:0,ownShortcut:null,zeroPoint:null,
        voidType:null,voidScIds:null,voidNodes:null,
        group,spark,sparkMat,trailLine,trailGeo,trailPos,trailCol,colorIdx:colIdx,col};
    excitations.push(e);
    startExcitationClock();
    selectedVert=-1; hoveredVert=-1;
    updateCandidates(); updateSpheres();
    updateExcitationSidebar();
    return e;
}

// V2: Color-parameterized excitation creator (used by NucleusSimulator)
function _createExcitation(nodeIdx, customColor){
    let hasPath = false;
    for(let d1=0; d1<4 && !hasPath; d1++){
        const mid = basePosNeighbor[nodeIdx]?.[d1];
        if(mid === undefined) continue;
        for(let d2=0; d2<4; d2++){
            if(d2===d1) continue;
            if(basePosNeighbor[mid]?.[d2] !== undefined){ hasPath=true; break; }
        }
    }
    if(!hasPath) return null;
    const id=electronNextId++;
    const col = customColor || ELECTRON_COLORS[id % ELECTRON_COLORS.length];
    const sparkMat=new THREE.SpriteMaterial({color:col,map:_sparkTex,transparent:true,opacity:1.0,
        blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false});
    const spark=new THREE.Sprite(sparkMat); spark.scale.set(0.28,0.28,1); spark.renderOrder=22;
    const group=new THREE.Group(); group.add(spark);
    group.position.set(...pos[nodeIdx]); scene.add(group);
    const trailGeo=new THREE.BufferGeometry();
    const trailPos=new Float32Array(TRAIL_LENGTH*3); const trailCol=new Float32Array(TRAIL_LENGTH*3);
    trailGeo.setAttribute('position',new THREE.BufferAttribute(trailPos,3));
    trailGeo.setAttribute('color',new THREE.BufferAttribute(trailCol,3));
    const trailMat=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:1.0,depthTest:false,blending:THREE.AdditiveBlending});
    const trailLine=new THREE.Line(trailGeo,trailMat); trailLine.renderOrder=20; scene.add(trailLine);
    const e={id,node:nodeIdx,prevNode:nodeIdx,travelDest:null,stuckTicks:0,
        dirCounts:[0,0,0,0],lastMid:null,sameSCSteps:0,totalSteps:0,
        trail:[],tweenT:1,flashT:0,ownShortcut:null,zeroPoint:null,
        voidType:null,voidScIds:null,voidNodes:null,
        group,spark,sparkMat,trailLine,trailGeo,trailPos,trailCol,colorIdx:0,col};
    excitations.push(e);
    return e;
}

let _batchRemoveMode = false; // when true, skip per-removal sidebar rebuilds
function removeExcitation(id){
    const idx=excitations.findIndex(e=>e.id===id); if(idx<0) return;
    const e=excitations[idx];
    if(!e._headless){
        scene.remove(e.group); e.sparkMat.dispose();
        scene.remove(e.trailLine); e.trailGeo.dispose();
    }
    excitations.splice(idx,1);
    if(!excitations.length && !bigBangActive) stopExcitationClock();
    if(!_batchRemoveMode && !_deferUIUpdates) updateExcitationSidebar();
}
function removeAllExcitations(){
    _batchRemoveMode=true;
    [...excitations].forEach(e=>removeExcitation(e.id));
    _batchRemoveMode=false;
    // Electron-implied SCs are real structure — keep them unless they cause
    // strain violations. The old behavior of wiping all electron-implied SCs
    // on clear was too aggressive (shortcuts visibly vanished).
    if(xonImpliedSet.size){
        // Check for actual strain before clearing anything
        const TOL = 1e-3;
        let hasStrain = false;
        for(const [i,j] of BASE_EDGES){
            if(Math.abs(vd(pos[i],pos[j])-1.0) > TOL){ hasStrain = true; break; }
        }
        if(hasStrain){
            // Only clear if strain exists — soft recovery
            for(const id of [...xonImpliedSet]){
                xonImpliedSet.delete(id);
                impliedSet.delete(id);
                impliedBy.delete(id);
            }
            bumpState();
            const pFinal = detectImplied();
            applyPositions(pFinal);
            toast('strain reset: cleared electron-implied SCs');
        }
    }
    updateExcitationSidebar(); excitationPaused=false; syncExcitationPlayBtn();
}

// ─── Big Bang: batch-create excitations at every node ─────────────────────
// Performance: skips per-excitation UI updates (rebuildScPairLookup,
// updateCandidates, updateSpheres, updateExcitationSidebar) and does
// them once at the end. Critical for L2+ lattices (100+ nodes).
function _doBigBang(){
    removeAllExcitations();
    // Survivors (excitations with claimed voids) get 2× energy on re-bang
    rebuildScPairLookup();
    for(let i = 0; i < N; i++){
        let hasPath = false;
        for(let d1=0; d1<4 && !hasPath; d1++){
            const mid = basePosNeighbor[i]?.[d1];
            if(mid === undefined) continue;
            for(let d2=0; d2<4; d2++){
                if(d2===d1) continue;
                if(basePosNeighbor[mid]?.[d2] !== undefined){ hasPath=true; break; }
            }
        }
        if(!hasPath) continue;
        const id=electronNextId++; const colIdx=id%ELECTRON_COLORS.length; const col=ELECTRON_COLORS[colIdx];
        const sparkMat=new THREE.SpriteMaterial({color:col,map:_sparkTex,transparent:true,opacity:1.0,
            blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false});
        const spark=new THREE.Sprite(sparkMat); spark.scale.set(0.28,0.28,1); spark.renderOrder=22;
        const group=new THREE.Group(); group.add(spark);
        group.position.set(...pos[i]); scene.add(group);
        const trailGeo=new THREE.BufferGeometry();
        const trailPos=new Float32Array(TRAIL_LENGTH*3); const trailCol=new Float32Array(TRAIL_LENGTH*3);
        trailGeo.setAttribute('position',new THREE.BufferAttribute(trailPos,3));
        trailGeo.setAttribute('color',new THREE.BufferAttribute(trailCol,3));
        const trailMat=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:1.0,depthTest:false,blending:THREE.AdditiveBlending});
        const trailLine=new THREE.Line(trailGeo,trailMat); trailLine.renderOrder=20; scene.add(trailLine);
        excitations.push({id,node:i,prevNode:i,travelDest:null,stuckTicks:0,
            dirCounts:[0,0,0,0],lastMid:null,sameSCSteps:0,totalSteps:0,
            trail:[],tweenT:1,flashT:0,ownShortcut:null,zeroPoint:null,
            voidType:null,voidScIds:null,voidNodes:null,
            group,spark,sparkMat,trailLine,trailGeo,trailPos,trailCol,colorIdx:colIdx,col});
    }
    selectedVert=-1; hoveredVert=-1;
    updateCandidates(); updateSpheres();
    updateExcitationSidebar();
    startExcitationClock();
}

// ─── Big Bang toggle mode ────────────────────────────────────────────────
// When active, monitors for stale states and re-bangs automatically:
//   - Empty lattice (all excitations dissolved) → instant re-bang
//   - All survivors settled (everyone has a void) with no activity
//     (no dissolutions) for staleTicks → re-bang with 2× energy for survivors
let bigBangActive = false;
let _bbStaleCounter = 0;
let _bbLastExcCount = 0;
const BB_STALE_TICKS = 40; // ticks of no change before re-bang

function toggleBigBang(){
    bigBangActive = !bigBangActive;
    _syncBigBangBtn();
    if(bigBangActive){
        _bbStaleCounter = 0;
        _bbLastExcCount = 0;
        _doBigBang();
    }
}

// Deactivate big bang without toggling — called when user modifies graph
function deactivateBigBang(){
    if(!bigBangActive) return;
    bigBangActive = false;
    _syncBigBangBtn();
}

function _syncBigBangBtn(){
    const btn = document.getElementById('btn-big-bang');
    btn.classList.toggle('active', bigBangActive);
    btn.textContent = bigBangActive ? 'stop rebang ▾' : 'big bang ▾';
}

function bigBangStaleCheck(){
    if(!bigBangActive) return;
    // Empty lattice → instant re-bang
    if(!excitations.length){
        _bbStaleCounter = 0;
        _bbLastExcCount = 0;
        _doBigBang();
        return;
    }
    // Check if population changed (dissolution activity)
    if(excitations.length !== _bbLastExcCount){
        _bbLastExcCount = excitations.length;
        _bbStaleCounter = 0;
        return;
    }
    // All survivors have claimed voids — check if stable
    const allSettled = excitations.every(e => e.zeroPoint !== null);
    if(!allSettled){
        _bbStaleCounter = 0;
        return;
    }
    // Settled and no population change — count stale ticks
    _bbStaleCounter++;
    if(_bbStaleCounter >= BB_STALE_TICKS){
        _bbStaleCounter = 0;
        _bbLastExcCount = 0;
        _doBigBang();
    }
}

let excitationClockTimer=null, excitationClockCursor=0, excitationPaused=false;
let _strainCheckCounter = 0;

// ─── Background strain monitor ────────────────────────────────────────────
// WHY THIS EXISTS:
//   The per-induction rollback (in excitationInduceShortcut) checks whether
//   adding a SINGLE new SC pushes avgEdge error over a threshold. But each
//   SC contributes only ~0.15–0.5 ppm individually, so all pass. With 20
//   simultaneous electron-implied SCs the cumulative drift reaches 17+ ppm
//   (density 74.0442%) because no individual induction ever trips the rollback.
//
//   Fix: every STRAIN_CHECK_INTERVAL ticks, measure the actual running avgErr
//   across all base edges. If it exceeds STRAIN_EVICT_TOL (3 ppm), find the
//   single electron-implied SC whose removal most reduces avgErr and evict it.
//   The owning excitation loses ownShortcut and keeps walking — no freeze.
//
//   1 ppm threshold keeps actual strain negligible. Density is always
//   displayed as Kepler max (74.0480%) — solver noise is not physics.
//
// DO NOT remove this monitor. Without it cumulative drift from many concurrent
// SCs is undetectable by per-induction checks and causes underdensity readings.
// ─────────────────────────────────────────────────────────────────────────────
const STRAIN_CHECK_INTERVAL = 8;  // check every N ticks (not every tick — perf)
const STRAIN_EVICT_TOL = 1e-6;    // 1 ppm avgErr threshold

function strainMonitorCheck(){
    if(!xonImpliedSet.size) return;

    // Check strain level
    let sumErr=0;
    for(const [i,j] of BASE_EDGES) sumErr+=Math.abs(vd(pos[i],pos[j])-1.0);
    const avgErr = sumErr / BASE_EDGES.length;
    if(avgErr <= STRAIN_EVICT_TOL) return;

    // Build set of protected SCs — shortcuts whose tet partner is ALSO in
    // xonImpliedSet form a completed tet void and must not be evicted.
    const protectedSCs = new Set();
    for(const scId of xonImpliedSet){
        const partners = tetPartnerMap.get(scId);
        if(partners){
            for(const pid of partners){
                if(xonImpliedSet.has(pid)){
                    protectedSCs.add(scId);
                    protectedSCs.add(pid);
                }
            }
        }
    }

    // Protect oct void members: protect SCs of any complete cycle.
    // Computed in real-time (not from cached cycle.actualized) to avoid
    // stale flags when updateVoidSpheres is deferred during excitation ticks.
    for(const v of voidNeighborData){
        if(v.type !== 'oct' || !v.cycles) continue;
        for(const cycle of v.cycles){
            const allPresent = cycle.scIds.every(id =>
                xonImpliedSet.has(id) || activeSet.has(id) || impliedSet.has(id));
            if(!allPresent) continue;
            for(const id of cycle.scIds) protectedSCs.add(id);
        }
    }

    // Find the SC whose removal most reduces avgErr (try removing each one).
    // Evict at most 1 per tick — the monitor runs every STRAIN_CHECK_INTERVAL
    // ticks, so high strain converges over a few intervals without frame freezes.
    let bestId=null, bestAvg=avgErr;
    for(const scId of xonImpliedSet){
        if(protectedSCs.has(scId)) continue; // don't evict tet pair members
        const sc=SC_BY_ID[scId];
        // Test: remove this SC and re-solve
        const testPairs=[...[...activeSet,...xonImpliedSet]
            .filter(id=>id!==scId)
            .map(id=>{ const s=SC_BY_ID[id]; return [s.a,s.b]; })];
        const {p:tp, converged} = _solve(testPairs);
        if(!converged) continue;
        let ts=0;
        for(const [i,j] of BASE_EDGES){
            const dx=tp[i][0]-tp[j][0],dy=tp[i][1]-tp[j][1],dz=tp[i][2]-tp[j][2];
            ts+=Math.abs(Math.sqrt(dx*dx+dy*dy+dz*dz)-1.0);
        }
        const ta=ts/BASE_EDGES.length;
        if(ta<bestAvg){ bestAvg=ta; bestId=scId; }
    }
    if(bestId===null) return; // all remaining SCs are protected

    // Evict the worst SC
    xonImpliedSet.delete(bestId);
    impliedSet.delete(bestId);
    impliedBy.delete(bestId);
    // Clear ownShortcut on any excitation that owned it
    for(const e of excitations){
        if(e.ownShortcut===bestId){ e.ownShortcut=null; e.zeroPoint=null; e.voidType=null; e.voidScIds=null; e.voidNodes=null; }
    }
    const evicted = true;

    if(!evicted) return;
    bumpState();
    const pFinal=detectImplied();
    applyPositions(pFinal);
    updateVoidSpheres(); updateCandidates(); updateSpheres(); updateStatus();
    return true;
}

// ─── excitationClockTick: batched stepping + stochastic pruning ────────
// Steps up to BATCH_SIZE excitations per tick (round-robin). This avoids
// hanging the browser at L2+ (107 nodes × solver calls = too slow for 1 tick).
// Pruning rules checked on ALL excitations every tick:
//   1. Degenerate loop: trail visits <4 unique nodes after 12+ steps → dissolve
//   2. Seeking (no void): stochastic decay with avg lifespan from energy slider
//   3. Stuck: stochastic decay with shorter avg lifespan (1/4 of seeking)
//   4. Dedup: multiple excitations on same tet → keep only first
// Excitations that have claimed a void (tet/oct) are IMMORTAL — no decay.
// Per-tick budget: up to MAT_BUDGET excitations may call the solver,
// the rest walk on existing open shortcuts (O(1) per step).
// WALK_BATCH controls how many walkers step per tick for throughput.
const MAT_BUDGET = 2;
const WALK_BATCH = 20;
function excitationClockTick(){
    if(!excitations.length||simHalted) return;

    // Defer UI updates during the entire tick — flush once at the end
    _deferUIUpdates = true;
    _uiDirty = false;

    // ── RULE tick() HOOK ──────────────────────────────────────────
    // If the active rule implements tick(), it gets FULL CONTROL over
    // the lattice state BEFORE excitation movement.  This is the
    // expanded rule interface — rules can directly open/close SCs,
    // spawn/kill excitations, and manipulate anything except the
    // base geometry and rendering pipeline.
    //
    // tick() receives a context with:
    //   - Direct references: activeSet, impliedSet, ALL_SC, pos, etc.
    //   - Helper functions: openSC(), closeSC(), toggleSC()
    //   - Metrics: temporalK, avgHamming, stuckTicks
    //   - Control flag: skipExcitations (set true to skip standard movement)
    //
    // Rules with tick() get first crack at state, then excitations run
    // (unless skipExcitations is set). GAUGE always runs after.
    const activeRule = getActiveRule();
    let skipExcitations = false;
    {
        // ── DENSITY SAFEGUARDS (fundamental layer) ──
        const DENSITY_MAX = 0.65;
        const DENSITY_MIN = 0.02;
        const maxOpen = Math.floor(ALL_SC.length * DENSITY_MAX);
        const minOpen = Math.ceil(ALL_SC.length * DENSITY_MIN);

        let _tickChanges = 0;

        // Combined allOpen set for models that check if an SC is active/implied
        const _allOpenTick = new Set([...activeSet, ...impliedSet, ...xonImpliedSet]);

        const tickCtx = {
            // ── Direct state references (read-only recommended) ──
            activeSet,
            impliedSet,
            xonImpliedSet,
            excitations,
            ALL_SC,
            pos,
            REST,
            N,                        // number of nodes
            voidTypes,                // 'tetrahedral'|'octahedral' per node
            stateVersion,
            allOpen: _allOpenTick,    // combined active+implied set

            // ── Nucleus model data ──
            quarks: (typeof NucleusSimulator !== 'undefined') ? NucleusSimulator.quarkExcitations : [],
            createVirtualPair: (typeof NucleusSimulator !== 'undefined') ? NucleusSimulator.buildSetupCtx().createVirtualPair : function(){ return [null,null]; },
            nodeTetVoids: _nodeTetVoids,
            nodeOctVoids: _nodeOctVoids,
            voidData: voidNeighborData,
            basePosNeighbor: basePosNeighbor,

            // ── Metrics ──
            temporalK: _temporalKValue,
            avgHamming: _avgHamming,
            hammingDistance: _hammingDistance,
            stuckTicks: _stuckTickCount,
            frameCount: _temporalFrames.length,
            density: activeSet.size / ALL_SC.length, // current active density

            // ── Helpers: safe SC manipulation with density guards ──
            // These enforce density limits to prevent lattice crash.
            openSC(scId){
                if(activeSet.has(scId)) return false;
                if(activeSet.size >= maxOpen) return false; // density cap
                if(_tickChanges >= MAX_TICK_CHANGES) return false; // throttle
                activeSet.add(scId);
                _tickChanges++;
                bumpState();
                return true;
            },
            closeSC(scId){
                if(!activeSet.has(scId)) return false;
                if(activeSet.size <= minOpen) return false; // density floor
                if(_tickChanges >= MAX_TICK_CHANGES) return false; // throttle
                activeSet.delete(scId);
                _tickChanges++;
                bumpState();
                return true;
            },
            toggleSC(scId){
                if(_tickChanges >= MAX_TICK_CHANGES) return false; // throttle
                if(activeSet.has(scId)){
                    if(activeSet.size <= minOpen) return false;
                    activeSet.delete(scId);
                } else {
                    if(activeSet.size >= maxOpen) return false;
                    activeSet.add(scId);
                }
                _tickChanges++;
                bumpState();
                return true;
            },
            isOpen(scId){ return activeSet.has(scId) || impliedSet.has(scId); },
            isActive(scId){ return activeSet.has(scId); },
            get changesRemaining(){ return MAX_TICK_CHANGES - _tickChanges; },
            maxChanges: MAX_TICK_CHANGES,

            // ── Physics update (call after bulk SC changes) ──
            applyPhysics(){
                const pFinal = detectImplied();
                applyPositions(pFinal);
                _tickChanges = 0; // prevent double-solve in auto-apply
            },

            // ── Control flags ──
            skipExcitations: false,

            // ── Animation annotations ──
            // Rules use these to visually show what they're doing.
            // Colors are 0xRRGGBB hex values.
            // Animation quality is a tournament criterion.
            annotate: {
                /** Set custom color for a shortcut line. */
                scColor(scId, hexColor){
                    _ruleAnnotations.scColors.set(scId, hexColor);
                    _ruleAnnotations.dirty = true;
                },
                /** Set custom color for a node sphere. */
                nodeColor(nodeIdx, hexColor){
                    _ruleAnnotations.nodeColors.set(nodeIdx, hexColor);
                    _ruleAnnotations.dirty = true;
                },
                /** Set custom opacity for a shortcut (0-1). */
                scOpacity(scId, opacity){
                    _ruleAnnotations.scOpacity.set(scId, opacity);
                    _ruleAnnotations.dirty = true;
                },
                // nodeScale API removed permanently — sphere sizes must NEVER vary.
                /** Clear all SC color annotations. */
                clearSC(){
                    _ruleAnnotations.scColors.clear();
                    _ruleAnnotations.scOpacity.clear();
                    _ruleAnnotations.dirty = true;
                },
                /** Clear all node annotations. */
                clearNodes(){
                    _ruleAnnotations.nodeColors.clear();
            
                    _ruleAnnotations.dirty = true;
                },
                // ── Void annotations ──
                /** Set custom color for a tetrahedral void mesh. */
                tetColor(voidIndex, hexColor){
                    _ruleAnnotations.tetColors.set(voidIndex, hexColor);
                    _ruleAnnotations.dirty = true;
                },
                /** Set custom color for an octahedral void mesh. */
                octColor(voidIndex, hexColor){
                    _ruleAnnotations.octColors.set(voidIndex, hexColor);
                    _ruleAnnotations.dirty = true;
                },
                /** Set custom opacity for a tet void (0-1). */
                tetOpacity(voidIndex, opacity){
                    _ruleAnnotations.tetOpacity.set(voidIndex, opacity);
                    _ruleAnnotations.dirty = true;
                },
                /** Set per-face colors for an oct void (array of hex colors). */
                octFaces(voidIndex, faceColorArray){
                    _ruleAnnotations.octFaceColors.set(voidIndex, faceColorArray);
                    _ruleAnnotations.dirty = true;
                },
                // ── Excitation annotations ──
                /** Override an excitation's spark color. */
                excitationColor(excIdx, hexColor){
                    _ruleAnnotations.excitationColors.set(excIdx, hexColor);
                    _ruleAnnotations.dirty = true;
                },
                /** Scale an excitation's spark size. */
                excitationScale(excIdx, scale){
                    _ruleAnnotations.excitationScale.set(excIdx, scale);
                    _ruleAnnotations.dirty = true;
                },
                /** Clear all annotations. */
                clear(){
                    _ruleAnnotations.scColors.clear();
                    _ruleAnnotations.nodeColors.clear();
                    _ruleAnnotations.scOpacity.clear();
            
                    _ruleAnnotations.tetColors.clear();
                    _ruleAnnotations.octColors.clear();
                    _ruleAnnotations.tetOpacity.clear();
                    _ruleAnnotations.octFaceColors.clear();
                    _ruleAnnotations.excitationColors.clear();
                    _ruleAnnotations.excitationScale.clear();
                    _ruleAnnotations.dirty = true;
                },
                // Pre-defined gauge group color palettes for convenience
                colors: {
                    // SU(3) color charges
                    RED:     0xff3333,
                    GREEN:   0x33ff33,
                    BLUE:    0x3333ff,
                    ANTI_RED:   0x00cccc,  // cyan (anti-red)
                    ANTI_GREEN: 0xcc00cc,  // magenta (anti-green)
                    ANTI_BLUE:  0xcccc00,  // yellow (anti-blue)
                    WHITE:   0xffffff,      // color-neutral
                    // SU(2) weak isospin
                    LEFT:    0xff8800,      // left-handed (orange)
                    RIGHT:   0x0088ff,      // right-handed (blue)
                    W_PLUS:  0xffcc00,      // W+ boson
                    W_MINUS: 0xff0066,      // W- boson
                    Z_BOSON: 0x88ff88,      // Z boson
                    // U(1) hypercharge
                    PHOTON:  0xffffaa,      // electromagnetic (golden)
                    HYPER_POS: 0xffaaff,    // positive hypercharge
                    HYPER_NEG: 0xaaffff,    // negative hypercharge
                    // Particles
                    FERMION: 0xff6644,      // tet void (fermion)
                    BOSON:   0x4466ff,       // oct void (boson)
                    GLUON:   0x44ffaa,       // gluon field
                    DOMAIN_WALL: 0xff44ff,   // domain boundary
                    CREATION: 0xffff00,      // pair creation flash
                    ANNIHILATION: 0xff0000,  // pair annihilation flash
                }
            },
        };
        // Clear all annotations before rule + GAUGE build new ones
        tickCtx.annotate.clear();
        if(activeRule.tick) {
            activeRule.tick(tickCtx);
            skipExcitations = tickCtx.skipExcitations;
        }

        // ── ANIMATION QUALITY MEASUREMENT ──
        // Measure how well the rule is using annotations to show its logic.
        // Coverage: fraction of SCs+nodes with custom colors
        // Dynamism: how much annotations changed since last tick
        {
            const totalElements = ALL_SC.length + N;
            const annotatedCount = _ruleAnnotations.scColors.size + _ruleAnnotations.nodeColors.size;
            _animCoverage = totalElements > 0 ? annotatedCount / totalElements : 0;

            // Build hash of current annotations for dynamism
            let hashParts = [];
            for(const [k, v] of _ruleAnnotations.scColors) hashParts.push(`s${k}:${v}`);
            for(const [k, v] of _ruleAnnotations.nodeColors) hashParts.push(`n${k}:${v}`);
            const currentHash = hashParts.join(',');

            // Dynamism = did annotations change? (binary per tick, averaged over time)
            _animDynamism = (currentHash !== _prevAnnotationHash && annotatedCount > 0) ? 1.0 : 0.0;
            _prevAnnotationHash = currentHash;

            // Combined animation quality: coverage matters, dynamism matters more
            const animQ = _animCoverage * 0.4 + _animDynamism * 0.6;
            _animHistory.push(animQ);
            if(_animHistory.length > 50) _animHistory.shift();
            _avgAnimQuality = _animHistory.reduce((a, b) => a + b, 0) / _animHistory.length;
        }

        // Auto-apply physics if rule made changes (and didn't already call applyPhysics)
        if(_tickChanges > 0){
            const pFinal = detectImplied();
            applyPositions(pFinal);
        }
        // ── POST-TICK STRAIN RECOVERY ──
        // Tick-based rules can create solver violations via bulk changes.
        // Attempt recovery here (before updateStatus halts the sim).
        // Strategy: check base edges; if any exceed tolerance, reset positions
        // from current activeSet by re-solving from REST positions.
        const TICK_TOL = 1e-3;
        let tickViolation = false;
        for(const [i,j] of BASE_EDGES){
            if(Math.abs(vd(pos[i],pos[j]) - 1.0) > TICK_TOL){ tickViolation = true; break; }
        }
        if(tickViolation){
            // Recovery: re-solve from REST positions with current constraints
            pos = REST.map(v => [...v]);
            const pRecov = detectImplied();
            applyPositions(pRecov);
        }

        // ── SHARED GAUGE GROUP POST-TICK ──
        // Always runs. Updates gauge state (SU(3), SU(2), U(1)) and
        // annotates excitations with gauge force colors,
        // tet voids with fermion type+gen, oct voids with gluon octet,
        // domain wall node scaling.
        // Skips SC colors if the rule already set them.
        if(typeof GAUGE !== 'undefined' && GAUGE.postTick){
            // Clear GAUGE-managed annotations (preserve rule SC colors)
            _ruleAnnotations.excitationColors.clear();
            _ruleAnnotations.excitationScale.clear();
            _ruleAnnotations.tetColors.clear();
            _ruleAnnotations.octColors.clear();
            _ruleAnnotations.tetOpacity.clear();
            _ruleAnnotations.octFaceColors.clear();
    

            tickCtx._ruleSetSCColors = _ruleAnnotations.scColors.size > 0;
            GAUGE.postTick(tickCtx);
        }
    }

    // ── Standard excitation movement (skippable by tick() rules) ──
    if(!skipExcitations){

    // ══════════════════════════════════════════════════════════════════
    // QUARK SINGLE-HOP STEPPING (LEGAL LATTICE MOVES)
    // ══════════════════════════════════════════════════════════════════
    // Quarks traverse within tet K₄ voids via single-hop movement.
    // Each tet has 6 edges: 4 base + 2 SCs. From any node, 3 directions.
    // Cost minimization: prefer free edges (base or open SC), only
    // materialise closed SCs when all free paths are Pauli-blocked.
    // Pauli exclusion: no two excitations may occupy the same node.
    //
    // NOTE on directional constraint (future): positive/negative vector
    // filtering may apply to base directions only (electrons=negative,
    // positrons=positive). Not yet enforced for quarks.

    // Phase 1: Build occupancy map
    _quarkNodeOccupancy.clear();
    const _quarkList = [];
    for (const e of excitations) {
        if (!e._isQuark) continue;
        _quarkNodeOccupancy.set(e.node, e);
        _quarkList.push(e);
    }

    // Phase 2: Shuffle for random priority (fair over time)
    for (let i = _quarkList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [_quarkList[i], _quarkList[j]] = [_quarkList[j], _quarkList[i]];
    }

    // Increment nucleus tick counter (for oct edge tracing)
    _nucleusTick++;

    // Phase 3: Pluggable quark movement via QUARK_ALGO_REGISTRY
    const _allOpenQ = getAllOpen();
    const _qDeparting = new Set();
    const _qArriving = new Set();
    const _qNodeFree = (node, self) => {
        if (_qArriving.has(node)) return false;
        if (_qDeparting.has(node)) return true;
        const occ = _quarkNodeOccupancy.get(node);
        return !occ || occ === self;
    };

    const _algo = QUARK_ALGO_REGISTRY[_activeQuarkAlgo] || QUARK_ALGO_REGISTRY[0];
    const _algoCtx = {
        allOpen: _allOpenQ,
        quarkList: _quarkList,
        faceCoverage: _faceCoverageTotal,
        nucleusTick: _nucleusTick,
        tetFaceData: _nucleusTetFaceData,
        hopGroups: DEUTERON_HOP_GROUPS,
        octSCIds: _octSCIds,
        canMaterialise: canMaterialiseQuick,
        materialise: excitationMaterialiseSC,
        severForRoom: excitationSeverForRoom,
    };

    for (const e of _quarkList) {
        const faceData = _nucleusTetFaceData[e._currentFace];
        if (!faceData || !e.voidNodes) continue;
        const tetScIdSet = new Set(faceData.scIds);

        // Classify edges: free vs costly
        // Include ALL SCs (tet SCs + oct SCs) — not just tet SCs
        const octSCSet = new Set(_octSCIds);
        const freeOptions = [];
        const costlyOptions = [];
        for (const dest of e.voidNodes) {
            if (dest === e.node) continue;
            if (!_qNodeFree(dest, e)) continue;
            const pid = pairId(e.node, dest);
            const scId = scPairToId.get(pid);
            if (scId !== undefined && (tetScIdSet.has(scId) || octSCSet.has(scId))) {
                if (_allOpenQ.has(scId)) freeOptions.push({ dest, scId });
                else costlyOptions.push({ dest, scId });
            } else {
                freeOptions.push({ dest, scId: null });
            }
        }

        const tetSCsOpen = faceData.scIds.filter(id => _allOpenQ.has(id)).length;

        // Priority: materialise oct SCs first (bosonic cage must stay intact)
        let chosen = null;
        const octCostly = costlyOptions.filter(o => octSCSet.has(o.scId));
        if (octCostly.length > 0) {
            for (const opt of octCostly) {
                if (_algoCtx.canMaterialise(opt.scId)) {
                    if (_algoCtx.materialise(e, opt.scId)) { chosen = opt; break; }
                } else if (_algoCtx.severForRoom(opt.scId)) {
                    if (_algoCtx.materialise(e, opt.scId)) { chosen = opt; break; }
                }
            }
        }

        // Cage rush: during first 12 ticks, if no oct SC from here,
        // prefer moving toward oct nodes that have closed oct SCs
        if (!chosen && _nucleusTick < 12 && _octNodeSet) {
            const cageComplete = _octSCIds.every(id => _allOpenQ.has(id));
            if (!cageComplete) {
                // Prefer free edges leading to oct nodes with closed oct SC neighbors
                const octFree = freeOptions.filter(o => _octNodeSet.has(o.dest));
                if (octFree.length > 0) {
                    chosen = octFree[Math.floor(Math.random() * octFree.length)];
                }
            }
        }

        // Delegate to active algorithm if oct SCs already handled
        if (!chosen) chosen = _algo.stepQuark(e, freeOptions, costlyOptions, tetSCsOpen, faceData, _algoCtx);

        // ── Illegal traversal check: if chosen edge is an SC, it must be open NOW ──
        // (can't use _allOpenQ — it's a stale snapshot from before materialisation)
        if (chosen && chosen.scId !== null && chosen.scId !== undefined && (tetScIdSet.has(chosen.scId) || octSCSet.has(chosen.scId))) {
            const liveOpen = getAllOpen();
            if (!liveOpen.has(chosen.scId)) {
                console.warn(`[illegal] ${e._xonId} traversed closed SC ${chosen.scId} (face ${e._currentFace}, ${e.node}→${chosen.dest})`);
                _illegalTraversalCount++;
                chosen = null; // block the move
            }
        }

        // Apply move
        e.trail.push(e.node);
        if (e.trail.length > QUARK_TRAIL_LENGTH) e.trail.shift();
        e.prevNode = e.node;

        if (chosen) {
            _qDeparting.add(e.node);
            _qArriving.add(chosen.dest);
            if (_octNodeSet && _octNodeSet.has(e.node) && _octNodeSet.has(chosen.dest)) {
                const edgeKey = e.node < chosen.dest ? e.node+','+chosen.dest : chosen.dest+','+e.node;
                _octEdgeLastTraced.set(edgeKey, _nucleusTick);
            }
            // Teleportation check: destination must be in current tet
            if (!e.voidNodes.has(chosen.dest)) {
                console.warn(`[teleport] ${e._xonId} jumped to node ${chosen.dest} outside tet face ${e._currentFace}`);
                _teleportationCount++;
            }
            e.node = chosen.dest;
            e.tweenT = 0; e.flashT = 1.0;
            e.totalSteps++; e.stuckTicks = 0;
            e._stepsInFace = (e._stepsInFace || 0) + 1;
        } else {
            e.tweenT = 0; e.flashT = 0.2; e.stuckTicks++;
            _xonStallCount++;
        }

        if (e._tetVoidIdx !== undefined) {
            _ruleAnnotations.tetColors.set(e._tetVoidIdx, TET_QUARK_COLORS[e._currentFace] || 0xffffff);
            _ruleAnnotations.tetOpacity.set(e._tetVoidIdx, 0.7);
        }
        const _eIdx = excitations.indexOf(e);
        if (_eIdx >= 0) _ruleAnnotations.excitationColors.set(_eIdx, e.col);
    }

    // Rebuild occupancy map after moves
    _quarkNodeOccupancy.clear();
    for (const e of _quarkList) _quarkNodeOccupancy.set(e.node, e);

    // ── Coverage-driven quark hopping (delegated to algorithm) ──
    for (const [groupId, groupFaces] of Object.entries(DEUTERON_HOP_GROUPS)) {
        const occupiedFaces = new Set();
        for (const e of _quarkList) {
            if (e._hopGroup === groupId) occupiedFaces.add(e._currentFace);
        }

        // Each quark asks the algorithm if it should hop
        for (const hopper of _quarkList) {
            if (hopper._hopGroup !== groupId) continue;
            const hopResult = _algo.shouldHop(hopper, groupFaces, occupiedFaces, _algoCtx);
            if (!hopResult) continue;

            const targetFace = hopResult.targetFace;
            const newFaceData = _nucleusTetFaceData[targetFace];
            if (!newFaceData) continue;

            // Find shared oct node for continuous transition
            const curFaceDef = DEUTERON_TET_FACES[hopper._currentFace];
            const tgtFaceDef = DEUTERON_TET_FACES[targetFace];
            let sharedNode = null;
            if (curFaceDef && tgtFaceDef) {
                for (const n of curFaceDef.octNodes) {
                    if (tgtFaceDef.octNodes.includes(n)) { sharedNode = n; break; }
                }
            }

            // Release old tet SCs if no other quark remains
            const oldFace = hopper._currentFace;
            const oldVoidIdx = hopper._tetVoidIdx;
            const oldFaceData = _nucleusTetFaceData[oldFace];
            const otherOnOldFace = _quarkList.some(
                e => e !== hopper && e._currentFace === oldFace
            );
            if (!otherOnOldFace) {
                if (oldVoidIdx !== undefined) {
                    _ruleAnnotations.tetColors.delete(oldVoidIdx);
                    _ruleAnnotations.tetOpacity.set(oldVoidIdx, 0.0);
                }
                if (oldFaceData) {
                    const octSCSet = new Set(_octSCIds);
                    for (const scId of oldFaceData.scIds) {
                        // Never sever oct SCs — the bosonic cage must stay intact
                        if (octSCSet.has(scId)) continue;
                        if (xonImpliedSet.has(scId)) {
                            xonImpliedSet.delete(scId);
                            impliedSet.delete(scId);
                            impliedBy.delete(scId);
                            for (const ex of excitations) {
                                if (ex.ownShortcut === scId) ex.ownShortcut = null;
                            }
                        }
                    }
                    bumpState();
                }
            }

            // Switch to new tet
            occupiedFaces.delete(oldFace);
            occupiedFaces.add(targetFace);
            hopper._currentFace = targetFace;
            hopper._tetVoidIdx = newFaceData.voidIdx;
            hopper.voidNodes = new Set(newFaceData.allNodes);
            hopper._stepsInFace = 0;

            // Land on shared oct node if available and unoccupied
            const sharedOccupant = _quarkNodeOccupancy.get(sharedNode);
            if (sharedNode !== null && (!sharedOccupant || sharedOccupant === hopper)) {
                hopper.node = sharedNode;
            }

            // If still outside new tet (no shared node, or it was occupied),
            // pick any unoccupied node in the new tet
            if (!hopper.voidNodes.has(hopper.node)) {
                const newNodes = [...hopper.voidNodes];
                const free = newNodes.filter(n => !_quarkNodeOccupancy.has(n) || _quarkNodeOccupancy.get(n) === hopper);
                hopper.node = free.length > 0 ? free[0] : newNodes[0];
            }

            // Teleportation check: after hop, node must be in new tet
            if (!hopper.voidNodes.has(hopper.node)) {
                console.warn(`[teleport] ${hopper._xonId} hop to face ${targetFace} but node ${hopper.node} not in new tet (nodes: ${[...hopper.voidNodes]})`);
                _teleportationCount++;
            }

            _ruleAnnotations.tetColors.set(newFaceData.voidIdx, TET_QUARK_COLORS[targetFace] || 0xffffff);
            _ruleAnnotations.tetOpacity.set(newFaceData.voidIdx, 0.7);

            break; // one hop per group per tick
        }
    }

    if (_quarkList.length > 0) _ruleAnnotations.dirty = true;

    // Average lifespan (in steps): energy=0% → 8 steps, energy=100% → 80 steps
    // Seeking excitations have per-step dissolution probability = 1/avgLifespan.
    // Stuck excitations decay 4× faster (avgLifespan/4).
    const avgLifespan = 8 + Math.round(excitationEnergy * 72);

    // Step a batch: first MAT_BUDGET get solver access, rest are walk-only
    const n = excitations.length;
    const batchSize = Math.min(n, MAT_BUDGET + WALK_BATCH);
    let matUsed = 0;
    for(let b = 0; b < batchSize; b++){
        excitationClockCursor = excitationClockCursor % excitations.length;
        const e = excitations[excitationClockCursor];
        if(!e) break;
        if(e._isQuark) { excitationClockCursor++; continue; } // already stepped above
        // Excitations with voids don't need materialization (just walking)
        const needsMat = !e.zeroPoint && matUsed < MAT_BUDGET;
        // Only count choice-making steps (Phase 1), not travelDest completions
        // (Phase 2). Each full shortcut traversal = 2 ticks but only 1 "step".
        // This ensures lifespan counts actual traversals, not half-steps.
        const wasCompleting = e.travelDest !== null;
        excitationStep(e, needsMat);
        if(needsMat) matUsed++;
        if(!wasCompleting) e.totalSteps++;
        excitationClockCursor++;
    }

    // Check ALL excitations for eviction (not just the stepped ones)
    const toRemove = new Set();
    const tetOwners = new Map();
    const octOwners = new Map();
    for(const e of excitations){
        // Excitations bound to a void are immortal — skip decay
        if(e.zeroPoint !== null){
            // Dedup: fermion (tet) = 1 per void, boson (oct) = up to 8 per void
            if(e.voidScIds){
                const key = [...e.voidScIds].sort((a,b)=>a-b).join(',');
                if(e.voidType === 'tet'){
                    if(tetOwners.has(key)) toRemove.add(e.id);
                    else tetOwners.set(key, e.id);
                } else if(e.voidType === 'oct'){
                    if(!octOwners.has(key)) octOwners.set(key, []);
                    const owners = octOwners.get(key);
                    if(owners.length >= 8) toRemove.add(e.id);
                    else owners.push(e.id);
                }
            }
            continue;
        }
        // Quark excitations are immortal (managed by virtual pair lifecycle)
        if(e._isQuark) continue;
        // In arena mode excitations are immortal (no lifespan decay).
        // They can still be evicted by void dedup above, but not by
        // loop detection or stochastic decay.
        if(activeRuleIndex > 0) continue;

        // Degenerate loop detection: if a seeking excitation's trail
        // visits fewer than 4 unique nodes after enough steps, it's stuck
        // in a cycle that can never form a valid void (both tet and oct
        // require 4 nodes). Dissolve immediately.
        if(e.totalSteps >= 12 && e.trail.length >= 8){
            const uniqueNodes = new Set(e.trail);
            if(uniqueNodes.size < 4){
                toRemove.add(e.id);
                continue;
            }
        }
        // Seeking excitations: stochastic decay (radioactive-decay model)
        // Must survive at least 4 steps (grace period to find a void)
        if(e.totalSteps >= 4){
            const life = e.stuckTicks > 0 ? Math.max(1, avgLifespan / 4) : avgLifespan;
            if(Math.random() < 1 / life){ toRemove.add(e.id); continue; }
        }
    }

    // Batch remove
    if(toRemove.size){
        if(toRemove.size <= 3){
            for(const id of toRemove) toast('excitation e'+id+' dissolved');
        } else {
            toast(toRemove.size+' excitations dissolved');
        }
        _batchRemoveMode = true;
        for(const id of toRemove) removeExcitation(id);
        _batchRemoveMode = false;
        updateExcitationSidebar();

        // If all excitations dissolved, clean up orphaned electron-implied SCs.
        // The excitation clock will stop (no excitations → no more ticks), so
        // strainMonitorCheck would never run again. Without cleanup, orphaned
        // SCs accumulate strain and trigger invariant violations.
        if(!excitations.length && xonImpliedSet.size){
            let cleaned = 0;
            while(xonImpliedSet.size){
                const before = xonImpliedSet.size;
                strainMonitorCheck();
                if(xonImpliedSet.size >= before) break; // couldn't evict (all protected)
                cleaned++;
                if(cleaned > 50) break; // safety cap
            }
            // If strain is still above halt threshold after cleanup, clear ALL
            // orphaned electron-implied SCs as a last resort.
            if(xonImpliedSet.size){
                let sumErr = 0;
                for(const [i,j] of BASE_EDGES) sumErr += Math.abs(vd(pos[i],pos[j]) - 1.0);
                if(sumErr / BASE_EDGES.length > 1e-3){
                    for(const id of [...xonImpliedSet]){
                        xonImpliedSet.delete(id);
                        impliedSet.delete(id);
                        impliedBy.delete(id);
                    }
                    bumpState();
                    const pFinal = detectImplied();
                    applyPositions(pFinal);
                }
            }
        }
    }

    } // end if(!skipExcitations)

    // ── VIRTUAL PAIR LIFECYCLE ──
    // Decay virtual excitations and handle quark-antiquark annihilation
    if(typeof NucleusSimulator !== 'undefined' && NucleusSimulator.active){
        const qExc = NucleusSimulator.quarkExcitations;
        // 1. Decay virtual excitations
        for(let i = excitations.length - 1; i >= 0; i--){
            const e = excitations[i];
            if(e && e._isVirtual && e._lifetime !== undefined){
                e._lifetime--;
                if(e._lifetime <= 0){
                    // Remove from quark excitations list
                    const qi = qExc.indexOf(e);
                    if(qi >= 0) qExc.splice(qi, 1);
                    // Visual removal
                    if(e.group) scene.remove(e.group);
                    if(e.trailLine) scene.remove(e.trailLine);
                    excitations.splice(i, 1);
                }
            }
        }
        // 2. Annihilation: quark + antiquark at same node with opposite direction
        const nodeMap = new Map(); // nodeIdx → [excitation, ...]
        for(const e of excitations){
            if(!e._isQuark || !e._isVirtual) continue;
            if(e.node === undefined) continue;
            if(!nodeMap.has(e.node)) nodeMap.set(e.node, []);
            nodeMap.get(e.node).push(e);
        }
        for(const [node, group] of nodeMap){
            const particles = group.filter(e => e._direction === 1);
            const antiparticles = group.filter(e => e._direction === -1);
            const pairs = Math.min(particles.length, antiparticles.length);
            for(let p = 0; p < pairs; p++){
                const a = particles[p], b = antiparticles[p];
                // Remove both
                for(const x of [a, b]){
                    const qi = qExc.indexOf(x);
                    if(qi >= 0) qExc.splice(qi, 1);
                    const ei = excitations.indexOf(x);
                    if(ei >= 0){
                        if(x.group) scene.remove(x.group);
                        if(x.trailLine) scene.remove(x.trailLine);
                        excitations.splice(ei, 1);
                    }
                }
                // Annihilation flash: activate nearby SCs as "binding energy"
                for(const sc of ALL_SC){
                    if(sc.a === node || sc.b === node){
                        if(!activeSet.has(sc.id) && Math.random() < 0.3){
                            activeSet.add(sc.id);
                        }
                        break; // just 1 SC per annihilation
                    }
                }
            }
        }
        // 3. Update nucleus metrics display + deuteron panel
        NucleusSimulator.updateMetrics();
        NucleusSimulator.updateDeuteronPanel();
    }

    // Run strain monitor every N ticks
    if(++_strainCheckCounter >= STRAIN_CHECK_INTERVAL){
        _strainCheckCounter=0;
        strainMonitorCheck();
    }

    // Sync jiggle: when both jiggle + excitations are active, run jiggle
    // inside the excitation tick instead of on its own independent timer.
    // This prevents interleaved solver calls from two competing intervals.
    if(jiggleActive && excitations.length) jiggleStep();

    // Capture temporal K frame (after all state mutations for this tick)
    captureTemporalFrame();

    // Tournament watchdog — check if current rule trial should advance
    tournamentCheckTick();

    // Flush deferred UI updates — single batch for the entire tick.
    // IMPORTANT: This MUST rebuild lines + spheres together to prevent
    // sphere-graph desynchronization. If only spheres update (via
    // _spheresDirty in render loop) without graph lines rebuilding,
    // the user sees spheres move while edges/lines stay frozen.
    // FIX (recurring bug): Always rebuild if EITHER flag is set, and
    // always sync both spheres AND graph together.
    _deferUIUpdates = false;
    if(_uiDirty || _spheresDirty || _ruleAnnotations.dirty){
        _uiDirty = false;
        rebuildBaseLines(); rebuildShortcutLines();
        updateVoidSpheres(); updateCandidates(); updateSpheres(); updateStatus();
    }

    // ── Sync health check: verify sphere ↔ pos[] alignment ──
    // Spot-checks a sample of sphere InstancedMesh positions against pos[].
    // Updates _syncMaxDeviation and _syncStatus for the deuteron panel.
    if(typeof NucleusSimulator !== 'undefined' && NucleusSimulator.active && bgMesh){
        let maxDev = 0;
        if(!excitationClockTick._chkMat) excitationClockTick._chkMat = new THREE.Matrix4();
        if(!excitationClockTick._chkPos) excitationClockTick._chkPos = new THREE.Vector3();
        const _chkMat = excitationClockTick._chkMat;
        const _chkPos = excitationClockTick._chkPos;
        // Sample up to 8 random nodes + all quark nodes
        const sampleSet = new Set();
        for(const q of (NucleusSimulator.quarkExcitations || [])){
            sampleSet.add(q.node);
        }
        for(let s = 0; s < 8 && sampleSet.size < 14; s++){
            sampleSet.add(Math.floor(Math.random() * N));
        }
        for(const idx of sampleSet){
            if(idx >= N) continue;
            bgMesh.getMatrixAt(idx, _chkMat);
            _chkPos.setFromMatrixPosition(_chkMat);
            const dx = _chkPos.x - pos[idx][0];
            const dy = _chkPos.y - pos[idx][1];
            const dz = _chkPos.z - pos[idx][2];
            // If scale is 0 (hidden in bg, shown in fg), check fg instead
            const scaleX = _chkMat.elements[0]; // approximate scale
            if(Math.abs(scaleX) < 0.01 && fgMesh){
                fgMesh.getMatrixAt(idx, _chkMat);
                _chkPos.setFromMatrixPosition(_chkMat);
                const dx2 = _chkPos.x - pos[idx][0];
                const dy2 = _chkPos.y - pos[idx][1];
                const dz2 = _chkPos.z - pos[idx][2];
                const dev2 = Math.sqrt(dx2*dx2 + dy2*dy2 + dz2*dz2);
                maxDev = Math.max(maxDev, dev2);
            } else {
                const dev = Math.sqrt(dx*dx + dy*dy + dz*dz);
                maxDev = Math.max(maxDev, dev);
            }
        }
        _syncMaxDeviation = maxDev;
        _syncStatus = maxDev < 0.001 ? 'ok' : maxDev < 0.01 ? 'warn' : 'error';
    }

    // Big bang toggle: check for stale state and re-bang
    bigBangStaleCheck();
}
function startExcitationClock(){ if(excitationClockTimer||excitationPaused) return; excitationClockTimer=setInterval(excitationClockTick,ELECTRON_STEP_MS); }
function stopExcitationClock(){ clearInterval(excitationClockTimer); excitationClockTimer=null; excitationClockCursor=0; }
function syncExcitationPlayBtn(){
    const btn=document.getElementById('btn-excitation-play');
    btn.style.display=excitations.length?'':'none';
    btn.textContent=excitationPaused?'\u25b6':'\u23f8';
    btn.classList.toggle('active',excitationPaused);
}
function toggleExcitationPause(){
    excitationPaused=!excitationPaused;
    if(excitationPaused){ clearInterval(excitationClockTimer); excitationClockTimer=null; }
    else if(excitations.length){ startExcitationClock(); }
    syncExcitationPlayBtn();
}

function updateExcitationSidebar(){
    const el=document.getElementById('side-excitations'); el.innerHTML='';
    // (no longer hiding shortcuts when excitations active — both show in unified panel)
    syncExcitationPlayBtn();
    if(!excitations.length) return;
    const hdr=document.createElement('div'); hdr.className='el-header';
    hdr.innerHTML='excitations <span id="el-clear" title="remove all">✕</span>';
    el.appendChild(hdr);
    hdr.querySelector('#el-clear').addEventListener('click', removeAllExcitations);
    excitations.forEach(e=>{ const item=document.createElement('div'); item.className='el-item'; item.innerHTML=`<div class="el-dot" style="background:${ELECTRON_COLORS_CSS[e.colorIdx]}"></div><span class="el-label">e${e.id} · v${e.node}</span><span class="el-remove">remove</span>`; item.querySelector('.el-remove').addEventListener('click',()=>removeExcitation(e.id)); el.appendChild(item); });
}

function tickExcitations(dt){
    excitations.forEach(e=>{
        e.tweenT=Math.min(1,e.tweenT+dt/(ELECTRON_STEP_MS*0.001));
        const s=1-(1-e.tweenT)**3;
        const pfx=pos[e.prevNode][0],pfy=pos[e.prevNode][1],pfz=pos[e.prevNode][2];
        const ptx=pos[e.node][0],pty=pos[e.node][1],ptz=pos[e.node][2];
        const px=pfx+(ptx-pfx)*s, py=pfy+(pty-pfy)*s, pz=pfz+(ptz-pfz)*s;
        e.group.position.set(px,py,pz);
        // Sparkle flash: pulse + random flicker + linear travel sparkle
        e.flashT=Math.max(0,e.flashT-dt*6.0);
        const flicker=0.85+Math.random()*0.3; // random 0.85–1.15
        // Linear travel detection: consecutive moves in similar direction → extra sparkle
        let linearBoost = 1.0;
        if(e.trail.length >= 3){
            const t = e.trail;
            const len = t.length;
            // Check if last 3 trail positions form a roughly straight line
            const ax=pos[t[len-1]][0]-pos[t[len-2]][0], ay=pos[t[len-1]][1]-pos[t[len-2]][1], az=pos[t[len-1]][2]-pos[t[len-2]][2];
            const bx=pos[t[len-2]][0]-pos[t[len-3]][0], by=pos[t[len-2]][1]-pos[t[len-3]][1], bz=pos[t[len-2]][2]-pos[t[len-3]][2];
            const al=Math.sqrt(ax*ax+ay*ay+az*az)||1, bl=Math.sqrt(bx*bx+by*by+bz*bz)||1;
            const dot=(ax*bx+ay*by+az*bz)/(al*bl);
            if(dot > 0.8) linearBoost = 1.0 + (dot - 0.8) * 3.0; // up to 1.6x for perfectly straight
        }
        const pulse=(0.22+e.flashT*0.26)*flicker*linearBoost;
        e.spark.scale.set(pulse,pulse,1);
        const sparkSliderOp = (+document.getElementById('spark-opacity-slider').value) / 100;
        e.sparkMat.opacity=(0.6+e.flashT*0.4)*flicker*sparkSliderOp*Math.min(linearBoost, 1.3);
        // Enhanced sparkle for linear travel: faster rotation + scale jitter
        if(linearBoost > 1.1){
            e.sparkMat.rotation += Math.random()*Math.PI; // extra spin
            const jitter = 1.0 + Math.random()*0.15*(linearBoost-1.0);
            e.spark.scale.x *= jitter; e.spark.scale.y *= jitter;
        } else {
            e.sparkMat.rotation=Math.random()*Math.PI*2;
        }
        // ── Excitation annotation overrides ──
        const eIdx = excitations.indexOf(e);
        const annotExcCol = _ruleAnnotations.excitationColors.get(eIdx);
        const annotExcScale = _ruleAnnotations.excitationScale.get(eIdx);
        if(annotExcCol !== undefined){
            e.sparkMat.color.setHex(annotExcCol);
        }
        if(annotExcScale !== undefined){
            const aPulse = pulse * annotExcScale;
            e.spark.scale.set(aPulse, aPulse, 1);
        }
        // Trail: electrical path along base edges
        const useCol = annotExcCol !== undefined ? annotExcCol : e.col;
        const cr=((useCol>>16)&0xff)/255, cg=((useCol>>8)&0xff)/255, cb=(useCol&0xff)/255;
        const graphOp=+document.getElementById('trail-opacity-slider').value/100;
        const isQuarkTrail = !!e._isQuark;
        const n=e.trail.length+1;
        for(let i=0;i<e.trail.length;i++){
            const np=pos[e.trail[i]];
            e.trailPos[i*3]=np[0]; e.trailPos[i*3+1]=np[1]; e.trailPos[i*3+2]=np[2];
            // Quark trails: uniform brightness (string-like closed loops)
            // Normal trails: fade from dim to bright
            const alpha = isQuarkTrail ? graphOp * 0.9 : graphOp*(0.15+0.85*(i/(n-1))**1.6);
            e.trailCol[i*3]=cr*alpha; e.trailCol[i*3+1]=cg*alpha; e.trailCol[i*3+2]=cb*alpha;
        }
        const last=e.trail.length;
        e.trailPos[last*3]=px; e.trailPos[last*3+1]=py; e.trailPos[last*3+2]=pz;
        const lastAlpha = isQuarkTrail ? graphOp * 0.9 : graphOp;
        e.trailCol[last*3]=cr*lastAlpha; e.trailCol[last*3+1]=cg*lastAlpha; e.trailCol[last*3+2]=cb*lastAlpha;
        e.trailGeo.setDrawRange(0,n);
        e.trailGeo.attributes.position.needsUpdate=true; e.trailGeo.attributes.color.needsUpdate=true;
        if(e.tweenT>=1){ const lbl=document.querySelector(`#side-excitations .el-item:nth-child(${excitations.indexOf(e)+2}) .el-label`); if(lbl) lbl.textContent=`e${e.id} · v${e.node}`; }
    });
}

function toggleExcitationPlacement(){
    placingExcitation=!placingExcitation;
    document.getElementById('btn-add-excitation').classList.toggle('placing',placingExcitation);
    document.getElementById('hint').textContent=placingExcitation?'click a node to place excitation · Escape to cancel':'click sphere to select · click candidate (blue) to add shortcut · click edge to sever';
}

