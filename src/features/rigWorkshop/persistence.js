import { serializeCombatState, restoreCombatState } from '../../combat/persistence.js';
import { RIG_JOB_DEFS } from './jobs.js';
import { worldLedgerHoldsId } from '../../core/entity.js';
import { ensureCombatState } from '../../combat/runtime.js';
import { RIG_LIMITS, PARTS, RIG_ATTACHMENT_DEF, RIG_CAPTURE_DEF } from './parts.js';

export const RIG_WORKSHOP_SAVE_VERSION = 1;
const MAX_SAVE_BYTES = 750000;
const clone = value => JSON.parse(JSON.stringify(value));
const owns = (e, ownerId) => !!e && (e.data?.rigWorkshopOwner === ownerId || e.data?.rigWorkshop?.ownerId === ownerId || e.data?.rigWorkshopCargo?.ownerId === ownerId);
const stableToken = e => e?.data?.rigWorkshop?.token || e?.data?.rigWorkshopCargo?.token || e?.data?.worldRecordId || null;
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const validId = n => Number.isSafeInteger(n) && n > 0;
const allowedDefs = new Set([RIG_ATTACHMENT_DEF.id, RIG_CAPTURE_DEF.id, 'tether_standard']);

function serializeBody(e) {
  const row = {};
  for (const key of ['id', 'type', 'alive', 'factionId', 'ownerId', 'team', 'radius', 'mass', 'hull', 'hullMax', 'armorHp', 'armorMax', 'armorFlat',
    'shield', 'shieldMax', 'rot', 'angVel', 'collides', 'collisionMask', 'flags', 'data', 'physicsBody']) {
    if (e[key] !== undefined) row[key] = clone(e[key]);
  }
  if (Number.isFinite(row.hull)) row.hull = Math.max(0, Math.min(row.hullMax, row.hull));
  row.pos = { x: e.pos.x, z: e.pos.z };
  row.vel = { x: e.vel?.x || 0, z: e.vel?.z || 0 };
  return row;
}

/** Capture at the same authoritative save boundary as the normal envelope. Body
 * identity and the existing combat serializer's real spring state travel together. */
export function captureRigWorkshop(state, workshop = state.rigWorkshop) {
  if (!workshop) return null;
  const copy = clone(workshop);
  // Ghost previews and an open card are input presentation, not an unpaid edit.
  delete copy.preview; delete copy.ui; delete copy.prompt; delete copy.pendingPrompt;
  const bodies = [];
  for (const entity of state.entities.values()) if (owns(entity, workshop.ownerId)) bodies.push(serializeBody(entity));
  bodies.sort((a, b) => a.id - b.id);
  if (bodies.length > RIG_LIMITS.bodyRecords) throw new RangeError('Workshop save body bound exceeded');
  const ownedAttachmentIds = new Set();
  for (const rig of workshop.rigs || []) {
    for (const edge of rig.connections || []) for (const id of edge.attachmentIds || []) ownedAttachmentIds.add(id);
    if (rig.towAttachmentId) ownedAttachmentIds.add(rig.towAttachmentId);
  }
  const combat = serializeCombatState(state);
  combat.entities = [];
  combat.actions = { nextRequestSeq: 1, nextInstanceSeq: 1, requests: [], active: [], cooldowns: [] };
  combat.attachments.byId = Object.fromEntries(Object.entries(combat.attachments.byId).filter(([id]) => ownedAttachmentIds.has(id)));
  delete combat.lastPlayerDefeat;
  const result = { version: RIG_WORKSHOP_SAVE_VERSION, playerId: validId(state.playerId) ? state.playerId : null,
    workshop: copy, bodies, combat };
  if (JSON.stringify(result).length > MAX_SAVE_BYTES) throw new RangeError('Workshop save byte bound exceeded');
  return result;
}

