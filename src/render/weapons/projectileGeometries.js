import * as THREE from 'three';

/**
 * Creates a lightweight 3D multi-planar spindle geometry for energy and ballistic projectiles.
 *
 * Rather than a flat 2D camera-facing billboard quad (which pops and rotates unnaturally as the camera
 * or ship pivots), this creates an intersecting multi-plane 3D form oriented along the X-axis (forward).
 * From any 360-degree viewing angle, it maintains true geometric volume and depth.
 *
 * @param {number} planes Number of radial intersecting planes (default 3 = 60-degree star cross-section)
 * @returns {THREE.BufferGeometry}
 */
export function createSpindleGeometry(planes = 3) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let p = 0; p < planes; p++) {
    const angle = (p * Math.PI) / planes;
    const cy = Math.cos(angle);
    const cz = Math.sin(angle);
    const baseIndex = (positions.length / 3);

    // Quad for this plane: x in [-0.5, 0.5] (length), radial in [-0.5, 0.5] (width)
    // v0: tail (-0.5), -radial
    positions.push(-0.5, -0.5 * cy, -0.5 * cz);
    uvs.push(0.0, 0.0);
    // v1: tail (-0.5), +radial
    positions.push(-0.5, 0.5 * cy, 0.5 * cz);
    uvs.push(0.0, 1.0);
    // v2: head (+0.5), +radial
    positions.push(0.5, 0.5 * cy, 0.5 * cz);
    uvs.push(1.0, 1.0);
    // v3: head (+0.5), -radial
    positions.push(0.5, -0.5 * cy, -0.5 * cz);
    uvs.push(1.0, 0.0);

    // Two triangles per plane
    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    indices.push(baseIndex, baseIndex + 2, baseIndex + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.type = 'PlaneGeometry';
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}
