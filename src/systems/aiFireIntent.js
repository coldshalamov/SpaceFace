import { ObjectiveKind, ContactKind } from '../ai/contracts.js';
import { canFireByDoctrine } from '../ai/doctrine.js';
import { authorizeAIEngagement, isHostileForAI } from '../ai/engagementAuthority.js';
import { assessFriendlyFireLane, assessOpticSplinterReturn } from '../ai/fireDiscipline.js';
import {
  isPdScreenActor,
  resolvePdCharge,
  selectPdInterceptTarget,
  ensurePdSaturation,
  beginPdIntercept,
  PD_SCREEN_DEFAULT_RADIUS,
} from '../ai/pdScreen.js';
import { isPlayerWanted } from './heat.js';
import { indexedShipLikeScan } from '../world/livingWorldViews.js';
import { queryCombatTableRadius } from '../core/combatTable.js';
import { solveLeadAngle } from './weapons.js';
import { combatFlag } from '../data/featureFlags.js';

const RECENT_DEFENSIVE_DAMAGE_TICKS = 180;
const FIRE_WINDOW_ADMISSION = new WeakMap();
const PD_CONTACT_ID_SCRATCH = [];
const PD_TABLE_RADIUS_PAD_WU = 80;
// Perf memo for recentlyDamagedBy: the backward walk over the combat trace costs O(events in the
// 180-tick window) per armed actor per tick, and the window holds thousands of entries during a
// busy swarm wave. The memo is INCREMENTAL: a cached answer stays valid until the trace appends
// past the length it was computed at (then only the appended delta is scanned), and a `true`
// answer additionally carries the tick it expires at (RECENT_DEFENSIVE_DAMAGE_TICKS after the
// damage event that proved it). A shrunken trace (ring compaction) resets lengths so the next
// query rescans. Answers are therefore always identical to a full fresh walk.
const RECENT_DAMAGE_MEMOS = new WeakMap();
const RECENT_DAMAGE_MEMO_CAP = 512;

export function applyAIFiringIntent(decision, state) {
  if (!decision || !state || !state.entities || typeof state.entities.get !== 'function') return;
  const entityId = decision.entityId;
  if (entityId == null || entityId === state.playerId) return;
  const e = state.entities.get(entityId);
  if (!e || e.type !== 'ship' || !e.alive) return;

  const data = e.data || (e.data = {});
  const intent = mutableIntent(data);
  const objective = decision.directive && decision.directive.objective;
  const combatDoctrine = decision.combatDoctrine || null;
  const pdActor = isPdScreenActor(e);

  // W04: pd_screen_escort policy owns target selection, but never fire authorization.
  // A null selection is an explicit saturated/unavailable result, not permission to fall back
  // to the squad directive's target.
  let targetId = objective && objective.targetId;
  if (pdActor) {
    targetId = applyPdScreenTargetPolicy(e, state, decision);
    if (targetId == null) {
      clearFire(intent, 'pd_screen_unavailable');
      return;
    }
  }

  const attack = objective && (
    objective.kind === ObjectiveKind.FOCUS
    || objective.kind === ObjectiveKind.ENGAGE
    || objective.kind === ObjectiveKind.SCREEN
  );
  const fireWindowOk = !combatDoctrine || combatDoctrine.fireWindow;
  if (!attack || targetId == null || !fireWindowOk) {
    if (!combatDoctrine || !fireWindowOk) FIRE_WINDOW_ADMISSION.delete(e);
    clearFire(intent);
    return;
  }
  // A doctrine fire window authorizes action selection; the SG-03 executor remains the canonical
  // proof that the action was actually accepted. Keep visible weapon intent closed while the
  // predictive gate is blocked so it cannot lead the corresponding action.requested event.
  if (!admittedFireWindow(e, combatDoctrine, decision.action)) {
    clearFire(intent, 'action_request_pending');
    return;
  }

  const target = state.entities.get(targetId);
  if (!target || !target.alive) {
    clearFire(intent);
    return;
  }
  const engagementTarget = pdActor ? pdEngagementTarget(state, target) : target;
  if (!engagementTarget) {
    clearFire(intent, 'pd_target_not_authorized');
    return;
  }
  const ai = data.ai || {};
  const recentlyDamaged = recentlyDamagedBy(state, e.id, engagementTarget.id);
  // Pure read this tick; both doctrine and engagement gates consume the same value.
  const playerWanted = isPlayerWanted(state);
  // SCREEN activity.targetId names the defended charge, so it is not an offensive target lock.
  // Map the selected intercept into the ordinary ENGAGE doctrine gate while preserving SCREEN
  // activity/ROE semantics and the final engagement authority below.
  const objectiveKind = pdActor ? ObjectiveKind.ENGAGE : objective && objective.kind;
  const activity = pdActor && ai.activity
    ? { ...ai.activity, targetId: null }
    : ai.activity;
  const permitted = canFireByDoctrine({
    activity,
    roe: ai.roe,
    objectiveKind,
    target: engagementTarget,
    self: e,
    wanted: playerWanted,
    recentlyDamaged,
  });
  const authorization = permitted ? authorizeAIEngagement({
    state,
    self: e,
    target: engagementTarget,
    tick: state.tick,
    objectiveReason: objective && objective.reason,
    wanted: playerWanted,
    recentlyDamaged,
  }) : null;
  if (!permitted || !authorization || !authorization.ok) {
    clearFire(intent);
    return;
  }

  const aimAngle = leadAngleFor(e, target, data.weapons);
  const combat = data.combat || (data.combat = {});
  combat.targetId = targetId;
  combat.pdScreen = pdActor;
  const lane = assessFriendlyFireLane({
    shooter: e,
    target,
    aimAngle,
    entities: friendlyFireLaneEntities(state),
  });
  if (!lane.clear && target.type !== 'projectile') {
    clearFire(intent, lane.reason, lane.blockerId);
    intent.aimAngle = aimAngle;
    return;
  }

  // Optic fire discipline: an energy volley that would prism a diamond and throw the splinter
  // ring back through the shooter or a same-team hull is refused — the lattice is terrain, not
  // scenery. Kinetic-only hulls skip the scan entirely; an empty collidable bucket keeps CLEAR.
  const splinterLane = assessOpticSplinterReturn({
    shooter: e,
    target,
    aimAngle,
    entities: opticLaneBodies(state),
    weapons: data.weapons,
  });
  if (!splinterLane.clear && target.type !== 'projectile') {
    clearFire(intent, splinterLane.reason, splinterLane.blockerId);
    intent.aimAngle = aimAngle;
    return;
  }

  intent.fire = true;
  intent.fireBlockReason = null;
  intent.fireBlockerId = null;
  intent.aimAngle = aimAngle;
  ai.lastAggressionTrace = aggressionTrace(decision, state, targetId, ai);
}

