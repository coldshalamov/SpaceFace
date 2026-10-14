import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBoundedImpulseReceiptCollector,
  gradeCausalResidual,
  mapImpulseReceiptIdentities,
} from '../src/testing/playerTruth/impulseReceipts.js';
import { checkSpawnMotion, CLS, VIS } from '../scripts/player-truth/checks.mjs';

test('production-host impulse observer installs against the authoritative state', async () => {
  const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
  const { readFile } = await import('node:fs/promises');
  const scenarioContract = JSON.parse(await readFile(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
  const api = createSimHost();
  try {
    await api.init({ profile: 'production', seed: 4242, scenarioContract });
    const observer = api.host.rpcHandlers.get('playerTruthImpulseObserver');
    const installed = observer({ action: 'install', maxReceipts: 256, maxTicks: 120 });
    assert.equal(installed.ok, true);
    assert.equal(installed.status, 'armed');
    assert.equal(observer({ action: 'begin', tick: 0 }).ok, true);
    const capture = observer({ action: 'finalize' });
    assert.equal(capture.ok, true);
    assert.notEqual(capture.status, 'unsupported');
    assert.deepEqual(capture.receipts, []);
  } finally {
    api.shutdown();
  }
});

const observation = ({ id = 35, generation = 7, tick, delta = 10, mode = 'flight', field = {} } = {}) => ({
  entity: { id, occupantGeneration: generation },
  before: { x: 0, z: 0 }, after: { x: delta, z: 0 }, tick, mode, kind: 'field',
  provenance: { tag: 'field_cone', field: { id: 'cone-1', ownerId: 9, x: 0, z: 0, radius: 100, ...field } },
});

test('bounded collector retains field impulses before begin and excludes non-flight observations', () => {
  const collector = createBoundedImpulseReceiptCollector({ maxReceipts: 8, maxTicks: 5 });
  assert.equal(collector.arm(), 'missing-start');
  assert.equal(collector.record(observation({ tick: 8 })), true);
  assert.equal(collector.record(observation({ tick: 9, mode: 'menu' })), false);
  assert.equal(collector.record(observation({ tick: 12, delta: 4 })), true);
  const started = collector.begin(10);
  assert.equal(started.status, 'started');
  assert.equal(started.flightStartTick, 8);
  assert.equal(started.preStartReceiptCount, 1, 'repeated field delivery uses one bounded stream');
  const capture = collector.snapshot();
  assert.equal(capture.status, 'complete');
  assert.equal(capture.receiptCount, 1);
  assert.deepEqual(capture.receipts[0].samples.map((sample) => sample.tick), [8, 12]);
  assert.equal(capture.ignoredCount, 1);
  assert.equal(collector.record(observation({ tick: 13 })), false, 'end tick is exclusive');
  assert.equal(collector.snapshot().receiptCount, 1);
});

test('collector is bounded and fail-closed for overflow and incomplete field provenance', () => {
  const overflow = createBoundedImpulseReceiptCollector({ maxReceipts: 2, maxTicks: 20 });
  overflow.arm();
  assert.equal(overflow.record(observation({ tick: 1, field: { id: 'cone-a' } })), true);
  assert.equal(overflow.record(observation({ tick: 2, field: { id: 'cone-b' } })), true);
  assert.equal(overflow.record(observation({ tick: 3, field: { id: 'cone-c' } })), false);
  overflow.begin(1);
  assert.equal(overflow.snapshot().status, 'overflow');
  assert.equal(overflow.snapshot().receiptCount, 2);

  const invalid = createBoundedImpulseReceiptCollector();
  invalid.arm();
  assert.equal(invalid.record(observation({ tick: 1, field: { id: null } })), false);
  invalid.begin(1);
  assert.equal(invalid.snapshot().status, 'invalid-receipt');
  assert.equal(gradeCausalResidual(invalid.snapshot(), {
    readerLifeId: 35, rawEntityId: 35, occupantGeneration: 7, throughTick: 1, velocity: { x: 18, z: 0 },
  }).ok, false);

  const external = createBoundedImpulseReceiptCollector();
  external.arm();
  assert.equal(external.record(observation({ tick: 1, field: {
    id: 'planet_pull', ownerId: null, x: 20, z: -4, radius: 240,
  } })), false);
  external.begin(1);
  assert.equal(external.snapshot().status, 'complete', 'ownerless external fields cannot poison owned-field proof');
  assert.equal(external.snapshot().invalidCount, 0);
  assert.equal(external.snapshot().ignoredUnownedFieldCount, 1);

  const ambiguous = createBoundedImpulseReceiptCollector();
  ambiguous.arm();
  const withoutField = observation({ tick: 1 });
  withoutField.provenance = { tag: 'field_cone' };
  assert.equal(ambiguous.record(withoutField), false);
  ambiguous.begin(1);
  assert.equal(ambiguous.snapshot().status, 'complete', 'ambiguous overlap is ignored, not a claimed proof');
  assert.equal(ambiguous.snapshot().invalidCount, 0);
  assert.equal(ambiguous.snapshot().ignoredCount, 1);
});

test('compact field samples preserve exact through-tick residual grading', () => {
  const collector = createBoundedImpulseReceiptCollector({ maxReceipts: 2, maxTicks: 20 });
  collector.arm();
  collector.record(observation({ tick: 10, delta: 3 }));
  collector.record(observation({ tick: 11, delta: 4 }));
  collector.record(observation({ tick: 12, delta: 5 }));
  collector.begin(10);
  const capture = mapImpulseReceiptIdentities(collector.snapshot(), (id, generation) => (
    id === 35 && generation === 7 ? 35 : null
  ));
  assert.equal(capture.status, 'complete');
  assert.equal(capture.receiptCount, 1);
  assert.equal(capture.seriesPointCount, 3);
  const explained = gradeCausalResidual(capture, {
    readerLifeId: 35, rawEntityId: 35, occupantGeneration: 7, throughTick: 11,
    velocity: { x: 7, z: 0 },
  });
  assert.equal(explained.ok, true);
  assert.deepEqual(explained.deltaV, { x: 7, z: 0 });
  assert.equal(explained.matchedReceipts, 2);
});

test('causal residual requires the exact raw id, occupant generation and mapped reader life', () => {
  const collector = createBoundedImpulseReceiptCollector({ maxTicks: 20 });
  collector.arm(); collector.record(observation({ tick: 10 })); collector.begin(10);
  const capture = mapImpulseReceiptIdentities(collector.snapshot(), (id, generation) => (
    id === 35 && generation === 7 ? 35 : null
  ));
  const explained = gradeCausalResidual(capture, {
    readerLifeId: 35, rawEntityId: 35, occupantGeneration: 7, throughTick: 10, velocity: { x: 18, z: 0 },
  });
  assert.equal(explained.ok, true);
  assert.equal(explained.speed, 8);
  assert.deepEqual(explained.deltaV, { x: 10, z: 0 });
  assert.equal(gradeCausalResidual(capture, {
    readerLifeId: 35, rawEntityId: 35, occupantGeneration: 8, throughTick: 10, velocity: { x: 18, z: 0 },
  }).reason, 'missing-proof');
  assert.equal(gradeCausalResidual({ ...capture, unresolvedIdentityCount: 1 }, {
    readerLifeId: 35, rawEntityId: 35, occupantGeneration: 7, throughTick: 10, velocity: { x: 18, z: 0 },
  }).reason, 'missing-identity');
});

function openingTrace(forceProvenance) {
  return {
    meta: { mode: 'adventure', rounds: false, playStartSim: 0 }, rounds: [], events: [],
    samples: [
      { f: 1, t: 16, sim: 0, tick: 9, mode: 'menu', p: null, e: [] },
      { f: 2, t: 32, sim: 0.033, tick: 10, mode: 'flight', p: { x: 0, z: 0 },
        e: [[35, CLS.asteroid, 100, 0, 18, 0, 640, 360, 8, VIS.onscreen, -1, 0]] },
    ],
    ...(forceProvenance ? { forceProvenance } : {}),
  };
}

test('spawn_motion only promotes a delivered field receipt through the first observed sample', () => {
  const collector = createBoundedImpulseReceiptCollector({ maxTicks: 20 });
  collector.arm(); collector.record(observation({ tick: 10 })); collector.begin(10);
  const forceProvenance = mapImpulseReceiptIdentities(collector.snapshot(), (id, generation) => (
    id === 35 && generation === 7 ? 35 : null
  ));
  forceProvenance.requested = true;
  const explained = checkSpawnMotion(openingTrace(forceProvenance));
  assert.equal(explained.status, 'PASS');
  assert.equal(explained.causal.explained, 1);
  assert.equal(checkSpawnMotion(openingTrace()).status, 'FAIL', 'old captures stay strict');

  const overflow = { ...forceProvenance, status: 'overflow', overflow: true };
  const blocked = checkSpawnMotion(openingTrace(overflow));
  assert.equal(blocked.status, 'FAIL');
  assert.equal(blocked.causal.proofFailures, 1);
});
