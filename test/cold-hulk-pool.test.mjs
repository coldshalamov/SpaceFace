// Cold hulks: once a Swarm hulk's ember is spent it joins the dead material set every spent hulk of
// its hull shares (settleColdHulk), whether the hulk was deadened on its own or acquired from the
// ready-body cache, and its rigid opaque leaves join the cross-owner instance pool
// (poolColdHulkLeaves): one instanced draw per leaf for every cold hulk instead of one per hulk.
// Both steps undo exactly for the in-run on/off measurement (keepPrivate / unpool).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createReadyPackagedBodyCache } from '../src/render/readyPackagedBodies.js';
import { deadenPackagedHulk, settleColdHulk, unsettleColdHulk, HULK_EMBER_SECONDS } from '../src/render/visualFactory.js';
import { poolColdHulkLeaves, unpoolColdHulkLeaves } from '../src/render/partsLibrary.js';

const liveHull = new THREE.MeshStandardMaterial({ name: 'Material_Hull', color: 0x8899aa, roughness: 0.4 });
const liveArmor = new THREE.MeshStandardMaterial({ name: 'Material_Armor', color: 0x667788, roughness: 0.5 });
const hullGeo = new THREE.BoxGeometry(2, 1, 1);
const armorGeo = new THREE.BoxGeometry(1, 1, 3);

function deadHulk(killedAt = 0) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  body.add(new THREE.Mesh(hullGeo, liveHull), new THREE.Mesh(armorGeo, liveArmor));
  const mats = deadenPackagedHulk(body);
  root.userData.hulkEmber = { mats, killedAt };
  return root;
}
const leaves = (root) => { const out = []; root.traverse((o) => { if (o.geometry) out.push(o); }); return out; };

test('spent hulks of one hull end on the same cold materials; a fresh one keeps its own until spent', () => {
  const a = deadHulk(); const b = deadHulk();
  const before = leaves(a).map((m) => m.material);
  assert.notEqual(before[0], leaves(b)[0].material, 'each fresh hulk owns its clones (its ember cools alone)');
  assert.equal(settleColdHulk(a), 0, 'the first spent hulk donates its clones as the shared set');
  assert.equal(settleColdHulk(b), 2);
  assert.deepEqual(leaves(b).map((m) => m.material), leaves(a).map((m) => m.material));
  assert.ok(leaves(a).every((m) => m.material.userData.spacefaceSharedAsset === true), 'teardown never disposes the shared set');
  assert.equal(a.userData.hulkEmber, null);
  assert.ok(leaves(a).every((m) => m.material.emissiveIntensity === 0), 'cold is dark');
});

test('a hulk acquired from the ready-body cache joins the same cold set as a deadened one', () => {
  const residency = { retain() { return true; }, releaseOwner() {} };
  const cache = createReadyPackagedBodyCache({ residency });
  const exemplar = deadHulk();
  const record = { assetId: 'cold-hulk-fixture', residency: { key: 'fixture' },
    renderPackage: { released: false, evicted: false, onStale() { return () => {}; } } };
  assert.equal(cache.capture('hulk', exemplar.children[0], { record, fitRadius: 4, gpuAdmitted: true, admissionGeneration: cache.generation }), true);
  const ready = cache.acquire('hulk', { fitRadius: 4 });
  const root = new THREE.Group(); root.add(ready.root);
  root.userData.hulkEmber = { mats: ready.materials, killedAt: 0 };
  const deadened = deadHulk();
  settleColdHulk(deadened);
  settleColdHulk(root);
  assert.deepEqual(leaves(root).map((m) => m.material.name), ['Material_Hull', 'Material_Armor']);
  assert.deepEqual(leaves(root).map((m) => m.material), leaves(deadened).map((m) => m.material),
    'ready clone -> blueprint -> captured dead clone -> live material: one cold set per live material');
});

test('keepPrivate settles reversibly: unsettle puts the hulk\'s own clones and ember back', () => {
  const a = deadHulk(); settleColdHulk(a);
  const b = deadHulk(); const own = leaves(b).map((m) => m.material); const ember = b.userData.hulkEmber;
  settleColdHulk(b, { keepPrivate: true });
  assert.deepEqual(leaves(b).map((m) => m.material), leaves(a).map((m) => m.material));
  assert.equal(unsettleColdHulk(b), true);
  assert.deepEqual(leaves(b).map((m) => m.material), own);
  assert.equal(b.userData.hulkEmber, ember, 'the renderer settles it again when the switch returns');
  assert.equal(unsettleColdHulk(a), false, 'an ordinary settle dropped its clones and cannot be undone');
  assert.ok(HULK_EMBER_SECONDS > 0);
});

test('cold hulk leaves pool across hulks and return to direct draws when unpooled', () => {
  const scene = new THREE.Scene();
  const hulks = [deadHulk(), deadHulk(), deadHulk()];
  hulks.forEach((h, i) => { h.position.x = i * 10; scene.add(h); h.updateMatrixWorld(true); settleColdHulk(h); });
  assert.equal(poolColdHulkLeaves(scene, hulks[0]), 2, 'the first hulk registers both leaves as candidates');
  assert.equal(poolColdHulkLeaves(scene, hulks[1]), 2);
  assert.equal(poolColdHulkLeaves(scene, hulks[2]), 2);
  const slots = new Set();
  for (const h of hulks) {
    assert.equal(h.userData.coldHulkPooled, true);
    for (const leaf of leaves(h)) {
      assert.ok(Number.isInteger(leaf.userData.spacefaceInstancePoolSlot),
        'every cold hulk leaf holds a slot in its (geometry, cold material) pool');
      slots.add(`${leaf.userData.spacefaceInstancePoolKey}#${leaf.userData.spacefaceInstancePoolSlot}`);
    }
  }
  const keys = new Set([...slots].map((k) => k.split('#')[0]));
  assert.equal(keys.size, 2, 'two leaves, two pools: one instanced draw per leaf for every cold hulk');
  assert.equal(slots.size, 6);
  // (Without a renderer the chunks wait for GPU admission, so the leaves still draw directly here;
  // in the game the pool's admission lane links the instanced program and the proxies go quiet.)
  assert.equal(unpoolColdHulkLeaves(scene, hulks[2]), true);
  assert.ok(leaves(hulks[2]).every((m) => m.isMesh === true && !m.userData.spacefaceInstanceProxy
    && m.userData.spacefaceInstancePoolSlot == null), 'unpooled: back on direct draws, no slot held');
  assert.equal(poolColdHulkLeaves(scene, hulks[2]), 2, 'and pools again when the switch returns');
});

test('a hulk whose leaves are not on shared cold materials is left alone', () => {
  const scene = new THREE.Scene();
  const fresh = deadHulk(); scene.add(fresh); fresh.updateMatrixWorld(true);
  assert.equal(poolColdHulkLeaves(scene, fresh), 0, 'a burning hulk keeps its own clones and direct draws');
});
