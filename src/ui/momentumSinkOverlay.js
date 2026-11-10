import {
  GRAVITY_MARK_STATUS_ID,
  MOMENTUM_SINK_STATUS_ID,
} from '../data/combatDefs.js';

export const MAX_MOMENTUM_SINK_OVERLAYS = 6;

/** Collect both PQ-026 target states in one retained HUD traversal. Gravity marks stay
 *  attackerId-authored; momentum sinks report every live frame — the overlay attributes. */
export function fillActiveMassCouplingTargets(
  state,
  attackerId,
  gravityOut,
  momentumOut,
  gravityLimit,
  momentumLimit,
) {
  const gravity = Array.isArray(gravityOut) ? gravityOut : [];
  const momentum = Array.isArray(momentumOut) ? momentumOut : [];
  gravity.length = 0;
  momentum.length = 0;
  const runtimes = state && state.combat && state.combat.entities;
  const getEntity = state && state.entities && typeof state.entities.get === 'function'
    ? (id) => state.entities.get(id) || state.entities.get(Number(id))
    : null;
  if (!runtimes || !getEntity || attackerId == null) return 0;
  const tick = Number.isInteger(state.tick) ? state.tick : 0;
  const gravityMax = Math.max(0, Math.floor(Number(gravityLimit) || 0));
  const momentumMax = Math.max(0, Math.floor(Number(momentumLimit) || 0));
  // The pilot's own hull outranks the pool: now that foreign hauls are scanned too, a field of
  // third-party sinks must not crowd the one marker that reads INBOUND on your own frame.
  const playerRuntime = runtimes[String(attackerId)];
  const playerEntity = getEntity(String(attackerId));
  if (momentumMax > 0 && playerEntity && playerEntity.alive !== false
    && playerRuntime && playerRuntime.statuses
    && activeStatus(playerRuntime.statuses[MOMENTUM_SINK_STATUS_ID], tick)) {
    momentum.push(playerEntity);
  }
  for (const id in runtimes) {
    if (gravity.length >= gravityMax && momentum.length >= momentumMax) break;
    const runtime = runtimes[id];
    if (!runtime || !runtime.statuses) continue;
    const entity = getEntity(id);
    if (!entity || entity.alive === false) continue;
    const gravityMark = runtime.statuses[GRAVITY_MARK_STATUS_ID];
    if (gravity.length < gravityMax && authoredActive(gravityMark, attackerId, tick)) gravity.push(entity);
    const momentumSink = runtime.statuses[MOMENTUM_SINK_STATUS_ID];
    // Every live sink earns a marker — the pilot's own setup work and a hostile haul alike.
    // The HUD attributes the frame owner (momentumSinkAttribution) so the two read differently.
    if (momentum.length < momentumMax && entity !== playerEntity
      && activeStatus(momentumSink, tick)) momentum.push(entity);
  }
  return gravity.length + momentum.length;
}

function authoredActive(status, attackerId, tick) {
  return !!status && status.expiresTick > tick && String(status.attackerId) === String(attackerId);
}

function activeStatus(status, tick) {
  return !!status && status.expiresTick > tick;
}

/**
 * Attribute a live sink to its frame owner. The pilot's own setup work still reads
 * YOUR FRAME; anything else is a hostile haul — the Kraken's wake trawl writes
 * attackerId=boss.id onto the player's hull — labelled with the attacker's scan name when
 * the hull can still be resolved, else a generic INBOUND. Returns the hostile flag with the
 * label so the marker can also recolour: shape carries the verdict, colour reinforces.
 */
export function momentumSinkAttribution(state, status, playerId) {
  if (!status || String(status.attackerId) === String(playerId)) {
    return { hostile: false, label: 'YOUR FRAME' };
  }
  const attacker = status.attackerId != null && state && state.entities
    && typeof state.entities.get === 'function'
    ? state.entities.get(status.attackerId) || state.entities.get(Number(status.attackerId))
    : null;
  const data = attacker && attacker.data;
  const name = (data && (data.scanLabel || data.callsign || data.name))
    || (attacker && attacker.name);
  return { hostile: true, label: name ? String(name).toUpperCase() : 'INBOUND' };
}
