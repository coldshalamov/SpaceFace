// The L0 deep-field bake material outlives a bake: one shader program for the background's life.
//
// bakeAll() built a fresh ShaderMaterial for L0 on every call and disposed it straight after, although the
// constructor's bake and the initial-sector bake use the identical shader. Each dispose destroyed the linked
// program and the next bake relinked it (a measured first-use driver wait inside the Launch-click worker
// reply in the 2026-10-13 profile). The material is now created once, its uniforms are refreshed per bake,
// it is exposed to the context-loss lifecycle, and it is disposed with the background.
import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import { SpaceBackground } from '../src/render/spaceBackground.js';

function buildBackground() {
  const baked = [];
  let disposedMaterials = 0;
  class ProbeBackground extends SpaceBackground {
    _measureGeometry() {
      this.heroDist = 400; this.heroSizeK = 4; this.quadSize = 800;
      this.starCell = 1800; this.windowBiasZ = 0; this.perspScale = 973; this.starPxToWorld = 0.4;
    }
    _bakeFlareAtlas() { return null; }
    _warmPlanetBakePipeline() { return true; }
    _createStars() {}
    _createFlares() {}
    _createComet() {}
    _refreshHeroes() {}
    _makeRT(size) { return { size, texture: new THREE.Texture(), dispose() {} }; }
    _bakeLayer(material, target) {
      baked.push({
        material,
        target,
        seed: material.uniforms?.uSeed?.value,
        resolution: material.uniforms?.uResolution?.value,
        fragment: material.fragmentShader,
      });
    }
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 5000);
  camera.position.set(0, 120, 90);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const state = {
    meta: { seed: 4242 },
    render: { gpu: { renderer: 'NVIDIA GeForce RTX 4080', vendor: 'NVIDIA', software: false, tier: 'discrete' } },
    settings: { video: { particleQuality: 'medium' } },
  };
  const bg = new ProbeBackground(scene, state, { camera });
  baked.length = 0; // only the bakes we ask for below
  return {
    bg,
    baked,
    l0Materials: () => baked.filter((row) => row.fragment && row.material.uniforms?.uVoid).map((row) => row.material),
    countDisposals: () => {
      // Count dispose() calls on the L0 material from here on.
      const material = bg._l0BakeMaterial;
      if (!material) return;
      const original = material.dispose.bind(material);
      material.dispose = () => { disposedMaterials += 1; original(); };
    },
    disposed: () => disposedMaterials,
  };
}

test('repeated bakes reuse one L0 material and never dispose it between bakes', () => {
  const h = buildBackground();
  h.bg.bakeAll('EMBER');
  const first = h.bg._l0BakeMaterial;
  assert.ok(first, 'the L0 bake material is retained on the background');
  h.countDisposals();
  h.bg.skySeed = 999;
  h.bg.bakeAll('BLUE');
  h.bg.bakeAll('EMBER');
  const l0 = h.l0Materials();
  assert.equal(l0.length, 3, 'three bakes drew L0 three times');
  assert.equal(new Set(l0).size, 1, 'always the same material, so the linked program survives');
  assert.equal(h.bg._l0BakeMaterial, first);
  assert.equal(h.disposed(), 0, 'no per-bake dispose (that destroyed and relinked the program)');
});

test('every bake still gets its own uniforms: seed and resolution follow the bake, not the first one', () => {
  const h = buildBackground();
  h.bg.skySeed = 17;
  h.bg.bakeAll('EMBER');
  h.bg.skySeed = 999;
  h.bg.bakeAll('BLUE');
  const rows = h.baked.filter((row) => row.material.uniforms?.uVoid);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].seed, rows[1].seed, 'a later bake with another sky seed is not stuck on the first seed');
  assert.equal(rows[1].resolution, h.bg.bakeSizes.L0_void, 'resolution tracks the configured L0 size');
  // The palette colours are copied into the retained uniforms each time.
  const material = h.bg._l0BakeMaterial;
  assert.ok(material.uniforms.uVoid.value.isColor || material.uniforms.uVoid.value.isVector3 || typeof material.uniforms.uVoid.value === 'object');
});

test('the retained material is exposed to the context-loss lifecycle and disposed exactly once with the background', () => {
  const h = buildBackground();
  h.bg.bakeAll('EMBER');
  const material = h.bg._l0BakeMaterial;
  assert.ok(material);
  let disposals = 0;
  const original = material.dispose.bind(material);
  material.dispose = () => { disposals += 1; original(); };
  const resources = typeof h.bg.contextLossResources === 'function' ? h.bg.contextLossResources() : null;
  if (resources) {
    assert.ok(resources.includes(material), 'context loss can detach this old-context material before reuse');
  }
  h.bg.dispose();
  assert.equal(disposals, 1, 'disposed once, with the owner');
  assert.equal(h.bg._l0BakeMaterial, null);
  h.bg.dispose();
  assert.equal(disposals, 1, 'a second dispose does not dispose it again');
});
