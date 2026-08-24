// src/ui/screens/techTree.js — Tech-tree progression screen (ARCHITECTURE §5, spec 09).
// Draws the TECH_NODES DAG to a <canvas>: prereq lines, node state (researched / available /
// locked), cost (credits + RP). Click an available node -> detail panel -> Unlock button emits
// ui:unlockTech{nodeId} (ships handles it). READ-ONLY on state; emits intents only.
//
// Export: techTreeScreen  (id 'techTree'). No 'three' import.

import { TECH_NODES } from '../../data/tech.js';
import { SHIPS } from '../../data/ships.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { BODY_MODULES } from '../../data/claimableBodies.js';
import { escapeHtml } from '../comms.js';
import { canvasFontScaled, canvasFonts, invalidateCanvasFonts } from '../canvasFonts.js';

// Branch -> column index. Colour is by MEANING (researched / available / locked), never by branch.
const BRANCHES = [
  { id: 'combat',    label: 'Combat' },
  { id: 'industry',  label: 'Industry' },
  { id: 'drives',    label: 'Drives' },
  { id: 'logistics', label: 'Logistics' },
];
const BRANCH_INDEX = {};
BRANCHES.forEach((b, i) => { BRANCH_INDEX[b.id] = i; });
const UNLOCK_NAME_BY_ID = new Map(
  [...SHIPS, ...MODULES, ...WEAPONS, ...BODY_MODULES].map((entry) => [entry.id, entry.name]),
);

const NODE_W = 150, NODE_H = 58, COL_GAP = 26, ROW_GAP = 30, PAD_X = 28, PAD_Y = 54;

