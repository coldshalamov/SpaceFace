// Depth Program K1 — pure presence/service planning for the five new factions.
// Map/UI consumers may read this module without importing a system. It never mutates GameState.

import { SHIPS } from './ships.js';
import { SECTORS } from './sectors.js';
import { hash32, mulberry32 } from '../core/rng.js';
import { sampleFactionBehavior } from './factionDoctrines.js';
import { sectorGlobalOrigin } from './sectorCoordinates.js';

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

const SHIP_IDS = new Set(SHIPS.map((ship) => ship.id));
const STATION_SERVICES = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    STATION_SERVICES.set(station.id, Object.freeze([...(station.services || [])]));
  }
}

export const FULFILLMENT_FIXED_ROUTES = freeze([
  {
    id: 'fulfillment_tethys_helios',
    sectors: ['sector_tethys_junction', 'sector_helios_prime'],
    holdingStations: ['station_tethys', 'station_helios'],
    hulls: ['ship_mule', 'ship_atlas'],
  },
]);

export const FACTION_PRESENCE_NODES = freeze([
  {
    id: 'presence_understory_charon',
    factionId: 'faction_understory',
    label: 'Understory Afterwake',
    kind: 'post_loss_salvager',
    sectorIds: ['sector_charon_expanse'],
    stationIds: ['station_expanse'],
  },
  {
    id: 'presence_fulfillment_route_01',
    factionId: 'faction_fulfillment',
    label: 'Fulfillment Route 01',
    kind: 'fixed_route_convoy',
    sectorIds: ['sector_tethys_junction', 'sector_helios_prime'],
    stationIds: ['station_tethys', 'station_helios'],
  },
  {
    id: 'presence_archive_reading_rooms',
    factionId: 'faction_archive',
    label: 'Archive Reading Rooms',
    kind: 'rep_gated_reading_room',
    sectorIds: ['sector_pallas_drift', 'sector_tethys_junction', 'sector_helios_prime'],
    stationIds: ['station_drift', 'station_tethys', 'station_helios'],
  },
  {
    id: 'presence_pitborn_yards',
    factionId: 'faction_pitborn',
    label: 'Pitborn Yards and Fences',
    kind: 'yard_and_fence',
    sectorIds: ['sector_ashfall_reach', 'sector_vesta_forge', 'sector_ceres_belt'],
    stationIds: ['station_ashcache', 'station_forge', 'station_ceres'],
  },
  {
    id: 'presence_verge_layers',
    factionId: 'faction_verge_layers',
    label: 'Verge Layer Activity',
    kind: 'phase_gated_observer_prism',
    sectorIds: ['sector_veil_nebula', 'sector_ashfall_reach'],
    stationIds: ['station_veil', 'station_ashcache'],
  },
]);

/** Pure additive seam for galaxy-map integration. K1 does not paint the map itself. */
export function mapFactionPresenceNodes({ seed = 1, revocationCount = 0, storyFlags = {} } = {}) {
  return Object.freeze(FACTION_PRESENCE_NODES.map((node) => Object.freeze({
    ...node,
    phase: node.factionId === 'faction_verge_layers'
      ? resolveVergePhase({ seed, revocationCount, storyFlags }).phase
      : 'active',
  })));
}

export function resolveVergePhase({ seed = 1, revocationCount = 0, storyFlags = {} } = {}) {
  const revealed = storyFlags && storyFlags.vergeLayersRevealed === true;
  const revocations = Math.max(0, Math.floor(Number(revocationCount) || 0));
  if (!revealed) return freeze({ phase: 'asleep', observerPrisms: 0, latticeSeed: hash32(seed, 'verge', 'asleep') });
  const awake = storyFlags.vergeAwake === true && storyFlags.valeGatesRevoked === true && revocations > 0;
  const latticeSeed = hash32(seed, 'verge', awake ? 'awake' : 'observer', revocations);
  if (!awake) return freeze({ phase: 'observer', observerPrisms: 1 + (latticeSeed % 2), latticeSeed });
  return freeze({ phase: 'awake', observerPrisms: 3 + (latticeSeed % 2), latticeSeed });
}

function seededPosition(seed, factionId, sectorId, index = 0) {
  const rng = mulberry32(hash32(seed, factionId, sectorId, index, 'k1-presence'));
  const angle = rng() * Math.PI * 2;
  const radius = 420 + rng() * 480;
  const origin = sectorGlobalOrigin(sectorId);
  return Object.freeze({
    x: Math.round((origin.x + Math.cos(angle) * radius) * 1000) / 1000,
    z: Math.round((origin.z + Math.sin(angle) * radius) * 1000) / 1000,
  });
}

function fulfillmentRouteFrame(sectorId, seed, routeId) {
  const origin = sectorGlobalOrigin(sectorId);
  const sign = (hash32(seed, routeId, sectorId, 'route-direction') & 1) ? 1 : -1;
  return freeze({
    start: { x: origin.x - 340 * sign, z: origin.z - 170 },
    end: { x: origin.x + 340 * sign, z: origin.z + 170 },
    periodS: 32,
    spacing: 52,
  });
}

