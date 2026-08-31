import test from 'node:test';
import assert from 'node:assert/strict';

import { createPresentationRunner } from '../src/core/presentationRunner.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import {
  CLEAR_HARD_MAX,
  CRUCIBLE_LAB_SPEED_SOURCE,
  LEGAL_TIME_SCALES,
  applyCrucibleLabControl,
  mountCrucibleLabControls,
  requestClearEnemies,
  requestInvulnerable,
  requestRefill,
  requestStep,
  requestTimeScale,
} from '../src/ui/screens/crucibleLabControls.js';

function snapshot(value) {
  return structuredClone(value);
}

function snapshotEntities(state) {
  const out = {};
  if (!state || !state.entities || typeof state.entities.entries !== 'function') return out;
  for (const [id, entity] of state.entities.entries()) {
    out[String(id)] = snapshot(entity);
  }
  return out;
}

function snapshotBudgetOwners(budget) {
  if (!budget || !budget.owners || typeof budget.owners.entries !== 'function') return [];
  return [...budget.owners.entries()]
    .map(([id, owner]) => [String(id), owner])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function fakeBus() {
  const events = [];
  return {
    events,
    emit(type, payload) { events.push({ type, payload }); },
    on() { return () => {}; },
  };
}

function fakeBudget() {
  const owners = new Map();
  const released = [];
  return {
    owners,
    released,
    ownerForEntity(id) {
      if (id == null) return null;
      return owners.get(String(id)) || null;
    },
    bindEntity(id, owner) {
      if (id == null) return false;
      owners.set(String(id), owner);
      return true;
    },
    releaseEntity(id) {
      if (id == null) return 0;
      const key = String(id);
      if (!owners.has(key)) return 0;
      owners.delete(key);
      released.push(id);
      return 1;
    },
  };
}

function makePlayer(overrides = {}) {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    hull: 10,
    hullMax: 100,
    shield: 4,
    shieldMax: 40,
    cap: 2,
    capMax: 20,
    armorHp: 7,
    armorMax: 12,
    heat: 8,
    pos: { x: 1, z: 2 },
    flags: { boosting: false, docked: false, invuln: false, noInterp: false },
    data: {
      weapons: [
        { defId: 'gun_a', _heat: 55 },
        { defId: 'gun_b', _heat: 12 },
      ],
    },
    ...overrides,
  };
}

function makeCtx(overrides = {}) {
  const player = overrides.player || makePlayer();
  const station = { id: 2, type: 'station', alive: true, hull: 500, hullMax: 500 };
  const npc = { id: 3, type: 'ship', alive: true, hull: 30, hullMax: 30 };
  const labA = { id: 4, type: 'ship', alive: true, hull: 20, hullMax: 20 };
  const labB = { id: 5, type: 'ship', alive: true, hull: 20, hullMax: 20 };
  const extras = overrides.extraEntities || [];
  const entities = new Map([
    [player.id, player],
    [station.id, station],
    [npc.id, npc],
    [labA.id, labA],
    [labB.id, labB],
    ...extras.map((ent) => [ent.id, ent]),
  ]);
  const budget = overrides.budget || fakeBudget();
  if (!overrides.skipLabBind) {
    budget.bindEntity(labA.id, 'combat-lab:physics_swarm');
    budget.bindEntity(labB.id, 'combat-lab:physics_swarm');
  }
  const removed = [];
  const timeCalls = [];
  const bus = overrides.bus || fakeBus();
  const state = {
    playerId: player.id,
    timeScale: 1,
    player: { credits: 900, heat: 0.42, cargo: { items: { ore: 3 } } },
    economy: { markets: { station_helios: { credits: 1 } } },
    factions: { faction_scn: { standing: 2 } },
    run: { kind: 'lab', phase: 'active', seed: 7, score: 0 },
    entities,
    entityList: [...entities.values()],
    ...overrides.state,
  };
  if (overrides.run) state.run = overrides.run;
  const ctx = {
    state,
    bus,
    timeEffects: overrides.timeEffects || {
      set(source, request) {
        timeCalls.push({ op: 'set', source, request });
        return request && (request.scale != null ? request.scale : request.labSpeed);
      },
      clear(source) {
        timeCalls.push({ op: 'clear', source });
        return 1;
      },
      getEffectiveScale() { return state.timeScale; },
    },
    helpers: {
      removeEntity(id) {
        removed.push(id);
        entities.delete(id);
        if (Array.isArray(state.entityList)) {
          const idx = state.entityList.findIndex((ent) => ent && ent.id === id);
          if (idx >= 0) state.entityList.splice(idx, 1);
        }
      },
      spawnBudget: budget,
      ...(overrides.helpers || {}),
    },
    ...overrides.ctx,
  };
  return {
    ctx, player, station, npc, labA, labB, budget, removed, timeCalls, bus, state,
  };
}

