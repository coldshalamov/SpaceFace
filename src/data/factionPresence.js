// Depth Program K1 — pure presence/service planning for the five new factions plus the three
// previously-absent kits (Choir procession, Helix rim audit, Free homestead watch).
// Map/UI consumers may read this module without importing a system. It never mutates GameState.

import { SHIPS } from './ships.js';
import { SECTORS } from './sectors.js';
import { hash32, mulberry32 } from '../core/rng.js';
import { sampleFactionBehavior } from './factionDoctrines.js';
import { FACTION_KITS } from './factions/index.js';
import { sectorGlobalOrigin } from './sectorCoordinates.js';
import { conflictPairsForSector, escalationForConflict } from './conflictZones.js';

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
  {
    id: 'presence_choir_pilgrim_walk',
    factionId: 'faction_choir',
    label: 'Choir Pilgrim Walk',
    kind: 'pilgrim_procession',
    sectorIds: ['sector_vesta_forge'],
    stationIds: ['station_depot3'],
  },
  {
    // The paper faction (fleetClass 'none'): station-only presence, zero ships ever.
    id: 'presence_helix_rim_audit',
    factionId: 'faction_helix',
    label: 'Helix Rim Audit',
    kind: 'rep_gated_audit',
    sectorIds: ['sector_sedna_dark'],
    stationIds: ['station_sedna'],
  },
  {
    id: 'presence_free_homestead_watch',
    factionId: 'faction_free',
    label: 'Free Homestead Watch',
    kind: 'homestead_loiter',
    sectorIds: ['sector_io_reach'],
    stationIds: ['station_reach'],
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

// Conflict garrisons: what the holding faction stages on a hot front. Existing SHIPS hulls only —
// presence plans never invent hulls (the K1 contract).
export const CONFLICT_PRESENCE_HULLS = freeze({
  faction_scn: ['ship_warden', 'ship_hornet'],
  faction_mts: ['ship_hornet', 'ship_atlas'],
  faction_dmc: ['ship_ironback', 'ship_mule'],
  faction_reach: ['ship_drifter', 'ship_hornet'],
  faction_quiet: ['ship_ranger', 'ship_wasp'],
  faction_vael: ['ship_warden', 'ship_hawser'],
});
const CONFLICT_PRESENCE_DEFAULT_HULLS = ['ship_hornet', 'ship_wasp'];

function conflictPlan({ factionId, shipDefId, sectorId, seed, index, pos, pairKey, stage, role, formationIndex = 0, formationCount = 1 }) {
  return freeze({
    factionId,
    shipDefId,
    sectorId,
    seed,
    index,
    pos: freeze({ ...pos }),
    passive: true,
    routeId: `conflict:${pairKey}:${role}`,
    source: 'conflictPresence',
    conflictStage: stage,
    conflictPairKey: pairKey,
    formation: role === 'escort' ? 'line' : null,
    formationIndex,
    formationCount,
    formationSpacing: role === 'escort' ? 52 : null,
    behavior: [],
  });
}

/**
 * Pure planner: war-made-visible presence on contested lanes. Tense fronts stage a picket; war
 * fronts stage a two-hull picket plus a three-ship escort wing — always the sector holder's
 * garrison, so a flipped front re-garrisons with the NEW owner the next time the sector loads.
 * Conflicts input is the factions-owned state.conflicts map; this module never writes it.
 */
export function planConflictPresence({ sectorId, seed = 1, conflicts = null, ownerFactionId = null } = {}) {
  if (!sectorId) return [];
  const plans = [];
  for (const pairKey of conflictPairsForSector(sectorId)) {
    const escalation = escalationForConflict(conflicts && conflicts[pairKey]);
    if (!escalation.pickets && !escalation.escortWing) continue;
    const sides = pairKey.split(':');
    const garrison = ownerFactionId && sides.includes(ownerFactionId)
      ? ownerFactionId
      : sides[0];
    const hulls = CONFLICT_PRESENCE_HULLS[garrison] || CONFLICT_PRESENCE_DEFAULT_HULLS;
    const anchor = seededPosition(seed, `conflict-${pairKey}`, sectorId, 40);
    let slot = 0;
    for (let i = 0; i < escalation.pickets; i++) {
      const angle = hash32(seed, pairKey, sectorId, 'picket', i) / 0x100000000 * Math.PI * 2;
      plans.push(conflictPlan({
        factionId: garrison,
        shipDefId: hulls[i % hulls.length],
        sectorId,
        seed,
        index: 41 + slot,
        pos: {
          x: anchor.x + Math.cos(angle) * 70,
          z: anchor.z + Math.sin(angle) * 70,
        },
        pairKey,
        stage: escalation.stage,
        role: 'picket',
      }));
      slot += 1;
    }
    for (let i = 0; i < escalation.escortWing; i++) {
      const offset = (i - 1) * 52;
      plans.push(conflictPlan({
        factionId: garrison,
        shipDefId: hulls[(i + 1) % hulls.length],
        sectorId,
        seed,
        index: 41 + slot,
        pos: { x: anchor.x + offset, z: anchor.z - 120 },
        pairKey,
        stage: escalation.stage,
        role: 'escort',
        formationIndex: i,
        formationCount: escalation.escortWing,
      }));
      slot += 1;
    }
  }
  return plans;
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

// The Choir procession echoes the Fulfillment route frame but slower and smaller: a liturgical
// walk across Vesta Forge, not a logistics convoy.
const CHOIR_PROCESSION_ROUTE_ID = 'choir_vesta_procession';

function choirProcessionFrame(sectorId, seed, routeId) {
  const origin = sectorGlobalOrigin(sectorId);
  const sign = (hash32(seed, routeId, sectorId, 'procession-direction') & 1) ? 1 : -1;
  return freeze({
    start: { x: origin.x - 220 * sign, z: origin.z - 110 },
    end: { x: origin.x + 220 * sign, z: origin.z + 110 },
    periodS: 56,
    spacing: 40,
  });
}

// K1 hull law: presence plans never invent hulls — every id comes from the faction's own
// shipRoles table in src/data/factions/.
function shipRoleHulls(factionId, role) {
  const kit = FACTION_KITS.find((row) => row.id === factionId);
  const row = kit && Array.isArray(kit.shipRoles)
    ? kit.shipRoles.find((entry) => entry.role === role)
    : null;
  return (row && Array.isArray(row.hullIds)) ? row.hullIds : [];
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
 * hull. All other hulls are existing SHIPS ids drawn from the faction's own shipRoles table;
 * Verge count/phase derive only from saved inputs. The Choir walks a slow two-ship procession in
 * Vesta Forge; the Free Frontier keeps a 1-2 hull homestead watch in Io Reach; Helix is the paper
 * faction and returns ZERO ship plans anywhere — its presence is the Sedna audit desk only.
 * Conflict garrisons (planConflictPresence) ride the same additive seam when the caller passes the
 * factions-owned conflicts map; callers that do not pass conflicts get unchanged output.
 */
export function planFactionPresence({
  sectorId,
  seed = 1,
  losses = [],
  storyFlags = {},
  revocationCount = 0,
  conflicts = null,
  ownerFactionId = null,
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

  if (sectorId === 'sector_vesta_forge') {
    const hulls = shipRoleHulls('faction_choir', 'pilgrim-transport');
    if (hulls.length) {
      const frame = choirProcessionFrame(sectorId, seed, CHOIR_PROCESSION_ROUTE_ID);
      const hullIndex = hash32(seed, CHOIR_PROCESSION_ROUTE_ID) % hulls.length;
      const dx = frame.end.x - frame.start.x;
      const dz = frame.end.z - frame.start.z;
      const length = Math.hypot(dx, dz) || 1;
      const px = -dz / length;
      const pz = dx / length;
      for (let formationIndex = 0; formationIndex < 2; formationIndex++) {
        const offset = (formationIndex - 0.5) * frame.spacing;
        const sampled = sampleFactionBehavior('faction_choir', hash32(seed, sectorId, 4 + formationIndex), 1)[0];
        plans.push(plan({
          factionId: 'faction_choir',
          shipDefId: hulls[(hullIndex + formationIndex) % hulls.length],
          sectorId,
          seed,
          index: 4 + formationIndex,
          pos: freeze({ x: frame.start.x + px * offset, z: frame.start.z + pz * offset }),
          // Pilgrim transports are a peaceful procession: they never fire first (so a player
          // attack flips them defensive like Understory/Archive), and they walk a fixed route
          // (the generic route updater only animates fixedRoute profiles). The doctrine's
          // combat-facing values are otherwise kept as sampled.
          behavior: sampled ? { ...sampled, firstFire: false, fixedRoute: true } : null,
          passive: true,
          fixedRoute: true,
          routeId: CHOIR_PROCESSION_ROUTE_ID,
          route: ['sector_vesta_forge'],
          routeStart: frame.start,
          routeEnd: frame.end,
          routePeriodS: frame.periodS,
          formation: 'line',
          formationIndex,
          formationCount: 2,
          formationSpacing: frame.spacing,
          pilgrimProcession: true,
        }));
      }
    }
  }

  if (sectorId === 'sector_io_reach') {
    const hulls = shipRoleHulls('faction_free', 'homestead-guard');
    const count = hulls.length ? 1 + (hash32(seed, 'free-homestead-watch', sectorId) & 1) : 0;
    for (let index = 0; index < count; index++) {
      plans.push(plan({
        factionId: 'faction_free',
        shipDefId: hulls[index % hulls.length],
        sectorId,
        seed,
        index: 20 + index,
        passive: true,
        homesteadWatch: true,
      }));
    }
  }

  if (conflicts) {
    plans.push(...planConflictPresence({ sectorId, seed, conflicts, ownerFactionId }));
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
  if (stationId === 'station_sedna') {
    // The Helix rim audit gates on standing like the Archive reading room, but low: the
    // Directorate audits everyone's paperwork, it just wants to know yours first.
    const rep = Number(repByFaction.faction_helix) || 0;
    return freeze({
      factionId: 'faction_helix', stationId, services: ['directorate_audit'],
      available: rep >= 15, requiredRep: 15,
    });
  }
  return null;
}

export default FACTION_PRESENCE_NODES;
