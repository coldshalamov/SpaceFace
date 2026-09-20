// PQ-134.02 — spawn arcade blades/arcs/shards from a causal family presentation.
// Uses the existing primitive pools only. Deterministic. Does not grow capacity.
//
// PQ-VFX impacts lane: the poses below now also carry a per-element DELAY, so one spawn call
// authors a sequence instead of a single instant. The eight causal families already declare a
// motion token each ('sequential-hop', 'delayed-inward-out', 'compressive-punch'); until now every
// element of a burst appeared on the same frame, so none of those tokens were actually true. The
// delays make the declared motion the drawn motion, at no extra pool cost.
import {
  explosionPattern01,
  explosionPatternSigned,
} from './phasedExplosions.js';
import { resolveImpactPresentation } from '../../presentation/causalVfxGrammar.js';

export function spawnCausalStructuralBurst({
  fx,
  spec,
  writeSpec,
  presentation,
  mixed,
  phase,
  baseAngle,
  lx,
  ly,
  lz,
  tvx,
  tvy,
  tvz,
  radius,
  priority,
  dv,
  reduced,
  pattern01,
  patternSigned,
}) {
  if (!fx || !presentation) return 0;
  const y = Number.isFinite(ly) ? ly : 0.45;
  const lifeScale = presentation.lifeScale ?? 1;
  const intensity = presentation.intensity ?? 1;
  const colour = presentation.colour ?? presentation.color;
  const endColour = presentation.endColour ?? presentation.endColor;
  const layout = presentation.layout;
  let spawned = 0;

  const spawnBlade = (s) => fx.spawnBlade(s);
  const spawnArc = (s) => fx.spawnArc(s);
  const spawnShard = (s) => fx.spawnShard(s);

  const bladeCount = presentation.blades;
  const arcCount = presentation.arcs;
  const shardCount = presentation.shards;

  for (let k = 0; k < bladeCount; k++) {
    const pose = bladePose(layout, k, bladeCount, {
      baseAngle, mixed, phase, radius, pattern01, patternSigned,
    });
    writeSpec(
      spec,
      priority,
      Math.max(0.06, pose.life * lifeScale),
      lx + pose.ox, y + pose.oy, lz + pose.oz,
      pose.vx, pose.vy, pose.vz,
      pose.drag, pose.gravity,
      pose.angle, pose.spin,
      0, 0, 0, 0,
      pose.length0, pose.length1,
      pose.width0, pose.width1,
      8, 42,
      3.9 * intensity,
      colour, endColour,
    );
    // writeSpec has a fixed arity and never touches `delay`, so every caller must set it
    // explicitly — otherwise the previous element's schedule leaks into this one.
    spec.delay = pose.delay || 0;
    if (spawnBlade(spec)) spawned++;
  }

  for (let k = 0; k < arcCount; k++) {
    const pose = arcPose(layout, k, arcCount, {
      baseAngle, mixed, phase, radius, pattern01, patternSigned,
    });
    writeSpec(
      spec,
      priority,
      Math.max(0.08, pose.life * lifeScale),
      lx + pose.ox, y + pose.oy, lz + pose.oz,
      0, 0, 0,
      pose.drag, 0,
      pose.angle, pose.spin,
      0, 0, 0, 0,
      pose.length0, pose.length1,
      pose.width0, pose.width1,
      8, 51,
      3.3 * intensity,
      colour, endColour,
    );
    spec.delay = pose.delay || 0;
    if (spawnArc(spec)) spawned++;
  }

  const radial = layout === 'opposed' || layout === 'planar'
    ? (6 + (Number(dv) || 0) * 0.35) * (reduced ? 0.7 : 1)
    : radius * (2.2 + pattern01(mixed, phase, 0, 8) * 1.8);
  for (let k = 0; k < shardCount; k++) {
    const pose = shardPose(layout, k, shardCount, {
      baseAngle, mixed, phase, radius, radial, tvx, tvy, tvz, reduced,
      pattern01, patternSigned,
    });
    writeSpec(
      spec,
      priority,
      Math.max(0.18, pose.life * lifeScale),
      lx + pose.ox, (Number.isFinite(ly) ? ly : 0.65) + pose.oy, lz + pose.oz,
      pose.vx, pose.vy, pose.vz,
      pose.drag, pose.gravity,
      pose.angle, pose.spin,
      pose.pitch, pose.pitchSpin,
      pose.roll, pose.rollSpin,
      pose.size, pose.size,
      pose.size * 0.55, pose.size * 0.55,
      0, 0,
      1 * intensity,
      colour, endColour,
    );
    spec.delay = pose.delay || 0;
    if (spawnShard(spec)) spawned++;
  }
  return spawned;
}

