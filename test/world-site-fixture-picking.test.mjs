import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installWorldSitePresentation } from '../src/render/worldSitePresentation.js';
import { createWorldObjectPicker } from '../src/render/worldObjectPicking.js';
import { entityIsJournaled, collectJournalPresentationEntities } from '../src/world/presentationSources.js';
import { createReadModel, applySpawnInfos, applyDestroyIds } from '../scripts/lib/simReadModel.mjs';

const siteId = 'world_site_ceres_second_measure', componentId = 'long_plate_clamp';
function component(id = 2, generation = 1) {
  return { id, occupantGeneration: generation, type: 'wreck', alive: true, _noMesh: true,
    pos: { x: 0, z: 0 }, data: { role: 'world_site_component', worldSiteId: siteId,
      worldSiteComponentId: componentId, worldRecordId: `${siteId}/component/${componentId}`,
      presentationOwnerWorldRecordId: `${siteId}/root`, worldSiteTargetable: true,
      worldSiteProxy: { bodyType: 'sensor' } } };
}
function fixture() {
  const rootEntity = { id: 1, occupantGeneration: 4, type: 'fx', alive: true, pos: { x: 0, z: 0 },
    data: { role: 'world_site_root', placeId: 'place_ceres_second_measure', worldSiteId: siteId, worldObjectId: siteId, worldRecordId: `${siteId}/root`,
      worldSitePresentation: { schemaVersion: 1, fixtures: [{ id: 'lamp', componentId, socketId: 'support',
        kind: 'status-light', radius: 1.2, height: 10, color: 0xe6a747, opacity: .8 }], animations: [] } } };
  const sensor = component();
  const state = { entities: new Map([[1, rootEntity], [2, sensor]]) };
  const root = new THREE.Group(), socket = new THREE.Group();
  socket.name = 'support'; socket.userData.spacefaceSocket = true; root.add(socket);
  const controller = installWorldSitePresentation(root, rootEntity);
  root.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(50, 1, .1, 400);
  camera.position.set(0, 100, 0.001); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const meshes = new Map([[1, root]]);
  const picker = createWorldObjectPicker({ state, getCamera: () => camera, getMeshes: () => meshes,
    getViewport: () => ({ width: 500, height: 500 }) });
  return { state, rootEntity, sensor, root, socket, controller, picker };
}

test('a visible support lamp selects the live sensor, respects occlusion and rejects stale lifetimes', () => {
  const h = fixture();
  assert.equal(h.socket.children[0].position.y, 10, 'light is placed at the authored beacon tip');
  assert.equal(h.picker.pick(250, 250)?.entity, h.sensor);
  const occluder = new THREE.Mesh(new THREE.BoxGeometry(20, 2, 20), new THREE.MeshBasicMaterial());
  occluder.position.y = 20; h.root.add(occluder); h.root.updateMatrixWorld(true);
  assert.equal(h.picker.pick(250, 250)?.entity, h.rootEntity, 'a nearer hull surface remains the actual pick');
  h.root.remove(occluder); h.root.updateMatrixWorld(true);
  h.state.entities.delete(h.sensor.id);
  assert.equal(h.picker.pick(250, 250), null, 'removed sensor is never selected');
  const replacement = component(2, 2); h.state.entities.set(2, replacement);
  assert.equal(h.picker.pick(250, 250)?.entity, replacement, 'lookup binds current durable component, not saved id');
  replacement.data.worldSiteTargetable = false;
  assert.equal(h.picker.pick(250, 250), null, 'inactive sensor is not selectable');
  replacement.data.worldSiteTargetable = true;
  h.rootEntity.occupantGeneration++;
  assert.equal(h.picker.pick(250, 250), null, 'old root fixture cannot select for a new occupant');
  h.controller.dispose();
});

test('only live targetable sensors enter the journal; rebuild, removal and id reuse preserve no-mesh identity', () => {
  const sensor = component(), hiddenHelper = { ...component(3), data: { ...component(3).data, worldSiteTargetable: false } };
  const collision = { ...component(4), data: { ...component(4).data, role: 'world_site_collision' } };
  assert.equal(entityIsJournaled(sensor), true);
  assert.equal(entityIsJournaled(hiddenHelper), false);
  assert.equal(entityIsJournaled(collision), false);
  assert.deepEqual(collectJournalPresentationEntities({ entityList: [sensor, hiddenHelper, collision] }), [sensor]);
  sensor.alive = false;
  assert.deepEqual(collectJournalPresentationEntities({ entityList: [sensor] }), []);
  const model = createReadModel();
  const info = { entityId: 2, occupantGeneration: 1, type: 'wreck', noMesh: true, data: component().data };
  applySpawnInfos(model, [info]); const old = model.entities.get(2);
  assert.equal(old._noMesh, true);
  applySpawnInfos(model, [info]);
  assert.equal(model.entities.get(2), old, 'rebuild keeps the existing occupant');
  applyDestroyIds(model, [2]);
  applySpawnInfos(model, [{ entityId: 2, occupantGeneration: 2, type: 'ship', noMesh: false, data: {} }]);
  assert.equal(model.entities.get(2)._noMesh, false, 'recycled ship does not inherit hidden state');
  model.entities.get(2)._noMesh = true; model.entities.get(2)._noMeshByRenderer = true;
  applySpawnInfos(model, [{ entityId: 2, occupantGeneration: 2, type: 'ship', noMesh: false, data: {} }]);
  assert.equal(model.entities.get(2)._noMesh, true, 'same-occupant renderer latch survives rebuild');
});

test('production worker publishes a real sensor identity without creating a drawn body', async () => {
  const { readFileSync } = await import('node:fs');
  const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const { state, sim } = lane.host;
    const spec = component(); delete spec.id; delete spec.occupantGeneration;
    const sensor = sim.spawn(spec);
    assert.equal(sensor._noMesh, true);
    assert.equal(entityIsJournaled(sensor), true);
    const reply = structuredClone(await lane.tick({ tick: 1, steps: 0, ackEnd: init.journalSequence }));
    const info = reply.spawnInfos.find(row => row.entityId === sensor.id);
    assert.ok(info, 'authoritative spawn crosses the real production journal');
    assert.equal(info.noMesh, true);
    const model = createReadModel(); applySpawnInfos(model, [info]);
    assert.equal(model.entities.get(sensor.id)._noMesh, true);
    assert.equal(model.entities.get(sensor.id).data.worldRecordId, sensor.data.worldRecordId);
    assert.equal(model.entities.get(sensor.id).occupantGeneration, sensor.occupantGeneration);
  } finally { lane.shutdown(); }
});
