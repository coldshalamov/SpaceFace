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
 * Numeric-safety ceiling for a single good's quantity in a store. This is NOT a gameplay
 * capacity — capacity limits INTAKE and never destroys stock (see the A10 ruling in
 * previewStoreReconciliation) — it is the bound past which unit arithmetic itself stops being
 * exact. Any legal gameplay quantity is dozens of orders of magnitude below it; reaching it
 * means corrupted input, and the defined overflow result is saturation at this ceiling rather
 * than a silent Infinity in a save file.
 */
export const STORE_NUMERIC_CEILING = Number.MAX_SAFE_INTEGER;

/** The component (from buildComponents) whose cells include `cellIdx`, or null. */
export function componentForCell(components, cellIdx) {
  for (const comp of components) {
    if (comp.cells.includes(cellIdx)) return comp;
  }
  return null;
}

/**
 * The lane component that WOULD own an installation cell after a machine is hypothetically
 * inserted there (machines conduct, so the new cell can bridge lanes). Returns null when no lane
 * would reach the cell — and per the A10 construction ruling, a null here means construction may
 * draw from SHIP CARGO ONLY: a disconnected lane network must never silently fund a build.
 */
export function wouldOwnComponent(overlayCells, machineCells, cols, insertCellIdx) {
  const withInsert = new Map(machineCells);
  if (!withInsert.has(insertCellIdx)) withInsert.set(insertCellIdx, '__hypothetical__');
  const components = buildComponents(overlayCells, withInsert, cols);
  const comp = componentForCell(components, insertCellIdx);
  if (!comp) return null;
  // A component that is ONLY the hypothetical machine itself — standing on NO real lane cell —
  // reaches nothing: that is a disconnected build site, not an owning network. But a machine
  // installed directly ON an isolated painted lane cell IS on a real one-cell network (round-3
  // finding: the length-only guard misread that legitimate case as hypothetical-only).
  if (comp.cells.length === 1 && comp.cells[0] === insertCellIdx && !overlayCells.has(insertCellIdx)) {
    return null;
  }
  return comp;
}

/**
 * NON-MUTATING preflight for a topology change: where every persisted store would land, and
 * exactly what would spill. `reconcileStores` is implemented ON TOP of this so the executed
 * reconciliation can never diverge from the preview a caller confirmed.
 *
 * A10 destructive-removal ruling: a topology change that would spill stock must be REFUSED by
 * the mutation seam (asteroidSites.setOverlay) until the caller explicitly confirms it with this
 * preview in hand; a confirmed loss emits a deterministic receipt. Nothing in this module — and
 * nothing anywhere else — may delete inventory silently.
 *
 * @param {Array<{cells:number[], store:Object}>} prevStores
 * @param {Array<{key:string, cells:number[]}>} components
 * @returns {{ placed: Array<{cells:number[], toKey:string, store:Object}>,
 *             spilled: Array<{cells:number[], store:Object, total:number}>,
 *             spilledTotal: number }}
 */
export function previewStoreReconciliation(prevStores, components) {
  const cellToComp = new Map();
  for (const comp of components) {
    for (const idx of comp.cells) cellToComp.set(idx, comp.key);
  }
  const placed = [];
  const spilled = [];
  let spilledTotal = 0;
  for (const prev of Array.isArray(prevStores) ? prevStores : []) {
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
    if (!bestKey) {
      const total = storeTotal(prev.store);
      if (total > 0) {
        spilled.push({ cells: (prev.cells || []).slice(), store: { ...prev.store }, total });
        spilledTotal += total;
      }
      continue;
    }
    placed.push({ cells: (prev.cells || []).slice(), toKey: bestKey, store: prev.store });
  }
  return { placed, spilled, spilledTotal };
}

/**
 * Re-home persisted network stores onto freshly computed components after a topology change.
 * Each old store lands on the new component holding the most of its old cells; merges SUM per
 * good — a merge is LOSSLESS even when the merged total exceeds the new network's capacity.
 * Over-capacity stock is never clamped or deleted: capacity blocks further INTAKE (production
 * backlogs, deposits refuse) until the excess is drained, and the projection reports the exact
 * over-capacity amount. Stores whose every cell vanished are DROPPED here — which is precisely
 * why the mutation seam must refuse an unconfirmed spilling removal (see
 * previewStoreReconciliation); this executor trusts that the refusal already happened.
 * @param {Array<{cells:number[], store:Object}>} prevStores
 * @param {Array<{key:string, cells:number[]}>} components
 * @returns {Object<string,Object>} componentKey -> merged store
 */
export function reconcileStores(prevStores, components) {
  const byKey = {};
  for (const comp of components) byKey[comp.key] = {};
  const preview = previewStoreReconciliation(prevStores, components);
  for (const placement of preview.placed) {
    const target = byKey[placement.toKey];
    for (const goodId of Object.keys(placement.store).sort()) {
      const qty = Math.max(0, Number(placement.store[goodId]) || 0);
      if (qty > 0) {
        const sum = (target[goodId] || 0) + qty;
        target[goodId] = sum > STORE_NUMERIC_CEILING ? STORE_NUMERIC_CEILING : sum;
      }
    }
  }
  return byKey;
}

/**
 * Exact storage pressure of one lane network — the A10 over-capacity diagnostics contract.
 * `overCapacity` is the amount that must drain before intake resumes; `intakeRoom` is what
 * roomFor()-style intake gating sees. Both are exact, never clamped views of each other.
 */
export function storePressure(component, store, storeBonusByMachineId, balance = SITE_BALANCE) {
  const capacity = laneCapacity(component, storeBonusByMachineId, balance);
  const stored = storeTotal(store);
  return {
    capacity,
    stored,
    overCapacity: Math.max(0, stored - capacity),
    intakeRoom: Math.max(0, capacity - stored),
  };
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
