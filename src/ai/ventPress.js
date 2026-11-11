// Vent press — the crew across from you reads your guns going cold.
//
// The pilot's forced heat vent (weapons.js `_beginVent`, the `weapons:vent` start receipt) locks
// every mount for the vent window while the hull glows and dumps heat. Until now no hostile read
// it: a raider holding a 600 WU stand-off kept holding it while your guns were cooked, so the
// overheat cost nothing but time. This module is the missing read: the nearest crews already
// fighting the pilot tighten their engagement band for the vent window plus a short tail, and
// the nearest of them calls it over the band — the overheat costs tempo, and the next volley
// meets them closer.
//
// Ownership: weapons.js stays the ONE writer of the vent; this module only reads the start
// receipt and writes the presser's own ai fields (stamp + stash/handback), the shovePanic shape.
// combatDoctrine's snapshot reads the stamped activity reason to tighten the doctrine's own band.
// Deterministic: the window derives from the receipt's sim-second stamps; the line index hashes
// the seed and the hull; no RNG draw, no wall time. Bounded: one scan per vent receipt, never
// per tick, and at most VENT_PRESS_MAX_PRESSERS hulls are stamped.
import { ventPressBarkFor } from '../data/barks.js';
import { hash32 } from '../core/rng.js';
import { shovePanicLive } from './shovePanic.js';

export const VENT_PRESS_REASON = 'vent_press';
/** Only crews close enough to see the vent glow read it. */
export const VENT_PRESS_RADIUS_WU = 1500;
/** The push outlives the vent by a beat: the crew is already committed when the guns relight. */
export const VENT_PRESS_TAIL_S = 0.75;
/** At most this many hulls press one vent — a wing pushes, not the whole sector. */
export const VENT_PRESS_MAX_PRESSERS = 3;
/** The engagement band shrinks to this share of its authored value, floored at the attack-run minimum. */
export const VENT_PRESS_RANGE_SCALE = 0.55;
export const VENT_PRESS_RANGE_FLOOR = 140;
/** A hull with no authored band presses from this assumed stand-off. */
export const VENT_PRESS_DEFAULT_RANGE = 360;
/** The band hears one vent call per this many sim seconds; the push itself never waits. */
export const VENT_PRESS_CALL_COOLDOWN_S = 18;

/** The pressed band for an authored band: tighter, never under the floor, never wider. */
export function ventPressRange(range) {
  const r = Number(range);
  if (!Number.isFinite(r) || r <= 0) return VENT_PRESS_RANGE_FLOOR;
  if (r <= VENT_PRESS_RANGE_FLOOR) return r;
  return Math.max(VENT_PRESS_RANGE_FLOOR, Math.round(r * VENT_PRESS_RANGE_SCALE));
}

/** Is the hull's press window live at sim second `now`? Self-expiring on first stale read. */
export function ventPressLive(ai, now) {
  const press = ai && ai.ventPress;
  if (!press) return false;
  if (!Number.isFinite(press.until) || !Number.isFinite(now) || now >= press.until) {
    if (ai) delete ai.ventPress;
    return false;
  }
  return true;
}

function activityReason(activity) {
  return String((activity && activity.reason) || '');
}

/**
 * Who presses: an ordinary armed crew already fighting the pilot. Authored narrative combatants
 * (bosses, aces, fanatics, mission hulls) keep their authored contract — shovePanic's exemption
 * shape — and a rattled, fleeing, surrendered or law-assigned hull owes the vent nothing.
 */
function pressEligible(victim, playerId, now) {
  if (!victim || victim.alive === false || victim.id === playerId) return false;
  if (victim.type !== 'ship' && victim.type !== 'drone') return false;
  const data = victim.data || {};
  const ai = data.ai || {};
  if (data.isBoss === true || data.encounterBoss === true || data.missionBoss === true
    || data.aceMemory || data.missionTag || data.missionId
    || ai.isBoss === true || ai.fanatic === true || ai.ace === true
    || ai.moraleImmune === true) return false;
  if (ai.pirateDisengaged === true || ai.fsm === 'flee' || ai.fsm === 'surrender') return false;
  if (ai.roe === 'hold_fire') return false;
  if (ai.shovePanicBase || shovePanicLive(ai, now)) return false;
  const current = ai.activity || null;
  if (current && (current.kind === 'flee' || current.kind === 'disengage')) return false;
  const reason = activityReason(current);
  if (reason.startsWith('security_response:') || reason.startsWith('wanted_warrant:')) return false;
  const combatTarget = data.combat && data.combat.targetId;
  const activityTarget = current && current.targetId;
  return combatTarget === playerId || activityTarget === playerId;
}

/** The pressed activity: the hull's own attack run on the pilot, band tightened. */
export function ventPressActivity(victim, playerId) {
  const current = (victim && victim.data && victim.data.ai && victim.data.ai.activity) || null;
  const authored = current && Number(current.preferredRange) > 0
    ? Number(current.preferredRange) : VENT_PRESS_DEFAULT_RANGE;
  return {
    ...(current || {}),
    kind: 'attack_run',
    reason: VENT_PRESS_REASON,
    targetId: playerId,
    preferredRange: ventPressRange(authored),
  };
}

