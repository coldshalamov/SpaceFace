// Top-down meshes for Wreck Court bodies. Extrudes the code-native silhouettes.
// No Three.js. The draw list is what a later pass would upload; it does not
// touch the sim and it does not invent a second renderer.

import { WRECK_COURT_VARIANTS } from '../../data/wreckCourt/variants.js';

function halfExtent(vertices) {
  let max = 1;
  for (const [x, z] of vertices) {
    const d = Math.hypot(x, z);
    if (d > max) max = d;
  }
  return max;
}

export function extrudePolygon(vertices, height) {
  const n = vertices.length;
  const positions = [];
  const normals = [];
  const indices = [];
  for (const [x, z] of vertices) {
    positions.push(x, 0, z);
    normals.push(0, -1, 0);
  }
  for (const [x, z] of vertices) {
    positions.push(x, height, z);
    normals.push(0, 1, 0);
  }
  for (let i = 1; i < n - 1; i += 1) {
    indices.push(0, i, i + 1);
    indices.push(n, n + i + 1, n + i);
  }
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const ax = vertices[i][0];
    const az = vertices[i][1];
    const bx = vertices[j][0];
    const bz = vertices[j][1];
    const ex = bx - ax;
    const ez = bz - az;
    const len = Math.hypot(ex, ez) || 1;
    const nx = ez / len;
    const nz = -ex / len;
    const base = positions.length / 3;
    positions.push(ax, 0, az, bx, 0, bz, bx, height, bz, ax, height, az);
    for (let k = 0; k < 4; k += 1) normals.push(nx, 0, nz);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

function yawPoint(x, z, yaw, scale, ox, oz) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const px = x * scale;
  const pz = z * scale;
  return [ox + px * c - pz * s, px * s + pz * c + oz];
}

export function presentCourt(view) {
  const draws = [];
  for (const body of view.bodies || []) {
    const variant = WRECK_COURT_VARIANTS[body.variant];
    if (!variant) continue;
    const height = body.destroyed ? variant.height * 0.35 : variant.height;
    const mesh = extrudePolygon(variant.vertices, height);
    const scale = body.radius / halfExtent(variant.vertices);
    const positions = [];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const [x, z] = yawPoint(mesh.positions[i], mesh.positions[i + 2], body.heading || 0, scale, body.x, body.z);
      const y = mesh.positions[i + 1] * (body.destroyed ? 0.35 : 1);
      positions.push(x, y, z);
    }
    const normals = [];
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const [x, z] = yawPoint(mesh.normals[i], mesh.normals[i + 2], body.heading || 0, 1, 0, 0);
      normals.push(x, mesh.normals[i + 1], z);
    }
    draws.push({
      id: body.id,
      variant: body.variant,
      role: variant.role,
      material: variant.material,
      positions,
      normals,
      indices: mesh.indices.slice(),
      destroyed: !!body.destroyed,
    });
  }
  const player = view.player || { x: 0, z: 0 };
  return {
    draws,
    camera: { x: player.x, y: 180, z: player.z + 0.01, lookAt: { x: player.x, y: 0, z: player.z } },
    light: { direction: { x: 0.35, y: 0.8, z: 0.2 }, color: '#f4efe4', fill: '#6e88a8' },
  };
}
