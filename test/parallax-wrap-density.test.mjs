import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { CAMERA_ZOOM_MAX } from '../src/render/camera.js';

installCanvasStub();
const parallaxLayers = await import('../src/render/parallaxLayers.js');

test('authored chip centers stay in the frozen wrap cell', () => {
  const { tile } = parallaxLayers.PARALLAX_BANDS.mid;
  const centers = [-tile * 0.5, -tile * 0.25, 0, tile * 0.25, tile * 0.5].map((base) => (
    parallaxLayers.parallaxDistributionCoordinate(base, tile, tile * 2)
  ));
  assert.deepEqual(centers, [-tile * 0.5, -tile * 0.25, 0, tile * 0.25, tile * 0.5],
    'a later zoom must not rescale chip centers into a new layout');
});

test('the wrap cell covers max chase zoom and never steps when the camera pulls back', () => {
  assert.ok(parallaxLayers.PARALLAX_WRAP_ZOOM_CAP >= CAMERA_ZOOM_MAX,
    `parallax wrap cap ${parallaxLayers.PARALLAX_WRAP_ZOOM_CAP} must cover CAMERA_ZOOM_MAX ${CAMERA_ZOOM_MAX}`);

  for (const [name, band] of Object.entries(parallaxLayers.PARALLAX_BANDS)) {
    const need = parallaxLayers.requiredParallaxWrapTile({
      y: band.y,
      zoom: CAMERA_ZOOM_MAX,
    });
    assert.ok(band.tile + 1e-9 >= need,
      `${name} tile ${band.tile} must cover the ${CAMERA_ZOOM_MAX} WU chase footprint (${need})`);
  }

  const scene = new THREE.Scene();
  const state = {
    settings: { video: { particleQuality: 'medium', motionReduce: false } },
    render: { sectorPalette: { dust: 0x425987, nebulaTint: 0x334466 } },
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    camera: {
      focus: { x: 0, y: 0, z: 0 },
      zoom: 144,
      liveZoom: 144,
      fov: 50,
      tilt: 60,
      obj: { aspect: 16 / 9 },
    },
  };
  const stack = parallaxLayers.init(scene, state, null, state.render.sectorPalette);
  try {
    const mid = stack.groups.find((group) => group.userData.layer === 'midDebris');
    const mesh = mid.children[0];
    const wrap = mesh.material.userData.spacefaceParallaxInstanceWrap;
    const frozen = wrap.uniforms.tile.value;
    assert.equal(frozen, parallaxLayers.PARALLAX_BANDS.mid.tile);
    assert.equal(wrap.tileFrozen, true);
    assert.equal(wrap.uniforms.authoredTile.value, frozen,
      'authored and live tiles stay the same cell; nothing is scaled later');

    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}',
      fragmentShader: 'void main() {}',
    };
    mesh.material.onBeforeCompile(shader, {});
    assert.match(mesh.material.customProgramCacheKey(), /spaceface-parallax-instance-wrap-v2/);
    assert.doesNotMatch(shader.vertexShader, /uParallaxAuthoredTile/,
      'the shader must not rescale centers when a uniform tile changes');
    assert.match(shader.vertexShader, /sfParallaxBaseCenter - uParallaxWorldFocus \* uParallaxFactor/);

    parallaxLayers.update(1 / 60);
    const sample = 80;
    const before = parallaxLayers.wrapParallaxCoordinate(
      sample,
      wrap.uniforms.worldFocus.value.x,
      wrap.uniforms.factor.value,
      frozen,
    );

    for (const zoom of [88, 144, 194, 220, CAMERA_ZOOM_MAX]) {
      state.camera.zoom = zoom;
      state.camera.liveZoom = zoom;
      parallaxLayers.update(1 / 60);
      assert.equal(wrap.uniforms.tile.value, frozen,
        `liveZoom ${zoom} must not retile the field`);
      const after = parallaxLayers.wrapParallaxCoordinate(
        sample,
        wrap.uniforms.worldFocus.value.x,
        wrap.uniforms.factor.value,
        wrap.uniforms.tile.value,
      );
      assert.equal(after, before,
        `the same world focus must wrap chip ${sample} to the same place at zoom ${zoom}`);
    }
  } finally {
    parallaxLayers.dispose();
  }
});

function installCanvasStub() {
  const gradient = { addColorStop() {} };
  const context = {
    fillStyle: null,
    globalCompositeOperation: 'source-over',
    clearRect() {},
    createRadialGradient() { return gradient; },
    beginPath() {},
    arc() {},
    fill() {},
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext(type) {
          assert.equal(type, '2d');
          return context;
        },
      };
    },
  };
}
