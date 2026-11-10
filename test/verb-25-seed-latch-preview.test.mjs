// VERB-25 — the latch preview says when a mass seed is the anchor and whether it will hold.
//
// Aiming at a deployed seed used to show the same generic bracket as any rock: nothing named the
// seed, and nothing said the line would fail while the seed was still flying to its lock point.
// The preview now publishes the seed's tether eligibility and paints the seed's own state word.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  massSeedPreviewRead,
  massSeedPreviewWord,
} from '../src/ui/masslineHud.js';
import { isMassSeedTetherEligible } from '../src/systems/massSeed.js';

const seed = (phase, tetherEligible) => ({
  id: 'seed-1',
  type: 'massSeed',
  alive: true,
  pos: { x: 40, z: 40 },
  data: {
    massSeed: true,
    kind: 'mass_seed',
    massSeedState: { phase, tetherEligible },
  },
});

test('a locking seed is named and says it is still locking', () => {
  const read = massSeedPreviewRead(seed('locking', false));
  assert.ok(read, 'a seed must produce a preview read');
  assert.equal(read.phase, 'locking');
  assert.equal(read.eligible, false, 'a locking seed must not claim it holds');
  assert.equal(read.word, 'SEED LOCKING');
});

test('an armed seed says the line will hold', () => {
  const read = massSeedPreviewRead(seed('active', true));
  assert.equal(read.eligible, true);
  assert.equal(read.word, 'SEED HOLDS');
  // The read and the eligibility gate share one truth — isMassSeedTetherEligible is the seam.
  assert.equal(isMassSeedTetherEligible(seed('active', true)), true);
  assert.equal(isMassSeedTetherEligible(seed('locking', false)), false);
});

test('the rest of the lifecycle each names its phase', () => {
  assert.equal(massSeedPreviewWord(seed('travel', false)), 'SEED EN ROUTE');
  assert.equal(massSeedPreviewWord(seed('warning', true)), 'SEED UNSTABLE');
  assert.equal(massSeedPreviewWord(seed('collapsing', false)), 'SEED COLLAPSING');
  assert.equal(massSeedPreviewWord(seed('mystery', false)), 'SEED NOT READY');
});

test('non-seed targets produce no seed word — the preview is unchanged for them', () => {
  assert.equal(massSeedPreviewRead(null), null);
  assert.equal(massSeedPreviewRead({ data: {} }), null);
  assert.equal(massSeedPreviewRead({ data: { massSeed: false } }), null);
  assert.equal(massSeedPreviewWord({ type: 'asteroid', data: {} }), '');
});
