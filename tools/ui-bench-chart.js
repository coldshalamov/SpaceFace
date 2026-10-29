// ui-bench-chart.js — the chart shots' situation: a real sector, a working field, traffic, a route.
//
// The bench's seeded state names its sector `sector_helios`, which is not a sector: the chart's
// SYSTEM level found no record and drew an empty table, and LOCAL had no one to draw but the
// player. A chart shot (`chart: 'seeded'` in scripts/lib/uiBenchCatalog.mjs) mounts over Helios
// Prime as the game spawns it — the two stations, the starter seam's rocks, a hauler, a patrol,
// a drone, one hunter out past the frame — and borrows the game's own route planner
// (src/systems/world.js computeRoute) so a previewed or plotted line is the line the ship flies.
// Every other shot is left exactly as it was: unseedChartShot() takes all of it back out.

import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const SECTOR = 'sector_helios_prime';
const BENCH_TAG = 'benchChart';
const BENCH_REACH = 'poi_bench_corroborated_reach';

/** Deterministic positions for the starter seam's rocks around its authored centre (720, -260). */
function seamRocks() {
  const rocks = [];
  const cx = 720;
  const cz = -260;
  for (let i = 0; i < 16; i += 1) {
    const a = i * 2.39996; // golden angle: even cover, no clumps
    const r = 36 + Math.sqrt(i / 16) * 210;
    rocks.push({ x: Math.round(cx + Math.cos(a) * r), z: Math.round(cz + Math.sin(a) * r * 0.8), size: 10 + ((i * 7) % 9) });
  }
  return rocks;
}

function contactsFor(sectorId) {
  const home = { homeSectorId: sectorId };
  const rows = [
    {
      type: 'station', team: 0, radius: 90, pos: { x: 1280, z: -420 }, factionId: 'faction_scn',
      data: { ...home, name: 'Helios Station', stationId: 'station_helios', stationTypeId: 'trade_hub', archetypeGlb: 'place_station_trade_hub', dockRadius: 160 },
    },
    {
      type: 'station', team: 0, radius: 70, pos: { x: -920, z: 1080 }, factionId: 'faction_scn',
      data: { ...home, name: 'Coalition HQ', stationId: 'station_coalition', stationTypeId: 'military', archetypeGlb: 'place_station_military', dockRadius: 130 },
    },
    {
      type: 'station', team: 3, radius: 58, pos: { x: 760, z: 740 }, factionId: 'faction_pitborn',
      data: { ...home, name: 'Press Camp', stationId: 'station_bench_press_camp', stationTypeId: 'pirate_camp', archetypeGlb: 'place_station_trade_hub', dockRadius: 112 },
    },
    {
      type: 'ship', team: 0, radius: 16, pos: { x: 470, z: 150 }, vel: { x: 38, z: -22 }, rot: -0.52, factionId: 'faction_mts',
      data: { ...home, name: 'Hauler Mara-7', callsign: 'MARA-7', defId: 'ship_hauler' },
    },
    {
      type: 'ship', team: 1, radius: 14, pos: { x: -300, z: -250 }, vel: { x: 12, z: 30 }, rot: 1.2, factionId: 'faction_scn',
      data: { ...home, name: 'Concord Patrol', callsign: 'VIGIL-2', defId: 'ship_patrol', ai: { lawful: true } },
    },
    {
      type: 'drone', team: 1, radius: 6, pos: { x: 120, z: -60 }, vel: { x: 6, z: 2 }, rot: 0.3, factionId: null,
      data: { ...home, name: 'Survey drone', defId: 'drone_survey' },
    },
    {
      type: 'ship', team: 3, radius: 15, pos: { x: -1900, z: -1350 }, vel: { x: 40, z: 30 }, rot: 0.64, factionId: 'faction_pitborn',
      data: { ...home, name: 'Reaver Corsair', callsign: 'REAVER', defId: 'ship_raider', ai: { huntPlayer: true } },
    },
  ];
  for (const rock of seamRocks()) {
    rows.push({
      type: 'asteroid', team: 0, radius: rock.size, pos: { x: rock.x, z: rock.z }, factionId: null,
      data: { ...home, typeId: 'ast_common_rock' },
    });
  }
  return rows;
}

let seeded = [];
let saved = null;

