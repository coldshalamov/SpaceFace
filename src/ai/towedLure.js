// RW-02 second slice — ship-side pursuit of the towed signature. Missile seekers already
// re-acquire through weapons.js' diverted/divertPos path; this module is the same physics for
// the pursuer holding the gun: identical signature source (the towed body's data.lureSignature,
// stamped by eighthBellRuntime — the only writer), identical authored threshold, and a matching
// claim/release vocabulary carried on data.combat so the mark survives doctrine re-selection
// and the save boundary. A pursuer never gets a second steering path: the claim re-points the
// ordinary combat/activity targetId, and the ordinary contact->intercept path flies the ship.
import { ambushSignatureForShape } from '../data/ambushSignatures.js';
import { effectiveActivityForAI, setEntityDoctrine } from './doctrine.js';

/**
 * Pure read of the towed lure's standing against the authored towed_lure threshold contract.
 * Returns { hot, signature } or null when there is nothing readable (no body, dead, no pos,
 * or no stamped signature). Shared by the seeker divert (weapons.js) and the pursuit claim here.
 */
export function towedLureSignature(towed) {
  if (!towed || towed.alive === false || !towed.pos) return null;
  const signature = Number(towed.data && towed.data.lureSignature);
  if (!Number.isFinite(signature)) return null;
  const contract = ambushSignatureForShape('towed_lure');
  const weights = (contract && contract.targeting) || {};
  const threshold = Number.isFinite(weights.threshold) ? weights.threshold : 0.6;
  return { hot: signature >= threshold, signature };
}

/**
 * The payload currently riding the PLAYER's Massline plus its signature standing —
 * { towed, lure } or null. Same tether read the seeker divert performs; an NPC dragging a
 * loud payload does not pull your pursuers.
 */
export function playerTowedLure(state) {
  const tether = state && state.player && state.player.tether;
  const towedId = tether && tether.active === true ? tether.targetId : null;
  const towed = towedId != null ? entityById(state, towedId) : null;
  const lure = towedLureSignature(towed);
  return lure ? { towed, lure } : null;
}

/**
 * One doctrine-cadence pass over ship hulls (the encounterDirector hosts it at its 1 Hz
 * rhythm — the same clock the ambient predation lifecycle already keeps; seekers stay on the
 * per-tick weapons path). For every hull prosecuting the player, a hot towed lure claims the
 * pursuit; a cold, severed, consumed, or destroyed lure releases ONLY a lure-owned claim and
 * hands acquisition back to the hull — a chaff break, a foreign retarget, or an unrelated
 * combat target is never touched.
 */
export function tickTowedLurePursuits(state) {
  if (!state || state.playerId == null) return;
  const pair = playerTowedLure(state);
  const hot = pair && pair.lure && pair.lure.hot === true ? pair : null;
  const ships = shipsForPursuitScan(state);
  for (const entity of ships) {
    refreshPursuerClaim(state, entity, hot);
  }
}

/**
 * Should `self`'s sensor frame carry the towed lure as a contact? True while the observer
 * prosecutes the towing hull OR holds its own lure claim on it — the bell is loud to the one
 * already hunting that signature, silent to bystanders. Returns the towed entity or null;
 * the caller decides how the contact is shaped.
 */
export function towedLureContactFor(state, self) {
  if (!state || !self || self.id === state.playerId) return null;
  const combat = self.data && self.data.combat;
  if (!combat) return null;
  if (!(combat.lureDiverted === true || combat.targetId === state.playerId)) return null;
  const pair = playerTowedLure(state);
  return pair && pair.lure && pair.lure.hot === true ? pair.towed : null;
}

function refreshPursuerClaim(state, entity, hot) {
  if (!entity || entity.type !== 'ship' || entity.alive === false || entity.id === state.playerId) return;
  const data = entity.data;
  const combat = data && data.combat;
  if (!data || !combat) return;
  const ai = data.ai || null;

  if (combat.lureDiverted === true) {
    const towedId = combat.lureTowedId;
    const holds = !!hot && hot.towed.id === towedId && hot.towed.alive !== false && !!hot.towed.pos;
    if (!holds) {
      // Release: hand acquisition back to the hull — but only where our claim is still the
      // thing pointing. A retaliation or squad repoint that moved the target meanwhile is a
      // foreign write; clear the mark and leave its work alone.
      if (combat.targetId === towedId) combat.targetId = combat.lureHullId;
      const activity = ai && effectiveActivityForAI(ai);
      if (activity && activity.targetId === towedId) {
        setEntityDoctrine(entity, { activity: { ...activity, targetId: combat.lureActivityTargetId ?? null } });
      }
      clearLureClaim(combat);
      return;
    }
    // Still claimed: keep the pursuit on the signature. A doctrine re-selection that wandered
    // back to the hull gets claimed again; any other foreign target stands and the mark lifts.
    if (combat.targetId === state.playerId || combat.targetId === towedId) {
      repointAtLure(state, entity, combat, ai, hot.towed);
      return;
    }
    clearLureClaim(combat);
    return;
  }

  // Acquire: only a hull actively prosecuting the towing hull answers a newly hot lure, the
  // same gate the seeker divert uses. A ship aiming at anything else keeps its own fight.
  if (!hot || combat.targetId !== state.playerId || !hot.towed.pos) return;
  combat.lureDiverted = true;
  combat.lureHullId = combat.targetId;
  combat.lureTowedId = hot.towed.id;
  combat.lureActivityTargetId = null;
  repointAtLure(state, entity, combat, ai, hot.towed);
}

function repointAtLure(state, entity, combat, ai, towed) {
  combat.targetId = towed.id;
  // An authoritative assignment bound to the hull (an ambush's marked prey, a predation
  // attack run, a retaliation) re-points at the signature so its fire gate and its intercept
  // destination stay coherent — the activity's own targetId is what doctrine honors.
  const activity = ai && effectiveActivityForAI(ai);
  if (activity && activity.targetId != null && activity.targetId !== towed.id
    && (activity.targetId === state.playerId || activity.targetId === combat.lureTowedId)) {
    if (combat.lureActivityTargetId == null) combat.lureActivityTargetId = activity.targetId;
    setEntityDoctrine(entity, { activity: { ...activity, targetId: towed.id } });
  }
}

function clearLureClaim(combat) {
  combat.lureDiverted = false;
  combat.lureHullId = null;
  combat.lureTowedId = null;
  combat.lureActivityTargetId = null;
}

function shipsForPursuitScan(state) {
  const entities = state.entities;
  if (entities && typeof entities.values === 'function') {
    const out = [];
    for (const e of entities.values()) if (e) out.push(e);
    return out;
  }
  return Array.isArray(state.entityList) ? state.entityList : [];
}

function entityById(state, id) {
  if (id == null || !state) return null;
  const entities = state.entities;
  if (entities && typeof entities.get === 'function') return entities.get(id) || null;
  const list = state.entityList;
  if (Array.isArray(list)) return list.find((entity) => entity && entity.id === id) || null;
  return null;
}

