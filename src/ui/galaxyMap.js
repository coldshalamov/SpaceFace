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
// Read-only over sim state. The only outward mutation is emitting the EXISTING "ui:setCourse" event
// (same payload shapes the legacy maps use): a station/zone/contact click -> local waypoint {pos},
// a sector-node click -> route {sectorId}. Flight/nav ownership is untouched.

import { SECTORS } from '../data/sectors.js';
import { FACTION_META } from '../data/factions.js';
import { zonesForSector, zoneTypeMeta, zoneThreat } from '../data/sectorZones.js';
import { MAP_FOCUS, takeMapOpenIntent, normalizeMapFocus } from './mapAuthority.js';

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
export const LEVEL_SYSTEM_AT = 2.2;   // zoom >= this  -> SYSTEM (or LOCAL)
export const LEVEL_LOCAL_AT = 8.0;    // zoom >= this  -> LOCAL

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
  if (f === MAP_FOCUS.LOCAL) return LEVEL_LOCAL_AT + 0.5;
  if (f === MAP_FOCUS.GALAXY) return Math.max(ZOOM_MIN, LEVEL_SYSTEM_AT - 0.5);
  return LEVEL_SYSTEM_AT + 0.5;
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

/** Only gamepad entry claims DOM focus; keyboard/pointer entry keeps canvas control uninterrupted. */
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
  return 10;
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

  // Plain focus-only opens (keyboard N/M, gamepad View, touch Local/Star) must not invent a target.
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
  const nodes = [];
  const nodeById = new Map();
  for (const s of records) {
    if (!s || !s.id) continue;
    const pos = s.position || { x: 0, y: 0 };
    const charted = isSectorCharted(state, s);
    const confidence = mapConfidenceForSector(state, s);
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
      neighbors: Array.isArray(s.neighbors) ? s.neighbors.slice() : [],
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
export function buildSystemModel(state, sectorId) {
  const sid = sectorId || currentSectorId(state);
  const record = sectorRecordById(state, sid);
  const sectorName = (record && record.name) || sid || 'System';
  const confidence = mapConfidenceForSector(state, record || { id: sid });

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
          targetSectorId: isGate ? (data.targetSectorId || data.linkSectorId || null) : null,
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

  return { level: 'system', sectorId: sid, sectorName, ...confidence, zones, points };
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
export function buildLocalModel(state, isHostile) {
  const player = playerEntity(state);
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
    contacts.push({
      id: e.id,
      kind: kind === 'drone' ? 'ship' : kind,
      name: (e.data && e.data.name) || e.name || e.role || kind,
      x: e.pos.x, z: e.pos.z,
      vx: e.vel ? e.vel.x : 0, vz: e.vel ? e.vel.z : 0,
      rot: e.rot || 0,
      hostile,
      factionId: e.factionId || null,
      entityId: e.id,
      stationId: (e.type === 'station' && e.data && e.data.stationId) || null,
    });
  }
  return {
    level: 'local',
    sectorId: currentSectorId(state),
    player: player ? { id: player.id, x: player.pos.x, z: player.pos.z, rot: player.rot || 0 } : null,
    contacts,
  };
}

// ---------------------------------------------------------------------------------------------
// Unified builder — pick the model for the active zoom level.
// ---------------------------------------------------------------------------------------------

export function buildMapModel(state, zoom, opts) {
  const level = levelForZoom(zoom);
  const options = opts || {};
  if (level === 'local') return buildLocalModel(state, options.isHostile);
  if (level === 'system') return buildSystemModel(state, options.sectorId);
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
    const arrivalRadius = kind === 'gate' ? 72 : kind === 'station' ? 90 : kind === 'zone' ? Math.max(60, (target.radius || 0) * 0.5) : 48;
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
    return payload;
  }

  // No live position but we know the sector -> route toward it.
  const sectorId = target.sectorId || target.targetSectorId || null;
  if (sectorId) return { type: 'sector', sectorId, path: null, label: target.name || sectorId };
  return null;
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
  font-size: 1.1rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--accent, #39d0ff);
  text-shadow: 0 0 10px rgba(57, 208, 255, 0.5);
  font-weight: 700;
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
  background: rgba(57, 208, 255, 0.12);
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
  border-color: var(--accent, #39d0ff);
  color: #fff;
  background: rgba(57, 208, 255, 0.12);
  text-shadow: 0 0 6px rgba(57, 208, 255, 0.4);
}

#sf-galaxymap .gm-layer-btn.active::after {
  content: "●";
  color: var(--accent, #39d0ff);
  font-size: 0.6rem;
  text-shadow: 0 0 6px rgba(57, 208, 255, 0.8);
}

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
  const quotes = memory[stationId];
  const q = quotes && quotes[commodityId];
  if (!q || !Number.isFinite(Number(q.sell))) return null;
  const now = Math.max(0, Number(state.simTime) || 0);
  const ageS = Math.max(0, now - Math.max(0, Number(q.seenAt) || 0));
  return {
    buy: Math.round(Number(q.buy) || 0),
    sell: Math.round(Number(q.sell) || 0),
    ageS,
    reliability: Math.exp(-ageS / 1800),
  };
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

function securityLabel(sec) { return sec >= 0.7 ? 'High' : sec >= 0.4 ? 'Mid' : sec >= 0.15 ? 'Low' : 'Null'; }
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

function getSearchTargets(state, level, curSecId) {
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
        detail: `Sector · ${factionNameOf(n.factionId)} · Sec: ${n.security ? n.security.toFixed(2) : '0.00'}`,
      });
    }
  }
  // 2. Stations / Gates / POIs
  const systemModel = buildSystemModel(state, curSecId);
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
        factionId: p.factionId,
        detail: `${p.kind.toUpperCase()} · ${factionNameOf(p.factionId)}`,
      });
    }
  }
  // 3. Contacts
  if (level === 'local') {
    const localModel = buildLocalModel(state);
    for (const c of localModel.contacts) {
      targets.push({
        id: c.id,
        name: c.name,
        kind: c.kind,
        x: c.x,
        z: c.z,
        entityId: c.entityId,
        factionId: c.factionId,
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
  _isHostile: null,
  _inspectorDetails: null,
  _setCourseButton: null,
  _inspectorDetailsHtml: null,
  _setCourseHandler: null,
  _scaleButtons: [],

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
        <div class="gm-title">Tactical Command Table</div>
        <div class="gm-search-container">
          <input type="text" class="gm-search-input" placeholder="Search galaxy... (Press /)" aria-label="Search map" />
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
          <canvas></canvas>
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
      import('../data/commodities.js').then((m) => {
        const list = m.COMMODITIES || [];
        commSelect.innerHTML = list
          .filter(c => c.legality === 'legal')
          .map(c => `<option value="${c.id}">${c.name}</option>`)
          .join('');
        commSelect.value = this._selectedCommodity || 'cmdty_ore_iron';
      }).catch(() => {});

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

      const targets = getSearchTargets(state, levelForZoom(this._zoom), currentSectorId(this._ctx.state));
      const filtered = targets.filter(t => t.name.toLowerCase().includes(q));

      if (filtered.length === 0) {
        resultsContainer.innerHTML = '<div class="gm-search-item" style="color:var(--ink-mute); font-style:italic;">No results found</div>';
        resultsContainer.hidden = false;
        return;
      }

      resultsContainer.innerHTML = filtered.map((t, idx) => `
        <div class="gm-search-item ${idx === 0 ? 'selected' : ''}" data-idx="${idx}">
          <span class="gm-search-item-name">${t.name}</span>
          <div class="gm-search-item-detail">${t.detail}</div>
        </div>
      `).join('');
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

    // Lazy-load scan hostility predicate
    import('../systems/scanner.js')
      .then((m) => { if (m && typeof m.isHostileToPlayer === 'function') this._isHostile = m.isHostileToPlayer; })
      .catch(() => {});

    this._resize();
    return this;
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._visible = true;
    this._selectedTarget = null;
    this._hoverTarget = null;
    this._scanRings = [];

    // Consume map-authority open intent (LOCAL vs STAR/GALAXY focus + optional target fix).
    const state = this._ctx && this._ctx.state;
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
    const focusSelector = mapFocusButtonSelector(intent);
    if (focusSelector && this._root) {
      const initialControl = this._root.querySelector(focusSelector);
      if (initialControl && typeof initialControl.focus === 'function') {
        try { initialControl.focus({ preventScroll: true }); } catch (_) { initialControl.focus(); }
      }
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

  _setScaleFocus(focus, { draw = true } = {}) {
    const zoom = zoomForMapFocus(focus);
    this._zoom = zoom;
    this._targetZoom = zoom;
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

  _updateInspector() {
    if (!HAS_DOC || !this._root) return;
    const detailsEl = this._inspectorDetails || this._root.querySelector('.gm-inspector-details');
    const btn = this._setCourseButton || this._root.querySelector('#gm-set-course-btn');
    if (!detailsEl || !btn) return;

    const t = this._selectedTarget;
    if (!t) {
      const emptyHtml = `<div class="gm-inspector-empty">No target selected. Click a sector, station, or contact to inspect.</div>`;
      if (this._inspectorDetailsHtml !== emptyHtml) {
        detailsEl.innerHTML = emptyHtml;
        this._inspectorDetailsHtml = emptyHtml;
      }
      if (!btn.hidden) btn.hidden = true;
      if (!btn.disabled) btn.disabled = true;
      return;
    }

    const state = this._ctx && this._ctx.state;
    if (!state) return;

    let html = '';
    let buttonLabel = 'Track Target';

    if (t.kind === 'sector') {
      const record = sectorRecordById(state, t.id);
      const faction = factionNameOf(t.factionId);
      const color = factionColorOf(t.factionId);
      const sec = t.security != null ? t.security : 0.5;
      const secLbl = securityLabel(sec);
      const secPips = securityPips(sec);
      const activeMissions = state.missions && state.missions.active || [];
      const relevantMission = activeMissions.find(m => m.status === 'active' && (m.destSectorId === t.id || (m.params && m.params.sectorId === t.id)));

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

        <div class="gm-ins-section">
          <div class="gm-ins-title">Security & Risk</div>
          <div class="gm-ins-row">
            <span>Status</span>
            <span class="gm-ins-row-val">${secLbl} (${secPips})</span>
          </div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Navigation Cost</div>
          <div class="gm-ins-row">
            <span>Route</span>
            <span class="gm-ins-row-val">${routeInfo}</span>
          </div>
        </div>
      `;

      if (relevantMission) {
        html += `
          <div class="gm-ins-section">
            <div class="gm-ins-title" style="color:#ffd24a;">Active Mission</div>
            <div style="font-weight:bold; color:#fff;">${relevantMission.name || 'Contract Objective'}</div>
            <div style="color:#ffd24a; font-size:0.65rem; margin-top:2px;">${missionSummary(relevantMission)}</div>
          </div>
        `;
      }

      // Add main station market memory
      if (record && record.stations && record.stations[0]) {
        const mainStation = record.stations[0];
        const marketData = getMarketMemoryForStation(state, mainStation.id, this._selectedCommodity);
        if (marketData) {
          const tint = memoryTint(marketData.ageS);
          html += `
            <div class="gm-ins-section">
              <div class="gm-ins-title">Market Intel (${this._selectedCommodity.replace('cmdty_', '').replace('_', ' ').toUpperCase()})</div>
              <div class="gm-ins-row">
                <span>Buy / Sell</span>
                <span class="gm-ins-row-val" style="color:${tint.color}">${marketData.buy} / ${marketData.sell}</span>
              </div>
              <div class="gm-ins-row">
                <span>Data Age</span>
                <span class="gm-ins-row-val ${tint.key}">${ageText(marketData.ageS)} ago</span>
              </div>
            </div>
          `;
        }
      }

      buttonLabel = 'Plot Course';

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

      if (!isGate && services.length > 0) {
        html += `
          <div class="gm-ins-section">
            <div class="gm-ins-title">Available Services</div>
            <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:4px;">
              ${services.map(s => `<span style="background:rgba(57,208,255,0.1); border:1px solid rgba(57,208,255,0.3); padding:2px 6px; border-radius:3px; font-size:0.6rem; color:#cfe3ff;">${s.toUpperCase()}</span>`).join('')}
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

      buttonLabel = 'Set Waypoint';

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
      html += `
        <div class="gm-ins-section">
          <div class="gm-title" style="color:#fff; font-size: 0.95rem; margin-bottom: 4px; text-shadow:none;">${t.name}</div>
          <div style="color:var(--ink-dim); font-size: 0.65rem;">LOCAL CONTACT Intel</div>
        </div>

        <div class="gm-ins-section">
          <div class="gm-ins-title">Object Class</div>
          <div class="gm-ins-row">
            <span>Type</span>
            <span class="gm-ins-row-val">${t.kind ? t.kind.toUpperCase() : 'UNKNOWN'}</span>
          </div>
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
    const payload = resolveCourseTarget(this._selectedTarget);
    if (!payload || !this._ctx || !this._ctx.bus) return;
    if (payload.type === 'sector' && payload.sectorId) {
      this._ctx.bus.emit('world:requestRoute', { targetSectorId: payload.sectorId, mode: 'fuel' });
    }
    this._ctx.bus.emit('ui:setCourse', payload);
    this._ctx.bus.emit('toast', { text: 'Course set: ' + (payload.label || 'target'), kind: 'info', ttl: 3 });
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
    g.strokeStyle = 'rgba(57, 208, 255, 0.03)';
    g.lineWidth = 1;
    const grid = 50;
    for (let gx = 0; gx < w; gx += grid) { g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx, h); g.stroke(); }
    for (let gy = 0; gy < h; gy += grid) { g.beginPath(); g.moveTo(0, gy); g.lineTo(w, gy); g.stroke(); }

    const level = levelForZoom(this._zoom);
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

    // Draw Nodes
    for (const n of model.nodes) {
      const x = sx(n.x), y = sy(n.y);
      const r = 13;

      // Check charted status
      if (!n.charted) {
        if (this._layers.discovery) {
          g.beginPath(); g.arc(x, y, r - 3, 0, Math.PI * 2);
          g.fillStyle = 'rgba(30,45,65,0.55)'; g.fill();
          g.strokeStyle = 'rgba(100,120,150,0.3)'; g.lineWidth = 1; g.stroke();
          g.fillStyle = 'rgba(150,170,200,0.4)'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
          g.fillText('???', x, y + r + 3);
        }
        continue;
      }

      this._clickTargets.push({
        sx: x, sy: y, radiusPx: r + 8, kind: 'sector', id: n.id, sectorId: n.id, name: n.name,
        factionId: n.factionId, security: n.security, x: n.x, y: n.y,
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

      // Security overlay
      if (this._layers.security && n.security != null) {
        g.fillStyle = dangerColor(n.security);
        g.beginPath(); g.arc(x - r - 2, y, 3, 0, Math.PI * 2); g.fill();
      }

      // Market price overlay
      if (this._layers.market) {
        const record = sectorRecordById(state, n.id);
        const mainStation = record && record.stations && record.stations[0];
        if (mainStation) {
          const marketData = getMarketMemoryForStation(state, mainStation.id, this._selectedCommodity);
          if (marketData) {
            const tint = memoryTint(marketData.ageS);
            g.save();
            g.fillStyle = 'rgba(8,14,26,0.85)';
            g.strokeStyle = tint.color; g.lineWidth = 1;
            const text = `${marketData.buy}/${marketData.sell}`;
            g.font = '9px monospace';
            const tw = g.measureText(text).width;
            g.beginPath(); g.rect(x + r + 3, y - 6, tw + 6, 12); g.fill(); g.stroke();
            g.fillStyle = tint.color; g.textAlign = 'left'; g.textBaseline = 'middle';
            g.fillText(text, x + r + 6, y);
            g.restore();
          }
        }
      }

      // Mission Overlay
      if (this._layers.mission) {
        const activeMissions = state.missions && state.missions.active || [];
        const isMissionDest = activeMissions.some(m => m.status === 'active' && (m.destSectorId === n.id || (m.params && m.params.sectorId === n.id)));
        if (isMissionDest) {
          g.save();
          g.strokeStyle = '#ffd24a'; g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x, y - r - 10); g.lineTo(x + 5, y - r - 5); g.lineTo(x, y - r); g.lineTo(x - 5, y - r - 5); g.closePath();
          g.stroke();
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
  },

  // --- SYSTEM DRAW ---
  _drawSystem(g, state, w, h) {
    const model = buildSystemModel(state);
    const wp = state.nav && state.nav.waypoint;
    let span = 3000;
    const pts = [];
    for (const z of model.zones) pts.push({ x: z.x, z: z.z, r: z.radius });
    for (const p of model.points) if (Number.isFinite(p.x) && Number.isFinite(p.z)) pts.push({ x: p.x, z: p.z, r: 0 });
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

    // Header sector label
    g.fillStyle = 'rgba(207,227,255,0.75)'; g.font = 'bold 13px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(model.sectorName, 16, 16);

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
        g.fillStyle = 'rgba(255,92,92,0.06)'; g.fill();
        g.fillStyle = '#ff5c5c'; g.font = '9px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(`⚠ HAZARD BOUNDARY: ${z.name.toUpperCase()}`, x, y + rr - 12);
      } else {
        g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2);
        if (this._layers.faction) {
          g.fillStyle = hexToRgba(z.color, 0.08); g.fill();
          g.strokeStyle = hexToRgba(z.color, 0.35);
        } else {
          g.strokeStyle = 'rgba(120,140,170,0.18)';
        }
        g.lineWidth = 1.2; g.stroke();
        g.fillStyle = z.color; g.font = '10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(z.name + (z.threat ? '  ⚠' + z.threat : ''), x, y);
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
        entityId: p.entityId, stationId: p.stationId, name: p.name, factionId: p.factionId,
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

      g.fillStyle = 'rgba(207,227,255,0.85)'; g.font = '10px monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
      const pointLabelX = clampMapLabelX(g.measureText(p.name).width, x + 10, w, 8);
      g.fillText(p.name, pointLabelX, y);

      // Services Overlay
      if (this._layers.services && (isStation || isGate)) {
        const record = findStationRecord(state, p.stationId || p.id);
        const services = record && record.services ? record.services : [];
        if (services.length > 0) {
          g.fillStyle = 'rgba(57,208,255,0.45)'; g.font = '8px monospace';
          const serviceText = services.map(s => s[0].toUpperCase()).join('|');
          const serviceX = clampMapLabelX(g.measureText(serviceText).width, x + 10, w, 8);
          g.fillText(serviceText, serviceX, y + 10);
        }
      }

      // Prices Overlay
      if (this._layers.market && isStation) {
        const marketData = getMarketMemoryForStation(state, p.stationId || p.id, this._selectedCommodity);
        if (marketData) {
          const tint = memoryTint(marketData.ageS);
          g.save();
          g.fillStyle = 'rgba(8,14,26,0.85)';
          g.strokeStyle = tint.color; g.lineWidth = 1;
          const text = `${marketData.buy}/${marketData.sell}`;
          g.font = '9px monospace';
          const tw = g.measureText(text).width;
          g.beginPath(); g.rect(x + 10, y - 18, tw + 6, 12); g.fill(); g.stroke();
          g.fillStyle = tint.color; g.textAlign = 'left'; g.textBaseline = 'middle';
          g.fillText(text, x + 13, y - 12);
          g.restore();
        }
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

    // Objective marker renders after ambient geography so it cannot disappear under a station,
    // gate label, zone, or market chip. It also has explicit hit-test priority.
    if (wp && wp.pos && (this._layers.route || this._layers.mission)) {
      const wx = sx(wp.pos.x);
      const wy = sz(wp.pos.z);
      drawWaypointPin(g, wx, wy, waypointMapLabel(wp), w);
      const target = waypointClickTarget(wp, wx, wy);
      if (target) this._clickTargets.push(target);
    }
  },

  // --- LOCAL DRAW ---
  _drawLocal(g, state, w, h) {
    const model = buildLocalModel(state, this._isHostile);
    const cam = this._cams.local;
    const wp = state.nav && state.nav.waypoint;

    const player = playerEntity(state);
    const px = player ? player.pos.x : 0;
    const pz = player ? player.pos.z : 0;

    let span = 1600;
    let m = 0;
    for (const c of model.contacts) m = Math.max(m, Math.hypot(c.x - px, c.z - pz));
    if (wp && wp.pos && Number.isFinite(wp.pos.x) && Number.isFinite(wp.pos.z)) {
      m = Math.max(m, Math.hypot(wp.pos.x - px, wp.pos.z - pz));
    }
    if (m > 0) span = Math.max(600, m * 2.2);

    const baseScale = (Math.min(w, h) * 0.85) / span;
    this._view = { level: 'local', baseScale };
    const sx = (x) => w / 2 - (x - cam.cx) * baseScale * cam.zoom;
    const sz = (z) => h / 2 - (z - cam.cy) * baseScale * cam.zoom;

    // Range rings
    g.strokeStyle = 'rgba(57,208,255,0.08)'; g.setLineDash([3, 5]);
    for (const rr of [0.33, 0.66, 1.0]) {
      g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * 0.42 * rr, 0, Math.PI * 2); g.stroke();
    }
    g.setLineDash([]);

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

      g.fillStyle = 'rgba(207,227,255,0.8)'; g.font = '9px monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
      const contactLabelX = clampMapLabelX(g.measureText(c.name).width, x + 8, w, 8);
      g.fillText(c.name, contactLabelX, y);
    }

    // Player position
    g.save();
    g.fillStyle = '#39d0ff'; g.shadowColor = '#39d0ff'; g.shadowBlur = 10;
    g.translate(w / 2, h / 2); g.rotate(Math.PI + (player ? player.rot : 0));
    g.beginPath(); g.moveTo(8, 0); g.lineTo(-6, -5.5); g.lineTo(-6, 5.5); g.closePath(); g.fill();
    g.restore();

    // The tracked objective is the final local-map paint and the highest-priority hit target.
    if (wp && wp.pos && (this._layers.route || this._layers.mission)) {
      const wx = sx(wp.pos.x);
      const wy = sz(wp.pos.z);
      drawWaypointPin(g, wx, wy, waypointMapLabel(wp), w);
      const target = waypointClickTarget(wp, wx, wy);
      if (target) this._clickTargets.push(target);
    }
  },
};

// hexToRgba utility
function hexToRgba(hex, alpha) {
  const s = String(hex || '').replace('#', '');
  if (s.length !== 6) return 'rgba(136,153,170,' + alpha + ')';
  const r = parseInt(s.slice(0, 2), 16), gg = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
  if (![r, gg, b].every(Number.isFinite)) return 'rgba(136,153,170,' + alpha + ')';
  return 'rgba(' + r + ',' + gg + ',' + b + ',' + alpha + ')';
}

function waypointMapLabel(wp) {
  const raw = wp && (wp.mapLabel || wp.label || wp.reason || wp.sectorName || 'Waypoint');
  const label = String(raw || 'Waypoint').replace(/\s+/g, ' ').trim();
  return (label || 'Waypoint').slice(0, 28);
}

function drawWaypointPin(g, x, y, label, viewportWidth = Infinity) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  g.save();
  g.strokeStyle = '#ffd24a';
  g.fillStyle = 'rgba(255,210,74,0.18)';
  g.shadowColor = '#ffd24a';
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
  g.strokeStyle = 'rgba(255,210,74,0.82)';
  g.lineWidth = 1;
  g.stroke();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = '#ffd24a';
  g.font = 'bold 10px monospace';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const textWidth = g.measureText ? g.measureText(label).width : 0;
  const labelX = Number.isFinite(viewportWidth)
    ? clampMapLabelX(textWidth, x + 12, viewportWidth, 8)
    : x + 12;
  g.strokeStyle = 'rgba(4,8,16,0.9)';
  g.lineWidth = 3;
  g.strokeText(label, labelX, y);
  g.fillText(label, labelX, y);
  g.restore();
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
