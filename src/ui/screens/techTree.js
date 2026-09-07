// src/ui/screens/techTree.js — Tech-tree progression screen (ARCHITECTURE §5, spec 09).
// Draws the TECH_NODES DAG to a <canvas>: prereq lines, node state (researched / available /
// locked), cost (credits + RP). Click a node -> the side column -> Unlock emits ui:unlockTech{nodeId}
// (ships handles it). READ-ONLY on state; emits intents only.
//
// The sheet's line (design/frontend/direction/DIRECTION_SHEET.md, tech tree, Task D §3.4): the lanes
// drawn as hairline paths on the sky; nodes as words; the selected node's name at screen-title size
// with its cost as a number and Unlock as a word. Built on the frontend kit (styles/kit.css,
// src/ui/kit/); this file owns no CSS. The canvas is transparent over the sky and paints only the
// kit's colours (KIT_INK below — the one place a hex literal is allowed here, because it paints a
// canvas, not CSS).
//
// Export: techTreeScreen  (id 'techTree'). No 'three' import.

import { TECH_NODES } from '../../data/tech.js';
import { SHIPS } from '../../data/ships.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { BODY_MODULES } from '../../data/claimableBodies.js';
import { escapeHtml } from '../comms.js';
import { el, hero, settle, cue } from '../kit/index.js';

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

// Columns are prerequisite depth (a chain reads left→right), lanes are branches (a band reads
// top→bottom), so every edge points right and stays inside its lane — the one cross-branch
// prerequisite (drives → flagship command) is the only diagonal. The previous layout put depth on
// the vertical axis inside each band and siblings across, which drew the combat branch's fan-out
// as a tangle of curves crossing the whole canvas and left two thirds of the frame empty.
// NODE_W × NODE_H is each node's word box: the hit-test rectangle and the space its two name lines
// and cost line occupy. Nothing is drawn around it.
const NODE_W = 168, NODE_H = 58, COL_GAP = 56, ROW_GAP = 16, PAD_X = 32, PAD_Y = 40;
const LANE_GAP = 34;          // vertical space between branch lanes (holds the lane label)
const LANE_LABEL_H = 22;      // label sits inside the lane's top inset
const NAME_LINE_H = 20;       // canvas line height for the node's name at body size (16 px × 1.25)

// The kit's colours for the canvas (styles/kit.css §3 tokens): bone at 100 / 62 / 38 / 14 %, the
// signal gold, the wanted red, good, ink. Canvas 2D cannot read a CSS custom property, so the values
// are spelled here — the only hex allowed in this file. Every fillStyle/strokeStyle below is one of these.
const KIT_INK = Object.freeze({
  bone: '#eae6df',
  bone62: 'rgba(234,230,223,.62)',
  bone38: 'rgba(234,230,223,.38)',
  hair: 'rgba(234,230,223,.14)',
  signal: '#f2b950',
  red: '#ff4d3d',
  good: '#9bd8a0',
  ink: '#0a0b0d',
});
// The kit's text face (styles/kit.css --k-text), spelled out because ctx.font cannot resolve var().
const KIT_TEXT_FACE = '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * A canvas font shorthand in the kit face for a canvas whose element is scaled by `zoom`.
 * The 12 px floor applies to the size the player sees, then divides (a scaled element draws
 * `size/zoom` at `size` screen pixels), the same rule canvasFonts.js documents.
 */
function kitFont(weight, screenPx, zoom) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const size = Math.max(12, Number.isFinite(screenPx) ? screenPx : 12) / z;
  return weight + ' ' + size + 'px ' + KIT_TEXT_FACE;
}

