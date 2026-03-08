// ══════════════════════════════════════════════════════════════════════════
// FLUX RULES — Tick-Based Lattice Deformation Rules
// ══════════════════════════════════════════════════════════════════════════
//
// PURPOSE
// -------
// Rules compete in a tournament to produce the best "big bang" lattice
// simulation. Rules control which shortcuts (flux tubes) are open/closed
// each tick, creating a living, jiggling lattice.
//
// EVALUATION CRITERIA (ordered by importance):
//   1. PHYSICAL PLAUSIBILITY — how closely does the rule implement
//      the principles of Flux Dynamics (see PDF)?
//   2. ANIMATION QUALITY — how well does the rule visually show
//      what it's doing? (SC colors, node highlights, dynamic updates)
//   3. MOTION (Hamming distance) — sustained lattice jiggling
//   4. TEMPORAL K — variety in motion patterns (not repetitive)
//
// FITNESS = 50% motion + 20% temporal K + 30% animation quality
// CRASH = 20 consecutive ticks with near-zero motion
//
// ANIMATION API (available in tick context as ctx.annotate):
//   ctx.annotate.scColor(scId, hexColor)   — color a shortcut line
//   ctx.annotate.nodeColor(nodeIdx, hex)    — color a node sphere
//   ctx.annotate.scOpacity(scId, 0-1)      — set SC opacity
//   ctx.annotate.nodeScale — REMOVED (sphere sizes must never vary)
//   ctx.annotate.clear()                    — reset all annotations
//   ctx.annotate.colors.RED/GREEN/BLUE/...  — preset gauge group colors
//
//
// ═══════════════════════════════════════════════════════════════════════
// FLUX DYNAMICS PHYSICS REFERENCE (from Flux Dynamics (1).pdf)
// ═══════════════════════════════════════════════════════════════════════
//
// THE LATTICE
// -----------
// The base lattice is the FCC/HCP sphere packing with:
//   - 4 base traversal directions (v1-v4) along <111> permutations
//   - 6 shortcut directions (s1-s6) along <110> permutations
//   - Together these form the D10 root lattice (180 roots in 10D)
//
// FLUX MODES (STYPES)
// -------------------
// The 6 shortcuts group into 3 MUTUALLY EXCLUSIVE flux mode pairs:
//   Mode 1 (XY plane): stype 1 + stype 2  (s1, s4)
//   Mode 2 (XZ plane): stype 3 + stype 4  (s2, s5)
//   Mode 3 (YZ plane): stype 5 + stype 6  (s3, s6)
//
// CRITICAL: Only ONE flux mode can be active at any location.
// Activating two modes simultaneously at the same site creates a
// negative eigenvalue in the deformation tensor (physically impossible).
// This is the fundamental EXCLUSIVITY CONSTRAINT.
//
// TRANSFER MATRIX (state transitions)
// ------------------------------------
// Each site's flux state ∈ {0=FCC, 1=XY, 2=XZ, 3=YZ}
// Valid transitions (transfer matrix M):
//   From 0: → 0, 1, 2, 3  (any transition allowed)
//   From 1: → 0, 2, 3      (cannot stay in mode 1)
//   From 2: → 0, 1, 3      (cannot stay in mode 2)
//   From 3: → 0, 1, 2      (cannot stay in mode 3)
// Self-loops FORBIDDEN — a site cannot transition to the same mode.
// This creates aperiodic dynamics (not periodic).
//
// VOID DUALITY
// ------------
// Tetrahedral voids (A₄ symmetry) = FERMIONS (matter)
//   - Condense volume into topological knots
//   - Require 720° rotation → spin-1/2
//   - Pauli exclusion: can't overlap
//   - 3 quarks per baryon (from 1/3 projection invariant)
//
// Octahedral voids (Oh symmetry) = BOSONS (forces)
//   - 8 faces → 8 gluons (SU(3) color charge)
//   - Surfaces can overlap → integer spin
//   - Volume ratio oct:tet = 4:1
//
// PARTICLE CREATION: Always creates tet-oct PAIRS.
// A fermion (tet void) must have a paired boson (oct void) nearby.
// Isolated defects are forbidden by the deformation constraints.
//
// THREE GENERATIONS (from edge composition of tet voids)
// -------------------------------------------------------
// Gen 1 (e, u, d): vvvvss — 4 base + 2 shortcut edges
//   Lives INSIDE a single flux domain. Stable.
// Gen 2 (μ, c, s): vvvsss — 3 base + 3 shortcut edges
//   Lives at DOMAIN WALLS (boundary between 2 flux modes). Unstable.
// Gen 3 (τ, t, b): vvssss — 2 base + 4 shortcut edges
//   Lives at DOMAIN WALLS. Very unstable.
// No Gen 4: would require 3 simultaneous modes → overconstraint.
//
// COLOR CONFINEMENT
// -----------------
// 3 flux modes = 3 colors (R, G, B)
// Color-neutral = all 3 modes represented → "white" singlet
// A gluon is a 2D surface loop on an oct void's face
// Surfaces can't exist without the solid → confinement
//
// BRONZE RATIO (λ ≈ 3.303)
// -------------------------
// Largest eigenvalue of transfer matrix M = (3+√13)/2
// Governs aperiodic growth rate of valid state sequences.
// The lattice evolves quasicrystallinely, not periodically.
//
// DISPLACEMENT DECAY
// ------------------
// Perturbations from flux events decay as 1/r² in the far field.
// This gives gravity-like long-range effects.
//
//
// ═══════════════════════════════════════════════════════════════════════
// ARCHITECTURE — ALL RULES USE tick()
// ═══════════════════════════════════════════════════════════════════════
//
// tick context (ctx):
//   activeSet    — Set<scId>, the currently open shortcuts
//   impliedSet   — Set<scId>, implied shortcuts (read)
//   ALL_SC       — SC[], all shortcut objects {id, a, b, stype}
//   pos          — number[][], current node positions
//   REST         — number[][], FCC rest positions
//   N            — number of nodes
//   excitations  — the excitations array
//   temporalK    — current temporal K [0,1]
//   avgHamming   — rolling average motion [0,1]
//   stuckTicks   — consecutive near-zero-motion ticks
//   density      — current active SC fraction
//
//   openSC(scId) → bool   — open a SC (density cap enforced)
//   closeSC(scId) → bool  — close a SC (density floor enforced)
//   toggleSC(scId) → bool — toggle (density-safe)
//   isOpen(scId) → bool   — active or implied
//   isActive(scId) → bool — in activeSet specifically
//   applyPhysics()        — recompute implied + node positions
//   skipExcitations       — set true to bypass excitation movement
//   changesRemaining      — remaining SC changes this tick (max 30)
//   maxChanges            — max SC changes per tick
//
//
// ═══════════════════════════════════════════════════════════════════════
// TOURNAMENT HISTORY
// ═══════════════════════════════════════════════════════════════════════
//
// Gen 0-2: Excitation-steering only. Max ~21% fitness, <1% motion.
// Gen 3:   First tick-based rules. 2.7% motion (lattice-automaton).
// Gen 4:   All tick-based. Best: wave-propagator 20.3%, 5.1% motion.
// Gen 5:   Wave variants dominate:
//   #1 multi-wave         29.9% fitness (8.1% motion, 80.9% tempK)
//   #2 avalanche          23.2% fitness (7.5% motion, 59.8% tempK)
//   #3 wave-propagator    21.1% fitness (4.7% motion, 59.5% tempK)
//   #4 wave-void-hybrid   20.4% fitness (4.5% motion, 57.6% tempK)
//   #5 void-breather      18.8% fitness (4.2% motion, 52.7% tempK)
//   #6 random-sculptor    18.8% fitness (3.9% motion, 53.4% tempK) ← NULL
//   KILLED: interference, dual-oscillator, neighbor-flip (below random)
//
// Gen 6: PHYSICS-FIRST design.
//   #1 quadrupolar-dipole 29.9% fitness (9.1% motion, 78.6% tempK) ← CHAMPION
//   #2 multi-wave         29.0% fitness (7.3% motion, 79.6% tempK)
//   #3 avalanche          23.4% fitness (7.2% motion, 61.5% tempK)
//   KILLED: flux-domain (8.3%), color-confinement (5.0%) — below random
//
// Gen 7 (current): COMBINATION rules (physics + proven mechanics)
//   New: domain-guided-dipole (flux-domain + quadrupolar-dipole)
//        color-wave (color-confinement + multi-wave + tet amplification)
//
// ══════════════════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════════════════
// SHARED INFRASTRUCTURE
// ══════════════════════════════════════════════════════════════════════════

