#!/usr/bin/env node
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { validateObserverRecords, validateRecordingHealth } from '../src/contracts/observatorySchemas.js';
import { createSessionObserver } from '../src/observability/sessionObserver.js';

const TICKS = 600;
const state = createGameState(47001);
state.mode = 'flight';
state.world.currentSectorId = 'sector_helios_prime';
state.input.actions = {
  brake: false, cruise: false, tetherFire: false, tetherCut: false, reelDelta: 0,
  chargeThrow: false, chargeDetonate: false, scanPulse: false, autopursuit: false,
  deployBeacon: false, futureActionField: 'kept',
};

const observer = createSessionObserver({
  enabled: true,
  capacity: 4096,
  sessionId: 'obs-rates-600',
  getAIIntent: (s) => ({ tick: s.tick, decisions: [] }),
  getAssetExposure: () => ({
    assets: [{ id: 'ship_hitch', authored: true, lod: 0, authoredReadableFallbackRetained: true }],
  }),
});

for (let tick = 1; tick <= TICKS; tick += 1) {
  state.tick = tick;
  state.simTime = tick / 60;
  state.input.moveX = (tick % 3) - 1;
  state.input.actions.cruise = tick % 120 === 0;
  state.input.actions.reelDelta = tick % 30 === 0 ? -0.25 : 0;
  observer.afterInput(state);
  observer.afterSimStep(state);
  observer.onRenderFrame(state, 1 / 60, 0.5);
}

const stopped = observer.stop({ state, expectedTicks: TICKS });
const records = stopped.records;
const byKind = Object.groupBy(records, (record) => record.kind);
assert.equal(byKind.applied_input.length, 600, '600 fixed ticks require exactly 600 applied inputs');
assert.equal(byKind.state_sample.length, 200, 'state cadence must be exactly 20 Hz');
assert.equal(byKind.asset_exposure.length, 100, 'asset cadence must be exactly 10 Hz');
assert.equal(byKind.frame_perf.length, 600, 'one raw frame record per supplied render frame');
assert.equal(byKind.hash_checkpoint.length, 11, 'ten periodic hashes plus one final hash');
assert.deepEqual(byKind.state_sample.map((record) => record.tick),
  Array.from({ length: 200 }, (_, index) => (index + 1) * 3));
assert.deepEqual(byKind.asset_exposure.map((record) => record.tick),
  Array.from({ length: 100 }, (_, index) => (index + 1) * 6));
assert.equal(byKind.applied_input.at(-1).input.actions.futureActionField, 'kept',
  'unknown future action fields remain recorded without importing input implementation');
assert.equal(validateObserverRecords(records, { startingSeq: 1 }).ok, true,
  'record sequence and shape validate');
assert.deepEqual(records.map((record) => record.seq),
  Array.from({ length: records.length }, (_, index) => index + 1),
  'sequence ids are globally monotonic');
assert.equal(validateRecordingHealth(stopped.health, { expectedTicks: TICKS }).ok, true,
  JSON.stringify(validateRecordingHealth(stopped.health, { expectedTicks: TICKS }).issues));
assert.equal(stopped.health.droppedRecordCount, 0);
assert.equal(stopped.health.observerFaultCount, 0);

console.log('[check-observatory-rates] PASS — 600 input, 200 state, 100 asset, 600 frame, 11 hash records');
