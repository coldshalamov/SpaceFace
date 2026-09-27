// Wave F §22.8 row F4 — "The pod is the color of what is inside it."
//
// A loose cargo pod's body color comes from its commodity: one readable hue per cargo
// family, stable for the life of the pod, and the same hue the station market uses for
// that commodity (both read COMMODITY_PRESENTATION_BY_CATEGORY through
// commodityPresentationFor; the pod shell in visualFactory.buildPayload and the market
// row in market.js share that function).
//
// This fixture spills two commodities from different families plus a second pod of the
// first commodity through the real cargo.jettison path, on seeds 4242 and 8008.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  COMMODITY_PRESENTATION_BY_CATEGORY,
  commodityPresentationFor,
} from '../src/data/commodities.js';
import { cargo } from '../src/systems/cargo.js';

const SEEDS = [4242, 8008];
const ORE = 'cmdty_ore_iron'; // category 'raw ore' -> cargo-family-raw
const FOOD = 'cmdty_food'; // category 'food' -> cargo-family-food

function makeHarness(seed) {
  const state = createGameState(seed);
  const bus = createBus();
  const player = {
    id: 1, type: 'ship', team: 0, alive: true, collides: true,
    pos: { x: 100, z: 50 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, combatSpeed: 100, hull: 100, hullMax: 100,
    factionId: 'player', flags: {}, data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;

  const spawned = [];
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
    spawned.push(entity);
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
  system.addCargo(ORE, 2);
  system.addCargo(FOOD, 2);
  return { state, bus, system, spawned };
}

function presentationOf(pod) {
  return commodityPresentationFor(pod.data.commodityId);
}

for (const seed of SEEDS) {
  test(`spilled pods carry their commodity family color (seed ${seed})`, () => {
    const harness = makeHarness(seed);
    try {
      assert.equal(harness.system.jettison(ORE, 1), 1);
      assert.equal(harness.system.jettison(FOOD, 1), 1);
      assert.equal(harness.system.jettison(ORE, 1), 1);
      const pods = harness.spawned.filter((e) => e.type === 'payload' && e.alive !== false);
      assert.equal(pods.length, 3);
      const [orePod, foodPod, orePod2] = pods;
      assert.equal(orePod.data.kind, 'cargo');
      assert.equal(orePod.data.commodityId, ORE);
      assert.equal(foodPod.data.commodityId, FOOD);

      // The pod presentation ids differ across families and match the commodity table.
      const orePresentation = presentationOf(orePod);
      const foodPresentation = presentationOf(foodPod);
      assert.notEqual(orePresentation.id, foodPresentation.id);
      assert.equal(orePresentation.id, COMMODITY_PRESENTATION_BY_CATEGORY['raw ore'].id);
      assert.equal(foodPresentation.id, COMMODITY_PRESENTATION_BY_CATEGORY.food.id);
      assert.equal(orePresentation.color, COMMODITY_PRESENTATION_BY_CATEGORY['raw ore'].color);
      assert.equal(foodPresentation.color, COMMODITY_PRESENTATION_BY_CATEGORY.food.color);

      // A second pod of the same commodity matches the first: the hue is stable.
      assert.equal(presentationOf(orePod2).id, orePresentation.id);
      assert.equal(presentationOf(orePod2).color, orePresentation.color);

      // The palette is a family table, not a red/green pair: distinct hues per family.
      const colors = new Set(Object.values(COMMODITY_PRESENTATION_BY_CATEGORY).map((p) => p.color));
      assert.ok(colors.size >= 10, `family palette holds ${colors.size} distinct hues`);
    } finally {
      harness.system.destroy();
    }
  });
}
