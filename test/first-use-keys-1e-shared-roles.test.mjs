import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { SHARED_MATERIAL_ROLE } from '../src/render/sharedMaterialRoles.js';

installCanvasStub();
const parallaxLayers = await import('../src/render/parallaxLayers.js');

test('parallax debris chips join the rock family without a batch key', () => {
  const scene = new THREE.Scene();
  const state = {
    settings: { video: { particleQuality: 'medium', motionReduce: false } },
    render: { sectorPalette: { dust: 0x425987, nebulaTint: 0x334466 } },
    camera: { focus: { x: 0, y: 0, z: 0 } },
    playerId: 1,
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, flags: {} }]]),
  };
  const stack = parallaxLayers.init(scene, state, null, state.render.sectorPalette);
  try {
    const lit = [];
    scene.traverse((object) => {
      if (!object.isMesh && !object.isInstancedMesh) return;
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of mats) {
        if (material && material.isMeshStandardMaterial) lit.push(material);
      }
    });
    assert.ok(lit.length > 0, 'parallax stack creates Standard chip materials');
    for (const material of lit) {
      assert.equal(material.userData.spacefaceSharedMaterialRole, SHARED_MATERIAL_ROLE.ROCK);
      assert.equal(material.userData.spacefaceBatchKey, undefined);
    }
    assert.ok(stack);
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
      if (tag !== 'canvas') return { style: {} };
      return {
        width: 0,
        height: 0,
        getContext() { return context; },
      };
    },
  };
}
