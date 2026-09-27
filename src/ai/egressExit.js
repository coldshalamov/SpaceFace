// egressExit.js — Egress exit bound (PQ-206.02).
//
// A hull under a live flee order that has stacked EGRESS_DISTANCE_WU of separation from the
// player has left the fight. It keeps burning off-field for EGRESS_FADE_S, then the engine's
// ordinary despawnAt sweep retires it. If the pilot closes back inside the bound, or the flee
// order ends before the fade fires, this system's stamp is released and the authored fight
// resumes — the exit only lands for an escape the pilot could not answer.
//
// This bounds the degenerate flee cell: scattered, disengaged, pacing-pinned, and surrendered-
// escape flee orders leave the hull alive and fleeing forever, kiting a pursuing player past
// 10k WU with the fight never resolving. Authored flee survives — the order, the steering,
// and the combat-outcome receipt are unchanged; only the unbounded lifetime is closed.

import { indexedShipLikeScan } from '../world/livingWorldViews.js';

// combatDoctrine.js RUN_EGRESS_DISTANCE scale: a hull this far out has broken contact on the
// engagement envelope. The fade keeps it burning off-camera before the sweep retires it.
export const EGRESS_DISTANCE_WU = 960;
export const EGRESS_FADE_S = 12;
export const EGRESS_SCAN_TICKS = 15;

export function fleeOrderActive(ai) {
  if (!ai) return false;
  if (ai.forceFlee === true || ai.fsm === 'flee') return true;
  const kind = ai.activity && ai.activity.kind;
  return kind === 'flee' || kind === 'disengage';
}

function encounterOwned(state, entityId) {
  const live = state && state.encounterDirector && state.encounterDirector.live;
  if (!live || typeof live !== 'object') return false;
  for (const id of Object.keys(live)) {
    const l = live[id];
    if (l && l.phase !== 'done' && Array.isArray(l.ids) && l.ids.includes(entityId)) return true;
  }
  return false;
}

export function stepEgressExits(state, shipLikeList = null, bus = null) {
  if (!state || state.tick % EGRESS_SCAN_TICKS !== 0) return;
  if (state.ui && state.ui.docked === true) return;
  const entities = state.entities;
  const player = entities && typeof entities.get === 'function' && entities.get(state.playerId);
  if (!player || player.alive === false || !player.pos) return;
  const now = Number(state.simTime) || 0;
  const bound2 = EGRESS_DISTANCE_WU * EGRESS_DISTANCE_WU;
  const list = shipLikeList || indexedShipLikeScan(state);
  for (const entity of list) {
    if (!entity || entity.id === state.playerId || entity.alive === false) continue;
    if (entity.type !== 'ship' && entity.type !== 'drone') continue;
    const data = entity.data || (entity.data = {});
    const ai = data.ai || {};
    const ours = Number.isFinite(data._egressExitAt) && data.despawnAt === data._egressExitAt;
    const dx = entity.pos ? entity.pos.x - player.pos.x : 0;
    const dz = entity.pos ? entity.pos.z - player.pos.z : 0;
    const separated = !!entity.pos && dx * dx + dz * dz >= bound2;
    if (!fleeOrderActive(ai) || !separated) {
      // Re-closed inside the bound or the order ended — a premature stamp releases; stamps
      // another owner placed are never touched.
      if (ours) { delete data.despawnAt; delete data._egressExitAt; }
      continue;
    }
    if (ours || data.despawnAt != null) continue;
    if (ai.moraleImmune === true) continue;
    // Arena/survival cells are finite: a retreating cell must stay reachable or a round strands.
    if (data.runCohort === 'survival') continue;
    // Player-team hulls belong to wingmen and escort systems, not this bound.
    if (entity.team != null && player.team != null && entity.team === player.team) continue;
    // Encounter scripts own their actors' exits (staggered despawnAll / +45 s stragglers).
    if (data.encounter || encounterOwned(state, entity.id)) continue;
    data.despawnAt = now + EGRESS_FADE_S;
    data._egressExitAt = data.despawnAt;
    if (bus && typeof bus.emit === 'function') {
      bus.emit('ai:egressExit', {
        entityId: entity.id,
        reason: ai.fsm === 'flee' ? 'fsm:flee' : (ai.forceFlee === true ? 'forceFlee' : 'activity'),
        factionId: entity.factionId || data.factionId || null,
        separation: Math.round(Math.sqrt(dx * dx + dz * dz)),
        t: now,
      });
    }
  }
}
