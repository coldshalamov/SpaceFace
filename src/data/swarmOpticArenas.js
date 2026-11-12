// Optic lattices for live swarm rooms — one recipe per arena, stamped player-relative
// at wave 1 by swarmArena._syncOpticLattice.
//
// These are ARENA dressing, not sector structures: nothing here goes into
// OPTIC_STRUCTURES (the Ceres gallery registry in opticStructures.js). The cell
// grammar is the same — wickCells / murderFieldCells / stoneRingCells expand a
// recipe on the shared 64-unit lattice, and compileOpticCells turns it into
// bodies — so stone still absorbs, metal still reflects, and a diamond still
// throws its eight splinters once per shot.

import { OPTIC_LATTICE_SPACING } from '../combat/opticField.js';
import {
  compileOpticCells,
  murderFieldCells,
  stoneRingCells,
  wickCells,
} from './opticStructures.js';

function cellKey(ix, iz) {
  return `${ix},${iz}`;
}

function putCell(map, ix, iz, material) {
  const key = cellKey(ix, iz);
  if (map.has(key)) return false;
  map.set(key, { ix, iz, material });
  return true;
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