function bladePose(layout, k, n, ctx) {
  const { baseAngle, mixed, phase, radius, pattern01, patternSigned } = ctx;
  const len = radius * (0.55 + pattern01(mixed, phase, k, 2) * 0.40);
  const base = {
    ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0,
    drag: NaN, gravity: NaN,
    delay: 0,
    life: 0.26,
    angle: baseAngle + patternSigned(mixed, phase, k, 1) * 0.72 + (k - (n - 1) * 0.5) * 0.22,
    spin: patternSigned(mixed, phase, k, 3) * 1.8,
    length0: len, length1: len * 1.32,
    width0: Math.max(0.12, radius * 0.10), width1: Math.max(0.04, radius * 0.04),
  };
  if (layout === 'chevron') {
    // 'two-axis-bounce': the second leg of the chevron arrives after the first, so the shape reads
    // as a bounce rather than as a static V drawn all at once.
    const side = k < n * 0.5 ? -1 : 1;
    base.angle = baseAngle + side * 0.55 + patternSigned(mixed, phase, k, 1) * 0.18;
    base.spin = side * 2.4;
    base.life = 0.22;
    base.delay = side > 0 ? 0.055 : 0;
    return base;
  }
  if (layout === 'axial') {
    // 'linear-snap': the release runs down the line instead of lighting the whole cable at once.
    const along = (k - (n - 1) * 0.5) * radius * 0.55;
    base.ox = Math.cos(baseAngle) * along;
    base.oz = Math.sin(baseAngle) * along;
    base.angle = baseAngle;
    base.spin = 0.4 * patternSigned(mixed, phase, k, 3);
    base.length0 = radius * 1.1;
    base.length1 = radius * 0.35;
    base.life = 0.18;
    base.delay = k * 0.028;
    return base;
  }
  if (layout === 'reverse') {
    // 'delayed-inward-out': the outward blades are the SECOND half of the gesture; the shards
    // collapse inward first. That delay is the whole identity of the reaction family.
    base.angle = baseAngle + k * (Math.PI / Math.max(1, n));
    base.spin = patternSigned(mixed, phase, k, 3) * 0.6;
    base.length0 = len * 0.45;
    base.length1 = len * 1.15;
    base.life = 0.34;
    base.delay = 0.14 + k * 0.03;
    return base;
  }
  // 'fast-radial-short': the blades lead, everything else answers them.
  return base;
}

