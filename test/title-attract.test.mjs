// LIVE TITLE — build_map.md §25 "Zero to hero", Phase 5.2.
//
// What this file proves:
//   1. The attract world is a REAL fight: ships move, weapons fire, hulls die.
//   2. It is deterministic: same seed, same tape — the committed replay module
//      (src/sim/titleAttractTapeData.js) byte-matches a fresh bake or the test fails.
//   3. The title gate holds: nothing steps before start(), the menu arms the live
//      scene only after the idle window, reduced motion never arms it, and every
//      teardown path (pick / hide / dispose) drops the flag and stops the world.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createTitleAttractWorld, TITLE_ATTRACT_SEED } from '../src/sim/titleAttract.js';
import {
  createTapeRecorder,
  encodeTape,
  decodeTape,
  hashEncodedTape,
  TITLE_ATTRACT_TAPE_SCHEMA,
  TAPE_DURATION_TICKS,
} from '../src/sim/titleAttractTape.js';
import { TITLE_ATTRACT_TAPE } from '../src/sim/titleAttractTapeData.js';
import { mainMenuScreen } from '../src/ui/screens/mainMenu.js';

// ---------------------------------------------------------------------------
// The world itself: gate, fight, determinism, teardown.
// ---------------------------------------------------------------------------

test('attract world does not step before start()', () => {
  const world = createTitleAttractWorld({ seed: TITLE_ATTRACT_SEED });
  assert.equal(world.advance(0.5), 0);
  assert.equal(world.tick, 0);
  world.dispose();
});

test('attract world runs a real fight: movement, shots, kills', () => {
  const world = createTitleAttractWorld({ seed: TITLE_ATTRACT_SEED });
  world.start();
  const before = world.sample(1).filter((e) => e.type === 'ship');
  world.runTicks(150); // 2.5 s — hulls that live this long must have moved
  const mid = world.sample(1).filter((e) => e.type === 'ship');
  const sharedMoved = mid.some((e) => {
    const prev = before.find((b) => b.id === e.id);
    return prev && (Math.abs(prev.x - e.x) > 0.5 || Math.abs(prev.z - e.z) > 0.5);
  });
  const rosterChanged = mid.some((e) => !before.find((b) => b.id === e.id));
  assert.ok(sharedMoved || rosterChanged, 'no ship moved and none spawned — the tape would be a still');
  world.runTicks(750); // 15 s of fight total
  const counts = world.counts();
  assert.ok(counts.ships >= 3, `expected a living fight, got ${counts.ships} ships`);
  assert.ok(counts.fired > 20, `expected real gunfire, got ${counts.fired} shots`);
  assert.ok(counts.kills > 0, 'expected at least one kill in 15 s of Crucible');
  world.dispose();
});

test('attract world is deterministic at fixed seed', () => {
  const a = createTitleAttractWorld({ seed: TITLE_ATTRACT_SEED });
  const b = createTitleAttractWorld({ seed: TITLE_ATTRACT_SEED });
  a.start(); b.start();
  a.runTicks(600); b.runTicks(600);
  assert.deepEqual(b.sample(1), a.sample(1));
  a.dispose(); b.dispose();
});

test('dispose stops the world cold', () => {
  const world = createTitleAttractWorld({ seed: TITLE_ATTRACT_SEED });
  world.start();
  world.runTicks(60);
  world.dispose();
  assert.equal(world.running, false);
  assert.equal(world.advance(1), 0);
  assert.equal(world.tick, 60);
});

// ---------------------------------------------------------------------------
// The tape: record → encode → decode, and the committed module's staleness gate.
// ---------------------------------------------------------------------------

test('tape recorder captures ship lives and shots', () => {
  const world = createTitleAttractWorld({ seed: TITLE_ATTRACT_SEED });
  world.start();
  const recorder = createTapeRecorder({ ticks: 600, seed: TITLE_ATTRACT_SEED });
  while (world.tick < 600) { world.runTicks(1); if (!recorder.tick(world.state)) break; }
  const tape = recorder.finish(world.state);
  world.dispose();
  assert.equal(tape.schema, TITLE_ATTRACT_TAPE_SCHEMA);
  assert.ok(tape.ships.length > 0, 'no ship lives recorded');
  assert.ok(tape.shots.length > 0, 'no shots recorded');
  const encoded = encodeTape(tape);
  const decoded = decodeTape(encoded);
  assert.ok(decoded.ships.length > 0 && decoded.shots.count > 0);
  const ship = decoded.ships[0];
  assert.ok(ship.n > 0 && ship.x.length === ship.n && ship.z.length === ship.n);
});

