import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SECTOR_PALETTE_CLASSES } from '../src/data/sectors.js';
import { DEEP_FIELD_VERTEX, DEEP_FIELD_FRAGMENT } from '../src/render/deepFieldDesign.js';
import {
  createFracturedDebrisGeometry, installDebrisVariantAttribute, resolveDebrisFinish,
  installDeepFieldPresentation,
} from '../src/render/deepFieldPresentation.js';
import * as parallax from '../src/render/parallaxLayers.js';

function fixtureState() {
  return {
    settings: { video: { particleQuality: 'medium', motionReduce: false } },
    render: { sectorPalette: SECTOR_PALETTE_CLASSES.core },
    world: { frameOrigin: { x: 0, z: 0 } },
    camera: { focus: new THREE.Vector3(8191, 0, -3200), zoom: 144 },
  };
}

test('both closed silhouettes fit one original-size geometry with finite independent normals', () => {
  const geo = createFracturedDebrisGeometry();
  assert.equal(geo.getAttribute('position').count, 240);
  for (const name of ['position', 'normal', 'aDeepFieldPositionB', 'aDeepFieldNormalB']) {
    const attr = geo.getAttribute(name);
    assert.equal(attr.count, 240);
    assert.ok(attr.array.every(Number.isFinite), name);
  }
  for (const name of ['normal', 'aDeepFieldNormalB']) {
    const n = geo.getAttribute(name);
    for (let i = 0; i < n.count; i++) {
      assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-5);
    }
  }
  installDebrisVariantAttribute(geo, 1400);
  const a = geo.getAttribute('aDeepFieldVariant');
  assert.equal(a.count, 1400);
  assert.equal(a.usage, THREE.StaticDrawUsage);
  assert.deepEqual(Array.from(a.array.slice(0, 8)), [0, 1, 0, 1, 0, 1, 0, 1]);
  geo.dispose();
});

test('regional finish survives serialized palettes', () => {
  for (const palette of Object.values(SECTOR_PALETTE_CLASSES)) {
    assert.equal(resolveDebrisFinish(palette), resolveDebrisFinish(JSON.parse(JSON.stringify(palette))));
  }
});

test('normal rotation precedes instance normal transform; shape selection precedes wrap/spin', () => {
  const state = fixtureState();
  const stack = parallax.init(new THREE.Scene(), state, null, state.render.sectorPalette);
  try {
    assert.equal(stack.groups.length, 3);
    for (const group of stack.groups) {
      const mesh = group.children[0];
      const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
        fragmentShader: THREE.ShaderLib.standard.fragmentShader };
      mesh.material.onBeforeCompile(shader, {});
      assert.ok(shader.vertexShader.includes('objectNormal = mix(objectNormal, aDeepFieldNormalB'));
      const selection = shader.vertexShader.indexOf('transformed = mix(transformed, aDeepFieldPositionB');
      assert.ok(selection < shader.vertexShader.indexOf('sfParallaxBaseCenter'));
      if (group.userData.layer !== 'farDust') {
        const rotation = shader.vertexShader.indexOf('objectNormal = sfRotateParallaxDebris');
        assert.ok(rotation > 0 && rotation < shader.vertexShader.indexOf('#include <defaultnormal_vertex>'));
      }
      assert.equal(mesh.material.transparent, false);
      assert.equal(mesh.material.depthWrite, true);
    }
  } finally { parallax.dispose(); }
});

test('movement, rebase, and regional finish changes upload no instance matrices or shape attributes', () => {
  const state = fixtureState();
  const scene = new THREE.Scene();
  const stack = parallax.init(scene, state, null, state.render.sectorPalette);
  const records = stack.groups.map(g => ({
    mesh: g.children[0], matrix: g.children[0].instanceMatrix.array.slice(),
    matrixVersion: g.children[0].instanceMatrix.version,
    shapeVersion: g.children[0].geometry.getAttribute('aDeepFieldVariant').version,
  }));
  try {
    for (let i = 0; i < 120; i++) {
      state.camera.focus.x += 2;
      if (i === 20) { state.world.frameOrigin.x += 8192; state.camera.focus.x -= 8192; }
      if (i === 30) state.render.sectorPalette = SECTOR_PALETTE_CLASSES.belt;
      parallax.update(1 / 60);
    }
    for (const r of records) {
      assert.deepEqual(r.mesh.instanceMatrix.array, r.matrix);
      assert.equal(r.mesh.instanceMatrix.version, r.matrixVersion);
      assert.equal(r.mesh.geometry.getAttribute('aDeepFieldVariant').version, r.shapeVersion);
    }
    assert.deepEqual(stack.groups.map(g => g.children[0].count), [80, 1400, 96]);
  } finally { parallax.dispose(); }
  assert.equal(scene.children.length, 0);
});

test('factory upgrade is idempotent, keeps camera matrix references, and retires replaced geometry', () => {
  class Fixture {
    _resolveTier() { this.bakeSizes = { L0_void: 2048, L1_nebula: 2048, L2_wisps: 2048 }; }
    _buildLayers() {
      this.layerGeometry?.dispose();
      this.layerGeometry = new THREE.PlaneGeometry(4000, 4000);
      this.retired = this.layerGeometry;
      this.retired.addEventListener('dispose', () => { this.disposed = (this.disposed || 0) + 1; });
      this.layerMaterial = new THREE.ShaderMaterial({ uniforms: {} });
      this.layerMesh = new THREE.Mesh(this.layerGeometry, this.layerMaterial);
    }
    _createPlanetBakeMaterial() { return new THREE.ShaderMaterial(); }
    stats() { return { stars: 16000 }; }
  }
  assert.equal(installDeepFieldPresentation(Fixture), true);
  assert.equal(installDeepFieldPresentation(Fixture), false);
  const f = new Fixture(); f.camera = new THREE.PerspectiveCamera();
  f._resolveTier(); f._buildLayers();
  assert.equal(f.bakeSizes.L0_void, 32);
  assert.equal(f.bakeSizes.L1_nebula, 2048);
  assert.equal(f.layerGeometry.getAttribute('position').count, 3);
  assert.equal(f.disposed, 1);
  assert.equal(f.layerMaterial.vertexShader, DEEP_FIELD_VERTEX);
  assert.equal(f.layerMaterial.fragmentShader, DEEP_FIELD_FRAGMENT);
  assert.equal(f.layerMaterial.uniforms.uSkyCameraWorld.value, f.camera.matrixWorld);
  assert.equal(f.layerMaterial.uniforms.uSkyProjectionInverse.value, f.camera.projectionMatrixInverse);
  assert.equal(f.layerMaterial.depthTest, true);
  assert.equal(f.layerMaterial.depthWrite, false);
  assert.equal(f.stats().stars, 16000);
  assert.equal(f.stats().voidTextureBytes, 5460);
  f.layerGeometry.dispose(); f.layerMaterial.dispose();
});
