import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './fixtures/anvil-orchard-custody-source.mjs';
import { ready, tail } from './fixtures/anvil-orchard-custody-ready.mjs';
import { ANVIL_ORCHARD } from '../src/data/anvilOrchard.js';
import { world } from '../src/systems/world.js';
import { physicsReachWuFromState } from '../src/world/activityRuntime.js';
import { applyFrameOrigin, snapFrameOrigin } from '../src/core/coordinates.js';

const AWAY_SECTOR = 'sector_ceres_orbit';

for (const phase of ['empty', 'stowed', 'drifting']) {
  for (const native of [true, false]) {
    for (const paced of [false, true]) {
    test(`${paced ? 'Paced ' : ''}Continue outside Anvil preserves ${phase} Orchard custody through ${native ? 'native adoption' : 'scalar fallback'}`, async () => {
      const h = phase === 'drifting' ? await ready() : await setup();
      try {
        if (phase === 'stowed') assert.equal(h.accept(), 4);
        const state = h.sim.state;
        const expectedRow = structuredClone(state.sites.anvilOrchard);
        const expectedCollars = structuredClone(h.frame.data.orchardCollars);
        const frameRecordId = h.frame.data.worldRecordId;
        // The production residency owner explicitly retains this ordinary frame because
        // planetRuntime marks it persistent. Leaving its sector does not remove it from
        // the save's entity census, even before any harvest or release has happened.
        assert.equal(world._isProtectedFromResidency.call({ state }, h.frame), true);
        h.sim.bus.emit('sector:exit', { sectorId: ANVIL_ORCHARD.sectorId });
        state.world.currentSectorId = AWAY_SECTOR;
        const saves = h.sim.registry.get('save');
        const envelope = JSON.parse(JSON.stringify(saves.serialize('orchard-away-sector')));
        assert.ok(envelope.data.physics, 'the ordinary save includes a native snapshot');
        delete envelope.checksum;
        if (!native) envelope.data.physics = null;

        let loaded;
        if (paced) {
          const prepared = saves._prepareEnvelope(envelope);
          assert.equal(prepared.ok, true);
          loaded = await saves._restorePreparedEnvelopeAsync(prepared, 'orchard-away-sector');
        } else loaded = saves.loadEnvelope(envelope);
        console.log(JSON.stringify({ phase, native, paced, loaded,
          nativeRestorePending: h.facade._nativeRestorePending,
          currentSectorId: state.world.currentSectorId }));
        assert.equal(loaded, true, 'a persistent Orchard in another sector must not reject Continue');
        assert.equal(h.facade._nativeRestorePending, false);
        assert.equal(state.world.currentSectorId, AWAY_SECTOR);
        assert.deepEqual(state.sites.anvilOrchard, expectedRow);
        const frames = state.entityList.filter(e => e.alive !== false
          && e.data?.worldRecordId === frameRecordId);
        assert.equal(frames.length, 1);
        h.frame = frames[0];
        h.worker = state.entities.get(state.playerId);
        assert.deepEqual(h.frame.data.orchardCollars, expectedCollars);
        assert.equal(h.machine.requestOrchardRelease(h.frame, 1), false,
          'cold preservation does not authorize release from another sector');
        const restoredPod = state.entityList.find(e => e.alive !== false && e.data?.orchardKind === 'pod');
        if (restoredPod) assert.equal(h.facade.readOrchardPodReady(restoredPod), null,
          'public ready authority stays inactive while outside Anvil');

        state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
        assert.ok(h.facade.readOrchardFramePose(h.frame));
        if (phase === 'stowed') assert.equal(h.machine.requestOrchardRelease(h.frame, 1), true,
          'returning to Anvil permits a fresh ordinary release');
        if (phase === 'drifting') {
          const pods = state.entityList.filter(e => e.alive !== false && e.data?.orchardKind === 'pod');
          assert.equal(pods.length, 1);
          assert.ok(h.facade.readOrchardPodReady(pods[0]), 'return preserves the same ready finite lot');
        }
      } finally { h.close(); }
    });
    }
  }
}

