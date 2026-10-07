import { COMBAT_SCHEMA_VERSION } from '../data/combatDefs.js';
import { ensureCombatState, entityKey, createCombatCatalog, resolveCombatProfile } from './runtime.js';
import { CERES_WORKFLEET_CONTRACT as CERES } from '../data/ceresWorkfleet.js';
import { ceresWorkfleetRoleForEntity } from '../data/ceresWorkfleetIdentity.js';
import { ceresWorkfleetHardwareRoleForRecord } from '../data/ceresWorkfleetHardware.js';

import { isHostileForAI } from '../ai/engagementAuthority.js';

// Detached custody only: pose/health remain with worldRecords and asteroidSites.
// A combat replacement invalidates this batch without retaining any prior run's objects.
const pendingCeresAttachments = new WeakMap();
const incomingConstraintLives = new WeakMap();
import { occupantGenerationOf } from '../core/entity.js';

export const COMBAT_SAVE_SCHEMA_VERSION = 1;

export function serializeCombatState(state) {
  const combat = state && state.combat;
  const refs = buildEntityRefs(state);
  const attachments = serializeAttachments(combat, buildAttachmentRefs(state, refs), state);
  const pending = pendingCeresAttachments.get(combat);
  for (const [id, entry] of pending || []) {
    // An immediate re-save must not resurrect custody invalidated without a spawn event.
    if (entry.ready && resolvePendingCeresAttachment(state, entry) === false) {
      pending.delete(id); continue;
    }
    if (!Object.hasOwn(combat.attachments.byId, id)) {
      const row=clonePlain(entry.saved);
      if(entry.hostileOwner)row.ownerRef={kind:'persistent',saveId:String(entry.hostileOwner.entity.id)};
      attachments.byId[id]=row;
    }
  }
  const savedAttachmentIds = new Set(Object.keys(attachments.byId));
  return {
    schemaVersion: COMBAT_SAVE_SCHEMA_VERSION,
    combatSchemaVersion: COMBAT_SCHEMA_VERSION,
    statusNextPendingSeq: positiveInteger(combat && combat.statusNextPendingSeq, 1),
    entities: serializeCombatants(combat, refs),
    actions: serializeActions(combat, refs, savedAttachmentIds),
    attachments,
    // A save written mid-defeat is legal (the defeated wreck serializes deliberately), so the
    // after-action receipt is a durable consequence, not session scratch: without it the restored
    // wreck loses both its recovery plan and combat's re-arm seam, and the player loads into a
    // dead hull with no reachable resolution. Plain data — clonePlain strips nothing it needs.
    lastPlayerDefeat: clonePlain(combat && combat.lastPlayerDefeat) || null,
  };
}

export function restoreCombatState(state, payload, resolveEntityRef, { deferCeresAttachments = false } = {}) {
  const combat = resetCombatState(state);
  if (!payload || typeof payload !== 'object' || typeof resolveEntityRef !== 'function') {
    return { restoredEntities: 0, restoredAttachments: 0, restoredActions: 0, restoredRequests: 0, dropped: 0 };
  }

  const summary = { restoredEntities: 0, restoredAttachments: 0, restoredActions: 0, restoredRequests: 0, dropped: 0 };
  // Restore runs after the sector's entities are spawned; generation tokens pin the resolved
  // endpoint ids to those bodies so a later id recycle cannot weld a restored line onto a
  // different occupant.
  const entityFor = (id) => state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(id) || null
    : null;
  restoreCombatants(combat, payload.entities, resolveEntityRef, summary);
  restoreAttachments(state, combat, payload.attachments, resolveEntityRef, entityFor, summary);
  if (!deferCeresAttachments) {
    const resumed = resumeCeresWorkfleetAttachments(state);
    summary.restoredAttachments += resumed.restoredAttachments;
    summary.dropped += resumed.dropped;
  }
  restoreActions(combat, payload.actions, resolveEntityRef, entityFor, summary);
  combat.attachments.nextId = normalizedAttachmentNextId(
    payload.attachments && payload.attachments.nextId,
    combat.attachments.byId, pendingCeresAttachments.get(combat),
  );
  combat.statusNextPendingSeq = normalizedStatusNextSeq(payload.statusNextPendingSeq, combat.entities);
  // The durable defeat receipt restores as data; whether the wreck is still owed recovery is
  // re-derived by combat's save:loaded boundary against the restored entity's defeated flag —
  // an absent field (older save) leaves null, never a fabricated receipt.
  combat.lastPlayerDefeat = clonePlain(payload.lastPlayerDefeat) || null;
  return summary;
}

