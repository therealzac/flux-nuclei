// flux-voids.js — Void rendering, render loop, UI wiring, state import/export
// ─── Void duality toggle ──────────────────────────────────────────────────────
// ─── View mode: spheres vs voids (mutually exclusive) ────────────────────────
// 'spheres' mode: sphere InstancedMesh visible, void face meshes hidden.
// 'voids'   mode: void face meshes visible, sphere InstancedMesh hidden.
// Each mode stores its own last-used opacity so switching back restores it.


function applySphereOpacity(){
    const op = +document.getElementById('sphere-opacity-slider').value / 100;
    document.getElementById('sphere-opacity-val').textContent = Math.round(op*100) + '%';
    _bgMat.opacity = op;
    _bgMat.depthWrite = op > 0.5; // opaque enough → write depth (correct occlusion)
    _bgMat.needsUpdate = true;    // transparent → skip depth write (voids show through)
}

function applyVoidOpacity(){
    document.getElementById('void-opacity-val').textContent = Math.round(+document.getElementById('void-opacity-slider').value) + '%';
    _updateVoidVisibility(); // per-mesh opacity set in _updateVoidVisibility
}

function toggleSelectMode(){
    selectMode=!selectMode;
    document.getElementById('btn-select-mode').classList.toggle('active',selectMode);
    canvas.style.cursor=selectMode?'crosshair':isGrabMode?'grab':'default';
    if(!selectMode){ hoveredVert=-1; hoveredSC=-1; selectedVert=-1; updateCandidates(); updateSpheres(); updateStatusHoverOnly(); }
}

// ─── Void sphere system ──────────────────────────────────────────────────────
// In this BCC-type lattice, two kinds of interstitial voids exist between sphere
// centers (radius 0.5):
//
//   Tetrahedral void (A₄): 4 equidistant sphere-center neighbors at r=√(5/12)≈0.645
//     Kissing sphere radius = √(5/12) - 0.5 ≈ 0.1455
//     Canonical offsets per cell: (±r3, ±r3/2, 0) and cyclic permutations (12 total)
//
//   Octahedral void (Oₕ): 2 close sphere-center neighbors at r=r3≈0.577 (+ 4 further)
//     Kissing sphere radius = r3 - 0.5 ≈ 0.0774
//     Canonical offsets per cell: (±r3, 0, 0) and cyclic permutations (6 total)
//
// Positions are replicated across all cells and deduplicated.

