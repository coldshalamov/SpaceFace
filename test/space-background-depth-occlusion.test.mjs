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
