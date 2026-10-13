import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createReadyPackagedBodyCache, READY_BODY_LIMITS } from '../src/render/readyPackagedBodies.js';
import { createVisualFactory, wreckPackagedFile, deadenPackagedHulk, updateHulkEmber } from '../src/render/visualFactory.js';
import { commitAuthoredPlaceBoundary, disposeDetachedObject, disposeDetachedObjectSteps, releaseOwnerInstances } from '../src/render/partsLibrary.js';
import { protectSharedGpuResource } from '../src/render/assetResidency.js';
import { authoredMotionControllersFor } from '../src/render/authoredMotion.js';
import { MOTION_BANK_SCHEMA } from '../src/contracts/motionBank.js';

function fixture(limits) {
  const owners = new Map(); let released = 0;
  const residency = { retain(key, owner) { owners.set(owner, key); return true; },
    releaseOwner(owner) { if (owners.delete(owner)) released++; } };
  const cache = createReadyPackagedBodyCache({ residency, ...(limits ? { limits } : {}) });
  const root = new THREE.Group(); root.position.set(-1, 0, 0); root.scale.setScalar(2); root.updateMatrix();
  const material = new THREE.MeshStandardMaterial({ color: 0x7090b0, metalness: 0.65, roughness: 0.3 });
  material.onBeforeCompile = () => {}; material.customProgramCacheKey = () => 'authored-variant';
  const geometry = new THREE.BoxGeometry(5, 2, 3);
  for (let i = 0; i < 3; i++) { const mesh = new THREE.Mesh(geometry, material); mesh.position.x = i * 2; root.add(mesh); }
  const listeners = new Set();
  const record = { assetId: 'ready-body-fixture', residency: { key: 'fixture-package' },
    renderPackage: { released: false, evicted: false, onStale(fn) { listeners.add(fn); return () => listeners.delete(fn); } } };
  const capture = (key = 'body', overrides = {}) => cache.capture(key, root, {
    record, fitRadius: 12, gpuAdmitted: true, admissionGeneration: cache.generation, ...overrides });
  return { cache, root, material, geometry, record, owners, listeners, capture, released: () => released };
}

test('only admitted graphs enter the bounded cache; warm bodies retain all topology, fit and shader variants', () => {
  const f = fixture();
  assert.equal(f.capture('cold', { gpuAdmitted: false }), false);
  assert.equal(f.capture(), true);
  const a = f.cache.acquire('body', { fitRadius: 24 }), b = f.cache.acquire('body', { fitRadius: 12 });
  assert.equal(a.root.children.length, 3); assert.equal(b.root.children.length, 3);
  assert.deepEqual(a.root.scale.toArray(), [4, 4, 4]); assert.equal(a.root.position.x, -2);
  for (const mesh of a.root.children) {
    assert.equal(mesh.geometry, f.geometry); assert.equal(mesh.geometry.index.count, 36);
    assert.equal(mesh.material.onBeforeCompile, f.material.onBeforeCompile);
    assert.equal(mesh.material.customProgramCacheKey(), 'authored-variant');
  }
  a.materials[0].color.setHex(0xff0000);
  assert.notEqual(a.materials[0].color.getHex(), b.materials[0].color.getHex());
  f.cache.clear(); assert.equal(f.owners.size, 2, 'live instances own their leases beyond template eviction');
  assert.equal(a.release(), true); assert.equal(a.release(), false); b.release(); assert.equal(f.owners.size, 0);
});

test('clears fence old asynchronous admissions, stale callbacks and a destroyed factory', () => {
  const f = fixture(); const oldGeneration = f.cache.generation; f.capture();
  const oldStale = [...f.listeners][0]; f.cache.clear('game-new');
  assert.equal(f.capture('late', { admissionGeneration: oldGeneration }), false);
  assert.equal(f.capture(), true); oldStale();
  assert.equal(f.cache.diagnostics().templates, 1, 'an old queued stale callback cannot retire a fresh entry');
  f.cache.clear('renderer-destroyed'); assert.equal(f.capture(), false); assert.equal(f.cache.acquire('body', { fitRadius: 12 }), null);
  assert.equal(f.owners.size, 0);
});

