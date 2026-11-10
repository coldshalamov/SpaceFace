// PIC-28: a hot-dock cargo spill is seen at the berth, not only counted.
// On seed 4242 a hot dock produces exactly one presentation cue for the berth-apron mark
// carrying the lot count, and the world-cue whitelist resolves it at the berth position.
// Spill odds, pods and physics are owned by test/hot-dock-cargo-spill.test.mjs and untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { cargo } from '../src/systems/cargo.js';
import { resolveWorldCueReceipt } from '../src/render/vfx/worldCueRecipes.js';

const SEED = 4242;
const STATION_ID = 'station_helios';
const FOOD = 'cmdty_food';

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
    bus.emit('entity:spawned', { id: entity.id, type: entity.type, entity });
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
  const cues = [];
  bus.on('presentation:cue', (p) => {
    if (p && p.id === 'cargo.spill.berth') cues.push(p);
  });
  system.addCargo(FOOD, 4);
  return { state, bus, system, player, cues };
}

test('a hot dock produces one berth spill record with the lot count', () => {
  const harness = makeHarness({ x: 25, z: 0 });
  try {
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    assert.equal(harness.cues.length, 1, 'exactly one berth cue');
    const cue = harness.cues[0];
    assert.equal(cue.sourceEvent, 'cargo:hotDockSpill');
    assert.equal(cue.count, 2);
    assert.deepEqual({ ...cue.spilled }, { [FOOD]: 2 });
    assert.ok(Math.hypot(cue.position.x - 100, cue.position.z - 50) < 1, 'anchored at the berth');

    const receipt = resolveWorldCueReceipt(cue, harness.state);
    assert.ok(receipt, 'the whitelist resolves the berth mark');
    assert.equal(receipt.kind, 'cargo.spill.berth');
    assert.ok(Math.hypot(receipt.pos.x - 100, receipt.pos.z - 50) < 1, 'resolved at the berth');
    assert.equal(receipt.attachToTarget, false, 'a static apron mark, not a hull attachment');
  } finally {
    harness.system.destroy();
  }
});

test('a legal-speed dock produces no berth record', () => {
  const harness = makeHarness({ x: 20, z: 0 });
  try {
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    assert.equal(harness.cues.length, 0);
  } finally {
    harness.system.destroy();
  }
});

test('a same-tick double dock still produces one berth record', () => {
  const harness = makeHarness({ x: 25, z: 0 });
  try {
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    harness.bus.emit('dock:docked', { stationId: STATION_ID });
    assert.equal(harness.cues.length, 1);
  } finally {
    harness.system.destroy();
  }
});
