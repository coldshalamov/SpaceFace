import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { cargo } from '../src/systems/cargo.js';

// WF-17 hot-dock apron beat: the spill fires under the dock clunk with the station hub up, so
// the undock is the legible moment. Cargo owns the spill receipt, so cargo announces it once —
// cause ("came in hot"), the named lost pods, and the remedy in place (floating by the dock).
const SEED = 4242;
const STATION_ID = 'station_helios';
const FOOD = 'cmdty_food';
const WATER = 'cmdty_ice_water';

function makeHarness(vel) {
  const state = createGameState(SEED);
  const bus = createBus();
  const player = {
    id: 1, type: 'ship', team: 0, alive: true, collides: true,
    pos: { x: 100, z: 50 }, vel: { x: vel.x, z: vel.z }, rot: 0,
    radius: 8, combatSpeed: 100, hull: 100, hullMax: 100,
    factionId: 'player', flags: {}, data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;

  const spawnEntity = (spec) => {
    const entity = {
      ...spec,
      id: state.nextEntityId++,
      alive: true,
      pos: { ...(spec.pos || { x: 0, z: 0 }) },
      vel: { ...(spec.vel || { x: 0, z: 0 }) },
      data: spec.data ? { ...spec.data } : {},
      flags: spec.flags ? { ...spec.flags } : {},
    };
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  const removeEntity = (id) => {
    const entity = state.entities.get(id);
    if (entity) entity.alive = false;
    state.entities.delete(id);
    const index = state.entityList.indexOf(entity);
    if (index >= 0) state.entityList.splice(index, 1);
  };

  const system = Object.create(cargo);
  system.init({ state, bus, helpers: { spawnEntity, removeEntity } });
  const toasts = [];
  const cues = [];
  const spillReceipts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  bus.on('audio:cue', (payload) => cues.push(payload));
  bus.on('cargo:hotDockSpill', (receipt) => spillReceipts.push(receipt));
  return { state, bus, system, player, toasts, cues, spillReceipts };
}

function spillToasts(harness) {
  return harness.toasts.filter((row) => typeof row.text === 'string' && row.text.includes('Came in hot'));
}

test('seed 4242: a hot dock announces the spill at undock, exactly once', () => {
  const harness = makeHarness({ x: 25, z: 0 });
  try {
    harness.system.addCargo(FOOD, 4);
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    assert.equal(harness.spillReceipts.length, 1);
    assert.equal(spillToasts(harness).length, 0, 'the dock moment stays quiet — the hub is up');

    harness.bus.emit('dock:undocked', {});
    const toasts = spillToasts(harness);
    assert.equal(toasts.length, 1, 'the undock names the spill');
    const text = toasts[0].text;
    assert.match(text, /Came in hot/, 'the cause is named');
    assert.match(text, /Provisions/, 'the lost commodity is named');
    assert.match(text, /2 Provisions pods/, 'the pod count matches the spill');
    assert.match(text, /floating by the dock/, 'the remedy in place is named');
    assert.equal(toasts[0].kind, 'warn');
    assert.ok(harness.cues.some((cue) => cue && cue.id === 'alert'), 'an alert cue rides the receipt');

    harness.bus.emit('dock:undocked', {});
    assert.equal(spillToasts(harness).length, 1, 'a later undock does not repeat the receipt');

    // A second hot dock + undock is a new spill with its own one-shot receipt.
    harness.state.tick = 1;
    harness.player.vel.x = 25;
    harness.system.addCargo(FOOD, 2);
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    assert.equal(harness.spillReceipts.length, 2);
    harness.bus.emit('dock:undocked', {});
    assert.equal(spillToasts(harness).length, 2);
  } finally {
    harness.system.destroy();
  }
});

test('a legal-speed dock undocks with no spill receipt', () => {
  const harness = makeHarness({ x: 10, z: 0 });
  try {
    harness.system.addCargo(FOOD, 4);
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    harness.bus.emit('dock:undocked', {});
    assert.equal(harness.spillReceipts.length, 0);
    assert.equal(spillToasts(harness).length, 0);
    assert.equal(harness.cues.filter((cue) => cue && cue.id === 'alert').length, 0);
  } finally {
    harness.system.destroy();
  }
});

test('a two-commodity spill names both lost commodities', () => {
  const harness = makeHarness({ x: 30, z: 0 });
  try {
    harness.system.addCargo(FOOD, 1);
    harness.system.addCargo(WATER, 1);
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    assert.equal(harness.spillReceipts.length, 1);
    assert.deepEqual(Object.keys(harness.spillReceipts[0].spilled).sort(), [FOOD, WATER]);

    harness.bus.emit('dock:undocked', {});
    const toasts = spillToasts(harness);
    assert.equal(toasts.length, 1);
    assert.match(toasts[0].text, /Provisions and Water Ice/, 'both spilled commodities are named');
    assert.match(toasts[0].text, /2 Provisions and Water Ice pods/, 'the pod count matches the spill');
  } finally {
    harness.system.destroy();
  }
});

test('a spill with nothing left to spill never announces', () => {
  const harness = makeHarness({ x: 25, z: 0 });
  try {
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    assert.equal(harness.spillReceipts.length, 0, 'an empty hold cannot spill');
    harness.bus.emit('dock:undocked', {});
    assert.equal(spillToasts(harness).length, 0);
    assert.equal(harness.cues.filter((cue) => cue && cue.id === 'alert').length, 0);
  } finally {
    harness.system.destroy();
  }
});
