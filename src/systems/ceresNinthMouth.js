// One finite rescue, owned by npcJobsRuntime. World owns the originals, native
// physics owns their motion, and the prompt is only a revalidated work request.
// Dessa Kroll speaks the four written lines and no others; every other word is
// a prompt key or a world tag of at most four words.
import { CERES_NINTH_MOUTH as CUT, worldPoint } from '../data/ceresNinthMouth.js';
import { ninthMouthBodySpec, isNinthMouthBodyEligible, ninthMouthRoleForRecord } from '../world/ceresNinthMouthBodies.js';
import { physicsBodyNativeReady, shouldSyncPhysicsBodyEntity, ensurePhysicsBodySpec } from '../core/physicsAuthority.js';
import { refreshEntityPhysicsIndex } from '../core/coreSystem.js';
import { refreshPhysicsPartition, requestActivityReclassify } from '../world/activityRuntime.js';
import { hullEnvelopeWu, proxyOuterRadiusWu } from '../data/collisionProxyManifests.js';
import { asteroidColliderRadius } from '../data/asteroidColliders.js';
import { asteroidMass } from '../data/sectorPhysical.js';
import { findClearSpawnPoint, markFieldRockAtRest } from './spawnClearance.js';

const ROLES = [...CUT.definitions.map(d => d.role), 'barge'];
const ID = role => `${CUT.id}:${role}`;
const RECEIPT = `${CUT.id}:barge-arrival:01`;
const BARGE_AT = worldPoint(CUT.barge.local);
const BERTH_AT = worldPoint(CUT.berth.local);
const LAMP_AT = CUT.lamps.map(def => worldPoint(def.local));
const ROCK_DEF = CUT.definitions.find(d => d.role === 'fallen_rock');
const ROCK_AT = worldPoint(ROCK_DEF.local);
const ZERO = { x: 0, z: 0 };
// The job's whole script. No other sentence leaves Kroll's channel.
const LINES = Object.freeze({
  offered: `Nine in. Eight out. Shift's stopped.`,
  ribs: 'Mind the ribs.',
  wrong: 'Other way. Other way!',
  home: 'Nine went in. Nine come out.',
});
const LOOSE_ROCK_MAX = 6;
const runs = new WeakMap();
const finite = n => typeof n === 'number' && Number.isFinite(n);
const copy = value => JSON.parse(JSON.stringify(value));
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const speed = e => Math.hypot(e?.vel?.x ?? Infinity, e?.vel?.z ?? Infinity);
const scratchPose = () => ({ pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, spin: 0 });

function fresh() {
  return { version: 1, storyId: CUT.id,
    objects: Object.fromEntries(ROLES.map(role => [role, { identity: ID(role), spawned: false, lost: false }])),
    entered: null, rockShifted: false, debris: 0, rescue: null, tag: null, guide: null, offered: false };
}
function record(owner) { return owner.state.npcJobs?.ceresNinthMouth; }
function eligible(s) {
  if (s.mode !== 'flight' || s.world?.currentSectorId !== CUT.sectorId) return false;
  if (s.run?.kind && !['adventure', 'campaign'].includes(s.run.kind)) return false;
  if (s.save?.restoring || s.physicsVenue?.active || s.ui?.docked) return false;
  const p = s.entities?.get(s.playerId);
  return p?.alive !== false && p?.hull > 0 && !p.flags?.docked;
}
function live(s, e) {
  return e && s.entities?.get(e.id) === e && e.alive !== false && e.hull > 0
    && Number.isSafeInteger(e.occupantGeneration) && e.occupantGeneration > 0;
}
function bindRole(rt, role, e) {
  rt.bindings.set(role, { entity: e, generation: e.occupantGeneration, invalid: false,
    body: e.physicsBody, installed: e.data.ninthMouthInstalled, light: e.data.ninthMouthLight,
    hull: e.hull, hullMax: e.hullMax, itinerary: e.data.itinerary });
}
// Posture, light, vitals and the captured itinerary are the only fields that can
// re-open eligibility. A moving original revalidates nothing per tick.
function bindingStale(b, e) {
  return b.body !== e.physicsBody || b.installed !== e.data.ninthMouthInstalled
    || b.light !== e.data.ninthMouthLight || b.hull !== e.hull || b.hullMax !== e.hullMax
    || b.itinerary !== e.data.itinerary;
}
function body(owner, role) {
  const s = owner.state, rt = runs.get(owner), row = record(owner)?.objects[role];
  if (!rt || !row || row.lost) return null;
  const binding = rt.bindings.get(role);
  if (binding) {
    const e = binding.entity;
    if (!e || binding.invalid || !live(s, e) || binding.generation !== e.occupantGeneration) {
      binding.invalid = true;
      if (e?.alive === false || e?.hull <= 0) row.lost = true;
      return null;
    }
    if (bindingStale(binding, e)) {
      if (!isNinthMouthBodyEligible(e)) { binding.invalid = true; return null; }
      binding.body = e.physicsBody; binding.installed = e.data.ninthMouthInstalled;
      binding.light = e.data.ninthMouthLight; binding.hull = e.hull; binding.hullMax = e.hullMax;
      binding.itinerary = e.data.itinerary;
    }
    return e;
  }
  const list = s.entityList || [];
  let match = null;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.alive === false || e.data?.ninthMouthIdentity !== ID(role)) continue;
    if (match) return null;
    match = e;
  }
  if (!match || !live(s, match) || !isNinthMouthBodyEligible(match)) return null;
  // After lifecycle reset only the world's canonical record may reintroduce an
  // original. Matching copyable tags alone never authorize a replacement.
  const saved = s.world?.records?.byId?.[ID(role)];
  if (!row.spawned || ninthMouthRoleForRecord(saved) !== role || saved?.alive === false
    || ['destroyed', 'defeated'].includes(saved?.outcome)
    || saved?.liveEntityId != null && saved.liveEntityId !== match.id) return null;
  bindRole(rt, role, match);
  row.spawned = true;
  return match;
}

