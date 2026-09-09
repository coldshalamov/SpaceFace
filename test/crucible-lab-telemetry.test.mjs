import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CRUCIBLE_LAB_TELEMETRY_KEYS,
  CRUCIBLE_LAB_TELEMETRY_REFRESH_MS,
  mountCrucibleLabTelemetry,
  readCrucibleLabTelemetry,
} from '../src/ui/screens/crucibleLabTelemetry.js';

// Literal key set so a silently dropped row fails even if the production export is edited in lockstep.
const EXPECTED_KEYS = [
  'tick',
  'frameTimeMs',
  'renderTimeMs',
  'entityCount',
  'liveHostiles',
  'liveProjectiles',
  'activeFields',
  'contacts',
  'spatialQueries',
  'spawnBudgetCurrent',
  'spawnBudgetMax',
];

function fakeBus() {
  const events = [];
  return {
    events,
    emit(type, payload) { events.push({ type, payload }); },
    on() { return () => {}; },
  };
}

function fakeBudget({ current = 0, max = 24 } = {}) {
  let used = current;
  let cap = max;
  return {
    current() { return used; },
    max() { return cap; },
    available() { return Math.max(0, cap - used); },
    ownerForEntity() { return null; },
    setCurrent(value) { used = value; },
    setMax(value) { cap = value; },
  };
}

function makePlayer(id = 1) {
  return { id, type: 'ship', team: 0, alive: true };
}

function makeHostile(id) {
  return { id, type: 'ship', team: 1, alive: true, data: { encounter: true } };
}

function makeNeutralPatrol(id) {
  return { id, type: 'ship', team: 2, alive: true, data: { ai: { passive: true } } };
}

function makeAsteroid(id) {
  return { id, type: 'asteroid', team: 0, alive: true };
}

function statePlain(state) {
  return JSON.parse(JSON.stringify({
    tick: state.tick,
    entityList: state.entityList,
    entityIndex: state.entityIndex && {
      projectiles: state.entityIndex.projectiles,
    },
    fields: state.fields,
    physicsRuntime: state.physicsRuntime,
    spatialHash: state.spatialHash && {
      diagnostics: state.spatialHash.diagnostics,
    },
    spawnBudget: state.spawnBudget,
    mode: state.mode,
    playerId: state.playerId,
  }));
}

function makeCtx(overrides = {}) {
  const bus = overrides.bus || fakeBus();
  const budget = overrides.budget || fakeBudget({
    current: overrides.budgetCurrent ?? 4,
    max: overrides.budgetMax ?? 24,
  });
  const playerId = overrides.playerId ?? 1;
  const player = overrides.player || makePlayer(playerId);
  const entityList = overrides.entityList || [
    { id: 1, type: 'ship', alive: true },
    { id: 2, type: 'ship', alive: true },
    { id: 3, type: 'projectile', alive: true },
    { id: 4, type: 'station', alive: false },
  ];
  const projectiles = overrides.projectiles || [
    { id: 3, type: 'projectile', alive: true },
    { id: 7, type: 'projectile', alive: true },
  ];
  const snapshot = overrides.fieldSnapshot || [
    { id: 'field.well.1' },
    { id: 'field.cone.1' },
  ];
  const frameSample = overrides.frameSample || {
    frameDtMs: overrides.frameDtMs ?? 16.5,
    renderMs: overrides.renderMs ?? 4.25,
  };
  const entities = overrides.entities || new Map([[playerId, player]]);
  const state = {
    tick: overrides.tick ?? 120,
    mode: overrides.mode ?? 'flight',
    playerId,
    entities,
    entityList,
    entityIndex: overrides.entityIndex === null
      ? null
      : { projectiles },
    fields: overrides.fields === null
      ? null
      : { snapshot },
    physicsRuntime: overrides.physicsRuntime === null
      ? null
      : {
        diagnostics: {
          rapierContacts: overrides.contacts ?? 6,
        },
      },
    spatialHash: overrides.spatialHash === null
      ? null
      : {
        diagnostics: {
          queries: overrides.spatialQueries ?? 12,
        },
      },
    perfRuntime: overrides.perfRuntime === undefined
      ? {
        readFrameSample(out = {}) {
          out.frameDtMs = frameSample.frameDtMs;
          out.renderMs = frameSample.renderMs;
          return out;
        },
      }
      : overrides.perfRuntime,
    ...overrides.state,
  };
  const ctx = {
    state,
    bus,
    helpers: { spawnBudget: budget, ...(overrides.helpers || {}) },
    registry: overrides.registry === undefined ? { get() { return null; } } : overrides.registry,
    ...overrides.ctx,
  };
  return { ctx, bus, budget, state, frameSample };
}

