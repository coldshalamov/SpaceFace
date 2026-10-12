import assert from 'node:assert/strict';
import test from 'node:test';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { physics } from '../src/core/physics.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';

const DT = 1 / 60;
function station(id, x = 500) {
  return { id, type: 'station', alive: true, radius: 34, mass: 1e6,
    pos: { x, y: 0, z: -200 }, vel: { x: 0, y: 0, z: 0 }, rot: 0, angVel: 0,
    collides: true, homeSectorId: 'sector_alpha', data: { stationId: 'station_alpha' },
    physicsBody: { schemaVersion: 1, radius: 34, mass: 1e6, inertiaY: 1e6,
      dynamic: false, shape: 'ball', revision: 0 } };
}
async function rig(entity) {
  const state = createGameState(91);
  state.mode = 'flight'; state.entityList = [entity]; state.entities = new Map([[entity.id, entity]]);
  const system = Object.create(physics);
  system.init({ state, bus: createBus(), helpers: {} });
  system._sg02 = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  system._sg02.syncFromEntities([entity]);
  return { state, system, owner: system._sg02 };
}
function complete(system, mode, options = {}) {
  if (mode === 'sync') system.completeRestore(options);
  else {
    const steps = [...system.completeRestoreSteps(options)];
    assert.ok(steps.includes('native-restore-adopted'), 'exercise the stepped native boundary');
  }
}
async function payloadFor(source, entity) {
  queuePhysicsImpulse(entity, { x: 8e6, z: 0 });
  for (let i = 0; i < 12; i++) source.owner.step(DT);
  const payload = source.system.serialize();
  assert.equal(payload.anchoredRecoil.length, 1);
  return payload;
}

for (const mode of ['sync', 'stepped']) {
  for (const native of [true, false]) {
    test(`${mode} restore consumes recoil before ${native ? 'native adoption' : 'scalar fallback'} and can repeat`, async () => {
      const original = station(1), source = await rig(original), regenerated = station(9), target = await rig(regenerated);
      try {
        const payload = await payloadFor(source, original);
        const row = payload.anchoredRecoil[0];
        for (let attempt = 0; attempt < 2; attempt++) {
          const fresh = station(9);
          target.state.entityList = [fresh]; target.state.entities = new Map([[fresh.id, fresh]]);
          target.system.deserialize(structuredClone(payload), { deferNative: true });
          complete(target.system, mode, { entityIdRemap: new Map([['1', 9]]),
            ...(native ? {} : { pendingBodyRefs: ['force-scalar-fallback'] }) });
          assert.deepEqual(target.state.physicsRuntime.nativeRestore,
            native ? { mode: 'native', exact: true, reason: null }
              : { mode: 'scalar', exact: false, reason: 'unresolved_semantic_bodies' });
          assert.deepEqual(fresh.physicsBody.anchorRecoil, { rest: { x: 500, z: -200 },
            x: row.x, z: row.z, vx: row.vx, vz: row.vz, settled: false });
          assert.equal(fresh.pos.x, row.pose.x); assert.equal(fresh.pos.z, row.pose.z);
          assert.equal(target.system._pendingAnchoredRecoil, null);
          assert.equal(target.system._pendingSg02Snapshot, null);
          assert.equal(target.system._nativeRestorePending, false);
          assert.equal(target.owner.records.get(9).body.isKinematic(), true);
          for (let i = 0; i < 600; i++) target.owner.step(DT);
          assert.equal(fresh.physicsBody.anchorRecoil.settled, true);
          assert.equal(fresh.pos.x, 500); assert.equal(fresh.pos.z, -200);
        }
      } finally { source.owner.dispose(); target.owner.dispose(); }
    });
  }
  test(`${mode} failed adoption consumes recoil once, then cancellation and a newer restore discard it`, async () => {
    const original = station(1), source = await rig(original), regenerated = station(9), target = await rig(regenerated);
    const adopt = target.owner.adoptWorldSnapshot;
    try {
      const payload = await payloadFor(source, original);
      target.system.deserialize(structuredClone(payload), { deferNative: true });
      target.owner.adoptWorldSnapshot = () => {
        assert.ok(regenerated.physicsBody.anchorRecoil, 'recoil must be present before native adoption');
        assert.equal(target.system._pendingAnchoredRecoil, null, 'consume before a throwing native boundary');
        throw new Error('injected native failure');
      };
      assert.throws(() => complete(target.system, mode), /injected native failure/);
      target.system.cancelRestore();
      assert.equal(target.system._pendingAnchoredRecoil, null);
      target.owner.adoptWorldSnapshot = adopt;
      const newer = station(11, 900);
      target.state.entityList = [newer]; target.state.entities = new Map([[newer.id, newer]]);
      target.system.deserialize(null, { deferNative: true });
      complete(target.system, mode);
      assert.equal(newer.physicsBody.anchorRecoil, undefined);
      assert.equal(newer.pos.x, 900);
      assert.equal(target.owner.records.get(11).body.isFixed(), true);
      assert.equal(target.system._pendingAnchoredRecoil, null);
    } finally { target.owner.adoptWorldSnapshot = adopt; source.owner.dispose(); target.owner.dispose(); }
  });
}
