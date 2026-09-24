// Optic structures are lattices of stone, metal, and diamond, not hand-placed pebbles.
// One recipe expands into the bodies world.js spawns. Cells share OPTIC_LATTICE_SPACING
// so an 8-way prism hits the next cell or a stone border and nothing else.

import {
  OPTIC_LATTICE_SPACING,
  OPTIC_MATERIALS,
} from '../combat/opticField.js';

export const CERES_PRISM_GALLERY_ID = 'optic_ceres_prism_gallery';
export const CERES_PRISM_GALLERY_ORIGIN = Object.freeze({ x: 1680, z: -2100 });

function cellKey(ix, iz) {
  return `${ix},${iz}`;
}

function putCell(map, ix, iz, material) {
  const key = cellKey(ix, iz);
  if (map.has(key)) return false;
  map.set(key, { ix, iz, material });
  return true;
}

/** A straight fuse. Forward splinters walk +ix. The ±iz rows are stone. */
export function wickCells(map, length, ix0 = 0, iz = 0) {
  const n = Math.max(0, length | 0);
  for (let i = 0; i < n; i++) {
    putCell(map, ix0 + i, iz, 'diamond');
    putCell(map, ix0 + i, iz + 1, 'stone');
    putCell(map, ix0 + i, iz - 1, 'stone');
  }
}

/** A filled diamond block. ix/iz are the minimum corner. */
export function murderFieldCells(map, ix0, iz0, width, height) {
  const w = Math.max(0, width | 0);
  const h = Math.max(0, height | 0);
  for (let ix = ix0; ix < ix0 + w; ix++) {
    for (let iz = iz0; iz < iz0 + h; iz++) putCell(map, ix, iz, 'diamond');
  }
}

/** Stone on every empty cell of the inclusive border. Does not overwrite a diamond. */
export function stoneRingCells(map, ix0, ix1, iz0, iz1) {
  for (let ix = ix0; ix <= ix1; ix++) {
    putCell(map, ix, iz0, 'stone');
    putCell(map, ix, iz1, 'stone');
  }
  for (let iz = iz0; iz <= iz1; iz++) {
    putCell(map, ix0, iz, 'stone');
    putCell(map, ix1, iz, 'stone');
  }
}

/**
 * Ceres gallery. A six-crystal fuse runs into a 3×3 field. Stone walls the lane and
 * the field. Two metal rocks sit west of the mouth flanks (not behind the wick stones)
 * so a banked shot can still enter — (0,±2) put stone between metal and the fuse.
 */
export function ceresPrismGalleryCells() {
  const map = new Map();
  const wick = 6;
  wickCells(map, wick, 0, 0);
  const fieldX = wick;
  const fieldZ = -1;
  murderFieldCells(map, fieldX, fieldZ, 3, 3);
  stoneRingCells(map, fieldX - 1, fieldX + 3, -2, 2);
  putCell(map, -2, 1, 'metal');
  putCell(map, -2, -1, 'metal');
  return [...map.values()].sort((a, b) => (a.ix - b.ix) || (a.iz - b.iz));
}

export function compileOpticCells(cells, spacing = OPTIC_LATTICE_SPACING, heading = 0) {
  const list = Array.isArray(cells) ? cells : [];
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const bodies = [];
  for (let i = 0; i < list.length; i++) {
    const cell = list[i];
    const material = OPTIC_MATERIALS[cell.material];
    if (!material) continue;
    const lx = cell.ix * spacing;
    const lz = cell.iz * spacing;
    bodies.push({
      index: bodies.length,
      ix: cell.ix,
      iz: cell.iz,
      material: material.id,
      typeId: material.typeId,
      tint: material.tint,
      radius: material.radius,
      surfaceMaterial: material.surfaceMaterial,
      x: lx * cos - lz * sin,
      z: lx * sin + lz * cos,
    });
  }
  return bodies;
}

export function compileCeresPrismGallery() {
  return compileOpticCells(ceresPrismGalleryCells(), OPTIC_LATTICE_SPACING, 0);
}

