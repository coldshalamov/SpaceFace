import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  makePreviewEntity,
  prepareShipForPreview,
  requestPreviewAuthoredAdmission,
} from '../src/render/shipPreview.js';

test('authored ship preview reuses the live zero-draw boundary and requests admission', () => {
  const boundary = new THREE.Group();
  const renderer = { id: 'renderer' };
  const scene = new THREE.Scene();
  const calls = [];
  boundary.userData.authoredAssetState = 'awaiting-authored-admission';
  boundary.userData.requestAuthoredUpgrade = (actualRenderer, actualScene) => {
    calls.push([actualRenderer, actualScene]);
    boundary.userData.authoredAssetState = 'loading';
  };

  const result = prepareShipForPreview({ type: 'ship', data: { defId: 'ship_kestrel' } }, boundary, true);

  assert.equal(result, boundary, 'an existing authored boundary must not be wrapped a second time');
  assert.equal(requestedBeforeMount(boundary, renderer, scene), false, 'admission cannot commit before scene ownership');
  scene.add(boundary);
  assert.equal(requestPreviewAuthoredAdmission(boundary, renderer, scene, true), true);
  assert.deepEqual(calls, [[renderer, scene]], 'preview must explicitly request authored admission');
  assert.equal(boundary.userData.authoredAssetState, 'loading');
});

test('procedural preview mode leaves the selected visual untouched', () => {
  const visual = new THREE.Group();
  let requested = false;
  visual.userData.requestAuthoredUpgrade = () => { requested = true; };

  assert.equal(prepareShipForPreview({ type: 'ship' }, visual, false), visual);
  assert.equal(requestPreviewAuthoredAdmission(visual, {}, {}, false), false);
  assert.equal(requested, false);
});

test('canonical Hitch turntable entity models the real player presentation route', () => {
  const shipDef = { id: 'ship_kestrel', collisionRadius: 14, slots: {} };
  const canonical = makePreviewEntity('ship_kestrel', [], shipDef, 1);
  const factionNpc = makePreviewEntity('ship_kestrel', [], shipDef, 2, {
    team: 2,
    factionId: 'faction_scn',
  });

  assert.equal(canonical.isPlayer, true,
    'canonical Hitch preview must select the production player-only whole-ship body');
  assert.equal(factionNpc.isPlayer, false,
    'NPC Kestrel variants must not impersonate the player presentation route');
});

function requestedBeforeMount(boundary, renderer, scene) {
  return requestPreviewAuthoredAdmission(boundary, renderer, scene, true);
}