function assertKeySet(snapshot) {
  assert.deepEqual(Object.keys(snapshot), EXPECTED_KEYS);
  assert.deepEqual(CRUCIBLE_LAB_TELEMETRY_KEYS, EXPECTED_KEYS);
}

function assertNumericOrNull(snapshot) {
  for (const key of EXPECTED_KEYS) {
    const value = snapshot[key];
    assert.notEqual(value, undefined, `${key} must not be undefined`);
    if (value !== null) {
      assert.equal(typeof value, 'number', `${key} must be a number or null`);
      assert.equal(Number.isFinite(value), true, `${key} must be finite or null`);
      assert.equal(Number.isNaN(value), false, `${key} must not be NaN`);
    }
  }
}

function assertAllNull(snapshot) {
  assertKeySet(snapshot);
  assertNumericOrNull(snapshot);
  for (const key of EXPECTED_KEYS) {
    assert.equal(snapshot[key], null, `${key} must be null when there is no live game`);
  }
}

function makeDocumentTree() {
  function createElement() {
    const node = {
      style: {},
      children: [],
      textContent: '',
      setAttribute() {},
      appendChild(child) {
        node.children.push(child);
        return child;
      },
    };
    return node;
  }
  const host = {
    children: [],
    appendChild(child) {
      host.children.push(child);
      return child;
    },
  };
  return { document: { createElement }, host };
}

function paintedValues(host) {
  const root = host.children[0];
  const values = {};
  for (let i = 1; i < root.children.length; i++) {
    const row = root.children[i];
    values[row.children[0].textContent] = row.children[1].textContent;
  }
  return values;
}