function arcPose(layout, k, n, ctx) {
  const { baseAngle, mixed, phase, radius, pattern01, patternSigned } = ctx;
  const len = radius * (0.95 + pattern01(mixed, phase, k, 6) * 0.35);
  const base = {
    ox: 0, oy: 0, oz: 0,
    drag: NaN,
    delay: 0,
    life: 0.32,
    angle: baseAngle + patternSigned(mixed, phase, k, 5) * 0.45,
    spin: patternSigned(mixed, phase, k, 7) * 0.9,
    length0: len, length1: len * 1.40,
    width0: Math.max(0.16, radius * 0.14), width1: Math.max(0.06, radius * 0.05),
  };
  if (layout === 'opposed') {
    // 'opposed-tumble': the two compression arcs are simultaneous — the contact is one event.
    base.angle = baseAngle + k * Math.PI;
    base.spin = 0.2;
    return base;
  }
  if (layout === 'hop') {
    const along = (k + 0.5) * radius * 0.85;
    base.ox = Math.cos(baseAngle) * along;
    base.oz = Math.sin(baseAngle) * along;
    base.angle = baseAngle + patternSigned(mixed, phase, k, 5) * 0.25;
    base.length0 = radius * (0.45 + k * 0.12);
    base.length1 = radius * (0.55 + k * 0.18);
    base.life = 0.20 + k * 0.05;
    base.spin = 0.15;
    // 'sequential-hop': each hop lands after the one before it. Spawning them together made the
    // chain family read as a static row of arcs; the delay is what makes it travel.
    base.delay = k * 0.075;
    return base;
  }
  if (layout === 'expand') {
    // 'slow-expand-linger': the shells open outward one after another.
    base.angle = baseAngle + (k - (n - 1) * 0.5) * 0.9;
    base.length0 = radius * 0.4;
    base.length1 = radius * 2.2;
    base.life = 0.55;
    base.spin = 0.08;
    base.delay = k * 0.06;
    base.width0 = Math.max(0.18, radius * 0.12);
    base.width1 = Math.max(0.10, radius * 0.08);
    return base;
  }
  if (layout === 'axial') {
    base.angle = baseAngle;
    base.length0 = radius * 1.4;
    base.length1 = radius * 0.6;
    base.life = 0.24;
    return base;
  }
  if (layout === 'chevron') {
    base.angle = baseAngle + (k === 0 ? -0.4 : 0.4);
    return base;
  }
  return base;
}

function shardPose(layout, k, n, ctx) {
  const {
    baseAngle, mixed, phase, radius, radial, tvx, tvy, tvz, reduced,
    pattern01, patternSigned,
  } = ctx;
  const size = radius * (0.18 + pattern01(mixed, phase, k, 11) * 0.14);
  const side = (k & 1) ? 1 : -1;
  let a = baseAngle + patternSigned(mixed, phase, k, 9) * 1.8;
  if (layout === 'opposed') {
    a = baseAngle + (side < 0 ? Math.PI : 0) + patternSigned(mixed, phase, k, 9) * 0.32;
  }
  let speed = radial * (0.65 + pattern01(mixed, phase, k, 10) * 0.7);
  let vx = tvx + Math.cos(a) * speed;
  let vy = tvy + 2.4 + pattern01(mixed, phase, k, 12) * 4.2;
  let vz = tvz + Math.sin(a) * speed;
  let ox = 0;
  let oy = 0;
  let oz = 0;
  let life = 0.62;
  let gravity = NaN;
  let drag = NaN;
  // Matter leaves AFTER the light that threw it. A radial burst releases its shards a beat behind
  // the blades; a crush walks them outward; a reaction collapses them inward first.
  let delay = 0.045;
  if (layout === 'planar') {
    a = baseAngle + (k / Math.max(1, n)) * Math.PI * 2;
    const spread = radius * (0.15 + pattern01(mixed, phase, k, 10) * 0.25);
    ox = Math.cos(a) * spread;
    oz = Math.sin(a) * spread;
    vx = Math.cos(a) * radius * 0.35;
    vz = Math.sin(a) * radius * 0.35;
    vy = -8 - pattern01(mixed, phase, k, 12) * 4;
    gravity = -14;
    drag = 2.2;
    life = 0.5;
    // 'compressive-punch': the crush walks outward from the contact instead of appearing whole.
    delay = 0.02 + k * 0.022;
  } else if (layout === 'reverse') {
    const outer = radius * (0.9 + pattern01(mixed, phase, k, 10) * 0.4);
    ox = Math.cos(a) * outer;
    oz = Math.sin(a) * outer;
    vx = -Math.cos(a) * speed * 0.55;
    vz = -Math.sin(a) * speed * 0.55;
    vy = 0.4;
    life = 0.7;
    drag = 1.1;
    delay = 0;
  } else if (layout === 'expand') {
    speed *= 0.25;
    vx = tvx + Math.cos(a) * speed;
    vz = tvz + Math.sin(a) * speed;
    vy = 0.6;
    life = 0.8;
    drag = 0.6;
    delay = 0.08;
  } else if (layout === 'hop') {
    const along = (k + 0.5) * radius * 0.7;
    ox = Math.cos(baseAngle) * along;
    oz = Math.sin(baseAngle) * along;
    vx = Math.cos(baseAngle) * radius * 1.4;
    vz = Math.sin(baseAngle) * radius * 1.4;
    vy = 1.2;
    delay = k * 0.075;
  }
  if (reduced && layout !== 'planar') {
    vx *= 0.7;
    vz *= 0.7;
  }
  return {
    ox, oy, oz, vx, vy, vz, drag, gravity, life, delay,
    angle: a,
    spin: patternSigned(mixed, phase, k, 13) * 8.5,
    pitch: pattern01(mixed, phase, k, 14) * 2.4,
    pitchSpin: patternSigned(mixed, phase, k, 15) * 6.5,
    roll: pattern01(mixed, phase, k, 16) * 1.8,
    rollSpin: patternSigned(mixed, phase, k, 17) * 7.2,
    size,
  };
}

