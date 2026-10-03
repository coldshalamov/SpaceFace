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
  fieldVolumeOf,
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

function isKnownKind(kind) {
  return kind === FIELD_KINDS.WELL
    || kind === FIELD_KINDS.REPULSOR
    || kind === FIELD_KINDS.CONE
    || kind === FIELD_KINDS.SHEET;
}

// Normalize a raw register() spec into a frozen-shape live record. Pure; allocates one record.
export function normalizeField(spec = {}) {
  const kind = isKnownKind(spec.kind) ? spec.kind : FIELD_KINDS.WELL;
  const center = spec.center || {};
  const dir = spec.dir || {};
  const needsDir = kind === FIELD_KINDS.CONE || kind === FIELD_KINDS.SHEET;
  let dx = finite(dir.x, needsDir ? 1 : 0);
  let dz = finite(dir.z, 0);
  const dlen = Math.hypot(dx, dz);
  if (dlen > 1e-6) { dx /= dlen; dz /= dlen; } else { dx = 1; dz = 0; }
  return {
    id: String(spec.id != null ? spec.id : `field_${kind}`),
    kind,
    volume: fieldVolumeOf(spec),
    center: { x: finite(center.x), z: finite(center.z) },
    dir: { x: dx, z: dz },
    radius: positive(spec.radius, 120),
    strength: Math.max(0, finite(spec.strength, 200)),
    damping: Math.max(0, finite(spec.damping, 0)),
    falloff: positive(spec.falloff, 1.5),
    maxAffected: Number.isFinite(spec.maxAffected) && spec.maxAffected > 0 ? Math.floor(spec.maxAffected) : Infinity,
    // PQ-013: OPTIONAL annular profile (the planet's artistic-liberties attraction — STEP 12:
    // "softened, bounded, annular"). innerRadius zeroes the field below it; innerSoft ramps 0->1
    // across [innerRadius, innerRadius+innerSoft]. Defaults (0/0) leave every existing field's
    // math bit-identical, and the pure predictor seam picks the shape up with no further wiring.
    innerRadius: Math.max(0, finite(spec.innerRadius, 0)),
    innerSoft: Math.max(0, finite(spec.innerSoft, 0)),
    // PQ-147.00: scoop-sheet half-width (WU). Unused by well/repulsor/cone.
    halfWidth: positive(spec.halfWidth, 48),
    // PQ-013: presentation tag passthrough ('external' = authored world profile, not a player
    // deploy — the fields system keeps it out of the deploy cap and the Intake-funnel VFX).
    tag: typeof spec.tag === 'string' ? spec.tag : null,
    halfAngleRad: positive(spec.halfAngleRad, Math.PI * 0.25),
    edgeSoftRad: Math.max(0, finite(spec.edgeSoftRad, 0.12)),
    durationS: spec.durationS === Infinity ? Infinity : Math.max(0, finite(spec.durationS, 0)),
    sourceId: spec.sourceId != null ? spec.sourceId : null,
    ownerId: spec.ownerId != null ? spec.ownerId : null,
    team: spec.team != null ? spec.team : null,
    filters: spec.filters && typeof spec.filters === 'object' ? { ...spec.filters } : null,
    createdAt: finite(spec.createdAt, 0),
    expireAt: spec.durationS === Infinity ? Infinity : finite(spec.createdAt, 0) + Math.max(0, finite(spec.durationS, 0)),
    // PQ-147.02 — hitch lock (Mass Seed). Zero unless a body is latched to sourceId.
    lockStrength: Math.max(0, finite(spec.lockStrength, 0)),
    // Velocity of the medium itself. Zero keeps viscosity in the world frame,
    // bit-identical to fields that never authored a moving frame.
    frame: {
      x: finite(spec.frame && spec.frame.x),
      z: finite(spec.frame && spec.frame.z),
    },
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

// Coupling scalar — the heavy-shrug contract. bodyProfile: { mass, type, fieldResponseMult }.
//   projectile / pickup  → couple above 1 (light + the marquee reads)
//   everything else       → massCouple = refMass / max(mass, refMass), floored (heavy shrugs)
//   Gravity Mark response  → 3× well/sink pull; markedCap ceilings the boost, not a 0.95 clip
export function couplingScale(bodyProfile) {
  const type = bodyProfile && bodyProfile.type;
  if (type === 'projectile') return FIELD_COUPLING.projectileCouple;
  if (type === 'pickup') return FIELD_COUPLING.pickupCouple;
  const mass = positive(bodyProfile && bodyProfile.mass, 1);
  // Base mass-couple: 1 at/under refMass, falling off with mass, floored so a heavy still drifts.
  const base = clamp(FIELD_COUPLING.refMass / Math.max(mass, FIELD_COUPLING.refMass), FIELD_COUPLING.minShipCouple, 1);
  const response = Number.isFinite(bodyProfile && bodyProfile.fieldResponseMult)
    ? Math.max(0, bodyProfile.fieldResponseMult)
    : 1;
  let scale;
  if (response === 1) scale = base;
  else if (response < 1) scale = base * response;
  else {
    // Gravity Mark: multiply mass-coupling by the earned response (3×). Do not clip back under 1.0 —
    // that discarded the 3× on a Hornet medium (0.5 → 1.5 became 0.95). A marked heavy still
    // mass-classes because `base` stays in the product.
    const boosted = Math.min(base * response, FIELD_COUPLING.markedCap);
    scale = Math.max(base, boosted);
  }
  if (bodyProfile && bodyProfile.boosting) {
    const boostCouple = Number.isFinite(FIELD_COUPLING.boostCouple) ? FIELD_COUPLING.boostCouple : 0.28;
    scale = Math.max(FIELD_COUPLING.minShipCouple, scale * boostCouple);
  }
  return scale;
}

// Whether a field couples to a body at all (cheap pre-filter used before the radial math). Reads
// only type/team/filters — never redefines targeting vocabulary. `filters.excludeSourceTeam`
// spares friendly craft; `filters.types` (if present) whitelists entity types.
export function fieldAffectsBody(field, bodyProfile) {
  if (!field || !bodyProfile) return false;
  // Kinematic / non-dynamic bodies keep their scripted motion. Omitted dynamic
  // stays coupled so existing predictor profiles and heavy dynamic hulls still feel the field.
  if (bodyProfile.dynamic === false || bodyProfile.kinematic === true) return false;
  const filters = field.filters;
  if (filters) {
    if (Array.isArray(filters.types) && !filters.types.includes(bodyProfile.type)) return false;
    if (filters.excludeSourceTeam && field.team != null && bodyProfile.team === field.team) return false;
    if (filters.excludeId != null && bodyProfile.id === filters.excludeId) return false;
  }
  return true;
}

/**
 * Geometric membership — ring, cone wedge, or scoop sheet. Never a sphere.
 * Soft cone edge counts as inside (the gate is still on).
 */
export function fieldContainsPoint(field, x, z) {
  if (!field || !(field.radius > 0)) return false;
  const dx = x - field.center.x;
  const dz = z - field.center.z;
  if (field.kind === FIELD_KINDS.SHEET) {
    const along = dx * field.dir.x + dz * field.dir.z;
    if (along < 0 || along >= field.radius) return false;
    const latX = dx - field.dir.x * along;
    const latZ = dz - field.dir.z * along;
    return Math.hypot(latX, latZ) <= positive(field.halfWidth, 48);
  }
  const r = Math.hypot(dx, dz);
  if (r >= field.radius) return false;
  if (field.innerRadius > 0 && r <= field.innerRadius) return false;
  if (field.kind === FIELD_KINDS.CONE) {
    let angle = 0;
    if (r > 1e-4) {
      const bearing = Math.atan2(dz, dx);
      const axis = Math.atan2(field.dir.z, field.dir.x);
      angle = Math.atan2(Math.sin(bearing - axis), Math.cos(bearing - axis));
    }
    return coneAngularGate(field, angle) > 0;
  }
  return true;
}

const _lockScratch = { ax: 0, az: 0 };

// Hitch lock pull — uncoupled well-inward force. A frame lock, not a standing gravity well.
function hitchLockAcceleration(field, x, z, out) {
  const o = out || { ax: 0, az: 0 };
  o.ax = 0;
  o.az = 0;
  const lock = field && field.lockStrength;
  if (!(lock > 0) || !(field.radius > 0)) return o;
  const dx = x - field.center.x;
  const dz = z - field.center.z;
  const r = Math.hypot(dx, dz);
  if (r >= field.radius || r < 1e-4) return o;
  const fall = fieldFalloff(field, r);
  if (fall <= 0) return o;
  const a = lock * fall;
  const inv = 1 / r;
  o.ax = -dx * inv * a;
  o.az = -dz * inv * a;
  return o;
}

// Viscosity opposes velocity in the field's own frame (frame 0 is the world).
// Power against that relative velocity is -c|u|^2, so a stationary medium cannot
// add kinetic energy through drag alone. Pull and push stay the positional term.
function viscosityAccel(field, vel, fall) {
  const frame = field && field.frame;
  const ux = finite(vel && vel.x) - finite(frame && frame.x);
  const uz = finite(vel && vel.z) - finite(frame && frame.z);
  return { x: -ux * field.damping * fall, z: -uz * field.damping * fall };
}

// Raw (pre-coupling) acceleration vector a single field applies at a world point. Writes into
// `out` ({ax,az}) and returns it; zero outside the radius / wedge. Pure, allocation-free when out
// is supplied.
export function fieldRawAcceleration(field, x, z, out, vel = null) {
  const o = out || { ax: 0, az: 0 };
  o.ax = 0; o.az = 0;
  if (!field || field.strength <= 0 || !(field.radius > 0)) return o;
  const dx = x - field.center.x;
  const dz = z - field.center.z;

  if (field.kind === FIELD_KINDS.SHEET) {
    // Scoop sheet: a finite slab along dir × halfWidth. Bodies in the slab are collected onto
    // the centerline (lateral squeeze) — a ribbon, never a sphere.
    const along = dx * field.dir.x + dz * field.dir.z;
    if (along < 0 || along >= field.radius) return o;
    const latX = dx - field.dir.x * along;
    const latZ = dz - field.dir.z * along;
    const lat = Math.hypot(latX, latZ);
    const halfW = positive(field.halfWidth, 48);
    if (lat > halfW) return o;
    const alongFall = 1 - along / field.radius;
    const latFall = 1 - lat / halfW;
    const sheetFall = Math.pow(clamp(alongFall * latFall, 0, 1), field.falloff);
    if (sheetFall <= 0) return o;
    const a = field.strength * sheetFall;
    if (lat > 1e-4) {
      o.ax = -(latX / lat) * a;
      o.az = -(latZ / lat) * a;
    }
    return o;
  }

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
  if (r < 1e-4) {
    // At the exact center the radial bearing is undefined, but an authored snare's velocity drag is
    // still well-defined. Plain wells/repulsors keep the old zero-force behavior.
    if (field.damping > 0 && vel) {
      const drag = viscosityAccel(field, vel, fall);
      o.ax = drag.x;
      o.az = drag.z;
    }
    return o;
  }
  const inv = 1 / r;
  const ux = dx * inv, uz = dz * inv; // unit vector center → body
  const a = field.strength * fall;
  const sign = field.kind === FIELD_KINDS.WELL ? -1 : 1; // well pulls in, repulsor pushes out
  o.ax = ux * a * sign;
  o.az = uz * a * sign;
  if (field.damping > 0 && vel) {
    const drag = viscosityAccel(field, vel, fall);
    o.ax += drag.x;
    o.az += drag.z;
  }
  return o;
}

// ── Predictor corridor relevance (RELEASE-TRUTH C4) ─────────────────────────────────────────
// A field-aware preview only changes a ballistic contact claim when some field can actually
// apply force along the path the predictor samples. Three kinds of fields cannot:
//   • payload-excluded — the body's own deployer filter / team / type opts it out;
//   • zero-force — strength <= 0 contributes no raw acceleration anywhere (damping lives
//     inside that term), and no hitch lock reaches an unhitched body;
//   • provably disjoint — its volume never touches the ballistic corridor and never touches
//     the volume of a field that does (a chain of overlapping fields can ferry a bent path
//     in, so relevance closes transitively over touching volumes — a field outside every
//     link is provably unreachable while the read stays corridor-shaped).
// "Conservative" here means the WHOLE predicted corridor, not the starting point: a field
// ahead on the lane is relevant even though the payload stands outside it now.

// Conservative bound on a field's reach around its center — the same bound for every kind:
// radial volumes are disks of `radius`; a cone wedge never exceeds its radius; a scoop sheet
// extends `radius` along its axis plus `halfWidth` laterally, so radius+halfWidth covers it.
export function fieldInfluenceRadius(field) {
  if (!field) return 0;
  let reach = positive(field.radius, 0);
  if (field.kind === FIELD_KINDS.SHEET) reach += positive(field.halfWidth, 0);
  return reach;
}

function segmentPointDistance(ax, az, bx, bz, px, pz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-14 ? clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1) : 0;
  const cx = ax + dx * t, cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

/**
 * Can this field apply ANY acceleration to this body at all (before position is even asked)?
 * Same gates production uses inside sampleFieldAcceleration: the coupling pre-filter plus a
 * nonzero force source — authored strength, or a hitch lock that actually reaches this body.
 */
export function fieldCanApplyTo(field, profile) {
  if (!fieldAffectsBody(field, profile)) return false;
  if (field.strength > 0) return true;
  const hitchId = profile && profile.hitchedTo;
  return field.lockStrength > 0
    && field.sourceId != null && hitchId != null
    && String(field.sourceId) === String(hitchId);
}

/**
 * The subset of `fields` that can apply force along the ballistic corridor a→b for `profile`
 * — payload-excluded, zero-force, and provably disjoint fields are dropped. Relevance is a
 * transitive closure: a field touching the corridor is relevant, and a field touching a
 * relevant field's volume is relevant too (the first can push the path into the second).
 * Returns a new array in input order; empty when nothing can bend the path — the caller's
 * correct response to that is a ballistic preview, not a field solve that cannot see the
 * full ballistic horizon.
 *
 * Residual bound, stated honestly: a body that exits a relevant field with bent velocity can
 * still fly to a field this closure did not reach. Chasing that spoke needs the live solve;
 * the frozen-field preview is advisory and the actual release authority never consults it.
 */
export function fieldsRelevantAlongCorridor(fields, a, b, profile) {
  const out = [];
  if (!Array.isArray(fields) || fields.length === 0 || !a || !b) return out;
  const ax = finite(a.x), az = finite(a.z), bx = finite(b.x), bz = finite(b.z);
  const reaches = fields.map(fieldInfluenceRadius);
  const relevant = new Array(fields.length).fill(false);
  // Pass 1: fields whose reach envelope intersects the ballistic corridor itself.
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field || !fieldCanApplyTo(field, profile)) continue;
    const d = segmentPointDistance(ax, az, bx, bz, finite(field.center && field.center.x), finite(field.center && field.center.z));
    if (d <= reaches[i]) relevant[i] = true;
  }
  // Closure: a field whose volume touches a relevant field's volume can be entered through
  // it — the corridor is only provably clear of fields outside every link in the chain.
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < fields.length; i++) {
      if (relevant[i]) continue;
      const field = fields[i];
      if (!field || !fieldCanApplyTo(field, profile)) continue;
      const cx = finite(field.center && field.center.x), cz = finite(field.center && field.center.z);
      for (let j = 0; j < fields.length; j++) {
        if (!relevant[j]) continue;
        const other = fields[j];
        const dx = cx - finite(other.center && other.center.x);
        const dz = cz - finite(other.center && other.center.z);
        if (Math.hypot(dx, dz) <= reaches[i] + reaches[j]) { relevant[i] = true; grew = true; break; }
      }
    }
  }
  for (let i = 0; i < fields.length; i++) if (relevant[i]) out.push(fields[i]);
  return out;
}

