import { SITE, PARTS, LINKS, ZONES, GROWTH_ATTACHMENT_DEF } from './data.mjs';
import { createGarden, restoreGarden, saveGarden, updateGarden, act, destroy,
  releaseLink, deliver, objectives, prepareSettlement, consumeSettlement, markPaid } from './runtime.mjs';

const finite = v => typeof v === 'number' && Number.isFinite(v);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const copyPose = e => ({ x: e.pos.x, z: e.pos.z, vx: e.vel.x, vz: e.vel.z,
  rot: e.rot, angVel: e.angVel, hull: e.hull });
const validPose = p => p && ['x', 'z', 'vx', 'vz', 'rot', 'angVel'].every(k => finite(p[k])
  && Math.abs(p[k]) <= (k === 'x' || k === 'z' ? 1e7 : 1e4))
  && finite(p.hull) && p.hull >= 0 && p.hull <= 240 && Object.keys(p).length === 7;
const clone = o => JSON.parse(JSON.stringify(o));
const instances = new WeakSet();

export function bodySpec(part, origin, pose = null) {
  const p = pose || { x: origin.x + part.x, z: origin.z + part.z, vx: 0, vz: 0, rot: 0, angVel: 0 };
  return { type: 'wreck', pos: { x: p.x, y: 0, z: p.z },
    vel: { x: p.vx, y: 0, z: p.vz }, rot: p.rot, angVel: p.angVel,
    radius: part.radius, mass: part.mass, hull: pose ? pose.hull : part.kind === 'machine' ? 240 : 80,
    hullMax: part.kind === 'machine' ? 240 : 80, collides: true,
    collisionMask: 1 | 2 | 8 | 32 | 64 | 128,
    physicsBody: { shape: 'ball', dynamic: part.kind !== 'machine', mass: part.mass,
      radius: part.radius, material: 'debris', ccd: true, useMeasuredSkin: false,
      anchorRecoil: false, contact: { restitution: 0.15, friction: 0.6 } },
    data: { glassreefPart: part.id, glassreefSite: SITE.id, physicalCustodyOnly: true,
      combatProfileId: 'combat_profile_tether_anchor',
      masslineTetherable: part.kind !== 'machine', name: part.kind === 'worker'
        ? 'Iona Vale — work cradle' : `Glassreef ${part.id.replaceAll('_', ' ')}` } };
}