const STYLE_ID = 'sf-techtree-style';
const CSS = `
#sf-techtree {
  width: 100%; height: 100%; max-width: var(--sf-stage-max); margin: 0 auto;
  display: flex; flex-direction: column;
  background: var(--sf-surface); color: var(--sf-paper);
  border: 0; border-radius: 0; box-shadow: none; overflow: hidden; pointer-events: auto;
  font-family: var(--sf-body-face); font-size: 14px;
  padding-left: var(--sf-safe-inset-x); padding-right: var(--sf-safe-inset-x);
}
#sf-techtree .sf-fig,
#sf-techtree .tt-res b,
#sf-techtree .tt-cost,
#sf-techtree .tt-zoom-badge {
  font-family: var(--sf-data-face); font-weight: 500; font-variant-numeric: tabular-nums;
  font-size: 13px; letter-spacing: 0;
}
#sf-techtree .tt-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--sf-edge); background: var(--sf-surface);
}
#sf-techtree .tt-title {
  font-family: var(--sf-display-face); font-weight: 700; font-size: 28px; line-height: 1.1;
  letter-spacing: 0; text-transform: none; color: var(--sf-paper); overflow-wrap: anywhere;
}
#sf-techtree .tt-res { display: flex; gap: var(--sp-4); color: var(--sf-calm); font-size: 13px; }
#sf-techtree .tt-res .cr, #sf-techtree .tt-res .rp { color: var(--sf-you); }
#sf-techtree .tt-res .count { color: var(--sf-calm); }
#sf-techtree .tt-body { flex: 1; display: flex; min-height: 0; }
#sf-techtree .tt-scroll { flex: 1; overflow: auto; position: relative; min-width: 0; }
#sf-techtree canvas { display: block; cursor: default; }
#sf-techtree .tt-side {
  width: 282px; border-left: 1px solid var(--sf-edge); background: var(--sf-surface);
  padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-3); overflow-y: auto;
}
#sf-techtree .tt-sel-name {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 22px; line-height: 1.2; color: var(--sf-paper);
}
#sf-techtree .tt-branch {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase; color: var(--sf-calm);
}
#sf-techtree .tt-state {
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase;
}
#sf-techtree .tt-state.is-researched { color: var(--sf-you); }
#sf-techtree .tt-state.is-available { color: var(--sf-goal); }
#sf-techtree .tt-state.is-locked { color: var(--sf-calm); }
#sf-techtree .tt-cost { display: flex; gap: var(--sp-4); }
#sf-techtree .tt-cost .cr, #sf-techtree .tt-cost .rp { color: var(--sf-you); }
#sf-techtree .tt-cost .bad { color: var(--sf-foe); }
#sf-techtree .tt-unlocks { font-family: var(--sf-body-face); font-size: 13px; color: var(--sf-calm); line-height: 1.55; }
#sf-techtree .tt-unlocks b { color: var(--sf-paper); }
#sf-techtree .tt-prereq { font-family: var(--sf-body-face); font-size: 13px; color: var(--sf-calm); line-height: 1.5; }
#sf-techtree .tt-prereq .ok { color: var(--sf-you); }
#sf-techtree .tt-prereq .no { color: var(--sf-foe); }
#sf-techtree .tt-actions { margin-top: auto; display: flex; flex-direction: column; gap: var(--sp-2); }
#sf-techtree .tt-actions button { width: 100%; padding: var(--sp-2); font-family: var(--sf-body-face); font-size: 14px; }
#sf-techtree .tt-actions button[aria-disabled="true"] { opacity: .55; cursor: not-allowed; }
#sf-techtree .tt-unlock {
  background: color-mix(in srgb, var(--sf-goal) 12%, transparent);
  border-color: var(--sf-goal); color: var(--sf-paper);
}
#sf-techtree .tt-foot {
  display: flex; gap: var(--sp-4); padding: var(--sp-2) var(--sp-4); border-top: 1px solid var(--sf-edge);
  font-family: var(--sf-subhead-face); font-weight: 600; font-size: 12px;
  letter-spacing: var(--sf-track-micro); text-transform: uppercase; color: var(--sf-calm);
}
#sf-techtree .tt-foot span { display: inline-flex; align-items: center; gap: var(--sp-1); }
#sf-techtree .tt-sw { width: 12px; height: 12px; border-radius: 2px; display: inline-block; border: 1px solid var(--sf-edge); }
#sf-techtree .tt-sw--available { background: var(--sf-goal); border-color: var(--sf-goal); }
#sf-techtree .tt-sw--researched { background: var(--sf-you); border-color: var(--sf-you); }
#sf-techtree .tt-sw--locked { background: var(--sf-calm); }
#sf-techtree .tt-hint { font-family: var(--sf-body-face); font-size: 14px; color: var(--sf-calm); }
#sf-techtree .tt-zoom-badge {
  position: absolute; bottom: var(--sp-2); right: var(--sp-2); color: var(--sf-calm);
  background: var(--sf-surface); border: 1px solid var(--sf-edge); border-radius: 2px;
  padding: var(--sp-1) var(--sp-2); pointer-events: none; z-index: 2;
}
@media (prefers-reduced-motion: reduce) {
  #sf-techtree, #sf-techtree * { animation: none; transition: none; }
}
@media (forced-colors: active) {
  #sf-techtree, #sf-techtree .tt-side, #sf-techtree .tt-zoom-badge {
    background: Canvas; color: CanvasText; border-color: CanvasText;
  }
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

function nodeName(id, nodes = TECH_NODES) {
  const node = (nodes || []).find((n) => n && n.id === id);
  return (node && node.name) || cleanId(id);
}

function researchedSetFrom(stateOrIds) {
  if (Array.isArray(stateOrIds)) return new Set(stateOrIds);
  const player = stateOrIds && stateOrIds.player || {};
  return new Set(player.researchedNodes || []);
}

function missingCostParts(cost, player) {
  const credits = Math.max(0, Number(player && player.credits) || 0);
  const rp = Math.max(0, Number(player && player.researchPoints) || 0);
  const neededCredits = Math.max(0, Math.round((cost && cost.credits || 0) - credits));
  const neededRp = Math.max(0, Math.round((cost && cost.rp || 0) - rp));
  const parts = [];
  if (neededCredits > 0) parts.push(fmtCr(neededCredits) + ' cr');
  if (neededRp > 0) parts.push(neededRp.toLocaleString() + ' RP');
  return { neededCredits, neededRp, parts };
}

export function describeTechNodeReadiness(node, state, nodes = TECH_NODES) {
  if (!node) return { state: 'missing', actionLabel: 'Select a node', actionTitle: 'Select a tech node to inspect it.' };
  const player = state && state.player || {};
  const researched = researchedSetFrom(player.researchedNodes || []);
  const prereqs = node.prereqs || [];
  const missingPrereqs = prereqs.filter((id) => !researched.has(id)).map((id) => nodeName(id, nodes));
  if (researched.has(node.id)) {
    return {
      state: 'researched',
      actionLabel: 'Already researched',
      actionTitle: node.name + ' is already researched.',
      missingPrereqs,
      missingCost: [],
    };
  }
  if (missingPrereqs.length) {
    const label = missingPrereqs.length === 1
      ? 'Research ' + missingPrereqs[0] + ' first'
      : 'Research ' + missingPrereqs.length + ' prerequisites first';
    return {
      state: 'locked',
      actionLabel: label,
      actionTitle: 'Missing prerequisites: ' + missingPrereqs.join(', '),
      missingPrereqs,
      missingCost: [],
    };
  }
  const missing = missingCostParts(node.cost || {}, player);
  if (missing.parts.length) {
    return {
      state: 'funding',
      actionLabel: 'Need ' + missing.parts.join(' / '),
      actionTitle: 'Missing resources: ' + missing.parts.join(', '),
      missingPrereqs,
      missingCost: missing.parts,
      neededCredits: missing.neededCredits,
      neededRp: missing.neededRp,
    };
  }
  return {
    state: 'available',
    actionLabel: '⟫ Research',
    actionTitle: 'Research ' + node.name,
    missingPrereqs,
    missingCost: [],
  };
}

// Build once: id -> node, plus per-node layout depth (longest prereq chain) and row index.
function buildLayout(nodes) {
  const byId = {};
  for (const n of nodes) byId[n.id] = n;
  const depthMemo = {};
  function depth(id, seen) {
    if (depthMemo[id] != null) return depthMemo[id];
    const n = byId[id];
    if (!n || !n.prereqs || !n.prereqs.length) return (depthMemo[id] = 0);
    if (seen && seen.has(id)) return 0; // cycle guard (shouldn't happen)
    const s = seen || new Set();
    s.add(id);
    let d = 0;
    for (const p of n.prereqs) d = Math.max(d, depth(p, s) + 1);
    s.delete(id);
    return (depthMemo[id] = d);
  }
  // assign row within each (branch, depth) bucket so siblings don't overlap
  const layout = {};
  const bucketCount = {}; // key `${branch}:${depth}` -> running count
  // stable order: by branch, then depth, then declaration order
  const ordered = nodes.slice().sort((a, b) => {
    const ba = BRANCH_INDEX[a.branch] ?? 9, bb = BRANCH_INDEX[b.branch] ?? 9;
    if (ba !== bb) return ba - bb;
    return depth(a.id) - depth(b.id);
  });
  for (const n of ordered) {
    const d = depth(n.id);
    const key = `${n.branch}:${d}`;
    const slot = bucketCount[key] || 0;
    bucketCount[key] = slot + 1;
    layout[n.id] = { depth: d, slot };
  }
  // compute x by branch column (each branch reserves enough columns for its widest bucket)
  const branchMaxSlot = {};
  for (const n of nodes) {
    const l = layout[n.id];
    const cur = branchMaxSlot[n.branch] || 0;
    if (l.slot + 1 > cur) branchMaxSlot[n.branch] = l.slot + 1;
  }
  // branch base column offset
  const branchBaseX = {};
  let accCols = 0;
  for (const b of BRANCHES) {
    branchBaseX[b.id] = accCols;
    accCols += (branchMaxSlot[b.id] || 1);
  }
  const positions = {};
  let maxX = 0, maxY = 0;
  for (const n of nodes) {
    const l = layout[n.id];
    const col = branchBaseX[n.branch] + l.slot;
    const x = PAD_X + col * (NODE_W + COL_GAP);
    const y = PAD_Y + l.depth * (NODE_H + ROW_GAP);
    positions[n.id] = { x, y };
    maxX = Math.max(maxX, x + NODE_W);
    maxY = Math.max(maxY, y + NODE_H);
  }
  return { byId, positions, width: maxX + PAD_X, height: maxY + PAD_Y, branchBaseX, branchMaxSlot };
}

export const techTreeScreen = {
  id: 'techTree',
  _ctx: null,
  _root: null,
  _canvas: null,
  _g: null,
  _layout: null,
  _selectedId: null,
  _hoverId: null,
  _dpr: 1,
  _els: null,
  _drawSig: '',
  _sidebarSig: '',
  _zoom: 1.0,
  _zoomBadge: null,

  mount(rootEl, ctx) {
    injectStyle();
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.id = 'sf-techtree';
    rootEl.innerHTML = `
      <div class="tt-head sf-crest">
        <div class="tt-title">Research &amp; Tech</div>
        <div class="tt-res">
          <div class="cr">CR <b class="sf-fig" data-cr>0</b></div>
          <div class="rp">RP <b class="sf-fig" data-rp>0</b></div>
          <div class="count">UNLOCKED <b class="sf-fig" data-count>0/${TECH_NODES.length}</b></div>
        </div>
      </div>
      <div class="tt-body">
        <div class="tt-scroll sf-stage"><canvas></canvas></div>
        <div class="tt-side sf-apron">
          <div data-sel><div class="tt-hint">Select a node to inspect its cost, effects and prerequisites.</div></div>
          <div class="tt-actions" data-actions></div>
        </div>
      </div>
      <div class="tt-foot">
        <span><i class="tt-sw tt-sw--available"></i>Available</span>
        <span><i class="tt-sw tt-sw--researched"></i>Researched</span>
        <span><i class="tt-sw tt-sw--locked"></i>Locked</span>
      </div>`;

    this._canvas = rootEl.querySelector('canvas');
    this._g = this._canvas.getContext('2d');
    this._layout = buildLayout(this._nodes());
    this._els = {
      cr: rootEl.querySelector('[data-cr]'),
      rp: rootEl.querySelector('[data-rp]'),
      count: rootEl.querySelector('[data-count]'),
      selected: rootEl.querySelector('[data-sel]'),
      actions: rootEl.querySelector('[data-actions]'),
    };

    this._canvas.addEventListener('click', (e) => this._onCanvasClick(e));
    this._canvas.addEventListener('mousemove', (e) => this._onCanvasMove(e));
    this._canvas.addEventListener('mouseleave', () => { this._hoverId = null; this._draw(); });

    // Zoom badge
    const scrollEl = rootEl.querySelector('.tt-scroll');
    const zoomBadge = document.createElement('div');
    zoomBadge.className = 'tt-zoom-badge';
    zoomBadge.textContent = '100%';
    scrollEl.appendChild(zoomBadge);
    this._zoomBadge = zoomBadge;
    this._zoom = 1.0;

    // Mouse-wheel zoom
    scrollEl.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const delta = ev.deltaY > 0 ? -0.1 : 0.1;
      const prevZoom = this._zoom;
      this._zoom = Math.round(Math.min(2.0, Math.max(0.5, this._zoom + delta)) * 10) / 10;
      if (this._zoom === prevZoom) return;

      // Zoom toward cursor: adjust scroll position so the point under the cursor stays fixed
      const rect = scrollEl.getBoundingClientRect();
      const mx = ev.clientX - rect.left + scrollEl.scrollLeft;
      const my = ev.clientY - rect.top + scrollEl.scrollTop;
      const ratio = this._zoom / prevZoom;

      this._canvas.style.transformOrigin = '0 0';
      this._canvas.style.transform = `scale(${this._zoom})`;

      // After scaling, adjust scroll to keep cursor-point stable
      scrollEl.scrollLeft = mx * ratio - (ev.clientX - rect.left);
      scrollEl.scrollTop = my * ratio - (ev.clientY - rect.top);

      this._zoomBadge.textContent = Math.round(this._zoom * 100) + '%';
    }, { passive: false });

    this._els.actions.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (btn) this._onAction(btn.dataset.act);
    });
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    invalidateCanvasFonts();
    this._sizeCanvas();
    this.refresh(this._ctx);
  },

  onHide() { /* cached DOM retained */ },

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
  _nodes() {
    const st = this._ctx.state;
    const c = st.content && st.content.techNodes;
    if (c && c.length) return c;
    return TECH_NODES;
  },

  _researched() {
    const st = this._ctx.state;
    return (st.player && st.player.researchedNodes) || [];
  },

  _isResearched(id) { return this._researched().includes(id); },

  _prereqsMet(node) {
    if (!node.prereqs || !node.prereqs.length) return true;
    const r = this._researched();
    return node.prereqs.every((p) => r.includes(p));
  },

  // state: 'researched' | 'available' | 'locked'
  _nodeState(node) {
    if (this._isResearched(node.id)) return 'researched';
    if (this._prereqsMet(node)) return 'available';
    return 'locked';
  },

  _sizeCanvas() {
    if (!this._canvas) return;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    const lw = this._layout ? this._layout.width : 800;
    const lh = this._layout ? this._layout.height : 600;
    this._canvas.style.width = lw + 'px';
    this._canvas.style.height = lh + 'px';
    this._canvas.width = Math.round(lw * this._dpr);
    this._canvas.height = Math.round(lh * this._dpr);
  },

  _draw() {
    const g = this._g, cv = this._canvas;
    if (!g || !this._layout) return;
    this._drawSig = this._drawSignature();
    g.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    const w = cv.width / this._dpr, h = cv.height / this._dpr;
    g.clearRect(0, 0, w, h);

    const nodes = this._nodes();
    const pos = this._layout.positions;
    const roles = canvasRoles();
    const zoom = this._zoom || 1;

    // branch column headers — MICRO, calm: branch identity is column + word, not hue
    g.textAlign = 'left'; g.textBaseline = 'top';
    for (const b of BRANCHES) {
      const baseCol = this._layout.branchBaseX[b.id];
      if (baseCol == null) continue;
      const x = PAD_X + baseCol * (NODE_W + COL_GAP);
      g.fillStyle = roles.calm;
      g.font = canvasFontScaled(600, 12, zoom, 'subhead');
      g.fillText(b.label.toUpperCase(), x, 14);
    }

    // ---- prereq edges ----
    for (const n of nodes) {
      if (!n.prereqs) continue;
      const np = pos[n.id];
      if (!np) continue;
      const childTop = { x: np.x + NODE_W / 2, y: np.y };
      for (const p of n.prereqs) {
        const pp = pos[p];
        if (!pp) continue;
        const parentBottom = { x: pp.x + NODE_W / 2, y: pp.y + NODE_H };
        const met = this._isResearched(p);
        g.beginPath();
        g.moveTo(parentBottom.x, parentBottom.y);
        const midY = (parentBottom.y + childTop.y) / 2;
        g.bezierCurveTo(parentBottom.x, midY, childTop.x, midY, childTop.x, childTop.y);
        g.strokeStyle = met ? paint(roles.you, 0.55) : paint(roles.calm, 0.28);
        g.lineWidth = met ? 2 : 1;
        g.stroke();
      }
    }

    // ---- nodes ----
    for (const n of nodes) {
      const p = pos[n.id];
      if (!p) continue;
      const stt = this._nodeState(n);
      const sel = n.id === this._selectedId;
      const hov = n.id === this._hoverId;

      g.beginPath();
      roundRect(g, p.x, p.y, NODE_W, NODE_H, 8);
      if (stt === 'researched') g.fillStyle = paint(roles.you, 0.16);
      else if (stt === 'available') g.fillStyle = paint(roles.surface, 0.95);
      else g.fillStyle = paint(roles.surface, 0.7);
      g.fill();

      g.lineWidth = sel ? 2.5 : 1.5;
      if (stt === 'researched') g.strokeStyle = roles.you;
      else if (stt === 'available') g.strokeStyle = sel || hov ? roles.paper : roles.goal;
      else g.strokeStyle = paint(roles.edge, 0.8);
      g.stroke();

      g.fillStyle = stt === 'locked' ? paint(roles.calm, 0.7) : roles.paper;
      g.font = canvasFontScaled(600, 13, zoom, 'body');
      g.textAlign = 'left'; g.textBaseline = 'top';
      wrapText(g, n.name, p.x + 9, p.y + 8, NODE_W - 18, 15, 2);

      g.font = canvasFontScaled(500, 13, zoom, 'data');
      if (stt === 'researched') {
        g.fillStyle = roles.you;
        g.textAlign = 'right'; g.textBaseline = 'bottom';
        g.fillText('RESEARCHED', p.x + NODE_W - 8, p.y + NODE_H - 7);
      } else {
        const cost = n.cost || {};
        g.textAlign = 'left'; g.textBaseline = 'bottom';
        g.fillStyle = roles.paper;
        g.fillText(fmtCr(cost.credits || 0), p.x + 9, p.y + NODE_H - 7);
        g.textAlign = 'right';
        g.fillText((cost.rp || 0) + ' RP', p.x + NODE_W - 8, p.y + NODE_H - 7);
      }
    }
  },

  _onCanvasMove(e) {
    const hit = this._hitTest(e);
    const id = hit ? hit.id : null;
    if (id !== this._hoverId) { this._hoverId = id; this._draw(); }
    this._canvas.style.cursor = hit ? 'pointer' : 'default';
  },

  _onCanvasClick(e) {
    const hit = this._hitTest(e);
    if (!hit) return;
    this._selectedId = hit.id;
    this._syncSidebar();
    this._draw();
  },

  _hitTest(e) {
    const rect = this._canvas.getBoundingClientRect();
    // Account for CSS transform scale: divide by zoom to get canvas-space coordinates
    const mx = (e.clientX - rect.left) / this._zoom;
    const my = (e.clientY - rect.top) / this._zoom;
    const pos = this._layout.positions;
    for (const n of this._nodes()) {
      const p = pos[n.id];
      if (!p) continue;
      if (mx >= p.x && mx <= p.x + NODE_W && my >= p.y && my <= p.y + NODE_H) return n;
    }
    return null;
  },

  _syncHeader() {
    const st = this._ctx.state;
    setText(this._els && this._els.cr, fmtCr((st.player && st.player.credits) || 0));
    setText(this._els && this._els.rp, ((st.player && st.player.researchPoints) || 0).toLocaleString());
    // Count only ids the live node table still knows: saves can carry ids of folded nodes.
    const known = new Set(this._nodes().map((n) => n.id));
    const researchedCount = this._researched().filter((id) => known.has(id)).length;
    setText(this._els && this._els.count, `${researchedCount}/${this._nodes().length}`);
  },

  _syncSidebar() {
    const sel = this._els && this._els.selected;
    const actions = this._els && this._els.actions;
    if (!sel || !actions) return;
    this._sidebarSig = this._sidebarSignature();
    if (!this._selectedId) {
      sel.innerHTML = `<div class="tt-hint">Select a node to inspect its cost, effects and prerequisites.</div>`;
      actions.innerHTML = '';
      return;
    }
    const n = this._layout.byId[this._selectedId] || this._nodes().find((x) => x.id === this._selectedId);
    if (!n) { sel.innerHTML = ''; actions.innerHTML = ''; return; }
    const st = this._ctx.state;
    const stt = this._nodeState(n);
    const cost = n.cost || {};
    const creds = (st.player && st.player.credits) || 0;
    const rp = (st.player && st.player.researchPoints) || 0;
    const canAfford = creds >= (cost.credits || 0) && rp >= (cost.rp || 0);
    const readiness = describeTechNodeReadiness(n, st, this._nodes());

    const prereqHtml = (n.prereqs && n.prereqs.length)
      ? n.prereqs.map((p) => {
          const pn = (this._layout.byId[p] || {}).name || p;
          const ok = this._isResearched(p);
          return `<div class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${escapeHtml(pn)}</div>`;
        }).join('')
      : `<div class="ok">No prerequisites</div>`;

    sel.innerHTML = `
      <div class="tt-sel-name">${escapeHtml(n.name)}</div>
      <div class="tt-branch">${escapeHtml(n.branch)} branch</div>
      <div class="tt-state is-${stt}">${stateLabel(stt)}</div>
      <div class="tt-cost">
        <span class="cr${creds >= (cost.credits || 0) ? '' : ' bad'}">${fmtCr(cost.credits || 0)} cr</span>
        <span class="rp${rp >= (cost.rp || 0) ? '' : ' bad'}">${cost.rp || 0} RP</span>
      </div>
      <div class="tt-unlocks">${formatUnlocks(n.unlocks)}</div>
      <div class="tt-prereq"><b>Prerequisites</b>${prereqHtml}</div>
    `;

    if (stt === 'researched') {
      actions.innerHTML = disabledActionHtml(readiness);
    } else if (stt === 'locked') {
      actions.innerHTML = disabledActionHtml(readiness);
    } else if (!canAfford) {
      actions.innerHTML = disabledActionHtml(readiness);
    } else {
      actions.innerHTML = `<button class="tt-unlock" data-act="unlock" data-why="${escapeHtml(readiness.actionTitle)}" aria-label="${escapeHtml(readiness.actionTitle)}">${escapeHtml(readiness.actionLabel)}</button>`;
    }
  },

  _onAction(act) {
    if (act !== 'unlock' || !this._selectedId) return;
    const n = this._nodes().find((x) => x.id === this._selectedId);
    if (!n) return;
    // ships handles ui:unlockTech (charges credits/RP, sets researchedNodes, emits tech:researched).
    this._ctx.bus.emit('ui:unlockTech', { nodeId: n.id });
    this._ctx.bus.emit('toast', { text: `Researching ${n.name}…`, kind: 'info', ttl: 3000 });
    // optimistic-free: refresh on next event-driven cycle; refresh now in case ships is synchronous
    this.refresh(this._ctx);
  },

  _researchSignature() {
    return this._researched().join(',');
  },

  _drawSignature() {
    const f = canvasFonts();
    return [this._researchSignature(), this._selectedId || '', this._hoverId || '', this._dpr, this._nodes().length, this._zoom, f.data, f.body].join('|');
  },

  _sidebarSignature() {
    const st = this._ctx.state;
    const player = st.player || {};
    return [
      this._selectedId || '',
      this._researchSignature(),
      Math.round(player.credits || 0),
      player.researchPoints || 0,
      this._nodes().length,
    ].join('|');
  },
};

// ---- helpers ----------------------------------------------------------------
function stateLabel(s) { return s === 'researched' ? 'RESEARCHED' : s === 'available' ? 'AVAILABLE' : 'LOCKED'; }

function disabledActionHtml(readiness) {
  const label = readiness && readiness.actionLabel || 'Unavailable';
  const title = readiness && readiness.actionTitle || label;
  // aria-disabled, not disabled: a disabled control cannot take focus, so the reason a locked node
  // is locked would be hover-only — the exact defect this sweep removes. The button carries no
  // data-act, so it stays inert; focus only reveals the why.
  return `<button aria-disabled="true" tabindex="0" data-why="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${escapeHtml(label)}</button>`;
}

