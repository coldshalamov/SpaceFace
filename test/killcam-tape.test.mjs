// The instant kill-cam tape (DEMO_READINESS_2026-09-20 §4): the recorder's bounds, the
// round-end handoff, and the screen's stage-request gates. Fixture frames are analytic —
// linear motion with known positions — so every assertion is a number, not a vibe.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  KILLCAM_MAX_ROUNDS,
  KILLCAM_MAX_SHIPS,
  KILLCAM_SAMPLE_COUNT,
  KILLCAM_SAMPLE_RATE,
  KILLCAM_TAPE_SCHEMA,
  KILLCAM_WINDOW_S,
  clearKillcamTape,
  createKillcamRecorder,
  decodeKillcamTape,
  encodeKillcamTape,
  isKillcamTape,
  killcamRecorder,
  killcamSessionCensus,
  killcamStageRequestFor,
  skipKillcamPlayback,
  killcamPlaybackSkipped,
  takeKillcamTape,
} from '../src/sim/killcamTape.js';
import { createBus } from '../src/core/eventBus.js';

const STRIDE = 2; // the recorder's sim ticks between samples (60 Hz sim, 30 Hz tape)

/** A minimal fake world: analytic linear motion, one entity list, a fixed tick. */
function fixtureWorld() {
  const player = {
    id: 'player', type: 'ship', team: 0, alive: true, radius: 6,
    data: { defId: 'kestrel', silhouette: 'kestrel' },
    pos: { x: 0, z: 0 }, rot: 0,
  };
  const hostile = {
    id: 'hostile', type: 'ship', team: 1, alive: true, radius: 5,
    data: { lootTableId: 'wasp_swarmer', silhouette: 'dart' },
    pos: { x: 0, z: 0 }, rot: 0,
  };
  const bolt = {
    id: 'bolt', type: 'projectile', team: 0, alive: true, radius: 0.5, data: {},
    pos: { x: 0, z: 0 },
  };
  const state = {
    tick: 0,
    playerId: 'player',
    entityList: [player, hostile, bolt],
    run: { kind: 'survival', phase: 'active' },
  };
  // Both hulls fly +x at 30 wu/s; the bolt flies +x at 120 wu/s. Deterministic.
  function stepTo(tick) {
    const t = tick / 60;
    player.pos.x = 30 * t; player.pos.z = 0; player.rot = 0;
    hostile.pos.x = 10 + 30 * t; hostile.pos.z = 4; hostile.rot = Math.PI;
    bolt.pos.x = 120 * t; bolt.pos.z = 0;
    state.tick = tick;
  }
  return { state, stepTo, player, hostile, bolt };
}

function recordWindow(recorder, world, fromTick, toTick, dieAt = Infinity) {
  for (let tick = fromTick; tick <= toTick; tick++) {
    world.stepTo(tick);
    if (tick === dieAt) world.hostile.alive = false;
    recorder.note(world.state);
  }
}

test('the tape window is capped at five seconds however long the round ran', () => {
  const world = fixtureWorld();
  const recorder = createKillcamRecorder();
  // 20 seconds at 60 Hz — four times the window.
  recordWindow(recorder, world, 1, 20 * 60);
  const tape = encodeKillcamTape(recorder, { seed: 4242 });
  assert.ok(isKillcamTape(tape));
  assert.equal(tape.samples, KILLCAM_SAMPLE_COUNT);
  assert.equal(KILLCAM_SAMPLE_COUNT, KILLCAM_WINDOW_S * KILLCAM_SAMPLE_RATE);
  for (const ship of tape.ships) assert.equal(ship.n, KILLCAM_SAMPLE_COUNT);
  // The tape ends at the present, so its first sample is exactly one window back.
  assert.equal(tape.endSample, (20 * 60) / STRIDE);
  assert.equal(tape.ships[0].b, 0);
});

test('the ring wraps without tearing a track: analytic positions survive the wrap', () => {
  const world = fixtureWorld();
  const recorder = createKillcamRecorder();
  recordWindow(recorder, world, 1, 20 * 60); // far past the 150-sample ring
  const tape = encodeKillcamTape(recorder, {});
  const player = tape.ships.find((s) => s.player);
  assert.ok(player, 'the player hull is on the tape');
  for (let i = 0; i < player.n; i++) {
    const globalSample = tape.endSample - player.n + 1 + i;
    const expectedX = 30 * (globalSample * STRIDE / 60);
    assert.ok(Math.abs(player.x[i] - expectedX) < 1e-3, `sample ${i}: ${player.x[i]} vs ${expectedX}`);
  }
});

test('clear is the round boundary: nothing survives it', () => {
  const world = fixtureWorld();
  const recorder = createKillcamRecorder();
  recordWindow(recorder, world, 1, 300);
  assert.ok(recorder.census().ships >= 2);
  recorder.clear();
  assert.deepEqual(recorder.census(), { ships: 0, rounds: 0, flashes: 0, sampleSeq: 0 });
  const tape = encodeKillcamTape(recorder, {});
  assert.equal(isKillcamTape(tape), false, 'an empty recording is not a playable tape');
});

test('the bounded entity set holds even when a wave outspawns the pools', () => {
  const state = {
    tick: 0, playerId: 'player', entityList: [],
    run: { kind: 'survival', phase: 'active' },
  };
  const recorder = createKillcamRecorder();
  let nextId = 0;
  for (let tick = 0; tick <= 60; tick += 2) {
    state.tick = tick;
    // Two fresh hostiles every sampled tick: far more lives than the ship pool.
    state.entityList = [{
      id: `swarm${nextId++}`, type: 'ship', team: 1, alive: true, radius: 4,
      data: {}, pos: { x: tick, z: 0 }, rot: 0,
    }, {
      id: `swarm${nextId++}`, type: 'ship', team: 1, alive: true, radius: 4,
      data: {}, pos: { x: tick, z: 1 }, rot: 0,
    }];
    recorder.note(state);
  }
  const census = recorder.census();
  assert.ok(census.ships <= KILLCAM_MAX_SHIPS, `ship pool bound: ${census.ships}`);
  assert.equal(census.rounds, 0);
});