test('readCrucibleLabTelemetry returns a JSON-round-trippable snapshot with a stable key set', () => {
  const { ctx } = makeCtx();
  const snapshot = readCrucibleLabTelemetry(ctx);
  assert.equal(typeof snapshot, 'object');
  assert.equal(Array.isArray(snapshot), false);
  assertKeySet(snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  assertNumericOrNull(snapshot);
});

test('overlay reports exact values from spawn budget, entity list, field snapshot, and other owners', () => {
  const player = makePlayer(1);
  const hostile = makeHostile(2);
  const { ctx, budget } = makeCtx({
    tick: 42,
    playerId: 1,
    entities: new Map([[1, player]]),
    budgetCurrent: 7,
    budgetMax: 24,
    entityList: [player, hostile, makeNeutralPatrol(3), makeAsteroid(4), { id: 5 }],
    projectiles: [{ id: 10 }, { id: 11 }, { id: 12 }],
    fieldSnapshot: [{ id: 'a' }, { id: 'b' }],
    contacts: 9,
    spatialQueries: 18,
    frameDtMs: 18.25,
    renderMs: 5.5,
  });

  const first = readCrucibleLabTelemetry(ctx);
  assert.equal(first.tick, 42);
  assert.equal(first.frameTimeMs, 18.25);
  assert.equal(first.renderTimeMs, 5.5);
  assert.equal(first.entityCount, 5);
  assert.equal(first.liveHostiles, 1);
  assert.equal(first.liveProjectiles, 3);
  assert.equal(first.activeFields, 2);
  assert.equal(first.contacts, 9);
  assert.equal(first.spatialQueries, 18);
  assert.equal(first.spawnBudgetCurrent, 7);
  assert.equal(first.spawnBudgetMax, 24);

  budget.setCurrent(11);
  const afterBudget = readCrucibleLabTelemetry(ctx);
  assert.equal(afterBudget.liveHostiles, 1);
  assert.equal(afterBudget.spawnBudgetCurrent, 11);
  assert.equal(afterBudget.entityCount, 5);
  assert.equal(afterBudget.liveProjectiles, 3);
  assert.equal(afterBudget.activeFields, 2);

  ctx.state.entityList.push({ id: 6, alive: false }, { id: 7, alive: true });
  const afterList = readCrucibleLabTelemetry(ctx);
  assert.equal(afterList.entityCount, 7);
  assert.equal(afterList.liveHostiles, 1);

  ctx.state.fields.snapshot.push({ id: 'c' });
  const afterFields = readCrucibleLabTelemetry(ctx);
  assert.equal(afterFields.activeFields, 3);

  ctx.state.entityIndex.projectiles.pop();
  const afterProjectiles = readCrucibleLabTelemetry(ctx);
  assert.equal(afterProjectiles.liveProjectiles, 2);

  budget.setMax(40);
  const afterMax = readCrucibleLabTelemetry(ctx);
  assert.equal(afterMax.spawnBudgetMax, 40);
  assert.equal(afterMax.spawnBudgetCurrent, 11);
});

test('liveHostiles counts isHostileToPlayer entities, not spawn-budget slots', () => {
  const player = makePlayer(1);
  const hostile = makeHostile(2);
  const patrol = makeNeutralPatrol(3);
  const asteroid = makeAsteroid(4);
  const { ctx, budget } = makeCtx({
    playerId: 1,
    entities: new Map([[1, player]]),
    entityList: [player, hostile, patrol, asteroid],
    budgetCurrent: 7,
  });

  const first = readCrucibleLabTelemetry(ctx);
  assert.equal(first.liveHostiles, 1);
  assert.equal(first.spawnBudgetCurrent, 7);

  ctx.state.entityList.push(makeHostile(5));
  const second = readCrucibleLabTelemetry(ctx);
  assert.equal(second.liveHostiles, 2);
  assert.equal(second.spawnBudgetCurrent, 7);

  budget.setCurrent(9);
  const afterBudget = readCrucibleLabTelemetry(ctx);
  assert.equal(afterBudget.liveHostiles, 2);
  assert.equal(afterBudget.spawnBudgetCurrent, 9);
});

test('every telemetry row moves when its source is mutated', () => {
  const player = makePlayer(1);
  const hostile = makeHostile(2);
  const { ctx, budget, frameSample } = makeCtx({
    tick: 10,
    playerId: 1,
    entities: new Map([[1, player]]),
    entityList: [player, hostile],
    projectiles: [{ id: 10 }, { id: 11 }],
    fieldSnapshot: [{ id: 'a' }],
    contacts: 3,
    spatialQueries: 8,
    budgetCurrent: 4,
    budgetMax: 24,
    frameDtMs: 16.5,
    renderMs: 4.25,
  });

  const first = readCrucibleLabTelemetry(ctx);
  assertKeySet(first);

  const mutations = {
    tick() { ctx.state.tick = 11; },
    frameTimeMs() { frameSample.frameDtMs = 20; },
    renderTimeMs() { frameSample.renderMs = 6; },
    entityCount() { ctx.state.entityList.push(makeAsteroid(90)); },
    liveHostiles() { ctx.state.entityList.push(makeHostile(91)); },
    liveProjectiles() { ctx.state.entityIndex.projectiles.push({ id: 12 }); },
    activeFields() { ctx.state.fields.snapshot.push({ id: 'b' }); },
    contacts() { ctx.state.physicsRuntime.diagnostics.rapierContacts = 9; },
    spatialQueries() { ctx.state.spatialHash.diagnostics.queries = 15; },
    spawnBudgetCurrent() { budget.setCurrent(9); },
    spawnBudgetMax() { budget.setMax(30); },
  };

  assert.deepEqual(Object.keys(mutations), EXPECTED_KEYS);

  for (const key of EXPECTED_KEYS) {
    assert.equal(typeof mutations[key], 'function', `missing mutation case for ${key}`);
  }

  for (const key of EXPECTED_KEYS) mutations[key]();

  const second = readCrucibleLabTelemetry(ctx);
  assertKeySet(second);
  assertNumericOrNull(second);
  for (const key of EXPECTED_KEYS) {
    assert.notEqual(second[key], first[key], `${key} must move with its source`);
    assert.equal(typeof second[key], 'number', `${key} must remain numeric after mutation`);
  }
});

test('reader does not write state or emit on the bus', () => {
  const { ctx, bus, state } = makeCtx();
  const before = statePlain(state);
  const beforeEvents = bus.events.slice();
  readCrucibleLabTelemetry(ctx);
  assert.deepEqual(statePlain(state), before);
  assert.deepEqual(bus.events, beforeEvents);
});

test('missing registry, missing systems, or no live game returns the same keys with nulls and does not throw', () => {
  const cases = [
    undefined,
    null,
    {},
    { bus: fakeBus() },
    { state: {}, bus: fakeBus() },
    { state: { mode: 'menu', playerId: 0 }, bus: fakeBus(), helpers: {} },
    { state: { tick: 3 }, registry: null, helpers: {}, bus: fakeBus() },
  ];
  for (const ctx of cases) {
    const snapshot = readCrucibleLabTelemetry(ctx);
    assertKeySet(snapshot);
    assertNumericOrNull(snapshot);
    assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  }

  const empty = readCrucibleLabTelemetry({});
  assertAllNull(empty);
});

test('liveness gate: no registry, no state, or menu playerId 0 is all-null; a live player is not gated', () => {
  const player = makePlayer(1);
  const liveState = {
    mode: 'flight',
    playerId: 1,
    tick: 3,
    entityList: [player],
    entities: new Map([[1, player]]),
  };

  const noRegistry = readCrucibleLabTelemetry({
    state: liveState,
    registry: null,
    helpers: {},
  });
  assertAllNull(noRegistry);

  const noState = readCrucibleLabTelemetry({
    registry: { get() { return null; } },
    helpers: {},
  });
  assertAllNull(noState);

  const menu = readCrucibleLabTelemetry({
    state: {
      mode: 'menu',
      playerId: 0,
      tick: 3,
      entityList: [],
      entities: new Map(),
    },
    registry: { get() { return null; } },
    helpers: {},
  });
  assertAllNull(menu);

  const live = readCrucibleLabTelemetry({
    state: liveState,
    registry: { get() { return null; } },
    helpers: {},
  });
  assertKeySet(live);
  assert.equal(live.tick, 3);
  assert.equal(live.entityCount, 1);
  assert.equal(live.liveHostiles, 0);
});

test('non-finite owner values become null, never NaN or undefined', () => {
  const { ctx, budget } = makeCtx({
    tick: Number.NaN,
    contacts: Number.POSITIVE_INFINITY,
    spatialQueries: Number.NaN,
    frameDtMs: Number.NaN,
    renderMs: Number.NEGATIVE_INFINITY,
  });
  budget.setCurrent(Number.NaN);
  budget.setMax(Number.POSITIVE_INFINITY);
  ctx.state.entityList = null;
  ctx.state.entityIndex.projectiles = null;
  ctx.state.fields.snapshot = undefined;

  const snapshot = readCrucibleLabTelemetry(ctx);
  assertKeySet(snapshot);
  assertNumericOrNull(snapshot);
  assert.equal(snapshot.tick, null);
  assert.equal(snapshot.frameTimeMs, null);
  assert.equal(snapshot.renderTimeMs, null);
  assert.equal(snapshot.entityCount, null);
  assert.equal(snapshot.liveHostiles, null);
  assert.equal(snapshot.liveProjectiles, null);
  assert.equal(snapshot.activeFields, null);
  assert.equal(snapshot.contacts, null);
  assert.equal(snapshot.spatialQueries, null);
  assert.equal(snapshot.spawnBudgetCurrent, null);
  assert.equal(snapshot.spawnBudgetMax, null);
});

test('non-positive frame and render samples read as unavailable, not zero', () => {
  const zero = makeCtx({ frameDtMs: 0, renderMs: 0 });
  const zeroSnap = readCrucibleLabTelemetry(zero.ctx);
  assert.equal(zeroSnap.frameTimeMs, null);
  assert.equal(zeroSnap.renderTimeMs, null);

  const negative = makeCtx({ frameDtMs: -1, renderMs: -0.5 });
  const negativeSnap = readCrucibleLabTelemetry(negative.ctx);
  assert.equal(negativeSnap.frameTimeMs, null);
  assert.equal(negativeSnap.renderTimeMs, null);

  const positive = makeCtx({ frameDtMs: 16.5, renderMs: 4.25 });
  const positiveSnap = readCrucibleLabTelemetry(positive.ctx);
  assert.equal(positiveSnap.frameTimeMs, 16.5);
  assert.equal(positiveSnap.renderTimeMs, 4.25);
});

test('zero timing samples paint as unavailable; a positive sample paints the number', () => {
  const previousDocument = globalThis.document;
  const previousSet = globalThis.setInterval;
  const previousClear = globalThis.clearInterval;
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};

  try {
    const zeroDom = makeDocumentTree();
    globalThis.document = zeroDom.document;
    const zero = makeCtx({ frameDtMs: 0, renderMs: 0 });
    const disposeZero = mountCrucibleLabTelemetry(zero.ctx, zeroDom.host);
    const zeroPainted = paintedValues(zeroDom.host);
    assert.equal(zeroPainted['Frame ms (sampled)'], '—');
    assert.equal(zeroPainted['Render ms (sampled)'], '—');
    disposeZero();

    const liveDom = makeDocumentTree();
    globalThis.document = liveDom.document;
    const live = makeCtx({ frameDtMs: 16.5, renderMs: 4.25 });
    const disposeLive = mountCrucibleLabTelemetry(live.ctx, liveDom.host);
    const livePainted = paintedValues(liveDom.host);
    assert.equal(livePainted['Frame ms (sampled)'], '16.5');
    assert.equal(livePainted['Render ms (sampled)'], '4.3');
    assert.equal(livePainted['Spatial-hash queries (cumulative)'], '12');
    assert.equal(livePainted['Live hostiles'], '0');
    disposeLive();
  } finally {
    globalThis.document = previousDocument;
    globalThis.setInterval = previousSet;
    globalThis.clearInterval = previousClear;
  }
});

