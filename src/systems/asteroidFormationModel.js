// src/systems/asteroidFormationModel.js — PURE deterministic asteroid formation/geology model.
//
// Design: design/ASTEROID_OPS_VISION.md (law 8, "roles emerge from geometry"; law 6, signature;
// law 4, thermal). This is the FIELD-level model: it groups asteroid BODIES in continuous XZ space
// into readable formation archetypes. It is NOT the interior cell-seam model from vision law 3 —
// that lives inside the drill field and is owned by the drill/site stack.
//
// Contract:
//   • PURE. Creates no render objects, imports no Three.js, touches no sector/site state, and
//     MUTATES NOTHING that is passed in. Returns fresh JSON-safe plain objects (no Map, no
//     functions, no class instances) so a persistence layer can store the result directly.
//   • DETERMINISTIC. All randomness comes from the caller-supplied serializable `seed` via the
//     repo's seeded helpers in src/core/rng.js. No Math.random, no Date.now, no wall clock.
//   • Simulation plane is XZ (never XY). No Three.js types.
//   • FAIL-CLOSED. Non-finite / malformed input is rejected into `model.rejected[]` with a reason.
//     No throw, no NaN, no Infinity ever reaches an output field.
//
// SEED DISCIPLINE (load-bearing — downstream packets rely on it):
//   The seed NEVER affects structure. Membership, archetype, anchor, and every geometric metric
//   are functions of the asteroid inputs alone. The seed affects exactly three things:
//     1. the formation `id` hash,
//     2. the cosmetic `designation`,
//     3. a bounded ± roll on the four soft ratings (see FORMATION_VARIANCE), clamped to [0,1].
//   So re-seeding a field re-labels it; it never re-shapes it.
//
// COORDINATE-DEPENDENCE (stated per the packet contract — tests lock both halves):
//   Translation-invariant AND rotation-invariant (pure relative geometry / intrinsics):
//     id, anchorAsteroidId, memberIds, count, archetype, designation, mass{}, spanRadius,
//     packing, elongation, dominance, resourceContinuity, dominantTypeId, yieldTotal, richness,
//     gasRisk, thermalRisk, sensorSignature, siteAffinity, coreCandidateId
//   Translation-DEPENDENT (moves with the field):
//     centroid{x,z}
//   Rotation-DEPENDENT (the corridor bearing grid is world-fixed, so clearances re-shuffle):
//     principalAxisRad, approachCorridors[].clearance, bestApproachBearingRad
//   `approachCorridors[].bearingRad` is a fixed authored grid and never changes.
//
// IDENTITY MODEL:
//   A formation's id is hash(seed, anchorKey) where the anchor is the canonically dominant member
//   (mass desc, radius desc, key asc). It is derived from intrinsic properties + seed — NEVER from
//   an array index and NEVER from a coordinate. Therefore it survives input shuffling, translation,
//   rotation, and a save/restore round-trip of the seed. Each asteroid belongs to at most one
//   formation, so anchors are unique by construction; residual hash collisions are broken
//   deterministically in canonical order.

import { hash32, makeStream } from '../core/rng.js';

export const FORMATION_MODEL_VERSION = 1;

/** Prefix is distinct from asteroidSites.js `site_N` so the two id spaces compose safely. */
export const FORMATION_ID_PREFIX = 'af_';

// --- Authored constants -----------------------------------------------------------------------

/**
 * Single-linkage bridge distance between two bodies (world units, centre-to-centre).
 * Symmetric in (a,b) and built only from radii => translation- and rotation-invariant.
 */
export const FORMATION_LINK = Object.freeze({
  baseGap: 90,
  radiusMult: 2.4,
  maxGap: 460,
});

/** Radius floor used for degenerate (zero-radius) bodies so shape math can never divide by zero. */
export const MIN_BODY_RADIUS = 0.5;

/** Half-width padding (world units) of an approach corridor beyond a body's own radius. */
export const CORRIDOR_HALF_WIDTH = 14;

/** Evenly spaced world-fixed approach bearings. Rotation re-shuffles clearances across this grid. */
export const CORRIDOR_BEARINGS = 8;

/** Classification thresholds. Evaluated in the documented order in classifyArchetype(). */
export const FORMATION_SHAPE = Object.freeze({
  dominanceMatriarch: 0.55,
  elongationStream: 0.6,
  packingDense: 0.28,
});

