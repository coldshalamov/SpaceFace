import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { environmentSurfaceData } from '../src/data/environmentMaterials.js';
import { addEnvironmentHeat, environmentMaterials } from '../src/systems/environmentMaterials.js';

function boot() {
  const state = createGameState(41);
  state.mode = 'flight';
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const owner = Object.create(environmentMaterials);
  owner.init(ctx);
  return { state, helpers, owner };
}

function reactiveBody(helpers, material, { x } = {}) {
  return helpers.spawnEntity({
    type: material === 'debris' ? 'wreck' : 'asteroid', pos: { x, z: 0 }, vel: { x: 0, z: 0 }, radius: 32,
    hull: 600, hullMax: 600, collides: true,
    homeSectorId: 'sector_anvil_storm_orchard',
    data: environmentSurfaceData(material, {
      typeId: material === 'debris' ? 'orchard-frame' : 'ast_crystalline', fieldId: 'orchard-test', asteroidSlotId: String(x),
      materialCondition: { heat: 0, pending: false, reacted: false },
    }),
  });
}

for (const material of ['crystal', 'debris']) test(`draining persisted ${material} reactions protects landmarks and still reacts ordinary bodies`, () => {
  const h = boot();
  const landmark = reactiveBody(h.helpers, material, { x: 0 });
  const ordinary = reactiveBody(h.helpers, material, { x: 500 });

  addEnvironmentHeat(h.state, landmark, 48, { actorId: 'old-save' });
  addEnvironmentHeat(h.state, ordinary, 48, { actorId: 'old-save' });
  // Simulate loading the reaction queue after the body gains its anchored identity.
  landmark.data.isLandmark = true;
  landmark.data.landmarkId = 'anvil_storm_orchard';
  landmark.data.orchardId = 'anvil_storm_orchard';
  landmark.data.orchardKind = 'frame';
  const saved = h.owner.serialize();
  h.owner.deserialize(saved);

  h.owner.update(1 / 60, h.state);

  assert.equal(landmark.alive, true, 'queued work must not fracture an anchored Orchard landmark');
  assert.deepEqual(landmark.data.materialCondition, { heat: 48, pending: false, reacted: false });
  assert.equal(ordinary.alive, false, 'the same stale queue entry still acts on an ordinary crystal');
  assert.equal(material === 'debris' ? ordinary.data.cooked : ordinary.data.fractured, true);
  assert.equal(ordinary.data.materialCondition.pending, false);
  assert.equal(ordinary.data.materialCondition.reacted, true);
  assert.deepEqual(h.state.materialReactions, []);
  h.owner.destroy();
});

test('retired structural reactions release their latch so the same body can react after detachment', () => {
  const h = boot();
  const body = reactiveBody(h.helpers, 'crystal', { x: 0 });
  addEnvironmentHeat(h.state, body, 48, { actorId: 'before-construction' });
  body.data.worldSiteStructural = true;
  h.owner.update(1 / 60, h.state);
  assert.equal(body.alive, true);
  assert.equal(body.data.materialCondition.pending, false);
  assert.deepEqual(h.state.materialReactions, []);
  body.data.worldSiteStructural = false;
  addEnvironmentHeat(h.state, body, 48, { actorId: 'after-detachment' });
  h.owner.update(1 / 60, h.state);
  assert.equal(body.alive, false);
  assert.equal(body.data.fractured, true);
  h.owner.destroy();
});
