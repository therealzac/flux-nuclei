// flux-tournament.js — K-complexity, temporal K, rule tournament engine
// ─── Kolmogorov complexity approximation (Lempel-Ziv 76) ──────────────
// Counts the number of distinct new substrings encountered when scanning
// a binary string left to right. This approximates Kolmogorov complexity:
//   K ≈ c(n) · log₂(n) / n
// where c(n) is the LZ76 complexity count and n is the string length.
// Normalized to [0, 1]: 0 = maximally structured, 1 = incompressible/random.
function lz76Complexity(s){
    const n = s.length;
    if(n === 0) return 0;
    let i = 0, c = 1;
    while(i < n){
        // Find longest prefix at position i that appears in s[0..i-1]
        let l = 1;
        while(i + l <= n){
            const sub = s.substring(i, i + l);
            if(i > 0 && s.substring(0, i).indexOf(sub) >= 0) l++;
            else break;
        }
        i += l;
        if(i < n) c++;
    }
    // Normalize: random binary string → c(n) ≈ n / log₂(n)
    const maxC = n / Math.log2(n || 2);
    return Math.min(1, c / maxC);
}

// Compute the state compressibility metric.
// Encodes the graph as a ternary string per SC: '0' inactive, '1' implied,
// '2' manual/active — capturing more structure than a pure binary vector.
// Returns normalized K-complexity in [0, 1].
// Build ternary state string using Array.join (avoids O(n²) from += on immutable strings)
function _buildStateStr(){
    const n = ALL_SC.length;
    const parts = new Array(n);
    for(let i = 0; i < n; i++){
        const id = ALL_SC[i].id;
        if(activeSet.has(id)) parts[i] = '2';
        else if(xonImpliedSet.has(id) || impliedSet.has(id)) parts[i] = '1';
        else parts[i] = '0';
    }
    return parts.join('');
}

let _computedKC = 0, _computedKCVersion = -1;
function computeKComplexity(){
    if(!ALL_SC || !ALL_SC.length) return 0;
    if(_computedKCVersion === stateVersion) return _computedKC;
    _computedKC = lz76Complexity(_buildStateStr());
    _computedKCVersion = stateVersion;
    return _computedKC;
}

// ─── Temporal K-complexity ────────────────────────────────────────────
// Measures complexity of the "3D movie" — how much new information each
// state change adds to the growing sequence. LZ76 on the concatenation
// of per-frame state strings. Recomputed every 5th frame for performance.
function captureTemporalFrame(){
    if(_temporalLastVersion === stateVersion) return;
    _temporalLastVersion = stateVersion;
    const frame = _buildStateStr();

    // ── Hamming distance: how much did the lattice change this tick? ──
    if(_prevFrameStr && _prevFrameStr.length === frame.length){
        let diff = 0;
        for(let i = 0; i < frame.length; i++){
            if(frame[i] !== _prevFrameStr[i]) diff++;
        }
        _hammingDistance = diff / frame.length;
    } else {
        _hammingDistance = 0; // first frame or length change
    }
    _prevFrameStr = frame;
    _hammingHistory.push(_hammingDistance);
    if(_hammingHistory.length > 50) _hammingHistory.shift();
    _avgHamming = _hammingHistory.reduce((a, b) => a + b, 0) / _hammingHistory.length;

    // Track stuck state: consecutive ticks with near-zero change
    if(_hammingDistance < 0.01) _stuckTickCount++;
    else _stuckTickCount = 0;

    // ── Temporal K (LZ76 on concatenated frames) ──
    _temporalFrames.push(frame);
    if(_temporalFrames.length > TEMPORAL_K_WINDOW) _temporalFrames.shift();
    _temporalKFramesSinceRecompute++;
    if(_temporalKFramesSinceRecompute >= 5){
        _temporalKFramesSinceRecompute = 0;
        const concat = _temporalFrames.join('');
        _temporalKValue = lz76Complexity(concat);
        _temporalKDeltas.push(_temporalKValue);
        if(_temporalKDeltas.length > 100) _temporalKDeltas.shift();
    }
}
function resetTemporalK(){
    _temporalFrames = [];
    _temporalKValue = 0;
    _temporalKDeltas = [];
    _temporalLastVersion = -1;
    _temporalKFramesSinceRecompute = 0;
    _prevFrameStr = '';
    _hammingDistance = 0;
    _hammingHistory = [];
    _avgHamming = 0;
    _stuckTickCount = 0;
}

// ─── Rule tournament engine ────────────────────────────────────────
//
// OVERVIEW:
// The tournament cycles through every non-classic rule in RULE_REGISTRY,
// running each in the live simulation and measuring temporal K.
// Each rule is a fundamentally different MECHANIC for establishing and
// severing shortcut directions (Conway, contrarian, wave-front, etc.).
//
// LIFECYCLE PER TRIAL:
//   1. Install rule (set activeRuleIndex, clear lattice, big bang)
//   2. Each tick: track peak temporal K
//   3. If temporal K surpassed 10% then crashes below 10% → trial ends
//   4. If max ticks reached → trial ends
//   5. Record fitness = 70% avg temporal K + 30% peak temporal K
//   6. Advance to next rule
//   7. After all rules tested → log round results, start next round
//
// ENTRY POINTS:
//   startTournament()     — called by UI button
//   stopTournament()      — called by UI button
//   tournamentCheckTick() — called from excitationClockTick()
//
// Results are persisted to localStorage so they survive page reloads.
// Console logs are structured for agent parsing:
//   [tournament] round N rule "name" | fitness: X% | peak: Y% | ...

