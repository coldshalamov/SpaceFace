import { ObjectiveKind, ContactKind } from '../ai/contracts.js';
import { canFireByDoctrine } from '../ai/doctrine.js';
import { authorizeAIEngagement, isHostileForAI } from '../ai/engagementAuthority.js';
import { assessFriendlyFireLane } from '../ai/fireDiscipline.js';
import {
  isPdScreenActor,
  resolvePdCharge,
  selectPdInterceptTarget,
  ensurePdSaturation,
  beginPdIntercept,
  PD_SCREEN_DEFAULT_RADIUS,
} from '../ai/pdScreen.js';
import { isPlayerWanted } from './heat.js';

const RECENT_DEFENSIVE_DAMAGE_TICKS = 180;

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

  // W04: pd_screen_escort policy overrides target selection with screen priority + saturation.
  // Honest v1 — priority-targeting + cap (projectile kill seam not shipped on weapons.intercepts).
  let targetId = objective && objective.targetId;
  if (pdActor) {
    const pdTarget = applyPdScreenTargetPolicy(e, state, decision);
    if (pdTarget != null) targetId = pdTarget;
  }

  const attack = objective && (
    objective.kind === ObjectiveKind.FOCUS
    || objective.kind === ObjectiveKind.ENGAGE
    || objective.kind === ObjectiveKind.SCREEN
  );
  const fireWindowOk = !combatDoctrine || combatDoctrine.fireWindow || pdActor;
  if ((!attack && !pdActor) || targetId == null || !fireWindowOk) {
    clearFire(intent);
    return;
  }

  const target = state.entities.get(targetId);
  if (!target || !target.alive) {
    clearFire(intent);
    return;
  }
  const ai = data.ai || {};
  const recentlyDamaged = recentlyDamagedBy(state, e.id, targetId);
  const objectiveKind = (objective && objective.kind) || (pdActor ? ObjectiveKind.SCREEN : null);
  const permitted = canFireByDoctrine({
    activity: ai.activity,
    roe: ai.roe,
    objectiveKind,
    target,
    self: e,
    wanted: isPlayerWanted(state),
    recentlyDamaged,
  });
  const hostile = isHostileForAI(state, e, target)
    || !!(target.type === 'projectile')
    || (target.team != null && e.team != null && target.team !== e.team);
  const authorization = (permitted || pdActor) ? authorizeAIEngagement({
    state,
    self: e,
    target,
    tick: state.tick,
    objectiveReason: (objective && objective.reason) || (pdActor ? 'pd_screen_intercept' : ''),
    hostile,
    wanted: isPlayerWanted(state),
    recentlyDamaged,
  }) : null;
  const pdOpen = pdActor && hostile;
  if ((!permitted || !authorization || !authorization.ok) && !pdOpen) {
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
    entities: state.entityList || state.entities,
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
  const list = state.entityList || [];
  const selfTeam = self.team;
  for (const e of list) {
    if (!e || !e.alive || e.id === self.id) continue;
    if (charge && e.id === charge.id) continue;
    if (e.type === 'projectile') {
      // Hostile projectile: owner not on our team.
      const owner = e.ownerId != null && state.entities ? state.entities.get(e.ownerId) : null;
      const hostile = owner
        ? (owner.team != null && selfTeam != null && owner.team !== selfTeam)
        : (e.team != null && selfTeam != null && e.team !== selfTeam);
      if (!hostile) continue;
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
    const hostile = isHostileForAI(state, self, e)
      || (e.team != null && selfTeam != null && e.team !== selfTeam);
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
