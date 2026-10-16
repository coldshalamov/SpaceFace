import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { onboarding } from '../src/systems/onboarding.js';
import { render } from '../src/render/renderer.js';

function scriptedPayload() {
  let payload;
  onboarding._warmScriptedCohort.call({
    state: { tick: 0, playerId: 1, entities: new Map([[1, { pos: { x: 0, z: 0 } }]]) },
    bus: { emit(name, value) { if (name === 'onboarding:rosterPrewarm') payload = value; } },
  });
  assert.equal(payload.specs.length, 2, 'the real intro requests its raider and patrol');
  return payload;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function stubCanvas() {
  const context = {
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
    getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
    putImageData() {}, measureText() { return { width: 10 }; },
  };
  return { width: 256, height: 256, getContext: () => context, style: {}, addEventListener() {} };
}

function harness(t, { pauseFirstDrain = false } = {}) {
  // The unchanged default warm builds real asteroid textures. Supply their ordinary CPU
  // canvas surface so default-scope assertions cannot pass through its caught failure path.
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElement: () => stubCanvas() };
  const builds = [], compiled = [], upgrades = [], catalogs = [];
  const gate = deferred();
  let drains = 0;
  const owner = {
    renderer: {}, scene: new THREE.Scene(),
    state: { world: { currentSectorId: 'sector_helios_outer' }, render: {
      compileObjectPipelines(subject) { compiled.push(subject); return Promise.resolve({}); },
    } },
    vf: { build(spec) {
      builds.push(spec);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.name = `warm:${spec.id}`;
      if (spec.type === 'ship') mesh.userData.requestAuthoredUpgrade = (_renderer, _scene, options) => {
        upgrades.push({ spec, mesh, options });
        return Promise.resolve(true);
      };
      return mesh;
    } },
    _meshes: new Map(), _rosterPrewarmIds: new Set(), _rosterPrewarmWeaponIds: new Set(),
    _rosterPrewarmRoots: [], _rosterPrewarmPending: new Set(),
    _rosterPrewarmPendingLabels: new WeakMap(),
    _admitRosterPartCatalog(...args) { catalogs.push(args); },
    async _drainRosterPrewarmCohort(...args) {
      if (pauseFirstDrain && drains++ === 0) await gate.promise;
      return render._drainRosterPrewarmCohort.apply(this, args);
    },
  };
  const admit = (payload, options) => render._admitSurvivalRosterPrewarm.call(owner, payload, options);
  const settle = async () => {
    gate.resolve();
    for (let round = 0; round < 30 && owner._rosterPrewarmPending.size > 0; round++) {
      await Promise.allSettled([...owner._rosterPrewarmPending]);
      await new Promise((done) => setImmediate(done));
    }
    assert.equal(owner._rosterPrewarmPending.size, 0, 'all requested admissions settle');
  };
  t.after(() => {
    gate.resolve();
    owner.scene.traverse((object) => {
      object.geometry?.dispose();
      for (const material of [object.material].flat().filter(Boolean)) material.dispose();
    });
    owner.scene.clear();
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument);
    else delete globalThis.document;
  });
  return { owner, builds, compiled, upgrades, catalogs, admit, settle };
}

const scriptedScope = { scope: 'onboarding' };

test('the intro warms its exact hull twins and weapons without the global catalog or generic tail', async (t) => {
  const payload = scriptedPayload(), h = harness(t);
  h.admit(payload, scriptedScope);
  await h.settle();
  for (const spec of payload.specs) {
    const twins = h.builds.filter((built) => built === spec);
    assert.equal(twins.length, 2, `${spec.id} retains both physical pool-promotion witnesses`);
    const upgrades = h.upgrades.filter((entry) => entry.spec === spec);
    assert.equal(upgrades.length, 2, 'both twins keep the authored admission path');
    for (const { mesh, options } of upgrades) {
      assert.ok(h.compiled.includes(mesh), 'authored completion is followed by pipeline preparation');
      assert.equal(options.deferPackagePoolActivation, false);
      assert.equal(mesh.visible, false);
    }
  }
  const weapons = new Set(payload.specs.flatMap((spec) => spec.data.weapons || [])
    .map((weapon) => weapon.defId || weapon.id));
  const projectiles = h.builds.filter((spec) => spec.type === 'projectile');
  assert.deepEqual(new Set(projectiles.map((spec) => spec.data.weaponId)), weapons);
  assert.equal(h.builds.length, payload.specs.length * 2 + weapons.size,
    'no unrelated wreck, spawnable, or asteroid exemplar joins the intro request');
  assert.equal(h.catalogs.length, 0);
  assert.notEqual(h.owner._rosterPrewarmLeafWarmed, true);
  assert.notEqual(h.owner._rosterPrewarmCatalogAttempted, true);
  const count = h.builds.length;
  h.admit(payload, scriptedScope);
  assert.equal(h.builds.length, count, 'a repeated intro request builds nothing');
  assert.equal(h.owner._rosterPrewarmPending.size, 0, 'skipped generic flags do not force another drain');
});

test('a later default survival request still owns its generic families and catalog', async (t) => {
  const payload = scriptedPayload(), h = harness(t);
  h.admit(payload, scriptedScope);
  await h.settle();
  const scriptedBuilds = h.builds.length;
  h.admit({ specs: [] });
  await h.settle();
  assert.ok(h.builds.length > scriptedBuilds, 'default scope retains generic family preparation');
  assert.equal(h.catalogs.length, 1);
  assert.equal(h.owner._rosterPrewarmLeafWarmed, true);
  assert.equal(h.owner._rosterPrewarmCatalogAttempted, true);
  assert.ok(h.compiled.some((root) => root.children.some((child) => child.userData.rosterPrewarmLeaf)),
    'the default asteroid family reaches pipeline preparation rather than its caught-error path');
});

test('coalesced intro requests retain their narrow scope and requested hulls', async (t) => {
  const payload = scriptedPayload(), h = harness(t, { pauseFirstDrain: true });
  const late = { ...payload.specs[0], id: 'onboarding_warm_late_raider' };
  h.admit(payload, scriptedScope);
  h.admit({ specs: [late] }, scriptedScope);
  await h.settle();
  assert.equal(h.builds.filter((spec) => spec === late).length, 2);
  assert.equal(h.catalogs.length, 0);
  assert.deepEqual(new Set(h.builds.filter((spec) => spec.type !== 'projectile').map((spec) => spec.id)),
    new Set([...payload.specs.map((spec) => spec.id), late.id]));
  assert.notEqual(h.owner._rosterPrewarmCatalogAttempted, true);
});

test('a coalesced full-scope request is retained even when it names no new hull', async (t) => {
  const payload = scriptedPayload(), h = harness(t, { pauseFirstDrain: true });
  h.admit(payload, scriptedScope);
  h.admit({ specs: [] });
  await h.settle();
  assert.equal(h.catalogs.length, 1, 'an empty default request still owns generic preparation');
  assert.equal(h.owner._rosterPrewarmLeafWarmed, true);
  assert.equal(h.owner._rosterPrewarmCatalogAttempted, true);
  for (const spec of payload.specs) assert.equal(h.builds.filter((built) => built === spec).length, 2);
});