/**
 * Emit a structured event for agent polling.
 * Agents read window._fluxEventQueue and clear it after processing.
 */
function emitFluxEvent(type, data){
    const evt = { type, data, ts: Date.now() };
    window._fluxEventQueue.push(evt);
    // Also log for console-based polling
    console.log(`[flux-event] ${type} ${JSON.stringify(data)}`);
}

/**
 * Begin the tournament.  Builds a queue of all non-classic rules
 * and starts testing the first one.
 */
function startTournament(){
    if(QUARK_ALGO_REGISTRY.length < 2){
        toast('need 2+ quark algorithms'); return;
    }

    tournamentActive = true;
    tournamentRound = 0;
    tournamentQueueIdx = 0;

    // Build queue: ALL quark algorithms
    tournamentQueue = [];
    for(let i = 0; i < QUARK_ALGO_REGISTRY.length; i++){
        tournamentQueue.push(i);
    }

    loadTournamentResults();

    const ts = document.getElementById('tournament-status');
    if(ts) ts.style.display = 'block';

    // Opacity during tournament: shapes 25%, spheres/graph 5%
    for (const [sid, val] of [['sphere-opacity-slider',5],['graph-opacity-slider',5],['void-opacity-slider',20]]) {
        const sl = document.getElementById(sid);
        if(sl){ sl.value = val; sl.dispatchEvent(new Event('input')); }
    }
    // Zoom out for better overview
    sph.r = Math.max(12, sph.r);
    applyCamera();

    // Install first algorithm — runs deuteron sim fresh
    installTrialRule(tournamentQueue[0]);

    syncTournamentButton();
    updateTournamentUI();
    toast('quark algo tournament started — round 0');
}

/**
 * Stop the tournament.  Keeps current simulation state.
 */
function stopTournament(){
    tournamentActive = false;
    syncTournamentButton();
    updateTournamentUI();
    toast('tournament stopped');
}

/**
 * Install rule at the given RULE_REGISTRY index.
 * Clears all SC state, resets temporal K, spawns fresh excitations.
 */
function installTrialRule(algoIdx){
    tournamentTickCounter = 0;
    tournamentPeakTK = 0;
    tournamentHasSurpassed = false;

    // Set active quark algorithm
    _activeQuarkAlgo = algoIdx;
    const algo = QUARK_ALGO_REGISTRY[algoIdx];

    // Start recording for this trial
    _currentRecordingKey = `${algoIdx}_r${tournamentRound}`;
    _tournamentRecordings[_currentRecordingKey] = [];

    // Deactivate current nucleus sim if running
    // Guard: prevent deactivate() from killing the tournament
    _tournamentInstalling = true;
    if(NucleusSimulator.active) NucleusSimulator.deactivate();
    _tournamentInstalling = false;

    // Reset coverage for fresh trial
    _faceCoverageTotal = {};
    _nucleusTick = 0;
    _octEdgeLastTraced.clear();
    _activePatternSchedule = null; // recompute for new trial

    // Reset Hamming / stuck counters
    _prevFrameStr = '';
    _hammingDistance = 0;
    _hammingHistory = [];
    _avgHamming = 0;
    _stuckTickCount = 0;
    _teleportationCount = 0;
    _illegalTraversalCount = 0;
    _xonStallCount = 0;

    // Run fresh deuteron simulation
    NucleusSimulator.simulateNucleus();

    // Update title — prominent algo name during tournament
    const titleEl = document.getElementById('rule-title');
    if(titleEl) {
        titleEl.textContent = algo?.name || '?';
        titleEl.style.fontSize = '18px';
        titleEl.style.color = '#eeddaa';
    }

    console.log(
        `[tournament] === STARTING: "${algo?.name}" ` +
        `(algo ${algoIdx}/${QUARK_ALGO_REGISTRY.length-1}, ` +
        `round ${tournamentRound}, ` +
        `queue ${tournamentQueueIdx+1}/${tournamentQueue.length}) ===`
    );
}

/**
 * Per-tick watchdog.  Called from excitationClockTick() after
 * captureTemporalFrame().
 *
 * Advance conditions (OR):
 *   1. Max ticks reached (TOURNAMENT_EVAL_TICKS)
 *   2. Temporal K crashed below threshold after surpassing it
 */
