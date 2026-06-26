import { otherAttachmentEndpoint } from './attachments.js';
import { ensureCombatant, entityKey } from './runtime.js';
import { actionBlockedByCombatant } from './subsystems.js';
import { appendCombatTrace } from './trace.js';

export function createActionService(context, attachments, routeDamage) {
  const { state, catalog, bus, helpers } = context;

  function requestAction(request = {}) {
    const actionDef = catalog.actions.get(request.actionId);
    const actorId = request.actorId;
    if (!actionDef) return immediateReject(request, 'unknown_action');
    if (actorId == null) return immediateReject(request, 'actor_missing');
    const seq = state.combat.actions.nextRequestSeq++;
    const queued = {
      id: `req_${String(seq).padStart(8, '0')}`,
      seq,
      actorId,
      actionId: actionDef.id,
      source: normalizeSource(request.source),
      target: normalizeTarget(request, actionDef.target),
      requestedTick: state.tick >>> 0,
      notBeforeTick: Number.isInteger(request.notBeforeTick) ? Math.max(state.tick, request.notBeforeTick) : state.tick,
      metadata: sanitizeMetadata(request.metadata),
    };
    state.combat.actions.requests.push(queued);
    appendCombatTrace(state.combat, state.tick, 'action.requested', {
      actorId,
      actionId: actionDef.id,
      requestId: queued.id,
      source: queued.source,
      target: queued.target,
    });
    return { ok: true, requestId: queued.id, request: queued };
  }

  function advance() {
    processRequests();
    const active = state.combat.actions.activeByActor;
    for (const key of Object.keys(active).sort(compareEntityKeys)) {
      const instance = active[key];
      if (instance) tickAction(instance, key);
    }
  }

  function processRequests() {
    const due = [];
    const future = [];
    for (const request of state.combat.actions.requests) {
      if (request.notBeforeTick <= state.tick) due.push(request); else future.push(request);
    }
    state.combat.actions.requests = future;
    due.sort((a, b) => a.seq - b.seq);
    for (const request of due) processRequest(request);
  }

  function processRequest(request) {
    const actor = entity(request.actorId);
    const def = catalog.actions.get(request.actionId);
    if (!actor || !actor.alive) return reject(request, 'actor_missing');
    if (!def) return reject(request, 'unknown_action');
    const key = entityKey(actor.id);
    let current = state.combat.actions.activeByActor[key];
    if (current && phaseAt(catalog.actions.get(current.actionId), state.tick - current.startedTick).phase === 'complete') {
      complete(current, key);
      current = null;
    }
    if (current) {
      const currentDef = catalog.actions.get(current.actionId);
      const phase = phaseAt(currentDef, state.tick - current.startedTick);
      if (!canCancelInto(currentDef, phase, def)) return reject(request, `busy:${current.actionId}:${phase.phase}`);
      cancel(current, key, `cancel_into:${def.id}`);
    }
    return start(request, actor, def, key);
  }

  function start(request, actor, def, key) {
    const runtime = ensureCombatant(state, actor, catalog);
    const blocked = actionBlockedByCombatant(runtime, def);
    if (blocked) return reject(request, `disabled:${blocked}`);
    const missingPhysics = missingPhysicsOperation(def, combatPhysics());
    if (missingPhysics) return reject(request, `physics_port_unavailable:${missingPhysics}`);
    const targetCheck = validateTarget(actor, request.target, def.target);
    if (!targetCheck.ok) return reject(request, targetCheck.reason);

    const cooldowns = cooldownMap(actor.id);
    const readyTick = Number(cooldowns[def.id]) || 0;
    if (state.tick < readyTick) return reject(request, `cooldown:${readyTick}`);
    const capacitorCost = Math.max(0, Number(def.costs && def.costs.capacitor) || 0);
    const heatCost = Math.max(0, Number(def.costs && def.costs.heat) || 0);
    const cap = Math.max(0, Number(actor.cap) || 0);
    if (cap < capacitorCost) return reject(request, 'insufficient_capacitor');
    if (runtime.heat + heatCost > runtime.heatMax) return reject(request, 'heat_limit');

    actor.cap = Math.max(0, cap - capacitorCost);
    runtime.heat = Math.min(runtime.heatMax, runtime.heat + heatCost);
    cooldowns[def.id] = Math.max(readyTick, state.tick + Math.max(0, Math.floor(def.cooldownTicks || 0)));
    const seq = state.combat.actions.nextInstanceSeq++;
    const instance = {
      id: `act_${String(seq).padStart(8, '0')}`,
      seq,
      requestId: request.id,
      actorId: actor.id,
      actionId: def.id,
      source: request.source,
      target: request.target,
      metadata: request.metadata,
      startedTick: state.tick,
      lastProcessedTick: -1,
      lastPhase: null,
      lastPhaseTick: -1,
      result: null,
    };
    state.combat.actions.activeByActor[key] = instance;
    appendCombatTrace(state.combat, state.tick, 'action.started', {
      actorId: actor.id,
      actionId: def.id,
      actionInstanceId: instance.id,
      requestId: request.id,
      source: request.source,
      target: request.target,
      capacitorCost,
      heatCost,
      cooldownReadyTick: cooldowns[def.id],
      cueId: def.cues && def.cues.start,
    });
    if (bus) bus.emit('combat:actionStarted', publicAction(instance, def));
    return { ok: true, instance };
  }

  function tickAction(instance, key) {
    if (instance.lastProcessedTick === state.tick) return;
    const def = catalog.actions.get(instance.actionId);
    const actor = entity(instance.actorId);
    if (!def || !actor || !actor.alive) {
      cancel(instance, key, !actor ? 'actor_missing' : 'definition_missing');
      return;
    }
    const timeline = phaseAt(def, state.tick - instance.startedTick);
    if (timeline.phase === 'complete') {
      complete(instance, key);
      return;
    }
    instance.lastProcessedTick = state.tick;
    if (instance.lastPhase !== timeline.phase) {
      instance.lastPhase = timeline.phase;
      instance.lastPhaseTick = timeline.localTick;
      const cueId = timeline.phase === 'active' ? def.cues && def.cues.active : null;
      appendCombatTrace(state.combat, state.tick, 'action.phase', {
        actorId: actor.id,
        actionId: def.id,
        actionInstanceId: instance.id,
        phase: timeline.phase,
        localTick: timeline.localTick,
        cueId,
      });
      if (bus) bus.emit('combat:actionPhase', { ...publicAction(instance, def), phase: timeline.phase, localTick: timeline.localTick, cueId });
    }

    if (def.movement && matchesTiming(def.movement.at, timeline)) executeMovement(actor, instance, def.movement);
    for (const effect of def.effects || []) if (matchesTiming(effect.at, timeline)) executeEffect(actor, instance, effect);
  }

  function executeMovement(actor, instance, movement) {
    const physics = combatPhysics();
    let impulse = null;
    if (movement.kind === 'forwardImpulse') {
      const magnitude = Math.max(0, Number(movement.magnitude) || 0) * movementMultiplier(actor.id);
      impulse = { x: Math.cos(actor.rot || 0) * magnitude, z: Math.sin(actor.rot || 0) * magnitude };
    } else if (movement.kind === 'attachmentTangentImpulse') {
      const attachment = attachments.get(instance.target && instance.target.attachmentId);
      const otherId = otherAttachmentEndpoint(attachment, actor.id);
      const other = entity(otherId);
      if (!attachment || attachment.state !== 'active' || !other) return effectRejected(instance, 'attachment_missing');
      const rx = other.pos.x - actor.pos.x, rz = other.pos.z - actor.pos.z;
      const length = Math.hypot(rx, rz) || 1;
      let tx = -rz / length, tz = rx / length;
      const dot = tx * (actor.vel && actor.vel.x || 0) + tz * (actor.vel && actor.vel.z || 0);
      if (dot < 0) { tx = -tx; tz = -tz; }
      const magnitude = Math.max(0, Number(movement.magnitude) || 0) * movementMultiplier(actor.id);
      impulse = { x: tx * magnitude, z: tz * magnitude };
    }
    if (!impulse) return effectRejected(instance, 'unknown_movement');
    try {
      const accepted = physics.applyImpulse({
        entityId: actor.id,
        impulse,
        point: null,
        reason: `action:${instance.actionId}`,
        actionInstanceId: instance.id,
        tick: state.tick,
      });
      if (accepted === false) return effectRejected(instance, 'physics_rejected');
    } catch (error) {
      return effectRejected(instance, `physics_error:${String(error && error.message || error)}`);
    }
    appendCombatTrace(state.combat, state.tick, 'physics.impulse', {
      actorId: actor.id,
      actionId: instance.actionId,
      actionInstanceId: instance.id,
      impulse,
      reason: 'action',
    });
  }

  function executeEffect(actor, instance, effect) {
    let result = null;
    switch (effect.type) {
      case 'createAttachment': {
        const targetId = instance.target && instance.target.entityId;
        result = attachments.create({
          defId: effect.attachmentDefId,
          ownerId: actor.id,
          targetId,
          sourceSocketId: instance.target && instance.target.sourceSocketId,
          targetSocketId: instance.target && instance.target.targetSocketId,
          actionInstanceId: instance.id,
        });
        if (result.ok) instance.result = { ...(instance.result || {}), attachmentId: result.attachment.id };
        break;
      }
      case 'reelAttachment':
        result = attachments.reel(instance.target && instance.target.attachmentId, effect.restLengthDelta, effect.minRestLength);
        break;
      case 'cutAttachment':
        result = attachments.cut(instance.target && instance.target.attachmentId, actor.id, effect.reason || 'action_cut');
        break;
      case 'damage': {
        const targetId = instance.target && instance.target.entityId;
        const target = entity(targetId);
        if (!target || !target.alive) result = { ok: false, reason: 'target_missing' };
        else {
          const packet = clonePacket(effect.packet);
          if (!packet.hit) packet.hit = { pos: { x: target.pos.x, z: target.pos.z } };
          result = routeDamage({
            attackerId: actor.id,
            targetId,
            packet,
            origin: { kind: 'action', id: instance.actionId, instanceId: instance.id },
          });
        }
        break;
      }
      default:
        result = { ok: false, reason: `unknown_effect:${effect.type}` };
        break;
    }
    appendCombatTrace(state.combat, state.tick, result && result.ok ? 'action.effect' : 'action.effectRejected', {
      actorId: actor.id,
      targetId: actionTargetEntityId(instance),
      actionId: instance.actionId,
      actionInstanceId: instance.id,
      effectType: effect.type,
      reason: result && !result.ok ? result.reason : null,
      attachmentId: result && result.attachment && result.attachment.id || instance.result && instance.result.attachmentId || null,
    });
    return result;
  }

  function complete(instance, key) {
    const def = catalog.actions.get(instance.actionId);
    if (state.combat.actions.activeByActor[key] === instance) delete state.combat.actions.activeByActor[key];
    appendCombatTrace(state.combat, state.tick, 'action.completed', {
      actorId: instance.actorId,
      targetId: actionTargetEntityId(instance),
      actionId: instance.actionId,
      actionInstanceId: instance.id,
      result: instance.result,
      cueId: def && def.cues && def.cues.end,
    });
    if (bus) bus.emit('combat:actionCompleted', publicAction(instance, def));
  }

  function cancel(instance, key, reason) {
    const def = catalog.actions.get(instance.actionId);
    if (state.combat.actions.activeByActor[key] === instance) delete state.combat.actions.activeByActor[key];
    appendCombatTrace(state.combat, state.tick, 'action.cancelled', {
      actorId: instance.actorId,
      targetId: actionTargetEntityId(instance),
      actionId: instance.actionId,
      actionInstanceId: instance.id,
      reason,
      cueId: def && def.cues && def.cues.cancel,
    });
    if (bus) bus.emit('combat:actionCancelled', { ...publicAction(instance, def), reason });
  }

  function reject(request, reason) {
    const def = catalog.actions.get(request.actionId);
    appendCombatTrace(state.combat, state.tick, 'action.rejected', {
      actorId: request.actorId == null ? null : request.actorId,
      actionId: request.actionId || null,
      requestId: request.id || null,
      source: request.source || normalizeSource(null),
      target: request.target || null,
      reason,
      cueId: def && def.cues && def.cues.reject || null,
    });
    if (bus) bus.emit('combat:actionRejected', { actorId: request.actorId, actionId: request.actionId, requestId: request.id || null, reason });
    return { ok: false, reason };
  }

  function immediateReject(request, reason) {
    const normalized = {
      id: null,
      actorId: request.actorId,
      actionId: request.actionId,
      source: normalizeSource(request.source),
      target: null,
    };
    return reject(normalized, reason);
  }

  function effectRejected(instance, reason) {
    appendCombatTrace(state.combat, state.tick, 'action.effectRejected', {
      actorId: instance.actorId,
      actionId: instance.actionId,
      actionInstanceId: instance.id,
      reason,
    });
    return { ok: false, reason };
  }

  function inspect(actorId) {
    const key = entityKey(actorId);
    const active = state.combat.actions.activeByActor[key] || null;
    return {
      active: active ? { ...active, timeline: phaseAt(catalog.actions.get(active.actionId), state.tick - active.startedTick) } : null,
      cooldownReadyTick: { ...(state.combat.actions.cooldownReadyTickByActor[key] || {}) },
      queued: state.combat.actions.requests.filter((request) => request.actorId === actorId).map((request) => ({ ...request })),
    };
  }

  return Object.freeze({ requestAction, advance, inspect, phaseAt: (actionId, tick) => phaseAt(catalog.actions.get(actionId), tick) });

  function combatPhysics() {
    return helpers && helpers.combatPhysics;
  }

  function validateTarget(actor, target, targetDef = {}) {
    if (!targetDef.required && (!target || target.kind === 'none')) return { ok: true };
    if (!target) return { ok: false, reason: 'target_required' };
    if (targetDef.kind === 'entity') {
      const targetEntity = entity(target.entityId);
      if (!targetEntity || !targetEntity.alive || targetEntity.id === actor.id) return { ok: false, reason: 'target_missing' };
      if (targetDef.hostile && actor.team != null && targetEntity.team != null && actor.team === targetEntity.team) return { ok: false, reason: 'target_not_hostile' };
      if (Number.isFinite(targetDef.maxRange)) {
        const distance = Math.hypot(targetEntity.pos.x - actor.pos.x, targetEntity.pos.z - actor.pos.z);
        if (distance > targetDef.maxRange) return { ok: false, reason: 'target_out_of_range' };
      }
      return { ok: true };
    }
    if (targetDef.kind === 'attachment') {
      const attachment = attachments.get(target.attachmentId);
      if (!attachment || attachment.state !== 'active') return { ok: false, reason: 'attachment_missing' };
      if (targetDef.ownedByActor && attachment.ownerId !== actor.id) return { ok: false, reason: 'not_attachment_owner' };
      return { ok: true };
    }
    if (targetDef.kind === 'point') return Number.isFinite(target.x) && Number.isFinite(target.z) ? { ok: true } : { ok: false, reason: 'point_target_invalid' };
    if (targetDef.kind === 'none') return { ok: true };
    return { ok: false, reason: 'target_kind_invalid' };
  }

  function movementMultiplier(actorId) {
    const actor = entity(actorId);
    const runtime = actor && ensureCombatant(state, actor, catalog);
    return runtime && runtime.multipliers && Number.isFinite(runtime.multipliers.movement) ? Math.max(0, runtime.multipliers.movement) : 1;
  }

  function cooldownMap(actorId) {
    const key = entityKey(actorId);
    let map = state.combat.actions.cooldownReadyTickByActor[key];
    if (!map || typeof map !== 'object') map = state.combat.actions.cooldownReadyTickByActor[key] = {};
    return map;
  }

  function entity(id) {
    return state.entities && state.entities.get ? state.entities.get(id) || null : null;
  }
}

