// definition.js — Breakwater Spur stable ids, layout, costs and bounds.
// Feature id: breakwaterSpur · save section: world.breakwaterSpur.
// One stable place, one dispatcher, two physical socket originals, one bounded
// freight loop, two persistent commercial charters. No second currencies, no
// timers pretending a ship arrived: every transition comes from a real receipt.

export const BREAKWATER_FEATURE_ID = 'breakwaterSpur';
export const BREAKWATER_SAVE_SECTION = 'world.breakwaterSpur';
export const BREAKWATER_OWNER = 'breakwaterSpur';
export const BREAKWATER_ROW_VERSION = 1;

export const BREAKWATER_SITE_ID = 'site_breakwater_spur';
export const BREAKWATER_SECTOR_ID = 'sector_ceres_belt';
export const BREAKWATER_POI_ID = 'poi_breakwater_spur';

// Placement: the candidate anchor (-900,-1400) sits inside zone_ceres_derelict
// (r 420 centered -840,-1180; rolled salvage wrecks can land on the structure).
// Deterministic clear placement in the same outer industrial pocket: 204 WU
// past the derelict rim, clear of the Solstice lantern, the ambush lane, the
// Hinge Works/Second Measure envelopes, station halos and all lane capsules.
export const BREAKWATER_SITE_LOCAL = Object.freeze({ x: -1250, z: -1650 });
export const BREAKWATER_DISCOVERY_RADIUS = 650;   // approach reveal distance
export const BREAKWATER_SITE_RADIUS = 120;        // own envelope; clear of driller r~42 at 624 WU
export const BREAKWATER_ACTION_RADIUS = 150;      // site action / custody engagement range
export const BREAKWATER_CONTACT_ID = 'contact_breakwater_spur';
export const BREAKWATER_DISPATCHER = 'Nessa Vale';

// ---------------------------------------------------------------------------
// Site structure — open H-shaped loading spur. Every piece is a real released
// industrial place asset admitted through the packagedPropFile route. The two
// side arms form the H uprights, the truss is the crossbar, the cradle is the
// exterior receiving shelf, the work light towers the open bay.
// ---------------------------------------------------------------------------
export const BREAKWATER_STRUCTURE = Object.freeze([
  {
    role: 'arm_port', label: 'Port service arm',
    file: 'places/place_transfer_arm.glb', slot: 'place',
    local: Object.freeze({ x: -30, z: 4 }), rot: 0, radius: 14, mass: 100000,
  },
  {
    role: 'arm_stbd', label: 'Starboard service arm',
    file: 'places/place_transfer_arm.glb', slot: 'place',
    local: Object.freeze({ x: 30, z: 4 }), rot: Math.PI, radius: 14, mass: 100000,
  },
  {
    role: 'crossbar', label: 'Loading truss',
    file: 'places/place_conveyor_truss.glb', slot: 'place',
    local: Object.freeze({ x: 0, z: -16 }), rot: Math.PI / 2, radius: 16, mass: 100000,
  },
  {
    role: 'lamp', label: 'Work light tower',
    file: 'places/place_worklight_tower.glb', slot: 'place',
    local: Object.freeze({ x: 0, z: 14 }), rot: 0, radius: 6, mass: 60000,
  },
  {
    role: 'shelf_drive', label: 'Drive receiving cradle',
    file: 'places/place_ceres_section_cradle.glb', slot: 'place',
    local: Object.freeze({ x: -22, z: -42 }), rot: 0, radius: 18, mass: 100000,
  },
  {
    role: 'shelf_drum', label: 'Drum receiving cradle',
    file: 'places/place_ceres_section_cradle.glb', slot: 'place',
    local: Object.freeze({ x: 22, z: -42 }), rot: 0, radius: 18, mass: 100000,
  },
  {
    role: 'console', label: 'Dispatcher console',
    file: 'places/place_tally_post.glb', slot: 'place',
    local: Object.freeze({ x: 12, z: -30 }), rot: -Math.PI / 4, radius: 3, mass: 40000,
    scannable: true, scanLabel: 'Breakwater dispatcher console',
  },
]);

// Physical socket cradles on the receiving shelf (open, -Z facing approach).
export const BREAKWATER_SOCKETS = Object.freeze({
  drive: Object.freeze({
    id: 'socket_drive', role: 'drive', label: 'Drive socket cradle',
    local: Object.freeze({ x: -22, z: -42 }), radius: 2.5,
    cartridgeRole: 'drive',
  }),
  drum: Object.freeze({
    id: 'socket_drum', role: 'drum', label: 'Drum socket cradle',
    local: Object.freeze({ x: 22, z: -42 }), radius: 2.5,
    cartridgeRole: 'drum',
  }),
});

export const BREAKWATER_SOCKET_IDS = Object.freeze(['drive', 'drum']);

// Seat gate caps — refuse outside a clearance-tested low-speed settle.
export const BREAKWATER_SEAT_CAPS = Object.freeze({
  distWu: 7,          // cartridge center within this of socket center
  speedWuPerS: 4,     // absolute speed cap (structure is fixed)
  yawDeg: 15,
  holdS: 1.5,         // stable-this-long before custody is offered
  clearanceWu: 5,     // no other colliding body this close to the socket
});

// ---------------------------------------------------------------------------
// Original cartridges — two visibly different 18 t originals in one small
// salvage pocket just south of the spur. Ordinary Massline handles the haul.
// ---------------------------------------------------------------------------
export const BREAKWATER_POCKET_LOCAL = Object.freeze({ x: -1150, z: -1900 });