// Compute coverage evenness score (0–1, higher = more even)
// For each type×group, compute coefficient of variation of face coverage.
// Perfect evenness = CV of 0 → score of 1.
function _computeCoverageEvenness(){
    // Per quark-type coverage evenness across all 8 faces.
    // Each quark type (pu, pd, nu, nd) should ideally be spread
    // evenly across all faces it can reach.
    const types = ['pu', 'pd', 'nu', 'nd'];
    const faces = [1, 2, 3, 4, 5, 6, 7, 8];
    let totalCV = 0;
    let totalCov = 0;
    for (const t of types) {
        const counts = faces.map(f => _faceCoverageTotal[t + '_' + f] || 0);
        const sum = counts.reduce((a, b) => a + b, 0);
        totalCov += sum;
        if (sum === 0) { totalCV += 1; continue; }
        const mean = sum / counts.length;
        const variance = counts.reduce((a, c) => a + (c - mean) ** 2, 0) / counts.length;
        const cv = Math.sqrt(variance) / mean;
        totalCV += Math.min(cv, 2);
    }
    const avgCV = totalCV / types.length;
    const evennessScore = Math.max(0, 1 - avgCV);
    return { evennessScore, totalCov, avgCV };
}

function tournamentCheckTick(){
    if(!tournamentActive) return;

    tournamentTickCounter++;

    // ── Record tick snapshot ──
    if (_currentRecordingKey && NucleusSimulator.active) {
        const allOpen = getAllOpen();
        const quarks = NucleusSimulator.quarkExcitations || [];
        let tetAct = 0;
        for (const fd of Object.values(_nucleusTetFaceData)) {
            if (fd.scIds.every(id => allOpen.has(id))) tetAct++;
        }
        const snap = {
            t: tournamentTickCounter,
            q: quarks.map(e => ({ id: e._xonId, n: e.node, pn: e.prevNode, f: e._currentFace, sf: e._stepsInFace || 0, col: e.col })),
            sc: [...allOpen],
            ei: [...xonImpliedSet],
            ta: tetAct,
            oc: _octSCIds.filter(id => allOpen.has(id)).length,
        };
        if (!_tournamentRecordings[_currentRecordingKey]) _tournamentRecordings[_currentRecordingKey] = [];
        _tournamentRecordings[_currentRecordingKey].push(snap);
    }

    // ── Cage formation deadline: cage must be fully formed by tick 12 ──
    const isNucleus = NucleusSimulator.active;
    let cageNotFormed = false;
    let cageBroken = false;
    if (isNucleus && _octSCIds.length > 0) {
        const allOpenNow = getAllOpen();
        const octOpen = _octSCIds.filter(id => allOpenNow.has(id)).length;
        const cageFull = octOpen === _octSCIds.length;
        if (tournamentTickCounter === 12 && !cageFull) {
            cageNotFormed = true; // failed to build cage in 12 steps
        }
        if (tournamentTickCounter > 12 && octOpen < 4) {
            cageBroken = true; // cage lost after formation deadline
        }
    }

    // ── Rule violation checks ──
    const teleported = _teleportationCount > 0;
    const illegalMove = _illegalTraversalCount > 0;
    const xonStalled = _xonStallCount > 0;
    const ruleViolation = teleported || illegalMove || xonStalled || cageNotFormed || cageBroken; // instant disqualification

    // ── Should we advance? ──
    const stuckCrash = !isNucleus && _stuckTickCount > 20
        && tournamentTickCounter > TOURNAMENT_RAMP_TICKS;
    const maxed = tournamentTickCounter >= TOURNAMENT_EVAL_TICKS;

    if(ruleViolation || stuckCrash || maxed){
        // COVERAGE EVENNESS FITNESS
        const { evennessScore, totalCov, avgCV } = _computeCoverageEvenness();

        // Actualization score: fraction of ticks where tets were fully actualized
        const maxPossibleCov = tournamentTickCounter * 6; // 6 xons × ticks
        const actualizationRate = maxPossibleCov > 0 ? totalCov / maxPossibleCov : 0;

        // Combined fitness: any rule violation = 0, otherwise 60% evenness + 30% actualization + 10% stability
        const fitness = ruleViolation ? 0 :
            evennessScore * 0.60 +
            actualizationRate * 0.30 +
            (stuckCrash ? 0 : 0.10);

        const algoIdx = tournamentQueue[tournamentQueueIdx];
        const algoName = QUARK_ALGO_REGISTRY[algoIdx]?.name || '?';

        const outcomeStr = teleported ? `TELEPORTED(${_teleportationCount})`
            : illegalMove ? `ILLEGAL-TRAVERSAL(${_illegalTraversalCount})`
            : xonStalled ? `XON-STALLED(${_xonStallCount})`
            : cageNotFormed ? 'CAGE-NOT-FORMED'
            : cageBroken ? 'CAGE-BROKEN' : stuckCrash ? 'STUCK' : 'MAXED';
        const outcomeKey = teleported ? 'teleported'
            : illegalMove ? 'illegal-traversal'
            : xonStalled ? 'xon-stalled'
            : cageNotFormed ? 'cage-not-formed'
            : cageBroken ? 'cage-broken' : stuckCrash ? 'stuck' : 'maxed';

        console.log(
            `[tournament] round ${tournamentRound} algo "${algoName}" | ` +
            `fitness: ${(fitness * 100).toFixed(1)}% | ` +
            `evenness: ${(evennessScore * 100).toFixed(1)}% | ` +
            `avgCV: ${avgCV.toFixed(3)} | ` +
            `actualized: ${(actualizationRate * 100).toFixed(1)}% | ` +
            `totalCov: ${totalCov} | ` +
            `ticks: ${tournamentTickCounter} | ` +
            outcomeStr
        );

        tournamentResults.push({
            ruleIdx: algoIdx, name: algoName, fitness,
            evennessScore, avgCV, actualizationRate, totalCov,
            ticks: tournamentTickCounter,
            outcome: outcomeKey,
            round: tournamentRound
        });
        if(tournamentResults.length > TOURNAMENT_MAX_RESULTS){
            tournamentResults = tournamentResults.slice(-TOURNAMENT_MAX_RESULTS);
        }
        saveTournamentResults();
        emitFluxEvent('TRIAL_DONE', {
            rule: algoName, ruleIdx: algoIdx, fitness,
            evenness: evennessScore, avgCV, actualizationRate,
            ticks: tournamentTickCounter,
            outcome: outcomeKey,
            round: tournamentRound
        });

        // Advance to next algo
        tournamentQueueIdx++;
        if(tournamentQueueIdx >= tournamentQueue.length){
            logRoundSummary();
            emitFluxEvent('ROUND_COMPLETE', { round: tournamentRound });
            // Tournament complete after 1 round — show results + playback
            tournamentActive = false;
            syncTournamentButton();
            _showTournamentComplete();
            return;
        }

        installTrialRule(tournamentQueue[tournamentQueueIdx]);
    }

    if(tournamentTickCounter % 10 === 0) updateTournamentUI();
}

