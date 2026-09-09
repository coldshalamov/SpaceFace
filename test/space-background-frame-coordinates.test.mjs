import assert from 'node:assert/strict';
import test from 'node:test';

import { SpaceBackground, layerUvOffset } from '../src/render/spaceBackground.js';
import {
  installSpaceBackgroundFrameCoordinateBridge,
  resolveSpaceBackgroundGlobalCamera,
} from '../src/render/spaceBackgroundFrameCoordinates.js';

installSpaceBackgroundFrameCoordinateBridge();

test('background procedural coordinates remain global while the render root remains frame-local', () => {
  const background = frameHarness();
  const layer = background.layers[0];
  const starUniforms = background.stars.mat.uniforms;
  const rootUniform = background.layerMaterial.uniforms.uGroupOrigin.value;

  background.update(1 / 60, 1 / 60, { x: 8191, y: 120, z: -3200 });
  assert.equal(background.camX, 8191);
  assert.equal(background.camZ, -3200);
  assert.equal(background.group.position.x, 8191);
  assert.equal(background.group.position.z, -3200);
  assert.equal(starUniforms.uCamPos.value.x, 8191);
  assert.equal(starUniforms.uCamPos.value.y, -3200);

  // The next physical frame advances two world units but crosses the floating-origin threshold.
  // Local camera X/Z therefore jump by thousands while galactic-global X/Z stay continuous.
  background.state.world.frameOrigin.x = 8192;
  background.state.world.frameOrigin.z = -4096;
  background.state.world.frameOriginSeq = 1;
  background.update(1 / 60, 2 / 60, { x: 1, y: 120, z: 896 });

  assert.equal(background.camX, 8193, 'procedural sky samples galactic-global X after rebase');
  assert.equal(background.camZ, -3200, 'procedural sky samples galactic-global Z after rebase');
  assert.equal(background.localCamX, 1);
  assert.equal(background.localCamZ, 896);
  assert.equal(background.group.position.x, 1, 'Three.js root remains in the current local frame');
  assert.equal(background.group.position.z, 896, 'Three.js root remains in the current local frame');
  assert.equal(rootUniform.x, 1, 'composite ray origin is restored to local render coordinates');
  assert.equal(rootUniform.z, 896, 'composite ray origin is restored to local render coordinates');
  assert.equal(starUniforms.uCamPos.value.x, 8193, 'star membership does not reset at the rebase');
  assert.equal(starUniforms.uCamPos.value.y, -3200, 'star membership does not reset at the rebase');
  assert.deepEqual(background.lastRegionPosition, { x: 8193, z: -3200 });

  const expected = layerUvOffset(8193, -3200, layer.par, layer.tile);
  assert.equal(layer.offset.x, expected.u, 'deep-field U remains the same global closed form');
  assert.equal(layer.offset.y, expected.v, 'deep-field V remains the same global closed form');
});

test('global camera projection reuses caller storage and adds only frame origin', () => {
  const out = { x: -1, y: -1, z: -1 };
  const state = { world: { frameOrigin: { x: 4096, z: -8192 } } };
  assert.strictEqual(resolveSpaceBackgroundGlobalCamera(
    state,
    { x: 12.5, y: 88, z: -3.25 },
    out,
  ), out);
  assert.deepEqual(out, { x: 4108.5, y: 88, z: -8195.25 });
});

function frameHarness() {
  const position = {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
  const rootUniform = {
    x: 0,
    y: 0,
    z: 0,
    copy(source) {
      this.x = source.x;
      this.y = source.y;
      this.z = source.z;
    },
  };
  const vector2 = () => ({
    x: 0,
    y: 0,
    set(x, y) {
      this.x = x;
      this.y = y;
    },
  });
  const layerOffset = vector2();
  const background = Object.create(SpaceBackground.prototype);
  Object.assign(background, {
    state: {
      world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
      render: {
        velocityLanguage: {
          schema: 'velocity_language_v1',
          drive: { parallaxGain: 0, smear: 0 },
          region: null,
        },
      },
    },
    bgTime: 0,
    camX: 0,
    camZ: 0,
    bgY: -220,
    bgIntensity: 0.7,
    nebulaOpacity: 0,
    group: { position },
    _sectorTransition: { active: false },
    _streamPrimed: false,
    _streamCamX: 0,
    _streamCamZ: 0,
    _flowX: 0,
    _flowZ: 1,
    _smearFit: { stretch: 1, dim: 1 },
    layers: [{
      par: 0.1,
      tile: 1000,
      streamU: 0,
      streamV: 0,
      offset: layerOffset,
    }],
    layerMaterial: {
      uniforms: {
        uGroupOrigin: { value: rootUniform },
        uNebulaOpacity: { value: 0 },
      },
    },
    stars: {
      mat: {
        uniforms: {
          uCamPos: { value: vector2() },
          uTime: { value: 0 },
          uIntensity: { value: 0 },
          uPerspScale: { value: 0 },
          uFlowWorld: { value: vector2() },
          uSmearStretch: { value: 1 },
        },
      },
    },
    flares: null,
    planets: [],
    wormhole: null,
    structureMacro: null,
    structureCard: null,
    _computePerspScale: () => 500,
    _updateSectorVisualTransition() {},
    _updateRegionTint(x, z) { this.lastRegionPosition = { x, z }; },
    _updateComet() {},
    _refreshHeroes() {},
  });
  return background;
}