// A rewritten presentation pose, an unprepared body or a stale post-Continue
// snapshot cannot authorize arrival or bolting a worklight to the rock.
function nativePose(owner, e, out) {
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
    const p = b.translation(), v = b.linvel(), w = b.angvel(), o = native._frameOrigin || ZERO;
    if (![p.x, p.z, v.x, v.z, w.y].every(finite)) return null;
    out.pos.x = p.x + o.x; out.pos.z = p.z + o.z;
    out.vel.x = v.x; out.vel.z = v.z; out.spin = Math.abs(w.y);
    return out;
  } catch { return null; }
}
function attached(s, e) {
  const byId = s.combat?.attachments?.byId;
  if (!byId) return false;
  for (const k in byId) {
    const a = byId[k];
    if (a?.state === 'active' && (a.ownerId === e.id && a.ownerGeneration === e.occupantGeneration
      || a.targetId === e.id && a.targetGeneration === e.occupantGeneration)) return true;
  }
  return false;
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
  let pending = null;
  for (const role of ROLES) {
    const existing = body(owner, role), row = r.objects[role];
    if (existing || row.lost) continue;
    const saved = s.world?.records?.byId?.[ID(role)];
    if (Object.hasOwn(s.world?.records?.byId || {}, ID(role))) { row.spawned = true; if (saved?.alive === false || ['destroyed', 'defeated'].includes(saved?.outcome)) row.lost = true; continue; }
    if (row.spawned) continue;
    const spec = ninthMouthBodySpec(role);
    if (!spec || !admissionClear(s, spec)) return;
    (pending ||= []).push([role, spec]);
  }
  if (!pending) return;
  const budget = owner.helpers?.spawnBudget;
  if (pending.some(([role]) => role === 'barge') && budget && budget.request(1, `${CUT.id}:barge`) !== 1) return;
  for (const [role, spec] of pending) {
    r.objects[role].spawned = true;
    const e = owner.helpers.spawnEntity(spec);
    if (e) bindRole(rt, role, e);
    else r.objects[role].lost = true;
  }
}
function lampIssue(owner, index, unseat = false) {
  const lamp = body(owner, `lamp:${index}`), def = CUT.lamps[index], p = nativePose(owner, lamp, runs.get(owner).poseC);
  if (!lamp || !def || !p || lamp.playerOwned || lamp.data.playerOwned || lamp.data.controlLease) return 'UNAVAILABLE';
  if (!near(owner, p.pos, 100)) return 'APPROACH';
  if (attached(owner.state, lamp)) return 'RELEASE LINE';
  if (unseat) return lamp.data.ninthMouthInstalled === true ? null : 'ALREADY LOOSE';
  if (lamp.data.ninthMouthInstalled) return 'SEATED';
  if (distance(p.pos, LAMP_AT[index]) > def.seatRadius) return 'TOW · MARK';
  if (speed(p) > def.maxSpeed || p.spin > def.maxSpin) return 'SETTLE FIRST';
  return null;
}
function litCount(owner) {
  let n = 0;
  for (let i = 0; i < CUT.lamps.length; i++) {
    const e = body(owner, `lamp:${i}`);
    if (e?.data.ninthMouthInstalled === true && e.data.ninthMouthLight === true
      && e.physicsBody?.dynamic === false && distance(e.pos, LAMP_AT[i]) <= CUT.lamps[i].seatRadius) n++;
  }
  return n;
}