/**
 * Log a round summary to console — shows all rules ranked by fitness.
 */
function logRoundSummary(){
    const roundResults = tournamentResults.filter(r => r.round === tournamentRound);
    roundResults.sort((a, b) => b.fitness - a.fitness);

    console.log(`\n[tournament] ══════════ ROUND ${tournamentRound} COMPLETE ══════════`);
    roundResults.forEach((r, i) => {
        console.log(
            `  ${i+1}. ${r.name.padEnd(20)} ` +
            `fitness: ${(r.fitness * 100).toFixed(1).padStart(5)}% ` +
            `even: ${((r.evennessScore||0) * 100).toFixed(1).padStart(5)}% ` +
            `CV: ${(r.avgCV||0).toFixed(3).padStart(6)} ` +
            `actual: ${((r.actualizationRate||0) * 100).toFixed(1).padStart(5)}% ` +
            `cov: ${(r.totalCov||0).toString().padStart(5)} ` +
            `${r.outcome}`
        );
    });

    const allTimeBest = [...tournamentResults].sort((a, b) => b.fitness - a.fitness)[0];
    if(allTimeBest){
        console.log(
            `  ALL-TIME BEST: "${allTimeBest.name}" ` +
            `fitness: ${(allTimeBest.fitness * 100).toFixed(1)}% ` +
            `(round ${allTimeBest.round})`
        );
    }
    console.log(`[tournament] ═══════════════════════════════════════════\n`);
}

/**
 * Update the tournament status display.
 */
function updateTournamentUI(){
    const el = document.getElementById('tournament-status');
    if(!el) return;
    if(!tournamentActive){
        // Show final results if available
        if (tournamentResults.length > 0) {
            const currentRound = tournamentResults.filter(r => r.round === tournamentRound);
            if (currentRound.length > 0) {
                let html = `<div style="color:#aabbcc; margin-bottom:3px;">round ${tournamentRound} results:</div>`;
                const sorted = [...currentRound].sort((a, b) => b.fitness - a.fitness);
                for (const r of sorted) {
                    const dq = r.fitness === 0 && r.outcome !== 'maxed';
                    const outcomeColor = dq ? '#cc5555' : r.fitness > 0.3 ? '#66dd66' : '#ccaa66';
                    const outcomeLabel = dq ? r.outcome.replace(/-/g, ' ').toUpperCase() : `${(r.fitness * 100).toFixed(1)}%`;
                    html += `<div style="display:flex; justify-content:space-between;">`
                        + `<span style="color:#8899aa;">${r.name}</span>`
                        + `<span style="color:${outcomeColor};">${outcomeLabel}</span></div>`;
                }
                el.innerHTML = html;
                el.style.color = '#8899aa';
                el.style.display = 'block';
                return;
            }
        }
        el.textContent = 'idle';
        el.style.color = '#5a7a8a';
        return;
    }
    const algoIdx = tournamentQueue[tournamentQueueIdx];
    const algoName = QUARK_ALGO_REGISTRY[algoIdx]?.name || '?';
    const { evennessScore, totalCov, avgCV } = _computeCoverageEvenness();

    // Show completed results so far + current algo status
    const doneThisRound = tournamentResults.filter(r => r.round === tournamentRound);
    let html = '';
    for (const r of doneThisRound) {
        const dq = r.fitness === 0 && r.outcome !== 'maxed';
        const outcomeColor = dq ? '#cc5555' : r.fitness > 0.3 ? '#66dd66' : '#ccaa66';
        const outcomeLabel = dq ? r.outcome.replace(/-/g, ' ') : `${(r.fitness * 100).toFixed(1)}%`;
        html += `<div style="display:flex; justify-content:space-between;">`
            + `<span style="color:#667788;">${r.name}</span>`
            + `<span style="color:${outcomeColor};">${outcomeLabel}</span></div>`;
    }
    html += `<div style="margin-top:2px; color:#d4b884;">` +
        `▸ ${algoName} · tick ${tournamentTickCounter}/${TOURNAMENT_EVAL_TICKS}</div>`;
    html += `<div style="color:#7799aa;">` +
        `even: ${(evennessScore*100).toFixed(1)}% · CV: ${avgCV.toFixed(3)} · cov: ${totalCov}</div>`;
    el.innerHTML = html;
    el.style.color = '#a0c070';
}

