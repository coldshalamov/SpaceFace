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
import { globalToSectorLocalForSector } from '../data/sectorCoordinates.js';
import { zonesForSector, zoneTypeMeta, zoneThreat } from '../data/sectorZones.js';
import { MAP_FOCUS, takeMapOpenIntent, normalizeMapFocus } from './mapAuthority.js';
import { sectorLawProfile } from './securityReadout.js';
import { causeFor } from './causeLedger.js';
import { uniqueWreckMapReadouts } from './uniqueWreckMapLayer.js';
import { mapFactionPresenceNodes } from '../data/factionPresence.js';
import { sectorSignalFor } from '../systems/sectorSim.js';
import { isHostileToPlayer } from '../systems/scanner.js';
import { bestKnownSellAtStations, knownStationQuotes } from './marketIntelligence.js';

// ---------------------------------------------------------------------------------------------
// Static catalogs (pure — safe at import time).
// ---------------------------------------------------------------------------------------------

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
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

// Continuous zoom is a single scalar; these thresholds pick which "level" the model builder emits.
// Zoom grows as you zoom IN (LOCAL is the most zoomed-in). Kept exported so the screen + tests agree.
export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 22;
export const LEVEL_SYSTEM_AT = 1.6;   // zoom >= this  -> SYSTEM (or LOCAL)
export const LEVEL_LOCAL_AT = 2.8;    // zoom >= this  -> LOCAL

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
    const layersW = 190;
    const inspectorW = 300;
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

/** Stable semantic priority for overlapping click targets. Active objectives always win. */
export function mapTargetPriority(target) {
  if (!target) return -1;
  if (target.objective === true || target.kind === 'waypoint' || target.markerKind === 'mission-objective') return 100;
  if (target.missionId) return 90;
  if (target.kind === 'bearing') return 60;
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
export function activeMapGoal(state) {
  if (!state) return null;
  const wp = state.nav && state.nav.waypoint;
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
    || ((wp && wp.pos) ? currentSectorId(state) : null);
  if (!wp && !tracked && !routeDest) return null;
  return {
    id: 'active-map-goal',
    objective: true,
    markerKind: (wp && wp.markerKind) || ((wp && (wp.missionId || wp.onboarding)) || tracked ? 'mission-objective' : 'navigation'),
    missionId: (wp && wp.missionId) || (tracked && tracked.id) || null,
    sectorId,
    pos: wp && wp.pos ? { x: wp.pos.x, z: wp.pos.z } : null,
    label: String(
      (wp && (wp.label || wp.sectorName || wp.reason))
      || (tracked && (tracked.title || tracked.name))
      || 'Route destination',
    ).replace(/\s+/g, ' ').trim(),
  };
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
    if (d2 > radius * radius) continue;
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
    consequence: def ? def.consequence : 'An owned site awaiting an operating identity.',
    riskLine: def ? def.riskLine : 'Uncommissioned sites provide no operating benefit.',
    x: Number(position.x) || 0,
    z: Number(position.z) || 0,
  };
}

