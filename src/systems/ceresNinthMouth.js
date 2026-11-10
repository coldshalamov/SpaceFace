import { krollArrivalLine, krollStoryScene } from '../story/ceresArrivalStory.js';
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
    entered: null, rockShifted: false, rescue: null, tag: false, guide: null, conversation: { met: false, plan: null } };
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
// Guidance reads the same bound original and fresh native pose as settlement.
// Selecting a route changes only the radio/HUD focus, never the target, body or Line.
function playerAttached(s, e) {
  const p = s.entities?.get(s.playerId);
  return p && Object.values(s.combat?.attachments?.byId || {}).some(a => a.state === 'active'
    && a.ownerId === p.id && a.ownerGeneration === p.occupantGeneration
    && a.targetId === e.id && a.targetGeneration === e.occupantGeneration);
}
function routeGuidance(owner) {
  const s = owner.state, r = record(owner), p = s.entities?.get(s.playerId);
  const originals = [...CUT.lamps.map(d => body(owner, d.role)), body(owner, 'barge')].filter(Boolean);
  const towing = originals.find(e => playerAttached(s, e));
  const selected = originals.find(e => e.id === s.player?.targetId);
  // Retain the attached original after release, so the instruction becomes Seat
  // rather than silently switching to a different nearby object.
  if (towing) r.guide = towing.data.ninthMouthRole;
  const explicit = originals.find(e => e.data.ninthMouthRole === r.guide);
  const closest = originals.filter(e => e.data.ninthMouthRole.startsWith('lamp:')
    && !e.data.ninthMouthInstalled && distance(p.pos, e.pos) <= 100)
    .sort((a,b) => distance(p.pos,a.pos) - distance(p.pos,b.pos))[0];
  const e = towing || explicit || selected || closest || (!r.rescue && body(owner, 'barge'));
  const pose = nativePose(owner, e);
  if (!e || !pose || e.playerOwned || e.data.playerOwned || e.data.controlLease) return null;
  const role = e.data.ninthMouthRole, isLamp = role.startsWith('lamp:'), index = isLamp ? Number(role.slice(5)) : -1;
  const def = isLamp ? CUT.lamps[index] : CUT.berth, target = worldPoint(def.local);
  const remaining = distance(pose.pos, target), velocity = speed(pose), linked = attached(s,e), ours = !!playerAttached(s,e);
  const radius = isLamp ? def.seatRadius : def.radius;
  const label = isLamp ? `Light ${index+1} · ${def.label}` : 'Original barge';
  // Constant-velocity intercept is advice, never a predicted arrival receipt.
  // Recompute from fresh native motion: contact or a bad heading revokes it.
  const dx=pose.pos.x-target.x,dz=pose.pos.z-target.z,v2=velocity*velocity;
  const dot=dx*pose.vel.x+dz*pose.vel.z;
  const discriminant=dot*dot-v2*(remaining*remaining-radius*radius);
  const intercept=v2>.0025 && dot<0 && discriminant>=0 ? (-dot-Math.sqrt(discriminant))/v2 : Infinity;
  const coastEta=isLamp && !linked && remaining>radius && velocity<=def.maxSpeed
    && pose.spin<=def.maxSpin && intercept>0 && intercept<=300 ? Math.ceil(intercept) : null;
  let stage, instruction;
  if (isLamp && e.data.ninthMouthInstalled) { stage='seated'; instruction='Worklight seated. Its light stays here; choose the next light or the barge.'; }
  else if (!isLamp && r.rescue) { stage='received'; instruction='One barge home. Crew transfer is recorded; the lamps remain separate work.'; }
  else if (linked && !ours) { stage='held'; instruction='Another Line holds this body. Clear that Line before seating or receiving it.'; }
  else if (coastEta != null) { stage='coast'; instruction='The released light is projected to cross its mark. Stay within 100 m; Seat enables only when it actually arrives slowly.'; }
  else if (isLamp && !linked && velocity>def.maxSpeed) {
    stage='intercept'; instruction=intercept>0 && Number.isFinite(intercept)
      ? 'Pass around the moving light and get behind its course. Reattach the Line just before it reaches the mark to brake it; watch the load speed.'
      : 'The moving light will miss the mark. Pass around its path and reattach from behind to brake it, then tow it back toward the mark.';
  }
  else if (remaining > radius) {
    if (!ours) { stage='acquire'; instruction=isLamp
      ? 'Aim at the original worklight and tap Line to attach. Pull toward its mark; after release, catch it from behind to brake before seating.'
      : 'Aim at the original barge and tap Line to attach. Pull its bow straight toward the receiving apron.'; }
    else if (remaining < radius + Math.max(25, velocity * 8) && velocity > def.maxSpeed) {
      stage='brake'; instruction='Brake early with the Line attached. Watch the load speed; stopping your ship alone does not stop the load.';
    } else { stage='tow'; instruction=isLamp
      ? 'Use short thrusts toward the mark. Release, pass around its path and catch from behind near the mark to brake. A tight reel can start an orbit.'
      : 'Tow straight to the receiving apron. Use thrust for the haul; reeling alone pulls you toward this heavy barge.'; }
  } else if (velocity > def.maxSpeed || pose.spin > def.maxSpin) {
    stage='brake'; instruction=pose.spin > def.maxSpin && velocity <= def.maxSpeed
      ? 'The load is still turning. Let the Line settle it before release.'
      : 'The load is inside its mark but still moving. Brake with the Line attached before releasing it.';
    if (!ours) instruction='The released load is still moving. Reattach the Line and steady it; waiting alone will not stop a drifting body.';
  } else if (ours) { stage='release'; instruction=isLamp
    ? 'The light is inside its mark and slow. Tap Line to release, then choose Seat.'
    : 'The barge is inside the apron and slow. Tap Line to release; Kroll needs two clear seconds to receive it.'; }
  else if (isLamp && !near(owner, pose.pos, 100)) { stage='approach'; instruction='Approach the settled worklight to seat it.'; }
  else if (isLamp) { stage='seat'; instruction='Worklight settled at its mark. Choose Seat to bolt it at this actual position.'; }
  else if (!nativePose(owner, body(owner,'receiver'))) { stage='unavailable'; instruction='Receiving mast unavailable. No safe arrival is recorded.'; }
  else { stage='receiving'; instruction='Line released and barge settled. Hold it clear for two seconds; crew transfer is not recorded yet.'; }
  return {role,entityId:e.id,entityLife:e.occupantGeneration,stage,instruction,label,target,coastEta,
    pos:{...pose.pos},remaining:Math.ceil(remaining),speed:Math.ceil(velocity*10)/10,
    maxSpeed:def.maxSpeed,spin:Math.ceil(pose.spin*100)/100,maxSpin:def.maxSpin,radius,attached:ours};
}
function publish(owner, force = false) {
  const s = owner.state, rt = runs.get(owner), r = record(owner), p = s.entities?.get(s.playerId);
  if (!rt || !r || !eligible(s) || !near(owner, CUT.center, CUT.hearingRadius) || !body(owner, 'receiver')) {
    s.ceresNinthMouthOffer = null; if (rt) { rt.offer = null; rt.signature = ''; } return;
  }
  const status = ceresNinthMouthStatus(owner), guidance = routeGuidance(owner), choices = [];
  let detail;
  if (rt.page === 'story') {
    const scene = krollStoryScene(status, rt.topic, r.conversation?.plan);
    detail = scene.detail;
    choices.push({ id: 'story:people', label: status.status === 'rescued' ? 'And the crew?' : 'Why are you still here?' });
    if (status.status === 'waiting') {
      choices.push({ id: 'story:work', label: 'Talk me through the cut' });
      choices.push({ id: 'story:barge', label: 'Start with the barge' });
      if (CUT.lamps.some(d => body(owner, d.role) && !body(owner, d.role).data.ninthMouthInstalled))
        choices.push({ id: 'story:lights', label: 'Start with a worklight' });
    }
    choices.push({ id: 'work', label: status.status === 'rescued' ? 'Check the remaining work' : 'Back to the work channel' });
    choices.push({ id: 'close', label: 'Keep flying' });
  } else if (rt.page === 'compact') {
    detail = guidance?.instruction || (status.status === 'rescued' ? 'One barge received. Kroll is on the berth radio.' : 'Kroll is holding the service cut for the last barge.');
    choices.push({ id: 'talk', label: 'Call the rescue berth' });
  } else {
    detail = status.status === 'rescued'
      ? `The original barge reached the berth and its Line was released. Crew transfer is recorded. ${status.lights}/3 worklights seated. ${r.tag ? 'Your rescue tag stays at the radio mast.' : 'The lamps remain separate work.'}`
      : status.status === 'lost' ? 'The original barge is lost. No safe arrival was recorded. Surviving worklights remain here.'
        : status.status === 'unavailable' ? 'The barge is not currently resolved. No safe arrival is recorded from a missing signal.'
          : 'One barge is waiting in the shaded service cut. Rescue it now or take the worklights in first. The far opening stays clear for retreat; pulling sideways can move the loose rock.';
    if (r.rockShifted) detail += ' The fallen rock has shifted. Check the gap before another pull.';
    if (guidance) detail += ` ${guidance.label}: ${guidance.instruction}`;
  }
  // Seat stays reachable even with the radio compacted. Every click is still
  // revalidated by lampIssue; guidance never grants authority to freeze a body.
  for (let i = 0; i < CUT.lamps.length; i++) {
    const lamp = body(owner, `lamp:${i}`);
    if (!lamp || !near(owner, lamp.pos, 100)) continue;
    const installed = lamp.data.ninthMouthInstalled === true, issue = lampIssue(owner,i,installed);
    if (rt.page !== 'story' && (rt.page === 'full' || guidance?.role === `lamp:${i}`)) choices.push({
      id:`${installed ? 'unseat' : 'seat'}:${i}`, label:`${installed ? 'Unbolt' : 'Seat'} worklight ${i+1}`, disabled:!!issue });
  }
  if (rt.page === 'full') {
    if (!r.rescue && body(owner,'barge') && guidance?.role !== 'barge') choices.push({id:'guide:barge',label:'Guide the barge rescue'});
    for (let i=0;i<CUT.lamps.length;i++) {
      const lamp=body(owner,`lamp:${i}`);
      if (lamp && !lamp.data.ninthMouthInstalled && guidance?.role !== `lamp:${i}`)
        choices.push({id:`guide:lamp:${i}`,label:`Guide light ${i+1} · ${CUT.lamps[i].label}`});
    }
    choices.push({id:'story',label:status.status === 'rescued' ? 'Speak with Kroll · crew home' : 'Speak with Dessa Kroll'});
    choices.push({id:'close',label:'Keep flying'});
  }
  const headline = rt.page === 'story' ? krollStoryScene(status, rt.topic, r.conversation?.plan).headline
    : status.status === 'rescued' ? 'ONE BARGE HOME' : 'NINTH MOUTH · RESCUE BERTH';
  // A compact radio never erases the chosen route. Distinguish the moving source
  // from the destination; label source only while the pilot needs to acquire it.
  const serviceMarks = guidance ? [
    {id:guidance.role,label:guidance.role === 'barge' ? 'Receiving apron' : guidance.label,
      pos:guidance.target,radius:guidance.radius,readout:guidance.coastEta != null ? `${guidance.remaining} m · projected ${guidance.coastEta} s` : `${guidance.remaining} m · load ${guidance.speed.toFixed(1)} / ${guidance.maxSpeed} m/s`},
    ...(['acquire','approach','coast','intercept'].includes(guidance.stage) ? [{id:'source',label:`${guidance.stage==='coast' ? 'COASTING' : guidance.stage==='approach' ? 'SEAT HERE' : guidance.stage==='intercept' ? 'CATCH FROM BEHIND' : 'PICK UP'} · ${guidance.label}`,
      pos:guidance.pos,radius:8}] : []),
  ] : [{id:'berth',label:'Receiving apron',pos:worldPoint(CUT.berth.local),radius:CUT.berth.radius}];
  const payload = {headline,detail,choices,serviceMarks,guidance:rt.page === 'story' ? null : guidance,playerLife:p.occupantGeneration};
  // Telemetry can update without revoking a legitimate button under the cursor.
  // Changes to phase/choices/player life still revoke every prior callback.
  const signature = JSON.stringify([headline,detail,choices,p.id,p.occupantGeneration,guidance?.entityId,guidance?.entityLife]);
  if (!force && signature === rt.signature && rt.offer) {
    rt.offer.serviceMarks=serviceMarks; rt.offer.guidance=payload.guidance; return;
  }
  rt.signature=signature;
  rt.offer={...payload,id:`ninth-mouth:${++rt.sequence}`,playerId:p.id};
  s.ceresNinthMouthOffer=rt.offer;
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
      else if (payload.action === 'talk' || payload.action === 'work') rt.page = 'full';
      else if (payload.action === 'story' || payload.action.startsWith('story:')) {
        const r = record(owner);
        r.conversation ||= { met: false, plan: null };
        r.conversation.met = true;
        const topic = payload.action.split(':')[1] || 'arrival';
        if (topic === 'barge' || topic === 'lights') {
          const role = topic === 'barge' ? 'barge' : CUT.lamps.find(d => body(owner, d.role) && !body(owner, d.role).data.ninthMouthInstalled)?.role;
          if (!role || !body(owner, role)) return;
          r.conversation.plan = topic; r.guide = role; rt.page = 'full';
        } else { rt.topic = topic; rt.page = 'story'; }
      }
      else if (payload.action.startsWith('guide:')) {
        const role=payload.action.slice(6);
        if (!['barge',...CUT.lamps.map(d=>d.role)].includes(role) || !body(owner,role)) return;
        record(owner).guide=role;
      }
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
  if (!rt || !finite(dt) || dt <= 0 || !eligible(s)) { if (rt) { rt.receivedDwell = 0; rt.offer = null; rt.signature = ''; s.ceresNinthMouthOffer = null; } return; }
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
    sound(owner, 'Crew transfer confirmed. One barge home. Now I can close that boat’s shift. Come to the mast if you want a word; the lamps are separate work.');
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
    sound(owner, krollArrivalLine(ceresNinthMouthStatus(owner), r.conversation?.met));
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
  r.conversation = { met: saved.conversation?.met === true,
    plan: ['barge', 'lights'].includes(saved.conversation?.plan) ? saved.conversation.plan : null };
  r.guide = ['barge',...CUT.lamps.map(d=>d.role)].includes(saved.guide) ? saved.guide : null;
  const q = saved.rescue;
  if (q?.receiptId === RECEIPT && q.storyId === CUT.id && q.bargeIdentity === ID('barge')
    && q.receiverIdentity === ID('receiver') && q.count === 1 && q.committed === true
    && Number.isSafeInteger(q.tick) && q.tick >= 0 && finite(q.simTime) && q.simTime >= 0
    && ['lamps_seated', 'lamps_unseated', 'unobserved'].includes(q.approach)) r.rescue = copy(q);
  r.tag = !!r.rescue && saved.tag === true;
}
