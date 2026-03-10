// flux-ui.js — Jiggle, export, side panel, raycasting, camera
// ─── Jiggle mode ──────────────────────────────────────────────────────────────
let jiggleActive=false, jiggleTimer=null, jiggleMs=Math.round(1000/30);
function toggleJiggle(){
    jiggleActive=!jiggleActive;
    document.getElementById('btn-jiggle').classList.toggle('active',jiggleActive);
    document.getElementById('side-shortcuts').classList.toggle('jiggle-hidden',jiggleActive);
    document.getElementById('side-actions').classList.toggle('jiggle-hidden',jiggleActive);
    if(jiggleActive){ scheduleJiggle(); }
    else{ clearTimeout(jiggleTimer); jiggleTimer=null; }
}
function updateJiggleSpeed(){ const hz=+document.getElementById('jiggle-slider').value; document.getElementById('jiggle-hz').textContent=hz+'/s'; jiggleMs=Math.round(1000/hz); }
function updateEnergy(){
    excitationEnergy = +document.getElementById('energy-slider').value / 100;
    const avgLifespan = 8 + Math.round(excitationEnergy * 72);
    document.getElementById('energy-val').textContent = avgLifespan;
}

function updateGraphOpacity(){
    const pct=+document.getElementById('graph-opacity-slider').value;
    document.getElementById('graph-opacity-val').textContent=pct+'%';
    const op=pct/100;
    if(_baseLineMat){ _baseLineMat.opacity=op; _baseLineMat.needsUpdate=true; }
    Object.values(scLineObjs).forEach(o=>{ o.mat.opacity=o.implied?op*0.55:op; o.mat.needsUpdate=true; });
}
let _statusTimer=null;
function setStatus(msg,ms=2500){
    const el=document.getElementById('hint');
    el.textContent=msg; el.style.color='#ff9955';
    clearTimeout(_statusTimer);
    _statusTimer=setTimeout(()=>{ el.style.color=''; el.textContent=placingExcitation?'click a node to place excitation \u00b7 Escape to cancel':'click sphere to select \u00b7 click candidate (blue) to add shortcut \u00b7 click edge to sever'; },ms);
}
function scheduleJiggle(){
    if(!jiggleActive||simHalted) return;
    // When excitations are running, jiggle is driven by excitationClockTick instead
    if(excitations.length) return;
    jiggleTimer=setTimeout(()=>{ jiggleStep(); scheduleJiggle(); },jiggleMs);
}
function jiggleStep(){
    // Jiggle uses xonImpliedSet (not activeSet) so excitations and
    // the strain monitor can update/sever jiggle shortcuts as needed.
    const allOpen = getAllOpen();
    const density = allOpen.size / ALL_SC.length;
    const doAdd = allOpen.size === 0 || Math.random() > density;
    let acted = false;
    if(doAdd){
        const inactive = ALL_SC.filter(s => !allOpen.has(s.id));
        for(let i=inactive.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1));[inactive[i],inactive[j]]=[inactive[j],inactive[i]]; }
        for(const sc of inactive){
            if(canMaterialiseQuick(sc.id)){
                xonImpliedSet.add(sc.id);
                impliedSet.add(sc.id);
                if(!impliedBy.has(sc.id)) impliedBy.set(sc.id, new Set());
                acted=true; break;
            }
        }
    } else {
        // Try removing a random electron-implied SC (jiggle's own shortcuts)
        const canRemove = [...xonImpliedSet];
        if(canRemove.length){
            for(let i=canRemove.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1));[canRemove[i],canRemove[j]]=[canRemove[j],canRemove[i]]; }
            for(const id of canRemove){
                const pairs = [];
                activeSet.forEach(aid=>{ const s=SC_BY_ID[aid]; pairs.push([s.a,s.b]); });
                xonImpliedSet.forEach(eid=>{ if(eid!==id){ const s=SC_BY_ID[eid]; pairs.push([s.a,s.b]); } });
                if(_solve(pairs).converged){
                    xonImpliedSet.delete(id);
                    // Clear void state on any excitation that used this shortcut
                    for(const e of excitations){
                        if(e.ownShortcut === id) e.ownShortcut = null;
                        if(e.voidScIds && e.voidScIds.includes(id)){
                            e.zeroPoint = null; e.voidType = null; e.voidScIds = null; e.voidNodes = null;
                        }
                    }
                    acted = true; break;
                }
            }
        }
    }
    // When stuck, remove one random shortcut instead of clearing everything
    if(!acted && xonImpliedSet.size > 0){
        const arr = [...xonImpliedSet];
        const id = arr[Math.floor(Math.random() * arr.length)];
        xonImpliedSet.delete(id);
        for(const e of excitations){
            if(e.ownShortcut === id) e.ownShortcut = null;
            if(e.voidScIds && e.voidScIds.includes(id)){
                e.zeroPoint = null; e.voidType = null; e.voidScIds = null; e.voidNodes = null;
            }
        }
    }
    // Snapshot state before cascade — detectImplied may push cumulative
    // strain past the halt threshold even though the individual SC passed
    // canMaterialiseQuick. We solve first, check strain, and only commit
    // if the result is safe. This prevents physicsUpdate → updateStatus
    // from halting on a temporarily-bad state we'd otherwise rollback.
    const snapEI = new Set(xonImpliedSet);
    const snapImplied = new Set(impliedSet);
    const snapImpliedBy = new Map([...impliedBy].map(([k,v]) => [k, new Set(v)]));
    const snapPos = pos.map(p => [p[0], p[1], p[2]]);

    bumpState();
    const pFinal = detectImplied();
    applyPositions(pFinal);

    // Strain check BEFORE calling updateStatus (which would halt)
    const JIGGLE_HALT_TOL = 5e-4;
    let worstErr = 0;
    for(const [i,j] of BASE_EDGES){
        const err = Math.abs(vd(pos[i], pos[j]) - 1.0);
        if(err > worstErr) worstErr = err;
    }
    if(worstErr > JIGGLE_HALT_TOL){
        // Rollback: restore full state
        xonImpliedSet.clear(); snapEI.forEach(id => xonImpliedSet.add(id));
        impliedSet.clear(); snapImplied.forEach(id => impliedSet.add(id));
        impliedBy.clear(); for(const [k,v] of snapImpliedBy) impliedBy.set(k, v);
        for(let i = 0; i < N; i++){ pos[i][0]=snapPos[i][0]; pos[i][1]=snapPos[i][1]; pos[i][2]=snapPos[i][2]; }
        bumpState();
        rebuildBaseLines(); rebuildShortcutLines();
    }
    // Always rebuild graph lines when positions change — ensures
    // base edges and shortcuts stay in sync with sphere positions.
    // Without this, the deferred UI path inside excitationClockTick can
    // cause spheres to update (via updateSpheres below) while graph
    // lines wait for the deferred flush, creating a visual desync.
    rebuildBaseLines(); rebuildShortcutLines();
    updateVoidSpheres(); updateCandidates(); updateSpheres(); updateStatus();
}

