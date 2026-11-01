// Presentation-only articulation. Every arm is a fixed-length manufactured chain seated in its
// hull socket; poses are sampled from simulation time into caller-owned buffers. +Y is mantle
// up, +X is the optical/prow direction. No Three.js, ambient clock, RNG, or per-frame allocation.
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
const PROXIMAL_LENGTHS = new Float64Array([.64, .61, .55, .49]);
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

// Four different anatomical duties, rather than eight copies of one hanging ring. The paired
// forearms descend; lateral arms reach; dorsal arms arch above the mantle. Shoulder angles are
// measured against each socket's radial axis. The unequal pair values preserve handedness.
const SHOULDER_PITCH = new Float64Array([
  .10, .05, -.45, -1.00,
  .70, .70, .20, -.40,
  .75, 1.12, 1.00, .80,
  .90, 1.20, 1.35, .90,
  .82, 1.18, 1.20, .72,
  .75, 1.00, .85, .55,
  .60, .60, .25, -.50,
  .14, .00, -.45, -.95,
]);
const SHOULDER_SWING = new Float64Array([.08, .14, .20, .20]);
const RAKE_PITCH = new Float64Array([.32, .64, .30, -.62]);
const PLANE = new Float64Array([.09, -.11, .10, -.08, .11, -.08, .10, -.09]);
const LENGTH = new Float64Array([1.015, .965, 1.025, .985, 1.01, .975, 1.02, .98]);
const PHASE = new Float64Array([.13, 2.07, 4.82, 1.26, 5.51, 3.63, .94, 4.17]);
const JET_CURL = new Float64Array([1.32, 1.78, 1.45, 1.64, 1.22, 1.56, 1.70, 1.37]);
const JET_BOW = new Float64Array([.06, .13, .10, .16, .08, .12, .18, .09]);