const _rawScratch = { ax: 0, az: 0 };
const _fieldOrder = [];

// Id order, stable for equal ids. Already-sorted lists (kernel.list()) keep their
// index sequence, so the float sum stays bit-identical to the previous convention.
function fieldSumOrder(fields) {
  const n = fields.length;
  _fieldOrder.length = n;
  for (let i = 0; i < n; i++) _fieldOrder[i] = i;
  for (let i = 1; i < n; i++) {
    const idx = _fieldOrder[i];
    const id = fields[idx] && fields[idx].id != null ? String(fields[idx].id) : '';
    let j = i - 1;
    while (j >= 0) {
      const other = fields[_fieldOrder[j]];
      const oid = other && other.id != null ? String(other.id) : '';
      if (oid <= id) break;
      _fieldOrder[j + 1] = _fieldOrder[j];
      j--;
    }
    _fieldOrder[j + 1] = idx;
  }
  return _fieldOrder;
}

/**
 * PURE predictor seam + per-tick force source. Sum the coupling-scaled acceleration of every field
 * at the same pre-step `pos`/`vel`, then clamp the total magnitude to FIELD_MAX_ACCEL.
 * Enumeration order does not matter: summation is id-sorted. The result is an acceleration,
 * never a rewritten body velocity.
 *
 * @param {{x:number,z:number}} pos
 * @param {{x:number,z:number}|null} vel
 * @param {Array} fields          field records (sorted here; kernel.list() is already id-sorted)
 * @param {number} simTime        caller sim clock (accepted for parity; math is time-independent)
 * @param {{mass:number,type:string,team:*,fieldResponseMult:number,id:*}} [bodyProfile]
 * @param {{ax:number,az:number}} [out]
 * @returns {{ax:number,az:number}}
 */