function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }

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
  // One lane per branch (a branch the data does not use takes no room). Inside a lane, nodes bucket
  // by depth into columns; each column is ordered by the mean row of its in-lane prerequisites so
  // a chain reads straight across and siblings fan out beside each other instead of crossing.
  const laneOf = (n) => (BRANCH_INDEX[n.branch] != null ? n.branch : BRANCHES[BRANCHES.length - 1].id);
  const lanes = {};
  for (const b of BRANCHES) lanes[b.id] = { cols: {}, rows: 0 };
  for (const n of nodes) {
    const d = depth(n.id);
    const lane = lanes[laneOf(n)];
    (lane.cols[d] || (lane.cols[d] = [])).push(n);
  }
  const layout = {}; // id -> { depth, slot, lane }
  for (const b of BRANCHES) {
    const lane = lanes[b.id];
    const depths = Object.keys(lane.cols).map(Number).sort((p, q) => p - q);
    for (const d of depths) {
      const col = lane.cols[d];
      const keyed = col.map((n, i) => {
        const parents = (n.prereqs || []).map((p) => layout[p]).filter((l) => l && l.lane === b.id);
        // Roots and cross-lane children keep declaration order, after the barycentred children.
        const k = parents.length ? parents.reduce((s, l) => s + l.slot, 0) / parents.length : 1e6 + i;
        return { n, i, k };
      });
      keyed.sort((p, q) => (p.k - q.k) || (p.i - q.i));
      keyed.forEach(({ n }, slot) => { layout[n.id] = { depth: d, slot, lane: b.id }; });
      lane.rows = Math.max(lane.rows, col.length);
    }
  }
  const branchTop = {};   // lane label y (the lane's top inset)
  const laneBottom = {};  // last word box's bottom edge in the lane
  const positions = {};
  let y = PAD_Y;
  let maxX = 0;
  for (const b of BRANCHES) {
    const lane = lanes[b.id];
    if (!lane.rows) continue;
    branchTop[b.id] = y;
    const cardsTop = y + LANE_LABEL_H;
    for (const d of Object.keys(lane.cols)) {
      for (const n of lane.cols[d]) {
        const l = layout[n.id];
        positions[n.id] = {
          x: PAD_X + l.depth * (NODE_W + COL_GAP),
          y: cardsTop + l.slot * (NODE_H + ROW_GAP),
        };
        maxX = Math.max(maxX, positions[n.id].x + NODE_W);
      }
    }
    laneBottom[b.id] = cardsTop + lane.rows * (NODE_H + ROW_GAP) - ROW_GAP;
    y = laneBottom[b.id] + LANE_GAP;
  }
  return { byId, positions, width: maxX + PAD_X, height: y - LANE_GAP + PAD_Y, branchTop, laneBottom };
}

