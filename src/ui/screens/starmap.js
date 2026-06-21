// Star-map navigation + live sector-field intelligence.
//
// This screen is a read-only projection of sectorSim's public signal contract. It does not infer
// danger/economy/influence from private save fields, and it does not own simulation math. The same
// transit forecast shown here is the function used by sectorSim on jump arrival.
import { SECTORS, dangerTier } from '../../data/sectors.js';
import { FACTION_META } from '../../data/factions.js';
import {
  effectiveSectorFor,
  sectorSignalFor,
  forecastTransitFor,
} from '../../systems/sectorSim.js';

const FACTION_COLOR = Object.create(null);
const FACTION_NAME = Object.create(null);
for (const f of FACTION_META) {
  FACTION_COLOR[f.id] = f.color || '#9aa8bc';
  FACTION_NAME[f.id] = f.short || f.name || f.id;
}

const HAZARD_LABEL = Object.freeze({
  dense_asteroid: 'Asteroids', nebula: 'Nebula', radiation: 'Radiation', debris: 'Debris',
});
const DRIVER_LABEL = Object.freeze({
  structural_baseline: 'structural equilibrium',
  graph_flow: 'neighboring-lane diffusion',
  concord_patrols: 'Concord patrol suppression',
  reach_pressure: 'Reach predation pressure',
  vael_frontier: 'Vael frontier closure',
  contested_space: 'contested-space heating',
  market_balance: 'market mean reversion',
  meridian_transmission: 'Meridian trade transmission',
  route_scarcity: 'route scarcity',
  route_surplus: 'route surplus',
  territorial_anchor: 'territorial anchoring',
  contested_influence: 'contested influence',
  territorial_shift: 'territorial shift',
  trade_shock: 'player-created trade shock',
  combat_suppression: 'hostile-force attrition',
  combat_disruption: 'lawful-force disruption',
  combat_attrition: 'combat attrition',
  infrastructure_disruption: 'infrastructure loss',
  interdiction_wave: 'interdiction activity',
  transit_incident: 'transit incident',
  territory_flip: 'resolved territory flip',
});