export function phaseAt(def, elapsedTick) {
  if (!def || !def.phases) return { phase: 'complete', localTick: 0, elapsedTick: Math.max(0, elapsedTick || 0) };
  const elapsed = Math.max(0, Math.floor(elapsedTick || 0));
  const startup = Math.max(0, Math.floor(def.phases.startupTicks || 0));
  const active = Math.max(0, Math.floor(def.phases.activeTicks || 0));
  const recovery = Math.max(0, Math.floor(def.phases.recoveryTicks || 0));
  if (elapsed < startup) return { phase: 'startup', localTick: elapsed, elapsedTick: elapsed };
  if (elapsed < startup + active) return { phase: 'active', localTick: elapsed - startup, elapsedTick: elapsed };
  if (elapsed < startup + active + recovery) return { phase: 'recovery', localTick: elapsed - startup - active, elapsedTick: elapsed };
  return { phase: 'complete', localTick: elapsed - startup - active - recovery, elapsedTick: elapsed };
}

function canCancelInto(currentDef, phase, nextDef) {
  if (!currentDef || !nextDef) return false;
  for (const window of currentDef.cancelWindows || []) {
    if (window.phase !== phase.phase) continue;
    if (phase.localTick < window.fromTick || phase.localTick >= window.toTick) continue;
    if (!(window.intoTags || []).length) return true;
    if ((nextDef.tags || []).some((tag) => window.intoTags.includes(tag))) return true;
  }
  return false;
}

