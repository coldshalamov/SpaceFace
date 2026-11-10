// Fixed-route observer. Collision receipts are facts; the forward capsule is a conservative
// obstruction estimate, not a second collision solver or a performance measurement.
export const FLIGHT_PLANE_ROUTE = 'helios-spawn/ceres-gate/ceres-station-v1';

function solid(entity) {
  return entity && entity.alive !== false && entity.collides === true && entity.radius > 0
    && !['fx', 'projectile', 'pickup', 'beam', 'gate'].includes(entity.type);
}

function incidental(entity, state) {
  if (!solid(entity) || entity.id === state.playerId) return false;
  if (entity.id === state.player?.targetId) return false;
  // A deliberate line contact belongs to the player's job, not ambient clutter.
  if (Object.values(state.combat?.attachments?.byId || {}).some(a => a.state !== 'broken'
    && a.ownerId === state.playerId && a.targetId === entity.id)) return false;
  return true;
}

export function createFlightPlaneObserver(state, bus) {
  let contacts = 0, blockedTicks = 0, samples = 0;
  const lastContacts = new Map(), blockers = new Map();
  const off = bus.on('physics:impact', event => {
    if (event.aId !== state.playerId && event.bId !== state.playerId) return;
    const id = event.aId === state.playerId ? event.bId : event.aId;
    if (!incidental(state.entities.get(id), state)) return;
    const tick = state.tick;
    if (tick - (lastContacts.get(id) ?? -Infinity) > 30) contacts++;
    lastContacts.set(id, tick);
  });
  return {
    sample(target) {
      const player = state.entities.get(state.playerId);
      if (!player?.alive || state.mode !== 'flight' || state.jump?.state === 'JUMPING') return;
      const dx = target.x - player.pos.x, dz = target.z - player.pos.z;
      const length = Math.hypot(dx, dz);
      if (!(length > 0)) return;
      samples++;
      const lookAhead = Math.min(length, Math.max(60, Math.hypot(player.vel.x, player.vel.z) * 2));
      let blocked = false;
      for (const entity of state.entityList) {
        if (!incidental(entity, state) || entity.type === 'station') continue;
        const ex = entity.pos.x - player.pos.x, ez = entity.pos.z - player.pos.z;
        const along = ex * dx / length + ez * dz / length;
        if (along < 0 || along > lookAhead) continue;
        const across = Math.abs(ex * dz / length - ez * dx / length);
        if (across >= entity.radius + player.radius) continue;
        blocked = true;
        blockers.set(entity.id, (blockers.get(entity.id) || 0) + 1);
      }
      if (blocked) blockedTicks++;
    },
    finish({ reached, seed, ticks, inputHash }) {
      off();
      const minutes = samples / 3600;
      return { schema: 'spaceface.cleanFlightPlane.v1', route: FLIGHT_PLANE_ROUTE,
        seed, ticks, inputHash, reached, samples, contacts, blockedTicks,
        contactsPerMinute: minutes ? contacts / minutes : null,
        obstructionSecondsPerMinute: minutes ? blockedTicks / 60 / minutes : null,
        blockers: [...blockers].sort((a, b) => b[1] - a[1]).slice(0, 12),
        evidence: 'production-simulation-route; conservative radius capsule; no rendered/performance claim' };
    },
  };
}

export function compareFlightPlane(before, after) {
  const reasons = [];
  for (const key of ['schema', 'route', 'seed', 'ticks']) if (before[key] !== after[key]) reasons.push(`different ${key}`);
  if (!before.reached || !after.reached || !before.samples || !after.samples) reasons.push('incomplete route');
  for (const key of ['contactsPerMinute', 'obstructionSecondsPerMinute']) {
    if (!Number.isFinite(before[key]) || !Number.isFinite(after[key])) reasons.push(`unmeasured ${key}`);
    else if (after[key] > before[key] + 1e-9) reasons.push(`increased ${key}`);
  }
  return { ok: reasons.length === 0, reasons };
}
