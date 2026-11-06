import * as THREE from 'three';

// Unit half-extents: the factory scales this one shared mesh to the physics datum.
// Flat-colored quads keep the divisions crisp without a texture, decal or another draw.
export function createFoundryBankSurface() {
  const positions = [], normals = [], colors = [];
  const palette = {
    // X1 style bible §3: three values. The top is the light primary (the read from the chase
    // camera), the sides are the mid/dark mechanical, the underside is near-black. Seams are
    // DARK recesses, never bright tape; the bevel catches the key. A recessed hatch breaks the
    // large top face.
    side: new THREE.Color(0x343a41),
    end: new THREE.Color(0x3d444c),
    bottom: new THREE.Color(0x1a1e24),
    panel: new THREE.Color(0x9ba3ab),
    panelAlternate: new THREE.Color(0x8e969e),
    seam: new THREE.Color(0x3c444c),
    bevel: new THREE.Color(0xa7afb7),
    endBevel: new THREE.Color(0x8f979f),
    mark: new THREE.Color(0xd9a03a),
    hatch: new THREE.Color(0x5a6168),
  };
  function quad(points, normal, color) {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      positions.push(...points[i]);
      normals.push(...normal);
      colors.push(color.r, color.g, color.b);
    }
  }

  // The inset chamfer cuts into the top, leaving the vertical collision perimeter
  // intact through the flight plane. Unit Y 0.7 is 0.624 WU below the top.
  const shoulder = 0.7, insetX = 0.98, insetZ = 0.94;
  const xs = [-insetX, -0.84, -0.78, -0.343, -0.323, 0.323, 0.343, insetX];
  const zs = [-insetZ, -0.25, 0.25, insetZ];
  for (let x = 0; x < xs.length - 1; x++) {
    for (let z = 0; z < zs.length - 1; z++) {
      const seam = x === 3 || x === 5;
      // A dashed safety band along one long edge, two recessed hatches, and one alternate
      // panel plate: enough authored structure that the slab reads as a deck, not a card.
      const hazard = z === 0 && x >= 1 && x <= 6;
      const color = hazard
        ? (x % 2 === 1 ? palette.mark : palette.hatch)
        : seam ? palette.seam
          : (x === 2 && z === 2) || (x === 5 && z === 1) ? palette.hatch
            : (x === 4 || (x === 1 && z === 2)) ? palette.panelAlternate : palette.panel;
      quad([[xs[x], 1, zs[z]], [xs[x], 1, zs[z + 1]],
        [xs[x + 1], 1, zs[z + 1]], [xs[x + 1], 1, zs[z]]], [0, 1, 0], color);
    }
  }
  // Face normals come from the chamfer planes. Three's normal matrix accounts for
  // the nonuniform physical half-extents applied by the factory.
  function bevel(points, color) {
    const a = new THREE.Vector3(...points[0]);
    const n = new THREE.Vector3(...points[1]).sub(a)
      .cross(new THREE.Vector3(...points[2]).sub(a)).normalize();
    quad(points, n.toArray(), color);
  }
  bevel([[-1, shoulder, 1], [1, shoulder, 1], [insetX, 1, insetZ], [-insetX, 1, insetZ]], palette.bevel);
  bevel([[1, shoulder, -1], [-1, shoulder, -1], [-insetX, 1, -insetZ], [insetX, 1, -insetZ]], palette.bevel);
  bevel([[1, shoulder, 1], [1, shoulder, -1], [insetX, 1, -insetZ], [insetX, 1, insetZ]], palette.endBevel);
  bevel([[-1, shoulder, -1], [-1, shoulder, 1], [-insetX, 1, insetZ], [-insetX, 1, -insetZ]], palette.endBevel);
  quad([[-1, -1, 1], [1, -1, 1], [1, shoulder, 1], [-1, shoulder, 1]], [0, 0, 1], palette.side);
  quad([[1, -1, -1], [-1, -1, -1], [-1, shoulder, -1], [1, shoulder, -1]], [0, 0, -1], palette.side);
  quad([[1, -1, 1], [1, -1, -1], [1, shoulder, -1], [1, shoulder, 1]], [1, 0, 0], palette.end);
  quad([[-1, -1, -1], [-1, -1, 1], [-1, shoulder, 1], [-1, shoulder, -1]], [-1, 0, 0], palette.end);
  quad([[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], [0, -1, 0], palette.bottom);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
