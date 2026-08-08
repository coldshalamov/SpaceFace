import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  applySpaceBackgroundRootContract,
  SPACE_BACKGROUND_GROUP_ORDER,
  SpaceBackground,
} from '../src/render/spaceBackground.js';

function backgroundHarness() {
  const background = Object.create(SpaceBackground.prototype);
  Object.assign(background, {
    group: applySpaceBackgroundRootContract(new THREE.Group(), -220),
    H: 100,
    bgY: -220,
    starCount: 8,
    flareCount: 4,
    starCell: 1200,
    skySeed: 17,
    lowTier: false,
    tierName: 'high',
    starPxToWorld: 0.1,
    windowBiasZ: 0,
    perspScale: 500,
    heroSizeK: 1.2,
    bgIntensity: 0.7,
    _starTint: new THREE.Color(1, 1, 1),
    flareAtlas: new THREE.Texture(),
    planets: [],
    currentPaletteName: 'EMBER',
    l1Target: { texture: new THREE.Texture() },
    backgroundComposition: { cometInterval: [8, 12] },
    backgroundStructure: null,
    deepFieldRecipe: null,
    rng: () => 0.5,
    comet: null,
  });
  background._getPlanetTexture = () => new THREE.Texture();
  return background;
}

function assertBackgroundMaterial(material, label) {
  assert.equal(material.transparent, true, `${label} remains a transparent celestial layer`);
  assert.equal(material.depthTest, true, `${label} must test against gameplay depth`);
  assert.equal(material.depthWrite, false, `${label} must not occlude later gameplay transparencies`);
}

test('live celestial layers depth-test behind ships and never write depth', () => {
  const background = backgroundHarness();
  background._createStars();
  background._createFlares();
  background._spawnPlanet({ frac: 0.14 });
  const ribbon = background._makeRibbonMaterial(
    new THREE.Color('#335577'), new THREE.Color('#774455'), 0.3, 1.2, 'dust',
  );
  background._spawnWormhole({ frac: 0.1 });

  assertBackgroundMaterial(background.stars.mat, 'stars');
  assertBackgroundMaterial(background.flares.mat, 'flares');
  assertBackgroundMaterial(background.planets[0].mat, 'planet');
  assertBackgroundMaterial(ribbon, 'localized ribbon');
  assertBackgroundMaterial(background.wormhole.material, 'wormhole');
  for (const object of [
    background.stars.pts,
    background.flares.mesh,
    background.planets[0].sprite,
    background.wormhole.mesh,
  ]) {
    assert(object.renderOrder < 0, `${object.name} must remain inside the negative background order`);
  }
});

test('background root starts behind the play plane before its first update', () => {
  const root = applySpaceBackgroundRootContract(new THREE.Group(), -211.2);
  assert.equal(root.name, 'SpaceBackground');
  assert.equal(root.renderOrder, SPACE_BACKGROUND_GROUP_ORDER);
  assert.equal(root.position.y, -211.2);
});