// ------------------------------------------------------------------------------------------
// IMPACT BEATS — the pose authoring for the contact layer.
//
// `spawnCausalStructuralBurst` above answers "how did this happen". This answers "what did the
// matter do". The difference between a bullet strike, a heavy slam, a rock fracture and a capital
// breakup is carried HERE, in which poses exist and when they fire — never in a size multiplier.
//
// E2 is enforced twice: the grammar drops one-sided beats for an unsigned axis, and every pose
// below that can run on an unsigned axis is built from a mirrored pair, so flipping the normal
// produces the identical set of elements.
// ------------------------------------------------------------------------------------------

/**
 * Spawn one impact's whole beat sheet in a single call. Delays on the pool slots carry the
 * schedule, so nothing needs to revisit the event on later frames.
 *
 * @returns {number} elements spawned.
 */
export function spawnImpactStructuralBeats({
  fx, rec, spec, lx, ly, lz, priority, reduced, forcedColors, hero,
}) {
  if (!fx || !rec || !spec) return 0;
  const presentation = resolveImpactPresentation(rec, { reduced, forcedColors, hero });
  const beats = presentation.beats;
  if (!beats.length) return 0;

  // Work in the XZ play plane. The normal may be mostly vertical on a glancing deck contact; fall
  // back to the relative motion, then to +X, rather than producing a zero-length frame.
  let nx = rec.nx;
  let nz = rec.nz;
  if (Math.hypot(nx, nz) < 1e-6) {
    nx = rec.hasVelocity ? -rec.vx : 1;
    nz = rec.hasVelocity ? -rec.vz : 0;
  }
  const nlen = Math.hypot(nx, nz) || 1;
  nx /= nlen;
  nz /= nlen;
  const tx = -nz;
  const tz = nx;
  const normalAngle = Math.atan2(nz, nx);

  // Where the spall actually goes: the incoming motion reflected about the surface, not a blind
  // copy of the normal. With no relative motion on the receipt we fall back to the normal rather
  // than inventing a heading.
  let outAngle = normalAngle;
  if (rec.axisSigned && rec.hasVelocity) {
    const speed = Math.hypot(rec.vx, rec.vz);
    if (speed > 1e-6) {
      const ix = rec.vx / speed;
      const iz = rec.vz / speed;
      const dot = ix * nx + iz * nz;
      const rx = ix - 2 * dot * nx;
      const rz = iz - 2 * dot * nz;
      if (Math.hypot(rx, rz) > 1e-6) outAngle = Math.atan2(rz, rx);
    }
  }

  // The body axis a large structure comes apart along: its own travel if it had any, else the
  // surface tangent. Plates part across this axis so the break reads as a seam, not a puff.
  let bodyAngle = Math.atan2(tz, tx);
  if (rec.hasVelocity) {
    const speed = Math.hypot(rec.vx, rec.vz);
    if (speed > 1e-6) bodyAngle = Math.atan2(rec.vz, rec.vx);
  }

  const radius = Math.max(0.05, rec.radiusWU);
  const serial = rec.serial | 0;
  const y = Number.isFinite(ly) ? ly : 0;
  let spawned = 0;

  for (let b = 0; b < beats.length; b++) {
    const row = beats[b];
    for (let k = 0; k < row.count; k++) {
      resetImpactSpec(spec, priority, row, lx, y, lz);
      const ctx = {
        row, k, n: row.count, radius, serial, beatIndex: b,
        nx, nz, tx, tz, normalAngle, outAngle, bodyAngle, reduced,
        // Last line of defence for E2. The grammar already substitutes symmetric layouts for an
        // unsigned axis; the pose code refuses to aim one even if a caller hands it a sheet that
        // slipped through, because this is the step that actually writes a direction.
        layout: (rec.axisSigned !== true && (row.layout === 'reflected-cone' || row.layout === 'internal-vent'))
          ? 'mirrored-lip'
          : row.layout,
      };
      if (row.primitive === 'shard' || row.primitive === 'plate') poseSolid(spec, ctx);
      else poseLight(spec, ctx);
      let ok = false;
      if (row.primitive === 'blade') ok = fx.spawnBlade(spec);
      else if (row.primitive === 'arc') ok = fx.spawnArc(spec);
      else if (row.primitive === 'plate') ok = fx.spawnPlate(spec);
      else ok = fx.spawnShard(spec);
      if (ok) spawned++;
    }
  }
  return spawned;
}