const STYLE_ID = 'sf-starmap-style';
const CSS = `
#sf-starmap { width:min(94vw,1120px); height:min(90vh,760px); display:flex; flex-direction:column;
  background:linear-gradient(180deg,var(--panel-2),var(--panel)); border:1px solid var(--panel-edge);
  border-radius:10px; box-shadow:0 12px 48px rgba(0,0,0,.6); overflow:hidden; pointer-events:auto; }
#sf-starmap .sm-head { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:12px 18px;
  border-bottom:1px solid var(--panel-edge); background:rgba(8,14,26,.72); }
#sf-starmap .sm-title { font-size:1.2em; letter-spacing:.12em; text-transform:uppercase; color:var(--accent);
  text-shadow:0 0 12px rgba(57,208,255,.5); }
#sf-starmap .sm-stats { font-family:var(--mono); font-size:.8em; color:var(--ink-dim); display:flex; gap:16px; flex-wrap:wrap; }
#sf-starmap .sm-stats b { color:var(--ink); font-weight:600; }
#sf-starmap .sm-body { flex:1; display:flex; min-height:0; }
#sf-starmap .sm-canvas-wrap { flex:1; position:relative; min-width:0; }
#sf-starmap canvas { position:absolute; inset:0; width:100%; height:100%; cursor:crosshair; display:block; }
#sf-starmap .sm-side { width:316px; border-left:1px solid var(--panel-edge); background:rgba(6,11,21,.66);
  padding:14px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; }
#sf-starmap .sm-sel-name { font-size:1.08em; color:var(--ink); }
#sf-starmap .sm-sel-fac { font-family:var(--mono); font-size:.76em; margin-top:2px; }
#sf-starmap .sm-section { margin-top:8px; padding-top:8px; border-top:1px solid rgba(57,208,255,.12); }
#sf-starmap .sm-section-title { font-family:var(--mono); font-size:.68em; letter-spacing:.14em; text-transform:uppercase;
  color:var(--accent); margin-bottom:5px; }
#sf-starmap .sm-kv { display:flex; justify-content:space-between; gap:10px; font-family:var(--mono); font-size:.76em;
  color:var(--ink-dim); padding:2px 0; }
#sf-starmap .sm-kv b { color:var(--ink); font-weight:600; text-align:right; }
#sf-starmap .sm-driver { font-size:.72em; color:var(--ink-mute); line-height:1.35; margin:3px 0 6px; }
#sf-starmap .sm-hint { font-size:.76em; color:var(--ink-mute); line-height:1.45; }
#sf-starmap .sm-route { font-family:var(--mono); font-size:.78em; color:var(--accent-2); margin-top:7px; }
#sf-starmap .sm-route-leg { font-family:var(--mono); font-size:.72em; color:var(--ink-dim); padding:2px 0 2px 9px;
  border-left:2px solid rgba(57,208,255,.3); }
#sf-starmap .sm-route-leg b { color:var(--accent); font-weight:600; }
#sf-starmap .sm-route-total { font-family:var(--mono); font-size:.78em; color:var(--accent); padding:4px 0; font-weight:600; }
#sf-starmap .sm-bar { height:5px; border-radius:4px; background:rgba(120,145,175,.16); overflow:hidden; margin:3px 0 5px; }
#sf-starmap .sm-bar > i { display:block; height:100%; border-radius:inherit; background:currentColor; }
#sf-starmap .sm-influence-row { display:grid; grid-template-columns:1fr 42px; gap:8px; align-items:center;
  font-family:var(--mono); font-size:.7em; color:var(--ink-dim); margin:3px 0; }
#sf-starmap .sm-influence-row b { text-align:right; color:var(--ink); }
#sf-starmap .sm-risk { border:1px solid rgba(57,208,255,.15); border-radius:6px; padding:7px 8px; margin-top:5px;
  background:rgba(4,9,18,.45); }
#sf-starmap .sm-risk-head { display:flex; justify-content:space-between; font-family:var(--mono); font-size:.72em; }
#sf-starmap .sm-risk-note { font-size:.68em; color:var(--ink-mute); line-height:1.35; margin-top:3px; }
#sf-starmap .sm-actions { margin-top:auto; display:flex; flex-direction:column; gap:8px; padding-top:10px; }
#sf-starmap .sm-actions button { width:100%; padding:9px; }
#sf-starmap .sm-course { background:rgba(57,208,255,.12); border-color:var(--accent); color:#fff;
  text-shadow:0 0 8px rgba(57,208,255,.6); }
#sf-starmap .sm-foot { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 18px;
  border-top:1px solid var(--panel-edge); font-family:var(--mono); font-size:.69em; color:var(--ink-mute); }
#sf-starmap .sm-legend { display:flex; gap:11px; flex-wrap:wrap; }
#sf-starmap .sm-legend span { display:inline-flex; align-items:center; gap:4px; }
#sf-starmap .sm-dot { width:9px; height:9px; border-radius:50%; display:inline-block; }
@media (max-width:820px) {
  #sf-starmap .sm-side { width:270px; }
  #sf-starmap .sm-stats { gap:8px; }
}
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function pct(v) { return `${Math.round(clamp(Number(v) || 0, 0, 1) * 100)}%`; }
function signed(v, digits = 1) {
  const n = Number(v) || 0;
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;
}
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function factionName(id) { return FACTION_NAME[id] || (id ? id.replace(/^faction_/, '') : 'Unaffiliated'); }
function factionColor(id) { return FACTION_COLOR[id] || '#9aa8bc'; }
function dangerColor(v) {
  if (v < 0.28) return '#62e08a';
  if (v < 0.50) return '#ffd84a';
  if (v < 0.72) return '#ffb347';
  return '#ff5470';
}
function pressureColor(v) {
  if (v > 0.08) return '#ffb347';
  if (v < -0.08) return '#64ffda';
  return '#9aa8bc';
}
function pressureLabel(v) {
  const a = Math.abs(v);
  if (a < 0.06) return 'balanced';
  const strength = a > 0.45 ? 'severe' : a > 0.22 ? 'strong' : 'mild';
  return v > 0 ? `${strength} scarcity` : `${strength} surplus`;
}
function trendGlyph(v, eps = 0.002) { return v > eps ? '↑' : v < -eps ? '↓' : '→'; }
function trendColor(v, goodWhenPositive = false) {
  if (Math.abs(v) < 0.002) return '#9aa8bc';
  const positiveGood = goodWhenPositive ? v > 0 : v < 0;
  return positiveGood ? '#62e08a' : '#ffb347';
}
function driverLabel(id) { return DRIVER_LABEL[id] || String(id || '').replace(/_/g, ' '); }
function securityLabel(sec) { return sec >= 0.7 ? 'High' : sec >= 0.4 ? 'Mid' : sec >= 0.15 ? 'Low' : 'Null'; }
function enemyDensityLabel(d) { return d <= 0.15 ? 'Low' : d <= 0.35 ? 'Medium' : d <= 0.55 ? 'High' : 'Extreme'; }
function hashText(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function closeScreen(ctx) {
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  const mgr = (ctx && (ctx.screenManager || ctx.screens)) || (ui && (ui.screenManager || ui.manager));
  if (mgr && typeof mgr.popScreen === 'function') mgr.popScreen();
  else if (ctx && ctx.bus) ctx.bus.emit('ui:popScreen', {});
}

function drawHexPath(g, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i - Math.PI / 2;
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

function pointOnLine(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
function pointOnPolyline(points, t) {
  if (points.length < 2) return points[0] || { x: 0, y: 0 };
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(d); total += d;
  }
  if (total < 1e-6) return points[0];
  let target = clamp(t, 0, 1) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i] || i === lengths.length - 1) return pointOnLine(points[i], points[i + 1], lengths[i] ? target / lengths[i] : 0);
    target -= lengths[i];
  }
  return points[points.length - 1];
}

export const starmapScreen = {
  id: 'starmap',
  _ctx: null,
  _root: null,
  _canvas: null,
  _g: null,
  _els: null,
  _nodes: [],
  _selectedId: null,
  _hoverId: null,
  _hoverInfo: null,
  _mouseX: 0,
  _mouseY: 0,
  _dpr: 1,
  _ro: null,
  _cam: { cx: 0, cy: 0, zoom: 1 },
  _dragging: false,
  _dragStart: null,
  _didDrag: false,
  _visible: false,
  _animFrame: null,
  _lastDrawTime: 0,
  _drawSig: '',
  _sidebarSig: '',
  _layoutPad: 68,

  mount(rootEl, ctx) {
    injectStyle();
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.id = 'sf-starmap';
    rootEl.innerHTML = `
      <div class="sm-head">
        <div class="sm-title">Star Map · Live Grid</div>
        <div class="sm-stats">
          <div>FUEL <b data-fuel>--/--</b></div>
          <div>JUMP <b data-jstate>IDLE</b></div>
          <div>RANGE <b data-range>adjacent</b></div>
          <div>FIELD <b data-epoch>0.0d</b></div>
        </div>
      </div>
      <div class="sm-body">
        <div class="sm-canvas-wrap"><canvas></canvas></div>
        <div class="sm-side">
          <div data-sel><div class="sm-hint">Select a sector to inspect the live danger, market, and influence fields.</div></div>
          <div class="sm-actions" data-actions></div>
        </div>
      </div>
      <div class="sm-foot">
        <div class="sm-legend">
          <span><i class="sm-dot" style="background:#ff5470"></i>danger field</span>
          <span><i class="sm-dot" style="background:#ffb347"></i>scarcity</span>
          <span><i class="sm-dot" style="background:#64ffda"></i>surplus</span>
          <span><i class="sm-dot" style="background:#c08bff"></i>contested</span>
        </div>
        <div>M close · scroll zoom · drag pan · moving beads show commodity flow</div>
      </div>`;

    this._canvas = rootEl.querySelector('canvas');
    this._g = this._canvas.getContext('2d');
    this._els = {
      fuel: rootEl.querySelector('[data-fuel]'),
      jumpState: rootEl.querySelector('[data-jstate]'),
      range: rootEl.querySelector('[data-range]'),
      epoch: rootEl.querySelector('[data-epoch]'),
      selected: rootEl.querySelector('[data-sel]'),
      actions: rootEl.querySelector('[data-actions]'),
    };

    this._canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this._canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this._canvas.addEventListener('mouseup', () => this._onMouseUp());
    this._canvas.addEventListener('mouseleave', () => this._onMouseLeave());
    this._canvas.addEventListener('click', (e) => this._onCanvasClick(e));
    this._canvas.addEventListener('dblclick', (e) => this._onDblClick(e));
    this._canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this._els.actions.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-act]');
      if (button) this._onAction(button.dataset.act);
    });

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(rootEl.querySelector('.sm-canvas-wrap'));
    }
    if (!this._fieldListener && ctx.bus && ctx.bus.on) {
      this._fieldListener = () => { if (this._visible) this.refresh(this._ctx); };
      ctx.bus.on('sectorsim:fieldAdvanced', this._fieldListener);
      ctx.bus.on('sectorsim:transitOutcome', this._fieldListener);
    }
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    const state = this._ctx.state;
    this._selectedId = state.world && state.world.currentSectorId || null;
    this._hoverId = null;
    this._hoverInfo = null;
    const saved = state.ui && state.ui.starmapView;
    this._cam = saved ? { cx: saved.cx || 0, cy: saved.cy || 0, zoom: saved.zoom || 1 } : { cx: 0, cy: 0, zoom: 1 };
    this._visible = true;
    this._resize();
    this.refresh(this._ctx);
    this._startAnimLoop();
  },

  onHide() {
    this._visible = false;
    this._stopAnimLoop();
  },

  onKey(event, ctx) {
    if (event && (event.key === 'm' || event.key === 'M')) {
      closeScreen(ctx || this._ctx);
      return true;
    }
    return false;
  },

  refresh(ctx, opts = {}) {
    if (ctx) this._ctx = ctx;
    if (!this._root) return;
    this._syncHeader();
    const sideSig = this._sidebarSignature();
    if (!opts.periodic || sideSig !== this._sidebarSig) {
      this._sidebarSig = sideSig;
      this._syncSidebar();
    }
    const drawSig = this._drawSignature();
    if (!opts.periodic || drawSig !== this._drawSig) {
      this._drawSig = drawSig;
      this._draw();
    }
  },

  _sectors() {
    const content = this._ctx.state.content && this._ctx.state.content.sectors;
    return content && (Array.isArray(content) ? content.length : Object.keys(content).length)
      ? (Array.isArray(content) ? content : Object.values(content)) : SECTORS;
  },

  _sectorById(id) { return this._sectors().find((s) => s.id === id) || null; },
  _currentId() { return this._ctx.state.world && this._ctx.state.world.currentSectorId || null; },
  _discovery(id) { return this._ctx.state.world && this._ctx.state.world.discovery && this._ctx.state.world.discovery[id] || null; },
  _isDiscovered(id) { return id === this._currentId() || !!(this._discovery(id) && this._discovery(id).discovered); },
  _isNeighbor(a, b) {
    const sector = this._sectorById(a);
    return !!(sector && (sector.neighbors || []).includes(b));
  },
  _route() { const r = this._ctx.state.nav && this._ctx.state.nav.route; return r && r.legs ? r : null; },
  _signal(id) { return sectorSignalFor(this._ctx.state, id); },
  _effective(id) { return effectiveSectorFor(this._ctx.state, id) || this._sectorById(id); },

  _startAnimLoop() {
    if (this._animFrame) return;
    const tick = () => {
      if (!this._visible) { this._animFrame = null; return; }
      const now = Date.now();
      if (now - this._lastDrawTime >= 64) { this._lastDrawTime = now; this._draw(); }
      this._animFrame = requestAnimationFrame(tick);
    };
    this._animFrame = requestAnimationFrame(tick);
  },

  _stopAnimLoop() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._animFrame = null;
  },

  _resize() {
    if (!this._canvas || !this._root) return;
    const wrap = this._root.querySelector('.sm-canvas-wrap');
    const rect = wrap.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._canvas.width = Math.round(rect.width * this._dpr);
    this._canvas.height = Math.round(rect.height * this._dpr);
    this._draw();
  },

  _worldToScreen(x, y) {
    const w = this._canvas.width / this._dpr, h = this._canvas.height / this._dpr;
    return { x: (x - this._cam.cx) * this._cam.zoom + w / 2, y: (y - this._cam.cy) * this._cam.zoom + h / 2 };
  },

  _screenToWorld(x, y) {
    const w = this._canvas.width / this._dpr, h = this._canvas.height / this._dpr;
    return { x: (x - w / 2) / this._cam.zoom + this._cam.cx, y: (y - h / 2) / this._cam.zoom + this._cam.cy };
  },

  _layout() {
    const sectors = this._sectors();
    const w = this._canvas.width / this._dpr, h = this._canvas.height / this._dpr;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of sectors) {
      const p = s.position || { x: 0, y: 0 };
      minX = Math.min(minX, p.x || 0); maxX = Math.max(maxX, p.x || 0);
      minY = Math.min(minY, p.y || 0); maxY = Math.max(maxY, p.y || 0);
    }
    const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
    const scale = Math.min((w - this._layoutPad * 2) / spanX, (h - this._layoutPad * 2) / spanY);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    this._nodes = sectors.map((sector) => {
      const p = sector.position || { x: 0, y: 0 };
      return {
        sector,
        x: ((p.x || 0) - cx) * scale,
        y: ((p.y || 0) - cy) * scale,
        r: Math.min(10 + (sector.stations || []).length * 2, 20),
      };
    });
    return this._nodes;
  },

  _hitTest(mx, my) {
    const p = this._screenToWorld(mx, my);
    for (const n of this._nodes) {
      const r = n.r + 8 / this._cam.zoom;
      if ((p.x - n.x) ** 2 + (p.y - n.y) ** 2 <= r * r) return n;
    }
    return null;
  },

  _onMouseDown(e) {
    if (e.button !== 0) return;
    const rect = this._canvas.getBoundingClientRect();
    this._dragging = true;
    this._didDrag = false;
    this._dragStart = { mx: e.clientX - rect.left, my: e.clientY - rect.top, cx: this._cam.cx, cy: this._cam.cy };
  },

  _onMouseMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    this._mouseX = mx; this._mouseY = my;
    if (this._dragging && this._dragStart) {
      const dx = mx - this._dragStart.mx, dy = my - this._dragStart.my;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._didDrag = true;
      this._cam.cx = this._dragStart.cx - dx / this._cam.zoom;
      this._cam.cy = this._dragStart.cy - dy / this._cam.zoom;
      this._canvas.style.cursor = 'grabbing';
      this._draw();
      return;
    }
    const hit = this._hitTest(mx, my);
    const id = hit && hit.sector.id;
    if (id !== this._hoverId) {
      this._hoverId = id || null;
      this._hoverInfo = hit && this._isDiscovered(id) ? { node: hit, mx, my } : null;
      this._draw();
    } else if (this._hoverInfo) {
      this._hoverInfo.mx = mx; this._hoverInfo.my = my;
    }
    this._canvas.style.cursor = hit && this._isDiscovered(id) ? 'pointer' : 'crosshair';
  },

  _onMouseUp() {
    this._dragging = false;
    this._dragStart = null;
    if (!this._didDrag) this._canvas.style.cursor = 'crosshair';
  },

  _onMouseLeave() {
    this._dragging = false;
    this._dragStart = null;
    this._hoverId = null;
    this._hoverInfo = null;
    this._draw();
  },

  _onCanvasClick(e) {
    if (this._didDrag) { this._didDrag = false; return; }
    const rect = this._canvas.getBoundingClientRect();
    const hit = this._hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (!hit || !this._isDiscovered(hit.sector.id)) return;
    this._selectedId = hit.sector.id;
    this._syncSidebar();
    this._draw();
  },

  _onDblClick(e) {
    e.preventDefault();
    this._cam = { cx: 0, cy: 0, zoom: 1 };
    this._draw();
  },

  _onWheel(e) {
    e.preventDefault();
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const before = this._screenToWorld(mx, my);
    this._cam.zoom = clamp(this._cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.5, 3);
    const w = this._canvas.width / this._dpr, h = this._canvas.height / this._dpr;
    this._cam.cx = before.x - (mx - w / 2) / this._cam.zoom;
    this._cam.cy = before.y - (my - h / 2) / this._cam.zoom;
    this._draw();
  },

  _draw() {
    const g = this._g, canvas = this._canvas;
    if (!g || !canvas || canvas.width < 2) return;
    this._drawSig = this._drawSignature();
    g.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    const w = canvas.width / this._dpr, h = canvas.height / this._dpr;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(4,8,16,.38)'; g.fillRect(0, 0, w, h);

    const nodes = this._layout();
    const byId = Object.fromEntries(nodes.map((n) => [n.sector.id, n]));
    const now = Date.now();
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(this._cam.zoom, this._cam.zoom);
    g.translate(-this._cam.cx, -this._cam.cy);
    this._drawEdges(g, nodes, byId, now);
    this._drawWormholes(g, nodes, byId);
    const route = this._route();
    if (route) this._drawRoute(g, route, byId, now);
    this._drawNodes(g, nodes, this._currentId(), now);
    g.restore();
    if (this._hoverInfo && this._hoverId) this._drawTooltip(g, w, h);
  },

  _drawEdges(g, nodes, byId, now) {
    const zoom = this._cam.zoom;
    for (const n of nodes) {
      const a = n.sector;
      for (const id of (a.neighbors || [])) {
        if (a.id > id) continue;
        const b = byId[id];
        if (!b) continue;
        const bothKnown = this._isDiscovered(a.id) && this._isDiscovered(id);
        const sa = this._signal(a.id), sb = this._signal(id);
        const averageDanger = bothKnown && sa && sb ? (sa.danger + sb.danger) * 0.5 : 0;
        g.beginPath(); g.moveTo(n.x, n.y); g.lineTo(b.x, b.y);
        g.strokeStyle = bothKnown
          ? `rgba(${averageDanger > .65 ? '255,84,112' : '57,208,255'},${(0.18 + averageDanger * 0.20).toFixed(3)})`
          : 'rgba(80,110,150,.12)';
        g.lineWidth = (bothKnown ? 1.2 + averageDanger * 1.1 : 0.8) / zoom;
        g.setLineDash(bothKnown ? [] : [4 / zoom, 5 / zoom]);
        g.stroke(); g.setLineDash([]);

        if (!bothKnown || !sa || !sb) continue;
        const gradient = sb.pricePressure - sa.pricePressure;
        if (Math.abs(gradient) < 0.025) continue;
        // Commodity flow is drawn from surplus (lower pressure) toward scarcity (higher pressure).
        const from = gradient > 0 ? n : b;
        const to = gradient > 0 ? b : n;
        const phase = (hashText(`${a.id}|${id}`) % 1000) / 1000;
        for (let k = 0; k < 2; k++) {
          const t = ((now / 2600 + phase + k * 0.5) % 1 + 1) % 1;
          const p = pointOnLine(from, to, t);
          g.beginPath(); g.arc(p.x, p.y, (1.8 + Math.abs(gradient) * 2.2) / zoom, 0, Math.PI * 2);
          g.fillStyle = pressureColor(Math.max(sa.pricePressure, sb.pricePressure));
          g.globalAlpha = 0.45 + Math.abs(gradient) * 0.45;
          g.fill(); g.globalAlpha = 1;
        }
      }
    }
  },

  _drawWormholes(g, nodes, byId) {
    for (const n of nodes) {
      const wh = n.sector.wormholeTo;
      if (!wh || !byId[wh.sectorId] || !this._isDiscovered(n.sector.id)) continue;
      const b = byId[wh.sectorId];
      g.beginPath(); g.moveTo(n.x, n.y); g.lineTo(b.x, b.y);
      g.strokeStyle = 'rgba(192,139,255,.45)';
      g.lineWidth = 1.5 / this._cam.zoom;
      g.setLineDash([2 / this._cam.zoom, 6 / this._cam.zoom]);
      g.stroke(); g.setLineDash([]);
    }
  },

  _drawRoute(g, route, byId, now) {
    if (!route.legs || !route.legs.length) return;
    const points = [];
    for (let i = 0; i < route.legs.length; i++) {
      const leg = route.legs[i];
      if (i === 0 && byId[leg.from]) points.push(byId[leg.from]);
      if (byId[leg.to]) points.push(byId[leg.to]);
    }
    if (points.length < 2) return;
    const z = this._cam.zoom;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.lineWidth = 6 / z; g.strokeStyle = 'rgba(57,208,255,.14)'; g.stroke();
    g.lineWidth = 2.5 / z; g.strokeStyle = 'rgba(57,208,255,.78)'; g.stroke(); g.restore();
    const p = pointOnPolyline(points, (now % 3000) / 3000);
    g.beginPath(); g.arc(p.x, p.y, 4 / z, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  },

  _drawNodes(g, nodes, currentId, now) {
    const z = this._cam.zoom;
    for (const n of nodes) {
      const s = n.sector;
      const known = this._isDiscovered(s.id);
      if (!known) {
        g.beginPath(); g.arc(n.x, n.y, 8, 0, Math.PI * 2); g.fillStyle = 'rgba(40,54,76,.5)'; g.fill();
        g.strokeStyle = 'rgba(120,140,170,.4)'; g.lineWidth = 1 / z; g.stroke();
        g.fillStyle = 'rgba(150,170,200,.5)'; g.font = `600 ${10 / z}px var(--mono,monospace)`;
        g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText('???', n.x, n.y + 10 / z);
        continue;
      }
      const signal = this._signal(s.id);
      const dominant = signal && signal.dominantFactionId || s.factionId;
      const core = factionColor(dominant);
      const danger = signal ? signal.danger : 0;
      const pressure = signal ? signal.pricePressure : 0;
      const selected = s.id === this._selectedId;
      const hover = s.id === this._hoverId;
      const current = s.id === currentId;
      const reachable = currentId && this._isNeighbor(currentId, s.id);

      if (selected || hover) {
        g.beginPath(); g.arc(n.x, n.y, n.r + 8 / z, 0, Math.PI * 2); g.fillStyle = 'rgba(57,208,255,.12)'; g.fill();
      }
      if (reachable) {
        g.beginPath(); g.arc(n.x, n.y, n.r + 5 / z, 0, Math.PI * 2); g.strokeStyle = 'rgba(122,247,208,.58)';
        g.lineWidth = 1.4 / z; g.setLineDash([3 / z, 3 / z]); g.stroke(); g.setLineDash([]);
      }
      if (signal && signal.contestMargin < 0.16) {
        g.beginPath(); g.arc(n.x, n.y, n.r + 9 / z, 0, Math.PI * 2); g.strokeStyle = 'rgba(192,139,255,.78)';
        g.lineWidth = 1.5 / z; g.setLineDash([2 / z, 4 / z]); g.stroke(); g.setLineDash([]);
      }

      drawHexPath(g, n.x, n.y, n.r + 2.8 / z);
      g.lineWidth = (2.2 + danger * 1.2) / z; g.strokeStyle = dangerColor(danger); g.stroke();
      drawHexPath(g, n.x, n.y, n.r);
      g.fillStyle = core; g.fill(); g.lineWidth = 1 / z; g.strokeStyle = 'rgba(255,255,255,.25)'; g.stroke();

      if (Math.abs(pressure) > 0.035) {
        g.beginPath();
        const extent = clamp(Math.abs(pressure), 0.08, 1) * Math.PI * 1.65;
        g.arc(n.x, n.y, n.r + 5.5 / z, -Math.PI / 2, -Math.PI / 2 + extent);
        g.strokeStyle = pressureColor(pressure); g.lineWidth = 2.1 / z; g.stroke();
      }

      if (current) {
        const alpha = Math.sin(now * 0.004) * 0.3 + 0.7;
        g.beginPath(); g.arc(n.x, n.y, n.r + 11 / z + Math.sin(now * 0.003) * 3 / z, 0, Math.PI * 2);
        g.strokeStyle = `rgba(57,208,255,${alpha.toFixed(2)})`; g.lineWidth = 2 / z; g.stroke();
        g.fillStyle = '#fff'; g.font = `700 ${9 / z}px var(--mono,monospace)`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('●', n.x, n.y);
      }

      const labelY = n.y + n.r + 5 / z;
      g.fillStyle = selected ? '#fff' : 'rgba(211,230,255,.90)';
      g.font = `${current ? '700' : '500'} ${11 / z}px var(--font,sans-serif)`;
      g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(s.name, n.x, labelY);
      if (signal) {
        const glyph = trendGlyph(signal.trend.danger);
        g.fillStyle = trendColor(signal.trend.danger);
        g.font = `700 ${9 / z}px var(--mono,monospace)`;
        g.fillText(`${Math.round(signal.danger * 100)}${glyph}`, n.x, labelY + 13 / z);
      }
      this._drawFeatureIcons(g, n, s, z);
    }
  },

  _drawFeatureIcons(g, n, s, z) {
    const icons = [];
    if (s.hazards && s.hazards.length) icons.push('!');
    if (s.fields && s.fields.some((f) => f.type === 'ast_rare_exotic' || f.type === 'ast_crystalline')) icons.push('◆');
    if (s.stations && s.stations.some((st) => st.type === 'blackmarket')) icons.push('⊘');
    if (s.stations && s.stations.some((st) => st.contested)) icons.push('×');
    if (s.wormholeTo) icons.push('◌');
    if (!icons.length) return;
    const spacing = 12 / z, start = n.x - (icons.length - 1) * spacing / 2;
    g.font = `700 ${9 / z}px var(--mono,monospace)`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < icons.length; i++) {
      const icon = icons[i];
      g.fillStyle = icon === '!' ? '#ffd84a' : icon === '◆' ? '#64ffda' : icon === '◌' ? '#c08bff' : '#ff5470';
      g.fillText(icon, start + i * spacing, n.y - n.r - 8 / z);
    }
  },

  _drawTooltip(g, canvasW, canvasH) {
    const s = this._hoverInfo.node.sector;
    const signal = this._signal(s.id);
    const eff = this._effective(s.id);
    if (!signal || !eff) return;
    const lines = [
      { text: s.name, color: '#fff', font: '700 13px var(--font,sans-serif)' },
      { text: `${factionName(signal.dominantFactionId)} influence ${pct(signal.dominantInfluence)}`, color: factionColor(signal.dominantFactionId), font: '600 11px var(--mono,monospace)' },
      { text: `DANGER ${Math.round(signal.danger * 100)}% ${trendGlyph(signal.trend.danger)}  · encounter ×${signal.encounterLoad.toFixed(2)}`, color: dangerColor(signal.danger), font: '600 11px var(--mono,monospace)' },
      { text: `MARKET ${pressureLabel(signal.pricePressure)} ${trendGlyph(signal.trend.pricePressure)}`, color: pressureColor(signal.pricePressure), font: '600 11px var(--mono,monospace)' },
      { text: `Security ${eff.security.toFixed(2)} · enemies ${enemyDensityLabel(eff.enemyDensity || 0)}`, color: dangerColor(signal.danger), font: '500 11px var(--mono,monospace)' },
    ];
    if (s.hazards && s.hazards.length) lines.push({ text: `Hazards: ${s.hazards.map((h) => HAZARD_LABEL[h.type] || h.type).join(', ')}`, color: '#ffd84a', font: '500 11px var(--mono,monospace)' });
    const lineH = 17, padX = 12, padY = 10;
    let maxW = 0;
    for (const line of lines) { g.font = line.font; maxW = Math.max(maxW, g.measureText(line.text).width); }
    const boxW = maxW + padX * 2, boxH = lines.length * lineH + padY * 2;
    let x = this._mouseX + 16, y = this._mouseY - boxH / 2;
    if (x + boxW > canvasW - 8) x = this._mouseX - boxW - 16;
    y = clamp(y, 8, canvasH - boxH - 8);
    g.fillStyle = 'rgba(8,14,28,.94)'; g.strokeStyle = 'rgba(57,208,255,.35)'; g.lineWidth = 1;
    roundedRect(g, x, y, boxW, boxH, 6); g.fill(); g.stroke();
    let ly = y + padY + 12;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    for (const line of lines) { g.font = line.font; g.fillStyle = line.color; g.fillText(line.text, x + padX, ly); ly += lineH; }
  },

  _syncHeader() {
    const state = this._ctx.state;
    const fuel = state.fuel || { current: 0, max: 0 };
    setText(this._els.fuel, `${Math.round(fuel.current)}/${Math.round(fuel.max)}`);
    setText(this._els.jumpState, state.jump && state.jump.state || 'IDLE');
    const longRange = state.player && (state.player.researchedNodes || []).includes('tech_advanced_navigation');
    setText(this._els.range, longRange ? 'multi-hop' : 'adjacent');
    const epoch = state.sectorSim && state.sectorSim.field && state.sectorSim.field.epochDays || 0;
    setText(this._els.epoch, `${epoch.toFixed(1)}d`);
  },

  _syncSidebar() {
    const selected = this._els.selected, actions = this._els.actions;
    if (!selected || !actions) return;
    this._sidebarSig = this._sidebarSignature();
    const routeHtml = this._routeHtml();
    if (!this._selectedId) {
      selected.innerHTML = `<div class="sm-hint">Select a sector to inspect the live danger, market, and influence fields.</div>${routeHtml}`;
      actions.innerHTML = '';
      return;
    }
    const s = this._sectorById(this._selectedId);
    const signal = this._signal(this._selectedId);
    const eff = this._effective(this._selectedId);
    if (!s || !signal || !eff) {
      selected.innerHTML = `<div class="sm-hint">No field solution for this sector.</div>${routeHtml}`;
      actions.innerHTML = '';
      return;
    }
    const currentId = this._currentId();
    const isCurrent = s.id === currentId;
    const reachable = currentId && this._isNeighbor(currentId, s.id);
    const discovery = this._discovery(s.id);
    const topInfluence = Object.entries(signal.influence || {}).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0])).slice(0, 3);
    const influenceHtml = topInfluence.map(([id, value]) => `
      <div class="sm-influence-row" style="color:${factionColor(id)}"><span>${escapeHtml(factionName(id))}</span><b>${pct(value)}</b></div>
      <div class="sm-bar" style="color:${factionColor(id)}"><i style="width:${pct(value)}"></i></div>`).join('');
    const fromSectorId = isCurrent ? undefined : currentId;
    const gate = forecastTransitFor(this._ctx.state, s.id, { fromSectorId, via: 'gate' });
    const drive = forecastTransitFor(this._ctx.state, s.id, { fromSectorId, via: 'drive' });
    const marketFlow = signal.marketFlowUnitsPerDay;
    const marketFlowText = marketFlow < 0 ? `${Math.abs(marketFlow)} stock/day drained`
      : marketFlow > 0 ? `${marketFlow} stock/day supplied` : 'no net stock flow';
    const dangerTrend = signal.trend.danger * 100;
    const priceTrend = signal.trend.pricePressure * 100;
    const hazards = s.hazards && s.hazards.length ? s.hazards.map((h) => HAZARD_LABEL[h.type] || h.type).join(', ') : 'None';

    selected.innerHTML = `
      <div class="sm-sel-name">${escapeHtml(s.name)}</div>
      <div class="sm-sel-fac" style="color:${factionColor(signal.dominantFactionId)}">
        ${escapeHtml(factionName(signal.dominantFactionId))} field · owner ${escapeHtml(factionName(signal.ownerId))}
      </div>

      <div class="sm-section">
        <div class="sm-section-title">Danger field</div>
        <div class="sm-kv"><span>Exposure</span><b style="color:${dangerColor(signal.danger)}">${pct(signal.danger)} ${trendGlyph(signal.trend.danger)} ${signed(dangerTrend)}%/day</b></div>
        <div class="sm-kv"><span>Encounter load</span><b>×${signal.encounterLoad.toFixed(2)}</b></div>
        <div class="sm-kv"><span>Security / density</span><b>${eff.security.toFixed(2)} ${securityLabel(eff.security)} / ${enemyDensityLabel(eff.enemyDensity || 0)}</b></div>
        <div class="sm-driver">Driven by ${escapeHtml(driverLabel(signal.driver.danger))}. This field feeds live enemy population and offscreen asset-loss risk.</div>
      </div>

      <div class="sm-section">
        <div class="sm-section-title">Trade pressure</div>
        <div class="sm-kv"><span>Market state</span><b style="color:${pressureColor(signal.pricePressure)}">${escapeHtml(pressureLabel(signal.pricePressure))}</b></div>
        <div class="sm-kv"><span>Pressure trend</span><b style="color:${pressureColor(signal.trend.pricePressure)}">${trendGlyph(signal.trend.pricePressure)} ${signed(priceTrend)}%/day</b></div>
        <div class="sm-kv"><span>Stock consequence</span><b>${escapeHtml(marketFlowText)}</b></div>
        <div class="sm-driver">Driven by ${escapeHtml(driverLabel(signal.driver.pricePressure))}. Moving edge beads show modeled commodity flow toward scarcity.</div>
      </div>

      <div class="sm-section">
        <div class="sm-section-title">Faction influence</div>
        ${influenceHtml}
        <div class="sm-kv"><span>Contest margin</span><b>${pct(signal.contestMargin)}</b></div>
        <div class="sm-driver">Driven by ${escapeHtml(driverLabel(signal.driver.influence))}. Low margin raises conflict tension; the factions system remains the territory owner.</div>
      </div>

      <div class="sm-section">
        <div class="sm-section-title">Transit consequence · your ship</div>
        ${this._riskHtml('Gate', gate)}
        ${this._riskHtml('Drive', drive)}
        <div class="sm-driver">Speed reduces exposure probability. Shield, armor, and hull determine whether the modeled impact is survivable.</div>
      </div>

      <div class="sm-section">
        <div class="sm-kv"><span>Sector tier</span><b>T${s.tier}</b></div>
        <div class="sm-kv"><span>Danger tier</span><b>${dangerTier(eff)}/5</b></div>
        <div class="sm-kv"><span>Stations / hazards</span><b>${(s.stations || []).length} / ${escapeHtml(hazards)}</b></div>
        <div class="sm-kv"><span>Visited</span><b>${discovery && discovery.visitedCount ? `${discovery.visitedCount}×` : '—'}</b></div>
      </div>

      ${isCurrent ? '<div class="sm-route">▸ Current sector</div>'
        : reachable ? '<div class="sm-route">▸ Reachable in one jump</div>'
          : '<div class="sm-hint">Not directly reachable — plot a multi-hop route.</div>'}
      ${routeHtml}`;

    if (isCurrent) actions.innerHTML = '';
    else if (reachable) actions.innerHTML = '<button class="sm-course" data-act="jump">⟫ Set Course &amp; Jump</button>';
    else actions.innerHTML = '<button class="sm-course" data-act="route">⟫ Plot Route</button>';
  },

  _riskHtml(label, risk) {
    const color = risk.incidentChance > 0.55 ? '#ff5470' : risk.incidentChance > 0.25 ? '#ffb347' : '#62e08a';
    const marginColor = risk.survivalMargin < 0 ? '#ff5470' : '#62e08a';
    return `<div class="sm-risk">
      <div class="sm-risk-head"><span>${label}</span><b style="color:${color}">${pct(risk.incidentChance)} incident</b></div>
      <div class="sm-kv"><span>Expected impact</span><b>${risk.expectedDamage} HP</b></div>
      <div class="sm-kv"><span>Speed / threat</span><b>${Math.round(risk.maxSpeed)} / ${Math.round(risk.threatSpeed)}</b></div>
      <div class="sm-kv"><span>Survival margin</span><b style="color:${marginColor}">${signed(risk.survivalMargin, 0)} HP</b></div>
    </div>`;
  },

  _routeHtml() {
    const route = this._route();
    if (!route || !route.legs || !route.legs.length) return '';
    let html = `<div class="sm-section"><div class="sm-route">▸ Active Route (${route.totalHops || route.legs.length} hops)</div>`;
    for (const leg of route.legs) {
      html += `<div class="sm-route-leg"><b>${escapeHtml(this._nameOf(leg.from))}</b> → <b>${escapeHtml(this._nameOf(leg.to))}</b> · ${Math.round(leg.fuel)}F${leg.interdict ? ' <span style="color:#ff5470">[!]</span>' : ''}</div>`;
    }
    html += `<div class="sm-route-total">Σ ${Math.round(route.totalFuel || 0)} fuel</div></div>`;
    return html;
  },

  _onAction(action) {
    const target = this._selectedId;
    if (!target) return;
    const bus = this._ctx.bus;
    if (action === 'jump') {
      bus.emit('world:requestJump', { targetSectorId: target, via: 'gate' });
      bus.emit('ui:setCourse', { sectorId: target, path: null });
      bus.emit('toast', { text: `Course set: ${this._nameOf(target)}`, kind: 'info', ttl: 3000 });
    } else if (action === 'route') {
      bus.emit('world:requestRoute', { targetSectorId: target, mode: 'fuel' });
      bus.emit('ui:setCourse', { sectorId: target, path: null });
      bus.emit('toast', { text: `Plotting route to ${this._nameOf(target)}…`, kind: 'info', ttl: 3000 });
    }
    this._syncHeader();
  },

  _drawSignature() {
    const parts = [this._currentId() || '', this._selectedId || '', this._hoverId || '', this._dpr];
    const route = this._route();
    if (route) parts.push(route.legs.map((l) => `${l.from}>${l.to}`).join(','));
    for (const s of this._sectors()) {
      const known = this._isDiscovered(s.id);
      parts.push(s.id, known ? 1 : 0);
      if (known) {
        const signal = this._signal(s.id);
        if (signal) parts.push(Math.round(signal.danger * 1000), Math.round(signal.pricePressure * 1000), signal.dominantFactionId || '', Math.round(signal.contestMargin * 1000));
      }
    }
    return parts.join('|');
  },

  _sidebarSignature() {
    const id = this._selectedId;
    const signal = id && this._signal(id);
    const field = this._ctx.state.sectorSim && this._ctx.state.sectorSim.field;
    const player = this._ctx.state.entities && this._ctx.state.entities.get && this._ctx.state.entities.get(this._ctx.state.playerId);
    return [
      id || '', this._currentId() || '', field && field.epochDays || 0,
      signal && Math.round(signal.danger * 10000), signal && Math.round(signal.pricePressure * 10000),
      signal && signal.dominantFactionId, signal && Math.round(signal.contestMargin * 10000),
      player && Math.round(player.maxSpeed || 0), player && Math.round((player.shield || 0) + (player.armorHp || 0) + (player.hull || 0)),
      this._route() && this._route().legs && this._route().legs.length || 0,
    ].join('|');
  },

  _nameOf(id) { const s = this._sectorById(id); return s ? s.name : id; },
};

function roundedRect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y); g.lineTo(x + w - rr, y); g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr); g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h); g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr); g.quadraticCurveTo(x, y, x + rr, y); g.closePath();
}
