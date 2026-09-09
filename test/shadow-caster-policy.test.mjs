import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import {
  invalidateShadowCasterPolicy,
  noteRealtimeShadowCasterPose,
  SHADOW_TEXEL_WORLD_SIZE,
  syncShadowCasterPolicy,
} from '../src/render/shadowCasterPolicy.js';

function countRootTraversals(root) {
  const traverse = root.traverse;
  let calls = 0;
  root.traverse = function countedTraverse(callback) {
    calls++;
    return traverse.call(this, callback);
  };
  return () => calls;
}

function opaqueMesh() {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x8899aa }),
  );
}

test('shadow policy skips unchanged LOD scene-graph traversals without changing visual rules', () => {
  const root = new THREE.Group();
  const opaque = opaqueMesh();
  const transparent = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
  );
  const hidden = opaqueMesh();
  hidden.visible = false;
  const excluded = opaqueMesh();
  excluded.userData.spacefaceNoShadow = true;
  root.add(opaque, transparent, hidden, excluded);
  const traversals = countRootTraversals(root);

  assert.equal(syncShadowCasterPolicy(root, 'lod0'), true);
  assert.equal(opaque.castShadow, true);
  assert.equal(opaque.receiveShadow, true);
  assert.equal(transparent.castShadow, false);
  assert.equal(transparent.receiveShadow, false);
  assert.equal(hidden.castShadow, false);
  assert.equal(hidden.receiveShadow, false);
  assert.equal(excluded.castShadow, false);
  assert.equal(excluded.receiveShadow, false);

  const configuredTraversals = traversals();
  assert.ok(configuredTraversals > 0);
  assert.equal(syncShadowCasterPolicy(root, 'lod0'), false);
  assert.equal(traversals(), configuredTraversals,
    'an unchanged visible root performs no canopy or shadow hierarchy traversal');
});

test('shadow policy refreshes once when an LOD transition changes visible meshes', () => {
  const root = new THREE.Group();
  const lod0 = opaqueMesh();
  const lod1 = opaqueMesh();
  lod1.visible = false;
  root.add(lod0, lod1);
  const traversals = countRootTraversals(root);

  assert.equal(syncShadowCasterPolicy(root, 'lod0'), true);
  const initialTraversals = traversals();
  assert.equal(lod0.castShadow, true);
  assert.equal(lod1.castShadow, false);

  lod0.visible = false;
  lod1.visible = true;
  assert.equal(syncShadowCasterPolicy(root, 'lod1'), true);
  assert.ok(traversals() > initialTraversals);
  assert.equal(lod0.castShadow, false);
  assert.equal(lod0.receiveShadow, false);
  assert.equal(lod1.castShadow, true);
  assert.equal(lod1.receiveShadow, true);

  const transitionedTraversals = traversals();
  assert.equal(syncShadowCasterPolicy(root, 'lod1'), false);
  assert.equal(traversals(), transitionedTraversals);
});

test('hierarchy invalidation configures newly admitted authored meshes at the same LOD', () => {
  const root = new THREE.Group();
  root.add(opaqueMesh());
  assert.equal(syncShadowCasterPolicy(root, 'lod0'), true);

  const admitted = opaqueMesh();
  root.add(admitted);
  assert.equal(admitted.castShadow, false);
  assert.equal(invalidateShadowCasterPolicy(root), true);
  assert.equal(syncShadowCasterPolicy(root, 'lod0'), true);
  assert.equal(admitted.castShadow, true);
  assert.equal(admitted.receiveShadow, true);
});

test('allowCast false drops casters but keeps opaque receivers', () => {
  const root = new THREE.Group();
  const opaque = opaqueMesh();
  root.add(opaque);
  assert.equal(syncShadowCasterPolicy(root, 'lod0', { allowCast: false }), true);
  assert.equal(opaque.castShadow, false);
  assert.equal(opaque.receiveShadow, true);
});

test('realtime caster pose invalidation accumulates one-shadow-texel movement', () => {
  const root = new THREE.Group();
  root.add(opaqueMesh());
  assert.equal(syncShadowCasterPolicy(root, 'lod0', { allowCast: true }), true);
  assert.equal(noteRealtimeShadowCasterPose(root, { visualRadius: 10 }), true,
    'the first casting pose initializes the map');

  root.position.x += SHADOW_TEXEL_WORLD_SIZE * 0.45;
  assert.equal(noteRealtimeShadowCasterPose(root, { visualRadius: 10 }), false);
  root.position.x += SHADOW_TEXEL_WORLD_SIZE * 0.60;
  assert.equal(noteRealtimeShadowCasterPose(root, { visualRadius: 10 }), true,
    'sub-texel motion accumulates against the last rendered pose');
  assert.equal(noteRealtimeShadowCasterPose(root, { visualRadius: 10 }), false);
});

test('realtime caster pose invalidation covers silhouette rotation, scale, visibility, and cast band', () => {
  const root = new THREE.Group();
  root.add(opaqueMesh());
  syncShadowCasterPolicy(root, 'lod0', { allowCast: true });
  assert.equal(noteRealtimeShadowCasterPose(root, { visualRadius: 20 }), true);

  root.rotation.y = (SHADOW_TEXEL_WORLD_SIZE / 20) * 0.5;
  assert.equal(noteRealtimeShadowCasterPose(root, { visualRadius: 20 }), false);
  root.rotation.y = (SHADOW_TEXEL_WORLD_SIZE / 20) * 1.1;
  assert.equal(noteRealtimeShadowCasterPose(root, { visualRadius: 20 }), true);

  root.scale.x += (SHADOW_TEXEL_WORLD_SIZE / 20) * 1.1;
  assert.equal(noteRealtimeShadowCasterPose(root, { visualRadius: 20 }), true);
  root.visible = false;
  assert.equal(noteRealtimeShadowCasterPose(root, { visualRadius: 20 }), true);

  syncShadowCasterPolicy(root, 'lod0', { allowCast: false });
  assert.equal(noteRealtimeShadowCasterPose(root, { visualRadius: 20 }), false,
    'non-casting roots do not keep the shadow map dirty');
  syncShadowCasterPolicy(root, 'lod0', { allowCast: true });
  assert.equal(noteRealtimeShadowCasterPose(root, { visualRadius: 20 }), true,
    're-entering the caster band initializes a fresh rendered pose');
});
