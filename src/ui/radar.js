// Radar / minimap (ARCHITECTURE §5, spec "Radar/minimap") — a 180px <canvas> in the HUD
// corner redrawn at ~20Hz. Player fixed at center; world entities projected via radarRange.
// Blips colored by team/faction; off-range contacts clamp to the edge as hollow chevrons;
// the current target gets a ring. Canvas is DPI-scaled so blips stay crisp on 4K/Retina.
//
// Click to expand: click the dial to toggle a 340px tactical view showing 2× range.
// Motion trails show recent ship movement paths. All blips use shadowBlur glow.
//
// Formulas (§ spec): bx = C - (e.x-p.x)/range*R ; by = C - (e.z-p.z)/range*R.
// NOTE: BOTH axes are negated vs. a naïve projection. The chase cam sits at +Y/-Z looking toward
// +Z with up = +Y, so world +Z reads as screen UP (canvas +y is down) and world +X reads as screen
// LEFT. Mirroring both keeps the radar oriented exactly as the player sees the world — otherwise
// contacts (and the heading marker) flip left/right or up/down relative to the viewport.

import { semanticColor, semanticShape, SEMANTIC_PALETTE } from './accessibility.js';
import { solveIntercept } from '../core/flight/flightTelemetry.js';
import { isHostileToPlayer } from '../systems/scanner.js';

// ── dimensions ──────────────────────────────────────────────────────────────────────────────
// Compact flight uses a true compact canvas. Expanded tactical mode switches to the larger canvas
// only while open, avoiding a permanently composited 340px HiDPI surface during normal flight.
const COMPACT_SIZE = 180;
const COMPACT_C    = COMPACT_SIZE / 2;
const COMPACT_R    = 86;
const EXPAND_SIZE  = 340;
const EXPAND_C     = EXPAND_SIZE / 2;
const EXPAND_R     = 165;

// ── colors ──────────────────────────────────────────────────────────────────────────────────
const FACTION_COLOR = {
  faction_scn: '#4DA8FF', faction_mts: '#46E08A', faction_dmc: '#C9772E',
  faction_reach: '#FF4D5E', faction_quiet: '#B06CFF', faction_vael: '#2FCFA0',
  faction_free: '#4ECBE0', faction_choir: '#E85FD0',
};
const COL = {
  player: '#00F0FF', hostile: '#ff5470', neutral: '#9aa8bc',
  asteroid: '#6e7b8c', pickup: '#ffe36b', station: '#7af7d0', gate: '#b99cff',
  objective: '#ffb35c', ring: '#1d3350',
};

// ── blip helpers ────────────────────────────────────────────────────────────────────────────
// Player projectile speed for the lead marker (matches src/systems/weapons.js._playerProjSpeed).
// Used only to place the intercept cue; never affects actual firing.
function playerProjSpeed(p) {
  const ws = p && p.data && p.data.weapons;
  if (ws) {
    for (const w of ws) {
      const sp = w.projSpeed;
      if (sp && sp > 0) return sp;
    }
  }
  return 360;
}

function shipState(e, playerTeam, state) {
  if (isHostileToPlayer(e, playerTeam, state)) return 'hostile';
  if (e.factionId && FACTION_COLOR[e.factionId]) return 'friendly';
  return 'neutral';
}

function blipColor(e, playerTeam, mode, state) {
  if (e.type === 'asteroid') return COL.asteroid;
  if (e.type === 'pickup')   return COL.pickup;
  if (e.type === 'station') {
    if (e.data && e.data.isGate) return COL.gate;
    return e.factionId && FACTION_COLOR[e.factionId] ? FACTION_COLOR[e.factionId] : COL.station;
  }
  // Faction tint for friendly/neutral traffic when known (role/intent still carried by shape).
  if (!isHostileToPlayer(e, playerTeam, state) && e.factionId && FACTION_COLOR[e.factionId]) {
    return FACTION_COLOR[e.factionId];
  }
  return semanticColor(shipState(e, playerTeam, state), mode);
}

/**
 * Role/intent shape without labels: patrol diamond, hauler square, courier thin diamond,
 * named contact gets a slightly larger mark. Hostility still overrides via semanticShape.
 */
function contactBlipShape(e, playerTeam, state) {
  if (isHostileToPlayer(e, playerTeam, state)) return semanticShape('hostile');
  const role = String((e.data && (e.data.trafficRole || e.data.role)) || '').toLowerCase();
  if (role === 'patrol' || role === 'escort') return 'diamond';
  if (role === 'courier' || role === 'rescue') return 'diamond';
  if (role === 'hauler' || role === 'miner' || role === 'smuggler') return 'square';
  if (e.data && e.data.namedLaneContactId) return 'diamond';
  return semanticShape(shipState(e, playerTeam, state));
}

