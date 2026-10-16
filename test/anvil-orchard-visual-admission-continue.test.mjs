import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './fixtures/anvil-orchard-custody-source.mjs';
import { ready } from './fixtures/anvil-orchard-custody-ready.mjs';

// Browser main.js installs finalizeLoadedGame. saveSystem deliberately retains loading
// until that visual gate completes, including while completeRestoreSteps adopts physics.
// These are real save-owner restores, with a headless finalizer standing in for visual work.
for (const phase of ['empty', 'stowed', 'drifting']) {
  for (const native of [true, false]) {
    for (const paced of [false, true]) {
      test(`${phase} Orchard UI Continue: ${native ? 'native' : 'scalar'}, ${paced ? 'paced' : 'sync'}`, async () => {
        const h = phase === 'drifting' ? await ready() : await setup();
        try {
          if (phase === 'stowed') assert.equal(h.accept(), 4);
          const state = h.sim.state, saves = h.sim.registry.get('save');
          const expected = structuredClone(state.sites.anvilOrchard);
          const envelope = JSON.parse(JSON.stringify(saves.serialize('orchard-visual-admission')));
          assert.ok(envelope.data.physics);
          delete envelope.checksum;
          if (!native) envelope.data.physics = null;
          let finalizerCalls = 0, completion;
          h.sim.helpers.finalizeLoadedGame = () => {
            finalizerCalls++;
            assert.equal(state.mode, 'loading');
            assert.equal(h.facade._nativeRestorePending, false,
              'native adoption must finish before the ordinary visual finalizer');
            const frame = state.entityList.find(e => e.alive !== false && e.data?.orchardKind === 'frame');
            const pod = state.entityList.find(e => e.alive !== false && e.data?.orchardKind === 'pod');
            assert.equal(h.machine.requestOrchardRelease(frame, 1), false,
              'loading retention never authorizes a release');
            if (pod) assert.equal(h.facade.readOrchardPodReady(pod), null,
              'loading retention never publishes active pickup authority');
            completion = h.facade.prepareBackend(state).then(ok => {
              assert.equal(ok, true, 'the main finalizer backend preparation remains idempotent');
              state.mode = 'flight';
            });
            return completion;
          };
          if (paced) {
            const prepared = saves._prepareEnvelope(envelope);
            assert.equal(prepared.ok, true);
            assert.equal(await saves._restorePreparedEnvelopeAsync(prepared, 'orchard-visual-admission'), true);
          } else assert.equal(saves.loadEnvelope(envelope), true);
          assert.equal(finalizerCalls, 1);
          await completion;
          assert.equal(state.mode, 'flight');
          assert.deepEqual(state.sites.anvilOrchard, expected);
          const frame = state.entityList.find(e => e.alive !== false && e.data?.orchardKind === 'frame');
          const pod = state.entityList.find(e => e.alive !== false && e.data?.orchardKind === 'pod');
          assert.ok(frame);
          if (phase === 'stowed') assert.equal(h.machine.requestOrchardRelease(frame, 1), true);
          if (phase === 'drifting') assert.ok(h.facade.readOrchardPodReady(pod));
        } finally { h.close(); }
      });
    }
  }
}

for (const replacement of ['ledger', 'source-data']) {
  test(`loading Continue refuses ${replacement} replacement before native adoption`, async () => {
    const h = await ready();
    const prototype = Object.getPrototypeOf(h.owner), adopt = prototype._adoptRecord;
    let changed = false, completion;
    try {
      const state = h.sim.state, saves = h.sim.registry.get('save');
      const envelope = JSON.parse(JSON.stringify(saves.serialize('orchard-loading-tampered')));
      delete envelope.checksum;
      h.sim.helpers.finalizeLoadedGame = () => {
        completion = h.facade.prepareBackend(state);
        return completion;
      };
      prototype._adoptRecord = function (entity, ...args) {
        const result = adopt.call(this, entity, ...args);
        if (!changed && entity !== h.frame && entity.data?.orchardKind === 'frame') {
          changed = true;
          if (replacement === 'ledger') state.sites.anvilOrchard = structuredClone(state.sites.anvilOrchard);
          else entity.data = { ...entity.data };
        }
        return result;
      };
      saves.loadEnvelope(envelope);
      assert.equal(changed, true);
      assert.equal(await completion, false, 'the visual finalizer cannot admit rejected native inputs');
      assert.equal(state.mode, 'loading');
      assert.equal(h.facade._nativeRestorePending, true);
      assert.equal(await h.facade.prepareBackend(state), false);
    } finally { prototype._adoptRecord = adopt; h.close(); }
  });
}

test('ordinary mode changes cannot mint loading custody without a cold restore plan', async () => {
  const h = await setup();
  try {
    h.sim.state.mode = 'loading';
    assert.equal(h.accept(), 0);
    assert.equal(h.machine.requestOrchardRelease(h.frame, 1), false);
    h.sim.state.mode = 'flight';
    assert.equal(h.accept(), 4);
    h.sim.state.mode = 'loading';
    assert.equal(h.machine.requestOrchardRelease(h.frame, 1), false);
    assert.equal(h.sim.state.sites.anvilOrchard.sourceRemaining, 44);
  } finally { h.close(); }
});

for (const native of [true, false]) {
  test(`away-sector UI Continue retains the original drifting lot with ${native ? 'native' : 'scalar'} adoption`, async () => {
    const h = await ready();
    try {
      const state = h.sim.state, saves = h.sim.registry.get('save');
      const homeSector = state.world.currentSectorId;
      const awaySector = 'sector_ceres_orbit';
      state.world.currentSectorId = awaySector;
      const expected = structuredClone(state.sites.anvilOrchard);
      const lotId = h.pod.data.worldRecordId;
      const envelope = JSON.parse(JSON.stringify(saves.serialize('orchard-away-visual-admission')));
      delete envelope.checksum;
      if (!native) envelope.data.physics = null;
      let completion;
      h.sim.helpers.finalizeLoadedGame = () => {
        assert.equal(state.mode, 'loading');
        assert.equal(h.facade._nativeRestorePending, false);
        completion = h.facade.prepareBackend(state).then(ok => {
          assert.equal(ok, true);
          state.mode = 'flight';
        });
        return completion;
      };
      const prepared = saves._prepareEnvelope(envelope);
      assert.equal(prepared.ok, true);
      assert.equal(await saves._restorePreparedEnvelopeAsync(prepared, 'orchard-away-visual-admission'), true);
      await completion;
      assert.equal(state.mode, 'flight');
      assert.equal(state.world.currentSectorId, awaySector);
      assert.deepEqual(state.sites.anvilOrchard, expected);
      const frame = state.entityList.find(e => e.alive !== false && e.data?.orchardKind === 'frame');
      const pods = state.entityList.filter(e => e.alive !== false && e.data?.worldRecordId === lotId);
      assert.equal(pods.length, 1);
      assert.equal(pods[0].data.amount, 4);
      assert.equal(h.facade.readOrchardPodReady(pods[0]), null);
      assert.equal(h.machine.requestOrchardRelease(frame, 1), false);
      state.world.currentSectorId = homeSector;
      assert.ok(h.facade.readOrchardPodReady(pods[0]));
      assert.deepEqual(state.sites.anvilOrchard, expected);
    } finally { h.close(); }
  });
}