function buildEntityRefs(state) {
  const refs = new Map(), incomingOwners=ceresWorkfleetHostileAttachmentOwners(state);
  const list = state && (state.entityList || (state.entities && [...state.entities.values()])) || [];
  for (const entity of list) {
    if (!entity || !entity.alive || entity.id == null) continue;
    let ref = null;
    if (entity.id === state.playerId) ref = { kind: 'player' };
    else if (ceresAttachmentRef(entity)) continue;
    else if (entity.flags && entity.flags.persistent || incomingOwners.has(entity.id)) ref = { kind: 'persistent', saveId: String(entity.id) };
    if (ref) refs.set(entityKey(entity.id), ref);
  }
  return refs;
}

// Do not enroll finite site/hardware bodies into generic combatant or entity persistence.
function buildAttachmentRefs(state, refs) {
  const result = new Map(refs);
  for (const entity of state?.entities?.values?.() || []) {
    if (!entity?.alive || entity.id == null) continue;
    const ref = ceresAttachmentRef(entity);
    if (ref) result.set(entityKey(entity.id), ref);
  }
  return result;
}

function ceresAttachmentRef(entity) {
  if (ceresWorkfleetRoleForEntity(entity) && !entity.data.worldSiteId) {
    if (entity.data.persistenceOwner != null && entity.data.persistenceOwner !== 'worldRecords') return null;
    return { kind: 'worldRecord', recordId: entity.data.worldRecordId };
  }
  if (entity?.type === 'wreck' && entity.data?.worldRecordId === CERES.identities.payload
      && entity.data.worldSiteId === CERES.siteId
      && entity.data.worldSitePayloadId === CERES.existing.section.payloadId
      && entity.data.worldSiteStructural === true && entity.mass === CERES.existing.section.mass) {
    if (entity.data.persistenceOwner != null && entity.data.persistenceOwner !== 'asteroidSites') return null;
    return { kind: 'worldSite', siteId: CERES.siteId,
      payloadId: CERES.existing.section.payloadId, worldObjectId: CERES.identities.payload };
  }
  return null;
}

function ceresRefKey(ref) {
  if (ref?.kind === 'worldRecord'
      && [CERES.identities.worker, CERES.identities.cradle, CERES.identities.cutterHead].includes(ref.recordId)) {
    return `record:${ref.recordId}`;
  }
  if (ref?.kind === 'worldSite' && ref.siteId === CERES.siteId
      && ref.payloadId === CERES.existing.section.payloadId && ref.worldObjectId === CERES.identities.payload) {
    return `site:${ref.worldObjectId}`;
  }
  return null;
}

