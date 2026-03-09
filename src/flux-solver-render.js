// flux-solver-render.js — State vars, Position-Based Dynamics (PBD) constraint solver,
// FCC lattice builder, shortcut (SC) geometry, Three.js rendering pipeline

// ── Algorithm 9: "xon-pattern-cycle" (Pattern-guided choreography) ──
// Uses the pre-computed activation patterns to direct xons.
// Each tick, the algorithm knows which faces SHOULD be active according
// to the optimal 8-tick deuteron cycle. Xons hop to target faces and
// materialize SCs to fulfill the pattern.
QUARK_ALGO_REGISTRY.push({
    name: 'xon-pattern-cycle',
    description: 'Pattern-guided: xons execute the pre-computed optimal activation schedule',
    minDwell: 2,
    timeout: 6,

    stepQuark(e, freeOpts, costlyOpts, tetSCsOpen, faceData, ctx) {
        // Aggressive SC materialisation: if ANY tet SC is closed, open it
        if (tetSCsOpen < 2 && costlyOpts.length > 0) {
            for (const opt of costlyOpts) {
                if (ctx.canMaterialise(opt.scId)) {
                    if (ctx.materialise(e, opt.scId)) return opt;
                } else if (ctx.severForRoom(opt.scId)) {
                    if (ctx.materialise(e, opt.scId)) return opt;
                }
            }
        }
        // Otherwise traverse free edges (maintaining presence)
        if (freeOpts.length > 0) {
            return freeOpts[Math.floor(Math.random() * freeOpts.length)];
        }
        // Last resort: try any costly
        for (const opt of costlyOpts) {
            if (ctx.canMaterialise(opt.scId)) {
                if (ctx.materialise(e, opt.scId)) return opt;
            } else if (ctx.severForRoom(opt.scId)) {
                if (ctx.materialise(e, opt.scId)) return opt;
            }
        }
        return null;
    },

    shouldHop(e, groupFaces, occupiedFaces, ctx) {
        const sif = e._stepsInFace || 0;
        if (sif < this.minDwell) return null;
        const fd = ctx.tetFaceData[e._currentFace];
        const tetFull = fd && fd.scIds.every(id => ctx.allOpen.has(id));
        if (!tetFull && sif < this.timeout) return null;

        // Get the pattern schedule
        const schedule = getOrComputePatternSchedule();
        if (!schedule) {
            // Fallback: simple cycle
            const cycleIdx = Math.floor(ctx.nucleusTick / 3) % groupFaces.length;
            const target = groupFaces[cycleIdx];
            if (target === e._currentFace || occupiedFaces.has(target)) return null;
            return { targetFace: target };
        }

        // Which faces should be active right now?
        const t = ctx.nucleusTick % 8;
        const step = schedule[t];
        const targetFaces = new Set([...step.protonFaces, ...step.neutronFaces]);

        // Am I on a target face already?
        if (targetFaces.has(e._currentFace)) {
            // Stay unless overstaying
            if (sif < this.timeout) return null;
        }

        // Find an unoccupied target face to hop to
        const unoccupied = groupFaces.filter(f =>
            !occupiedFaces.has(f) && f !== e._currentFace && targetFaces.has(f)
        );
        if (unoccupied.length > 0) {
            // Pick the one with lowest coverage
            const actMap = _tetActivationMap(ctx);
            let best = unoccupied[0], minCov = Infinity;
            for (const f of unoccupied) {
                const cov = actMap[f]?.totalCov || 0;
                if (cov < minCov) { minCov = cov; best = f; }
            }
            return { targetFace: best };
        }

        // No target face available — hop to any unoccupied (coverage deficit)
        const anyUnoccupied = groupFaces.filter(f => !occupiedFaces.has(f) && f !== e._currentFace);
        if (anyUnoccupied.length > 0 && sif >= this.timeout) {
            const actMap = _tetActivationMap(ctx);
            let best = anyUnoccupied[0], minCov = Infinity;
            for (const f of anyUnoccupied) {
                const cov = actMap[f]?.totalCov || 0;
                if (cov < minCov) { minCov = cov; best = f; }
            }
            return { targetFace: best };
        }
        return null;
    }
});

let _nucleusTetFaceData = {};
let _quarkNodeOccupancy = new Map(); // node index → excitation ref (Pauli exclusion)
let _syncMaxDeviation = 0;           // max sphere↔pos[] deviation (sync health)
let _syncStatus = 'ok';              // 'ok' | 'warn' | 'error'
let _faceCoverageTotal = {};         // key → cumulative tick count (type_face, e.g. pu_1, nd_5)
let _nucleusTick = 0;               // global tick counter for nucleus mode
let _octEdgeLastTraced = new Map();  // pairId(a,b) → tick number when last traced by a quark
let _octNodeSet = null;              // Set of oct-void node indices (set in simulateNucleus)
let _octSCIds = [];                  // Oct void SC ids (quarks materialise these naturally)
let _octVoidIdx = -1;               // Void index of the nucleus oct (hadronic center)
let voidNeighborData = [];
let _nodeTetVoids = new Map(); // node → tet voids containing that node
let _nodeOctVoids = new Map(); // node → oct voids containing that node
// NOTE TO SELF: All let/const used inside functions that are called during
// initialization (rebuildLatticeGeometry, bumpState, applyPositions, etc.)
// must be declared HERE in this early block — NOT inline near their first use.
// JS `let`/`const` do NOT hoist and will throw ReferenceError (TDZ) if any
// code path reaches them before their declaration line executes.
// ALWAYS add new "helper" objects, flags, and caches to this block.
//
// NOTE: Do not delete these notes. They exist to prevent recurring TDZ bugs.
const _voidDummy = new THREE.Object3D();
let excitationEnergy = 0.5; // 0–1, maps to average lifespan for seeking excitations
let basePosNeighbor;  // [nodeIdx][dirIdx] -> nodeIdx in positive direction, or undefined
let tetPartnerMap = new Map();    // scId -> [partnerScIds] for tet void completion
let scBridgeMap = new Map();        // scId -> Set<nodeIdx> of bridge nodes (base-adjacent to both SC endpoints)
let scNeighborMap = new Map();      // nodeIdx -> [scId, ...] — SCs incident to this node
let squarePartnerMap = new Map(); // scId -> [other 3 scIds in same oct square]
let _voidSpheresCacheKey = -1;   // dirty-flag for updateVoidSpheres actualization (stateVersion)
// ── Rule arena state ──
let activeRuleIndex = 0;         // index into RULE_REGISTRY (V2: default to first model)
let _kStateStr = '';             // cached ternary state string for K-complexity
let _kBaseline = 0;             // cached baseline K-complexity (normalized 0–1)
let _kStateVersion = -1;        // stateVersion when K-cache was last computed
// ── Temporal K-complexity state ──
let _temporalFrames = [];        // array of ternary state strings (one per state change)
let _temporalKValue = 0;         // current temporal K (normalized 0-1)
let _temporalKDeltas = [];       // per-recompute K values (for sparkline)
let _temporalLastVersion = -1;   // stateVersion when last frame was captured
const TEMPORAL_K_WINDOW = 200;   // max frames retained (sliding window)
let _temporalKFramesSinceRecompute = 0;

// ── Hamming distance ("jiggling" metric) ─────────────────────────
// Measures how many SCs change state between consecutive ticks.
// Direct measure of lattice motion — complementary to temporal K.
// temporalK measures information novelty; Hamming measures raw motion.
// A stuck lattice has Hamming = 0. A jiggling lattice has Hamming > 0.
let _prevFrameStr = '';        // previous tick's state string
let _hammingDistance = 0;      // fraction of SCs that changed (0–1)
let _hammingHistory = [];      // rolling history (last 50 values)
let _avgHamming = 0;          // rolling average Hamming distance
let _stuckTickCount = 0;      // consecutive ticks with Hamming < 0.01

