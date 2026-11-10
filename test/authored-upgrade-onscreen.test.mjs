import assert from 'node:assert/strict';
import test from 'node:test';

import { PRESENTATION_TIER } from '../src/world/activityClassification.js';
import { entityIsOnscreen } from '../src/render/partsLibrary.js';

const meshless = (tier) => ({
  id: 7, type: 'ship', alive: true,
  activity: { presentationTier: tier },
});

test('meshless R0 entities count as onscreen for upgrade priority', () => {
  // Live-confirmed: on-glass ships mount invisible direct-admission substrates while
  // their authored upgrade queues. Ranking them background (10) instead of onscreen (4)
  // parks the exact ships the player is looking at behind offscreen queue filler.
  assert.equal(entityIsOnscreen(meshless(PRESENTATION_TIER.R0_GLASS), { mode: 'flight' }), true);
  assert.equal(
    entityIsOnscreen({ ...meshless(PRESENTATION_TIER.R0_GLASS), mesh: { visible: false } }, { mode: 'flight' }),
    true,
  );
});

test('meshless off-glass entities stay background for upgrade priority', () => {
  assert.equal(entityIsOnscreen(meshless(PRESENTATION_TIER.R1_RUNWAY), { mode: 'flight' }), false);
  assert.equal(entityIsOnscreen(meshless(PRESENTATION_TIER.R2_METADATA), { mode: 'flight' }), false);
  assert.equal(entityIsOnscreen(meshless(PRESENTATION_TIER.R3_UNLOADED), { mode: 'flight' }), false);
  assert.equal(entityIsOnscreen({ id: 1, type: 'ship', alive: false }, { mode: 'flight' }), false);
  assert.equal(entityIsOnscreen(null, { mode: 'flight' }), false);
});

test('visible meshes keep the frustum path and its fail-open', () => {
  const entity = { ...meshless(PRESENTATION_TIER.R3_UNLOADED), mesh: { visible: true, parent: null } };
  assert.equal(entityIsOnscreen(entity, { mode: 'flight' }), true);
  const hiddenByParent = {
    ...meshless(PRESENTATION_TIER.R0_GLASS),
    mesh: { visible: true, parent: { visible: false, parent: null } },
  };
  assert.equal(entityIsOnscreen(hiddenByParent, { mode: 'flight' }), true);
});
