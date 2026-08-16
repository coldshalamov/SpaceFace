import { ObjectiveKind, ContactKind } from '../ai/contracts.js';
import { canFireByDoctrine } from '../ai/doctrine.js';
import { authorizeAIEngagement, isHostileForAI } from '../ai/engagementAuthority.js';
import { assessFriendlyFireLane } from '../ai/fireDiscipline.js';
import {
  isPdScreenActor,
  isDedicatedPdScreenActor,
  pdActorCanDefend,
  resolvePdCharge,
  selectPdInterceptTarget,
  refreshPdAssignment,
  PD_SCREEN_DEFAULT_RADIUS,
} from '../ai/pdScreen.js';
import {
  isInterceptableOrdnance,
  isIronMawPdActor,
  liveIronMawPdMounts,
} from '../combat/projectileInterception.js';
import { isPlayerWanted } from './heat.js';

const RECENT_DEFENSIVE_DAMAGE_TICKS = 180;
const FIRE_WINDOW_ADMISSION = new WeakMap();

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
  let pdTargeting = false;

  // W04: pd_screen_escort policy owns target selection, but never fire authorization.
  // A null selection is an explicit saturated/unavailable result, not permission to fall back
  // to the squad directive's target.
  let targetId = objective && objective.targetId;
  if (pdActor) {
    const pdTargetId = applyPdScreenTargetPolicy(e, state, decision);
    if (pdTargetId != null) {
      targetId = pdTargetId;
      pdTargeting = true;
    } else if (isDedicatedPdScreenActor(e)) {
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
  const engagementTarget = pdTargeting ? pdEngagementTarget(state, target) : target;
  if (!engagementTarget) {
    clearFire(intent, 'pd_target_not_authorized');
    return;
  }
  const ai = data.ai || {};
  const recentlyDamaged = recentlyDamagedBy(state, e.id, engagementTarget.id);
  // SCREEN activity.targetId names the defended charge, so it is not an offensive target lock.
  // Map the selected intercept into the ordinary ENGAGE doctrine gate while preserving SCREEN
  // activity/ROE semantics and the final engagement authority below.
  const objectiveKind = pdTargeting ? ObjectiveKind.ENGAGE : objective && objective.kind;
  const activity = pdTargeting && ai.activity
    ? { ...ai.activity, targetId: null }
    : ai.activity;
  const permitted = canFireByDoctrine({
    activity,
    roe: ai.roe,
    objectiveKind,
    target: engagementTarget,
    self: e,
    wanted: isPlayerWanted(state),
    recentlyDamaged,
  });
  const authorization = permitted ? authorizeAIEngagement({
    state,
    self: e,
    target: engagementTarget,
    tick: state.tick,
    objectiveReason: objective && objective.reason,
    wanted: isPlayerWanted(state),
    recentlyDamaged,
  }) : null;
  if (!permitted || !authorization || !authorization.ok) {
    clearFire(intent);
    return;
  }

  const aimAngle = leadAngleFor(e, target, data.weapons);
  const combat = data.combat || (data.combat = {});
  combat.targetId = targetId;
  combat.pdScreen = pdTargeting;
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

/**
 * Apply PD screen target policy. Returns targetId or null.
 * Records selection on entity.data.pdScreenRuntime for inspection / saturation.
 */
export function applyPdScreenTargetPolicy(entity, state, decision = null) {
  if (!entity || !isPdScreenActor(entity)) return null;
  const tick = Number.isInteger(state && state.tick) ? state.tick : 0;
  const sat = refreshPdAssignment(entity, state);
  const charge = resolvePdCharge(entity, state, decision && decision.perception);
  const screenRadius = (entity.data && entity.data.pdScreenRadius) || PD_SCREEN_DEFAULT_RADIUS;
  if (!pdActorCanDefend(entity, state, charge, screenRadius)) {
    sat.lastTargetId = null;
    sat.lastScore = null;
    return null;
  }
  if (isIronMawPdActor(entity)) {
    sat.maxIntercepts = liveIronMawPdMounts(entity, state).length;
    sat.saturationModel = 'surviving_pd_mounts';
  } else {
    sat.maxIntercepts = 2;
    sat.saturationModel = 'two_intercept_recovery';
  }
  const contacts = collectPdContacts(entity, state, charge);
  const selected = selectPdInterceptTarget({
    self: entity,
    charge,
    contacts,
    screenRadius,
    saturation: sat,
    tick,
  });
  const runtime = entity.data.pdScreenRuntime;
  if (!selected || selected.inside !== true) {
    runtime.lastTargetId = null;
    runtime.lastScore = null;
    return null;
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
  const list = state.entityList || [];
  const selfTeam = self.team;
  for (const e of list) {
    if (!e || !e.alive || e.id === self.id) continue;
    if (charge && e.id === charge.id) continue;
    if (e.type === 'projectile') {
      if (!isInterceptableOrdnance(e)) continue;
      // A projectile is hostile only through its live owner's authored hostility. Team mismatch
      // and ownerless ordnance cannot broaden the final engagement authority.
      const owner = e.ownerId != null && state.entities ? state.entities.get(e.ownerId) : null;
      if (!owner || !owner.alive || !isHostileForAI(state, self, owner)) continue;
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
      continue;
    }
    if (e.type !== 'ship' && e.type !== 'drone') continue;
    if (e.team != null && selfTeam != null && e.team === selfTeam) continue;
    const hostile = isHostileForAI(state, self, e);
    if (!hostile) continue;
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
  return out;
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

function clearFire(intent, reason = null, blockerId = null) {
  intent.fire = false;
  intent.fireBlockReason = reason;
  intent.fireBlockerId = blockerId;
}

function admittedFireWindow(entity, doctrine, action) {
  if (!doctrine) return true;
  const key = `${doctrine.doctrineId || ''}|${doctrine.cycle || 0}|${doctrine.phase || ''}|${doctrine.phaseStartedTick ?? ''}`;
  let runtime = FIRE_WINDOW_ADMISSION.get(entity);
  if (!runtime || runtime.key !== key) {
    runtime = { key, admitted: false };
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
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (!event) continue;
    const eventTick = Number.isInteger(event.tick) ? event.tick : tick;
    if (tick - eventTick > RECENT_DEFENSIVE_DAMAGE_TICKS) break;
    if (event.kind !== 'damage.routed') continue;
    if (event.targetId === entityId && (targetId == null || event.attackerId === targetId)) return true;
  }
  return false;
}

function leadAngleFor(shooter, tgt, weapons) {
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
