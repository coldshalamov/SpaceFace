// Site logistics math — pure functions over cell indices. No state mutation, no DOM.
// Owned by src/systems/asteroidSites.js; unit-tested in test/asteroid-sites.test.mjs.
//
// Locked spine (design/ASTEROID_SITES_BRIEF.md §2): cables and material lanes are two independent
// per-cell overlays; networks are CONNECTED COMPONENTS with aggregated flow (shared inventory +
// a network throughput cap) — belts look alive, the economy never simulates individual chunks.
// Machines conduct both overlays (bolted-together machines share networks without extra track).
import { SITE_BALANCE } from '../data/sites.js';

/** 4-bit connectivity mask (N=1,E=2,S=4,W=8) for auto-tiling. `has` = (col,row)=>bool. */
export function connectivityMask(has, col, row) {
  let mask = 0;
  if (has(col, row - 1)) mask |= 1;
  if (has(col + 1, row)) mask |= 2;
  if (has(col, row + 1)) mask |= 4;
  if (has(col - 1, row)) mask |= 8;
  return mask;
}

/**
 * Connected components over overlayCells ∪ machineCells (4-neighbor).
 * @param {Set<number>} overlayCells - cell indices carrying the overlay
 * @param {Map<number,string>} machineCells - cell index -> machineId (machines conduct)
 * @param {number} cols
 * @returns {Array<{ key:string, cells:number[], overlayCells:number[], machineIds:string[] }>}
 *   sorted by min cell index; component key is 'net<minIdx>' (stable for a fixed topology).
 */
export function buildComponents(overlayCells, machineCells, cols) {
  const all = new Set();
  for (const idx of overlayCells) all.add(idx);
  for (const idx of machineCells.keys()) all.add(idx);
  const seen = new Set();
  const components = [];
  const sorted = [...all].sort((a, b) => a - b);
  for (const start of sorted) {
    if (seen.has(start)) continue;
    const cells = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const idx = queue.pop();
      cells.push(idx);
      const col = idx % cols;
      const neighbors = [idx - cols, idx + cols];
      if (col > 0) neighbors.push(idx - 1);
      if (col < cols - 1) neighbors.push(idx + 1);
      for (const n of neighbors) {
        if (!all.has(n) || seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    cells.sort((a, b) => a - b);
    const machineIds = [];
    const overlayOnly = [];
    for (const idx of cells) {
      if (machineCells.has(idx)) machineIds.push(machineCells.get(idx));
      else overlayOnly.push(idx);
    }
    components.push({
      key: `net${cells[0]}`,
      cells,
      overlayCells: overlayOnly,
      machineIds,
    });
  }
  return components;
}

/** Storage capacity of one lane network: the track IS the buffer, ports add depots. */
export function laneCapacity(component, storeBonusByMachineId, balance = SITE_BALANCE) {
  let cap = balance.laneStoreBase + component.overlayCells.length * balance.laneStorePerCell;
  for (const mid of component.machineIds) {
    cap += Math.max(0, Number(storeBonusByMachineId(mid)) || 0);
  }
  return cap;
}

/** Total units currently held in a store object. */
export function storeTotal(store) {
  let total = 0;
  for (const key of Object.keys(store || {})) total += Math.max(0, Number(store[key]) || 0);
  return total;
}

/**
 * Re-home persisted network stores onto freshly computed components after a topology change.
 * Each old store lands on the new component holding the most of its old cells (merges sum per
 * good). Stock on cells that vanished entirely (network fully dismantled) is lost — dismantling
 * a loaded lane spills its buffer, and the UI warns before that happens.
 * @param {Array<{cells:number[], store:Object}>} prevStores
 * @param {Array<{key:string, cells:number[]}>} components
 * @returns {Object<string,Object>} componentKey -> merged store
 */
export function reconcileStores(prevStores, components) {
  const byKey = {};
  for (const comp of components) byKey[comp.key] = {};
  if (!Array.isArray(prevStores) || !prevStores.length) return byKey;
  const cellToComp = new Map();
  for (const comp of components) {
    for (const idx of comp.cells) cellToComp.set(idx, comp.key);
  }
  for (const prev of prevStores) {
    if (!prev || !prev.store) continue;
    const votes = new Map();
    for (const idx of prev.cells || []) {
      const key = cellToComp.get(idx);
      if (!key) continue;
      votes.set(key, (votes.get(key) || 0) + 1);
    }
    let bestKey = null;
    let bestVotes = 0;
    for (const [key, count] of [...votes.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (count > bestVotes) { bestKey = key; bestVotes = count; }
    }
    if (!bestKey) continue; // every cell gone → stock spilled
    const target = byKey[bestKey];
    for (const goodId of Object.keys(prev.store).sort()) {
      const qty = Math.max(0, Number(prev.store[goodId]) || 0);
      if (qty > 0) target[goodId] = (target[goodId] || 0) + qty;
    }
  }
  return byKey;
}

/** Seeded-stochastic courier loss chance for a route (brief §6: probabilities, not fixed tolls). */
export function podLossChance(dangerIndex, balance = SITE_BALANCE) {
  const danger = Math.max(0, Math.min(1, Number(dangerIndex) || 0));
  return Math.min(balance.podLossCap, balance.podLossBase + danger * balance.podLossPerDanger);
}

/** One-way travel time for a courier pod (s). */
export function podTravelS(dangerIndex, balance = SITE_BALANCE) {
  const danger = Math.max(0, Math.min(1, Number(dangerIndex) || 0));
  return balance.podTravelSBase + danger * balance.podTravelSPerDanger;
}

/**
 * Fleet report math (brief §6): how many pods/min the export stream needs, and the sentence-ready
 * comparison against what the fabricator is actually delivering.
 */
export function fleetEstimate({ exportRatePerMin, podCapacity, podBuildS, podsReady, podTarget }) {
  const need = Math.max(0, Number(exportRatePerMin) || 0) / Math.max(1, podCapacity);
  const supply = podBuildS > 0 ? 60 / podBuildS : 0;
  return {
    podsPerMinNeeded: Math.round(need * 100) / 100,
    podsPerMinBuilt: Math.round(supply * 100) / 100,
    surplusPods: Math.max(0, (podsReady || 0) - Math.max(0, podTarget || 0)),
    starving: need > supply + 1e-9,
  };
}
