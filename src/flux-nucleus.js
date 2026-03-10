// flux-nucleus.js — NucleusSimulator IIFE + Big Bang menu
// ═══════════════════════════════════════════════════════════════════════════
// V2 POST-LOAD: NucleusSimulator + Big Bang Menu + Init
// Runs AFTER flux-rules-v2.js loads (RULE_REGISTRY is available)
// ═══════════════════════════════════════════════════════════════════════════

// ── V2 init (rule title + model selector) ──
(function(){
    const el = document.getElementById('rule-title');
    if(el && typeof RULE_REGISTRY !== 'undefined' && typeof activeRuleIndex !== 'undefined'){
        el.textContent = RULE_REGISTRY[activeRuleIndex]?.name || '';
    }
})();

// ── Big Bang Dropdown Menu ──
(function(){
    const menu = document.getElementById('big-bang-menu');
    const btn = document.getElementById('btn-big-bang');
    if(!menu || !btn || typeof RULE_REGISTRY === 'undefined') return;

    // Populate menu items from RULE_REGISTRY
    for(let i = 0; i < RULE_REGISTRY.length; i++){
        const r = RULE_REGISTRY[i];
        if(r.name === 'nucleus-sustain') continue; // not a big bang algo
        const item = document.createElement('div');
        item.style.cssText = 'padding:4px 8px; cursor:pointer; color:#9abccc; border-bottom:1px solid rgba(100,150,180,0.1); transition:background 0.15s;';
        item.textContent = r.name;
        item.title = r.description || '';
        item.addEventListener('mouseenter', () => { item.style.background = 'rgba(40,60,80,0.6)'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'none'; });
        item.addEventListener('click', (function(idx){
            return function(){
                menu.style.display = 'none';
                // Deactivate nucleus mode if active
                if(typeof NucleusSimulator !== 'undefined' && NucleusSimulator.active){
                    NucleusSimulator.deactivate();
                }
                activeRuleIndex = idx;
                const titleEl = document.getElementById('rule-title');
                if(titleEl) titleEl.textContent = RULE_REGISTRY[idx]?.name || '';
                if(typeof toggleBigBang === 'function') toggleBigBang();
            };
        })(i));
        menu.appendChild(item);
    }

    // Toggle menu on button click
    btn.addEventListener('click', function(e){
        e.stopPropagation();
        // If rebang is active, stop it first
        if(typeof bigBangActive !== 'undefined' && bigBangActive){
            if(typeof deactivateBigBang === 'function') deactivateBigBang();
            menu.style.display = 'none';
            return;
        }
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    // Close menu on outside click
    document.addEventListener('click', (e) => {
        if(!menu.contains(e.target) && e.target !== btn){
            menu.style.display = 'none';
        }
    });
})();

// ═══════════════════════════════════════════════════════════════════════════
// NUCLEUS SIMULATOR MODULE — V2 Emergent Tournament Architecture
// ═══════════════════════════════════════════════════════════════════════════
const NucleusSimulator = (function(){

    // ── Private state ──
    let _active = false;
    let _quarkExcitations = [];  // excitation refs tagged as quarks
    let _prevRuleIndex = -1;

    // ── Find center node (closest to origin) ──
    function _findCenterNode(){
        let best = 0, bestDist = Infinity;
        for(let i = 0; i < pos.length; i++){
            const p = pos[i];
            const d = Math.sqrt(p[0]*p[0] + p[1]*p[1] + p[2]*p[2]);
            if(d < bestDist){ bestDist = d; best = i; }
        }
        return best;
    }

    // ── Build setup context for model.setup() ──
    function buildSetupCtx(){
        return {
            createQuark(nodeIdx, hexColor, meta){
                if(typeof _createExcitation !== 'function') return null;
                const e = _createExcitation(nodeIdx, hexColor);
                if(!e) return null;
                e._isQuark = true;
                e._quarkType = meta?.type || 'up';
                e._colorCharge = meta?.colorCharge ?? 0;
                e._direction = meta?.direction || 1;
                e._label = meta?.label || 'q';
                e._quarkIdx = _quarkExcitations.length;
                e._isVirtual = false;
                e._lifetime = Infinity;
                e._visitedNodes = new Set();
                e._lockedSCs = new Set();
                _quarkExcitations.push(e);
                return e;
            },
            createVirtualPair(nodeIdx, lifetime){
                if(typeof _createExcitation !== 'function') return [null, null];
                const lt = lifetime || 10;
                // Particle
                const q = _createExcitation(nodeIdx, 0x666666);
                if(q){
                    q._isQuark = true;
                    q._isVirtual = true;
                    q._lifetime = lt;
                    q._direction = 1;
                    q._quarkType = 'virtual';
                    q._colorCharge = Math.floor(Math.random() * 3);
                    q._label = 'vq';
                    q._quarkIdx = _quarkExcitations.length;
                    if(q.sparkMat) q.sparkMat.opacity = 0.4;
                    if(q.spark) q.spark.scale.set(0.15, 0.15, 1);
                    _quarkExcitations.push(q);
                }
                // Anti-particle (opposite direction)
                const aq = _createExcitation(nodeIdx, 0x444444);
                if(aq){
                    aq._isQuark = true;
                    aq._isVirtual = true;
                    aq._lifetime = lt;
                    aq._direction = -1;
                    aq._quarkType = 'virtual-anti';
                    aq._colorCharge = Math.floor(Math.random() * 3);
                    aq._label = 'vaq';
                    aq._quarkIdx = _quarkExcitations.length;
                    if(aq.sparkMat) aq.sparkMat.opacity = 0.3;
                    if(aq.spark) aq.spark.scale.set(0.12, 0.12, 1);
                    _quarkExcitations.push(aq);
                }
                return [q, aq];
            },
            pos: pos,
            nodeCount: pos.length,
            centerNode: _findCenterNode(),
            voidData: voidNeighborData,
            nodeTetVoids: _nodeTetVoids,
            nodeOctVoids: _nodeOctVoids,
            basePosNeighbor: basePosNeighbor,
            activateSC(scId){ activeSet.add(scId); },
            deactivateSC(scId){ activeSet.delete(scId); },
        };
    }

    // ── Count emergent oct voids (naturally formed, not force-actualized) ──
    function countEmergentOctVoids(){
        let count = 0;
        const allOpen = new Set([...activeSet, ...impliedSet, ...xonImpliedSet]);
        for(let vi = 0; vi < voidNeighborData.length; vi++){
            const v = voidNeighborData[vi];
            if(v.type !== 'oct') continue;
            if(vi === _octVoidIdx) continue; // skip nucleus oct (always rendered)
            if(v.scIds && v.scIds.every(id => allOpen.has(id))) count++;
        }
        return count;
    }

    // ── Compute quark spread (avg distance from centroid) ──
    function computeQuarkSpread(){
        const stable = _quarkExcitations.filter(q => !q._isVirtual && q.node !== undefined);
        if(stable.length === 0) return 0;
        let cx=0, cy=0, cz=0;
        for(const q of stable){
            cx += pos[q.node][0]; cy += pos[q.node][1]; cz += pos[q.node][2];
        }
        cx /= stable.length; cy /= stable.length; cz /= stable.length;
        let totalDist = 0;
        for(const q of stable){
            const dx = pos[q.node][0]-cx, dy = pos[q.node][1]-cy, dz = pos[q.node][2]-cz;
            totalDist += Math.sqrt(dx*dx + dy*dy + dz*dz);
        }
        return totalDist / stable.length;
    }

    // ── Count bound quarks (stable quarks still near centroid) ──
    function countBoundQuarks(){
        const stable = _quarkExcitations.filter(q => !q._isVirtual && q.node !== undefined);
        if(stable.length === 0) return 0;
        let cx=0, cy=0, cz=0;
        for(const q of stable){
            cx += pos[q.node][0]; cy += pos[q.node][1]; cz += pos[q.node][2];
        }
        cx /= stable.length; cy /= stable.length; cz /= stable.length;
        let bound = 0;
        for(const q of stable){
            const dx = pos[q.node][0]-cx, dy = pos[q.node][1]-cy, dz = pos[q.node][2]-cz;
            if(Math.sqrt(dx*dx + dy*dy + dz*dz) < 5.0) bound++;
        }
        return bound;
    }

    // ── Enter nucleus UI mode ──
    function enterNucleusMode(){
        // Hide jiggle + lifespan but keep lattice slider visible
        const jigRow = document.getElementById('jiggle-row');
        if(jigRow) jigRow.style.display = 'none';
        // Hide only + excitation / big bang, keep select + export visible
        const sa = document.getElementById('side-actions');
        if(sa) sa.style.display = 'none';
        document.getElementById('nucleus-info').style.display = 'block';
        document.getElementById('nucleus-metrics').style.display = 'block';
        document.getElementById('btn-nucleus-pause').style.display = '';
        // Show the new deuteron panel (left side)
        const dp = document.getElementById('deuteron-panel');
        if(dp) dp.style.display = 'block';
        // Unify: move bottom-stats into deuteron-panel so they don't overlap
        const bs = document.getElementById('bottom-stats');
        if(bs && dp) { dp.appendChild(bs); bs.classList.add('inline'); }
        // Populate quark color legend once on enter
        _populateDeuteronQuarkLegend();

        // (pattern demo button removed — demo is the simulate button now)

        // Visual defaults for nucleus mode: translucent spheres + graph + shapes
        const sphereSlider = document.getElementById('sphere-opacity-slider');
        if(sphereSlider){ sphereSlider.value = 5; sphereSlider.dispatchEvent(new Event('input')); }
        const graphSlider = document.getElementById('graph-opacity-slider');
        if(graphSlider){ graphSlider.value = 5; graphSlider.dispatchEvent(new Event('input')); }
        const shapesSlider = document.getElementById('void-opacity-slider');
        if(shapesSlider){ shapesSlider.value = 5; shapesSlider.dispatchEvent(new Event('input')); }
        // Speed default = slowest (600ms interval) for detailed observation
        const speedSlider = document.getElementById('excitation-speed-slider');
        if(speedSlider){ speedSlider.value = 1; speedSlider.dispatchEvent(new Event('input')); }
    }

    // ── Exit nucleus UI mode ──
    function exitNucleusMode(){
        const jigRow = document.getElementById('jiggle-row');
        if(jigRow) jigRow.style.display = '';
        const sa = document.getElementById('side-actions');
        if(sa) sa.style.display = '';
        document.getElementById('nucleus-info').style.display = 'none';
        document.getElementById('nucleus-metrics').style.display = 'none';
        document.getElementById('btn-nucleus-pause').style.display = 'none';
        document.getElementById('nucleus-status').textContent = 'ready';
        const ts = document.getElementById('tournament-status');
        if(ts) ts.style.display = 'none';
        // Hide the deuteron panel + pattern demo
        const dp = document.getElementById('deuteron-panel');
        if(dp) dp.style.display = 'none';
        // Move bottom-stats back to body as standalone fixed panel
        const bs = document.getElementById('bottom-stats');
        if(bs) { document.body.appendChild(bs); bs.classList.remove('inline'); }
        if (_demoActive) stopDemo();
        // Restore visual defaults
        const sphereSlider = document.getElementById('sphere-opacity-slider');
        if(sphereSlider){ sphereSlider.value = 50; sphereSlider.dispatchEvent(new Event('input')); }
        const graphSlider = document.getElementById('graph-opacity-slider');
        if(graphSlider){ graphSlider.value = 50; graphSlider.dispatchEvent(new Event('input')); }
        const speedSlider = document.getElementById('excitation-speed-slider');
        if(speedSlider){ speedSlider.value = 100; speedSlider.dispatchEvent(new Event('input')); }
    }

    // ── Populate model selector from RULE_REGISTRY ──
    function populateModelSelect(){
        const sel = document.getElementById('model-select');
        if(!sel) return;
        sel.innerHTML = '';
        for(let i = 0; i < RULE_REGISTRY.length; i++){
            const rule = RULE_REGISTRY[i];
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = rule.name;
            sel.appendChild(opt);
        }
        _updateModelDesc();
    }

    function _updateModelDesc(){
        const sel = document.getElementById('model-select');
        const desc = document.getElementById('model-desc');
        if(!sel || !desc) return;
        const rule = RULE_REGISTRY[+sel.value];
        desc.textContent = rule?.description || '';
    }

    // ── Main: simulate nucleus ──
    // Bottom-up approach: actualize a single central oct void on L2 lattice
    function simulateNucleus(){
        const statusEl = document.getElementById('nucleus-status');
        if(statusEl) statusEl.textContent = 'initializing...';

        // 1. Use current lattice slider value (set by _setDemoLattice or default)
        // Do NOT hardcode — lattice toggle buttons set the slider before calling this
        if(typeof updateLatticeLevel === 'function') updateLatticeLevel();

        // 2. Clear state
        activeSet.clear();
        if(typeof impliedSet !== 'undefined') impliedSet.clear();
        if(typeof xonImpliedSet !== 'undefined') xonImpliedSet.clear();
        if(typeof blockedImplied !== 'undefined') blockedImplied.clear();
        if(typeof impliedBy !== 'undefined') impliedBy.clear();
        _quarkExcitations = [];

        // 3. Save previous rule index
        _prevRuleIndex = activeRuleIndex;
        activeRuleIndex = 0; // use first rule (will evolve)

        // 4. Find center node — oct formation is discovered by the choreography
        //    at tick 1. Tick 0 sends 4 xons below center (z-axis) to form the equator.
        const center = _findCenterNode();
        _octSeedCenter = center;
        _octNodeSet = null;
        _octSCIds = [];
        _octEquatorCycle = [];
        _octCageSCCycle = [];
        _octAntipodal = new Map();
        _octVoidIdx = -1;
        _nucleusTetFaceData = {};

        console.log(`[nucleus] Center=${center}, oct will be discovered by choreography at tick 1`);

        // 5. Solver (no SCs yet — just base lattice)
        bumpState();
        const pFinal = detectImplied();
        applyPositions(pFinal);

        // 8. Start clock
        if(typeof startExcitationClock === 'function') startExcitationClock();

        // 9. UI updates
        _active = true;
        enterNucleusMode();
        _updateNucleusInfo();

        const titleEl = document.getElementById('rule-title');
        if(titleEl) titleEl.textContent = 'NUCLEUS: DEUTERON';

        if(typeof updateVoidSpheres === 'function') updateVoidSpheres();
        if(typeof updateCandidates === 'function') updateCandidates();
        if(typeof updateSpheres === 'function') updateSpheres();
        if(typeof updateStatus === 'function') updateStatus();
        if(typeof rebuildShortcutLines === 'function') rebuildShortcutLines();

        if(statusEl) statusEl.textContent = 'running: deuteron (6 quarks)';
    }

    // ── Update nucleus info display (right panel — minimal) ──
    function _updateNucleusInfo(){
        const el = document.getElementById('nucleus-info');
        if(!el) return;
        el.style.display = 'block';
        const stableX = _quarkExcitations.filter(q => !q._isVirtual);
        const virtualX = _quarkExcitations.filter(q => q._isVirtual);
        el.innerHTML = `<strong style="color:#d4b884">DEUTERON (H-2)</strong><br>`
            + `quarks = 8 tets · xons: ${stableX.length} active${virtualX.length > 0 ? ` + ${virtualX.length} virtual` : ''}<br>`
            + `lattice: L${typeof latticeLevel !== 'undefined' ? latticeLevel : '?'} (${typeof N !== 'undefined' ? N : '?'} nodes)`;
    }

    // ── Deuteron panel: populate quark/tet color legend (called once) ──
    function _populateDeuteronQuarkLegend(){
        const el = document.getElementById('dp-quark-legend');
        if(!el) return;
        const toHex = c => '#' + c.toString(16).padStart(6, '0');
        const entries = [
            { label: 'proton up',   color: 0xffdd44 },
            { label: 'proton down', color: 0x44cc66 },
            { label: 'neutron up',  color: 0x4488ff },
            { label: 'neutron down', color: 0xff4444 },
            { label: 'bosonic',     color: 0xffffff },
            { label: 'weak',        color: 0xcc44ff },
        ];
        let html = `<div style="font-size:7px; color:#ccc; margin-bottom:2px;">xon types:</div>`;
        for(const e of entries){
            html += `<div style="display:flex; align-items:center; gap:4px; font-size:8px;">`
                + `<span style="display:inline-block; width:8px; height:8px; background:${toHex(e.color)}; border-radius:2px;"></span>`
                + `<span style="color:${toHex(e.color)};">${e.label}</span></div>`;
        }
        el.innerHTML = html;
    }

    // ── Deuteron panel: update density display ──
    function _updateDeuteronDensity(){
        const valEl = document.getElementById('dp-density-val');
        const alarmEl = document.getElementById('dp-density-alarm');
        if(!valEl) return;
        const actual = computeActualDensity() * 100;
        const ideal = computeIdealDensity() * 100;
        const deviation = Math.abs(actual - ideal);
        valEl.textContent = actual.toFixed(4) + '%';
        if(deviation > 0.01){
            valEl.style.color = '#ff6644';
            if(alarmEl) alarmEl.style.display = 'inline';
        } else {
            valEl.style.color = '#66dd66';
            if(alarmEl) alarmEl.style.display = 'none';
        }
    }

    // ── Deuteron panel: update sync health indicator ──
    function _updateDeuteronSync(){
        const dotEl = document.getElementById('dp-sync-dot');
        const labelEl = document.getElementById('dp-sync-label');
        const detailEl = document.getElementById('dp-sync-detail');
        if(!dotEl || !labelEl) return;
        if(_syncStatus === 'ok'){
            dotEl.style.background = '#44dd44';
            labelEl.style.color = '#66dd66';
            labelEl.textContent = 'OK';
        } else if(_syncStatus === 'warn'){
            dotEl.style.background = '#dddd44';
            labelEl.style.color = '#dddd66';
            labelEl.textContent = 'DRIFT';
        } else {
            dotEl.style.background = '#dd4444';
            labelEl.style.color = '#ff6666';
            labelEl.textContent = 'DESYNC';
        }
        if(detailEl) detailEl.textContent = _syncMaxDeviation > 0 ? `Δ${_syncMaxDeviation.toFixed(4)}` : '';
    }

    // ── Deuteron panel: update face coverage bars ──
    // Per-face coverage by tet quark type (the quark IS the tet).
    // 4 bars per face: p-up (yellow), p-down (green), n-up (blue), n-down (red).
    // Only counts when tet is FULLY ACTUALIZED (both SCs open).
    // Keys: type_face (e.g. 'pu_1', 'nd_5')
    const _FACE_QUARK_TYPE = {
        1:'pu', 3:'pu', 6:'pd', 8:'pd',
        2:'nu', 4:'nu', 5:'nd', 7:'nd',
    };
    const _TYPE_COLORS = { pu:'#ddcc44', pd:'#44cc66', nu:'#4488ff', nd:'#ff4444' };
    const _TYPE_LABELS = { pu:'p\u2191', pd:'p\u2193', nu:'n\u2191', nd:'n\u2193' };

    function _updateDeuteronCoverage(){
        const el = document.getElementById('dp-coverage-bars');
        if(!el) return;
        const allOpen = getAllOpen();
        // Bosonic cage must be intact for coverage to count
        const cageIntact = _octSCIds.length > 0 && _octSCIds.every(id => allOpen.has(id));
        if(!cageIntact) return;
        // Accumulate per-face coverage by tet quark type
        for(const q of _quarkExcitations){
            if(q._currentFace === undefined) continue;
            const fd = _nucleusTetFaceData[q._currentFace];
            if(!fd) continue;
            const tetActualized = fd.scIds.every(id => allOpen.has(id));
            if(!tetActualized) continue;
            const qType = _FACE_QUARK_TYPE[q._currentFace] || 'pu';
            const key = qType + '_' + q._currentFace;
            _faceCoverageTotal[key] = (_faceCoverageTotal[key] || 0) + 1;
        }
        // Find max for normalization
        let maxCount = 1;
        for(let f = 1; f <= 8; f++){
            for(const t of ['pu','pd','nu','nd']){
                maxCount = Math.max(maxCount, _faceCoverageTotal[t + '_' + f] || 0);
            }
        }
        // Build bars: 4 bars per face (y g b r)
        let html = '';
        for(let f = 1; f <= 8; f++){
            const isGroupA = [1,3,6,8].includes(f);
            const pu = _faceCoverageTotal['pu_' + f] || 0;
            const pd = _faceCoverageTotal['pd_' + f] || 0;
            const nu = _faceCoverageTotal['nu_' + f] || 0;
            const nd = _faceCoverageTotal['nd_' + f] || 0;
            html += `<div style="display:flex; align-items:center; gap:2px;">`
                + `<span style="width:16px; color:${isGroupA ? '#cc8866' : '#6688aa'}; font-size:7px;">F${f}</span>`
                + `<div class="dp-bar-bg" style="flex:1;" title="p\u2191 ${pu}"><div class="dp-bar-fill" style="width:${(pu/maxCount*100).toFixed(1)}%; background:#ddcc44;"></div></div>`
                + `<div class="dp-bar-bg" style="flex:1;" title="p\u2193 ${pd}"><div class="dp-bar-fill" style="width:${(pd/maxCount*100).toFixed(1)}%; background:#44cc66;"></div></div>`
                + `<div class="dp-bar-bg" style="flex:1;" title="n\u2191 ${nu}"><div class="dp-bar-fill" style="width:${(nu/maxCount*100).toFixed(1)}%; background:#4488ff;"></div></div>`
                + `<div class="dp-bar-bg" style="flex:1;" title="n\u2193 ${nd}"><div class="dp-bar-fill" style="width:${(nd/maxCount*100).toFixed(1)}%; background:#ff4444;"></div></div>`
                + `</div>`;
        }
        el.innerHTML = html;
    }

    // ── Deuteron panel: master update (called each tick) ──
    function _updateDeuteronPanel(){
        if(!_active) return;
        _updateDeuteronDensity();
        _updateDeuteronSync();
        _updateDeuteronCoverage();
    }

    // ── Update observable metrics ──
    function updateMetrics(){
        const el = document.getElementById('nucleus-metrics');
        if(!el || !_active) return;
        el.style.display = 'block';
        const octCount = countEmergentOctVoids();
        const spread = computeQuarkSpread().toFixed(2);
        const bound = countBoundQuarks();
        const stableQ = _quarkExcitations.filter(q => !q._isVirtual).length;
        const virtualQ = _quarkExcitations.filter(q => q._isVirtual).length;
        el.innerHTML =
            `oct voids: <span style="color:${octCount > 0 ? '#66dd66' : '#aa6666'}">${octCount} emergent</span><br>` +
            `quarks: ${bound}/${stableQ} bound · spread: ${spread}<br>` +
            `${virtualQ > 0 ? `virtual sea: ${virtualQ} active<br>` : ''}` +
            `tick: <span style="color:#d4b884">${_nucleusTick}</span> · ` +
            `motion: <span style="color:#8aacbf">${typeof _avgHamming !== 'undefined' ? (_avgHamming*100).toFixed(1)+'%' : '--'}</span>`;
    }

    // ── Deactivate nucleus mode ──
    function deactivate(){
        _active = false;
        _quarkExcitations = [];
        _nucleusTetFaceData = {};
        _faceCoverageTotal = {};
        _syncMaxDeviation = 0;
        _syncStatus = 'ok';
        if(tournamentActive && !_tournamentInstalling) stopTournament();

        if(_prevRuleIndex >= 0){
            activeRuleIndex = _prevRuleIndex;
            _prevRuleIndex = -1;
        }

        exitNucleusMode();
        const titleEl = document.getElementById('rule-title');
        if(titleEl) titleEl.textContent = RULE_REGISTRY[activeRuleIndex]?.name || '';
    }

    // ── Public API ──
    return {
        get active(){ return _active; },
        get quarkExcitations(){ return _quarkExcitations; },
        set quarkExcitations(v){ _quarkExcitations = v; },
        buildSetupCtx,
        populateModelSelect,
        simulateNucleus,
        updateMetrics,
        deactivate,
        countEmergentOctVoids,
        computeQuarkSpread,
        countBoundQuarks,
        enterNucleusMode,
        exitNucleusMode,
        updateDeuteronPanel: _updateDeuteronPanel,
    };
})();
window.NucleusSimulator = NucleusSimulator;

