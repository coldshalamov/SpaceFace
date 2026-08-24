// Local system map screen (spec §11.1 / INTEGRATION_MAP §7.2).
//
// The third navigation scale, distinct from:
//   • tactical radar (radar.js) — near-field combat contacts in the HUD corner;
//   • nav chart (starmap.js) — inter-system topology.
// This is the LOCAL/system view: the player's current playable system with stations, gates,
// remembered contacts (with confidence + age decay), and mission landmarks. It is fed by the
// generated LocalSpaceIntel model (localSpaceMapModel.js) — the same pure model used by the
// flight-computer telemetry and the deterministic flightV3 spec — so the module is now live,
// not test-only.
//
// Opened with the local-map binding (N by default). Canvas is DPI-scaled like the radar. Purely
// read-only over movement/combat state (§0.6); explicit route cards can set the nav waypoint.
import { LocalSpaceIntel, rankTradeRoutes } from '../navigation/localSpaceMapModel.js';
import { COMMODITIES } from '../../data/commodities.js';
import { STORY_BEATS } from '../../data/missions.js';
import { SECTORS } from '../../data/sectors.js';
import { BINDINGS } from '../bindings.js';
import { applyTradeNavigation } from './market.js';
import { isHostileToPlayer } from '../../systems/scanner.js';
import { sectorSignalFor, effectiveDangerTierFor } from '../../systems/sectorSim.js';
import { resolveWaypointPresentationPosition } from '../navigationWaypoint.js';
import { canvasFont, canvasFonts, invalidateCanvasFonts } from '../canvasFonts.js';

// Friendly commodity/station names for the route panel (single source: the data catalogs).
const COMM_NAME = new Map(COMMODITIES.map((c) => [c.id, c.name]));
const SECTOR_NAME = new Map(SECTORS.map((s) => [s.id, s.name]));
const EMPTY_ROUTES = Object.freeze([]);
const EMPTY_GEOMETRY = Object.freeze([]);

const LOCALMAP_STYLE = `
#sf-localmap {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  background: var(--sf-surface); color: var(--sf-paper);
  font-family: var(--sf-body-face); font-size: 14px;
  padding-left: var(--sf-safe-inset-x); padding-right: var(--sf-safe-inset-x);
}
#sf-localmap .sf-fig,
#sf-localmap .lm-route-profit,
#sf-localmap .lm-objective-meta {
  font-family: var(--sf-data-face); font-weight: 500; font-variant-numeric: tabular-nums;
  font-size: 13px; letter-spacing: 0;
}
#sf-localmap .lm-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--sf-edge); background: var(--sf-surface);
}
#sf-localmap .lm-title {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase; color: var(--sf-calm);
}
#sf-localmap .lm-scale {
  font-family: var(--sf-body-face); font-size: 13px; color: var(--sf-calm); margin-top: var(--sp-1);
}
#sf-localmap .lm-close {
  background: none; border: 1px solid var(--sf-edge); color: var(--sf-paper);
  padding: var(--sp-1) var(--sp-3); border-radius: 2px; cursor: pointer; font-size: 13px;
}
#sf-localmap .lm-close:hover { border-color: var(--sf-you); color: var(--sf-you); }
#sf-localmap .lm-body { flex: 1; position: relative; min-height: 0; }
#sf-localmap canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: crosshair; }
#sf-localmap .lm-legend {
  position: absolute; left: var(--sp-3); bottom: var(--sp-3);
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase; color: var(--sf-calm);
  background: var(--sf-surface); border: 1px solid var(--sf-edge); border-radius: 2px;
  padding: var(--sp-1) var(--sp-2); line-height: 1.5;
}
#sf-localmap .lm-routes {
  position: absolute; right: var(--sp-3); top: var(--sp-3); width: 230px; max-height: 60%; overflow-y: auto;
  background: var(--sf-surface); border: 1px solid var(--sf-edge); border-radius: 2px;
  padding: var(--sp-2) var(--sp-3); font-family: var(--sf-body-face); font-size: 13px; color: var(--sf-paper);
}
#sf-localmap .lm-routes h4 {
  margin: 0 0 var(--sp-2) 0; font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase; color: var(--sf-calm);
  display: flex; justify-content: space-between; align-items: baseline; gap: var(--sp-2);
}
#sf-localmap .lm-route {
  display: block; width: 100%; text-align: left; background: transparent; color: inherit;
  border: 0; border-bottom: 1px solid var(--sf-edge); padding: var(--sp-1) 2px; line-height: 1.4; cursor: pointer;
  font-family: var(--sf-body-face); font-size: 13px;
}
#sf-localmap .lm-route:last-child { border-bottom: none; }
#sf-localmap .lm-route:hover, #sf-localmap .lm-route:focus-visible {
  outline: 0; background: color-mix(in srgb, var(--sf-goal) 10%, transparent); color: var(--sf-paper);
}
#sf-localmap .lm-route .lm-route-hdr { display: flex; justify-content: space-between; gap: var(--sp-2); }
#sf-localmap .lm-route .lm-route-comm { color: var(--sf-calm); }
#sf-localmap .lm-route .lm-route-profit { color: var(--sf-goal); }
#sf-localmap .lm-route .lm-route-path { color: var(--sf-calm); }
#sf-localmap .lm-route .lm-route-meta { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: 2px; color: var(--sf-calm); }
#sf-localmap .lm-route .lm-route-action {
  margin-top: 2px; color: var(--sf-you); font-family: var(--sf-subhead-face); font-weight: 600;
  font-size: 12px; letter-spacing: var(--sf-track-micro); text-transform: uppercase;
}
#sf-localmap .lm-route .lm-route-stale { color: var(--sf-foe); font-size: 13px; }
#sf-localmap .lm-routes-empty { color: var(--sf-calm); }
#sf-localmap .lm-objective {
  position: absolute; left: var(--sp-3); top: var(--sp-3); width: min(340px, calc(100% - 270px)); min-width: 230px;
  background: var(--sf-surface); border: 1px solid var(--sf-edge); border-left: var(--sf-rail-w) solid var(--sf-goal);
  border-radius: 2px; padding: var(--sp-2) var(--sp-3); color: var(--sf-paper);
}
#sf-localmap .lm-objective[hidden] { display: none; }
#sf-localmap .lm-objective-k {
  color: var(--sf-goal); font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase;
}
#sf-localmap .lm-objective-title {
  margin-top: var(--sp-1); font-family: var(--sf-display-face); font-weight: 700; font-size: 28px;
  line-height: 1.1; color: var(--sf-paper); letter-spacing: 0; text-transform: none; overflow-wrap: anywhere;
}
#sf-localmap .lm-objective-body {
  margin-top: var(--sp-1); font-family: var(--sf-body-face); font-size: 14px; color: var(--sf-calm); line-height: 1.45;
}
#sf-localmap .lm-objective-meta { display: flex; gap: var(--sp-3); flex-wrap: wrap; margin-top: var(--sp-2); color: var(--sf-calm); }
#sf-localmap .lm-objective-meta .hot { color: var(--sf-goal); }
@media (max-width: 760px) {
  #sf-localmap .lm-objective { left: var(--sp-2); right: var(--sp-2); top: 58px; width: auto; max-width: none; min-width: 0; }
  #sf-localmap .lm-routes { right: var(--sp-2); left: var(--sp-2); top: auto; bottom: 54px; width: auto; max-height: 25%; }
  #sf-localmap .lm-legend { left: var(--sp-2); right: var(--sp-2); bottom: var(--sp-2); }
}
@media (prefers-reduced-motion: reduce) {
  #sf-localmap, #sf-localmap * { animation: none; transition: none; }
}
@media (forced-colors: active) {
  #sf-localmap, #sf-localmap .lm-objective, #sf-localmap .lm-routes, #sf-localmap .lm-legend {
    background: Canvas; color: CanvasText; border-color: CanvasText;
  }
}
`;

