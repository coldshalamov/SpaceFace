import test from 'node:test';
import assert from 'node:assert/strict';
import { ready, tail } from './fixtures/anvil-orchard-custody-ready.mjs';

for (const native of [true, false]) {
  test(`released Orchard pod retains post-step pose resync through ${native ? 'native' : 'scalar'} Continue`, async () => {
    const h = await ready();
    try {
      tail(h, 31);
      const rec = h.owner.records.get(h.pod.id);
      assert.ok(rec.postStep && rec._postStepReadTick === h.owner.tick);
      const previous = { ...rec.postStep.p };
      h.pod.pos.x += 180;
      h.pod.pos.z += 70;
      h.pod.flags.noInterp = true;
      assert.equal(h.owner._maybeResyncBodyPose(rec, h.pod), true);
      assert.equal(rec.postStep.pDirty, true, 'the current upstream dirty guard survives Orchard integration');
      const actual = rec.body.translation();
      assert.notEqual(actual.x, previous.x);
      const kin = h.owner._enforcePlane(rec);
      assert.equal(kin.x, actual.x, 'do not republish the pre-resync cached native position');
      assert.equal(kin.z, actual.z);
      h.owner._syncEntityFromKinematics(rec, kin);
      h.facade._syncSg02DynamicAuthorityEntities(h.sim.state);
      const expected = { ...h.pod.pos };
      const row = structuredClone(h.sim.state.sites.anvilOrchard);
      const saves = h.sim.registry.get('save');
      const envelope = JSON.parse(JSON.stringify(saves.serialize('orchard-post-step')));
      assert.ok(envelope.data.physics);
      delete envelope.checksum;
      if (!native) envelope.data.physics = null;
      assert.equal(saves.loadEnvelope(envelope), true);
      const pods = h.sim.state.entityList.filter(e => e.alive !== false && e.data?.orchardKind === 'pod');
      assert.equal(pods.length, 1);
      assert.equal(pods[0].data.amount, 4);
      assert.deepEqual(h.sim.state.sites.anvilOrchard, row);
      assert.ok(Math.abs(pods[0].pos.x - expected.x) < .001);
      assert.ok(Math.abs(pods[0].pos.z - expected.z) < .001);
      assert.ok(h.facade.readOrchardPodReady(pods[0]));
    } finally { h.close(); }
  });
}
