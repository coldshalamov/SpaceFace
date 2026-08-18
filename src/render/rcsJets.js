// SpaceFace — RCS jet resolver. The CONSUMER half of the signed actuator seam.
//
// Slice 0 (S0-6) made `computeFlightTelemetry` publish an `actuators` block carrying signed
// demand plus per-nozzle non-negative magnitudes. Nothing consumed it: the renderer still
// inferred jets from raw input keys, which is why turning fired both bow retros instead of the
// opposite-side jet, and why assist counter-thrust and autopilot manoeuvres fired nothing at all.
// This module closes that seam. It is pure (no THREE, no state, no allocation beyond its result)
// so the mapping can be pinned by a node test against the real propulsion kernel.
//
// ---------------------------------------------------------------------------------------------
// WHY THIS IS A RESOLVER AND NOT A LOOKUP TABLE
// ---------------------------------------------------------------------------------------------
// A channel→nozzle table gets pure inputs right and blends wrong: hold a starboard strafe while
// yawing to starboard and a table lights four jets, two of which are fighting each other. A real
// RCS quad resolves blended demand by summing the force each end of the hull is being asked to
// receive and firing whatever satisfies the sum. Doing the same here is barely more code and is
// correct by construction:
//
//   1. Accumulate the demanded push at two LOCATIONS — bow and stern — in ship-local axes.
//        · translation  → the same lateral push at both ends (a force through the CoM)
//        · yaw          → equal and OPPOSITE lateral pushes at the two ends (a couple)
//        · reverse      → an aft push at the bow (that is where retros live)
//   2. Per location, turn the accumulated push into nozzles:
//        · a LATERAL push lights the single nozzle on the side OPPOSITE the push (Newton)
//        · a purely LONGITUDINAL push lights the symmetric pair, no net torque
//
// Yaw-to-starboard therefore lights bow-PORT and stern-STARBOARD — a diagonal couple — and can
// never light both bow jets, which is precisely the reported defect. Strafe-plus-yaw resolves to
// one hard-working bow jet and a silent stern, which is what actually happens on a real quad.
//
// ---------------------------------------------------------------------------------------------
// SIGN CONVENTION — the one load-bearing fact. Taken verbatim from the producer
// (src/core/flight/flightTelemetry.js, `computeActuatorDemand`), NOT re-derived:
// ---------------------------------------------------------------------------------------------
//   forward > 0 → ship pushed along the nose      · forward < 0 → ship pushed aft
//   lateral > 0 → ship pushed toward `rightUnit`, i.e. STARBOARD · lateral < 0 → PORT
//   yaw     > 0 → nose swings toward STARBOARD (the `yawCw` channel)
//
// Channel names describe THE DIRECTION THE SHIP IS PUSHED, never the hull side the nozzle sits
// on. Every firing this module emits therefore satisfies `exhaust === -push`, which is the
// invariant the test asserts generally rather than case by case.
//
// `main` (forward > 0) is deliberately NOT an RCS jet here: the main drive already has its own
// authored nozzle and the shipped "liquid blue fire" plume volume. This module reports the
// normalized main demand so the plume can be driven by physics instead of by an input key, but
// it never emits a jet for it — RCS is a smaller, colder vocabulary than the main plume.

import { COAST_HELM_YAW_MULT } from '../core/flight/propulsionKernel.js';

/** Ship-local axes for a heading. `f` is the nose, `r` is starboard. Matches localAxes(). */
export function shipAxes(rot) {
  const c = Math.cos(finite(rot));
  const s = Math.sin(finite(rot));
  return { fx: c, fz: s, rx: -s, rz: c };
}

// Station geometry, in fractions of hull radius. Bow retros sit further out than the stern quad
// because that is where they read from a chase camera; the stern pair stays inboard of the main
// nozzle so it never reads as a second engine.
export const RCS_GEOMETRY = Object.freeze({
  bowLong: 0.46,
  sternLong: 0.42,
  side: 0.22,
});

// Below this fraction of available authority a jet is not worth drawing: it would be a one-pixel
// flicker every frame the assist trims a drift. Above it, intensity is continuous.
export const RCS_DEADBAND = 0.06;

const CHANNELS_NONE = Object.freeze([]);
const CHANNELS_TRANSLATION = Object.freeze(['translation']);
const CHANNELS_YAW_CW = Object.freeze(['yawCw']);
const CHANNELS_YAW_CCW = Object.freeze(['yawCcw']);
const CHANNELS_TRANSLATION_YAW_CW = Object.freeze(['translation', 'yawCw']);
const CHANNELS_TRANSLATION_YAW_CCW = Object.freeze(['translation', 'yawCcw']);
const CHANNELS_REVERSE = Object.freeze(['reverse']);