/** Put the chart's situation on the bench state. Idempotent: a second call reseeds cleanly. */
export function seedChartShot(state, shot) {
  unseedChartShot(state);
  saved = {
    sectorId: state.world.currentSectorId,
    waypointSector: state.nav.waypoint ? state.nav.waypoint.sectorId : undefined,
    route: state.nav.route,
    discovery: state.world.discovery,
    frontierRumors: state.world.frontierRumors,
  };
  state.world.currentSectorId = SECTOR;
  if (state.nav.waypoint) state.nav.waypoint.sectorId = SECTOR;
  // A pilot some hours in has surveyed the charted core; the frontier stays unknown.
  state.world.discovery = {
    ...(state.world.discovery || {}),
    sector_helios_prime: { discovered: true, visited: true },
    sector_ceres_belt: { discovered: true, visited: true },
    sector_tethys_junction: { discovered: true, visited: true },
    sector_vesta_forge: { discovered: true },
    sector_pallas_drift: { discovered: true },
    sector_io_reach: { discovered: true },
    sector_charon_expanse: { discovered: true },
  };
  let id = 9001;
  const hull = state.entities.get(state.playerId);
  if (hull) hull.pos = { x: 0, y: 0, z: 0 };
  for (const row of contactsFor(SECTOR)) {
    const ent = {
      id: id++, alive: true, angVel: 0, rot: 0, vel: { x: 0, y: 0, z: 0 },
      ...row,
      pos: { x: row.pos.x, y: 0, z: row.pos.z },
      vel: row.vel ? { x: row.vel.x, y: 0, z: row.vel.z } : { x: 0, y: 0, z: 0 },
      data: { ...row.data, [BENCH_TAG]: true },
    };
    state.entities.set(ent.id, ent);
    state.entityList.push(ent);
    seeded.push(ent.id);
  }
  // `route: '<sector id>'` plots a course the way ENGAGE ROUTE would find it: the game's planner.
  if (shot && shot.route && benchWorld) {
    const route = benchWorld.computeRoute(shot.route, 'fuel');
    if (route) state.nav.route = route;
  }
  // Three cards on one reach: the corroboration layer draws its inflow arrows into the shared
  // patch. Centers are sector-local, converted to the chart's global frame like a sold card.
  state.world.frontierRumors = { schemaVersion: 1, byId: {}, receipts: [] };
  const rumorSpots = [
    { lx: -500, lz: 240, r: 360 },
    { lx: -320, lz: 330, r: 430 },
    { lx: -390, lz: 170, r: 400 },
  ];
  rumorSpots.forEach((spot, n) => {
    const id = `frontier-rumor:bench:${n}:cache:${BENCH_REACH}`;
    state.world.frontierRumors.byId[id] = {
      id,
      schemaVersion: 1,
      kind: 'cache',
      kindLabel: 'Cache Tally',
      targetId: BENCH_REACH,
      targetName: 'unclaimed cache',
      sectorId: SECTOR,
      sectorName: 'Helios Prime',
      sourceStationId: `station_bench_${n}`,
      sourceSectorId: SECTOR,
      bearingCenter: sectorLocalToGlobalForSector({ x: spot.lx, z: spot.lz }, SECTOR),
      radius: spot.r,
      phase: 'rumored',
      text: 'bench card',
    };
  });
}

/** Take the chart's situation back out, so no other shot sees it. */
export function unseedChartShot(state) {
  if (seeded.length) {
    const gone = new Set(seeded);
    for (const eid of seeded) state.entities.delete(eid);
    state.entityList = state.entityList.filter((e) => !gone.has(e.id));
    seeded = [];
  }
  if (saved) {
    state.world.currentSectorId = saved.sectorId;
    if (state.nav.waypoint) state.nav.waypoint.sectorId = saved.waypointSector;
    state.nav.route = saved.route;
    state.world.discovery = saved.discovery;
    state.world.frontierRumors = saved.frontierRumors;
    saved = null;
  }
}

let benchWorld = null;

/**
 * The game's route planner over the bench state: the real `world` system's computeRoute with the
 * bench state as `this.state` (it reads only discovery, sectors, the drive tier and research).
 * Loaded on first use so no other shot pays for the module.
 */
export async function loadBenchWorld(state) {
  if (benchWorld) return benchWorld;
  const { world } = await import('../src/systems/world.js');
  benchWorld = Object.create(world, { state: { value: state, writable: true } });
  return benchWorld;
}

export function benchWorldFor(shot) {
  return shot && shot.chart ? benchWorld : null;
}
