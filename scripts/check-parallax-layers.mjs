#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as THREE from 'three';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MODULE_PATH = fileURLToPath(new URL('../src/render/parallaxLayers.js', import.meta.url));

execFileSync(process.execPath, ['--check', MODULE_PATH], { cwd: ROOT, stdio: 'pipe' });
installCanvasStub();

const parallaxLayers = await import(pathToFileURL(MODULE_PATH).href);
assert.equal(typeof parallaxLayers.init, 'function', 'parallaxLayers.init export missing');
assert.equal(typeof parallaxLayers.update, 'function', 'parallaxLayers.update export missing');
assert.equal(typeof parallaxLayers.dispose, 'function', 'parallaxLayers.dispose export missing');

checkStack({ particleQuality: 'medium', motionReduce: false }, { far: 2, mid: 1400, near: 700 });
checkStack({ particleQuality: 'low', motionReduce: false }, { far: 1, mid: 700, near: 350 });
checkStack({ particleQuality: 'low', motionReduce: true }, { far: 1, mid: 700, near: 175 });

console.log('Parallax layers OK: exports, 3 groups, quality counts, static GPU debris spin, reduced-motion mote cap');

function checkStack(video, expected) {
  const scene = new THREE.Scene();
  const state = makeState(video);
  const stack = parallaxLayers.init(scene, state, null, state.render.sectorPalette);

  assert.equal(stack.groups.length, 3, `${video.particleQuality}: expected 3 parallax groups`);
  assert.equal(scene.children.length, 3, `${video.particleQuality}: expected 3 scene children`);

  const far = stack.groups.find((group) => group.userData.layer === 'farDust');
  const mid = stack.groups.find((group) => group.userData.layer === 'midDebris');
  const near = stack.groups.find((group) => group.userData.layer === 'nearSpeedMotes');
  assert.ok(far, 'far dust group missing');
  assert.ok(mid, 'mid debris group missing');
  assert.ok(near, 'near speed-motes group missing');

  assert.equal(far.userData.activeCount, expected.far, `${video.particleQuality}: far count`);
  assert.equal(far.children.filter((child) => child.visible).length, expected.far, `${video.particleQuality}: far visible planes`);
  assert.equal(mid.userData.activeCount, expected.mid, `${video.particleQuality}: mid count`);
  assert.equal(mid.children[0].isInstancedMesh, true, `${video.particleQuality}: mid layer should be instanced`);
  assert.equal(mid.children[0].count, expected.mid, `${video.particleQuality}: mid mesh count`);
  assert.equal(mid.children[0].instanceMatrix.usage, THREE.StaticDrawUsage,
    `${video.particleQuality}: mid matrices should be static`);
  assert.equal(mid.children[0].instanceMatrix.array.byteLength, 89_600,
    `${video.particleQuality}: authored mid allocation should remain 1,400 matrices`);
  const spinAxis = mid.children[0].geometry.getAttribute('aParallaxSpinAxis');
  const spinParams = mid.children[0].geometry.getAttribute('aParallaxSpinParams');
  assert.equal(spinAxis?.count, 1400, `${video.particleQuality}: spin axes should cover authored capacity`);
  assert.equal(spinParams?.count, 1400, `${video.particleQuality}: spin parameters should cover authored capacity`);
  assert.equal(near.userData.activeCount, expected.near, `${video.particleQuality}: near count`);
  assert.equal(near.children[0].isPoints, true, `${video.particleQuality}: near layer should be points`);
  assert.equal(near.children[0].geometry.drawRange.count, expected.near, `${video.particleQuality}: near draw range`);

  const matrixVersion = mid.children[0].instanceMatrix.version;
  const matrixBytes = mid.children[0].instanceMatrix.array.slice();
  const spinUniforms = mid.children[0].material.userData.spacefaceParallaxMidDebrisGpuSpin?.uniforms;
  assert.ok(spinUniforms, `${video.particleQuality}: GPU spin uniforms missing`);
  parallaxLayers.update(1 / 60);
  assert.equal(mid.children[0].instanceMatrix.version, matrixVersion,
    `${video.particleQuality}: steady animation must not request a matrix upload`);
  assert.deepEqual(mid.children[0].instanceMatrix.array, matrixBytes,
    `${video.particleQuality}: steady animation must not rewrite matrix bytes`);
  assert.equal(spinUniforms.primaryTime.value, 1 / 60,
    `${video.particleQuality}: visible primary debris clock should advance`);
  assert.equal(spinUniforms.tailTime.value, expected.mid === 1400 ? 1 / 60 : 0,
    `${video.particleQuality}: hidden upper-half debris clock should pause`);
  if (video.motionReduce) {
    assert.equal(near.children[0].material.uniforms.uStretch.value, 1, 'reduced motion disables boost stretch');
  } else {
    assert.ok(near.children[0].material.uniforms.uStretch.value > 1, 'boost/high speed should stretch motes');
  }

  parallaxLayers.dispose();
  assert.equal(scene.children.length, 0, `${video.particleQuality}: dispose should remove groups`);
}

function makeState(video) {
  const player = {
    id: 1,
    pos: { x: 12, z: -18 },
    vel: { x: 260, z: 30 },
    flags: { boosting: true },
  };
  return {
    settings: { video },
    render: { sectorPalette: { dust: 0x425987, nebulaTint: 0x334466 } },
    camera: { focus: { x: 320, y: 0, z: -180 } },
    playerId: 1,
    entities: new Map([[1, player]]),
  };
}

function installCanvasStub() {
  const gradient = { addColorStop() {} };
  const ctx = {
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
      assert.equal(tag, 'canvas', 'parallax texture helper should only create canvas elements');
      return {
        width: 0,
        height: 0,
        getContext(type) {
          assert.equal(type, '2d', 'parallax texture helper should request a 2d canvas');
          return ctx;
        },
      };
    },
  };
}
