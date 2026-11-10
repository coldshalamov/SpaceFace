// Public reconstruction fits. Inputs are player samples only: position, velocity, mass,
// temperature-derived age. No incident log, no hypothesis ids.

import { backIntegratePoint, integratePoint } from './physics.js';

function centroidPath(samples) {
  let x = 0;
  let z = 0;
  let vx = 0;
  let vz = 0;
  for (const s of samples) {
    x += s.x;
    z += s.z;
    vx += s.vx;
    vz += s.vz;
  }
  const n = samples.length || 1;
  return { x: x / n, z: z / n, vx: vx / n, vz: vz / n };
}

export function ballisticFit(samples) {
  if (!samples || samples.length < 2) {
    return { model: 'ballistic', residual: Infinity, originT: 0, originX: 0, originZ: 0, momentum: null, momentumPerMass: null, bodies: samples ? samples.length : 0 };
  }
  let best = { residual: Infinity, t: 0, ox: 0, oz: 0 };
  for (let t = -360; t <= 0; t += 0.5) {
    let cx = 0;
    let cz = 0;
    const pts = samples.map((s) => ({ x: s.x + s.vx * t, z: s.z + s.vz * t }));
    for (const p of pts) {
      cx += p.x;
      cz += p.z;
    }
    cx /= pts.length;
    cz /= pts.length;
    let acc = 0;
    for (const p of pts) acc += (p.x - cx) ** 2 + (p.z - cz) ** 2;
    const residual = Math.sqrt(acc / pts.length);
    if (residual < best.residual) best = { residual, t, ox: cx, oz: cz };
  }
  let px = 0;
  let pz = 0;
  let mass = 0;
  let massOk = true;
  for (const s of samples) {
    if (!Number.isFinite(s.mass)) massOk = false;
    else {
      px += s.mass * s.vx;
      pz += s.mass * s.vz;
      mass += s.mass;
    }
  }
  const momentum = massOk ? Math.hypot(px, pz) : null;
  let spreadSpeed = null;
  if (massOk && mass > 0) {
    const cvx = px / mass;
    const cvz = pz / mass;
    let acc = 0;
    for (const s of samples) acc += (s.vx - cvx) ** 2 + (s.vz - cvz) ** 2;
    spreadSpeed = Math.sqrt(acc / samples.length);
  }
  return {
    model: 'ballistic',
    residual: best.residual,
    originT: best.t,
    originX: best.ox,
    originZ: best.oz,
    momentum,
    momentumPerMass: massOk && mass > 0 ? momentum / mass : null,
    spreadSpeed,
    bodies: samples.length,
  };
}

export function closestApproach(a, b) {
  const rx = b.x - a.x;
  const rz = b.z - a.z;
  const rvx = b.vx - a.vx;
  const rvz = b.vz - a.vz;
  const rv2 = rvx * rvx + rvz * rvz;
  let t = 0;
  if (rv2 > 1e-8) t = -(rx * rvx + rz * rvz) / rv2;
  const mx = rx + rvx * t;
  const mz = rz + rvz * t;
  let leadT = t;
  if (leadT < 0) leadT = 0;
  const lx = rx + rvx * leadT;
  const lz = rz + rvz * leadT;
  return {
    miss: Math.hypot(mx, mz),
    tClosest: t,
    leadMiss: Math.hypot(lx, lz),
    leadT,
    relSpeed: Math.hypot(rvx, rvz),
  };
}

export function headingRateFit(samples) {
  const pts = (samples || []).filter((s) => Number.isFinite(s.age) && (s.vx * s.vx + s.vz * s.vz) > 0.25);
  if (pts.length < 4) {
    return { model: 'heading_rate', r2: 0, span: 0, slope: 0, bodies: pts.length };
  }
  const ordered = pts.map((s) => ({ age: s.age, h: Math.atan2(s.vz, s.vx) })).sort((a, b) => a.age - b.age);
  let prev = ordered[0].h;
  const unwrapped = [{ age: ordered[0].age, h: ordered[0].h }];
  for (let i = 1; i < ordered.length; i += 1) {
    let h = ordered[i].h;
    while (h - prev > Math.PI) h -= Math.PI * 2;
    while (prev - h > Math.PI) h += Math.PI * 2;
    unwrapped.push({ age: ordered[i].age, h });
    prev = h;
  }
  const n = unwrapped.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of unwrapped) {
    sx += p.age;
    sy += p.h;
    sxx += p.age * p.age;
    sxy += p.age * p.h;
  }
  const den = n * sxx - sx * sx;
  const slope = Math.abs(den) > 1e-8 ? (n * sxy - sx * sy) / den : 0;
  const intercept = (sy - slope * sx) / n;
  const mean = sy / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of unwrapped) {
    const pred = slope * p.age + intercept;
    ssRes += (p.h - pred) ** 2;
    ssTot += (p.h - mean) ** 2;
  }
  const r2 = ssTot > 1e-6 ? 1 - ssRes / ssTot : 0;
  const span = Math.abs(unwrapped[n - 1].h - unwrapped[0].h);
  return { model: 'heading_rate', r2, span, slope, bodies: n };
}