test('refresh interval is a bounded 250 ms, not per-frame', () => {
  assert.equal(CRUCIBLE_LAB_TELEMETRY_REFRESH_MS, 250);
});

test('mount returns an idempotent disposer that clears its interval', () => {
  const created = [];
  const cleared = [];
  const previousSet = globalThis.setInterval;
  const previousClear = globalThis.clearInterval;
  const previousDocument = globalThis.document;
  let nextId = 1;
  globalThis.setInterval = (fn, ms) => {
    created.push({ fn, ms, id: nextId });
    return nextId++;
  };
  globalThis.clearInterval = (id) => { cleared.push(id); };
  globalThis.document = {
    createElement() {
      return {
        style: {},
        appendChild() { return this; },
        setAttribute() {},
        textContent: '',
      };
    },
  };

  try {
    const host = { appendChild() { return this; } };
    const { ctx } = makeCtx();
    const dispose = mountCrucibleLabTelemetry(ctx, host);
    assert.equal(typeof dispose, 'function');
    assert.equal(created.length, 1);
    assert.equal(created[0].ms, 250);
    dispose();
    assert.deepEqual(cleared, [1]);
    dispose();
    assert.deepEqual(cleared, [1]);
    if (typeof dispose.resume === 'function') dispose.resume();
    assert.equal(created.length, 2);
    dispose();
    assert.deepEqual(cleared, [1, 2]);
  } finally {
    globalThis.setInterval = previousSet;
    globalThis.clearInterval = previousClear;
    globalThis.document = previousDocument;
  }
});

test('mount without a document or host does not throw and still returns a disposer', () => {
  const previousDocument = globalThis.document;
  try {
    delete globalThis.document;
    assert.equal(typeof mountCrucibleLabTelemetry(null, null), 'function');
    mountCrucibleLabTelemetry(null, null)();
    const { ctx } = makeCtx();
    const dispose = mountCrucibleLabTelemetry(ctx, {});
    assert.equal(typeof dispose, 'function');
    dispose();
  } finally {
    globalThis.document = previousDocument;
  }
});
