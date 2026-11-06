// The Empty Plinth is an attended job of npcJobsRuntime. This module has no
// registry entry, clock, motion integration, economy writer or private entities.
import { lanternWardActorSpec } from '../world/lanternWardActors.js';
import { removeCargo, sellableCargoQty } from './cargo.js';
import { writeOwnedPhysicsControl, cancelOwnedPhysicsControl, physicsBodyNativeReady, queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { attachmentBindsOccupant } from '../combat/attachments.js';
import { emitCommissionCue } from '../audio/commissionCues.js';
import {
  LANTERN_WARD_ID, LANTERN_WARD_SECTOR, LANTERN_WARD_BODY_CONTRACTS,
  lanternWardPoint, lanternWardSocketWorld,
} from '../data/lanternWardLayout.js';
import {
  LANTERN_WARD_RECORD_IDS as IDS, LANTERN_WARD_LAMP_SERIAL as SERIAL,
  LANTERN_WARD_PART_SERIAL as PART_SERIAL,
  LANTERN_WARD_HARDWARE_ROLES, lanternWardCanonicalAnchor,
  lanternWardHardwareSpec, captureLanternWardHardware, isLanternWardHardwareEntity,
  isLanternWardWorkpieceEligible,
} from '../data/lanternWardHardware.js';

const STORY = 'lw_helios_empty_plinth';
const RECEIPT = 'lantern-ward:venn-family-lamp:service:01';
const ROLES = Object.keys(IDS);
const ACTORS = ['tug', 'commuter', 'maintenance'];
const CONTROL = 'lantern_ward_attended_work';
const runtimes = new WeakMap();
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const speed = e => Math.hypot(finite(e?.vel?.x), finite(e?.vel?.z));
const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
const now = owner => finite(owner.state?.simTime);
const tick = owner => Math.max(0, Math.trunc(finite(owner.state?.tick)));
const position = (anchor, key, x = 0, z = 0) => {
  const p = lanternWardPoint(anchor, key); return { x: p.x + x, z: p.z + z };
};

function freshWard() {
  return { version: 1, initialized: false, phase: 'blocked',
    objects: Object.fromEntries(ROLES.map(role => [role, { recordId: IDS[role], spawned: false, lost: false }])),
    history: { playerCleared: false, playerCarried: false, borrowed: false, cradleStolen: false,
      lampStolen: false, damaged: false, repaired: false, ignored: false, recovered: false,
      clampSounded: false, departures: 0, installations: 0, maintenanceServices: 0 },
    observedS: 0, blockedS: 0, workS: 0, maintenanceS: 0, maintenancePickupS: 0, maintenancePhase: 'approach',
    commuterLeg: 0, commuterDwellS: 0, commuterWaitS: 0, firstCompletionReceipt: null,
    lastSector: null, lastStepTick: null, firstSeenAtS: null, repairConsumed: false, needsReinstall: false,
    lampMissing: false, receiverMissing: false, cradleAway: false,
    obstructionTouchedAtS: null, clearanceLane: 0, tugRouteMode: null, tugRouteStage: 0,
    cradleRouteStage: 0, tugReturnStage: 0,
  };
}

function ward(owner) {
  const jobs = owner._ensureState ? owner._ensureState()
    : (owner.state.npcJobs || (owner.state.npcJobs = {}));
  if (!jobs.lanternWard || jobs.lanternWard.version !== 1) jobs.lanternWard = freshWard();
  return jobs.lanternWard;
}

function runtime(owner) {
  let r = runtimes.get(owner);
  if (!r) { r = { bindings: new Map(), controls: new Map(), attachments: new Map(), visit: null }; runtimes.set(owner, r); }
  return r;
}

function entityFor(owner, role) {
  const r = runtime(owner), row = ward(owner).objects[role], binding = r.bindings.get(role);
  if (!row || row.lost) return null;
  if (binding) {
    if (binding.invalid) return null;
    const e = binding.entity;
    if (owner.state.entities?.get(e.id) === e && e.occupantGeneration === binding.generation
        && e.alive !== false && e.data?.worldRecordId === IDS[role]
        && (!LANTERN_WARD_HARDWARE_ROLES.includes(role) || isLanternWardHardwareEntity(e))) return e;
    // A live visit never follows a recycled numeric id, even when its replacement
    // copies the previous body's public tags. New visits resolve durable records.
    binding.invalid = true;
    if (e.alive === false || (e.hull != null && e.hull <= 0)) row.lost = true;
    return null;
  }
  const matches = (owner.state.entityList || [...(owner.state.entities?.values() || [])])
    .filter(e => e?.alive !== false && e.data?.worldRecordId === IDS[role]
      && (!LANTERN_WARD_HARDWARE_ROLES.includes(role) || isLanternWardHardwareEntity(e)));
  if (matches.length !== 1) return null;
  const e = matches[0];
  if (owner.state.entities?.get(e.id) !== e) return null;
  r.bindings.set(role, { entity: e, generation: e.occupantGeneration, invalid: false });
  row.spawned = true;
  return e;
}

function nativePose(owner, e) {
  if (!e || !e.pos || !e.vel || e.alive === false || !physicsBodyNativeReady(e)) return null;
  if (owner.state.settings?.gameplay?.physicsBackend !== 'rapier-dynamic') return { pos: e.pos, vel: e.vel, rot: e.rot || 0 };
  const physics = owner.registry?.get?.('physics'), native = physics?._sg02;
  const rec = native?.records?.get(e.id), body = rec?.body;
  if (physics?._nativeRestorePending || physics?._nativeRestoreDeferred || rec?.entity !== e
      || !body || native.world.getRigidBody(body.handle) !== body
      || !Number.isInteger(native._simTick) || tick(owner) - native._simTick < 0
      || tick(owner) - native._simTick > 2 || (rec.spec.dynamic !== false && rec._postStepReadTick !== native.tick)) return null;
  try {
    if (!body.isEnabled()) return null;
    const p = body.translation(), v = body.linvel(), q = body.rotation(), o = native._frameOrigin || { x: 0, z: 0 };
    if (![p.x, p.z, v.x, v.z, q.y, q.w].every(Number.isFinite)) return null;
    return { pos: { x: p.x + o.x, z: p.z + o.z }, vel: { x: v.x, z: v.z },
      rot: Math.atan2(-2 * q.y * q.w, 1 - 2 * q.y * q.y) };
  } catch { return null; }
}

function attachments(owner) { return owner._combatAttachments?.() || owner.registry?.get?.('combat')?.kernel?.attachments || null; }
function kernel(owner) { const combat = owner.registry?.get?.('combat'); return combat?.kernel || combat?.ensureKernel?.(); }
function hasWorkPower(owner, e) {
  const live = owner.state.combat?.entities?.[String(e?.id)];
  return (live?.capabilities || kernel(owner)?.capabilities?.(e?.id)?.capabilities)?.power === true;
}
const lineDefinition = key => key === 'clearing' || key === 'maintenance-tow'
  ? 'tether_standard' : 'attachment_transport_clamp';
const eligibleEndpoint = e => !['lamp', 'maintenance_part'].includes(e?.data?.lanternWardRole)
  || isLanternWardWorkpieceEligible(e);
function activeLine(owner, key, a, b) {
  const id = runtime(owner).attachments.get(key), line = id && attachments(owner)?.get?.(id);
  if (!line || line.state !== 'active' || !a || !b || line.ownerId !== a.id || line.targetId !== b.id
      || line.controlMode !== CONTROL || line.defId !== lineDefinition(key)
      || !eligibleEndpoint(a) || !eligibleEndpoint(b)
      || !attachmentBindsOccupant(line, a.id, a.occupantGeneration)
      || !attachmentBindsOccupant(line, b.id, b.occupantGeneration)) return null;
  return line;
}
function dropLine(owner, key, reason) {
  const id = runtime(owner).attachments.get(key), service = attachments(owner), line = id && service?.get?.(id);
  if (line?.state === 'active' && line.controlMode === CONTROL) service.breakAttachment(line, reason, null);
  runtime(owner).attachments.delete(key);
}
function lineBetween(owner, key, a, b, source, target, defId = 'attachment_transport_clamp') {
  if (defId !== lineDefinition(key) || !eligibleEndpoint(a) || !eligibleEndpoint(b)) return null;
  const held = activeLine(owner, key, a, b);
  if (held) return held;
  if (!nativePose(owner, a) || !nativePose(owner, b)) return null;
  const service = attachments(owner);
  // Continue can restore a real native attachment before this job restores its
  // transient map. Adopt only an exact generation-bound link with our control mode.
  const existing = service?.listForEntity?.(a.id)?.find(row => row.state === 'active'
    && row.controlMode === CONTROL && row.defId === defId && row.ownerId === a.id && row.targetId === b.id
    && attachmentBindsOccupant(row, a.id, a.occupantGeneration)
    && attachmentBindsOccupant(row, b.id, b.occupantGeneration));
  if (existing) { runtime(owner).attachments.set(key, existing.id); return existing; }
  const made = service?.create?.({ defId, ownerId: a.id, targetId: b.id, controlMode: CONTROL,
    sourceWorld: { x: source.x, y: 0, z: source.z }, targetWorld: { x: target.x, y: 0, z: target.z } });
  if (!made?.ok || made.attachment?.state !== 'active') return null;
  if (defId === 'attachment_transport_clamp' && made.attachment.restLength < .5) {
    const paid = service.reel?.(made.attachment.id, .5 - made.attachment.restLength, .5);
    if (paid?.ok !== true) { service.breakAttachment(made.attachment, 'lantern_invalid_capture_length', null); return null; }
  }
  runtime(owner).attachments.set(key, made.attachment.id);
  if (key === 'load' && !ward(owner).history.clampSounded && playerNear(owner, a.pos, 220)) {
    ward(owner).history.clampSounded = true;
    emitCommissionCue(owner.bus, 'commission.lantern.clamp', `lantern:${made.attachment.id}`, LANTERN_WARD_SECTOR, tick(owner));
  }
  return made.attachment;
}
function playerNear(owner, at, radius = 220) {
  const p = owner.state.entities?.get(owner.state.playerId);
  return !!p && p.alive !== false && distance(p.pos, at) <= radius;
}
function playerLine(owner, e) {
  if (!e) return false;
  return (attachments(owner)?.listForEntity?.(e.id) || []).some(line => line.state === 'active'
    && line.controlMode !== CONTROL && (line.ownerId === owner.state.playerId || line.controllerId === owner.state.playerId)
    && attachmentBindsOccupant(line, e.id, e.occupantGeneration));
}


function ensureBodies(owner, anchor) {
  const w = ward(owner);
  for (const role of ROLES) {
    const row = w.objects[role], existing = entityFor(owner, role), record = owner.state.world?.records?.byId?.[IDS[role]];
    if (existing) continue;
    if (record) { row.spawned = true; if (record.alive === false || ['destroyed', 'defeated'].includes(record.outcome)) row.lost = true; continue; }
    if (row.spawned || row.lost) continue;
    const budget = owner.helpers?.spawnBudget, actor = ACTORS.includes(role), requestId = `lantern-ward:${role}`;
    if (actor && budget && budget.request(1, requestId) !== 1) continue;
    const spec = actor ? lanternWardActorSpec(role, anchor) : lanternWardHardwareSpec(role);
    const e = spec && owner.helpers?.spawnEntity?.(spec);
    if (!e) { if (actor && budget) budget.release(requestId); continue; }
    row.spawned = true;
    runtime(owner).bindings.set(role, { entity: e, generation: e.occupantGeneration });
    if (actor && budget) budget.bindEntity(e.id, requestId);
  }
  w.initialized = true;
}

function claimActor(owner, e) {
  if (!e || e.alive === false || e.playerOwned || e.data?.playerOwned) return false;
  const jobs = owner.helpers?.npcJobs;
  if (!jobs) return false;
  let entry = jobs.byEntity?.(e.id), jobId = entry?.job?.jobId || entry?.job?.id || e.data?.jobId;
  if (!jobId || !jobs.get?.(jobId)) {
    jobId = jobs.assign(e, { kind: 'hauler', sectorId: LANTERN_WARD_SECTOR, speed: 10,
      route: [{ id: 'lantern:work', pos: { ...e.pos } }, { id: 'lantern:hold', pos: { ...e.pos } }],
      payload: { lanternWard: true } });
  }
  if (!jobId) return false;
  const granted = jobs.claimControl?.(jobId, { claimId: CONTROL, holder: CONTROL })?.granted === true;
  if (granted && e.data?.itinerary?.lanternWard) e.data.itinerary.lanternWard.workLease = CONTROL;
  return granted;
}

function fly(owner, e, target, maxSpeed = 9, radius = 3) {
  const pose = nativePose(owner, e);
  if (!pose || !target || !claimActor(owner, e)) return false;
  const dx = target.x - pose.pos.x, dz = target.z - pose.pos.z, d = Math.hypot(dx, dz);
  const desired = Math.min(maxSpeed, d * 0.7), scale = desired / Math.max(d, 1e-9);
  const dvx = dx * scale - pose.vel.x, dvz = dz * scale - pose.vel.z;
  const c = Math.cos(pose.rot), s = Math.sin(pose.rot);
  const main = Math.max(4, finite(e.thrust, 150) / Math.max(1, finite(e.mass, 50)));
  owner._writeIntent?.(e, clamp((-dvx * s + dvz * c) / (main * .65), -1, 1),
    clamp((dvx * c + dvz * s) / main, -1, 1), false,
    d > 4 ? Math.atan2(dz, dx) : pose.rot, d <= radius && speed(e) > .6);
  return d <= radius && Math.hypot(pose.vel.x, pose.vel.z) < 1.1;
}

// The cradle's electric manoeuvring bells may drive through SG-02 while its
// operator attends. This issues bounded forces; it never
// edits position, velocity, native handles, or the physics body's specification.
function workForce(owner, e, target, maxSpeed = 4, maxAccel = 5) {
  const p = nativePose(owner, e); if (!p || playerLine(owner, e)) return false;
  const dx = target.x - p.pos.x, dz = target.z - p.pos.z, d = Math.hypot(dx, dz);
  const v = Math.min(maxSpeed, d * 1.2), a = v / Math.max(d, 1e-9);
  const ax = clamp((dx * a - p.vel.x) * 2.2, -maxAccel, maxAccel), az = clamp((dz * a - p.vel.z) * 2.2, -maxAccel, maxAccel);
  const mass = e.physicsBody?.mass || e.mass || 1;
  const inertia = e.physicsBody?.inertiaY || mass * 100;
  const yawError = Math.atan2(Math.sin(-p.rot), Math.cos(-p.rot));
  const receipt = writeOwnedPhysicsControl(e, { source: CONTROL, mode: 'attended_work',
    force: { x: mass * ax, z: mass * az },
    torque: { y: inertia * clamp(yawError * 2 - finite(e.angVel) * 3, -.35, .35) }, maxSpeed });
  runtime(owner).controls.set(e, receipt);
  return d < 1 && Math.hypot(p.vel.x, p.vel.z) < .2 && Math.abs(yawError) < .08 && Math.abs(finite(e.angVel)) < .03;
}

function stopPreviousWorkForces(owner) {
  const r = runtime(owner);
  for (const [e] of r.controls) {
    if (e.alive !== false && owner.state.entities?.get(e.id) === e) {
      writeOwnedPhysicsControl(e, { source: CONTROL, mode: 'work_released', force: { x: 0, z: 0 }, torque: { y: 0 } });
    }
  }
  r.controls.clear();
}

function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, den = dx * dx + dz * dz;
  const t = den ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / den, 0, 1) : 0;
  return distance(p, { x: a.x + dx * t, z: a.z + dz * t });
}

