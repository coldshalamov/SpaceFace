// Presentation-only choreography for the eight-arm salvage machine. Coordinates are in mantle
// radii: +Y runs up the mantle, +X is forward after the body pitches head-first. Caller-owned
// typed arrays receive every pose; there is no clock, simulation mutation or per-call allocation.
// The reference's long proximal barrels flow into a hanging middle and a near-complete terminal
// spiral. The chain is deliberately much longer than its curled radial footprint.

const TAU = Math.PI * 2;
const EMPTY_POSE = Object.freeze({});
const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export const IRON_KRAKEN_ARM_MOTION = Object.freeze({
  chainLength: 4.7,
  rootRadius: 0.87,
  rootHeight: -0.38,
  links: 22,
  proximalLinks: 4,
});

const PROXIMAL_LENGTHS = new Float64Array([0.55, 0.53, 0.47, 0.41]);
const PROXIMAL_RADII = new Float64Array([0.20, 0.19, 0.18, 0.16]);

/** Shared manufactured sleeve radius for live and static-wreck articulation. */
export function ironKrakenArmRadius(link, links = IRON_KRAKEN_ARM_MOTION.links) {
  if (!Number.isInteger(links) || links < 2 || !Number.isInteger(link) || link < 0 || link >= links) {
    throw new RangeError('Iron Kraken sleeve radius requires a valid mechanical link index');
  }
  if (link < PROXIMAL_RADII.length) return PROXIMAL_RADII[link];
  if (link === PROXIMAL_RADII.length) return 0.15;
  if (link === links - 1) return 0.018;
  return 0.15 + (0.018 - 0.15) * (link - PROXIMAL_RADII.length) / (links - PROXIMAL_RADII.length - 1);
}

// Anatomical differences stay with each arm rather than rotating a common shape around a wheel.
const CURL = new Float64Array([6.82, 7.36, 6.16, 7.62, 6.55, 7.12, 6.38, 7.48]);
const PLANE = new Float64Array([0.34, -0.24, 0.58, -0.42, 0.18, -0.53, 0.43, -0.12]);
const SHOULDER = new Float64Array([0.50, 0.40, 0.68, 0.48, 0.60, 0.72, 0.42, 0.58]);
const DROOP = new Float64Array([0.58, 0.43, 0.66, 0.51, 0.71, 0.49, 0.62, 0.46]);
const LENGTH = new Float64Array([1.015, 0.965, 1.025, 0.985, 1.01, 0.975, 1.02, 0.98]);
const SWEEP = new Float64Array([-0.10, 0.07, -0.045, 0.12, -0.08, 0.035, 0.09, -0.065]);
const PHASE = new Float64Array([0.13, 2.07, 4.82, 1.26, 5.51, 3.63, 0.94, 4.17]);
const JET_CURL = new Float64Array([1.32, 1.78, 1.45, 1.64, 1.22, 1.56, 1.70, 1.37]);
const JET_ROLL = new Float64Array([0.23, -0.34, 0.43, -0.17, 0.31, -0.41, 0.14, -0.27]);
const JET_BOW = new Float64Array([0.06, 0.13, 0.10, 0.16, 0.08, 0.12, 0.18, 0.09]);

