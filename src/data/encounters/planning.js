// Pure deterministic encounter composition helpers shared by the simulation owner and the
// presentation decode-warm path. This module accepts a shape record; it never imports the full
// encounter catalogue, so presentation can plan warm rosters from its generated data-only view.

import { hash32, mulberry32 } from '../../core/rng.js';
import { globalToSectorLocalForSector, sectorLocalToGlobalForSector } from '../sectorCoordinates.js';
import { zonesForSector, zoneThreat } from '../sectorZones.js';
import { SECTORS } from '../sectors.js';
import { ENEMY_TYPES } from '../enemies.js';
import { effectiveRegionalSecurity } from '../../systems/regionalEcology.js';

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((entry) => [entry.id, entry]));
const DAY_SECONDS = 600;

// A hostile sitting on a non-fighting player resolves after this sim-time interval.
export const PURSUIT_RESOLVE_S = 60;

function isSelfRegistered(encounterIds, id) {
  return !!encounterIds && typeof encounterIds.has === 'function' && encounterIds.has(id);
}

/** Resolve one encounter shape on a chosen zone into a schedule item. */
export function planEncounterShape(enc, zone, sectorId, dayIndex, seq, rng, {
  selfRegisteredEncounterIds = null,
  namedCaptains = [],
} = {}) {
  return resolveEncounter(enc, zone, sectorId, dayIndex, seq, rng, {
    selfRegisteredEncounterIds,
    namedCaptains,
  });
}

/** Shared lower-level entry for the sim director's other planner callers. */
export function resolveEncounterShape(enc, zone, sectorId, dayIndex, seq, rng, options = {}) {
  return planEncounterShape(enc, zone, sectorId, dayIndex, seq, rng, options);
}

/**
 * Plan a requestAuthoredEncounter payload using the supplied shape lookup. The simulation
 * passes its canonical catalogue; presentation passes the generated data-only metadata view.
 */
export function planAuthoredEncounterItem({
  state,
  payload,
  playerPos,
  encounters,
  selfRegisteredEncounterIds = null,
  namedCaptains = [],
}) {
  const shape = encounters && encounters[payload && payload.shapeId];
  if (!shape) return null;
  const requestedZone = payload.zoneId
    ? zonesForSector(payload.sectorId).find((candidate) => candidate.id === payload.zoneId)
    : null;
  const anchor = payload.anchor
    || (requestedZone && sectorLocalToGlobalForSector(requestedZone.center, payload.sectorId))
    || playerPos
    || { x: 0, z: 0 };
  const local = globalToSectorLocalForSector(anchor, payload.sectorId);
  const zone = {
    ...(requestedZone || {}),
    id: payload.zoneId || (requestedZone && requestedZone.id) || `authored:${shape.id}`,
    name: payload.zoneName || (requestedZone && requestedZone.name) || shape.title || shape.id,
    type: payload.zoneType || (requestedZone && requestedZone.type)
      || (shape.zoneTypes && shape.zoneTypes[0]) || 'authored',
    center: { x: local.x, z: local.z },
    radius: Math.max(80, Number(payload.zoneRadius) || (requestedZone && requestedZone.radius) || 520),
    threat: Number.isFinite(payload.threat)
      ? payload.threat
      : (Number.isFinite(requestedZone && requestedZone.threat) ? requestedZone.threat : 1),
  };
  const rng = mulberry32(hash32(
    (state.meta && state.meta.seed) || 0,
    payload.encounterId,
    shape.id,
    'authored-encounter',
  ));
  const item = planEncounterShape(
    shape,
    zone,
    payload.sectorId,
    Math.floor((state.simTime || 0) / DAY_SECONDS),
    0,
    rng,
    { selfRegisteredEncounterIds, namedCaptains },
  );
  if (!item) return null;
  return { item, zone, anchor };
}

/** The deterministic plan a unique-wreck complication's fire resolves. */
export function planUniqueWreckEncounter({
  programSeed,
  def,
  bearing,
  complication,
  sectorId,
  simTime,
  shape,
  selfRegisteredEncounterIds = null,
  namedCaptains = [],
}) {
  const center = globalToSectorLocalForSector(copyPoint(complication.anchor || bearing.exactPos), sectorId);
  const rng = mulberry32(hash32(
    programSeed,
    def.id,
    complication.encounterId,
    'unique-wreck-direct-encounter:v1',
  ) || 1);
  const zone = {
    id: `unique-wreck-zone:${def.id}`,
    name: def.name,
    type: 'unique_wreck',
    center,
    radius: 520,
    threat: def.programSlot === 'D6' ? 4 : 3,
    factionId: def.factionId,
  };
  return planEncounterShape(
    shape,
    zone,
    sectorId,
    Math.floor(Math.max(0, finite(simTime, 0)) / DAY_SECONDS),
    0,
    rng,
    { selfRegisteredEncounterIds, namedCaptains },
  );
}