// ── Shared neighbor map ──
// scId → Int32Array of neighbor scIds (SCs sharing a lattice node).
let _sharedNbrMap = null;
let _sharedNbrMapLen = -1;

function ensureSharedNbrMap(ALL_SC){
    if(_sharedNbrMap && _sharedNbrMapLen === ALL_SC.length) return _sharedNbrMap;
    _sharedNbrMapLen = ALL_SC.length;
    const byNode = new Map();
    for(const sc of ALL_SC){
        if(!byNode.has(sc.a)) byNode.set(sc.a, []);
        if(!byNode.has(sc.b)) byNode.set(sc.b, []);
        byNode.get(sc.a).push(sc.id);
        byNode.get(sc.b).push(sc.id);
    }
    _sharedNbrMap = new Array(ALL_SC.length);
    for(const sc of ALL_SC){
        const set = new Set();
        for(const id of byNode.get(sc.a)) if(id !== sc.id) set.add(id);
        for(const id of byNode.get(sc.b)) if(id !== sc.id) set.add(id);
        _sharedNbrMap[sc.id] = new Int32Array([...set]);
    }
    return _sharedNbrMap;
}

// ── Shared stype grouping ──
// stype (1-6) → [scId, ...]. The 6 stypes are geometric orientations.
let _sharedStypeGroups = null;
let _sharedStypeGroupsLen = -1;

function ensureStypeGroups(ALL_SC){
    if(_sharedStypeGroups && _sharedStypeGroupsLen === ALL_SC.length) return _sharedStypeGroups;
    _sharedStypeGroupsLen = ALL_SC.length;
    _sharedStypeGroups = {};
    for(const sc of ALL_SC){
        if(!_sharedStypeGroups[sc.stype]) _sharedStypeGroups[sc.stype] = [];
        _sharedStypeGroups[sc.stype].push(sc.id);
    }
    return _sharedStypeGroups;
}

// ── Flux mode mapping ──
// Maps each stype to its flux mode (1=XY, 2=XZ, 3=YZ)
// and provides the complement mode pair for each stype.
const STYPE_TO_MODE = { 1:1, 2:1, 3:2, 4:2, 5:3, 6:3 };
const MODE_STYPES = { 1:[1,2], 2:[3,4], 3:[5,6] };
const MODES = [1, 2, 3];

// ── Node-to-SC map ──
// nodeIdx → [scId, ...] — all SCs incident to this node
let _nodeSCMap = null;
let _nodeSCMapLen = -1;

function ensureNodeSCMap(ALL_SC, N){
    if(_nodeSCMap && _nodeSCMapLen === ALL_SC.length) return _nodeSCMap;
    _nodeSCMapLen = ALL_SC.length;
    _nodeSCMap = new Array(N);
    for(let i = 0; i < N; i++) _nodeSCMap[i] = [];
    for(const sc of ALL_SC){
        _nodeSCMap[sc.a].push(sc.id);
        _nodeSCMap[sc.b].push(sc.id);
    }
    return _nodeSCMap;
}

window.ensureSharedNbrMap = ensureSharedNbrMap;


// ══════════════════════════════════════════════════════════════════════════
// SHARED GAUGE GROUP INFRASTRUCTURE — SU(3)c × SU(2)L × U(1)Y
// ══════════════════════════════════════════════════════════════════════════
//
// ALL rules share this gauge group state. After each rule's tick(), the
// engine-level post-tick hook calls gaugePostTick() to:
//   1. Update gauge state (color charges, isospin, hypercharge)
//   2. Annotate SCs and nodes with gauge group colors
//
// This means EVERY rule automatically gets rich animation showing
// the Standard Model physics, regardless of its internal mechanism.
// Rules that explicitly interact with gauge state will score higher
// on physical plausibility.