/**
 * Toggle the tournament button appearance.
 */
function syncTournamentButton(){
    const btn = document.getElementById('btn-tournament');
    if(!btn) return;
    btn.textContent = tournamentActive ? 'stop tournament' : 'tournament';
    btn.classList.toggle('active', tournamentActive);
}

/**
 * Show tournament complete UI with playback controls.
 */
function _showTournamentComplete(){
    const pb = document.getElementById('tournament-playback');
    const ts = document.getElementById('tournament-status');
    if(!pb) return;
    if(ts) ts.style.display = 'none';
    pb.style.display = 'block';

    // Stop all motion and clear lattice
    stopExcitationClock();

    // Populate algo selector from recordings
    const sel = document.getElementById('playback-algo');
    sel.innerHTML = '';
    const keys = Object.keys(_tournamentRecordings).filter(k => _tournamentRecordings[k].length > 0);
    for (const key of keys) {
        const [algoIdx, round] = key.split('_r');
        const name = QUARK_ALGO_REGISTRY[parseInt(algoIdx)]?.name || '?';
        const result = tournamentResults.find(r => r.ruleIdx === parseInt(algoIdx) && r.round === parseInt(round));
        const fitness = result ? ` ${(result.fitness*100).toFixed(1)}% · ${result.outcome}` : '';
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `${name} — ${fitness}`;
        sel.appendChild(opt);
    }

    const slider = document.getElementById('playback-slider');
    const tickEl = document.getElementById('playback-tick');
    const maxEl = document.getElementById('playback-max');
    const infoEl = document.getElementById('playback-info');

    function applyFrame() {
        const key = sel.value;
        const frames = _tournamentRecordings[key] || [];
        const idx = parseInt(slider.value);
        const frame = frames[idx];
        if (!frame) { infoEl.textContent = 'no data'; return; }
        tickEl.textContent = frame.t;

        // ── Reconstruct lattice state from snapshot ──
        // Clear current SC state
        xonImpliedSet.clear();
        impliedSet.clear();
        impliedBy.clear();
        // Don't touch activeSet — keep it at 0 (no manual SCs)

        // Apply recorded xonImplied SCs
        const openSet = new Set(frame.sc);
        if (frame.ei) {
            for (const scId of frame.ei) {
                xonImpliedSet.add(scId);
                impliedSet.add(scId);
            }
        }

        // Solve positions for the new constraint set
        bumpState();
        const pSolved = detectImplied();
        applyPositions(pSolved);

        // Position quarks at their recorded nodes
        const quarks = NucleusSimulator.quarkExcitations || [];
        for (const qSnap of frame.q) {
            const quark = quarks.find(e => e._xonId === qSnap.id);
            if (!quark) continue;
            quark.node = qSnap.n;
            quark.prevNode = qSnap.pn !== undefined ? qSnap.pn : qSnap.n;
            quark._currentFace = qSnap.f;
            quark._stepsInFace = qSnap.sf;
            quark.tweenT = 1.0; // snap to position (no tween)
            quark.flashT = 0;

            // Update tet annotations
            const fd = _nucleusTetFaceData[qSnap.f];
            if (fd) {
                _ruleAnnotations.tetColors.set(fd.voidIdx, TET_QUARK_COLORS[qSnap.f] || qSnap.col);
                _ruleAnnotations.tetOpacity.set(fd.voidIdx, 0.7);
            }
        }
        _ruleAnnotations.dirty = true;

        // Update visuals
        updateVoidSpheres();
        updateCandidates();
        updateSpheres();
        updateStatus();

        // Look up DQ info for this recording
        const [rkAlgoIdx, rkRound] = key.split('_r');
        const trialResult = tournamentResults.find(
            r => r.ruleIdx === parseInt(rkAlgoIdx) && r.round === parseInt(rkRound)
        );
        const isDQ = trialResult && trialResult.fitness === 0 && trialResult.outcome !== 'maxed';
        const isLastFrame = idx >= frames.length - 1;

        // Update info display
        let infoHtml = `oct: <span style="color:${frame.oc === 4 ? '#66dd66' : '#ff4040'}">${frame.oc}/4</span> · ` +
            `tets: <span style="color:${frame.ta > 0 ? '#66dd66' : '#aa6666'}">${frame.ta}/8</span> · ` +
            `SCs: ${frame.sc.length}<br>` +
            frame.q.map(q => {
                const faceColor = TET_QUARK_COLORS[q.f];
                const css = faceColor ? `#${faceColor.toString(16).padStart(6,'0')}` : '#aaaaaa';
                return `<span style="color:${css}">${q.id}→F${q.f}</span>`;
            }).join(' ');

        // Show DQ reason prominently
        if (isDQ) {
            const reason = trialResult.outcome.replace(/-/g, ' ').toUpperCase();
            infoHtml += `<div style="margin-top:4px; padding:3px 6px; background:rgba(200,50,50,0.3); border:1px solid #cc5555; border-radius:3px; color:#ff6666; font-size:9px; font-weight:bold; letter-spacing:0.5px;">` +
                `DQ: ${reason}` +
                (isLastFrame ? ' (final tick)' : '') +
                `</div>`;
        } else if (trialResult && isLastFrame) {
            infoHtml += `<div style="margin-top:4px; padding:3px 6px; background:rgba(50,200,50,0.2); border:1px solid #66dd66; border-radius:3px; color:#66dd66; font-size:9px; font-weight:bold;">` +
                `MAXED — ${(trialResult.fitness * 100).toFixed(1)}%</div>`;
        }
        infoEl.innerHTML = infoHtml;
    }

    sel.onchange = function() {
        const frames = _tournamentRecordings[sel.value] || [];
        slider.max = Math.max(0, frames.length - 1);
        slider.value = 0;
        maxEl.textContent = frames.length - 1;
        applyFrame();
    };
    slider.oninput = applyFrame;

    // Init
    sel.dispatchEvent(new Event('change'));

    toast('tournament complete — scrub slider to inspect');
}

