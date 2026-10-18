import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { factions } from '../src/systems/factions.js';
import { mining } from '../src/systems/mining.js';
import { WAKE_HANDOFF } from '../src/data/wakeHandoff.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { world } from '../src/systems/world.js';
import { hash32, mulberry32 } from '../src/core/rng.js';

const SEED = 4242;
const LANE_START = sectorLocalToGlobalForSector(WAKE_HANDOFF.start, WAKE_HANDOFF.sectorId);

function boot(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [economy, cargo, factions, mining, missions],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 100;
  state.world.currentSectorId = WAKE_HANDOFF.sectorId;
  state.player.credits = 10000;
  if (state.player.miningNoise == null) state.player.miningNoise = 0;

  const sector = SECTORS.find((row) => row.id === WAKE_HANDOFF.sectorId);
  const worldSystem = Object.assign(Object.create(world), { state, helpers: sim.helpers });
  worldSystem._spawnStations(sector, { stations: [] }, mulberry32(hash32(seed, sector.id, 0)));
  const hub = state.entityList.find((row) => row.data?.stationId === WAKE_HANDOFF.stationId);

  const player = sim.spawn({
    type: 'ship',
    team: 0,
    isPlayer: true,
    pos: { x: hub.pos.x, z: hub.pos.z },
    vel: { x: 0, z: 0 },
    radius: 12,
    mass: 24,
    hull: 100,
    hullMax: 100,
    data: {},
  });
  state.playerId = player.id;

  const events = [];
  for (const name of ['mission:completed', 'mission:failed', 'toast', 'comms:popup']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }

  const missionSystem = sim.registry.get('missions');
  const miningSystem = sim.registry.get('mining');

  function step(dt = 0.1) {
    state.simTime += dt;
    state.tick = (state.tick | 0) + 1;
    miningSystem.update(dt, state);
    missionSystem.update(dt, state);
  }

  function accept() {
    bus.emit('dock:docked', { stationId: WAKE_HANDOFF.stationId });
    const board = missionSystem.ensureBoard(WAKE_HANDOFF.stationId);
    const offer = board && board.slots.find((row) => row && row.id === WAKE_HANDOFF.id);
    assert.ok(offer, 'Drift Market posts the wake handoff');
    bus.emit('ui:acceptMission', { missionId: WAKE_HANDOFF.id });
    const mission = state.missions.active.find((m) => m && m.params && m.params.wakeHandoff);
    assert.ok(mission, 'wake handoff is active');
    return { offer, mission };
  }

  return { sim, state, bus, player, events, missionSystem, miningSystem, step, accept };
}

function playerText(events) {
  return events
    .filter((e) => e.name === 'toast' || e.name === 'comms:popup')
    .map((e) => (e.payload && e.payload.text) || '')
    .join('\n');
}

function wakeBodies(state, mission) {
  let hauler = null;
  let pod = null;
  for (const e of state.entities.values()) {
    if (!e || e.alive === false) continue;
    if (e.data && e.data.wakeHaulerOf === String(mission.id)) hauler = e;
    if (e.data && e.data.wakePodOf === String(mission.id)) pod = e;
  }
  return { hauler, pod };
}

test('Drift Market posts the pass and ignoring it commits nothing', () => {
  const h = boot();
  h.bus.emit('dock:docked', { stationId: WAKE_HANDOFF.stationId });
  const board = h.missionSystem.ensureBoard(WAKE_HANDOFF.stationId);
  const offer = board.slots.find((row) => row && row.id === WAKE_HANDOFF.id);
  assert.ok(offer, 'board offers the wake pass');
  assert.equal(offer.type, 'smuggling_run');
  assert.equal(offer.params.wakeHandoff != null, true);
  assert.equal(h.state.missions.active.length, 0);
  assert.equal(h.state.player.credits, 10000);
  assert.equal(h.state.player.cargo.items[offer.params.cmdtyId] || 0, 0);
  const words = `${offer.title} ${offer.brief}`;
  assert.equal(/cmdty_|wakeHandoff|station_/.test(words), false);
});

