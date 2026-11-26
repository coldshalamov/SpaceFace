import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { counted } from '../core/numberFormat.js';
import { SECTOR_ANCHORS } from '../data/sectorAnchors.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { DRONE_RANGE_TUNING, rangePosition, SORREL_SENDER } from '../systems/plants/pl190DroneRange.js';

export const DIONE_TARGET_PRACTICE = 'dione_target_practice';
const { sectorId, stationId } = DRONE_RANGE_TUNING;
const GREEN_S = 30;
const RED_S = 6;
const START_RADIUS = 150;
const SHOT_POINTS = 1;
const BOWL_POINTS = 5;
const DRONE_MASS = 22;
const RAILS = [-64, 0, 64];
const boardId = 'dione_target_practice_offer';
const station = SECTOR_ANCHORS[sectorId].stations.find(row => row.id === stationId);
const RANGE_CENTER = Object.freeze(rangePosition(sectorLocalToGlobalForSector(station.pos, sectorId)));

function practiceRecord(state) {
  return state.story?.flags?.dioneTargetPractice || null;
}

export function syncDioneTargetPracticeOffer(owner, info, board) {
  if (info.id !== stationId || owner.state.run?.kind === 'survival') return false;
  const active = owner.state.missions.active.some(m => m.type === DIONE_TARGET_PRACTICE && m.status === 'active');
  const index = board.slots.findIndex(offer => offer?.id === boardId);
  if (active) {
    if (index < 0) return false;
    board.slots.splice(index, 1);
    return true;
  }
  if (index >= 0) return false;
  const record = practiceRecord(owner.state);
  board.slots.unshift({
    id: boardId, type: DIONE_TARGET_PRACTICE, source: DIONE_TARGET_PRACTICE,
    stationId, destStationId: stationId, destSectorId: sectorId, riskTier: 1,
    title: 'Target Practice', reward_cr: record ? 0 : 280, collateral_cr: 0,
    params: {},
    brief: 'Fly to the range. Shoot or bowl the drones.',
    description: 'Score one for a shot, five for a drone bowled into another. Stop at red. You answer for every drone still in flight.',
    summary: record ? `${record.name} · ${record.callsign} · best ${record.score} points`
      : 'Lt. Sorrel · “One rule. Not on red.”',
  });
  return true;
}

export function dionePracticeWaypoint(state, mission) {
  if (mission.type !== DIONE_TARGET_PRACTICE || state.world.currentSectorId !== sectorId) return null;
  const range = mission.params.dioneRange;
  let reason = 'Fly to the range to start.';
  if (range) {
    const now = state.simTime;
    const green = now < range.greenUntil;
    const seconds = Math.max(0, Math.ceil((green ? range.greenUntil : range.redUntil) - now));
    reason = `${green ? 'GREEN' : 'RED · HOLD FIRE'} · ${seconds}s · ${range.score} pts`;
    if (range.fouls) reason += ` · ${counted(range.fouls, 'foul', 'fouls', state)}`;
  }
  return { label: 'Dione Range', pos: { ...RANGE_CENTER }, reason };
}

function announce(owner, id, text, kind = 'info') {
  owner.bus.emit('comms:popup', {
    id: `dione:practice:${id}`, sender: SORREL_SENDER, category: 'traffic', text, ttl: 5, persist: false,
  });
  if (kind !== 'info') owner.bus.emit('toast', { text, kind, ttl: 3 });
}

function practiceCast(owner, mission) {
  if (owner._dionePracticeCast?.mission === mission) return owner._dionePracticeCast;
  const range = mission.params.dioneRange;
  const cast = { mission, slots: new Map(), duplicates: [] };
  for (const entity of owner.state.entityList) {
    if (!entity?.alive || entity.type !== 'drone' || entity.data?.dionePracticeMissionId !== mission.id
        || entity.data.dionePracticeArmedAt !== range.startedAt) continue;
    const slot = entity.data.dionePracticeSlot;
    if (!range.launchedSlots.includes(slot) || cast.slots.has(slot)) {
      cast.duplicates.push(entity);
      continue;
    }
    cast.slots.set(slot, entity);
  }
  owner._dionePracticeCast = cast;
  return cast;
}

// The immutable deadline rides the beacon's spawn data to the render worker mirror; the lamp
// reads the same sim clock as scoring, so phase changes need no second mutable owner.
function ensureRangeFlag(owner, mission, cast) {
  if (cast.flag && owner.state.entities.get(cast.flag.id) === cast.flag && cast.flag.alive) return;
  const flags = owner.state.entityList.filter(entity => entity?.alive && entity.type === 'beacon'
    && entity.data?.storyPropKind === 'dione_range_flag' && entity.data.dioneRangeFlagMissionId === mission.id);
  const range = mission.params.dioneRange;
  const valid = flags.find(entity => entity.data.rangeGreenUntil === range.greenUntil);
  for (const flag of flags) if (flag !== valid) owner.helpers.removeEntity(flag.id);
  cast.flag = valid || owner.helpers.spawnEntity({
    type: 'beacon', name: 'Dione range flag', pos: { x: RANGE_CENTER.x, z: RANGE_CENTER.z - 85 },
    vel: { x: 0, z: 0 }, radius: 10, collides: false, homeSectorId: sectorId,
    flags: { persistent: true },
    data: { storyPropKind: 'dione_range_flag', dioneRangeFlagMissionId: mission.id,
      rangeGreenUntil: range.greenUntil, scanLabel: 'DIONE RANGE FLAG' },
  });
}