export function sampleFieldAcceleration(pos, vel, fields, simTime, bodyProfile, out) {
  const o = out || { ax: 0, az: 0 };
  o.ax = 0; o.az = 0;
  if (!pos || !Array.isArray(fields) || fields.length === 0) return o;
  const profile = bodyProfile || DEFAULT_PROFILE;
  const couple = couplingScale(profile);
  const order = fieldSumOrder(fields);
  let sx = 0, sz = 0;
  if (couple > 0) {
    for (let n = 0; n < order.length; n++) {
      const field = fields[order[n]];
      if (!fieldAffectsBody(field, profile)) continue;
      fieldRawAcceleration(field, pos.x, pos.z, _rawScratch, vel);
      sx += _rawScratch.ax;
      sz += _rawScratch.az;
    }
    sx *= couple;
    sz *= couple;
  }
  // PQ-147.02 — hitch lock is a frame lock. It does not shrug with boost or mass.
  if (profile.hitchedTo != null) {
    const hitchId = String(profile.hitchedTo);
    for (let n = 0; n < order.length; n++) {
      const field = fields[order[n]];
      if (!(field.lockStrength > 0)) continue;
      if (field.sourceId == null || String(field.sourceId) !== hitchId) continue;
      hitchLockAcceleration(field, pos.x, pos.z, _lockScratch);
      sx += _lockScratch.ax;
      sz += _lockScratch.az;
    }
  }
  const mag = Math.hypot(sx, sz);
  if (mag > FIELD_MAX_ACCEL) {
    const k = FIELD_MAX_ACCEL / mag;
    sx *= k; sz *= k;
  }
  o.ax = sx; o.az = sz;
  return o;
}