const GAUGE = {
    // Per-node state
    nodeMode: null,      // Uint8Array: flux mode {0,1,2,3} — SU(3) color
    isospin: null,       // Uint8Array: 0=right-handed, 1=left-handed — SU(2)L
    hypercharge: null,   // Float32Array: hypercharge Y ∈ [-1,1] — U(1)Y
    initialized: false,
    tick: 0,

    // Color palette for SU(3) display
    MODE_COLOR: { 1: 0xff3333, 2: 0x33ff33, 3: 0x3333ff },
    MODE_ANTI:  { 1: 0x00cccc, 2: 0xcc00cc, 3: 0xcccc00 },
    MODE_DIM:   { 1: 0x991111, 2: 0x119911, 3: 0x111199 },

    BRONZE: (3 + Math.sqrt(13)) / 2,

    /** Initialize or reinitialize gauge state for N nodes. */
    init(N){
        this.nodeMode = new Uint8Array(N);
        this.isospin = new Uint8Array(N);
        this.hypercharge = new Float32Array(N);
        for(let i = 0; i < N; i++){
            this.nodeMode[i] = 1 + Math.floor(Math.random() * 3);
            this.isospin[i] = Math.random() < 0.5 ? 1 : 0;
            this.hypercharge[i] = (Math.random() - 0.5) * 0.4;
        }
        this.initialized = true;
        this.tick = 0;
    },

    /**
     * Post-tick gauge update + annotation. Called AFTER every rule's tick().
     * Updates gauge state based on current lattice, then annotates everything.
     */
    postTick(ctx){
        if(!this.initialized || this.nodeMode.length !== ctx.N) this.init(ctx.N);
        this.tick++;

        const { ALL_SC, N, pos } = ctx;
        const nodeSC = ensureNodeSCMap(ALL_SC, N);
        const bronzeFrac = (this.tick / this.BRONZE) % 1;

        // ═══ SU(3)c: UPDATE COLOR CHARGES ═══
        // Count local color balance per node
        const colorCount = new Array(N);
        for(let i = 0; i < N; i++) colorCount[i] = [0, 0, 0];
        for(const sc of ALL_SC){
            if(ctx.activeSet.has(sc.id)){
                const m = STYPE_TO_MODE[sc.stype] - 1;
                colorCount[sc.a][m]++;
                colorCount[sc.b][m]++;
            }
        }

        // ═══ SU(2)L: EVOLVE ISOSPIN AT DOMAIN WALLS ═══
        const weakRate = 0.04 + 0.03 * Math.sin(2 * Math.PI * bronzeFrac);
        for(let node = 0; node < N; node++){
            if(Math.random() > weakRate) continue;

            const cur = this.nodeMode[node];
            let isWall = false;
            let neighborModes = [0, 0, 0, 0];

            for(const scId of nodeSC[node]){
                const sc = ALL_SC[scId];
                const other = sc.a === node ? sc.b : sc.a;
                neighborModes[this.nodeMode[other]]++;
                if(this.nodeMode[other] !== cur && this.nodeMode[other] > 0) isWall = true;
            }

            if(isWall){
                // Transfer matrix: no self-loops
                const options = cur === 0
                    ? [1, 2, 3]
                    : [0, ...MODES.filter(m => m !== cur)];

                // 65% neighbor coherent, 35% random
                let chosen;
                if(Math.random() < 0.65){
                    let best = options[0], bestN = -1;
                    for(const m of options){
                        if(neighborModes[m] > bestN){ bestN = neighborModes[m]; best = m; }
                    }
                    chosen = best;
                } else {
                    chosen = options[Math.floor(Math.random() * options.length)];
                }
                this.nodeMode[node] = chosen;
                this.isospin[node] = this.isospin[node] === 1 ? 0 : 1; // flip isospin
            }
        }

        // ═══ U(1)Y: EVOLVE HYPERCHARGE ═══
        const newHC = new Float32Array(N);
        for(let node = 0; node < N; node++){
            const scs = nodeSC[node];
            let localActive = 0;
            for(const scId of scs) if(ctx.activeSet.has(scId)) localActive++;
            const localDensity = scs.length > 0 ? localActive / scs.length : 0;

            let nbrSum = 0, nbrCount = 0;
            for(const scId of scs){
                const sc = ALL_SC[scId];
                const other = sc.a === node ? sc.b : sc.a;
                nbrSum += this.hypercharge[other];
                nbrCount++;
            }
            const nbrAvg = nbrCount > 0 ? nbrSum / nbrCount : 0;
            newHC[node] = this.hypercharge[node] * 0.7 + nbrAvg * 0.2
                        + (localDensity - 0.3) * 0.1;
            newHC[node] = Math.max(-1, Math.min(1, newHC[node]));
        }
        this.hypercharge = newHC;

        // ═══ ANIMATION: ANNOTATE GAUGE LAYER ═══
        // Don't clear() — called before rule tick in main loop.
        // GAUGE adds excitation colors, void colors, node scaling
        // on top of whatever the rule already annotated.

        const hasTetMap = typeof tetPartnerMap !== 'undefined' && tetPartnerMap && tetPartnerMap.size > 0;
        const ruleSetSCColors = !!ctx._ruleSetSCColors;

        // ── Pre-compute domain wall map for nodes ──
        const nodeAtWall = new Uint8Array(N);
        const nodeWallCount = new Uint8Array(N); // how many distinct neighbor modes
        for(let i = 0; i < N; i++){
            const mode = this.nodeMode[i];
            let wallModes = 0;
            for(const scId of nodeSC[i]){
                const sc = ALL_SC[scId];
                const other = sc.a === i ? sc.b : sc.a;
                const om = this.nodeMode[other];
                if(om !== mode && om > 0){ nodeAtWall[i] = 1; wallModes |= (1 << om); }
            }
            // Count distinct wall modes (for tri-junction detection)
            nodeWallCount[i] = ((wallModes >> 1) & 1) + ((wallModes >> 2) & 1) + ((wallModes >> 3) & 1);
        }

        // ── SC colors: SU(3) color charge (skip if rule already set them) ──
        if(!ruleSetSCColors){
            for(const scId of ctx.activeSet){
                const sc = ALL_SC[scId];
                const scMode = STYPE_TO_MODE[sc.stype];
                const atWall = (nodeAtWall[sc.a] || nodeAtWall[sc.b]);

                // Check if fermion (part of tet void cluster)
                let isFermion = false;
                if(hasTetMap){
                    const partners = tetPartnerMap.get(scId);
                    if(partners){
                        let active = 0;
                        for(const p of partners) if(ctx.activeSet.has(p)) active++;
                        if(active >= 2) isFermion = true;
                    }
                }

                if(isFermion){
                    ctx.annotate.scColor(scId, this.MODE_COLOR[scMode]); // bright SU(3) color
                } else if(atWall){
                    ctx.annotate.scColor(scId, this.MODE_ANTI[scMode]);  // anti-color at walls
                } else {
                    ctx.annotate.scColor(scId, this.MODE_DIM[scMode]);   // dim SU(3) color
                }
            }
        }

        // ── Nodes: bipartite black/white restored ──
        // Only scale domain wall nodes (no color override → black/white shows through)
        // NOTE: Tri-junctions (3 modes meeting) are mathematically impossible
        // in this lattice — the PDF proves a 4th generation is forbidden by
        // geometric overconstraint. So wallCount is always 0 or 1.
        // nodeScale removed — sphere sizes must NEVER vary (see flux-v2.html).
        // Domain wall nodes are now shown via nodeColor only.

        // ── Void colors ──
        // Tet voids: cyan default (fermion substrate). Actual quark/lepton identity
        // comes from excitation loops, not from the void itself.
        // Oct voids: white (bosonic gluon field).
        //
        // NOTE: The V1 fermion classifier based on SC count per tet was dead code —
        // every tet has exactly 2 SCs, so all tets always classified as "lepton."
        // In V2, fermion identity is determined by excitation loop characteristics
        // (base directions used, confinement radius, orbit period), not void geometry.

        if(typeof _voidMeshPool !== 'undefined'){
            for(let vi = 0; vi < _voidMeshPool.length; vi++){
                const entry = _voidMeshPool[vi];
                if(!entry || !entry.wasActualized) continue;

                if(entry.type === 'tet'){
                    // Tet = fermion substrate: default cyan, nucleus mode overrides per-excitation
                    ctx.annotate.tetColor(vi, 0x00ccff);
                } else {
                    // Oct = bosonic field: solid white
                    ctx.annotate.octColor(vi, 0xffffff);
                }
            }
        }

        // ── EXCITATION COLORS: GAUGE FORCE INDICATORS ──
        // Sparks represent linear gauge force propagation, NOT fermions.
        // Fermion coloring is on tet voids (above).
        // Color sparks by the gauge force they carry:
        //   Strong (SU(3)): colored by the flux mode at their current node
        //   Weak (SU(2)): domain wall crossings → gold flash
        //   EM (U(1)): hypercharge fluctuation → white-yellow
        //
        const FORCE_COLORS = {
            strong: { 1: 0xff4444, 2: 0x44ff44, 3: 0x4444ff }, // SU(3) R/G/B
            weak: 0xffaa44,    // gold for weak force (domain wall interaction)
            em: 0xffffaa,      // pale yellow for EM (U(1) hypercharge)
        };

        if(ctx.excitations){
            for(let ei = 0; ei < ctx.excitations.length; ei++){
                const e = ctx.excitations[ei];
                const nodeM = this.nodeMode[e.node];
                const isWall = nodeAtWall[e.node];
                const wallDegree = nodeWallCount[e.node];
                const hc = Math.abs(this.hypercharge[e.node]);

                // No tri-junction case — geometrically forbidden by the lattice.
                if(isWall){
                    // At domain wall: weak force carrier (W/Z-like)
                    ctx.annotate.excitationColor(ei, FORCE_COLORS.weak);
                    ctx.annotate.excitationScale(ei, 1.3);
                } else if(hc > 0.5){
                    // High hypercharge: EM force carrier (photon-like)
                    ctx.annotate.excitationColor(ei, FORCE_COLORS.em);
                    ctx.annotate.excitationScale(ei, 1.0);
                } else if(nodeM > 0){
                    // In-domain: strong force carrier (gluon-like)
                    ctx.annotate.excitationColor(ei, FORCE_COLORS.strong[nodeM]);
                    ctx.annotate.excitationScale(ei, 1.0);
                }
                // else: ground state → default spark color
            }
        }
    },

    /**
     * Get gauge-aware context for rules that want to directly
     * interact with gauge state (higher physical plausibility).
     */
    getContext(){
        return {
            nodeMode: this.nodeMode,
            isospin: this.isospin,
            hypercharge: this.hypercharge,
            colorCount: null, // filled per tick
            MODE_COLOR: this.MODE_COLOR,
            MODE_ANTI: this.MODE_ANTI,
            BRONZE: this.BRONZE,
        };
    }
};

