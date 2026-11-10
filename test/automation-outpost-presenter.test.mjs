import assert from 'node:assert/strict';
import test from 'node:test';

import { OUTPOSTS } from '../src/data/automation.js';
import { describeOutpostOperation } from '../src/ui/screens/automationPanel.js';

const refinery = OUTPOSTS.find((entry) => entry.id === 'outpost_refinery');

test('producing outpost reports real input draw, output rate, storage, and feeder telemetry', () => {
  const readout = describeOutpostOperation({
    id: 'refinery_alpha',
    status: 'producing',
    storage: 42,
    storageCap: 300,
    production: {
      status: 'producing',
      outputGoodId: 'cmdty_alloys',
      requestedRate: 0.5,
      actualRate: 0.5,
      consumedByGood: { cmdty_ore_iron: 0.02 },
      missingByGood: {},
      limitingGoodId: null,
      localFeeders: 2,
    },
  }, refinery);

  assert.equal(readout.state, 'producing');
  assert.equal(readout.statusLabel, 'Producing');
  assert.deepEqual(readout.inputs.map((entry) => [entry.label, entry.actualPerMin]), [
    ['Iron Ore', 60],
  ]);
  assert.equal(readout.output.label, 'Composite Alloys');
  assert.equal(readout.output.actualPerMin, 30);
  assert.equal(readout.output.targetPerMin, 30);
  assert.equal(readout.storage.stored, 42);
  assert.equal(readout.storage.capacity, 300);
  assert.equal(readout.feeders.label, '2 local feeders detected');
  assert.equal(readout.feeders.availability, 'Feed linked');
  assert.match(readout.accessibleSummary, /Iron Ore 60 units per minute/i);
  assert.match(readout.accessibleSummary, /Composite Alloys 30 of 30 units per minute/i);
});

test('starved outpost names the limiting commodity and never reports theoretical output as actual', () => {
  const readout = describeOutpostOperation({
    status: 'starved',
    storage: 8,
    production: {
      status: 'starved',
      outputGoodId: 'cmdty_alloys',
      requestedRate: 0.5,
      actualRate: 0,
      consumedByGood: { cmdty_ore_iron: 0 },
      missingByGood: { cmdty_ore_iron: 0.02 },
      limitingGoodId: 'cmdty_ore_iron',
      localFeeders: 0,
    },
  }, refinery);

  assert.equal(readout.state, 'starved');
  assert.equal(readout.statusLabel, 'Starved: Iron Ore');
  assert.equal(readout.output.actualPerMin, 0);
  assert.equal(readout.output.targetPerMin, 30);
  assert.equal(readout.feeders.state, 'short');
  assert.equal(readout.feeders.label, 'No local feeders detected');
  assert.equal(readout.feeders.availability, 'Feed unavailable');
});

test('storage, raid, and distress states override stale production telemetry', () => {
  const base = {
    storage: 300,
    storageCap: 300,
    production: {
      status: 'producing',
      outputGoodId: 'cmdty_alloys',
      requestedRate: 0.5,
      actualRate: 0.5,
      localFeeders: 1,
    },
  };

  assert.equal(describeOutpostOperation({ ...base, status: 'storage_full' }, refinery).statusLabel, 'Storage full');
  assert.equal(describeOutpostOperation({ ...base, status: 'raided', raidCooldown: 90 }, refinery).statusLabel, 'Raided');
  assert.equal(describeOutpostOperation({ ...base, status: 'distressed' }, refinery).statusLabel, 'Distressed');
  assert.equal(describeOutpostOperation({ status: 'raided' }, refinery).output.actualPerMin, 0,
    'an authoritative stopped status should report zero actual output even before rate telemetry exists');
});

test('legacy outpost state waits for telemetry rather than fabricating a live rate', () => {
  const readout = describeOutpostOperation({ status: 'producing', storage: 0 }, refinery);

  assert.equal(readout.state, 'pending');
  assert.equal(readout.statusLabel, 'Awaiting telemetry');
  assert.equal(readout.output.actualPerMin, null);
  assert.equal(readout.inputs[0].actualPerMin, null);
  assert.equal(readout.feeders.label, 'Feeder telemetry pending');
});

test('passive hub identifies credits as its output without pretending it needs a feeder', () => {
  const hub = OUTPOSTS.find((entry) => entry.id === 'outpost_habhub');
  const readout = describeOutpostOperation({
    status: 'producing',
    storage: 120,
    storageCap: 1500,
    production: {
      status: 'producing',
      outputGoodId: 'credits',
      requestedRate: 12,
      actualRate: 12,
      localFeeders: 0,
    },
  }, hub);

  assert.deepEqual(readout.inputs, []);
  assert.equal(readout.output.label, 'Credits');
  assert.equal(readout.output.unit, 'cr/min');
  assert.equal(readout.output.actualPerMin, 720);
  assert.equal(readout.feeders.state, 'not-needed');
  assert.equal(readout.feeders.availability, 'Self-contained');
});
