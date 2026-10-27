// Pallas's original hauler and patrol fly one paired passage through their authored Sker marks
// to the actual Hollow Hub. NPC jobs own all movement. No clock fabricates freight or arrivals.
import { PALLAS_SHIFT as C, freshPallasShift, normalizePallasShift, pallasShiftActor, pallasShiftRecordId, pallasShiftMarks, pallasShiftSlot } from '../data/pallasWorkShift.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';
import { resolveDockAnchor, resolveCollisionProxyManifest } from '../data/collisionProxyManifests.js';
export const PALLAS_WORK_SECTOR_ID = C.sectorId;
// Retained export for callers; these are measured passage stages, not the obsolete cargo claims.
export const PALLAS_HANDOFF_ORDER = Object.freeze(['escort_join', 'sker_marks', 'hollow_hub']);
const terminal = new Set(['arrived', 'lost']);
const dist = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const copy = p => ({
  x: p.x,
  z: p.z
});
const stopped = p => p && Math.hypot(p.vel.x, p.vel.z) <= 8;
const roles = [['hauler', C.hauler], ['escort', C.escort]];
function bodyPose(owner, entity) {
  if (!entity || !['x', 'z'].every(key => Number.isFinite(entity.pos?.[key]) && Number.isFinite(entity.vel?.[key]))) return null;
  const state = owner.state;
  if (state.settings?.gameplay?.physicsBackend !== 'rapier-dynamic') {
    return {
      pos: entity.pos,
      vel: entity.vel
    };
  }
  const physics = owner._registry?.get('physics'),
    native = physics?._sg02;
  const record = native?.records?.get(entity.id),
    body = record?.body;
  if (physics?._nativeRestorePending || physics?._nativeRestoreDeferred || !physicsBodyNativeReady(entity) || record?.entity !== entity || !body || !Number.isInteger(native._simTick) || state.tick - native._simTick < 0 || state.tick - native._simTick > 2 || record._postStepReadTick !== native.tick) return null;
  try {
    if (!body.isEnabled() || native.world.getRigidBody(body.handle) !== body || !record.colliders?.length || body.numColliders() !== record.colliders.length || record.colliders.some((collider, index) => !collider.isEnabled() || body.collider(index) !== collider || native.world.getCollider(collider.handle) !== collider || collider.parent() !== body)) return null;
    const position = body.translation(),
      velocity = body.linvel(),
      angular = body.angvel();
    const rotation = body.rotation(),
      origin = native._frameOrigin || {
        x: 0,
        z: 0
      };
    if (![position.x, position.y, position.z, velocity.x, velocity.y, velocity.z, angular.x, angular.y, angular.z, rotation.x, rotation.y, rotation.z, rotation.w].every(Number.isFinite)) return null;
    const pos = {
      x: position.x + origin.x,
      z: position.z + origin.z
    };
    const vel = {
      x: velocity.x,
      z: velocity.z
    };
    if (dist(pos, entity.pos) > .1 || dist(vel, entity.vel) > .1) return null;
    return {
      pos,
      vel
    };
  } catch {
    return null;
  }
}
function rowOf(state) {
  let r = state.traffic?.pallasWorkLoop;
  if (r?.schema !== 2 || r.id !== C.id || r.seed !== state.meta.seed) r = (state.traffic ||= {}).pallasWorkLoop = freshPallasShift(state.meta.seed);
  return r;
}
function actors(state) {
  return Object.fromEntries(roles.map(([role, id]) => [role, pallasShiftActor(state, id)]));
}
function station(state) {
  const list = (state.entityList || []).filter(e => e.alive !== false && e.type === 'station' && e.data?.stationId === C.stationId);
  return list.length === 1 ? list[0] : null;
}
function destination(state, row, hauler) {
  if (row.leg < 2) return pallasShiftMarks()[row.leg];
  const hub = station(state);
  if (!hub) return null;
  return resolveDockAnchor(hub, resolveCollisionProxyManifest(hub), hauler) || {
    x: hub.pos.x + (hub.radius || 100) + (hauler.radius || 12) + 50,
    z: hub.pos.z
  };
}
function job(owner, e) {
  const entry = e && owner.helpers.npcJobs?.byEntity(e.id);
  return entry?.entityId === e.id && entry.worldRecordId === e.data.worldRecordId && owner.helpers.npcJobs.get(entry.job.id) === entry ? entry : null;
}
function assign(owner, e, role, row) {
  const jobs = owner.helpers.npcJobs,
    old = job(owner, e);
  if (old?.control || old?.towAssist || old?.job.phase === 'flee') return false;
  if (old?.job.payload?.pallasWorkShift === C.id) return true;
  if (old) jobs.release(old.job.id);
  const target = destination(owner.state, row, e) || row.origin;
  const id = jobs.assign(e, {
    kind: role === 'hauler' ? 'hauler' : 'patrol',
    sectorId: C.sectorId,
    speed: 26,
    route: [{
      id: `${C.id}:origin`,
      pos: copy(e.pos)
    }, {
      id: `${C.id}:route`,
      pos: copy(target)
    }],
    payload: {
      pallasWorkShift: C.id,
      role
    },
    commissionS: 1,
    loadS: 1,
    unloadS: 1,
    dwellS: 10
  });
  return !!id;
}
function restore(owner, e) {
  const entry = job(owner, e);
  if (!entry?.job.payload?.pallasWorkShift || entry.control || entry.towAssist) return;
  owner.helpers.npcJobs.release(entry.job.id);
  owner._assignActivityJob(e, pallasShiftSlot(e.data.activityActorSlotId));
}
function notify(owner, row) {
  if (row.notices.includes(row.phase) || row.phase === 'waiting') return;
  const cast = actors(owner.state),
    p = owner.state.entities.get(owner.state.playerId);
  if (!p || Math.min(dist(p.pos, cast.hauler?.pos), dist(p.pos, cast.escort?.pos)) > 1800) return;
  row.notices.push(row.phase);
  const text = {
    joining: 'SKER RUN — Hauler holding. Patrol, come alongside before we pass the wreck. You can fly with us if you like.',
    running: 'SKER RUN — Patrol alongside. Taking the two run marks, then Smuggler Den at Hollow Hub. We hold if the escort falls behind.',
    arrived: 'SKER RUN — Made it into Smuggler Den at Hollow Hub. Back on the regular route.',
    lost: `SKER RUN — Our ${row.lostRole} is gone. Calling the run off.`
  }[row.phase];
  owner.bus.emit('toast', {
    text,
    kind: row.phase === 'lost' ? 'warn' : 'info',
    ttl: 7
  });
  owner.bus.emit('pallas:shift', {
    phase: row.phase,
    leg: row.leg,
    at: owner.state.simTime,
    haulerId: cast.hauler?.id,
    escortId: cast.escort?.id
  });
}
function lost(state, id) {
  const record = state.world?.records?.byId?.[pallasShiftRecordId(state, id)];
  if (record && (record.alive === false || ['destroyed', 'defeated'].includes(record.outcome) || ['destroyed', 'dead', 'lost', 'consumed'].includes(record.status))) return true;
  return (state.entityList || []).some(e => e.data?.worldRecordId === pallasShiftRecordId(state, id) && e.data?.activityActorSlotId === id && (e.alive === false || e.hull <= 0));
}
export function pallasWorkTarget(owner, entry, entity) {
  if (entry?.job?.payload?.pallasWorkShift !== C.id) return null;
  const state = owner.state,
    row = rowOf(state),
    role = entry.job.payload.role,
    cast = actors(state);
  if (state.mode !== 'flight' || state.world?.currentSectorId !== C.sectorId || owner._restoreEpochPending || terminal.has(row.phase) || cast[role] !== entity || job(owner, entity) !== entry || entry.control || entry.towAssist) return {
    blocked: true
  };
  const h = bodyPose(owner, cast.hauler),
    e = bodyPose(owner, cast.escort),
    work = bodyPose(owner, entity);
  if (!h || !e || !work || !row.origin) {
    if (row.phase === 'running') row.holding = true;
    return {
      blocked: true
    };
  }
  let pos,
    vel = {
      x: 0,
      z: 0
    },
    reach = C.reach;
  if (row.phase === 'joining') {
    pos = role === 'hauler' ? row.origin : {
      x: h.pos.x - 60,
      z: h.pos.z + 42
    };
    if (role === 'escort') vel = h.vel;
  } else if (row.phase === 'running') {
    const dest = destination(state, row, cast.hauler);
    if (!dest) return {
      blocked: true
    };
    const companion = job(owner, cast.escort),
      guard = dist(h.pos, e.pos) <= C.guardRange && companion && !companion.control && !companion.towAssist && companion.job.phase !== 'flee';
    row.holding = !guard;
    if (role === 'hauler') {
      pos = guard ? dest : h.pos;
    } else {
      const d = dist(h.pos, dest),
        dx = (dest.x - h.pos.x) / Math.max(d, 1),
        dz = (dest.z - h.pos.z) / Math.max(d, 1);
      pos = {
        x: h.pos.x - dx * 65 - dz * 35,
        z: h.pos.z - dz * 65 + dx * 35
      };
      vel = h.vel;
      reach = 30;
    }
  } else return {
    blocked: true
  };
  return {
    pos,
    vel,
    reach,
    workPose: work,
    settled: dist(pos, work.pos) <= reach && dist(vel, work.vel) <= 8
  };
}
export function stepPallasWorkLoop(state, dt, owner = null) {
  if (state.world?.currentSectorId !== C.sectorId) return null;
  const row = rowOf(state);
  if (!owner || owner._restoreEpochPending || state.mode !== 'flight') return row;
  if (owner._pallasLastRow === row && owner._pallasLastStepTick === state.tick) return row;
  if (owner._pallasLastRow !== row || owner._pallasLastStepTick !== state.tick - 1) row.dwell = 0;
  owner._pallasLastRow = row;
  owner._pallasLastStepTick = state.tick;
  if (row.phase === 'running') row.holding = true;
  const cast = actors(state);
  if (terminal.has(row.phase)) {
    for (const e of Object.values(cast)) if (e) restore(owner, e);
    notify(owner, row);
    return row;
  }
  for (const [role, id] of roles) if (lost(state, id)) {
    row.phase = 'lost';
    row.lostRole = role;
    row.dwell = 0;
    notify(owner, row);
    return row;
  }
  const h = bodyPose(owner, cast.hauler),
    e = bodyPose(owner, cast.escort);
  if (!h || !e) {
    row.dwell = 0;
    return row;
  }
  if (row.phase === 'waiting') {
    row.origin = copy(h.pos);
    row.phase = 'joining';
  }
  if (!assign(owner, cast.hauler, 'hauler', row) || !assign(owner, cast.escort, 'escort', row)) {
    row.dwell = 0;
    return row;
  }
  notify(owner, row);
  const hj = job(owner, cast.hauler),
    ej = job(owner, cast.escort);
  if ([hj, ej].some(j => !j || j.control || j.towAssist || j.job.phase === 'flee')) {
    row.dwell = 0;
    return row;
  }
  row.holding = row.phase === 'running' && dist(h.pos, e.pos) > C.guardRange;
  const close = dist(h.pos, e.pos) <= C.joinRange && stopped(h) && stopped(e);
  const target = row.phase === 'joining' ? row.origin : destination(state, row, cast.hauler);
  const arrived = close && dist(h.pos, target) <= C.reach + 1;
  row.dwell = arrived ? row.dwell + Math.max(0, Math.min(.1, Number(dt) || 0)) : 0;
  if (row.dwell < 1.5) return row;
  row.dwell = 0;
  if (row.phase === 'joining') {
    row.joined = true;
    row.phase = 'running';
  } else if (row.leg < 2) row.leg++;else {
    row.phase = 'arrived';
    row.arrived = true;
    row.holding = false;
  }
  notify(owner, row);
  return row;
}
export { normalizePallasShift };
