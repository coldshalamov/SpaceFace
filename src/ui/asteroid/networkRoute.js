import { COLS, ROWS, tileIndex } from '../../systems/drillFieldModel.js';

const CARDINAL = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const cell = idx => ({ col: idx % COLS, row: Math.floor(idx / COLS) });

/** Find an accessible machine seat that can use existing power and material lanes. */
export function findFactoryBay({ drill, projection, defId, canInstall }) {
  if (!drill?.avatar || !projection) return null;
  const adjacentFloor = (networks) => {
    const candidates = new Set();
    for (const net of networks) {
      for (const index of net.cells) {
        const { col, row } = cell(index);
        for (const [dc, dr] of CARDINAL) {
          const c = col + dc;
          const r = row + dr;
          const tile = drill.field?.[c]?.[r];
          if (tile?.type === 'empty' && !tile.structure) candidates.add(tileIndex(c, r));
        }
      }
    }
    return candidates;
  };
  const powered = adjacentFloor(projection.power.filter(net => net.gen > 0));
  const occupied = new Set(projection.machines.map(m => tileIndex(m.col, m.row)));
  const seats = [...adjacentFloor(projection.lanes)]
    .filter(index => powered.has(index) && !occupied.has(index)).map(cell);
  // A dead end makes a better bay than a walkable aisle.
  const openNeighbors = ({ col, row }) => CARDINAL.filter(([dc, dr]) => {
    const c = col + dc;
    const r = row + dr;
    return drill.field?.[c]?.[r]?.type === 'empty' && !occupied.has(tileIndex(c, r));
  }).length;
  const distance = seat => Math.abs(seat.col - drill.avatar.col) + Math.abs(seat.row - drill.avatar.row);
  seats.sort((a, b) => openNeighbors(a) - openNeighbors(b) || distance(a) - distance(b) || a.row - b.row || a.col - b.col);
  return seats.find(({ col, row }) => {
    const check = canInstall({ asteroidId: drill.asteroidId, defId, col, row, preview: true });
    return check?.ok && !check.sealsReturn;
  }) || null;
}

/** Find the fewest new floor tiles between the selected networks. Machines already conduct. */
export function findFactoryRoute(field, projection, { kind, machineId, targetKeys }) {
  const components = kind === 'power' ? projection?.power : projection?.lanes;
  const origin = components?.find(net => net.machineIds.includes(machineId));
  if (!field || !origin) return [];
  const targets = new Set(components.filter(net => targetKeys.includes(net.key) && net !== origin)
    .flatMap(net => net.cells));
  if (!targets.size) return [];
  const conductors = new Set(components.flatMap(net => net.cells));
  const seen = new Set(origin.cells);
  const queue = origin.cells.slice();
  const previous = new Map();
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i];
    const { col, row } = cell(here);
    for (const [dc, dr] of CARDINAL) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
      const next = tileIndex(c, r);
      if (targets.has(next)) {
        const run = [];
        for (let idx = here; previous.has(idx); idx = previous.get(idx)) run.push(cell(idx));
        return run.reverse();
      }
      // A preview marks floor for new track and leaves existing conductors in place.
      const tile = field[c]?.[r];
      if (seen.has(next) || conductors.has(next) || tile?.type !== 'empty' || tile.structure) continue;
      seen.add(next);
      previous.set(next, here);
      queue.push(next);
    }
  }
  return [];
}