// Static sector baseline plus the same regional fold used by the simulation planner.
export function sectorSecurityOf(state) {
  const sid = state.world && state.world.currentSectorId;
  if (!sid) return 0.5;
  const def = SECTORS.find((sector) => sector.id === sid);
  const baseline = def && Number.isFinite(def.security) ? def.security : 0.5;
  return effectiveRegionalSecurity(state, sid, baseline);
}

function resolveEncounter(enc, zone, sectorId, dayIndex, seq, rng, {
  selfRegisteredEncounterIds,
  namedCaptains,
}) {
  const squadId = `enc_${sectorId}_${dayIndex}_${enc.id}_${seq}`;
  const levelBand = zoneLevelBand(zone);
  const globalZone = {
    ...zone,
    center: sectorLocalToGlobalForSector(zone.center, sectorId),
  };
  const ships = [];
  const localCivilian = enc.deck === 'civilian' && (enc.script === 'convoy' || enc.script === 'traderRun');
  let factionId = (localCivilian && zone.factionId) ? zone.factionId : enc.factionId;
  let variantKind = null;

  if (enc.variant === 'distress') {
    const secDefForDistress = SECTORS.find((sector) => sector.id === sectorId);
    const secForDistress = secDefForDistress && Number.isFinite(secDefForDistress.security)
      ? secDefForDistress.security : 0.5;
    let genuine = rng() < (Number.isFinite(enc.genuineChance) ? enc.genuineChance : 0.6);
    if (secForDistress >= 0.85) genuine = true;
    const branch = genuine ? enc.genuine : enc.bait;
    factionId = branch.factionId;
    variantKind = genuine ? 'distress_genuine' : 'distress_bait';
    addEncounterSquad(ships, branch.squad, branch.factionId, branch.context, globalZone, levelBand, rng, genuine ? 'victim' : 'bait');
    if (genuine && branch.threat) {
      addEncounterSquad(ships, branch.threat, branch.threat.factionId, branch.threat.context, globalZone, levelBand, rng, 'threat');
    }
  } else if (enc.script === 'namedHunter') {
    // Composition is resolved at fire time from the live named-captain roster (grudges evolve).
  } else {
    const authoredPredation = (enc.civilian && enc.squad)
      || (enc.script === 'convoy' && enc.predation && enc.predation.enabled === true && enc.civilian);
    if (authoredPredation) {
      addEncounterSquad(
        ships,
        enc.civilian,
        enc.civilian.factionId || zone.factionId || 'faction_free',
        enc.civilian.context || 'civilian',
        globalZone,
        levelBand,
        rng,
        enc.predation?.carrierRole || 'hauler',
      );
      addEncounterSquad(
        ships,
        enc.squad,
        factionId,
        enc.context,
        globalZone,
        levelBand,
        rng,
        enc.predation?.raiderRole || 'raider',
      );
    } else {
      const mainRole = (enc.script === 'convoy' || enc.script === 'traderRun') ? 'hauler' : 'squad';
      addEncounterSquad(ships, enc.squad, factionId, enc.context, globalZone, levelBand, rng, mainRole);
    }
    if (enc.escort) addEncounterSquad(ships, enc.escort, enc.escort.factionId, enc.escort.context || 'patrol', globalZone, levelBand, rng, 'escort');
  }

  return {
    encounterId: squadId,
    shapeId: enc.id,
    script: isSelfRegistered(selfRegisteredEncounterIds, enc.id) ? (enc.fallbackScript || 'whisper') : enc.script,
    tier: enc.tier,
    deck: enc.deck,
    squadId,
    zoneId: zone.id,
    zoneName: zone.name,
    zoneType: zone.type || null,
    zoneCenter: { x: globalZone.center.x, z: globalZone.center.z },
    zoneRadius: zone.radius || 400,
    factionId,
    bark: enc.bark,
    motive: enc.motive || null,
    engagementTrigger: enc.engagementTrigger || null,
    variantKind,
    levelBand,
    delay: 0,
    ships,
    warmAssets: Array.isArray(enc.warmAssets) && enc.warmAssets.length ? enc.warmAssets.slice() : null,
    warmShips: enc.script === 'namedHunter'
      ? (namedCaptains || []).flatMap((cap) => [cap.archetype, ...((cap.escort && cap.escort.archetypes) || [])])
        .filter((archetype, index, all) => typeof archetype === 'string' && archetype && all.indexOf(archetype) === index)
        .map((archetype) => ({ archetype, factionId, role: 'captain' }))
      : (enc.claimVictim && typeof enc.claimVictim.archetype === 'string' && enc.claimVictim.archetype
        ? [{
          archetype: enc.claimVictim.archetype,
          factionId: enc.claimVictim.factionId || 'faction_dmc',
          role: 'claim',
        }]
        : null),
    terrain: enc.squad && enc.squad.terrain === 'lee' ? 'lee' : null,
    predation: enc.predation && enc.predation.enabled === true
      ? { ...enc.predation }
      : null,
  };
}