/**
 * Mean per-body yieldU that reads as a fully rich formation (top of the authored yieldU ranges).
 * Used only to normalise `richness`; it deliberately does NOT feed siteAffinity, which answers
 * "where do I sink a Core" (geometry + material) rather than "how much is in there" (survey).
 */
export const FORMATION_YIELD_REFERENCE = 32;

/** Max magnitude of the seeded ± roll applied to each soft rating, before clamping to [0,1]. */
export const FORMATION_VARIANCE = Object.freeze({
  gasRisk: 0.08,
  thermalRisk: 0.08,
  sensorSignature: 0.1,
  siteAffinity: 0.06,
});

export const FORMATION_ARCHETYPES = Object.freeze([
  Object.freeze({ id: 'af_solitary', name: 'Solitary Body', blurb: 'A single rock, standing alone. Every face is an approach.' }),
  Object.freeze({ id: 'af_shepherd_pair', name: 'Shepherd Pair', blurb: 'Two bodies holding station on each other. Short hauls, thin cover.' }),
  Object.freeze({ id: 'af_matriarch', name: 'Matriarch and Court', blurb: 'One dominant mass with satellites. The obvious place to sink a Core.' }),
  Object.freeze({ id: 'af_rubble_stream', name: 'Rubble Stream', blurb: 'A drawn-out ribbon of debris. Long lanes, long exposure.' }),
  Object.freeze({ id: 'af_dense_cluster', name: 'Dense Cluster', blurb: 'Packed tight enough to hide in and hard enough to shed heat into.' }),
  Object.freeze({ id: 'af_drift_swarm', name: 'Drift Swarm', blurb: 'Loose, scattered, unremarkable. Cheap to work, cheap to lose.' }),
]);

export const FORMATION_ARCHETYPE_BY_ID = Object.freeze(
  Object.fromEntries(FORMATION_ARCHETYPES.map((a) => [a.id, a])),
);

/** Cosmetic designations drawn from the seeded stream. Flavour only — never structural. */
export const FORMATION_DESIGNATIONS = Object.freeze([
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
  'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Sigma',
]);

/**
 * Authored geology traits per asteroid typeId. Carried locally (rather than imported from
 * src/data/mining.js) to keep this kernel dependency-free and fully fixture-testable.
 * Unknown typeIds fall back to FORMATION_TRAIT_DEFAULT — never a throw.
 */
export const FORMATION_TRAITS = Object.freeze({
  ast_common_rock: Object.freeze({ gas: 0.02, thermal: 0.15, signature: 0.1, workability: 0.75 }),
  ast_metallic: Object.freeze({ gas: 0.02, thermal: 0.35, signature: 0.45, workability: 0.9 }),
  ast_icy: Object.freeze({ gas: 0.35, thermal: 0.05, signature: 0.2, workability: 0.6 }),
  ast_crystalline: Object.freeze({ gas: 0.05, thermal: 0.3, signature: 0.65, workability: 0.55 }),
  ast_gas_cloud: Object.freeze({ gas: 0.9, thermal: 0.2, signature: 0.35, workability: 0.2 }),
  ast_rare_exotic: Object.freeze({ gas: 0.15, thermal: 0.55, signature: 0.85, workability: 0.45 }),
});

export const FORMATION_TRAIT_DEFAULT = Object.freeze({
  gas: 0.1, thermal: 0.2, signature: 0.25, workability: 0.5,
});

export const FORMATION_REJECT_REASON = Object.freeze({
  NOT_OBJECT: 'not-an-object',
  MISSING_KEY: 'missing-key',
  NON_FINITE_POSITION: 'non-finite-position',
  NON_FINITE_RADIUS: 'non-finite-radius',
  DUPLICATE_KEY: 'duplicate-key',
});

// --- Small numeric helpers --------------------------------------------------------------------

/** Normalise -0 to 0 so deepStrictEqual comparisons across transforms stay stable. */
function nz(n) {
  return n === 0 ? 0 : n;
}

/**
 * Round to 4dp and normalise -0. Guarantees byte-stable, finite output.
 *
 * The finiteness check must be re-applied AFTER the scale-round-unscale, not only before it:
 * `n * 1e4` overflows to Infinity for finite inputs above ~1.8e304, so an input-only guard would
 * return Infinity from a function documented to return finite values. Coordinates that large are
 * degenerate rather than meaningful, so they fail closed to 0 like any other rejected value.
 */