function resetImpactSpec(spec, priority, row, lx, ly, lz) {
  spec.priority = priority;
  spec.delay = row.at;
  spec.life = row.life;
  spec.x = lx;
  spec.y = ly;
  spec.z = lz;
  spec.vx = 0; spec.vy = 0; spec.vz = 0;
  spec.drag = row.drag;
  spec.gravity = 0;
  spec.angle = 0; spec.angularVelocity = 0;
  spec.pitch = 0; spec.pitchVelocity = 0;
  spec.roll = 0; spec.rollVelocity = 0;
  spec.length0 = 1; spec.length1 = 1;
  spec.width0 = 1; spec.width1 = 1;
  spec.minWidthPixels = 0;
  spec.minLengthPixels = 0;
  spec.intensity = 1;
  spec.color = row.colour;
  spec.endColor = row.endColour;
}

/** Blades and arcs: impulse light. Shape and reach carry the beat, never a bigger flash. */
function poseLight(spec, ctx) {
  const { row, k, n, radius, serial, beatIndex, nx, nz, tx, tz, normalAngle, outAngle, bodyAngle, layout } = ctx;
  const jitter = explosionPatternSigned(serial, 'ignition', k, beatIndex + 40);
  const span = n > 1 ? (k - (n - 1) * 0.5) / Math.max(1, (n - 1) * 0.5) : 0;
  const size = radius * row.size;

  switch (layout) {
    case 'reflected-cone': {
      // One-sided, aimed down the reflected path. Short and hard: a contact beat, not a bloom.
      spec.angle = outAngle + span * row.spread + jitter * 0.06;
      spec.length0 = size * 0.28;
      spec.length1 = size * 1.15;
      spec.width0 = Math.max(0.05, size * 0.20);
      spec.width1 = Math.max(0.02, size * 0.05);
      spec.x += nx * radius * 0.12;
      spec.z += nz * radius * 0.12;
      spec.intensity = 4.2;
      spec.angularVelocity = jitter * 0.8;
      break;
    }
    case 'internal-vent': {
      // Structure venting out of the hole: it STARTS inside the surface and grows outward, so the
      // silhouette is a column standing out of a wound rather than a ball sitting on top of it.
      spec.angle = outAngle + span * row.spread * 0.5 + jitter * 0.05;
      spec.x += -nx * radius * 0.18;
      spec.z += -nz * radius * 0.18;
      spec.vx = nx * row.speed;
      spec.vz = nz * row.speed;
      spec.length0 = size * 0.35;
      spec.length1 = size * 1.9;
      spec.width0 = Math.max(0.06, size * 0.14);
      spec.width1 = Math.max(0.10, size * 0.30);
      spec.intensity = 3.4;
      spec.drag = row.drag * 0.45;
      break;
    }
    case 'mirrored-lip': {
      // The compression language. TWO lips, opposed across the contact, spreading ALONG the
      // surface and stopping hard. Mirrored, so an unsigned axis cannot bias it either way.
      const side = (k & 1) ? 1 : -1;
      const rank = Math.floor(k / 2);
      spec.angle = Math.atan2(tz, tx) + side * (row.spread * (0.5 + rank * 0.35));
      spec.x += nx * side * radius * 0.10;
      spec.z += nz * side * radius * 0.10;
      spec.vx = nx * side * row.speed;
      spec.vz = nz * side * row.speed;
      // Wide and shallow: the lip is broad across the surface and barely proud of it.
      spec.length0 = size * 0.30;
      spec.length1 = size * 1.05;
      spec.width0 = Math.max(0.10, size * 0.42);
      spec.width1 = Math.max(0.06, size * 0.22);
      spec.intensity = 2.6;
      spec.angularVelocity = 0;
      break;
    }
    case 'tangent-skid': {
      const side = (k & 1) ? 1 : -1;
      spec.angle = Math.atan2(tz, tx) + (side < 0 ? Math.PI : 0) + jitter * row.spread;
      spec.vx = tx * side * row.speed;
      spec.vz = tz * side * row.speed;
      spec.length0 = size * 0.5;
      spec.length1 = size * 2.1;
      spec.width0 = Math.max(0.04, size * 0.12);
      spec.width1 = Math.max(0.02, size * 0.04);
      spec.intensity = 3.0;
      break;
    }
    case 'cleavage-fan': {
      // Brittle planes. Straight, flat, and each one longer than the last as the crack runs.
      const plane = CLEAVAGE_ANGLES[(k + beatIndex) % CLEAVAGE_ANGLES.length];
      spec.angle = normalAngle + plane + jitter * 0.09 + span * row.spread * 0.4;
      spec.length0 = size * 0.22;
      spec.length1 = size * (1.3 + beatIndex * 0.25);
      spec.width0 = Math.max(0.05, size * 0.09);
      spec.width1 = Math.max(0.03, size * 0.16);
      spec.intensity = 1.9;
      spec.angularVelocity = 0;
      break;
    }
    case 'worked-face': {
      // The two cutting lobes standing off the face being worked, tight to the surface.
      const side = (k & 1) ? 1 : -1;
      spec.angle = normalAngle + side * row.spread;
      spec.x += nx * radius * 0.08;
      spec.z += nz * radius * 0.08;
      spec.length0 = size * 0.4;
      spec.length1 = size * 1.0;
      spec.width0 = Math.max(0.04, size * 0.18);
      spec.width1 = Math.max(0.02, size * 0.07);
      spec.intensity = 2.2;
      break;
    }
    case 'settle': {
      // The cooling aftermath. Wide, slow, dim, and it adds no new energy to the event.
      spec.angle = normalAngle + span * (row.spread || 1.4) + jitter * 0.4;
      spec.length0 = size * 0.7;
      spec.length1 = size * 1.5;
      spec.width0 = Math.max(0.12, size * 0.26);
      spec.width1 = Math.max(0.16, size * 0.40);
      spec.intensity = 0.85;
      spec.drag = row.drag * 1.6;
      spec.angularVelocity = jitter * 0.12;
      break;
    }
    case 'plate-separation':
    default: {
      spec.angle = bodyAngle + span * (row.spread || 1) + jitter * 0.12;
      spec.length0 = size * 0.4;
      spec.length1 = size * 1.5;
      spec.width0 = Math.max(0.08, size * 0.22);
      spec.width1 = Math.max(0.04, size * 0.10);
      spec.intensity = 2.4;
      break;
    }
  }
}

