// VFX NEXT — the causality contract.
//
// Every family in this library takes ONE input record. That is deliberate: "effects follow game
// state" is the requirement most easily faked, and the cheapest way to stop faking it is to make
// the physical truth the only thing an effect is allowed to read. A family that wants a direction
// must take it from the record; there is no ambient "make it look cool" channel.
//
// The signed/unsigned split is not pedantry — it mirrors the live receipt truth documented in
// design/PHYSICS_AS_SPECTACLE_ART_BIBLE.md §6/§7:
//
//   dir  = SIGNED force direction. Available from lethal `entity:killed.presentation`, weapon
//          fire, thrust, tether release, and field centres. Response may pick a side.
//   axis = UNORIENTED contact axis. This is all `combat:collisionConsequence` supplies. Response
//          must be opposed/symmetric about the axis. Picking a side here invents physics.
//
// A family reads `hasSignedDirection(force)` and branches. That single call is what keeps a
// collision from silently becoming a directional blast.
//
// Allocation discipline: ForceRecord instances are POOLED and reused. Never retain one past the
// spawn call that received it — copy the scalars you need. `scratchForce()` hands out a rotating
// ring of records so a caller can build one per event without allocating in the hot path.

const RING_SIZE = 16;

/** xorshift32. Deterministic, allocation-free, ~2ns. Seeded variation is a requirement, not a nicety:
 *  two impacts with the same receipt must look the same, or captures cannot be compared. */
export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Stateless hash — same seed+index always yields the same float in [0,1). Used where a loop needs
 *  variation without carrying an rng closure (shader-parity friendly). */
