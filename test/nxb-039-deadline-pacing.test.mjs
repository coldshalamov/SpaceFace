// NXB-039: a timed offer's pacing answers for the fitted ship's real travel
// speed and marks the window an estimate when the route or ship is unknown.
import test from 'node:test';
import assert from 'node:assert/strict';

import { missionTimePacing } from '../src/ui/missionPreflight.js';
import { SECTORS } from '../src/data/sectors.js';

const farSector = SECTORS[SECTORS.length - 1].id;

function stateWith({ shipSpeed, sectorId = 'sector_alpha' } = {}) {
  const player = { id: 1 };
  if (shipSpeed != null) player.maxSpeed = shipSpeed;
  return {
    simTime: 1000,
    playerId: 1,
    entities: new Map([[1, player]]),
    player: shipSpeed != null ? { maxSpeed: shipSpeed } : {},
    world: { currentSectorId: sectorId },
  };
}

test('the fitted ship, not a reference hull, sets the travel estimate', () => {
  const offer = { type: 'cargo_delivery', time_limit_s: 1200, distance: 20000, params: { taskTime: 20 } };
  const slow = missionTimePacing(offer, stateWith({ shipSpeed: 60 }));
  const fast = missionTimePacing(offer, stateWith({ shipSpeed: 600 }));
  assert.ok(fast.slack > slow.slack, 'a faster hull earns more slack on the same window');
  assert.equal(slow.basis.shipSpeed, 60);
  assert.equal(fast.basis.shipSpeed, 600);
});

test('a slow ship turns a comfortable window tight', () => {
  const offer = { type: 'cargo_delivery', time_limit_s: 700, distance: 20000, params: { taskTime: 20 } };
  const slow = missionTimePacing(offer, stateWith({ shipSpeed: 40 }));
  assert.ok(slow.chip.kind !== 'ok', `slow hull must not read comfortable, got ${slow.chip.kind}`);
  assert.ok(slow.chip.text.startsWith('Tight ') || slow.chip.text.startsWith('Critical '));
});

test('an uncharted off-sector route is marked an estimate, not a promise (NXI-155)', () => {
  const offer = { type: 'cargo_delivery', time_limit_s: 7200, destSectorId: farSector, params: { taskTime: 20 } };
  const pacing = missionTimePacing(offer, stateWith({ shipSpeed: 300, sectorId: SECTORS[0].id }));
  assert.equal(pacing.basis.routeKnown, false, 'no distance for an off-sector leg = uncharted');
  assert.equal(pacing.chip.kind, 'warn');
  assert.ok(pacing.chip.text.includes('est'), 'chip flags the estimate');
  assert.ok(pacing.warning.includes('uncharted'), 'warning names the reason');
});

test('a local in-sector job with a real ship is not marked uncertain', () => {
  const offer = { type: 'cargo_delivery', time_limit_s: 7200, distance: 0, params: { taskTime: 30 } };
  const pacing = missionTimePacing(offer, stateWith({ shipSpeed: 300 }));
  assert.equal(pacing.basis.routeKnown, true);
  assert.equal(pacing.chip.kind, 'ok');
  assert.equal(pacing.warning, null);
});

test('no ship on record falls back to the reference hull and says so', () => {
  const offer = { type: 'cargo_delivery', time_limit_s: 7200, distance: 5000, params: { taskTime: 20 } };
  const pacing = missionTimePacing(offer, stateWith({}));
  assert.equal(pacing.basis.shipSpeed, null);
  assert.ok(pacing.warning.includes('estimate'), 'unknown ship speed is disclosed');
});

test('an expired deadline never displays a negative window (NXI-153)', () => {
  const offer = { type: 'cargo_delivery', deadline_s: 500, distance: 100, params: { taskTime: 20 } };
  // simTime 1000 is already past the deadline — the chip must disappear, not count down negative.
  const pacing = missionTimePacing(offer, stateWith({ shipSpeed: 300 }));
  assert.equal(pacing, null);
});