let _styleInjected = false;
function injectStyle() {
  if (_styleInjected) return;
  const s = document.createElement('style');
  s.id = 'sf-localmap-style';
  s.textContent = LOCALMAP_STYLE;
  document.head.appendChild(s);
  _styleInjected = true;
}

function canvasRoles() {
  const fallback = { you: '#7af7d0', foe: '#ff5470', goal: '#ffb347', calm: '#84a0c8', paper: '#d3e6ff', surface: '#0b1220', edge: '#1d3350' };
  if (typeof document === 'undefined' || !document.documentElement) return fallback;
  let cs;
  try { cs = getComputedStyle(document.documentElement); } catch { return fallback; }
  const read = (name, fb) => ((cs.getPropertyValue(name) || '').trim() || fb);
  return {
    you: read('--sf-you', fallback.you),
    foe: read('--sf-foe', fallback.foe),
    goal: read('--sf-goal', fallback.goal),
    calm: read('--sf-calm', fallback.calm),
    paper: read('--sf-paper', fallback.paper),
    surface: read('--sf-surface', fallback.surface),
    edge: read('--sf-edge', fallback.edge),
  };
}

function paint(hex, a) {
  if (a == null || a >= 1) return hex;
  const n = String(hex || '').replace('#', '');
  if (n.length < 6) return hex;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return hex;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

function prefersReducedMotion() {
  if (typeof document !== 'undefined' && document.documentElement
    && document.documentElement.classList.contains('sf-reduce-motion')) return true;
  try { return !!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch { return false; }
}

// One LocalSpaceIntel per session (survives open/close). Confidence + contact age persists, so a
// contact that left sensor range is still remembered (fading) when the map reopens.
let _intel = null;
function intel() {
  if (!_intel) _intel = new LocalSpaceIntel();
  return _intel;
}

export const localmapScreen = {
  id: 'localmap',
  _ctx: null,
  _root: null,
  _body: null,
  _canvas: null,
  _g: null,
  _routesPanel: null,
  _objectivePanel: null,
  _ro: null,
  _visible: false,
  _animFrame: null,
  _lastFrameAt: 0,
  _dpr: 1,
  _lastCanvasW: 0,
  _lastCanvasH: 0,
  _lastDpr: 0,
  _zoom: 1,
  _pan: { x: 0, y: 0 },
  _routes: EMPTY_ROUTES,
  _routesSig: '',
  _objectiveSig: '',
  _mapPlayer: { id: null, pos: null, vel: null, rot: 0 },
  _mapTransform: null,
  _lastClickTargets: [],
  _missionGeometryScratch: [{
    id: 'nav-waypoint',
    kind: 'waypoint',
    label: 'Objective',
    position: { x: 0, z: 0 },
    metadata: { missionId: null, sectorId: null, sectorName: null },
  }],

  mount(rootEl, ctx) {
    injectStyle();
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.id = 'sf-localmap';
    const localMapKey = BINDINGS.localmap.label;
    const starMapKey = BINDINGS.starmap.label;
    rootEl.innerHTML =
      '<div class="lm-head sf-crest">' +
        '<div><div class="lm-title">Local System Map</div>' +
        `<div class="lm-scale">SYSTEM SCALE · remembered contacts age + fade · press ${localMapKey} or Esc to close</div></div>` +
        `<button class="lm-close" type="button" aria-label="Close Local Map">Close (${localMapKey})</button>` +
      '</div>' +
      '<div class="lm-body sf-stage"><canvas></canvas>' +
      '<div class="lm-objective" id="sf-localmap-objective" hidden></div>' +
      '<div class="lm-legend">' +
        `◆ STATION · ◇ GATE · ▲ HOSTILE · ▲ FRIENDLY · ● ASTEROID · ? SCAN PING · Zoom: [Scroll Wheel]` +
      '</div>' +
      '<div class="lm-routes sf-apron" id="sf-localmap-routes"><h4>Trade Routes</h4><div class="lm-routes-empty">Scan markets at stations to rank routes</div></div>' +
      '</div>';
    this._body = rootEl.querySelector('.lm-body');
    this._canvas = rootEl.querySelector('canvas');
    this._g = this._canvas.getContext('2d');
    this._objectivePanel = rootEl.querySelector('#sf-localmap-objective');
    this._routesPanel = rootEl.querySelector('#sf-localmap-routes');
    this._routes = EMPTY_ROUTES;
    this._routesSig = '';
    this._objectiveSig = '';
    this._lastCanvasW = 0;
    this._lastCanvasH = 0;
    this._lastDpr = 0;
    rootEl.querySelector('.lm-close').addEventListener('click', () => this._close());
    this._routesPanel.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-act="route-nav"]');
      if (!btn) return;
      applyTradeNavigation(this._ctx, btn.getAttribute('data-destination'), btn.getAttribute('data-commodity'));
    });
    // Auto-fit the canvas to its container (DPI-scaled).
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this._body);
    this._resize();

    // Zoom listener
    this._targetZoom = this._zoom;
    this._body.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 0.8 : 1.25;
      this._targetZoom = Math.max(0.2, Math.min(5, this._targetZoom * factor));
    }, { passive: false });
    this._canvas.addEventListener('click', (ev) => this._onCanvasClick(ev));

    return this;
  },

  onShow() {
    this._zoom = 1;
    this._targetZoom = 1;
    this._visible = true;
    invalidateCanvasFonts();
    cancelAnimationFrame(this._animFrame);
    this._resize(); // size the canvas synchronously so the first draw isn't on a 0x0 surface
    const loop = () => {
      if (!this._visible) return;
      const now = performance.now();
      
      let zoomChanged = false;
      if (prefersReducedMotion()) {
        if (this._targetZoom !== undefined && this._zoom !== this._targetZoom) {
          this._zoom = this._targetZoom;
          zoomChanged = true;
        }
        this._lastTime = now;
      } else if (this._targetZoom !== undefined && Math.abs(this._zoom - this._targetZoom) > 0.001) {
        const dt = (now - this._lastTime) / 1000;
        this._lastTime = now;
        const alpha = 1 - Math.exp(-dt / 0.10); // 150ms ease
        this._zoom += (this._targetZoom - this._zoom) * Math.min(1, alpha);
        zoomChanged = true;
      } else {
        this._lastTime = now;
      }

      const refreshTick = now - this._lastFrameAt >= 100;
      if (refreshTick) {
        this._lastFrameAt = now;
        this._resize(); // keep DPI/size fresh while open
        this._refreshIntel();
      }

      if (refreshTick || zoomChanged) {
        this._draw();
      }
      this._animFrame = requestAnimationFrame(loop);
    };
    this._lastTime = performance.now();
    this._lastFrameAt = 0;
    loop();
  },

  onHide() {
    this._visible = false;
    cancelAnimationFrame(this._animFrame);
  },

  onKey(event, ctx) {
    const key = event && typeof event.key === 'string' ? event.key.toLowerCase() : '';
    if (key === BINDINGS.localmap.key || event.key === BINDINGS.localmap.label) {
      const sm = (ctx && ctx.screenManager) || (this._ctx && this._ctx.screenManager);
      if (sm && typeof sm.popScreen === 'function') sm.popScreen();
      else this._close();
      return true;
    }
    return false;
  },

  refresh() { if (this._visible) { this._refreshIntel(); this._draw(); } },

  // Feed live entities into the LocalSpaceIntel model. The model decays confidence over time, so a
  // contact seen here is remembered (fading) even after it leaves sensor range — this is the
  // "remembered contacts" contract from spec §11.1, distinct from the omniscient galaxy map.
  _refreshIntel() {
    const ctx = this._ctx;
    const state = ctx && ctx.state;
    if (!state) return;
    const now = (state.simTime || 0);
    const m = intel();
    m.advance(now);
    const player = state.entities && state.entities.get(state.playerId);
    if (!player) return;
    const playerTeam = player.team;
    for (const e of state.entityList || []) {
      if (!e || !e.alive || e.id === state.playerId) continue;
      if (e.type === 'ship' || e.type === 'drone') {
        m.observeContact({
          id: e.id, type: 'ship', name: e.data && e.data.name || e.role || 'ship',
          factionId: e.factionId, hostile: isHostileToPlayer(e, playerTeam, ctx.state),
          pos: e.pos, vel: e.vel, rot: e.rot, radius: e.radius,
        }, { timeS: now, source: 'local-sensor' });
      } else if (e.type === 'station') {
        m.markLandmark({
          id: e.id, kind: (e.data && e.data.isGate) ? 'gate' : 'station',
          name: e.data && e.data.name || e.name || 'station', pos: e.pos, factionId: e.factionId,
        });
        m.observeContact({ id: e.id, type: 'station', pos: e.pos, radius: e.radius, dockable: true },
          { timeS: now, confidence: 1, source: 'static' });
      } else if (e.type === 'asteroid') {
        m.observeContact({ id: e.id, type: 'asteroid', pos: e.pos, radius: e.radius },
          { timeS: now, confidence: 0.7, source: 'passive' });
      }
    }
    // Economy UX (spec §13): instantiate LocalSpaceIntel market beacons from the LIVE station
    // economy data (state.economy.marketIntel, captured when the player docks/scans) and compute
    // the ranked trade routes via the proven rankTradeRoutes model. The routes panel renders them.
    this._refreshRoutes(m, now);
  },

  // Build market beacons from live economy intel + rank the routes. Beacons age (reliability decays
  // by exp(-ageS/1800)) so fresh market scans rank above stale ones — the player is rewarded for
  // current intelligence, matching the spec §13 contract proven in probe-dod-market-beacons.mjs.
  _refreshRoutes(m, now) {
    const state = this._ctx.state;
    const economy = state.economy;
    if (!economy || !economy.marketIntel) { this._routes = EMPTY_ROUTES; this._renderRoutes(); return; }
    const beacons = [];
    for (const stationId in economy.marketIntel) {
      const intel = economy.marketIntel[stationId];
      if (!intel || !intel.snapshot) continue;
      const quotes = {};
      for (const cid in intel.snapshot) {
        const q = intel.snapshot[cid];
        quotes[cid] = { buy: q.buy || q.mid || 0, sell: q.sell || q.mid || 0, stock: q.stock || 0, demand: q.role === 'consume' ? 100 : 0 };
      }
      beacons.push({ stationId, quotes, capturedAtS: intel.seenAtT || 0, reliability: 1.0 });
    }
    const player = state.entities.get(state.playerId);
    const cargoState = state.player && state.player.cargo;
    const cargo = Math.max(1, Number(cargoState && cargoState.capVolume) || (player && player.data && player.data.cargoCap) || 40);
    // Travel estimate: straight-line distance between stations, at the player's cruise speed.
    const travelEstimator = (a, b) => {
      const pa = stationPositionForRoute(state, a), pb = stationPositionForRoute(state, b);
      const dist = (pa && pb) ? Math.hypot(pa.x - pb.x, pa.z - pb.z) : 1000;
      const speed = (player && player.maxSpeed) || 200;
      return { timeS: dist / Math.max(50, speed), fuel: dist * 0.01 };
    };
    try {
      this._routes = rankTradeRoutes({
        beacons,
        cargoCapacity: cargo,
        travelEstimator,
        riskEstimator: buildStationRiskEstimator(state),
        nowS: now,
      }) || [];
    } catch (_) { this._routes = EMPTY_ROUTES; }
    this._renderRoutes();
  },

  _renderRoutes() {
    const panel = this._routesPanel;
    if (!panel) return;
    const allRoutes = this._routes || EMPTY_ROUTES;
    const routes = allRoutes.length > 5 ? allRoutes.slice(0, 5) : allRoutes; // top 5 by profit/min
    let html = '';
    if (!routes.length) {
      html = '<h4>Trade Routes</h4><div class="lm-routes-empty">Scan markets at stations to rank routes</div>';
    } else {
      const commName = (cid) => COMM_NAME.get(cid) || cid;
      const stationName = (id) => stationNameForRoute(this._ctx.state, id);
      html = '<h4>Trade Routes <span class="sf-fig">profit/min</span></h4>';
      for (const r of routes) {
        const reliability = Number.isFinite(Number(r.reliability)) ? Number(r.reliability) : 1;
        const stale = reliability < 0.5;
        const originName = stationName(r.originId);
        const destinationName = stationName(r.destinationId);
        const commodityName = commName(r.commodityId);
        const expectedProfit = formatCredits(r.expectedProfit);
        const units = Math.max(0, Math.floor(Number(r.units) || 0));
        const fuel = Math.round(Number(r.fuel) || 0);
        const routeActionLabel = tradeRouteActionLabel({
          originName,
          destinationName,
          commodityName,
          units,
          expectedProfit,
          fuel,
          stale,
          reliability,
        });
        html += '<button class="lm-route" type="button" data-act="route-nav" data-destination="' + escapeAttr(r.destinationId) + '" data-commodity="' + escapeAttr(r.commodityId) + '"' +
          ' aria-label="' + escapeAttr(routeActionLabel) + '">' +
          '<div class="lm-route-hdr">' +
            '<span class="lm-route-comm">' + escapeHtml(commodityName) + '</span>' +
            '<span class="lm-route-profit">' + Math.round(r.profitPerMinute) + '/m</span>' +
          '</div>' +
          '<div class="lm-route-path">' + escapeHtml(originName) + ' → ' + escapeHtml(destinationName) + '</div>' +
          '<div class="lm-route-meta"><span class="sf-fig">' + units + 'u load</span> <span class="sf-fig">+' + expectedProfit + ' cr</span> <span class="sf-fig">' + fuel + 'F est</span></div>' +
          '<div class="lm-route-action">Set sell course</div>' +
          (stale ? '<div class="lm-route-stale">stale intel (' + Math.round(reliability * 100) + '% reliable)</div>' : '') +
        '</button>';
      }
    }
    if (html === this._routesSig) return;
    this._routesSig = html;
    panel.innerHTML = html;
  },

  _close() {
    const sm = this._ctx && this._ctx.screenManager;
    if (sm && typeof sm.popScreen === 'function') sm.popScreen();
  },

  _resize() {
    const wrap = this._body;
    if (!wrap || !this._canvas) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(2, Math.floor(w * dpr));
    const ch = Math.max(2, Math.floor(h * dpr));
    if (cw === this._lastCanvasW && ch === this._lastCanvasH && dpr === this._lastDpr) return;
    this._dpr = dpr;
    this._lastCanvasW = cw;
    this._lastCanvasH = ch;
    this._lastDpr = dpr;
    this._canvas.width = cw;
    this._canvas.height = ch;
    this._g.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  _draw() {
    const g = this._g;
    const ctx = this._ctx;
    const state = ctx && ctx.state;
    if (!g || !state) return;
    const w = this._canvas.width / this._dpr, h = this._canvas.height / this._dpr;
    const C = { x: w / 2, y: h / 2 };
    const player = state.entities && state.entities.get(state.playerId);
    if (!player) { g.clearRect(0, 0, w, h); return; }

    const m = intel();
    const missionGeometry = this._missionGeometry(state);
    const mapPlayer = this._mapPlayer;
    mapPlayer.id = player.id;
    mapPlayer.pos = player.pos;
    mapPlayer.vel = player.vel;
    mapPlayer.rot = player.rot;
    const map = m.buildLocalMap({
      player: mapPlayer,
      mode: 'system',
      missionGeometry,
    });
    this._renderObjectivePanel(state, player);

    // World → screen: player fixed at center. Both axes negated to match the chase-cam/radar
    // convention (world +Z = screen up, world +X = screen left). Scale fits the contact spread.
    const bounds = map.bounds || {};
    const span = Math.max(400, Math.hypot((bounds.maxX || 600) - (bounds.minX || -600), (bounds.maxZ || 600) - (bounds.minZ || -600)));
    const scale = ((Math.min(w, h) * 0.42) / span) / (this._zoom || 1);
    const wx = (x) => C.x - (x - player.pos.x) * scale;
    const wz = (z) => C.y - (z - player.pos.z) * scale;
    this._mapTransform = { cx: C.x, cy: C.y, scale, playerX: player.pos.x, playerZ: player.pos.z };
    this._lastClickTargets.length = 0;
    const roles = canvasRoles();
    canvasFonts();

    g.clearRect(0, 0, w, h);
    g.fillStyle = paint(roles.surface, 0.92);
    g.fillRect(0, 0, w, h);
    g.strokeStyle = paint(roles.calm, 0.12); g.lineWidth = 1;
    const grid = 48;
    for (let gx = (C.x % grid); gx < w; gx += grid) { g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx, h); g.stroke(); }
    for (let gy = (C.y % grid); gy < h; gy += grid) { g.beginPath(); g.moveTo(0, gy); g.lineTo(w, gy); g.stroke(); }
    g.strokeStyle = paint(roles.calm, 0.22); g.lineWidth = 1; g.setLineDash([3, 5]);
    for (const r of [0.25, 0.5, 1.0]) { g.beginPath(); g.arc(C.x, C.y, Math.min(w, h) * 0.42 * r, 0, Math.PI * 2); g.stroke(); }
    g.setLineDash([]);
    g.fillStyle = roles.calm; g.font = canvasFont(500, 13, 'data'); g.textAlign = 'left'; g.textBaseline = 'middle';
    for (const r of [0.25, 0.5, 1.0]) g.fillText(Math.round(span * r) + 'u', C.x + Math.min(w, h) * 0.42 * r + 3, C.y - 6);

    // Static landmarks (stations/gates) — persistent, high confidence. Same calm hue; shape differs.
    for (const lm of map.landmarks || []) {
      const x = wx(lm.position.x), y = wz(lm.position.z);
      const isGate = lm.kind === 'gate';
      this._lastClickTargets.push({
        sx: x, sy: y, radiusPx: 18,
        targetEntityId: lm.id,
        pos: { x: lm.position.x, z: lm.position.z },
        label: lm.name || (isGate ? 'Gate' : 'Station'),
        kind: isGate ? 'gate' : 'station',
        arrivalRadius: isGate ? 72 : 90,
      });
      g.save();
      g.fillStyle = roles.calm;
      g.strokeStyle = roles.calm;
      if (isGate) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.stroke(); }
      else { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = roles.paper; g.font = canvasFont(500, 13, 'body'); g.textAlign = 'left';
      g.fillText(lm.name || lm.id, x + 8, y);
      g.restore();
    }

    // Contacts — ships/asteroids with confidence + age. Bright = fresh, faint = stale.
    for (const c of map.contacts || []) {
      if (c.kind === 'station') continue; // drawn as landmark
      const x = wx(c.position.x), y = wz(c.position.z);
      const conf = Math.max(0, Math.min(1, c.confidence || 0));
      if (conf < 0.05) continue;
      this._lastClickTargets.push({
        sx: x, sy: y, radiusPx: c.kind === 'asteroid' ? 12 : 16,
        targetEntityId: c.id,
        pos: { x: c.position.x, z: c.position.z },
        label: c.name || (c.hostile ? 'Hostile contact' : c.kind || 'Contact'),
        kind: c.kind || 'contact',
        arrivalRadius: c.kind === 'asteroid' ? 64 : 48,
      });
      const stale = c.lastSeenS != null && (m.timeS - c.lastSeenS) > 6;
      if (c.kind === 'asteroid') {
        g.globalAlpha = 0.3 + conf * 0.7;
        g.fillStyle = roles.calm; g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
      } else {
        g.save();
        g.globalAlpha = 0.3 + conf * 0.7;
        const col = c.hostile ? roles.foe : roles.calm;
        g.fillStyle = col; g.strokeStyle = col;
        if (!stale && c.hostile) g.lineWidth = 1.6;

        // Hostile motion vector ticks (velocity / 3, clamp max 24px)
        if (c.hostile && c.velocity) {
          const pvx = -(c.velocity.x / 3) * scale;
          const pvz = -(c.velocity.z / 3) * scale;
          const len = Math.hypot(pvx, pvz);
          if (len > 0.1) {
            const mult = len > 24 ? 24 / len : 1;
            const targetX = x + pvx * mult;
            const targetZ = y + pvz * mult;

            g.strokeStyle = roles.foe;
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(targetX, targetZ);
            g.stroke();

            const angle = Math.atan2(pvz, pvx);
            const crossLen = 3.5;
            g.beginPath();
            g.moveTo(targetX - Math.sin(angle) * crossLen, targetZ + Math.cos(angle) * crossLen);
            g.lineTo(targetX + Math.sin(angle) * crossLen, targetZ - Math.cos(angle) * crossLen);
            g.stroke();
          }
        }

        const ang = c.heading || 0;
        g.translate(x, y); g.rotate(Math.PI + ang);
        g.beginPath(); g.moveTo(4, 0); g.lineTo(-3, -2.6); g.lineTo(-3, 2.6); g.closePath(); g.fill();
        g.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
        g.restore();
      }
    }
    g.globalAlpha = 1;

    this._drawScanOverlays(g, state, wx, wz, roles);

    // Active waypoint / mission geometry. This uses the same state.nav.waypoint source as the HUD,
    // so the map remains a recovery surface when the tactical radar no longer has nearby dots.
    for (const item of map.missionGeometry || []) {
      const pnt = item.position;
      if (!pnt) continue;
      const x = wx(pnt.x), y = wz(pnt.z);
      this._lastClickTargets.push({
        sx: x, sy: y, radiusPx: 20,
        targetEntityId: item.id,
        pos: { x: pnt.x, z: pnt.z },
        label: item.label || item.reason || 'Objective',
        kind: item.kind || 'waypoint',
        arrivalRadius: 44,
      });
      g.save();
      g.strokeStyle = roles.goal;
      g.fillStyle = roles.goal;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y - 8); g.lineTo(x + 8, y); g.lineTo(x, y + 8); g.lineTo(x - 8, y); g.closePath();
      g.stroke();
      g.globalAlpha = 0.18;
      g.beginPath(); g.arc(x, y, 24, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.72;
      g.setLineDash([6, 5]);
      g.beginPath(); g.moveTo(C.x, C.y); g.lineTo(x, y); g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      g.font = canvasFont(600, 13, 'subhead');
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(item.label || item.reason || 'Objective', x + 12, y);
      g.restore();
    }

    // Player at center (heading marker) — you. Shape is the chevron; stations stay circles.
    g.save();
    g.fillStyle = roles.you; g.strokeStyle = roles.you; g.lineWidth = 1.4;
    g.translate(C.x, C.y); g.rotate(Math.PI + (player.rot || 0));
    g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -4.5); g.lineTo(-5, 4.5); g.closePath(); g.fill();
    g.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    g.restore();

    // Velocity vector — your momentum.
    const sp = Math.hypot(player.vel.x, player.vel.z);
    if (sp > 1) {
      const vx = wx(player.pos.x + player.vel.x * 1.5), vz = wz(player.pos.z + player.vel.z * 1.5);
      g.strokeStyle = paint(roles.you, 0.8); g.lineWidth = 1.3; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(C.x, C.y); g.lineTo(vx, vz); g.stroke(); g.setLineDash([]);
    }
  },

  _missionGeometry(state) {
    const wp = state.nav && state.nav.waypoint;
    const pos = resolveWaypointPresentationPosition(state, wp);
    if (!wp || !pos) return EMPTY_GEOMETRY;
    const item = this._missionGeometryScratch[0];
    item.id = wp.missionId || wp.targetEntityId || wp.stationId || 'nav-waypoint';
    item.kind = wp.kind || 'waypoint';
    item.label = wp.reason || wp.label || 'Objective';
    item.position.x = pos.x;
    item.position.z = pos.z;
    item.metadata.missionId = wp.missionId || null;
    item.metadata.sectorId = wp.sectorId || null;
    item.metadata.sectorName = wp.sectorName || null;
    return this._missionGeometryScratch;
  },

  _onCanvasClick(ev) {
    if (!this._ctx || !this._ctx.bus || !this._mapTransform) return;
    const rect = this._canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const snapped = this._nearestClickTarget(sx, sy);
    const fix = snapped || this._screenToWorldFix(sx, sy);
    if (!fix || !fix.pos) return;
    const label = fix.label || 'Map fix';
    this._ctx.bus.emit('ui:setCourse', {
      pos: fix.pos,
      targetEntityId: fix.targetEntityId,
      label,
      reason: label,
      waypointKind: fix.kind || 'local',
      arrivalRadius: fix.arrivalRadius || 36,
      autopilot: true,
    });
    this._ctx.bus.emit('toast', { text: 'Autopilot set: ' + label, kind: 'info', ttl: 3 });
    this._close();
  },

  _nearestClickTarget(sx, sy) {
    let best = null;
    let bestD2 = Infinity;
    for (const t of this._lastClickTargets || EMPTY_ROUTES) {
      const dx = sx - t.sx;
      const dy = sy - t.sy;
      const d2 = dx * dx + dy * dy;
      const radius = t.radiusPx || 14;
      if (d2 <= radius * radius && d2 < bestD2) {
        best = t;
        bestD2 = d2;
      }
    }
    return best;
  },

  _screenToWorldFix(sx, sy) {
    const t = this._mapTransform;
    if (!t || !(t.scale > 0)) return null;
    return {
      pos: {
        x: t.playerX - (sx - t.cx) / t.scale,
        z: t.playerZ - (sy - t.cy) / t.scale,
      },
      label: 'Map fix',
      kind: 'local',
      arrivalRadius: 36,
    };
  },

  _drawScanOverlays(g, state, wx, wz, roles) {
    const ink = roles || canvasRoles();
    const now = state.simTime || 0;
    for (const e of state.entityList || []) {
      if (!e || !e.alive || e.type !== 'asteroid' || !e.pos) continue;
      const data = e.data || {};
      if (!(data.scanHighlightUntil > now)) continue;
      const x = wx(e.pos.x), y = wz(e.pos.z);
      const glyph = data.scanOreGlyph || asteroidOreGlyph(data.typeId);
      g.save();
      g.strokeStyle = ink.goal;
      g.fillStyle = ink.goal;
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.stroke();
      g.font = canvasFont(700, 12, 'data');
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText(glyph, x, y - 6);
      g.restore();
    }

    const sectorId = state.world && state.world.currentSectorId;
    const pings = sectorId && state.world.scanPings && state.world.scanPings[sectorId];
    if (!Array.isArray(pings) || !pings.length) return;
    for (const ping of pings) {
      if (!ping || !ping.pos) continue;
      const x = wx(ping.pos.x), y = wz(ping.pos.z);
      g.save();
      g.strokeStyle = ink.goal;
      g.fillStyle = ink.goal;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x, y - 7); g.lineTo(x + 7, y); g.lineTo(x, y + 7); g.lineTo(x - 7, y); g.closePath();
      g.stroke();
      g.font = canvasFont(700, 12, 'data');
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', x, y + 0.5);
      g.restore();
    }
  },

  _renderObjectivePanel(state, player) {
    const panel = this._objectivePanel;
    if (!panel) return;
    const trackedId = state.ui && state.ui.trackedMissionId;
    const active = (state.missions && state.missions.active) || [];
    const tracked = trackedId ? active.find((m) => m.id === trackedId && m.status === 'active') : null;
    const wp = state.nav && state.nav.waypoint;
    const beat = state.story && STORY_BEATS[state.story.beatIndex];
    const route = routeGuidance(state, wp);

    let kicker = 'Story';
    let title = beat ? `Beat ${beat.beat} / 7` : 'Objective';
    let body = beat ? beat.objective : 'Open Mission Log (' + BINDINGS.missionLog.label + ') for available contracts.';
    const meta = [];

    if (tracked) {
      kicker = 'Tracked Mission';
      title = tracked.title || 'Mission';
      body = (wp && wp.reason) || missionProgressText(tracked);
      if (route) body = appendSentence(body, route.next);
      const remaining = Math.max(0, (tracked.deadline_s || 0) - (state.simTime || 0));
      meta.push({ text: fmtClock(remaining), hot: remaining < 120 });
      if (wp && wp.sectorName) meta.push({ text: wp.sectorName, hot: !wp.pos });
    } else if (wp) {
      kicker = wp.onboarding ? 'Tutorial Objective' : wp.kind === 'story' ? 'Story Objective' : wp.kind === 'trade' ? 'Course' : 'Waypoint';
      title = wp.label || wp.reason || 'Waypoint';
      body = wp.reason || (wp.onboarding ? 'Follow the yellow signal' : wp.sectorName) || 'Set course';
      if (route) body = appendSentence(body, route.next);
      if (wp.sectorName) meta.push({ text: wp.sectorName, hot: !wp.pos });
    } else if (beat) {
      meta.push({ text: `${BINDINGS.localmap.label} Local Map`, hot: true });
    }

    if (wp && wp.pos && player && player.pos) {
      const d = Math.hypot(wp.pos.x - player.pos.x, wp.pos.z - player.pos.z);
      meta.push({ text: Math.round(d) + ' u', hot: false });
    } else if (wp && !wp.pos) {
      const targetSectorId = wp.sectorId || null;
      const currentSectorId = state.world && state.world.currentSectorId || null;
      const fixLabel = targetSectorId && currentSectorId && targetSectorId === currentSectorId
        ? 'Sector fix'
        : 'Off-sector fix';
      meta.push({ text: fixLabel, hot: true });
    }
    if (route) {
      meta.push({ text: route.summary, hot: true });
      meta.push({ text: `${BINDINGS.starmap.label} Star Map`, hot: true });
    }

    const readable = [kicker, title, body, ...meta.map((m) => m.text)].filter(Boolean).join(' ');
    const html =
      '<div class="lm-objective-k">' + esc(kicker) + '</div>\n' +
      '<div class="lm-objective-title">' + esc(title) + '</div>\n' +
      '<div class="lm-objective-body">' + esc(body) + '</div>' +
      (meta.length ? '\n<div class="lm-objective-meta">' + meta.map((m) => '<span' + (m.hot ? ' class="hot"' : '') + '>' + esc(m.text) + '</span>').join(' ') + '</div>' : '');
    const sig = readable + '\n' + html;
    if (sig === this._objectiveSig) return;
    this._objectiveSig = sig;
    panel.hidden = false;
    if (panel.getAttribute('aria-label') !== readable) panel.setAttribute('aria-label', readable);
    panel.innerHTML = html;
  },
};

