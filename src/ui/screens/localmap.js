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
// Opened with L (see uiRoot key binding). Canvas is DPI-scaled like the radar. Purely read-only
// over sim state: it never writes movement/combat state (§0.6).
import { LocalSpaceIntel, rankTradeRoutes } from '../navigation/localSpaceMapModel.js';
import { COMMODITIES } from '../../data/commodities.js';

// Friendly commodity/station names for the route panel (single source: the data catalogs).
const COMM_NAME = new Map(COMMODITIES.map((c) => [c.id, c.name]));

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
#sf-localmap .lm-route { padding:4px 0; border-bottom:1px solid rgba(29,51,80,.5); line-height:1.4; }
#sf-localmap .lm-route:last-child { border-bottom:none; }
#sf-localmap .lm-route .lm-route-hdr { display:flex; justify-content:space-between; gap:6px; }
#sf-localmap .lm-route .lm-route-comm { color:var(--ink-dim,#7e93b3); }
#sf-localmap .lm-route .lm-route-profit { color:#ffd66b; font-weight:600; }
#sf-localmap .lm-route .lm-route-stale { color:#ff8a8a; font-size:.58rem; }
#sf-localmap .lm-routes-empty { color:var(--ink-mute,#5e7393); font-style:italic; }
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
  _canvas: null,
  _g: null,
  _ro: null,
  _visible: false,
  _animFrame: null,
  _dpr: 1,
  _zoom: 1,
  _pan: { x: 0, y: 0 },

  mount(rootEl, ctx) {
    injectStyle();
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.id = 'sf-localmap';
    rootEl.innerHTML =
      '<div class="lm-head">' +
        '<div><div class="lm-title">Local System Map</div>' +
        '<div class="lm-scale">SYSTEM SCALE · remembered contacts age + fade · press N or Esc to close</div></div>' +
        '<button class="lm-close" type="button">Close (N)</button>' +
      '</div>' +
      '<div class="lm-body"><canvas></canvas>' +
      '<div class="lm-legend">' +
        '◆ station &nbsp; ◇ gate &nbsp; ▲ ship &nbsp; ● asteroid<br>' +
        'bright = fresh &nbsp;·&nbsp; faint = stale/uncertain<br>' +
        'tactical radar = near-field &nbsp;·&nbsp; N map = this system &nbsp;·&nbsp; M map = galaxy' +
      '</div>' +
      '<div class="lm-routes" id="sf-localmap-routes"><h4>Trade Routes</h4><div class="lm-routes-empty">Scan markets at stations to rank routes</div></div>' +
      '</div>';
    this._canvas = rootEl.querySelector('canvas');
    this._g = this._canvas.getContext('2d');
    rootEl.querySelector('.lm-close').addEventListener('click', () => this._close());
    // Auto-fit the canvas to its container (DPI-scaled).
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(rootEl.querySelector('.lm-body'));
    this._resize();
    return this;
  },

  onShow() {
    this._visible = true;
    cancelAnimationFrame(this._animFrame);
    this._resize(); // size the canvas synchronously so the first draw isn't on a 0x0 surface
    const loop = () => {
      if (!this._visible) return;
      this._resize(); // keep DPI/size fresh while open
      this._refreshIntel();
      this._draw();
      this._animFrame = requestAnimationFrame(loop);
    };
    loop();
  },

  onHide() {
    this._visible = false;
    cancelAnimationFrame(this._animFrame);
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
    if (!economy || !economy.marketIntel) { this._routes = []; this._renderRoutes(); return; }
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
    const cargo = (player && player.data && player.data.cargoCap) || 40;
    // Travel estimate: straight-line distance between stations, at the player's cruise speed.
    const stationPos = (id) => { const s = state.entities.get(id); return s && s.pos; };
    const travelEstimator = (a, b) => {
      const pa = stationPos(a), pb = stationPos(b);
      const dist = (pa && pb) ? Math.hypot(pa.x - pb.x, pa.z - pb.z) : 1000;
      const speed = (player && player.maxSpeed) || 200;
      return { timeS: dist / Math.max(50, speed), fuel: dist * 0.01 };
    };
    try {
      this._routes = rankTradeRoutes({ beacons, cargoCapacity: cargo, travelEstimator, riskEstimator: () => 0, nowS: now }) || [];
    } catch (_) { this._routes = []; }
    this._renderRoutes();
  },

  _renderRoutes() {
    const panel = this._root && this._root.querySelector('#sf-localmap-routes');
    if (!panel) return;
    const routes = (this._routes || []).slice(0, 5); // top 5 by profit/min
    if (!routes.length) {
      panel.innerHTML = '<h4>Trade Routes</h4><div class="lm-routes-empty">Scan markets at stations to rank routes</div>';
      return;
    }
    const commName = (cid) => COMM_NAME.get(cid) || cid;
    const stationName = (id) => { const e = this._ctx.state.entities.get(id); return (e && e.data && e.data.name) || id; };
    let html = '<h4>Trade Routes <span style="float:right;color:var(--ink-mute,#5e7393)">profit/min</span></h4>';
    for (const r of routes) {
      const stale = (r.reliability || 1) < 0.5;
      html += '<div class="lm-route">' +
        '<div class="lm-route-hdr">' +
          '<span class="lm-route-comm">' + commName(r.commodityId) + '</span>' +
          '<span class="lm-route-profit">' + Math.round(r.profitPerMinute) + '/m</span>' +
        '</div>' +
        '<div style="color:var(--ink-mute,#5e7393)">' + stationName(r.originId) + ' → ' + stationName(r.destinationId) + '</div>' +
        (stale ? '<div class="lm-route-stale">stale intel (' + Math.round((r.reliability || 0) * 100) + '% reliable)</div>' : '') +
      '</div>';
    }
    panel.innerHTML = html;
  },

  _close() {
    const sm = this._ctx && this._ctx.screenManager;
    if (sm && typeof sm.popScreen === 'function') sm.popScreen();
  },

  _resize() {
    const wrap = this._root.querySelector('.lm-body');
    if (!wrap || !this._canvas) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    this._dpr = Math.min(2, window.devicePixelRatio || 1);
    this._canvas.width = Math.max(2, Math.floor(w * this._dpr));
    this._canvas.height = Math.max(2, Math.floor(h * this._dpr));
    this._g.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
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
    const map = m.buildLocalMap({
      player: { id: player.id, pos: player.pos, vel: player.vel, rot: player.rot },
      mode: 'system',
    });

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
      g.save();
      g.globalAlpha = 0.3 + conf * 0.7;
      if (c.kind === 'asteroid') {
        g.fillStyle = '#6e7b8c'; g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill();
      } else {
        const col = c.hostile ? '#ff5470' : (c.factionId ? '#4DA8FF' : '#9aa8bc');
        g.fillStyle = col; g.strokeStyle = col;
        g.shadowColor = col; g.shadowBlur = stale ? 0 : 6;
        const ang = c.heading || 0;
        g.translate(x, y); g.rotate(Math.PI + ang);
        g.beginPath(); g.moveTo(4, 0); g.lineTo(-3, -2.6); g.lineTo(-3, 2.6); g.closePath(); g.fill();
        g.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      }
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
};
