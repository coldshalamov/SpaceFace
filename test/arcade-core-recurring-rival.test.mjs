import assert from 'node:assert/strict';
import test from 'node:test';

import { RECURRING_RIVAL } from '../src/data/namedAces.js';
import { CERES_SHIFT_RING } from '../src/data/timeTrialCourses.js';
import { SIM_DT } from '../src/core/sim.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

test('Kei is a short-voiced neutral peer outside the hostile named-Ace roster', () => {
  assert.equal(RECURRING_RIVAL.id, 'rival_kei_halber');
  assert.equal(RECURRING_RIVAL.shipDefId, 'ship_hornet');
  assert.equal(RECURRING_RIVAL.factionId, 'faction_free');
  for (const bark of Object.values(RECURRING_RIVAL.barks)) {
    assert.ok(bark.trim().split(/\s+/).length <= 12, `Rival bark stays glanceable: ${bark}`);
  }
});

test('one completed physical course creates Kei, and the next run brings the same peer back as a moving ship', async (t) => {
  const route = await bootRoute(t, 0x52a11);
  const { runtime, state, bus, voices } = route;
  const appeared = [];
  const resolved = [];
  bus.on('recurringRival:appeared', (payload) => appeared.push(structuredClone(payload)));
  bus.on('recurringRival:raceResolved', (payload) => resolved.push(structuredClone(payload)));

  bus.emit('timeTrial:completed', {
    courseId: CERES_SHIFT_RING.id,
    playerId: state.playerId,
    elapsedTicks: CERES_SHIFT_RING.medals.silverTicks,
    medal: 'silver',
  });

  const memory = state.aceMemory.rival;
  assert.equal(memory.unlocked, true);
  assert.equal(memory.triggerCourseId, CERES_SHIFT_RING.id);
  assert.equal(memory.appearances, 1);
  assert.equal(memory.racesStarted, 0);
  const intro = state.entities.get(memory.activeEntityId);
  assert.ok(intro && intro.alive !== false);
  assert.equal(intro.type, 'ship');
  assert.equal(intro.team, 2);
  assert.equal(intro.data.ai.passive, true);
  assert.equal(intro.data.namedRivalId, RECURRING_RIVAL.id);
  assert.equal(intro.collides, true);
  assert.ok(intro.mass > 0 && intro.radius > 0);
  assert.equal(state.npcJobs.byId[intro.data.jobId]?.job?.kind, 'patrol');
  assert.deepEqual(appeared[0], {
    rivalId: RECURRING_RIVAL.id,
    rivalName: RECURRING_RIVAL.name,
    courseId: CERES_SHIFT_RING.id,
    context: 'intro',
    entityId: intro.id,
    jobId: intro.data.jobId,
    physical: true,
    hostile: false,
  });

  bus.emit('timeTrial:started', {
    courseId: CERES_SHIFT_RING.id,
    playerId: state.playerId,
    startedTick: state.tick,
  });
  const racer = state.entities.get(state.aceMemory.rival.activeEntityId);
  assert.ok(racer && racer.alive !== false);
  assert.equal(racer.alive, true);
  assert.notEqual(racer.id, intro.id, 'the race enters at Gate 1 instead of teleporting the intro body');
  assert.equal(state.aceMemory.rival.appearances, 2);
  assert.equal(state.aceMemory.rival.racesStarted, 1);
  assert.equal(state.aceMemory.rival.activeRace.status, 'running');
  assert.equal(state.npcJobs.byId[racer.data.jobId]?.job?.route?.length, CERES_SHIFT_RING.gates.length);
  const raceStart = { ...racer.pos };
  runtime.runTicks(180, SIM_DT);
  assert.ok(Math.hypot(racer.pos.x - raceStart.x, racer.pos.z - raceStart.z) > 1,
    `the recurring peer must move through the real NPC-job/physics route: ${JSON.stringify({ raceStart, end: racer.pos, vel: racer.vel, intent: racer.data.intent, ai: racer.data.ai })}`);

  bus.emit('timeTrial:invalidated', { courseId: CERES_SHIFT_RING.id, reason: 'touched_buoy' });
  assert.equal(state.aceMemory.rival.rivalWins, 1);
  assert.equal(state.aceMemory.rival.playerWins, 0);
  assert.equal(state.aceMemory.rival.lastRace.playerInvalidated, true);
  assert.deepEqual(resolved.map((row) => row.winner), ['rival']);
  assert.ok(voices.some((row) => row.text === RECURRING_RIVAL.barks.intro));
  assert.ok(voices.some((row) => row.text === RECURRING_RIVAL.barks.challenge));
  assert.ok(voices.some((row) => row.text === RECURRING_RIVAL.barks.invalidated));

  const saved = JSON.parse(JSON.stringify(runtime.getSystem('aceMemory').serialize()));
  assert.deepEqual(Object.keys(saved.rival).filter((key) => /credit|cargo|kill|mission|deed/i.test(key)), [],
    'the recurring peer remembers only itself, not a general player-history mirror');

  const continued = await bootRoute(t, 0x52a11);
  const continuedMemory = continued.runtime.getSystem('aceMemory');
  continuedMemory.deserialize(saved);
  continued.state.simTime = (saved.rival.retireAt || 0) + 1;
  continuedMemory.update(0.5, continued.state);
  assert.equal(continued.state.aceMemory.rival.unlocked, true);
  assert.equal(continued.state.aceMemory.rival.rivalWins, 1);
  assert.equal(continued.state.aceMemory.rival.activeRace, null);

  continued.bus.emit('timeTrial:started', {
    courseId: CERES_SHIFT_RING.id,
    playerId: continued.state.playerId,
    startedTick: continued.state.tick,
  });
  continued.bus.emit('timeTrial:completed', {
    courseId: CERES_SHIFT_RING.id,
    playerId: continued.state.playerId,
    elapsedTicks: CERES_SHIFT_RING.medals.goldTicks,
    medal: 'gold',
  });
  assert.equal(continued.state.aceMemory.rival.playerWins, 1);
  assert.equal(continued.state.aceMemory.rival.rivalWins, 1);
  assert.equal(continued.state.aceMemory.rival.lastRace.winner, 'player');
});

async function bootRoute(t, seed) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed });
  t.after(() => runtime.dispose());
  const { state, bus } = runtime;
  const voices = [];
  runtime.getSystem('aceMemory').helpers.voice = {
    say: (payload) => voices.push(structuredClone(payload)),
  };
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.input.actions = {};
  state.input.moveX = 0;
  state.input.moveZ = 0;
  state.input.turnIntent = 0;
  state.input.boost = false;
  state.input.fire = false;
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  const physics = runtime.getSystem('physics');
  assert.equal(await physics.prepareBackend(state, { reset: true }), true);
  assert.equal(state.physicsRuntime.diagnostics.backend, 'rapier-dynamic');
  // Let World complete the ordinary residency/sector:enter boundary before the history event. A
  // real course cannot start before this point, and sector:exit correctly retires live rivals.
  runtime.runTicks(2, SIM_DT);
  runtime.getSystem('world').enterSector(CERES_SHIFT_RING.sectorId, { placePlayer: true });
  assert.equal(state.world.currentSectorId, CERES_SHIFT_RING.sectorId);
  return { runtime, state, bus, player, voices };
}
