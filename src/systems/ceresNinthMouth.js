// One finite rescue, owned by npcJobsRuntime. World owns the originals, native
// physics owns their motion, and the prompt is only a revalidated work request.
import { CERES_NINTH_MOUTH as CUT, worldPoint } from '../data/ceresNinthMouth.js';
import { ninthMouthBodySpec, isNinthMouthBodyEligible, ninthMouthRoleForRecord } from '../world/ceresNinthMouthBodies.js';
import { physicsBodyNativeReady, shouldSyncPhysicsBodyEntity, ensurePhysicsBodySpec } from '../core/physicsAuthority.js';
import { refreshEntityPhysicsIndex } from '../core/coreSystem.js';
import { refreshPhysicsPartition, requestActivityReclassify } from '../world/activityRuntime.js';
import { hullEnvelopeWu, proxyOuterRadiusWu } from '../data/collisionProxyManifests.js';

const ROLES = [...CUT.definitions.map(d => d.role), 'barge'];
const ID = role => `${CUT.id}:${role}`;
const RECEIPT = `${CUT.id}:barge-arrival:01`;
const runs = new WeakMap();
const finite = n => typeof n === 'number' && Number.isFinite(n);
const copy = value => JSON.parse(JSON.stringify(value));
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const speed = e => Math.hypot(e?.vel?.x ?? Infinity, e?.vel?.z ?? Infinity);

function fresh() {
  return { version: 1, storyId: CUT.id,
    objects: Object.fromEntries(ROLES.map(role => [role, { identity: ID(role), spawned: false, lost: false }])),
    entered: null, rockShifted: false, rescue: null, tag: false };
}
function record(owner) { return owner.state.npcJobs?.ceresNinthMouth; }
function eligible(s) {
  const p = s.entities?.get(s.playerId);
  return s.mode === 'flight' && (!s.run?.kind || ['adventure', 'campaign'].includes(s.run.kind))
    && s.world?.currentSectorId === CUT.sectorId && !s.save?.restoring && !s.physicsVenue?.active
    && p?.alive !== false && p?.hull > 0 && !s.ui?.docked && !p.flags?.docked;
}
function live(s, e) {
  return e && s.entities?.get(e.id) === e && e.alive !== false && e.hull > 0
    && Number.isSafeInteger(e.occupantGeneration) && e.occupantGeneration > 0;
}
function body(owner, role) {
  const s = owner.state, rt = runs.get(owner), row = record(owner)?.objects[role];
  if (!rt || !row || row.lost) return null;
  const binding = rt.bindings.get(role);
  if (binding) {
    const e = binding.entity;
    if (binding.invalid || !live(s, e) || binding.generation !== e.occupantGeneration || !isNinthMouthBodyEligible(e)) {
      binding.invalid = true;
      if (e.alive === false || e.hull <= 0) row.lost = true;
      return null;
    }
    return e;
  }
  const matches = (s.entityList || []).filter(e => e.alive !== false && e.data?.ninthMouthIdentity === ID(role));
  if (matches.length !== 1 || !live(s, matches[0]) || !isNinthMouthBodyEligible(matches[0])) return null;
  const e = matches[0];
  // After lifecycle reset only the world's canonical record may reintroduce an
  // original. Matching copyable tags alone never authorize a replacement.
  const saved = s.world?.records?.byId?.[ID(role)];
  if (!row.spawned || ninthMouthRoleForRecord(saved) !== role || saved.alive === false
    || ['destroyed', 'defeated'].includes(saved.outcome)
    || saved.liveEntityId != null && saved.liveEntityId !== e.id) return null;
  rt.bindings.set(role, { entity: e, generation: e.occupantGeneration, invalid: false });
  row.spawned = true;
  return e;
}

