import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMODITIES, commodityPresentationFor } from '../src/data/commodities.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';
import { marketRowHtml } from '../src/ui/views/marketPresentation.js';

const ORE = COMMODITIES.find((row) => row.id === 'cmdty_ore_iron');
const FOOD = COMMODITIES.find((row) => row.id === 'cmdty_food');

function makeWorld() {
  const state = { nextEntityId: 1, entities: new Map(), entityList: [] };
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        id,
        ...spec,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        flags: { ...(spec.flags || {}) },
        data: spec.data ? { ...spec.data } : {},
        alive: true,
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
      return !!entity;
    },
  };
  return { state, helpers };
}

function spawnPod(state, helpers, commodity, pos) {
  const pod = spawnJettisonedCargoPod(state, {
    pos,
    vel: { x: 0, z: 0 },
    commodityId: commodity.id,
    amount: 4,
    unitMass: commodity.massPerU,
  }, helpers);
  assert.ok(pod, `${commodity.id} pod must spawn`);
  assert.equal(pod.data.commodityId, commodity.id);
  return pod;
}

function materialWithColor(root, hexString) {
  let found = null;
  root.traverse((object) => {
    if (found || !object.isMesh || !object.material || !object.material.color) return;
    if (object.material.color.getHexString() === hexString) found = object.material;
  });
  return found;
}

test.afterEach(() => invalidateVisualFactoryCaches());

test('commodity pods carry their family hue; equal families share materials', () => {
  const orePresentation = commodityPresentationFor(ORE.id);
  const foodPresentation = commodityPresentationFor(FOOD.id);
  assert.notEqual(orePresentation.id, foodPresentation.id, 'ore and food families must differ');
  assert.notEqual(orePresentation.color, foodPresentation.color);

  const { state, helpers } = makeWorld();
  const orePod = spawnPod(state, helpers, ORE, { x: 0, z: 0 });
  const foodPodA = spawnPod(state, helpers, FOOD, { x: 40, z: 0 });
  const foodPodB = spawnPod(state, helpers, FOOD, { x: 80, z: 0 });

  const factory = createVisualFactory();
  const oreVisual = factory.build(orePod);
  const foodVisualA = factory.build(foodPodA);
  const foodVisualB = factory.build(foodPodB);
  assert.ok(oreVisual && foodVisualA && foodVisualB, 'every pod needs a visual');

  for (const [label, visual, presentation] of [
    ['ore', oreVisual, orePresentation],
    ['food-a', foodVisualA, foodPresentation],
    ['food-b', foodVisualB, foodPresentation],
  ]) {
    assert.equal(visual.userData.commodityPresentationId, presentation.id,
      `${label} pod must stamp its family id`);
    assert.equal(visual.userData.commodityPresentationColor, presentation.color,
      `${label} pod must stamp its family color`);
    assert.ok(
      materialWithColor(visual, presentation.color.slice(1).toLowerCase()),
      `${label} pod must have a mesh whose material is the exact family color`,
    );
  }

  const oreBand = materialWithColor(oreVisual, orePresentation.color.slice(1).toLowerCase());
  const foodBandA = materialWithColor(foodVisualA, foodPresentation.color.slice(1).toLowerCase());
  const foodBandB = materialWithColor(foodVisualB, foodPresentation.color.slice(1).toLowerCase());
  assert.equal(foodBandA, foodBandB, 'same-family pods must share the cached band material');
  assert.notEqual(oreBand, foodBandA, 'different families must not share the band material');

  const plainVisual = factory.build({ id: 90, type: 'payload', radius: 4, data: { kind: 'cargo' } });
  assert.ok(plainVisual, 'generic payload still builds');
  assert.equal(plainVisual.userData.commodityPresentationId, undefined);
  assert.equal(plainVisual.userData.commodityPresentationColor, undefined);
  assert.ok(materialWithColor(plainVisual, 'd7862c'), 'generic payload keeps the stock orange band');
});

test('the market row wraps its icon in the same family hue, safely', () => {
  const foodPresentation = commodityPresentationFor(FOOD);
  const html = marketRowHtml({
    id: FOOD.id, name: FOOD.name, category: FOOD.category,
    buy: 12, sell: 9, stock: 40, held: 4,
    presentation: foodPresentation,
  });
  assert.ok(
    html.includes(`data-commodity-presentation="${foodPresentation.id}"`),
    'row must carry the family id on the commodity icon wrapper',
  );
  assert.ok(
    html.includes(`style="color:${foodPresentation.color}"`),
    'row must tint the commodity icon with the exact family color',
  );

  const hostile = marketRowHtml({
    id: FOOD.id, name: FOOD.name, category: FOOD.category,
    buy: 12, sell: 9, stock: 40,
    presentation: { id: 'cargo-family-food', color: 'red;position:fixed;inset:0' },
  });
  assert.ok(!hostile.includes('data-commodity-presentation'),
    'a non-#rrggbb presentation color must not produce the tinted wrapper');
  assert.ok(!/style="[^"]*red;position:fixed/.test(hostile),
    'a malicious presentation color must never reach a style attribute');
});
