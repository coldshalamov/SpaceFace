import { navigationFrameHtml } from './views/navigationFrame.js';
import { CSS } from './views/navigationStyles.js';
import { bindMapMarkup, MAP_CONTROLS, mapControlAttrs, mapControlLabel } from './map/mapControlMap.js';
import { MAP_WORKBENCH_CSS } from './map/mapWorkbenchCss.js';
import { injectChartLayouts } from './orrery/chartLayouts.js';
import {
  CHART_INK, chartFont, setTracking, drawBand, drawBandRing, drawBead, drawHandBeam, drawLaneComet,
  drawGlint, drawSensorLattice, drawSectorToken, drawLineReading, drawHoldRing, retrySectorTokens,
  createZoomLever, createTabScale, drawFactionCrest, drawLineReadingLarge, drawPathPulse,
  sectorTokenUrl, factionCrestUrl, drawLabelLeader, trimPolylineSegments,
} from './orrery/chartInstruments.js';
import { placeChartLabels, placeChartCallout } from './orrery/chartLabels.js';
import { dressLampKey } from './orrery/lampKey.js';
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
import { chartMarkSizes } from '../data/modelTruth.js';
import { asteroidScanGlyph } from '../data/mining.js';
import { drawGlyph } from './glyphs.js';
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
import { dpIcon, injectDeckplate } from './deckplate/index.js';
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
import { claimDefenseRating, depotPatrolMarker, DEPOT_PATROL_FACTION_ID } from '../systems/claims.js';
import { bestKnownSellAtStations, knownStationQuotes, AGE_HOLLOW_S } from './marketIntelligence.js';
import { LocalSpaceIntel, projectTrack } from './navigation/localSpaceMapModel.js';
import { buildTradeLanesModel as buildCargoDeckTradeLanesModel } from './navigation/cargoDeck.js';
import { indexedShipLikeScan, indexedTypeScan } from '../world/livingWorldViews.js';

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
  LEVEL_SYSTEM_AT_SPAN_WU,
  LEVEL_LOCAL_AT_SPAN_WU,
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
  formatDurationS,
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
// Canvas ink — the kit's colours (design/frontend/direction/KIT_SPEC.md §3), spelled as literals
// because a 2D context cannot resolve CSS custom properties. The chart is drawn on the sky, so
// there is no ground colour and no plate: bone at three strengths, the hairline, gold for the one
// thing you can act on, red for danger, green for good. The old warm palette (amber / brass / teal
// / gold / warn) collapses onto those six; each key below names which one it became.
// ---------------------------------------------------------------------------------------------
const INK = Object.freeze({
  ink0: '#eae6df',                       // bone — the selected thing, names, live marks
  ink1: 'rgba(234, 230, 223, 0.62)',     // bone 62 % — resting text and marks
  ink2: 'rgba(234, 230, 223, 0.38)',     // bone 38 % — tertiary, stale, muted
  amber: '#f2b950',                      // signal
  amberHot: '#f2b950',                   // signal
  brass: '#eae6df',                      // bone — stations are places, not the Hand (ORRERY §3.3)
  teal: '#eae6df',                       // infrastructure reads in bone, not a second hue
  red: '#ff4d3d',                        // danger
  warn: '#eae6df',                       // bone — caution reads by shape and words; amber is the Hand's
  good: '#9bd8a0',                       // good
  gold: '#eae6df',                       // bone — rumours and bearings are readings, not the Hand
  plate: 'rgba(10, 11, 13, 0)',          // no plates: the sky is the ground
  plateHard: 'rgba(10, 11, 13, 0)',
  plateEdge: 'rgba(234, 230, 223, 0.14)', // hairline
  knock: 'rgba(10, 11, 13, 0.9)',          // the kit's ink (--k-ink) as a knockout halo under a mark
});

// Canvas type — the kit's two faces (self-hosted in styles/fonts.css, loaded at boot).
// Canvas text is text, and INSTRUMENT_GRAMMAR §3 is binding: "12 px is the floor. Nothing renders
// below it, ever." The chart was asking these helpers for 8, 8.5, 9, 10 and 11 px across 29 call
// sites — genuinely unreadable sub-labels on the survey table. Clamping HERE rather than at the call
// sites covers all 29 at once, including the ones that compute a size from a ternary, and it cannot
// be bypassed by a new call site later. The context is only ever scaled by devicePixelRatio
// (setTransform(dpr,0,0,dpr,0,0)), so these numbers are CSS pixels on screen and the clamp is exact.
const TYPE_FLOOR_PX = 12;
const floorPx = (px) => Math.max(TYPE_FLOOR_PX, Number.isFinite(px) ? px : TYPE_FLOOR_PX);
const FONT_MONO = (weight, px) => `${weight} ${floorPx(px)}px "Instrument Sans", system-ui, sans-serif`;
const FONT_UI = (weight, px) => `${weight} ${floorPx(px)}px "Instrument Sans", system-ui, sans-serif`;
const FONT_DISPLAY = (weight, px) => `${weight} ${floorPx(px)}px "Bricolage Grotesque", "Instrument Sans", system-ui, sans-serif`;

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

/**
 * Where the zoom lever's Hand stands for a zoom scalar, in word units along the LOCAL · SYSTEM ·
 * GALAXY scale: each level's framing preset sits under its word; between them the Hand moves
 * linearly in log zoom, and past either end it runs on at the neighbouring slope.
 */