// A rewritten presentation pose, an unprepared body or a stale post-Continue
// snapshot cannot authorize arrival or bolting a worklight to the rock.
function nativePose(owner, e) {
  const s = owner.state;
  if (!live(s, e) || !physicsBodyNativeReady(e)) return null;
  if (s.settings?.gameplay?.physicsBackend !== 'rapier-dynamic') return null;
  const physics = owner.registry?.get('physics'), native = physics?._sg02;
  const row = native?.records?.get(e.id), b = row?.body;
  if (physics?._nativeRestorePending || physics?._nativeRestoreDeferred || row?.entity !== e
    || !b || native.world.getRigidBody(b.handle) !== b || !Number.isInteger(native._simTick)
    || s.tick - native._simTick < 0 || s.tick - native._simTick > 2
    || row.spec.dynamic !== false && row._postStepReadTick !== native.tick) return null;
  try {
    if (!b.isEnabled()) return null;
    const p = b.translation(), v = b.linvel(), w = b.angvel(), o = native._frameOrigin || { x: 0, z: 0 };
    if (![p.x, p.z, v.x, v.z, w.y].every(finite)) return null;
    return { pos: { x: p.x + o.x, z: p.z + o.z }, vel: { x: v.x, z: v.z }, spin: Math.abs(w.y) };
  } catch { return null; }
}
function attached(s, e) {
  return Object.values(s.combat?.attachments?.byId || {}).some(a => a.state === 'active'
    && (a.ownerId === e.id && a.ownerGeneration === e.occupantGeneration
      || a.targetId === e.id && a.targetGeneration === e.occupantGeneration));
}
function sound(owner, text) {
  if (body(owner, 'receiver')) owner.bus.emit('comms:message', { sender: 'DESSA KROLL · NINTH MOUTH', channel: 'machine', text });
}
function near(owner, point, radius) {
  return distance(owner.state.entities?.get(owner.state.playerId)?.pos, point) <= radius;
}
function admissionClear(s, spec) {
  const radius = Math.max(spec.radius || 0, hullEnvelopeWu(spec), spec.physicsBody?.collisionProxyManifest
    ? proxyOuterRadiusWu(spec.physicsBody.collisionProxyManifest, spec) : 0);
  for (const e of s.entityList || []) {
    if (e.alive === false || e.data?.ninthMouthIdentity?.startsWith(`${CUT.id}:`) || !shouldSyncPhysicsBodyEntity(e)) continue;
    const other = Math.max(e.radius || 0, hullEnvelopeWu(e), e.physicsBody?.collisionProxyManifest
      ? proxyOuterRadiusWu(e.physicsBody.collisionProxyManifest, e) : 0);
    if (!finite(radius) || !finite(other) || distance(e.pos, spec.pos) < radius + other + 12) return false;
  }
  return true;
}
function admit(owner) {
  const s = owner.state, r = record(owner), rt = runs.get(owner);
  if (s.simTime < rt.admissionAt) return;
  rt.admissionAt = s.simTime + .5;
  // First admission is all-or-wait. A returning pilot never materializes a rock
  // through an existing ship and never loses a stored body to a layout reset.
  const pending = [];
  for (const role of ROLES) {
    const existing = body(owner, role), row = r.objects[role];
    if (existing || row.lost) continue;
    const saved = s.world?.records?.byId?.[ID(role)];
    if (Object.hasOwn(s.world?.records?.byId || {}, ID(role))) { row.spawned = true; if (saved?.alive === false || ['destroyed', 'defeated'].includes(saved?.outcome)) row.lost = true; continue; }
    if (row.spawned) continue;
    const spec = ninthMouthBodySpec(role);
    if (!spec || !admissionClear(s, spec)) return;
    pending.push([role, spec]);
  }
  const budget = owner.helpers?.spawnBudget;
  if (pending.some(([role]) => role === 'barge') && budget && budget.request(1, `${CUT.id}:barge`) !== 1) return;
  for (const [role, spec] of pending) {
    r.objects[role].spawned = true;
    const e = owner.helpers.spawnEntity(spec);
    if (e) rt.bindings.set(role, { entity: e, generation: e.occupantGeneration, invalid: false });
    else r.objects[role].lost = true;
  }
}
function lampIssue(owner, index, unseat = false) {
  const lamp = body(owner, `lamp:${index}`), def = CUT.lamps[index], p = nativePose(owner, lamp);
  if (!lamp || !def || !p || lamp.playerOwned || lamp.data.playerOwned || lamp.data.controlLease) return 'Worklight unavailable';
  if (!near(owner, p.pos, 100)) return 'Approach the worklight';
  if (attached(owner.state, lamp)) return 'Release the Line first';
  if (unseat) return lamp.data.ninthMouthInstalled === true ? null : 'Worklight is already loose';
  if (lamp.data.ninthMouthInstalled) return 'Already seated';
  if (distance(p.pos, worldPoint(def.local)) > def.seatRadius) return 'Tow this light to its service mark';
  if (speed(p) > def.maxSpeed || p.spin > def.maxSpin) return 'Settle the worklight first';
  return null;
}
function litCount(owner) {
  return CUT.lamps.filter((def, i) => {
    const e = body(owner, def.role);
    return e?.data.ninthMouthInstalled === true && e.data.ninthMouthLight === true
      && e.physicsBody?.dynamic === false && distance(e.pos, worldPoint(def.local)) <= def.seatRadius;
  }).length;
}

