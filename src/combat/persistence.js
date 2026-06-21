import { COMBAT_SCHEMA_VERSION } from '../data/combatDefs.js';
import { ensureCombatState, entityKey } from './runtime.js';

export const COMBAT_SAVE_SCHEMA_VERSION = 1;

export function serializeCombatState(state) {
  const combat = state && state.combat;
  const refs = buildEntityRefs(state);
  const attachments = serializeAttachments(combat, refs);
  const savedAttachmentIds = new Set(Object.keys(attachments.byId));
  return {
    schemaVersion: COMBAT_SAVE_SCHEMA_VERSION,
    combatSchemaVersion: COMBAT_SCHEMA_VERSION,
    statusNextPendingSeq: positiveInteger(combat && combat.statusNextPendingSeq, 1),
    entities: serializeCombatants(combat, refs),
    actions: serializeActions(combat, refs, savedAttachmentIds),
    attachments,
  };
}

export function restoreCombatState(state, payload, resolveEntityRef) {
  const combat = resetCombatState(state);
  if (!payload || typeof payload !== 'object' || typeof resolveEntityRef !== 'function') {
    return { restoredEntities: 0, restoredAttachments: 0, restoredActions: 0, restoredRequests: 0, dropped: 0 };
  }

  const summary = { restoredEntities: 0, restoredAttachments: 0, restoredActions: 0, restoredRequests: 0, dropped: 0 };
  restoreCombatants(combat, payload.entities, resolveEntityRef, summary);
  restoreAttachments(combat, payload.attachments, resolveEntityRef, summary);
  restoreActions(combat, payload.actions, resolveEntityRef, summary);
  combat.attachments.nextId = normalizedAttachmentNextId(
    payload.attachments && payload.attachments.nextId,
    combat.attachments.byId,
  );
  combat.statusNextPendingSeq = normalizedStatusNextSeq(payload.statusNextPendingSeq, combat.entities);
  return summary;
}

function buildEntityRefs(state) {
  const refs = new Map();
  const list = state && (state.entityList || (state.entities && [...state.entities.values()])) || [];
  for (const entity of list) {
    if (!entity || !entity.alive || entity.id == null) continue;
    let ref = null;
    if (entity.id === state.playerId) ref = { kind: 'player' };
    else if (entity.flags && entity.flags.persistent) ref = { kind: 'persistent', saveId: String(entity.id) };
    if (ref) refs.set(entityKey(entity.id), ref);
  }
  return refs;
}

function serializeCombatants(combat, refs) {
  const out = [];
  const entities = combat && combat.entities && typeof combat.entities === 'object' ? combat.entities : {};
  for (const key of Object.keys(entities).sort(compareEntityKeys)) {
    const ref = refs.get(entityKey(key));
    if (!ref) continue;
    const runtime = clonePlain(entities[key]);
    if (!runtime || typeof runtime !== 'object') continue;
    serializeRuntimeEntityRefs(runtime, refs);
    delete runtime.entityId;
    runtime.entityRef = clonePlain(ref);
    out.push(runtime);
  }
  return out;
}

function serializeAttachments(combat, refs) {
  const byId = {};
  const attachments = combat && combat.attachments && combat.attachments.byId &&
    typeof combat.attachments.byId === 'object' ? combat.attachments.byId : {};
  for (const id of Object.keys(attachments).sort(compareText)) {
    const attachment = attachments[id];
    if (!attachment || attachment.state !== 'active') continue;
    const ownerRef = refs.get(entityKey(attachment.ownerId));
    const targetRef = refs.get(entityKey(attachment.targetId));
    if (!ownerRef || !targetRef) continue;
    const saved = clonePlain(attachment);
    delete saved.ownerId;
    delete saved.targetId;
    delete saved.physicsHandle;
    saved.ownerRef = clonePlain(ownerRef);
    saved.targetRef = clonePlain(targetRef);
    saved.state = 'active';
    byId[id] = saved;
  }
  return {
    nextId: Number.isInteger(combat && combat.attachments && combat.attachments.nextId)
      ? Math.max(1, combat.attachments.nextId)
      : normalizedAttachmentNextId(null, byId),
    byId,
  };
}

