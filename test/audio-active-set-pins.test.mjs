import assert from 'node:assert/strict';
import test from 'node:test';
import { entityNeedsExactAudio } from '../src/audio/audioActiveSet.js';
import { PRESENTATION_TIER } from '../src/world/activityClassification.js';

test('runtime-pinned entity retains exact audio outside the presentation residency set', () => {
  const pinned = { id: 'security-response', alive: true, activity: {
    presentationTier: PRESENTATION_TIER.R3_UNLOADED, pinnedExact: true,
  } };
  assert.equal(entityNeedsExactAudio(pinned), true);
});

test('partial active-set misses fall through to presentation tier', () => {
  const glass = { id: 'glass', alive: true, activity: {
    presentationTier: PRESENTATION_TIER.R0_GLASS,
  } };
  assert.equal(entityNeedsExactAudio(glass, { activeSet: new Set(['other']) }), true);
});
