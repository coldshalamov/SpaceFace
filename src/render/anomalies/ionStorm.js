// Plan 19 Ion Storm lightning — fixed-pool hard world-space branch geometry.
//
// These authored paths are electrical channels, not particles: no Sprite, Points, texture card,
// procedural noise, or physics write exists here. Simulation supplies deterministic world-space
// endpoints; this render adapter owns only fixed LineSegments buffers and a heat/reach envelope.

import * as THREE from 'three';

export const ION_STORM_LIGHTNING_CAPACITY = 4;

const PATH_T = Object.freeze([0, 0.08, 0.17, 0.27, 0.37, 0.48, 0.58, 0.68, 0.78, 0.87, 0.95, 1]);
const AUTHORED_PATHS = Object.freeze([
  Object.freeze({
    offsets: Object.freeze([0, 0.08, -0.05, 0.16, 0.02, -0.13, 0.10, -0.04, 0.17, 0.03, -0.08, 0]),
    branches: Object.freeze([[3, 0.19, 0.28], [6, -0.24, 0.21], [8, 0.29, 0.16]]),
  }),
  Object.freeze({
    offsets: Object.freeze([0, -0.06, 0.12, -0.15, -0.01, 0.18, 0.04, -0.11, 0.08, -0.19, 0.05, 0]),
    branches: Object.freeze([[2, -0.22, 0.24], [5, 0.27, 0.20], [9, -0.26, 0.12]]),
  }),
  Object.freeze({
    offsets: Object.freeze([0, 0.11, 0.02, -0.12, 0.15, -0.03, -0.17, 0.06, -0.02, 0.14, -0.06, 0]),
    branches: Object.freeze([[4, -0.28, 0.22], [7, 0.25, 0.18], [9, 0.22, 0.11]]),
  }),
]);

const TRUNK_SEGMENTS = PATH_T.length - 1;
const BRANCH_SEGMENTS = AUTHORED_PATHS[0].branches.length;
const SEGMENT_CAPACITY = TRUNK_SEGMENTS + BRANCH_SEGMENTS;
const VERTEX_CAPACITY = SEGMENT_CAPACITY * 2;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function makeGeometry() {
  const positions = new Float32Array(VERTEX_CAPACITY * 3);
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  geometry.setDrawRange(0, 0);
  return { geometry, positions };
}

function makeMaterial(name, color) {
  return new THREE.LineBasicMaterial({
    name,
    color,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    transparent: false,
    toneMapped: false,
  });
}

function writeVertex(out, vertex, start, delta, nx, nz, span, t, offset) {
  const base = vertex * 3;
  out[base] = start.x + delta.x * t + nx * span * offset;
  out[base + 1] = start.y + delta.y * t;
  out[base + 2] = start.z + delta.z * t + nz * span * offset;
}

function writePath(slot, receipt, template) {
  const start = receipt.start;
  const end = receipt.end;
  const delta = {
    x: finite(end.x) - finite(start.x),
    y: finite(end.y) - finite(start.y),
    z: finite(end.z) - finite(start.z),
  };
  const horizontal = Math.hypot(delta.x, delta.z);
  const nx = horizontal > 1e-6 ? -delta.z / horizontal : 1;
  const nz = horizontal > 1e-6 ? delta.x / horizontal : 0;
  const span = Math.max(16, Math.hypot(horizontal, delta.y) * 0.24);

  let vertex = 0;
  for (let index = 0; index < TRUNK_SEGMENTS; index++) {
    for (const positions of [slot.corePositions, slot.returnPositions]) {
      const bias = positions === slot.returnPositions ? (index % 2 === 0 ? 0.024 : -0.018) : 0;
      writeVertex(positions, vertex, start, delta, nx, nz, span,
        PATH_T[index], template.offsets[index] + bias);
      writeVertex(positions, vertex + 1, start, delta, nx, nz, span,
        PATH_T[index + 1], template.offsets[index + 1] + bias);
    }
    vertex += 2;
  }
  for (let branchIndex = 0; branchIndex < template.branches.length; branchIndex++) {
    const branch = template.branches[branchIndex];
    const anchorIndex = branch[0];
    const branchT = Math.min(1, PATH_T[anchorIndex] + branch[2]);
    for (const positions of [slot.corePositions, slot.returnPositions]) {
      const bias = positions === slot.returnPositions ? -0.022 : 0;
      writeVertex(positions, vertex, start, delta, nx, nz, span,
        PATH_T[anchorIndex], template.offsets[anchorIndex] + bias);
      writeVertex(positions, vertex + 1, start, delta, nx, nz, span,
        branchT, template.offsets[anchorIndex] + branch[1] + bias);
    }
    vertex += 2;
  }

  slot.coreGeometry.attributes.position.needsUpdate = true;
  slot.returnGeometry.attributes.position.needsUpdate = true;
  slot.vertexCount = vertex;
}

function createSlot(index, group) {
  const core = makeGeometry();
  const chargeReturn = makeGeometry();
  const coreLine = new THREE.LineSegments(core.geometry,
    makeMaterial(`IonStormCore-${index}`, new THREE.Color(1.4, 1.8, 2.8)));
  const returnLine = new THREE.LineSegments(chargeReturn.geometry,
    makeMaterial(`IonStormReturn-${index}`, new THREE.Color(0.32, 0.70, 1.9)));
  coreLine.name = `IonStormCoreChannel-${index}`;
  returnLine.name = `IonStormReturnChannel-${index}`;
  coreLine.frustumCulled = false;
  returnLine.frustumCulled = false;
  coreLine.renderOrder = 25;
  returnLine.renderOrder = 24;
  coreLine.visible = false;
  returnLine.visible = false;
  group.add(returnLine, coreLine);
  return {
    alive: false,
    age: 0,
    attack: 0.04,
    sustain: 0.05,
    release: 0.32,
    peak: 4.8,
    vertexCount: 0,
    reducedFlash: false,
    sourceSeed: 0,
    coreGeometry: core.geometry,
    returnGeometry: chargeReturn.geometry,
    corePositions: core.positions,
    returnPositions: chargeReturn.positions,
    coreLine,
    returnLine,
  };
}