export const BREAKWATER_CARTRIDGES = Object.freeze({
  drive: Object.freeze({
    role: 'drive', label: 'Breaker drive cartridge',
    file: 'places/place_power_skid.glb', slot: 'place',
    pocketLocal: Object.freeze({ x: -1162, z: -1912 }), radius: 6,
    mass: 18, hullMax: 900, socketRole: 'drive',
  }),
  drum: Object.freeze({
    role: 'drum', label: 'Breaker drum cartridge',
    file: 'places/place_ore_bulk_container.glb', slot: 'place',
    pocketLocal: Object.freeze({ x: -1138, z: -1886 }), radius: 6,
    mass: 18, hullMax: 900, socketRole: 'drum',
  }),
});

export const BREAKWATER_POCKET_DRESSING = Object.freeze([
  { file: 'places/place_debris_chunk.glb', slot: 'place', local: { x: -1120, z: -1920 }, rot: .8, radius: 9, mass: 60000, label: 'Salvage drift' },
  { file: 'places/place_container_rack_abandoned.glb', slot: 'place', local: { x: -1178, z: -1868 }, rot: 2.4, radius: 10, mass: 60000, label: 'Abandoned rack' },
]);

// ---------------------------------------------------------------------------
// Loose service loads — at most one exists at a time (freight bound).
// ---------------------------------------------------------------------------
export const BREAKWATER_SUPPLY_LOAD = Object.freeze({
  role: 'supply', label: 'Spur supply cartridge',
  file: 'places/place_cargo_pod_standard.glb', slot: 'place',
  pocketLocal: Object.freeze({ x: -1184, z: -1902 }), radius: 5,
  mass: 18, hullMax: 700,
  stockOnHandoff: Object.freeze({ repair: 18, fuel: 26 }),
});

export const BREAKWATER_CONSIGNMENT = Object.freeze({
  role: 'consignment', label: 'Sealed bonded consignment',
  file: 'places/place_cargo_pod_standard.glb', slot: 'place',
  local: Object.freeze({ x: 0, z: -50 }),   // staged on the receiving shelf
  radius: 5, mass: 18, hullMax: 900,
  destStationId: 'station_beltout',
  destLocal: Object.freeze({ x: 780, z: -940 }),  // Belt Outpost, sector-local
  handoffRadius: 90,                            // within the outpost dock approach
});

// ---------------------------------------------------------------------------
// Hauler + raider for the bounded freight loop.
// ---------------------------------------------------------------------------
export const BREAKWATER_HAULER = Object.freeze({
  defId: 'ship_mule', label: 'Breakwater supply mule',
  // Itinerary origin: inbound leg from the Belt Outpost direction, ~2.4k WU out.
  originLocal: Object.freeze({ x: -1272, z: -2092 }),
  departLocal: Object.freeze({ x: 220, z: -1200 }),
  berthLocal: Object.freeze({ x: 0, z: -62 }),   // hold short of the shelf
  unloadS: 12, loadS: 8, speed: 26,
  despawnDistance: 1500,
});

export const BREAKWATER_RAIDER = Object.freeze({
  enemyTypeId: 'reaver_pirate', level: 2, label: 'Belt-shadow raider',
  spawnLocal: Object.freeze({ x: -700, z: -2100 }),  // from the ambush-lane side
});

// ---------------------------------------------------------------------------
// Progression / charters / jobs.
// ---------------------------------------------------------------------------
export const BREAKWATER_PHASE = Object.freeze({
  DARK: 'dark', SIGNALED: 'signaled', SURVEYED: 'surveyed',
  RESTORING: 'restoring', READY: 'ready', COMMISSIONED: 'commissioned',
  OPERATING: 'operating', DEGRADED: 'degraded', FAILED: 'failed',
});

export const BREAKWATER_COMMISSION_COST = Object.freeze({
  scrap: 4, scrapCmdty: 'cmdty_scrap_metal',
  electronics: 1, electronicsCmdty: 'cmdty_salvage_electronics',
});

export const BREAKWATER_CHARTER = Object.freeze({
  NONE: 'none', COOP: 'cooperative', BONDED: 'bonded',
});

export const BREAKWATER_STOCK = Object.freeze({
  repairCap: 60, fuelCap: 40,
  initialRepair: 10, initialFuel: 8,
});

export const BREAKWATER_COOP_JOBS = Object.freeze({
  scrap: Object.freeze({ id: 'job_coop_scrap', qty: 8, cmdty: 'cmdty_scrap_metal', pay: 90, stock: { repair: 12 } }),
  supply: Object.freeze({ id: 'job_coop_supply', pay: 160 }),
  defend: Object.freeze({ id: 'job_coop_defend', pay: 180 }),
});

export const BREAKWATER_BONDED = Object.freeze({
  bondCr: 100, payCr: 220,
  equivalentJob: Object.freeze({ type: 'cargo_delivery', tier: 'standard', riskTier: 'medium' }),
});

export const BREAKWATER_BOUNDS = Object.freeze({
  receipts: 16, itineraryLog: 12, mapMarkers: 4, offerActions: 8,
});

export const BREAKWATER_CUES = Object.freeze({
  signal: 'sfx_discovery_reveal',
  seat: 'sfx_cargo_seat_whir',
  commission: 'sfx_dock_capture',
  handoff: 'sfx_dock_clunk',
  depart: 'sfx_undock_release',
  work: 'sfx_station_machinery',
});

export const BREAKWATER_OFFER_TTL_S = 20;

export function breakwaterRecordId(role) {
  return `breakwater:${BREAKWATER_SITE_ID}:${role}`;
}

export function breakwaterEntityIdentity(entity) {
  const data = entity && entity.data;
  return data && data.persistenceOwner === BREAKWATER_OWNER && data.worldRecordId
    ? `${data.worldRecordId}#${entity.occupantGeneration || 0}` : null;
}
