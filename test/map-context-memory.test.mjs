// INF-057 — remember map context without carrying it into the wrong sector. The local map reset
// to zoom 1 on every open (an accidental close threw away the inspection) and the star map read
// `state.ui.starmapView` which nothing ever wrote (a dead read — pan/zoom died on every close).
// Both cameras now ride the screenMemory contract: flat primitives, written on hide, restored on
// show only when the memory belongs to the sector the player is still in. These tests pin the
// pure restore/patch helpers against the REAL screenMemory bag (write → read → restore, foreign
// sector reframe, save round-trip).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createScreenMemory } from '../src/ui/screenMemory.js';
import {
  mapZoomMemoryPatch,
  restoreMapZoomMemory,
} from '../src/ui/screens/localmap.js';
import { restoreStarMapCamera } from '../src/ui/screens/starmap.js';

function stateWith(sectorId) {
  return { ui: {}, world: { currentSectorId: sectorId }, simTime: 100 };
}

test('local map: zoom and anchor survive close/reopen in the same sector via the real bag', () => {
  const state = stateWith('sector_helios');
  const mem = createScreenMemory(state);

  // Player zoomed onto a station: zoom 2.5, anchor at the wheel cursor.
  mem.set('localmap', mapZoomMemoryPatch(2.5, { world: { x: 120, z: -40 }, screen: { x: 640, y: 300 } }, 'sector_helios'));

  const restored = restoreMapZoomMemory(mem.get('localmap'), 'sector_helios');
  assert.equal(restored.zoom, 2.5, 'zoom remembered');
  assert.deepEqual(restored.anchor.world, { x: 120, z: -40 }, 'anchor world point remembered');
  assert.deepEqual(restored.anchor.screen, { x: 640, y: 300 }, 'anchor pixel remembered');
});

test('local map: a genuine sector change reframes to authored defaults', () => {
  const state = stateWith('sector_helios');
  const mem = createScreenMemory(state);
  mem.set('localmap', mapZoomMemoryPatch(4, { world: { x: 1, z: 2 }, screen: { x: 3, y: 4 } }, 'sector_helios'));

  // The player jumped to Ceres; the old camera must not resurface there.
  const restored = restoreMapZoomMemory(mem.get('localmap'), 'sector_ceres');
  assert.equal(restored.zoom, 1, 'foreign-sector zoom discarded');
  assert.equal(restored.anchor, null, 'foreign-sector anchor discarded');

  // And a missing/empty bag is the same reframe, not a crash.
  const noBag = restoreMapZoomMemory(mem.get('localmap'), 'sector_nowhere');
  assert.deepEqual(noBag, { zoom: 1, anchor: null });
});

test('local map: a half-written anchor restores zoom alone instead of a lie', () => {
  const restored = restoreMapZoomMemory(
    { sectorId: 'sector_helios', zoom: 3, anchorWx: 5, anchorWz: null, anchorSx: 7, anchorSy: 8 },
    'sector_helios',
  );
  assert.equal(restored.zoom, 3);
  assert.equal(restored.anchor, null, 'incomplete anchor dropped, not partially applied');
});

test('star map: camera written on hide restores on show; the dead starmapView read is gone', () => {
  const state = stateWith('sector_helios');
  const mem = createScreenMemory(state);
  mem.set('starmap', { camCx: -220.5, camCy: 90.25, camZoom: 1.8 });
  const cam = restoreStarMapCamera(mem.get('starmap'));
  assert.equal(cam.cx, -220.5);
  assert.equal(cam.cy, 90.25);
  assert.equal(cam.zoom, 1.8);

  assert.equal(restoreStarMapCamera(null).zoom, 1, 'no bag means authored defaults');
  assert.deepEqual(restoreStarMapCamera({ camZoom: 99 }), { cx: 0, cy: 0, zoom: 3 }, 'zoom clamps to the wheel range');
  assert.deepEqual(restoreStarMapCamera({ camZoom: -2 }), { cx: 0, cy: 0, zoom: 1 });

  const source = readFileSync(new URL('../src/ui/screens/starmap.js', import.meta.url), 'utf8');
  assert.ok(!/\.starmapView/.test(source), 'the dead state.ui camera read must not come back');
});

test('the remembered context rides the save round-trip like the rest of screenMemory', () => {
  const state = stateWith('sector_helios');
  const mem = createScreenMemory(state);
  mem.set('localmap', mapZoomMemoryPatch(1.6, { world: { x: 9, z: -9 }, screen: { x: 10, y: 20 } }, 'sector_helios'));
  mem.set('starmap', { camCx: 5, camCy: 6, camZoom: 2 });

  const revived = createScreenMemory(stateWith('sector_helios'));
  revived.deserialize(JSON.parse(JSON.stringify(mem.serialize())));

  const local = restoreMapZoomMemory(revived.get('localmap'), 'sector_helios');
  assert.equal(local.zoom, 1.6, 'local zoom survives save/load');
  assert.deepEqual(local.anchor.world, { x: 9, z: -9 });
  const star = restoreStarMapCamera(revived.get('starmap'));
  assert.equal(star.zoom, 2, 'star camera survives save/load');
});

import { readFileSync } from 'node:fs';