function serializeActions(combat, refs, savedAttachmentIds) {
  const actions = combat && combat.actions && typeof combat.actions === 'object' ? combat.actions : {};
  const requests = [];
  for (const request of Array.isArray(actions.requests) ? actions.requests : []) {
    const actorRef = refs.get(entityKey(request && request.actorId));
    const target = serializeTarget(request && request.target, refs, savedAttachmentIds);
    if (!actorRef || !target) continue;
    const saved = clonePlain(request);
    delete saved.actorId;
    saved.actorRef = clonePlain(actorRef);
    saved.target = target;
    requests.push(saved);
  }

  const active = [];
  const activeByActor = actions.activeByActor && typeof actions.activeByActor === 'object' ? actions.activeByActor : {};
  for (const key of Object.keys(activeByActor).sort(compareEntityKeys)) {
    const instance = activeByActor[key];
    const actorRef = refs.get(entityKey(instance && instance.actorId));
    const target = serializeTarget(instance && instance.target, refs, savedAttachmentIds);
    if (!actorRef || !target) continue;
    const saved = clonePlain(instance);
    delete saved.actorId;
    saved.actorRef = clonePlain(actorRef);
    saved.target = target;
    active.push(saved);
  }

  const cooldowns = [];
  const cooldownByActor = actions.cooldownReadyTickByActor && typeof actions.cooldownReadyTickByActor === 'object'
    ? actions.cooldownReadyTickByActor
    : {};
  for (const key of Object.keys(cooldownByActor).sort(compareEntityKeys)) {
    const actorRef = refs.get(entityKey(key));
    if (!actorRef) continue;
    cooldowns.push({ actorRef: clonePlain(actorRef), cooldownReadyTick: clonePlain(cooldownByActor[key]) || {} });
  }

  requests.sort((a, b) => (a.notBeforeTick || 0) - (b.notBeforeTick || 0) || (a.seq || 0) - (b.seq || 0));
  active.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  return {
    nextRequestSeq: positiveInteger(actions.nextRequestSeq, 1),
    nextInstanceSeq: positiveInteger(actions.nextInstanceSeq, 1),
    requests,
    active,
    cooldowns,
  };
}

function restoreCombatants(combat, savedList, resolveEntityRef, summary) {
  if (!Array.isArray(savedList)) return;
  for (const saved of savedList) {
    const entityId = resolveEntityRef(saved && saved.entityRef);
    if (entityId == null) { summary.dropped++; continue; }
    const runtime = clonePlain(saved);
    delete runtime.entityRef;
    runtime.entityId = entityId;
    restoreRuntimeEntityRefs(runtime, resolveEntityRef);
    combat.entities[entityKey(entityId)] = runtime;
    summary.restoredEntities++;
  }
}

function restoreAttachments(combat, savedAttachments, resolveEntityRef, summary) {
  const byId = savedAttachments && savedAttachments.byId && typeof savedAttachments.byId === 'object'
    ? savedAttachments.byId
    : {};
  for (const id of Object.keys(byId).sort(compareText)) {
    const saved = byId[id];
    if (!saved || saved.state !== 'active') continue;
    const ownerId = resolveEntityRef(saved.ownerRef);
    const targetId = resolveEntityRef(saved.targetRef);
    if (ownerId == null || targetId == null || ownerId === targetId) { summary.dropped++; continue; }
    const attachment = clonePlain(saved);
    delete attachment.ownerRef;
    delete attachment.targetRef;
    attachment.id = String(attachment.id || id);
    attachment.ownerId = ownerId;
    attachment.targetId = targetId;
    attachment.physicsHandle = null;
    attachment.state = 'active';
    attachment.restLength = positiveNumber(attachment.restLength, 0);
    attachment.lastTension = positiveNumber(attachment.lastTension, 0);
    attachment.lastImpulse = positiveNumber(attachment.lastImpulse, 0);
    combat.attachments.byId[attachment.id] = attachment;
    summary.restoredAttachments++;
  }
}