/**
 * Per-family denominators that turn raw accelerations into 0..1 authority fractions.
 *
 * The family branching mirrors `estimateBrakingSolution` (flightTelemetry.js:83-102) because the
 * catalogue genuinely stores different fields per family: reaction/torch carry
 * main/reverse/strafeAccel, pulse-plate carries rcs*Accel, gravimetric carries a single maxAccel,
 * and the sail carries none of them. Falling back to a shared default rather than to zero matters:
 * a zero denominator would make the sail's jets either invisible or permanently saturated.
 */
export function resolveActuatorScale(profile) {
  const p = profile || {};
  const family = String(p.family || 'reaction');
  let main;
  let reverse;
  let strafe;
  if (family === 'gravimetric') {
    const cap = positive(p.maxAccel, positive(p.maxBrakeAccel, 60));
    main = cap; reverse = cap; strafe = cap;
  } else if (family === 'pulse_plate') {
    main = positive(p.rcsForwardAccel, 10);
    reverse = positive(p.rcsReverseAccel, 8);
    strafe = positive(p.rcsStrafeAccel, 6);
  } else {
    main = positive(p.mainAccel, 40);
    reverse = positive(p.reverseAccel, main * 0.55);
    strafe = positive(p.strafeAccel, main * 0.45);
  }
  return { main, reverse, strafe, yaw: yawAuthority(p) };
}

/**
 * Peak yaw authority the kernel can actually command, which is NOT `yawAccel`.
 *
 * Measured against the shipped kernel rather than assumed: the yaw controller is bang-bang, so a
 * turn command saturates its own axis at any stick deflection. Normalising by `yawAccel` alone
 * therefore pinned every yaw jet at intensity 1 and threw away the one distinction that is real —
 * ARRESTING a spin costs more torque than entering one (`yawBrake`, and both are scaled by the
 * coast-helm bonus). Normalising by the true ceiling makes swinging into a turn read at roughly
 * 0.6 and snapping out of it read at 1.0, which is honest continuous data rather than a blink.
 * `drive_reaction_m`: max(8.8, 14) * 1.2 = 16.8, exactly the peak the kernel emits.
 */
function yawAuthority(p) {
  const accel = positive(p.yawAccel, 8);
  const brake = positive(p.yawBrake, accel * 1.4);
  return Math.max(accel, brake) * COAST_HELM_YAW_MULT;
}

/**
 * Resolve the actuator block into concrete jet firings in WORLD space.
 *
 * @param {object} actuators  the `actuators` block from computeFlightTelemetry — consumed as-is
 * @param {object} pose       { x, z, rot, radius } of the hull
 * @param {object} scale      from resolveActuatorScale(profile)
 * @returns {Array<Firing>}   at most 4 entries; a supplied `out` reuses its private firing records
 *
 * Firing = {
 *   station: 'bow'|'stern', side: -1|1,     // -1 = port hull, +1 = starboard hull
 *   role,                                   // 'reverse-left'|'reverse-right'|'rcs-port'|'rcs-starboard'
 *   x, z,                                   // world position of the nozzle
 *   pushX, pushZ,                           // world unit vector the SHIP is pushed
 *   dirX, dirZ,                             // world unit vector the EXHAUST leaves along (= -push)
 *   intensity,                              // 0..1, continuous
 *   channels,                               // which demands contributed, for debugging/capture
 * }
 */
