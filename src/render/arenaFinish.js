// SpaceFace — the machined-prop finish (X1 style bible §3).
//
// Arena furniture and place props were the last objects built from bare primitives: a sharp
// BoxGeometry with one flat colour. Beside a Forge hull (three values, chamfered plates, lit
// lamps) they read as greybox/voxel. This module is the one finish for that class:
//
//   - one chamfered unit box (same 1×1×1 datum, so every existing scale call is unchanged);
//   - the three-value palette every prop shares (light primary / mid secondary / dark mechanical)
//     plus the safety hazard and lamp materials;
//   - small trim helpers for a band and a lit point, so a prop can read as a working machine
//     without a new texture, shader or per-frame cost.
//
// Pure presentation: shared geometries/materials are stamped `spacefaceSharedAsset` and never
// freed by an ordinary boundary disposal. No sim state, no per-frame allocation.

import * as THREE from 'three';

// Values calibrated against LOOK.md's key light: paint at roughly its authored value, dark
// mechanical as a visible share of the top view, hazard and lamp above the paint ceiling.
export const ARENA_PALETTE = Object.freeze({
  dark: 0x1c2128,
  mid: 0x6d7680,
  light: 0xa9b1b8,
  paint: 0x9fb7c4,
  hazard: 0xd9a03a,
  lamp: 0xffd9a8,
});

const CHAMFER = 0.055;
const _geometries = new Map();
const _materials = new Map();

function stamp(resource) {
  if (resource && resource.userData) resource.userData.spacefaceSharedAsset = true;
  return resource;
}

function roundedRectShape() {
  // Unit footprint, corners cut by CHAMFER. curveSegments: 1 turns each corner into one
  // straight chamfer — the manufactured edge reads at the chase camera and costs 4 quads.
  const s = new THREE.Shape();
  const c = CHAMFER;
  const lo = -0.5;
  const hi = 0.5;
  s.moveTo(lo + c, lo);
  s.lineTo(hi - c, lo);
  s.lineTo(hi, lo + c);
  s.lineTo(hi, hi - c);
  s.lineTo(hi - c, hi);
  s.lineTo(lo + c, hi);
  s.lineTo(lo, hi - c);
  s.lineTo(lo, lo + c);
  s.closePath();
  return s;
}

/**
 * A 1×1×1 chamfered box whose local +Y is the prop's up axis. Drop-in for BoxGeometry: the
 * outer extents stay exactly unit, so every `mesh.scale.set(w, h, d)` keeps its physics datum.
 */
export function machinedBoxGeometry() {
  const cached = _geometries.get('box');
  if (cached) return cached;
  const shape = roundedRectShape();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: true,
    bevelSize: CHAMFER,
    bevelThickness: CHAMFER,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });
  // Extrude runs along +Z and the bevel grows the outer extents by CHAMFER on every side.
  // Rotate the extrusion onto +Y, then normalise back to the exact unit cube.
  geometry.rotateX(-Math.PI / 2);
  const k = 1 / (1 + CHAMFER * 2);
  geometry.scale(k, k, k);
  geometry.center();
  geometry.deleteAttribute('uv');
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'sf-machined-box';
  _geometries.set('box', stamp(geometry));
  return geometry;
}

// --- X1 third review: the foundry gate/block/shutter three-value deck -------------------------
// These three props used to be one flat material with a lamp. The finish now lives in the body's
// colour attribute: light top/sun-facing panels, a mid mechanical shaft, a dark foundation band.
// It is still ONE body mesh plus the existing lamp, so the foundry's two-solid cap is unchanged.
const _valueColors = {
  light: new THREE.Color(ARENA_PALETTE.light),
  mid: new THREE.Color(ARENA_PALETTE.mid),
  dark: new THREE.Color(ARENA_PALETTE.dark),
};

function flatShadedCopy(geometry) {
  const copy = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  if (copy.getAttribute('uv')) copy.deleteAttribute('uv');
  return copy;
}

