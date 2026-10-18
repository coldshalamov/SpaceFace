import assert from 'node:assert/strict';
import test from 'node:test';
import { readTimeEffectsRequests } from '../src/core/timeEffects.js';
import { GameStartReadinessError } from '../src/core/newGameStartTransition.js';
import { traffic } from '../src/systems/traffic.js';
import { anvilWorkerRecordId } from '../src/systems/anvilWork.js';
import { isOrchardFrame } from '../src/data/anvilOrchardIdentity.js';
import { deferred, nextHostTurn, productionContinueFixture } from './fixtures/production-continue-finalizer.mjs';

function assertProductionOwners(h) {
  const manifest = h.runtime.manifest;
  assert.equal(manifest.evidenceClass, 'production-manifest');
  assert.deepEqual(manifest.exclusions, ['render', 'vfx', 'feel', 'audio', 'ui'].map(id => `node-excluded:${id}`));
  for (const id of ['physics', 'environmentalMachinery', 'planetRuntime', 'fields', 'traffic', 'world',
    'spawnBudget', 'mining', 'cargo', 'chronicler', 'save', 'aiSlot', 'flightSlot']) {
    assert.ok(manifest.authoritativeSystemIds.includes(id), `production owner ${id} is present`);
  }
  assert.equal(h.registry.get('traffic').definition, traffic, 'full traffic, with no _stepAnvilWork-only substitute');
  assert.equal(manifest.selectedSlots.aiBackend, 'sg06-tactical');
  assert.equal(manifest.selectedSlots.flightBackend, 'v3');
}

test('production Orchard Continue retains loading until the real finalizer and first-picture hold release', { timeout: 15000 }, async () => {
  const gate = deferred(), entered = deferred();
  const h = await productionContinueFixture({ picture: () => { entered.resolve(); return gate.promise; } });
  try {
    assertProductionOwners(h);
    const ledger = structuredClone(h.state.sites.anvilOrchard), tick = h.state.tick;
    assert.equal(await h.load(), true);
    await entered.promise;
    assert.deepEqual(h.loadCalls, [['quick', { preferAsync: true }]]);
    assert.equal(h.finalizerCalls(), 1);
    assert.equal(h.state.tick, tick, 'restore and finalization consume no simulation ticks');
    assert.equal(h.state.mode, 'loading');
    assert.equal(h.state.timeScale, 0);
    assert.equal(h.events.filter(e => e.name === 'ui:closeAll').length, 0);
    assert.equal(h.events.find(e => e.name === 'save:loaded').payload.visualGatePending, true);
    const physics = h.registry.get('physics');
    assert.equal(physics._nativeRestorePending, false);
    assert.ok(physics._sg02.records.has(h.state.playerId));
    const frame = h.state.entityList.find(e => e.alive !== false && e.data?.orchardKind === 'frame');
    assert.ok(frame && physics._sg02.records.has(frame.id));
    assert.deepEqual(h.state.sites.anvilOrchard, ledger);
    gate.resolve(true);
    assert.deepEqual(await h.finalization(), { stale: false });
    await nextHostTurn();
    assert.equal(h.state.mode, 'flight');
    assert.equal(h.state.timeScale, 0, 'main still waits for an actual presentation receipt');
    assert.ok(readTimeEffectsRequests(h.state)['runtime:first-picture']);
    assert.equal(h.state.render.releaseOpeningPresentationHold(), false, 'no submitted picture cannot release control');
    // Explicit headless presentation-port substitution, not a GPU/browser proof.
    h.state.render.worldSubmittedFrames = (Number(h.state.render.worldSubmittedFrames) || 0) + 1;
    assert.equal(h.state.render.releaseOpeningPresentationHold(), true);
    assert.equal(h.state.timeScale, 1);
    assert.equal(h.events.filter(e => e.name === 'ui:closeAll').length, 1);
    assert.deepEqual(h.events.filter(e => e.name === 'save:error' || e.name === 'game:startFailed'), []);
    h.runtime.step(); // one bounded full-owner post-Continue step, not a route segment
    assert.equal(h.state.tick, tick + 1);
    assert.deepEqual(h.state.sites.anvilOrchard, ledger);
    const sources = h.state.entityList.filter(e => e.alive !== false && isOrchardFrame(e));
    assert.equal(sources.length, 1, 'the complete production tick retains one canonical source');
    assert.equal(sources[0].flags.persistent, true);
    assert.ok(physics._sg02.records.has(sources[0].id));
    assert.ok(physics.readOrchardFramePose(sources[0]), 'current native source/motor pose survives finalization');
    for (const role of ['collector', 'receiver']) {
      const recordId = anvilWorkerRecordId(h.state, role);
      const carriers = [...h.state.entityList, ...(h.state.world.farActors?.rows || [])]
        .filter(e => e.alive !== false && e.data?.worldRecordId === recordId);
      assert.equal(carriers.length, 1, `${role} has one durable carrier after the full tick`);
      assert.equal(carriers[0].mass, 55);
      assert.equal(carriers[0].data.cargoManifest.totalQty, 0);
    }
  } finally { gate.resolve(true); h.close(); }
});

test('production-composed Continue preserves an actual graphics rejection and never hands over flight', { timeout: 15000 }, async () => {
  const gate = deferred(), entered = deferred();
  const h = await productionContinueFixture({ picture: () => { entered.resolve(); return gate.promise; } });
  try {
    assert.equal(await h.load(), true);
    await entered.promise;
    const failure = new GameStartReadinessError('GPU_RESIDENCY_UNAVAILABLE', 'gpu-resources', 'headless test graphics verdict refused');
    gate.reject(failure);
    await assert.rejects(h.finalization(), error => error === failure);
    await nextHostTurn();
    assert.equal(h.state.mode, 'menu');
    assert.equal(h.state.timeScale, 0);
    assert.equal(h.events.filter(e => e.name === 'ui:closeAll').length, 0);
    const startFailure = h.events.find(e => e.name === 'game:startFailed');
    assert.equal(startFailure.payload.code, failure.code);
    assert.equal(startFailure.payload.stage, failure.stage);
    assert.equal(h.events.filter(e => e.name === 'save:error').length, 1);
    assert.equal(h.events.find(e => e.name === 'save:error').payload.reason, 'visual_gate_failed');
    assert.equal(h.saves._restoring, false);
  } finally { gate.resolve(true); h.close(); }
});

test('a focused-export Chronicler placeholder refuses before production finalization', { timeout: 15000 }, async () => {
  const setup = await productionContinueFixture();
  const broken = structuredClone(setup.envelope);
  setup.close();
  broken.data.chronicler = {}; // the omitted-owner export, not production-generated memory
  const h = await productionContinueFixture({ inputEnvelope: broken });
  try {
    assert.equal(await h.load(broken), false);
    assert.equal(h.finalizerCalls(), 0);
    assert.equal(h.events.filter(e => e.name === 'ui:closeAll').length, 0);
    const failure = h.events.find(e => e.name === 'save:error');
    assert.equal(failure.payload.reason, 'load_failed');
    assert.equal(failure.payload.region, 'chronicler');
    assert.match(failure.payload.error, /Invalid Chronicler snapshot: unsupported schemaVersion/);
    assert.equal(h.saves._restoring, false);
  } finally { h.close(); }
});