for (const phase of ['empty', 'stowed', 'drifting']) {
  for (const restore of ['none', 'native', 'scalar']) {
    test(`away-sector ${phase} native retirement and return preserve custody with ${restore} Continue`, async () => {
      const h = phase === 'drifting' ? await ready() : await setup();
      try {
        if (phase === 'stowed') assert.equal(h.accept(), 4);
        const state = h.sim.state, x = h.frame.pos.x, z = h.frame.pos.z;
        const expectedRow = structuredClone(state.sites.anvilOrchard);
        const distance = 3 * physicsReachWuFromState(state, h.worker) + 2000;
        const sync = tick => {
          state.tick = tick;
          state.simTime = tick / 60;
          applyFrameOrigin(state, snapFrameOrigin(h.worker.pos, {}));
          h.facade._syncSg02FrameOrigin(state);
          h.facade._syncSg02DynamicAuthorityEntities(state);
          tail(h, tick);
        };
        h.worker.pos.x = x + 100;
        h.worker.pos.z = z;
        h.worker.flags.noInterp = true;
        sync(31);
        assert.equal(h.owner.records.has(h.frame.id), true);
        state.world.currentSectorId = AWAY_SECTOR;
        h.worker.pos.x = x + distance;
        h.worker.flags.noInterp = true;
        sync(32);
        sync(154);
        assert.equal(h.owner.records.has(h.frame.id), false,
          'the source can leave native residency after its active sector changes');
        assert.equal(state.entities.get(h.frame.id), h.frame);
        if (phase === 'drifting') assert.equal(h.owner.records.has(h.pod.id), false,
          'the released pod can also retire outside its source sector');
        assert.deepEqual(state.sites.anvilOrchard, expectedRow);

        if (restore !== 'none') {
          const saves = h.sim.registry.get('save');
          const envelope = JSON.parse(JSON.stringify(saves.serialize('orchard-away-dormant')));
          delete envelope.checksum;
          if (restore === 'scalar') envelope.data.physics = null;
          assert.equal(saves.loadEnvelope(envelope), true);
          assert.equal(h.facade._nativeRestorePending, false);
          h.frame = state.entityList.find(e => e.data?.orchardKind === 'frame');
          h.worker = state.entities.get(state.playerId);
          if (phase === 'drifting') h.pod = state.entityList.find(e => e.data?.orchardKind === 'pod');
          assert.equal(h.owner.records.has(h.frame.id), false);
        }
        state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
        h.worker.pos.x = x + 100;
        h.worker.pos.z = z;
        h.worker.flags.noInterp = true;
        sync(155);
        assert.equal(h.owner.records.has(h.frame.id), true);
        assert.ok(h.facade.readOrchardFramePose(h.frame));
        assert.equal(h.owner._pendingNativeRebuilds.size, 0);
        assert.deepEqual(state.sites.anvilOrchard, expectedRow);
        if (phase === 'stowed') assert.equal(h.machine.requestOrchardRelease(h.frame, 1), true);
        if (phase === 'drifting') assert.ok(h.facade.readOrchardPodReady(h.pod));
      } finally { h.close(); }
    });
  }
}

for (const replacement of ['ledger', 'source-data']) {
  test(`away-sector cold Continue refuses ${replacement} replacement during native adoption`, async () => {
    const h = await ready();
    const prototype = Object.getPrototypeOf(h.owner), adopt = prototype._adoptRecord;
    let changed = false;
    try {
      const state = h.sim.state;
      state.world.currentSectorId = AWAY_SECTOR;
      const saves = h.sim.registry.get('save');
      const envelope = JSON.parse(JSON.stringify(saves.serialize('orchard-away-tampered')));
      assert.ok(envelope.data.physics);
      delete envelope.checksum;
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
      prototype._adoptRecord = adopt;
      assert.equal(changed, true);
      assert.equal(h.facade._nativeRestorePending, true);
      assert.equal(h.facade._finishNativeRestore(), false);
      assert.equal(await h.facade.prepareBackend(state), false);
      state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
      const frame = state.entityList.find(e => e.data?.orchardKind === 'frame');
      const pod = state.entityList.find(e => e.data?.orchardKind === 'pod');
      assert.equal(h.machine.requestOrchardRelease(frame, 1), false);
      assert.equal(h.facade.readOrchardPodReady(pod), null,
        'returning to Anvil cannot authorize replaced cold inputs');
    } finally { prototype._adoptRecord = adopt; h.close(); }
  });
}

test('leaving Anvil does not recapture a replaced live finite ledger as ready authority', async () => {
  const h = await ready();
  try {
    const state = h.sim.state;
    state.world.currentSectorId = AWAY_SECTOR;
    state.sites.anvilOrchard = structuredClone(state.sites.anvilOrchard);
    assert.equal(h.facade.readOrchardPodReady(h.pod), null);
    state.world.currentSectorId = ANVIL_ORCHARD.sectorId;
    assert.equal(h.facade.readOrchardPodReady(h.pod), null,
      'structural retention remains bound to the original ledger cell');
    assert.equal(h.owner.prepareOrchardPodCollection(h.pod, state), null);
  } finally { h.close(); }
});