/**
 * The lane gate only considers ships and drones. The live entity index is refreshed before
 * tactical AI, so use its exact ship-like view instead of rescanning asteroids, stations, FX, and
 * payloads for every armed actor. Headless/minimal states retain the complete fallback.
 */
export function friendlyFireLaneEntities(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready && Array.isArray(index.shipLike)) {
    return index.shipLike;
  }
  return state?.entityList || state?.entities;
}

const EMPTY_OPTIC_LANE_BODIES = Object.freeze([]);

/**
 * Every body a bolt or splinter could meet: the live collidable index when it is ready, else the
 * entity list in minimal states. Splinters die in any solid hull — ships included — so this is
 * deliberately broader than the ship-like friendly-lane view. A ready index without a
 * `collidables` bucket reports empty rather than touching the dense list (the firing-authority
 * tests proxy it to prove the scan stays off it).
 */
export function opticLaneBodies(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) {
    return index.ready === true && Array.isArray(index.collidables)
      ? index.collidables
      : EMPTY_OPTIC_LANE_BODIES;
  }
  return (state && state.entityList) || (state && state.entities) || EMPTY_OPTIC_LANE_BODIES;
}

/**
 * Apply PD screen target policy. Returns targetId or null.
 * Records selection on entity.data.pdScreenRuntime for inspection / saturation.
 */
export function applyPdScreenTargetPolicy(entity, state, decision = null) {
  if (!entity || !isPdScreenActor(entity)) return null;
  const tick = Number.isInteger(state && state.tick) ? state.tick : 0;
  const sat = ensurePdSaturation(entity);
  const charge = resolvePdCharge(entity, state, decision && decision.perception);
  const contacts = collectPdContacts(entity, state, charge);
  const selected = selectPdInterceptTarget({
    self: entity,
    charge,
    contacts,
    screenRadius: (entity.data && entity.data.pdScreenRadius) || PD_SCREEN_DEFAULT_RADIUS,
    saturation: sat,
    tick,
  });
  const runtime = entity.data.pdScreenRuntime;
  if (!selected) {
    runtime.lastTargetId = null;
    runtime.lastScore = null;
    return null;
  }
  if (runtime.lastTargetId !== selected.targetId) {
    beginPdIntercept(sat, tick);
  }
  runtime.lastTargetId = selected.targetId;
  runtime.lastScore = selected.score;
  runtime.lastKind = selected.kind;
  runtime.inside = selected.inside;
  runtime.chargeId = charge && charge.id;
  return selected.targetId;
}

