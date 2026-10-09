// Adventure kill replay — the flight tape exists, and the Replay surface can read it.
//
// Contract (deterministic, sim-time only):
//   1. killReplay publishes state.replay.recording in Adventure flight: ticks step, the seed
//      rides along, and boost burns read back through the surface's own window reader;
//   2. player kills and stunts land as marks in the tape's own tick space, and marks age out
//      with the 30-second window instead of pointing past the tape;
//   3. survival keeps its five-second body ring and records no Adventure tape;
//   4. pause steps nothing; a new game resets the tape.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { killReplay } from '../src/systems/killReplay.js';
import { replayBoostWindows, replaySummary } from '../src/ui/screens/replay.js';

const SEED = 4242;

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [killReplay] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_ceres_belt';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 });
  sim.state.playerId = player.id;
  player.data = player.data || {};
  player.data.intent = { boost: false };
  return { sim, state: sim.state, bus: sim.bus, player };
}

function stepTicks(t, n, boost = false) {
  t.player.data.intent.boost = boost;
  for (let i = 0; i < n; i += 1) t.sim.step();
  t.player.data.intent.boost = false;
}

test('flight publishes a tape the surface reads: ticks, seed, and boost burns', () => {
  const t = boot();
  stepTicks(t, 120);
  stepTicks(t, 60, true);

  const recording = t.state.replay && t.state.replay.recording;
  assert.ok(recording, 'the producer publishes state.replay.recording');
  assert.equal(recording.ticks, 180, 'every flight tick lands on the tape');
  assert.equal(recording.seed, SEED, 'the tape carries the run seed');

  const summary = replaySummary(recording);
  assert.equal(summary.available, true, 'the surface accepts the tape');
  assert.equal(summary.ticks, 180);
  assert.equal(summary.seed, SEED);

  const windows = replayBoostWindows(recording);
  assert.equal(windows.length, 1, 'one burn window');
  assert.equal(windows[0].endTick - windows[0].startTick + 1, 60, 'the burn spans the boosted ticks');
});

test('player kills and stunts mark the tape, and the marks stay in the window tick space', () => {
  const t = boot();
  const victim = t.sim.spawn({ type: 'ship', team: 2, pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 });
  victim.data = { callsign: 'Reaver Corsair' };
  stepTicks(t, 30);
  t.bus.emit('entity:killed', { id: victim.id, killerId: t.state.playerId, type: 'ship' });
  t.bus.emit('stunt:trickDetected', { actorId: t.state.playerId, trickId: 'asteroid_skim', name: 'Asteroid Skim' });
  stepTicks(t, 5);

  const recording = t.state.replay.recording;
  assert.equal(recording.events.length, 2, 'both marks ride the tape');
  const kill = recording.events.find((e) => e.type === 'kill');
  const stunt = recording.events.find((e) => e.type === 'stunt');
  assert.equal(kill.label, 'Reaver Corsair', 'the mark names the victim');
  assert.ok(kill.tick >= 0 && kill.tick < recording.ticks, 'marks live inside the window');
  assert.equal(stunt.label, 'Asteroid Skim');
  assert.ok(stunt.tick === 29, 'the stunt mark sits at the tick just flown');

  // NPC-on-NPC violence and other pilots' tricks never mark the tape.
  t.bus.emit('entity:killed', { id: 9999, killerId: 4242, type: 'ship' });
  t.bus.emit('stunt:trickDetected', { actorId: 4242, trickId: 'x', name: 'Not Mine' });
  stepTicks(t, 2);
  assert.equal(t.state.replay.recording.events.length, 2, 'foreign deeds stay off the tape');
});

test('the tape is a thirty-second window: old ticks and aged marks fall off the back', () => {
  const t = boot();
  stepTicks(t, 40);
  const victim = t.sim.spawn({ type: 'ship', team: 2, pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 });
  t.bus.emit('entity:killed', { id: victim.id, killerId: t.state.playerId, type: 'ship' });
  assert.equal(t.state.replay.recording.events.length, 1);

  stepTicks(t, 60 * 31); // fly past the window
  const recording = t.state.replay.recording;
  assert.equal(recording.ticks, 30 * 60, 'the tape caps at its window');
  assert.equal(recording.seconds, 30, 'thirty seconds of tape');
  assert.equal(recording.events.filter((e) => e.tick >= 0 && e.tick < recording.ticks).length, 0,
    'a mark older than the window no longer points at the tape');
});

test('survival keeps its body ring and records no adventure tape; pause steps nothing; new game resets', () => {
  const t = boot();
  t.state.run = { kind: 'survival', phase: 'live' };
  stepTicks(t, 60);
  assert.equal(t.state.replay.recording.ticks, 0, 'no adventure tape during a survival run');

  t.state.run = null;
  stepTicks(t, 30);
  t.state.mode = 'paused';
  t.sim.step();
  t.sim.step();
  assert.equal(t.state.replay.recording.ticks, 30, 'paused ticks never land on the tape');

  t.state.mode = 'flight';
  t.bus.emit('game:new', {});
  assert.equal(t.state.replay.recording.ticks, 0, 'a new game starts a fresh tape');
  assert.equal(t.state.replay.recording.events.length, 0, 'marks do not survive the reset');
});