function paintTriangles(geometry, colorFor) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const colors = new Float32Array(position.count * 3);
  const centroid = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) {
    centroid.set(
      (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3,
      (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3,
      (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3,
    );
    faceNormal.set(
      (normal.getX(i) + normal.getX(i + 1) + normal.getX(i + 2)) / 3,
      (normal.getY(i) + normal.getY(i + 1) + normal.getY(i + 2)) / 3,
      (normal.getZ(i) + normal.getZ(i + 1) + normal.getZ(i + 2)) / 3,
    );
    const color = colorFor(centroid, faceNormal);
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = color.r;
      colors[(i + k) * 3 + 1] = color.g;
      colors[(i + k) * 3 + 2] = color.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Paint the gate post: a light cap, alternating light/mid upper facets and a dark base. The hex
 * silhouette and its collision datum are untouched — only the colour attribute is added.
 */
export function foundryThreeValuePost(radiusTop, radiusBottom, height, radialSegments) {
  const key = `foundry-three-value-post:${radiusTop}:${radiusBottom}:${height}:${radialSegments}`;
  const cached = _geometries.get(key);
  if (cached) return cached;
  const source = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments);
  const geometry = paintTriangles(flatShadedCopy(source), (c, n) => {
    if (n.y > 0.55) return _valueColors.light;   // cap
    if (n.y < -0.55) return _valueColors.dark;   // floor contact
    const angle = Math.atan2(c.x, c.z);
    const facet = Math.floor(((angle + Math.PI * 2) % (Math.PI * 2)) / ((Math.PI * 2) / radialSegments));
    if (c.y > height * 0.18) return facet % 2 === 0 ? _valueColors.light : _valueColors.mid;
    if (c.y > -height * 0.18) return _valueColors.mid;
    return _valueColors.dark;
  });
  source.dispose();
  geometry.name = 'sf-foundry-three-value-post';
  _geometries.set(key, stamp(geometry));
  return geometry;
}

function standard(name, params) {
  const cached = _materials.get(name);
  if (cached) return cached;
  const material = stamp(new THREE.MeshStandardMaterial(params));
  material.name = `sf-arena-${name}`;
  _materials.set(name, material);
  return material;
}

/** The shared prop materials. One instance per value for the whole game. */
export function arenaMaterials() {
  return {
    dark: standard('dark', { color: ARENA_PALETTE.dark, metalness: 0.58, roughness: 0.6 }),
    mid: standard('mid', { color: ARENA_PALETTE.mid, metalness: 0.86, roughness: 0.4 }),
    light: standard('light', { color: ARENA_PALETTE.light, metalness: 0.8, roughness: 0.34 }),
    // Dielectric paint, so the lacquer response of LOOK.md lands on it: a hard key glint and
    // mood-coloured rim, never a mirror.
    paint: standard('paint', { color: ARENA_PALETTE.paint, metalness: 0.12, roughness: 0.42 }),
    hazard: standard('hazard', { color: ARENA_PALETTE.hazard, metalness: 0.24, roughness: 0.5 }),
    // X1 third review: gate/block/shutter carry their light/mid/dark deck in ONE vertex-coloured
    // body so the three-value finish does not add a third solid. The white base is the carrier.
    threeValue: standard('three-value', {
      color: 0xffffff, vertexColors: true, metalness: 0.18, roughness: 0.82,
    }),
    lamp: standard('lamp', {
      color: 0x1a1206,
      emissive: new THREE.Color(ARENA_PALETTE.lamp),
      emissiveIntensity: 1.5,
      metalness: 0.2,
      roughness: 0.4,
    }),
  };
}

export function arenaBox() {
  return machinedBoxGeometry();
}

/**
 * Add a thin hazard band across one face of a prop. `size` is in the prop's local units; the
 * band sits proud by 0.01 so it never z-fights the body. One extra draw, shared material.
 */
export function addHazardBand(group, {
  width = 1, height = 0.08, depth = 0.02, x = 0, y = 0, z = 0.5, rotationY = 0,
} = {}) {
  if (!group) return null;
  const band = new THREE.Mesh(machinedBoxGeometry(), arenaMaterials().hazard);
  band.name = 'sf-arena-hazard';
  band.scale.set(width, height, depth);
  band.position.set(x, y, z);
  band.rotation.y = rotationY;
  band.userData.spacefacePropTrim = true;
  group.add(band);
  return band;
}

/** One lit point (a work lamp / beacon). Paint never emits; this is the light. */
export function addWorkLamp(group, {
  width = 0.16, height = 0.1, depth = 0.06, x = 0, y = 0.5, z = 0.4,
} = {}) {
  if (!group) return null;
  const lamp = new THREE.Mesh(machinedBoxGeometry(), arenaMaterials().lamp);
  lamp.name = 'sf-arena-lamp';
  lamp.scale.set(width, height, depth);
  lamp.position.set(x, y, z);
  lamp.userData.spacefacePropTrim = true;
  group.add(lamp);
  return lamp;
}

/** Panels: a shallow raised plate in the mid value, used to break a large flat face. */
export function addPanelPlate(group, {
  width = 0.6, height = 0.02, depth = 0.4, x = 0, y = 0.5, z = 0,
} = {}) {
  if (!group) return null;
  const plate = new THREE.Mesh(machinedBoxGeometry(), arenaMaterials().mid);
  plate.name = 'sf-arena-panel';
  plate.scale.set(width, height, depth);
  plate.position.set(x, y, z);
  plate.userData.spacefacePropTrim = true;
  group.add(plate);
  return plate;
}