// Export for engine access
window.GAUGE = GAUGE;


// ══════════════════════════════════════════════════════════════════════════
// NUCLEUS MODEL CONTESTANTS — Emergent Hydrogen Proton Discovery
// ══════════════════════════════════════════════════════════════════════════
//
// Each model is a theory for how 3 quark excitation loops can naturally
// produce an octahedral void (gluon field) through emergent dynamics.
//
// Models compete in a tournament evaluated on:
//   - OCT VOID EMERGENCE (35%) — did an oct void form naturally?
//   - QUARK BINDING (25%) — are all 3 quarks still close together?
//   - BINDING TIGHTNESS (15%) — how compact is the quark cluster?
//   - DYNAMIC ACTIVITY (15%) — is there sustained motion?
//   - STABILITY (10%) — how long did the structure persist?
//
// PHYSICS:
//   - Proton = 2 up quarks + 1 down quark, bound by gluons
//   - Quarks carry color charge (red/green/blue) → color neutral combined
//   - Gluons = bosonic oct void with 8 triangular faces
//   - Anti-fermions = same loop, opposite direction → annihilate on contact
//   - Dynamic sea: virtual quark-antiquark pairs constantly appear/annihilate
//   - Mass from kinetic energy + binding energy
//
// SETUP API (ctx passed to setup()):
//   ctx.createQuark(nodeIdx, hexColor, {type, colorCharge, label, direction})
//   ctx.createVirtualPair(nodeIdx, lifetime)
//   ctx.pos[] — node 3D positions
//   ctx.nodeCount — number of nodes
//   ctx.centerNode — node closest to origin
//   ctx.voidData[] — voidNeighborData entries
//   ctx.nodeTetVoids — Map<nodeIdx, tetVoid[]>
//   ctx.nodeOctVoids — Map<nodeIdx, octVoid[]>
//   ctx.basePosNeighbor[][] — direction neighbor lookup
//   ctx.activateSC(scId), ctx.deactivateSC(scId)
//
// ══════════════════════════════════════════════════════════════════════════

const COLOR_CHARGES = [0xff0000, 0x00ff00, 0x0000ff];     // red, green, blue
const ANTI_COLORS   = [0x00ffff, 0xff00ff, 0xffff00];     // cyan, magenta, yellow
const QUARK_COLORS_UP = 0xff4444;   // warm red for up quarks
const QUARK_COLORS_DOWN = 0x4488ff; // blue for down quarks