function safeTree(value, depth = 0) {
  if (depth > 24) return false;
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.length <= 256 && value.every(v => safeTree(v, depth + 1));
  return Object.entries(value).every(([k, v]) => !['__proto__', 'prototype', 'constructor'].includes(k) && safeTree(v, depth + 1));
}
function validateJobs(w) {
  const jobs = w.jobs || {};
  if (typeof jobs !== 'object' || Array.isArray(jobs) || Object.keys(jobs).length > RIG_JOB_DEFS.length) return 'invalid_saved_jobs';
  const allIds = new Set(), allTokens = new Set();
  let signatures = 0;
  for (const [id, job] of Object.entries(jobs)) {
    const def = RIG_JOB_DEFS.find(d => d.id === id);
    if (!def || job.id !== id || !Array.isArray(job.cargo) || job.cargo.length !== def.count
      || !Array.isArray(job.cargoIds) || job.cargoIds.length !== def.count
      || !Array.isArray(job.obstacleIds) || job.obstacleIds.length > 4
      || !Array.isArray(job.delivered) || job.delivered.length > def.count
      || !finitePoint(job.pickup) || !finitePoint(job.destination)
      || !Number.isFinite(job.paid) || job.paid < 0 || job.paid > def.count * def.pay + 100) return 'invalid_saved_job';
    if (job.signatureAwarded) signatures++;
    const delivered = new Set(job.delivered);
    if (delivered.size !== job.delivered.length) return 'duplicate_job_delivery';
    for (const cargo of job.cargo) {
      if (!validId(cargo.id) || allIds.has(cargo.id) || typeof cargo.token !== 'string' || !cargo.token || allTokens.has(cargo.token)
        || !finitePoint(cargo.origin) || !Number.isFinite(cargo.travelled) || cargo.travelled < 0
        || (cargo.modifiedTravel != null && (!Number.isFinite(cargo.modifiedTravel) || cargo.modifiedTravel < 0))
        || !job.cargoIds.includes(cargo.id) || Boolean(cargo.paid) !== delivered.has(cargo.id)) return 'invalid_saved_original_cargo';
      allIds.add(cargo.id); allTokens.add(cargo.token);
    }
  }
  if (signatures > 1 || signatures === 1 && !w.signatureDone) return 'invalid_signature_receipt';
  if (w.activeJobId != null && (!jobs[w.activeJobId] || jobs[w.activeJobId].settled)) return 'invalid_active_job';
  if (!Array.isArray(w.receipts || []) || (w.receipts || []).length > 5) return 'invalid_receipt_bound';
  const receiptIds = new Set(), paidIds = new Set(), paidByJob = {};
  for (const r of w.receipts || []) {
    const job = jobs[r.jobId];
    if (typeof r.id !== 'string' || receiptIds.has(r.id) || !job || !Number.isFinite(r.amount) || r.amount < 0 || r.amount > 1000
      || !Array.isArray(r.cargoIds) || !r.cargoIds.length || r.cargoIds.length > job.cargo.length
      || !Number.isFinite(r.time) || r.time < 0) return 'invalid_saved_receipt';
    receiptIds.add(r.id); paidByJob[r.jobId] = (paidByJob[r.jobId] || 0) + r.amount;
    for (const id of r.cargoIds) {
      if (!job.delivered.includes(id) || paidIds.has(id)) return 'duplicate_cargo_receipt';
      paidIds.add(id);
    }
  }
  for (const job of Object.values(jobs)) if (job.paid !== (paidByJob[job.id] || 0)
    || job.delivered.some(id => !paidIds.has(id))) return 'receipt_total_mismatch';
  return null;
}
function validateSnapshot(raw) {
  if (!raw || raw.version !== RIG_WORKSHOP_SAVE_VERSION || !raw.workshop || !Array.isArray(raw.bodies)) return 'invalid_workshop_save';
  if (!safeTree(raw)) return 'invalid_workshop_value';
  if (JSON.stringify(raw).length > MAX_SAVE_BYTES) return 'workshop_save_too_large';
  const w = raw.workshop;
  if (raw.playerId != null && !validId(raw.playerId)) return 'invalid_saved_player';
  if (typeof w.ownerId !== 'string' || !w.ownerId || w.ownerId.length > 160 || (w.bench != null && !finitePoint(w.bench?.pos))) return 'invalid_workshop_owner';
  if (!Array.isArray(w.rigs) || w.rigs.length > RIG_LIMITS.rigs || raw.bodies.length > RIG_LIMITS.bodyRecords) return 'workshop_save_bounds';
  if (!Number.isFinite(w.stock) || w.stock < 0 || w.stock > 1000) return 'invalid_workshop_stock';
  if (!w.bench && (w.rigs.length || raw.bodies.length || Object.keys(w.jobs || {}).length)) return 'missing_workshop_bench';
  const jobsError = validateJobs(w); if (jobsError) return jobsError;
  const bodyIds = new Set(), tokens = new Set(), partIds = new Set(), rigIds = new Set(), cargoIds = new Set();
  for (const e of raw.bodies) {
    const token = stableToken(e);
    if (!validId(e.id) || e.id === raw.playerId || bodyIds.has(e.id) || !token || tokens.has(token) || !owns(e, w.ownerId)) return 'duplicate_or_foreign_workshop_body';
    if (!finitePoint(e.pos) || !finitePoint(e.vel) || !Number.isFinite(e.rot) || !Number.isFinite(e.hull) || !Number.isFinite(e.hullMax)
      || !(e.hullMax > 0) || e.hull < 0 || e.hull > e.hullMax || !Number.isFinite(e.radius) || e.radius <= 0 || e.radius > 1000
      || !Number.isFinite(e.mass) || e.mass <= 0 || e.mass > 1e9) return 'invalid_workshop_body';
    if (e.data?.rigWorkshop && !PARTS[e.data.rigWorkshop.partType]) return 'unknown_saved_part';
    bodyIds.add(e.id); tokens.add(token);
  }
  for (const rig of w.rigs) {
    if (typeof rig.id !== 'string' || !rig.id || rigIds.has(rig.id) || rig.ownerId !== w.ownerId
      || !Array.isArray(rig.partIds) || rig.partIds.length > RIG_LIMITS.partsPerRig
      || !Array.isArray(rig.connections) || rig.connections.length > RIG_LIMITS.connectionsPerRig
      || !Array.isArray(rig.cargoIds) || rig.cargoIds.length > RIG_LIMITS.cargoPerRig) return 'invalid_saved_rig';
    if (rig.rootId != null && !rig.partIds.includes(rig.rootId)) return 'invalid_saved_root';
    if (!Number.isSafeInteger(rig.nextPart) || rig.nextPart < 1 || !Number.isSafeInteger(rig.nextConnection) || rig.nextConnection < 1
      || !Number.isFinite(rig.revision) || rig.revision < 0) return 'invalid_saved_rig_counter';
    const retired = rig.retiredParts || [];
    if (!Array.isArray(retired) || retired.length > RIG_LIMITS.retiredParts) return 'invalid_retired_part_bound';
    const retiredTokens = new Set();
    for (const part of retired) {
      if (!validId(part.id) || rig.partTokens?.[part.id] === part.token || typeof part.token !== 'string' || !part.token
        || retiredTokens.has(part.token) || !Number.isFinite(part.retiredAt) || part.retiredAt < 0) return 'invalid_retired_part';
      retiredTokens.add(part.token);
    }
    if (new Set(rig.cargoIds).size !== rig.cargoIds.length || rig.cargoIds.some(id => !validId(id) || cargoIds.has(id)
      || typeof rig.cargoTokens?.[id] !== 'string' || !rig.cargoTokens[id])) return 'invalid_saved_cargo_membership';
    for (const id of rig.cargoIds) cargoIds.add(id);
    rigIds.add(rig.id);
    for (const id of rig.partIds) {
      if (!validId(id) || partIds.has(id) || typeof rig.partTokens?.[id] !== 'string' || !rig.partTokens[id]) return 'duplicate_saved_part';
      // Missing parts are allowed: absence means destruction, never a free respawn.
      const e = raw.bodies.find(row => row.id === id);
      if (e && (e.data?.rigWorkshop?.rigId !== rig.id || e.data?.rigWorkshop?.token !== rig.partTokens?.[id])) return 'saved_part_identity_mismatch';
      partIds.add(id);
    }
    const edgeIds = new Set();
    for (const edge of rig.connections) {
      if (typeof edge.id !== 'string' || edgeIds.has(edge.id) || !validId(edge.parentId) || !validId(edge.childId)
        || edge.parentId === edge.childId || !['structure', 'cargo'].includes(edge.kind)
        || !['pending', 'active', 'broken'].includes(edge.state) || !Array.isArray(edge.attachmentIds) || edge.attachmentIds.length > 3
        || !Array.isArray(edge.anchors) || edge.anchors.length > 3
        || edge.anchors.some(a => !finitePoint(a.source) || !finitePoint(a.target))) return 'invalid_saved_connection';
      edgeIds.add(edge.id);
      if (!rig.partIds.includes(edge.parentId) || (edge.kind === 'structure' && !rig.partIds.includes(edge.childId))) return 'foreign_saved_connection';
      if (edge.parentToken !== rig.partTokens[edge.parentId] || (edge.kind === 'structure' && edge.childToken !== rig.partTokens[edge.childId])
        || (edge.kind === 'cargo' && edge.childToken !== rig.cargoTokens[edge.childId])) return 'saved_connection_token_mismatch';
    }
    const edit = rig.pendingEdit;
    if (edit && (!rig.partIds.includes(edit.bodyId) || edit.stockCost !== 1 || !Number.isFinite(edit.tick) || edit.tick < 0
      || (edit.seed ? edit.edgeId != null : !edgeIds.has(edit.edgeId)))) return 'invalid_pending_edit';
    const repair = rig.pendingRepair;
    if (repair && (!Array.isArray(repair.edgeIds) || !repair.edgeIds.length || repair.edgeIds.length > RIG_LIMITS.connectionsPerRig
      || repair.edgeIds.some(id => !edgeIds.has(id)) || ![0, 1].includes(repair.cost))) return 'invalid_pending_repair';
  }
  if (w.rigs.reduce((sum, rig) => sum + (rig.pendingEdit?.stockCost || 0) + (rig.pendingRepair?.cost || 0), 0) > w.stock) return 'unfunded_pending_work';
  const undo = w.undo;
  if (undo) {
    const rig = w.rigs.find(r => r.id === undo.rigId);
    if (!rig || !validId(undo.bodyId) || rig.partTokens[undo.bodyId] !== undo.token || undo.stockCost !== 1
      || !Number.isFinite(undo.revision) || undo.revision < 0) return 'invalid_saved_undo';
  }
  const attachments = raw.combat?.attachments?.byId || {};
  if (Object.keys(attachments).length > RIG_LIMITS.rigs * (RIG_LIMITS.partsPerRig * 3 + RIG_LIMITS.cargoPerRig + 1)) return 'saved_attachment_bound';
  const allowedIds = new Set(w.rigs.flatMap(r => [...r.connections.flatMap(e => e.attachmentIds), ...(r.towAttachmentId ? [r.towAttachmentId] : [])]));
  for (const [id, a] of Object.entries(attachments)) {
    if (!allowedIds.has(id) || !/^att_\d+$/.test(id) || a.id !== id || !allowedDefs.has(a.defId) || a.state !== 'active'
      || !finitePoint(a.sourceAnchorLocal) || !finitePoint(a.targetAnchorLocal) || !Number.isFinite(a.restLength) || a.restLength < 0 || a.restLength > 1000) return 'invalid_saved_attachment';
    for (const ref of [a.ownerRef, a.targetRef]) if (!(ref?.kind === 'player' || ref?.kind === 'persistent' && bodyIds.has(Number(ref.saveId)))) return 'foreign_saved_attachment';
  }
  return null;
}

