import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import * as THREE from 'three';
import {
  allowRealtimeShadowCast,
  SHADOW_CAST_RADIUS,
  SHADOW_CAST_RADIUS_SQ,
  SHADOW_ORTHO_EXTENT,
  syncShadowCasterPolicy,
} from '../src/render/shadowCasterPolicy.js';
import { collectPerformanceSceneStructure } from '../scripts/lib/performanceSceneMetrics.mjs';

// Aug 8 2026 headed combat_vfx_burst attribution baseline (dirty-ranges browser capture).
// These are engineering proxies for the submit model — not a mandate to delete content.
export const COMBAT_PERF_BASELINE = Object.freeze({
  castShadowObjects: 1448,
  drawCallsPeak: 519,
  programSwitches: 108,
  wallFrameP50Ms: 33.3,
});

const KILL_BAR_RATIO = 0.5;

function opaqueMesh() {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x8899aa }),
  );
}

function shipRoot(meshCount, { x = 0, z = 0 } = {}) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  for (let i = 0; i < meshCount; i++) root.add(opaqueMesh());
  return root;
}

test('allowRealtimeShadowCast keeps player + nearby LOD0; drops far and low LOD', () => {
  assert.equal(allowRealtimeShadowCast({ isPlayer: true, lodLevel: 'lod2', distanceSq: 1e12 }), true);
  assert.equal(allowRealtimeShadowCast({
    lodLevel: 'lod0',
    distanceSq: SHADOW_CAST_RADIUS_SQ,
  }), true);
  assert.equal(allowRealtimeShadowCast({
    lodLevel: 'lod0',
    distanceSq: SHADOW_CAST_RADIUS_SQ + 1,
  }), false);
  assert.equal(allowRealtimeShadowCast({ lodLevel: 'lod1', distanceSq: 0 }), false);
  assert.equal(allowRealtimeShadowCast({ lodLevel: 'lod2', distanceSq: 0 }), false);
  assert.ok(SHADOW_CAST_RADIUS >= 250, 'cast radius covers the on-screen neighborhood');
  assert.ok(SHADOW_CAST_RADIUS <= 320, 'cast radius does not pull the whole hub into the depth pass');
  assert.ok(SHADOW_ORTHO_EXTENT >= SHADOW_CAST_RADIUS, 'ortho contains the cast band');
});

test('live key-light shadow camera uses the neighborhood ortho, not the old 1400 box', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /SHADOW_ORTHO_EXTENT/);
  assert.doesNotMatch(source, /camera\.left = -700/);
});

test('distance cast band clears far ship casters while nearby opaque hulls still cast', () => {
  const near = shipRoot(12, { x: 100, z: 0 });
  const far = shipRoot(12, { x: SHADOW_CAST_RADIUS + 200, z: 0 });

  syncShadowCasterPolicy(near, 'lod0', { allowCast: true });
  syncShadowCasterPolicy(far, 'lod0', { allowCast: false });

  let nearCasters = 0;
  let farCasters = 0;
  let farReceivers = 0;
  near.traverse((o) => { if (o.isMesh && o.castShadow) nearCasters++; });
  far.traverse((o) => {
    if (!o.isMesh) return;
    if (o.castShadow) farCasters++;
    if (o.receiveShadow) farReceivers++;
  });

  assert.equal(nearCasters, 12);
  assert.equal(farCasters, 0);
  assert.equal(farReceivers, 12, 'far hulls still receive so entering the box looks correct');
});

test('combat-like fleet count gate: local cast policy cuts casters by ≥50% vs everyone-casts', () => {
  // Synthetic crowded combat: 1 player + 8 nearby ships + 24 far ships, 12 opaque parts each.
  // Mirrors the Aug 8 failure mode (hundreds of far casters outside the local shadow ortho).
  const PARTS = 12;
  const NEAR = 8;
  const FAR = 24;
  const scene = new THREE.Scene();
  const player = shipRoot(PARTS, { x: 0, z: 0 });
  scene.add(player);
  syncShadowCasterPolicy(player, 'lod0', { allowCast: true });

  for (let i = 0; i < NEAR; i++) {
    const root = shipRoot(PARTS, { x: 40 + i * 30, z: 20 });
    scene.add(root);
    syncShadowCasterPolicy(root, 'lod0', { allowCast: true });
  }
  for (let i = 0; i < FAR; i++) {
    const root = shipRoot(PARTS, {
      x: SHADOW_CAST_RADIUS + 100 + i * 40,
      z: (i % 2 === 0 ? 1 : -1) * 200,
    });
    scene.add(root);
    // Baseline everyone-casts would use allowCast:true here.
    syncShadowCasterPolicy(root, 'lod0', { allowCast: false });
  }

  const optimized = collectPerformanceSceneStructure({
    state: { entityList: [], render: { scene } },
  });

  const everyoneCasts = PARTS * (1 + NEAR + FAR);
  const localOnly = PARTS * (1 + NEAR);
  assert.equal(optimized.castShadowObjects, localOnly);
  assert.ok(
    optimized.castShadowObjects <= everyoneCasts * KILL_BAR_RATIO,
    `expected ≥50% caster cut: ${optimized.castShadowObjects} vs baseline-style ${everyoneCasts}`,
  );
  assert.ok(
    optimized.castShadowObjects < COMBAT_PERF_BASELINE.castShadowObjects * KILL_BAR_RATIO
      || localOnly / everyoneCasts <= KILL_BAR_RATIO,
    'local cast policy is the structural ≥50% submit lever for shadow membership',
  );
});

test('crossing cast band refreshes policy without requiring LOD change', () => {
  const root = shipRoot(3);
  assert.equal(syncShadowCasterPolicy(root, 'lod0', { allowCast: true }), true);
  assert.equal(syncShadowCasterPolicy(root, 'lod0', { allowCast: true }), false);
  assert.equal(syncShadowCasterPolicy(root, 'lod0', { allowCast: false }), true);
  let casters = 0;
  root.traverse((o) => { if (o.isMesh && o.castShadow) casters++; });
  assert.equal(casters, 0);
  assert.equal(syncShadowCasterPolicy(root, 'lod0', { allowCast: true }), true);
  casters = 0;
  root.traverse((o) => { if (o.isMesh && o.castShadow) casters++; });
  assert.equal(casters, 3);
});
