// An urgent residency batch must not draw while an ordinary batch's raw program is still linking
// on a KHR_parallel_shader_compile renderer (real GPUs). The serial route (software GL) may reuse
// the linked program and skip the compile round trip; the KHR route keeps its readiness wait.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { prepareStartupGeometryResidency } from '../src/render/startupGpuResidency.js';

test('urgent residency waits for an already-issued KHR program to finish linking', async () => {
  let ready = false;
  let earlyDraws = 0;
  let compiled;
  const compileStarted = new Promise((resolve) => { compiled = resolve; });
  const canvas = new EventTarget();
  const gl = { canvas, isContextLost: () => false };
  const props = new WeakMap();
  const program = { program: {}, isReady: () => ready };
  let target = null;
  const renderer = {
    domElement: canvas,
    getContext: () => gl,
    extensions: { get: () => ({}) },
    properties: { get(material) { let p = props.get(material); if (!p) { p = {}; props.set(material, p); } return p; } },
    info: { memory: { geometries: 0 }, programs: [program] },
    getRenderTarget: () => target,
    setRenderTarget(value) { target = value; },
    compileAsync: async () => {},
    compile(scene) {
      const materials = new Set();
      scene.traverse((object) => {
        if (!object.material) return;
        materials.add(object.material);
        Object.assign(this.properties.get(object.material), { programs: new Map([['raw', program]]), currentProgram: program });
      });
      compiled();
      return materials;
    },
    render(scene) { if (!ready) earlyDraws++; this.info.memory.geometries += scene.children.length; },
  };
  const subject = () => new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const ordinary = prepareStartupGeometryResidency(renderer, [subject()], { yieldToMain: async () => {} });
  await compileStarted;
  const urgent = prepareStartupGeometryResidency(renderer, [subject()], { urgent: true, yieldToMain: async () => {} });
  await new Promise((resolve) => setTimeout(resolve, 25));
  ready = true;
  await Promise.all([ordinary, urgent]);
  assert.equal(earlyDraws, 0, 'urgent residency drew while the shared KHR program was still linking');
});