function r4(n) {
  if (!Number.isFinite(n)) return 0;
  const v = nz(Math.round(n * 1e4) / 1e4);
  return Number.isFinite(v) ? v : 0;
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function traitsFor(typeId) {
  return (typeof typeId === 'string' && FORMATION_TRAITS[typeId]) || FORMATION_TRAIT_DEFAULT;
}

function hex8(h) {
  return (h >>> 0).toString(16).padStart(8, '0');
}

// --- Input normalisation ----------------------------------------------------------------------

/**
 * Read one caller asteroid into a flat internal body record, or return a rejection.
 * Accepts either `{ x, z }` or `{ pos: { x, z } }` (world.js entity shape).
 */
function readBody(raw, keyOf) {
  if (!raw || typeof raw !== 'object') {
    return { reject: { key: null, reason: FORMATION_REJECT_REASON.NOT_OBJECT } };
  }
  let key = null;
  try {
    const k = keyOf(raw);
    if (typeof k === 'string' && k.length > 0) key = k;
    else if (Number.isFinite(k)) key = String(k);
  } catch {
    key = null;
  }
  if (key == null) return { reject: { key: null, reason: FORMATION_REJECT_REASON.MISSING_KEY } };

  const src = raw.pos && typeof raw.pos === 'object' ? raw.pos : raw;
  const x = Number(src.x);
  const z = Number(src.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return { reject: { key, reason: FORMATION_REJECT_REASON.NON_FINITE_POSITION } };
  }
  const rawRadius = Number(raw.radius);
  if (!Number.isFinite(rawRadius) || rawRadius < 0) {
    return { reject: { key, reason: FORMATION_REJECT_REASON.NON_FINITE_RADIUS } };
  }
  const radius = Math.max(MIN_BODY_RADIUS, rawRadius);

  const data = raw.data && typeof raw.data === 'object' ? raw.data : null;
  const typeId = (data && typeof data.typeId === 'string' && data.typeId)
    || (typeof raw.typeId === 'string' && raw.typeId)
    || null;
  // world.js stamps mass as 200 + size*40; mirror that when the caller omits it.
  const rawMass = Number(raw.mass);
  const mass = Number.isFinite(rawMass) && rawMass > 0 ? rawMass : 200 + radius * 40;

  const rawYield = Number((data && data.yieldU) ?? raw.yieldU);
  const yieldU = Number.isFinite(rawYield) && rawYield > 0 ? rawYield : 0;

  return { body: { key, x, z, radius, mass, typeId, yieldU } };
}

/** Total order used everywhere a "canonical" ordering is required. Never uses array index. */
function compareBodies(a, b) {
  if (b.mass !== a.mass) return b.mass - a.mass;
  if (b.radius !== a.radius) return b.radius - a.radius;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

// --- Clustering -------------------------------------------------------------------------------

/** Bridge threshold for a pair. Depends only on radii => coordinate-independent. */
export function linkDistance(radiusA, radiusB) {
  const ra = Number.isFinite(radiusA) ? Math.max(0, radiusA) : 0;
  const rb = Number.isFinite(radiusB) ? Math.max(0, radiusB) : 0;
  const d = FORMATION_LINK.baseGap + (ra + rb) * FORMATION_LINK.radiusMult;
  return Math.min(FORMATION_LINK.maxGap, d);
}

function makeUnionFind(n) {
  const parent = new Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) { const next = parent[i]; parent[i] = root; i = next; }
    return root;
  };
  return {
    find,
    union(a, b) {
      const ra = find(a); const rb = find(b);
      if (ra === rb) return;
      // Attach higher index under lower: deterministic, independent of union call order.
      if (ra < rb) parent[rb] = ra; else parent[ra] = rb;
    },
  };
}

// --- Shape metrics ----------------------------------------------------------------------------

/**
 * Mass-weighted centroid + covariance eigen-shape.
 * Guarded so <2 members, coincident members, or a degenerate covariance yield
 * elongation 0 / axis 0 rather than NaN (fail-closed rule).
 */