export function ceresNinthMouthStatus(owner) {
  const r = record(owner);
  if (!r) return null;
  const barge = body(owner, 'barge'), receiver = body(owner, 'receiver'), lights = litCount(owner);
  return { storyId: CUT.id, status: r.rescue ? 'rescued' : r.objects.barge.lost ? 'lost' : barge ? 'waiting' : 'unavailable',
    // This bounded pocket contains one identified barge, not a fictitious census
    // of eight offscreen departures. General PL-25 traffic accounting is separate.
    rescuedBarges: r.rescue ? 1 : 0, awaitingBarges: !r.rescue && barge ? 1 : 0,
    board: receiver?.data.ninthMouthBoard || (r.rescue ? CUT.board.rescued : CUT.board.waiting),
    lights, rockShifted: r.rockShifted, tag: r.tag ?? null, receipt: r.rescue ? copy(r.rescue) : null };
}
// Guidance reads the same bound original and fresh native pose as settlement.
// Selecting a route changes only the radio/HUD focus, never the target, body or Line.
function playerAttached(s, e) {
  const p = s.entities?.get(s.playerId);
  if (!p) return false;
  const byId = s.combat?.attachments?.byId;
  if (!byId) return false;
  for (const k in byId) {
    const a = byId[k];
    if (a?.state === 'active' && a.ownerId === p.id && a.ownerGeneration === p.occupantGeneration
      && a.targetId === e.id && a.targetGeneration === e.occupantGeneration) return true;
  }
  return false;
}
function routeGuidance(owner) {
  const s = owner.state, r = record(owner), rt = runs.get(owner), p = s.entities?.get(s.playerId);
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
  const pose = nativePose(owner, e, rt.poseD);
  if (!e || !pose || e.playerOwned || e.data.playerOwned || e.data.controlLease) return null;
  const role = e.data.ninthMouthRole, isLamp = role.startsWith('lamp:'), index = isLamp ? Number(role.slice(5)) : -1;
  const def = isLamp ? CUT.lamps[index] : CUT.berth, target = isLamp ? LAMP_AT[index] : BERTH_AT;
  const remaining = distance(pose.pos, target), velocity = speed(pose), linked = attached(s,e), ours = !!playerAttached(s,e);
  const radius = isLamp ? def.seatRadius : def.radius;
  const label = isLamp ? `LAMP ${index+1} · ${def.label.toUpperCase()}` : 'BARGE';
  // Constant-velocity intercept is advice, never a predicted arrival receipt.
  // Recompute from fresh native motion: contact or a bad heading revokes it.
  const dx=pose.pos.x-target.x,dz=pose.pos.z-target.z,v2=velocity*velocity;
  const dot=dx*pose.vel.x+dz*pose.vel.z;
  const discriminant=dot*dot-v2*(remaining*remaining-radius*radius);
  const intercept=v2>.0025 && dot<0 && discriminant>=0 ? (-dot-Math.sqrt(discriminant))/v2 : Infinity;
  const coastEta=isLamp && !linked && remaining>radius && velocity<=def.maxSpeed
    && pose.spin<=def.maxSpin && intercept>0 && intercept<=300 ? Math.ceil(intercept) : null;
  let stage, instruction;
  if (isLamp && e.data.ninthMouthInstalled) { stage='seated'; instruction=`LAMP ${index+1} SEATED`; }
  else if (!isLamp && r.rescue) { stage='received'; instruction=CUT.board.rescued; }
  else if (linked && !ours) { stage='held'; instruction='LINE HOLDS IT'; }
  else if (coastEta != null) { stage='coast'; instruction='COASTING'; }
  else if (isLamp && !linked && velocity>def.maxSpeed) {
    stage='intercept'; instruction=intercept>0 && Number.isFinite(intercept) ? 'CATCH FROM BEHIND' : 'OFF MARK · CATCH';
  }
  else if (remaining > radius) {
    if (!ours) { stage='acquire'; instruction=isLamp ? `TOW · LAMP ${index+1}` : 'TOW · BERTH'; }
    else if (remaining < radius + Math.max(25, velocity * 8) && velocity > def.maxSpeed) {
      stage='brake'; instruction='BRAKE THE LOAD';
    } else { stage='tow'; instruction=isLamp ? 'TOW · MARK' : 'TOW · BERTH'; }
  } else if (velocity > def.maxSpeed || pose.spin > def.maxSpin) {
    stage='brake'; instruction = !ours ? 'STEADY IT'
      : pose.spin > def.maxSpin && velocity <= def.maxSpeed ? 'LET IT SETTLE' : 'BRAKE FIRST';
  } else if (ours) { stage='release'; instruction=isLamp ? 'RELEASE · SEAT' : 'RELEASE · HOLD'; }
  else if (isLamp && !near(owner, pose.pos, 100)) { stage='approach'; instruction='APPROACH LAMP'; }
  else if (isLamp) { stage='seat'; instruction=`SEAT LAMP ${index+1}`; }
  else if (!nativePose(owner, body(owner,'receiver'), rt.poseC)) { stage='unavailable'; instruction='NO MAST'; }
  else { stage='receiving'; instruction='HOLD CLEAR'; }
  return {role,entityId:e.id,entityLife:e.occupantGeneration,stage,instruction,label,target,coastEta,
    pos:{...pose.pos},remaining:Math.ceil(remaining),speed:Math.ceil(velocity*10)/10,
    maxSpeed:def.maxSpeed,spin:Math.ceil(pose.spin*100)/100,maxSpin:def.maxSpin,radius,attached:ours};
}
function publish(owner, force = false) {
  const s = owner.state, rt = runs.get(owner), r = record(owner), p = s.entities?.get(s.playerId);
  const receiver = rt && r ? body(owner, 'receiver') : null;
  if (!rt || !r || !eligible(s) || !near(owner, CUT.center, CUT.hearingRadius) || !receiver) {
    s.ceresNinthMouthOffer = null; if (rt) { rt.offer = null; rt.signature = ''; } return;
  }
  const status = ceresNinthMouthStatus(owner), guidance = routeGuidance(owner), choices = [];
  const board = receiver.data.ninthMouthBoard || CUT.board.waiting;
  let detail;
  if (rt.page === 'compact') {
    detail = guidance?.instruction || board;
    choices.push({ id: 'talk', label: 'CALL KROLL' });
  } else {
    detail = status.status === 'rescued' ? `${board} · original barge reached · ${status.lights}/3 LIT`
      : status.status === 'lost' ? 'BARGE LOST'
        : status.status === 'unavailable' ? 'NO BARGE'
          : `${board} · ${status.lights}/3 LIT`;
    if (status.status === 'rescued' && r.tag) detail += ` · TAG ${r.tag}`;
    if (r.rockShifted) detail += ' · ROCK SHIFTED';
    if (guidance && status.status !== 'rescued') detail += ` · ${guidance.instruction}`;
  }
  // Seat stays reachable even with the radio compacted. Every click is still
  // revalidated by lampIssue; guidance never grants authority to freeze a body.
  for (let i = 0; i < CUT.lamps.length; i++) {
    const lamp = body(owner, `lamp:${i}`);
    if (!lamp || !near(owner, lamp.pos, 100)) continue;
    const installed = lamp.data.ninthMouthInstalled === true, issue = lampIssue(owner,i,installed);
    if (rt.page === 'full' || guidance?.role === `lamp:${i}`) choices.push({
      id:`${installed ? 'unseat' : 'seat'}:${i}`, label:`${installed ? 'UNBOLT' : 'SEAT'} LAMP ${i+1}`, disabled:!!issue, reason:issue||null });
  }
  if (rt.page === 'full') {
    if (!r.rescue && body(owner,'barge') && guidance?.role !== 'barge') choices.push({id:'guide:barge',label:'GUIDE BARGE'});
    for (let i=0;i<CUT.lamps.length;i++) {
      const lamp=body(owner,`lamp:${i}`);
      if (lamp && !lamp.data.ninthMouthInstalled && guidance?.role !== `lamp:${i}`)
        choices.push({id:`guide:lamp:${i}`,label:`GUIDE LAMP ${i+1}`});
    }
    choices.push({id:'close',label:'KEEP FLYING'});
  }
  const headline = board;
  // The headcount board rides the mast as a world tag; the chosen route keeps
  // its destination mark. A compact radio never erases either.
  const serviceMarks = [{ id: 'board', label: board, pos: { x: receiver.pos.x, z: receiver.pos.z }, radius: receiver.radius || 10 }];
  if (guidance) {
    serviceMarks.push(
      {id:guidance.role,label:guidance.role === 'barge' ? 'Receiving apron' : guidance.label,
        pos:guidance.target,radius:guidance.radius,readout:guidance.coastEta != null ? `${guidance.remaining} m · projected ${guidance.coastEta} s` : `${guidance.remaining} m · load ${guidance.speed.toFixed(1)} / ${guidance.maxSpeed} m/s`},
      ...(['acquire','approach','coast','intercept'].includes(guidance.stage) ? [{id:'source',label:`${guidance.stage==='coast' ? 'COASTING' : guidance.stage==='approach' ? 'SEAT HERE' : guidance.stage==='intercept' ? 'CATCH FROM BEHIND' : 'PICK UP'} · ${guidance.label}`,
        pos:guidance.pos,radius:8}] : []));
  } else {
    serviceMarks.push({id:'berth',label:'Receiving apron',pos:BERTH_AT,radius:CUT.berth.radius});
  }
  const payload = {headline,detail,choices,serviceMarks,guidance,playerLife:p.occupantGeneration};
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
    admissionAt: 0, inside: false, receivedDwell: 0, lastTick: null, accumulator: 0, busy: false,
    poseA: scratchPose(), poseB: scratchPose(), poseC: scratchPose(), poseD: scratchPose() };
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
      else if (payload.action.startsWith('guide:')) {
        const role=payload.action.slice(6);
        if (!['barge',...CUT.lamps.map(d=>d.role)].includes(role) || !body(owner,role)) return;
        record(owner).guide=role;
      }
      else {
        const [verb, raw] = payload.action.split(':'), index = Number(raw), unseat = verb === 'unseat';
        if (!['seat', 'unseat'].includes(verb) || !Number.isInteger(index)) return;
        const issue = lampIssue(owner, index, unseat);
        if (issue) { publish(owner, true); return; }
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
      }
      publish(owner, true);
    } finally { rt.busy = false; }
  }));
  rt.dispose = () => { off.forEach(fn => fn?.()); reset(); runs.delete(owner); };
  return rt.dispose;
}