const incomingCatalog=createCombatCatalog();
function savedConstraintShape(saved,id) {
  return saved?.state==='active'&&saved.id===id&&/^att_\d+$/.test(id)
    &&Number.isFinite(saved.restLength)&&saved.restLength>=0
    &&[saved.sourceAnchorLocal,saved.targetAnchorLocal].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z));
}
function isIncomingCeresConstraint(saved,id) {
  if(!savedConstraintShape(saved,id)||saved.controlMode==='ceres_workfleet'||!ceresRefKey(saved.targetRef))return false;
  if(saved.ownerRef?.kind==='player')return ['tether_standard','attachment_massline'].includes(saved.defId)
    &&(saved.controllerRef==null||saved.controllerRef.kind==='player')
    &&typeof saved.sourceSocketId==='string'&&typeof saved.targetSocketId==='string';
  return saved.defId==='attachment_massline'&&saved.controllerRef==null&&saved.ownerRef?.kind==='persistent'
    &&typeof saved.ownerRef.saveId==='string'&&/^\d+$/.test(saved.ownerRef.saveId)&&saved.sourceSocketId==='socket_massline'
    &&saved.targetSocketId===(saved.targetRef.kind==='worldSite'?'socket_tether_anchor':'socket_hull');
}
export function ceresWorkfleetIncomingSavedOwnerIds(payload) {
  const ids=new Set();
  for(const [id,row] of Object.entries(payload?.attachments?.byId||{}))if(isIncomingCeresConstraint(row,id)&&row.ownerRef.kind==='persistent')ids.add(row.ownerRef.saveId);
  return ids;
}
function hostileOwnerEligible(state,owner) {
  return !!owner&&state.entities?.get(owner.id)===owner&&owner.alive!==false&&owner.hull>0&&owner.type==='ship'
    &&Number.isSafeInteger(owner.occupantGeneration)&&owner.id!==state.playerId&&owner.team===1
    &&!owner.playerOwned&&!owner.data?.playerOwned&&!owner.data?.controlLease&&!owner.data?.disabled
    &&!owner.data?.worldRecordId&&!owner.data?.worldSiteId&&!owner.data?.persistenceOwner
    &&owner.data?.ai?.spawnContext==='encounter'&&owner.data.ai.combatDoctrineId==='tether_control_raider'
    &&typeof owner.data.ai.encounterId==='string'&&owner.data.ai.encounterId.length>0
    &&(state.entityList||[...state.entities.values()]).filter(e=>e?.id===owner.id).length===1;
}
function incomingSocketsEligible(owner,target,row) {
  const source=resolveCombatProfile(owner,incomingCatalog)?.sockets.find(s=>s.id===row.sourceSocketId);
  const receiver=resolveCombatProfile(target,incomingCatalog)?.sockets.find(s=>s.id===row.targetSocketId);
  const def=incomingCatalog.attachments.get(row.defId);
  return !!source&&!!receiver&&!!def?.sourceSocketTags.some(tag=>source.tags.includes(tag))&&def.targetSocketTags.some(tag=>receiver.tags.includes(tag));
}
function temporaryHostileConstraint(state,row) {
  if(row?.state!=='active'||row.defId!=='attachment_massline'||row.controllerId!=null||row.controlMode==='ceres_workfleet')return false;
  const owner=state.entities?.get(row.ownerId),target=state.entities?.get(row.targetId),prior=incomingConstraintLives.get(row);
  if(prior&&(prior.state!==state||prior.owner!==owner||prior.target!==target
    ||prior.ownerLife!==owner?.occupantGeneration||prior.targetLife!==target?.occupantGeneration))return false;
  const eligible=hostileOwnerEligible(state,owner)&&!!ceresAttachmentRef(target)&&target.alive!==false&&target.hull>0
    &&row.sourceSocketId==='socket_massline'&&row.targetSocketId===(target.data.worldSiteId?'socket_tether_anchor':'socket_hull')
    &&incomingSocketsEligible(owner,target,row)&&isHostileForAI(state,owner,target);
  if(eligible&&!prior)incomingConstraintLives.set(row,{state,owner,target,ownerLife:owner.occupantGeneration,targetLife:target.occupantGeneration});
  return eligible;
}
function playerOwnerEligible(state,owner) {
  return !!owner&&owner.id===state.playerId&&state.entities?.get(owner.id)===owner&&owner.alive!==false&&owner.hull>0
    &&Number.isSafeInteger(owner.occupantGeneration)&&(state.entityList||[...state.entities.values()]).filter(e=>e?.id===owner.id).length===1;
}
function currentPlayerConstraint(state,row) {
  if(row?.state!=='active'||!['tether_standard','attachment_massline'].includes(row.defId)||row.controlMode==='ceres_workfleet'
    ||row.controllerId!=null&&row.controllerId!==state.playerId)return false;
  const owner=state.entities?.get(row.ownerId),target=state.entities?.get(row.targetId),prior=incomingConstraintLives.get(row);
  if(prior&&(prior.state!==state||prior.owner!==owner||prior.target!==target
    ||prior.ownerLife!==owner?.occupantGeneration||prior.targetLife!==target?.occupantGeneration))return false;
  const eligible=playerOwnerEligible(state,owner)&&owner!==target&&!!ceresAttachmentRef(target)&&target.alive!==false&&target.hull>0
    &&incomingSocketsEligible(owner,target,row);
  if(eligible&&!prior)incomingConstraintLives.set(row,{state,owner,target,ownerLife:owner.occupantGeneration,targetLife:target.occupantGeneration});
  return eligible;
}
/** Existing generic actor encoding only for the finite hostile owners currently constraining Ceres. */
export function ceresWorkfleetHostileAttachmentOwners(state) {
  const ids=new Set();
  for(const row of Object.values(state?.combat?.attachments?.byId||{}))if(temporaryHostileConstraint(state,row))ids.add(row.ownerId);
  for(const entry of pendingCeresAttachments.get(state?.combat)?.values()||[])if(entry.hostileOwner) {
    const {entity,life}=entry.hostileOwner;
    if(entity.occupantGeneration===life&&hostileOwnerEligible(state,entity)
      &&(!entry.ready||resolvePendingCeresAttachment(state,entry)!==false))ids.add(entity.id);
  }
  return ids;
}
function resolveIncomingCeresConstraint(state,entry) {
  const lease=entry.playerOwner||entry.hostileOwner,owner=lease.entity,isPlayer=!!entry.playerOwner;
  if(owner.occupantGeneration!==lease.life||!(isPlayer?playerOwnerEligible(state,owner):hostileOwnerEligible(state,owner)))return false;
  const target=resolveCeresAttachmentEntity(state,entry.saved.targetRef,entry.leases,!isPlayer);
  if(target===false)return false;if(target==null)return null;
  if(owner===target||!incomingSocketsEligible(owner,target,entry.saved)||!isPlayer&&!isHostileForAI(state,owner,target))return false;
  const existing=Object.values(state.combat.attachments.byId).filter(a=>a.state==='active');
  if(existing.some(a=>a.ownerId===owner.id&&a.sourceSocketId===entry.saved.sourceSocketId))return false;
  const socket=resolveCombatProfile(target,incomingCatalog).sockets.find(s=>s.id===entry.saved.targetSocketId);
  if(existing.filter(a=>a.targetId===target.id&&a.targetSocketId===socket.id).length>=socket.maxAttachments)return false;
  return [owner,target];
}

