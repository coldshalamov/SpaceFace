// PQ-131.06 — authored Conduit transaction and lifecycle.
//
// These tests exercise the exact pure controller used by asteroidRenderer3d. They prove that the
// procedural network is an error path rather than a hidden second construction, and that async
// topology/register/teardown races retire every loaded source exactly once.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  createConduitMountLifecycle,
  isolateWorksMeshMaterials,
} from '../src/ui/asteroid/asteroidRenderer3d.js';
import { createWorksPartLoader } from '../src/ui/asteroid/worksPartLoader.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, no) => { resolve = ok; reject = no; });
  return { promise, resolve, reject };
}

function source(id) {
  return { id };
}

function harness(load) {
  const mounted = [];
  const releases = new Map();
  const fallbackBuilds = [];
  const fallbackDisposals = [];
  let closed = false;
  const lifecycle = createConduitMountLifecycle({
    load,
    prepare: (part, desired) => ({ part, ...desired }),
    mount(record) { mounted.push(record.source.id); },
    unmount(record) {
      const at = mounted.indexOf(record.source.id);
      if (at >= 0) mounted.splice(at, 1);
    },
    release(part) { releases.set(part.id, (releases.get(part.id) || 0) + 1); },
    buildFallback(desired, reason) {
      const rec = { ids: desired.map((item) => item.id), reason };
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
  const h = harness(async (desired) => source(desired.id));
  const result = await h.lifecycle.rebuild([{ id: 'power' }, { id: 'lane' }]);

  assert.equal(result.status, 'authored');
  assert.deepEqual(h.mounted, ['power', 'lane']);
  assert.equal(h.fallbackBuilds.length, 0, 'success must not even construct fallback geometry');
  assert.deepEqual(h.lifecycle.stats(), {
    generation: 1,
    phase: 'authored',
    desiredCount: 2,
    authoredCount: 2,
    fallback: false,
    failure: null,
  });

  h.lifecycle.cancel('disposed');
  assert.deepEqual(h.mounted, []);
  assert.equal(h.releases.get('power'), 1);
  assert.equal(h.releases.get('lane'), 1);
  assert.equal(h.fallbackDisposals.length, 0);
});

test('one authored load failure rolls back the whole transaction and builds one fallback', async () => {
  const h = harness(async (desired) => (desired.id === 'bad' ? null : source(desired.id)));
  const desired = [{ id: 'first' }, { id: 'bad' }, { id: 'never' }];
  const result = await h.lifecycle.rebuild(desired);

  assert.equal(result.status, 'fallback');
  assert.deepEqual(h.mounted, [], 'no partial authored transaction may reach the scene');
  assert.equal(h.releases.get('first'), 1, 'the staged success is retired once');
  assert.equal(h.releases.has('bad'), false, 'there was no failed source to retire');
  assert.equal(h.releases.has('never'), false, 'loading stops at the first failed source');
  assert.deepEqual(h.fallbackBuilds, [{
    ids: ['first', 'bad', 'never'],
    reason: 'authored load returned no part at index 1',
  }]);
  assert.equal(h.lifecycle.stats().phase, 'fallback');
  assert.equal(h.lifecycle.stats().authoredCount, 0);
  assert.equal(h.lifecycle.stats().fallback, true);

  h.lifecycle.cancel('disposed');
  assert.equal(h.fallbackDisposals.length, 1, 'the one fallback is retired once');
});

test('a newer topology cancels staged work without installing the stale fallback', async () => {
  const waits = new Map([
    ['old-a', deferred()],
    ['old-b', deferred()],
    ['new', deferred()],
  ]);
  const h = harness((desired) => waits.get(desired.id).promise);

  const oldAttempt = h.lifecycle.rebuild([{ id: 'old-a' }, { id: 'old-b' }]);
  waits.get('old-a').resolve(source('old-a'));
  await Promise.resolve();
  await Promise.resolve();

  const newAttempt = h.lifecycle.rebuild([{ id: 'new' }]);
  waits.get('new').resolve(source('new'));
  assert.equal((await newAttempt).status, 'authored');

  waits.get('old-b').resolve(source('old-b'));
  assert.equal((await oldAttempt).status, 'cancelled');
  assert.deepEqual(h.mounted, ['new']);
  assert.equal(h.releases.get('old-a'), 1);
  assert.equal(h.releases.get('old-b'), 1);
  assert.equal(h.releases.has('new'), false, 'the current authored source remains standing');
  assert.equal(h.fallbackBuilds.length, 0, 'cancellation is not an asset failure');

  h.lifecycle.cancel('disposed');
  assert.equal(h.releases.get('new'), 1);
});

test('dynamic Conduit materials are isolated per mounted network', () => {
  const shared = new THREE.MeshStandardMaterial({ color: 0x7d97ab, emissive: 0x000000 });
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
  assert.notEqual(a.material, b.material, 'each network owns its dynamic state material');

  a.material.color.setHex(0xb8863a);
  a.material.emissive.setHex(0xffb648);
  assert.equal(b.material.color.getHex(), 0x7d97ab, 'one network state cannot repaint another');
  assert.equal(shared.color.getHex(), 0x7d97ab, 'the loader blueprint stays immutable');

  for (const resource of [...ownedA, ...ownedB]) resource.dispose();
  a.geometry.dispose();
  b.geometry.dispose();
  shared.dispose();
});

test('the standing authored Conduit group swaps LOD in place across work and site registers', async () => {
  const lod0 = new THREE.BoxGeometry(1, 1, 1);
  const lod1 = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const material = new THREE.MeshStandardMaterial();
  const identity = new THREE.Matrix4();
  const blueprint = {
    assetId: 'place_works_conduit_lane_straight',
    primitives: [
      { name: 'LOD0_flow_mesh', geometry: lod0, material, matrix: identity.clone(), tags: { lod: 'lod0' } },
      { name: 'LOD1_flow_mesh', geometry: lod1, material, matrix: identity.clone(), tags: { lod: 'lod1' } },
    ],
    markers: [],
  };
  let leaseReleases = 0;
  const loader = createWorksPartLoader({
    renderer: {},
    registry: {
      conduit: Object.freeze({ lod0: '/conduit.glb', lod1: null, slot: 'place', hooks: ['flow_mesh'] }),
    },
    lease: {
      isActive: () => true,
      async load() { return blueprint; },
      release() { leaseReleases += 1; },
    },
  });

  const group = await loader.loadWorksPart('conduit');
  const visibility = () => Object.fromEntries(group.children.map((mesh) => [mesh.name, mesh.visible]));
  assert.deepEqual(visibility(), { LOD0_flow_mesh: true, LOD1_flow_mesh: false });
  const identityBefore = group;

  loader.setRegister('site');
  assert.equal(group, identityBefore, 'register swap must not replace the standing transaction');
  assert.deepEqual(visibility(), { LOD0_flow_mesh: false, LOD1_flow_mesh: true });
  loader.setRegister('work');
  assert.deepEqual(visibility(), { LOD0_flow_mesh: true, LOD1_flow_mesh: false });

  loader.releaseWorksPart(group);
  loader.dispose('test');
  assert.equal(leaseReleases, 1);
});

test('teardown during load releases the late source once and never builds a fallback', async () => {
  const wait = deferred();
  const h = harness(() => wait.promise);
  const attempt = h.lifecycle.rebuild([{ id: 'late' }]);

  h.close();
  h.lifecycle.cancel('disposed');
  wait.resolve(source('late'));

  assert.equal((await attempt).status, 'cancelled');
  assert.equal(h.releases.get('late'), 1);
  assert.deepEqual(h.mounted, []);
  assert.equal(h.fallbackBuilds.length, 0);
  assert.equal(h.lifecycle.stats().phase, 'disposed');
});