// The wall gives way near the barge: a bounded handful of loose rock through
// the ordinary asteroid spawn seam, once per wrong pull. Never scripted damage.
function releaseLooseRock(owner, at, r) {
  const s = owner.state, room = LOOSE_ROCK_MAX - (r.debris | 0);
  if (room <= 0 || typeof owner.helpers?.spawnEntity !== 'function') return;
  const rng = typeof s.rng === 'function' ? s.rng : (() => .5);
  const count = Math.min(room, 2 + Math.floor(rng() * 5));
  for (let i = 0; i < count; i++) {
    const radius = 4 + Math.floor(rng() * 6), hull = 40 + radius * 8;
    // R11: loose rock rests — no self-motion at birth, no seat under a live body. The wall
    // still gives way at `at`; the shared contract just refuses to pop a rock into a hull.
    const seat = findClearSpawnPoint(s, {
      x: at.x + (rng() * 2 - 1) * 26, z: at.z + (rng() * 2 - 1) * 16,
      radius, rng,
    });
    if (!seat) break;
    const e = owner.helpers.spawnEntity({
      type: 'asteroid', name: 'Ninth Mouth loose rock',
      pos: { x: seat.x, z: seat.z },
      vel: { x: 0, z: 0 },
      rot: rng() * Math.PI * 2, angVel: (rng() - .5) * .4,
      radius, mass: asteroidMass(CUT.sectorId, radius),
      hull, hullMax: hull, collides: true,
      physicsBody: { radius: asteroidColliderRadius('ast_common_rock', radius), mass: asteroidMass(CUT.sectorId, radius), dynamic: true, ccd: true },
      homeSectorId: CUT.sectorId,
      data: { typeId: 'ast_common_rock', oreHP: hull, oreHPMax: hull, ninthMouthDebris: true,
        name: 'Ninth Mouth loose rock', scanLabel: 'Ninth Mouth loose rock', lifetimeS: Infinity },
    });
    if (!e) break;
    markFieldRockAtRest(e, { simTime: s.simTime });
    r.debris = (r.debris | 0) + 1;
  }
}