// Redundant blip shape so hostility is readable without color (colorblind mode). Caller sets fillStyle.
function drawShipShape(g, x, y, shape, scale = 1) {
  const s = scale > 0 ? scale : 1;
  if (shape === 'triangle') {
    g.beginPath(); g.moveTo(x, y - 3 * s); g.lineTo(x + 2.8 * s, y + 2.5 * s); g.lineTo(x - 2.8 * s, y + 2.5 * s); g.closePath(); g.fill();
  } else if (shape === 'diamond') {
    g.beginPath(); g.moveTo(x, y - 3 * s); g.lineTo(x + 3 * s, y); g.lineTo(x, y + 3 * s); g.lineTo(x - 3 * s, y); g.closePath(); g.fill();
  } else {
    g.fillRect(x - 2 * s, y - 2 * s, 4 * s, 4 * s);
  }
}

// ── glow helpers ────────────────────────────────────────────────────────────────────────────
// Canvas shadowBlur is expensive on the always-mounted compact HUD. Keep the richer glow for the
// opt-in expanded tactical radar, but draw compact blips with a capped halo so normal flight does
// not repaint a costly blurred canvas every radar tick.
let activeGlowScale = 0.35;
function glow(g, color, blur)  {
  const scaled = blur * activeGlowScale;
  if (scaled <= 0.25) { noGlow(g); return; }
  g.shadowColor = color;
  g.shadowBlur = scaled;
}
function noGlow(g)             { g.shadowBlur = 0; g.shadowColor = 'transparent'; }

// ── motion trails ───────────────────────────────────────────────────────────────────────────
// Per-ship position history: Map<entityId, [{x, z}]>, max TRAIL_MAX entries.
// Sampled when the ship has moved ≥ ~20 world units since the last recorded point.
const TRAIL_MAX = 7;
const trailMap  = new Map();
const MAX_TRAIL_UPDATES = 72;
const TRAIL_PRUNE_INTERVAL = 20;
const RADAR_QUERY_RADIUS_PAD = 32;
const RADAR_SPATIAL_MIN_ASTEROIDS = 96;
const RADAR_QUERY_VISIT_RATIO_LIMIT = 0.4;

function updateTrail(e) {
  let hist = trailMap.get(e.id);
  if (!hist) { hist = []; trailMap.set(e.id, hist); }
  const last = hist[hist.length - 1];
  const dx = last ? e.pos.x - last.x : Infinity;
  const dz = last ? e.pos.z - last.z : Infinity;
  if (!last || dx * dx + dz * dz > 400) {   // ~20 world-unit threshold
    hist.push({ x: e.pos.x, z: e.pos.z });
    if (hist.length > TRAIL_MAX) hist.shift();
  }
}

function drawTrail(g, e, px, pz, scale, C, col) {
  const hist = trailMap.get(e.id);
  if (!hist || hist.length < 2) return;
  g.save();
  g.lineWidth   = 1;
  g.shadowColor = col;
  g.shadowBlur  = 2 * activeGlowScale;
  for (let i = 1; i < hist.length; i++) {
    g.globalAlpha = (i / hist.length) * 0.4;
    g.strokeStyle = col;
    const x0 = C - (hist[i - 1].x - px) * scale;
    const y0 = C - (hist[i - 1].z - pz) * scale;
    const x1 = C - (hist[i].x     - px) * scale;
    const y1 = C - (hist[i].z     - pz) * scale;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  g.restore();
}

function drawAsteroidBlip(g, bx, by) {
  g.beginPath(); g.moveTo(bx, by - 2.5); g.lineTo(bx + 2.5, by); g.lineTo(bx, by + 2.5); g.lineTo(bx - 2.5, by); g.closePath(); g.fill();
}

function drawTargetRing(g, bx, by, C) {
  // Thin dashed tether from the player (center) to the current target (Tactical-Visor §3D).
  g.save();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.setLineDash([3, 4]);
  g.beginPath(); g.moveTo(C, C); g.lineTo(bx, by); g.stroke();
  g.restore();
  glow(g, '#fff', 8);
  g.strokeStyle = '#fff'; g.lineWidth = 1.3;
  g.beginPath(); g.arc(bx, by, 6.5, 0, Math.PI * 2); g.stroke();
  noGlow(g);
}

function waypointLabel(wp) {
  const raw = wp && (wp.sectorName || wp.label || wp.mapLabel || 'Objective');
  const text = String(raw || 'Goal').replace(/\s+/g, ' ').trim();
  return (text || 'Goal').toUpperCase().slice(0, 18);
}

export function placeRadarObjectiveLabel(textWidth, markerX, markerY, size, center, radius) {
  const viewport = Math.max(24, Number(size) || 0);
  const c = Number.isFinite(center) ? center : viewport / 2;
  const r = Math.max(12, Number(radius) || viewport / 2 - 4);
  const width = Math.min(viewport - 8, Math.max(28, Math.ceil(Number(textWidth) || 0) + 8));
  const height = 13;
  const x = Number(markerX) || c;
  const y = Number(markerY) || c;
  const horizontalGap = 12;
  const verticalGap = 11;
  const preferLeft = x >= c;
  const preferAbove = y >= c;
  const candidates = [
    { x: preferLeft ? x - horizontalGap - width : x + horizontalGap, y: y - height / 2 },
    { x: x - width / 2, y: preferAbove ? y - verticalGap - height : y + verticalGap },
    { x: preferLeft ? x + horizontalGap : x - horizontalGap - width, y: y - height / 2 },
    { x: x - width / 2, y: preferAbove ? y + verticalGap : y - verticalGap - height },
  ];
  const playerSafe = { x: c - 12, y: c - 12, width: 24, height: 24 };
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
    if (!overlapsPlayer || Math.hypot(x - c, y - c) < 18) return rect;
  }
  const angle = Math.atan2(y - c, x - c);
  return {
    x: clamp(c + Math.cos(angle) * Math.min(r * 0.55, 32) - width / 2, 4, viewport - 4 - width),
    y: clamp(c + Math.sin(angle) * Math.min(r * 0.55, 32) - height / 2, 4, viewport - 4 - height),
    width,
    height,
  };
}