export function addEncounterSquad(ships, squad, factionId, context, zone, levelBand, rng, role) {
  if (!squad || !squad.archetypes || !squad.archetypes.length) return;
  const [lo, hi] = Array.isArray(squad.size) && squad.size.length === 2 ? squad.size : [1, 2];
  const n = Math.max(1, Math.round(lo + rng() * Math.max(0, hi - lo)));
  const hasIdentityAnchor = typeof squad.anchorArchetype === 'string' && squad.anchorArchetype.length > 0;
  const clusterR = Number.isFinite(squad.clusterRadius) ? squad.clusterRadius : Math.min(zone.radius || 260, 260);
  const minSep = Number.isFinite(squad.minSeparation) ? squad.minSeparation : 0;
  const squadPositions = [];
  for (let i = 0; i < n; i++) {
    const isAnchor = i === 0 && hasIdentityAnchor;
    const archetype = isAnchor
      ? squad.anchorArchetype
      : squad.archetypes[Math.floor(rng() * squad.archetypes.length) % squad.archetypes.length];
    const level = Math.round(levelBand[0] + (levelBand[1] - levelBand[0]) * (0.4 + rng() * 0.6));
    let pos = jitter(zone, rng, clusterR);
    if (minSep > 0 && squadPositions.length > 0) {
      for (let attempt = 0; attempt < 24; attempt++) {
        const tooClose = squadPositions.some((point) => Math.hypot(point.x - pos.x, point.z - pos.z) < minSep);
        if (!tooClose) break;
        pos = jitter(zone, rng, clusterR);
      }
    }
    squadPositions.push(pos);
    ships.push({
      archetype,
      ...(hasIdentityAnchor ? { compositionRole: isAnchor ? 'identity_anchor' : 'light' } : {}),
      combatDoctrineId: ENEMY_BY_ID.get(archetype)?.combatDoctrineId || null,
      level,
      pos,
      factionId,
      context,
      doctrine: squad.doctrine,
      formation: squad.formation,
      team: squad.team,
      passive: squad.passive == null ? undefined : squad.passive === true,
      roe: squad.roe,
      role: role || 'squad',
      factionPresenceDoctrine: squad.factionPresenceDoctrine,
      cultureId: squad.cultureId,
      cohortRecipe: squad.cohortRecipe,
      squadRecipe: squad.squadRecipe,
      squadSocket: Array.isArray(squad.squadSockets) ? squad.squadSockets[i] : undefined,
    });
  }
  if (Array.isArray(squad.guaranteeArchetypes) && squad.guaranteeArchetypes.length) {
    const added = ships.slice(ships.length - n);
    const claimed = new Set();
    for (const guaranteed of squad.guaranteeArchetypes) {
      if (added.some((ship) => ship.archetype === guaranteed)) continue;
      let index = -1;
      for (let i = hasIdentityAnchor ? 1 : 0; i < added.length; i++) {
        if (!claimed.has(i) && !squad.guaranteeArchetypes.includes(added[i].archetype)) { index = i; break; }
      }
      if (index < 0) break;
      claimed.add(index);
      added[index].archetype = guaranteed;
      added[index].combatDoctrineId = ENEMY_BY_ID.get(guaranteed)?.combatDoctrineId || null;
    }
  }
}

function jitter(zone, rng, clusterR) {
  const center = zone.center || { x: 0, z: 0 };
  const angle = rng() * Math.PI * 2;
  const radius = Math.sqrt(rng()) * clusterR;
  return { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius };
}

function zoneLevelBand(zone) {
  const threat = zoneThreat(zone);
  const lo = Math.max(1, threat);
  const hi = Math.max(lo + 1, threat + 3);
  return [lo, hi];
}

function copyPoint(value, fallback = { x: 0, z: 0 }) {
  return {
    x: Number.isFinite(Number(value && value.x)) ? Number(value.x) : fallback.x,
    z: Number.isFinite(Number(value && value.z)) ? Number(value.z) : fallback.z,
  };
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