function plan({ factionId, shipDefId, sectorId, seed, index = 0, ...extra }) {
  return freeze({
    factionId,
    shipDefId,
    sectorId,
    pos: seededPosition(seed, factionId, sectorId, index),
    behavior: sampleFactionBehavior(factionId, hash32(seed, sectorId, index), 1)[0],
    ...extra,
  });
}

/**
 * Pure planner. Understory receives explicit loss-ledger rows from the caller and cannot invent a
 * hull. All other hulls are existing SHIPS ids; Verge count/phase derive only from saved inputs.
 */
export function planFactionPresence({
  sectorId,
  seed = 1,
  losses = [],
  storyFlags = {},
  revocationCount = 0,
} = {}) {
  if (!sectorId) return Object.freeze([]);
  const plans = [];

  if (sectorId === 'sector_charon_expanse') {
    const loss = (Array.isArray(losses) ? losses : []).find((row) => row && SHIP_IDS.has(row.shipDefId));
    if (loss) {
      plans.push(plan({
        factionId: 'faction_understory',
        shipDefId: loss.shipDefId,
        sectorId,
        seed,
        lossId: loss.lossId || null,
        passive: true,
        scavenger: true,
        source: 'lossLedgerOnly',
      }));
    }
  }

  const route = FULFILLMENT_FIXED_ROUTES.find((row) => row.sectors.includes(sectorId));
  if (route) {
    const hullIndex = hash32(seed, route.id) % route.hulls.length;
    const frame = fulfillmentRouteFrame(sectorId, seed, route.id);
    const dx = frame.end.x - frame.start.x;
    const dz = frame.end.z - frame.start.z;
    const length = Math.hypot(dx, dz) || 1;
    const px = -dz / length;
    const pz = dx / length;
    for (let formationIndex = 0; formationIndex < 3; formationIndex++) {
      const offset = (formationIndex - 1) * frame.spacing;
      plans.push(plan({
        factionId: 'faction_fulfillment',
        shipDefId: route.hulls[(hullIndex + formationIndex) % route.hulls.length],
        sectorId,
        seed,
        index: 1 + formationIndex,
        pos: freeze({ x: frame.start.x + px * offset, z: frame.start.z + pz * offset }),
        passive: true,
        fixedRoute: true,
        routeId: route.id,
        route: route.sectors,
        routeStart: frame.start,
        routeEnd: frame.end,
        routePeriodS: frame.periodS,
        formation: 'line',
        formationIndex,
        formationCount: 3,
        formationSpacing: frame.spacing,
      }));
    }
  }

  if (sectorId === 'sector_pallas_drift') {
    plans.push(plan({
      // The existing M-slot Drifter is the smallest live hull that can carry the Archive's canon
      // Redaction EMP; the former S-only Pelican could never execute that doctrine.
      factionId: 'faction_archive', shipDefId: 'ship_drifter', sectorId, seed, index: 2,
      passive: true, readingCourier: true,
    }));
  }

  if (['sector_ashfall_reach', 'sector_vesta_forge', 'sector_ceres_belt'].includes(sectorId)) {
    plans.push(plan({
      factionId: 'faction_pitborn', shipDefId: 'ship_ironback', sectorId, seed, index: 3,
      passive: sectorId !== 'sector_ashfall_reach', yardTender: true, disableThenRun: true,
    }));
  }

  if (['sector_veil_nebula', 'sector_ashfall_reach'].includes(sectorId)) {
    const verge = resolveVergePhase({ seed, revocationCount, storyFlags });
    for (let index = 0; index < verge.observerPrisms; index++) {
      plans.push(plan({
        // Ranger is the existing survey hull: its M mounts can carry the canon Revocation EMP,
        // unlike the S-only Wasp placeholder, while retaining a long-range explorer silhouette.
        factionId: 'faction_verge_layers', shipDefId: 'ship_ranger', sectorId, seed, index: 10 + index,
        passive: storyFlags.playerUsedVergeClosureProtocol !== true,
        observerPrism: true, vergePhase: verge.phase,
      }));
    }
  }

  return Object.freeze(plans);
}

export function presenceServiceForStation(stationId, repByFaction = {}) {
  if (['station_drift', 'station_tethys', 'station_helios'].includes(stationId)) {
    const rep = Number(repByFaction.faction_archive) || 0;
    return freeze({
      factionId: 'faction_archive', stationId, services: ['reading_room'],
      available: rep >= 25, requiredRep: 25,
    });
  }
  if (['station_ashcache', 'station_forge', 'station_ceres'].includes(stationId)) {
    const rep = Number(repByFaction.faction_pitborn) || 0;
    const stationServices = STATION_SERVICES.get(stationId) || [];
    const services = [];
    if (stationServices.includes('shipyard')) services.push('yard');
    if (stationServices.includes('trade') || stationServices.includes('black_market')) services.push('fence');
    return freeze({
      factionId: 'faction_pitborn', stationId, services,
      available: rep >= 0, requiredRep: 0,
    });
  }
  if (stationId === 'station_expanse') {
    return freeze({
      factionId: 'faction_understory', stationId, services: ['wreck_buy'], available: true, requiredRep: null,
    });
  }
  return null;
}

export default FACTION_PRESENCE_NODES;
