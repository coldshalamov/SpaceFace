// Flight HUD (ARCHITECTURE §5.5, design spec "HUD LAYOUT") — always-mounted flight overlay.
//
// Layout:
//   bottom-left   : hull / shield / energy / heat vertical bars + numerics
//   bottom-center : throttle + speed + cargo (used/cap) + credits
//   bottom-right  : radar (radar.js) with target panel (targetPanel.js) above it
//   top-center    : alert queue (alerts.js renders into #alerts directly)
//   top-right     : active objective line + off-screen objective arrow
//
// Update split (§5.5):
//   - frame path: cheap local transforms/classes only.
//   - numerics via textContent @10Hz.
//   - compositor-heavy overlays use explicit time cadences instead of implicit per-frame work.
//   - lists/credits/cargo rebuilt only on data events (credits:changed, cargo:changed, ship:statsChanged).
//
// The HUD READS state for display and never mutates sim state (§5, §0.6).

import { createRadar } from './radar.js';
import { createTargetPanel } from './targetPanel.js';
import { createFloatingText } from './floatingText.js';
import { createDamageIndicators } from './damageIndicators.js';
import { createHudMeta, HUD_META_CSS } from './hudMeta.js';
import { SHIPS } from '../data/ships.js';
import { COMMODITIES } from '../data/commodities.js';
import { SECTORS } from '../data/sectors.js';
import { STORY_BEATS } from '../data/missions.js';
import { PERSISTENT_CARGO } from '../data/narrative.js';
import { estimateBrakingSolution } from '../core/flight/flightTelemetry.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { BINDINGS } from './bindings.js';
import { SEMANTIC_PALETTE, getMotionReduced, getFlashReduced } from './accessibility.js';
import { contactThreatTier, contactStateWord, isHostileToPlayer, isWreckLike, wreckScanned } from '../systems/scanner.js';
import { weaponHeatSummary } from './weaponHeat.js';
import { computeLeadPipOverlay, leadSolution, primaryProjSpeed, hasBallisticWeapon } from '../ai/gunnery.js';
import { confirm } from './confirm.js';
import { bestKnownSellFor, applyTradeNavigation } from './screens/market.js';
import { createFlickerGrid, createHexPattern, createRouteBeam, createCircularGauge, createSupplyTree } from './effects/index.js';
import { DEFAULTS as INPUT_DEFAULTS } from '../systems/input.js';

// Ship role → friendly archetype label (Phase 3 HUD class indicator).
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const ROLE_LABEL = {
  starter: 'Starter', mining: 'Miner', fighter: 'Fighter', freighter: 'Freighter',
  multirole: 'Multirole', interceptor: 'Interceptor', mining_barge: 'Mining Barge',
  corvette: 'Corvette', heavy_hauler: 'Heavy Hauler', explorer: 'Explorer',
  gunship: 'Gunship', battlecruiser: 'Battlecruiser', flagship: 'Flagship',
};
// Drive-family short label for the CLASS readout. Resolved from the hull's driveId so the player
// feels the propulsion family (spec §6) without opening a stat screen.
const DRIVE_FAMILY_LABEL = {
  reaction: 'Reaction', gravimetric: 'Gravimetric', pulse_plate: 'Pulse Plate',
  torch: 'Torch', field_sail: 'Field Sail',
};
function driveFamilyFor(def) {
  const driveId = def && def.driveId;
  if (!driveId) return '';
  if (driveId.startsWith('drive_gravimetric')) return DRIVE_FAMILY_LABEL.gravimetric;
  if (driveId.startsWith('drive_pulse_plate')) return DRIVE_FAMILY_LABEL.pulse_plate;
  if (driveId.startsWith('drive_torch')) return DRIVE_FAMILY_LABEL.torch;
  if (driveId.startsWith('drive_field_sail')) return DRIVE_FAMILY_LABEL.field_sail;
  if (driveId.startsWith('drive_reaction')) return DRIVE_FAMILY_LABEL.reaction;
  return '';
}

// ── Mission tracker helpers ──────────────────────────────────────────────────────────────────
const MT_STATION_BY_ID = new Map();
const MT_SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s.name]));
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    MT_STATION_BY_ID.set(st.id, st.name);
  }
}
const MT_CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const PERSISTENT_CARGO_BY_ID = new Map(PERSISTENT_CARGO.map((c) => [c.id, c]));
const STATION_ROLE_LABELS = {
  trade_hub: 'Trade Hub',
  refinery: 'Refinery',
  mining: 'Mining',
  fab: 'Fabricator',
  military: 'Military',
  blackmarket: 'Black Market',
  research: 'Research',
};

function mtCmdtyName(id) {
  const c = MT_CMDTY_BY_ID.get(id);
  return c ? c.name : (id || 'cargo').replace('cmdty_', '').replace(/_/g, ' ');
}

function cargoDisplayName(id) {
  const c = MT_CMDTY_BY_ID.get(id) || PERSISTENT_CARGO_BY_ID.get(id);
  return c ? c.name : (id || 'cargo').replace('cmdty_', '').replace(/_/g, ' ');
}

function stationRoleLabel(id) {
  return STATION_ROLE_LABELS[id] || String(id || 'unknown').replace(/_/g, ' ');
}

function isPersistentCargoId(state, id) {
  const locked = state && state.story && state.story.persistentCargo;
  return Array.isArray(locked) && locked.includes(id);
}

function cargoVolumeForRow(state, id, qty, def) {
  if (isPersistentCargoId(state, id) && PERSISTENT_CARGO_BY_ID.has(id)) return 0;
  const volPerU = def ? (def.volPerU || 1) : 1;
  return qty * volPerU;
}

function mtStationName(id) {
  return MT_STATION_BY_ID.get(id) || 'destination';
}

function mtSectorName(id) {
  return MT_SECTOR_BY_ID.get(id) || id || 'target sector';
}

function respawnStationName(id) {
  return MT_STATION_BY_ID.get(id) || String(id || 'safe station').replace(/^station_/, '').replace(/_/g, ' ');
}

export function respawnToastText(payload = {}) {
  const parts = ['Recovered at ' + respawnStationName(payload.stationId)];
  const refund = Math.max(0, Math.round(Number(payload.refundCr) || 0));
  if (refund > 0) parts.push('insurance +' + refund.toLocaleString('en-US') + ' cr');
  const cargoLostQty = Math.max(0, Math.round(Number(payload.cargoLostQty) || 0));
  if (cargoLostQty > 0) parts.push('cargo lost ' + cargoLostQty + 'u');
  else if (payload.cargoLost) parts.push('cargo lost');
  parts.push('3s shields online');
  return parts.join(' - ');
}

function mtRouteGuidance(state, waypoint) {
  if (!state || !waypoint || !waypoint.sectorId) return null;
  const currentSectorId = state.world && state.world.currentSectorId;
  if (!currentSectorId || currentSectorId === waypoint.sectorId) return null;
  const route = state.nav && state.nav.route;
  const legs = route && Array.isArray(route.legs) ? route.legs : [];
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (first && last && first.from === currentSectorId && last.to === waypoint.sectorId) {
    const hops = route.totalHops || legs.length;
    const fuel = Math.round(route.totalFuel || legs.reduce((sum, leg) => sum + (leg.fuel || 0), 0));
    return {
      next: `Next jump: ${mtSectorName(first.to)}`,
      summary: `${hops} hop${hops === 1 ? '' : 's'} / ${fuel}F`,
    };
  }
  return {
    next: `Plot route to ${mtSectorName(waypoint.sectorId)}`,
    summary: `${BINDINGS.starmap.label} Star Map`,
  };
}

export function resolveHudNavStation(state, stationId) {
  if (!state || !stationId) return null;
  const index = state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) {
    const byStationId = index.byStationId;
    const indexed = byStationId && byStationId.get(stationId);
    if (indexed && indexed.alive !== false && indexed.type === 'station') return indexed;
    const buckets = [index.stations, index.dockStations];
    for (const stations of buckets) {
      if (!stations || !stations.length) continue;
      for (const e of stations) {
        if (e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId === stationId) return e;
      }
    }
    return null;
  }
  for (const e of state.entityList || []) {
    if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === stationId) return e;
  }
  return null;
}

function mtObjectiveText(m) {
  const p = m.params || {};
  const prog = m.objectiveProgress || 0;
  const tgt = m.objectiveTarget || 1;
  const dest = mtStationName(m.destStationId);
  switch (m.type) {
    case 'cargo_delivery':
    case 'salvage_retrieval':
    case 'passenger_transport':
      return `Deliver to ${dest}`;
    case 'bulk_trade':
      return `Sell ${prog}/${tgt} ${mtCmdtyName(p.cmdtyId)}`;
    case 'mining_quota':
      return `Mine ${prog}/${tgt} ${mtCmdtyName(p.cmdtyId)}`;
    case 'bounty_hunt':
      return 'Eliminate target';
    case 'patrol_clear':
      return `Clear ${prog}/${tgt} hostiles`;
    case 'escort':
      return `Escort to ${dest}`;
    case 'recon_scan':
      return `Scan ${prog}/${tgt} targets`;
    case 'smuggling_run':
      return `Deliver contraband to ${dest}`;
    default:
      return `${prog}/${tgt}`;
  }
}

function mtFmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec < 10 ? '0' : ''}${sec}s`;
}

function mtWaypointDistance(state, wp) {
  const pos = wp && wp.pos;
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!pos || !player || !player.pos) return 'ROUTE PENDING';
  const dist = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
  return dist >= 1000 ? `${(dist / 1000).toFixed(1)}k WU` : `${Math.round(dist)} WU`;
}

/**
 * Eight-way world bearing for the active goal. This is deliberately a stable direction glyph,
 * not a continuously announced live-region value. The camera keeps a fixed world orientation,
 * so the arrow matches the radar/map direction without requiring compass prose.
 */
export function objectiveBearingGlyph(state, wp) {
  const pos = wp && wp.pos;
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!pos || !player || !player.pos) return '';
  const dx = Number(pos.x) - Number(player.pos.x);
  const dz = Number(pos.z) - Number(player.pos.z);
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 1) return '•';
  // North/up is -Z in the map/radar presentation; advance clockwise in 45-degree sectors.
  const octant = Math.round((Math.atan2(dx, -dz) / (Math.PI * 2)) * 8);
  return ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][(octant + 8) % 8];
}

function mtObjectiveAction(action, wp) {
  const verb = String(action || 'Open the Mission Log').trim();
  const destination = String(wp && (wp.sectorName || wp.label || wp.mapLabel) || '').trim();
  if (!destination || /\b(to|at|near)\b/i.test(verb) || verb.toLowerCase().includes(destination.toLowerCase())) return verb;
  return `${verb} · ${destination}`;
}

function mtMarkerLine(state, wp, suffix = '') {
  const bearing = objectiveBearingGlyph(state, wp);
  const route = wp && wp.pos
    ? `◆ AMBER DIAMOND / GOAL · ${mtWaypointDistance(state, wp)}${bearing ? ` · ${bearing}` : ''}`
    : `NO GOAL MARKER · ${BINDINGS.missionLog.label} MISSION LOG`;
  return suffix ? `${route} · ${suffix}` : route;
}

/**
 * Geometry contract for the persistent flight anchors. Values mirror the authored desktop CSS and
 * intentionally reserve a clear center/lower-middle playfield. Used by the objective hierarchy
 * regression to cover both the 1280x720 floor and 1920x1080 target without launching the game.
 */
export function resolveObjectiveHudLayout(width, height) {
  const w = Math.max(320, Number(width) || 1280);
  const h = Math.max(240, Number(height) || 720);
  const compact = w <= 760 || h <= 620;
  const edge = compact ? 8 : 22;
  const bottom = compact ? 96 : 22;
  const objectiveWidth = Math.min(compact ? 300 : 320, w - edge * 2);
  const objectiveHeight = compact ? 68 : 82;
  const vitalsWidth = compact ? 152 : 244;
  const vitalsHeight = compact ? 124 : 184;
  const stackGap = compact ? 8 : 12;
  const rightWidth = compact ? 150 : 220;
  const rightHeight = compact ? 320 : 430;
  const actionWidth = Math.min(compact ? w - 16 : 420, w - edge * 2);
  const actionHeight = compact ? 64 : 78;
  return {
    viewport: { x: 0, y: 0, width: w, height: h },
    objective: {
      x: edge,
      y: Math.max(edge, h - bottom - vitalsHeight - stackGap - objectiveHeight),
      width: objectiveWidth,
      height: objectiveHeight,
    },
    vitals: { x: edge, y: h - bottom - vitalsHeight, width: vitalsWidth, height: vitalsHeight },
    action: { x: (w - actionWidth) / 2, y: h - (compact ? 72 : 100), width: actionWidth, height: actionHeight },
    rightDock: {
      x: w - edge - rightWidth,
      y: Math.max(edge, h - bottom - rightHeight),
      width: rightWidth,
      height: rightHeight,
    },
    centerSafe: {
      x: Math.max(objectiveWidth + edge + 32, w * 0.28),
      y: Math.max(72, h * 0.14),
      width: Math.max(0, w - Math.max(objectiveWidth + edge + 32, w * 0.28) - Math.max(rightWidth + edge + 32, w * 0.2)),
      height: Math.max(0, h * 0.56),
    },
  };
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Live flight-binding labels (matches settings rebind + help): settings overrides → scheme → classic.
// Used so tether reel/cut prompts never hard-code a key that can drift from input.js.
function codeToBindingLabel(code) {
  if (!code) return '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] || code;
  if (code === 'Space') return 'Space';
  if (code === 'ShiftLeft') return 'L-Shift';
  if (code === 'ShiftRight') return 'R-Shift';
  if (code === 'ControlLeft') return 'L-Ctrl';
  if (code === 'ControlRight') return 'R-Ctrl';
  if (code === 'AltLeft') return 'L-Alt';
  if (code === 'AltRight') return 'R-Alt';
  return code;
}

function resolveActionCodes(state, action) {
  const cfg = state && state.settings && state.settings.controls && state.settings.controls.bindings;
  const schemeName = state && state.settings && state.settings.gameplay && state.settings.gameplay.controlScheme;
  const schemes = (INPUT_DEFAULTS && INPUT_DEFAULTS.SCHEMES) || {};
  const scheme = schemes[schemeName] || schemes.pilot || (INPUT_DEFAULTS && INPUT_DEFAULTS.BINDINGS) || {};
  // Explicit empty settings override (e.g. tether: []) must not fall through to scheme/defaults.
  // Absent key → scheme → classic DEFAULTS. Present key (even []) is the player's override.
  let list;
  if (cfg && Object.prototype.hasOwnProperty.call(cfg, action)) {
    list = cfg[action];
  } else {
    list = scheme[action] || (INPUT_DEFAULTS && INPUT_DEFAULTS.BINDINGS && INPUT_DEFAULTS.BINDINGS[action]);
  }
  if (Array.isArray(list)) return list.filter(Boolean);
  return list ? [list] : [];
}

function resolveActionLabel(state, action) {
  const codes = resolveActionCodes(state, action);
  if (!codes.length) return '';
  return codes.map(codeToBindingLabel).filter(Boolean).join('/');
}

// M1 doctrine player-tells: map live ai:telegraph kinds (+ doctrineId fallback) to HUD tell ids.
const DOCTRINE_TELL_BY_KIND = Object.freeze({
  engine_flare: 'FLYBY',
  attach_spool: 'TETHER',
  weapon_charge: 'CHARGE',
});
const DOCTRINE_TELL_BY_ID = Object.freeze({
  interceptor_flyby: 'FLYBY',
  tether_control_raider: 'TETHER',
  ranged_disengager: 'CHARGE',
});
const DOCTRINE_TELL_HINT = Object.freeze({
  FLYBY: 'Break the beam',
  TETHER: 'Deny the latch',
  CHARGE: 'Close or break LOS',
});
const DOCTRINE_TELL_ICON = Object.freeze({
  FLYBY: SEMANTIC_PALETTE.danger?.icon || '⛔',
  TETHER: SEMANTIC_PALETTE.warning?.icon || '⚠',
  CHARGE: SEMANTIC_PALETTE.danger?.icon || '⛔',
});
const TELL_POOL_SIZE = 3;
const DEFAULT_TELEGRAPH_TICKS = 30;
const TELL_VISUAL_WIDTH = 240;
const TELL_VISUAL_HEIGHT = 30;
const TELL_LAYOUT_GAP = 8;

export function doctrineTellKind(payload) {
  if (!payload) return null;
  const byKind = DOCTRINE_TELL_BY_KIND[String(payload.kind || '')];
  if (byKind) return byKind;
  return DOCTRINE_TELL_BY_ID[String(payload.doctrineId || '')] || null;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

/**
 * Place one transient doctrine tell without covering the persistent objective/vitals/action/radar
 * anchors. `projected` is the authoritative worldToScreen result; the returned direction always
 * follows that original projection even when the chip yields to a reserved HUD rectangle.
 */
export function resolveDoctrineTellPlacement(width, height, projected, slotIndex = 0) {
  const w = Math.max(320, Number(width) || 1280);
  const h = Math.max(240, Number(height) || 720);
  const px = Number(projected && projected.x);
  const py = Number(projected && projected.y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;

  const chipWidth = Math.min(TELL_VISUAL_WIDTH, w - 16);
  const chipHeight = TELL_VISUAL_HEIGHT;
  const halfW = chipWidth / 2;
  const halfH = chipHeight / 2;
  const centerX = w / 2;
  const centerY = h / 2;
  let dx = px - centerX;
  let dy = py - centerY;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) {
    dx = 0;
    dy = -1;
  } else {
    dx /= length;
    dy /= length;
  }
  const directionDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  const onScreen = !!(projected && projected.onScreen);
  const stackOffset = Math.max(0, Math.min(TELL_POOL_SIZE - 1, Math.floor(Number(slotIndex) || 0)))
    * (chipHeight + 6);
  let x;
  let y;
  if (onScreen) {
    x = Math.max(halfW + TELL_LAYOUT_GAP, Math.min(w - halfW - TELL_LAYOUT_GAP, px));
    y = Math.max(halfH + TELL_LAYOUT_GAP,
      Math.min(h - halfH - TELL_LAYOUT_GAP, py - 38 - stackOffset));
  } else {
    const extentX = Math.max(1, centerX - halfW - TELL_LAYOUT_GAP);
    const extentY = Math.max(1, centerY - halfH - TELL_LAYOUT_GAP);
    const tx = Math.abs(dx) > 0.001 ? extentX / Math.abs(dx) : Infinity;
    const ty = Math.abs(dy) > 0.001 ? extentY / Math.abs(dy) : Infinity;
    const edgeDistance = Math.min(tx, ty);
    x = centerX + dx * edgeDistance;
    y = centerY + dy * edgeDistance - stackOffset;
    y = Math.max(halfH + TELL_LAYOUT_GAP, Math.min(h - halfH - TELL_LAYOUT_GAP, y));
  }

  const layout = resolveObjectiveHudLayout(w, h);
  const reserved = [layout.objective, layout.vitals, layout.action, layout.rightDock];
  const asRect = (cx, cy) => ({
    x: cx - halfW,
    y: cy - halfH,
    width: chipWidth,
    height: chipHeight,
  });
  for (let pass = 0; pass < reserved.length; pass++) {
    const collision = reserved.find((anchor) => rectsOverlap(asRect(x, y), anchor));
    if (!collision) break;
    // A corner chip can touch two stacked anchors (objective + vitals, or right dock + action).
    // Consider the outer edge of every reserved rectangle so one adjustment can clear the stack.
    const candidates = reserved.flatMap((anchor) => [
      { x, y: anchor.y - halfH - TELL_LAYOUT_GAP },
      { x, y: anchor.y + anchor.height + halfH + TELL_LAYOUT_GAP },
      { x: anchor.x - halfW - TELL_LAYOUT_GAP, y },
      { x: anchor.x + anchor.width + halfW + TELL_LAYOUT_GAP, y },
    ]).map((candidate) => ({
      x: Math.max(halfW + TELL_LAYOUT_GAP, Math.min(w - halfW - TELL_LAYOUT_GAP, candidate.x)),
      y: Math.max(halfH + TELL_LAYOUT_GAP, Math.min(h - halfH - TELL_LAYOUT_GAP, candidate.y)),
    })).filter((candidate) => reserved.every((anchor) => !rectsOverlap(asRect(candidate.x, candidate.y), anchor)));
    if (!candidates.length) return null;
    candidates.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    x = candidates[0].x;
    y = candidates[0].y;
  }

  return { x, y, width: chipWidth, height: chipHeight, onScreen, directionDeg };
}

function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
function setScaleX(el, value) {
  if (!el) return;
  const next = Math.round(clamp01(value) * 1000) / 1000;
  if (el._sfScaleX === next) return;
  el._sfScaleX = next;
  el.style.transform = `scaleX(${next})`;
}
function setStyle(el, prop, value) {
  if (el && el.style[prop] !== value) el.style[prop] = value;
}
// Screen-space HUD overlays: position with translate3d only (never per-frame left/top layout).
function setHudScreenTransform(el, x, y, opts = {}) {
  if (!el) return;
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
  const center = opts.center !== false;
  const rotate = Number.isFinite(opts.rotate) ? ` rotate(${opts.rotate.toFixed(1)}deg)` : '';
  const offset = opts.offset || (center ? 'translate(-50%,-50%)' : '');
  const next = `translate3d(${nx.toFixed(1)}px,${ny.toFixed(1)}px,0) ${offset}${rotate}`.trim();
  if (el._sfHudTransform === next) return;
  el._sfHudTransform = next;
  el.style.transform = next;
}
function setClass(el, cls, active) {
  if (el && el.classList.contains(cls) !== !!active) el.classList.toggle(cls, !!active);
}
function setDisplay(el, visible, mode = 'block') {
  if (!el) return;
  const next = visible ? mode : 'none';
  if (el.style.display !== next) el.style.display = next;
}

function createHudClock(hz, startReady = true) {
  return { step: 1 / Math.max(1, hz || 1), elapsed: startReady ? Infinity : 0, lastDt: 1 / Math.max(1, hz || 1) };
}
function consumeHudClock(clock, dt) {
  clock.elapsed += dt;
  if (clock.elapsed < clock.step) return 0;
  const runDt = Number.isFinite(clock.elapsed) ? clock.elapsed : clock.step;
  clock.elapsed = 0;
  clock.lastDt = runDt;
  return runDt;
}
function forceHudClock(clock) {
  clock.elapsed = Infinity;
}

function injectDeathStyle() {
  if (document.getElementById('sf-death-style')) return;
  const s = document.createElement('style');
  s.id = 'sf-death-style';
  s.textContent = `
  .sf-death { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:8px; z-index:1500; pointer-events:none; opacity:0; }
  .sf-death[hidden] { display:none !important; }
  .sf-death.show { animation:sf-death-seq 2.4s ease forwards; }
  @keyframes sf-death-seq { 0%{opacity:0;} 8%{opacity:1;} 70%{opacity:1;} 100%{opacity:0;} }
  .sf-death__big { font-family:var(--mono,Consolas,monospace); font-size:46px; letter-spacing:.22em; color:#ff5470;
    text-shadow:0 0 30px rgba(255,84,112,.7), 0 2px 4px #000; }
  .sf-death__sub { font-family:var(--mono,Consolas,monospace); font-size:14px; letter-spacing:.3em; color:#ffd2da; text-transform:uppercase; }
  body.sf-deathflash::after { content:''; position:fixed; inset:0; z-index:1400; pointer-events:none;
    background:radial-gradient(circle at 50% 50%, rgba(255,40,70,0) 30%, rgba(255,30,60,.55) 100%); animation:sf-deathflash .7s ease forwards; }
  @keyframes sf-deathflash { 0%{opacity:0;} 15%{opacity:1;} 100%{opacity:0;} }
  `;
  document.head.appendChild(s);
}

export function createHud(ctx, alerts) {
  const { state, helpers } = ctx;
  const root = document.getElementById('hud');
  root.innerHTML = '';
  root.dataset.objectiveHierarchy = 'one-objective-one-action-one-threat';

  // ---- bottom-left: ship schematic (hull + shield) + thin micro-bars (energy/heat/boost) ----
  // Bottom-left anchor (SPEC3-36 three-anchor law, design/revamp/HUD_THREE_ANCHOR.md): one flex
  // column — a CONTEXTUAL sub-column (mission tracker + objectives + nav readout, all relocated here
  // from the old top-left/top-right/top-center straggler positions) sitting ABOVE the schematic +
  // vitals. leftContext collapses to nothing when its children are all hidden (:empty).
  const leftStack = document.createElement('div');
  leftStack.className = 'sf-leftstack';
  const leftContext = document.createElement('div');
  leftContext.className = 'sf-leftcontext';
  leftStack.appendChild(leftContext);

  // Tactical-Visor §3C: the clunky stacked bars become a top-down structural schematic. Hull is the
  // tint + centered numeric; shield is the glowing ring (stroke-dashoffset). Energy/heat/boost — which
  // the arcs/schematic don't cover — live on as thin 2px glowing micro-lines below it.
  const bars = document.createElement('div');
  bars.className = 'sf-bars';

  const schematic = document.createElement('div');
  schematic.className = 'sf-schematic';
  schematic.innerHTML =
    '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
      '<circle class="sf-sch-shield" cx="50" cy="50" r="44" transform="rotate(-90 50 50)"/>' +
      '<g class="sf-sch-ship">' +
        '<path d="M50 20 L53 32 L62 50 L75 66 L58 63 L56 75 L50 71 L44 75 L42 63 L25 66 L38 50 L47 32 Z" stroke-linejoin="round"/>' +
        '<path d="M50 28 L53 38 L50 45 L47 38 Z" stroke-width="1.2"/>' +
        '<line x1="50" y1="45" x2="50" y2="71" stroke-width="1.2" stroke-dasharray="1.5,1.5"/>' +
        '<path d="M38 50 L31 60 L41 58 M62 50 L69 60 L59 58" stroke-width="1.2"/>' +
        '<path d="M43 64 L43 75 L48 75 M57 64 L57 75 L52 75" stroke-width="1.2"/>' +
      '</g>' +
    '</svg>' +
    '<div class="sf-sch-hull">0</div>';
  bars.appendChild(schematic);
  const schShield = schematic.querySelector('.sf-sch-shield');
  const schHull = schematic.querySelector('.sf-sch-hull');

  // Thin micro-bars. Hull + shield are on the schematic; energy/boost/weapon-heat/fuel live here.
  const barDefs = [
    ['energy', 'ENGY', 'energy'],
    ['boost', 'BOOST', 'boost'],   // Phase 3: boost/dash energy (hidden if the ship can't boost)
    ['heat', 'HEAT', 'heat'],      // weapon-instance heat (max across p.data.weapons), not WANTED heat
    ['fuel', 'FUEL', 'fuel'],
  ];
  const fillEls = {}, numEls = {}, rowEls = {};
  for (const [key, label, mod] of barDefs) {
    const row = document.createElement('div');
    row.className = 'sf-barrow';
    row.innerHTML = `
      <span class="sf-barrow__label">${label}</span>
      <div class="sf-bar sf-bar--${mod}"><div class="sf-bar__fill"></div></div>
      <span class="sf-barrow__num mono">0</span>`;
    bars.appendChild(row);
    fillEls[key] = row.querySelector('.sf-bar__fill');
    numEls[key] = row.querySelector('.sf-barrow__num');
    rowEls[key] = row;
  }
  leftStack.appendChild(bars);   // bars below the contextual column
  root.appendChild(leftStack);
  // Shield ring: dasharray = full circumference, dashoffset grows as shields drop (erasing the ring).
  // Measured after mount so getTotalLength() reads the live geometry (the fallback equals 2πr anyway).
  const SHIELD_RING_LEN = (() => { try { return schShield.getTotalLength() || 2 * Math.PI * 44; } catch (e) { return 2 * Math.PI * 44; } })();
  schShield.style.strokeDasharray = String(SHIELD_RING_LEN);
  schShield.style.strokeDashoffset = '0';

  // (The center framing arcs were removed — a wide "visor projection" around the crosshair reads as a
  //  first-person cockpit/windshield motif, which is wrong for this third-person chase-cam game.
  //  Shield now lives on the schematic ring; energy on the ENGY micro-bar.)

  // ---- bottom-center: action bar (key → ability map) (§3B) ----
  const ACTION_ICONS = {
    'pulse-laser': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
    'mass-sample': '<svg viewBox="0 0 24 24"><path d="M12 3l5 6-5 12-5-12z"/><path d="M7 9h10"/></svg>',
    'boost': '<svg viewBox="0 0 24 24"><path d="M5 19l7-13 7 13"/><path d="M5 13l7-7 7 7"/></svg>',
    'dock': '<svg viewBox="0 0 24 24"><path d="M12 3v13M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>',
    'drill': '<svg viewBox="0 0 24 24"><path d="M12 2l4 6h-8z"/><path d="M12 8v10M9 14l3 3 3-3"/><path d="M5 21h14"/></svg>',
  };
  const ACTION_SLOTS = [
    ['LMB', 'pulse-laser'],
    ['RMB', 'mass-sample'],
    ['SHIFT', 'boost'],
    [BINDINGS.dock.label, 'dock'],
    [BINDINGS.drill.label, 'drill'],
  ];
  const actionBar = document.createElement('div');
  actionBar.id = 'action-bar';
  const actionBoxes = {};
  for (const [bind, icon] of ACTION_SLOTS) {
    const slot = document.createElement('div');
    slot.className = 'action-slot';
    slot.innerHTML = `<span class="bind">${bind}</span><div class="icon-box ${icon}">${ACTION_ICONS[icon]}</div>`;
    actionBar.appendChild(slot);
    actionBoxes[icon] = slot.querySelector('.icon-box');
  }
  root.appendChild(actionBar);
  // Dock availability (physics emits dock:range as the player nears a station) → highlight the dock slot.
  let dockInRange = false;
  ctx.bus.on('dock:range', (p) => { dockInRange = !!(p && p.inRange); });

  // Weak-point reveals (BP-02): a scan pulse exposes a large hostile's soft spot. We keep this UI-side
  // (keyed by entity id, expiring) rather than on the sim entity — the target panel reads it to show
  // "where to hit" for the selected target. Populated by the scanner's flag-gated scan:weakPoint cue.
  const revealedWeakPoints = new Map();
  ctx.bus.on('scan:weakPoint', (p) => {
    if (!p || p.entityId == null) return;
    revealedWeakPoints.set(p.entityId, { label: p.label, hint: p.hint, until: p.until || 0 });
  });

  // Hit-flash helper: briefly pulse the ship schematic when the player takes damage.
  // Re-triggering a CSS animation needs remove + reflow + re-add; we do it once per damage event.
  let _schFlashTimer = 0;
  function flashSchematic() {
    schematic.classList.remove('sf-sch-hit');
    void schematic.offsetWidth;   // force reflow so the animation restarts
    schematic.classList.add('sf-sch-hit');
    clearTimeout(_schFlashTimer);
    _schFlashTimer = setTimeout(() => schematic.classList.remove('sf-sch-hit'), 340);
  }
  ctx.bus.on('combat:damage', (p) => {
    if (!p || p.targetId !== state.playerId) return;
    flashSchematic();
  });

  // ---- top-left: mission tracker (shows the tracked mission objective + timer) ----
  const missionTracker = document.createElement('div');
  missionTracker.className = 'sf-mission-tracker';
  missionTracker.style.display = 'none';
  // Distance changes continuously; this is a labelled region, not a live region, so assistive
  // technology does not announce the objective again on every HUD refresh.
  missionTracker.setAttribute('role', 'region');
  missionTracker.setAttribute('aria-label', 'Active objective');
  missionTracker.innerHTML =
    '<div class="sf-mt-title mono"></div>' +
    '<div class="sf-mt-obj mono"></div>' +
    '<div class="sf-mt-time mono"></div>';
  leftContext.appendChild(missionTracker);   // relocated into the bottom-left contextual column
  const mtTitle = missionTracker.querySelector('.sf-mt-title');
  const mtObj = missionTracker.querySelector('.sf-mt-obj');
  const mtTime = missionTracker.querySelector('.sf-mt-time');

  // ---- bottom-center (HUD 2.0, GDD §9.4): only SPD + WPN live here permanently. Cargo, credits,
  // and ship class are CONTEXTUAL CHIPS — they appear when their value changes, then fade. The old
  // seven-stat text strip whispered everything at once; now the HUD only speaks when something
  // changed. THR/STOP retired to the SPD hover tip (already carries the braking solution).
  const center = document.createElement('div');
  center.className = 'sf-cluster';
  center.innerHTML = `
    <div class="sf-stat sf-stat--info sf-stat--speed"><span class="sf-stat__k">SPD</span><span class="sf-stat__v mono" data-k="speed">0</span><div class="sf-tip" data-tip="speed"></div></div>
    <div class="sf-stat sf-stat--info" id="sf-wpnstat"><span class="sf-stat__k">WPN</span><span class="sf-stat__v mono" data-k="weapons">—</span><div class="sf-tip" data-tip="weapons"></div></div>
    <div class="sf-stat sf-stat--wide" id="sf-tetherstat" style="display:none"><span class="sf-stat__k">TETHER</span><span class="sf-stat__v mono" data-k="tether">LOCKED</span></div>
    <div class="sf-stat sf-stat--wide sf-stat--chip" data-chip="cargo"><span class="sf-stat__k">CARGO</span><span class="sf-stat__v mono" data-k="cargo">0 / 40 u</span></div>
    <div class="sf-stat sf-stat--wide sf-stat--chip" data-chip="credits"><span class="sf-stat__k">CR</span><span class="sf-stat__v mono sf-credits" data-k="credits">0</span></div>
    <div class="sf-stat sf-stat--wide sf-stat--chip" id="sf-rolestat" data-chip="role"><span class="sf-stat__k">CLASS</span><span class="sf-stat__v mono" data-k="role">—</span></div>`;
  root.appendChild(center);
  const elSpeed = center.querySelector('[data-k=speed]');
  const elCargo = center.querySelector('[data-k=cargo]');
  const elCredits = center.querySelector('[data-k=credits]');
  const elWeapons = center.querySelector('[data-k=weapons]');
  const elRole = center.querySelector('[data-k=role]');
  const elTetherStat = center.querySelector('#sf-tetherstat');
  const elTether = center.querySelector('[data-k=tether]');
  const chipEls = {
    cargo: center.querySelector('[data-chip=cargo]'),
    credits: center.querySelector('[data-chip=credits]'),
    role: center.querySelector('[data-chip=role]'),
  };
  const _chipTimers = new Map();
  // Show a chip for a beat, then let it fade. Repeat calls refresh the timer (a count-up animation
  // keeps its chip alive until the number settles).
  function chipShow(key, ms = 4000) {
    const el = chipEls[key];
    if (!el) return;
    el.classList.add('sf-chip-show');
    clearTimeout(_chipTimers.get(el));
    _chipTimers.set(el, setTimeout(() => el.classList.remove('sf-chip-show'), ms));
  }

  // ---- HUD stat tooltips: populate on hover to show detailed info ----
  const tipEls = {};
  for (const tip of center.querySelectorAll('.sf-tip')) tipEls[tip.dataset.tip] = tip;

  function buildSpeedTip(p) {
    if (!p) return 'No ship data';
    const sp = Math.hypot(p.vel.x, p.vel.z);
    const maxSp = p.maxSpeed || 1;
    const pct = Math.round(clamp01(sp / maxSp) * 100);
    const drive = driveFamilyFor(SHIP_BY_ID.get(p.data && p.data.defId)) || 'Reaction';
    let lines = [
      `Speed: ${Math.round(sp)} / ${Math.round(maxSp)} wu/s (${pct}%)`,
      `Velocity X: ${p.vel.x.toFixed(1)}, Z: ${p.vel.z.toFixed(1)}`,
      `Drive: ${drive}`,
    ];
    // Braking solution (spec §15.3): turn physics from confusion into skill by showing the
    // projected stop point, fastest stop mode, and stop time/distance.
    if (sp > 0.5) {
      const brake = estimateBrakingSolution(p, resolvePropulsionProfile(p));
      lines.push(`Best stop: ${brake.bestMode.replace('-', ' ')}`);
      lines.push(`Direct: ${brake.directDistance.toFixed(0)} wu / ${brake.directTimeS.toFixed(1)} s`);
      lines.push(`Flip-and-burn: ${brake.flipBurnDistance.toFixed(0)} wu / ${brake.flipBurnTimeS.toFixed(1)} s`);
    }
    return lines.join('\n');
  }
  function buildThrottleTip(p) {
    if (!p) return 'No ship data';
    const sp = Math.hypot(p.vel.x, p.vel.z);
    const maxSp = p.maxSpeed || 1;
    const pct = Math.round(clamp01(sp / maxSp) * 100);
    const mass = p.mass || 0;
    const handling = p.handling != null ? p.handling.toFixed(2) : '—';
    return `Throttle: ${pct}%\nMax speed: ${Math.round(maxSp)} wu/s\nMass: ${Math.round(mass)}\nHandling: ${handling}`;
  }
  function buildCargoTip() {
    const c = (state.player || {}).cargo || {};
    const items = c.items || {};
    const used = Math.round(c.usedVolume || 0);
    const cap = Math.round(c.capVolume || 40);
    const keys = Object.keys(items);
    if (!keys.length) return `Cargo: ${used} / ${cap} u\nHold is empty`;
    const lines = [`Cargo: ${used} / ${cap} u`];
    for (const id of keys.slice(0, 8)) {
      const qty = items[id];
      const name = cargoDisplayName(id);
      if (qty > 0) lines.push(`  ${name}: ${qty}`);
    }
    if (keys.length > 8) lines.push(`  ... +${keys.length - 8} more`);
    return lines.join('\n');
  }
  function buildCreditsTip() {
    const player = state.player || {};
    const cr = Math.round(player.credits || 0);
    const st = player.stats || {};
    return `Credits: ${cr.toLocaleString()} CR\nLifetime profit: ${Math.round(st.lifetimeProfit || 0).toLocaleString()}\nTrades: ${st.tradesCount || 0}\nBest single trade: ${Math.round(st.biggestSingleProfit || 0).toLocaleString()}`;
  }
  function buildWeaponsTip(p) {
    if (!p || !p.data || !p.data.weapons || !p.data.weapons.length) return 'No weapons fitted';
    const ws = p.data.weapons;
    const auto = !!(state.input && state.input.autoFire);
    const lines = [`Weapons: ${ws.length} fitted${auto ? ' [AUTO-FIRE]' : ''}`];
    for (const w of ws) {
      const name = w.name || w.id || 'Unknown';
      const dps = w.dps != null ? ` ${w.dps} dps` : '';
      const rng = w.range ? ` ${w.range}m` : '';
      lines.push(`  ${name}${dps}${rng}`);
    }
    return lines.join('\n');
  }
  function buildClassTip(p) {
    if (!p || !p.data) return 'No ship data';
    const defId = p.data.defId;
    const def = SHIP_BY_ID.get(defId);
    if (!def) return 'Unknown hull';
    const role = ROLE_LABEL[def.role] || def.role || '—';
    return `${def.name} — ${role}\nTier: ${def.tier}  Hull: ${def.hull}  Shield: ${def.shield}\nCargo cap: ${def.cargo} u  Mass: ${def.mass}\nSlots: ${Object.entries(def.slots || {}).map(([k, v]) => k[0].toUpperCase() + ':' + v.length).join(' ')}`;
  }

  // Update tooltip content on mouseenter; the CSS handles show/hide.
  for (const stat of center.querySelectorAll('.sf-stat--info')) {
    stat.addEventListener('mouseenter', () => {
      const tip = stat.querySelector('.sf-tip');
      if (!tip) return;
      const k = tip.dataset.tip;
      const p = state.entities.get(state.playerId);
      let text = '';
      if (k === 'speed') text = buildSpeedTip(p);
      else if (k === 'throttle') text = buildThrottleTip(p);
      else if (k === 'cargo') text = buildCargoTip();
      else if (k === 'credits') text = buildCreditsTip();
      else if (k === 'weapons') text = buildWeaponsTip(p);
      else if (k === 'class') text = buildClassTip(p);
      tip.textContent = text;
    });
  }

  // ---- bottom-right: target panel + radar ----
  const rightDock = document.createElement('div');
  rightDock.className = 'sf-rightdock';
  const targetPanel = createTargetPanel(ctx);
  
  // Overview Strip (§2)
  const elOverview = document.createElement('div');
  elOverview.className = 'sf-overview';
  
  const radar = createRadar(ctx);
  rightDock.append(targetPanel.el, elOverview, radar.el);
  root.appendChild(rightDock);

  // Target Arcs Overlay (§3)
  const targetArcs = document.createElement('div');
  targetArcs.id = 'sf-target-arcs';
  targetArcs.className = 'sf-target-arcs';
  targetArcs.style.display = 'none';
  targetArcs.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" style="display:block; overflow:visible;">
      <circle class="sf-arc-shield" />
      <circle class="sf-arc-armor" />
      <circle class="sf-arc-hull" />
    </svg>
  `;
  root.appendChild(targetArcs);
  const targetArcsSvg = targetArcs.querySelector('svg');
  const targetArcShield = targetArcs.querySelector('.sf-arc-shield');
  const targetArcArmor = targetArcs.querySelector('.sf-arc-armor');
  const targetArcHull = targetArcs.querySelector('.sf-arc-hull');

  // floating combat text (damage numbers, ore yield, credits, kills)
  const floatingText = createFloatingText(ctx);

  // directional damage indicators (red arcs at screen edge showing where hits came from)
  const dmgInd = createDamageIndicators().bind(
    () => state.entities.get(state.playerId),
    state.playerId,
  );
  root.appendChild(dmgInd.el);
  ctx.bus.on('combat:damage', (p) => dmgInd.onDamage(p));

  // ---- objective tracker (relocated to the bottom-left contextual column) + off-screen arrow.
  // The arrow (below) stays a root-level, world-following overlay; only the objective LIST moves. ----
  const objWrap = document.createElement('div');
  objWrap.className = 'sf-objectives';
  objWrap.style.display = 'none';
  leftContext.appendChild(objWrap);

  // ---- Phase 4: nav readout (destination / distance / ETA) — relocated from top-center into the
  // bottom-left contextual column (persistent "where I'm going" state belongs in the left anchor). ----
  const elNavReadout = document.createElement('div');
  elNavReadout.className = 'sf-nav-readout';
  elNavReadout.style.display = 'none';
  elNavReadout.innerHTML =
    '<div class="sf-nav-label mono">—</div>' +
    '<div class="sf-nav-meta"><span class="sf-nav-dist">0 u</span> · ETA <span class="sf-nav-eta">—</span></div>';
  leftContext.appendChild(elNavReadout);
  const elNavLabel = elNavReadout.querySelector('.sf-nav-label');
  const elNavDist = elNavReadout.querySelector('.sf-nav-dist');
  const elNavEta = elNavReadout.querySelector('.sf-nav-eta');


  const arrow = document.createElement('div');
  arrow.className = 'sf-objarrow';
  arrow.style.display = 'none';
  root.appendChild(arrow);

  // ---- combat HUD: lock-on ring, weapon heat bars, target lock diamond ----

  // Lock-on progress ring (SVG arc near reticle). Shows when a homing weapon is acquiring a lock.
  const lockRing = document.createElement('div');
  lockRing.className = 'sf-lockring';
  const LOCK_R = 30, LOCK_C = Math.PI * 2 * LOCK_R;
  lockRing.innerHTML =
    `<svg viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="36" cy="36" r="${LOCK_R}" class="sf-lockring__track"/>` +
    `<circle cx="36" cy="36" r="${LOCK_R}" class="sf-lockring__fill" ` +
    `stroke-dasharray="${LOCK_C}" stroke-dashoffset="${LOCK_C}" ` +
    `transform="rotate(-90 36 36)"/>` +
    `</svg><div class="sf-lockring__label"></div>`;
  root.appendChild(lockRing);
  const lockFill = lockRing.querySelector('.sf-lockring__fill');
  const lockLabel = lockRing.querySelector('.sf-lockring__label');
  let _wasLocked = false;   // rising-edge tracker for the lock-acquired audio cue

  // FR-1: prograde (velocity-vector) tick. An always-on, unlabeled read of where inertia carries
  // the ship if thrust cuts now — projected through the authoritative worldToScreen, never a magic
  // screen anchor. It is a gauge (constant size, never animates) that fades out near rest. When it
  // and the centered aim reticle diverge, you can read "facing vs travel" without instruments.
  const proTick = document.createElement('div');
  proTick.className = 'sf-protick';
  proTick.style.cssText =
    'position:absolute;left:0;top:0;width:8px;height:2px;margin-left:-4px;margin-top:-1px;' +
    'background:#d7e6ff;border-radius:1px;opacity:0;pointer-events:none;will-change:transform,opacity;transform-origin:center;';
  root.appendChild(proTick);
  let _proAlpha = 0;   // smooth-damped opacity so it eases in/out, never pops

  // Per-weapon heat bars. Built once per ship load, updated per frame.
  const wpnHeatsWrap = document.createElement('div');
  wpnHeatsWrap.className = 'sf-wpn-heats';
  wpnHeatsWrap.style.display = 'none';
  root.appendChild(wpnHeatsWrap);
  let wpnHeatEls = []; // [{fill, row, lastHeat}]
  let wpnHeatShipId = null;

  function rebuildWeaponHeatBars(weapons) {
    wpnHeatsWrap.innerHTML = '';
    wpnHeatEls = [];
    if (!weapons || !weapons.length) { wpnHeatsWrap.style.display = 'none'; return; }
    for (const w of weapons) {
      const name = (w.name || w.defId || '').replace(/^wpn_/, '').replace(/_/g, ' ').slice(0, 8);
      const row = document.createElement('div');
      row.className = 'sf-wpn-heat';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'sf-wpn-heat__label';
      labelSpan.textContent = name;
      const bar = document.createElement('div');
      bar.className = 'sf-wpn-heat__bar';
      const fill = document.createElement('div');
      fill.className = 'sf-wpn-heat__fill';
      bar.appendChild(fill);
      row.appendChild(labelSpan);
      row.appendChild(bar);
      wpnHeatsWrap.appendChild(row);
      wpnHeatEls.push({ fill, row, lastHeat: -1 });
    }
    wpnHeatsWrap.style.display = 'flex';
  }

  // Target lock diamond — follows the locked target's screen position.
  const lockDiamond = document.createElement('div');
  lockDiamond.className = 'sf-lockdiamond';
  lockDiamond.innerHTML = '<div class="sf-lockdiamond__inner"></div>';
  root.appendChild(lockDiamond);

  // Lead pip (BP-02) — world-space "aim here" marker at the ballistic lead solution for the current
  // target. Player-only HUD; solved via the same lead model the guns use (src/ai/gunnery.js).
  const leadPip = document.createElement('div');
  leadPip.className = 'sf-leadpip';
  leadPip.innerHTML = '<div class="sf-leadpip__ring"></div>';
  root.appendChild(leadPip);

  // ---- death / respawn feedback banner ----
  injectDeathStyle();
  const deathBanner = document.createElement('div');
  deathBanner.className = 'sf-death';
  deathBanner.hidden = true;
  deathBanner.setAttribute('aria-hidden', 'true');
  deathBanner.setAttribute('role', 'alert');
  deathBanner.innerHTML = '<div class="sf-death__big">SHIP DESTROYED</div><div class="sf-death__sub">Emergency recovery online…</div>';
  root.appendChild(deathBanner);
  let deathHideTimer = 0;
  ctx.bus.on('player:death', () => {
    clearTimeout(deathHideTimer);
    deathBanner.hidden = false;
    deathBanner.removeAttribute('aria-hidden');
    deathBanner.classList.remove('show'); void deathBanner.offsetWidth; // restart animation
    deathBanner.classList.add('show');
    document.body.classList.add('sf-deathflash');
    setTimeout(() => document.body.classList.remove('sf-deathflash'), 700);
    deathHideTimer = setTimeout(() => {
      deathBanner.classList.remove('show');
      deathBanner.hidden = true;
      deathBanner.setAttribute('aria-hidden', 'true');
    }, 2500);
  });
  ctx.bus.on('player:respawn', (payload) => {
    ctx.bus.emit('toast', {
      text: respawnToastText(payload || {}),
      kind: payload && payload.cargoLost ? 'warn' : 'good',
      ttl: 5,
    });
  });

  // ---- presentation captions (accessibility: subtitles for audio/gameplay cues) ----
  // presentationAdapters emits presentation:caption { text, assertive, shape, ... } for important
  // cues, but nothing subscribed — the events were emitted into the void. This mounts a visible
  // caption box (bottom-center, like subtitles) + an aria-live region so screen readers announce
  // the same text. The hook already carries text + an assertive flag for high-priority cues, so
  // wiring it closes the audio-caption accessibility gap for free.
  if (!document.getElementById('sf-caption-style')) {
    const cs = document.createElement('style');
    cs.id = 'sf-caption-style';
    cs.textContent = `
    .sf-caption { position:absolute; left:50%; bottom:14%; transform:translate(-50%, 8px);
      max-width:min(80vw, 640px); padding:9px 16px; border-radius:8px;
      background:rgba(6,10,20,.82); border:1px solid var(--panel-edge, rgba(120,160,200,.25));
      color:var(--ink, #d7e6ff); font-size:15px; line-height:1.35; text-align:center;
      pointer-events:none; opacity:0; transition:opacity .18s ease, transform .18s ease;
      text-shadow:0 1px 6px rgba(0,0,0,.7); z-index:40;
      letter-spacing:.01em; }
    .sf-caption.show { opacity:1; transform:translate(-50%, 0); }
    .sf-caption.assertive { border-color:var(--accent, #39d0ff); box-shadow:0 0 16px rgba(57,208,255,.35); }
    @media (prefers-reduced-motion: reduce) { .sf-caption { transition:opacity .18s ease; transform:translate(-50%,0); } }
    `;
    document.head.appendChild(cs);
  }
  const caption = document.createElement('div');
  caption.className = 'sf-caption';
  caption.hidden = true;
  caption.setAttribute('aria-hidden', 'true');
  root.appendChild(caption);
  // Two dedicated live regions so we never mutate aria-live on a single element.
  const livePolite = document.createElement('div');
  livePolite.className = 'sr-only';
  livePolite.setAttribute('aria-live', 'polite');
  livePolite.setAttribute('role', 'status');
  livePolite.setAttribute('aria-atomic', 'true');
  root.appendChild(livePolite);
  const liveAssertive = document.createElement('div');
  liveAssertive.className = 'sr-only';
  liveAssertive.setAttribute('aria-live', 'assertive');
  liveAssertive.setAttribute('role', 'alert');
  liveAssertive.setAttribute('aria-atomic', 'true');
  root.appendChild(liveAssertive);
  let captionHideTimer = 0;
  let captionFadeTimer = 0;
  ctx.bus.on('presentation:caption', (p) => {
    if (!p || !p.text) return;
    clearTimeout(captionHideTimer);
    clearTimeout(captionFadeTimer);
    caption.textContent = p.text;
    caption.hidden = false;
    caption.classList.toggle('assertive', !!p.assertive);
    caption.classList.remove('show'); void caption.offsetWidth; // restart fade-in
    caption.classList.add('show');
    // Route to the appropriate live region so screen readers get the right politeness without
    // mutating aria-live on a single element (which confuses some ATs).
    const live = p.assertive ? liveAssertive : livePolite;
    live.textContent = '';
    live.textContent = p.text;
    const ttl = p.assertive ? 3200 : 2400;
    captionHideTimer = setTimeout(() => {
      caption.classList.remove('show');
      captionFadeTimer = setTimeout(() => {
        caption.hidden = true;
      }, 220); // let the fade-out finish before hiding
    }, ttl);
  });

  // ---- M1 doctrine player-tells (FLYBY / TETHER / CHARGE) + truthful tether prompt ownership ----
  // Max three pooled tell chips. Enemy-linked when on-screen; truthful off-screen edge chip with
  // direction (text chip — not a visor/screen-edge arc). Listens to live ai:telegraph from
  // tacticalAI combatDoctrine (engine_flare / attach_spool / weapon_charge).
  if (!document.getElementById('sf-tell-style')) {
    const ts = document.createElement('style');
    ts.id = 'sf-tell-style';
    ts.textContent = `
    .sf-tells { position:absolute; inset:0; z-index:36; pointer-events:none; overflow:hidden; }
    .sf-tell {
      position:absolute; left:0; top:0; display:none; align-items:center; gap:6px;
      max-width:min(42vw, 280px); padding:5px 10px 5px 8px; border-radius:4px;
      background:rgba(5,9,18,.88); border:1px solid rgba(255,92,92,.55);
      color:var(--ink, #d7e6ff); font-family:var(--mono, Consolas, monospace);
      font-size:12px; letter-spacing:.04em; line-height:1.2; white-space:nowrap;
      will-change:transform, opacity; opacity:0;
      box-shadow:0 2px 10px rgba(0,0,0,.35);
    }
    .sf-tell.is-on { display:inline-flex; opacity:1; }
    .sf-tell--FLYBY { border-color:rgba(255,92,92,.7); }
    .sf-tell--TETHER { border-color:rgba(255,179,92,.7); }
    .sf-tell--CHARGE { border-color:rgba(255,92,92,.7); }
    .sf-tell__icon { font-size:11px; opacity:.95; flex:0 0 auto; }
    .sf-tell__kind { font-weight:700; letter-spacing:.14em; font-size:11px; color:#ff5c5c; }
    .sf-tell--TETHER .sf-tell__kind { color:#ffb35c; }
    .sf-tell__hint { color:rgba(215,230,255,.82); letter-spacing:.02em; font-size:11px;
      text-transform:none; overflow:hidden; text-overflow:ellipsis; }
    .sf-tell__dir { color:rgba(215,230,255,.9); font-size:12px; margin-left:2px; flex:0 0 auto; }
    .sf-tell.is-offscreen .sf-tell__dir { display:inline; }
    .sf-tell:not(.is-offscreen) .sf-tell__dir { display:none; }
    .sf-tell.is-pulse { animation:sf-tell-pulse .45s ease-out 1; }
    @keyframes sf-tell-pulse {
      0% { filter:brightness(1.35); }
      100% { filter:brightness(1); }
    }
    html.sf-reduce-motion .sf-tell.is-pulse,
    html.sf-reduce-flash .sf-tell.is-pulse { animation:none !important; }
    @media (prefers-reduced-motion: reduce) {
      .sf-tell.is-pulse { animation:none !important; }
    }
    `;
    document.head.appendChild(ts);
  }
  const tellRoot = document.createElement('div');
  tellRoot.className = 'sf-tells';
  // Visual chips are decorative for AT; a single shared assertive region announces once.
  tellRoot.setAttribute('aria-hidden', 'true');
  root.appendChild(tellRoot);
  // Reuse the existing assertive live region when present; otherwise a dedicated tell announcer.
  const tellLiveAssertive = liveAssertive || (() => {
    const el = document.createElement('div');
    el.className = 'sr-only';
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-atomic', 'true');
    root.appendChild(el);
    return el;
  })();
  const tellSlots = [];
  for (let i = 0; i < TELL_POOL_SIZE; i++) {
    const el = document.createElement('div');
    el.className = 'sf-tell';
    // Non-live visual chip — no per-chip assertive region (avoids triple SR double-announce).
    el.setAttribute('aria-hidden', 'true');
    el.hidden = true;
    el.innerHTML =
      '<span class="sf-tell__icon" aria-hidden="true"></span>' +
      '<span class="sf-tell__kind"></span>' +
      '<span class="sf-tell__hint"></span>' +
      '<span class="sf-tell__dir" aria-hidden="true">▸</span>';
    tellRoot.appendChild(el);
    tellSlots.push({
      el,
      iconEl: el.querySelector('.sf-tell__icon'),
      kindEl: el.querySelector('.sf-tell__kind'),
      hintEl: el.querySelector('.sf-tell__hint'),
      dirEl: el.querySelector('.sf-tell__dir'),
      entityId: null,
      tellId: null,
      startedTick: -1,
      expiresAtTick: -1,
      age: Infinity,
      announced: '',
    });
  }

  function retireTell(slot) {
    if (!slot || slot.age >= Infinity) return;
    slot.entityId = null;
    slot.tellId = null;
    slot.startedTick = -1;
    slot.expiresAtTick = -1;
    slot.age = Infinity;
    slot.announced = '';
    slot.el.classList.remove('is-on', 'is-offscreen', 'is-pulse', 'sf-tell--FLYBY', 'sf-tell--TETHER', 'sf-tell--CHARGE');
    slot.el.hidden = true;
    setText(slot.iconEl, '');
    setText(slot.kindEl, '');
    setText(slot.hintEl, '');
  }

  function acquireTellSlot(entityId) {
    let free = null;
    let oldest = tellSlots[0];
    for (const slot of tellSlots) {
      if (slot.entityId === entityId && slot.age < Infinity) return slot;
      if (slot.age >= Infinity && !free) free = slot;
      if (slot.age > oldest.age) oldest = slot;
    }
    return free || oldest;
  }

  function pushDoctrineTell(payload) {
    const tellId = doctrineTellKind(payload);
    if (!tellId) return;
    const entityId = payload.entityId;
    if (entityId == null) return;
    // Only surface tells aimed at the player (or legacy emissions with no target field).
    if (payload.targetId != null && payload.targetId !== state.playerId) return;
    const tick = Number.isInteger(payload.tick) ? payload.tick
      : (Number.isInteger(state.tick) ? state.tick : 0);
    // Floor to ≥30 sim ticks so HUD never under-telegraphs the sim hold-fire window.
    const durationTicks = Math.max(30, Math.floor(Number(payload.durationTicks) || DEFAULT_TELEGRAPH_TICKS));
    const slot = acquireTellSlot(entityId);
    const wasSame = slot.entityId === entityId && slot.tellId === tellId && slot.age < Infinity;
    slot.entityId = entityId;
    slot.tellId = tellId;
    slot.startedTick = tick;
    slot.expiresAtTick = tick + durationTicks;
    slot.age = 0;
    const kindLabel = tellId;
    const hint = DOCTRINE_TELL_HINT[tellId] || '';
    const icon = DOCTRINE_TELL_ICON[tellId] || '⚠';
    slot.el.classList.remove('sf-tell--FLYBY', 'sf-tell--TETHER', 'sf-tell--CHARGE');
    slot.el.classList.add(`sf-tell--${tellId}`);
    setText(slot.iconEl, icon);
    setText(slot.kindEl, kindLabel);
    setText(slot.hintEl, hint);
    slot.el.hidden = false;
    slot.el.classList.add('is-on');
    // Visual chips are non-live (aria-hidden); one shared assertive region announces once.
    const announce = `${kindLabel}. ${hint}`.trim();
    if (announce !== slot.announced) {
      slot.announced = announce;
      tellLiveAssertive.textContent = '';
      tellLiveAssertive.textContent = announce;
    }
    // Pulse only on fresh tell; honor reduce-motion / reduce-flash (class + runtime flags).
    const allowPulse = !getMotionReduced() && !getFlashReduced()
      && !(typeof document !== 'undefined' && document.documentElement
        && (document.documentElement.classList.contains('sf-reduce-motion')
          || document.documentElement.classList.contains('sf-reduce-flash')));
    if (!wasSame && allowPulse) {
      slot.el.classList.remove('is-pulse');
      void slot.el.offsetWidth;
      slot.el.classList.add('is-pulse');
    } else {
      slot.el.classList.remove('is-pulse');
    }
  }

  ctx.bus.on('ai:telegraph', (p) => pushDoctrineTell(p || {}));

  function updateDoctrineTells(frameDt) {
    const w2s = helpers && helpers.worldToScreen;
    const tick = Number.isInteger(state.tick) ? state.tick : 0;
    const w = (typeof window !== 'undefined' && window.innerWidth) || 1280;
    const h = (typeof window !== 'undefined' && window.innerHeight) || 720;
    for (let slotIndex = 0; slotIndex < tellSlots.length; slotIndex++) {
      const slot = tellSlots[slotIndex];
      if (slot.age >= Infinity) continue;
      slot.age += frameDt;
      if (tick > slot.expiresAtTick) { retireTell(slot); continue; }
      const ent = state.entities && state.entities.get && state.entities.get(slot.entityId);
      if (!ent || ent.alive === false || !ent.pos) { retireTell(slot); continue; }
      if (!w2s) {
        // The shared live-region announcement remains available, but a visual chip without an
        // authoritative projection would lie about direction and therefore stays hidden.
        setDisplay(slot.el, false);
        continue;
      }
      const proj = w2s({ x: ent.pos.x, y: 0, z: ent.pos.z });
      const placement = resolveDoctrineTellPlacement(w, h, proj, slotIndex);
      if (!placement) { setDisplay(slot.el, false); continue; }
      setDisplay(slot.el, true, 'inline-flex');
      setClass(slot.el, 'is-offscreen', !placement.onScreen);
      setHudScreenTransform(slot.el, placement.x, placement.y, { center: true });
      if (slot.dirEl) slot.dirEl.style.transform = `rotate(${placement.directionDeg.toFixed(1)}deg)`;
      slot.el.hidden = false;
      slot.el.classList.add('is-on');
    }
  }

  function buildTetherControlPrompt(tether) {
    if (!tether || !tether.active) return '';
    // No hard-coded F: explicit empty rebind must not lie about the key.
    const cutLabel = resolveActionLabel(state, 'tether');
    const reelInLabel = resolveActionLabel(state, 'reelIn');
    const reelOutLabel = resolveActionLabel(state, 'reelOut');
    const parts = [];
    // Hold tether still reels in (input contract); dedicated reel keys only when rebound.
    if (reelInLabel) parts.push(`[${reelInLabel}] REEL IN`);
    else if (cutLabel) parts.push(`HOLD [${cutLabel}] REEL`);
    if (reelOutLabel) parts.push(`[${reelOutLabel}] PAY OUT`);
    if (cutLabel) parts.push(`TAP [${cutLabel}] CUT`);
    // Intentionally unbound tether: omit HOLD/TAP key copy; say UNBOUND truthfully when nothing else.
    if (!parts.length) return 'TETHER UNBOUND';
    return parts.join(' · ');
  }

  // ---- HUD meta-arc: the three phases of complicity (STABLE LOAD, tag flicker, manifest ghost) ----
  // Mounted as a HUD sub-component (like the death banner). Driven by hud:phase / hud:tagFlicker
  // events the story system emits. Inject its CSS once, then create + tick it.
  if (!document.getElementById('sf-hudmeta-style')) {
    const ms = document.createElement('style');
    ms.id = 'sf-hudmeta-style';
    ms.textContent = HUD_META_CSS;
    document.head.appendChild(ms);
  }
  const hudMeta = createHudMeta(ctx);

  // ---- cargo hold physical style sheet ----
  const CARGO_HOLD_CSS = `
  .sf-cargo-panel {
    display: none;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 980px;
    height: 600px;
    background: color-mix(in srgb, var(--panel) 96%, transparent);
    border: 1px solid var(--visor-cyan);
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85), 0 0 30px color-mix(in srgb, var(--visor-cyan) 15%, transparent);
    z-index: 1000;
    pointer-events: auto;
    font-family: var(--mono, monospace);
    flex-direction: column;
    overflow: hidden;
  }
  .sf-cargo-panel.open {
    display: flex;
  }
  .sf-cargo-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--panel-edge);
    background: color-mix(in srgb, var(--panel-2) 40%, transparent);
  }
  .sf-cargo-title-group {
    display: flex;
    flex-direction: column;
  }
  .sf-cargo-panel__title {
    font-size: 16px;
    font-weight: bold;
    letter-spacing: 0.1em;
    color: var(--visor-cyan);
  }
  .sf-cargo-status-tag {
    font-size: 9px;
    letter-spacing: 0.05em;
    color: var(--ink-dim);
  }
  .sf-cargo-gauges {
    display: flex;
    gap: 30px;
    align-items: center;
  }
  .sf-cargo-gauge-item {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sf-gauge-label {
    font-size: 11px;
    color: var(--ink-dim);
    display: flex;
    flex-direction: column;
  }
  .sf-gauge-label span {
    font-weight: bold;
    color: var(--visor-cyan);
  }
  .sf-cargo-panel__close {
    background: none;
    border: 1px solid var(--ink-mute);
    border-radius: 4px;
    color: var(--ink-dim);
    font-size: 11px;
    padding: 4px 12px;
    cursor: pointer;
  }
  .sf-cargo-panel__close:hover {
    border-color: var(--visor-cyan);
    color: var(--visor-cyan);
  }
  .sf-cargo-body {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }
  .sf-cargo-left-rail {
    width: 160px;
    border-right: 1px solid var(--panel-edge);
    background: color-mix(in srgb, var(--panel-2) 20%, transparent);
    display: flex;
    flex-direction: column;
    padding: 15px 10px;
    gap: 10px;
  }
  .sf-cargo-rail-btn {
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--ink-dim);
    font-family: var(--mono);
    font-size: 12px;
    padding: 10px 15px;
    text-align: left;
    cursor: pointer;
    letter-spacing: 0.05em;
    transition: all 0.2s ease;
  }
  .sf-cargo-rail-btn:hover {
    background: color-mix(in srgb, var(--visor-cyan) 8%, transparent);
    color: var(--visor-cyan);
  }
  .sf-cargo-rail-btn.active {
    background: color-mix(in srgb, var(--visor-cyan) 12%, transparent);
    border-color: var(--visor-cyan-dim);
    color: var(--visor-cyan);
    font-weight: bold;
  }
  .sf-cargo-centerpiece {
    flex: 1;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--panel-edge);
  }
  .sf-cargo-hex-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.25;
    z-index: 1;
  }
  .sf-cargo-flicker-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.15;
    z-index: 2;
  }
  .sf-cargo-schematic {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 12px;
    padding: 20px;
    overflow-y: auto;
    z-index: 5;
  }
  .sf-cargo-block {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 14px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    min-width: 140px;
    height: 120px;
    box-sizing: border-box;
    z-index: 10;
    position: relative;
  }
  .sf-cargo-block.legal {
    border: 1px solid var(--visor-cyan-dim);
    background: color-mix(in srgb, var(--panel-2) 70%, transparent);
  }
  .sf-cargo-block.restricted {
    border: 1px solid var(--warn);
    background: color-mix(in srgb, var(--warn) 6%, color-mix(in srgb, var(--panel-2) 70%, transparent));
  }
  .sf-cargo-block.contraband {
    border: 1px solid var(--danger);
    background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--danger) 5%, transparent), color-mix(in srgb, var(--danger) 5%, transparent) 10px, color-mix(in srgb, var(--danger) 15%, transparent) 10px, color-mix(in srgb, var(--danger) 15%, transparent) 20px);
  }
  .sf-cargo-block.free-space {
    border: 1px dashed var(--ink-mute);
    background: transparent;
    cursor: default;
  }
  .sf-cargo-block:hover, .sf-cargo-block.selected {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
  }
  .sf-cargo-block.legal:hover, .sf-cargo-block.legal.selected {
    border-color: var(--visor-cyan);
    background: color-mix(in srgb, var(--visor-cyan) 10%, color-mix(in srgb, var(--panel-2) 70%, transparent));
    box-shadow: 0 0 15px color-mix(in srgb, var(--visor-cyan) 20%, transparent);
  }
  .sf-cargo-block.restricted:hover, .sf-cargo-block.restricted.selected {
    border-color: var(--warn);
    background: color-mix(in srgb, var(--warn) 15%, color-mix(in srgb, var(--panel-2) 70%, transparent));
    box-shadow: 0 0 15px color-mix(in srgb, var(--warn) 20%, transparent);
  }
  .sf-cargo-block.contraband:hover, .sf-cargo-block.contraband.selected {
    border-color: var(--danger);
    background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--danger) 10%, transparent), color-mix(in srgb, var(--danger) 10%, transparent) 10px, color-mix(in srgb, var(--danger) 25%, transparent) 10px, color-mix(in srgb, var(--danger) 25%, transparent) 20px);
    box-shadow: 0 0 15px color-mix(in srgb, var(--danger) 20%, transparent);
  }
  .sf-cargo-block-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 5px;
  }
  .sf-cargo-block-name {
    font-size: 12px;
    font-weight: bold;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .sf-cargo-lock-icon {
    font-size: 10px;
    color: var(--warn);
  }
  .sf-cargo-block-bottom {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sf-cargo-block-qty {
    font-size: 11px;
    color: var(--accent-2);
  }
  .sf-cargo-block-vol {
    font-size: 9px;
    color: var(--ink-dim);
  }
  .sf-cargo-badge {
    font-size: 8px;
    padding: 1px 4px;
    border-radius: 2px;
    font-weight: bold;
    align-self: flex-start;
    margin-top: 4px;
  }
  .sf-cargo-badge.fragile {
    background: color-mix(in srgb, var(--warn) 15%, transparent);
    color: var(--warn);
    border: 1px solid var(--warn);
  }
  .sf-cargo-badge.special {
    background: color-mix(in srgb, var(--visor-cyan) 15%, transparent);
    color: var(--visor-cyan);
    border: 1px solid var(--visor-cyan-dim);
  }
  .sf-cargo-badge.mission {
    background: color-mix(in srgb, var(--accent-2) 15%, transparent);
    color: var(--accent-2);
    border: 1px solid var(--accent-2);
  }
  .sf-cargo-supply-tree {
    height: 180px;
    border-top: 1px solid var(--panel-edge);
    background: color-mix(in srgb, var(--panel-2) 15%, transparent);
    padding: 15px 20px;
    overflow: hidden;
    z-index: 5;
  }
  .sf-cargo-supply-title {
    font-size: 11px;
    color: var(--ink-mute);
    margin-bottom: 8px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .sf-cargo-supply-chart {
    height: 140px;
  }
  .sf-cargo-inspector {
    width: 260px;
    padding: 20px;
    background: color-mix(in srgb, var(--panel-2) 20%, transparent);
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
    z-index: 10;
  }
  .sf-inspector-empty {
    color: var(--ink-mute);
    font-size: 12px;
    text-align: center;
    margin: auto 0;
  }
  .sf-inspector-content {
    display: flex;
    flex-direction: column;
    gap: 15px;
    height: 100%;
  }
  .sf-ins-name {
    font-size: 16px;
    font-weight: bold;
    color: var(--visor-cyan);
    margin: 0;
    border-bottom: 1px solid var(--panel-edge);
    padding-bottom: 8px;
  }
  .sf-ins-meta {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sf-ins-meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }
  .sf-ins-meta-row span:first-child {
    color: var(--ink-dim);
  }
  .sf-ins-meta-row span:last-child {
    color: var(--ink);
    font-weight: bold;
  }
  .sf-ins-market {
    background: color-mix(in srgb, var(--panel-2) 30%, transparent);
    border: 1px solid var(--panel-edge);
    border-radius: 6px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sf-ins-market h4 {
    font-size: 11px;
    margin: 0;
    text-transform: uppercase;
    color: var(--visor-cyan);
    letter-spacing: 0.05em;
  }
  .sf-ins-buyer {
    font-size: 11px;
    color: var(--ink);
    line-height: 1.4;
    margin: 0;
  }
  .sf-ins-actions {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sf-btn-fx {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: bold;
    padding: 10px;
    border-radius: 4px;
    cursor: pointer;
    text-align: center;
    transition: all 0.2s ease;
    width: 100%;
    box-sizing: border-box;
  }
  .sf-btn-route {
    background: var(--visor-cyan-dim, color-mix(in srgb, var(--visor-cyan) 30%, transparent));
    border: 1px solid var(--visor-cyan);
    color: var(--visor-cyan);
  }
  .sf-btn-route:hover:not(:disabled) {
    background: var(--visor-cyan);
    color: var(--panel);
  }
  .sf-btn-jettison {
    background: color-mix(in srgb, var(--danger) 15%, transparent);
    border: 1px solid var(--danger);
    color: var(--danger);
  }
  .sf-btn-jettison:hover:not(:disabled) {
    background: var(--danger);
    color: var(--ink);
  }
  .sf-btn-fx:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .sf-cargo-ledger {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    overflow: hidden;
    z-index: 5;
  }
  .sf-ledger-header {
    font-size: 12px;
    color: var(--visor-cyan);
    font-weight: bold;
    margin-bottom: 12px;
    letter-spacing: 0.05em;
  }
  .sf-ledger-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sf-ledger-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: color-mix(in srgb, var(--panel-2) 40%, transparent);
    border: 1px solid var(--panel-edge);
    border-radius: 6px;
    font-size: 11px;
  }
  .sf-ledger-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sf-ledger-title {
    font-weight: bold;
    color: var(--ink);
  }
  .sf-ledger-side {
    padding: 1px 4px;
    border-radius: 2px;
    font-size: 9px;
    font-weight: bold;
    margin-right: 6px;
  }
  .sf-ledger-side.buy {
    background: color-mix(in srgb, var(--visor-cyan) 15%, transparent);
    color: var(--visor-cyan);
  }
  .sf-ledger-side.sell {
    background: color-mix(in srgb, var(--warn) 15%, transparent);
    color: var(--warn);
  }
  .sf-ledger-station {
    color: var(--ink-dim);
  }
  .sf-ledger-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
  .sf-ledger-val {
    font-weight: bold;
    color: var(--accent-2);
  }
  .sf-ledger-profit {
    font-size: 9px;
    color: var(--good);
  }
  .sf-cargo-empty-msg {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--ink-mute);
    font-size: 13px;
    width: 100%;
  }
  .sf-cargo-beam-mount {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 900;
  }
  `;

  if (!document.getElementById('sf-cargohold-style')) {
    const ms = document.createElement('style');
    ms.id = 'sf-cargohold-style';
    ms.textContent = CARGO_HOLD_CSS;
    document.head.appendChild(ms);
  }

  // ---- cargo panel overlay ----
  const cargoPanel = document.createElement('div');
  cargoPanel.className = 'sf-cargo-panel';
  cargoPanel.innerHTML = `
    <div class="sf-cargo-panel__head">
      <div class="sf-cargo-title-group">
        <span class="sf-cargo-panel__title">CARGO HOLD MANIFEST</span>
        <span class="sf-cargo-status-tag">MANIFEST ACQUIRED</span>
      </div>
      <div class="sf-cargo-gauges">
        <div class="sf-cargo-gauge-item" id="sf-gauge-used">
          <span class="sf-gauge-label">CAPACITY: <span class="sf-cargo-summary-used">0 / 40 u</span></span>
        </div>
        <div class="sf-cargo-gauge-item" id="sf-gauge-risk">
          <span class="sf-gauge-label">SCAN RISK: <span class="sf-cargo-summary-risk">0%</span></span>
        </div>
      </div>
      <button class="sf-cargo-panel__close" type="button">ESC</button>
    </div>
    <div class="sf-cargo-body">
      <div class="sf-cargo-left-rail">
        <button class="sf-cargo-rail-btn active" data-tab="cargo" type="button">CARGO</button>
        <button class="sf-cargo-rail-btn" data-tab="materials" type="button">MATERIALS</button>
        <button class="sf-cargo-rail-btn" data-tab="salvage" type="button">SALVAGE</button>
        <button class="sf-cargo-rail-btn" data-tab="mission" type="button">MISSION</button>
        <button class="sf-cargo-rail-btn" data-tab="ledger" type="button">LEDGER</button>
      </div>
      <div class="sf-cargo-centerpiece">
        <div class="sf-cargo-hex-bg"></div>
        <div class="sf-cargo-flicker-bg"></div>
        <div class="sf-cargo-schematic"></div>
        <div class="sf-cargo-supply-tree"></div>
      </div>
      <div class="sf-cargo-inspector">
        <div class="sf-inspector-empty">No item selected. Select a block to inspect.</div>
        <div class="sf-inspector-content" style="display:none;">
          <h3 class="sf-ins-name">Commodity</h3>
          <div class="sf-ins-meta">
            <div class="sf-ins-meta-row"><span>Units/Vol:</span><span class="sf-ins-qty">0 u / 0 u</span></div>
            <div class="sf-ins-meta-row"><span>Legality:</span><span class="sf-ins-legal">LEGAL</span></div>
            <div class="sf-ins-meta-row"><span>Avg Basis:</span><span class="sf-ins-basis">N/A</span></div>
          </div>
          <div class="sf-ins-market">
            <h4>Market Intelligence</h4>
            <p class="sf-ins-buyer">Best Buyer: None</p>
          </div>
          <div class="sf-ins-actions">
            <button class="sf-btn-route sf-btn-fx" type="button">SET COURSE</button>
            <button class="sf-btn-jettison sf-btn-fx" type="button">JETTISON</button>
          </div>
        </div>
      </div>
    </div>
  `;
  root.appendChild(cargoPanel);

  // mount route beam overlay
  const beamMount = document.createElement('div');
  beamMount.className = 'sf-cargo-beam-mount';
  cargoPanel.appendChild(beamMount);
  const beamFx = createRouteBeam(beamMount, { width: 980, height: 600 });

  // mount background hexPattern
  const hexBg = cargoPanel.querySelector('.sf-cargo-hex-bg');
  const hexFx = createHexPattern(hexBg, { cols: 15, rows: 6, size: 16, width: 560, height: 260 });
  const hexCells = [];
  for (let cIdx = 0; cIdx < 15; cIdx++) {
    for (let rIdx = 0; rIdx < 6; rIdx++) {
      const isEdge = cIdx === 0 || cIdx === 14 || rIdx === 0 || rIdx === 5;
      hexCells.push({ col: cIdx, row: rIdx, kind: isEdge ? 'neutral' : 'good', intensity: isEdge ? 0.12 : 0.04 });
    }
  }
  hexFx.setCells(hexCells);

  // mount flickerGrid
  const flickerBg = cargoPanel.querySelector('.sf-cargo-flicker-bg');
  const gridFx = createFlickerGrid(flickerBg, { width: 560, height: 260, cell: 8, gap: 2, token: '--visor-cyan' });

  // mount gauges
  const gaugeUsedEl = cargoPanel.querySelector('#sf-gauge-used');
  const gaugeUsedFx = createCircularGauge(gaugeUsedEl, { size: 36, stroke: 4, kind: 'route' });

  const gaugeRiskEl = cargoPanel.querySelector('#sf-gauge-risk');
  const gaugeRiskFx = createCircularGauge(gaugeRiskEl, { size: 36, stroke: 4, kind: 'danger' });

  const supplyTreeEl = cargoPanel.querySelector('.sf-cargo-supply-tree');
  const supplyTreeTitle = document.createElement('div');
  supplyTreeTitle.className = 'sf-cargo-supply-title';
  supplyTreeTitle.textContent = 'Catalog Supply Chain';
  const supplyTreeMount = document.createElement('div');
  supplyTreeMount.className = 'sf-cargo-supply-chart';
  supplyTreeEl.append(supplyTreeTitle, supplyTreeMount);
  const supplyTreeFx = createSupplyTree(supplyTreeMount, { width: 520, height: 140 });

  let cargoPanelOpen = false;
  if (state.ui) state.ui.cargoPanelOpen = false;
  let activeTab = 'cargo';
  let selectedCommodityId = null;

  const CMDTY_MAP = new Map();
  function buildCmdtyMap() {
    if (CMDTY_MAP.size > 0) return;
    for (const c of COMMODITIES) CMDTY_MAP.set(c.id, c);
  }

  function getAverageBasis(s, commodityId) {
    const player = s.player;
    const lots = player && player.tradeLots && player.tradeLots[commodityId];
    if (!lots || !lots.length) return null;
    let totalCost = 0;
    let totalQty = 0;
    for (const lot of lots) {
      totalCost += lot.qty * lot.unit;
      totalQty += lot.qty;
    }
    return totalQty > 0 ? Math.round(totalCost / totalQty) : null;
  }

  function getMissionCargoIds(s) {
    const ids = new Set();
    if (s.missions && Array.isArray(s.missions.active)) {
      for (const m of s.missions.active) {
        if (m.status === 'active' && m.params && m.params.cmdtyId) {
          ids.add(m.params.cmdtyId);
        }
      }
    }
    return ids;
  }

  function cargoMemoryAgeLabel(s, seenAt) {
    const now = Math.max(0, Number(s && s.simTime) || 0);
    const ageS = Math.max(0, now - Math.max(0, Number(seenAt) || 0));
    if (ageS < 60) return 'fresh';
    return Math.max(1, Math.round(ageS / 60)) + ' min ago';
  }

  function supplyTreeNodesFor(commodityId) {
    const def = CMDTY_MAP.get(commodityId);
    if (!def) return [];
    const nodes = [{ id: commodityId, label: def.name, role: 'hub' }];
    for (const role of def.producedBy || []) {
      nodes.push({ id: 'produce:' + role, label: stationRoleLabel(role), role: 'produce' });
    }
    for (const role of def.consumedBy || []) {
      nodes.push({ id: 'consume:' + role, label: stationRoleLabel(role), role: 'consume' });
    }
    return nodes;
  }

  function updateSupplyTree(commodityId, hasKnownBuyer) {
    if (!commodityId) {
      supplyTreeTitle.textContent = 'Catalog Supply Chain';
      supplyTreeFx.setNodes([]);
      supplyTreeFx.setFlow(false);
      return;
    }
    const def = CMDTY_MAP.get(commodityId);
    supplyTreeTitle.textContent = def
      ? `Catalog Supply Chain: ${def.category}`
      : 'Catalog Supply Chain';
    const nodes = supplyTreeNodesFor(commodityId);
    if (hasKnownBuyer) {
      for (const node of nodes) {
        if (node.role === 'consume') node.flow = true;
      }
    }
    supplyTreeFx.setNodes(nodes);
    supplyTreeFx.setFlow(!!hasKnownBuyer);
  }

  function updateInspector(commodityId) {
    const emptyEl = cargoPanel.querySelector('.sf-inspector-empty');
    const contentEl = cargoPanel.querySelector('.sf-inspector-content');

    if (!commodityId) {
      emptyEl.style.display = 'block';
      contentEl.style.display = 'none';
      updateSupplyTree(null, false);
      beamFx.setPath([], { active: false });
      return;
    }

    emptyEl.style.display = 'none';
    contentEl.style.display = 'flex';

    const def = CMDTY_MAP.get(commodityId);
    const qty = (state.player.cargo.items || {})[commodityId] || 0;
    const vol = def ? (def.volPerU || 1) * qty : qty;
    const name = cargoDisplayName(commodityId);

    contentEl.querySelector('.sf-ins-name').textContent = name;
    contentEl.querySelector('.sf-ins-qty').textContent = `${qty} u / ${vol.toFixed(1)} u`;

    const legalEl = contentEl.querySelector('.sf-ins-legal');
    const legality = def ? def.legality : 'legal';
    legalEl.textContent = legality.toUpperCase();
    if (legality === 'contraband') {
      legalEl.style.color = 'var(--danger)';
    } else if (legality === 'restricted') {
      legalEl.style.color = 'var(--warn)';
    } else {
      legalEl.style.color = 'var(--visor-cyan)';
    }

    const basisText = contentEl.querySelector('.sf-ins-basis');
    const basis = getAverageBasis(state, commodityId);
    basisText.textContent = basis != null ? `${basis} CR` : 'N/A';

    const buyerText = contentEl.querySelector('.sf-ins-buyer');
    const routeBtn = contentEl.querySelector('.sf-btn-route');
    const best = bestKnownSellFor(state, commodityId);

    if (best) {
      const age = cargoMemoryAgeLabel(state, best.seenAt);
      const jumps = best.jumps == null ? '?' : best.jumps;
      const jumpText = jumps === 1 ? '1 jump' : `${jumps} jumps`;
      buyerText.innerHTML = `Best Buyer: <b>${escapeHtml(best.stationName)}</b><br>Price: <span class="mono" style="color:var(--accent-2);">${best.sell.toLocaleString()} CR</span> (${escapeHtml(age)}, ${escapeHtml(jumpText)})`;
      routeBtn.disabled = false;
      routeBtn.onclick = () => {
        applyTradeNavigation(ctx, best.stationId, commodityId);
      };
    } else {
      buyerText.innerHTML = `Best Buyer: <b>None Known</b><br><span style="color:var(--ink-mute);">No market data recorded.</span>`;
      routeBtn.disabled = true;
      routeBtn.onclick = null;
    }

    const jetBtn = contentEl.querySelector('.sf-btn-jettison');
    const missionCmdtyIds = getMissionCargoIds(state);
    const persistent = isPersistentCargoId(state, commodityId);
    const isLocked = persistent || missionCmdtyIds.has(commodityId);

    if (isLocked) {
      jetBtn.disabled = true;
      jetBtn.onclick = null;
      if (persistent) {
        jetBtn.title = 'Personal effects cannot be jettisoned';
        jetBtn.textContent = 'LOCK: PERSISTENT';
      } else {
        jetBtn.title = 'Contract cargo cannot be jettisoned';
        jetBtn.textContent = 'LOCK: CONTRACT';
      }
    } else {
      jetBtn.disabled = false;
      jetBtn.title = `Jettison all ${qty} units of ${name}`;
      jetBtn.textContent = 'JETTISON';
      jetBtn.onclick = async () => {
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
        const ok = await confirm({
          title: 'Confirm Jettison',
          body: `Are you sure you want to jettison ${qty}x ${name}? This action is permanent.`,
          confirmLabel: 'Jettison',
          danger: true
        });
        if (ok) {
          ctx.bus.emit('cargo:jettison', { commodityId, qty });
        }
      };
    }

    updateSupplyTree(commodityId, !!best);

    setTimeout(() => {
      if (!cargoPanelOpen) return;
      const parentRect = cargoPanel.getBoundingClientRect();
      const elBlock = cargoPanel.querySelector(`.sf-cargo-block[data-id="${commodityId}"]`);
      const elBuyerCard = cargoPanel.querySelector('.sf-ins-market');
      if (elBlock && elBuyerCard && best) {
        const rA = elBlock.getBoundingClientRect();
        const rB = elBuyerCard.getBoundingClientRect();
        const ptA = {
          x: rA.left + rA.width / 2 - parentRect.left,
          y: rA.top + rA.height / 2 - parentRect.top
        };
        const ptB = {
          x: rB.left + rB.width / 2 - parentRect.left,
          y: rB.top + rB.height / 2 - parentRect.top
        };
        beamFx.setPath([ptA, ptB], { active: true, kind: 'route' });
      } else {
        beamFx.setPath([], { active: false });
      }
    }, 50);
  }

  function refreshCargoPanel() {
    if (!cargoPanelOpen) return;
    buildCmdtyMap();

    const c = (state.player || {}).cargo || {};
    const items = c.items || {};
    const used = Math.round(c.usedVolume || 0);
    const cap = Math.round(c.capVolume || 40);

    gaugeUsedFx.setValue(cap > 0 ? used / cap : 0, { label: `${used}/${cap} u` });
    cargoPanel.querySelector('.sf-cargo-summary-used').textContent = `${used} / ${cap} u`;

    let hasContraband = false;
    for (const id in items) {
      if (items[id] > 0) {
        const def = CMDTY_MAP.get(id);
        if (def && def.legality === 'contraband') hasContraband = true;
      }
    }
    gaugeRiskFx.setValue(hasContraband ? 0.75 : 0, { label: hasContraband ? '75%' : '0%' });
    cargoPanel.querySelector('.sf-cargo-summary-risk').textContent = hasContraband ? '75%' : '0%';

    const schematicEl = cargoPanel.querySelector('.sf-cargo-schematic');
    const supplyTreeEl = cargoPanel.querySelector('.sf-cargo-supply-tree');

    if (activeTab === 'ledger') {
      schematicEl.style.display = 'none';
      supplyTreeEl.style.display = 'none';
      let led = cargoPanel.querySelector('.sf-cargo-ledger');
      if (!led) {
        led = document.createElement('div');
        led.className = 'sf-cargo-ledger';
        cargoPanel.querySelector('.sf-cargo-centerpiece').appendChild(led);
      }
      led.style.display = 'flex';

      const ledgerList = state.player.tradeLedger || [];
      if (!ledgerList.length) {
        led.innerHTML = `
          <div class="sf-ledger-header">RECENT TRANSACTIONS</div>
          <div class="sf-cargo-empty-msg">No transactions recorded in ledger.</div>
        `;
      } else {
        let rowsHtml = '';
        for (const entry of ledgerList) {
          const name = escapeHtml(cargoDisplayName(entry.commodityId));
          const sideClass = entry.side === 'buy' ? 'buy' : 'sell';
          const sideText = sideClass.toUpperCase();
          const age = escapeHtml(cargoMemoryAgeLabel(state, entry.seenAt));
          const stn = escapeHtml(respawnStationName(entry.stationId));
          const qty = Math.max(0, Math.floor(Number(entry.qty) || 0));
          const total = Math.max(0, Math.round(Number(entry.total) || 0));
          const profit = Math.round(Number(entry.profit) || 0);
          const profitHtml = profit > 0 ? `<span class="sf-ledger-profit">+${profit.toLocaleString()} CR</span>` : '';
          rowsHtml += `
            <div class="sf-ledger-row">
              <div class="sf-ledger-left">
                <span class="sf-ledger-title"><span class="sf-ledger-side ${sideClass}">${sideText}</span> ${qty}x ${name}</span>
                <span class="sf-ledger-station">${stn} (${age})</span>
              </div>
              <div class="sf-ledger-right">
                <span class="sf-ledger-val">${total.toLocaleString()} CR</span>
                ${profitHtml}
              </div>
            </div>
          `;
        }
        led.innerHTML = `
          <div class="sf-ledger-header">RECENT TRANSACTIONS</div>
          <div class="sf-ledger-list">${rowsHtml}</div>
        `;
      }
      beamFx.setPath([], { active: false });
      updateInspector(null);
      return;
    }

    schematicEl.style.display = 'flex';
    supplyTreeEl.style.display = 'block';
    const led = cargoPanel.querySelector('.sf-cargo-ledger');
    if (led) led.style.display = 'none';

    const missionCmdtyIds = getMissionCargoIds(state);
    const keys = Object.keys(items).filter(id => {
      if (items[id] <= 0) return false;
      const def = CMDTY_MAP.get(id);
      if (activeTab === 'materials') {
        return def && (def.category === 'raw ore' || def.category === 'gas' || def.category === 'crystal');
      }
      if (activeTab === 'salvage') {
        return def && def.category === 'salvage';
      }
      if (activeTab === 'mission') {
        return missionCmdtyIds.has(id);
      }
      return true;
    });

    schematicEl.innerHTML = '';

    if (!keys.length) {
      schematicEl.innerHTML = `<div class="sf-cargo-empty-msg">No items in this category.</div>`;
      updateInspector(null);
      beamFx.setPath([], { active: false });
      return;
    }

    let totalFilteredVolume = 0;
    const itemVolumes = {};
    for (const id of keys) {
      const qty = items[id];
      const def = CMDTY_MAP.get(id);
      const vol = cargoVolumeForRow(state, id, qty, def);
      itemVolumes[id] = vol;
      totalFilteredVolume += vol;
    }

    const frag = document.createDocumentFragment();
    for (const id of keys) {
      const qty = items[id];
      const def = CMDTY_MAP.get(id);
      const name = escapeHtml(cargoDisplayName(id));
      const vol = itemVolumes[id];
      const persistent = isPersistentCargoId(state, id);
      const isLocked = persistent || missionCmdtyIds.has(id);

      let legalClass = 'legal';
      if (def && def.legality === 'restricted') legalClass = 'restricted';
      if (def && def.legality === 'contraband') legalClass = 'contraband';

      const block = document.createElement('div');
      block.className = `sf-cargo-block ${legalClass}`;
      if (selectedCommodityId === id) block.classList.add('selected');
      block.dataset.id = id;
      block.style.flex = `${Math.max(1, Math.round(vol))} ${Math.max(1, Math.round(vol))} 140px`;

      let badgeHtml = '';
      if (def) {
        if (id === 'cmdty_volatiles' || id === 'cmdty_medical') {
          badgeHtml = `<span class="sf-cargo-badge fragile">FRAGILE</span>`;
        } else if (def.category === 'exotic' || def.category === 'tech') {
          badgeHtml = `<span class="sf-cargo-badge special">EXOTIC</span>`;
        } else if (missionCmdtyIds.has(id)) {
          badgeHtml = `<span class="sf-cargo-badge mission">CONTRACT</span>`;
        }
      }

      block.innerHTML = `
        <div class="sf-cargo-block-top">
          <span class="sf-cargo-block-name">${name}</span>
          ${isLocked ? '<span class="sf-cargo-lock-icon">🔒</span>' : ''}
        </div>
        <div class="sf-cargo-block-bottom">
          <span class="sf-cargo-block-qty">${qty} units</span>
          <span class="sf-cargo-block-vol">${vol.toFixed(1)} u vol</span>
          ${badgeHtml}
        </div>
      `;

      block.addEventListener('click', (ev) => {
        ev.stopPropagation();
        selectedCommodityId = id;
        schematicEl.querySelectorAll('.sf-cargo-block').forEach(b => b.classList.remove('selected'));
        block.classList.add('selected');
        updateInspector(id);
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
      });

      frag.appendChild(block);
    }

    const freeVol = Math.max(0, cap - used);
    if (freeVol > 0 && activeTab === 'cargo') {
      const freeBlock = document.createElement('div');
      freeBlock.className = 'sf-cargo-block free-space';
      freeBlock.style.flex = `${Math.max(1, Math.round(freeVol))} ${Math.max(1, Math.round(freeVol))} 140px`;
      freeBlock.innerHTML = `
        <div class="sf-cargo-block-top">
          <span class="sf-cargo-block-name" style="color:var(--ink-mute);">FREE CAPACITY</span>
        </div>
        <div class="sf-cargo-block-bottom">
          <span class="sf-cargo-block-qty" style="color:var(--ink-mute);">${freeVol} u free</span>
        </div>
      `;
      frag.appendChild(freeBlock);
    }

    schematicEl.appendChild(frag);

    if (!selectedCommodityId && keys.length > 0) {
      selectedCommodityId = keys[0];
      const firstBlock = schematicEl.querySelector(`.sf-cargo-block[data-id="${selectedCommodityId}"]`);
      if (firstBlock) firstBlock.classList.add('selected');
    }

    if (selectedCommodityId) {
      updateInspector(selectedCommodityId);
    } else {
      updateInspector(null);
    }
  }

  const railBtns = cargoPanel.querySelectorAll('.sf-cargo-rail-btn');
  railBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      railBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      selectedCommodityId = null;
      refreshCargoPanel();
      gridFx.reveal({
        resolveTo: (c, r, cols, rows) => {
          return 0.1 + 0.4 * Math.sin(c * 0.5) * Math.cos(r * 0.5);
        },
        durationMs: 400
      });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
    });
  });

  // Listen for the jettison event in case the cargo system doesn't handle it natively
  ctx.bus.on('cargo:jettison', ({ commodityId, qty }) => {
    const cargoSys = ctx.registry && ctx.registry.get('cargo');
    if (cargoSys && cargoSys.jettison) {
      const dumped = cargoSys.jettison(commodityId, qty || 1);
      if (dumped > 0) {
        const name = cargoDisplayName(commodityId);
        ctx.bus.emit('toast', { text: `Jettisoned ${dumped}x ${name}`, kind: 'warn', ttl: 2 });
      }
    }
  });

  // Toggle function
  function toggleCargoPanel() {
    cargoPanelOpen = !cargoPanelOpen;
    if (state.ui) state.ui.cargoPanelOpen = cargoPanelOpen;
    cargoPanel.classList.toggle('open', cargoPanelOpen);

    gridFx.setActive(cargoPanelOpen);
    hexFx.setActive(cargoPanelOpen);
    beamFx.setActive(cargoPanelOpen);
    gaugeUsedFx.setActive(cargoPanelOpen);
    gaugeRiskFx.setActive(cargoPanelOpen);

    if (cargoPanelOpen) {
      refreshCargoPanel();
      gridFx.reveal({
        resolveTo: (c, r, cols, rows) => {
          return 0.1 + 0.4 * Math.sin(c * 0.5) * Math.cos(r * 0.5);
        },
        durationMs: 400
      });
    } else {
      beamFx.setPath([], { active: false });
    }
    ctx.bus.emit('audio:cue', { id: cargoPanelOpen ? 'ui_open' : 'ui_back' });
  }

  // close function
  function closeCargoPanel() {
    if (!cargoPanelOpen) return;
    cargoPanelOpen = false;
    if (state.ui) state.ui.cargoPanelOpen = false;
    cargoPanel.classList.remove('open');

    gridFx.setActive(false);
    hexFx.setActive(false);
    beamFx.setActive(false);
    gaugeUsedFx.setActive(false);
    gaugeRiskFx.setActive(false);
    beamFx.setPath([], { active: false });

    ctx.bus.emit('audio:cue', { id: 'ui_back' });
  }

  // Close button
  const cargoCloseBtn = cargoPanel.querySelector('.sf-cargo-panel__close');
  cargoCloseBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeCargoPanel();
  });

  // Refresh when cargo changes
  ctx.bus.on('cargo:changed', () => { if (cargoPanelOpen) refreshCargoPanel(); });

  // Expose toggle/close for the input system
  ctx.bus.on('ui:toggleCargo', toggleCargoPanel);
  ctx.bus.on('ui:closeCargo', closeCargoPanel);

  // Make the CARGO stat tile clickable to open the panel
  const cargoStat = center.querySelector('[data-k=cargo]');
  if (cargoStat) {
    const statTile = cargoStat.closest('.sf-stat');
    if (statTile) {
      statTile.style.cursor = 'pointer';
      statTile.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleCargoPanel();
      });
    }
  }

  // Close on ESC when panel focus is inside it; ui/input.js handles the global flight case.
  cargoPanel.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.stopPropagation(); closeCargoPanel(); }
  });

  // ---------------------------------------------------------------------------
  // Event-driven (rebuild) path — credits / cargo / objectives marked dirty.
  // ---------------------------------------------------------------------------
  let creditsDirty = true, cargoDirty = true, objDirty = true;
  ctx.bus.on('credits:changed', () => { creditsDirty = true; });
  ctx.bus.on('cargo:changed', () => { cargoDirty = true; });
  ctx.bus.on('ship:statsChanged', () => { cargoDirty = true; });
  ctx.bus.on('mission:updated', () => { objDirty = true; });
  ctx.bus.on('mission:accepted', () => { objDirty = true; });
  ctx.bus.on('mission:completed', () => { objDirty = true; });
  ctx.bus.on('mission:abandoned', () => { objDirty = true; });

  // Reticle accuracy bloom: the crosshair expands with sustained fire and contracts when cool — a
  // classic combat-readability cue. Driven by the player's own combat:fire events; _recoilBloom
  // spikes on each shot and decays each frame. Applied as a scale on the reticle's inner SVG (not
  // the reticle div, whose transform centers it — scaling the div would recenter awkwardly).
  let _recoilBloom = 0;   // 0 = rested (scale 1), up to ~1 (scale ~1.25) under sustained fire
  ctx.bus.on('combat:fire', (p) => {
    if (!p || p.ownerId !== state.playerId) return;
    _recoilBloom = Math.min(1, _recoilBloom + 0.35);
  });

  // WANTED indicator (V2 §20b / cut-list #15): a persistent red alert when the player's heat is
  // above the lawful-engagement threshold. Event-driven from the heat system's heat:changed.
  let wantedActive = false;
  if (alerts) {
    ctx.bus.on('heat:changed', (p) => {
      const v = p && typeof p.value === 'number' ? p.value : (state.player && state.player.heat) || 0;
      const wanted = v >= 0.15;
      const tier = v >= 0.6 ? 'HIGH' : v >= 0.35 ? 'MODERATE' : 'LOW';
      if (wanted && !wantedActive) {
        alerts.raise({ key: 'wanted', sev: 'danger', text: 'WANTED · LAW ENFORCEMENT ACTIVE', ttl: Infinity });
        wantedActive = true;
      } else if (wanted && wantedActive) {
        // refresh the text to show the new tier (raise dedups by key but updates text/sev)
        alerts.raise({ key: 'wanted', sev: 'danger', text: 'WANTED (' + tier + ') · HUNTERS INBOUND', ttl: Infinity });
      } else if (!wanted && wantedActive) {
        alerts.clear('wanted');
        wantedActive = false;
      }
    });
  }

  // Forced weapon-heat vent (Micro-Loops): when the player's guns peg heatMax, weapons.js locks them
  // out for ~2s while heat dumps. Flash the heat bars red + raise a top-center alert so the lockout
  // reads as a rhythm beat ("vent, then resume"), not a dead trigger.
  ctx.bus.on('weapons:vent', (p) => {
    if (!p || p.ownerId !== state.playerId) return;
    const venting = p.phase === 'start';
    wpnHeatsWrap.classList.toggle('venting', venting);
    if (rowEls.heat) rowEls.heat.classList.toggle('sf-bar--venting', venting);
    if (alerts) {
      if (venting) alerts.raise({ key: 'wpn-vent', sev: 'warn', text: 'WEAPONS VENTING', ttl: 2.3 });
      else alerts.clear('wpn-vent');
    }
    if (venting) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
  });

  // Credit count-up tween. Instead of snapping the digits to the new value on a credits:changed
  // event, we ease the displayed number from the previously-shown value toward the target over
  // CRED_TWEEN seconds. This makes a bounty / sale land as a fast count-up rather than an instant
  // digit jump — the classic "numbers feel alive" polish. Retargets smoothly if credits change
  // again mid-tween (animates from whatever is currently displayed).
  let _credFrom = 0, _credTo = 0, _credT = 1;   // _credT in [0,1]; 1 = at rest at target
  const CRED_TWEEN = 0.4;                        // seconds
  function _credCurrent() {
    // value currently shown (eases _credFrom -> _credTo)
    if (_credT >= 1) return _credTo;
    const e = 1 - (1 - _credT) * (1 - _credT);   // ease-out quad
    return _credFrom + (_credTo - _credFrom) * e;
  }
  function refreshCredits() {
    const target = Math.round((state.player || {}).credits || 0);
    // Retarget from the value currently displayed (not the old target) so chained changes stay smooth
    _credFrom = _credCurrent();
    _credTo = target;
    _credT = 0;
    creditsDirty = false;
    setText(elCredits, Math.round(_credFrom).toLocaleString());
    if (_credTo !== _credFrom) chipShow('credits');   // money moved — surface the chip
  }
  // Advance the tween on the 10Hz slow tick while a tween is in flight. When at rest this is a no-op.
  function tickCreditsTween(dt) {
    if (_credT >= 1) return;
    _credT = Math.min(1, _credT + (dt || 0.016) / CRED_TWEEN);
    setText(elCredits, Math.round(_credCurrent()).toLocaleString());
  }
  function refreshCargo() {
    cargoDirty = false;
    const c = (state.player || {}).cargo || {};
    const used = Math.round(c.usedVolume || 0);
    const cap = Math.round(c.capVolume || 40);
    const label = `${used} / ${cap} u`;
    if (elCargo && elCargo.textContent !== label) chipShow('cargo');   // hold changed — surface it
    setText(elCargo, label);
    setClass(elCargo, 'sf-warn', cap > 0 && used >= cap);
  }
  let lastObjectivesSig = '';
  function refreshObjectives() {
    objDirty = false;
    // One-objective law: contract lists belong in the on-demand Mission Log. The flight HUD has
    // exactly one command surface (missionTracker), including when nothing has been tracked yet.
    // Keep the legacy node mounted for compatibility with probes, but never paint its old 1–4 row
    // stack; that stack was the source of repeated, overlapping mission copy in the live capture.
    lastObjectivesSig = '__active-objective-owns-attention__';
    if (objWrap.textContent) objWrap.textContent = '';
    setDisplay(objWrap, false);
  }

  // ---------------------------------------------------------------------------
  // Combat HUD update — lock ring + weapon heat bars + target lock diamond
  // ---------------------------------------------------------------------------
  function updateCombatHud(p, slow) {
    if (!p) {
      lockRing.classList.remove('active', 'locked');
      lockDiamond.classList.remove('visible');
      leadPip.classList.remove('visible');
      wpnHeatsWrap.style.display = 'none';
      return;
    }

    const combat = p.data && p.data.combat;
    const weapons = p.data && p.data.weapons;
    const hasWeapons = weapons && weapons.length > 0;

    // ---- Lock-on progress ring ----
    // Show when the player has a lock-requiring weapon and is building/holding a lock.
    const lockProgress = combat ? (combat.lockProgress || 0) : 0;
    const isLocking = lockProgress > 0 && lockProgress < 1;
    const isLocked = lockProgress >= 1;
    if (isLocking || isLocked) {
      lockRing.classList.add('active');
      setClass(lockRing, 'locked', isLocked);
      const offset = LOCK_C * (1 - lockProgress);
      const offsetText = offset.toFixed(2);
      if (lockFill.getAttribute('stroke-dashoffset') !== offsetText) lockFill.setAttribute('stroke-dashoffset', offsetText);
      setText(lockLabel, isLocked ? 'LOCKED' : Math.round(lockProgress * 100) + '%');
    } else {
      lockRing.classList.remove('active', 'locked');
    }
    // Lock-acquired tone: fire a two-note ascending cue on the rising edge (not-locked → locked).
    // Locking a missile target was visually indicated but sonically silent — a clear cue closes that.
    if (isLocked && !_wasLocked) ctx.bus.emit('audio:cue', { id: 'lock_acquired' });
    _wasLocked = isLocked;

    // ---- Per-weapon heat bars ----
    // Rebuild the weapon heat bar DOM when the ship or weapon loadout changes.
    if (hasWeapons) {
      const shipEntityId = p.id;
      if (wpnHeatShipId !== shipEntityId || wpnHeatEls.length !== weapons.length) {
        wpnHeatShipId = shipEntityId;
        rebuildWeaponHeatBars(weapons);
      }
      // Update fills every frame (cheap transforms only).
      for (let i = 0; i < weapons.length; i++) {
        const w = weapons[i];
        const el = wpnHeatEls[i];
        if (!el) continue;
        const hMax = w.heatMax != null ? w.heatMax : 100;
        const hCur = w._heat || 0;
        const frac = hMax > 0 ? clamp01(hCur / hMax) : 0;
        setScaleX(el.fill, frac);
        const overheated = hCur >= hMax && hMax > 0;
        setClass(el.row, 'overheated', overheated);
      }
      // Position above the status bars panel (recalc on slow ticks to track layout changes).
      if (slow) {
        const barsRect = bars.getBoundingClientRect();
        setStyle(wpnHeatsWrap, 'bottom', (window.innerHeight - barsRect.top + 6) + 'px');
      }
      setStyle(wpnHeatsWrap, 'display', 'flex');
    } else {
      setStyle(wpnHeatsWrap, 'display', 'none');
    }

    // ---- Target lock diamond (world-space overlay on locked/selected target) ----
    const tid = (state.player || {}).targetId;
    const tgt = tid != null ? state.entities.get(tid) : null;
    if (tgt && tgt.alive && helpers.worldToScreen) {
      const proj = helpers.worldToScreen({ x: tgt.pos.x, y: 0, z: tgt.pos.z });
      if (proj.onScreen) {
        lockDiamond.classList.add('visible');
        setHudScreenTransform(lockDiamond, proj.x, proj.y);
        // Tint: red when missile-locked, cyan when just selected/tracking.
        const tgtLocked = isLocked && combat && combat.lockTarget === tid;
        setClass(lockDiamond, 'locked-tgt', tgtLocked);
      } else {
        lockDiamond.classList.remove('visible');
      }
    } else {
      lockDiamond.classList.remove('visible');
    }

    // ---- Lead pip (BP-02) — pure gate in gunnery; HUD only applies screen coords ----
    const pipOverlay = computeLeadPipOverlay(p, tgt, state, {
      worldToScreen: helpers.worldToScreen,
      isHostileToPlayer,
      leadSolution,
      hasBallisticWeapon,
      primaryProjSpeed,
    });
    if (pipOverlay.visible) {
      leadPip.classList.add('visible');
      setHudScreenTransform(leadPip, pipOverlay.x, pipOverlay.y);
      setClass(leadPip, 'on-solution', pipOverlay.onSolution);
    } else {
      leadPip.classList.remove('visible');
    }
  }

  // ---------------------------------------------------------------------------
  // 60Hz cheap path
  // ---------------------------------------------------------------------------
  let lowShieldActive = false, lowHullActive = false;
  let lastDefId = null;
  let elReticle = null;
  let cachedNavStationId = null;
  let cachedNavEntity = null;
  let cachedNavListLength = -1;
  let cachedNavIndexVersion = -1;
  let lastNavLabel = '';
  let lastNavDist = '';
  let lastNavEta = '';
  const numericClock = createHudClock(10);
  const targetClock = createHudClock(20);
  const overlayClock = createHudClock(30);
  const radarClock = createHudClock(10);

  function syncSafetyAlerts(p, hullFrac, shieldFrac) {
    if (!alerts || !p) return;
    if (hullFrac == null) hullFrac = p.hullMax ? clamp01(p.hull / p.hullMax) : 0;
    if (shieldFrac == null) shieldFrac = p.shieldMax ? clamp01(p.shield / p.shieldMax) : 0;
    const lowShield = shieldFrac > 0 && shieldFrac < 0.2;
    if (lowShield && !lowShieldActive) alerts.raise({ key: 'low-shield', sev: 'warn', text: 'SHIELDS LOW', ttl: Infinity });
    if (!lowShield && lowShieldActive) alerts.clear('low-shield');
    lowShieldActive = lowShield;
    const lowHull = hullFrac > 0 && hullFrac < 0.25;
    if (lowHull && !lowHullActive) alerts.raise({ key: 'low-hull', sev: 'danger', text: 'HULL CRITICAL', ttl: Infinity });
    if (!lowHull && lowHullActive) alerts.clear('low-hull');
    lowHullActive = lowHull;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]);
  }

  function setSvgAttr(el, name, value) {
    if (!el) return;
    const text = String(value);
    const cache = el.__sfAttrCache || (el.__sfAttrCache = {});
    if (cache[name] === text) return;
    el.setAttribute(name, text);
    cache[name] = text;
  }

  function getIffData(e, playerTeam) {
    let iff = 'neutral';
    if (e.team === playerTeam || e.team === 0) {
      iff = e.id === state.playerId ? 'ally' : 'friendly';
    } else if (isHostileToPlayer(e, playerTeam, state)) {
      iff = 'hostile';
    }
    const isGhost = e.data && (e.data.isGhost || e.data.ghost || e.data.kind === 'unknown');
    const data = SEMANTIC_PALETTE[iff] || SEMANTIC_PALETTE.neutral;
    let icon = data.icon;
    if (isGhost) {
      if (iff === 'hostile') icon = '△';
      else if (iff === 'friendly') icon = '◇';
      else if (iff === 'neutral') icon = '□';
      else if (iff === 'ally') icon = '▽';
    }
    return {
      iff,
      color: `var(${data.cssVar})`,
      icon,
      isGhost
    };
  }

  function getClassGlyph(e) {
    if (!e) return '·';
    if (e.type === 'station') return '◆';
    if (e.type === 'wreck') return '⛶';
    if (e.type === 'asteroid') return '●';
    
    const def = e.data && e.data.defId ? SHIP_BY_ID.get(e.data.defId) : null;
    const family = (def && def.visuals && def.visuals.family) || '';
    const role = (e.role || (def && def.role) || '').toLowerCase();
    
    if (family === 'scout' || role.includes('scout') || role.includes('starter')) return '⌃';
    if (family === 'fighter' || role.includes('fighter')) return '⚔';
    if (family === 'freighter' || role.includes('freighter') || role.includes('cargo')) return '⛃';
    if (family === 'miner' || role.includes('miner')) return '⛏';
    if (family === 'frigate' || role.includes('frigate')) return '▲';
    if (family === 'capital' || role.includes('capital')) return '⚹';
    if (role.includes('gunship')) return '⎔';
    
    const sClass = (e.shipClass || '').toLowerCase();
    if (sClass === 'fighter') return '⚔';
    if (sClass === 'gunship') return '⎔';
    if (sClass === 'frigate') return '▲';
    if (sClass === 'capital') return '⚹';
    
    return '⌃';
  }

  let overviewTick = 0;
  let lastOverviewSignature = '';
  // On-demand contacts strip (GDD 2.0 "Radar & Contacts"): at rest the strip stays quiet so it
  // never fights the physics action for attention ("one voice at a time"). It reveals for a beat
  // when a scan pulse lands or a fresh hostile/derelict enters range, and holds open while a hostile
  // is close. state.settings.ui.overviewOpen is the manual PIN (O key) that keeps it always-on.
  const OVERVIEW_HOSTILE_REVEAL_R = 2600;   // a hostile inside this radius keeps the strip open
  const OVERVIEW_SCAN_REVEAL_MS = 7000;     // how long a scan pulse holds the strip open
  const OVERVIEW_CONTACT_REVEAL_MS = 5000;  // how long a newly-arrived contact holds it open
  let _overviewRevealUntil = 0;
  let _knownContactIds = new Set();
  function revealOverview(ms) {
    const until = performance.now() + ms;
    if (until > _overviewRevealUntil) _overviewRevealUntil = until;
  }
  // A scan pulse is the player explicitly asking "what's out there" — surface the strip immediately.
  ctx.bus.on('scan:completed', () => { revealOverview(OVERVIEW_SCAN_REVEAL_MS); updateOverview(); });
  ctx.bus.on('scan:pulse', () => revealOverview(OVERVIEW_SCAN_REVEAL_MS));

  if (!state.settings) state.settings = {};
  if (!state.settings.ui) state.settings.ui = {};
  if (state.settings.ui.overviewOpen === undefined) {
    // Default to on-demand (unpinned): the strip speaks only when scanned or when a threat arrives.
    state.settings.ui.overviewOpen = false;
  }

  ctx.bus.on('ui:toggleOverview', () => {
    state.settings.ui.overviewOpen = !state.settings.ui.overviewOpen;
    if (state.settings.ui.overviewOpen) revealOverview(OVERVIEW_SCAN_REVEAL_MS);
    updateOverview();
    ctx.bus.emit('toast', {
      text: state.settings.ui.overviewOpen ? 'Contacts strip pinned' : 'Contacts strip on-demand',
      kind: 'info', ttl: 1.6,
    });
    ctx.bus.emit('audio:cue', { id: state.settings.ui.overviewOpen ? 'ui_open' : 'ui_back' });
  });

  // One-word state → CSS class for the row's state chip + tier pips.
  const OVERVIEW_STATE_CLASS = {
    HOSTILE: 'hostile', PATROL: 'patrol', DERELICT: 'derelict', TRADER: 'trader',
    MINER: 'miner', WINGMAN: 'ally', ALLY: 'ally', NEUTRAL: 'neutral',
  };
  function tierPips(tier) {
    let s = '';
    for (let i = 0; i < 3; i++) s += i < tier ? '▰' : '▱';
    return s;
  }
  function manifestSummary(e) {
    const man = e.data && e.data.manifest;
    if (!Array.isArray(man) || !man.length) return 'stripped';
    const top = man.slice(0, 2).map((it) => `${cargoDisplayName(it.id)} ×${it.qty}`).join(', ');
    return man.length > 2 ? `${top} +${man.length - 2}` : top;
  }

  function updateOverview() {
    const player = state.entities.get(state.playerId);
    if (!player) {
      if (elOverview.style.display !== 'none') elOverview.style.display = 'none';
      return;
    }
    const playerTeam = player.team;

    const contacts = [];
    for (const e of state.entityList || []) {
      if (!e.alive || e === player) continue;
      const isShip = e.type === 'ship' || e.type === 'drone';
      const isWreck = isWreckLike(e);
      if (!isShip && !isWreck) continue;

      const dx = e.pos.x - player.pos.x;
      const dz = e.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 5200) continue;

      contacts.push({ e, dist, dx, dz, isWreck });
    }

    // On-demand reveal bookkeeping: a fresh hostile/derelict arriving, or a hostile closing inside
    // the reveal radius, surfaces the strip for a beat even when it isn't pinned (one-voice rule).
    const nowMs = performance.now();
    const curIds = new Set();
    let nearbyHostile = false;
    for (const c of contacts) {
      curIds.add(c.e.id);
      const hostile = isHostileToPlayer(c.e, playerTeam, state);
      if (hostile && c.dist < OVERVIEW_HOSTILE_REVEAL_R) nearbyHostile = true;
      if (!_knownContactIds.has(c.e.id) && (hostile || c.isWreck)) revealOverview(OVERVIEW_CONTACT_REVEAL_MS);
    }
    _knownContactIds = curIds;

    const pinned = !!state.settings.ui.overviewOpen;
    const visible = pinned || nearbyHostile || nowMs < _overviewRevealUntil;
    if (!visible) {
      if (elOverview.style.display !== 'none') elOverview.style.display = 'none';
      lastOverviewSignature = '';   // force a fresh render when it next reveals
      return;
    }

    const targetId = state.player.targetId;
    contacts.sort((a, b) => {
      // The selected target always surfaces — it's how the player focuses a contact to scan/salvage
      // it, so a targeted derelict can't get buried under ambient traffic beyond the 8-row cap.
      const aTgt = a.e.id === targetId, bTgt = b.e.id === targetId;
      if (aTgt && !bTgt) return -1;
      if (!aTgt && bTgt) return 1;

      const aHostile = isHostileToPlayer(a.e, playerTeam, state);
      const bHostile = isHostileToPlayer(b.e, playerTeam, state);
      if (aHostile && !bHostile) return -1;
      if (!aHostile && bHostile) return 1;

      const aNeutral = a.e.team === 0;
      const bNeutral = b.e.team === 0;
      if (aNeutral && !bNeutral) return -1;
      if (!aNeutral && bNeutral) return 1;

      return a.dist - b.dist;
    });

    const signature = contacts.map(c => {
      const isGhost = c.e.data && (c.e.data.isGhost || c.e.data.ghost || c.e.data.kind === 'unknown');
      const rvx = c.e.vel.x - player.vel.x;
      const rvz = c.e.vel.z - player.vel.z;
      const closingSpeed = -((rvx * c.dx + rvz * c.dz) / (c.dist || 1));
      const scanned = c.isWreck ? (wreckScanned(c.e) ? 1 : 0) : '';
      const fsm = (c.e.data && c.e.data.ai && c.e.data.ai.fsm) || '';
      return `${c.e.id}:${c.e.team}:${isGhost}:${Math.round(c.dist)}:${Math.round(closingSpeed)}:${c.e.id === state.player.targetId}:${scanned}:${fsm}`;
    }).join('|');

    if (signature === lastOverviewSignature) {
      if (elOverview.style.display === 'none') elOverview.style.display = 'flex';
      return;
    }
    lastOverviewSignature = signature;

    elOverview.innerHTML = '';
    if (elOverview.style.display === 'none') elOverview.style.display = 'flex';

    const visibleCount = Math.min(8, contacts.length);
    for (let i = 0; i < visibleCount; i++) {
      const c = contacts[i];
      const e = c.e;
      const iff = getIffData(e, playerTeam);
      const glyph = getClassGlyph(e);
      const hostile = isHostileToPlayer(e, playerTeam, state);
      const sword = contactStateWord(e, playerTeam, state);
      const stateCls = OVERVIEW_STATE_CLASS[sword] || 'neutral';
      const tier = contactThreatTier(e, hostile);
      const scannedWreck = c.isWreck && wreckScanned(e);
      const name = e.data && e.data.name || e.role || (c.isWreck ? 'Derelict' : 'Ship');

      // Derelict manifest line: unscanned shows only a ghost outline; a scan resolves the manifest
      // + weak-point callout (GDD 2.0 §7.4).
      let detail = '';
      if (c.isWreck) {
        detail = scannedWreck ? `${manifestSummary(e)} · WEAK ${e.data.weakPoint || '—'}` : '??? UNSCANNED';
      }

      const rvx = e.vel.x - player.vel.x;
      const rvz = e.vel.z - player.vel.z;
      const closingSpeed = -((rvx * c.dx + rvz * c.dz) / (c.dist || 1));

      const speedIcon = closingSpeed >= 0.5 ? '▸' : (closingSpeed <= -0.5 ? '▹' : '');
      const speedText = Math.abs(closingSpeed) >= 0.5 ? `${speedIcon}${Math.round(Math.abs(closingSpeed))}` : '';

      const row = document.createElement('div');
      row.className = 'sf-overview-row';
      if (c.isWreck && !scannedWreck) row.classList.add('unscanned');
      if (e.id === state.player.targetId) {
        row.classList.add('selected');
      }
      row.style.setProperty('--iff-color', iff.color);

      row.innerHTML = `
        <div class="sf-overview-row__left">
          <span style="color:${iff.color}; font-weight:bold;">${iff.icon}</span>
          <span style="color:var(--ink-dim); font-size:10px;">${glyph}</span>
          <span class="sf-overview-row__name">${escapeHtml(name)}</span>
          <span class="sf-overview-row__state sf-cs--${stateCls}">${sword}</span>
        </div>
        <div class="sf-overview-row__right">
          <span class="sf-overview-row__tier sf-cs--${stateCls}" title="Threat tier (mass + faction)">${tierPips(tier)}</span>
          <span>${Math.round(c.dist)}</span>
          <span style="width: 24px; text-align: right;">${speedText}</span>
        </div>
        ${detail ? `<div class="sf-overview-row__detail">${escapeHtml(detail)}</div>` : ''}
      `;

      row.addEventListener('click', () => {
        state.player.targetId = e.id;
        ctx.bus.emit('toast', { text: `Selected target: ${name}`, kind: 'info', ttl: 2 });
        updateOverview();
      });
      elOverview.appendChild(row);
    }

    if (contacts.length > 8) {
      const footer = document.createElement('div');
      footer.className = 'sf-overview-footer';
      footer.textContent = `+${contacts.length - 8} CONTACTS`;
      elOverview.appendChild(footer);
    }
  }

  let _fadeOutTimer = null;

  function resolveReticle() {
    if (!elReticle) elReticle = document.getElementById('aim-reticle');
  }

  function updateTargetArcs() {
    const tid = state.player.targetId;
    const tgt = tid != null ? state.entities.get(tid) : null;
    
    if (!tgt || !tgt.alive) {
      targetArcs.classList.remove('visible');
      if (!targetArcs.classList.contains('visible')) {
        if (targetArcs.style.display !== 'none' && !_fadeOutTimer) {
          _fadeOutTimer = setTimeout(() => {
            if (!targetArcs.classList.contains('visible')) {
              targetArcs.style.display = 'none';
            }
            _fadeOutTimer = null;
          }, 260);
        }
      }
      return;
    }
    
    if (_fadeOutTimer) {
      clearTimeout(_fadeOutTimer);
      _fadeOutTimer = null;
    }
    
    const p = state.entities.get(state.playerId);
    if (!p || !helpers.worldToScreen) {
      targetArcs.style.display = 'none';
      targetArcs.classList.remove('visible');
      return;
    }
    
    const center = helpers.worldToScreen({ x: tgt.pos.x, y: 0, z: tgt.pos.z });
    if (!center.onScreen) {
      targetArcs.style.display = 'none';
      targetArcs.classList.remove('visible');
      return;
    }
    
    function getPixelRadius(pos, worldRadius) {
      const edge = helpers.worldToScreen({ x: pos.x + worldRadius, y: 0, z: pos.z });
      if (!edge.onScreen) return worldRadius * 3;
      return Math.max(1, Math.abs(edge.x - center.x));
    }
    
    const rShield = getPixelRadius(tgt.pos, tgt.radius + 12);
    const rArmor = getPixelRadius(tgt.pos, tgt.radius + 9);
    const rHull = getPixelRadius(tgt.pos, tgt.radius + 6);
    
    if (rShield <= 0) {
      targetArcs.style.display = 'none';
      targetArcs.classList.remove('visible');
      return;
    }
    
    if (targetArcs.style.display === 'none') {
      targetArcs.style.display = 'block';
    }
    targetArcs.classList.add('visible');
    
    const size = rShield * 2 + 10;
    setStyle(targetArcs, 'width', `${size}px`);
    setStyle(targetArcs, 'height', `${size}px`);
    setHudScreenTransform(targetArcs, center.x, center.y);

    if (!targetArcsSvg || !targetArcShield || !targetArcArmor || !targetArcHull) return;
    setSvgAttr(targetArcsSvg, 'width', size);
    setSvgAttr(targetArcsSvg, 'height', size);
    setSvgAttr(targetArcsSvg, 'viewBox', `0 0 ${size} ${size}`);
    
    const cx = size / 2;
    const cy = size / 2;
    
    setSvgAttr(targetArcShield, 'cx', cx); setSvgAttr(targetArcShield, 'cy', cy); setSvgAttr(targetArcShield, 'r', rShield);
    setSvgAttr(targetArcArmor, 'cx', cx);  setSvgAttr(targetArcArmor, 'cy', cy);  setSvgAttr(targetArcArmor, 'r', rArmor);
    setSvgAttr(targetArcHull, 'cx', cx);   setSvgAttr(targetArcHull, 'cy', cy);   setSvgAttr(targetArcHull, 'r', rHull);
    
    const shieldFrac = tgt.shieldMax ? Math.max(0, Math.min(1, tgt.shield / tgt.shieldMax)) : 0;
    const armorFrac = tgt.armorMax ? Math.max(0, Math.min(1, tgt.armorHp / tgt.armorMax)) : 0;
    const hullFrac = tgt.hullMax ? Math.max(0, Math.min(1, tgt.hull / tgt.hullMax)) : 0;
    
    function setArc(el, radius, fraction) {
      const c = 2 * Math.PI * radius;
      const maxArc = c * (300 / 360);
      const fill = fraction * maxArc;
      setSvgAttr(el, 'stroke-dasharray', `${fill} ${c}`);
      setSvgAttr(el, 'transform', `rotate(-150 ${cx} ${cy})`);
    }

    setArc(targetArcShield, rShield, shieldFrac);
    setArc(targetArcArmor, rArmor, armorFrac);
    setArc(targetArcHull, rHull, hullFrac);
  }

  function frame(dt) {
    const frameDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 1 / 60;
    const numericDt = consumeHudClock(numericClock, frameDt);
    const targetDt = consumeHudClock(targetClock, frameDt);
    const overlayDt = consumeHudClock(overlayClock, frameDt);
    const radarDt = consumeHudClock(radarClock, frameDt);
    const slow = numericDt > 0;
    const targetTick = targetDt > 0;
    const overlayTick = overlayDt > 0;
    const radarTick = radarDt > 0;

    const p = state.entities.get(state.playerId);
    resolveReticle();
    updateDoctrineTells(frameDt);

    // --- schematic + arcs + micro-bars (every frame, transform/stroke only) ---
    if (p) {
      const hullFrac = p.hullMax ? clamp01(p.hull / p.hullMax) : 0;
      const shieldFrac = p.shieldMax ? clamp01(p.shield / p.shieldMax) : 0;
      const capFrac = p.capMax ? clamp01(p.cap / p.capMax) : 0;
      const wpnHeat = weaponHeatSummary(p.data && p.data.weapons);
      const heatFrac = wpnHeat.frac;

      // Ship schematic (hull tint + centered numeric; shield ring via stroke-dashoffset).
      setStyle(schShield, 'strokeDashoffset', (SHIELD_RING_LEN * (1 - shieldFrac)).toFixed(1));
      setClass(schematic, 'sf-sch-critical', hullFrac < 0.25);

      setScaleX(fillEls.energy, capFrac);
      setScaleX(fillEls.heat, heatFrac);

      // Phase 3 boost micro-bar: energy fraction; the row is hidden entirely if the ship can't boost.
      // When a dash is ready (cooldown elapsed + enough energy) the bar gets a 'ready' glow.
      const boost = p.boost;
      const boostRow = rowEls.boost;
      if (boost && boost.max > 0 && boostRow) {
        setStyle(boostRow, 'display', '');
        const bf = clamp01(boost.energy / boost.max);
        setScaleX(fillEls.boost, bf);
        const dashCost = Number.isFinite(boost.dashCost) ? boost.dashCost : 28;
        const dashReady = boost.dashImpulse > 0 && boost.dashCdT <= 0 && boost.energy >= dashCost;
        setClass(fillEls.boost && fillEls.boost.parentElement, 'sf-bar--ready', dashReady);
        if (slow) setText(numEls.boost, Math.round(bf * 100) + (dashReady ? ' ▸' : '%'));
      } else if (boostRow) {
        setStyle(boostRow, 'display', 'none');   // no boost capacity (e.g. a stripped hull) — hide the row
      }

      const heatRow = rowEls.heat;
      if (heatRow) {
        setStyle(heatRow, 'display', wpnHeat.armed ? '' : 'none');
        setClass(heatRow.querySelector('.sf-bar'), 'sf-bar--overheated', wpnHeat.overheated);
      }
      setClass(fillEls.energy && fillEls.energy.parentElement, 'sf-bar--low', capFrac < 0.2 && capFrac > 0);

      // contextual low alerts via alerts module
      syncSafetyAlerts(p, hullFrac, shieldFrac);

      if (slow) {
        setText(schHull, Math.max(0, Math.round(p.hull)) + '');
        setText(numEls.energy, Math.max(0, Math.round(p.cap)) + '');
        setText(numEls.heat, wpnHeat.pct + '%');
        // Phase 4 fuel gauge: low fuel flashes a warning.
        const fuel = state.fuel || { current: 100, max: 100 };
        const fuelFrac = fuel.max > 0 ? clamp01(fuel.current / fuel.max) : 1;
        if (fillEls.fuel) setScaleX(fillEls.fuel, fuelFrac);
        if (numEls.fuel) setText(numEls.fuel, Math.round(fuelFrac * 100) + '%');
        if (rowEls.fuel) setClass(rowEls.fuel, 'sf-fuel--low', fuelFrac < 0.25);
      }

      // Action-bar highlights: light a slot while its ability is active.
      const inp = state.input || {};
      setClass(actionBoxes['pulse-laser'], 'sf-act-active', !!inp.fire && inp.fireGroup !== 2);
      setClass(actionBoxes['mass-sample'], 'sf-act-active', inp.fireGroup === 2);
      setClass(actionBoxes['boost'], 'sf-act-active', !!inp.boost);
      setClass(actionBoxes['dock'], 'sf-act-active', dockInRange);

      // Check if a drillable asteroid is targeted and close (surface distance <= 165 wu)
      let drillInRange = false;
      const tid = state.player.targetId;
      if (tid != null) {
        const t = state.entities.get(tid);
        if (t && t.type === 'asteroid' && t.alive) {
          const dx = t.pos.x - p.pos.x;
          const dz = t.pos.z - p.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist - t.radius <= 165) drillInRange = true;
        }
      }
      if (!drillInRange) {
        const mining = ctx.registry && ctx.registry.get('mining');
        if (mining && mining._lockTargetId) {
          const t = state.entities.get(mining._lockTargetId);
          if (t && t.type === 'asteroid' && t.alive) {
            const dx = t.pos.x - p.pos.x;
            const dz = t.pos.z - p.pos.z;
            const dist = Math.hypot(dx, dz);
            if (dist - t.radius <= 165) drillInRange = true;
          }
        }
      }
      setClass(actionBoxes['drill'], 'sf-act-active', drillInRange);

      // FR-1: prograde tick — where inertia is carrying us, projected each frame. Fades below
      // 2 wu/s so a stationary ship shows nothing (never animates at rest).
      {
        const vel = p.vel;
        const spd = vel ? Math.hypot(vel.x, vel.z) : 0;
        const wantA = spd > 2 ? 0.9 : 0;
        _proAlpha += (wantA - _proAlpha) * (1 - Math.exp(-6 * frameDt));
        if (_proAlpha <= 0.02 || !helpers.worldToScreen) {
          if (proTick.style.opacity !== '0') proTick.style.opacity = '0';
        } else {
          const k = (p.radius || 6) * 3;
          const inv = 1 / (spd || 1);
          const ux = vel.x * inv, uz = vel.z * inv;
          const A = helpers.worldToScreen({ x: p.pos.x, y: 0, z: p.pos.z });
          const B = helpers.worldToScreen({ x: p.pos.x + ux * k, y: 0, z: p.pos.z + uz * k });
          let dx = B.x - A.x, dy = B.y - A.y;
          const dl = Math.hypot(dx, dy);
          if (A.onScreen && dl > 0.001) {
            dx /= dl; dy /= dl;
            const ang = Math.atan2(dy, dx) * 180 / Math.PI;
            setHudScreenTransform(proTick, A.x + dx * 40, A.y + dy * 40, {
              offset: 'translate(-4px,-1px)',
              rotate: ang,
            });
            proTick.style.opacity = _proAlpha.toFixed(3);
          } else if (proTick.style.opacity !== '0') {
            proTick.style.opacity = '0';
          }
        }
      }
    }

    // --- speed (numerics @10Hz) — THR/STOP live in the SPD hover tip now (HUD 2.0) ---
    if (slow && p) {
      const sp = Math.hypot(p.vel.x, p.vel.z);
      setText(elSpeed, Math.round(sp) + '');
      // Tether readout: persistent while latched (GDD §4.3 discoverability). Control labels come
      // from the live binding map (rebinds honored); reel/cut only while attachment is active.
      const tether = state.player && state.player.tether;
      if (elTetherStat) {
        // Only show reel/cut while the gameplay mirror reports an active attachment.
        const active = !!(tether && tether.active);
        elTetherStat.style.display = active ? '' : 'none';
        if (active) {
          const strain = tether.strain || 0;
          const targetEnt = state.entities.get(tether.targetId);
          const targetName = (targetEnt && (targetEnt.name || (targetEnt.data && targetEnt.data.name))) || (targetEnt ? targetEnt.type : '');
          const status = strain > 0.85 ? 'CRITICAL' : strain > 0.6 ? 'STRAINED' : (tether.reeling ? 'REELING' : 'LOCKED');
          const controls = buildTetherControlPrompt(tether);
          const nameBit = targetName ? ' · ' + String(targetName).toUpperCase() : '';
          setText(elTether, `${status}${nameBit}${controls ? ' · ' + controls : ''}`);
          setClass(elTether, 'sf-warn', strain > 0.6);
        }
      }
      // Weapon status: count of guns + auto-target state. Shows the strategic loadout at a glance
      // and whether guns are tracking locked hostiles while the player steers.
      const ws = p.data && p.data.weapons;
      const nGuns = ws ? ws.length : 0;
      const auto = !!(state.input && state.input.autoFire);
      const primary = nGuns === 1 ? (ws[0].name || ws[0].defId || '1 gun') : (nGuns + ' guns');
      setText(elWeapons, primary + (auto ? ' · AUTO-TGT' : ''));
      setClass(elWeapons, 'sf-warn', auto);
      // Reticle reflects aim mode: amber ring when auto-target is engaged (guns track locked hostiles),
      // cyan when you're aiming/firing manually. Purely a visual cue.
      if (elReticle) setClass(elReticle, 'autofire', auto);
      // Reticle accuracy bloom: decay _recoilBloom toward 0 and scale the inner SVG. Sustained fire
      // expands the crosshair (1 -> 1.25); it contracts as you stop. Purely cosmetic readability.
      _recoilBloom = Math.max(0, _recoilBloom - frameDt * 2.2);
      if (elReticle) {
        const inner = elReticle.firstElementChild;
        if (inner) setStyle(inner, 'transform', `scale(${(1 + _recoilBloom * 0.25).toFixed(3)})`);
      }
      // Class/archetype label: surfaces the ship's role + drive family so the player feels the
      // archetype and propulsion switch when they buy a new hull. Updates cheaply each slow tick.
      const defId = p.data && p.data.defId;
      if (defId !== lastDefId) {
        const isFirst = lastDefId === undefined;
        lastDefId = defId;
        const def = SHIP_BY_ID.get(defId);
        if (def) {
          const drive = driveFamilyFor(def);
          setText(elRole, def.name + ' · ' + (ROLE_LABEL[def.role] || def.role || 'Ship') + (drive ? ' · ' + drive : ''));
          if (!isFirst) chipShow('role', 6000);   // new hull — worth a moment on screen
        } else {
          setText(elRole, '—');
        }
      }
    }

    // --- mission tracker @10Hz ---
    if (slow) {
      const trackedId = state.ui && state.ui.trackedMissionId;
      const active = (state.missions && state.missions.active) || [];
      const tracked = trackedId ? active.find((m) => m.id === trackedId && m.status === 'active') : null;
      const navWaypoint = state.nav && state.nav.waypoint;
      if (tracked) {
        setText(mtTitle, navWaypoint && navWaypoint.onboarding ? 'TUTORIAL OBJECTIVE' : 'CURRENT OBJECTIVE');
        setText(mtObj, mtObjectiveAction(navWaypoint && navWaypoint.reason || mtObjectiveText(tracked), navWaypoint));
        if (tracked.deadline_s != null && Number.isFinite(tracked.deadline_s)) {
          const remaining = Math.max(0, tracked.deadline_s - (state.simTime || 0));
          setText(mtTime, mtMarkerLine(state, navWaypoint, mtFmtTime(remaining)));
          mtTime.classList.toggle('sf-mt-urgent', remaining < 120);
          setDisplay(mtTime, true);
        } else {
          setText(mtTime, mtMarkerLine(state, navWaypoint));
          mtTime.classList.remove('sf-mt-urgent');
          setDisplay(mtTime, true);
        }
        setDisplay(missionTracker, true);
      } else if (navWaypoint) {
        const wp = navWaypoint;
        const routeGuide = mtRouteGuidance(state, wp);
        setText(mtTitle, wp.onboarding ? 'TUTORIAL OBJECTIVE' : 'CURRENT OBJECTIVE');
        setText(mtObj, mtObjectiveAction(wp.reason || wp.label || 'Follow the marked route', wp));
        setText(mtTime, mtMarkerLine(state, wp, routeGuide && routeGuide.summary || ''));
        mtTime.classList.remove('sf-mt-urgent');
        setDisplay(mtTime, true);
        setDisplay(missionTracker, true);
      } else if (active.some((m) => m && m.status === 'active')) {
        const candidate = active.find((m) => m && m.status === 'active');
        setText(mtTitle, 'NEXT ACTION');
        setText(mtObj, `${BINDINGS.missionLog.label} Mission Log · track ${candidate.title || candidate.name || 'one contract'}`);
        setText(mtTime, 'NO GOAL MARKER · TRACK ONE CONTRACT');
        mtTime.classList.remove('sf-mt-urgent');
        setDisplay(mtTime, true);
        setDisplay(missionTracker, true);
      } else if (state.story && STORY_BEATS[state.story.beatIndex]) {
        setText(mtTitle, 'NEXT ACTION');
        setText(mtObj, `${BINDINGS.missionLog.label} Mission Log · choose the next story action`);
        setText(mtTime, 'NO GOAL MARKER · SET ONE IN MISSION LOG');
        mtTime.classList.remove('sf-mt-urgent');
        setDisplay(mtTime, true);
        setDisplay(missionTracker, true);
      } else {
        setDisplay(missionTracker, false);
      }
    }

    // --- credits / cargo / objectives (event-driven, applied lazily) ---
    if (creditsDirty) refreshCredits();
    if (cargoDirty) refreshCargo();
    if (objDirty) refreshObjectives();
    // advance the credit count-up tween (no-op when at rest)
    if (slow) tickCreditsTween(numericDt || frameDt);

    // --- target panel: DOM/compositor surface; update on a fixed HUD cadence ---
    if (targetTick) {
      const tgtId = (state.player || {}).targetId;
      const target = tgtId != null ? state.entities.get(tgtId) : null;
      const player = state.entities.get(state.playerId);
      const combatRelevant = target && (target.type === 'ship' || target.type === 'drone')
        && isHostileToPlayer(target, player ? player.team : 0, state);
      const miningRelevant = target && target.type === 'asteroid';
      const routeOwnsAttention = !!(state.nav && state.nav.waypoint);
      let weakPoint = null;
      if (tgtId != null && revealedWeakPoints.size) {
        const wp = revealedWeakPoints.get(tgtId);
        if (wp && (!wp.until || (state.simTime || 0) < wp.until)) weakPoint = wp;
        else if (wp) revealedWeakPoints.delete(tgtId);
      }
      if (routeOwnsAttention && target && !combatRelevant && !miningRelevant) {
        if (targetPanel.el.style.display !== 'none') targetPanel.el.style.display = 'none';
      } else {
        targetPanel.update({ slow, weakPoint });
      }
    }

    // --- combat HUD: lock ring, weapon heat bars, target diamond (every frame for heat reactivity) ---
    updateCombatHud(p, slow);

    // --- world-space DOM overlays: batch transform/opacity writes ---
    if (overlayTick) floatingText.update(overlayDt || frameDt);

    // --- radar: canvas redraws are explicit, not tied to every render frame ---
    if (radarTick) radar.draw();

    // directional damage indicators advance + reposition on the overlay cadence.
    if (overlayTick) dmgInd.tick(overlayDt || frameDt, helpers);

    // --- off-screen objective arrow ---
    if (overlayTick || slow) updateObjectiveArrow(p, slow);

    // --- toasts/alerts expiry sweep ---
    if (alerts && alerts.tick) alerts.tick();
    // --- HUD meta-arc (STABLE LOAD line, tag flicker, manifest ghost) ---
    if (overlayTick && hudMeta && hudMeta.tick) hudMeta.tick(overlayDt || frameDt);

    // --- Target Arcs: update every frame for smooth 3D tracking ---
    updateTargetArcs();

    // --- Overview Strip: update at 5Hz cadence ---
    overviewTick++;
    if (overviewTick % 12 === 0) {
      updateOverview();
    }
  }

  function tickHidden(dt) {
    const p = state.entities.get(state.playerId);
    syncSafetyAlerts(p);
    if (alerts && alerts.tick) alerts.tick();
  }

  function resolveNavStation(nw) {
    if (!nw || !nw.stationId) return null;
    const index = state.entityIndex;
    const indexVersion = index && index.__spacefaceEntityIndexV1 ? (index.version || 0) : -1;
    const listLength = indexVersion >= 0 ? -1 : state.entityList.length;
    if (
      cachedNavStationId === nw.stationId &&
      cachedNavIndexVersion === indexVersion &&
      cachedNavListLength === listLength &&
      cachedNavEntity &&
      cachedNavEntity.alive !== false &&
      cachedNavEntity.type === 'station'
    ) {
      return cachedNavEntity;
    }
    cachedNavStationId = nw.stationId;
    cachedNavIndexVersion = indexVersion;
    cachedNavListLength = listLength;
    cachedNavEntity = resolveHudNavStation(state, nw.stationId);
    return cachedNavEntity;
  }

  function updateObjectiveArrow(p, slow) {
    // Priority: durable nav waypoint (mission/trade/story), else legacy mission-local waypoint.
    const tracked = state.ui.trackedMissionId;
    const objectiveOwnsAttention = !!tracked || !!(state.nav && state.nav.waypoint);
    const active = (state.missions && state.missions.active) || [];
    const m = tracked ? active.find((x) => x.id === tracked) : active[0];
    let wp = null, wpLabel = null, navMeta = null;
    if (state.nav && state.nav.waypoint) {
      const nw = state.nav.waypoint;
      let livePos = null;
      if (nw.stationId) {
        const station = resolveNavStation(nw);
        if (station) livePos = station.pos;
      }
      const pos = livePos || nw.pos;
      wpLabel = nw.label || nw.reason || nw.sectorName || 'Waypoint';
      navMeta = nw;
      if (pos) wp = pos;
    }
    if (!wp && m) {
      wp = m.waypoint || m.targetPos || (m.objectives && m.objectives[0] && m.objectives[0].pos) || null;
      wpLabel = wpLabel || m.title || m.name || 'Mission';
    }
    if (!wp && navMeta) {
      setDisplay(arrow, false);
      setDisplay(elNavReadout, false);
      // Cross-sector guidance already lives in the dominant ACTIVE OBJECTIVE tracker.
      setClass(elNavReadout, 'sf-nav--lock', false);
      return;
    }
    if (!wp || !p || !helpers.worldToScreen) {
      setDisplay(arrow, false);
      setDisplay(elNavReadout, false);
      lastNavLabel = '';
      return;
    }
    const proj = helpers.worldToScreen({ x: wp.x, y: 0, z: wp.z });
    // distance + ETA readout (always shown while a nav target is set)
    const dist = Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const etaS = speed > 5 ? dist / speed : Infinity;
    // A mission/navigation fix is not a combat target lock. Keep this legacy readout hidden while
    // the active-objective tracker owns the same label/distance; the off-screen arrow still guides.
    setDisplay(elNavReadout, !objectiveOwnsAttention);
    setClass(elNavReadout, 'sf-nav--lock', false);
    const label = wpLabel || '—';
    arrow.title = label;
    if (label !== lastNavLabel) { setText(elNavLabel, label); lastNavLabel = label; }
    if (slow || !lastNavDist) {
      const distText = Math.round(dist) + ' u';
      const etaText = isFinite(etaS) ? (etaS < 60 ? Math.round(etaS) + 's' : Math.round(etaS / 60) + 'm') : '—';
      if (distText !== lastNavDist) { setText(elNavDist, distText); lastNavDist = distText; }
      if (etaText !== lastNavEta) { setText(elNavEta, etaText); lastNavEta = etaText; }
    }
    if (proj.onScreen) { setDisplay(arrow, false); return; }
    // clamp to a screen-edge ellipse around center, pointing toward target
    const w = window.innerWidth, h = window.innerHeight;
    let dx = proj.x - w / 2, dy = proj.y - h / 2;
    // worldToScreen returns mirrored coords for behind-camera points; normalize direction
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const margin = 34;
    const mx = Math.max(24, w / 2 - margin);
    const my = Math.max(24, h / 2 - margin);
    const tx = Math.abs(dx) > 0.001 ? mx / Math.abs(dx) : Infinity;
    const ty = Math.abs(dy) > 0.001 ? my / Math.abs(dy) : Infinity;
    const edgeT = Math.min(tx, ty);
    const ex = w / 2 + dx * edgeT, ey = h / 2 + dy * edgeT;
    setDisplay(arrow, true);
    arrow.style.transform = `translate3d(${ex}px,${ey}px,0) translate(-50%,-50%) rotate(${Math.atan2(dy, dx)}rad)`;
  }

  function setVisible(v) {
    root.style.display = v ? 'block' : 'none';
    if (hudMeta && hudMeta.setVisible) hudMeta.setVisible(v);
  }

  function forceRefresh() {
    creditsDirty = true;
    cargoDirty = true;
    objDirty = true;
    forceHudClock(numericClock);
    forceHudClock(targetClock);
    forceHudClock(overlayClock);
    forceHudClock(radarClock);
    lastDefId = null;
    lastNavDist = '';
    lastNavEta = '';
    if (radar.invalidate) radar.invalidate();
    if (targetPanel.forceRefresh) targetPanel.forceRefresh();
  }

  return { frame, tickHidden, forceRefresh, setVisible, refreshCredits, refreshCargo, refreshObjectives };
}
