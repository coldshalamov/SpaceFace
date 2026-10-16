import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  collectStartupTextures,
  collectStartupTexturesSteps,
} from '../src/render/startupGpuResidency.js';

for (const [name, collect] of [
  ['synchronous', collectStartupTextures],
  ['paced', (roots) => {
    const steps = collectStartupTexturesSteps(roots, 8);
    let step;
    do { step = steps.next(); } while (!step.done);
    return step.value;
  }],
]) {
  test(`${name} texture census visits shared materials once and refreshes each pass`, () => {
    const root = new THREE.Group();
    const map = new THREE.Texture();
    const nextMap = new THREE.Texture();
    const uniformMap = new THREE.Texture();
    let reads = 0;
    let liveMap = map;
    const material = {
      get map() { reads += 1; return liveMap; },
      uniforms: { surface: { value: uniformMap } },
    };
    for (let i = 0; i < 128; i += 1) {
      const mesh = new THREE.Object3D();
      mesh.material = i % 2 ? material : [material, material];
      root.add(mesh);
    }
    assert.deepEqual(new Set(collect([root, root.children[0], map])), new Set([map, uniformMap]));
    assert.equal(reads, 1, 'a shared material pays one property census per admission pass');
    liveMap = nextMap;
    reads = 0;
    assert.deepEqual(new Set(collect(root)), new Set([nextMap, uniformMap]));
    assert.equal(reads, 1, 'the census must observe later texture replacement');
  });

  test(`${name} texture census preserves own enumerable texture and uniform order`, () => {
    const inherited = new THREE.Texture();
    const hidden = new THREE.Texture();
    const symbol = new THREE.Texture();
    const first = new THREE.Texture();
    const second = new THREE.Texture();
    const uniformTexture = new THREE.Texture();
    const inheritedUniform = new THREE.Texture();
    const uniforms = Object.assign(Object.create({ inherited: { value: inheritedUniform } }), {
      surface: { value: uniformTexture },
      duplicate: { value: first },
    });
    Object.defineProperty(uniforms, 'hidden', { value: { value: hidden } });
    const material = Object.assign(Object.create({ inherited }), { map: first, normalMap: second, uniforms });
    Object.defineProperty(material, 'hidden', { value: hidden });
    material[Symbol('hidden texture')] = symbol;
    const root = new THREE.Group();
    const single = new THREE.Object3D();
    single.material = material;
    const multiple = new THREE.Object3D();
    multiple.material = [null, material, { map: second }];
    root.add(single, multiple, new THREE.Object3D());

    assert.deepEqual(collect(root), [first, second, uniformTexture],
      'only own enumerable values participate; first encounter determines upload order');
  });
}