export function leverPositionForZoom(zoom) {
  const lz = Math.log(Math.max(1e-6, Number(zoom) || 1));
  const anchors = ['local', 'system', 'galaxy'].map((level) => Math.log(zoomForSpan(MAP_PRESET_SPAN_WU[level])));
  const seg = lz >= anchors[1] ? 0 : 1;
  const a = anchors[seg];
  const b = anchors[seg + 1];
  if (!(Math.abs(b - a) > 1e-9)) return seg;
  return seg + (lz - a) / (b - a);
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
      // A goal label must stay visible, but "visible" used to mean "pinned to the first offset
      // even when that rect sits on another label or marker". Score every candidate offset and
      // take the least-colliding one; the stable sort keeps the classic right-side placement on
      // ties, so uncluttered charts render exactly as before.
      const proposals = candidateLabelRects(candidate, width, height, collisionGap).map((proposed) => {
        const rect = {
          ...proposed,
          x: Math.max(padding, Math.min(proposed.x, viewportWidth - padding - width)),
          y: Math.max(padding, Math.min(proposed.y, viewportHeight - padding - height)),
        };
        let score = 0;
        for (const box of occupied) {
          if (rectsOverlap(rect, box, collisionGap)) score += 1;
        }
        for (const box of blockers) {
          if (rectsOverlap(rect, box, 1)) score += 1;
        }
        return { rect, score };
      });
      proposals.sort((a, b) => a.score - b.score);
      placed = proposals[0].rect;
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
      || 'Plotted course',
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
    for (const rawId of ids) {
      const e = resolveEntityById(state, rawId);
      if (!e || !e.pos) continue;
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
    for (const e of indexedTypeScan(state, 'stations')) {
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
// A raw identifier is never a name a player may read. The last resort used to return the id
// verbatim, so a sector with no live record and no authored entry printed `sector_helios` — and the
// chart's title rule uppercases, so the screen's hero element read SECTOR_HELIOS, underscore and
// all (design/frontend/THE_BAR.md §3, tell 1). Turn the id into words instead.
function humanizeId(id) {
  const words = String(id)
    .replace(/^(sector|system|zone|place)[_-]/i, '')
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(' ') || String(id);
}

/**
 * The SYSTEM dial's radial scale, in the sector-local frame: inside the gate ring a point at r
 * stands at R·√(r/R) (angles hold; the ring and everything past it stay linear). The draw applies
 * the same map in screen space; this is what a camera must aim at to centre a mark as drawn.
 */
export function warpSectorLocal(p, ringWU) {
  if (!p || !(ringWU > 0)) return p;
  const d = Math.hypot(p.x, p.z);
  if (!(d > 1e-6) || d >= ringWU) return { x: p.x, z: p.z };
  const k = Math.sqrt(ringWU / d);
  return { x: p.x * k, z: p.z * k };
}

function sectorNameOf(state, sectorId) {
  if (!sectorId) return '';
  const live = state && state.world && state.world.sectors && state.world.sectors[sectorId];
  if (live && live.name) return String(live.name);
  const authored = SECTOR_BY_ID.get(sectorId);
  return authored && authored.name ? String(authored.name) : humanizeId(sectorId);
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

function resolveEntityById(state, id) {
  if (!state || id == null) return null;
  const map = state.entities;
  if (map && typeof map.get === 'function') {
    return map.get(id) || map.get(String(id)) || null;
  }
  const wanted = String(id);
  for (const entity of entityIterator(state)) {
    if (entity && String(entity.id) === wanted) return entity;
  }
  return null;
}

function entityIterator(state) {
  if (!state) return [];
  if (Array.isArray(state.entityList)) return state.entityList;
  if (state.entities && typeof state.entities.values === 'function') {
    return Array.from(state.entities.values());
  }
  return [];
}

function visitIndexedLists(lists, fn) {
  for (let l = 0; l < lists.length; l++) {
    const list = lists[l];
    if (!list) continue;
    for (let i = 0; i < list.length; i++) fn(list[i]);
  }
}

function visitClaimMarkerEntities(state, fn) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready === true) {
    if (Array.isArray(index.fx)) {
      visitIndexedLists([index.asteroids, index.stations, index.fx], fn);
    } else {
      visitIndexedLists([index.asteroids, index.stations], fn);
      const list = state.entityList || [];
      for (let i = 0; i < list.length; i++) {
        const entity = list[i];
        if (entity && entity.type === 'fx') fn(entity);
      }
    }
    const dressing = state.world && state.world.dressing;
    const rows = dressing && dressing.rows;
    if (Array.isArray(rows)) {
      for (let i = 0; i < rows.length; i++) fn(rows[i]);
    }
    return;
  }
  visitIndexedLists([entityIterator(state)], fn);
}

function visitLocalChartContacts(state, fn) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && index.ready === true) {
    visitIndexedLists([index.shipLike, index.stations, index.asteroids], fn);
    return;
  }
  visitIndexedLists([entityIterator(state)], fn);
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
  // LAW-09: a claim under a raid warning carries the live defense so the marker can offer the
  // stand-down verb — the map reads truth, it never invents one.
  const defense = body.spec && body.spec.defense;
  return {
    id: `player-claim:${body.id || body.poiId || 'unknown'}`,
    claimId: body.id || null,
    defense: defense && defense.id && defense.phase ? {
      id: defense.id, phase: defense.phase, deadlineAt: defense.deadlineAt || 0,
      attackerName: defense.attackerName || null, attackerCount: defense.attackerCount || 0,
    } : null,
    targetEntityId: liveEntity && liveEntity.id || null,
    kind: def ? `claim-${def.id.replace(/^spec_/, '')}` : 'claim',
    role,
    glyph: def ? def.mapGlyph : '◆',
    color: def ? def.mapColor : INK.gold,
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
  visitClaimMarkerEntities(state, (entity) => {
    const poiId = entity && entity.alive !== false && entity.data && entity.data.poiId;
    if (poiId) liveByPoi.set(poiId, entity);
    const infrastructureId = entity && entity.alive !== false && entity.data
      && entity.data.claimTravelInfrastructureId;
    const part = entity && entity.data && entity.data.claimTravelPart;
    if (infrastructureId && part) liveByInfrastructurePart.set(`${infrastructureId}:${part}`, entity);
  });
  // Depot freight already owns its itinerary; project that same service leg onto the chart.
  const depotRoutes = new Map();
  for (const entry of Object.values(state?.npcJobs?.byId || {})) {
    const job = entry?.job;
    const claimId = job?.payload?.claimDepot?.bodyId;
    if (entry?.sectorId !== sid || job?.kind !== 'hauler' || job.corrupt === true
      || !claimId || !Array.isArray(job.route) || job.route.length !== 2) continue;
    const from = job.route[0]?.pos;
    const to = job.route[1]?.pos;
    if (![from?.x, from?.z, to?.x, to?.z].every(Number.isFinite)) continue;
    depotRoutes.set(claimId, {
      id: job.id,
      claimId,
      operational: true,
      lineStyle: 'long-dash',
      color: INK.ink1,
      from: { x: from.x, z: from.z },
      to: { x: to.x, z: to.z },
      drawFrom: globalToSectorLocalForSector(from, sid),
      drawTo: globalToSectorLocalForSector(to, sid),
    });
  }
  const markers = [];
  // WORLD-37: the depot patrol the claim summoned draws as a moving law presence. One
  // entity scan serves every supported depot: live hulls match by squad id, and the stored
  // post anchor covers a hull that is momentarily unresolvable. Off-sector and lapsed beats
  // yield nothing — the projector returns null, so the marker dies exactly once.
  const wantedPatrols = new Map();
  for (const body of bodies) {
    if (!body || body.owned !== true || body.sectorId !== sid) continue;
    const ds = body.depotSupport;
    const encounterId = ds && ds.patrol && ds.patrol.encounterId;
    if (ds && ds.supported === true && encounterId) wantedPatrols.set(encounterId, body);
  }
  if (wantedPatrols.size) {
    const hullByEncounter = new Map();
    const list = state && Array.isArray(state.entityList) ? state.entityList : [];
    for (const e of list) {
      if (!e || e.alive === false || !e.pos) continue;
      const squadId = e.data && e.data.ai && e.data.ai.squadId;
      if (squadId && wantedPatrols.has(squadId) && !hullByEncounter.has(squadId)) {
        hullByEncounter.set(squadId, e);
      }
    }
    for (const [encounterId, body] of wantedPatrols) {
      const hull = hullByEncounter.get(encounterId) || null;
      const projected = depotPatrolMarker(body, hull && hull.pos ? hull.pos : null);
      if (!projected) continue;
      markers.push({
        id: `depot-patrol:${body.id}`,
        claimId: body.id,
        targetEntityId: hull && hull.id != null ? hull.id : null,
        kind: 'depot-patrol',
        role: 'PATROL',
        glyph: '◆',
        color: factionColorOf(DEPOT_PATROL_FACTION_ID),
        name: `PATROL · ${body.name || 'Depot'} lane`,
        status: 'ON STATION',
        statusLine: `Concord patrol beat · ${hull ? 'hull on glass' : 'holding the lane'}`,
        playerVerb: 'Fly the lane the patrol holds; hostiles answer to it before they reach your haulers.',
        consequence: 'A stocked Trade Relay keeps this rotation posted; let the stores run dry and it is withdrawn.',
        riskLine: 'The patrol holds the lane, not an escort — it will not follow you out of the corridor.',
        named: true,
        x: projected.x,
        z: projected.z,
        drawPos: globalToSectorLocalForSector(projected, sid),
      });
    }
  }
  for (const body of bodies) {
    if (!body || body.owned !== true || body.sectorId !== sid) continue;
    const ledger = claimsSystem && typeof claimsSystem.ledger === 'function'
      ? claimsSystem.ledger(body.id)
      : null;
    const marker = describeClaimMapMarker(body, ledger, liveByPoi.get(body.poiId) || null);
    marker.drawPos = globalToSectorLocalForSector(marker, sid);
    if (depotRoutes.has(body.id)) marker.travelRoute = depotRoutes.get(body.id);
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
      color: operational ? INK.ink0 : INK.ink2,
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
        color: operational ? INK.ink0 : INK.ink2,
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
      color: meta.color || INK.ink1,
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
    for (const e of indexedTypeScan(state, 'stations')) {
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
  visitLocalChartContacts(state, (e) => {
    if (!e || e.alive === false || !e.pos) return;
    if (player && e.id === player.id) return;
    let kind = e.type;
    if (kind !== 'ship' && kind !== 'drone' && kind !== 'station' && kind !== 'asteroid') return;
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
      type: e.type,
      defId: e.data && e.data.defId,
      placeId: e.data && e.data.placeId,
      radius: e.radius,
      dockRadius: e.data && e.data.dockRadius,
      stationTypeId: e.data && (e.data.stationTypeId || e.data.archetypeGlb),
      archetypeGlb: e.data && e.data.archetypeGlb,
      typeId: e.data && e.data.typeId,
      isGate: !!(e.data && (e.data.isGate || e.data.isWormhole)),
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
        ? String((e.data && e.data.scanOreGlyph) || asteroidScanGlyph(e.data && e.data.typeId))
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
  });

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

/**
 * LAW-09 — the raid marker's stand-down verb. A claim under a live defense warning may be ignored
 * on purpose: the player accepts the losses rather than answering the raid. The claims owner
 * settles the warning through the same 'ignored' column the deadline lapse pays, so the verb is
 * honest about what it does — the raid lands unmolested and takes its cut of stores.
 */
export function resolveClaimIgnoreAction(target) {
  const defense = target && target.defense;
  const can = !!(target && target.claimId && defense && defense.id && defense.phase === 'warning');
  return {
    id: 'ignore-raid',
    label: 'Ignore raid',
    available: can,
    reason: can
      ? 'Stand the claim down — the raid lands unmolested and takes its cut of stores'
      : 'Only a live raid warning can be waived — an answered defense is already committed',
    event: can
      ? { name: 'claim:defenseIgnore', claimId: target.claimId, defenseId: defense.id }
      : null,
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
    // The world validates on this same bus synchronously: acceptance answers `jump:chargeStart`,
    // a refusal `jump:chargeAbort` — both DURING the requestJump emit below. Ask before claiming
    // success: a refusal is voiced once by the receipt lane (bindJumpDenialToasts), and this
    // toast must never promise a jump the drive just refused. A bus without listeners (headless
    // fixtures, the shipped seam test) counts as accepted and keeps the old shape.
    let accepted = true;
    const onChargeStart = () => { accepted = true; };
    const onChargeAbort = () => { accepted = false; };
    if (typeof bus.on === 'function') {
      accepted = false;
      bus.on('jump:chargeStart', onChargeStart);
      bus.on('jump:chargeAbort', onChargeAbort);
    }
    bus.emit('world:requestJump', { targetSectorId: action.targetSectorId, via: 'gate' });
    if (typeof bus.off === 'function') {
      bus.off('jump:chargeStart', onChargeStart);
      bus.off('jump:chargeAbort', onChargeAbort);
    }
    const course = action.coursePayload || { type: 'sector', sectorId: action.targetSectorId, path: null };
    bus.emit('ui:setCourse', course);
    if (accepted) {
      const label = (action.coursePayload && action.coursePayload.label) || action.targetSectorId;
      bus.emit('toast', {
        text: `Course set: jump to ${label}`,
        kind: 'info',
        ttl: 3,
      });
    }
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
  const hidden = { visible: false, enabled: false, label: mapControlLabel('engage'), reason: '', event: null };
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
      return { visible: true, enabled: true, label: mapControlLabel('resume'), reason: `Interrupted${where}${why} — itinerary kept`, event: 'nav:engageRoute' };
    }
    return { visible: true, enabled: true, label: mapControlLabel('disengage'), reason: `${titleCasePhase(status)}${where}`, event: 'nav:abortRoute' };
  }

  if (!nav.route) {
    return { visible: true, enabled: false, label: mapControlLabel('engage'), reason: 'No route plotted — set a course to a sector first', event: null };
  }
  const legs = routeLegCount(nav.route);
  return {
    visible: true,
    enabled: true,
    label: mapControlLabel('engage'),
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

/**
 * Keyboard (`g`) and pad (`accept`) both reach route engage. Unavailable routes do not emit.
 * @returns {boolean}
 */
export function applyMapEngage({ key, pad, state, bus } = {}) {
  const spec = MAP_CONTROLS.engage;
  const keyHit = key && String(key).toLowerCase() === spec.key;
  const padHit = pad === spec.pad;
  if (!keyHit && !padHit) return false;
  return emitRouteEngageAction(bus, resolveRouteEngageAction(state));
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
/** The scan ring's whole life, in ms — the kit's `--k-d-temp`; a canvas draw cannot read the token. */
const SCAN_RING_MS = 400;

const LAYER_KIT_ICON = Object.freeze({
  route: 'route', mission: 'missions', market: 'market', events: 'warning',
  security: 'patrol', faction: 'factions', hazard: 'danger', services: 'station',
  holdings: 'cargo', discovery: 'scan',
});
const SERVICE_KIT_ICON = Object.freeze({
  trade: 'market', shipyard: 'shipworks', repair: 'repair', refuel: 'fuel',
  refine: 'industry', missions: 'missions', ore_buy: 'ore', black_market: 'pirate',
  module_craft: 'module', toll: 'credits', scan: 'scan',
});

/** The chart's type. Its materials — glass panes, keycaps, lamps, the selector tracks — are the
 *  deckplate sheet's CHART block (src/ui/deckplate/screens.js), the one source every screen uses. */
const CHART_HARDWARE = `
#sf-galaxymap.of-chart {
  font-family: var(--dp-face-read, var(--k-text));
  color: var(--dp-ink, var(--k-text-live));
}
#sf-galaxymap.of-chart .gm-title {
  font-family: var(--dp-face-display, var(--k-display)) !important;
  font-variation-settings: 'wght' 900, 'wdth' 125 !important;
  letter-spacing: .04em !important;
  text-transform: uppercase !important;
  line-height: .95 !important;
  font-size: clamp(40px, min(3.9vw, 7vh), 76px) !important;
  color: var(--dp-ink, var(--k-bone)) !important;
}
`;

let _styleInjected = false;
function injectStyle() {
  if (HAS_DOC) injectDeckplate();
  // ORRERY: the chart's instruments sheet (src/ui/orrery/chartLayouts.js) rides after the deckplate.
  if (HAS_DOC) injectChartLayouts();
  if (!HAS_DOC || _styleInjected || document.getElementById(STYLE_ID)) { _styleInjected = true; return; }
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS + '\n' + CHART_HARDWARE + '\n' + MAP_WORKBENCH_CSS;
  if (document.head && typeof document.head.appendChild === 'function') document.head.appendChild(el);
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
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/></svg>',
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
  ['Lay the line (preview, release to set)', 'Drag from you'],
  ['Cycle overlays', 'Tab'],
  ['Inspector tabs', '← →'],
  ['Search the chart', '/'],
  ['Close the chart', 'Esc'],
]);

// ---------------------------------------------------------------------------------------------
// SLICE C — inspector tabs. Depth on demand (ADR D9.9).
// ---------------------------------------------------------------------------------------------
//
// The panel shows ONE of these at a time. Overview is the default and is never a second copy of
// the four navigation answers — those stay in the foot band. Depth (route, prices, threat) stays
// on its own tab.
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
  if (ageS < 600) return { key: 'fresh', color: '#dfeeff', italic: false }; // phosphor: a fresh reading
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
  const byStationId = state.entityIndex && state.entityIndex.byStationId;
  const indexed = byStationId && typeof byStationId.get === 'function' ? byStationId.get(stationId) : null;
  if (indexed && indexed.type === 'station' && indexed.data) return indexed.data;
  for (const e of indexedTypeScan(state, 'stations')) {
    if (e && e.type === 'station' && (e.id === stationId || (e.data && e.data.stationId === stationId))) {
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
  for (const e of indexedTypeScan(state, 'stations')) {
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
  // `profile && profile.produces` hands in null for a sector with no economy profile; Array.from(null)
  // threw and took the whole THREAT tab down with it.
  const top = Array.from(lines || [])
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
  if (sec >= 0.4) return `<span style="color:${INK.warn}; letter-spacing: 2px;">●●○</span>`;
  if (sec >= 0.15) return `<span style="color:${INK.warn}; letter-spacing: 2px;">●○○</span>`;
  return `<span style="color:${INK.red}; letter-spacing: 2px;">○○○</span>`;
}
function dangerColor(v) {
  if (v < 0.28) return INK.good;
  if (v < 0.50) return INK.warn;
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

/** The stable key a player note hangs on: the target's own stable id when it has one
 *  (sectorId/stationId are data ids that survive reloads), else the map-assigned id. */
function noteKeyForTarget(t) {
  if (!t || !t.kind) return null;
  const id = t.sectorId || t.stationId || t.id;
  return id ? `${t.kind}:${id}` : null;
}

/** Safe HTML for one dynamic map-search row, including imported-save claim names. */
export function mapSearchItemHtml(target, index = 0) {
  const t = target || {};
  return `
    <div class="gm-search-item k-row ${index === 0 ? 'selected' : ''}" data-idx="${index}"${index === 0 ? ' aria-selected="true"' : ''}>
      <span class="gm-search-item-name k-row__name">${escapeMapHtml(t.name)}</span>
      <div class="gm-search-item-detail k-row__sub">${escapeMapHtml(t.detail)}</div>
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
      <div class="gm-ins-note" style="margin-top:7px; color:var(--k-text-live);">${escapeMapHtml(t.playerVerb || 'Fly to the base.')}</div>
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
  _inspectorPending: false,
  // DOM-only panels follow the screen refresh cadence; the canvas remains frame-driven while an
  // animation is alive. A pending flag keeps level changes and event-driven invalidations visible
  // without rebuilding rail/header/cargo markup on every paint.
  _domRefreshPending: false,
  _lastDrawLevel: null,
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
  _lastInspectorTarget: null,
  _setCourseHandler: null,
  _scaleButtons: [],
  // LOCAL contact memory. Cosmetic, screen-owned, never written into sim state.
  _localIntel: null,
  _localIntelSectorId: null,
  // Release handle for the entity:killed subscription (see _subscribeKills).
  _killUnsub: null,
  // simTime of the last intel sync, so a paused sim does not re-observe identical tracks per frame.
  _localIntelSyncedAtS: -1,
  // LOCAL model cache. The model is state-derived; scan/iris/contact animation remains draw-time
  // work, so a paused sim can keep painting without rebuilding identical contact records.
  _localModelCache: null,
  _localModelCacheState: null,
  _localModelCacheKey: null,
  _localModelDirty: true,
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
  // PQ-183.02 chart notes. Player-authored lines on a selected mark, keyed `kind:stable-id`,
  // persisted per save through the galaxyMap screenMemory bag — the same lane bookmarks ride.
  _notes: new Map(),
  _noteEditing: null,
  _lastNoteSlotKey: '',
  _ribbonEl: null,
  _lastRibbonKey: null,
  // Separate, coarser key for the action row so live ETA churn cannot steal keyboard focus from
  // the Disengage button mid-transit. See the note in _updateRibbon.
  _lastRibbonActionKey: null,
  _ribbonHandler: null,
  _weatherEl: null,
  _lastWeatherKey: null,
  _deckEl: null,
  _navFootEl: null,
  _lastNavFootKey: null,
  _chromeRectCache: null,
  _deckTableEl: null,
  _deckSortBtn: null,
  _deckSortMode: 'best',
  _deckRoutes: [],
  _lastDeckKey: null,
  _deckHandler: null,
  _busUnsubs: [],
  _scanSweepUntil: 0,
  _localLiveContacts: 0,
  _levelEl: null,
  // ORRERY instruments of the chrome (src/ui/orrery/chartInstruments.js): the zoom lever and the tab scale.
  _lever: null,
  _tabScale: null,

  _claimsSystem() {
    const registry = this._ctx && this._ctx.registry;
    return registry && typeof registry.get === 'function' ? registry.get('claims') : null;
  },

  /**
   * Rectangles the label solver must route around, shared by all three levels.
   *
   * `layoutMapLabels` already does deterministic decluttering and already accepts `reserved` — the
   * brief says extend it, not write a second solver, so the new furniture is expressed as more
   * reserved rectangles rather than as a competing pass. Anything painted on the shared path after
   * the level belongs here, or labels get placed underneath it and the overlap defect comes back
   * wearing new geometry. (The navigation answers used to be such a plate; they are DOM in the
   * foot row now.) The DOM chrome that sits over the full-frame canvas (the lens rail, the
   * inspector, the foot) is reserved too: those regions are words on hairlines now, not opaque
   * fields, so a label placed under them prints through the words.
   */
  _reservedLabelRects(w, h, extra = []) {
    const rects = Array.isArray(extra) ? extra.filter(Boolean).slice() : [];
    for (const rect of this._chromeLabelRects(w, h)) rects.push(rect);
    return rects;
  },

  /**
   * Canvas-space rectangles of the DOM regions laid over the chart. Measured at most every 250 ms
   * (and whenever the canvas size changes) so a LOCAL-scale draw at display refresh does not force
   * a layout per frame. Headless fixtures hand back a full-frame rect for every element; anything
   * covering half the canvas or more is not a chrome region and is skipped.
   */
  _chromeLabelRects(w, h) {
    if (!HAS_DOC || !this._root || !this._canvas || typeof this._canvas.getBoundingClientRect !== 'function') return [];
    const now = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
      ? performance.now() : 0;
    const cache = this._chromeRectCache;
    if (cache && cache.w === w && cache.h === h && now - cache.at < 250) return cache.rects;
    const frame = this._canvas.getBoundingClientRect();
    const rects = [];
    for (const selector of ['.gm-left-rail', '.gm-right-inspector', '.gm-apron']) {
      const el = typeof this._root.querySelector === 'function' ? this._root.querySelector(selector) : null;
      if (!el || typeof el.getBoundingClientRect !== 'function') continue;
      const r = el.getBoundingClientRect();
      const width = Number(r && r.width) || 0;
      const height = Number(r && r.height) || 0;
      if (!(width > 0 && height > 0) || width * height >= w * h * 0.5) continue;
      rects.push({
        x: (Number(r.left) || 0) - (Number(frame.left) || 0) - 8,
        y: (Number(r.top) || 0) - (Number(frame.top) || 0) - 8,
        width: width + 16,
        height: height + 16,
      });
    }
    this._chromeRectCache = { w, h, at: now, rects };
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
    const known = level === 'galaxy' ? this._galaxyFrame() : null;
    const sector = level === 'system' ? this._systemSpan() : null;
    this._camera = createMapCamera({
      focusGlobal: known ? known.focusGlobal : (focusGlobal || preset.focusGlobal),
      spanWU: known ? known.spanWU : (sector || preset.spanWU),
      minSpanWU: MAP_SPAN_MIN_WU,
      maxSpanWU: CHART_SPAN_MAX_WU,
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
      maxSpanWU: CHART_SPAN_MAX_WU,
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
   * The four always-present navigation answers, resolved ONCE per draw for the foot band and the
   * framing controls. There is no second readout: the inspector does not repeat these rows.
   *
   * Resolving them once is the point, not an optimisation: the foot saying one thing while the
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
    // The kit screen root (KIT_SPEC §6.1): the stage variant, transparent, on the kit grid. The
    // chart's own `.gm-*` layout rules (the permitted canvas-instrument block) place its regions.
    // Guarded: headless fixtures hand in roots without classList/dataset.
    if (rootEl.classList && typeof rootEl.classList.add === 'function') {
      rootEl.classList.add('k-screen', 'k-screen--stage', 'of-chart', 'orr-chart');
    }
    if (typeof rootEl.setAttribute === 'function') rootEl.setAttribute('data-fh-register', 'bench');
    if (rootEl.dataset) rootEl.dataset.kReady = '0';
    if (rootEl.style && typeof rootEl.style.setProperty === 'function') {
      rootEl.style.setProperty('--gm-apron-h', 'clamp(200px, 30vh, 300px)');
    }
    const layerButtonById = new Map(LAYER_DEFS.map((layer) => [layer.id, `
            <button ${mapControlAttrs('layer')} class="gm-layer-btn k-word k-word--body fh-key fh-key--legend${this._layers[layer.id] ? ' active is-lit' : ''}" type="button" data-layer="${layer.id}" aria-pressed="${this._layers[layer.id] ? 'true' : 'false'}">
              <span class="gm-layer-ico" aria-hidden="true">${dpIcon(LAYER_KIT_ICON[layer.id] || 'scan', 18)}</span>
              <span class="gm-layer-name">${layer.name}</span>
              <span class="gm-layer-state" aria-hidden="true"></span>
            </button>`]));
    const layerButtonsHtml = LAYER_BANKS.map((bank) => `
              <div class="gm-layer-bank" data-layer-bank="${bank.id}">
                <div class="gm-layer-bank-title k-caps">${bank.label}</div>
                ${bank.layers.map((layerId) => layerButtonById.get(layerId) || '').join('')}
              </div>`).join('');
    const legendHtml = LEGEND_SERVICES.map((svc) => `
            <div class="gm-legend-row k-row k-row--static fh-row">
              <span class="gm-legend-ico" aria-hidden="true">${dpIcon(SERVICE_KIT_ICON[svc] || 'station', 18)}</span>
              <span>${svc === 'ore_buy' ? 'Ore buy' : svc[0].toUpperCase() + svc.slice(1)}</span>
            </div>`).join('');
    const markLegendHtml = LEGEND_MARKS.map((mark) => `
            <div class="gm-legend-row k-row k-row--static fh-row">
              <span class="gm-legend-ico gm-legend-ico--mark" aria-hidden="true">${mark.svg}</span>
              <span>${mark.name}</span>
            </div>`).join('');
    const hintRowsHtml = HINT_ROWS.map(([label, keys]) => `
          <div class="gm-hint-row k-row k-row--static"><span>${label}</span><kbd>${keys}</kbd></div>`).join('');
    rootEl.innerHTML = bindMapMarkup(navigationFrameHtml({ hintRowsHtml, layerButtonsHtml, legendHtml, markLegendHtml }));

    this._body = rootEl.querySelector('.gm-viewport');
    this._canvas = rootEl.querySelector('canvas');
    this._g = this._canvas.getContext('2d');
    this._levelEl = rootEl.querySelector('[data-level]');
    this._inspectorDetails = rootEl.querySelector('.gm-inspector-details');
    this._setCourseButton = rootEl.querySelector('#gm-set-course-btn');
    this._engageButton = rootEl.querySelector('#gm-engage-route-btn');
    // ENGAGE ROUTE is the chart's one Lamp Key (ORRERY §3.6); with no route it stands as its silhouette.
    if (this._engageButton && this._engageButton.ownerDocument) {
      try { dressLampKey(this._engageButton); } catch (_) { /* a headless fixture's button stays a word */ }
    }
    // A token render that landed since the last open is picked up now (src/ui/orrery/chartInstruments.js).
    retrySectorTokens();
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
    // The zoom lever: the scale words on one ruled scale, the Hand riding the chart's continuous zoom.
    if (this._lever) this._lever.dispose();
    this._lever = createZoomLever(rootEl.querySelector('.gm-scale-buttons'));
    this._scaleButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this._setScaleFocus(button.getAttribute('data-focus'));
      });
    });

    // ─── SLICE C wiring ──────────────────────────────────────────────────────────────────────
    this._tabPanel = rootEl.querySelector('#gm-tabpanel');
    this._placeActionsEl = rootEl.querySelector('#gm-place-actions');
    this._ribbonEl = rootEl.querySelector('#gm-route-ribbon');
    // The route's state and verbs sit under the Lamp Key in the inspector (its itinerary rides the
    // beam on the chart); the foot keeps only the four answers, so the chart keeps the height.
    {
      const engageReason = rootEl.querySelector('#gm-engage-reason');
      if (this._ribbonEl && engageReason && typeof engageReason.after === 'function' && this._ribbonEl.parentNode) {
        try { engageReason.after(this._ribbonEl); } catch (_) { /* a headless fixture keeps the ribbon where it is */ }
      }
    }
    // The tilt plate: the chosen sector's render leans toward the pointer.
    const detailsForTilt = rootEl.querySelector('#gm-tabpanel');
    if (detailsForTilt && typeof detailsForTilt.addEventListener === 'function') {
      detailsForTilt.addEventListener('pointermove', (ev) => {
        const art = ev && ev.target && typeof ev.target.closest === 'function' ? ev.target.closest('.gm-ins-plate__art') : null;
        if (!art || galaxyMapScreen._reduceMotion) return;
        const r = art.getBoundingClientRect();
        const nx = ((ev.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
        const ny = ((ev.clientY - r.top) / Math.max(1, r.height)) * 2 - 1;
        art.style.setProperty('--tilt-y', `${(nx * 12).toFixed(1)}deg`);
        art.style.setProperty('--tilt-x', `${(-ny * 12).toFixed(1)}deg`);
      });
      detailsForTilt.addEventListener('pointerleave', () => {
        for (const art of detailsForTilt.querySelectorAll('.gm-ins-plate__art')) {
          art.style.setProperty('--tilt-x', '0deg');
          art.style.setProperty('--tilt-y', '0deg');
        }
      }, true);
    }
    this._weatherEl = rootEl.querySelector('#gm-crest-weather');
    this._deckEl = rootEl.querySelector('#gm-cargo-deck');
    this._navFootEl = rootEl.querySelector('#gm-navfoot');
    this._lastNavFootKey = null;
    this._chromeRectCache = null;
    this._deckTableEl = rootEl.querySelector('#gm-deck-table');
    this._deckSortBtn = rootEl.querySelector('#gm-deck-sort');
    this._localModelDirty = true;
    this._localModelCache = null;
    this._localModelCacheState = null;
    this._localModelCacheKey = null;
    this._domRefreshPending = true;
    this._lastDrawLevel = null;
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
    if (this._tabScale) this._tabScale.dispose();
    this._tabScale = null;
    this._renderTabs(this._ctx && this._ctx.state);
    // The tabs as words on ruled scales with the Hand under the open one.
    this._tabScale = createTabScale(rootEl.querySelector('#gm-tabs'));
    this._tabScale.sync({ instant: true });

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
        resultsContainer.innerHTML = '<div class="gm-search-item gm-search-empty k-t-fine k-38">No results found</div>';
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
    // Pointer events carry the pan, the hover lens and the laid line (a PointerEvent is a MouseEvent,
    // so the handlers read the same fields); a real mouse fires both families, so only one is bound.
    this._canvas.addEventListener('pointerdown', (ev) => this._onPointerDown(ev));
    this._canvas.addEventListener('pointermove', (ev) => this._onMouseMove(ev));
    this._canvas.addEventListener('pointerup', (ev) => this._onPointerUp(ev));
    this._canvas.addEventListener('pointercancel', () => this._onPointerCancel());
    this._canvas.addEventListener('pointerleave', () => this._onMouseLeave());
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
    // updates before a single frame had been scheduled. The canvas and deferred panel sync are
    // marked dirty here; the next frame does them, then a static chart sleeps.
    this._drawPending = true;
    this._inspectorPending = true;
    this._localModelDirty = true;
    this._domRefreshPending = true;
    this._syncPublicIdentity();
    this._syncScaleButtons();
    this._wake();
  },

  onHide() {
    this._visible = false;
    if (this._lockTimer) { clearTimeout(this._lockTimer); this._lockTimer = null; }
    this._lock = null;
    if (this._engageButton && this._engageButton.classList) this._engageButton.classList.remove('is-locking');
    if (this._animFrame != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._animFrame);
    }
    this._animFrame = null;
    this._unsubscribeKills();
    this._rememberScreenState();
    this._localLiveContacts = 0;
    this._localModelDirty = true;
    this._inspectorPending = false;
    this._domRefreshPending = false;
    this._lastDrawLevel = null;
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
      // PQ-183.02 chart notes — player-authored lines, same artifact lane as bookmarks.
      // Flattened to {ref,text}; 32 notes of 160 chars is the screenMemory bound, and the bag
      // cannot smuggle more than that in either.
      notes: this._notes instanceof Map
        ? [...this._notes].slice(-32).map(([ref, text]) => ({ ref: String(ref), text: String(text).slice(0, 160) }))
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
    // Chart notes reset to EMPTY then rehydrate: notes are per-save artifacts, and a note from
    // save A must never leak into save B the way an unconditional merge would.
    this._notes = new Map();
    this._noteEditing = null;
    this._lastNoteSlotKey = '';
    if (Array.isArray(bag.notes)) {
      for (const n of bag.notes) {
        if (n && typeof n.ref === 'string' && typeof n.text === 'string' && n.text.trim()) {
          this._notes.set(n.ref, n.text.slice(0, 160));
        }
      }
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
      galaxyMapScreen._localModelDirty = true;
      galaxyMapScreen._inspectorPending = true;
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
    // GALAXY frames the space you know (charted sectors and your route), centred in the clear field.
    const known = level === 'galaxy' ? this._galaxyFrame() : null;
    const sector = level === 'system' ? this._systemSpan() : null;
    this._camera = setSpan(
      setFocus(this._cameraOrInit(), known ? known.focusGlobal : preset.focusGlobal),
      known ? known.spanWU : (sector || preset.spanWU),
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
    // The zoom lever's Hand rides the same continuous zoom, in word units: 0 at LOCAL's preset,
    // 1 at SYSTEM's, 2 at GALAXY's, piecewise in log zoom (so the wheel moves it between the words).
    if (this._lever) this._lever.sync(leverPositionForZoom(this._zoom));
  },

  _syncPublicIdentity(state = this._ctx && this._ctx.state) {
    if (!HAS_DOC || !this._root) return;
    const stamp = this._root.querySelector('.gm-stamp');
    if (!stamp) return;
    const label = mapOperatorLabel(state);
    const identity = label === 'OPERATOR: UNKNOWN' ? `${label} / Quiet routing` : '';
    // The title block names the SELECTED place — or the sector the ship is in when nothing is
    // selected — over one sentence: type · authority · distance. Where the route arrives is the
    // foot's DESTINATION row and the ribbon; copying "Arrive …" here answered it again.
    const t = this._selectedTarget;
    const curSector = currentSectorId(state);
    const titleEl = this._root.querySelector('.gm-title');
    const title = t && t.name ? String(t.name) : (curSector ? sectorNameOf(state, curSector) : 'Star Chart');
    if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;
    const bits = [];
    if (t) {
      const kind = String(t.kind || 'target');
      bits.push(kind.charAt(0).toUpperCase() + kind.slice(1));
      if (t.factionId) bits.push(factionNameOf(t.factionId));
      const player = playerEntity(state);
      if (t.kind === 'sector') {
        bits.push((t.sectorId || t.id) === curSector ? 'current sector' : 'other sector');
      } else if (player && player.pos && Number.isFinite(t.x) && Number.isFinite(t.z)) {
        bits.push(formatDistanceWU(Math.hypot(t.x - player.pos.x, t.z - player.pos.z)));
      }
    } else {
      bits.push('Sector');
      const rec = curSector ? sectorRecordById(state, curSector) : null;
      if (rec && rec.factionId) bits.push(factionNameOf(rec.factionId));
      bits.push('you are here');
    }
    if (identity) bits.push(identity);
    const text = bits.join(' · ');
    if (stamp.textContent !== text) stamp.textContent = text;
  },

  /**
   * Read the motion preference once per show rather than per frame. The global CSS rule in
   * styles/accessibility.css kills DOM transitions, but canvas animation is drawn by hand and has
   * to opt out itself — so flow beads, the sweep and the iris all consult this.
   */
_syncReduceMotion() {
    // The game's own setting decides (html.sf-reduce-motion), never the OS hint alone: the owner's
    // Windows has animation effects off, and inheriting that silently stripped every canvas motion
    // on the chart (the same trap src/ui/orrery/tokens.js records for the whole interface).
    let reduced = false;
    const doc = typeof document !== 'undefined' ? document : null;
    if (doc && doc.documentElement && doc.documentElement.classList
      && typeof doc.documentElement.classList.contains === 'function'
      && doc.documentElement.classList.contains('sf-reduce-motion')) {
      reduced = true;
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
    if (this._line || this._hold || this._lock) return true;
    if (this._hoverTarget && !this._reduceMotion && now - (this._hoverSince || 0) < 220) return true;
    if (!this._reduceMotion && this._routeDrawStart != null && now - this._routeDrawStart < 600) return true;
    if (this._ambientMotion()) return true;
    const localLiveContacts = levelForZoom(this._zoom) === 'local' && (this._localLiveContacts || 0) > 0;
    if (localLiveContacts) return true;
    return !this._reduceMotion
      && levelForZoom(this._zoom) === 'local'
      && now < (this._scanSweepUntil || 0);
  },

  /**
   * The chart's ambient life: packets running the lanes, the Hand's packet running a course, the
   * fix mark breathing. Off under reduced motion; painted at ~30 Hz, since a frame rebuilds the
   * model and solves the labels.
   */
  _ambientMotion() {
    if (this._reduceMotion || !this._visible) return false;
    const state = this._ctx && this._ctx.state;
    if (!state) return false;
    if (levelForZoom(this._zoom) === 'galaxy') return true;
    const nav = state.nav || {};
    return !!(nav.waypoint || (nav.route && nav.route.legs && nav.route.legs.length) || this._selectedTarget);
  },

_stepAnimation(now) {
    const dtSec = Math.max(0, (now - this._lastTime) / 1000);
    this._lastTime = now;
    this._animT = (this._animT || 0) + dtSec;
    let changed = this._drawPending === true || this._inspectorPending === true;
    this._drawPending = false;
    if (Math.abs(this._zoom - this._targetZoom) > 0.0005) {
      const alpha = 1 - Math.exp(-dtSec / 0.10);
      this._zoom += (this._targetZoom - this._zoom) * Math.min(1, alpha);
      changed = true;
    }
    if (this._scanRings.length > 0) {
      let live = 0;
      for (let i = 0; i < this._scanRings.length; i += 1) {
        const ring = this._scanRings[i];
        // Wall-clock milliseconds, not frames: the ring is one 400 ms fade at any refresh rate.
        ring.t += dtSec * 1000;
        ring.r = (ring.t / ring.maxT) * ring.maxR;
        if (ring.t < ring.maxT) this._scanRings[live++] = ring;
      }
      this._scanRings.length = live;
      changed = true;
    }
    if (this._iris) {
      this._iris.t += 1;
      if (this._iris.t >= this._iris.maxT) this._iris = null;
      changed = true;
    }
    // A still press on empty space becomes a laid line once the hold ring has filled.
    if (this._hold) {
      changed = true;
      if (now - this._hold.t0 >= CHART_LINE_HOLD_MS) {
        const hold = this._hold;
        this._beginLine(hold.x, hold.y, { pointerId: hold.pointerId });
      }
    }
    if (this._line || this._lock) changed = true;
    if (this._hoverTarget && now - (this._hoverSince || 0) < 240) changed = true;
    if (this._routeDrawStart != null && now - this._routeDrawStart < 640) changed = true;
    const localLevel = levelForZoom(this._zoom) === 'local';
    const liveContacts = localLevel && (this._localLiveContacts || 0) > 0;
    if (localLevel && (liveContacts || (!this._reduceMotion && now < (this._scanSweepUntil || 0)))) {
      this._scanPhase = (this._scanPhase || 0) + (dtSec * (liveContacts ? 0.65 : 1.25));
      changed = true;
    }
    // Ambient life only: at most ~30 frames a second.
    if (!changed && this._ambientMotion() && now - (this._lastAmbientDraw || 0) >= 33) changed = true;
    if (changed) {
      this._draw();
      if (this._inspectorPending) {
        this._updateInspector();
        this._inspectorPending = false;
      }
    }
    if (this._domRefreshPending) {
      this._refreshDomPanels(this._ctx && this._ctx.state);
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

    if (applyMapEngage({ key, state: (ctx || this._ctx) && (ctx || this._ctx).state, bus: (ctx || this._ctx) && (ctx || this._ctx).bus })) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      this._updateEngageControl();
      return true;
    }

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

    // Esc lets a line being laid go before it closes the chart.
    if (key === 'escape' && (this._line || this._hold)) {
      this._hold = null;
      if (this._line) this._endLine({ commit: false });
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
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
      galaxyMapScreen._localModelDirty = true;
      galaxyMapScreen._inspectorPending = true;
      galaxyMapScreen._domRefreshPending = true;
      galaxyMapScreen._syncPublicIdentity();
      galaxyMapScreen._draw();
      galaxyMapScreen._updateInspector();
      galaxyMapScreen._inspectorPending = false;
      galaxyMapScreen._syncScaleButtons();
      galaxyMapScreen._refreshDomPanels(galaxyMapScreen._ctx && galaxyMapScreen._ctx.state);
      galaxyMapScreen._wake();
    }
  },

  /** One expanding hairline ring that fades over `--k-d-temp` (400 ms), once. Reduced motion: none. */
  triggerScanRing(x, y, color = INK.amberHot) {
    if (this._reduceMotion) return;
    this._scanRings.push({
      x, y, r: 0, maxR: 120, t: 0, maxT: SCAN_RING_MS, color
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
    for (const e of indexedShipLikeScan(state)) {
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
    // The title block follows the selection (name + one sentence) — same beat as the inspector.
    this._syncPublicIdentity(state);
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
    this._renderNoteSlot(state);

    const t = this._selectedTarget;
    // A new selection re-seats the action band at its top so the primary action is never
    // clipped: the band is a scrollable clip, and focus-following on a previously clicked
    // action can otherwise keep the primary scrolled out of the paint (release soak hit
    // this — Set Waypoint laid out above the clip while a focused sibling held the scroll).
    if (t !== this._lastInspectorTarget) {
      const actions = this._root.querySelector('.gm-inspector-actions');
      if (actions && actions.scrollTop !== 0) actions.scrollTop = 0;
      this._lastInspectorTarget = t;
    }
    if (!t) {
      // NO SELECTION IS NOT AN EMPTY PANEL. Overview is a careers line and a click hint.
      // The four navigation answers stay in the foot — this panel must not repeat them.
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

    // Only Overview consumes the per-kind model below. Building its route, market and mission
    // markup on every animation frame while another tab is visible discards all of that work.
    // Selection and navigation controls still project fresh state on every inspector update.
    if (this._activeTab && this._activeTab !== 'overview') {
      const primary = resolveGalaxyMapPrimaryAction(state, t);
      let label = 'Track Target';
      if (t.kind === 'sector') label = primary?.label || 'Plot Course';
      else if (t.kind === 'station' || t.kind === 'gate') label = primary?.label || 'Set Waypoint';
      else if (t.kind === 'claim') label = 'Set Base Waypoint';
      else if (t.kind === 'rumor') label = 'Manual Search Area';
      else if (t.kind === 'zone') label = 'Align Autopilot';
      else if (t.kind === 'waypoint') label = 'Track Waypoint';
      this._paintInspectorBody(state, detailsEl, btn, null, label, primary);
      return;
    }

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

      // Cost of a course to this mark. The plotted legs stay on the ribbon and the Travel
      // tab — reprinting them here answered "what is the route" a second time.
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

      html += `
        <div class="gm-ins-section">
          <div class="gm-ins-plate">
            <div class="gm-ins-plate__art" aria-hidden="true"><img src="${escapeMapHtml(sectorTokenUrl(t.id))}" alt="" loading="eager" onerror="this.remove()"></div>
            <div>
              <div class="gm-ins-kind">Sector record · [${Math.round(t.x || 0)}, ${Math.round(t.y || 0)}]</div>
              <div class="gm-ins-target-name">${escapeMapHtml(t.name)}</div>
            </div>
          </div>
        </div>

        ${t.factionId ? `<div class="gm-ins-section">
          <div class="gm-ins-title">Faction</div>
          <div class="gm-ins-row">
            <span>Authority</span>
            <span class="gm-ins-row-val"><img class="gm-ins-plate__crest" src="${escapeMapHtml(factionCrestUrl(t.factionId))}" alt="" onerror="this.remove()" style="width:18px;height:18px;vertical-align:-4px;margin-right:8px"><span${entityAttr('faction:' + t.factionId)}>${escapeMapHtml(faction)}</span></span>
          </div>
        </div>` : ''}

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
          <div class="gm-ins-note" style="margin-top:6px;"><b style="color:var(--k-text-live);">ILLEGAL:</b> ${law.illegal}</div>
          <div class="gm-ins-note" style="margin-top:4px;"><b style="color:var(--k-text-live);">RESPONSE:</b> ${law.response}</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Navigation Cost</div>
          <div class="gm-ins-row">
            <span>Route</span>
            <span class="gm-ins-row-val">${routeInfo}</span>
          </div>
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
    this._paintInspectorBody(state, detailsEl, btn, html, buttonLabel,
      resolveGalaxyMapPrimaryAction(state, t));
  },

  _paintInspectorBody(state, detailsEl, btn, selectionHtml, buttonLabel, primary) {
    const tabbed = this._tabHtml(state, selectionHtml);
    if (this._inspectorDetailsHtml !== tabbed) {
      detailsEl.innerHTML = tabbed;
      this._inspectorDetailsHtml = tabbed;
    }
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
   * With a selection it shows that selection's detail. With NO selection it shows the
   * pocket-careers line and a short click hint. The four navigation answers are NOT repeated here:
   * the foot band (`#gm-navfoot`, `_updateNavFoot`) carries them at every scale and window size,
   * and the same sentence twice on one screen reads as a mistake.
   */
  _overviewTabHtml(state, selectionHtml) {
    if (selectionHtml) return selectionHtml;
    // The pocket's trades appear the moment the Chart opens — §11.11 #1 is a surfacing problem, and
    // the roster is one tab deeper. Rendered only when careers are actually on record here, so the
    // no-selection panel never grows a block that says nothing.
    const careersHtml = careersOverviewLineHtml(state, currentSectorId(state));
    return `
      ${careersHtml}
      <div class="gm-ins-section">
        <div class="gm-ins-note"><b>Drag from your ship</b> to lay a course — the line shows the route before you commit. Click a mark to inspect it; double-click also lays a course.</div>
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
      ? `<div class="gm-ins-note"><b style="color:var(--k-text-live);">INTERRUPTED:</b> ${escapeMapHtml(ribbon.interruption.label)}. The itinerary is kept — Resume picks it up on the same leg.</div>`
      : '';
    return `
      <div class="gm-ins-section">
        <div class="gm-ins-kind">Route</div>
        <div class="gm-ins-target-name">Itinerary</div>
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
        <button ${mapControlAttrs('lane')} class="gm-tl-row" type="button" data-gm-lane="${escapeMapHtml(lane.destinationId)}">
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

    const credits = state.player && state.player.credits ? Math.round(state.player.credits).toLocaleString('en-US') : '0';
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
        <div class="gm-ins-note"><b style="color:var(--k-text-live);">RESPONSE:</b> ${law.response}</div>
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
          ? `<div class="gm-svc-row k-words k-words--row">${s.services.map((svc) => `<span class="gm-svc-chip k-word k-word--fine k-word--static"><span class="gm-svc-ico" aria-hidden="true">${serviceIconSvg(svc)}</span>${escapeMapHtml(svc === 'ore_buy' ? 'Ore buy' : svc)}</span>`).join('')}</div>`
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
      <button ${mapControlAttrs('world-site')} class="gm-site-row" type="button" data-world-site-id="${escapeMapHtml(marker.id)}"
        data-world-site-sector="${escapeMapHtml(marker.sectorId)}"
        aria-label="Inspect World Site ${escapeMapHtml(marker.name)}"
        aria-pressed="${!!(t && t.id === marker.id)}">
        <span>${escapeMapHtml(marker.name)}</span>
        <span class="gm-ins-row-val">${escapeMapHtml(marker.stageLabel)}</span>
      </button>`).join('');
    const rumorRows = rumorCards.map((rumor) => `
      <button ${mapControlAttrs('frontier-rumor')} class="gm-site-row" type="button" data-frontier-rumor-id="${escapeMapHtml(rumor.rumorId)}"
        data-frontier-rumor-sector="${escapeMapHtml(rumor.sectorId)}"
        aria-label="Inspect ${escapeMapHtml(rumor.name)} search area"
        aria-pressed="${!!(t && t.id === rumor.rumorId)}">
        <span class="gm-ins-kind">${escapeMapHtml(rumor.statusLabel)}</span>
        <span class="gm-ins-title">${escapeMapHtml(rumor.name)}</span>
        <span class="gm-ins-note">${escapeMapHtml(rumor.detail)}</span>
        <span class="gm-ins-note">${escapeMapHtml(rumor.objective)}</span>
      </button>`).join('');
    const vestaRows = vestaCards.map((cache) => `
      <button ${mapControlAttrs('vesta-cache')} class="gm-site-row" type="button" data-vesta-cache-id="${escapeMapHtml(cache.cacheRecordId)}"
        data-vesta-cache-sector="${escapeMapHtml(cache.sectorId)}"
        aria-label="Inspect ${escapeMapHtml(cache.name)}. ${escapeMapHtml(cache.objective)}"
        aria-pressed="${!!(t && t.id === cache.cacheRecordId)}">
        <span class="gm-ins-kind">${escapeMapHtml(cache.statusLabel)}</span>
        <span class="gm-ins-title">${escapeMapHtml(cache.name)}</span>
        <span class="gm-ins-note">${escapeMapHtml(cache.detail)}</span>
        <span class="gm-ins-note">${escapeMapHtml(cache.objective)}</span>
      </button>`).join('');
    const pallasRows = pallasCards.map((cache) => `
      <button ${mapControlAttrs('pallas-cache')} class="gm-site-row" type="button" data-pallas-cache-id="${escapeMapHtml(cache.cacheRecordId)}"
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
    const noteKey = noteKeyForTarget(t);
    // The sector sweep is a ship instrument: it only answers for the sector the ship is in.
    const sweepsCurrent = !!(sectorId && state && state.mode === 'flight'
      && state.world && state.world.currentSectorId === sectorId);
    const acts = [
      { id: 'frame', label: 'Frame', available: true, reason: 'Centre the chart on this mark' },
      { id: 'open-system', label: 'Open system', available: !!sectorId, reason: sectorId ? 'Zoom to this mark\'s own sector' : 'This mark has no parent sector' },
      { id: 'sweep-sector', label: 'Sweep sector', available: sweepsCurrent, reason: sweepsCurrent ? 'Your ship sweeps the sector it flies — stations, fields and marks come up on the chart' : 'Your ship can only sweep the sector it is in' },
      { id: 'bookmark', label: 'Bookmark', available: true, reason: 'Save this view to the left rail' },
      { id: 'note', label: noteKey && this._notes.get(noteKey) ? 'Edit note' : 'Note', available: !!noteKey, reason: noteKey ? 'Write a private line on this mark — saved with this save' : 'This mark cannot carry a note' },
    ];
    if (t.kind !== 'rumor' && t.courseDisabled !== true) {
      const plot = resolveGalaxyMapPlotAction(state, t);
      acts.unshift({ id: 'plot', label: 'Plot course', available: plot.available, reason: plot.reason });
    }
    // LAW-09: a claim under a raid warning offers the stand-down verb — it only exists while a
    // live warning can still be waived.
    if (t.claimId && t.defense && t.defense.phase === 'warning') {
      const ignore = resolveClaimIgnoreAction(t);
      acts.push({ id: ignore.id, label: ignore.label, available: ignore.available, reason: ignore.reason });
    }
    const html = acts.map((a) => `<button ${mapControlAttrs(a.id)} class="gm-place-btn fh-key fh-key--small" type="button" data-place-action="${a.id}"
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
    if (id === 'ignore-raid') {
      const action = resolveClaimIgnoreAction(t);
      if (!action.available || !action.event) return false;
      const bus = this._ctx && this._ctx.bus;
      if (!bus) return false;
      bus.emit(action.event.name, { claimId: action.event.claimId, defenseId: action.event.defenseId });
      return true;
    }
    if (id === 'bookmark') return this._addBookmark();
    if (id === 'sweep-sector') {
      // The ship's own sweep — the same world:request* family the route/jump verbs emit. world.js
      // re-checks mode and ignores a second call while a sweep is in progress.
      const sectorId = t.sectorId || (t.kind === 'sector' ? t.id : null);
      const bus = this._ctx && this._ctx.bus;
      if (!bus || !sectorId || sectorId !== state.world.currentSectorId || state.mode !== 'flight') return false;
      bus.emit('world:requestSectorScan', {});
      bus.emit('toast', { text: 'Sweeping the sector…', kind: 'info', ttl: 2 });
      return true;
    }
    if (id === 'note') {
      const key = noteKeyForTarget(t);
      if (!key) return false;
      this._noteEditing = key;
      this._lastNoteSlotKey = ''; // force the slot to repaint as an edit field
      this._renderNoteSlot(state);
      const input = this._root && this._root.querySelector('#gm-note-slot .gm-note-input');
      if (input) { try { input.focus({ preventScroll: true }); } catch (_) { try { input.focus(); } catch (__) {} } }
      return true;
    }
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

  /**
   * PQ-183.02 — the note slot under the place actions. Read-mode shows the saved line; edit-mode
   * is one input, Enter keeps (empty deletes), Esc drops. Re-renders only when the visible
   * signature changes so a live inspector pass never yanks focus out of the field.
   */
  _renderNoteSlot(state) {
    if (!HAS_DOC || !this._root) return;
    const slot = this._root.querySelector('#gm-note-slot');
    if (!slot) return;
    const t = this._selectedTarget;
    const key = t ? noteKeyForTarget(t) : null;
    if (!key) {
      if (slot.innerHTML !== '') slot.innerHTML = '';
      this._noteEditing = null;
      this._lastNoteSlotKey = '';
      return;
    }
    const text = (this._notes instanceof Map && this._notes.get(key)) || '';
    // Selection moved while an editor was open on the previous mark — drop the session; the
    // unsaved draft is the player's to lose, not ours to resurrect on a later click.
    if (this._noteEditing && this._noteEditing !== key) this._noteEditing = null;
    const editing = this._noteEditing === key;
    const signature = `${key}|${editing ? 'e' : 'r'}|${text}`;
    if (signature === this._lastNoteSlotKey) return;
    this._lastNoteSlotKey = signature;
    if (editing) {
      slot.innerHTML = `<input class="gm-note-input" type="text" maxlength="160"
        aria-label="Chart note for this mark" placeholder="A line only you will read…"
        value="${escapeMapHtml(text)}"><div class="gm-ins-note k-t-fine k-38">Enter keeps it — empty deletes · Esc drops it</div>`;
      const input = slot.querySelector('.gm-note-input');
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          ev.stopPropagation();
          const v = String(input.value || '').trim().slice(0, 160);
          if (!(this._notes instanceof Map)) this._notes = new Map();
          if (v) this._notes.set(key, v); else this._notes.delete(key);
          this._noteEditing = null;
          this._rememberScreenState();
          this._lastNoteSlotKey = '';
          this._renderNoteSlot(state);
          this._renderPlaceActions(state); // 'Note' vs 'Edit note' label follows the save
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          this._noteEditing = null;
          this._lastNoteSlotKey = '';
          this._renderNoteSlot(state);
        }
      });
      return;
    }
    slot.innerHTML = text
      ? `<div class="gm-ins-note gm-note-line" role="note">“${escapeMapHtml(text)}”</div>`
      : '';
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
        <button ${mapControlAttrs('tab')} class="gm-tab k-word k-word--fine fh-key fh-key--legend" type="button" role="tab" id="gm-tab-${tab.id}" data-tab="${tab.id}"
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
    if (this._tabScale) this._tabScale.sync();
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
    // `sector &&` short-circuits to null, Number(null) is 0, and 0 is finite — so the guard passed
    // with no sector and the next read threw. Every station, range and chart shot on the bench was
    // printing "Cannot read properties of null (reading 'security')" from exactly here, and the
    // header weather stopped updating for the rest of that frame.
    const sec = sector && Number.isFinite(Number(sector.security)) ? Number(sector.security) : 0.5;
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

  /**
   * Refresh the DOM panels whose data changes on sim/event cadence rather than with canvas motion.
   * The route ribbon stays on `_draw` because its live executor readout is part of the moving
   * navigation instrument; these three panels are independently change-keyed and safe to defer.
   */
  _refreshDomPanels(state = this._ctx && this._ctx.state) {
    if (!this._domRefreshPending) return;
    this._updateRailSections(state);
    this._updateHeaderWeather(state);
    this._updateCargoDeck(state);
    this._domRefreshPending = false;
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

  /**
   * The four navigation answers as the foot band: POSITION / TRACKING / DESTINATION / NEXT LEG,
   * each a key-value readout (label, value, detail) in `resolveMapNavContext` order. Change-keyed,
   * because `_draw` runs at display refresh at LOCAL scale and the rows only change when the answer
   * does. The row classes (`gm-nav-row`, `-k`, `-v`, `-d`, `data-tone`) are the contract the
   * journey steps read the answers from, so they stay the same names the inspector fallback used.
   */
  _updateNavFoot(nav) {
    if (!HAS_DOC || !this._navFootEl) return;
    let rows = (nav && Array.isArray(nav.rows)) ? nav.rows : [];
    // While a laid line locks in, DESTINATION already names the course being set.
    if (this._lock && this._lock.dest) {
      const tracked = NAV_ROW_TONE && NAV_ROW_TONE.TRACKED ? NAV_ROW_TONE.TRACKED : 'tracked';
      rows = rows.map((row) => (row.key === 'destination'
        ? { ...row, value: this._lock.dest, detail: 'Course set', tone: tracked }
        : (row.key === 'leg' && this._lock.next
          ? { ...row, value: this._lock.next, detail: this._lock.nextDetail || '', tone: tracked }
          : row)));
    }
    const key = rows.map((row) => `${row.key}|${row.value}|${row.detail || ''}|${row.tone || ''}`).join('#');
    if (this._lastNavFootKey === key) return;
    this._lastNavFootKey = key;
    this._navFootEl.innerHTML = rows.map((row) => {
      const detail = row.detail
        ? `<span class="gm-nav-row-d">${escapeMapHtml(row.detail)}</span>`
        : '';
      // A leg "A → B" keeps its origin in its own span, so a short screen can drop it deliberately
      // (the destination is the part a pilot reads) instead of cutting the words with an ellipsis.
      const value = String(row.value == null ? '' : row.value);
      const arrow = value.indexOf(' → ');
      const valueHtml = arrow > 0
        ? `<span class="gm-nav-from">${escapeMapHtml(value.slice(0, arrow))} </span>→ ${escapeMapHtml(value.slice(arrow + 3))}`
        : escapeMapHtml(value);
      return `<div class="gm-nav-row" data-nav-row="${escapeMapHtml(row.key || '')}" data-tone="${escapeMapHtml(row.tone || '')}">
          <span class="gm-nav-row-k">${escapeMapHtml(row.label)}</span>
          <span class="gm-nav-row-v">${valueHtml}</span>
          ${detail}
        </div>`;
    }).join('');
  },

  _updateCargoDeck(state) {
    if (!HAS_DOC || !this._deckTableEl) return;
    if (!state) {
      this._deckTableEl.innerHTML = '';
      if (this._deckEl) this._deckEl.hidden = true;
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
    // No lane, no band. The empty state used to hold a wide field across half the foot with three
    // lines of prose in it; the ECONOMY tab still says how to seed lanes. The copy stays in the DOM
    // (hidden) so a fixture reading the table still finds the empty state.
    if (this._deckEl) this._deckEl.hidden = !this._deckRoutes.length;
    if (!this._deckRoutes.length) {
      this._deckTableEl.innerHTML = `
        <div class="gm-deck-empty">
          <div class="gm-deck-empty-title">No viable deck route</div>
          <div class="gm-deck-empty-body">Dock and scan markets, or carry cargo to seed HERE liquidation lanes.</div>
        </div>`;
      return;
    }
    // Six rows, no more: the foot is a glance, not a ledger (task table, `.gm-apron`).
    this._deckTableEl.innerHTML = this._deckRoutes.slice(0, 6).map((route, index) => {
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
        <button ${mapControlAttrs('deck-route')} class="gm-deck-row k-row" type="button" data-deck-route="${index}" role="listitem"
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
        return `<li class="gm-ribbon-leg k-word k-word--fine k-word--static" data-leg-state="${leg.state}">
          <span class="gm-ribbon-leg-g" aria-hidden="true">${glyph}</span>
          <span class="gm-ribbon-leg-n">${escapeMapHtml(leg.toName)}</span>
          <span class="gm-ribbon-leg-c">${Math.round(leg.fuel)}F</span>${hazard}${unresolved}
        </li>`;
      }).join('');
    }

    if (metaEl) {
      const bits = [];
      // The next leg already has its own foot row and its own ribbon leg. Repeating
      // "Next: …" here answered that question a second time.
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
          return `<button ${mapControlAttrs(a.id)} class="gm-ribbon-btn k-word k-word--body fh-key fh-key--small" type="button" data-ribbon-action="${a.id}"
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
          return `<button ${mapControlAttrs('rail-mission')} class="gm-rail-item k-row${tracked ? ' is-tracked' : ''}" type="button" data-rail-mission="${escapeMapHtml(m.id)}"${tracked ? ' aria-current="true" aria-selected="true"' : ''}>
            <span class="gm-rail-item-t k-row__name">${tracked ? '<span class="gm-rail-track-g" aria-hidden="true">◆</span>' : ''}${escapeMapHtml(missionSummary(m))}</span>
            <span class="gm-rail-item-s k-row__sub">${destName}${tracked ? ' · tracked' : ''}</span>
          </button>`;
        }).join('')
        : '<div class="gm-ins-note">No active missions. Accept one at a station to see its destination on the chart.</div>';
      if (missionsHost.innerHTML !== html) missionsHost.innerHTML = html;
    }

    const bmHost = openOf('bookmarks') && this._root.querySelector('#gm-rail-bookmarks');
    if (bmHost) {
      const html = `${this._bookmarks.length
        ? this._bookmarks.map((b, i) => `<button ${mapControlAttrs('rail-bookmark')} class="gm-rail-item k-row" type="button" data-rail-bookmark="${i}">
            <span class="gm-rail-item-t k-row__name">${escapeMapHtml(b.label)}</span>
            <span class="gm-rail-item-s k-row__sub">${Math.round(b.focusGlobal.x)}, ${Math.round(b.focusGlobal.z)} · ${escapeMapHtml(formatDistanceWU(b.spanWU))} span</span>
          </button>`).join('')
        : '<div class="gm-ins-note">No bookmarks. Bookmark the current view to come back to it.</div>'}
        <button ${mapControlAttrs('bookmark-add')} class="gm-ins-btn gm-rail-add k-word k-word--body" type="button" data-rail-bookmark-add>${mapControlLabel('bookmark-add')}</button>`;
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
      rows.push(`<button ${mapControlAttrs('route-option')} class="gm-rail-item k-row${same ? ' is-current' : ''}" type="button"
        data-rail-alt="${mode}" data-route-option="${mode}"${same ? ' aria-selected="true"' : ''}
        data-route-hops="${alt.legs.length}" data-route-fuel="${Math.round(alt.totalFuel || 0)}">
        <span class="gm-rail-item-t k-row__name">${label}${same ? ' <span class="gm-rail-item-tag">plotted</span>' : ''}</span>
        <span class="gm-rail-item-s k-row__sub">${alt.legs.length} hop${alt.legs.length === 1 ? '' : 's'} · ${Math.round(alt.totalFuel || 0)}F · worst leg ${Math.round(worst * 100)}% interdict · ETA by fuel burn</span>
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
    if (btn.textContent !== action.label) {
      // The Lamp Key's word lives in its own span beside the key's drawn rim: write the word, keep the key.
      const word = typeof btn.querySelector === 'function' ? btn.querySelector('.orr-lampkey__word') : null;
      if (word) word.textContent = action.label;
      else btn.textContent = action.label;
    }
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
    if (draw && HAS_DOC && this._canvas) {
      this._draw();
      // Bookmark/mission framing callers do not always start a scan ring. Wake once so a level
      // transition's deferred panel refresh is still visible immediately on an otherwise static
      // chart.
      this._wake();
    }
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
      // Frame your sector and the pick together, so the course the preview beam shows stays on the
      // glass (a pick framed alone ran the beam off the chart).
      const both = this._galaxyFrame([currentSectorId(state), target.sectorId || target.id]);
      this._camera = setSpan(
        setFocus(this._cameraOrInit(), both ? both.focusGlobal : { x: origin.x, z: origin.z }),
        both ? both.spanWU : spanForZoom(LEVEL_SYSTEM_AT - 0.5), // galaxy scale
      );
      this._syncLegacyFromCamera();
      if (!both) {
        // The legacy galaxy camera is in graph units; centre it on the picked NODE.
        this._cams.galaxy.cx = target.x;
        this._cams.galaxy.cy = target.y;
      }
    } else if (target.kind === 'station' || target.kind === 'gate' || target.kind === 'poi' || target.kind === 'zone' || target.kind === 'rumor') {
      // The SYSTEM camera lives in the sector-local draw frame, but a search target carries the
      // GLOBAL nav frame so the same object can arm a course. Centering on the raw nav position
      // parks the camera a whole sector origin away from the thing you just picked.
      const focus = target.drawPos
        || globalToSectorLocalForSector(target, target.sectorId || currentSectorId(state));
      const sid = target.sectorId || currentSectorId(state);
      // the dial draws the mark on its square-root scale: aim the camera where it is drawn
      const shown = this._systemWarp && this._systemWarp.sectorId === sid
        ? warpSectorLocal(focus, this._systemWarp.ringWU) : focus;
      const globalFocus = sectorLocalToGlobalForSector({ x: shown.x, z: shown.z }, sid);
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

  /**
   * THE SIGNATURE — "lay the line". Press on YOU (or on the sector you are in) and drag toward a
   * destination: the Hand's beam previews along the course the game would actually fly, a reading
   * rides the pointer, and the line snaps to the mark it passes. Release on a mark commits exactly
   * what a double-click commits; release on empty space (or Esc) lets the line go. A still press on
   * empty space becomes the same gesture after a moment (a hold ring fills under the pointer), so
   * dragging the table still pans it.
   */
  _onPointerDown(ev) {
    if (!ev || ev.button !== 0) return;
    const rect = this._canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    this._lineGesture = false;
    if (this._isYouAt(x, y)) {
      this._beginLine(x, y, ev);
      return;
    }
    this._onMouseDown(ev);
    this._hold = { x, y, t0: this._nowMs(), pointerId: ev.pointerId };
    this._wake();
  },

  _isYouAt(x, y) {
    const you = this._youScreen;
    if (you && Math.hypot(x - you.x, y - you.y) <= 24) return true;
    if (this._activeLevel() === 'galaxy' && this._galaxyScreen) {
      const state = this._ctx && this._ctx.state;
      const here = state ? currentSectorId(state) : null;
      const node = here ? this._galaxyScreen.get(here) : null;
      if (node && Math.hypot(x - node.x, y - node.y) <= Math.max(18, (this._galaxyTokenR || 20) * 0.8)) return true;
    }
    return false;
  },

  _beginLine(x, y, ev) {
    this._dragging = false;
    this._dragStart = null;
    this._hold = null;
    this._lineGesture = true;
    this._line = { x, y, snap: null, t0: this._nowMs() };
    if (ev && ev.pointerId != null && this._canvas && typeof this._canvas.setPointerCapture === 'function') {
      try { this._canvas.setPointerCapture(ev.pointerId); } catch (_) { /* a synthetic pointer has nothing to capture */ }
    }
    this._line.snap = this._lineSnapAt(x, y);
    if (this._canvas && this._canvas.style) this._canvas.style.cursor = 'crosshair';
    this._draw();
    this._wake();
  },

  /** The mark a laid line would take at (x, y): the one under the pointer, or the nearest within reach. */
  _lineSnapAt(x, y) {
    const state = this._ctx && this._ctx.state;
    const here = state ? currentSectorId(state) : null;
    const valid = (t) => {
      if (!t || !resolveCourseTarget(t)) return false;
      if (t.kind === 'sector' && (t.current || (t.sectorId || t.id) === here) && !t.objective) return false;
      return true;
    };
    const under = pickMapTargetAt((this._clickTargets || []).filter(valid), x, y);
    if (under && under.kind !== 'zone') return under;
    let best = null;
    let bestD = 58;
    for (const t of this._clickTargets || []) {
      if (!valid(t) || t.kind === 'zone') continue;
      const d = Math.hypot(x - t.sx, y - t.sy);
      if (d < bestD) { best = t; bestD = d; }
    }
    return best || under || null;
  },

  _endLine({ commit = false } = {}) {
    const line = this._line;
    this._line = null;
    this._lineReading = null;
    if (this._canvas && this._canvas.style) this._canvas.style.cursor = 'crosshair';
    if (commit && line && line.snap) {
      this._suppressClickUntil = this._nowMs() + 400;
      this._commitCourse(line.snap, { lock: true });
      return true;
    }
    this._draw();
    this._wake();
    return false;
  },

  _onPointerUp(ev) {
    this._hold = null;
    if (this._line) {
      const rect = this._canvas.getBoundingClientRect();
      if (ev && Number.isFinite(ev.clientX)) {
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        this._line.x = x; this._line.y = y;
        this._line.snap = this._lineSnapAt(x, y);
      }
      this._suppressClickUntil = this._nowMs() + 400;
      this._endLine({ commit: !!this._line.snap });
      return;
    }
    this._onMouseUp();
  },

  _onPointerCancel() {
    this._hold = null;
    if (this._line) this._endLine({ commit: false });
    this._onMouseUp();
  },

_onMouseMove(ev) {
    const level = this._activeLevel();
    const cam = this._cams[level];
    const rect = this._canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    this._pointer = { x: mx, y: my };

    // Laying a line: the beam follows the pointer and snaps to the mark it passes.
    if (this._line) {
      this._line.x = mx;
      this._line.y = my;
      const snap = this._lineSnapAt(mx, my);
      if ((snap && snap.id) !== (this._line.snap && this._line.snap.id)) this._hoverSince = this._nowMs();
      this._line.snap = snap;
      this._drawPending = true;
      this._wake();
      return;
    }
    // A still press becomes a line; a press that moves is a pan.
    if (this._hold && Math.hypot(mx - this._hold.x, my - this._hold.y) > 5) this._hold = null;

    if (this._dragging && this._dragStart) {
      const dx = ev.clientX - this._dragStart.mx;
      const dy = ev.clientY - this._dragStart.my;

      if (level !== 'local' && this._dragStart.camera) {
        // SLICE B — pan the unified camera in the GLOBAL frame. Dragging right must move the chart
        // right, i.e. the camera moves LEFT, hence the negated delta. Panning from the drag START
        // camera rather than accumulating per-move keeps the grab point exactly under the cursor.
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

    // Hover hit test; the lattice lens follows the pointer on the next frame.
    const best = pickMapTargetAt(this._clickTargets, mx, my);
    if (best !== this._hoverTarget) {
      if ((best && best.id) !== (this._hoverTarget && this._hoverTarget.id)) this._hoverSince = this._nowMs();
      this._hoverTarget = best;
    }
    this._drawPending = true;
    this._wake();
    this._canvas.style.cursor = best ? 'pointer' : (this._isYouAt(mx, my) ? 'grab' : 'crosshair');
  },

  _onMouseUp() {
    this._dragging = false;
    this._dragStart = null;
  },

_onMouseLeave() {
    if (this._line) return; // a captured line keeps its pointer until it is released
    this._dragging = false;
    this._dragStart = null;
    this._hold = null;
    this._hoverTarget = null;
    this._pointer = null;
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
      const viewport = this._cameraViewport(w, h);
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
      // The scope centres on the clear field (see _drawLocal), so the zoom anchors there too.
      const field = this._clearField(w, h);
      const ox = field.x + field.width / 2;
      const oy = field.y + field.height / 2;
      const wx = cam.cx + sign * (mx - ox) / (baseScale * oldZoom);
      const wy = cam.cy + sign * (my - oy) / (baseScale * oldZoom);

      cam.cx = wx - sign * (mx - ox) / (baseScale * nextZoom);
      cam.cy = wy - sign * (my - oy) / (baseScale * nextZoom);
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
    // The click that ends a laid line is part of that gesture, not a second selection.
    if (this._suppressClickUntil && this._nowMs() < this._suppressClickUntil) return;
    const rect = this._canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;

    const best = pickMapTargetAt(this._clickTargets, mx, my);

    if (best) {
      this._selectedTarget = best;
      this.triggerScanRing(best.sx, best.sy, INK.ink0);
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
    if (best) this._commitCourse(best);
  },

  /**
   * Lay a course to a mark: the ONE commit path, shared by double-click and a released line.
   * A sector asks the world's planner for the route; everything is then armed through ui:setCourse.
   */
  _commitCourse(target, { lock = false } = {}) {
    const payload = resolveCourseTarget(target);
    if (!payload || !this._ctx || !this._ctx.bus) return false;
    if (payload.type === 'sector' && payload.sectorId) {
      this._ctx.bus.emit('world:requestRoute', { targetSectorId: payload.sectorId, mode: 'fuel' });
    }
    this._ctx.bus.emit('ui:setCourse', payload);
    this._ctx.bus.emit('toast', { text: 'Course set: ' + (payload.label || 'target'), kind: 'info', ttl: 3 });
    // A laid line locks in before the chart hands over: the beam swells into the course, one ice
    // pulse runs it end to end and the foot's tape lights, then the chart closes (~half a second).
    // The commit itself has already happened above, exactly as a double-click commits it.
    const pts = this._previewPts;
    if (lock && HAS_DOC && this._visible && !this._reduceMotion && Array.isArray(pts) && pts.length > 1
      && typeof setTimeout === 'function') {
      const level = this._activeLevel();
      this._lock = {
        t0: this._nowMs(),
        pts: pts.map((pt) => ({ x: pt.x, y: pt.y })),
        trim: level === 'galaxy' ? (this._galaxyTokenR || 20) + 3 : 13,
      };
      // The Lamp Key lights and the foot's DESTINATION rolls to the course being locked in.
      if (this._engageButton && this._engageButton.classList) this._engageButton.classList.add('is-locking');
      this._lock.dest = payload.label || 'Course';
      if (payload.type === 'sector' && payload.sectorId) {
        const plan = this._previewPathTo(payload.sectorId);
        const ids = plan && Array.isArray(plan.ids) ? plan.ids : null;
        if (ids && ids.length > 1) {
          const st = this._ctx && this._ctx.state;
          this._lock.next = `${sectorNameOf(st, ids[0])} → ${sectorNameOf(st, ids[1])}`;
          this._lock.nextDetail = `leg 1/${ids.length - 1}`;
        }
      }
      this._lastNavFootKey = null;
      if (this._navFootEl && this._navFootEl.classList) {
        this._navFootEl.classList.remove('is-locking');
        void this._navFootEl.offsetWidth;
        this._navFootEl.classList.add('is-locking');
      }
      this.refresh();
      const ctx = this._ctx;
      if (this._lockTimer) clearTimeout(this._lockTimer);
      this._lockTimer = setTimeout(() => {
        this._lockTimer = null;
        this._lock = null;
        if (this._navFootEl && this._navFootEl.classList) this._navFootEl.classList.remove('is-locking');
        if (this._engageButton && this._engageButton.classList) this._engageButton.classList.remove('is-locking');
        if (this._visible) popCurrentScreen(ctx);
      }, CHART_LOCK_MS);
      return true;
    }
    popCurrentScreen(this._ctx);
    return true;
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

_draw() {
    const g0 = this._g;
    if (!g0 || !this._canvas) return;
    const g = safeChartContext(g0);
    const state = this._ctx && this._ctx.state;
    const w = this._canvas.width / this._dpr, h = this._canvas.height / this._dpr;
    // The canvas clears to transparent: the sky behind the screen is the ground.
    g.clearRect(0, 0, w, h);
    this._clickTargets.length = 0;
    this._lastAmbientDraw = this._nowMs();
    if (!state) return;
    // The screen has drawn its first frame — the capture protocol (KIT_SPEC §13) waits for this.
    if (this._root && this._root.dataset && this._root.dataset.kReady !== '1') this._root.dataset.kReady = '1';

    const level = levelForZoom(this._zoom);
    if (this._lastDrawLevel !== level) {
      this._lastDrawLevel = level;
      this._domRefreshPending = true;
    }

    // Update search placeholder to match the active scale.
    const searchInput = this._root && this._root.querySelector('.gm-search-input');
    if (searchInput) {
      const placeholder = level === 'local' ? 'Search local space… (Press /)' : level === 'system' ? 'Search system… (Press /)' : 'Search galaxy… (Press /)';
      if (searchInput.placeholder !== placeholder) searchInput.placeholder = placeholder;
    }

    const levelLabel = level.toUpperCase();
    if (this._levelEl && this._levelEl.textContent !== levelLabel) {
      this._levelEl.textContent = levelLabel;
    }
    if (this._root && this._root.dataset && this._root.dataset.scale !== level) this._root.dataset.scale = level;

    // Contact memory accrues whenever the chart is reading the near field (not GALAXY).
    if (level !== 'galaxy') this._syncLocalIntel(state);

    // Resolved once per frame; the foot band and the framing controls both read this one object.
    const navContext = this._navContext(state);
    this._lastNavContext = navContext;

    this._lineReading = null;
    if (level === 'galaxy') this._drawGalaxy(g, state, w, h);
    else if (level === 'system') this._drawSystem(g, state, w, h);
    else this._drawLocal(g, state, w, h);

    // THE NAVIGATION FOOT — refreshed on the SHARED path, after the level, so the four answers are
    // present at every scale by construction. It is DOM in the layout's foot row, not a plate.
    this._updateNavFoot(navContext);
    this._syncFramingControls(navContext);

    // SLICE C: the ribbon rides the shared draw path so it cannot stop tracking the executor at one scale.
    this._updateRibbon(state);

    // Hover: a lens of light under a mark the pointer rests on (tokens and marks lift themselves; this
    // is the quieter ring for everything else). Resolved against THIS frame's click targets.
    if (this._hoverTarget && !this._line) {
      const hoverId = this._hoverTarget.id;
      const selectedId = this._selectedTarget ? this._selectedTarget.id : null;
      if (hoverId != null && hoverId !== selectedId && level !== 'galaxy') {
        for (const target of this._clickTargets) {
          if (!target || target.id !== hoverId || target.kind === 'zone') continue;
          if (target.kind === 'station' || target.kind === 'gate' || target.kind === 'poi' || target.kind === 'ship' || target.kind === 'asteroid') break;
          const lift = this._liftAmount(this._nowMs());
          drawBandRing(g, target.sx, target.sy, Math.min(40, (target.radiusPx || 14) + 3), { band: 6, bandA: 0.14 * lift, edge: 1.4, edgeA: 0.55 * lift });
          break;
        }
      }
    }

    // The lock-in: the laid line swells into the course and one ice pulse runs it end to end.
    if (this._lock && Array.isArray(this._lock.pts)) {
      const t = Math.max(0, Math.min(1, (this._nowMs() - this._lock.t0) / CHART_LOCK_MS));
      const swell = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65 * 0.6;
      // Stopped at each disc's rim: the course lies between the sectors, never over their renders.
      const segs = trimPolylineSegments(this._lock.pts, this._lock.trim || 0);
      const lens = segs.map(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y));
      const total = lens.reduce((sum, v) => sum + v, 0);
      segs.forEach((seg, i) => drawHandBeam(g, seg, { lock: swell, head: i === segs.length - 1 }));
      let run = Math.min(1, t / 0.8) * total;
      for (let i = 0; i < segs.length; i += 1) {
        if (run <= lens[i] || i === segs.length - 1) {
          const u = lens[i] > 0 ? Math.min(1, run / lens[i]) : 1;
          const fade = 1 - Math.max(0, t - 0.8) / 0.2;
          drawPathPulse(g, segs[i], u, { a: fade });
          // the ship rides the line it has just been given, thrown along the course to its end
          const [a0, b0] = segs[i];
          const hx = a0.x + (b0.x - a0.x) * u;
          const hy = a0.y + (b0.y - a0.y) * u;
          g.save();
          g.globalAlpha = Math.max(0, fade);
          g.translate(hx, hy);
          g.fillStyle = 'rgba(5, 7, 10, 0.72)';
          g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill();
          g.rotate(Math.atan2(b0.y - a0.y, b0.x - a0.x));
          g.fillStyle = CHART_INK.lit(1);
          g.beginPath();
          g.moveTo(7, 0); g.lineTo(-5, -4.4); g.lineTo(-2.6, 0); g.lineTo(-5, 4.4);
          g.closePath();
          g.fill();
          g.restore();
          break;
        }
        run -= lens[i];
      }
    }

    // The hold ring: a still press on empty space turning into a laid line.
    if (this._hold && !this._line) {
      const p = (this._nowMs() - this._hold.t0 - 90) / (CHART_LINE_HOLD_MS - 90);
      if (p > 0) drawHoldRing(g, this._hold.x, this._hold.y, p);
    }

    // The reading that rides a laid line, over everything.
    if (!this._lineReading || !this._lineReading.numerals) { this._lastReadingRect = null; this._lastReadingSeat = null; }
    if (this._lineReading) {
      const field = this._clearField(w, h);
      // The reading keeps off the marks and their names (the drawn label blocks).
      const avoid = [];
      for (const t of this._clickTargets) {
        if (!t || t.kind === 'zone' || !Number.isFinite(t.sx)) continue;
        avoid.push({ x: t.sx, y: t.sy, r: Math.min(60, (t.radiusPx || 12) + 6), w: 2 });
      }
      for (const lb of this._lastLabelLayout || []) {
        if (!lb || !lb.visible) continue;
        avoid.push({ x: lb.x + lb.width / 2, y: lb.y + lb.height / 2, r: Math.max(lb.width, lb.height) / 2, w: 1 });
      }
      if (this._lineReading.numerals) {
        const r = this._lineReading;
        const size = drawLineReadingLarge(g, r.x, r.y, { ...r, measureOnly: true });
        const obs = this._readingObstacles || { discs: [], reserved: [] };
        // the reading keeps off the line it describes, too
        const beam = [];
        const pp = Array.isArray(this._previewPts) ? this._previewPts : [];
        for (let i = 1; i < pp.length; i += 1) beam.push({ x1: pp[i - 1].x, y1: pp[i - 1].y, x2: pp[i].x, y2: pp[i].y });
        const key = `${Math.round(r.x)},${Math.round(r.y)}`;
        const prev = this._lastReadingSeat && this._lastReadingSeat.key === key ? this._lastReadingSeat : null;
        const seat = size ? placeChartCallout({ x: r.x, y: r.y, r: Math.max(10, (r.clear || 12) - 4) }, size.width, size.height, {
          bounds: { x: field.x + 6, y: field.y + 6, width: field.width - 12, height: field.height - 12 },
          reserved: this._reservedLabelRects(w, h, obs.reserved),
          // the names may give way to the reading (they keep 24 px off it from the next frame on)
          soft: obs.labels || [],
          discs: obs.discs,
          // the reading never lies across the sector's gate ring (its leader may cross it)
          rings: (obs.rings || []).map((ring) => ({ ...ring, clear: ring.hard ? 14 : ring.clear })),
          segments: (obs.segments || []).concat(beam, beam, beam),
          prefer: prev,
        }) : null;
        const drawn = drawLineReadingLarge(g, r.x, r.y, { ...r, bounds: field, avoid, seat });
        this._lastReadingRect = drawn;
        this._lastReadingSeat = drawn ? { key, x: drawn.x, y: drawn.y } : null;
      }
      else drawLineReading(g, this._lineReading.x, this._lineReading.y, { ...this._lineReading, bounds: field, avoid });
    }

    // Scan rings: one expanding ring of bone light, fading.
    for (const ring of this._scanRings || []) {
      const a = 1 - ring.t / ring.maxT;
      drawBandRing(g, ring.x, ring.y, Math.max(1, ring.r), { band: 5, bandA: 0.16 * a, edge: 1.6, edgeA: 0.8 * a });
    }

    // Level-transition iris: a ring of light and the scale name, gone in under half a second, so
    // threshold crossings read as travel through one continuous instrument.
    if (this._iris) {
      const iris = this._iris;
      const p = Math.max(0, Math.min(1, iris.t / iris.maxT));
      const alpha = 1 - p;
      const radius = Math.min(w, h) * (0.07 + p * 0.55);
      drawBandRing(g, w / 2, h / 2, radius, { band: 8, bandA: 0.14 * alpha, edge: 1.8, edgeA: 0.8 * alpha });
      drawBandRing(g, w / 2, h / 2, radius * 0.92, { band: 0, edge: 1, edgeA: 0.4 * alpha });
      if (p < 0.72) {
        g.save();
        g.globalAlpha = alpha;
        g.font = chartFont(800, 22, { stretch: 'expanded' });
        setTracking(g, 0.18, 22);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = CHART_INK.lit(1);
        g.fillText(iris.label, w / 2, h / 2);
        g.font = chartFont(650, 12);
        setTracking(g, 0.24, 12);
        g.fillStyle = CHART_INK.bone(0.7);
        g.fillText('SCALE TRANSIT', w / 2, h / 2 + 22);
        setTracking(g, 0, 12);
        g.restore();
      }
    }
  },

  /** How lifted the hovered (or snapped) mark is, 0..1 — the lens rising under the pointer. */
  _liftAmount(now) {
    if (this._reduceMotion) return 1;
    const t = Math.max(0, Math.min(1, (now - (this._hoverSince || 0)) / 180));
    return 1 - Math.pow(1 - t, 3);
  },

  /** A repaint request handed to the token loader: a render that lands mid-view appears at once. */
  _tokenReadyHandler() {
    if (!this._tokenReady) this._tokenReady = () => { galaxyMapScreen._drawPending = true; galaxyMapScreen._wake(); };
    return this._tokenReady;
  },

  /**
   * The chart's clear field, in canvas pixels: between the lens rail and the inspector, under the
   * heading and over the foot. Marks outside it stand as edge ticks on its border; nothing is printed
   * under the chrome. Measured with the chrome rects (at most every 250 ms). Headless: the canvas.
   */
  _clearField(w, h) {
    const fallback = { x: 16, y: 16, width: Math.max(1, w - 32), height: Math.max(1, h - 32) };
    if (!HAS_DOC || !this._root || !this._canvas || typeof this._canvas.getBoundingClientRect !== 'function') return fallback;
    const now = this._nowMs();
    const cache = this._clearFieldCache;
    if (cache && cache.w === w && cache.h === h && now - cache.at < 250) return cache.rect;
    const frame = this._canvas.getBoundingClientRect();
    const rectOf = (sel) => {
      const el = typeof this._root.querySelector === 'function' ? this._root.querySelector(sel) : null;
      if (!el || typeof el.getBoundingClientRect !== 'function') return null;
      const r = el.getBoundingClientRect();
      if (!(r && r.width > 0 && r.height > 0)) return null;
      return { left: r.left - (frame.left || 0), top: r.top - (frame.top || 0), right: r.right - (frame.left || 0), bottom: r.bottom - (frame.top || 0), width: r.width, height: r.height };
    };
    let left = 16, right = w - 16, top = 16, bottom = h - 16;
    const rail = rectOf('.gm-left-rail');
    const insp = rectOf('.gm-right-inspector');
    const apron = rectOf('.gm-navfoot');
    const ribbon = rectOf('#gm-route-ribbon');
    const lever = rectOf('.gm-rail');
    // No chrome laid out (a headless fixture, or the frame before layout): the whole canvas.
    if (!rail && !insp && !lever) return fallback;
    if (rail && rail.width < w * 0.5 && rail.left < w * 0.3) left = Math.max(left, rail.right + 18);
    if (insp && insp.width < w * 0.5 && insp.left > w * 0.5) right = Math.min(right, insp.left - 18);
    if (lever && lever.bottom < h * 0.5) top = Math.max(top, lever.bottom + 12);
    if (apron && apron.top > h * 0.5) bottom = Math.min(bottom, apron.top - (h < 820 ? 16 : 30));
    // Before the first frame fills the foot its tape has no height yet: reserve what it will take.
    else if (!apron) bottom = Math.min(bottom, h - Math.max(150, h * 0.17));
    if (ribbon && ribbon.top > h * 0.5 && ribbon.left < (left + right) / 2) bottom = Math.min(bottom, ribbon.top - 14);
    let rect = { x: left, y: top, width: right - left, height: bottom - top };
    if (!(rect.width > 220 && rect.height > 160)) rect = fallback;
    this._clearFieldCache = { w, h, at: now, rect };
    return rect;
  },

  /**
   * The camera's viewport: the whole canvas (so a span keeps its scale), centred on the clear field
   * rather than on the canvas, so the chart's subject sits between the rails and not under the
   * heading. mapCamera honours viewport.x/y in both directions, so the wheel's anchor holds.
   */
  _cameraViewport(w, h) {
    const field = this._clearField(w, h);
    return { x: field.x + field.width / 2 - w / 2, y: field.y + field.height / 2 - h / 2, width: w, height: h };
  },

  /**
   * GALAXY's framing: the space you know — every charted sector and the course you hold — fitted to
   * the clear field, never tighter than the galaxy level allows. Null headless (no canvas size).
   */
  _galaxyFrame(only = null) {
    const state = this._ctx && this._ctx.state;
    const cw = this._canvas ? this._canvas.width / (this._dpr || 1) : 0;
    const ch = this._canvas ? this._canvas.height / (this._dpr || 1) : 0;
    if (!state || !(cw > 0 && ch > 0)) return null;
    const ids = new Set();
    if (Array.isArray(only)) {
      for (const id of only) if (id) ids.add(id);
    } else {
      for (const s of sectorRecords(state)) if (s && s.id && isSectorCharted(state, s)) ids.add(s.id);
      const route = state.nav && state.nav.route;
      for (const leg of (route && route.legs) || []) { if (leg.from) ids.add(leg.from); if (leg.to) ids.add(leg.to); }
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const id of ids) {
      const o = sectorLocalToGlobalForSector({ x: 0, z: 0 }, id);
      if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.z)) continue;
      minX = Math.min(minX, o.x); maxX = Math.max(maxX, o.x);
      minZ = Math.min(minZ, o.z); maxZ = Math.max(maxZ, o.z);
    }
    if (!Number.isFinite(minX)) return null;
    this._clearFieldCache = null; // measure the chrome as it stands now, not as it stood a moment ago
    const field = this._clearField(cw, ch);
    const pad = SECTOR_ORIGIN_LATTICE_WU * 1.25;
    const minor = Math.min(cw, ch);
    const fitX = (maxX - minX + pad * 2) * minor / Math.max(1, field.width);
    const fitZ = (maxZ - minZ + pad * 2) * minor / Math.max(1, field.height);
    // names hang beside their tokens: the outermost tokens keep a name's width of room in the field,
    // where that costs the chart little scale (at most a tenth)
    const roomX = (maxX - minX + pad * 2) * minor / Math.max(1, field.width - Math.min(150, field.width * 0.16));
    const span = Math.max(fitX, fitZ, Math.min(roomX, Math.max(fitX, fitZ) * 1.1));
    return {
      focusGlobal: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 },
      spanWU: Math.max(LEVEL_SYSTEM_AT_SPAN_WU * 1.6, Math.min(CHART_SPAN_MAX_WU, span)),
    };
  },

  /**
   * SYSTEM's span: the sector's gate ring (where its doors stand) fitted to the clear field with a
   * margin, kept inside the system level. Null headless or for a sector with no gates.
   */
  _systemSpan() {
    const state = this._ctx && this._ctx.state;
    const cw = this._canvas ? this._canvas.width / (this._dpr || 1) : 0;
    const ch = this._canvas ? this._canvas.height / (this._dpr || 1) : 0;
    if (!state || !(cw > 0 && ch > 0)) return null;
    let model = null;
    try { model = buildSystemModel(state, null, { claimsSystem: this._claimsSystem() }); } catch (_) { return null; }
    const radii = [];
    for (const pnt of (model && model.points) || []) {
      if (pnt.kind === 'gate' && pnt.drawPos) radii.push(Math.hypot(pnt.drawPos.x, pnt.drawPos.z));
    }
    if (!radii.length) return null;
    const ringWU = radii.reduce((a, b) => a + b, 0) / radii.length;
    this._clearFieldCache = null;
    const field = this._clearField(cw, ch);
    const minor = Math.min(cw, ch);
    const need = (ringWU * 2 + 1500) * minor / Math.max(1, Math.min(field.height, field.width));
    return Math.max(LEVEL_LOCAL_AT_SPAN_WU * 1.08, Math.min(LEVEL_SYSTEM_AT_SPAN_WU * 0.97, need));
  },

  /**
   * Seat this frame's labels with the anchored placer (src/ui/orrery/chartLabels.js): every name
   * within a few pixels of its mark or on a leader to it, never over a mark, never across a ring,
   * never outside the clear field. The marks already on the table (this frame's click targets) are
   * obstacles; `extra` adds rings, discs, lanes and rects a level knows about.
   */
  _placeLabels(candidates, w, h, { reserved = [], rings = [], discs = [], segments = [] } = {}) {
    // A laid line's reading hangs over the chart: names keep 24 px clear of where it stands.
    const readingRect = this._line && this._lastReadingRect ? this._lastReadingRect : null;
    const keepOff = readingRect
      ? [{ x: readingRect.x - 24, y: readingRect.y - 24, width: readingRect.width + 48, height: readingRect.height + 48 }]
      : [];
    const field = this._clearField(w, h);
    const marks = [];
    for (const t of this._clickTargets) {
      if (!t || t.kind === 'zone' || t.edgeTick || !Number.isFinite(t.sx) || !Number.isFinite(t.sy)) continue;
      marks.push({ x: t.sx, y: t.sy, r: Math.min(44, Math.max(6, (t.radiusPx || 10) - 2)) });
    }
    if (this._youScreen) marks.push({ x: this._youScreen.x, y: this._youScreen.y, r: 16 });
    // the mark the pointer rests on (or a line snaps to) always names itself
    const reach = [this._hoverTarget && this._hoverTarget.id, this._line && this._line.snap && this._line.snap.id]
      .filter((id) => id != null).map((id) => ':' + String(id));
    if (reach.length) {
      candidates = candidates.map((c) => (reach.some((tail) => String(c.id || '').endsWith(tail)) ? { ...c, force: true } : c));
    }
    // ...and keep off the line being laid (last frame's beam): a name never sits on the Hand
    const beam = [];
    const bp = this._line && Array.isArray(this._previewPts) ? this._previewPts : [];
    for (let i = 1; i < bp.length; i += 1) beam.push({ x1: bp[i - 1].x, y1: bp[i - 1].y, x2: bp[i].x, y2: bp[i].y });
    const placed = placeChartLabels(candidates, {
      bounds: field,
      reserved: this._reservedLabelRects(w, h, reserved.concat(keepOff)),
      discs: marks.concat(discs),
      rings,
      segments: beam.length ? segments.concat(beam, beam, beam, beam, beam, beam) : segments,
      priorityOf: mapLabelPriority,
      eligible: mapLabelEligible,
      maxLeader: 64,
    });
    // what the drag reading must keep off: the marks, the names and the level's own rects
    this._readingObstacles = {
      segments,
      rings,
      discs: marks.concat(discs),
      reserved,
      labels: placed.filter((pl) => pl.visible).map((pl) => ({ x: pl.x, y: pl.y, width: pl.width, height: pl.height })),
    };
    return placed;
  },

  /** What a laid (or focused) line would lay a course to, if anything. */
  _previewTarget() {
    if (this._line) return this._line.snap || null;
    const t = this._selectedTarget;
    if (!t || t.kind === 'waypoint' || t.objective) return null;
    const state = this._ctx && this._ctx.state;
    if (t.kind === 'sector') {
      const sid = t.sectorId || t.id;
      if (!sid || (state && sid === currentSectorId(state))) return null;
      const route = state && state.nav && state.nav.route;
      const dest = route && route.legs && route.legs.length ? route.legs[route.legs.length - 1].to : null;
      if (dest === sid) return null;
    }
    return resolveCourseTarget(t) ? t : null;
  },

  /** The planner's path to a sector: the world's own route when it has one, else the map's preview walk. */
  _previewPathTo(sectorId) {
    const state = this._ctx && this._ctx.state;
    if (!state || !sectorId) return null;
    const here = currentSectorId(state);
    if (!here || here === sectorId) return null;
    const route = this._previewRouteTo(sectorId);
    if (route && Array.isArray(route.legs) && route.legs.length) {
      return { ids: [route.legs[0].from, ...route.legs.map((leg) => leg.to)], route };
    }
    const walk = computePreviewRoute(state, here, sectorId);
    return walk ? { ids: walk, route: null } : null;
  },

  _drawGalaxyPreview(g, state, screenOf, { reduced, animT }) {
    const target = this._previewTarget();
    const laying = !!this._line;
    const you = this._youScreen;
    if (target && target.kind === 'sector') {
      const sid = target.sectorId || target.id;
      const plan = this._previewPathTo(sid);
      if (!plan) return;
      const pts = plan.ids.map((id) => screenOf.get(id)).filter(Boolean);
      if (pts.length < 2) return;
      this._previewPts = pts;
      drawHandBeam(g, pts, { alpha: laying ? 0.92 : 0.5, pulseT: laying && !reduced ? animT * 1.4 : null, width: laying ? 1 : 0.8 });
      if (laying) {
        const hops = plan.ids.length - 1;
        let wu = 0;
        for (let i = 1; i < plan.ids.length; i += 1) {
          const a = sectorLocalToGlobalForSector({ x: 0, z: 0 }, plan.ids[i - 1]);
          const b = sectorLocalToGlobalForSector({ x: 0, z: 0 }, plan.ids[i]);
          wu += Math.hypot(b.x - a.x, b.z - a.z);
        }
        const route = plan.route;
        const fuel = route && Number.isFinite(Number(route.totalFuel)) ? `FUEL ${Math.round(Number(route.totalFuel))}` : 'FUEL —';
        const charge = route && Array.isArray(route.legs) ? route.legs.reduce((s, leg) => s + (Number(leg.charge) || 0), 0) : 0;
        const dist = splitReading(formatDistanceWU(wu));
        const quiet = [fuel];
        if (charge > 0) quiet.push(`ALIGN ${formatDurationS(charge)}`);
        const anchor = Number.isFinite(target.sx) ? target : null;
        this._lineReading = {
          x: anchor ? anchor.sx : this._line.x, y: anchor ? anchor.sy : this._line.y,
          clear: anchor ? (anchor.radiusPx || 14) + 8 : 12,
          title: String(target.name || sectorNameOf(state, sid)).toUpperCase(),
          numerals: [{ value: String(hops), unit: hops === 1 ? 'JUMP' : 'JUMPS' }, { value: dist.value, unit: dist.unit }],
          figures: quiet.join('  ·  '),
          note: 'RELEASE TO LAY  ·  ESC TO DROP',
        };
      }
      return;
    }
    if (laying && you) this._drawLooseLine(g, you, reduced, animT);
  },

  _drawLocalPreview(g, state, { reduced, animT }) {
    const target = this._previewTarget();
    const laying = !!this._line;
    const you = this._youScreen;
    if (!you) return;
    if (target && Number.isFinite(target.sx) && Number.isFinite(target.sy)) {
      this._previewPts = [{ x: you.x, y: you.y }, { x: target.sx, y: target.sy }];
      drawHandBeam(g, this._previewPts, {
        alpha: laying ? 0.92 : 0.5, pulseT: laying && !reduced ? animT * 1.4 : null, width: laying ? 1 : 0.8,
      });
      if (laying) {
        const player = playerEntity(state);
        const payload = resolveCourseTarget(target);
        const pos = payload && payload.pos;
        const numerals = [];
        let figures = payload && payload.type === 'sector' ? 'ROUTE TO SECTOR' : '';
        if (player && player.pos && pos) {
          const d = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
          const dist = splitReading(formatDistanceWU(d));
          numerals.push({ value: dist.value, unit: dist.unit });
          const v = player.vel ? Math.hypot(player.vel.x || 0, player.vel.z || 0) : 0;
          if (v >= 1) numerals.push({ value: formatDurationS(d / v), unit: 'ETA' });
          else figures = [figures, 'ETA — MAKE WAY'].filter(Boolean).join('  ·  ');
        }
        this._lineReading = {
          x: target.sx, y: target.sy,
          clear: Math.min(30, (target.radiusPx || 12)) + 8,
          title: String(target.name || payload && payload.label || 'Mark').toUpperCase(),
          numerals,
          figures,
          note: 'RELEASE TO LAY  ·  ESC TO DROP',
        };
      }
      return;
    }
    if (laying) this._drawLooseLine(g, you, reduced, animT);
  },

  /** A line not yet on any mark: a faint beam to the pointer and a ring where it would land. */
  _drawLooseLine(g, you, reduced, animT) {
    const line = this._line;
    if (!line) return;
    drawHandBeam(g, [{ x: you.x, y: you.y }, { x: line.x, y: line.y }], { alpha: 0.42, head: false, width: 0.8, pulseT: reduced ? null : animT * 1.4 });
    drawBandRing(g, line.x, line.y, 10, { band: 5, bandA: 0.14, edge: 1.4, edgeA: 0.6 });
    this._lineReading = {
      x: line.x, y: line.y,
      title: 'LAY THE LINE',
      figures: ['ONTO A SECTOR, STATION', 'OR CONTACT'],
      note: 'RELEASE HERE OR ESC TO DROP',
    };
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
    const camera = this._cameraOrInit();
    const viewport = this._cameraViewport(w, h);
    // Pixels per GRAPH unit. `pixelsPerWU` is per WORLD unit and one graph unit is one lattice cell,
    // so the lattice quantum is the conversion — the same one buildGalaxyModel uses for the player.
    const graphScale = pixelsPerWU(camera, viewport) * SECTOR_ORIGIN_LATTICE_WU;
    const cam = this._cams.galaxy;

    this._view = { level: 'galaxy', baseScale: graphScale, pxPerWU: pixelsPerWU(camera, viewport), camera };
    const sx = (x) => viewport.x + w / 2 + (x - cam.cx) * graphScale;
    const sy = (y) => viewport.y + h / 2 + (y - cam.cy) * graphScale;
    const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
    const reduced = !!this._reduceMotion;
    const now = this._nowMs();
    const animT = this._animT || 0;
    const dpr = this._dpr || 1;

    // ORRERY: the sensor lattice behind the chart, brightening in a lens under the pointer.
    drawSensorLattice(g, w, h, { pointer: this._pointer, a: 0.11 });

    const field = this._clearField(w, h);
    const fieldPad = 14;
    const inGalaxyField = (x, y) => x >= field.x - fieldPad && x <= field.x + field.width + fieldPad
      && y >= field.y - fieldPad && y <= field.y + field.height + fieldPad;
    g.save();
    g.beginPath();
    g.rect(field.x - fieldPad, field.y - fieldPad, field.width + fieldPad * 2, field.height + fieldPad * 2);
    g.clip();

    // The token's rest size follows the chart's scale: about half the shortest charted lane, so the
    // produced art reads (≈64-80 px at the default framing) and neighbours never touch.
    let shortest = Infinity;
    for (const e of model.edges) {
      if (!e.charted) continue;
      shortest = Math.min(shortest, Math.hypot((e.bx - e.ax) * graphScale, (e.by - e.ay) * graphScale));
    }
    const tokenCap = Math.max(84, Math.min(w, h) * 0.08);
    const tokenSize = Math.max(36, Math.min(tokenCap, Number.isFinite(shortest) ? shortest * 0.44 : 68));
    const tokenR = tokenSize / 2;
    this._galaxyTokenR = tokenR;
    const screenOf = new Map();
    for (const n of model.nodes) screenOf.set(n.id, { x: sx(n.x), y: sy(n.y) });
    this._galaxyScreen = screenOf;

    // Lanes. A charted lane is a band of light with body under a crisp edge; a lane into unknown
    // space is only a stub of light leaving what you know, fading into rumour.
    for (const e of model.edges) {
      const ax = sx(e.ax), ay = sy(e.ay), bx = sx(e.bx), by = sy(e.by);
      if (e.charted) {
        drawBand(g, (c) => { c.moveTo(ax, ay); c.lineTo(bx, by); }, { band: 8, bandA: 0.27, edge: 1.7, edgeA: 0.62, halo: 20, haloA: 0.04 });
        continue;
      }
      if (!this._layers.discovery) continue;
      const na = nodeById.get(e.from);
      const nb = nodeById.get(e.to);
      const L = Math.hypot(bx - ax, by - ay);
      if (!(L > 1)) continue;
      const stub = (x0, y0, x1, y1, len, a) => {
        const k = Math.min(1, len / L);
        const grad = g.createLinearGradient ? g.createLinearGradient(x0, y0, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k) : null;
        if (grad) { grad.addColorStop(0, CHART_INK.bone(a)); grad.addColorStop(1, CHART_INK.bone(0)); }
        g.save();
        g.lineCap = 'round';
        g.strokeStyle = grad || CHART_INK.bone(a * 0.5);
        g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k); g.stroke();
        g.restore();
      };
      stub(ax, ay, bx, by, na && na.charted ? L * 0.42 : 22, na && na.charted ? 0.4 : 0.22);
      stub(bx, by, ax, ay, nb && nb.charted ? L * 0.42 : 22, nb && nb.charted ? 0.4 : 0.22);
    }

    // Traffic: ice packets running the charted lanes that carry it (the sectors' own traffic rates);
    // with the market lens on, trade pressure sets their direction and push. Reduced motion leaves a
    // still bead on each lane that carries traffic.
    for (const e of model.edges) {
      if (!e.charted) continue;
      const ra = sectorRecordById(state, e.from);
      const rb = sectorRecordById(state, e.to);
      const flow = Math.min(Number(ra && ra.trafficPerMin) || 0, Number(rb && rb.trafficPerMin) || 0);
      if (!(flow > 0)) continue;
      let dir = cosmeticHash01(e.from + '>' + e.to) < 0.5 ? 1 : -1;
      let strength = Math.min(1, flow / 20);
      if (this._layers.market) {
        const sa = sectorSignalFor(state, e.from);
        const sb = sectorSignalFor(state, e.to);
        if (sa && sb) {
          const gradient = sb.pricePressure - sa.pricePressure;
          if (Math.abs(gradient) >= 0.03) {
            dir = gradient > 0 ? 1 : -1;
            strength = Math.max(strength, Math.min(1, Math.abs(gradient) / 0.35));
          }
        }
      }
      const a = screenOf.get(dir > 0 ? e.from : e.to);
      const b = screenOf.get(dir > 0 ? e.to : e.from);
      if (!a || !b) continue;
      const phase = cosmeticHash01(e.from + '|' + e.to);
      const count = strength > 0.6 ? 2 : 1;
      for (let k = 0; k < count; k += 1) {
        const u = reduced ? (0.5 + k * 0.2) : (animT * (0.05 + strength * 0.07) + phase + k / count) % 1;
        drawLaneComet(g, a.x, a.y, b.x, b.y, u, { len: reduced ? 10 : 34 + strength * 22, a: 0.55 + strength * 0.4, trim: tokenR + 2 });
      }
    }

    // THE HAND: the plotted route as the amber beam, drawn in when it changes, a packet running it.
    const route = state.nav && state.nav.route;
    const routeDest = route && route.legs && route.legs.length ? route.legs[route.legs.length - 1].to : null;
    if (routeDest !== this._lastRouteDest) {
      this._lastRouteDest = routeDest;
      this._routeAnimTime = 1500;
      // The beam draws itself in when a course appears; nothing to draw in when it clears.
      this._routeDrawStart = routeDest ? now : null;
    }
    const routeScreenSegs = [];
    if (route && route.legs && this._layers.route) {
      const pts = [];
      for (const leg of route.legs) {
        const fromNode = screenOf.get(leg.from);
        const toNode = screenOf.get(leg.to);
        if (!fromNode || !toNode) continue;
        if (!pts.length) pts.push({ x: fromNode.x, y: fromNode.y });
        pts.push({ x: toNode.x, y: toNode.y });
      }
      for (let i = 1; i < pts.length; i += 1) {
        routeScreenSegs.push({ x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y });
      }
      if (pts.length > 1) {
        const progress = reduced ? 1 : Math.min(1, Math.max(0, (now - (this._routeDrawStart == null ? -1e9 : this._routeDrawStart)) / 520));
        // While a new line is being laid the held course steps back, so the line being laid leads.
        drawHandBeam(g, pts, { progress: 1 - Math.pow(1 - progress, 3), pulseT: reduced || this._line ? null : animT, alpha: this._line ? 0.4 : 1, tone: this._line ? 'bone' : 'hand' });
      }
    }

    // The line being laid (or the course a focused target would take): the same beam, previewed.
    this._drawGalaxyPreview(g, state, screenOf, { reduced, animT });

    // Draw Nodes
    const labelCandidates = [];
    const hoverId = this._hoverTarget ? this._hoverTarget.id : null;
    const snapId = this._line && this._line.snap ? this._line.snap.id : null;
    const shipAt = model.player && model.player.drawPos
      ? { x: sx(model.player.drawPos.x), y: sy(model.player.drawPos.z) } : null;
    const crestRects = [];
    const opTag = mapOperatorLabel(state);
    let tagOnToken = false;
    const chartedCount = model.nodes.filter((nn) => nn.charted).length;
    for (const n of model.nodes) {
      const x = sx(n.x), y = sy(n.y);
      const r = tokenR;
      const stale = n.confidence === 'stale';

      // Uncharted frontier: a faint star glint, never a question mark. A read bearing on it shows
      // as a count beside the glint.
      if (!n.charted) {
        // a glint stands inside the clear field, never on the chrome's margins
        const inside = x >= field.x + 12 && x <= field.x + field.width - 12 && y >= field.y + 12 && y <= field.y + field.height - 12;
        if (this._layers.discovery && inside) {
          drawGlint(g, x, y, { size: n.bearingCount > 0 ? 8 : 6, a: n.bearingCount > 0 ? 0.62 : 0.4 });
          if (n.bearingCount > 0) {
            drawBandRing(g, x, y, 13, { band: 5, bandA: 0.14, edge: 1.4, edgeA: 0.55 });
            g.save();
            g.font = chartFont(700, 12);
            g.fillStyle = CHART_INK.lit(0.95);
            g.textAlign = 'left'; g.textBaseline = 'middle';
            g.fillText(String(n.bearingCount), x + 17, y - 12);
            g.restore();
          }
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
        sx: x, sy: y, radiusPx: r + 4, kind: 'sector', id: n.id, sectorId: n.id, name: n.name,
        factionId: n.factionId, security: n.security, x: n.x, y: n.y,
        presence: n.presence, searchText: n.searchText,
        events: eventSignal,
        holdings: holdingsSignal,
        current: !!n.current,
        detail: `Sector · ${factionNameOf(n.factionId)} · Sec: ${n.security ? n.security.toFixed(2) : '0.00'} · Events: ${eventDetail} · Holdings: ${holdingsDetail}`
      });

      // The token: the sector's produced art (or its bone fallback), lifted under the pointer.
      const lift = (n.id === hoverId || n.id === snapId) ? this._liftAmount(now) : 0;
      const drawnR = drawSectorToken(g, n.id, x, y, tokenSize, {
        dpr, lift, stale, berths: sectorBerthCount(state, n.id), onReady: this._tokenReadyHandler(),
      });

      // Faction: the holder's own cut crest inlaid in the token's ring (centred on the band, in its own
      // small well) at half past seven on every token — one seat, clear of the name (names take the
      // east and west first) and of YOU (six o'clock). Never a coloured ring.
      if (this._layers.faction && n.ownerId) {
        const ang = Math.PI * 0.75;
        const crestSize = Math.max(16, Math.min(22, drawnR * 0.5));
        const cxC = x + Math.cos(ang) * drawnR;
        const cyC = y + Math.sin(ang) * drawnR;
        drawFactionCrest(g, n.ownerId, cxC, cyC, crestSize, { dpr, onReady: this._tokenReadyHandler() });
        crestRects.push({ x: cxC - crestSize / 2 - 4, y: cyC - crestSize / 2 - 4, width: crestSize + 8, height: crestSize + 8 });
      }

      // Conflict: a red arc of light round the token (war) or a bone one (tension), its count beside it.
      if (this._layers.events && eventSignal && (eventSignal.wars > 0 || eventSignal.tense > 0)) {
        const war = eventSignal.wars > 0;
        drawBand(g, (c) => c.arc(x, y, drawnR + 7, Math.PI * 0.1, Math.PI * 0.62), {
          rgb: war ? '255,80,56' : '236,230,216', band: 5, bandA: war ? 0.28 : 0.18, edge: 2, edgeA: war ? 0.95 : 0.7,
        });
        g.save();
        g.font = chartFont(700, 12);
        g.fillStyle = war ? CHART_INK.danger(1) : CHART_INK.lit(0.9);
        g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(String(eventSignal.wars + eventSignal.tense), x + (drawnR + 9) * 0.72, y + (drawnR + 9) * 0.72);
        g.restore();
      }

      if (this._layers.holdings && holdingsSignal && holdingsSignal.count > 0) {
        const hx = x - (drawnR + 6) * 0.72;
        const hy = y + (drawnR + 6) * 0.72;
        g.save();
        g.fillStyle = CHART_INK.lit(0.92);
        g.beginPath();
        g.moveTo(hx, hy - 5); g.lineTo(hx + 5, hy); g.lineTo(hx, hy + 5); g.lineTo(hx - 5, hy);
        g.closePath(); g.fill();
        g.font = chartFont(700, 12);
        g.textAlign = 'right'; g.textBaseline = 'middle';
        g.fillText(String(Math.min(9, holdingsSignal.count)), hx - 8, hy);
        g.restore();
      }

      // Contested sector (faction lens): a small bone diamond on the rim.
      if (this._layers.faction) {
        const sig = sectorSignalFor(state, n.id);
        if (sig && sig.contestMargin < 0.16) {
          const bx = x + (drawnR + 4) * 0.7, by = y - (drawnR + 4) * 0.7;
          g.save();
          g.fillStyle = CHART_INK.lit(0.9);
          g.beginPath();
          g.moveTo(bx, by - 4); g.lineTo(bx + 4, by); g.lineTo(bx, by + 4); g.lineTo(bx - 4, by);
          g.closePath(); g.fill();
          g.restore();
        }
      }

      // Unrest (security lens). Red keeps one meaning — this one is dangerous — so only lawless space
      // wears it: a red quarter arc on the ring's crown. Thin security is a short bone tick; ordinary
      // and policed space is silent.
      if (this._layers.security && n.security != null) {
        const sec = Math.max(0, Math.min(1, n.security));
        if (sec < 0.1) {
          drawBand(g, (c) => c.arc(x, y, drawnR + 3, -Math.PI * 0.75, -Math.PI * 0.25), {
            rgb: '255,80,56', band: 5, bandA: 0.28, edge: 2.2, edgeA: 0.95,
          });
        } else if (sec < 0.34) {
          drawBand(g, (c) => c.arc(x, y, drawnR + 3, -Math.PI * 0.6, -Math.PI * 0.4), {
            band: 4, bandA: 0.2, edge: 1.6, edgeA: 0.7,
          });
        }
      }

      // Selection: a lit band round the token — the only lit ring on the table.
      if (this._selectedTarget && this._selectedTarget.id === n.id) {
        drawBandRing(g, x, y, drawnR + 5, { band: 7, bandA: 0.3, edge: 2, edgeA: 1 });
      }

      // Sector label + its presence rows, as ONE solver-managed block (a name and the rows that
      // belong to it travel together, so the rows can never orphan from their name).
      const nodeInField = inGalaxyField(x, y);
      const nodeLines = [n.name];
      if (n.current && opTag && shipAt && Math.hypot(shipAt.x - x, shipAt.y - y) <= r) {
        nodeLines.push(opTag);
        tagOnToken = true;
      }
      // On a crowded chart (a long save knows many sectors) the faction sub-lines give way so every
      // sector keeps its name.
      const presenceRows = this._layers.faction && n.presence && n.presence.length && chartedCount <= 12
        ? galaxyPresenceMarkerRows(n.presence)
        : [];
      for (const row of presenceRows) nodeLines.push(`◆ ${row.label}`);
      if (stale) nodeLines.push('STALE');
      if (nodeInField) {
        const cand = makeMapLabelCandidate(g, {
          id: `sector:${n.id}`,
          kind: n.current ? 'gate' : 'station',
          maxLeader: 104,
          selected: !!(this._selectedTarget && this._selectedTarget.id === n.id),
          text: n.name,
          lines: nodeLines,
          x,
          y,
          anchorRadius: drawnR + 4,
          color: n.current ? CHART_INK.lit(1) : (stale ? CHART_INK.bone(0.62) : CHART_INK.lit(0.92)),
          secondaryColor: null,
        });
        // On a crowded chart a two-word name may set on two lines to keep its seat by the token.
        const words = String(n.name || '').split(/\s+/).filter(Boolean);
        if (words.length >= 2) {
          const cut = Math.ceil(words.length / 2);
          const alt = makeMapLabelCandidate(g, { ...cand, lines: [words.slice(0, cut).join(' '), words.slice(cut).join(' '), ...nodeLines.slice(1)] });
          cand.alts = [{ lines: alt.lines, width: alt.width + 8, height: alt.height, nameLines: 2 }];
        }
        labelCandidates.push(cand);
      }

      // Market price (market lens): the best known sell, as a reading beside the token.
      if (this._layers.market) {
        const record = sectorRecordById(state, n.id);
        const marketData = bestKnownSectorMarket(state, record, this._selectedCommodity);
        if (marketData) {
          const tint = memoryTint(marketData.ageS);
          g.save();
          g.font = chartFont(650, 12, { stretch: 'normal' });
          g.textAlign = 'left'; g.textBaseline = 'middle';
          g.lineJoin = 'round';
          g.strokeStyle = 'rgba(5, 7, 10, 0.86)'; g.lineWidth = 4;
          const text = `BEST ${marketData.sell}`;
          g.strokeText(text, x + drawnR + 6, y);
          g.fillStyle = tint.key === 'fresh' ? CHART_INK.phos(1) : CHART_INK.bone(0.72);
          g.fillText(text, x + drawnR + 6, y);
          g.restore();
        }
      }

      // An untracked contract's destination: a small bone diamond on the token's crown.
      if (this._layers.mission) {
        const activeMissions = state.missions && state.missions.active || [];
        const isMissionDest = activeMissions.some(m => m.status === 'active' && (m.destSectorId === n.id || (m.params && m.params.sectorId === n.id)));
        if (isMissionDest) {
          g.save();
          g.fillStyle = CHART_INK.lit(0.95);
          const mx = x, my = y - drawnR - 7;
          g.beginPath();
          g.moveTo(mx, my - 4); g.lineTo(mx + 4, my); g.lineTo(mx, my + 4); g.lineTo(mx - 4, my);
          g.closePath(); g.fill();
          g.restore();
        }
      }

      // Hazard: the warning glyph in red at the token's shoulder.
      if (this._layers.hazard) {
        const hasHazards = zonesForSector(n.id).some(z => zoneTypeMeta(z.type).hazard);
        if (hasHazards) {
          g.save();
          g.fillStyle = INK.red;
          g.font = FONT_UI(700, 13);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('⚠', x + drawnR * 0.78, y - drawnR * 0.78);
          g.restore();
        }
      }
    }

    // The map fades out over the field's last 48 px rather than stopping at a straight cut.
    {
      const F = 48;
      const x0 = field.x - fieldPad, y0 = field.y - fieldPad;
      const x1 = field.x + field.width + fieldPad, y1 = field.y + field.height + fieldPad;
      g.save();
      g.globalCompositeOperation = 'destination-out';
      const fade = (gx0, gy0, gx1, gy1, rx, ry, rw, rh) => {
        const grad = g.createLinearGradient ? g.createLinearGradient(gx0, gy0, gx1, gy1) : null;
        if (!grad) return;
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(rx, ry, rw, rh);
      };
      fade(x0, 0, x0 + F, 0, x0, y0, F, y1 - y0);
      fade(x1, 0, x1 - F, 0, x1 - F, y0, F, y1 - y0);
      fade(0, y0, 0, y0 + F, x0, y0, x1 - x0, F);
      fade(0, y1, 0, y1 - F, x0, y1 - F, x1 - x0, F);
      g.restore();
    }
    g.restore();

    // Resolve every sector block against the others before any of them paints. The goal plate is
    // reserved first (below) so a node label can never be placed under it.
    const goal = activeMapGoal(state);
    let goalNode = null;
    if (goal && goal.sectorId && (this._layers.route || this._layers.mission)) {
      goalNode = model.nodes.find((n) => n.id === goal.sectorId && n.charted) || null;
    }
    const galaxyReserved = [];
    this._goalLabelPlacement = null;
    const goalRingR = tokenR + 7;
    if (goalNode) {
      const gx = sx(goalNode.x), gy = sy(goalNode.y);
      const goalText = `GOAL · ${String(goal.label || 'OBJECTIVE').toUpperCase().slice(0, 22)}`;
      g.save();
      g.font = chartFont(700, 13);
      setTracking(g, 0.06, 13);
      const goalTextWidth = g.measureText(goalText).width;
      setTracking(g, 0, 12);
      g.restore();
      const goalLabelPos = goalLabelPlacement(goalTextWidth, gx, gy, w, h, routeScreenSegs, goalRingR + 8);
      galaxyReserved.push({
        x: goalLabelPos.rectX - 4,
        y: goalLabelPos.rectY - 3,
        width: goalTextWidth + 8,
        height: 20,
      });
      this._goalLabelPlacement = goalLabelPos;
    }
    // The operator tag ("YOU") is painted last beside the ship, outside the solver: reserve it.
    if (model.player && model.player.drawPos && !tagOnToken) {
      const opText = mapOperatorLabel(state);
      if (opText) {
        g.save();
        g.font = chartFont(700, 12);
        const opW = g.measureText(opText).width;
        g.restore();
        galaxyReserved.push({
          x: sx(model.player.drawPos.x) + 16 - 3,
          y: sy(model.player.drawPos.z) - 16 - 9,
          width: opW + 8,
          height: 20,
        });
      }
    }
    for (const rect of crestRects) galaxyReserved.push(rect);
    // The course's legs read on the beam: each leg's fuel at its midpoint, placed by the solver.
    if (route && route.legs && this._layers.route && !this._line) {
      route.legs.forEach((leg, i) => {
        const a = screenOf.get(leg.from);
        const b = screenOf.get(leg.to);
        if (!a || !b || !Number.isFinite(Number(leg.fuel))) return;
        const risk = Number(leg.interdict) > 0.25 ? '  ·  WATCHED' : '';
        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `leg:${i}`,
          kind: 'zone',
          text: `LEG ${i + 1} · ${Math.round(Number(leg.fuel))}F${risk}`,
          lines: [`LEG ${i + 1} · ${Math.round(Number(leg.fuel))}F${risk}`],
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          anchorRadius: 8,
          color: CHART_INK.phos(0.95),
        }));
      });
    }
    const laneSegs = [];
    for (const e of model.edges) {
      if (!e.charted) continue;
      laneSegs.push({ x1: sx(e.ax), y1: sy(e.ay), x2: sx(e.bx), y2: sy(e.by) });
    }
    const wellDiscs = [];
    for (const n of model.nodes) {
      const at = screenOf.get(n.id);
      if (at) wellDiscs.push({ x: at.x, y: at.y, r: n.charted ? tokenR + 4 : 9 });
    }
    if (goalNode) wellDiscs.push({ x: sx(goalNode.x), y: sy(goalNode.y), r: goalRingR + 4 });
    const galaxyLabelLayout = this._placeLabels(labelCandidates, w, h, {
      reserved: galaxyReserved, discs: wellDiscs, segments: laneSegs,
    });
    this._lastLabelLayout = galaxyLabelLayout;
    for (const placement of galaxyLabelLayout) {
      if (placement.visible) drawMapLabelBlock(g, placement);
    }

    // The current goal is the final galaxy paint and strongest hit target.
    if (goalNode) {
      let gx = sx(goalNode.x), gy = sy(goalNode.y);
      const routeHeadsHere = !this._line && this._layers.route && routeDest && routeDest === goal.sectorId;
      if (inGalaxyField(gx, gy)) {
        drawMapGoalMarker(g, gx, gy, goal.label, w, this._goalLabelPlacement || null, goalRingR, routeHeadsHere ? 'hand' : 'bone');
      } else {
        // Off the clear field the goal stands as a tick on its border, pointing the way.
        const tick = edgeTickOnField(field, field.x + field.width / 2, field.y + field.height / 2, gx, gy,
          routeHeadsHere ? INK.amberHot : INK.ink0, 'waypoint');
        drawEdgeTick(g, tick.x, tick.y, tick.color, tick.shape, tick.angle);
        gx = tick.x; gy = tick.y;
      }
      this._clickTargets.push({
        sx: gx,
        sy: gy,
        radiusPx: goalRingR + 6,
        kind: 'sector',
        id: goal.id,
        objective: true,
        markerKind: goal.markerKind,
        missionId: goal.missionId,
        sectorId: goal.sectorId,
        name: goal.label,
        x: goalNode.x,
        y: goalNode.y,
        detail: 'Current goal · ' + goal.label,
      });
    }

    // "You are here", last, so nothing can paint over it — at the ship's OWN position (graph frame).
    this._youScreen = null;
    if (model.player && model.player.drawPos) {
      const pxs = sx(model.player.drawPos.x);
      const pys = sy(model.player.drawPos.z);
      // Standing inside your own sector's disc the mark rides that token's ring at six o'clock, so
      // the sector's render is not covered; out in a corridor it stands where the ship is.
      const homeTok = model.player.sectorId ? screenOf.get(model.player.sectorId) : null;
      const onToken = homeTok && Math.hypot(pxs - homeTok.x, pys - homeTok.y) <= tokenR;
      let fx = onToken ? homeTok.x : pxs;
      let fy = onToken ? homeTok.y + tokenR + 2 : pys;
      // The mark never leaves the glass: off the clear field it stands on the field's border.
      if (!inGalaxyField(fx, fy)) {
        const pin = edgeTickOnField(field, field.x + field.width / 2, field.y + field.height / 2, fx, fy, INK.ink0, 'player');
        fx = pin.x; fy = pin.y;
      }
      this._youScreen = { x: fx, y: fy, sectorId: model.player.sectorId };
      drawPlayerFixMark(g, fx, fy, model.player.rot, {
        scale: onToken ? 0.8 : 0.92,
        pulse: reduced ? 0 : (0.5 + 0.5 * Math.sin(animT * 1.7)),
      });
      if (!tagOnToken) {
        g.save();
        g.font = chartFont(700, 12);
        setTracking(g, 0.14, 12);
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.strokeStyle = 'rgba(5, 7, 10, 0.9)';
        g.lineWidth = 4;
        g.strokeText(mapOperatorLabel(state), pxs + 16, pys - 16);
        g.fillStyle = CHART_INK.lit(1);
        g.fillText(mapOperatorLabel(state), pxs + 16, pys - 16);
        setTracking(g, 0, 12);
        g.restore();
      }
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
    // The expression below stays entirely in the SECTOR-LOCAL draw frame (ADR D2.1):
    // `cam.cx`/`cam.cy` are the camera's `focusGlobal` converted into this sector's local frame by
    // `_syncLegacyFromCamera`, and every `x` fed to `sx` is a `drawPos`. `check:map-frames` asserts
    // this draw site never projects a raw global `p.x`/`p.z`.
    const camera = this._cameraOrInit();
    const viewport = this._cameraViewport(w, h);
    const pxPerWU = pixelsPerWU(camera, viewport);
    const cam = this._cams.system;

    this._view = { level: 'system', baseScale: pxPerWU, pxPerWU, camera, contentSpanWU: span };
    const sx = (x) => viewport.x + w / 2 + (x - cam.cx) * pxPerWU;
    const sz = (z) => viewport.y + h / 2 + (z - cam.cy) * pxPerWU;
    const labelCandidates = [];
    const edgeTicks = [];
    const reduced = !!this._reduceMotion;
    const animT = this._animT || 0;
    setMapCanvasAriaLabel(this._canvas, 'system', this._layers.holdings ? model.ownership : []);

    // The clear field: the chart between the rails, the heading and the foot. A mark outside it
    // stands as an edge tick on its border pointing toward it, never printed under the chrome.
    const field = this._clearField(w, h);
    const inField = (x, y, pad = 0) => x >= field.x + pad && x <= field.x + field.width - pad
      && y >= field.y + pad && y <= field.y + field.height - pad;
    const fieldCx = field.x + field.width / 2;
    const fieldCy = field.y + field.height / 2;
    const pushEdgeTick = (x, y, color, shape, target) => {
      if (edgeTicks.length >= 24) return;
      edgeTicks.push(edgeTickOnField(field, fieldCx, fieldCy, x, y, color, shape, target));
    };

    drawSensorLattice(g, w, h, { pointer: this._pointer, a: 0.06 });

    g.save();
    g.beginPath();
    g.rect(field.x - 8, field.y - 8, field.width + 16, field.height + 16);
    g.clip();
    // The sector's own orrery: a graduated ring where its gates stand, a half ring inside it, the
    // ring's radius read on its crown. The doors sit on the ring; the furniture lives inside it.
    let dial = null;
    this._dialScreen = null;
    this._systemWarp = null;
    let ringWU = 0;
    const dialWords = [];
    let quarterFigure = null;
    {
      const gateR = [];
      for (const pnt of model.points) if (pnt.kind === 'gate' && pnt.drawPos) gateR.push(Math.hypot(pnt.drawPos.x, pnt.drawPos.z));
      ringWU = gateR.length ? gateR.reduce((a, b) => a + b, 0) / gateR.length : 0;
      if (ringWU > 0) {
        const ox = sx(0), oy = sz(0), R = ringWU * pxPerWU;
        dial = { x: ox, y: oy, r: R };
        this._dialScreen = dial;
        // Glass under the dial, so the paused world does not print through the sector's orrery.
        const glass = g.createRadialGradient ? g.createRadialGradient(ox, oy, R * 0.6, ox, oy, R + 46) : null;
        if (glass) {
          glass.addColorStop(0, 'rgba(5,7,10,0.62)');
          glass.addColorStop(0.82, 'rgba(5,7,10,0.62)');
          glass.addColorStop(1, 'rgba(5,7,10,0)');
          g.save();
          g.fillStyle = glass;
          g.beginPath(); g.arc(ox, oy, R + 46, 0, Math.PI * 2); g.fill();
          g.restore();
        }
        drawBandRing(g, ox, oy, R * 0.5, { band: 6, bandA: 0.2, edge: 1.3, edgeA: 0.36 });
        drawBandRing(g, ox, oy, R, { band: 9, bandA: 0.34, edge: 1.8, edgeA: 0.66, halo: 22, haloA: 0.04 });
        g.save();
        for (let i = 0; i < 120; i += 1) {
          const a = (i / 120) * Math.PI * 2;
          const major = i % 10 === 0;
          const len = major ? 12 : 5;
          g.strokeStyle = CHART_INK.bone(major ? 0.62 : 0.3);
          g.lineWidth = major ? 2 : 1.5;
          g.beginPath();
          g.moveTo(ox + Math.cos(a) * (R - 4), oy + Math.sin(a) * (R - 4));
          g.lineTo(ox + Math.cos(a) * (R - 4 - len), oy + Math.sin(a) * (R - 4 - len));
          g.stroke();
        }
        g.font = chartFont(640, 12, { stretch: 'normal' });
        g.textAlign = 'left'; g.textBaseline = 'middle';
        g.lineJoin = 'round';
        const tw = (t, px) => (typeof g.measureText === 'function' ? (g.measureText(t).width || t.length * px * 0.6) : t.length * px * 0.6);
        const ringText = `GATE RING ${formatDistanceWU(ringWU)}`;
        const ringW = tw(ringText, 12);
        // The radius inside the ring is not linear, and the dial says so beside its own figure: on
        // one line where the field has room, on two where it has not, and never past its edge.
        g.font = chartFont(600, 12, { stretch: 'normal' });
        const oneLine = 'RADIAL SCALE \u221A  \u00B7  NOT LINEAR';
        const fieldRight = field.x + field.width - 6;
        let lx = ox + R * 0.707 + 10;
        const ly = oy - R * 0.707 - 8;
        let scaleLines = [oneLine];
        if (lx + Math.max(ringW, tw(oneLine, 12)) > fieldRight) scaleLines = ['RADIAL SCALE \u221A', 'NOT LINEAR'];
        const blockW = Math.max(ringW, ...scaleLines.map((t) => tw(t, 12)));
        if (lx + blockW > fieldRight) lx = Math.max(field.x + 6, fieldRight - blockW);
        g.font = chartFont(640, 12, { stretch: 'normal' });
        g.strokeStyle = 'rgba(5, 7, 10, 0.86)'; g.lineWidth = 4;
        g.strokeText(ringText, lx, ly);
        g.fillStyle = CHART_INK.phos(0.92);
        g.fillText(ringText, lx, ly);
        g.font = chartFont(600, 12, { stretch: 'normal' });
        scaleLines.forEach((t, i) => {
          g.strokeText(t, lx, ly + 16 + i * 15);
          g.fillStyle = CHART_INK.bone(0.72);
          g.fillText(t, lx, ly + 16 + i * 15);
        });
        dialWords.push({ x: lx - 2, y: ly - 9, width: blockW + 4, height: 34 + (scaleLines.length - 1) * 15 });
        g.restore();
        // The half ring stands at a true quarter of the gate ring's reach; its figure is seated on
        // the ring once the marks are down (where it is clearest of them).
        g.save();
        g.font = chartFont(640, 12, { stretch: 'normal' });
        quarterFigure = { text: formatDistanceWU(ringWU / 4), width: tw(formatDistanceWU(ringWU / 4), 12) };
        g.restore();
      }
    }

    // SQUARE-ROOT RADIAL SCALE (the dial's own law): inside the gate ring a mark stands at
    // R·√(r/R) from the centre, so the furniture packed near the sector's heart opens to fill the dial
    // while the gates stay on their ring. A presentation map over the linear projection: bearings
    // hold, a pan slides it rigidly and a zoom scales it whole (the map is scale-free).
    const warp = (X, Y) => {
      if (!dial) return { x: X, y: Y };
      const dx = X - dial.x;
      const dy = Y - dial.y;
      const d = Math.hypot(dx, dy);
      if (!(d > 1e-6) || d >= dial.r) return { x: X, y: Y };
      const k = Math.sqrt(dial.r / d);
      return { x: dial.x + dx * k, y: dial.y + dy * k };
    };
    // A disc under the map: the circle through its warped rim (centre = the rim's centroid).
    const warpDisc = (X, Y, r) => {
      if (!dial || !(r > 0)) { const c = warp(X, Y); return { x: c.x, y: c.y, r: Math.max(0, r || 0) }; }
      const rim = [];
      let mx = 0;
      let my = 0;
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * Math.PI * 2;
        const q = warp(X + Math.cos(a) * r, Y + Math.sin(a) * r);
        rim.push(q); mx += q.x; my += q.y;
      }
      mx /= 16; my /= 16;
      let rr = 0;
      for (const q of rim) rr += Math.hypot(q.x - mx, q.y - my);
      return { x: mx, y: my, r: rr / 16 };
    };
    if (dial) this._systemWarp = { ringWU, sectorId: model.sectorId };

    // Zones: regions of the sector as pools of light. Overlapping zones MERGE: each pool's light is laid
    // with 'lighten' (the brighter light wins, no darker Venn lens), and each rim is a band of light
    // clipped out of every other pool, so a cluster of zones wears one lit outline.
    const pools = model.zones.filter((z) => !(z.hazard && this._layers.hazard))
      .map((z) => ({ z, ...warpDisc(sx(z.x), sz(z.z), z.radius * pxPerWU) }));
    // The pools live inside the sector: clipped to the gate ring's inner edge.
    g.save();
    if (dial) { g.beginPath(); g.arc(dial.x, dial.y, Math.max(8, dial.r - 6), 0, Math.PI * 2); g.clip(); }
    g.save();
    g.globalCompositeOperation = 'lighten';
    for (const pool of pools) {
      const grad = g.createRadialGradient ? g.createRadialGradient(pool.x, pool.y, 0, pool.x, pool.y, pool.r) : null;
      if (grad) {
        grad.addColorStop(0, CHART_INK.bone(this._layers.faction ? 0.2 : 0.18));
        grad.addColorStop(0.7, CHART_INK.bone(0.08));
        grad.addColorStop(1, CHART_INK.bone(0.03));
      }
      g.fillStyle = grad || CHART_INK.bone(0.06);
      g.beginPath(); g.arc(pool.x, pool.y, pool.r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    for (const pool of pools) {
      g.save();
      for (const other of pools) {
        if (other === pool) continue;
        g.beginPath();
        g.rect(-1e4, -1e4, 3e4, 3e4);
        g.arc(other.x, other.y, Math.max(1, other.r - 1), 0, Math.PI * 2, true);
        g.clip('evenodd');
      }
      drawBandRing(g, pool.x, pool.y, pool.r, { band: 6, bandA: 0.34, edge: 1.5, edgeA: 0.72 });
      g.restore();
    }
    g.restore();
    for (const z of model.zones) {
      const zd = warpDisc(sx(z.x), sz(z.z), z.radius * pxPerWU);
      const x = zd.x, y = zd.y, rr = zd.r;

      // Zone centres are authored sector-local, but the click target arms an autopilot fix, which
      // world.js stores global.
      const zoneNav = sectorLocalToGlobalForSector({ x: z.x, z: z.z }, model.sectorId);
      this._clickTargets.push({
        sx: x, sy: y, radiusPx: Math.max(16, rr), kind: 'zone', id: z.id,
        x: zoneNav.x, z: zoneNav.z, radius: z.radius, name: z.name,
        factionId: z.factionId, detail: `Zone · ${z.typeLabel} · threat ${z.threat || 0}`
      });

      if (z.hazard && this._layers.hazard) {
        g.save();
        g.fillStyle = CHART_INK.danger(0.06);
        g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
        g.restore();
        drawBandRing(g, x, y, rr, { rgb: '255,80,56', band: 7, bandA: 0.2, edge: 1.8, edgeA: 0.85 });
        const hazardGlyph = HAZARD_CANVAS_GLYPHS[z.type] || 'warn';
        drawGlyph(g, hazardGlyph, x, y, 14, { color: INK.red });
        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `zone:${z.id}`,
          kind: 'hazard',
          text: `HAZARD · ${z.name.toUpperCase()}`,
          lines: [`HAZARD · ${z.name.toUpperCase()}`],
          x,
          y,
          anchorRadius: 5,
          color: INK.red,
        }));
      } else {
        // (the pool and its rim were laid above, merged with its neighbours)
        // A region's name reads inside its own pool, clear of the rim, next after the stations; a pool
        // too small for its name hangs it on a leader off its rim once the marks have their seats.
        const zoneLabel = makeMapLabelCandidate(g, {
          id: `zone:${z.id}`,
          kind: 'zone',
          text: z.name + (z.threat ? ` · THREAT ${z.threat}` : ''),
          lines: [z.name + (z.threat ? ` · THREAT ${z.threat}` : '')],
          x,
          y,
          anchorRadius: 3,
          inside: { x, y, r: rr },
          priority: 700,
          color: CHART_INK.bone(0.8),
        });
        labelCandidates.push(zoneLabel);
        // A pool that meets the gate ring may hang its name outside it, as the gates do; any other
        // region's name stays inside the sector's ring.
        const meetsRing = !!dial && Math.hypot(x - dial.x, y - dial.y) + rr >= dial.r - 30;
        labelCandidates.push({
          ...zoneLabel, id: `zone:${z.id}:rim`, rimLeader: true, rimOnly: true, unlessPlaced: zoneLabel.id, priority: 380,
          within: meetsRing ? null : dial,
          rimHidden: pools.filter((o) => o.z !== z).map((o) => ({ x: o.x, y: o.y, r: o.r })),
          rimClip: dial ? { x: dial.x, y: dial.y, r: dial.r - 8 } : null,
        });
      }
    }

    // Asteroid fields (discovery / market lens): a grain of rock inside a soft band, its ore named.
    if (this._layers.discovery || this._layers.market) {
      const sectorRecord = sectorRecordById(state, model.sectorId);
      const fields = sectorRecord && sectorRecord.fields ? sectorRecord.fields : [];
      for (const f of fields) {
        const cx = Number(f.center && f.center.x) || 0;
        const cz = Number(f.center && f.center.z) || 0;
        const radius = Number(f.clusterRadius) || Number(f.radius) || 300;
        const fd = warpDisc(sx(cx), sz(cz), radius * pxPerWU);
        const fx = fd.x, fy = fd.y, fr = fd.r;
        const glyph = asteroidScanGlyph(f.type);
        const fieldName = `${FIELD_NAME_BY_TYPE[f.type] || 'Ore'} field`;
        g.save();
        g.fillStyle = CHART_INK.bone(0.05);
        g.beginPath(); g.arc(fx, fy, fr, 0, Math.PI * 2); g.fill();
        const grains = Math.max(10, Math.min(40, Math.round(fr * 0.9)));
        for (let i = 0; i < grains; i += 1) {
          const a = i * 2.39996 + cosmeticHash01(String(f.id) + i) * 0.6;
          const rr = Math.sqrt((i + 0.5) / grains) * fr * 0.92;
          const s = 1.2 + cosmeticHash01(String(f.id) + ':s' + i) * 1.6;
          g.fillStyle = CHART_INK.bone(0.34 + cosmeticHash01(String(f.id) + ':a' + i) * 0.3);
          g.beginPath(); g.arc(fx + Math.cos(a) * rr, fy + Math.sin(a) * rr * 0.86, s, 0, Math.PI * 2); g.fill();
        }
        g.restore();
        drawBandRing(g, fx, fy, fr, { band: 5, bandA: 0.26, edge: 1.3, edgeA: 0.5 });
        // What it is and the ore it carries, named at the field's crown through the label solver.
        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `field:${f.id || glyph}`,
          kind: 'zone',
          text: `${fieldName} · ${glyph}`,
          lines: [`${fieldName} · ${glyph}`],
          x: fx,
          y: fy,
          anchorRadius: fr + 2,
          area: true,
          priority: 710,
          color: CHART_INK.lit(0.9),
        }));
      }
    }

    g.restore();

    // Claim freight and manufactured corridors share the existing Route layer beneath their marks.
    if (this._layers.route) {
      for (const marker of model.ownership) {
        if (marker.travelRoute) drawManufacturedTravelRoute(g, marker.travelRoute, sx, sz, true, warp);
      }
    }

    // Unique-wreck and rumor read layer. A rumor ring is selectable for its manual-search text,
    // but it never carries a navigable course target.
    if (this._layers.discovery) {
      for (const bearing of model.bearings) {
        const fixed = !!bearing.drawFixedPos;
        const point = bearing.drawFixedPos || bearing.drawCenter;
        if (!point) continue;
        const bd = warpDisc(sx(point.x), sz(point.z), fixed ? 0 : bearing.radius * pxPerWU);
        const x = bd.x, y = bd.y;
        const radiusPx = fixed ? 0 : bd.r;
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

        const phaseLabel = bearing.statusLabel || (bearing.manualSearch ? 'RUMOR SEARCH'
          : bearing.phase === 'salvaged' ? 'SALVAGED' : fixed ? 'FIXED' : 'READ BEARING');
        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `bearing:${bearing.wreckId}`,
          kind: 'bearing',
          text: `${phaseLabel} · ${bearing.name}`,
          lines: [`${phaseLabel} · ${bearing.name}`],
          x,
          y,
          anchorRadius: fixed ? 10 : radiusPx + 6,
          color: CHART_INK.lit(0.92),
          selected,
          named: true,
        }));
      }
    }

    // THE HAND at system scale: the course from the ship to its waypoint, drawn in, a packet running it.
    // Both ends are the converted pair (model.player, wpDraw) — raw globals ran off to the lattice corner.
    const wpKey = wpDraw ? `${Math.round(wpDraw.x)},${Math.round(wpDraw.z)}` : null;
    if (wpKey !== this._lastCourseKey) { this._lastCourseKey = wpKey; this._routeDrawStart = wpKey ? this._nowMs() : null; }
    if (wpDraw && this._layers.route && model.player) {
      const progress = reduced ? 1 : Math.min(1, Math.max(0, (this._nowMs() - (this._routeDrawStart == null ? -1e9 : this._routeDrawStart)) / 520));
      drawHandBeam(g, [
        warp(sx(model.player.drawPos.x), sz(model.player.drawPos.z)),
        warp(sx(wpDraw.x), sz(wpDraw.z)),
      ], { progress: 1 - Math.pow(1 - progress, 3), pulseT: reduced || this._line ? null : animT, head: false, alpha: this._line ? 0.4 : 1, tone: this._line ? 'bone' : 'hand' });
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
    const hoverId = this._hoverTarget ? this._hoverTarget.id : null;
    const snapId = this._line && this._line.snap ? this._line.snap.id : null;
    for (const p of model.points) {
      if (!p.drawPos) continue;
      const pw = warp(sx(p.drawPos.x), sz(p.drawPos.z));
      const x = pw.x, y = pw.y;
      const isGate = p.kind === 'gate';
      const isStation = p.kind === 'station';
      const displayName = isGate
        ? disambiguateGateLabel(p.name, p.drawPos.x, p.drawPos.z, 0, 0, systemGateNameCounts)
        : p.name;

      const pointMark = chartMarkSizes(p, pxPerWU);
      const target = {
        sx: x, sy: y, radiusPx: Math.max(pointMark.pipPx, isStation || isGate ? 14 : 10), kind: p.kind, id: p.id, x: p.x, z: p.z,
        entityId: p.entityId, stationId: p.stationId, targetSectorId: p.targetSectorId,
        name: displayName, factionId: p.factionId,
        mapKind: p.mapKind, stageId: p.stageId, stageLabel: p.stageLabel,
        coursePos: p.coursePos, courseLabel: p.courseLabel,
        courseArrivalRadius: p.courseArrivalRadius, statusLine: p.statusLine,
        ledger: p.ledger, history: p.history, searchText: p.searchText,
        detail: `${p.kind.toUpperCase()} · ${factionNameOf(p.factionId)}${p.statusLine ? ` · ${p.statusLine}` : ''}`
      };

      // Off the clear field: infrastructure stands as an edge tick; lesser points leave quietly.
      if (!inField(x, y, 6)) {
        if (isStation || isGate) pushEdgeTick(x, y, INK.ink0, isGate ? 'gate' : 'station', target);
        continue;
      }
      this._clickTargets.push(target);

      const lift = (p.id === hoverId || p.id === snapId) ? this._liftAmount(this._nowMs()) : 0;
      if (lift > 0.01) drawBandRing(g, x, y, 17 + lift * 3, { band: 7, bandA: 0.16 * lift, edge: 1.4, edgeA: 0.6 * lift });
      // Selection: a lit band — the only selection language on the table.
      if (this._selectedTarget && this._selectedTarget.id === p.id) {
        drawBandRing(g, x, y, 17, { band: 7, bandA: 0.3, edge: 2, edgeA: 1 });
      }

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
      // Lane furniture and minor points name themselves when reached for (hover, selection, a laid
      // line); stations, gates and anything with a status line always do.
      const reached = p.id === hoverId || p.id === snapId || !!(this._selectedTarget && this._selectedTarget.id === p.id);
      if (isStation || isGate || p.statusLine || reached) {
        const pointLabel = makeMapLabelCandidate(g, {
          id: `point:${p.id}`,
          kind: p.kind,
          outsideOf: isGate ? this._dialScreen : null,
          text: displayName,
          lines: pointLines,
          x,
          y,
          anchorRadius: Math.max(pointMark.nameplatePx, isStation || isGate ? 16 : 9),
          color: isStation || isGate ? CHART_INK.lit(0.97) : CHART_INK.bone(0.84),
          secondaryColor: marketTint,
          selected: !!(this._selectedTarget && this._selectedTarget.id === p.id),
        });
        // Where the chart is tight a name may take a shorter shape: a gate by its arrow alone, a
        // two-word name set on two lines.
        const alts = [];
        const name = String(displayName || '');
        const arrow = name.indexOf(' → ');
        if (isGate && arrow > 0) {
          const short = makeMapLabelCandidate(g, { ...pointLabel, lines: [name.slice(arrow + 1), ...pointLines.slice(1)] });
          alts.push({ lines: short.lines, width: short.width, height: short.height });
        }
        const words = name.split(/\s+/).filter(Boolean);
        if (!isGate && words.length >= 2) {
          const cut = Math.ceil(words.length / 2);
          const two = makeMapLabelCandidate(g, { ...pointLabel, lines: [words.slice(0, cut).join(' '), words.slice(cut).join(' '), ...pointLines.slice(1)] });
          alts.push({ lines: two.lines, width: two.width, height: two.height, nameLines: 2 });
        }
        if (alts.length) pointLabel.alts = alts;
        labelCandidates.push(pointLabel);
      }

      if (isStation && services.length > 0) {
        drawServicePictograms(g, x, y + 22, services);
      }

      // Mission relevance: a lit ring round a station a contract names.
      if (this._layers.mission) {
        const activeMissions = state.missions && state.missions.active || [];
        const isMissionDest = !!p.stationId && activeMissions.some(m => m.status === 'active' && m.destStationId === p.stationId);
        if (isMissionDest) drawBandRing(g, x, y, 13, { band: 4, bandA: 0.2, edge: 1.6, edgeA: 0.95 });
      }
    }

    // Player-owned bases: permanent operating landmarks, visually distinct from neutral POIs.
    if (this._layers.holdings) {
      for (const marker of model.ownership) {
        const draw = marker.drawPos;
        if (!draw || !Number.isFinite(draw.x) || !Number.isFinite(draw.z)) continue;
        const cw = warp(sx(draw.x), sz(draw.z));
        const x = cw.x, y = cw.y;
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
        if (!inField(x, y, 6)) { pushEdgeTick(x, y, marker.color, 'claim', target); continue; }
        this._clickTargets.push(target);

        drawBandRing(g, x, y, selected ? 13 : 11, { rgb: rgbTriplet(marker.color), band: 6, bandA: 0.22, edge: selected ? 2.5 : 1.8, edgeA: 1 });
        g.save();
        g.fillStyle = marker.color;
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

    // "You are here" — only for the sector you stand in (the model can survey a remote one).
    this._youScreen = null;
    if (model.player && model.player.inSector) {
      const yw = warp(sx(model.player.drawPos.x), sz(model.player.drawPos.z));
      const px = yw.x, py = yw.y;
      this._youScreen = { x: px, y: py };
      drawPlayerFixMark(g, px, py, model.player.rot, {
        scale: 1,
        pulse: reduced ? 0 : (0.5 + 0.5 * Math.sin(animT * 1.7)),
      });
    }

    let objectivePlacement = null;
    let wpScreen = null;
    if (wpDraw && (this._layers.route || this._layers.mission)) {
      let { x: wx, y: wy } = warp(sx(wpDraw.x), sz(wpDraw.z));
      const target = waypointClickTarget(wp, wpPos, wx, wy);
      if (!inField(wx, wy, 6)) {
        // The goal off the clear field: its tick on the field's border, pointing the way, and its
        // words beside the tick — never printed under the rails or the tape.
        const tick = edgeTickOnField(field, fieldCx, fieldCy, wx, wy, INK.amberHot, 'waypoint', target || undefined);
        edgeTicks.push(tick);
        wx = tick.x; wy = tick.y;
      } else {
        wpScreen = { x: wx, y: wy };
        if (target) this._clickTargets.push(target);
      }
      const objectiveLabel = waypointMapLabel(wp);
      const goalLabel = makeMapLabelCandidate(g, {
        id: 'objective:active-waypoint',
        kind: 'objective',
        objective: true,
        text: `GOAL · ${objectiveLabel.toUpperCase()}`,
        lines: [`GOAL · ${objectiveLabel.toUpperCase()}`],
        x: wx,
        y: wy,
        anchorRadius: 16,
        color: INK.amberHot,
      });
      // where the dial is tight the goal's words set on two lines instead of crossing its ring
      const goalTwo = makeMapLabelCandidate(g, { ...goalLabel, lines: ['GOAL', objectiveLabel.toUpperCase()] });
      goalLabel.alts = [{ lines: goalTwo.lines, width: goalTwo.width, height: goalTwo.height, nameLines: 2 }];
      labelCandidates.push(goalLabel);
    }
    const systemReserved = [];
    if (wpScreen && this._layers.route && model.player && model.player.drawPos) {
      // Reserve a stub of the course just off the pin so the goal's words cannot settle on the beam.
      const from = warp(sx(model.player.drawPos.x), sz(model.player.drawPos.z));
      const stub = waypointTetherReserveRect(from.x, from.y, wpScreen.x, wpScreen.y);
      if (stub) systemReserved.push(stub);
      systemReserved.push({ x: wpScreen.x - 16, y: wpScreen.y - 16, width: 32, height: 32 });
    }
    if (this._youScreen) systemReserved.push({ x: this._youScreen.x - 16, y: this._youScreen.y - 16, width: 32, height: 32 });
    if (dial && quarterFigure) {
      // The quarter-reach figure sits on the half ring where no mark stands near it (its flanks first;
      // the crown is where a region likes to set its name).
      const marksNow = this._clickTargets.filter((t) => t && t.kind !== 'zone' && Number.isFinite(t.sx))
        .map((t) => ({ x: t.sx, y: t.sy }));
      if (this._youScreen) marksNow.push(this._youScreen);
      if (wpScreen) marksNow.push(wpScreen);
      let seat = null;
      [180, 0, -90, 90, -135, -45, 135, 45].forEach((deg, i) => {
        const a = (deg * Math.PI) / 180;
        const qx = dial.x + Math.cos(a) * dial.r * 0.5;
        const qy = dial.y + Math.sin(a) * dial.r * 0.5;
        let clear = Infinity;
        for (const mk of marksNow) clear = Math.min(clear, Math.hypot(mk.x - qx, mk.y - qy));
        const score = Math.min(clear, 90) - i * 2;
        if (!seat || score > seat.score) seat = { qx, qy, score };
      });
      g.save();
      g.font = chartFont(640, 12, { stretch: 'normal' });
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(5, 7, 10, 0.9)'; g.lineWidth = 5;
      g.strokeText(quarterFigure.text, seat.qx, seat.qy);
      g.fillStyle = CHART_INK.bone(0.74);
      g.fillText(quarterFigure.text, seat.qx, seat.qy);
      g.restore();
      dialWords.push({ x: seat.qx - quarterFigure.width / 2 - 3, y: seat.qy - 6, width: quarterFigure.width + 6, height: 12 });
    }
    for (const r of dialWords) systemReserved.push(r);
    const poolRings = pools.map((pool) => ({
      x: pool.x, y: pool.y, r: pool.r, clear: 5,
      except: pools.filter((o) => o !== pool).map((o) => ({ x: o.x, y: o.y, r: o.r })),
    }));
    const dialRings = dial ? [{ x: dial.x, y: dial.y, r: dial.r, clear: 10, hard: true }] : [];
    const labelLayout = this._placeLabels(labelCandidates, w, h, {
      reserved: systemReserved, rings: dialRings.concat(poolRings),
    });
    this._lastLabelLayout = labelLayout;
    for (const placement of labelLayout) {
      if (!placement.visible) continue;
      if (placement.objective) objectivePlacement = placement;
      else drawMapLabelBlock(g, placement);
    }

    // Secondary mission points before the goal (a contract's other targets, a survey site).
    if (this._layers.mission) {
      for (const point of missionMapGeometry(state, trackedMissionOf(state))) {
        const local = globalToSectorLocalForSector(point, model.sectorId);
        const { x: mx, y: my } = warp(sx(local.x), sz(local.z));
        if (!inField(mx, my, 6)) continue;
        drawMissionPoint(g, mx, my, point.kind, point.done);
      }
    }

    // The line being laid, or the course a focused target would take.
    this._drawLocalPreview(g, state, { reduced, animT });

    // Objective marker renders last, with the first label reservation and strongest contrast.
    if (wpScreen && (this._layers.route || this._layers.mission)) {
      drawWaypointPin(g, wpScreen.x, wpScreen.y, waypointMapLabel(wp), w, objectivePlacement, this._line ? 'bone' : 'hand');
    } else if (objectivePlacement) {
      drawMapLabelBlock(g, objectivePlacement);
    }
    for (const tick of edgeTicks) {
      drawEdgeTick(g, tick.x, tick.y, tick.color, tick.shape, tick.angle);
      if (tick.target && tick.target.kind) {
        this._clickTargets.push({ ...tick.target, sx: tick.x, sy: tick.y, radiusPx: 14, edgeTick: true });
      }
    }
  },

  // --- LOCAL DRAW ---
  _localModelForState(state) {
    const simTime = Math.max(0, Number(state && state.simTime) || 0);
    const sectorId = currentSectorId(state);
    const key = `${simTime}|${sectorId || ''}|${this._localIntelSyncedAtS}`;
    if (!this._localModelDirty
      && this._localModelCache
      && this._localModelCacheState === state
      && this._localModelCacheKey === key) {
      return this._localModelCache;
    }
    const model = buildLocalModel(state, this._isHostile, {
      claimsSystem: this._claimsSystem(),
      intel: this._localIntel,
    });
    this._localModelCache = model;
    this._localModelCacheState = state;
    this._localModelCacheKey = key;
    this._localModelDirty = false;
    return model;
  },

_drawLocal(g, state, w, h) {
    // Fed by _draw before dispatch, so memory survives a trip out to SYSTEM and back.
    const model = this._localModelForState(state);
    let liveContactCount = 0;
    for (const contact of model.contacts || []) {
      if (contact && !contact.remembered) liveContactCount += 1;
    }
    this._localLiveContacts = liveContactCount;
    const cam = this._cams.local;
    const wp = state.nav && state.nav.waypoint;
    const wpPos = resolveWaypointPresentationPosition(state, wp);
    const nowS = Math.max(0, Number(state && state.simTime) || 0);
    const reduced = !!this._reduceMotion;
    const animT = this._animT || 0;

    const player = playerEntity(state);
    const px = player ? player.pos.x : 0;
    const pz = player ? player.pos.z : 0;

    // The local scope favors the immediate field: fit on a high percentile of what is worth
    // seeing (foreign furniture, remembered contacts and rocks never vote; the goal always does),
    // so a lone straggler falls off-frame into an edge tick instead of setting the scale.
    let span = 1500;
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
    if (wpPos) {
      fitSpans.push(Math.hypot(wpPos.x - px, wpPos.z - pz));
    }
    let m = 0;
    if (fitSpans.length) {
      fitSpans.sort((a, b) => a - b);
      m = fitSpans[Math.min(fitSpans.length - 1, Math.ceil(fitSpans.length * 0.85) - 1)] || 0;
    }
    if (m > 0) span = Math.max(700, m * 1.55);

    // The clear field: between the rails, the heading and the foot. The scope centres on the ship
    // inside it; anything outside it stands as an edge tick on its border, pointing the way.
    const field = this._clearField(w, h);
    const fieldCx = field.x + field.width / 2;
    const fieldCy = field.y + field.height / 2;
    const baseScale = (Math.min(field.width, field.height) * 0.9) / span;
    this._view = { level: 'local', baseScale };
    const sx = (x) => fieldCx - (x - cam.cx) * baseScale * cam.zoom;
    const sz = (z) => fieldCy - (z - cam.cy) * baseScale * cam.zoom;
    const labelCandidates = [];
    const edgeTicks = [];
    setMapCanvasAriaLabel(this._canvas, 'local', this._layers.holdings ? model.ownership : []);

    const offView = (x, y) => x < field.x + 12 || y < field.y + 12 || x > field.x + field.width - 12 || y > field.y + field.height - 12;
    // Off-field marks ride the scope's outer ring at their true bearing: one radius, read like a
    // compass rose, never floating at the field's edge.
    const pinRadius = Math.min(field.width, field.height) * 0.46 + 16;
    const pushEdgeTick = (x, y, color, shape, target) => {
      if (edgeTicks.length >= 24) return;
      edgeTicks.push(ringPinTick(sx(px), sz(pz), pinRadius, x, y, color, shape, target));
    };

    drawSensorLattice(g, w, h, { pointer: this._pointer, a: 0.055 });

    // Range rings: bands of light round the ship, each reading its radius on its crown.
    const shipX = sx(px), shipY = sz(pz);
    const ringBase = Math.min(field.width, field.height) * 0.46;
    for (const rr of [0.33, 0.66, 1.0]) {
      drawBandRing(g, shipX, shipY, ringBase * rr, { band: 7, bandA: rr === 1 ? 0.34 : 0.3, edge: 1.5, edgeA: rr === 1 ? 0.6 : 0.5 });
    }
    // Minor graduations on the outer ring: an instrument, not a circle.
    g.save();
    g.strokeStyle = CHART_INK.bone(0.34);
    g.lineWidth = 1.5;
    for (let i = 0; i < 72; i += 1) {
      const a = (i / 72) * Math.PI * 2;
      const len = i % 6 === 0 ? 9 : 4;
      g.beginPath();
      g.moveTo(shipX + Math.cos(a) * ringBase, shipY + Math.sin(a) * ringBase);
      g.lineTo(shipX + Math.cos(a) * (ringBase - len), shipY + Math.sin(a) * (ringBase - len));
      g.stroke();
    }
    g.restore();

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

        const phaseLabel = bearing.statusLabel || (bearing.manualSearch ? 'RUMOR SEARCH'
          : bearing.phase === 'salvaged' ? 'SALVAGED' : fixed ? 'FIXED' : 'READ BEARING');
        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `bearing:${bearing.wreckId}`,
          kind: 'bearing',
          text: `${phaseLabel} · ${bearing.name}`,
          lines: [`${phaseLabel} · ${bearing.name}`],
          x,
          y,
          anchorRadius: fixed ? 10 : radiusPx + 6,
          color: CHART_INK.lit(0.92),
          selected,
          named: true,
        }));
      }

      // Scanner pings: where the sweep found something unclassified — ice, data in motion.
      const pings = state.world && state.world.scanPings && state.world.scanPings[model.sectorId];
      if (Array.isArray(pings)) {
        for (const ping of pings) {
          if (!ping || !ping.pos) continue;
          const x = sx(ping.pos.x), y = sz(ping.pos.z);
          if (offView(x, y)) continue;
          g.save();
          g.fillStyle = CHART_INK.ice(0.16);
          g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
          g.fillStyle = CHART_INK.ice(0.9);
          g.beginPath();
          g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y);
          g.closePath(); g.fill();
          g.restore();
        }
      }
    }

    if (this._layers.route) {
      for (const marker of model.ownership) {
        if (marker.travelRoute) drawManufacturedTravelRoute(g, marker.travelRoute, sx, sz, false);
      }
    }

    // Scan sweep: a wedge of ice turning round the ship while the scope is reading contacts.
    if (!reduced && this._scanPhase != null) {
      const a0 = this._scanPhase;
      g.save();
      const grad = g.createRadialGradient ? g.createRadialGradient(shipX, shipY, 0, shipX, shipY, ringBase) : null;
      if (grad) { grad.addColorStop(0, CHART_INK.ice(0.0)); grad.addColorStop(1, CHART_INK.ice(0.10)); }
      g.fillStyle = grad || CHART_INK.ice(0.05);
      g.beginPath(); g.moveTo(shipX, shipY); g.arc(shipX, shipY, ringBase, a0 - 0.5, a0); g.closePath(); g.fill();
      g.strokeStyle = CHART_INK.ice(0.45);
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(shipX, shipY); g.lineTo(shipX + Math.cos(a0) * ringBase, shipY + Math.sin(a0) * ringBase); g.stroke();
      g.restore();
    }

    // THE HAND at local scale: the course from the ship to its fix, drawn in, a packet running it.
    const courseKey = wpPos ? `${Math.round(wpPos.x)},${Math.round(wpPos.z)}` : null;
    if (courseKey !== this._lastCourseKey) { this._lastCourseKey = courseKey; this._routeDrawStart = courseKey ? this._nowMs() : null; }
    let wpTick = null;
    if (wpPos && this._layers.route) {
      let ex = sx(wpPos.x), ey = sz(wpPos.z);
      if (offView(ex, ey)) {
        wpTick = ringPinTick(shipX, shipY, pinRadius, ex, ey, this._line ? INK.ink0 : INK.amberHot, 'waypoint', waypointClickTarget(wp, wpPos, ex, ey) || undefined);
        ex = wpTick.x; ey = wpTick.y;
      }
      const progress = reduced ? 1 : Math.min(1, Math.max(0, (this._nowMs() - (this._routeDrawStart == null ? -1e9 : this._routeDrawStart)) / 520));
      drawHandBeam(g, [{ x: shipX, y: shipY }, { x: ex, y: ey }], {
        progress: 1 - Math.pow(1 - progress, 3), pulseT: reduced || this._line ? null : animT, head: false, alpha: this._line ? 0.4 : 1, tone: this._line ? 'bone' : 'hand',
      });
    }

    // Rock thinning: dense belts collapse into a faint texture of the nearest rocks.
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

    // Only gates that can actually claim a label may force a disambiguating octant.
    const localGateNameCounts = new Map();
    for (const c of model.contacts) {
      if (c.kind !== 'gate' || c.foreign || c.remembered) continue;
      const base = String(c.name || 'Gate');
      localGateNameCounts.set(base, (localGateNameCounts.get(base) || 0) + 1);
    }

    // Contacts: keyed marks of light, constant screen size. Rocks declutter off-frame silently;
    // infrastructure, hostiles and waypoints collapse into edge ticks instead.
    const hoverId = this._hoverTarget ? this._hoverTarget.id : null;
    const snapId = this._line && this._line.snap ? this._line.snap.id : null;
    for (const c of model.contacts) {
      if (c.kind === 'asteroid' && asteroidDrawSet && !asteroidDrawSet.has(c.id)) continue;
      const x = sx(c.x), y = sz(c.z);
      const off = offView(x, y);
      const displayName = c.kind === 'gate'
        ? disambiguateGateLabel(c.name, c.x, c.z, px, pz, localGateNameCounts)
        : c.name;

      // Remembered contacts are memory, not sensor return: faded at the dead-reckoned position
      // inside an uncertainty ring; no edge tick and no click target (a course to a ghost is nothing).
      if (c.remembered) {
        if (off) continue;
        const band = localMemoryBand(c.confidence);
        const memColor = c.hostile ? INK.red : INK.ink2;
        g.save();
        g.globalAlpha = band.alpha;
        if (c.hostile) drawHostileMark(g, x, y, c.rot || 0);
        else drawShipChevron(g, x, y, c.rot || 0, memColor);
        g.restore();
        drawBandRing(g, x, y, 11, { rgb: c.hostile ? '255,80,56' : '236,230,216', band: 4, bandA: 0.08 * band.alpha, edge: 1, edgeA: 0.4 * band.alpha });
        continue;
      }

      // Furniture belonging to a neighbouring sector recedes.
      const foreignFade = c.foreign && (c.kind === 'gate' || c.kind === 'station');

      if (off) {
        if (!foreignFade && (c.kind === 'station' || c.kind === 'gate' || c.hostile)) {
          pushEdgeTick(x, y, c.hostile && c.kind !== 'station' && c.kind !== 'gate' ? INK.red : INK.ink0,
            c.kind === 'gate' ? 'gate' : c.kind === 'station' ? 'station' : 'hostile', {
              kind: c.kind, id: c.id, x: c.x, z: c.z,
              entityId: c.entityId, stationId: c.stationId, name: displayName, factionId: c.factionId,
              hostile: c.hostile,
              detail: `Contact · ${displayName} · off-view ${c.kind.toUpperCase()}`,
            });
        }
        continue;
      }

      const contactMark = chartMarkSizes(c, baseScale * cam.zoom);
      this._clickTargets.push({
        sx: x, sy: y, radiusPx: Math.max(contactMark.pipPx, c.kind === 'asteroid' ? 6 : 11), kind: c.kind, id: c.id, x: c.x, z: c.z,
        entityId: c.entityId, stationId: c.stationId, name: displayName, factionId: c.factionId,
        hostile: c.hostile,
        detail: `Contact · ${displayName} · ${c.kind.toUpperCase()}`
      });

      const lift = (c.id === hoverId || c.id === snapId) ? this._liftAmount(this._nowMs()) : 0;
      if (lift > 0.01) drawBandRing(g, x, y, 15 + lift * 3, { band: 7, bandA: 0.16 * lift, edge: 1.4, edgeA: 0.6 * lift });
      if (this._selectedTarget && this._selectedTarget.id === c.id) {
        drawBandRing(g, x, y, 15, { band: 7, bandA: 0.3, edge: 2, edgeA: 1 });
      }

      if (foreignFade) { g.save(); g.globalAlpha = 0.42; }

      if (c.kind === 'asteroid') {
        drawAsteroidMark(g, x, y, c.id);
        if (c.scanHighlightUntil > nowS) {
          // A scanned rock: an ice assay ring (a reading) and its ore above.
          drawBandRing(g, x, y, 7, { rgb: '143,203,255', band: 4, bandA: 0.2, edge: 1.4, edgeA: 0.9 });
          g.save();
          g.fillStyle = CHART_INK.ice(1);
          g.font = chartFont(700, 12);
          g.textAlign = 'center'; g.textBaseline = 'bottom';
          g.fillText(c.scanOre || '·', x, y - 9);
          g.restore();
        }
      } else if (c.kind === 'gate') {
        drawGateMark(g, x, y, Math.atan2(c.z - pz, c.x - px));
      } else if (c.kind === 'station') {
        drawStationMark(g, x, y);
      } else if (c.hostile) {
        // Hostile: a red diamond and its velocity, in red.
        if (c.vx != null) {
          const pvx = -(c.vx / 3) * baseScale * cam.zoom;
          const pvz = -(c.vz / 3) * baseScale * cam.zoom;
          const len = Math.hypot(pvx, pvz);
          if (len > 0.1) {
            const mult = len > 26 ? 26 / len : 1;
            drawBand(g, (cx) => { cx.moveTo(x, y); cx.lineTo(x + pvx * mult, y + pvz * mult); }, { rgb: '255,80,56', band: 4, bandA: 0.22, edge: 1.6, edgeA: 0.9 });
          }
        }
        drawHostileMark(g, x, y, c.rot || 0);
      } else {
        drawShipChevron(g, x, y, c.rot || 0, null);
      }
      if (foreignFade) g.restore();

      const selected = !!(this._selectedTarget && this._selectedTarget.id === c.id);
      if ((c.kind === 'station' || c.kind === 'gate' || selected || c.hostile || c.named)
        && (!foreignFade || selected)) {
        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `contact:${c.id}`,
          kind: c.kind,
          text: displayName,
          lines: [displayName],
          x,
          y,
          anchorRadius: Math.max(contactMark.nameplatePx, c.kind === 'station' || c.kind === 'gate' ? 16 : 11),
          color: c.hostile ? INK.red : c.kind === 'station' || c.kind === 'gate' ? CHART_INK.lit(0.97) : CHART_INK.lit(0.9),
          hostile: c.hostile,
          named: c.named,
          selected,
        }));
      }
    }

    // Player: the SAME fix mark used at SYSTEM and GALAXY scale, at the scope's centre.
    this._youScreen = { x: shipX, y: shipY };
    drawPlayerFixMark(g, shipX, shipY, player ? player.rot : 0, {
      scale: 1.08,
      pulse: reduced ? 0 : (0.5 + 0.5 * Math.sin(animT * 1.7)),
    });

    // Velocity: a tapered line of bone light out of the fix mark.
    if (player && player.vel) {
      const speed = Math.hypot(player.vel.x, player.vel.z);
      if (speed > 0.5) {
        const vLen = Math.min(80, Math.max(22, speed * 0.25));
        const angle = Math.atan2(-player.vel.z, -player.vel.x);
        const ex = shipX + Math.cos(angle) * vLen;
        const ey = shipY + Math.sin(angle) * vLen;
        drawBand(g, (cx) => { cx.moveTo(shipX + Math.cos(angle) * 16, shipY + Math.sin(angle) * 16); cx.lineTo(ex, ey); }, { band: 5, bandA: 0.2, edge: 1.6, edgeA: 0.85 });
        drawBead(g, ex, ey, 2.4, { bloom: 2.4, bloomA: 0.28 });
      }
    }

    // Range readings on the rings' crowns (phosphor: numbers the world tells you).
    g.save();
    g.font = chartFont(640, 12, { stretch: 'normal' });
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const ringUnits = Math.round(span / 2);
    for (let i = 0; i < 3; i++) {
      const frac = [0.33, 0.66, 1.0][i];
      const rrPx = ringBase * frac;
      const label = formatDistanceWU(Math.round(ringUnits * frac));
      const lx = shipX + rrPx * 0.707 + 6;
      const ly = shipY - rrPx * 0.707 - 6;
      g.strokeStyle = 'rgba(5, 7, 10, 0.86)'; g.lineWidth = 4;
      g.strokeText(label, lx, ly);
      g.fillStyle = CHART_INK.phos(0.9);
      g.fillText(label, lx, ly);
    }
    g.restore();

    // Empty-space reassurance (remembered marks do not count as company).
    const liveContacts = this._localLiveContacts;
    const rememberedContacts = model.contacts.length - liveContacts;
    const holdingCount = this._layers.holdings ? model.ownership.length : 0;
    if (liveContacts === 0 && holdingCount === 0 && model.bearings.length === 0) {
      g.save();
      g.fillStyle = CHART_INK.lit(0.86);
      g.font = chartFont(650, 13);
      setTracking(g, 0.12, 13);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('CLEAR SKIES — no local contacts', shipX, shipY + 34);
      if (rememberedContacts > 0) {
        g.fillStyle = CHART_INK.bone(0.7);
        g.font = chartFont(560, 12, { stretch: 'normal' });
        g.fillText(`${rememberedContacts} REMEMBERED ${rememberedContacts === 1 ? 'FIX' : 'FIXES'} FADING`, shipX, shipY + 52);
      }
      setTracking(g, 0, 12);
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
        drawBandRing(g, x, y, selected ? 13 : 11, { rgb: rgbTriplet(marker.color), band: 6, bandA: 0.22, edge: selected ? 2.5 : 1.8, edgeA: 1 });
        g.save();
        g.fillStyle = marker.color;
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

    // The goal: in the field it is a pin; off it, its tick on the field's border carries its words.
    let objectivePlacement = null;
    let wpScreen = null;
    if (wpPos && (this._layers.route || this._layers.mission)) {
      let wx = sx(wpPos.x);
      let wy = sz(wpPos.z);
      if (offView(wx, wy)) {
        const tick = wpTick || ringPinTick(shipX, shipY, pinRadius, wx, wy, this._line ? INK.ink0 : INK.amberHot, 'waypoint', waypointClickTarget(wp, wpPos, wx, wy) || undefined);
        edgeTicks.push(tick);
        wx = tick.x; wy = tick.y;
      } else {
        wpScreen = { x: wx, y: wy };
        const target = waypointClickTarget(wp, wpPos, wx, wy);
        if (target) this._clickTargets.push(target);
      }
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
    }
    const localReserved = [{ x: shipX - 18, y: shipY - 18, width: 36, height: 36 }];
    if (wpScreen && this._layers.route) {
      const stub = waypointTetherReserveRect(shipX, shipY, wpScreen.x, wpScreen.y);
      if (stub) localReserved.push(stub);
    }
    for (const frac of [0.33, 0.66, 1.0]) {
      const rrPx = ringBase * frac;
      localReserved.push({ x: shipX + rrPx * 0.707 + 4, y: shipY - rrPx * 0.707 - 16, width: 64, height: 20 });
    }
    const labelLayout = this._placeLabels(labelCandidates, w, h, { reserved: localReserved });
    this._lastLabelLayout = labelLayout;
    for (const placement of labelLayout) {
      if (!placement.visible) continue;
      if (placement.objective) objectivePlacement = placement;
      else drawMapLabelBlock(g, placement);
    }

    // Secondary mission points sit under the objective.
    if (this._layers.mission) {
      for (const point of missionMapGeometry(state, trackedMissionOf(state))) {
        const mx = sx(point.x), my = sz(point.z);
        if (offView(mx, my)) continue;
        drawMissionPoint(g, mx, my, point.kind, point.done);
      }
    }

    // The line being laid, or the course a focused target would take.
    this._drawLocalPreview(g, state, { reduced, animT });

    // The tracked objective owns the final paint and the strongest label reservation.
    if (wpScreen && (this._layers.route || this._layers.mission)) {
      drawWaypointPin(g, wpScreen.x, wpScreen.y, waypointMapLabel(wp), w, objectivePlacement, this._line ? 'bone' : 'hand');
    } else if (objectivePlacement) {
      drawMapLabelBlock(g, objectivePlacement);
    }

    // Edge ticks: each is a live click target (inspect without panning).
    for (const tick of edgeTicks) {
      drawEdgeTick(g, tick.x, tick.y, tick.color, tick.shape, tick.angle);
      if (tick.target && tick.target.kind) {
        this._clickTargets.push({
          ...tick.target,
          sx: tick.x,
          sy: tick.y,
          radiusPx: 14,
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
  const a = salvaged ? 0.6 : 1;
  if (!fixed) {
    // An uncertainty region: a band of light with four survey ticks, never a dashed hairline.
    const rr = Math.max(12, Math.min(Math.abs(Number(radiusPx) || 0), 4096));
    g.save();
    g.fillStyle = CHART_INK.bone(0.035 * a);
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    g.restore();
    drawBandRing(g, x, y, rr, { band: selected ? 8 : 6, bandA: 0.16 * a, edge: selected ? 2 : 1.5, edgeA: 0.62 * a });
    g.save();
    g.strokeStyle = CHART_INK.bone(0.85 * a);
    g.lineWidth = 2;
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const ax = Math.cos(angle), ay = Math.sin(angle);
      g.beginPath();
      g.moveTo(x + ax * (rr - 5), y + ay * (rr - 5));
      g.lineTo(x + ax * (rr + 5), y + ay * (rr + 5));
      g.stroke();
    }
    g.restore();
  } else {
    // A fixed wreck: a lit diamond inside a band ring, the survey cross through it.
    drawBandRing(g, x, y, selected ? 15 : 11, { band: 5, bandA: 0.2 * a, edge: 1.6, edgeA: 0.8 * a });
    g.save();
    const size = 6;
    g.fillStyle = CHART_INK.lit(0.92 * a);
    g.beginPath();
    g.moveTo(x, y - size); g.lineTo(x + size, y); g.lineTo(x, y + size); g.lineTo(x - size, y);
    g.closePath(); g.fill();
    g.strokeStyle = CHART_INK.glass(0.9);
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - 3.5, y); g.lineTo(x + 3.5, y); g.moveTo(x, y - 3.5); g.lineTo(x, y + 3.5); g.stroke();
    g.restore();
  }
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
  // A station is a place you dock: a lit hub inside a berth ring of light, four mooring arms on the
  // diagonals (clear of the label, which always sits on an axis).
  const r = 8.5;
  drawBandRing(g, x, y, r, { band: 6, bandA: 0.24, edge: 1.7, edgeA: 0.9 });
  g.save();
  g.strokeStyle = CHART_INK.bone(0.82);
  g.lineWidth = 2;
  g.lineCap = 'butt';
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + i * (Math.PI / 2);
    const ca = Math.cos(a), sa = Math.sin(a);
    g.beginPath();
    g.moveTo(x + ca * (r + 1.5), y + sa * (r + 1.5));
    g.lineTo(x + ca * (r + 5.5), y + sa * (r + 5.5));
    g.stroke();
  }
  g.restore();
  drawBead(g, x, y, 3.6, { bloom: 2.4, bloomA: 0.3 });
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
  // A gate is a threshold: two jaws of light with the mouth open on the axis of travel, and a lit
  // tongue leaving the mouth the way the lane goes.
  const x = g_x, y = g_y, r = 7.5;
  const gap = 0.62;
  const style = { band: 6, bandA: 0.24, edge: 2, edgeA: 0.92 };
  drawBand(g, (c) => c.arc(x, y, r, angle + gap, angle + Math.PI - gap), style);
  drawBand(g, (c) => c.arc(x, y, r, angle + Math.PI + gap, angle + Math.PI * 2 - gap), style);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  drawBand(g, (c) => { c.moveTo(x + ca * 2, y + sa * 2); c.lineTo(x + ca * (r + 6), y + sa * (r + 6)); },
    { band: 5, bandA: 0.22, edge: 2, edgeA: 0.95 });
  drawBead(g, x + ca * (r + 6), y + sa * (r + 6), 2.2, { bloom: 2.4, bloomA: 0.3 });
}

/**
 * Point of interest: a survey cross with an open centre.
 *
 * A bare plus sign is the single most generic mark available. Breaking the centre and adding fine
 * end serifs turns it into a surveyor's register mark — the same drafting vocabulary as the corner
 * registration on the table, so the family reads as one instrument.
 */
function drawPoiMark(g, x, y) {
  // A point of interest: a small lit diamond in its own soft light.
  g.save();
  g.fillStyle = CHART_INK.bone(0.14);
  g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
  g.fillStyle = CHART_INK.lit(0.9);
  const s = 4.2;
  g.beginPath();
  g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y);
  g.closePath(); g.fill();
  g.restore();
}

function drawManufacturedTravelRoute(g, route, sx, sz, useDrawFrame, warp = null) {
  if (!route || typeof sx !== 'function' || typeof sz !== 'function') return;
  const from = useDrawFrame ? route.drawFrom : route.from;
  // Freight has two endpoints; only a manufactured corridor has an intermediate relay.
  const support = (useDrawFrame ? route.drawSupport : route.support) || from;
  const to = useDrawFrame ? route.drawTo : route.to;
  if (!from || !support || !to) return;
  let ax = sx(from.x), ay = sz(from.z);
  let mx = sx(support.x), my = sz(support.z);
  let bx = sx(to.x), by = sz(to.z);
  if (![ax, ay, mx, my, bx, by].every(Number.isFinite)) return;
  if (typeof warp === 'function') {
    ({ x: ax, y: ay } = warp(ax, ay));
    ({ x: mx, y: my } = warp(mx, my));
    ({ x: bx, y: by } = warp(bx, by));
  }

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
  // without relying on color, and the fixed chevron communicates the current leg's direction.
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
  g.fillStyle = CHART_INK.bone(0.12);
  g.beginPath(); g.arc(x, y, 8.5, 0, Math.PI * 2); g.fill();
  g.translate(x, y);
  g.rotate(Math.PI + (rot || 0));
  g.fillStyle = color || CHART_INK.lit(0.92);
  g.beginPath();
  g.moveTo(6.5, 0); g.lineTo(-5, -4.2); g.lineTo(-2.8, 0); g.lineTo(-5, 4.2);
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

  // The fix mark in light with body: a soft well, a band under the keyline, and (motion allowed) a
  // slow breathing halo so the eye finds it on a busy chart. `pulse` is 0 under reduced motion.
  g.fillStyle = 'rgba(5, 7, 10, 0.72)';
  g.beginPath(); g.arc(0, 0, r + 1, 0, Math.PI * 2); g.fill();
  if (pulse > 0) {
    g.strokeStyle = CHART_INK.bone(0.16 * pulse);
    g.lineWidth = 4;
    g.beginPath(); g.arc(0, 0, r + 6 + pulse * 4, 0, Math.PI * 2); g.stroke();
  }
  g.strokeStyle = CHART_INK.bone(0.26);
  g.lineWidth = 7 * scale;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  // check:map-never-lost identifies the fix mark by this exact keyline ink (one step off bone at
  // 92 %) — it stays a literal so the check can find the ring among every other arc on the chart.
  g.strokeStyle = 'rgba(237, 232, 216, 0.92)';
  g.lineWidth = 1.8 * scale;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();

  // Registration ticks at the cardinals — the surveyor's-instrument tell, and a second
  // non-colour cue that this ring is the fix mark and not a scan ring or a zone edge.
  g.strokeStyle = CHART_INK.lit(0.95);
  g.lineWidth = 2 * scale;
  for (let i = 0; i < 4; i += 1) {
    const a = (Math.PI / 2) * i;
    const ix = Math.cos(a), iy = Math.sin(a);
    g.beginPath();
    g.moveTo(ix * (r + 2), iy * (r + 2));
    g.lineTo(ix * (r + 6 * scale), iy * (r + 6 * scale));
    g.stroke();
  }

  // Heading triangle. Same `Math.PI + rot` convention as every other oriented mark on this canvas.
  g.rotate(Math.PI + (rot || 0));
  g.fillStyle = CHART_INK.lit(1);
  g.beginPath();
  g.moveTo(6 * scale, 0);
  g.lineTo(-4.2 * scale, -3.8 * scale);
  g.lineTo(-2.2 * scale, 0);
  g.lineTo(-4.2 * scale, 3.8 * scale);
  g.closePath();
  g.fill();
  g.restore();
  // the bead: YOU as a point of light at the heart of the mark
  drawBead(g, x, y, 1.6 * scale, { bloom: 4, bloomA: 0.3 });
}

/** Hostile: a red open diamond, rotated to heading — threat reads before color-blind shape. */
function drawHostileMark(g, x, y, rot) {
  g.save();
  g.fillStyle = CHART_INK.danger(0.16);
  g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill();
  g.translate(x, y);
  g.rotate(Math.PI + (rot || 0));
  g.fillStyle = CHART_INK.danger(0.92);
  g.beginPath();
  g.moveTo(6.5, 0); g.lineTo(0, -4.6); g.lineTo(-6.5, 0); g.lineTo(0, 4.6);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255, 200, 190, 0.9)';
  g.lineWidth = 1;
  g.stroke();
  g.restore();
}

/**
 * Asteroid: a deterministic irregular polygon keyed by id — a rock, never a circle.
 *
 * The shape is authored in local glyph space once per id and translated at draw time. Keeping the
 * exact seeded vertices (including the old 5–7 vertex range and radii) preserves the map's visual
 * language while avoiding repeated hash/trig work for the many contacts painted each frame. A
 * bounded cache keeps a changing contact stream from retaining every id forever; older browsers or
 * test canvases use the original immediate path construction.
 */
export const ASTEROID_GLYPH_CACHE_LIMIT = 256;
const asteroidGlyphPathCache = new Map();

function asteroidGlyphPath(seedId) {
  const Path2DImpl = typeof globalThis !== 'undefined' ? globalThis.Path2D : undefined;
  if (typeof Path2DImpl !== 'function') return null;

  // Keep the raw id as the cache key: the legacy geometry normalises only the angular seed, while
  // the radius seed uses String(seedId), so falsy ids must not alias one another.
  const cacheKey = String(seedId);
  const cached = asteroidGlyphPathCache.get(cacheKey);
  if (cached) return cached;

  let path;
  try {
    path = new Path2DImpl();
    const seed = cosmeticHash01(String(seedId || 'rock'));
    const verts = 5 + Math.floor(seed * 3);
    for (let i = 0; i < verts; i += 1) {
      const a = (i / verts) * Math.PI * 2 + seed * Math.PI;
      const r = 2.4 + cosmeticHash01(String(seedId) + ':' + i) * 1.8;
      const vx = Math.cos(a) * r;
      const vy = Math.sin(a) * r;
      if (i === 0) path.moveTo(vx, vy);
      else path.lineTo(vx, vy);
    }
    path.closePath();
  } catch (_) {
    // A host can expose Path2D without a usable constructor (for example, a partial test canvas).
    // The caller will take the immediate path fallback below.
    return null;
  }

  if (asteroidGlyphPathCache.size >= ASTEROID_GLYPH_CACHE_LIMIT) {
    const oldest = asteroidGlyphPathCache.keys().next().value;
    if (oldest !== undefined) asteroidGlyphPathCache.delete(oldest);
  }
  asteroidGlyphPathCache.set(cacheKey, path);
  return path;
}

export function drawAsteroidMark(g, x, y, seedId) {
  const path = asteroidGlyphPath(seedId);
  g.save();
  g.fillStyle = INK.ink2;
  g.strokeStyle = INK.ink1;
  g.lineWidth = 0.8;
  if (path && typeof g.translate === 'function'
    && typeof g.fill === 'function' && typeof g.stroke === 'function') {
    g.translate(x, y);
    g.fill(path);
    g.stroke(path);
  } else {
    // Immediate fallback intentionally mirrors the pre-cache geometry exactly.
    const seed = cosmeticHash01(String(seedId || 'rock'));
    const verts = 5 + Math.floor(seed * 3);
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
  }
  g.restore();
}

/** Edge tick: a small keyed tab pinned to the frame for an important off-view object. */
function drawEdgeTick(g, x, y, color, shape, angle = null) {
  // An off-field mark pinned to the field's edge: a bead of its light and a pointer out toward it.
  const hostile = shape === 'hostile' || (shape !== 'waypoint' && color === INK.red);
  const goal = shape === 'waypoint' && color === INK.amberHot;
  const rgbFill = goal ? CHART_INK.hand(0.95) : hostile ? CHART_INK.danger(0.92) : CHART_INK.lit(0.9);
  if (Number.isFinite(angle)) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const tx = x + ca * 14, ty = y + sa * 14;
    g.save();
    g.fillStyle = rgbFill;
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(x + ca * 8 - sa * 4.5, y + sa * 8 + ca * 4.5);
    g.lineTo(x + ca * 8 + sa * 4.5, y + sa * 8 - ca * 4.5);
    g.closePath();
    g.fill();
    g.restore();
  }
  if (goal) {
    drawBandRing(g, x, y, 9, { rgb: '242,185,80', band: 5, bandA: 0.26, edge: 1.6, edgeA: 0.95 });
    g.save();
    g.fillStyle = CHART_INK.hand(1);
    g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.fill();
    g.restore();
    return;
  }
  if (hostile) {
    g.save();
    g.fillStyle = CHART_INK.danger(0.2);
    g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = rgbFill;
    g.beginPath(); g.moveTo(x + 5.5, y); g.lineTo(x, y - 4); g.lineTo(x - 5.5, y); g.lineTo(x, y + 4); g.closePath(); g.fill();
    g.restore();
    return;
  }
  drawBandRing(g, x, y, 6.5, { band: 5, bandA: 0.2, edge: 1.5, edgeA: 0.75 });
  drawBead(g, x, y, shape === 'bearing' ? 2 : 2.8, { bloom: 2.2, bloomA: 0.3 });
}

/** Service pictograms under stations: tiny stroke icons sharing the DOM chip language. */
function drawServicePictograms(g, cx, cy, services) {
  if (!g || !services || !services.length) return;
  // The services a berth offers, as a row of its pictograms in quiet light — no box around each.
  const size = 12;
  const totalW = services.length * size;
  let x = cx - totalW / 2 + size / 2;
  g.save();
  for (const svc of services) {
    drawServicePictogram(g, svc, x, cy, 3.8, CHART_INK.bone(0.78));
    x += size;
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
    // \uFE0E keeps ☢ a monochrome text glyph (it defaults to color emoji on emoji-font platforms).
    case 'radiation': return '☢\uFE0E';
    case 'nebula': return '✦';
    case 'dense_asteroid': return '◈';
    case 'debris': return '⚙';
    default: return '!';
  }
}

// Canvas channel for the same hazard marks: path-stroked glyphs (src/ui/glyphs.js) instead of
// font text, so the map layer matches the HUD icon language. hazardTypeGlyph above stays for the
// HTML info lists, where the marks render inline in label text.
const HAZARD_CANVAS_GLYPHS = {
  radiation: 'radiation',
  nebula: 'nebula',
  dense_asteroid: 'dense_asteroid',
  debris: 'debris',
};


/**
 * A faction hue is data, but a dark hue set as 12px text on the chart's ground does not read (the
 * Archive's indigo sat near 2:1). Lift the hue toward bone until it clears 4.5:1 on the ground; the
 * hue survives, only its lightness moves. Rings and fills keep the faction's own colour.
 */
function legibleHue(hex) {
  const s = String(hex || '').replace('#', '');
  if (s.length !== 6) return hex;
  const rgb = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  if (!rgb.every(Number.isFinite)) return hex;
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const BONE = [232, 226, 212];
  let out = rgb;
  for (let t = 0; t <= 1.0001 && lum(out) < 0.19; t += 0.1) {
    out = rgb.map((c, i) => Math.round(c + (BONE[i] - c) * t));
  }
  return '#' + out.map((c) => c.toString(16).padStart(2, '0')).join('');
}

function hexToRgba(hex, alpha) {
  // The kit's 62 % / 38 % inks are rgba strings, not hex: re-alpha them instead of falling back.
  const rgba = /^rgba?\(([^)]+)\)$/.exec(String(hex || '').trim());
  if (rgba) {
    const p = rgba[1].split(/[\s,/]+/).filter(Boolean);
    if (p.length >= 3) return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + alpha + ')';
  }
  const s = String(hex || '').replace('#', '');
  if (s.length !== 6) return 'rgba(234,230,223,' + alpha + ')';
  const r = parseInt(s.slice(0, 2), 16), gg = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
  if (![r, gg, b].every(Number.isFinite)) return 'rgba(234,230,223,' + alpha + ')';
  return 'rgba(' + r + ',' + gg + ',' + b + ',' + alpha + ')';
}

/** 'r,g,b' for a hex or rgba ink — the form the chart instruments take for a tinted light. */
function rgbTriplet(color) {
  const m = /^rgba\(([^,]+),([^,]+),([^,]+),/.exec(hexToRgba(color, 1).replace(/\s+/g, ''));
  return m ? `${m[1]},${m[2]},${m[3]}` : '236,230,216';
}

/**
 * The chart camera may open a little wider than the whole lattice: the clear field between the rails is
 * narrower than the canvas the span is measured on, so fitting all of known space needs the headroom.
 */
const CHART_SPAN_MAX_WU = MAP_SPAN_MAX_WU * 1.8;

/** How long a still press on empty space waits before it becomes a laid line. */
const CHART_LINE_HOLD_MS = 340;
/** A field's kind in words (the lock's own names), for the chart's field labels. */
const FIELD_NAME_BY_TYPE = Object.freeze({
  ast_common_rock: 'Silicate', ast_metallic: 'Metallic', ast_icy: 'Ice', ast_crystalline: 'Crystal',
  ast_gas_cloud: 'Volatile', ast_rare_exotic: 'Exotic',
});

/** "29.5k WU" -> { value: '29.5k', unit: 'WU' }: a reading's figure and its unit, for the thin numeral. */
function splitReading(text) {
  const m = /^(\S+)\s+(.+)$/.exec(String(text || '').trim());
  return m ? { value: m[1], unit: m[2] } : { value: String(text || ''), unit: '' };
}

/** How long a laid line takes to lock into the course before the chart hands over to the flight. */
const CHART_LOCK_MS = 520;

/**
 * An edge tick for a mark outside the clear field: pinned where the ray from the field's centre
 * (the ship, at LOCAL) toward the mark leaves the field, inset so the tick and its pointer stay in.
 */
function edgeTickOnField(field, cx, cy, x, y, color, shape, target) {
  const inset = 16;
  const x0 = field.x + inset, x1 = field.x + field.width - inset;
  const y0 = field.y + inset, y1 = field.y + field.height - inset;
  const dx = x - cx;
  const dy = y - cy;
  let t = 1;
  if (dx > 0) t = Math.min(t, (x1 - cx) / dx);
  if (dx < 0) t = Math.min(t, (x0 - cx) / dx);
  if (dy > 0) t = Math.min(t, (y1 - cy) / dy);
  if (dy < 0) t = Math.min(t, (y0 - cy) / dy);
  t = Math.max(0, t);
  const tx = Math.max(x0, Math.min(x1, cx + dx * t));
  const ty = Math.max(y0, Math.min(y1, cy + dy * t));
  return { x: tx, y: ty, color, shape, target, angle: Math.atan2(dy, dx) };
}

/** An off-field mark pinned to an instrument's ring at its true bearing from the ring's centre. */
function ringPinTick(cx, cy, radius, x, y, color, shape, target) {
  const angle = Math.atan2(y - cy, x - cx);
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, color, shape, target, angle };
}

const CHART_CONTEXT_METHODS = Object.freeze([
  'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'stroke', 'fill',
  'fillRect', 'clearRect', 'strokeRect', 'setLineDash', 'translate', 'rotate', 'scale', 'clip', 'fillText',
  'strokeText', 'drawImage', 'setTransform',
]);
const safeContexts = new WeakMap();
/**
 * The chart's canvas context, made safe for the headless fixtures the checks mount: a recording
 * stand-in that lacks a method the instruments use gets a no-op for it (a real 2D context has them
 * all and is returned as is). Reads and writes of style properties pass straight through.
 */
function safeChartContext(g) {
  if (!g || typeof g !== 'object') return g;
  if (CHART_CONTEXT_METHODS.every((name) => typeof g[name] === 'function')
    && typeof g.measureText === 'function'
    && typeof g.createLinearGradient === 'function' && typeof g.createRadialGradient === 'function') return g;
  let wrapped = safeContexts.get(g);
  if (wrapped) return wrapped;
  const noop = () => {};
  const gradient = () => ({ addColorStop: noop });
  wrapped = new Proxy(g, {
    get(target, prop) {
      const value = target[prop];
      if (value !== undefined) return typeof value === 'function' ? value.bind(target) : value;
      if (prop === 'measureText') return (text) => ({ width: String(text || '').length * 7 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
      if (typeof prop === 'string' && CHART_CONTEXT_METHODS.includes(prop)) return noop;
      return value;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  safeContexts.set(g, wrapped);
  return wrapped;
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
    lines.forEach((line, index) => {
      g.font = index === 0 ? chartFont(640, 13) : chartFont(520, 12, { stretch: 'normal' });
      setTracking(g, index === 0 ? 0.02 : 0.01, index === 0 ? 13 : 12);
      width = Math.max(width, g.measureText(line).width);
    });
    setTracking(g, 0, 12);
    g.restore();
  } else {
    for (const line of lines) width = Math.max(width, line.length * 7);
  }
  return {
    ...candidate,
    text: lines[0] || String(candidate.text || ''),
    lines,
    width: Math.ceil(width) + 10,
    height: lines.length ? 17 + (lines.length - 1) * 15 + 4 : 17,
  };
}

function drawMapLabelBlock(g, placement) {
  if (!placement || !placement.visible) return;
  if (placement.leader) drawLabelLeader(g, placement.leader);
  const lines = Array.isArray(placement.lines) && placement.lines.length
    ? placement.lines
    : [placement.text];
  // A label is words of light on the sky — no plate, no box — over a knocked-out halo so it reads
  // across lanes and fields. Names are bone; the one warm light on the chart is the Hand, so even
  // the goal's own words stay bone (its mark carries the amber).
  const warm = /^#f2b950$/i.test(String(placement.color || ''));
  const color = placement.objective || warm || !placement.color ? CHART_INK.lit(0.97) : placement.color;
  g.save();
  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.lineJoin = 'round';
  const nameLines = Math.max(1, Number(placement.nameLines) || 1);
  for (let index = 0; index < lines.length; index += 1) {
    const primary = index < nameLines;
    const px = primary ? 13 : 12;
    g.font = primary ? chartFont(640, 13) : chartFont(520, 12, { stretch: 'normal' });
    setTracking(g, primary ? 0.02 : 0.01, px);
    const fill = primary
      ? color
      : (index === lines.length - 1 && placement.secondaryColor
        ? placement.secondaryColor
        : CHART_INK.bone(0.74));
    const tx = placement.x + 5;
    const ty = placement.y + 3 + index * 15;
    if (typeof g.strokeText === 'function') {
      g.strokeStyle = 'rgba(5, 7, 10, 0.86)';
      g.lineWidth = 4;
      g.strokeText(lines[index], tx, ty);
    }
    g.fillStyle = fill;
    g.fillText(lines[index], tx, ty);
  }
  setTracking(g, 0, 12);
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
  // A contract's other points: quieter than the goal, keyed by role, in bone (the Hand is the goal's).
  const r = 5.5;
  g.save();
  g.lineWidth = 1.8;
  g.strokeStyle = done ? CHART_INK.bone(0.4) : CHART_INK.lit(0.9);
  g.fillStyle = g.strokeStyle;
  if (kind === 'signal') {
    for (let i = 1; i <= 2; i += 1) {
      g.beginPath();
      g.arc(x, y, r * i * 0.72, -Math.PI * 0.78, -Math.PI * 0.22);
      g.stroke();
    }
    g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill();
  } else if (kind === 'sample') {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    g.moveTo(x - r + 1.6, y); g.lineTo(x + r - 1.6, y);
    g.moveTo(x, y - r + 1.6); g.lineTo(x, y + r - 1.6);
    g.stroke();
  } else {
    // A spawn-tagged target: a ring of light around a bead.
    g.restore();
    drawBandRing(g, x, y, r, { band: 4, bandA: done ? 0.1 : 0.22, edge: 1.6, edgeA: done ? 0.4 : 0.9 });
    drawBead(g, x, y, 1.8, { a: done ? 0.5 : 1, bloom: 2 });
    g.save();
    g.strokeStyle = done ? CHART_INK.bone(0.4) : CHART_INK.lit(0.9);
    g.lineWidth = 1.8;
  }
  if (done) {
    g.beginPath();
    g.moveTo(x - r - 1, y + r + 1); g.lineTo(x + r + 1, y - r - 1);
    g.stroke();
  }
  g.restore();
}

function drawMapGoalMarker(g, x, y, label, viewportWidth = Infinity, labelPos = null, ringRadius = 17, tone = 'hand') {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const text = `GOAL · ${String(label || 'OBJECTIVE').toUpperCase().slice(0, 22)}`;
  // The goal is where the Hand points: a lit ring framing the node (never over it, so the sector it
  // names stays readable), four acquisition ticks, and the amber badge on its crown.
  const ringR = Math.max(17, Number(ringRadius) || 17);
  drawBandRing(g, x, y, ringR, { band: 6, bandA: 0.22, edge: 1.8, edgeA: 0.95 });
  g.save();
  g.strokeStyle = CHART_INK.lit(0.95);
  g.lineWidth = 2;
  for (let i = 0; i < 4; i += 1) {
    const a = Math.PI / 4 + i * (Math.PI / 2);
    const ca = Math.cos(a), sa = Math.sin(a);
    g.beginPath();
    g.moveTo(x + ca * (ringR - 4), y + sa * (ringR - 4));
    g.lineTo(x + ca * (ringR + 4), y + sa * (ringR + 4));
    g.stroke();
  }
  const by = y - ringR;
  const d = 6.5;
  // Amber only when the goal is the course's head; otherwise the badge is a lit bone mark.
  g.fillStyle = tone === 'hand' ? CHART_INK.hand(0.28) : CHART_INK.bone(0.16);
  g.beginPath(); g.arc(x, by, 12, 0, Math.PI * 2); g.fill();
  g.fillStyle = tone === 'hand' ? CHART_INK.hand(1) : CHART_INK.lit(0.95);
  g.beginPath();
  g.moveTo(x, by - d); g.lineTo(x + d, by); g.lineTo(x, by + d); g.lineTo(x - d, by);
  g.closePath();
  g.fill();
  g.font = chartFont(700, 13);
  setTracking(g, 0.06, 13);
  const width = g.measureText ? g.measureText(text).width : 0;
  const pos = labelPos || edgeAwareMarkerLabelX(width, x, viewportWidth, 21, 8);
  const drawY = pos.y != null ? pos.y : y;
  g.textAlign = pos.align;
  g.textBaseline = pos.baseline || 'middle';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(5, 7, 10, 0.88)';
  g.lineWidth = 5;
  g.strokeText(text, pos.x, drawY);
  g.fillStyle = CHART_INK.lit(1);
  g.fillText(text, pos.x, drawY);
  setTracking(g, 0, 12);
  g.restore();
}

/**
 * Right-side label placement for a marker, flipping to the left of the marker when the right side
 * would run off the viewport. Clamping the left edge back over the marker (the old behaviour) put
 * the text straight through the ring the label was annotating.
 */
function edgeAwareMarkerLabelX(textWidth, x, viewportWidth, offset, padding = 8) {
  const rightX = x + offset;
  if (!Number.isFinite(viewportWidth) || rightX + textWidth <= viewportWidth - padding) {
    return { x: rightX, align: 'left' };
  }
  if (x - offset - textWidth >= padding) {
    return { x: x - offset, align: 'right' };
  }
  return { x: clampMapLabelX(textWidth, rightX, viewportWidth, padding), align: 'left' };
}

const GOAL_LABEL_SIDES = Object.freeze([
  Object.freeze({ dx: 1, dy: 0, align: 'left', baseline: 'middle' }),
  Object.freeze({ dx: 0, dy: 1, align: 'center', baseline: 'top' }),
  Object.freeze({ dx: 0, dy: -1, align: 'center', baseline: 'bottom' }),
  Object.freeze({ dx: -1, dy: 0, align: 'right', baseline: 'middle' }),
]);

/**
 * A thin reserved rect along the first `stub` px of the player→waypoint tether, measured back from
 * the waypoint. Reserving only the stub near the pin (not the whole line) is enough to push the
 * objective's own label off the dashes without blacking out a corridor other labels could use.
 */
function waypointTetherReserveRect(x1, y1, x2, y2, stub = 90) {
  const ax = x1 - x2;
  const ay = y1 - y2;
  const al = Math.hypot(ax, ay);
  if (al <= 1) return null;
  const len = Math.min(stub, al);
  const ex = x2 + (ax / al) * len;
  const ey = y2 + (ay / al) * len;
  return {
    x: Math.min(x2, ex) - 3,
    y: Math.min(y2, ey) - 3,
    width: Math.abs(ex - x2) + 6,
    height: Math.abs(ey - y2) + 6,
  };
}

/** Liang–Barsky segment/rect test — is any part of the segment inside the rect. */
function segmentHitsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i += 1) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

/**
 * Goal-label placement. The label must clear its own marker AND the plotted route — the old fixed
 * right-side label lay flat on a route arriving from the right, amber dashes threading amber text.
 * Each candidate side is scored by how many drawn route segments cross its rect; out-of-viewport
 * sides are penalised harder. Ties keep the classic right-side placement (first entry).
 */
function goalLabelPlacement(textWidth, x, y, viewportWidth, viewportHeight, routeSegs, offset = 21, padding = 8) {
  const textHeight = 12;
  const segs = Array.isArray(routeSegs) ? routeSegs : [];
  let best = null;
  for (const side of GOAL_LABEL_SIDES) {
    const tx = x + side.dx * offset;
    const ty = y + side.dy * offset;
    const rectX = side.align === 'left' ? tx : side.align === 'right' ? tx - textWidth : tx - textWidth / 2;
    const rectY = side.baseline === 'middle' ? ty - textHeight / 2
      : side.baseline === 'bottom' ? ty - textHeight : ty;
    let score = 0;
    for (const seg of segs) {
      if (segmentHitsRect(seg.x1, seg.y1, seg.x2, seg.y2, rectX, rectY, textWidth, textHeight)) score += 2;
    }
    if (Number.isFinite(viewportWidth)
      && (rectX < padding || rectX + textWidth > viewportWidth - padding)) score += 5;
    if (Number.isFinite(viewportHeight)
      && (rectY < padding || rectY + textHeight > viewportHeight - padding)) score += 5;
    if (!best || score < best.score) {
      best = { x: tx, y: ty, align: side.align, baseline: side.baseline, rectX, rectY, score };
    }
  }
  return best;
}

function drawWaypointPin(g, x, y, label, viewportWidth = Infinity, labelPlacement = null, tone = 'hand') {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (tone === 'bone') {
    // The course's head while a new line is laid: the same pin in bone (one Hand at a time).
    drawBandRing(g, x, y, 13, { band: 6, bandA: 0.18, edge: 1.6, edgeA: 0.7 });
    g.save();
    g.fillStyle = CHART_INK.lit(0.8);
    g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.fill();
    g.restore();
    if (labelPlacement) drawMapLabelBlock(g, labelPlacement);
    return;
  }
  // The course's destination: the Hand's own mark — an amber diamond in its bloom inside a lit ring.
  drawBandRing(g, x, y, 13, { band: 6, bandA: 0.22, edge: 1.8, edgeA: 0.95 });
  g.save();
  g.fillStyle = CHART_INK.hand(0.3);
  g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = CHART_INK.hand(1);
  g.beginPath();
  g.moveTo(x, y - 7); g.lineTo(x + 7, y); g.lineTo(x, y + 7); g.lineTo(x - 7, y);
  g.closePath();
  g.fill();
  g.strokeStyle = CHART_INK.handHot(1);
  g.lineWidth = 1.2;
  g.stroke();
  if (!labelPlacement) {
    g.font = chartFont(700, 13);
    setTracking(g, 0.04, 13);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const textWidth = g.measureText ? g.measureText(label).width : 0;
    const labelPos = edgeAwareMarkerLabelX(textWidth, x, viewportWidth, 18, 8);
    g.textAlign = labelPos.align;
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(5, 7, 10, 0.88)';
    g.lineWidth = 5;
    g.strokeText(label, labelPos.x, y);
    g.fillStyle = CHART_INK.lit(1);
    g.fillText(label, labelPos.x, y);
    setTracking(g, 0, 12);
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