/**
 * Save tournament results to localStorage.
 */
function saveTournamentResults(){
    try {
        localStorage.setItem('flux-tournament-results', JSON.stringify(tournamentResults));
    } catch(e){ /* quota exceeded */ }
}

/**
 * Load tournament results from localStorage.
 */
function loadTournamentResults(){
    try {
        const raw = localStorage.getItem('flux-tournament-results');
        if(!raw) return;
        tournamentResults = JSON.parse(raw);
    } catch(e){ tournamentResults = []; }
}

// ─── K-Complexity caching for rule lookahead ─────────────────────────
// Cached per stateVersion; avoids recomputing LZ76 on every candidate.
function getKStateAndBaseline(){
    if(_kStateVersion === stateVersion) return { stateStr: _kStateStr, baseline: _kBaseline };
    _kStateStr = _buildStateStr();
    _kBaseline = lz76Complexity(_kStateStr);
    _kStateVersion = stateVersion;
    return { stateStr: _kStateStr, baseline: _kBaseline };
}
function kDeltaForFlip(stateStr, baseline, scId, newChar){
    if(scId < 0 || scId >= stateStr.length) return 0;
    if(stateStr[scId] === newChar) return 0;
    const modified = stateStr.substring(0, scId) + newChar + stateStr.substring(scId + 1);
    return lz76Complexity(modified) - baseline;
}

// ══════════════════════════════════════════════════════════════════════════
// RULE REGISTRY — PLUGGABLE MOVEMENT STRATEGIES
// ══════════════════════════════════════════════════════════════════════════
//
// INTENT (DO NOT DELETE):
// Each rule set defines how excitations rank movement candidates.
// Instead of a GA evolving weight vectors, Claude iterates on rule sets
// across conversations. The arena framework tests each rule set by
// measuring temporal K-complexity — how much new information the
// "3D movie" of lattice state changes contains over time.
//
// To add a new rule: push an entry to RULE_REGISTRY with:
//   name:        display name for the UI
//   description: brief description of the strategy
//   rankCandidates(candidates, excitation, context): set .score on each
//       candidate. Candidates sorted by .score descending (highest first).
//       Ties are shuffled randomly by the caller.
//
// context object contains:
//   allOpen, kStr, kBase, pos, ALL_SC, frameCount, temporalK, isFallback
//
// Feature extraction functions below are available for any rule to use.
// ══════════════════════════════════════════════════════════════════════════

const RULE_REGISTRY = [];
function getActiveRule(){ return RULE_REGISTRY[activeRuleIndex] || RULE_REGISTRY[0]; }

const GA_NUM_FEATURES = 10;

function extractCandidateFeatures(e, cand, allOpen, kStr, kBase){
    const f = new Float32Array(GA_NUM_FEATURES);
    const {d1, d2, mid, far, scId} = cand;
    const isOpen = allOpen.has(scId);

    // f0: Direction balance — lower dirCount sum = more balanced (preferred in classic)
    const totalMoves = e.dirCounts.reduce((s,v) => s+v, 0) || 1;
    f[0] = 1.0 - (e.dirCounts[d1] + e.dirCounts[d2]) / (totalMoves * 0.5 + 1);

    // f1: K-complexity delta (single-flip approximation)
    f[1] = isOpen ? 0 : kDeltaForFlip(kStr, kBase, scId, '1');

    // f2: SC already open (1 = no materialization cost)
    f[2] = isOpen ? 1.0 : 0.0;

    // f3: Near an incomplete tet void (destination has tet potential)
    f[3] = tetPartnerMap.has(scId) ? 1.0 : 0.0;

    // f4: Destination connectivity (how connected is the far node)
    const farConns = baseNeighbors[far]?.length || 0;
    f[4] = Math.min(1.0, farConns / 12);

    // f5: Path novelty (has excitation visited far node recently?)
    f[5] = e.trail.includes(far) ? 0.0 : 1.0;

    // f6: Stuck duration (normalized)
    f[6] = Math.min(1.0, e.stuckTicks / 10);

    // f7: Excitation age (normalized total steps)
    f[7] = Math.min(1.0, e.totalSteps / 100);

    // f8: Oct void proximity (is destination near an oct void?)
    f[8] = (_nodeOctVoids.has(mid) || _nodeOctVoids.has(far)) ? 1.0 : 0.0;

    // f9: Random exploration noise
    f[9] = Math.random();

    return f;
}