function matchesTiming(at, timeline) {
  if (at === 'activeStart') return timeline.phase === 'active' && timeline.localTick === 0;
  if (at === 'activeEachTick') return timeline.phase === 'active';
  if (at === 'recoveryStart') return timeline.phase === 'recovery' && timeline.localTick === 0;
  if (at === 'startupStart') return timeline.phase === 'startup' && timeline.localTick === 0;
  return false;
}

function normalizeTarget(request, targetDef = {}) {
  if (!targetDef || targetDef.kind === 'none') return { kind: 'none' };
  if (targetDef.kind === 'entity') {
    const entityId = request.targetId != null ? request.targetId : request.target && request.target.entityId;
    return {
      kind: 'entity', entityId,
      sourceSocketId: request.sourceSocketId || request.target && request.target.sourceSocketId || null,
      targetSocketId: request.targetSocketId || request.target && request.target.targetSocketId || null,
    };
  }
  if (targetDef.kind === 'attachment') {
    return { kind: 'attachment', attachmentId: request.attachmentId || request.target && request.target.attachmentId || null };
  }
  if (targetDef.kind === 'point') {
    const point = request.point || request.target || {};
    return { kind: 'point', x: Number(point.x), z: Number(point.z) };
  }
  return null;
}

function normalizeSource(source) {
  if (typeof source === 'string') return { kind: source };
  if (source && typeof source === 'object') return { kind: String(source.kind || 'unknown'), controllerId: source.controllerId == null ? null : String(source.controllerId) };
  return { kind: 'unknown' };
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) out[key] = value;
  }
  return out;
}

