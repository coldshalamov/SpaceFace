// Impact event record — the ONE description of a contact that the impacts lane publishes and the
// gas and debris lanes consume.
//
// WHY THIS EXISTS. Before this record, every supporting layer subscribed to the same simulation
// receipt and each one decided independently how big the event was. Three subscribers meant three
// bursts stacked on one contact, three different guesses at the contact point, and three different
// ideas of which way the surface faced. The impacts lane now owns the event: it reads the receipt
// once, fills one record, and hands the SAME record to the gas and debris layers as supporting
// passes of a single composed recipe.
//
// OWNERSHIP. The impacts lane owns the timing and the primary structure. The gas lane owns the
// material and its evolution. The debris lane owns the solids. None of them may re-subscribe to the
// simulation event that produced the record.
//
// This module is pure data: no THREE, no scene, no simulation reads, no allocation on the hot path,
// and no randomness. `makeImpactRecord` fills a caller-owned slot and returns it.

// The material ids and the event-class list are owned by the presentation grammar, which is the
// layer that decides what each one LOOKS like. They are re-exported here so a render-side caller
// that already has the record module does not have to reach across for a constant.
//
// The eight event classes are STRUCTURALLY different events, not one explosion at eight sizes:
//   graze       glancing contact, no penetration — a skid along the surface
//   pinprick    small high-velocity strike on a hard surface — pinpoint beat, narrow spall
//   cut         sustained working of a face (mining) — no ignition, progressive fracture
//   slam        heavy low-relative-speed mass contact — compression FIRST, then shear, then throw
//   breach      a hole is opened in a pressurized hull — hot internal structure is exposed
//   fracture    brittle mineral failure — sequential cleavage planes, cold, dust lags
//   detonation  a carried charge releases — staged internal release, then pressure
//   breakup     a large body loses structural continuity — plates separate, frame is exposed
import {
  IMPACT_MATERIALS,
  IMPACT_EVENT_CLASSES,
  normalizeImpactMaterial,
} from '../../presentation/causalVfxGrammar.js';

export { IMPACT_MATERIALS, IMPACT_EVENT_CLASSES, normalizeImpactMaterial };

const EVENT_CLASS_SET = new Set(IMPACT_EVENT_CLASSES);

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return number < 0 ? 0 : (number > 1 ? 1 : number);
}

/** An empty, fully-shaped record slot. Allocate these once; never in a frame. */
export function createImpactRecord() {
  return {
    // --- contact point, world space (WU) ---------------------------------------------------
    /** @type {number} contact point X in world units. The effect is placed HERE, not at the
     *  centre of either body. */
    x: 0,
    /** @type {number} contact point Y (height above the XZ play plane). */
    y: 0,
    /** @type {number} contact point Z in world units. */
    z: 0,

    // --- contact normal --------------------------------------------------------------------
    /** @type {number} normal X. Unit length when `hasNormal` is true. */
    nx: 1,
    /** @type {number} normal Y. */
    ny: 0,
    /** @type {number} normal Z. */
    nz: 0,
    /** @type {boolean} false when the receipt supplied no usable normal at all. Consumers then
     *  fall back to a layout that needs no axis (a centred, isotropic beat), never to a guess. */
    hasNormal: false,
    /**
     * @type {boolean} THE E2 FLAG.
     *
     * true  — the normal is a SIGNED outward direction: it genuinely points from the struck
     *         surface toward the side the energy came from. A reflected cone, a directed spall
     *         fan and a one-sided compression lip are all legal.
     *
     * false — the normal is an UNSIGNED AXIS only. Its sign is an artifact of which collider the
     *         physics solver happened to list first, and swapping the two bodies would flip it.
     *         Consumers MUST NOT fabricate a signed force direction from it. The legal reading is
     *         a mirrored, two-sided layout that is invariant under (nx,ny,nz) -> (-nx,-ny,-nz):
     *         opposed shear lips, tangent scars both ways, symmetric ejecta.
     *
     * Use `impactOutwardNormal(rec, out)`, which returns null for an unsigned axis, rather than
     * reading `nx/ny/nz` as a direction.
     */
    axisSigned: false,

    // --- event magnitude -------------------------------------------------------------------
    /** @type {number} 0..1 severity. 0 is a scratch, 1 is the largest supported destruction.
     *  Severity picks WHICH event class runs; it is not a uniform size multiplier. */
    severity: 0,
    /** @type {string} one of IMPACT_MATERIALS — the struck surface, not the striking object. */
    materialId: IMPACT_MATERIALS.unknown,
    /** @type {number} characteristic radius of the event in world units: roughly the radius of
     *  the affected surface, NOT the radius of the struck body. */
    radiusWU: 1,
    /** @type {number} simulation clock at contact (`state.simTime`). Never wall time — a paused
     *  sim must not advance an effect. */
    simTime: 0,

    // --- optional relative motion ----------------------------------------------------------
    // Velocity of the STRIKING body relative to the STRUCK body, world units per second. Zeros
    // when the receipt did not supply it; consumers must treat (0,0,0) as "unknown", not "at rest".
    /** @type {number} */ vx: 0,
    /** @type {number} */ vy: 0,
    /** @type {number} */ vz: 0,
    /** @type {boolean} true when vx/vy/vz came from the receipt rather than defaulting. */
    hasVelocity: false,

    // --- identity --------------------------------------------------------------------------
    /** @type {number} integer salt for deterministic authored irregularity. Same event, same
     *  silhouette, every replay. Never consumes simulation RNG. */
    serial: 0,
    /** @type {*} the struck entity id, so a supporting layer can anchor to a moving body. */
    targetId: null,
    /** @type {string} resolved event class — see IMPACT_EVENT_CLASSES. Filled by
     *  `makeImpactRecord`; a caller may override it by passing `eventClass`. */
    eventClass: 'pinprick',
  };
}