// Body references do not grant industrial custody. Save uses these four exact identities to
// remap observers onto the bodies reconstructed by their existing durable owners.
export { ceresAttachmentRef as ceresWorkfleetEntityRef, ceresRefKey as ceresWorkfleetRefKey };
export function resolveCeresWorkfleetEntityRef(state, ref) {
  return resolveCeresAttachmentEntity(state, ref, new Map(), false);
}

function isCeresSavedAttachment(saved, id) {
  if (!saved || saved.state !== 'active' || saved.id !== id || !/^att_\d+$/.test(id)
      || !ceresRefKey(saved.ownerRef) || !ceresRefKey(saved.targetRef) || saved.controllerRef != null
      || !Number.isFinite(saved.restLength) || saved.restLength < 0
      || ![saved.sourceAnchorLocal, saved.targetAnchorLocal].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.z))) return false;
  const owner = saved.ownerRef.recordId, target = saved.targetRef;
  return saved.controlMode === 'ceres_workfleet' && (
    saved.defId === 'attachment_transport_clamp' && owner === CERES.identities.cutterHead
      && target.kind === 'worldRecord' && target.recordId === CERES.identities.worker
      && saved.sourceSocketId === 'SOCKET_Mount' && saved.targetSocketId === 'SOCKET_Cutter_Dock'
    || saved.defId === 'tether_standard' && owner === CERES.identities.worker && target.kind === 'worldSite'
      && saved.sourceSocketId === 'SOCKET_Tether_Massline' && saved.targetSocketId === 'socket_tether_anchor'
    || saved.defId === 'attachment_transport_clamp' && owner === CERES.identities.cradle && target.kind === 'worldSite'
      && saved.sourceSocketId === 'SOCKET_Service_Head' && saved.targetSocketId === 'socket_tether_anchor');
}

export function hasPendingCeresWorkfleetAttachments(state, attachmentId = null) {
  const pending = pendingCeresAttachments.get(state?.combat);
  return attachmentId == null ? !!pending?.size : !!pending?.has(String(attachmentId));
}

export function cancelPendingCeresWorkfleetAttachments(state) {
  if (state?.combat) pendingCeresAttachments.delete(state.combat);
}

