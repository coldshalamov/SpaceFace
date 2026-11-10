// W4 census harness — deterministic draw A/B for the keyed asteroid instance pool.
// Builds a representative asteroid field mix (tier-3 weights from src/data/mining.js
// plus an optic lattice), registers every leaf with the instance pool, syncs once,
// and reports: direct-leaf draws the field would have paid vs instanced chunks now.
// Canvas textures are never read in this census — a deep proxy swallows every
// createElement/ctx call so the factory can build headlessly.
const anyProxy = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : anyProxy),
  set: () => true,
  apply: () => anyProxy,
  construct: () => anyProxy,
});
globalThis.document = {
  createElement: () => anyProxy,
  createElementNS: () => anyProxy,
  body: anyProxy,
};
globalThis.window = globalThis.window || anyProxy;
globalThis.Image = function () { return anyProxy; };
globalThis.HTMLCanvasElement = function () {};
globalThis.HTMLImageElement = function () {};

import * as THREE from 'three';
import {
  asteroidLeafResources, asteroidPoolCensusKeys, asteroidPoolWarmResources,
  createVisualFactory,
} from '../src/render/visualFactory.js';
import {
  createAsteroidInstancePool,
  getAsteroidInstancePoolDiagnostics,
  registerAsteroidBaseLeaf,
  syncAsteroidInstancePool,
  warmAsteroidInstanceKeys,
  warmAsteroidInstanceVariants,
} from '../src/render/asteroidInstancePool.js';

// Matches OPTIC_MATERIALS in src/combat/opticField.js (typeId + tint per kind).
const OPTIC = {
  diamond: { typeId: 'ast_crystalline', tint: 0xe7fbff, radius: 13 },
  spent: { typeId: 'ast_crystalline', tint: 0x3a4a58, radius: 13 },
  stone: { typeId: 'ast_common_rock', tint: 0x6b6358, radius: 34 },
  metal: { typeId: 'ast_metallic', tint: 0xd5dee8, radius: 16 },
};

const specs = [];
let n = 0;
const push = (count, data) => {
  for (let i = 0; i < count; i++) {
    specs.push({
      id: `w4rock_${n++}`, type: 'asteroid', alive: true,
      pos: { x: (n % 12 - 6) * 90, y: 0, z: (Math.floor(n / 12) - 6) * 90 },
      radius: 12,
      data,
    });
  }
};

// tier-3 field weights (mining.js): 110 rocks
push(25, { typeId: 'ast_metallic' });
push(25, { typeId: 'ast_crystalline' });
push(15, { typeId: 'ast_gas_cloud' });
push(20, { typeId: 'ast_rare_exotic' });
push(15, { typeId: 'ast_common_rock' });
// optic lattice (~40 cells)
for (const [kind, count] of [['diamond', 20], ['spent', 10], ['stone', 10], ['metal', 10]]) {
  for (let i = 0; i < count; i++) {
    specs.push({
      id: `w4optic_${kind}_${i}`, type: 'asteroid', alive: true,
      pos: { x: 200 + (i % 6) * 80, y: 0, z: -300 + Math.floor(i / 6) * 80 },
      radius: OPTIC[kind].radius,
      data: { typeId: OPTIC[kind].typeId, tint: OPTIC[kind].tint, opticMaterial: kind, size: 14 },
    });
  }
}

const factory = createVisualFactory();
const scene = new THREE.Scene();
const pool = createAsteroidInstancePool(scene);

// Same warm the renderer does.
const requiredByVariant = [0, 0, 0, 0, 0];
const requiredByKey = new Map();
for (const e of specs) {
  for (const k of asteroidPoolCensusKeys(e)) requiredByKey.set(k, (requiredByKey.get(k) || 0) + 1);
  if (e.data.typeId === 'ast_common_rock' && e.data.tint == null && !e.data.opticMaterial) {
    // cook-key variant — cheap approximation fine for a warm floor
  }
}
warmAsteroidInstanceVariants(pool, [0, 1, 2, 3, 4].map((v) => asteroidLeafResources('ast_common_rock', v)), requiredByVariant);
warmAsteroidInstanceKeys(pool, asteroidPoolWarmResources(), requiredByKey);