// ── Rule tournament state ─────────────────────────────────────────
// The tournament cycles through all non-classic rules in RULE_REGISTRY,
// testing each in the live simulation and measuring temporal K.
// When temporal K crashes (drops below 10% after initially surpassing
// it), or max ticks elapse, the trial ends and the next rule is tested.
// After all rules are tested, results are logged and a new round begins.
//
// The loop runs inside excitationClockTick() — zero extra timers.
// At 220ms/tick, 300 ticks ≈ 66s per rule, ~9 rules → ~10min per round,
// so ~6 rounds per hour of unattended testing.
let tournamentActive = false;
let _tournamentInstalling = false;
let tournamentQueue = [];        // rule indices to test (skips index 0 = classic)
let tournamentQueueIdx = 0;      // current position in the queue
let tournamentRound = 0;         // how many full cycles completed
let tournamentTickCounter = 0;   // ticks elapsed in current trial
let tournamentPeakTK = 0;       // peak temporal K in current trial
let tournamentHasSurpassed = false; // has tK exceeded threshold this trial?
let tournamentResults = [];      // [{ruleIdx, name, fitness, peakTK, avgTK, round}, ...]
const TOURNAMENT_EVAL_TICKS = 50;   // Short for fast iteration
const TOURNAMENT_TK_THRESHOLD = 0.10; // 10% crash threshold
const TOURNAMENT_RAMP_TICKS = 100;   // V2: longer grace period for emergence (was 60)
const TOURNAMENT_MAX_RESULTS = 100;  // max stored results
const MAX_TICK_CHANGES = 30;         // max SC changes per tick (prevents solver overwhelm)

// ── Teleportation detection ──────────────────────────────────────
// A quark "teleports" if its node falls outside its current tet's
// voidNodes, or if it moves without traversing a valid edge.
// Any teleportation = instant algo failure in tournament.
let _teleportationCount = 0;
let _illegalTraversalCount = 0;  // moves along non-unit-length edges (closed SCs)
let _xonStallCount = 0;          // xon stood still (no move chosen)

// ── Tournament recordings: tick-by-tick state for playback ──
// Map: algoIdx_round → [{tick, quarks:[{id,node,face,stepsInFace}], openSCIds:[], coverage:{}, tetActualized}]
let _tournamentRecordings = {};
let _currentRecordingKey = null;

// ── Agent notification queue ──────────────────────────────────────
// Structured events that agents can poll via window._fluxEventQueue.
// Each event: { type, data, ts }. Agents read & clear after processing.
window._fluxEventQueue = [];
window._tournamentRecordings = _tournamentRecordings; // expose for playback

// ── Rule animation annotation state ──────────────────────────────
// Rules can annotate SCs and nodes with custom colors during tick().
// The renderer reads these and overrides default stype-based colors.
// This allows rules to VISUALLY SHOW what they're doing:
//   - Color SCs by gauge group (R/G/B for SU(3), L/R for SU(2), etc.)
//   - Highlight nodes by domain assignment or particle type
//   - Show creation/annihilation events with flashes
//
// Animation quality is measured by:
//   - Coverage: fraction of SCs/nodes with custom colors (0-1)
//   - Dynamism: how much annotations change per tick (Hamming on colors)
//   - These feed into the tournament fitness as an additional criterion.
const _ruleAnnotations = {
    scColors: new Map(),      // scId → 0xRRGGBB hex color
    nodeColors: new Map(),    // nodeIdx → 0xRRGGBB hex color
    scOpacity: new Map(),     // scId → opacity (0-1)
    // Void annotations
    tetColors: new Map(),     // voidIndex → 0xRRGGBB hex color for tet void fill
    octColors: new Map(),     // voidIndex → 0xRRGGBB hex color for oct void fill
    tetOpacity: new Map(),    // voidIndex → opacity (0-1) for tet void
    octFaceColors: new Map(), // voidIndex → [face0Color, face1Color, ...] per-face oct colors
    // Excitation annotations
    excitationColors: new Map(), // excitationIndex → 0xRRGGBB override color
    excitationScale: new Map(),  // excitationIndex → scale multiplier for spark
    dirty: false,             // flag to trigger rebuild
};
window._ruleAnnotations = _ruleAnnotations;

// Animation quality tracking (per-tick)
let _animCoverage = 0;        // fraction of SCs+nodes annotated
let _animDynamism = 0;        // fraction of annotations that changed
let _animHistory = [];        // rolling history of animQuality scores
let _avgAnimQuality = 0;      // rolling average animation quality
let _prevAnnotationHash = ''; // for measuring dynamism

// ── Performance caches (invalidated by stateVersion) ──
let _allOpenCache = null;        // cached Set of all open SC ids
let _allOpenVersion = -1;
let _basePairsCache = null;      // cached constraint pair array for solver
let _basePairsVersion = -1;
let scPairToId = new Map();      // numeric pair key → SC id (hoisted for computeVoidNeighbors TDZ)
// All void constants hoisted here to avoid TDZ — rebuildVoidSpheres() is
// called from updateLatticeLevel which runs before the void section.
const VOID_R_TET = Math.sqrt(5/12) - 0.5;   // ≈ 0.1455  kissing radius for tet voids
const VOID_R_OCT = 1/S3 - 0.5;              // ≈ 0.0774  kissing radius for oct voids
const CELL_VOIDS_TET = (() => {
    const v = [];
    for(const s1 of [1,-1]) for(const s2 of [1,-1]) {
        v.push([r3*s1, r3/2*s2, 0]);
        v.push([0, r3*s1, r3/2*s2]);
        v.push([r3/2*s1, 0, r3*s2]);
    }
    return v; // 12 per cell
})();
// Octahedral void centers = dual of tet voids: same offsets negated.
// 12 per cell, 1:1 ratio with tet voids.
const CELL_VOIDS_OCT = (() => {
    const v = [];
    for(const s1 of [1,-1]) for(const s2 of [1,-1]) {
        v.push([-r3*s1, -r3/2*s2,  0]);
        v.push([ 0,     -r3*s1,    -r3/2*s2]);
        v.push([-r3/2*s1,  0,      -r3*s2]);
    }
    return v; // 12 per cell, dual to CELL_VOIDS_TET
})();
const _voidMatTet = new THREE.MeshPhongMaterial({color:0x999999, emissive:0x222222, transparent:true, opacity:0.0, depthWrite:false, side:THREE.DoubleSide});
const _voidMatOct = new THREE.MeshPhongMaterial({color:0xffffff, emissive:0x333333, transparent:true, opacity:0.0, depthWrite:false, side:THREE.DoubleSide});
const _voidWireTet = new THREE.LineBasicMaterial({color:0xaaaaaa, transparent:true, opacity:0.0, depthTest:false});
const _voidWireOct = new THREE.LineBasicMaterial({color:0xffffff, transparent:true, opacity:0.0, depthTest:false});
// Vertex-colored oct material for per-face excitation lighting
const _voidMatOctVC = new THREE.MeshPhongMaterial({color:0xffffff, vertexColors:true, transparent:true, opacity:0.0, depthWrite:false, side:THREE.DoubleSide, emissive:0x111111, emissiveIntensity:0.08});