function formatUnlocks(u) {
  if (!u) return '<b>Effects:</b> —';
  const parts = [];
  if (u.ships && u.ships.length) parts.push(`<b>Ships:</b> ${u.ships.map(unlockDisplayName).join(', ')}`);
  if (u.modules && u.modules.length) parts.push(`<b>Modules:</b> ${u.modules.map(unlockDisplayName).join(', ')}`);
  if (u.efficiency) {
    const e = Object.entries(u.efficiency).map(([k, v]) => `${k} ${(v > 0 ? '+' : '') + Math.round(v * 100)}%`);
    parts.push(`<b>Bonuses:</b> ${e.join(', ')}`);
  }
  if (u.droneTierCap != null) parts.push(`<b>Drone tier cap:</b> ${u.droneTierCap}`);
  if (u.npcTraderHiring) parts.push(`<b>Unlocks:</b> NPC trader hiring`);
  if (u.outpostConstruction) parts.push(`<b>Unlocks:</b> outpost construction`);
  if (u.extraDronePerBay) parts.push(`<b>+${u.extraDronePerBay}</b> drone per bay`);
  if (u.flags && u.flags.length) parts.push(`<b>Flags:</b> ${u.flags.map(escapeHtml).join(', ')}`);
  return parts.length ? parts.join('<br>') : '<b>Effects:</b> —';
}

function cleanId(id) {
  return escapeHtml(String(id).replace(/^(ship_|mod_|wpn_)/, '').replace(/_/g, ' '));
}

export function unlockDisplayName(id) {
  const authored = UNLOCK_NAME_BY_ID.get(id);
  return authored ? escapeHtml(authored) : cleanId(id);
}

function fmtCr(v) {
  v = Math.round(v || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  return v.toLocaleString();
}

function roundRect(g, x, y, w, h, r) {
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrapText(g, text, x, y, maxW, lineH, maxLines) {
  const words = String(text).split(' ');
  let line = '', lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y); y += lineH; line = words[i]; lines++;
      if (lines >= maxLines - 1) {
        // last allowed line: fit the remainder with ellipsis if needed
        let rest = words.slice(i).join(' ');
        while (g.measureText(rest + '…').width > maxW && rest.length) rest = rest.slice(0, -1);
        g.fillText(rest + (rest !== words.slice(i).join(' ') ? '…' : ''), x, y);
        return;
      }
    } else {
      line = test;
    }
  }
  if (line) g.fillText(line, x, y);
}
