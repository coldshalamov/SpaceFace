// Initial seats for the first Foundry Maw's existing fragments. No live matter is
// moved; the ordinary death ledger spends each original slot once, even if packed.
import { resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { swarmPlacementIsClear } from './swarmSafety.js';

export function seatSwarmMawFragment(state, boss, spec) {
  const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
  if (!finite(boss?.pos) || !finite(spec?.pos) || !finite(spec?.vel)) return null;
  const radius = Math.max(spec.radius || 0, resolvePhysicsBodySpec(spec)?.radius || 0);
  if (!(radius > 0)) return null;
  const dx = spec.pos.x - boss.pos.x, dz = spec.pos.z - boss.pos.z;
  const distance = Math.hypot(dx, dz), bearing = Math.atan2(dz, dx);
  const inherited = finite(boss.vel) ? boss.vel : { x: 0, z: 0 };
  const kick = Math.hypot(spec.vel.x - inherited.x, spec.vel.z - inherited.z);
  function at(angle, distance) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const pos = { x: boss.pos.x + c * distance, z: boss.pos.z + s * distance };
    const vel = { x: inherited.x + c * kick, z: inherited.z + s * kick };
    return swarmPlacementIsClear(state, pos, radius,
      { velocity: vel, horizon: 0.75, clearance: 4 }) ? { pos, vel } : null;
  }
  // Keep an already clear authored seat byte-for-byte. Sequential issuance means
  // earlier siblings are in the real entity store when later seats are checked.
  if (swarmPlacementIsClear(state, spec.pos, radius,
    { velocity: spec.vel, horizon: 0.75, clearance: 4 })) return { pos: spec.pos, vel: spec.vel };
  // Stay at the death site: at most 160WU, no remote replacement tutorial prop.
  // Preserve each slot's inherited motion and outward kick magnitude; no RNG draw.
  for (const ring of [Math.max(distance, 40), 64, 88, 112, 136, 160]) {
    for (let i = 0; i < 24; i++) {
      const turn = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI / 12;
      const seated = at(bearing + turn, ring);
      if (seated) return seated;
    }
  }
  return null;
}