// Helper: find N nodes closest to lattice center
function findCentralNodes(pos, n) {
    const scored = [];
    for(let i = 0; i < pos.length; i++){
        const p = pos[i];
        scored.push({ idx: i, dist: Math.sqrt(p[0]*p[0] + p[1]*p[1] + p[2]*p[2]) });
    }
    scored.sort((a,b) => a.dist - b.dist);
    return scored.slice(0, n).map(s => s.idx);
}

// Helper: find nodes well-separated around center (120° apart approximately)
function findTriangleNodes(pos, centerNode) {
    const cp = pos[centerNode];
    // Get all nodes within reasonable distance
    const nearby = [];
    for(let i = 0; i < pos.length; i++){
        if(i === centerNode) continue;
        const p = pos[i];
        const dx = p[0]-cp[0], dy = p[1]-cp[1], dz = p[2]-cp[2];
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if(dist > 0.3 && dist < 3.0) nearby.push({ idx: i, dist, pos: p });
    }
    if(nearby.length < 3) return findCentralNodes(pos, 3);

    // Pick first node (closest)
    nearby.sort((a,b) => a.dist - b.dist);
    const n1 = nearby[0];

    // Pick second node: farthest from n1 among nearby
    let best2 = null, bestDist2 = 0;
    for(const n of nearby){
        if(n.idx === n1.idx) continue;
        const dx = n.pos[0]-n1.pos[0], dy = n.pos[1]-n1.pos[1], dz = n.pos[2]-n1.pos[2];
        const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if(d > bestDist2){ bestDist2 = d; best2 = n; }
    }

    // Pick third node: maximize min distance to n1 and n2
    let best3 = null, bestMinDist = 0;
    for(const n of nearby){
        if(n.idx === n1.idx || n.idx === best2.idx) continue;
        const d1 = Math.sqrt((n.pos[0]-n1.pos[0])**2 + (n.pos[1]-n1.pos[1])**2 + (n.pos[2]-n1.pos[2])**2);
        const d2 = Math.sqrt((n.pos[0]-best2.pos[0])**2 + (n.pos[1]-best2.pos[1])**2 + (n.pos[2]-best2.pos[2])**2);
        const minD = Math.min(d1, d2);
        if(minD > bestMinDist){ bestMinDist = minD; best3 = n; }
    }

    return [n1.idx, best2.idx, best3?.idx || nearby[2]?.idx || 0];
}

// Helper: distance between two nodes
function nodeDist(pos, a, b) {
    const pa = pos[a], pb = pos[b];
    return Math.sqrt((pa[0]-pb[0])**2 + (pa[1]-pb[1])**2 + (pa[2]-pb[2])**2);
}

// Helper: distance from node to a 3D point
function nodePointDist(pos, nodeIdx, point) {
    const p = pos[nodeIdx];
    return Math.sqrt((p[0]-point[0])**2 + (p[1]-point[1])**2 + (p[2]-point[2])**2);
}

// Helper: compute centroid of quarks
function quarkCentroid(quarks, pos) {
    if(!quarks || quarks.length === 0) return [0,0,0];
    let cx=0, cy=0, cz=0, n=0;
    for(const q of quarks){
        if(!q || q.node === undefined) continue;
        const p = pos[q.node];
        cx += p[0]; cy += p[1]; cz += p[2]; n++;
    }
    return n > 0 ? [cx/n, cy/n, cz/n] : [0,0,0];
}


// ══════════════════════════════════════════════════════════════════════════
// MODEL 0: CLASSIC — null hypothesis baseline  (MUST BE INDEX 0)
// ══════════════════════════════════════════════════════════════════════════

RULE_REGISTRY.push({
    name: 'classic',
    description: 'Baseline null hypothesis — direction balance, no emergence logic',
    legend: [
        { color: '#ff4444', label: 'Up quark', shape: 'circle' },
        { color: '#4488ff', label: 'Down quark', shape: 'circle' },
    ],
    setup(ctx) {
        const nodes = findCentralNodes(ctx.pos, 5);
        ctx.createQuark(nodes[0], QUARK_COLORS_UP, { type:'up', colorCharge:0, label:'u1', direction:1 });
        ctx.createQuark(nodes[1], QUARK_COLORS_UP, { type:'up', colorCharge:1, label:'u2', direction:1 });
        ctx.createQuark(nodes[2], QUARK_COLORS_DOWN, { type:'down', colorCharge:2, label:'d1', direction:1 });
    },
    tick(ctx) {
        // No lattice manipulation — pure null hypothesis
    },
});


// ══════════════════════════════════════════════════════════════════════════
// MODEL 1: ATTRACTION-KNOT — mutual quark attraction
// ══════════════════════════════════════════════════════════════════════════

RULE_REGISTRY.push({
    name: 'attraction-knot',
    description: 'Quarks mutually attract — converging SC trails form oct void geometry',
    legend: [
        { color: '#ff0000', label: 'Quark 1 (up, red)', shape: 'circle' },
        { color: '#00ff00', label: 'Quark 2 (up, green)', shape: 'circle' },
        { color: '#0000ff', label: 'Quark 3 (down, blue)', shape: 'circle' },
        { color: '#ffffff', label: 'Emergent gluon field', shape: 'diamond' },
    ],
    setup(ctx) {
        // Place quarks 120° apart around center
        const triNodes = findTriangleNodes(ctx.pos, ctx.centerNode);
        ctx.createQuark(triNodes[0], COLOR_CHARGES[0], { type:'up', colorCharge:0, label:'u1', direction:1 });
        ctx.createQuark(triNodes[1], COLOR_CHARGES[1], { type:'up', colorCharge:1, label:'u2', direction:1 });
        ctx.createQuark(triNodes[2], COLOR_CHARGES[2], { type:'down', colorCharge:2, label:'d1', direction:1 });
    },
    tick(ctx) {
        if(!ctx.quarks || ctx.quarks.length === 0) return;
        const BRONZE = (3 + Math.sqrt(13)) / 2;
        const tick = ctx.frameCount || 0;

        // Every 3 ticks: breathe SCs near quark positions
        if(tick % 3 === 0) {
            const pulse = Math.sin(2 * Math.PI * tick / (BRONZE * 10)) * 0.5 + 0.5;
            for(const q of ctx.quarks) {
                if(!q || q.node === undefined) continue;
                // Activate some SCs near this quark
                const nearby = ctx.ALL_SC.filter(sc => {
                    if(ctx.allOpen.has(sc.id)) return false;
                    const da = nodePointDist(ctx.pos, sc.a, ctx.pos[q.node]);
                    const db = nodePointDist(ctx.pos, sc.b, ctx.pos[q.node]);
                    return Math.min(da, db) < 1.5;
                });
                const count = Math.floor(pulse * 2);
                for(let i = 0; i < count && i < nearby.length; i++){
                    const pick = nearby[Math.floor(Math.random() * nearby.length)];
                    if(pick) ctx.openSC(pick.id);
                }
            }
        }

        // Annotate: white glow on any emergent oct voids
        if(ctx.annotate) {
            ctx.annotate.clear();
            for(const q of ctx.quarks) {
                if(q && q.node !== undefined && q._colorCharge !== undefined) {
                    ctx.annotate.nodeColor(q.node, COLOR_CHARGES[q._colorCharge]);
                    // nodeScale removed — sphere sizes must NEVER vary
                }
            }
        }
    },
});