function publicAction(instance, def) {
  return {
    actorId: instance.actorId,
    actionId: instance.actionId,
    actionInstanceId: instance.id,
    target: instance.target,
    source: instance.source,
    startedTick: instance.startedTick,
    totalTicks: def ? totalTicks(def) : 0,
  };
}

function totalTicks(def) {
  return Math.max(0, Math.floor(def.phases.startupTicks || 0)) + Math.max(0, Math.floor(def.phases.activeTicks || 0)) + Math.max(0, Math.floor(def.phases.recoveryTicks || 0));
}

function missingPhysicsOperation(def, physics) {
  if (def.movement && (!physics || typeof physics.applyImpulse !== 'function')) return 'applyImpulse';
  for (const effect of def.effects || []) {
    if (effect.type === 'createAttachment' && (!physics || typeof physics.createAttachment !== 'function')) return 'createAttachment';
    if (effect.type === 'reelAttachment' && (!physics || typeof physics.setAttachmentReel !== 'function')) return 'setAttachmentReel';
    if (effect.type === 'cutAttachment' && (!physics || typeof physics.cutAttachment !== 'function')) return 'cutAttachment';
  }
  return null;
}

function actionTargetEntityId(instance) {
  return instance && instance.target && instance.target.kind === 'entity' ? instance.target.entityId : null;
}

function clonePacket(packet) {
  return {
    channels: { ...(packet && packet.channels || {}) },
    penetration: Number(packet && packet.penetration) || 0,
    impulse: packet && packet.impulse ? { ...packet.impulse } : null,
    heat: Number(packet && packet.heat) || 0,
    statuses: (packet && packet.statuses || []).map((status) => ({ ...status })),
    hit: packet && packet.hit ? { ...packet.hit, pos: packet.hit.pos ? { ...packet.hit.pos } : undefined } : null,
    flags: packet && packet.flags ? { ...packet.flags } : {},
  };
}

function compareEntityKeys(a, b) {
  const an = Number(a), bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return compareText(a, b);
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
