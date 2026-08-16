// Plan 18 — the four missing working civilian identities.
//
// These are authored island residents, not additions to the ambient role lottery. Traffic owns
// materialization, npcJobsRuntime owns their route clocks/intents, Flight V3 + Rapier own motion,
// and combat's attachment service owns the tug's physical line. Positions are Helios-local and are
// converted by traffic at the production seam.

export const CIVILIAN_CAST_SECTOR_ID = 'sector_helios_prime';
export const CIVILIAN_CAST_TOW_PAYLOAD_ID = 'helios_yard_recovery_hulk';

// Plan 07: Helios is the second complete living-world island after Ceres. These stable actor ids
// are data, while traffic remains the sole owner of their jobs, manifest custody, and handoff.
export const HELIOS_LIVING_CHAIN = Object.freeze({
  schema: 'spaceface.heliosLivingChain.v1',
  id: 'helios-starter-belt-living-chain',
  sectorId: CIVILIAN_CAST_SECTOR_ID,
  minerHomeStationId: 'station_helios',
  destinationStationId: 'station_coalition',
  minerCastId: 'helios_belt_chain_miner',
  haulerCastId: 'helios_belt_chain_hauler',
  patrolCastId: 'helios_belt_chain_patrol',
  transferRangeWU: 72,
  handoffHoldS: 2.5,
  haulerCapacityU: 24,
});

const WHITE_ORANGE_RESCUE = Object.freeze({
  version: 1,
  hullColor: '#f2efe7',
  accentColor: '#ff7417',
  finish: 'satin',
  wear: 0.12,
  decalId: 'concord',
});

export const RESCUE_PRIORITY_APPEARANCE = WHITE_ORANGE_RESCUE;

const INDUSTRIAL_TUG = Object.freeze({
  version: 1,
  hullColor: '#59636b',
  accentColor: '#f59d28',
  finish: 'worn',
  wear: 0.48,
  decalId: 'industrial',
});

const PRESS_DRONE = Object.freeze({
  version: 1,
  hullColor: '#e8ebef',
  accentColor: '#317dd6',
  finish: 'polished',
  wear: 0.08,
  decalId: 'concord',
});

const TOURIST_LINER = Object.freeze({
  version: 1,
  hullColor: '#f4e7bd',
  accentColor: '#2fc6d1',
  finish: 'polished',
  wear: 0.06,
  decalId: 'none',
});

const PILGRIM_LIVERY = Object.freeze({
  version: 1,
  hullColor: '#352d4c',
  accentColor: '#ffb13b',
  finish: 'satin',
  wear: 0.24,
  decalId: 'frontier',
});

function mark(id, x, z, label) {
  return Object.freeze({ id, pos: Object.freeze({ x, z }), label });
}

function cast(def) {
  return Object.freeze({
    ...def,
    spawnLocal: Object.freeze({ ...def.spawnLocal }),
    appearance: def.appearance,
    route: Object.freeze(def.route.map((row) => Object.freeze({
      ...row,
      pos: Object.freeze({ ...row.pos }),
    }))),
  });
}

const PILGRIM_ROUTE = Object.freeze([
  mark('pilgrim_departure', 1180, -330, 'Assembly at Helios'),
  mark('pilgrim_candle_fleet', 1640, -790, 'Candle Fleet Vigil'),
  mark('pilgrim_return', 1120, -250, 'Return Procession'),
]);

export const HELIOS_LIVING_CHAIN_CAST = Object.freeze([
  cast({
    id: HELIOS_LIVING_CHAIN.minerCastId,
    role: 'miner',
    livingChainRole: 'miner',
    label: 'Starter Belt Miner · RILL NINE',
    ship: 'ship_pelican',
    factionId: 'faction_scn',
    worldRecordSlotId: 'helios:civilian:living-chain-miner',
    jobKind: 'miner',
    speed: 30,
    workS: 7,
    spawnLocal: { x: 760, z: -235 },
    appearance: INDUSTRIAL_TUG,
    route: [
      mark('home:station_helios', 1280, -420, 'Helios Ore Intake'),
      mark('helios_living_seam', 720, -260, 'Starter Belt Working Face'),
    ],
    scanLabel: 'BELT MINER · RILL NINE · CUTTING STARTER IRON',
    playerUse: 'The cut becomes a physical handoff pod before any hauler can claim it.',
  }),
  cast({
    id: HELIOS_LIVING_CHAIN.haulerCastId,
    role: 'hauler',
    livingChainRole: 'hauler',
    label: 'Ore Shuttle · COPPER WAKE',
    ship: 'ship_mule',
    factionId: 'faction_scn',
    worldRecordSlotId: 'helios:civilian:living-chain-hauler',
    // The empty shuttle flies a small staging beat until traffic leases it for the real rendezvous;
    // after custody changes hands, traffic commissions the ordinary hauler route to Coalition.
    jobKind: 'patrol',
    speed: 34,
    dwellS: 5,
    spawnLocal: { x: 1010, z: -120 },
    appearance: INDUSTRIAL_TUG,
    route: [
      mark('helios_hauler_staging_a', 1010, -120, 'Belt Shuttle Standby'),
      mark('helios_hauler_staging_b', 1090, -250, 'Belt Shuttle Turn'),
    ],
    scanLabel: 'ORE SHUTTLE · EMPTY · STARTER BELT STANDBY',
    playerUse: 'Its hard braking and open hold announce the cargo handoff before the route burn.',
  }),
  cast({
    id: HELIOS_LIVING_CHAIN.patrolCastId,
    role: 'patrol',
    livingChainRole: 'patrol',
    label: 'Helios Belt Watch · LANTERN TWO',
    ship: 'ship_wasp',
    factionId: 'faction_scn',
    worldRecordSlotId: 'helios:civilian:living-chain-patrol',
    jobKind: 'patrol',
    lawful: true,
    speed: 44,
    // LANTERN TWO begins on the station watch and remains readable there through the first ore
    // handoff. Law can therefore dispatch the already-visible hull instead of inventing a reserve.
    dwellS: 75,
    spawnLocal: { x: 1240, z: -460 },
    appearance: WHITE_ORANGE_RESCUE,
    route: [
      mark('helios_watch_station', 1280, -420, 'Helios Approach Watch'),
      mark('helios_watch_belt', 860, -430, 'Starter Belt Watch'),
      mark('helios_watch_lane', 1110, -330, 'Ore Lane Watch'),
    ],
    scanLabel: 'BELT WATCH · LAWFUL PATROL · ORE LANE',
    playerUse: 'Piracy inside the watched lane pulls this exact patrol off its loop.',
  }),
]);

