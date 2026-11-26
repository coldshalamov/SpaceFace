// The one door plant scripts have onto the player's hull (R23): a force with a named
// provenance, through the SG-02 command membrane, inside the player-external response
// budget. Plants never write `player.vel` directly — the solver owns the mirror, and a
// pull with no visible prop behind it is deleted, not routed.
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

/**
 * Queue a delta-V on the player's hull as a mass-scaled membrane impulse.
 * `continuous: true` marks per-tick/batched pulls so the response budget treats them
 * as acceleration, not as one big hit.
 */
export function queuePlayerImpulse(state, player, dvx, dvz, provenance, opts = {}) {
  if (!player || !Number.isFinite(dvx) || !Number.isFinite(dvz)) return false;
  const mass = Number(player.physicsBody?.mass) || Number(player.mass) || 1;
  const evidence = {
    externalEffect: true,
    isPlayerTarget: true,
    tick: state?.tick,
    provenance,
  };
  if (opts.continuous) {
    evidence.continuous = true;
    if (Number.isFinite(opts.dt) && opts.dt > 0) evidence.dt = opts.dt;
  }
  return queuePhysicsImpulse(player, { x: dvx * mass, y: 0, z: dvz * mass }, evidence);
}
