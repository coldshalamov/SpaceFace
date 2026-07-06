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
    const node = {
      id: s.id,
      name: s.name || s.id,
      x: Number(pos.x) || 0,
      y: Number(pos.y) || 0,
      factionId: s.factionId || null,
      color: factionColorOf(s.factionId),
      charted,
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
      const anchor = st.anchor || st.position || null; // sectorAnchors may merge a position in
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

  return { level: 'system', sectorId: sid, sectorName, zones, points };
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
#sf-galaxymap { position:absolute; inset:0; display:flex; flex-direction:column; background:rgba(5,10,20,.97); color:var(--ink,#cfe3ff); }
#sf-galaxymap .gm-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 16px; border-bottom:1px solid var(--panel-edge,#1d3350); background:rgba(8,14,26,.72); }
#sf-galaxymap .gm-title { font-size:.95rem; letter-spacing:.12em; text-transform:uppercase; color:var(--accent,#39d0ff); text-shadow:0 0 10px rgba(57,208,255,.4); }
#sf-galaxymap .gm-level { font-family:var(--mono,monospace); font-size:.68rem; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-dim,#7e93b3); }
#sf-galaxymap .gm-level b { color:var(--accent,#39d0ff); }
#sf-galaxymap .gm-close { background:transparent; border:1px solid var(--panel-edge,#1d3350); color:inherit; padding:5px 12px; border-radius:5px; cursor:pointer; font-family:var(--mono,monospace); font-size:.72rem; letter-spacing:.08em; }
#sf-galaxymap .gm-close:hover, #sf-galaxymap .gm-close:focus-visible { border-color:var(--accent,#39d0ff); color:#fff; }
#sf-galaxymap .gm-body { flex:1; position:relative; min-height:0; }
#sf-galaxymap canvas { position:absolute; inset:0; width:100%; height:100%; display:block; cursor:crosshair; }
#sf-galaxymap .gm-hint { position:absolute; left:12px; bottom:10px; font-family:var(--mono,monospace); font-size:.62rem; color:var(--ink-mute,#5e7393); background:rgba(6,12,22,.7); border:1px solid var(--panel-edge,#1d3350); border-radius:5px; padding:5px 9px; line-height:1.5; pointer-events:none; }
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

export const galaxyMapScreen = {
  id: 'galaxyMap',
  _ctx: null,
  _root: null,
  _body: null,
  _canvas: null,
  _g: null,
  _hint: null,
  _levelEl: null,
  _ro: null,
  _visible: false,
  _animFrame: null,
  _lastFrameAt: 0,
  _dpr: 1,
  _lastCw: 0,
  _lastCh: 0,
  _zoom: 1,
  _targetZoom: 1,
  _lastTime: 0,
  // world->screen transform for the currently-rendered level; click hit-testing reuses it.
  _view: null,
  _clickTargets: [],
  _isHostile: null,

  mount(rootEl, ctx) {
    injectStyle();
    this._ctx = ctx;
    this._root = rootEl;
    if (!HAS_DOC || !rootEl) return this;
    rootEl.id = 'sf-galaxymap';
    rootEl.innerHTML =
      '<div class="gm-head">' +
        '<div class="gm-title">Galaxy Map</div>' +
        '<div class="gm-level">Scale <b data-level>GALAXY</b> · scroll to zoom</div>' +
        '<button class="gm-close" type="button" aria-label="Close Map">Close</button>' +
      '</div>' +
      '<div class="gm-body"><canvas></canvas>' +
        '<div class="gm-hint">Scroll: zoom across LOCAL / SYSTEM / GALAXY · Click a target to set course</div>' +
      '</div>';
    this._body = rootEl.querySelector('.gm-body');
    this._canvas = rootEl.querySelector('canvas');
    this._g = this._canvas.getContext('2d');
    this._levelEl = rootEl.querySelector('[data-level]');
    this._hint = rootEl.querySelector('.gm-hint');

    // Lazy-load the scanner hostility predicate (async; the pure model degrades until it arrives).
    import('../systems/scanner.js')
      .then((m) => { if (m && typeof m.isHostileToPlayer === 'function') this._isHostile = m.isHostileToPlayer; })
      .catch(() => {});

    rootEl.querySelector('.gm-close').addEventListener('click', () => popCurrentScreen(this._ctx));

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this._body);
    }
    this._body.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.18 : 1 / 1.18;
      this._targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this._targetZoom * factor));
    }, { passive: false });
    this._canvas.addEventListener('click', (ev) => this._onClick(ev));
    this._resize();
    return this;
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._visible = true;
    // Open at the SYSTEM level (the useful middle scale) so the map is immediately readable.
    this._zoom = LEVEL_SYSTEM_AT + 0.5;
    this._targetZoom = this._zoom;
    if (!HAS_DOC) return;
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this._animFrame);
    this._resize();
    this._lastTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._lastFrameAt = 0;
    const loop = () => {
      if (!this._visible) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      let zoomChanged = false;
      if (Math.abs(this._zoom - this._targetZoom) > 0.0005) {
        const dt = (now - this._lastTime) / 1000;
        const alpha = 1 - Math.exp(-dt / 0.10);
        this._zoom += (this._targetZoom - this._zoom) * Math.min(1, alpha);
        zoomChanged = true;
      }
      this._lastTime = now;
      const refreshTick = now - this._lastFrameAt >= 100;
      if (refreshTick) { this._lastFrameAt = now; this._resize(); }
      if (refreshTick || zoomChanged) this._draw();
      this._animFrame = requestAnimationFrame(loop);
    };
    loop();
  },

  onHide() {
    this._visible = false;
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this._animFrame);
  },

  onKey(event, ctx) {
    const key = event && typeof event.key === 'string' ? event.key.toLowerCase() : '';
    if (key === 'escape' || key === 'm' || key === 'n') {
      popCurrentScreen(ctx || this._ctx);
      return true;
    }
    return false;
  },

  refresh() { if (this._visible) this._draw(); },

  _resize() {
    if (!HAS_DOC || !this._body || !this._canvas) return;
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
    g.fillStyle = 'rgba(6,11,21,0.9)'; g.fillRect(0, 0, w, h);
    this._clickTargets.length = 0;
    if (!state) return;
    const level = levelForZoom(this._zoom);
    if (this._levelEl) this._levelEl.textContent = level.toUpperCase();
    if (level === 'galaxy') this._drawGalaxy(g, state, w, h);
    else if (level === 'system') this._drawSystem(g, state, w, h);
    else this._drawLocal(g, state, w, h);
  },

  // --- galaxy render ---
  _drawGalaxy(g, state, w, h) {
    const model = buildGalaxyModel(state);
    if (!model.nodes.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of model.nodes) { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); }
    const spanX = (maxX - minX) || 1, spanY = (maxY - minY) || 1;
    const pad = 70;
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const sx = (x) => w / 2 + (x - cx) * scale;
    const sy = (y) => h / 2 + (y - cy) * scale;
    this._view = { level: 'galaxy' };

    for (const e of model.edges) {
      g.beginPath(); g.moveTo(sx(e.ax), sy(e.ay)); g.lineTo(sx(e.bx), sy(e.by));
      g.strokeStyle = e.charted ? 'rgba(57,208,255,0.28)' : 'rgba(90,110,150,0.14)';
      g.lineWidth = e.charted ? 1.4 : 0.8;
      if (!e.charted) g.setLineDash([4, 5]);
      g.stroke(); g.setLineDash([]);
    }
    for (const n of model.nodes) {
      const x = sx(n.x), y = sy(n.y);
      const r = 12;
      if (!n.charted) {
        g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fillStyle = 'rgba(40,54,76,.55)'; g.fill();
        g.strokeStyle = 'rgba(120,140,170,.4)'; g.lineWidth = 1; g.stroke();
        g.fillStyle = 'rgba(150,170,200,.5)'; g.font = '10px monospace'; g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText('???', x, y + 12);
        continue;
      }
      this._clickTargets.push({ sx: x, sy: y, radiusPx: r + 8, kind: 'sector', id: n.id, sectorId: n.id, name: n.name });
      if (n.current) {
        g.beginPath(); g.arc(x, y, r + 6, 0, Math.PI * 2); g.strokeStyle = 'rgba(57,208,255,.8)'; g.lineWidth = 2; g.stroke();
      }
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = n.color; g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = n.current ? '#fff' : 'rgba(211,230,255,.9)';
      g.font = (n.current ? '700 ' : '500 ') + '11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText(n.name, x, y + r + 4);
    }
  },

  // --- system render ---
  _drawSystem(g, state, w, h) {
    const model = buildSystemModel(state);
    // Fit to the union of zone discs + positioned points, with a sane default span.
    let span = 2000;
    const pts = [];
    for (const z of model.zones) { pts.push({ x: z.x, z: z.z, r: z.radius }); }
    for (const p of model.points) if (Number.isFinite(p.x) && Number.isFinite(p.z)) pts.push({ x: p.x, z: p.z, r: 0 });
    if (pts.length) {
      let m = 0;
      for (const p of pts) m = Math.max(m, Math.hypot(p.x, p.z) + (p.r || 0));
      span = Math.max(800, m * 2.1);
    }
    const scale = (Math.min(w, h) * 0.9) / span;
    const sx = (x) => w / 2 + x * scale;
    const sz = (z) => h / 2 + z * scale;
    this._view = { level: 'system' };

    // Header label
    g.fillStyle = 'rgba(207,227,255,.75)'; g.font = '600 12px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(model.sectorName, 14, 12);

    // Zones as tinted discs.
    for (const z of model.zones) {
      const x = sx(z.x), y = sz(z.z), rr = z.radius * scale;
      g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2);
      g.fillStyle = hexToRgba(z.color, 0.10); g.fill();
      g.strokeStyle = hexToRgba(z.color, 0.5); g.lineWidth = 1; g.setLineDash([5, 5]); g.stroke(); g.setLineDash([]);
      g.fillStyle = z.color; g.font = '10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(z.name + (z.threat ? '  ⚠' + z.threat : ''), x, y);
      this._clickTargets.push({ sx: x, sy: y, radiusPx: Math.max(16, rr), kind: 'zone', id: z.id, x: z.x, z: z.z, radius: z.radius, name: z.name });
    }
    // Stations / gates / POIs.
    for (const p of model.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      const x = sx(p.x), y = sz(p.z);
      const isGate = p.kind === 'gate';
      const isStation = p.kind === 'station';
      g.save();
      const col = isGate ? '#b99cff' : isStation ? '#7af7d0' : '#ffd24a';
      g.fillStyle = col; g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 8;
      if (isGate) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.stroke(); }
      else if (isStation) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
      else { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.stroke(); }
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(207,227,255,.85)'; g.font = '9px monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(p.name, x + 8, y);
      g.restore();
      this._clickTargets.push({
        sx: x, sy: y, radiusPx: 16, kind: p.kind, id: p.id, x: p.x, z: p.z,
        entityId: p.entityId, stationId: p.stationId, name: p.name,
      });
    }
  },

  // --- local render ---
  _drawLocal(g, state, w, h) {
    const model = buildLocalModel(state, this._isHostile);
    const cx = w / 2, cy = h / 2;
    const px = model.player ? model.player.x : 0;
    const pz = model.player ? model.player.z : 0;
    let span = 1600;
    let m = 0;
    for (const c of model.contacts) m = Math.max(m, Math.hypot(c.x - px, c.z - pz));
    if (m > 0) span = Math.max(600, m * 2.2);
    const scale = (Math.min(w, h) * 0.85) / span;
    const sx = (x) => cx - (x - px) * scale;
    const sz = (z) => cy - (z - pz) * scale;
    this._view = { level: 'local' };

    // range rings
    g.strokeStyle = 'rgba(57,208,255,0.10)'; g.setLineDash([3, 5]);
    for (const rr of [0.33, 0.66, 1.0]) { g.beginPath(); g.arc(cx, cy, Math.min(w, h) * 0.42 * rr, 0, Math.PI * 2); g.stroke(); }
    g.setLineDash([]);

    for (const c of model.contacts) {
      const x = sx(c.x), y = sz(c.z);
      g.save();
      if (c.kind === 'asteroid') { g.fillStyle = '#6e7b8c'; g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill(); }
      else if (c.kind === 'station') {
        g.fillStyle = '#7af7d0'; g.shadowColor = '#7af7d0'; g.shadowBlur = 6; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      } else {
        const col = c.hostile ? '#ff5470' : (c.factionId ? '#4DA8FF' : '#9aa8bc');
        g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 6;
        g.translate(x, y); g.rotate(Math.PI + (c.rot || 0));
        g.beginPath(); g.moveTo(4, 0); g.lineTo(-3, -2.6); g.lineTo(-3, 2.6); g.closePath(); g.fill();
      }
      g.restore();
      this._clickTargets.push({ sx: x, sy: y, radiusPx: 14, kind: c.kind, id: c.id, x: c.x, z: c.z, entityId: c.entityId, stationId: c.stationId, name: c.name });
    }
    // player
    g.save();
    g.fillStyle = '#39d0ff'; g.shadowColor = '#39d0ff'; g.shadowBlur = 10;
    g.translate(cx, cy); g.rotate(Math.PI + (model.player ? model.player.rot : 0));
    g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -4.5); g.lineTo(-5, 4.5); g.closePath(); g.fill();
    g.restore();
  },

  _onClick(ev) {
    if (!this._ctx || !this._ctx.bus || !this._canvas) return;
    const rect = this._canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    let best = null, bestD2 = Infinity;
    for (const t of this._clickTargets) {
      const dx = mx - t.sx, dy = my - t.sy;
      const d2 = dx * dx + dy * dy;
      const rad = t.radiusPx || 14;
      if (d2 <= rad * rad && d2 < bestD2) { best = t; bestD2 = d2; }
    }
    if (!best) return;
    const payload = resolveCourseTarget(best);
    if (!payload) return;
    // Sector routes also ask the world system to plot/jump, matching the legacy starmap contract.
    if (payload.type === 'sector' && payload.sectorId) {
      this._ctx.bus.emit('world:requestRoute', { targetSectorId: payload.sectorId, mode: 'fuel' });
    }
    this._ctx.bus.emit('ui:setCourse', payload);
    this._ctx.bus.emit('toast', { text: 'Course set: ' + (payload.label || 'target'), kind: 'info', ttl: 3 });
    popCurrentScreen(this._ctx);
  },
};

// hex "#rrggbb" -> "rgba(r,g,b,a)"; tolerant of bad input (returns a neutral tint).
function hexToRgba(hex, alpha) {
  const s = String(hex || '').replace('#', '');
  if (s.length !== 6) return 'rgba(136,153,170,' + alpha + ')';
  const r = parseInt(s.slice(0, 2), 16), gg = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
  if (![r, gg, b].every(Number.isFinite)) return 'rgba(136,153,170,' + alpha + ')';
  return 'rgba(' + r + ',' + gg + ',' + b + ',' + alpha + ')';
}

export default galaxyMapScreen;
