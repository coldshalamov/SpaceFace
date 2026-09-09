// PQ-134.02 — spawn arcade blades/arcs/shards from a causal family presentation.
// Uses the existing primitive pools only. Deterministic. Does not grow capacity.

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
    life: 0.26,
    angle: baseAngle + patternSigned(mixed, phase, k, 1) * 0.72 + (k - (n - 1) * 0.5) * 0.22,
    spin: patternSigned(mixed, phase, k, 3) * 1.8,
    length0: len, length1: len * 1.32,
    width0: Math.max(0.12, radius * 0.10), width1: Math.max(0.04, radius * 0.04),
  };
  if (layout === 'chevron') {
    const side = k < n * 0.5 ? -1 : 1;
    base.angle = baseAngle + side * 0.55 + patternSigned(mixed, phase, k, 1) * 0.18;
    base.spin = side * 2.4;
    base.life = 0.22;
    return base;
  }
  if (layout === 'axial') {
    const along = (k - (n - 1) * 0.5) * radius * 0.55;
    base.ox = Math.cos(baseAngle) * along;
    base.oz = Math.sin(baseAngle) * along;
    base.angle = baseAngle;
    base.spin = 0.4 * patternSigned(mixed, phase, k, 3);
    base.length0 = radius * 1.1;
    base.length1 = radius * 0.35;
    base.life = 0.18;
    return base;
  }
  if (layout === 'reverse') {
    base.angle = baseAngle + k * (Math.PI / Math.max(1, n));
    base.spin = patternSigned(mixed, phase, k, 3) * 0.6;
    base.length0 = len * 0.45;
    base.length1 = len * 1.15;
    base.life = 0.34;
    return base;
  }
  return base;
}

function arcPose(layout, k, n, ctx) {
  const { baseAngle, mixed, phase, radius, pattern01, patternSigned } = ctx;
  const len = radius * (0.95 + pattern01(mixed, phase, k, 6) * 0.35);
  const base = {
    ox: 0, oy: 0, oz: 0,
    drag: NaN,
    life: 0.32,
    angle: baseAngle + patternSigned(mixed, phase, k, 5) * 0.45,
    spin: patternSigned(mixed, phase, k, 7) * 0.9,
    length0: len, length1: len * 1.40,
    width0: Math.max(0.16, radius * 0.14), width1: Math.max(0.06, radius * 0.05),
  };
  if (layout === 'opposed') {
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
    return base;
  }
  if (layout === 'expand') {
    base.angle = baseAngle + (k - (n - 1) * 0.5) * 0.9;
    base.length0 = radius * 0.4;
    base.length1 = radius * 2.2;
    base.life = 0.55;
    base.spin = 0.08;
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
  } else if (layout === 'reverse') {
    const outer = radius * (0.9 + pattern01(mixed, phase, k, 10) * 0.4);
    ox = Math.cos(a) * outer;
    oz = Math.sin(a) * outer;
    vx = -Math.cos(a) * speed * 0.55;
    vz = -Math.sin(a) * speed * 0.55;
    vy = 0.4;
    life = 0.7;
    drag = 1.1;
  } else if (layout === 'expand') {
    speed *= 0.25;
    vx = tvx + Math.cos(a) * speed;
    vz = tvz + Math.sin(a) * speed;
    vy = 0.6;
    life = 0.8;
    drag = 0.6;
  } else if (layout === 'hop') {
    const along = (k + 0.5) * radius * 0.7;
    ox = Math.cos(baseAngle) * along;
    oz = Math.sin(baseAngle) * along;
    vx = Math.cos(baseAngle) * radius * 1.4;
    vz = Math.sin(baseAngle) * radius * 1.4;
    vy = 1.2;
  }
  if (reduced && layout !== 'planar') {
    vx *= 0.7;
    vz *= 0.7;
  }
  return {
    ox, oy, oz, vx, vy, vz, drag, gravity, life,
    angle: a,
    spin: patternSigned(mixed, phase, k, 13) * 8.5,
    pitch: pattern01(mixed, phase, k, 14) * 2.4,
    pitchSpin: patternSigned(mixed, phase, k, 15) * 6.5,
    roll: pattern01(mixed, phase, k, 16) * 1.8,
    rollSpin: patternSigned(mixed, phase, k, 17) * 7.2,
    size,
  };
}
