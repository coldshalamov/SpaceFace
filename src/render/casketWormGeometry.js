// Astra-authored low, layered Casket Worm geometry. The fauna builder owns the
// shared geometry cache; these factories create one segment and one feeding head.
import * as THREE from 'three';

const RADIAL = 8;

function tissueLoft(profiles) {
  const position = [], uv = [], index = [];
  for (let r = 0; r < profiles.length; r++) {
    const [z, width, height, offset = 0] = profiles[r];
    for (let j = 0; j <= RADIAL; j++) {
      const angle = j / RADIAL * Math.PI * 2;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const dorsal = sin > 0 ? 1 + 0.06 * Math.cos(angle * 4) : 0.82;
      position.push(cos * width, offset + sin * height * dorsal, z);
      uv.push(j / RADIAL, r / (profiles.length - 1));
      if (r < profiles.length - 1 && j < RADIAL) {
        const a = r * (RADIAL + 1) + j, b = a + RADIAL + 1;
        index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  for (const [r, back] of [[0, true], [profiles.length - 1, false]]) {
    const center = position.length / 3, [z, , , offset = 0] = profiles[r];
    position.push(0, offset, z); uv.push(0.5, back ? 0 : 1);
    for (let j = 0; j < RADIAL; j++) {
      const a = r * (RADIAL + 1) + j;
      index.push(center, back ? a + 1 : a, back ? a : a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  smoothSeam(geometry, profiles.length);
  return geometry;
}

function smoothSeam(geometry, ringCount) {
  const normals = geometry.attributes.normal;
  for (let r = 0; r < ringCount; r++) {
    const a = r * (RADIAL + 1), b = a + RADIAL;
    const normal = new THREE.Vector3().fromBufferAttribute(normals, a)
      .add(new THREE.Vector3().fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, normal.x, normal.y, normal.z);
    normals.setXYZ(b, normal.x, normal.y, normal.z);
  }
}

// Caps need their own rim vertices: sharing the loft's rim would collapse each
// cap's UVs to a line. Copy normals so splitting the UV seam keeps its shading.
function withPlanarCaps(source) {
  // This source is freshly constructed for the cache, so extend it in place
  // instead of cloning all of its vertex and index buffers first.
  const geometry = source, attributes = {};
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    attributes[name] = Array.from(attribute.array);
  }
  const indices = Array.from(geometry.index.array);
  const first = indices.length - RADIAL * 3 * 2;
  for (let cap = 0; cap < 2; cap++) {
    const start = first + cap * RADIAL * 3;
    const used = [...new Set(indices.slice(start, start + RADIAL * 3))];
    const remap = new Map();
    const points = used.map(i => [source.attributes.position.getX(i), source.attributes.position.getY(i)]);
    const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
    const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
    for (const old of used) {
      const next = attributes.position.length / 3;
      remap.set(old, next);
      for (const [name, attribute] of Object.entries(source.attributes)) {
        for (let k = 0; k < attribute.itemSize; k++) attributes[name].push(attribute.array[old * attribute.itemSize + k]);
      }
      attributes.uv[next * 2] = (source.attributes.position.getX(old) - minX) / (maxX - minX);
      attributes.uv[next * 2 + 1] = (source.attributes.position.getY(old) - minY) / (maxY - minY);
    }
    for (let i = start; i < start + RADIAL * 3; i++) indices[i] = remap.get(indices[i]);
  }
  for (const [name, attribute] of Object.entries(source.attributes)) {
    geometry.setAttribute(name, new THREE.BufferAttribute(
      new attribute.array.constructor(attributes[name]), attribute.itemSize, attribute.normalized,
    ));
  }
  geometry.setIndex(indices);
  geometry.name = `${source.name}_PlanarCaps`;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createCasketSegmentGeometry() {
  const geometry = tissueLoft([
    [-0.55, 0.055, 0.035, -0.035],
    [-0.16, 0.63, 0.205, 0],
    [0.23, 0.70, 0.235, 0],
    [0.55, 0.48, 0.13, -0.025],
  ]);
  geometry.name = 'Casket_Linked_Segment';
  return withPlanarCaps(geometry);
}

export function createCasketHeadGeometry() {
  const geometry = tissueLoft([
    [-0.80, 0.38, 0.13, -0.015],
    [-0.48, 0.43, 0.17, -0.005],
    [-0.10, 0.58, 0.25, 0.015],
    [0.30, 0.70, 0.24, 0.005],
    [0.64, 0.64, 0.19, -0.015],
    [0.80, 0.56, 0.12, -0.035],
    [0.66, 0.43, 0.065, -0.035],
    [0.40, 0.26, 0.025, -0.035],
  ]);
  const position = geometry.attributes.position;
  // Recess the center of the feeding end between its paired lateral lips.
  for (let ring = 4; ring < 8; ring++) {
    for (let j = 0; j <= RADIAL; j++) {
      const i = ring * (RADIAL + 1) + j, angle = j / RADIAL * Math.PI * 2;
      position.setZ(i, position.getZ(i) - 0.19 * (1 - Math.abs(Math.cos(angle))));
    }
  }
  geometry.computeVertexNormals();
  smoothSeam(geometry, 8);
  geometry.name = 'Casket_Feeding_Scoop_Head';
  return withPlanarCaps(geometry);
}
