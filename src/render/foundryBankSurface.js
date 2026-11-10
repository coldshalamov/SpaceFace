import * as THREE from 'three';

// Unit half-extents: the factory scales this one shared mesh to the physics datum.
// X1 style bible §3: the whole bank is ONE vertex-coloured surface — no trim mesh — so the
// visual bounding box is exactly the authored collision slab (96 × 4.16 × 33.8 WU) and the
// rigid-opaque batch keeps a single specimen. Value carries the finish instead of geometry:
//
//   - a light working deck and alternate hatch panels;
//   - two mid-value clamp rails down the deck (hold-downs, not decoration);
//   - one dark recessed channel through the middle of the deck (the dark share the old
//     flat slab never had under the gameplay key);
//   - a dashed safety band on the working edge only;
//   - a lamp housing with a pale lens bar on the opposite (top) edge;
//   - a near-black foundation skirt painted up the bottom of every side wall.
//
// Colour only, no texture, no decal, no extra draw. The lamp lens is paint here because a
// second emissive draw would break the one-geometry batch contract; the law-arena bank
// plates (lawArenaDressing.js) carry the real lit housing.
export function createFoundryBankSurface() {
  const positions = [], normals = [], colors = [];
  const palette = {
    // X1 style bible §3: three values. The deck is the light primary, the clamp rails are
    // the mid secondary, the recessed channel and end margins are the dark mechanical share.
    panel: new THREE.Color(0x9ba3ab),
    panelAlternate: new THREE.Color(0x8e969e),
    rail: new THREE.Color(0x6d7680),
    recess: new THREE.Color(0x262b31),
    margin: new THREE.Color(0x30363d),
    housing: new THREE.Color(0x4a525a),
    lens: new THREE.Color(0xffd9a8),
    side: new THREE.Color(0x343a41),
    end: new THREE.Color(0x3d444c),
    skirt: new THREE.Color(0x1e2328),
    bottom: new THREE.Color(0x14181d),
    bevel: new THREE.Color(0xa7afb7),
    endBevel: new THREE.Color(0x8f979f),
    mark: new THREE.Color(0xd9a03a),
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
  // Eleven x bands, mirrored about the centre: two dark end margins, six light deck
  // panels, two mid-value clamp rails and one wide recessed channel. The symmetry keeps
  // the two rail faces identical values on both halves of the slab.
  const xs = [-0.98, -0.86, -0.72, -0.58, -0.44, -0.30, 0.30, 0.44, 0.58, 0.72, 0.86, 0.98];
  // Three rows: the working-edge hazard strip, the working deck, and the lamp-housing
  // strip on the opposite long edge.
  const zs = [-insetZ, -0.80, 0.84, insetZ];
  const deckColor = (x) => {
    if (x === 0 || x === 10) return palette.margin;      // end margins
    if (x === 5) return palette.recess;                  // recessed centre channel
    if (x === 4 || x === 6) return palette.rail;         // two mid clamp rails
    return x % 2 === 0 ? palette.panelAlternate : palette.panel;
  };
  const hazardColor = (x) => (x % 2 === 0 ? palette.mark : palette.margin);
  const housingColor = (x) => (x >= 4 && x <= 6 ? palette.lens : palette.housing);
  for (let x = 0; x < xs.length - 1; x++) {
    for (let z = 0; z < zs.length - 1; z++) {
      const color = z === 0 ? hazardColor(x) : z === 2 ? housingColor(x) : deckColor(x);
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
  // Side walls split once: the lower band is the foundation skirt (near-black, grounded),
  // the upper band is the mid mechanical side the bevel and key catch. Windings face outward.
  const skirtY = -0.45;
  quad([[-1, -1, 1], [1, -1, 1], [1, skirtY, 1], [-1, skirtY, 1]], [0, 0, 1], palette.skirt);
  quad([[-1, skirtY, 1], [1, skirtY, 1], [1, shoulder, 1], [-1, shoulder, 1]], [0, 0, 1], palette.side);
  quad([[1, -1, -1], [-1, -1, -1], [-1, skirtY, -1], [1, skirtY, -1]], [0, 0, -1], palette.skirt);
  quad([[1, skirtY, -1], [-1, skirtY, -1], [-1, shoulder, -1], [1, shoulder, -1]], [0, 0, -1], palette.side);
  quad([[1, -1, 1], [1, -1, -1], [1, skirtY, -1], [1, skirtY, 1]], [1, 0, 0], palette.skirt);
  quad([[1, skirtY, 1], [1, skirtY, -1], [1, shoulder, -1], [1, shoulder, 1]], [1, 0, 0], palette.end);
  quad([[-1, -1, -1], [-1, -1, 1], [-1, skirtY, 1], [-1, skirtY, -1]], [-1, 0, 0], palette.skirt);
  quad([[-1, skirtY, -1], [-1, skirtY, 1], [-1, shoulder, 1], [-1, shoulder, -1]], [-1, 0, 0], palette.end);
  quad([[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], [0, -1, 0], palette.bottom);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