/**
 * Fill a pooled record slot. Pure, allocation-free, deterministic.
 *
 * @param {object} out a slot from `createImpactRecord()` / `createImpactRecordPool()`
 * @returns {object} the same `out`, filled
 */
export function makeImpactRecord(out, {
  x, y, z,
  nx, ny, nz,
  axisSigned,
  severity,
  materialId,
  radiusWU,
  simTime,
  vx, vy, vz,
  serial,
  targetId,
  eventClass,
} = {}) {
  const rec = out || createImpactRecord();
  rec.x = finite(x, 0);
  rec.y = finite(y, 0);
  rec.z = finite(z, 0);

  let ax = finite(nx, 0);
  let ay = finite(ny, 0);
  let az = finite(nz, 0);
  const length = Math.sqrt(ax * ax + ay * ay + az * az);
  if (length > 1e-8) {
    ax /= length;
    ay /= length;
    az /= length;
    rec.hasNormal = true;
  } else {
    ax = 1; ay = 0; az = 0;
    rec.hasNormal = false;
  }
  rec.nx = ax;
  rec.ny = ay;
  rec.nz = az;
  // An unsigned axis is canonicalized so that swapping the colliders cannot change the drawn
  // silhouette at all. A signed normal keeps its sign — that sign is real information.
  rec.axisSigned = axisSigned === true && rec.hasNormal;
  if (!rec.axisSigned && rec.hasNormal) {
    if (rec.nx < -1e-8
      || (Math.abs(rec.nx) <= 1e-8 && rec.nz < -1e-8)
      || (Math.abs(rec.nx) <= 1e-8 && Math.abs(rec.nz) <= 1e-8 && rec.ny < 0)) {
      rec.nx = -rec.nx;
      rec.ny = -rec.ny;
      rec.nz = -rec.nz;
    }
  }

  rec.severity = clamp01(severity);
  rec.materialId = normalizeImpactMaterial(materialId);
  rec.radiusWU = Math.max(0.05, finite(radiusWU, 1));
  rec.simTime = finite(simTime, 0);

  const rvx = finite(vx, 0);
  const rvy = finite(vy, 0);
  const rvz = finite(vz, 0);
  rec.hasVelocity = (rvx !== 0 || rvy !== 0 || rvz !== 0);
  rec.vx = rvx;
  rec.vy = rvy;
  rec.vz = rvz;

  rec.serial = Number.isFinite(serial) ? (serial | 0) : 0;
  rec.targetId = targetId === undefined ? null : targetId;
  rec.eventClass = EVENT_CLASS_SET.has(eventClass) ? eventClass : classifyImpactEvent(rec);
  return rec;
}

/**
 * Allocation-free positional writer for hot paths that must not build an options object.
 * Field order matches `createImpactRecord()`; see that function for what each one means.
 */
export function writeImpactRecord(
  out,
  x, y, z,
  nx, ny, nz,
  axisSigned,
  severity,
  materialId,
  radiusWU,
  simTime,
  vx, vy, vz,
  serial,
  targetId,
  eventClass,
) {
  const rec = out || createImpactRecord();
  _scratchInput.x = x; _scratchInput.y = y; _scratchInput.z = z;
  _scratchInput.nx = nx; _scratchInput.ny = ny; _scratchInput.nz = nz;
  _scratchInput.axisSigned = axisSigned;
  _scratchInput.severity = severity;
  _scratchInput.materialId = materialId;
  _scratchInput.radiusWU = radiusWU;
  _scratchInput.simTime = simTime;
  _scratchInput.vx = vx; _scratchInput.vy = vy; _scratchInput.vz = vz;
  _scratchInput.serial = serial;
  _scratchInput.targetId = targetId;
  _scratchInput.eventClass = eventClass;
  return makeImpactRecord(rec, _scratchInput);
}