function shapeOf(members) {
  let massTotal = 0;
  for (const m of members) massTotal += m.mass;
  if (!(massTotal > 0)) massTotal = members.length || 1;

  let cx = 0; let cz = 0;
  for (const m of members) { cx += m.x * m.mass; cz += m.z * m.mass; }
  cx /= massTotal; cz /= massTotal;

  let cxx = 0; let czz = 0; let cxz = 0;
  for (const m of members) {
    const dx = m.x - cx; const dz = m.z - cz; const w = m.mass / massTotal;
    cxx += dx * dx * w; czz += dz * dz * w; cxz += dx * dz * w;
  }

  const tr = cxx + czz;
  const det = cxx * czz - cxz * cxz;
  const disc = Math.max(0, tr * tr - 4 * det);
  const s = Math.sqrt(disc);
  const l1 = (tr + s) / 2;
  const l2 = Math.max(0, (tr - s) / 2);

  // Rotation-invariant: eigenvalues of the covariance are unchanged by a rotation of the field.
  const elongation = l1 > 1e-9 ? clamp01(1 - Math.sqrt(l2 / l1)) : 0;
  // Rotation-DEPENDENT: the principal axis rotates with the field.
  let axis = 0;
  if (l1 > 1e-9 && (Math.abs(cxz) > 1e-12 || Math.abs(cxx - czz) > 1e-12)) {
    axis = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  }

  let spanRadius = 0;
  let areaSum = 0;
  for (const m of members) {
    const dx = m.x - cx; const dz = m.z - cz;
    const reach = Math.sqrt(dx * dx + dz * dz) + m.radius;
    if (reach > spanRadius) spanRadius = reach;
    areaSum += m.radius * m.radius;
  }
  if (!(spanRadius > 0)) spanRadius = MIN_BODY_RADIUS;
  const packing = clamp01(areaSum / (spanRadius * spanRadius));

  return { cx, cz, massTotal, elongation, axis, spanRadius, packing };
}

/**
 * World-fixed approach corridors. Rotation-DEPENDENT by design: the bearing grid does not turn
 * with the field, so rotating the field re-shuffles which bearing is blocked.
 * clearance 1 = nothing in the way, 0 = the whole formation mass sits in that corridor.
 */
function corridorsOf(members, shape) {
  const out = [];
  for (let k = 0; k < CORRIDOR_BEARINGS; k++) {
    const bearing = (k * 2 * Math.PI) / CORRIDOR_BEARINGS;
    const dx = Math.cos(bearing); const dz = Math.sin(bearing);
    let blocked = 0;
    for (const m of members) {
      const ox = m.x - shape.cx; const oz = m.z - shape.cz;
      const along = ox * dx + oz * dz;
      if (along <= 0) continue; // behind the approach face
      const perp = Math.abs(ox * dz - oz * dx);
      if (perp < m.radius + CORRIDOR_HALF_WIDTH) blocked += m.mass;
    }
    out.push({
      bearingRad: r4(bearing),
      clearance: r4(clamp01(1 - blocked / shape.massTotal)),
    });
  }
  return out;
}

// --- Classification ---------------------------------------------------------------------------

/**
 * Archetype from shape alone (never from the seed). Evaluated strictly in this order:
 *   1 member -> solitary; 2 -> shepherd pair; dominant anchor -> matriarch;
 *   elongated -> rubble stream; tightly packed -> dense cluster; else drift swarm.
 */
export function classifyArchetype({ count, dominance, elongation, packing } = {}) {
  const n = Number.isFinite(count) ? count : 0;
  if (n <= 1) return 'af_solitary';
  if (n === 2) return 'af_shepherd_pair';
  if (clamp01(dominance) >= FORMATION_SHAPE.dominanceMatriarch) return 'af_matriarch';
  if (clamp01(elongation) >= FORMATION_SHAPE.elongationStream) return 'af_rubble_stream';
  if (clamp01(packing) >= FORMATION_SHAPE.packingDense) return 'af_dense_cluster';
  return 'af_drift_swarm';
}

/** Stable formation id from seed + the anchor member's stable key. Never index- or position-derived. */
export function formationIdFor(seed, anchorKey) {
  return `${FORMATION_ID_PREFIX}${hex8(hash32((seed >>> 0), 'asteroidFormation', String(anchorKey)))}`;
}

// --- Main entry -------------------------------------------------------------------------------

