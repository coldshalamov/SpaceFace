#!/usr/bin/env node
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { validateObserverRecords, validateRecordingHealth } from '../src/contracts/observatorySchemas.js';
import { createSessionObserver } from '../src/observability/sessionObserver.js';

const state = createGameState(47002);
state.mode = 'flight';
state.input.actions = { cruise: false, futureActionField: 'stress' };
const observer = createSessionObserver({
  enabled: true,
  capacity: 1024,
  sessionId: 'obs-health-stress',
  getAIIntent: () => null,
  getAssetExposure: () => ({ assets: [] }),
});

let drainedCount = 0;
let expectedSeq = 1;
for (let tick = 1; tick <= 5000; tick += 1) {
  state.tick = tick;
  state.simTime = tick / 60;
  observer.afterInput(state);
  observer.afterSimStep(state);
  observer.onRenderFrame(state, 1 / 60, 0.5);
  if (tick % 200 === 0) {
    const chunk = observer.drain();
    const validation = validateObserverRecords(chunk.records, { startingSeq: expectedSeq });
    assert.equal(validation.ok, true, validation.issues.join('\n'));
    expectedSeq += chunk.records.length;
    drainedCount += chunk.records.length;
  }
}
const finalChunk = observer.stop({ state, expectedTicks: 5000 });
assert.equal(validateObserverRecords(finalChunk.records, { startingSeq: expectedSeq }).ok, true);
drainedCount += finalChunk.records.length;
assert.ok(drainedCount > 10000, `stress must exceed 10,000 records, got ${drainedCount}`);
assert.equal(finalChunk.health.drainedRecordCount, drainedCount);
assert.equal(finalChunk.health.droppedRecordCount, 0);
assert.equal(finalChunk.health.observerFaultCount, 0);
assert.equal(validateRecordingHealth(finalChunk.health, { expectedTicks: 5000 }).ok, true,
  validateRecordingHealth(finalChunk.health, { expectedTicks: 5000 }).issues.join('\n'));

const overflow = createSessionObserver({ enabled: true, capacity: 32, sessionId: 'forced-overflow' });
for (let tick = 1; tick <= 100; tick += 1) {
  state.tick = tick;
  state.simTime = tick / 60;
  overflow.afterInput(state);
}
const overflowed = overflow.stop({ state, expectedTicks: 100 });
assert.ok(overflowed.health.droppedRecordCount > 0);
assert.equal(overflowed.health.overflowed, true);
assert.equal(overflowed.health.validForRecording, false);
assert.equal(validateRecordingHealth(overflowed.health, { expectedTicks: 100 }).ok, false,
  'forced overflow must be acceptance-invalid');

const fault = createSessionObserver({
  enabled: true,
  sessionId: 'forced-fault',
  samplers: { sampleAppliedInput() { throw new Error('forced sampler fault'); } },
});
assert.doesNotThrow(() => fault.afterInput(state), 'observer faults never enter gameplay');
const faulted = fault.stop({ state, expectedTicks: 1 });
assert.equal(faulted.health.observerFaultCount, 1);
assert.equal(faulted.health.validForRecording, false);

const isolated = createSessionObserver({ enabled: true, sessionId: 'clone-isolation' });
const sourcePayload = { nested: { value: 7 } };
isolated.recordEvent('fixture:event', sourcePayload, state);
const isolatedDrain = isolated.drain();
isolatedDrain.records[0].payload.nested.value = 999;
assert.equal(sourcePayload.nested.value, 7, 'drain mutation cannot alias source payload');
assert.equal(isolated.drain().records.length, 0);
const stopped = isolated.stop({ state });
const countAtStop = stopped.health.totalRecordCount;
isolated.afterInput(state);
assert.equal(isolated.health().totalRecordCount, countAtStop, 'stopped hooks are inert');

console.log(`[check-observatory-recording-health] PASS — ${drainedCount} records drained losslessly; overflow/fault invalidated`);
