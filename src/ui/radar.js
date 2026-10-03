// Second-generation tactical radar.
//
// The radar is a decision instrument, not a miniature screenshot of space. Its primary classes are
// drawn natively as crisp semantic glyphs; no canvas bloom is used. Shape, fill, outline weight,
// direction, and scale carry identity before colour does. Contact classes ride the kit's authored
// silhouettes (assets/ui/kit/assets/radar/radar-glyph-paths.json); the primitives below remain as
// fallbacks for classes the kit does not name.
//
// World projection (fixed chase camera):
//   bx = C - (entity.x - player.x) / range * R
//   by = C - (entity.z - player.z) / range * R
//
// +X reads left and +Z reads up, matching the player-facing world view.
// Off-range threat policy: the nearest hostile becomes a hollow chevron at the rim; persistent
// infrastructure keeps its own hex/ring identity rather than masquerading as another arrow.

import { semanticColor, semanticShape } from './accessibility.js';
import { canvasFont } from './canvasFonts.js';
import { solveIntercept } from '../core/flight/flightTelemetry.js';
import { isHostileToPlayer } from '../systems/scanner.js';
import { heatZoneInCurrentSector } from '../systems/heat.js';
import { resolveWaypointPresentationPosition } from './navigationWaypoint.js';
import { SHIPS } from '../data/ships.js';
import { prefersReducedMotion } from './effects/effectRuntime.js';
import {
  TACTICAL_MAP_PALETTE,
  drawGateGlyph,
  drawHostileGlyph,
  drawObjectiveBracket,
  drawObjectiveCorridor,
  drawPlayerHull,
  drawStationGlyph,
  formatRadarDistance,
  planObjectiveCue,
  planUnresolvedObjectiveCue,
  projectRadarPoint,
  sanitizeMapLabel,
  tacticalRadarMetrics,
} from './map/tacticalMapGrammar.js';
import { installMapParityBridge } from './map/mapParityBridge.js';
import { svg as orrSvg, circularText } from './orrery/svg.js';
import { orbitRing, ring as orrRing, hand as orrHand } from './orrery/instruments.js';
import { injectOrrery } from './orrery/tokens.js';
import GLYPHS from '../../assets/ui/kit/assets/radar/radar-glyph-paths.json' with { type: 'json' };

const COMPACT_SIZE = 220;
const COMPACT_C = COMPACT_SIZE / 2;
const COMPACT_R = 105;
const EXPAND_SIZE = 340;
const EXPAND_C = EXPAND_SIZE / 2;
const EXPAND_R = 165;

export const SWARM_DENSITY_THRESHOLD = 8;

const TRAIL_MAX = 7;
const MAX_TRAIL_UPDATES = 72;
const TRAIL_PRUNE_INTERVAL = 20;
const RADAR_QUERY_RADIUS_PAD = 32;
const RADAR_SPATIAL_MIN_ASTEROIDS = 96;
const RADAR_QUERY_VISIT_RATIO_LIMIT = 0.4;
const MAX_SEMANTIC_HOSTILES = 32;
const MAX_SEMANTIC_INFRASTRUCTURE = 20;
/* Priority dial (owner 2026-10-03): ordinary small traffic resolves only inside the close band —
   half the radar range — instead of fogging the whole dial. Stations and gates read sector-wide at
   the rim, hostiles always, and salient ships (selected target, mission targets, named lane
   contacts, POI anchors, capitals) ignore the band. */
export const RADAR_TRAFFIC_RANGE_FRACTION = 0.5;
// Asteroids are cartography, not contacts: the belt renders as a faint density field on a coarse
// grid, and only the nearest few rocks earn individual dots. Hundreds of blips at 4 km scale read
// as grey fog that drowns every real signal on the dial.
const ASTEROID_FIELD_CELLS = 9;
const ASTEROID_DOT_LIMIT = 14;

/** Bench A/B: production default ON. Quantized-player + contact-pose still-layer skips contact census. */
let RADAR_CONTACTS_STILL_LAYER = true;
export function setRadarContactsStillLayerForBench(enabled) {
  RADAR_CONTACTS_STILL_LAYER = enabled !== false;
}
export function getRadarContactsStillLayerForBench() {
  return RADAR_CONTACTS_STILL_LAYER !== false;
}

/** Rescan while contacts still-latched (~0.5 s at 10 Hz radar). */
const RADAR_CONTACTS_STILL_RESCAN_DRAWS = 5;

export function createRadarContactsStillCache() {
  return {
    armed: false,
    qx: 0,
    qz: 0,
    range: 0,
    targetId: null,
    sig: 0,
    hostileCount: 0,
    infraCount: 0,
    neutralCount: 0,
    nearestOffRangeHostile: null,
    salients: 0,
    rescanDraws: 0,
    skipped: false,
  };
}

/**
 * Contact census for radar.draw. When the still-layer latch is armed and the
 * quantized player pose / range / target / contact-pose signature match, skips
 * projection + hostility and reuses retained mark lists (picture-identical at
 * ≤1 wu / ≤1 radar px). `cache` is owned by createRadar (or the microbench).
 */
export function censusRadarContactsStillLayer({
  contacts,
  player,
  playerTeam,
  state,
  range,
  rangeSq,
  metrics,
  targetId,
  projectScratch,
  pushHostileMark,
  pushInfrastructureMark,
  pushNeutralMark,
  hostileMarks,
  infrastructureMarks,
  neutralMarks,
  cache,
  updateTrailFn = null,
  maxTrailUpdates = MAX_TRAIL_UPDATES,
}) {
  const playerX = player.pos.x;
  const playerZ = player.pos.z;
  const radarScale = metrics.radius / range;
  const trafficRangeSq = rangeSq * RADAR_TRAFFIC_RANGE_FRACTION * RADAR_TRAFFIC_RANGE_FRACTION;
  const stillQx = Math.round(playerX * radarScale);
  const stillQz = Math.round(playerZ * radarScale);
  const stillLayerOn = RADAR_CONTACTS_STILL_LAYER !== false;

  // Cheap player/range/target gate before contact signature walk.
  const playerStill = stillLayerOn
    && cache.armed
    && stillQx === cache.qx
    && stillQz === cache.qz
    && range === cache.range
    && targetId === cache.targetId
    && cache.rescanDraws > 0;

  // FB-035 — live POI plans ride the mark: the readout's radarKind is the blip class and its
  // progress sweeps a small arc. state.world.poiReadouts is the single reader path (keyed by
  // zoneId; the anchor entity carries the stamped link), so no subscriptions reach the census.
  const poiReadouts = state && state.world && state.world.poiReadouts || null;

  let sig = contacts.length * 1315423911;
  if (playerStill || !cache.armed) {
    for (let i = 0; i < contacts.length; i += 1) {
      const e = contacts[i];
      if (!e || !e.pos || !e.alive || e === player) continue;
      const qx = Math.round(e.pos.x);
      const qz = Math.round(e.pos.z);
      const qh = Math.round((Number(e.rot) || 0) * 32);
      const poiBit = e.data && e.data.poiBehavior ? 1 : 0;
      sig = (Math.imul(sig ^ (e.id >>> 0), 0x01000193) ^ qx ^ (qz << 11) ^ (qh << 3) ^ (e.team | 0) ^ (poiBit << 4)) >>> 0;
    }
  }

  const stillHit = playerStill && sig === cache.sig;
  if (stillHit) {
    cache.rescanDraws -= 1;
    cache.skipped = true;
    hostileMarks.length = cache.hostileCount;
    infrastructureMarks.length = cache.infraCount;
    neutralMarks.length = cache.neutralCount;
    return {
      skipped: true,
      hostileCount: cache.hostileCount,
      salients: cache.salients,
      nearestOffRangeHostile: cache.nearestOffRangeHostile,
      trailUpdates: 0,
    };
  }

  hostileMarks.length = 0;
  infrastructureMarks.length = 0;
  neutralMarks.length = 0;
  let hostileCount = 0;
  let salientContactCount = 0;
  let nearestOffRangeHostile = null;
  let nearestOffRangeHostileDistanceSq = Infinity;
  let trailUpdates = 0;

  for (let i = 0; i < contacts.length; i += 1) {
    const entity = contacts[i];
    if (!entity || !entity.pos || !entity.alive || entity === player) continue;
    const dx = entity.pos.x - playerX;
    const dz = entity.pos.z - playerZ;
    const distanceSq = dx * dx + dz * dz;
    const hostile = isHostileToPlayer(entity, playerTeam, state);
    const station = entity.type === 'station';
    const gate = station && !!(entity.data && entity.data.isGate);
    const poiStamped = entity.data && entity.data.poiBehavior;
    const poi = poiStamped && poiReadouts ? poiReadouts[poiStamped.zoneId] || null : null;
    if (hostile || station || entity.id === targetId) salientContactCount += 1;

    if (distanceSq > rangeSq) {
      if (hostile && distanceSq < nearestOffRangeHostileDistanceSq) {
        nearestOffRangeHostileDistanceSq = distanceSq;
        nearestOffRangeHostile = entity;
      }
      if (station) {
        const projected = projectRadarPoint(player.pos, entity.pos, range, metrics, projectScratch);
        if (projected) pushInfrastructureMark(entity, projected, gate, distanceSq, poi);
      }
      continue;
    }

    // Priority dial: ordinary small traffic (unselected, unmissioned, unnamed, non-capital ships
    // and drones) resolves only inside the close band; everything salient draws sector-wide.
    if (!hostile && !station) {
      const contactType = entity.type;
      if ((contactType === 'ship' || contactType === 'drone')
        && !isSalientShip(entity, targetId)
        && distanceSq > trafficRangeSq) continue;
    }

    const projected = projectRadarPoint(player.pos, entity.pos, range, metrics, projectScratch);
    if (!projected) continue;
    const type = entity.type;
    const wantsTrail = (type === 'ship' || type === 'drone') && trailUpdates < maxTrailUpdates;

    if (hostile) {
      if (wantsTrail && updateTrailFn) {
        updateTrailFn(entity);
        trailUpdates += 1;
      }
      hostileCount += 1;
      pushHostileMark(entity, projected, distanceSq);
      continue;
    }
    if (station) {
      pushInfrastructureMark(entity, projected, gate, distanceSq, poi);
      continue;
    }

    if (wantsTrail && updateTrailFn) {
      updateTrailFn(entity);
      trailUpdates += 1;
    }
    pushNeutralMark(entity, projected, distanceSq, {
      heading: entityHeading(entity),
      type,
      selected: entity.id === targetId,
      named: !!(entity.data && entity.data.namedLaneContactId),
      wantsTrail,
      poi,
    });
  }

  // Recompute sig after walk when player moved (playerStill was false).
  if (!playerStill) {
    sig = contacts.length * 1315423911;
    for (let i = 0; i < contacts.length; i += 1) {
      const e = contacts[i];
      if (!e || !e.pos || !e.alive || e === player) continue;
      const qx = Math.round(e.pos.x);
      const qz = Math.round(e.pos.z);
      const qh = Math.round((Number(e.rot) || 0) * 32);
      const poiBit = e.data && e.data.poiBehavior ? 1 : 0;
      sig = (Math.imul(sig ^ (e.id >>> 0), 0x01000193) ^ qx ^ (qz << 11) ^ (qh << 3) ^ (e.team | 0) ^ (poiBit << 4)) >>> 0;
    }
  }

  cache.armed = true;
  cache.qx = stillQx;
  cache.qz = stillQz;
  cache.range = range;
  cache.targetId = targetId;
  cache.sig = sig;
  cache.hostileCount = hostileMarks.length;
  cache.infraCount = infrastructureMarks.length;
  cache.neutralCount = neutralMarks.length;
  cache.salients = salientContactCount;
  cache.nearestOffRangeHostile = nearestOffRangeHostile;
  cache.rescanDraws = RADAR_CONTACTS_STILL_RESCAN_DRAWS;
  cache.skipped = false;

  return {
    skipped: false,
    hostileCount,
    salients: salientContactCount,
    nearestOffRangeHostile,
    trailUpdates,
  };
}



