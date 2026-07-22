// PQ-012 / SF-12 — Continuous field kernel (pure math core).
//
// ONE deterministic, finite-radius continuous-field primitive with an authoritative
// register/unregister lifecycle. It computes bounded, coupling-selective accelerations for the
// three consumers (Well / Repulsor / Cone) and exposes a PURE `sampleFieldAcceleration` seam that
// the release predictor reuses without importing any system.
//
// Determinism contract (root AGENTS.md §2/§6, bible §9): every function here is a pure function of
// positions, authored strengths, and the caller-supplied simTime. No Math.random, no Date.now, no
// wall clock, no module state. `list()` returns fields in a STABLE id-sorted order so the
// float summation in sampleFieldAcceleration is order-stable across runs (replay-hash safe).
//
// Heavy-shrug (brief req 2/13): Δv = impulse/mass = a·dt is mass-independent, so the shrug lives in
// the COUPLING term (couplingScale scales a_effective DOWN with mass), never in the acceleration
// cap. The cap (FIELD_MAX_ACCEL) is a separate safety bound on the summed total.

import {
  FIELD_KINDS,
  FIELD_COUPLING,
  FIELD_MAX_ACCEL,
} from '../../data/fields.js';

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

// Normalize a raw register() spec into a frozen-shape live record. Pure; allocates one record.
export function normalizeField(spec = {}) {
  const kind = spec.kind === FIELD_KINDS.WELL || spec.kind === FIELD_KINDS.REPULSOR || spec.kind === FIELD_KINDS.CONE
    ? spec.kind : FIELD_KINDS.WELL;
  const center = spec.center || {};
  const dir = spec.dir || {};
  let dx = finite(dir.x, kind === FIELD_KINDS.CONE ? 1 : 0);
  let dz = finite(dir.z, 0);
  const dlen = Math.hypot(dx, dz);
  if (dlen > 1e-6) { dx /= dlen; dz /= dlen; } else { dx = 1; dz = 0; }
  return {
    id: String(spec.id != null ? spec.id : `field_${kind}`),
    kind,
    center: { x: finite(center.x), z: finite(center.z) },
    dir: { x: dx, z: dz },
    radius: positive(spec.radius, 120),
    strength: Math.max(0, finite(spec.strength, 200)),
    falloff: positive(spec.falloff, 1.5),
    // PQ-013: OPTIONAL annular profile (the planet's artistic-liberties attraction — STEP 12:
    // "softened, bounded, annular"). innerRadius zeroes the field below it; innerSoft ramps 0->1
    // across [innerRadius, innerRadius+innerSoft]. Defaults (0/0) leave every existing field's
    // math bit-identical, and the pure predictor seam picks the shape up with no further wiring.
    innerRadius: Math.max(0, finite(spec.innerRadius, 0)),
    innerSoft: Math.max(0, finite(spec.innerSoft, 0)),
    // PQ-013: presentation tag passthrough ('external' = authored world profile, not a player
    // deploy — the fields system keeps it out of the deploy cap and the Intake-funnel VFX).
    tag: typeof spec.tag === 'string' ? spec.tag : null,
    halfAngleRad: positive(spec.halfAngleRad, Math.PI * 0.25),
    edgeSoftRad: Math.max(0, finite(spec.edgeSoftRad, 0.12)),
    durationS: spec.durationS === Infinity ? Infinity : Math.max(0, finite(spec.durationS, 0)),
    sourceId: spec.sourceId != null ? spec.sourceId : null,
    team: spec.team != null ? spec.team : null,
    filters: spec.filters && typeof spec.filters === 'object' ? { ...spec.filters } : null,
    createdAt: finite(spec.createdAt, 0),
    expireAt: spec.durationS === Infinity ? Infinity : finite(spec.createdAt, 0) + Math.max(0, finite(spec.durationS, 0)),
  };
}