function restoreActions(combat, savedActions, resolveEntityRef, summary) {
  if (!savedActions || typeof savedActions !== 'object') return;
  combat.actions.nextRequestSeq = positiveInteger(savedActions.nextRequestSeq, 1);
  combat.actions.nextInstanceSeq = positiveInteger(savedActions.nextInstanceSeq, 1);

  for (const entry of Array.isArray(savedActions.cooldowns) ? savedActions.cooldowns : []) {
    const actorId = resolveEntityRef(entry && entry.actorRef);
    if (actorId == null) { summary.dropped++; continue; }
    combat.actions.cooldownReadyTickByActor[entityKey(actorId)] = clonePlain(entry.cooldownReadyTick) || {};
  }

  for (const saved of Array.isArray(savedActions.requests) ? savedActions.requests : []) {
    const request = restoreActionRecord(saved, resolveEntityRef, combat.attachments.byId);
    if (!request) { summary.dropped++; continue; }
    combat.actions.requests.push(request);
    summary.restoredRequests++;
  }
  combat.actions.requests.sort((a, b) => (a.notBeforeTick || 0) - (b.notBeforeTick || 0) || (a.seq || 0) - (b.seq || 0));

  const active = Array.isArray(savedActions.active) ? [...savedActions.active] : [];
  active.sort((a, b) => (a && a.seq || 0) - (b && b.seq || 0));
  for (const saved of active) {
    const instance = restoreActionRecord(saved, resolveEntityRef, combat.attachments.byId);
    if (!instance) { summary.dropped++; continue; }
    combat.actions.activeByActor[entityKey(instance.actorId)] = instance;
    summary.restoredActions++;
  }
}

function restoreActionRecord(saved, resolveEntityRef, attachmentsById) {
  const actorId = resolveEntityRef(saved && saved.actorRef);
  if (actorId == null) return null;
  const target = restoreTarget(saved && saved.target, resolveEntityRef, attachmentsById);
  if (!target) return null;
  const record = clonePlain(saved);
  delete record.actorRef;
  record.actorId = actorId;
  record.target = target;
  return record;
}

function serializeTarget(target, refs, savedAttachmentIds) {
  if (!target || target.kind === 'none') return { kind: 'none' };
  if (target.kind === 'entity') {
    const entityRef = refs.get(entityKey(target.entityId));
    if (!entityRef) return null;
    return {
      kind: 'entity',
      entityRef: clonePlain(entityRef),
      sourceSocketId: target.sourceSocketId == null ? null : String(target.sourceSocketId),
      targetSocketId: target.targetSocketId == null ? null : String(target.targetSocketId),
    };
  }
  if (target.kind === 'attachment') {
    const attachmentId = target.attachmentId == null ? null : String(target.attachmentId);
    if (!attachmentId || (savedAttachmentIds && !savedAttachmentIds.has(attachmentId))) return null;
    return { kind: 'attachment', attachmentId };
  }
  if (target.kind === 'point') return { kind: 'point', x: Number(target.x) || 0, z: Number(target.z) || 0 };
  return null;
}

function restoreTarget(target, resolveEntityRef, attachmentsById) {
  if (!target || target.kind === 'none') return { kind: 'none' };
  if (target.kind === 'entity') {
    const entityId = resolveEntityRef(target.entityRef);
    if (entityId == null) return null;
    return {
      kind: 'entity',
      entityId,
      sourceSocketId: target.sourceSocketId == null ? null : String(target.sourceSocketId),
      targetSocketId: target.targetSocketId == null ? null : String(target.targetSocketId),
    };
  }
  if (target.kind === 'attachment') {
    const attachmentId = target.attachmentId == null ? null : String(target.attachmentId);
    if (!attachmentId || !attachmentsById[attachmentId]) return null;
    return { kind: 'attachment', attachmentId };
  }
  if (target.kind === 'point') return { kind: 'point', x: Number(target.x) || 0, z: Number(target.z) || 0 };
  return null;
}