function assertProtectedUnchanged(before, state, bus) {
  assert.deepEqual(state.player, before.player);
  assert.deepEqual(state.economy, before.economy);
  assert.deepEqual(state.factions, before.factions);
  assert.deepEqual(state.run, before.run);
  assert.deepEqual(snapshotEntities(state), before.entities);
  for (const event of bus.events) {
    assert.equal(String(event.type).startsWith('economy:'), false, event.type);
  }
}

function takeProtected(state) {
  return {
    player: snapshot(state.player),
    economy: snapshot(state.economy),
    factions: snapshot(state.factions),
    run: snapshot(state.run),
    entities: snapshotEntities(state),
  };
}

test('time-scale builder accepts 0.25 / 0.5 / 1 / 2 / 4 and rejects illegal speeds without throwing', () => {
  assert.deepEqual(LEGAL_TIME_SCALES, [0.25, 0.5, 1, 2, 4]);
  assert.deepEqual(requestTimeScale(0.25), { ok: true, kind: 'timeScale', scale: 0.25 });
  assert.deepEqual(requestTimeScale(0.5), { ok: true, kind: 'timeScale', scale: 0.5 });
  assert.deepEqual(requestTimeScale(1), { ok: true, kind: 'timeScale', scale: 1 });
  assert.deepEqual(requestTimeScale(2), { ok: true, kind: 'timeScale', scale: 2 });
  assert.deepEqual(requestTimeScale(4), { ok: true, kind: 'timeScale', scale: 4 });
  for (const scale of [0, 3, -1, 1.5, 8, '0.5', '2', null, undefined, NaN, Infinity]) {
    const result = requestTimeScale(scale);
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'timeScale');
  }
});

test('clear-enemies builder never throws on garbage input', () => {
  assert.equal(requestClearEnemies().ok, true);
  assert.deepEqual(requestClearEnemies(), { ok: true, kind: 'clearEnemies' });
});

test('slow speeds route through the scale channel; 2x/4x through labSpeed; 1x clears', () => {
  const { ctx, timeCalls } = makeCtx();
  assert.ok(applyCrucibleLabControl(ctx, requestTimeScale(0.25)));
  assert.deepEqual(timeCalls[0], {
    op: 'set',
    source: CRUCIBLE_LAB_SPEED_SOURCE,
    request: { scale: 0.25 },
  });
  assert.ok(applyCrucibleLabControl(ctx, requestTimeScale(0.5)));
  assert.deepEqual(timeCalls[1], {
    op: 'set',
    source: CRUCIBLE_LAB_SPEED_SOURCE,
    request: { scale: 0.5 },
  });
  assert.ok(applyCrucibleLabControl(ctx, requestTimeScale(2)));
  assert.deepEqual(timeCalls[2], {
    op: 'set',
    source: CRUCIBLE_LAB_SPEED_SOURCE,
    request: { labSpeed: 2 },
  });
  assert.ok(applyCrucibleLabControl(ctx, requestTimeScale(4)));
  assert.deepEqual(timeCalls[3], {
    op: 'set',
    source: CRUCIBLE_LAB_SPEED_SOURCE,
    request: { labSpeed: 4 },
  });
  assert.ok(applyCrucibleLabControl(ctx, requestTimeScale(1)));
  assert.deepEqual(timeCalls[4], { op: 'clear', source: CRUCIBLE_LAB_SPEED_SOURCE });
  assert.equal(timeCalls.some((call) => call.request && call.request.labSpeed === 1), false);
});

test('speed control routes through timeEffects and never writes timeScale itself', () => {
  const { ctx, state } = makeCtx();
  const effects = createTimeEffects(state);
  ctx.timeEffects = effects;
  const result = applyCrucibleLabControl(ctx, requestTimeScale(0.5));
  assert.ok(result);
  assert.equal(state.timeScale, 0.5);
  assert.equal(effects.getEffectiveScale(), 0.5);
  applyCrucibleLabControl(ctx, requestTimeScale(0.25));
  assert.equal(state.timeScale, 0.25);
  applyCrucibleLabControl(ctx, requestTimeScale(2));
  assert.equal(state.timeScale, 2);
  applyCrucibleLabControl(ctx, requestTimeScale(4));
  assert.equal(state.timeScale, 4);
  applyCrucibleLabControl(ctx, requestTimeScale(1));
  assert.equal(state.timeScale, 1);
  assert.equal(applyCrucibleLabControl(ctx, requestTimeScale(3)), false);
  assert.equal(state.timeScale, 1);
});

