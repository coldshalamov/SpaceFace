import { parentPort } from 'node:worker_threads';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

parentPort.once('message', async ({ angVel }) => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
  const entity = {
    id: 1,
    type: 'ship',
    alive: true,
    radius: 10,
    mass: 20,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    rot: 0,
    angVel,
    physicsBody: {
      schemaVersion: 1, radius: 10, mass: 20, inertiaY: 1000,
      dynamic: true, ccd: false, shape: 'capsule', revision: 0,
    },
    data: { proportions: { length: 4, halfWidth: 0.1, height: 0.2 } },
  };
  owner.syncFromEntities([entity]);
  parentPort.postMessage({ type: 'ready', angvelY: owner.records.get(1).body.angvel().y });
  owner.step(1 / 60, 1);
  const rec = owner.records.get(1);
  const expectedYaw = rec && rec.expected ? rec.expected.yaw : null;
  const wy = rec && rec.expected ? rec.expected.wy : null;
  const rot = entity.rot;
  owner.dispose();
  parentPort.postMessage({ type: 'done', expectedYaw, wy, rot, recordsAfterDispose: owner.records.size });
});
