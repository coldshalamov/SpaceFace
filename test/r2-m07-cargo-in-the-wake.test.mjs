import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { factions } from '../src/systems/factions.js';
import { mining } from '../src/systems/mining.js';
import { WAKE_HANDOFF } from '../src/data/wakeHandoff.js';

const SEED = 4242;

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

  const player = sim.spawn({
    type: 'ship',
    team: 0,
    isPlayer: true,
    pos: { x: WAKE_HANDOFF.start.x - 2500, z: WAKE_HANDOFF.start.z - 2500 },
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
    assert.equal(missionSystem.acceptMission(WAKE_HANDOFF.id), true);
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
  missed.player.pos.x = WAKE_HANDOFF.start.x - 4000;
  missed.player.pos.z = WAKE_HANDOFF.start.z - 4000;
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