// ─── Export ───────────────────────────────────────────────────────────────────
function buildExportData(){
    const active=[...activeSet].map(id=>{ const s=SC_BY_ID[id]; return {id,a:s.a,b:s.b,stype:s.stype}; });
    const implied=[...impliedSet].map(id=>{ const s=SC_BY_ID[id]; const parents=[...(impliedBy.get(id)||[])].map(pid=>{ const ps=SC_BY_ID[pid]; return {id:pid,a:ps.a,b:ps.b}; }); return {id,a:s.a,b:s.b,stype:s.stype,impliedBy:parents}; });
    // Candidate solver skipped — O(N²) solve per shortcut is too slow at L2+.
    const candidates=ALL_SC.filter(s=>!activeSet.has(s.id)&&!impliedSet.has(s.id)).map(s=>({id:s.id,a:s.a,b:s.b,stype:s.stype,allowed:null,minSep:null}));
    const positions=pos.map(([x,y,z])=>({x:+x.toFixed(6),y:+y.toFixed(6),z:+z.toFixed(6)}));
    const activePairs=[...activeSet].map(id=>{ const s=SC_BY_ID[id]; return [s.a,s.b]; });
    const impliedPairs=[...impliedSet].map(id=>{ const s=SC_BY_ID[id]; return [s.a,s.b]; });
    const electronPairs=[...xonImpliedSet].map(id=>{ const s=SC_BY_ID[id]; return [s.a,s.b]; });
    const {converged:activeConverged}=_solve(activePairs);
    const {converged:fullConverged}=_solve([...activePairs,...impliedPairs,...electronPairs]);
    let maxBaseErr=0,worstBase=null;
    for(const [i,j] of BASE_EDGES){ const e=Math.abs(vd(pos[i],pos[j])-1); if(e>maxBaseErr){ maxBaseErr=e; worstBase={i,j,d:+vd(pos[i],pos[j]).toFixed(8),err:+e.toFixed(8)}; } }
    let maxSCErr=0,worstSC=null;
    for(const id of [...activeSet,...impliedSet]){ const s=SC_BY_ID[id]; const e=Math.abs(vd(pos[s.a],pos[s.b])-1); if(e>maxSCErr){ maxSCErr=e; worstSC={id,a:s.a,b:s.b,d:+vd(pos[s.a],pos[s.b]).toFixed(8),err:+e.toFixed(8)}; } }
    let minSep=Infinity,worstSep=null;
    for(const [i,j] of REPULSION_PAIRS){ const d=vd(pos[i],pos[j]); if(d<minSep){ minSep=d; worstSep={i,j,d:+d.toFixed(8)}; } }
    const violated=maxBaseErr>1e-3?'R1':maxSCErr>1e-3?'R2':minSep<1-1e-3?'R3':null;
    let minimalBadSubset=null;
    if(!activeConverged&&activePairs.length<=12){ const ids=[...activeSet]; outer: for(let size=2;size<=ids.length;size++){ const idx=Array.from({length:size},(_,i)=>i); while(true){ const sub=idx.map(i=>ids[i]); const sp=sub.map(id=>{ const s=SC_BY_ID[id]; return [s.a,s.b]; }); if(!_solve(sp).converged){ minimalBadSubset=sub.map(id=>{ const s=SC_BY_ID[id]; return {id,a:s.a,b:s.b}; }); break outer; } let i=size-1; while(i>=0&&idx[i]===ids.length-size+i) i--; if(i<0) break; idx[i]++; for(let j=i+1;j<size;j++) idx[j]=idx[j-1]+1; } } }
    const edgeLengths=BASE_EDGES.map(([i,j])=>vd(pos[i],pos[j]));
    const avgEdge=edgeLengths.reduce((a,b)=>a+b,0)/edgeLengths.length;
    const actualDensity=Math.PI/(3*Math.sqrt(2))/(avgEdge**3);
    return { active,implied,candidates,positions,
        excitations: excitations.map(e=>({
            id: e.id,
            node: e.node,
            prevNode: e.prevNode,
            ownShortcut: e.ownShortcut,
            travelDest: e.travelDest,
            dirCounts: [...e.dirCounts],
            trail: [...e.trail]
        })),
        meta:{ activeCount:activeSet.size,impliedCount:impliedSet.size,xonImpliedCount:xonImpliedSet.size,blockedCount:candidates.filter(x=>!x.allowed).length,allowedCount:candidates.filter(x=>x.allowed).length,latticeLevel,nodeCount:N,shortcutCount:ALL_SC.length },
        solver:{ activeSetConverged:activeConverged,fullSetConverged:fullConverged,violated,worstBaseEdge:worstBase,worstShortcut:worstSC,worstSeparation:worstSep,minimalBadSubset },
        geometry:{ avgBaseEdgeLength:+avgEdge.toFixed(8),maxBaseEdgeError:+maxBaseErr.toFixed(8),actualDensity:+actualDensity.toFixed(8),idealDensity:+(Math.PI/(3*Math.sqrt(2))).toFixed(8) } };
}
function exportState(){ const json=JSON.stringify(buildExportData(),null,2); copyText(json); toast('state copied to clipboard'); }
function copyText(text){ const ta=document.createElement('textarea'); ta.value=text; ta.style.cssText='position:fixed;top:-9999px;left:-9999px;opacity:0;'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }

