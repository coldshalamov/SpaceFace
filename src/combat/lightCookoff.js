// Small death burst for a light hull inside a survival run.
// One hop: the blast hurts an adjacent fighter and does not cook the room.
// Primed sympathetic chains stay on the impulse-charge owner.

export const LIGHT_COOKOFF = Object.freeze({
  massAtMost: 24,
  radius: 36,
  damage: 14,
  impulse: 160,
});

export function lightCookoffEligible(state, victim) {
  const run = state && state.run;
  if (!run || run.kind !== 'survival') return false;
  if (!victim || (victim.type !== 'ship' && victim.type !== 'drone')) return false;
  const data = victim.data || {};
  if (data.runCohort !== 'survival') return false;
  if (data.shipClass && data.shipClass !== 'fighter') return false;
  const mass = Number(victim.mass);
  if (!Number.isFinite(mass) || mass <= 0 || mass > LIGHT_COOKOFF.massAtMost) return false;
  return true;
}

/**
 * Pure neighbor list. `neighbors` are live bodies with pos. The dead hull is excluded.
 * The player is excluded so a cookoff never knocks the pilot.
 */
export function lightCookoffHits(origin, neighbors, { playerId = null } = {}) {
  const pos = origin && origin.pos;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return [];
  const radius = LIGHT_COOKOFF.radius;
  const out = [];
  const list = Array.isArray(neighbors) ? neighbors : [];
  for (let i = 0; i < list.length; i++) {
    const ent = list[i];
    if (!ent || ent.alive === false || !ent.pos) continue;
    if (origin && ent.id === origin.id) continue;
    if (playerId != null && ent.id === playerId) continue;
    if (ent.type !== 'ship' && ent.type !== 'drone') continue;
    const dx = ent.pos.x - pos.x;
    const dz = ent.pos.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (!(dist > 0) || dist > radius) continue;
    const falloff = 1 - dist / radius;
    const len = dist;
    out.push({
      id: ent.id,
      damage: LIGHT_COOKOFF.damage * falloff,
      impulse: LIGHT_COOKOFF.impulse * falloff,
      dirX: dx / len,
      dirZ: dz / len,
      dist,
    });
  }
  return out;
}
