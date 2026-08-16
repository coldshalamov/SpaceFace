// Plan 19 Crystal Shoals — designed hard-3D singing-field presentation.
//
// Simulation owns every free-floating Rapier body. This adapter builds a fractured mineral root,
// seven asymmetric prismatic growths, structural facet edges, and an internal lattice around that
// body. No Sprite, Points, texture card, camera-facing surface, random motion, light allocation, or
// physics write exists here.

import * as THREE from 'three';

const PALETTES = Object.freeze([
  Object.freeze({ matrix: 0x18394c, crystal: 0x55c9df, edge: 0xb4f5ff, heart: 0x2c728b }),
  Object.freeze({ matrix: 0x332f56, crystal: 0x9f83e7, edge: 0xe7ddff, heart: 0x624e9a }),
  Object.freeze({ matrix: 0x3a2945, crystal: 0xd276be, edge: 0xffd5f3, heart: 0x7c3f71 }),
]);

const SHAFTS = Object.freeze([
  Object.freeze({ x: -0.05, z: 0.02, height: 1.20, radius: 0.21, tiltX: -0.05, tiltZ: 0.04, yaw: 0.20 }),
  Object.freeze({ x: -0.34, z: -0.10, height: 0.82, radius: 0.17, tiltX: 0.18, tiltZ: 0.28, yaw: 1.15 }),
  Object.freeze({ x: 0.30, z: 0.04, height: 0.92, radius: 0.18, tiltX: -0.20, tiltZ: -0.24, yaw: 2.05 }),
  Object.freeze({ x: -0.12, z: 0.34, height: 0.68, radius: 0.14, tiltX: -0.34, tiltZ: 0.08, yaw: 2.78 }),
  Object.freeze({ x: 0.17, z: -0.31, height: 0.61, radius: 0.13, tiltX: 0.31, tiltZ: -0.12, yaw: 3.42 }),
  Object.freeze({ x: 0.45, z: -0.20, height: 0.54, radius: 0.12, tiltX: 0.15, tiltZ: -0.36, yaw: 4.25 }),
  Object.freeze({ x: -0.43, z: 0.24, height: 0.48, radius: 0.11, tiltX: -0.24, tiltZ: 0.34, yaw: 5.10 }),
]);

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function fract(value) {
  return value - Math.floor(value);
}

function stableUnit(slot, part, axis) {
  return fract(Math.sin((slot + 1) * 91.713 + (part + 1) * 37.119 + axis * 17.431) * 43758.5453);
}

