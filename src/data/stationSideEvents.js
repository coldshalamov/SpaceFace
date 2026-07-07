// stationSideEvents.js — BP-11 packet A6 "Station Side-Events", PURE DATA + SEEDED PLANNER.
// (See design/revamp/detail/A_sector_station.md packet A6.)
//
// A station has a life that isn't about the player: a hauler eases into dock, a patrol wing
// launches, a repair drone crawls a hull, a cargo tractor tugs a pod. This file is the "what
// could happen at a station today" layer — pure shape defs + a deterministic per-station-day
// planner, mirroring encounters.js + encounterDirector's planEncounters() split. No imports beyond
// core/rng, no state reads, no DOM, no Math.random.
//
// Budget model (packet contract): most side-events are COSMETIC ambient traffic (budget 0 — drawn
// by the graphics lane from the `station:sideEvent` seam, never a counted sim ship). Only a
// launching PATROL is a real spawnBudget client (budget 1, one slot, released when it leaves the
// bubble). The director (stationSideEventDirector.js) enforces this; here budget is just data.
//
// Determinism: the planner draws EXACTLY three floats per item in a fixed order (gap, kind,
// bearing) so a later edit to one field can never reshuffle another's stream; delays are built
// cumulatively so the schedule is constructed already-ascending (no sort — no stable-sort trap).

import { hash32, mulberry32 } from '../core/rng.js';

// Side-event shape catalogue. `affinity: null` = fits any station type. `budget` is the spawnBudget
// cost (0 cosmetic seam, 1 real launched patrol). `path` is a symbolic movement the graphics lane
// resolves against the A2 bubble geometry. `durationS` = how long the mover lives before it leaves.
export const SIDE_EVENTS = Object.freeze({
  hauler_dock:   Object.freeze({ budget: 0, path: 'inbound-to-docking',    durationS: 45, affinity: Object.freeze(['trade_hub', 'refinery', 'fab', 'mining']) }),
  patrol_launch: Object.freeze({ budget: 1, path: 'outbound-past-traffic', durationS: 60, affinity: Object.freeze(['military', 'trade_hub']) }),
  repair_drone:  Object.freeze({ budget: 0, path: 'hull-crawl',            durationS: 90, affinity: null }),
  cargo_tractor: Object.freeze({ budget: 0, path: 'docking-orbit',         durationS: 40, affinity: Object.freeze(['trade_hub', 'mining', 'refinery', 'fab']) }),
});

// Stable id order for the seeded pick (static literal → insertion-order-safe; never Object.keys of
// a runtime-populated map).
export const SIDE_EVENT_IDS = Object.freeze(['hauler_dock', 'patrol_launch', 'repair_drone', 'cargo_tractor']);

const TWO_PI = Math.PI * 2;

/**
 * planStationSideEvents(seed, sectorId, dayIndex, stationId, stationTypeId)
 *   -> Array<{ eventId, kind, budget, path, durationS, delay, bearing }>
 *
 * PURE + deterministic: same (seed, sectorId, dayIndex, stationId) → identical schedule. Filtered
 * by station-type affinity (unknown/typeless station → the universal repair_drone). Missing key
 * parts → [] (never plan a phantom 'undefined' schedule — hash32 joins with '|', so an undefined
 * part would silently hash to a valid-looking key). Delays ascend by construction.
 */
export function planStationSideEvents(seed, sectorId, dayIndex, stationId, stationTypeId) {
  if (sectorId == null || stationId == null) return [];
  const day = dayIndex | 0;
  const rng = mulberry32(hash32(seed == null ? 0 : seed, String(sectorId), day, String(stationId)));

  const typeId = stationTypeId == null ? '' : String(stationTypeId);
  const eligible = SIDE_EVENT_IDS.filter((id) => {
    const aff = SIDE_EVENTS[id].affinity;
    return aff == null || aff.includes(typeId);
  });
  const pool = eligible.length ? eligible : ['repair_drone'];  // typeless/unknown → universal drone

  const count = 3 + Math.floor(rng() * 3);   // 3..5 side-events per station-day
  const out = [];
  let delay = 0;
  for (let i = 0; i < count; i++) {
    // Fixed three-draw vector, fixed order — reshuffle-proof.
    const gapRoll = rng();
    const kindRoll = rng();
    const bearingRoll = rng();
    // First event lands ≤ 90 s (satisfies "a few minutes near a station → ≥1 event"); the rest space out.
    delay += i === 0 ? (20 + gapRoll * 70) : (45 + gapRoll * 90);
    const kind = pool[Math.floor(kindRoll * pool.length) % pool.length];
    const def = SIDE_EVENTS[kind];
    out.push({
      eventId: `sse:${stationId}#${day}#${i}`,
      kind,
      budget: def.budget | 0,
      path: def.path,
      durationS: def.durationS,
      delay: Math.round(delay * 1e3) / 1e3,
      bearing: Math.round(bearingRoll * TWO_PI * 1e6) / 1e6,
    });
  }
  return out;
}

export default { SIDE_EVENTS, SIDE_EVENT_IDS, planStationSideEvents };