// Radial falloff scalar in [0,1]: 1 at the center, 0 at (and beyond) the radius. The exponent
// eases toward the edge so the outer band reads as the "commitment margin" (bible §4.4). This is
// the single source of truth the VFX density curve must mirror (gauges must not lie).
// PQ-013: an annular field (innerRadius > 0) additionally gates to 0 below innerRadius, ramping
// 0->1 across innerSoft — the planet's bounded ring of attraction. Fields authored without an
// innerRadius are untouched (gate degenerates to 1).
export function fieldFalloff(field, r) {
  const R = field.radius;
  if (!(R > 0) || r >= R) return 0;
  const t = 1 - r / R; // 1 at center → 0 at edge
  const outer = Math.pow(clamp(t, 0, 1), field.falloff);
  const rIn = field.innerRadius;
  if (!(rIn > 0)) return outer;
  if (r <= rIn) return 0;
  const soft = field.innerSoft;
  const gate = soft > 0 ? clamp((r - rIn) / soft, 0, 1) : 1;
  return outer * gate;
}

// Angular gate for the cone wedge: 1 on-axis, ramping to 0 across edgeSoftRad past the half-angle.
export function coneAngularGate(field, angleFromAxis) {
  const a = Math.abs(angleFromAxis);
  const inner = field.halfAngleRad;
  const soft = field.edgeSoftRad;
  if (a <= inner) return 1;
  if (soft <= 0 || a >= inner + soft) return 0;
  const t = 1 - (a - inner) / soft;
  return clamp(t, 0, 1);
}

// Coupling scalar — the heavy-shrug contract. bodyProfile: { mass, type, marked }.
//   projectile / pickup  → couple above 1 (light + the marquee reads)
//   everything else       → massCouple = refMass / max(mass, refMass), floored (heavy shrugs)
//   marked (painted target) → boosted but a marked heavy still shrugs (capped under a light body's 1)
export function couplingScale(bodyProfile) {
  const type = bodyProfile && bodyProfile.type;
  if (type === 'projectile') return FIELD_COUPLING.projectileCouple;
  if (type === 'pickup') return FIELD_COUPLING.pickupCouple;
  const mass = positive(bodyProfile && bodyProfile.mass, 1);
  // Base mass-couple: 1 at/under refMass, falling off with mass, floored so a heavy still drifts.
  const base = clamp(FIELD_COUPLING.refMass / Math.max(mass, FIELD_COUPLING.refMass), FIELD_COUPLING.minShipCouple, 1);
  if (!(bodyProfile && bodyProfile.marked)) return base;
  // Marking boosts a body that would otherwise shrug — up to markedCap — but never reduces a light
  // body already at full coupling, and a marked heavy still couples below a light body's 1.0.
  const boosted = Math.min(base * FIELD_COUPLING.markedBoost, FIELD_COUPLING.markedCap);
  return Math.min(1, Math.max(base, boosted));
}

// Whether a field couples to a body at all (cheap pre-filter used before the radial math). Reads
// only type/team/filters — never redefines targeting vocabulary. `filters.excludeSourceTeam`
// spares friendly craft; `filters.types` (if present) whitelists entity types.
export function fieldAffectsBody(field, bodyProfile) {
  if (!field || !bodyProfile) return false;
  const filters = field.filters;
  if (filters) {
    if (Array.isArray(filters.types) && !filters.types.includes(bodyProfile.type)) return false;
    if (filters.excludeSourceTeam && field.team != null && bodyProfile.team === field.team) return false;
    if (filters.excludeId != null && bodyProfile.id === filters.excludeId) return false;
  }
  return true;
}