function knot(index, seed) {
  let value = Math.imul((index | 0) ^ seed, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 2147483647.5 - 1;
}

// Slow, eased posture changes have settled tangents at their endpoints. Independent channels
// give each arm a different reach/coil/roll conversation without an ambient RNG or a pinwheel.
function drift(time, seed) {
  const index = Math.floor(time), fraction = time - index;
  const eased = fraction * fraction * fraction * (fraction * (fraction * 6 - 15) + 10);
  const a = knot(index, seed), b = knot(index + 1, seed);
  return a + (b - a) * eased;
}

/**
 * Fill one articulated chain in mantle-local coordinates.
 *
 * pose: {time, jet, rake, ink, inkActive, inkCurl, inkLift, mantle, reducedMotion}.
 * `jet`, `rake`, `inkCurl`, `inkLift` and `mantle` may be the render owner's eased values.
 * When inkCurl/inkLift are absent, the same values are derived from ink + inkActive.
 * points contains (links + 1) XYZ triples from pointOffset. Optional frames contains `links`
 * 3x3 column-major bases from frameOffset: X lateral, Y along the link, Z dorsal. Put suction
 * cups on -Z. The return value is the original points buffer.
 */
export function sampleIronKrakenArm(arm, pose = EMPTY_POSE, points, pointOffset = 0,
  frames = null, frameOffset = 0, links = IRON_KRAKEN_ARM_MOTION.links) {
  if (!points || !Number.isInteger(links) || links < 2
    || points.length < pointOffset + (links + 1) * 3
    || (frames && frames.length < frameOffset + links * 9)) {
    throw new RangeError('Iron Kraken arm pose requires caller-owned point and frame capacity');
  }
  const index = ((arm | 0) % 8 + 8) % 8;
  const angle = index * TAU / 8 + Math.PI / 8;
  const rootCos = Math.cos(angle), rootSin = Math.sin(angle);
  const time = finite(pose.time), quiet = pose.reducedMotion ? 0 : 1;
  const jet = clamp01(pose.jet), rake = clamp01(pose.rake), mantle = clamp01(pose.mantle);
  const ink = clamp01(pose.ink);
  const inkCurl = finite(pose.inkCurl, (pose.inkActive ? -0.64 : 0.36) * ink);
  const inkLift = finite(pose.inkLift, (pose.inkActive ? -0.28 : 0.65) * ink);
  const reachDrift = quiet ? drift(time * 0.13 + PHASE[index], 149 + index * 31) : 0;
  const curlDrift = quiet ? drift(time * 0.18 + PHASE[index] * 0.71, 769 + index * 43) : 0;
  const rollDrift = quiet ? drift(time * 0.11 + PHASE[index] * 1.31, 1543 + index * 61) : 0;
  const flank = Math.abs(rootSin) > 0.45 ? 1 : 0.24;
  const rakeWeight = rake * flank;
  // One near forearm folds back beside the collar instead of matching the seven broad reaches.
  // Its slow, independent roll presents the cup rows side-on. Rake commitment removes the tuck;
  // the normal jet fold below still carries every arm into the same trailing stream posture.
  const forearmTuck = index === 1 ? 1 - rakeWeight : 0;
  const tuckDrift = forearmTuck && quiet ? drift(time * 0.07 + 0.41, 2833) : 0;
  const coilStart = 0.29 + (0.225 + tuckDrift * 0.025 - 0.29) * forearmTuck;
  // Adjacent foreground chains pass at different depths during the rake. A small committed
  // yaw separates their sleeve lips; an early roll clears the tiny tip during coil release.
  // Both vanish in holding, and the jet's target pose removes them completely.
  const rakeYawClearance = index === 2 ? rake * 0.05 : 0;
  const rakeRollClearance = index === 1 ? 0.06 * smooth(rake / 0.12)
    * (1 - smooth((rake - 0.40) / 0.30)) : 0;
  const yaw = angle + (SWEEP[index] + reachDrift * 0.065 + rakeYawClearance) * (1 - jet);
  const totalLength = IRON_KRAKEN_ARM_MOTION.chainLength * LENGTH[index];
  const proximalCount = Math.min(PROXIMAL_LENGTHS.length, links);
  let proximalLength = 0;
  for (let link = 0; link < proximalCount; link++) proximalLength += PROXIMAL_LENGTHS[link];
  const fineCount = links - proximalCount;
  const proximalScale = fineCount ? 1 : IRON_KRAKEN_ARM_MOTION.chainLength / proximalLength;
  const fineScale = fineCount ? (IRON_KRAKEN_ARM_MOTION.chainLength - proximalLength)
    / (fineCount * (0.245 + 0.060) * 0.5) : 0;
  const coilTurns = (CURL[index] + curlDrift * 0.48) * (1 + inkCurl * 0.30);
  const shoulder = SHOULDER[index] + reachDrift * 0.07 + forearmTuck * 0.12;
  const droop = DROOP[index] + reachDrift * 0.10 + mantle * 0.04;
  const planeBase = PLANE[index] + rollDrift * 0.18 - forearmTuck * (0.65 + tuckDrift * 0.08)
    - rakeRollClearance;
  let x = rootCos * IRON_KRAKEN_ARM_MOTION.rootRadius;
  let y = IRON_KRAKEN_ARM_MOTION.rootHeight;
  let z = rootSin * IRON_KRAKEN_ARM_MOTION.rootRadius;
  let traversed = 0;
  points[pointOffset] = x; points[pointOffset + 1] = y; points[pointOffset + 2] = z;

  for (let link = 0; link < links; link++) {
    // Four broad proximal barrels carry 1.96 radii, followed by eighteen finer mechanisms.
    // The fine chain is normalized independently so manufacturing the broad links never
    // changes total reach. Alternate sampling counts retain the same normalized curve.
    const fineFraction = fineCount > 1 ? (link - proximalCount) / (fineCount - 1) : 0.5;
    const nominalLength = link < proximalCount ? PROXIMAL_LENGTHS[link] * proximalScale
      : (0.245 + (0.060 - 0.245) * fineFraction) * fineScale;
    const length = nominalLength * LENGTH[index];
    const arc = (traversed + length * 0.5) / totalLength;
    traversed += length;
    // Reparameterize the authored bend by distance, so changing the coarse/fine segment
    // rhythm preserves the raised elbow and hanging loop. The inverse of the former smooth
    // taper puts the coil onset just after coarse link four, with fine cells completing it.
    const s = (1.75 - Math.sqrt(Math.max(0, 3.0625 - 3 * arc))) / 1.5;
    const coil = clamp01((s - coilStart) / (1 - coilStart));
    // The broad proximal barrels first rise into an elbow. Their different shoulder pitches
    // expose underside hardware from the front and let high rear arms clear the lower collar.
    // Only then does the hanging middle turn down into its tightly wound terminal loop.
    const broad = shoulder * (1 - smooth(s / 0.30))
      - droop * Math.sin(Math.PI * clamp01((s - 0.08) / 0.64));
    const idleBend = broad - coilTurns * Math.pow(coil, 1.32) + inkLift * 0.32;
    // A rake opens a broad arc within the authored reach rather than extending the whole
    // 4.7-radius chain into a rigid spear. The flank curl plane turns toward the sweep plane.
    const rakeBend = 0.20 - 2.90 * arc;
    const bend = idleBend + (rakeBend - idleBend) * rakeWeight;
    const twist = (0.26 + 0.14 * rollDrift) * smooth(coil) * Math.sin(coil * Math.PI + PHASE[index]);
    const plane = Math.max(-1.05, Math.min(1.05,
      planeBase + twist + Math.sign(planeBase || 1) * rakeWeight * 0.70));
    // The root commits first; the finer chain trails as it uncoils. On braking, tips recover
    // their curl before the whole arm regains its broad hanging posture. Both directions use
    // the same eased, deterministic score input; no frame-rate-dependent state is hidden here.
    const fold = smooth((jet - 0.12 * s) / (0.88 - 0.12 * s));
    const streamSpread = 0.10 + 0.30 * Math.exp(-s * 5);
    const tail = quiet ? Math.sin(time * 1.35 - s * 4.8 + PHASE[index]) * s * s * 0.035 : 0;
    // Interpolate the unwrapped curl angle, not opposite unit vectors: a nearly closed tip
    // must visibly unwind, and a half-fold must never collapse a tangent through zero.
    // Streaming retains the reference's partially curled fine chain: the large mechanisms
    // follow the head while each distal tip keeps its own hook and roll. This is a residual
    // articulated pose, not a second travelling wave or a force applied to simulation.
    const trailingCurl = smooth((arc - 0.70) / 0.30);
    const middleBow = JET_BOW[index] * 4 * arc * (1 - arc);
    const streamBend = Math.atan2(-1, Math.hypot(streamSpread, tail))
      + middleBow - JET_CURL[index] * trailingCurl;
    const streamPlane = JET_ROLL[index] * smooth((arc - 0.35) / 0.65);
    const linkBend = bend + (streamBend - bend) * fold;
    const linkYaw = yaw + (angle + Math.atan2(tail, streamSpread) - yaw) * fold;
    const linkPlane = plane + (streamPlane - plane) * fold;
    const ca = Math.cos(linkYaw), sa = Math.sin(linkYaw);
    const planeSin = Math.sin(linkPlane), planeCos = Math.cos(linkPlane);
    const bendCos = Math.cos(linkBend), bendSin = Math.sin(linkBend);
    const tx = ca * bendCos - sa * planeSin * bendSin;
    const ty = planeCos * bendSin;
    const tz = sa * bendCos + ca * planeSin * bendSin;
    x += tx * length; y += ty * length; z += tz * length;
    const pointIndex = pointOffset + (link + 1) * 3;
    points[pointIndex] = x; points[pointIndex + 1] = y; points[pointIndex + 2] = z;

    if (frames) {
      // The curl plane supplies a stable lateral direction even at a vertical root or tip.
      // Orthogonalizing after the stream blend preserves circular hardware and avoids flips.
      let bx = -sa * planeCos, by = -planeSin, bz = ca * planeCos;
      const projection = bx * tx + by * ty + bz * tz;
      bx -= tx * projection; by -= ty * projection; bz -= tz * projection;
      const inverseB = 1 / Math.hypot(bx, by, bz);
      bx *= inverseB; by *= inverseB; bz *= inverseB;
      const frameIndex = frameOffset + link * 9;
      frames[frameIndex] = bx; frames[frameIndex + 1] = by; frames[frameIndex + 2] = bz;
      frames[frameIndex + 3] = tx; frames[frameIndex + 4] = ty; frames[frameIndex + 5] = tz;
      frames[frameIndex + 6] = by * tz - bz * ty;
      frames[frameIndex + 7] = bz * tx - bx * tz;
      frames[frameIndex + 8] = bx * ty - by * tx;
    }
  }
  return points;
}

/** Body offsets in mantle radii/radians. The renderer retains all world heading/position ownership. */
export function ironKrakenBodyPose(pose = EMPTY_POSE, out) {
  if (!out) throw new TypeError('Iron Kraken body pose requires caller-owned output');
  const time = finite(pose.time), quiet = pose.reducedMotion ? 0 : 1;
  const jet = smooth((clamp01(pose.jet) - 0.03) / 0.87);
  const sway = quiet ? drift(time * 0.14, 601) : 0;
  const heave = quiet ? drift(time * 0.19 + 0.7, 947) : 0;
  out.pitchZ = -1.30 * jet + sway * 0.045 * (1 - jet);
  out.rollX = quiet ? drift(time * 0.12 + 1.3, 1223) * (0.040 + jet * 0.025) : 0;
  out.liftY = heave * 0.028 * (1 - jet * 0.6);
  return out;
}
