// src/ui/screens/starmap.js — Star-map navigation screen (ARCHITECTURE §5, spec 09).
// Draws the SECTORS graph to a <canvas>: nodes from sector.position, edges from neighbors,
// current sector highlighted, security/faction coloring, fog for undiscovered sectors.
// Click a reachable neighbour -> Set Course panel -> emit world:requestJump (single hop) or
// world:requestRoute (multi-hop). READ-ONLY on state; emits intent events only.
//
// Features: zoom/pan, hover tooltips, route visualization, hexagonal nodes, sector icons,
// animated current-sector pulse, and a requestAnimationFrame loop for smooth rendering.
//
// Export: starmapScreen  (id 'starmap'). No 'three' import (UI does not need three).

import { SECTORS, dangerTier } from '../../data/sectors.js';
import { FACTION_META } from '../../data/factions.js';

// ---- module-local lookups (built once from static data) --------------------
const FACTION_COLOR = {};
const FACTION_NAME  = {};
for (const f of FACTION_META) {
  FACTION_COLOR[f.id] = f.color;
  FACTION_NAME[f.id]  = f.name;
}

// security band -> colour for the danger ring
function securityColor(sec) {
  if (sec >= 0.7) return '#62e08a';   // high-sec (good/green)
  if (sec >= 0.4) return '#ffd84a';   // mid-sec (energy/amber)
  if (sec >= 0.15) return '#ffb347';  // low-sec (warn)
  return '#ff5470';                   // null-sec (danger)
}

function securityLabel(sec) {
  if (sec >= 0.7) return 'High';
  if (sec >= 0.4) return 'Mid';
  if (sec >= 0.15) return 'Low';
  return 'Null';
}

function enemyDensityLabel(d) {
  if (d <= 0.15) return 'Low';
  if (d <= 0.35) return 'Medium';
  if (d <= 0.55) return 'High';
  return 'Extreme';
}

function enemyDensityColor(d) {
  if (d <= 0.15) return '#62e08a';
  if (d <= 0.35) return '#ffd84a';
  if (d <= 0.55) return '#ffb347';
  return '#ff5470';
}

const HAZARD_LABEL = {
  dense_asteroid: 'Asteroids',
  nebula: 'Nebula',
  radiation: 'Radiation',
  debris: 'Debris',
};

