export const faction = {
  id: 'faction_fulfillment', name: 'The Fulfillment', short: 'Fulfillment', color: '#F0F0E8',
  personality: 'clinical_automaton', startingRep: 0,
  homeSectors: [],
  controls: ['fixed shipping routes', 'holding-pattern waypoints', 'administrative boarding'],
  fleetClass: 'automaton', aggression: 0.2,
  relations: {
    faction_scn: 0.0, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.0,
    faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0,
    faction_helix: 0.0, faction_understory: 0.0, faction_archive: 0.0,
    faction_pitborn: 0.0, faction_verge_layers: 0.0,
  },
  palette: {
    primary: '#F0F0E8', secondary: '#C0C8C8', accent: '#40B8E0',
    hull: '#D8D8D0', emissive: '#40B8E0', thruster: '#A0E0F0',
  },
  shipRoles: [
    { role: 're-router-hauler', weight: 0.6, hullIds: ['ship_mule', 'ship_pelican', 'ship_atlas'] },
    { role: 'escort-frigate', weight: 0.2, hullIds: ['ship_bastion', 'ship_warden'] },
    { role: 'routing-clerk-capital', weight: 0.1, hullIds: ['ship_colossus', 'ship_leviathan'] },
    { role: 'boarding-pod', weight: 0.1, hullIds: ['ship_kestrel'], source: 'pod' },
  ],
  illegalCommodities: [],
  custom: {
    interdictsAndBoards: true,
    neverFiresFirst: true,
    fliesFixedRoutesOnly: true,
    boardingIsAdministrativeRoutingEvent: true,
    repStartsNeutralCannotImprove: true,
    hitchhikeable: true,          // E-25: latching a hauler rides its route
    derailSpillsBackordered: true,// E-24: decades-old goods are the loot pinata
    repairsInstantlyUntilDerailed: true,
  },
  voiceRegister: 'administrative-automaton',
};

// ── W-FULFILLMENT (build_map §34.5 row 518, expansion bible 02 §11) ─────────────────────
// Trains: fixed routes, constant speed, no deviation, never the first to fire — moving
// terrain with perfect predictability. The runtime owner is
// src/systems/faction_fulfillment.js (manifest id 'fulfillmentRoutes').

export const FULFILLMENT_ROUTES = Object.freeze({
  // Fixed waypoint loops. A train's motion is pinned to the leg line — it never deviates.
  routes: Object.freeze({
    route_eunomia_ledger: Object.freeze({
      id: 'route_eunomia_ledger', sectorId: 'sector_eunomia_gulf', speed: 42, loop: true,
      waypoints: Object.freeze([
        Object.freeze({ x: -2200, z: -400 }), Object.freeze({ x: 0, z: -1600 }),
        Object.freeze({ x: 2400, z: -200 }), Object.freeze({ x: 600, z: 1800 }),
        Object.freeze({ x: -1800, z: 1400 }),
      ]),
    }),
    route_charon_spine: Object.freeze({
      id: 'route_charon_spine', sectorId: 'sector_charon_expanse', speed: 38, loop: true,
      waypoints: Object.freeze([
        Object.freeze({ x: -1600, z: 1200 }), Object.freeze({ x: 800, z: -1400 }),
        Object.freeze({ x: 2600, z: 800 }), Object.freeze({ x: -400, z: 2200 }),
      ]),
    }),
    route_clerk_capital: Object.freeze({
      // The Clerk's route — Order #0000001 rides this train (E-20).
      id: 'route_clerk_capital', sectorId: 'sector_ashfall_reach', speed: 26, loop: true,
      waypoints: Object.freeze([
        Object.freeze({ x: -3000, z: 0 }), Object.freeze({ x: 0, z: -2200 }),
        Object.freeze({ x: 3000, z: 0 }), Object.freeze({ x: 0, z: 2200 }),
      ]),
    }),
  }),
  arriveRadius: 40,
  // Off-line drift is corrected toward the leg line every tick — trains never deviate.
  lineLockStrength: 0.9,
});

// E-24 Derailment: enough mass off the line spills decades-old backordered goods.
export const FULFILLMENT_DERAIL = Object.freeze({
  impactMassMin: 60,        // tonnes of incoming mass needed to knock a train off the line
  impactSpeedMin: 18,       // and this closing speed
  spillPodsMin: 4,
  spillPodsMax: 9,
  spillScatterR: 160,
  spillSpeed: 26,
  rerailWithEscortS: 14,    // escorts never fire first, but they do re-rail it
  rerailAloneS: 45,
  escortScanR: 2400,
  goodRarity: 'Backordered', // 08 §2 rarity — the game's best loot pinata
});

// E-25 Hitchhike: latch a re-router and ride it across the sector. Free travel.
export const FULFILLMENT_HITCHHIKE = Object.freeze({
  id: 'E-25',
  boardLine: 'Unscheduled passenger noted. Your patience has been noted.',
  alightLine: 'Passenger served. Thank you for riding the route.',
});

// E-19 Administrative Boarding: a white pod reroutes your cargo to an open order.
export const FULFILLMENT_BOARDING = Object.freeze({
  id: 'E-19',
  podSpeed: 55,
  dockRadius: 26,
  filingTimeS: 6,
  flingSpeed: 70,           // faster than this and the pod has been thrown off
  cargoUnitsFiled: 6,       // units it files away into an open order
  approachLine: 'Administrative boarding. Your cargo is being rerouted to an open order.',
  filedLine: 'Cargo filed. It can be recovered at the order address.',
  flungLine: 'Boarding pod detached. The reroute request lapses.',
});

// E-20 Order #0000001: the oldest open order — one crate to the Pit, fourteen years
// failing verification. The crate is a recycler service kit. Sump gets a new broom.
export const FULFILLMENT_ORDER_ONE = Object.freeze({
  seq: 1,
  item: 'recycler_service_kit',
  itemLabel: 'Recycler Service Kit',
  destination: 'the Pit',
  addressee: 'Sump',
  failedYears: 14,
  closeLine: 'LOG: ticket 0000001 CLOSED — delivered by hand. The air does not change.',
  payoffLine: "Sump's broom arrives. Fourteen years of patience, swept.",
});

/** Seven-digit order label — '#0000001'. */
export function fulfillmentOrderLabel(seq) {
  return `#${String(Math.max(0, Math.floor(Number(seq) || 0))).padStart(7, '0')}`;
}

export const FULFILLMENT_BARKS = Object.freeze({
  route: 'Your order is important to us.',
  derail: 'Address verification failed. Rerouting.',
  rerail: 'Service restored. Thank you for your patience.',
  patience: 'Your patience has been noted for fourteen years.',
  boarding: 'Administrative boarding in progress. Do not alarm the cargo.',
});

export default faction;
