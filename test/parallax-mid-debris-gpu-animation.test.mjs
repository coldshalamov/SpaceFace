import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

installCanvasStub();
const parallaxLayers = await import('../src/render/parallaxLayers.js');

test('mid debris keeps all authored instances and moves only its two scalar clocks per frame', () => {
  const scene = new THREE.Scene();
  const state = makeState({ particleQuality: 'medium', motionReduce: false });
  const stack = parallaxLayers.init(scene, state, null, state.render.sectorPalette);

  try {
    const mesh = findMidMesh(stack);
    const spinAxis = mesh.geometry.getAttribute('aParallaxSpinAxis');
    const spinParams = mesh.geometry.getAttribute('aParallaxSpinParams');
    const gpuSpin = mesh.material.userData.spacefaceParallaxMidDebrisGpuSpin;

    assert.equal(mesh.count, 1400, 'default quality retains all 1,400 authored instances');
    assert.equal(mesh.instanceMatrix.count, 1400, 'allocation retains the 1,400-instance capacity');
    assert.equal(mesh.instanceMatrix.array.byteLength, 89_600, 'matrix allocation remains 89,600 bytes');
    assert.equal(mesh.instanceMatrix.usage, THREE.StaticDrawUsage, 'instance matrices are immutable after admission');
    assert.equal(spinAxis.count, 1400, 'every instance retains its authored spin axis');
    assert.equal(spinParams.count, 1400, 'every instance retains phase, speed, and quality-clock selection');
    assert.equal(spinAxis.usage, THREE.StaticDrawUsage);
    assert.equal(spinParams.usage, THREE.StaticDrawUsage);
    assert.ok(gpuSpin, 'material exposes the stable GPU animation contract');

    const matrixVersion = mesh.instanceMatrix.version;
    const matrixBytes = mesh.instanceMatrix.array.slice();
    const programKey = mesh.material.customProgramCacheKey();
    parallaxLayers.update(1 / 60);

    assert.equal(mesh.instanceMatrix.version, matrixVersion, 'ordinary flight requests no matrix upload');
    assert.deepEqual(mesh.instanceMatrix.array, matrixBytes, 'ordinary flight rewrites no matrix components');
    assert.equal(gpuSpin.uniforms.primaryTime.value, 1 / 60);
    assert.equal(gpuSpin.uniforms.tailTime.value, 1 / 60);
    assert.equal(mesh.material.customProgramCacheKey(), programKey, 'animation uses one stable shader program key');
    assert.match(programKey, /spaceface-parallax-mid-debris-gpu-spin-v1/);

    state.settings.video.particleQuality = 'low';
    parallaxLayers.update(1 / 60);
    assert.equal(mesh.count, 700, 'low quality retains the established half-density contract');
    assert.equal(gpuSpin.uniforms.primaryTime.value, 2 / 60);
    assert.equal(gpuSpin.uniforms.tailTime.value, 1 / 60,
      'hidden upper-half debris pauses exactly as the prior active-prefix CPU loop did');

    state.settings.video.particleQuality = 'medium';
    parallaxLayers.update(1 / 60);
    assert.equal(mesh.count, 1400);
    assert.equal(gpuSpin.uniforms.primaryTime.value, 3 / 60);
    assert.equal(gpuSpin.uniforms.tailTime.value, 2 / 60,
      'restored upper-half debris resumes without accumulating hidden time');
    assert.equal(mesh.instanceMatrix.version, matrixVersion, 'quality toggles do not rewrite the static matrix allocation');
    assert.deepEqual(mesh.instanceMatrix.array, matrixBytes, 'quality toggles preserve all static authored transforms');
  } finally {
    parallaxLayers.dispose();
  }
});

