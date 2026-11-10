// Shared physical intent adapter used by the live tactical owner and arena.

import { createCombatCatalog, ensureCombatant } from '../../combat/runtime.js';
import { repairSubsystem } from '../../combat/subsystems.js';
import { AI_CONTRACT_VERSION, ManeuverKind, makeThrusterRequest } from '../contracts.js';
import { gateCounterplayFire } from './authorityGate.js';
import { getCombatKernel } from '../../combat/kernel.js';
import { steerToward } from './steer.js';
import { createSG03ActionPort } from '../sg03ActionPort.js';
import { applyAIFiringIntent, clearAIFiringIntent } from '../../systems/aiFireIntent.js';

let repairCatalog = null;
const actionPorts = new WeakMap();

function catalog() {
  if (!repairCatalog) repairCatalog = createCombatCatalog();
  return repairCatalog;
}

export function applyCounterplayIntent({
  state,
  helpers,
  entity,
  decision,
  tick,
  target,
  ctx,
  maneuverPort = helpers && helpers.aiManeuver,
} = {}) {
  const result = {
    maneuverOk: false,
    fire: { requested: false, authorized: false, reason: 'no_attack' },
  };
  if (!entity || !decision) return result;
  const maneuver = decision.maneuver || {};
  if (maneuverPort && typeof maneuverPort.request === 'function') {
    const packet = makeThrusterRequest(entity.id, tick, {
      kind: ManeuverKind.INTERCEPT,
      forceLocal: {
        forward: Number.isFinite(maneuver.forward) ? maneuver.forward : 0,
        right: Number.isFinite(maneuver.right) ? maneuver.right : 0,
      },
      torqueYaw: maneuver.torqueYaw,
      boost: maneuver.boost === true,
      brake: maneuver.brake === true,
      targetHeading: maneuver.targetHeading,
      reason: `counterplay:${decision.doctrineId}:${decision.phase}`,
    });
    if (packet.version === AI_CONTRACT_VERSION) {
      result.maneuverOk = maneuverPort.request(packet) === true;
    }
  }
  const data = entity.data || (entity.data = {});
  if (!data.intent) data.intent = { fire: false, aimAngle: entity.rot || 0 };
  if (Object.isFrozen(data.intent)) data.intent = { ...data.intent };
  clearAIFiringIntent(data.intent);
  if (!decision.attack || decision.attack.wantFire !== true) return result;
  result.fire.requested = true;
  const gate = gateCounterplayFire({ state, self: entity, target, decision, tick });
  result.fire.reason = gate.reason;
  result.fire.authorized = gate.ok === true;
  if (gate.ok === true) {
    let port = actionPorts.get(state);
    if (!port) { port = createSG03ActionPort(ctx || { state, helpers }); actionPorts.set(state, port); }
    const window = `${decision.doctrineId}:${decision.phase}:${decision.phaseStartedTick || 0}:${target?.id}`;
    const ai = data.ai || (data.ai = {});
    let admission = ai.counterplayAction;
    if (!admission || admission.window !== window) {
      const reason = `combat_doctrine:ranged_disengager:fire_window`;
      const request = { tick, targetId: target?.id, objectiveReason: reason, objective: { kind: 'engage', targetId: target?.id } };
      const ready = port.canStart(entity.id, 'action_burst', request);
      const handle = ready.ok ? port.start(entity.id, 'action_burst', request) : null;
      if (handle == null) { result.fire.authorized = false; result.fire.reason = ready.reason || 'action_request_pending'; return result; }
      admission = ai.counterplayAction = { window, handle };
    }
    if (['failed', 'cancelled'].includes(port.status(entity.id, admission.handle))) {
      delete ai.counterplayAction; result.fire.authorized = false; result.fire.reason = 'action_rejected'; return result;
    }
    applyAIFiringIntent({ entityId: entity.id,
      directive: { objective: { kind: 'engage', targetId: target.id, targetObserved: true, reason: 'combat_doctrine:ranged_disengager:fire_window' } },
      combatDoctrine: { doctrineId: 'ranged_disengager', phase: 'fire_window', phaseStartedTick: decision.phaseStartedTick || 0, fireWindow: true },
      action: { actionId: 'action_burst', handle: admission.handle },
    }, state);
    result.fire.authorized = data.intent.fire === true;
    if (!result.fire.authorized) result.fire.reason = data.intent.fireBlockReason || 'fire_adapter_hold';
  }
  return result;
}

