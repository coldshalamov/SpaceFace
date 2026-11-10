// Pure warning policy, shared with the fixed-step tactical owner; no renderer dependencies.
import { incomingBodyThreatFor } from '../ai/reflexes.js';

export const INCOMING_MASS_CUE_KIND = 'engine_flare';
export const INCOMING_MASS_CUE_TICKS = 24;

export function selectIncomingMassCue(player, candidates) {
  const threat = incomingBodyThreatFor(player, candidates);
  if (!threat) return null;
  const body = candidates.find((c) => c.id === threat.bodyId);
  const dx = body.pos.x - player.pos.x, dz = body.pos.z - player.pos.z;
  const distance = Math.hypot(dx, dz);
  return { bodyId: threat.bodyId, eta: threat.eta,
    direction: { x: dx / distance, z: dz / distance } };
}