/**
 * Fill one chain. Optional normalized channels: jet, rake, rakeProgress, locomotion, mantle,
 * inkCurl/inkLift; turn is signed normalized yaw velocity. Gameplay meaning remains with the
 * score and physics owners. The renderer may ease these inputs but must not move the sockets.
 *
 * points: (links + 1) XYZ triples. frames: links column-major 3x3 bases (lateral, axial, dorsal).
 * Suction cups lie on -dorsal. Every frame follows the actual segment, including partial folds.
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
  const travel = clamp01(pose.locomotion);
  const jet = 1 - (1 - clamp01(pose.jet)) * (1 - travel * .30);
  const rake = clamp01(pose.rake), mantle = clamp01(pose.mantle);
  const ink = clamp01(pose.ink);
  const inkCurl = finite(pose.inkCurl, (pose.inkActive ? -.64 : .36) * ink);
  const inkLift = finite(pose.inkLift, (pose.inkActive ? -.28 : .65) * ink);
  const phase = PHASE[index];
  // Independent slow recruitment, followed by a faster wave along the fine chain. The root
  // moves least, the forearm leads, and the terminal curl follows: no synchronized pinwheel.
  const reach = quiet ? Math.sin(time * 1.17 + phase) : 0;
  const curl = quiet ? Math.sin(time * 1.53 + phase + .7) : 0;
  const roll = quiet ? Math.sin(time * .71 + phase) : 0;
  const flank = Math.abs(rootSin) > .45 ? 1 : .20;
  const rakeWeight = rake * flank;
  const activeSweep = Number.isFinite(pose.rakeProgress) ? 2 * smooth(pose.rakeProgress) - 1 : -.5;
  const yaw = angle + (quiet * .025 * Math.sin(time * .83 + phase)
    + .20 * rake * activeSweep) * (1 - jet);
  const coilTurns = 6.22 + .20 * Math.sin(index) + curl * .32 + inkCurl * .36;
  const ventRelax = 1 - mantle * .72;
  const forearmPitch = SHOULDER_PITCH[index * 4 + 3] * ventRelax - mantle * .08;
  const totalLength = IRON_KRAKEN_ARM_MOTION.chainLength * LENGTH[index];
  const proximalCount = Math.min(PROXIMAL_LENGTHS.length, links);
  let proximalLength = 0;
  for (let link = 0; link < proximalCount; link++) proximalLength += PROXIMAL_LENGTHS[link];
  const fineCount = links - proximalCount;
  const proximalScale = fineCount ? 1 : IRON_KRAKEN_ARM_MOTION.chainLength / proximalLength;
  const fineScale = fineCount ? (IRON_KRAKEN_ARM_MOTION.chainLength - proximalLength)
    / (fineCount * (.245 + .060) * .5) : 0;
  let x = rootCos * IRON_KRAKEN_ARM_MOTION.rootRadius;
  let y = IRON_KRAKEN_ARM_MOTION.rootHeight;
  let z = rootSin * IRON_KRAKEN_ARM_MOTION.rootRadius;
  let traversed = 0;
  points[pointOffset] = x; points[pointOffset + 1] = y; points[pointOffset + 2] = z;

  for (let link = 0; link < links; link++) {
    const fineFraction = fineCount > 1 ? (link - proximalCount) / (fineCount - 1) : .5;
    const nominalLength = link < proximalCount ? PROXIMAL_LENGTHS[link] * proximalScale
      : (.245 + (.060 - .245) * fineFraction) * fineScale;
    const length = nominalLength * LENGTH[index];
    const arc = (traversed + length * .5) / totalLength;
    traversed += length;
    const tailWave = quiet ? .085 * Math.sin(time * 1.91 - arc * 3.8 + phase) : 0;
    const idleBendRaw = link < proximalCount
      ? SHOULDER_PITCH[index * 4 + link] * ventRelax - mantle * .08
        + reach * SHOULDER_SWING[link] * (1 - mantle * .45) + inkLift * .19
      : forearmPitch - .22 + reach * .16 - coilTurns * fineFraction + tailWave + inkLift * .19;
    // The first barrel has a real shoulder stop: an over-raised root would bury its rear lip
    // in the pressure housing. Later joints retain the tall dorsal arch.
    const idleBend = link === 0 ? Math.min(.95, idleBendRaw) : idleBendRaw;
    const rakeBend = link < proximalCount ? RAKE_PITCH[link] : -.84 - 6.15 * fineFraction;
    const bend = idleBend + (rakeBend - idleBend) * rakeWeight;
    // Narrow, distinct curl planes keep real sleeve/cup envelopes apart at all eight sockets.
    // Avoiding intersections is an anatomical choice here, not an after-the-fact teleport.
    const plane = PLANE[index] + roll * .045
      + quiet * .012 * Math.sin(time * .91 - arc * 1.4 + phase);
    // Unwrap angles during the fold. Interpolating opposed direction vectors collapses or
    // flips a nearly closed terminal curl. The root commits before the finer hardware follows.
    const fold = smooth((jet - .12 * arc) / (.88 - .12 * arc));
    const trailingCurl = smooth((arc - .70) / .30);
    const streamSpread = .10 + .30 * Math.exp(-arc * 5);
    const streamBend = Math.atan2(-1, streamSpread)
      + JET_BOW[index] * 4 * arc * (1 - arc) - JET_CURL[index] * trailingCurl;
    const streamWave = quiet ? .022 * Math.sin(time * 1.8 - arc * 5 + phase) * arc * arc : 0;
    const linkBend = bend + (streamBend - bend) * fold;
    const linkYaw = yaw + (angle + streamWave - yaw) * fold;
    const linkPlane = plane * (1 - fold);
    const ca = Math.cos(linkYaw), sa = Math.sin(linkYaw);
    const ps = Math.sin(linkPlane), pc = Math.cos(linkPlane);
    const cb = Math.cos(linkBend), sb = Math.sin(linkBend);
    const tx = ca * cb - sa * ps * sb;
    const ty = pc * sb;
    const tz = sa * cb + ca * ps * sb;
    x += tx * length; y += ty * length; z += tz * length;
    const pointIndex = pointOffset + (link + 1) * 3;
    points[pointIndex] = x; points[pointIndex + 1] = y; points[pointIndex + 2] = z;

    if (frames) {
      // Analytic curl-plane frame remains stable at vertical shoulders and fully rolled tips.
      // Orthogonalization absorbs floating-point roundoff; this is a right-handed rigid frame.
      let bx = -sa * pc, by = -ps, bz = ca * pc;
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

/** Local offsets only. Physics and the render root remain the sole world-position/heading owners. */
export function ironKrakenBodyPose(pose = EMPTY_POSE, out) {
  if (!out) throw new TypeError('Iron Kraken body pose requires caller-owned output');
  const time = finite(pose.time), quiet = pose.reducedMotion ? 0 : 1;
  const jet = smooth((clamp01(pose.jet) - .03) / .87);
  const travel = clamp01(pose.locomotion);
  const turn = Math.max(-1, Math.min(1, finite(pose.turn)));
  const rake = clamp01(pose.rake), recoil = clamp01(pose.recoil), mantle = clamp01(pose.mantle);
  const breath = quiet ? Math.sin(time * 1.17) : 0;
  const rock = quiet ? Math.sin(time * .71 + .8) : 0;
  out.pitchZ = -1.30 * jet + (1 - jet) * (-.44 * travel * travel
    + breath * .065 + mantle * .06 - rake * .045 + recoil * .13);
  out.rollX = -turn * (.10 + travel * .16) + (1 - jet * .65) * rock * .065;
  out.liftY = (breath * .035 + quiet * Math.sin(time * .53 + 1.7) * .018)
    * (1 - jet * .65) + mantle * .028;
  return out;
}