test('matching the hauler and scooping the wake crate pays; docking does not', () => {
  const h = boot();
  const { offer, mission } = h.accept();
  const creditsBefore = h.state.player.credits;

  h.bus.emit('dock:docked', { stationId: WAKE_HANDOFF.stationId });
  assert.equal(mission.status, 'active', 'a dock is not the handoff');
  assert.equal(h.state.player.credits, creditsBefore);

  h.step();
  const spawned = wakeBodies(h.state, mission);
  assert.ok(spawned.hauler, 'a hauler is in the lane');
  assert.ok(spawned.pod, 'a crate rides in the wake');
  const haulerAtSpawn = { x: spawned.hauler.pos.x, z: spawned.hauler.pos.z };

  h.step();
  assert.ok(
    Math.hypot(spawned.hauler.pos.x - haulerAtSpawn.x, spawned.hauler.pos.z - haulerAtSpawn.z) > 0,
    'the hauler is moving',
  );
  assert.equal(mission.status, 'active', 'a moving hauler alone does not pay');

  h.player.pos.x = spawned.pod.pos.x;
  h.player.pos.z = spawned.pod.pos.z;
  h.player.vel.x = spawned.hauler.vel.x;
  h.player.vel.z = spawned.hauler.vel.z;
  h.step();

  assert.equal(mission.status, 'completed');
  assert.equal(h.state.player.cargo.items[offer.params.cmdtyId], offer.params.qty);
  assert.equal(h.state.player.credits, creditsBefore + offer.reward_cr);
  const words = playerText(h.events);
  assert.match(words, /wake/i);
  assert.equal(/cmdty_|wake_collect|station_/.test(words), false);
  const completed = h.events.find((e) => e.name === 'mission:completed');
  assert.ok(completed);
  assert.equal(completed.payload.rewardCr, offer.reward_cr);
});

test('missing the lane fails in the open, and a mismatched scoop does not pay', () => {
  const missed = boot();
  const missedJob = missed.accept();
  const missedCredits = missed.state.player.credits;
  missed.step();
  missed.player.pos.x = LANE_START.x - 4000;
  missed.player.pos.z = LANE_START.z - 4000;
  missed.player.vel.x = 0;
  missed.player.vel.z = 0;
  const closeAt = missedJob.mission.params.wakeHandoff.closeAt;
  assert.equal(Number.isFinite(closeAt), true);
  missed.state.simTime = closeAt + 1;
  missed.step();
  assert.equal(missedJob.mission.status, 'failed');
  assert.equal(missed.state.player.credits, missedCredits);
  assert.equal(missed.state.player.cargo.items[missedJob.offer.params.cmdtyId] || 0, 0);
  const missedWords = playerText(missed.events);
  assert.match(missedWords, /left the lane/i);
  assert.equal(/wake_missed|cmdty_/.test(missedWords), false);

  const snatched = boot();
  const snatchedJob = snatched.accept();
  const snatchedCredits = snatched.state.player.credits;
  snatched.step();
  const bodies = wakeBodies(snatched.state, snatchedJob.mission);
  snatched.player.pos.x = bodies.pod.pos.x;
  snatched.player.pos.z = bodies.pod.pos.z;
  snatched.player.vel.x = 0;
  snatched.player.vel.z = 0;
  snatched.step();
  assert.equal(snatchedJob.mission.status, 'failed');
  assert.equal(snatched.state.player.credits, snatchedCredits);
  assert.equal(snatched.state.player.cargo.items[snatchedJob.offer.params.cmdtyId], snatchedJob.offer.params.qty);
  const snatchedWords = playerText(snatched.events);
  assert.match(snatchedWords, /off the wake/i);
  assert.equal(/wake_unmatched|cmdty_/.test(snatchedWords), false);
});
test('board acceptance points to the Pallas lane and spawns both actors there', () => {
  const h = boot();
  const { mission } = h.accept();
  h.bus.emit('ui:trackMission', { missionId: mission.id });
  assert.deepEqual(h.state.nav.waypoint.pos, LANE_START, 'fallback focus is the global Pallas lane');
  h.step();
  const { hauler, pod } = wakeBodies(h.state, mission);
  assert.ok(hauler && pod);
  assert.ok(Math.hypot(hauler.pos.x - LANE_START.x, hauler.pos.z - LANE_START.z) < 4,
    'hauler starts at (-18880, 19760) in Pallas');
  assert.ok(Math.hypot(pod.pos.x - LANE_START.x, pod.pos.z - LANE_START.z) < WAKE_HANDOFF.wakeOffset + 4,
    'crate rides in the same global lane');
});

