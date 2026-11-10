import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { combat } from '../src/systems/combat.js';
import { RECIPES } from '../src/data/audioRecipes.js';

function makeShip(id, over = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    rot: 0,
    flags: {},
    data: {},
    hull: 100,
    hullMax: 100,
    shield: 0,
    shieldMax: 60,
    shieldRegenRate: 20,
    shieldRegenDelay: 3,
    lastDamageT: 0,
    cap: 50,
    capMax: 50,
    ...over,
  };
}

function makeState(entities) {
  return {
    tick: 0,
    simTime: 10,
    playerId: 1,
    entities: new Map(entities.map((e) => [e.id, e])),
    entityList: entities,
    combat: {},
    settings: { gameplay: { difficulty: 'standard' } },
  };
}

function initCombat(state, bus) {
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
}

test('shieldRestored fires once when a depleted shield regenerates above zero', () => {
  const ship = makeShip(1);
  const state = makeState([ship]);
  const bus = createBus();
  const events = [];
  bus.on('shieldRestored', (p) => events.push(p));
  initCombat(state, bus);

  // Regen delay already elapsed (lastDamageT 0, simTime 10 > delay 3): first tick restores charge.
  combat.update(1 / 60, state);
  assert.equal(ship.shield > 0, true, 'shield regenerated');
  assert.equal(events.length, 1, 'exactly one shieldRestored emit on the 0->positive crossing');
  assert.equal(events[0].combatantId, 1);

  // Continued regen ticks must not re-emit.
  combat.update(1 / 60, state);
  combat.update(1 / 60, state);
  assert.equal(events.length, 1, 'no per-tick spam while shield keeps regenerating');
});

test('shieldRestored does not fire for partial shields that never depleted', () => {
  const ship = makeShip(1, { shield: 30 });
  const state = makeState([ship]);
  const bus = createBus();
  const events = [];
  bus.on('shieldRestored', (p) => events.push(p));
  initCombat(state, bus);

  for (let i = 0; i < 10; i++) combat.update(1 / 60, state);
  assert.equal(events.length, 0, 'partial regen is not a restore transition');
});

test('shieldRestored re-fires on a fresh depletion->recovery cycle', () => {
  const ship = makeShip(1);
  const state = makeState([ship]);
  const bus = createBus();
  const events = [];
  bus.on('shieldRestored', (p) => events.push(p));
  initCombat(state, bus);

  combat.update(1 / 60, state);
  assert.equal(events.length, 1);

  // Knock it back down, wait out the regen delay, recover again.
  ship.shield = 0;
  ship.lastDamageT = state.simTime;
  state.simTime += 4;
  combat.update(1 / 60, state);
  assert.equal(events.length, 2, 'each down->online cycle announces once');
});

test('sfx_shield_restore audio recipe is defined', () => {
  const recipe = RECIPES.find((r) => r.id === 'sfx_shield_restore');
  assert.ok(recipe, 'sfx_shield_restore recipe must exist');
  assert.equal(recipe.type, 'oscillator');
});
