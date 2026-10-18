// M07 runtime. Missions owns the offer, the pay, and the failure. This module
// only keeps the hauler's lane and reads the existing scoop (`pickup:collected`).

import { WAKE_HANDOFF, buildWakeHandoffOffer, wakePassRead } from '../data/wakeHandoff.js';

export function syncWakeHandoffOffer(host, info, board) {
  if (!info || info.id !== WAKE_HANDOFF.stationId || !board || !Array.isArray(board.slots)) return false;
  const state = host && host.state;
  const missions = state && state.missions;
  const active = (missions && missions.active) || [];
  const exists = board.slots.concat(active).some((row) => row && (
    row.id === WAKE_HANDOFF.id
    || row.sourceOfferId === WAKE_HANDOFF.id
    || (row.params && row.params.wakeHandoff)
  ));
  const settled = ((missions && missions.receipts) || []).some((receipt) => receipt
    && receipt.outcome === 'completed'
    && (receipt.sourceOfferId === WAKE_HANDOFF.id || receipt.source === WAKE_HANDOFF.source));
  if (exists || settled) return false;
  board.slots.push(buildWakeHandoffOffer());
  if (host.bus && typeof host.bus.emit === 'function') {
    host.bus.emit('mission:updated', { missionId: null, stationId: info.id });
  }
  return true;
}

function rememberWakeBodies(state, mission) {
  let hauler = mission._wakeHaulerId != null && state.entities
    ? state.entities.get(mission._wakeHaulerId) : null;
  let pod = mission._wakePodId != null && state.entities
    ? state.entities.get(mission._wakePodId) : null;
  if (!state.entities || typeof state.entities.values !== 'function') {
    return { hauler: hauler && hauler.alive !== false ? hauler : null, pod: pod && pod.alive !== false ? pod : null };
  }
  if (!hauler || hauler.alive === false || !pod || pod.alive === false) {
    for (const entity of state.entities.values()) {
      if (!entity || entity.alive === false || !entity.data) continue;
      if (entity.data.wakeHaulerOf === String(mission.id)) hauler = entity;
      if (entity.data.wakePodOf === String(mission.id)) pod = entity;
    }
  }
  if (hauler && hauler.alive !== false) mission._wakeHaulerId = hauler.id;
  else hauler = null;
  if (pod && pod.alive !== false) mission._wakePodId = pod.id;
  else pod = null;
  return { hauler, pod };
}

function dropWakeBodies(state, mission) {
  if (!state || !state.entities || typeof state.entities.values !== 'function') return;
  for (const entity of state.entities.values()) {
    if (!entity || entity.alive === false || !entity.data) continue;
    if (entity.data.wakeHaulerOf === String(mission.id) || entity.data.wakePodOf === String(mission.id)) {
      entity.alive = false;
    }
  }
}

function ensureWakeLane(host, mission, spec) {
  if (spec.spawned) return rememberWakeBodies(host.state, mission);
  const spawn = host.helpers && host.helpers.spawnEntity;
  if (typeof spawn !== 'function') return { hauler: null, pod: null };
  const heading = WAKE_HANDOFF.heading;
  const speed = WAKE_HANDOFF.speed;
  const vx = Math.cos(heading) * speed;
  const vz = Math.sin(heading) * speed;
  const origin = WAKE_HANDOFF.start;
  const hauler = spawn({
    type: 'ship',
    team: 0,
    pos: { x: origin.x, z: origin.z },
    vel: { x: vx, z: vz },
    rot: heading,
    radius: 18,
    mass: 80,
    hull: 200,
    hullMax: 200,
    // Pose is the mission lane, not a physics body. Rapier must not integrate it twice.
    physicsBody: false,
    data: {
      defId: 'ship_mule',
      shipName: WAKE_HANDOFF.haulerName,
      wakeHaulerOf: String(mission.id),
      factionId: WAKE_HANDOFF.factionId,
      intent: { moveX: 0, moveZ: 0, boost: false, fire: false, aimAngle: heading },
    },
  });
  if (!hauler) return { hauler: null, pod: null };
  const back = WAKE_HANDOFF.wakeOffset;
  const pod = spawn({
    type: 'pickup',
    pos: { x: origin.x - Math.cos(heading) * back, z: origin.z - Math.sin(heading) * back },
    vel: { x: vx, z: vz },
    radius: 2.2,
    mass: 0.4,
    collides: true,
    physicsBody: false,
    data: {
      kind: 'cargo',
      commodityId: WAKE_HANDOFF.cmdtyId,
      amount: WAKE_HANDOFF.qty,
      wakePodOf: String(mission.id),
      // The ordinary vacuum reaches 800 WU and would pull this crate out of the
      // wake. The crew-cut object is the existing "fly into the body" door.
      // No miner title, so the law does not read the scoop as theft.
      npcMiningSource: { wakePass: true },
      despawnAt: (Number(host.state.simTime) || 0) + WAKE_HANDOFF.windowS + 5,
    },
  });
  mission._wakeHaulerId = hauler.id;
  if (pod) mission._wakePodId = pod.id;
  spec.spawned = true;
  return { hauler, pod: pod && pod.alive !== false ? pod : null };
}