test('clear enemies uses removeEntity and spawn-budget release, never entity:killed', () => {
  const { ctx, bus, removed, budget, labA, labB, station, npc, player, state } = makeCtx();
  const result = applyCrucibleLabControl(ctx, requestClearEnemies());
  assert.ok(result);
  assert.equal(result.removed, 2);
  assert.equal(result.released, 2);
  assert.deepEqual([...removed].sort((a, b) => a - b), [labA.id, labB.id]);
  assert.deepEqual([...budget.released].sort((a, b) => a - b), [labA.id, labB.id]);
  assert.equal(result.released, removed.length);
  assert.equal(bus.events.some((event) => event.type === 'entity:killed'), false);
  assert.equal(player.alive, true);
  assert.equal(station.alive, true);
  assert.equal(npc.alive, true);
  assert.equal(state.entities.has(labA.id), false);
  assert.equal(state.entities.has(labB.id), false);
  assert.equal(state.entities.has(player.id), true);
});

test('clear never removes a station, the player, or an unbound NPC, and never exceeds HARD_MAX', () => {
  const extras = [];
  for (let i = 0; i < CLEAR_HARD_MAX + 5; i++) {
    extras.push({ id: 100 + i, type: 'ship', alive: true });
  }
  const { ctx, removed, budget, player, station, npc } = makeCtx({ extraEntities: extras });
  for (const ent of extras) budget.bindEntity(ent.id, 'combat-lab:flood');
  const result = applyCrucibleLabControl(ctx, requestClearEnemies());
  assert.equal(result.removed, CLEAR_HARD_MAX);
  assert.equal(result.released, CLEAR_HARD_MAX);
  assert.equal(removed.includes(player.id), false);
  assert.equal(removed.includes(station.id), false);
  assert.equal(removed.includes(npc.id), false);
  assert.equal(removed.length, CLEAR_HARD_MAX);
});

test('clear with no Lab-owned targets is a zero-remove success and leaves entities untouched', () => {
  const { ctx, state, bus, npc } = makeCtx({ skipLabBind: true });
  const before = takeProtected(state);
  const result = applyCrucibleLabControl(ctx, requestClearEnemies());
  assert.ok(result);
  assert.equal(result.removed, 0);
  assert.equal(result.released, 0);
  assert.equal(npc.hull, 30);
  assertProtectedUnchanged(before, state, bus);
});

test('a speed change writes nothing but timeScale, including the player entity', () => {
  const { ctx, state, bus } = makeCtx();
  const effects = createTimeEffects(state);
  ctx.timeEffects = effects;
  const before = takeProtected(state);
  for (const scale of [0.25, 0.5, 2, 4, 1]) {
    assert.ok(applyCrucibleLabControl(ctx, requestTimeScale(scale)));
    assert.equal(state.timeScale, scale);
    assertProtectedUnchanged(before, state, bus);
  }
  assert.equal(applyCrucibleLabControl(ctx, requestTimeScale(1.5)), false);
  assert.equal(state.timeScale, 1);
  assertProtectedUnchanged(before, state, bus);
});

test('clearing enemies changes only the removed entities and the budget ledger', () => {
  const { ctx, state, bus, budget, labA, labB, player } = makeCtx();
  const effects = createTimeEffects(state);
  ctx.timeEffects = effects;
  const before = takeProtected(state);
  const ownersBefore = snapshotBudgetOwners(budget);
  const timeScaleBefore = state.timeScale;
  const result = applyCrucibleLabControl(ctx, requestClearEnemies());
  assert.ok(result);
  assert.equal(result.removed, 2);
  assert.equal(state.timeScale, timeScaleBefore);
  assert.deepEqual(state.player, before.player);
  assert.deepEqual(state.economy, before.economy);
  assert.deepEqual(state.factions, before.factions);
  assert.deepEqual(state.run, before.run);
  assert.deepEqual(snapshot(state.entities.get(player.id)), before.entities[String(player.id)]);
  const afterEntities = snapshotEntities(state);
  assert.equal(Object.hasOwn(afterEntities, String(labA.id)), false);
  assert.equal(Object.hasOwn(afterEntities, String(labB.id)), false);
  const remainingBefore = { ...before.entities };
  delete remainingBefore[String(labA.id)];
  delete remainingBefore[String(labB.id)];
  assert.deepEqual(afterEntities, remainingBefore);
  const ownersAfter = snapshotBudgetOwners(budget);
  assert.equal(ownersAfter.some((row) => row[0] === String(labA.id)), false);
  assert.equal(ownersAfter.some((row) => row[0] === String(labB.id)), false);
  assert.notDeepEqual(ownersAfter, ownersBefore);
  for (const event of bus.events) {
    assert.equal(String(event.type).startsWith('economy:'), false, event.type);
  }
});