/** Bench A/B: production default ON. Quantized-player still-layer skips asteroid field walk. */
let RADAR_ASTEROID_STILL_LAYER = true;
export function setRadarAsteroidStillLayerForBench(enabled) {
  RADAR_ASTEROID_STILL_LAYER = enabled !== false;
}
export function getRadarAsteroidStillLayerForBench() {
  return RADAR_ASTEROID_STILL_LAYER !== false;
}

/** Bench A/B: production default ON. drawTrail uses one path/stroke instead of per-segment. */
let RADAR_DRAW_TRAIL_BATCH = true;
export function setRadarDrawTrailBatchForBench(enabled) {
  RADAR_DRAW_TRAIL_BATCH = enabled !== false;
}
export function getRadarDrawTrailBatchForBench() {
  return RADAR_DRAW_TRAIL_BATCH !== false;
}

/** Rescan while still-latched (~0.5 s at 10 Hz radar). */
const RADAR_ASTEROID_STILL_RESCAN_DRAWS = 5;

/**
 * Asteroid field census for radar.draw. When the still-layer latch is armed and the
 * quantized player pose / range / target / field+index versions match, skips the source
 * walk and reuses the retained cell counts + near-dot slots (picture-identical at ≤1 px).
 * `cache` is a retained record owned by createRadar (or the microbench).
 */
export function censusRadarAsteroidStillLayer({
  asteroidSource,
  player,
  playerX,
  playerZ,
  range,
  rangeSq,
  radarScale,
  center,
  size,
  targetId,
  fieldVersion,
  indexVersion,
  entities,
  fieldCellCounts,
  nearRockSlots,
  cache,
}) {
  const fieldCellPx = size / ASTEROID_FIELD_CELLS;
  const stillQx = Math.round(playerX * radarScale);
  const stillQz = Math.round(playerZ * radarScale);
  const stillLayerOn = RADAR_ASTEROID_STILL_LAYER !== false;
  const stillHit = stillLayerOn
    && cache.armed
    && stillQx === cache.qx
    && stillQz === cache.qz
    && range === cache.range
    && size === cache.size
    && targetId === cache.targetId
    && fieldVersion === cache.fieldVersion
    && indexVersion === cache.indexVersion
    && cache.rescanDraws > 0;

  if (stillHit) {
    cache.rescanDraws -= 1;
    cache.skipped = true;
    return {
      fieldOccupied: cache.fieldOccupied,
      nearRockCount: cache.nearRockCount,
      targetAsteroid: cache.targetValid
        ? (cache.targetOut.x = cache.targetX, cache.targetOut.y = cache.targetY, cache.targetOut)
        : null,
      skipped: true,
    };
  }

  fieldCellCounts.fill(0);
  let fieldOccupied = 0;
  let nearRockCount = 0;
  let targetAsteroid = null;
  const get = entities && typeof entities.get === 'function' ? entities.get.bind(entities) : null;
  // Individual rock dots are close-band detail; the density field stays full-range cartography.
  const nearBandSq = rangeSq * RADAR_TRAFFIC_RANGE_FRACTION * RADAR_TRAFFIC_RANGE_FRACTION;

  for (let i = 0; i < asteroidSource.length; i += 1) {
    const entity = asteroidSource[i];
    if (
      !entity
      || !entity.pos
      || !entity.alive
      || entity === player
      || entity.type !== 'asteroid'
    ) continue;
    const liveRock = get ? get(entity.id) : null;
    if (liveRock && liveRock !== entity) continue;
    if (!liveRock && !entity.fieldResident) continue;
    const dx = entity.pos.x - playerX;
    const dz = entity.pos.z - playerZ;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > rangeSq) continue;
    const x = center - dx * radarScale;
    const y = center - dz * radarScale;
    const gx = Math.max(0, Math.min(ASTEROID_FIELD_CELLS - 1, Math.floor(x / fieldCellPx)));
    const gy = Math.max(0, Math.min(ASTEROID_FIELD_CELLS - 1, Math.floor(y / fieldCellPx)));
    const key = gy * ASTEROID_FIELD_CELLS + gx;
    if (fieldCellCounts[key] === 0) fieldOccupied += 1;
    fieldCellCounts[key] += 1;
    if (distanceSq <= nearBandSq) {
      if (nearRockCount < ASTEROID_DOT_LIMIT) {
        const slot = nearRockSlots[nearRockCount++];
        slot.x = x; slot.y = y; slot.distanceSq = distanceSq;
        for (let k = nearRockCount - 1; k > 0 && nearRockSlots[k].distanceSq < nearRockSlots[k - 1].distanceSq; k--) {
          const tmp = nearRockSlots[k];
          nearRockSlots[k] = nearRockSlots[k - 1];
          nearRockSlots[k - 1] = tmp;
        }
      } else if (distanceSq < nearRockSlots[nearRockCount - 1].distanceSq) {
        const slot = nearRockSlots[nearRockCount - 1];
        slot.x = x; slot.y = y; slot.distanceSq = distanceSq;
        for (let k = nearRockCount - 1; k > 0 && nearRockSlots[k].distanceSq < nearRockSlots[k - 1].distanceSq; k--) {
          const tmp = nearRockSlots[k];
          nearRockSlots[k] = nearRockSlots[k - 1];
          nearRockSlots[k - 1] = tmp;
        }
      }
    }
    if (entity.id === targetId) {
      if (!cache.targetOut) cache.targetOut = { x: 0, y: 0 };
      cache.targetOut.x = x;
      cache.targetOut.y = y;
      targetAsteroid = cache.targetOut;
    }
  }

  cache.qx = stillQx;
  cache.qz = stillQz;
  cache.range = range;
  cache.size = size;
  cache.targetId = targetId;
  cache.fieldVersion = fieldVersion;
  cache.indexVersion = indexVersion;
  cache.fieldOccupied = fieldOccupied;
  cache.nearRockCount = nearRockCount;
  if (targetAsteroid) {
    cache.targetX = targetAsteroid.x;
    cache.targetY = targetAsteroid.y;
    cache.targetValid = true;
  } else {
    cache.targetValid = false;
  }
  cache.rescanDraws = RADAR_ASTEROID_STILL_RESCAN_DRAWS;
  cache.armed = true;
  cache.skipped = false;
  return {
    fieldOccupied,
    nearRockCount,
    targetAsteroid,
    skipped: false,
  };
}

export function createRadarAsteroidStillCache() {
  return {
    armed: false,
    qx: NaN,
    qz: NaN,
    range: NaN,
    size: 0,
    targetId: null,
    fieldVersion: NaN,
    indexVersion: NaN,
    fieldOccupied: 0,
    nearRockCount: 0,
    targetX: 0,
    targetY: 0,
    targetValid: false,
    targetOut: { x: 0, y: 0 },
    rescanDraws: 0,
    skipped: false,
  };
}

/* Contact colour, owner ruling 2026-10-03 (supersedes the 2026-09-18 one-accent law): the all-bone
   scope read as one monochrome wash — the pilot could not tell stations from traffic from wrecks.
   Class carries hue again, in the accessibility semantic register: allies green, unaligned traffic
   blue-grey, stations cyan, gates violet, wrecks rust; hostile stays the red lamp and the objective
   keeps the amber. Shape still carries role — hue is the fast channel, never the only one. The keys
   stay: shipState() uses membership here to decide "friendly". */
const FRIENDLY_CONTACT = TACTICAL_MAP_PALETTE.friendly;
const FACTION_COLOR = Object.freeze({
  faction_scn: FRIENDLY_CONTACT,
  faction_mts: FRIENDLY_CONTACT,
  faction_dmc: FRIENDLY_CONTACT,
  faction_reach: FRIENDLY_CONTACT,
  faction_quiet: FRIENDLY_CONTACT,
  faction_vael: FRIENDLY_CONTACT,
  faction_free: FRIENDLY_CONTACT,
  faction_choir: FRIENDLY_CONTACT,
});

const CAPITAL_ROLES = new Set(['battlecruiser', 'flagship', 'gunship', 'carrier', 'dreadnought']);
const CAPITAL_DEFS = new Set(
  SHIPS
    .filter((ship) => (ship.tier != null && ship.tier >= 4) || CAPITAL_ROLES.has(ship.role))
    .map((ship) => ship.id),
);

// ---- Contact-class silhouettes (kit: assets/ui/kit/assets/radar) ------------------
// The kit authored twelve Path2D silhouettes explicitly for this canvas (ORRERY §6 promises
// "contacts as class silhouettes"). Each key is one merged Path2D in a 24x24 box centred on
// (12,12), nose up — the same pose the fallback primitives use — so it drops into the existing
// translate / rotate(Math.PI + heading) transform unchanged. Colour keeps carrying stance
// (hostile red / green friendly / blue-grey neutral — TACTICAL_MAP_PALETTE); shape now carries the
// contact's class, so
// the pairing stays colourblind-safe: hostility is still the red fill plus the threat pulse,
// class is the silhouette. Paths are built once at first paint; the 10 Hz draw path only
// ever reads them.
let glyphPathCache = null;
function glyphPathFor(key) {
  if (!glyphPathCache) {
    // Headless tests import this module for its census math — no canvas there.
    if (typeof Path2D === 'undefined') return null;
    const cache = new Map();
    for (const [glyphKey, pathData] of Object.entries(GLYPHS)) {
      const merged = new Path2D();
      for (const d of pathData) merged.addPath(new Path2D(d));
      cache.set(glyphKey, merged);
    }
    glyphPathCache = cache;
  }
  return glyphPathCache.get(key) || null;
}

