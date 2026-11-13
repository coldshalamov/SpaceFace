import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOLUS_SECTOR_ID } from '../src/data/theBolus.js';
import { SECTOR_GLOBAL_ORIGINS } from '../src/data/sectorCoordinates.js';
import { syncBolusView, disposeBolusView } from '../src/render/bolusView.js';

const origin = SECTOR_GLOBAL_ORIGINS[BOLUS_SECTOR_ID];
function fauna(id, role, generation = id) {
  return { id, occupantGeneration: generation, alive: true, data: { bolus: { role } },
    pos: { x: origin.x + id * 12, z: origin.z + id * 7 }, vel: { x: 0, z: 0 } };
}
function makeRenderer(entityList) {
  return { scene: new THREE.Scene(), state: { meta: { seed: 4242 }, simTime: 1,
    world: { currentSectorId: BOLUS_SECTOR_ID, alienEcology: { sectorFlags: {} } }, entityList } };
}
function monitor(meshes) {
  const counts = new Map();
  for (const mesh of meshes) {
    const count = { geometry: 0, material: 0 };
    counts.set(mesh, count);
    mesh.geometry.addEventListener('dispose', () => count.geometry++);
    mesh.material.addEventListener('dispose', () => count.material++);
  }
  return counts;
}
function assertPositions(cards, entities) {
  assert.equal(cards.children.length, entities.length * 2);
  for (let i = 0; i < entities.length; i++) {
    for (const mesh of cards.children.slice(i * 2, i * 2 + 2)) {
      assert.deepEqual(mesh.position.toArray(), [entities[i].pos.x - origin.x, 8, entities[i].pos.z - origin.z]);
      assert.deepEqual(mesh.scale.toArray(), [14, 14, 14]);
    }
  }
}

test('freeze cards retain unchanged occupants across movement, order and recycled IDs', () => {
  const roles = [...Array(10).fill('louse'), ...Array(8).fill('fingerling'), ...Array(6).fill('mite')];
  const entities = roles.map((role, i) => fauna(i + 1, role));
  const renderer = makeRenderer(entities);
  try {
    syncBolusView(renderer);
    const cards = renderer._bolusView.cards;
    const original = [...cards.children];
    assertPositions(cards, entities);
    const counts = monitor(original);
    for (let i = 0; i < 10; i++) syncBolusView(renderer);
    assert.deepEqual(cards.children, original, 'unchanged frames retain every card');

    entities[0].vel.x = 1;
    syncBolusView(renderer);
    assert.deepEqual(cards.children, original.slice(2), 'only the moving occupant is removed');
    for (let i = 0; i < original.length; i++) {
      const expected = i < 2 ? 1 : 0;
      assert.deepEqual(counts.get(original[i]), { geometry: expected, material: expected });
    }
    entities.reverse();
    entities[0].pos.x += 5;
    syncBolusView(renderer);
    const expectedReversed = [];
    for (let i = 23; i >= 1; i--) expectedReversed.push(original[i * 2], original[i * 2 + 1]);
    assert.deepEqual(cards.children, expectedReversed, 'reordering retains cards and follows sector order');
    assertPositions(cards, entities.slice(0, -1));

    entities[23].vel.x = 0;
    syncBolusView(renderer);
    assert.deepEqual(cards.children.slice(0, -2), expectedReversed);
    assert.ok(cards.children.slice(-2).every(mesh => !original.includes(mesh)));
    assertPositions(cards, entities);

    const oldGeneration = cards.children.slice(2, 4);
    const oldGenerationCounts = monitor(oldGeneration);
    entities[1] = { ...entities[1], occupantGeneration: entities[1].occupantGeneration + 1000,
      data: { bolus: { ...entities[1].data.bolus } }, pos: { ...entities[1].pos, x: entities[1].pos.x + 17 } };
    syncBolusView(renderer);
    assert.deepEqual(cards.children.slice(2, 4), oldGeneration, 'a same-role new occupant reuses the stateless cards');
    assert.ok(oldGeneration.every(mesh => oldGenerationCounts.get(mesh).geometry === 0
      && oldGenerationCounts.get(mesh).material === 0));
    assertPositions(cards, entities);

    const oldRole = cards.children.slice(4, 6);
    const oldRoleCounts = monitor(oldRole);
    entities[2].data.bolus.role = 'fingerling';
    syncBolusView(renderer);
    assert.ok(cards.children.slice(4, 6).every(mesh => !oldRole.includes(mesh)), 'a changed role gets its own recipe');
    assert.ok(oldRole.every(mesh => oldRoleCounts.get(mesh).geometry === 1 && oldRoleCounts.get(mesh).material === 1));

    delete entities[3].occupantGeneration;
    syncBolusView(renderer);
    const noGeneration = cards.children.slice(6, 8);
    const noGenerationCounts = monitor(noGeneration);
    for (let i = 0; i < 10; i++) {
      entities[3] = { ...entities[3], data: { bolus: { ...entities[3].data.bolus } },
        pos: { ...entities[3].pos, z: entities[3].pos.z + 1 } };
      syncBolusView(renderer);
      assert.deepEqual(cards.children.slice(6, 8), noGeneration,
        'generation-less snapshot replacements retain the stateless cards');
      assertPositions(cards, entities);
    }
    assert.ok(noGeneration.every(mesh => noGenerationCounts.get(mesh).geometry === 0
      && noGenerationCounts.get(mesh).material === 0));
    assertPositions(cards, entities);

    renderer.state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true,
      bySectorId: new Map([[BOLUS_SECTOR_ID, entities]]) };
    renderer.state.entityList = [];
    const indexed = [...cards.children];
    syncBolusView(renderer);
    assert.deepEqual(cards.children, indexed, 'switching to the sector index preserves the same occupants');
    renderer.state.world.currentSectorId = 'other';
    syncBolusView(renderer);
    assert.equal(renderer._bolusView.group.visible, false);
    entities[0].vel.z = 1;
    renderer.state.world.currentSectorId = BOLUS_SECTOR_ID;
    syncBolusView(renderer);
    assert.equal(renderer._bolusView.group.visible, true);
    assert.deepEqual(cards.children, indexed.slice(2), 're-entry reconciles changes made while away');
    assertPositions(cards, entities.slice(1));

    const survivors = [...cards.children];
    const finalCounts = monitor(survivors);
    disposeBolusView(renderer);
    assert.ok(survivors.every(mesh => finalCounts.get(mesh).geometry === 1 && finalCounts.get(mesh).material === 1),
      'view teardown retires each retained resource once');
  } finally { disposeBolusView(renderer); }
});

test('context-loss retirement abandons old freeze-card GPU resources', () => {
  const renderer = makeRenderer([fauna(1, 'louse')]);
  syncBolusView(renderer);
  const old = [...renderer._bolusView.cards.children];
  const counts = monitor(old);
  disposeBolusView(renderer, { disposeGpu: false });
  assert.ok(old.every(mesh => counts.get(mesh).geometry === 0 && counts.get(mesh).material === 0));
  syncBolusView(renderer);
  assert.equal(renderer._bolusView.cards.children.length, 2);
  assert.ok(renderer._bolusView.cards.children.every(mesh => !old.includes(mesh)));
  disposeBolusView(renderer);
});
