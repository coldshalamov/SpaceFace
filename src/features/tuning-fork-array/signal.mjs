export const TAU = Math.PI * 2;
export const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export const wrap = n => Math.atan2(Math.sin(n), Math.cos(n));
export const finitePose = p => !!p && ['x', 'z', 'rot'].every(k => Number.isFinite(p[k]));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Weighted intersection of the three physical receiving axes, with a conditioning test.
 * A near-collinear array cannot manufacture a fix from a singular matrix. Constant O(3).
 */
export function solveSignal(def, poses, emitter, simTime, polarities = [1, 1, 1]) {
  if (!finitePose(emitter) || poses.length !== 3 || !Number.isFinite(simTime)) return empty();
  let xx = 0, xz = 0, zz = 0, bx = 0, bz = 0, real = 0, imag = 0;
  const rows = poses.map((p, i) => {
    if (!finitePose(p)) return { slot: i, present: false, amplitude: 0 };
    const range = distance(p, emitter);
    const bearing = Math.atan2(emitter.z - p.z, emitter.x - p.x);
    const headingError = wrap(bearing - p.rot);
    const rangeError = range - def.buoys[i].radius;
    const aim = Math.max(0, Math.cos(headingError)) ** 2;
    const envelope = Math.exp(-.5 * (rangeError / def.bandWidth) ** 2);
    const amplitude = aim * envelope;
    const phase = TAU * rangeError / def.wavelength + (polarities[i] === -1 ? Math.PI : 0);
    real += amplitude * Math.cos(phase); imag += amplitude * Math.sin(phase);
    const nx = -Math.sin(p.rot), nz = Math.cos(p.rot), weight = Math.max(.01, amplitude);
    const dot = nx * p.x + nz * p.z;
    xx += weight * nx * nx; xz += weight * nx * nz; zz += weight * nz * nz;
    bx += weight * nx * dot; bz += weight * nz * dot;
    return { slot: i, present: true, range, bearing, headingError, rangeError, phase, amplitude,
      polarity: polarities[i] === -1 ? -1 : 1, backwards: Math.abs(headingError) > Math.PI / 2 };
  });
  const determinant = xx * zz - xz * xz;
  const conditioning = determinant / Math.max(1e-9, (xx + zz) ** 2);
  const area = poses.every(finitePose) ? Math.abs((poses[1].x - poses[0].x) * (poses[2].z - poses[0].z)
    - (poses[1].z - poses[0].z) * (poses[2].x - poses[0].x)) / 2 : 0;
  const estimate = conditioning > .025 && area > 900
    ? { x: (bx * zz - bz * xz) / determinant, z: (bz * xx - bx * xz) / determinant } : null;
  const uncertainty = estimate ? distance(estimate, emitter) : null;
  const coherence = Math.hypot(real, imag) / 3;
  const minimum = Math.min(...rows.map(r => r.amplitude));
  const squall = ((simTime % def.squallPeriod) + def.squallPeriod) % def.squallPeriod < def.squallDuration;
  const pressure = squall ? .12 : 0;
  const quality = clamp(Math.min(coherence, minimum + .12) - pressure);
  const valid = rows.every(r => r.present) && !!estimate && uncertainty <= 35 && quality >= def.fixThreshold;
  return { rows, quality, coherence, conditioning, area, estimate, uncertainty, squall, pressure, valid };
}
function empty() { return { rows: [], quality: 0, coherence: 0, conditioning: 0, area: 0,
  estimate: null, uncertainty: null, squall: false, pressure: 0, valid: false }; }
