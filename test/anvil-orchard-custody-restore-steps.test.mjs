import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './fixtures/anvil-orchard-custody-source.mjs';
import { ready } from './fixtures/anvil-orchard-custody-ready.mjs';

for (const phase of ['stowed', 'drifting']) {
  for (const native of [true, false]) {
    test(`paced save restore preserves ${phase} Orchard custody through ${native ? 'native adoption' : 'scalar fallback'}`, async () => {
      const h = phase === 'drifting' ? await ready() : await setup();
      try {
        if (phase === 'stowed') assert.equal(h.accept(), 4);
        const saves = h.sim.registry.get('save');
        const envelope = JSON.parse(JSON.stringify(saves.serialize('orchard-paced')));
        delete envelope.checksum;
        if (!native) envelope.data.physics = null;
        const expected = structuredClone(h.sim.state.sites.anvilOrchard);
        const savedPod = h.sim.state.entityList.find(e => e.data?.orchardKind === 'pod');
        const lot = savedPod.data.worldRecordId;
        const complete = h.facade.completeRestoreSteps;
        const stages = [];
        h.facade.completeRestoreSteps = function* (options) {
          for (const stage of complete.call(this, options)) { stages.push(stage); yield stage; }
        };
        for (let pass = 0; pass < 2; pass++) {
          const prepared = saves._prepareEnvelope(structuredClone(envelope));
          assert.equal(prepared.ok, true);
          assert.equal(await saves._restorePreparedEnvelopeAsync(prepared, 'orchard-paced'), true);
          assert.ok(stages.includes('native-restore-adopted'));
          assert.equal(h.facade._nativeRestorePending, false);
          assert.equal(h.sim.state.physicsRuntime.nativeRestore.mode, native ? 'native' : 'scalar');
          assert.deepEqual(h.sim.state.sites.anvilOrchard, expected);
          const pods = h.sim.state.entityList.filter(e => e.alive !== false && e.data?.worldRecordId === lot);
          assert.equal(pods.length, 1);
          assert.equal(pods[0].data.amount, 4);
          const record = h.facade._sg02.records.get(pods[0].id);
          assert.ok(record);
          assert.equal(record.body.isDynamic(), phase === 'drifting');
          assert.equal(!!h.facade.readOrchardPodReady(pods[0]), phase === 'drifting');
          assert.equal(h.facade._sg02.readOrchardPodReady(savedPod, h.sim.state), null);
        }
      } finally { h.close(); }
    });
  }
}
