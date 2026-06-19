// src/ui/screens/starmap.js — Star-map navigation screen (ARCHITECTURE §5, spec 09).
// Draws the SECTORS graph to a <canvas>: nodes from sector.position, edges from neighbors,
// current sector highlighted, security/faction coloring, fog for undiscovered sectors.
// Click a reachable neighbour -> Set Course panel -> emit world:requestJump (single hop) or
// world:requestRoute (multi-hop). READ-ONLY on state; emits intent events only.
//
// Export: starmapScreen  (id 'starmap'). No 'three' import (UI does not need three).

import { SECTORS, dangerTier } from '../../data/sectors.js';
import { FACTION_META } from '../../data/factions.js';

// ---- module-local lookups (built once from static data) --------------------
const FACTION_COLOR = {};
for (const f of FACTION_META) FACTION_COLOR[f.id] = f.color;

// security band -> colour for the danger ring
function securityColor(sec) {
  if (sec >= 0.7) return '#62e08a';   // high-sec (good/green)
  if (sec >= 0.4) return '#ffd84a';   // mid-sec (energy/amber)
  if (sec >= 0.15) return '#ffb347';  // low-sec (warn)
  return '#ff5470';                   // null-sec (danger)
}

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
#sf-starmap .sm-actions { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
#sf-starmap .sm-actions button { width: 100%; padding: 9px; }
#sf-starmap .sm-course { background: rgba(57,208,255,.12); border-color: var(--accent); color: #fff;
  text-shadow: 0 0 8px rgba(57,208,255,.6); }
#sf-starmap .sm-foot { display: flex; align-items: center; justify-content: space-between; padding: 8px 18px;
  border-top: 1px solid var(--panel-edge); font-family: var(--mono); font-size: .72em; color: var(--ink-mute); }
#sf-starmap .sm-legend { display: flex; gap: 14px; }
#sf-starmap .sm-legend span { display: inline-flex; align-items: center; gap: 5px; }
#sf-starmap .sm-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
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