const DEFAULT_PROFILE = Object.freeze({ mass: 1, type: 'ship', team: null, fieldResponseMult: 1, id: null });

/**
 * PQ-147.03 — a primed light in a well is ammunition. The kernel still accepts a velocity
 * sample; the owner withholds it so the inbound fall is a slam, not a 45 WU/s parked clump.
 * Unmarked craft keep the 137.09 convergence term.
 */
export function wellUsesVelocityTerm(bodyProfile) {
  return !(bodyProfile && bodyProfile.primed);
}

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

const _escP = { x: 0, z: 0 };
const _escV = { x: 0, z: 0 };
const _escA = { ax: 0, az: 0 };

/**
 * PQ-147.02 — integrate a body under fields plus an optional extraAccel (boost / strafe)
 * until it is outside every volume or the clock runs out. Same Euler as the sim.
 */
export function integrateFieldEscape(pos, vel, fields, bodyProfile, opts = {}) {
  const dt = positive(opts.dt, 1 / 60);
  const maxTimeS = positive(opts.maxTimeS, 8);
  const extraX = finite(opts.extraAccel && opts.extraAccel.x);
  const extraZ = finite(opts.extraAccel && opts.extraAccel.z);
  const steps = Math.max(1, Math.min(1200, Math.ceil(maxTimeS / dt)));
  const list = Array.isArray(fields) ? fields : [];
  const profile = bodyProfile || DEFAULT_PROFILE;
  let px = finite(pos && pos.x);
  let pz = finite(pos && pos.z);
  let vx = finite(vel && vel.x);
  let vz = finite(vel && vel.z);
  for (let i = 1; i <= steps; i++) {
    _escP.x = px;
    _escP.z = pz;
    _escV.x = vx;
    _escV.z = vz;
    sampleFieldAcceleration(_escP, _escV, list, 0, profile, _escA);
    vx += (_escA.ax + extraX) * dt;
    vz += (_escA.az + extraZ) * dt;
    px += vx * dt;
    pz += vz * dt;
    let inside = false;
    for (let j = 0; j < list.length; j++) {
      if (fieldContainsPoint(list[j], px, pz)) {
        inside = true;
        break;
      }
    }
    if (!inside) {
      return { free: true, timeS: i * dt, ticks: i, pos: { x: px, z: pz }, vel: { x: vx, z: vz } };
    }
  }
  return { free: false, timeS: steps * dt, ticks: steps, pos: { x: px, z: pz }, vel: { x: vx, z: vz } };
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
      if (patch.damping != null) record.damping = Math.max(0, finite(patch.damping, record.damping));
      if (patch.frame) {
        if (!record.frame) record.frame = { x: 0, z: 0 };
        record.frame.x = finite(patch.frame.x, record.frame.x);
        record.frame.z = finite(patch.frame.z, record.frame.z);
      }
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
