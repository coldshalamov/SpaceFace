import { CONTACT_MARK_KINDS } from './contactMarks.js';

/**
 * A player-priority material reaction, not a new physics event or GPU pass.
 * No allocation when rejecting an event. All limits bound the existing HullScorchPool.
 */
export const PLAYER_SPLASH_QUALITY = Object.freeze({
  low: Object.freeze({ capacity: 2, cooldown: 0.28, life: 0.62 }),
  med: Object.freeze({ capacity: 4, cooldown: 0.15, life: 0.85 }),
  high: Object.freeze({ capacity: 6, cooldown: 0.09, life: 0.90 }),
});

const THERMAL = new Set(['thermal-bolt', 'missile', 'torpedo', 'cooker-seam']);
const ELECTRIC = new Set(['disruptor', 'primer-arc']);

export function surfaceResponseKind(variant) {
  if (THERMAL.has(variant)) return CONTACT_MARK_KINDS.thermalSeat;
  if (ELECTRIC.has(variant)) return CONTACT_MARK_KINDS.inductionBranch;
  return CONTACT_MARK_KINDS.mineralSplash;
}

export function planPlayerSurfaceSplash({
  ownerId, playerId, targetType, targetAlive = true, attached, hitShield, visible,
  variant, quality = 'med', now, lastAt, active = 0, targetRadius,
} = {}) {
  if (ownerId == null || playerId == null || ownerId !== playerId
      || targetType !== 'asteroid' || !targetAlive || !attached || hitShield || !visible) return null;
  const q = PLAYER_SPLASH_QUALITY[quality === 'medium' ? 'med' : quality]
    || PLAYER_SPLASH_QUALITY.med;
  if (!Number.isFinite(now) || (Number.isFinite(lastAt) && now >= lastAt && now - lastAt + 1e-9 < q.cooldown)
      || active >= q.capacity) return null;
  const radius = Number.isFinite(targetRadius) && targetRadius > 0 ? targetRadius : 12;
  return { markKind: surfaceResponseKind(variant), width: Math.max(2.4, Math.min(6.2, radius * .27)),
    life: q.life, quality: quality || 'med' };
}
