// Second-generation tactical radar.
//
// The radar is a decision instrument, not a miniature screenshot of space. Its primary classes are
// drawn natively as crisp semantic glyphs; no canvas bloom is used. Shape, fill, outline weight,
// direction, and scale carry identity before colour does.
//
// World projection (fixed chase camera):
//   bx = C - (entity.x - player.x) / range * R
//   by = C - (entity.z - player.z) / range * R
//
// +X reads left and +Z reads up, matching the player-facing world view.
// Off-range threat policy: the nearest hostile becomes a hollow chevron at the rim; persistent
// infrastructure keeps its own hex/ring identity rather than masquerading as another arrow.

import { semanticColor, semanticShape } from './accessibility.js';
import { solveIntercept } from '../core/flight/flightTelemetry.js';
import { isHostileToPlayer } from '../systems/scanner.js';
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

const FACTION_COLOR = Object.freeze({
  faction_scn: '#4DA8FF',
  faction_mts: '#46E08A',
  faction_dmc: '#C9772E',
  faction_reach: '#FF4D5E',
  faction_quiet: '#B06CFF',
  faction_vael: '#2FCFA0',
  faction_free: '#4ECBE0',
  faction_choir: '#E85FD0',
});

const CAPITAL_ROLES = new Set(['battlecruiser', 'flagship', 'gunship', 'carrier', 'dreadnought']);
const CAPITAL_DEFS = new Set(
  SHIPS
    .filter((ship) => (ship.tier != null && ship.tier >= 4) || CAPITAL_ROLES.has(ship.role))
    .map((ship) => ship.id),
);

const trailMap = new Map();

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
  if (entity && entity.factionId && FACTION_COLOR[entity.factionId]) return FACTION_COLOR[entity.factionId];
  return TACTICAL_MAP_PALETTE.neutral;
}

function contactShape(entity, playerTeam, state) {
  if (isHostileToPlayer(entity, playerTeam, state)) return semanticShape('hostile');
  const role = String((entity.data && (entity.data.trafficRole || entity.data.role)) || '').toLowerCase();
  if (role === 'hauler' || role === 'miner' || role === 'smuggler') return 'square';
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
    history.push({ x: entity.pos.x, z: entity.pos.z });
    if (history.length > TRAIL_MAX) history.shift();
  }
}

