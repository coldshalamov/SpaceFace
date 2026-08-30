import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

installCanvasStub();
const parallaxLayers = await import('../src/render/parallaxLayers.js');

test('expanded wrap distributes authored debris across the whole effective tile', () => {
  const authoredTile = 560;
  const effectiveTile = 672;
  const centers = [-280, -140, 0, 140, 280].map((base) => (
    parallaxLayers.parallaxDistributionCoordinate(base, authoredTile, effectiveTile)
  ));

  assert.deepEqual(centers, [-336, -168, 0, 168, 336],
    'zoom-out must scale the authored distribution with the expanded wrap cell');

  const scene = new THREE.Scene();
  const state = {
    settings: { video: { particleQuality: 'medium', motionReduce: false } },
    render: { sectorPalette: { dust: 0x425987, nebulaTint: 0x334466 } },
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    camera: { focus: { x: 0, y: 0, z: 0 }, zoom: 144, fov: 50, tilt: 60, obj: { aspect: 16 / 9 } },
  };
  const stack = parallaxLayers.init(scene, state, null, state.render.sectorPalette);
  try {
    const mid = stack.groups.find((group) => group.userData.layer === 'midDebris');
    const mesh = mid.children[0];
    const wrap = mesh.material.userData.spacefaceParallaxInstanceWrap;
    assert.equal(wrap.uniforms.authoredTile.value, authoredTile,
      'the shader must retain the authored distribution tile');

    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}',
      fragmentShader: 'void main() {}',
    };
    mesh.material.onBeforeCompile(shader, {});
    assert.equal(shader.uniforms.uParallaxAuthoredTile, wrap.uniforms.authoredTile,
      'the expanded-cell scale must be bound to the live shader');
    assert.match(shader.vertexShader,
      /sfParallaxDistributionCenter = sfParallaxBaseCenter[\s\S]*uParallaxTile \/ max\(0\.0001, uParallaxAuthoredTile\)/,
      'the live shader must scale authored centers before wrapping');
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
