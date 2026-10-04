// SWARM-07 B1 — the Brood presentation: the second population, instanced like the asteroid
// batch path (SWARM_EXPANSION §4 B1).
//
// The Brood are DESIGNED bodies, never camera-facing soft squares: each body is a faceted
// low-poly dart creature — a raised spine, a belly keel and two swept wing plates — drawn as
// ONE InstancedMesh so 400 bodies cost one draw call and per-frame buffer bytes. The sim
// (src/systems/swarmBrood.js) owns the flat typed arrays; this module only reads them and
// writes instance transforms. Zero per-frame allocation: the Matrix4/Color/Quaternion scratch
// is retained; instance buffers are allocated once at create.
//
// Accessibility: reduced motion drops the per-body idle bob — positions, headings and
// population stay exact.

import * as THREE from 'three';
import { SWARM_BROOD_FAMILIES } from '../data/swarmBrood.js';

const FAMILY_N = SWARM_BROOD_FAMILIES.length;

/**
 * The mite body: a faceted dart. Authored as raw triangles (non-indexed for flat facet
 * normals) — a designed silhouette that reads at swarm-camera distance: an arrowhead with a
 * raised spine and a belly keel, nose forward on +X, up on +Y, in the XZ flight plane.
 */
function buildBroodBodyGeometry(scale = 1) {
  const L = 3.1 * scale;   // nose
  const T = -2.0 * scale;  // tail
  const W = 2.3 * scale;   // wing half-span
  const HS = 1.15 * scale; // spine height
  const HB = -0.75 * scale; // belly keel
  const nose = [L, 0, 0];
  const tail = [T, 0, 0];
  const spine = [-0.4 * scale, HS, 0];
  const keel = [-0.4 * scale, HB, 0];
  const wingL = [T + 0.9 * scale, 0.1 * scale, W];
  const wingR = [T + 0.9 * scale, 0.1 * scale, -W];

  const tri = (a, b, c) => [a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]];
  const positions = new Float32Array([
    // top hull: spine ridge, split over both wings
    ...tri(nose, spine, wingL),
    ...tri(nose, wingL, tail),
    ...tri(nose, wingR, spine),
    ...tri(nose, tail, wingR),
    // belly: keel ridge
    ...tri(nose, wingL, keel),
    ...tri(nose, keel, wingR),
    ...tri(nose, keel, wingL),
    ...tri(nose, wingR, keel),
    // tail cap
    ...tri(tail, wingL, spine),
    ...tri(tail, spine, wingR),
    ...tri(tail, keel, wingL),
    ...tri(tail, wingR, keel),
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Create the presentation. Returns { mesh, update(view, dt, opts), dispose() }.
 * `update` reads the engine's published view (schema spaceface.swarmBrood.v1).
 */
export function createBroodPresentation(scene, capacity = 400) {
  const geometry = buildBroodBodyGeometry(1);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0.18,
    flatShading: true,
    emissive: new THREE.Color(0.22, 0.05, 0.02),
    emissiveIntensity: 0.9,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.name = 'sf-swarm-brood';
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  mesh.renderOrder = 2;
  scene.add(mesh);

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const color = new THREE.Color();

  const FAMILY_COLORS = SWARM_BROOD_FAMILIES.map((def) => color.clone().setRGB(
    def.bodyColor[0], def.bodyColor[1], def.bodyColor[2],
  ));

  function dispose() {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  }

  /**
   * @param {object} view the engine's published view (may be null/empty)
   * @param {number} dt frame seconds
   * @param {{simTime?:number, reducedMotion?:boolean}} opts
   * @returns {boolean} true when any brood were drawn this frame
   */
  function update(view, dt, opts = {}) {
    void dt;
    if (!view || !view.alive || view.aliveCount <= 0) {
      mesh.count = 0;
      mesh.visible = false;
      return false;
    }
    const count = Math.min(view.cap, capacity);
    const simTime = Number.isFinite(opts.simTime) ? opts.simTime : 0;
    const reduced = opts.reducedMotion === true;
    const { px, pz, heading, family, alive, seedPhase } = view;
    let written = 0;
    for (let i = 0; i < count; i++) {
      if (!alive[i]) continue;
      const bob = reduced ? 0 : Math.sin(simTime * 5.1 + seedPhase[i]) * 0.35;
      quat.setFromAxisAngle(axis, heading[i]);
      pos.set(px[i], 0.6 + bob, pz[i]);
      const fam = family[i];
      const scale = fam >= 0 && fam < FAMILY_N ? SWARM_BROOD_FAMILIES[fam].radius / 2.4 : 1;
      scl.set(scale, scale, scale);
      matrix.compose(pos, quat, scl);
      mesh.setMatrixAt(written, matrix);
      const c = fam >= 0 && fam < FAMILY_N ? FAMILY_COLORS[fam] : FAMILY_COLORS[0];
      color.copy(c);
      mesh.setColorAt(written, color);
      written += 1;
    }
    mesh.count = written;
    mesh.visible = written > 0;
    if (written > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    return written > 0;
  }

  return { mesh, update, dispose };
}