function drawTrail(g, entity, playerX, playerZ, scale, center, colour) {
  const history = trailMap.get(entity.id);
  if (!history || history.length < 2) return;
  g.save();
  g.lineWidth = 1;
  g.strokeStyle = colour;
  for (let i = 1; i < history.length; i += 1) {
    g.globalAlpha = (i / history.length) * 0.34;
    const x0 = center - (history[i - 1].x - playerX) * scale;
    const y0 = center - (history[i - 1].z - playerZ) * scale;
    const x1 = center - (history[i].x - playerX) * scale;
    const y1 = center - (history[i].z - playerZ) * scale;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  g.restore();
}

function drawAsteroidBlip(g, x, y) {
  g.beginPath();
  g.moveTo(x, y - 1.7);
  g.lineTo(x + 1.7, y);
  g.lineTo(x, y + 1.7);
  g.lineTo(x - 1.7, y);
  g.closePath();
  g.fill();
}

function drawNeutralContact(g, entity, x, y, heading, colour, {
  selected = false,
  named = false,
  playerTeam = null,
  state = null,
} = {}) {
  const shape = contactShape(entity, playerTeam, state);
  const scale = named ? 1.25 : 1;
  g.save();
  g.translate(x, y);
  if (Number.isFinite(heading)) g.rotate(Math.PI + heading);
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
  g.font = '700 12px "IBM Plex Mono", ui-monospace, monospace';
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
  g.fillStyle = 'rgba(5,12,16,0.95)';
  g.fillRect(placement.x, placement.y, placement.width, placement.height);
  g.strokeStyle = 'rgba(255,192,100,0.82)';
  g.lineWidth = 1;
  g.strokeRect(placement.x + 0.5, placement.y + 0.5, placement.width - 1, placement.height - 1);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = TACTICAL_MAP_PALETTE.objective;
  g.fillText(text, placement.x + 5, placement.y + placement.height / 2 + 0.5);
  g.restore();
}

function drawRangePlate(g, metrics, range, expanded) {
  g.save();
  const text = `RANGE ${(range / 1000).toFixed(range >= 10000 ? 0 : 1)}K`;
  g.font = '700 12px "IBM Plex Mono", ui-monospace, monospace';
  const width = Math.ceil(g.measureText(text).width) + 12;
  const height = 18;
  // The visible radar is a CIRCLE masked out of the square canvas (overflow:hidden on a 50%
  // radius box). A corner-anchored plate sits outside the inscribed circle, so the mask shears
  // it to "RANG". Inset the plate's outer corner onto the 45° chord with margin.
  const inset = Math.round(metrics.size * 0.18);
  const x = metrics.size - width - inset;
  const y = metrics.size - height - inset;
  g.fillStyle = 'rgba(5,12,16,0.90)';
  g.fillRect(x, y, width, height);
  g.strokeStyle = 'rgba(174,183,182,0.42)';
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  g.fillStyle = expanded ? TACTICAL_MAP_PALETTE.ink : TACTICAL_MAP_PALETTE.inkDim;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(text, x + 6, y + height / 2 + 0.5);
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
  g.fillStyle = 'rgba(255,84,112,0.045)';
  g.strokeStyle = outside ? 'rgba(255,205,95,0.86)' : 'rgba(255,84,112,0.76)';
  g.lineWidth = outside ? 1.6 : 1.25;
  g.setLineDash(outside ? [7, 4] : [4, 5]);
  g.beginPath();
  g.arc(x, y, zoneRadius, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.setLineDash([]);
  g.restore();

  g.save();
  g.font = '700 12px "IBM Plex Mono", ui-monospace, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.fillStyle = outside ? 'rgba(255,205,95,0.94)' : 'rgba(255,84,112,0.88)';
  g.fillText(remaining > 0 ? `HEAT ${zone.level}  ${remaining}S` : `HEAT ${zone.level}`, center, center + radius - 5);
  g.restore();
}

function drawBackground(g, center, radius) {
  g.clearRect(0, 0, center * 2, center * 2);
  const gradient = g.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, 'rgba(3,18,28,0.64)');
  gradient.addColorStop(0.68, 'rgba(4,20,32,0.34)');
  gradient.addColorStop(1, 'rgba(10,48,58,0.12)');
  g.fillStyle = gradient;
  g.beginPath();
  g.arc(center, center, radius, 0, Math.PI * 2);
  g.fill();

  g.save();
  g.beginPath();
  g.arc(center, center, radius, 0, Math.PI * 2);
  g.clip();
  g.strokeStyle = 'rgba(57,208,255,0.10)';
  g.lineWidth = 1;
  const step = radius / 3;
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
      ? 'rgba(0,240,255,0.20)'
      : 'rgba(0,240,255,0.10)';
    g.lineWidth = fraction === 1 ? 1.25 : 1;
    g.beginPath();
    g.arc(center, center, radius * fraction, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = 'rgba(0,240,255,0.13)';
  g.beginPath();
  g.moveTo(center, center - radius);
  g.lineTo(center, center + radius);
  g.moveTo(center - radius, center);
  g.lineTo(center + radius, center);
  g.stroke();
  g.restore();
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
    drawBackground(background, center, radius);
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
  const radarQueryScratch = [];
  let trailPruneCountdown = 0;
  const unsubscribers = [];

  function markContactsDirty() {
    contactsDirty = true;
  }

  function onSectorEnter() {
    trailMap.clear();
    if (expanded) setExpanded(false);
    markContactsDirty();
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
    if (entity.data?.radarHidden === true || entity.flags?.radarHidden === true) return false;
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
    if (index) return index.radarAsteroids;
    refreshContacts(player);
    return asteroidList;
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
      objectiveKey.textContent = `⌜◆⌝  OBJ  ${distance}  ·  ${label}`;
      objectiveKey.title = `${legacyIdentity} · FOUR-CORNER BRACKET · ROUTE CORRIDOR`;
      objectiveKey.dataset.mode = 'objective';
      return;
    }
    objectiveKey.textContent = 'YOU HULL · HOSTILE CHEVRON · DOCK HEX · GATE RINGS';
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
    const now = Date.now();
    const reducedMotion = prefersReducedMotion();

    g.clearRect(0, 0, size, size);
    g.drawImage(backgroundCanvas, 0, 0, size, size);

    // One crisp sweep line preserves sensor motion without washing the entire instrument in bloom.
    const sweepAngle = reducedMotion ? -Math.PI / 2 : ((now % 3600) / 3600) * Math.PI * 2;
    g.save();
    g.strokeStyle = 'rgba(99,243,255,0.20)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(center, center);
    g.lineTo(center + Math.cos(sweepAngle) * radius, center + Math.sin(sweepAngle) * radius);
    g.stroke();
    g.restore();

    g.save();
    g.fillStyle = 'rgba(99,243,255,0.72)';
    g.font = '700 12px "IBM Plex Mono", ui-monospace, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillText('N', center, center - radius + 14);
    g.restore();

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

    drawHeatZone(g, state.player && state.player.heatZone, playerX, playerZ, radarScale, center, radius);

    const rangeRatio = rangeRingRatioForEntity(player, range);
    const weaponRingRadius = radius * rangeRatio;
    g.save();
    g.strokeStyle = 'rgba(99,243,255,0.18)';
    g.lineWidth = 1;
    g.setLineDash([3, 4]);
    g.beginPath();
    g.arc(center, center, weaponRingRadius, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
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
        if (!state.entities.has(id)) trailMap.delete(id);
      }
    }

    let targetAsteroid = null;
    g.save();
    g.globalAlpha = 0.38;
    g.fillStyle = TACTICAL_MAP_PALETTE.asteroid;
    for (let i = 0; i < asteroidSource.length; i += 1) {
      const entity = asteroidSource[i];
      if (
        !entity
        || !entity.pos
        || !entity.alive
        || entity === player
        || entity.type !== 'asteroid'
        || (state.entities && state.entities.get && state.entities.get(entity.id) !== entity)
      ) continue;
      const dx = entity.pos.x - playerX;
      const dz = entity.pos.z - playerZ;
      if (dx * dx + dz * dz > rangeSq) continue;
      const x = center - dx * radarScale;
      const y = center - dz * radarScale;
      drawAsteroidBlip(g, x, y);
      if (entity.id === targetId) targetAsteroid = { x, y };
    }
    g.restore();
    if (targetAsteroid) drawTargetRing(g, targetAsteroid.x, targetAsteroid.y, center);

    let hostileCount = 0;
    let salientContactCount = 0;
    let nearestOffRangeHostile = null;
    let nearestOffRangeHostileDistanceSq = Infinity;
    const hostileMarks = [];
    const infrastructureMarks = [];

    for (let i = 0; i < contacts.length; i += 1) {
      const entity = contacts[i];
      if (!entity || !entity.pos || !entity.alive || entity === player) continue;
      const dx = entity.pos.x - playerX;
      const dz = entity.pos.z - playerZ;
      const distanceSq = dx * dx + dz * dz;
      const hostile = isHostileToPlayer(entity, playerTeam, state);
      const station = entity.type === 'station';
      const gate = station && !!(entity.data && entity.data.isGate);
      if (hostile || station || entity.id === targetId) salientContactCount += 1;

      if (distanceSq > rangeSq) {
        if (hostile && distanceSq < nearestOffRangeHostileDistanceSq) {
          nearestOffRangeHostileDistanceSq = distanceSq;
          nearestOffRangeHostile = entity;
        }
        if (station) {
          const projected = projectRadarPoint(player.pos, entity.pos, range, metrics);
          if (projected) infrastructureMarks.push({ entity, projected, gate, distanceSq });
        }
        continue;
      }

      const projected = projectRadarPoint(player.pos, entity.pos, range, metrics);
      if (!projected) continue;
      if (hostile) {
        hostileCount += 1;
        hostileMarks.push({ entity, projected, distanceSq });
      } else if (station) {
        infrastructureMarks.push({ entity, projected, gate, distanceSq });
      }
    }

    const swarmQuiet = hostileCount >= SWARM_DENSITY_THRESHOLD;
    hostileMarks.sort((a, b) => (
      a.entity.id === targetId ? -1
        : b.entity.id === targetId ? 1
          : a.distanceSq - b.distanceSq
    ));
    infrastructureMarks.sort((a, b) => a.distanceSq - b.distanceSq);

    let trailUpdates = 0;
    for (let i = 0; i < contacts.length; i += 1) {
      const entity = contacts[i];
      if (!entity || !entity.pos || !entity.alive || entity === player || entity.type === 'station') continue;
      const dx = entity.pos.x - playerX;
      const dz = entity.pos.z - playerZ;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > rangeSq) continue;

      const projected = projectRadarPoint(player.pos, entity.pos, range, metrics);
      if (!projected) continue;
      const x = projected.x;
      const y = projected.y;
      const type = entity.type;
      const hostile = isHostileToPlayer(entity, playerTeam, state);
      const colour = contactColor(entity, playerTeam, colorblindMode, state);

      if ((type === 'ship' || type === 'drone') && trailUpdates < MAX_TRAIL_UPDATES) {
        updateTrail(entity);
        drawTrail(g, entity, playerX, playerZ, radarScale, center, colour);
        trailUpdates += 1;
      }

      if (hostile) continue; // drawn in the crisp priority pass below

      if (type === 'pickup') {
        const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now * 0.005);
        g.save();
        g.globalAlpha = 0.7 + 0.3 * pulse;
        g.fillStyle = '#ffe36b';
        g.translate(x, y);
        if (!reducedMotion) g.rotate((now * 0.0008) % (Math.PI * 2));
        g.beginPath();
        g.moveTo(0, -4.5);
        g.lineTo(4, 0);
        g.lineTo(0, 4.5);
        g.lineTo(-4, 0);
        g.closePath();
        g.fill();
        g.restore();
      } else if (type === 'wreck') {
        g.save();
        g.strokeStyle = colour;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x - 3, y - 3);
        g.lineTo(x + 3, y + 3);
        g.moveTo(x - 3, y + 3);
        g.lineTo(x + 3, y - 3);
        g.stroke();
        g.restore();
      } else {
        drawNeutralContact(g, entity, x, y, entityHeading(entity), colour, {
          selected: entity.id === targetId,
          named: !!(entity.data && entity.data.namedLaneContactId),
          playerTeam,
          state,
        });
      }

      if (entity.id === targetId) drawTargetRing(g, x, y, center);
    }

    for (const mark of hostileMarks.slice(0, MAX_SEMANTIC_HOSTILES)) {
      const selected = mark.entity.id === targetId;
      drawHostileGlyph(
        g,
        mark.projected.x,
        mark.projected.y,
        entityHeading(mark.entity),
        { selected, capital: isCapitalContact(mark.entity) },
      );
      if (selected || !swarmQuiet) {
        drawContactThreatPulse(
          g,
          mark.projected.x,
          mark.projected.y,
          selected,
          now,
          reducedMotion,
        );
      }
      if (selected) drawTargetRing(g, mark.projected.x, mark.projected.y, center);
    }

    if (nearestOffRangeHostile) {
      const projected = projectRadarPoint(player.pos, nearestOffRangeHostile.pos, range, metrics);
      if (projected) {
        drawHostileEdgeMarker(g, projected.x, projected.y, projected.angle, nearestOffRangeHostile.id === targetId);
      }
    }

    for (const mark of infrastructureMarks.slice(0, MAX_SEMANTIC_INFRASTRUCTURE)) {
      if (mark.gate) {
        drawGateGlyph(g, mark.projected.x, mark.projected.y, {
          offRange: mark.projected.offRange,
          angle: mark.projected.angle,
        });
      } else {
        drawStationGlyph(g, mark.projected.x, mark.projected.y, {
          offRange: mark.projected.offRange,
          angle: mark.projected.angle,
        });
      }
      if (mark.entity.id === targetId && !mark.projected.offRange) {
        drawTargetRing(g, mark.projected.x, mark.projected.y, center);
      }
    }

    const sectorId = state.world && state.world.currentSectorId;
    const pings = sectorId && state.world.scanPings && state.world.scanPings[sectorId];
    if (Array.isArray(pings) || contacts.some((entity) => (
      entity && entity.alive && entity.data && entity.data.pingedUntil > state.simTime
    ))) {
      g.save();
      g.font = '700 12px "IBM Plex Mono", ui-monospace, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.strokeStyle = '#ffd24a';
      g.lineWidth = 1;
      const pulse = reducedMotion ? 0.7 : 0.5 + 0.5 * Math.sin(now * 0.015);
      g.globalAlpha = 0.5 + 0.5 * pulse;

      if (Array.isArray(pings)) {
        for (const ping of pings) {
          if (!ping || !ping.pos) continue;
          const projected = projectRadarPoint(player.pos, ping.pos, range, metrics);
          if (!projected || projected.offRange) continue;
          g.strokeText('?', projected.x, projected.y);
        }
      }
      for (const entity of contacts) {
        if (!entity || !entity.pos || !entity.alive || entity === player) continue;
        if (!(entity.data && entity.data.pingedUntil > (state.simTime || 0))) continue;
        const projected = projectRadarPoint(player.pos, entity.pos, range, metrics);
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
          player.vel || { x: 0, z: 0 },
          target.pos,
          target.vel || { x: 0, z: 0 },
          playerProjSpeed(player),
        );
        if (lead) {
          const leadPoint = projectRadarPoint(player.pos, lead.aimPoint, range, metrics);
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
              const targetPoint = projectRadarPoint(player.pos, target.pos, range, metrics);
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

    const beacons = state.beacons;
    if (Array.isArray(beacons) && beacons.length) {
      const beaconPulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now * 0.006);
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
        );
        if (!projected || projected.offRange) continue;
        g.globalAlpha = 0.5 + beaconPulse * 0.4;
        g.beginPath();
        g.arc(projected.x, projected.y, 4 + beaconPulse * 2, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.moveTo(projected.x, projected.y - 2.5);
        g.lineTo(projected.x + 2.5, projected.y);
        g.lineTo(projected.x, projected.y + 2.5);
        g.lineTo(projected.x - 2.5, projected.y);
        g.closePath();
        g.fill();
      }
      g.restore();
    }

    drawPlayerHull(g, center, center, player.rot, { label: !expanded });
    drawThreatRing(g, metrics, hostileCount, now, reducedMotion);
    drawRangePlate(g, metrics, range, expanded);

    canvas.setAttribute(
      'aria-label',
      waypoint
        ? `Local tactical radar. You are the cyan centre hull. Objective ${label}, ${formatRadarDistance(cue && cue.distance)}.`
        : 'Local tactical radar. You are the cyan centre hull. Hostiles are red chevrons, stations are cyan berth hexagons, and gates are violet double rings.',
    );
  }

  function invalidate() {
    markContactsDirty();
  }

  function destroy() {
    dial.removeEventListener('click', onDialClick);
    for (const unsubscribe of unsubscribers.splice(0)) {
      try { unsubscribe(); } catch (_) {}
    }
    try { parityTeardown(); } catch (_) {}
    trailMap.clear();
  }

  return { el: wrap, draw, invalidate, destroy };
}

function drawContactThreatPulse(g, x, y, selected, now, reducedMotion) {
  const phase = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now * 0.0045);
  g.save();
  g.strokeStyle = TACTICAL_MAP_PALETTE.hostile;
  g.globalAlpha = selected ? 0.75 : 0.28 + 0.28 * phase;
  g.lineWidth = selected ? 1.5 : 1;
  g.beginPath();
  g.arc(x, y, selected ? 9.5 : 8 + phase * 2, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}