function mineralRootGeometry(slot) {
  const sides = 10;
  const positions = [];
  const indices = [];
  for (let index = 0; index < sides; index++) {
    const angle = index / sides * Math.PI * 2;
    const outerRadius = 0.68 + stableUnit(slot, index, 1) * 0.16;
    const topRadius = 0.31 + stableUnit(slot, index, 2) * 0.13;
    positions.push(
      Math.cos(angle) * outerRadius,
      -0.13 - stableUnit(slot, index, 3) * 0.06,
      Math.sin(angle) * outerRadius,
    );
    positions.push(
      Math.cos(angle + 0.08) * topRadius,
      0.06 + stableUnit(slot, index, 4) * 0.08,
      Math.sin(angle + 0.08) * topRadius,
    );
  }
  const topCenter = positions.length / 3;
  positions.push(0, 0.12, 0);
  const bottomCenter = positions.length / 3;
  positions.push(0, -0.17, 0);
  for (let index = 0; index < sides; index++) {
    const next = (index + 1) % sides;
    const outer = index * 2;
    const top = outer + 1;
    const outerNext = next * 2;
    const topNext = outerNext + 1;
    indices.push(outer, outerNext, top, outerNext, topNext, top);
    indices.push(top, topNext, topCenter);
    indices.push(outerNext, outer, bottomCenter);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function crystalShaftGeometry(slot, shaftIndex, height, radius) {
  const sides = 6;
  const positions = [];
  const indices = [];
  const shoulderY = height * (0.71 + stableUnit(slot, shaftIndex, 8) * 0.08);
  const topLeanX = (stableUnit(slot, shaftIndex, 9) - 0.5) * radius * 0.42;
  const topLeanZ = (stableUnit(slot, shaftIndex, 10) - 0.5) * radius * 0.42;
  for (let side = 0; side < sides; side++) {
    const angle = side / sides * Math.PI * 2;
    const irregularity = 0.87 + stableUnit(slot + shaftIndex, side, 11) * 0.2;
    const baseRadius = radius * irregularity;
    const shoulderRadius = radius * (0.76 + stableUnit(slot, side + shaftIndex, 12) * 0.11);
    positions.push(Math.cos(angle) * baseRadius, 0, Math.sin(angle) * baseRadius);
    positions.push(
      topLeanX + Math.cos(angle + 0.035) * shoulderRadius,
      shoulderY,
      topLeanZ + Math.sin(angle + 0.035) * shoulderRadius,
    );
  }
  const tip = positions.length / 3;
  positions.push(topLeanX * 1.6, height, topLeanZ * 1.6);
  const baseCenter = positions.length / 3;
  positions.push(0, -0.015, 0);
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    const base = side * 2;
    const shoulder = base + 1;
    const baseNext = next * 2;
    const shoulderNext = baseNext + 1;
    indices.push(base, baseNext, shoulder, baseNext, shoulderNext, shoulder);
    indices.push(shoulder, shoulderNext, tip);
    indices.push(baseNext, base, baseCenter);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function latticeGeometry(shafts) {
  const positions = [];
  for (let index = 0; index < shafts.length; index++) {
    const shaft = shafts[index];
    positions.push(
      shaft.x, 0.04, shaft.z,
      shaft.x, shaft.height * 0.73, shaft.z,
    );
    if (index > 0) {
      positions.push(0, 0.13, 0, shaft.x, 0.12, shaft.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildCrystalShoalVisual(entity) {
  const data = entity && entity.data;
  if (!data || data.kind !== 'crystal_shoal_growth') return null;

  const slot = Math.max(0, Math.trunc(finite(data.crystalSlot)));
  const palette = PALETTES[slot % PALETTES.length];
  const root = new THREE.Group();
  root.name = `CrystalShoalGrowth_${slot}`;
  root.scale.setScalar(Math.max(1, finite(entity.radius, 9)));

  const matrixMaterial = new THREE.MeshStandardMaterial({
    name: `CrystalShoalMatrix_${slot}`,
    color: palette.matrix,
    roughness: 0.74,
    metalness: 0.04,
    flatShading: true,
  });
  const crystalMaterial = new THREE.MeshPhysicalMaterial({
    name: `CrystalShoalPrism_${slot}`,
    color: palette.crystal,
    emissive: palette.heart,
    emissiveIntensity: 0.34,
    roughness: 0.18,
    metalness: 0.02,
    transmission: 0.24,
    thickness: 0.72,
    ior: 1.62,
    iridescence: 0.46,
    iridescenceIOR: 1.32,
    flatShading: true,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    name: `CrystalShoalFacetEdges_${slot}`,
    color: palette.edge,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    toneMapped: false,
  });
  const latticeMaterial = new THREE.LineBasicMaterial({
    name: `CrystalShoalInteriorLattice_${slot}`,
    color: palette.heart,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    toneMapped: false,
  });

  const matrix = new THREE.Mesh(mineralRootGeometry(slot), matrixMaterial);
  matrix.name = 'CrystalShoalFracturedRoot';
  root.add(matrix);

  const growths = new THREE.Group();
  growths.name = 'CrystalShoalPrismaticGrowths';
  for (let index = 0; index < SHAFTS.length; index++) {
    const authored = SHAFTS[index];
    const height = authored.height * (0.92 + stableUnit(slot, index, 20) * 0.16);
    const radius = authored.radius * (0.9 + stableUnit(slot, index, 21) * 0.16);
    const geometry = crystalShaftGeometry(slot, index, height, radius);
    const assembly = new THREE.Group();
    assembly.name = `CrystalShaftAssembly_${index}`;
    assembly.position.set(authored.x, 0, authored.z);
    assembly.rotation.set(authored.tiltX, authored.yaw + slot * 0.19, authored.tiltZ);

    const prism = new THREE.Mesh(geometry, crystalMaterial);
    prism.name = `CrystalFacetedPrism_${index}`;
    assembly.add(prism);

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 12), edgeMaterial);
    edges.name = `CrystalFacetEdges_${index}`;
    edges.renderOrder = 12;
    assembly.add(edges);
    growths.add(assembly);
  }
  root.add(growths);

  const lattice = new THREE.LineSegments(latticeGeometry(SHAFTS), latticeMaterial);
  lattice.name = 'CrystalShoalInteriorLattice';
  lattice.renderOrder = 11;
  root.add(lattice);

  const presentation = {
    construction: 'hard_3d_fractured_root_custom_faceted_prisms_and_interior_lattice',
    cameraFacing: false,
    meshes: 1 + SHAFTS.length,
    lineSegments: 1 + SHAFTS.length,
    sprites: 0,
    points: 0,
    textureCards: 0,
    reducedMotion: false,
    reducedFlash: false,
  };
  root.userData.crystalShoalPresentation = presentation;
  root.userData.kind = 'crystal_shoal_growth';

  matrix.onBeforeRender = () => {
    const reducedMotion = data.crystalMotionReduce === true;
    const reducedFlash = data.crystalFlashReduce === true;
    const time = finite(data.crystalPresentationTime);
    const shimmer = reducedFlash ? 0 : Math.sin(time * (reducedMotion ? 0.28 : 0.74) + slot * 0.61);
    crystalMaterial.emissiveIntensity = 0.28 + shimmer * 0.08;
    edgeMaterial.opacity = reducedFlash ? 0.48 : 0.64 + shimmer * 0.08;
    latticeMaterial.opacity = reducedFlash ? 0.38 : 0.54 + shimmer * 0.06;
    presentation.reducedMotion = reducedMotion;
    presentation.reducedFlash = reducedFlash;
  };

  return root;
}

export default buildCrystalShoalVisual;
