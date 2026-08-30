// PQ-131.07 — authored Gas Tap transaction and lifecycle.
//
// These tests exercise the exact pure controller used by asteroidRenderer3d. They prove that the
// procedural tap is an error path rather than a hidden second construction, and that async
// load/teardown races retire every loaded source exactly once.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  createGasTapMountLifecycle,
  isolateWorksMeshMaterials,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import { createWorksPartLoader } from '../src/ui/asteroid/worksPartLoader.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, no) => { resolve = ok; reject = no; });
  return { promise, resolve, reject };
}

function source(id = 'gas_tap') {
  return { id };
}

function harness(load) {
  const mounted = [];
  const releases = new Map();
  const fallbackBuilds = [];
  const fallbackDisposals = [];
  let closed = false;
  const lifecycle = createGasTapMountLifecycle({
    load,
    prepare: (part) => ({ part, source: part }),
    mount(record) { mounted.push(record.source.id); },
    unmount(record) {
      const at = mounted.indexOf(record.source.id);
      if (at >= 0) mounted.splice(at, 1);
    },
    release(part) { releases.set(part.id, (releases.get(part.id) || 0) + 1); },
    buildFallback(reason) {
      const rec = { id: 'procedural', reason };
      fallbackBuilds.push(rec);
      return rec;
    },
    disposeFallback(rec) { fallbackDisposals.push(rec); },
    isClosed: () => closed,
  });
  return {
    lifecycle,
    mounted,
    releases,
    fallbackBuilds,
    fallbackDisposals,
    close() { closed = true; },
  };
}

test('successful authored coverage never constructs or retains the procedural fallback', async () => {
  const h = harness(async () => source('gas_tap'));
  const result = await h.lifecycle.rebuild();

  assert.equal(result.status, 'authored');
  assert.deepEqual(h.mounted, ['gas_tap']);
  assert.equal(h.fallbackBuilds.length, 0, 'success must not even construct fallback geometry');
  assert.deepEqual(h.lifecycle.stats(), {
    generation: 1,
    phase: 'authored',
    authored: true,
    fallback: false,
    failure: null,
  });

  h.lifecycle.cancel('disposed');
  assert.deepEqual(h.mounted, []);
  assert.equal(h.releases.get('gas_tap'), 1);
  assert.equal(h.fallbackDisposals.length, 0);
});

test('one authored load failure builds exactly one fallback and never mounts authored', async () => {
  const h = harness(async () => null);
  const result = await h.lifecycle.rebuild();

  assert.equal(result.status, 'fallback');
  assert.deepEqual(h.mounted, [], 'no partial authored transaction may reach the scene');
  assert.equal(h.releases.size, 0, 'there was no failed source to retire');
  assert.deepEqual(h.fallbackBuilds, [{
    id: 'procedural',
    reason: 'authored load returned no part',
  }]);
  assert.equal(h.lifecycle.stats().phase, 'fallback');
  assert.equal(h.lifecycle.stats().authored, false);
  assert.equal(h.lifecycle.stats().fallback, true);

  h.lifecycle.cancel('disposed');
  assert.equal(h.fallbackDisposals.length, 1, 'the one fallback is retired once');
  assert.deepEqual(h.mounted, []);
});

test('a newer load cancels staged work without installing the stale fallback', async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const h = harness(() => {
    calls += 1;
    return calls === 1 ? first.promise : second.promise;
  });

  const oldAttempt = h.lifecycle.rebuild();
  const newAttempt = h.lifecycle.rebuild();
  second.resolve(source('new'));
  assert.equal((await newAttempt).status, 'authored');

  first.resolve(source('old'));
  assert.equal((await oldAttempt).status, 'cancelled');
  assert.deepEqual(h.mounted, ['new']);
  assert.equal(h.releases.get('old'), 1);
  assert.equal(h.releases.has('new'), false, 'the current authored source remains standing');
  assert.equal(h.fallbackBuilds.length, 0, 'cancellation is not an asset failure');

  h.lifecycle.cancel('disposed');
  assert.equal(h.releases.get('new'), 1);
});