test('real protected source materials stay shared while private copies dispose through both live cleanup paths', () => {
  const f = fixture(); let sourceDisposals = 0;
  protectSharedGpuResource(f.material); protectSharedGpuResource(f.geometry);
  f.material.userData.spacefaceSharedMaterialRole = 'hull';
  f.material.addEventListener('dispose', () => sourceDisposals++);
  for (const mesh of f.root.children) mesh.userData.borrowedGeometryMaterial = true;
  f.capture();
  const a = f.cache.acquire('body', { fitRadius: 12 }), b = f.cache.acquire('body', { fitRadius: 12 });
  let disposedA = 0, disposedB = 0;
  a.materials[0].addEventListener('dispose', () => disposedA++);
  b.materials[0].addEventListener('dispose', () => disposedB++);
  assert.equal(a.materials[0].userData.spacefaceSharedAsset, undefined);
  assert.equal(a.materials[0].userData.spacefaceSharedMaterialRole, 'hull');
  assert.equal(a.root.children[0].userData.borrowedGeometryMaterial, undefined);
  disposeDetachedObject(a.root); for (const _ of disposeDetachedObjectSteps(b.root)) { /* drain actual stepped cleanup */ }
  assert.ok(disposedA > 0); assert.ok(disposedB > 0); assert.equal(sourceDisposals, 0);
  a.release(); b.release(); f.cache.clear(); assert.equal(f.owners.size, 0);
});

test('morph buffers participate in the same byte ceiling and alias dedup as ordinary attributes', () => {
  const oversize = fixture({ ...READY_BODY_LIMITS, geometryBytes: 4096 });
  oversize.geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(3000), 3)];
  assert.equal(oversize.capture(), false); assert.equal(oversize.owners.size, 0);
  const alias = fixture(); alias.geometry.morphAttributes.position = [alias.geometry.attributes.position];
  assert.equal(alias.capture(), true);
  const base = fixture(); base.capture();
  assert.equal(alias.cache.diagnostics().geometryBytes, base.cache.diagnostics().geometryBytes);
  alias.cache.clear(); base.cache.clear();
});

test('bounded eviction releases template leases without freeing held body geometry', () => {
  const f = fixture({ ...READY_BODY_LIMITS, templates: 1 }); f.capture('a');
  const held = f.cache.acquire('a', { fitRadius: 12 }); f.capture('b');
  assert.equal(f.cache.acquire('a', { fitRadius: 12 }), null);
  assert.equal(f.cache.diagnostics().templates, 1); assert.equal(f.owners.size, 2);
  assert.equal(held.root.children[0].geometry, f.geometry);
  assert.equal(f.geometry.userData.spacefaceSharedAsset, true);
  const positions = f.geometry.attributes.position;
  structuredClone(positions.array.buffer, { transfer: [positions.array.buffer] });
  const next = f.cache.acquire('b', { fitRadius: 12 });
  assert.equal(next.root.children[0].geometry.attributes.position, positions,
    'an uploaded shared geometry is borrowed, never cloned from retired CPU arrays');
  next.release(); held.release(); f.cache.clear(); assert.equal(f.owners.size, 0);
  const small = fixture({ ...READY_BODY_LIMITS, nodes: 2 }); assert.equal(small.capture(), false);
  assert.equal(small.owners.size, 0, 'oversize graphs retain the paced route without a partial lease');
});

const bank = { schema: MOTION_BANK_SCHEMA, rigId: 'ready_wreck', sourceAssetId: 'ready-body-fixture', sourceGlbSha256: '0'.repeat(64), fps: 60,
  bindings: [{ id: 'ready_wreck', node: 'MOTION_READY_WRECK', parent: null,
    restPose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }, requiredAtLod: [0] }],
  clips: [{ name: 'kick', durationS: 1, loop: false, endMode: 'rest', channels: [
    { group: 'ready_wreck', path: 'translation', times: [0, 1], values: [0, 0, 0, 0, 1, 0] }] }],
  events: { 'wreck:rupture': 'kick' } };

