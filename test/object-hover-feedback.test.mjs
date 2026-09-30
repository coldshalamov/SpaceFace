import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createObjectHoverFeedback, createWorldObjectHoverPresentation } from '../src/render/objectHoverFeedback.js';

function subjectRoot(x = 0, z = 0, size = 10) {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(size, size, size);
  const material = new THREE.MeshStandardMaterial({ color: 0x8899aa, emissive: 0x112233 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, 0, z);
  root.add(mesh);
  root.updateMatrixWorld(true);
  return { root, mesh, geometry, material };
}

test('hover paints the subject body leaves with a shared overlay, borrowing geometry', () => {
  const scene = new THREE.Scene();
  const overlay = createObjectHoverFeedback({ scene });
  const { root, geometry, material } = subjectRoot();
  scene.add(root);
  scene.updateMatrixWorld(true);

  overlay.setSubject(root);
  overlay.update();
  assert.equal(overlay.overlayCount, 1);
  assert.equal(overlay.subject, root);
  const painted = scene.getObjectByName('worldObjectHover').children.find((m) => m.visible);
  assert.ok(painted, 'a hover overlay mesh is live');
  assert.equal(painted.geometry, geometry, 'the overlay borrows the real leaf geometry');
  assert.notEqual(painted.material, material, 'the overlay never repaints the source material');
  assert.equal(material.color.getHex(), 0x8899aa, 'source material color untouched');
  assert.equal(material.emissive.getHex(), 0x112233, 'source material emissive untouched');

  overlay.setSubject(root);
  overlay.update();
  assert.equal(overlay.overlayCount, 1, 'a repeated hover reuses the same overlay slot');
  overlay.dispose();
});

test('switching subjects and a LOD visibility flip rebuild membership immediately', () => {
  const scene = new THREE.Scene();
  const overlay = createObjectHoverFeedback({ scene });
  const a = subjectRoot(0, 0);
  const b = subjectRoot(30, 0);
  scene.add(a.root);
  scene.add(b.root);
  scene.updateMatrixWorld(true);

  overlay.setSubject(a.root);
  overlay.update();
  assert.equal(overlay.overlayCount, 1);
  overlay.setSubject(b.root);
  overlay.update();
  assert.equal(overlay.overlayCount, 1, 'one hovered subject, one overlay set');
  assert.equal(overlay.subject, b.root);

  const lod2 = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), new THREE.MeshBasicMaterial());
  lod2.visible = false;
  b.root.add(lod2);
  scene.updateMatrixWorld(true);
  overlay.update();
  assert.equal(overlay.overlayCount, 1, 'a hidden LOD leaf never paints');
  lod2.visible = true;
  scene.updateMatrixWorld(true);
  overlay.update();
  assert.equal(overlay.overlayCount, 2, 'a newly visible LOD joins on the next update');

  lod2.visible = false;
  scene.updateMatrixWorld(true);
  overlay.update();
  assert.equal(overlay.overlayCount, 1, 'a hidden LOD leaves immediately — no ghost frame');
  overlay.dispose();
});

test('a static batch subject brightens once — suppressed proxies do not double-paint', () => {
  const scene = new THREE.Scene();
  const overlay = createObjectHoverFeedback({ scene });
  const root = new THREE.Group();
  const batch = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
  batch.userData.spacefaceStaticBatch = true;
  const proxy = new THREE.Object3D();
  proxy.geometry = new THREE.BoxGeometry(10, 10, 10);
  proxy.material = new THREE.MeshBasicMaterial();
  proxy.userData.spacefaceStaticBatchProxy = true;
  proxy.visible = false;
  proxy.userData.poolLeafVisible = true;
  root.add(batch);
  root.add(proxy);
  scene.add(root);
  scene.updateMatrixWorld(true);

  overlay.setSubject(root);
  overlay.update();
  assert.equal(overlay.overlayCount, 1, 'batch presented: only the drawn batch brightens');
  overlay.dispose();
});

test('dispose makes the overlay inert and never disposes borrowed assets', () => {
  const scene = new THREE.Scene();
  const overlay = createObjectHoverFeedback({ scene });
  const a = subjectRoot(0, 0);
  const b = subjectRoot(30, 0, 6);
  const bExtra = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial());
  b.root.add(bExtra);
  scene.add(a.root);
  scene.add(b.root);
  scene.updateMatrixWorld(true);

  const borrowedAssets = [a.geometry, a.material, b.geometry, b.material,
    bExtra.geometry, bExtra.material];
  let borrowedDisposeCalls = 0;
  for (const asset of borrowedAssets) {
    const orig = asset.dispose.bind(asset);
    asset.dispose = () => { borrowedDisposeCalls += 1; return orig(); };
  }
  const aColor = a.material.color.getHex();
  const aEmissive = a.material.emissive.getHex();
  const bColor = b.material.color.getHex();
  const bEmissive = b.material.emissive.getHex();
  const peakLeafCount = 2;

  let peakOverlaySlots = 0;
  const trackSlots = () => {
    const group = scene.getObjectByName('worldObjectHover');
    if (group) peakOverlaySlots = Math.max(peakOverlaySlots, group.children.length);
  };

  overlay.setSubject(a.root);
  overlay.update();
  trackSlots();
  overlay.setSubject(b.root);
  overlay.update();
  trackSlots();
  overlay.setSubject(a.root);
  overlay.update();
  trackSlots();
  overlay.clear();
  overlay.update();
  overlay.setSubject(b.root);
  overlay.update();
  trackSlots();
  overlay.dispose();

  assert.equal(borrowedDisposeCalls, 0,
    'hover/switch/clear/dispose never disposes a borrowed geometry or material');
  assert.equal(a.material.color.getHex(), aColor, 'source material color unchanged');
  assert.equal(a.material.emissive.getHex(), aEmissive, 'source material emissive unchanged');
  assert.equal(b.material.color.getHex(), bColor, 'second subject color unchanged');
  assert.equal(b.material.emissive.getHex(), bEmissive, 'second subject emissive unchanged');
  assert.ok(peakOverlaySlots <= peakLeafCount,
    `overlay slots stay pooled at the peak leaf count (saw ${peakOverlaySlots})`);

  overlay.setSubject(b.root);
  overlay.update();
  assert.equal(overlay.overlayCount, 0, 'a stale post-dispose subject set is ignored');
  assert.equal(overlay.subject, null);
  overlay.clear();
  assert.equal(overlay.subject, null);
});

