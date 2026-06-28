// Local system map screen (spec §11.1 / INTEGRATION_MAP §7.2).
//
// The third navigation scale, distinct from:
//   • tactical radar (radar.js) — near-field combat contacts in the HUD corner;
//   • galaxy star map (starmap.js) — inter-system topology, the strategic M-key view.
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

// Friendly commodity/station names for the route panel (single source: the data catalogs).
const COMM_NAME = new Map(COMMODITIES.map((c) => [c.id, c.name]));
const SECTOR_NAME = new Map(SECTORS.map((s) => [s.id, s.name]));
const EMPTY_ROUTES = Object.freeze([]);
const EMPTY_GEOMETRY = Object.freeze([]);

const LOCALMAP_STYLE = `
#sf-localmap { position:absolute; inset:0; display:flex; flex-direction:column; background:rgba(6,12,22,.97); color:var(--ink,#cfe3ff); }
#sf-localmap .lm-head { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-bottom:1px solid var(--panel-edge,#1d3350); }
#sf-localmap .lm-title { font-size:.95rem; letter-spacing:.08em; text-transform:uppercase; }
#sf-localmap .lm-scale { font-size:.7rem; color:var(--ink-dim,#7e93b3); letter-spacing:.1em; }
#sf-localmap .lm-close { background:none; border:1px solid var(--panel-edge,#1d3350); color:inherit; padding:4px 12px; border-radius:5px; cursor:pointer; font-size:.78rem; }
#sf-localmap .lm-close:hover { border-color:var(--accent,#39d0ff); }
#sf-localmap .lm-body { flex:1; position:relative; min-height:0; }
#sf-localmap canvas { position:absolute; inset:0; width:100%; height:100%; display:block; cursor:crosshair; }
#sf-localmap .lm-legend { position:absolute; left:12px; bottom:12px; font-size:.64rem; color:var(--ink-mute,#5e7393); background:rgba(6,12,22,.7); border:1px solid var(--panel-edge,#1d3350); border-radius:5px; padding:5px 9px; line-height:1.5; }
#sf-localmap .lm-routes { position:absolute; right:12px; top:12px; width:230px; max-height:60%; overflow-y:auto; background:rgba(6,12,22,.82); border:1px solid var(--panel-edge,#1d3350); border-radius:6px; padding:8px 10px; font-size:.66rem; color:var(--ink,#cfe3ff); }
#sf-localmap .lm-routes h4 { margin:0 0 6px 0; font-size:.62rem; letter-spacing:.08em; text-transform:uppercase; color:var(--accent,#39d0ff); }
#sf-localmap .lm-route { display:block; width:100%; text-align:left; background:transparent; color:inherit; border:0; border-bottom:1px solid rgba(29,51,80,.5); padding:5px 2px; line-height:1.4; cursor:pointer; }
#sf-localmap .lm-route:last-child { border-bottom:none; }
#sf-localmap .lm-route:hover, #sf-localmap .lm-route:focus-visible { outline:0; background:rgba(57,208,255,.08); color:#fff; }
#sf-localmap .lm-route .lm-route-hdr { display:flex; justify-content:space-between; gap:6px; }
#sf-localmap .lm-route .lm-route-comm { color:var(--ink-dim,#7e93b3); }
#sf-localmap .lm-route .lm-route-profit { color:#ffd66b; font-weight:600; }
#sf-localmap .lm-route .lm-route-meta { display:flex; flex-wrap:wrap; gap:8px; margin-top:2px; color:var(--ink-dim,#7e93b3); font-size:.58rem; }
#sf-localmap .lm-route .lm-route-action { margin-top:2px; color:#7af7d0; font-size:.58rem; letter-spacing:.08em; text-transform:uppercase; }
#sf-localmap .lm-route .lm-route-stale { color:#ff8a8a; font-size:.58rem; }
#sf-localmap .lm-routes-empty { color:var(--ink-mute,#5e7393); font-style:italic; }
#sf-localmap .lm-objective { position:absolute; left:12px; top:12px; width:min(340px,calc(100% - 270px)); min-width:230px; background:rgba(6,12,22,.84); border:1px solid rgba(255,210,74,.38); border-radius:6px; padding:9px 11px; font-size:.68rem; color:var(--ink,#cfe3ff); box-shadow:0 0 18px rgba(255,210,74,.10); }
#sf-localmap .lm-objective[hidden] { display:none; }
#sf-localmap .lm-objective-k { color:#ffd24a; font-family:var(--mono,monospace); font-size:.58rem; letter-spacing:.12em; text-transform:uppercase; }
#sf-localmap .lm-objective-title { margin-top:4px; font-size:.78rem; font-weight:700; color:#fff; line-height:1.25; }
#sf-localmap .lm-objective-body { margin-top:4px; color:var(--ink-dim,#9bb1d0); line-height:1.45; }
#sf-localmap .lm-objective-meta { display:flex; gap:10px; flex-wrap:wrap; margin-top:7px; color:var(--ink-mute,#5e7393); font-family:var(--mono,monospace); }
#sf-localmap .lm-objective-meta .hot { color:#ffd24a; }
@media (max-width: 760px) {
  #sf-localmap .lm-objective { left:10px; right:10px; top:58px; width:auto; max-width:none; min-width:0; }
  #sf-localmap .lm-routes { right:10px; left:10px; top:auto; bottom:54px; width:auto; max-height:25%; }
  #sf-localmap .lm-legend { left:10px; right:10px; bottom:10px; }
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
      '<div class="lm-head">' +
        '<div><div class="lm-title">Local System Map</div>' +
        `<div class="lm-scale">SYSTEM SCALE · remembered contacts age + fade · press ${localMapKey} or Esc to close</div></div>` +
        `<button class="lm-close" type="button">Close (${localMapKey})</button>` +
      '</div>' +
      '<div class="lm-body"><canvas></canvas>' +
      '<div class="lm-objective" id="sf-localmap-objective" hidden></div>' +
      '<div class="lm-legend">' +
        '◆ station &nbsp; ◇ gate &nbsp; ▲ ship &nbsp; ● asteroid<br>' +
        'bright = fresh &nbsp;·&nbsp; faint = stale/uncertain<br>' +
        `tactical radar = near-field &nbsp;·&nbsp; ${localMapKey} map = this system &nbsp;·&nbsp; ${starMapKey} map = galaxy` +
      '</div>' +
      '<div class="lm-routes" id="sf-localmap-routes"><h4>Trade Routes</h4><div class="lm-routes-empty">Scan markets at stations to rank routes</div></div>' +
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
    return this;
  },

  onShow() {
    this._visible = true;
    cancelAnimationFrame(this._animFrame);
    this._resize(); // size the canvas synchronously so the first draw isn't on a 0x0 surface
    const loop = () => {
      if (!this._visible) return;
      const now = performance.now();
      if (now - this._lastFrameAt >= 100) {
        this._lastFrameAt = now;
        this._resize(); // keep DPI/size fresh while open
        this._refreshIntel();
        this._draw();
      }
      this._animFrame = requestAnimationFrame(loop);
    };
    this._lastFrameAt = 0;
    loop();
  },

  onHide() {
    this._visible = false;
    cancelAnimationFrame(this._animFrame);
  },

  onKey(event, ctx) {
    const key = event && typeof event.key === 'string' ? event.key.toLowerCase() : '';
    if (key === BINDINGS.localmap.key) {
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
          factionId: e.factionId, hostile: !!(e.team !== playerTeam && e.team !== 0),
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
      this._routes = rankTradeRoutes({ beacons, cargoCapacity: cargo, travelEstimator, riskEstimator: () => 0, nowS: now }) || [];
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
      html = '<h4>Trade Routes <span style="float:right;color:var(--ink-mute,#5e7393)">profit/min</span></h4>';
      for (const r of routes) {
        const stale = (r.reliability || 1) < 0.5;
        const originName = stationName(r.originId);
        const destinationName = stationName(r.destinationId);
        const commodityName = commName(r.commodityId);
        const expectedProfit = formatCredits(r.expectedProfit);
        const units = Math.max(0, Math.floor(Number(r.units) || 0));
        const fuel = Math.round(Number(r.fuel) || 0);
        html += '<button class="lm-route" type="button" data-act="route-nav" data-destination="' + escapeAttr(r.destinationId) + '" data-commodity="' + escapeAttr(r.commodityId) + '"' +
          ' aria-label="Set course to ' + escapeAttr(destinationName) + ' to sell ' + escapeAttr(commodityName) + '">' +
          '<div class="lm-route-hdr">' +
            '<span class="lm-route-comm">' + escapeHtml(commodityName) + '</span>' +
            '<span class="lm-route-profit">' + Math.round(r.profitPerMinute) + '/m</span>' +
          '</div>' +
          '<div style="color:var(--ink-mute,#5e7393)">' + escapeHtml(originName) + ' → ' + escapeHtml(destinationName) + '</div>' +
          '<div class="lm-route-meta"><span>' + units + 'u load</span> <span>+' + expectedProfit + ' cr</span> <span>' + fuel + 'F est</span></div>' +
          '<div class="lm-route-action">Set course</div>' +
          (stale ? '<div class="lm-route-stale">stale intel (' + Math.round((r.reliability || 0) * 100) + '% reliable)</div>' : '') +
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
    const scale = (Math.min(w, h) * 0.42) / span;
    const wx = (x) => C.x - (x - player.pos.x) * scale;
    const wz = (z) => C.y - (z - player.pos.z) * scale;

    g.clearRect(0, 0, w, h);
    // Subtle grid backdrop so the map reads as a distinct navigation surface (and guarantees the
    // canvas is non-empty for render verification).
    g.fillStyle = 'rgba(10,20,36,0.6)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(57,208,255,0.05)'; g.lineWidth = 1;
    const grid = 48;
    for (let gx = (C.x % grid); gx < w; gx += grid) { g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx, h); g.stroke(); }
    for (let gy = (C.y % grid); gy < h; gy += grid) { g.beginPath(); g.moveTo(0, gy); g.lineTo(w, gy); g.stroke(); }
    // Range rings (system scale).
    g.strokeStyle = 'rgba(57,208,255,0.10)'; g.lineWidth = 1; g.setLineDash([3, 5]);
    for (const r of [0.25, 0.5, 1.0]) { g.beginPath(); g.arc(C.x, C.y, Math.min(w, h) * 0.42 * r, 0, Math.PI * 2); g.stroke(); }
    g.setLineDash([]);
    g.fillStyle = 'rgba(57,208,255,0.25)'; g.font = '8px monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
    for (const r of [0.25, 0.5, 1.0]) g.fillText(Math.round(span * r) + 'u', C.x + Math.min(w, h) * 0.42 * r + 3, C.y - 6);

    // Static landmarks (stations/gates) — persistent, high confidence.
    for (const lm of map.landmarks || []) {
      const x = wx(lm.position.x), y = wz(lm.position.z);
      const isGate = lm.kind === 'gate';
      g.save();
      g.fillStyle = isGate ? '#b99cff' : '#7af7d0';
      g.strokeStyle = isGate ? '#b99cff' : '#7af7d0';
      g.shadowColor = isGate ? '#b99cff' : '#7af7d0'; g.shadowBlur = 8;
      if (isGate) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.stroke(); }
      else { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(207,227,255,0.85)'; g.font = '9px monospace'; g.textAlign = 'left';
      g.fillText(lm.name || lm.id, x + 8, y);
      g.restore();
    }

    // Contacts — ships/asteroids with confidence + age. Bright = fresh, faint = stale.
    for (const c of map.contacts || []) {
      if (c.kind === 'station') continue; // drawn as landmark
      const x = wx(c.position.x), y = wz(c.position.z);
      const conf = Math.max(0, Math.min(1, c.confidence || 0));
      if (conf < 0.05) continue;
      const stale = c.lastSeenS != null && (m.timeS - c.lastSeenS) > 6;
      if (c.kind === 'asteroid') {
        g.globalAlpha = 0.3 + conf * 0.7;
        g.fillStyle = '#6e7b8c'; g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
      } else {
        g.save();
        g.globalAlpha = 0.3 + conf * 0.7;
        const col = c.hostile ? '#ff5470' : (c.factionId ? '#4DA8FF' : '#9aa8bc');
        g.fillStyle = col; g.strokeStyle = col;
        g.shadowColor = col; g.shadowBlur = stale ? 0 : 6;
        const ang = c.heading || 0;
        g.translate(x, y); g.rotate(Math.PI + ang);
        g.beginPath(); g.moveTo(4, 0); g.lineTo(-3, -2.6); g.lineTo(-3, 2.6); g.closePath(); g.fill();
        g.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
        g.restore();
      }
    }
    g.globalAlpha = 1;

    // Active waypoint / mission geometry. This uses the same state.nav.waypoint source as the HUD,
    // so the map remains a recovery surface when the tactical radar no longer has nearby dots.
    for (const item of map.missionGeometry || []) {
      const pnt = item.position;
      if (!pnt) continue;
      const x = wx(pnt.x), y = wz(pnt.z);
      g.save();
      g.strokeStyle = '#ffd24a';
      g.fillStyle = '#ffd24a';
      g.shadowColor = '#ffd24a';
      g.shadowBlur = 14;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y - 8); g.lineTo(x + 8, y); g.lineTo(x, y + 8); g.lineTo(x - 8, y); g.closePath();
      g.stroke();
      g.shadowBlur = 0;
      g.globalAlpha = 0.18;
      g.beginPath(); g.arc(x, y, 24, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.72;
      g.setLineDash([6, 5]);
      g.beginPath(); g.moveTo(C.x, C.y); g.lineTo(x, y); g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      g.font = '10px monospace';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(item.label || item.reason || 'Objective', x + 12, y);
      g.restore();
    }

    // Player at center (heading marker).
    g.save();
    g.fillStyle = '#39d0ff'; g.strokeStyle = '#39d0ff'; g.lineWidth = 1.4;
    g.shadowColor = '#39d0ff'; g.shadowBlur = 10;
    g.translate(C.x, C.y); g.rotate(Math.PI + (player.rot || 0));
    g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -4.5); g.lineTo(-5, 4.5); g.closePath(); g.fill();
    g.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    g.restore();

    // Velocity vector — shows momentum direction, the piloting-instrument purpose of this map.
    const sp = Math.hypot(player.vel.x, player.vel.z);
    if (sp > 1) {
      const vx = wx(player.pos.x + player.vel.x * 1.5), vz = wz(player.pos.z + player.vel.z * 1.5);
      g.strokeStyle = 'rgba(255,227,107,0.8)'; g.lineWidth = 1.3; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(C.x, C.y); g.lineTo(vx, vz); g.stroke(); g.setLineDash([]);
    }
  },

  _missionGeometry(state) {
    const wp = state.nav && state.nav.waypoint;
    if (!wp || !wp.pos) return EMPTY_GEOMETRY;
    const item = this._missionGeometryScratch[0];
    item.id = wp.missionId || wp.targetEntityId || wp.stationId || 'nav-waypoint';
    item.kind = wp.kind || 'waypoint';
    item.label = wp.reason || wp.label || 'Objective';
    item.position.x = wp.pos.x;
    item.position.z = wp.pos.z;
    item.metadata.missionId = wp.missionId || null;
    item.metadata.sectorId = wp.sectorId || null;
    item.metadata.sectorName = wp.sectorName || null;
    return this._missionGeometryScratch;
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
    let body = beat ? beat.objective : 'Open the mission log for available contracts.';
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