// Called only after incoming durable owners have deserialized. Missing live bodies may wait for
// their normal materialization event; invalid durable ownership or a replaced life is terminal.
export function resumeCeresWorkfleetAttachments(state) {
  const combat = state?.combat, pending = pendingCeresAttachments.get(combat);
  const summary = { restoredAttachments: 0, dropped: 0, pending: 0 };
  if (!pending) return summary;
  for (const [id, entry] of pending) {
    entry.ready = true;
    const endpoints = resolvePendingCeresAttachment(state, entry);
    if (Object.hasOwn(combat.attachments.byId, id) || endpoints === false) {
      pending.delete(id); summary.dropped++; continue;
    }
    if (endpoints == null) continue;
    const [owner, target] = endpoints;
    const saved = entry.saved;
    const attachment = clonePlain(saved);
    delete attachment.ownerRef; delete attachment.targetRef; delete attachment.controllerRef;
    delete attachment.controllerId;
    attachment.ownerId = owner.id; attachment.targetId = target.id;
    attachment.ownerGeneration = occupantGenerationOf(owner);
    attachment.targetGeneration = occupantGenerationOf(target);
    attachment.controllerGeneration = entry.playerOwner && saved.controllerRef ? occupantGenerationOf(owner) : null;
    attachment.physicsHandle = null;
    combat.attachments.byId[id] = attachment;
    if(entry.playerOwner&&entry.saved.controllerRef)attachment.controllerId=owner.id;
    if(entry.hostileOwner||entry.playerOwner)incomingConstraintLives.set(attachment,{state,owner,target,ownerLife:owner.occupantGeneration,targetLife:target.occupantGeneration});
    combat.attachments.revision = (combat.attachments.revision || 0) + 1;
    pending.delete(id); summary.restoredAttachments++;
  }
  summary.pending = pending.size;
  if (!pending.size) pendingCeresAttachments.delete(combat);
  return summary;
}

function resolvePendingCeresAttachment(state, entry) {
  if(entry.hostileOwner||entry.playerOwner)return resolveIncomingCeresConstraint(state,entry);
  for(const other of pendingCeresAttachments.get(state.combat)?.values()||[])if(other.playerOwner
    &&playerOwnerEligible(state,other.playerOwner.entity)&&other.playerOwner.life===other.playerOwner.entity.occupantGeneration
    &&[entry.saved.ownerRef,entry.saved.targetRef].some(ref=>ceresRefKey(ref)===ceresRefKey(other.saved.targetRef)))return false;
  if (CERES.persistence.terminalStates.includes(state.npcJobs?.ceresWorkfleet?.phase)
      && state.npcJobs.ceresWorkfleet.phase !== 'secured') return false;
  const endpoints = [entry.saved.ownerRef, entry.saved.targetRef]
    .map(ref => resolveCeresAttachmentEntity(state, ref, entry.leases));
  if (endpoints.some(e => e === false)) return false;
  const ids = endpoints.filter(Boolean).map(e => e.id);
  // Custody acquired while residency was cold outranks an obsolete saved industrial joint.
  const foreignCustody = Object.values(state.combat.attachments.byId).some(a => a?.state === 'active'
    && (endpoints[0] && a.ownerId === endpoints[0].id && a.sourceSocketId === entry.saved.sourceSocketId
      || a.controlMode !== 'ceres_workfleet'
        && [a.ownerId, a.targetId, a.controllerId].some(key => ids.includes(key))
        && !temporaryHostileConstraint(state,a)));
  if (foreignCustody) return false;
  if (endpoints.some(e => e == null)) return null;
  return endpoints[0] === endpoints[1] ? false : endpoints;
}