for (const missing of ['crate', 'both actors']) {
  test(`Continue restores ${missing} at the saved wake pose without reopening the window`, () => {
    const h = boot();
    const { mission } = h.accept();
    h.step(12);
    const before = wakeBodies(h.state, mission);
    const pose = { x: before.hauler.pos.x, z: before.hauler.pos.z };
    const closeAt = mission.params.wakeHandoff.closeAt;
    const saved = JSON.parse(JSON.stringify(h.missionSystem.serialize()));

    const restored = boot();
    restored.state.simTime = h.state.simTime;
    // World records can retain the hauler; pickups are transient on Continue.
    if (missing === 'crate') {
      restored.sim.spawn({ type: 'ship', pos: pose, vel: { x: WAKE_HANDOFF.speed, z: 0 },
        data: { wakeHaulerOf: String(mission.id) } });
    } else {
      // A saved runtime id can now belong to an unrelated body.
      restored.sim.spawn({ type: 'ship', pos: { x: 1, z: 2 } });
    }
    restored.missionSystem.deserialize(saved);
    const resumed = restored.state.missions.active.find((row) => row.sourceOfferId === WAKE_HANDOFF.id);
    restored.bus.emit('ui:trackMission', { missionId: resumed.id });
    assert.deepEqual(restored.state.nav.waypoint.pos, pose, 'Continue tracks the saved lane before actors return');
    restored.step(0);
    const bodies = wakeBodies(restored.state, resumed);
    assert.ok(bodies.hauler && bodies.pod, 'Continue rematerializes the missing wake actors');
    assert.deepEqual({ x: bodies.hauler.pos.x, z: bodies.hauler.pos.z }, pose,
      'Continue keeps the saved global lane pose');
    assert.equal(resumed.params.wakeHandoff.closeAt, closeAt, 'original deadline survives');
    assert.equal(restored.state.entityList.filter((row) => row.alive !== false
      && row.data?.wakeHaulerOf === String(resumed.id)).length, 1, 'surviving hauler is relinked once');

    restored.sim.helpers.removeEntity(bodies.pod.id);
    restored.sim.helpers.removeEntity(bodies.hauler.id);
    restored.step(0);
    const rematerialized = wakeBodies(restored.state, resumed);
    assert.ok(rematerialized.hauler && rematerialized.pod, 'hard teardown also recovers');
    assert.deepEqual({ x: rematerialized.hauler.pos.x, z: rematerialized.hauler.pos.z }, pose);
    restored.player.pos.x = rematerialized.pod.pos.x;
    restored.player.pos.z = rematerialized.pod.pos.z;
    restored.player.vel.x = rematerialized.hauler.vel.x;
    restored.player.vel.z = rematerialized.hauler.vel.z;
    restored.step();
    assert.equal(resumed.status, 'completed', 'the restored crate remains collectible through mining');
    assert.equal(restored.state.player.credits, 10000 + WAKE_HANDOFF.rewardCr);
  });
}
