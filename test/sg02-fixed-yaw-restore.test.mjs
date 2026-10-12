import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

async function fixture(yaw, callback) {
  const sim = createSimulation();
  const entity = sim.spawn({ type: 'wreck', pos: { x: 10, z: -30 }, rot: yaw,
    radius: 3, hull: 100, collides: true, data: {},
    physicsBody: { schemaVersion: 1, dynamic: false, shape: 'ball', radius: 3,
      mass: 20, inertiaY: 90, revision: 1, material: 'station' } });
  const source = await createSg02DynamicBodyOwner({ ready: true });
  const destination = await createSg02DynamicBodyOwner({ ready: true });
  try {
    source.syncFromEntities(sim.state.entityList); source.step(1 / 60);
    await callback({ sim, entity, source, destination });
  } finally { destination.dispose(); source.dispose(); sim.dispose(); }
}
for (const yaw of [.61, -.25, 3.4, 9]) {
  test(`fixed authored yaw ${yaw} survives exact native snapshot adoption`, async () => {
    await fixture(yaw, ({ sim, source, destination }) => {
      const snapshot = source.exportWorldSnapshot();
      assert.equal(destination.adoptWorldSnapshot(snapshot, sim.state.entityList), true);
      assert.equal(destination.adoptWorldSnapshot(destination.exportWorldSnapshot(), sim.state.entityList), true);
    });
  });
}
test('fixed yaw restoration rejects a changed scalar pose', async () => {
  await fixture(.61, ({ sim, entity, source, destination }) => {
    const snapshot = source.exportWorldSnapshot(); entity.rot += .000001;
    assert.equal(destination.adoptWorldSnapshot(snapshot, sim.state.entityList), false);
  });
});
test('fixed yaw restoration rejects native rotation changed without matching authored pose', async () => {
  await fixture(.61, ({ sim, entity, source, destination }) => {
    const body = source.records.get(entity.id).body;
    body.setRotation({ x: 0, y: -Math.sin(.62/2), z: 0, w: Math.cos(.62/2) }, true);
    assert.equal(destination.adoptWorldSnapshot(source.exportWorldSnapshot(), sim.state.entityList), false);
  });
});