export function ceresNinthMouthStatus(owner) {
  const r = record(owner);
  if (!r) return null;
  const barge = body(owner, 'barge'), lights = litCount(owner);
  return { storyId: CUT.id, status: r.rescue ? 'rescued' : r.objects.barge.lost ? 'lost' : barge ? 'waiting' : 'unavailable',
    // This bounded pocket contains one identified barge, not a fictitious census
    // of eight offscreen departures. General PL-25 traffic accounting is separate.
    rescuedBarges: r.rescue ? 1 : 0, awaitingBarges: !r.rescue && barge ? 1 : 0,
    lights, rockShifted: r.rockShifted, tag: r.tag, receipt: r.rescue ? copy(r.rescue) : null };
}
function publish(owner, force = false) {
  const s = owner.state, rt = runs.get(owner), r = record(owner), p = s.entities?.get(s.playerId);
  if (!rt || !r || !eligible(s) || !near(owner, CUT.center, CUT.hearingRadius) || !body(owner, 'receiver')) {
    s.ceresNinthMouthOffer = null; if (rt) { rt.offer = null; rt.signature = ''; } return;
  }
  const status = ceresNinthMouthStatus(owner), choices = [];
  let detail;
  if (rt.page === 'compact') {
    detail = status.status === 'rescued' ? 'One barge received. Kroll is on the berth radio.' : 'Kroll is holding the service cut for the last barge.';
    choices.push({ id: 'talk', label: 'Call the rescue berth' });
  } else {
    detail = status.status === 'rescued'
      ? `The original barge reached the berth and its Line was released. Crew transfer is recorded. ${status.lights}/3 worklights seated. ${r.tag ? 'Your rescue tag stays at the radio mast.' : 'The lamps are separate work; tow each original to its service mark if you want the approach to stay lit.'}`
      : status.status === 'lost' ? 'The original barge is lost. No safe arrival was recorded. The service cut and any surviving worklights remain here.'
        : status.status === 'unavailable' ? 'The barge is not currently resolved. I will not post a safe arrival from a missing signal.'
          : 'One barge is still in the service cut. Its crew is holding thrust. Tow its bow straight back to this berth, or take a worklight through first. Each light travels with the Line; the three service marks lead from the lip to the inner edge. Release a settled light at its mark, then Seat it. The far opening stays clear for retreat. Pulling sideways can move the loose rock. Bring the barge into the apron and release it almost stopped.';
    if (r.rockShifted) detail += ' The fallen rock has shifted. Check the gap before another pull; the far end remains open.';
    for (let i = 0; i < CUT.lamps.length; i++) {
      const lamp = body(owner, `lamp:${i}`);
      if (!lamp || !near(owner, lamp.pos, 100)) continue;
      const installed = lamp.data.ninthMouthInstalled === true;
      const issue = lampIssue(owner, i, installed);
      choices.push({ id: `${installed ? 'unseat' : 'seat'}:${i}`, label: `${installed ? 'Unbolt' : 'Seat'} worklight ${i + 1}`, disabled: !!issue });
      if (issue && !installed) {
        const to = worldPoint(CUT.lamps[i].local), delta = {x: Math.round(to.x - lamp.pos.x), z: Math.round(to.z - lamp.pos.z)};
        detail += ` Light ${i + 1}: ${issue}. Service mark ${delta.x} m east, ${delta.z} m south of the light.`;
      }
    }
    choices.push({ id: 'close', label: 'Keep flying' });
  }
  const headline = status.status === 'rescued' ? 'ONE BARGE HOME' : 'NINTH MOUTH · RESCUE BERTH';
  const serviceMarks = [{id:'berth',label:'Receiving apron',pos:worldPoint(CUT.berth.local),radius:CUT.berth.radius},
    ...(rt.page === 'full' ? CUT.lamps.map((def,i)=>({id:def.role,label:`Light ${i+1} · ${def.label}`,pos:worldPoint(def.local),radius:def.seatRadius})) : [])];
  const payload = { headline, detail, choices, serviceMarks, playerLife: p.occupantGeneration };
  const signature = JSON.stringify([payload, p.id, r.rescue, r.tag]);
  if (!force && signature === rt.signature) return;
  rt.signature = signature;
  rt.offer = { ...payload, id: `ninth-mouth:${++rt.sequence}`, playerId: p.id };
  s.ceresNinthMouthOffer = rt.offer;
}

