import { getCombatKernel } from '../../combat/kernel.js';
import { entityLocalPointToWorld, worldPointToEntityLocal } from '../../combat/geometry.js';
import { physicsBodyNativeReady, queuePhysicsImpulse, readPhysicsTelemetry } from '../../core/physicsAuthority.js';
import { markDirty, DIRTY } from '../../core/dirtyJournal.js';
import { worldLedgerHoldsId } from '../../core/entity.js';
import { PARTS, MOUNTS, RIG_TEMPLATES, RIG_LIMITS, RIG_COMBAT_PROFILE, RIG_ATTACHMENT_DEF, RIG_CAPTURE_DEF, partBodySpec } from './parts.js';

const distance = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.z || 0) - (b?.z || 0));
const speed = e => Math.hypot(e?.vel?.x || 0, e?.vel?.z || 0);
const fail = reason => ({ ok: false, reason });
const alive = e => !!e && e.alive !== false && (e.hull == null || e.hull > 0);

/** Concrete adapter over the canonical entity lifecycle, combat attachment service,
 * and physics command membrane. It never integrates a pose or assigns a velocity. */
export function createRigPhysicsAdapter(ctx) {
  const { state, bus } = ctx;
  const helpers = ctx.helpers || (ctx.helpers = {});
  const kernel = getCombatKernel(ctx);
  kernel.catalog.profiles.set(RIG_COMBAT_PROFILE.id, RIG_COMBAT_PROFILE);
  kernel.catalog.attachments.set(RIG_ATTACHMENT_DEF.id, RIG_ATTACHMENT_DEF);
  kernel.catalog.attachments.set(RIG_CAPTURE_DEF.id, RIG_CAPTURE_DEF);
  const attachments = kernel.attachments;
  const motorPresentation = new WeakMap();
  let disposed = false;
  const player = () => state.entities.get(state.playerId ?? state.player?.entityId ?? state.player?.id);
  const entity = id => state.entities.get(id);
  const rigFor = (w, id) => w.rigs?.find(r => r.id === (id ?? w.activeRigId));
  const ownedPart = (w, rig, id) => {
    const e = entity(id);
    return e?.data?.rigWorkshop?.ownerId === w.ownerId && e.data.rigWorkshop.rigId === rig.id
      && (!rig.partTokens?.[id] || e.data.rigWorkshop.token === rig.partTokens[id]) ? e : null;
  };
  const emit = (type, detail = {}) => bus?.emit?.(type, detail);
  const change = (w, text) => { w.revision = (w.revision || 0) + 1; w.notice = text; };
  const touch = e => markBodyChanged(e, DIRTY.COMBAT);
  const templateOrigin = (w, rig) => ({ x: w.bench.pos.x + (rig.template === 'sled' ? -48 : 48), z: w.bench.pos.z + 40 });
  const availableStock = w => w.stock - (w.rigs || []).reduce((sum, rig) =>
    sum + (rig.pendingEdit?.stockCost || 0) + (rig.pendingRepair?.cost || 0), 0);
  const ownedBodyCount = ownerId => [...state.entities.values()].filter(e => e.data?.rigWorkshopOwner === ownerId
    || e.data?.rigWorkshop?.ownerId === ownerId || e.data?.rigWorkshopCargo?.ownerId === ownerId).length;

  function spawnBody(spec) {
    if (disposed || typeof helpers.spawnEntity !== 'function') return null;
    if (spec.id != null && state.entities.has(spec.id)) return null;
    const ownerId = spec.data?.rigWorkshopOwner || spec.data?.rigWorkshop?.ownerId || spec.data?.rigWorkshopCargo?.ownerId;
    if (ownerId && ownedBodyCount(ownerId) >= RIG_LIMITS.bodyRecords) return null;
    let recordId = spec.data?.worldRecordId || spec.data?.rigWorkshopCargo?.token;
    if (!recordId) {
      const w = state.rigWorkshop;
      let serial = Math.max(1, Number(w?.nextBodyToken) || 1);
      const tokens = new Set([...state.entities.values()].map(e => e.data?.worldRecordId));
      do { recordId = `${ownerId || 'rigWorkshop'}:body:${serial++}`; } while (tokens.has(recordId));
      if (w) w.nextBodyToken = serial;
    }
    const result = helpers.spawnEntity({ ...spec, flags: { ...spec.flags, persistent: true },
      data: { ...spec.data, transientSector: false, persistent: true,
        worldRecordId: recordId },
    });
    return result && result.id != null ? result : null;
  }
  function removeBody(bodyOrId) {
    const body = typeof bodyOrId === 'object' ? bodyOrId : entity(bodyOrId);
    if (!body || entity(body.id) !== body) return false;
    for (const a of attachments.listForEntity(body.id)) attachments.cut(a.id, null, 'rig_workshop_edit');
    if (typeof helpers.removeEntity !== 'function') return false;
    return helpers.removeEntity(body.id, { immediate: true, reason: 'rig_workshop_edit' });
  }
  function markBodyChanged(bodyOrId, mask = DIRTY.CARGO | DIRTY.COMBAT) {
    const body = typeof bodyOrId === 'object' ? bodyOrId : entity(bodyOrId);
    if (!body || entity(body.id) !== body) return false;
    markDirty(state, body.id, mask);
    helpers.markEntityVisualChanged?.(body);
    return true;
  }
  function publishMotorThrottle(body, throttle) {
    body.data.rigWorkshop.throttle = throttle;
    const direction = Math.abs(throttle) > .01 ? Math.sign(throttle) : 0;
    const previous = motorPresentation.get(body), now = state.simTime || 0;
    // The view needs direction and idle, not every force scalar. Publish through
    // the existing worker journal only on those changes, at most ten times/sec.
    if ((!previous || previous.direction !== direction) && (!previous || now - previous.at >= .1)) {
      motorPresentation.set(body, { direction, at: now });
      markBodyChanged(body, DIRTY.COMBAT);
    }
  }
  function nearBench(w, rig = null) {
    const p = player();
    if (!alive(p) || !w.bench?.pos || distance(p.pos, w.bench.pos) > RIG_LIMITS.editRadius) return false;
    if (rig) {
      if (rig.power) return false;
      const bodies = rig.partIds.map(id => ownedPart(w, rig, id)).filter(alive);
      if ((!bodies.length && rig.partIds.length) || bodies.some(e => distance(e.pos, w.bench.pos) > RIG_LIMITS.editRadius || speed(e) > 12)) return false;
    }
    return true;
  }
  function createPart(w, rig, type, pos, rot = 0) {
    const serial = Math.max(1, Number(rig.nextPart) || 1);
    const token = `${rig.id}:part:${serial}`;
    const body = spawnBody(partBodySpec(type, pos, { rigId: rig.id, ownerId: w.ownerId, partToken: token, rot }));
    if (!body) return null;
    rig.nextPart = serial + 1;
    rig.partIds.push(body.id);
    (rig.partTokens || (rig.partTokens = {}))[body.id] = token;
    rig.rootId ||= body.id;
    return body;
  }
  function makeConnection(rig, parent, child, kind = 'structure') {
    const serial = Math.max(1, Number(rig.nextConnection) || 1);
    rig.nextConnection = serial + 1;
    const dx = child.pos.x - parent.pos.x, dz = child.pos.z - parent.pos.z;
    const d = Math.max(.01, Math.hypot(dx, dz)), nx = dx / d, nz = dz / d;
    const w = Math.min(parent.radius, child.radius) * .85;
    // Three short native lashings at separate points keep the assembly legible;
    // off-centre forces, native collision contacts and actual load set its flex.
    const anchorPairs = [-1, 1, 0].map((side, i) => {
      const source = { x: parent.pos.x + nx * parent.radius * .55 - nz * w * side,
        z: parent.pos.z + nz * parent.radius * .55 + nx * w * side };
      const targetSide = i === 2 ? 1 : side;
      const target = { x: child.pos.x - nx * child.radius * .55 - nz * w * targetSide,
        z: child.pos.z - nz * child.radius * .55 + nx * w * targetSide };
      return { source: worldPointToEntityLocal(parent, source), target: worldPointToEntityLocal(child, target) };
    });
    const edge = { id: `${rig.id}:joint:${serial}`, parentId: parent.id, childId: child.id,
      parentToken: parent.data?.rigWorkshop?.token || parent.data?.rigWorkshopCargo?.token,
      childToken: child.data?.rigWorkshop?.token || child.data?.rigWorkshopCargo?.token,
      kind, anchors: anchorPairs, attachmentIds: [], state: 'pending', stress: 0, attempts: 0 };
    rig.connections.push(edge);
    return edge;
  }
  function endpointsCurrent(edge) {
    const a = entity(edge.parentId), b = entity(edge.childId);
    const token = e => e?.data?.rigWorkshop?.token || e?.data?.rigWorkshopCargo?.token || e?.data?.worldRecordId;
    return alive(a) && alive(b) && (!edge.parentToken || token(a) === edge.parentToken)
      && (!edge.childToken || token(b) === edge.childToken) ? [a, b] : null;
  }
  function connect(edge) {
    const pair = endpointsCurrent(edge);
    if (!pair) { edge.state = 'broken'; edge.reason = 'part_missing'; return false; }
    const [a, b] = pair;
    if (!physicsBodyNativeReady(a) || !physicsBodyNativeReady(b)) {
      edge.attempts++; edge.reason = 'native_body_unavailable'; return false;
    }
    const existing = edge.attachmentIds.map(id => attachments.get(id)).filter(a => a?.state === 'active');
    if (existing.length === edge.anchors.length) { edge.state = 'active'; return true; }
    // Admission is atomic from the player's point of view: partial native joint
    // construction rolls back, and the material stock is untouched until all hold.
    if (existing.length) for (const line of existing) attachments.cut(line.id, null, 'rig_workshop_rebuild');
    edge.attachmentIds = [];
    for (const anchors of edge.anchors) {
      const created = attachments.create({ defId: RIG_ATTACHMENT_DEF.id, ownerId: a.id, targetId: b.id,
        sourceSocketId: a.data?.rigWorkshop ? 'rig_mount' : undefined,
        targetSocketId: b.data?.rigWorkshop ? 'rig_mount' : undefined,
        sourceWorld: entityLocalPointToWorld(a, anchors.source), targetWorld: entityLocalPointToWorld(b, anchors.target),
        controlMode: 'rigWorkshop' });
      if (!created.ok) {
        for (const id of edge.attachmentIds) attachments.cut(id, null, 'rig_workshop_admission_rollback');
        edge.attachmentIds = []; edge.reason = created.reason; edge.attempts++;
        return false;
      }
      edge.attachmentIds.push(created.attachment.id);
    }
    edge.state = 'active'; edge.reason = null; return true;
  }
  function cutEdge(edge, reason = 'rig_workshop_release') {
    for (const id of edge.attachmentIds) {
      if (attachments.get(id)?.state === 'active') attachments.cut(id, null, reason);
    }
    edge.state = 'broken'; edge.stress = 0;
  }
  function retireDestroyedParts(w, rig) {
    const home = state.world?.currentSectorId == null || state.world.currentSectorId === w.bench?.sectorId;
    const lost = rig.partIds.filter(id => {
      const body = ownedPart(w, rig, id);
      // Absence during a sector transition is not evidence of destruction.
      return body ? !alive(body) : home && !worldLedgerHoldsId(state.world, id);
    });
    if (!lost.length) { rig.rootId ||= rig.partIds[0] || null; return 0; }
    const ids = new Set(lost), archive = rig.retiredParts || (rig.retiredParts = []);
    for (const id of lost) {
      const body = ownedPart(w, rig, id);
      archive.push({ id, token: rig.partTokens[id], partType: body?.data?.rigWorkshop?.partType || null,
        retiredAt: state.simTime || 0 });
      delete rig.partTokens[id];
    }
    if (archive.length > RIG_LIMITS.retiredParts) archive.splice(0, archive.length - RIG_LIMITS.retiredParts);
    for (const edge of rig.connections) if (ids.has(edge.parentId) || ids.has(edge.childId)) cutEdge(edge, 'rig_workshop_part_destroyed');
    rig.connections = rig.connections.filter(edge => !ids.has(edge.parentId) && !ids.has(edge.childId));
    rig.partIds = rig.partIds.filter(id => !ids.has(id));
    const held = new Set(rig.connections.filter(e => e.kind === 'cargo').map(e => e.childId));
    rig.cargoIds = rig.cargoIds.filter(id => held.has(id));
    for (const id of Object.keys(rig.cargoTokens)) if (!held.has(Number(id))) delete rig.cargoTokens[id];
    if (!rig.partIds.includes(rig.rootId)) {
      rig.rootId = rig.partIds.find(id => alive(ownedPart(w, rig, id))) || rig.partIds[0] || null;
      rig.power = false;
    }
    if (rig.rootId) rig.partIds = [rig.rootId, ...rig.partIds.filter(id => id !== rig.rootId)];
    if (w.undo?.rigId === rig.id) w.undo = null;
    rig.revision++;
    change(w, rig.rootId ? 'A surviving part carries the rig identity. Bring the loose originals together at the bench to reconnect them.'
      : 'The machine is lost, but its name remains. Fit a new keel at the bench using reclaimed stock.');
    emit('rigWorkshop:jointBroken', { rigId: rig.id, reason: 'part_destroyed', count: lost.length });
    return lost.length;
  }
  function ensureTemplates(w) {
    if (w.templatesSeeded) return { ok: true, rigs: w.rigs };
    if (!nearBench(w)) return fail('approach_bench');
    if (w.rigs?.length) { w.templatesSeeded = true; return { ok: true, rigs: w.rigs }; }
    w.rigs = []; w.templatesSeeded = true;
    for (let i = 0; i < RIG_TEMPLATES.length; i++) {
      const template = RIG_TEMPLATES[i];
      const rig = { id: `rigWorkshop:${w.ownerId}:${template.id}`, name: template.name, template: template.id,
        ownerId: w.ownerId, partIds: [], partTokens: {}, connections: [], cargoIds: [], cargoTokens: {},
        rootId: null, retiredParts: [], nextPart: 1, nextConnection: 1, power: false, modified: false, revision: 0, repairs: 0 };
      w.rigs.push(rig);
      const origin = templateOrigin(w, rig);
      for (const item of template.parts) {
        const body = createPart(w, rig, item.type, { x: origin.x + item.x, z: origin.z + item.z });
        if (!body) { rig.reason = 'body_spawn_unavailable'; continue; }
        if (rig.partIds.length > 1) makeConnection(rig, entity(rig.partIds[0]), body);
      }
    }
    w.stock = Number.isFinite(w.stock) ? w.stock : 8;
    w.activeRigId ||= w.rigs[0]?.id;
    change(w, 'Two loaned rigs, eight reclaimed parts. Try a change, then take your machine outside.');
    return { ok: true, rigs: w.rigs };
  }
  function previewEdit(w, request = {}) {
    const rig = rigFor(w, request.rigId);
    const type = request.partType;
    const p = PARTS[type];
    const mountName = request.mount === 'left' ? 'port' : request.mount === 'right' ? 'starboard' : request.mount || 'front';
    const mount = MOUNTS[mountName];
    const parent = rig && ownedPart(w, rig, request.parentId ?? rig.rootId ?? rig.partIds[0]);
    const seed = !!rig && rig.partIds.length === 0 && type === 'frame';
    let reason = !rig ? 'rig_missing' : !p ? 'unknown_part' : !mount ? 'unknown_mount' : !alive(parent) && !seed ? 'parent_missing'
      : !nearBench(w, rig) ? 'return_rig_to_bench_and_stop' : rig.pendingEdit || rig.pendingRepair ? 'edit_pending'
      : rig.partIds.length >= RIG_LIMITS.partsPerRig ? 'part_limit' : !(availableStock(w) >= 1) ? 'no_reclaimed_parts' : null;
    const r = parent?.radius || 0;
    const gap = r + (p?.radius || 0) + 3 + (mount?.extension || 0);
    const local = { x: (mount?.x || 0) * gap, z: (mount?.z || 0) * gap };
    const pos = parent ? entityLocalPointToWorld(parent, local) : seed ? templateOrigin(w, rig) : { x: 0, z: 0 };
    if (!reason) {
      for (const e of state.entities.values()) {
        if (!alive(e) || e === parent || e.collides === false || e.id === w.bench.entityId || e.id === player()?.id) continue;
        if (distance(pos, e.pos) < ((p?.radius || 0) + (e.radius || 0)) * .72) { reason = 'clearance_blocked'; break; }
      }
    }
    const warnings = [];
    if (mountName === 'reach') warnings.push('Long reach: a wider turning sweep and more leverage on the joint.');
    if (type === 'mover' && (mountName === 'port' || mountName === 'starboard')) warnings.push('Off-centre thrust will yaw the entire rig.');
    if (type === 'bumper') warnings.push('The guard adds 65 mass units: leave more stopping room.');
    w.preview = { valid: !reason, reason, seed, rigId: rig?.id, partType: type, parentId: parent?.id ?? null,
      parentToken: parent?.data?.rigWorkshop?.token ?? null, mount: mountName, pos: { x: pos.x, z: pos.z }, rot: parent?.rot || 0,
      warnings, cost: p?.cost || 1, radius: p?.radius || 0, revision: rig?.revision || 0 };
    return { ok: !reason, reason, preview: w.preview };
  }
  function cancelPreview(w) {
    w.preview = null;
    for (const rig of w.rigs || []) {
      const edit = rig.pendingEdit;
      if (!edit) continue;
      const body = ownedPart(w, rig, edit.bodyId), edge = rig.connections.find(e => e.id === edit.edgeId);
      if (edge) cutEdge(edge, 'rig_workshop_cancel');
      if (body) removeBody(body);
      rig.partIds = rig.partIds.filter(id => id !== edit.bodyId);
      rig.connections = rig.connections.filter(e => e.id !== edit.edgeId);
      delete rig.partTokens[edit.bodyId]; rig.pendingEdit = null;
      if (rig.rootId === edit.bodyId) rig.rootId = rig.partIds[0] || null;
    }
    return { ok: true };
  }
  function commitPreview(w) {
    const old = w.preview;
    if (!old) return fail('no_preview');
    const rig = rigFor(w, old.rigId), parent = entity(old.parentId);
    if (!rig || old.revision !== rig.revision || (!old.seed && parent?.data?.rigWorkshop?.token !== old.parentToken)
      || (old.seed && rig.partIds.length)) return fail('preview_stale');
    const check = previewEdit(w, old);
    if (!check.ok) return check;
    const snapshot = w.preview;
    const body = createPart(w, rig, snapshot.partType, snapshot.pos, snapshot.rot);
    if (!body) return fail('body_spawn_unavailable');
    const edge = snapshot.seed ? null : makeConnection(rig, parent, body);
    rig.pendingEdit = { bodyId: body.id, edgeId: edge?.id || null, seed: snapshot.seed, stockCost: snapshot.cost,
      tick: state.tick || 0, previousModified: rig.modified };
    w.preview = null;
    change(w, snapshot.seed ? 'Seating the new keel. Stock is charged after its physical body is admitted.'
      : 'Fitting the part. Stock is charged only when the native joint holds.');
    return { ok: true, pending: true, bodyId: body.id, connectionId: edge?.id || null };
  }
  function undoEdit(w) {
    const edit = w.undo;
    if (!edit) return fail('nothing_to_undo');
    const rig = rigFor(w, edit.rigId), body = rig && ownedPart(w, rig, edit.bodyId);
    if (!rig || !body || body.data.rigWorkshop.token !== edit.token) return fail('undo_identity_changed');
    if (!nearBench(w, rig)) return fail('return_rig_to_bench_and_stop');
    if (rig.revision !== edit.revision || rig.connections.some(e => e.parentId === body.id && e.state !== 'broken')) return fail('part_is_in_use');
    const edge = rig.connections.find(e => e.id === edit.edgeId);
    if (edge) cutEdge(edge, 'rig_workshop_undo');
    if (!removeBody(body)) return fail('body_remove_unavailable');
    rig.partIds = rig.partIds.filter(id => id !== body.id);
    rig.connections = rig.connections.filter(e => e.id !== edit.edgeId);
    delete rig.partTokens[body.id];
    if (rig.rootId === body.id) rig.rootId = rig.partIds[0] || null;
    rig.modified = edit.previousModified; rig.revision++;
    w.stock += edit.stockCost; w.undo = null;
    change(w, 'Last fitting undone; the reclaimed part is back on the bench.');
    emit('rigWorkshop:undo', { rigId: rig.id });
    return { ok: true };
  }
  function coupleShip(w, id) {
    const rig = rigFor(w, id), p = player();
    if (!rig || !alive(p)) return fail('rig_missing');
    if (rig.towAttachmentId && attachments.get(rig.towAttachmentId)?.state === 'active') return { ok: true, attachmentId: rig.towAttachmentId };
    const target = rig.partIds.map(id => ownedPart(w, rig, id)).find(e => alive(e) && e.data.rigWorkshop.partType === 'hitch');
    if (!target) return fail('fit_a_tow_coupling');
    if (distance(p.pos, target.pos) > 125) return fail('approach_tow_coupling');
    const result = attachments.create({ defId: 'tether_standard', ownerId: p.id, targetId: target.id, controlMode: 'rigWorkshop' });
    if (!result.ok) return result;
    rig.towAttachmentId = result.attachment.id; w.activeRigId = rig.id;
    change(w, `${rig.name} coupled. Thrust and brake gently: its mass is now on your line.`);
    return { ok: true, attachmentId: result.attachment.id };
  }
  function releaseShip(w, id) {
    const rig = rigFor(w, id);
    if (!rig) return fail('rig_missing');
    if (rig.towAttachmentId) attachments.cut(rig.towAttachmentId, null, 'rig_workshop_release');
    rig.towAttachmentId = null; rig.power = false;
    return { ok: true };
  }
  function captureCargo(w, id, cargoId) {
    const rig = rigFor(w, id), cargo = entity(cargoId);
    if (!rig || !alive(cargo)) return fail('cargo_missing');
    if (cargo.type !== 'payload' || cargo.data?.rigWorkshop || (cargo.data?.rigWorkshopRole && cargo.data.rigWorkshopRole !== 'cargo')
      || cargo.physicsBody?.dynamic === false) return fail('body_is_not_cargo');
    if (cargo.data?.rigWorkshopCargo?.delivered || cargo.data?.rigWorkshopDelivered) return fail('cargo_already_delivered');
    if (cargo.data?.rigWorkshopOwner !== w.ownerId && ownedBodyCount(w.ownerId) >= RIG_LIMITS.bodyRecords) return fail('body_limit');
    const owner = cargo.data?.rigWorkshopCargo?.ownerId ?? cargo.data?.ownerId ?? cargo.ownerId;
    if (owner !== w.ownerId && owner !== player()?.id && cargo.data?.rigWorkshopOwner !== w.ownerId) return fail('cargo_not_owned');
    if (rig.cargoIds.includes(cargo.id)) {
      if (isCargoSecured(w, rig.id, cargo.id)) return { ok: true, alreadyCaptured: true };
      // A broken restraint does not erase the original body or prevent another try.
      for (const old of rig.connections.filter(e => e.kind === 'cargo' && e.childId === cargo.id)) cutEdge(old);
      rig.connections = rig.connections.filter(e => e.kind !== 'cargo' || e.childId !== cargo.id);
      rig.cargoIds = rig.cargoIds.filter(id => id !== cargo.id); delete rig.cargoTokens[cargo.id];
    }
    if (w.rigs.some(r => r.cargoIds.includes(cargo.id))) return fail('cargo_already_coupled');
    if (rig.cargoIds.length >= RIG_LIMITS.cargoPerRig) return fail('cargo_limit');
    if (rig.connections.length >= RIG_LIMITS.connectionsPerRig) return fail('connection_limit');
    const holders = rig.partIds.map(id => ownedPart(w, rig, id)).filter(e => alive(e) && PARTS[e.data.rigWorkshop.partType]?.cargoCapacity);
    const holder = holders.find(e => distance(e.pos, cargo.pos) <= PARTS[e.data.rigWorkshop.partType].captureRadius
      && rig.connections.filter(c => c.kind === 'cargo' && c.parentId === e.id && c.state !== 'broken').length < PARTS[e.data.rigWorkshop.partType].cargoCapacity);
    if (!holder) return fail('bring_cargo_inside_cradle_or_collector');
    if (Math.hypot((cargo.vel?.x || 0) - (holder.vel?.x || 0), (cargo.vel?.z || 0) - (holder.vel?.z || 0)) > RIG_LIMITS.captureSpeed) return fail('match_cargo_speed');
    // Cargo retains its original combat profile and identity. One native clamp is enough
    // to carry it; two default payload sockets remain available for the player's line.
    const result = attachments.create({ defId: RIG_CAPTURE_DEF.id, ownerId: holder.id, targetId: cargo.id,
      sourceSocketId: 'rig_mount', sourceWorld: holder.pos, targetWorld: cargo.pos, controlMode: 'rigWorkshop' });
    if (!result.ok) return result;
    // A player's existing salvage joins this finite persistence lease without
    // replacing its body, owner or authored cargo data. Job originals already have
    // their contract token; ordinary owned cargo receives one only on first hold.
    cargo.data ||= {};
    cargo.data.rigWorkshopOwner = w.ownerId;
    cargo.data.persistenceOwner ||= 'rigWorkshop';
    if (!cargo.data.worldRecordId && !cargo.data.rigWorkshopCargo?.token) {
      const serial = Math.max(1, Number(w.nextOwnedCargo) || 1);
      cargo.data.worldRecordId = `${w.ownerId}:owned-cargo:${serial}`; w.nextOwnedCargo = serial + 1;
    }
    cargo.flags = { ...cargo.flags, persistent: true };
    cargo.data.persistent = true; cargo.data.transientSector = false;
    markBodyChanged(cargo);
    const edge = { id: `${rig.id}:cargo:${cargo.id}`, parentId: holder.id, childId: cargo.id,
      parentToken: holder.data.rigWorkshop.token, childToken: cargo.data?.rigWorkshopCargo?.token || cargo.data?.worldRecordId,
      kind: 'cargo', attachmentIds: [result.attachment.id], anchors: [], state: 'active', stress: 0 };
    rig.connections.push(edge); rig.cargoIds.push(cargo.id);
    rig.cargoTokens[cargo.id] = cargo.data?.rigWorkshopCargo?.token || cargo.data?.worldRecordId || String(cargo.id);
    rig.lastCaptureTick = state.tick; rig.lastCaptureModified = rig.modified;
    change(w, `${rig.name} has the original cargo. Take the mass gently to the receiver.`);
    emit('rigWorkshop:cargoCaptured', { rigId: rig.id, cargoId, modified: rig.modified });
    return { ok: true, cargoId, attachmentId: result.attachment.id };
  }
  function releaseCargo(w, id, cargoId) {
    const rig = rigFor(w, id);
    if (!rig) return fail('rig_missing');
    const edge = rig.connections.find(e => e.kind === 'cargo' && e.childId === cargoId);
    if (!edge) return fail('cargo_not_captured');
    cutEdge(edge); rig.connections = rig.connections.filter(e => e !== edge);
    rig.cargoIds = rig.cargoIds.filter(c => c !== cargoId); delete rig.cargoTokens[cargoId];
    return { ok: true, cargoId };
  }
  function isCargoSecured(w, id, cargoId) {
    const rig = rigFor(w, id), cargo = entity(cargoId);
    if (!rig || !alive(cargo) || !rig.cargoIds.includes(cargoId) || !physicsBodyNativeReady(cargo)) return false;
    const edge = rig.connections.find(e => e.kind === 'cargo' && e.childId === cargoId && e.state === 'active');
    if (!edge || !endpointsCurrent(edge) || !connectedPartIds(rig).has(edge.parentId)) return false;
    return edge.attachmentIds.length > 0 && edge.attachmentIds.every(aid => {
      const a = attachments.get(aid);
      if (a?.state !== 'active') return false;
      const telemetry = helpers.combatPhysics?.getAttachmentTelemetry?.({ attachmentId: aid, physicsHandle: a.physicsHandle });
      return !!telemetry;
    });
  }
  function setPower(w, id, on) {
    const rig = rigFor(w, id);
    if (!rig) return fail('rig_missing');
    if (on && !rig.partIds.some(id => alive(entity(id)) && entity(id).data?.rigWorkshop?.partType === 'mover')) return fail('fit_a_powered_mover');
    if (on && (!rig.towAttachmentId || attachments.get(rig.towAttachmentId)?.state !== 'active')) return fail('couple_rig_before_power');
    if (on && rig.connections.some(e => e.state === 'pending')) return fail('wait_for_connections');
    rig.power = !!on;
    change(w, on ? 'Drive assist live. Your normal thrust and brake controls command the fitted motors; release to coast.' : 'Drive isolated. The rig keeps its earned momentum.');
    emit('rigWorkshop:power', { rigId: rig.id, on: rig.power });
    return { ok: true };
  }
  function repair(w, id) {
    const rig = rigFor(w, id);
    if (!rig) return fail('rig_missing');
    if (rig.pendingEdit || rig.pendingRepair) return fail('edit_pending');
    retireDestroyedParts(w, rig);
    if (!nearBench(w, rig)) return fail('tow_surviving_parts_back_to_bench');
    const bodies = rig.partIds.map(id => ownedPart(w, rig, id)).filter(alive);
    if (!bodies.length) return fail('fit_a_new_frame');
    const damaged = bodies.filter(e => e.hull < e.hullMax);
    const broken = rig.connections.filter(e => {
      if (e.kind !== 'structure' || e.state !== 'broken') return false;
      const pair = endpointsCurrent(e);
      return pair && distance(pair[0].pos, pair[1].pos) <= pair[0].radius + pair[1].radius + 18;
    });
    const disconnected = bodies.some(e => !connectedPartIds(rig).has(e.id));
    if (!damaged.length && !broken.length && !disconnected) return fail('rig_already_sound');
    if (!(availableStock(w) >= 1)) return fail('no_reclaimed_parts');
    // Workshop owns repair only for its payload parts. Combat still owns incoming
    // damage. Never repair a ship, job cargo, or foreign payload through this port.
    for (const e of damaged) { e.hull = e.hullMax; touch(e); }
    for (const edge of broken) { edge.state = 'pending'; edge.attempts = 0; edge.attachmentIds = []; }
    // Root loss removes the dead body's old seams, not the surviving machinery.
    // Join only adjacent components, at their current poses: no return-to-template
    // teleport, long-distance clamp or hidden replacement part is involved.
    let joined = connectedPartIds(rig, true);
    while (joined.size < bodies.length && rig.connections.length < RIG_LIMITS.connectionsPerRig) {
      let closest = null;
      for (const a of bodies) for (const b of bodies) {
        if (!joined.has(a.id) || joined.has(b.id)) continue;
        const d = distance(a.pos, b.pos);
        if (d <= a.radius + b.radius + 18 && (!closest || d < closest.distance)) closest = { a, b, distance: d };
      }
      if (!closest) break;
      broken.push(makeConnection(rig, closest.a, closest.b));
      joined = connectedPartIds(rig, true);
    }
    if (!damaged.length && !broken.length) return fail('bring_loose_parts_together');
    if (damaged.length) w.stock--; // a concrete repair has already been delivered
    if (broken.length) rig.pendingRepair = { edgeIds: broken.map(e => e.id), cost: damaged.length ? 0 : 1, tick: state.tick || 0 };
    else { rig.repairs++; rig.revision++; }
    w.undo = null;
    change(w, broken.length ? 'Reseating the original joints. A failed connection spends no repair stock.' : 'Surviving parts patched; their identity and position are unchanged.');
    if (!broken.length) emit('rigWorkshop:repaired', { rigId: rig.id, count: damaged.length });
    return { ok: true, pending: broken.length > 0, repaired: damaged.length, reconnecting: broken.length };
  }
  function recover(w, id) {
    const rig = rigFor(w, id);
    if (!rig) return fail('rig_missing');
    rig.power = false;
    retireDestroyedParts(w, rig);
    const survivors = rig.partIds.map(id => ownedPart(w, rig, id)).filter(alive);
    if (!survivors.length) return fail('no_surviving_parts');
    const p = player();
    const joined = connectedPartIds(rig);
    const loose = survivors.filter(e => !joined.has(e.id));
    const target = loose.filter(e => distance(e.pos, p?.pos) <= 125).sort((a, b) => distance(a.pos, p.pos) - distance(b.pos, p.pos))[0] || survivors[0];
    if (distance(target.pos, p?.pos) > 125) return fail('approach_a_surviving_part');
    if (nearBench(w, rig)) return repair(w, id);
    if (rig.towAttachmentId && attachments.get(rig.towAttachmentId)?.state === 'active') {
      const existing = attachments.get(rig.towAttachmentId);
      if (existing.targetId === target.id) return { ok: true, targetId: target.id, alreadyCoupled: true };
      attachments.cut(existing.id, null, 'rig_workshop_recovery_retarget');
      rig.towAttachmentId = null;
    }
    const result = attachments.create({ defId: 'tether_standard', ownerId: p.id, targetId: target.id, controlMode: 'rigWorkshopRecovery' });
    if (!result.ok) return result;
    rig.towAttachmentId = result.attachment.id;
    change(w, 'Recovery line attached to the same surviving body. Tow it to the bench; nothing is teleported.');
    return { ok: true, targetId: target.id };
  }
  function update(dt, w) {
    if (disposed || !(dt > 0) || !w?.rigs) return;
    for (const rig of w.rigs.slice(0, RIG_LIMITS.rigs)) {
      retireDestroyedParts(w, rig);
      for (const edge of rig.connections.slice(0, RIG_LIMITS.connectionsPerRig)) {
        if (edge.state === 'pending' && edge.kind === 'structure') {
          if (edge.attempts < RIG_LIMITS.attachRetries) connect(edge);
          else { edge.state = 'broken'; edge.reason = 'native_admission_failed'; }
        }
        if (edge.state === 'active') {
          const rows = edge.attachmentIds.map(id => attachments.get(id));
          if (!endpointsCurrent(edge) || rows.some(a => !a || a.state !== 'active')) {
            cutEdge(edge, 'rig_workshop_joint_lost');
            change(w, 'A joint let go. The pieces are still yours: cut power, tow the survivors, repair.');
            emit('rigWorkshop:jointBroken', { rigId: rig.id, connectionId: edge.id });
          } else {
            edge.stress = Math.min(2, Math.max(0, ...rows.map(a => {
              const b = attachments.breakPolicy(a.id);
              return Math.max((a.lastTension || 0) / (b?.maxTension || 18000), (a.lastImpulse || 0) / (b?.maxImpulse || 2100));
            })));
            if (edge.stress >= .65 && (state.simTime || 0) - (edge.warnedAt ?? -100) > 5) {
              edge.warnedAt = state.simTime || 0;
              emit('rigWorkshop:strain', { rigId: rig.id, connectionId: edge.id, stress: edge.stress });
            }
          }
        }
      }
      const edit = rig.pendingEdit;
      if (edit) {
        const edge = rig.connections.find(e => e.id === edit.edgeId), body = ownedPart(w, rig, edit.bodyId);
        const receipt = edit.seed && body ? readPhysicsTelemetry(body) : null;
        const admitted = edit.seed ? receipt?.dynamic && receipt.bodyHandle >= 0 && physicsBodyNativeReady(body) : edge?.state === 'active';
        if (admitted && alive(body)) {
          w.stock -= edit.stockCost; rig.modified = true; rig.revision++;
          w.undo = { ...edit, rigId: rig.id, token: body.data.rigWorkshop.token, revision: rig.revision };
          rig.pendingEdit = null;
          change(w, `${rig.name}: fitting held. Fly it, feel it, and change your mind if it pulls wrong.`);
          emit('rigWorkshop:edited', { rigId: rig.id, partId: body.id, partType: body.data.rigWorkshop.partType });
        } else if (!alive(body) || (!edit.seed && !edge) || edge?.state === 'broken' || (state.tick || 0) - edit.tick > RIG_LIMITS.attachRetries) {
          if (edge) cutEdge(edge, 'rig_workshop_admission_rollback');
          if (body) removeBody(body);
          rig.partIds = rig.partIds.filter(id => id !== edit.bodyId);
          rig.connections = rig.connections.filter(e => e.id !== edit.edgeId);
          delete rig.partTokens[edit.bodyId]; rig.pendingEdit = null;
          if (rig.rootId === edit.bodyId) rig.rootId = rig.partIds[0] || null;
          change(w, 'The connection could not be admitted. The fitting was cancelled; no stock spent.');
          emit('rigWorkshop:failed', { rigId: rig.id, reason: 'native_admission_failed', stockRetained: edit.stockCost });
        }
      }
      if (rig.pendingRepair) {
        const pending = rig.pendingRepair;
        const edges = pending.edgeIds.map(id => rig.connections.find(e => e.id === id)).filter(Boolean);
        if (edges.every(e => e.state !== 'pending')) {
          const seated = edges.filter(e => e.state === 'active').length;
          if (seated) { w.stock = Math.max(0, w.stock - pending.cost); rig.repairs++; rig.revision++;
            emit('rigWorkshop:repaired', { rigId: rig.id, count: seated }); }
          rig.pendingRepair = null;
          if (!seated) {
            change(w, 'Repair could not seat a native connection; the unused repair stock is still yours.');
            emit('rigWorkshop:failed', { rigId: rig.id, reason: 'native_admission_failed', stockRetained: pending.cost });
          }
        }
      }
      if (rig.towAttachmentId && attachments.get(rig.towAttachmentId)?.state !== 'active') { rig.towAttachmentId = null; rig.power = false; }
      const root = ownedPart(w, rig, rig.rootId ?? rig.partIds[0]);
      if (rig.power && (!alive(root) || !alive(player()) || distance(root.pos, player().pos) > 600)) rig.power = false;
      if (rig.power) {
        const connected = connectedPartIds(rig), pilot = player();
        const input = state.ui?.screenStack?.length ? {} : state.input || {};
        const forward = Math.max(-1, Math.min(1, Number(input.moveZ ?? input.throttle) || 0));
        const strafe = Math.max(-1, Math.min(1, Number(input.moveX ?? input.strafe) || 0));
        const brake = !!(input.brake || input.fullStop || input.flipBurn || forward < -.55);
        const c = Math.cos(pilot.rot || 0), s = Math.sin(pilot.rot || 0);
        const ix = c * forward - s * strafe, iz = s * forward + c * strafe;
        for (const id of rig.partIds) {
          const e = ownedPart(w, rig, id), spec = PARTS[e?.data?.rigWorkshop?.partType];
          if (!alive(e) || !spec?.thrust || !connected.has(id) || !physicsBodyNativeReady(e)) continue;
          const axisX = Math.cos(e.rot || 0), axisZ = Math.sin(e.rot || 0);
          const thrust = spec.thrust * Math.max(0, Math.min(1, e.hull / e.hullMax));
          // The motor is reversible along its own physical axis. An asymmetric fit
          // applies its force off the assembly centre through actual native joints.
          const throttle = brake
            ? Math.max(-1, Math.min(1, -((e.vel?.x || 0) * axisX + (e.vel?.z || 0) * axisZ) * e.mass / Math.max(1, thrust * .5)))
            : Math.max(-1, Math.min(1, ix * axisX + iz * axisZ));
          if (Math.abs(throttle) > .001) queuePhysicsImpulse(e,
            { x: axisX * thrust * throttle * dt, z: axisZ * thrust * throttle * dt },
            { tag: 'rigWorkshop:mover', tick: state.tick, ownerId: w.ownerId });
          publishMotorThrottle(e, throttle);
        }
      }
      const connected = connectedPartIds(rig);
      for (const id of rig.partIds) {
        const body = ownedPart(w, rig, id);
        if (body?.data?.rigWorkshop?.partType === 'mover'
          && (!rig.power || !alive(body) || !connected.has(id) || !physicsBodyNativeReady(body))) publishMotorThrottle(body, 0);
      }
      rig.detachedCount = Math.max(0, rig.partIds.length - connectedPartIds(rig).size);
    }
  }
  function dispose({ removeBodies = false, workshop = state.rigWorkshop } = {}) {
    if (disposed) return;
    if (workshop && removeBodies) {
      for (const rig of workshop.rigs || []) {
        releaseShip(workshop, rig.id);
        for (const edge of rig.connections) cutEdge(edge, 'rig_workshop_reset');
      }
      // The bench, receiving gantries and original cargo share the same finite
      // ownership lease. Reset removes those too, without touching another lane.
      for (const e of [...state.entities.values()]) {
        if (e.data?.rigWorkshopOwner === workshop.ownerId || e.data?.rigWorkshop?.ownerId === workshop.ownerId
          || e.data?.rigWorkshopCargo?.ownerId === workshop.ownerId) removeBody(e);
      }
    }
    disposed = true;
  }
  return Object.freeze({ ensureTemplates, previewEdit, commitPreview, cancelPreview, undoEdit, coupleShip, releaseShip,
    captureCargo, releaseCargo, setPower, repair, recover, update, spawnBody, removeBody, markBodyChanged, dispose, destroy: dispose,
    isCargoSecured,
    getRig: (w, id) => rigFor(w, id), getBody: entity, nearBench, kernel });
}
export function connectedPartIds(rig, includePending = false) {
  const members = new Set(rig.partIds || []);
  const root = rig.rootId ?? rig.partIds?.[0];
  const connected = new Set(members.has(root) ? [root] : []);
  for (let n = 0; n < (rig.partIds?.length || 0); n++) {
    let changed = false;
    for (const edge of rig.connections || []) if (edge.kind === 'structure' && (edge.state === 'active' || includePending && edge.state === 'pending')) {
      if (!members.has(edge.parentId) || !members.has(edge.childId)) continue;
      if (connected.has(edge.parentId) && !connected.has(edge.childId)) { connected.add(edge.childId); changed = true; }
      if (connected.has(edge.childId) && !connected.has(edge.parentId)) { connected.add(edge.parentId); changed = true; }
    }
    if (!changed) break;
  }
  return connected;
}
