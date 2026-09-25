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
 * A walled pocket: the stoneRingCells border with named ring cells knocked out as
 * doors. `doors` is a list of {ix, iz} positions on the border rectangle — each one
 * leaves a single breach, so pick an axis (a fuse tip or a sentry metal usually sits
 * on it). A door key deletes whatever occupies it — name ring cells, not interior.
 */
export function stonePocketCells(map, ix0, ix1, iz0, iz1, doors = []) {
  stoneRingCells(map, ix0, ix1, iz0, iz1);
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    if (d && Number.isInteger(d.ix) && Number.isInteger(d.iz)) map.delete(cellKey(d.ix, d.iz));
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

// ── Stamps past Ceres ───────────────────────────────────────────────────────
// One recipe per site, each pinned where pilots already fight — a gate-camp lane
// and a wreck drift. Every spec carries the zone it was authored against.

export const SKER_GATEMOUTH_WICK_ID = 'optic_sker_gatemouth_wick';
// Gateward rim of zone_sker_gatecamp, on the bearing of the Pallas Drift gate.
export const SKER_GATEMOUTH_WICK_ORIGIN = Object.freeze({ x: 1730, z: -1630 });

/**
 * Reach Gate-Camp, Sker Haven — a gate-mouth fuse, not a gallery. Six diamonds
 * run down the inbound lane (heading 90° lays +ix on +z, so the fuse points into
 * the sector and the mouth at ix=0 faces the Pallas gate). A bolt fired along the
 * lane enters the mouth and walks the whole fuse; the far tip dies into a stone
 * end wall instead of a field. Two jaw mirrors sit exactly on the mouth's rear
 * diagonals, so the mouth's own rear splinters bank back off the jaws.
 */
export function skerGatemouthWickCells() {
  const map = new Map();
  wickCells(map, 6, 0, 0);
  // End wall: the tip's forward and diagonal splinters land in stone, not space.
  putCell(map, 6, -1, 'stone');
  putCell(map, 6, 0, 'stone');
  putCell(map, 6, 1, 'stone');
  // Jaw mirrors on the mouth's rear diagonals — the bank mouth.
  putCell(map, -2, -2, 'metal');
  putCell(map, -2, 2, 'metal');
  return [...map.values()].sort((a, b) => (a.ix - b.ix) || (a.iz - b.iz));
}

export const VESTA_FREIGHTER_POCKET_ID = 'optic_vesta_freighter_pocket';
// Inside zone_vesta_derelict, just off the Dead Freighter hulk toward the Forge.
export const VESTA_FREIGHTER_POCKET_ORIGIN = Object.freeze({ x: 768, z: -1340 });

/**
 * Dead Freighter Drift, Vesta Forge — a wreck-site pocket. A closed stone ring
 * holds a 2×2 diamond field beside the hulk; one door cell opens the +iz wall,
 * and a lone sentry metal sits on the door axis outside the ring. Heading 45°
 * swings the door onto the northwest Forge approach so a bolt through the door
 * lights the pocket, while a splinter escaping the door banks off the sentry.
 * No fuse — this is a closed field with a mouth, the mirror of Ceres.
 */
export function vestaFreighterPocketCells() {
  const map = new Map();
  murderFieldCells(map, 1, 1, 2, 2);
  stonePocketCells(map, 0, 4, 0, 3, [{ ix: 2, iz: 3 }]);
  putCell(map, 2, 4, 'metal');
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

// Each spec binds one recipe to a place pilots already fight: `sectorId` is what
// world.js reads to stamp the lattice; `zoneId` names the authored fight zone the
// stamp was built for (zone record in sectorZones.js / authoredPlaces.js).
export const OPTIC_STRUCTURES = Object.freeze([
  Object.freeze({
    id: CERES_PRISM_GALLERY_ID,
    sectorId: 'sector_ceres_belt',
    zoneId: 'zone_ceres_prism_gallery',
    origin: CERES_PRISM_GALLERY_ORIGIN,
    heading: 0,
    cells: ceresPrismGalleryCells,
  }),
  Object.freeze({
    id: SKER_GATEMOUTH_WICK_ID,
    sectorId: 'sector_sker_haven',
    zoneId: 'zone_sker_gatecamp',
    origin: SKER_GATEMOUTH_WICK_ORIGIN,
    heading: Math.PI / 2,
    cells: skerGatemouthWickCells,
  }),
  Object.freeze({
    id: VESTA_FREIGHTER_POCKET_ID,
    sectorId: 'sector_vesta_forge',
    zoneId: 'zone_vesta_derelict',
    origin: VESTA_FREIGHTER_POCKET_ORIGIN,
    heading: Math.PI / 4,
    cells: vestaFreighterPocketCells,
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

// Per-arena swarm lattices live beside the arena data in ./swarmOpticArenas.js —
// they are room dressing, not sector structures, so they never enter OPTIC_STRUCTURES.
// Re-exported here so existing imports of this module keep working.
export { compileSwarmOptic, swarmOpticLayout } from './swarmOpticArenas.js';