function collectPdContacts(self, state, charge) {
  const out = [];
  const table = state && state.combatTable;
  const useTable = !!(table && table.tick === (state.tick | 0) && table.count > 0 && self && self.pos
    && state.entities && typeof state.entities.get === 'function');
  if (useTable) {
    const origin = (charge && charge.pos) || self.pos;
    const radius = ((self.data && self.data.pdScreenRadius) || PD_SCREEN_DEFAULT_RADIUS)
      + PD_TABLE_RADIUS_PAD_WU;
    queryCombatTableRadius(table, origin.x, origin.z, radius, PD_CONTACT_ID_SCRATCH);
    for (let i = 0; i < PD_CONTACT_ID_SCRATCH.length; i++) {
      considerPdContact(self, state, charge, state.entities.get(PD_CONTACT_ID_SCRATCH[i]), out);
    }
    return out;
  }
  const index = state.entityIndex;
  const ships = indexedShipLikeScan(state);
  const projectiles = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.projectiles)
    ? index.projectiles
    : (state.entityList || []);
  const lists = [projectiles, ships];
  for (let b = 0; b < lists.length; b++) {
    const list = lists[b];
    if (!list) continue;
    for (let i = 0; i < list.length; i++) considerPdContact(self, state, charge, list[i], out);
  }
  return out;
}

function considerPdContact(self, state, charge, e, out) {
  if (!e || !e.alive || e.id === self.id) return;
  if (charge && e.id === charge.id) return;
  if (e.type === 'projectile') {
    // A projectile is hostile only through its live owner's authored hostility. Team mismatch
    // and ownerless ordnance cannot broaden the final engagement authority.
    const owner = e.ownerId != null && state.entities ? state.entities.get(e.ownerId) : null;
    if (!owner || !owner.alive || !isHostileForAI(state, self, owner)) return;
    out.push({
      id: e.id,
      kind: ContactKind.PROJECTILE,
      pos: e.pos,
      vel: e.vel,
      alive: true,
      valid: true,
      visible: true,
      hostile: true,
      threat: 0.9,
    });
    return;
  }
  if (e.type !== 'ship' && e.type !== 'drone') return;
  if (e.team != null && self.team != null && e.team === self.team) return;
  if (!isHostileForAI(state, self, e)) return;
  out.push({
    id: e.id,
    kind: ContactKind.SHIP,
    pos: e.pos,
    vel: e.vel,
    alive: true,
    valid: true,
    visible: true,
    hostile: true,
    threat: 0.6,
  });
}

function pdEngagementTarget(state, fireTarget) {
  if (!fireTarget || fireTarget.alive === false) return null;
  if (fireTarget.type !== 'projectile') return fireTarget;
  if (fireTarget.ownerId == null || !state || !state.entities) return null;
  const owner = state.entities.get(fireTarget.ownerId);
  return owner && owner.alive ? owner : null;
}

function aggressionTrace(decision, state, targetId, ai) {
  const objective = decision && decision.directive && decision.directive.objective || {};
  const combatDoctrine = decision && decision.combatDoctrine || {};
  const doctrineId = String(combatDoctrine.doctrineId || ai.combatDoctrineId || '');
  const reason = String(objective.reason || '');
  const prefix = doctrineId ? `combat_doctrine:${doctrineId}:` : '';
  const doctrinePhase = String(combatDoctrine.phase || (prefix && reason.startsWith(prefix) ? reason.slice(prefix.length) : ''));
  return Object.freeze({
    tick: Number.isInteger(state && state.tick) ? state.tick : 0,
    targetId,
    motive: String(ai.motive),
    engagementTrigger: String(ai.engagementTrigger),
    zoneId: String(ai.zoneId),
    approachTelegraph: String(ai.approachTelegraph),
    noFireResponseWindowS: Number(ai.noFireResponseWindowS),
    tactic: String(decision && decision.directive && decision.directive.tactic || ''),
    doctrineId,
    doctrinePhase,
  });
}

export function clearAIFiringIntent(intent, reason = null, blockerId = null) {
  clearFire(intent, reason, blockerId);
}

function clearFire(intent, reason = null, blockerId = null) {
  intent.fire = false;
  intent.fireBlockReason = reason;
  intent.fireBlockerId = blockerId;
}

function admittedFireWindow(entity, doctrine, action) {
  if (!doctrine) return true;
  let runtime = FIRE_WINDOW_ADMISSION.get(entity);
  // The identity key is compared field-by-field instead of being rebuilt as a template string
  // every call; the four stringified fields are exactly the segments the old key joined.
  const doctrineId = String(doctrine.doctrineId || '');
  const cycle = String(doctrine.cycle || 0);
  const phase = String(doctrine.phase || '');
  const phaseStartedTick = String(doctrine.phaseStartedTick ?? '');
  if (!runtime
    || runtime.doctrineId !== doctrineId
    || runtime.cycle !== cycle
    || runtime.phase !== phase
    || runtime.phaseStartedTick !== phaseStartedTick) {
    runtime = { doctrineId, cycle, phase, phaseStartedTick, admitted: false };
    FIRE_WINDOW_ADMISSION.set(entity, runtime);
  }
  if (action && action.actionId) runtime.admitted = true;
  return runtime.admitted;
}