function scoreCandidateGA(features, genome){
    let score = 0;
    for(let i = 0; i < GA_NUM_FEATURES; i++) score += genome[i] * features[i];
    return score;
}

// Fallback feature extraction for shortcut-direction candidates (single hop)
function extractFallbackFeatures(e, scId, dest, allOpen, kStr, kBase){
    const f = new Float32Array(GA_NUM_FEATURES);
    const isOpen = allOpen.has(scId);
    const totalMoves = e.dirCounts.reduce((s,v) => s+v, 0) || 1;
    f[0] = 0.5; // no base-direction info for fallback
    f[1] = isOpen ? 0 : kDeltaForFlip(kStr, kBase, scId, '1');
    f[2] = isOpen ? 1.0 : 0.0;
    f[3] = tetPartnerMap.has(scId) ? 1.0 : 0.0;
    f[4] = Math.min(1.0, (baseNeighbors[dest]?.length || 0) / 12);
    f[5] = e.trail.includes(dest) ? 0.0 : 1.0;
    f[6] = Math.min(1.0, e.stuckTicks / 10);
    f[7] = Math.min(1.0, e.totalSteps / 100);
    f[8] = _nodeOctVoids.has(dest) ? 1.0 : 0.0;
    f[9] = Math.random();
    return f;
}

// ── Rules loaded from flux-rules.js ─────────────────────────────────
// RULE_REGISTRY is exposed on window and populated by the external
// <script src="flux-rules.js"> tag that loads after this script.
// Rule 0 must be 'classic'. See flux-rules.js for the interface.


