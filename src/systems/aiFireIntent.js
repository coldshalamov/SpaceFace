import { ObjectiveKind } from '../ai/contracts.js';
import { canFireByDoctrine } from '../ai/doctrine.js';
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
  const targetId = objective && objective.targetId;
  const attack = objective && (objective.kind === ObjectiveKind.FOCUS || objective.kind === ObjectiveKind.ENGAGE);

  if (!attack || targetId == null) {
    clearFire(intent);
    return;
  }

  const target = state.entities.get(targetId);
  const ai = data.ai || {};
  const permitted = canFireByDoctrine({
    activity: ai.activity,
    roe: ai.roe,
    objectiveKind: objective.kind,
    target,
    self: e,
    wanted: isPlayerWanted(state),
    recentlyDamaged: recentlyDamagedBy(state, e.id, targetId),
  });
  if (!permitted) {
    clearFire(intent);
    return;
  }

  intent.fire = true;
  intent.aimAngle = leadAngleFor(e, target, data.weapons);
  const combat = data.combat || (data.combat = {});
  combat.targetId = targetId;
}

function clearFire(intent) {
  intent.fire = false;
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