function mutableIntent(data) {
  const current = data.intent;
  if (!current || Object.isFrozen(current)) {
    data.intent = current && typeof current === 'object' ? { ...current } : {};
  }
  return data.intent;
}

function recentlyDamagedBy(state, entityId, targetId) {
  const tick = Number.isInteger(state && state.tick) ? state.tick : 0;
  const events = state.combat && state.combat.trace && Array.isArray(state.combat.trace.events)
    ? state.combat.trace.events
    : [];
  let memo = RECENT_DAMAGE_MEMOS.get(state);
  if (!memo || memo.events !== events) {
    memo = { events, len: 0, byPair: new Map() };
    RECENT_DAMAGE_MEMOS.set(state, memo);
  }
  // Ring compaction shrank the array: stored lengths are stale beyond recovery — reset them so
  // the next query rescans from the start of what remains.
  if (events.length < memo.len) {
    memo.len = 0;
    for (const perTarget of memo.byPair.values()) {
      for (const entry of perTarget.values()) entry.len = 0;
    }
  }
  let perTarget = memo.byPair.get(entityId);
  if (!perTarget) {
    perTarget = new Map();
    if (memo.byPair.size < RECENT_DAMAGE_MEMO_CAP) memo.byPair.set(entityId, perTarget);
  }
  const entry = perTarget.get(targetId);
  if (entry) {
    if (entry.answer) {
      // A `true` holds until the proving damage event ages out of the window.
      if (tick <= entry.untilTick) return true;
    } else if (events.length === entry.len) {
      return false;
    }
  }
  // Scan the appended delta (or everything, when cold/reset/expired-true). Identical predicate
  // to a full backward walk — events below `start` were already reflected in the cached answer.
  let result = false;
  let resultUntilTick = -1;
  const start = entry && entry.len <= events.length ? entry.len : 0;
  for (let index = events.length - 1; index >= start; index--) {
    const event = events[index];
    if (!event) continue;
    const eventTick = Number.isInteger(event.tick) ? event.tick : tick;
    if (tick - eventTick > RECENT_DEFENSIVE_DAMAGE_TICKS) break;
    if (event.kind !== 'damage.routed') continue;
    if (event.targetId === entityId && (targetId == null || event.attackerId === targetId)) {
      result = true;
      resultUntilTick = eventTick + RECENT_DEFENSIVE_DAMAGE_TICKS;
      break;
    }
  }
  if (!result && entry && entry.answer && tick <= entry.untilTick) {
    // The window has not expired on the previously proven event and the new delta holds no
    // newer proof — the old `true` still stands (its event lives below `start`).
    result = true;
    resultUntilTick = entry.untilTick;
  }
  // While a `true` answer is alive it does not depend on trace length at all.
  perTarget.set(targetId, result
    ? { answer: true, len: Number.MAX_SAFE_INTEGER, untilTick: resultUntilTick }
    : { answer: false, len: events.length, untilTick: -1 });
  return result;
}

function leadAngleFor(shooter, tgt, weapons) {
  // Mounted NPC guns launch the same aim-true projectiles as the player's guns. The old
  // relative-velocity direction compensated shooter motion twice and missed by whole hulls.
  if (!combatFlag('momentumInherit')) return solveLeadAngle(shooter, tgt, bestProjSpeed(weapons));
  const px = tgt.pos.x - shooter.pos.x;
  const pz = tgt.pos.z - shooter.pos.z;
  const rvx = (tgt.vel.x || 0) - (shooter.vel.x || 0);
  const rvz = (tgt.vel.z || 0) - (shooter.vel.z || 0);
  const projSpeed = bestProjSpeed(weapons);
  let t = 0;
  for (let i = 0; i < 2; i++) {
    const aimx = px + rvx * t;
    const aimz = pz + rvz * t;
    const dist = Math.hypot(aimx, aimz);
    t = dist / Math.max(1, projSpeed);
  }
  const aimx = px + rvx * t;
  const aimz = pz + rvz * t;
  return Math.atan2(aimz, aimx);
}

function bestProjSpeed(weapons) {
  if (!weapons || !weapons.length) return 300;
  let best = 0;
  for (const w of weapons) {
    const s = w && w.projSpeed;
    if (Number.isFinite(s) && s > best) best = s;
  }
  return best > 0 ? best : 300;
}
