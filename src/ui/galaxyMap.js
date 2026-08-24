// src/ui/galaxyMap.js — ONE zoomable navigation map (GDD pillar 2).
//
// This screen unifies the two legacy maps (localmap.js = live near-field system, starmap.js =
// inter-sector graph) into a single surface with smooth zoom across three continuous levels:
//
//   LOCAL   — live entities/contacts in the current sector (ships, stations, asteroids from state).
//   SYSTEM  — the current sector: stations, gates, POIs, and the named sectorZones as tinted regions.
//   GALAXY  — the SECTORS graph: faction-colored nodes, trade/neighbor edges, fog for uncharted
//             frontier.
//
// Everything the map DRAWS at each level, plus the click->course payload resolution, is built by
// pure exported functions that take a plain `state` object and NEVER touch document/window — so they
// are unit-testable headless. The screen object (galaxyMapScreen) is the thin DOM/canvas shell; all
// canvas/DOM access is guarded behind `typeof document`/`typeof window` so importing this module in
// Node never throws.
//
// Read-only over sim state. The only outward mutations are the EXISTING public bus intents:
//   - "ui:setCourse" / "world:requestRoute" for course/waypoint arming
//   - "world:requestJump" for one-hop intentional gate jumps (same payload as legacy starmap)
// Flight/nav/jump ownership stays in world.js; the map never mutates jump/sector state directly.

import { SECTORS } from '../data/sectors.js';
import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { BODY_SPECIALIZATION_BY_ID } from '../data/claimableBodies.js';
import { publicOperatorLabel } from '../story/endings/publicIdentity.js';
import {
  globalToSectorLocalForSector,
  sectorLocalToGlobalForSector,
  sectorGlobalOrigin,
  SECTOR_ORIGIN_LATTICE_WU,
} from '../data/sectorCoordinates.js';
import { zonesForSector, zoneTypeMeta, zoneThreat, zoneAt } from '../data/sectorZones.js';
import { MAP_FOCUS, takeMapOpenIntent, normalizeMapFocus } from './mapAuthority.js';
import { enhanceSelects, dataStateHtml } from './uiPrimitives.js';
import { entityAttr } from './entityResolver.js';
import {
  careersTabAvailability, careersTabHtml, careersOverviewLineHtml,
} from './map/careersReadout.js';
import { resolveWaypointPresentationPosition } from './navigationWaypoint.js';
import { sectorLawProfile } from './securityReadout.js';
import { causeFor } from './causeLedger.js';
import { uniqueWreckMapReadouts } from './uniqueWreckMapLayer.js';
import { frontierRumorMapReadouts, frontierRumorMapTarget } from './frontierRumorMapLayer.js';
import { vestaOreCacheMapReadouts, vestaOreCacheMapTarget } from './vestaOreCacheMapLayer.js';
import { pallasHiddenCacheMapReadouts, pallasHiddenCacheMapTarget } from './pallasHiddenCacheMapLayer.js';
import { worldSiteMapMarkers } from './worldSiteMapLayer.js';
import { orrinWitnessMapTarget } from '../data/orrinWitnessCase.js';
import { sectorExplorationProgress } from '../world/explorationJournal.js';
import { mapFactionPresenceNodes } from '../data/factionPresence.js';
import { sectorSignalFor, forecastTransitFor } from '../systems/sectorSim.js';
import { isHostileToPlayer } from '../systems/scanner.js';
import { conflictPairsForSector } from '../data/conflictZones.js';
import { isPlayerWanted, heatLevelFor, heatClearSecondsForLevel } from '../systems/heat.js';
import { regionalEcologyReadout } from '../systems/regionalEcology.js';
import { REGIONAL_ECONOMY_PROFILES } from '../data/regionalEconomyProfiles.js';
import { claimDefenseRating } from '../systems/claims.js';
import { bestKnownSellAtStations, knownStationQuotes, AGE_HOLLOW_S } from './marketIntelligence.js';
import { LocalSpaceIntel, projectTrack } from './navigation/localSpaceMapModel.js';
import { buildTradeLanesModel as buildCargoDeckTradeLanesModel } from './navigation/cargoDeck.js';

export { buildCargoDeckTradeLanesModel as buildTradeLanesModel };
// Wave 2 — the chart's camera and its always-present navigation readout, both pure modules.
// galaxyMap.js consumes them; it never reimplements their maths (ADR D3/D4).
import {
  createMapCamera,
  levelForSpan,
  zoomForSpan,
  spanForZoom,
  setSpan,
  setFocus,
  panBy,
  zoomAt,
  cameraLevel,
  pixelsPerWU,
  screenToGlobal,
  framePreset,
  MAP_PRESET_SPAN_WU,
  MAP_SPAN_MIN_WU,
  MAP_SPAN_MAX_WU,
} from './map/mapCamera.js';
import {
  resolveMapNavContext,
  resolveMapFramingActions,
  formatDistanceWU,
  NAV_ROW_TONE,
} from './map/mapNavContext.js';
// Slice C — the route ribbon's model. Pure: it joins the plotted route (world.computeRoute) to
// live execution (nav.executor) so the ribbon, the Travel tab and the engage control cannot
// disagree about which leg is live. It publishes `visible:false` when there is no route, which is
// what keeps the ribbon a CONTEXTUAL instrument rather than a new permanent panel (ADR D9.9).
import {
  resolveRouteRibbon,
  RIBBON_LEG_STATE,
  RIBBON_ACTION_IDS,
} from './map/mapRouteRibbon.js';

// ---------------------------------------------------------------------------------------------
// Static catalogs (pure — safe at import time).
// ---------------------------------------------------------------------------------------------

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
/** Authored display names, for readouts that must name a sector they are not currently drawing. */
const SECTOR_NAME_BY_ID = new Map(SECTORS.map((s) => [s.id, s.name || s.id]));
const FACTION_COLOR = new Map();
const FACTION_NAME = new Map();
for (const f of FACTION_META) {
  FACTION_COLOR.set(f.id, f.color || '#9aa8bc');
  FACTION_NAME.set(f.id, f.short || f.name || f.id);
}

export function factionColorOf(id) { return FACTION_COLOR.get(id) || '#9aa8bc'; }
export function factionNameOf(id) {
  return FACTION_NAME.get(id) || (id ? String(id).replace(/^faction_/, '') : 'Unaffiliated');
}

// ---------------------------------------------------------------------------------------------
// SURVEY TABLE design tokens — the map's canvas grammar. One warm worklight palette shared with
// the menu fascia / station workbench; faction hues are the only saturated accents on the table.
// Action = amber, infrastructure = teal/brass, danger = red, archive/discovery = gold.
// ---------------------------------------------------------------------------------------------
const INK = Object.freeze({
  bg: '#0c0e10',
  gridMinor: 'rgba(216, 190, 150, 0.040)',
  gridMajor: 'rgba(216, 190, 150, 0.075)',
  ink0: '#ede8d8',
  ink1: '#b3afa2',
  ink2: '#8a877d',
  amber: '#e8a33d',
  amberHot: '#ffc064',
  brass: '#d8b26a',
  teal: '#56bbb2',
  red: '#ed6961',
  warn: '#e3a13d',
  good: '#58c98a',
  gold: '#e6bf6a',
  plate: 'rgba(12, 14, 15, 0.92)',
  plateHard: 'rgba(12, 14, 15, 0.97)',
  plateEdge: 'rgba(190, 178, 152, 0.30)',
});

// Canvas type trio — mirrors the DOM fascia (self-hosted in styles/fonts.css, loaded at boot).
// Canvas text is text, and INSTRUMENT_GRAMMAR §3 is binding: "12 px is the floor. Nothing renders
// below it, ever." The chart was asking these helpers for 8, 8.5, 9, 10 and 11 px across 29 call
// sites — genuinely unreadable sub-labels on the survey table. Clamping HERE rather than at the call
// sites covers all 29 at once, including the ones that compute a size from a ternary, and it cannot
// be bypassed by a new call site later. The context is only ever scaled by devicePixelRatio
// (setTransform(dpr,0,0,dpr,0,0)), so these numbers are CSS pixels on screen and the clamp is exact.
const TYPE_FLOOR_PX = 12;
const floorPx = (px) => Math.max(TYPE_FLOOR_PX, Number.isFinite(px) ? px : TYPE_FLOOR_PX);
const FONT_MONO = (weight, px) => `${weight} ${floorPx(px)}px "IBM Plex Mono", ui-monospace, monospace`;
const FONT_UI = (weight, px) => `${weight} ${floorPx(px)}px "IBM Plex Sans", "Segoe UI", system-ui, sans-serif`;
const FONT_DISPLAY = (weight, px) => `${weight} ${floorPx(px)}px "Saira SemiCondensed", "IBM Plex Sans", system-ui, sans-serif`;

/** Stable 0..1 hash for cosmetic phase offsets (deterministic, never fed into sim). */
function cosmeticHash01(text) {
  const s = String(text || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

// Continuous zoom is a single scalar; these thresholds pick which "level" the model builder emits.
// Zoom grows as you zoom IN (LOCAL is the most zoomed-in). Kept exported so the screen + tests agree.
export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 22;
export const LEVEL_SYSTEM_AT = 1.6;   // zoom >= this  -> SYSTEM (or LOCAL)
export const LEVEL_LOCAL_AT = 2.8;    // zoom >= this  -> LOCAL

// Remembered-contact memory (LOCAL level). Below the floor a track is noise rather than memory and
// the scope drops it; the bands drive how far a remembered mark fades toward the ground. Mirrors the
// freshness bands `memoryTint` uses for market memory so one grammar covers both kinds of "stale".
export const LOCAL_MEMORY_MIN_CONFIDENCE = 0.06;
const LOCAL_MEMORY_BANDS = [
  { at: 0.62, alpha: 0.72, key: 'fresh' },
  { at: 0.28, alpha: 0.46, key: 'mid' },
  { at: 0, alpha: 0.26, key: 'old' },
];

/** Fade band for a remembered contact's confidence (1 = just seen, 0 = forgotten). */
export function localMemoryBand(confidence) {
  const c = Math.max(0, Math.min(1, Number(confidence) || 0));
  for (const band of LOCAL_MEMORY_BANDS) if (c >= band.at) return band;
  return LOCAL_MEMORY_BANDS[LOCAL_MEMORY_BANDS.length - 1];
}

/** Map a continuous zoom scalar to a discrete level label. */
export function levelForZoom(zoom) {
  const z = Number(zoom) || 1;
  if (z >= LEVEL_LOCAL_AT) return 'local';
  if (z >= LEVEL_SYSTEM_AT) return 'system';
  return 'galaxy';
}

/** Initial zoom scalar for a map-authority focus preset (LOCAL / SYSTEM / GALAXY). */
export function zoomForMapFocus(focus) {
  const f = normalizeMapFocus(focus);
  if (f === MAP_FOCUS.LOCAL) return 3.2;
  if (f === MAP_FOCUS.GALAXY) return 1.0;
  return 2.0;
}

/**
 * Deterministic screen composition shared by runtime CSS variables and layout checks.
 * The map never lets tools float over the canvas: wide = three columns, compact =
 * horizontal layer rail + canvas/inspector, narrow = a single vertical stack.
 */
export function resolveGalaxyMapLayout(width, height) {
  const w = Math.max(320, Number(width) || 0);
  const h = Math.max(480, Number(height) || 0);
  if (w >= 1180) {
    const headerH = 58;
    const layersW = 236;
    const inspectorW = 320;
    return {
      mode: 'wide',
      header: { x: 0, y: 0, width: w, height: headerH },
      layers: { x: 0, y: headerH, width: layersW, height: h - headerH },
      viewport: { x: layersW, y: headerH, width: w - layersW - inspectorW, height: h - headerH },
      inspector: { x: w - inspectorW, y: headerH, width: inspectorW, height: h - headerH },
    };
  }
  if (w >= 760) {
    const headerH = 72;
    const layersH = 58;
    const inspectorW = Math.min(280, Math.max(232, Math.round(w * 0.27)));
    return {
      mode: 'compact',
      header: { x: 0, y: 0, width: w, height: headerH },
      layers: { x: 0, y: headerH, width: w, height: layersH },
      viewport: { x: 0, y: headerH + layersH, width: w - inspectorW, height: h - headerH - layersH },
      inspector: { x: w - inspectorW, y: headerH + layersH, width: inspectorW, height: h - headerH - layersH },
    };
  }
  const headerH = 104;
  const layersH = 54;
  const inspectorH = Math.min(190, Math.max(150, Math.round(h * 0.25)));
  return {
    mode: 'narrow',
    header: { x: 0, y: 0, width: w, height: headerH },
    layers: { x: 0, y: headerH, width: w, height: layersH },
    viewport: { x: 0, y: headerH + layersH, width: w, height: h - headerH - layersH - inspectorH },
    inspector: { x: 0, y: h - inspectorH, width: w, height: inspectorH },
  };
}

/** Clamp a left-aligned canvas label inside the live viewport. */
export function clampMapLabelX(textWidth, desiredX, viewportWidth, padding = 8) {
  const pad = Math.max(0, Number(padding) || 0);
  const width = Math.max(0, Number(viewportWidth) || 0);
  const labelWidth = Math.max(0, Number(textWidth) || 0);
  const maxX = Math.max(pad, width - pad - labelWidth);
  return Math.max(pad, Math.min(Number(desiredX) || 0, maxX));
}

const MAP_LABEL_OFFSETS = Object.freeze([
  Object.freeze({ side: 'right', dx: 1, dy: 0 }),
  Object.freeze({ side: 'left', dx: -1, dy: 0 }),
  Object.freeze({ side: 'above', dx: 0, dy: -1 }),
  Object.freeze({ side: 'below', dx: 0, dy: 1 }),
  Object.freeze({ side: 'upper-right', dx: 1, dy: -1 }),
  Object.freeze({ side: 'lower-right', dx: 1, dy: 1 }),
  Object.freeze({ side: 'upper-left', dx: -1, dy: -1 }),
  Object.freeze({ side: 'lower-left', dx: -1, dy: 1 }),
  Object.freeze({ side: 'far-right', dx: 2, dy: 0 }),
  Object.freeze({ side: 'far-left', dx: -2, dy: 0 }),
  Object.freeze({ side: 'far-above', dx: 0, dy: -2 }),
  Object.freeze({ side: 'far-below', dx: 0, dy: 2 }),
]);

/** Stable label priority: objective > selection > navigation infrastructure > context > contacts. */
export function mapLabelPriority(candidate) {
  if (!candidate) return -1;
  if (candidate.objective === true || candidate.kind === 'objective') return 1000;
  if (candidate.selected === true) return 900;
  if (candidate.kind === 'gate') return 760;
  if (candidate.kind === 'station') return 720;
  if (candidate.kind === 'hazard') return 600;
  if (candidate.kind === 'bearing') return 560;
  if (candidate.kind === 'zone') return 480;
  if (candidate.kind === 'poi') return 420;
  if (candidate.hostile === true) return 340;
  if (candidate.named === true) return 280;
  if (candidate.kind === 'ship') return 220;
  if (candidate.kind === 'asteroid') return 80;
  return 160;
}

function mapLabelEligible(candidate) {
  if (!candidate || candidate.showLabel === false || !String(candidate.text || '').trim()) return false;
  if (candidate.objective || candidate.selected) return true;
  if (candidate.kind === 'gate' || candidate.kind === 'station' || candidate.kind === 'hazard'
    || candidate.kind === 'bearing' || candidate.kind === 'zone' || candidate.kind === 'poi') return true;
  if (candidate.kind === 'asteroid') return false;
  if (candidate.kind === 'ship') return candidate.hostile === true || candidate.named === true;
  return candidate.named === true;
}

function rectsOverlap(a, b, gap = 0) {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

function quantizedLabelAnchor(value) {
  return Math.round((Number(value) || 0) / 2) * 2;
}

function candidateLabelRects(candidate, width, height, gap) {
  const x = quantizedLabelAnchor(candidate.x);
  const y = quantizedLabelAnchor(candidate.y);
  const radius = Math.max(0, Number(candidate.anchorRadius) || 0);
  const edge = radius + gap;
  return MAP_LABEL_OFFSETS.map((offset) => {
    let left = x - width / 2;
    let top = y - height / 2;
    if (offset.dx > 0) left = x + edge + (offset.dx - 1) * (width + gap);
    else if (offset.dx < 0) left = x - edge - width - (Math.abs(offset.dx) - 1) * (width + gap);
    if (offset.dy > 0) top = y + edge + (offset.dy - 1) * (height + gap);
    else if (offset.dy < 0) top = y - edge - height - (Math.abs(offset.dy) - 1) * (height + gap);
    return { x: left, y: top, width, height, side: offset.side };
  });
}

/**
 * Deterministic collision layout for canvas labels. Input order never changes the result: semantic
 * priority, stable id, then text own the order. Anchors are quantized to two CSS pixels so tiny
 * camera/entity drift cannot make a label oscillate between sides frame-to-frame.
 */
export function layoutMapLabels(candidates, viewport, options = {}) {
  const viewportWidth = Math.max(1, Number(viewport && viewport.width) || 1);
  const viewportHeight = Math.max(1, Number(viewport && viewport.height) || 1);
  const padding = Math.max(0, Number(options.padding) || 8);
  const collisionGap = Math.max(0, Number(options.collisionGap) || 3);
  const areaBudget = Math.max(4, Math.min(18, Math.floor((viewportWidth * viewportHeight) / 32000)));
  const maxLabels = Math.max(1, Number(options.maxLabels) || areaBudget);
  const reserved = (options.reserved || []).map((rect) => ({
    x: Number(rect.x) || 0,
    y: Number(rect.y) || 0,
    width: Math.max(0, Number(rect.width) || 0),
    height: Math.max(0, Number(rect.height) || 0),
  }));
  const normalized = (candidates || []).map((candidate, sourceIndex) => ({
    ...candidate,
    sourceIndex,
    id: String(candidate && candidate.id != null ? candidate.id : `label-${sourceIndex}`),
    text: String(candidate && candidate.text || '').replace(/\s+/g, ' ').trim(),
    priority: Number.isFinite(candidate && candidate.priority)
      ? candidate.priority
      : mapLabelPriority(candidate),
  })).sort((a, b) => b.priority - a.priority
    || a.id.localeCompare(b.id)
    || a.text.localeCompare(b.text)
    || a.sourceIndex - b.sourceIndex);
  const markerBoxes = normalized.map((candidate) => {
    const radius = Math.max(2, Number(candidate.anchorRadius) || 2);
    const x = quantizedLabelAnchor(candidate.x);
    const y = quantizedLabelAnchor(candidate.y);
    return {
      id: candidate.id,
      priority: candidate.priority,
      x: x - radius,
      y: y - radius,
      width: radius * 2,
      height: radius * 2,
    };
  });
  const occupied = reserved.slice();
  const placements = [];
  let visibleCount = 0;

  for (const candidate of normalized) {
    const { sourceIndex: _sourceIndex, ...publicCandidate } = candidate;
    publicCandidate.x = quantizedLabelAnchor(candidate.x);
    publicCandidate.y = quantizedLabelAnchor(candidate.y);
    if (!mapLabelEligible(candidate) || (!candidate.objective && visibleCount >= maxLabels)) {
      placements.push({ ...publicCandidate, visible: false, reason: 'suppressed' });
      continue;
    }
    const width = Math.min(
      Math.max(12, viewportWidth - padding * 2),
      Math.max(12, Math.ceil(Number(candidate.width) || 0)),
    );
    const height = Math.min(
      Math.max(10, viewportHeight - padding * 2),
      Math.max(10, Math.ceil(Number(candidate.height) || 12)),
    );
    const blockers = markerBoxes.filter((box) => box.id !== candidate.id && box.priority >= candidate.priority);
    let placed = null;
    for (const proposed of candidateLabelRects(candidate, width, height, collisionGap)) {
      const rect = {
        ...proposed,
        x: Math.max(padding, Math.min(proposed.x, viewportWidth - padding - width)),
        y: Math.max(padding, Math.min(proposed.y, viewportHeight - padding - height)),
      };
      if (occupied.some((box) => rectsOverlap(rect, box, collisionGap))) continue;
      if (blockers.some((box) => rectsOverlap(rect, box, 1))) continue;
      placed = rect;
      break;
    }
    if (!placed && candidate.objective === true) {
      const fallback = candidateLabelRects(candidate, width, height, collisionGap)[0];
      placed = {
        ...fallback,
        x: Math.max(padding, Math.min(fallback.x, viewportWidth - padding - width)),
        y: Math.max(padding, Math.min(fallback.y, viewportHeight - padding - height)),
      };
    }
    if (!placed) {
      placements.push({ ...publicCandidate, visible: false, reason: 'collision' });
      continue;
    }
    const placement = { ...publicCandidate, ...placed, visible: true };
    placements.push(placement);
    occupied.push(placed);
    visibleCount += 1;
  }
  return placements;
}

/**
 * Gamepad entry focuses the scale chip for the open intent (d-pad starts on a real control).
 * Keyboard/pointer return null — onShow parks focus on the dialog root instead so screenManager
 * cannot fall through to the search <input> (which would swallow M/N as typing).
 */
export function mapFocusButtonSelector(intent) {
  if (!intent || intent.source !== 'gamepad') return null;
  const focus = normalizeMapFocus(intent.focus);
  return `.gm-scale-btn[data-focus="${focus}"]`;
}

/**
 * Preserve keyboard focus after selecting a map result whose source row may be replaced by refresh.
 * Course-bearing targets hand off to their visible primary action; read-only/manual targets return
 * to the persistent screen-manager dialog root (role=dialog, tabindex=-1) without inventing a verb.
 */
export function focusMapSelectionHandoff({ action, primaryControl, mapRoot } = {}) {
  const canFocusPrimary = !!(action && action.coursePayload && primaryControl
    && primaryControl.hidden !== true && primaryControl.disabled !== true
    && typeof primaryControl.focus === 'function');
  const focusTarget = canFocusPrimary ? primaryControl : mapRoot;
  if (!focusTarget || typeof focusTarget.focus !== 'function') return false;
  try { focusTarget.focus({ preventScroll: true }); } catch (_) { focusTarget.focus(); }
  return true;
}

/** Stable semantic priority for overlapping click targets. Active objectives always win. */
export function mapTargetPriority(target) {
  if (!target) return -1;
  if (target.objective === true || target.kind === 'waypoint' || target.markerKind === 'mission-objective') return 100;
  if (target.missionId) return 90;
  if (target.kind === 'bearing' || target.kind === 'rumor') return 60;
  return 10;
}

/** Keep the exact active navigation goal in the physically reachable part of filtered search. */
export function mapSearchTargetPriority(state, target) {
  if (!target) return -1;
  const waypoint = state && state.nav && state.nav.waypoint;
  const targetEntityId = target.entityId ?? target.targetEntityId ?? target.id;
  if (waypoint && waypoint.targetEntityId != null
    && String(targetEntityId) === String(waypoint.targetEntityId)) return 1_000;
  const trackedMissionId = state && state.ui && state.ui.trackedMissionId;
  const trackedMission = trackedMissionId && state.missions && Array.isArray(state.missions.active)
    ? state.missions.active.find((mission) => mission && mission.status === 'active' && mission.id === trackedMissionId)
    : null;
  if (trackedMission && Array.isArray(trackedMission.targetEntityIds)
    && trackedMission.targetEntityIds.some((id) => String(id) === String(targetEntityId))) return 950;
  const trackedPos = trackedMission && trackedMission.params && trackedMission.params.samplePos;
  if (trackedPos && Number.isFinite(target.x) && Number.isFinite(target.z)
    && Math.hypot(target.x - trackedPos.x, target.z - trackedPos.z) <= 0.5) return 925;
  const goal = activeMapGoal(state);
  if (goal && goal.pos && Number.isFinite(target.x) && Number.isFinite(target.z)
    && Math.hypot(target.x - goal.pos.x, target.z - goal.pos.z) <= 0.5) return 900;
  return mapTargetPriority(target);
}

function compareMapSearchTargetDistance(a, b, anchor) {
  if (!anchor) return 0;
  const aDistance = a && Number.isFinite(a.x) && Number.isFinite(a.z)
    ? Math.hypot(a.x - anchor.x, a.z - anchor.z) : null;
  const bDistance = b && Number.isFinite(b.x) && Number.isFinite(b.z)
    ? Math.hypot(b.x - anchor.x, b.z - anchor.z) : null;
  return Number.isFinite(aDistance) && Number.isFinite(bDistance) ? aDistance - bDistance : 0;
}

/**
 * Resolve the one player-owned navigation goal independently of ambient mission destinations.
 * The result is presentation-only and deterministic; map drawing never mutates nav/mission state.
 */
/**
 * Adapt `nav.executor` into the shape the nav readout consumes.
 *
 * This deliberately does NOT import `summarizeExecutor` from systems/routeFollower.js, even though
 * that function produces a superset of this shape. routeFollower pulls in `atlasIndex`,
 * `flightTelemetry` and `propulsionCatalog`; boot-to-flight cost is currently the program's top
 * blocker (see 03_LEDGER), and widening the MAP screen's import graph to reach four scalar fields
 * would push in the wrong direction for no behavioural gain.
 *
 * It reads the executor's OWN persisted fields, so it cannot drift from the follower the way a
 * reimplementation of its logic would — there is no logic here, only field access.
 */
export function readRouteExecutorForMap(executor) {
  if (!executor || typeof executor !== 'object') return null;
  const legs = Array.isArray(executor.legs) ? executor.legs : [];
  const legIndex = Number.isFinite(executor.legIndex) ? executor.legIndex : 0;
  const leg = legs[legIndex] || null;
  const legTarget = leg && leg.target && Number.isFinite(leg.target.x) && Number.isFinite(leg.target.z)
    ? { x: leg.target.x, z: leg.target.z }
    : null;
  return {
    status: executor.status || null,
    engaged: executor.engaged === true,
    legIndex,
    legCount: legs.length,
    destinationSectorId: executor.destinationSectorId || null,
    legLabel: leg && leg.label ? leg.label : null,
    legFrom: leg ? leg.fromSectorId : null,
    legTo: leg ? leg.toSectorId : null,
    // W2-D additions, all straight field reads like the rest of this adapter — no logic, so it
    // still cannot drift from the follower the way a reimplementation would.
    //
    // `interruptReason` is what turns "Interrupted" into a decision the pilot can act on; without
    // it the ribbon can say a route stopped but not why.
    interruptReason: executor.interruptReason || null,
    // The active leg's GLOBAL target (ADR D2.1 — the actionable frame; there is no drawPos here).
    // This is what makes distance-to-next-waypoint and the at-current-speed ETA real numbers
    // rather than fabricated ones.
    legTarget,
    // The decomposed legs, forwarded shallowly so the ribbon can mark done/active/ahead and warn
    // about a leg the atlas could not resolve BEFORE the follower turns it into an interruption.
    legs: legs.map((entry, index) => ({
      index: Number.isFinite(entry && entry.index) ? entry.index : index,
      fromSectorId: entry ? entry.fromSectorId : null,
      toSectorId: entry ? entry.toSectorId : null,
      label: entry && entry.label ? entry.label : null,
      resolved: entry ? entry.resolved !== false : true,
      final: !!(entry && entry.final),
      target: entry && entry.target && Number.isFinite(entry.target.x) && Number.isFinite(entry.target.z)
        ? { x: entry.target.x, z: entry.target.z }
        : null,
    })),
  };
}

export function activeMapGoal(state) {
  if (!state) return null;
  const wp = state.nav && state.nav.waypoint;
  const wpPos = resolveWaypointPresentationPosition(state, wp);
  const trackedId = state.ui && state.ui.trackedMissionId;
  const active = (state.missions && state.missions.active) || [];
  const tracked = trackedId ? active.find((m) => m && m.status === 'active' && m.id === trackedId) : null;
  const routeLegs = state.nav && state.nav.route && Array.isArray(state.nav.route.legs)
    ? state.nav.route.legs
    : [];
  const routeDest = routeLegs.length ? routeLegs[routeLegs.length - 1].to : null;
  const sectorId = (wp && wp.sectorId)
    || (tracked && (tracked.destSectorId || (tracked.params && tracked.params.sectorId)))
    || routeDest
    || (wpPos ? currentSectorId(state) : null);
  if (!wp && !tracked && !routeDest) return null;
  return {
    id: 'active-map-goal',
    objective: true,
    markerKind: (wp && wp.markerKind) || ((wp && (wp.missionId || wp.onboarding)) || tracked ? 'mission-objective' : 'navigation'),
    missionId: (wp && wp.missionId) || (tracked && tracked.id) || null,
    sectorId,
    pos: wpPos ? { x: wpPos.x, z: wpPos.z } : null,
    label: String(
      (wp && (wp.label || wp.sectorName || wp.reason))
      || (tracked && (tracked.title || tracked.name))
      || 'Route destination',
    ).replace(/\s+/g, ' ').trim(),
  };
}

/** The mission the player is currently tracking, or null. */
export function trackedMissionOf(state) {
  const trackedId = state && state.ui && state.ui.trackedMissionId;
  if (!trackedId) return null;
  const active = (state.missions && state.missions.active) || [];
  return active.find((m) => m && m.status === 'active' && m.id === trackedId) || null;
}

/**
 * Where an accepted contract actually sends the player — the destination the chart should already
 * know before anybody plots anything ("Never Lost", ADR D4).
 *
 * Prefers the TRACKED mission, because tracking is the player's own statement of which contract
 * they are flying. Falls back to the first active mission that names a destination sector, so a
 * pilot who never pressed track is still told where they are going rather than being punished for
 * not using a UI affordance they may not have found.
 *
 * Pure: reads state, returns a plain record, writes nothing. It deliberately does NOT resolve a
 * route — a destination is an address, and turning it into a course is the plot action's job
 * (ADR D6 keeps plot and engage separate, and this must not quietly perform the first of them).
 *
 * @returns {{sectorId:string, stationId:string|null, label:string|null, missionId:string|null}|null}
 */
export function resolveMissionDestination(state) {
  if (!state) return null;
  const active = (state.missions && state.missions.active) || [];
  const destOf = (m) => (m && (m.destSectorId || (m.params && m.params.sectorId))) || null;
  const tracked = trackedMissionOf(state);
  const mission = (tracked && destOf(tracked))
    ? tracked
    : active.find((m) => m && m.status === 'active' && destOf(m));
  const sectorId = destOf(mission);
  if (!sectorId) return null;
  return {
    sectorId,
    stationId: mission.destStationId || null,
    label: String(mission.title || mission.name || '').replace(/\s+/g, ' ').trim() || null,
    missionId: mission.id || null,
  };
}

/**
 * Every live world position a mission wants the pilot at — not just the single tracked goal
 * (parity gap 8).
 *
 * `patrol_clear` spawns two to four tagged hostiles and `bounty_hunt`/`escort` spawn their own;
 * POI follow-ups and the 47a sample leg carry an explicit fix in params. Drawing only
 * `activeMapGoal` made every one of these read as a single-point errand. Each entry becomes a small
 * keyed mark when the mission layer is on.
 *
 * Pure: resolves live entities by id and copies coordinates out. Never mutates, never allocates
 * into state. Returns [] for the many mission types that carry no positional geometry at all.
 *
 * @returns {Array<{ id:string, kind:string, x:number, z:number, label:string, done:boolean }>}
 */
export function missionMapGeometry(state, mission) {
  if (!state || !mission || mission.status !== 'active') return [];
  const out = [];
  const seen = new Set();
  const push = (id, kind, x, z, label, done) => {
    const nx = Number(x);
    const nz = Number(z);
    if (!Number.isFinite(nx) || !Number.isFinite(nz)) return;
    const key = `${kind}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id: key, kind, x: nx, z: nz, label: String(label || 'Objective'), done: !!done });
  };

  // Spawn-tagged targets. These are runtime entity ids, so a target that has already been killed
  // simply stops resolving — the mark disappears rather than lingering as a lie.
  const ids = Array.isArray(mission.targetEntityIds) ? mission.targetEntityIds : [];
  if (ids.length) {
    const wanted = new Set(ids.map((id) => String(id)));
    for (const e of entityIterator(state)) {
      if (!e || !e.pos || !wanted.has(String(e.id))) continue;
      // `done` is always false for a spawn-tagged target, and that is correct rather than lazy: a
      // killed target is removed from `mission.targetEntityIds` by systems/missions.js and
      // swap-removed from the entity list at end-of-step, so a resolved-but-dead target cannot be
      // observed here at a frame boundary. The mark disappears; it never becomes a struck-through
      // one. Only the survey `sample` point below can genuinely report done.
      push(e.id, 'target', e.pos.x, e.pos.z,
        (e.data && e.data.name) || e.name || e.role || 'Target', false);
    }
  }

  const params = mission.params || {};
  if (params.samplePos) {
    push('sample', 'sample', params.samplePos.x, params.samplePos.z, 'Sample site', !!params.bearingFixed);
  }
  const followup = params.poiSignalFollowup;
  if (followup && followup.targetPos) {
    push('signal', 'signal', followup.targetPos.x, followup.targetPos.z, 'Signal source', false);
  }
  return out;
}

/** Pick a hit by semantic priority first, distance second, then source order for determinism. */
export function pickMapTargetAt(targets, x, y) {
  let best = null;
  let bestPriority = -Infinity;
  let bestD2 = Infinity;
  for (const target of targets || []) {
    if (!target) continue;
    const dx = x - target.sx;
    const dy = y - target.sy;
    const d2 = dx * dx + dy * dy;
    const radius = target.radiusPx || 14;
    const ringRadius = Number(target.ringRadiusPx) || 0;
    const ringBand = ringRadius > 0 ? Math.max(10, Math.min(20, ringRadius * 0.16)) : 0;
    const insideCenter = d2 <= radius * radius;
    const onRing = ringRadius > 0 && Math.abs(Math.sqrt(d2) - ringRadius) <= ringBand;
    if (!insideCenter && !onRing) continue;
    const priority = mapTargetPriority(target);
    if (priority > bestPriority || (priority === bestPriority && d2 < bestD2)) {
      best = target;
      bestPriority = priority;
      bestD2 = d2;
    }
  }
  return best;
}

/**
 * Resolve missionId/stationId (and optional pos/sector fallbacks) from a map open intent
 * into a click-target-shaped object for selection/inspector focus.
 * Pure — no DOM. Returns null when the intent has no mission/station target (plain N/M).
 */
export function resolveMapOpenTarget(state, intent) {
  if (!intent) return null;
  const missionId = intent.missionId != null ? String(intent.missionId) : null;
  let stationId = intent.stationId != null ? String(intent.stationId) : null;
  let sectorId = intent.sectorId != null ? String(intent.sectorId) : null;
  let mission = null;

  if (missionId && state) {
    const active = (state.missions && state.missions.active) || [];
    mission = active.find((m) => m && String(m.id) === missionId) || null;
    if (mission) {
      if (!stationId && mission.destStationId != null) stationId = String(mission.destStationId);
      if (!sectorId) {
        const midSector = mission.destSectorId || (mission.params && mission.params.sectorId) || null;
        if (midSector != null) sectorId = String(midSector);
      }
    }
  }

  // Plain focus-only opens (keyboard M/N, gamepad View, touch Local/Star) must not invent a target.
  if (!stationId && !missionId) return null;

  if (stationId) {
    // Live entity in the current sector (preferred for LOCAL selection ring).
    for (const e of entityIterator(state)) {
      if (!e || e.alive === false || e.type !== 'station' || !e.pos) continue;
      const eStationId = (e.data && e.data.stationId) || e.id;
      if (String(eStationId) !== stationId && String(e.id) !== stationId) continue;
      return {
        id: e.id,
        kind: 'station',
        name: (e.data && e.data.name) || e.name || stationId,
        x: e.pos.x,
        z: e.pos.z,
        entityId: e.id,
        stationId,
        factionId: e.factionId || (e.data && e.data.factionId) || null,
        sectorId: sectorId || currentSectorId(state),
        missionId,
      };
    }

    // System-level points for the intent sector (or current).
    const sid = sectorId || currentSectorId(state);
    if (sid) {
      const model = buildSystemModel(state, sid);
      for (const p of model.points || []) {
        if (!p || (p.kind !== 'station' && p.kind !== 'gate')) continue;
        if (String(p.stationId || '') !== stationId && String(p.id) !== stationId) continue;
        return {
          id: p.id,
          kind: p.kind === 'gate' ? 'gate' : 'station',
          name: p.name || stationId,
          x: p.x,
          z: p.z,
          entityId: p.entityId || null,
          stationId: p.stationId || stationId,
          factionId: p.factionId || null,
          sectorId: sid,
          missionId,
        };
      }
    }

    // Static station catalog (may lack world pos for off-sector entries).
    const rec = findStationRecord(state, stationId);
    if (rec) {
      const anchor = rec.pos || rec.anchor || rec.position || null;
      const ax = anchor ? Number(anchor.x) : NaN;
      const az = anchor ? Number(anchor.z != null ? anchor.z : anchor.y) : NaN;
      const fromPos = intent.pos && Number.isFinite(intent.pos.x) && Number.isFinite(intent.pos.z)
        ? intent.pos
        : null;
      return {
        id: stationId,
        kind: 'station',
        name: rec.name || stationId,
        x: Number.isFinite(ax) ? ax : (fromPos ? fromPos.x : null),
        z: Number.isFinite(az) ? az : (fromPos ? fromPos.z : null),
        entityId: null,
        stationId,
        factionId: rec.factionId || null,
        sectorId: sectorId || null,
        missionId,
      };
    }

    // Synthesize from intent.pos when station catalog misses the id.
    if (intent.pos && Number.isFinite(intent.pos.x) && Number.isFinite(intent.pos.z)) {
      return {
        id: stationId,
        kind: 'station',
        name: intent.label || stationId,
        x: intent.pos.x,
        z: intent.pos.z,
        entityId: null,
        stationId,
        factionId: null,
        sectorId: sectorId || null,
        missionId,
      };
    }

    // Known station id without coordinates — still selectable for inspector / course degrade.
    return {
      id: stationId,
      kind: 'station',
      name: intent.label || stationId,
      x: null,
      z: null,
      entityId: null,
      stationId,
      factionId: null,
      sectorId: sectorId || null,
      missionId,
    };
  }

  // missionId without stationId: sector node, then pos fix.
  if (sectorId) {
    const rec = sectorRecordById(state, sectorId);
    if (rec) {
      const p = rec.position || rec.pos || {};
      const gx = Number(p.x);
      const gy = Number(p.y != null ? p.y : p.z);
      return {
        id: sectorId,
        kind: 'sector',
        name: rec.name || sectorId,
        sectorId,
        x: Number.isFinite(gx) ? gx : 0,
        y: Number.isFinite(gy) ? gy : 0,
        factionId: rec.factionId || rec.owner || null,
        security: rec.security,
        missionId,
      };
    }
  }

  if (intent.pos && Number.isFinite(intent.pos.x) && Number.isFinite(intent.pos.z)) {
    return {
      id: missionId || 'mission_fix',
      kind: 'local',
      name: intent.label || (mission && (mission.title || mission.name)) || 'Mission objective',
      x: intent.pos.x,
      z: intent.pos.z,
      missionId,
      sectorId: sectorId || null,
    };
  }

  return null;
}

/**
 * Apply a one-shot map open intent to view state (zoom + camera centers).
 * Pure enough for headless checks: mutates `view` and returns it.
 * `view` shape: { zoom, targetZoom, cams: { galaxy, system, local } }.
 * Also attaches `view.openTarget` when missionId/stationId resolve.
 */
export function applyMapOpenIntentToView(view, intent, state) {
  if (!view) return view;
  const focus = normalizeMapFocus(intent && intent.focus);
  const z = zoomForMapFocus(focus);
  view.zoom = z;
  view.targetZoom = z;

  const player = state ? playerEntity(state) : null;
  const px = player && player.pos ? player.pos.x : 0;
  const pz = player && player.pos ? player.pos.z : 0;
  if (!view.cams) {
    view.cams = {
      galaxy: { cx: 0, cy: 0, zoom: 1 },
      system: { cx: 0, cy: 0, zoom: 1.5 },
      local: { cx: px, cy: pz, zoom: 1.5 },
    };
  }
  if (view.cams.local) {
    view.cams.local.cx = px;
    view.cams.local.cy = pz;
  }
  if (view.cams.system) {
    view.cams.system.cx = 0;
    view.cams.system.cy = 0;
  }

  const pos = intent && intent.pos;
  let posApplied = false;
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
    posApplied = true;
    if (focus === MAP_FOCUS.LOCAL && view.cams.local) {
      view.cams.local.cx = pos.x;
      view.cams.local.cy = pos.z;
    } else if (focus === MAP_FOCUS.SYSTEM && view.cams.system) {
      view.cams.system.cx = pos.x;
      view.cams.system.cy = pos.z;
    }
  }

  // Mission/station intent: resolve selection target first so GALAXY can use openTarget.sectorId
  // when the intent only carries missionId (emitters usually also send sectorId; this is the hole).
  const openTarget = resolveMapOpenTarget(state, intent);

  // Off-sector / star-chart focus: center galaxy cam on intent.sectorId or resolved openTarget.sectorId.
  const sectorId = (intent && intent.sectorId)
    || (openTarget && openTarget.sectorId)
    || null;
  if (focus === MAP_FOCUS.GALAXY && sectorId && state && view.cams.galaxy) {
    const rec = sectorRecordById(state, sectorId);
    const p = rec && rec.position;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y != null ? p.y : p.z)) {
      view.cams.galaxy.cx = p.x;
      view.cams.galaxy.cy = p.y != null ? p.y : p.z;
    } else if (openTarget && openTarget.kind === 'sector'
        && Number.isFinite(openTarget.x) && Number.isFinite(openTarget.y)) {
      // Direct sector-node coords when catalog position is missing.
      view.cams.galaxy.cx = openTarget.x;
      view.cams.galaxy.cy = openTarget.y;
    }
  }

  // Pan local/system cams from openTarget when pos was not provided.
  if (openTarget && !posApplied && Number.isFinite(openTarget.x) && Number.isFinite(openTarget.z)) {
    if (focus === MAP_FOCUS.LOCAL && view.cams.local) {
      view.cams.local.cx = openTarget.x;
      view.cams.local.cy = openTarget.z;
    } else if (focus === MAP_FOCUS.SYSTEM && view.cams.system) {
      view.cams.system.cx = openTarget.x;
      view.cams.system.cy = openTarget.z;
    } else if (focus === MAP_FOCUS.LOCAL && view.cams.system) {
      // Local zoom still benefits from system-table pan when only system coords exist.
      view.cams.system.cx = openTarget.x;
      view.cams.system.cy = openTarget.z;
    }
  }

  view.openIntent = intent || null;
  view.openTarget = openTarget;
  return view;
}

// ---------------------------------------------------------------------------------------------
// State readers (defensive — every input is optional; degrade gracefully).
// ---------------------------------------------------------------------------------------------

function currentSectorId(state) {
  return (state && state.world && state.world.currentSectorId)
    || (state && state.currentSectorId)
    || (SECTORS[0] && SECTORS[0].id)
    || null;
}

/** Sector records: prefer live state.content.sectors, else static SECTORS. */
function sectorRecords(state) {
  const content = state && state.content && state.content.sectors;
  if (content) {
    const list = Array.isArray(content) ? content : Object.values(content);
    if (list.length) return list;
  }
  const worldSectors = state && state.world && state.world.sectors;
  if (worldSectors) {
    const list = Array.isArray(worldSectors) ? worldSectors : Object.values(worldSectors);
    // world.sectors are runtime instances; only use them if they carry the graph fields we need.
    if (list.length && list.every((s) => s && s.id && s.position)) return list;
  }
  return SECTORS;
}

function sectorRecordById(state, id) {
  for (const s of sectorRecords(state)) if (s && s.id === id) return s;
  return SECTOR_BY_ID.get(id) || null;
}

/**
 * How many berths a sector offers — the bead count on its sigil.
 *
 * Gates are excluded on purpose: a bead reads as "somewhere you can dock and trade", and a gate is
 * a door, not a destination. Capped by the caller at four, past which extra beads stop being
 * countable at glyph scale and just read as texture.
 */
/** Display name for a sector id, preferring live world state over the authored catalog. */
function sectorNameOf(state, sectorId) {
  if (!sectorId) return '';
  const live = state && state.world && state.world.sectors && state.world.sectors[sectorId];
  if (live && live.name) return String(live.name);
  const authored = SECTOR_BY_ID.get(sectorId);
  return authored && authored.name ? String(authored.name) : String(sectorId);
}

function sectorBerthCount(state, sectorId) {
  const record = sectorRecordById(state, sectorId);
  const stations = record && Array.isArray(record.stations) ? record.stations : null;
  if (!stations) return 0;
  let n = 0;
  for (const st of stations) if (st && !st.isGate) n += 1;
  return n;
}

/** A sector is "charted" (not fog) if flagged in data, is the current sector, or is discovered. */
export function isSectorCharted(state, sector) {
  if (!sector) return false;
  if (sector.charted) return true;
  if (sector.id === currentSectorId(state)) return true;
  const disc = state && state.world && state.world.discovery && state.world.discovery[sector.id];
  return !!(disc && disc.discovered);
}

export const MAP_CONFIDENCE_STALE_DAYS = 7;

function currentFieldEpochDays(state) {
  const field = state && state.sectorSim && state.sectorSim.field;
  const days = field && Number(field.epochDays);
  return Number.isFinite(days) ? days : null;
}

function discoveryForSector(state, sectorId) {
  return state && state.world && state.world.discovery && state.world.discovery[sectorId] || null;
}

function discoveryEpochDays(disc) {
  if (!disc) return null;
  const candidates = [
    disc.lastVisitedEpochDays,
    disc.lastSeenEpochDays,
    disc.surveyedEpochDays,
    disc.chartedEpochDays,
    disc.epochDays,
  ];
  for (const value of candidates) {
    const days = Number(value);
    if (Number.isFinite(days)) return days;
  }
  return null;
}

/**
 * Confidence is a pure read of discovery + sector-field epoch data:
 * live=current sector, known=charted/discovered but fresh/undated, stale=known with old epoch,
 * rumored=uncharted frontier/fog. No extra map layer and no pricing/danger feedback.
 */
export function mapConfidenceForSector(state, sector) {
  if (!sector || !sector.id) {
    return { confidence: 'rumored', confidenceAgeDays: null, lastSeenEpochDays: null };
  }
  const sectorId = sector.id;
  const disc = discoveryForSector(state, sectorId);
  if (!isSectorCharted(state, sector)) {
    return { confidence: 'rumored', confidenceAgeDays: null, lastSeenEpochDays: null };
  }
  const now = currentFieldEpochDays(state);
  if (sectorId === currentSectorId(state)) {
    return { confidence: 'live', confidenceAgeDays: 0, lastSeenEpochDays: now };
  }
  const seenAt = discoveryEpochDays(disc);
  if (Number.isFinite(seenAt) && Number.isFinite(now)) {
    const age = Math.max(0, now - seenAt);
    return {
      confidence: age >= MAP_CONFIDENCE_STALE_DAYS ? 'stale' : 'known',
      confidenceAgeDays: age,
      lastSeenEpochDays: seenAt,
    };
  }
  return { confidence: 'known', confidenceAgeDays: null, lastSeenEpochDays: seenAt };
}

function playerEntity(state) {
  if (!state || !state.entities || typeof state.entities.get !== 'function') return null;
  const id = state.playerId != null ? state.playerId : (state.player && state.player.id);
  return id != null ? state.entities.get(id) || null : null;
}

function entityIterator(state) {
  if (!state) return [];
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') {
    return Array.from(state.entities.values());
  }
  return [];
}

/**
 * Which sector an entity belongs to, or null when it is unstamped.
 *
 * `_stampHomeSector` (src/systems/world.js) writes the id to BOTH `ent.homeSectorId` and
 * `ent.data.homeSectorId`, but other spawn paths set only one of the two — reading a single field
 * silently classifies continuous-residency furniture as local. Every caller must agree on the
 * chain, so it lives here rather than being re-inlined per builder.
 */
function entityHomeSector(e) {
  if (!e) return null;
  const d = e.data;
  return (d && (d.homeSectorId || d.sectorId)) || e.homeSectorId || null;
}

function whole(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-US');
}

/**
 * Pure player-facing identity for one owned claim on the authoritative unified map.
 * The optional live entity supplies the current galactic-global position; the durable claim
 * record remains the fallback for unloaded/off-screen bodies.
 */
export function describeClaimMapMarker(body = {}, ledger = null, liveEntity = null) {
  const specId = body.spec && body.spec.id || ledger && ledger.specId || null;
  const def = specId && BODY_SPECIALIZATION_BY_ID.get(specId);
  const role = def ? def.short : 'CLAIM';
  const status = String(ledger && ledger.status || body.spec && body.spec.status || 'uncommissioned').toUpperCase();
  const pieces = [];
  if (specId === 'spec_refinery') {
    const stores = ledger && ledger.stores || {};
    pieces.push(`${whole(stores.inputU)}/${whole(stores.inputCapU)}u ore`);
    pieces.push(`${whole(stores.outputU)}/${whole(stores.outputCapU)}u ready`);
    if (ledger && ledger.throughput) pieces.push(`${Number(ledger.throughput.refineRatePerS || 0).toFixed(1)} ore/s`);
  } else if (specId === 'spec_relay') {
    const stores = ledger && ledger.stores || {};
    pieces.push(`${whole(stores.inputU)}/${whole(stores.inputCapU)}u freight`);
    pieces.push(ledger && ledger.convoy ? `convoy ${whole(ledger.convoy.etaS)}s` : 'convoy standing by');
    pieces.push(`${whole(ledger && ledger.flows && ledger.flows.soldTotalCr)} cr sold`);
  } else if (specId === 'spec_bastion') {
    pieces.push(`${whole(ledger && ledger.defense && ledger.defense.rating)} defense`);
    pieces.push(`${whole(ledger && ledger.readiness && ledger.readiness.coveredBodies)} claims covered`);
    pieces.push(`next sweep ${whole(ledger && ledger.risk && ledger.risk.nextRollInS)}s`);
  } else {
    pieces.push('uncommissioned');
    pieces.push('approach and open Base to build');
  }
  const infrastructure = ledger && ledger.infrastructure || body.infrastructure || null;
  if (infrastructure) {
    const infraState = infrastructure.operational
      ? 'Throughline online'
      : infrastructure.stage === 'aligning'
        ? `Throughline aligning ${whole(infrastructure.alignRemainingS)}s`
        : 'Throughline offline';
    pieces.push(infraState);
    if (infrastructure.stationName || infrastructure.stationId) {
      pieces.push(`route ${infrastructure.stationName || infrastructure.stationId}`);
    }
  }
  const position = liveEntity && liveEntity.pos || { x: Number(body.x) || 0, z: Number(body.z) || 0 };
  return {
    id: `player-claim:${body.id || body.poiId || 'unknown'}`,
    claimId: body.id || null,
    targetEntityId: liveEntity && liveEntity.id || null,
    kind: def ? `claim-${def.id.replace(/^spec_/, '')}` : 'claim',
    role,
    glyph: def ? def.mapGlyph : '◆',
    color: def ? def.mapColor : '#ffd24a',
    name: `${role} · ${body.name || 'Owned Claim'}`,
    status,
    statusLine: pieces.join(' · '),
    playerVerb: def ? def.playerVerb : 'Open the Base interface to build this claim.',
    consequence: infrastructure
      ? `${def ? def.consequence : 'Owned claim.'} Throughline multiplies the pilot’s own Travel Burn only inside its physical corridor.`
      : def ? def.consequence : 'An owned site awaiting an operating identity.',
    riskLine: def ? def.riskLine : 'Uncommissioned sites provide no operating benefit.',
    x: Number(position.x) || 0,
    z: Number(position.z) || 0,
    infrastructure: infrastructure ? {
      id: infrastructure.id || null,
      stage: infrastructure.stage || 'offline',
      operational: infrastructure.operational === true,
      stationId: infrastructure.stationId || null,
    } : null,
  };
}

function discoveryBearingReadouts(state, sectorId = null) {
  return [
    ...uniqueWreckMapReadouts(state, sectorId),
    ...frontierRumorMapReadouts(state, sectorId),
    ...vestaOreCacheMapReadouts(state, sectorId),
    ...pallasHiddenCacheMapReadouts(state, sectorId),
  ].sort((a, b) => String(a.wreckId || '').localeCompare(String(b.wreckId || '')));
}

/** Public identity printed beside the ship's own chart fix. Choice B is driven by its applied,
 * saved consequence flag; merely previewing or selecting that ending cannot change the map. */
export function mapOperatorLabel(state) {
  return publicOperatorLabel(state);
}

/** Build owned-site markers once for both SYSTEM and LOCAL unified-map models. */
export function buildClaimOwnershipMarkers(state, sectorId, claimsSystem = null) {
  const sid = sectorId || currentSectorId(state);
  const bodies = claimsSystem && typeof claimsSystem.list === 'function'
    ? claimsSystem.list()
    : state && state.claims && Array.isArray(state.claims.bodies) ? state.claims.bodies : [];
  const liveByPoi = new Map();
  const liveByInfrastructurePart = new Map();
  for (const entity of entityIterator(state)) {
    const poiId = entity && entity.alive !== false && entity.data && entity.data.poiId;
    if (poiId) liveByPoi.set(poiId, entity);
    const infrastructureId = entity && entity.alive !== false && entity.data
      && entity.data.claimTravelInfrastructureId;
    const part = entity && entity.data && entity.data.claimTravelPart;
    if (infrastructureId && part) liveByInfrastructurePart.set(`${infrastructureId}:${part}`, entity);
  }
  const markers = [];
  for (const body of bodies) {
    if (!body || body.owned !== true || body.sectorId !== sid) continue;
    const ledger = claimsSystem && typeof claimsSystem.ledger === 'function'
      ? claimsSystem.ledger(body.id)
      : null;
    const marker = describeClaimMapMarker(body, ledger, liveByPoi.get(body.poiId) || null);
    marker.drawPos = globalToSectorLocalForSector(marker, sid);
    markers.push(marker);
    const infrastructure = body.infrastructure;
    if (!infrastructure || !infrastructure.from || !infrastructure.support || !infrastructure.to) continue;
    const operational = infrastructure.operational === true;
    const status = operational
      ? 'ONLINE'
      : infrastructure.stage === 'aligning' ? 'ALIGNING' : 'OFFLINE';
    const travelRoute = {
      id: infrastructure.id,
      claimId: body.id,
      stage: infrastructure.stage,
      operational,
      lineStyle: operational ? 'solid' : infrastructure.stage === 'aligning' ? 'long-dash' : 'short-dash',
      color: operational ? '#39d0ff' : '#87939c',
      from: { x: Number(infrastructure.from.x) || 0, z: Number(infrastructure.from.z) || 0 },
      support: { x: Number(infrastructure.support.x) || 0, z: Number(infrastructure.support.z) || 0 },
      to: { x: Number(infrastructure.to.x) || 0, z: Number(infrastructure.to.z) || 0 },
    };
    travelRoute.drawFrom = globalToSectorLocalForSector(travelRoute.from, sid);
    travelRoute.drawSupport = globalToSectorLocalForSector(travelRoute.support, sid);
    travelRoute.drawTo = globalToSectorLocalForSector(travelRoute.to, sid);
    for (const partDef of [
      { id: 'ring', role: 'SLING', glyph: '◎', pos: infrastructure.from, name: 'Acceleration Ring' },
      { id: 'relay', role: 'RELAY', glyph: '◇', pos: infrastructure.support, name: 'Nav Relay' },
    ]) {
      const live = liveByInfrastructurePart.get(`${infrastructure.id}:${partDef.id}`) || null;
      const point = live && live.pos || partDef.pos;
      const partMarker = {
        id: `player-infrastructure:${infrastructure.id}:${partDef.id}`,
        claimId: body.id,
        targetEntityId: live && live.id || null,
        kind: 'claim-throughline',
        role: partDef.role,
        glyph: partDef.glyph,
        color: operational ? '#39d0ff' : '#87939c',
        name: `${partDef.role} · ${body.name} ${partDef.name}`,
        status,
        statusLine: `${status} · ${Math.round(infrastructure.distanceWU || 0).toLocaleString('en-US')} WU route · ×${Number(infrastructure.ceilingMult || 1).toFixed(1)} Travel Burn`,
        playerVerb: 'Set a course to the physical corridor and engage Travel Burn inside its marked tube.',
        consequence: 'Multiplies the pilot’s own drive ceiling and ramp only inside the constructed route.',
        riskLine: 'If the industrial claim goes cold or is raided, ordinary unassisted flight remains available.',
        x: Number(point.x) || 0,
        z: Number(point.z) || 0,
        infrastructure: {
          id: infrastructure.id,
          part: partDef.id,
          stage: infrastructure.stage,
          operational,
          stationId: infrastructure.stationId,
        },
        travelRoute: partDef.id === 'ring' ? travelRoute : null,
      };
      partMarker.drawPos = globalToSectorLocalForSector(partMarker, sid);
      markers.push(partMarker);
    }
  }
  return markers;
}

// ---------------------------------------------------------------------------------------------
// LEVEL 1 — GALAXY: the SECTORS graph (nodes + edges), faction color, fog for uncharted frontier.
// ---------------------------------------------------------------------------------------------

/**
 * Build the galaxy-level draw model: one node per sector (with faction color, charted flag, and
 * screen-independent graph position), and one edge per neighbor pair (deduped). Trade edges connect
 * two charted sectors; uncharted edges are drawn faint. Pure — no DOM.
 *
 * @returns {{ level:'galaxy', currentSectorId, nodes:Array, edges:Array }}
 */
export function buildGalaxyModel(state) {
  const records = sectorRecords(state);
  const curId = currentSectorId(state);
  const story = state && state.story || {};
  const verge = story.verge && typeof story.verge === 'object' ? story.verge : {};
  const storyFlags = {
    vergeLayersRevealed: verge.revealed === true,
    vergeAwake: verge.awake === true,
    valeGatesRevoked: verge.valeGatesRevoked === true,
    playerUsedVergeClosureProtocol: verge.playerUsedClosureProtocol === true,
  };
  const revocationCount = Array.isArray(verge.revocations) ? verge.revocations.length : 0;
  const presenceBySector = new Map();
  for (const presence of mapFactionPresenceNodes({
    seed: (state && state.meta && state.meta.seed) || 1,
    revocationCount,
    storyFlags,
  })) {
    if (presence.phase === 'asleep') continue;
    for (const sectorId of presence.sectorIds || []) {
      const rows = presenceBySector.get(sectorId) || [];
      rows.push({
        ...presence,
        factionName: factionNameOf(presence.factionId),
        color: factionColorOf(presence.factionId),
      });
      presenceBySector.set(sectorId, rows);
    }
  }
  const nodes = [];
  const nodeById = new Map();
  for (const s of records) {
    if (!s || !s.id) continue;
    const pos = s.position || { x: 0, y: 0 };
    const charted = isSectorCharted(state, s);
    const confidence = mapConfidenceForSector(state, s);
    const bearingCount = discoveryBearingReadouts(state, s.id).length;
    const presence = charted ? (presenceBySector.get(s.id) || []) : [];
    const liveOwner = state && state.world && state.world.sectors && state.world.sectors[s.id];
    const node = {
      id: s.id,
      name: s.name || s.id,
      x: Number(pos.x) || 0,
      y: Number(pos.y) || 0,
      factionId: s.factionId || null,
      ownerId: (liveOwner && liveOwner.owner) || s.factionId || null,
      color: factionColorOf(s.factionId),
      charted,
      ...confidence,
      current: s.id === curId,
      tier: Number(s.tier) || 0,
      security: Number.isFinite(s.security) ? s.security : null,
      bearingCount,
      neighbors: Array.isArray(s.neighbors) ? s.neighbors.slice() : [],
      presence,
      searchText: [
        s.name || s.id,
        factionNameOf(s.factionId),
        ...presence.flatMap((row) => [row.factionName, row.label]),
      ].filter(Boolean).join(' '),
    };
    nodes.push(node);
    nodeById.set(s.id, node);
  }

  const edges = [];
  const seen = new Set();
  for (const node of nodes) {
    for (const nb of node.neighbors) {
      const key = node.id < nb ? node.id + '|' + nb : nb + '|' + node.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const other = nodeById.get(nb);
      if (!other) continue;
      const bothCharted = node.charted && other.charted;
      edges.push({
        from: node.id, to: nb,
        ax: node.x, ay: node.y, bx: other.x, by: other.y,
        charted: bothCharted,
        trade: bothCharted, // a charted-to-charted link is a usable trade lane
      });
    }
  }
  // "You are here" at GALAXY scale.
  //
  // The galaxy model shipped with no player field at all — the current sector was merely FLAGGED
  // (`node.current`), which answers "which system am I registered to", not "where is my ship". Those
  // are different questions the moment the ship leaves a sector disc, which is most of a long haul:
  // between Helios and Tethys the highlighted node sits 7,000 WU from the ship and nothing on the
  // chart marks the ship itself. The brief's first requirement is a marker that NEVER disappears at
  // ANY scale, so galaxy gets a real one.
  //
  // TWO FRAMES, same contract as the system model (ADR D2.1): `x`/`z` are GLOBAL, and `drawPos` is
  // the frame this level actually projects. Galaxy is the one level whose draw frame is neither
  // global nor sector-local — it is the authored sector GRAPH (small integers; `SECTORS[].position`),
  // which maps onto the world by exactly one lattice quantum per graph unit. Dividing by the lattice
  // is therefore a frame conversion, not a cosmetic scale, and it is spelled out here rather than at
  // the draw site so no future reader mistakes the graph units for world units.
  const player = playerEntity(state);
  let playerMark = null;
  if (player && player.pos && Number.isFinite(player.pos.x) && Number.isFinite(player.pos.z)) {
    playerMark = {
      id: player.id,
      x: player.pos.x,
      z: player.pos.z,
      drawPos: {
        x: player.pos.x / SECTOR_ORIGIN_LATTICE_WU,
        z: player.pos.z / SECTOR_ORIGIN_LATTICE_WU,
      },
      rot: player.rot || 0,
      sectorId: curId,
    };
  }

  return { level: 'galaxy', currentSectorId: curId, nodes, edges, player: playerMark };
}

// ---------------------------------------------------------------------------------------------
// LEVEL 2 — SYSTEM: the current sector's stations/gates/POIs + named zones as tinted regions.
// ---------------------------------------------------------------------------------------------

/**
 * Split one authored anchor into the system model's two declared frames. Authored station/gate/POI
 * anchors are SECTOR-LOCAL, so the old code handed them to resolveCourseTarget unconverted and
 * armed the autopilot at the wrong end of the lattice for every sector whose origin is not (0,0).
 * A null anchor keeps both frames null: the point still lists (so you can course toward its sector)
 * and the click resolver degrades it to a sector route.
 */
function anchorFrames(anchor, sid, localZ) {
  if (!anchor) return { x: null, z: null, drawPos: null };
  const local = { x: Number(anchor.x) || 0, z: localZ };
  const global = sectorLocalToGlobalForSector(local, sid);
  return { x: global.x, z: global.z, drawPos: local };
}

/**
 * Build the system-level draw model for `sectorId` (defaults to the current sector). Zones come from
 * sectorZones (labeled tinted discs). Stations/gates/POIs prefer LIVE entity positions from state
 * (so the map matches what's actually flying), and fall back to the static sector record so the
 * model is non-empty even before entities stream in. Pure — no DOM.
 *
 * TWO COORDINATE FRAMES, both declared, never mixed within one field. Do not collapse them:
 *
 *   - `x`/`z` on points and ownership markers are GALACTIC-GLOBAL WU (core/coordinates
 *     `global_v1`, the frame sim entities live in). This is the NAV frame: resolveCourseTarget
 *     copies it into the `ui:setCourse` payload, and world.js `_onSetCourse` writes it straight
 *     to `state.nav.autopilot.target`. An autopilot fix must be global or the ship flies to the
 *     wrong sector.
 *   - `drawPos`/`drawCenter`/`drawFixedPos` and the zone `x`/`z` are SECTOR-LOCAL WU for
 *     `sectorId` (global minus that sector's origin). This is the DRAW frame — the only frame
 *     the SYSTEM canvas may project.
 *
 * `player` carries the same pair (and the same frame buildLocalModel uses for its own player
 * field), plus `inSector` — false when you survey a sector you are not standing in — and a
 * `bearing`/`distance` measured from the SURVEYED sector's origin, so the screen can pin an
 * off-chart indicator instead of dropping the "you are here" mark. It is null when there is no
 * player entity; it is never a fabricated origin position.
 *
 * @returns {{ level:'system', sectorId, sectorName, zones:Array, points:Array, ownership:Array,
 *             bearings:Array,
 *             player:{id,x,z,drawPos,rot,inSector,bearing,distance}|null }}
 */
export function buildSystemModel(state, sectorId, options = {}) {
  const sid = sectorId || currentSectorId(state);
  const record = sectorRecordById(state, sid);
  const sectorName = (record && record.name) || sid || 'System';
  const confidence = mapConfidenceForSector(state, record || { id: sid });
  const ownership = buildClaimOwnershipMarkers(state, sid, options.claimsSystem || null);
  const bearings = discoveryBearingReadouts(state, sid).map((readout) => ({
    ...readout,
    drawCenter: globalToSectorLocalForSector(readout.center, sid),
    drawFixedPos: readout.fixedPos
      ? globalToSectorLocalForSector(readout.fixedPos, sid)
      : null,
  }));

  // Zones (labeled, tinted, threat-ranked regions).
  const zones = zonesForSector(sid).map((z) => {
    const meta = zoneTypeMeta(z.type);
    const c = z.center || { x: 0, z: 0 };
    return {
      id: z.id,
      name: z.name || meta.label,
      type: z.type,
      typeLabel: meta.label,
      color: meta.color || '#8899AA',
      x: Number(c.x) || 0,
      z: Number(c.z) || 0,
      radius: Number(z.radius) || 300,
      threat: zoneThreat(z),
      factionId: z.factionId || null,
      reason: z.reason || '',
      hazard: !!meta.hazard,
      safe: !!meta.safe,
    };
  });

  // Points of interest: stations + gates from LIVE entities in the current sector, else static data.
  const points = [];
  const seenIds = new Set();
  const isCurrent = sid === currentSectorId(state);
  if (isCurrent) {
    for (const e of entityIterator(state)) {
      if (!e || e.alive === false || !e.pos) continue;
      // Continuous residency materializes neighbouring sectors' structural entities, and the
      // iterator is world-wide. Without this predicate a SYSTEM survey of Helios Prime listed every
      // adjacent system's gates — including "Gate → Helios Prime", which is nonsense while you are
      // standing in Helios Prime. Worse than the clutter: those twins sit a lattice-hop away, so
      // the auto-fit below (`m * 2.2` over point extents) blew the span out by ~8x and squeezed the
      // sector's own furniture into an unreadable dot at the centre. Drop them at the source rather
      // than fading them — a fade leaves the ruined span intact.
      const home = entityHomeSector(e);
      if (home && home !== sid) continue;
      if (e.type === 'station') {
        const data = e.data || {};
        const isGate = !!data.isGate;
        points.push({
          id: e.id,
          kind: isGate ? 'gate' : 'station',
          name: data.name || e.name || (isGate ? 'Gate' : 'Station'),
          // Sim entities are galactic-global; the zones and static anchors beside them are
          // sector-local. Drawing e.pos raw put Tethys Junction's own station 12,288 WU from its
          // own zone (its origin is at 3*4096, 2*4096) — the auto-fit below spans over point
          // extents, so the sector's furniture collapsed into an unreadable dot at the centre.
          // Helios Prime is the ONLY sector where this is invisible, because its origin is (0,0),
          // and it is the starting sector — which is why it survived. Carry both frames: x/z stay
          // global for the autopilot fix, drawPos is what the canvas is allowed to project.
          x: e.pos.x, z: e.pos.z,
          drawPos: globalToSectorLocalForSector(e.pos, sid),
          entityId: e.id,
          stationId: data.stationId || null,
          factionId: e.factionId || data.factionId || null,
          targetSectorId: isGate
            ? (data.gateTo || data.targetSectorId || data.linkSectorId || null)
            : null,
        });
        seenIds.add(data.stationId || e.id);
      }
    }
  }
  // Static station fallback (positions may be absent for off-sector systems — still list them so a
  // player can course toward the sector; the click resolver degrades to a sector route in that case).
  if (record && Array.isArray(record.stations)) {
    for (const st of record.stations) {
      if (!st || !st.id || seenIds.has(st.id)) continue;
      const anchor = st.pos || st.anchor || st.position || null; // sectorAnchors merges canonical pos
      const frames = anchorFrames(anchor, sid, anchor ? (Number(anchor.z) || 0) : 0);
      points.push({
        id: st.id,
        kind: 'station',
        name: st.name || st.id,
        x: frames.x,
        z: frames.z,
        drawPos: frames.drawPos,
        entityId: null,
        stationId: st.id,
        factionId: st.factionId || null,
        sectorId: sid,
        targetSectorId: null,
      });
    }
  }
  // Static gate fallback — live entities win; catalog gates fill empty/non-current surveys.
  if (record && Array.isArray(record.gates)) {
    for (const gate of record.gates) {
      if (!gate || !gate.to) continue;
      const destId = gate.to;
      const alreadyLive = points.some((p) => p.kind === 'gate' && p.targetSectorId === destId);
      if (alreadyLive) continue;
      const dest = SECTOR_BY_ID.get(destId);
      const anchor = gate.pos || gate.anchor || gate.position || null;
      const gateId = gate.id || `gate:${sid}:${destId}`;
      if (seenIds.has(gateId)) continue;
      // Authored gate anchors predate the XZ convention and may still carry `y` for depth.
      const frames = anchorFrames(anchor, sid, anchor ? (Number(anchor.z != null ? anchor.z : anchor.y) || 0) : 0);
      points.push({
        id: gateId,
        kind: 'gate',
        name: `Gate → ${(dest && dest.name) || destId}`,
        x: frames.x,
        z: frames.z,
        drawPos: frames.drawPos,
        entityId: null,
        stationId: null,
        factionId: null,
        sectorId: sid,
        targetSectorId: destId,
      });
      seenIds.add(gateId);
    }
  }
  // POIs (beacons/derelicts/etc.) — labels only unless an anchor position is merged in.
  if (record && Array.isArray(record.pois)) {
    const discoveredPois = discoveryForSector(state, sid);
    const discoveredById = discoveredPois && discoveredPois.pois || {};
    for (const poi of record.pois) {
      if (!poi || !poi.id) continue;
      if (poi.hidden && !(discoveredById[poi.id] && discoveredById[poi.id].discovered)) continue;
      const anchor = poi.pos || poi.anchor || poi.center || poi.position || null;
      const frames = anchorFrames(anchor, sid, anchor ? (Number(anchor.z) || 0) : 0);
      points.push({
        id: poi.id,
        kind: 'poi',
        poiType: poi.type || 'poi',
        name: poi.name || poi.id,
        x: frames.x,
        z: frames.z,
        drawPos: frames.drawPos,
        entityId: null,
        sectorId: sid,
      });
    }
  }
  for (const marker of worldSiteMapMarkers(state, sid)) {
    const staticIndex = points.findIndex((point) => point.id === marker.id);
    if (staticIndex < 0) {
      points.push(marker);
      continue;
    }
    // One authored place identity may be present in both the static Atlas catalog and the durable
    // World Site projection. Keep one point, but merge the live stage/ledger/history contract into
    // it; suppressing the dynamic duplicate must never suppress its authoritative activity.
    points[staticIndex] = Object.freeze({ ...points[staticIndex], ...marker });
  }
  // Orrin's accepted original resolves through the ordinary station target/click/course path.
  // The case reader deliberately supplies no nav state; this only gives the existing Customs
  // Gate point a persistent reason to be selected after the one-shot referral intent is gone.
  const orrinReferral = orrinWitnessMapTarget(state);
  if (orrinReferral && orrinReferral.sectorId === sid) {
    const targetIndex = points.findIndex((point) => point.kind === 'station'
      && point.stationId === orrinReferral.stationId);
    if (targetIndex >= 0) {
      points[targetIndex] = Object.freeze({
        ...points[targetIndex],
        statusLine: orrinReferral.statusLine,
        courseLabel: orrinReferral.courseLabel,
        courseArrivalRadius: orrinReferral.courseArrivalRadius,
      });
    }
  }

  // "You are here" at system scale. The SYSTEM model shipped without a player field at all, so the
  // one question the map must always answer had no answer between LOCAL and GALAXY. You are also
  // allowed to survey a sector you are not standing in, and in that case the mark belongs OFF the
  // chart rather than at a bogus in-sector position — so carry `inSector` plus a bearing/distance
  // from the surveyed sector's origin and let the screen pin an edge indicator.
  const player = playerEntity(state);
  let playerMark = null;
  if (player && player.pos) {
    const local = globalToSectorLocalForSector(player.pos, sid);
    const inSector = currentSectorId(state) === sid;
    playerMark = {
      id: player.id,
      // Same two-frame shape as points and ownership markers, and the same frame buildLocalModel
      // already uses for ITS player field — `x`/`z` global, `drawPos` sector-local. A player mark
      // whose x/z meant something different from every other x/z in the model (and from the
      // sibling builder's identically-named field) is how the next agent reintroduces this defect.
      x: player.pos.x,
      z: player.pos.z,
      drawPos: local,
      rot: player.rot || 0,
      inSector,
      // Math.atan2(z, x) matches the canvas' own XZ convention (see the gate mark's angle above).
      bearing: inSector ? 0 : Math.atan2(local.z, local.x),
      distance: inSector ? 0 : Math.hypot(local.x, local.z),
    };
  }

  return {
    level: 'system', sectorId: sid, sectorName, ...confidence,
    zones, points, ownership, bearings, player: playerMark,
  };
}

// ---------------------------------------------------------------------------------------------
// LEVEL 3 — LOCAL: live contacts (ships/drones/stations/asteroids) around the player in the sector.
// ---------------------------------------------------------------------------------------------

/**
 * Build the local-level draw model: live entities near the player. `isHostile` is an injected
 * predicate (the screen passes scanner.isHostileToPlayer) so the pure model never imports the
 * scanner; when absent, hostility falls back to an explicit entity flag. Pure — no DOM.
 *
 * @returns {{ level:'local', sectorId, player, contacts:Array }}
 */
export function buildLocalModel(state, isHostile, options = {}) {
  const player = playerEntity(state);
  const sectorId = currentSectorId(state);
  const contacts = [];
  const hostileFn = typeof isHostile === 'function' ? isHostile : null;
  const playerTeam = player && player.team;
  for (const e of entityIterator(state)) {
    if (!e || e.alive === false || !e.pos) continue;
    if (player && e.id === player.id) continue;
    let kind = e.type;
    if (kind !== 'ship' && kind !== 'drone' && kind !== 'station' && kind !== 'asteroid') continue;
    let hostile = false;
    if (kind === 'ship' || kind === 'drone') {
      hostile = hostileFn ? !!hostileFn(e, playerTeam, state) : !!(e.data && e.data.hostile);
    }
    const mapKind = e.type === 'station' && e.data && e.data.isGate
      ? 'gate'
      : (kind === 'drone' ? 'ship' : kind);
    const homeSectorId = entityHomeSector(e);
    contacts.push({
      id: e.id,
      kind: mapKind,
      name: (e.data && e.data.name) || e.name || e.role || kind,
      x: e.pos.x, z: e.pos.z,
      vx: e.vel ? e.vel.x : 0, vz: e.vel ? e.vel.z : 0,
      rot: e.rot || 0,
      hostile,
      factionId: e.factionId || null,
      entityId: e.id,
      stationId: (e.type === 'station' && e.data && e.data.stationId) || null,
      named: !!(e.data && (e.data.namedLaneContactId || e.data.callsign || e.data.name)),
      scanHighlightUntil: kind === 'asteroid' ? (Number(e.data && e.data.scanHighlightUntil) || 0) : 0,
      scanOre: kind === 'asteroid'
        ? String((e.data && e.data.scanOreGlyph) || asteroidOreGlyph(e.data && e.data.typeId))
        : null,
      // Continuous residency keeps neighbouring sectors' furniture alive, so the LOCAL scope can
      // see gates and stations that belong to somewhere else. Flag them rather than hide them:
      // they are real and worth knowing about, but they should not compete with local marks.
      homeSectorId,
      foreign: !!(homeSectorId && sectorId && homeSectorId !== sectorId),
      // Live sensor return: full confidence, zero age. The remembered pass below fills the rest.
      remembered: false,
      ageS: 0,
      confidence: 1,
    });
  }

  // Remembered contacts (parity gap 3). Anything the intel still holds a track for but that is no
  // longer a live entity — it left sensor range, or the sector unloaded it — is emitted as a faded
  // dead-reckoned mark instead of vanishing between frames. The scope should forget gradually.
  //
  // Purity: this only READS the intel. Advancing the clock and recording observations belongs to
  // the screen (`_syncLocalIntel`), so the model stays a pure function of (state, options).
  const intel = options.intel;
  if (intel && intel.tracks && typeof intel.tracks.values === 'function') {
    const liveIds = new Set();
    for (const c of contacts) liveIds.add(String(c.id));
    const nowS = Number(intel.timeS) || 0;
    for (const track of intel.tracks.values()) {
      // A restored snapshot can yield a track without a velocity vector; dead-reckoning one would
      // produce NaN coordinates rather than throw, which is worse — it draws nothing and explains
      // nothing. Require both halves of the fix before projecting.
      if (!track || !track.position || !track.velocity || liveIds.has(String(track.id))) continue;
      const projected = projectTrack(track, nowS, intel.options);
      // Below the prune floor the mark is noise, not memory.
      if (!(projected.confidence > LOCAL_MEMORY_MIN_CONFIDENCE)) continue;
      const kind = projected.kind === 'hostile' ? 'ship' : projected.kind;
      if (kind !== 'ship' && kind !== 'station' && kind !== 'gate' && kind !== 'asteroid') continue;
      contacts.push({
        id: track.id,
        kind,
        name: projected.name || kind,
        x: projected.position.x, z: projected.position.z,
        vx: 0, vz: 0,
        rot: Number(projected.heading) || 0,
        hostile: !!projected.hostile,
        factionId: projected.factionId || null,
        entityId: null,
        stationId: null,
        named: false,
        scanHighlightUntil: 0,
        scanOre: null,
        homeSectorId: null,
        foreign: false,
        remembered: true,
        ageS: Math.max(0, Number(projected.ageS) || 0),
        confidence: Math.max(0, Math.min(1, Number(projected.confidence) || 0)),
      });
    }
  }

  return {
    level: 'local',
    sectorId,
    player: player ? { id: player.id, x: player.pos.x, z: player.pos.z, rot: player.rot || 0 } : null,
    contacts,
    ownership: buildClaimOwnershipMarkers(state, sectorId, options.claimsSystem || null),
    bearings: discoveryBearingReadouts(state, sectorId),
  };
}

// ---------------------------------------------------------------------------------------------
// Unified builder — pick the model for the active zoom level.
// ---------------------------------------------------------------------------------------------

export function buildMapModel(state, zoom, opts) {
  const level = levelForZoom(zoom);
  const options = opts || {};
  if (level === 'local') return buildLocalModel(state, options.isHostile, options);
  if (level === 'system') return buildSystemModel(state, options.sectorId, options);
  return buildGalaxyModel(state);
}

// ---------------------------------------------------------------------------------------------
// CLICK -> ui:setCourse payload resolution (pure; the screen just emits what this returns).
// ---------------------------------------------------------------------------------------------

/**
 * Resolve a clicked map target into the exact payload for the EXISTING "ui:setCourse" event.
 *
 *  - A galaxy sector node  -> a ROUTE payload  { type:'sector', sectorId, path:null }.
 *  - A station/zone/poi/contact WITH a world position -> a local WAYPOINT payload
 *      { type:<kind>, pos:{x,z}, targetEntityId?, label, reason, waypointKind, arrivalRadius, autopilot }.
 *  - A station/poi WITHOUT a live position (off-sector static entry) -> a ROUTE payload toward its
 *    sector, so the click still does something useful.
 *
 * Returns null if the target carries neither a position nor a sector to route to.
 */
export function resolveCourseTarget(target) {
  if (!target) return null;

  // A rumor ring is a selectable/readable uncertainty region, not a coordinate the map may turn
  // into navigation. Keep this guard before every positional and sector fallback below.
  if (target.courseDisabled === true || target.kind === 'rumor') return null;

  // Sector graph node -> route. A galaxy node has no world (x,z) position — only a graph position
  // and a sector id — so it is always resolved as an inter-sector route, never a local waypoint.
  if (target.kind === 'sector') {
    const sectorId = target.sectorId || target.id;
    if (!sectorId) return null;
    return { type: 'sector', sectorId, path: null, label: target.name || sectorId };
  }

  const authoredCoursePos = target.coursePos
    && Number.isFinite(target.coursePos.x)
    && Number.isFinite(target.coursePos.z)
    ? target.coursePos
    : null;
  const hasPos = authoredCoursePos || (Number.isFinite(target.x) && Number.isFinite(target.z));
  if (hasPos) {
    const kind = target.kind || 'local';
    const label = target.courseLabel || target.name || (kind === 'zone' ? 'Zone' : kind === 'gate' ? 'Gate' : kind === 'station' ? 'Station' : 'Map fix');
    const arrivalRadius = Number.isFinite(target.courseArrivalRadius)
      ? Math.max(1, target.courseArrivalRadius)
      : kind === 'gate' ? 72 : kind === 'station' ? 90 : kind === 'claim' ? 170 : kind === 'zone' ? Math.max(60, (target.radius || 0) * 0.5) : 48;
    const payload = {
      type: kind,
      pos: authoredCoursePos
        ? { x: authoredCoursePos.x, z: authoredCoursePos.z }
        : { x: target.x, z: target.z },
      label,
      reason: label,
      waypointKind: kind === 'zone' ? 'zone' : kind === 'station' || kind === 'gate' ? 'nav' : 'local',
      arrivalRadius,
      autopilot: true,
    };
    if (target.entityId != null) payload.targetEntityId = target.entityId;
    if (target.targetEntityId != null) payload.targetEntityId = target.targetEntityId;
    if (target.stationId) payload.stationId = target.stationId;
    const gateDest = target.targetSectorId || target.gateTo || null;
    if (kind === 'gate' && gateDest) payload.sectorId = gateDest;
    return payload;
  }

  // No live position but we know the sector -> route toward it.
  const sectorId = target.sectorId || target.targetSectorId || null;
  if (sectorId) return { type: 'sector', sectorId, path: null, label: target.name || sectorId };
  return null;
}

/**
 * True when `targetSectorId` is a direct graph neighbor of the player's current sector.
 * Pure: used by the inspector primary action and headless contract tests.
 */
export function isOneHopNeighbor(state, targetSectorId) {
  if (!state || !targetSectorId) return false;
  const cur = currentSectorId(state);
  if (!cur || cur === targetSectorId) return false;
  const rec = sectorRecordById(state, cur);
  const neighbors = rec && Array.isArray(rec.neighbors) ? rec.neighbors : [];
  return neighbors.includes(targetSectorId);
}

/**
 * Resolve the player-facing primary inspector action for a selected map target.
 * Returns { kind, label, targetSectorId?, coursePayload? } or null.
 *
 * kind:
 *   'jump'     — one-hop intentional gate jump (emits world:requestJump + course)
 *   'route'    — multi-hop / non-neighbor sector course plot
 *   'waypoint' — local autopilot fix (station/gate/zone/contact)
 */
export function resolveGalaxyMapPrimaryAction(state, target) {
  if (!target) return null;
  const coursePayload = resolveCourseTarget(target);

  if (target.kind === 'sector') {
    const sectorId = target.sectorId || target.id;
    if (!sectorId) return null;
    if (isOneHopNeighbor(state, sectorId)) {
      return {
        kind: 'jump',
        label: 'Set Course & Jump',
        targetSectorId: sectorId,
        coursePayload: coursePayload || { type: 'sector', sectorId, path: null, label: target.name || sectorId },
      };
    }
    return {
      kind: 'route',
      label: 'Plot Course',
      targetSectorId: sectorId,
      coursePayload: coursePayload || { type: 'sector', sectorId, path: null, label: target.name || sectorId },
    };
  }

  if (target.kind === 'gate') {
    const dest = target.targetSectorId || target.gateTo || null;
    // In-range jump from a selected physical gate (player already approached).
    if (dest && isOneHopNeighbor(state, dest) && isPlayerInGateRange(state, target)) {
      return {
        kind: 'jump',
        label: 'Jump',
        targetSectorId: dest,
        coursePayload: coursePayload || { type: 'sector', sectorId: dest, path: null, label: target.name || dest },
      };
    }
    return {
      kind: 'waypoint',
      label: 'Set Waypoint',
      targetSectorId: dest,
      coursePayload,
    };
  }

  if (!coursePayload) return null;
  if (coursePayload.type === 'sector' && coursePayload.sectorId) {
    if (isOneHopNeighbor(state, coursePayload.sectorId)) {
      return {
        kind: 'jump',
        label: 'Set Course & Jump',
        targetSectorId: coursePayload.sectorId,
        coursePayload,
      };
    }
    return {
      kind: 'route',
      label: 'Plot Course',
      targetSectorId: coursePayload.sectorId,
      coursePayload,
    };
  }

  let label = 'Track Target';
  if (target.kind === 'station') label = 'Set Waypoint';
  else if (target.kind === 'claim') label = 'Set Base Waypoint';
  else if (target.kind === 'zone') label = 'Align Autopilot';
  else if (target.kind === 'waypoint') label = 'Track Waypoint';
  else if (target.kind === 'bearing') label = 'Set Bearing';
  return { kind: 'waypoint', label, coursePayload };
}

/**
 * Resolve the PLOT-ONLY action for a selected map target — a course laid, never flown.
 *
 * ─── WHY THIS EXISTS, AND WHY IT IS NOT A CHANGE TO THE PRIMARY ACTION ────────────────────────
 *
 * ADR D6 says plot and engage are separate actions, unqualified. The primary action honours that
 * for a NON-neighbour ("Plot Course") and cannot for a neighbour, where it is deliberately
 * "Set Course & Jump" — a commitment. That primary is correct and is pinned by
 * `test/galaxy-map-gate-jump-seam.test.mjs`; a one-press jump to the sector next door is the right
 * default and is not touched here.
 *
 * The gap it left is that for a neighbour there was NO way to merely plot. That matters more than
 * it sounds: the route follower is this program's centrepiece, `nav:engageRoute` is its only
 * production trigger, and the Engage control only lights up once `nav.route` holds legs. So for
 * every adjacent destination — including the canonical Helios→Ceres contract — the follower was
 * unreachable. A headline system you cannot get to is not shipped.
 *
 * Worse, the chart already rendered a button LABELLED "Plot course" (the place-action row) that
 * resolved the primary action and then dismissed the chart. On a neighbour that button emitted
 * `world:requestJump` — it committed the transition while promising a plot, which is precisely the
 * fake-success this screen's own contract forbids.
 *
 * This resolver is therefore additive: same shipped emitter, same `world:requestRoute` intent, and
 * it never returns a `jump`. Availability is reported with a REASON in both states, so a control
 * driven by it is visibly unavailable and says why rather than silently doing nothing.
 *
 * @returns {{kind:'route', label:string, available:boolean, reason:string,
 *            targetSectorId:string|null, coursePayload:object|null, redundant:boolean}}
 */
export function resolveGalaxyMapPlotAction(state, target) {
  const unavailable = (reason) => ({
    kind: 'route',
    label: 'Plot Course',
    available: false,
    reason,
    targetSectorId: null,
    coursePayload: null,
    redundant: false,
  });

  if (!target) return unavailable('Select a sector on the chart to plot a course to it');
  if (target.courseDisabled === true || target.kind === 'rumor') {
    return unavailable('This is an approximate search area — fly the ring manually and pulse the scanner');
  }

  const primary = resolveGalaxyMapPrimaryAction(state, target);
  const coursePayload = resolveCourseTarget(target);
  const sectorId = (target.kind === 'sector' ? (target.sectorId || target.id) : null)
    || (primary && primary.targetSectorId)
    || (coursePayload && coursePayload.type === 'sector' ? coursePayload.sectorId : null)
    || target.sectorId
    || target.targetSectorId
    || null;

  if (!sectorId) {
    return unavailable('This mark is a local fix, not a destination — a course needs a sector to plot to');
  }
  const here = currentSectorId(state);
  if (here && sectorId === here) {
    return unavailable('You are already in this sector — nothing to plot');
  }

  return {
    kind: 'route',
    label: 'Plot Course',
    available: true,
    // Says what it does AND what it deliberately does not do. The separation is only real to a
    // player if the control admits it is not going to fly them anywhere.
    reason: 'Lay the course without flying it — Engage hands it to the route follower',
    targetSectorId: sectorId,
    // ALWAYS the sector payload, never the positional one. `world._onSetCourse` NULLS `nav.route`
    // when it is handed a `pos` (it treats that as a local autopilot fix), so plotting through a
    // positional payload would wipe the very route it just planned.
    coursePayload: { type: 'sector', sectorId, path: null, label: target.name || sectorId },
    // True when the primary action ALREADY is this exact plot, so a secondary control can hide
    // instead of rendering a second button that does the same thing.
    redundant: !!(primary && primary.kind === 'route' && primary.targetSectorId === sectorId),
  };
}

/** Live proximity check: player is inside the physical gate's interact range. */
export function isPlayerInGateRange(state, gateTarget) {
  if (!state || !gateTarget) return false;
  const player = playerEntity(state);
  if (!player || !player.pos) return false;
  if (gateTarget.entityId == null || !state.entities || typeof state.entities.get !== 'function') return false;
  const gateEnt = state.entities.get(gateTarget.entityId);
  if (!gateEnt || gateEnt.alive === false || !gateEnt.pos || !gateEnt.data || !gateEnt.data.isGate) return false;
  const data = gateEnt.data || {};
  const range = ((data.dockRadius || gateEnt.radius || 70) + (player.radius || 0)) * 1.5 + 28;
  const d = Math.hypot(player.pos.x - gateEnt.pos.x, player.pos.z - gateEnt.pos.z);
  return d <= range;
}

/**
 * Emit the primary action intents for a resolved map action (pure emitter side-effects only).
 * Returns true when an intent was emitted.
 */
export function emitGalaxyMapPrimaryAction(bus, action) {
  if (!bus || !action) return false;
  if (action.kind === 'jump' && action.targetSectorId) {
    bus.emit('world:requestJump', { targetSectorId: action.targetSectorId, via: 'gate' });
    const course = action.coursePayload || { type: 'sector', sectorId: action.targetSectorId, path: null };
    bus.emit('ui:setCourse', course);
    bus.emit('toast', {
      text: `Course set: jump to ${action.targetSectorId}`,
      kind: 'info',
      ttl: 3,
    });
    return true;
  }
  if (!action.coursePayload) return false;
  if (action.coursePayload.type === 'sector' && action.coursePayload.sectorId) {
    bus.emit('world:requestRoute', { targetSectorId: action.coursePayload.sectorId, mode: 'fuel' });
  }
  bus.emit('ui:setCourse', action.coursePayload);
  bus.emit('toast', {
    text: 'Course set: ' + (action.coursePayload.label || 'target'),
    kind: 'info',
    ttl: 3,
  });
  return true;
}

// -------------------------------------------------------------------------------------------
// PLOT vs ENGAGE (atlas W1-8). Two separate actions, deliberately (ADR D6 and the product
// direction): plotting shows you the route, engaging hands it to the route follower. Never one
// button — a pilot must be able to compare a route without committing to fly it.
//
// The primary action above is PLOT. This is ENGAGE, and it is the seam that gives
// `src/systems/routeFollower.js` its only production trigger: nothing else in the tree emits
// `nav:engageRoute`. Until this existed the follower was registered, unit-proven and unreachable,
// which is the "producer landed, consumer did not" pattern the ledger tracks.
// -------------------------------------------------------------------------------------------

/**
 * Decide what the engage control should say and do, from state alone. Pure so the whole matrix is
 * testable without a DOM: an unavailable action must be VISIBLY unavailable and must EXPLAIN WHY,
 * never a silent no-op and never a fake success state.
 *
 * ─── SHAPE CORRECTION (W2-D, 2026-07-19) — this function read a shape nothing writes ───────────
 *
 * It previously read a `phase` field off the executor, a `legCount` scalar off the executor, and a
 * `path` array off the route. **None of those three fields exists at runtime.**
 * `routeFollower.makeExecutor` (`routeFollower.js:171`) writes `status` and a `legs` ARRAY;
 * `world.computeRoute` (`world.js:2168`) returns `{ legs, totalFuel, totalHops }` and never a
 * `path`. The sibling adapter in this very file, `readRouteExecutorForMap`, reads `status`/`legs`
 * correctly — two adapters, one file, disagreeing about one subtree.
 *
 * Reproduced before fixing, driving real `makeExecutor` / `computeRoute` shapes: transiting,
 * interrupted and merely-plotted all returned the IDENTICAL `{label:'Engage Route',
 * reason:'Route plotted — ready to fly'}`. So **Disengage and Resume Route were unreachable in
 * game** — the pilot could engage a route and never call it off from the chart — and the leg count
 * never appeared. `check:route-engage` stayed green only because its fixtures hand-built
 * `{phase, legCount, path}`, encoding the wrong contract into the assertion.
 *
 * The fix reads what runtime actually writes. It deliberately does NOT accept both shapes: a
 * tolerant reader would keep a fiction alive that no producer emits, and would let the next drift
 * pass silently for the same reason this one did.
 *
 * @returns {{visible:boolean, enabled:boolean, label:string, reason:string, event:string|null}}
 */
export function resolveRouteEngageAction(state) {
  const nav = state && state.nav;
  const executor = nav && nav.executor;
  const status = executor && executor.status;
  const hidden = { visible: false, enabled: false, label: 'Engage Route', reason: '', event: null };
  if (!nav) return hidden;

  // Already flying it: the control becomes the way out, so a pilot is never trapped in a route.
  if (status && status !== 'idle' && status !== 'arrived') {
    const leg = executor && Number.isFinite(executor.legIndex) ? executor.legIndex + 1 : null;
    const total = executorLegCount(executor);
    const where = leg && total ? ` (leg ${leg}/${total})` : '';
    if (status === 'interrupted') {
      const why = executor && executor.interruptReason
        ? ` — ${String(executor.interruptReason).replace(/[-_]+/g, ' ')}`
        : '';
      return { visible: true, enabled: true, label: 'Resume Route', reason: `Interrupted${where}${why} — itinerary kept`, event: 'nav:engageRoute' };
    }
    return { visible: true, enabled: true, label: 'Disengage', reason: `${titleCasePhase(status)}${where}`, event: 'nav:abortRoute' };
  }

  if (!nav.route) {
    return { visible: true, enabled: false, label: 'Engage Route', reason: 'No route plotted — set a course to a sector first', event: null };
  }
  const legs = routeLegCount(nav.route);
  return {
    visible: true,
    enabled: true,
    label: 'Engage Route',
    reason: legs ? `${legs} leg${legs === 1 ? '' : 's'} plotted — ready to fly` : 'Route plotted — ready to fly',
    event: 'nav:engageRoute',
  };
}

/** Legs on a plotted route. `world.computeRoute` returns `{legs:[...]}` — there is no `path`. */
function routeLegCount(route) {
  return route && Array.isArray(route.legs) ? route.legs.length : 0;
}

/** Legs on a live executor. `makeExecutor` stores the array; only the emitted summary has a count. */
function executorLegCount(executor) {
  return executor && Array.isArray(executor.legs) ? executor.legs.length : 0;
}

function titleCasePhase(phase) {
  const s = String(phase || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Emit the resolved engage/disengage intent. Returns false when the action is unavailable. */
export function emitRouteEngageAction(bus, action) {
  if (!bus || !action || !action.enabled || !action.event) return false;
  bus.emit(action.event, action.event === 'nav:abortRoute' ? { reason: 'manual' } : {});
  return true;
}

// ---------------------------------------------------------------------------------------------
// DOM / canvas screen shell. Everything below is guarded so the module imports cleanly in Node.
// ---------------------------------------------------------------------------------------------

const HAS_DOC = typeof document !== 'undefined';
const STYLE_ID = 'sf-galaxymap-style';

const CSS = `
/* SURVEY TABLE — the map adopts the menu-fascia / station-workbench material (opaque warm
   near-black, hairline steel edges, amber worklight) as a full-bleed instrument layout.
   Related, not identical (GDD §9.4). Token values mirror styles/menu.css §1 — keep in sync. */
#sf-galaxymap {
  --panel: #121518;
  --panel-2: #171b1f;
  --panel-edge: #3b403f;
  --panel-edge-2: #66645d;
  --ink: #f1ede2;
  --ink-dim: #b3afa2;
  --ink-mute: #8a877d;
  --accent: #db9838;
  --accent-2: #56bbb2;
  --accent-3: #ffc064;
  --good: #58c98a;
  --warn: #e3a13d;
  --danger: #ed6961;
  --mono: "IBM Plex Mono", "Consolas", ui-monospace, monospace;
  --mf-display: "Saira SemiCondensed", "Segoe UI", system-ui, sans-serif;
  --mf-ui: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
  --mf-line-1: #292d2e;
  --mf-line-2: #3b403f;
  --mf-line-3: #66645d;
  --mf-stamp: #8a857a;
  --mf-worklight-dim: rgba(219, 152, 56, .12);
  --gm-apron-h: clamp(168px, 26vh, 232px);

  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(ellipse at 50% 118%, rgba(219, 152, 56, .04), transparent 55%),
    linear-gradient(180deg, #14171a 0%, #0e1113 30%, #0b0d0f 100%);
  color: var(--ink);
  font-family: var(--mf-ui);
  user-select: none;
}

/* ---- Header: machined strip with worklight edge -------------------------------------------- */
#sf-galaxymap .gm-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 0 16px;
  border-bottom: 1px solid var(--mf-line-2);
  background:
    repeating-linear-gradient(112deg, rgba(255, 255, 255, .008) 0 1px, transparent 1px 7px),
    linear-gradient(180deg, #191d20 0%, #121518 70%, #101315 100%);
  min-height: var(--gm-header-h, 58px);
  box-sizing: border-box;
}
#sf-galaxymap .gm-head::before {
  content: "";
  position: absolute;
  top: 0;
  left: 22px;
  width: 30%;
  height: 3px;
  background: linear-gradient(90deg, var(--accent), #6b4a26 68%, transparent);
  pointer-events: none;
}

#sf-galaxymap .gm-title-lockup {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 0 0 auto;
}
#sf-galaxymap .gm-title {
  font-family: var(--mf-display);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--ink);
}
#sf-galaxymap .gm-stamp {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--mf-stamp);
}

#sf-galaxymap .gm-search-container {
  position: relative;
  flex: 1;
  max-width: 340px;
}
#sf-galaxymap .gm-search-input {
  width: 100%;
  box-sizing: border-box;
  background: #0c0e10;
  border: 1px solid var(--mf-line-2);
  border-radius: 2px;
  color: var(--ink);
  padding: 7px 30px 7px 10px;
  font-family: var(--mf-ui);
  font-size: 12px;
  transition: border-color .12s ease;
}
#sf-galaxymap .gm-search-input::placeholder { color: var(--ink-mute); }
#sf-galaxymap .gm-search-input:focus {
  outline: none;
  border-color: var(--accent-3);
  box-shadow: inset 0 0 0 1px var(--accent-3);
}
#sf-galaxymap .gm-search-kbd {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-mute);
  border: 1px solid var(--mf-line-2);
  border-radius: 2px;
  padding: 1px 5px;
  pointer-events: none;
}
#sf-galaxymap .gm-search-results {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background:
    linear-gradient(180deg, #191d20 0%, #121518 60%, #0e1113 100%);
  border: 1px solid var(--mf-line-2);
  border-radius: 2px;
  max-height: 260px;
  overflow-y: auto;
  z-index: 100;
  filter: drop-shadow(0 14px 22px rgba(0, 0, 0, .55));
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
}
#sf-galaxymap .gm-search-item {
  position: relative;
  padding: 8px 12px 8px 18px;
  cursor: pointer;
  border-bottom: 1px solid var(--mf-line-1);
  transition: background .12s ease;
}
#sf-galaxymap .gm-search-item::before {
  content: "";
  position: absolute;
  left: 7px;
  top: 50%;
  width: 6px;
  height: 2px;
  transform: translateY(-50%);
  background: #5a574f;
}
#sf-galaxymap .gm-search-item:hover,
#sf-galaxymap .gm-search-item.selected {
  background: var(--mf-worklight-dim);
}
#sf-galaxymap .gm-search-item:hover::before,
#sf-galaxymap .gm-search-item.selected::before { background: var(--accent-3); }
#sf-galaxymap .gm-search-item-name {
  font-family: var(--mf-ui);
  font-weight: 600;
  font-size: 12px;
  color: var(--ink);
}
#sf-galaxymap .gm-search-item-detail {
  font-family: var(--mono);
  color: var(--ink-mute);
  font-size: 12px;
  margin-top: 2px;
}

/* ---- Continuity rail: one instrument, three stations --------------------------------------- */
#sf-galaxymap .gm-rail {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}
#sf-galaxymap .gm-rail-track {
  position: relative;
  width: 96px;
  height: 2px;
  background: var(--mf-line-2);
}
#sf-galaxymap .gm-rail-track::before,
#sf-galaxymap .gm-rail-track::after {
  content: "";
  position: absolute;
  top: -2px;
  width: 2px;
  height: 6px;
  background: var(--mf-line-3);
}
#sf-galaxymap .gm-rail-track::before { left: 0; }
#sf-galaxymap .gm-rail-track::after { right: 0; }
#sf-galaxymap .gm-rail-marker {
  position: absolute;
  top: -3px;
  left: 100%;
  width: 8px;
  height: 8px;
  transform: translateX(-50%) rotate(45deg);
  background: var(--accent);
  transition: left .18s ease;
}
#sf-galaxymap .gm-scale-buttons {
  display: flex;
  gap: 4px;
}
#sf-galaxymap .gm-scale-btn {
  min-width: 58px;
  padding: 5px 9px;
  background: transparent;
  border: 1px solid var(--mf-line-1);
  border-radius: 2px;
  color: var(--ink-mute);
  cursor: pointer;
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .12em;
  text-transform: uppercase;
  transition: border-color .12s ease, color .12s ease, background .12s ease;
}
#sf-galaxymap .gm-scale-btn:hover { color: var(--ink); border-color: var(--mf-line-3); }
#sf-galaxymap .gm-scale-btn:focus-visible {
  outline: none;
  border-color: var(--accent-3);
  box-shadow: inset 0 0 0 1px var(--accent-3);
  color: var(--ink);
}
#sf-galaxymap .gm-scale-btn.is-current,
#sf-galaxymap .gm-scale-btn[aria-pressed="true"] {
  color: var(--accent-3);
  border-color: #8a6a3c;
  background: var(--mf-worklight-dim);
  font-weight: 500;
}
#sf-galaxymap .gm-level {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--ink-mute);
  white-space: nowrap;
}
#sf-galaxymap .gm-level b { color: var(--accent); font-weight: 500; }

#sf-galaxymap .gm-weather {
  min-width: 182px;
  max-width: 300px;
  display: grid;
  gap: 3px;
  align-self: center;
}
#sf-galaxymap .gm-weather-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
#sf-galaxymap .gm-weather-word {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--accent-3);
}
#sf-galaxymap .gm-weather[data-weather-level="quiet"] .gm-weather-word { color: var(--accent-2); }
#sf-galaxymap .gm-weather[data-weather-level="working"] .gm-weather-word { color: var(--warn); }
#sf-galaxymap .gm-weather[data-weather-level="hot"] .gm-weather-word { color: var(--danger); }
#sf-galaxymap .gm-weather-data {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .08em;
  color: var(--ink-dim);
}
#sf-galaxymap .gm-weather-bar {
  position: relative;
  height: 5px;
  border: 1px solid var(--mf-line-2);
  background: #0f1214;
  overflow: hidden;
}
#sf-galaxymap .gm-weather-seg {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
}
#sf-galaxymap .gm-weather-seg--combat {
  background: linear-gradient(90deg, rgba(237, 105, 97, .9), rgba(227, 161, 61, .92));
}
#sf-galaxymap .gm-weather-seg--civil {
  background: linear-gradient(90deg, rgba(86, 187, 178, .52), rgba(86, 187, 178, .18));
  mix-blend-mode: screen;
}
#sf-galaxymap .gm-weather-terms {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .04em;
  color: var(--ink-mute);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

#sf-galaxymap .gm-hint-btn {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--mf-line-2);
  border-radius: 2px;
  color: var(--ink-mute);
  cursor: pointer;
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1;
  transition: border-color .12s ease, color .12s ease;
}
#sf-galaxymap .gm-hint-btn:hover { border-color: var(--mf-line-3); color: var(--ink); }
#sf-galaxymap .gm-hint-btn:focus-visible {
  outline: none;
  border-color: var(--accent-3);
  box-shadow: inset 0 0 0 1px var(--accent-3);
  color: var(--ink);
}
#sf-galaxymap .gm-hint-btn[aria-expanded="true"] {
  color: var(--accent-3);
  border-color: #8a6a3c;
  background: var(--mf-worklight-dim);
}
#sf-galaxymap .gm-close {
  flex: 0 0 auto;
  background: linear-gradient(180deg, #1b1f22, #131618);
  border: 1px solid var(--mf-line-2);
  border-radius: 2px;
  color: var(--ink-dim);
  padding: 6px 14px;
  cursor: pointer;
  font-family: var(--mf-ui);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: .1em;
  text-transform: uppercase;
  transition: border-color .12s ease, color .12s ease, background .12s ease;
}
#sf-galaxymap .gm-close:hover { border-color: #8a6a3c; color: var(--ink); background: linear-gradient(180deg, #23272a, #17191c); }
#sf-galaxymap .gm-close:focus-visible {
  outline: none;
  border-color: var(--accent-3);
  box-shadow: inset 0 0 0 1px var(--accent-3);
  color: var(--ink);
}

/* ---- Hints popover (on demand, never persistent) ------------------------------------------- */
#sf-galaxymap .gm-hints {
  position: absolute;
  top: calc(100% + 8px);
  right: 14px;
  width: 252px;
  z-index: 120;
  background:
    radial-gradient(ellipse at 50% 112%, rgba(219, 152, 56, .05), transparent 52%),
    linear-gradient(180deg, #191d20 0%, #121518 60%, #0e1113 100%);
  border: 1px solid var(--mf-line-2);
  border-top-color: #4c4a44;
  border-radius: 2px;
  padding: 12px 14px;
  filter: drop-shadow(0 16px 26px rgba(0, 0, 0, .55));
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
}
#sf-galaxymap .gm-hints-title {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin-bottom: 8px;
}
#sf-galaxymap .gm-hint-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 3px 0;
  font-size: 12px;
  color: var(--ink-dim);
}
#sf-galaxymap .gm-hint-row kbd {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--accent-3);
  border: 1px solid var(--mf-line-2);
  border-radius: 2px;
  padding: 1px 5px;
  background: #0c0e10;
}
#sf-galaxymap .gm-hints-note {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--mf-line-1);
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-mute);
}

/* ---- Body ----------------------------------------------------------------------------------- */
#sf-galaxymap .gm-body-container {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: var(--sf-stage-max, 1680px);
  margin: 0 auto;
}

/* ---- Left rail: overlays + market intel ----------------------------------------------------- */
#sf-galaxymap .gm-left-rail {
  width: 236px;
  box-sizing: border-box;
  border-right: 1px solid var(--mf-line-2);
  background:
    repeating-linear-gradient(112deg, rgba(255, 255, 255, .006) 0 1px, transparent 1px 7px),
    linear-gradient(180deg, #14171a 0%, #101315 100%);
  display: flex;
  flex-direction: column;
  padding: 14px;
  gap: 10px;
  overflow-y: auto;
}
#sf-galaxymap .gm-rail-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .22em;
  text-transform: uppercase;
  color: var(--ink-mute);
  padding-bottom: 2px;
}
#sf-galaxymap .gm-rail-title::after {
  content: "";
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--mf-line-2), transparent);
}
#sf-galaxymap .gm-layer-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
#sf-galaxymap .gm-layer-bank {
  border: 1px solid var(--mf-line-1);
  background: linear-gradient(180deg, rgba(255, 255, 255, .012), rgba(255, 255, 255, 0));
  padding: 7px 7px 6px;
}
#sf-galaxymap .gm-layer-bank-title {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin-bottom: 6px;
  opacity: .95;
}
#sf-galaxymap .gm-layer-btn {
  display: grid;
  grid-template-columns: 16px 1fr 12px;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  background: linear-gradient(180deg, #15181b, #101315);
  border: 1px solid var(--mf-line-1);
  border-radius: 2px;
  cursor: pointer;
  text-align: left;
  font-family: var(--mf-ui);
  transition: border-color .12s ease, background .12s ease;
}
#sf-galaxymap .gm-layer-btn:hover { border-color: var(--mf-line-3); }
#sf-galaxymap .gm-layer-btn:focus-visible {
  outline: none;
  border-color: var(--accent-3);
  box-shadow: inset 0 0 0 1px var(--accent-3);
}
#sf-galaxymap .gm-layer-btn .gm-layer-ico {
  display: inline-flex;
  width: 14px;
  height: 14px;
  color: var(--ink-mute);
  transition: color .12s ease;
}
#sf-galaxymap .gm-layer-btn .gm-layer-ico svg { width: 14px; height: 14px; display: block; }
#sf-galaxymap .gm-layer-btn .gm-layer-name {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: .09em;
  text-transform: uppercase;
  color: var(--ink-mute);
  transition: color .12s ease;
}
#sf-galaxymap .gm-layer-btn .gm-layer-state {
  width: 8px;
  height: 8px;
  justify-self: end;
  transform: rotate(45deg);
  border: 1px solid var(--mf-line-3);
  background: transparent;
  transition: background .12s ease, border-color .12s ease;
}
#sf-galaxymap .gm-layer-btn.active { border-color: #8a6a3c; background: linear-gradient(180deg, #1a1d20, #131614); }
#sf-galaxymap .gm-layer-btn.active .gm-layer-ico { color: var(--accent-3); }
#sf-galaxymap .gm-layer-btn.active .gm-layer-name { color: var(--ink); }
#sf-galaxymap .gm-layer-btn[data-layer="route"] .gm-layer-state    { border-color: #e8a33d; }
#sf-galaxymap .gm-layer-btn[data-layer="mission"] .gm-layer-state  { border-color: #ffc064; }
#sf-galaxymap .gm-layer-btn[data-layer="market"] .gm-layer-state   { border-color: #58c98a; }
#sf-galaxymap .gm-layer-btn[data-layer="events"] .gm-layer-state   { border-color: #d184ea; }
#sf-galaxymap .gm-layer-btn[data-layer="security"] .gm-layer-state { border-color: #ed6961; }
#sf-galaxymap .gm-layer-btn[data-layer="faction"] .gm-layer-state  { border-color: #b092e8; }
#sf-galaxymap .gm-layer-btn[data-layer="hazard"] .gm-layer-state   { border-color: #e0763d; }
#sf-galaxymap .gm-layer-btn[data-layer="services"] .gm-layer-state { border-color: #56bbb2; }
#sf-galaxymap .gm-layer-btn[data-layer="holdings"] .gm-layer-state { border-color: #8ec47a; }
#sf-galaxymap .gm-layer-btn[data-layer="discovery"] .gm-layer-state{ border-color: #8ea6c8; }
#sf-galaxymap .gm-layer-btn[data-layer="route"].active .gm-layer-state    { background: #e8a33d; }
#sf-galaxymap .gm-layer-btn[data-layer="mission"].active .gm-layer-state  { background: #ffc064; }
#sf-galaxymap .gm-layer-btn[data-layer="market"].active .gm-layer-state   { background: #58c98a; }
#sf-galaxymap .gm-layer-btn[data-layer="events"].active .gm-layer-state   { background: #d184ea; }
#sf-galaxymap .gm-layer-btn[data-layer="security"].active .gm-layer-state { background: #ed6961; }
#sf-galaxymap .gm-layer-btn[data-layer="faction"].active .gm-layer-state  { background: #b092e8; }
#sf-galaxymap .gm-layer-btn[data-layer="hazard"].active .gm-layer-state   { background: #e0763d; }
#sf-galaxymap .gm-layer-btn[data-layer="services"].active .gm-layer-state { background: #56bbb2; }
#sf-galaxymap .gm-layer-btn[data-layer="holdings"].active .gm-layer-state { background: #8ec47a; }
#sf-galaxymap .gm-layer-btn[data-layer="discovery"].active .gm-layer-state{ background: #8ea6c8; }

#sf-galaxymap .gm-rail-commodity {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}
#sf-galaxymap .gm-rail-commodity label {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .18em;
  color: var(--ink-mute);
  text-transform: uppercase;
}
#sf-galaxymap .gm-rail-commodity .sf-select__field {
  background: #0c0e10;
  border: 1px solid var(--mf-line-2);
  border-radius: 2px;
  color: var(--ink);
  padding: 6px 8px;
  font-family: var(--mono);
  font-size: 12px;
  outline: none;
}
#sf-galaxymap .gm-rail-commodity .sf-select__field:focus-visible {
  border-color: var(--accent-3);
  box-shadow: inset 0 0 0 1px var(--accent-3);
}

#sf-galaxymap .gm-rail-legend {
  border-top: 1px solid var(--mf-line-1);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
#sf-galaxymap .gm-legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--ink-mute);
}
#sf-galaxymap .gm-legend-row .gm-legend-ico {
  display: inline-flex;
  width: 13px;
  height: 13px;
  color: var(--accent-2);
  flex: 0 0 auto;
}
#sf-galaxymap .gm-legend-row .gm-legend-ico svg { width: 13px; height: 13px; display: block; }
/* Chart marks are navigation grammar, so they carry the amber action hue, not infrastructure teal. */
#sf-galaxymap .gm-legend-row .gm-legend-ico--mark { color: var(--accent); }

#sf-galaxymap .gm-rail-footer {
  margin-top: auto;
  border-top: 1px solid var(--mf-line-1);
  padding-top: 10px;
}
#sf-galaxymap .gm-hint-title {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin-bottom: 5px;
}
#sf-galaxymap .gm-hint-text {
  font-size: 12px;
  color: var(--ink-mute);
  line-height: 1.55;
}
#sf-galaxymap .gm-hint-text b { color: var(--ink-dim); font-weight: 500; }

/* ---- Viewport -------------------------------------------------------------------------------- */
#sf-galaxymap .gm-viewport {
  flex: 1;
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
#sf-galaxymap canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
}

/* ---- Right inspector ------------------------------------------------------------------------- */
#sf-galaxymap .gm-right-inspector {
  width: 320px;
  box-sizing: border-box;
  border-left: 1px solid var(--mf-line-2);
  background:
    repeating-linear-gradient(112deg, rgba(255, 255, 255, .006) 0 1px, transparent 1px 7px),
    linear-gradient(180deg, #14171a 0%, #101315 100%);
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  overflow-y: auto;
}
#sf-galaxymap .gm-inspector-header {
  display: flex;
  align-items: center;
  gap: 9px;
  font-family: var(--mf-display);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ink);
  border-bottom: 1px solid var(--mf-line-1);
  padding-bottom: 8px;
}
#sf-galaxymap .gm-inspector-header::before {
  content: "";
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  background: var(--accent);
  clip-path: polygon(0 0, 78% 0, 100% 22%, 100% 100%, 22% 100%, 0 78%);
}
#sf-galaxymap .gm-inspector-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 12px;
  line-height: 1.45;
}
#sf-galaxymap .gm-inspector-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
#sf-galaxymap .gm-inspector-empty {
  color: var(--ink-mute);
  font-size: 12px;
  line-height: 1.6;
}
#sf-galaxymap .gm-inspector-empty b { color: var(--ink-dim); font-weight: 500; }
#sf-galaxymap .gm-ins-section {
  border-bottom: 1px solid var(--mf-line-1);
  padding-bottom: 10px;
}
#sf-galaxymap .gm-ins-section:last-child { border-bottom: none; }
#sf-galaxymap .gm-ins-title {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin-bottom: 6px;
}
#sf-galaxymap .gm-ins-kind {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--mf-stamp);
}
#sf-galaxymap .gm-ins-target-name {
  font-family: var(--mf-display);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--ink);
  margin-bottom: 3px;
}
#sf-galaxymap .gm-ins-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  padding: 2px 0;
  font-size: 12px;
  color: var(--ink-dim);
}
#sf-galaxymap .gm-ins-row-val {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--ink);
  text-align: right;
}
#sf-galaxymap .gm-ins-row-val.fresh { color: var(--accent-3); }
#sf-galaxymap .gm-ins-row-val.mid { color: var(--ink); }
#sf-galaxymap .gm-ins-row-val.old { color: var(--ink-mute); font-style: italic; }
#sf-galaxymap .gm-ins-note {
  color: var(--ink-mute);
  font-size: 12px;
  line-height: 1.5;
}
#sf-galaxymap .gm-ins-note b { color: var(--ink-dim); }

#sf-galaxymap .gm-ins-btn {
  position: relative;
  width: 100%;
  padding: 10px 14px;
  margin-top: 2px;
  background: linear-gradient(180deg, #ffc064, #db9838);
  border: 1px solid #6b4a26;
  border-radius: 2px;
  clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px));
  color: #1c1206;
  cursor: pointer;
  font-family: var(--mf-ui);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .1em;
  text-transform: uppercase;
  transition: background .12s ease, transform .1s ease;
}
#sf-galaxymap .gm-ins-btn:hover:not(:disabled) { background: linear-gradient(180deg, #ffd284, #e6a643); }
#sf-galaxymap .gm-ins-btn:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px #1c1206;
}
#sf-galaxymap .gm-ins-btn:active:not(:disabled) { transform: translateY(1px); }
#sf-galaxymap .gm-ins-btn:disabled { opacity: .42; cursor: default; }

/* W1-8 engage control. Plot keeps the filled-gold primary; engage sits one step quieter as a
   brass outline, so the two reads as "look at this route" then "commit to it" rather than as two
   competing calls to action. Bright gold is reserved for the tracked objective and the ACTIVE
   route, so the fill only arrives once a route is genuinely engaged (below). */
#sf-galaxymap #gm-engage-route-btn {
  background: transparent;
  border-color: #6b4a26;
  color: #e2b271;
}
#sf-galaxymap #gm-engage-route-btn:hover:not(:disabled) {
  background: rgba(219, 152, 56, .16);
  color: #ffd08a;
}
/* Engaged: this control now represents the active route, which is what earns the gold. */
#sf-galaxymap #gm-engage-route-btn[data-engage-state="nav:abortRoute"] {
  background: linear-gradient(180deg, #ffc064, #db9838);
  color: #1c1206;
}
#sf-galaxymap #gm-engage-route-btn[data-engage-state="nav:abortRoute"]:hover:not(:disabled) {
  background: linear-gradient(180deg, #ffd284, #e6a643);
  color: #1c1206;
}
/* Secondary plot control (ADR D6). It sits BELOW the committing primary and reads quieter than
   it — a dashed brass outline, no fill — because it is the deliberate, reversible option next to
   the decisive one. The dash is the load-bearing signal, not the hue: "provisional" survives
   forced-colors and colour-blindness, where a slightly different brass would not. */
#sf-galaxymap #gm-plot-course-btn {
  background: transparent;
  border: 1px dashed #6b4a26;
  color: #d8ae74;
}
#sf-galaxymap #gm-plot-course-btn:hover:not(:disabled) {
  background: rgba(219, 152, 56, .12);
  color: #ffd08a;
}
#sf-galaxymap .gm-plot-reason {
  min-height: 0;
  margin-top: 4px;
  color: #9a8a72;
  font-family: var(--mf-ui);
  font-size: 12px;
  letter-spacing: .06em;
  line-height: 1.35;
  text-align: center;
}
#sf-galaxymap .gm-plot-reason:empty { margin-top: 0; }
@media (prefers-reduced-motion: reduce) {
  #sf-galaxymap #gm-plot-course-btn { transition: none; }
}

/* The explanation is never optional: an unavailable action must say why it is unavailable. */
#sf-galaxymap .gm-engage-reason {
  min-height: 13px;
  margin-top: 5px;
  color: #9a8a72;
  font-family: var(--mf-ui);
  font-size: 12px;
  letter-spacing: .06em;
  line-height: 1.35;
  text-align: center;
}
@media (prefers-reduced-motion: reduce) {
  #sf-galaxymap #gm-engage-route-btn { transition: none; }
}

/* Slice A framing controls. These are NAVIGATION OF THE CHART, not commitments in the world, so
   they are deliberately the quietest actionable surface in the inspector: steel outline, no gold.
   Bright gold is reserved for the tracked objective and the active route, and a button that merely
   recentres the view has not earned it. They sit above the target actions and are never hidden —
   they are most needed exactly when nothing is selected. */
#sf-galaxymap .gm-frame-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid rgba(190, 178, 152, .16);
}
#sf-galaxymap .gm-frame-btn {
  background: rgba(150, 158, 170, .06);
  border-color: rgba(178, 186, 198, .34);
  color: #c3c8d0;
  font-size: 12px;
  letter-spacing: .08em;
  margin-top: 0;
  padding: 8px 12px;
}
#sf-galaxymap .gm-frame-btn:hover:not(:disabled) {
  background: rgba(170, 180, 196, .14);
  border-color: rgba(200, 208, 220, .5);
  color: #e6e9ee;
}
/* Unavailable must READ as unavailable, not merely behave that way: the fill drops out, the label
   dims, and the cursor stops promising a click. The reason line below says why. */
#sf-galaxymap .gm-frame-btn:disabled {
  background: transparent;
  border-color: rgba(178, 186, 198, .18);
  color: #6f7480;
  opacity: 1;
}
#sf-galaxymap .gm-frame-reason {
  min-height: 13px;
  margin-top: 2px;
  color: #9a8a72;
  font-family: var(--mf-ui);
  font-size: 12px;
  letter-spacing: .05em;
  line-height: 1.35;
  text-align: center;
}
@media (prefers-reduced-motion: reduce) {
  #sf-galaxymap .gm-frame-btn { transition: none; }
}
@media (forced-colors: active) {
  #sf-galaxymap #gm-engage-route-btn { border: 1px solid ButtonText; color: ButtonText; }
  #sf-galaxymap #gm-engage-route-btn[data-engage-state="nav:abortRoute"] { border-width: 3px; }
  /* The dash is restated explicitly: under forced-colors the brass tint is discarded, so the line
     STYLE is the only thing left distinguishing the provisional plot from the committing primary. */
  #sf-galaxymap #gm-plot-course-btn { border: 1px dashed ButtonText; color: ButtonText; }
}

/* Service chips: pictogram + label, keyed teal */
#sf-galaxymap .gm-svc-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
#sf-galaxymap .gm-svc {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border: 1px solid var(--mf-line-2);
  border-radius: 2px;
  background: #0e1113;
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--ink-dim);
}
#sf-galaxymap .gm-svc .gm-svc-ico {
  display: inline-flex;
  width: 11px;
  height: 11px;
  color: var(--accent-2);
}
#sf-galaxymap .gm-svc .gm-svc-ico svg { width: 11px; height: 11px; display: block; }

/* Thin meter bars under condition rows */
#sf-galaxymap .gm-meter {
  height: 3px;
  margin: 3px 0 5px;
  background: var(--mf-line-1);
  border-radius: 1px;
  overflow: hidden;
}
#sf-galaxymap .gm-meter > i { display: block; height: 100%; }

/* Trade lanes + best-known sell (strategy deck) */
#sf-galaxymap .gm-tl-row {
  position: relative;
  display: block;
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  padding: 7px 9px 7px 16px;
  margin-bottom: 4px;
  background: #0e1113;
  border: 1px solid var(--mf-line-1);
  border-radius: 2px;
  cursor: pointer;
  font-family: var(--mf-ui);
  transition: border-color .12s ease, background .12s ease;
}
#sf-galaxymap .gm-tl-row::before {
  content: "";
  position: absolute;
  left: 7px;
  top: 50%;
  width: 6px;
  height: 2px;
  transform: translateY(-50%);
  background: #5a574f;
  transition: background .12s ease;
}
#sf-galaxymap .gm-tl-row:hover { border-color: #8a6a3c; background: #121518; }
#sf-galaxymap .gm-tl-row:hover::before { background: var(--accent-3); }
#sf-galaxymap .gm-tl-row:focus-visible {
  outline: none;
  border-color: var(--accent-3);
  box-shadow: inset 0 0 0 1px var(--accent-3);
}
#sf-galaxymap .gm-site-row {
  display: flex;
  width: 100%;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 9px;
  margin: 4px 0;
  background: #0e1113;
  color: var(--ink);
  border: 1px solid var(--mf-line-1);
  border-radius: 2px;
  font: 500 12px var(--mf-ui);
  text-align: left;
  cursor: pointer;
}
#sf-galaxymap .gm-site-row:hover,
#sf-galaxymap .gm-site-row[aria-pressed="true"] { border-color: var(--accent-3); background: #15191b; }
#sf-galaxymap .gm-site-row:focus-visible { outline: 2px solid var(--accent-3); outline-offset: 1px; }
#sf-galaxymap .gm-history-list { margin: 0; padding: 0 0 0 19px; color: var(--ink); }
#sf-galaxymap .gm-history-list li { padding: 5px 0; border-bottom: 1px solid var(--mf-line-1); }
#sf-galaxymap .gm-history-list li > span { display: block; }
#sf-galaxymap .gm-tl-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: var(--ink);
  font-weight: 500;
}
#sf-galaxymap .gm-tl-profit { font-family: var(--mono); font-size: 12px; font-weight: 500; }
#sf-galaxymap .gm-tl-sub {
  margin-top: 2px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-mute);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#sf-galaxymap .gm-bk-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
  color: var(--ink-dim);
}
#sf-galaxymap .gm-bk-station {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#sf-galaxymap .gm-bk-val { font-family: var(--mono); font-size: 12px; }

/* Transit forecast comparison */
#sf-galaxymap .gm-transit {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
#sf-galaxymap .gm-transit-card {
  border: 1px solid var(--mf-line-1);
  border-radius: 2px;
  background: #0e1113;
  padding: 7px 8px;
}
#sf-galaxymap .gm-transit-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--ink-mute);
  margin-bottom: 5px;
}
#sf-galaxymap .gm-transit-head b { font-size: 12px; font-weight: 500; letter-spacing: 0; }
#sf-galaxymap .gm-transit-row {
  display: flex;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-mute);
  padding: 1px 0;
}
#sf-galaxymap .gm-transit-row b { color: var(--ink-dim); font-weight: 400; }

/* Route legs */
#sf-galaxymap .gm-route-leg {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-dim);
  padding: 2px 0;
}
#sf-galaxymap .gm-route-leg b { color: var(--accent-3); font-weight: 500; }
#sf-galaxymap .gm-route-total {
  margin-top: 4px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-mute);
}
/* The leg currently under way reads as the live one; the rest are record. */
#sf-galaxymap .gm-route-leg.is-current {
  color: var(--ink);
  border-left: 2px solid var(--accent);
  margin-left: -6px;
  padding-left: 4px;
}
#sf-galaxymap .gm-route-leg-n {
  display: inline-block;
  min-width: 12px;
  margin-right: 5px;
  color: var(--ink-mute);
  font-size: 12px;
}
#sf-galaxymap .gm-route-leg.is-current .gm-route-leg-n { color: var(--accent); }

/* Mission block — authored leg prose plus a countable-objective meter. */
#sf-galaxymap .gm-mission-name {
  font-weight: 600;
  color: var(--ink);
  font-size: 12px;
}
#sf-galaxymap .gm-mission-brief {
  color: var(--accent-3);
  font-size: 12px;
  margin-top: 2px;
  font-family: var(--mono);
  line-height: 1.45;
}
#sf-galaxymap .gm-mission-meter {
  position: relative;
  height: 3px;
  margin-top: 7px;
  background: #0e1113;
  border: 1px solid var(--mf-line-1);
  overflow: hidden;
}
#sf-galaxymap .gm-mission-meter-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(90deg, var(--accent), var(--accent-3));
}

/* Compact windows keep one canvas and one inspector; layers become a horizontal tool rail. */
#sf-galaxymap[data-layout="compact"] .gm-head {
  min-height: var(--gm-header-h, 72px);
  box-sizing: border-box;
  gap: 8px;
  padding: 9px 12px;
  flex-wrap: wrap;
}
#sf-galaxymap[data-layout="compact"] .gm-title { font-size: 13px; }
#sf-galaxymap[data-layout="compact"] .gm-stamp { display: none; }
#sf-galaxymap[data-layout="compact"] .gm-search-container { max-width: 220px; }
#sf-galaxymap[data-layout="compact"] .gm-weather { min-width: 146px; max-width: 200px; }
#sf-galaxymap[data-layout="compact"] .gm-weather-terms { display: none; }
#sf-galaxymap[data-layout="compact"] .gm-rail-track { display: none; }
#sf-galaxymap[data-layout="compact"] .gm-level { display: none; }
#sf-galaxymap[data-layout="compact"] .gm-body-container {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--gm-inspector-w, 260px);
  grid-template-rows: var(--gm-rail-h, 58px) minmax(0, 1fr);
}
#sf-galaxymap[data-layout="compact"] .gm-left-rail {
  grid-column: 1 / -1;
  grid-row: 1;
  width: auto;
  min-width: 0;
  padding: 7px 10px;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  border-right: 0;
  border-bottom: 1px solid var(--mf-line-2);
}
#sf-galaxymap[data-layout="compact"] .gm-rail-title { margin: 0; padding: 0; flex: 0 0 auto; }
#sf-galaxymap[data-layout="compact"] .gm-rail-title::after { display: none; }
#sf-galaxymap[data-layout="compact"] .gm-layer-buttons {
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: row;
  align-items: stretch;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: thin;
}
#sf-galaxymap[data-layout="compact"] .gm-layer-bank {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
  flex: 0 0 auto;
}
#sf-galaxymap[data-layout="compact"] .gm-layer-bank-title {
  margin: 0 4px 0 0;
  font-size: 12px;
}
#sf-galaxymap[data-layout="compact"] .gm-layer-btn { min-width: 96px; padding: 6px 8px; }
#sf-galaxymap[data-layout="compact"] .gm-rail-commodity { margin: 0; min-width: 132px; }
#sf-galaxymap[data-layout="compact"] .gm-rail-commodity label,
#sf-galaxymap[data-layout="compact"] .gm-rail-legend,
#sf-galaxymap[data-layout="compact"] .gm-rail-footer { display: none; }
#sf-galaxymap[data-layout="compact"] .gm-viewport { grid-column: 1; grid-row: 2; }
#sf-galaxymap[data-layout="compact"] .gm-right-inspector {
  grid-column: 2;
  grid-row: 2;
  width: auto;
  padding: 12px;
}

/* Very narrow windows stack the same three authorities without overlays or hidden actions. */
#sf-galaxymap[data-layout="narrow"] .gm-head {
  min-height: var(--gm-header-h, 104px);
  box-sizing: border-box;
  flex-wrap: wrap;
  gap: 7px;
  padding: 8px 10px;
}
#sf-galaxymap[data-layout="narrow"] .gm-title { font-size: 12px; }
#sf-galaxymap[data-layout="narrow"] .gm-title-lockup { flex: 1 1 auto; }
#sf-galaxymap[data-layout="narrow"] .gm-stamp { display: none; }
#sf-galaxymap[data-layout="narrow"] .gm-rail { order: 3; }
#sf-galaxymap[data-layout="narrow"] .gm-rail-track { display: none; }
#sf-galaxymap[data-layout="narrow"] .gm-weather {
  order: 5;
  flex: 1 1 100%;
  max-width: none;
}
#sf-galaxymap[data-layout="narrow"] .gm-weather-terms { display: none; }
#sf-galaxymap[data-layout="narrow"] .gm-hint-btn { order: 2; }
#sf-galaxymap[data-layout="narrow"] .gm-close { order: 2; }
#sf-galaxymap[data-layout="narrow"] .gm-search-container { order: 4; flex-basis: 100%; max-width: none; }
#sf-galaxymap[data-layout="narrow"] .gm-level { display: none; }
#sf-galaxymap[data-layout="narrow"] .gm-body-container {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: var(--gm-rail-h, 54px) minmax(0, 1fr) var(--gm-inspector-h, 170px);
}
#sf-galaxymap[data-layout="narrow"] .gm-left-rail {
  grid-row: 1;
  width: auto;
  min-width: 0;
  padding: 6px 8px;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  border-right: 0;
  border-bottom: 1px solid var(--mf-line-2);
}
#sf-galaxymap[data-layout="narrow"] .gm-rail-title,
#sf-galaxymap[data-layout="narrow"] .gm-rail-commodity,
#sf-galaxymap[data-layout="narrow"] .gm-rail-legend,
#sf-galaxymap[data-layout="narrow"] .gm-rail-footer { display: none; }
#sf-galaxymap[data-layout="narrow"] .gm-layer-buttons {
  min-width: 0;
  flex: 1;
  flex-direction: row;
  align-items: stretch;
  gap: 6px;
  overflow-x: auto;
}
#sf-galaxymap[data-layout="narrow"] .gm-layer-bank {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
  flex: 0 0 auto;
}
#sf-galaxymap[data-layout="narrow"] .gm-layer-bank-title { display: none; }
#sf-galaxymap[data-layout="narrow"] .gm-layer-btn { min-width: 94px; padding: 6px 8px; }
#sf-galaxymap[data-layout="narrow"] .gm-viewport { grid-row: 2; }
#sf-galaxymap[data-layout="narrow"] .gm-right-inspector {
  grid-row: 3;
  width: auto;
  padding: 10px 12px;
  border-left: 0;
  border-top: 1px solid var(--mf-line-2);
}
#sf-galaxymap[data-layout="narrow"] .gm-inspector-content { gap: 7px; }

/* Accessibility hooks: dyslexia swaps proportional stacks; forced colors flattens chamfers. */
html.sf-dyslexia #sf-galaxymap {
  --mf-display: "OpenDyslexic", "Atkinson Hyperlegible", "Comic Sans MS", "Verdana", system-ui, sans-serif;
  --mf-ui: "OpenDyslexic", "Atkinson Hyperlegible", "Comic Sans MS", "Verdana", system-ui, sans-serif;
}
@media (forced-colors: active) {
  html.sf-forced-colors #sf-galaxymap .gm-ins-btn,
  html.sf-forced-colors #sf-galaxymap .gm-search-results,
  html.sf-forced-colors #sf-galaxymap .gm-hints { clip-path: none !important; filter: none !important; }
}

/* ══ SLICE C — information in depth ═══════════════════════════════════════════════════════════
   Surveyor's Table identity throughout: warm black, brass hairlines, amber worklight, restrained
   teal. No harsh cyan wireframe, no cramped monospace slab. Bright gold (--accent-3) stays
   RESERVED for the tracked objective and the live route; nothing else here spends it. */

/* ---- Left rail: collapsible sections -------------------------------------------------------- */
#sf-galaxymap .gm-rail-sec {
  border-bottom: 1px solid var(--mf-line-1);
}
#sf-galaxymap .gm-rail-sum {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 2px;
  cursor: pointer;
  list-style: none;
  font-family: var(--mf-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--ink-dim);
  transition: color .12s ease;
}
#sf-galaxymap .gm-rail-sum::-webkit-details-marker { display: none; }
#sf-galaxymap .gm-rail-sum:hover { color: var(--ink); }
#sf-galaxymap .gm-rail-sum:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
/* The disclosure caret is a SHAPE, so open/closed never depends on colour alone. */
#sf-galaxymap .gm-rail-sum-t::before {
  content: "▸";
  display: inline-block;
  margin-right: 7px;
  color: var(--mf-line-3);
  transition: transform .14s ease;
}
#sf-galaxymap .gm-rail-sec[open] > .gm-rail-sum { color: var(--ink); }
#sf-galaxymap .gm-rail-sec[open] > .gm-rail-sum .gm-rail-sum-t::before {
  transform: rotate(90deg);
  color: var(--accent);
}
#sf-galaxymap .gm-rail-sum-n {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .08em;
  color: var(--mf-stamp);
}
#sf-galaxymap .gm-rail-body {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 2px 0 11px;
}
#sf-galaxymap .gm-rail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  text-align: left;
  background: var(--panel-2);
  border: 1px solid var(--mf-line-2);
  border-radius: 2px;
  padding: 7px 9px;
  color: var(--ink-dim);
  font-family: var(--mf-ui);
  cursor: pointer;
  transition: border-color .12s ease, color .12s ease;
}
#sf-galaxymap .gm-rail-item:hover { border-color: var(--mf-line-3); color: var(--ink); }
#sf-galaxymap .gm-rail-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
#sf-galaxymap .gm-rail-item-t { font-size: 12px; color: var(--ink); }
#sf-galaxymap .gm-rail-item-s { font-size: 12px; color: var(--ink-mute); }
#sf-galaxymap .gm-rail-item-tag {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--accent-2);
}
/* Tracked mission: bright gold is legitimate here — this IS the tracked objective. It carries a
   glyph and a left rule as well, so the state never rests on hue alone. */
#sf-galaxymap .gm-rail-item.is-tracked {
  border-left: 2px solid var(--accent-3);
  color: var(--ink);
}
#sf-galaxymap .gm-rail-track-g { color: var(--accent-3); margin-right: 5px; }
#sf-galaxymap .gm-rail-item.is-current { border-color: var(--accent-2); }
#sf-galaxymap .gm-rail-add { margin-top: 2px; }

/* ---- Inspector tabs ------------------------------------------------------------------------- */
#sf-galaxymap .gm-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 7px 10px 0;
  border-bottom: 1px solid var(--mf-line-2);
  background: linear-gradient(180deg, #15181b, #121518);
}
#sf-galaxymap .gm-tab {
  background: transparent;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 2px 2px 0 0;
  padding: 6px 9px;
  color: var(--ink-mute);
  font-family: var(--mf-ui);
  font-size: 12px;
  letter-spacing: .04em;
  cursor: pointer;
  transition: color .12s ease, background .12s ease, border-color .12s ease;
}
#sf-galaxymap .gm-tab:hover { color: var(--ink); background: rgba(255, 255, 255, .03); }
#sf-galaxymap .gm-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
/* Selected tab: colour AND a brass underline AND weight. Three signals, not one. */
#sf-galaxymap .gm-tab[aria-selected="true"] {
  color: var(--ink);
  font-weight: 600;
  background: var(--panel);
  border-color: var(--mf-line-2);
  box-shadow: inset 0 2px 0 var(--accent);
}
/* An unavailable tab is dimmed AND dotted-underlined — never dimmed alone. */
#sf-galaxymap .gm-tab.is-empty {
  color: var(--mf-stamp);
  text-decoration: underline dotted var(--mf-line-3) 1px;
  text-underline-offset: 3px;
}

/* ---- Nav rows in the Overview tab ----------------------------------------------------------- */
#sf-galaxymap .gm-nav-row {
  display: grid;
  grid-template-columns: 78px 1fr;
  gap: 2px 9px;
  padding: 5px 0;
  border-top: 1px solid var(--mf-line-1);
  font-size: 12px;
}
#sf-galaxymap .gm-nav-row-k {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--mf-stamp);
  padding-top: 2px;
}
#sf-galaxymap .gm-nav-row-v { color: var(--ink); }
#sf-galaxymap .gm-nav-row-d { grid-column: 2; color: var(--ink-mute); font-size: 12px; }
/* TRACKED is the one tone allowed to spend bright gold, and it also gets a left rule. */
#sf-galaxymap .gm-nav-row[data-tone="tracked"] .gm-nav-row-v {
  color: var(--accent-3);
  font-weight: 600;
}
#sf-galaxymap .gm-nav-row[data-tone="tracked"] {
  border-left: 2px solid var(--accent-3);
  padding-left: 7px;
}
#sf-galaxymap .gm-nav-row[data-tone="muted"] .gm-nav-row-v { color: var(--ink-mute); font-style: italic; }

/* ---- Careers (Overview line + Careers tab) --------------------------------------------------- */
/* New work obeys the grammar floor the panel's older rows predate: nothing here renders below
   12px, and every figure binds --sf-data-face with tabular numerals (Phase-0 ruling: every figure
   on every new surface binds the DATA face). Phase state rides on data-career-phase, never colour
   alone. */
#sf-galaxymap .gm-career {
  padding: 6px 0;
  border-top: 1px solid var(--mf-line-1);
}
#sf-galaxymap .gm-career:first-of-type { border-top: 0; }
#sf-galaxymap .gm-career__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12.5px;
}
#sf-galaxymap .gm-career__role {
  font-family: var(--mf-ui);
  font-weight: 600;
  color: var(--ink);
}
#sf-galaxymap .gm-career__phase { color: var(--ink-dim); font-size: 12px; }
#sf-galaxymap .gm-career[data-career-phase="Fleeing"] .gm-career__phase { color: var(--danger, #ff5470); }
#sf-galaxymap .gm-career__fig {
  margin-left: auto;
  font-family: var(--sf-data-face);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-dim);
  white-space: nowrap;
}
#sf-galaxymap .gm-career__place,
#sf-galaxymap .gm-career__who {
  color: var(--ink-mute);
  font-size: 12px;
  line-height: 1.45;
  margin-top: 2px;
}
#sf-galaxymap .gm-career__who { color: var(--ink-dim); }
#sf-galaxymap .gm-fig {
  font-family: var(--sf-data-face);
  font-variant-numeric: tabular-nums;
  /* Owns its size: the header figure rides an 11px legacy row-value class, and the grammar floor
     for new work is 12px — same specificity, but this block is later in the sheet, so it wins. */
  font-size: 12px;
}

/* ---- Place context actions ------------------------------------------------------------------ */
#sf-galaxymap .gm-place-actions { display: flex; flex-wrap: wrap; gap: 5px; }
#sf-galaxymap .gm-place-actions:empty { display: none; }
#sf-galaxymap .gm-place-btn {
  flex: 1 1 auto;
  background: var(--panel-2);
  border: 1px solid var(--mf-line-2);
  border-radius: 2px;
  padding: 6px 9px;
  color: var(--ink-dim);
  font-family: var(--mf-ui);
  font-size: 12px;
  cursor: pointer;
  transition: border-color .12s ease, color .12s ease;
}
#sf-galaxymap .gm-place-btn:hover:not(:disabled):not([aria-disabled="true"]) { border-color: var(--accent); color: var(--ink); }
#sf-galaxymap .gm-place-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
#sf-galaxymap .gm-place-btn:disabled,
#sf-galaxymap .gm-place-btn[aria-disabled="true"] {
  opacity: .45;
  cursor: not-allowed;
  border-style: dashed; /* shape, not just opacity */
}

/* ---- APRON: route ribbon + cargo deck -------------------------------------------------------- */
#sf-galaxymap .gm-apron {
  flex: 0 0 auto;
  min-height: var(--gm-apron-h, 188px);
  border-top: 1px solid var(--mf-line-2);
  background:
    repeating-linear-gradient(112deg, rgba(255, 255, 255, .005) 0 1px, transparent 1px 7px),
    linear-gradient(180deg, #15191d 0%, #111417 100%);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px;
  padding: 9px 14px 10px;
  box-sizing: border-box;
}
#sf-galaxymap .gm-apron-ribbon {
  min-height: 0;
}
#sf-galaxymap .gm-ribbon {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: "main actions" "reason reason";
  gap: 6px 14px;
  align-items: center;
  padding: 9px 13px;
  box-sizing: border-box;
  /* Opaque enough to read over the chart, warm enough to stay in the table's material world. */
  background: linear-gradient(180deg, rgba(24, 28, 31, .96), rgba(16, 19, 21, .97));
  border: 1px solid var(--mf-line-2);
  border-top: 1px solid var(--mf-line-3);
  border-radius: 2px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .36);
  animation: gm-ribbon-in .18s ease-out;
}
#sf-galaxymap .gm-ribbon[hidden] { display: none; }
@keyframes gm-ribbon-in {
  from { opacity: 0; transform: translateY(7px); }
  to { opacity: 1; transform: none; }
}
#sf-galaxymap .gm-ribbon-main { grid-area: main; min-width: 0; }
#sf-galaxymap .gm-ribbon-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 5px;
}
#sf-galaxymap .gm-ribbon-status {
  font-family: var(--mf-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--ink);
}
/* Live route earns the reserved gold; plotted-but-not-engaged deliberately does not. Each state
   also changes the leading rule, so the distinction survives forced-colors and colour blindness. */
#sf-galaxymap .gm-ribbon-status[data-ribbon-state="live"] { color: var(--accent-3); }
#sf-galaxymap .gm-ribbon-status[data-ribbon-state="plotted"] { color: var(--ink-dim); }
#sf-galaxymap .gm-ribbon-status[data-ribbon-state="interrupted"] {
  color: var(--danger);
  text-decoration: underline wavy var(--danger) 1px;
  text-underline-offset: 3px;
}
#sf-galaxymap .gm-ribbon-arrival {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .08em;
  color: var(--ink-dim);
}
#sf-galaxymap .gm-ribbon-legs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin: 0 0 5px;
  padding: 0;
  list-style: none;
}
#sf-galaxymap .gm-ribbon-leg {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: 1px solid var(--mf-line-2);
  border-radius: 2px;
  font-size: 12px;
  color: var(--ink-mute);
  background: rgba(255, 255, 255, .015);
}
/* Leg state is carried by a glyph (✓ / ▶ / ·) AND border weight AND colour. */
#sf-galaxymap .gm-ribbon-leg[data-leg-state="done"] { opacity: .55; }
#sf-galaxymap .gm-ribbon-leg[data-leg-state="active"] {
  border-color: var(--accent-3);
  border-left-width: 3px;
  color: var(--ink);
}
#sf-galaxymap .gm-ribbon-leg-g { color: var(--accent); font-size: 12px; }
#sf-galaxymap .gm-ribbon-leg[data-leg-state="active"] .gm-ribbon-leg-g { color: var(--accent-3); }
#sf-galaxymap .gm-ribbon-leg-c { font-family: var(--mono); font-size: 12px; color: var(--mf-stamp); }
#sf-galaxymap .gm-ribbon-haz {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .1em;
  text-transform: uppercase;
}
#sf-galaxymap .gm-ribbon-haz[data-haz="watched"] { color: var(--warn); }
#sf-galaxymap .gm-ribbon-haz[data-haz="contested"] { color: var(--danger); }
#sf-galaxymap .gm-ribbon-warn { color: var(--danger); font-size: 12px; }
#sf-galaxymap .gm-ribbon-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 14px;
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .05em;
  color: var(--ink-mute);
}
#sf-galaxymap .gm-ribbon-actions { grid-area: actions; display: flex; gap: 5px; }
#sf-galaxymap .gm-ribbon-btn {
  background: var(--panel-2);
  border: 1px solid var(--mf-line-2);
  border-radius: 2px;
  padding: 7px 12px;
  color: var(--ink-dim);
  font-family: var(--mf-ui);
  font-size: 12px;
  cursor: pointer;
  transition: border-color .12s ease, color .12s ease;
}
#sf-galaxymap .gm-ribbon-btn:hover:not(:disabled):not([aria-disabled="true"]) { border-color: var(--accent); color: var(--ink); }
#sf-galaxymap .gm-ribbon-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
#sf-galaxymap .gm-ribbon-btn:disabled,
#sf-galaxymap .gm-ribbon-btn[aria-disabled="true"] {
  opacity: .42;
  cursor: not-allowed;
  border-style: dashed;
}
#sf-galaxymap .gm-ribbon-reason {
  grid-area: reason;
  font-size: 12px;
  color: var(--ink-mute);
  font-style: italic;
}
#sf-galaxymap .gm-ribbon-reason:empty { display: none; }

#sf-galaxymap .gm-deck {
  border: 1px solid var(--mf-line-1);
  background: linear-gradient(180deg, rgba(0, 0, 0, .22), rgba(0, 0, 0, .1));
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}
#sf-galaxymap .gm-deck-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 9px;
  border-bottom: 1px solid var(--mf-line-1);
}
#sf-galaxymap .gm-deck-title {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .22em;
  text-transform: uppercase;
  color: var(--ink-mute);
}
#sf-galaxymap .gm-deck-sort {
  border: 1px solid var(--mf-line-2);
  background: #121519;
  color: var(--ink-dim);
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .08em;
  text-transform: uppercase;
  padding: 3px 8px;
  cursor: pointer;
}
#sf-galaxymap .gm-deck-sort:hover { border-color: var(--accent); color: var(--ink); }
#sf-galaxymap .gm-deck-sort:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
#sf-galaxymap .gm-deck-table {
  overflow: auto;
  display: grid;
  gap: 4px;
  padding: 6px;
}
#sf-galaxymap .gm-deck-row {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(108px, 1.2fr) minmax(180px, 2fr) minmax(160px, 1.55fr) minmax(76px, .9fr);
  align-items: center;
  gap: 8px;
  text-align: left;
  border: 1px solid var(--mf-line-1);
  background: linear-gradient(180deg, rgba(255, 255, 255, .017), rgba(255, 255, 255, .004));
  color: var(--ink-dim);
  padding: 6px 8px;
  font-family: var(--mono);
  font-size: 12px;
  cursor: pointer;
}
#sf-galaxymap .gm-deck-row:hover {
  border-color: #8a6a3c;
  color: var(--ink);
}
#sf-galaxymap .gm-deck-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
#sf-galaxymap .gm-deck-commodity {
  color: var(--ink);
  text-transform: uppercase;
  letter-spacing: .08em;
}
#sf-galaxymap .gm-deck-lane {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-dim);
}
#sf-galaxymap .gm-deck-metric {
  color: var(--ink);
  font-weight: 600;
}
#sf-galaxymap .gm-deck-risk { text-transform: uppercase; letter-spacing: .06em; }
#sf-galaxymap .gm-deck-risk[data-risk="calm"] { color: var(--good); }
#sf-galaxymap .gm-deck-risk[data-risk="watched"] { color: var(--warn); }
#sf-galaxymap .gm-deck-risk[data-risk="hot"] { color: var(--danger); }
#sf-galaxymap .gm-deck-empty {
  padding: 9px;
  border: 1px dashed var(--mf-line-1);
  color: var(--ink-mute);
}
#sf-galaxymap .gm-deck-empty-title {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ink-dim);
  margin-bottom: 4px;
}
#sf-galaxymap .gm-deck-empty-body {
  font-size: 12px;
  line-height: 1.4;
}

/* ---- Services chips ------------------------------------------------------------------------- */
#sf-galaxymap .gm-svc-row { display: flex; flex-wrap: wrap; gap: 5px; }
#sf-galaxymap .gm-svc-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border: 1px solid var(--mf-line-2);
  border-radius: 2px;
  font-size: 12px;
  color: var(--ink-dim);
  text-transform: capitalize;
}

/* ---- Narrow layouts: keep the apron readable ------------------------------------------------ */
@media (max-width: 1100px) {
  #sf-galaxymap .gm-deck-row {
    grid-template-columns: minmax(96px, 1fr) minmax(132px, 1.4fr) minmax(120px, 1.2fr) 72px;
    font-size: 12px;
  }
}
@media (max-width: 900px) {
  #sf-galaxymap .gm-apron { padding: 8px; gap: 7px; }
  #sf-galaxymap .gm-ribbon {
    grid-template-columns: 1fr;
    grid-template-areas: "main" "actions" "reason";
  }
  #sf-galaxymap .gm-ribbon-actions { flex-wrap: wrap; }
  #sf-galaxymap .gm-deck-row {
    grid-template-columns: 1fr;
    gap: 2px;
  }
  #sf-galaxymap .gm-weather { max-width: 220px; }
}

/* ---- Reduced motion: suppress the ANIMATION, never the INFORMATION -------------------------- */
@media (prefers-reduced-motion: reduce) {
  #sf-galaxymap .gm-ribbon { animation: none; }
  #sf-galaxymap .gm-rail-sum-t::before,
  #sf-galaxymap .gm-tab,
  #sf-galaxymap .gm-rail-item,
  #sf-galaxymap .gm-place-btn,
  #sf-galaxymap .gm-ribbon-btn { transition: none; }
}

/* ---- Forced colors / high contrast ---------------------------------------------------------- */
@media (forced-colors: active) {
  #sf-galaxymap .gm-ribbon,
  #sf-galaxymap .gm-ribbon-leg,
  #sf-galaxymap .gm-deck,
  #sf-galaxymap .gm-deck-row,
  #sf-galaxymap .gm-rail-item,
  #sf-galaxymap .gm-svc-chip { border: 1px solid CanvasText; box-shadow: none; }
  #sf-galaxymap .gm-tab[aria-selected="true"] { border: 2px solid Highlight; }
  /* Disabled state must survive the palette flattening, so keep it a SHAPE. */
  #sf-galaxymap .gm-ribbon-btn:disabled,
  #sf-galaxymap .gm-ribbon-btn[aria-disabled="true"],
  #sf-galaxymap .gm-place-btn:disabled,
  #sf-galaxymap .gm-place-btn[aria-disabled="true"] { border-style: dashed; opacity: 1; }
  #sf-galaxymap .gm-ribbon-leg[data-leg-state="active"] { border-left-width: 4px; }
}
`;

let _styleInjected = false;
function injectStyle() {
  if (!HAS_DOC || _styleInjected || document.getElementById(STYLE_ID)) { _styleInjected = true; return; }
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
  _styleInjected = true;
}

// ---------------------------------------------------------------------------------------------
// Overlay rail + service iconography (inline SVG for DOM; stroke twins drawn on canvas below).
// Every overlay owns a distinct mark; every station service owns a pictogram that always travels
// with its full label in DOM contexts (icons are never the only carrier of meaning).
// ---------------------------------------------------------------------------------------------
const LAYER_DEFS = Object.freeze([
  { id: 'route', name: 'Route', icon: '<path d="M4 19 L10 12 L15 15 L20 5"/><circle cx="4" cy="19" r="1.8"/><circle cx="20" cy="5" r="1.8"/>' },
  { id: 'mission', name: 'Mission', icon: '<path d="M12 3 L21 12 L12 21 L3 12 Z"/><circle cx="12" cy="12" r="2"/>' },
  { id: 'market', name: 'Pressure', icon: '<path d="M4 20h16"/><path d="M7.5 16v-5M12 16V7M16.5 16v-8"/>' },
  { id: 'events', name: 'Events', icon: '<circle cx="12" cy="12" r="8"/><path d="M6 12h12M12 6v12"/>' },
  { id: 'security', name: 'Security', icon: '<path d="M12 3 L19 6 V11 C19 16 15.5 19.5 12 21 C8.5 19.5 5 16 5 11 V6 Z"/>' },
  { id: 'faction', name: 'Faction', icon: '<path d="M6 21V4"/><path d="M6 4h11l-3 4 3 4H6"/>' },
  { id: 'hazard', name: 'Hazard', icon: '<path d="M12 4 L21 20 H3 Z"/><path d="M12 10v4.5M12 17.4v.4"/>' },
  { id: 'services', name: 'Services', icon: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.2 6.2l2 2M15.8 15.8l2 2M17.8 6.2l-2 2M8.2 15.8l-2 2"/>' },
  { id: 'holdings', name: 'Holdings', icon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="M4 7.5l8 4.5 8-4.5"/>' },
  { id: 'discovery', name: 'Discovery', icon: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>' },
]);

const LAYER_BANKS = Object.freeze([
  { id: 'place', label: 'PLACE', layers: Object.freeze(['services', 'holdings', 'discovery']) },
  { id: 'flow', label: 'FLOW', layers: Object.freeze(['route', 'mission', 'market']) },
  { id: 'trouble', label: 'TROUBLE', layers: Object.freeze(['events', 'security', 'faction', 'hazard']) },
]);

const SERVICE_ICON_PATHS = Object.freeze({
  trade: '<path d="M7 8h10l-3-3M17 16H7l3 3"/>',
  shipyard: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',
  repair: '<path d="M15.5 5.5a4.2 4.2 0 0 0-5.7 5L5 15.3 8.7 19l4.8-4.8a4.2 4.2 0 0 0 5-5.7l-3 3-2.6-2.6Z"/>',
  refuel: '<path d="M12 3 C8 9 6 12 6 15 a6 6 0 0 0 12 0 C18 12 16 9 12 3Z"/>',
  refine: '<path d="M4 8h16l-6 12h-4Z"/><path d="M12 8V3"/>',
  missions: '<path d="M12 3 L20 12 L12 21 L4 12 Z"/><path d="M9 12l2 2 4-4"/>',
  ore_buy: '<path d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 Z"/>',
  black_market: '<path d="M3 5h18l-9 14Z"/>',
  module_craft: '<rect x="4" y="4" width="16" height="16"/><path d="M12 8v8M8 12h8"/>',
  toll: '<path d="M5 5h14M12 5v15"/>',
  scan: '<circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
});

function strokeSvg(paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// J05: the unknown-service fallback used to be `<rect>` + the service's first LETTER — a
// letter-in-a-box, which is not a pictogram at all. It also broke the set's own rules: `<text>`
// picks up the ambient font, ignores `stroke`, and reflows under pseudo-localization while every
// other mark here is a fixed 24×24 stroke path.
//
// A dashed ring with a centred query stroke is honest instead: it reads as "service present, symbol
// not yet authored" rather than impersonating a designed glyph. If an unknown key shows up here,
// the fix is to add it to SERVICE_ICON_PATHS, not to dress up the fallback.
const UNKNOWN_SERVICE_PATHS =
  '<circle cx="12" cy="12" r="8.2" stroke-dasharray="2.6 2.8"/>'
  + '<path d="M9.9 9.6a2.2 2.2 0 1 1 2.6 2.9v1.2M12.5 17v.2"/>';

/** DOM service chip icon: keyed pictogram, always paired with its label beside it. */
export function serviceIconSvg(service) {
  const key = String(service || '').toLowerCase();
  const paths = SERVICE_ICON_PATHS[key];
  return strokeSvg(paths || UNKNOWN_SERVICE_PATHS);
}

const LEGEND_SERVICES = Object.freeze(['trade', 'shipyard', 'repair', 'refuel', 'refine', 'missions']);

// Chart marks that are not service pictograms. Anything the canvas invents a silhouette for should
// be readable off the rail without a manual — otherwise the shape is decoration, not language.
const LEGEND_MARKS = Object.freeze([
  {
    name: 'Mission point',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="6" y="6" width="12" height="12"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/></svg>',
  },
  {
    name: 'Survey site',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M8 12h8M12 8v8"/></svg>',
  },
  {
    name: 'Last known fix',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="7.5" stroke-dasharray="2.4 2.6"/><path d="M12 8.5l3.2 6.4H8.8z"/></svg>',
  },
]);

const HINT_ROWS = Object.freeze([
  ['Zoom / pan the table', 'Wheel · Drag'],
  ['Inspect a mark', 'Click'],
  ['Lay a course', 'Dbl-click'],
  ['Cycle overlays', 'Tab'],
  ['Inspector tabs', '← →'],
  ['Search the chart', '/'],
  ['Close the chart', 'Esc'],
]);

// ---------------------------------------------------------------------------------------------
// SLICE C — inspector tabs. Depth on demand (ADR D9.9).
// ---------------------------------------------------------------------------------------------
//
// The panel shows ONE of these at a time. That is the whole point: the brief asks for eight kinds
// of depth, and rendering eight kinds of depth simultaneously is how the density paradox was
// built. Overview is the default and always answers the navigation questions, so the panel is
// never empty and never opens on a wall of numbers.
//
// HONESTY RULE FOR TABS: a tab whose data source does not exist yet renders an explicit empty
// state that says so. It does not get filled with invented content, and it does not get a new
// data system built behind it — D2/D9 reject growing a registry to feed a panel.

export const MAP_INSPECTOR_TABS = Object.freeze([
  { id: 'overview', label: 'Overview' },
  { id: 'travel', label: 'Travel' },
  { id: 'missions', label: 'Missions' },
  { id: 'economy', label: 'Economy' },
  { id: 'threat', label: 'Threat' },
  { id: 'careers', label: 'Careers' },
  { id: 'services', label: 'Services' },
  { id: 'discovery', label: 'Discovery' },
  { id: 'history', label: 'History' },
]);

export const MAP_INSPECTOR_TAB_IDS = Object.freeze(MAP_INSPECTOR_TABS.map((t) => t.id));

/**
 * Which tabs carry something for the current selection/state.
 *
 * Returns availability plus a REASON for every tab, in the same contract the framing and engage
 * controls already use: a tab with nothing behind it is visibly unavailable and says why, rather
 * than opening onto a blank panel and leaving the player to wonder whether it is broken.
 *
 * Pure — no DOM. `check:map-information-depth` drives this directly.
 */
export function resolveInspectorTabAvailability(state, target) {
  const nav = (state && state.nav) || {};
  const hasRoute = !!(nav.route && Array.isArray(nav.route.legs) && nav.route.legs.length);
  const executor = readRouteExecutorForMap(nav.executor);
  const missions = (state && state.missions && state.missions.active) || [];
  const liveMissions = missions.filter((m) => m && m.status === 'active');
  const kind = target && target.kind;
  const out = {};

  const set = (id, available, reason) => { out[id] = Object.freeze({ id, available: !!available, reason }); };

  set('overview', true, 'Where you are, what you are tracking, and what is selected');
  set('travel', hasRoute || !!executor,
    hasRoute || executor ? 'Route legs, cost, hazards and arrival' : 'No route plotted — set a course to a sector first');
  set('missions', liveMissions.length > 0,
    liveMissions.length ? `${liveMissions.length} active` : 'No active missions');
  set('economy', true, 'Trade lanes from memory and model beacons');
  set('threat', !!(target || currentSectorId(state)),
    target ? 'Security, events, holdings and regional dossiers for the selection' : 'Security, events, holdings and regional dossiers for your current sector');
  // CAREERS reads the pocket in scope — the sector behind the selection when there is one, the
  // player's own sector otherwise — through the same scope idiom the Threat tab uses. The reason
  // carries the data-state sentence (empty/loading/denied all name what would fill the pane).
  const careersScope = (kind === 'sector' ? (target && (target.sectorId || target.id)) : (target && target.sectorId))
    || currentSectorId(state);
  const careers = careersTabAvailability(state, careersScope);
  set('careers', careers.available, careers.reason);
  set('services', kind === 'station' || kind === 'sector',
    (kind === 'station' || kind === 'sector') ? 'Docking services' : 'Select a station or sector to list services');
  set('discovery', true, 'Survey confidence and charted status');
  const hasWorldSiteHistory = !!(target && target.mapKind === 'world-site'
    && target.ledger && Array.isArray(target.ledger.recentReceipts));
  set('history', hasWorldSiteHistory, hasWorldSiteHistory
    ? 'Authoritative World Site activity'
    : 'Select a World Site with an activity ledger');
  return Object.freeze(out);
}

function popCurrentScreen(ctx) {
  const sm = ctx && ctx.screenManager;
  if (sm && typeof sm.popScreen === 'function') { sm.popScreen(); return; }
  if (ctx && ctx.bus) ctx.bus.emit('ui:popScreen', {});
}

// ---------------------------------------------------------------------------------------------
// Price/Market Memory Readers
// ---------------------------------------------------------------------------------------------

/**
 * Market Intel's selectable catalog. Lawful goods are always searchable; restricted/contraband
 * goods appear only after the pilot has remembered a quote or armed a trade route for them.
 * This reveals no prices and never consults live economy markets.
 */
export function marketIntelCommodityOptions(state, commodities = COMMODITIES) {
  const memory = state && state.player && state.player.marketMemory;
  const waypoint = state && state.nav && state.nav.waypoint;
  const routedId = waypoint && waypoint.kind === 'trade' && waypoint.commodityId
    ? String(waypoint.commodityId)
    : null;
  const nowS = Math.max(0, Number(state && state.simTime) || 0);
  return (Array.isArray(commodities) ? commodities : [])
    .filter((commodity) => commodity && commodity.id)
    .filter((commodity) => {
      const commodityId = String(commodity.id);
      return commodity.legality === 'legal'
        || commodityId === routedId
        || knownStationQuotes(memory, commodityId, nowS).length > 0;
    });
}

/** Keep Market Intel on the commodity the pilot is actively hauling when the chart opens. */
export function selectedMarketCommodityOnOpen(state, currentCommodity, commodities = COMMODITIES) {
  const options = marketIntelCommodityOptions(state, commodities);
  const ids = new Set(options.map((commodity) => String(commodity.id)));
  const waypoint = state && state.nav && state.nav.waypoint;
  const routed = waypoint && waypoint.kind === 'trade' && waypoint.commodityId
    ? String(waypoint.commodityId)
    : null;
  if (routed && ids.has(routed)) return routed;
  const current = currentCommodity != null ? String(currentCommodity) : '';
  if (current && ids.has(current)) return current;
  if (ids.has('cmdty_ore_iron')) return 'cmdty_ore_iron';
  return options[0] ? String(options[0].id) : '';
}

/**
 * Best remembered sell in a sector, including secondary stations. The result carries the quote's
 * age/provenance and persistent-demand explanation so UI surfaces do not need a second formula.
 */
export function bestKnownSectorMarket(state, sector, commodityId) {
  const stations = sector && Array.isArray(sector.stations) ? sector.stations : [];
  const stationIds = stations.map((station) => station && station.id).filter(Boolean);
  const memory = state && state.player && state.player.marketMemory;
  const nowS = Math.max(0, Number(state && state.simTime) || 0);
  const quote = bestKnownSellAtStations(memory, stationIds, commodityId, nowS);
  if (!quote) return null;
  const station = stations.find((candidate) => candidate && String(candidate.id) === quote.stationId);
  return {
    ...quote,
    stationName: station && station.name ? String(station.name) : quote.stationId,
  };
}

function memoryTint(ageS) {
  if (ageS < 600) return { key: 'fresh', color: INK.amberHot, italic: false };
  if (ageS < 3600) return { key: 'mid', color: INK.ink0, italic: false };
  return { key: 'old', color: INK.ink2, italic: true };
}

function ageText(ageS) {
  if (ageS < 60) return 'fresh';
  return Math.max(1, Math.round(ageS / 60)) + ' min';
}

function getMarketMemoryForStation(state, stationId, commodityId) {
  const memory = state && state.player && state.player.marketMemory;
  if (!memory || !stationId || !commodityId) return null;
  const now = Math.max(0, Number(state.simTime) || 0);
  return bestKnownSellAtStations(memory, [stationId], commodityId, now);
}

function findStationRecord(state, stationId) {
  if (!state || !stationId) return null;
  for (const e of entityIterator(state)) {
    if (e.type === 'station' && (e.id === stationId || (e.data && e.data.stationId === stationId))) {
      return e.data;
    }
  }
  for (const s of sectorRecords(state)) {
    if (s && s.stations) {
      for (const st of s.stations) {
        if (st.id === stationId) return st;
      }
    }
  }
  return null;
}

/** Live/static world position for a station id (live entity first, then the static record). */
function stationPositionById(state, stationId) {
  if (!state || !stationId) return null;
  const byStationId = state.entityIndex && state.entityIndex.byStationId;
  const indexed = byStationId && typeof byStationId.get === 'function' ? byStationId.get(stationId) : null;
  if (indexed && indexed.alive !== false && indexed.pos) return { x: indexed.pos.x, z: indexed.pos.z };
  for (const e of entityIterator(state)) {
    if (!e || e.alive === false || e.type !== 'station' || !e.pos) continue;
    const data = e.data || {};
    if (data.stationId === stationId || e.id === stationId) return { x: e.pos.x, z: e.pos.z };
  }
  const rec = findStationRecord(state, stationId);
  const anchor = rec && (rec.pos || rec.anchor || rec.position);
  if (anchor && Number.isFinite(Number(anchor.x))) {
    return { x: Number(anchor.x) || 0, z: Number(anchor.z != null ? anchor.z : anchor.y) || 0 };
  }
  return null;
}

/** Home sector id for a station id, from the sector catalog. */
function stationSectorIdById(state, stationId) {
  for (const s of sectorRecords(state)) {
    if (!s || !Array.isArray(s.stations)) continue;
    for (const st of s.stations) {
      if (st && st.id === stationId) return s.id || null;
    }
  }
  return null;
}

function stationNameById(state, stationId) {
  const rec = findStationRecord(state, stationId);
  return (rec && (rec.name || rec.stationName)) || stationId || 'Station';
}

const COMMODITY_NAME_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c.name]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const REGIONAL_ECONOMY_PROFILE_BY_SECTOR = new Map(
  REGIONAL_ECONOMY_PROFILES.map((profile) => [profile && profile.sectorId, profile]),
);

function pairFactionLabel(pairKey) {
  const [a, b] = String(pairKey || '').split(':');
  if (!a || !b) return String(pairKey || '');
  return `${factionNameOf(a)} / ${factionNameOf(b)}`;
}

function sectorConflictSignal(state, sectorId) {
  const pairs = conflictPairsForSector(sectorId);
  if (!pairs.length) return { wars: 0, tense: 0, total: 0, labels: [] };
  let wars = 0;
  let tense = 0;
  const labels = [];
  for (const pairKey of pairs) {
    const rec = state && state.conflicts && state.conflicts[pairKey];
    const tension = Number(rec && rec.tension) || 0;
    const stance = String(rec && rec.state || 'cold').toLowerCase();
    if (stance === 'war' || tension >= 75) wars += 1;
    else if (stance === 'tense' || tension >= 40) tense += 1;
    if ((wars + tense) < 4) labels.push(pairFactionLabel(pairKey));
  }
  return { wars, tense, total: pairs.length, labels };
}

function sectorHoldingsSignal(state, sectorId) {
  const allBodies = (state && state.claims && state.claims.bodies) || [];
  const bodies = allBodies.filter((body) => body && body.sectorId === sectorId);
  if (!bodies.length) return { count: 0, active: 0, moduleCount: 0, defenseAvg: 0 };
  const active = bodies.filter((body) => body.spec && body.spec.status === 'active').length;
  const moduleCount = bodies.reduce((sum, body) => {
    const modules = Array.isArray(body.modules) ? body.modules.filter(Boolean).length : 0;
    return sum + modules;
  }, 0);
  const defenseSum = bodies.reduce((sum, body) => sum + Math.max(0, Number(claimDefenseRating(body, allBodies)) || 0), 0);
  return {
    count: bodies.length,
    active,
    moduleCount,
    defenseAvg: defenseSum / Math.max(1, bodies.length),
  };
}

function weightedCommodityLabel(lines = []) {
  const top = Array.from(lines)
    .filter((line) => line && line.commodityId)
    .sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0))
    .slice(0, 2)
    .map((line) => {
      const name = COMMODITY_NAME_BY_ID.get(line.commodityId) || line.commodityId;
      return `${name} ${Math.round((Number(line.weight) || 0) * 100)}%`;
    });
  return top.length ? top.join(' · ') : 'No dominant lines';
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

/** Resolve a trade-lane destination station into a click-target for the course intents. */
export function tradeLaneTarget(state, stationId) {
  if (!state || !stationId) return null;
  const pos = stationPositionById(state, stationId);
  const sectorId = stationSectorIdById(state, stationId)
    || (pos ? currentSectorId(state) : null);
  const rec = findStationRecord(state, stationId);
  return {
    id: stationId,
    kind: 'station',
    name: stationNameById(state, stationId),
    x: pos ? pos.x : null,
    z: pos ? pos.z : null,
    entityId: null,
    stationId,
    factionId: (rec && rec.factionId) || null,
    sectorId,
  };
}

/**
 * Best remembered sell offers for one commodity across every station the pilot has priced.
 * Pure; age-tinted by quote freshness. Used by the strategy deck's market intel section.
 */
export function bestKnownSellOffers(state, commodityId, limit = 3) {
  if (!state || !commodityId) return [];
  const memory = state.player && state.player.marketMemory;
  const nowS = Math.max(0, Number(state.simTime) || 0);
  const quotes = knownStationQuotes(memory, commodityId, nowS) || [];
  return quotes
    .slice()
    .sort((a, b) => (b.sell - a.sell) || (a.ageS - b.ageS))
    .slice(0, Math.max(1, limit))
    .map((quote) => ({
      ...quote,
      stationName: stationNameById(state, quote.stationId),
    }));
}

function missionSummary(mission) {
  if (!mission) return 'Proceed to the objective';
  const progress = Math.max(0, Number(mission.objectiveProgress) || 0);
  const target = Math.max(1, Number(mission.objectiveTarget) || 1);
  if (mission.type === 'mining_quota') return `Mine ${progress}/${target} units`;
  if (mission.type === 'bulk_haul') return `Haul ${progress}/${target} bulk units`;
  if (mission.type === 'bulk_trade') return `Sell ${progress}/${target} units`;
  if (mission.type === 'patrol_clear') return `Clear ${progress}/${target} hostiles`;
  if (mission.type === 'recon_scan') return `Scan ${progress}/${target} sites`;
  return mission.objectiveProgress ? `${progress}/${target}` : 'Proceed to the objective';
}

/**
 * Chart title for a mission. Instances are stamped with `title` (systems/missions.js
 * `_instanceFromOffer`) and never with `name`, so the older `mission.name` read fell through to the
 * placeholder on every live contract. `name` stays in the chain for authored/legacy shapes.
 */
function missionChartTitle(mission) {
  if (!mission) return 'Contract Objective';
  const title = String(mission.title || mission.name || '').trim();
  return title || 'Contract Objective';
}

/**
 * One dry line of leg prose for the inspector. Prefers an authored `brief`, then a per-step brief
 * for multi-stage contracts, then the mechanical progress summary. Defensive by design: a mission
 * that carries none of these still reads correctly.
 */
function missionChartBrief(mission) {
  if (!mission) return '';
  let brief = mission.brief;
  // Multi-stage contracts may carry per-stage prose keyed by stage id. No generator writes this
  // yet — it is a reader seam so a set-piece can light it up without touching the map — so the
  // key must be a real stage identity, never the offer id it was rolled from.
  if (!brief && mission.stepBriefs && typeof mission.stepBriefs === 'object') {
    const stepId = mission.stepId || mission.stageId;
    if (stepId) brief = mission.stepBriefs[stepId];
  }
  const text = String(brief || '').trim();
  return text || missionSummary(mission);
}

/**
 * Mission block for the inspector — record title, one dry line of leg prose, and a progress meter
 * when the contract has a countable objective. Deliberately free of elapsed/remaining clocks: the
 * inspector caches on rendered HTML, so per-frame text would force a DOM write every refresh and
 * break the no-churn contract.
 */
function missionChartBlockHtml(mission, sectionTitle, geometry) {
  if (!mission) return '';
  const progress = Math.max(0, Number(mission.objectiveProgress) || 0);
  const target = Math.max(0, Number(mission.objectiveTarget) || 0);
  let meter = '';
  if (target > 0) {
    const pct = Math.max(0, Math.min(100, Math.round((progress / target) * 100)));
    meter = `
          <div class="gm-mission-meter" role="img" aria-label="Objective ${pct} percent complete">
            <span class="gm-mission-meter-fill" style="width:${pct}%"></span>
          </div>`;
  }
  // Multi-point contracts say so: a patrol with four marks reads very differently from an errand.
  //
  // The count is deliberately "still on the chart", NOT "cleared". A cleared count cannot be derived
  // from this geometry: a killed target is filtered out of `mission.targetEntityIds` by
  // systems/missions.js AND swap-removed from the entity list end-of-step, so its point does not
  // survive to be counted as done — it simply stops existing. Reading `done` here reported 0 cleared
  // forever while the denominator shrank with each kill, which inverts the truth. The meter above
  // already carries progress from the mission's own counters; this row answers the different
  // question of how many marks the pilot is still looking at.
  let pointsRow = '';
  if (Array.isArray(geometry) && geometry.length > 1) {
    pointsRow = `
          <div class="gm-ins-row"><span>Marked points</span><span class="gm-ins-row-val">${geometry.length} on chart</span></div>`;
  }
  return `
        <div class="gm-ins-section">
          <div class="gm-ins-title" style="color:${INK.amberHot};">${escapeMapHtml(sectionTitle)}</div>
          <div class="gm-mission-name">${escapeMapHtml(missionChartTitle(mission))}</div>
          <div class="gm-mission-brief">${escapeMapHtml(missionChartBrief(mission))}</div>${meter}${pointsRow}
        </div>
      `;
}

function securityPips(sec) {
  if (sec >= 0.7) return `<span style="color:${INK.good}; letter-spacing: 2px;">●●●</span>`;
  if (sec >= 0.4) return `<span style="color:#e3c25c; letter-spacing: 2px;">●●○</span>`;
  if (sec >= 0.15) return `<span style="color:${INK.warn}; letter-spacing: 2px;">●○○</span>`;
  return `<span style="color:${INK.red}; letter-spacing: 2px;">○○○</span>`;
}
function dangerColor(v) {
  if (v < 0.28) return INK.good;
  if (v < 0.50) return '#e3c25c';
  if (v < 0.72) return INK.warn;
  return INK.red;
}
function pressureColor(v) {
  if (v > 0.08) return INK.warn;
  if (v < -0.08) return INK.teal;
  return INK.ink2;
}

function mapPercent(value, signed = false) {
  const n = Math.max(signed ? -1 : 0, Math.min(1, Number(value) || 0));
  const rounded = Math.round(n * 100);
  return `${signed && rounded > 0 ? '+' : ''}${rounded}%`;
}

function mapTrendWord(axis, value) {
  const n = Number(value) || 0;
  const words = axis === 'danger'
    ? { up: 'rising', down: 'easing', flat: 'steady' }
    : axis === 'pricePressure'
      ? { up: 'climbing', down: 'falling', flat: 'steady' }
      : { up: 'consolidating', down: 'slipping', flat: 'holding' };
  if (n > 1e-4) return words.up;
  if (n < -1e-4) return words.down;
  return words.flat;
}

function mapPressureLabel(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) < 0.06) return 'Balanced';
  return n > 0 ? 'Scarcity' : 'Surplus';
}

function escapeMapHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Safe HTML for one dynamic map-search row, including imported-save claim names. */
export function mapSearchItemHtml(target, index = 0) {
  const t = target || {};
  return `
    <div class="gm-search-item ${index === 0 ? 'selected' : ''}" data-idx="${index}">
      <span class="gm-search-item-name">${escapeMapHtml(t.name)}</span>
      <div class="gm-search-item-detail">${escapeMapHtml(t.detail)}</div>
    </div>
  `;
}

/** Safe claim-inspector markup. Claim names are persisted and may originate in imported saves. */
export function claimInspectorHtml(target) {
  const t = target || {};
  const color = t.color || INK.amberHot; // specialization data owns this value; saves do not.
  return `
    <div class="gm-ins-section">
      <div class="gm-ins-kind">Claim record · ${escapeMapHtml(t.status || 'ACTIVE')}</div>
      <div class="gm-ins-target-name" style="color:${color};">${escapeMapHtml(t.name)}</div>
      <div class="gm-ins-note">PLAYER-OWNED ${escapeMapHtml(t.role || 'BASE')}</div>
    </div>

    <div class="gm-ins-section">
      <div class="gm-ins-title">Operations</div>
      <div class="gm-ins-row"><span class="gm-ins-row-val" style="text-align:left;">${escapeMapHtml(t.statusLine || 'No live operating telemetry.')}</span></div>
      <div class="gm-ins-note" style="margin-top:7px; color:var(--ink);">${escapeMapHtml(t.playerVerb || 'Fly to the base.')}</div>
      <div class="gm-ins-note" style="margin-top:5px;">${escapeMapHtml(t.consequence || '')}</div>
      <div class="gm-ins-note" style="margin-top:5px; color:${color};">${escapeMapHtml(t.riskLine || '')}</div>
    </div>
  `;
}

export function galaxyPresenceMarkerRows(presence = []) {
  return (Array.isArray(presence) ? presence : []).map((row, index) => Object.freeze({
    factionId: row && row.factionId || null,
    label: row && row.factionName || factionNameOf(row && row.factionId),
    color: row && row.color || factionColorOf(row && row.factionId),
    phase: row && row.phase || 'active',
    offsetY: index * 11,
  }));
}

export function galaxyPresenceInspectorHtml(presence = []) {
  const rows = galaxyPresenceMarkerRows(presence);
  if (!rows.length) return '';
  return `
    <div class="gm-ins-section gm-ins-presence">
      <div class="gm-ins-title">Presence</div>
      ${rows.map((row) => `
        <div class="gm-ins-row gm-ins-presence-row">
          <span><span aria-hidden="true" style="display:inline-block;width:7px;height:7px;margin-right:6px;transform:rotate(45deg);background:${row.color};"></span>${escapeMapHtml(row.label)}</span>
          <span class="gm-ins-row-val" style="color:${row.color}">${escapeMapHtml(row.phase)}</span>
        </div>`).join('')}
    </div>`;
}

export function visibleGalaxyPresence(model, factionLayerVisible = true) {
  if (!factionLayerVisible || !model || !Array.isArray(model.nodes)) return [];
  return model.nodes.filter((node) => node && node.charted)
    .flatMap((node) => node.presence || []);
}

/** Keep the canvas' accessible name synchronized with the visible map scale. */
export function setMapCanvasAriaLabel(canvas, level, ownership = [], options = {}) {
  if (!canvas || typeof canvas.setAttribute !== 'function') return '';
  if (level === 'galaxy' && options && options.chartedCount === 0) {
    const empty = 'Galaxy map. No charted sectors.';
    canvas.setAttribute('aria-label', empty);
    return empty;
  }
  const scale = level === 'local' ? 'Local' : level === 'system' ? 'System' : 'Galaxy';
  const detail = level === 'galaxy'
    ? (Array.isArray(ownership) && ownership.length
      ? ` Presence: ${[...new Set(ownership.map((row) => row.factionName || factionNameOf(row.factionId)).filter(Boolean))].join(', ')}.`
      : '')
    : Array.isArray(ownership) && ownership.length
      ? ` ${ownership.map((marker) => `${marker.name}: ${marker.statusLine}`).join('; ')}`
      : ' No owned bases in this sector.';
  const label = `${scale} navigation map.${detail}`;
  canvas.setAttribute('aria-label', label);
  return label;
}

function sectorCauseIntelHtml(cause) {
  if (!cause) return '';
  const trend = cause.trend || {};
  const controlName = factionNameOf(cause.dominantFactionId || cause.ownerId);
  const receipts = (cause.receipts || []).slice(0, 3);
  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  let html = `
    <div class="gm-ins-section">
      <div class="gm-ins-title">Current Conditions</div>
      <div class="gm-ins-row">
        <span>Danger</span>
        <span class="gm-ins-row-val" style="color:${dangerColor(cause.danger)}">${mapPercent(cause.danger)} · ${mapTrendWord('danger', trend.danger)}</span>
      </div>
      <div class="gm-meter"><i style="width:${Math.round(clamp01(cause.danger) * 100)}%; background:${dangerColor(cause.danger)};"></i></div>
      <div class="gm-ins-row">
        <span>Price pressure</span>
        <span class="gm-ins-row-val">${mapPressureLabel(cause.pricePressure)} ${mapPercent(cause.pricePressure, true)} · ${mapTrendWord('pricePressure', trend.pricePressure)}</span>
      </div>
      <div class="gm-ins-row">
        <span>Control</span>
        <span class="gm-ins-row-val" style="color:${factionColorOf(cause.dominantFactionId || cause.ownerId)}">${escapeMapHtml(controlName)} · ${mapPercent(cause.dominantInfluence)} · ${mapTrendWord('influence', trend.influence)}</span>
      </div>
      <div class="gm-meter"><i style="width:${Math.round(clamp01(cause.dominantInfluence) * 100)}%; background:${factionColorOf(cause.dominantFactionId || cause.ownerId)};"></i></div>
    </div>
  `;
  if (receipts.length) {
    html += `
      <div class="gm-ins-section">
        <div class="gm-ins-title">Why it changed</div>
        ${receipts.map((receipt) => `<div class="gm-ins-note" style="margin-top:4px;">${escapeMapHtml(receipt.line)}</div>`).join('')}
      </div>
    `;
  }
  return html;
}

// ---------------------------------------------------------------------------------------------
// Pure Dijkstra Hover preview path calculator
// ---------------------------------------------------------------------------------------------

export function computePreviewRoute(state, startSectorId, targetSectorId) {
  if (!startSectorId || !targetSectorId || startSectorId === targetSectorId) return null;
  const sectors = sectorRecords(state);
  const nodeById = new Map(sectors.map((s) => [s.id, s]));

  const dist = new Map();
  const prev = new Map();
  const visited = new Set();
  const pq = [startSectorId];

  dist.set(startSectorId, 0);

  while (pq.length) {
    let bi = 0;
    for (let i = 1; i < pq.length; i++) {
      if ((dist.get(pq[i]) ?? Infinity) < (dist.get(pq[bi]) ?? Infinity)) bi = i;
    }
    const u = pq.splice(bi, 1)[0];
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === targetSectorId) break;

    const su = nodeById.get(u);
    if (!su) continue;

    const neighbors = Array.isArray(su.neighbors) ? su.neighbors : [];
    for (const v of neighbors) {
      const sv = nodeById.get(v);
      if (!sv) continue;
      const isCharted = isSectorCharted(state, sv);
      if (!isCharted && v !== targetSectorId) continue;

      const alt = (dist.get(u) ?? 0) + 1;
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt);
        prev.set(v, u);
        pq.push(v);
      }
    }
  }

  if (!prev.has(targetSectorId)) return null;

  const path = [];
  let curr = targetSectorId;
  while (curr) {
    path.push(curr);
    curr = prev.get(curr);
  }
  return path.reverse();
}

/**
 * Format route cost without introducing a second fuel model in the map.
 *
 * A world-owned plan may report the total directly or through its authored legs. The local graph
 * fallback can establish reachability and hop count only, so it must refuse to guess at fuel.
 */
export function formatRoutePlanCost(route, fallbackPath = null) {
  if (route && typeof route === 'object') {
    const legs = Array.isArray(route.legs) ? route.legs : [];
    const reportedHops = Number(route.totalHops);
    const hops = Number.isFinite(reportedHops) && reportedHops >= 0
      ? Math.floor(reportedHops)
      : legs.length;
    let fuel = Number(route.totalFuel);
    if (!Number.isFinite(fuel) && legs.length && legs.every((leg) => Number.isFinite(Number(leg && leg.fuel)))) {
      fuel = legs.reduce((sum, leg) => sum + Number(leg.fuel), 0);
    }
    if (hops > 0 && Number.isFinite(fuel) && fuel >= 0) {
      return `${hops} ${hops === 1 ? 'Jump' : 'Jumps'} (Fuel: ${Math.round(fuel)} Units)`;
    }
  }

  if (Array.isArray(fallbackPath) && fallbackPath.length > 1) {
    const hops = fallbackPath.length - 1;
    return `${hops} ${hops === 1 ? 'Jump' : 'Jumps'} (Fuel unavailable)`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Search Target Gathering Helper
// ---------------------------------------------------------------------------------------------

function getSearchTargets(state, level, curSecId, claimsSystem = null, isHostile = null) {
  const targets = [];
  // 1. Sectors
  const galaxyModel = buildGalaxyModel(state);
  for (const n of galaxyModel.nodes) {
    if (n.charted) {
      targets.push({
        id: n.id,
        name: n.name,
        kind: 'sector',
        sectorId: n.id,
        x: n.x,
        y: n.y,
        factionId: n.factionId,
        security: n.security,
        presence: n.presence,
        searchText: n.searchText,
        detail: `Sector · ${factionNameOf(n.factionId)} · Sec: ${n.security ? n.security.toFixed(2) : '0.00'}`,
      });
    }
  }
  // 2. Stations / Gates / POIs
  const systemModel = buildSystemModel(state, curSecId, { claimsSystem });
  for (const p of systemModel.points) {
    if (Number.isFinite(p.x) && Number.isFinite(p.z)) {
      targets.push({
        id: p.id,
        name: p.name,
        kind: p.kind,
        sectorId: curSecId,
        x: p.x,
        z: p.z,
        // Carry the draw frame too: selecting a result centers the SYSTEM camera, which projects
        // sector-local, while x/z must stay global for the course action on the same target.
        drawPos: p.drawPos,
        stationId: p.stationId,
        entityId: p.entityId || null,
        targetSectorId: p.targetSectorId || null,
        factionId: p.factionId,
        searchText: p.searchText,
        mapKind: p.mapKind,
        stageId: p.stageId,
        stageLabel: p.stageLabel,
        coursePos: p.coursePos,
        courseLabel: p.courseLabel,
        courseArrivalRadius: p.courseArrivalRadius,
        statusLine: p.statusLine,
        ledger: p.ledger,
        history: p.history,
        detail: `${p.kind.toUpperCase()} · ${factionNameOf(p.factionId)}${p.statusLine ? ` · ${p.statusLine}` : ''}`,
      });
    }
  }
  for (const marker of systemModel.ownership) {
    targets.push({
      ...marker,
      kind: 'claim',
      sectorId: curSecId,
      entityId: marker.targetEntityId,
      detail: `Owned base · ${marker.statusLine}`,
    });
  }
  // 3. Contacts
  if (level === 'local') {
    // The active objective marker is a first-class searchable target. Its label can be more
    // specific than the underlying entity name (for example, the 47-A recovery rock), so merely
    // searching the ambient contact list can never resolve the exact marker the canvas exposes.
    const goal = activeMapGoal(state);
    const waypoint = state && state.nav && state.nav.waypoint;
    if (goal && goal.pos) {
      targets.push({
        id: goal.id,
        name: goal.label,
        kind: 'waypoint',
        x: goal.pos.x,
        z: goal.pos.z,
        targetEntityId: waypoint && waypoint.targetEntityId != null ? waypoint.targetEntityId : null,
        missionId: goal.missionId,
        objective: true,
        markerKind: goal.markerKind,
        detail: 'Active objective · Navigation fix',
      });
    }
    // Search results must carry the same scanner classification as the painted LOCAL layer.
    // Falling back to data.hostile here made named accepted warrants inspect as `Hostile NO`
    // even while targeting and the canvas correctly treated the entity as hostile.
    const localModel = buildLocalModel(state, isHostile, { claimsSystem });
    for (const c of localModel.contacts) {
      targets.push({
        id: c.id,
        name: c.name,
        kind: c.kind,
        x: c.x,
        z: c.z,
        entityId: c.entityId,
        factionId: c.factionId,
        hostile: c.hostile,
        detail: `Contact · ${c.kind.toUpperCase()}`,
      });
    }
  }
  return targets;
}

// WEATHER_TERM_PHRASES — the enumerated phrase bank for the Chart header's pressure terms.
// Instrument grammar §11.1 rule 3: the UI never invents; explanatory phrases come from an
// enumerated bank, and an id with no entry renders NOTHING. These ids are produced only by
// _weatherSnapshot below, and they were previously printed verbatim to the player
// ("insecure +0.01") — leftover engine vocabulary on a shipping screen. Never re-inline
// `term.id` into the rendered text.
const WEATHER_TERM_PHRASES = Object.freeze({
  // About the PLACE
  zone: 'hostile ground',          // the local zone itself is threatening
  insecure: 'thin security',       // the sector's own security rating is low
  ecology: 'dangerous wildlife',   // regional ecology danger above its baseline
  // About the PLAYER
  cargo: 'valuable cargo aboard',  // the hold is worth stealing
  wanted: 'you are wanted',        // the player is wanted
  noise: 'your mining is loud',    // mining noise is drawing attention
  bounty: 'price on your head',    // a bounty is out on the player
});

// ---------------------------------------------------------------------------------------------
// Flagship Screen Implementation
// ---------------------------------------------------------------------------------------------

export const galaxyMapScreen = {
  id: 'galaxyMap',
  data: { autoFocus: false },
  _ctx: null,
  _root: null,
  _body: null,
  _canvas: null,
  _g: null,
  _ro: null,
  _visible: false,
  _animFrame: null,
  _lastDrawTime: 0,
  _dpr: 1,
  _lastCw: 0,
  _lastCh: 0,
  _zoom: 1,
  _targetZoom: 1,
  // SLICE B — the continuous map camera (ADR D3), introduced ALONGSIDE `_zoom` rather than in place
  // of it. `_camera` is the authority for {focusGlobal, spanWU}; `_zoom` is kept as a DERIVED mirror
  // so the three level-draw dispatches, the scale rail and every currently-green check keep reading
  // the value they already read. Migration is therefore playable at every step: nothing observes a
  // half-migrated state, because the legacy state is never stale — `_syncLegacyFromCamera` rewrites
  // it from the camera on every camera change.
  _camera: null,
  _lastNavContext: null,
  _navContextKey: null,
  // Display-only planner preview toward an accepted contract's destination, memoised on
  // {origin > destination}. Never assigned to `nav.route` — see `_previewRouteTo`.
  _previewRoute: null,
  _previewRouteKey: null,
  _previewRouteStatus: null,
  // Contextual reveal bookkeeping for the alternatives rail — see `_revealAlternatives`.
  _altRevealedFor: null,
  _altAutoOpened: false,
  _plotButton: null,
  _plotReason: null,
  _plotHandler: null,
  _lastFramingActions: null,
  _returnShipButton: null,
  _frameBothButton: null,
  _frameReason: null,
  _framingHandler: null,
  _lastTime: 0,
  _view: null,
  _clickTargets: [],
  _lastLabelLayout: [],
  _isHostile: isHostileToPlayer,
  _inspectorDetails: null,
  _setCourseButton: null,
  _engageButton: null,
  _engageReason: null,
  _engageHandler: null,
  _engageSubscribed: false,
  _inspectorDetailsHtml: null,
  _setCourseHandler: null,
  _scaleButtons: [],
  // LOCAL contact memory. Cosmetic, screen-owned, never written into sim state.
  _localIntel: null,
  _localIntelSectorId: null,
  // Release handle for the entity:killed subscription (see _subscribeKills).
  _killUnsub: null,
  // Offscreen tile for the static table (see _paintGround); invalidated on resize.
  _groundTile: null,
  _groundKey: '',
  // simTime of the last intel sync, so a paused sim does not re-observe identical tracks per frame.
  _localIntelSyncedAtS: -1,
  // Motion preference, sampled at show time (see _syncReduceMotion).
  _reduceMotion: false,

  // --- SLICE C: information in depth --------------------------------------------------------
  // Which inspector tab is showing. Exactly one at a time — that is the disclosure mechanism.
  _activeTab: 'overview',
  _tabButtons: [],
  _tabPanel: null,
  _lastTabHtml: null,
  _placeActionsEl: null,
  _lastPlaceActionsHtml: null,
  // Camera bookmarks. SCREEN-OWNED and deliberately not sim state: a bookmark is a saved view of
  // the chart, not a fact about the universe, and writing it into gameState would widen the save
  // shape and the golden surface for a purely cosmetic convenience. Same posture as `_localIntel`.
  _bookmarks: [],
  _ribbonEl: null,
  _lastRibbonKey: null,
  // Separate, coarser key for the action row so live ETA churn cannot steal keyboard focus from
  // the Disengage button mid-transit. See the note in _updateRibbon.
  _lastRibbonActionKey: null,
  _ribbonHandler: null,
  _weatherEl: null,
  _lastWeatherKey: null,
  _deckEl: null,
  _deckTableEl: null,
  _deckSortBtn: null,
  _deckSortMode: 'best',
  _deckRoutes: [],
  _lastDeckKey: null,
  _deckHandler: null,
  _busUnsubs: [],
  _scanSweepUntil: 0,
  _localLiveContacts: 0,

  _claimsSystem() {
    const registry = this._ctx && this._ctx.registry;
    return registry && typeof registry.get === 'function' ? registry.get('claims') : null;
  },

  /**
   * Rectangles the label solver must route around, shared by all three levels.
   *
   * `layoutMapLabels` already does deterministic decluttering and already accepts `reserved` — the
   * brief says extend it, not write a second solver, so the new furniture is expressed as more
   * reserved rectangles rather than as a competing pass. Anything drawn on the shared path after
   * the level (the cartouche today) belongs here, or labels get placed underneath it and the
   * overlap defect comes back wearing new geometry.
   */
  _reservedLabelRects(w, h, extra = []) {
    const rects = Array.isArray(extra) ? extra.filter(Boolean).slice() : [];
    const rows = this._lastNavContext && this._lastNavContext.rows;
    const bounds = navCartoucheBounds(rows ? rows.length : 0, w, h);
    if (bounds) {
      rects.push({
        // A few pixels of breathing room, so a label may not merely avoid overlapping the plate but
        // must clear its edge — abutting text reads as an overlap even when it technically is not.
        x: bounds.x - 4,
        y: bounds.y - 4,
        width: bounds.width + 8,
        height: bounds.height + 8,
      });
    }
    return rects;
  },

  /**
   * Seed the unified camera from an applied map-open intent.
   *
   * `applyMapOpenIntentToView` remains the authority for WHERE the map opens — it is pinned by
   * `check:map-authority` and is not touched by this wave. This reads the view it produced and
   * expresses the same destination once, in the global frame.
   *
   * The one thing it must not do is trust `view.cams.system` as a global position: that camera lives
   * in the sector-local draw frame, so lifting it needs the sector origin. Reading it raw would put
   * the camera 12,288 WU off in Tethys — the defect this program exists to fix, re-entering through
   * the open path.
   */
  _adoptCameraFromLegacyView(state, view) {
    const level = levelForZoom(view && Number.isFinite(view.zoom) ? view.zoom : this._zoom);
    const player = state ? playerEntity(state) : null;
    const playerGlobal = player && player.pos ? { x: player.pos.x, z: player.pos.z } : null;
    const sid = state ? currentSectorId(state) : null;
    const cams = (view && view.cams) || this._cams;

    let focusGlobal = null;
    if (level === 'local' && cams && cams.local
      && Number.isFinite(cams.local.cx) && Number.isFinite(cams.local.cy)) {
      // LOCAL's camera is already global.
      focusGlobal = { x: cams.local.cx, z: cams.local.cy };
    } else if (level === 'system' && cams && cams.system
      && Number.isFinite(cams.system.cx) && Number.isFinite(cams.system.cy)) {
      focusGlobal = sectorLocalToGlobalForSector({ x: cams.system.cx, z: cams.system.cy }, sid);
    } else if (level === 'galaxy' && cams && cams.galaxy
      && Number.isFinite(cams.galaxy.cx) && Number.isFinite(cams.galaxy.cy)) {
      // GALAXY's camera is in authored graph units — one lattice cell per unit.
      focusGlobal = {
        x: cams.galaxy.cx * SECTOR_ORIGIN_LATTICE_WU,
        z: cams.galaxy.cy * SECTOR_ORIGIN_LATTICE_WU,
      };
    }
    const preset = framePreset(level, { playerGlobal, sectorId: sid, focusGlobal });
    this._camera = createMapCamera({
      focusGlobal: focusGlobal || preset.focusGlobal,
      spanWU: preset.spanWU,
      minSpanWU: MAP_SPAN_MIN_WU,
      maxSpanWU: MAP_SPAN_MAX_WU,
    });
    this._syncLegacyFromCamera();
    return this._camera;
  },

  /**
   * The live camera, lazily seeded from whatever the legacy zoom/level state currently says.
   *
   * Seeding FROM the legacy state (rather than from a constant) is what makes this migration
   * playable: the first camera read reproduces the view the player is already looking at, so
   * introducing the camera changes nothing on screen until something deliberately moves it.
   */
  _cameraOrInit() {
    if (this._camera) return this._camera;
    const state = this._ctx && this._ctx.state;
    const level = levelForZoom(this._zoom);
    const player = state ? playerEntity(state) : null;
    const preset = framePreset(level, {
      playerGlobal: player && player.pos ? { x: player.pos.x, z: player.pos.z } : null,
      sectorId: state ? currentSectorId(state) : null,
    });
    this._camera = createMapCamera({
      focusGlobal: preset.focusGlobal,
      spanWU: preset.spanWU,
      minSpanWU: MAP_SPAN_MIN_WU,
      maxSpanWU: MAP_SPAN_MAX_WU,
    });
    return this._camera;
  },

  /**
   * Push the camera down into the legacy state the draw sites still read.
   *
   * `_zoom` is derived here and NOWHERE else once a camera exists, which is the property that keeps
   * the two representations from disagreeing. `spanForZoom`/`zoomForSpan` are exact inverses and
   * `levelForSpan` is defined by the same inequalities as `levelForZoom`, so the level this
   * computes is identical to the level the legacy scalar would have chosen — that identity is what
   * lets every existing map check keep passing unmodified.
   */
  _syncLegacyFromCamera() {
    const cam = this._camera;
    if (!cam) return;
    const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomForSpan(cam.spanWU)));
    this._zoom = zoom;
    this._targetZoom = zoom;

    const level = levelForSpan(cam.spanWU);
    const state = this._ctx && this._ctx.state;
    const focus = cam.focusGlobal;
    const target = this._cams[level];
    if (target) {
      if (level === 'galaxy') {
        // GALAXY's draw frame is the authored sector GRAPH (small integers), one graph unit per
        // lattice cell. Converting here rather than at the draw site keeps the single conversion in
        // one place — see the same conversion in buildGalaxyModel's player mark.
        target.cx = focus.x / SECTOR_ORIGIN_LATTICE_WU;
        target.cy = focus.z / SECTOR_ORIGIN_LATTICE_WU;
      } else if (level === 'system') {
        // SYSTEM's draw frame is sector-local for the sector being surveyed (ADR D2.1). Handing it
        // the raw global focus would park the camera a whole sector origin away — 12,288 WU at
        // Tethys — which is the exact defect this program exists to fix, merely relocated to the
        // camera.
        const local = globalToSectorLocalForSector(
          { x: focus.x, z: focus.z },
          state ? currentSectorId(state) : null,
        );
        target.cx = local.x;
        target.cy = local.z;
      } else {
        // LOCAL already works in the global frame.
        target.cx = focus.x;
        target.cy = focus.z;
      }
    }
    this._syncScaleButtons();
  },

  /**
   * The four always-present navigation answers, resolved ONCE per draw and shared by the cartouche,
   * the framing controls and the aria label.
   *
   * Resolving them once is the point, not an optimisation: the cartouche saying one thing while the
   * "frame ship and destination" button targets another is precisely the class of contradiction the
   * readout exists to remove. Everything here is a pure read of state; the derivation lives in
   * src/ui/map/mapNavContext.js.
   */
  _navContext(state) {
    if (!state) return resolveMapNavContext();
    const player = playerEntity(state);
    const nav = state.nav || {};

    // Memoised on the inputs that can change the readout. `_draw` runs at display refresh at LOCAL
    // scale, and the readout allocates a deeply-frozen address record plus four frozen rows — doing
    // that 60 times a second to re-render four identical strings is waste on a machine that may be
    // running a software renderer. The player position is quantised to 1 WU because sub-unit drift
    // cannot change any displayed value (distances round to whole WU, progress to whole percent).
    const goal = activeMapGoal(state);
    const executor = readRouteExecutorForMap(nav.executor);
    const missionDestination = resolveMissionDestination(state);
    const key = [
      player && player.pos ? Math.round(player.pos.x) : 'x',
      player && player.pos ? Math.round(player.pos.z) : 'z',
      currentSectorId(state),
      goal ? `${goal.label}|${goal.sectorId}|${goal.pos ? Math.round(goal.pos.x) : ''}|${goal.pos ? Math.round(goal.pos.z) : ''}` : '-',
      executor ? `${executor.status}|${executor.legIndex}|${executor.legCount}|${executor.destinationSectorId}|${executor.legLabel}` : '-',
      nav.route && Array.isArray(nav.route.legs) ? nav.route.legs.map((l) => `${l.from}>${l.to}`).join(',') : '-',
      missionDestination ? `${missionDestination.missionId}|${missionDestination.sectorId}` : '-',
    ].join('#');
    if (this._navContextKey === key && this._lastNavContext) return this._lastNavContext;
    this._navContextKey = key;

    // The preview is computed ONLY when there is nothing plotted — a laid course always outranks
    // intent, and running the planner behind a live route would be wasted work every frame. It is
    // handed in for DISPLAY and is never assigned to `nav.route`: previewing a path must not become
    // a silent plot, or the separation ADR D6 requires would exist only in the button labels.
    const previewRoute = (!nav.route && missionDestination)
      ? this._previewRouteTo(missionDestination.sectorId)
      : null;

    return resolveMapNavContext({
      playerGlobal: player && player.pos ? { x: player.pos.x, z: player.pos.z } : null,
      playerSectorId: currentSectorId(state),
      goal,
      route: nav.route || null,
      executor,
      missionDestination,
      previewRoute,
      sectorNames: SECTOR_NAME_BY_ID,
    });
  },

  /**
   * Run the SHIPPED planner for a look, without committing to it.
   *
   * Deliberately `world.computeRoute` and nothing else — ADR D6 forbids new planning math in the
   * map, and a second planner here would be free to disagree with the one that actually flies the
   * ship. `computeRoute` is a pure read (it walks the discovered graph and returns a fresh record),
   * so calling it for a preview cannot move the simulation.
   *
   * Memoised on {origin, destination} because `_navContext` is reached from `_draw`, which runs at
   * display refresh at LOCAL scale — a Dijkstra per frame for an unchanging answer is exactly the
   * kind of cost the map cannot afford on a software renderer.
   */
  _previewRouteTo(destSectorId) {
    const state = this._ctx && this._ctx.state;
    if (!state || !destSectorId) return null;
    const here = currentSectorId(state);
    if (!here || here === destSectorId) return null;
    // Discovery is part of the key because `computeRoute` only walks DISCOVERED space: charting a
    // new sector can shorten the path, and a memo keyed on endpoints alone would keep showing the
    // longer one for the rest of the session.
    const discovery = state.world && state.world.discovery;
    const charted = discovery ? Object.keys(discovery).length : 0;
    const key = `${here}>${destSectorId}#${charted}`;
    if (this._previewRouteKey === key) return this._previewRoute;
    const world = this._ctx && this._ctx.registry && typeof this._ctx.registry.get === 'function'
      ? this._ctx.registry.get('world') : null;
    let route = null;
    let status = 'unavailable';
    if (world && typeof world.computeRoute === 'function') {
      try {
        route = world.computeRoute(destSectorId, 'fuel');
        status = route ? 'ready' : 'unreachable';
      } catch {
        route = null;
      }
    }
    this._previewRouteKey = key;
    this._previewRoute = route;
    this._previewRouteStatus = status;
    return route;
  },

  // Flagship strategic table UI states
  _layers: {
    route: true,
    mission: true,
    market: true,
    events: true,
    security: true,
    faction: true,
    hazard: true,
    services: true,
    holdings: true,
    discovery: true
  },
  _cams: {
    galaxy: { cx: 0, cy: 0, zoom: 1.0 },
    system: { cx: 0, cy: 0, zoom: 1.5 },
    local: { cx: 0, cy: 0, zoom: 1.5 },
  },
  _selectedTarget: null,
  _hoverTarget: null,
  _scanRings: [],
  _selectedCommodity: 'cmdty_ore_iron',
  _searchResultsList: [],
  _searchSelectedIdx: 0,
  _currentLayerFocus: 'route',
  _lastRouteDest: null,
  _routeAnimTime: 0,
  _animT: 0,
  _iris: null,
  _railMarker: null,

  mount(rootEl, ctx) {
    injectStyle();
    this._ctx = ctx;
    if (HAS_DOC && rootEl && this._setCourseButton && this._setCourseHandler) {
      this._setCourseButton.removeEventListener('click', this._setCourseHandler);
    }
    if (HAS_DOC && rootEl && this._engageButton && this._engageHandler) {
      this._engageButton.removeEventListener('click', this._engageHandler);
    }
    this._root = rootEl;
    if (!HAS_DOC || !rootEl) return this;

    rootEl.id = 'sf-galaxymap';
    if (rootEl.style && typeof rootEl.style.setProperty === 'function') {
      rootEl.style.setProperty('--gm-apron-h', 'clamp(168px, 26vh, 232px)');
    }
    const layerButtonById = new Map(LAYER_DEFS.map((layer) => [layer.id, `
            <button class="gm-layer-btn${this._layers[layer.id] ? ' active' : ''}" type="button" data-layer="${layer.id}" aria-pressed="${this._layers[layer.id] ? 'true' : 'false'}">
              <span class="gm-layer-ico" aria-hidden="true">${strokeSvg(layer.icon)}</span>
              <span class="gm-layer-name">${layer.name}</span>
              <span class="gm-layer-state" aria-hidden="true"></span>
            </button>`]));
    const layerButtonsHtml = LAYER_BANKS.map((bank) => `
              <div class="gm-layer-bank" data-layer-bank="${bank.id}">
                <div class="gm-layer-bank-title">${bank.label}</div>
                ${bank.layers.map((layerId) => layerButtonById.get(layerId) || '').join('')}
              </div>`).join('');
    const legendHtml = LEGEND_SERVICES.map((svc) => `
            <div class="gm-legend-row">
              <span class="gm-legend-ico" aria-hidden="true">${serviceIconSvg(svc)}</span>
              <span>${svc === 'ore_buy' ? 'Ore buy' : svc[0].toUpperCase() + svc.slice(1)}</span>
            </div>`).join('');
    const markLegendHtml = LEGEND_MARKS.map((mark) => `
            <div class="gm-legend-row">
              <span class="gm-legend-ico gm-legend-ico--mark" aria-hidden="true">${mark.svg}</span>
              <span>${mark.name}</span>
            </div>`).join('');
    const hintRowsHtml = HINT_ROWS.map(([label, keys]) => `
          <div class="gm-hint-row"><span>${label}</span><kbd>${keys}</kbd></div>`).join('');
    rootEl.innerHTML = `
      <div class="gm-head">
        <div class="gm-title-lockup">
          <div class="gm-title">Star Chart</div>
          <div class="gm-stamp">Nav chart / Survey table</div>
        </div>
        <div class="gm-search-container">
          <input type="text" class="gm-search-input" placeholder="Search galaxy… (Press /)" aria-label="Search map" tabindex="-1" />
          <span class="gm-search-kbd" aria-hidden="true">/</span>
          <div class="gm-search-results" hidden></div>
        </div>
        <div class="gm-rail">
          <span class="gm-rail-track" aria-hidden="true"><span class="gm-rail-marker"></span></span>
          <div class="gm-scale-buttons" role="group" aria-label="Map scale">
            <button class="gm-scale-btn" type="button" data-focus="local" aria-pressed="false">Local</button>
            <button class="gm-scale-btn" type="button" data-focus="system" aria-pressed="false">System</button>
            <button class="gm-scale-btn" type="button" data-focus="galaxy" aria-pressed="false">Galaxy</button>
          </div>
          <span class="gm-level">Scale <b data-level>GALAXY</b></span>
        </div>
        <div class="gm-weather" id="gm-crest-weather" role="status" aria-live="polite"></div>
        <button class="gm-hint-btn" type="button" aria-label="Map controls" aria-expanded="false">?</button>
        <button class="gm-close" type="button" aria-label="Close Map">Close</button>
        <div class="gm-hints" hidden>
          <div class="gm-hints-title">Chart controls</div>${hintRowsHtml}
          <div class="gm-hints-note">Edge ticks mark stations, gates, claims and hostiles that fall outside the current view. Click a tick to inspect it.</div>
        </div>
      </div>
      <div class="gm-body-container">
        <!-- ═══ LEFT RAIL ═══════════════════════════════════════════════════════════════════════
             SLICE C — PROGRESSIVE DISCLOSURE (ADR D9.9). This rail used to be four always-open
             stacked blocks (overlays, market intel, two legends) plus a footer. Every one of them
             was on glass at all times, including two pure reference legends the player consults
             perhaps twice — which is the reported density paradox exactly: "too little useful
             information, yet crowded".

             They are now disclosure sections and only ONE (Lenses, the primary tool) is open by
             default. Native details/summary elements are deliberate over a hand-rolled accordion:
             they are keyboard-operable, expose expanded/collapsed state to screen readers, and
             survive forced-colors without any JavaScript of ours. The information did not shrink;
             the default view did. -->
        <div class="gm-left-rail">
          <details class="gm-rail-sec" data-rail-sec="lenses" open>
            <summary class="gm-rail-sum"><span class="gm-rail-sum-t">Lenses</span><span class="gm-rail-sum-n" data-lens-count></span></summary>
            <div class="gm-rail-body">
              <div class="gm-layer-buttons">${layerButtonsHtml}
              </div>
              <div class="gm-rail-commodity">
                <label for="gm-commodity-select">Market lens · commodity</label>
                <select id="gm-commodity-select" aria-label="Select Commodity"></select>
              </div>
            </div>
          </details>

          <details class="gm-rail-sec" data-rail-sec="missions">
            <summary class="gm-rail-sum"><span class="gm-rail-sum-t">Missions</span><span class="gm-rail-sum-n" data-mission-count></span></summary>
            <div class="gm-rail-body" id="gm-rail-missions"></div>
          </details>

          <details class="gm-rail-sec" data-rail-sec="bookmarks">
            <summary class="gm-rail-sum"><span class="gm-rail-sum-t">Bookmarks</span><span class="gm-rail-sum-n" data-bookmark-count></span></summary>
            <div class="gm-rail-body" id="gm-rail-bookmarks"></div>
          </details>

          <details class="gm-rail-sec" data-rail-sec="alternatives">
            <summary class="gm-rail-sum"><span class="gm-rail-sum-t">Route alternatives</span></summary>
            <div class="gm-rail-body" id="gm-rail-alternatives"></div>
          </details>

          <details class="gm-rail-sec" data-rail-sec="key">
            <summary class="gm-rail-sum"><span class="gm-rail-sum-t">Chart key</span></summary>
            <div class="gm-rail-body">
              <div class="gm-rail-legend">
                <div class="gm-rail-title">Service marks</div>${legendHtml}
              </div>
              <div class="gm-rail-legend">
                <div class="gm-rail-title">Chart marks</div>${markLegendHtml}
              </div>
              <div class="gm-hint-text">A working instrument, not a picture: <b>double-click any mark to lay a course</b>. The <b>?</b> button in the header shows the full control key.</div>
            </div>
          </details>
        </div>

        <!-- Viewport -->
        <div class="gm-viewport">
          <canvas aria-label="Galaxy navigation map"></canvas>
        </div>

        <!-- ═══ RIGHT INSPECTOR ═════════════════════════════════════════════════════════════════
             SLICE C — DEPTH ON DEMAND. The inspector previously rendered its whole no-selection
             payload at once (command status + trade lanes + best-known quotes + a note). Now one
             tab is visible at a time and Overview is the default, so the panel answers the
             navigation questions first and everything else is one keystroke away rather than
             permanently stacked underneath.

             The tablist is a real ARIA tablist with roving tabindex and arrow-key traversal — see
             the _onTabKey handler. Tabs are NOT links and NOT divs-with-click. -->
        <div class="gm-right-inspector">
          <div class="gm-inspector-header">Inspector</div>
          <div class="gm-tabs" id="gm-tabs" role="tablist" aria-label="Inspector detail"></div>
          <div class="gm-inspector-content">
            <!-- Slice A: the two "never lost" framing controls. They live ABOVE the target actions
                 and are never hidden, because their whole job is to be reachable at the moment the
                 pilot has lost the thread — which is exactly when nothing is selected. Both follow
                 the shipped engage-button contract: visibly disabled plus a spoken reason, never a
                 silent no-op. -->
            <div class="gm-frame-group" role="group" aria-label="Chart framing">
              <button class="gm-ins-btn gm-frame-btn" id="gm-return-ship-btn" type="button" data-framing="return-to-ship" disabled aria-disabled="true">Return to ship</button>
              <button class="gm-ins-btn gm-frame-btn" id="gm-frame-both-btn" type="button" data-framing="frame-both" disabled aria-disabled="true">Frame ship + destination</button>
              <div class="gm-frame-reason" id="gm-frame-reason" aria-live="polite"></div>
            </div>
            <div class="gm-inspector-details" id="gm-tabpanel" role="tabpanel" tabindex="0">
              <div class="gm-inspector-empty">No target selected. <b>Click</b> a sector, station or contact to inspect it — <b>double-click</b> to lay a course.</div>
            </div>
            <button class="gm-ins-btn" id="gm-set-course-btn" type="button" hidden disabled>Set Waypoint</button>
            <!-- SECONDARY PLOT (ADR D6). Contextual, never permanent: it reveals ONLY when the
                 primary action is a commitment — "Set Course & Jump" for an adjacent sector — and
                 stays hidden whenever the primary already IS "Plot Course", so the chart never
                 shows two buttons that do the same thing. Without it, plot-without-committing was
                 unreachable for every neighbouring destination, which is most of them. -->
            <button class="gm-ins-btn gm-plot-btn" id="gm-plot-course-btn" type="button" hidden disabled>Plot Course</button>
            <div class="gm-plot-reason" id="gm-plot-reason" aria-live="polite"></div>
            <!-- W1-8: engage is a SEPARATE control from plot, never the same button. -->
            <button class="gm-ins-btn" id="gm-engage-route-btn" type="button" hidden disabled>Engage Route</button>
            <div class="gm-engage-reason" id="gm-engage-reason" aria-live="polite"></div>
            <!-- Place context actions for the current selection. Each one is resolved from real
                 state and ships disabled-with-a-reason when it has no consumer. -->
            <div class="gm-place-actions" id="gm-place-actions" role="group" aria-label="Place actions"></div>
          </div>
        </div>
      </div>
      <div class="gm-apron" id="gm-apron">
        <div class="gm-apron-ribbon">
          <div class="gm-ribbon" id="gm-route-ribbon" role="region" aria-label="Route" hidden>
            <div class="gm-ribbon-main">
              <div class="gm-ribbon-head">
                <span class="gm-ribbon-status" id="gm-ribbon-status"></span>
                <span class="gm-ribbon-arrival" id="gm-ribbon-arrival"></span>
              </div>
              <ol class="gm-ribbon-legs" id="gm-ribbon-legs"></ol>
              <div class="gm-ribbon-meta" id="gm-ribbon-meta"></div>
            </div>
            <div class="gm-ribbon-actions" id="gm-ribbon-actions" role="group" aria-label="Route control"></div>
            <div class="gm-ribbon-reason" id="gm-ribbon-reason" aria-live="polite"></div>
          </div>
        </div>
        <div class="gm-deck" id="gm-cargo-deck" aria-label="Cargo deck">
          <div class="gm-deck-head">
            <div class="gm-deck-title">Cargo deck</div>
            <button class="gm-deck-sort" id="gm-deck-sort" type="button" aria-label="Sort cargo deck routes">
              Sort · best
            </button>
          </div>
          <div class="gm-deck-table" id="gm-deck-table" role="list"></div>
        </div>
      </div>
    `;

    this._body = rootEl.querySelector('.gm-viewport');
    this._canvas = rootEl.querySelector('canvas');
    this._g = this._canvas.getContext('2d');
    this._inspectorDetails = rootEl.querySelector('.gm-inspector-details');
    this._setCourseButton = rootEl.querySelector('#gm-set-course-btn');
    this._engageButton = rootEl.querySelector('#gm-engage-route-btn');
    this._engageReason = rootEl.querySelector('#gm-engage-reason');
    this._plotButton = rootEl.querySelector('#gm-plot-course-btn');
    this._plotReason = rootEl.querySelector('#gm-plot-reason');
    if (!this._plotHandler) {
      this._plotHandler = () => galaxyMapScreen._activatePlotOnlyCourse();
    }
    if (this._plotButton) {
      this._plotButton.addEventListener('click', this._plotHandler);
    }
    this._inspectorDetailsHtml = null;
    if (!this._setCourseHandler) {
      this._setCourseHandler = () => galaxyMapScreen._activateSelectedCourse();
    }
    if (this._setCourseButton) {
      this._setCourseButton.addEventListener('click', this._setCourseHandler);
    }
    if (!this._engageHandler) {
      this._engageHandler = () => galaxyMapScreen._activateRouteEngage();
    }
    if (this._engageButton) {
      this._engageButton.addEventListener('click', this._engageHandler);
    }
    this._returnShipButton = rootEl.querySelector('#gm-return-ship-btn');
    this._frameBothButton = rootEl.querySelector('#gm-frame-both-btn');
    this._frameReason = rootEl.querySelector('#gm-frame-reason');
    if (!this._framingHandler) {
      this._framingHandler = (ev) => {
        const btn = ev && ev.currentTarget;
        galaxyMapScreen._activateFraming(btn && btn.getAttribute('data-framing'));
      };
    }
    for (const btn of [this._returnShipButton, this._frameBothButton]) {
      if (btn) btn.addEventListener('click', this._framingHandler);
    }
    // Strategy-deck trade-lane activation, delegated on the persistent details node so the
    // cached innerHTML refresh never strands the handler.
    if (this._inspectorDetails && typeof this._inspectorDetails.addEventListener === 'function') {
      this._inspectorDetails.addEventListener('click', (ev) => {
        const target = ev && ev.target;
        // J3 data-state verbs. Every EMPTY/LOADING/ERROR/DENIED block this pane renders carries a
        // way out; this is where those land. An unrecognised action does NOTHING rather than
        // guessing — the same discipline causeLedger applies to unknown driver tags.
        const stateVerb = target && typeof target.closest === 'function'
          ? target.closest('[data-sf-verb]') : null;
        if (stateVerb) {
          const action = stateVerb.getAttribute('data-sf-verb');
          if (action === 'economy:services') galaxyMapScreen._setTab('services', { focus: true });
          else if (action === 'economy:commodity') {
            const sel = galaxyMapScreen._root && galaxyMapScreen._root.querySelector('#gm-commodity-select');
            const focusable = sel && (sel.sfSelectField || sel);
            if (focusable && focusable.focus) { try { focusable.focus({ preventScroll: true }); } catch (_) { focusable.focus(); } }
          }
          return;
        }
        const siteRow = target && typeof target.closest === 'function'
          ? target.closest('[data-world-site-id]') : null;
        if (siteRow) {
          const state = galaxyMapScreen._ctx && galaxyMapScreen._ctx.state;
          const sectorId = siteRow.getAttribute('data-world-site-sector') || currentSectorId(state);
          const siteId = siteRow.getAttribute('data-world-site-id');
          const marker = worldSiteMapMarkers(state, sectorId).find((entry) => entry.id === siteId);
          if (marker) galaxyMapScreen._selectSearchTarget(marker);
          return;
        }
        const vestaRow = target && typeof target.closest === 'function'
          ? target.closest('[data-vesta-cache-id]') : null;
        if (vestaRow) {
          const state = galaxyMapScreen._ctx && galaxyMapScreen._ctx.state;
          const sectorId = vestaRow.getAttribute('data-vesta-cache-sector') || currentSectorId(state);
          const cacheId = vestaRow.getAttribute('data-vesta-cache-id');
          const readout = vestaOreCacheMapReadouts(state, sectorId)
            .find((entry) => entry && entry.cacheRecordId === cacheId);
          const marker = vestaOreCacheMapTarget(readout) || readout && readout.courseTarget && {
            ...readout.courseTarget,
            sectorId: readout.sectorId,
            phase: readout.phase,
            detail: readout.detail,
          };
          if (marker) galaxyMapScreen._selectSearchTarget(marker);
          return;
        }
        const pallasRow = target && typeof target.closest === 'function'
          ? target.closest('[data-pallas-cache-id]') : null;
        if (pallasRow) {
          const state = galaxyMapScreen._ctx && galaxyMapScreen._ctx.state;
          const sectorId = pallasRow.getAttribute('data-pallas-cache-sector') || currentSectorId(state);
          const cacheId = pallasRow.getAttribute('data-pallas-cache-id');
          const readout = pallasHiddenCacheMapReadouts(state, sectorId)
            .find((entry) => entry && entry.cacheRecordId === cacheId);
          const marker = pallasHiddenCacheMapTarget(readout) || readout && readout.courseTarget && {
            ...readout.courseTarget,
            sectorId: readout.sectorId,
            phase: readout.phase,
            detail: readout.detail,
          };
          if (marker) galaxyMapScreen._selectSearchTarget(marker);
          return;
        }
        const rumorRow = target && typeof target.closest === 'function'
          ? target.closest('[data-frontier-rumor-id]') : null;
        if (rumorRow) {
          const state = galaxyMapScreen._ctx && galaxyMapScreen._ctx.state;
          const sectorId = rumorRow.getAttribute('data-frontier-rumor-sector') || currentSectorId(state);
          const rumorId = rumorRow.getAttribute('data-frontier-rumor-id');
          const readout = frontierRumorMapReadouts(state, sectorId)
            .find((entry) => entry && entry.rumorId === rumorId);
          const marker = frontierRumorMapTarget(readout);
          if (marker) galaxyMapScreen._selectSearchTarget(marker);
          return;
        }
        const row = target && typeof target.closest === 'function' ? target.closest('[data-gm-lane]') : null;
        if (!row) return;
        galaxyMapScreen._activateTradeLane(row.getAttribute('data-gm-lane'));
      });
    }
    this._scaleButtons = Array.from(rootEl.querySelectorAll('.gm-scale-btn'));
    this._scaleButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this._setScaleFocus(button.getAttribute('data-focus'));
      });
    });

    // ─── SLICE C wiring ──────────────────────────────────────────────────────────────────────
    this._tabPanel = rootEl.querySelector('#gm-tabpanel');
    this._placeActionsEl = rootEl.querySelector('#gm-place-actions');
    this._ribbonEl = rootEl.querySelector('#gm-route-ribbon');
    this._weatherEl = rootEl.querySelector('#gm-crest-weather');
    this._deckEl = rootEl.querySelector('#gm-cargo-deck');
    this._deckTableEl = rootEl.querySelector('#gm-deck-table');
    this._deckSortBtn = rootEl.querySelector('#gm-deck-sort');
    this._tabButtons = [];
    // The screen object is a singleton, so every render cache MUST be cleared on mount: the new
    // root's DOM is empty while the cached key still says "already rendered". Leaving these set
    // means the ribbon's legs and action row never populate after a remount — the controls would
    // simply be missing, with no error anywhere to say why.
    this._lastRibbonKey = null;
    this._lastRibbonActionKey = null;
    this._lastWeatherKey = null;
    this._lastDeckKey = null;
    this._lastPlaceActionsHtml = null;
    this._lastTabHtml = null;
    this._deckRoutes = [];
    this._renderTabs(this._ctx && this._ctx.state);

    // Route control. Delegated on the ribbon so re-rendering the action row never strands it.
    if (this._ribbonEl && typeof this._ribbonEl.addEventListener === 'function') {
      this._ribbonEl.addEventListener('click', (ev) => {
        const el = ev && ev.target && typeof ev.target.closest === 'function'
          ? ev.target.closest('[data-ribbon-action]') : null;
        if (!el) return;
        galaxyMapScreen._activateRibbonAction(el.getAttribute('data-ribbon-action'));
      });
    }

    if (this._deckSortBtn && typeof this._deckSortBtn.addEventListener === 'function') {
      this._deckSortBtn.addEventListener('click', () => {
        galaxyMapScreen._deckSortMode = galaxyMapScreen._deckSortMode === 'best' ? 'safest' : 'best';
        galaxyMapScreen._lastDeckKey = null;
        galaxyMapScreen._updateCargoDeck(galaxyMapScreen._ctx && galaxyMapScreen._ctx.state);
        galaxyMapScreen._wake();
      });
    }
    if (this._deckTableEl && typeof this._deckTableEl.addEventListener === 'function') {
      this._deckTableEl.addEventListener('click', (ev) => {
        const row = ev && ev.target && typeof ev.target.closest === 'function'
          ? ev.target.closest('[data-deck-route]') : null;
        if (!row) return;
        galaxyMapScreen._activateDeckRoute(Number(row.getAttribute('data-deck-route')));
      });
    }

    // Place context actions, delegated for the same reason.
    if (this._placeActionsEl && typeof this._placeActionsEl.addEventListener === 'function') {
      this._placeActionsEl.addEventListener('click', (ev) => {
        const el = ev && ev.target && typeof ev.target.closest === 'function'
          ? ev.target.closest('[data-place-action]') : null;
        if (!el) return;
        galaxyMapScreen._activatePlaceAction(el.getAttribute('data-place-action'));
      });
    }

    // Left-rail sections: render lazily on open (a collapsed section costs nothing) and handle
    // every item click in one delegated listener on the rail.
    const leftRail = rootEl.querySelector('.gm-left-rail');
    if (leftRail && typeof leftRail.addEventListener === 'function') {
      leftRail.addEventListener('toggle', () => {
        galaxyMapScreen._updateRailSections(galaxyMapScreen._ctx && galaxyMapScreen._ctx.state);
      }, true);
      leftRail.addEventListener('click', (ev) => {
        const target = ev && ev.target;
        const closest = (sel) => (target && typeof target.closest === 'function' ? target.closest(sel) : null);
        const state = galaxyMapScreen._ctx && galaxyMapScreen._ctx.state;

        if (closest('[data-rail-bookmark-add]')) { galaxyMapScreen._addBookmark(); return; }

        const bm = closest('[data-rail-bookmark]');
        if (bm) {
          const entry = galaxyMapScreen._bookmarks[Number(bm.getAttribute('data-rail-bookmark'))];
          if (entry) galaxyMapScreen._setCameraFraming({ focusGlobal: entry.focusGlobal, spanWU: entry.spanWU });
          return;
        }

        const missionBtn = closest('[data-rail-mission]');
        if (missionBtn && state) {
          // Track the mission through the SHIPPED intent rather than writing ui.trackedMissionId
          // here — `systems/missions.js` owns tracking and this screen is a reader.
          //
          // The event name is `ui:trackMission`, verified against its listener
          // (`missions.js:456` → `trackMission`) and against the other shipped emitter
          // (`missionLog.js:1547`). An earlier draft of this handler emitted `mission:track`,
          // which has NO listener anywhere in the tree — it would have been a button that looked
          // like it worked and silently did nothing, i.e. exactly the faked action this packet is
          // forbidden to ship. Checked rather than assumed.
          const id = missionBtn.getAttribute('data-rail-mission');
          if (galaxyMapScreen._ctx.bus) galaxyMapScreen._ctx.bus.emit('ui:trackMission', { missionId: id });
          const mission = ((state.missions && state.missions.active) || []).find((m) => m && m.id === id);
          // `missionMapGeometry` returns a flat ARRAY of objective points (each already GLOBAL,
          // ADR D2.1) — not a `{points}` wrapper. Read from the array directly.
          const geo = mission ? missionMapGeometry(state, mission) : null;
          const fix = Array.isArray(geo) ? geo.find((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z)) : null;
          if (fix) galaxyMapScreen._setCameraFraming({ focusGlobal: { x: fix.x, z: fix.z }, spanWU: MAP_PRESET_SPAN_WU.local });
          return;
        }

        const alt = closest('[data-rail-alt]');
        if (alt && state && galaxyMapScreen._ctx.bus) {
          const route = state.nav && state.nav.route;
          const dest = route && Array.isArray(route.legs) && route.legs.length
            ? route.legs[route.legs.length - 1].to : null;
          // Re-plot only. Engaging stays a separate, explicit act (ADR D6) — selecting a cheaper
          // path must never silently start flying it.
          if (dest) galaxyMapScreen._ctx.bus.emit('world:requestRoute', { targetSectorId: dest, mode: alt.getAttribute('data-rail-alt') });
          galaxyMapScreen._updateRailSections(state);
        }
      });
    }

    // Populate commodity dropdown. The native <select> is populated first, then swapped for the
    // styled sf-select widget (no OS dropdown chrome on screens); re-query because the swap
    // replaces the node in place.
    const commSelect = rootEl.querySelector('#gm-commodity-select');
    if (commSelect) {
      this._syncMarketCommoditySelector(this._ctx && this._ctx.state);
      enhanceSelects(rootEl);
      const commWidget = rootEl.querySelector('#gm-commodity-select');
      if (commWidget) {
        commWidget.addEventListener('change', () => {
          this._selectedCommodity = commWidget.value;
          this.refresh();
        });
      }
    }

    // Toggle layer click listeners
    const layerBtns = rootEl.querySelectorAll('.gm-layer-btn');
    layerBtns.forEach(btn => {
      const layer = btn.getAttribute('data-layer');
      btn.addEventListener('click', () => {
        this._layers[layer] = !this._layers[layer];
        if (this._layers[layer]) btn.classList.add('active');
        else btn.classList.remove('active');
        btn.setAttribute('aria-pressed', this._layers[layer] ? 'true' : 'false');

        // Trigger scan ring center
        const w = this._canvas.width / this._dpr;
        const h = this._canvas.height / this._dpr;
        this.triggerScanRing(w / 2, h / 2, INK.amber);
        this.refresh();
      });
    });

    // Hints popover: the full control key stays on demand, never permanently on glass.
    const hintBtn = rootEl.querySelector('.gm-hint-btn');
    const hintsPanel = rootEl.querySelector('.gm-hints');
    if (hintBtn && hintsPanel && typeof hintBtn.addEventListener === 'function') {
      hintBtn.addEventListener('click', () => {
        const willOpen = hintsPanel.hidden;
        hintsPanel.hidden = !willOpen;
        hintBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });
    }
    this._railMarker = rootEl.querySelector('.gm-rail-marker');

    // Wire search bar listeners
    const searchInput = rootEl.querySelector('.gm-search-input');
    const resultsContainer = rootEl.querySelector('.gm-search-results');

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) {
        resultsContainer.hidden = true;
        resultsContainer.innerHTML = '';
        return;
      }

      const state = this._ctx && this._ctx.state;
      if (!state) return;

      const targets = getSearchTargets(
        state,
        levelForZoom(this._zoom),
        currentSectorId(this._ctx.state),
        this._claimsSystem(),
        this._isHostile,
      );
      const searchGoal = activeMapGoal(state);
      const searchPlayer = playerEntity(state);
      const searchAnchor = (searchGoal && searchGoal.pos) || (searchPlayer && searchPlayer.pos) || null;
      const filtered = targets
        .filter((t) => String(t.searchText || t.name || '').toLowerCase().includes(q))
        .sort((a, b) => mapSearchTargetPriority(state, b) - mapSearchTargetPriority(state, a)
          || compareMapSearchTargetDistance(a, b, searchAnchor));

      if (filtered.length === 0) {
        resultsContainer.innerHTML = '<div class="gm-search-item" style="color:var(--ink-mute); font-style:italic;">No results found</div>';
        resultsContainer.hidden = false;
        return;
      }

      resultsContainer.innerHTML = filtered.map((t, idx) => mapSearchItemHtml(t, idx)).join('');
      resultsContainer.hidden = false;

      this._searchResultsList = filtered;
      this._searchSelectedIdx = 0;
    });

    searchInput.addEventListener('keydown', (ev) => {
      const list = this._searchResultsList || [];
      if (!list.length) return;
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        this._searchSelectedIdx = (this._searchSelectedIdx + 1) % list.length;
        this._highlightSearchItem();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        this._searchSelectedIdx = (this._searchSelectedIdx - 1 + list.length) % list.length;
        this._highlightSearchItem();
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        const selected = list[this._searchSelectedIdx];
        if (selected) {
          this._selectSearchTarget(selected);
          searchInput.value = '';
          resultsContainer.hidden = true;
        }
      }
    });

    resultsContainer.addEventListener('click', (ev) => {
      const itemEl = ev.target.closest('.gm-search-item');
      const idx = itemEl && parseInt(itemEl.getAttribute('data-idx'));
      if (idx != null && this._searchResultsList && this._searchResultsList[idx]) {
        this._selectSearchTarget(this._searchResultsList[idx]);
        searchInput.value = '';
        resultsContainer.hidden = true;
      }
    });

    // Close button
    rootEl.querySelector('.gm-close').addEventListener('click', () => popCurrentScreen(this._ctx));

    // Mouse Panning & Zooming Listeners
    this._canvas.addEventListener('mousedown', (ev) => this._onMouseDown(ev));
    this._canvas.addEventListener('mousemove', (ev) => this._onMouseMove(ev));
    this._canvas.addEventListener('mouseup', () => this._onMouseUp());
    this._canvas.addEventListener('mouseleave', () => this._onMouseLeave());
    this._canvas.addEventListener('wheel', (ev) => this._onWheel(ev), { passive: false });
    this._canvas.addEventListener('click', (ev) => this._onCanvasClick(ev));
    this._canvas.addEventListener('dblclick', (ev) => this._onCanvasDblClick(ev));

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this._body);
    }

    this._resize();
    return this;
  },

  _syncMarketCommoditySelector(state) {
    if (!this._root) return;
    const commSelect = this._root.querySelector('#gm-commodity-select');
    if (!commSelect) return;
    const options = marketIntelCommodityOptions(state, COMMODITIES);
    this._selectedCommodity = selectedMarketCommodityOnOpen(state, this._selectedCommodity, COMMODITIES);
    // After mount the element is the sf-select widget (sfSetOptions); the native path only runs
    // during the initial populate-before-enhance pass in mount().
    if (typeof commSelect.sfSetOptions === 'function') {
      commSelect.sfSetOptions(options.map((commodity) => ({ value: commodity.id, label: commodity.name })), this._selectedCommodity);
      return;
    }
    commSelect.innerHTML = options
      .map((commodity) => `<option value="${escapeMapHtml(commodity.id)}">${escapeMapHtml(commodity.name)}</option>`)
      .join('');
    commSelect.value = this._selectedCommodity;
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._visible = true;
    this._selectedTarget = null;
    this._hoverTarget = null;
    this._scanRings = [];
    this._syncReduceMotion();
    this._subscribeKills();

    // J4: restore what the player last chose BEFORE the commodity re-validation and BEFORE the
    // open-intent view is applied. Order matters both ways — the restored commodity is what gets
    // validated, and a caller that asked to open focused on a sector still wins on framing.
    this._restoreScreenState();

    // Consume map-authority open intent (LOCAL vs STAR/GALAXY focus + optional target fix).
    const state = this._ctx && this._ctx.state;
    this._selectedCommodity = selectedMarketCommodityOnOpen(state, this._selectedCommodity, COMMODITIES);
    this._syncMarketCommoditySelector(state);
    this._syncPublicIdentity(state);
    const intent = takeMapOpenIntent(state) || { focus: MAP_FOCUS.SYSTEM };
    const view = applyMapOpenIntentToView({
      zoom: this._zoom,
      targetZoom: this._targetZoom,
      cams: this._cams,
    }, intent, state);
    this._zoom = view.zoom;
    this._targetZoom = view.targetZoom;
    this._openIntent = view.openIntent || intent;
    // SLICE B — adopt the open intent into the unified camera.
    //
    // The camera is rebuilt from the intent on every open rather than persisted across opens. That
    // is deliberate: `mapAuthority` is the single authority for where the map opens (pinned by
    // check:map-authority), and a camera that survived the close would silently outrank it. The
    // camera owns continuity WITHIN a session on the chart; the intent owns where that session
    // starts.
    this._camera = null;
    this._adoptCameraFromLegacyView(state, view);
    // Visible selection/inspector focus from missionId/stationId when resolvable.
    // Focus-only opens leave _selectedTarget null (do not invent a station).
    this._selectedTarget = view.openTarget || null;
    this._syncScaleButtons();

    // Cancel any prior animation frame before (re)starting so top-map re-show cannot stack rAF loops.
    if (this._animFrame != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }

    if (!HAS_DOC) return;
    this._resize();
    // Focus policy (do not land on the search field — that turns M/N into typing):
    //   gamepad → scale chip for the open intent
    //   keyboard/pointer → dialog root (tabindex=-1); `/` is the only path into search
    const focusSelector = mapFocusButtonSelector(intent);
    let focused = false;
    if (focusSelector && this._root) {
      const initialControl = this._root.querySelector(focusSelector);
      if (initialControl && typeof initialControl.focus === 'function') {
        try { initialControl.focus({ preventScroll: true }); } catch (_) { initialControl.focus(); }
        focused = true;
      }
    }
    if (!focused && this._root && typeof this._root.focus === 'function') {
      try { this._root.focus({ preventScroll: true }); } catch (_) { this._root.focus(); }
    }
    this._lastTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._lastDrawTime = 0;

    // J4: the restored tab and layer set exist as fields by now; push them into the DOM. Done here,
    // after the root and controls are built, because _setTab renders — calling it during restore
    // would run against controls that do not exist yet.
    this._syncRestoredControls(state);

    // OPENING A SCREEN SHOULD SIZE IT, NOT RENDER IT. `refresh()` draws the map and reads the
    // inspector synchronously, so opening the galaxy map paid for a full draw plus two inspector
    // updates before a single frame had been scheduled. The cheap DOM syncs still happen here; the
    // expensive pair is marked dirty and the first cadence frame does it.
    this._syncPublicIdentity();
    this._syncScaleButtons();
    this._updateHeaderWeather(this._ctx && this._ctx.state);
    this._updateCargoDeck(this._ctx && this._ctx.state);
    this._wake();
  },

  onHide() {
    this._visible = false;
    if (this._animFrame != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._animFrame);
    }
    this._animFrame = null;
    this._unsubscribeKills();
    this._rememberScreenState();
    this._localLiveContacts = 0;
  },

  // ── J4 screen state memory (build map §11.12) ───────────────────────────────────────────────
  // Inhibitor #7 names this screen: "persists no layer toggle, commodity, zoom or tab — every open
  // is a fresh open." Three of those four are remembered here. The fourth is deliberately not.
  //
  // ZOOM IS NOT PERSISTED, against the build map's own wording, because this file already carries a
  // ruling that forbids it (see onShow): "The camera is rebuilt from the intent on every open
  // rather than persisted across opens… mapAuthority is the single authority for where the map
  // opens (pinned by check:map-authority), and a camera that survived the close would silently
  // outrank it." onShow always applies an intent — `takeMapOpenIntent(state) || {focus: SYSTEM}` —
  // and the SYSTEM default sets a camera, so a persisted zoom would be overwritten on every open:
  // a save key with no observable effect. Inert first, and harmful the moment someone "fixes" the
  // restore by making it outrank the intent. The rule this obeys: the camera owns continuity
  // WITHIN a chart session; the intent owns where that session starts.
  //
  // ALSO NOT remembered: `_selectedTarget`/`_hoverTarget` (entity ids are re-minted when the sector
  // regenerates on load — that is why saveSystem clears stale targets at all), the search query (a
  // forgotten filter is the fastest way to make a working screen look broken), `_searchResultsList`
  // (derived), and `_scanRings`/`_iris`/`_animT` (animation clocks; a restored mid-wipe iris would
  // leave the chart permanently occluded).
  _rememberScreenState() {
    const mem = this._ctx && this._ctx.screenMemory;
    if (!mem) return;
    mem.set('galaxyMap', {
      activeTab: this._activeTab,
      selectedCommodity: this._selectedCommodity,
      layers: { ...this._layers },
      // An explicit player artifact — the player MADE these, and today they die on page reload.
      // FLATTENED to {label,x,z,span}: a bookmark's live shape nests focusGlobal one level deeper
      // than a bag value may go, and storing only the label would persist a bookmark that cannot
      // navigate — an inert save key, the exact defect zoom was refused for.
      bookmarks: Array.isArray(this._bookmarks)
        ? this._bookmarks.slice(-8)
          .filter((b) => b && b.focusGlobal && Number.isFinite(b.focusGlobal.x) && Number.isFinite(b.focusGlobal.z))
          .map((b) => ({ label: String(b.label || ''), x: b.focusGlobal.x, z: b.focusGlobal.z, span: Number(b.spanWU) || 0 }))
        : [],
    });
  },

  _restoreScreenState() {
    const mem = this._ctx && this._ctx.screenMemory;
    if (!mem) return;
    // Screen modules are SINGLETONS: `_layers` and `_activeTab` live on this object literal, so
    // loading save A then save B in one page session would leave A's choices sitting here. Restore
    // therefore starts from the AUTHORED DEFAULTS every time and applies the bag over them — never
    // a merge over whatever the previous save left behind.
    if (!this._authoredDefaults) {
      this._authoredDefaults = { activeTab: this._activeTab, selectedCommodity: this._selectedCommodity, layers: { ...this._layers } };
    }
    const def = this._authoredDefaults;
    this._activeTab = def.activeTab;
    this._selectedCommodity = def.selectedCommodity;
    for (const k of Object.keys(def.layers)) this._layers[k] = def.layers[k];

    const bag = mem.get('galaxyMap');
    if (bag.activeTab && MAP_INSPECTOR_TAB_IDS.includes(bag.activeTab)) this._activeTab = bag.activeTab;
    // A remembered commodity that no longer exists in the catalogue must not become a lens on
    // nothing; onShow re-validates through selectedMarketCommodityOnOpen either way.
    if (bag.selectedCommodity && COMMODITIES.some((c) => c.id === bag.selectedCommodity)) {
      this._selectedCommodity = bag.selectedCommodity;
    }
    if (bag.layers && typeof bag.layers === 'object') {
      // Merge, never replace: a layer added since the save was written keeps its authored default
      // instead of arriving undefined and rendering as off.
      for (const k of Object.keys(this._layers)) {
        if (typeof bag.layers[k] === 'boolean') this._layers[k] = bag.layers[k];
      }
    }
    // Bookmarks are rehydrated to their live nested shape. A bookmark that cannot be clicked back
    // to is not a bookmark, so the coordinates are restored, not just the name.
    if (Array.isArray(bag.bookmarks) && bag.bookmarks.length) {
      this._bookmarks = bag.bookmarks
        .filter((b) => b && Number.isFinite(b.x) && Number.isFinite(b.z))
        .map((b) => ({ label: String(b.label || 'Chart'), focusGlobal: { x: b.x, z: b.z }, spanWU: Number(b.span) || 0 }))
        .slice(-8);
    }
    // Deliberately no zoom/camera restore — see _rememberScreenState. Restoring a bookmark's
    // coordinates is not the same thing: the player must still choose to jump to one.
  },

  /** Push the restored fields into the built DOM. Separate from _restoreScreenState because the
   *  controls do not exist when that runs. */
  _syncRestoredControls(state) {
    if (!HAS_DOC || !this._root) return;
    for (const btn of Array.from(this._root.querySelectorAll('.gm-layer-btn'))) {
      const id = btn.getAttribute('data-layer');
      if (!id || !(id in this._layers)) continue;
      btn.classList.toggle('active', !!this._layers[id]);
      btn.setAttribute('aria-pressed', this._layers[id] ? 'true' : 'false');
    }
    if (this._activeTab) this._setTab(this._activeTab, { defer: true });
  },

  /**
   * Forget a contact the moment it dies.
   *
   * The remembered-contact layer exists so a contact that STOPS BEING OBSERVABLE fades over its
   * half-life instead of popping off the glass. A kill is not that: the ship is not somewhere the
   * pilot can no longer see, it is gone, and dead-reckoning a corpse forward for the next two
   * minutes draws a lie.
   *
   * Why `entity:killed` and not `entity:destroyed`: `entity:destroyed` (coreSystem `lifetimeSweep`)
   * fires for EVERY removal — TTL expiry, scoped sector despawn, projectiles, pickups. Deleting on
   * it would forget exactly the despawns this feature was built to remember and the layer would
   * render nothing. `entity:killed` (systems/combat.js) is emitted only on a real defeat, which is
   * precisely the case that should be forgotten.
   *
   * Subscribed on show and released on hide so a re-show cannot stack handlers — the same discipline
   * the rAF loop and the Set Course button already follow.
   */
  _subscribeKills() {
    this._unsubscribeKills();
    const bus = this._ctx && this._ctx.bus;
    if (!bus || typeof bus.on !== 'function') return;
    this._busUnsubs = [];
    const on = (event, handler) => {
      const off = bus.on(event, handler);
      const disposer = typeof off === 'function'
        ? off
        : (typeof bus.off === 'function' ? () => bus.off(event, handler) : null);
      if (typeof disposer === 'function') this._busUnsubs.push(disposer);
    };
    on('entity:killed', (payload) => {
      const id = payload && payload.id;
      const intel = galaxyMapScreen._localIntel;
      if (id != null && intel && intel.tracks) intel.tracks.delete(String(id));
      galaxyMapScreen._wake();
    });
    const wake = () => {
      galaxyMapScreen._lastRibbonKey = null;
      galaxyMapScreen._lastDeckKey = null;
      galaxyMapScreen._lastWeatherKey = null;
      galaxyMapScreen.refresh();
      galaxyMapScreen._wake();
    };
    for (const event of [
      'nav:routeChanged',
      'nav:executorChanged',
      'sector:enter',
      'encounter:fired',
      'claim:raidWarning',
      'faction:aggro',
    ]) {
      on(event, wake);
    }
  },

  _unsubscribeKills() {
    for (const off of this._busUnsubs || []) {
      try { off(); } catch (_) { /* disposed bus during shutdown */ }
    }
    this._busUnsubs = [];
    this._killUnsub = null;
  },

  /**
   * Local / System / Galaxy as FRAMING BOOKMARKS (ADR D3), not as separate maps.
   *
   * Same buttons, same keybinds, same muscle memory; what changes is underneath — each is now a
   * camera preset `{focusGlobal, spanWU}` rather than a jump into a differently-centred projection.
   * Local frames the ship, System frames the current sector's origin, Galaxy frames the chart
   * centroid at lattice extent.
   */
  _setScaleFocus(focus, { draw = true, animate = true } = {}) {
    const before = levelForZoom(this._zoom);
    const zoom = zoomForMapFocus(focus);
    const level = levelForZoom(zoom);
    const state = this._ctx && this._ctx.state;
    const player = state ? playerEntity(state) : null;
    const preset = framePreset(level, {
      playerGlobal: player && player.pos ? { x: player.pos.x, z: player.pos.z } : null,
      sectorId: state ? currentSectorId(state) : null,
      focusGlobal: this._camera ? this._camera.focusGlobal : null,
    });
    this._camera = setSpan(
      setFocus(this._cameraOrInit(), preset.focusGlobal),
      preset.spanWU,
    );
    this._syncLegacyFromCamera();
    // `_syncLegacyFromCamera` derives `_zoom` from the preset span. `_targetZoom` follows it so the
    // eased rail marker slides to the same place instead of animating toward a stale scalar.
    this._targetZoom = this._zoom;
    if (animate && levelForZoom(this._zoom) !== before) this._triggerIris(levelForZoom(this._zoom));
    this._syncScaleButtons();
    if (draw && HAS_DOC) this._draw();
    this._wake();
    return levelForZoom(this._zoom);
  },

  _syncScaleButtons() {
    if (!HAS_DOC) return;
    const level = levelForZoom(this._zoom);
    for (const button of this._scaleButtons || []) {
      const current = button.getAttribute('data-focus') === level;
      if (button.classList && typeof button.classList.toggle === 'function') {
        button.classList.toggle('is-current', current);
      } else if (button.classList) {
        if (current) button.classList.add('is-current');
        else button.classList.remove('is-current');
      }
      button.setAttribute('aria-pressed', current ? 'true' : 'false');
    }
    // Continuity marker: the eased zoom value slides along one track, so LOCAL/SYSTEM/GALAXY
    // reads as stations on a single instrument rather than three separate screens.
    const marker = this._railMarker;
    if (marker && marker.style) {
      const span = Math.log(ZOOM_MAX) - Math.log(ZOOM_MIN);
      const t = span > 0
        ? (Math.log(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._zoom))) - Math.log(ZOOM_MIN)) / span
        : 1;
      marker.style.left = `${(Math.max(0, Math.min(1, t)) * 100).toFixed(1)}%`;
    }
  },

  _syncPublicIdentity(state = this._ctx && this._ctx.state) {
    if (!HAS_DOC || !this._root) return;
    const stamp = this._root.querySelector('.gm-stamp');
    if (!stamp) return;
    const label = mapOperatorLabel(state);
    const text = label === 'OPERATOR: UNKNOWN' ? `${label} / Quiet routing` : 'Nav chart / Survey table';
    if (stamp.textContent !== text) stamp.textContent = text;
  },

  /**
   * Read the motion preference once per show rather than per frame. The global CSS rule in
   * styles/accessibility.css kills DOM transitions, but canvas animation is drawn by hand and has
   * to opt out itself — so flow beads, the sweep and the iris all consult this.
   */
  _syncReduceMotion() {
    let reduced = false;
    if (typeof window !== 'undefined') {
      if (window.matchMedia) {
        try { reduced = !!window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { reduced = false; }
      }
      // The in-game setting is authoritative when present: a player who ticked it in Settings
      // expects it honoured even if the OS preference is unset.
      const doc = typeof document !== 'undefined' ? document : null;
      if (doc && doc.documentElement && doc.documentElement.classList
        && doc.documentElement.classList.contains('sf-reduce-motion')) {
        reduced = true;
      }
    }
    this._reduceMotion = reduced;
    return reduced;
  },

  _triggerIris(level) {
    if (!HAS_DOC) return;
    if (this._reduceMotion) return;
    this._iris = { t: 0, maxT: 26, label: String(level || '').toUpperCase() };
    this._wake();
  },

  _applyResponsiveLayout(width, height) {
    if (!this._root) return null;
    const layout = resolveGalaxyMapLayout(width, height);
    if (this._root.dataset) this._root.dataset.layout = layout.mode;
    const style = this._root.style;
    if (style && typeof style.setProperty === 'function') {
      style.setProperty('--gm-header-h', `${layout.header.height}px`);
      style.setProperty('--gm-inspector-w', `${layout.inspector.width}px`);
      style.setProperty('--gm-rail-h', `${layout.layers.height}px`);
      style.setProperty('--gm-inspector-h', `${layout.inspector.height}px`);
    }
    return layout;
  },

  _nowMs() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now());
  },

  _animationActive(now = this._nowMs()) {
    if (Math.abs(this._zoom - this._targetZoom) > 0.0005) return true;
    if (this._scanRings && this._scanRings.length > 0) return true;
    if (this._iris) return true;
    const localLiveContacts = levelForZoom(this._zoom) === 'local' && (this._localLiveContacts || 0) > 0;
    if (localLiveContacts) return true;
    return !this._reduceMotion
      && levelForZoom(this._zoom) === 'local'
      && now < (this._scanSweepUntil || 0);
  },

  _stepAnimation(now) {
    const dtSec = Math.max(0, (now - this._lastTime) / 1000);
    this._lastTime = now;
    this._animT = (this._animT || 0) + dtSec;
    let changed = false;
    if (Math.abs(this._zoom - this._targetZoom) > 0.0005) {
      const alpha = 1 - Math.exp(-dtSec / 0.10);
      this._zoom += (this._targetZoom - this._zoom) * Math.min(1, alpha);
      changed = true;
    }
    if (this._scanRings.length > 0) {
      this._scanRings = this._scanRings.filter((ring) => {
        ring.t += 1;
        ring.r = (ring.t / ring.maxT) * ring.maxR;
        return ring.t < ring.maxT;
      });
      changed = true;
    }
    if (this._iris) {
      this._iris.t += 1;
      if (this._iris.t >= this._iris.maxT) this._iris = null;
      changed = true;
    }
    const localLevel = levelForZoom(this._zoom) === 'local';
    const liveContacts = localLevel && (this._localLiveContacts || 0) > 0;
    if (localLevel && (liveContacts || (!this._reduceMotion && now < (this._scanSweepUntil || 0)))) {
      this._scanPhase = (this._scanPhase || 0) + (dtSec * (liveContacts ? 0.65 : 1.25));
      changed = true;
    }
    if (changed) {
      this._draw();
      this._updateInspector();
    }
    return this._animationActive(now);
  },

  _wake() {
    if (!this._visible || typeof requestAnimationFrame === 'undefined') return;
    const now = this._nowMs();
    if (!this._reduceMotion && levelForZoom(this._zoom) === 'local') {
      this._scanSweepUntil = Math.max(this._scanSweepUntil || 0, now + 1200);
    }
    if (this._animFrame != null) return;
    this._lastTime = now;
    const frame = () => {
      if (!galaxyMapScreen._visible) {
        galaxyMapScreen._animFrame = null;
        return;
      }
      const keepAlive = galaxyMapScreen._stepAnimation(galaxyMapScreen._nowMs());
      if (keepAlive) galaxyMapScreen._animFrame = requestAnimationFrame(frame);
      else galaxyMapScreen._animFrame = null;
    };
    this._animFrame = requestAnimationFrame(frame);
  },

  onKey(event, ctx) {
    const key = event && typeof event.key === 'string' ? event.key.toLowerCase() : '';
    const target = event && event.target;
    const textEntry = !!(target
      && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));

    // The search input owns ordinary typing. Without this guard the final `n` in a query such as
    // "Helios Station" also reaches the map's global N shortcut, closes the screen, and leaves a
    // correctly-built result list hidden under the inactive map. Escape intentionally remains the
    // map-close key; Enter/Space/letters/slash keep their native text-entry behavior.
    if (textEntry && key !== 'escape') return false;

    // Keyboard primary action mirrors the inspector button for owned bases. Text-entry controls
    // keep native Enter/Space behavior; the global UI input router normally filters them before
    // this handler, and this local guard keeps direct/synthetic dispatch safe too.
    if ((key === 'enter' || key === ' ' || key === 'spacebar')
      && this._selectedTarget && this._selectedTarget.kind === 'claim') {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this._activateSelectedCourse();
      return true;
    }

    // Focus search
    if (key === '/') {
      const input = this._root.querySelector('.gm-search-input');
      if (input) {
        event.preventDefault();
        input.focus();
        input.select();
      }
      return true;
    }

    // Cycle layers
    if (key === 'tab') {
      event.preventDefault();
      const keys = Object.keys(this._layers);
      const nextIdx = (keys.indexOf(this._currentLayerFocus) + 1) % keys.length;
      this._currentLayerFocus = keys[nextIdx];

      this._layers[this._currentLayerFocus] = !this._layers[this._currentLayerFocus];

      const btn = this._root.querySelector(`.gm-layer-btn[data-layer="${this._currentLayerFocus}"]`);
      if (btn) {
        if (this._layers[this._currentLayerFocus]) btn.classList.add('active');
        else btn.classList.remove('active');
      }

      const w = this._canvas.width / this._dpr;
      const h = this._canvas.height / this._dpr;
      this.triggerScanRing(w / 2, h / 2, INK.teal);

      this.refresh();
      return true;
    }

    if (key === 'escape' || key === 'm' || key === 'n') {
      popCurrentScreen(ctx || this._ctx);
      return true;
    }
    return false;
  },

  refresh() {
    if (galaxyMapScreen._visible) {
      galaxyMapScreen._syncPublicIdentity();
      galaxyMapScreen._draw();
      galaxyMapScreen._updateInspector();
      galaxyMapScreen._syncScaleButtons();
      galaxyMapScreen._updateHeaderWeather(galaxyMapScreen._ctx && galaxyMapScreen._ctx.state);
      galaxyMapScreen._updateCargoDeck(galaxyMapScreen._ctx && galaxyMapScreen._ctx.state);
      galaxyMapScreen._wake();
    }
  },

  triggerScanRing(x, y, color = INK.amberHot) {
    this._scanRings.push({
      x, y, r: 0, maxR: 120, t: 0, maxT: 35, color
    });
    this._wake();
  },

  _activeLevel() {
    return levelForZoom(this._zoom);
  },

  /**
   * Feed the LOCAL contact-memory track and hand it back for the model builder to read.
   *
   * This instance is the only mutable state the map owns, and it is purely cosmetic: it records
   * what the scope has already seen so a contact that leaves sensor range fades out over its
   * half-life instead of popping off the glass. It is deliberately kept out of the pure model
   * builders — they read it, never write it — and it is never persisted into sim state, so the
   * map stays read-only over the simulation.
   *
   * Only ships and drones are tracked. Stations, gates and rocks are static furniture that stays
   * live for as long as the sector is loaded, so remembering them would add tracks that never
   * decay and never tell the pilot anything.
   */
  _syncLocalIntel(state) {
    if (!state) return null;
    if (!this._localIntel) this._localIntel = new LocalSpaceIntel();
    const intel = this._localIntel;
    const nowS = Math.max(0, Number(state.simTime) || 0);
    const sectorId = currentSectorId(state);

    // Memory is per-sector, and a load/new-game rewinds sim time. In either case the old tracks
    // describe a place the pilot is no longer in — drop them rather than dead-reckon across.
    if (sectorId !== this._localIntelSectorId || nowS + 1 < intel.timeS) {
      intel.tracks.clear();
      intel.landmarks.clear();
      intel.timeS = 0;
      this._localIntelSectorId = sectorId;
      this._localIntelSyncedAtS = -1;
    }

    // The draw loop runs at display refresh, not the 64 ms inspector cadence, so at LOCAL this used
    // to walk every entity and rewrite byte-identical tracks ~60x/second. Decay is a pure function
    // of (timeS - lastSeenS), so re-observing at the same simTime cannot change any output — while
    // the chart is up over a paused sim that work was entirely wasted. Skip it.
    if (nowS === this._localIntelSyncedAtS) return intel;
    this._localIntelSyncedAtS = nowS;

    intel.advance(nowS);
    const player = playerEntity(state);
    const playerTeam = player && player.team;
    const hostileFn = typeof this._isHostile === 'function' ? this._isHostile : null;
    for (const e of entityIterator(state)) {
      if (!e || e.alive === false || !e.pos) continue;
      if (player && e.id === player.id) continue;
      if (e.type !== 'ship' && e.type !== 'drone') continue;
      let hostile = !!(e.data && e.data.hostile);
      if (hostileFn) {
        try { hostile = !!hostileFn(e, playerTeam, state); } catch (_) { /* keep the flag fallback */ }
      }
      intel.observeContact({
        id: e.id,
        type: 'ship',
        name: (e.data && e.data.name) || e.name || e.role || 'contact',
        factionId: e.factionId || null,
        hostile,
        pos: e.pos,
        vel: e.vel,
        rot: e.rot,
        radius: e.radius,
      }, { timeS: nowS, source: 'chart-sensor' });
    }
    return intel;
  },

  _highlightSearchItem() {
    const items = this._root.querySelectorAll('.gm-search-item');
    items.forEach((item, idx) => {
      if (idx === this._searchSelectedIdx) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  },

  _updateInspector() {
    if (!HAS_DOC || !this._root) return;
    const state = this._ctx && this._ctx.state;
    const player = state ? playerEntity(state) : null;
    const detailsEl = this._inspectorDetails || this._root.querySelector('.gm-inspector-details');
    const btn = this._setCourseButton || this._root.querySelector('#gm-set-course-btn');
    // The engage control tracks nav.executor, NOT the current selection, so it must refresh even
    // when nothing is selected — a route stays engaged while you browse the chart. The secondary
    // plot control is the opposite: it tracks the selection, and must clear itself when the
    // selection goes away rather than stranding a button aimed at nothing.
    this._updateEngageControl();
    this._updatePlotControl();
    if (!detailsEl || !btn) return;

    // SLICE C: the tablist and the place actions track the selection, so they refresh here too.
    this._renderTabs(state);
    this._renderPlaceActions(state);

    const t = this._selectedTarget;
    if (!t) {
      // NO SELECTION IS NOT AN EMPTY PANEL. The active tab renders with a null selection —
      // Overview falls through to the four always-present navigation answers, so the inspector
      // always says where you are, what you are tracking and what the next leg is.
      const defaultHtml = this._tabHtml(state, null);
      if (this._inspectorDetailsHtml !== defaultHtml) {
        detailsEl.innerHTML = defaultHtml;
        this._inspectorDetailsHtml = defaultHtml;
      }
      if (!btn.hidden) btn.hidden = true;
      if (!btn.disabled) btn.disabled = true;
      return;
    }

    if (!state) return;

    let html = '';
    let buttonLabel = 'Track Target';

    if (t.kind === 'sector') {
      const sectorId = t.sectorId || t.id;
      const record = sectorRecordById(state, sectorId);
      const charted = record && isSectorCharted(state, record);
      const cause = charted ? causeFor(state, sectorId) : null;
      const faction = factionNameOf(t.factionId);
      const color = factionColorOf(t.factionId);
      const sec = t.security != null ? t.security : 0.5;
      const secPips = securityPips(sec);
      const law = sectorLawProfile(state, t.id, sec);
      const activeMissions = state.missions && state.missions.active || [];
      const relevantMission = activeMissions.find(m => m.status === 'active' && (m.destSectorId === t.id || (m.params && m.params.sectorId === t.id)));
      const presenceHtml = galaxyPresenceInspectorHtml(t.presence || []);

      // Compute route distance/cost
      const curSec = currentSectorId(state);
      let routeInfo = 'Select to plot route';
      if (curSec && curSec !== t.id) {
        const routePlan = this._previewRouteTo(t.id);
        if (routePlan) {
          routeInfo = formatRoutePlanCost(routePlan) || 'Route cost unavailable';
        } else if (this._previewRouteStatus === 'unavailable') {
          const previewPath = computePreviewRoute(state, curSec, t.id);
          routeInfo = formatRoutePlanCost(null, previewPath) || 'Unreachable/No path';
        } else {
          routeInfo = 'Unreachable/No path';
        }
      } else if (curSec === t.id) {
        routeInfo = 'Current Sector';
      }

      // Plotted route legs, when the world's route already ends here.
      const plotted = state.nav && state.nav.route;
      const plottedDest = plotted && Array.isArray(plotted.legs) && plotted.legs.length
        ? plotted.legs[plotted.legs.length - 1].to : null;
      let routeLegsHtml = '';
      if (plotted && plottedDest === t.id) {
        const legRows = plotted.legs.map((leg, idx) => {
          const fromName = (sectorRecordById(state, leg.from) || {}).name || leg.from;
          const toName = (sectorRecordById(state, leg.to) || {}).name || leg.to;
          const interdict = leg.interdict ? ` <span style="color:${INK.red}">[interdict]</span>` : '';
          // The leg departing the sector the player actually occupies is the one under way.
          const current = leg.from === curSec ? ' is-current' : '';
          return `<div class="gm-route-leg${current}"><span class="gm-route-leg-n">${idx + 1}</span><b>${escapeMapHtml(fromName)}</b> → <b>${escapeMapHtml(toName)}</b> · ${Math.round(leg.fuel)}F${interdict}</div>`;
        }).join('');
        routeLegsHtml = `${legRows}<div class="gm-route-total">Σ ${Math.round(plotted.totalFuel || 0)} fuel · ${plotted.totalHops || plotted.legs.length} hops</div>`;
      }

      html += `
        <div class="gm-ins-section">
          <div class="gm-ins-kind">Sector record · [${Math.round(t.x || 0)}, ${Math.round(t.y || 0)}]</div>
          <div class="gm-ins-target-name">${escapeMapHtml(t.name)}</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Faction</div>
          <div class="gm-ins-row">
            <span>Authority</span>
            <span class="gm-ins-row-val" style="color:${color}"><span${entityAttr('faction:' + t.factionId)}>${escapeMapHtml(faction)}</span></span>
          </div>
        </div>

        ${presenceHtml}

        <div class="gm-ins-section">
          <div class="gm-ins-title">Security & Jurisdiction</div>
          <div class="gm-ins-row">
            <span>Level</span>
            <span class="gm-ins-row-val">${law.level} · ${secPips}</span>
          </div>
          <div class="gm-ins-row">
            <span>Jurisdiction</span>
            <span class="gm-ins-row-val"><span${entityAttr('faction:' + law.factionId)}>${escapeMapHtml(law.authority)}</span></span>
          </div>
          <div class="gm-ins-note" style="margin-top:6px;"><b style="color:var(--ink);">ILLEGAL:</b> ${law.illegal}</div>
          <div class="gm-ins-note" style="margin-top:4px;"><b style="color:var(--ink);">RESPONSE:</b> ${law.response}</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Navigation Cost</div>
          <div class="gm-ins-row">
            <span>Route</span>
            <span class="gm-ins-row-val">${routeInfo}</span>
          </div>
          ${routeLegsHtml}
        </div>
      `;

      // Gate-vs-drive transit comparison: the "which way do I cross" decision, side by side.
      if (charted && curSec && curSec !== t.id) {
        const gateF = forecastTransitFor(state, t.id, { fromSectorId: curSec, via: 'gate' });
        const driveF = forecastTransitFor(state, t.id, { fromSectorId: curSec, via: 'drive' });
        const transitCard = (label, risk) => {
          const incidentColor = risk.incidentChance > 0.55 ? INK.red : risk.incidentChance > 0.25 ? INK.warn : INK.good;
          const marginColor = risk.survivalMargin < 0 ? INK.red : INK.good;
          const margin = Math.round(risk.survivalMargin);
          return `
            <div class="gm-transit-card">
              <div class="gm-transit-head"><span>${label}</span><b style="color:${incidentColor}">${Math.round(risk.incidentChance * 100)}% incident</b></div>
              <div class="gm-transit-row"><span>Impact</span><b>~${risk.expectedDamage} HP</b></div>
              <div class="gm-transit-row"><span>Margin</span><b style="color:${marginColor}">${margin >= 0 ? '+' : ''}${margin} HP</b></div>
            </div>`;
        };
        html += `
          <div class="gm-ins-section">
            <div class="gm-ins-title">Transit Forecast · from here</div>
            <div class="gm-transit">
              ${transitCard('Gate', gateF)}
              ${transitCard('Drive', driveF)}
            </div>
          </div>
        `;
      }

      html += sectorCauseIntelHtml(cause);

      if (record) {
        const stationCount = (record.stations && record.stations.length) || 0;
        const hazardList = (record.hazards && record.hazards.map(h => hazardTypeGlyph(h.type)).join(' ')) || 'None';
        html += `
          <div class="gm-ins-section">
            <div class="gm-ins-title">Sector Summary</div>
            <div class="gm-ins-row"><span>Stations</span><span class="gm-ins-row-val">${stationCount}</span></div>
            <div class="gm-ins-row"><span>Hazards</span><span class="gm-ins-row-val">${hazardList}</span></div>
          </div>
        `;
      }

      if (relevantMission) {
        html += missionChartBlockHtml(relevantMission, 'Active Mission',
          missionMapGeometry(state, relevantMission));
      }

      // Sector market memory: show the best quote the pilot actually knows, regardless of station order.
      if (record && record.stations && record.stations.length) {
        const marketData = bestKnownSectorMarket(state, record, this._selectedCommodity);
        if (marketData) {
          const tint = memoryTint(marketData.ageS);
          html += `
            <div class="gm-ins-section">
              <div class="gm-ins-title">Best Known Sell (${this._selectedCommodity.replace('cmdty_', '').replace('_', ' ').toUpperCase()})</div>
              <div class="gm-ins-row">
                <span>Station</span>
                <span class="gm-ins-row-val">${escapeMapHtml(marketData.stationName)}</span>
              </div>
              <div class="gm-ins-row">
                <span>Buy / Sell</span>
                <span class="gm-ins-row-val" style="color:${tint.color}">${marketData.buy} / ${marketData.sell}</span>
              </div>
              <div class="gm-ins-row">
                <span>Data Age</span>
                <span class="gm-ins-row-val ${tint.key}">${ageText(marketData.ageS)} ago</span>
              </div>
              ${marketData.demandReason ? `
                <div class="gm-ins-row">
                  <span>Demand Driver</span>
                  <span class="gm-ins-row-val">${escapeMapHtml(marketData.demandReason)}</span>
                </div>
              ` : ''}
            </div>
          `;
        }
      }

      {
        const primary = resolveGalaxyMapPrimaryAction(state, t);
        buttonLabel = primary && primary.label ? primary.label : 'Plot Course';
      }

    } else if (t.kind === 'station' || t.kind === 'gate') {
      const faction = factionNameOf(t.factionId);
      const color = factionColorOf(t.factionId);
      const isGate = t.kind === 'gate';
      const record = findStationRecord(state, t.stationId || t.id);
      const services = record && record.services ? record.services : [];
      const chartNote = record && record.chartNote ? String(record.chartNote) : '';
      const activeMissions = state.missions && state.missions.active || [];
      const relevantMission = activeMissions.find(m => m.status === 'active' && m.destStationId === (t.stationId || t.id));

      html += `
        <div class="gm-ins-section">
          <div class="gm-ins-kind">${t.kind.toUpperCase()} OBJECT</div>
          <div class="gm-ins-target-name">${escapeMapHtml(t.name)}</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Faction</div>
          <div class="gm-ins-row">
            <span>Owner</span>
            <span class="gm-ins-row-val" style="color:${color}">${faction}</span>
          </div>
        </div>
      `;

      const stationDist = player && Number.isFinite(t.x) && Number.isFinite(t.z)
        ? Math.round(Math.hypot(t.x - player.pos.x, t.z - player.pos.z)) : null;
      html += `
        <div class="gm-ins-section">
          <div class="gm-ins-title">Navigation</div>
          <div class="gm-ins-row"><span>Distance</span><span class="gm-ins-row-val">${stationDist != null ? stationDist + ' u' : 'Unknown'}</span></div>
        </div>
      `;

      if (!isGate && services.length > 0) {
        html += `
          <div class="gm-ins-section">
            <div class="gm-ins-title">Available Services</div>
            <div class="gm-svc-list">
              ${services.map(s => `<span class="gm-svc"><span class="gm-svc-ico" aria-hidden="true">${serviceIconSvg(s)}</span>${String(s).replace(/_/g, ' ').toUpperCase()}</span>`).join('')}
            </div>
            ${chartNote ? `<div class="gm-ins-note" style="margin-top:6px;">${escapeMapHtml(chartNote)}</div>` : ''}
          </div>
        `;
      } else if (chartNote) {
        html += `
          <div class="gm-ins-section">
            <div class="gm-ins-note">${escapeMapHtml(chartNote)}</div>
          </div>
        `;
      }

      if (!isGate) {
        const marketData = getMarketMemoryForStation(state, t.stationId || t.id, this._selectedCommodity);
        if (marketData) {
          const tint = memoryTint(marketData.ageS);
          html += `
            <div class="gm-ins-section">
              <div class="gm-ins-title">Market Memory</div>
              <div class="gm-ins-row">
                <span>Commodity</span>
                <span class="gm-ins-row-val">${this._selectedCommodity.replace('cmdty_', '').replace('_', ' ').toUpperCase()}</span>
              </div>
              <div class="gm-ins-row">
                <span>Buy / Sell</span>
                <span class="gm-ins-row-val" style="color:${tint.color}">${marketData.buy} / ${marketData.sell}</span>
              </div>
              <div class="gm-ins-row">
                <span>Data Age</span>
                <span class="gm-ins-row-val ${tint.key}">${ageText(marketData.ageS)} ago</span>
              </div>
              ${marketData.demandReason ? `
                <div class="gm-ins-row">
                  <span>Demand Driver</span>
                  <span class="gm-ins-row-val">${escapeMapHtml(marketData.demandReason)}</span>
                </div>
              ` : ''}
            </div>
          `;
        }
      }

      if (relevantMission) {
        html += missionChartBlockHtml(relevantMission, 'Active Mission Target',
          missionMapGeometry(state, relevantMission));
      }

      {
        const primary = resolveGalaxyMapPrimaryAction(state, t);
        buttonLabel = primary && primary.label ? primary.label : 'Set Waypoint';
      }

    } else if (t.kind === 'claim') {
      html += claimInspectorHtml(t);
      buttonLabel = 'Set Base Waypoint';
    } else if (t.kind === 'rumor') {
      html += `
        <div class="gm-ins-section">
          <div class="gm-ins-kind" style="color:${INK.gold};">${escapeMapHtml(t.statusLabel || 'RUMOR SEARCH')}</div>
          <div class="gm-ins-target-name">${escapeMapHtml(t.name)}</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Manual search area</div>
          <div class="gm-ins-row"><span>Range</span><span class="gm-ins-row-val">±${Math.round(Math.max(0, Number(t.radius) || 0))} u</span></div>
          <div class="gm-ins-note">${escapeMapHtml(t.detail || 'Approximate frontier intelligence.')}</div>
          <div class="gm-ins-note">${escapeMapHtml(t.objective || 'Fly the area manually and pulse the scanner. No waypoint is set.')}</div>
        </div>
      `;
      buttonLabel = 'Manual Search Area';
    } else if (t.kind === 'zone') {
      html += `
        <div class="gm-ins-section">
          <div class="gm-ins-kind">Zone record</div>
          <div class="gm-ins-target-name">${escapeMapHtml(t.name)}</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Zone Classification</div>
          <div class="gm-ins-row">
            <span>Type</span>
            <span class="gm-ins-row-val">${escapeMapHtml(t.detail || 'Generic Region')}</span>
          </div>
          <div class="gm-ins-row">
            <span>Threat Index</span>
            <span class="gm-ins-row-val" style="color:${t.threat ? INK.red : INK.good}">Level ${t.threat || 0}</span>
          </div>
        </div>

      `;
      buttonLabel = 'Align Autopilot';
    } else if (t.kind === 'waypoint') {
      const player = playerEntity(state);
      const dist = player && Number.isFinite(t.x) && Number.isFinite(t.z)
        ? Math.round(Math.hypot(t.x - player.pos.x, t.z - player.pos.z))
        : null;
      html += `
        <div class="gm-ins-section">
          <div class="gm-ins-kind" style="color:${INK.amberHot};">ACTIVE WAYPOINT</div>
          <div class="gm-ins-target-name" style="color:${INK.amberHot};">${escapeMapHtml(t.name)}</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Navigation</div>
          <div class="gm-ins-row">
            <span>Reason</span>
            <span class="gm-ins-row-val">${escapeMapHtml(t.detail || 'Tracked objective')}</span>
          </div>
          <div class="gm-ins-row">
            <span>Range</span>
            <span class="gm-ins-row-val">${dist != null ? dist + ' u' : 'Unknown'}</span>
          </div>
        </div>

      `;
      buttonLabel = 'Track Waypoint';
    } else {
      // General contact
      const contactDist = player && Number.isFinite(t.x) && Number.isFinite(t.z)
        ? Math.round(Math.hypot(t.x - player.pos.x, t.z - player.pos.z)) : null;
      const contactSpeed = Number.isFinite(t.vx) ? Math.round(Math.hypot(t.vx, t.vz)) : 0;
      const contactFaction = factionNameOf(t.factionId);
      html += `
        <div class="gm-ins-section">
          <div class="gm-ins-kind">Contact record</div>
          <div class="gm-ins-target-name">${escapeMapHtml(t.name)}</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Object Class</div>
          <div class="gm-ins-row"><span>Type</span><span class="gm-ins-row-val">${t.kind ? t.kind.toUpperCase() : 'UNKNOWN'}</span></div>
          <div class="gm-ins-row"><span>Faction</span><span class="gm-ins-row-val" style="color:${factionColorOf(t.factionId)}"><span${entityAttr('faction:' + t.factionId)}>${escapeMapHtml(contactFaction)}</span></span></div>
          <div class="gm-ins-row"><span>Hostile</span><span class="gm-ins-row-val" style="color:${t.hostile ? INK.red : INK.good}">${t.hostile ? 'YES' : 'NO'}</span></div>
          <div class="gm-ins-row"><span>Distance</span><span class="gm-ins-row-val">${contactDist != null ? contactDist + ' u' : 'Unknown'}</span></div>
          <div class="gm-ins-row"><span>Speed</span><span class="gm-ins-row-val">${contactSpeed} u/s</span></div>
        </div>
      `;
      buttonLabel = 'Track Target';
    }

    // SLICE C: the per-kind detail above is the OVERVIEW body. Every other tab renders its own
    // depth for the same selection, one at a time — the selection detail is no longer the only
    // thing the panel can show, and it is no longer stacked underneath everything else either.
    const tabbed = this._tabHtml(state, html);
    if (this._inspectorDetailsHtml !== tabbed) {
      detailsEl.innerHTML = tabbed;
      this._inspectorDetailsHtml = tabbed;
    }
    const primary = resolveGalaxyMapPrimaryAction(state, t);
    if (btn.textContent !== buttonLabel) btn.textContent = buttonLabel;
    if (primary && primary.coursePayload) {
      if (btn.hidden) btn.hidden = false;
      if (btn.disabled) btn.disabled = false;
    } else {
      if (!btn.hidden) btn.hidden = true;
      if (!btn.disabled) btn.disabled = true;
    }
  },

  // ═══ SLICE C — tab bodies ══════════════════════════════════════════════════════════════════
  //
  // Each returns HTML for ONE tab. `selectionHtml` is the existing per-kind detail block, passed
  // in rather than recomputed — the shipped inspector markup for sectors/stations/contacts is
  // working, checked content and this packet reorganises where it appears, not what it says.

  _tabHtml(state, selectionHtml) {
    const avail = resolveInspectorTabAvailability(state, this._selectedTarget);
    const info = avail[this._activeTab];
    if (info && !info.available) {
      // A tab with nothing behind it says so in words. This is the same contract as a disabled
      // action carrying its reason: an empty panel that explains itself teaches, a blank one does
      // not, and a fabricated one lies.
      return `<div class="gm-ins-section"><div class="gm-ins-title">${escapeMapHtml(
        (MAP_INSPECTOR_TABS.find((t) => t.id === this._activeTab) || {}).label || '')}</div>
        <div class="gm-ins-note">${escapeMapHtml(info.reason)}</div></div>`;
    }
    switch (this._activeTab) {
      case 'travel': return this._travelTabHtml(state);
      case 'missions': return this._missionsTabHtml(state);
      case 'economy': return this._economyTabHtml(state);
      case 'threat': return this._threatTabHtml(state);
      case 'careers': return this._careersTabHtml(state);
      case 'services': return this._servicesTabHtml(state);
      case 'discovery': return this._discoveryTabHtml(state);
      case 'history': return this._historyTabHtml();
      case 'overview':
      default:
        return this._overviewTabHtml(state, selectionHtml);
    }
  },

  /**
   * OVERVIEW — never empty, and never a wall.
   *
   * With a selection it shows that selection's detail. With NO selection it shows the four
   * always-present navigation answers from `resolveMapNavContext` — the SAME object the on-canvas
   * cartouche and the framing buttons read, so the panel and the chart cannot contradict each
   * other about where the player is or where they are going. That reuse is the point: the old
   * no-selection body re-derived a different set of facts (credits, cargo, heat, hull, trade
   * lanes, quotes) and showed all of them at once.
   */
  _overviewTabHtml(state, selectionHtml) {
    if (selectionHtml) return selectionHtml;
    const ctx = this._navContext(state);
    const rows = (ctx && ctx.rows) || [];
    const rowsHtml = rows.map((row) => `
      <div class="gm-nav-row" data-tone="${escapeMapHtml(row.tone)}">
        <span class="gm-nav-row-k">${escapeMapHtml(row.label)}</span>
        <span class="gm-nav-row-v">${escapeMapHtml(row.value)}</span>
        ${row.detail ? `<span class="gm-nav-row-d">${escapeMapHtml(row.detail)}</span>` : ''}
      </div>`).join('');
    // The pocket's trades appear the moment the Chart opens — §11.11 #1 is a surfacing problem, and
    // the roster is one tab deeper. Rendered only when careers are actually on record here, so the
    // no-selection panel never grows a block that says nothing.
    const careersHtml = careersOverviewLineHtml(state, currentSectorId(state));
    return `
      <div class="gm-ins-section">
        <div class="gm-ins-kind">Survey table / Navigation</div>
        <div class="gm-ins-target-name">Where you are</div>
        ${rowsHtml}
      </div>
      ${careersHtml}
      <div class="gm-ins-section">
        <div class="gm-ins-note">Click a sector, station or contact to inspect it. <b>Double-click</b> any mark to lay a course. Other tabs hold trade, threat, careers and survey depth.</div>
      </div>`;
  },

  /** TRAVEL — the ribbon's detail view. Same model object, so the two cannot disagree. */
  _travelTabHtml(state) {
    const ribbon = this._ribbonModel(state);
    if (!ribbon.visible) {
      return `<div class="gm-ins-section"><div class="gm-ins-title">Travel</div>
        <div class="gm-ins-note">${escapeMapHtml(ribbon.reason)}</div></div>`;
    }
    const legs = ribbon.legs.map((leg) => `
      <div class="gm-ins-row" data-leg-state="${leg.state}">
        <span>${leg.state === RIBBON_LEG_STATE.ACTIVE ? '<b>' : ''}${escapeMapHtml(leg.fromName)} → ${escapeMapHtml(leg.toName)}${leg.state === RIBBON_LEG_STATE.ACTIVE ? '</b>' : ''}</span>
        <span class="gm-ins-row-val">${Math.round(leg.fuel)}F · ${escapeMapHtml(leg.hazardLabel)}${leg.resolved ? '' : ' · unresolved'}</span>
      </div>`).join('');
    const interruption = ribbon.interruption
      ? `<div class="gm-ins-note"><b style="color:var(--ink);">INTERRUPTED:</b> ${escapeMapHtml(ribbon.interruption.label)}. The itinerary is kept — Resume picks it up on the same leg.</div>`
      : '';
    return `
      <div class="gm-ins-section">
        <div class="gm-ins-kind">Route</div>
        <div class="gm-ins-target-name">${escapeMapHtml(ribbon.arrival ? ribbon.arrival.label : 'Route')}</div>
        <div class="gm-ins-row"><span>Status</span><span class="gm-ins-row-val">${escapeMapHtml(ribbon.reason)}</span></div>
        ${interruption}
      </div>
      <div class="gm-ins-section">
        <div class="gm-ins-title">Legs</div>
        ${legs}
      </div>
      <div class="gm-ins-section">
        <div class="gm-ins-title">Cost &amp; time</div>
        <div class="gm-ins-row"><span>Fuel remaining</span><span class="gm-ins-row-val">${Math.round(ribbon.totals.fuelRemaining)} of ${Math.round(ribbon.totals.fuel)}</span></div>
        <div class="gm-ins-row"><span>Align time</span><span class="gm-ins-row-val">${escapeMapHtml(ribbon.totals.chargeLabel)}</span></div>
        <div class="gm-ins-row"><span>Next waypoint</span><span class="gm-ins-row-val">${ribbon.nextWaypoint ? escapeMapHtml(ribbon.nextWaypoint.distanceLabel) : '—'}</span></div>
        <div class="gm-ins-row"><span>ETA</span><span class="gm-ins-row-val">${escapeMapHtml(ribbon.eta.available ? ribbon.eta.label : '—')}</span></div>
        <div class="gm-ins-note">${escapeMapHtml(ribbon.eta.reason)}</div>
      </div>`;
  },

  _missionsTabHtml(state) {
    const missions = ((state.missions && state.missions.active) || []).filter((m) => m && m.status === 'active');
    const trackedId = state.ui && state.ui.trackedMissionId;
    if (!missions.length) {
      return '<div class="gm-ins-section"><div class="gm-ins-title">Missions</div><div class="gm-ins-note">No active missions.</div></div>';
    }
    return missions.map((m) => missionChartBlockHtml(
      m,
      m.id === trackedId ? 'Tracked mission' : 'Active mission',
      missionMapGeometry(state, m),
    )).join('');
  },

  /** ECONOMY — the old always-on no-selection dump, now behind a tab where it belongs. */
  _economyTabHtml(state) {
    const lanes = buildCargoDeckTradeLanesModel(state, 5);
    const lanesHtml = lanes.length
      ? lanes.map((lane) => {
        const reliability = Number.isFinite(Number(lane.reliability)) ? Number(lane.reliability) : 1;
        const relColor = reliability >= 0.8 ? INK.good : reliability >= 0.5 ? INK.warn : INK.ink2;
        const modelish = lane.source === 'MODEL';
        const profitRaw = Math.max(0, Math.round(Number(lane.expectedProfit) || 0));
        const profitRounded = modelish ? Math.round(profitRaw / 10) * 10 : profitRaw;
        const profit = profitRounded.toLocaleString('en-US');
        const perMin = Math.max(0, Math.round(Number(lane.profitPerMinute) || 0));
        const riskPct = Math.round(clamp01(lane.risk) * 100);
        const sourceGlyph = lane.source === 'MEMORY' ? '●' : lane.source === 'HERE' ? '⌂' : '◌';
        const lanePath = lane.source === 'HERE'
          ? `→ ${lane.destinationName}`
          : `${lane.originName} → ${lane.destinationName}`;
        const ageLabel = lane.source === 'MEMORY' ? ` · ${Math.max(1, Math.round((Number(lane.ageS) || 0) / 60))}m` : '';
        const modelDelta = Number.isFinite(Number(lane.modelDeltaPct))
          ? ` · MODEL ${(lane.modelDeltaPct >= 0 ? '+' : '')}${Math.round(lane.modelDeltaPct)}%`
          : '';
        return `
        <button class="gm-tl-row" type="button" data-gm-lane="${escapeMapHtml(lane.destinationId)}">
          <span class="gm-tl-head"><span>${sourceGlyph} ${escapeMapHtml(lane.commodityName)}</span><span class="gm-tl-profit" style="color:${relColor}">${modelish ? '~' : ''}+${profit} cr</span></span>
          <span class="gm-tl-sub">${escapeMapHtml(lanePath)} · ${Math.max(0, Math.floor(lane.units))}u · ${perMin}/min · risk ${riskPct}%${ageLabel}${modelDelta}</span>
        </button>`;
      }).join('')
      // The build map's named live symptom (§11.11 #8): this pane was correct-but-blank until two
      // stations had been priced, and said so without offering a way to get there. Both branches now
      // name what would fill them AND carry a verb (J3).
      : (state && state.economy && state.economy.marketIntel && Object.keys(state.economy.marketIntel).length)
        ? dataStateHtml('empty', {
          code: 'LANE_UNPROFITABLE',
          headline: 'No lane in your intel turns a profit yet.',
          fills: 'Ranked lanes appear once you hold fresh quotes at two or more stations trading the same goods.',
          verb: { label: 'Find somewhere to dock', action: 'economy:services' },
        })
        : dataStateHtml('empty', {
          code: 'INTEL_INCOMPLETE',
          headline: 'You have not priced a market yet.',
          fills: 'Dock anywhere and open its market — the first quote you record starts the ledger this ranks from.',
          verb: { label: 'Find somewhere to dock', action: 'economy:services' },
        });

    const offers = bestKnownSellOffers(state, this._selectedCommodity, 3);
    const commodityLabel = String(this._selectedCommodity || '').replace('cmdty_', '').replace(/_/g, ' ').toUpperCase();
    const feedStale = offers.length > 0 && offers.every((offer) => Number(offer.ageS) >= AGE_HOLLOW_S);
    const offersHtml = feedStale
      ? dataStateHtml('error', {
        code: 'MARKET_FEED_STALE',
        headline: 'The market feed did not answer.',
        fills: 'Every quote on ' + commodityLabel + ' is older than fifteen minutes. Dock at an exchange and the ledger writes a fresh line.',
        verb: { label: 'Find somewhere to dock', action: 'economy:services' },
        compact: true,
      })
      : offers.length
      ? offers.map((offer) => {
        const tint = memoryTint(offer.ageS);
        return `<div class="gm-bk-row"><span class="gm-bk-station">${escapeMapHtml(offer.stationName)}</span><span class="gm-bk-val ${tint.key}">${offer.sell} cr · ${ageText(offer.ageS)}</span></div>`;
      }).join('')
      : dataStateHtml('empty', {
        code: 'NO_QUOTES',
        headline: 'Nobody has quoted you a price for ' + commodityLabel + '.',
        fills: 'Dock at a station that buys it and the price you are shown is remembered here, with its age.',
        verb: { label: 'Lens another commodity', action: 'economy:commodity' },
        compact: true,
      });

    const credits = state.player && state.player.credits ? Math.round(state.player.credits).toLocaleString() : '0';
    const cargo = state.player && state.player.cargo ? (state.player.cargo.volume || 0) : 0;
    const cargoCap = state.player && state.player.cargo ? (state.player.cargo.capVolume || 1) : 1;

    return `
      <div class="gm-ins-section">
        <div class="gm-ins-title">Hold</div>
        <div class="gm-ins-row"><span>Credits</span><span class="gm-ins-row-val">${credits} cr</span></div>
        <div class="gm-ins-row"><span>Cargo</span><span class="gm-ins-row-val">${cargo}/${cargoCap} u</span></div>
      </div>
      <div class="gm-ins-section">
        <div class="gm-ins-title">Trade lanes · profit/min</div>
        ${lanesHtml}
      </div>
      <div class="gm-ins-section">
        <div class="gm-ins-title">Best known sell · <span${entityAttr('commodity:' + this._selectedCommodity)}>${escapeMapHtml(commodityLabel)}</span></div>
        ${offersHtml}
      </div>`;
  },

  _threatTabHtml(state) {
    const t = this._selectedTarget;
    const sectorId = (t && (t.sectorId || (t.kind === 'sector' ? t.id : null))) || currentSectorId(state);
    const record = sectorRecordById(state, sectorId);
    const sec = record && record.security != null ? record.security : 0.5;
    const law = sectorLawProfile(state, sectorId, sec);
    const player = playerEntity(state);
    const hull = player && player.hull != null ? Math.round(player.hull) : 0;
    const hullMax = player && player.hullMax != null ? Math.round(player.hullMax) : 0;
    const heatValue = Number(state.player && state.player.heat) || 0;
    const heat = Math.round(heatValue * 100);
    const heatLevel = heatLevelFor(heatValue);
    const heatClearS = heatClearSecondsForLevel(heatLevel);
    const wanted = isPlayerWanted(state);
    const hazards = (record && record.hazards && record.hazards.length)
      ? record.hazards.map((h) => `${hazardTypeGlyph(h.type)} ${escapeMapHtml(String(h.type))}`).join(' · ')
      : 'None recorded';
    const conflict = sectorConflictSignal(state, sectorId);
    const holdings = sectorHoldingsSignal(state, sectorId);
    const ecology = regionalEcologyReadout(state, sectorId);
    const economyProfile = REGIONAL_ECONOMY_PROFILE_BY_SECTOR.get(sectorId) || null;
    const conflictLine = conflict.wars > 0
      ? `${conflict.wars} war${conflict.wars > 1 ? 's' : ''}${conflict.tense > 0 ? ` · ${conflict.tense} tense` : ''}`
      : conflict.tense > 0
        ? `${conflict.tense} tense pairing${conflict.tense > 1 ? 's' : ''}`
        : 'quiet';
    const holdingsLine = holdings.count
      ? `${holdings.count} claims · ${holdings.active} active · defense ${Math.round(holdings.defenseAvg)}`
      : 'none';
    const ecologyHazards = ecology && ecology.hazards && ecology.hazards.types && ecology.hazards.types.length
      ? ecology.hazards.types.join(', ')
      : 'clear';
    const profileRole = economyProfile
      ? [economyProfile.primaryRole].concat(economyProfile.secondaryRoles || []).join(' / ')
      : 'none';
    return `
      <div class="gm-ins-section">
        <div class="gm-ins-kind">Threat assessment</div>
        <div class="gm-ins-target-name"><span${entityAttr('sector:' + sectorId)}>${escapeMapHtml(sectorNameOf(state, sectorId))}</span></div>
        <div class="gm-ins-row"><span>Security</span><span class="gm-ins-row-val">${law.level} · ${securityPips(sec)}</span></div>
        <div class="gm-ins-row"><span>Jurisdiction</span><span class="gm-ins-row-val"><span${entityAttr('faction:' + law.factionId)}>${escapeMapHtml(law.authority)}</span></span></div>
        <div class="gm-ins-row"><span>Hazards</span><span class="gm-ins-row-val">${hazards}</span></div>
        <div class="gm-ins-row"><span>Events</span><span class="gm-ins-row-val">${escapeMapHtml(conflictLine)}</span></div>
        <div class="gm-ins-row"><span>Holdings</span><span class="gm-ins-row-val">${escapeMapHtml(holdingsLine)}</span></div>
      </div>
      <div class="gm-ins-section">
        <div class="gm-ins-title">Your readiness</div>
        <div class="gm-ins-row"><span>Hull</span><span class="gm-ins-row-val">${hull}/${hullMax}</span></div>
        <div class="gm-ins-row"><span>Heat</span><span class="gm-ins-row-val">${heat}% · level ${heatLevel}${wanted ? ' · WANTED' : ''}</span></div>
        <div class="gm-ins-row"><span>Clear ETA</span><span class="gm-ins-row-val">${heatClearS > 0 ? `${Math.ceil(heatClearS)}s` : 'clear'}</span></div>
        <div class="gm-ins-note"><b style="color:var(--ink);">RESPONSE:</b> ${law.response}</div>
      </div>
      <div class="gm-ins-section">
        <div class="gm-ins-title">Regional ecology dossier</div>
        <div class="gm-ins-row"><span>Family</span><span class="gm-ins-row-val">${escapeMapHtml(ecology ? ecology.familyLabel : 'Unknown')}</span></div>
        <div class="gm-ins-row"><span>Danger drift</span><span class="gm-ins-row-val">${ecology ? `${Math.round(ecology.danger.effective * 100)}% (base ${Math.round(ecology.danger.baseline * 100)}%)` : 'Unknown'}</span></div>
        <div class="gm-ins-row"><span>Hazard mix</span><span class="gm-ins-row-val">${escapeMapHtml(ecologyHazards)}</span></div>
      </div>
      <div class="gm-ins-section">
        <div class="gm-ins-title">Regional economy dossier</div>
        <div class="gm-ins-row"><span>Identity</span><span class="gm-ins-row-val">${escapeMapHtml(economyProfile ? economyProfile.identityKey : 'Unknown')}</span></div>
        <div class="gm-ins-row"><span>Role stack</span><span class="gm-ins-row-val">${escapeMapHtml(profileRole)}</span></div>
        <div class="gm-ins-row"><span>Produces</span><span class="gm-ins-row-val">${escapeMapHtml(weightedCommodityLabel(economyProfile && economyProfile.produces))}</span></div>
        <div class="gm-ins-row"><span>Consumes</span><span class="gm-ins-row-val">${escapeMapHtml(weightedCommodityLabel(economyProfile && economyProfile.consumes))}</span></div>
      </div>`;
  },

  /**
   * CAREERS — who is working this pocket, read-only off `state.npcJobs`.
   *
   * The career simulation (npcJobsRuntime — the single writer) runs haulers, miners, salvors,
   * surveyors, patrols and tenders across the pockets, and before this tab nothing in the UI read
   * it (build map §11.11 #1, measured). The roster itself is built by map/careersReadout.js — a
   * pure join of the ledger, the live entity table and the entity resolver — so this method only
   * resolves the pocket in scope with the same idiom the Threat tab uses, and hands over. Doors
   * (hull / faction / station / sector) render through entityAttr/entitySpanHtml and open the
   * shared dossier drawer via the delegated handler on #screens, like every other link on the Chart.
   */
  _careersTabHtml(state) {
    const t = this._selectedTarget;
    const sectorId = (t && (t.sectorId || (t.kind === 'sector' ? t.id : null))) || currentSectorId(state);
    return careersTabHtml(state, sectorId);
  },

  _servicesTabHtml(state) {
    const t = this._selectedTarget;
    const stations = [];
    if (t && t.kind === 'station') {
      stations.push({ id: t.id, name: t.name, services: t.services || [] });
    } else {
      const sectorId = (t && (t.sectorId || t.id)) || currentSectorId(state);
      const record = sectorRecordById(state, sectorId);
      for (const s of (record && record.stations) || []) {
        stations.push({ id: s.id, name: s.name || s.id, services: s.services || [] });
      }
    }
    if (!stations.length) {
      return '<div class="gm-ins-section"><div class="gm-ins-title">Services</div><div class="gm-ins-note">No berths recorded here.</div></div>';
    }
    return stations.map((s) => `
      <div class="gm-ins-section">
        <div class="gm-ins-title"><span${entityAttr('station:' + s.id)}>${escapeMapHtml(s.name)}</span></div>
        ${s.services.length
          ? `<div class="gm-svc-row">${s.services.map((svc) => `<span class="gm-svc-chip"><span aria-hidden="true">${serviceIconSvg(svc)}</span>${escapeMapHtml(svc === 'ore_buy' ? 'Ore buy' : svc)}</span>`).join('')}</div>`
          : '<div class="gm-ins-note">No services listed.</div>'}
      </div>`).join('');
  },

  _discoveryTabHtml(state) {
    const t = this._selectedTarget;
    const sectorId = (t && (t.sectorId || (t.kind === 'sector' ? t.id : null))) || currentSectorId(state);
    const record = sectorRecordById(state, sectorId);
    const charted = record ? isSectorCharted(state, record) : false;
    const confidence = record ? mapConfidenceForSector(state, record) : null;
    const disc = discoveryForSector(state, sectorId);
    const exploration = sectorExplorationProgress(state, record || sectorId);
    const rumorCards = frontierRumorMapReadouts(state, sectorId);
    const vestaCards = vestaOreCacheMapReadouts(state, sectorId);
    const pallasCards = pallasHiddenCacheMapReadouts(state, sectorId);
    const pct = confidence && Number.isFinite(confidence.value) ? Math.round(confidence.value * 100) : null;
    const siteButtons = worldSiteMapMarkers(state, sectorId).map((marker) => `
      <button class="gm-site-row" type="button" data-world-site-id="${escapeMapHtml(marker.id)}"
        data-world-site-sector="${escapeMapHtml(marker.sectorId)}"
        aria-label="Inspect World Site ${escapeMapHtml(marker.name)}"
        aria-pressed="${!!(t && t.id === marker.id)}">
        <span>${escapeMapHtml(marker.name)}</span>
        <span class="gm-ins-row-val">${escapeMapHtml(marker.stageLabel)}</span>
      </button>`).join('');
    const rumorRows = rumorCards.map((rumor) => `
      <button class="gm-site-row" type="button" data-frontier-rumor-id="${escapeMapHtml(rumor.rumorId)}"
        data-frontier-rumor-sector="${escapeMapHtml(rumor.sectorId)}"
        aria-label="Inspect ${escapeMapHtml(rumor.name)} search area"
        aria-pressed="${!!(t && t.id === rumor.rumorId)}">
        <span class="gm-ins-kind">${escapeMapHtml(rumor.statusLabel)}</span>
        <span class="gm-ins-title">${escapeMapHtml(rumor.name)}</span>
        <span class="gm-ins-note">${escapeMapHtml(rumor.detail)}</span>
        <span class="gm-ins-note">${escapeMapHtml(rumor.objective)}</span>
      </button>`).join('');
    const vestaRows = vestaCards.map((cache) => `
      <button class="gm-site-row" type="button" data-vesta-cache-id="${escapeMapHtml(cache.cacheRecordId)}"
        data-vesta-cache-sector="${escapeMapHtml(cache.sectorId)}"
        aria-label="Inspect ${escapeMapHtml(cache.name)}. ${escapeMapHtml(cache.objective)}"
        aria-pressed="${!!(t && t.id === cache.cacheRecordId)}">
        <span class="gm-ins-kind">${escapeMapHtml(cache.statusLabel)}</span>
        <span class="gm-ins-title">${escapeMapHtml(cache.name)}</span>
        <span class="gm-ins-note">${escapeMapHtml(cache.detail)}</span>
        <span class="gm-ins-note">${escapeMapHtml(cache.objective)}</span>
      </button>`).join('');
    const pallasRows = pallasCards.map((cache) => `
      <button class="gm-site-row" type="button" data-pallas-cache-id="${escapeMapHtml(cache.cacheRecordId)}"
        data-pallas-cache-sector="${escapeMapHtml(cache.sectorId)}"
        aria-label="Inspect ${escapeMapHtml(cache.name)}. ${escapeMapHtml(cache.objective)}"
        aria-pressed="${!!(t && t.id === cache.cacheRecordId)}">
        <span class="gm-ins-kind">${escapeMapHtml(cache.statusLabel)}</span>
        <span class="gm-ins-title">${escapeMapHtml(cache.name)}</span>
        <span class="gm-ins-note">${escapeMapHtml(cache.detail)}</span>
        <span class="gm-ins-note">${escapeMapHtml(cache.objective)}</span>
      </button>`).join('');
    return `
      <div class="gm-ins-section">
        <div class="gm-ins-kind">Survey record</div>
        <div class="gm-ins-target-name">${escapeMapHtml(sectorNameOf(state, sectorId))}</div>
        <div class="gm-ins-row"><span>Charted</span><span class="gm-ins-row-val">${charted ? 'Yes' : 'No'}</span></div>
        <div class="gm-ins-row"><span>Confidence</span><span class="gm-ins-row-val">${pct == null ? 'Unknown' : `${pct}%`}${confidence && confidence.band ? ` · ${escapeMapHtml(String(confidence.band))}` : ''}</span></div>
        <div class="gm-ins-row"><span>Scanned</span><span class="gm-ins-row-val">${disc && disc.scanned ? 'Yes' : 'No'}</span></div>
        <div class="gm-ins-row"><span>Exploration</span><span class="gm-ins-row-val">${exploration.percent == null ? 'No authored sites' : `${exploration.percent}% · ${exploration.found}/${exploration.total} sites`}</span></div>
      </div>
      <div class="gm-ins-section">
        <div class="gm-ins-note">Confidence decays with time since survey. Re-scan a sector to refresh what the chart is willing to assert about it.</div>
      </div>
      ${rumorRows}
      ${vestaRows}
      ${pallasRows}
      ${siteButtons ? `<div class="gm-ins-section"><div class="gm-ins-title">World Sites</div>${siteButtons}</div>` : ''}`;
  },

  _historyTabHtml() {
    const target = this._selectedTarget;
    const history = target && target.history;
    const rows = history && Array.isArray(history.rows) ? history.rows : [];
    const activity = rows.length
      ? `<ol class="gm-history-list" aria-label="Recent World Site activity">${rows.map((row) => `
          <li data-history-kind="${escapeMapHtml(row.kind)}">
            <span>${escapeMapHtml(row.label)}</span>
            <span class="gm-ins-row-val">${escapeMapHtml(row.detail)}</span>
          </li>`).join('')}</ol>`
      : '<div class="gm-ins-note">No activity receipts recorded yet.</div>';
    return `<div class="gm-ins-section">
        <div class="gm-ins-kind">World Site history</div>
        <div class="gm-ins-target-name">${escapeMapHtml(target && target.name || 'World Site')}</div>
        <div class="gm-ins-row"><span>Stage</span><span class="gm-ins-row-val">${escapeMapHtml(history && history.stageLabel || target && target.stageLabel || 'Unknown')}</span></div>
        <div class="gm-ins-row"><span>Completed</span><span class="gm-ins-row-val">${Math.max(0, Number(history && history.completedCount) || 0)}</span></div>
        <div class="gm-ins-row"><span>Failures</span><span class="gm-ins-row-val">${Math.max(0, Number(history && history.failureCount) || 0)}</span></div>
      </div>
      <div class="gm-ins-section"><div class="gm-ins-title">Recent activity</div>${activity}</div>`;
  },

  // ═══ SLICE C — place context actions ═══════════════════════════════════════════════════════

  /**
   * The verbs available on the current selection.
   *
   * Every one is resolved from real state and carries a reason in both states. `plot` reuses the
   * shipped primary action; `frame` and `bookmark` are camera verbs with real consumers in this
   * screen; `open-system` changes scale to the selection's own sector. Nothing here invents a
   * consumer, and nothing here duplicates the engage control (route control lives on the ribbon).
   */
  _renderPlaceActions(state) {
    if (!HAS_DOC || !this._root) return;
    const host = this._placeActionsEl || this._root.querySelector('#gm-place-actions');
    if (!host) return;
    const t = this._selectedTarget;
    if (!t) {
      if (host.innerHTML !== '') { host.innerHTML = ''; this._lastPlaceActionsHtml = ''; }
      return;
    }
    // `plot` reports availability from the PLOT-ONLY resolver, so its reason describes what the
    // button will actually do. It used to key off the primary action, which meant the row claimed
    // "Lay a course to this mark" for a neighbour and then committed a jump.
    const sectorId = t.sectorId || (t.kind === 'sector' ? t.id : null);
    const acts = [
      { id: 'frame', label: 'Frame', available: true, reason: 'Centre the chart on this mark' },
      { id: 'open-system', label: 'Open system', available: !!sectorId, reason: sectorId ? 'Zoom to this mark\'s own sector' : 'This mark has no parent sector' },
      { id: 'bookmark', label: 'Bookmark', available: true, reason: 'Save this view to the left rail' },
    ];
    if (t.kind !== 'rumor' && t.courseDisabled !== true) {
      const plot = resolveGalaxyMapPlotAction(state, t);
      acts.unshift({ id: 'plot', label: 'Plot course', available: plot.available, reason: plot.reason });
    }
    const html = acts.map((a) => `<button class="gm-place-btn" type="button" data-place-action="${a.id}"
      ${a.available ? '' : 'tabindex="0"'} aria-disabled="${!a.available}" data-why="${escapeMapHtml(a.reason)}">${escapeMapHtml(a.label)}</button>`).join('');
    if (this._lastPlaceActionsHtml !== html) {
      host.innerHTML = html;
      this._lastPlaceActionsHtml = html;
    }
  },

  _activatePlaceAction(id) {
    const state = this._ctx && this._ctx.state;
    const t = this._selectedTarget;
    if (!state || !t || !id) return false;
    if (id === 'plot') {
      // A button that says "Plot course" must PLOT. It previously resolved the PRIMARY action,
      // which for an adjacent sector is "Set Course & Jump" — so it emitted `world:requestJump`
      // and dismissed the chart while its own tooltip promised a course. That is a control lying
      // about what it does, and it is why the route follower was unreachable on the canonical
      // one-hop contract: the plot appeared to succeed, the chart vanished, and Engage was gone
      // with it. It now goes through the plot-only resolver and leaves the chart open.
      const action = resolveGalaxyMapPlotAction(state, t);
      if (!action.available) return false;
      if (!emitGalaxyMapPrimaryAction(this._ctx.bus, action)) return false;
      this._updateEngageControl();
      this._updatePlotControl();
      this._updateRailSections(state);
      return true;
    }
    if (id === 'bookmark') return this._addBookmark();
    if (id === 'frame' || id === 'open-system') {
      // Both are camera moves in the GLOBAL frame (ADR D2.1). A search-style target carries global
      // x/z; a galaxy sector node carries GRAPH coordinates, so its global position is derived from
      // its authored origin rather than from the node's draw position.
      const sectorId = t.sectorId || (t.kind === 'sector' ? t.id : null);
      let focus = null;
      if (t.kind === 'sector' && sectorId) {
        const origin = sectorGlobalOrigin(sectorId);
        focus = { x: origin.x, z: origin.z };
      } else if (Number.isFinite(t.x) && Number.isFinite(t.z)) {
        focus = { x: t.x, z: t.z };
      } else if (sectorId) {
        const origin = sectorGlobalOrigin(sectorId);
        focus = { x: origin.x, z: origin.z };
      }
      if (!focus) return false;
      const spanWU = id === 'open-system' ? MAP_PRESET_SPAN_WU.system : MAP_PRESET_SPAN_WU.local;
      return this._setCameraFraming({ focusGlobal: focus, spanWU });
    }
    return false;
  },

  // ═══ SLICE C — inspector tabs ══════════════════════════════════════════════════════════════

  /**
   * Build the tablist once, then keep its selected state in sync.
   *
   * ROVING TABINDEX: exactly one tab is in the sequential tab order at a time (`tabindex="0"`);
   * the rest are `-1` and reached with the arrow keys. That is the ARIA authoring practice for a
   * tablist and it is what stops eight tabs from adding eight stops to every Tab traversal of the
   * screen — the keyboard equivalent of the density problem this packet is fixing.
   */
  _renderTabs(state) {
    if (!HAS_DOC || !this._root) return;
    const host = this._root.querySelector('#gm-tabs');
    if (!host) return;
    const avail = resolveInspectorTabAvailability(state, this._selectedTarget);

    if (!this._tabButtons.length) {
      host.innerHTML = MAP_INSPECTOR_TABS.map((tab) => `
        <button class="gm-tab" type="button" role="tab" id="gm-tab-${tab.id}" data-tab="${tab.id}"
                aria-controls="gm-tabpanel" aria-selected="false" tabindex="-1">${tab.label}</button>`).join('');
      this._tabButtons = Array.from(host.querySelectorAll('.gm-tab'));
      for (const btn of this._tabButtons) {
        btn.addEventListener('click', () => this._setTab(btn.getAttribute('data-tab')));
        btn.addEventListener('keydown', (ev) => this._onTabKey(ev));
      }
    }

    // NOTE — deliberately NO auto-fallback when the active tab becomes unavailable.
    //
    // An earlier revision bounced the selection back to Overview whenever `available` was false.
    // That is worse on both counts it was meant to help: a player who deliberately opens History
    // gets silently teleported somewhere else (and can never read why it is empty), and a player
    // sitting on Travel when a route clears gets yanked mid-read. `_tabHtml` already renders the
    // tab's own reason, which is the honest answer in both situations — the panel explains itself
    // instead of the selection moving under the player.
    for (const btn of this._tabButtons) {
      const id = btn.getAttribute('data-tab');
      const info = avail[id] || { available: true, reason: '' };
      const selected = id === this._activeTab;
      if (btn.getAttribute('aria-selected') !== String(selected)) {
        btn.setAttribute('aria-selected', String(selected));
      }
      // Roving tabindex: only the selected tab is a tab stop.
      const tabindex = selected ? '0' : '-1';
      if (btn.getAttribute('tabindex') !== tabindex) btn.setAttribute('tabindex', tabindex);
      // Unavailable tabs stay REACHABLE (aria-disabled, not `disabled`) so a screen-reader user
      // can hear the reason instead of finding a tab that silently does not exist. The reason
      // travels on the control itself as well.
      if (btn.getAttribute('aria-disabled') !== String(!info.available)) {
        btn.setAttribute('aria-disabled', String(!info.available));
      }
      if (btn.getAttribute('title') !== info.reason) btn.setAttribute('title', info.reason);
      btn.classList.toggle('is-empty', !info.available);
      btn.classList.toggle('active', selected);
    }
    const panel = this._tabPanel || this._root.querySelector('#gm-tabpanel');
    if (panel) panel.setAttribute('aria-labelledby', `gm-tab-${this._activeTab}`);
  },

  /** Arrow-key traversal across the tablist, plus Home/End. Wraps, as the ARIA pattern expects. */
  _onTabKey(ev) {
    if (!ev || !ev.key) return;
    const ids = MAP_INSPECTOR_TAB_IDS;
    const cur = ids.indexOf(this._activeTab);
    let next = -1;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (cur + 1) % ids.length;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (cur - 1 + ids.length) % ids.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = ids.length - 1;
    else return;
    ev.preventDefault();
    ev.stopPropagation();
    this._setTab(ids[next], { focus: true });
  },

  _setTab(id, { focus = false, defer = false } = {}) {
    if (!id || MAP_INSPECTOR_TAB_IDS.indexOf(id) < 0) return false;
    const state = this._ctx && this._ctx.state;
    const avail = resolveInspectorTabAvailability(state, this._selectedTarget);
    // An unavailable tab still SELECTS — it renders its reason. Refusing the selection outright
    // would leave a keyboard user unable to reach the explanation of why it is empty.
    this._activeTab = id;
    this._lastTabHtml = null;
    this._renderTabs(state);
    // `defer` is the screen-open path: the DOM state still has to be pushed, but the inspector
    // is an expensive read and the first cadence frame will do it a few milliseconds later.
    if (!defer) this._updateInspector();
    if (focus && HAS_DOC && this._root) {
      const btn = this._root.querySelector(`#gm-tab-${id}`);
      if (btn && typeof btn.focus === 'function') btn.focus();
    }
    return avail[id] ? avail[id].available : true;
  },

  // ═══ SLICE C — the route ribbon ════════════════════════════════════════════════════════════

  /** The live ribbon record, joined from the plotted route and the real executor. */
  _ribbonModel(state) {
    if (!state) return resolveRouteRibbon();
    const nav = state.nav || {};
    const player = playerEntity(state);
    const vel = player && player.vel;
    return resolveRouteRibbon({
      route: nav.route || null,
      executor: readRouteExecutorForMap(nav.executor),
      playerGlobal: player && player.pos ? { x: player.pos.x, z: player.pos.z } : null,
      // Real current speed. The ribbon turns this into an at-current-speed ETA, and refuses to
      // show one at all when the ship is not making way — never a fabricated arrival time.
      playerSpeedWUs: vel ? Math.hypot(vel.x || 0, vel.z || 0) : 0,
      sectorNames: SECTOR_NAME_BY_ID,
    });
  },

  _weatherSnapshot(state) {
    if (!state) return null;
    const dir = state.encounterDirector || {};
    const pressureCombat = Math.max(0, Math.min(140, Number(dir.pressure && dir.pressure.combat) || 0));
    const pressureCivil = Math.max(0, Math.min(140, Number(dir.pressure && dir.pressure.civilian) || 0));
    const pool = Math.round(Math.max(pressureCombat, pressureCivil));
    const level = pool >= 84 ? 'HOT' : pool >= 36 ? 'WORKING' : 'QUIET';

    const player = playerEntity(state);
    const sectorId = currentSectorId(state);
    const sector = sectorRecordById(state, sectorId);
    const sec = Number.isFinite(Number(sector && sector.security)) ? Number(sector.security) : 0.5;
    const local = player && player.pos ? globalToSectorLocalForSector(player.pos, sectorId) : null;
    const zone = local ? zoneAt(sectorId, local.x, local.z) : null;
    const ecology = regionalEcologyReadout(state, sectorId);
    const ecologyDanger = ecology && ecology.danger
      ? Math.max(0, Number(ecology.danger.effective) - Number(ecology.danger.baseline || 0))
      : 0;
    const cargoItems = state.player && state.player.cargo && state.player.cargo.items || {};
    let cargoValue = 0;
    for (const [commodityId, qtyRaw] of Object.entries(cargoItems)) {
      const qty = Math.max(0, Number(qtyRaw) || 0);
      const def = COMMODITY_BY_ID.get(commodityId);
      cargoValue += qty * Math.max(1, Number(def && def.basePrice) || 1);
    }
    const cargoBand = Math.min(1, cargoValue / 2000);
    const wanted = isPlayerWanted(state);
    const miningNoise = Math.min(1, Math.max(0, Number(dir.noise && dir.noise.mining) || 0));
    const bounty = ((state.player && state.player.bounty) | 0) > 0 ? 0.25 : 0;
    const terms = [
      { id: 'zone', value: 0.22 * zoneThreat(zone) },
      { id: 'insecure', value: (1 - sec) * 0.5 },
      { id: 'cargo', value: cargoBand * 0.35 },
      { id: 'wanted', value: wanted ? 0.6 : 0 },
      { id: 'noise', value: miningNoise * 0.5 },
      { id: 'bounty', value: bounty },
      { id: 'ecology', value: ecologyDanger * 0.45 },
    ].filter((term) => term.value > 0.01);
    return {
      pressureCombat,
      pressureCivil,
      pool,
      level,
      terms,
    };
  },

  _updateHeaderWeather(state) {
    if (!HAS_DOC || !this._weatherEl) return;
    const snap = this._weatherSnapshot(state);
    if (!snap) return;
    // Render through the enumerated bank, strongest first, so the list itself carries the
    // ranking. The magnitude stays where it is already legible — the `pool / 140` figure and
    // the two-segment bar above — so no third, differently scaled number rides this line.
    const phrases = [];
    const ordered = snap.terms.slice().sort((a, b) => b.value - a.value);
    for (const term of ordered) {
      const phrase = WEATHER_TERM_PHRASES[term.id];
      if (!phrase) continue; // enumerated ids only — an unknown id renders nothing
      phrases.push(phrase);
    }
    const termText = phrases.length ? phrases.join(' · ') : 'baseline only';
    const key = [
      Math.round(snap.pressureCombat),
      Math.round(snap.pressureCivil),
      snap.level,
      termText,
    ].join('#');
    if (this._lastWeatherKey === key) return;
    this._lastWeatherKey = key;
    const combatPct = Math.round((snap.pressureCombat / 140) * 100);
    const civilPct = Math.round((snap.pressureCivil / 140) * 100);
    this._weatherEl.setAttribute('data-weather-level', String(snap.level || '').toLowerCase());
    this._weatherEl.innerHTML = `
      <div class="gm-weather-head">
        <span class="gm-weather-word">${snap.level}</span>
        <span class="gm-weather-data">${snap.pool} / 140</span>
      </div>
      <div class="gm-weather-bar" role="img" aria-label="Encounter pressure ${snap.pool} of 140">
        <i class="gm-weather-seg gm-weather-seg--combat" style="width:${combatPct}%"></i>
        <i class="gm-weather-seg gm-weather-seg--civil" style="width:${civilPct}%"></i>
      </div>
      <div class="gm-weather-terms">${escapeMapHtml(termText)}</div>
    `;
  },

  _updateCargoDeck(state) {
    if (!HAS_DOC || !this._deckTableEl) return;
    if (!state) {
      this._deckTableEl.innerHTML = '';
      return;
    }
    if (this._deckSortBtn) {
      this._deckSortBtn.textContent = `Sort · ${this._deckSortMode}`;
    }
    const nowBucket = Math.floor((Number(state.simTime) || 0) / 5);
    const holdItems = state.player && state.player.cargo && state.player.cargo.items || {};
    const holdKey = Object.entries(holdItems)
      .filter(([, qty]) => (Number(qty) || 0) > 0)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([id, qty]) => `${id}:${Math.floor(Number(qty) || 0)}`)
      .join('|') || '-';
    const intel = state.economy && state.economy.marketIntel || {};
    let seenStamp = 0;
    for (const stationId of Object.keys(intel)) seenStamp += Number(intel[stationId] && intel[stationId].seenAtT) || 0;
    const key = `${nowBucket}|${this._deckSortMode}|${holdKey}|${Object.keys(intel).length}:${Math.round(seenStamp)}`;
    if (this._lastDeckKey === key) return;
    this._lastDeckKey = key;
    this._deckRoutes = buildCargoDeckTradeLanesModel(state, 14, {
      includeHeldCargo: true,
      sortBy: this._deckSortMode,
    });
    if (!this._deckRoutes.length) {
      this._deckTableEl.innerHTML = `
        <div class="gm-deck-empty">
          <div class="gm-deck-empty-title">No viable deck route</div>
          <div class="gm-deck-empty-body">Dock and scan markets, or carry cargo to seed HERE liquidation lanes.</div>
        </div>`;
      return;
    }
    this._deckTableEl.innerHTML = this._deckRoutes.slice(0, 12).map((route, index) => {
      const source = route.source || 'MODEL';
      const sourceGlyph = source === 'MEMORY' ? '◍' : source === 'HERE' ? '⌂' : '◇';
      const riskPct = Math.round(clamp01(route.risk) * 100);
      const spread = Math.max(0, Math.round(route.expectedProfit || 0)).toLocaleString('en-US');
      const ppm = Math.max(0, Math.round(route.profitPerMinute || 0));
      const units = Math.max(0, Math.floor(route.units || 0));
      const marginRaw = Math.max(0, Math.round(route.unitProfit || 0));
      const marginDisplay = source === 'MODEL'
        ? `~${Math.max(0, Math.round(marginRaw / 10) * 10)}`
        : String(marginRaw);
      const riskBand = riskPct >= 68 ? 'hot' : riskPct >= 36 ? 'watched' : 'calm';
      const laneText = source === 'HERE'
        ? `to ${route.destinationName}`
        : `${route.originName} → ${route.destinationName}`;
      const modelDelta = Number.isFinite(Number(route.modelDeltaPct))
        ? ` · MODEL ${(route.modelDeltaPct >= 0 ? '+' : '')}${Math.round(route.modelDeltaPct)}%`
        : '';
      return `
        <button class="gm-deck-row" type="button" data-deck-route="${index}" role="listitem"
                aria-label="Plot ${escapeMapHtml(route.commodityName)} from ${escapeMapHtml(route.originName)} to ${escapeMapHtml(route.destinationName)}">
          <span class="gm-deck-commodity">${sourceGlyph} ${escapeMapHtml(route.commodityName)}</span>
          <span class="gm-deck-lane">${escapeMapHtml(laneText)}</span>
          <span class="gm-deck-metric">margin ${marginDisplay}/u · +${spread} cr · ${ppm}/m · ${units}u${modelDelta}</span>
          <span class="gm-deck-risk" data-risk="${riskBand}">risk ${riskPct}%</span>
        </button>`;
    }).join('');
  },

  _activateDeckRoute(index) {
    const state = this._ctx && this._ctx.state;
    const bus = this._ctx && this._ctx.bus;
    if (!state || !bus) return false;
    const route = this._deckRoutes && this._deckRoutes[index];
    if (!route) return false;
    const target = tradeLaneTarget(state, route.destinationId);
    if (!target) return false;
    const plot = resolveGalaxyMapPlotAction(state, target);
    if (!plot.available || !emitGalaxyMapPrimaryAction(bus, plot)) return false;
    this._selectedTarget = target;
    const player = playerEntity(state);
    if (player && player.pos && Number.isFinite(target.x) && Number.isFinite(target.z)) {
      const dist = Math.hypot(target.x - player.pos.x, target.z - player.pos.z);
      const spanWU = Math.max(MAP_PRESET_SPAN_WU.system, Math.min(MAP_SPAN_MAX_WU, dist * 2.3));
      this._setCameraFraming({
        focusGlobal: { x: (target.x + player.pos.x) * 0.5, z: (target.z + player.pos.z) * 0.5 },
        spanWU,
      }, { draw: false });
    }
    const w = this._canvas ? this._canvas.width / this._dpr : 0;
    const h = this._canvas ? this._canvas.height / this._dpr : 0;
    if (w > 0 && h > 0) this.triggerScanRing(w * 0.5, h * 0.5, INK.amberHot);
    this.refresh();
    return true;
  },

  /**
   * Reveal / hide / refresh the ribbon.
   *
   * The `hidden` attribute (not opacity, not a class) is what makes absence real: a hidden ribbon
   * is out of the accessibility tree and out of the tab order, so a route that is not plotted
   * costs a keyboard user nothing.
   */
  _updateRibbon(state) {
    if (!HAS_DOC || !this._root) return null;
    const el = this._ribbonEl || this._root.querySelector('#gm-route-ribbon');
    if (!el) return null;
    const ribbon = this._ribbonModel(state);

    if (!ribbon.visible) {
      if (!el.hidden) el.hidden = true;
      this._lastRibbonKey = null;
      this._lastRibbonActionKey = null;
      return ribbon;
    }
    if (el.hidden) {
      el.hidden = false;
    }

    // Cheap change key — the ribbon is refreshed from `_draw`, which runs at display refresh at
    // LOCAL scale. Re-writing identical innerHTML 60 times a second would blow away focus inside
    // the action group every frame, which is an accessibility bug, not just waste.
    const key = [
      ribbon.status, ribbon.activeLegIndex, ribbon.legs.length,
      ribbon.eta.label, ribbon.nextWaypoint ? ribbon.nextWaypoint.distanceLabel : '-',
      ribbon.interruption ? ribbon.interruption.label : '-',
      ribbon.totals.fuelRemaining, ribbon.totals.legsRemaining,
    ].join('#');
    if (this._lastRibbonKey === key) return ribbon;
    this._lastRibbonKey = key;

    const statusEl = el.querySelector('#gm-ribbon-status');
    const arrivalEl = el.querySelector('#gm-ribbon-arrival');
    const legsEl = el.querySelector('#gm-ribbon-legs');
    const metaEl = el.querySelector('#gm-ribbon-meta');
    const actionsEl = el.querySelector('#gm-ribbon-actions');
    const reasonEl = el.querySelector('#gm-ribbon-reason');

    if (statusEl) {
      statusEl.textContent = ribbon.interruption ? ribbon.interruption.label : ribbon.reason;
      // Non-colour semantics: state is an attribute the CSS keys shape and border style off, so
      // the ribbon still reads under forced-colors and for colour-blind players.
      statusEl.setAttribute('data-ribbon-state', ribbon.interruption ? 'interrupted' : (ribbon.live ? 'live' : 'plotted'));
    }
    if (arrivalEl) arrivalEl.textContent = ribbon.arrival ? ribbon.arrival.label : '';

    if (legsEl) {
      legsEl.innerHTML = ribbon.legs.map((leg) => {
        const glyph = leg.state === RIBBON_LEG_STATE.DONE ? '✓'
          : leg.state === RIBBON_LEG_STATE.ACTIVE ? '▶' : '·';
        const unresolved = leg.resolved ? '' : ' <span class="gm-ribbon-warn">no flyable endpoint</span>';
        // The hazard band is a WORD, never only a hue.
        const hazard = leg.hazard === 'calm' ? '' : ` <span class="gm-ribbon-haz" data-haz="${leg.hazard}">${escapeMapHtml(leg.hazardLabel)}</span>`;
        return `<li class="gm-ribbon-leg" data-leg-state="${leg.state}">
          <span class="gm-ribbon-leg-g" aria-hidden="true">${glyph}</span>
          <span class="gm-ribbon-leg-n">${escapeMapHtml(leg.toName)}</span>
          <span class="gm-ribbon-leg-c">${Math.round(leg.fuel)}F</span>${hazard}${unresolved}
        </li>`;
      }).join('');
    }

    if (metaEl) {
      const bits = [];
      if (ribbon.nextWaypoint) bits.push(`Next: ${escapeMapHtml(ribbon.nextWaypoint.label)} · ${escapeMapHtml(ribbon.nextWaypoint.distanceLabel)}`);
      // ETA is shown with its qualifier attached, or its refusal reason. Never a bare number that
      // implies more certainty than the source supports.
      bits.push(ribbon.eta.available
        ? `ETA ${escapeMapHtml(ribbon.eta.label)} (${escapeMapHtml(ribbon.eta.reason)})`
        : `ETA — ${escapeMapHtml(ribbon.eta.reason)}`);
      bits.push(`${ribbon.totals.legsRemaining}/${ribbon.totals.legs} legs · ${Math.round(ribbon.totals.fuelRemaining)}F left · ${escapeMapHtml(ribbon.totals.chargeLabel)} align`);
      metaEl.innerHTML = bits.map((b) => `<span>${b}</span>`).join('');
    }

    if (actionsEl) {
      // THE ACTION ROW GETS ITS OWN, MUCH COARSER CHANGE KEY — and this is an accessibility fix,
      // not an optimisation.
      //
      // The ribbon key above deliberately includes the live distance and ETA, both of which change
      // on essentially every frame while the ship is making way. Rewriting `innerHTML` here on that
      // key would therefore rebuild these buttons every frame during transit, detaching whichever
      // one the player had focused — so a keyboard user could not operate Disengage at exactly the
      // moment they most need it, which is while a route is running.
      //
      // Availability depends only on status / engagement / interruption, so keying on those three
      // rebuilds the row when it actually changes and leaves the focused button alone otherwise.
      const actionKey = `${ribbon.status || '-'}#${ribbon.engaged}#${!!ribbon.interruption}`;
      if (this._lastRibbonActionKey !== actionKey) {
        this._lastRibbonActionKey = actionKey;
        actionsEl.innerHTML = RIBBON_ACTION_IDS.map((id) => {
          const a = ribbon.actions[id];
          if (!a) return '';
          return `<button class="gm-ribbon-btn" type="button" data-ribbon-action="${a.id}"
            ${a.available ? '' : 'tabindex="0"'} aria-disabled="${!a.available}"
            data-why="${escapeMapHtml(a.reason)}">${escapeMapHtml(a.label)}</button>`;
        }).join('');
      }
    }
    if (reasonEl) {
      // Surface the blocked explanation the player is most likely to be asking about.
      const blocked = RIBBON_ACTION_IDS.map((id) => ribbon.actions[id]).find((a) => a && !a.available && a.id === 'pause');
      reasonEl.textContent = ribbon.interruption
        ? `${ribbon.interruption.label} — the itinerary is kept; Resume picks it up on the same leg.`
        : (blocked ? blocked.reason : '');
    }
    return ribbon;
  },

  /**
   * Fire a ribbon action.
   *
   * Every path here goes through the SAME bus events the shipped engage control uses, so the
   * ribbon can never open a second mutation path into the route follower. An unavailable action
   * refuses and says why — it never fakes a success state.
   */
  _activateRibbonAction(id) {
    const state = this._ctx && this._ctx.state;
    const bus = this._ctx && this._ctx.bus;
    if (!state || !bus || !id) return false;
    const ribbon = this._ribbonModel(state);
    const action = ribbon.actions[id];
    if (!action || !action.available || !action.event) {
      if (HAS_DOC && this._root) {
        const reasonEl = this._root.querySelector('#gm-ribbon-reason');
        if (reasonEl && action) reasonEl.textContent = action.reason;
      }
      return false;
    }
    bus.emit(action.event, action.event === 'nav:abortRoute' ? { reason: 'manual' } : {});
    this._lastRibbonKey = null;
    this._updateEngageControl();
    this._updateRibbon(state);
    return true;
  },

  // ═══ SLICE C — left-rail contextual sections ═══════════════════════════════════════════════

  /** Missions, bookmarks and route alternatives. Rendered only when their section is OPEN — a
   *  collapsed section costs nothing, which is what makes disclosure cheap enough to default to. */
  _updateRailSections(state) {
    if (!HAS_DOC || !this._root || !state) return;
    const openOf = (name) => {
      const sec = this._root.querySelector(`[data-rail-sec="${name}"]`);
      return sec && sec.open ? sec : null;
    };

    const missions = ((state.missions && state.missions.active) || []).filter((m) => m && m.status === 'active');
    const trackedId = state.ui && state.ui.trackedMissionId;
    const countEl = this._root.querySelector('[data-mission-count]');
    if (countEl) countEl.textContent = missions.length ? String(missions.length) : '';
    const bmCountEl = this._root.querySelector('[data-bookmark-count]');
    if (bmCountEl) bmCountEl.textContent = this._bookmarks.length ? String(this._bookmarks.length) : '';
    const lensCountEl = this._root.querySelector('[data-lens-count]');
    if (lensCountEl) {
      const on = LAYER_DEFS.filter((l) => this._layers[l.id]).length;
      lensCountEl.textContent = `${on}/${LAYER_DEFS.length}`;
    }

    const missionsHost = openOf('missions') && this._root.querySelector('#gm-rail-missions');
    if (missionsHost) {
      const html = missions.length
        ? missions.map((m) => {
          const tracked = m.id === trackedId;
          const dest = m.destSectorId || (m.params && m.params.sectorId) || null;
          const destName = dest ? escapeMapHtml(sectorNameOf(state, dest)) : 'No fixed destination';
          return `<button class="gm-rail-item${tracked ? ' is-tracked' : ''}" type="button" data-rail-mission="${escapeMapHtml(m.id)}"${tracked ? ' aria-current="true"' : ''}>
            <span class="gm-rail-item-t">${tracked ? '<span class="gm-rail-track-g" aria-hidden="true">◆</span>' : ''}${escapeMapHtml(missionSummary(m))}</span>
            <span class="gm-rail-item-s">${destName}${tracked ? ' · tracked' : ''}</span>
          </button>`;
        }).join('')
        : '<div class="gm-ins-note">No active missions. Accept one at a station to see its destination on the chart.</div>';
      if (missionsHost.innerHTML !== html) missionsHost.innerHTML = html;
    }

    const bmHost = openOf('bookmarks') && this._root.querySelector('#gm-rail-bookmarks');
    if (bmHost) {
      const html = `${this._bookmarks.length
        ? this._bookmarks.map((b, i) => `<button class="gm-rail-item" type="button" data-rail-bookmark="${i}">
            <span class="gm-rail-item-t">${escapeMapHtml(b.label)}</span>
            <span class="gm-rail-item-s">${Math.round(b.focusGlobal.x)}, ${Math.round(b.focusGlobal.z)} · ${escapeMapHtml(formatDistanceWU(b.spanWU))} span</span>
          </button>`).join('')
        : '<div class="gm-ins-note">No bookmarks. Bookmark the current view to come back to it.</div>'}
        <button class="gm-ins-btn gm-rail-add" type="button" data-rail-bookmark-add>Bookmark this view</button>`;
      if (bmHost.innerHTML !== html) bmHost.innerHTML = html;
    }

    this._revealAlternatives(state);
    const altHost = openOf('alternatives') && this._root.querySelector('#gm-rail-alternatives');
    if (altHost) {
      const html = this._routeAlternativesHtml(state);
      if (altHost.innerHTML !== html) altHost.innerHTML = html;
    }
  },

  /**
   * Route alternatives — REAL, and free.
   *
   * `world.computeRoute` already takes a `mode` and already scores 'fuel' vs 'hops' differently.
   * The alternatives are therefore the same planner run under its other objective, not a second
   * route planner (ADR D6 forbids new steering/planning math). Where the two agree, that is worth
   * saying too: "cheapest is also shortest" is a real answer, not an empty state.
   */
  _routeAlternativesHtml(state) {
    const target = this._alternativesDestination(state);
    if (!target.dest) {
      return `<div class="gm-ins-note">${escapeMapHtml(target.reason)}</div>`;
    }
    const dest = target.dest;
    const route = state.nav && state.nav.route;
    const plottedLegs = route && Array.isArray(route.legs) ? route.legs : null;
    const world = this._ctx && this._ctx.registry && typeof this._ctx.registry.get === 'function'
      ? this._ctx.registry.get('world') : null;
    if (!world || typeof world.computeRoute !== 'function') {
      return '<div class="gm-ins-note">Route planner unavailable — alternatives cannot be compared right now.</div>';
    }
    const rows = [];
    const shapes = [];
    for (const [mode, label] of [['fuel', 'Cheapest'], ['hops', 'Fewest jumps']]) {
      let alt = null;
      try { alt = world.computeRoute(dest, mode); } catch { alt = null; }
      if (!alt || !Array.isArray(alt.legs) || !alt.legs.length) continue;
      const same = !!plottedLegs && alt.legs.length === plottedLegs.length
        && alt.legs.every((l, i) => l.to === plottedLegs[i].to);
      const worst = alt.legs.reduce((m, l) => Math.max(m, Number(l.interdict) || 0), 0);
      shapes.push(alt.legs.map((l) => l.to).join('>'));
      // `data-route-option` is the SEMANTIC hook: "this element is one weighable way of getting
      // there". `data-rail-alt` stays as the activation key. Each option states its own cost in
      // words — hops, fuel and worst-leg interdiction — so the comparison never rests on colour.
      rows.push(`<button class="gm-rail-item${same ? ' is-current' : ''}" type="button"
        data-rail-alt="${mode}" data-route-option="${mode}"
        data-route-hops="${alt.legs.length}" data-route-fuel="${Math.round(alt.totalFuel || 0)}">
        <span class="gm-rail-item-t">${label}${same ? ' <span class="gm-rail-item-tag">plotted</span>' : ''}</span>
        <span class="gm-rail-item-s">${alt.legs.length} hop${alt.legs.length === 1 ? '' : 's'} · ${Math.round(alt.totalFuel || 0)}F · worst leg ${Math.round(worst * 100)}% interdict · ETA by fuel burn</span>
      </button>`);
    }
    if (!rows.length) return '<div class="gm-ins-note">No alternative path to that sector through charted space.</div>';
    // When the two objectives agree, say so. "Cheapest is also shortest" is a real answer to
    // "which should I take" and is more useful than hiding one of them and implying a choice that
    // does not exist.
    if (shapes.length === 2 && shapes[0] === shapes[1]) {
      rows.push('<div class="gm-ins-note">Both objectives choose the same path here — cheapest is also shortest.</div>');
    }
    rows.push(`<div class="gm-ins-note">${escapeMapHtml(target.note)} Selecting an alternative re-plots the route. It does not engage it — plot and engage stay separate acts.</div>`);
    return rows.join('');
  },

  /**
   * Reveal the alternatives section exactly when there is something to compare, and take the
   * reveal back when there is not.
   *
   * This is progressive disclosure, not a new panel (ADR D9.9). A collapsed `<details>` whose body
   * is never built costs nothing, which is what makes it safe to open on its own — but an
   * instrument that reveals and then stays is a permanent panel with extra steps, so the auto-open
   * is undone once the destination goes away.
   *
   * It opens ONCE per destination and never re-opens a section the pilot has collapsed: a panel
   * that springs back open every frame is worse than one that never opens at all.
   */
  _revealAlternatives(state) {
    if (!HAS_DOC || !this._root) return;
    const sec = this._root.querySelector('[data-rail-sec="alternatives"]');
    if (!sec) return;
    const dest = this._alternativesDestination(state).dest;
    if (!dest) {
      // Only ever collapse a disclosure WE made — never one the pilot chose.
      if (this._altAutoOpened && sec.open) sec.open = false;
      this._altAutoOpened = false;
      this._altRevealedFor = null;
      return;
    }
    if (this._altRevealedFor === dest) return;
    this._altRevealedFor = dest;
    if (!sec.open) {
      sec.open = true;
      this._altAutoOpened = true;
    }
  },

  /**
   * WHICH destination the alternatives are comparing paths to.
   *
   * Originally this was the plotted route's terminal sector and nothing else, which put the
   * comparison strictly AFTER the commitment it was supposed to inform: to weigh two ways of
   * getting somewhere you first had to pick one. The order now matches how a pilot actually
   * decides — a contract's destination is known the moment it is accepted, so the alternatives to
   * it are available immediately and the plotted route, when there is one, simply outranks it.
   *
   * Precedence: plotted route → accepted contract → current chart selection.
   */
  _alternativesDestination(state) {
    const route = state.nav && state.nav.route;
    const plotted = route && Array.isArray(route.legs) && route.legs.length
      ? route.legs[route.legs.length - 1].to : null;
    if (plotted) {
      return { dest: plotted, source: 'route', reason: '', note: 'Comparing paths to your plotted destination.' };
    }
    const mission = resolveMissionDestination(state);
    const here = currentSectorId(state);
    if (mission && mission.sectorId && mission.sectorId !== here) {
      return {
        dest: mission.sectorId,
        source: 'mission',
        reason: '',
        note: `Comparing paths to ${sectorNameOf(state, mission.sectorId)}, your contract destination — nothing is plotted yet.`,
      };
    }
    const sel = this._selectedTarget;
    const selSector = sel ? (sel.kind === 'sector' ? (sel.sectorId || sel.id) : sel.sectorId) : null;
    if (selSector && selSector !== here) {
      return {
        dest: selSector,
        source: 'selection',
        reason: '',
        note: `Comparing paths to the selected ${sectorNameOf(state, selSector)}.`,
      };
    }
    return {
      dest: null,
      source: null,
      reason: 'Nothing to compare yet. Accept a contract or select a sector, and the ways of reaching it appear here.',
      note: '',
    };
  },

  /** Save the current camera as a named bookmark. Screen-owned, never written to sim state. */
  _addBookmark() {
    const state = this._ctx && this._ctx.state;
    const cam = this._cameraOrInit();
    if (!cam) return false;
    const level = this._activeLevel();
    const sid = state ? currentSectorId(state) : null;
    const label = `${level.toUpperCase()} · ${sid ? sectorNameOf(state, sid) : 'Chart'}`;
    this._bookmarks = this._bookmarks
      .filter((b) => !(Math.abs(b.focusGlobal.x - cam.focusGlobal.x) < 1
        && Math.abs(b.focusGlobal.z - cam.focusGlobal.z) < 1
        && Math.abs(b.spanWU - cam.spanWU) < 1))
      .concat([{ label, focusGlobal: { x: cam.focusGlobal.x, z: cam.focusGlobal.z }, spanWU: cam.spanWU }])
      .slice(-8);
    this._updateRailSections(state);
    return true;
  },

  _activateSelectedCourse() {
    if (!this._ctx || !this._ctx.bus) return;
    const action = resolveGalaxyMapPrimaryAction(this._ctx.state, this._selectedTarget);
    if (!action) return;
    if (!emitGalaxyMapPrimaryAction(this._ctx.bus, action)) return;
    // PLOT must not dismiss the chart (atlas W1-8 / ADR D6). Plot and Engage are two separate
    // acts, and Engage lives on this screen — so closing here made the pair impossible to perform
    // in one sitting: the pilot plotted, the chart vanished, and Engage was only reachable by
    // reopening the map. Measured by scripts/repro-engage-control-reachability.mjs: after a plot
    // the engage button had a 0x0 rect (a hidden ancestor, not a broken control), and on reopen
    // with the same route it read "2 legs plotted — ready to fly" and was enabled.
    //
    // A 'route' action is the plot-only one. Every other kind is a commitment the pilot makes to
    // leave the chart with — 'jump' commits the gate transition, and the station/gate/poi/local
    // kinds arm a waypoint to fly manually — so those still close, which is the behaviour that was
    // always right and is deliberately unchanged.
    if (action.kind === 'route') {
      this._updateEngageControl();
      this._updateRailSections(this._ctx.state);
      return;
    }
    popCurrentScreen(this._ctx);
  },

  /**
   * Plot the selected sector WITHOUT committing to it (ADR D6).
   *
   * Shares the shipped emitter with the primary action, so there is exactly one mutation path into
   * `nav.route` and the alternatives rail, the ribbon and the engage control all see the same
   * result. Like the primary's own route branch, it leaves the chart OPEN — a plot the pilot
   * cannot then act on without reopening the map is half an action.
   */
  _activatePlotOnlyCourse() {
    if (!this._ctx || !this._ctx.bus) return false;
    const state = this._ctx.state;
    const action = resolveGalaxyMapPlotAction(state, this._selectedTarget);
    // Refuse out loud. A disabled button should never reach here, but a keyboard or scripted
    // activation can, and a silent no-op is the failure mode this screen's contract forbids.
    if (!action.available) {
      if (this._plotReason) this._plotReason.textContent = action.reason;
      return false;
    }
    if (!emitGalaxyMapPrimaryAction(this._ctx.bus, action)) return false;
    this._updateEngageControl();
    this._updatePlotControl();
    this._updateRailSections(state);
    return true;
  },

  /**
   * Reflect the secondary plot control's availability.
   *
   * It is hidden in the ordinary case — nothing selected, or the primary already offers the plot —
   * and reveals only where plot-without-commit would otherwise be impossible. That is progressive
   * disclosure rather than a new permanent panel (ADR D9.9): the control appears exactly when its
   * action becomes unreachable by any other means, and goes away again.
   */
  _updatePlotControl() {
    if (!HAS_DOC || !this._root) return;
    const btn = this._plotButton || this._root.querySelector('#gm-plot-course-btn');
    const reasonEl = this._plotReason || this._root.querySelector('#gm-plot-reason');
    if (!btn) return;
    const state = this._ctx && this._ctx.state;
    const target = this._selectedTarget;
    const action = resolveGalaxyMapPlotAction(state, target);
    // Show it only where the primary commits. When the primary IS the plot, a second identical
    // button would be clutter — the exact density failure D9.9 is about.
    const show = !!target && action.available && !action.redundant;
    if (btn.hidden !== !show) btn.hidden = !show;
    if (btn.disabled !== !action.available) btn.disabled = !action.available;
    if (btn.getAttribute('aria-disabled') !== String(!action.available)) {
      btn.setAttribute('aria-disabled', String(!action.available));
    }
    if (btn.textContent !== action.label) btn.textContent = action.label;
    if (btn.getAttribute('title') !== action.reason) btn.setAttribute('title', action.reason);
    if (reasonEl) {
      const text = show ? action.reason : '';
      if (reasonEl.textContent !== text) reasonEl.textContent = text;
    }
  },

  // W1-8. Engage hands the already-plotted route to the route follower. Deliberately does NOT
  // close the map: plotting and engaging are separate acts, and a pilot who just engaged usually
  // wants to watch the first leg acquire before leaving the chart.
  _activateRouteEngage() {
    if (!this._ctx || !this._ctx.bus) return;
    const action = resolveRouteEngageAction(this._ctx.state);
    if (!emitRouteEngageAction(this._ctx.bus, action)) return;
    this._updateEngageControl();
  },

  // Reflect real executor state onto the control. Everything shown here is read from
  // `nav.executor`, which the route follower owns — the map never invents a status, and an
  // unavailable action always carries its reason (no silent no-ops, no fake success).
  _updateEngageControl() {
    if (!HAS_DOC || !this._root) return;
    const btn = this._engageButton || this._root.querySelector('#gm-engage-route-btn');
    const reasonEl = this._engageReason || this._root.querySelector('#gm-engage-reason');
    if (!btn) return;
    const action = resolveRouteEngageAction(this._ctx && this._ctx.state);
    if (btn.hidden !== !action.visible) btn.hidden = !action.visible;
    if (btn.disabled !== !action.enabled) btn.disabled = !action.enabled;
    if (btn.textContent !== action.label) btn.textContent = action.label;
    // Non-colour semantics: the state is carried by the label and the reason text, not by hue.
    if (btn.getAttribute('data-engage-state') !== (action.event || 'none')) {
      btn.setAttribute('data-engage-state', action.event || 'none');
    }
    if (reasonEl && reasonEl.textContent !== action.reason) reasonEl.textContent = action.reason;
    if (btn.getAttribute('aria-disabled') !== String(!action.enabled)) {
      btn.setAttribute('aria-disabled', String(!action.enabled));
    }
  },

  /**
   * Reflect the two framing controls' availability into the DOM.
   *
   * The reason string is rendered whether the action is available or not: when it is unavailable it
   * explains the blocker, and when it is available it says what the button will do. A control that
   * only speaks when it is broken teaches the pilot to ignore the line.
   */
  _syncFramingControls(navContext) {
    if (!HAS_DOC) return;
    const actions = resolveMapFramingActions(navContext);
    this._lastFramingActions = actions;
    const pairs = [
      [this._returnShipButton, actions.returnToShip],
      [this._frameBothButton, actions.frameShipAndDestination],
    ];
    let reason = '';
    for (const [btn, action] of pairs) {
      if (!btn) continue;
      const disabled = !action.available;
      if (btn.disabled !== disabled) btn.disabled = disabled;
      if (btn.getAttribute('aria-disabled') !== String(disabled)) {
        btn.setAttribute('aria-disabled', String(disabled));
      }
      // The reason travels on the control itself as well as in the live region, so a pointer user
      // who never focuses the button still gets the explanation.
      if (btn.getAttribute('title') !== action.reason) btn.setAttribute('title', action.reason);
      if (btn.textContent !== action.label) btn.textContent = action.label;
      // Surface the blocked one first: an explanation of what you cannot do outranks a description
      // of what you can.
      if (!action.available && !reason) reason = action.reason;
    }
    if (!reason) {
      reason = actions.frameShipAndDestination.available
        ? actions.frameShipAndDestination.reason
        : actions.returnToShip.reason;
    }
    if (this._frameReason && this._frameReason.textContent !== reason) {
      this._frameReason.textContent = reason;
    }
  },

  /**
   * Apply a framing descriptor ({focusGlobal, spanWU}) to the chart.
   *
   * THE CAMERA SEAM. Every "take me somewhere" control in this screen goes through this one method,
   * so Slice B can replace its internals with the unified camera without touching a single caller.
   * Today it translates the GLOBAL descriptor into whichever legacy per-level camera frame the
   * target level uses; that translation is the thing Slice B deletes, not the callers.
   */
  _setCameraFraming(framing, { draw = true } = {}) {
    if (!framing || !framing.focusGlobal) return false;
    const focus = framing.focusGlobal;
    if (!Number.isFinite(focus.x) || !Number.isFinite(focus.z)) return false;
    const spanWU = Number.isFinite(framing.spanWU) ? framing.spanWU : MAP_PRESET_SPAN_WU.system;

    this._camera = setSpan(setFocus(this._cameraOrInit(), focus), spanWU);
    this._syncLegacyFromCamera();
    if (draw && HAS_DOC && this._canvas) this._draw();
    return true;
  },

  _activateFraming(id) {
    const state = this._ctx && this._ctx.state;
    if (!state || !id) return false;
    const actions = this._lastFramingActions || resolveMapFramingActions(this._navContext(state));
    const action = id === 'return-to-ship' ? actions.returnToShip : actions.frameShipAndDestination;
    // A disabled button should never reach here, but a keyboard or scripted activation can. Refuse
    // loudly-but-politely rather than silently doing nothing or faking a success.
    if (!action || !action.available || !action.framing) {
      if (this._frameReason && action) this._frameReason.textContent = action.reason;
      return false;
    }
    this._setCameraFraming(action.framing);
    const w = this._canvas ? this._canvas.width / this._dpr : 0;
    const h = this._canvas ? this._canvas.height / this._dpr : 0;
    if (w && h) this.triggerScanRing(w / 2, h / 2, INK.brass);
    return true;
  },

  // A trade-lane row resolves its destination station through the same course intents as any
  // other map mark — the strategy deck never opens a parallel mutation path.
  _activateTradeLane(stationId) {
    if (!this._ctx || !this._ctx.bus || !stationId) return;
    const target = tradeLaneTarget(this._ctx.state, stationId);
    if (!target) return;
    const action = resolveGalaxyMapPrimaryAction(this._ctx.state, target);
    if (!action) return;
    if (!emitGalaxyMapPrimaryAction(this._ctx.bus, action)) return;
    popCurrentScreen(this._ctx);
  },

  _selectSearchTarget(target) {
    const state = this._ctx && this._ctx.state;
    if (!state) return;

    this._selectedTarget = target;

    // Selecting a search result frames the result. The camera is driven in the GLOBAL frame in every
    // branch — which is what makes "search, then zoom out, then zoom back in" land on the same
    // object instead of on whatever each level's private camera last remembered.
    if (target.kind === 'sector') {
      // A galaxy node carries GRAPH coordinates (`target.x`/`target.y`), not world units. The
      // sector's authored origin is its global position; deriving it from the id rather than
      // multiplying the graph coordinate keeps one authority for sector origins.
      const origin = sectorGlobalOrigin(target.sectorId || target.id);
      this._camera = setSpan(
        setFocus(this._cameraOrInit(), { x: origin.x, z: origin.z }),
        spanForZoom(LEVEL_SYSTEM_AT - 0.5), // galaxy scale
      );
      // The legacy galaxy camera is in graph units; keep centring it on the picked NODE so a sector
      // whose authored graph position and lattice origin ever disagreed still frames the node.
      this._syncLegacyFromCamera();
      this._cams.galaxy.cx = target.x;
      this._cams.galaxy.cy = target.y;
    } else if (target.kind === 'station' || target.kind === 'gate' || target.kind === 'poi' || target.kind === 'zone' || target.kind === 'rumor') {
      // The SYSTEM camera lives in the sector-local draw frame, but a search target carries the
      // GLOBAL nav frame so the same object can arm a course. Centering on the raw nav position
      // parks the camera a whole sector origin away from the thing you just picked.
      const focus = target.drawPos
        || globalToSectorLocalForSector(target, target.sectorId || currentSectorId(state));
      const sid = target.sectorId || currentSectorId(state);
      const globalFocus = sectorLocalToGlobalForSector({ x: focus.x, z: focus.z }, sid);
      this._camera = setSpan(
        setFocus(this._cameraOrInit(), globalFocus),
        spanForZoom(LEVEL_SYSTEM_AT + 0.5), // system scale
      );
      this._syncLegacyFromCamera();
    } else {
      this._zoom = LEVEL_LOCAL_AT + 0.5; // local scale
      this._targetZoom = this._zoom;
      const cam = this._cams.local;
      cam.cx = target.x;
      cam.cy = target.z;
      // LOCAL is unmigrated, but the camera must not be left stale behind it, or the next zoom-out
      // would leave the object the player just searched for.
      this._camera = setSpan(
        setFocus(this._cameraOrInit(), { x: target.x, z: target.z }),
        spanForZoom(this._zoom),
      );
    }

    this.refresh();

    // Selection refresh can replace the activated Discovery/search row. Keep focus in the map:
    // navigable targets move to their visible primary action; manual/read-only targets return to
    // the persistent dialog root so M/N/Escape and the screen-manager focus trap still work.
    const action = resolveGalaxyMapPrimaryAction(state, target);
    const primary = this._setCourseButton || (this._root && this._root.querySelector('#gm-set-course-btn'));
    focusMapSelectionHandoff({ action, primaryControl: primary, mapRoot: this._root });

    // Trigger ring at target center
    const w = this._canvas.width / this._dpr;
    const h = this._canvas.height / this._dpr;
    this.triggerScanRing(w / 2, h / 2, INK.amberHot);
  },

  _onMouseDown(ev) {
    if (ev.button !== 0) return;
    const level = this._activeLevel();
    const cam = this._cams[level];
    this._dragging = true;
    this._dragStart = {
      mx: ev.clientX,
      my: ev.clientY,
      cx: cam.cx,
      cy: cam.cy,
      // Frozen cameras make this safe: the drag anchor is a value, not a reference that later
      // camera moves could mutate underneath the drag.
      camera: level !== 'local' ? this._cameraOrInit() : null,
    };
  },

  _onMouseMove(ev) {
    const level = this._activeLevel();
    const cam = this._cams[level];
    const rect = this._canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;

    if (this._dragging && this._dragStart) {
      const dx = ev.clientX - this._dragStart.mx;
      const dy = ev.clientY - this._dragStart.my;

      if (level !== 'local' && this._dragStart.camera) {
        // SLICE B — pan the unified camera in the GLOBAL frame. Dragging right must move the chart
        // right, i.e. the camera moves LEFT, hence the negated delta. Panning from the drag START
        // camera rather than accumulating per-move keeps the grab point exactly under the cursor
        // instead of drifting over a long drag.
        const pxPerWU = pixelsPerWU(this._dragStart.camera, { width: rect.width, height: rect.height });
        if (pxPerWU > 0) {
          this._camera = panBy(this._dragStart.camera, { x: -dx / pxPerWU, z: -dy / pxPerWU });
          this._syncLegacyFromCamera();
          this._draw();
          this._wake();
          return;
        }
      }

      // LOCAL keeps the legacy pan (flipped-sign scope frame, unmigrated).
      const baseScale = this._view ? this._view.baseScale : 1;
      cam.cx = this._dragStart.cx + dx / (baseScale * this._zoom);
      cam.cy = this._dragStart.cy + dy / (baseScale * this._zoom);
      this._draw();
      this._wake();
      return;
    }

    // Hover hit test
    const best = pickMapTargetAt(this._clickTargets, mx, my);
    if (best !== this._hoverTarget) {
      this._hoverTarget = best;
      this._draw();
      this._wake();
    }
    this._canvas.style.cursor = best ? 'pointer' : 'crosshair';
  },

  _onMouseUp() {
    this._dragging = false;
    this._dragStart = null;
  },

  _onMouseLeave() {
    this._dragging = false;
    this._dragStart = null;
    this._hoverTarget = null;
    this._draw();
    this._wake();
  },

  _onWheel(ev) {
    ev.preventDefault();
    const rect = this._canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const w = rect.width, h = rect.height;
    const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;

    // SLICE B — cursor-anchored zoom through the unified camera, on the migrated levels.
    //
    // This also repairs a defect the migration exposed rather than introduced: `cam.zoom` was
    // initialised to 1.0/1.5/1.5 and then NEVER ASSIGNED anywhere in this file, while the draw sites
    // scaled by `baseScale * cam.zoom`. So wheeling INSIDE a level changed `this._zoom` (and hence
    // which level would be chosen) but could not change the drawn scale at all — and the pan
    // compensation below still ran, so a wheel that produced no zoom silently PANNED the chart
    // sideways. Zoom now moves the camera's span, which the draw sites actually read.
    const level = this._activeLevel();
    if (level !== 'local') {
      const camera = this._cameraOrInit();
      const viewport = { width: w, height: h };
      const oldLevel = cameraLevel(camera);
      // The world point under the cursor, in the actionable frame. The module guarantees it stays
      // under the cursor across the zoom, including when the span clamps at a stop.
      const cursorGlobal = screenToGlobal(camera, { x: mx, y: my }, viewport);
      this._camera = zoomAt(camera, cursorGlobal, factor);
      const newLevel = cameraLevel(this._camera);
      this._syncLegacyFromCamera();
      // Crossing a threshold preserves focusGlobal by construction, so the iris is now marking a
      // change of DETAIL, not a change of place — which is the whole point of ADR D3.
      if (oldLevel !== newLevel) this._triggerIris(newLevel);
      this._draw();
      this._wake();
      return;
    }

    // LOCAL is deliberately still on the legacy path (ADR D3 orders local last; it carries the
    // remembered/dead-reckoned contact memory and a flipped-sign scope frame). Unchanged behaviour.
    const oldZoom = this._zoom;
    const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._zoom * factor));
    const oldLevel = levelForZoom(oldZoom);
    const newLevel = levelForZoom(nextZoom);

    this._zoom = nextZoom;
    this._targetZoom = nextZoom;
    this._syncScaleButtons();

    if (oldLevel === newLevel) {
      const cam = this._cams[newLevel];
      const baseScale = this._view ? this._view.baseScale : 1;
      const sign = -1;
      const wx = cam.cx + sign * (mx - w/2) / (baseScale * oldZoom);
      const wy = cam.cy + sign * (my - h/2) / (baseScale * oldZoom);

      cam.cx = wx - sign * (mx - w/2) / (baseScale * nextZoom);
      cam.cy = wy - sign * (my - h/2) / (baseScale * nextZoom);
    } else {
      // Threshold crossing reads as passing through a membrane, not a hard clip.
      this._triggerIris(newLevel);
      // Leaving LOCAL hands control to the camera, so the camera must adopt where LOCAL actually
      // was. Without this the first zoom out of LOCAL would jump to wherever the camera was last
      // left — the "abruptly switching maps" behaviour this wave exists to remove.
      this._camera = setSpan(
        setFocus(this._cameraOrInit(), { x: this._cams.local.cx, z: this._cams.local.cy }),
        spanForZoom(nextZoom),
      );
      this._syncLegacyFromCamera();
    }

    this._draw();
    this._wake();
  },

  _onCanvasClick(ev) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;

    const best = pickMapTargetAt(this._clickTargets, mx, my);

    if (best) {
      this._selectedTarget = best;
      this.triggerScanRing(best.sx, best.sy, INK.amberHot);
    } else {
      this._selectedTarget = null;
    }
    this.refresh();
  },

  _onCanvasDblClick(ev) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;

    const best = pickMapTargetAt(this._clickTargets, mx, my);

    if (best) {
      const payload = resolveCourseTarget(best);
      if (payload) {
        if (payload.type === 'sector' && payload.sectorId) {
          this._ctx.bus.emit('world:requestRoute', { targetSectorId: payload.sectorId, mode: 'fuel' });
        }
        this._ctx.bus.emit('ui:setCourse', payload);
        this._ctx.bus.emit('toast', { text: 'Course set: ' + (payload.label || 'target'), kind: 'info', ttl: 3 });
        popCurrentScreen(this._ctx);
      }
    }
  },

  _resize() {
    if (!HAS_DOC || !this._body || !this._canvas) return;
    const viewportW = Number(this._root && this._root.clientWidth)
      || (typeof window !== 'undefined' && Number(window.innerWidth))
      || this._body.clientWidth;
    const viewportH = Number(this._root && this._root.clientHeight)
      || (typeof window !== 'undefined' && Number(window.innerHeight))
      || this._body.clientHeight;
    this._applyResponsiveLayout(viewportW, viewportH);
    const w = this._body.clientWidth, h = this._body.clientHeight;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const cw = Math.max(2, Math.floor(w * dpr));
    const ch = Math.max(2, Math.floor(h * dpr));
    if (cw === this._lastCw && ch === this._lastCh) return;
    this._dpr = dpr; this._lastCw = cw; this._lastCh = ch;
    this._canvas.width = cw; this._canvas.height = ch;
    if (this._g) this._g.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  /**
   * Paint the static table: worklight falloff, survey graticule, corner registration.
   *
   * Cached to an offscreen canvas keyed by viewport size and invalidated only when that size
   * changes. Falls back to drawing straight onto the target when no document is available (the
   * headless model tests) so the pure-render path never depends on a DOM.
   */
  _paintGround(target, w, h) {
    const key = `${Math.round(w)}x${Math.round(h)}`;
    if (HAS_DOC && this._groundTile && this._groundKey === key) {
      target.drawImage(this._groundTile, 0, 0, w, h);
      return;
    }
    let g = target;
    let tile = null;
    if (HAS_DOC && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      const dpr = this._dpr || 1;
      tile = document.createElement('canvas');
      tile.width = Math.max(1, Math.round(w * dpr));
      tile.height = Math.max(1, Math.round(h * dpr));
      const tg = tile.getContext('2d');
      if (tg) { tg.setTransform(dpr, 0, 0, dpr, 0, 0); g = tg; } else { tile = null; g = target; }
    }

    // Worklight: a plotting table is lit from a lamp over its middle, so the ground is not one flat
    // value — it falls off toward the edges. This is what makes marks read as objects sitting ON a
    // surface instead of shapes floating in a void.
    const cx0 = w / 2, cy0 = h / 2;
    const lamp = g.createRadialGradient(cx0, cy0 * 0.92, Math.min(w, h) * 0.05, cx0, cy0, Math.max(w, h) * 0.62);
    lamp.addColorStop(0, 'rgba(232, 163, 61, 0.050)');
    lamp.addColorStop(0.55, 'rgba(232, 163, 61, 0.016)');
    lamp.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = lamp;
    g.fillRect(0, 0, w, h);

    // Survey-table graticule: warm hairlines, a heavier rule every fifth line.
    const grid = 50;
    g.lineWidth = 1;
    for (let gx = 0; gx < w; gx += grid) {
      g.strokeStyle = (gx % (grid * 5) === 0) ? INK.gridMajor : INK.gridMinor;
      g.beginPath(); g.moveTo(gx + 0.5, 0); g.lineTo(gx + 0.5, h); g.stroke();
    }
    for (let gy = 0; gy < h; gy += grid) {
      g.strokeStyle = (gy % (grid * 5) === 0) ? INK.gridMajor : INK.gridMinor;
      g.beginPath(); g.moveTo(0, gy + 0.5); g.lineTo(w, gy + 0.5); g.stroke();
    }

    // Corner registration marks — drafting-table framing, not a viewport frame.
    g.strokeStyle = 'rgba(190, 178, 152, 0.32)';
    g.lineWidth = 1;
    const markInset = 10;
    const markLen = 13;
    for (const [cx, cy, dx, dy] of [
      [markInset, markInset, 1, 1],
      [w - markInset, markInset, -1, 1],
      [markInset, h - markInset, 1, -1],
      [w - markInset, h - markInset, -1, -1],
    ]) {
      g.beginPath();
      g.moveTo(cx + dx * markLen, cy);
      g.lineTo(cx, cy);
      g.lineTo(cx, cy + dy * markLen);
      g.stroke();
    }

    if (tile) {
      this._groundTile = tile;
      this._groundKey = key;
      target.drawImage(tile, 0, 0, w, h);
    }
  },

  _draw() {
    const g = this._g;
    if (!g || !this._canvas) return;
    const state = this._ctx && this._ctx.state;
    const w = this._canvas.width / this._dpr, h = this._canvas.height / this._dpr;
    g.clearRect(0, 0, w, h);
    g.fillStyle = INK.bg; g.fillRect(0, 0, w, h);
    this._clickTargets.length = 0;
    if (!state) return;

    // The table itself — worklight, graticule and registration marks — is a pure function of the
    // viewport, so it is rendered once to an offscreen tile and blitted thereafter. This matters:
    // `_draw` is the SHARED path and at LOCAL it runs at display refresh, not the 64 ms cadence, so
    // the alternative is recomputing a full-canvas radial gradient plus ~40 stroke calls every
    // frame — on a machine that may be running a software renderer.
    this._paintGround(g, w, h);

    const level = levelForZoom(this._zoom);

    // Update search placeholder to match the active scale.
    const searchInput = this._root && this._root.querySelector('.gm-search-input');
    if (searchInput) {
      const placeholder = level === 'local' ? 'Search local space… (Press /)' : level === 'system' ? 'Search system… (Press /)' : 'Search galaxy… (Press /)';
      if (searchInput.placeholder !== placeholder) searchInput.placeholder = placeholder;
    }

    if (this._levelEl) this._levelEl.textContent = level.toUpperCase();

    const scaleEl = this._root.querySelector('[data-level]');
    if (scaleEl) scaleEl.textContent = level.toUpperCase();

    // Contact memory accrues whenever the chart is reading the near field, not only while LOCAL
    // happens to be the level on screen — otherwise zooming out for a moment silently resets what
    // the scope remembers. GALAXY is excluded: at that scale nothing is reading local contacts.
    if (level !== 'galaxy') this._syncLocalIntel(state);

    // Resolved BEFORE the level dispatch so each level can reserve the cartouche's rectangle in the
    // label solver, and drawn AFTER it so nothing paints over the readout. Both halves matter: the
    // reservation is what keeps a sector label from being placed under the plate in the first place,
    // and it needs the row count before any label is laid out.
    const navContext = this._navContext(state);
    this._lastNavContext = navContext;

    if (level === 'galaxy') this._drawGalaxy(g, state, w, h);
    else if (level === 'system') this._drawSystem(g, state, w, h);
    else this._drawLocal(g, state, w, h);

    // THE NAVIGATION CARTOUCHE — drawn on the SHARED path, after the level, so the four answers are
    // present at every scale by construction. Putting it inside the three level draws would let a
    // future edit to any one of them silently drop the readout at that scale, which is exactly the
    // "answered at LOCAL and SYSTEM but not GALAXY" gap this replaces.
    drawNavCartouche(g, navContext.rows, w, h, { title: level.toUpperCase() });
    this._syncFramingControls(navContext);

    // SLICE C: the ribbon rides the shared draw path for the same reason the cartouche does — so
    // it cannot silently stop tracking the executor at one scale. It is internally change-keyed,
    // so being called every frame does not mean re-rendering every frame.
    this._updateRibbon(state);
    this._updateRailSections(state);
    this._updateHeaderWeather(state);
    this._updateCargoDeck(state);

    // Hover pre-selection. Resolved against THIS frame's click targets rather than the coordinates
    // captured when the pointer last moved, so the ring cannot lag a pan or a zoom by a frame.
    // Selection keeps the solid white keyline; hover is deliberately quieter and dashed — it says
    // "this is what you would get", not "this is chosen".
    if (this._hoverTarget) {
      const hoverId = this._hoverTarget.id;
      const selectedId = this._selectedTarget ? this._selectedTarget.id : null;
      if (hoverId != null && hoverId !== selectedId) {
        for (const target of this._clickTargets) {
          if (!target || target.id !== hoverId) continue;
          g.save();
          g.strokeStyle = 'rgba(237, 232, 216, 0.40)';
          g.lineWidth = 1;
          g.setLineDash([2.5, 3]);
          g.beginPath();
          g.arc(target.sx, target.sy, (target.radiusPx || 14) + 3, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
          g.restore();
          break;
        }
      }
    }

    // Draw active scan rings
    for (const ring of this._scanRings || []) {
      g.save();
      g.strokeStyle = hexToRgba(ring.color, 1 - ring.t / ring.maxT);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }

    // Level-transition iris: a double hairline ring and the scale name, gone in under half a
    // second, so threshold crossings read as travel through one continuous instrument.
    if (this._iris) {
      const iris = this._iris;
      const p = Math.max(0, Math.min(1, iris.t / iris.maxT));
      const alpha = 1 - p;
      const radius = Math.min(w, h) * (0.07 + p * 0.55);
      g.save();
      g.globalAlpha = alpha;
      g.strokeStyle = INK.amberHot;
      g.lineWidth = 1.6;
      g.beginPath(); g.arc(w / 2, h / 2, radius, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = INK.ink0;
      g.lineWidth = 0.8;
      g.beginPath(); g.arc(w / 2, h / 2, radius * 0.92, 0, Math.PI * 2); g.stroke();
      if (p < 0.72) {
        g.font = FONT_DISPLAY(600, 22);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = INK.ink0;
        g.fillText(iris.label, w / 2, h / 2);
        g.font = FONT_MONO(500, 9);
        g.fillStyle = INK.ink2;
        g.fillText('SCALE TRANSIT', w / 2, h / 2 + 20);
      }
      g.restore();
    }
  },

  // --- GALAXY DRAW ---
  _drawGalaxy(g, state, w, h) {
    const model = buildGalaxyModel(state);
    const visiblePresence = visibleGalaxyPresence(model, this._layers.faction);
    setMapCanvasAriaLabel(this._canvas, 'galaxy', visiblePresence, {
      chartedCount: model.nodes.filter((node) => node.charted).length,
    });
    if (!model.nodes.length) return;

    // SLICE B — GALAXY is the first builder migrated onto the unified camera (ADR D3 step 3, which
    // prescribes galaxy → system → local because galaxy is nearly global already).
    //
    // What changed: scale and centre no longer come from a per-level auto-fit plus a frozen
    // `cam.zoom`. They come from ONE camera state shared with every other level, so crossing a scale
    // threshold preserves `focusGlobal` and reads as zooming rather than as switching maps.
    //
    // What did NOT change: the projection ARITHMETIC, or the graph frame the nodes live in.
    // `node.x`/`node.y` remain authored graph units and are still what `sx`/`sy` consume — the
    // camera simply supplies the centre and the scale, converted into graph units once, here.
    // (Verified numerically against the legacy expression before this edit: identical to 1e-6, in
    // Tethys, including orientation — see the packet report.)
    const camera = this._cameraOrInit();
    const viewport = { width: w, height: h };
    // Pixels per GRAPH unit. `pixelsPerWU` is per WORLD unit and one graph unit is one lattice cell,
    // so the lattice quantum is the conversion — the same one buildGalaxyModel uses for the player.
    const graphScale = pixelsPerWU(camera, viewport) * SECTOR_ORIGIN_LATTICE_WU;
    const cam = this._cams.galaxy;

    this._view = { level: 'galaxy', baseScale: graphScale, pxPerWU: pixelsPerWU(camera, viewport), camera };
    const sx = (x) => w / 2 + (x - cam.cx) * graphScale;
    const sy = (y) => h / 2 + (y - cam.cy) * graphScale;
    const nodeById = new Map(model.nodes.map((n) => [n.id, n]));

    // Sector-graph edges: warm hairlines for charted lanes, faint dashes at the frontier.
    // Lanes. A charted lane is engraved rather than merely drawn: a wide soft rule with a dark
    // score cut down its middle, which reads as a channel incised into the table instead of a wire
    // laid across it. Uncharted links stay a single faint dash — rumour has no groove.
    for (const e of model.edges) {
      if (!this._layers.discovery && !e.charted) continue;
      const ax = sx(e.ax), ay = sy(e.ay), bx = sx(e.bx), by = sy(e.by);
      if (e.charted) {
        g.save();
        g.strokeStyle = 'rgba(216, 190, 150, 0.155)';
        g.lineWidth = 2.8;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        g.strokeStyle = 'rgba(10, 12, 13, 0.92)';
        g.lineWidth = 1.15;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        g.restore();
      } else {
        g.save();
        g.strokeStyle = 'rgba(142, 134, 117, 0.09)';
        g.lineWidth = 0.8;
        g.setLineDash([4, 6]);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        g.setLineDash([]);
        g.restore();
      }
    }

    // Route beam: amber marching dashes with a traveling bead, timed by the screen's own clock.
    const route = state.nav && state.nav.route;
    const routeDest = route && route.legs && route.legs.length ? route.legs[route.legs.length - 1].to : null;
    if (routeDest !== this._lastRouteDest) {
      this._lastRouteDest = routeDest;
      this._routeAnimTime = 1500;
    }

    if (route && route.legs && this._layers.route) {
      const pts = [];
      for (const leg of route.legs) {
        const fromNode = nodeById.get(leg.from);
        const toNode = nodeById.get(leg.to);
        if (!fromNode || !toNode) continue;
        if (!pts.length) pts.push({ x: sx(fromNode.x), y: sy(fromNode.y) });
        pts.push({ x: sx(toNode.x), y: sy(toNode.y) });
      }
      if (pts.length > 1) {
        g.save();
        g.strokeStyle = INK.amber;
        g.lineWidth = 2.4;
        g.setLineDash([10, 7]);
        g.lineDashOffset = -((this._animT * 42) % 17);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i].x, pts[i].y);
        g.stroke();
        g.setLineDash([]);

        // Traveling bead along the polyline.
        let total = 0;
        const segLens = [];
        for (let i = 1; i < pts.length; i += 1) {
          const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
          segLens.push(len);
          total += len;
        }
        if (total > 0) {
          let run = ((this._animT * 0.22) % 1) * total;
          let bi = 0;
          while (bi < segLens.length - 1 && run > segLens[bi]) { run -= segLens[bi]; bi += 1; }
          const segLen = segLens[bi] || 1;
          const bt = run / segLen;
          const bx = pts[bi].x + (pts[bi + 1].x - pts[bi].x) * bt;
          const by = pts[bi].y + (pts[bi + 1].y - pts[bi].y) * bt;
          g.fillStyle = INK.amberHot;
          g.beginPath(); g.arc(bx, by, 3, 0, Math.PI * 2); g.fill();
          g.strokeStyle = hexToRgba(INK.amberHot, 0.35);
          g.lineWidth = 1;
          g.beginPath(); g.arc(bx, by, 6, 0, Math.PI * 2); g.stroke();
        }
        g.restore();
      }
    }

    // Draw hover preview route
    if (this._layers.route && this._hoverTarget && this._hoverTarget.kind === 'sector') {
      const startSector = currentSectorId(state);
      const endSector = this._hoverTarget.id;
      if (startSector && endSector && startSector !== endSector) {
        const previewPath = computePreviewRoute(state, startSector, endSector);
        if (previewPath) {
          g.save();
          g.strokeStyle = 'rgba(237, 232, 216, 0.6)';
          g.lineWidth = 1.6;
          g.setLineDash([4, 4]);
          g.beginPath();
          let first = true;
          for (const sid of previewPath) {
            const node = nodeById.get(sid);
            if (node) {
              if (first) { g.moveTo(sx(node.x), sy(node.y)); first = false; }
              else g.lineTo(sx(node.x), sy(node.y));
            }
          }
          g.stroke();
          g.restore();
        }
      }
    }

    // Trade-flow beads (market layer): seeded beads ride each edge from surplus toward scarcity.
    if (this._layers.market) {
      for (const e of model.edges) {
        if (!e.charted) continue;
        const sa = sectorSignalFor(state, e.from);
        const sb = sectorSignalFor(state, e.to);
        if (!sa || !sb) continue;
        const gradient = sb.pricePressure - sa.pricePressure;
        if (Math.abs(gradient) < 0.03) continue;
        const a = nodeById.get(e.from);
        const b = nodeById.get(e.to);
        if (!a || !b) continue;
        const ax = sx(a.x), ay = sy(a.y), bx = sx(b.x), by = sy(b.y);
        const from = gradient > 0 ? { x: ax, y: ay } : { x: bx, y: by };
        const to = gradient > 0 ? { x: bx, y: by } : { x: ax, y: ay };
        const color = pressureColor(gradient);
        const phase = cosmeticHash01(e.from + '|' + e.to);
        // Speed, bead count and bead size all scale with the gradient. Previously every lane ran
        // exactly two beads at near-identical speed, so the market layer showed *where* flow
        // existed but never *how hard* it was pushing — the one thing the layer is for.
        const strength = Math.min(1, Math.abs(gradient) / 0.35);
        const speed = 0.07 + strength * 0.13;
        const beads = 1 + Math.round(strength * 2);
        const reduced = this._reduceMotion;
        g.save();
        for (let k = 0; k < beads; k += 1) {
          const t = reduced ? (phase + k / beads) % 1 : (this._animT * speed + phase + k / beads) % 1;
          const eased = 0.14 + t * 0.72; // keep beads on the lane, off the nodes
          // Fade in at the tail and out at the head. Without this the bead blinked into existence
          // at a fixed point on the lane and blinked out at another, which reads as a rendering
          // stutter rather than as flow.
          // Under reduced motion the bead is frozen, so the travel envelope would permanently mute
          // any lane whose seed happened to land near an end of the track. A static bead should be
          // fully visible — it is the only thing left saying the lane carries flow.
          const envelope = reduced ? 1 : Math.min(1, Math.min(t, 1 - t) / 0.14);
          const px = from.x + (to.x - from.x) * eased;
          const py = from.y + (to.y - from.y) * eased;
          const trailT = Math.max(0.14, eased - 0.045);
          g.strokeStyle = hexToRgba(color, 0.26 * envelope);
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(from.x + (to.x - from.x) * trailT, from.y + (to.y - from.y) * trailT);
          g.lineTo(px, py);
          g.stroke();
          g.fillStyle = hexToRgba(color, 0.82 * envelope);
          g.beginPath(); g.arc(px, py, 1.7 + strength * 0.6, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      }
    }

    // Draw Nodes
    const labelCandidates = [];
    for (const n of model.nodes) {
      const x = sx(n.x), y = sy(n.y);
      const r = 13;
      const stale = n.confidence === 'stale';

      // R1 read knowledge: a rumor marks the sector without disclosing a world-space point.
      // This rides the existing DISCOVERY layer instead of inventing another map toggle.
      if (this._layers.discovery && n.bearingCount > 0) {
        g.save();
        g.strokeStyle = hexToRgba(INK.gold, 0.82);
        g.fillStyle = hexToRgba(INK.gold, 0.10);
        g.lineWidth = 1.4;
        g.setLineDash([5, 4]);
        g.beginPath(); g.arc(x, y, r + 9, 0, Math.PI * 2); g.fill(); g.stroke();
        g.setLineDash([]);
        const count = String(n.bearingCount);
        g.font = FONT_MONO(700, 8);
        const countWidth = Math.max(12, g.measureText(count).width + 7);
        g.fillStyle = INK.plateHard;
        g.strokeStyle = hexToRgba(INK.gold, 0.82);
        g.beginPath(); g.rect(x + r + 5, y - r - 11, countWidth, 13); g.fill(); g.stroke();
        g.fillStyle = INK.gold; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(count, x + r + 5 + countWidth / 2, y - r - 4.5);
        g.restore();
      }

      // Uncharted frontier: a quiet dashed socket with a survey mark, never a colored node.
      if (!n.charted) {
        if (this._layers.discovery) {
          g.save();
          g.beginPath(); g.arc(x, y, r - 3, 0, Math.PI * 2);
          g.fillStyle = 'rgba(56, 52, 42, 0.30)'; g.fill();
          g.strokeStyle = 'rgba(142, 134, 117, 0.30)'; g.lineWidth = 1; g.setLineDash([3, 4]); g.stroke(); g.setLineDash([]);
          g.fillStyle = n.bearingCount > 0 ? hexToRgba(INK.gold, 0.65) : 'rgba(142, 134, 117, 0.45)';
          g.font = FONT_UI(700, n.bearingCount > 0 ? 9 : 10);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('?', x, y);
          g.restore();
        }
        continue;
      }

      const eventSignal = this._layers.events ? sectorConflictSignal(state, n.id) : null;
      const holdingsSignal = this._layers.holdings ? sectorHoldingsSignal(state, n.id) : null;
      const eventDetail = eventSignal
        ? (eventSignal.wars > 0
          ? `${eventSignal.wars} war${eventSignal.wars > 1 ? 's' : ''}${eventSignal.tense > 0 ? `, ${eventSignal.tense} tense` : ''}`
          : eventSignal.tense > 0
            ? `${eventSignal.tense} tense`
            : 'quiet')
        : 'off';
      const holdingsDetail = holdingsSignal && holdingsSignal.count > 0
        ? `${holdingsSignal.count} claim${holdingsSignal.count > 1 ? 's' : ''}`
        : 'none';

      this._clickTargets.push({
        sx: x, sy: y, radiusPx: r + 8, kind: 'sector', id: n.id, sectorId: n.id, name: n.name,
        factionId: n.factionId, security: n.security, x: n.x, y: n.y,
        presence: n.presence, searchText: n.searchText,
        events: eventSignal,
        holdings: holdingsSignal,
        detail: `Sector · ${factionNameOf(n.factionId)} · Sec: ${n.security ? n.security.toFixed(2) : '0.00'} · Events: ${eventDetail} · Holdings: ${holdingsDetail}`
      });

      // Territory wash (faction layer): the live owner underlays the node as a broad soft ring.
      if (this._layers.faction && n.ownerId) {
        g.save();
        g.strokeStyle = hexToRgba(factionColorOf(n.ownerId), 0.30);
        g.lineWidth = 4;
        g.beginPath(); g.arc(x, y, r + 6, 0, Math.PI * 2); g.stroke();
        g.restore();
      }

      if (this._layers.events && eventSignal && (eventSignal.wars > 0 || eventSignal.tense > 0)) {
        const intensity = Math.max(1, eventSignal.wars * 2 + eventSignal.tense);
        g.save();
        g.strokeStyle = eventSignal.wars > 0
          ? hexToRgba(INK.red, 0.74)
          : 'rgba(177, 132, 228, 0.76)';
        g.lineWidth = 1.3 + Math.min(1.2, intensity * 0.22);
        g.setLineDash(eventSignal.wars > 0 ? [2.4, 2.6] : [4.2, 4.5]);
        g.beginPath(); g.arc(x, y, r + 10.5, 0, Math.PI * 2); g.stroke();
        g.setLineDash([]);
        const badge = String(eventSignal.wars + eventSignal.tense);
        g.font = FONT_MONO(700, 8.5);
        const bw = Math.max(11, g.measureText(badge).width + 5);
        const bx = x - r - 7;
        const by = y - r - 9;
        g.fillStyle = INK.plateHard;
        g.strokeStyle = eventSignal.wars > 0 ? INK.red : '#b092e8';
        g.lineWidth = 1;
        g.beginPath(); g.rect(bx, by, bw, 11); g.fill(); g.stroke();
        g.fillStyle = eventSignal.wars > 0 ? INK.red : '#d8c6ff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(badge, bx + bw / 2, by + 5.5);
        g.restore();
      }

      if (this._layers.holdings && holdingsSignal && holdingsSignal.count > 0) {
        g.save();
        const stable = holdingsSignal.defenseAvg >= 26;
        const color = stable ? '#8ec47a' : '#d7a86e';
        const hx = x + r + 8;
        const hy = y + r - 1;
        g.strokeStyle = color;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(hx, hy - 5);
        g.lineTo(hx + 5, hy);
        g.lineTo(hx, hy + 5);
        g.lineTo(hx - 5, hy);
        g.closePath();
        g.stroke();
        g.font = FONT_MONO(700, 8);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = color;
        g.fillText(String(Math.min(9, holdingsSignal.count)), hx, hy + 0.2);
        g.restore();
      }

      // Current sector: brass corner brackets, the "you are here" clamp.
      if (n.current) {
        g.save();
        g.strokeStyle = INK.brass;
        g.lineWidth = 1.8;
        const b = r + 7.5;
        const t = 5.5;
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          g.beginPath();
          g.moveTo(x + dx * b - dx * t, y + dy * b);
          g.lineTo(x + dx * b, y + dy * b);
          g.lineTo(x + dx * b, y + dy * b - dy * t);
          g.stroke();
        }
        g.restore();
      }

      // Contested-sector badge (faction layer): a violet contest diamond, not a glow.
      if (this._layers.faction) {
        const sig = sectorSignalFor(state, n.id);
        if (sig && sig.contestMargin < 0.16) {
          g.save();
          g.fillStyle = '#b092e8';
          const bx = x + r + 7, by = y - r - 5;
          g.beginPath();
          g.moveTo(bx, by - 4); g.lineTo(bx + 4, by); g.lineTo(bx, by + 4); g.lineTo(bx - 4, by);
          g.closePath(); g.fill();
          g.restore();
        }
      }

      // The sector sigil. Composed per ACTIVE layer rather than all at once: with the faction layer
      // off the orbit falls back to neutral ink, and with the security layer off the unrest arc is
      // suppressed entirely. That keeps each encoding readable on its own instead of stacking five
      // signals onto one 13px glyph.
      drawSectorSigil(g, x, y, {
        radius: r,
        seedId: n.id,
        factionColor: this._layers.faction ? n.color : 'rgba(150,144,126,1)',
        berths: sectorBerthCount(state, n.id),
        security: n.security != null ? n.security : 1,
        showUnrest: !!this._layers.security,
        stale,
      });

      // Selection: a white double keyline over the sigil — still the only white ring on the table.
      if (this._selectedTarget && this._selectedTarget.id === n.id) {
        g.save();
        g.strokeStyle = 'rgba(237, 232, 216, 0.94)';
        g.lineWidth = 1.7;
        g.beginPath(); g.arc(x, y, r + 5.5, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = 'rgba(237, 232, 216, 0.30)';
        g.lineWidth = 0.7;
        g.beginPath(); g.arc(x, y, r + 8, 0, Math.PI * 2); g.stroke();
        g.restore();
      }

      // Sector label + its presence rows, as ONE solver-managed block.
      //
      // These used to be bare `fillText` calls anchored under the ring, so GALAXY was the only level
      // that never reached `layoutMapLabels` — the charted core is the densest part of the chart and
      // it was the one place with no collision handling at all, which is why "Helios Prime" sat on
      // top of "Tethys Junction". Neither label priority nor span tuning could fix that; nothing was
      // asking the solver anything. Name, staleness and faction presence travel together as lines of
      // a single candidate so the whole block moves as a unit and the rows can never orphan from the
      // name they belong to.
      const nodeLines = [n.name];
      const presenceRows = this._layers.faction && n.presence && n.presence.length
        ? galaxyPresenceMarkerRows(n.presence)
        : [];
      for (const row of presenceRows) nodeLines.push(`◆ ${row.label}`);
      if (stale) nodeLines.push('STALE');
      labelCandidates.push(makeMapLabelCandidate(g, {
        id: `sector:${n.id}`,
        // The current sector outranks its neighbours for a label slot; charted space outranks
        // rumour. 'gate'/'station' tiers are reused rather than invented so one priority table
        // still governs every level.
        kind: n.current ? 'gate' : 'station',
        selected: !!(this._selectedTarget && this._selectedTarget.id === n.id),
        text: n.name,
        lines: nodeLines,
        x,
        y,
        anchorRadius: r + 4,
        color: n.current ? INK.ink0 : (stale ? INK.ink2 : 'rgba(237, 232, 216, 0.85)'),
        // Only the final line can carry its own hue, so give it to the presence row when that row
        // is the last thing in the block — the faction colour is the whole point of that line.
        secondaryColor: (!stale && presenceRows.length === 1) ? presenceRows[0].color : null,
      }));

      // Security overlay pip
      if (this._layers.security && n.security != null) {
        g.fillStyle = dangerColor(n.security);
        g.beginPath(); g.arc(x - r - 2, y, 3, 0, Math.PI * 2); g.fill();
      }

      // Market price flag: a small plated quote keyed by intel freshness.
      if (this._layers.market) {
        const record = sectorRecordById(state, n.id);
        const marketData = bestKnownSectorMarket(state, record, this._selectedCommodity);
        if (marketData) {
          const tint = memoryTint(marketData.ageS);
          g.save();
          g.fillStyle = INK.plateHard;
          g.strokeStyle = hexToRgba(tint.color, 0.65);
          g.lineWidth = 1;
          const text = `BEST ${marketData.sell}`;
          g.font = FONT_MONO(500, 9);
          const tw = g.measureText(text).width;
          g.beginPath(); g.rect(x + r + 3, y - 6, tw + 6, 12); g.fill(); g.stroke();
          g.fillStyle = tint.color; g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillText(text, x + r + 6, y);
          g.restore();
        }
      }

      // Mission context: untracked contract destinations stay compact and quiet. The single
      // player-owned goal is repainted after every node with the strong white-outlined marker.
      if (this._layers.mission) {
        const activeMissions = state.missions && state.missions.active || [];
        const isMissionDest = activeMissions.some(m => m.status === 'active' && (m.destSectorId === n.id || (m.params && m.params.sectorId === n.id)));
        if (isMissionDest) {
          g.save();
          g.fillStyle = hexToRgba(INK.amberHot, 0.85);
          const mx = x, my = y - r - 6;
          g.beginPath();
          g.moveTo(mx, my - 3); g.lineTo(mx + 3, my); g.lineTo(mx, my + 3); g.lineTo(mx - 3, my);
          g.closePath(); g.fill();
          g.restore();
        }
      }

      // Hazard warning badge
      if (this._layers.hazard) {
        const hasHazards = zonesForSector(n.id).some(z => zoneTypeMeta(z.type).hazard);
        if (hasHazards) {
          g.save();
          g.fillStyle = INK.red;
          g.font = FONT_UI(700, 11);
          g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillText('⚠', x + r + 4, y - r - 4);
          g.restore();
        }
      }
    }

    // Resolve every sector block against the others before any of them paints. The goal plate is
    // reserved first (below) so a node label can never be placed under it.
    const goal = activeMapGoal(state);
    let goalNode = null;
    if (goal && goal.sectorId && (this._layers.route || this._layers.mission)) {
      goalNode = model.nodes.find((n) => n.id === goal.sectorId && n.charted) || null;
    }
    const galaxyReserved = [];
    if (goalNode) {
      // The goal plate is drawn by drawMapGoalMarker at a fixed offset from its node; block that
      // rectangle so the solver routes the sector's own name around it instead of under it.
      const gx = sx(goalNode.x), gy = sy(goalNode.y);
      const goalText = `GOAL · ${String(goal.label || 'OBJECTIVE').toUpperCase().slice(0, 22)}`;
      g.save();
      g.font = FONT_MONO(700, 9);
      const goalWidth = g.measureText(goalText).width + 16;
      g.restore();
      galaxyReserved.push({ x: gx + 10, y: gy - 9, width: goalWidth, height: 18 });
    }
    const galaxyLabelLayout = layoutMapLabels(labelCandidates, { width: w, height: h }, {
      reserved: this._reservedLabelRects(w, h, galaxyReserved),
    });
    this._lastLabelLayout = galaxyLabelLayout;
    for (const placement of galaxyLabelLayout) {
      if (placement.visible) drawMapLabelBlock(g, placement);
    }

    // The current goal is the final galaxy paint and strongest hit target. It is intentionally
    // larger/brighter than station, sector, route, and untracked-mission context.
    if (goalNode) {
      const node = goalNode;
      {
        const gx = sx(node.x), gy = sy(node.y);
        drawMapGoalMarker(g, gx, gy, goal.label, w);
        this._clickTargets.push({
          sx: gx,
          sy: gy,
          radiusPx: 27,
          kind: 'sector',
          id: goal.id,
          objective: true,
          markerKind: goal.markerKind,
          missionId: goal.missionId,
          sectorId: goal.sectorId,
          name: goal.label,
          x: node.x,
          y: node.y,
          detail: 'Current goal · ' + goal.label,
        });
      }
    }

    // "You are here", last, so nothing can paint over it.
    //
    // The ship is drawn at its OWN position, not at the centre of its registered sector node. On a
    // long haul those are different places — mid-corridor the ship is ~7,000 WU from either node —
    // and marking the node instead of the ship is how a pilot ends up unable to answer "where am I"
    // while staring straight at the chart. `drawPos` is the galaxy model's declared draw frame
    // (graph units); projecting the global x/z here would land the mark 4,096x off-chart.
    if (model.player && model.player.drawPos) {
      const pxs = sx(model.player.drawPos.x);
      const pys = sy(model.player.drawPos.z);
      drawPlayerFixMark(g, pxs, pys, model.player.rot, {
        scale: 0.92,
        pulse: this._reduceMotion ? 0 : (0.5 + 0.5 * Math.sin(this._animT * 1.7)),
      });
      g.save();
      g.font = FONT_MONO(600, 8);
      g.fillStyle = INK.ink1;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(mapOperatorLabel(state), pxs + 14, pys - 9);
      g.restore();
    }
  },

  // --- SYSTEM DRAW ---
  _drawSystem(g, state, w, h) {
    const model = buildSystemModel(state, null, { claimsSystem: this._claimsSystem() });
    const wp = state.nav && state.nav.waypoint;
    const wpPos = resolveWaypointPresentationPosition(state, wp);
    let span = 3000;
    const pts = [];
    for (const z of model.zones) pts.push({ x: z.x, z: z.z, r: z.radius });
    // Everything in `pts` must be SECTOR-LOCAL: the span below is a radius about the sector centre,
    // so a single global position mixed in here drags the fit out by that sector's whole origin
    // offset (12,288 WU at Tethys) and squeezes the real furniture into a dot.
    for (const p of model.points) if (p.drawPos) pts.push({ x: p.drawPos.x, z: p.drawPos.z, r: 0 });
    if (this._layers.holdings) {
      for (const marker of model.ownership) {
        if (marker.drawPos) pts.push({ x: marker.drawPos.x, z: marker.drawPos.z, r: 0 });
      }
    }
    for (const bearing of model.bearings) {
      const point = bearing.drawFixedPos || bearing.drawCenter;
      if (point) pts.push({ x: point.x, z: point.z, r: bearing.drawFixedPos ? 0 : bearing.radius });
    }
    // The waypoint's resolved presentation position is GLOBAL. It reaches the span independently
    // of the model, so an armed waypoint reproduced the blowout on its own.
    const wpDraw = wpPos
      ? globalToSectorLocalForSector(wpPos, model.sectorId)
      : null;
    if (wpDraw) pts.push({ x: wpDraw.x, z: wpDraw.z, r: 180 });
    if (pts.length) {
      let m = 0;
      for (const p of pts) m = Math.max(m, Math.hypot(p.x, p.z) + (p.r || 0));
      span = Math.max(800, m * 2.2);
    }

    // SLICE B — SYSTEM is the second builder migrated onto the unified camera (ADR D3 step 3).
    //
    // The expression below stays entirely in the SECTOR-LOCAL draw frame, and that is deliberate,
    // not a compromise. `cam.cx`/`cam.cy` are the camera's `focusGlobal` converted into this
    // sector's local frame by `_syncLegacyFromCamera`, and every `x` fed to `sx` is a `drawPos` —
    // so both operands of the subtraction are sector-local and the difference is the same vector
    // the camera would compute in global. The two forms are arithmetically identical (global and
    // sector-local differ by a constant origin that cancels in the subtraction), which was verified
    // numerically at Tethys before this edit.
    //
    // Keeping the subtraction in one frame is what preserves ADR D2.1's guarantee. `check:map-frames`
    // asserts this draw site never projects a raw global `p.x`/`p.z`, and that assertion stays exactly
    // as meaningful after the migration as before it: mixing a global position into this expression
    // is still a 12,288 WU error at Tethys.
    const camera = this._cameraOrInit();
    const viewport = { width: w, height: h };
    const pxPerWU = pixelsPerWU(camera, viewport);
    const cam = this._cams.system;

    this._view = { level: 'system', baseScale: pxPerWU, pxPerWU, camera, contentSpanWU: span };
    const sx = (x) => w / 2 + (x - cam.cx) * pxPerWU;
    const sz = (z) => h / 2 + (z - cam.cy) * pxPerWU;
    const labelCandidates = [];
    setMapCanvasAriaLabel(this._canvas, 'system', this._layers.holdings ? model.ownership : []);

    // Header sector plate: brass index tick + Saira name, quiet and machined.
    g.save();
    g.fillStyle = INK.brass;
    g.beginPath();
    g.moveTo(16, 15); g.lineTo(22, 18); g.lineTo(16, 21); g.closePath();
    g.fill();
    g.fillStyle = 'rgba(237, 232, 216, 0.85)';
    g.font = FONT_DISPLAY(600, 13);
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(String(model.sectorName || '').toUpperCase(), 27, 13);
    g.font = FONT_MONO(500, 8);
    g.fillStyle = INK.ink2;
    g.fillText('SYSTEM SURVEY', 27, 30);
    g.restore();

    // Player position marker on the system map: amber heading triangle with a white keyline.
    // This mark was already here, but it projected the GLOBAL player position onto a sector-local
    // canvas — so anywhere but Helios (origin 0,0) "you are here" silently landed off-canvas at the
    // sector's origin offset. model.player is the converted mark.
    //
    // `inSector` is always true on this path today (the call above passes sectorId=null, so the
    // model is built for the sector you are standing in). It is checked anyway because the model
    // supports surveying a REMOTE sector, and drawing this triangle for a remote player would put
    // a confident "you are here" on a chart the player is nowhere near. The model carries
    // bearing/distance for that case; no caller needs the off-chart indicator yet, so none is drawn.
    if (model.player && model.player.inSector) {
      const px = sx(model.player.drawPos.x), py = sz(model.player.drawPos.z);
      // One silhouette for "you are here" at every scale (galaxy/system/local). The mark used to be
      // a bare amber triangle here and a different shape at LOCAL, so the pilot had to relearn the
      // most important mark on the chart at each threshold. It is also no longer amber: bright
      // gold/amber is reserved for the tracked objective and the active route, and spending it on
      // the always-present player mark is what made the reserved colour stop meaning anything.
      drawPlayerFixMark(g, px, py, model.player.rot, {
        scale: 1,
        pulse: this._reduceMotion ? 0 : (0.5 + 0.5 * Math.sin(this._animT * 1.7)),
      });
    }

    // Draw active system waypoint (tether path). Both ends were read global straight onto a
    // sector-local canvas, so outside Helios the tether ran off to the lattice corner; model.player
    // and wpDraw are the converted pair.
    if (wpDraw && this._layers.route && model.player) {
      g.save();
      g.strokeStyle = INK.amber; g.lineWidth = 1.8; g.setLineDash([5, 5]);
      g.beginPath();
      g.moveTo(sx(model.player.drawPos.x), sz(model.player.drawPos.z));
      g.lineTo(sx(wpDraw.x), sz(wpDraw.z));
      g.stroke();
      g.restore();
    }
    // Zones
    for (const z of model.zones) {
      const x = sx(z.x), y = sz(z.z), rr = z.radius * pxPerWU;

      // Zone centres are authored sector-local, but the click target arms an autopilot fix, which
      // world.js stores global — so "Align Autopilot" on a Tethys zone used to plot a course a
      // whole lattice offset short of the zone the player actually clicked.
      const zoneNav = sectorLocalToGlobalForSector({ x: z.x, z: z.z }, model.sectorId);
      this._clickTargets.push({
        sx: x, sy: y, radiusPx: Math.max(16, rr), kind: 'zone', id: z.id,
        x: zoneNav.x, z: zoneNav.z, radius: z.radius, name: z.name,
        factionId: z.factionId, detail: `Zone · ${z.typeLabel} · threat ${z.threat || 0}`
      });

      // Boundary field hazards (explicit dashed red border lines, cross-hatch, not glow)
      if (z.hazard && this._layers.hazard) {
        g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2);
        g.strokeStyle = INK.red; g.lineWidth = 1.8; g.setLineDash([8, 6]); g.stroke(); g.setLineDash([]);
        g.fillStyle = hexToRgba(INK.red, 0.05); g.fill();
        const hazardGlyph = hazardTypeGlyph(z.type);
        g.save();
        g.fillStyle = '#f0908a'; g.font = FONT_UI(700, 12); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(hazardGlyph, x, y);
        g.restore();
        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `zone:${z.id}`,
          kind: 'hazard',
          text: `HAZARD · ${z.name.toUpperCase()}`,
          lines: [`HAZARD · ${z.name.toUpperCase()}`],
          x,
          y,
          anchorRadius: 5,
          color: '#ff5c5c',
        }));
      } else {
        const zoneInk = mutedZoneColor(z.color);
        g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2);
        if (this._layers.faction) {
          g.fillStyle = hexToRgba(zoneInk, 0.05); g.fill();
          g.strokeStyle = hexToRgba(zoneInk, 0.32);
        } else {
          g.strokeStyle = 'rgba(142, 134, 117, 0.20)';
        }
        g.lineWidth = 1.2; g.stroke();
        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `zone:${z.id}`,
          kind: 'zone',
          text: z.name + (z.threat ? ` · THREAT ${z.threat}` : ''),
          lines: [z.name + (z.threat ? ` · THREAT ${z.threat}` : '')],
          x,
          y,
          anchorRadius: 4,
          color: zoneInk,
        }));
      }
    }

    // Asteroid field regions (discovery / market layer)
    if (this._layers.discovery || this._layers.market) {
      const sectorRecord = sectorRecordById(state, model.sectorId);
      const fields = sectorRecord && sectorRecord.fields ? sectorRecord.fields : [];
      for (const f of fields) {
        const cx = Number(f.center && f.center.x) || 0;
        const cz = Number(f.center && f.center.z) || 0;
        const radius = Number(f.clusterRadius) || Number(f.radius) || 300;
        const fx = sx(cx), fy = sz(cz), fr = radius * pxPerWU;
        const glyph = asteroidOreGlyph(f.type);
        g.save();
        g.strokeStyle = hexToRgba(INK.brass, 0.30);
        g.fillStyle = hexToRgba(INK.brass, 0.045);
        g.setLineDash([2, 4]); g.lineWidth = 1;
        g.beginPath(); g.arc(fx, fy, fr, 0, Math.PI * 2); g.fill(); g.stroke(); g.setLineDash([]);
        g.fillStyle = hexToRgba(INK.brass, 0.8);
        g.font = FONT_UI(700, 9); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(glyph, fx, fy);
        g.restore();
      }
    }

    // Manufactured corridors are one saved physical route, not three unrelated ownership dots.
    // Paint the route beneath its ring/relay/station marks and only on the existing Route layer.
    if (this._layers.route) {
      for (const marker of model.ownership) {
        if (marker.travelRoute) drawManufacturedTravelRoute(g, marker.travelRoute, sx, sz, true);
      }
    }

    // Unique-wreck and rumor read layer. A rumor ring is selectable for its manual-search text,
    // but it never carries a navigable course target.
    if (this._layers.discovery) {
      for (const bearing of model.bearings) {
        const fixed = !!bearing.drawFixedPos;
        const point = bearing.drawFixedPos || bearing.drawCenter;
        if (!point) continue;
        const x = sx(point.x), y = sz(point.z);
        const radiusPx = fixed ? 0 : bearing.radius * pxPerWU;
        const selected = !!(this._selectedTarget && this._selectedTarget.id === bearing.wreckId);
        drawUniqueWreckBearingMarker(g, x, y, radiusPx, { fixed, selected, phase: bearing.phase });

        const rumorTarget = frontierRumorMapTarget(bearing);
        const manualTarget = rumorTarget || vestaOreCacheMapTarget(bearing) || pallasHiddenCacheMapTarget(bearing);
        if (manualTarget) {
          this._clickTargets.push({
            ...manualTarget,
            sx: x,
            sy: y,
            radiusPx: 18,
            ringRadiusPx: radiusPx,
            detail: bearing.detail,
          });
        } else if (fixed && bearing.courseTarget) {
          this._clickTargets.push({
            ...bearing.courseTarget,
            sx: x,
            sy: y,
            radiusPx: 18,
            sectorId: bearing.sectorId,
            phase: bearing.phase,
            detail: bearing.phase === 'salvaged' ? 'Read bearing · salvaged wreck' : 'Read bearing · scan-fixed wreck',
          });
        }

        const labelX = fixed ? x : x + Math.min(Math.max(12, radiusPx), 64);
        const phaseLabel = bearing.statusLabel || (bearing.manualSearch ? 'RUMOR SEARCH'
          : bearing.phase === 'salvaged' ? 'SALVAGED' : fixed ? 'FIXED' : 'READ BEARING');
        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `bearing:${bearing.wreckId}`,
          kind: 'bearing',
          text: `${phaseLabel} · ${bearing.name}`,
          lines: [`${phaseLabel} · ${bearing.name}`],
          x: labelX,
          y,
          anchorRadius: fixed ? 10 : 5,
          color: '#e6bf6a',
          selected,
          named: true,
        }));
      }
    }

    // Gate-name multiplicity (continuous residency can park neighbour twins on-screen).
    const systemGateNameCounts = new Map();
    for (const p of model.points) {
      if (p.kind !== 'gate' || !p.drawPos) continue;
      const base = String(p.name || 'Gate');
      systemGateNameCounts.set(base, (systemGateNameCounts.get(base) || 0) + 1);
    }

    // Points of interest. `drawPos` is the sector-local projection; `p.x`/`p.z` stay global because
    // the click target below feeds resolveCourseTarget, which arms a global autopilot fix.
    for (const p of model.points) {
      if (!p.drawPos) continue;
      const x = sx(p.drawPos.x), y = sz(p.drawPos.z);
      const isGate = p.kind === 'gate';
      const isStation = p.kind === 'station';
      // Gate labels disambiguate by bearing from the SECTOR centre, so this is the local frame.
      const displayName = isGate
        ? disambiguateGateLabel(p.name, p.drawPos.x, p.drawPos.z, 0, 0, systemGateNameCounts)
        : p.name;

      this._clickTargets.push({
        sx: x, sy: y, radiusPx: 18, kind: p.kind, id: p.id, x: p.x, z: p.z,
        entityId: p.entityId, stationId: p.stationId, targetSectorId: p.targetSectorId,
        name: displayName, factionId: p.factionId,
        mapKind: p.mapKind, stageId: p.stageId, stageLabel: p.stageLabel,
        coursePos: p.coursePos, courseLabel: p.courseLabel,
        courseArrivalRadius: p.courseArrivalRadius, statusLine: p.statusLine,
        ledger: p.ledger, history: p.history, searchText: p.searchText,
        detail: `${p.kind.toUpperCase()} · ${factionNameOf(p.factionId)}${p.statusLine ? ` · ${p.statusLine}` : ''}`
      });

      // Selection: white keyline, the only selection language on the table.
      if (this._selectedTarget && this._selectedTarget.id === p.id) {
        g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(237, 232, 216, 0.9)'; g.lineWidth = 1.8; g.stroke();
      }

      const col = isGate ? INK.teal : isStation ? INK.brass : INK.amber;
      if (isGate) drawGateMark(g, x, y, Math.atan2(p.drawPos.z || 0, p.drawPos.x || 1));
      else if (isStation) drawStationMark(g, x, y);
      else drawPoiMark(g, x, y);

      const pointLines = [displayName];
      if (p.statusLine) pointLines.push(p.statusLine);
      let marketTint = null;
      let services = [];
      if (this._layers.services && (isStation || isGate)) {
        const record = findStationRecord(state, p.stationId || p.id);
        services = record && record.services ? record.services : [];
      }

      if (this._layers.market && isStation) {
        const marketData = getMarketMemoryForStation(state, p.stationId || p.id, this._selectedCommodity);
        if (marketData) {
          marketTint = memoryTint(marketData.ageS).color;
          pointLines.push(`MARKET ${marketData.buy}/${marketData.sell}`);
        }
      }
      labelCandidates.push(makeMapLabelCandidate(g, {
        id: `point:${p.id}`,
        kind: p.kind,
        text: displayName,
        lines: pointLines,
        x,
        y,
        anchorRadius: isGate ? 8 : isStation ? 7 : 5,
        color: col,
        secondaryColor: marketTint,
        selected: !!(this._selectedTarget && this._selectedTarget.id === p.id),
      }));

      if (isStation && services.length > 0) {
        drawServicePictograms(g, x, y + 13, services);
      }

      // Mission relevance overlay
      if (this._layers.mission) {
        const activeMissions = state.missions && state.missions.active || [];
        const isMissionDest = activeMissions.some(m => m.status === 'active' && m.destStationId === p.stationId);
        if (isMissionDest) {
          g.strokeStyle = INK.amberHot; g.lineWidth = 1.5;
          g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.stroke();
        }
      }
    }

    // Player-owned bases: permanent operating landmarks, visually distinct from neutral POIs.
    if (this._layers.holdings) {
      for (const marker of model.ownership) {
        const draw = marker.drawPos;
        if (!draw || !Number.isFinite(draw.x) || !Number.isFinite(draw.z)) continue;
        const x = sx(draw.x), y = sz(draw.z);
        const selected = !!(this._selectedTarget && this._selectedTarget.id === marker.id);
        const target = {
          ...marker,
          sx: x,
          sy: y,
          radiusPx: 22,
          kind: 'claim',
          entityId: marker.targetEntityId,
          sectorId: model.sectorId,
          detail: `Owned base · ${marker.statusLine}`,
        };
        this._clickTargets.push(target);

        g.save();
        g.strokeStyle = marker.color;
        g.fillStyle = marker.color;
        g.lineWidth = selected ? 2.5 : 1.5;
        g.beginPath();
        g.arc(x, y, selected ? 13 : 11, 0, Math.PI * 2);
        g.stroke();
        g.font = FONT_MONO(700, 15);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(marker.glyph, x, y);
        g.restore();

        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `claim:${marker.id || marker.claimId}`,
          kind: 'claim',
          text: marker.name,
          lines: [marker.name, marker.statusLine],
          x,
          y,
          anchorRadius: 14,
          color: marker.color,
          selected,
          named: true,
        }));
      }
    }

    let objectivePlacement = null;
    if (wpDraw && (this._layers.route || this._layers.mission)) {
      const wx = sx(wpDraw.x);
      const wy = sz(wpDraw.z);
      const objectiveLabel = waypointMapLabel(wp);
      labelCandidates.push(makeMapLabelCandidate(g, {
        id: 'objective:active-waypoint',
        kind: 'objective',
        objective: true,
        text: `GOAL · ${objectiveLabel.toUpperCase()}`,
        lines: [`GOAL · ${objectiveLabel.toUpperCase()}`],
        x: wx,
        y: wy,
        anchorRadius: 16,
        color: INK.amberHot,
      }));
      // waypointClickTarget carries the GLOBAL resolved position into the click payload; only the
      // sx/sy screen anchor is sector-local.
      const target = waypointClickTarget(wp, wpPos, wx, wy);
      if (target) this._clickTargets.push(target);
    }
    const headerWidth = Math.min(w - 24, Math.max(80, model.sectorName.length * 8 + 26));
    const labelLayout = layoutMapLabels(labelCandidates, { width: w, height: h }, {
      reserved: this._reservedLabelRects(w, h, [{ x: 8, y: 8, width: headerWidth, height: 40 }]),
    });
    this._lastLabelLayout = labelLayout;
    for (const placement of labelLayout) {
      if (!placement.visible) continue;
      if (placement.objective) objectivePlacement = placement;
      else drawMapLabelBlock(g, placement);
    }

    // Secondary mission points before the goal: a patrol contract's other targets, a survey site,
    // a signal source. Drawn under the pin so the tracked objective still owns the eye.
    if (this._layers.mission) {
      for (const point of missionMapGeometry(state, trackedMissionOf(state))) {
        // missionMapGeometry reads entity/station positions, so its points are global.
        const local = globalToSectorLocalForSector(point, model.sectorId);
        const mx = sx(local.x), my = sz(local.z);
        if (mx < 8 || my < 8 || mx > w - 8 || my > h - 8) continue;
        drawMissionPoint(g, mx, my, point.kind, point.done);
      }
    }

    // Objective marker renders last, with the first label reservation and strongest contrast.
    if (wpDraw && (this._layers.route || this._layers.mission)) {
      drawWaypointPin(g, sx(wpDraw.x), sz(wpDraw.z), waypointMapLabel(wp), w, objectivePlacement);
    }
  },

  // --- LOCAL DRAW ---
  _drawLocal(g, state, w, h) {
    // Fed by _draw before dispatch, so memory survives a trip out to SYSTEM and back.
    const intel = this._localIntel;
    const model = buildLocalModel(state, this._isHostile, { claimsSystem: this._claimsSystem(), intel });
    this._localLiveContacts = model.contacts
      ? model.contacts.filter((contact) => contact && !contact.remembered).length
      : 0;
    const cam = this._cams.local;
    const wp = state.nav && state.nav.waypoint;
    const wpPos = resolveWaypointPresentationPosition(state, wp);
    const nowS = Math.max(0, Number(state && state.simTime) || 0);

    const player = playerEntity(state);
    const px = player ? player.pos.x : 0;
    const pz = player ? player.pos.z : 0;

    // The local scope favors the immediate field: a tighter span gives near contacts breathing
    // room, and important objects beyond the frame collapse into edge ticks instead of forcing
    // everything into a packed center cluster.
    let span = 1500;
    // Fit on a high percentile of what is worth seeing rather than on the single furthest thing.
    //
    // A plain max hands the zoom to whichever object happens to be furthest out, and one such object
    // is always present: continuous residency parks a neighbouring sector's station a lattice hop
    // (~14,700u) away, which blew the span past 27,000u and squeezed every real local mark into an
    // unreadable knot at the centre while the rest of the table sat empty. It also quietly defeated
    // the edge-tick path below — a max fit guarantees every contributor is already in frame, so the
    // ticks written for exactly these objects could never fire.
    //
    // Three exclusions and a percentile, in that order:
    //  - foreign furniture never votes; it belongs to another sector and recedes on the glass anyway.
    //  - remembered contacts never vote; they dead-reckon forward forever, so the scope would slowly
    //    zoom out chasing a ship that is long gone.
    //  - asteroids never vote. A belt carries hundreds of rocks, so letting them in hands the
    //    percentile to the field and frames the scenery instead of the things a pilot steers by,
    //    pushing every station and gate off-frame. Rocks are texture; they follow the scale, they
    //    do not set it.
    //  - of what remains, take p85 so a lone straggler falls off-frame into an edge tick instead of
    //    setting the scale for everything else. With few objects p85 lands on the max, so a sparse
    //    field behaves exactly as before.
    const fitSpans = [];
    for (const c of model.contacts) {
      if (c.remembered || c.foreign || c.kind === 'asteroid') continue;
      fitSpans.push(Math.hypot(c.x - px, c.z - pz));
    }
    if (this._layers.holdings) {
      for (const marker of model.ownership) fitSpans.push(Math.hypot(marker.x - px, marker.z - pz));
    }
    for (const bearing of model.bearings) {
      const point = bearing.fixedPos || bearing.center;
      if (!point) continue;
      const uncertainty = bearing.fixedPos ? 0 : bearing.radius;
      fitSpans.push(Math.hypot(point.x - px, point.z - pz) + uncertainty);
    }
    // The tracked objective always votes: it is the one mark the pilot opened the chart to find.
    if (wpPos) {
      fitSpans.push(Math.hypot(wpPos.x - px, wpPos.z - pz));
    }
    let m = 0;
    if (fitSpans.length) {
      fitSpans.sort((a, b) => a - b);
      m = fitSpans[Math.min(fitSpans.length - 1, Math.ceil(fitSpans.length * 0.85) - 1)] || 0;
    }
    if (m > 0) span = Math.max(700, m * 1.55);

    const baseScale = (Math.min(w, h) * 0.85) / span;
    this._view = { level: 'local', baseScale };
    const sx = (x) => w / 2 - (x - cam.cx) * baseScale * cam.zoom;
    const sz = (z) => h / 2 - (z - cam.cy) * baseScale * cam.zoom;
    const labelCandidates = [];
    const edgeTicks = [];
    setMapCanvasAriaLabel(this._canvas, 'local', this._layers.holdings ? model.ownership : []);

    const offView = (x, y) => x < 20 || y < 20 || x > w - 20 || y > h - 20;
    const pushEdgeTick = (x, y, color, shape, target) => {
      if (edgeTicks.length >= 24) return;
      const tx = Math.max(14, Math.min(w - 14, x));
      const ty = Math.max(14, Math.min(h - 14, y));
      edgeTicks.push({ x: tx, y: ty, color, shape, target });
    };

    // Range rings: warm dashed survey circles.
    g.strokeStyle = 'rgba(216, 190, 150, 0.10)';
    g.setLineDash([3, 5]);
    for (const rr of [0.33, 0.66, 1.0]) {
      g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * 0.42 * rr, 0, Math.PI * 2); g.stroke();
    }
    g.setLineDash([]);

    if (this._layers.discovery) {
      for (const bearing of model.bearings) {
        const fixed = !!bearing.fixedPos;
        const point = bearing.fixedPos || bearing.center;
        if (!point) continue;
        const x = sx(point.x), y = sz(point.z);
        const radiusPx = fixed ? 0 : bearing.radius * baseScale * cam.zoom;
        const rumorTarget = frontierRumorMapTarget(bearing);
        const manualTarget = rumorTarget || vestaOreCacheMapTarget(bearing) || pallasHiddenCacheMapTarget(bearing);
        if (offView(x, y)) {
          pushEdgeTick(x, y, INK.gold, 'bearing', {
            ...(manualTarget || bearing.courseTarget || {}),
            kind: rumorTarget ? 'rumor' : 'bearing',
            id: manualTarget ? manualTarget.id : bearing.wreckId,
            name: bearing.name,
            sectorId: bearing.sectorId,
            detail: manualTarget ? bearing.detail : 'Read bearing · off-view survey fix',
          });
          continue;
        }
        const selected = !!(this._selectedTarget && this._selectedTarget.id === bearing.wreckId);
        drawUniqueWreckBearingMarker(g, x, y, radiusPx, { fixed, selected, phase: bearing.phase });

        if (manualTarget) {
          this._clickTargets.push({
            ...manualTarget,
            sx: x,
            sy: y,
            radiusPx: 18,
            ringRadiusPx: radiusPx,
            detail: bearing.detail,
          });
        } else if (fixed && bearing.courseTarget) {
          this._clickTargets.push({
            ...bearing.courseTarget,
            sx: x,
            sy: y,
            radiusPx: 18,
            sectorId: bearing.sectorId,
            phase: bearing.phase,
            detail: bearing.phase === 'salvaged' ? 'Read bearing · salvaged wreck' : 'Read bearing · scan-fixed wreck',
          });
        }

        const labelX = fixed ? x : x + Math.min(Math.max(12, radiusPx), 64);
        const phaseLabel = bearing.statusLabel || (bearing.manualSearch ? 'RUMOR SEARCH'
          : bearing.phase === 'salvaged' ? 'SALVAGED' : fixed ? 'FIXED' : 'READ BEARING');
        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `bearing:${bearing.wreckId}`,
          kind: 'bearing',
          text: `${phaseLabel} · ${bearing.name}`,
          lines: [`${phaseLabel} · ${bearing.name}`],
          x: labelX,
          y,
          anchorRadius: fixed ? 10 : 5,
          color: INK.gold,
          selected,
          named: true,
        }));
      }

      // Scanner pings: transient gold diamonds where the sweep found something unclassified.
      const pings = state.world && state.world.scanPings && state.world.scanPings[model.sectorId];
      if (Array.isArray(pings)) {
        for (const ping of pings) {
          if (!ping || !ping.pos) continue;
          const x = sx(ping.pos.x), y = sz(ping.pos.z);
          if (offView(x, y)) continue;
          g.save();
          g.strokeStyle = hexToRgba(INK.gold, 0.75);
          g.lineWidth = 1.2;
          g.setLineDash([3, 3]);
          g.beginPath();
          g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y);
          g.closePath(); g.stroke();
          g.setLineDash([]);
          g.fillStyle = hexToRgba(INK.gold, 0.9);
          g.beginPath(); g.arc(x, y, 1.4, 0, Math.PI * 2); g.fill();
          g.restore();
        }
      }
    }

    // Draw active waypoint line
    if (wpPos && this._layers.route) {
      g.save();
      g.strokeStyle = INK.amber; g.lineWidth = 2; g.setLineDash([6, 5]);
      g.beginPath(); g.moveTo(sx(px), sz(pz)); g.lineTo(sx(wpPos.x), sz(wpPos.z)); g.stroke();
      g.restore();
    }

    if (this._layers.route) {
      for (const marker of model.ownership) {
        if (marker.travelRoute) drawManufacturedTravelRoute(g, marker.travelRoute, sx, sz, false);
      }
    }

    // Rock thinning: dense belts collapse into a faint texture of the nearest rocks rather than
    // a mush of overlapping marks at the frame edge.
    let asteroidDrawSet = null;
    {
      const rocks = [];
      for (const c of model.contacts) {
        if (c.kind === 'asteroid') rocks.push({ id: c.id, d: Math.hypot(c.x - px, c.z - pz) });
      }
      if (rocks.length > 80) {
        rocks.sort((a, b) => a.d - b.d);
        asteroidDrawSet = new Set(rocks.slice(0, 80).map((rock) => rock.id));
      }
    }

    // Only gates that can actually claim a label may force a disambiguating octant. Foreign gates
    // are drawn faded and are denied a label slot below, so counting them made a lone unambiguous
    // local gate wear a bearing suffix to distinguish it from a twin the pilot cannot even see —
    // noise justified by nothing on screen. Two visible same-named gates still earn the suffix.
    const localGateNameCounts = new Map();
    for (const c of model.contacts) {
      if (c.kind !== 'gate' || c.foreign || c.remembered) continue;
      const base = String(c.name || 'Gate');
      localGateNameCounts.set(base, (localGateNameCounts.get(base) || 0) + 1);
    }

    // Contacts: keyed silhouettes, constant screen size. Rocks declutter off-frame silently;
    // infrastructure, hostiles and waypoints collapse into edge ticks instead.
    for (const c of model.contacts) {
      if (c.kind === 'asteroid' && asteroidDrawSet && !asteroidDrawSet.has(c.id)) continue;
      const x = sx(c.x), y = sz(c.z);
      const off = offView(x, y);
      const displayName = c.kind === 'gate'
        ? disambiguateGateLabel(c.name, c.x, c.z, px, pz, localGateNameCounts)
        : c.name;

      // Remembered contacts are memory, not sensor return. They draw faded at the dead-reckoned
      // position inside a dashed uncertainty ring — hairline dashes are this table's grammar for
      // "not confirmed" — and they claim neither an edge tick nor a click target, because a course
      // laid to a ghost is a course laid to nothing.
      if (c.remembered) {
        if (off) continue;
        const band = localMemoryBand(c.confidence);
        const memColor = c.hostile ? INK.red : INK.ink2;
        g.save();
        g.globalAlpha = band.alpha;
        if (c.hostile) drawHostileMark(g, x, y, c.rot || 0);
        else drawShipChevron(g, x, y, c.rot || 0, memColor);
        g.strokeStyle = memColor;
        g.lineWidth = 0.8;
        g.setLineDash([1.5, 2.5]);
        g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.stroke();
        g.setLineDash([]);
        g.restore();
        continue;
      }

      // Furniture belonging to a neighbouring sector recedes. Without this the gate ring of every
      // adjacent system sits at full contrast in the local scope and the sector you are actually
      // in stops being the loudest thing on the glass.
      const foreignFade = c.foreign && (c.kind === 'gate' || c.kind === 'station');

      if (off) {
        // Off-view foreign furniture gets no edge tick at all. The ticks exist to say "something
        // that matters is just out of frame"; a gate two sectors over does not qualify, and the
        // 24-tick budget is better spent on local infrastructure and hostiles.
        if (!foreignFade && (c.kind === 'station' || c.kind === 'gate' || c.hostile)) {
          pushEdgeTick(x, y, c.kind === 'gate' ? INK.teal : c.kind === 'station' ? INK.brass : INK.red, c.kind === 'gate' ? 'gate' : c.kind === 'station' ? 'station' : 'hostile', {
            kind: c.kind, id: c.id, x: c.x, z: c.z,
            entityId: c.entityId, stationId: c.stationId, name: displayName, factionId: c.factionId,
            hostile: c.hostile,
            detail: `Contact · ${displayName} · off-view ${c.kind.toUpperCase()}`,
          });
        }
        continue; // nothing important enough to draw leaves the frame
      }

      this._clickTargets.push({
        sx: x, sy: y, radiusPx: 14, kind: c.kind, id: c.id, x: c.x, z: c.z,
        entityId: c.entityId, stationId: c.stationId, name: displayName, factionId: c.factionId,
        hostile: c.hostile,
        detail: `Contact · ${displayName} · ${c.kind.toUpperCase()}`
      });

      // Selection: white keyline.
      if (this._selectedTarget && this._selectedTarget.id === c.id) {
        g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(237, 232, 216, 0.9)'; g.lineWidth = 1.8; g.stroke();
      }

      if (foreignFade) { g.save(); g.globalAlpha = 0.42; }

      if (c.kind === 'asteroid') {
        drawAsteroidMark(g, x, y, c.id);
        // Scan-highlighted rock: amber assay ring + ore grade above.
        if (c.scanHighlightUntil > nowS) {
          g.save();
          g.strokeStyle = INK.amberHot;
          g.lineWidth = 1.2;
          g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.stroke();
          g.fillStyle = INK.amberHot;
          g.font = FONT_MONO(700, 8);
          g.textAlign = 'center'; g.textBaseline = 'bottom';
          g.fillText(c.scanOre || '·', x, y - 7);
          g.restore();
        }
      } else if (c.kind === 'gate') {
        drawGateMark(g, x, y, Math.atan2(c.z - pz, c.x - px));
      } else if (c.kind === 'station') {
        drawStationMark(g, x, y);
      } else if (c.hostile) {
        // Hostile: red open diamond + velocity vector tick.
        if (c.vx != null) {
          const pvx = -(c.vx / 3) * baseScale * cam.zoom;
          const pvz = -(c.vz / 3) * baseScale * cam.zoom;
          const len = Math.hypot(pvx, pvz);
          if (len > 0.1) {
            const mult = len > 24 ? 24 / len : 1;
            g.save();
            g.strokeStyle = INK.red; g.lineWidth = 1.2;
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + pvx * mult, y + pvz * mult); g.stroke();
            g.restore();
          }
        }
        drawHostileMark(g, x, y, c.rot || 0);
      } else {
        const col = this._layers.faction && c.factionId ? factionColorOf(c.factionId) : INK.ink1;
        drawShipChevron(g, x, y, c.rot || 0, col);
      }
      if (foreignFade) g.restore();

      const selected = !!(this._selectedTarget && this._selectedTarget.id === c.id);
      // A faded foreign gate does not also get to claim a label slot unless it is selected — the
      // label layout is the scarcer resource, and local marks should win it.
      if ((c.kind === 'station' || c.kind === 'gate' || selected || c.hostile || c.named)
        && (!foreignFade || selected)) {
        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `contact:${c.id}`,
          kind: c.kind,
          text: displayName,
          lines: [displayName],
          x,
          y,
          anchorRadius: c.kind === 'station' || c.kind === 'gate' ? 8 : 6,
          color: c.kind === 'gate' ? INK.teal
            : c.kind === 'station' ? INK.brass
              : c.hostile ? INK.red : INK.ink0,
          hostile: c.hostile,
          named: c.named,
          selected,
        }));
      }
    }

    // Player: the SAME fix mark used at SYSTEM and GALAXY scale. The LOCAL scope always centres on
    // the ship, so this one was never in danger of disappearing — but it was a third distinct
    // silhouette for the same object, which made the mark something the pilot had to re-identify at
    // every threshold instead of track continuously through one.
    drawPlayerFixMark(g, w / 2, h / 2, player ? player.rot : 0, {
      scale: 1.08,
      pulse: this._reduceMotion ? 0 : (0.5 + 0.5 * Math.sin(this._animT * 1.7)),
    });

    // Velocity vector
    if (player && player.vel) {
      const speed = Math.hypot(player.vel.x, player.vel.z);
      if (speed > 0.5) {
        const vLen = Math.min(80, Math.max(18, speed * 0.25));
        const angle = Math.atan2(-player.vel.z, -player.vel.x);
        g.save();
        g.strokeStyle = hexToRgba(INK.amber, 0.75); g.lineWidth = 1.5; g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(angle) * vLen, h / 2 + Math.sin(angle) * vLen); g.stroke();
        g.restore();
      }
    }

    // Scan sweep animation around the player
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion && this._scanPhase != null) {
      g.save();
      g.strokeStyle = hexToRgba(INK.amber, 0.16);
      g.lineWidth = 1.5;
      g.translate(w / 2, h / 2); g.rotate(this._scanPhase);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.min(w, h) * 0.42, 0); g.stroke();
      g.restore();
    }

    // Range ring labels
    g.fillStyle = 'rgba(142, 134, 117, 0.75)';
    g.font = FONT_MONO(500, 8);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const ringUnits = Math.round(span / 2);
    for (let i = 0; i < 3; i++) {
      const frac = [0.33, 0.66, 1.0][i];
      const rrPx = Math.min(w, h) * 0.42 * frac;
      const label = Math.round(ringUnits * frac) + 'u';
      g.fillText(label, w / 2 + rrPx + 4, h / 2);
    }

    // Empty-space reassurance. Remembered marks do not count as company — the skies really are
    // clear when only memory is left — but the pilot is told the scope is still holding fixes so a
    // faded chevron on an otherwise empty table reads as memory rather than as a rendering fault.
    const liveContacts = model.contacts.reduce((n, c) => (c.remembered ? n : n + 1), 0);
    const rememberedContacts = model.contacts.length - liveContacts;
    const holdingCount = this._layers.holdings ? model.ownership.length : 0;
    if (liveContacts === 0 && holdingCount === 0 && model.bearings.length === 0) {
      g.save();
      g.fillStyle = 'rgba(142, 134, 117, 0.6)';
      g.font = FONT_UI(500, 11);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('CLEAR SKIES — no local contacts', w / 2, h / 2 + 30);
      if (rememberedContacts > 0) {
        g.fillStyle = 'rgba(142, 134, 117, 0.42)';
        g.font = FONT_MONO(500, 9);
        g.fillText(`${rememberedContacts} REMEMBERED ${rememberedContacts === 1 ? 'FIX' : 'FIXES'} FADING`, w / 2, h / 2 + 46);
      }
      g.restore();
    }

    // Player-owned bases remain labeled at local scale and can arm autopilot with a pointer action.
    if (this._layers.holdings) {
      for (const marker of model.ownership) {
        const x = sx(marker.x), y = sz(marker.z);
        if (offView(x, y)) {
          pushEdgeTick(x, y, marker.color, 'claim', {
            ...marker,
            kind: 'claim',
            entityId: marker.targetEntityId,
            sectorId: model.sectorId,
            detail: `Owned base · off-view · ${marker.statusLine}`,
          });
          continue;
        }
        const selected = !!(this._selectedTarget && this._selectedTarget.id === marker.id);
        this._clickTargets.push({
          ...marker,
          sx: x,
          sy: y,
          radiusPx: 22,
          kind: 'claim',
          entityId: marker.targetEntityId,
          sectorId: model.sectorId,
          detail: `Owned base · ${marker.statusLine}`,
        });

        g.save();
        g.strokeStyle = marker.color;
        g.fillStyle = marker.color;
        g.lineWidth = selected ? 2.5 : 1.5;
        g.beginPath();
        g.arc(x, y, selected ? 13 : 11, 0, Math.PI * 2);
        g.stroke();
        g.font = FONT_MONO(700, 15);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(marker.glyph, x, y);
        g.restore();

        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `claim:${marker.id || marker.claimId}`,
          kind: 'claim',
          text: marker.name,
          lines: [marker.name, marker.statusLine],
          x,
          y,
          anchorRadius: 14,
          color: marker.color,
          selected,
          named: true,
        }));
      }
    }

    // The waypoint's edge tick rides even the off-frame goal so the objective never vanishes.
    if (wpPos && (this._layers.route || this._layers.mission)) {
      const wx = sx(wpPos.x);
      const wy = sz(wpPos.z);
      if (offView(wx, wy)) {
        pushEdgeTick(wx, wy, INK.amberHot, 'waypoint', waypointClickTarget(wp, wpPos, wx, wy) || undefined);
      }
    }

    let objectivePlacement = null;
    if (wpPos && (this._layers.route || this._layers.mission)) {
      const wx = sx(wpPos.x);
      const wy = sz(wpPos.z);
      const objectiveLabel = waypointMapLabel(wp);
      labelCandidates.push(makeMapLabelCandidate(g, {
        id: 'objective:active-waypoint',
        kind: 'objective',
        objective: true,
        text: `GOAL · ${objectiveLabel.toUpperCase()}`,
        lines: [`GOAL · ${objectiveLabel.toUpperCase()}`],
        x: wx,
        y: wy,
        anchorRadius: 16,
        color: INK.amberHot,
      }));
      const target = waypointClickTarget(wp, wpPos, wx, wy);
      if (target && !offView(wx, wy)) this._clickTargets.push(target);
    }
    const labelLayout = layoutMapLabels(labelCandidates, { width: w, height: h }, {
      reserved: this._reservedLabelRects(w, h, [{ x: w / 2 - 15, y: h / 2 - 15, width: 30, height: 30 }]),
    });
    this._lastLabelLayout = labelLayout;
    for (const placement of labelLayout) {
      if (!placement.visible) continue;
      if (placement.objective) objectivePlacement = placement;
      else drawMapLabelBlock(g, placement);
    }

    // Secondary mission points sit under the objective: at LOCAL scale a patrol contract's other
    // targets are the difference between "fly here" and "this is the shape of the job".
    if (this._layers.mission) {
      for (const point of missionMapGeometry(state, trackedMissionOf(state))) {
        const mx = sx(point.x), my = sz(point.z);
        if (mx < 8 || my < 8 || mx > w - 8 || my > h - 8) continue;
        drawMissionPoint(g, mx, my, point.kind, point.done);
      }
    }

    // The tracked objective owns the final paint and the strongest label reservation.
    if (wpPos && (this._layers.route || this._layers.mission)) {
      drawWaypointPin(g, sx(wpPos.x), sz(wpPos.z), waypointMapLabel(wp), w, objectivePlacement);
    }

    // Edge ticks: keyed marks pinned to the frame edge in the true direction of anything
    // important outside the view. Each is a live click target (inspect without panning).
    for (const tick of edgeTicks) {
      drawEdgeTick(g, tick.x, tick.y, tick.color, tick.shape);
      if (tick.target && tick.target.kind) {
        this._clickTargets.push({
          ...tick.target,
          sx: tick.x,
          sy: tick.y,
          radiusPx: 13,
          edgeTick: true,
        });
      }
    }
  },
};

function drawUniqueWreckBearingMarker(g, x, y, radiusPx, options = {}) {
  if (!g || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const fixed = options.fixed === true;
  const salvaged = options.phase === 'salvaged';
  const selected = options.selected === true;
  const color = salvaged ? hexToRgba(INK.gold, 0.58) : INK.gold;
  g.save();
  g.strokeStyle = color;
  g.fillStyle = salvaged ? hexToRgba(INK.gold, 0.08) : hexToRgba(INK.gold, 0.11);

  if (!fixed) {
    const rr = Math.max(12, Math.min(Math.abs(Number(radiusPx) || 0), 4096));
    g.lineWidth = selected ? 2 : 1.4;
    g.setLineDash([7, 6]);
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); g.stroke();
    g.setLineDash([]);
    // Sparse survey ticks make this read as an uncertainty region, not a normal hazard circle.
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const ax = Math.cos(angle), ay = Math.sin(angle);
      g.beginPath();
      g.moveTo(x + ax * (rr - 4), y + ay * (rr - 4));
      g.lineTo(x + ax * (rr + 4), y + ay * (rr + 4));
      g.stroke();
    }
  } else {
    const size = 7;
    g.lineWidth = selected ? 2.2 : 1.6;
    g.beginPath();
    g.moveTo(x, y - size);
    g.lineTo(x + size, y);
    g.lineTo(x, y + size);
    g.lineTo(x - size, y);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath(); g.arc(x, y, selected ? 15 : 11, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.stroke();
  }
  g.restore();
}

// ---------------------------------------------------------------------------------------------
// Keyed silhouettes — the survey table's glyph language. Constant screen size, stroke-drawn,
// deterministic. Each object class reads at a glance: brass plate = station, teal ring = gate,
// amber cross = point of interest, chevron = ship, open red diamond = hostile, rock = asteroid.
// ---------------------------------------------------------------------------------------------

/** Station: chamfered brass plate with a center pip — a building, never a dot. */
/**
 * Station: a berth ring with mooring arms.
 *
 * Was a chamfered square with a centre pip — legible, but it said "generic facility", and at 11px
 * it was the same visual weight as everything else on the table. A station is a place you dock, so
 * it is drawn as a hub with arms you could tie up to: a brass ring, a dark core, and four short
 * mooring stubs on the diagonals. The diagonals matter — they keep the arms clear of the label
 * plate, which always sits on an axis.
 */
function drawStationMark(g, x, y) {
  const r = 4.6;
  g.save();
  // Mooring arms first, so the ring overlaps their inner ends cleanly.
  g.strokeStyle = INK.brass;
  g.lineWidth = 1.5;
  g.lineCap = 'butt';
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + i * (Math.PI / 2);
    const ca = Math.cos(a), sa = Math.sin(a);
    g.beginPath();
    g.moveTo(x + ca * (r - 0.4), y + sa * (r - 0.4));
    g.lineTo(x + ca * (r + 3.1), y + sa * (r + 3.1));
    g.stroke();
  }
  // Hub: a filled well so the ring reads as a rim, not an outline.
  g.fillStyle = 'rgba(10, 12, 13, 0.92)';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = INK.brass;
  g.lineWidth = 1.7;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.fillStyle = INK.brass;
  g.beginPath(); g.arc(x, y, 1.5, 0, Math.PI * 2); g.fill();
  g.restore();
}

/**
 * Gate: an aperture with jaws, opening along its link.
 *
 * Was a plain teal circle with one tick, which read as "small planet" as often as "door". A gate is
 * a threshold you pass THROUGH, so the ring is now broken on the axis of travel and two jaws frame
 * the opening — the mark itself shows you the way through, and the direction is legible without the
 * tick having to carry it alone.
 */
function drawGateMark(g, g_x, g_y, angle = 0) {
  const x = g_x, y = g_y, r = 5.4;
  const gap = 0.66; // half-width of the mouth, in radians
  g.save();
  g.strokeStyle = INK.teal;
  g.lineWidth = 1.7;
  g.lineCap = 'round';
  // Two opposing arcs with the mouth open on the travel axis — a threshold seen edge-on. Rotating
  // this is safe because both halves are symmetric about that axis; an earlier version hung jaws
  // off one end only, which read as a portal pointing down but as a slashed circle pointing right.
  g.beginPath(); g.arc(x, y, r, angle + gap, angle + Math.PI - gap); g.stroke();
  g.beginPath(); g.arc(x, y, r, angle + Math.PI + gap, angle + Math.PI * 2 - gap); g.stroke();
  // Direction: one tick leaving the mouth along the link. The arcs say "aperture", this says
  // "and it goes that way".
  const ca = Math.cos(angle), sa = Math.sin(angle);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x + ca * 2.6, y + sa * 2.6);
  g.lineTo(x + ca * (r + 3.2), y + sa * (r + 3.2));
  g.stroke();
  g.restore();
}

/**
 * Point of interest: a survey cross with an open centre.
 *
 * A bare plus sign is the single most generic mark available. Breaking the centre and adding fine
 * end serifs turns it into a surveyor's register mark — the same drafting vocabulary as the corner
 * registration on the table, so the family reads as one instrument.
 */
function drawPoiMark(g, x, y) {
  const arm = 4.6, inner = 1.5;
  g.save();
  g.strokeStyle = INK.amber;
  g.lineWidth = 1.2;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    g.beginPath();
    g.moveTo(x + dx * inner, y + dy * inner);
    g.lineTo(x + dx * arm, y + dy * arm);
    g.stroke();
  }
  // End serifs across the two horizontal arms — enough to key it, not enough to shout.
  g.lineWidth = 1;
  for (const dx of [1, -1]) {
    g.beginPath();
    g.moveTo(x + dx * arm, y - 1.5);
    g.lineTo(x + dx * arm, y + 1.5);
    g.stroke();
  }
  g.restore();
}

function drawManufacturedTravelRoute(g, route, sx, sz, useDrawFrame) {
  if (!route || typeof sx !== 'function' || typeof sz !== 'function') return;
  const from = useDrawFrame ? route.drawFrom : route.from;
  const support = useDrawFrame ? route.drawSupport : route.support;
  const to = useDrawFrame ? route.drawTo : route.to;
  if (!from || !support || !to) return;
  const ax = sx(from.x), ay = sz(from.z);
  const mx = sx(support.x), my = sz(support.z);
  const bx = sx(to.x), by = sz(to.z);
  if (![ax, ay, mx, my, bx, by].every(Number.isFinite)) return;

  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (!(length > 0.5)) return;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const dash = route.lineStyle === 'long-dash'
    ? [9, 6]
    : route.lineStyle === 'short-dash' ? [2, 5] : [];

  g.save();
  g.strokeStyle = hexToRgba(route.color || INK.teal, route.operational ? 0.82 : 0.62);
  g.lineWidth = route.operational ? 2 : 1.5;
  g.setLineDash(dash);
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(mx, my);
  g.lineTo(bx, by);
  g.stroke();

  // Solid endpoint bars make the drawn extent explicit; dash cadence carries operating state
  // without relying on color, and the fixed chevron communicates the ring-to-station direction.
  g.setLineDash([]);
  g.beginPath();
  g.moveTo(ax - nx * 5, ay - ny * 5);
  g.lineTo(ax + nx * 5, ay + ny * 5);
  g.moveTo(bx - nx * 5, by - ny * 5);
  g.lineTo(bx + nx * 5, by + ny * 5);
  g.stroke();

  const arrowX = ax + dx * 0.72;
  const arrowY = ay + dy * 0.72;
  g.beginPath();
  g.moveTo(arrowX - ux * 6 + nx * 4, arrowY - uy * 6 + ny * 4);
  g.lineTo(arrowX, arrowY);
  g.lineTo(arrowX - ux * 6 - nx * 4, arrowY - uy * 6 - ny * 4);
  g.stroke();
  g.restore();
}

/** Neutral ship: a heading chevron in quiet ink. */
function drawShipChevron(g, x, y, rot, color) {
  g.save();
  g.translate(x, y);
  g.rotate(Math.PI + (rot || 0));
  g.fillStyle = color || INK.ink1;
  g.beginPath();
  g.moveTo(5, 0); g.lineTo(-4, -3.2); g.lineTo(-2.4, 0); g.lineTo(-4, 3.2);
  g.closePath(); g.fill();
  g.restore();
}

/**
 * THE PLAYER MARK — the one thing on this chart that must never disappear, at any scale.
 *
 * Drawn as a distinct silhouette rather than a recoloured contact chevron: at GALAXY scale the ship
 * sits among sector sigils and faction nodes, so a mark that differs only in colour is exactly the
 * "colour alone" failure the identity forbids, and at LOCAL scale it must still not be mistaken for
 * one of a hundred contacts. The shape is a heading triangle inside an open ring with four
 * registration ticks — a surveyor's fix mark. It reads at 1x, it reads in forced-colors, and it
 * reads for a colour-blind pilot.
 *
 * `scale` is the only knob: the mark keeps its PIXEL size across scales on purpose. Something that
 * shrinks with the chart is not a "never disappears" guarantee, it is a guarantee that it eventually
 * disappears.
 */
function drawPlayerFixMark(g, x, y, rot, options = {}) {
  const scale = Number.isFinite(options.scale) ? options.scale : 1;
  const pulse = Number.isFinite(options.pulse) ? options.pulse : 0;
  const r = 9 * scale;
  g.save();
  g.translate(x, y);

  // Outer ring, plus a slow breathing halo so the eye finds it on a busy chart without motion
  // becoming decoration. `pulse` is fed 0 when motionReduce is on, which flattens this to a plain
  // ring rather than removing the mark.
  if (pulse > 0) {
    g.strokeStyle = hexToRgba(INK.ink0, 0.13 * pulse);
    g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, r + 3 + pulse * 3.5, 0, Math.PI * 2); g.stroke();
  }
  g.strokeStyle = 'rgba(237, 232, 216, 0.92)';
  g.lineWidth = 1.2 * scale;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();

  // Registration ticks at the cardinals — the surveyor's-instrument tell, and a second
  // non-colour cue that this ring is the fix mark and not a scan ring or a zone edge.
  g.lineWidth = 1 * scale;
  for (let i = 0; i < 4; i += 1) {
    const a = (Math.PI / 2) * i;
    const ix = Math.cos(a), iy = Math.sin(a);
    g.beginPath();
    g.moveTo(ix * (r + 1.5), iy * (r + 1.5));
    g.lineTo(ix * (r + 4.5 * scale), iy * (r + 4.5 * scale));
    g.stroke();
  }

  // Heading triangle. Same `Math.PI + rot` convention as every other oriented mark on this canvas.
  g.rotate(Math.PI + (rot || 0));
  g.fillStyle = INK.ink0;
  g.strokeStyle = 'rgba(12, 14, 15, 0.85)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(6 * scale, 0);
  g.lineTo(-4.2 * scale, -3.6 * scale);
  g.lineTo(-2.2 * scale, 0);
  g.lineTo(-4.2 * scale, 3.6 * scale);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

/**
 * THE NAVIGATION CARTOUCHE — the four always-present answers, painted on the chart itself.
 *
 * Deliberately NOT a DOM panel. ADR D9.9 rejects new permanent panels outright: the reported
 * density paradox ("too little useful information, yet crowded") is a progressive-disclosure
 * failure, and a fifth rail would make it worse. A cartouche is what a paper survey chart already
 * has — the block in the corner that tells you what you are looking at — so this is in-identity
 * furniture rather than added UI, it costs no layout, and it cannot push the chart smaller.
 *
 * Tone maps to colour AND to a leading glyph AND to weight, never to colour alone:
 *   TRACKED -> filled brass tick + bright ink   (the only tone permitted bright gold)
 *   PLAIN   -> hairline tick + normal ink
 *   MUTED   -> open dash + dimmed ink
 */
/**
 * The cartouche's geometry, derived in ONE place so the drawer and the label declutterer cannot
 * disagree about where it is. A reserved rectangle that drifted from the plate it describes would
 * silently reintroduce the marker-overlap defect it exists to prevent.
 *
 * Returns null when the chart is too small to carry a cartouche at all.
 */
function navCartoucheBounds(rowCount, w, h) {
  if (!(rowCount > 0)) return null;
  const rowH = 26;
  const padX = 12;
  const padY = 10;
  const boxW = Math.min(300, Math.max(212, w * 0.26));
  const boxH = padY * 2 + rowCount * rowH;
  // A chart this narrow has nowhere to put a cartouche without covering the marks it describes.
  // Withholding it is better than occluding the thing the pilot is reading.
  if (w < 420 || h < boxH + 90) return null;
  return { x: 14, y: h - boxH - 14, width: boxW, height: boxH, rowH, padX, padY };
}

function drawNavCartouche(g, rows, w, h, options = {}) {
  if (!Array.isArray(rows) || !rows.length) return;
  const bounds = navCartoucheBounds(rows.length, w, h);
  if (!bounds) return;
  const { rowH, padX, padY, width: boxW, height: boxH, x: x0, y: y0 } = bounds;

  g.save();
  g.translate(x0, y0);

  // Plate: the same opaque warm near-black the inspector and header plates use, so the cartouche
  // reads as part of the instrument rather than as an overlay floating above it.
  g.fillStyle = INK.plateHard;
  g.strokeStyle = INK.plateEdge;
  g.lineWidth = 1;
  g.beginPath();
  g.rect(0.5, 0.5, boxW - 1, boxH - 1);
  g.fill();
  g.stroke();

  // Brass index rule down the binding edge — the cartouche's one ornament.
  g.fillStyle = INK.brass;
  g.fillRect(0.5, 0.5, 2, boxH - 1);

  let y = padY;
  for (const row of rows) {
    const tracked = row.tone === NAV_ROW_TONE.TRACKED;
    const muted = row.tone === NAV_ROW_TONE.MUTED;

    // Leading glyph — the non-colour half of the tone signal.
    g.save();
    const gy = y + 7;
    if (tracked) {
      g.fillStyle = INK.amberHot;
      g.fillRect(padX - 4, gy - 2.5, 5, 5);
    } else if (muted) {
      g.strokeStyle = INK.ink2;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(padX - 4, gy); g.lineTo(padX + 1, gy); g.stroke();
    } else {
      g.strokeStyle = INK.ink1;
      g.lineWidth = 1;
      g.strokeRect(padX - 3.5, gy - 2, 4, 4);
    }
    g.restore();

    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = FONT_MONO(500, 8);
    g.fillStyle = INK.ink2;
    g.fillText(row.label, padX + 8, y);

    g.font = FONT_DISPLAY(600, 11.5);
    g.fillStyle = tracked ? INK.amberHot : (muted ? INK.ink2 : INK.ink0);
    g.fillText(fitCartoucheText(g, row.value, boxW - padX * 2 - 10), padX + 8, y + 10);

    if (row.detail) {
      g.font = FONT_MONO(500, 8);
      g.fillStyle = INK.ink2;
      const detailW = g.measureText(row.detail).width;
      // Detail is right-aligned against the plate edge so the four value strings stay on one
      // reading column no matter how long each detail happens to be.
      if (detailW < boxW - padX * 2 - 90) {
        g.textAlign = 'right';
        g.fillText(row.detail, boxW - padX, y + 1);
        g.textAlign = 'left';
      }
    }
    y += rowH;
  }

  if (options.title) {
    g.font = FONT_MONO(500, 7.5);
    g.fillStyle = INK.ink2;
    g.textAlign = 'right';
    g.textBaseline = 'bottom';
    g.fillText(options.title, boxW - padX, boxH - 3);
  }
  g.restore();
}

/** Ellipsize to a pixel budget. A cartouche that overflows its plate is worse than a short label. */
function fitCartoucheText(g, text, maxWidth) {
  const s = String(text == null ? '' : text);
  if (!s) return '';
  if (g.measureText(s).width <= maxWidth) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (g.measureText(`${s.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, Math.max(1, lo))}…`;
}

/** Hostile: a red open diamond, rotated to heading — threat reads before color-blind shape. */
function drawHostileMark(g, x, y, rot) {
  g.save();
  g.translate(x, y);
  g.rotate(Math.PI + (rot || 0));
  g.strokeStyle = INK.red;
  g.fillStyle = hexToRgba(INK.red, 0.16);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(5.5, 0); g.lineTo(0, -4); g.lineTo(-5.5, 0); g.lineTo(0, 4);
  g.closePath();
  g.fill(); g.stroke();
  g.restore();
}

/** Asteroid: a deterministic irregular polygon keyed by id — a rock, never a circle. */
function drawAsteroidMark(g, x, y, seedId) {
  const seed = cosmeticHash01(String(seedId || 'rock'));
  const verts = 5 + Math.floor(seed * 3);
  g.save();
  g.fillStyle = 'rgba(142, 134, 117, 0.40)';
  g.strokeStyle = 'rgba(142, 134, 117, 0.70)';
  g.lineWidth = 0.8;
  g.beginPath();
  for (let i = 0; i < verts; i += 1) {
    const a = (i / verts) * Math.PI * 2 + seed * Math.PI;
    const r = 2.4 + cosmeticHash01(String(seedId) + ':' + i) * 1.8;
    const vx = x + Math.cos(a) * r;
    const vy = y + Math.sin(a) * r;
    if (i === 0) g.moveTo(vx, vy);
    else g.lineTo(vx, vy);
  }
  g.closePath();
  g.fill(); g.stroke();
  g.restore();
}

/**
 * Pull a keyed hue toward light so it survives at glyph scale.
 *
 * Faction colours were authored to read as broad fills. As a 1.9px orbit line they lose most of
 * their identity against the near-black table — deep blues in particular go to mud. Lifting them
 * keeps the faction legible without touching the authored palette itself.
 */
function liftHue(hex, amount) {
  const s = String(hex || '').replace('#', '');
  if (s.length !== 6) return INK.ink1;
  const t = Math.max(0, Math.min(1, amount));
  const up = (c) => Math.round(c + (255 - c) * t);
  const r = parseInt(s.slice(0, 2), 16);
  const gg = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if (![r, gg, b].every(Number.isFinite)) return INK.ink1;
  const hx = (v) => up(v).toString(16).padStart(2, '0');
  return '#' + hx(r) + hx(gg) + hx(b);
}

/**
 * SECTOR SIGIL — a sector is a star system, so it is drawn as one.
 *
 * Replaces the flat faction-coloured disc. The disc could only ever say one thing at a time, so
 * every additional fact (owner, security, selection, "you are here") became another concentric ring
 * at another radius, and the node degenerated into a bullseye. Here the facts are carried by
 * different FORMS instead of stacked radii:
 *
 *   orbit hue      → who holds the sector
 *   bead count     → berths the pilot can actually dock at
 *   broken orbit   → lawless space; the lane itself is not intact
 *   unrest arc     → danger, drawn ONLY above the threshold. Chart convention is to mark hazards,
 *                    not safety, so a calm sector is silent and the eye stops only at trouble.
 *
 * Inclination, ellipse squash and bead phase are all seeded from the sector id via `cosmeticHash01`,
 * so a field of two dozen reads as a hand-plotted survey rather than the same icon stamped 24 times.
 * Deterministic and cosmetic — never fed into sim.
 *
 * Not cached: GALAXY draws ~24 of these on the 64 ms inspector cadence (the display-refresh path is
 * LOCAL-only), so an offscreen tile cache would cost more in bookkeeping than it saves.
 */
function drawSectorSigil(g, x, y, opts) {
  const o = opts || {};
  const r = Number.isFinite(o.radius) ? o.radius : 13;
  const seedId = String(o.seedId || 'sector');
  const stale = !!o.stale;
  const dim = stale ? 0.45 : 1;
  const security = Math.max(0, Math.min(1, Number.isFinite(o.security) ? o.security : 1));

  // The well. It must sit a value ABOVE the table or the whole sigil dissolves into the ground —
  // a lit dish, not a hole.
  g.save();
  const dish = g.createRadialGradient(x, y - r * 0.3, 1, x, y, r + 1);
  dish.addColorStop(0, 'rgba(34, 39, 44, 0.97)');
  dish.addColorStop(1, 'rgba(22, 26, 29, 0.97)');
  g.fillStyle = dish;
  g.beginPath(); g.arc(x, y, r + 1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(190, 178, 152, 0.30)';
  g.lineWidth = 1; g.stroke();
  g.restore();

  const incl = -0.28 - cosmeticHash01(seedId + ':incl') * 0.60;
  const squash = 0.28 + cosmeticHash01(seedId + ':squash') * 0.24;
  const orbR = r - 2.4;
  const orbitColor = o.factionColor ? liftHue(o.factionColor, 0.22) : INK.ink1;

  g.save();
  g.translate(x, y);
  g.rotate(incl);
  // A dark rule under the orbit gives it engraved relief against the dish.
  g.strokeStyle = 'rgba(6, 8, 9, 0.90)';
  g.lineWidth = 3.3;
  g.beginPath(); g.ellipse(0, 0, orbR, orbR * squash, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = hexToRgba(orbitColor, 0.95 * dim);
  g.lineWidth = 1.9;
  if (security < 0.28) g.setLineDash([2.4, 2.2]);
  g.beginPath(); g.ellipse(0, 0, orbR, orbR * squash, 0, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  const beads = Math.max(0, Math.min(4, Math.round(Number(o.berths) || 0)));
  for (let i = 0; i < beads; i += 1) {
    const a = cosmeticHash01(seedId + ':berth' + i) * Math.PI * 2;
    const bx = Math.cos(a) * orbR;
    const by = Math.sin(a) * (orbR * squash);
    g.fillStyle = 'rgba(6, 8, 9, 0.95)';
    g.beginPath(); g.arc(bx, by, 2.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = stale ? hexToRgba(INK.brass, 0.5) : INK.brass;
    g.beginPath(); g.arc(bx, by, 1.7, 0, Math.PI * 2); g.fill();
  }
  g.restore();

  // The primary: a dense pip with a hairline corona. Deliberately quiet — the orbit carries the eye,
  // and an oversized starburst here reads as a generic sparkle rather than a sun.
  g.save();
  g.fillStyle = 'rgba(6, 8, 9, 0.90)';
  g.beginPath(); g.arc(x, y, 3.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = stale ? 'rgba(160, 156, 144, 0.90)' : INK.ink0;
  g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = hexToRgba(INK.amberHot, 0.38 * dim);
  g.lineWidth = 0.75;
  g.beginPath(); g.arc(x, y, 4.1, 0, Math.PI * 2); g.stroke();
  g.restore();

  // Unrest: silent below the threshold, then an arc whose sweep AND weight both track severity.
  if (o.showUnrest !== false) {
    const danger = 1 - security;
    if (danger > 0.20) {
      g.save();
      g.strokeStyle = hexToRgba(danger > 0.66 ? INK.red : INK.warn, 0.92 * dim);
      g.lineWidth = 1.2 + danger * 1.8;
      g.beginPath();
      g.arc(x, y, r + 3.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, danger));
      g.stroke();
      g.restore();
    }
  }
}

/** Edge tick: a small keyed tab pinned to the frame for an important off-view object. */
function drawEdgeTick(g, x, y, color, shape) {
  g.save();
  g.strokeStyle = color;
  g.fillStyle = hexToRgba(color, 0.16);
  g.lineWidth = 1.3;
  if (shape === 'gate') {
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.stroke();
  } else if (shape === 'station') {
    const s = 3.4;
    g.beginPath();
    g.moveTo(x - s + 1, y - s); g.lineTo(x + s - 1, y - s); g.lineTo(x + s, y - s + 1);
    g.lineTo(x + s, y + s - 1); g.lineTo(x + s - 1, y + s); g.lineTo(x - s + 1, y + s);
    g.lineTo(x - s, y + s - 1); g.lineTo(x - s, y - s + 1);
    g.closePath(); g.fill(); g.stroke();
  } else if (shape === 'claim') {
    g.beginPath();
    g.moveTo(x, y - 4.4); g.lineTo(x + 4.4, y); g.lineTo(x, y + 4.4); g.lineTo(x - 4.4, y);
    g.closePath(); g.fill(); g.stroke();
  } else if (shape === 'waypoint') {
    g.beginPath();
    g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y);
    g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke();
  } else if (shape === 'bearing') {
    g.setLineDash([2, 2]);
    g.beginPath(); g.arc(x, y, 4.4, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
  } else {
    // hostile / contact: open diamond
    g.beginPath();
    g.moveTo(x + 4.4, y); g.lineTo(x, y - 3.2); g.lineTo(x - 4.4, y); g.lineTo(x, y + 3.2);
    g.closePath(); g.fill(); g.stroke();
  }
  g.restore();
}

/** Service pictograms under stations: tiny stroke icons sharing the DOM chip language. */
function drawServicePictograms(g, cx, cy, services) {
  if (!g || !services || !services.length) return;
  const size = 10;
  const gap = 2;
  const totalW = services.length * size + (services.length - 1) * gap;
  let x = cx - totalW / 2 + size / 2;
  g.save();
  for (const svc of services) {
    g.strokeStyle = 'rgba(86, 187, 178, 0.55)';
    g.fillStyle = INK.plateHard;
    g.lineWidth = 0.8;
    g.beginPath(); g.rect(x - size / 2, cy - size / 2, size, size); g.fill(); g.stroke();
    drawServicePictogram(g, svc, x, cy, 3.4, INK.teal);
    x += size + gap;
  }
  g.restore();
}

/** One service pictogram, canvas twin of the DOM chip SVGs. */
function drawServicePictogram(g, svc, x, y, r, color) {
  const key = String(svc || '').toLowerCase();
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 1;
  switch (key) {
    case 'trade':
      g.beginPath(); g.arc(x, y, r * 0.8, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x, y - r * 0.45); g.lineTo(x, y + r * 0.45); g.stroke();
      break;
    case 'shipyard':
      g.beginPath();
      g.moveTo(x - r, y + r * 0.6); g.lineTo(x - r, y - r * 0.4); g.lineTo(x, y - r);
      g.lineTo(x + r, y - r * 0.4); g.lineTo(x + r, y + r * 0.6);
      g.stroke();
      break;
    case 'repair':
      g.beginPath(); g.moveTo(x - r * 0.7, y + r * 0.7); g.lineTo(x + r * 0.7, y - r * 0.7); g.stroke();
      g.beginPath(); g.arc(x + r * 0.55, y - r * 0.55, r * 0.4, 0, Math.PI * 2); g.stroke();
      break;
    case 'refuel':
      g.beginPath();
      g.moveTo(x, y - r);
      g.lineTo(x + r * 0.7, y + r * 0.3);
      g.arc(x, y + r * 0.3, r * 0.7, 0, Math.PI, false);
      g.closePath(); g.stroke();
      break;
    case 'refine':
      g.beginPath();
      g.moveTo(x - r, y - r * 0.5); g.lineTo(x + r, y - r * 0.5); g.lineTo(x + r * 0.4, y + r); g.lineTo(x - r * 0.4, y + r);
      g.closePath(); g.stroke();
      break;
    case 'missions':
      g.beginPath();
      g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y);
      g.closePath(); g.stroke();
      break;
    case 'ore_buy':
      g.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
        const vx = x + Math.cos(a) * r * 0.9;
        const vy = y + Math.sin(a) * r * 0.9;
        if (i === 0) g.moveTo(vx, vy);
        else g.lineTo(vx, vy);
      }
      g.closePath(); g.stroke();
      break;
    case 'black_market':
      g.beginPath();
      g.moveTo(x - r, y - r * 0.6); g.lineTo(x + r, y - r * 0.6); g.lineTo(x, y + r);
      g.closePath(); g.stroke();
      break;
    case 'module_craft':
      g.beginPath(); g.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6); g.stroke();
      g.beginPath();
      g.moveTo(x, y - r * 0.45); g.lineTo(x, y + r * 0.45);
      g.moveTo(x - r * 0.45, y); g.lineTo(x + r * 0.45, y);
      g.stroke();
      break;
    case 'scan':
      g.beginPath(); g.arc(x, y, r * 0.7, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      g.moveTo(x, y - r); g.lineTo(x, y - r * 0.4);
      g.moveTo(x, y + r * 0.4); g.lineTo(x, y + r);
      g.moveTo(x - r, y); g.lineTo(x - r * 0.4, y);
      g.moveTo(x + r * 0.4, y); g.lineTo(x + r, y);
      g.stroke();
      break;
    default:
      g.font = FONT_MONO(700, 7);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(key || '?')[0].toUpperCase(), x, y + 0.5);
  }
  g.restore();
}

// glyph helpers
function hazardTypeGlyph(type) {
  switch (type) {
    case 'radiation': return '☢';
    case 'nebula': return '✦';
    case 'dense_asteroid': return '◈';
    case 'debris': return '⚙';
    default: return '!';
  }
}

function asteroidOreGlyph(typeId) {
  switch (typeId) {
    case 'ast_metallic': return 'Fe';
    case 'ast_icy': return 'H₂O';
    case 'ast_crystalline': return 'Cr';
    case 'ast_gas_cloud': return 'Gas';
    case 'ast_rare_exotic': return 'Xe';
    default: return 'Si';
  }
}

function hexToRgba(hex, alpha) {
  const s = String(hex || '').replace('#', '');
  if (s.length !== 6) return 'rgba(136,153,170,' + alpha + ')';
  const r = parseInt(s.slice(0, 2), 16), gg = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
  if (![r, gg, b].every(Number.isFinite)) return 'rgba(136,153,170,' + alpha + ')';
  return 'rgba(' + r + ',' + gg + ',' + b + ',' + alpha + ')';
}

/** Blend a keyed hue toward the warm ink so classification survives without primary-color glare. */
function mutedZoneColor(hex, amount = 0.45) {
  const s = String(hex || '').replace('#', '');
  if (s.length !== 6) return INK.ink1;
  const r = parseInt(s.slice(0, 2), 16), gg = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
  if (![r, gg, b].every(Number.isFinite)) return INK.ink1;
  const t = Math.max(0, Math.min(1, amount));
  const mix = (c, d) => Math.round(c + (d - c) * t);
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return '#' + toHex(mix(r, 179)) + toHex(mix(gg, 175)) + toHex(mix(b, 162));
}

/** Octant bearing for disambiguating same-named gates on the survey table (N/NE/E…). */
function compassOctant(dx, dz) {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return '';
  // North is -Z, matching the chart rather than the world: `sz()` maps world +Z to increasing screen
  // y, so -Z is the top of the table and that is the bearing a pilot reads as "north" here.
  const angle = Math.atan2(dx, -dz);
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return dirs[idx];
}

/**
 * When several gates share a display name (continuous residency can keep neighbour-sector twins
 * on-screen), append a compass octant so the table stays legible without inventing new names.
 */
function disambiguateGateLabel(name, x, z, originX, originZ, nameCounts) {
  const base = String(name || 'Gate');
  if (!nameCounts || (nameCounts.get(base) || 0) < 2) return base;
  const bearing = compassOctant((Number(x) || 0) - (Number(originX) || 0), (Number(z) || 0) - (Number(originZ) || 0));
  return bearing ? `${base} · ${bearing}` : base;
}

function makeMapLabelCandidate(g, candidate) {
  const lines = (Array.isArray(candidate.lines) ? candidate.lines : [candidate.text])
    .map((line) => String(line || '').replace(/\s+/g, ' ').trim().slice(0, 36))
    .filter(Boolean)
    .slice(0, 3);
  let width = 0;
  if (g && g.measureText) {
    g.save();
    g.font = FONT_MONO(700, 9);
    for (const line of lines) width = Math.max(width, g.measureText(line).width);
    g.restore();
  } else {
    for (const line of lines) width = Math.max(width, line.length * 6);
  }
  return {
    ...candidate,
    text: lines[0] || String(candidate.text || ''),
    lines,
    width: Math.ceil(width) + 10,
    height: lines.length * 11 + 6,
  };
}

function drawMapLabelBlock(g, placement) {
  if (!placement || !placement.visible) return;
  const lines = Array.isArray(placement.lines) && placement.lines.length
    ? placement.lines
    : [placement.text];
  const color = placement.color || INK.ink0;
  g.save();
  g.fillStyle = placement.objective ? INK.plateHard : INK.plate;
  g.strokeStyle = placement.objective ? 'rgba(237, 232, 216, 0.9)' : hexToRgba(color, 0.55);
  g.lineWidth = placement.objective ? 1.4 : 1;
  g.beginPath();
  g.rect(placement.x, placement.y, placement.width, placement.height);
  g.fill();
  g.stroke();
  g.textAlign = 'left';
  g.textBaseline = 'top';
  for (let index = 0; index < lines.length; index += 1) {
    g.font = index === 0 ? FONT_MONO(700, 9) : FONT_MONO(400, 8);
    g.fillStyle = index === 0
      ? color
      : (index === lines.length - 1 && placement.secondaryColor
        ? placement.secondaryColor
        : 'rgba(179, 175, 162, 0.85)');
    g.fillText(lines[index], placement.x + 5, placement.y + 3 + index * 11);
  }
  g.restore();
}

function waypointMapLabel(wp) {
  const raw = wp && (wp.mapLabel || wp.label || wp.reason || wp.sectorName || 'Waypoint');
  const label = String(raw || 'Waypoint').replace(/\s+/g, ' ').trim();
  return (label || 'Waypoint').slice(0, 28);
}

/**
 * Secondary mission mark — one of several points a contract wants visited (`missionMapGeometry`).
 *
 * Deliberately smaller and quieter than the goal pin so a multi-point contract reads as "the
 * objective, plus these" instead of a field of competing objectives. Keyed by role so the pilot can
 * tell a spawned target from a survey site from a signal source without a label. Completed points
 * hollow out and take a strike rather than disappearing, so progress stays legible.
 */
function drawMissionPoint(g, x, y, kind, done) {
  const r = 5;
  g.save();
  g.lineWidth = 1.1;
  g.strokeStyle = done ? INK.ink2 : INK.amber;
  g.fillStyle = g.strokeStyle;
  if (done) g.globalAlpha = 0.5;
  if (kind === 'signal') {
    // Signal source: broadcast arcs opening away from the mark.
    for (let i = 1; i <= 2; i += 1) {
      g.beginPath();
      g.arc(x, y, r * i * 0.72, -Math.PI * 0.78, -Math.PI * 0.22);
      g.stroke();
    }
    g.beginPath(); g.arc(x, y, 1.3, 0, Math.PI * 2); g.fill();
  } else if (kind === 'sample') {
    // Survey site: cross inside a ring.
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    g.moveTo(x - r + 1.6, y); g.lineTo(x + r - 1.6, y);
    g.moveTo(x, y - r + 1.6); g.lineTo(x, y + r - 1.6);
    g.stroke();
  } else {
    // Spawn-tagged target: open square with a centre pip.
    g.strokeRect(x - r, y - r, r * 2, r * 2);
    g.beginPath(); g.arc(x, y, 1.3, 0, Math.PI * 2); g.fill();
  }
  if (done) {
    g.beginPath();
    g.moveTo(x - r - 1, y + r + 1); g.lineTo(x + r + 1, y - r - 1);
    g.stroke();
  }
  g.restore();
}

function drawMapGoalMarker(g, x, y, label, viewportWidth = Infinity) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const text = `GOAL · ${String(label || 'OBJECTIVE').toUpperCase().slice(0, 22)}`;
  g.save();
  // An acquisition BEZEL, not a lid. This used to fill an opaque plate and a solid amber diamond
  // straight over the node, which meant the one sector the player cares most about was the one
  // sector whose sigil they could not read — the goal hid the very thing it was pointing at. The
  // ring now frames the sigil at a radius that clears it, and the diamond rides the top of that
  // ring as a badge. Salience is unchanged (same amber, same white keyline, same footprint); it is
  // simply arranged around the node instead of on top of it.
  const ringR = 17;
  g.strokeStyle = INK.plateHard;
  g.lineWidth = 5;
  g.beginPath(); g.arc(x, y, ringR, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = INK.amberHot;
  g.lineWidth = 2;
  g.beginPath(); g.arc(x, y, ringR, 0, Math.PI * 2); g.stroke();
  // Acquisition ticks on the diagonals — reads as a locked reticle rather than a plain circle.
  g.lineWidth = 2;
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + i * (Math.PI / 2);
    const ca = Math.cos(a), sa = Math.sin(a);
    g.beginPath();
    g.moveTo(x + ca * (ringR - 3.5), y + sa * (ringR - 3.5));
    g.lineTo(x + ca * (ringR + 3.5), y + sa * (ringR + 3.5));
    g.stroke();
  }
  // The badge: a filled amber diamond sitting on the crown of the bezel.
  const by = y - ringR;
  const d = 6.5;
  g.fillStyle = INK.amberHot;
  g.strokeStyle = 'rgba(237, 232, 216, 0.95)';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(x, by - d);
  g.lineTo(x + d, by);
  g.lineTo(x, by + d);
  g.lineTo(x - d, by);
  g.closePath();
  g.fill();
  g.stroke();
  g.font = FONT_MONO(700, 10);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const width = g.measureText ? g.measureText(text).width : 0;
  const labelX = Number.isFinite(viewportWidth)
    ? clampMapLabelX(width, x + 21, viewportWidth, 8)
    : x + 21;
  g.strokeStyle = INK.plateHard;
  g.lineWidth = 4;
  g.strokeText(text, labelX, y);
  g.fillStyle = INK.amberHot;
  g.fillText(text, labelX, y);
  g.restore();
}

function drawWaypointPin(g, x, y, label, viewportWidth = Infinity, labelPlacement = null) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  g.save();
  g.strokeStyle = INK.amberHot;
  g.fillStyle = hexToRgba(INK.amberHot, 0.22);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, y - 8);
  g.lineTo(x + 8, y);
  g.lineTo(x, y + 8);
  g.lineTo(x - 8, y);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(x, y, 13, 0, Math.PI * 2);
  g.strokeStyle = hexToRgba(INK.amberHot, 0.88);
  g.lineWidth = 1;
  g.stroke();
  g.strokeStyle = 'rgba(237, 232, 216, 0.9)';
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = INK.amberHot;
  g.font = FONT_MONO(700, 10);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  if (!labelPlacement) {
    const textWidth = g.measureText ? g.measureText(label).width : 0;
    const labelX = Number.isFinite(viewportWidth)
      ? clampMapLabelX(textWidth, x + 12, viewportWidth, 8)
      : x + 12;
    g.strokeStyle = INK.plateHard;
    g.lineWidth = 3;
    g.strokeText(label, labelX, y);
    g.fillText(label, labelX, y);
  }
  g.restore();
  if (labelPlacement) drawMapLabelBlock(g, labelPlacement);
}

function waypointClickTarget(wp, pos, sx, sy) {
  if (!wp || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  const label = waypointMapLabel(wp);
  return {
    sx,
    sy,
    radiusPx: 22,
    kind: 'waypoint',
    objective: true,
    markerKind: wp.markerKind || (wp.missionId || wp.onboarding ? 'mission-objective' : 'navigation'),
    id: 'active-waypoint',
    x: pos.x,
    z: pos.z,
    name: label,
    detail: wp.reason || wp.label || wp.mapLabel || 'Active navigation waypoint',
    missionId: wp.missionId || null,
    targetEntityId: wp.targetEntityId,
    stationId: wp.stationId,
  };
}

export default galaxyMapScreen;
