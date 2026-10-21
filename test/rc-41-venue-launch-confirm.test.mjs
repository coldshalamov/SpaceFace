import test from 'node:test';
import assert from 'node:assert/strict';
import { venueLaunchNeedsConfirm } from '../src/ui/physicsVenues.js';

// RC-41: a venue launch asks nothing when there is no flight progress to lose —
// the confirm only gates a live, non-throwaway flight.

test('menu and loading never confirm', () => {
  assert.equal(venueLaunchNeedsConfirm({ mode: 'menu' }), false);
  assert.equal(venueLaunchNeedsConfirm({ mode: 'loading' }), false);
  assert.equal(venueLaunchNeedsConfirm(null), false);
  assert.equal(venueLaunchNeedsConfirm(undefined), false);
});

test('a live campaign or crucible flight confirms', () => {
  assert.equal(venueLaunchNeedsConfirm({ mode: 'flight' }), true);
  assert.equal(venueLaunchNeedsConfirm({ mode: 'paused' }), true);
  assert.equal(venueLaunchNeedsConfirm({ mode: 'flight', run: { kind: 'survival' } }), true);
});

test('throwaway sessions never confirm', () => {
  assert.equal(venueLaunchNeedsConfirm({ mode: 'flight', physicsVenueSession: true }), false);
  assert.equal(venueLaunchNeedsConfirm({ mode: 'flight', physicsVenue: { active: true } }), false);
  assert.equal(venueLaunchNeedsConfirm({ mode: 'paused', physicsVenueSession: true }), false);
});