function segmentDistance(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  if (cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0
      && Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
      && Math.max(Math.min(a.z, b.z), Math.min(c.z, d.z)) <= Math.min(Math.max(a.z, b.z), Math.max(c.z, d.z))) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

/** Clearance measures the current fallen mast, including arbitrary rotations. */
function clearCutLane(owner, anchor, obstacle) {
  const pose = nativePose(owner, obstacle);
  if (!pose) return obstacle && distance(obstacle.pos, position(anchor, 'obstruction')) <= 200 ? null : 0;
  const cut = position(anchor, 'obstruction'), c = Math.cos(pose.rot), s = Math.sin(pose.rot);
  const a = { x: pose.pos.x - 29 * c, z: pose.pos.z - 29 * s };
  const b = { x: pose.pos.x + 29 * c, z: pose.pos.z + 29 * s };
  // The procession occupies a 36 WU swept envelope. Either real side route
  // through the 84 WU throat is sufficient; any force can earn this fact.
  // Test the swept route, not only the throat's centre point. A mast pushed
  // halfway through the cut still blocks the rig downstream of that point.
  const loadTarget = position(anchor, 'receiver', 0, 45);
  return [0, -22, 22].find(z => {
    const entry = { x: cut.x - 40, z: cut.z + z }, exit = { x: cut.x + 35, z: cut.z + z };
    return segmentDistance(entry, exit, a, b) >= 24 && segmentDistance(exit, loadTarget, a, b) >= 24;
  }) ?? null;
}

function crewStand(anchor, w) {
  // A borrowed load arrives from the open east side. A cut-route operator
  // attends beside the receiver's west approach, clear of every loaded lane.
  // The old center stand was in the cradle's swept path: arriving first could
  // pin the rig there forever, including after Continue.
  return w.tugRouteMode === 'bypass' ? position(anchor, 'receiver', 45, 45)
    : position(anchor, 'receiver', -22, 16);
}

function flyTugToWork(owner, tug, anchor, w, blocked) {
  const mode = blocked ? 'bypass' : 'cut';
  if (w.tugRouteMode !== mode) { w.tugRouteMode = mode; w.tugRouteStage = 0; }
  const cut = position(anchor, 'obstruction');
  const points = blocked ? [
    { x: cut.x - 70, z: cut.z + 80 }, { x: cut.x + 70, z: cut.z + 100 },
    { x: cut.x + 70, z: cut.z + 65 }, crewStand(anchor, w),
  ] : [
    { x: cut.x - 40, z: cut.z + w.clearanceLane },
    { x: cut.x + 6, z: cut.z + w.clearanceLane }, crewStand(anchor, w),
  ];
  const index = Math.min(w.tugRouteStage, points.length - 1);
  const load = entityFor(owner, 'cradle');
  const following = w.phase === 'transit' && load && distance(load.pos, tug.pos) < 70;
  const at = fly(owner, tug, points[index], following ? 4 : 8, 3);
  if (at && index < points.length - 1) w.tugRouteStage = index + 1;
  return at && index === points.length - 1;
}

function flyTugHome(owner, tug, anchor, w, obstacle) {
  const home = position(anchor, 'cradle', -40, 28);
  if (clearCutLane(owner, anchor, obstacle) != null) { w.tugReturnStage = 0; return fly(owner, tug, home, 8, 4); }
  // The return carries no lamp. A still-blocked cut remains blocked: use the
  // open freight rim, outside the installed cradle and the household tender.
  const points = [position(anchor, 'receiver', 45, 195),
    position(anchor, 'cradle', 25, 150), position(anchor, 'cradle', 25, 50), home];
  const index = Math.min(w.tugReturnStage, points.length - 1);
  const at = fly(owner, tug, points[index], 8, 4);
  if (at && index < points.length - 1) w.tugReturnStage = index + 1;
  return at && index === points.length - 1;
}

/** Causal observations augment outcome-based service; proximity cannot credit
 * an ambient collision to the player. The canonical owner forwards these. */
export function noteLanternWardInteraction(owner, payload, kind) {
  if (!owner?.state || !payload || owner.state.world?.currentSectorId !== LANTERN_WARD_SECTOR) return false;
  const obstacle = entityFor(owner, 'obstruction'), player = owner.state.entities?.get(owner.state.playerId);
  if (!obstacle || !player || !nativePose(owner, obstacle)) return false;
  let accepted = false;
  if (kind === 'impact' && payload.tick === tick(owner) && payload.impulse > 0
      && (payload.playerInvolved === true || payload.causalActorId === player.id)) {
    accepted = (payload.aId === obstacle.id && payload.aGeneration === obstacle.occupantGeneration)
      || (payload.bId === obstacle.id && payload.bGeneration === obstacle.occupantGeneration);
  } else if (kind === 'damage') {
    accepted = payload.targetId === obstacle.id && payload.attackerId === player.id && payload.applied > 0
      && obstacle.lastDamageT === now(owner) && payload.after?.hull === obstacle.hull;
  }
  if (accepted) ward(owner).obstructionTouchedAtS = now(owner);
  return accepted;
}

function setPhase(entity, phase, progress = 0, worker = false) {
  if (!entity?.data) return;
  entity.data.lanternWardPhase = phase;
  entity.data.lanternWardProgress01 = clamp(progress, 0, 1);
  entity.data.lanternWardWorkerPresent = worker;
}
function custody(lamp, holder, line = null) {
  if (!lamp?.data) return;
  lamp.data.lanternWardCustody = { holder, serial: SERIAL,
    ...(line?.state === 'active' && ['cradle', 'receiver'].includes(holder) ? { clamp: {
      attachmentId: line.id, active: true, ownerRecordId: IDS[holder], targetRecordId: IDS.lamp,
    } } : {}),
  };
  if (lamp.data.cargoManifest) lamp.data.cargoManifest.custody = { holderId: IDS[holder] || holder };
}

function theft(owner, role, e, anchor) {
  if (!e || !playerLine(owner, e)) return;
  const w = ward(owner);
  if (role === 'cradle') w.history.borrowed = true;
  if (distance(e.pos, position(anchor, 'cradle')) <= 280) return;
  if (role === 'cradle' && w.firstCompletionReceipt?.playerHelped) return;
  const key = role === 'lamp' ? 'lampStolen' : 'cradleStolen';
  if (w.history[key]) return;
  w.history[key] = true;
  if (role === 'lamp') custody(e, 'player');
  else e.data.lanternWardCustody = { holder: 'player' };
  owner.registry?.get?.('lawSecurity')?.reportIncident?.({
    reportId: `lantern-ward:theft:${role}:01`, kind: 'payload_theft', offenderStableId: 'player',
    offenderEntityId: owner.state.playerId, payloadStableId: IDS[role],
    victimEntityId: entityFor(owner, 'tug')?.id, causalTick: tick(owner), pos: { ...e.pos },
  });
}

function updateMaintenance(owner, dt, anchor, tender, face, part) {
  const w = ward(owner);
  if (!tender || !face) return;
  const source = position(anchor, 'maintenanceSource', 55, 73), stand = position(anchor, 'maintenanceFace', 23, 90);
  if (!isLanternWardWorkpieceEligible(part) || !nativePose(owner, part)) {
    face.data.lanternWardRepaired = false;
    setPhase(face, 'waiting'); w.maintenanceS = 0;
    tender.data.lanternWardCarrying = null; fly(owner, tender, source, 7, 4); return;
  }
  if (playerLine(owner, part)) {
    dropLine(owner, 'maintenance-tow', 'lantern_part_taken');
    dropLine(owner, 'maintenance-seat', 'lantern_part_taken');
    part.data.lanternWardCustody = { holder: 'loose', serial: PART_SERIAL };
    part.data.cargoManifest.custody = { holderId: 'loose' };
    tender.data.lanternWardCarrying = null;
    face.data.lanternWardRepaired = false;
    w.maintenancePhase = 'approach'; w.maintenanceS = 0;
    setPhase(face, 'waiting'); return;
  }
  if (w.history.maintenanceServices === 1 && part && !playerLine(owner, part)
      && distance(part.pos, lanternWardSocketWorld(face, 'service_approach')) < 5) {
    const held = lineBetween(owner, 'maintenance-seat', face, part,
      lanternWardSocketWorld(face, 'service_approach'), part.pos);
    if (held) {
      part.data.lanternWardCustody = { holder: 'service_face', serial: PART_SERIAL,
        clamp: { attachmentId: held.id, active: true, ownerRecordId: IDS.service_face, targetRecordId: IDS.maintenance_part } };
      part.data.cargoManifest.custody = { holderId: IDS.service_face };
    }
    if (held && hasWorkPower(owner, face)) workForce(owner, part, lanternWardSocketWorld(face, 'service_approach'), .5, 30);
  }
  const alreadyDone = w.history.maintenanceServices === 1
    && !!activeLine(owner, 'maintenance-seat', face, part)
    && distance(part.pos, lanternWardSocketWorld(face, 'service_approach')) < 5;
  face.data.lanternWardRepaired = alreadyDone;
  if (!alreadyDone && (w.maintenancePhase === 'retreat' || w.maintenancePhase === 'inspection')) {
    w.maintenancePhase = 'approach'; w.maintenanceS = 0;
  }
  if (w.maintenancePhase === 'retreat') {
    setPhase(face, 'retreat');
    if (fly(owner, tender, source, 8, 4)) { w.maintenancePhase = 'inspection'; w.maintenanceS = 0; }
    return;
  }
  if (w.maintenancePhase === 'inspection') {
    // A completed finite repair leaves an empty tender. The later inspection is
    // a service, not a periodically conjured second bearing or cargo transfer.
    if (fly(owner, tender, source, 8, 4)) w.maintenanceS += dt;
    if (w.maintenanceS > 36) { w.maintenancePhase = 'approach'; w.maintenanceS = 0; }
    return;
  }
  const manifest = part?.data?.cargoManifest;
  let capture = activeLine(owner, 'maintenance-seat', face, part);
  if (!alreadyDone && !capture) {
    let line = activeLine(owner, 'maintenance-tow', tender, part);
    if (!line) {
      // The launch starts empty and physically approaches this one canister at
      // the freight apron. There is no timer refill of its hold.
      if (!fly(owner, tender, { x: part.pos.x + 35, z: part.pos.z + 38 }, 5, 2)) { setPhase(face, 'waiting'); return; }
      line = lineBetween(owner, 'maintenance-tow', tender, part, tender.pos, part.pos, 'tether_standard');
      if (!line) return;
      w.maintenancePickupS = 0;
      part.data.lanternWardCustody = { holder: 'maintenance', serial: PART_SERIAL,
        clamp: { attachmentId: line.id, active: true, ownerRecordId: IDS.maintenance, targetRecordId: IDS.maintenance_part } };
      manifest.custody = { holderId: IDS.maintenance };
      tender.data.lanternWardCarrying = IDS.maintenance_part;
    }
    if (!fly(owner, tender, stand, 5, 3) || distance(part.pos, face.pos) > 75) { setPhase(face, 'approach'); return; }
    w.maintenancePickupS += dt;
    if (w.maintenancePickupS < 2) { setPhase(tender, 'brace', w.maintenancePickupS / 2); return; }
    const socket = lanternWardSocketWorld(face, 'service_approach');
    dropLine(owner, 'maintenance-tow', 'lantern_shutter_receiving');
    part.data.lanternWardCustody = { holder: 'loose', serial: PART_SERIAL };
    manifest.custody = { holderId: 'loose' };
    capture = lineBetween(owner, 'maintenance-seat', face, part, socket, part.pos);
    if (!capture) return;
    part.data.lanternWardCustody = { holder: 'service_face', serial: PART_SERIAL,
      clamp: { attachmentId: capture.id, active: true, ownerRecordId: IDS.service_face, targetRecordId: IDS.maintenance_part } };
    manifest.custody = { holderId: IDS.service_face };
  }
  const attending = fly(owner, tender, stand, 7, 3) && nativePose(owner, face) && hasWorkPower(owner, tender);
  if (!attending) { setPhase(face, 'approach'); w.maintenanceS = 0; return; }
  if (!alreadyDone) {
    const socket = lanternWardSocketWorld(face, 'service_approach');
    if (capture.restLength > .5) attachments(owner)?.reel?.(capture.id, -2 * dt, .5);
    if (distance(part.pos, socket) < 12) workForce(owner, part, socket, .5, 30);
    if (distance(part.pos, socket) > 2 || speed(part) > .8) { setPhase(face, 'brace', 0, true); w.maintenanceS = 0; return; }
  }
  w.maintenanceS += dt;
  const phase = w.maintenanceS < 2 ? 'brace' : w.maintenanceS < 9 ? 'connect' : 'finish';
  setPhase(face, phase, w.maintenanceS / 12, true);
  if (w.maintenanceS < 12) return;
  if (!alreadyDone) {
    // The same physical canister remains installed at the service face. Its
    // manifest changes holder exactly once; the launch only held a reference.
    part.data.lanternWardCustody = { holder: 'service_face', serial: PART_SERIAL,
      clamp: { attachmentId: capture.id, active: true, ownerRecordId: IDS.service_face, targetRecordId: IDS.maintenance_part } };
    manifest.custody = { holderId: IDS.service_face };
    tender.data.lanternWardCarrying = null;
    face.data.lanternWardInstalledPartRecordId = IDS.maintenance_part;
    face.data.lanternWardRepaired = true;
    w.history.maintenanceServices = 1;
  }
  w.maintenancePhase = 'retreat'; w.maintenanceS = 0;
}

function updateCommuter(owner, dt, anchor, commuter, tug, cradle) {
  const w = ward(owner); if (!commuter) return;
  const stops = [position(anchor, 'bypassWest'), { x: anchor.x + 5, z: anchor.z + 210 },
    position(anchor, 'passengerDock', 0, 35), position(anchor, 'bypassWest'),
    position(anchor, 'bypassEast', 65, -38), position(anchor, 'passengerDockFar', 45, 18)];
  const target = stops[w.commuterLeg % stops.length];
  // Yield to the actual moving service consist, not its schedule or a phase bit.
  const occupied = [tug, cradle].some(e => e && nativePose(owner, e)
    && distance(e.pos, commuter.pos) < 170 && pointSegmentDistance(e.pos, commuter.pos, target) < 40);
  commuter.data.lanternWardYielding = occupied;
  if (occupied) {
    w.commuterWaitS += dt;
    fly(owner, commuter, commuter.pos, 0, 2);
    // A waiting household job must not imprison the passenger timetable. After
    // yielding, use the already open outer approach to this same physical berth
    // when the actual consist leaves that segment clear. The launch still flies
    // the distance and must arrive and dwell before any departure is recorded.
    const outerApproach = stops[2];
    const outerOccupied = [tug, cradle].some(e => e && nativePose(owner, e)
      && pointSegmentDistance(e.pos, commuter.pos, outerApproach) < 40);
    if (w.commuterLeg === 1 && w.commuterWaitS >= 8 && !outerOccupied) {
      w.commuterLeg = 2; w.commuterDwellS = 0; w.commuterWaitS = 0;
    }
    return;
  }
  w.commuterWaitS = 0;
  if (!fly(owner, commuter, target, 14, 4)) { w.commuterDwellS = 0; return; }
  w.commuterDwellS += dt;
  const berth = w.commuterLeg === 2 || w.commuterLeg === 5;
  if (w.commuterDwellS >= (berth ? 18 : 1)) {
    w.commuterLeg = (w.commuterLeg + 1) % stops.length; w.commuterDwellS = 0;
    if (berth) w.history.departures++;
  }
}

function commitService(owner, lamp, receiver, method) {
  const w = ward(owner);
  const mounted = activeLine(owner, 'installed', receiver, lamp);
  if (!isLanternWardWorkpieceEligible(lamp) || entityFor(owner, 'lamp') !== lamp
      || entityFor(owner, 'receiver') !== receiver || !mounted || w.workS < 18
      || !nativePose(owner, lamp) || !nativePose(owner, receiver)
      || distance(lamp.pos, lanternWardSocketWorld(receiver, 'lamp_seat')) > 2
      || speed(lamp) > .8 || lamp.hull < lamp.hullMax * .65) return;
  if (w.firstCompletionReceipt) {
    w.phase = 'installed'; w.needsReinstall = false; w.history.recovered = true;
    custody(lamp, 'receiver', activeLine(owner, 'installed', receiver, lamp)); lamp.data.lanternWardLit = true; receiver.data.lanternWardLit = true;
    return;
  }
  w.phase = 'installed'; w.history.installations = 1;
  w.history.recovered = w.history.damaged || w.history.lampStolen || w.history.cradleStolen;
  custody(lamp, 'receiver', activeLine(owner, 'installed', receiver, lamp)); lamp.data.lanternWardLit = true; receiver.data.lanternWardLit = true;
  const playerHelped = w.history.playerCleared || w.history.playerCarried || w.history.repaired;
  w.firstCompletionReceipt = {
    receiptId: RECEIPT, districtId: LANTERN_WARD_ID, storyId: STORY, sectorId: LANTERN_WARD_SECTOR,
    lampRecordId: IDS.lamp, lampSerial: SERIAL, receiverRecordId: IDS.receiver,
    committed: true, committedTick: tick(owner), committedAtS: now(owner),
    playerHelped, method, recovered: w.history.recovered, count: 1,
  };
  runtime(owner).completionMint = { receipt: w.firstCompletionReceipt, lamp, receiver,
    lampGeneration: lamp.occupantGeneration, receiverGeneration: receiver.occupantGeneration };
  const cradle = entityFor(owner, 'cradle'), pose = nativePose(owner, cradle);
  if (pose && !playerLine(owner, cradle) && distance(cradle.pos, position(lanternWardCanonicalAnchor(), 'receiver', 0, 45)) < 8
      && Math.hypot(pose.vel.x, pose.vel.z) < .3) {
    const mass = cradle.physicsBody?.mass || cradle.mass;
    queuePhysicsImpulse(cradle, { x: -mass * pose.vel.x, z: -mass * pose.vel.z },
      { tick: tick(owner), tag: 'lantern_cradle_parking' });
  }
  if (playerNear(owner, receiver.pos, 220)) emitCommissionCue(owner.bus, 'commission.lantern.power', RECEIPT, LANTERN_WARD_SECTOR, tick(owner));
  owner.bus?.emit?.('lanternWard:serviceCommitted', { receiptId: RECEIPT });
}

export function stepLanternWard(owner, dt) {
  if (!owner?.state || !Number.isFinite(dt) || dt <= 0 || owner.state.mode !== 'flight'
      || (owner.state.run?.kind === 'survival' && owner.state.run.phase !== 'inactive')) return;
  dt = Math.min(dt, 1 / 15);
  const w = ward(owner), current = owner.state.world?.currentSectorId;
  if (current !== LANTERN_WARD_SECTOR) {
    if (w.lastSector === LANTERN_WARD_SECTOR) { clearLanternWardControls(owner); runtime(owner).bindings.clear(); }
    w.workS = 0; w.maintenanceS = 0;
    w.lastSector = current; return;
  }
  if (w.lastStepTick === tick(owner)) return;
  w.lastStepTick = tick(owner); w.lastSector = current;
  stopPreviousWorkForces(owner);
  const anchor = lanternWardCanonicalAnchor(); if (!anchor) return;
  ensureBodies(owner, anchor);
  const bodies = Object.fromEntries(ROLES.map(role => [role, entityFor(owner, role)]));
  const { lamp, cradle, receiver, obstruction, tug, commuter, maintenance, service_face: face, maintenance_part: part } = bodies;
  const eligibleLamp = isLanternWardWorkpieceEligible(lamp);
  w.lampMissing = !lamp || !eligibleLamp;
  w.receiverMissing = !receiver;
  w.cradleAway = !cradle || distance(cradle.pos, position(anchor, 'cradle')) > 280;
  if (playerNear(owner, position(anchor, 'cradle'), 240)) {
    w.observedS += dt; if (w.firstSeenAtS == null) w.firstSeenAtS = now(owner);
  }
  updateMaintenance(owner, dt, anchor, maintenance, face, part);
  updateCommuter(owner, dt, anchor, commuter, tug, cradle);
  theft(owner, 'cradle', cradle, anchor);
  if (eligibleLamp) theft(owner, 'lamp', lamp, anchor);
  // A live player line supersedes crew clamps even when damage or a missing
  // operator stops the job below. Keep the finite manifest's custody truthful.
  if (eligibleLamp && playerLine(owner, lamp)) {
    dropLine(owner, 'load', 'lantern_lamp_hand_off');
    dropLine(owner, 'installed', 'lantern_lamp_hand_off');
    custody(lamp, 'player');
    if (cradle) {
      cradle.data.lanternWardClamp01 = 0;
      cradle.data.lanternWardCustody = {
        holder: cradle.data.lanternWardCustody?.holder === 'player' ? 'player' : 'ward',
      };
    }
  }
  if (playerLine(owner, obstruction)) w.obstructionTouchedAtS = now(owner);
  if (!receiver || !lamp || !eligibleLamp || (!tug && !w.firstCompletionReceipt)) {
    // A historic service receipt is not evidence that its circuit is connected now.
    // Preserve the paid history, but withdraw live success when either original is absent.
    w.phase = 'missing';
    w.workS = 0; setPhase(receiver, 'waiting'); setPhase(lamp, 'waiting');
    if (receiver) receiver.data.lanternWardLit = false;
    if (lamp) lamp.data.lanternWardLit = false;
    if (tug) fly(owner, tug, position(anchor, 'cradle', -40, 28), 7, 4);
    return;
  }
  for (const e of [cradle, lamp]) if (e) e.data.lanternWardDamage01 = clamp(1 - finite(e.hull) / Math.max(1, finite(e.hullMax, 1)), 0, 1);
  const damaged = lamp.hull < lamp.hullMax * .65;
  if (damaged) {
    w.history.damaged = true; w.phase = 'damaged'; w.workS = 0;
    lamp.data.lanternWardLit = false; receiver.data.lanternWardLit = false;
    setPhase(lamp, 'damaged'); setPhase(receiver, 'damaged');
    if (tug) {
      if (lamp.pos.x < position(anchor, 'obstruction').x) fly(owner, tug, position(anchor, 'cradle', -40, 28), 7, 4);
      else flyTugToWork(owner, tug, anchor, w, clearCutLane(owner, anchor, obstruction) == null);
    }
    return;
  }
  if (w.firstCompletionReceipt) {
    if (!nativePose(owner, lamp) || !nativePose(owner, receiver)) return;
    const seat = lanternWardSocketWorld(receiver, 'lamp_seat');
    const seated = distance(lamp.pos, seat) < 5 && !playerLine(owner, lamp);
    if (playerLine(owner, lamp)) dropLine(owner, 'installed', 'lantern_lamp_taken');
    if (seated && !w.needsReinstall) lineBetween(owner, 'installed', receiver, lamp, seat, lamp.pos);
    const installed = seated && !w.needsReinstall && !!activeLine(owner, 'installed', receiver, lamp);
    lamp.data.lanternWardLit = installed; receiver.data.lanternWardLit = installed;
    w.phase = installed ? 'installed' : 'displaced';
    setPhase(receiver, installed ? 'finish' : 'waiting', installed ? 1 : 0);
    setPhase(lamp, installed ? 'finish' : 'waiting', installed ? 1 : 0);
    if (cradle) { cradle.data.lanternWardClamp01 = 0; setPhase(cradle, 'waiting'); }
    if (installed) {
      custody(lamp, 'receiver', activeLine(owner, 'installed', receiver, lamp));
      if (hasWorkPower(owner, receiver)) workForce(owner, lamp, seat, .5, 30);
      // Nessa's return visibly has no family component; the cradle stays where
      // a player left it. Completion never recalls the yard's property.
      flyTugHome(owner, tug, anchor, w, obstruction);
      return;
    }
    w.needsReinstall = true;
    custody(lamp, playerLine(owner, lamp) ? 'player' : 'loose');
  }
  if (!tug) { w.phase = 'missing'; w.workS = 0; return; }
  const lane = clearCutLane(owner, anchor, obstruction), blocked = lane == null;
  if (lane != null) w.clearanceLane = lane;
  w.blocked = blocked;
  if (blocked) w.blockedS += dt;
  if (playerLine(owner, lamp) || playerLine(owner, cradle)) {
    if (distance(lamp.pos, position(anchor, 'lamp')) > 18) w.history.playerCarried = true;
    dropLine(owner, 'tow', 'lantern_player_borrow');
  }
  if (!blocked && w.blockedS > 0 && !w.history.ignored && w.obstructionTouchedAtS != null
      && now(owner) - w.obstructionTouchedAtS <= 30) w.history.playerCleared = true;
  const seat = lanternWardSocketWorld(receiver, 'lamp_seat');
  const atService = distance(lamp.pos, seat) <= 48;
  if (!atService) {
    w.workS = 0; setPhase(receiver, 'waiting');
    if (!cradle) { w.phase = 'missing'; fly(owner, tug, position(anchor, 'cradle', -40, 28), 7, 4); return; }
    const originalSeat = lanternWardSocketWorld(cradle, 'lamp_seat');
    const loadLine = distance(lamp.pos, originalSeat) <= 6 && !playerLine(owner, lamp)
      ? lineBetween(owner, 'load', cradle, lamp, originalSeat, lamp.pos) : null;
    const loaded = !!loadLine;
    cradle.data.lanternWardClamp01 = loaded ? 1 : 0;
    if (loaded) {
      custody(lamp, 'cradle', loadLine);
      cradle.data.lanternWardCustody = { holder: w.cradleAway && w.history.cradleStolen ? 'player' : 'ward', loadSerial: SERIAL,
        clamp: { attachmentId: loadLine.id, active: true, ownerRecordId: IDS.cradle, targetRecordId: IDS.lamp } };
    } else cradle.data.lanternWardCustody = { holder: w.cradleAway && w.history.cradleStolen ? 'player' : 'ward' };
    if (!loaded || playerLine(owner, lamp) || playerLine(owner, cradle)) {
      w.phase = 'interrupted'; setPhase(cradle, 'waiting');
      // Far from the player, native payload residency may not yet admit the
      // clamp. The operator waits beside the real load; an unavailable clamp
      // is not a completed pickup or permission to fly an empty service route.
      if (!loaded && distance(lamp.pos, originalSeat) <= 6
          && !playerLine(owner, lamp) && !playerLine(owner, cradle)) {
        fly(owner, tug, { x: cradle.pos.x - 40, z: cradle.pos.z + 28 }, 7, 4);
      } else flyTugToWork(owner, tug, anchor, w, blocked);
      return;
    }
    if (distance(tug.pos, cradle.pos) >= 90 && !playerLine(owner, cradle)) {
      w.phase = 'recovering'; setPhase(cradle, 'waiting');
      // A traffic strike does not abandon the original loaded platform. The
      // operator catches it under ordinary flight authority before driving it.
      fly(owner, tug, { x: cradle.pos.x - 40, z: cradle.pos.z + 28 }, 28, 5);
      return;
    }
    const cut = position(anchor, 'obstruction'), loadTarget = position(anchor, 'receiver', 0, 45);
    const deliveredPastCut = cradle.pos.x >= cut.x + 35 && distance(cradle.pos, loadTarget) < 120;
    if (blocked && !deliveredPastCut) {
      w.phase = 'blocked'; setPhase(cradle, 'waiting');
      if (nativePose(owner, tug) && distance(tug.pos, cradle.pos) < 90 && !playerLine(owner, cradle))
        workForce(owner, cradle, position(anchor, 'cradle'), 3, 2);
      const late = w.firstSeenAtS != null && now(owner) - w.firstSeenAtS >= 420;
      fly(owner, tug, position(anchor, 'cradle', late ? -15 : -40, late ? 130 : 28), late ? 5 : 7, 3);
      // The watch deadline belongs to world simTime. A return after leaving
      // meets an injured schedule and a real clearing crew, never a timer-minted lamp.
      if (late && obstruction && distance(tug.pos, obstruction.pos) < 180) {
        w.history.ignored = true;
        const line = lineBetween(owner, 'clearing', tug, obstruction, tug.pos, obstruction.pos, 'tether_standard');
        if (line) attachments(owner)?.reel?.(line.id, -1.5 * dt, 32);
      }
      return;
    }
    dropLine(owner, 'clearing', 'lantern_cut_clear');
    w.phase = 'transit'; setPhase(cradle, 'approach');
    // The cradle's repurposed manoeuvring bells follow the attended tug's job;
    // both bodies remain interruptible by ordinary forces and player Masslines.
    const loadPoints = [{ x: cut.x - 40, z: cut.z + w.clearanceLane },
      { x: cut.x + 35, z: cut.z + w.clearanceLane }, loadTarget];
    if (deliveredPastCut) w.cradleRouteStage = 2;
    const loadIndex = Math.min(w.cradleRouteStage, 2);
    const routeTarget = loadPoints[loadIndex];
    if (loadIndex < 2 && distance(cradle.pos, routeTarget) < 4) w.cradleRouteStage = loadIndex + 1;
    const attending = distance(tug.pos, cradle.pos) < 90 && !!nativePose(owner, tug);
    flyTugToWork(owner, tug, anchor, w, blocked);
    if (attending) workForce(owner, cradle, routeTarget, 5, 2);
    return;
  }
  const crewAt = crewStand(anchor, w);
  let cradleParked = true;
  if (cradle && !playerLine(owner, cradle) && nativePose(owner, tug) && distance(tug.pos, cradle.pos) < 90
      && (activeLine(owner, 'load', cradle, lamp) || distance(cradle.pos, position(anchor, 'receiver', 0, 45)) < 12)) {
    cradleParked = workForce(owner, cradle, position(anchor, 'receiver', 0, 45), 3, 4);
  }
  const attended = flyTugToWork(owner, tug, anchor, w, blocked) && hasWorkPower(owner, tug) && nativePose(owner, receiver)
    && nativePose(owner, lamp) && distance(lamp.pos, seat) <= 48;
  if (!attended || playerLine(owner, lamp)) { w.workS = 0; w.phase = 'brace'; setPhase(receiver, 'brace', 0, false); return; }
  // Brake the powered cradle in the turning court before releasing its actual
  // load. Its unloading face points through the native rail opening.
  if (!cradleParked) { w.workS = 0; return; }
  dropLine(owner, 'load', 'lantern_receiver_transfer');
  custody(lamp, 'loose');
  if (cradle) { cradle.data.lanternWardClamp01 = 0; cradle.data.lanternWardCustody = { holder: 'ward' }; }
  w.phase = 'brace'; setPhase(receiver, 'brace', 0, true);
  const mounted = lineBetween(owner, 'installed', receiver, lamp, seat, lamp.pos);
  if (!mounted) { w.workS = 0; return; }
  custody(lamp, 'receiver', mounted);
  if (mounted.restLength > .5) attachments(owner)?.reel?.(mounted.id, -2.5 * dt, .5);
  // Once inside the actual receiver frame, the attended power head damps the
  // passive lamp's lateral swing. The accepted native capture line must exist;
  // outside this 12 WU work envelope only its real winch can move the lamp.
  if (distance(lamp.pos, seat) <= 12) workForce(owner, lamp, seat, .5, 30);
  if (distance(lamp.pos, seat) > 2 || speed(lamp) > .8) { w.workS = 0; return; }
  if (!isLanternWardWorkpieceEligible(lamp)) {
    w.workS = 0; return;
  }
  custody(lamp, 'receiver', mounted); w.workS += dt; w.phase = 'connect';
  setPhase(receiver, 'connect', w.workS / 18, true); setPhase(lamp, 'connect', w.workS / 18);
  if (w.workS >= 18) {
    const method = w.history.repaired ? 'repaired_original' : w.history.playerCarried ? 'physical_carry'
      : w.history.playerCleared ? 'cleared_passage' : 'crew_installation';
    commitService(owner, lamp, receiver, method);
  }
}

export function clearLanternWardControls(owner) {
  const r = runtimes.get(owner); if (!r) return;
  for (const [e, receipt] of r.controls) cancelOwnedPhysicsControl(e, receipt);
  stopPreviousWorkForces(owner);
  for (const role of ACTORS) {
    const e = r.bindings.get(role)?.entity;
    if (e?.data?.jobId) {
      owner.helpers?.npcJobs?.releaseControl?.(e.data.jobId, CONTROL);
      if (e.data.itinerary?.lanternWard) delete e.data.itinerary.lanternWard.workLease;
    }
  }
}

export function serializeLanternWard(owner) {
  const w = ward(owner);
  // Refresh renderer/work metadata on the same world-owned entity; ordinary
  // world capture then persists the exact body recipe and custody once.
  for (const role of LANTERN_WARD_HARDWARE_ROLES) {
    const e = entityFor(owner, role); if (e) e.data.itinerary = captureLanternWardHardware(e);
  }
  const out = clone(w); delete out.lastStepTick; delete out.lastSector; return out;
}

export function restoreLanternWard(owner, saved) {
  clearLanternWardControls(owner); runtimes.delete(owner);
  const jobs = owner._ensureState ? owner._ensureState() : (owner.state.npcJobs || (owner.state.npcJobs = {}));
  const w = freshWard(); jobs.lanternWard = w;
  if (saved == null) return;
  // Any non-null malformed/legacy row proves this district may already have
  // minted its originals. Missing subrows must never mint a second lamp.
  w.initialized = true;
  for (const role of ROLES) {
    const row = saved?.objects?.[role];
    w.objects[role].spawned = row?.recordId === IDS[role] && typeof row.spawned === 'boolean'
      ? row.spawned : true;
    w.objects[role].lost = row?.lost === true;
  }
  if (!saved || saved.version !== 1) { w.phase = 'missing'; return; }
  for (const key of Object.keys(w.history)) {
    if (typeof w.history[key] === 'boolean') w.history[key] = saved.history?.[key] === true;
    else w.history[key] = clamp(Math.trunc(finite(saved.history?.[key])), 0, key === 'departures' ? 100000 : 1);
  }
  for (const key of ['observedS', 'blockedS', 'workS', 'maintenanceS', 'commuterDwellS', 'commuterWaitS']) w[key] = clamp(finite(saved[key]), 0, 86400);
  w.workS = 0; // attendance/native clamp must be proven again after Continue.
  w.maintenanceS = 0;
  w.commuterLeg = clamp(Math.trunc(finite(saved.commuterLeg)), 0, 5);
  w.maintenancePhase = ['approach', 'retreat', 'inspection'].includes(saved.maintenancePhase) ? saved.maintenancePhase : 'approach';
  w.firstSeenAtS = Number.isFinite(saved.firstSeenAtS) ? saved.firstSeenAtS : null;
  w.repairConsumed = saved.repairConsumed === true;
  w.needsReinstall = saved.needsReinstall === true;
  w.lampMissing = saved.lampMissing === true; w.receiverMissing = saved.receiverMissing === true;
  w.cradleAway = saved.cradleAway === true;
  w.obstructionTouchedAtS = Number.isFinite(saved.obstructionTouchedAtS) ? saved.obstructionTouchedAtS : null;
  w.clearanceLane = [-22, 0, 22].includes(saved.clearanceLane) ? saved.clearanceLane : 0;
  w.tugRouteMode = ['cut', 'bypass'].includes(saved.tugRouteMode) ? saved.tugRouteMode : null;
  w.tugRouteStage = clamp(Math.trunc(finite(saved.tugRouteStage)), 0, 3);
  w.cradleRouteStage = clamp(Math.trunc(finite(saved.cradleRouteStage)), 0, 2);
  w.tugReturnStage = clamp(Math.trunc(finite(saved.tugReturnStage)), 0, 3);
  const receipt = saved.firstCompletionReceipt;
  if (receipt?.receiptId === RECEIPT && receipt.storyId === STORY && receipt.lampRecordId === IDS.lamp
      && receipt.lampSerial === SERIAL && receipt.receiverRecordId === IDS.receiver
      && receipt.committed === true && receipt.count === 1 && Number.isInteger(receipt.committedTick)
      && receipt.committedTick >= 0 && Number.isFinite(receipt.committedAtS) && receipt.committedAtS >= 0
      && w.history.installations === 1) w.firstCompletionReceipt = clone(receipt);
  w.phase = w.firstCompletionReceipt ? 'installed' : 'blocked';
}

export function lanternWardCompletionReceipt(owner, receiptId) {
  const w = ward(owner), r = w.firstCompletionReceipt, mint = runtime(owner).completionMint;
  return receiptId === RECEIPT && r?.receiptId === receiptId && r.committed === true
    && mint?.receipt === r && mint.lamp?.alive !== false && mint.receiver?.alive !== false
    && owner.state.entities?.get(mint.lamp.id) === mint.lamp && owner.state.entities?.get(mint.receiver.id) === mint.receiver
    && mint.lamp.occupantGeneration === mint.lampGeneration && mint.receiver.occupantGeneration === mint.receiverGeneration
    && entityFor(owner, 'lamp') === mint.lamp && entityFor(owner, 'receiver') === mint.receiver
    && isLanternWardWorkpieceEligible(mint.lamp)
    && nativePose(owner, mint.lamp) && nativePose(owner, mint.receiver)
    && !!activeLine(owner, 'installed', mint.receiver, mint.lamp)
    && w.history.installations === 1 && r.lampSerial === SERIAL && r.receiverRecordId === IDS.receiver ? clone(r) : null;
}

export function lanternWardStatus(owner) {
  const w = ward(owner), h = w.history;
  return { districtId: LANTERN_WARD_ID, phase: w.phase, blocked: !!w.blocked,
    installed: w.phase === 'installed' && !w.lampMissing && !w.receiverMissing && !w.objects.lamp.lost && !w.objects.receiver.lost,
    damaged: w.phase === 'damaged', missingLamp: w.lampMissing || w.objects.lamp.lost,
    missingReceiver: w.receiverMissing || w.objects.receiver.lost,
    cradleMissing: w.objects.cradle.lost || w.cradleAway, cradleStolen: h.cradleStolen,
    playerHelped: h.playerCleared || h.playerCarried || h.repaired,
    helpedBy: h.playerCarried ? 'physical_carry' : h.playerCleared ? 'cleared_passage' : h.repaired ? 'repair' : null,
    ignored: h.ignored, repaired: h.repaired, receiverRecordId: IDS.receiver, lampRecordId: IDS.lamp,
    lampSerial: SERIAL, receiptId: w.firstCompletionReceipt?.receiptId || null, history: clone(h),
  };
}

/** Existing procurement supplies one real electronics unit to repair this
 * original serial. Normal cargo removal and combat repair remain their owners. */
export function repairLanternWardLamp(owner, target = null) {
  const w = ward(owner), lamp = entityFor(owner, 'lamp'), tug = entityFor(owner, 'tug');
  if ((target != null && target !== tug) || !isLanternWardWorkpieceEligible(lamp) || !tug || !nativePose(owner, lamp) || !nativePose(owner, tug)
      || lamp.data?.lanternWardSerial !== SERIAL || lamp.hull >= lamp.hullMax * .65
      || distance(lamp.pos, tug.pos) > 65 || !playerNear(owner, lamp.pos, 80)
      || speed(lamp) > 2 || speed(tug) > 2) return { ok: false, reason: 'attended_lamp_required' };
  if (sellableCargoQty(owner.state, 'cmdty_electronics') < 1) return { ok: false, reason: 'one_electronics_required' };
  const prepared = kernel(owner)?.prepareRepairHulls?.([{ entityId: lamp.id, amount: lamp.hullMax - lamp.hull }], 'lantern_ward_electronics');
  if (!prepared?.ok) return { ok: false, reason: 'repair_unavailable' };
  const result = prepared.commit();
  if (!result?.ok) return { ok: false, reason: 'repair_changed' };
  if (removeCargo(owner.state, 'cmdty_electronics', 1) !== 1) {
    prepared.rollback(); return { ok: false, reason: 'cargo_changed' };
  }
  prepared.finalize();
  w.history.repaired = true; w.repairConsumed = true; w.phase = 'brace'; w.workS = 0;
  lamp.data.lanternWardDamage01 = 0; setPhase(lamp, 'waiting');
  return { ok: true, serial: SERIAL, consumed: 'cmdty_electronics' };
}
