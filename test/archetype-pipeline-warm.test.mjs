import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as THREE from 'three';

import {
  invalidatePartsLibraryCaches,
  releaseArchetypeWarmOwners,
  warmSpawnableArchetypePipelines,
} from '../src/render/partsLibrary.js';

function makeStubCanvas() {
  const context = {
    canvas: { width: 256, height: 256 }, fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    putImageData() {}, measureText() { return { width: 10 }; },
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
  };
  return { width: 256, height: 256, getContext: () => context, style: {}, addEventListener() {} };
}

globalThis.document = {
  createElement: (tag) => tag === 'canvas' ? makeStubCanvas() : { style: {}, appendChild() {}, addEventListener() {} },
};

const RELEASE_ROOT = 'assets/ships/release/parts/';

function relativeFile(url) {
  return String(url || '').replace(/\\/g, '/').replace(RELEASE_ROOT, '');
}

function makeRecord(url, { asPackage = false } = {}) {
  const file = relativeFile(url);
  const geometry = new THREE.BoxGeometry(1, 0.5, 0.5);
  const material = new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.7, metalness: 0.3 });
  const record = {
    url,
    assetId: `FIXTURE_${file}`,
    bounds: { min: [-0.5, -0.25, -0.25], max: [0.5, 0.25, 0.25], size: [1, 0.5, 0.5], center: [0, 0, 0] },
    primitives: [{
      key: `${url}#fixture`,
      name: 'LOD0_Body',
      geometry,
      material,
      matrix: new THREE.Matrix4(),
      tags: Object.freeze({ lod: 'lod0', tint: 'hull' }),
    }],
    markers: [],
    residency: { key: `${url}::hull`, generation: 1, state: 'resident' },
  };
  if (asPackage) {
    const source = new THREE.Mesh(geometry, material);
    source.name = 'LOD0_Body';
    record.renderPackage = {
      assetId: `FIXTURE_PKG_${file}`,
      createInstance({ name, createNode }) {
        const root = new THREE.Group();
        root.name = name;
        const node = typeof createNode === 'function' ? createNode({ source }) : null;
        root.add(node || source.clone(false));
        const planNodes = [root, ...(node ? [node] : root.children)];
        return { root, planNodes, dispose() {} };
      },
    };
  }
  return record;
}

function installWarmHarness(scene) {
  const compileCalls = [];
  const residencyCalls = [];
  const priorWindow = globalThis.window;
  globalThis.window = {
    SF: {
      state: {
        mode: 'flight',
        player: null,
        world: { currentSectorId: 'sector_helios_prime' },
        render: {
          scene,
          compileObjectPipelines(root) {
            compileCalls.push(root);
            return Promise.resolve({ skipped: true });
          },
          prepareAuthoredGpuResidency(root) {
            residencyCalls.push(root);
            return Promise.resolve({ skipped: true });
          },
        },
      },
    },
  };
  return {
    compileCalls,
    residencyCalls,
    restore() {
      if (priorWindow === undefined) delete globalThis.window;
      else globalThis.window = priorWindow;
    },
  };
}

describe('spawnable archetype pipeline warm (PQ-033.02)', { concurrency: 1 }, () => {
test('two detached phantom owners per file compose, compile, and stay unpublished', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const files = ['wholeships/wasp_production_v1.glb', 'wholeships/yard_tug.glb'];
  const loadAuthoredPart = async (url) => makeRecord(url);
  const harness = installWarmHarness(scene);

  try {
    const result = await warmSpawnableArchetypePipelines(renderer, scene, {
      files,
      ownersPerFile: 2,
      releaseMode: true,
      loadAuthoredPart,
      isActive: () => true,
    });

    assert.equal(result.interrupted, false);
    assert.deepEqual(result.failures, []);
    assert.deepEqual([...result.warmed].sort(), [...files].sort());
    assert.equal(result.owners.length, files.length * 2);
    for (const owner of result.owners) {
      assert.equal(owner.boundary.parent, null,
        'phantom warm owners must stay detached from the live scene');
      assert.equal(owner.boundary.userData.kind, 'ship');
      assert.equal(owner.boundary.userData.authoredAssetState, 'authored-prepared');
      assert.ok(owner.composed && owner.composed.root, 'every owner must hold a composed root');
      assert.equal(scene.children.includes(owner.boundary), false);
    }
    // Every owner ran the detached pipeline compile + residency pass on its composed root.
    assert.ok(harness.compileCalls.length >= result.owners.length,
      `expected >= ${result.owners.length} pipeline compiles, got ${harness.compileCalls.length}`);
    assert.ok(harness.residencyCalls.length >= result.owners.length);
  } finally {
    harness.restore();
    invalidatePartsLibraryCaches(renderer);
  }
});

test('the second owner of a file exercises the package-pool admission path', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const loadAuthoredPart = async (url) => makeRecord(url, { asPackage: true });
  const harness = installWarmHarness(scene);

  try {
    const result = await warmSpawnableArchetypePipelines(renderer, scene, {
      files: ['wholeships/survey_pin.glb'],
      ownersPerFile: 2,
      releaseMode: true,
      loadAuthoredPart,
      isActive: () => true,
    });

    assert.deepEqual(result.failures, []);
    assert.equal(result.owners.length, 2);
    const admitted = result.owners
      .flatMap((owner) => owner.composed.packagePoolAdmissions || []);
    assert.ok(admitted.length > 0,
      'two owners of one stamped (geometry, material) key must produce a deferred pool admission');
  } finally {
    harness.restore();
    invalidatePartsLibraryCaches(renderer);
  }
});

test('an inactive owner aborts the pass and reports interrupted', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const loadAuthoredPart = async (url) => makeRecord(url);
  const harness = installWarmHarness(scene);
  let active = true;

  try {
    const result = await warmSpawnableArchetypePipelines(renderer, scene, {
      files: ['wholeships/wasp_production_v1.glb', 'wholeships/yard_tug.glb'],
      ownersPerFile: 1,
      releaseMode: true,
      loadAuthoredPart,
      isActive: () => active,
      yieldBetween: async () => { active = false; },
    });

    assert.equal(result.interrupted, true);
    assert.equal(result.owners.length, 1);
    assert.deepEqual(result.warmed, ['wholeships/wasp_production_v1.glb']);
  } finally {
    harness.restore();
    invalidatePartsLibraryCaches(renderer);
  }
});

test('release retires phantom owners without touching the live scene', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const loadAuthoredPart = async (url) => makeRecord(url);
  const harness = installWarmHarness(scene);

  try {
    const result = await warmSpawnableArchetypePipelines(renderer, scene, {
      files: ['wholeships/wasp_production_v1.glb'],
      ownersPerFile: 2,
      releaseMode: true,
      loadAuthoredPart,
      isActive: () => true,
    });
    assert.equal(result.owners.length, 2);

    const released = await releaseArchetypeWarmOwners(renderer, result.owners, 'test-release');
    assert.equal(released, true);
    for (const owner of result.owners) {
      assert.equal(owner.entity.alive, false,
        'release must mark the phantom entity dead so its residency gate flips');
      assert.equal(owner.boundary.parent, null);
    }
  } finally {
    harness.restore();
    invalidatePartsLibraryCaches(renderer);
  }
});
});