test('the committed replay tape matches a fresh bake of the seeded fight', () => {
  // THE determinism gate: if roster, seed, or any of the five systems moved the
  // fight, this bake diverges from src/sim/titleAttractTapeData.js — re-bake with
  // `node scripts/bake-title-attract.mjs` after reviewing the semantic change.
  const world = createTitleAttractWorld({ seed: TITLE_ATTRACT_SEED });
  world.start();
  const recorder = createTapeRecorder({ ticks: TAPE_DURATION_TICKS, seed: TITLE_ATTRACT_SEED });
  let keepGoing = true;
  while (keepGoing) {
    world.runTicks(1);
    keepGoing = recorder.tick(world.state);
  }
  const tape = recorder.finish(world.state);
  world.dispose();
  const encoded = encodeTape(tape);
  assert.equal(hashEncodedTape(encoded), hashEncodedTape(TITLE_ATTRACT_TAPE));
  assert.deepEqual(encoded, TITLE_ATTRACT_TAPE);
});

test('committed tape decodes to a playable fight window', () => {
  const decoded = decodeTape(TITLE_ATTRACT_TAPE);
  assert.equal(decoded.seed, TITLE_ATTRACT_SEED);
  assert.equal(decoded.ticks, TAPE_DURATION_TICKS);
  assert.ok(decoded.ships.length >= 10, `expected many ship lives over a minute, got ${decoded.ships.length}`);
  assert.ok(decoded.shots.count > 100, `expected a busy fight, got ${decoded.shots.count} shots`);
  // Every ship life names a visual the stage can resolve, and its channels line up.
  for (const ship of decoded.ships) {
    assert.ok(ship.visual, 'ship life without a visual id');
    assert.equal(ship.x.length, ship.n);
    assert.equal(ship.z.length, ship.n);
    assert.equal(ship.r.length, ship.n);
    assert.ok(ship.died > ship.born);
  }
});

// ---------------------------------------------------------------------------
// The menu's arming contract: stage spec swap, idle gate, motion gate, teardown.
// ---------------------------------------------------------------------------

function fakeCtx() {
  const calls = { syncVisibility: 0, pushed: [] };
  const mgr = {
    hasScreen: () => true,
    pushScreen: (id) => { calls.pushed.push(id); },
    syncVisibility: () => { calls.syncVisibility++; },
  };
  const ctx = {
    screenManager: mgr,
    bus: { emit() {}, on() { return () => {}; } },
    registry: { get: () => null },
    state: { settings: { video: {} } },
  };
  return { ctx, calls };
}

test('stage spec: still by default, live scene only once armed', () => {
  mainMenuScreen._attractLive = false;
  assert.equal(mainMenuScreen.stage({}).scene, 'title-field');
  mainMenuScreen._attractLive = true;
  assert.equal(mainMenuScreen.stage({}).scene, 'title-attract');
  mainMenuScreen._attractLive = false;
});

test('idle gate arms the live title only after the idle window', () => {
  const rafQueue = [];
  const oldRaf = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  try {
    const { ctx, calls } = fakeCtx();
    const rootEl = { dataset: {} };
    mainMenuScreen._attractLive = false;
    mainMenuScreen._startIdleAttract({ ctx, state: ctx.state, rootEl });
    const pump = (ms) => {
      const cbs = rafQueue.splice(0);
      for (const cb of cbs) cb(ms);
    };
    pump(0);
    pump(4000);
    assert.equal(rootEl.dataset.attract, undefined, 'attract armed before the idle window');
    assert.equal(mainMenuScreen._attractLive, false);
    pump(13_000);
    assert.equal(rootEl.dataset.attract, '1', 'attract did not arm after the idle window');
    assert.equal(mainMenuScreen._attractLive, true, 'stage spec never swapped to the live scene');
    assert.ok(calls.syncVisibility > 0, 'arming never re-resolved the stage request');
    mainMenuScreen._stopIdleAttract();
    assert.equal(mainMenuScreen._attractLive, false);
    assert.equal(rootEl.dataset.attract, undefined);
  } finally {
    globalThis.requestAnimationFrame = oldRaf;
    globalThis.cancelAnimationFrame = oldCancel;
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
  }
});

test('reduced motion never arms the live title', () => {
  const rafQueue = [];
  const oldRaf = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.document = { addEventListener() {}, removeEventListener() {} };
  try {
    const { ctx } = fakeCtx();
    ctx.state.settings.video.motionReduce = true;
    const rootEl = { dataset: {} };
    mainMenuScreen._startIdleAttract({ ctx, state: ctx.state, rootEl });
    for (const cb of rafQueue.splice(0)) cb(0);
    for (const cb of rafQueue.splice(0)) cb(60_000);
    assert.equal(rootEl.dataset.attract, undefined);
    assert.equal(mainMenuScreen._attractLive, false);
    mainMenuScreen._stopIdleAttract();
  } finally {
    globalThis.requestAnimationFrame = oldRaf;
    globalThis.cancelAnimationFrame = oldCancel;
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
  }
});

test('picking any menu action drops the live title', () => {
  const { ctx } = fakeCtx();
  mainMenuScreen._attractLive = true;
  mainMenuScreen._pick(ctx, 'settings');
  assert.equal(mainMenuScreen._attractLive, false);
});