// Ordinary save restoration can legitimately move a numeric ID when sector regen
// already occupies it. The durable token is the identity; numeric references are
// rewritten together before any body or attachment is materialized.
function remapSnapshot(state, snapshot, provided) {
  const ownerId = snapshot.workshop.ownerId, ids = new Map(), liveTokens = new Map();
  const savedPlayerId = snapshot.playerId;
  if (savedPlayerId != null && !validId(state.playerId)) return 'workshop_player_unavailable';
  for (const e of state.entities.values()) {
    if (!owns(e, ownerId) || !stableToken(e)) continue;
    const token = stableToken(e);
    if (liveTokens.has(token)) return 'workshop_body_token_conflict';
    liveTokens.set(token, e.id);
  }
  const supplied = id => provided?.get?.(String(id)) ?? provided?.get?.(id) ?? null;
  const destinations = new Set();
  for (const body of snapshot.bodies) {
    const mapped = supplied(body.id), actual = liveTokens.get(stableToken(body));
    if (mapped != null && !validId(mapped)) return 'invalid_workshop_id_remap';
    if (mapped != null && actual != null && mapped !== actual) return 'workshop_body_remap_conflict';
    const next = actual ?? mapped ?? body.id;
    if (destinations.has(next)) return 'workshop_body_remap_collision';
    destinations.add(next); ids.set(body.id, next);
  }
  const remap = id => id == null ? id : Number(id) === savedPlayerId ? state.playerId : ids.get(Number(id)) ?? supplied(id) ?? id;
  const list = values => (values || []).map(remap);
  const keyed = values => Object.fromEntries(Object.entries(values || {}).map(([id, token]) => [remap(Number(id)), token]));
  const w = snapshot.workshop;
  if (w.bench) w.bench.entityId = remap(w.bench.entityId);
  if (w.undo) w.undo.bodyId = remap(w.undo.bodyId);
  for (const rig of w.rigs) {
    rig.partIds = list(rig.partIds); rig.partTokens = keyed(rig.partTokens);
    rig.cargoIds = list(rig.cargoIds); rig.cargoTokens = keyed(rig.cargoTokens);
    if (rig.rootId != null) rig.rootId = remap(rig.rootId);
    if (rig.pendingEdit) rig.pendingEdit.bodyId = remap(rig.pendingEdit.bodyId);
    // A retired numeric ID is historical evidence, not a live reference. The
    // allocator may since have reused it for a different token, so keep it as-is.
    for (const edge of rig.connections) {
      edge.parentId = remap(edge.parentId); edge.childId = remap(edge.childId);
    }
  }
  for (const job of Object.values(w.jobs || {})) {
    job.receiverId = remap(job.receiverId); job.cargoIds = list(job.cargoIds);
    job.obstacleIds = list(job.obstacleIds); job.delivered = list(job.delivered);
    for (const cargo of job.cargo) cargo.id = remap(cargo.id);
  }
  for (const receipt of w.receipts || []) receipt.cargoIds = list(receipt.cargoIds);
  for (const body of snapshot.bodies) {
    body.id = remap(body.id);
    if (typeof body.ownerId === 'number') body.ownerId = remap(body.ownerId);
    if (typeof body.data?.ownerId === 'number') body.data.ownerId = remap(body.data.ownerId);
    if (body.data?.rigWorkshopCargo?.receiverId != null) body.data.rigWorkshopCargo.receiverId = remap(body.data.rigWorkshopCargo.receiverId);
  }
  if (savedPlayerId != null) snapshot.playerId = state.playerId;
  for (const attachment of Object.values(snapshot.combat?.attachments?.byId || {})) {
    for (const key of ['ownerRef', 'targetRef', 'controllerRef']) {
      const ref = attachment[key];
      if (ref?.kind === 'persistent') ref.saveId = remap(Number(ref.saveId));
    }
  }
  return null;
}

