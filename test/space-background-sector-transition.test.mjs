import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SECTORS } from '../src/data/sectors.js';
import { resolveSectorVisualProfile } from '../src/data/sectorVisualProfiles.js';
import { SpaceBackground } from '../src/render/spaceBackground.js';

const sector = (id) => SECTORS.find((entry) => entry.id === id);

class ProbeBackground extends SpaceBackground {
  _measureGeometry() {
    this.H = 96;
    this.bgY = -211.2;
    this.heroDist = 400;
    this.heroSizeK = 4;
    this.quadSize = 800;
    this.starCell = 1800;
    this.windowBiasZ = 0;
    this.perspScale = 973;
    this.starPxToWorld = 0.4;
  }

  _bakeFlareAtlas() { return null; }
  _warmPlanetBakePipeline() { return true; }
  bakeAll(paletteName = this.currentPaletteName) {
    this.bakeCalls = (this.bakeCalls || 0) + 1;
    this.currentPaletteName = paletteName;
  }
  _createStars() { this.starBuildCalls = (this.starBuildCalls || 0) + 1; }
  _createFlares() { this.flareBuildCalls = (this.flareBuildCalls || 0) + 1; }
  _createComet() { this.cometBuildCalls = (this.cometBuildCalls || 0) + 1; }
  _spawnStructureCard() { this.structureBuildCalls = (this.structureBuildCalls || 0) + 1; }
  _refreshHeroes() { this.heroRefreshCalls = (this.heroRefreshCalls || 0) + 1; }
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 5000);
camera.position.set(0, 120, 90);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);
const state = {
  meta: { seed: 47 },
  render: { gpu: { tier: 'low', software: true } },
  settings: { video: { particleQuality: 'low' } },
  camera: { focus: { x: 0, z: 0 }, zoom: 88 },
};
const bg = new ProbeBackground(scene, state, { camera });
bg.onSectorEnter(sector('sector_helios_prime'), resolveSectorVisualProfile(sector('sector_helios_prime')));

const before = {
  bakeCalls: bg.bakeCalls,
  starBuildCalls: bg.starBuildCalls,
  flareBuildCalls: bg.flareBuildCalls,
  structureBuildCalls: bg.structureBuildCalls,
  heroRefreshCalls: bg.heroRefreshCalls,
  intensity: bg.bgIntensity,
};

const targetSector = sector('sector_ceres_belt');
bg.onSectorEnter(targetSector, resolveSectorVisualProfile(targetSector));

assert.equal(bg.bakeCalls, before.bakeCalls, 'a live sector seam must not synchronously rebake GPU tiles');
assert.equal(bg.starBuildCalls, before.starBuildCalls, 'a live sector seam must retain the continuous starfield');
assert.equal(bg.flareBuildCalls, before.flareBuildCalls, 'a live sector seam must retain the continuous flare field');
assert.equal(bg.structureBuildCalls, before.structureBuildCalls, 'a live sector seam must not replace distant structure');
assert.equal(bg.heroRefreshCalls, before.heroRefreshCalls, 'a live sector seam must not rebuild hero objects');
assert.equal(bg.bgIntensity, before.intensity, 'the first transition frame must preserve the outgoing intensity');
assert.equal(bg._sectorTransition.active, true);

for (let frame = 0; frame < 7; frame++) bg.update(0.1, 0.1 + frame * 0.1, { x: 0, z: 0 });
assert.ok(bg.bgIntensity < before.intensity, 'background intensity should move continuously toward the next sector');
assert.ok(bg.bgIntensity > 0.55, 'the midpoint should not click all the way to the target');

for (let frame = 0; frame < 8; frame++) bg.update(0.1, 0.8 + frame * 0.1, { x: 0, z: 0 });
assert.equal(bg._sectorTransition.active, false);
assert.equal(bg.bgIntensity, 0.55, 'the eased transition should land on the authored target');

console.log('space background sector transition: OK');