// ─── Side panel ───────────────────────────────────────────────────────────────
const sideShortcuts=document.getElementById('side-shortcuts');
const shList=document.getElementById('sh-list');

function severImplied(id){
    if(xonImpliedSet.has(id)){
        const remainPairs=[];
        activeSet.forEach(aid=>{ const s=SC_BY_ID[aid]; remainPairs.push([s.a,s.b]); });
        xonImpliedSet.forEach(eid=>{ if(eid!==id){ const s=SC_BY_ID[eid]; remainPairs.push([s.a,s.b]); } });
        if(!_solve(remainPairs).converged){ setStatus('\u26a0 cannot sever \u2014 excitation shortcut is load-bearing'); return; }
        xonImpliedSet.delete(id);
        // Clear tet state on any excitation whose tet included this shortcut
        for(const e of excitations){
            if(e.ownShortcut === id) e.ownShortcut = null;
            if(e.voidScIds && e.voidScIds.includes(id)){
                e.zeroPoint = null; e.voidType = null; e.voidScIds = null; e.voidNodes = null;
            }
        }
    } else {
        blockedImplied.add(id);
    }
    impliedSet.delete(id);
    physicsUpdate();
}

// ─── IMPORTANT: Load-bearing / sever / locked logic ─────────────────────
// DO NOT REMOVE: Shortcuts that are "load-bearing" (removing them would
// cause the solver to fail) are grayed out with "locked" text and their
// sever button is disabled. Non-load-bearing shortcuts show a clickable
// "sever" button. Entries are SORTED: severable shortcuts first, locked
// shortcuts last, so the user always sees actionable items at the top.
// ──────────────────────────────────────────────────────────────────────────
function updateSidePanel(){
    // Cache: only rebuild when stateVersion changed since last render.
    // This prevents isLoadBearing() solver calls on hover events.
    if(sidePanelVersion===stateVersion) return;
    sidePanelVersion=stateVersion;

    shList.querySelectorAll('.sh-item').forEach(el=>el.remove());
    const total=activeSet.size+impliedSet.size;
    sideShortcuts.classList.toggle('empty',total===0);
    if(!total) return;

    // DO NOT REMOVE: isLoadBearing checks whether removing a shortcut
    // would make the solver fail. Used to gray out "locked" sever buttons.
    function isLoadBearing(id,fromActive){
        const remainPairs=[];
        activeSet.forEach(aid=>{ if(aid!==id){ const s=SC_BY_ID[aid]; remainPairs.push([s.a,s.b]); } });
        xonImpliedSet.forEach(eid=>{ if(fromActive||eid!==id){ const s=SC_BY_ID[eid]; remainPairs.push([s.a,s.b]); } });
        return !_solve(remainPairs).converged;
    }
    const entries=[];
    [...activeSet].forEach(id=>{ entries.push({id,kind:'manual',locked:isLoadBearing(id,true)}); });
    [...impliedSet].forEach(id=>{ const isElectron=xonImpliedSet.has(id); entries.push({id,kind:isElectron?'electron':'implied',locked:isLoadBearing(id,false)}); });
    // DO NOT REMOVE: sort severable (locked=false=0) first, locked (true=1) last
    entries.sort((a,b)=>a.locked-b.locked);
    entries.forEach(({id,kind,locked})=>{
        const s=SC_BY_ID[id]; const isImplied=kind!=='manual'; const dotColor=S_COLOR_CSS[s.stype];
        let sublabel='';
        if(kind==='electron') sublabel='<span class="sh-sub">⬡ excitation</span>';
        else if(kind==='implied'){ const parents=[...(impliedBy.get(id)||[])]; const lbl=parents.map(pid=>{ const ps=SC_BY_ID[pid]; return 'v'+ps.a+'–v'+ps.b; }).join(', ')||'geometry'; sublabel='<span class="sh-sub">⬡ '+lbl+'</span>'; }
        const item=document.createElement('div');
        item.className='sh-item'+(isImplied?' implied':' manual')+(locked?' locked':'');
        const dot=isImplied?'<div class="sh-dot implied-dot" style="color:'+dotColor+';border-color:'+dotColor+'"></div>':'<div class="sh-dot" style="background:'+dotColor+'"></div>';
        // DO NOT REMOVE: locked shortcuts show grayed "locked", severable show clickable "sever"
        const btn=locked?'<span class="sh-sever sh-locked">locked</span>':'<span class="sh-sever">sever</span>';
        item.innerHTML=dot+'<span class="sh-label">v'+s.a+' — v'+s.b+' &nbsp;<span style="color:#2a4a5a">s'+s.stype+'</span>'+sublabel+'</span>'+btn;
        // DO NOT REMOVE: sever click handler — manual shortcuts delete directly,
        // implied/electron shortcuts go through severImplied() which checks solver
        if(!locked){ item.querySelector('.sh-sever').addEventListener('click',e=>{ e.stopPropagation(); deactivateBigBang(); if(kind==='manual'){ activeSet.delete(id); hoveredSC=-1; physicsUpdate(); } else{ severImplied(id); } }); }
        shList.appendChild(item);
    });
}

