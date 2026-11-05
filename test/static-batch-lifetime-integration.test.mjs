import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  rememberStaticBatchGeometry,
  takeCachedStaticBatchGeometry,
  retainStaticBatchGeometryForObject,
  releaseStaticBatchGeometryForObject,
  clearStaticBatchGeometryCacheForTests,
} from '../src/render/staticBatchGeometryCache.js';
import { disposeObjectNode } from '../src/render/renderer.js';
import { loadStaticBatchOwners } from './helpers/load-static-batch-owner.mjs';

const owners = await loadStaticBatchOwners();

test('real composed source, template and cloned instances survive cache eviction until last teardown', () => {
  clearStaticBatchGeometryCacheForTests();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  let disposals = 0;
  geometry.addEventListener('dispose', () => { disposals++; });
  rememberStaticBatchGeometry('source', geometry);

  const root = new THREE.Group();
  const hull = new THREE.Group();
  const bindings = owners.createBindings();
  root.userData = { kind: 'ship', hull, renderContract: { version: 1, proceduralFallbackParts: [] } };
  root.add(hull);
  const material = new THREE.MeshStandardMaterial();
  const source = owners.addStaticBatchMesh(hull, bindings, geometry, material, { lod: 'lod0' }, [], 'LeaseProbe');
  const entry = owners.createFlightRootTemplateEntry({
    root, bindings, authoredHullLevels: new Set(['lod0']), wholeShip: false,
    loadoutFingerprint: 'lease-probe', authoredParts: [], authoredSlots: {},
  });
  const entity = { radius: 1, data: { defId: 'lease-probe' } };
  const first = owners.instantiateFlightRootTemplate(entry, entity, 'lease', 'lease', 1);
  const second = owners.instantiateFlightRootTemplate(entry, entity, 'lease', 'lease', 2);
  entry.packageRecipes = [{}];
  const abandoned = owners.instantiateFlightRootTemplate(entry, entity, 'lease', 'lease', 3);
  entry.packageRecipes = [];
  assert.equal(abandoned, null, 'failed package reconstruction releases its partial clone');
  assert.equal(first.root.getObjectByName(source.name).geometry, geometry);
  owners.storeFlightRootTemplate('template', entry);

  rememberStaticBatchGeometry('evictor', new THREE.BoxGeometry(), 1);
  assert.equal(disposals, 0, 'eviction preserves live source and clones');
  owners.disposeDetachedObject(root);
  assert.equal(disposals, 0, 'source retirement leaves template and instances alive');
  owners.removeFlightRootTemplate('template');
  owners.disposeDetachedObject(first.root);
  first.releaseFlightTemplate();
  assert.equal(disposals, 0, 'second instance still holds the geometry');
  owners.disposeDetachedObject(second.root);
  second.releaseFlightTemplate();
  assert.equal(disposals, 1, 'the last lease retires the evicted geometry exactly once');
  clearStaticBatchGeometryCacheForTests();
});

test('bounded eviction waits for the last actual renderer borrower', () => {
  clearStaticBatchGeometryCacheForTests();
  const geometry = new THREE.BoxGeometry();
  let disposals = 0;
  geometry.addEventListener('dispose', () => { disposals++; });
  rememberStaticBatchGeometry('first', geometry);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  assert.equal(retainStaticBatchGeometryForObject(mesh), true);
  assert.equal(takeCachedStaticBatchGeometry('first'), geometry);
  for (let i = 0; i < 48; i++) rememberStaticBatchGeometry(`other-${i}`, new THREE.BoxGeometry());
  assert.equal(takeCachedStaticBatchGeometry('first'), null);
  assert.equal(disposals, 0);
  disposeObjectNode(mesh);
  assert.equal(disposals, 1);
  disposeObjectNode(mesh);
  assert.equal(disposals, 1);
  assert.equal(releaseStaticBatchGeometryForObject(mesh), false);
  clearStaticBatchGeometryCacheForTests();
});

test('two cache keys can alias geometry without premature disposal', () => {
  clearStaticBatchGeometryCacheForTests();
  const geometry = new THREE.BoxGeometry();
  let disposals = 0;
  geometry.addEventListener('dispose', () => { disposals++; });
  rememberStaticBatchGeometry('alias-a', geometry, 1);
  rememberStaticBatchGeometry('alias-b', geometry, 1);
  assert.equal(takeCachedStaticBatchGeometry('alias-b'), geometry);
  assert.equal(disposals, 0);
  clearStaticBatchGeometryCacheForTests();
  assert.equal(disposals, 1);
});
