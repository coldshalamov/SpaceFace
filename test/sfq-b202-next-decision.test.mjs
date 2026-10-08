// SFQ-B202 — the flight cluster answers the next decision, and stays quiet when it should.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nextFlightDecision } from '../src/ui/orrery/nextDecision.js';

const QUIET = Object.freeze({
  hull: 80, hullMax: 100, shield: 40, shieldMax: 50, heat: 0.2,
  ordnance: { 1: { state: 'ready' } }, speed: 90, speedRef: 100,
});

test('SFQ-B202 seed 4242 a quiet cluster says nothing and a critical hull says break off', () => {
  assert.equal(nextFlightDecision(QUIET), '');
  assert.equal(nextFlightDecision(null), '');
  assert.equal(nextFlightDecision({ ...QUIET, hull: 29 }), 'Break off — the hull will not take another hit');
  assert.equal(nextFlightDecision({ ...QUIET, hull: 30 }), '');
  assert.equal(
    nextFlightDecision({ ...QUIET, hull: 20, shield: 0, heat: 0.9, ordnance: { 1: { state: 'empty' } }, speed: 200 }),
    'Break off — the hull will not take another hit',
  );
});

test('SFQ-B202 seed 4242 shield, heat, empty ordnance, and the governed mark speak in that order', () => {
  assert.equal(nextFlightDecision({ ...QUIET, shield: 0 }), 'Shield is down — keep the next hit off the hull');
  assert.equal(nextFlightDecision({ ...QUIET, shield: 1 }), '');
  assert.equal(nextFlightDecision({ ...QUIET, shieldMax: 0, shield: 0, heat: 0.76 }), 'Ease fire — the gun is hot');
  assert.equal(nextFlightDecision({ ...QUIET, heat: 0.75 }), '');
  assert.equal(
    nextFlightDecision({ ...QUIET, ordnance: { beam: { state: 'ready' }, rack: { state: 'empty' } } }),
    'Ordnance is empty — restock at a station',
  );
  assert.equal(nextFlightDecision({ ...QUIET, speed: 103, speedRef: 100 }), 'Ease off — you are past the governed mark');
  assert.equal(nextFlightDecision({ ...QUIET, speed: 102, speedRef: 100 }), '');
});