// Conchoidal cleavage: a brittle surface fails along a few preferred planes, not evenly around a
// circle. These are those planes, authored once so every fracture in the game speaks one dialect.
const CLEAVAGE_ANGLES = Object.freeze([0.0, 1.05, -0.78, 2.44, -2.05, 1.83, -1.42, 2.95]);

/** Shards and plates: real matter. Momentum, tumble, drag and a cooling colour track. */
function poseSolid(spec, ctx) {
  const { row, k, n, radius, serial, beatIndex, nx, nz, tx, tz, normalAngle, outAngle, bodyAngle, reduced, layout } = ctx;
  const j0 = explosionPatternSigned(serial, 'debris', k, beatIndex + 50);
  const j1 = explosionPattern01(serial, 'debris', k, beatIndex + 51);
  const j2 = explosionPatternSigned(serial, 'breakup', k, beatIndex + 52);
  const size = Math.max(0.04, radius * row.size * (0.7 + j1 * 0.6) * (row.spall || 1));
  const speed = row.speed * (0.7 + j1 * 0.6);
  let angle = outAngle + j0 * row.spread;

  spec.length0 = size * (row.primitive === 'plate' ? 2.6 : 1);
  spec.length1 = spec.length0;
  spec.width0 = size * (row.primitive === 'plate' ? 2.0 : 0.55);
  spec.width1 = spec.width0;
  spec.gravity = 0;
  spec.angularVelocity = j2 * (row.primitive === 'plate' ? 2.2 : 8.5);
  spec.pitch = j1 * 2.4;
  spec.pitchVelocity = j0 * (row.primitive === 'plate' ? 1.8 : 6.5);
  spec.roll = j1 * 1.8;
  spec.rollVelocity = j2 * (row.primitive === 'plate' ? 2.6 : 7.2);
  spec.intensity = 1;

  switch (layout) {
    case 'mirrored-lip': {
      // A slam does not spray. The matter leaves late, slowly, mostly sideways, and it is heavy:
      // low speed, high drag, short throw. Mirrored so an unsigned axis stays unbiased.
      const side = (k & 1) ? 1 : -1;
      angle = Math.atan2(tz, tx) + (side < 0 ? Math.PI : 0) + j0 * row.spread;
      spec.x += nx * side * radius * 0.16;
      spec.z += nz * side * radius * 0.16;
      spec.drag = row.drag * 1.5;
      break;
    }
    case 'tangent-skid': {
      const side = (k & 1) ? 1 : -1;
      angle = Math.atan2(tz, tx) + (side < 0 ? Math.PI : 0) + j0 * row.spread;
      break;
    }
    case 'cleavage-fan': {
      // Chips leave on the cleavage planes, not evenly around the contact.
      const plane = CLEAVAGE_ANGLES[(k + beatIndex) % CLEAVAGE_ANGLES.length];
      angle = normalAngle + plane + j0 * 0.22;
      spec.x += Math.cos(angle) * radius * 0.2;
      spec.z += Math.sin(angle) * radius * 0.2;
      break;
    }
    case 'worked-face': {
      // Directed ejecta: chips come OFF the face toward the tool, in two cutting lobes, and the
      // later beat is slower and duller than the first — the face is being worked, not blasted.
      const side = (k & 1) ? 1 : -1;
      angle = normalAngle + side * row.spread * (0.45 + j1 * 0.4);
      spec.x += nx * radius * 0.1;
      spec.z += nz * radius * 0.1;
      spec.drag = row.drag * 1.25;
      break;
    }
    case 'plate-separation': {
      // Structure parting. Each plate sits somewhere along the body axis and moves ACROSS it, so
      // the hull opens into readable sections with lit gaps between them.
      const span = n > 1 ? (k - (n - 1) * 0.5) / Math.max(1, (n - 1) * 0.5) : 0;
      const along = span * radius * (0.35 + j1 * 0.4);
      const side = (k & 1) ? 1 : -1;
      const across = bodyAngle + side * (Math.PI / 2) + j0 * row.spread * 0.4;
      spec.x += Math.cos(bodyAngle) * along + Math.cos(across) * radius * 0.16;
      spec.z += Math.sin(bodyAngle) * along + Math.sin(across) * radius * 0.16;
      spec.y += j2 * radius * 0.12;
      angle = across;
      // Plates keep their span and hold their heading; they part, they do not scatter.
      spec.drag = row.drag * 0.6;
      spec.angularVelocity = j2 * 1.1;
      break;
    }
    case 'reflected-cone':
    default: {
      spec.x += nx * radius * 0.14;
      spec.z += nz * radius * 0.14;
      break;
    }
  }

  spec.vx = Math.cos(angle) * speed;
  spec.vz = Math.sin(angle) * speed;
  spec.vy = (reduced ? 0.4 : 1) * (0.6 + j1 * 1.8);
  spec.angle = angle;
}
