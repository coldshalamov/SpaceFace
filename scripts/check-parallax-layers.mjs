#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as THREE from 'three';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MODULE_PATH = fileURLToPath(new URL('../src/render/parallaxLayers.js', import.meta.url));
const BACKGROUND_FRAME_TEST = fileURLToPath(new URL('../test/space-background-frame-coordinates.test.mjs', import.meta.url));

execFileSync(process.execPath, ['--check', MODULE_PATH], { cwd: ROOT, stdio: 'pipe' });
execFileSync(process.execPath, ['--test', BACKGROUND_FRAME_TEST], { cwd: ROOT, stdio: 'inherit' });

const parallaxLayers = await import(pathToFileURL(MODULE_PATH).href);
assert.equal(typeof parallaxLayers.init, 'function', 'parallaxLayers.init export missing');
assert.equal(typeof parallaxLayers.update, 'function', 'parallaxLayers.update export missing');
assert.equal(typeof parallaxLayers.dispose, 'function', 'parallaxLayers.dispose export missing');
assert.equal(typeof parallaxLayers.wrapParallaxCoordinate, 'function', 'wrap helper export missing');

checkStack({ particleQuality: 'medium', motionReduce: false }, { far: 80, mid: 1400, near: 96 });
checkStack({ particleQuality: 'low', motionReduce: false }, { far: 40, mid: 700, near: 48 });
checkStack({ particleQuality: 'low', motionReduce: true }, { far: 40, mid: 700, near: 24 });
checkWrapCellGrowsWithZoomOut();

console.log('Parallax layers OK: global-focus per-instance wrap, rebase continuity, static matrices, GPU spin');

/**
 * The zoom-out band bug: the wrap cell used to stay at its authored size, so at high zoom-out the
 * cell edge was an on-screen arc — chips popped across it and empty sky showed outside it. The
 * effective tile must grow (in discrete steps, capped) once the visible frustum footprint at the
 * band plane exceeds the authored cell, and must stay at the authored value at ordinary zoom.
 */