/** Build owned-site markers once for both SYSTEM and LOCAL unified-map models. */
export function buildClaimOwnershipMarkers(state, sectorId, claimsSystem = null) {
  const sid = sectorId || currentSectorId(state);
  const bodies = claimsSystem && typeof claimsSystem.list === 'function'
    ? claimsSystem.list()
    : state && state.claims && Array.isArray(state.claims.bodies) ? state.claims.bodies : [];
  const liveByPoi = new Map();
  for (const entity of entityIterator(state)) {
    const poiId = entity && entity.alive !== false && entity.data && entity.data.poiId;
    if (poiId) liveByPoi.set(poiId, entity);
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
    const bearingCount = uniqueWreckMapReadouts(state, s.id).length;
    const presence = charted ? (presenceBySector.get(s.id) || []) : [];
    const node = {
      id: s.id,
      name: s.name || s.id,
      x: Number(pos.x) || 0,
      y: Number(pos.y) || 0,
      factionId: s.factionId || null,
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
  return { level: 'galaxy', currentSectorId: curId, nodes, edges };
}

// ---------------------------------------------------------------------------------------------
// LEVEL 2 — SYSTEM: the current sector's stations/gates/POIs + named zones as tinted regions.
// ---------------------------------------------------------------------------------------------

/**
 * Build the system-level draw model for `sectorId` (defaults to the current sector). Zones come from
 * sectorZones (labeled tinted discs). Stations/gates/POIs prefer LIVE entity positions from state
 * (so the map matches what's actually flying), and fall back to the static sector record so the
 * model is non-empty even before entities stream in. Pure — no DOM.
 *
 * @returns {{ level:'system', sectorId, sectorName, zones:Array, points:Array }}
 */
export function buildSystemModel(state, sectorId, options = {}) {
  const sid = sectorId || currentSectorId(state);
  const record = sectorRecordById(state, sid);
  const sectorName = (record && record.name) || sid || 'System';
  const confidence = mapConfidenceForSector(state, record || { id: sid });
  const ownership = buildClaimOwnershipMarkers(state, sid, options.claimsSystem || null);
  const bearings = uniqueWreckMapReadouts(state, sid).map((readout) => ({
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
      if (e.type === 'station') {
        const data = e.data || {};
        const isGate = !!data.isGate;
        points.push({
          id: e.id,
          kind: isGate ? 'gate' : 'station',
          name: data.name || e.name || (isGate ? 'Gate' : 'Station'),
          x: e.pos.x, z: e.pos.z,
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
      points.push({
        id: st.id,
        kind: 'station',
        name: st.name || st.id,
        x: anchor ? (Number(anchor.x) || 0) : null,
        z: anchor ? (Number(anchor.z) || 0) : null,
        entityId: null,
        stationId: st.id,
        factionId: st.factionId || null,
        sectorId: sid,
        targetSectorId: null,
      });
    }
  }
  // POIs (beacons/derelicts/etc.) — labels only unless an anchor position is merged in.
  if (record && Array.isArray(record.pois)) {
    for (const poi of record.pois) {
      if (!poi || !poi.id) continue;
      const anchor = poi.anchor || poi.center || poi.position || null;
      points.push({
        id: poi.id,
        kind: 'poi',
        poiType: poi.type || 'poi',
        name: poi.name || poi.id,
        x: anchor ? (Number(anchor.x) || 0) : null,
        z: anchor ? (Number(anchor.z) || 0) : null,
        entityId: null,
        sectorId: sid,
      });
    }
  }

  return { level: 'system', sectorId: sid, sectorName, ...confidence, zones, points, ownership, bearings };
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
    });
  }
  return {
    level: 'local',
    sectorId,
    player: player ? { id: player.id, x: player.pos.x, z: player.pos.z, rot: player.rot || 0 } : null,
    contacts,
    ownership: buildClaimOwnershipMarkers(state, sectorId, options.claimsSystem || null),
    bearings: uniqueWreckMapReadouts(state, sectorId),
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

  // Sector graph node -> route. A galaxy node has no world (x,z) position — only a graph position
  // and a sector id — so it is always resolved as an inter-sector route, never a local waypoint.
  if (target.kind === 'sector') {
    const sectorId = target.sectorId || target.id;
    if (!sectorId) return null;
    return { type: 'sector', sectorId, path: null, label: target.name || sectorId };
  }

  const hasPos = Number.isFinite(target.x) && Number.isFinite(target.z);
  if (hasPos) {
    const kind = target.kind || 'local';
    const label = target.name || (kind === 'zone' ? 'Zone' : kind === 'gate' ? 'Gate' : kind === 'station' ? 'Station' : 'Map fix');
    const arrivalRadius = kind === 'gate' ? 72 : kind === 'station' ? 90 : kind === 'claim' ? 170 : kind === 'zone' ? Math.max(60, (target.radius || 0) * 0.5) : 48;
    const payload = {
      type: kind,
      pos: { x: target.x, z: target.z },
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

// ---------------------------------------------------------------------------------------------
// DOM / canvas screen shell. Everything below is guarded so the module imports cleanly in Node.
// ---------------------------------------------------------------------------------------------

const HAS_DOC = typeof document !== 'undefined';
const STYLE_ID = 'sf-galaxymap-style';

const CSS = `
#sf-galaxymap {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: rgba(4, 8, 16, 0.98);
  color: var(--ink, #cfe3ff);
  font-family: var(--mono, monospace);
  user-select: none;
}

#sf-galaxymap .gm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--panel-edge, #1d3350);
  background: rgba(8, 14, 26, 0.85);
  min-height: var(--gm-header-h, 58px);
  box-sizing: border-box;
}

#sf-galaxymap .gm-title {
  font-size: 0.95rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--ink, #cfe3ff);
  font-weight: 600;
  opacity: 0.92;
}

#sf-galaxymap .gm-search-container {
  position: relative;
  flex: 1;
  max-width: 320px;
}

#sf-galaxymap .gm-search-input {
  width: 100%;
  background: rgba(6, 12, 24, 0.8);
  border: 1px solid var(--panel-edge, #1d3350);
  border-radius: 4px;
  color: #fff;
  padding: 6px 12px;
  font-family: inherit;
  font-size: 0.75rem;
  transition: border-color 0.15s ease;
}

#sf-galaxymap .gm-search-input:focus {
  outline: none;
  border-color: var(--accent, #39d0ff);
  box-shadow: 0 0 8px rgba(57, 208, 255, 0.25);
}

#sf-galaxymap .gm-search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: rgba(8, 13, 24, 0.96);
  border: 1px solid var(--panel-edge, #1d3350);
  border-radius: 4px;
  max-height: 250px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
}

#sf-galaxymap .gm-search-item {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(29, 51, 80, 0.4);
  font-size: 0.7rem;
  transition: background 0.15s ease;
}

#sf-galaxymap .gm-search-item:hover,
#sf-galaxymap .gm-search-item.selected {
  background: rgba(57, 208, 255, 0.15);
  color: #fff;
}

#sf-galaxymap .gm-search-item-name {
  font-weight: 700;
  color: var(--accent, #39d0ff);
}

#sf-galaxymap .gm-search-item-detail {
  color: var(--ink-dim, #7e93b3);
  font-size: 0.65rem;
  margin-top: 2px;
}

#sf-galaxymap .gm-level {
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-dim, #7e93b3);
}

#sf-galaxymap .gm-level b {
  color: var(--accent, #39d0ff);
}

#sf-galaxymap .gm-scale-buttons {
  display: flex;
  gap: 4px;
  padding: 2px;
  border: 1px solid rgba(57, 208, 255, 0.18);
  border-radius: 5px;
}

#sf-galaxymap .gm-scale-btn {
  min-width: 54px;
  padding: 5px 7px;
  background: transparent;
  border-color: transparent;
  color: var(--ink-dim, #7e93b3);
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

#sf-galaxymap .gm-scale-btn.is-current,
#sf-galaxymap .gm-scale-btn[aria-pressed="true"] {
  border-color: var(--accent, #39d0ff);
  color: #fff;
  background: rgba(57, 208, 255, 0.18);
  box-shadow: 0 0 10px rgba(57, 208, 255, 0.25);
  font-weight: 700;
}

#sf-galaxymap .gm-close {
  background: transparent;
  border: 1px solid var(--panel-edge, #1d3350);
  color: inherit;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: all 0.15s ease;
}

#sf-galaxymap .gm-close:hover,
#sf-galaxymap .gm-close:focus-visible {
  border-color: var(--accent, #39d0ff);
  color: #fff;
  box-shadow: 0 0 10px rgba(57, 208, 255, 0.2);
}

#sf-galaxymap .gm-body-container {
  display: flex;
  flex: 1;
  min-height: 0;
}

#sf-galaxymap .gm-left-rail {
  width: 190px;
  box-sizing: border-box;
  border-right: 1px solid var(--panel-edge, #1d3350);
  background: rgba(6, 11, 22, 0.75);
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  overflow-y: auto;
}

#sf-galaxymap .gm-rail-title {
  font-size: 0.75rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--accent, #39d0ff);
  border-bottom: 1px solid rgba(57, 208, 255, 0.2);
  padding-bottom: 6px;
  margin-bottom: 4px;
  font-weight: 700;
}

#sf-galaxymap .gm-layer-buttons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

#sf-galaxymap .gm-layer-btn {
  background: rgba(29, 51, 80, 0.2);
  border: 1px solid var(--panel-edge, #1d3350);
  color: var(--ink-dim, #7e93b3);
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  font-weight: 600;
  transition: all 0.15s ease;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

#sf-galaxymap .gm-layer-btn:hover {
  border-color: rgba(57, 208, 255, 0.5);
  color: #fff;
  background: rgba(57, 208, 255, 0.05);
}

#sf-galaxymap .gm-layer-btn.active {
  color: #fff;
  font-weight: 700;
}
#sf-galaxymap .gm-layer-btn[data-layer="route"].active   { border-color: #ffd24a; background: rgba(255, 210, 74, 0.14); box-shadow: 0 0 10px rgba(255, 210, 74, 0.22); }
#sf-galaxymap .gm-layer-btn[data-layer="mission"].active { border-color: #ffb35c; background: rgba(255, 179, 92, 0.14); box-shadow: 0 0 10px rgba(255, 179, 92, 0.22); }
#sf-galaxymap .gm-layer-btn[data-layer="market"].active  { border-color: #62e08a; background: rgba(98, 224, 138, 0.14); box-shadow: 0 0 10px rgba(98, 224, 138, 0.22); }
#sf-galaxymap .gm-layer-btn[data-layer="security"].active{ border-color: #ff5c5c; background: rgba(255, 92, 92, 0.14); box-shadow: 0 0 10px rgba(255, 92, 92, 0.22); }
#sf-galaxymap .gm-layer-btn[data-layer="faction"].active { border-color: #c08bff; background: rgba(192, 139, 255, 0.14); box-shadow: 0 0 10px rgba(192, 139, 255, 0.22); }
#sf-galaxymap .gm-layer-btn[data-layer="hazard"].active  { border-color: #ff8a4d; background: rgba(255, 138, 77, 0.14); box-shadow: 0 0 10px rgba(255, 138, 77, 0.22); }
#sf-galaxymap .gm-layer-btn[data-layer="services"].active{ border-color: #39d0ff; background: rgba(57, 208, 255, 0.14); box-shadow: 0 0 10px rgba(57, 208, 255, 0.22); }
#sf-galaxymap .gm-layer-btn[data-layer="discovery"].active{ border-color: #7a9fff; background: rgba(122, 159, 255, 0.14); box-shadow: 0 0 10px rgba(122, 159, 255, 0.22); }

#sf-galaxymap .gm-layer-btn.active::after {
  content: "●";
  font-size: 0.6rem;
}
#sf-galaxymap .gm-layer-btn[data-layer="route"].active::after   { color: #ffd24a; }
#sf-galaxymap .gm-layer-btn[data-layer="mission"].active::after { color: #ffb35c; }
#sf-galaxymap .gm-layer-btn[data-layer="market"].active::after  { color: #62e08a; }
#sf-galaxymap .gm-layer-btn[data-layer="security"].active::after{ color: #ff5c5c; }
#sf-galaxymap .gm-layer-btn[data-layer="faction"].active::after { color: #c08bff; }
#sf-galaxymap .gm-layer-btn[data-layer="hazard"].active::after  { color: #ff8a4d; }
#sf-galaxymap .gm-layer-btn[data-layer="services"].active::after{ color: #39d0ff; }
#sf-galaxymap .gm-layer-btn[data-layer="discovery"].active::after{ color: #7a9fff; }

#sf-galaxymap .gm-rail-commodity {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

#sf-galaxymap .gm-rail-commodity label {
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  color: var(--ink-dim, #7e93b3);
  text-transform: uppercase;
}

#sf-galaxymap .gm-rail-commodity select {
  background: rgba(6, 12, 24, 0.9);
  border: 1px solid var(--panel-edge, #1d3350);
  border-radius: 4px;
  color: #fff;
  padding: 6px;
  font-family: inherit;
  font-size: 0.68rem;
  outline: none;
}

#sf-galaxymap .gm-rail-commodity select:focus {
  border-color: var(--accent, #39d0ff);
}

#sf-galaxymap .gm-rail-footer {
  margin-top: auto;
  border-top: 1px solid var(--panel-edge, #1d3350);
  padding-top: 12px;
}

#sf-galaxymap .gm-hint-title {
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-dim, #7e93b3);
  font-weight: 700;
  margin-bottom: 6px;
}

#sf-galaxymap .gm-hint-text {
  font-size: 0.6rem;
  color: var(--ink-mute, #5e7393);
  line-height: 1.5;
}

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

#sf-galaxymap .gm-right-inspector {
  width: 300px;
  box-sizing: border-box;
  border-left: 1px solid var(--panel-edge, #1d3350);
  background: rgba(6, 11, 22, 0.75);
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  overflow-y: auto;
}

#sf-galaxymap .gm-inspector-header {
  font-size: 0.75rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--accent, #39d0ff);
  border-bottom: 1px solid rgba(57, 208, 255, 0.2);
  padding-bottom: 6px;
  font-weight: 700;
  text-shadow: 0 0 6px rgba(57, 208, 255, 0.3);
}

#sf-galaxymap .gm-inspector-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 0.72rem;
  line-height: 1.4;
}

#sf-galaxymap .gm-inspector-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

#sf-galaxymap .gm-inspector-empty {
  color: var(--ink-mute, #5e7393);
  font-style: italic;
  text-align: center;
  padding-top: 30px;
}

#sf-galaxymap .gm-ins-section {
  border-bottom: 1px solid rgba(29, 51, 80, 0.4);
  padding-bottom: 8px;
}

#sf-galaxymap .gm-ins-section:last-child {
  border-bottom: none;
}

#sf-galaxymap .gm-ins-title {
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent, #39d0ff);
  margin-bottom: 4px;
  font-weight: 700;
}

#sf-galaxymap .gm-ins-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
}

#sf-galaxymap .gm-ins-row-val {
  font-weight: 600;
  color: #fff;
}

#sf-galaxymap .gm-ins-row-val.fresh { color: #39d0ff; }
#sf-galaxymap .gm-ins-row-val.mid { color: #fff; }
#sf-galaxymap .gm-ins-row-val.old { color: #5e7393; font-style: italic; }

#sf-galaxymap .gm-ins-btn {
  width: 100%;
  background: rgba(57, 208, 255, 0.12);
  border: 1px solid var(--accent, #39d0ff);
  color: #fff;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  transition: all 0.15s ease;
  margin-top: 10px;
}

#sf-galaxymap .gm-ins-btn:hover {
  background: rgba(57, 208, 255, 0.2);
  box-shadow: 0 0 12px rgba(57, 208, 255, 0.3);
}

/* Compact windows keep one canvas and one inspector; layers become a horizontal tool rail. */
#sf-galaxymap[data-layout="compact"] .gm-head {
  min-height: var(--gm-header-h, 72px);
  box-sizing: border-box;
  gap: 8px;
  padding: 9px 12px;
}
#sf-galaxymap[data-layout="compact"] .gm-title { font-size: .9rem; }
#sf-galaxymap[data-layout="compact"] .gm-search-container { max-width: 220px; }
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
  border-bottom: 1px solid var(--panel-edge, #1d3350);
}
#sf-galaxymap[data-layout="compact"] .gm-rail-title { margin: 0; padding: 0; border: 0; flex: 0 0 auto; }
#sf-galaxymap[data-layout="compact"] .gm-layer-buttons {
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: row;
  overflow-x: auto;
  scrollbar-width: thin;
}
#sf-galaxymap[data-layout="compact"] .gm-layer-btn { min-width: 96px; padding: 7px 9px; }
#sf-galaxymap[data-layout="compact"] .gm-rail-commodity { margin: 0; min-width: 132px; }
#sf-galaxymap[data-layout="compact"] .gm-rail-commodity label,
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
#sf-galaxymap[data-layout="narrow"] .gm-title { font-size: .82rem; flex: 1 1 auto; }
#sf-galaxymap[data-layout="narrow"] .gm-close { order: 2; }
#sf-galaxymap[data-layout="narrow"] .gm-scale-buttons { order: 3; }
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
  border-bottom: 1px solid var(--panel-edge, #1d3350);
}
#sf-galaxymap[data-layout="narrow"] .gm-rail-title,
#sf-galaxymap[data-layout="narrow"] .gm-rail-commodity,
#sf-galaxymap[data-layout="narrow"] .gm-rail-footer { display: none; }
#sf-galaxymap[data-layout="narrow"] .gm-layer-buttons {
  min-width: 0;
  flex: 1;
  flex-direction: row;
  overflow-x: auto;
}
#sf-galaxymap[data-layout="narrow"] .gm-layer-btn { min-width: 94px; padding: 7px 8px; }
#sf-galaxymap[data-layout="narrow"] .gm-viewport { grid-row: 2; }
#sf-galaxymap[data-layout="narrow"] .gm-right-inspector {
  grid-row: 3;
  width: auto;
  padding: 10px 12px;
  border-left: 0;
  border-top: 1px solid var(--panel-edge, #1d3350);
}
#sf-galaxymap[data-layout="narrow"] .gm-inspector-content { gap: 7px; }
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
  if (ageS < 600) return { key: 'fresh', color: '#39d0ff', italic: false };
  if (ageS < 3600) return { key: 'mid', color: '#ffffff', italic: false };
  return { key: 'old', color: '#5e7393', italic: true };
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

function securityPips(sec) {
  if (sec >= 0.7) return '<span style="color:#62e08a; letter-spacing: 2px;">●●●</span>';
  if (sec >= 0.4) return '<span style="color:#ffd84a; letter-spacing: 2px;">●●○</span>';
  if (sec >= 0.15) return '<span style="color:#ffb347; letter-spacing: 2px;">●○○</span>';
  return '<span style="color:#ff5c5c; letter-spacing: 2px;">○○○</span>';
}
function dangerColor(v) {
  if (v < 0.28) return '#62e08a';
  if (v < 0.50) return '#ffd84a';
  if (v < 0.72) return '#ffb347';
  return '#ff5c5c';
}
function pressureColor(v) {
  if (v > 0.08) return '#ffb347';
  if (v < -0.08) return '#64ffda';
  return '#9aa8bc';
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
  const color = t.color || '#ffd24a'; // specialization data owns this value; saves do not.
  return `
    <div class="gm-ins-section">
      <div class="gm-title" style="color:${color}; font-size: 0.95rem; margin-bottom: 4px; text-shadow:none;">${escapeMapHtml(t.name)}</div>
      <div style="color:var(--ink-dim); font-size: 0.65rem;">PLAYER-OWNED ${escapeMapHtml(t.role || 'BASE')} · ${escapeMapHtml(t.status || 'ACTIVE')}</div>
    </div>

    <div class="gm-ins-section">
      <div class="gm-ins-title">Operations</div>
      <div style="color:#fff; font-size:.68rem; line-height:1.4;">${escapeMapHtml(t.statusLine || 'No live operating telemetry.')}</div>
      <div style="margin-top:7px; color:var(--ink); font-size:.68rem; line-height:1.4;">${escapeMapHtml(t.playerVerb || 'Fly to the base.')}</div>
      <div style="margin-top:5px; color:var(--ink-dim); font-size:.64rem; line-height:1.4;">${escapeMapHtml(t.consequence || '')}</div>
      <div style="margin-top:5px; color:${color}; font-size:.64rem; line-height:1.4;">${escapeMapHtml(t.riskLine || '')}</div>
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
  let html = `
    <div class="gm-ins-section">
      <div class="gm-ins-title">Current Conditions</div>
      <div class="gm-ins-row">
        <span>Danger</span>
        <span class="gm-ins-row-val" style="color:${dangerColor(cause.danger)}">${mapPercent(cause.danger)} · ${mapTrendWord('danger', trend.danger)}</span>
      </div>
      <div class="gm-ins-row">
        <span>Price pressure</span>
        <span class="gm-ins-row-val">${mapPressureLabel(cause.pricePressure)} ${mapPercent(cause.pricePressure, true)} · ${mapTrendWord('pricePressure', trend.pricePressure)}</span>
      </div>
      <div class="gm-ins-row">
        <span>Control</span>
        <span class="gm-ins-row-val" style="color:${factionColorOf(cause.dominantFactionId || cause.ownerId)}">${escapeMapHtml(controlName)} · ${mapPercent(cause.dominantInfluence)} · ${mapTrendWord('influence', trend.influence)}</span>
      </div>
    </div>
  `;
  if (receipts.length) {
    html += `
      <div class="gm-ins-section">
        <div class="gm-ins-title">Why it changed</div>
        ${receipts.map((receipt) => `<div style="color:var(--ink-dim); font-size:.65rem; line-height:1.35; margin-top:4px;">${escapeMapHtml(receipt.line)}</div>`).join('')}
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
        stationId: p.stationId,
        entityId: p.entityId || null,
        targetSectorId: p.targetSectorId || null,
        factionId: p.factionId,
        detail: `${p.kind.toUpperCase()} · ${factionNameOf(p.factionId)}`,
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
  _lastTime: 0,
  _view: null,
  _clickTargets: [],
  _lastLabelLayout: [],
  _isHostile: isHostileToPlayer,
  _inspectorDetails: null,
  _setCourseButton: null,
  _inspectorDetailsHtml: null,
  _setCourseHandler: null,
  _scaleButtons: [],

  _claimsSystem() {
    const registry = this._ctx && this._ctx.registry;
    return registry && typeof registry.get === 'function' ? registry.get('claims') : null;
  },

  // Flagship strategic table UI states
  _layers: {
    route: true,
    mission: true,
    market: true,
    security: true,
    faction: true,
    hazard: true,
    services: true,
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

  mount(rootEl, ctx) {
    injectStyle();
    this._ctx = ctx;
    if (HAS_DOC && rootEl && this._setCourseButton && this._setCourseHandler) {
      this._setCourseButton.removeEventListener('click', this._setCourseHandler);
    }
    this._root = rootEl;
    if (!HAS_DOC || !rootEl) return this;

    rootEl.id = 'sf-galaxymap';
    rootEl.innerHTML = `
      <div class="gm-head">
        <div class="gm-title">STAR CHART</div>
        <div class="gm-search-container">
          <input type="text" class="gm-search-input" placeholder="Search galaxy... (Press /)" aria-label="Search map" tabindex="-1" />
          <div class="gm-search-results" hidden></div>
        </div>
        <div class="gm-scale-buttons" role="group" aria-label="Map scale">
          <button class="gm-scale-btn" type="button" data-focus="local" aria-pressed="false">Local</button>
          <button class="gm-scale-btn" type="button" data-focus="system" aria-pressed="false">System</button>
          <button class="gm-scale-btn" type="button" data-focus="galaxy" aria-pressed="false">Galaxy</button>
        </div>
        <div class="gm-level">Scale <b data-level>GALAXY</b></div>
        <button class="gm-close" type="button" aria-label="Close Map">Close</button>
      </div>
      <div class="gm-body-container">
        <!-- Left Rail -->
        <div class="gm-left-rail">
          <div class="gm-rail-title">Layers</div>
          <div class="gm-layer-buttons">
            <button class="gm-layer-btn active" data-layer="route">ROUTE</button>
            <button class="gm-layer-btn active" data-layer="mission">MISSION</button>
            <button class="gm-layer-btn active" data-layer="market">MARKET</button>
            <button class="gm-layer-btn active" data-layer="security">SECURITY</button>
            <button class="gm-layer-btn active" data-layer="faction">FACTION</button>
            <button class="gm-layer-btn active" data-layer="hazard">HAZARD</button>
            <button class="gm-layer-btn active" data-layer="services">SERVICES</button>
            <button class="gm-layer-btn active" data-layer="discovery">DISCOVERY</button>
          </div>
          <div class="gm-rail-commodity">
            <label for="gm-commodity-select">Market Intel</label>
            <select id="gm-commodity-select" aria-label="Select Commodity"></select>
          </div>
          <div class="gm-rail-footer">
            <div class="gm-hint-title">Controls</div>
            <div class="gm-hint-text">
              Scroll: Zoom<br/>
              Drag: Pan<br/>
              Click: Inspect<br/>
              Dbl-Click: Course<br/>
              Tab: Cycle Layers<br/>
              /: Focus Search
            </div>
          </div>
        </div>

        <!-- Viewport -->
        <div class="gm-viewport" style="flex: 1; position: relative;">
          <canvas aria-label="Galaxy navigation map"></canvas>
        </div>

        <!-- Right Inspector -->
        <div class="gm-right-inspector">
          <div class="gm-inspector-header">Inspector</div>
          <div class="gm-inspector-content">
            <div class="gm-inspector-details">
              <div class="gm-inspector-empty">No target selected. Click a sector, station, or contact to inspect.</div>
            </div>
            <button class="gm-ins-btn" id="gm-set-course-btn" type="button" hidden disabled>Set Waypoint</button>
          </div>
        </div>
      </div>
    `;

    this._body = rootEl.querySelector('.gm-viewport');
    this._canvas = rootEl.querySelector('canvas');
    this._g = this._canvas.getContext('2d');
    this._inspectorDetails = rootEl.querySelector('.gm-inspector-details');
    this._setCourseButton = rootEl.querySelector('#gm-set-course-btn');
    this._inspectorDetailsHtml = null;
    if (!this._setCourseHandler) {
      this._setCourseHandler = () => galaxyMapScreen._activateSelectedCourse();
    }
    if (this._setCourseButton) {
      this._setCourseButton.addEventListener('click', this._setCourseHandler);
    }
    this._scaleButtons = Array.from(rootEl.querySelectorAll('.gm-scale-btn'));
    this._scaleButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this._setScaleFocus(button.getAttribute('data-focus'));
      });
    });

    // Populate commodity dropdown
    const commSelect = rootEl.querySelector('#gm-commodity-select');
    if (commSelect) {
      this._syncMarketCommoditySelector(this._ctx && this._ctx.state);

      commSelect.addEventListener('change', () => {
        this._selectedCommodity = commSelect.value;
        this.refresh();
      });
    }

    // Toggle layer click listeners
    const layerBtns = rootEl.querySelectorAll('.gm-layer-btn');
    layerBtns.forEach(btn => {
      const layer = btn.getAttribute('data-layer');
      btn.addEventListener('click', () => {
        this._layers[layer] = !this._layers[layer];
        if (this._layers[layer]) btn.classList.add('active');
        else btn.classList.remove('active');

        // Trigger scan ring center
        const w = this._canvas.width / this._dpr;
        const h = this._canvas.height / this._dpr;
        this.triggerScanRing(w / 2, h / 2, '#39d0ff');
        this.refresh();
      });
    });

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

    // Consume map-authority open intent (LOCAL vs STAR/GALAXY focus + optional target fix).
    const state = this._ctx && this._ctx.state;
    this._selectedCommodity = selectedMarketCommodityOnOpen(state, this._selectedCommodity, COMMODITIES);
    this._syncMarketCommoditySelector(state);
    const intent = takeMapOpenIntent(state) || { focus: MAP_FOCUS.SYSTEM };
    const view = applyMapOpenIntentToView({
      zoom: this._zoom,
      targetZoom: this._targetZoom,
      cams: this._cams,
    }, intent, state);
    this._zoom = view.zoom;
    this._targetZoom = view.targetZoom;
    this._openIntent = view.openIntent || intent;
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

    if (typeof requestAnimationFrame === 'undefined') return;

    const loop = () => {
      if (!galaxyMapScreen._visible) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      let zoomChanged = false;
      if (Math.abs(galaxyMapScreen._zoom - galaxyMapScreen._targetZoom) > 0.0005) {
        const dt = (now - galaxyMapScreen._lastTime) / 1000;
        const alpha = 1 - Math.exp(-dt / 0.10);
        galaxyMapScreen._zoom += (galaxyMapScreen._targetZoom - galaxyMapScreen._zoom) * Math.min(1, alpha);
        zoomChanged = true;
      }
      galaxyMapScreen._lastTime = now;

      // Update scan rings
      if (galaxyMapScreen._scanRings.length > 0) {
        galaxyMapScreen._scanRings = galaxyMapScreen._scanRings.filter(ring => {
          ring.t++;
          ring.r = (ring.t / ring.maxT) * ring.maxR;
          return ring.t < ring.maxT;
        });
        zoomChanged = true; // Force redraw to animate ring
      }

      // Advance local scan sweep phase
      if (levelForZoom(galaxyMapScreen._zoom) === 'local') {
        galaxyMapScreen._scanPhase = (galaxyMapScreen._scanPhase || 0) + 0.02;
        zoomChanged = true;
      }

      const refreshTick = now - galaxyMapScreen._lastDrawTime >= 64;
      if (refreshTick) {
        galaxyMapScreen._lastDrawTime = now;
        galaxyMapScreen._resize();
      }
      if (refreshTick || zoomChanged) { galaxyMapScreen._draw(); galaxyMapScreen._updateInspector(); }

      galaxyMapScreen._animFrame = requestAnimationFrame(loop);
    };
    loop();
  },

  onHide() {
    this._visible = false;
    if (this._animFrame != null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._animFrame);
    }
    this._animFrame = null;
  },

  _setScaleFocus(focus, { draw = true, animate = true } = {}) {
    const zoom = zoomForMapFocus(focus);
    this._targetZoom = zoom;
    if (!animate) this._zoom = zoom;
    this._syncScaleButtons();
    if (draw && HAS_DOC) this._draw();
    return levelForZoom(zoom);
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
      this.triggerScanRing(w / 2, h / 2, '#8d66ff');

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
      galaxyMapScreen._draw();
      galaxyMapScreen._updateInspector();
    }
  },

  triggerScanRing(x, y, color = '#39d0ff') {
    this._scanRings.push({
      x, y, r: 0, maxR: 120, t: 0, maxT: 35, color
    });
  },

  _activeLevel() {
    return levelForZoom(this._zoom);
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

  _defaultInspectorHtml(state) {
    const cur = currentSectorId(state);
    const sectorName = (cur && ((state.world && state.world.sectors && state.world.sectors[cur] && state.world.sectors[cur].name) || (SECTOR_BY_ID.get(cur) && SECTOR_BY_ID.get(cur).name))) || cur || 'Unknown';
    const player = playerEntity(state);
    const credits = state.player && state.player.credits ? Math.round(state.player.credits).toLocaleString() : '0';
    const cargo = state.player && state.player.cargo ? (state.player.cargo.volume || 0) : 0;
    const cargoCap = state.player && state.player.cargo ? (state.player.cargo.capVolume || 1) : 1;
    const heat = state.player && state.player.heat ? Math.round(state.player.heat * 100) : 0;
    const hull = player && player.hull != null ? Math.round(player.hull) : 0;
    const hullMax = player && player.hullMax != null ? Math.round(player.hullMax) : 0;
    return `
      <div class="gm-ins-section">
        <div class="gm-ins-title">Command Status</div>
        <div class="gm-ins-row"><span>Sector</span><span class="gm-ins-row-val">${escapeMapHtml(sectorName)}</span></div>
        <div class="gm-ins-row"><span>Credits</span><span class="gm-ins-row-val">${credits} cr</span></div>
        <div class="gm-ins-row"><span>Cargo</span><span class="gm-ins-row-val">${cargo}/${cargoCap} u</span></div>
        <div class="gm-ins-row"><span>Heat</span><span class="gm-ins-row-val" style="color:${heat > 15 ? '#ff5c5c' : '#62e08a'}">${heat}%</span></div>
        <div class="gm-ins-row"><span>Hull</span><span class="gm-ins-row-val">${hull}/${hullMax}</span></div>
      </div>
      <div class="gm-ins-section">
        <div style="color:var(--ink-dim); font-size:.65rem; line-height:1.4;">Select a sector, station, or contact for detailed intel.</div>
      </div>
    `;
  },

  _updateInspector() {
    if (!HAS_DOC || !this._root) return;
    const state = this._ctx && this._ctx.state;
    const player = state ? playerEntity(state) : null;
    const detailsEl = this._inspectorDetails || this._root.querySelector('.gm-inspector-details');
    const btn = this._setCourseButton || this._root.querySelector('#gm-set-course-btn');
    if (!detailsEl || !btn) return;

    const t = this._selectedTarget;
    if (!t) {
      const defaultHtml = this._defaultInspectorHtml(state);
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
      const cause = record && isSectorCharted(state, record) ? causeFor(state, sectorId) : null;
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
      let pathLen = 0;
      if (curSec && curSec !== t.id) {
        const previewPath = computePreviewRoute(state, curSec, t.id);
        if (previewPath) {
          pathLen = previewPath.length - 1;
          routeInfo = `${pathLen} Jumps (Fuel: ${pathLen * 10} Units)`;
        } else {
          routeInfo = 'Unreachable/No path';
        }
      } else if (curSec === t.id) {
        routeInfo = 'Current Sector';
      }

      html += `
        <div class="gm-ins-section">
          <div class="gm-title" style="color:#fff; font-size: 0.95rem; margin-bottom: 4px; text-shadow:none;">${t.name}</div>
          <div style="color:var(--ink-dim); font-size: 0.65rem;">SECTOR COORDINATES: [${Math.round(t.x || 0)}, ${Math.round(t.y || 0)}]</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Faction</div>
          <div class="gm-ins-row">
            <span>Authority</span>
            <span class="gm-ins-row-val" style="color:${color}">${faction}</span>
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
            <span class="gm-ins-row-val">${law.authority}</span>
          </div>
          <div style="margin-top:6px; color:var(--ink-dim); font-size:.65rem; line-height:1.35;"><b style="color:var(--ink);">ILLEGAL:</b> ${law.illegal}</div>
          <div style="margin-top:4px; color:var(--ink-dim); font-size:.65rem; line-height:1.35;"><b style="color:var(--ink);">RESPONSE:</b> ${law.response}</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Navigation Cost</div>
          <div class="gm-ins-row">
            <span>Route</span>
            <span class="gm-ins-row-val">${routeInfo}</span>
          </div>
        </div>
      `;

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
        html += `
          <div class="gm-ins-section">
            <div class="gm-ins-title" style="color:#ffd24a;">Active Mission</div>
            <div style="font-weight:bold; color:#fff;">${relevantMission.name || 'Contract Objective'}</div>
            <div style="color:#ffd24a; font-size:0.65rem; margin-top:2px;">${missionSummary(relevantMission)}</div>
          </div>
        `;
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
      const activeMissions = state.missions && state.missions.active || [];
      const relevantMission = activeMissions.find(m => m.status === 'active' && m.destStationId === (t.stationId || t.id));

      html += `
        <div class="gm-ins-section">
          <div class="gm-title" style="color:#fff; font-size: 0.95rem; margin-bottom: 4px; text-shadow:none;">${t.name}</div>
          <div style="color:var(--ink-dim); font-size: 0.65rem;">${t.kind.toUpperCase()} OBJECT</div>
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
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
              ${services.map(s => `<span style="background:rgba(57,208,255,0.1); border:1px solid rgba(57,208,255,0.3); padding:2px 6px; border-radius:3px; font-size:0.6rem; color:#cfe3ff;">${serviceGlyph(s)} ${s.toUpperCase()}</span>`).join('')}
            </div>
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
                <span style="color:#fff; font-weight:600;">${this._selectedCommodity.replace('cmdty_', '').replace('_', ' ').toUpperCase()}</span>
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
        html += `
          <div class="gm-ins-section">
            <div class="gm-ins-title" style="color:#ffd24a;">Active Mission Target</div>
            <div style="font-weight:bold; color:#fff;">${relevantMission.name || 'Contract Objective'}</div>
            <div style="color:#ffd24a; font-size:0.65rem; margin-top:2px;">${missionSummary(relevantMission)}</div>
          </div>
        `;
      }

      {
        const primary = resolveGalaxyMapPrimaryAction(state, t);
        buttonLabel = primary && primary.label ? primary.label : 'Set Waypoint';
      }

    } else if (t.kind === 'claim') {
      html += claimInspectorHtml(t);
      buttonLabel = 'Set Base Waypoint';
    } else if (t.kind === 'zone') {
      html += `
        <div class="gm-ins-section">
          <div class="gm-title" style="color:#fff; font-size: 0.95rem; margin-bottom: 4px; text-shadow:none;">${t.name}</div>
          <div style="color:var(--ink-dim); font-size: 0.65rem;">SECTOR ZONE REGION</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Zone Classification</div>
          <div class="gm-ins-row">
            <span>Type</span>
            <span class="gm-ins-row-val">${t.detail || 'Generic Region'}</span>
          </div>
          <div class="gm-ins-row">
            <span>Threat Index</span>
            <span class="gm-ins-row-val" style="color:${t.threat ? '#ff5c5c' : '#62e08a'}">Level ${t.threat || 0}</span>
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
          <div class="gm-title" style="color:#ffd24a; font-size: 0.95rem; margin-bottom: 4px; text-shadow:none;">${t.name}</div>
          <div style="color:var(--ink-dim); font-size: 0.65rem;">ACTIVE WAYPOINT</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Navigation</div>
          <div class="gm-ins-row">
            <span>Reason</span>
            <span class="gm-ins-row-val">${t.detail || 'Tracked objective'}</span>
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
          <div class="gm-title" style="color:#fff; font-size: 0.95rem; margin-bottom: 4px; text-shadow:none;">${t.name}</div>
          <div style="color:var(--ink-dim); font-size: 0.65rem;">LOCAL CONTACT INTEL</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Object Class</div>
          <div class="gm-ins-row"><span>Type</span><span class="gm-ins-row-val">${t.kind ? t.kind.toUpperCase() : 'UNKNOWN'}</span></div>
          <div class="gm-ins-row"><span>Faction</span><span class="gm-ins-row-val" style="color:${factionColorOf(t.factionId)}">${contactFaction}</span></div>
          <div class="gm-ins-row"><span>Hostile</span><span class="gm-ins-row-val" style="color:${t.hostile ? '#ff5c5c' : '#62e08a'}">${t.hostile ? 'YES' : 'NO'}</span></div>
          <div class="gm-ins-row"><span>Distance</span><span class="gm-ins-row-val">${contactDist != null ? contactDist + ' u' : 'Unknown'}</span></div>
          <div class="gm-ins-row"><span>Speed</span><span class="gm-ins-row-val">${contactSpeed} u/s</span></div>
        </div>
      `;
      buttonLabel = 'Track Target';
    }

    if (this._inspectorDetailsHtml !== html) {
      detailsEl.innerHTML = html;
      this._inspectorDetailsHtml = html;
    }
    if (btn.textContent !== buttonLabel) btn.textContent = buttonLabel;
    if (btn.hidden) btn.hidden = false;
    if (btn.disabled) btn.disabled = false;
  },

  _activateSelectedCourse() {
    if (!this._ctx || !this._ctx.bus) return;
    const action = resolveGalaxyMapPrimaryAction(this._ctx.state, this._selectedTarget);
    if (!action) return;
    if (!emitGalaxyMapPrimaryAction(this._ctx.bus, action)) return;
    popCurrentScreen(this._ctx);
  },

  _selectSearchTarget(target) {
    const state = this._ctx && this._ctx.state;
    if (!state) return;

    this._selectedTarget = target;

    if (target.kind === 'sector') {
      this._zoom = LEVEL_SYSTEM_AT - 0.5; // galaxy scale
      this._targetZoom = this._zoom;
      const cam = this._cams.galaxy;
      cam.cx = target.x;
      cam.cy = target.y;
    } else if (target.kind === 'station' || target.kind === 'gate' || target.kind === 'poi' || target.kind === 'zone') {
      this._zoom = LEVEL_SYSTEM_AT + 0.5; // system scale
      this._targetZoom = this._zoom;
      const cam = this._cams.system;
      cam.cx = target.x;
      cam.cy = target.z;
    } else {
      this._zoom = LEVEL_LOCAL_AT + 0.5; // local scale
      this._targetZoom = this._zoom;
      const cam = this._cams.local;
      cam.cx = target.x;
      cam.cy = target.z;
    }

    this.refresh();

    // Search Enter is a complete keyboard handoff: once a result is selected, move focus out of
    // the text field and onto the visible primary action. A second Enter then follows the native
    // button path instead of re-selecting the same search row indefinitely.
    const action = resolveGalaxyMapPrimaryAction(state, target);
    const primary = this._setCourseButton || (this._root && this._root.querySelector('#gm-set-course-btn'));
    if (action && primary && typeof primary.focus === 'function') {
      try { primary.focus({ preventScroll: true }); } catch (_) { primary.focus(); }
    }

    // Trigger ring at target center
    const w = this._canvas.width / this._dpr;
    const h = this._canvas.height / this._dpr;
    this.triggerScanRing(w / 2, h / 2, '#39d0ff');
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
      const baseScale = this._view ? this._view.baseScale : 1;

      const factor = level === 'local' ? 1 : -1;
      cam.cx = this._dragStart.cx + factor * dx / (baseScale * this._zoom);
      cam.cy = this._dragStart.cy + factor * dy / (baseScale * this._zoom);
      this._draw();
      return;
    }

    // Hover hit test
    const best = pickMapTargetAt(this._clickTargets, mx, my);
    if (best !== this._hoverTarget) {
      this._hoverTarget = best;
      this._draw();
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
  },

  _onWheel(ev) {
    ev.preventDefault();
    const rect = this._canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const w = rect.width, h = rect.height;

    const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
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
      const sign = newLevel === 'local' ? -1 : 1;
      const wx = cam.cx + sign * (mx - w/2) / (baseScale * oldZoom);
      const wy = cam.cy + sign * (my - h/2) / (baseScale * oldZoom);

      cam.cx = wx - sign * (mx - w/2) / (baseScale * nextZoom);
      cam.cy = wy - sign * (my - h/2) / (baseScale * nextZoom);
    } else {
      this.triggerScanRing(w / 2, h / 2, '#8d66ff');
    }

    this._draw();
  },

  _onCanvasClick(ev) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;

    const best = pickMapTargetAt(this._clickTargets, mx, my);

    if (best) {
      this._selectedTarget = best;
      this.triggerScanRing(best.sx, best.sy, '#39d0ff');
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

  _draw() {
    const g = this._g;
    if (!g || !this._canvas) return;
    const state = this._ctx && this._ctx.state;
    const w = this._canvas.width / this._dpr, h = this._canvas.height / this._dpr;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(6,11,21,0.95)'; g.fillRect(0, 0, w, h);
    this._clickTargets.length = 0;
    if (!state) return;

    // Subtle background grid
    g.strokeStyle = 'rgba(57, 208, 255, 0.018)';
    g.lineWidth = 1;
    const grid = 50;
    for (let gx = 0; gx < w; gx += grid) { g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx, h); g.stroke(); }
    for (let gy = 0; gy < h; gy += grid) { g.beginPath(); g.moveTo(0, gy); g.lineTo(w, gy); g.stroke(); }

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

    if (level === 'galaxy') this._drawGalaxy(g, state, w, h);
    else if (level === 'system') this._drawSystem(g, state, w, h);
    else this._drawLocal(g, state, w, h);

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
  },

  // --- GALAXY DRAW ---
  _drawGalaxy(g, state, w, h) {
    const model = buildGalaxyModel(state);
    const visiblePresence = visibleGalaxyPresence(model, this._layers.faction);
    setMapCanvasAriaLabel(this._canvas, 'galaxy', visiblePresence, {
      chartedCount: model.nodes.filter((node) => node.charted).length,
    });
    if (!model.nodes.length) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of model.nodes) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); }
    const spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
    const pad = 120;
    const baseScale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);

    const cam = this._cams.galaxy;
    if (cam.cx === 0 && cam.cy === 0) {
      cam.cx = (minX + maxX) / 2;
      cam.cy = (minY + maxY) / 2;
    }

    this._view = { level: 'galaxy', baseScale };
    const sx = (x) => w / 2 + (x - cam.cx) * baseScale * cam.zoom;
    const sy = (y) => h / 2 + (y - cam.cy) * baseScale * cam.zoom;

    // Draw basic/undiscovered edges
    for (const e of model.edges) {
      if (!this._layers.discovery && !e.charted) continue;
      g.beginPath(); g.moveTo(sx(e.ax), sy(e.ay)); g.lineTo(sx(e.bx), sy(e.by));
      g.strokeStyle = e.charted ? 'rgba(57,208,255,0.22)' : 'rgba(90,110,150,0.06)';
      g.lineWidth = e.charted ? 1.5 : 0.8;
      if (!e.charted) g.setLineDash([4, 6]);
      g.stroke(); g.setLineDash([]);
    }

    // Route Beam animation
    const route = state.nav && state.nav.route;
    const routeDest = route && route.legs && route.legs.length ? route.legs[route.legs.length - 1].to : null;
    if (routeDest !== this._lastRouteDest) {
      this._lastRouteDest = routeDest;
      this._routeAnimTime = 1500;
    }

    // Draw active planned route
    if (route && route.legs && this._layers.route) {
      g.save();
      g.strokeStyle = '#39d0ff';
      g.lineWidth = 3.5;
      const isAnimating = this._routeAnimTime > 0;
      if (isAnimating) {
        g.setLineDash([8, 6]);
        g.lineDashOffset = -(Date.now() / 80) % 14;
      }
      g.beginPath();
      let first = true;
      for (const leg of route.legs) {
        const fromNode = model.nodes.find(n => n.id === leg.from);
        const toNode = model.nodes.find(n => n.id === leg.to);
        if (fromNode && toNode) {
          if (first) { g.moveTo(sx(fromNode.x), sy(fromNode.y)); first = false; }
          g.lineTo(sx(toNode.x), sy(toNode.y));
        }
      }
      g.stroke();
      g.restore();
    }

    // Draw hover preview route
    if (this._layers.route && this._hoverTarget && this._hoverTarget.kind === 'sector') {
      const startSector = currentSectorId(state);
      const endSector = this._hoverTarget.id;
      if (startSector && endSector && startSector !== endSector) {
        const previewPath = computePreviewRoute(state, startSector, endSector);
        if (previewPath) {
          g.save();
          g.strokeStyle = 'rgba(255,255,255,0.6)';
          g.lineWidth = 2;
          g.setLineDash([4, 4]);
          g.beginPath();
          let first = true;
          for (const sid of previewPath) {
            const node = model.nodes.find(n => n.id === sid);
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

    // Trade-flow arrows (market layer): point from surplus toward scarcity.
    if (this._layers.market) {
      for (const e of model.edges) {
        if (!e.charted) continue;
        const sa = sectorSignalFor(state, e.from);
        const sb = sectorSignalFor(state, e.to);
        if (!sa || !sb) continue;
        const gradient = sb.pricePressure - sa.pricePressure;
        if (Math.abs(gradient) < 0.03) continue;
        const a = model.nodes.find(n => n.id === e.from);
        const b = model.nodes.find(n => n.id === e.to);
        if (!a || !b) continue;
        const ax = sx(a.x), ay = sy(a.y), bx = sx(b.x), by = sy(b.y);
        const from = gradient > 0 ? { x: ax, y: ay } : { x: bx, y: by };
        const to = gradient > 0 ? { x: bx, y: by } : { x: ax, y: ay };
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2;
        const arrowLen = 6 + Math.min(6, Math.abs(gradient) * 12);
        g.save();
        g.strokeStyle = pressureColor(gradient); g.fillStyle = pressureColor(gradient);
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(midX, midY); g.lineTo(midX - arrowLen * Math.cos(angle - 0.45), midY - arrowLen * Math.sin(angle - 0.45)); g.stroke();
        g.beginPath(); g.moveTo(midX, midY); g.lineTo(midX - arrowLen * Math.cos(angle + 0.45), midY - arrowLen * Math.sin(angle + 0.45)); g.stroke();
        g.restore();
      }
    }

    // Draw Nodes
    for (const n of model.nodes) {
      const x = sx(n.x), y = sy(n.y);
      const r = 13;

      // R1 read knowledge: a rumor marks the sector without disclosing a world-space point.
      // This rides the existing DISCOVERY layer instead of inventing another map toggle.
      if (this._layers.discovery && n.bearingCount > 0) {
        g.save();
        g.strokeStyle = 'rgba(230,191,106,0.82)';
        g.fillStyle = 'rgba(230,191,106,0.11)';
        g.lineWidth = 1.4;
        g.setLineDash([5, 4]);
        g.beginPath(); g.arc(x, y, r + 9, 0, Math.PI * 2); g.fill(); g.stroke();
        g.setLineDash([]);
        const count = String(n.bearingCount);
        g.font = 'bold 8px monospace';
        const countWidth = Math.max(12, g.measureText(count).width + 7);
        g.fillStyle = 'rgba(4,8,16,0.94)';
        g.strokeStyle = 'rgba(230,191,106,0.82)';
        g.beginPath(); g.rect(x + r + 5, y - r - 11, countWidth, 13); g.fill(); g.stroke();
        g.fillStyle = '#e6bf6a'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(count, x + r + 5 + countWidth / 2, y - r - 4.5);
        g.restore();
      }

      // Check charted status
      if (!n.charted) {
        if (this._layers.discovery) {
          g.save();
          g.beginPath(); g.arc(x, y, r - 3, 0, Math.PI * 2);
          g.fillStyle = 'rgba(30,45,65,0.35)'; g.fill();
          g.strokeStyle = 'rgba(100,120,150,0.28)'; g.lineWidth = 1; g.setLineDash([3, 4]); g.stroke(); g.setLineDash([]);
          if (n.bearingCount > 0) {
            g.fillStyle = 'rgba(230,191,106,0.55)'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText('?', x, y);
          } else {
            g.fillStyle = 'rgba(120,140,170,0.35)'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText('?', x, y);
          }
          g.restore();
        }
        continue;
      }

      this._clickTargets.push({
        sx: x, sy: y, radiusPx: r + 8, kind: 'sector', id: n.id, sectorId: n.id, name: n.name,
        factionId: n.factionId, security: n.security, x: n.x, y: n.y,
        presence: n.presence, searchText: n.searchText,
        detail: `Sector · ${factionNameOf(n.factionId)} · Sec: ${n.security ? n.security.toFixed(2) : '0.00'}`
      });

      // Selection highlight
      if (this._selectedTarget && this._selectedTarget.id === n.id) {
        g.beginPath(); g.arc(x, y, r + 6, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(57,208,255,0.85)'; g.lineWidth = 2.5; g.stroke();
      }

      // Current sector halo
      if (n.current) {
        g.beginPath(); g.arc(x, y, r + 5, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.5; g.stroke();
      }

      // Security / danger ring (security layer)
      if (this._layers.security && n.security != null) {
        const danger = 1 - n.security;
        if (danger > 0.15) {
          g.beginPath(); g.arc(x, y, r + 10, 0, Math.PI * 2);
          g.strokeStyle = dangerColor(danger); g.lineWidth = 2; g.stroke();
        }
      }

      // Contested-sector badge (faction layer)
      if (this._layers.faction) {
        const sig = sectorSignalFor(state, n.id);
        if (sig && sig.contestMargin < 0.16) {
          g.save();
          g.fillStyle = '#c08bff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillText('⚔', x + r + 6, y - r - 4);
          g.restore();
        }
      }

      // Draw node circle
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
      if (this._layers.faction) {
        g.fillStyle = n.color; g.globalAlpha = 0.85;
      } else {
        g.fillStyle = 'rgba(60,80,110,0.9)'; g.globalAlpha = 1;
      }
      g.fill(); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 1.2; g.stroke();

      // Sector label
      g.fillStyle = n.current ? '#fff' : 'rgba(211,230,255,0.9)';
      g.font = (n.current ? 'bold ' : '') + '11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText(n.name, x, y + r + 4);

      if (this._layers.faction && n.presence && n.presence.length) {
        g.save();
        g.font = '8px monospace';
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        for (const row of galaxyPresenceMarkerRows(n.presence)) {
          const textWidth = g.measureText(row.label).width;
          const startX = x - (textWidth + 10) / 2;
          const rowY = y + r + 18 + row.offsetY;
          g.fillStyle = row.color;
          g.beginPath();
          g.moveTo(startX + 3, rowY - 3);
          g.lineTo(startX + 6, rowY);
          g.lineTo(startX + 3, rowY + 3);
          g.lineTo(startX, rowY);
          g.closePath();
          g.fill();
          g.fillText(row.label, startX + 10, rowY);
        }
        g.restore();
      }

      // Security overlay
      if (this._layers.security && n.security != null) {
        g.fillStyle = dangerColor(n.security);
        g.beginPath(); g.arc(x - r - 2, y, 3, 0, Math.PI * 2); g.fill();
      }

      // Market price overlay
      if (this._layers.market) {
        const record = sectorRecordById(state, n.id);
        const marketData = bestKnownSectorMarket(state, record, this._selectedCommodity);
        if (marketData) {
          const tint = memoryTint(marketData.ageS);
          g.save();
          g.fillStyle = 'rgba(8,14,26,0.85)';
          g.strokeStyle = tint.color; g.lineWidth = 1;
          const text = `BEST ${marketData.sell}`;
          g.font = '9px monospace';
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
          g.fillStyle = 'rgba(255,179,92,0.72)';
          g.beginPath(); g.arc(x, y - r - 6, 2.5, 0, Math.PI * 2); g.fill();
          g.restore();
        }
      }

      // Hazard warning badge
      if (this._layers.hazard) {
        const hasHazards = zonesForSector(n.id).some(z => zoneTypeMeta(z.type).hazard);
        if (hasHazards) {
          g.fillStyle = '#ff5c5c'; g.font = 'bold 11px sans-serif';
          g.fillText('⚠', x + r + 4, y - r - 4);
        }
      }
    }

    // The current goal is the final galaxy paint and strongest hit target. It is intentionally
    // larger/brighter than station, sector, route, and untracked-mission context.
    const goal = activeMapGoal(state);
    if (goal && goal.sectorId && (this._layers.route || this._layers.mission)) {
      const node = model.nodes.find((n) => n.id === goal.sectorId && n.charted);
      if (node) {
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
  },

  // --- SYSTEM DRAW ---
  _drawSystem(g, state, w, h) {
    const model = buildSystemModel(state, null, { claimsSystem: this._claimsSystem() });
    const wp = state.nav && state.nav.waypoint;
    let span = 3000;
    const pts = [];
    for (const z of model.zones) pts.push({ x: z.x, z: z.z, r: z.radius });
    for (const p of model.points) if (Number.isFinite(p.x) && Number.isFinite(p.z)) pts.push({ x: p.x, z: p.z, r: 0 });
    for (const marker of model.ownership) {
      if (marker.drawPos) pts.push({ x: marker.drawPos.x, z: marker.drawPos.z, r: 0 });
    }
    for (const bearing of model.bearings) {
      const point = bearing.drawFixedPos || bearing.drawCenter;
      if (point) pts.push({ x: point.x, z: point.z, r: bearing.drawFixedPos ? 0 : bearing.radius });
    }
    if (wp && wp.pos && Number.isFinite(wp.pos.x) && Number.isFinite(wp.pos.z)) pts.push({ x: wp.pos.x, z: wp.pos.z, r: 180 });
    if (pts.length) {
      let m = 0;
      for (const p of pts) m = Math.max(m, Math.hypot(p.x, p.z) + (p.r || 0));
      span = Math.max(800, m * 2.2);
    }

    const baseScale = (Math.min(w, h) * 0.85) / span;
    const cam = this._cams.system;

    this._view = { level: 'system', baseScale };
    const sx = (x) => w / 2 + (x - cam.cx) * baseScale * cam.zoom;
    const sz = (z) => h / 2 + (z - cam.cy) * baseScale * cam.zoom;
    const labelCandidates = [];
    setMapCanvasAriaLabel(this._canvas, 'system', model.ownership);

    // Header sector label
    g.fillStyle = 'rgba(207,227,255,0.75)'; g.font = 'bold 13px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(model.sectorName, 16, 16);

    // Player position marker on the system map
    const player = playerEntity(state);
    if (player && Number.isFinite(player.pos.x) && Number.isFinite(player.pos.z)) {
      const px = sx(player.pos.x), py = sz(player.pos.z);
      g.save();
      g.fillStyle = '#39d0ff'; g.strokeStyle = '#39d0ff'; g.shadowColor = '#39d0ff'; g.shadowBlur = 8;
      g.translate(px, py); g.rotate(Math.PI + (player.rot || 0));
      g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -4); g.lineTo(-5, 4); g.closePath(); g.fill();
      g.restore();
    }

    // Draw active system waypoint (tether path)
    if (wp && wp.pos && this._layers.route) {
      const player = playerEntity(state);
      if (player) {
        g.save();
        g.strokeStyle = '#ffd24a'; g.lineWidth = 1.8; g.setLineDash([5, 5]);
        g.beginPath(); g.moveTo(sx(player.pos.x), sz(player.pos.z)); g.lineTo(sx(wp.pos.x), sz(wp.pos.z)); g.stroke();
        g.restore();
      }
    }
    // Zones
    for (const z of model.zones) {
      const x = sx(z.x), y = sz(z.z), rr = z.radius * baseScale * cam.zoom;

      this._clickTargets.push({
        sx: x, sy: y, radiusPx: Math.max(16, rr), kind: 'zone', id: z.id, x: z.x, z: z.z, radius: z.radius, name: z.name,
        factionId: z.factionId, detail: `Zone · ${z.typeLabel} · threat ${z.threat || 0}`
      });

      // Boundary field hazards (explicit dashed red border lines, cross-hatch, not glow)
      if (z.hazard && this._layers.hazard) {
        g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2);
        g.strokeStyle = '#ff5c5c'; g.lineWidth = 2.0; g.setLineDash([8, 6]); g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(255,92,92,0.04)'; g.fill();
        const hazardGlyph = hazardTypeGlyph(z.type);
        g.save();
        g.fillStyle = '#ff8a8a'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
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
        g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2);
        if (this._layers.faction) {
          g.fillStyle = hexToRgba(z.color, 0.05); g.fill();
          g.strokeStyle = hexToRgba(z.color, 0.32);
        } else {
          g.strokeStyle = 'rgba(120,140,170,0.18)';
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
          color: z.color,
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
        const fx = sx(cx), fy = sz(cz), fr = radius * baseScale * cam.zoom;
        const glyph = asteroidOreGlyph(f.type);
        g.save();
        g.strokeStyle = 'rgba(255,177,61,0.28)';
        g.fillStyle = 'rgba(255,177,61,0.04)';
        g.setLineDash([2, 4]); g.lineWidth = 1;
        g.beginPath(); g.arc(fx, fy, fr, 0, Math.PI * 2); g.fill(); g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(255,177,61,0.75)';
        g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(glyph, fx, fy);
        g.restore();
      }
    }

    // Unique-wreck read layer. Rumors are non-interactive uncertainty regions; only a scan-fixed
    // point carries the global course target even though this system view paints sector-local XZ.
    if (this._layers.discovery) {
      for (const bearing of model.bearings) {
        const fixed = !!bearing.drawFixedPos;
        const point = bearing.drawFixedPos || bearing.drawCenter;
        if (!point) continue;
        const x = sx(point.x), y = sz(point.z);
        const radiusPx = fixed ? 0 : bearing.radius * baseScale * cam.zoom;
        const selected = !!(this._selectedTarget && this._selectedTarget.id === bearing.wreckId);
        drawUniqueWreckBearingMarker(g, x, y, radiusPx, { fixed, selected, phase: bearing.phase });

        if (fixed && bearing.courseTarget) {
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
        const phaseLabel = bearing.phase === 'salvaged' ? 'SALVAGED' : fixed ? 'FIXED' : 'READ BEARING';
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

    // Points of interest
    for (const p of model.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      const x = sx(p.x), y = sz(p.z);
      const isGate = p.kind === 'gate';
      const isStation = p.kind === 'station';

      this._clickTargets.push({
        sx: x, sy: y, radiusPx: 18, kind: p.kind, id: p.id, x: p.x, z: p.z,
        entityId: p.entityId, stationId: p.stationId, targetSectorId: p.targetSectorId,
        name: p.name, factionId: p.factionId,
        detail: `${p.kind.toUpperCase()} · ${factionNameOf(p.factionId)}`
      });

      // Highlight selected target
      if (this._selectedTarget && this._selectedTarget.id === p.id) {
        g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(57,208,255,0.8)'; g.lineWidth = 2; g.stroke();
      }

      g.save();
      const col = isGate ? '#8d66ff' : isStation ? '#39d0ff' : '#ffb35c';
      g.fillStyle = col; g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 6;

      if (isGate) {
        g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.stroke();
      } else if (isStation) {
        g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      } else {
        g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.stroke();
      }
      g.shadowBlur = 0;

      const pointLines = [p.name];
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
        text: p.name,
        lines: pointLines,
        x,
        y,
        anchorRadius: isGate ? 8 : isStation ? 7 : 5,
        color: isGate ? '#8d66ff' : isStation ? '#39d0ff' : '#ffb35c',
        secondaryColor: marketTint,
        selected: !!(this._selectedTarget && this._selectedTarget.id === p.id),
      }));

      if (isStation && services.length > 0) {
        drawServiceGlyphs(g, x, y + 13, services);
      }

      // Mission relevance overlay
      if (this._layers.mission) {
        const activeMissions = state.missions && state.missions.active || [];
        const isMissionDest = activeMissions.some(m => m.status === 'active' && m.destStationId === p.stationId);
        if (isMissionDest) {
          g.strokeStyle = '#ffd24a'; g.lineWidth = 1.5;
          g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.stroke();
        }
      }

      g.restore();
    }

    // Player-owned bases: permanent operating landmarks, visually distinct from neutral POIs.
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
      g.font = '700 15px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(marker.glyph, x, y);
      g.restore();

      labelCandidates.push(makeMapLabelCandidate(g, {
        id: `claim:${marker.claimId}`,
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

    let objectivePlacement = null;
    if (wp && wp.pos && (this._layers.route || this._layers.mission)) {
      const wx = sx(wp.pos.x);
      const wy = sz(wp.pos.z);
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
        color: '#ffb35c',
      }));
      const target = waypointClickTarget(wp, wx, wy);
      if (target) this._clickTargets.push(target);
    }
    const headerWidth = Math.min(w - 24, Math.max(80, model.sectorName.length * 8 + 16));
    const labelLayout = layoutMapLabels(labelCandidates, { width: w, height: h }, {
      reserved: [{ x: 8, y: 8, width: headerWidth, height: 24 }],
    });
    this._lastLabelLayout = labelLayout;
    for (const placement of labelLayout) {
      if (!placement.visible) continue;
      if (placement.objective) objectivePlacement = placement;
      else drawMapLabelBlock(g, placement);
    }

    // Objective marker renders last, with the first label reservation and strongest contrast.
    if (wp && wp.pos && (this._layers.route || this._layers.mission)) {
      drawWaypointPin(g, sx(wp.pos.x), sz(wp.pos.z), waypointMapLabel(wp), w, objectivePlacement);
    }
  },

  // --- LOCAL DRAW ---
  _drawLocal(g, state, w, h) {
    const model = buildLocalModel(state, this._isHostile, { claimsSystem: this._claimsSystem() });
    const cam = this._cams.local;
    const wp = state.nav && state.nav.waypoint;

    const player = playerEntity(state);
    const px = player ? player.pos.x : 0;
    const pz = player ? player.pos.z : 0;

    let span = 1600;
    let m = 0;
    for (const c of model.contacts) m = Math.max(m, Math.hypot(c.x - px, c.z - pz));
    for (const marker of model.ownership) m = Math.max(m, Math.hypot(marker.x - px, marker.z - pz));
    for (const bearing of model.bearings) {
      const point = bearing.fixedPos || bearing.center;
      if (!point) continue;
      const uncertainty = bearing.fixedPos ? 0 : bearing.radius;
      m = Math.max(m, Math.hypot(point.x - px, point.z - pz) + uncertainty);
    }
    if (wp && wp.pos && Number.isFinite(wp.pos.x) && Number.isFinite(wp.pos.z)) {
      m = Math.max(m, Math.hypot(wp.pos.x - px, wp.pos.z - pz));
    }
    if (m > 0) span = Math.max(600, m * 2.2);

    const baseScale = (Math.min(w, h) * 0.85) / span;
    this._view = { level: 'local', baseScale };
    const sx = (x) => w / 2 - (x - cam.cx) * baseScale * cam.zoom;
    const sz = (z) => h / 2 - (z - cam.cy) * baseScale * cam.zoom;
    const labelCandidates = [];
    setMapCanvasAriaLabel(this._canvas, 'local', model.ownership);

    // Range rings
    g.strokeStyle = 'rgba(57,208,255,0.08)'; g.setLineDash([3, 5]);
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
        const selected = !!(this._selectedTarget && this._selectedTarget.id === bearing.wreckId);
        drawUniqueWreckBearingMarker(g, x, y, radiusPx, { fixed, selected, phase: bearing.phase });

        if (fixed && bearing.courseTarget) {
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
        const phaseLabel = bearing.phase === 'salvaged' ? 'SALVAGED' : fixed ? 'FIXED' : 'READ BEARING';
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

    // Draw active waypoint line
    if (wp && wp.pos && this._layers.route) {
      g.save();
      g.strokeStyle = '#ffd24a'; g.lineWidth = 2; g.setLineDash([6, 5]);
      g.beginPath(); g.moveTo(sx(px), sz(pz)); g.lineTo(sx(wp.pos.x), sz(wp.pos.z)); g.stroke();
      g.restore();
    }
    // Contacts
    for (const c of model.contacts) {
      const x = sx(c.x), y = sz(c.z);

      this._clickTargets.push({
        sx: x, sy: y, radiusPx: 14, kind: c.kind, id: c.id, x: c.x, z: c.z,
        entityId: c.entityId, stationId: c.stationId, name: c.name, factionId: c.factionId,
        detail: `Contact · ${c.name} · ${c.kind.toUpperCase()}`
      });

      // Selected highlight
      if (this._selectedTarget && this._selectedTarget.id === c.id) {
        g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(57,208,255,0.85)'; g.lineWidth = 1.8; g.stroke();
      }

      g.save();
      if (c.kind === 'asteroid') {
        g.fillStyle = '#6e7b8c'; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      } else if (c.kind === 'gate') {
        g.strokeStyle = '#8d66ff'; g.shadowColor = '#8d66ff'; g.shadowBlur = 6; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.stroke();
      } else if (c.kind === 'station') {
        g.fillStyle = '#39d0ff'; g.shadowColor = '#39d0ff'; g.shadowBlur = 6;
        g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
      } else {
        const col = c.hostile ? '#ff5c5c' : (this._layers.faction && c.factionId ? factionColorOf(c.factionId) : '#39d0ff');
        g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 6;

        // Hostile velocity vector tick
        if (c.hostile && c.vx != null) {
          const pvx = -(c.vx / 3) * baseScale * cam.zoom;
          const pvz = -(c.vz / 3) * baseScale * cam.zoom;
          const len = Math.hypot(pvx, pvz);
          if (len > 0.1) {
            const mult = len > 24 ? 24 / len : 1;
            g.strokeStyle = '#ff5c5c'; g.lineWidth = 1.2;
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + pvx * mult, y + pvz * mult); g.stroke();
          }
        }

        g.translate(x, y); g.rotate(Math.PI + (c.rot || 0));
        g.beginPath(); g.moveTo(5, 0); g.lineTo(-4, -3.2); g.lineTo(-4, 3.2); g.closePath(); g.fill();
      }
      g.restore();

      const selected = !!(this._selectedTarget && this._selectedTarget.id === c.id);
      if (c.kind === 'station' || c.kind === 'gate' || selected || c.hostile || c.named) {
        labelCandidates.push(makeMapLabelCandidate(g, {
          id: `contact:${c.id}`,
          kind: c.kind,
          text: c.name,
          lines: [c.name],
          x,
          y,
          anchorRadius: c.kind === 'station' || c.kind === 'gate' ? 8 : 6,
          color: c.kind === 'gate' ? '#8d66ff'
            : c.kind === 'station' ? '#39d0ff'
              : c.hostile ? '#ff5c5c' : '#d7e6ff',
          hostile: c.hostile,
          named: c.named,
          selected,
        }));
      }
    }

    // Player position
    g.save();
    g.fillStyle = '#39d0ff'; g.shadowColor = '#39d0ff'; g.shadowBlur = 10;
    g.translate(w / 2, h / 2); g.rotate(Math.PI + (player ? player.rot : 0));
    g.beginPath(); g.moveTo(8, 0); g.lineTo(-6, -5.5); g.lineTo(-6, 5.5); g.closePath(); g.fill();
    g.restore();

    // Velocity vector
    if (player && player.vel) {
      const speed = Math.hypot(player.vel.x, player.vel.z);
      if (speed > 0.5) {
        const vLen = Math.min(80, Math.max(18, speed * 0.25));
        const angle = Math.atan2(-player.vel.z, -player.vel.x);
        g.save();
        g.strokeStyle = 'rgba(255,210,74,0.75)'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(angle) * vLen, h / 2 + Math.sin(angle) * vLen); g.stroke();
        g.restore();
      }
    }

    // Scan sweep animation around the player
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion && this._scanPhase != null) {
      g.save();
      g.strokeStyle = 'rgba(57,208,255,0.18)';
      g.lineWidth = 1.5;
      g.translate(w / 2, h / 2); g.rotate(this._scanPhase);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.min(w, h) * 0.42, 0); g.stroke();
      g.restore();
    }

    // Range ring labels
    g.fillStyle = 'rgba(120,145,175,0.65)'; g.font = '8px monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
    const ringUnits = Math.round(span / 2);
    for (let i = 0; i < 3; i++) {
      const frac = [0.33, 0.66, 1.0][i];
      const rrPx = Math.min(w, h) * 0.42 * frac;
      const label = Math.round(ringUnits * frac) + 'u';
      g.fillText(label, w / 2 + rrPx + 4, h / 2);
    }

    // Empty-space reassurance
    if (model.contacts.length === 0 && model.ownership.length === 0 && model.bearings.length === 0) {
      g.save();
      g.fillStyle = 'rgba(120,145,175,0.45)';
      g.font = '11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('CLEAR SKIES — no local contacts', w / 2, h / 2 + 30);
      g.restore();
    }

    // Player-owned bases remain labeled at local scale and can arm autopilot with a pointer action.
    for (const marker of model.ownership) {
      const x = sx(marker.x), y = sz(marker.z);
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
      g.font = '700 15px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(marker.glyph, x, y);
      g.restore();

      labelCandidates.push(makeMapLabelCandidate(g, {
        id: `claim:${marker.claimId}`,
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

    let objectivePlacement = null;
    if (wp && wp.pos && (this._layers.route || this._layers.mission)) {
      const wx = sx(wp.pos.x);
      const wy = sz(wp.pos.z);
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
        color: '#ffb35c',
      }));
      const target = waypointClickTarget(wp, wx, wy);
      if (target) this._clickTargets.push(target);
    }
    const labelLayout = layoutMapLabels(labelCandidates, { width: w, height: h }, {
      reserved: [{ x: w / 2 - 13, y: h / 2 - 13, width: 26, height: 26 }],
    });
    this._lastLabelLayout = labelLayout;
    for (const placement of labelLayout) {
      if (!placement.visible) continue;
      if (placement.objective) objectivePlacement = placement;
      else drawMapLabelBlock(g, placement);
    }

    // The tracked objective owns the final paint and the strongest label reservation.
    if (wp && wp.pos && (this._layers.route || this._layers.mission)) {
      drawWaypointPin(g, sx(wp.pos.x), sz(wp.pos.z), waypointMapLabel(wp), w, objectivePlacement);
    }
  },
};

function drawUniqueWreckBearingMarker(g, x, y, radiusPx, options = {}) {
  if (!g || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const fixed = options.fixed === true;
  const salvaged = options.phase === 'salvaged';
  const selected = options.selected === true;
  const color = salvaged ? 'rgba(230,191,106,0.58)' : '#e6bf6a';
  g.save();
  g.strokeStyle = color;
  g.fillStyle = salvaged ? 'rgba(230,191,106,0.08)' : 'rgba(230,191,106,0.11)';

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

function serviceGlyph(service) {
  switch (String(service || '').toLowerCase()) {
    case 'trade': return '$';
    case 'shipyard': return '⚙';
    case 'refuel': return '⛽';
    case 'repair': return '🔧';
    case 'missions': return '!';
    case 'ore_buy': return '◈';
    case 'refine': return '♨';
    case 'black_market': return '⚠';
    case 'module_craft': return '✚';
    case 'toll': return 'T';
    case 'scan': return 'S';
    default: return String(service || '?')[0].toUpperCase();
  }
}

function drawServiceGlyphs(g, cx, cy, services) {
  if (!g || !services || !services.length) return;
  const size = 10, gap = 3;
  const totalW = services.length * size + (services.length - 1) * gap;
  let x = cx - totalW / 2 + size / 2;
  g.save();
  g.font = 'bold 8px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const svc of services) {
    g.fillStyle = 'rgba(4,8,16,0.85)';
    g.strokeStyle = 'rgba(57,208,255,0.45)';
    g.beginPath(); g.rect(x - size / 2, cy - size / 2, size, size); g.fill(); g.stroke();
    g.fillStyle = '#cfe3ff';
    g.fillText(serviceGlyph(svc), x, cy + 0.5);
    x += size + gap;
  }
  g.restore();
}

function hexToRgba(hex, alpha) {
  const s = String(hex || '').replace('#', '');
  if (s.length !== 6) return 'rgba(136,153,170,' + alpha + ')';
  const r = parseInt(s.slice(0, 2), 16), gg = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
  if (![r, gg, b].every(Number.isFinite)) return 'rgba(136,153,170,' + alpha + ')';
  return 'rgba(' + r + ',' + gg + ',' + b + ',' + alpha + ')';
}

function makeMapLabelCandidate(g, candidate) {
  const lines = (Array.isArray(candidate.lines) ? candidate.lines : [candidate.text])
    .map((line) => String(line || '').replace(/\s+/g, ' ').trim().slice(0, 36))
    .filter(Boolean)
    .slice(0, 3);
  let width = 0;
  if (g && g.measureText) {
    g.save();
    g.font = 'bold 9px monospace';
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
  const color = placement.color || '#d7e6ff';
  g.save();
  g.fillStyle = placement.objective ? 'rgba(4,8,16,0.96)' : 'rgba(4,8,16,0.88)';
  g.strokeStyle = placement.objective ? '#ffffff' : hexToRgba(color, 0.52);
  g.lineWidth = placement.objective ? 1.4 : 1;
  g.beginPath();
  g.rect(placement.x, placement.y, placement.width, placement.height);
  g.fill();
  g.stroke();
  g.textAlign = 'left';
  g.textBaseline = 'top';
  for (let index = 0; index < lines.length; index += 1) {
    g.font = index === 0 ? 'bold 9px monospace' : '8px monospace';
    g.fillStyle = index === 0
      ? color
      : (index === lines.length - 1 && placement.secondaryColor
        ? placement.secondaryColor
        : 'rgba(155,177,208,0.82)');
    g.fillText(lines[index], placement.x + 5, placement.y + 3 + index * 11);
  }
  g.restore();
}

function waypointMapLabel(wp) {
  const raw = wp && (wp.mapLabel || wp.label || wp.reason || wp.sectorName || 'Waypoint');
  const label = String(raw || 'Waypoint').replace(/\s+/g, ' ').trim();
  return (label || 'Waypoint').slice(0, 28);
}

function drawMapGoalMarker(g, x, y, label, viewportWidth = Infinity) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const text = `GOAL · ${String(label || 'OBJECTIVE').toUpperCase().slice(0, 22)}`;
  g.save();
  // Dark acquisition plate + filled amber diamond + white keyline: high salience without a rest
  // pulse or permanent bloom. Context nodes remain smaller and never get the white keyline.
  g.fillStyle = 'rgba(4,8,16,0.9)';
  g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffb35c';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, y - 11);
  g.lineTo(x + 11, y);
  g.lineTo(x, y + 11);
  g.lineTo(x - 11, y);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = '#ffb35c';
  g.lineWidth = 2;
  g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.stroke();
  g.font = 'bold 10px monospace';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const width = g.measureText ? g.measureText(text).width : 0;
  const labelX = Number.isFinite(viewportWidth)
    ? clampMapLabelX(width, x + 21, viewportWidth, 8)
    : x + 21;
  g.strokeStyle = 'rgba(4,8,16,0.95)';
  g.lineWidth = 4;
  g.strokeText(text, labelX, y);
  g.fillStyle = '#ffb35c';
  g.fillText(text, labelX, y);
  g.restore();
}

function drawWaypointPin(g, x, y, label, viewportWidth = Infinity, labelPlacement = null) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  g.save();
  g.strokeStyle = '#ffb35c';
  g.fillStyle = 'rgba(255,179,92,0.22)';
  g.shadowColor = '#ffb35c';
  g.shadowBlur = 8;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, y - 8);
  g.lineTo(x + 8, y);
  g.lineTo(x, y + 8);
  g.lineTo(x - 8, y);
  g.closePath();
  g.fill();
  g.stroke();
  g.shadowBlur = 0;
  g.beginPath();
  g.arc(x, y, 13, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(255,179,92,0.88)';
  g.lineWidth = 1;
  g.stroke();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = '#ffb35c';
  g.font = 'bold 10px monospace';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  if (!labelPlacement) {
    const textWidth = g.measureText ? g.measureText(label).width : 0;
    const labelX = Number.isFinite(viewportWidth)
      ? clampMapLabelX(textWidth, x + 12, viewportWidth, 8)
      : x + 12;
    g.strokeStyle = 'rgba(4,8,16,0.9)';
    g.lineWidth = 3;
    g.strokeText(label, labelX, y);
    g.fillText(label, labelX, y);
  }
  g.restore();
  if (labelPlacement) drawMapLabelBlock(g, labelPlacement);
}

function waypointClickTarget(wp, sx, sy) {
  if (!wp || !wp.pos || !Number.isFinite(wp.pos.x) || !Number.isFinite(wp.pos.z)) return null;
  const label = waypointMapLabel(wp);
  return {
    sx,
    sy,
    radiusPx: 22,
    kind: 'waypoint',
    objective: true,
    markerKind: wp.markerKind || (wp.missionId || wp.onboarding ? 'mission-objective' : 'navigation'),
    id: 'active-waypoint',
    x: wp.pos.x,
    z: wp.pos.z,
    name: label,
    detail: wp.reason || wp.label || wp.mapLabel || 'Active navigation waypoint',
    missionId: wp.missionId || null,
    targetEntityId: wp.targetEntityId,
    stationId: wp.stationId,
  };
}

export default galaxyMapScreen;