export function deflagrationFit(samples) {
  const pts = (samples || []).filter((s) => Number.isFinite(s.age));
  if (pts.length < 3) return { model: 'deflagration', monotonic: false, medianGap: 0, bodies: pts.length };
  let mx = 0;
  let mz = 0;
  for (const s of pts) {
    mx += s.x;
    mz += s.z;
  }
  mx /= pts.length;
  mz /= pts.length;
  let xx = 0;
  let xz = 0;
  let zz = 0;
  for (const s of pts) {
    const dx = s.x - mx;
    const dz = s.z - mz;
    xx += dx * dx;
    xz += dx * dz;
    zz += dz * dz;
  }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const scored = pts.map((s) => ({
    u: (s.x - mx) * c + (s.z - mz) * sn,
    age: s.age,
  })).sort((a, b) => a.u - b.u);
  const gaps = [];
  for (let i = 1; i < scored.length; i += 1) gaps.push(scored[i].age - scored[i - 1].age);
  const forward = gaps.every((g) => g < -0.25);
  const backward = gaps.every((g) => g > 0.25);
  const absGaps = gaps.map((g) => Math.abs(g)).sort((a, b) => a - b);
  const medianGap = absGaps[Math.floor(absGaps.length / 2)] || 0;
  return { model: 'deflagration', monotonic: forward || backward, medianGap, bodies: pts.length };
}

export function ejectionFit(pod, fragments) {
  const burst = ballisticFit(fragments);
  if (!pod || !fragments || fragments.length < 2 || !Number.isFinite(burst.originT)) {
    return { model: 'ejection', lead: 0, releaseMiss: Infinity, burstMiss: Infinity, bodies: fragments ? fragments.length : 0 };
  }
  const px = pod.x + pod.vx * burst.originT;
  const pz = pod.z + pod.vz * burst.originT;
  const burstMiss = Math.hypot(px - burst.originX, pz - burst.originZ);
  const c = centroidPath(fragments);
  let best = { miss: Infinity, t: burst.originT };
  const start = Math.max(-360, burst.originT - 140);
  for (let t = start; t <= burst.originT + 0.01; t += 0.5) {
    const fx = c.x + c.vx * t;
    const fz = c.z + c.vz * t;
    const qx = pod.x + pod.vx * t;
    const qz = pod.z + pod.vz * t;
    const d = Math.hypot(qx - fx, qz - fz);
    if (d < best.miss) best = { miss: d, t };
  }
  return {
    model: 'ejection',
    lead: burst.originT - best.t,
    releaseMiss: best.miss,
    burstMiss,
    bodies: fragments.length,
  };
}

export function pointMassFit(samples, gravity) {
  const pts = (samples || []).filter((s) => Number.isFinite(s.age) && s.age > 0.5);
  if (!gravity || !gravity.mu || pts.length < 4) {
    return { model: 'point_mass', residual: Infinity, ballisticResidual: 0, bodies: pts.length, asymptote: 0 };
  }
  const states = pts.map((s) => ({
    age: s.age,
    shed: backIntegratePoint(s, s.age, gravity),
    raw: s,
  })).sort((a, b) => b.age - a.age);
  const origin = states[0];
  let residual = 0;
  let ballisticResidual = 0;
  const rest = states.slice(1);
  for (const other of rest) {
    const forwardT = origin.age - other.age;
    const fwd = integratePoint(origin.shed, forwardT, gravity);
    const straight = integratePoint(origin.shed, forwardT, null);
    residual += (fwd.x - other.shed.x) ** 2 + (fwd.z - other.shed.z) ** 2;
    ballisticResidual += (straight.x - other.shed.x) ** 2 + (straight.z - other.shed.z) ** 2;
  }
  const n = rest.length || 1;
  const last = states[states.length - 1].raw;
  return {
    model: 'point_mass',
    residual: Math.sqrt(residual / n),
    ballisticResidual: Math.sqrt(ballisticResidual / n),
    bodies: pts.length,
    asymptote: Math.atan2(last.vz, last.vx),
  };
}

export function mirrorFit(fragment, plate) {
  if (!fragment || !plate || !fragment.shooter) {
    return { model: 'mirror', mirrorMiss: Infinity, directMiss: Infinity, bodies: 0 };
  }
  const nlen = Math.hypot(plate.nx, plate.nz) || 1;
  const nnx = plate.nx / nlen;
  const nnz = plate.nz / nlen;
  const vn = fragment.vx * nnx + fragment.vz * nnz;
  let mirrorMiss = Infinity;
  if (Math.abs(vn) > 1e-4) {
    const relx = plate.x - fragment.x;
    const relz = plate.z - fragment.z;
    const t = (relx * nnx + relz * nnz) / vn;
    if (t < -0.05) {
      const hx = fragment.x + fragment.vx * t;
      const hz = fragment.z + fragment.vz * t;
      const dot = fragment.vx * nnx + fragment.vz * nnz;
      const ivx = fragment.vx - 2 * dot * nnx;
      const ivz = fragment.vz - 2 * dot * nnz;
      const sx = fragment.shooter.x + fragment.shooter.vx * t;
      const sz = fragment.shooter.z + fragment.shooter.vz * t;
      const il = Math.hypot(ivx, ivz) || 1;
      const along = ((sx - hx) * ivx + (sz - hz) * ivz) / (il * il);
      const px = hx + ivx * along;
      const pz = hz + ivz * along;
      mirrorMiss = Math.hypot(sx - px, sz - pz);
    }
  }
  const direct = closestApproach(fragment, fragment.shooter);
  return { model: 'mirror', mirrorMiss, directMiss: direct.miss, bodies: 1 };
}

export function tangentScore(velocity, from, to) {
  const rx = to.x - from.x;
  const rz = to.z - from.z;
  const rlen = Math.hypot(rx, rz) || 1;
  const vlen = Math.hypot(velocity.vx, velocity.vz) || 1;
  const radial = Math.abs((velocity.vx * rx + velocity.vz * rz) / (vlen * rlen));
  return 1 - radial;
}
