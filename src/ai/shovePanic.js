// Shove panic — the reaction a shoved crew owes the fight.
//
// A hull the pilot tosses loses its helm for the tumble's law-bounded beat, then today snaps
// back to the exact attack_run/weapons_free it was flying, like nothing happened. This module
// is the missing reaction: a pilot-caused tumble rattles the crew for a short window —
// guns cold, a mayday over the band — so the shove buys real tempo and the caller's authored
// reinforcement package (aiEncounter reads the same stamp) becomes reachable by physical play.
//
// Ownership: tumbleStates stays the ONE writer of tumble physics and its own stamps; this
// module only reads the combat:tumbled announcement and writes the victim's panic fields.
// Deterministic: the window derives from the announcement's own sim-second timestamps; no RNG.
import { barkFor } from '../data/barks.js';
import { hash32 } from '../core/rng.js';

/** Panic outlives the tumble itself: the crew is still gathering its wits once the spin stops. */
export const SHOVE_PANIC_TAIL_S = 2.5;
/** A hull with no authored combat range breaks off to this stand-off while rattled. */
export const SHOVE_PANIC_PREFERRED_RANGE = 620;

/**
 * The victim eligibility of the panic: ordinary armed crews rattle, authored narrative
 * combatants (bosses, aces, fanatics, mission hulls) keep their authored contract — the same
 * exemption shape pirateDisengage's morale layer draws.
 */
function panicEligible(state, victim) {
  if (!victim || victim.alive === false) return false;
  if (victim.type !== 'ship' && victim.type !== 'drone') return false;
  if (victim.id === state.playerId) return false;
  const data = victim.data || {};
  const ai = data.ai || {};
  if (data.isBoss === true || data.encounterBoss === true || data.missionBoss === true
    || data.aceMemory || data.missionTag || data.missionId
    || ai.isBoss === true || ai.fanatic === true || ai.ace === true
    || ai.moraleImmune === true) return false;
  // A crew already fleeing or surrendered owes nobody a mayday — morale owns them.
  if (ai.pirateDisengaged === true || ai.fsm === 'flee' || ai.fsm === 'surrender') return false;
  return true;
}

/** Is the hull's panic window live at sim second `now`? Self-expiring on first stale read. */
export function shovePanicLive(ai, now) {
  const panic = ai && ai.shovePanic;
  if (!panic) return false;
  if (!Number.isFinite(panic.until) || !Number.isFinite(now) || now >= panic.until) {
    if (ai) delete ai.shovePanic;
    return false;
  }
  return true;
}

/**
 * The player-caused tumble of an eligible hull stamps the panic and speaks one mayday.
 * Returns the victim, or null when this tumble is not a rattling one.
 */
export function noteShoveTumble(state, payload, { bus = null, helpers = null } = {}) {
  if (!state || !payload) return null;
  const attackerId = payload.attackerId;
  if (attackerId == null || attackerId !== state.playerId) return null;
  const victim = payload.victimId != null && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(payload.victimId)
    : null;
  if (!panicEligible(state, victim)) return null;
  const data = victim.data || (victim.data = {});
  const ai = data.ai || (data.ai = {});
  const now = Number.isFinite(state.simTime) ? state.simTime
    : (Number.isFinite(state.tick) ? state.tick / 60 : 0);
  const tumbleEnd = Number.isFinite(payload.until) ? payload.until : now;
  ai.shovePanic = { until: tumbleEnd + SHOVE_PANIC_TAIL_S, startedAt: now };
  const factionId = victim.factionId || data.factionId || 'faction_reach';
  const text = barkFor(factionId, 'distress', hash32(state.meta && state.meta.seed || 1, victim.id, 'shove_panic'));
  if (bus && typeof bus.emit === 'function') {
    bus.emit('ai:mayday', {
      entityId: victim.id, factionId, text, t: now, tick: state.tick | 0,
      reason: 'shove_panic',
    });
  }
  const voice = helpers && helpers.voice;
  if (voice && typeof voice.say === 'function') {
    voice.say({
      channel: 'bark', text, kind: 'mayday', ttl: 3,
      id: `shovePanic:${victim.id}:${state.tick | 0}`, factionId,
    });
  }
  return victim;
}

/**
 * The panicked hull's activity record: a short break-off to its own stand-off range.
 * Written once at stamp time by the tumble listener and handed back on expiry by the
 * tacticalAI restore pass — the same stash/handback shape applyEngagementPosture keeps.
 * Returns the activity to write, or null when the hull owes no break (survival orders,
 * authoritative assignments, and an already-panicked record keep their writer).
 */
export function shovePanicBreakActivity(victim) {
  const data = victim && victim.data;
  const ai = data && data.ai;
  if (!ai || !ai.shovePanic || ai.shovePanicBase) return null;
  const current = ai.activity || null;
  if (current && (current.kind === 'flee' || current.kind === 'disengage')) return null;
  const reason = String((current && current.reason) || '');
  if (reason.startsWith('security_response:') || reason.startsWith('wanted_warrant:')) return null;
  if (reason === 'shove_panic') return null;
  return {
    ...(current || {}),
    kind: 'reposition',
    reason: 'shove_panic',
    preferredRange: (current && Number(current.preferredRange) > 0)
      ? Number(current.preferredRange)
      : SHOVE_PANIC_PREFERRED_RANGE,
  };
}