/**
 * Build the formation model for a set of asteroid bodies.
 *
 * @param {Array<object>} asteroids Bodies as `{ id, radius, mass?, pos:{x,z} | x,z, data:{ typeId, yieldU } }`.
 *   Not mutated. Array order does not affect any output.
 * @param {object} [opts]
 * @param {number} [opts.seed=0] Serializable uint32 seed from game state. Labels only, never structure.
 * @param {(a:object)=>string} [opts.keyOf] Stable per-asteroid key. Defaults to `a.id`.
 *   NOTE for persistence callers: unanchored asteroid ENTITY ids are re-rolled on sector
 *   re-materialization (see asteroidSites.js durability model), so a save-stable caller must
 *   supply a save-stable key here rather than relying on the live entity id.
 * @returns {object} JSON-safe model, deep-frozen.
 */
export function buildAsteroidFormations(asteroids, opts = {}) {
  const seed = Number.isFinite(opts && opts.seed) ? (opts.seed >>> 0) : 0;
  const keyOf = (opts && typeof opts.keyOf === 'function') ? opts.keyOf : (a) => a && a.id;

  const list = Array.isArray(asteroids) ? asteroids : [];
  const bodies = [];
  const rejected = [];
  const seen = new Set();

  for (const raw of list) {
    const res = readBody(raw, keyOf);
    if (res.reject) { rejected.push(res.reject); continue; }
    if (seen.has(res.body.key)) {
      rejected.push({ key: res.body.key, reason: FORMATION_REJECT_REASON.DUPLICATE_KEY });
      continue;
    }
    seen.add(res.body.key);
    bodies.push(res.body);
  }

  // Canonical order: everything downstream iterates this, never the caller's array order.
  bodies.sort(compareBodies);
  rejected.sort((a, b) => {
    const ak = a.key == null ? '' : a.key; const bk = b.key == null ? '' : b.key;
    if (ak !== bk) return ak < bk ? -1 : 1;
    return a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0;
  });

  // Single-linkage clustering. The resulting partition is unique for a given point set, so it is
  // independent of input order; Euclidean distance makes it translation- and rotation-invariant.
  const uf = makeUnionFind(bodies.length);
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]; const b = bodies[j];
      const dx = a.x - b.x; const dz = a.z - b.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d <= linkDistance(a.radius, b.radius)) uf.union(i, j);
    }
  }

  const groups = new Map();
  for (let i = 0; i < bodies.length; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(bodies[i]);
  }

  const raw = [];
  for (const members of groups.values()) {
    members.sort(compareBodies);
    raw.push(members);
  }
  // Canonical formation order = order of each formation's anchor.
  raw.sort((a, b) => compareBodies(a[0], b[0]));

  const usedIds = new Set();
  const formations = raw.map((members) => buildOne(members, seed, usedIds));

  const byAsteroidId = {};
  for (const f of formations) for (const mid of f.memberIds) byAsteroidId[mid] = f.id;

  return Object.freeze({
    version: FORMATION_MODEL_VERSION,
    seed,
    count: formations.length,
    bodyCount: bodies.length,
    formations: Object.freeze(formations),
    byAsteroidId: Object.freeze(byAsteroidId),
    rejected: Object.freeze(rejected.map((r) => Object.freeze({ ...r }))),
  });
}