// ─── Raycasting ───────────────────────────────────────────────────────────────
const raycaster=new THREE.Raycaster(); raycaster.params.Line={threshold:0.15};
const mouse2d=new THREE.Vector2();
function raycast(e){
    const r=canvas.getBoundingClientRect();
    mouse2d.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
    raycaster.setFromCamera(mouse2d,camera);
    // InstancedMesh raycasting: returns hit.instanceId for sphere index
    const bgHits=raycaster.intersectObject(bgMesh);
    const fgHits=raycaster.intersectObject(fgMesh);
    const allSphereHits=[...bgHits,...fgHits].sort((a,b)=>a.distance-b.distance);
    if(allSphereHits.length&&allSphereHits[0].instanceId!==undefined){
        // Skip hidden instances (scale=0 means bg/fg mesh at this slot is invisible)
        // We can detect: if the hit is from bgMesh, that instance should not be highlighted;
        // if from fgMesh, it should be. Either way, instanceId is the vertex index.
        return {type:'sphere',vidx:allSphereHits[0].instanceId};
    }
    for(const [idStr,o] of Object.entries(scLineObjs)) if(raycaster.intersectObject(o.line).length) return {type:'shortcut',scId:+idStr};
    return null;
}

// ─── Camera orbit / pan ───────────────────────────────────────────────────────
let sph={theta:4.714,phi:1.058,r:7.5},orbitFrom=null,isDrag=false,dragMoved=false,downX=0,downY=0;
let panTarget={x:0,y:0,z:0};
let isGrabMode=false;
function applyCamera(){ camera.position.set(panTarget.x+sph.r*Math.sin(sph.phi)*Math.sin(sph.theta),panTarget.y+sph.r*Math.cos(sph.phi),panTarget.z+sph.r*Math.sin(sph.phi)*Math.cos(sph.theta)); camera.lookAt(panTarget.x,panTarget.y,panTarget.z); }
// DEFERRED to init block in flux-v2.html (depends on camera from flux-solver-render.js)
// applyCamera();