test('the production factory draws an admitted wreck immediately with independent embers and fresh authored motion', async () => {
  const f = fixture(); const pivot = new THREE.Group(); pivot.name = 'MOTION_READY_WRECK';
  pivot.add(...f.root.children.slice()); f.root.add(pivot); pivot.position.y = 0.5; pivot.updateMatrix();
  deadenPackagedHulk(f.root, { residualLife: true });
  const entity = id => ({ id, type: 'wreck', alive: true, radius: 12, pos: { x: 0, z: 0 },
    data: { hulkOfDefId: 'ship_wasp', fracturePiece: 'fixture', killedAt: 5 } });
  const file = wreckPackagedFile(entity(101));
  assert.equal(f.capture(`${file}|dead|residual`, { motionBank: { bank } }), true);
  const factory = createVisualFactory({ readyPackagedBodies: f.cache });
  const a = factory.build(entity(101)), b = factory.build(entity(102));
  assert.equal(a.userData.authoredAssetState, 'authored'); assert.equal(a.userData.requestAuthoredUpgrade, undefined);
  assert.equal(a.userData.hull.getObjectByName('MOTION_READY_WRECK').position.y, 0,
    'a prior exemplar motion pose cannot become the new body rest pose');
  assert.equal(a.userData.hull.getObjectByName('MOTION_READY_WRECK').children.length, 3);
  assert.equal(authoredMotionControllersFor(101).length, 1); assert.equal(authoredMotionControllersFor(102).length, 1);
  authoredMotionControllersFor(101)[0].update(0.5);
  assert.ok(a.userData.hull.getObjectByName('MOTION_READY_WRECK').position.y > 0);
  assert.equal(b.userData.hull.getObjectByName('MOTION_READY_WRECK').position.y, 0);
  updateHulkEmber(a.userData.hulkEmber, 5.1); updateHulkEmber(b.userData.hulkEmber, 20);
  assert.ok(a.userData.hulkEmber.mats[0].emissiveIntensity > b.userData.hulkEmber.mats[0].emissiveIntensity);
  factory.clearReadyPackagedBodies('game-new'); assert.equal(f.owners.size, 2);
  for (const root of [a, b]) { root.userData.detachAuthoredMotion(); await releaseOwnerInstances(root); }
  assert.equal(f.owners.size, 0); assert.equal(authoredMotionControllersFor(101).length, 0);
  const cold = factory.build(entity(103)); assert.equal(cold.userData.authoredAssetState, 'awaiting-authored-admission');
});

function placeFixture() {
  const scene = new THREE.Scene(), boundary = new THREE.Group(), fallback = new THREE.Group();
  const marker = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  fallback.add(marker); boundary.add(fallback); scene.add(boundary);
  boundary.userData.resolvingMarker = marker; boundary.userData.admissionEpoch = 1;
  const authored = { root: new THREE.Group(), authoredParts: [], authoredSlots: {} };
  authored.root.userData.assetId = 'place-fixture'; authored.root.userData.renderContract = {};
  for (let i = 0; i < 1050; i++) authored.root.add(new THREE.Group());
  authored.root.add(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 3), new THREE.MeshBasicMaterial()));
  let resume, first = true;
  const options = { admissionEpoch: 1, yieldBetweenGpuStages: true,
    yieldToNextPresent: () => first ? (first = false, new Promise(resolve => { resume = resolve; })) : Promise.resolve() };
  return { boundary, fallback, marker, authored, options, resume: () => resume() };
}

test('a place resolving body stays attached through paced freeze until the atomic authored graft', async () => {
  const f = placeFixture();
  const pending = commitAuthoredPlaceBoundary(f.boundary, f.fallback, f.authored, () => {}, { id: 79, alive: true }, f.options);
  assert.equal(f.marker.parent, f.fallback, 'the pending picture has a real drawable during freeze');
  assert.equal(f.fallback.parent, f.boundary); assert.equal(f.authored.root.parent, null);
  f.resume(); assert.equal(await pending, true);
  assert.equal(f.authored.root.parent, f.boundary); assert.equal(f.marker.parent, null);
  assert.equal(f.boundary.userData.authoredAssetState, 'authored');
});

test('stale place publication retains the previous drawable and disposes only its private prepared graph', async () => {
  const f = placeFixture(); let disposed = 0;
  const pending = commitAuthoredPlaceBoundary(f.boundary, f.fallback, f.authored, () => {}, { id: 79, alive: true }, f.options, () => { disposed++; });
  f.boundary.userData.admissionEpoch = 2; f.resume(); assert.equal(await pending, false);
  assert.equal(f.marker.parent, f.fallback); assert.equal(f.fallback.parent, f.boundary);
  assert.equal(f.authored.root.parent, null); assert.equal(disposed, 1);
});