/** A hero block in the corner whose number carries a data hook (`data-cr`, `data-rp`, `data-count`). */
function cornerHero(parent, word, hook) {
  const block = hero('0', word);
  const n = block.querySelector('.k-hero__n');
  n.setAttribute(hook, '');
  parent.appendChild(block);
  return n;
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
  _regions: null,

  mount(rootEl, ctx) {
    this._ctx = ctx;
    this._root = rootEl;
    // `#sf-techtree` stays as an inert hook (probe-frontend-unblind-capture reads `#sf-techtree canvas`).
    rootEl.id = 'sf-techtree';
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu', 'sf-menu-wide', 'sf-techtree');
    rootEl.classList.add('k-screen');
    rootEl.dataset.kReady = '0';
    rootEl.setAttribute('aria-label', 'Research');

    // .k-title — "Research"; the selected node's branch as the second line.
    const head = el('header', 'k-title');
    head.appendChild(el('h1', 'k-display k-t-title', 'Research'));
    const branchLine = el('p', 'k-t-emph k-62', 'Select a node');
    head.appendChild(branchLine);
    rootEl.appendChild(head);

    // .k-corner — credits, research points, unlocked n/N as three hero numbers in a column.
    const corner = el('div', 'k-corner');
    corner.setAttribute('aria-label', 'Research resources');
    const crEl = cornerHero(corner, 'credits', 'data-cr');
    const rpEl = cornerHero(corner, 'research points', 'data-rp');
    const countEl = cornerHero(corner, 'unlocked', 'data-count');
    setText(countEl, '0/' + TECH_NODES.length);
    rootEl.appendChild(corner);

    // .k-stage — a two-column kit panel: the canvas (scrolling) on the left, the selected node's
    // column on the right. `k-span` takes the stage across the hang column too: the DAG wants the width.
    const stage = el('div', 'k-stage k-span k-panel k-panel--split');
    const scrollEl = el('div', 'tt-scroll k-stage--scroll');
    // The kit's scroll rule scrolls one axis (overflow: hidden auto). Panning a zoomed tree needs
    // both; this is the pan behaviour the screen has always had, not a look.
    scrollEl.style.overflowX = 'auto';
    const canvas = el('canvas');
    canvas.setAttribute('aria-label', 'Tech tree');
    canvas.style.display = 'block';
    scrollEl.appendChild(canvas);
    // The zoom badge pins to the stage's bottom-left (the kit's stage caption slot) and does not scroll.
    const zoomBadge = el('div', 'tt-zoom-badge k-stage__foot k-t-fine k-38', '100% zoom');
    zoomBadge.setAttribute('aria-live', 'off');
    scrollEl.appendChild(zoomBadge);
    stage.appendChild(scrollEl);

    const side = el('div', 'tt-side k-stage--scroll');
    side.setAttribute('aria-label', 'Selected node');
    const selected = el('div');
    selected.setAttribute('data-sel', '');
    const actions = el('div');
    actions.setAttribute('data-actions', '');
    side.appendChild(selected);
    side.appendChild(actions);
    stage.appendChild(side);
    rootEl.appendChild(stage);

    // .k-foot — the legend as three static words in their strengths; no swatches.
    const foot = el('footer', 'k-foot');
    foot.setAttribute('aria-label', 'Legend');
    foot.appendChild(el('span', 'k-word--fine k-62', 'available'));
    foot.appendChild(el('span', 'k-word--fine', 'researched'));
    foot.appendChild(el('span', 'k-word--fine k-38', 'locked'));
    rootEl.appendChild(foot);

    this._regions = { head, corner, stage, foot };
    this._canvas = canvas;
    this._g = canvas.getContext('2d');
    this._layout = buildLayout(this._nodes());
    this._els = { cr: crEl, rp: rpEl, count: countEl, branch: branchLine, selected, actions };
    this._zoomBadge = zoomBadge;
    this._zoom = 1.0;

    canvas.addEventListener('click', (e) => this._onCanvasClick(e));
    canvas.addEventListener('mousemove', (e) => this._onCanvasMove(e));
    canvas.addEventListener('mouseleave', () => { this._hoverId = null; this._draw(); });

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

      this._applyZoom();

      // After scaling, adjust scroll to keep cursor-point stable
      scrollEl.scrollLeft = mx * ratio - (ev.clientX - rect.left);
      scrollEl.scrollTop = my * ratio - (ev.clientY - rect.top);
    }, { passive: false });

    actions.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (btn) this._onAction(btn.dataset.act);
    });

    // Web fonts land after first paint; repaint the words in the real face when they do.
    if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', () => this._draw());
    }
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._sizeCanvas();
    this._fitZoom();
    this.refresh(this._ctx);
    cue('open');
    if (typeof requestAnimationFrame === 'function' && this._regions) {
      try {
        settle(this._regions.head, { from: 'top', state: 'techTree:open' });
        settle(this._regions.corner, { from: 'top', state: 'techTree:open' });
        settle(this._regions.stage, { from: 'right', state: 'techTree:open' });
        settle(this._regions.foot, { from: 'bottom', state: 'techTree:open' });
      } catch (e) { /* motion is cosmetic */ }
    }
    if (this._root) this._root.dataset.kReady = '1';
  },

  onHide() { cue('close'); /* cached DOM retained */ },

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
    this._canvas.width = Math.round(lw * this._dpr);
    this._canvas.height = Math.round(lh * this._dpr);
    this._applyZoom();
  },

  /**
   * Scale the canvas ELEMENT to the zoom (layout box and paint scale together). The previous CSS
   * transform left the layout box at 100%, so a zoomed-out view scrolled over blank canvas.
   * Hit-testing already divides by _zoom, and kitFont compensates the drawn font sizes,
   * so both stay correct under element scaling.
   */
  _applyZoom() {
    if (!this._canvas || !this._layout) return;
    const zoom = this._zoom || 1;
    this._canvas.style.width = Math.round(this._layout.width * zoom) + 'px';
    this._canvas.style.height = Math.round(this._layout.height * zoom) + 'px';
    setText(this._zoomBadge, Math.round(zoom * 100) + '% zoom');
  },

  /**
   * First paint fits the whole DAG to the scroll viewport when that stays legible, and never goes
   * past 100%. The floor is 0.9: below that the 12px type floor makes canvas fonts physically
   * wider than the lines the node words reserve (wrapText NAME_LINE_H), so text would overlap —
   * better to keep 100% and scroll. The branch-band layout already fits at 100% in normal windows;
   * this only absorbs slightly narrow ones.
   */
  _fitZoom() {
    if (!this._root || !this._layout) return;
    const scrollEl = this._root.querySelector('.tt-scroll');
    if (!scrollEl || !(scrollEl.clientWidth > 0)) return;
    const fitW = scrollEl.clientWidth / Math.max(1, this._layout.width);
    const fitH = scrollEl.clientHeight > 0 ? scrollEl.clientHeight / Math.max(1, this._layout.height) : 1;
    const fit = Math.min(1, fitW, fitH);
    this._zoom = Math.max(0.9, Math.floor(fit * 100) / 100);
    this._applyZoom();
  },

  /** The strength a node's name is drawn at: focus is strength, never a frame. */
  _nodeInk(stt, sel, hov) {
    if (sel) return KIT_INK.signal;
    if (stt === 'researched') return KIT_INK.bone;
    if (stt === 'available') return hov ? KIT_INK.bone : KIT_INK.bone62;
    return hov ? KIT_INK.bone62 : KIT_INK.bone38;
  },

  _draw() {
    const g = this._g, cv = this._canvas;
    if (!g || !this._layout) return;
    this._drawSig = this._drawSignature();
    g.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    const w = cv.width / this._dpr, h = cv.height / this._dpr;
    g.clearRect(0, 0, w, h); // transparent: the sky is the ground

    const nodes = this._nodes();
    const pos = this._layout.positions;
    const zoom = this._zoom || 1;

    // Lane labels sit in each lane's top inset at data size, 38 %; a hairline closes the lane below
    // its last word. Branch identity is lane + word, never hue.
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.lineWidth = 1;
    for (const b of BRANCHES) {
      const top = this._layout.branchTop[b.id];
      if (top == null) continue;
      g.fillStyle = KIT_INK.bone38;
      g.font = kitFont(400, 14, zoom);
      g.fillText(b.label, PAD_X, top + 2);
      const bottom = this._layout.laneBottom[b.id];
      if (bottom != null && bottom + LANE_GAP < this._layout.height - PAD_Y) {
        const y = Math.round(bottom + LANE_GAP / 2) + 0.5;
        g.beginPath();
        g.moveTo(PAD_X, y);
        g.lineTo(this._layout.width - PAD_X, y);
        g.strokeStyle = KIT_INK.hair;
        g.stroke();
      }
    }

    // ---- prereq edges: parent's right edge → child's left edge, always pointing right, as hairlines ----
    g.strokeStyle = KIT_INK.hair;
    for (const n of nodes) {
      if (!n.prereqs) continue;
      const np = pos[n.id];
      if (!np) continue;
      const childLeft = { x: np.x, y: np.y + NODE_H / 2 };
      for (const p of n.prereqs) {
        const pp = pos[p];
        if (!pp) continue;
        const parentRight = { x: pp.x + NODE_W, y: pp.y + NODE_H / 2 };
        const reach = Math.max(COL_GAP * 0.55, (childLeft.x - parentRight.x) * 0.5);
        g.beginPath();
        g.moveTo(parentRight.x, parentRight.y);
        g.bezierCurveTo(parentRight.x + reach, parentRight.y, childLeft.x - reach, childLeft.y, childLeft.x, childLeft.y);
        g.stroke();
      }
    }

    // ---- nodes as words: the name at body size in its strength, the cost (or "researched") at data size, 38 % ----
    for (const n of nodes) {
      const p = pos[n.id];
      if (!p) continue;
      const stt = this._nodeState(n);
      const sel = n.id === this._selectedId;
      const hov = n.id === this._hoverId;

      g.fillStyle = this._nodeInk(stt, sel, hov);
      g.font = kitFont(sel ? 500 : 400, 16, zoom);
      g.textAlign = 'left'; g.textBaseline = 'top';
      wrapText(g, n.name, p.x, p.y, NODE_W, NAME_LINE_H, 2);

      g.font = kitFont(400, 14, zoom);
      g.fillStyle = KIT_INK.bone38;
      g.textBaseline = 'bottom';
      if (stt === 'researched') {
        g.fillText('researched', p.x, p.y + NODE_H);
      } else {
        const cost = n.cost || {};
        g.fillText(fmtCr(cost.credits || 0) + ' cr · ' + (cost.rp || 0) + ' RP', p.x, p.y + NODE_H);
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
    cue('move');
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
      setText(this._els.branch, 'Select a node');
      sel.innerHTML = `<p class="k-empty">Select a node to inspect its cost, effects and prerequisites.</p>`;
      actions.innerHTML = '';
      return;
    }
    const n = this._layout.byId[this._selectedId] || this._nodes().find((x) => x.id === this._selectedId);
    if (!n) { sel.innerHTML = ''; actions.innerHTML = ''; return; }
    const st = this._ctx.state;
    const cost = n.cost || {};
    const readiness = describeTechNodeReadiness(n, st, this._nodes());
    const branch = BRANCHES.find((b) => b.id === n.branch);
    setText(this._els.branch, (branch ? branch.label : String(n.branch || '')) + ' branch');

    const prereqHtml = (n.prereqs && n.prereqs.length)
      ? `<ul class="k-rows" aria-label="Prerequisites">` + n.prereqs.map((p) => {
          const pn = (this._layout.byId[p] || {}).name || p;
          const ok = this._isResearched(p);
          return `<li class="k-row k-row--static"><span class="k-row__name">${escapeHtml(pn)}</span><span class="k-row__sub">${ok ? 'researched' : 'not yet researched'}</span></li>`;
        }).join('') + `</ul>`
      : `<p class="k-sentence">No prerequisites.</p>`;
    const unlockRows = unlockRowsHtml(n.unlocks);
    const effects = formatUnlocks(n.unlocks);

    sel.innerHTML = `
      <h2 class="k-display k-t-title">${escapeHtml(n.name)}</h2>
      <div class="k-hero k-hero--signal"><div class="k-hero__n">${fmtCr(cost.credits || 0)}</div><div class="k-hero__w">credits</div></div>
      ${cost.rp ? `<p class="k-sentence">and ${escapeHtml(String(cost.rp))} research points</p>` : ''}
      ${effects || !unlockRows ? `<p class="k-sentence">${effects || 'No listed effects.'}</p>` : ''}
      <hr class="k-rule">
      <div class="k-caps">Requires</div>
      ${prereqHtml}
      ${unlockRows ? `<div class="k-caps">Unlocks</div><ul class="k-rows" aria-label="Unlocks">${unlockRows}</ul>` : ''}
      <p class="k-sentence k-sentence--emph">${escapeHtml(stateSentence(readiness))}</p>
    `;

    if (readiness.state === 'available') {
      actions.innerHTML = `<button class="k-word k-word--emph k-word--primary tt-unlock" data-act="unlock" data-why="${escapeHtml(readiness.actionTitle)}" aria-label="${escapeHtml(readiness.actionTitle)}">Unlock</button>`;
    } else {
      actions.innerHTML = disabledActionHtml(readiness);
    }
  },

  _onAction(act) {
    if (act !== 'unlock' || !this._selectedId) return;
    const n = this._nodes().find((x) => x.id === this._selectedId);
    if (!n) return;
    cue('confirm');
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
    return [this._researchSignature(), this._selectedId || '', this._hoverId || '', this._dpr, this._nodes().length, this._zoom].join('|');
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
/** The node's state as one sentence; the disabled word beneath it names the exact blocker. */
function stateSentence(readiness) {
  const s = readiness && readiness.state;
  if (s === 'researched') return 'Researched.';
  if (s === 'locked') return 'Locked.';
  if (s === 'funding') return 'Available, not yet affordable.';
  return 'Available now.';
}

function disabledActionHtml(readiness) {
  const label = readiness && readiness.actionLabel || 'Unavailable';
  const title = readiness && readiness.actionTitle || label;
  // aria-disabled, not disabled: a disabled control cannot take focus, so the reason a locked node
  // is locked would be hover-only — the exact defect this sweep removes. The button carries no
  // data-act, so it stays inert; focus only reveals the why.
  return `<button class="k-word k-word--emph" aria-disabled="true" tabindex="0" data-why="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${escapeHtml(label)}</button>`;
}

/** The ships and modules a node unlocks, as static kit rows (name · kind). */
function unlockRowsHtml(u) {
  if (!u) return '';
  const row = (name, kind) => `<li class="k-row k-row--static"><span class="k-row__name">${name}</span><span class="k-row__sub">${kind}</span></li>`;
  const rows = [];
  if (u.ships && u.ships.length) rows.push(...u.ships.map(unlockDisplayName).map((name) => row(name, 'ship')));
  if (u.modules && u.modules.length) rows.push(...u.modules.map(unlockDisplayName).map((name) => row(name, 'module')));
  return rows.join('');
}

/** The node's effects beyond its unlock rows, as one sentence (escaped; '' when there are none). */
function formatUnlocks(u) {
  if (!u) return '';
  const parts = [];
  if (u.efficiency) {
    const e = Object.entries(u.efficiency).map(([k, v]) => `${escapeHtml(k)} ${(v > 0 ? '+' : '') + Math.round(v * 100)}%`);
    parts.push(`Bonuses: ${e.join(', ')}`);
  }
  if (u.droneTierCap != null) parts.push(`Drone tier cap ${escapeHtml(String(u.droneTierCap))}`);
  if (u.npcTraderHiring) parts.push('Unlocks NPC trader hiring');
  if (u.outpostConstruction) parts.push('Unlocks outpost construction');
  if (u.extraDronePerBay) parts.push(`+${escapeHtml(String(u.extraDronePerBay))} drone per bay`);
  if (u.flags && u.flags.length) parts.push(`Flags: ${u.flags.map(escapeHtml).join(', ')}`);
  return parts.length ? parts.join(' · ') + '.' : '';
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