export const HELIOS_CIVILIAN_CAST = Object.freeze([
  cast({
    id: 'helios_recovery_tug',
    role: 'tug',
    label: 'Recovery Tug · TIDELINE',
    ship: 'ship_pelican',
    factionId: 'faction_scn',
    worldRecordSlotId: 'helios:civilian:recovery-tug',
    jobKind: 'patrol',
    speed: 34,
    dwellS: 4,
    spawnLocal: { x: -1660, z: -1180 },
    appearance: INDUSTRIAL_TUG,
    route: [
      mark('tug_pickup', -1710, -1210, 'Outer Yard Tow Pickup'),
      mark('tug_drop', -760, 720, 'Coalition Salvage Drop'),
    ],
    scanLabel: 'RECOVERY TUG · MASSLINE TOW · CUTTABLE CUSTODY',
    playerUse: 'Destroy or separate the tug to take over the still-physical tow.',
  }),
  cast({
    id: 'helios_news_observer',
    role: 'news_drone',
    label: 'Helios Public News Drone',
    ship: 'ship_kestrel',
    factionId: 'faction_scn',
    worldRecordSlotId: 'helios:civilian:news-observer',
    jobKind: 'patrol',
    speed: 40,
    dwellS: 14,
    spawnLocal: { x: -1490, z: -1070 },
    appearance: PRESS_DRONE,
    route: [
      mark('news_yard_watch', -1510, -1080, 'Outer Yard Watch'),
      mark('news_tow_lane', -1130, -390, 'Recovery Lane Watch'),
    ],
    scanLabel: 'NEWS DRONE · PRE-EVENT WATCH · OUTER YARD',
    playerUse: 'Its parked camera posture forecasts the recovery tow before the line moves.',
  }),
  cast({
    id: 'helios_scenic_liner',
    role: 'tourist_liner',
    label: 'Sunward Scenic Liner',
    ship: 'ship_mule',
    factionId: 'faction_free',
    worldRecordSlotId: 'helios:civilian:scenic-liner',
    jobKind: 'surveyor',
    speed: 46,
    workS: 6,
    spawnLocal: { x: 1230, z: -350 },
    appearance: TOURIST_LINER,
    route: [
      mark('tour_helios', 1280, -420, 'Helios Embarkation'),
      mark('tour_candle_fleet', 1680, -820, 'Candle Fleet Overlook'),
      mark('tour_coalition', -920, 1080, 'Coalition Citadel Pass'),
      mark('tour_starter_belt', 720, -260, 'Starter Belt Panorama'),
    ],
    scanLabel: 'SCENIC LINER · CANDLE FLEET LOOP · 186 SOULS',
    playerUse: 'A large civilian loss ejects survivor pods; an escort can keep the route intact.',
  }),
  ...[-34, 0, 34].map((offset, index) => cast({
    id: `helios_pilgrim_${index + 1}`,
    role: 'pilgrim',
    label: index === 0 ? 'Candle Procession Lead' : `Candle Procession ${index + 1}`,
    ship: index === 0 ? 'ship_ranger' : 'ship_drifter',
    factionId: 'faction_choir',
    worldRecordSlotId: `helios:civilian:pilgrim-${index + 1}`,
    jobKind: 'patrol',
    speed: 26,
    dwellS: 8,
    spawnLocal: { x: 1180, z: -330 + offset },
    appearance: PILGRIM_LIVERY,
    route: PILGRIM_ROUTE.map((row) => ({
      ...row,
      pos: { x: row.pos.x, z: row.pos.z + offset },
    })),
    processionIndex: index,
    scanLabel: `CANDLE PROCESSION ${index + 1}/3 · LANTERN LIVERY · MEMORIAL BOUND`,
    playerUse: 'The matched slow procession can be escorted as a single vulnerable group.',
  })),
]);

const ALL_HELIOS_CIVILIAN_CAST = Object.freeze([
  ...HELIOS_CIVILIAN_CAST,
  ...HELIOS_LIVING_CHAIN_CAST,
]);

export const HELIOS_CIVILIAN_CAST_BY_ID = new Map(
  ALL_HELIOS_CIVILIAN_CAST.map((entry) => [entry.id, entry]),
);

export function castDefinitionForWorldRecord(seed, stableRecordId) {
  if (typeof stableRecordId !== 'function') return [];
  return ALL_HELIOS_CIVILIAN_CAST.map((entry) => ({
    definition: entry,
    worldRecordId: stableRecordId(
      seed,
      CIVILIAN_CAST_SECTOR_ID,
      'convoy',
      entry.worldRecordSlotId,
    ),
  }));
}

export function localCastRouteToGlobal(definition, localToGlobal) {
  if (!definition || typeof localToGlobal !== 'function') return [];
  return definition.route.map((row) => ({
    id: row.id,
    label: row.label,
    pos: localToGlobal(row.pos),
  }));
}
