// Shared deterministic intercept solver for weapon fire and presentation.
export function solveLeadAngle(shooter, tgt, projSpeed) {
  const sp = (shooter && shooter.pos) || { x: 0, z: 0 };
  const sv = (shooter && shooter.vel) || { x: 0, z: 0 };
  const tp = (tgt && tgt.pos) || { x: 0, z: 0 };
  const tv = (tgt && tgt.vel) || { x: 0, z: 0 };
  const px = tp.x - sp.x, pz = tp.z - sp.z;
  if (!Number.isFinite(projSpeed)) return Math.atan2(pz, px);
  const rvx = tv.x - sv.x, rvz = tv.z - sv.z;
  const ps = Math.max(1, Number.isFinite(projSpeed) ? projSpeed : 1);
  const a = rvx * rvx + rvz * rvz - ps * ps;
  const b = 2 * (px * rvx + pz * rvz);
  const c = px * px + pz * pz;
  let t = 0;
  if (c > 1e-9) {
    if (Math.abs(a) < 1e-9) {
      const linearT = Math.abs(b) > 1e-9 ? -c / b : -1;
      if (linearT > 0) t = linearT;
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const root = Math.sqrt(disc);
        const t0 = (-b - root) / (2 * a);
        const t1 = (-b + root) / (2 * a);
        if (t0 > 0 && t1 > 0) t = Math.min(t0, t1);
        else if (t0 > 0) t = t0;
        else if (t1 > 0) t = t1;
      }
    }
  }
  const aimx = px + tv.x * t;
  const aimz = pz + tv.z * t;
  return Math.atan2(aimz, aimx);
}
