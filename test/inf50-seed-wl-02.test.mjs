import test from 'node:test';
import assert from 'node:assert/strict';
import { objectInfoLine, passengerLinerLastLegLine } from '../src/ui/targetPanel.js';

function liner(lastOutcome) {
  return {
    type: 'ship',
    alive: true,
    data: {
      passengerLinerService: 'helios-civic-liner',
      itinerary: { kind: 'passenger_liner_service', lastOutcome },
    },
  };
}

test('seed 4242: a settled liner leg names arrived, returned, or lost plus the station', () => {
  const cases = [
    ['DELIVERED', 'arrived', 'station_coalition', 'Coalition HQ'],
    ['RETURNED', 'returned', 'station_helios', 'Helios Station'],
    ['LOST', 'lost', 'station_helios', 'Helios Station'],
  ];
  for (const [outcome, word, stationId, stationName] of cases) {
    const entity = liner({ outcome, stationId, receiptId: `leg-${outcome}` });
    const line = passengerLinerLastLegLine(entity);
    assert.match(line, new RegExp(`last leg: ${word}`));
    assert.ok(line.includes(stationName), line);
    assert.equal(objectInfoLine(entity, { meta: { seed: 4242 } }, null, 40), line);
  }
});

test('seed 4242: an unset liner leg and a non-liner render nothing', () => {
  assert.equal(passengerLinerLastLegLine(liner(null)), '');
  assert.equal(objectInfoLine(liner(null), {}, null, 10), '');
  const hauler = {
    type: 'ship',
    data: { itinerary: { kind: 'claim_convoy', lastOutcome: { outcome: 'DELIVERED', stationId: 'station_helios' } } },
  };
  assert.equal(passengerLinerLastLegLine(hauler), '');
  assert.equal(objectInfoLine(hauler, {}, null, 10), '');
});