function missionProgressText(m) {
  const progress = Math.max(0, m.objectiveProgress || 0);
  const target = Math.max(1, m.objectiveTarget || 1);
  if (m.type === 'mining_quota') return `Mine ${progress}/${target} units`;
  if (m.type === 'bulk_trade') return `Sell ${progress}/${target} units`;
  if (m.type === 'patrol_clear') return `Clear ${progress}/${target} hostiles`;
  if (m.type === 'recon_scan') return `Scan ${progress}/${target} sites`;
  return progress > 0 ? `${progress}/${target}` : 'Proceed to the objective';
}

function fmtClock(value) {
  const s = Math.max(0, Math.floor(value || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  if (m >= 1) return m + 'm ' + sec + 's';
  return sec + 's';
}

function routeGuidance(state, wp) {
  if (!state) return null;
  const route = state.nav && state.nav.route;
  const legs = route && Array.isArray(route.legs) ? route.legs : [];
  const first = legs[0];
  const last = legs[legs.length - 1];
  const currentSectorId = (state.world && state.world.currentSectorId) || state.currentSectorId || (first && first.from);
  const targetSectorId = (wp && wp.sectorId) || (route && route.destinationSectorId) || (last && last.to);
  if (!targetSectorId) return null;
  if (currentSectorId && currentSectorId === targetSectorId) return null;
  if (first && last && (!currentSectorId || first.from === currentSectorId) && last.to === targetSectorId) {
    const hops = route.totalHops || legs.length;
    const fuel = Math.round(route.totalFuel || legs.reduce((sum, leg) => sum + (leg.fuel || 0), 0));
    return {
      next: 'Next jump: ' + sectorName(first.to),
      summary: hops + ' hop' + (hops === 1 ? '' : 's') + ' / ' + fuel + 'F',
    };
  }
  return {
    next: 'Plot route to ' + sectorName(targetSectorId),
    summary: 'Route needed',
  };
}

function sectorName(id) {
  return SECTOR_NAME.get(id) || id || 'target sector';
}

function asteroidOreGlyph(typeId) {
  switch (typeId) {
    case 'ast_metallic': return 'Fe';
    case 'ast_icy': return 'H2O';
    case 'ast_crystalline': return 'Cr';
    case 'ast_gas_cloud': return 'Gas';
    case 'ast_rare_exotic': return 'Xe';
    case 'ast_common_rock':
    default:
      return 'Si';
  }
}

function stationPositionForRoute(state, stationId) {
  if (!state || !stationId) return null;
  const byStationId = state.entityIndex && state.entityIndex.byStationId;
  const indexed = byStationId && byStationId.get && byStationId.get(stationId);
  if (indexed && indexed.alive !== false && indexed.pos) return indexed.pos;
  for (const entity of state.entityList || []) {
    if (!entity || entity.alive === false || entity.type !== 'station' || !entity.pos) continue;
    const data = entity.data || {};
    if (data.stationId === stationId) return entity.pos;
  }
  return null;
}

function stationNameForRoute(state, stationId) {
  if (!state || !stationId) return stationId || 'Station';
  const byStationId = state.entityIndex && state.entityIndex.byStationId;
  const indexed = byStationId && byStationId.get && byStationId.get(stationId);
  if (indexed && indexed.data && (indexed.data.name || indexed.data.stationName)) {
    return indexed.data.name || indexed.data.stationName;
  }
  for (const entity of state.entityList || []) {
    if (!entity || entity.type !== 'station') continue;
    const data = entity.data || {};
    if (data.stationId === stationId) return data.name || data.stationName || stationId;
  }
  for (const sector of Object.values(state.world && state.world.sectors || {})) {
    for (const station of sector.stations || []) {
      if (station && station.id === stationId) return station.name || stationId;
    }
  }
  return stationId;
}

function stationSectorIdForRoute(state, stationId) {
  if (!state || !stationId) return null;
  const sectors = Object.values((state.world && state.world.sectors) || {});
  for (const sector of sectors) {
    for (const station of sector.stations || []) {
      if (station && station.id === stationId) return sector.id || null;
    }
  }
  return null;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function buildStationRiskEstimator(state) {
  const sectorByStation = new Map();
  const sectors = Object.values((state && state.world && state.world.sectors) || {});
  for (const sector of sectors) {
    for (const station of (sector && sector.stations) || []) {
      if (!station || !station.id) continue;
      sectorByStation.set(station.id, sector.id || null);
    }
  }
  const byPair = new Map();
  return (originStationId, destinationStationId) => {
    const originSectorId = sectorByStation.get(originStationId) || stationSectorIdForRoute(state, originStationId);
    const destinationSectorId = sectorByStation.get(destinationStationId) || stationSectorIdForRoute(state, destinationStationId);
    if (!originSectorId || !destinationSectorId) return 0.18;
    const key = originSectorId < destinationSectorId
      ? `${originSectorId}|${destinationSectorId}`
      : `${destinationSectorId}|${originSectorId}`;
    if (byPair.has(key)) return byPair.get(key);
    const originSignal = sectorSignalFor(state, originSectorId);
    const destinationSignal = sectorSignalFor(state, destinationSectorId);
    const originDanger = clamp01(originSignal && originSignal.danger);
    const destinationDanger = clamp01(destinationSignal && destinationSignal.danger);
    const originTier = Math.max(0, Number(effectiveDangerTierFor(state, originSectorId)) || 0);
    const destinationTier = Math.max(0, Number(effectiveDangerTierFor(state, destinationSectorId)) || 0);
    const tierRisk = clamp01(Math.max(originTier, destinationTier) / 4);
    const risk = clamp01(((originDanger + destinationDanger) * 0.5 * 0.74) + (tierRisk * 0.26));
    byPair.set(key, risk);
    return risk;
  };
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function formatCredits(value) {
  return Math.round(Math.max(0, Number(value) || 0)).toLocaleString();
}

function tradeRouteActionLabel(route) {
  const originName = route.originName || 'origin station';
  const destinationName = route.destinationName || 'buyer station';
  const commodityName = route.commodityName || 'cargo';
  const units = Math.max(0, Math.floor(Number(route.units) || 0));
  const load = units > 0
    ? 'buy ' + units + 'u ' + commodityName + ' at ' + originName + ' first'
    : 'load ' + commodityName + ' at ' + originName + ' first';
  const reliability = Math.max(0, Math.min(1, Number(route.reliability) || 0));
  const parts = [
    'Set sell course to ' + destinationName,
    load,
    'projected profit +' + (route.expectedProfit || '0') + ' cr',
    Math.max(0, Math.round(Number(route.fuel) || 0)) + 'F estimated',
  ];
  if (route.stale) parts.push('stale intel ' + Math.round(reliability * 100) + '% reliable');
  return parts.join('; ');
}

function appendSentence(base, sentence) {
  const head = String(base || '').trim();
  const tail = String(sentence || '').trim();
  if (!head) return tail;
  if (!tail) return head;
  return /[.!?]$/.test(head) ? head + ' ' + tail + '.' : head + '. ' + tail + '.';
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
