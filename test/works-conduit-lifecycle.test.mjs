import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as THREE from 'three';

import {
  createConduitMountLifecycle,
  createWorksConduitMaterialScope,
  isolateWorksConduitMaterials,
  worksConduitRegisterSemantics,
} from '../src/ui/asteroid/asteroidRenderer3d.js';

test('authored conduit lifecycle atomically swaps clones before releasing their templates', async () => {
  const events = [];
  let next = 0;
  const lifecycle = createConduitMountLifecycle({
    async acquireTemplates(ids) {
      events.push(`acquire:${ids.join(',')}`);
      let released = false;
      return {
        instantiate(id) { return { id, n: ++next }; },
        release() {
          if (released) return false;
          released = true;
          events.push(`templates-release:${ids.join(',')}`);
          return true;
        },
      };
    },
    prepare(source, desired) { return { id: source.id, n: source.n, desired }; },
    mount(record) { events.push(`mount:${record.n}`); },
    unmount(record) { events.push(`unmount:${record.n}`); },
    release(source) { events.push(`release:${source.n}`); },
  });
  const first = await lifecycle.rebuild([
    { assetId: 'power-straight' },
    { assetId: 'power-straight' },
    { assetId: 'lane-corner' },
  ]);
  assert.equal(first.status, 'authored');
  assert.deepEqual(events.slice(0, 4), [
    'acquire:power-straight,lane-corner', 'mount:1', 'mount:2', 'mount:3',
  ]);
  const second = await lifecycle.rebuild([{ assetId: 'lane-end' }]);
  assert.equal(second.status, 'authored');
  assert.ok(events.indexOf('mount:4') < events.indexOf('unmount:1'), 'replacement mounts before retiring the old batch');
  const priorRelease = events.indexOf('release:1');
  const priorTemplateRelease = events.indexOf('templates-release:power-straight,lane-corner');
  assert.ok(priorRelease >= 0 && priorTemplateRelease > priorRelease, 'clones release before old templates');
  assert.equal(lifecycle.stats().templateCount, 1);
});

test('deferred or failed replacement keeps the mounted conduit batch visible', async () => {
  const mounted = new Set();
  let replacementReady;
  let calls = 0;
  const lifecycle = createConduitMountLifecycle({
    acquireTemplates() {
      calls += 1;
      if (calls === 1) return Promise.resolve({
        ids: ['old'], instantiate: () => ({ id: 'old' }), release: () => true,
      });
      if (calls === 2) return new Promise((resolve) => { replacementReady = resolve; });
      return Promise.resolve(null);
    },
    prepare(source) { return { source }; },
    mount(record) { mounted.add(record.source.id); },
    unmount(record) { mounted.delete(record.source.id); },
    release() {},
  });
  await lifecycle.rebuild([{ assetId: 'old' }]);
  const pending = lifecycle.rebuild([{ assetId: 'new' }]);
  assert.deepEqual([...mounted], ['old'], 'old batch remains while replacement is loading');
  replacementReady({
    ids: ['new'], instantiate: () => ({ id: 'new' }), release: () => true,
  });
  assert.equal((await pending).status, 'authored');
  assert.deepEqual([...mounted], ['new'], 'swap happens only after the complete replacement stages');
  assert.equal((await lifecycle.rebuild([{ assetId: 'broken' }])).status, 'failed');
  assert.deepEqual([...mounted], ['new'], 'failed replacement preserves the prior visible batch');
});

test('stale authored conduit arrivals release their template set exactly once and never mount', async () => {
  let resolveTemplates;
  let releases = 0;
  let mounts = 0;
  const lifecycle = createConduitMountLifecycle({
    acquireTemplates: () => new Promise((resolve) => { resolveTemplates = resolve; }),
    prepare: () => ({ ok: true }),
    mount: () => { mounts += 1; },
    unmount: () => {},
    release: () => {},
  });
  const pending = lifecycle.rebuild([{ assetId: 'power-cross' }]);
  lifecycle.cancel();
  resolveTemplates({
    instantiate: () => ({ id: 'power-cross' }),
    release: () => { releases += 1; return releases === 1; },
  });
  assert.equal((await pending).status, 'cancelled');
  assert.equal(mounts, 0);
  assert.equal(releases, 1);
});

test('conduit hook shells are shared by component while only lane flow samplers are cloned', () => {
  const map = new THREE.Texture();
  const normalMap = new THREE.Texture();
  const aoMap = new THREE.Texture();
  const source = new THREE.MeshStandardMaterial({ map, normalMap, aoMap });
  const meshA = new THREE.Mesh(new THREE.BoxGeometry(), source);
  const meshB = new THREE.Mesh(new THREE.BoxGeometry(), source);
  const meshC = new THREE.Mesh(new THREE.BoxGeometry(), source);
  const scope = createWorksConduitMaterialScope();
  const first = isolateWorksConduitMaterials([meshA], { family: 'lane', key: 'alpha', scope });
  const same = isolateWorksConduitMaterials([meshB], { family: 'lane', key: 'alpha', scope });
  const second = isolateWorksConduitMaterials([meshC], { family: 'lane', key: 'beta', scope });
  assert.notEqual(meshA.material, source);
  assert.equal(meshA.material, meshB.material, 'one shell is reused by a family/network component');
  assert.notEqual(meshA.material, meshC.material, 'different networks are isolated');
  assert.notEqual(meshA.material.map, map);
  assert.equal(meshA.material.map, meshB.material.map, 'same component shares its flow sampler');
  assert.notEqual(meshA.material.map, meshC.material.map, 'different components do not share flow phase');
  assert.equal(meshA.material.normalMap, normalMap, 'normal sampler remains static/shared');
  assert.equal(meshA.material.aoMap, aoMap, 'ORM sampler remains static/shared');
  first.flowSampler.offset.x = 0.37;
  assert.equal(map.offset.x, 0, 'atlas source sampler stays untouched');
  assert.equal(same.flowSampler.offset.x, 0.37, 'same component retains its shared phase');
  assert.equal(second.flowSampler.offset.x, 0, 'other component stays untouched');
  scope.dispose();
});

test('register and resize semantics preserve resident conduit placement without a topology acquire', () => {
  const work = worksConduitRegisterSemantics('work', 120);
  const site = worksConduitRegisterSemantics('site', 19);
  assert.equal(work.laneOffset, site.laneOffset, 'register flip does not reposition resident seats');
  assert.equal(work.laneOffset, 0.2 * 2.2, 'shared-cell lateral split is the fixed 0.20*S offset');
  assert.equal(work.laneWidthWu, 1.10, 'work register reports the authored 1.10 WU lane envelope');
  assert.equal(site.laneWidthWu, 1.10, 'site register reports the same authored lane envelope');
  assert.equal(work.laneWidth, site.laneWidth);
  assert.equal(work.powerWidth, site.powerWidth);
  assert.ok(work.laneWidthPx > site.laneWidthPx, 'probe widths track the active register projection');
  const source = readFileSync(new URL('../src/ui/asteroid/asteroidRenderer3d.js', import.meta.url), 'utf8');
  const resize = source.slice(source.indexOf('function resize()'), source.indexOf('const ro =', source.indexOf('function resize()')));
  assert.match(resize, /refreshAuthoredOverlayRegisterMetrics\(\)/);
  assert.doesNotMatch(resize, /(?:rebuildOverlays|acquireWorksConduitTemplates)\s*\(/,
    'resize updates resident probe metrics without topology/template work');
});