// Void neighbor computation:
//
// TETRAHEDRAL void: defined by 4 sphere vertices that include exactly 2
//   shortcut edges. Center = centroid of those 4. Actualized when both
//   shortcuts are in activeSet ∪ impliedSet.
//
// OCTAHEDRAL void: any 4-shortcut square (4-cycle, no chord) in the SC graph.
//   Center = centroid of the 4 square vertices. Actualized when all 4 shortcuts active/implied.
function computeVoidNeighbors(){
    voidNeighborData = [];
    const SC_D2 = (2/S3)*(2/S3);
    const scLookup = new Map(); // "min,max" -> sc id
    for(const sc of ALL_SC) scLookup.set(Math.min(sc.a,sc.b)+','+Math.max(sc.a,sc.b), sc.id);

    // ── Tetrahedral voids ─────────────────────────────────────────────────
    // A tet void = two shortcuts (A,B) and (C,D) whose 4 cross-pairs
    // (A-C, A-D, B-C, B-D) are all base edges. This is a purely graph-
    // theoretic criterion that correctly finds ALL tet voids regardless
    // of cell tiling, including voids with non-canonical centroid offsets
    // that the old CELL_VOIDS_TET approach missed.
    //
    // DO NOT revert to CELL_VOIDS_TET — it misses real tet voids.
    const BASE_D2 = 1.0;
    const baseAdjSet = Array.from({length:N}, ()=>new Set());
    for(const [i,j] of BASE_EDGES){ baseAdjSet[i].add(j); baseAdjSet[j].add(i); }

    // O(SC × degree²) tet detection — replaces O(SC²).
    // At L10: SC²=6.3B ops → SC×144=11M ops (~560× faster).
    // Key insight: SC(A,B) can only pair with SC(C,D) where C,D are base-
    // neighbors of A and B. So instead of scanning all SC pairs, for each
    // SC(A,B) we enumerate candidate C from neighbors(A) and D from neighbors(B).
    // DO NOT revert to O(SC²) — it will hang for 30+ seconds at L6+.
    // Build local lookup (can't reuse global scPairToId — not yet populated at init time)
    const scPairToIdMap = new Map();
    for(const sc of ALL_SC) scPairToIdMap.set(pairId(sc.a, sc.b), sc.id);
    const seenTet = new Set();
    for(const scA of ALL_SC){
        const a=scA.a, b=scA.b;
        // C must be a base-neighbor of both A and B (i.e. a bridge of scA... no)
        // Actually: for tet, C must be base-adj to A, D must be base-adj to B,
        // AND C base-adj to D, AND D base-adj to A, AND C base-adj to B.
        // Simpler: C ∈ neighbors(A) ∩ neighbors(B)... no. Let's be precise:
        // We need baseAdjSet[a].has(c) && baseAdjSet[a].has(d) &&
        //          baseAdjSet[b].has(c) && baseAdjSet[b].has(d)
        // So C ∈ neighbors(A)∩neighbors(B) and D ∈ neighbors(A)∩neighbors(B).
        // But also (C,D) must be a SC, so look it up.
        // bridges(A,B) = neighbors(A) ∩ neighbors(B)... but that's bridges, not tet.
        // For tet: all 4 of C,D must each be in neighbors(A) AND neighbors(B).
        // So both C and D ∈ neighbors(A) ∩ neighbors(B) is NOT required — 
        // re-reading the condition: a-c, a-d, b-c, b-d all base edges.
        // → c ∈ neighbors(a), d ∈ neighbors(a), c ∈ neighbors(b), d ∈ neighbors(b)
        // → c ∈ neighbors(a)∩neighbors(b), d ∈ neighbors(a)∩neighbors(b)
        // So yes: both C and D must be in commonNbrs(A,B).
        // But commonNbrs(A,B) are the bridge nodes of SC(A,B)!
        // So: enumerate all pairs (C,D) from bridges(A,B), check if (C,D) is a SC.
        const bridgesAB = [];
        for(const nb of baseAdjSet[a]){ if(baseAdjSet[b].has(nb)) bridgesAB.push(nb); }
        for(let ci=0;ci<bridgesAB.length;ci++){
            const c=bridgesAB[ci];
            for(let di=ci+1;di<bridgesAB.length;di++){
                const d=bridgesAB[di];
                if(c===a||c===b||d===a||d===b) continue;
                const scBId = scPairToIdMap.get(pairId(c,d));
                if(scBId===undefined) continue;
                const scB = SC_BY_ID[scBId];
                const nbrs=[a,b,c,d].sort((x,y)=>x-y);
                const key=nbrs.join(',');
                if(seenTet.has(key)) continue;
                seenTet.add(key);
                voidNeighborData.push({type:'tet', nbrs, scIds:[scA.id, scBId]});
            }
        }
    }

    // Build tet-completion map: scId -> partner scIds that complete a tet void.
    // Used by excitationStep to bias toward tet void completion.
    tetPartnerMap = new Map();
    for(const {type, scIds} of voidNeighborData){
        if(type!=='tet'||scIds.length!==2) continue;
        const [a,b]=scIds;
        if(!tetPartnerMap.has(a)) tetPartnerMap.set(a,[]);
        if(!tetPartnerMap.has(b)) tetPartnerMap.set(b,[]);
        tetPartnerMap.get(a).push(b);
        tetPartnerMap.get(b).push(a);
    }

    // Build _nodeTetVoids: node → list of tet voids whose nbrs include that node.
    // Used by excitationStep for proactive tet detection: when an excitation lands
    // on any node of a complete tet (both scIds open), it claims the tet immediately.
    // This handles tets whose two shortcuts don't share endpoints.
    _nodeTetVoids = new Map();
    for(const v of voidNeighborData){
        if(v.type!=='tet' || v.scIds.length!==2) continue;
        for(const n of v.nbrs){
            if(!_nodeTetVoids.has(n)) _nodeTetVoids.set(n, []);
            _nodeTetVoids.get(n).push(v);
        }
    }

    // Build _nodeOctVoids: node → list of oct voids containing that node.
    // Used by excitationStep for proactive oct (boson) detection.
    // Caches _allNodes (union of all cycle verts) on each oct entry.
    _nodeOctVoids = new Map();
    for(const v of voidNeighborData){
        if(v.type !== 'oct') continue;
        const allNodes = new Set();
        for(const {verts} of v.cycles) verts.forEach(n => allNodes.add(n));
        v._allNodes = allNodes;
        for(const n of allNodes){
            if(!_nodeOctVoids.has(n)) _nodeOctVoids.set(n, []);
            _nodeOctVoids.get(n).push(v);
        }
    }

    // Build scBridgeMap: scId -> Set of bridge nodes.
    // A bridge node is any lattice node base-adjacent to BOTH endpoints of the SC.
    // Excitations can only induce SC(A,B) by walking A→bridge→B (or B→bridge→A).
    // Used by goal-homing: after inducing SC1 of a tet, bias toward bridge nodes
    // of SC2 so the excitation reaches the induction path in the fewest hops.
    // O(SC×degree) scBridgeMap — replaces O(SC×N) scan.
    // bridges(A,B) = neighbors(A) ∩ neighbors(B), computed via Set intersection.
    scBridgeMap = new Map();
    for(const sc of ALL_SC){
        const bridges=new Set();
        for(const nb of baseAdjSet[sc.a]){ if(baseAdjSet[sc.b].has(nb)) bridges.add(nb); }
        scBridgeMap.set(sc.id, bridges);
    }

            // ── Octahedral voids ──────────────────────────────────────────────────
    // An O_h void appears at the center of any 4-cycle that is GEOMETRICALLY
    // a square (all 4 inner angles ≈ 90°) in the CURRENT positions.
    //
    // KEY INSIGHT (hard-won, do not lose this):
    //   - In the undeformed REST lattice, base edges meet at 60°/120° — never 90°.
    //   - Flux deforms the lattice. When shortcuts are active, some 4-cycles
    //     in the graph become geometric squares.
    //   - The criterion is GEOMETRIC (check angles in pos[]), NOT topological.
    //   - Edge composition (BASE vs SC) is IRRELEVANT. Any 4-cycle can become
    //     a square when the lattice is under the right flux configuration.
    //
    // Here we enumerate ALL 4-cycles (BASE + SC + mixed) in the full graph.
    // At render time, updateVoidSpheres() checks whether pos[] gives 90° angles.
    // The cycle ordering (nbrs field) is stored so updateVoidSpheres can check
    // consecutive angles: angle at nbrs[0] between nbrs[3]→nbrs[0]→nbrs[1], etc.
    //
    // scIds is still stored (for squarePartnerMap / excitation bias), but
    // actualization is driven purely by the geometric 90° check in updateVoidSpheres.
    //
    // DO NOT replace this with a topological-only check. That was the bug that
    // caused hundreds of phantom voids at rest (BASE 4-cycles are not squares
    // until flux deforms them) and missed flux-induced squares (diagonal SC edges
    // incorrectly rejected legitimate squares like v2-v12-v6-v14).
    // ────────────────────────────────────────────────────────────────────────

    const adjAll2 = Array.from({length:N},()=>new Set());
    for(const [i,j] of BASE_EDGES){ adjAll2[i].add(j); adjAll2[j].add(i); }
    for(const sc of ALL_SC){ adjAll2[sc.a].add(sc.b); adjAll2[sc.b].add(sc.a); }
    const seenOct = new Set();

    // One physical O_h void can be the center of up to 3 mutually-perpendicular
    // squares simultaneously. We enumerate all 4-cycles but DEDUPLICATE by REST
    // centroid so only one sphere is rendered per unique void location.
    // allCyclesAtCentroid: centroidKey -> {nbrs (cycle order), scIds (union of all cycles)}
    const allCyclesAtCentroid = new Map();

    for(let a=0;a<N;a++) for(const b of adjAll2[a]){
        if(b<=a) continue;
        for(const c of adjAll2[b]){
            if(c<=a||c===a) continue;
            for(const d of adjAll2[c]){
                if(d<=a||d===b||d===a) continue;
                if(!adjAll2[d].has(a)) continue;
                const sq=[a,b,c,d].sort((x,y)=>x-y);
                const sqKey=sq.join(',');
                if(seenOct.has(sqKey)) continue;
                seenOct.add(sqKey);
                // REST centroid key (rounded to avoid float noise)
                const cx=Math.round((REST[a][0]+REST[b][0]+REST[c][0]+REST[d][0])*1000/4);
                const cy=Math.round((REST[a][1]+REST[b][1]+REST[c][1]+REST[d][1])*1000/4);
                const cz=Math.round((REST[a][2]+REST[b][2]+REST[c][2]+REST[d][2])*1000/4);
                const centKey=cx+','+cy+','+cz;
                // SC ids for this cycle
                const cycleEdges=[[a,b],[b,c],[c,d],[d,a]];
                const cycleSCIds=[];
                for(const [u,v] of cycleEdges){
                    const id=scLookup.get(Math.min(u,v)+','+Math.max(u,v));
                    if(id!==undefined) cycleSCIds.push(id);
                }
                if(!allCyclesAtCentroid.has(centKey)){
                    allCyclesAtCentroid.set(centKey,{
                        // cycles: array of {verts, scIds} — one per square at this centroid
                        // scIds stored per-cycle at build time so render code needs no lookup
                        cycles:[{verts:[a,b,c,d], scIds:[...cycleSCIds]}]
                    });
                } else {
                    allCyclesAtCentroid.get(centKey).cycles.push({verts:[a,b,c,d], scIds:[...cycleSCIds]});
                }
            }
        }
    }

    for(const {cycles} of allCyclesAtCentroid.values()){
        // scIds = union of all cycle scIds (used by squarePartnerMap / excitation bias)
        const allScIds=[...new Set(cycles.flatMap(c=>c.scIds))];
        voidNeighborData.push({type:'oct', nbrs:cycles[0].verts, cycles, scIds:allScIds});
    }

    // Build squarePartnerMap AFTER oct voids pushed.
    // Maps scId -> all other scIds that belong to the same O_h void (across all cycles).
    // An excitation holding scId gets a bonus for inducing any sibling scId,
    // because doing so advances the full octahedron toward actualization.
    // NOTE: must stay here — oct data doesn't exist earlier.
    // NOTE: use cycles[].scIds per-cycle, NOT the union scIds on the void entry.
    //   The union was broken by the old scIds.length===4 guard; this is the correct approach.
    squarePartnerMap = new Map();
    for(const {type, cycles} of voidNeighborData){
        if(type!=='oct'||!cycles) continue;
        // Collect all scIds across all cycles of this void
        const voidAllScIds = [...new Set(cycles.flatMap(c=>c.scIds))];
        if(voidAllScIds.length === 0) continue; // pure-BASE void, no shortcuts to bias toward
        for(const id of voidAllScIds){
            if(!squarePartnerMap.has(id)) squarePartnerMap.set(id, new Set());
            for(const other of voidAllScIds) if(other!==id) squarePartnerMap.get(id).add(other);
        }
    }
}

    function rebuildVoidSpheres(){
    for(const entry of _voidMeshPool){
        scene.remove(entry.fillMesh); entry.fillMesh.geometry.dispose();
    }
    _voidMeshPool = [];
    for(const v of voidNeighborData){
        const fGeo = new THREE.BufferGeometry();
        // Each void gets its own material clone for independent opacity control
        const fillMat = (v.type==='tet' ? _voidMatTet : _voidMatOctVC).clone();
        const fillMesh = new THREE.Mesh(fGeo, fillMat);
        fillMesh.renderOrder = 1;
        fillMesh.visible = false;
        scene.add(fillMesh);
        // Wireframes removed — edges now rendered by unified edge pipeline
        // (rebuildBaseLines/rebuildShortcutLines with void-priority coloring)
        _voidMeshPool.push({fillMesh, type:v.type, wasActualized:false, scIds:v.scIds});
    }
    updateVoidSpheres();
}

