import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureActivityClassified,
  setClassifyFrameQuietRetainForBench,
  setClassifyEarlyQuietLatchForBench,
  getClassifyEarlyQuietLatchForBench,
} from '../src/world/activityRuntime.js';

function makeWorld(rockCount = 24) {
  const rocks = [];
  for (let i = 0; i < rockCount; i++) {
    const a = (i / rockCount) * Math.PI * 2;
    const r = 80 + (i % 7) * 30;
    rocks.push({
      id: 200 + i,
      type: 'asteroid',
      alive: true,
      pos: { x: Math.cos(a) * r, z: Math.sin(a) * r },
      vel: { x: 0, z: 0 },
      radius: 10,
      data: {},
      flags: {},
    });
  }
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    isPlayer: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    maxSpeed: 120,
    data: { combat: {} },
    flags: {},
  };
  const entities = new Map([[1, player], ...rocks.map((r) => [r.id, r])]);
  return {
    tick: 1,
    simTime: 1,
    playerId: 1,
    entities,
    entityList: [player, ...rocks],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version: 1,
      physicsStaticVersion: 1,
      projectiles: [],
      closedFormMovers: [],
    },
    camera: { zoom: 144, tilt: 60 },
    settings: { video: { fov: 50 } },
    runtime: { profileId: 'production' },
    rocks,
    player,
  };
}

function step(state) {
  state.tick = (state.tick | 0) + 1;
  state.simTime = (state.simTime || 0) + 1 / 60;
  return ensureActivityClassified(state);
}

function warmQuiet(state) {
  setClassifyFrameQuietRetainForBench(true);
  setClassifyEarlyQuietLatchForBench(true);
  let mode = null;
  for (let i = 0; i < 12; i++) mode = step(state).classifyMode;
  return mode;
}

test('early quiet latch arms after frame-retain on parked disc', () => {
  const state = makeWorld();
  const mode = warmQuiet(state);
  assert.equal(mode, 'early-quiet-latch');
  assert.equal(getClassifyEarlyQuietLatchForBench(), true);
  const glass = state.activityRuntime && state.activityRuntime.glassCount;
  assert.ok(Number.isFinite(glass));
});

test('early quiet latch skips visit work while keys hold', () => {
  const state = makeWorld();
  warmQuiet(state);
  const rt = step(state);
  assert.equal(rt.classifyMode, 'early-quiet-latch');
  assert.equal(rt.classifyVisits, 0);
});

test('player move wakes early quiet latch', () => {
  const state = makeWorld();
  warmQuiet(state);
  assert.equal(step(state).classifyMode, 'early-quiet-latch');
  state.player.pos.x += 40;
  const woke = step(state);
  assert.notEqual(woke.classifyMode, 'early-quiet-latch');
});

test('membership bump wakes early quiet latch', () => {
  const state = makeWorld();
  warmQuiet(state);
  assert.equal(step(state).classifyMode, 'early-quiet-latch');
  state.entityIndex.version += 1;
  const woke = step(state);
  assert.notEqual(woke.classifyMode, 'early-quiet-latch');
});

test('mining pin intent wakes early quiet latch', () => {
  const state = makeWorld();
  warmQuiet(state);
  assert.equal(step(state).classifyMode, 'early-quiet-latch');
  // mining.js _setLockTargetId writes the player RECORD (state.player.miningTargetId), never
  // the entity's .data — the pin must wake on the record write (D173).
  state.player.miningTargetId = state.rocks[0].id;
  const woke = step(state);
  assert.notEqual(woke.classifyMode, 'early-quiet-latch');
});

test('an entity-data mining write is a dead location and does not wake the latch', () => {
  const state = makeWorld();
  warmQuiet(state);
  assert.equal(step(state).classifyMode, 'early-quiet-latch');
  // D173: production never writes entity.data.miningTargetId — a write there must not
  // pretend to arm the pin (it used to pass while the real record write slept).
  state.player.data.miningTargetId = state.rocks[0].id;
  const held = step(state);
  assert.equal(held.classifyMode, 'early-quiet-latch');
  state.player.miningTargetId = state.player.data.miningTargetId;
  const woke = step(state);
  assert.notEqual(woke.classifyMode, 'early-quiet-latch');
});

