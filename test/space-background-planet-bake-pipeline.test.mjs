import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SpaceBackground } from '../src/render/spaceBackground.js';

function planetBakeHarness() {
  const background = Object.create(SpaceBackground.prototype);
  background.currentPaletteName = 'EMBER';
  background._planetBakeMaterial = null;
  background._bakeLayer = () => {};
  return background;
}

test('planet impostor bakes retain one exact shader material and update only its uniforms', () => {
  const background = planetBakeHarness();
  const firstTarget = {};
  const secondTarget = {};
  const draws = [];
  background._bakeLayer = (material, target) => {
    draws.push({ material, target });
  };

  background._renderPlanetTarget(firstTarget, {
    type: 'rocky',
    seed: 37,
    lightAngle: 0.25,
    ring: false,
    ringTilt: 0,
  });
  const retained = background._planetBakeMaterial;
  assert.ok(retained?.isShaderMaterial);
  assert.equal(retained.name, 'SF_PlanetBake_Pipeline');
  assert.equal(retained.transparent, true);
  assert.equal(retained.blending, THREE.NoBlending);
  assert.equal(retained.depthTest, false);
  assert.equal(retained.depthWrite, false);
  assert.equal(draws[0].material, retained);
  assert.equal(draws[0].target, firstTarget);
  assert.equal(retained.uniforms.uType.value, 1);
  assert.equal(retained.uniforms.uSeed.value, (37 % 1000) * 0.13);

  background._renderPlanetTarget(secondTarget, {
    type: 'gas',
    seed: 91,
    lightAngle: -0.5,
    ring: true,
    ringTilt: 0.3,
  });
  assert.equal(background._planetBakeMaterial, retained,
    'travel admission reuses the boot-owned material instead of releasing its driver program');
  assert.equal(draws[1].material, retained);
  assert.equal(draws[1].target, secondTarget);
  assert.equal(retained.uniforms.uType.value, 0);
  assert.equal(retained.uniforms.uSeed.value, (91 % 1000) * 0.13);
  assert.equal(retained.uniforms.uRing.value, 1);
  assert.equal(retained.uniforms.uRingTilt.value, 0.3);
});

test('planet pipeline warm uses a disposable 1px target with the production color-space contract', () => {
  const background = planetBakeHarness();
  let captured = null;
  let disposed = 0;
  background._renderPlanetTarget = (target, spec) => {
    captured = { target, spec };
    target.addEventListener('dispose', () => { disposed += 1; });
  };

  background._warmPlanetBakePipeline();

  assert.ok(captured?.target?.isWebGLRenderTarget);
  assert.equal(captured.target.width, 1);
  assert.equal(captured.target.height, 1);
  assert.equal(captured.target.texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(captured.target.depthBuffer, false);
  assert.equal(captured.target.stencilBuffer, false);
  assert.deepEqual(captured.spec, {
    type: 'rocky',
    seed: 0,
    lightAngle: 0,
    ring: false,
    ringTilt: 0,
  });
  assert.equal(disposed, 1, 'only the material/program survives the boot warm');
});

test('context-loss resources include retained off-scene planet and comet resources', () => {
  const background = planetBakeHarness();
  background.l0Target = null;
  background.l1Target = null;
  background.l2Target = null;
  background.planetCache = new Map();
  background._planetBakeMaterial = new THREE.ShaderMaterial();
  background.lowTier = true;
  background.comet = null;
  background._cometMat = new THREE.SpriteMaterial();
  background._cometTex = new THREE.Texture();

  assert.deepEqual(background.contextLossResources(), [
    background._planetBakeMaterial,
    background._cometMat,
    background._cometTex,
  ], 'old-context listeners must be detached even when low-tier resources are outside the scene');
});

function contextRestoreHarness() {
  const background = planetBakeHarness();
  background.currentPaletteName = 'EMBER';
  background.bakeSizes = { L0_void: 1, L1_nebula: 1, L2_wisps: 1 };
  background.skySeed = 1;
  background.l0Target = null;
  background.l1Target = null;
  background.l2Target = null;
  background.planets = [];
  background.planetCache = new Map();
  background.planetCacheOrder = [];
  background._paletteColors = () => ({
    void: new THREE.Color(),
    haze: new THREE.Color(),
    core: new THREE.Color(),
  });
  background._nebulaBakeUniforms = () => ({});
  return background;
}

test('context restore warms the retained planet pipeline when no hero target is active', () => {
  const background = contextRestoreHarness();
  let warmCalls = 0;
  background._warmPlanetBakePipeline = () => { warmCalls += 1; };

  background.onContextRestore();

  assert.equal(warmCalls, 1);
});

test('context restore warms the retained comet texture while its low-tier sprite is detached', () => {
  const background = contextRestoreHarness();
  const texture = new THREE.Texture();
  const initialized = [];
  background.lowTier = true;
  background.comet = null;
  background._cometTex = texture;
  background.renderer = {
    initTexture(actualTexture) {
      initialized.push(actualTexture);
    },
  };
  background._warmPlanetBakePipeline = () => {};

  background.onContextRestore();

  assert.deepEqual(initialized, [texture]);
  assert.equal(background._cometTextureWarmReceipt?.reason, 'context-restore');
  assert.equal(background._cometTextureWarmReceipt?.ready, true);
});

test('context restore re-bakes an active planet without a redundant temporary warm', () => {
  const background = contextRestoreHarness();
  const spec = {
    type: 'ice',
    seed: 12,
    lightAngle: 0.5,
    ring: false,
    ringTilt: 0,
  };
  const target = {};
  background.planets = [{ spec }];
  background.planetCache.set('ice_12_0', target);
  background.planetCacheOrder.push('ice_12_0');
  const renders = [];
  let warmCalls = 0;
  background._renderPlanetTarget = (actualTarget, actualSpec) => {
    renders.push({ target: actualTarget, spec: actualSpec });
  };
  background._warmPlanetBakePipeline = () => { warmCalls += 1; };

  background.onContextRestore();

  assert.deepEqual(renders, [{ target, spec }]);
  assert.equal(warmCalls, 0);
});

test('background teardown disposes the retained planet material exactly once', () => {
  const background = planetBakeHarness();
  const material = new THREE.ShaderMaterial();
  let disposeCount = 0;
  material.addEventListener('dispose', () => { disposeCount += 1; });
  background._planetBakeMaterial = material;
  background._disposeStructureMacro = () => {};
  background._disposeBakeTargets = () => {};
  background.flareAtlas = null;
  background.planetCache = new Map();
  background._spriteMatCache = new Map();
  background._cometMat = null;
  background._cometTex = null;
  background.group = new THREE.Group();
  background.layerGeometry = null;
  background.layerMaterial = null;
  background.layerMesh = null;
  background.scene = new THREE.Scene();
  background.scene.add(background.group);
  background.bakePlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));

  background.dispose();

  assert.equal(disposeCount, 1);
  assert.equal(background._planetBakeMaterial, null);
});