export function hash01(seed, index) {
  let h = (seed ^ (index * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createForceRecord() {
  return {
    // --- position and size ---
    px: 0, py: 0, pz: 0,        // world contact point
    radius: 1,                  // characteristic size of the event source (wu)

    // --- direction (see header) ---
    dx: 0, dy: 0, dz: 0,        // signed force direction, unit
    hasDir: false,
    ax: 0, ay: 1, az: 0,        // unoriented contact axis, unit
    hasAxis: false,

    // --- momentum ---
    vx: 0, vy: 0, vz: 0,        // inherited world velocity of the affected body (wu/s)
    impulse: 0,                 // exchanged momentum magnitude, sim units
    severity: 0.5,              // 0..1 normalized "how bad", drives stage count and lifetime

    // --- identity ---
    seed: 1,                    // deterministic variation
    coreColor: 0xfff3d0,        // white-hot core
    sheathColor: 0xff7a2a,      // saturated sheath
    debrisColor: 0x9aa3ad,      // solid-material fragments (NOT emissive)

    // --- surface (contact events only) ---
    nx: 0, ny: 1, nz: 0,        // surface normal where a surface exists
    hasSurface: false,
  };
}

const _ring = [];
let _ringAt = 0;
for (let i = 0; i < RING_SIZE; i++) _ring.push(createForceRecord());

/** Rotating scratch record. Valid only until RING_SIZE further calls. */
export function scratchForce() {
  const f = _ring[_ringAt];
  _ringAt = (_ringAt + 1) % RING_SIZE;
  return resetForce(f);
}

export function resetForce(f) {
  f.px = 0; f.py = 0; f.pz = 0; f.radius = 1;
  f.dx = 0; f.dy = 0; f.dz = 0; f.hasDir = false;
  f.ax = 0; f.ay = 1; f.az = 0; f.hasAxis = false;
  f.vx = 0; f.vy = 0; f.vz = 0;
  f.impulse = 0; f.severity = 0.5; f.seed = 1;
  f.coreColor = 0xfff3d0; f.sheathColor = 0xff7a2a; f.debrisColor = 0x9aa3ad;
  f.nx = 0; f.ny = 1; f.nz = 0; f.hasSurface = false;
  return f;
}

export function setPos(f, x, y, z) { f.px = x; f.py = y; f.pz = z; return f; }

/** Signed direction. Normalizes in place; a zero vector clears `hasDir` rather than producing NaN. */
export function setDir(f, x, y, z) {
  const m = Math.hypot(x, y, z);
  if (m < 1e-6) { f.hasDir = false; return f; }
  f.dx = x / m; f.dy = y / m; f.dz = z / m; f.hasDir = true;
  // A signed direction also defines the axis; the reverse is never true.
  f.ax = f.dx; f.ay = f.dy; f.az = f.dz; f.hasAxis = true;
  return f;
}

/** Unoriented axis. Deliberately does NOT set `hasDir` — that is the whole point of the split. */
export function setAxis(f, x, y, z) {
  const m = Math.hypot(x, y, z);
  if (m < 1e-6) { f.hasAxis = false; return f; }
  f.ax = x / m; f.ay = y / m; f.az = z / m; f.hasAxis = true;
  return f;
}

export function setVelocity(f, x, y, z) { f.vx = x; f.vy = y; f.vz = z; return f; }

export function setSurface(f, x, y, z) {
  const m = Math.hypot(x, y, z);
  if (m < 1e-6) { f.hasSurface = false; return f; }
  f.nx = x / m; f.ny = y / m; f.nz = z / m; f.hasSurface = true;
  return f;
}

export function hasSignedDirection(f) { return !!f.hasDir; }

/** Speed of the inherited velocity — families use it to decide streak length and trail inheritance. */
export function inheritedSpeed(f) { return Math.hypot(f.vx, f.vy, f.vz); }

/** Writes an orthonormal basis around the record's axis into `out` (9 floats: right, up, axis).
 *  Allocation-free; `out` is a caller-owned Float32Array(9). The axis is the third row so a family
 *  can build an oriented disc without constructing a Matrix4. */
export function axisBasis(f, out) {
  const ax = f.ax, ay = f.ay, az = f.az;
  // Pick the world axis least aligned with `axis` so the cross product stays well-conditioned.
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(ay) > 0.9) { ux = 1; uy = 0; uz = 0; }
  let rx = uy * az - uz * ay;
  let ry = uz * ax - ux * az;
  let rz = ux * ay - uy * ax;
  const rm = Math.hypot(rx, ry, rz) || 1;
  rx /= rm; ry /= rm; rz /= rm;
  const vx2 = ay * rz - az * ry;
  const vy2 = az * rx - ax * rz;
  const vz2 = ax * ry - ay * rx;
  out[0] = rx; out[1] = ry; out[2] = rz;
  out[3] = vx2; out[4] = vy2; out[5] = vz2;
  out[6] = ax; out[7] = ay; out[8] = az;
  return out;
}

/** Emission sign for a family responding to this record.
 *  Signed direction  -> +1 (bias along dir).
 *  Unoriented axis   -> alternates -1/+1 by index, producing the opposed/symmetric response the
 *                       collision receipt actually licenses. */
export function emissionSign(f, index) {
  if (f.hasDir) return 1;
  return (index & 1) ? -1 : 1;
}

/** Cone sample around (dx,dy,dz) with half-angle `spread` radians, written into `out` (3 floats).
 *  This is the single most important shape helper in the library: uniform round bursts are the
 *  named failure mode, and every family that emits matter routes through here. */
export function coneSample(out, dx, dy, dz, spread, seed, index) {
  const u = hash01(seed, index * 2 + 1);
  const v = hash01(seed, index * 2 + 2);
  // cos-weighted within the cap keeps density highest on the axis — a burst that reads as "kicked
  // this way", not "sprayed everywhere".
  const cosT = 1 - u * (1 - Math.cos(spread));
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
  const phi = v * Math.PI * 2;
  // Basis around (dx,dy,dz)
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dy) > 0.9) { ux = 1; uy = 0; uz = 0; }
  let rx = uy * dz - uz * dy, ry = uz * dx - ux * dz, rz = ux * dy - uy * dx;
  const rm = Math.hypot(rx, ry, rz) || 1;
  rx /= rm; ry /= rm; rz /= rm;
  const bx = dy * rz - dz * ry, by = dz * rx - dx * rz, bz = dx * ry - dy * rx;
  const c = Math.cos(phi) * sinT, s = Math.sin(phi) * sinT;
  out[0] = dx * cosT + rx * c + bx * s;
  out[1] = dy * cosT + ry * c + by * s;
  out[2] = dz * cosT + rz * c + bz * s;
  return out;
}
