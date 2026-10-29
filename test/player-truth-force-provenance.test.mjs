import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBoundedImpulseReceiptCollector,
  gradeCausalResidual,
  mapImpulseReceiptIdentities,
} from '../src/testing/playerTruth/impulseReceipts.js';
import { observeAppliedImpulse } from '../src/combat/stuntEvidence.js';
import { checkSpawnMotion, CLS, VIS } from '../scripts/player-truth/checks.mjs';

test('production-host observer reads and validates a live environmental field source', async () => {
  const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
  const { readFile } = await import('node:fs/promises');
  const scenarioContract = JSON.parse(await readFile(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
  const api = createSimHost();
  try {
    await api.init({ profile: 'production', seed: 4242, scenarioContract });
    const observer = api.host.rpcHandlers.get('playerTruthImpulseObserver');
    const state = api.host.state;
    state.mode = 'flight';
    const fields = api.host.registry.get('fields');
    const field = fields.registerEnvironmental({ id: 'player_truth_worker_env', kind: 'well',
      center: { x: 0, z: 0 }, radius: 100, strength: 50 });
    assert.ok(field);
    const entity = api.host.sim.spawn({ type: 'wreck', pos: { x: 40, z: 0 }, radius: 5, mass: 20,
      hull: 100, hullMax: 100, data: {} });
    assert.ok(entity && state.entities.get(entity.id) === entity, 'worker runtime owns the observed body');
    const installed = observer({ action: 'install', maxReceipts: 256, maxTicks: 120 });
    assert.equal(installed.ok, true);
    assert.equal(installed.status, 'armed');
    const deliveryTick = state.tick;
    observeAppliedImpulse(entity, { x: 0, z: 0 }, { x: 10, z: 0 }, {
      actorId: null, tag: 'field_well', field: { id: field.id, ownerId: null,
        x: field.center.x, z: field.center.z, radius: field.radius },
    }, deliveryTick, 'field', state);
    state.tick = deliveryTick + 1;
    const started = observer({ action: 'begin', tick: state.tick });
    assert.equal(started.ok, true);
    assert.equal(started.flightStartTick, deliveryTick, 'pre-active physical receipt starts the bounded proof window');
    const capture = observer({ action: 'finalize' });
    assert.equal(capture.ok, true);
    assert.equal(capture.status, 'complete');
    assert.equal(capture.receiptCount, 1);
    assert.equal(capture.receipts[0].rawEntityId, entity.id);
    assert.equal(capture.receipts[0].occupantGeneration, entity.occupantGeneration);
    assert.equal(capture.receipts[0].fieldId, field.id);
    assert.equal(capture.receipts[0].fieldSourceTag, 'environmental');
    assert.equal(capture.receipts[0].fieldSourceKind, 'well');

    const nextWave = observer({ action: 'install', maxReceipts: 256, maxTicks: 20,
      maxSeriesPoints: 5120 });
    assert.equal(nextWave.ok, true, 'a finalized opening observer can be replaced for the next wave');
    const nextTick = state.tick;
    observeAppliedImpulse(entity, { x: 10, z: 0 }, { x: 20, z: 0 }, {
      actorId: null, tag: 'field_well', field: { id: field.id, ownerId: null,
        x: field.center.x, z: field.center.z, radius: field.radius },
    }, nextTick, 'field', state);
    state.tick = nextTick + 1;
    assert.equal(observer({ action: 'begin', tick: state.tick }).ok, true);
    const nextCapture = observer({ action: 'finalize' });
    assert.equal(nextCapture.status, 'complete');
    assert.equal(nextCapture.flightStartTick, nextTick,
      'the next opening gets its own start boundary instead of extending wave one');
    assert.equal(nextCapture.receiptCount, 1);
    assert.equal(nextCapture.receipts[0].tick, nextTick);
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
    meta: { mode: 'swarm', rounds: true, playStartSim: 0 },
    rounds: [{ wave: 1, startSim: 0 }], events: [],
    samples: [
      { f: 1, t: 16, sim: 0, tick: 9, mode: 'menu', p: null, e: [] },
      { f: 2, t: 32, sim: 0.033, tick: 10, mode: 'flight', p: { x: 0, z: 0 },
        e: [[35, CLS.asteroid, 100, 0, 18, 0, 640, 360, 8, VIS.onscreen, -1, 0]] },
    ],
    ...(forceProvenance ? { forceProvenance } : {}),
  };
}

function multiWaveTrace(firstWindow, windows = null) {
  return {
    meta: { mode: 'swarm', rounds: true, playStartSim: 0 },
    rounds: [{ wave: 1, startSim: 0 }, { wave: 2, startSim: 1 }], events: [],
    samples: [
      { f: 1, t: 16, sim: 0, tick: 9, mode: 'menu', p: null, e: [] },
      { f: 2, t: 32, sim: 0.033, tick: 10, mode: 'flight', run: { w: 1, ph: 'active' },
        p: { x: 0, z: 0 }, e: [[35, CLS.asteroid, 100, 0, 18, 0, 640, 360, 8, VIS.onscreen, -1, 0]] },
      { f: 3, t: 48, sim: 0.9, tick: 20, mode: 'flight', run: { w: 2, ph: 'wave_intro' },
        p: { x: 0, z: 0 }, e: [[70, CLS.asteroid, 120, 0, 18, 0, 640, 360, 8, VIS.onscreen, -1, 0]] },
      { f: 4, t: 64, sim: 1, tick: 21, mode: 'flight', run: { w: 2, ph: 'active' },
        p: { x: 0, z: 0 }, e: [[70, CLS.asteroid, 120, 0, 18, 0, 640, 360, 8, VIS.onscreen, -1, 0]] },
    ],
    forceProvenance: firstWindow,
    ...(windows ? { forceProvenanceWindows: windows } : {}),
  };
}

function mappedFieldWindow({ rawId, readerId, generation, tick }) {
  const collector = createBoundedImpulseReceiptCollector({ maxTicks: 20 });
  collector.arm();
  collector.record(observation({ id: rawId, generation, tick, delta: 12 }));
  collector.begin(tick);
  const capture = mapImpulseReceiptIdentities(collector.snapshot(), (id, lifeGeneration) => (
    id === rawId && lifeGeneration === generation ? readerId : null
  ));
  return { requested: true, ...capture };
}

test('swarm spawn_motion only promotes a delivered field receipt through the first active sample', () => {
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

  const priorWindow = structuredClone(forceProvenance);
  priorWindow.receipts[0].samples[0].tick = 9;
  priorWindow.receipts[0].firstTick = 9;
  priorWindow.receipts[0].lastTick = 9;
  priorWindow.receipts[0].tick = 9;
  assert.equal(checkSpawnMotion(openingTrace(priorWindow)).status, 'FAIL', 'prior-window force cannot explain this opening');

  const wrongLife = structuredClone(forceProvenance);
  wrongLife.receipts[0].occupantGeneration = 8;
  wrongLife.receipts[0].readerLifeId = null;
  wrongLife.unresolvedIdentityCount = 1;
  const stale = checkSpawnMotion(openingTrace(wrongLife));
  assert.equal(stale.status, 'FAIL', 'unresolved recycled lives remain strict');
  assert.equal(stale.offenders[0].causalReason, 'missing-identity');

  const overflow = { ...forceProvenance, status: 'overflow', overflow: true };
  const blocked = checkSpawnMotion(openingTrace(overflow));
  assert.equal(blocked.status, 'FAIL');
  assert.equal(blocked.causal.proofFailures, 1);
});

test('spawn_motion matches a delivered receipt when the raw entity id exceeds six digits', () => {
  const rawId = 5_089_000_702;
  const collector = createBoundedImpulseReceiptCollector({ maxTicks: 20 });
  collector.arm();
  collector.record(observation({ id: rawId, tick: 10 }));
  collector.begin(10);
  const forceProvenance = mapImpulseReceiptIdentities(collector.snapshot(), (id, generation) => (
    id === rawId && generation === 7 ? rawId : null
  ));
  forceProvenance.requested = true;
  const trace = openingTrace(forceProvenance);
  trace.samples[1].e[0][0] = rawId;

  const result = checkSpawnMotion(trace);
  assert.equal(result.status, 'PASS');
  assert.equal(result.causal.explained, 1);
  assert.equal(result.offenders.length, 0);

  const ambiguous = structuredClone(trace);
  ambiguous.forceProvenance.receipts.push({
    ...ambiguous.forceProvenance.receipts[0],
    rawEntityId: rawId + 1,
    occupantGeneration: 8,
  });
  const rejected = checkSpawnMotion(ambiguous);
  assert.equal(rejected.status, 'FAIL');
  assert.equal(rejected.offenders[0].causalReason, 'missing-identity',
    'a reader life with conflicting raw identities still fails closed');
});

test('spawn_motion grades each wave against its own bounded force window', () => {
  const first = mappedFieldWindow({ rawId: 35, readerId: 35, generation: 7, tick: 10 });
  const second = mappedFieldWindow({ rawId: 5_089_000_702, readerId: 70, generation: 8, tick: 20 });
  const trace = multiWaveTrace(first, [{ wave: 1, ...first }, { wave: 2, ...second }]);
  const complete = checkSpawnMotion(trace);
  assert.equal(complete.status, 'PASS');
  assert.equal(complete.causal.explained, 2);
  assert.equal(complete.causal.missingWindows, 0);

  const missingLater = checkSpawnMotion(multiWaveTrace(first, [{ wave: 1, ...first }]));
  assert.equal(missingLater.status, 'UNKNOWN', 'a first-wave complete capture cannot explain wave two');
  assert.equal(missingLater.causal.status, 'partial');
  assert.equal(missingLater.causal.missingWindows, 1);
  assert.equal(missingLater.offenders.some((row) => row.causalReason === 'missing-window'), true);

  const legacyMissingLater = checkSpawnMotion(multiWaveTrace(first));
  assert.equal(legacyMissingLater.status, 'UNKNOWN', 'legacy single-window traces stay scoped to their first wave');
  assert.equal(legacyMissingLater.causal.missingWindows, 1);

  const ambiguousLater = structuredClone(second);
  ambiguousLater.receipts.push({ ...ambiguousLater.receipts[0], rawEntityId: 5_089_000_703,
    occupantGeneration: 9 });
  const ambiguous = checkSpawnMotion(multiWaveTrace(first,
    [{ wave: 1, ...first }, { wave: 2, ...ambiguousLater }]));
  assert.equal(ambiguous.status, 'FAIL', 'ambiguous generation mapping remains strict');
  assert.equal(ambiguous.offenders.some((row) => row.causalReason === 'missing-identity'), true);
});

test('the four-second opening retains all 27 ordinary well streams within its finite budget', () => {
  const collector = createBoundedImpulseReceiptCollector({ maxReceipts: 256, maxTicks: 240,
    maxSeriesPoints: 256 * 240 });
  collector.arm(); collector.begin(0);
  for (let tick = 0; tick < 240; tick++) for (let id = 1; id <= 27; id++) {
    assert.equal(collector.record(observation({ id, generation: id, tick, delta: 0.1 })), true);
  }
  const capture = collector.snapshot();
  assert.equal(capture.status, 'complete');
  assert.equal(capture.receiptCount, 27);
  assert.equal(capture.seriesPointCount, 27 * 240);
  assert.equal(collector.record(observation({ tick: 240 })), false, 'the same end boundary remains exclusive');
});