const STYLE_ID = 'sf-starmap-style';
const CSS = `
#sf-starmap { width: min(92vw, 1040px); height: min(88vh, 720px); display: flex; flex-direction: column;
  background: linear-gradient(180deg, var(--panel-2), var(--panel)); border: 1px solid var(--panel-edge);
  border-radius: 10px; box-shadow: 0 12px 48px rgba(0,0,0,.6); overflow: hidden; pointer-events: auto; }
#sf-starmap .sm-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px;
  border-bottom: 1px solid var(--panel-edge); background: rgba(8,14,26,.7); }
#sf-starmap .sm-title { font-size: 1.2em; letter-spacing: .12em; text-transform: uppercase; color: var(--accent);
  text-shadow: 0 0 12px rgba(57,208,255,.5); }
#sf-starmap .sm-stats { font-family: var(--mono); font-size: .82em; color: var(--ink-dim); display: flex; gap: 18px; }
#sf-starmap .sm-stats b { color: var(--ink); font-weight: 600; }
#sf-starmap .sm-body { flex: 1; display: flex; min-height: 0; }
#sf-starmap .sm-canvas-wrap { flex: 1; position: relative; min-width: 0; }
#sf-starmap canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; display: block; }
#sf-starmap .sm-side { width: 264px; border-left: 1px solid var(--panel-edge); background: rgba(6,11,21,.6);
  padding: 14px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
#sf-starmap .sm-sel-name { font-size: 1.05em; color: var(--ink); }
#sf-starmap .sm-sel-fac { font-family: var(--mono); font-size: .78em; }
#sf-starmap .sm-kv { display: flex; justify-content: space-between; font-family: var(--mono); font-size: .8em;
  color: var(--ink-dim); padding: 2px 0; }
#sf-starmap .sm-kv b { color: var(--ink); font-weight: 600; }
#sf-starmap .sm-hint { font-size: .78em; color: var(--ink-mute); line-height: 1.5; }
#sf-starmap .sm-route { font-family: var(--mono); font-size: .8em; color: var(--accent-2); }
#sf-starmap .sm-route-leg { font-family: var(--mono); font-size: .75em; color: var(--ink-dim); padding: 2px 0 2px 10px;
  border-left: 2px solid rgba(57,208,255,.3); }
#sf-starmap .sm-route-leg b { color: var(--accent); font-weight: 600; }
#sf-starmap .sm-route-total { font-family: var(--mono); font-size: .82em; color: var(--accent);
  padding: 4px 0; font-weight: 600; }
#sf-starmap .sm-actions { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
#sf-starmap .sm-actions button { width: 100%; padding: 9px; }
#sf-starmap .sm-course { background: rgba(57,208,255,.12); border-color: var(--accent); color: #fff;
  text-shadow: 0 0 8px rgba(57,208,255,.6); }
#sf-starmap .sm-foot { display: flex; align-items: center; justify-content: space-between; padding: 8px 18px;
  border-top: 1px solid var(--panel-edge); font-family: var(--mono); font-size: .72em; color: var(--ink-mute); }
#sf-starmap .sm-legend { display: flex; gap: 12px; flex-wrap: wrap; }
#sf-starmap .sm-legend span { display: inline-flex; align-items: center; gap: 4px; }
#sf-starmap .sm-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
#sf-starmap .sm-hex { width: 9px; height: 9px; display: inline-block; }
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }

function closeScreen(ctx) {
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  const mgr = (ctx && (ctx.screenManager || ctx.screens)) || (ui && (ui.screenManager || ui.manager));
  if (mgr && typeof mgr.popScreen === 'function') mgr.popScreen();
  else if (ctx && ctx.bus) ctx.bus.emit('ui:popScreen', {});
}

// ---- drawing helpers -------------------------------------------------------

/** Draw a regular hexagon centered at (cx, cy) with the given radius */
function drawHexPath(g, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2; // flat-top hex
    const hx = cx + r * Math.cos(angle);
    const hy = cy + r * Math.sin(angle);
    if (i === 0) g.moveTo(hx, hy);
    else g.lineTo(hx, hy);
  }
  g.closePath();
}

/** Compute the distance along a polyline at parameter t (0..1) */
function pointOnPolyline(points, t) {
  if (points.length < 2) return points[0] || { x: 0, y: 0 };
  // compute total length
  let totalLen = 0;
  const segLens = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segLens.push(len);
    totalLen += len;
  }
  if (totalLen < 0.01) return points[0];
  let target = t * totalLen;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i] || i === segLens.length - 1) {
      const frac = segLens[i] > 0 ? target / segLens[i] : 0;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * frac,
        y: points[i].y + (points[i + 1].y - points[i].y) * frac,
      };
    }
    target -= segLens[i];
  }
  return points[points.length - 1];
}


// ============================================================================
// starmapScreen
// ============================================================================

export const starmapScreen = {
  id: 'starmap',
  _ctx: null,
  _root: null,
  _canvas: null,
  _g: null,
  _nodes: [],          // [{ sector, x, y, r }] in world-space coords (before camera)
  _selectedId: null,
  _hoverId: null,
  _dpr: 1,
  _ro: null,
  _els: null,
  _drawSig: '',
  _sidebarSig: '',

  // camera state (local, not pushed to game state every frame)
  _cam: { cx: 0, cy: 0, zoom: 1 },

  // pan/drag tracking
  _dragging: false,
  _dragStart: null,     // { mx, my, cx, cy } mouse + camera at drag start
  _didDrag: false,      // true if mouse moved while dragging (suppress click)

  // hover tooltip data
  _hoverInfo: null,     // { node, mx, my } or null
  _mouseX: 0,
  _mouseY: 0,

  // animation
  _animFrame: null,
  _visible: false,
  _lastDrawTime: 0,

  // layout cache
  _layoutMinX: 0,
  _layoutMinY: 0,
  _layoutScaleX: 1,
  _layoutScaleY: 1,
  _layoutPad: 64,

  mount(rootEl, ctx) {
    injectStyle();
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.id = 'sf-starmap';
    rootEl.innerHTML = `
      <div class="sm-head">
        <div class="sm-title">Star Map</div>
        <div class="sm-stats">
          <div>FUEL <b data-fuel>--/--</b></div>
          <div>JUMP STATE <b data-jstate>IDLE</b></div>
          <div>RANGE <b data-range>adjacent</b></div>
        </div>
      </div>
      <div class="sm-body">
        <div class="sm-canvas-wrap"><canvas></canvas></div>
        <div class="sm-side">
          <div data-sel>
            <div class="sm-hint">Select a sector node to view details and plot a course.</div>
          </div>
          <div class="sm-actions" data-actions></div>
        </div>
      </div>
      <div class="sm-foot">
        <div class="sm-legend">
          <span><i class="sm-dot" style="background:#62e08a"></i>High-sec</span>
          <span><i class="sm-dot" style="background:#ffd84a"></i>Mid</span>
          <span><i class="sm-dot" style="background:#ffb347"></i>Low</span>
          <span><i class="sm-dot" style="background:#ff5470"></i>Null</span>
          <span style="margin-left:6px"><i style="color:#ffd84a;font-size:11px">&#9650;</i> Hazard</span>
          <span><i style="color:#c08bff;font-size:10px">&#10042;</i> Wormhole</span>
          <span><i style="color:#64ffda;font-size:10px">&#9670;</i> Rare</span>
        </div>
        <div>M to close &middot; scroll zoom &middot; drag pan &middot; dbl-click reset</div>
      </div>`;

    this._canvas = rootEl.querySelector('canvas');
    this._g = this._canvas.getContext('2d');
    this._els = {
      fuel: rootEl.querySelector('[data-fuel]'),
      jumpState: rootEl.querySelector('[data-jstate]'),
      range: rootEl.querySelector('[data-range]'),
      selected: rootEl.querySelector('[data-sel]'),
      actions: rootEl.querySelector('[data-actions]'),
    };

    // ---- input events on canvas ----
    this._canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this._canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this._canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this._canvas.addEventListener('mouseleave', (e) => this._onMouseLeave(e));
    this._canvas.addEventListener('click', (e) => this._onCanvasClick(e));
    this._canvas.addEventListener('dblclick', (e) => this._onDblClick(e));
    this._canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });

    // delegated click for the action buttons
    this._els.actions.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (btn) this._onAction(btn.dataset.act);
    });

    // keep the canvas backing store sized to its box
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(rootEl.querySelector('.sm-canvas-wrap'));
    }
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    const st = this._ctx.state;
    this._selectedId = null;
    this._hoverId = null;
    this._hoverInfo = null;
    // default selection: current sector if known
    this._selectedId = st.world && st.world.currentSectorId ? st.world.currentSectorId : null;

    // initialize camera from game state if available
    const smView = st.ui && st.ui.starmapView;
    if (smView) {
      this._cam = { cx: smView.cx || 0, cy: smView.cy || 0, zoom: smView.zoom || 1 };
    } else {
      this._cam = { cx: 0, cy: 0, zoom: 1 };
    }

    this._visible = true;
    this._resize();
    this.refresh(this._ctx);
    this._startAnimLoop();
  },

  onHide() {
    this._visible = false;
    this._stopAnimLoop();
  },

  onKey(ev, ctx) {
    if (ev && (ev.key === 'm' || ev.key === 'M')) {
      closeScreen(ctx || this._ctx);
      return true;
    }
    return false;
  },

  refresh(ctx, opts = {}) {
    if (ctx) this._ctx = ctx;
    if (!this._root) return;
    this._syncHeader();
    const sidebarSig = this._sidebarSignature();
    if (!opts.periodic || sidebarSig !== this._sidebarSig) {
      this._sidebarSig = sidebarSig;
      this._syncSidebar();
    }
    const drawSig = this._drawSignature();
    if (!opts.periodic || drawSig !== this._drawSig) {
      this._drawSig = drawSig;
      this._draw();
    }
  },

  // ---- animation loop ------------------------------------------------------
  _startAnimLoop() {
    if (this._animFrame) return;
    const tick = () => {
      if (!this._visible) { this._animFrame = null; return; }
      const now = Date.now();
      // throttle to ~15fps for animation smoothness without waste
      if (now - this._lastDrawTime >= 64) {
        this._lastDrawTime = now;
        this._draw();
      }
      this._animFrame = requestAnimationFrame(tick);
    };
    this._animFrame = requestAnimationFrame(tick);
  },

  _stopAnimLoop() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  },

  // ---- data helpers ---------------------------------------------------------
  _sectors() {
    const st = this._ctx.state;
    const c = st.content && st.content.sectors;
    if (c && (Array.isArray(c) ? c.length : Object.keys(c).length)) {
      return Array.isArray(c) ? c : Object.values(c);
    }
    return SECTORS;
  },

  _sectorById(id) {
    return this._sectors().find((s) => s.id === id) || null;
  },

  _discovery(id) {
    const st = this._ctx.state;
    const d = st.world && st.world.discovery && st.world.discovery[id];
    return d || null;
  },

  _isDiscovered(id) {
    const st = this._ctx.state;
    if (st.world && st.world.currentSectorId === id) return true;
    const d = this._discovery(id);
    return !!(d && d.discovered);
  },

  _currentId() {
    const st = this._ctx.state;
    return st.world ? st.world.currentSectorId : null;
  },

  _isNeighbor(curId, id) {
    const cur = this._sectorById(curId);
    if (!cur || !cur.neighbors) return false;
    return cur.neighbors.includes(id);
  },

  _route() {
    const st = this._ctx.state;
    return st.nav && st.nav.route && st.nav.route.legs ? st.nav.route : null;
  },

  // ---- camera / coordinate transforms --------------------------------------

  /** Convert world-space coordinates to screen (CSS) coordinates */
  _worldToScreen(wx, wy) {
    const cam = this._cam;
    const w = this._canvas.width / this._dpr;
    const h = this._canvas.height / this._dpr;
    return {
      x: (wx - cam.cx) * cam.zoom + w / 2,
      y: (wy - cam.cy) * cam.zoom + h / 2,
    };
  },

  /** Convert screen (CSS pixel) coordinates to world-space */
  _screenToWorld(sx, sy) {
    const cam = this._cam;
    const w = this._canvas.width / this._dpr;
    const h = this._canvas.height / this._dpr;
    return {
      x: (sx - w / 2) / cam.zoom + cam.cx,
      y: (sy - h / 2) / cam.zoom + cam.cy,
    };
  },

  // ---- input handlers -------------------------------------------------------

  _onMouseDown(e) {
    if (e.button !== 0) return;
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // start drag
    this._dragging = true;
    this._didDrag = false;
    this._dragStart = { mx, my, cx: this._cam.cx, cy: this._cam.cy };
  },

  _onMouseMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    this._mouseX = mx;
    this._mouseY = my;

    if (this._dragging && this._dragStart) {
      const dx = mx - this._dragStart.mx;
      const dy = my - this._dragStart.my;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._didDrag = true;
      this._cam.cx = this._dragStart.cx - dx / this._cam.zoom;
      this._cam.cy = this._dragStart.cy - dy / this._cam.zoom;
      this._canvas.style.cursor = 'grabbing';
      this._draw();
      return;
    }

    // hover detection
    const hit = this._hitTest(mx, my);
    const id = hit ? hit.sector.id : null;

    if (id !== this._hoverId) {
      this._hoverId = id;
      if (hit && this._isDiscovered(hit.sector.id)) {
        this._hoverInfo = { node: hit, mx, my };
      } else {
        this._hoverInfo = null;
      }
      this._draw();
    } else if (this._hoverInfo) {
      // update mouse position for tooltip
      this._hoverInfo.mx = mx;
      this._hoverInfo.my = my;
    }

    this._canvas.style.cursor = hit && this._isDiscovered(hit.sector.id) ? 'pointer' : 'crosshair';
  },

  _onMouseUp(e) {
    this._dragging = false;
    this._dragStart = null;
    if (!this._didDrag) {
      this._canvas.style.cursor = 'crosshair';
    }
  },

  _onMouseLeave() {
    this._dragging = false;
    this._dragStart = null;
    this._hoverId = null;
    this._hoverInfo = null;
    this._draw();
  },

  _onCanvasClick(e) {
    // suppress click if we just finished a pan drag
    if (this._didDrag) {
      this._didDrag = false;
      return;
    }
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = this._hitTest(mx, my);
    if (!hit) return;
    if (!this._isDiscovered(hit.sector.id)) return;
    this._selectedId = hit.sector.id;
    this._syncSidebar();
    this._draw();
  },

  _onDblClick(e) {
    e.preventDefault();
    // reset camera
    this._cam = { cx: 0, cy: 0, zoom: 1 };
    this._draw();
  },

  _onWheel(e) {
    e.preventDefault();
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // zoom toward cursor
    const worldBefore = this._screenToWorld(mx, my);
    const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this._cam.zoom = Math.max(0.5, Math.min(3.0, this._cam.zoom * zoomFactor));
    // adjust pan so the world point under cursor stays put
    const w = this._canvas.width / this._dpr;
    const h = this._canvas.height / this._dpr;
    this._cam.cx = worldBefore.x - (mx - w / 2) / this._cam.zoom;
    this._cam.cy = worldBefore.y - (my - h / 2) / this._cam.zoom;

    this._draw();
  },

  // ---- layout & hit testing -------------------------------------------------

  _resize() {
    if (!this._canvas) return;
    const wrap = this._root.querySelector('.sm-canvas-wrap');
    const rect = wrap.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._canvas.width = Math.round(rect.width * this._dpr);
    this._canvas.height = Math.round(rect.height * this._dpr);
    this._draw();
  },

  /** Build node positions in world space (centered around 0,0) */
  _layout() {
    const sectors = this._sectors();
    const w = this._canvas.width / this._dpr;
    const h = this._canvas.height / this._dpr;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of sectors) {
      const p = s.position || { x: 0, y: 0 };
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const pad = this._layoutPad;
    const spanX = (maxX - minX) || 1;
    const spanY = (maxY - minY) || 1;
    const sx = (w - pad * 2) / spanX;
    const sy = (h - pad * 2) / spanY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this._layoutMinX = minX;
    this._layoutMinY = minY;
    this._layoutScaleX = sx;
    this._layoutScaleY = sy;

    const nodes = [];
    for (const s of sectors) {
      const p = s.position || { x: 0, y: 0 };
      // world space centered around (0,0) to work with camera
      const wx = (p.x - centerX) * sx;
      const wy = (p.y - centerY) * sy;
      // dynamic radius: base 10 + 2 per station, capped at 20
      const stationCount = (s.stations || []).length;
      const r = Math.min(10 + stationCount * 2, 20);
      nodes.push({ sector: s, x: wx, y: wy, r });
    }
    this._nodes = nodes;
    return nodes;
  },

  _hitTest(mx, my) {
    // convert mouse screen coords to world coords
    const world = this._screenToWorld(mx, my);
    for (const n of this._nodes) {
      const dx = world.x - n.x;
      const dy = world.y - n.y;
      const hitR = (n.r + 6) / this._cam.zoom; // scale hit area with zoom
      if (dx * dx + dy * dy <= hitR * hitR) return n;
    }
    return null;
  },

  // ---- main draw ------------------------------------------------------------

  _draw() {
    const g = this._g, cv = this._canvas;
    if (!g || cv.width < 2) return;
    this._drawSig = this._drawSignature();
    g.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    const w = cv.width / this._dpr, h = cv.height / this._dpr;
    g.clearRect(0, 0, w, h);

    // faint space backdrop
    g.fillStyle = 'rgba(4,8,16,0.35)';
    g.fillRect(0, 0, w, h);

    const nodes = this._layout();
    const byId = {};
    for (const n of nodes) byId[n.sector.id] = n;
    const curId = this._currentId();
    const cam = this._cam;
    const now = Date.now();

    // ---- apply camera transform ----
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(cam.zoom, cam.zoom);
    g.translate(-cam.cx, -cam.cy);

    // ---- draw edges ----
    this._drawEdges(g, nodes, byId);

    // ---- draw wormhole links ----
    this._drawWormholes(g, nodes, byId);

    // ---- draw route (between edges and nodes) ----
    const route = this._route();
    if (route) {
      this._drawRoute(g, route, byId, now);
    }

    // ---- draw nodes ----
    this._drawNodes(g, nodes, byId, curId, now);

    g.restore(); // pop camera transform

    // ---- draw hover tooltip (screen space, after camera restore) ----
    if (this._hoverInfo && this._hoverId) {
      this._drawTooltip(g, w, h);
    }
  },

  _drawEdges(g, nodes, byId) {
    for (const n of nodes) {
      const s = n.sector;
      if (!s.neighbors) continue;
      const aKnown = this._isDiscovered(s.id);
      for (const nb of s.neighbors) {
        const m = byId[nb];
        if (!m) continue;
        if (s.id > nb) continue; // draw each undirected edge once
        const bKnown = this._isDiscovered(nb);
        const both = aKnown && bKnown;
        g.beginPath();
        g.moveTo(n.x, n.y);
        g.lineTo(m.x, m.y);
        g.strokeStyle = both ? 'rgba(57,208,255,0.25)' : 'rgba(80,110,150,0.12)';
        g.lineWidth = both ? 1.5 / this._cam.zoom : 0.8 / this._cam.zoom;
        g.setLineDash(both ? [] : [4 / this._cam.zoom, 5 / this._cam.zoom]);
        g.stroke();
      }
    }
    g.setLineDash([]);
  },

  _drawWormholes(g, nodes, byId) {
    for (const n of nodes) {
      const wh = n.sector.wormholeTo;
      if (wh && byId[wh.sectorId] && this._isDiscovered(n.sector.id)) {
        const m = byId[wh.sectorId];
        g.beginPath();
        g.moveTo(n.x, n.y);
        g.lineTo(m.x, m.y);
        g.strokeStyle = 'rgba(192,139,255,0.45)';
        g.lineWidth = 1.5 / this._cam.zoom;
        g.setLineDash([2 / this._cam.zoom, 6 / this._cam.zoom]);
        g.stroke();
        g.setLineDash([]);
      }
    }
  },

  _drawRoute(g, route, byId, now) {
    if (!route.legs || !route.legs.length) return;
    const zoom = this._cam.zoom;

    // collect route points
    const points = [];
    for (let i = 0; i < route.legs.length; i++) {
      const leg = route.legs[i];
      if (i === 0 && byId[leg.from]) points.push(byId[leg.from]);
      if (byId[leg.to]) points.push(byId[leg.to]);
    }
    if (points.length < 2) return;

    // glow pass
    g.save();
    g.lineWidth = 6 / zoom;
    g.strokeStyle = 'rgba(57,208,255,0.15)';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.stroke();

    // main line
    g.lineWidth = 3 / zoom;
    g.strokeStyle = 'rgba(57,208,255,0.75)';
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.stroke();
    g.restore();

    // fuel annotations at each hop
    g.font = `600 ${10 / zoom}px var(--mono, monospace)`;
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    for (let i = 0; i < route.legs.length; i++) {
      const leg = route.legs[i];
      const from = byId[leg.from];
      const to = byId[leg.to];
      if (!from || !to) continue;
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      // background
      const fuelTxt = `${Math.round(leg.fuel)}F`;
      const tw = g.measureText(fuelTxt).width + 6 / zoom;
      g.fillStyle = 'rgba(4,8,16,0.7)';
      g.fillRect(midX - tw / 2, midY - 14 / zoom, tw, 13 / zoom);
      // text
      g.fillStyle = '#64ffda';
      g.fillText(fuelTxt, midX, midY - 3 / zoom);
    }

    // total fuel near destination
    const dest = points[points.length - 1];
    if (route.totalFuel !== undefined) {
      const totalTxt = `Total: ${Math.round(route.totalFuel)}F`;
      g.font = `700 ${11 / zoom}px var(--mono, monospace)`;
      const tw2 = g.measureText(totalTxt).width + 8 / zoom;
      g.fillStyle = 'rgba(4,8,16,0.8)';
      g.fillRect(dest.x - tw2 / 2, dest.y + (dest.r + 20) / zoom, tw2, 15 / zoom);
      g.fillStyle = '#39d0ff';
      g.textBaseline = 'top';
      g.fillText(totalTxt, dest.x, dest.y + (dest.r + 22) / zoom);
    }

    // animated pulse dot traveling along the route
    const pulsePeriod = 3000; // ms for one full traversal
    const t = (now % pulsePeriod) / pulsePeriod;
    const polyPoints = points.map((p) => ({ x: p.x, y: p.y }));
    const pulsePos = pointOnPolyline(polyPoints, t);
    g.beginPath();
    g.arc(pulsePos.x, pulsePos.y, 4 / zoom, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.beginPath();
    g.arc(pulsePos.x, pulsePos.y, 7 / zoom, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(57,208,255,0.5)';
    g.lineWidth = 1.5 / zoom;
    g.stroke();
  },

  _drawNodes(g, nodes, byId, curId, now) {
    const zoom = this._cam.zoom;

    for (const n of nodes) {
      const s = n.sector;
      const known = this._isDiscovered(s.id);
      const isCur = s.id === curId;
      const isSel = s.id === this._selectedId;
      const isHover = s.id === this._hoverId;
      const reachable = curId && this._isNeighbor(curId, s.id);
      const disc = this._discovery(s.id);
      const visited = disc && disc.visitedCount > 0;

      if (!known) {
        // ---- undiscovered: dim circle with "???" ----
        g.beginPath();
        g.arc(n.x, n.y, 8 / zoom * zoom, 0, Math.PI * 2); // keep small constant size
        g.fillStyle = 'rgba(40,54,76,0.5)';
        g.fill();
        g.lineWidth = 1 / zoom;
        g.strokeStyle = 'rgba(120,140,170,0.4)';
        g.stroke();
        g.fillStyle = 'rgba(150,170,200,0.5)';
        g.font = `600 ${10 / zoom}px var(--mono, monospace)`;
        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillText('???', n.x, n.y + 10 / zoom);
        continue;
      }

      const fac = FACTION_COLOR[s.factionId] || '#9aa8bc';
      const secCol = securityColor(s.security);

      // ---- selection/hover halo ----
      if (isSel || isHover) {
        g.beginPath();
        g.arc(n.x, n.y, n.r + 7 / zoom, 0, Math.PI * 2);
        g.fillStyle = 'rgba(57,208,255,0.12)';
        g.fill();
      }

      // ---- reachable ring ----
      if (reachable) {
        g.beginPath();
        g.arc(n.x, n.y, n.r + 4 / zoom, 0, Math.PI * 2);
        g.lineWidth = 1.5 / zoom;
        g.strokeStyle = 'rgba(122,247,208,0.6)';
        g.setLineDash([3 / zoom, 3 / zoom]);
        g.stroke();
        g.setLineDash([]);
      }

      // ---- security danger ring ----
      drawHexPath(g, n.x, n.y, n.r + 2.5 / zoom);
      g.lineWidth = 2.5 / zoom;
      g.strokeStyle = secCol;
      g.stroke();

      // ---- hexagonal faction-filled core ----
      drawHexPath(g, n.x, n.y, n.r);
      g.fillStyle = fac;
      g.fill();
      g.lineWidth = 1 / zoom;
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.stroke();

      // ---- current-sector animated pulse ----
      if (isCur) {
        const pulse = Math.sin(now * 0.004) * 0.3 + 0.7; // 0.4..1.0 opacity
        const pulseR = n.r + 10 / zoom + Math.sin(now * 0.003) * 3 / zoom;
        g.beginPath();
        g.arc(n.x, n.y, pulseR, 0, Math.PI * 2);
        g.lineWidth = 2 / zoom;
        g.strokeStyle = `rgba(57,208,255,${pulse.toFixed(2)})`;
        g.stroke();
        // inner marker
        g.fillStyle = '#fff';
        g.font = `700 ${9 / zoom}px var(--mono, monospace)`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('●', n.x, n.y);
      }

      // ---- sector name label ----
      const labelY = n.y + n.r + 5 / zoom;
      if (visited) {
        g.fillStyle = isSel ? '#fff' : 'rgba(211,230,255,0.90)';
        g.font = (isCur ? '700 ' : '500 ') + `${11 / zoom}px var(--font, sans-serif)`;
      } else {
        // discovered but not visited: dimmer
        g.fillStyle = 'rgba(170,190,220,0.55)';
        g.font = `400 ${10 / zoom}px var(--font, sans-serif)`;
      }
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(s.name, n.x, labelY);

      // ---- tier dots below name ----
      if (s.tier > 0) {
        const dotY = labelY + 14 / zoom;
        const dotSpacing = 6 / zoom;
        const dotR = 2 / zoom;
        const totalW = (s.tier - 1) * dotSpacing;
        const startX = n.x - totalW / 2;
        for (let i = 0; i < s.tier; i++) {
          g.beginPath();
          g.arc(startX + i * dotSpacing, dotY, dotR, 0, Math.PI * 2);
          g.fillStyle = 'rgba(180,200,230,0.6)';
          g.fill();
        }
      }

      // ---- feature icons ----
      this._drawFeatureIcons(g, n, s, zoom);
    }
  },

  _drawFeatureIcons(g, n, s, zoom) {
    // collect icons to draw, then lay them out in a row below the node
    const icons = [];

    // Hazard warning triangle
    if (s.hazards && s.hazards.length > 0) {
      icons.push('hazard');
    }

    // Rare resources diamond
    if (s.fields && s.fields.some((f) => f.type === 'ast_rare_exotic' || f.type === 'ast_crystalline')) {
      icons.push('rare');
    }

    // Black market indicator
    if (s.stations && s.stations.some((st) => st.type === 'blackmarket')) {
      icons.push('blackmarket');
    }

    // Contested indicator
    if (s.stations && s.stations.some((st) => st.contested)) {
      icons.push('contested');
    }

    // Wormhole indicator
    if (s.wormholeTo) {
      icons.push('wormhole');
    }

    if (icons.length === 0) return;

    const iconSpacing = 14 / zoom;
    const totalW = (icons.length - 1) * iconSpacing;
    const baseY = n.y - n.r - 8 / zoom; // above the node
    const startX = n.x - totalW / 2;

    for (let i = 0; i < icons.length; i++) {
      const ix = startX + i * iconSpacing;
      const iy = baseY;
      const iconType = icons[i];

      if (iconType === 'hazard') {
        // yellow warning triangle
        const sz = 5 / zoom;
        g.beginPath();
        g.moveTo(ix, iy - sz);
        g.lineTo(ix - sz, iy + sz * 0.6);
        g.lineTo(ix + sz, iy + sz * 0.6);
        g.closePath();
        g.fillStyle = 'rgba(255,216,74,0.85)';
        g.fill();
        g.fillStyle = '#000';
        g.font = `700 ${6 / zoom}px var(--mono, monospace)`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('!', ix, iy);
      } else if (iconType === 'rare') {
        // diamond shape
        const sz = 4 / zoom;
        g.beginPath();
        g.moveTo(ix, iy - sz);
        g.lineTo(ix + sz, iy);
        g.lineTo(ix, iy + sz);
        g.lineTo(ix - sz, iy);
        g.closePath();
        g.fillStyle = 'rgba(100,255,218,0.85)';
        g.fill();
      } else if (iconType === 'blackmarket') {
        // dark circle with slash
        const sz = 4 / zoom;
        g.beginPath();
        g.arc(ix, iy, sz, 0, Math.PI * 2);
        g.fillStyle = 'rgba(80,60,100,0.8)';
        g.fill();
        g.strokeStyle = '#ff5470';
        g.lineWidth = 1.2 / zoom;
        g.beginPath();
        g.moveTo(ix - sz * 0.6, iy - sz * 0.6);
        g.lineTo(ix + sz * 0.6, iy + sz * 0.6);
        g.stroke();
      } else if (iconType === 'contested') {
        // crossed lines (swords)
        const sz = 4 / zoom;
        g.strokeStyle = 'rgba(255,84,112,0.85)';
        g.lineWidth = 1.2 / zoom;
        g.beginPath();
        g.moveTo(ix - sz, iy - sz);
        g.lineTo(ix + sz, iy + sz);
        g.stroke();
        g.beginPath();
        g.moveTo(ix + sz, iy - sz);
        g.lineTo(ix - sz, iy + sz);
        g.stroke();
      } else if (iconType === 'wormhole') {
        // spiral / portal - concentric arcs
        const sz = 4 / zoom;
        g.strokeStyle = 'rgba(192,139,255,0.85)';
        g.lineWidth = 1 / zoom;
        g.beginPath();
        g.arc(ix, iy, sz, 0, Math.PI * 1.5);
        g.stroke();
        g.beginPath();
        g.arc(ix, iy, sz * 0.5, Math.PI * 0.5, Math.PI * 2);
        g.stroke();
      }
    }
  },

  // ---- hover tooltip --------------------------------------------------------

  _drawTooltip(g, canvasW, canvasH) {
    const info = this._hoverInfo;
    if (!info) return;

    const s = info.node.sector;
    const disc = this._discovery(s.id);
    const fac = FACTION_META.find((f) => f.id === s.factionId);
    const facName = fac ? fac.name : 'Unaffiliated';
    const facCol = (fac && fac.color) || '#9aa8bc';
    const secLbl = securityLabel(s.security);
    const secCol = securityColor(s.security);
    const tier = dangerTier(s);
    const dLabel = enemyDensityLabel(s.enemyDensity);
    const dColor = enemyDensityColor(s.enemyDensity);

    // build text lines
    const lines = [];
    lines.push({ text: s.name, font: '700 13px var(--font, sans-serif)', color: '#fff' });
    lines.push({ text: facName, font: '600 11px var(--mono, monospace)', color: facCol });
    lines.push({ text: `Security: ${secLbl} (${(s.security ?? 0).toFixed(2)})`, font: '500 11px var(--mono, monospace)', color: secCol });

    // danger tier with filled/empty squares
    const filled = tier;
    const empty = 5 - tier;
    const dangerStr = 'DANGER ' + '■'.repeat(filled) + '□'.repeat(empty);
    const dangerCol = tier <= 1 ? '#62e08a' : tier <= 3 ? '#ffd84a' : '#ff5470';
    lines.push({ text: dangerStr, font: '600 11px var(--mono, monospace)', color: dangerCol });

    lines.push({ text: `Stations: ${(s.stations || []).length}`, font: '500 11px var(--mono, monospace)', color: '#b8c8e0' });

    if (s.hazards && s.hazards.length > 0) {
      const hNames = s.hazards.map((h) => HAZARD_LABEL[h.type] || h.type).join(', ');
      lines.push({ text: `Hazards: ${hNames}`, font: '500 11px var(--mono, monospace)', color: '#ffd84a' });
    }

    if (s.pois && s.pois.length > 0) {
      lines.push({ text: `POIs: ${s.pois.length}`, font: '500 11px var(--mono, monospace)', color: '#c08bff' });
    }

    lines.push({ text: `Enemies: ${dLabel}`, font: '500 11px var(--mono, monospace)', color: dColor });

    // measure dimensions
    const lineHeight = 17;
    const padX = 12, padY = 10;
    let maxW = 0;
    for (const ln of lines) {
      g.font = ln.font;
      const tw = g.measureText(ln.text).width;
      if (tw > maxW) maxW = tw;
    }
    const boxW = maxW + padX * 2;
    const boxH = lines.length * lineHeight + padY * 2;

    // position: near mouse, clamped to canvas bounds
    let tx = this._mouseX + 16;
    let ty = this._mouseY - boxH / 2;
    if (tx + boxW > canvasW - 8) tx = this._mouseX - boxW - 16;
    if (ty < 8) ty = 8;
    if (ty + boxH > canvasH - 8) ty = canvasH - boxH - 8;

    // draw background
    g.fillStyle = 'rgba(8,14,28,0.92)';
    g.strokeStyle = 'rgba(57,208,255,0.35)';
    g.lineWidth = 1;
    const cornerR = 6;
    g.beginPath();
    g.moveTo(tx + cornerR, ty);
    g.lineTo(tx + boxW - cornerR, ty);
    g.quadraticCurveTo(tx + boxW, ty, tx + boxW, ty + cornerR);
    g.lineTo(tx + boxW, ty + boxH - cornerR);
    g.quadraticCurveTo(tx + boxW, ty + boxH, tx + boxW - cornerR, ty + boxH);
    g.lineTo(tx + cornerR, ty + boxH);
    g.quadraticCurveTo(tx, ty + boxH, tx, ty + boxH - cornerR);
    g.lineTo(tx, ty + cornerR);
    g.quadraticCurveTo(tx, ty, tx + cornerR, ty);
    g.closePath();
    g.fill();
    g.stroke();

    // draw text lines
    let ly = ty + padY + 12; // baseline of first line
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    for (const ln of lines) {
      g.font = ln.font;
      g.fillStyle = ln.color;
      g.fillText(ln.text, tx + padX, ly);
      ly += lineHeight;
    }
  },

  // ---- sidebar & header sync ------------------------------------------------

  _syncHeader() {
    const st = this._ctx.state;
    const fuel = st.fuel || { current: 0, max: 0 };
    setText(this._els && this._els.fuel, `${Math.round(fuel.current)}/${Math.round(fuel.max)}`);
    setText(this._els && this._els.jumpState, (st.jump && st.jump.state) || 'IDLE');
    const r = this._els && this._els.range;
    if (r) {
      const longRange = st.player && st.player.researchedNodes &&
        st.player.researchedNodes.includes('tech_advanced_navigation');
      setText(r, longRange ? 'multi-hop route' : 'adjacent only');
    }
  },

  _syncSidebar() {
    const sel = this._els && this._els.selected;
    const actions = this._els && this._els.actions;
    if (!sel || !actions) return;
    this._sidebarSig = this._sidebarSignature();

    // ---- route display in sidebar ----
    const route = this._route();
    let routeHtml = '';
    if (route && route.legs && route.legs.length > 0) {
      routeHtml = `<div style="margin-top:8px"><div class="sm-route">▸ Active Route (${route.totalHops || route.legs.length} hops)</div>`;
      for (const leg of route.legs) {
        const fromName = this._nameOf(leg.from);
        const toName = this._nameOf(leg.to);
        const fuelStr = Math.round(leg.fuel);
        const interdictWarn = leg.interdict ? ' <span style="color:#ff5470">[!]</span>' : '';
        routeHtml += `<div class="sm-route-leg"><b>${fromName}</b> → <b>${toName}</b> &mdash; ${fuelStr}F${interdictWarn}</div>`;
      }
      routeHtml += `<div class="sm-route-total">Σ ${Math.round(route.totalFuel)} fuel</div></div>`;
    }

    if (!this._selectedId) {
      sel.innerHTML = `<div class="sm-hint">Select a sector node to view details and plot a course.</div>${routeHtml}`;
      actions.innerHTML = '';
      return;
    }
    const s = this._sectorById(this._selectedId);
    if (!s) { sel.innerHTML = `<div class="sm-hint">Unknown sector.</div>${routeHtml}`; actions.innerHTML = ''; return; }
    const curId = this._currentId();
    const isCur = s.id === curId;
    const reachable = curId && this._isNeighbor(curId, s.id);
    const fac = FACTION_META.find((f) => f.id === s.factionId);
    const facName = fac ? fac.name : 'Unaffiliated';
    const facCol = (fac && fac.color) || '#9aa8bc';
    const disc = this._discovery(s.id);
    const tier = dangerTier(s);

    // hazards summary
    const hazardStr = (s.hazards && s.hazards.length > 0)
      ? s.hazards.map((h) => HAZARD_LABEL[h.type] || h.type).join(', ')
      : 'None';

    // POI summary
    const poiCount = (s.pois || []).length;

    sel.innerHTML = `
      <div class="sm-sel-name">${s.name}</div>
      <div class="sm-sel-fac" style="color:${facCol}">${facName}</div>
      <div class="sm-kv"><span>Security</span><b style="color:${securityColor(s.security)}">${(s.security ?? 0).toFixed(2)} (${securityLabel(s.security)})</b></div>
      <div class="sm-kv"><span>Danger Tier</span><b>${tier}/5</b></div>
      <div class="sm-kv"><span>Sector Tier</span><b>T${s.tier}</b></div>
      <div class="sm-kv"><span>Stations</span><b>${(s.stations || []).length}</b></div>
      <div class="sm-kv"><span>Hazards</span><b>${hazardStr}</b></div>
      <div class="sm-kv"><span>POIs</span><b>${poiCount}</b></div>
      <div class="sm-kv"><span>Enemy Density</span><b style="color:${enemyDensityColor(s.enemyDensity)}">${enemyDensityLabel(s.enemyDensity)}</b></div>
      <div class="sm-kv"><span>Visited</span><b>${disc && disc.visitedCount ? disc.visitedCount + '×' : '—'}</b></div>
      ${isCur ? `<div class="sm-route">▸ Current sector</div>`
        : reachable ? `<div class="sm-route">▸ Reachable via gate (1 jump)</div>`
        : `<div class="sm-hint">Not directly reachable — plot a multi-hop course.</div>`}
      ${routeHtml}
    `;

    // actions: set course depends on adjacency
    if (isCur) {
      actions.innerHTML = '';
    } else if (reachable) {
      actions.innerHTML = `<button class="sm-course" data-act="jump">⟫ Set Course &amp; Jump</button>`;
    } else {
      actions.innerHTML = `<button class="sm-course" data-act="route">⟫ Plot Route</button>`;
    }
  },

  _onAction(act) {
    const st = this._ctx.state;
    const bus = this._ctx.bus;
    const target = this._selectedId;
    if (!target) return;

    if (act === 'jump') {
      bus.emit('world:requestJump', { targetSectorId: target, via: 'gate' });
      bus.emit('ui:setCourse', { sectorId: target, path: null });
      bus.emit('toast', { text: `Course set: ${this._nameOf(target)}`, kind: 'info', ttl: 3000 });
    } else if (act === 'route') {
      bus.emit('world:requestRoute', { targetSectorId: target, mode: 'gate' });
      bus.emit('ui:setCourse', { sectorId: target, path: null });
      bus.emit('toast', { text: `Plotting route to ${this._nameOf(target)}…`, kind: 'info', ttl: 3000 });
    }
    this._syncHeader();
  },

  _drawSignature() {
    const parts = [this._currentId() || '', this._selectedId || '', this._hoverId || '', this._dpr];
    for (const s of this._sectors()) {
      parts.push(s.id, this._isDiscovered(s.id) ? 1 : 0);
    }
    return parts.join('|');
  },

  _sidebarSignature() {
    const d = this._selectedId ? this._discovery(this._selectedId) : null;
    return [
      this._selectedId || '',
      this._currentId() || '',
      d && d.discovered ? 1 : 0,
      d && d.visitedCount ? d.visitedCount : 0,
      this._ctx.state.player && (this._ctx.state.player.researchedNodes || []).includes('tech_advanced_navigation') ? 1 : 0,
    ].join('|');
  },

  _nameOf(id) {
    const s = this._sectorById(id);
    return s ? s.name : id;
  },
};