// Raw (pre-coupling) acceleration vector a single field applies at a world point. Writes into
// `out` ({ax,az}) and returns it; zero outside the radius / wedge. Pure, allocation-free when out
// is supplied.
export function fieldRawAcceleration(field, x, z, out) {
  const o = out || { ax: 0, az: 0 };
  o.ax = 0; o.az = 0;
  if (!field || field.strength <= 0 || !(field.radius > 0)) return o;
  const dx = x - field.center.x;
  const dz = z - field.center.z;
  const r = Math.hypot(dx, dz);
  if (r >= field.radius) return o;
  const fall = fieldFalloff(field, r);
  if (fall <= 0) return o;

  if (field.kind === FIELD_KINDS.CONE) {
    // Directed current along dir, gated by the wedge angle. Bodies in the wedge are driven
    // mouth→exit (bible §4.3 Sluice). At the apex (r≈0) the bearing is undefined but the gate
    // still applies forward thrust.
    let angle = 0;
    if (r > 1e-4) {
      const bearing = Math.atan2(dz, dx);
      const axis = Math.atan2(field.dir.z, field.dir.x);
      angle = Math.atan2(Math.sin(bearing - axis), Math.cos(bearing - axis));
    }
    const gate = coneAngularGate(field, angle);
    if (gate <= 0) return o;
    const a = field.strength * fall * gate;
    o.ax = field.dir.x * a;
    o.az = field.dir.z * a;
    return o;
  }

  // Radial well/repulsor. inward = toward center (well), outward = away (repulsor).
  if (r < 1e-4) return o; // at the exact center the bearing is undefined → no force (avoids NaN)
  const inv = 1 / r;
  const ux = dx * inv, uz = dz * inv; // unit vector center → body
  const a = field.strength * fall;
  const sign = field.kind === FIELD_KINDS.WELL ? -1 : 1; // well pulls in, repulsor pushes out
  o.ax = ux * a * sign;
  o.az = uz * a * sign;
  return o;
}

const _rawScratch = { ax: 0, az: 0 };

/**
 * PURE predictor seam + per-tick force source. Sum the coupling-scaled acceleration of every field
 * at `pos` for a body, then clamp the total magnitude to FIELD_MAX_ACCEL. `vel` is accepted for
 * signature parity with future velocity-dependent fields (currently unused — fields are positional).
 *
 * @param {{x:number,z:number}} pos
 * @param {{x:number,z:number}|null} vel
 * @param {Array} fields          id-sorted snapshot (kernel.list())
 * @param {number} simTime        caller sim clock (accepted for parity; math is time-independent)
 * @param {{mass:number,type:string,team:*,marked:boolean,id:*}} [bodyProfile]
 * @param {{ax:number,az:number}} [out]
 * @returns {{ax:number,az:number}}
 */
export function sampleFieldAcceleration(pos, vel, fields, simTime, bodyProfile, out) {
  const o = out || { ax: 0, az: 0 };
  o.ax = 0; o.az = 0;
  if (!pos || !Array.isArray(fields) || fields.length === 0) return o;
  const profile = bodyProfile || DEFAULT_PROFILE;
  const couple = couplingScale(profile);
  if (couple <= 0) return o;
  let sx = 0, sz = 0;
  // Stable-order summation (fields are id-sorted) keeps the float result identical across runs.
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!fieldAffectsBody(field, profile)) continue;
    fieldRawAcceleration(field, pos.x, pos.z, _rawScratch);
    sx += _rawScratch.ax;
    sz += _rawScratch.az;
  }
  sx *= couple;
  sz *= couple;
  const mag = Math.hypot(sx, sz);
  if (mag > FIELD_MAX_ACCEL) {
    const k = FIELD_MAX_ACCEL / mag;
    sx *= k; sz *= k;
  }
  o.ax = sx; o.az = sz;
  return o;
}

const DEFAULT_PROFILE = Object.freeze({ mass: 1, type: 'ship', team: null, marked: false, id: null });

const _projP = { x: 0, z: 0 };
const _projV = { x: 0, z: 0 };
const _projA = { ax: 0, az: 0 };

/**
 * PURE field-aware trajectory projection — the predictor's "bent path" seam (brief req 9). Forward
 * -integrates a body from (pos, vel) under the fields using the SAME semi-implicit Euler shape the
 * fixed-step sim applies (Δv = a·dt then Δx = v·dt), so the projected path matches the actual
 * simulated path (predictor-vs-actual). Optionally tracks closest approach to a moving aim.
 *
 * Returns { points:[{x,z}...], end:{x,z}, endVel:{x,z}, closest:{x,z,dist,t}, hit, hitT }.
 * Allocates the points array (15 Hz predictor cadence — not a 60 Hz per-body hot path).
 */