test('controls are inert with no player entity and never throw', () => {
  const { ctx, removed, timeCalls, bus } = makeCtx();
  ctx.state.playerId = 0;
  ctx.state.entities.delete(1);
  const requests = [
    requestTimeScale(0.25),
    requestTimeScale(0.5),
    requestTimeScale(1),
    requestTimeScale(2),
    requestTimeScale(4),
    requestClearEnemies(),
    requestRefill(),
    requestInvulnerable(true),
    requestStep(),
    { kind: 'nope' },
    { kind: 'pause' },
    { kind: 'refill' },
    { kind: 'invulnerable', enabled: true },
    { kind: 'step', steps: 1 },
    null,
    undefined,
  ];
  for (const request of requests) {
    assert.equal(applyCrucibleLabControl(ctx, request), false);
  }
  assert.deepEqual(removed, []);
  assert.deepEqual(timeCalls, []);
  assert.deepEqual(bus.events, []);
});

test('controls are inert in Adventure: they do not touch an unbound NPC', () => {
  const { ctx, removed, npc, timeCalls, state, bus } = makeCtx({
    run: { kind: 'adventure', phase: 'inactive', seed: 1, score: 0 },
    skipLabBind: true,
  });
  const before = takeProtected(state);
  assert.equal(applyCrucibleLabControl(ctx, requestClearEnemies()), false);
  assert.equal(applyCrucibleLabControl(ctx, requestTimeScale(0.25)), false);
  assert.equal(applyCrucibleLabControl(ctx, requestTimeScale(4)), false);
  assert.equal(applyCrucibleLabControl(ctx, requestRefill()), false);
  assert.equal(applyCrucibleLabControl(ctx, requestInvulnerable(true)), false);
  assert.equal(applyCrucibleLabControl(ctx, requestStep()), false);
  assert.deepEqual(removed, []);
  assert.equal(npc.hull, 30);
  assert.deepEqual(timeCalls, []);
  assertProtectedUnchanged(before, state, bus);
});

test('refill / invulnerable / step builders reject garbage without throwing', () => {
  assert.deepEqual(requestRefill(), { ok: true, kind: 'refill' });
  assert.deepEqual(requestStep(), { ok: true, kind: 'step' });
  assert.deepEqual(requestInvulnerable(true), { ok: true, kind: 'invulnerable', on: true });
  assert.deepEqual(requestInvulnerable(false), { ok: true, kind: 'invulnerable', on: false });
  for (const on of [0, 1, 'true', null, undefined, NaN]) {
    const result = requestInvulnerable(on);
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'invulnerable');
  }
});

test('refill emits debug:refillPlayer and writes no entity fields', () => {
  const { ctx, state, bus, player } = makeCtx();
  const before = takeProtected(state);
  const hullBefore = player.hull;
  const result = applyCrucibleLabControl(ctx, requestRefill());
  assert.ok(result);
  assert.deepEqual(bus.events, [{ type: 'debug:refillPlayer', payload: {} }]);
  assert.equal(player.hull, hullBefore);
  assert.equal(player.data.weapons[0]._heat, 55);
  assertProtectedUnchanged(before, state, bus);
});

test('invulnerable emits debug:invulnerable and writes no entity flags', () => {
  const { ctx, state, bus, player } = makeCtx();
  const before = takeProtected(state);
  const result = applyCrucibleLabControl(ctx, requestInvulnerable(true));
  assert.ok(result);
  assert.deepEqual(bus.events, [{ type: 'debug:invulnerable', payload: { on: true } }]);
  assert.equal(player.flags.invuln, false);
  assert.equal(Object.hasOwn(player, '_invulnUntil'), false);
  assertProtectedUnchanged(before, state, bus);
  assert.equal(applyCrucibleLabControl(ctx, requestInvulnerable('yes')), false);
});

