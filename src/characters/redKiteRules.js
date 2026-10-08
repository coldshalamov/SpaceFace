import { RED_KITE_START, RED_KITE_GATES } from '../data/redKite.js';

export function redKiteGateFrame(index) {
  const start = index === 0 ? RED_KITE_START : RED_KITE_GATES[index - 1]?.pos, end = RED_KITE_GATES[index]?.pos;
  if (!start || !end) return null;
  const dx = end.x - start.x, dz = end.z - start.z, len = Math.hypot(dx, dz);
  return { pos: end, nx: dx / len, nz: dz / len };
}
// A forward plane crossing through the locked sensor aperture. Occupancy alone never scores.
export function redKiteGateCrossing(from, to, index, radius) {
  const gate = redKiteGateFrame(index);
  if (!gate || !from || !to || ![from.x, from.z, to.x, to.z].every(Number.isFinite)) return false;
  const before = (from.x - gate.pos.x) * gate.nx + (from.z - gate.pos.z) * gate.nz;
  const after = (to.x - gate.pos.x) * gate.nx + (to.z - gate.pos.z) * gate.nz;
  if (!(before <= 0 && after > 0 && after - before >= 0.02)) return false;
  const t = -before / (after - before);
  const x = from.x + (to.x - from.x) * t - gate.pos.x, z = from.z + (to.z - from.z) * t - gate.pos.z;
  return Math.abs(x * -gate.nz + z * gate.nx) <= radius;
}
export function redKiteSegmentDistance(point, from, to) {
  const dx = to.x - from.x, dz = to.z - from.z, den = dx * dx + dz * dz;
  const t = den ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / den)) : 0;
  return Math.hypot(point.x - from.x - dx * t, point.z - from.z - dz * t);
}
export function redKiteCourseObstruction(entities, excludedIds, radius) {
  for (const e of entities || []) {
    if (!e?.alive || !e.pos || excludedIds.has(e.id) || e.collides === false || e.physicsBody === false
      || e.physicsBody?.sensor || e.type === 'projectile' || !(e.mass >= 180 || e.type === 'station' || e.type === 'asteroid')) continue;
    for (let i = 0; i < RED_KITE_GATES.length; i++) {
      const from = i === 0 ? RED_KITE_START : RED_KITE_GATES[i - 1].pos;
      if (redKiteSegmentDistance(e.pos, from, RED_KITE_GATES[i].pos) < radius + (e.radius || 0)) return e;
    }
  }
  return null;
}