export function resolveRcsFirings(actuators, pose, scale, out = []) {
  let records = out.__rcsRecords;
  if (!records) {
    records = [];
    Object.defineProperty(out, '__rcsRecords', { value: records, configurable: true });
  }
  if (!actuators || !pose) {
    out.length = 0;
    return out;
  }

  // Keep the public shipAxes helper convenient, but do not allocate its object on this render path.
  const rot = finite(pose.rot);
  const fx = Math.cos(rot);
  const fz = Math.sin(rot);
  const rx = -fz;
  const rz = fx;
  const radius = positive(pose.radius, 6);
  const px = finite(pose.x);
  const pz = finite(pose.z);

  // Dimensionless authority fractions. Normalising BEFORE combining is what lets a torque
  // (rad/s^2) and a translation (WU/s^2) be summed at a hull station at all.
  const lat = clamp(finite(actuators.lateral) / scale.strafe, -1, 1);
  const yaw = clamp(finite(actuators.yaw) / scale.yaw, -1, 1);
  const rev = clamp(Math.max(0, finite(actuators.reverse)) / scale.reverse, 0, 1);

  // Translation pushes both ends the same way; yaw pushes them opposite ways. yaw > 0 swings the
  // nose to starboard, so the BOW is pushed +starboard and the STERN is pushed -starboard.
  const bowLat = clamp(lat + yaw, -1, 1);
  const sternLat = clamp(lat - yaw, -1, 1);

  let count = 0;
  count = emitLateral(out, records, count, 'bow', bowLat, RCS_GEOMETRY.bowLong,
    fx, fz, rx, rz, px, pz, radius, lat, yaw);
  count = emitLateral(out, records, count, 'stern', sternLat, -RCS_GEOMETRY.sternLong,
    fx, fz, rx, rz, px, pz, radius, lat, yaw);

  // Aft push at the bow: the retro pair, symmetric so it produces no yaw.
  // Splay the exhaust outward (~20 degrees) so the jets visibly clear the nose and flanks.
  if (rev > RCS_DEADBAND) {
    const splay = 0.349;
    const cosSplay = Math.cos(splay);
    const sinSplay = Math.sin(splay);
    for (let side = -1; side <= 1; side += 2) {
      const ex = fx * cosSplay + rx * (side * sinSplay);
      const ez = fz * cosSplay + rz * (side * sinSplay);
      writeFiring(out, records, count++, 'bow', side, side < 0 ? 'reverse-left' : 'reverse-right',
        RCS_GEOMETRY.bowLong,
        -ex, -ez, rev, CHANNELS_REVERSE,
        fx, fz, rx, rz, px, pz, radius);
    }
  }
  out.length = count;
  return out;
}

function emitLateral(out, records, index, station, latDemand, longFrac,
  fx, fz, rx, rz, px, pz, radius, lat, yaw) {
  const mag = Math.abs(latDemand);
  if (mag <= RCS_DEADBAND) return index;
  // The push is toward starboard when latDemand > 0, so the nozzle lives on the PORT hull and
  // exhausts to port. This single line is the whole bug fix; getting it backwards merely moves
  // the defect, which is why the test asserts `exhaust === -push` rather than trusting it.
  const pushSign = latDemand > 0 ? 1 : -1;
  const side = -pushSign;
  const hasTranslation = Math.abs(lat) > RCS_DEADBAND;
  const hasYaw = Math.abs(yaw) > RCS_DEADBAND;
  let channels = CHANNELS_NONE;
  if (hasTranslation && hasYaw) {
    channels = yaw > 0 ? CHANNELS_TRANSLATION_YAW_CW : CHANNELS_TRANSLATION_YAW_CCW;
  } else if (hasTranslation) channels = CHANNELS_TRANSLATION;
  else if (hasYaw) channels = yaw > 0 ? CHANNELS_YAW_CW : CHANNELS_YAW_CCW;
  writeFiring(out, records, index, station, side, side < 0 ? 'rcs-port' : 'rcs-starboard', longFrac,
    rx * pushSign, rz * pushSign, mag, channels,
    fx, fz, rx, rz, px, pz, radius);
  return index + 1;
}

function writeFiring(out, records, index, station, side, role, longFrac, pushX, pushZ, intensity, channels,
  fx, fz, rx, rz, px, pz, radius) {
  const lateralOffset = RCS_GEOMETRY.side * radius * side;
  const longOffset = longFrac * radius;
  let firing = records[index];
  if (!firing) firing = records[index] = {};
  out[index] = firing;
  firing.station = station;
  firing.side = side;
  firing.role = role;
  firing.x = px + fx * longOffset + rx * lateralOffset;
  firing.z = pz + fz * longOffset + rz * lateralOffset;
  firing.pushX = pushX;
  firing.pushZ = pushZ;
  // Newton's third law, stated once, in one place.
  firing.dirX = -pushX;
  firing.dirZ = -pushZ;
  firing.intensity = clamp(intensity, 0, 1);
  firing.channels = channels;
  return firing;
}

/**
 * Normalized main-drive demand, for driving the existing plume from physics rather than from an
 * input key. Returns null when the actuator block is absent so callers keep their old fallback
 * instead of reading a fabricated zero as "engine off".
 */
export function mainDriveDemand(actuators, scale, out = null) {
  if (!actuators || !scale) return null;
  const main = Math.max(0, finite(actuators.main));
  const reverse = Math.max(0, finite(actuators.reverse));
  const demand = out || {};
  demand.main = clamp(main / scale.main, 0, 1);
  demand.reverse = clamp(reverse / scale.reverse, 0, 1);
  // A drive spending authority against its own velocity with zero forward demand is braking:
  // its main nozzle must be dark while the retros fire. The renderer's speed-derived glow used
  // to keep it lit, which read as a ship accelerating into its own brake.
  demand.retroOnly = main <= 0 && reverse > 0;
  return demand;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, finite(v))); }
function finite(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }
function positive(v, fallback) { return Number.isFinite(v) && v > 0 ? v : fallback; }