function resolveCeresAttachmentEntity(state, ref, leases, custody = true) {
  const key = ceresRefKey(ref);
  if (!key) return false;
  const recordId = ref.kind === 'worldRecord' ? ref.recordId : ref.worldObjectId;
  if (ref.kind === 'worldRecord') {
    const record = state.world?.records?.byId?.[ref.recordId];
    if (!record || record.recordId !== ref.recordId || record.alive === false
        || ['destroyed', 'defeated'].includes(record.outcome) || custody && record.playerOwned === true
        || !ceresWorkfleetHardwareRoleForRecord(record)) return false;
  } else {
    const site = state.sites?.worldById?.[ref.siteId], payload = site?.payloads?.[ref.payloadId];
    if (!site || site.manifestId !== CERES.siteId || site.sectorId !== CERES.sectorId || !payload || payload.destroyed
        || !['stowed', 'released'].includes(payload.status) || payload.remainingHull <= 0) return false;
  }
  const lease = leases.get(key);
  if (lease && (state.entities?.get(lease.entity.id) !== lease.entity || lease.entity.alive === false
      || lease.entity.occupantGeneration !== lease.life)) return false;
  const matches = [...(state.entities?.values?.() || [])].filter(e => e?.data?.worldRecordId === recordId);
  if (!matches.length) return lease ? false : null;
  if (matches.length !== 1) return false;
  const entity = matches[0];
  if (!entity.alive || entity.hull <= 0 || ceresRefKey(ceresAttachmentRef(entity)) !== key
      || custody && (entity.id === state.playerId || entity.playerOwned === true || entity.data.playerOwned === true
        || entity.data.controlLease || entity.data.disabled === true)) return false;
  if (lease && lease.entity !== entity) return false;
  leases.set(key, { entity, life: entity.occupantGeneration });
  return entity;
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

function serializeAttachments(combat, refs, state) {
  const byId = {};
  const attachments = combat && combat.attachments && combat.attachments.byId &&
    typeof combat.attachments.byId === 'object' ? combat.attachments.byId : {};
  for (const id of Object.keys(attachments).sort(compareText)) {
    const attachment = attachments[id];
    if (!attachment || attachment.state !== 'active' || attachment.defId === 'attachment_brood_grip') continue;
    const ownerRef = refs.get(entityKey(attachment.ownerId));
    const targetRef = refs.get(entityKey(attachment.targetId));
    const controllerRef = attachment.controllerId == null
      ? null
      : refs.get(entityKey(attachment.controllerId));
    if (!ownerRef || !targetRef || (attachment.controllerId != null && !controllerRef)) continue;
    const saved = clonePlain(attachment);
    delete saved.ownerId;
    delete saved.targetId;
    delete saved.controllerId;
    // Occupant generations are this-run occupant proofs, not durable identity — the ids they
    // pin are remapped by resolveEntityRef on restore, and re-stamped there against the bodies
    // that actually spawned.
    delete saved.ownerGeneration;
    delete saved.targetGeneration;
    delete saved.controllerGeneration;
    delete saved.physicsHandle;
    saved.ownerRef = clonePlain(ownerRef);
    saved.targetRef = clonePlain(targetRef);
    if (controllerRef) saved.controllerRef = clonePlain(controllerRef);
    saved.state = 'active';
    if ((saved.controlMode === 'ceres_workfleet'
        || [ownerRef, targetRef, controllerRef].some(ref => ref?.kind === 'worldRecord' || ref?.kind === 'worldSite'))
        && !isCeresSavedAttachment(saved, id)
        && !(isIncomingCeresConstraint(saved,id)&&(temporaryHostileConstraint(state,attachment)||currentPlayerConstraint(state,attachment)))) continue;
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
    delete saved.actorGeneration;
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
    delete saved.actorGeneration;
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

function restoreAttachments(state, combat, savedAttachments, resolveEntityRef, entityFor, summary) {
  const byId = savedAttachments && savedAttachments.byId && typeof savedAttachments.byId === 'object'
    ? savedAttachments.byId
    : {};
  for (const id of Object.keys(byId).sort(compareText)) {
    const saved = byId[id];
    if (!saved || saved.state !== 'active') continue;
    if (saved.defId === 'attachment_brood_grip') { summary.dropped++; continue; }
    if (saved.controlMode === 'ceres_workfleet'
        || [saved.ownerRef, saved.targetRef, saved.controllerRef].some(ref => ref?.kind === 'worldRecord' || ref?.kind === 'worldSite')) {
      const incoming=isIncomingCeresConstraint(saved,id);
      if (!isCeresSavedAttachment(saved, id)&&!incoming) { summary.dropped++; continue; }
      const owner=incoming?state.entities?.get(resolveEntityRef(saved.ownerRef)):null;
      const playerIncoming=incoming&&saved.ownerRef.kind==='player';
      if(incoming&&!(playerIncoming?playerOwnerEligible(state,owner):hostileOwnerEligible(state,owner))){summary.dropped++;continue;}
      let pending = pendingCeresAttachments.get(combat);
      if (!pending) pendingCeresAttachments.set(combat, pending = new Map());
      pending.set(id, { saved: clonePlain(saved), leases: new Map(),
        ...(incoming?{[playerIncoming?'playerOwner':'hostileOwner']:{entity:owner,life:owner.occupantGeneration}}:{}) });
      continue;
    }
    const ownerId = resolveEntityRef(saved.ownerRef);
    const targetId = resolveEntityRef(saved.targetRef);
    const controllerId = saved.controllerRef == null ? null : resolveEntityRef(saved.controllerRef);
    if (ownerId == null || targetId == null || ownerId === targetId
        || (saved.controllerRef != null && controllerId == null)) { summary.dropped++; continue; }
    const attachment = clonePlain(saved);
    delete attachment.ownerRef;
    delete attachment.targetRef;
    delete attachment.controllerRef;
    attachment.id = String(attachment.id || id);
    attachment.ownerId = ownerId;
    attachment.targetId = targetId;
    if (controllerId != null) attachment.controllerId = controllerId;
    else delete attachment.controllerId;
    // Re-pin endpoint identity to the bodies that actually spawned this run; serialize strips
    // these fields, so a restored record gets its proofs from the resolved ids, not the save.
    attachment.ownerGeneration = occupantGenerationOf(entityFor(ownerId));
    attachment.targetGeneration = occupantGenerationOf(entityFor(targetId));
    attachment.controllerGeneration = controllerId != null ? occupantGenerationOf(entityFor(controllerId)) : null;
    attachment.physicsHandle = null;
    attachment.state = 'active';
    attachment.restLength = positiveNumber(attachment.restLength, 0);
    attachment.lastTension = positiveNumber(attachment.lastTension, 0);
    attachment.lastImpulse = positiveNumber(attachment.lastImpulse, 0);
    combat.attachments.byId[attachment.id] = attachment;
    summary.restoredAttachments++;
  }
}

function restoreActions(combat, savedActions, resolveEntityRef, entityFor, summary) {
  if (!savedActions || typeof savedActions !== 'object') return;
  combat.actions.nextRequestSeq = positiveInteger(savedActions.nextRequestSeq, 1);
  combat.actions.nextInstanceSeq = positiveInteger(savedActions.nextInstanceSeq, 1);

  for (const entry of Array.isArray(savedActions.cooldowns) ? savedActions.cooldowns : []) {
    const actorId = resolveEntityRef(entry && entry.actorRef);
    if (actorId == null) { summary.dropped++; continue; }
    combat.actions.cooldownReadyTickByActor[entityKey(actorId)] = clonePlain(entry.cooldownReadyTick) || {};
  }

  for (const saved of Array.isArray(savedActions.requests) ? savedActions.requests : []) {
    const request = restoreActionRecord(saved, resolveEntityRef, entityFor, combat.attachments.byId);
    if (!request) { summary.dropped++; continue; }
    combat.actions.requests.push(request);
    summary.restoredRequests++;
  }
  combat.actions.requests.sort((a, b) => (a.notBeforeTick || 0) - (b.notBeforeTick || 0) || (a.seq || 0) - (b.seq || 0));

  const active = Array.isArray(savedActions.active) ? [...savedActions.active] : [];
  active.sort((a, b) => (a && a.seq || 0) - (b && b.seq || 0));
  for (const saved of active) {
    const instance = restoreActionRecord(saved, resolveEntityRef, entityFor, combat.attachments.byId);
    if (!instance) { summary.dropped++; continue; }
    combat.actions.activeByActor[entityKey(instance.actorId)] = instance;
    summary.restoredActions++;
  }
}

function restoreActionRecord(saved, resolveEntityRef, entityFor, attachmentsById) {
  const actorId = resolveEntityRef(saved && saved.actorRef);
  if (actorId == null) return null;
  const target = restoreTarget(saved && saved.target, resolveEntityRef, entityFor, attachmentsById);
  if (!target) return null;
  const record = clonePlain(saved);
  delete record.actorRef;
  record.actorId = actorId;
  record.actorGeneration = occupantGenerationOf(entityFor(actorId));
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

function restoreTarget(target, resolveEntityRef, entityFor, attachmentsById) {
  if (!target || target.kind === 'none') return { kind: 'none' };
  if (target.kind === 'entity') {
    const entityId = resolveEntityRef(target.entityRef);
    if (entityId == null) return null;
    return {
      kind: 'entity',
      entityId,
      entityGeneration: occupantGenerationOf(entityFor(entityId)),
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

function normalizedAttachmentNextId(savedNextId, byId, pending = null) {
  let nextId = positiveInteger(savedNextId, 1);
  for (const id of [...Object.keys(byId || {}), ...(pending?.keys() || [])]) {
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