function drawWaypointLabel(g, label, x, y, opts = {}) {
  g.save();
  g.font = 'bold 7px monospace';
  const width = g.measureText ? g.measureText(label).width : label.length * 5;
  const placement = placeRadarObjectiveLabel(
    width,
    x,
    y,
    opts.size,
    opts.center,
    opts.radius,
  );
  g.fillStyle = 'rgba(4,8,16,0.94)';
  g.strokeStyle = 'rgba(255,179,92,0.9)';
  g.lineWidth = 1;
  g.beginPath();
  g.rect(placement.x, placement.y, placement.width, placement.height);
  g.fill();
  g.stroke();
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillStyle = '#ffb35c';
  g.fillText(label, placement.x + 4, placement.y + 3);
  g.restore();
}

function drawWaypointDiamond(g, x, y, label, C, R, SIZE) {
  g.save();
  glow(g, COL.objective, 12);
  g.strokeStyle = COL.objective;
  g.fillStyle = 'rgba(255,227,107,0.16)';
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(x, y - 9);
  g.lineTo(x + 9, y);
  g.lineTo(x, y + 9);
  g.lineTo(x - 9, y);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1.0;
  g.stroke();
  noGlow(g);
  g.globalAlpha = 0.48;
  g.beginPath();
  g.arc(x, y, 14, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  drawWaypointLabel(g, label, x, y, { size: SIZE, center: C, radius: R });
}

function drawWaypointEdgeArrow(g, x, y, angle, label, C, R, SIZE) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  glow(g, COL.objective, 9);
  g.fillStyle = COL.objective;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-7, -6);
  g.lineTo(7, 0);
  g.lineTo(-7, 6);
  g.closePath();
  g.fill();
  g.stroke();
  noGlow(g);
  g.restore();
  drawWaypointLabel(g, label, x, y, { size: SIZE, center: C, radius: R });
}

function drawHeatZone(g, zone, px, pz, scale, C, R) {
  if (!zone || !zone.active || !(zone.radius > 0) || !(zone.level > 0)) return;
  const cx = Number.isFinite(zone.center && zone.center.x) ? zone.center.x : 0;
  const cz = Number.isFinite(zone.center && zone.center.z) ? zone.center.z : 0;
  const dx = cx - px;
  const dz = cz - pz;
  const zx = C - dx * scale;
  const zy = C - dz * scale;
  const zr = Math.max(2, zone.radius * scale);
  const outside = dx * dx + dz * dz > zone.radius * zone.radius;
  const clearAfter = zone.clearAfterS || 0;
  const remaining = outside && clearAfter > 0 ? Math.max(0, Math.ceil(clearAfter - (zone.outsideS || 0))) : 0;

  g.save();
  g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.clip();
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,84,112,0.055)';
  g.strokeStyle = outside ? 'rgba(255,205,95,0.9)' : 'rgba(255,84,112,0.82)';
  g.lineWidth = outside ? 1.6 : 1.25;
  g.setLineDash(outside ? [7, 4] : [4, 5]);
  g.beginPath(); g.arc(zx, zy, zr, 0, Math.PI * 2); g.fill(); g.stroke();
  g.setLineDash([]);
  g.fillStyle = outside ? 'rgba(255,205,95,0.95)' : 'rgba(255,84,112,0.72)';
  g.beginPath(); g.arc(zx, zy, 2.2, 0, Math.PI * 2); g.fill();
  g.restore();

  g.save();
  g.font = 'bold 7px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.fillStyle = outside ? 'rgba(255,205,95,0.95)' : 'rgba(255,84,112,0.82)';
  g.fillText(remaining > 0 ? 'HEAT ' + zone.level + '  ' + remaining + 'S' : 'HEAT ' + zone.level, C, C + R - 15);
  g.restore();
}