// ─── Sparkle texture for excitations ─────────────────────────────────────────
const _sparkTex = (function(){
    const sz=64, c=document.createElement('canvas'); c.width=c.height=sz;
    const ctx=c.getContext('2d'), cx=sz/2, cy=sz/2;
    // Radial glow core
    const grad=ctx.createRadialGradient(cx,cy,0,cx,cy,sz/2);
    grad.addColorStop(0,'rgba(255,255,255,1)');
    grad.addColorStop(0.12,'rgba(255,255,255,0.85)');
    grad.addColorStop(0.35,'rgba(255,255,255,0.18)');
    grad.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=grad; ctx.fillRect(0,0,sz,sz);
    // Star spikes (4 rays at 0°, 45°, 90°, 135°)
    ctx.globalCompositeOperation='lighter';
    for(let a=0;a<Math.PI;a+=Math.PI/4){
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(a);
        const sp=ctx.createLinearGradient(0,0,sz/2,0);
        sp.addColorStop(0,'rgba(255,255,255,0.9)');
        sp.addColorStop(0.25,'rgba(255,255,255,0.25)');
        sp.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=sp; ctx.fillRect(0,-0.8,sz/2,1.6);
        const sp2=ctx.createLinearGradient(0,0,-sz/2,0);
        sp2.addColorStop(0,'rgba(255,255,255,0.9)');
        sp2.addColorStop(0.25,'rgba(255,255,255,0.25)');
        sp2.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=sp2; ctx.fillRect(-sz/2,-0.8,sz/2,1.6);
        ctx.restore();
    }
    const t=new THREE.CanvasTexture(c); t.needsUpdate=true; return t;
})();

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  DO NOT DELETE — SPHERE PACKING DENSITY: KEPLER LIMIT CANARY       ║
// ╠══════════════════════════════════════════════════════════════════════╣
// ║                                                                      ║
// ║  The FCC sphere packing density (π/3√2 ≈ 74.048%) is the MOST       ║
// ║  IMPORTANT invariant in the entire simulation. It is the canary     ║
// ║  in the coal mine — if this value deviates from the Kepler limit,   ║
// ║  something is fundamentally broken in the lattice geometry.          ║
// ║                                                                      ║
// ║  The density is computed from actual edge lengths in the deformed    ║
// ║  lattice: ideal_density / lAvg³. When the lattice is correct,       ║
// ║  this equals π/3√2 regardless of SC activations, because the        ║
// ║  solver preserves unit edge lengths.                                 ║
// ║                                                                      ║
// ║  ANY deviation means the solver has introduced geometric error,     ║
// ║  edges are non-unit-length, or the lattice has been corrupted.      ║
// ║  This MUST be monitored at all times. The density display in the    ║
// ║  bottom-left panel turns orange on deviation and red on violation.  ║
// ║                                                                      ║
// ║  NEVER remove, disable, or suppress this check.                     ║
// ╚══════════════════════════════════════════════════════════════════════╝
let _keplerFrozen = false;
function _keplerViolation(actual, ideal) {
    if (_keplerFrozen) return;
    _keplerFrozen = true;
    // FREEZE EVERYTHING
    if (_demoActive) {
        _demoActive = false;
        if (_demoInterval) { clearInterval(_demoInterval); _demoInterval = null; }
    }
    if (typeof stopExcitationClock === 'function') stopExcitationClock();
    simHalted = true;
    // BIG RED OVERLAY
    let overlay = document.getElementById('kepler-violation-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'kepler-violation-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; ' +
            'background:rgba(80,0,0,0.85); display:flex; flex-direction:column; ' +
            'align-items:center; justify-content:center; z-index:99999; pointer-events:all;';
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
        <div style="color:#ff3333; font-size:48px; font-weight:bold; font-family:monospace; text-align:center; text-shadow:0 0 20px #ff0000;">
            KEPLER DENSITY VIOLATION
        </div>
        <div style="color:#ff6666; font-size:24px; font-family:monospace; margin-top:20px; text-align:center;">
            Sphere packing density breached Kepler limit
        </div>
        <div style="color:#ffaaaa; font-size:18px; font-family:monospace; margin-top:30px; text-align:center;">
            actual: ${actual.toFixed(6)}% &nbsp;|&nbsp; ideal: ${ideal.toFixed(6)}% &nbsp;|&nbsp; deviation: ${(actual - ideal).toFixed(6)}%
        </div>
        <div style="color:#ff8888; font-size:14px; font-family:monospace; margin-top:40px; text-align:center;">
            ENGINE FROZEN — lattice geometry is corrupted
        </div>
        <button onclick="document.getElementById('kepler-violation-overlay').style.display='none'"
            style="margin-top:40px; padding:10px 30px; background:#441111; color:#ff6666; border:2px solid #ff4444;
                   border-radius:5px; font-size:14px; font-family:monospace; cursor:pointer;">
            DISMISS (engine remains frozen)
        </button>`;
    overlay.style.display = 'flex';
    console.error(`[KEPLER VIOLATION] density=${actual.toFixed(6)}% ideal=${ideal.toFixed(6)}% dev=${(actual-ideal).toFixed(6)}%`);
}
function computeIdealDensity(){ return Math.PI/(3*Math.sqrt(2)); }
function computeActualDensity(){
    let sum=0;
    for(const [i,j] of BASE_EDGES) sum+=vd(pos[i],pos[j]);
    const lAvg=sum/BASE_EDGES.length;
    return computeIdealDensity()/(lAvg*lAvg*lAvg);
}

const DIR_VEC = [
    [1/S3,1/S3,1/S3],[1/S3,-1/S3,-1/S3],
    [-1/S3,1/S3,-1/S3],[-1/S3,-1/S3,1/S3]
];
function edgeDirIdx_rest(i,j){
    const dx=REST[j][0]-REST[i][0],dy=REST[j][1]-REST[i][1],dz=REST[j][2]-REST[i][2];
    const d=Math.sqrt(dx*dx+dy*dy+dz*dz);
    for(let k=0;k<4;k++){ const v=DIR_VEC[k]; if(Math.abs(Math.abs((dx/d)*v[0]+(dy/d)*v[1]+(dz/d)*v[2])-1)<0.07) return k; }
    return 0;
}
let baseNeighbors;
function inferStype(va,vb){
    const inv=S3,mx=(va[0]+vb[0])/2*inv,my=(va[1]+vb[1])/2*inv,mz=(va[2]+vb[2])/2*inv;
    const adx=Math.abs(vb[0]-va[0]),ady=Math.abs(vb[1]-va[1]),adz=Math.abs(vb[2]-va[2]);
    if(adz>adx&&adz>ady){ if(Math.abs(mx)>0.1&&Math.abs(my)>0.1) return mx*my<0?1:4; return mz>0?1:4; }
    if(ady>adx&&ady>adz){ if(Math.abs(mx)>0.1&&Math.abs(mz)>0.1) return mx*mz<0?2:5; return my>0?2:5; }
    if(Math.abs(my)>0.1&&Math.abs(mz)>0.1) return my*mz<0?3:6; return mx>0?3:6;
}

// ─── Dynamic lattice geometry ─────────────────────────────────────────────────
let N, REST, pos, BASE_EDGES, ALL_SC, SC_BY_ID, scByVert, REPULSION_PAIRS;
function getLattice(level){
    const cells=new Map(), key=([x,y,z])=>`${Math.round(x*1000)},${Math.round(y*1000)},${Math.round(z*1000)}`;
    cells.set(key([0,0,0]),[0,0,0]);
    const q=[[0,0,0,0]];
    while(q.length){
        const [cx,cy,cz,d]=q.shift(); if(d>=level-1) continue;
        for(const [dx,dy,dz] of LATTICE_OFFSETS){ const p=[cx+dx,cy+dy,cz+dz],k=key(p); if(!cells.has(k)){ cells.set(k,p); q.push([...p,d+1]); } }
    }
    return [...cells.values()];
}
function rebuildLatticeGeometry(level){
    const cells=getLattice(level);
    restCellCenters=cells; // [0,0,0] of each cell = cell center in global coords
    const vmap=new Map(); const verts=[];
    for(const [cx,cy,cz] of cells) for(const [rx,ry,rz] of UNIT_REST){
        const x=cx+rx,y=cy+ry,z=cz+rz;
        const k=`${Math.round(x*10000)},${Math.round(y*10000)},${Math.round(z*10000)}`;
        if(!vmap.has(k)){ vmap.set(k,verts.length); verts.push([x,y,z]); }
    }
    N=verts.length; REST=verts; pos=verts.map(v=>[...v]);
    // O(N) edge detection via known delta vectors — replaces O(N²) brute-force.
    // At L10 (13179 nodes) brute-force checks 87M pairs; this checks 14×N=184K.
    // Base edges: ±DIR_VEC[0..3], length = 1.0 exactly.
    // Shortcut edges: ±axis-aligned vectors of length 2/√3.
    // DO NOT revert to O(N²) — it hangs for seconds at L6+.
    const _R3=1/Math.sqrt(3), _R4=2/Math.sqrt(3);
    const _BASE_DELTAS=[
        [_R3,_R3,_R3],[_R3,-_R3,-_R3],[-_R3,_R3,-_R3],[-_R3,-_R3,_R3],
        [-_R3,-_R3,-_R3],[-_R3,_R3,_R3],[_R3,-_R3,_R3],[_R3,_R3,-_R3]
    ];
    const _SC_DELTAS=[
        [_R4,0,0],[-_R4,0,0],[0,_R4,0],[0,-_R4,0],[0,0,_R4],[0,0,-_R4]
    ];
    const _vLookup=(x,y,z)=>vmap.get(`${Math.round(x*10000)},${Math.round(y*10000)},${Math.round(z*10000)}`);
    BASE_EDGES=[]; REPULSION_PAIRS=[]; ALL_SC=[]; _repFlat=new Uint32Array(0);
    for(let i=0;i<N;i++){
        const [px,py,pz]=REST[i];
        for(const [dx,dy,dz] of _BASE_DELTAS){
            const j=_vLookup(px+dx,py+dy,pz+dz);
            if(j!==undefined&&j>i){ BASE_EDGES.push([i,j]); REPULSION_PAIRS.push([i,j]); }
        }
        for(const [dx,dy,dz] of _SC_DELTAS){
            const j=_vLookup(px+dx,py+dy,pz+dz);
            if(j!==undefined&&j>i){
                ALL_SC.push({id:ALL_SC.length,a:i,b:j,stype:inferStype(REST[i],REST[j])});
                REPULSION_PAIRS.push([i,j]);
            }
        }
    }
    SC_BY_ID={}; ALL_SC.forEach(s=>SC_BY_ID[s.id]=s);
    scByVert=Array.from({length:N},()=>[]); ALL_SC.forEach(s=>{ scByVert[s.a].push(s); scByVert[s.b].push(s); });
    scNeighborMap=new Map(); for(let i=0;i<N;i++) scNeighborMap.set(i, ALL_SC.filter(s=>s.a===i||s.b===i).map(s=>s.id));
    baseNeighbors=Array.from({length:N},()=>[]);
    basePosNeighbor=Array.from({length:N},()=>Array(4).fill(undefined));
    BASE_EDGES.forEach(([i,j])=>{
        const dir=edgeDirIdx_rest(i,j);
        baseNeighbors[i].push({node:j,dirIdx:dir});
        baseNeighbors[j].push({node:i,dirIdx:dir});
        // Determine positive direction: dot(REST[j]-REST[i], DIR_VEC[dir]) > 0 means i→j is positive
        const dx=REST[j][0]-REST[i][0],dy=REST[j][1]-REST[i][1],dz=REST[j][2]-REST[i][2];
        const v=DIR_VEC[dir];
        if(dx*v[0]+dy*v[1]+dz*v[2] > 0){ basePosNeighbor[i][dir]=j; }
        else { basePosNeighbor[j][dir]=i; }
    });
    // Pre-flatten data for solver inner loop (avoids array dereference in hot path)
    _restFlat = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) {
        _restFlat[i*3]   = REST[i][0];
        _restFlat[i*3+1] = REST[i][1];
        _restFlat[i*3+2] = REST[i][2];
    }
    _baseFlat = new Uint32Array(BASE_EDGES.length * 2);
    for (let e = 0; e < BASE_EDGES.length; e++) {
        _baseFlat[e*2]   = BASE_EDGES[e][0];
        _baseFlat[e*2+1] = BASE_EDGES[e][1];
    }
    _repFlat = new Uint32Array(REPULSION_PAIRS.length * 2);
    for (let r = 0; r < REPULSION_PAIRS.length; r++) {
        _repFlat[r*2]   = REPULSION_PAIRS[r][0];
        _repFlat[r*2+1] = REPULSION_PAIRS[r][1];
    }
    // BFS 2-color the BASE_EDGES graph for void duality visualisation
    computeVoidTypes();
    // Find 4-neighbor sets for each void; stored as indices into REST/pos
    // Skip expensive void detection at high levels — voids won't be actualized anyway
    // and the O(SC×degree²) tet scan still takes time at L8+ (many SCs).
    if(level <= 5) computeVoidNeighbors();
    else { voidNeighborData=[]; tetPartnerMap=new Map(); squarePartnerMap=new Map(); scBridgeMap=new Map(); }
}

// ─── Active set + implied shortcuts ──────────────────────────────────────────
const activeSet=new Set();
const impliedSet=new Set();
const impliedBy=new Map();
const xonImpliedSet=new Set();
const IMPLY_THRESHOLD=1e-6;

// ─── Void duality classification ──────────────────────────────────────────────
// The void lattice is provably bipartite: every base edge connects one
// tetrahedral void (A₄ / fermion) to one octahedral void (Oₕ / boson).
// We recover the 2-coloring by BFS on BASE_EDGES — no geometry heuristics.
// Seed: vertex 0 is always an octahedral void (cell center [0,0,0]).
let voidTypes = [];       // 'tetrahedral' | 'octahedral', parallel to REST/pos
let restCellCenters = []; // kept for rebuildLatticeGeometry (unused by classifier now)

function computeVoidTypes(){
    const color = new Int8Array(N).fill(-1);
    color[0] = 0; // vertex 0 = [0,0,0] = octahedral
    const adj = Array.from({length:N}, ()=>[]);
    BASE_EDGES.forEach(([i,j])=>{ adj[i].push(j); adj[j].push(i); });
    const queue = [0];
    while(queue.length){
        const u = queue.shift();
        for(const v of adj[u]){
            if(color[v]===-1){ color[v]=1-color[u]; queue.push(v); }
        }
    }
    // color 0 = octahedral (Oₕ / boson), color 1 = tetrahedral (A₄ / fermion)
    voidTypes = Array.from(color, c => c===1 ? 'tetrahedral' : 'octahedral');
}

// DEFERRED to init block in flux-v2.html (depends on computeVoidNeighbors in flux-voids.js)
// rebuildLatticeGeometry(1);

// ─── PBD solver ───────────────────────────────────────────────────────────────
// Single-entry cache: avoids redundant solves when the same constraint set
// is tested multiple times in a tick (e.g. canMaterialiseQuick then materialise).
let _solveCache = { key: -1, len: -1, result: null };
function _pairsHash(sorted){
    let h = 0;
    for(let i = 0; i < sorted.length; i++){
        h = (h * 31 + sorted[i][0] * 20000 + sorted[i][1]) | 0;
    }
    return h;
}
let _solveCallCount = 0;
let _solveCallCountPerTick = 0;
let _solveTotalMs = 0;
let _solveMaxMs = 0;
let _solveIterTotal = 0;
function _solve(scPairs,iters=5000,noBailout=false){
    _solveCallCount++;
    _solveCallCountPerTick++;
    const _t0 = performance.now();
    const sortedSC=[...scPairs].sort((x,y)=>x[0]-y[0]||x[1]-y[1]);
    // Cache hit? Return deep copy of cached positions (caller may mutate)
    if(!noBailout && iters===5000){
        const cacheKey = _pairsHash(sortedSC);
        if(cacheKey === _solveCache.key && sortedSC.length === _solveCache.len && _solveCache.result){
            const cached = _solveCache.result;
            return { p: cached.p.map(v=>[v[0],v[1],v[2]]), converged: cached.converged };
        }
    }
    // ─── Optimized solver: flat typed arrays, no per-call allocation ───
    // Position buffer: copy from pre-flattened rest positions
    const nNodes = N; // global N
    const px = new Float64Array(nNodes * 3);
    if (_restFlat) {
        px.set(_restFlat);
    } else {
        for (let i = 0; i < nNodes; i++) {
            const off = i * 3;
            px[off]   = REST[i][0];
            px[off+1] = REST[i][1];
            px[off+2] = REST[i][2];
        }
    }
    // Constraint indices: copy pre-flattened base edges + append SC pairs
    const nBase = BASE_EDGES.length;
    const nSC = sortedSC.length;
    const nC = nBase + nSC;
    const ci = new Uint32Array(nC * 2);
    ci.set(_baseFlat); // copy pre-flattened base edges in one shot
    for (let e = 0; e < nSC; e++) {
        ci[(nBase+e)*2]   = sortedSC[e][0];
        ci[(nBase+e)*2+1] = sortedSC[e][1];
    }
    // Repulsion pairs: flat (pre-built at lattice init would be better but this is one-time per solve)
    const nRep = REPULSION_PAIRS.length;
    let mx=0, mx50=Infinity;
    for(let it=0;it<iters;it++){
        mx=0;
        // Project distance-1 constraints
        for(let e=0;e<nC;e++){
            const ii=ci[e*2], jj=ci[e*2+1];
            const io=ii*3, jo=jj*3;
            const dx=px[jo]-px[io], dy=px[jo+1]-px[io+1], dz=px[jo+2]-px[io+2];
            const d2=dx*dx+dy*dy+dz*dz;
            if(d2<1e-20) continue;
            const d=Math.sqrt(d2);
            const err=d-1.0;
            const absErr=err<0?-err:err;
            if(absErr>mx) mx=absErr;
            const f=err/d*0.5;
            px[io]+=f*dx; px[io+1]+=f*dy; px[io+2]+=f*dz;
            px[jo]-=f*dx; px[jo+1]-=f*dy; px[jo+2]-=f*dz;
        }
        // Project repulsion (only when too close) — uses pre-flattened buffer
        for(let r=0;r<nRep;r++){
            const ri=_repFlat[r*2], rj=_repFlat[r*2+1];
            const rio=ri*3, rjo=rj*3;
            const dx=px[rjo]-px[rio], dy=px[rjo+1]-px[rio+1], dz=px[rjo+2]-px[rio+2];
            const d2=dx*dx+dy*dy+dz*dz;
            if(d2>=0.999999) continue; // fast squared-distance check (1.0-1e-6)^2 ≈ 0.999998
            const d=Math.sqrt(d2);
            const f=(d-1.0)/d*0.5;
            px[rio]+=f*dx; px[rio+1]+=f*dy; px[rio+2]+=f*dz;
            px[rjo]-=f*dx; px[rjo+1]-=f*dy; px[rjo+2]-=f*dz;
        }
        if(mx<1e-9) break;
        if(!noBailout){
            if(it===49) mx50=mx;
            if(it===99&&mx>mx50*0.5) break;
        }
    }
    // Convert back to array-of-arrays for compatibility
    const p = new Array(nNodes);
    for (let i = 0; i < nNodes; i++) {
        const off = i * 3;
        p[i] = [px[off], px[off+1], px[off+2]];
    }
    const result = {p,converged:mx<1e-9};
    // Store in cache (only for default-param calls)
    if(!noBailout && iters===5000){
        const cacheKey = _pairsHash(sortedSC);
        _solveCache = { key: cacheKey, len: sortedSC.length, result: { p: p.map(v=>[v[0],v[1],v[2]]), converged: result.converged } };
    }
    const _dt = performance.now() - _t0;
    _solveTotalMs += _dt;
    if (_dt > _solveMaxMs) _solveMaxMs = _dt;
    return result;
}
function solvePositions(extraPair){
    const pairs=[];
    activeSet.forEach(id=>{ const s=SC_BY_ID[id]; pairs.push([s.a,s.b]); });
    impliedSet.forEach(id=>{ const s=SC_BY_ID[id]; pairs.push([s.a,s.b]); });
    if(extraPair) pairs.push(extraPair);
    return _solve(pairs).p;
}
function tryAdd(sc){
    const pairs=[];
    activeSet.forEach(id=>{ const s=SC_BY_ID[id]; pairs.push([s.a,s.b]); });
    xonImpliedSet.forEach(id=>{ const s=SC_BY_ID[id]; pairs.push([s.a,s.b]); });
    pairs.push([sc.a,sc.b]);
    return _solve(pairs).converged;
}
let _detectImpliedCount = 0, _detectImpliedMs = 0;
function detectImplied(){
    _detectImpliedCount++;
    const _diT0 = performance.now();
    impliedSet.clear(); impliedBy.clear();
    const activePairs=[];
    activeSet.forEach(id=>{ const s=SC_BY_ID[id]; activePairs.push([s.a,s.b]); });
    xonImpliedSet.forEach(id=>{ const s=SC_BY_ID[id]; activePairs.push([s.a,s.b]); });
    const {p,converged:probeConverged}=_solve(activePairs);
    let newImplied = 0;
    if(probeConverged){
        // When excitations are active, bypass blockedImplied for cascade detection.
        // blockedImplied is a manual-mode feature; excitation physics should detect
        // all cascade shortcuts so octahedral voids can actualize properly.
        const skipBlocked = xonImpliedSet.size > 0;
        // Shared snapshot: all implied SCs in one pass share the same cause set
        // (avoids N × new Set(activeSet) allocations)
        let _activeSnap = null;
        ALL_SC.forEach(s=>{
            if(activeSet.has(s.id)) return;
            if(!skipBlocked && blockedImplied.has(s.id)) return;
            const d=vd(p[s.a],p[s.b]);
            if(Math.abs(d-1.0)<IMPLY_THRESHOLD){
                impliedSet.add(s.id);
                if(!_activeSnap) _activeSnap = new Set(activeSet);
                impliedBy.set(s.id, _activeSnap);
                if(!xonImpliedSet.has(s.id)) newImplied++;
            }
        });
    }
    xonImpliedSet.forEach(id=>{
        if(!activeSet.has(id)&&!impliedSet.has(id)){ impliedSet.add(id); impliedBy.set(id,new Set()); }
    });
    // If no new cascade-implied shortcuts were found, the probe positions
    // are already correct — skip the second solve entirely.
    if(newImplied === 0 && probeConverged) { _detectImpliedMs += performance.now() - _diT0; return p; }
    const {p:pFinal,converged:finalConverged}=_solve((()=>{
        const pairs=[];
        activeSet.forEach(id=>{ const s=SC_BY_ID[id]; pairs.push([s.a,s.b]); });
        impliedSet.forEach(id=>{ const s=SC_BY_ID[id]; pairs.push([s.a,s.b]); });
        return pairs;
    })());
    if(!finalConverged){
        impliedSet.clear(); impliedBy.clear();
        xonImpliedSet.forEach(id=>{ impliedSet.add(id); impliedBy.set(id,new Set()); });
        _detectImpliedMs += performance.now() - _diT0;
        return solvePositions();
    }
    _detectImpliedMs += performance.now() - _diT0;
    return pFinal;
}

// ─── Performance: state version caching ──────────────────────────────────────
// stateVersion increments whenever activeSet / impliedSet / xonImpliedSet
// change. This lets candidateOk and the side panel skip expensive solver work
// when called from the hover path (where state hasn't changed).

function bumpState() {
    stateVersion++;
    candidateCacheKey = '';
    updateVoidSpheres(); // re-evaluate which voids are actualized
}

// ── Performance helpers (cached per stateVersion) ──────────────────────
function getAllOpen(){
    if(_allOpenVersion === stateVersion) return _allOpenCache;
    _allOpenCache = new Set([...activeSet, ...impliedSet, ...xonImpliedSet]);
    _allOpenVersion = stateVersion;
    return _allOpenCache;
}
function _getBasePairs(){
    if(_basePairsVersion === stateVersion) return _basePairsCache;
    const pairs = [];
    activeSet.forEach(id => { const s = SC_BY_ID[id]; pairs.push([s.a, s.b]); });
    impliedSet.forEach(id => { const s = SC_BY_ID[id]; pairs.push([s.a, s.b]); });
    xonImpliedSet.forEach(id => { const s = SC_BY_ID[id]; pairs.push([s.a, s.b]); });
    _basePairsCache = pairs;
    _basePairsVersion = stateVersion;
    return pairs;
}
function pairId(a, b){ return a < b ? a * 20000 + b : b * 20000 + a; }

// ─── Three.js setup ───────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0x000000,1); // solid black background
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45,1,0.01,100);
function resize(){ renderer.setSize(innerWidth,innerHeight); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); }
resize(); window.addEventListener('resize',resize);
scene.add(new THREE.AmbientLight(0xffffff,0.5));
const kl=new THREE.DirectionalLight(0xffffff,0.9); kl.position.set(5,8,6); scene.add(kl);
const fl=new THREE.DirectionalLight(0x8090ff,0.3); fl.position.set(-4,-3,-2); scene.add(fl);

// ─── Procedural sky sphere ────────────────────────────────────────────────────
// Large inverted sphere with a GLSL gradient. Because the vertices are in
// world space, the gradient responds to camera rotation automatically —
// looking up reveals deep sky, level gaze hits the horizon band, looking
// down shows warm ground tones.
const _skyGeo = new THREE.SphereGeometry(50, 32, 16);
const _skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
        varying vec3 vDir;
        void main() {
            vDir = normalize((modelMatrix * vec4(position,1.0)).xyz);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
    fragmentShader: `
        varying vec3 vDir;
        void main() {
            float y = vDir.y; // -1 nadir .. +1 zenith
            // Sky band: horizon=0, zenith=1
            vec3 zenith  = vec3(0.05, 0.08, 0.14);   // deep night blue
            vec3 midSky  = vec3(0.10, 0.18, 0.30);   // deep blue
            vec3 horizon = vec3(0.36, 0.44, 0.52);   // cool blue-grey haze
            vec3 ground  = vec3(0.14, 0.11, 0.08);   // warm dark earth
            vec3 nadir   = vec3(0.07, 0.05, 0.04);   // near-black floor

            vec3 col;
            if(y >= 0.0) {
                float t = pow(y, 0.45);
                col = mix(mix(horizon, midSky, t*0.6), zenith, t*t);
            } else {
                float t = pow(-y, 0.55);
                col = mix(horizon, mix(ground, nadir, t), t);
            }
            // Subtle horizon glow band
            float halo = exp(-abs(y)*9.0) * 0.18;
            col += vec3(halo*0.7, halo*0.55, halo*0.35);
            gl_FragColor = vec4(col, 1.0);
        }`
});
const _skyMesh = new THREE.Mesh(_skyGeo, _skyMat);
_skyMesh.renderOrder = -1;
// scene.add(_skyMesh); // skybox disabled — using solid black background

// ─── Sphere rendering: InstancedMesh ─────────────────────────────────────────
// TWO InstancedMesh objects instead of N individual Mesh objects:
//   bgMesh  — low opacity (slider-controlled), for all "normal" (non-highlighted) spheres
//   fgMesh  — high opacity (0.82), for selected / hovered / candidate spheres
// This reduces draw calls from O(N) → 2, eliminating the per-sphere transparency sort
// that was causing slowdown during camera orbit at larger lattice levels.
// Sphere geometry is shared across all levels; detail is set by rebuildSphereMeshes
// based on current node count. 16×10 at L1-3, steps down to 5×4 at L8+.
let geoSph = new THREE.SphereGeometry(0.5, 16, 10);
let bgMesh = null, fgMesh = null;
const _bgMat = new THREE.MeshPhongMaterial({ transparent:true, opacity:0.5, depthWrite:true, specular:0x333333, shininess:60 });
const _fgMat = new THREE.MeshPhongMaterial({ transparent:true, opacity:0.82, specular:0x888888, shininess:110 });
const _iDummy = new THREE.Object3D();
const _iColor  = new THREE.Color();

function rebuildSphereMeshes(){
    // Adapt sphere detail to node count for smooth rendering at high levels
    const segs = N<200?16:N<800?12:N<2000?8:N<5000?6:5;
    const rings = N<200?10:N<800?8:N<2000?6:N<5000?5:4;
    if(geoSph) geoSph.dispose();
    geoSph = new THREE.SphereGeometry(0.5, segs, rings);
    if(bgMesh){ scene.remove(bgMesh); bgMesh.dispose && bgMesh.dispose(); }
    if(fgMesh){ scene.remove(fgMesh); fgMesh.dispose && fgMesh.dispose(); }

    bgMesh = new THREE.InstancedMesh(geoSph, _bgMat, N);
    fgMesh = new THREE.InstancedMesh(geoSph, _fgMat, N);
    bgMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N*3),3);
    fgMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N*3),3);

    for(let i=0;i<N;i++){
        _iDummy.position.set(...REST[i]); _iDummy.scale.set(1,1,1); _iDummy.updateMatrix();
        bgMesh.setMatrixAt(i,_iDummy.matrix);
        _iDummy.scale.set(0,0,0); _iDummy.updateMatrix();
        fgMesh.setMatrixAt(i,_iDummy.matrix);
        // Tetrahedral (A₄, order 3) = white; Octahedral (O_h, order 4) = black
        if(voidTypes[i]==='tetrahedral') _iColor.setRGB(1.0,1.0,1.0);
        else _iColor.setRGB(0.04,0.04,0.04);
        bgMesh.setColorAt(i,_iColor);
        fgMesh.setColorAt(i,_iColor);
    }
    bgMesh.instanceMatrix.needsUpdate = true;
    bgMesh.instanceColor.needsUpdate  = true;
    fgMesh.instanceMatrix.needsUpdate = true;
    fgMesh.instanceColor.needsUpdate  = true;
    scene.add(bgMesh);
    scene.add(fgMesh);
}
// DEFERRED to init block (depends on N from rebuildLatticeGeometry)
// rebuildSphereMeshes();

// Update InstancedMesh positions (called from applyPositions)
function _syncSphereMatrices(){
    if(!bgMesh||!fgMesh) return;
    // Matrices are set per-sphere in updateSpheres; we only need to sync
    // positions when geometry itself changed (jiggle deformation).
    // updateSpheres always writes fresh matrices, so we call it here too.
    updateSpheres();
}

// ═══ UNIFIED EDGE RENDERING PIPELINE ═══
// Each physical edge drawn exactly once. Priority: void > SC > base.
// Void wireframes removed — base/SC edges colored with void style when
// they belong to an actualized void polyhedron.
// ─── Edge lines ───────────────────────────────────────────────────────────────
const BASE_DIR_V = [
    new THREE.Vector3(1,1,1).normalize(), new THREE.Vector3(1,-1,-1).normalize(),
    new THREE.Vector3(-1,1,-1).normalize(), new THREE.Vector3(-1,-1,1).normalize(),
];
const BASE_COLORS = [0xff6b6b,0xffa94d,0x69db7c,0x74c0fc];
const VOID_TET_COLOR = 0xaaaaaa;
const VOID_OCT_COLOR = 0xffffff;
function edgeDirIdx(i,j){
    const dx=pos[j][0]-pos[i][0],dy=pos[j][1]-pos[i][1],dz=pos[j][2]-pos[i][2];
    const d=Math.sqrt(dx*dx+dy*dy+dz*dz);
    for(let k=0;k<4;k++){ const bv=BASE_DIR_V[k]; if(Math.abs(Math.abs((dx/d)*bv.x+(dy/d)*bv.y+(dz/d)*bv.z)-1)<0.07) return k; }
    return 0;
}

// ── Void edge classification (cached per stateVersion) ──
let _voidEdgeVersion = -1;
let _voidTetEdges = new Set(); // "min,max" base edge keys in actualized tet voids
let _voidOctSCs = new Set();   // SC ids in actualized oct voids
function _updateVoidEdgeSets(){
    if(_voidEdgeVersion === stateVersion) return;
    _voidEdgeVersion = stateVersion;
    _voidTetEdges.clear();
    _voidOctSCs.clear();
    for(const v of voidNeighborData){
        if(!v.actualized) continue;
        if(v.type === 'tet'){
            const n = v.nbrs;
            for(let a=0;a<4;a++) for(let b=a+1;b<4;b++)
                _voidTetEdges.add(Math.min(n[a],n[b])+','+Math.max(n[a],n[b]));
        } else if(v.type === 'oct'){
            for(const id of v.scIds) _voidOctSCs.add(id);
        }
    }
}

// ── Base edge rendering (single LineSegments with vertex colors) ──
let _baseLineObj = null, _baseLineMat = null;
function rebuildBaseLines(){
    _updateVoidEdgeSets();
    const graphOpacity = +document.getElementById('graph-opacity-slider').value / 100;
    if(_baseLineObj){
        // In-place update: positions + colors
        const pa = _baseLineObj.geometry.attributes.position;
        const ca = _baseLineObj.geometry.attributes.color;
        for(let e = 0; e < BASE_EDGES.length; e++){
            const [i, j] = BASE_EDGES[e];
            const off = e * 6;
            pa.array[off]=pos[i][0]; pa.array[off+1]=pos[i][1]; pa.array[off+2]=pos[i][2];
            pa.array[off+3]=pos[j][0]; pa.array[off+4]=pos[j][1]; pa.array[off+5]=pos[j][2];
            const key = Math.min(i,j)+','+Math.max(i,j);
            const hex = _voidTetEdges.has(key) ? VOID_TET_COLOR : BASE_COLORS[edgeDirIdx(i,j)];
            const r=((hex>>16)&0xff)/255, g=((hex>>8)&0xff)/255, b=(hex&0xff)/255;
            ca.array[off]=r; ca.array[off+1]=g; ca.array[off+2]=b;
            ca.array[off+3]=r; ca.array[off+4]=g; ca.array[off+5]=b;
        }
        pa.needsUpdate = true;
        ca.needsUpdate = true;
        _baseLineMat.opacity = graphOpacity;
        return;
    }
    // First build
    const n = BASE_EDGES.length;
    const posArr = new Float32Array(n * 6);
    const colArr = new Float32Array(n * 6);
    for(let e = 0; e < n; e++){
        const [i, j] = BASE_EDGES[e];
        const off = e * 6;
        posArr[off]=pos[i][0]; posArr[off+1]=pos[i][1]; posArr[off+2]=pos[i][2];
        posArr[off+3]=pos[j][0]; posArr[off+4]=pos[j][1]; posArr[off+5]=pos[j][2];
        const key = Math.min(i,j)+','+Math.max(i,j);
        const hex = _voidTetEdges.has(key) ? VOID_TET_COLOR : BASE_COLORS[edgeDirIdx(i,j)];
        const r=((hex>>16)&0xff)/255, g=((hex>>8)&0xff)/255, b=(hex&0xff)/255;
        colArr[off]=r; colArr[off+1]=g; colArr[off+2]=b;
        colArr[off+3]=r; colArr[off+4]=g; colArr[off+5]=b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    _baseLineMat = new THREE.LineBasicMaterial({vertexColors:true, transparent:true, opacity:graphOpacity, depthTest:false});
    _baseLineObj = new THREE.LineSegments(geo, _baseLineMat);
    _baseLineObj.renderOrder = 10;
    scene.add(_baseLineObj);
}
// DEFERRED to init block (depends on pos from rebuildLatticeGeometry)
// rebuildBaseLines();

// ─── Lattice level change ─────────────────────────────────────────────────────
function updateLatticeLevel(){
    if(jiggleActive) toggleJiggle();
    deactivateBigBang();
    if(placingExcitation) toggleExcitationPlacement();
    removeAllExcitations();
    latticeLevel=+document.getElementById('lattice-slider').value;
    document.getElementById('lattice-lv').textContent='L'+latticeLevel;
    activeSet.clear(); impliedSet.clear(); impliedBy.clear(); xonImpliedSet.clear(); blockedImplied.clear();
    selectedVert=-1; hoveredVert=-1; hoveredSC=-1;
    rebuildLatticeGeometry(latticeLevel);
    _solveCache = { key: -1, len: -1, result: null }; // invalidate solve cache
    if(typeof SolverProxy!=='undefined') SolverProxy.initLattice();
    rebuildScPairLookup();
    rebuildSphereMeshes();
    // Force full rebuild (lattice geometry changed — edge count differs)
    if(_baseLineObj){ scene.remove(_baseLineObj); _baseLineObj.geometry.dispose(); _baseLineObj=null; _baseLineMat=null; }
    rebuildVoidSpheres();
    rebuildBaseLines();
    rebuildShortcutLines();
    applySphereOpacity();
    sph.r=Math.max(7.5,latticeLevel*3.2);
    applyCamera();
    bumpState();
    resetTemporalK();
    updateCandidates(); updateSpheres(); updateStatus();
}

// ── SC edge rendering (per-SC objects for raycasting + highlight) ──
const scLineObjs={};
function rebuildShortcutLines(){
    _updateVoidEdgeSets();
    Object.values(scLineObjs).forEach(o=>{ scene.remove(o.line); o.line.geometry.dispose(); }); for(const k in scLineObjs) delete scLineObjs[k];
    const graphOpacity=+document.getElementById('graph-opacity-slider').value/100;
    activeSet.forEach(id=>{
        const s=SC_BY_ID[id];
        // Priority: void > rule annotation > default stype
        const isVoid = _voidOctSCs.has(id);
        const col = isVoid ? VOID_OCT_COLOR
            : _ruleAnnotations.scColors.has(id) ? _ruleAnnotations.scColors.get(id) : S_COLOR[s.stype];
        const opac = _ruleAnnotations.scOpacity.has(id) ? _ruleAnnotations.scOpacity.get(id) : graphOpacity;
        const mat=new THREE.LineBasicMaterial({color:col,transparent:true,opacity:opac,depthTest:false});
        const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...pos[s.a]),new THREE.Vector3(...pos[s.b])]);
        const line=new THREE.Line(geo,mat); line.renderOrder=11; line.userData={scId:id,implied:false};
        scene.add(line); scLineObjs[id]={line,mat,baseColor:col,implied:false};
    });
    impliedSet.forEach(id=>{
        const s=SC_BY_ID[id];
        // Priority: void > rule annotation > default stype (desaturated)
        const isVoid = _voidOctSCs.has(id);
        const baseCol = isVoid ? VOID_OCT_COLOR
            : _ruleAnnotations.scColors.has(id) ? _ruleAnnotations.scColors.get(id) : S_COLOR[s.stype];
        const r=((baseCol>>16)&0xff),g=((baseCol>>8)&0xff),b=baseCol&0xff;
        const grey=Math.round(r*0.3+g*0.3+b*0.3);
        const col=((Math.round(r*0.5+grey*0.5))<<16)|((Math.round(g*0.5+grey*0.5))<<8)|Math.round(b*0.5+grey*0.5);
        const pa=new THREE.Vector3(...pos[s.a]),pb=new THREE.Vector3(...pos[s.b]);
        const pts=[]; const SEGS=7;
        for(let i=0;i<SEGS;i++){ const t0=i/SEGS,t1=(i+0.45)/SEGS; pts.push(pa.clone().lerp(pb,t0),pa.clone().lerp(pb,t1)); }
        const opac = _ruleAnnotations.scOpacity.has(id) ? _ruleAnnotations.scOpacity.get(id) * 0.55 : graphOpacity * 0.55;
        const mat=new THREE.LineBasicMaterial({color:col,transparent:true,opacity:opac,depthTest:false});
        const geo=new THREE.BufferGeometry().setFromPoints(pts);
        const line=new THREE.LineSegments(geo,mat); line.renderOrder=11; line.userData={scId:id,implied:true};
        scene.add(line); scLineObjs[id]={line,mat,baseColor:col,implied:true};
    });
}
function setScHighlight(scId,on){
    const o=scLineObjs[scId]; if(!o) return;
    if(o.implied) return;
    o.mat.color.setHex(on?0xffffff:o.baseColor); o.mat.opacity=on?1.0:0.95;
}

// ─── Interaction ──────────────────────────────────────────────────────────────
let selectedVert=-1, hoveredVert=-1, hoveredSC=-1;
let candidatePartners=new Map(), candidateOk=new Map();

function updateCandidates(){
    // Cache: skip all tryAdd solver calls if selectedVert + stateVersion unchanged
    const key=`${selectedVert}|${stateVersion}`;
    if(key===candidateCacheKey) return;
    candidateCacheKey=key;
    _spheresDirty = true;

    candidatePartners.clear(); candidateOk.clear();
    if(selectedVert<0) return;
    scByVert[selectedVert].forEach(s=>{
        if(activeSet.has(s.id)||impliedSet.has(s.id)) return;
        const p=s.a===selectedVert?s.b:s.a;
        candidatePartners.set(p,s.id);
        candidateOk.set(p,tryAdd(s));
    });
}

let _spheresDirty = true;
function markSpheresDirty(){ _spheresDirty = true; }
function updateSpheres(){
    if(!bgMesh||!fgMesh) return;
    // Also mark dirty when rule annotations change
    if(_ruleAnnotations.dirty){ _spheresDirty = true; _ruleAnnotations.dirty = false; }
    if(!_spheresDirty) return;
    _spheresDirty = false;
    for(let i=0;i<N;i++){
        const isSel  = (i===selectedVert);
        const isCand = candidatePartners.has(i);
        const isHov  = (i===hoveredVert);
        const needFg = isSel||isCand||isHov;

        _iDummy.position.set(pos[i][0],pos[i][1],pos[i][2]);

        if(needFg){
            // hide in bg, show in fg
            _iDummy.scale.set(0,0,0); _iDummy.updateMatrix();
            bgMesh.setMatrixAt(i,_iDummy.matrix);
            _iDummy.scale.set(1,1,1); _iDummy.updateMatrix();
            fgMesh.setMatrixAt(i,_iDummy.matrix);

            if(isSel){
                _iColor.setRGB(1.0,1.0,0.1);
            } else if(isCand){
                const ok=candidateOk.get(i);
                if(ok)   _iColor.set(isHov?0x90d8ff:0x40b0ff);
                else     _iColor.set(isHov?0xff6060:0xff3030);
            } else {
                // hover only
                _iColor.setRGB(0.7,0.7,0.9);
            }
            fgMesh.setColorAt(i,_iColor);
        } else {
            // hide in fg, show in bg
            // ⚠️ NEVER vary sphere sizes. All spheres MUST be uniform scale (1,1,1).
            // Sphere size = physical radius in the FCC lattice. Varying it is
            // unphysical and visually misleading. This is PERMANENT — do not
            // add per-node scaling. Ever. Under any circumstances.
            _iDummy.scale.set(1,1,1); _iDummy.updateMatrix();
            bgMesh.setMatrixAt(i,_iDummy.matrix);
            _iDummy.scale.set(0,0,0); _iDummy.updateMatrix();
            fgMesh.setMatrixAt(i,_iDummy.matrix);
            // Use rule annotation color if available
            if(_ruleAnnotations.nodeColors.has(i)){
                const nc = _ruleAnnotations.nodeColors.get(i);
                _iColor.setRGB(((nc>>16)&0xff)/255, ((nc>>8)&0xff)/255, (nc&0xff)/255);
            } else if(voidTypes[i]==='tetrahedral') _iColor.setRGB(1.0,1.0,1.0);
            else _iColor.setRGB(0.04,0.04,0.04);
            bgMesh.setColorAt(i,_iColor);
        }
    }
    bgMesh.instanceMatrix.needsUpdate=true;
    bgMesh.instanceColor.needsUpdate =true;
    fgMesh.instanceMatrix.needsUpdate=true;
    fgMesh.instanceColor.needsUpdate =true;
}

function applyPositions(p){
    pos=p;
    _spheresDirty = true;
    if(_deferUIUpdates){
        _uiDirty = true;
    } else {
        updateVoidSpheres();   // actualize voids first (sets v.actualized flags)
        rebuildBaseLines();    // then edges use correct void state
        rebuildShortcutLines();
    }
}

function physicsUpdate(){
    bumpState(); // must be first — invalidates candidateOk and side panel caches
    const pFinal=detectImplied();
    applyPositions(pFinal);
    updateCandidates(); updateSpheres(); updateStatus();
}

// ─── Render loop ──────────────────────────────────────────────────────────────
// tickExcitations + void glow + render run every frame.
// All solver/DOM work only happens on state changes (not per-frame).
let _renderLastTime = performance.now();
function startRenderLoop(){
    (function loop(){
        requestAnimationFrame(loop);
        const now = performance.now();
        const dt = (now - _renderLastTime) * 0.001;
        _renderLastTime = now;
        tickExcitations(dt);
        if(_demoActive) _tickDemoXons(dt);
        if(typeof _tickAutoOrbit==='function') _tickAutoOrbit(dt);
        _updateVoidVisibility();
        tickOctVoids();
        renderer.render(scene, camera);
    })();
}
// DEFERRED to init block (depends on functions from all other files)
// startRenderLoop();

// ─── Kolmogorov complexity approximation (Lempel-Ziv 76) ──────────────
// Counts the number of distinct new substrings encountered when scanning
// a binary string left to right. This approximates Kolmogorov complexity:
//   K ≈ c(n) · log₂(n) / n
// where c(n) is the LZ76 complexity count and n is the string length.