// ─── Auto-orbit ──────────────────────────────────────────────────────────────
let _autoOrbit = false;
// Called every frame from the render loop (dt in seconds).
// Rotates theta at a speed derived from the orbit-speed-slider.
function _tickAutoOrbit(dt) {
    if (!_autoOrbit || isDrag) return;
    const slider = document.getElementById('orbit-speed-slider');
    const raw = slider ? +slider.value : 25; // 1-100
    const speed = raw * 0.004; // radians/sec: 0.004 (slow) to 0.4 (fast)
    sph.theta += speed * dt;
    applyCamera();
}
// Toggle + UI wiring (called once from init block)
function _initAutoOrbit() {
    const toggle = document.getElementById('orbit-toggle');
    const val = document.getElementById('orbit-speed-val');
    const slider = document.getElementById('orbit-speed-slider');
    if (!toggle || !val || !slider) return;
    function updateLabel() {
        if (!_autoOrbit) { val.textContent = 'off'; val.style.color = '#555'; }
        else { val.textContent = slider.value + '%'; val.style.color = '#9abccc'; }
        toggle.style.color = _autoOrbit ? '#d4a054' : '#6a8aaa';
    }
    toggle.addEventListener('click', () => { _autoOrbit = !_autoOrbit; updateLabel(); });
    slider.addEventListener('input', () => { if (!_autoOrbit) { _autoOrbit = true; } updateLabel(); });
    updateLabel();
}


