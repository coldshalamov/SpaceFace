import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ENTITY_VIEW_BAND,
  classifyEntityViewBand,
  shouldFullSyncMiddleBand,
  shouldRunEntityClosures,
  viewHalfExtents,
} from '../src/render/entityViewSyncBand.js';

test('player and on-screen ships stay on the inner band; 900 WU runway is middle', () => {
  const view = viewHalfExtents(144, 50, 16 / 9, 2.4);
  assert.equal(classifyEntityViewBand({
    isPlayer: true,
    dx: 2000,
    dz: 2000,
  }), ENTITY_VIEW_BAND.INNER);
  assert.equal(classifyEntityViewBand({
    dx: view.halfX * 0.5,
    dz: view.halfZ * 0.5,
    innerHalfX: view.halfX,
    innerHalfZ: view.halfZ,
  }), ENTITY_VIEW_BAND.INNER);
  assert.equal(classifyEntityViewBand({
    dx: 900,
    dz: 0,
    innerHalfX: view.halfX,
    innerHalfZ: view.halfZ,
  }), ENTITY_VIEW_BAND.MIDDLE);
});

test('middle-band closures fire once per period, staggered by slot', () => {
  const hitsA = [];
  const hitsB = [];
  for (let tick = 0; tick < 16; tick++) {
    if (shouldFullSyncMiddleBand(tick, 0)) hitsA.push(tick);
    if (shouldFullSyncMiddleBand(tick, 1)) hitsB.push(tick);
  }
  assert.equal(hitsA.length, 4);
  assert.equal(hitsB.length, 4);
  assert.notEqual(hitsA[0], hitsB[0]);
  assert.equal(shouldRunEntityClosures(ENTITY_VIEW_BAND.INNER, 1, 0), true);
  assert.equal(shouldRunEntityClosures(ENTITY_VIEW_BAND.MIDDLE, hitsA[0], 0), true);
  assert.equal(shouldRunEntityClosures(ENTITY_VIEW_BAND.MIDDLE, hitsA[0] + 1, 0), false);
});