// Traffic/hull role word → silhouette key. Vocabulary from src/systems/scanner.js,
// src/systems/npcJobsRuntime.js and the roles in src/data/ships.js. Capitals ride the military
// shield at capital weight; anything unmapped keeps its primitive shape below.
const SHIP_DEF_ROLE = new Map(SHIPS.map((ship) => [ship.id, String(ship.role || '').toLowerCase()]));
const ROLE_GLYPH = new Map(Object.entries({
  // combat small craft
  fighter: 'fighter', interceptor: 'fighter', starter: 'fighter', multirole: 'fighter',
  corvette: 'fighter', explorer: 'fighter', exotic: 'fighter', brawler: 'fighter',
  sniper: 'fighter', swarmer: 'fighter',
  // industry and bulk
  hauler: 'freighter', freighter: 'freighter', heavy_hauler: 'freighter',
  ore_carrier: 'freighter', tug: 'freighter', tender: 'freighter',
  miner: 'miner', mining: 'miner', mining_barge: 'miner', surveyor: 'miner',
  // lawful traffic
  patrol: 'patrol', escort: 'patrol', courier: 'patrol', rescue: 'patrol',
  // capitals (military shield)
  gunship: 'patrol', battlecruiser: 'patrol', flagship: 'patrol', carrier: 'patrol', dreadnought: 'patrol',
  // irregulars
  pirate: 'pirate', raider: 'pirate', marauder: 'pirate', corsair: 'pirate', outlaw: 'pirate',
  smuggler: 'pirate', scavenger: 'pirate', salvor: 'pirate',
}));

function contactGlyphKey(entity) {
  const type = entity && entity.type;
  if (type === 'station') return entity.data && entity.data.isGate ? 'gate' : 'station';
  if (type === 'wreck') return 'wreck';
  if (type === 'pickup') return 'beacon';
  if (type === 'payload') return 'freighter';
  if (type === 'drone') return 'fighter';
  if (type !== 'ship') return null;
  const data = entity.data || {};
  const role = String(
    data.trafficRole
    || data.role
    || data.presentationRole
    || (data.defId && SHIP_DEF_ROLE.get(data.defId))
    || (data.ai && data.ai.encounterRole)
    || '',
  ).toLowerCase();
  return ROLE_GLYPH.get(role) || null;
}

const GLYPH_SCALE_NEUTRAL = 0.5;
const GLYPH_SCALE_HOSTILE = 0.55;

function drawNeutralSilhouette(g, key, x, y, heading, colour, { selected = false, scale = GLYPH_SCALE_NEUTRAL }) {
  const path = glyphPathFor(key);
  if (!path) return false;
  g.save();
  g.translate(x, y);
  if (Number.isFinite(heading)) g.rotate(Math.PI + heading);
  g.scale(scale, scale);
  g.globalAlpha = selected ? 1 : 0.8;
  g.strokeStyle = colour;
  g.fillStyle = selected ? colour : TACTICAL_MAP_PALETTE.groundPlate;
  g.lineWidth = (selected ? 1.8 : 1.35) / scale;
  g.fill(path);
  g.stroke(path);
  g.restore();
  return true;
}

function drawHostileSilhouette(g, key, x, y, heading, { selected = false, capital = false }) {
  const path = glyphPathFor(key);
  if (!path) return false;
  const scale = GLYPH_SCALE_HOSTILE * (capital ? 1.35 : 1);
  g.save();
  g.translate(x, y);
  if (Number.isFinite(heading)) g.rotate(Math.PI + heading);
  g.scale(scale, scale);
  // Threats stay always-filled (grammar law): red fill plus class shape, thin dark edge to stay
  // crisp over bright scene bleed at the rim.
  g.fillStyle = TACTICAL_MAP_PALETTE.hostile;
  g.strokeStyle = selected ? TACTICAL_MAP_PALETTE.ink : 'rgba(5,12,16,0.85)';
  g.lineWidth = (selected ? 1.4 : 1) / scale;
  g.fill(path);
  g.stroke(path);
  g.restore();
  return true;
}

const trailMap = new Map();
// Retained {x,z} slots for contact trails. updateTrail used to allocate a fresh point and
// shift() the dropped one into GC every time a contact moved ~20 wu — steady radar.draw churn.
const trailPointPool = [];

function releaseTrailHistory(history) {
  if (!history || !history.length) return;
  for (let i = 0; i < history.length; i += 1) trailPointPool.push(history[i]);
  history.length = 0;
}

function clearAllTrails() {
  for (const history of trailMap.values()) releaseTrailHistory(history);
  trailMap.clear();
}

/**
 * Range-ring policy: show the farthest positive finite range among the active entity's live
 * equipped weapons and mining beam. Recompute from runtime data every draw so refits move the ring.
 */
export function rangeRingRatioForEntity(entity, radarRange) {
  const data = entity && entity.data;
  let maxRange = 0;
  const weapons = data && data.weapons;
  if (Array.isArray(weapons)) {
    for (const weapon of weapons) {
      const weaponRange = weapon && weapon.range;
      if (Number.isFinite(weaponRange) && weaponRange > maxRange) maxRange = weaponRange;
    }
  }
  const miningRange = data && data.miningBeam && data.miningBeam.range;
  if (Number.isFinite(miningRange) && miningRange > maxRange) maxRange = miningRange;
  if (!Number.isFinite(radarRange) || radarRange <= 0 || maxRange <= 0) return 0.6;
  return Math.min(maxRange / radarRange, 1);
}

function playerProjSpeed(player) {
  const weapons = player && player.data && player.data.weapons;
  if (Array.isArray(weapons)) {
    for (const weapon of weapons) {
      const speed = Number(weapon && weapon.projSpeed);
      if (Number.isFinite(speed) && speed > 0) return speed;
    }
  }
  return 360;
}

function isCapitalContact(entity) {
  const data = entity && entity.data;
  if (!data) return false;
  if (data.defId && CAPITAL_DEFS.has(data.defId)) return true;
  return CAPITAL_ROLES.has(String(data.trafficRole || data.role || '').toLowerCase());
}

/* A ship too important to hide behind the traffic close-band: the locked target, a mission
   target, a named lane contact, a POI anchor, or a capital hull. */
function isSalientShip(entity, targetId) {
  if (!entity || entity.id === targetId) return true;
  const data = entity.data;
  if (!data) return false;
  if (data.missionTargetSlot != null) return true;
  if (data.namedLaneContactId) return true;
  if (data.poiBehavior) return true;
  return isCapitalContact(entity);
}

function entityHeading(entity) {
  if (entity && Number.isFinite(entity.rot)) return entity.rot;
  const velocity = entity && entity.vel;
  if (velocity && (Math.abs(velocity.x) > 1e-4 || Math.abs(velocity.z) > 1e-4)) {
    return Math.atan2(velocity.x, velocity.z);
  }
  return null;
}

function shipState(entity, playerTeam, state) {
  if (isHostileToPlayer(entity, playerTeam, state)) return 'hostile';
  if (entity && entity.factionId && FACTION_COLOR[entity.factionId]) return 'friendly';
  return 'neutral';
}

function contactColor(entity, playerTeam, colorblindMode, state) {
  const semanticState = shipState(entity, playerTeam, state);
  if (colorblindMode && colorblindMode !== 'none') {
    return semanticColor(semanticState, colorblindMode);
  }
  if (semanticState === 'hostile') return TACTICAL_MAP_PALETTE.hostile;
  if (semanticState === 'friendly') return TACTICAL_MAP_PALETTE.friendly;
  return TACTICAL_MAP_PALETTE.neutral;
}

function contactShape(entity, playerTeam, state) {
  if (isHostileToPlayer(entity, playerTeam, state)) return semanticShape('hostile');
  const role = String((entity.data && (entity.data.trafficRole || entity.data.role)) || '').toLowerCase();
  if (role === 'hauler' || role === 'miner' || role === 'smuggler' || role === 'tug') return 'square';
  if (role === 'patrol' || role === 'escort' || role === 'courier' || role === 'rescue') return 'diamond';
  return semanticShape(shipState(entity, playerTeam, state));
}

function updateTrail(entity) {
  let history = trailMap.get(entity.id);
  if (!history) {
    history = [];
    trailMap.set(entity.id, history);
  }
  const last = history[history.length - 1];
  const dx = last ? entity.pos.x - last.x : Infinity;
  const dz = last ? entity.pos.z - last.z : Infinity;
  if (!last || dx * dx + dz * dz > 400) {
    let pt;
    if (history.length >= TRAIL_MAX) {
      // Recycle the dropped tip — same FIFO picture, no alloc and no orphaned point.
      pt = history.shift();
      pt.x = entity.pos.x;
      pt.z = entity.pos.z;
      history.push(pt);
    } else {
      pt = trailPointPool.length ? trailPointPool.pop() : { x: 0, z: 0 };
      pt.x = entity.pos.x;
      pt.z = entity.pos.z;
      history.push(pt);
    }
  }
}

