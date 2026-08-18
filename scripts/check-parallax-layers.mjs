#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as THREE from 'three';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MODULE_PATH = fileURLToPath(new URL('../src/render/parallaxLayers.js', import.meta.url));

execFileSync(process.execPath, ['--check', MODULE_PATH], { cwd: ROOT, stdio: 'pipe' });

const parallaxLayers = await import(pathToFileURL(MODULE_PATH).href);
assert.equal(typeof parallaxLayers.init, 'function', 'parallaxLayers.init export missing');
assert.equal(typeof parallaxLayers.update, 'function', 'parallaxLayers.update export missing');
assert.equal(typeof parallaxLayers.dispose, 'function', 'parallaxLayers.dispose export missing');

checkStack({ particleQuality: 'medium', motionReduce: false }, { far: 80, mid: 1400, near: 96 });
checkStack({ particleQuality: 'low', motionReduce: false }, { far: 40, mid: 700, near: 48 });
checkStack({ particleQuality: 'low', motionReduce: true }, { far: 40, mid: 700, near: 24 });

console.log('Parallax layers OK: opaque instanced chips, quality counts, GPU spin, no point sprites');

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
  assert.ok(near, 'near debris group missing');

  assert.equal(far.userData.activeCount, expected.far, `${video.particleQuality}: far count`);
  assert.equal(mid.userData.activeCount, expected.mid, `${video.particleQuality}: mid count`);
  assert.equal(near.userData.activeCount, expected.near, `${video.particleQuality}: near count`);

  for (const [label, group] of [['far', far], ['mid', mid], ['near', near]]) {
    const mesh = group.children[0];
    assert.equal(mesh.isInstancedMesh, true, `${video.particleQuality}: ${label} must be instanced meshes`);
    assert.equal(!!mesh.isPoints, false, `${video.particleQuality}: ${label} must not be point sprites`);
    assert.equal(mesh.material.transparent, false, `${video.particleQuality}: ${label} must be opaque matter`);
    assert.equal(mesh.material.depthWrite, true, `${video.particleQuality}: ${label} must occlude`);
    assert.notEqual(mesh.material.blending, THREE.AdditiveBlending,
      `${video.particleQuality}: ${label} must not be an additive glow card`);
  }

  assert.equal(mid.children[0].count, expected.mid, `${video.particleQuality}: mid mesh count`);
  assert.equal(mid.children[0].instanceMatrix.usage, THREE.StaticDrawUsage,
    `${video.particleQuality}: mid matrices should be static`);
  assert.equal(mid.children[0].instanceMatrix.array.byteLength, 89_600,
    `${video.particleQuality}: authored mid allocation should remain 1,400 matrices`);
  const spinAxis = mid.children[0].geometry.getAttribute('aParallaxSpinAxis');
  const spinParams = mid.children[0].geometry.getAttribute('aParallaxSpinParams');
  assert.equal(spinAxis?.count, 1400, `${video.particleQuality}: spin axes should cover authored capacity`);
  assert.equal(spinParams?.count, 1400, `${video.particleQuality}: spin parameters should cover authored capacity`);

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