/** Independent system candidate. Registration, save root and input ownership stay with root. */
export function createGlassreefGarden(ctx, placement, saved = null) {
  const { state, bus, helpers, registry } = ctx;
  if (state && instances.has(state)) throw new Error('Glassreef already owns this state; dispose before replacement');
  if (!state?.entities || typeof helpers?.spawnEntity !== 'function'
    || typeof helpers?.removeEntity !== 'function' || typeof bus?.on !== 'function')
    throw new TypeError('Glassreef requires canonical core helpers and bus');
  if (!placement || typeof placement.sectorId !== 'string' || !placement.sectorId
    || !finite(placement.x) || !finite(placement.z) || Math.abs(placement.x) > 1e6 || Math.abs(placement.z) > 1e6)
    throw new TypeError('Invalid Glassreef placement');
  const origin = { x: placement.x, z: placement.z }, sectorId = placement.sectorId;
  let garden = saved ? restoreGarden(saved.garden, state.simTime) : createGarden(state);
  let poses = {};
  let jointLengths = LINKS.map(() => null);
  if (saved) {
    if (saved.version !== 1 || saved.sectorId !== sectorId || saved.origin?.x !== origin.x
      || saved.origin?.z !== origin.z || !saved.poses || typeof saved.poses !== 'object'
      || Array.isArray(saved.poses) || Object.keys(saved.poses).length > PARTS.length
      || !Array.isArray(saved.jointLengths) || saved.jointLengths.length !== LINKS.length
      || saved.jointLengths.some(v => v !== null && (!finite(v) || v < 0 || v > 40))
      || Object.keys(saved.poses).some(k => !PARTS.some(p => p.id === k) || !validPose(saved.poses[k])))
      throw new TypeError('Invalid Glassreef body snapshot');
    for (const p of PARTS) if (!['destroyed', 'stored', 'planted', 'quarantined'].includes(garden.nodes[p.id].status)
      && !validPose(saved.poses[p.id])) throw new TypeError('Missing live Glassreef pose');
    for (const p of PARTS) if (saved.poses[p.id]?.hull > (p.kind === 'machine' ? 240 : 80))
      throw new TypeError('Invalid Glassreef hull');
    poses = clone(saved.poses);
    jointLengths = [...saved.jointLengths];
  }
  const bindings = new Map(), byId = new Map(), joints = new Map();
  const inbox = Object.create(null), impactTicks = Object.create(null);
  let active = false, disposed = false, epoch = 0, lastUpdate = state.simTime;
  let ready = false, prepareAttempts = 0, nextPrepareTime = 0;
  let meter = null;
  let lastError = null, lastCost = { nodes: 0, edges: 0, bodyReads: 0, jointReads: 0 };
  const kernel = () => registry?.get?.('actions')?.kernel || registry?.get?.('combat')?.kernel;
  const attachments = () => kernel()?.attachments;
  const readJoint = id => { if (meter) meter.jointReads++; return attachments()?.get?.(id); };
  const live = id => {
    if (meter) meter.bodyReads++;
    const b = bindings.get(id), e = b && state.entities.get(b.id);
    return b && e && e === b.entity && e.alive !== false && e.occupantGeneration === b.generation
      && e.data?.glassreefEpoch === epoch && e.data?.glassreefPart === id ? e : null;
  };
  const emitLine = (text, kind = 'info') => bus.emit('comms:log', { from: 'Iona Vale', kind, text });
  const closeJoint = i => {
    const binding = joints.get(i);
    if (!binding) return true;
    const owner = attachments(), a = readJoint(binding.id);
    if (!a || a.state !== 'active') { joints.delete(i); return true; }
    if (a.ownerId !== binding.ownerId || a.targetId !== binding.targetId
      || a.ownerGeneration !== binding.ownerGeneration || a.targetGeneration !== binding.targetGeneration) {
      lastError = 'stale_growth_joint'; return false;
    }
    const r = owner.cut(binding.id, binding.ownerId, 'glassreef_release');
    if (r?.ok !== true) { lastError = r?.reason || 'joint_release_rejected'; return false; }
    joints.delete(i); return true;
  };
  const syncReleased = () => {
    for (let i = 0; i < LINKS.length; i++) if (!garden.links[i]) closeJoint(i);
  };
  const rememberPoses = () => {
    for (const p of PARTS) { const e = live(p.id); if (e) poses[p.id] = copyPose(e); }
    for (const [i, b] of joints) {
      const a = readJoint(b.id);
      if (a?.state === 'active' && finite(a.restLength) && a.restLength >= 0 && a.restLength <= 40)
        jointLengths[i] = a.restLength;
    }
  };
  function leave() {
    if (!active) return;
    rememberPoses(); active = false; ready = false;
    for (const i of [...joints.keys()]) closeJoint(i);
    // Clear identities before core emits retirement callbacks. No delayed callback owns new bodies.
    const owned = [...bindings.values()]; bindings.clear(); byId.clear(); joints.clear();
    for (const b of owned) if (state.entities.get(b.id) === b.entity)
      helpers.removeEntity(b.id, { immediate: true, reason: 'glassreef_shelved' });
    for (const key of Object.keys(inbox)) delete inbox[key];
    for (const key of Object.keys(impactTicks)) delete impactTicks[key];
    lastUpdate = state.simTime; garden.lastTime = state.simTime;
  }
  function enter() {
    if (active || disposed || garden.retired || state.world?.currentSectorId !== sectorId) return false;
    const owner = attachments();
    if (typeof owner?.create !== 'function' || typeof owner?.get !== 'function' || typeof owner?.cut !== 'function') {
      lastError = 'attachment_authority_unavailable'; return false;
    }
    epoch++; active = true; ready = false; prepareAttempts = 0;
    nextPrepareTime = state.simTime; lastError = null;
    try {
      for (const p of PARTS) {
        if (['destroyed', 'stored', 'planted', 'quarantined'].includes(garden.nodes[p.id].status)) continue;
        const spec = bodySpec(p, origin, poses[p.id]); spec.data.glassreefEpoch = epoch;
        const e = helpers.spawnEntity(spec);
        if (!e || !Number.isSafeInteger(e.id) || !Number.isSafeInteger(e.occupantGeneration))
          throw new Error('core_identity_unavailable');
        const b = { id: e.id, generation: e.occupantGeneration, entity: e };
        bindings.set(p.id, b); byId.set(e.id, p.id);
      }
      garden.lastTime = state.simTime; lastUpdate = state.simTime;
      rememberPoses(); return true;
    } catch (error) { lastError = String(error.message); leave(); return false; }
  }
  // Core publication is synchronous; native body admission happens in physics afterwards.
  // Keep the same ten bodies while waiting. Never spawn/remove in an endless failed-joint loop.
  function prepareJoints() {
    if (state.simTime < nextPrepareTime) return false;
    prepareAttempts++; nextPrepareTime = state.simTime + 0.25;
    const owner = attachments();
    try {
      LINKS.forEach((edge, i) => {
        if (!garden.links[i]) return;
        if (joints.has(i)) return;
        const child = live(edge.child), parent = live(edge.parent);
        if (!child || !parent) throw new Error('growth_endpoint_missing');
        const r = owner.create({ defId: GROWTH_ATTACHMENT_DEF, ownerId: child.id, targetId: parent.id,
          sourceWorld: { x: child.pos.x, y: 0, z: child.pos.z },
          targetWorld: { x: parent.pos.x, y: 0, z: parent.pos.z } });
        if (!r?.ok || !r.attachment) throw new Error(r?.reason || 'growth_attachment_rejected');
        const a = r.attachment;
        joints.set(i, { id: a.id, ownerId: a.ownerId, targetId: a.targetId,
          ownerGeneration: a.ownerGeneration, targetGeneration: a.targetGeneration });
        const restLength = finite(a.restLength) ? a.restLength : distance(child.pos, parent.pos);
        if (jointLengths[i] !== null && Math.abs(jointLengths[i] - restLength) > 1e-6) {
          const restored = owner.reel?.(a.id, jointLengths[i] - restLength, 0);
          if (restored?.ok !== true) throw new Error(restored?.reason || 'growth_length_restore_rejected');
        } else jointLengths[i] = restLength;
      });
      ready = true; lastError = null;
      garden.lastTime = state.simTime; lastUpdate = state.simTime;
      rememberPoses(); return true;
    } catch (error) {
      lastError = String(error.message);
      if (prepareAttempts >= 8) leave();
      return false;
    }
  }
  const onImpact = p => {
    if (!active || disposed || garden.retired || !Number.isSafeInteger(p?.tick) || p.tick !== state.tick
      || !finite(p.impulse) || p.impulse <= 0) return;
    for (const side of ['a', 'b']) {
      const id = byId.get(p[`${side}Id`]), e = live(id);
      if (!e || p[`${side}Generation`] !== e.occupantGeneration) continue;
      // The bus can repeat a pooled receipt. One peak per body per physics tick, bounded forever.
      const prior = impactTicks[id];
      const peak = Math.min(200, p.impulse);
      const delta = prior?.tick === p.tick ? Math.max(0, peak - prior.peak) : peak;
      impactTicks[id] = { tick: p.tick, peak: Math.max(prior?.tick === p.tick ? prior.peak : 0, peak) };
      inbox[id] = { impact: Math.min(200, (inbox[id]?.impact || 0) + delta) };
    }
  };
  const onDestroyed = p => {
    const id = byId.get(p?.id), b = bindings.get(id);
    if (!active || !b || p.entity !== b.entity || p.entity.occupantGeneration !== b.generation) return;
    destroy(garden, id); syncReleased(); bindings.delete(id); byId.delete(p.id);
  };
  const unsubscribes = [bus.on('physics:impact', onImpact), bus.on('entity:destroyed', onDestroyed),
    bus.on('sector:exit', leave), bus.on('sector:enter', enter), bus.on('save:restoring', leave),
    bus.on('game:newGame', leave)];

  function update() {
    if (disposed || !active || garden.retired || state.world?.currentSectorId !== sectorId
      || state.mode !== 'flight' || state.simTime <= lastUpdate) return lastCost = { nodes: 0, edges: 0, bodyReads: 0, jointReads: 0 };
    if (!ready) {
      meter = { bodyReads: 0, jointReads: 0 };
      prepareJoints(); lastUpdate = state.simTime;
      lastCost = { nodes: 0, edges: LINKS.length, ...meter }; meter = null;
      return lastCost;
    }
    meter = { bodyReads: 0, jointReads: 0 };
    for (const p of PARTS) {
      const e = live(p.id);
      if (bindings.has(p.id) && (!e || e.hull <= 0)) destroy(garden, p.id);
    }
    for (let i = 0; i < LINKS.length; i++) {
      if (!garden.links[i]) continue;
      const b = joints.get(i), a = b && readJoint(b.id);
      if (!a || a.state !== 'active') { releaseLink(garden, i); continue; }
      if (a.ownerId !== b.ownerId || a.targetId !== b.targetId
        || a.ownerGeneration !== b.ownerGeneration || a.targetGeneration !== b.targetGeneration) {
        lastError = 'stale_growth_joint'; releaseLink(garden, i); continue;
      }
      const key = LINKS[i].child;
      inbox[key] = { ...inbox[key], tension: finite(a.lastTension) ? Math.max(0, a.lastTension) : 0 };
    }
    const work = updateGarden(garden, state.simTime, inbox);
    for (const key of Object.keys(inbox)) delete inbox[key];
    syncReleased();
    for (const p of PARTS) {
      const e = live(p.id); if (!e || garden.nodes[p.id].status !== 'loose') continue;
      const slow = Math.hypot(e.vel.x, e.vel.z) <= 2;
      for (const [zoneId, z] of Object.entries(ZONES)) {
        if (distance(e.pos, { x: origin.x + z.x, z: origin.z + z.z }) + p.radius > z.radius) continue;
        if (deliver(garden, p.id, zoneId, slow)) {
          poses[p.id] = copyPose(e);
          bindings.delete(p.id); byId.delete(e.id);
          helpers.removeEntity(e.id, { immediate: true, reason: 'glassreef_received' });
          break;
        }
      }
    }
    lastUpdate = state.simTime; rememberPoses();
    lastCost = { ...work, ...meter }; meter = null;
    return lastCost;
  }
  function request(action, partId) {
    if (disposed || !active || garden.retired || state.mode !== 'flight') return { ok: false, reason: 'site_inactive' };
    if (!ready) return { ok: false, reason: 'site_preparing' };
    const player = state.entities.get(state.playerId), target = live(partId);
    if (!player || player.alive === false || !target || player.flags?.docked
      || distance(player.pos, target.pos) > SITE.interactionRange + target.radius)
      return { ok: false, reason: 'approach_live_target' };
    if (action === 'settle') return partId === 'worker' ? settle() : { ok: false, reason: 'ask_rigger_to_sign' };
    // A candidate copy allows joint authority to refuse without detaching the organic graph.
    const candidate = saveGarden(garden), result = act(candidate, action, partId);
    if (!result.ok) return result;
    for (let i = 0; i < LINKS.length; i++) if (garden.links[i] && !candidate.links[i])
      if (!closeJoint(i)) return { ok: false, reason: lastError };
    garden = candidate;
    if (action === 'rescue') emitLine('Clear. I can run the manual pollinator if the nursery drive is gone.');
    return result;
  }
  function settle() {
    const economy = registry?.get?.('economy');
    if (typeof economy?.grantCredits !== 'function') return { ok: false, reason: 'economy_authority_unavailable' };
    const receipt = prepareSettlement(garden);
    if (!receipt) return { ok: false, reason: 'objectives_or_receipt_closed' };
    // Consume before synchronous owner callbacks, including nested save/settle calls. No retry
    // after ambiguous owner failure: consumed is persisted and explicitly NOT a paid receipt.
    consumeSettlement(garden, receipt.id);
    const before = state.player.credits;
    try { economy.grantCredits(receipt.amount, `glassreef:${receipt.choice}`); }
    catch (error) { lastError = `settlement_owner_error:${String(error.message).slice(0,120)}`; }
    const paid = finite(before) && state.player.credits - before === receipt.amount;
    if (paid) markPaid(garden, receipt.id);
    else lastError ||= 'settlement_unconfirmed_no_retry';
    emitLine(paid ? `Receipt signed: ${receipt.amount} cr. ${receipt.choice === 'restore'
      ? 'The nursery has another season.' : 'The recovery shift is closed.'}` : 'Credit transfer unconfirmed. Keep the receipt for reconciliation.');
    return { ok: paid, receipt: clone(garden.settlement), reason: paid ? null : lastError };
  }
  function snapshot() {
    rememberPoses();
    // Fill untouched authored poses even if serialized before first sector entry.
    for (const p of PARTS) if (!poses[p.id]) poses[p.id] = copyPose(bodySpec(p, origin));
    return { version: 1, sectorId, origin: { ...origin }, garden: saveGarden(garden), poses: clone(poses), jointLengths: [...jointLengths] };
  }
  function dispose() { if (disposed) return; leave(); disposed = true; instances.delete(state); for (const off of unsubscribes) off?.(); }
  instances.add(state);
  return Object.freeze({ name: 'glassreefGarden', enter, leave, update, request, serialize: snapshot, dispose,
    read: () => ({ garden: saveGarden(garden), origin: { ...origin }, sectorId, active, ready, prepareAttempts,
      lastError, cost: { ...lastCost }, bodies: PARTS.flatMap(p => {
        const e = live(p.id); return e ? [{ partId: p.id, entityId: e.id,
          generation: e.occupantGeneration, ...copyPose(e), hull: e.hull }] : [];
      }) }),
    missionEvidence: () => ({ missionId: SITE.missionId, ...objectives(garden),
      choice: garden.choice, receipt: garden.settlement && clone(garden.settlement),
      failed: garden.worker === 'lost', complete: garden.settlement?.status === 'paid' }),
    verifyMissionProof: payload => ({ ok: payload?.missionId === SITE.missionId
      && payload?.siteId === SITE.id && payload?.receiptId === garden.settlement?.id
      && garden.settlement?.status === 'paid' }),
  });
}