test('dock pin wakes on state.ui.dockedStationId, never on the dead entity-data locations', () => {
  const state = makeWorld();
  warmQuiet(state);
  assert.equal(step(state).classifyMode, 'early-quiet-latch');
  // D174: production never writes player.data.dockTargetId / player.data.dockStationId /
  // player.flags.dockStationId — writes there must not pretend to arm the pin.
  state.player.data.dockTargetId = 77;
  state.player.flags.dockStationId = 'station_dead';
  assert.equal(step(state).classifyMode, 'early-quiet-latch');
  // The live record: uiRoot writes state.ui.dockedStationId on dock.
  state.ui = { docked: true, dockedStationId: 'station_ceres' };
  const woke = step(state);
  assert.notEqual(woke.classifyMode, 'early-quiet-latch');
});

test('dock pin names the resolved station entity through entityIndex.byStationId', () => {
  const state = makeWorld();
  const berth = {
    id: 900, type: 'station', alive: true,
    pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 }, radius: 40,
    data: { stationId: 'station_berth' }, flags: {},
  };
  state.entities.set(berth.id, berth);
  state.entityList.push(berth);
  state.entityIndex.byStationId = new Map([['station_berth', berth]]);
  state.ui = { docked: true, dockedStationId: 'station_berth' };
  const mode = warmQuiet(state);
  assert.equal(mode, 'early-quiet-latch');
  // Rematerialize under a new id — the pin follows the live record, not a stale entity id.
  berth.alive = false;
  state.entities.delete(berth.id);
  const berth2 = { ...berth, id: 901 };
  state.entities.set(berth2.id, berth2);
  state.entityIndex.byStationId.set('station_berth', berth2);
  // No membership bump: the wake must come from the dock pin following the new carrier.
  const woke = step(state);
  assert.notEqual(woke.classifyMode, 'early-quiet-latch');
});

test('customs hail pin wakes on state.ui.customsPrompt.patrolId', () => {
  const state = makeWorld();
  warmQuiet(state);
  assert.equal(step(state).classifyMode, 'early-quiet-latch');
  // D174: state.comms.hailTargetId / state.ui.hailTargetId have no writers — the live hail
  // record is the customs scan prompt's patrol entity (lawSecurity emits patrol.id).
  state.ui = { customsPrompt: { factionId: 'ceres_authority', patrolId: 42, t: 1, signalTick: 1 } };
  const woke = step(state);
  assert.notEqual(woke.classifyMode, 'early-quiet-latch');
});

test('missile-lock pin wakes on combat.lockTarget', () => {
  const state = makeWorld();
  warmQuiet(state);
  assert.equal(step(state).classifyMode, 'early-quiet-latch');
  // D174: weapons.js writes player.data.combat.lockTarget on lock acquisition — the latch
  // previously read combat.targetId ?? data.targetId and slept through it.
  state.player.data.combat.lockTarget = state.rocks[0].id;
  const woke = step(state);
  assert.notEqual(woke.classifyMode, 'early-quiet-latch');
});

test('bench toggle disables early quiet latch', () => {
  const state = makeWorld();
  setClassifyFrameQuietRetainForBench(true);
  setClassifyEarlyQuietLatchForBench(false);
  let mode = null;
  for (let i = 0; i < 12; i++) mode = step(state).classifyMode;
  assert.notEqual(mode, 'early-quiet-latch');
  // frame-retain may still arm
  assert.ok(mode === 'frame-retain' || mode === 'incremental' || mode === 'full');
  setClassifyEarlyQuietLatchForBench(true);
});

test('flying player never early-latches', () => {
  const state = makeWorld();
  state.player.vel.x = 40;
  setClassifyFrameQuietRetainForBench(true);
  setClassifyEarlyQuietLatchForBench(true);
  let sawEarly = false;
  for (let i = 0; i < 20; i++) {
    if (step(state).classifyMode === 'early-quiet-latch') sawEarly = true;
  }
  assert.equal(sawEarly, false);
});

test('rock pose jump wakes early quiet latch', () => {
  const state = makeWorld();
  warmQuiet(state);
  assert.equal(step(state).classifyMode, 'early-quiet-latch');
  const rock = state.rocks[0];
  const before = rock.activity && rock.activity.presentationTier;
  rock.pos.x += 500;
  const woke = step(state);
  assert.notEqual(woke.classifyMode, 'early-quiet-latch');
  const after = rock.activity && rock.activity.presentationTier;
  assert.notEqual(after, before, 'pose jump must reclassify presentation tier');
});