export function projectFieldTrajectory(pos, vel, fields, bodyProfile, opts = {}) {
  const dt = positive(opts.dt, 1 / 60);
  const steps = Math.max(1, Math.min(600, Math.trunc(finite(opts.steps, 40))));
  const aimPos = opts.aimPos || null;
  const aimVx = finite(opts.aimVel && opts.aimVel.x);
  const aimVz = finite(opts.aimVel && opts.aimVel.z);
  const hitRadius = Math.max(0, finite(opts.hitRadius, 0));
  const simTime = finite(opts.simTime, 0);
  const profile = bodyProfile || DEFAULT_PROFILE;
  let px = finite(pos && pos.x), pz = finite(pos && pos.z);
  let vx = finite(vel && vel.x), vz = finite(vel && vel.z);
  const points = [{ x: px, z: pz }];
  let cX = px, cZ = pz, cDist = Infinity, cT = 0, hit = false, hitT = -1;
  for (let i = 1; i <= steps; i++) {
    _projP.x = px; _projP.z = pz; _projV.x = vx; _projV.z = vz;
    sampleFieldAcceleration(_projP, _projV, fields, simTime, profile, _projA);
    vx += _projA.ax * dt; vz += _projA.az * dt;
    px += vx * dt; pz += vz * dt;
    points.push({ x: px, z: pz });
    if (aimPos) {
      const t = i * dt;
      const ax = aimPos.x + aimVx * t, az = aimPos.z + aimVz * t;
      const d = Math.hypot(px - ax, pz - az);
      if (d < cDist) { cDist = d; cX = px; cZ = pz; cT = t; }
      if (hitRadius > 0 && !hit && d <= hitRadius) { hit = true; hitT = t; }
    }
  }
  return { points, end: { x: px, z: pz }, endVel: { x: vx, z: vz }, closest: { x: cX, z: cZ, dist: cDist, t: cT }, hit, hitT };
}

/**
 * The authoritative field registry. Owns the register/unregister lifecycle. Pure with respect to
 * the sim (no rng, no wall clock); the caller supplies createdAt from state.simTime.
 */
export function createFieldKernel() {
  const fields = new Map(); // id -> normalized record
  let listCache = null;     // id-sorted snapshot, invalidated on any mutation

  function invalidate() { listCache = null; }

  return {
    /** Register (or replace) a field. Returns the live normalized record. */
    register(spec) {
      const record = normalizeField(spec);
      fields.set(record.id, record);
      invalidate();
      return record;
    },
    /** Remove a field by id. Returns true if one was present. */
    unregister(id) {
      const had = fields.delete(id);
      if (had) invalidate();
      return had;
    },
    /** Update mutable geometry/strength of a live field (player-attached fields follow the ship). */
    update(id, patch) {
      const record = fields.get(id);
      if (!record || !patch) return null;
      if (patch.center) { record.center.x = finite(patch.center.x, record.center.x); record.center.z = finite(patch.center.z, record.center.z); }
      if (patch.dir) {
        let dx = finite(patch.dir.x, record.dir.x), dz = finite(patch.dir.z, record.dir.z);
        const l = Math.hypot(dx, dz);
        if (l > 1e-6) { record.dir.x = dx / l; record.dir.z = dz / l; }
      }
      if (patch.strength != null) record.strength = Math.max(0, finite(patch.strength, record.strength));
      // geometry mutation does not change ordering, so the id-sorted cache stays valid
      return record;
    },
    has(id) { return fields.has(id); },
    get(id) { return fields.get(id) || null; },
    /** Id-sorted snapshot (stable summation order). Cached until the next mutation. */
    list() {
      if (listCache) return listCache;
      listCache = Array.from(fields.values()).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return listCache;
    },
    get size() { return fields.size; },
    clear() { if (fields.size) { fields.clear(); invalidate(); } },
    /** Drop every field whose bounded lifetime has elapsed. Returns the removed ids. */
    expire(now) {
      let removed = null;
      for (const [id, f] of fields) {
        if (f.expireAt !== Infinity && now >= f.expireAt) { (removed || (removed = [])).push(id); }
      }
      if (removed) { for (const id of removed) fields.delete(id); invalidate(); }
      return removed || EMPTY;
    },
  };
}

const EMPTY = Object.freeze([]);
