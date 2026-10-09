// SFQ-B071/B079 (prog 08; build_map row 222) — one existing mission, tow_recovery,
// proven end to end while its object moves, fails and reloads.
//
// The named object is the SLAG CORE: a real physical body the mission spawns, names,
// and tracks by id — not a counter. These legs drive the same seams the player route
// does: tether:latched, massline:throw, dock:docked, entity:destroyed, sector
// exit/enter, and the real save seam (serializeData → _restoreMissions).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { missions } from '../src/systems/missions.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';

const SEED = 22200;

function stationInfo(id) {
  for (const sector of SECTORS) {
    const station = (sector.stations || []).find((row) => row.id === id);
    if (station) return { ...station, sectorId: sector.id };
  }
  return null;
}

function boot(seed = SEED) {
  const sim = createSimulation({ seed, systems: [missions], updateOrder: [] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.credits = 250000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const events = [];
  for (const name of ['mission:completed', 'mission:failed', 'mission:expired', 'nav:waypoint']) {
    sim.bus.on(name, (p) => events.push({ name, payload: p }));
  }
  return { sim, state, player, events, missionsSys: sim.registry.get('missions') };
}

function forceOffer(h, destStationId) {
  const dest = stationInfo(destStationId);
  const origin = stationInfo('station_helios');
  assert.ok(dest && origin, 'route stations must exist');
  h.state.world.currentSectorId = dest.sectorId;
  const offer = h.missionsSys._rollOffer('tow_recovery', {
    id: origin.id, name: origin.name, type: origin.type,
    size: origin.size || 'L', factionId: origin.factionId, sectorId: origin.sectorId,
  }, () => 0.25, 0, 0, { attachConditions: false });
  assert.ok(offer, 'tow_recovery must roll');
  offer.destStationId = dest.id;
  offer.destSectorId = dest.sectorId;
  offer.collateral_cr = 0;
  const board = h.state.missions.boards[origin.id] || (h.state.missions.boards[origin.id] = {
    refreshEpoch: 0, slots: [],
  });
  board.slots.push(offer);
  assert.equal(h.missionsSys.acceptMission(offer.id), true, 'tow_recovery must accept');
  const mission = h.state.missions.active.find((row) => row.type === 'tow_recovery');
  assert.ok(mission, 'tow_recovery must be active');
  h.missionsSys._ensureMissionTargets(mission);
  return mission;
}

function destStation(h, mission) {
  let station = [...h.state.entities.values()].find((e) => (
    e && e.type === 'station' && e.data && e.data.stationId === mission.destStationId
  ));
  if (station) return station;
  station = h.sim.spawn({
    type: 'station',
    pos: { x: 80, z: 40 },
    radius: 40,
    data: { stationId: mission.destStationId, dockRadius: 80 },
  });
  return station;
}

function roleOf(entity) {
  return entity && entity.data && entity.data.physicalRole || null;
}

function slagCore(h, mission) {
  return (mission.targetEntityIds || []).map((id) => h.state.entities.get(id)).find((e) => (
    e && e.alive !== false && roleOf(e) === 'slag_core'
  )) || null;
}

function makeSaveHarness(sim) {
  const save = Object.create(saveDefinition);
  save.state = sim.state;
  save.bus = sim.bus;
  save.registry = { get: (name) => sim.registry.get(name) || null };
  save.helpers = sim.helpers;
  save._restoring = false;
  save._pendingRunTransition = null;
  save._restoreSequence = 0;
  save._lastAutosaveAt = 0;
  save._lastAutosavePlaytime = 0;
  save._rollbackCaptureActive = false;
  save._rollbackInProgress = false;
  return save;
}

test('B071 the object is a named body that moves: latch, drag, and the job tracks the live position', () => {
  const h = boot();
  const mission = forceOffer(h, 'station_ceres');
  assert.equal(mission.needsTargets, true, 'the job owes a physical object');
  const core = slagCore(h, mission);
  assert.ok(core, 'the slag core materialized in the destination sector');
  assert.equal(core.data.scanLabel, 'SLAG CORE', 'the mission names the body');
  assert.equal(core.data.missionTag, mission.id, 'the body carries the job id');
  assert.equal(core.data.missionTargetSlot, 0, 'the body carries a durable slot');
  assert.equal(core.data.tetherable, true, 'the named object is towable');

  // Latch the real body — the job records which body is on the line.
  h.sim.bus.emit('tether:latched', { targetId: core.id });
  assert.equal(mission.params.latchedTargetId, core.id, 'the latch is tracked on the mission');
  assert.equal(mission.params.latchedRole, 'slag_core');

  // Move it: the tracked waypoint follows the body's live position, not a stale point.
  const movedTo = { x: core.pos.x + 400, z: core.pos.z - 300 };
  core.pos.x = movedTo.x;
  core.pos.z = movedTo.z;
  const wp = h.missionsSys._missionWaypoint(mission);
  assert.equal(wp.targetEntityId, core.id, 'the marker rides the body itself');
  assert.equal(wp.pos.x, movedTo.x, 'the marker follows the moved object');
  assert.equal(wp.pos.z, movedTo.z);

  // Tow it home: the dragged body at the destination berth settles the contract.
  destStation(h, mission);
  core.pos.x = 80;
  core.pos.z = 40;
  h.sim.bus.emit('dock:docked', { stationId: mission.destStationId });
  const done = h.events.filter((e) => e.name === 'mission:completed' && e.payload.missionId === mission.id);
  assert.equal(done.length, 1, 'the tow settles exactly once');
  assert.equal(done[0].payload.completionMethod, 'tow_in');
  assert.equal(h.state.missions.active.some((m) => m.id === mission.id), false);
  h.sim.dispose();
});

test('B071 a moved core still answers the berth gate — sling_in settles from wherever it was dragged', () => {
  const h = boot();
  const mission = forceOffer(h, 'station_ceres');
  const core = slagCore(h, mission);
  assert.ok(core, 'core spawned');
  destStation(h, mission);

  // A throw from the middle of nowhere is just a throw — the gate reads the body.
  core.pos = { x: 5000, z: 5000 };
  h.sim.bus.emit('massline:throw', { payloadId: core.id, aimTargetId: null });
  assert.equal(h.state.missions.active.some((m) => m.id === mission.id), true,
    'a displaced core thrown nowhere near the yard does not complete');

  // The same body, dragged into the berth and released clean, settles the job.
  core.pos = { x: 80, z: 40 };
  h.sim.bus.emit('massline:throw', { payloadId: core.id, aimTargetId: null });
  const done = h.events.filter((e) => e.name === 'mission:completed' && e.payload.missionId === mission.id);
  assert.equal(done.length, 1);
  assert.equal(done[0].payload.completionMethod, 'sling_in');
  h.sim.dispose();
});

test('B079 the object fails: destroying the core settles once, stamps the loss site, and never softlocks', () => {
  const h = boot();
  const mission = forceOffer(h, 'station_ceres');
  const core = slagCore(h, mission);
  assert.ok(core, 'core spawned');
  const corePos = { x: core.pos.x, z: core.pos.z };

  h.sim.bus.emit('entity:destroyed', { id: core.id, pos: corePos });
  const failed = h.events.filter((e) => e.name === 'mission:failed' && e.payload.missionId === mission.id);
  assert.equal(failed.length, 1, 'the loss settles exactly once');
  assert.equal(failed[0].payload.reason, 'core_lost');
  assert.equal(h.state.missions.active.some((m) => m.id === mission.id), false,
    'a dead object is a finished job, not a softlock');
  // The loss site survives on the durable record (successor recovery routes from it).
  assert.equal(mission.params.lostSectorId, mission.destSectorId, 'the loss is stamped in-sector');
  assert.ok(mission.params.lostWreckPos && Number.isFinite(mission.params.lostWreckPos.x),
    'the loss position is recorded');

  // A duplicated destroy receipt cannot double-settle — the mission is already gone.
  h.sim.bus.emit('entity:destroyed', { id: core.id, pos: corePos });
  assert.equal(h.events.filter((e) => e.name === 'mission:failed' && e.payload.missionId === mission.id).length, 1);
  h.sim.dispose();
});

test('B079 abandonment is one terminal settle, not a stuck record', () => {
  const h = boot();
  const mission = forceOffer(h, 'station_ceres');
  assert.ok(slagCore(h, mission), 'core spawned');
  assert.equal(h.missionsSys.abandonMission(mission.id), true);
  const failed = h.events.filter((e) => e.name === 'mission:failed' && e.payload.missionId === mission.id);
  assert.equal(failed.length, 1, 'abandonment resolves once');
  assert.equal(failed[0].payload.reason, 'abandoned');
  assert.equal(h.state.missions.active.some((m) => m.id === mission.id), false);
  h.sim.dispose();
});

test('B071 the object reloads: a moved job serializes clean, re-materializes its body, and completes', () => {
  const h = boot();
  const mission = forceOffer(h, 'station_ceres');
  const core = slagCore(h, mission);
  assert.ok(core, 'core spawned');
  // Move it before the save — the job must not depend on the live body's id.
  core.pos.x += 350;
  core.pos.z -= 120;

  const saveA = makeSaveHarness(h.sim);
  const data = saveA.serializeData();
  const savedActive = (data.missions && ((data.missions.missions && data.missions.missions.active)
    || data.missions.active)) || [];
  const saved = savedActive.find((row) => row.id === mission.id);
  assert.ok(saved, 'the tow job is on the save');
  assert.deepEqual(saved.targetEntityIds, [], 'runtime body ids never ride the save');
  assert.equal(saved.needsTargets, true, 'the durable record still owes its object');

  // Restore into a fresh world: same seed, new runtime ids.
  const b = boot();
  b.state.world.currentSectorId = mission.destSectorId;
  const saveB = makeSaveHarness(b.sim);
  saveB._restoreMissions(JSON.parse(JSON.stringify(data.missions)));
  const restored = b.state.missions.active.find((row) => row.id === mission.id);
  assert.ok(restored, 'the job survived the reload');
  assert.equal(restored.status, 'active');
  assert.equal(restored.needsTargets, true);

  // Re-entering the sector re-materializes the object — a new body, same job.
  b.missionsSys._ensureMissionTargets(restored);
  const newCore = slagCore(b, restored);
  assert.ok(newCore, 'the slag core re-materialized after load');
  assert.equal(newCore.data.missionTag, mission.id, 'the new body carries the same job id');
  assert.equal(newCore.data.missionTargetSlot, 0, 'the same durable slot owns the slot identity');

  // The re-materialized object completes the job exactly like the first one did.
  destStation(b, restored);
  newCore.pos = { x: 80, z: 40 };
  b.sim.bus.emit('massline:throw', { payloadId: newCore.id, aimTargetId: null });
  const done = b.events.filter((e) => e.name === 'mission:completed' && e.payload.missionId === mission.id);
  assert.equal(done.length, 1, 'the reloaded job settles once');
  assert.equal(done[0].payload.completionMethod, 'sling_in');
  h.sim.dispose();
  b.sim.dispose();
});

test('B071 a hard sector exit tears the body down and re-entry respawns the same job', () => {
  const h = boot();
  const mission = forceOffer(h, 'station_ceres');
  const core = slagCore(h, mission);
  assert.ok(core, 'core spawned');

  // Hard (non-continuous) leave: the pinned body is retired, the job keeps its durable need.
  h.sim.bus.emit('sector:exit', { sectorId: mission.destSectorId });
  assert.equal(mission.targetEntityIds.length, 0, 'runtime ids cleared on hard exit');
  assert.equal(core.alive, false, 'the body is retired by the leave, not orphaned');
  assert.equal(h.state.missions.active.some((m) => m.id === mission.id), true,
    'the contract itself survives the exit');

  // Re-entry re-materializes the object for the same mission.
  h.sim.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  const newCore = slagCore(h, mission);
  assert.ok(newCore, 'the core respawned on re-entry');
  assert.equal(newCore.data.missionTag, mission.id);
  h.sim.dispose();
});