test('step calls the ctx.simStep seam only while the screen holds the sim, and never writes timeScale', () => {
  const { ctx, state, player } = makeCtx();
  let calls = 0;
  ctx.simStep = () => {
    calls += 1;
    return true;
  };
  assert.equal(state.timeScale, 1);
  assert.equal(applyCrucibleLabControl(ctx, requestStep()), false);
  assert.equal(calls, 0);

  state.timeScale = 0;
  ctx.timeEffects.getEffectiveScale = () => state.timeScale;
  const hullBefore = player.hull;
  const result = applyCrucibleLabControl(ctx, requestStep());
  assert.ok(result);
  assert.equal(result.kind, 'step');
  assert.equal(calls, 1);
  assert.equal(state.timeScale, 0);
  assert.equal(player.hull, hullBefore);
});

test('step is a no-op without a simStep seam and does not emit pause or resume', () => {
  const { ctx, state, bus } = makeCtx();
  state.timeScale = 0;
  ctx.timeEffects.getEffectiveScale = () => 0;
  assert.equal(applyCrucibleLabControl(ctx, requestStep()), false);
  assert.deepEqual(bus.events, []);
});

test('step does not throw on a legacy or headless ctx that lacks simStep', () => {
  const { ctx, state } = makeCtx();
  state.timeScale = 0;
  ctx.timeEffects.getEffectiveScale = () => 0;
  delete ctx.simStep;
  assert.equal(applyCrucibleLabControl(ctx, requestStep()), false);
  assert.equal(applyCrucibleLabControl(null, requestStep()), false);
  assert.equal(applyCrucibleLabControl({}, requestStep()), false);
});

test('refill and invulnerable are inert when the Lab session is inactive', () => {
  const { ctx, bus, player } = makeCtx({
    run: { kind: 'lab', phase: 'inactive', seed: 7, score: 0 },
  });
  assert.equal(applyCrucibleLabControl(ctx, requestRefill()), false);
  assert.equal(applyCrucibleLabControl(ctx, requestInvulnerable(true)), false);
  assert.deepEqual(bus.events, []);
  assert.equal(player.hull, 10);
  assert.equal(player.flags.invuln, false);
});

function fakeDomNode() {
  const listeners = Object.create(null);
  const attrs = Object.create(null);
  const node = {
    className: '',
    style: {},
    children: [],
    textContent: '',
    title: '',
    type: '',
    disabled: false,
    value: '',
    classList: { add() {} },
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return Object.hasOwn(attrs, name) ? attrs[name] : null; },
    appendChild(child) {
      node.children.push(child);
      return child;
    },
    addEventListener(type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    click() {
      for (const fn of listeners.click || []) fn();
    },
  };
  return node;
}