export function installCeresNinthMouth(owner) {
  runs.get(owner)?.dispose();
  const rt = { bindings: new Map(), sequence: 0, offer: null, signature: '', page: 'full',
    admissionAt: 0, inside: false, receivedDwell: 0, lastTick: null, accumulator: 0, busy: false };
  runs.set(owner, rt);
  const off = [];
  const reset = () => {
    rt.bindings.clear(); rt.offer = null; rt.signature = ''; rt.page = 'full'; rt.inside = false;
    rt.receivedDwell = 0; rt.lastTick = null; rt.admissionAt = 0; owner.state.ceresNinthMouthOffer = null;
  };
  for (const event of ['save:restoring', 'save:loaded', 'sector:exit', 'sector:enter', 'game:new', 'game:newGame']) off.push(owner.bus.on(event, reset));
  off.push(owner.bus.on('entity:spawned', event => {
    const e = event?.entity || owner.state.entities?.get(event?.id);
    const role = e?.data?.ninthMouthRole, binding = rt.bindings.get(role);
    if (binding && e !== binding.entity && e.data.ninthMouthIdentity === ID(role)) binding.invalid = true;
  }));
  off.push(owner.bus.on('ceresNinthMouth:action', payload => {
    const s = owner.state, p = s.entities?.get(s.playerId), offer = rt.offer;
    if (rt.busy || !eligible(s) || !offer || s.ceresNinthMouthOffer !== offer || !live(s, p)
      || payload?.offerId !== offer.id || payload.playerLife !== offer.playerLife
      || p.id !== offer.playerId || p.occupantGeneration !== offer.playerLife
      || !offer.choices.some(c => c.id === payload.action && !c.disabled)
      || !near(owner, CUT.center, CUT.hearingRadius) || !body(owner, 'receiver')) return;
    rt.busy = true;
    try {
      if (payload.action === 'close') rt.page = 'compact';
      else if (payload.action === 'talk') rt.page = 'full';
      else {
        const [verb, raw] = payload.action.split(':'), index = Number(raw), unseat = verb === 'unseat';
        if (!['seat', 'unseat'].includes(verb) || !Number.isInteger(index)) return;
        const issue = lampIssue(owner, index, unseat);
        if (issue) { sound(owner, issue + '.'); publish(owner, true); return; }
        const lamp = body(owner, `lamp:${index}`), previous = ensurePhysicsBodySpec(lamp);
        // Bolting changes constraint posture at its actual settled position. No
        // position/velocity writer, reward, duplicate lamp or free repair.
        lamp.physicsBody = { ...previous, dynamic: unseat, revision: (previous.revision || 0) + 1 };
        lamp.data.ninthMouthInstalled = !unseat;
        lamp.data.ninthMouthLight = true;
        // Same-life posture changes must republish both indexed layers and the
        // cached activity partition before the next native reconciliation.
        refreshEntityPhysicsIndex(s, lamp, lamp.occupantGeneration);
        refreshPhysicsPartition(lamp);
        requestActivityReclassify(s, lamp, { physicsPublication: true });
        sound(owner, unseat ? `Worklight ${index + 1} is loose. Its light travels with it.` : `Worklight ${index + 1} seated where you brought it.`);
      }
      publish(owner, true);
    } finally { rt.busy = false; }
  }));
  rt.dispose = () => { off.forEach(fn => fn?.()); reset(); runs.delete(owner); };
  return rt.dispose;
}