test('GPU axis-angle transform matches the prior CPU quaternion composition', () => {
  const scene = new THREE.Scene();
  const state = makeState({ particleQuality: 'medium', motionReduce: false });
  const stack = parallaxLayers.init(scene, state, null, state.render.sectorPalette);

  try {
    const mesh = findMidMesh(stack);
    const spinAxis = mesh.geometry.getAttribute('aParallaxSpinAxis');
    const spinParams = mesh.geometry.getAttribute('aParallaxSpinParams');
    const localVertex = new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'), 0);

    parallaxLayers.update(1 / 60);
    state.settings.video.particleQuality = 'low';
    parallaxLayers.update(1 / 60);
    state.settings.video.particleQuality = 'medium';
    parallaxLayers.update(1 / 60);

    for (const index of [0, 699, 700, 1399]) {
      const expectedRecord = expectedDebrisRecord(index);
      const axis = new THREE.Vector3().fromBufferAttribute(spinAxis, index);
      const phase = spinParams.getX(index);
      const speed = spinParams.getY(index);
      const tail = spinParams.getZ(index);
      const clock = tail === 0 ? 3 / 60 : 2 / 60;

      close(axis.x, expectedRecord.axis.x, 1e-7, `axis x ${index}`);
      close(axis.y, expectedRecord.axis.y, 1e-7, `axis y ${index}`);
      close(axis.z, expectedRecord.axis.z, 1e-7, `axis z ${index}`);
      close(phase, expectedRecord.phase, 1e-6, `phase ${index}`);
      close(speed, expectedRecord.speed, 1e-7, `speed ${index}`);
      assert.equal(tail, index < 700 ? 0 : 1, `clock selector ${index}`);

      const staticMatrix = new THREE.Matrix4();
      mesh.getMatrixAt(index, staticMatrix);
      const staticPosition = new THREE.Vector3();
      const staticRotation = new THREE.Quaternion();
      const staticScale = new THREE.Vector3();
      staticMatrix.decompose(staticPosition, staticRotation, staticScale);
      close(staticPosition.x, expectedRecord.x, 2e-5, `position x ${index}`);
      close(staticPosition.y, -40, 1e-7, `position y ${index}`);
      close(staticPosition.z, expectedRecord.z, 2e-5, `position z ${index}`);
      close(staticScale.x, expectedRecord.radius, 2e-6, `scale ${index}`);

      const angle = phase + speed * clock;
      const shaderPosition = rotateAxisAngle(localVertex, axis, angle).applyMatrix4(staticMatrix);
      const legacyMatrix = new THREE.Matrix4().compose(
        staticPosition,
        new THREE.Quaternion().setFromAxisAngle(axis, angle),
        staticScale,
      );
      const legacyPosition = localVertex.clone().applyMatrix4(legacyMatrix);
      close(shaderPosition.x, legacyPosition.x, 2e-5, `visual x ${index}`);
      close(shaderPosition.y, legacyPosition.y, 2e-5, `visual y ${index}`);
      close(shaderPosition.z, legacyPosition.z, 2e-5, `visual z ${index}`);
    }
  } finally {
    parallaxLayers.dispose();
  }
});

test('mid-debris shader binding is stable and fails closed if the Three vertex seam changes', () => {
  const scene = new THREE.Scene();
  const state = makeState({ particleQuality: 'medium', motionReduce: false });
  const stack = parallaxLayers.init(scene, state, null, state.render.sectorPalette);

  try {
    const material = findMidMesh(stack).material;
    const gpuSpin = material.userData.spacefaceParallaxMidDebrisGpuSpin;
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: 'void main() {}',
    };

    material.onBeforeCompile(shader, {});
    assert.equal(shader.uniforms.uParallaxPrimaryTime, gpuSpin.uniforms.primaryTime);
    assert.equal(shader.uniforms.uParallaxTailTime, gpuSpin.uniforms.tailTime);
    assert.match(shader.vertexShader, /attribute vec3 aParallaxSpinAxis;/);
    assert.match(shader.vertexShader, /attribute vec3 aParallaxSpinParams;/);
    assert.match(shader.vertexShader, /cross\(axis, point\)/);
    assert.match(shader.vertexShader, /transformed = sfRotateParallaxDebris/);

    assert.throws(
      () => material.onBeforeCompile({ uniforms: {}, vertexShader: 'void main() {}' }, {}),
      /parallax mid-debris shader contract changed: missing common declarations/,
    );
  } finally {
    parallaxLayers.dispose();
  }
});

function findMidMesh(stack) {
  const group = stack.groups.find((candidate) => candidate.userData.layer === 'midDebris');
  assert.ok(group, 'mid-debris group missing');
  assert.equal(group.children.length, 1, 'mid-debris group keeps one draw object');
  assert.equal(group.children[0].isInstancedMesh, true, 'mid-debris draw object remains instanced');
  return group.children[0];
}

function expectedDebrisRecord(targetIndex) {
  const rnd = makeRand(0x47a2e1);
  let record = null;
  for (let index = 0; index <= targetIndex; index++) {
    const x = (rnd() - 0.5) * 560;
    const z = (rnd() - 0.5) * 560;
    const r = rnd();
    const radius = 0.45 + r * r * r * 4.5;
    let ax = rnd() * 2 - 1;
    let ay = rnd() * 2 - 1;
    let az = rnd() * 2 - 1;
    const length = Math.hypot(ax, ay, az) || 1;
    ax /= length;
    ay /= length;
    az /= length;
    const speed = 0.035 + rnd() * 0.09;
    const phase = rnd() * Math.PI * 2;
    record = { x, z, radius, axis: { x: ax, y: ay, z: az }, speed, phase };
  }
  return record;
}

function rotateAxisAngle(point, axis, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const cross = new THREE.Vector3().crossVectors(axis, point);
  return point.clone().multiplyScalar(cosine)
    .addScaledVector(cross, sine)
    .addScaledVector(axis, axis.dot(point) * (1 - cosine));
}

function close(actual, expected, epsilon, label) {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${expected}, received ${actual}, epsilon ${epsilon}`);
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

function makeRand(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

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