export function createIonStormLightningSystem(scene, { capacity = ION_STORM_LIGHTNING_CAPACITY } = {}) {
  if (!scene || typeof scene.add !== 'function') throw new TypeError('Ion Storm lightning requires a Three scene');
  const boundedCapacity = Math.max(1, Math.min(8, Math.trunc(capacity) || ION_STORM_LIGHTNING_CAPACITY));
  const group = new THREE.Group();
  group.name = 'IonStormLightningPool';
  group.userData.ionStormLightning = Object.freeze({
    construction: 'fixed_pool_authored_line_segments',
    cameraFacing: false,
    sprites: 0,
    points: 0,
    textureCards: 0,
  });
  scene.add(group);
  const slots = Array.from({ length: boundedCapacity }, (_, index) => createSlot(index, group));
  let cursor = 0;
  let lastSourceSeed = null;
  let lastReducedFlash = false;

  const clearSlot = (slot) => {
    slot.alive = false;
    slot.coreLine.visible = false;
    slot.returnLine.visible = false;
    slot.coreGeometry.setDrawRange(0, 0);
    slot.returnGeometry.setDrawRange(0, 0);
  };

  return {
    group,
    slots,
    strike(receipt, { reducedFlash = false } = {}) {
      if (!receipt || !receipt.start || !receipt.end) return false;
      const sourceSeed = Number(receipt.sourceSeed) >>> 0;
      const slot = slots[cursor];
      cursor = (cursor + 1) % slots.length;
      const template = AUTHORED_PATHS[sourceSeed % AUTHORED_PATHS.length];
      writePath(slot, receipt, template);
      slot.alive = true;
      slot.age = 0;
      slot.reducedFlash = !!reducedFlash;
      slot.attack = reducedFlash ? 0.12 : 0.04;
      slot.sustain = reducedFlash ? 0.08 : 0.05;
      slot.release = reducedFlash ? 0.52 : 0.32;
      slot.peak = reducedFlash ? 1.25 : 4.8;
      slot.sourceSeed = sourceSeed;
      slot.coreLine.visible = true;
      slot.returnLine.visible = true;
      slot.coreGeometry.setDrawRange(0, 2);
      slot.returnGeometry.setDrawRange(0, 2);
      lastSourceSeed = sourceSeed;
      lastReducedFlash = !!reducedFlash;
      return true;
    },
    update(dt) {
      const step = Math.max(0, Math.min(0.1, finite(dt)));
      let active = 0;
      for (const slot of slots) {
        if (!slot.alive) continue;
        slot.age += step;
        const releaseStart = slot.attack + slot.sustain;
        const total = releaseStart + slot.release;
        if (slot.age >= total) {
          clearSlot(slot);
          continue;
        }
        const attack = smoothstep(slot.age / slot.attack);
        const release = slot.age <= releaseStart
          ? 0
          : clamp01((slot.age - releaseStart) / slot.release);
        const reach = attack * (1 - release * 0.68);
        const heat = slot.peak * attack * Math.pow(1 - release, 1.35);
        const segments = Math.max(1, Math.min(SEGMENT_CAPACITY,
          Math.ceil(SEGMENT_CAPACITY * reach)));
        const vertices = Math.min(slot.vertexCount, segments * 2);
        slot.coreGeometry.setDrawRange(0, vertices);
        slot.returnGeometry.setDrawRange(0, vertices);
        slot.coreLine.material.color.setRGB(0.48 * heat, 0.66 * heat, 1.02 * heat);
        slot.returnLine.material.color.setRGB(0.11 * heat, 0.26 * heat, 0.72 * heat);
        active++;
      }
      return active;
    },
    clear() {
      for (const slot of slots) clearSlot(slot);
    },
    reproject(dx, dz) {
      const ox = finite(dx);
      const oz = finite(dz);
      if (ox === 0 && oz === 0) return;
      for (const slot of slots) {
        if (!slot.alive) continue;
        for (const positions of [slot.corePositions, slot.returnPositions]) {
          for (let vertex = 0; vertex < slot.vertexCount; vertex++) {
            positions[vertex * 3] += ox;
            positions[vertex * 3 + 2] += oz;
          }
        }
        slot.coreGeometry.attributes.position.needsUpdate = true;
        slot.returnGeometry.attributes.position.needsUpdate = true;
      }
    },
    inspect() {
      return Object.freeze({
        active: slots.filter((slot) => slot.alive).length,
        capacity: slots.length,
        lastSourceSeed,
        lastReducedFlash,
        construction: group.userData.ionStormLightning.construction,
        lineSegments: slots.length * 2,
        sprites: 0,
        points: 0,
        textureCards: 0,
      });
    },
    dispose() {
      this.clear();
      group.removeFromParent();
      for (const slot of slots) {
        slot.coreGeometry.dispose();
        slot.returnGeometry.dispose();
        slot.coreLine.material.dispose();
        slot.returnLine.material.dispose();
      }
    },
  };
}