/** Restore only this feature, after ordinary entity restoration and before combat's
 * native reconciliation. Repeating it adopts the exact same bodies and constraints.
 * A conflicting recycled ID is rejected rather than overwriting a foreign occupant. */
export function restoreRigWorkshop(state, raw, adapter, { entityIdRemap = state.sessionEntityIdRemap } = {}) {
  if (raw == null) { state.rigWorkshop = null; return { ok: true, workshop: null, restored: 0 }; }
  let checked, snapshot;
  try { checked = validateSnapshot(raw); if (!checked) snapshot = clone(raw); }
  catch { return { ok: false, reason: 'invalid_workshop_save' }; }
  if (checked) return { ok: false, reason: checked };
  if (!adapter?.spawnBody || !adapter?.removeBody) return { ok: false, reason: 'workshop_lifecycle_unavailable' };
  const remapError = remapSnapshot(state, snapshot, entityIdRemap);
  if (remapError) return { ok: false, reason: remapError };
  const mappedError = validateSnapshot(snapshot);
  if (mappedError) return { ok: false, reason: mappedError };
  const w = snapshot.workshop;
  for (const saved of snapshot.bodies) {
    if (!state.entities.has(saved.id) && worldLedgerHoldsId(state.world, saved.id)) return { ok: false, reason: 'workshop_body_id_reserved' };
    const existing = state.entities.get(saved.id);
    if (existing && (!owns(existing, w.ownerId) || stableToken(existing) !== stableToken(saved))) return { ok: false, reason: 'workshop_body_id_conflict' };
  }
  // All semantic/native attachment ids must be unoccupied or name this same pair.
  const current = state.combat?.attachments?.byId || {};
  const resolveRef = ref => ref?.kind === 'player' ? state.playerId
    : ref?.kind === 'persistent' ? Number(ref.saveId) : null;
  for (const [id, saved] of Object.entries(snapshot.combat?.attachments?.byId || {})) {
    const existing = current[id];
    if (existing && existing.state === 'active' && (existing.defId !== saved.defId || existing.ownerId !== resolveRef(saved.ownerRef)
      || existing.targetId !== resolveRef(saved.targetRef))) return { ok: false, reason: 'workshop_attachment_id_conflict' };
  }
  const created = [];
  try {
    for (const saved of snapshot.bodies) {
      if (state.entities.has(saved.id) || saved.alive === false || saved.hull <= 0) continue;
      const e = adapter.spawnBody(saved);
      if (!e || e.id !== saved.id || stableToken(e) !== stableToken(saved)) throw new Error('workshop_body_restore_rejected');
      created.push(e);
    }
  } catch (error) {
    for (const e of created.reverse()) adapter.removeBody(e);
    return { ok: false, reason: error.message || 'workshop_body_restore_rejected' };
  }
  // Delegate semantic attachment restoration to its existing owner on a private
  // shell. It rebinds occupant generations and deliberately drops native handles.
  const staging = { entities: state.entities, entityList: state.entityList, playerId: state.playerId, world: state.world, sites: state.sites };
  const summary = restoreCombatState(staging, snapshot.combat || {}, ref => {
    const id = resolveRef(ref); return state.entities.has(id) ? id : null;
  });
  ensureCombatState(state);
  for (const [id, a] of Object.entries(staging.combat.attachments.byId)) {
    if (state.combat.attachments.byId[id]?.state === 'active') continue;
    state.combat.attachments.byId[id] = a;
  }
  state.combat.attachments.nextId = Math.max(state.combat.attachments.nextId, staging.combat.attachments.nextId);
  for (const saved of snapshot.bodies) {
    const body = state.entities.get(saved.id);
    if (!body) continue;
    // Normal entity restoration may already have published this exact token. Rebind
    // only semantic pointers; adopting it must never rewind its current physical pose
    // or heal damage. The ordinary envelope does not remap non-projectile ownerId.
    let changed = false;
    if (typeof saved.ownerId === 'number' && body.ownerId !== saved.ownerId) { body.ownerId = saved.ownerId; changed = true; }
    if (typeof saved.data?.ownerId === 'number' && body.data.ownerId !== saved.data.ownerId) { body.data.ownerId = saved.data.ownerId; changed = true; }
    const receiverId = saved.data?.rigWorkshopCargo?.receiverId;
    if (receiverId != null && body.data?.rigWorkshopCargo && body.data.rigWorkshopCargo.receiverId !== receiverId) {
      body.data.rigWorkshopCargo.receiverId = receiverId; changed = true;
    }
    if (changed) adapter.markBodyChanged?.(body);
  }
  for (const rig of w.rigs) {
    rig.cargoTokens ||= {}; rig.partTokens ||= {};
    if (rig.pendingEdit) rig.pendingEdit.tick = state.tick || 0;
    for (const edge of rig.connections) {
      if (edge.state === 'broken') continue;
      const present = edge.attachmentIds.length > 0 && edge.attachmentIds.every(id => state.combat.attachments.byId[id]?.state === 'active');
      if (present) continue;
      // Only an unpaid constructor may retry. A saved snapped joint stays snapped.
      if (edge.state === 'pending' && edge.kind === 'structure') { edge.attachmentIds = []; edge.attempts = 0; }
      else { edge.state = 'broken'; edge.reason = 'saved_constraint_unavailable'; }
    }
    if (rig.towAttachmentId && state.combat.attachments.byId[rig.towAttachmentId]?.state !== 'active') { rig.towAttachmentId = null; rig.power = false; }
  }
  w.preview = null; w.templatesSeeded = !!w.templatesSeeded || w.rigs.length > 0;
  state.rigWorkshop = w;
  return { ok: true, workshop: w, restored: created.length, constraints: summary.restoredAttachments };
}