window.addEventListener('keydown',e=>{ if(e.metaKey||e.ctrlKey){ isGrabMode=true; canvas.style.cursor='grab'; } });
window.addEventListener('keyup',e=>{ if(!e.metaKey&&!e.ctrlKey){ isGrabMode=false; canvas.style.cursor='default'; } });

canvas.addEventListener('mousedown',e=>{
    isDrag=true; dragMoved=false; downX=e.clientX; downY=e.clientY;
    if(isGrabMode){ orbitFrom={px:panTarget.x,py:panTarget.y,pz:panTarget.z,x:e.clientX,y:e.clientY,mode:'pan'}; canvas.style.cursor='grabbing'; }
    else{ orbitFrom={...sph,x:e.clientX,y:e.clientY,mode:'orbit'}; }
});

window.addEventListener('mousemove',e=>{
    const dx=e.clientX-downX,dy=e.clientY-downY;
    if(isDrag&&Math.sqrt(dx*dx+dy*dy)>4){
        dragMoved=true;
        if(orbitFrom?.mode==='pan'){
            const panSpeed=sph.r*0.0012;
            const sinT=Math.sin(sph.theta),cosT=Math.cos(sph.theta);
            const cosP=Math.cos(sph.phi),sinP=Math.sin(sph.phi);
            const rx=cosT,ry=0,rz=-sinT;
            const ux=-sinT*cosP,uy=sinP,uz=-cosT*cosP;
            const ddx=e.clientX-orbitFrom.x,ddy=e.clientY-orbitFrom.y;
            panTarget.x=orbitFrom.px-(ddx*rx-ddy*ux)*panSpeed;
            panTarget.y=orbitFrom.py-(ddx*ry-ddy*uy)*panSpeed;
            panTarget.z=orbitFrom.pz-(ddx*rz-ddy*uz)*panSpeed;
        } else if(orbitFrom){
            sph.theta=orbitFrom.theta-(e.clientX-orbitFrom.x)*0.006;
            sph.phi=Math.max(0.1,Math.min(Math.PI-0.1,orbitFrom.phi+(e.clientY-orbitFrom.y)*0.006));
        }
        applyCamera(); return;
    }
    if(isDrag) return;

    // When selectMode is off, suppress all hover highlighting.
    // Raycasting still runs so cursor changes to pointer over clickable things,
    // but hoveredVert/hoveredSC stay -1 so spheres/edges don't light up.
    const hit=raycast(e);
    const rawV=hit?.type==='sphere'?hit.vidx:-1;
    const rawS=hit?.type==='shortcut'?hit.scId:-1;
    const nv=selectMode?rawV:-1, ns=selectMode?rawS:-1;

    if(nv!==hoveredVert||ns!==hoveredSC){
        if(hoveredSC>=0) setScHighlight(hoveredSC,false);
        hoveredVert=nv; hoveredSC=ns;
        if(hoveredSC>=0) setScHighlight(hoveredSC,true);
        _spheresDirty = true; updateSpheres();
        updateStatusHoverOnly();
    }
    // Cursor: crosshair in selectMode, pointer over clickable items, else grab/default
    canvas.style.cursor=selectMode?'crosshair':isGrabMode?'grab':'default';
});