// ── factory ─────────────────────────────────────────────────────────────────────────────────
export function createRadar(ctx) {
  const { state, bus } = ctx;

  const wrap = document.createElement('div');
  wrap.className = 'sf-radar-wrap';

  const dial = document.createElement('div');
  dial.className = 'sf-radar';
  dial.title = 'Click to expand tactical view';

  // Canvas pair: main draw surface + pre-rendered static background. Normal flight keeps these at
  // compact HUD size; tactical expansion opts into the larger surface on demand.
  const dpr      = Math.min(window.devicePixelRatio || 1, 2);
  const canvas   = document.createElement('canvas');
  const bgCanvas = document.createElement('canvas');
  const g  = canvas.getContext('2d');
  const bg = bgCanvas.getContext('2d');
  let configuredSize = 0;
  let configuredC = COMPACT_C;
  let configuredR = COMPACT_R;

  function configureCanvas(size, C, R) {
    if (configuredSize === size) return;
    configuredSize = size;
    configuredC = C;
    configuredR = R;
    const px = Math.round(size * dpr);
    canvas.width = px; canvas.height = px;
    bgCanvas.width = px; bgCanvas.height = px;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    bg.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(bg, C, R);
  }
  configureCanvas(COMPACT_SIZE, COMPACT_C, COMPACT_R);

  let expanded = false;
  dial.appendChild(canvas);

  // Exact objective key only. Contact identities live in the compact overview; the old five-color
  // legend made the mission marker compete with stations, rocks, and hostiles.
  const objectiveKey = document.createElement('div');
  objectiveKey.className = 'sf-radar-objective-key mono';
  objectiveKey.hidden = true;
  wrap.append(dial, objectiveKey);

  // ── expanded toggle ───────────────────────────────────────────────────────────────────────
  // Toggling .sf-radar--expanded grows the dial and switches to the larger tactical canvas.
  // position:fixed lifts the wrap out of the rightdock flow so it doesn't push other elements.
  function setExpanded(v) {
    expanded = v;
    dial.classList.toggle('sf-radar--expanded', v);
    if (v) configureCanvas(EXPAND_SIZE, EXPAND_C, EXPAND_R);
    else configureCanvas(COMPACT_SIZE, COMPACT_C, COMPACT_R);
    wrap.style.cssText = v
      ? 'position:fixed;bottom:18px;right:18px;z-index:200;display:flex;flex-direction:column;align-items:center;gap:6px;'
      : '';
  }

  dial.addEventListener('click', () => setExpanded(!expanded));

  // Collapse on sector change — entity list and all trails are stale after a gate jump
  const onSectorEnter = () => { trailMap.clear(); if (expanded) setExpanded(false); };

  // ── contact list cache ────────────────────────────────────────────────────────────────────
  let contactList = [];
  let asteroidList = [];
  let contactsDirty = true;
  let cachedEntityList = null, cachedLength = -1, cachedPlayerId = null;
  let radarQueryScratch = [];
  let trailPruneCountdown = 0;

  function markContactsDirty() { contactsDirty = true; }

  if (bus && bus.on) {
    bus.on('entity:spawned',   markContactsDirty);
    bus.on('entity:destroyed', markContactsDirty);
    bus.on('game:started',     markContactsDirty);
    bus.on('save:loaded',      markContactsDirty);
    bus.on('sector:enter',     markContactsDirty);
    bus.on('sector:enter',     onSectorEnter);
  }

  function isRadarContact(e, player) {
    if (!e || e === player) return false;
    return e.type !== 'projectile' && e.type !== 'fx';
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
    if (!contactsDirty && cachedEntityList === list && cachedLength === list.length && cachedPlayerId === state.playerId) {
      return;
    }
    contactList.length = 0;
    asteroidList.length = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!isRadarContact(e, player)) continue;
      if (e.type === 'asteroid') asteroidList.push(e);
      else contactList.push(e);
    }
    cachedEntityList = list; cachedLength = list.length; cachedPlayerId = state.playerId;
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

  function nearbyAsteroidCandidates(px, pz, range, asteroidCount) {
    const hash = state.spatialHash;
    if (!hash || typeof hash.queryRadius !== 'function') return null;
    if (!hash.diagnostics || !(hash.diagnostics.activeBuckets > 0)) return null;
    if (asteroidCount < RADAR_SPATIAL_MIN_ASTEROIDS) return null;
    const queryRadius = range + RADAR_QUERY_RADIUS_PAD;
    const cell = Math.max(1, hash.cell || 64);
    const x0 = Math.floor((px - queryRadius) / cell);
    const x1 = Math.floor((px + queryRadius) / cell);
    const z0 = Math.floor((pz - queryRadius) / cell);
    const z1 = Math.floor((pz + queryRadius) / cell);
    const rectangularVisits = (x1 - x0 + 1) * (z1 - z0 + 1);
    const activeBuckets = hash.diagnostics.activeBuckets || (hash._activeBuckets && hash._activeBuckets.length) || 0;
    const estimatedVisits = rectangularVisits > activeBuckets * 3 ? activeBuckets : rectangularVisits;
    if (estimatedVisits > asteroidCount * RADAR_QUERY_VISIT_RATIO_LIMIT) return null;
    radarQueryScratch.length = 0;
    hash.queryRadius(px, pz, queryRadius, radarQueryScratch, { countDiagnostics: false });
    return radarQueryScratch;
  }

  // ── draw ──────────────────────────────────────────────────────────────────────────────────
  function draw() {
    const p = state.entities.get(state.playerId);
    if (expanded) configureCanvas(EXPAND_SIZE, EXPAND_C, EXPAND_R);
    else configureCanvas(COMPACT_SIZE, COMPACT_C, COMPACT_R);
    activeGlowScale = expanded ? 1 : 0.35;
    const baseRange = state.ui.radarRange || 4000;
    const range     = expanded ? baseRange * 2 : baseRange;
    const rangeSq   = range * range;
    const C = configuredC, R = configuredR, SIZE = configuredSize;
    const radarScale = R / range;
    const now = Date.now();

    g.clearRect(0, 0, SIZE, SIZE);
    g.drawImage(bgCanvas, 0, 0, SIZE, SIZE);

    // ── heading reference only (Tactical-Visor §3D: no enclosing border ring / dial) ──────
    g.fillStyle    = 'rgba(0,240,255,0.45)';
    g.font         = 'bold 7px monospace';
    g.textAlign    = 'center';
    g.textBaseline = 'bottom';
    g.fillText('N', C, C - R - 1);

    // ── scan sweep: 20° bright wedge + 30° trailing fade + leading edge line ─────────────
    const sweepAngle = ((now % 3000) / 3000) * Math.PI * 2;
    g.save();
    g.beginPath(); g.moveTo(C, C); g.arc(C, C, R, sweepAngle, sweepAngle + 0.35); g.closePath();
    g.fillStyle = 'rgba(0,240,255,0.14)'; g.fill();
    g.beginPath(); g.moveTo(C, C); g.arc(C, C, R, sweepAngle - 0.55, sweepAngle); g.closePath();
    g.fillStyle = 'rgba(0,240,255,0.04)'; g.fill();
    g.strokeStyle = 'rgba(0,240,255,0.32)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(C, C);
    g.lineTo(C + Math.cos(sweepAngle) * R, C + Math.sin(sweepAngle) * R);
    g.stroke();
    g.restore();

    // ── tactical mode overlay (expanded only) ─────────────────────────────────────────────
    if (expanded) {
      g.save();
      g.fillStyle    = 'rgba(0,240,255,0.55)';
      g.font         = 'bold 9px monospace';
      g.textAlign    = 'center';
      g.textBaseline = 'top';
      g.fillText('▸ TACTICAL  ·  ' + (range / 1000).toFixed(1) + 'K RANGE', C, C - R + 10);
      // distance labels on the 25 / 50 / 100% rings
      g.font         = '7px monospace';
      g.fillStyle    = 'rgba(0,240,255,0.32)';
      g.textAlign    = 'left';
      g.textBaseline = 'middle';
      for (const f of [0.25, 0.5, 1.0]) {
        g.fillText((range * f / 1000).toFixed(1) + 'k', C + R * f + 3, C - 5);
      }
      g.font         = '7px monospace';
      g.fillStyle    = 'rgba(0,240,255,0.28)';
      g.textAlign    = 'center';
      g.textBaseline = 'bottom';
      g.fillText('[click to close]', C, C + R - 6);
      g.restore();
    }

    if (!p) return;
    const px = p.pos.x, pz = p.pos.z;
    const targetId   = state.player.targetId;
    const playerTeam = p.team;
    const cbMode     = (state.settings.accessibility && state.settings.accessibility.colorblindMode) || 'none';

    drawHeatZone(g, state.player && state.player.heatZone, px, pz, radarScale, C, R);

    // ── weapon/mining range ring ──────────────────────────────────────────────────────────
    const weaponRange = state.player.weaponRange;
    const rngRatio    = weaponRange ? Math.min(weaponRange / range, 1) : 0.6;
    const rngR        = R * rngRatio;
    g.save();
    g.strokeStyle = 'rgba(0,240,255,0.13)'; g.lineWidth = 1; g.setLineDash([3, 4]);
    g.beginPath(); g.arc(C, C, rngR, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]); g.restore();
    g.fillStyle    = 'rgba(0,240,255,0.2)'; g.font = '6px monospace';
    g.textAlign    = 'center'; g.textBaseline = 'bottom';
    g.fillText('RNG', C, C - rngR - 1);

    // ── contacts ─────────────────────────────────────────────────────────────────────────
    const list = contactsFor(p);
    const asteroidFallback = asteroidsFor(p);
    const asteroidSource = nearbyAsteroidCandidates(px, pz, range, asteroidFallback.length) || asteroidFallback;

    // Prune trails for destroyed/removed entities. Trail sampling itself happens only for in-range
    // ships below, so dense asteroid fields or off-sector traffic cannot burn radar time.
    if (trailPruneCountdown-- <= 0) {
      trailPruneCountdown = TRAIL_PRUNE_INTERVAL;
      for (const id of trailMap.keys()) {
        if (!state.entities.has(id)) trailMap.delete(id);
      }
    }

    let targetAsteroidBlip = false, targetAsteroidX = 0, targetAsteroidY = 0;
    const asteroidCol = COL.asteroid;
    g.fillStyle = asteroidCol; g.strokeStyle = asteroidCol;
    glow(g, asteroidCol, 3);
    for (let i = 0; i < asteroidSource.length; i++) {
      const e = asteroidSource[i];
      if (!e.alive || e === p || e.type !== 'asteroid' || state.entities.get(e.id) !== e) continue;
      const dx = e.pos.x - px, dz = e.pos.z - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq > rangeSq) continue;
      const bx = C - dx * radarScale;
      const by = C - dz * radarScale;
      drawAsteroidBlip(g, bx, by);
      if (e.id === targetId) {
        targetAsteroidBlip = true;
        targetAsteroidX = bx;
        targetAsteroidY = by;
      }
    }
    noGlow(g);
    if (targetAsteroidBlip) drawTargetRing(g, targetAsteroidX, targetAsteroidY, C);

    let nearestOffScreenHostile = null;
    let minHostileDistSq = Infinity;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive || e === p) continue;
      const dx = e.pos.x - px, dz = e.pos.z - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq > rangeSq) {
        const isHostile = isHostileToPlayer(e, playerTeam, state);
        if (isHostile && distSq < minHostileDistSq) {
          minHostileDistSq = distSq;
          nearestOffScreenHostile = e;
        }
      }
    }

    let trailUpdates = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive || e === p) continue;
      const type = e.type;
      const dx = e.pos.x - px, dz = e.pos.z - pz;
      const distSq = dx * dx + dz * dz;
      const col = blipColor(e, playerTeam, cbMode, state);
      let bx, by, off = false, offAngle = 0;

      if (distSq > rangeSq) {
        off = true;
        // -dz/-dx: world +Z = screen up, world +X = screen left (see header note)
        offAngle = Math.atan2(-dz, -dx);
        bx = C + Math.cos(offAngle) * R; by = C + Math.sin(offAngle) * R;
      } else {
        bx = C - dx * radarScale; by = C - dz * radarScale;   // both axes mirrored to match screen
      }

      // motion trail (in-range ships/drones only)
      if (!off && (type === 'ship' || type === 'drone')) {
        if (trailUpdates < MAX_TRAIL_UPDATES) {
          updateTrail(e);
          trailUpdates++;
        }
        drawTrail(g, e, px, pz, radarScale, C, col);
      }

      g.fillStyle = col; g.strokeStyle = col;

      if (off) {
        if (e === nearestOffScreenHostile) {
          g.save(); g.translate(bx, by); g.rotate(offAngle);
          g.fillStyle = col; g.strokeStyle = col;
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(-4, -4); g.lineTo(3, 0); g.lineTo(-4, 4); g.closePath();
          g.fill();
          g.restore();
        }
        continue;

      } else if (type === 'pickup') {
        // spinning animated diamond with pulse glow
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
        g.save();
        g.globalAlpha = 0.6 + 0.4 * pulse;
        glow(g, col, 10 * pulse);
        g.translate(bx, by); g.rotate((now * 0.0008) % (Math.PI * 2));
        g.beginPath(); g.moveTo(0, -4); g.lineTo(3.5, 0); g.lineTo(0, 4); g.lineTo(-3.5, 0); g.closePath(); g.fill();
        noGlow(g); g.restore();

      } else if (type === 'wreck') {
        g.strokeStyle = col;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(bx - 2.5, by - 2.5); g.lineTo(bx + 2.5, by + 2.5);
        g.moveTo(bx - 2.5, by + 2.5); g.lineTo(bx + 2.5, by - 2.5);
        g.stroke();

      } else if (type === 'station') {
        if (e.data && e.data.isGate) {
          g.strokeStyle = col;
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(bx, by, 2.5, 0, Math.PI * 2);
          g.stroke();
        } else {
          g.fillRect(bx - 2.5, by - 2.5, 5, 5);
        }

      } else {
        const isHostile = isHostileToPlayer(e, playerTeam, state);
        const glowBlur  = isHostile ? 7 + 3 * Math.sin(now * 0.004) : 5;
        glow(g, col, glowBlur);
        const named = !!(e.data && e.data.namedLaneContactId);
        drawShipShape(g, bx, by, contactBlipShape(e, playerTeam, state), named ? 1.35 : 1);
        // Named contact: thin outer ring (identity, not text spam).
        if (named && !isHostile) {
          g.strokeStyle = col;
          g.lineWidth = 1;
          g.globalAlpha = 0.55;
          g.beginPath(); g.arc(bx, by, 5.5, 0, Math.PI * 2); g.stroke();
          g.globalAlpha = 1;
        }
        noGlow(g);
      }

      // target ring
      if (e.id === targetId) {
        drawTargetRing(g, bx, by, C);
      }
    }

    // ── scan pings ────────────────────────────────────────────────────────────────────────
    const sectorId = state.world && state.world.currentSectorId;
    const pings = sectorId && state.world.scanPings && state.world.scanPings[sectorId];
    if (Array.isArray(pings) || list.some(e => e.alive && e.data && e.data.pingedUntil > state.simTime)) {
      g.save();
      g.font = 'bold 9px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.strokeStyle = '#ffd24a';
      g.lineWidth = 1;
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.015);
      g.globalAlpha = 0.4 + 0.6 * pulse;
      
      if (Array.isArray(pings)) {
        for (const ping of pings) {
          if (!ping || !ping.pos) continue;
          const dx = ping.pos.x - px, dz = ping.pos.z - pz;
          const distSq = dx * dx + dz * dz;
          if (distSq > rangeSq) continue;
          const bx = C - dx * radarScale;
          const by = C - dz * radarScale;
          g.strokeText('?', bx, by);
        }
      }
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.alive || e === p) continue;
        if (e.data && e.data.pingedUntil > (state.simTime || 0)) {
          const dx = e.pos.x - px, dz = e.pos.z - pz;
          const distSq = dx * dx + dz * dz;
          if (distSq > rangeSq) continue;
          const bx = C - dx * radarScale;
          const by = C - dz * radarScale;
          g.strokeText('?', bx, by);
        }
      }
      g.restore();
    }

    // ── intercept lead marker (spec §9.3) ────────────────────────────────────────────────
    // Shows where to aim to hit the locked target, accounting for both ships' velocity. This is the
    // target-centric combat cue that makes maneuvering matter more than pixel-perfect free aim.
    if (targetId) {
      const tgt = state.entities.get(targetId);
      if (tgt && tgt.alive) {
        const projSpeed = playerProjSpeed(p);
        const lead = solveIntercept(p.pos, p.vel || { x: 0, z: 0 }, tgt.pos, tgt.vel || { x: 0, z: 0 }, projSpeed);
        if (lead) {
          const ldx = lead.aimPoint.x - px, ldz = lead.aimPoint.z - pz;
          const ldistSq = ldx * ldx + ldz * ldz;
          // Project the lead point the same way blips are (both axes negated, see header note).
          let lbx, lby, offR = false;
          if (ldistSq > rangeSq) {
            offR = true;
            const la = Math.atan2(-ldz, -ldx);
            lbx = C + Math.cos(la) * R; lby = C + Math.sin(la) * R;
          } else {
            lbx = C - ldx * radarScale; lby = C - ldz * radarScale;
          }
          g.save();
          g.strokeStyle = 'rgba(255,220,90,0.9)';
          g.fillStyle = 'rgba(255,220,90,0.9)';
          g.lineWidth = 1.1;
          // Small crosshair + tick line from the target ring to the lead point.
          g.beginPath(); g.moveTo(lbx - 3.2, lby); g.lineTo(lbx + 3.2, lby);
          g.moveTo(lbx, lby - 3.2); g.lineTo(lbx, lby + 3.2); g.stroke();
          if (!offR) {
            g.setLineDash([2, 2]);
            g.beginPath();
            const tdx = tgt.pos.x - px, tdz = tgt.pos.z - pz;
            const tbx = C - tdx * radarScale, tby = C - tdz * radarScale;
            g.moveTo(tbx, tby); g.lineTo(lbx, lby); g.stroke();
            g.setLineDash([]);
          }
          g.restore();
        }
      }
    }

    // ── waypoint / objective marker ───────────────────────────────────────────────────────
    const wp  = state.nav && state.nav.waypoint;
    const pos = wp && wp.pos;
    const wpLabel = waypointLabel(wp);
    const objectiveKeyText = wp ? `◆ AMBER DIAMOND · ${wpLabel}` : '';
    if (objectiveKey.textContent !== objectiveKeyText) objectiveKey.textContent = objectiveKeyText;
    objectiveKey.hidden = !wp;
    if (wp && !pos) {
      g.save();
      const x = C, y = C - R + 18;
      g.strokeStyle = COL.objective;
      g.fillStyle = COL.objective;
      glow(g, COL.objective, 8);
      g.beginPath();
      g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath();
      g.stroke();
      noGlow(g);
      g.restore();
      drawWaypointLabel(g, wpLabel, x, y, { size: SIZE, center: C, radius: R });
    } else if (pos) {
      const dx = pos.x - px, dz = pos.z - pz;
      const distSq = dx * dx + dz * dz;
      let bx, by;
      const off = distSq > rangeSq;
      if (off) {
        const a = Math.atan2(-dz, -dx);
        bx = C + Math.cos(a) * R; by = C + Math.sin(a) * R;
        drawWaypointEdgeArrow(g, bx, by, a, wpLabel, C, R, SIZE);
      } else {
        bx = C - dx * radarScale; by = C - dz * radarScale;
        drawWaypointDiamond(g, bx, by, wpLabel, C, R, SIZE);
      }
    }

    // ── claim beacons ─────────────────────────────────────────────────────────────────────
    // Drawn straight from state.beacons (not the contact list) so a deployed beacon always shows a
    // pulsing amber marker regardless of how the entity index buckets it.
    const beaconList = state.beacons;
    if (Array.isArray(beaconList) && beaconList.length) {
      const bpulse = 0.5 + 0.5 * Math.sin(now * 0.006);
      g.save();
      g.lineWidth = 1.2;
      for (const b of beaconList) {
        if (!b || b.alive === false) continue;
        const dx = b.x - px, dz = b.z - pz;
        if (dx * dx + dz * dz > rangeSq) continue;
        const bx = C - dx * radarScale, by = C - dz * radarScale;
        glow(g, '#ffd24a', 6 + 4 * bpulse);
        g.strokeStyle = 'rgba(255,210,74,' + (0.45 + 0.45 * bpulse).toFixed(2) + ')';
        g.beginPath(); g.arc(bx, by, 4 + 2 * bpulse, 0, Math.PI * 2); g.stroke();
        g.fillStyle = 'rgba(255,210,74,0.9)';
        g.beginPath(); g.moveTo(bx, by - 2.4); g.lineTo(bx + 2.4, by); g.lineTo(bx, by + 2.4); g.lineTo(bx - 2.4, by); g.closePath(); g.fill();
        noGlow(g);
      }
      g.restore();
    }

    // ── player marker ─────────────────────────────────────────────────────────────────────
    // rot + π projects the nose onto canvas in the same direction the player faces on screen.
    g.save(); g.translate(C, C); g.rotate(Math.PI + p.rot);
    // forward FOV cone (~30-degree spread, faint)
    g.fillStyle = 'rgba(0,240,255,0.07)';
    g.beginPath(); g.moveTo(6, 0); g.lineTo(24, -5.5); g.lineTo(24, 5.5); g.closePath(); g.fill();
    // player triangle with strong glow
    glow(g, COL.player, 12);
    g.fillStyle = COL.player;
    g.beginPath(); g.moveTo(6, 0); g.lineTo(-5, -4); g.lineTo(-5, 4); g.closePath(); g.fill();
    noGlow(g);
    g.restore();
  }

  return { el: wrap, draw, invalidate: markContactsDirty };
}