test('presentation publishes its own api, warms the hidden subject explicitly, and disposes inertly', () => {
  const scene = new THREE.Scene();
  const prewarmCalls = [];
  const state = {
    render: {
      scene,
      compileObjectPipelines: (subject, opts) => {
        prewarmCalls.push({ subject, opts });
        return Promise.resolve({ skipped: true });
      },
    },
  };
  const presentation = createWorldObjectHoverPresentation(state);

  const api = state.render.worldObjectHover;
  assert.ok(api && typeof api.setSubject === 'function' && typeof api.clear === 'function',
    'presentation publishes its own worldObjectHover api');
  assert.equal(prewarmCalls.length, 1, 'construction warms the hidden subject once');
  assert.equal(prewarmCalls[0].opts.explicit, true);
  assert.equal(prewarmCalls[0].opts.forceIncludeInvisible, true,
    'the hidden warmup group must be compiled through forceIncludeInvisible');
  assert.ok(prewarmCalls[0].subject && prewarmCalls[0].subject.visible === false,
    'prewarm subject is the hidden overlay group');

  const { root, geometry, material } = subjectRoot();
  scene.add(root);
  scene.updateMatrixWorld(true);
  let borrowedDisposeCalls = 0;
  for (const asset of [geometry, material]) {
    const orig = asset.dispose.bind(asset);
    asset.dispose = () => { borrowedDisposeCalls += 1; return orig(); };
  }

  presentation.setSubject(root);
  presentation.update();
  assert.equal(api.subject, root, 'published api subject reflects the live overlay');
  assert.equal(state.render.worldObjectHover.subject, root);

  presentation.dispose();
  assert.equal(state.render.worldObjectHover, null,
    'dispose removes the published api reference');
  assert.equal(borrowedDisposeCalls, 0, 'presentation dispose never touches borrowed assets');

  presentation.setSubject(root);
  presentation.update();
  presentation.clear();
  assert.equal(presentation.subject, null, 'post-dispose calls stay inert');
});

test('presentation rebinds on scene replacement and tolerates a null scene', () => {
  const sceneA = new THREE.Scene();
  const prewarmCalls = [];
  const state = {
    render: {
      scene: sceneA,
      compileObjectPipelines: (subject, opts) => {
        prewarmCalls.push(opts);
        return { catch() {} };
      },
    },
  };
  const presentation = createWorldObjectHoverPresentation(state);
  const api = state.render.worldObjectHover;

  const { root } = subjectRoot();
  sceneA.add(root);
  sceneA.updateMatrixWorld(true);
  presentation.setSubject(root);
  presentation.update();
  assert.equal(presentation.subject, root);

  const sceneB = new THREE.Scene();
  sceneB.add(root);
  state.render.scene = sceneB;
  sceneB.updateMatrixWorld(true);
  presentation.update();
  assert.ok(!sceneA.getObjectByName('worldObjectHover'),
    'the old scene keeps no overlay after rebind');
  assert.ok(sceneB.getObjectByName('worldObjectHover'), 'the new scene owns the overlay');
  assert.equal(presentation.subject, root,
    'rebind re-applies the same subject root without another setSubject call');
  assert.equal(prewarmCalls.length, 2, 'the rebound overlay warms once more');

  state.render.scene = null;
  presentation.update();
  assert.equal(presentation.subject, null, 'a null scene drops the overlay');

  const sceneC = new THREE.Scene();
  sceneC.add(root);
  state.render.scene = sceneC;
  sceneC.updateMatrixWorld(true);
  presentation.update();
  assert.equal(presentation.subject, root, 'a returning scene restores the subject');
  assert.equal(state.render.worldObjectHover, api, 'the same published api survives rebinding');

  presentation.dispose();
  assert.equal(state.render.worldObjectHover, null);
});

test('presentation dispose leaves a foreign worldObjectHover reference alone', () => {
  const scene = new THREE.Scene();
  const state = { render: { scene } };
  const presentation = createWorldObjectHoverPresentation(state);
  const foreign = { setSubject() {}, clear() {}, subject: null };
  state.render.worldObjectHover = foreign;
  presentation.dispose();
  assert.equal(state.render.worldObjectHover, foreign,
    'dispose never clears an api it did not publish');
});