function activeBody(owner, id, generation = null) {
  const state = owner.state;
  const cast = owner._dionePracticeCast;
  if (!cast || cast.duplicates.length || state.mode !== 'flight' || state.world.currentSectorId !== sectorId
      || cast.mission.status !== 'active' || !state.missions.active.includes(cast.mission)) return null;
  const entity = state.entities.get(id);
  const slot = entity?.data?.dionePracticeSlot;
  if (!entity?.alive || cast.slots.get(slot) !== entity || !Number.isSafeInteger(entity.occupantGeneration)
      || (generation != null && entity.occupantGeneration !== generation)) return null;
  return entity;
}

function railPoint(center, slot, elapsed) {
  return { x: center.x + RAILS[slot], z: center.z + 65 + Math.sin(elapsed * 0.52 + slot * 0.46) * 45 };
}

function deployCast(owner, mission, cast, dt) {
  const state = owner.state;
  const range = mission.params.dioneRange;
  const elapsed = state.simTime - range.startedAt;
  for (let slot = 0; slot < RAILS.length; slot++) {
    if (range.scoredSlots.includes(slot)) continue;
    const pos = railPoint(RANGE_CENTER, slot, elapsed);
    let entity = cast.slots.get(slot);
    if (!entity) {
      if (range.launchedSlots.includes(slot)) continue; // A lost target is never a fresh point.
      entity = owner.helpers.spawnEntity({
        type: 'drone', name: `Range Drone ${slot + 1}`, team: 1, pos,
        radius: 10, mass: DRONE_MASS, hull: 40, hullMax: 40, collides: true,
        physicsBody: { radius: 10, mass: DRONE_MASS }, homeSectorId: sectorId,
        flags: { persistent: true },
        data: { dionePracticeMissionId: mission.id, dionePracticeSlot: slot,
          dionePracticeArmedAt: range.startedAt, role: 'raider',
          scanLabel: `RANGE DRONE ${slot + 1}` },
      });
      if (!entity?.alive) continue;
      range.launchedSlots.push(slot);
      cast.slots.set(slot, entity);
    }
    if (!entity.alive || state.entities.get(entity.id) !== entity || entity.data.dionePracticeThrown
        || (state.player.tether?.active && state.player.tether.targetId === entity.id)) continue;
    const gain = DRONE_MASS * Math.min(0.13, 5 * dt);
    const targetVelocity = (target, current) => Math.max(-34, Math.min(34, (target - current) * 3));
    queuePhysicsImpulse(entity, {
      x: gain * (targetVelocity(pos.x, entity.pos.x) - entity.vel.x),
      z: gain * (targetVelocity(pos.z, entity.pos.z) - entity.vel.z),
    }, { tick: state.tick, provenance: DIONE_TARGET_PRACTICE });
  }
}

function retireScored(owner, mission, cast) {
  for (const slot of mission.params.dioneRange.scoredSlots) {
    const entity = cast.slots.get(slot);
    if (entity && owner.state.entities.get(entity.id) === entity) owner.helpers.removeEntity(entity.id);
    cast.slots.delete(slot);
  }
}

export function clearDionePractice(owner, missionId) {
  const cast = owner._dionePracticeCast;
  if (cast && cast.mission.id === missionId) {
    for (const entity of cast.slots.values()) {
      if (owner.state.entities.get(entity.id) === entity) owner.helpers.removeEntity(entity.id);
    }
    for (const entity of cast.duplicates) {
      if (owner.state.entities.get(entity.id) === entity) owner.helpers.removeEntity(entity.id);
    }
    owner._dionePracticeCast = null;
  }
  for (const entity of [...(owner.state.entityList || [])]) {
    if (entity?.alive && entity.type === 'beacon' && entity.data?.storyPropKind === 'dione_range_flag'
        && entity.data.dioneRangeFlagMissionId === missionId) owner.helpers.removeEntity(entity.id);
  }
}