function stepWakeLane(state, mission, dt) {
  const haulerId = mission._wakeHaulerId;
  if (!state || !state.entities) return;
  const hauler = haulerId != null ? state.entities.get(haulerId) : null;
  if (!hauler || hauler.alive === false) return;
  const heading = WAKE_HANDOFF.heading;
  const speed = WAKE_HANDOFF.speed;
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  hauler.vel.x = Math.cos(heading) * speed;
  hauler.vel.z = Math.sin(heading) * speed;
  hauler.rot = heading;
  hauler.pos.x += hauler.vel.x * step;
  hauler.pos.z += hauler.vel.z * step;
  const pod = mission._wakePodId != null ? state.entities.get(mission._wakePodId) : null;
  if (!pod || pod.alive === false) return;
  const back = WAKE_HANDOFF.wakeOffset;
  pod.pos.x = hauler.pos.x - Math.cos(heading) * back;
  pod.pos.z = hauler.pos.z - Math.sin(heading) * back;
  pod.vel.x = hauler.vel.x;
  pod.vel.z = hauler.vel.z;
}

export function driveWakeHandoff(host, mission, index, dt) {
  if (!mission || mission.status !== 'active' || !mission.params || !mission.params.wakeHandoff) return;
  const spec = mission.params.wakeHandoff;
  const state = host.state;
  const now = Number(state && state.simTime) || 0;
  // null is unset. Number(null) is 0, which would close the lane on the first tick.
  if (spec.closeAt == null || !Number.isFinite(Number(spec.closeAt))) {
    spec.closeAt = now + WAKE_HANDOFF.windowS;
  }
  const inSector = !!(state && state.world && state.world.currentSectorId === mission.destSectorId);
  if (inSector) {
    ensureWakeLane(host, mission, spec);
    stepWakeLane(state, mission, dt);
  }
  if (mission.status === 'active' && now >= spec.closeAt) {
    dropWakeBodies(state, mission);
    host._failMission(mission, index, 'wake_missed');
  }
}

export function onWakePickupCollected(host, payload) {
  if (!payload || payload.pickupId == null || !host || !host.state) return;
  if (payload.collectorId !== host.state.playerId) return;
  const active = host.state.missions && host.state.missions.active;
  if (!Array.isArray(active)) return;
  for (let i = active.length - 1; i >= 0; i--) {
    const mission = active[i];
    if (!mission || mission.status !== 'active' || !mission.params || !mission.params.wakeHandoff) continue;
    const podId = mission._wakePodId;
    const stamped = payload.pickupId === podId;
    const entity = host.state.entities && host.state.entities.get(payload.pickupId);
    const marked = !!(entity && entity.data && entity.data.wakePodOf === String(mission.id));
    if (!stamped && !marked) continue;
    const accepted = Number(payload.acceptedAmount);
    const hauler = mission._wakeHaulerId != null && host.state.entities
      ? host.state.entities.get(mission._wakeHaulerId) : null;
    const player = host.state.entities.get(host.state.playerId);
    const read = wakePassRead(player, hauler);
    dropWakeBodies(host.state, mission);
    if (!(accepted > 0)) {
      host._failMission(mission, i, 'wake_refused');
      return;
    }
    if (read.matched && read.alongside) {
      mission.objectiveProgress = mission.objectiveTarget || 1;
      mission.params.completionMethod = 'wake_collect';
      host._completeMission(mission, i);
      return;
    }
    host._failMission(mission, i, 'wake_unmatched');
    return;
  }
}

export function wakeHandoffFocus(host, mission) {
  const bodies = host && host.state ? rememberWakeBodies(host.state, mission) : { hauler: null, pod: null };
  const mark = (bodies.pod && bodies.pod.pos) || (bodies.hauler && bodies.hauler.pos) || WAKE_HANDOFF.start;
  return {
    pos: { x: mark.x, z: mark.z },
    presentationEntityId: bodies.pod ? bodies.pod.id : (bodies.hauler ? bodies.hauler.id : null),
    label: 'Wake crate',
    reason: 'Match the hauler and take the crate in its wake',
  };
}