/**
 * The pilot's vent start stamps up to VENT_PRESS_MAX_PRESSERS engaged crews (nearest first, id
 * breaking ties) and the nearest calls it once per cooldown. `candidates` is the caller's
 * ship-like walk; `skip(e)` lets the caller veto hulls another owner drives; `isHostile(e)` is the
 * caller's hostility law. `runtime` is the caller's transient record ({ lastCallAt }), never saved.
 * Returns the stamped hulls (empty when the vent is not the pilot's or nobody is close).
 */
export function noteVentPress(state, payload, {
  candidates = [], isHostile = null, skip = null, bus = null, helpers = null, runtime = null,
} = {}) {
  if (!state || !payload || payload.phase !== 'start') return [];
  const playerId = state.playerId;
  if (playerId == null || payload.ownerId !== playerId) return [];
  if (state.mode != null && state.mode !== 'flight') return [];
  const player = state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(playerId) : null;
  if (!player || player.alive === false || !player.pos) return [];
  const now = Number.isFinite(state.simTime) ? state.simTime
    : (Number.isFinite(state.tick) ? state.tick / 60 : 0);
  const ventEnd = Number.isFinite(payload.until) && payload.until > now ? payload.until : now;
  const until = ventEnd + VENT_PRESS_TAIL_S;
  const r2max = VENT_PRESS_RADIUS_WU * VENT_PRESS_RADIUS_WU;
  const picked = [];
  for (const e of candidates) {
    if (!e || !e.pos || !pressEligible(e, playerId, now)) continue;
    if (typeof isHostile === 'function' && !isHostile(e)) continue;
    if (typeof skip === 'function' && skip(e)) continue;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > r2max) continue;
    picked.push({ e, d2 });
  }
  picked.sort((a, b) => a.d2 - b.d2 || String(a.e.id).localeCompare(String(b.e.id)));
  const pressers = picked.slice(0, VENT_PRESS_MAX_PRESSERS).map((row) => row.e);
  for (const e of pressers) {
    const ai = e.data.ai || (e.data.ai = {});
    ai.ventPress = { until, startedAt: now };
    // A re-vent inside a live press only extends the window; the stash still holds the
    // authored record, so the handback stays exact.
    if (activityReason(ai.activity) === VENT_PRESS_REASON) continue;
    ai.ventPressBase = ai.activity || null;
    ai.activity = ventPressActivity(e, playerId);
  }
  if (!pressers.length) return pressers;
  const speaker = pressers[0];
  const factionId = speaker.factionId || (speaker.data && speaker.data.factionId) || 'faction_reach';
  const rt = runtime || {};
  const last = Number(rt.lastCallAt);
  const quiet = !Number.isFinite(last) || now < last || now - last >= VENT_PRESS_CALL_COOLDOWN_S;
  const text = quiet
    ? ventPressBarkFor(factionId, hash32(state.meta && state.meta.seed || 1, speaker.id, state.tick | 0, 'vent_press'))
    : null;
  if (quiet) rt.lastCallAt = now;
  if (bus && typeof bus.emit === 'function') {
    bus.emit('ai:ventPress', {
      entityIds: pressers.map((e) => e.id), speakerId: speaker.id, factionId,
      text, until, t: now, tick: state.tick | 0,
    });
  }
  const voice = helpers && helpers.voice;
  if (text && voice && typeof voice.say === 'function') {
    voice.say({
      channel: 'bark', text, kind: 'attack', ttl: 2.5,
      id: `ventPress:${speaker.id}:${state.tick | 0}`, factionId,
    });
  }
  return pressers;
}

/**
 * Expired presses hand the authored activity back exactly once (stash/handback). A shove that
 * rattled the presser mid-press stashed the press record as its own base: the press hands the
 * authored record to that stash instead, so the panic's restore never revives a stale press.
 */
export function stepVentPressRestores(state, shipLikeList) {
  if (!state || !shipLikeList || !shipLikeList.length) return;
  const now = Number.isFinite(state.simTime) ? state.simTime
    : (Number.isFinite(state.tick) ? state.tick / 60 : 0);
  for (let i = 0; i < shipLikeList.length; i++) {
    const entity = shipLikeList[i];
    const ai = entity && entity.data && entity.data.ai;
    if (!ai || (!ai.ventPress && !Object.hasOwn(ai, 'ventPressBase'))) continue;
    if (ventPressLive(ai, now)) continue;
    const base = Object.hasOwn(ai, 'ventPressBase') ? ai.ventPressBase : null;
    delete ai.ventPressBase;
    if (activityReason(ai.activity) === VENT_PRESS_REASON) {
      if (base) ai.activity = base;
      else delete ai.activity;
    } else if (ai.shovePanicBase && activityReason(ai.shovePanicBase) === VENT_PRESS_REASON) {
      ai.shovePanicBase = base || null;
    }
  }
}