let adoptedLeaves = 0;
let directLeaves = 0;
for (const e of specs) {
  const root = factory.build(e);
  if (!root) { console.log('no root for', e.id); continue; }
  e.root = root;
  scene.add(root);
  root.updateMatrixWorld(true);
  registerAsteroidBaseLeaf(pool, e, root);
  root.traverse((o) => {
    if (o.isMesh !== true) return;
    if (o.userData && o.userData.asteroidInstanceAdopted === true) { adoptedLeaves++; return; }
    if (o.visible !== false && !(o.userData && o.userData.asteroidInstanceDetail === true)) directLeaves++;
  });
}

const cam = new THREE.PerspectiveCamera(120, 1, 1, 100000);
cam.position.set(0, 0, 2500);
cam.lookAt(0, 0, 0);
cam.updateMatrixWorld(true);
syncAsteroidInstancePool(pool, { camera: cam, shadowCamera: cam, records: specs, recordsDirty: true });
const stats = syncAsteroidInstancePool(pool, { camera: cam, shadowCamera: cam, records: specs, recordsDirty: false });
const diag = getAsteroidInstancePoolDiagnostics(pool);

let pooledSubmitted = 0;
let pooledChunksLive = 0;
for (const v of diag.variants || []) {
  pooledSubmitted += v.submitted;
  if (v.submitted > 0) pooledChunksLive++;
}
for (const k of diag.keyed || []) {
  pooledSubmitted += k.submitted;
  if (k.submitted > 0) pooledChunksLive++;
}

console.log('=== w4 census (150 records: 110 field + 40 optic) ===');
console.log('adopted leaves (was 1 draw each):', adoptedLeaves);
console.log('un-adopted visible draws (gas hulls etc.):', directLeaves);
console.log('pooled instances submitted:', pooledSubmitted);
console.log('instanced chunk draws now:', pooledChunksLive);
console.log('KEYED buckets:', (diag.keyed || []).filter((k) => k.registered > 0)
  .map((k) => `${k.variant}=${k.registered}→${k.submitted}`).join(' '));
console.log('VARIANT buckets:', (diag.variants || []).map((v) => `v${v.variant}=${v.registered}→${v.submitted}`).join(' '));
console.log('BEFORE draws for these leaves:', adoptedLeaves + directLeaves,
  '→ AFTER:', pooledChunksLive + directLeaves);

// Reskin migration: flip 5 diamonds to spent through the real seam — body + facet
// records must move to the swapped material's buckets.
const { syncOpticCellSkin } = await import('../src/render/opticCellPresentation.js');
const { releaseAsteroidInstancesForEntity } = await import('../src/render/asteroidInstancePool.js');
let migrated = 0;
for (const e of specs.filter((s) => s.data.opticMaterial === 'diamond').slice(0, 5)) {
  e.data.opticMaterial = 'spent';
  if (syncOpticCellSkin(e, e.root) === true) {
    releaseAsteroidInstancesForEntity(pool, e.id);
    registerAsteroidBaseLeaf(pool, e, e.root);
    migrated++;
  }
}
syncAsteroidInstancePool(pool, { camera: cam, shadowCamera: cam, records: specs, recordsDirty: true });
const d2 = getAsteroidInstancePoolDiagnostics(pool);
const live = (d2.keyed || []).find((k) => k.variant === 'o:facet:live');
const dead = (d2.keyed || []).find((k) => k.variant === 'o:facet:dead');
const dia = (d2.keyed || []).find((k) => k.variant === 'o:diamond');
const spn = (d2.keyed || []).find((k) => k.variant === 'o:spent');
console.log(`reskin migrated=${migrated} → o:diamond ${dia && dia.registered} o:spent ${spn && spn.registered} facets live ${live && live.registered} dead ${dead && dead.registered}`);