/** Resolve only cast members already present in this hull's sensed frame. */
export function applyCounterplayPhysical({ ctx, entity, decision, sensed = [], memory, maneuverPort } = {}) {
  const state = ctx?.state, role = (key) => sensed.find((row) => row.role === key);
  const live = (row) => {
    const body = row && state?.entities?.get(row.id);
    return body?.alive !== false && body && (row.generation == null || row.generation === (body.occupantGeneration || body.data?.counterplayGeneration || 1)) ? body : null;
  };
  if (!state || !entity || !decision) return { ok: false, reason: 'missing' };
  const kernel = getCombatKernel(ctx), verb = decision.verb;
  let outcome = { ok: false, reason: 'no_verb' };
  if (verb?.kind === 'latch') {
    const target = live(role(verb.targetRole));
    if (!target || target.id === entity.id) outcome = { ok: false, reason: 'target_not_sensed' };
    else if (Math.hypot(target.pos.x - entity.pos.x, target.pos.z - entity.pos.z) > (verb.maxRange || 180)) outcome = { ok: false, reason: 'out_of_range' };
    else {
      const existing = Object.values(state.combat?.attachments?.byId || {}).find((a) => a.state === 'active' && a.ownerId === entity.id && a.targetId === target.id);
      outcome = existing ? { ok: true, attachment: existing } : kernel.attachments.create({ defId: 'attachment_massline', ownerId: entity.id, targetId: target.id });
      if (outcome.ok && !existing && Number.isFinite(verb.restScale) && verb.restScale < 1) kernel.attachments.reel(outcome.attachment.id, outcome.attachment.restLength * (verb.restScale - 1), 18);
      if (outcome.ok && memory) memory.notes.lineId = outcome.attachment.id;
    }
    if (!outcome.ok && memory) memory.latchIssued = false;
  } else if (verb?.kind === 'cut') {
    const id = verb.attachmentId || memory?.notes?.lineId;
    outcome = id ? kernel.attachments.cut(id, entity.id, 'counterplay_cut') : { ok: false, reason: 'no_owned_line' };
  } else if (verb?.kind === 'repair') {
    const patient = live(role(verb.targetRole || 'patient'));
    const close = patient && Math.hypot(patient.pos.x - entity.pos.x, patient.pos.z - entity.pos.z) <= 110;
    outcome = close && patient.team === entity.team ? applyCounterplayRepair({ state, patient, amount: Math.min(0.25, Math.max(0, Number(verb.amount) || 0.25)) }) : { ok: false, reason: 'patient_not_in_reach' };
  }
  for (const order of decision.companions || []) {
    const mate = live(role(order.role));
    if (!mate || mate.id === state.playerId || mate.team !== entity.team || mate.data?.counterplayControllerId !== entity.id) continue;
    const maneuver = order.waypoint ? steerToward(mate, order.waypoint, { arrive: 20, brakeDist: 28, brakeSpeed: 6, boost: false }) : order.maneuver;
    if (maneuver) applyCounterplayIntent({ state, helpers: ctx.helpers, entity: mate, decision: { doctrineId: decision.doctrineId, phase: 'companion', maneuver, attack: null }, tick: state.tick, maneuverPort });
  }
  return outcome;
}

/**
 * Field repair verb. Amount is the authored drive field rate (0.25) when the
 * caller does not pass a smaller number. This is the subsystem writer, not a hull assign.
 */
export function applyCounterplayRepair({ state, patient, amount = 0.25, reason = 'counterplay_field_repair' } = {}) {
  if (!state || !patient) return { ok: false, reason: 'missing' };
  const runtime = ensureCombatant(state, patient, catalog());
  const before = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive
    ? runtime.subsystems.subsystem_drive.health
    : null;
  const applied = repairSubsystem(
    { state },
    patient,
    runtime,
    'subsystem_drive',
    Math.max(0, Number(amount) || 0),
    reason,
  );
  const after = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive
    ? runtime.subsystems.subsystem_drive.health
    : null;
  return { ok: applied.applied > 0, before, after, applied: applied.applied };
}