function serializeRuntimeEntityRefs(runtime, refs) {
  remapStatusMapForSave(runtime.statuses, refs);
  remapStatusListForSave(runtime.pendingStatuses, refs);
}

function restoreRuntimeEntityRefs(runtime, resolveEntityRef) {
  remapStatusMapForRestore(runtime.statuses, resolveEntityRef);
  remapStatusListForRestore(runtime.pendingStatuses, resolveEntityRef);
}

function remapStatusMapForSave(statuses, refs) {
  if (!statuses || typeof statuses !== 'object') return;
  for (const status of Object.values(statuses)) remapStatusSourceForSave(status, refs);
}

function remapStatusListForSave(statuses, refs) {
  if (!Array.isArray(statuses)) return;
  for (const status of statuses) remapStatusSourceForSave(status, refs);
}

function remapStatusSourceForSave(status, refs) {
  if (!status || typeof status !== 'object' || status.attackerId == null) return;
  const ref = refs.get(entityKey(status.attackerId));
  delete status.attackerId;
  status.attackerRef = ref ? clonePlain(ref) : null;
}

function remapStatusMapForRestore(statuses, resolveEntityRef) {
  if (!statuses || typeof statuses !== 'object') return;
  for (const status of Object.values(statuses)) remapStatusSourceForRestore(status, resolveEntityRef);
}

function remapStatusListForRestore(statuses, resolveEntityRef) {
  if (!Array.isArray(statuses)) return;
  for (const status of statuses) remapStatusSourceForRestore(status, resolveEntityRef);
}

function remapStatusSourceForRestore(status, resolveEntityRef) {
  if (!status || typeof status !== 'object') return;
  const attackerId = resolveEntityRef(status.attackerRef);
  delete status.attackerRef;
  status.attackerId = attackerId == null ? null : attackerId;
}

function resetCombatState(state) {
  state.combat = {
    schemaVersion: COMBAT_SCHEMA_VERSION,
    beams: [],
    threatTables: new Map(),
    actions: { nextRequestSeq: 1, nextInstanceSeq: 1, requests: [], activeByActor: {}, cooldownReadyTickByActor: {} },
    entities: {},
    attachments: { nextId: 1, byId: {} },
    statusNextPendingSeq: 1,
  };
  return ensureCombatState(state);
}

function normalizedAttachmentNextId(savedNextId, byId) {
  let nextId = positiveInteger(savedNextId, 1);
  for (const id of Object.keys(byId || {})) {
    const match = /^att_(\d+)$/.exec(String(id));
    if (match) nextId = Math.max(nextId, Number(match[1]) + 1);
  }
  return nextId;
}

function normalizedStatusNextSeq(savedNextSeq, combatants) {
  let nextSeq = positiveInteger(savedNextSeq, 1);
  for (const runtime of Object.values(combatants || {})) {
    for (const pending of Array.isArray(runtime && runtime.pendingStatuses) ? runtime.pendingStatuses : []) {
      if (Number.isInteger(pending && pending.seq)) nextSeq = Math.max(nextSeq, pending.seq + 1);
    }
  }
  return nextSeq;
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value >= 1 ? value : fallback;
}

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clonePlain(value) {
  if (value == null) return value;
  const type = typeof value;
  if (type === 'number') return Number.isFinite(value) ? value : 0;
  if (type === 'string' || type === 'boolean') return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  if (type === 'object') {
    const out = {};
    for (const key in value) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      const next = clonePlain(value[key]);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return undefined;
}

function compareEntityKeys(a, b) {
  const an = Number(a), bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return compareText(String(a), String(b));
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