export function opticStructureBounds(bodies) {
  if (!bodies || !bodies.length) return { x: 0, z: 0, radius: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const reach = Number(body.radius) || 0;
    minX = Math.min(minX, body.x - reach);
    maxX = Math.max(maxX, body.x + reach);
    minZ = Math.min(minZ, body.z - reach);
    maxZ = Math.max(maxZ, body.z + reach);
  }
  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    radius: Math.hypot(maxX - minX, maxZ - minZ) / 2,
  };
}

export const OPTIC_STRUCTURES = Object.freeze([
  Object.freeze({
    id: CERES_PRISM_GALLERY_ID,
    sectorId: 'sector_ceres_belt',
    origin: CERES_PRISM_GALLERY_ORIGIN,
    heading: 0,
    cells: ceresPrismGalleryCells,
  }),
]);

export function opticStructuresFor(sectorId) {
  const out = [];
  for (let i = 0; i < OPTIC_STRUCTURES.length; i++) {
    const spec = OPTIC_STRUCTURES[i];
    if (spec.sectorId === sectorId) out.push(spec);
  }
  return out;
}

export function compileOpticStructure(spec) {
  const cells = typeof spec.cells === 'function' ? spec.cells() : spec.cells;
  return compileOpticCells(cells, OPTIC_LATTICE_SPACING, spec.heading || 0);
}

function sortedCells(map) {
  return [...map.values()].sort((a, b) => (a.ix - b.ix) || (a.iz - b.iz));
}

/**
 * One optic decision per live swarm room, in player-relative units at wave 1.
 * Not part of OPTIC_STRUCTURES: those follow the sector, and a swarm fight is not the
 * Ceres gallery. Heading is radians. Cells are lattice steps before compileOpticCells.
 */
export function swarmOpticLayout(arenaId) {
  const map = new Map();
  if (arenaId === 'helios_core') {
    // Rear gate is +Z at 165. The mouth sits between the player and that gate so a
    // pulse traveling either way walks the fuse. Side stones throw splinters off the lane.
    wickCells(map, 4, 0, 0);
    return {
      id: 'optic_swarm_helios_fuse',
      origin: { x: 0, z: 142 },
      heading: Math.PI / 2,
      cells: sortedCells(map),
    };
  }
  if (arenaId === 'lagrange_crucible') {
    // Default Crucible gun is a kinetic bank-shot. Two mirrors, not a fuse.
    putCell(map, 0, 0, 'metal');
    putCell(map, 0, 1, 'metal');
    return {
      id: 'optic_swarm_lagrange_bank',
      origin: { x: 224, z: -32 },
      heading: 0,
      cells: sortedCells(map),
    };
  }
  if (arenaId === 'cinder_sluice') {
    // Stone pocket west of the +X current. The door faces the fight.
    stoneRingCells(map, 0, 3, -1, 2);
    map.delete(cellKey(3, 0));
    map.delete(cellKey(3, 1));
    return {
      id: 'optic_swarm_cinder_pocket',
      origin: { x: -320, z: -32 },
      heading: 0,
      cells: sortedCells(map),
    };
  }
  if (arenaId === 'cryo_drift') {
    // The ice island is already the pocket. The fuse points into the hot east.
    wickCells(map, 3, 0, 0);
    return {
      id: 'optic_swarm_cryo_fuse',
      origin: { x: 112, z: 0 },
      heading: 0,
      cells: sortedCells(map),
    };
  }
  if (arenaId === 'storm_lattice') {
    // One closed prism box in the northeast band. A single energy hit fills it.
    murderFieldCells(map, 0, 0, 2, 2);
    stoneRingCells(map, -1, 2, -1, 2);
    return {
      id: 'optic_swarm_storm_field',
      origin: { x: 176, z: 176 },
      heading: 0,
      cells: sortedCells(map),
    };
  }
  return null;
}

export function compileSwarmOptic(arenaId) {
  const layout = swarmOpticLayout(arenaId);
  if (!layout) return null;
  return {
    id: layout.id,
    origin: layout.origin,
    heading: layout.heading,
    bodies: compileOpticCells(layout.cells, OPTIC_LATTICE_SPACING, layout.heading),
  };
}