function drawTrail(g, entity, playerX, playerZ, scale, center, colour) {
  const history = trailMap.get(entity.id);
  if (!history || history.length < 2) return;
  g.save();
  g.lineWidth = 1;
  g.strokeStyle = colour;
  if (RADAR_DRAW_TRAIL_BATCH !== false) {
    // One continuous path, one stroke. Prior per-segment stroke faded 0→0.2; a single mid
    // alpha keeps the same readable wake without N canvas strokes on the 10 Hz draw path.
    g.globalAlpha = 0.12;
    g.beginPath();
    for (let i = 0; i < history.length; i += 1) {
      const x = center - (history[i].x - playerX) * scale;
      const y = center - (history[i].z - playerZ) * scale;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  } else {
    for (let i = 1; i < history.length; i += 1) {
      g.globalAlpha = (i / history.length) * 0.2;
      const x0 = center - (history[i - 1].x - playerX) * scale;
      const y0 = center - (history[i - 1].z - playerZ) * scale;
      const x1 = center - (history[i].x - playerX) * scale;
      const y1 = center - (history[i].z - playerZ) * scale;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
  }
  g.restore();
}

// Plain-loop ping census (10 Hz draw path): the old `contacts.some` allocated a closure per draw.
function contactsHaveLivePing(contacts, simTime) {
  const until = Number.isFinite(simTime) ? simTime : 0;
  for (let i = 0; i < contacts.length; i += 1) {
    const entity = contacts[i];
    if (entity && entity.alive && entity.data && entity.data.pingedUntil > until) return true;
  }
  return false;
}

function drawNeutralContact(g, entity, x, y, heading, colour, {
  selected = false,
  named = false,
  playerTeam = null,
  state = null,
} = {}) {
  const namedScale = named ? 1.25 : 1;
  const glyphKey = contactGlyphKey(entity);
  if (glyphKey) {
    // Class silhouette: the shape names the contact's trade, the colour names its stance.
    drawNeutralSilhouette(g, glyphKey, x, y, heading, colour, {
      selected,
      scale: GLYPH_SCALE_NEUTRAL * namedScale * (isCapitalContact(entity) ? 1.3 : 1),
    });
  } else {
    const shape = contactShape(entity, playerTeam, state);
    const scale = namedScale;
    g.save();
    g.translate(x, y);
    if (Number.isFinite(heading)) g.rotate(Math.PI + heading);
    g.globalAlpha = selected ? 1 : 0.8;
    g.strokeStyle = colour;
    g.fillStyle = selected ? colour : TACTICAL_MAP_PALETTE.groundPlate;
    g.lineWidth = selected ? 1.8 : 1.35;
    if (shape === 'square') {
      g.beginPath();
      g.rect(-3.4 * scale, -3.4 * scale, 6.8 * scale, 6.8 * scale);
    } else if (shape === 'diamond') {
      g.beginPath();
      g.moveTo(0, -4 * scale);
      g.lineTo(3.5 * scale, 0);
      g.lineTo(0, 4 * scale);
      g.lineTo(-3.5 * scale, 0);
      g.closePath();
    } else {
      g.beginPath();
      g.moveTo(0, -4.5 * scale);
      g.lineTo(3.5 * scale, 3.4 * scale);
      g.lineTo(0, 1.3 * scale);
      g.lineTo(-3.5 * scale, 3.4 * scale);
      g.closePath();
    }
    g.fill();
    g.stroke();
    g.restore();
  }

  if (named) {
    g.save();
    g.strokeStyle = colour;
    g.globalAlpha = 0.58;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(x, y, 6.3, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }
}

function poiProgressRatio(readout) {
  if (!readout) return 0;
  const required = Number(readout.required) || 0;
  if (required <= 0) return 0;
  return Math.max(0, Math.min(1, (Number(readout.progress) || 0) / required));
}

// FB-035 — radarKind rides the mark as the blip class; a planned place gets one shared additive
// cue (open diamond + small progress arc) in the objective lamp. The glyph underneath keeps its
// own shape and colour — per-kind restyle belongs to the ORRERY lane.
function drawPoiClassMark(g, x, y, ratio) {
  g.save();
  g.strokeStyle = TACTICAL_MAP_PALETTE.objective;
  g.globalAlpha = 0.55;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y - 8);
  g.lineTo(x + 8, y);
  g.lineTo(x, y + 8);
  g.lineTo(x - 8, y);
  g.closePath();
  g.stroke();
  const sweep = Math.max(0, Math.min(1, Number(ratio) || 0));
  if (sweep > 0) {
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(x, y, 10.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sweep);
    g.stroke();
  }
  g.restore();
}

function drawHostileEdgeMarker(g, x, y, angle, selected = false) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.strokeStyle = TACTICAL_MAP_PALETTE.hostile;
  g.fillStyle = selected ? TACTICAL_MAP_PALETTE.hostile : TACTICAL_MAP_PALETTE.groundPlate;
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(-5.5, -5);
  g.lineTo(5.5, 0);
  g.lineTo(-5.5, 5);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

function drawTargetRing(g, x, y, center) {
  g.save();
  g.strokeStyle = 'rgba(244,240,230,0.52)';
  g.lineWidth = 1;
  g.setLineDash([3, 4]);
  g.beginPath();
  g.moveTo(center, center);
  g.lineTo(x, y);
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = TACTICAL_MAP_PALETTE.ink;
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(x, y, 7.2, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

function drawThreatRing(g, metrics, hostileCount, now, reducedMotion) {
  if (hostileCount < 4) return;
  const severity = Math.min(1, hostileCount / SWARM_DENSITY_THRESHOLD);
  const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now * 0.0045);
  const alpha = 0.22 + severity * 0.24 + pulse * 0.08;
  const radius = metrics.radius - 3;
  g.save();
  g.strokeStyle = TACTICAL_MAP_PALETTE.hostile;
  g.lineWidth = hostileCount >= SWARM_DENSITY_THRESHOLD ? 2 : 1.25;
  g.globalAlpha = alpha;
  for (const angle of [-Math.PI * 0.78, -Math.PI * 0.22, Math.PI * 0.22, Math.PI * 0.78]) {
    g.beginPath();
    g.arc(metrics.center, metrics.center, radius, angle - 0.08, angle + 0.08);
    g.stroke();
  }
  g.restore();
}

function waypointLabel(waypoint) {
  return sanitizeMapLabel(
    waypoint && (waypoint.sectorName || waypoint.label || waypoint.mapLabel || 'OBJECTIVE'),
    20,
  );
}

function drawWaypointDiamond(g, cue, now, reducedMotion) {
  const pulse = reducedMotion ? 0 : 0.5 + 0.5 * Math.sin(now * 0.0042);
  drawObjectiveBracket(g, cue.x, cue.y, { pulse });
}

function drawWaypointEdgeArrow(g, cue, now, reducedMotion) {
  const pulse = reducedMotion ? 0 : 0.35 + 0.35 * Math.sin(now * 0.0042);
  drawObjectiveBracket(g, cue.x, cue.y, {
    offRange: true,
    unresolved: !cue.resolved,
    angle: cue.angle,
    pulse,
  });
}

export function placeRadarObjectiveLabel(textWidth, markerX, markerY, size, center, radius) {
  const viewport = Math.max(24, Number(size) || 0);
  const c = Number.isFinite(center) ? center : viewport / 2;
  const r = Math.max(12, Number(radius) || viewport / 2 - 4);
  const width = Math.min(viewport - 8, Math.max(36, Math.ceil(Number(textWidth) || 0) + 10));
  const height = 18;
  const x = Number(markerX) || c;
  const y = Number(markerY) || c;
  const horizontalGap = 14;
  const verticalGap = 13;
  const preferLeft = x >= c;
  const preferAbove = y >= c;
  const candidates = [
    { x: preferLeft ? x - horizontalGap - width : x + horizontalGap, y: y - height / 2 },
    { x: x - width / 2, y: preferAbove ? y - verticalGap - height : y + verticalGap },
    { x: preferLeft ? x + horizontalGap : x - horizontalGap - width, y: y - height / 2 },
    { x: x - width / 2, y: preferAbove ? y + verticalGap : y - verticalGap - height },
  ];
  const playerSafe = { x: c - 16, y: c - 16, width: 32, height: 32 };
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  for (const candidate of candidates) {
    const rect = {
      x: clamp(candidate.x, 4, viewport - 4 - width),
      y: clamp(candidate.y, 4, viewport - 4 - height),
      width,
      height,
    };
    const overlapsPlayer = rect.x < playerSafe.x + playerSafe.width
      && rect.x + rect.width > playerSafe.x
      && rect.y < playerSafe.y + playerSafe.height
      && rect.y + rect.height > playerSafe.y;
    if (!overlapsPlayer || Math.hypot(x - c, y - c) < 20) return rect;
  }
  const angle = Math.atan2(y - c, x - c);
  return {
    x: clamp(c + Math.cos(angle) * Math.min(r * 0.55, 36) - width / 2, 4, viewport - 4 - width),
    y: clamp(c + Math.sin(angle) * Math.min(r * 0.55, 36) - height / 2, 4, viewport - 4 - height),
    width,
    height,
  };
}

function drawObjectiveLabel(g, cue) {
  if (!cue) return;
  g.save();
  g.font = canvasFont(700, 12, 'data');
  const text = cue.resolved
    ? `${cue.label}  ${formatRadarDistance(cue.distance)}`
    : `${cue.label}  ROUTE`;
  const measured = g.measureText ? g.measureText(text).width : text.length * 7;
  const placement = placeRadarObjectiveLabel(
    measured,
    cue.x,
    cue.y,
    cue.metrics.size,
    cue.metrics.center,
    cue.metrics.radius,
  );
  g.fillStyle = 'rgba(11,13,16,0.95)';
  g.fillRect(placement.x, placement.y, placement.width, placement.height);
  g.strokeStyle = 'rgba(217,160,84,0.6)';
  g.lineWidth = 1;
  g.strokeRect(placement.x + 0.5, placement.y + 0.5, placement.width - 1, placement.height - 1);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = TACTICAL_MAP_PALETTE.objective;
  g.fillText(text, placement.x + 5, placement.y + placement.height / 2 + 0.5);
  g.restore();
}

// Range plate layout is a pure function of (range, expanded, metrics.size). Cache it so
// settled flight does not re-measureText + lift-search every HUD frame (cpu-profile-flight:
// drawRangePlate ~102 ms self over 60 s settled).
const _rangePlateCache = {
  range: NaN,
  expanded: null,
  size: NaN,
  text: '',
  width: 0,
  height: 18,
  x: 0,
  y: 0,
};

function rangePlateLayout(metrics, range, expanded) {
  const size = metrics.size;
  if (
    _rangePlateCache.range === range
    && _rangePlateCache.expanded === expanded
    && _rangePlateCache.size === size
  ) {
    return _rangePlateCache;
  }
  const text = `RANGE ${formatRadarDistance(range)}`;
  if (!_rangePlateCache._probe) {
    const c = typeof document !== 'undefined' && document.createElement
      ? document.createElement('canvas')
      : null;
    _rangePlateCache._probe = c ? c.getContext('2d') : null;
  }
  const probe = _rangePlateCache._probe;
  let width;
  if (probe) {
    probe.font = canvasFont(700, 12, 'data');
    width = Math.ceil(probe.measureText(text).width) + 12;
  } else {
    width = text.length * 7 + 12;
  }
  const height = 18;
  const radius = size / 2;
  let lift = 8;
  for (let i = 0; i < 40; i++) {
    const dx = width / 2;
    const dy = radius - lift;
    if (Math.hypot(dx, dy) <= radius - 4) break;
    lift += 2;
  }
  _rangePlateCache.range = range;
  _rangePlateCache.expanded = expanded;
  _rangePlateCache.size = size;
  _rangePlateCache.text = text;
  _rangePlateCache.width = width;
  _rangePlateCache.height = height;
  _rangePlateCache.x = Math.round(radius - width / 2);
  _rangePlateCache.y = size - lift - height;
  return _rangePlateCache;
}

function drawRangePlate(g, metrics, range, expanded) {
  const layout = rangePlateLayout(metrics, range, expanded);
  g.save();
  g.font = canvasFont(700, 12, 'data');
  g.fillStyle = 'rgba(11,13,16,0.90)';
  g.fillRect(layout.x, layout.y, layout.width, layout.height);
  g.strokeStyle = 'rgba(174,183,182,0.42)';
  g.lineWidth = 1;
  g.strokeRect(layout.x + 0.5, layout.y + 0.5, layout.width - 1, layout.height - 1);
  g.fillStyle = expanded ? TACTICAL_MAP_PALETTE.ink : TACTICAL_MAP_PALETTE.inkDim;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(layout.text, layout.x + 6, layout.y + layout.height / 2 + 0.5);
  g.restore();
}

function drawHeatZone(g, zone, playerX, playerZ, scale, center, radius) {
  if (!zone || !zone.active || !(zone.radius > 0) || !(zone.level > 0)) return;
  const zoneX = Number.isFinite(zone.center && zone.center.x) ? zone.center.x : 0;
  const zoneZ = Number.isFinite(zone.center && zone.center.z) ? zone.center.z : 0;
  const dx = zoneX - playerX;
  const dz = zoneZ - playerZ;
  const x = center - dx * scale;
  const y = center - dz * scale;
  const zoneRadius = Math.max(2, zone.radius * scale);
  const outside = dx * dx + dz * dz > zone.radius * zone.radius;
  const clearAfter = zone.clearAfterS || 0;
  const remaining = outside && clearAfter > 0
    ? Math.max(0, Math.ceil(clearAfter - (zone.outsideS || 0)))
    : 0;

  g.save();
  g.beginPath();
  g.arc(center, center, radius, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = 'rgba(255,84,112,0.03)';
  g.strokeStyle = outside ? 'rgba(255,205,95,0.68)' : 'rgba(255,84,112,0.58)';
  g.lineWidth = outside ? 1.25 : 1;
  g.setLineDash(outside ? [7, 4] : [4, 5]);
  g.beginPath();
  g.arc(x, y, zoneRadius, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.setLineDash([]);
  g.restore();

  g.save();
  g.font = canvasFont(700, 12, 'data');
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.fillStyle = outside ? 'rgba(255,205,95,0.94)' : 'rgba(255,84,112,0.88)';
  g.fillText(remaining > 0 ? `HEAT ${zone.level}  ${remaining}S` : `HEAT ${zone.level}`, center, center + radius - 5);
  g.restore();
}

// Kit sweep geometry (assets/ui/kit/assets/svg/radar/radar-sweep.svg): a short sector trailing
// the sweep line — bright at the leading edge, falling off across a 45° tail — ported to this
// canvas as a conic gradient so it scales with the dial. Instrument-grade: the wedge peaks at the
// same alpha family as the old line, it does not glow. Reduced motion keeps the same wedge frozen
// at north, exactly where the old static line sat.
const SWEEP_TRAIL_ANGLE = Math.PI / 4;
function drawRadarSweep(g, center, radius, angle) {
  g.save();
  g.beginPath();
  g.moveTo(center, center);
  g.arc(center, center, radius, angle - SWEEP_TRAIL_ANGLE, angle);
  g.closePath();
  if (typeof g.createConicGradient === 'function') {
    const gradient = g.createConicGradient(angle - SWEEP_TRAIL_ANGLE, center, center);
    gradient.addColorStop(0, 'rgba(232,226,212,0)');
    gradient.addColorStop(SWEEP_TRAIL_ANGLE / (Math.PI * 2), 'rgba(232,226,212,0.09)');
    gradient.addColorStop(1, 'rgba(232,226,212,0)');
    g.fillStyle = gradient;
  } else {
    g.fillStyle = 'rgba(232,226,212,0.045)';
  }
  g.fill();
  g.strokeStyle = 'rgba(232,226,212,0.12)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(center, center);
  g.lineTo(center + Math.cos(angle) * radius, center + Math.sin(angle) * radius);
  g.stroke();
  g.restore();
}

function drawBackground(g, center, radius, { grid = true } = {}) {
  g.clearRect(0, 0, center * 2, center * 2);
  // Dark ground first: every mark on this dial is small, so contrast has to come from the plate.
  const gradient = g.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, 'rgba(13,16,20,0.82)');
  gradient.addColorStop(0.68, 'rgba(15,19,24,0.62)');
  gradient.addColorStop(1, 'rgba(28,33,41,0.38)');
  g.fillStyle = gradient;
  g.beginPath();
  g.arc(center, center, radius, 0, Math.PI * 2);
  g.fill();

  g.save();
  g.beginPath();
  g.arc(center, center, radius, 0, Math.PI * 2);
  g.clip();
  g.strokeStyle = 'rgba(232,226,212,0.04)';
  g.lineWidth = 1;
  // The square grid is the legacy face; under the ORRERY frame the scope is rings and a dotted cross.
  const step = grid ? radius / 3 : Infinity;
  for (let d = step; d <= radius; d += step) {
    g.beginPath();
    g.moveTo(center - d, center - radius);
    g.lineTo(center - d, center + radius);
    g.moveTo(center + d, center - radius);
    g.lineTo(center + d, center + radius);
    g.moveTo(center - radius, center - d);
    g.lineTo(center + radius, center - d);
    g.moveTo(center - radius, center + d);
    g.lineTo(center + radius, center + d);
    g.stroke();
  }
  for (const fraction of [0.25, 0.5, 1]) {
    g.strokeStyle = fraction === 1
      ? 'rgba(232,226,212,0.16)'
      : 'rgba(232,226,212,0.065)';
    g.lineWidth = fraction === 1 ? 1.25 : 1;
    g.beginPath();
    g.arc(center, center, radius * fraction, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = 'rgba(232,226,212,0.08)';
  g.beginPath();
  g.moveTo(center, center - radius);
  g.lineTo(center, center + radius);
  g.moveTo(center - radius, center);
  g.lineTo(center + radius, center);
  g.stroke();
  g.restore();
}

// ---- ORRERY frame (design/frontend/ORRERY.md §6 Radar Orrery) ------------------------------------
// The canvas stays the dense data layer (contacts, rocks, trails, the lead pip); the instrument
// around it is ORRERY light: the rim, a drifting tick orbit, north, the range ENGRAVED along the
// lower rim (it was a boxed chip on the canvas), and the amber Hand pointing at the objective. It is
// built in canvas coordinates, so every mark lines up with what the canvas draws.
const FRAME_PAD = 30;
function createRadarFrame(size, center, radius) {
  injectOrrery();
  const root = orrSvg('svg', {
    class: 'orr-svg sf-radar-orrery',
    viewBox: `${-FRAME_PAD} ${-FRAME_PAD} ${size + FRAME_PAD * 2} ${size + FRAME_PAD * 2}`,
    'aria-hidden': 'true',
  });
  root.appendChild(orrRing({ cx: center, cy: center, r: radius + 0.5, tone: 'rest', width: 1, bloom: 4 }));
  root.appendChild(orbitRing({ cx: center, cy: center, r: radius + 5, count: 72, major: 6, len: 3, majorLen: 7, tone: 'rest', drift: -2400, inward: false }).el);
  root.appendChild(orrSvg('path', {
    d: `M ${center - 4.5} ${center - radius - 13} L ${center} ${center - radius - 19} L ${center + 4.5} ${center - radius - 13}`,
    class: 'orr-core orr-hi', 'stroke-width': 1.2, fill: 'none',
  }));
  const north = orrSvg('text', { x: center, y: center - radius - 22, 'text-anchor': 'middle', 'font-size': 9 });
  north.textContent = 'N';
  root.appendChild(north);
  const objective = orrHand({ cx: center, cy: center, r0: radius - 18, r1: radius + 13, width: 1.5, pip: 4 });
  objective.el.setAttribute('opacity', '0');
  root.appendChild(objective.el);
  let rangeText = null;
  let rangeNode = null;
  let bearingNow = null;
  return {
    el: root,
    setRange(text) {
      if (text === rangeText) return;
      rangeText = text;
      if (rangeNode) rangeNode.remove();
      rangeNode = circularText(center, center, radius + 17, `RANGE  ${text}`.toUpperCase(),
        { startDeg: 270, size: 8, className: 'orr-micro orr-micro--hi', anchor: 'middle', upright: true });
      root.appendChild(rangeNode);
    },
    /** bearing in degrees (0 = up, clockwise) or null for no objective */
    setObjective(bearing) {
      if (bearing === bearingNow) return;
      if (bearing == null) { objective.el.setAttribute('opacity', '0'); bearingNow = null; return; }
      if (bearingNow == null) { objective.el.setAttribute('opacity', '1'); objective.pointTo(bearing, { instant: true }); }
      else objective.pointTo(bearing);
      bearingNow = bearing;
    },
    dispose() { objective.dispose(); root.remove(); },
  };
}

export function createRadar(ctx) {
  const { state, bus } = ctx;
  const wrap = document.createElement('div');
  wrap.className = 'sf-radar-wrap';

  const dial = document.createElement('div');
  dial.className = 'sf-radar';
  dial.title = 'Local tactical radar — click for expanded sensor range';
  dial.style.position = 'relative';

  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const canvas = document.createElement('canvas');
  canvas.className = 'sf-radar-semantic-canvas';
  canvas.setAttribute('role', 'img');
  const backgroundCanvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  const background = backgroundCanvas.getContext('2d');
  if (!g || !background) {
    wrap.appendChild(dial);
    return { el: wrap, draw() {}, invalidate() {}, destroy() {} };
  }

  let configuredSize = 0;
  let configuredCenter = COMPACT_C;
  let configuredRadius = COMPACT_R;
  let expanded = false;
  let orreryFrame = false;
  let frame = null;
  function mountOrreryFrame() {
    if (frame) frame.dispose();
    frame = createRadarFrame(configuredSize, configuredCenter, configuredRadius);
    // Inside the dial, sized in percent of it, so the frame tracks the dial through every responsive
    // size (220 / 200 / 132) and the expanded scope without a layout read.
    const span = `${(((configuredSize + FRAME_PAD * 2) / configuredSize) * 100).toFixed(3)}%`;
    frame.el.style.cssText = `position:absolute;left:50%;top:50%;width:${span};height:${span};transform:translate(-50%,-50%);pointer-events:none;overflow:visible;z-index:1;`;
    dial.appendChild(frame.el);
  }
  /** Hand the instrument's frame to ORRERY: the canvas keeps the data, the rim/range/north move out. */
  function setOrreryFrame(on) {
    orreryFrame = !!on;
    wrap.classList.toggle('sf-radar-wrap--orrery', orreryFrame);
    drawBackground(background, configuredCenter, configuredRadius, { grid: !orreryFrame });
    if (orreryFrame) mountOrreryFrame();
    else if (frame) { frame.dispose(); frame = null; }
  }

  function configureCanvas(size, center, radius) {
    if (configuredSize === size) return;
    configuredSize = size;
    configuredCenter = center;
    configuredRadius = radius;
    const pixels = Math.round(size * dpr);
    canvas.width = pixels;
    canvas.height = pixels;
    backgroundCanvas.width = pixels;
    backgroundCanvas.height = pixels;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    background.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    background.imageSmoothingEnabled = true;
    drawBackground(background, center, radius, { grid: !orreryFrame });
    if (orreryFrame) mountOrreryFrame();
  }

  configureCanvas(COMPACT_SIZE, COMPACT_C, COMPACT_R);
  dial.appendChild(canvas);

  const objectiveKey = document.createElement('div');
  objectiveKey.className = 'sf-radar-objective-key sf-radar-semantic-key mono';
  objectiveKey.hidden = false;
  wrap.append(dial, objectiveKey);

  const parityTeardown = installMapParityBridge();

  function setExpanded(value) {
    expanded = !!value;
    dial.classList.toggle('sf-radar--expanded', expanded);
    wrap.classList.toggle('sf-radar-wrap--expanded', expanded);
    if (expanded) configureCanvas(EXPAND_SIZE, EXPAND_C, EXPAND_R);
    else configureCanvas(COMPACT_SIZE, COMPACT_C, COMPACT_R);
    wrap.style.cssText = expanded
      ? 'position:fixed;bottom:18px;right:18px;z-index:200;display:flex;flex-direction:column;align-items:center;gap:6px;'
      : '';
  }

  const onDialClick = () => setExpanded(!expanded);
  dial.addEventListener('click', onDialClick);

  let contactList = [];
  let asteroidList = [];
  let contactsDirty = true;
  let cachedEntityList = null;
  let cachedLength = -1;
  let cachedPlayerId = null;
  let mergedAsteroids = null;
  let cachedFieldVersion = -1;
  let cachedLiveAsteroids = null;
  let cachedLiveLen = -1;
  const radarQueryScratch = [];
  const fieldCellCounts = new Uint16Array(ASTEROID_FIELD_CELLS * ASTEROID_FIELD_CELLS);
  const nearRockSlots = Array.from({ length: ASTEROID_DOT_LIMIT }, () => ({ x: 0, y: 0, distanceSq: Infinity }));
  // Asteroid still-layer cache (see censusRadarAsteroidStillLayer).
  const asteroidStillCache = createRadarAsteroidStillCache();
  const hostileMarks = [];
  const infrastructureMarks = [];
  // Retained projection + mark slots: projectRadarPoint used to Object.freeze a fresh record
  // per contact, and each mark held that record. Scratch + pooled mark rows keep picture
  // identical (x/y/angle/offRange copied into the mark) without per-draw alloc.
  const projectScratch = {
    x: 0, y: 0, dx: 0, dz: 0, distance: 0, offRange: false, angle: 0, scale: 0, resolved: true,
  };
  // Second scratch for the lead-line path: aim point and target point are both projected in one
  // stroke, so they cannot share a single out record.
  const projectScratchB = {
    x: 0, y: 0, dx: 0, dz: 0, distance: 0, offRange: false, angle: 0, scale: 0, resolved: true,
  };
  const hostileMarkPool = [];
  const infrastructureMarkPool = [];
  const neutralMarkPool = [];
  const neutralMarks = [];
  const contactsStillCache = createRadarContactsStillCache();
  function pushHostileMark(entity, projected, distanceSq) {
    let mark = hostileMarkPool[hostileMarks.length];
    if (!mark) {
      mark = { entity: null, x: 0, y: 0, distanceSq: 0 };
      hostileMarkPool[hostileMarks.length] = mark;
    }
    mark.entity = entity;
    mark.x = projected.x;
    mark.y = projected.y;
    mark.distanceSq = distanceSq;
    hostileMarks.push(mark);
  }
  function pushInfrastructureMark(entity, projected, gate, distanceSq, poi) {
    let mark = infrastructureMarkPool[infrastructureMarks.length];
    if (!mark) {
      mark = {
        entity: null, x: 0, y: 0, gate: false, offRange: false, angle: 0, distanceSq: 0,
        poiKind: null, poiProgress: 0,
      };
      infrastructureMarkPool[infrastructureMarks.length] = mark;
    }
    mark.entity = entity;
    mark.x = projected.x;
    mark.y = projected.y;
    mark.gate = gate;
    mark.offRange = projected.offRange;
    mark.angle = projected.angle;
    mark.distanceSq = distanceSq;
    mark.poiKind = poi && poi.radarKind || null;
    mark.poiProgress = poiProgressRatio(poi);
    infrastructureMarks.push(mark);
  }
  function pushNeutralMark(entity, projected, distanceSq, meta) {
    let mark = neutralMarkPool[neutralMarks.length];
    if (!mark) {
      mark = {
        entity: null, x: 0, y: 0, distanceSq: 0,
        heading: null, type: '', selected: false, named: false, wantsTrail: false,
        poiKind: null, poiProgress: 0,
      };
      neutralMarkPool[neutralMarks.length] = mark;
    }
    mark.entity = entity;
    mark.x = projected.x;
    mark.y = projected.y;
    mark.distanceSq = distanceSq;
    mark.heading = meta.heading;
    mark.type = meta.type;
    mark.selected = meta.selected;
    mark.named = meta.named;
    mark.wantsTrail = meta.wantsTrail;
    mark.poiKind = meta.poi && meta.poi.radarKind || null;
    mark.poiProgress = poiProgressRatio(meta.poi);
    neutralMarks.push(mark);
  }
  // Reused option records for the glyph draw calls. The draw functions destructure and read
  // only; nothing retains these between contacts.
  const neutralOpts = { selected: false, named: false, playerTeam: null, state: null };
  const hostileOpts = { selected: false, capital: false };
  const glyphOpts = { offRange: false, angle: 0 };
  const zeroVel = { x: 0, z: 0 };
  let trailPruneCountdown = 0;
  let lastAriaLabel = '';
  const unsubscribers = [];

  function markContactsDirty() {
    contactsDirty = true;
  }

  function onSectorEnter() {
    clearAllTrails();
    if (expanded) setExpanded(false);
    markContactsDirty();
    asteroidStillCache.armed = false;
    asteroidStillCache.rescanDraws = 0;
  }

  if (bus && typeof bus.on === 'function') {
    for (const [event, handler] of [
      ['entity:spawned', markContactsDirty],
      ['entity:destroyed', markContactsDirty],
      ['game:started', markContactsDirty],
      ['save:loaded', markContactsDirty],
      ['sector:enter', onSectorEnter],
    ]) {
      const off = bus.on(event, handler);
      if (typeof off === 'function') unsubscribers.push(off);
    }
  }

  function isRadarContact(entity, player) {
    if (!entity || entity === player) return false;
    return entity.type !== 'projectile' && entity.type !== 'fx';
  }

  function indexedRadarContacts() {
    const index = state.entityIndex;
    if (!index || !index.__spacefaceEntityIndexV1) return null;
    if (!Array.isArray(index.radarContacts) || !Array.isArray(index.radarAsteroids)) return null;
    return index;
  }

  function refreshContacts(player) {
    if (indexedRadarContacts()) return;
    const list = state.entityList;
    if (!Array.isArray(list)) return;
    if (
      !contactsDirty
      && cachedEntityList === list
      && cachedLength === list.length
      && cachedPlayerId === state.playerId
    ) return;

    contactList = [];
    asteroidList = [];
    for (let i = 0; i < list.length; i += 1) {
      const entity = list[i];
      if (!isRadarContact(entity, player)) continue;
      if (entity.type === 'asteroid') asteroidList.push(entity);
      else contactList.push(entity);
    }
    cachedEntityList = list;
    cachedLength = list.length;
    cachedPlayerId = state.playerId;
    contactsDirty = false;
  }

  function contactsFor(player) {
    const index = indexedRadarContacts();
    if (index) return index.radarContacts;
    refreshContacts(player);
    return contactList;
  }

  function asteroidsFor(player) {
    const index = indexedRadarContacts();
    const live = index ? index.radarAsteroids : (refreshContacts(player), asteroidList);
    const field = state.world && state.world.asteroidField;
    const rocks = field && Array.isArray(field.rocks) ? field.rocks : null;
    if (!rocks || rocks.length === 0) return live;
    if (
      mergedAsteroids
      && cachedFieldVersion === field.version
      && cachedLiveAsteroids === live
      && cachedLiveLen === live.length
    ) return mergedAsteroids;
    mergedAsteroids = live.slice();
    for (let i = 0; i < rocks.length; i++) {
      const rec = rocks[i];
      if (!rec || rec.alive === false || rec.liveEntityId != null) continue;
      mergedAsteroids.push(rec);
    }
    cachedFieldVersion = field.version;
    cachedLiveAsteroids = live;
    cachedLiveLen = live.length;
    return mergedAsteroids;
  }

  function nearbyAsteroidCandidates(playerX, playerZ, range, asteroidCount) {
    const hash = state.spatialHash;
    if (!hash || typeof hash.queryRadius !== 'function') return null;
    if (!hash.diagnostics || !(hash.diagnostics.activeBuckets > 0)) return null;
    if (asteroidCount < RADAR_SPATIAL_MIN_ASTEROIDS) return null;
    const queryRadius = range + RADAR_QUERY_RADIUS_PAD;
    const cell = Math.max(1, hash.cell || 64);
    const x0 = Math.floor((playerX - queryRadius) / cell);
    const x1 = Math.floor((playerX + queryRadius) / cell);
    const z0 = Math.floor((playerZ - queryRadius) / cell);
    const z1 = Math.floor((playerZ + queryRadius) / cell);
    const rectangularVisits = (x1 - x0 + 1) * (z1 - z0 + 1);
    const activeBuckets = hash.diagnostics.activeBuckets
      || (hash._activeBuckets && hash._activeBuckets.length)
      || 0;
    const estimatedVisits = rectangularVisits > activeBuckets * 3
      ? activeBuckets
      : rectangularVisits;
    if (estimatedVisits > asteroidCount * RADAR_QUERY_VISIT_RATIO_LIMIT) return null;
    radarQueryScratch.length = 0;
    hash.queryRadius(playerX, playerZ, queryRadius, radarQueryScratch, { countDiagnostics: false });
    return radarQueryScratch;
  }

  function updateObjectiveKey(waypoint, cue) {
    if (waypoint) {
      const label = waypointLabel(waypoint);
      const wpLabel = label;
      const legacyIdentity = `◆ AMBER DIAMOND · ${wpLabel}`;
      const distance = cue && cue.resolved ? formatRadarDistance(cue.distance) : 'ROUTE PENDING';
      // The diamond alone keys the objective: the corner-bracket glyphs meant to picture the
      // scope's four-corner bracket rendered as stray marks at caption size.
      const nextText = `◆  OBJ  ${distance}  ·  ${label}`;
      if (objectiveKey.textContent !== nextText) objectiveKey.textContent = nextText;
      objectiveKey.title = `${legacyIdentity} · FOUR-CORNER BRACKET · ROUTE CORRIDOR`;
      objectiveKey.dataset.mode = 'objective';
      return;
    }
    const legend = 'YOU HULL · RED HOSTILE · CYAN STATION · VIOLET GATE · GREEN ALLY · GREY TRAFFIC CLOSE ONLY';
    if (objectiveKey.textContent !== legend) objectiveKey.textContent = legend;
    objectiveKey.removeAttribute('title');
    objectiveKey.dataset.mode = 'legend';
  }

  function draw() {
    if (expanded) configureCanvas(EXPAND_SIZE, EXPAND_C, EXPAND_R);
    else configureCanvas(COMPACT_SIZE, COMPACT_C, COMPACT_R);

    const metrics = tacticalRadarMetrics(expanded);
    const size = configuredSize;
    const center = configuredCenter;
    const radius = configuredRadius;
    const baseRange = (state.ui && state.ui.radarRange) || 4000;
    const range = expanded ? baseRange * 2 : baseRange;
    const rangeSq = range * range;
    const radarScale = radius / range;
    const now = (Number.isFinite(state.simTime) ? state.simTime : 0) * 1000;
    const reducedMotion = prefersReducedMotion();

    g.clearRect(0, 0, size, size);
    g.drawImage(backgroundCanvas, 0, 0, size, size);

    // One crisp sweep line preserves sensor motion without washing the entire instrument in bloom.
    const sweepAngle = reducedMotion ? -Math.PI / 2 : ((now % 3600) / 3600) * Math.PI * 2;
    drawRadarSweep(g, center, radius, sweepAngle);

    if (!frame) {
      g.save();
      g.fillStyle = 'rgba(232,226,212,0.62)';
      g.font = canvasFont(700, 12, 'data');
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText('N', center, center - radius + 14);
      g.restore();
    }

    const player = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    if (!player || !player.pos) {
      updateObjectiveKey(null, null);
      return;
    }

    const playerX = player.pos.x;
    const playerZ = player.pos.z;
    const targetId = state.player && state.player.targetId;
    const playerTeam = player.team;
    const colorblindMode = (
      state.settings
      && state.settings.accessibility
      && state.settings.accessibility.colorblindMode
    ) || 'none';

    drawHeatZone(g, heatZoneInCurrentSector(state), playerX, playerZ, radarScale, center, radius);

    const rangeRatio = rangeRingRatioForEntity(player, range);
    const weaponRingRadius = radius * rangeRatio;
    g.save();
    g.lineWidth = 1;
    // Graduated two-tone: a major dash plus a minor tick riding each gap, the instrument-grammar
    // way of making the engagement ring read as a measurement rather than a decorative circle.
    g.strokeStyle = 'rgba(242,185,80,0.15)';
    g.setLineDash([3, 4]);
    g.beginPath();
    g.arc(center, center, weaponRingRadius, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(242,185,80,0.07)';
    g.setLineDash([1, 6]);
    g.lineDashOffset = 4.5;
    g.stroke();
    g.setLineDash([]);
    g.lineDashOffset = 0;
    g.restore();

    const contacts = contactsFor(player);
    const asteroidFallback = asteroidsFor(player);
    const asteroidSource = nearbyAsteroidCandidates(
      playerX,
      playerZ,
      range,
      asteroidFallback.length,
    ) || asteroidFallback;

    if (trailPruneCountdown-- <= 0) {
      trailPruneCountdown = TRAIL_PRUNE_INTERVAL;
      for (const id of trailMap.keys()) {
        if (!state.entities.has(id)) {
          releaseTrailHistory(trailMap.get(id));
          trailMap.delete(id);
        }
      }
    }

    const field = state.world && state.world.asteroidField;
    const fieldVersion = field && Number.isFinite(field.version) ? field.version : 0;
    const index = state.entityIndex;
    const indexVersion = index && index.__spacefaceEntityIndexV1 ? (index.version || 0) : -1;
    const asteroidCensus = censusRadarAsteroidStillLayer({
      asteroidSource,
      player,
      playerX,
      playerZ,
      range,
      rangeSq,
      radarScale,
      center,
      size,
      targetId,
      fieldVersion,
      indexVersion,
      entities: state.entities,
      fieldCellCounts,
      nearRockSlots,
      cache: asteroidStillCache,
    });
    const fieldOccupied = asteroidCensus.fieldOccupied;
    const nearRockCount = asteroidCensus.nearRockCount;
    const targetAsteroid = asteroidCensus.targetAsteroid;
    const fieldCellPx = size / ASTEROID_FIELD_CELLS;
    if (fieldOccupied) {
      g.save();
      g.beginPath();
      g.arc(center, center, radius, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = TACTICAL_MAP_PALETTE.asteroid;
      for (let key = 0; key < fieldCellCounts.length; key++) {
        const count = fieldCellCounts[key];
        if (!count) continue;
        const gx = key % ASTEROID_FIELD_CELLS;
        const gy = (key - gx) / ASTEROID_FIELD_CELLS;
        g.globalAlpha = Math.min(0.13, 0.03 + count * 0.011);
        g.beginPath();
        g.arc((gx + 0.5) * fieldCellPx, (gy + 0.5) * fieldCellPx, fieldCellPx * 0.58, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    g.save();
    g.globalAlpha = 0.55;
    g.fillStyle = TACTICAL_MAP_PALETTE.asteroid;
    // One path, one fill: identical pixels to per-blip fills (same colour, non-overlapping diamonds).
    g.beginPath();
    for (let i = 0; i < nearRockCount; i++) {
      const slot = nearRockSlots[i];
      g.moveTo(slot.x, slot.y - 1.7);
      g.lineTo(slot.x + 1.7, slot.y);
      g.lineTo(slot.x, slot.y + 1.7);
      g.lineTo(slot.x - 1.7, slot.y);
      g.closePath();
    }
    if (nearRockCount) g.fill();
    g.restore();
    if (targetAsteroid) drawTargetRing(g, targetAsteroid.x, targetAsteroid.y, center);

    // Contact still-layer census: when quantized player + contact-pose signature hold,
    // reuse retained marks (skip projection/hostility). Glyph paint always runs so pickup
    // pulses and threat rings keep live `now` (picture contract).
    const contactCensus = censusRadarContactsStillLayer({
      contacts,
      player,
      playerTeam,
      state,
      range,
      rangeSq,
      metrics,
      targetId,
      projectScratch,
      pushHostileMark,
      pushInfrastructureMark,
      pushNeutralMark,
      hostileMarks,
      infrastructureMarks,
      neutralMarks,
      cache: contactsStillCache,
      updateTrailFn: updateTrail,
      maxTrailUpdates: MAX_TRAIL_UPDATES,
    });
    const hostileCount = contactCensus.hostileCount;
    const salientContactCount = contactCensus.salients;
    const nearestOffRangeHostile = contactCensus.nearestOffRangeHostile;

    // Paint trails + neutral glyphs from retained marks (live colour / pulse).
    for (let i = 0; i < hostileMarks.length; i += 1) {
      const mark = hostileMarks[i];
      const entity = mark.entity;
      if (!entity) continue;
      const type = entity.type;
      if ((type === 'ship' || type === 'drone') && trailMap.has(entity.id)) {
        const colour = contactColor(entity, playerTeam, colorblindMode, state);
        drawTrail(g, entity, playerX, playerZ, radarScale, center, colour);
      }
    }
    for (let i = 0; i < neutralMarks.length; i += 1) {
      const mark = neutralMarks[i];
      const entity = mark.entity;
      if (!entity) continue;
      const x = mark.x;
      const y = mark.y;
      const type = mark.type;
      const colour = contactColor(entity, playerTeam, colorblindMode, state);
      if (mark.wantsTrail || trailMap.has(entity.id)) {
        drawTrail(g, entity, playerX, playerZ, radarScale, center, colour);
      }
      if (type === 'pickup') {
        const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now * 0.005);
        const beaconPath = glyphPathFor('beacon');
        g.save();
        g.globalAlpha = 0.7 + 0.3 * pulse;
        g.fillStyle = '#ffd98c';
        g.translate(x, y);
        if (!reducedMotion) g.rotate((now * 0.0008) % (Math.PI * 2));
        if (beaconPath) {
          g.scale(GLYPH_SCALE_NEUTRAL, GLYPH_SCALE_NEUTRAL);
          g.fill(beaconPath);
        } else {
          g.beginPath();
          g.moveTo(0, -4.5);
          g.lineTo(4, 0);
          g.lineTo(0, 4.5);
          g.lineTo(-4, 0);
          g.closePath();
          g.fill();
        }
        g.restore();
      } else if (type === 'wreck') {
        const wreckPath = glyphPathFor('wreck');
        g.save();
        g.strokeStyle = TACTICAL_MAP_PALETTE.wreck;
        g.lineWidth = 1.5;
        if (wreckPath) {
          g.translate(x, y);
          g.scale(GLYPH_SCALE_NEUTRAL, GLYPH_SCALE_NEUTRAL);
          g.lineWidth = 1.5 / GLYPH_SCALE_NEUTRAL;
          g.stroke(wreckPath);
        } else {
          g.beginPath();
          g.moveTo(x - 3, y - 3);
          g.lineTo(x + 3, y + 3);
          g.moveTo(x - 3, y + 3);
          g.lineTo(x + 3, y - 3);
          g.stroke();
        }
        g.restore();
      } else {
        neutralOpts.selected = mark.selected;
        neutralOpts.named = mark.named;
        neutralOpts.playerTeam = playerTeam;
        neutralOpts.state = state;
        drawNeutralContact(g, entity, x, y, mark.heading, colour, neutralOpts);
      }
      if (mark.poiKind) drawPoiClassMark(g, x, y, mark.poiProgress);
      if (mark.selected) drawTargetRing(g, x, y, center);
    }

    const swarmQuiet = hostileCount >= SWARM_DENSITY_THRESHOLD;
    hostileMarks.sort((a, b) => (
      a.entity.id === targetId ? -1
        : b.entity.id === targetId ? 1
          : a.distanceSq - b.distanceSq
    ));
    infrastructureMarks.sort((a, b) => a.distanceSq - b.distanceSq);

    const hostileMarkCount = Math.min(hostileMarks.length, MAX_SEMANTIC_HOSTILES);
    for (let i = 0; i < hostileMarkCount; i += 1) {
      const mark = hostileMarks[i];
      const selected = mark.entity.id === targetId;
      hostileOpts.selected = selected;
      hostileOpts.capital = isCapitalContact(mark.entity);
      const hostileGlyphKey = contactGlyphKey(mark.entity);
      if (!(hostileGlyphKey
        && drawHostileSilhouette(g, hostileGlyphKey, mark.x, mark.y, entityHeading(mark.entity), hostileOpts)
      )) {
        // Unmapped class keeps the semantic hostile chevron.
        drawHostileGlyph(g, mark.x, mark.y, entityHeading(mark.entity), hostileOpts);
      }
      if (selected || !swarmQuiet) {
        drawContactThreatPulse(
          g,
          mark.x,
          mark.y,
          selected,
          now,
          reducedMotion,
        );
      }
      if (selected) drawTargetRing(g, mark.x, mark.y, center);
    }

    if (nearestOffRangeHostile) {
      const projected = projectRadarPoint(player.pos, nearestOffRangeHostile.pos, range, metrics, projectScratch);
      if (projected) {
        drawHostileEdgeMarker(g, projected.x, projected.y, projected.angle, nearestOffRangeHostile.id === targetId);
      }
    }

    const infrastructureMarkCount = Math.min(infrastructureMarks.length, MAX_SEMANTIC_INFRASTRUCTURE);
    for (let i = 0; i < infrastructureMarkCount; i += 1) {
      const mark = infrastructureMarks[i];
      glyphOpts.offRange = mark.offRange;
      glyphOpts.angle = mark.angle;
      if (mark.gate) {
        drawGateGlyph(g, mark.x, mark.y, glyphOpts);
      } else {
        drawStationGlyph(g, mark.x, mark.y, glyphOpts);
      }
      if (mark.poiKind) drawPoiClassMark(g, mark.x, mark.y, mark.poiProgress);
      if (mark.entity.id === targetId && !mark.offRange) {
        drawTargetRing(g, mark.x, mark.y, center);
      }
    }

    const sectorId = state.world && state.world.currentSectorId;
    const pings = sectorId && state.world.scanPings && state.world.scanPings[sectorId];
    if (Array.isArray(pings) || contactsHaveLivePing(contacts, state.simTime)) {
      g.save();
      g.font = canvasFont(700, 12, 'data');
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.strokeStyle = '#ffd24a';
      g.lineWidth = 1;
      const pulse = reducedMotion ? 0.7 : 0.5 + 0.5 * Math.sin(now * 0.015);
      g.globalAlpha = 0.5 + 0.5 * pulse;

      if (Array.isArray(pings)) {
        for (const ping of pings) {
          if (!ping || !ping.pos) continue;
          const projected = projectRadarPoint(player.pos, ping.pos, range, metrics, projectScratch);
          if (!projected || projected.offRange) continue;
          g.strokeText('?', projected.x, projected.y);
        }
      }
      for (const entity of contacts) {
        if (!entity || !entity.pos || !entity.alive || entity === player) continue;
        if (!(entity.data && entity.data.pingedUntil > (state.simTime || 0))) continue;
        const projected = projectRadarPoint(player.pos, entity.pos, range, metrics, projectScratch);
        if (!projected || projected.offRange) continue;
        g.strokeText('?', projected.x, projected.y);
      }
      g.restore();
    }

    if (targetId) {
      const target = state.entities.get(targetId);
      if (target && target.alive && target.pos) {
        const lead = solveIntercept(
          player.pos,
          player.vel || zeroVel,
          target.pos,
          target.vel || zeroVel,
          playerProjSpeed(player),
        );
        if (lead) {
          const leadPoint = projectRadarPoint(player.pos, lead.aimPoint, range, metrics, projectScratch);
          if (leadPoint) {
            g.save();
            g.strokeStyle = 'rgba(255,220,90,0.92)';
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(leadPoint.x - 3.5, leadPoint.y);
            g.lineTo(leadPoint.x + 3.5, leadPoint.y);
            g.moveTo(leadPoint.x, leadPoint.y - 3.5);
            g.lineTo(leadPoint.x, leadPoint.y + 3.5);
            g.stroke();
            if (!leadPoint.offRange) {
              const targetPoint = projectRadarPoint(player.pos, target.pos, range, metrics, projectScratchB);
              if (targetPoint) {
                g.setLineDash([2, 2]);
                g.beginPath();
                g.moveTo(targetPoint.x, targetPoint.y);
                g.lineTo(leadPoint.x, leadPoint.y);
                g.stroke();
                g.setLineDash([]);
              }
            }
            g.restore();
          }
        }
      }
    }

    const waypoint = state.nav && state.nav.waypoint;
    const waypointPos = resolveWaypointPresentationPosition(state, waypoint);
    const label = waypointLabel(waypoint);
    const cue = waypoint
      ? (
        waypointPos
          ? planObjectiveCue({
            playerPos: player.pos,
            waypointPos,
            range,
            hostileCount,
            contactCount: salientContactCount,
            expanded,
            label,
          })
          : planUnresolvedObjectiveCue({ expanded, label })
      )
      : null;

    drawObjectiveCorridor(g, cue);
    if (cue) {
      if (cue.offRange) drawWaypointEdgeArrow(g, cue, now, reducedMotion);
      else drawWaypointDiamond(g, cue, now, reducedMotion);
      if (expanded || cue.resolved === false) drawObjectiveLabel(g, cue);
    }
    updateObjectiveKey(waypoint, cue);
    if (frame) {
      // same frame as projectRadarPoint: screen = centre - (dx, dz) * scale, so 0 deg (up) is +z
      frame.setObjective(waypointPos
        ? Math.round(Math.atan2(-(waypointPos.x - player.pos.x), waypointPos.z - player.pos.z) * 180 / Math.PI)
        : null);
    }

    const beacons = state.beacons;
    if (Array.isArray(beacons) && beacons.length) {
      const beaconPulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now * 0.006);
      const beaconGlyph = glyphPathFor('beacon');
      g.save();
      g.strokeStyle = '#ffd24a';
      g.fillStyle = '#ffd24a';
      g.lineWidth = 1.2;
      for (const beacon of beacons) {
        if (!beacon || beacon.alive === false) continue;
        const projected = projectRadarPoint(
          player.pos,
          { x: beacon.x, z: beacon.z },
          range,
          metrics,
          projectScratch,
        );
        if (!projected || projected.offRange) continue;
        g.globalAlpha = 0.5 + beaconPulse * 0.4;
        g.beginPath();
        g.arc(projected.x, projected.y, 5.5 + beaconPulse * 2, 0, Math.PI * 2);
        g.stroke();
        if (beaconGlyph) {
          g.save();
          g.translate(projected.x, projected.y);
          g.scale(GLYPH_SCALE_NEUTRAL, GLYPH_SCALE_NEUTRAL);
          g.fill(beaconGlyph);
          g.restore();
        } else {
          g.beginPath();
          g.moveTo(projected.x, projected.y - 2.5);
          g.lineTo(projected.x + 2.5, projected.y);
          g.lineTo(projected.x, projected.y + 2.5);
          g.lineTo(projected.x - 2.5, projected.y);
          g.closePath();
          g.fill();
        }
      }
      g.restore();
    }

    // Self is the bracketed filled hull at the centre; a YOU caption under it collided with the
    // nearest contacts at every radar size, so the scope draws none.
    drawPlayerHull(g, center, center, player.rot, { label: false });
    drawThreatRing(g, metrics, hostileCount, now, reducedMotion);
    if (frame) frame.setRange(formatRadarDistance(range));
    else drawRangePlate(g, metrics, range, expanded);

    const ariaLabel = waypoint
      ? `Local tactical radar. You are the lit centre hull. Objective ${label}, ${formatRadarDistance(cue && cue.distance)}.`
      : 'Local tactical radar. You are the lit centre hull. Hostiles are red class silhouettes, stations are cyan berth hexagons, gates are violet double rings, allied ships are green, and nearby traffic is blue-grey. Distant small traffic stays off the dial.';
    if (ariaLabel !== lastAriaLabel) {
      lastAriaLabel = ariaLabel;
      canvas.setAttribute('aria-label', ariaLabel);
    }
  }

  function invalidate() {
    markContactsDirty();
    asteroidStillCache.armed = false;
    asteroidStillCache.rescanDraws = 0;
  }

  function destroy() {
    dial.removeEventListener('click', onDialClick);
    for (const unsubscribe of unsubscribers.splice(0)) {
      try { unsubscribe(); } catch (_) {}
    }
    try { parityTeardown(); } catch (_) {}
    if (frame) { frame.dispose(); frame = null; }
    clearAllTrails();
  }

  return { el: wrap, draw, invalidate, destroy, setOrreryFrame };
}

function drawContactThreatPulse(g, x, y, selected, now, reducedMotion) {
  const phase = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now * 0.0045);
  g.save();
  g.strokeStyle = TACTICAL_MAP_PALETTE.hostile;
  g.globalAlpha = selected ? 0.6 : 0.16 + 0.18 * phase;
  g.lineWidth = selected ? 1.5 : 1;
  g.beginPath();
  g.arc(x, y, selected ? 9.5 : 8 + phase * 2, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}