export function driveDionePractice(owner, mission, index, dt) {
  const state = owner.state;
  if (state.world.currentSectorId !== sectorId) {
    if (mission.params.dioneRange) owner._failMission(mission, index, 'range_left');
    return;
  }
  const player = state.entities.get(state.playerId);
  if (!player?.alive) return;
  const now = state.simTime;
  let range = mission.params.dioneRange;
  if (!range) {
    if (Math.hypot(player.pos.x - RANGE_CENTER.x, player.pos.z - RANGE_CENTER.z) > START_RADIUS) return;
    range = mission.params.dioneRange = {
      startedAt: now, greenUntil: now + GREEN_S, redUntil: now + GREEN_S + RED_S,
      score: 0, shot: 0, bowled: 0, fouls: 0, launchedSlots: [], scoredSlots: [],
    };
    const record = practiceRecord(state);
    announce(owner, 'green', record ? `${record.callsign}. Green. Take the rail.` : 'Green. One rule. Not on red.', 'success');
  }
  const cast = practiceCast(owner, mission);
  if (cast.duplicates.length) { owner._failMission(mission, index, 'range_signal_lost'); return; }
  ensureRangeFlag(owner, mission, cast);
  retireScored(owner, mission, cast);

  if (now < range.greenUntil) deployCast(owner, mission, cast, dt);
  else if (!range.redAnnounced) {
    range.redAnnounced = true;
    announce(owner, 'red', 'Red. Hold fire. Let them land.', 'warn');
  }
  if (now >= range.redUntil) {
    for (const entity of cast.slots.values()) {
      if (entity.alive && entity.data.dionePracticeThrown === 'in_flight'
          && Math.hypot(entity.vel.x, entity.vel.z) > 8) range.fouls++;
    }
    if (range.fouls || !range.score) {
      owner._failMission(mission, index, range.fouls ? 'range_foul' : 'range_no_score');
      return;
    }
    const old = practiceRecord(state);
    const callsign = old?.callsign || (range.bowled ? 'BANKSHOT' : 'SURESHOT');
    range.callsign = callsign;
    if (!old || range.score > old.score) {
      state.story.flags.dioneTargetPractice = {
        name: String(state.player.callsign || state.player.name || 'Pilot').slice(0, 48), callsign, score: range.score,
      };
    }
    announce(owner, 'settled', `${callsign}. ${range.score} points. On the board.`);
    owner._completeMission(mission, index);
    return;
  }
  owner._refreshTrackedMissionNav(mission);
}

function countPoint(owner, target, points) {
  const mission = owner._dionePracticeCast.mission;
  const range = mission.params.dioneRange;
  const slot = target.data.dionePracticeSlot;
  if (range.scoredSlots.includes(slot)) return;
  if (owner.state.simTime >= range.greenUntil) {
    if (!target.data.dionePracticeRedShot) range.fouls++;
    target.data.dionePracticeRedShot = true;
    return;
  }
  range.scoredSlots.push(slot);
  range.score += points;
  if (points === SHOT_POINTS) range.shot++;
  else range.bowled++;
  mission.objectiveProgress = range.scoredSlots.length;
  owner.bus.emit('mission:updated', { missionId: mission.id, objectiveProgress: mission.objectiveProgress });
}

export function onDionePracticeShot(owner, event) {
  if (event?.attackerId !== owner.state.playerId || event.origin?.kind !== 'weapon' || !(event.applied > 0)) return;
  const target = activeBody(owner, event.targetId);
  if (target) countPoint(owner, target, SHOT_POINTS);
}

export function onDionePracticeThrow(owner, event) {
  if (event?.cut?.accepted !== true || event.tick !== owner.state.tick) return;
  const entity = activeBody(owner, event.payloadId);
  if (!entity?.alive) return;
  const range = owner._dionePracticeCast.mission.params.dioneRange;
  const red = owner.state.simTime >= range.greenUntil;
  if (red) range.fouls++;
  entity.data.dionePracticeThrown = red ? 'foul' : 'in_flight';
}

export function onDionePracticeImpact(owner, event) {
  if (!owner._dionePracticeCast || !(event?.dp > 0) || event.tick !== owner.state.tick
      || !Number.isSafeInteger(event.aGeneration) || !Number.isSafeInteger(event.bGeneration)) return;
  const a = activeBody(owner, event.aId, event.aGeneration);
  const b = activeBody(owner, event.bId, event.bGeneration);
  const source = a?.data.dionePracticeThrown === 'in_flight' ? a
    : b?.data.dionePracticeThrown === 'in_flight' ? b : null;
  if (!source) return;
  const otherId = source === a ? event.bId : event.aId;
  const otherLife = source === a ? event.bGeneration : event.aGeneration;
  const other = owner.state.entities.get(otherId);
  if (!other || other.occupantGeneration !== otherLife || other === source) return;
  source.data.dionePracticeThrown = 'landed';
  const range = owner._dionePracticeCast.mission.params.dioneRange;
  const target = source === a ? b : a;
  if (!target || owner.state.simTime >= range.greenUntil) range.fouls++;
  else countPoint(owner, target, BOWL_POINTS);
}

export function dionePracticeResult(mission) {
  const range = mission?.params?.dioneRange;
  return mission?.type === DIONE_TARGET_PRACTICE && range ? {
    score: range.score, shot: range.shot, bowled: range.bowled, fouls: range.fouls, callsign: range.callsign || null,
  } : null;
}
