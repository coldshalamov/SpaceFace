import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBombTelegraphMaterial } from '../src/render/bombPresentation.js';
import { BombFlowSurface, createBombFlowPrecompileMesh, BOMB_FLOW_CAPACITY,
  BOMB_FLOW_STATIONS, BOMB_FLOW_ACROSS } from '../src/render/forceLanguage/bombFlowSurface.js';

const request = () => ({ x: 20, z: -30, radius: 150, time: 1.2, transportAge: 1.2,
  seed: 2.1, angle: .7, envelope: .8, opacity: .88, r: .3, g: .6, b: 1,
  shutdownAge: 2.58, releaseDuration: .42, cooling: 0, heatScale: 1 });
const publish = (owner, record) => { owner.begin(); owner.add(record); owner.end(); };

test('one bounded instance batch preserves dense static topology through motion and pause', () => {
  const owner = new BombFlowSurface(new THREE.Scene(), createBombTelegraphMaterial), record = request();
  try {
    publish(owner, record);
    const positions = owner.geometry.getAttribute('position'), saved = positions.array.slice();
    assert.equal(positions.count, (BOMB_FLOW_STATIONS + 1) * (BOMB_FLOW_ACROSS + 1));
    assert.equal(Object.keys(owner.geometry.attributes).length, 14, 'fits minimum WebGL2 attribute budget without instance matrices');
    assert.equal(owner.geometry.instanceCount, 1);
    const versions = owner.attributes.map(a => a.version);
    publish(owner, record);
    assert.deepEqual(owner.attributes.map(a => a.version), versions, 'paused data does not upload again');
    record.time = record.transportAge = 1.4; publish(owner, record);
    assert.equal(owner.attributes[0].getW(0), Math.fround(1.4));
    assert.deepEqual(positions.array, saved); assert.equal(positions.version, 0);
    owner.begin();
    for (let i = 0; i < BOMB_FLOW_CAPACITY; i++) assert.equal(owner.add(record), true);
    assert.equal(owner.add(record), false); owner.end();
    assert.equal(owner.geometry.instanceCount, 72); assert.equal(owner.dropped, 1);
    owner.begin(); owner.end();
    assert.equal(owner.geometry.instanceCount, 0); assert.equal(owner.mesh.visible, false);
  } finally { owner.dispose(); }
});

test('contacts are snapshotted per channel, disappear without stale bodies, and remain local', () => {
  const owner = new BombFlowSurface(new THREE.Scene(), createBombTelegraphMaterial), record = request();
  const body = { x: 40, z: -15, radius: 9, strength: 1, vx: 8, vz: -2, material: 1 };
  record.environment = { count: 1, records: [body] };
  try {
    publish(owner, record);
    assert.deepEqual([...owner.attributes[4].array.slice(0, 4)], [40, -15, 9, 1]);
    assert.deepEqual([...owner.attributes[7].array.slice(0, 4)], [8, -2, 1, 0]);
    body.x = 900; assert.equal(owner.attributes[4].getX(0), 40, 'producer record reuse cannot mutate a submitted channel');
    record.environment.count = 0; publish(owner, record);
    for (const attr of owner.attributes.slice(4)) assert.deepEqual([...attr.array.slice(0, 4)], [0, 0, 0, 0]);
    record.x -= 800; record.z += 250; publish(owner, record);
    assert.equal(owner.attributes[0].getX(0), -780); assert.equal(owner.attributes[0].getY(0), 220);
    assert.ok(owner.attributes.every(a => a.array.every(Number.isFinite)));
  } finally { owner.dispose(); }
});

test('analytic material composes the production bomb response and precompile uses the same program', () => {
  const owner = new BombFlowSurface(new THREE.Scene(), createBombTelegraphMaterial);
  const warm = createBombFlowPrecompileMesh(createBombTelegraphMaterial);
  try {
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    const base = createBombTelegraphMaterial();
    const original = { ...shader }; base.onBeforeCompile(original);
    owner.material.onBeforeCompile(shader);
    assert.equal(shader.fragmentShader, original.fragmentShader, 'retains exact authored radiance, filtering and absorption');
    assert.match(shader.vertexShader, /transformed=bfPosition/);
    assert.match(shader.vertexShader, /objectNormal=normalize\(cross\(bfAcross,bfAlong\)/);
    assert.doesNotMatch(shader.vertexShader, /vBombSurface = bombSurface;/);
    assert.equal(owner.material.customProgramCacheKey(), warm.material.customProgramCacheKey());
    assert.deepEqual(Object.keys(owner.geometry.attributes), Object.keys(warm.geometry.attributes));
    assert.equal(warm.geometry.instanceCount, 1); assert.equal(warm.visible, true);
    base.dispose();
  } finally { owner.dispose(); warm.geometry.dispose(); warm.material.dispose(); }
});

test('disposal removes the single draw and forbids later admissions', () => {
  const scene = new THREE.Scene(), owner = new BombFlowSurface(scene, createBombTelegraphMaterial, { capacity: 1 });
  publish(owner, request()); assert.equal(scene.children.length, 1);
  owner.dispose(); owner.dispose();
  assert.equal(scene.children.length, 0); assert.equal(owner.count, 0);
  assert.equal(owner.begin(), false); assert.equal(owner.add(request()), false);
});