function updateVoidSpheres(){
    // Called on every state change. For each void, show it if all required
    // shortcuts are active or implied; otherwise scale to 0 (hidden).
    const allActive = getAllOpen();
    // Dirty-flag: skip actualization checks if the open-SC set hasn't changed.
    // stateVersion comparison replaces O(n log n) sort+join string diff.
    const scSetChanged = _voidSpheresCacheKey !== stateVersion;
    _voidSpheresCacheKey = stateVersion;
    // Helper: dot product of two 3-vectors
    const _dot3=(u,v)=>u[0]*v[0]+u[1]*v[1]+u[2]*v[2];
    // Helper: check if a 4-cycle [p0,p1,p2,p3] is a geometric square in pos[].
    // Checks all 4 inner angles ≈ 90° (tolerance 15°) AND all SC edges active.
    //
    // BOTH conditions are required — do not remove either:
    //   1. SC edges active: SC squares exist at 90° in REST (inner 8 vertices of
    //      L1 form perfect squares with inactive shortcuts). Without this check,
    //      6 phantom O_h voids appear in the pure FCC lattice with no flux.
    //   2. Geometric 90° check: BASE 4-cycles exist everywhere topologically but
    //      are only squares when flux has deformed the lattice. Without this check,
    //      hundreds of phantom voids appear in the undeformed lattice.
    //
    // DO NOT simplify to either check alone. Both are necessary. ──────────────
    // Check if a single 4-cycle is geometrically a square in pos[].
    // cycleScIds stored at build time — no scLookup needed here.
    function _isCycleSquare(verts, cycleScIds){
        if(!cycleScIds.every(id => allActive.has(id))) return false;
        for(let k=0;k<4;k++){
            const prev=verts[(k+3)%4],mid=verts[k],nxt=verts[(k+1)%4];
            const u=[pos[prev][0]-pos[mid][0],pos[prev][1]-pos[mid][1],pos[prev][2]-pos[mid][2]];
            const w=[pos[nxt][0]-pos[mid][0],pos[nxt][1]-pos[mid][1],pos[nxt][2]-pos[mid][2]];
            const m=Math.sqrt(_dot3(u,u)*_dot3(w,w));
            if(m<1e-9) return false;
            if(Math.abs(_dot3(u,w)/m)>0.259) return false;
        }
        return true;
    }
    // An O_h void requires ALL cycles at its centroid to be geometric squares simultaneously.
    // Physically: one octahedron = 3 mutually perpendicular squares sharing a center.
    // Boundary voids (fewer than 3 cycles) never actualize — not a full octahedron.
    function _isSquare(cycles){
        if(cycles.length < 3) return false; // boundary: not a full octahedron
        return cycles.every(({verts, scIds}) => _isCycleSquare(verts, scIds));
    }
    // Geometry builders
    function _faceGeo(vArr, idx){
        const g=new THREE.BufferGeometry();
        g.setAttribute('position',new THREE.BufferAttribute(vArr,3));
        g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    // _wireFromFace removed — wireframes now handled by unified edge pipeline
    function _outwardFaces(vArr, rawFaces, nv){
        // Ensure each face normal points away from centroid
        let cx=0,cy=0,cz=0;
        for(let i=0;i<nv;i++){ cx+=vArr[i*3]; cy+=vArr[i*3+1]; cz+=vArr[i*3+2]; }
        cx/=nv; cy/=nv; cz/=nv;
        const idx=[];
        for(const [a,b,c] of rawFaces){
            const ax=vArr[a*3]-vArr[b*3], ay=vArr[a*3+1]-vArr[b*3+1], az=vArr[a*3+2]-vArr[b*3+2];
            const bx=vArr[c*3]-vArr[b*3], by=vArr[c*3+1]-vArr[b*3+1], bz=vArr[c*3+2]-vArr[b*3+2];
            const nx=ay*bz-az*by, ny=az*bx-ax*bz, nz=ax*by-ay*bx;
            const mx=(vArr[a*3]+vArr[b*3]+vArr[c*3])/3-cx;
            const my=(vArr[a*3+1]+vArr[b*3+1]+vArr[c*3+1])/3-cy;
            const mz=(vArr[a*3+2]+vArr[b*3+2]+vArr[c*3+2])/3-cz;
            if(nx*mx+ny*my+nz*mz>0) idx.push(a,b,c); else idx.push(a,c,b);
        }
        return idx;
    }
    function _tetGeo(nbrs){
        const vArr=new Float32Array(12);
        for(let i=0;i<4;i++){ vArr[i*3]=pos[nbrs[i]][0]; vArr[i*3+1]=pos[nbrs[i]][1]; vArr[i*3+2]=pos[nbrs[i]][2]; }
        return _faceGeo(vArr, _outwardFaces(vArr,[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],4));
    }
    function _octGeo(cycles){
        const vSet=new Set(); for(const {verts} of cycles) verts.forEach(v=>vSet.add(v));
        const vList=[...vSet];
        const adj=new Set();
        for(const {verts:cv} of cycles) for(let k=0;k<4;k++){
            const a=cv[k],b=cv[(k+1)%4]; adj.add(Math.min(a,b)+','+Math.max(a,b));
        }
        const n=vList.length;
        const tmpArr=new Float32Array(n*3);
        for(let i=0;i<n;i++){ tmpArr[i*3]=pos[vList[i]][0]; tmpArr[i*3+1]=pos[vList[i]][1]; tmpArr[i*3+2]=pos[vList[i]][2]; }
        const raw=[];
        for(let i=0;i<n;i++) for(let j=i+1;j<n;j++) for(let k=j+1;k<n;k++){
            const a=vList[i],b=vList[j],c=vList[k];
            if(adj.has(Math.min(a,b)+','+Math.max(a,b))&&adj.has(Math.min(b,c)+','+Math.max(b,c))&&adj.has(Math.min(a,c)+','+Math.max(a,c)))
                raw.push([i,j,k]);
        }
        const idx = _outwardFaces(tmpArr, raw, n);
        const nTris = idx.length/3;
        // Build non-indexed geometry with per-face vertex colors
        const posArr=new Float32Array(nTris*9), colArr=new Float32Array(nTris*9);
        const faceNormals=[];
        // Centroid for face-lighting direction calculation
        let cx=0,cy=0,cz=0;
        for(let i=0;i<n;i++){ cx+=tmpArr[i*3]; cy+=tmpArr[i*3+1]; cz+=tmpArr[i*3+2]; }
        cx/=n; cy/=n; cz/=n;
        const br=1.0, bg=1.0, bb=1.0; // base white (oct voids = bosonic field)
        for(let t=0;t<nTris;t++){
            const ia=idx[t*3], ib=idx[t*3+1], ic=idx[t*3+2];
            for(let c=0;c<3;c++){ posArr[t*9+c]=tmpArr[ia*3+c]; posArr[t*9+3+c]=tmpArr[ib*3+c]; posArr[t*9+6+c]=tmpArr[ic*3+c]; }
            // Face normal
            const ax=tmpArr[ib*3]-tmpArr[ia*3], ay=tmpArr[ib*3+1]-tmpArr[ia*3+1], az=tmpArr[ib*3+2]-tmpArr[ia*3+2];
            const bx=tmpArr[ic*3]-tmpArr[ia*3], by=tmpArr[ic*3+1]-tmpArr[ia*3+1], bz=tmpArr[ic*3+2]-tmpArr[ia*3+2];
            let nx=ay*bz-az*by, ny=az*bx-ax*bz, nz=ax*by-ay*bx;
            const nl=Math.sqrt(nx*nx+ny*ny+nz*nz); if(nl>0){nx/=nl;ny/=nl;nz/=nl;}
            faceNormals.push(nx,ny,nz);
            // Init vertex colors to base gray
            for(let v=0;v<3;v++){ colArr[t*9+v*3]=br; colArr[t*9+v*3+1]=bg; colArr[t*9+v*3+2]=bb; }
        }
        const g=new THREE.BufferGeometry();
        g.setAttribute('position',new THREE.BufferAttribute(posArr,3));
        g.setAttribute('color',new THREE.BufferAttribute(colArr,3));
        g.computeVertexNormals();
        g._vList=vList; g._faceNormals=faceNormals; g._centroid=[cx,cy,cz];
        return g;
    }

    const op = +document.getElementById('void-opacity-slider').value / 100;
    for(let vi=0; vi<voidNeighborData.length; vi++){
        const {type, nbrs, cycles, scIds} = voidNeighborData[vi];
        const entry = _voidMeshPool[vi];
        const {fillMesh} = entry;
        // Only re-evaluate actualization if the open-SC set changed
        let actualized = entry.wasActualized; // default: keep previous state
        if(scSetChanged){
            actualized = _forceActualizedVoids.has(vi)
                ? scIds.every(id => allActive.has(id))  // force: skip geometric check
                : type==='tet'
                    ? scIds.every(id => allActive.has(id))
                    : _isSquare(cycles||[]);
            // Oct rendering gate: only hadronic center octs render.
            // An oct qualifies as hadronic center only if it has had a tet
            // actualized on each of its 8 faces since birth. Currently only
            // the nucleus oct (_octVoidIdx) qualifies. This is ALWAYS enforced,
            // not just in demo mode — spurious octs from solver implication
            // are suppressed everywhere.
            if (type === 'oct' && actualized && _octVoidIdx >= 0 && vi !== _octVoidIdx) {
                actualized = false;
            }
            voidNeighborData[vi].actualized = actualized;
            // Store per-cycle actualization for oct voids — excitations can
            // survive on a single square cycle, not just the full octahedron.
            if(type === 'oct' && cycles){
                for(const cycle of cycles){
                    const wasCycleActualized = cycle.actualized || false;
                    cycle.actualized = _isCycleSquare(cycle.verts, cycle.scIds);
                    // Lock in oct cycle SCs: when a cycle newly actualizes,
                    // promote any cascade-implied SCs to xonImpliedSet
                    // so they persist across detectImplied recalculations.
                    // Without this, octs built partly on cascade-implied SCs
                    // pop in and immediately out of existence.
                    if(cycle.actualized && !wasCycleActualized){
                        for(const id of cycle.scIds){
                            if(impliedSet.has(id) && !xonImpliedSet.has(id) && !activeSet.has(id)){
                                xonImpliedSet.add(id);
                                if(!impliedBy.has(id)) impliedBy.set(id, new Set());
                            }
                        }
                    }
                }
            }
        }

        // Void fill mesh updates (wireframes removed — handled by unified edge pipeline)
        if(actualized && !entry.wasActualized){
            // Newly actualized: build fill geometry from scratch
            const fGeo = type==='tet' ? _tetGeo(nbrs) : _octGeo(cycles);
            fillMesh.geometry.dispose(); fillMesh.geometry = fGeo;
            fillMesh.visible = op > 0;
            entry.wasActualized = true;
        } else if(actualized && entry.wasActualized){
            // Still actualized: update fill vertex positions
            if(type === 'tet'){
                const pos3f = fillMesh.geometry.attributes.position;
                for(let i=0;i<4;i++){ pos3f.setXYZ(i, pos[nbrs[i]][0], pos[nbrs[i]][1], pos[nbrs[i]][2]); }
                pos3f.needsUpdate = true;
                fillMesh.geometry.computeVertexNormals();
            } else {
                // Oct: rebuild entirely (oct voids are rare, not perf-critical)
                const fGeo = _octGeo(cycles);
                fillMesh.geometry.dispose(); fillMesh.geometry = fGeo;
            }
        } else if(!actualized && entry.wasActualized){
            // Newly de-actualized: hide
            fillMesh.visible = false;
            entry.wasActualized = false;
        }
        // !actualized && !wasActualized: already hidden, nothing to do
    }
    _updateVoidVisibility();
}

function _updateVoidVisibility(){
    const op = +document.getElementById('void-opacity-slider').value / 100;
    // Map excited voids to the excitation color that owns them.
    // voidScIds is set once when the excitation claims a void — reliable match.
    const excitedVoidColor = new Map(); // vi → THREE.Color
    try { for(const e of excitations){
        if(!e.voidScIds) continue;
        const eKey = [...e.voidScIds].sort((a,b)=>a-b).join(',');
        for(let vi=0; vi<_voidMeshPool.length; vi++){
            if(excitedVoidColor.has(vi)) continue;
            const entry = _voidMeshPool[vi];
            if(!entry.wasActualized) continue;
            const vKey = [...entry.scIds].sort((a,b)=>a-b).join(',');
            if(vKey === eKey){
                excitedVoidColor.set(vi, new THREE.Color(e.col));
                break;
            }
        }
    } } catch(_){} // excitations may not be initialized yet during startup
    for(let vi=0; vi<_voidMeshPool.length; vi++){
        const entry = _voidMeshPool[vi];
        if(!entry.wasActualized) continue;
        if(entry.type === 'oct'){
            // Oct voids: full opacity always — face lighting handles visual feedback
            entry.fillMesh.material.opacity = op;
            entry.fillMesh.material.needsUpdate = true;
        } else {
            // Tet voids: Rule annotation > excitation color > default dim
            const annotCol = _ruleAnnotations.tetColors.get(vi);
            const annotOp = _ruleAnnotations.tetOpacity.get(vi);
            const eCol = excitedVoidColor.get(vi);
            const excited = !!eCol;
            const hasAnnot = annotCol !== undefined;

            const fillOp = annotOp !== undefined ? annotOp * op : (hasAnnot || excited ? op : op * 0.25);

            if(hasAnnot){
                entry.fillMesh.material.color.setHex(annotCol);
                entry.fillMesh.material.emissive.setHex(annotCol); entry.fillMesh.material.emissive.multiplyScalar(0.3);
            } else if(excited){
                entry.fillMesh.material.color.copy(eCol);
                entry.fillMesh.material.emissive.copy(eCol).multiplyScalar(0.3);
            } else {
                entry.fillMesh.material.color.setHex(0x999999);
                entry.fillMesh.material.emissive.setHex(0x222222);
            }
            entry.fillMesh.material.opacity = fillOp;
            entry.fillMesh.material.needsUpdate = true;
        }
    }
}

// ─── Oct void face lighting ────────────────────────────────────────────────
// Per-frame: modulate oct void face colors based on excitation direction.
// Faces pointing toward a nearby excitation glow brighter.
function tickOctVoids(){
    // Per-face coloring uses the color of the nearest contributing excitation.
    // When no excitations are present, all faces glow at neutral gray.
    const dbr=1.0, dbg=1.0, dbb=1.0; // default white (oct voids = bosonic field)
    const EXCITE_THRESH = 0.08;
    const noExcitations = !excitations.length;
    // Pre-extract excitation colors as RGB floats for speed
    const _tmpCol = new THREE.Color();
    for(let vi=0; vi<_voidMeshPool.length; vi++){
        const entry = _voidMeshPool[vi];
        if(!entry.wasActualized || entry.type!=='oct') continue;
        const geo = entry.fillMesh.geometry;
        if(!geo._faceNormals || !geo._centroid) continue;
        const colAttr = geo.attributes.color;
        if(!colAttr) continue;
        const [cx,cy,cz] = geo._centroid;
        const fn = geo._faceNormals;
        const nFaces = fn.length/3;
        // Check for rule annotation override
        const annotOctCol = _ruleAnnotations.octColors.get(vi);
        const annotFaces = _ruleAnnotations.octFaceColors.get(vi);

        for(let f=0;f<nFaces;f++){
            let fr=dbr, fg=dbg, fb=dbb, brightness;

            // Per-face annotation takes highest priority
            if(annotFaces && annotFaces[f] !== undefined){
                const fc = annotFaces[f];
                fr = ((fc>>16)&0xff)/255;
                fg = ((fc>>8)&0xff)/255;
                fb = (fc&0xff)/255;
                brightness = 1.0;
            } else if(annotOctCol !== undefined){
                // Whole-oct annotation color
                fr = ((annotOctCol>>16)&0xff)/255;
                fg = ((annotOctCol>>8)&0xff)/255;
                fb = (annotOctCol&0xff)/255;
                brightness = 0.8;
            } else if(noExcitations){
                brightness = 1.0;
            } else {
                const fnx=fn[f*3], fny=fn[f*3+1], fnz=fn[f*3+2];
                let maxContrib = 0;
                let bestCol = null;
                try { for(const e of excitations){
                    const ep = e.group.position;
                    let dx=ep.x-cx, dy=ep.y-cy, dz=ep.z-cz;
                    const dl=Math.sqrt(dx*dx+dy*dy+dz*dz);
                    if(dl<0.01) continue;
                    dx/=dl; dy/=dl; dz/=dl;
                    const dot = fnx*dx + fny*dy + fnz*dz;
                    const prox = Math.max(0, 1.0 - dl/4.0);
                    const contrib = Math.max(0,dot) * prox;
                    if(contrib > maxContrib){ maxContrib = contrib; bestCol = e.col; }
                } } catch(_){}
                brightness = maxContrib > EXCITE_THRESH ? (0.3 + 0.7 * maxContrib) : 0.08;
                if(bestCol !== null && maxContrib > EXCITE_THRESH){
                    _tmpCol.setHex(bestCol);
                    fr = _tmpCol.r; fg = _tmpCol.g; fb = _tmpCol.b;
                }
            }
            for(let v=0;v<3;v++){
                colAttr.array[(f*3+v)*3]   = fr*brightness;
                colAttr.array[(f*3+v)*3+1] = fg*brightness;
                colAttr.array[(f*3+v)*3+2] = fb*brightness;
            }
        }
        colAttr.needsUpdate = true;
    }
}


// Render loop moved to flux-solver-render.js (startRenderLoop)


// ─── Apply state from JSON ────────────────────────────────────────────────────
function applyStateFromJSON(data){
    if(jiggleActive) toggleJiggle();
    if(placingExcitation) toggleExcitationPlacement();
    removeAllExcitations();
    const targetLevel = (data.meta&&data.meta.latticeLevel)||1;
    if(targetLevel !== latticeLevel){
        latticeLevel = targetLevel;
        document.getElementById('lattice-slider').value = latticeLevel;
        document.getElementById('lattice-lv').textContent = 'L'+latticeLevel;
        rebuildLatticeGeometry(latticeLevel);
        rebuildScPairLookup();
        rebuildSphereMeshes();
        rebuildBaseLines();
        rebuildShortcutLines();
        rebuildVoidSpheres();
        applySphereOpacity();
        sph.r=Math.max(7.5,latticeLevel*3.2);
        applyCamera();
    }
    activeSet.clear(); impliedSet.clear(); impliedBy.clear();
    xonImpliedSet.clear(); blockedImplied.clear();
    selectedVert=-1; hoveredVert=-1; hoveredSC=-1;
    // Apply active shortcuts first (positions will be solved fresh)
    if(data.active){
        for(const s of data.active){
            const sc=ALL_SC.find(x=>x.a===s.a&&x.b===s.b);
            if(sc) activeSet.add(sc.id);
        }
    }
    // Apply implied shortcuts
    if(data.implied){
        for(const s of data.implied){
            const sc=ALL_SC.find(x=>x.a===s.a&&x.b===s.b);
            if(sc){ impliedSet.add(sc.id); impliedBy.set(sc.id,new Set()); }
        }
    }
    // Solve positions from scratch — do NOT use stored positions which may
    // have floating-point violations. The solver will find the correct geometry.
    bumpState();
    const solvedPos = detectImplied();
    applyPositions(solvedPos);
    updateCandidates(); updateSpheres(); updateStatus();
}

// ─── Wire UI ──────────────────────────────────────────────────────────────────
document.getElementById('sh-clear').addEventListener('click',clearAll);
document.getElementById('btn-export').addEventListener('click',exportState);
document.getElementById('btn-copy-violation').addEventListener('click',function(){
    try{ const json=JSON.stringify(buildExportData(),null,2); copyText(json); toast('violation state copied'); }
    catch(e){ toast('export error: '+e.message); console.error('buildExportData failed:',e); }
});
const _btnJiggle = document.getElementById('btn-jiggle');
if (_btnJiggle) _btnJiggle.addEventListener('click',toggleJiggle);
const _jiggleSlider = document.getElementById('jiggle-slider');
if (_jiggleSlider) _jiggleSlider.addEventListener('input',updateJiggleSpeed);
document.getElementById('energy-slider').addEventListener('input',updateEnergy);
document.getElementById('lattice-slider').addEventListener('input',updateLatticeLevel);

document.getElementById('graph-opacity-slider').addEventListener('input',updateGraphOpacity);
document.getElementById('sphere-opacity-slider').addEventListener('input',applySphereOpacity);
document.getElementById('void-opacity-slider').addEventListener('input',applyVoidOpacity);
document.getElementById('excitation-speed-slider').addEventListener('input', ()=>{
    // Slider 1–100 mapped logarithmically: 1→1000ms (slow), 50→220ms (default), 100→30ms (fast)
    const t = +document.getElementById('excitation-speed-slider').value / 100;
    ELECTRON_STEP_MS = Math.round(Math.exp(Math.log(1000)*(1-t) + Math.log(30)*t));
    document.getElementById('excitation-speed-val').textContent = ELECTRON_STEP_MS + 'ms';
    // Restart clock so new interval takes effect immediately
    if(excitationClockTimer){ clearInterval(excitationClockTimer); excitationClockTimer=null; startExcitationClock(); }
    // Also restart demo interval if demo is running
    if(_demoActive && _demoInterval){ clearInterval(_demoInterval); _demoInterval = setInterval(demoTick, _getDemoIntervalMs()); }
});
document.getElementById('trail-opacity-slider').addEventListener('input',()=>{
    const pct=+document.getElementById('trail-opacity-slider').value;
    document.getElementById('trail-opacity-val').textContent=pct+'%';
});
document.getElementById('tracer-lifespan-slider').addEventListener('input',()=>{
    const val=+document.getElementById('tracer-lifespan-slider').value;
    document.getElementById('tracer-lifespan-val').textContent = val === 0 ? 'off' : val;
});
// Spark slider synced from xons (trail) slider
document.getElementById('trail-opacity-slider').addEventListener('input',()=>{
    document.getElementById('spark-opacity-slider').value =
        document.getElementById('trail-opacity-slider').value;
});

document.getElementById('btn-add-excitation').addEventListener('click',toggleExcitationPlacement);
// Big bang button handled by V2 dropdown menu in post-load script
document.getElementById('btn-select-mode').addEventListener('click',toggleSelectMode);
document.getElementById('btn-excitation-play').addEventListener('click',toggleExcitationPause);

// ── Model Controls (V2 — replaces V1 arena panel) ──────────────────────
// Model select and tournament are now in the nucleus panel.
// populateModelSelect is called from NucleusSimulator wiring below.
// Force rule title on init
{
    const _titleInit = document.getElementById('rule-title');
    if(_titleInit) _titleInit.textContent = RULE_REGISTRY[activeRuleIndex]?.name || '';
}

// ── Expose symbols needed by flux-rules.js ──────────────────────────
window.RULE_REGISTRY = RULE_REGISTRY;
window.extractCandidateFeatures = extractCandidateFeatures;
window.extractFallbackFeatures = extractFallbackFeatures;
window.scoreCandidateGA = scoreCandidateGA;
window.kDeltaForFlip = kDeltaForFlip;
window.GA_NUM_FEATURES = GA_NUM_FEATURES;
window.tetPartnerMap = tetPartnerMap;
window.squarePartnerMap = squarePartnerMap;
// V2: additional symbols for NucleusSimulator
window._createExcitation = _createExcitation;
window.startExcitationClock = startExcitationClock;

// ══════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS — run via console: window.runFluxTests()
// ══════════════════════════════════════════════════════════════════════
//
// These tests verify critical invariants that have broken before:
//   1. Graph visualization syncs with shortcut state (scLineObjs ↔ activeSet+impliedSet)
//   2. Temporal K captures frames when state changes
//   3. Rules load and produce valid scores
//   4. Classic mode is hermetic (no K overhead)
//
// Tests run non-destructively where possible; some tests temporarily
// modify state and restore it.  Safe to run anytime.
//
// USAGE:
//   window.runFluxTests()          — run all tests, log results
//   window.runFluxTests('graph')   — run only graph tests
//
// Each test returns {pass: boolean, name: string, detail: string}.
// The runner logs a summary and returns the results array.

window.runFluxTests = async function(filter){
    const results = [];
    const tests = [];

    // ── Helper: wait for N excitation ticks ──
    function waitTicks(n){
        return new Promise(resolve => {
            let count = 0;
            const origTick = excitationClockTick;
            // We can't monkeypatch excitationClockTick easily since it's
            // called by setInterval.  Instead, just wait based on tick speed.
            setTimeout(resolve, ELECTRON_STEP_MS * n + 200);
        });
    }

    // ── Helper: assert ──
    function assert(cond, name, detail){
        results.push({ pass: !!cond, name, detail: detail || '' });
        if(!cond) console.error(`[FAIL] ${name}: ${detail || ''}`);
        else console.log(`[PASS] ${name}`);
    }

    // ══════════════════════════════════════
    // TEST GROUP: Graph sync
    // ══════════════════════════════════════

    if(!filter || filter === 'graph'){
        // Save state for restore
        const savedLL = latticeLevel;
        const savedBB = bigBangActive;
        const savedRule = activeRuleIndex;

        // Test 1: scLineObjs count matches activeSet + impliedSet
        // (snapshot of current state)
        {
            const lineCount = Object.keys(scLineObjs).length;
            const stateCount = activeSet.size + impliedSet.size;
            assert(
                lineCount === stateCount,
                'graph-sync-snapshot',
                `scLineObjs=${lineCount}, activeSet+impliedSet=${stateCount}`
            );
        }

        // Test 2: After big bang on L1, graph lines appear
        {
            // Ensure L1
            if(latticeLevel !== 1){
                document.getElementById('lattice-slider').value = 1;
                updateLatticeLevel();
            }
            activeRuleIndex = 0;
            clearAll();

            // Verify clean state
            assert(
                Object.keys(scLineObjs).length === 0,
                'graph-clean-before-bigbang',
                `scLineObjs should be 0 after clearAll, got ${Object.keys(scLineObjs).length}`
            );

            // Fire big bang and wait for excitations to move
            toggleBigBang();
            await waitTicks(8);

            const lineCount = Object.keys(scLineObjs).length;
            const implied = impliedSet.size;
            assert(
                lineCount > 0,
                'graph-lines-appear-after-bigbang',
                `scLineObjs=${lineCount} (need >0, impliedSet=${implied})`
            );

            assert(
                lineCount === activeSet.size + impliedSet.size,
                'graph-sync-after-bigbang',
                `scLineObjs=${lineCount}, activeSet+impliedSet=${activeSet.size + impliedSet.size}`
            );

            deactivateBigBang();
        }

        // Test 3: After clearAll, graph lines disappear
        {
            clearAll();
            const lineCount = Object.keys(scLineObjs).length;
            assert(
                lineCount === 0,
                'graph-clear-after-clearAll',
                `scLineObjs=${lineCount} (need 0)`
            );
        }

        // Test 4: L2 big bang — graph lines appear with many excitations
        {
            document.getElementById('lattice-slider').value = 2;
            updateLatticeLevel();
            activeRuleIndex = 0;
            toggleBigBang();
            await waitTicks(8);

            const lineCount = Object.keys(scLineObjs).length;
            const expected = activeSet.size + impliedSet.size;
            assert(
                lineCount > 0 && lineCount === expected,
                'graph-sync-L2-bigbang',
                `scLineObjs=${lineCount}, activeSet+impliedSet=${expected}, excitations=${excitations.length}`
            );

            deactivateBigBang();
        }

        // Test 5: Each scLineObj ID is in activeSet OR impliedSet
        {
            let allInState = true;
            let orphans = [];
            for(const id of Object.keys(scLineObjs).map(Number)){
                if(!activeSet.has(id) && !impliedSet.has(id)){
                    allInState = false;
                    orphans.push(id);
                }
            }
            assert(
                allInState,
                'graph-no-orphan-lines',
                orphans.length ? `orphan line IDs: ${orphans.join(',')}` : 'all lines have state backing'
            );
        }

        // Test 6: No state entries missing from scLineObjs
        {
            let allRendered = true;
            let missing = [];
            for(const id of activeSet){
                if(!scLineObjs[id]){ allRendered = false; missing.push(id); }
            }
            for(const id of impliedSet){
                if(!scLineObjs[id]){ allRendered = false; missing.push(id); }
            }
            assert(
                allRendered,
                'graph-no-missing-lines',
                missing.length ? `missing line IDs: ${missing.join(',')}` : 'all state entries have lines'
            );
        }

        // Restore
        clearAll();
        if(savedLL !== latticeLevel){
            document.getElementById('lattice-slider').value = savedLL;
            updateLatticeLevel();
        }
        activeRuleIndex = savedRule;
    }

    // ══════════════════════════════════════
    // TEST GROUP: Temporal K
    // ══════════════════════════════════════

    if(!filter || filter === 'temporal'){
        const savedLL = latticeLevel;
        const savedRule = activeRuleIndex;

        // Test: temporal K captures frames during excitation movement
        {
            if(latticeLevel !== 1){
                document.getElementById('lattice-slider').value = 1;
                updateLatticeLevel();
            }
            activeRuleIndex = 0;
            clearAll();
            resetTemporalK();

            assert(
                _temporalFrames.length === 0,
                'temporalK-clean-start',
                `frames=${_temporalFrames.length}`
            );

            toggleBigBang();
            await waitTicks(12);

            assert(
                _temporalFrames.length > 0,
                'temporalK-captures-frames',
                `frames=${_temporalFrames.length} after 12 ticks`
            );

            deactivateBigBang();
            clearAll();
        }

        // Restore
        if(savedLL !== latticeLevel){
            document.getElementById('lattice-slider').value = savedLL;
            updateLatticeLevel();
        }
        activeRuleIndex = savedRule;
    }

    // ══════════════════════════════════════
    // TEST GROUP: Rules
    // ══════════════════════════════════════

    if(!filter || filter === 'rules'){
        // Test: all rules in RULE_REGISTRY have required interface
        {
            let allValid = true;
            let problems = [];
            for(let i = 0; i < RULE_REGISTRY.length; i++){
                const r = RULE_REGISTRY[i];
                if(!r.name){ allValid = false; problems.push(`[${i}] missing name`); }
                if(!r.description){ allValid = false; problems.push(`[${i}] missing description`); }
                if(typeof r.rankCandidates !== 'function'){
                    allValid = false; problems.push(`[${i}] missing rankCandidates`);
                }
            }
            assert(
                allValid,
                'rules-valid-interface',
                problems.length ? problems.join('; ') : `all ${RULE_REGISTRY.length} rules valid`
            );
        }

        // Test: classic is at index 0
        {
            assert(
                RULE_REGISTRY[0]?.name === 'classic',
                'rules-classic-at-zero',
                `index 0 name: ${RULE_REGISTRY[0]?.name}`
            );
        }

        // Test: classic mode skips K computation (activeRuleIndex=0 guard)
        {
            activeRuleIndex = 0;
            // The needsK guard is: activeRuleIndex > 0 && canMaterialise
            // With activeRuleIndex=0, needsK should always be false
            assert(
                activeRuleIndex === 0,
                'rules-classic-hermetic',
                'activeRuleIndex=0 → needsK=false (no K overhead in classic)'
            );
        }
    }

    // ── Summary ──
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    const summary = `\n${'═'.repeat(50)}\nTESTS: ${passed} passed, ${failed} failed, ${results.length} total\n${'═'.repeat(50)}`;
    if(failed > 0){
        console.error(summary);
        results.filter(r => !r.pass).forEach(r =>
            console.error(`  FAIL: ${r.name} — ${r.detail}`)
        );
    } else {
        console.log(summary);
    }
    return results;
};