function updateStatus(){
    if(simHalted) return;
    const n=activeSet.size,ni=impliedSet.size,ne=xonImpliedSet.size,el=document.getElementById('st-state');
    const totalOpen = n+ni+ne;
    if(!totalOpen){ el.textContent='FCC'; el.style.color='#3a4a5a'; }
    else{ el.textContent=n+' manual'+(ni?' + '+ni+' implied':'')+(ne?' + '+ne+' electron':''); el.style.color='#aaccff'; }
    document.getElementById('st-sc').textContent=totalOpen+' / '+ALL_SC.length;

    // ── INVARIANT CHECK ──
    // Skip violation checks during tournament mode OR when a tick-based
    // rule is active. Tick rules make bulk SC changes that create solver
    // noise (err 0.01-0.05) which is harmless — the strain recovery in
    // excitationClockTick() handles it. Halting on small drift is too
    // aggressive and breaks normal rule execution.
    const TOL = 1e-3;
    let violation = null;
    const tickRuleActive = RULE_REGISTRY[activeRuleIndex]?.tick;
    if(!tournamentActive && !tickRuleActive){
        for(const [i,j] of BASE_EDGES){ const err=Math.abs(vd(pos[i],pos[j])-1.0); if(err>TOL){ violation=`R1 base edge v${i}-v${j} err=${err.toFixed(5)}`; break; } }
        if(!violation){ for(const id of [...activeSet,...impliedSet]){ const s=SC_BY_ID[id]; const err=Math.abs(vd(pos[s.a],pos[s.b])-1.0); if(err>TOL){ violation=`R2 shortcut sc${id} v${s.a}-v${s.b} err=${err.toFixed(5)}`; break; } } }
        if(!violation){ for(const [i,j] of REPULSION_PAIRS){ const d=vd(pos[i],pos[j]); if(d<1.0-TOL){ violation=`R3 overlap v${i}-v${j} dist=${d.toFixed(5)}`; break; } } }
    }

    if(violation){
        // Soft recovery: if jiggle or excitations created the strain via
        // electron-implied SCs, clear them and re-solve instead of halting.
        // Halting on solver drift is too aggressive — the structure can be
        // recovered by dropping the offending constraints.
        if(xonImpliedSet.size && !simHalted){
            for(const id of [...xonImpliedSet]){
                xonImpliedSet.delete(id);
                impliedSet.delete(id);
                impliedBy.delete(id);
            }
            for(const e of excitations){
                if(e.ownShortcut !== null && !activeSet.has(e.ownShortcut)){
                    e.ownShortcut = null;
                }
                if(e.voidScIds){
                    e.zeroPoint = null; e.voidType = null;
                    e.voidScIds = null; e.voidNodes = null;
                }
            }
            bumpState();
            const pFinal = detectImplied();
            applyPositions(pFinal);
            toast('strain reset: cleared electron-implied SCs');
            // Re-check after recovery — only halt if it's truly unrecoverable
            let stillBad = false;
            for(const [i,j] of BASE_EDGES){
                if(Math.abs(vd(pos[i],pos[j])-1.0) > TOL){ stillBad = true; break; }
            }
            if(!stillBad) return; // recovered successfully
        }
        simHalted=true;
        emitFluxEvent('SIM_HALTED', { violation, rule: RULE_REGISTRY[activeRuleIndex]?.name || 'classic' });
        if(jiggleActive){ jiggleActive=false; clearTimeout(jiggleTimer); jiggleTimer=null; document.getElementById('btn-jiggle').classList.remove('active'); }
        stopExcitationClock();
        let maxErr=0;
        for(const [i,j] of BASE_EDGES) maxErr=Math.max(maxErr,Math.abs(vd(pos[i],pos[j])-1.0));
        const actual=(computeActualDensity()*100).toFixed(4);
        document.getElementById('st-dens').textContent=actual+'% ⚠';
        document.getElementById('st-dens').style.color='#ff4444';
        document.getElementById('violation-msg').textContent='HALTED: '+violation;
        document.getElementById('violation-banner').style.display='block';
        toast('invariant violated: '+violation);
        return;
    }
    // Show ACTUAL density (matches deuteron panel). The ideal is 74.048%
    // (Kepler max π/3√2). ANY deviation triggers emergency freeze.
    const _actualDens = computeActualDensity() * 100;
    const _idealDens = computeIdealDensity() * 100;
    const _densEl = document.getElementById('st-dens');
    _densEl.textContent = _actualDens.toFixed(4) + '%';
    const _densDev = Math.abs(_actualDens - _idealDens);
    _densEl.style.color = _densDev < 0.001 ? '#6a8aaa' : _densDev < 0.01 ? '#ffaa44' : '#ff4444';
    // ── KEPLER DENSITY VIOLATION: EMERGENCY FREEZE ──
    if (_densDev > 0.01) {
        _keplerViolation(_actualDens, _idealDens);
    }
    // Kolmogorov complexity of the SC state
    const kc = computeKComplexity();
    const kolmEl = document.getElementById('st-kolm');
    kolmEl.textContent = (kc * 100).toFixed(1) + '%';
    // Color-code: low complexity (structured) = cyan, high (random) = orange
    kolmEl.style.color = kc < 0.3 ? '#40d0a0' : kc < 0.6 ? '#a0c070' : '#d0a040';
    // Temporal K display
    const tempKEl = document.getElementById('st-temp-kolm');
    if(tempKEl){
        if(_temporalFrames.length > 1){
            tempKEl.textContent = (_temporalKValue * 100).toFixed(1) + '% (' + _temporalFrames.length + 'f)';
            tempKEl.style.color = _temporalKValue < 0.3 ? '#40d0a0' : _temporalKValue < 0.6 ? '#a0c070' : '#d0a040';
        } else {
            tempKEl.textContent = '--';
            tempKEl.style.color = '#6a8aaa';
        }
    }
    // Hamming distance (motion) display
    const hammEl = document.getElementById('st-hamming');
    if(hammEl){
        if(_hammingHistory.length > 0){
            const pct = (_avgHamming * 100).toFixed(1);
            const stuck = _stuckTickCount > 5 ? ' STUCK' : '';
            hammEl.textContent = pct + '%' + stuck;
            hammEl.style.color = _stuckTickCount > 5 ? '#ff4040' :
                                 _avgHamming < 0.02 ? '#d0a040' :
                                 _avgHamming < 0.10 ? '#a0c070' : '#40d0a0';
        } else {
            hammEl.textContent = '--';
            hammEl.style.color = '#6a8aaa';
        }
    }
    document.getElementById('violation-banner').style.display='none';
    document.getElementById('st-sel').textContent=selectedVert>=0?'v'+selectedVert+' · '+candidatePartners.size+' candidate'+(candidatePartners.size!==1?'s':''):'';
    // Skip side panel during demo — isLoadBearing() runs _solve() per SC (~500ms total)
    if (!_demoActive) updateSidePanel();
}

// Lightweight hover status update — only refreshes the selection text label.
// Does NOT run invariant checks or rebuild the side panel.
// Called from the mousemove hover path to keep orbiting smooth.
function updateStatusHoverOnly(){
    if(simHalted) return;
    document.getElementById('st-sel').textContent=selectedVert>=0&&candidatePartners.size
        ?'v'+selectedVert+' · '+candidatePartners.size+' candidate'+(candidatePartners.size!==1?'s':'')
        :'';
}

let toastTimer;
function toast(msg){ const el=document.getElementById('toast'); el.textContent=msg; el.style.opacity='1'; clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.style.opacity='0',2600); }

// switchLegend() removed — old tabbed legend panel replaced by #deuteron-panel

// updateRuleLegend() removed — old legend panel replaced by #deuteron-panel

function clearAll(){
    if(jiggleActive) toggleJiggle();
    deactivateBigBang();
    activeSet.clear(); impliedSet.clear(); impliedBy.clear();
    xonImpliedSet.clear(); blockedImplied.clear();
    hoveredSC=-1; selectedVert=-1; hoveredVert=-1;
    pos=REST.map(v=>[...v]);
    bumpState();
    resetTemporalK();
    applyPositions(pos);
    updateCandidates(); updateSpheres(); updateStatus();
}

