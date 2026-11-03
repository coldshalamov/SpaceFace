import * as THREE from 'three';

// Unit half-extents: the factory scales this one shared mesh to the physics datum.
// Flat-colored quads keep the divisions crisp without a texture, decal or another draw.
export function createFoundryBankSurface() {
  const positions = [], normals = [], colors = [];
  const palette = {
    side: new THREE.Color(0x343b40),
    end: new THREE.Color(0x3c4449),
    bottom: new THREE.Color(0x282e32),
    panel: new THREE.Color(0x657279),
    panelAlternate: new THREE.Color(0x5e6b72),
    seam: new THREE.Color(0x89949a),
    edge: new THREE.Color(0x9ca9ad),
    edgeWorn: new THREE.Color(0x87959b),
  };
  function quad(points, normal, color) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(...points[i]);
      normals.push(...normal);
      colors.push(color.r, color.g, color.b);
    }
  }

  // Three broad transverse panels, divided by fine flush weld bands. The outer strip
  // stays inside the physical footprint and reads as worn metal along the working edge.
  const xs = [-1, -0.95, -0.343, -0.323, 0.323, 0.343, 0.95, 1];
  const zs = [-1, -0.9, 0.9, 1];
  for (let x = 0; x < xs.length - 1; x++) {
    for (let z = 0; z < zs.length - 1; z++) {
      const edge = x === 0 || x === xs.length - 2 || z !== 1;
      const seam = x === 2 || x === 4;
      const color = edge ? ((x + z) % 3 === 0 ? palette.edgeWorn : palette.edge)
        : seam ? palette.seam : x === 3 ? palette.panelAlternate : palette.panel;
      quad([[xs[x], 1, zs[z]], [xs[x], 1, zs[z + 1]],
        [xs[x + 1], 1, zs[z + 1]], [xs[x + 1], 1, zs[z]]], [0, 1, 0], color);
    }
  }
  quad([[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [0, 0, 1], palette.side);
  quad([[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], [0, 0, -1], palette.side);
  quad([[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], [1, 0, 0], palette.end);
  quad([[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], [-1, 0, 0], palette.end);
  quad([[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], [0, -1, 0], palette.bottom);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
