import { socketWorldPosition } from './geometry.js';
import { ensureCombatant, entityKey } from './runtime.js';
import { appendCombatTrace } from './trace.js';

export function createAttachmentService(context) {
  const { state, catalog, helpers } = context;
  const physics = helpers && helpers.combatPhysics;

  function get(attachmentId) {
    return state.combat.attachments.byId[String(attachmentId)] || null;
  }

  function create(spec) {
    const def = catalog.attachments.get(spec && spec.defId);
    const owner = entity(spec && spec.ownerId);
    const target = entity(spec && spec.targetId);
    if (!def) return fail('unknown_attachment_def');
    if (!owner || !owner.alive) return fail('owner_missing');
    if (!target || !target.alive || target.id === owner.id) return fail('target_missing');
    if (!physics || typeof physics.createAttachment !== 'function') return fail('physics_port_unavailable');

    const ownerRuntime = ensureCombatant(state, owner, catalog);
    const targetRuntime = ensureCombatant(state, target, catalog);
    const sourceSocket = selectSocket(ownerRuntime, def.sourceSocketTags, spec.sourceSocketId, owner.id);
    const targetSocket = selectSocket(targetRuntime, def.targetSocketTags, spec.targetSocketId, target.id);
    if (!sourceSocket) return fail('source_socket_unavailable');
    if (!targetSocket) return fail('target_socket_unavailable');

    const activeOwned = Object.values(state.combat.attachments.byId)
      .filter((attachment) => attachment.state === 'active' && attachment.ownerId === owner.id && attachment.defId === def.id).length;
    if (def.limits && Number.isInteger(def.limits.maxPerOwner) && activeOwned >= def.limits.maxPerOwner) return fail('owner_attachment_limit');

    const id = `att_${String(state.combat.attachments.nextId++).padStart(6, '0')}`;
    const sourceWorld = socketWorldPosition(owner, sourceSocket);
    const targetWorld = socketWorldPosition(target, targetSocket);
    const restLength = Math.hypot(targetWorld.x - sourceWorld.x, targetWorld.z - sourceWorld.z);
    let physicsHandle;
    try {
      physicsHandle = physics.createAttachment({
        attachmentId: id,
        defId: def.id,
        ownerId: owner.id,
        targetId: target.id,
        sourceSocketId: sourceSocket.id,
        targetSocketId: targetSocket.id,
        sourceWorld,
        targetWorld,
        restLength,
        break: { ...(def.break || {}) },
        tick: state.tick,
      });
    } catch (error) {
      return fail('physics_create_failed', error);
    }
    if (physicsHandle === false || physicsHandle == null) return fail('physics_create_rejected');

    const attachment = {
      id,
      defId: def.id,
      ownerId: owner.id,
      targetId: target.id,
      sourceSocketId: sourceSocket.id,
      targetSocketId: targetSocket.id,
      physicsHandle: serializableHandle(physicsHandle),
      state: 'active',
      createdTick: state.tick,
      brokenTick: null,
      breakReason: null,
      restLength,
      lastTension: 0,
      lastImpulse: 0,
      actionInstanceId: spec.actionInstanceId || null,
    };
    state.combat.attachments.byId[id] = attachment;
    appendCombatTrace(state.combat, state.tick, 'attachment.created', {
      actorId: owner.id,
      targetId: target.id,
      attachmentId: id,
      attachmentDefId: def.id,
      sourceSocketId: sourceSocket.id,
      targetSocketId: targetSocket.id,
      restLength,
      cueId: def.cues && def.cues.created,
    });
    return { ok: true, attachment };
  }

  function reel(attachmentId, restLengthDelta, minRestLength = 0) {
    const attachment = get(attachmentId);
    if (!attachment || attachment.state !== 'active') return fail('attachment_missing');
    if (!physics || typeof physics.setAttachmentReel !== 'function') return fail('physics_port_unavailable');
    const next = Math.max(Math.max(0, Number(minRestLength) || 0), attachment.restLength + (Number(restLengthDelta) || 0));
    try {
      const accepted = physics.setAttachmentReel({
        attachmentId: attachment.id,
        physicsHandle: attachment.physicsHandle,
        restLength: next,
        previousRestLength: attachment.restLength,
        tick: state.tick,
      });
      if (accepted === false) return fail('physics_reel_rejected');
    } catch (error) {
      return fail('physics_reel_failed', error);
    }
    const before = attachment.restLength;
    attachment.restLength = next;
    appendCombatTrace(state.combat, state.tick, 'attachment.reel', {
      actorId: attachment.ownerId,
      targetId: attachment.targetId,
      attachmentId: attachment.id,
      before,
      after: next,
    });
    return { ok: true, attachment };
  }

  function cut(attachmentId, actorId, reason = 'cut') {
    const attachment = get(attachmentId);
    if (!attachment || attachment.state !== 'active') return fail('attachment_missing');
    if (actorId != null && attachment.ownerId !== actorId) return fail('not_attachment_owner');
    return breakAttachment(attachment, reason, actorId);
  }

  function breakAttachment(attachmentOrId, reason = 'break', actorId = null, telemetry = null) {
    const attachment = typeof attachmentOrId === 'string' ? get(attachmentOrId) : attachmentOrId;
    if (!attachment || attachment.state !== 'active') return fail('attachment_missing');
    if (physics && typeof physics.cutAttachment === 'function') {
      try {
        physics.cutAttachment({
          attachmentId: attachment.id,
          physicsHandle: attachment.physicsHandle,
          reason,
          tick: state.tick,
        });
      } catch (error) {
        return fail('physics_cut_failed', error);
      }
    } else if (reason !== 'physics_break') {
      return fail('physics_port_unavailable');
    }
    attachment.state = 'broken';
    attachment.brokenTick = state.tick;
    attachment.breakReason = reason;
    if (telemetry) {
      attachment.lastTension = finiteOrZero(telemetry.tension);
      attachment.lastImpulse = finiteOrZero(telemetry.impulse);
    }
    const def = catalog.attachments.get(attachment.defId);
    appendCombatTrace(state.combat, state.tick, 'attachment.broken', {
      actorId: actorId == null ? attachment.ownerId : actorId,
      targetId: attachment.targetId,
      attachmentId: attachment.id,
      reason,
      tension: attachment.lastTension,
      impulse: attachment.lastImpulse,
      cueId: def && def.cues && def.cues.broken,
    });
    return { ok: true, attachment };
  }

  function breakOwnedBy(ownerId, reason = 'owner_disabled') {
    const broken = [];
    for (const attachment of Object.values(state.combat.attachments.byId).sort(byId)) {
      if (attachment.state !== 'active' || attachment.ownerId !== ownerId) continue;
      const result = breakAttachment(attachment, reason, ownerId);
      if (result.ok) broken.push(attachment.id);
    }
    return broken;
  }

  function transfer(attachmentId, fromOwnerId, toOwnerId) {
    const attachment = get(attachmentId);
    const def = attachment && catalog.attachments.get(attachment.defId);
    if (!attachment || attachment.state !== 'active') return fail('attachment_missing');
    if (attachment.ownerId !== fromOwnerId) return fail('not_attachment_owner');
    if (!def || !def.ownership || !def.ownership.transferable) return fail('ownership_not_transferable');
    if (!entity(toOwnerId)) return fail('new_owner_missing');
    attachment.ownerId = toOwnerId;
    appendCombatTrace(state.combat, state.tick, 'attachment.ownerTransferred', {
      actorId: fromOwnerId,
      targetId: toOwnerId,
      attachmentId,
    });
    return { ok: true, attachment };
  }

  function updateTelemetryAndBreak() {
    if (!physics || typeof physics.getAttachmentTelemetry !== 'function') return;
    for (const attachment of Object.values(state.combat.attachments.byId).sort(byId)) {
      if (attachment.state !== 'active') continue;
      const def = catalog.attachments.get(attachment.defId);
      if (!def) continue;
      let telemetry;
      try {
        telemetry = physics.getAttachmentTelemetry({ attachmentId: attachment.id, physicsHandle: attachment.physicsHandle, tick: state.tick });
      } catch (_) {
        continue;
      }
      if (!telemetry) continue;
      attachment.lastTension = finiteOrZero(telemetry.tension);
      attachment.lastImpulse = finiteOrZero(telemetry.impulse);
      const grace = Math.max(0, Number(def.break && def.break.graceTicks) || 0);
      if (state.tick - attachment.createdTick < grace) continue;
      if ((def.break && attachment.lastTension > def.break.maxTension) || (def.break && attachment.lastImpulse > def.break.maxImpulse)) {
        breakAttachment(attachment, 'threshold', attachment.ownerId, telemetry);
      }
    }
  }

  function onPhysicsBreak(payload) {
    if (!payload || !payload.attachmentId) return false;
    const attachment = get(payload.attachmentId);
    if (!attachment || attachment.state !== 'active') return false;
    return breakAttachment(attachment, 'physics_break', attachment.ownerId, payload).ok;
  }

  function listForEntity(entityId, activeOnly = true) {
    return Object.values(state.combat.attachments.byId)
      .filter((attachment) => (!activeOnly || attachment.state === 'active') && (attachment.ownerId === entityId || attachment.targetId === entityId))
      .sort(byId);
  }

  return Object.freeze({ get, create, reel, cut, breakAttachment, breakOwnedBy, transfer, updateTelemetryAndBreak, onPhysicsBreak, listForEntity });

  function selectSocket(runtime, requiredTags, explicitId, entityId) {
    const sockets = runtime && runtime.sockets ? Object.values(runtime.sockets).sort(byId) : [];
    const required = new Set(requiredTags || []);
    for (const socket of sockets) {
      if (explicitId && socket.id !== explicitId) continue;
      if (![...required].some((tag) => socket.tags.includes(tag))) continue;
      const used = Object.values(state.combat.attachments.byId).filter((attachment) =>
        attachment.state === 'active' && ((attachment.ownerId === entityId && attachment.sourceSocketId === socket.id) ||
        (attachment.targetId === entityId && attachment.targetSocketId === socket.id))).length;
      if (used < socket.maxAttachments) return socket;
    }
    return null;
  }

  function entity(id) {
    return state.entities && state.entities.get ? state.entities.get(id) || null : null;
  }

  function fail(reason, error = null) {
    appendCombatTrace(state.combat, state.tick, 'attachment.rejected', {
      reason,
      error: error && error.message ? String(error.message) : null,
    });
    return { ok: false, reason };
  }
}

export function otherAttachmentEndpoint(attachment, actorId) {
  if (!attachment) return null;
  if (attachment.ownerId === actorId) return attachment.targetId;
  if (attachment.targetId === actorId) return attachment.ownerId;
  return null;
}

function serializableHandle(handle) {
  if (handle == null) return null;
  if (typeof handle === 'string' || typeof handle === 'number' || typeof handle === 'boolean') return handle;
  if (typeof handle === 'object' && (typeof handle.id === 'string' || typeof handle.id === 'number')) return { id: handle.id };
  return { external: true };
}

function byId(a, b) {
  return compareText(String(a.id), String(b.id));
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