// ══════════════════════════════════════════════════════════════════════════
// MODEL 2: COLOR-EXCHANGE — gluon-mediated color swaps
// ══════════════════════════════════════════════════════════════════════════

RULE_REGISTRY.push({
    name: 'color-exchange',
    description: 'Quarks swap color charge via gluon exchange — binding SCs emerge from interactions',
    legend: [
        { color: '#ff0000', label: 'Red color charge', shape: 'circle' },
        { color: '#00ff00', label: 'Green color charge', shape: 'circle' },
        { color: '#0000ff', label: 'Blue color charge', shape: 'circle' },
        { color: '#ffffff', label: 'Gluon exchange SC', shape: 'line' },
    ],
    _exchangeCount: 0,
    _gluonSCs: new Map(), // scId → ticksRemaining
    setup(ctx) {
        this._exchangeCount = 0;
        this._gluonSCs = new Map();
        // Place quarks on nodes of a central tet void (if possible)
        let startNodes;
        const centerTets = [];
        for(const [nodeIdx, tets] of ctx.nodeTetVoids) {
            for(const tv of tets) {
                const cx = tv.nbrs.reduce((s,n) => s + ctx.pos[n][0], 0) / tv.nbrs.length;
                const cy = tv.nbrs.reduce((s,n) => s + ctx.pos[n][1], 0) / tv.nbrs.length;
                const cz = tv.nbrs.reduce((s,n) => s + ctx.pos[n][2], 0) / tv.nbrs.length;
                centerTets.push({ tv, dist: Math.sqrt(cx*cx + cy*cy + cz*cz) });
            }
        }
        centerTets.sort((a,b) => a.dist - b.dist);
        if(centerTets.length > 0) {
            const tet = centerTets[0].tv;
            startNodes = [tet.nbrs[0], tet.nbrs[1], tet.nbrs[2]];
        } else {
            startNodes = findCentralNodes(ctx.pos, 3);
        }

        ctx.createQuark(startNodes[0], COLOR_CHARGES[0], { type:'up', colorCharge:0, label:'u1', direction:1 });
        ctx.createQuark(startNodes[1], COLOR_CHARGES[1], { type:'up', colorCharge:1, label:'u2', direction:1 });
        ctx.createQuark(startNodes[2], COLOR_CHARGES[2], { type:'down', colorCharge:2, label:'d1', direction:1 });
    },
    tick(ctx) {
        if(!ctx.quarks || ctx.quarks.length < 2) return;
        const pos = ctx.pos;

        // Check for color exchange: when 2 quarks are within 1 hop
        for(let i = 0; i < ctx.quarks.length; i++){
            for(let j = i+1; j < ctx.quarks.length; j++){
                const q1 = ctx.quarks[i], q2 = ctx.quarks[j];
                if(!q1 || !q2 || q1.node === undefined || q2.node === undefined) continue;
                const dist = nodeDist(pos, q1.node, q2.node);
                if(dist < 1.2 && q1._colorCharge !== q2._colorCharge) {
                    // COLOR EXCHANGE EVENT — swap charges
                    const tmp = q1._colorCharge;
                    q1._colorCharge = q2._colorCharge;
                    q2._colorCharge = tmp;

                    // Update visual colors
                    if(q1.sparkMat) q1.sparkMat.color.setHex(COLOR_CHARGES[q1._colorCharge]);
                    if(q2.sparkMat) q2.sparkMat.color.setHex(COLOR_CHARGES[q2._colorCharge]);

                    // Create gluon SCs between them: activate SCs that connect their neighborhoods
                    for(const sc of ctx.ALL_SC) {
                        const dA1 = nodeDist(pos, sc.a, q1.node);
                        const dB2 = nodeDist(pos, sc.b, q2.node);
                        const dA2 = nodeDist(pos, sc.a, q2.node);
                        const dB1 = nodeDist(pos, sc.b, q1.node);
                        if((dA1 < 1.0 && dB2 < 1.0) || (dA2 < 1.0 && dB1 < 1.0)) {
                            ctx.openSC(sc.id);
                            this._gluonSCs.set(sc.id, 30); // gluon SCs live 30 ticks
                            if(ctx.annotate) ctx.annotate.scColor(sc.id, 0xffffff);
                        }
                    }
                    this._exchangeCount++;
                }
            }
        }

        // Decay gluon SCs
        for(const [scId, ticks] of this._gluonSCs) {
            if(ticks <= 1) {
                this._gluonSCs.delete(scId);
                ctx.closeSC(scId);
            } else {
                this._gluonSCs.set(scId, ticks - 1);
                // Fade opacity as they decay
                if(ctx.annotate) {
                    const alpha = ticks / 30;
                    const r = Math.floor(255 * alpha), g = Math.floor(255 * alpha), b = Math.floor(255 * alpha);
                    ctx.annotate.scColor(scId, (r << 16) | (g << 8) | b);
                }
            }
        }

        // Annotate quarks with current colors
        if(ctx.annotate) {
            for(const q of ctx.quarks) {
                if(q && q.node !== undefined && q._colorCharge !== undefined) {
                    ctx.annotate.nodeColor(q.node, COLOR_CHARGES[q._colorCharge]);
                    // nodeScale removed — sphere sizes must NEVER vary
                }
            }
        }
    },
});


// ══════════════════════════════════════════════════════════════════════════
// MODEL 3: WAVE-INTERFERENCE — constructive wave overlap
// ══════════════════════════════════════════════════════════════════════════