function withFakeDocument(fn) {
  const previous = globalThis.document;
  globalThis.document = { createElement() { return fakeDomNode(); } };
  try {
    return fn();
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

function findRowChild(host, text) {
  const row = host.children[0];
  for (const child of row.children) {
    if (child.textContent === text) return child;
  }
  return null;
}

function mountLab(ctx) {
  const host = fakeDomNode();
  const handle = mountCrucibleLabControls(ctx, host);
  return { host, handle, stepBtn: findRowChild(host, 'Step') };
}

test('runtime help copy overrides the setup digest break-all rule', () => {
  withFakeDocument(() => {
    const { ctx } = makeCtx();
    const { host } = mountLab(ctx);
    const hint = host.children[1];
    assert.match(hint.className, /\bsf-lab-runtime-hint\b/);
  });
});

test('Lab Step click invokes ctx.simStep exactly once, and a missing seam is a no-op', () => {
  withFakeDocument(() => {
    const { ctx, state } = makeCtx();
    state.timeScale = 0;
    ctx.timeEffects.getEffectiveScale = () => 0;
    let calls = 0;
    ctx.simStep = () => {
      calls += 1;
      return true;
    };
    const { stepBtn } = mountLab(ctx);
    assert.equal(stepBtn.disabled, false);
    stepBtn.click();
    assert.equal(calls, 1);
    stepBtn.click();
    assert.equal(calls, 2);

    const { ctx: bare, state: bareState } = makeCtx();
    bareState.timeScale = 0;
    bare.timeEffects.getEffectiveScale = () => 0;
    const { stepBtn: bareBtn } = mountLab(bare);
    assert.equal(bareBtn.disabled, true);
    bareBtn.click();
    assert.equal(applyCrucibleLabControl(bare, requestStep()), false);
  });
});

test('Lab Step is disabled unless the screen-manager aggregate holds the sim', () => {
  withFakeDocument(() => {
    const { ctx, state } = makeCtx();
    ctx.simStep = () => true;
    const { stepBtn, handle } = mountLab(ctx);
    assert.equal(stepBtn.disabled, true, 'running sim: Step stays off');

    state.timeScale = 0;
    ctx.timeEffects.getEffectiveScale = () => 0;
    handle.refresh();
    assert.equal(stepBtn.disabled, false, 'held sim: Step turns on');

    state.timeScale = 1;
    ctx.timeEffects.getEffectiveScale = () => 1;
    handle.refresh();
    assert.equal(stepBtn.disabled, true, 'released sim: Step turns off');

    state.timeScale = 0;
    ctx.timeEffects.getEffectiveScale = () => 0;
    ctx.state.run = { kind: 'lab', phase: 'inactive', seed: 7, score: 0 };
    handle.refresh();
    assert.equal(stepBtn.disabled, true, 'inactive lab session: Step stays off');
  });
});

test('cached Lab controls refresh from an inactive mount into a live Lab session', () => {
  withFakeDocument(() => {
    const { ctx, state } = makeCtx({
      run: { kind: 'lab', phase: 'inactive', seed: 7, score: 0 },
    });
    const { host, handle } = mountLab(ctx);
    const invulnerable = findRowChild(host, 'Invulnerable: off');
    assert.equal(invulnerable.disabled, true, 'pre-launch session controls stay inert');

    state.run = { kind: 'lab', phase: 'active', seed: 7, score: 0 };
    handle.refresh();
    assert.equal(invulnerable.disabled, false, 'cached session controls rearm after the live Lab begins');
  });
});

function stubSimulationRunner(stepOnce) {
  const runner = {
    advance() { return { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 }; },
    prepareWithoutAdvance() { return { steps: 0, shedBacklog: false, shedSteps: 0, accumulator: 0 }; },
    consumeLatestCompletedTick() { return 0; },
    interpolationAlpha() { return 0; },
    setLifecycleGeneration() {},
    close() { return true; },
    getDiagnostics() { return {}; },
  };
  if (typeof stepOnce === 'function') runner.stepOnce = stepOnce;
  return runner;
}

function startPresentation(simulationRunner) {
  let nextId = 1;
  const pending = new Map();
  return createPresentationRunner(
    { accumulator: 0, timeScale: 1, tick: 0, simTime: 0, input: { actions: {} } },
    { renderUpdate() {}, get() { return null; } },
    simulationRunner,
    {
      requestFrame(callback) {
        const id = nextId++;
        pending.set(id, callback);
        return id;
      },
      cancelFrame(id) { pending.delete(id); },
      nowMs: () => 0,
      visibilityTarget: null,
      lifecyclePort: null,
      inputResumeTarget: null,
    },
  );
}

test('presentationRunner.stepOnce forwards to the simulation runner exactly once per call', () => {
  let calls = 0;
  const simulationRunner = stubSimulationRunner(() => {
    calls += 1;
    return true;
  });
  const presentation = startPresentation(simulationRunner);
  try {
    assert.equal(presentation.stepOnce(), true);
    assert.equal(calls, 1);
    assert.equal(presentation.stepOnce(), true);
    assert.equal(calls, 2);
  } finally {
    presentation.close();
  }
});

test('presentationRunner.stepOnce is a safe no-op when the simulation runner lacks the method', () => {
  const presentation = startPresentation(stubSimulationRunner(null));
  try {
    assert.equal(presentation.stepOnce(), undefined);
  } finally {
    presentation.close();
  }
});

test('Lab Step through ctx.simStep advances exactly one tick per click on the normal path', () => {
  withFakeDocument(() => {
    let calls = 0;
    const simulationRunner = stubSimulationRunner(() => {
      calls += 1;
      return true;
    });
    const loopController = startPresentation(simulationRunner);
    try {
      const { ctx, state } = makeCtx();
      state.timeScale = 0;
      ctx.timeEffects.getEffectiveScale = () => 0;
      ctx.simStep = () => loopController.stepOnce();
      const { stepBtn } = mountLab(ctx);
      assert.equal(stepBtn.disabled, false);
      stepBtn.click();
      assert.equal(calls, 1);
      stepBtn.click();
      assert.equal(calls, 2);
    } finally {
      loopController.close();
    }
  });
});