export function stepCeresNinthMouth(owner, dt) {
  const s = owner.state, rt = runs.get(owner);
  if (!rt || !finite(dt) || dt <= 0 || !eligible(s)) { if (rt) { rt.receivedDwell = 0; s.ceresNinthMouthOffer = null; } return; }
  if (rt.lastTick === s.tick) return;
  rt.lastTick = s.tick;
  if (!record(owner) && !near(owner, CUT.center, CUT.admissionRadius)) return;
  s.npcJobs ||= {}; s.npcJobs.ceresNinthMouth ||= fresh();
  admit(owner);
  const r = record(owner), barge = body(owner, 'barge'), receiver = body(owner, 'receiver');
  const pose = nativePose(owner, barge);
  const lamps = litCount(owner);
  if (pose && !r.entered && near(owner, worldPoint(CUT.barge.local), 90)) r.entered = lamps ? 'lamps_seated' : 'lamps_unseated';
  const rock = body(owner, 'fallen_rock'), rockDef = CUT.definitions.find(d => d.role === 'fallen_rock');
  if (rock && nativePose(owner, rock) && distance(rock.pos, worldPoint(rockDef.local)) > 8 && !r.rockShifted) {
    r.rockShifted = true; sound(owner, 'The loose rock has moved. Ease off and look at the gap. You can still reverse around the far shoulder.');
  }
  const ready = !r.rescue && pose && nativePose(owner, receiver)
    && !barge.playerOwned && !barge.data.playerOwned && !barge.data.controlLease
    && distance(pose.pos, worldPoint(CUT.berth.local)) <= CUT.berth.radius
    && speed(pose) <= CUT.berth.maxSpeed && pose.spin <= CUT.berth.maxSpin && !attached(s, barge);
  rt.receivedDwell = ready ? rt.receivedDwell + Math.min(dt, 1 / 30) : 0;
  if (ready && rt.receivedDwell >= CUT.berth.dwellS) {
    // Commit before callbacks: duplicates, nested updates and save observers see
    // exactly one arrival of this original. Cargo and profit are not inferred.
    r.rescue = { receiptId: RECEIPT, storyId: CUT.id, bargeIdentity: ID('barge'), receiverIdentity: ID('receiver'),
      count: 1, committed: true, tick: s.tick, simTime: s.simTime, approach: r.entered || 'unobserved' };
    rt.page = 'full';
    sound(owner, 'The original barge is in the berth. Crew transfer confirmed. One barge home. The lamps are separate work.');
    if (record(owner) === r) owner.bus.emit('ceresNinthMouth:rescueCommitted', copy(r.rescue));
  }
  if (r.rescue && lamps === 3 && !r.tag && receiver) {
    r.tag = true; receiver.data.ninthMouthTag = true;
    sound(owner, 'Crew home, all three lights seated. Your rescue tag stays at this lip. Keep the service cut clear.');
  }
  if (receiver && r.tag) receiver.data.ninthMouthTag = true;
  const inside = near(owner, CUT.center, CUT.hearingRadius);
  if (inside && !rt.inside && speed(s.entities.get(s.playerId)) < 35) {
    rt.page = 'full'; rt.signature = ''; rt.inside = true;
    sound(owner, r.rescue ? 'You brought that barge home. The receiving entry stays on my board.'
      : 'One barge still inside the service cut. I am on the receiving mast. You can tow it straight out, or take the worklights in first.');
  }
  if (!inside) { rt.inside = false; rt.receivedDwell = 0; }
  rt.accumulator += dt;
  if (rt.accumulator >= .25) { rt.accumulator %= .25; publish(owner); }
}

export function serializeCeresNinthMouth(owner) { const r = record(owner); return r ? copy(r) : null; }
export function restoreCeresNinthMouth(owner, saved) {
  const rt = runs.get(owner);
  if (rt) { rt.bindings.clear(); rt.receivedDwell = 0; rt.lastTick = null; rt.offer = null; rt.signature = ''; }
  owner.state.ceresNinthMouthOffer = null;
  if (saved == null) return;
  const r = fresh(); owner.state.npcJobs.ceresNinthMouth = r;
  // Non-null malformed data still occupies every original slot. It must never
  // turn into another barge or another free set of lamps.
  for (const role of ROLES) {
    const row = saved?.objects?.[role];
    r.objects[role].spawned = saved.version === 1 && saved.storyId === CUT.id
      && row?.identity === ID(role) && typeof row.spawned === 'boolean' ? row.spawned : true;
    r.objects[role].lost = row?.lost === true;
  }
  if (saved.version !== 1 || saved.storyId !== CUT.id) return;
  r.entered = ['lamps_seated', 'lamps_unseated'].includes(saved.entered) ? saved.entered : null;
  r.rockShifted = saved.rockShifted === true;
  const q = saved.rescue;
  if (q?.receiptId === RECEIPT && q.storyId === CUT.id && q.bargeIdentity === ID('barge')
    && q.receiverIdentity === ID('receiver') && q.count === 1 && q.committed === true
    && Number.isSafeInteger(q.tick) && q.tick >= 0 && finite(q.simTime) && q.simTime >= 0
    && ['lamps_seated', 'lamps_unseated', 'unobserved'].includes(q.approach)) r.rescue = copy(q);
  r.tag = !!r.rescue && saved.tag === true;
}