function checkWrapCellGrowsWithZoomOut() {
  const scene = new THREE.Scene();
  const video = { particleQuality: 'medium', motionReduce: false };
  const state = makeState(video);
  state.camera.zoom = 330;
  state.camera.fov = 50;
  state.camera.tilt = 60;
  state.camera.obj = { aspect: 16 / 9 };
  const stack = parallaxLayers.init(scene, state, null, state.render.sectorPalette);
  const mid = stack.groups.find((group) => group.userData.layer === 'midDebris');
  const near = stack.groups.find((group) => group.userData.layer === 'nearSpeedMotes');
  const far = stack.groups.find((group) => group.userData.layer === 'farDust');
  const midTile = () => mid.children[0].material.userData.spacefaceParallaxInstanceWrap.uniforms.tile.value;

  assert.equal(midTile(), mid.userData.tileSize, 'tile starts at the authored value');
  parallaxLayers.update(1 / 60);
  const grown = midTile();
  assert.ok(grown > mid.userData.tileSize,
    `max zoom-out must widen the wrap cell past the authored ${mid.userData.tileSize}; received ${grown}`);
  assert.ok(grown <= mid.userData.tileSize * 4, 'the wrap cell must stay inside its 4x cap');
  const ratio = grown / mid.userData.tileSize;
  const step = Math.round(Math.log(ratio) / Math.log(1.2));
  assert.ok(Math.abs(ratio - Math.pow(1.2, step)) < 1e-9,
    `the effective tile must be a discrete 1.2-step multiple; received ratio ${ratio}`);

  const nearTile = near.children[0].material.userData.spacefaceParallaxInstanceWrap.uniforms.tile.value;
  assert.ok(nearTile > near.userData.tileSize, 'the near band cell must grow too');
  const farTile = far.children[0].material.userData.spacefaceParallaxInstanceWrap.uniforms.tile.value;
  assert.equal(farTile, far.userData.tileSize,
    'the far band cell already covers the visible footprint at max zoom and must stay authored');

  // Zooming back in must restore the authored cell exactly.
  state.camera.zoom = 144;
  parallaxLayers.update(1 / 60);
  assert.equal(midTile(), mid.userData.tileSize, 'returning to ordinary zoom restores the authored tile');

  parallaxLayers.dispose();
}

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

    const wrap = mesh.material.userData.spacefaceParallaxInstanceWrap;
    assert.ok(wrap, `${video.particleQuality}: ${label} global-focus wrap contract missing`);
    assert.equal(wrap.mode, 'per-instance-global-focus');
    assert.equal(wrap.uniforms.factor.value, group.userData.factor);
    assert.equal(wrap.uniforms.tile.value, group.userData.tileSize);
    assert.match(mesh.material.customProgramCacheKey(), /spaceface-parallax-instance-wrap-v1/);

    const shader = shaderFixture();
    mesh.material.onBeforeCompile(shader, {});
    assert.equal(shader.uniforms.uParallaxWorldFocus, wrap.uniforms.worldFocus);
    assert.equal(shader.uniforms.uParallaxFactor, wrap.uniforms.factor);
    assert.equal(shader.uniforms.uParallaxTile, wrap.uniforms.tile);
    assert.match(shader.vertexShader, /sfParallaxWrappedCenter/);
    assert.match(shader.vertexShader, /uParallaxWorldFocus \* uParallaxFactor/);
    assert.match(shader.vertexShader, /sfParallaxEdge/);
    assert.match(shader.vertexShader, /smoothstep\(0\.78, 0\.97, sfParallaxEdge\)/,
      'chips must dissolve before the wrap-cell edge so the boundary can never pop on-screen');
    assert.match(shader.vertexShader, /mvPosition\.xyz \+=/);
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
  const wrapUniforms = mid.children[0].material.userData.spacefaceParallaxInstanceWrap.uniforms;
  assert.ok(spinUniforms, `${video.particleQuality}: GPU spin uniforms missing`);

  // First frame sits immediately below a floating-origin threshold.
  parallaxLayers.update(1 / 60);
  assert.equal(mid.position.x, 8191, 'draw group follows frame-local camera X');
  assert.equal(mid.position.z, -3200, 'draw group follows frame-local camera Z');
  assert.equal(wrapUniforms.worldFocus.value.x, 8191, 'wrap samples global focus before rebase');
  assert.equal(wrapUniforms.worldFocus.value.y, -3200, 'wrap samples global focus before rebase');
  const beforeWrapped = parallaxLayers.wrapParallaxCoordinate(
    0,
    wrapUniforms.worldFocus.value.x,
    wrapUniforms.factor.value,
    wrapUniforms.tile.value,
  );

  // Cross the origin boundary while moving only two galactic world units.
  state.world.frameOrigin.x = 8192;
  state.world.frameOrigin.z = -4096;
  state.world.frameOriginSeq = 1;
  state.camera.focus.x = 1;
  state.camera.focus.z = 896;
  parallaxLayers.update(1 / 60);

  assert.equal(mid.position.x, 1, 'draw group follows rebased local camera X');
  assert.equal(mid.position.z, 896, 'draw group follows rebased local camera Z');
  assert.equal(wrapUniforms.worldFocus.value.x, 8193, 'global wrap focus advances by physical travel only');
  assert.equal(wrapUniforms.worldFocus.value.y, -3200, 'global wrap focus ignores local rebase jump');
  const afterWrapped = parallaxLayers.wrapParallaxCoordinate(
    0,
    wrapUniforms.worldFocus.value.x,
    wrapUniforms.factor.value,
    wrapUniforms.tile.value,
  );
  const wrappedStep = circularDelta(afterWrapped, beforeWrapped, wrapUniforms.tile.value);
  assert.ok(Math.abs(wrappedStep + wrapUniforms.factor.value * 2) < 1e-7,
    `per-instance wrap should move only by physical parallax; received ${wrappedStep}`);

  assert.equal(mid.children[0].instanceMatrix.version, matrixVersion,
    `${video.particleQuality}: steady animation must not request a matrix upload`);
  assert.deepEqual(mid.children[0].instanceMatrix.array, matrixBytes,
    `${video.particleQuality}: steady animation must not rewrite matrix bytes`);
  assert.equal(spinUniforms.primaryTime.value, 2 / 60,
    `${video.particleQuality}: visible primary debris clock should advance`);
  assert.equal(spinUniforms.tailTime.value, expected.mid === 1400 ? 2 / 60 : 0,
    `${video.particleQuality}: hidden upper-half debris clock should pause`);

  assert.throws(
    () => mid.children[0].material.onBeforeCompile({ uniforms: {}, vertexShader: 'void main() {}' }, {}),
    /parallax band shader contract changed: missing common declarations/,
  );

  parallaxLayers.dispose();
  assert.equal(scene.children.length, 0, `${video.particleQuality}: dispose should remove groups`);
}

function shaderFixture() {
  return {
    uniforms: {},
    vertexShader: [
      '#include <common>',
      'void main() {',
      '#include <begin_vertex>',
      '#include <project_vertex>',
      '}',
    ].join('\n'),
    fragmentShader: 'void main() {}',
  };
}

function circularDelta(next, previous, period) {
  const half = period * 0.5;
  return ((next - previous + half) % period + period) % period - half;
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
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    camera: { focus: { x: 8191, y: 0, z: -3200 } },
    playerId: 1,
    entities: new Map([[1, player]]),
  };
}