test('authored and fallback are never standing together across a recovery', async () => {
  let mode = 'ok';
  const h = harness(async () => (mode === 'ok' ? source('gas_tap') : null));

  assert.equal((await h.lifecycle.rebuild()).status, 'authored');
  assert.deepEqual(h.mounted, ['gas_tap']);
  assert.equal(h.fallbackBuilds.length, 0);

  mode = 'fail';
  assert.equal((await h.lifecycle.rebuild()).status, 'fallback');
  assert.deepEqual(h.mounted, [], 'the authored seat is gone before fallback is built');
  assert.equal(h.releases.get('gas_tap'), 1);
  assert.equal(h.fallbackBuilds.length, 1);
  assert.equal(h.lifecycle.stats().authored, false);
  assert.equal(h.lifecycle.stats().fallback, true);

  mode = 'ok';
  assert.equal((await h.lifecycle.rebuild()).status, 'authored');
  assert.deepEqual(h.mounted, ['gas_tap']);
  assert.equal(h.fallbackDisposals.length, 1, 'the fallback is retired before authored remounts');
  assert.equal(h.lifecycle.stats().fallback, false);

  h.lifecycle.cancel('disposed');
});

test('dynamic lamp materials are isolated per mounted tap', () => {
  const shared = new THREE.MeshStandardMaterial({ color: 0x6d5a45, emissive: 0x000000 });
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
  const ownedA = [];
  const ownedB = [];

  const matsA = isolateWorksMeshMaterials([a], ownedA);
  const matsB = isolateWorksMeshMaterials([b], ownedB);
  assert.equal(matsA.length, 1);
  assert.equal(matsB.length, 1);
  assert.notEqual(a.material, shared);
  assert.notEqual(b.material, shared);
  assert.notEqual(a.material, b.material, 'each tap owns its dynamic state material');

  a.material.color.setHex(0xffb648);
  a.material.emissive.setHex(0xff6242);
  assert.equal(b.material.color.getHex(), 0x6d5a45, 'one tap state cannot repaint another');
  assert.equal(shared.color.getHex(), 0x6d5a45, 'the loader blueprint stays immutable');

  for (const resource of [...ownedA, ...ownedB]) resource.dispose();
  a.geometry.dispose();
  b.geometry.dispose();
  shared.dispose();
});

test('the standing authored Gas Tap group swaps LOD in place across work and site registers', async () => {
  const lod0 = new THREE.BoxGeometry(1, 1, 1);
  const lod1 = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const material = new THREE.MeshStandardMaterial();
  const identity = new THREE.Matrix4();
  const blueprint = {
    assetId: 'place_works_gas_tap',
    primitives: [
      { name: 'LOD0_gas_tap', geometry: lod0, material, matrix: identity.clone(), tags: { lod: 'lod0' } },
      { name: 'LOD1_gas_tap', geometry: lod1, material, matrix: identity.clone(), tags: { lod: 'lod1' } },
    ],
    markers: [],
  };
  let leaseReleases = 0;
  const loader = createWorksPartLoader({
    renderer: {},
    registry: {
      gas_tap: Object.freeze({
        lod0: '/gas-tap.glb', lod1: null, slot: 'place',
        hooks: ['valve_wheel', 'gauge_needle', 'lamp'],
      }),
    },
    lease: {
      isActive: () => true,
      async load() { return blueprint; },
      release() { leaseReleases += 1; },
    },
  });

  const group = await loader.loadWorksPart('gas_tap');
  const visibility = () => Object.fromEntries(
    group.children.filter((child) => child.isMesh).map((mesh) => [mesh.name, mesh.visible]),
  );
  assert.deepEqual(visibility(), { LOD0_gas_tap: true, LOD1_gas_tap: false });
  const identityBefore = group;

  loader.setRegister('site');
  assert.equal(group, identityBefore, 'register swap must not replace the standing transaction');
  assert.deepEqual(visibility(), { LOD0_gas_tap: false, LOD1_gas_tap: true });
  loader.setRegister('work');
  assert.deepEqual(visibility(), { LOD0_gas_tap: true, LOD1_gas_tap: false });

  loader.releaseWorksPart(group);
  loader.dispose('test');
  assert.equal(leaseReleases, 1);
});

test('teardown during load releases the late source once and never builds a fallback', async () => {
  const wait = deferred();
  const h = harness(() => wait.promise);
  const attempt = h.lifecycle.rebuild();

  h.close();
  h.lifecycle.cancel('disposed');
  wait.resolve(source('late'));

  assert.equal((await attempt).status, 'cancelled');
  assert.equal(h.releases.get('late'), 1);
  assert.deepEqual(h.mounted, []);
  assert.equal(h.fallbackBuilds.length, 0);
  assert.equal(h.lifecycle.stats().phase, 'disposed');
});