window.addEventListener('mouseup',e=>{
    if(!isDrag) return; isDrag=false;
    canvas.style.cursor=selectMode?'crosshair':isGrabMode?'grab':'default';
    if(dragMoved) return;
    const hit=raycast(e);
    if(hit?.type==='shortcut'){
        // Manual shortcuts: delete directly. Implied/electron: go through severImplied.
        deactivateBigBang();
        if(!impliedSet.has(hit.scId)){ activeSet.delete(hit.scId); hoveredSC=-1; physicsUpdate(); selectedVert=-1; }
        else { severImplied(hit.scId); hoveredSC=-1; }
        return;
    }
    if(hit?.type==='sphere'){
        const v=hit.vidx;
        if(placingExcitation){ const ex=createExcitation(v); if(ex) toggleExcitationPlacement(); return; }
        if(!selectMode) return;
        if(selectedVert>=0&&candidatePartners.has(v)){
            const scId=candidatePartners.get(v); const sc=SC_BY_ID[scId];
            if(!tryAdd(sc)) toast('geometrically impossible — packing constraint violated');
            else{ deactivateBigBang(); activeSet.add(scId); physicsUpdate(); }
            selectedVert=-1; updateCandidates(); updateSpheres(); return;
        }
        selectedVert=(v===selectedVert)?-1:v;
        updateCandidates(); updateSpheres(); updateStatus(); return;
    }
    if(!selectMode) return;
    selectedVert=-1; updateCandidates(); updateSpheres(); updateStatus();
});

canvas.addEventListener('wheel',e=>{ sph.r=Math.max(2,Math.min(60,sph.r+e.deltaY*0.012)); applyCamera(); },{passive:true});
canvas.addEventListener('mouseleave',()=>{ if(hoveredSC>=0){ setScHighlight(hoveredSC,false); hoveredSC=-1; } hoveredVert=-1; _spheresDirty=true; updateSpheres(); updateStatusHoverOnly(); });
window.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ if(placingExcitation){ toggleExcitationPlacement(); return; } selectedVert=-1; updateCandidates(); updateSpheres(); updateStatus(); }
    // V2 keyboard shortcuts
    if(e.key === 'n' || e.key === 'N'){
        if(typeof NucleusSimulator !== 'undefined') NucleusSimulator.simulateNucleus();
    }
    if(e.key === 'c' || e.key === 'C'){
        console.log(`[CAMERA] sph={theta:${sph.theta.toFixed(4)}, phi:${sph.phi.toFixed(4)}, r:${sph.r.toFixed(4)}} panTarget={x:${panTarget.x.toFixed(4)}, y:${panTarget.y.toFixed(4)}, z:${panTarget.z.toFixed(4)}}`);
    }
});

// DEFERRED to init block in flux-v2.html (depends on functions from flux-voids.js)
// rebuildVoidSpheres();
// applySphereOpacity();
// updateCandidates(); updateSpheres(); updateStatus();