RULE_REGISTRY.push({
    name: 'wave-interference',
    description: 'Quarks emit SC activation waves — constructive interference crystallizes oct voids',
    legend: [
        { color: '#ff4444', label: 'Up quark (wave source)', shape: 'circle' },
        { color: '#4488ff', label: 'Down quark (wave source)', shape: 'circle' },
        { color: '#ffff88', label: 'Single-wave SC (decays)', shape: 'line' },
        { color: '#ffffff', label: 'Multi-wave SC (persists)', shape: 'line' },
    ],
    _waveSCs: new Map(), // scId → { sources: Set, ticksLeft }
    _wavePhase: 0,
    setup(ctx) {
        this._waveSCs = new Map();
        this._wavePhase = 0;
        // Place quarks in a triangle 2 hops from center
        const triNodes = findTriangleNodes(ctx.pos, ctx.centerNode);
        ctx.createQuark(triNodes[0], QUARK_COLORS_UP, { type:'up', colorCharge:0, label:'u1', direction:1 });
        ctx.createQuark(triNodes[1], QUARK_COLORS_UP, { type:'up', colorCharge:1, label:'u2', direction:1 });
        ctx.createQuark(triNodes[2], QUARK_COLORS_DOWN, { type:'down', colorCharge:2, label:'d1', direction:1 });
    },
    tick(ctx) {
        if(!ctx.quarks || ctx.quarks.length === 0) return;
        this._wavePhase++;
        const pos = ctx.pos;

        // Every 5 ticks: each quark emits a wave (activate nearby SCs)
        if(this._wavePhase % 5 === 0) {
            for(let qi = 0; qi < ctx.quarks.length; qi++) {
                const q = ctx.quarks[qi];
                if(!q || q.node === undefined) continue;
                const qp = pos[q.node];

                // Find SCs within 1-2 hops of quark
                for(const sc of ctx.ALL_SC) {
                    const dA = Math.sqrt((pos[sc.a][0]-qp[0])**2 + (pos[sc.a][1]-qp[1])**2 + (pos[sc.a][2]-qp[2])**2);
                    const dB = Math.sqrt((pos[sc.b][0]-qp[0])**2 + (pos[sc.b][1]-qp[1])**2 + (pos[sc.b][2]-qp[2])**2);
                    if(Math.min(dA, dB) < 1.8) {
                        ctx.openSC(sc.id);
                        if(!this._waveSCs.has(sc.id)) {
                            this._waveSCs.set(sc.id, { sources: new Set(), ticksLeft: 12 });
                        }
                        const ws = this._waveSCs.get(sc.id);
                        ws.sources.add(qi);
                        ws.ticksLeft = 12; // refresh
                    }
                }
            }
        }

        // Decay wave SCs
        for(const [scId, ws] of this._waveSCs) {
            ws.ticksLeft--;
            if(ws.sources.size >= 3) {
                // Triple overlap: LOCKED — don't decay
                ws.ticksLeft = Math.max(ws.ticksLeft, 50);
                if(ctx.annotate) ctx.annotate.scColor(scId, 0xffffff);
            } else if(ws.sources.size >= 2) {
                // Double overlap: slow decay
                ws.ticksLeft = Math.max(ws.ticksLeft, 0);
                if(ctx.annotate) ctx.annotate.scColor(scId, 0xcccc88);
            } else {
                // Single source: fast decay
                if(ctx.annotate) {
                    const fade = Math.max(0, ws.ticksLeft / 12);
                    const r = Math.floor(255 * fade), g = Math.floor(255 * fade * 0.9);
                    ctx.annotate.scColor(scId, (r << 16) | (g << 8) | 0x44);
                }
            }

            if(ws.ticksLeft <= 0) {
                this._waveSCs.delete(scId);
                ctx.closeSC(scId);
            }
        }

        // Annotate quarks
        if(ctx.annotate) {
            for(const q of ctx.quarks) {
                if(q && q.node !== undefined) {
                    ctx.annotate.nodeColor(q.node, q._quarkType === 'up' ? QUARK_COLORS_UP : QUARK_COLORS_DOWN);
                    // nodeScale removed — sphere sizes must NEVER vary
                }
            }
        }
    },
});


// ══════════════════════════════════════════════════════════════════════════
// MODEL 4: SEA-FOAM — dynamic QCD vacuum
// ══════════════════════════════════════════════════════════════════════════