// One module-resident input shape so the positional writer allocates nothing per call.
const _scratchInput = {
  x: 0, y: 0, z: 0,
  nx: 0, ny: 0, nz: 0,
  axisSigned: false,
  severity: 0,
  materialId: IMPACT_MATERIALS.unknown,
  radiusWU: 1,
  simTime: 0,
  vx: 0, vy: 0, vz: 0,
  serial: 0,
  targetId: null,
  eventClass: undefined,
};

/**
 * A fixed ring of record slots. Composition is synchronous — the supporting layers read the record
 * inside the same call — so a small ring is enough and nothing is allocated per event.
 */
export function createImpactRecordPool(capacity = 8) {
  const size = Math.max(1, Math.floor(capacity) || 1);
  const slots = new Array(size);
  for (let i = 0; i < size; i++) slots[i] = createImpactRecord();
  let cursor = 0;
  return {
    capacity: size,
    /** @returns {object} the next slot. Valid until `capacity` further acquisitions. */
    acquire() {
      const slot = slots[cursor];
      cursor = (cursor + 1) % size;
      return slot;
    },
    slots,
  };
}

/**
 * The ONLY legal way to read a signed outward direction from a record.
 * Returns `out` filled with the outward unit normal, or **null** when the record carries an
 * unsigned collision axis. A null result means "there is no outward side" — draw a mirrored,
 * two-sided event, never a one-sided force.
 */
export function impactOutwardNormal(rec, out) {
  if (!rec || !rec.hasNormal || rec.axisSigned !== true) return null;
  const target = out || { x: 0, y: 0, z: 0 };
  target.x = rec.nx;
  target.y = rec.ny;
  target.z = rec.nz;
  return target;
}

/** Relative closing speed in WU/s, or 0 when the receipt supplied no relative motion. */
export function impactApproachSpeed(rec) {
  if (!rec || !rec.hasVelocity) return 0;
  return Math.sqrt(rec.vx * rec.vx + rec.vy * rec.vy + rec.vz * rec.vz);
}

/**
 * How much of the relative motion runs ALONG the surface rather than into it, 0..1.
 * 1 is a pure skid, 0 is a square-on strike. Returns 0 when either input is unknown, because an
 * unknown is not a glance.
 */
export function impactTangentFraction(rec) {
  const speed = impactApproachSpeed(rec);
  if (!(speed > 1e-6) || !rec.hasNormal) return 0;
  const along = Math.abs((rec.vx * rec.nx + rec.vy * rec.ny + rec.vz * rec.nz) / speed);
  return Math.max(0, Math.min(1, 1 - along));
}

const BRITTLE = new Set([IMPACT_MATERIALS.rock, IMPACT_MATERIALS.ice, IMPACT_MATERIALS.ceramic]);

/**
 * Pick the event class from the physics of the contact, never from a size number alone.
 *
 * The ladder is deliberately structural:
 *   - a brittle surface never "explodes" — it cuts or fractures;
 *   - an unsigned axis at low relative speed is a SLAM (two bodies pressing), which compresses
 *     before it throws anything;
 *   - a signed normal at small severity is a PINPRICK (something arrived fast and small);
 *   - severity only chooses between breach / detonation / breakup once the kind is settled.
 */
export function classifyImpactEvent(rec) {
  if (!rec) return 'pinprick';
  const severity = clamp01(rec.severity);
  const tangent = impactTangentFraction(rec);
  const speed = impactApproachSpeed(rec);

  if (BRITTLE.has(rec.materialId)) {
    // A worked face: slow, sustained, shallow. A fracture: one decisive brittle failure.
    if (severity < 0.22 && (speed === 0 || speed < 24)) return 'cut';
    if (severity >= 0.82) return 'breakup';
    return 'fracture';
  }

  if (severity < 0.1 && tangent > 0.72) return 'graze';

  if (severity >= 0.8) return 'breakup';

  if (!rec.axisSigned) {
    // No outward side: two bodies met. That is a compression event whatever its size, and it stays
    // one all the way up — catastrophe is already caught by the severity >= 0.8 rule above, and a
    // caller that KNOWS the target came apart passes `eventClass: 'breakup'` explicitly.
    //
    // This used to promote anything at severity >= 0.5 to a breakup. The live heavy-collision route
    // maps a 30 WU/s closing speed to 0.52, so almost every survivable collision in the game read
    // as a ship disintegrating, and the slam recipe — compression along the surface, then shear,
    // then the heavy matter finally leaving — had no route that actually reached it.
    return 'slam';
  }

  if (severity >= 0.58) return 'detonation';
  if (severity >= 0.28) return 'breach';
  if (tangent > 0.66) return 'graze';
  return 'pinprick';
}

export default makeImpactRecord;