// ── static background (pre-rendered once per size change) ────────────────────────────────────
// Tactical-Visor §3D: the radar reads as a raw projection, not an enclosed dial. No filled panel
// backdrop — instead a faint top-down Cartesian grid + subtle range rings, all clipped to the
// circle. A very light dark wash only at the center keeps blips legible over bright nebulae.
function drawBackground(g, C, R) {
  g.clearRect(0, 0, C * 2, C * 2);

  // Soft central wash (legibility against bright backgrounds) — much lighter than a panel fill,
  // fading fully to transparent before the edge so there is no visible disc rim.
  const grad = g.createRadialGradient(C, C, 0, C, C, R);
  grad.addColorStop(0,   'rgba(4,28,38,0.54)');
  grad.addColorStop(0.72, 'rgba(5,23,36,0.22)');
  grad.addColorStop(1,   'rgba(18,90,96,0.08)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.fill();

  // Clip remaining grid art to the circle so the Cartesian lines fade at the rim, not as a square.
  g.save();
  g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.clip();

  // faint Cartesian grid (every R/3)
  g.strokeStyle = 'rgba(57,208,255,0.08)';
  g.lineWidth   = 1;
  const step = R / 3;
  for (let d = step; d <= R; d += step) {
    g.beginPath(); g.moveTo(C - d, C - R); g.lineTo(C - d, C + R);
    g.moveTo(C + d, C - R); g.lineTo(C + d, C + R);
    g.moveTo(C - R, C - d); g.lineTo(C + R, C - d);
    g.moveTo(C - R, C + d); g.lineTo(C + R, C + d); g.stroke();
  }

  // concentric range rings at 25 / 50 / 100% — outer ring slightly brighter
  for (const f of [0.25, 0.5, 1.0]) {
    g.strokeStyle = f === 1.0 ? 'rgba(0,240,255,0.12)' : 'rgba(0,240,255,0.06)';
    g.lineWidth   = 1;
    g.beginPath(); g.arc(C, C, R * f, 0, Math.PI * 2); g.stroke();
  }
  // crosshair axes
  g.strokeStyle = 'rgba(0,240,255,0.08)';
  g.beginPath(); g.moveTo(C, C - R); g.lineTo(C, C + R); g.moveTo(C - R, C); g.lineTo(C + R, C); g.stroke();
  g.restore();
}