test('round end hands over a well-formed tape: hulls, rounds, one honest kill flash', () => {
  const world = fixtureWorld();
  const recorder = createKillcamRecorder();
  // 6 seconds: past the window, so the handoff proves the 5-second tail; the hostile
  // dies at tick 240 with its last recorded pose and a flash.
  recordWindow(recorder, world, 1, 6 * 60, 240);
  const tape = encodeKillcamTape(recorder, { seed: 31337 });

  assert.equal(tape.schema, KILLCAM_TAPE_SCHEMA);
  assert.equal(tape.seed, 31337);
  assert.equal(tape.tickRate, 60);
  assert.equal(tape.sampleRate, KILLCAM_SAMPLE_RATE);
  assert.equal(tape.samples, KILLCAM_SAMPLE_COUNT);

  const player = tape.ships.find((s) => s.player);
  const hostile = tape.ships.find((s) => s.team === 1);
  assert.ok(player && hostile, 'both hulls ride the tape');
  assert.equal(player.visual, 'kestrel');
  assert.equal(hostile.visual, 'wasp_swarmer');
  // The hostile died mid-window: its track stops at its last LIVE sample (the recorder
  // never invents a pose after the sim stopped moving the hull), and d names that sample.
  const firstSample = tape.endSample - tape.samples + 1;
  const deathSample = (240 / STRIDE) - 1 - firstSample; // last sampled tick it was alive
  assert.equal(hostile.d, deathSample);
  assert.equal(hostile.n, deathSample + 1);
  // The death pose is the analytic one at that last live tick, and the flash carries it.
  const deathT = ((deathSample + firstSample) * STRIDE) / 60;
  assert.ok(Math.abs(hostile.x[hostile.n - 1] - (10 + 30 * deathT)) < 1e-3);
  assert.equal(tape.flashes.length, 1);
  assert.equal(tape.flashes[0].s, deathSample);
  assert.ok(Math.abs(tape.flashes[0].x - (10 + 30 * deathT)) < 1e-3);

  // The bolt's track is on the tape as a round.
  assert.equal(tape.rounds.length, 1);
  assert.equal(tape.rounds[0].team, 0);

  // The decode is a playable film: interpolation between fixture frames lands between them.
  const film = decodeKillcamTape(tape);
  assert.equal(film.total, KILLCAM_SAMPLE_COUNT);
  const mid = film.ships.find((s) => s.ship.player).poseAt(film.total / 2);
  assert.ok(mid.x > 0 && mid.z === 0);
});

test('the registered system records only a live survival run and clears on run:started', () => {
  const bus = createBus();
  const world = fixtureWorld();
  const state = world.state;
  killcamRecorder.init({ state, bus });
  try {
    killcamRecorder.update(1 / 60, state);
    assert.ok(killcamSessionCensus().ships >= 2, 'the fixture run is survival/active — it records');

    // Anything but a live survival run reads as nothing.
    const idle = { ...state, run: { kind: 'survival', phase: 'inactive' }, tick: 1000, entityList: state.entityList };
    killcamRecorder.update(1 / 60, idle);
    assert.equal(killcamSessionCensus().sampleSeq, (state.tick - (state.tick % STRIDE)) / STRIDE,
      'the inactive tick never landed');

    // The round boundary: run:started wipes ring, seal, and skip.
    recordWindowInline(killcamRecorder, world);
    assert.ok(isKillcamTape(takeKillcamTape({ seed: 1 })));
    bus.emit('run:started', {});
    assert.deepEqual(killcamSessionCensus(), { ships: 0, rounds: 0, flashes: 0, sampleSeq: 0 });
    assert.equal(isKillcamTape(takeKillcamTape({})), false);
  } finally {
    killcamRecorder.destroy();
    clearKillcamTape();
  }
});

function recordWindowInline(system, world) {
  for (let tick = 2000; tick <= 2000 + 120; tick++) {
    world.stepTo(tick);
    system.update(1 / 60, world.state);
  }
}

test('the results screen stage request gates on tape, motion, and skip', () => {
  const world = fixtureWorld();
  const recorder = createKillcamRecorder();
  recordWindow(recorder, world, 1, 300);
  clearKillcamTape(); // reset the session, then refill it through the sealed path
  // Refill the session recorder through the system-shaped seam:
  refillSession(world);
  try {
    assert.deepEqual(killcamStageRequestFor({ settings: { video: { motionReduce: false } } }),
      { scene: 'crucible-killcam' });
    // Reduced motion defaults to skipped/still — no request at all.
    assert.equal(killcamStageRequestFor({ settings: { video: { motionReduce: true } } }), null);
    // The visible SKIP latches: the still comes back and stays back.
    skipKillcamPlayback();
    assert.equal(killcamPlaybackSkipped(), true);
    assert.equal(killcamStageRequestFor({ settings: { video: { motionReduce: false } } }), null);
  } finally {
    clearKillcamTape();
    assert.equal(killcamPlaybackSkipped(), false, 'clear resets the skip latch');
  }
});

function refillSession(world) {
  // The session recorder is fed by the registry system in the live game; drive it the
  // same way here so the request gate reads a real sealed tape.
  killcamRecorder.init({ state: world.state, bus: createBus() });
  for (let tick = 1; tick <= 300; tick++) {
    world.stepTo(tick);
    killcamRecorder.update(1 / 60, world.state);
  }
  killcamRecorder.destroy();
}