function buildOne(members, seed, usedIds) {
  const anchor = members[0];
  const shape = shapeOf(members);

  // --- id: intrinsic anchor key + seed. Deterministic collision break in canonical order. ---
  let id = formationIdFor(seed, anchor.key);
  if (usedIds.has(id)) {
    let n = 1;
    while (usedIds.has(`${id}_${n}`)) n++;
    id = `${id}_${n}`;
  }
  usedIds.add(id);

  const stream = makeStream(seed, `asteroidFormation:${anchor.key}`);
  const designation = FORMATION_DESIGNATIONS[
    Math.floor(stream() * FORMATION_DESIGNATIONS.length) % FORMATION_DESIGNATIONS.length
  ];

  // --- mass distribution (coordinate-independent) ---
  const massTotal = shape.massTotal;
  let massMin = Infinity; let massMax = 0;
  for (const m of members) {
    if (m.mass < massMin) massMin = m.mass;
    if (m.mass > massMax) massMax = m.mass;
  }
  if (!Number.isFinite(massMin)) massMin = 0;
  const dominance = massTotal > 0 ? clamp01(anchor.mass / massTotal) : 1;

  // --- resource continuity: mass-weighted share of the dominant material ---
  const byType = new Map();
  for (const m of members) {
    const t = m.typeId || 'unknown';
    byType.set(t, (byType.get(t) || 0) + m.mass);
  }
  let dominantTypeId = null; let dominantMass = -1;
  // Iterate a sorted key list so ties resolve identically regardless of insertion order.
  for (const t of Array.from(byType.keys()).sort()) {
    const v = byType.get(t);
    if (v > dominantMass) { dominantMass = v; dominantTypeId = t; }
  }
  const resourceContinuity = massTotal > 0 ? clamp01(dominantMass / massTotal) : 0;

  // --- survey richness (coordinate-independent). Raw total + a normalised readout. ---
  let yieldTotal = 0;
  for (const m of members) yieldTotal += m.yieldU;
  const richness = clamp01((yieldTotal / members.length) / FORMATION_YIELD_REFERENCE);

  // --- mass-weighted trait means ---
  let gas = 0; let thermal = 0; let signature = 0; let workability = 0;
  for (const m of members) {
    const t = traitsFor(m.typeId);
    const w = massTotal > 0 ? m.mass / massTotal : 1 / members.length;
    gas += t.gas * w; thermal += t.thermal * w; signature += t.signature * w;
    workability += t.workability * w;
  }

  // Packed rock traps heat and pressure; a loose swarm vents. Scale in the packing term.
  const gasBase = clamp01(gas * (0.75 + 0.5 * shape.packing));
  const thermalBase = clamp01(thermal * (0.7 + 0.6 * shape.packing));
  // Signature grows with total mass (log-scaled) and with how loud the material is.
  const massLoud = clamp01(Math.log10(1 + massTotal / 200) / 2);
  const signatureBase = clamp01(0.45 * signature + 0.55 * massLoud * (0.5 + 0.5 * signature));
  // A good site wants: one big anchor, homogeneous material, workable rock, and low gas hazard.
  const affinityBase = clamp01(
    0.3 * dominance + 0.25 * resourceContinuity + 0.25 * workability
    + 0.2 * shape.packing - 0.25 * gasBase,
  );

  const gasRisk = rollBounded(stream, gasBase, FORMATION_VARIANCE.gasRisk);
  const thermalRisk = rollBounded(stream, thermalBase, FORMATION_VARIANCE.thermalRisk);
  const sensorSignature = rollBounded(stream, signatureBase, FORMATION_VARIANCE.sensorSignature);
  const siteAffinity = rollBounded(stream, affinityBase, FORMATION_VARIANCE.siteAffinity);

  const corridors = corridorsOf(members, shape);
  let best = 0;
  for (let i = 1; i < corridors.length; i++) {
    if (corridors[i].clearance > corridors[best].clearance) best = i;
  }

  const archetype = classifyArchetype({
    count: members.length,
    dominance,
    elongation: shape.elongation,
    packing: shape.packing,
  });

  return Object.freeze({
    id,
    version: FORMATION_MODEL_VERSION,
    designation,
    archetype,
    archetypeName: FORMATION_ARCHETYPE_BY_ID[archetype].name,
    label: `${FORMATION_ARCHETYPE_BY_ID[archetype].name} ${designation}`,

    anchorAsteroidId: anchor.key,
    memberIds: Object.freeze(members.map((m) => m.key)),
    count: members.length,

    // --- coordinate-independent ---
    mass: Object.freeze({
      total: r4(massTotal),
      mean: r4(massTotal / members.length),
      min: r4(massMin),
      max: r4(massMax),
      dominance: r4(dominance),
    }),
    spanRadius: r4(shape.spanRadius),
    packing: r4(shape.packing),
    elongation: r4(shape.elongation),
    resourceContinuity: r4(resourceContinuity),
    dominantTypeId,
    yieldTotal: r4(yieldTotal),
    richness: r4(richness),
    gasRisk,
    thermalRisk,
    sensorSignature,
    siteAffinity,
    coreCandidateId: anchor.key,

    // --- translation-dependent ---
    centroid: Object.freeze({ x: r4(shape.cx), z: r4(shape.cz) }),

    // --- rotation-dependent ---
    principalAxisRad: r4(shape.axis),
    approachCorridors: Object.freeze(corridors.map((c) => Object.freeze(c))),
    bestApproachBearingRad: corridors[best].bearingRad,
  });
}

/** Apply one seeded ± roll of at most `band` to `base`, clamp to [0,1], round. Always finite. */
function rollBounded(stream, base, band) {
  const roll = (stream() * 2 - 1) * band;
  return r4(clamp01(base + roll));
}