export const starmapScreen = {
  id: 'starmap',
  _ctx: null,
  _root: null,
  _canvas: null,
  _g: null,
  _nodes: [],          // [{ sector, sx, sy, r }] in CSS px (recomputed on draw)
  _selectedId: null,
  _hoverId: null,
  _dpr: 1,
  _ro: null,
  _els: null,
  _drawSig: '',
  _sidebarSig: '',

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
        </div>
        <div>M to close</div>
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

    // delegated click on the canvas -> hit-test nodes
    this._canvas.addEventListener('click', (e) => this._onCanvasClick(e));
    this._canvas.addEventListener('mousemove', (e) => this._onCanvasMove(e));
    this._canvas.addEventListener('mouseleave', () => { this._hoverId = null; this._draw(); });

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
    // default selection: current sector if known
    this._selectedId = st.world && st.world.currentSectorId ? st.world.currentSectorId : null;
    this._resize();
    this.refresh(this._ctx);
  },

  onHide() { /* DOM retained per ScreenManager cache contract; nothing to tear down */ },

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

  // ---- internals ----------------------------------------------------------
  _sectors() {
    const st = this._ctx.state;
    // prefer runtime catalog if world populated state.content; else static import
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
    // current sector is always known; otherwise consult discovery overlay
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

  // build node screen positions from sector.position, fitting the graph into the canvas
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
    const pad = 64;
    const spanX = (maxX - minX) || 1;
    const spanY = (maxY - minY) || 1;
    const sx = (w - pad * 2) / spanX;
    const sy = (h - pad * 2) / spanY;
    const nodes = [];
    for (const s of sectors) {
      const p = s.position || { x: 0, y: 0 };
      nodes.push({
        sector: s,
        x: pad + (p.x - minX) * sx,
        y: pad + (p.y - minY) * sy,
        r: 13,
      });
    }
    this._nodes = nodes;
    return nodes;
  },

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

    // ---- edges ----
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
        g.strokeStyle = both ? 'rgba(57,208,255,0.32)' : 'rgba(80,110,150,0.14)';
        g.lineWidth = both ? 2 : 1;
        g.setLineDash(both ? [] : [4, 5]);
        g.stroke();
      }
    }
    g.setLineDash([]);

    // wormhole links (special dashed magenta)
    for (const n of nodes) {
      const wh = n.sector.wormholeTo;
      if (wh && byId[wh.sectorId] && this._isDiscovered(n.sector.id)) {
        const m = byId[wh.sectorId];
        g.beginPath(); g.moveTo(n.x, n.y); g.lineTo(m.x, m.y);
        g.strokeStyle = 'rgba(192,139,255,0.45)'; g.lineWidth = 1.5; g.setLineDash([2, 6]); g.stroke();
        g.setLineDash([]);
      }
    }

    // ---- nodes ----
    for (const n of nodes) {
      const s = n.sector;
      const known = this._isDiscovered(s.id);
      const isCur = s.id === curId;
      const isSel = s.id === this._selectedId;
      const isHover = s.id === this._hoverId;
      const reachable = curId && this._isNeighbor(curId, s.id);

      if (!known) {
        // fog: hollow grey node with ??? label
        g.beginPath(); g.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        g.fillStyle = 'rgba(40,54,76,0.5)'; g.fill();
        g.lineWidth = 1; g.strokeStyle = 'rgba(120,140,170,0.4)'; g.stroke();
        g.fillStyle = 'rgba(150,170,200,0.5)'; g.font = '600 11px var(--mono, monospace)';
        g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText('???', n.x, n.y + n.r + 4);
        continue;
      }

      const fac = FACTION_COLOR[s.factionId] || '#9aa8bc';
      const secCol = securityColor(s.security);

      // selection / reachable halo
      if (isSel || isHover) {
        g.beginPath(); g.arc(n.x, n.y, n.r + 7, 0, Math.PI * 2);
        g.fillStyle = 'rgba(57,208,255,0.12)'; g.fill();
      }
      if (reachable) {
        g.beginPath(); g.arc(n.x, n.y, n.r + 4, 0, Math.PI * 2);
        g.lineWidth = 1.5; g.strokeStyle = 'rgba(122,247,208,0.6)'; g.setLineDash([3, 3]); g.stroke();
        g.setLineDash([]);
      }

      // security danger ring
      g.beginPath(); g.arc(n.x, n.y, n.r + 2.5, 0, Math.PI * 2);
      g.lineWidth = 2.5; g.strokeStyle = secCol; g.stroke();

      // faction-filled core
      g.beginPath(); g.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      g.fillStyle = fac; g.fill();
      g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.stroke();

      // current-sector pulse marker
      if (isCur) {
        g.beginPath(); g.arc(n.x, n.y, n.r + 10, 0, Math.PI * 2);
        g.lineWidth = 2; g.strokeStyle = 'rgba(57,208,255,0.9)'; g.stroke();
        g.fillStyle = '#fff'; g.font = '700 9px var(--mono, monospace)';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('●', n.x, n.y);
      }

      // label
      g.fillStyle = isSel ? '#fff' : 'rgba(211,230,255,0.85)';
      g.font = (isCur ? '700 ' : '500 ') + '11px var(--font, sans-serif)';
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText(s.name, n.x, n.y + n.r + 5);
    }
  },

  _onCanvasMove(e) {
    const hit = this._hitTest(e);
    const id = hit ? hit.sector.id : null;
    if (id !== this._hoverId) { this._hoverId = id; this._draw(); }
    this._canvas.style.cursor = hit && this._isDiscovered(hit.sector.id) ? 'pointer' : 'crosshair';
  },

  _onCanvasClick(e) {
    const hit = this._hitTest(e);
    if (!hit) return;
    if (!this._isDiscovered(hit.sector.id)) return; // fogged nodes not selectable
    this._selectedId = hit.sector.id;
    this._syncSidebar();
    this._draw();
  },

  _hitTest(e) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (const n of this._nodes) {
      const dx = mx - n.x, dy = my - n.y;
      if (dx * dx + dy * dy <= (n.r + 6) * (n.r + 6)) return n;
    }
    return null;
  },

  _syncHeader() {
    const st = this._ctx.state;
    const fuel = st.fuel || { current: 0, max: 0 };
    setText(this._els && this._els.fuel, `${Math.round(fuel.current)}/${Math.round(fuel.max)}`);
    setText(this._els && this._els.jumpState, (st.jump && st.jump.state) || 'IDLE');
    const r = this._els && this._els.range;
    if (r) {
      // jump range: with Advanced Navigation tech the player can plot multi-hop routes;
      // otherwise only adjacent (gate) jumps.
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
    if (!this._selectedId) {
      sel.innerHTML = `<div class="sm-hint">Select a sector node to view details and plot a course.</div>`;
      actions.innerHTML = '';
      return;
    }
    const s = this._sectorById(this._selectedId);
    if (!s) { sel.innerHTML = `<div class="sm-hint">Unknown sector.</div>`; actions.innerHTML = ''; return; }
    const curId = this._currentId();
    const isCur = s.id === curId;
    const reachable = curId && this._isNeighbor(curId, s.id);
    const fac = FACTION_META.find((f) => f.id === s.factionId);
    const facName = fac ? fac.name : 'Unaffiliated';
    const facCol = (fac && fac.color) || '#9aa8bc';
    const disc = this._discovery(s.id);
    const tier = dangerTier(s);

    sel.innerHTML = `
      <div class="sm-sel-name">${s.name}</div>
      <div class="sm-sel-fac" style="color:${facCol}">${facName}</div>
      <div class="sm-kv"><span>Security</span><b>${(s.security ?? 0).toFixed(2)} (${securityLabel(s.security)})</b></div>
      <div class="sm-kv"><span>Danger Tier</span><b>${tier}/5</b></div>
      <div class="sm-kv"><span>Sector Tier</span><b>T${s.tier}</b></div>
      <div class="sm-kv"><span>Stations</span><b>${(s.stations || []).length}</b></div>
      <div class="sm-kv"><span>Visited</span><b>${disc && disc.visitedCount ? disc.visitedCount + '×' : '—'}</b></div>
      ${isCur ? `<div class="sm-route">▸ Current sector</div>`
        : reachable ? `<div class="sm-route">▸ Reachable via gate (1 jump)</div>`
        : `<div class="sm-hint">Not directly reachable — plot a multi-hop course.</div>`}
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
      // single-hop gate jump — world consumes world:requestJump (§4.4)
      bus.emit('world:requestJump', { targetSectorId: target, via: 'gate' });
      // ui:setCourse is the nav-system intent alias (§4.4); harmless duplicate for systems that prefer it
      bus.emit('ui:setCourse', { sectorId: target, path: null });
      bus.emit('toast', { text: `Course set: ${this._nameOf(target)}`, kind: 'info', ttl: 3000 });
    } else if (act === 'route') {
      // multi-hop — world computes the Dijkstra route (world:requestRoute, §4.4)
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

function securityLabel(sec) {
  if (sec >= 0.7) return 'High';
  if (sec >= 0.4) return 'Mid';
  if (sec >= 0.15) return 'Low';
  return 'Null';
}