test('comet material follows the same depth contract', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            createLinearGradient() { return { addColorStop() {} }; },
            fillRect() {},
            set fillStyle(_) {},
          };
        },
      };
    },
  };
  try {
    const background = backgroundHarness();
    background._createComet();
    assertBackgroundMaterial(background.comet.mat, 'comet');
    assert(background.comet.sprite.renderOrder < 0);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('planet admission reuses one exact bake material and disposes it only with the background', () => {
  const background = Object.create(SpaceBackground.prototype);
  Object.assign(background, {
    currentPaletteName: 'EMBER',
    _planetBakeEmission: new THREE.Color(),
  });
  background._planetBakeMaterial = background._createPlanetBakeMaterial();

  const material = background._planetBakeMaterial;
  const snapshots = [];
  let disposeCount = 0;
  material.addEventListener('dispose', () => { disposeCount += 1; });
  background._bakeLayer = (candidate, target) => {
    const uniforms = candidate.uniforms;
    snapshots.push({
      candidate,
      target,
      seed: uniforms.uSeed.value,
      type: uniforms.uType.value,
      lightDir: uniforms.uLightDir.value.toArray(),
      ring: uniforms.uRing.value,
      ringTilt: uniforms.uRingTilt.value,
      colors: [
        uniforms.uColA.value.toArray(),
        uniforms.uColB.value.toArray(),
        uniforms.uColC.value.toArray(),
        uniforms.uAtm.value.toArray(),
      ],
    });
  };

  const gasTarget = { id: 'gas' };
  const iceTarget = { id: 'ice' };
  background._renderPlanetTarget(gasTarget, {
    type: 'gas', seed: 91, lightAngle: 0, ring: true, ringTilt: 0.4,
  });
  background._renderPlanetTarget(iceTarget, {
    type: 'ice', seed: 202, lightAngle: Math.PI / 2, ring: false, ringTilt: 0,
  });

  assert.equal(snapshots.length, 2);
  assert.strictEqual(snapshots[0].candidate, material);
  assert.strictEqual(snapshots[1].candidate, material,
    'distinct uncached planets keep the same compiled-program owner');
  assert.strictEqual(snapshots[0].target, gasTarget);
  assert.strictEqual(snapshots[1].target, iceTarget);
  assert.equal(snapshots[0].seed, 91 * 0.13);
  assert.equal(snapshots[1].seed, 202 * 0.13);
  assert.equal(snapshots[0].type, 0);
  assert.equal(snapshots[1].type, 2);
  assert.deepEqual(snapshots[0].lightDir, [1, 0]);
  assert.ok(Math.abs(snapshots[1].lightDir[0]) < 1e-12);
  assert.equal(snapshots[1].lightDir[1], 1);
  assert.deepEqual([snapshots[0].ring, snapshots[0].ringTilt], [1, 0.4]);
  assert.deepEqual([snapshots[1].ring, snapshots[1].ringTilt], [0, 0]);
  assert.notDeepEqual(snapshots[0].colors, snapshots[1].colors,
    'the retained uniforms are fully repainted for each authored planet type');
  assert.equal(disposeCount, 0, 'admission never retires the retained program owner');

  background._disposePlanetBakeMaterial();
  assert.equal(disposeCount, 1, 'background teardown retires the program owner exactly once');
  assert.equal(background._planetBakeMaterial, null);
  background._disposePlanetBakeMaterial();
  assert.equal(disposeCount, 1, 'teardown is idempotent');
});

test('planet bake program warms on the shipping sRGB target contract without retiring its owner', () => {
  const background = Object.create(SpaceBackground.prototype);
  Object.assign(background, {
    currentPaletteName: 'EMBER',
    renderer: {
      render() {},
      getRenderTarget() { return null; },
      setRenderTarget() {},
    },
    _planetBakeEmission: new THREE.Color(),
    planetCache: new Map(),
  });
  background._planetBakeMaterial = background._createPlanetBakeMaterial();
  background.bakePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    background._planetBakeMaterial,
  );

  const material = background._planetBakeMaterial;
  let warmTarget = null;
  let targetDisposeCount = 0;
  let bakeCount = 0;
  const makePlanetRT = background._makePlanetRT.bind(background);
  background._makePlanetRT = (size) => {
    warmTarget = makePlanetRT(size);
    warmTarget.addEventListener('dispose', () => { targetDisposeCount += 1; });
    return warmTarget;
  };
  background._bakeLayer = (candidate, target) => {
    bakeCount += 1;
    assert.strictEqual(candidate, material);
    assert.strictEqual(target, warmTarget);
    assert.equal(target.width, 1);
    assert.equal(target.height, 1);
    assert.equal(target.texture.colorSpace, THREE.SRGBColorSpace);
  };

  assert.equal(background._warmPlanetBakePipeline(), true);
  assert.equal(bakeCount, 1, 'loading performs one real-path admission bake');
  assert.equal(targetDisposeCount, 1, 'only the discarded 1px warm target is retired');
  assert.strictEqual(background._planetBakeMaterial, material,
    'the linked program owner survives loading for ordinary-flight admissions');
  assert.deepEqual(background.contextLossResources(), [material, background.bakePlane.geometry],
    'off-scene compiled bake resources participate in stale-listener detachment before restore');
});