export function stepCeresNinthMouth(owner, dt) {
  const s = owner.state, rt = runs.get(owner);
  if (!rt) return;
  if (!record(owner) && s.world?.currentSectorId !== CUT.sectorId) return;
  if (!finite(dt) || dt <= 0 || !eligible(s)) { rt.receivedDwell = 0; rt.offer = null; rt.signature = ''; s.ceresNinthMouthOffer = null; return; }
  if (rt.lastTick === s.tick) return;
  rt.lastTick = s.tick;
  s.npcJobs ||= {}; s.npcJobs.ceresNinthMouth ||= fresh();
  admit(owner);
  const r = record(owner), barge = body(owner, 'barge'), receiver = body(owner, 'receiver');
  const pose = nativePose(owner, barge, rt.poseA);
  if (pose && !r.entered && near(owner, BARGE_AT, 90)) {
    r.entered = litCount(owner) ? 'lamps_seated' : 'lamps_unseated';
    sound(owner, LINES.ribs);
  }
  const rock = body(owner, 'fallen_rock'), rockPose = nativePose(owner, rock, rt.poseB);
  if (rockPose && distance(rock.pos, ROCK_AT) > 8 && !r.rockShifted) {
    r.rockShifted = true;
    sound(owner, LINES.wrong);
    releaseLooseRock(owner, rock.pos, r);
  }
  const ready = !r.rescue && pose && nativePose(owner, receiver, rt.poseC)
    && !barge.playerOwned && !barge.data.playerOwned && !barge.data.controlLease
    && distance(pose.pos, BERTH_AT) <= CUT.berth.radius
    && speed(pose) <= CUT.berth.maxSpeed && pose.spin <= CUT.berth.maxSpin && !attached(s, barge);
  rt.receivedDwell = ready ? rt.receivedDwell + Math.min(dt, 1 / 30) : 0;
  if (ready && rt.receivedDwell >= CUT.berth.dwellS) {
    // Commit before callbacks: duplicates, nested updates and save observers see
    // exactly one arrival of this original. Cargo and profit are not inferred.
    r.rescue = { receiptId: RECEIPT, storyId: CUT.id, bargeIdentity: ID('barge'), receiverIdentity: ID('receiver'),
      count: 1, committed: true, tick: s.tick, simTime: s.simTime, approach: r.entered || 'unobserved' };
    rt.page = 'full';
    receiver.data.ninthMouthBoard = CUT.board.rescued;
    sound(owner, LINES.home);
    if (record(owner) === r) owner.bus.emit('ceresNinthMouth:rescueCommitted', copy(r.rescue));
  }
  // The lip keeps the pilot's tag as a durable world mark. Kroll says nothing
  // for it; the receiver mast carries it.
  if (r.rescue && !r.tag && receiver) r.tag = s.player?.callsign || s.player?.name || 'you';
  if (receiver && r.tag) receiver.data.ninthMouthTag = r.tag;
  const inside = near(owner, CUT.center, CUT.hearingRadius);
  if (inside && !rt.inside && speed(s.entities.get(s.playerId)) < 35) {
    rt.page = 'full'; rt.signature = ''; rt.inside = true;
    if (!r.rescue && !r.offered) { r.offered = true; sound(owner, LINES.offered); }
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
  r.debris = Number.isSafeInteger(saved.debris) && saved.debris >= 0 ? Math.min(saved.debris, LOOSE_ROCK_MAX) : 0;
  r.offered = saved.offered === true;
  r.guide = ['barge',...CUT.lamps.map(d=>d.role)].includes(saved.guide) ? saved.guide : null;
  const q = saved.rescue;
  if (q?.receiptId === RECEIPT && q.storyId === CUT.id && q.bargeIdentity === ID('barge')
    && q.receiverIdentity === ID('receiver') && q.count === 1 && q.committed === true
    && Number.isSafeInteger(q.tick) && q.tick >= 0 && finite(q.simTime) && q.simTime >= 0
    && ['lamps_seated', 'lamps_unseated', 'unobserved'].includes(q.approach)) r.rescue = copy(q);
  r.tag = !!r.rescue && typeof saved.tag === 'string' && saved.tag.length > 0 && saved.tag.length <= 40 ? saved.tag : null;
}
