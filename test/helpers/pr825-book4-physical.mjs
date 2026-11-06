import assert from 'node:assert/strict';
import { createSg02DynamicBodyOwner } from '../../src/core/sg02DynamicBodyOwner.js';
import { writePhysicsControl } from '../../src/core/physicsAuthority.js';
import { frontierHomesteads } from '../../src/systems/faction_frontier.js';
import { factionMeridian } from '../../src/systems/faction_meridian.js';
import { spineBreakContainers, spineBreakOutcome } from '../../src/missions/spineBreakWorksite.js';

// Explicit focused fixture: real native body motion and registered-owner behavior,
// with forces standing in for player controls. This is not an ordinary play route.
export function installBook4Owners(h) {
  const ctx = { state: h.state, bus: h.bus, helpers: h.helpers, registry: h.registry };
  for (const def of [frontierHomesteads, factionMeridian]) {
    const owner = Object.assign({}, def);
    h.systems[def.name] = owner;
    owner.init(ctx);
  }
}

function steer(body, target, speed, source) {
  const dx = target.pos.x - body.pos.x, dz = target.pos.z - body.pos.z;
  const d = Math.hypot(dx, dz) || 1, desired = Math.min(speed, d * 0.4);
  writePhysicsControl(body, { source,
    force: { x: (dx / d * desired - body.vel.x) * body.mass * 2, y: 0,
      z: (dz / d * desired - body.vel.z) * body.mass * 2 },
    torque: { x: 0, y: 0, z: 0 }, maxSpeed: speed });
}

export async function completeBook4Spine(h, mission) {
  const { state, missions, bus } = h;
  state.world.currentSectorId = mission.destSectorId;
  bus.emit('sector:enter', { sectorId: mission.destSectorId });
  missions.spawnTargetsForSector(mission.destSectorId);
  const tug = state.entities.get(mission._escorteeId);
  const boxes = spineBreakContainers(state, mission);
  assert.ok(tug && boxes.length === 6, 'the mission owner provides one tug and six boxes');
  const meridian = h.systems.faction_meridian;
  const native = await createSg02DynamicBodyOwner();
  try {
    native.syncFromEntities([tug, ...boxes]);
    meridian.update(1 / 60, state);
    for (let tick = 0; tick < 3600 && spineBreakOutcome(state, mission).recoupled < 3; tick++) {
      const live = spineBreakContainers(state, mission);
      const tail = live.filter(e => e.data.spineLoose !== true)
        .sort((a, b) => b.data.spineIndex - a.data.spineIndex)[0] || tug;
      const loose = live.find(e => e.data.authoredLoose === true && e.data.spineLoose === true);
      if (loose) steer(loose, tail, 15, 'book4-fixture-tow');
      state.tick++; state.simTime += 1 / 60;
      native.step(1 / 60, state.tick);
      meridian.update(1 / 60, state);
    }
    assert.equal(spineBreakOutcome(state, mission).recoupled, 3, 'Meridian physically closes three original couplers');
    let station = missions._liveStation(mission.destStationId);
    // These legacy campaign harnesses do not regenerate sectors or relocate the player.
    // Discard their stale prior-sector station fixture before admitting a local one.
    if (station && Math.hypot(station.pos.x - tug.pos.x, station.pos.z - tug.pos.z) > 3000) {
      h.helpers.removeEntity(station.id);
      station = null;
    }
    if (!station) station = h.helpers.spawnEntity({ type: 'station', pos: { ...tug.pos },
      data: { stationId: mission.destStationId, dockRadius: 140 } });
    for (let tick = 0; tick < 3600 && !missions._escorteeArrivedOk(mission); tick++) {
      steer(tug, station, 8, 'book4-fixture-escort');
      state.tick++; state.simTime += 1 / 60;
      native.step(1 / 60, state.tick);
      meridian.update(1 / 60, state);
      missions._steerEscortee(mission, state, 1 / 60);
    }
    assert.equal(missions._escorteeArrivedOk(mission), true,
      `the live tug reaches the admitted station: ${JSON.stringify({ tug: tug.pos, station: station.pos,
        dest: mission.destStationId, sector: state.world.currentSectorId, arrived: mission._escorteeArrived })}`);
    for (let tick = 0; tick < 3600 && spineBreakOutcome(state, mission).recoupled < 3; tick++) {
      const live = spineBreakContainers(state, mission);
      const tail = live.filter(e => e.data.spineLoose !== true)
        .sort((a, b) => b.data.spineIndex - a.data.spineIndex)[0] || tug;
      const loose = live.find(e => e.data.authoredLoose === true && e.data.spineLoose === true);
      if (loose) steer(loose, tail, 15, 'book4-fixture-tow');
      state.tick++; state.simTime += 1 / 60;
      native.step(1 / 60, state.tick);
      meridian.update(1 / 60, state);
    }
    assert.equal(spineBreakOutcome(state, mission).recoupled, 3, 'three live original couplers remain at handoff');
    bus.emit('dock:docked', { stationId: mission.destStationId });
    assert.equal(mission.status, 'completed');
  } finally { native.dispose(); }
}

export async function completeBook4Barn(h, mission) {
  const { state, bus } = h;
  state.world.currentSectorId = mission.destSectorId;
  bus.emit('sector:enter', { sectorId: mission.destSectorId });
  const frontier = h.systems.frontierHomesteads;
  frontier.update(1 / 60, state);
  const attempt = state.frontier.barnAttempt;
  const frame = state.entities.get(attempt?.frameId);
  const modules = Object.values(attempt?.moduleIds || {}).map(id => state.entities.get(id));
  assert.ok(frame && modules.length === 6, 'the Frontier owner provides the real frame and six modules');
  const native = await createSg02DynamicBodyOwner();
  try {
    native.syncFromEntities([frame, ...modules]);
    for (let tick = 0; tick < 2400 && mission.status === 'active'; tick++) {
      for (const module of modules) if (!module.data.snapped) steer(module, frame, 45, 'book4-fixture-push');
      state.tick++; state.simTime += 1 / 60;
      native.step(1 / 60, state.tick);
      frontier.update(1 / 60, state);
    }
    assert.equal(mission.status, 'completed', 'Frontier snaps and welds the six physical modules');
    assert.equal(attempt.status, 'completed');
  } finally { native.dispose(); }
}