RULE_REGISTRY.push({
    name: 'sea-foam',
    description: 'Dynamic QCD vacuum — virtual pair churn around stable quarks creates binding field',
    legend: [
        { color: '#ff4444', label: 'Stable up quark', shape: 'circle' },
        { color: '#4488ff', label: 'Stable down quark', shape: 'circle' },
        { color: '#666666', label: 'Virtual pair (dim)', shape: 'circle' },
        { color: '#ffaa00', label: 'Annihilation flash', shape: 'circle' },
    ],
    _bindingSCs: new Map(), // scId → ticksRemaining (from annihilation energy)
    _spawnCooldown: 0,
    _annihilationCount: 0,
    setup(ctx) {
        this._bindingSCs = new Map();
        this._spawnCooldown = 0;
        this._annihilationCount = 0;
        // 3 stable quarks near center
        const nodes = findCentralNodes(ctx.pos, 5);
        ctx.createQuark(nodes[0], QUARK_COLORS_UP, { type:'up', colorCharge:0, label:'u1', direction:1 });
        ctx.createQuark(nodes[1], QUARK_COLORS_UP, { type:'up', colorCharge:1, label:'u2', direction:1 });
        ctx.createQuark(nodes[2], QUARK_COLORS_DOWN, { type:'down', colorCharge:2, label:'d1', direction:1 });
        // Initial virtual pairs
        for(let i = 0; i < 3; i++){
            const pairNode = nodes[Math.floor(Math.random() * 3)];
            ctx.createVirtualPair(pairNode, 10 + Math.floor(Math.random() * 10));
        }
    },
    tick(ctx) {
        if(!ctx.quarks || ctx.quarks.length === 0) return;
        const pos = ctx.pos;

        // Spawn virtual pairs near quark centroid
        this._spawnCooldown--;
        if(this._spawnCooldown <= 0) {
            const centroid = quarkCentroid(ctx.quarks.filter(q => !q._isVirtual), pos);
            // Find a random node near centroid
            let bestNode = 0, bestDist = Infinity;
            const candidates = [];
            for(let i = 0; i < pos.length; i++) {
                const d = nodePointDist(pos, i, centroid);
                if(d < 2.5) candidates.push(i);
            }
            if(candidates.length > 0) {
                const spawnNode = candidates[Math.floor(Math.random() * candidates.length)];
                const lifetime = 8 + Math.floor(Math.random() * 12);
                ctx.createVirtualPair(spawnNode, lifetime);
            }
            this._spawnCooldown = 2 + Math.floor(Math.random() * 3); // spawn every 2-5 ticks
        }

        // Check for annihilation: virtual quark + virtual antiquark at same node
        const byNode = new Map();
        for(const e of ctx.excitations || []) {
            if(!e._isVirtual || e.node === undefined) continue;
            if(!byNode.has(e.node)) byNode.set(e.node, []);
            byNode.get(e.node).push(e);
        }
        for(const [node, group] of byNode) {
            const particles = group.filter(e => e._direction === 1);
            const antiparticles = group.filter(e => e._direction === -1);
            const pairs = Math.min(particles.length, antiparticles.length);
            for(let i = 0; i < pairs; i++) {
                // Annihilate: mark for removal
                particles[i]._lifetime = 0;
                antiparticles[i]._lifetime = 0;
                this._annihilationCount++;

                // Release binding energy: activate nearby SCs
                for(const sc of ctx.ALL_SC) {
                    const dA = nodeDist(pos, sc.a, node);
                    const dB = nodeDist(pos, sc.b, node);
                    if(Math.min(dA, dB) < 1.2 && Math.random() < 0.4) {
                        ctx.openSC(sc.id);
                        this._bindingSCs.set(sc.id, 20 + Math.floor(Math.random() * 10));
                    }
                }

                // Flash annotation
                if(ctx.annotate) {
                    ctx.annotate.nodeColor(node, 0xffaa00);
                    // nodeScale removed — sphere sizes must NEVER vary
                }
            }
        }

        // Decay binding SCs
        for(const [scId, ticks] of this._bindingSCs) {
            if(ticks <= 1) {
                this._bindingSCs.delete(scId);
                ctx.closeSC(scId);
            } else {
                this._bindingSCs.set(scId, ticks - 1);
                if(ctx.annotate) {
                    const fade = ticks / 25;
                    const g = Math.floor(180 * fade);
                    ctx.annotate.scColor(scId, (0x33 << 16) | (g << 8) | 0xff);
                }
            }
        }

        // Annotate stable quarks brighter
        if(ctx.annotate) {
            for(const q of ctx.quarks) {
                if(!q || q.node === undefined) continue;
                if(!q._isVirtual) {
                    ctx.annotate.nodeColor(q.node, q._quarkType === 'up' ? QUARK_COLORS_UP : QUARK_COLORS_DOWN);
                    // nodeScale removed — sphere sizes must NEVER vary
                }
            }
        }
    },
});


// ══════════════════════════════════════════════════════════════════════════
// MODEL 5: RESONANCE-LOCK — direction-constrained cycle locking
// ══════════════════════════════════════════════════════════════════════════

RULE_REGISTRY.push({
    name: 'resonance-lock',
    description: 'Direction-constrained quarks trace loops that lock into oct void faces',
    legend: [
        { color: '#ff6600', label: 'Quark 1 (dirs 0,1)', shape: 'circle' },
        { color: '#66ff00', label: 'Quark 2 (dirs 1,2)', shape: 'circle' },
        { color: '#0066ff', label: 'Quark 3 (dirs 2,3)', shape: 'circle' },
        { color: '#ffffff', label: 'Locked cycle SC', shape: 'line' },
    ],
    _quarkPaths: [[], [], []], // track visited nodes per quark
    _lockedSCs: new Set(),
    _quarkDirConstraints: [[0,1], [1,2], [2,3]], // each quark's allowed dirs
    setup(ctx) {
        this._quarkPaths = [[], [], []];
        this._lockedSCs = new Set();
        // Place quarks at central tet nodes
        const nodes = findCentralNodes(ctx.pos, 4);
        const colors = [0xff6600, 0x66ff00, 0x0066ff];
        ctx.createQuark(nodes[0], colors[0], { type:'up', colorCharge:0, label:'u1', direction:1 });
        ctx.createQuark(nodes[1], colors[1], { type:'up', colorCharge:1, label:'u2', direction:1 });
        ctx.createQuark(nodes[2], colors[2], { type:'down', colorCharge:2, label:'d1', direction:1 });
    },
    tick(ctx) {
        if(!ctx.quarks || ctx.quarks.length === 0) return;
        const pos = ctx.pos;

        // Track paths and detect cycles
        for(let qi = 0; qi < ctx.quarks.length && qi < 3; qi++) {
            const q = ctx.quarks[qi];
            if(!q || q.node === undefined) continue;

            const path = this._quarkPaths[qi];
            const revisitIdx = path.indexOf(q.node);

            if(revisitIdx >= 0 && path.length - revisitIdx >= 3) {
                // CYCLE DETECTED — lock all SCs in the loop
                const cycle = path.slice(revisitIdx);
                // Find SCs that connect consecutive nodes in cycle
                for(let i = 0; i < cycle.length; i++) {
                    const a = cycle[i], b = cycle[(i+1) % cycle.length];
                    for(const sc of ctx.ALL_SC) {
                        if((sc.a === a && sc.b === b) || (sc.a === b && sc.b === a)) {
                            ctx.openSC(sc.id);
                            this._lockedSCs.add(sc.id);
                        }
                    }
                }
                // Clear path after locking
                this._quarkPaths[qi] = [q.node];
            } else {
                path.push(q.node);
                // Keep path manageable
                if(path.length > 30) path.splice(0, path.length - 30);
            }
        }

        // Re-open locked SCs that got closed
        for(const scId of this._lockedSCs) {
            if(!ctx.allOpen.has(scId)) {
                ctx.openSC(scId);
            }
        }

        // Annotate locked SCs and quarks
        if(ctx.annotate) {
            const colors = [0xff6600, 0x66ff00, 0x0066ff];
            for(const scId of this._lockedSCs) {
                ctx.annotate.scColor(scId, 0xffffff);
            }
            for(let qi = 0; qi < ctx.quarks.length && qi < 3; qi++) {
                const q = ctx.quarks[qi];
                if(q && q.node !== undefined) {
                    ctx.annotate.nodeColor(q.node, colors[qi]);
                    // nodeScale removed — sphere sizes must NEVER vary
                }
            }
        }
    },
});
