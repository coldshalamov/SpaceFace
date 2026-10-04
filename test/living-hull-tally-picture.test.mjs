// INF-picture (WF-11/12), fixed seed 4242. The kill tally has to exist in the chase-cam picture.
//
// The defect this pins: the tally atlas baked three 12px hairlines across 1024px and every
// instance squeezed that whole atlas onto a ~0.018-unit plane, so ONE painted mark was ~0.025 px
// wide at the default chase camera (144 WU zoom, 50° vertical FOV — src/render/camera.js) and
// alphaTest 0.45 dropped the mip-faded remainder. A hull with seven confirmed kills carried no
// visible tally at the camera the player actually looks from after a fight; the same frame showed
// the repair patches and the graffiti band fine. The contract now: ONE painted stroke per
// instance at brush scale, so the count reads on the hull, not only in the ship status band.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createGameState } from '../src/core/gameState.js';
import {
  LIVING_HULL_KILL_TALLY_MAX,
  livingHullWithGraffiti,
  livingHullWithKill,
  livingHullWithRepair,
  livingHullWithVent,
} from '../src/core/livingHull.js';
import { createLivingHullPresentation } from '../src/render/livingHullPresentation.js';

const SEED = 4242;
// Default chase camera at 1080p: px per world unit at focus distance.
const CHASE_PX_PER_WU = (1080 / 2) / (144 * Math.tan((50 / 2) * (Math.PI / 180)));
const HITCH_RADIUS = 14; // ship_kestrel collisionRadius (src/data/ships.js)

// Widest continuous opaque run in the baked atlas, as a fraction of atlas width. The presentation
// bakes a DataTexture (node-safe), so the paint itself is readable without a GPU.
function strokePixelSpan(texture) {
  const { data, width, height } = texture.image;
  let best = 0;
  for (let y = 0; y < height; y += 1) {
    let run = 0;
    let bestRun = 0;
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 128) {
        run += 1;
        bestRun = Math.max(bestRun, run);
      } else {
        run = 0;
      }
    }
    best = Math.max(best, bestRun);
  }
  return best / width;
}

// The record the live systems would write for a real fight: seven kills, two yard repairs heavy
// enough to plate over, one heat vent, and dockside graffiti. Written through the pure reducers
// exactly as src/systems/ships.js drives them.
function foughtHullRecord() {
  let hull;
  for (let i = 0; i < 7; i += 1) hull = livingHullWithKill(hull, 120 + i);
  for (let i = 0; i < 2; i += 1) {
    hull = livingHullWithRepair(hull, { restoredHull: 40, hullMax: 140 }, 200 + i);
  }
  hull = livingHullWithVent(hull, 240);
  hull = livingHullWithGraffiti(hull, { line: 'SHE STILL BITES', author: 'dockmaster' }, 260);
  assert.equal(hull.killTally, 7);
  return hull;
}

test('a fought hull (seed 4242) paints each kill as a stroke wide enough to read at the chase cam', () => {
  createGameState(SEED); // pin the fixture environment; the mark path itself is deterministic
  const hull = foughtHullRecord();

  const controller = createLivingHullPresentation();
  const root = new THREE.Group();
  root.userData.authoredAssetState = 'authored';
  assert.equal(controller.attach(root), true);
  controller.sync(hull, 300, { id: 1, radius: HITCH_RADIUS, bank: 0, pitch: 0 });

  const tallies = controller.root.getObjectByName('LivingHull_KillTallies');
  assert.ok(tallies, 'kill tally surface present');
  assert.equal(tallies.count, hull.killTally, 'one instance per confirmed kill');

  const fraction = strokePixelSpan(tallies.material.map);
  assert.ok(
    fraction >= 0.6,
    `one stroke per atlas covering most of the plane width (was 3 hairlines at 3.5% combined): ${fraction.toFixed(3)}`,
  );

  const matrix = new THREE.Matrix4();
  tallies.getMatrixAt(0, matrix);
  const scale = new THREE.Vector3().setFromMatrixScale(matrix);
  const strokeWu = fraction * scale.x * HITCH_RADIUS;
  const pxAtChase = strokeWu * CHASE_PX_PER_WU;
  assert.ok(
    pxAtChase >= 2,
    `a kill mark is >=2 px wide at the default chase zoom on the Hitch: ${pxAtChase.toFixed(2)} px (${strokeWu.toFixed(3)} WU)`,
  );
  const strokeLengthWu = scale.y * HITCH_RADIUS;
  assert.ok(
    strokeLengthWu * CHASE_PX_PER_WU >= 10,
    `a kill mark is >=10 px long at the default chase zoom: ${(strokeLengthWu * CHASE_PX_PER_WU).toFixed(1)} px`,
  );

  controller.dispose();
});

test('tally gates keep the five-bar read: separated strokes, diagonal slash, deck footprint', () => {
  createGameState(SEED);
  let hull = foughtHullRecord();
  for (let i = 7; i < LIVING_HULL_KILL_TALLY_MAX; i += 1) hull = livingHullWithKill(hull, 300 + i);
  assert.equal(hull.killTally, LIVING_HULL_KILL_TALLY_MAX);

  const controller = createLivingHullPresentation();
  const root = new THREE.Group();
  root.userData.authoredAssetState = 'authored';
  controller.attach(root);
  controller.sync(hull, 400, { id: 1, radius: HITCH_RADIUS, bank: 0, pitch: 0 });
  const tallies = controller.root.getObjectByName('LivingHull_KillTallies');
  assert.equal(tallies.count, LIVING_HULL_KILL_TALLY_MAX, 'a maxed record still maps 1:1 to marks');

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const straight = new THREE.Vector3();
  const diagonals = [];
  for (let i = 0; i < tallies.count; i += 1) {
    tallies.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);
    // Stroke long axis: local +Y carried by the instance. Straight marks run athwartships (Z);
    // each full gate's fifth mark is rotated in the deck plane to slash across its four.
    direction.set(0, 1, 0).applyMatrix4(matrix).sub(position).normalize();
    straight.set(0, 0, -1);
    const angle = Math.atan2(direction.x, -direction.z);
    if (Math.abs(angle) > 0.4) {
      diagonals.push(i);
    }
    assert.ok(
      position.z <= 0.36 && Math.abs(position.x) <= 0.16,
      `mark ${i} stays on the flat starboard-forward deck (x ${position.x.toFixed(3)}, z ${position.z.toFixed(3)})`,
    );
  }
  assert.deepEqual(
    diagonals,
    [4, 9],
    'exactly the two complete gates (kills 1-5, 6-10) carry the diagonal slash',
  );

  controller.dispose();
});
