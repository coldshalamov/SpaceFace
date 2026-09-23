// src/ui/screens/techTree.js — Tech-tree progression screen (ARCHITECTURE §5, spec 09).
// PRINTED AND LIT (design/frontend/ONE_PHOTOGRAPH.md §9.3, "traces of light"): the tree is drawn on
// one canvas as printed fields joined by traces. A node's state is its form and its light, never a
// grey: researched = a lit field whose cut corner glows; available = a field outlined in the lamp;
// locked = a dim hairline. The traces run between them as circuit lines, and the selected node's
// path back to its roots lights 2px lamp with bloom, so the arrival frame already shows what the
// default choice needs. The detail pane opens on the first node you can research now.
// Click a node -> the side column -> Unlock emits ui:unlockTech{nodeId} (ships handles it).
// READ-ONLY on state; emits intents only. A labelled node selector is the keyboard and
// screen-reader equivalent of canvas picking. This file owns no CSS (the screen's look is the
// RESEARCH section of src/ui/deckplate/screens.js). ctx.font cannot resolve var(), so the canvas
// faces are spelled below; colours are read from the Deckplate tokens once per show, with the
// token values spelled as the fallback.
//
// Export: techTreeScreen  (id 'techTree'). No 'three' import.

import { TECH_NODES } from '../../data/tech.js';
import { SHIPS } from '../../data/ships.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { BODY_MODULES } from '../../data/claimableBodies.js';
import { escapeMarkup as escapeHtml } from '../views/identity.js';
import { entitySpanHtml } from '../entityResolver.js';
import { el, hero, settle, cue, reducedMotion } from '../kit/index.js';
import {
  wrapCanvasLines,
  techTreeNameLineBudget,
} from '../../localization/layout.js';
import { injectDeckplate } from '../deckplate/index.js';
import { capPins, platePins, channelPins } from '../kit/computedMaterial.js';

// Branch -> lane. Colour is by MEANING (researched / available / locked), never by branch.
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

// Columns are prerequisite depth (a chain reads left→right); each branch is a lane. Lanes pack onto
// SHELVES: a lane joins the shelf above when the shelf still has the width (combat alone is six
// columns; industry and drives share the next shelf; logistics takes the third), so the whole tree
// fits the frame instead of four stacked bands running off the bottom. Each lane carries its name
// and count in a gutter on its left. Geometry is in canvas px at 100% zoom.
// NODE_W is the name's measure (localization/layout.js TECH_TREE_NODE_W wraps to the same width).
const NODE_W = 168;
const PLATE_PAD_X = 12;
const PLATE_PAD_Y = 6;
const PLATE_W = NODE_W + PLATE_PAD_X * 2;
const COL_GAP = 40;           // between plates in a lane: the trace bus runs down its middle
const ROW_GAP = 6;            // between plates in a column
const NAME_LINE_H = 20;       // the name at 16 px
const COST_LINE_H = 16;       // the cost at 12 px
const LABEL_W = 116;          // each lane's gutter: its name and its count
const LANE_GAP_X = 24;        // between two lanes sharing a shelf
const SHELF_GAP = 30;         // between shelves: the corridor a cross-lane trace runs along
const PAD = 14;
const CUT = 10;               // the 45° cut on a node's top-right corner (--dp-cut)
const TRACE_R = 6;            // a trace turns a rounded corner
const MIN_ZOOM = 0.75;        // below this the 12 px floor makes the words outgrow their fields
const MAX_ZOOM = 2;

const FH_KEY = {
  primary: { minW: '132px', minH: '44px', pad: '0 16px', font: '16px', width: '18px' },
  legend: { minW: '72px', minH: '32px', pad: '0 10px', font: '12px', width: '14px' },
};

function forcedColorsActive() {
  return typeof matchMedia === 'function' && matchMedia('(forced-colors: active)').matches;
}
// The printed controls are drawn by the Deckplate bridge (src/ui/deckplate/screens.js, FH_BRIDGE),
// so pins keep geometry, type and colour only. Forced colours keeps every pin: there the system
// palette is the material.
const DP_MATERIAL_PROP = /^(border-image|border-style$|border-width$|background)/;
function pin(node, props) {
  if (!node || !node.style || typeof node.style.setProperty !== 'function') return node;
  const materialsToBridge = !forcedColorsActive();
  for (const name of Object.keys(props)) {
    if (materialsToBridge && DP_MATERIAL_PROP.test(name)) continue;
    node.style.setProperty(name, props[name], 'important');
  }
  return node;
}
function installShell(root) {
  root.classList.add('fh-shell');
  pin(root, { background: 'transparent', 'border-width': '0', 'box-shadow': 'none' });
}
function paintMarking(node) {
  if (!node) return node;
  node.classList.add('fh-title');
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 900, 'wdth' 125",
    'letter-spacing': 'var(--fh-track-display)',
    'text-transform': 'uppercase',
    'line-height': '0.9',
    color: 'var(--fh-text)',
  });
}
function paintLegend(node, lit = false) {
  if (!node) return node;
  node.classList.add('fh-legend');
  if (!node.getAttribute('data-fh-lit')) node.setAttribute('data-fh-lit', lit ? 'on' : 'off');
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 600, 'wdth' 62",
    'letter-spacing': 'var(--fh-track-legend)',
    'text-transform': 'uppercase',
    'font-size': 'var(--fh-size-fine)',
    color: lit ? 'var(--fh-legend-lit)' : 'var(--fh-legend-rest)',
    margin: '0',
  });
}
function paintBody(node) {
  if (!node) return node;
  node.classList.add('fh-body');
  return pin(node, {
    'font-family': 'var(--fh-face-text)',
    'font-size': 'var(--fh-size-body)',
    color: 'var(--fh-text-resting)',
    margin: '0',
  });
}
function paintPlate(node, variant = 'sunk', extra = {}) {
  if (!node) return node;
  node.classList.add('fh-plate', variant === 'edge' ? 'fh-plate--edge' : 'fh-plate--sunk');
  if (forcedColorsActive()) {
    return pin(node, {
      'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
      background: 'transparent', ...extra,
    });
  }
  return pin(node, {
    ...platePins(variant, variant === 'edge' ? '16px' : '24px'),
    'box-sizing': 'border-box',
    padding: '10px 14px',
    ...extra,
  });
}
function paintInput(input) {
  if (!input) return input;
  input.classList.add('fh-input', 'k-input');
  const apply = (state) => {
    if (forcedColorsActive()) {
      pin(input, { 'border-image-source': 'none', 'border-bottom': '1px solid CanvasText', background: 'transparent' });
      return;
    }
    pin(input, {
      ...channelPins(state, '12px'),
      color: 'var(--fh-text)',
      'min-height': '40px',
      padding: '0 8px',
      'box-sizing': 'border-box',
    });
  };
  apply('rest');
  if (input.dataset.fhBound !== '1') {
    input.dataset.fhBound = '1';
    input.addEventListener('focus', () => apply('focus'));
    input.addEventListener('blur', () => apply('rest'));
  }
  return input;
}
function paintKey(button, kind = 'legend') {
  if (!button) return button;
  const spec = FH_KEY[kind] || FH_KEY.legend;
  button.classList.add('k-word', 'fh-key', 'fh-key--' + kind);
  const apply = (state) => {
    if (forcedColorsActive()) {
      pin(button, {
        'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
        background: 'transparent', color: 'CanvasText',
      });
      return;
    }
    pin(button, {
      display: 'inline-flex',
      width: 'max-content',
      'max-width': '100%',
      'min-width': spec.minW,
      'min-height': spec.minH,
      ...(kind === 'legend' ? { padding: spec.pad } : {}),
      'font-size': spec.font,
      'font-family': 'var(--fh-face-display)',
      'font-variation-settings': "'wght' 600, 'wdth' 62",
      'letter-spacing': 'var(--fh-track-legend)',
      'text-transform': 'uppercase',
      'justify-content': 'center',
      'align-items': 'center',
      'box-sizing': 'border-box',
      background: 'transparent',
      color: 'var(--fh-text)',
      ...capPins(kind, state, spec.width),
    });
  };
  const sync = () => {
    const disabled = button.getAttribute('aria-disabled') === 'true' || button.disabled;
    apply(disabled ? 'disabled' : 'rest');
  };
  button._fhSync = sync;
  if (button.dataset.fhBound !== '1') {
    button.dataset.fhBound = '1';
    button.addEventListener('pointerenter', () => {
      if (button.getAttribute('aria-disabled') === 'true' || button.disabled) return;
      apply('hover');
    });
    button.addEventListener('pointerleave', sync);
    button.addEventListener('pointerdown', () => {
      if (button.getAttribute('aria-disabled') === 'true' || button.disabled) return;
      apply('pressed');
    });
    button.addEventListener('pointerup', sync);
    button.addEventListener('focus', () => {
      if (button.getAttribute('aria-disabled') === 'true' || button.disabled) return;
      apply('hover');
    });
    button.addEventListener('blur', sync);
  }
  sync();
  return button;
}

// Canvas 2D cannot read a CSS custom property through ctx.fillStyle, so the Deckplate tokens are read
// once per show (readInks) and these values — the tokens as spelled in deckplate/tokens.js — are the
// fallback. The only colour literals in this file.
const INK_FALLBACK = Object.freeze({
  ink: '#e8e2d4',
  inkDim: '#b7b4a6',
  // the quiet tier that still clears 4.5:1 on its field: a locked node names itself at this
  inkMute: '#b0aea6',
  lamp: '#f2b950',
  lampHot: '#ffd98c',
  lampDim: '#8a6b3a',
  lampBloom: 'rgba(242,185,80,0.45)',
  phos: '#dfeeff',
  phosDim: '#9fb4c8',
  field: 'rgba(10,12,16,0.86)',
  fieldLocked: 'rgba(10,12,16,0.62)',
  fieldInk: 'rgba(232,226,212,0.08)',
  fieldLit: 'rgba(232,226,212,0.13)',
  rule: 'rgba(232,226,212,0.16)',
  ruleHi: 'rgba(232,226,212,0.24)',
});
const INK_TOKENS = Object.freeze({
  ink: '--dp-ink', inkDim: '--dp-ink-dim', inkMute: '--dp-ink-mute',
  lamp: '--dp-lamp', lampHot: '--dp-lamp-hot', lampDim: '--dp-lamp-dim',
  phos: '--dp-phos', phosDim: '--dp-phos-dim',
});
function readInks(root) {
  const inks = { ...INK_FALLBACK };
  if (!root || typeof getComputedStyle !== 'function') return inks;
  try {
    const cs = getComputedStyle(root);
    for (const [key, prop] of Object.entries(INK_TOKENS)) {
      const value = cs.getPropertyValue(prop).trim();
      if (/^#[0-9a-f]{3,8}$/i.test(value) || /^rgba?\(/i.test(value)) inks[key] = value;
    }
  } catch (_) { /* the fallback palette is the token palette */ }
  return inks;
}
const FORCED_INKS = Object.freeze({
  ink: 'CanvasText', inkDim: 'CanvasText', inkMute: 'GrayText', lamp: 'Highlight', lampHot: 'Highlight',
  lampDim: 'CanvasText', lampBloom: 'transparent', phos: 'CanvasText', phosDim: 'CanvasText',
  field: 'Canvas', fieldLocked: 'Canvas', fieldInk: 'Canvas', fieldLit: 'Canvas', rule: 'GrayText', ruleHi: 'CanvasText',
});

// The kit's text face (styles/kit.css --k-text / --dp-face-read), spelled out because ctx.font
// cannot resolve var(). Lane names use the etched display face.
const KIT_TEXT_FACE = '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const KIT_DISPLAY_FACE = 'Archivo, system-ui, sans-serif';

/**
 * A canvas font for a canvas drawn at `zoom`. The word is designed at `designPx` at 100% and scales
 * with the tree, but never below the 12 px floor on screen: the size the player sees is
 * max(12, designPx * zoom), and the canvas is drawn in 100% units, so that is divided back out.
 * Between 100% and MIN_ZOOM a 16 px name keeps its proportion to its field exactly.
 */
function kitFont(weight, designPx, zoom, face = KIT_TEXT_FACE) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const screenPx = Math.max(12, (Number.isFinite(designPx) ? designPx : 12) * z);
  return weight + ' ' + (screenPx / z) + 'px ' + face;
}
function setSpacing(g, px) {
  if (g && 'letterSpacing' in g) g.letterSpacing = px + 'px';
}

function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }

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

/** The longest name, wrapped to the node measure at 16 px, in lines (the canvas measures it). */
function measuredNameLines(nodes, measure, budget) {
  if (typeof measure !== 'function') return budget;
  let lines = 1;
  for (const n of nodes) lines = Math.max(lines, wrapCanvasLines(measure, n.name, NODE_W).length);
  return Math.max(1, Math.min(budget, lines));
}

/**
 * Build once per locale: id -> node, lane and shelf placement, plate rectangles.
 * `nameLines` is how many name lines every node reserves (the longest name decides; the locale's
 * budget is the ceiling), so an English tree is one line per node and a growth locale takes more.
 */
function buildLayout(nodes, { nameLines = 2 } = {}) {
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
  // Inside a lane, nodes bucket by depth into columns; each column is ordered by the mean row of its
  // in-lane prerequisites so a chain reads straight across and siblings fan out beside each other.
  const laneOf = (n) => (BRANCH_INDEX[n.branch] != null ? n.branch : BRANCHES[BRANCHES.length - 1].id);
  const lanes = {};
  for (const b of BRANCHES) lanes[b.id] = { id: b.id, label: b.label, cols: {}, rows: 0, maxDepth: 0, ids: [] };
  for (const n of nodes) {
    const d = depth(n.id);
    const lane = lanes[laneOf(n)];
    (lane.cols[d] || (lane.cols[d] = [])).push(n);
    lane.maxDepth = Math.max(lane.maxDepth, d);
    lane.ids.push(n.id);
  }
  const slotOf = {}; // id -> { depth, slot, lane }
  for (const b of BRANCHES) {
    const lane = lanes[b.id];
    const depths = Object.keys(lane.cols).map(Number).sort((p, q) => p - q);
    for (const d of depths) {
      const col = lane.cols[d];
      const keyed = col.map((n, i) => {
        const parents = (n.prereqs || []).map((p) => slotOf[p]).filter((l) => l && l.lane === b.id);
        // Roots and cross-lane children keep declaration order, after the barycentred children.
        const k = parents.length ? parents.reduce((s, l) => s + l.slot, 0) / parents.length : 1e6 + i;
        return { n, i, k };
      });
      keyed.sort((p, q) => (p.k - q.k) || (p.i - q.i));
      keyed.forEach(({ n }, slot) => { slotOf[n.id] = { depth: d, slot, lane: b.id }; });
      lane.rows = Math.max(lane.rows, col.length);
    }
  }

  const boxH = COST_LINE_H + nameLines * NAME_LINE_H;
  const plateH = boxH + PLATE_PAD_Y * 2;
  const laneW = (lane) => LABEL_W + (lane.maxDepth + 1) * PLATE_W + lane.maxDepth * COL_GAP;
  const laneH = (lane) => lane.rows * (plateH + ROW_GAP) - ROW_GAP;
  const used = BRANCHES.map((b) => lanes[b.id]).filter((lane) => lane.rows > 0);
  const shelfMax = used.reduce((m, lane) => Math.max(m, laneW(lane)), 0);
  const shelves = [];
  for (const lane of used) {
    const shelf = shelves[shelves.length - 1];
    const w = laneW(lane);
    if (shelf && shelf.w + LANE_GAP_X + w <= shelfMax) {
      shelf.lanes.push(lane);
      shelf.w += LANE_GAP_X + w;
    } else {
      shelves.push({ lanes: [lane], w });
    }
  }
  const depthOf = {};     // id -> prerequisite depth (tier - 1)
  for (const id of Object.keys(slotOf)) depthOf[id] = slotOf[id].depth;
  const positions = {};   // id -> plate { x, y }
  const shelfOf = {};     // id -> shelf index
  const laneRects = {};   // lane id -> { x, y, w, h }
  let y = PAD;
  shelves.forEach((shelf, si) => {
    shelf.y = y;
    shelf.h = shelf.lanes.reduce((m, lane) => Math.max(m, laneH(lane)), 0);
    let x = PAD;
    for (const lane of shelf.lanes) {
      laneRects[lane.id] = { x, y, w: laneW(lane), h: laneH(lane), label: lane.label, ids: lane.ids };
      const colsX = x + LABEL_W;
      for (const id of lane.ids) {
        const at = slotOf[id];
        positions[id] = {
          x: colsX + at.depth * (PLATE_W + COL_GAP),
          y: y + at.slot * (plateH + ROW_GAP),
        };
        shelfOf[id] = si;
      }
      x += laneW(lane) + LANE_GAP_X;
    }
    y += shelf.h + SHELF_GAP;
  });
  const height = y - SHELF_GAP + PAD;
  return {
    byId, positions, shelfOf, laneRects, depthOf,
    shelves: shelves.map((s) => ({ y: s.y, h: s.h })),
    width: PAD * 2 + shelfMax, height, boxH, plateH, nameLines,
  };
}

/** Every prerequisite a node stands on, transitively (the path back to its roots). */
function ancestorsOf(id, byId) {
  const out = new Set();
  const stack = [id];
  while (stack.length) {
    const n = byId[stack.pop()];
    for (const p of (n && n.prereqs) || []) {
      if (out.has(p)) continue;
      out.add(p);
      stack.push(p);
    }
  }
  return out;
}

/** A node's printed field: a rectangle with its top-right corner cut at 45°. */
function platePath(g, x, y, w, h, cut) {
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w - cut, y);
  g.lineTo(x + w, y + cut);
  g.lineTo(x + w, y + h);
  g.lineTo(x, y + h);
  g.closePath();
}

/** A Manhattan polyline with rounded corners (a circuit trace). */
function tracePath(g, pts, r) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i += 1) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const room = Math.min(Math.hypot(x1 - x0, y1 - y0), Math.hypot(x2 - x1, y2 - y1)) / 2;
    g.arcTo(x1, y1, x2, y2, Math.max(0, Math.min(r, room)));
  }
  const last = pts[pts.length - 1];
  g.lineTo(last[0], last[1]);
}

/** A corner hero block whose number carries a data hook (`data-cr`, `data-rp`, `data-count`). */
function cornerHero(parent, word, hook) {
  const block = hero('0', word);
  const n = block.querySelector('.k-hero__n');
  const w = block.querySelector('.k-hero__w');
  n.setAttribute(hook, '');
  n.classList.add('fh-heronum', 'fh-data');
  pin(n, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 800, 'wdth' 125",
    color: 'var(--dp-ink, var(--fh-text))',
    'font-size': 'var(--fh-size-subhead)',
    'line-height': '0.9',
  });
  if (w) paintLegend(w);
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
  _inks: INK_FALLBACK,
  _drag: null,
  _dragMoved: false,

  mount(rootEl, ctx) {

    injectDeckplate();
    this._ctx = ctx;
    this._root = rootEl;
    // `#sf-techtree` stays as an inert hook (probe-frontend-unblind-capture reads `#sf-techtree canvas`).
    rootEl.id = 'sf-techtree';
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu', 'sf-menu-wide', 'sf-techtree');
    rootEl.classList.add('k-screen', 'of-research');
    rootEl.dataset.kReady = '0';
    rootEl.setAttribute('data-fh-register', 'bench');
    rootEl.setAttribute('aria-label', 'Research');
    installShell(rootEl);

    // .k-title — "Research"; the selected node's branch as the second line.
    const head = el('header', 'k-title');
    pin(head, { 'border-bottom': '0' });
    const heading = el('h1', 'k-display k-t-title', 'Research');
    paintMarking(heading);
    head.appendChild(heading);
    const branchLine = el('p', 'k-t-emph k-62', 'Select a node');
    head.appendChild(branchLine);
    rootEl.appendChild(head);

    // .k-corner — credits, research points, unlocked n/N as three readings.
    const corner = el('div', 'k-corner');
    corner.setAttribute('aria-label', 'Research resources');
    paintPlate(corner, 'edge', {
      display: 'flex',
      'flex-direction': 'row',
      'align-items': 'flex-end',
      gap: '28px',
      'text-align': 'right',
    });
    const crEl = cornerHero(corner, 'credits', 'data-cr');
    const rpEl = cornerHero(corner, 'research points', 'data-rp');
    const countEl = cornerHero(corner, 'unlocked', 'data-count');
    setText(countEl, '0/' + TECH_NODES.length);
    rootEl.appendChild(corner);

    // .k-stage — the tree on the held world; the selected node on the right.
    const stage = el('div', 'k-stage k-span k-panel k-panel--split');
    pin(stage, {
      background: 'transparent',
      'border-width': '0',
      'box-shadow': 'none',
      'grid-template-columns': 'minmax(0, 1fr) minmax(220px, 330px)',
    });
    const scrollEl = el('div', 'tt-scroll k-stage--scroll');
    // The kit's scroll rule scrolls one axis (overflow: hidden auto). Panning a zoomed tree needs
    // both; this is the pan behaviour the screen has always had, not a look.
    scrollEl.style.overflowX = 'auto';
    pin(scrollEl, {
      background: 'transparent',
      border: '0',
      'border-image-source': 'none',
      'box-shadow': 'none',
    });
    const canvas = el('canvas');
    canvas.setAttribute('aria-label', 'Tech tree');
    canvas.style.display = 'block';
    scrollEl.appendChild(canvas);
    stage.appendChild(scrollEl);
    // The zoom reading pins to the stage's bottom-left, outside the scroller, so it never scrolls
    // away and never covers a node: it says whether the whole tree is in view.
    const zoomBadge = el('div', 'tt-zoom-badge k-stage__foot k-t-fine fh-legend', '100%');
    zoomBadge.setAttribute('aria-live', 'off');
    paintLegend(zoomBadge);
    pin(zoomBadge, { background: 'transparent', border: '0', padding: '0' });
    stage.appendChild(zoomBadge);

    const side = el('div', 'tt-side k-stage--scroll');
    side.setAttribute('aria-label', 'Selected node');
    paintPlate(side, 'sunk', { background: 'transparent', padding: '0 2px' });
    const selected = el('div');
    selected.setAttribute('data-sel', '');
    const actions = el('div', 'of-pause');
    actions.setAttribute('data-actions', '');
    side.appendChild(selected);
    side.appendChild(actions);
    stage.appendChild(side);
    rootEl.appendChild(stage);

    // .k-foot — Back, the legend (each word wears the form its nodes wear), the node picker.
    const foot = el('footer', 'k-foot');
    pin(foot, { 'border-top': '0' });
    const availableWord = el('span', 'k-word--fine fh-legend', 'available');
    paintLegend(availableWord, true);
    const researchedWord = el('span', 'k-word--fine fh-legend', 'researched');
    paintLegend(researchedWord, true);
    researchedWord.setAttribute('data-fh-lit', 'on');
    const lockedWord = el('span', 'k-word--fine fh-legend', 'locked');
    paintLegend(lockedWord, false);
    availableWord.dataset.swatch = 'available';
    researchedWord.dataset.swatch = 'researched';
    lockedWord.dataset.swatch = 'locked';
    const back = el('button', 'k-word k-word--emph sf-back', 'Back');
    back.type = 'button';
    back.dataset.action = 'back';
    back.addEventListener('click', () => {
      const mgr = ctx && (ctx.screenManager || (ctx.screens && typeof ctx.screens.popScreen === 'function' ? ctx.screens : null));
      if (mgr && typeof mgr.popScreen === 'function') mgr.popScreen();
      else if (ctx && ctx.bus) ctx.bus.emit('ui:popScreen', {});
    });
    foot.setAttribute('aria-label', 'Legend and actions');
    foot.appendChild(back);
    const legend = el('div', 'tt-legend');
    legend.setAttribute('aria-label', 'Legend');
    legend.appendChild(availableWord);
    legend.appendChild(researchedWord);
    legend.appendChild(lockedWord);
    foot.appendChild(legend);
    // Canvas labels have a native keyboard/screen-reader equivalent. Selecting a locked node is
    // allowed: it reveals the exact prerequisite reason without pretending it can be researched.
    const picker = el('div', 'tt-picker');
    const nodeLabel = el('label', 'k-t-fine fh-legend', 'Research node');
    paintLegend(nodeLabel);
    const nodeSelect = el('select', 'k-select tt-node-select');
    nodeSelect.id = 'sf-research-node'; nodeLabel.htmlFor = nodeSelect.id;
    const placeholder = el('option', '', 'Select a node'); placeholder.value = ''; nodeSelect.appendChild(placeholder);
    for (const node of this._nodes()) {
      const option = el('option', '', node.name); option.value = node.id; nodeSelect.appendChild(option);
    }
    nodeSelect.addEventListener('change', () => this._selectNode(nodeSelect.value));
    paintInput(nodeSelect);
    picker.appendChild(nodeLabel); picker.appendChild(nodeSelect);
    foot.appendChild(picker);
    this._nodeSelect = nodeSelect;
    rootEl.appendChild(foot);

    this._regions = { head, corner, stage, foot };
    this._canvas = canvas;
    this._scrollEl = scrollEl;
    this._g = canvas.getContext('2d');
    this._layoutLocale = null;
    this._relayout();
    this._els = { cr: crEl, rp: rpEl, count: countEl, branch: branchLine, selected, actions };
    this._zoomBadge = zoomBadge;
    this._zoom = 1.0;

    canvas.addEventListener('click', (e) => this._onCanvasClick(e));
    canvas.addEventListener('mousemove', (e) => this._onCanvasMove(e));
    canvas.addEventListener('mouseleave', () => { if (this._hoverId) { this._hoverId = null; this._draw(); } });
    // Drag pans the tree when it is larger than its window (the zoom reading says so).
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this._drag = { x: e.clientX, y: e.clientY, left: scrollEl.scrollLeft, top: scrollEl.scrollTop, id: e.pointerId };
      this._dragMoved = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      const d = this._drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!this._dragMoved && Math.abs(dx) + Math.abs(dy) < 5) return;
      if (!this._dragMoved) {
        this._dragMoved = true;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* capture is a nicety */ }
      }
      scrollEl.scrollLeft = d.left - dx;
      scrollEl.scrollTop = d.top - dy;
    });
    const endDrag = () => { this._drag = null; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // Mouse-wheel zoom, toward the cursor.
    scrollEl.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const delta = ev.deltaY > 0 ? -0.1 : 0.1;
      const prevZoom = this._zoom;
      this._zoom = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this._zoom + delta)) * 100) / 100;
      if (this._zoom === prevZoom) return;
      const rect = scrollEl.getBoundingClientRect();
      const mx = ev.clientX - rect.left + scrollEl.scrollLeft;
      const my = ev.clientY - rect.top + scrollEl.scrollTop;
      const ratio = this._zoom / prevZoom;
      this._applyZoom();
      scrollEl.scrollLeft = mx * ratio - (ev.clientX - rect.left);
      scrollEl.scrollTop = my * ratio - (ev.clientY - rect.top);
    }, { passive: false });

    actions.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (btn) this._onAction(btn.dataset.act);
    });

    // Web fonts land after first paint: re-measure the names and repaint in the real face.
    if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', () => {
        if (!this._root || !this._root.isConnected) return;
        const lines = this._layout && this._layout.nameLines;
        this._relayout();
        if (this._layout && this._layout.nameLines !== lines) { this._fitZoom(); }
        this._draw();
      });
    }
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._inks = forcedColorsActive() ? FORCED_INKS : readInks(this._root);
    this._relayout();
    // The detail pane is never an empty box: it opens on the first node the player can research now.
    if (!this._selectedId || !this._nodes().some((n) => n.id === this._selectedId)) {
      this._selectedId = this._defaultNodeId();
      if (this._nodeSelect) this._nodeSelect.value = this._selectedId || '';
    }
    this._fitZoom();
    this.refresh(this._ctx);
    this._lightTrace();
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
      const before = this._drawSig ? this._drawSig.split('|')[0] : null;
      this._drawSig = drawSig;
      this._draw();
      // A node just researched: run the light along its traces.
      if (before != null && before !== this._researchSignature()) this._lightTrace();
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

  /** First node the player can research right now; else the first open one; else the next one. */
  _defaultNodeId() {
    const nodes = this._nodes();
    const st = this._ctx && this._ctx.state;
    const ready = nodes.find((n) => describeTechNodeReadiness(n, st, nodes).state === 'available');
    if (ready) return ready.id;
    const open = nodes.find((n) => this._nodeState(n) === 'available');
    if (open) return open.id;
    const next = nodes.find((n) => !this._isResearched(n.id));
    return (next || nodes[0] || {}).id || null;
  },

  _locale() {
    return (typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset.locale) || 'en-US';
  },

  /** Lay the tree out for the live locale, measuring the names in the face they are drawn in. */
  _relayout() {
    const loc = this._locale();
    const g = this._g;
    let measure = null;
    if (g && typeof g.measureText === 'function') {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.font = kitFont(500, 16, 1);
      setSpacing(g, 0);
      measure = (value) => g.measureText(value).width;
    }
    const nameLines = measuredNameLines(this._nodes(), measure, techTreeNameLineBudget(loc));
    const sig = loc + '|' + nameLines + '|' + this._nodes().length;
    if (this._layout && this._layoutSig === sig) return;
    this._layout = buildLayout(this._nodes(), { nameLines });
    this._layoutSig = sig;
    this._layoutLocale = loc;
    this._sizeCanvas();
  },

  _sizeCanvas() {
    if (!this._canvas || !this._layout) return;
    this._dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    this._applyZoom();
  },

  /**
   * Scale the canvas ELEMENT and its backing store to the zoom, so a zoomed-out tree scrolls over
   * the tree and not blank canvas, and a hairline stays one device pixel. Hit-testing divides by
   * _zoom; kitFont sizes the words for the zoom.
   */
  _applyZoom() {
    if (!this._canvas || !this._layout) return;
    const zoom = this._zoom || 1;
    const cssW = Math.round(this._layout.width * zoom);
    const cssH = Math.round(this._layout.height * zoom);
    this._canvas.style.width = cssW + 'px';
    this._canvas.style.height = cssH + 'px';
    const bw = Math.max(1, Math.round(cssW * this._dpr));
    const bh = Math.max(1, Math.round(cssH * this._dpr));
    if (this._canvas.width !== bw) this._canvas.width = bw;
    if (this._canvas.height !== bh) this._canvas.height = bh;
    this._syncZoomBadge();
    this._draw();
  },

  /** The zoom reading: whether the whole tree is in view, and how to see the rest when it is not. */
  _syncZoomBadge() {
    const scrollEl = this._scrollEl;
    const pct = Math.round((this._zoom || 1) * 100) + '%';
    let whole = true;
    if (scrollEl && this._layout && scrollEl.clientWidth > 0) {
      const z = this._zoom || 1;
      whole = this._layout.width * z <= scrollEl.clientWidth + 1 && this._layout.height * z <= scrollEl.clientHeight + 1;
    }
    setText(this._zoomBadge, whole ? 'Whole tree · ' + pct : 'Drag to pan · wheel to zoom · ' + pct);
    if (this._zoomBadge) this._zoomBadge.dataset.whole = whole ? '1' : '0';
  },

  /**
   * First paint fits the whole tree to its window and never goes past 100%. The floor is MIN_ZOOM:
   * below it the 12 px type floor makes a name wider than its field. When even the floor does not
   * fit, the tree scrolls and the zoom reading says "drag to pan".
   */
  _fitZoom() {
    if (!this._root || !this._layout) return;
    const scrollEl = this._scrollEl;
    if (!scrollEl || !(scrollEl.clientWidth > 0)) return;
    const fitW = scrollEl.clientWidth / Math.max(1, this._layout.width);
    const fitH = scrollEl.clientHeight > 0 ? scrollEl.clientHeight / Math.max(1, this._layout.height) : 1;
    const fit = Math.min(1, fitW, fitH);
    this._zoom = Math.max(MIN_ZOOM, Math.floor(fit * 100) / 100);
    this._applyZoom();
  },

  /**
   * The light runs along the selected node's traces (stroke-dash settle, --dp-d-settle). One
   * short animation on open and after a research, never a loop; reduced motion shows it lit.
   */
  _lightTrace() {
    this._traceT = 1;
    const video = this._ctx && this._ctx.state && this._ctx.state.settings && this._ctx.state.settings.video;
    if (reducedMotion() || (video && video.motionReduce) || typeof requestAnimationFrame !== 'function') { this._draw(); return; }
    const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const DURATION = 420;
    this._traceT = 0;
    const tick = (now) => {
      const t = Math.min(1, ((Number.isFinite(now) ? now : Date.now()) - start) / DURATION);
      // the settle curve: a long soft tail (--dp-ease-settle)
      this._traceT = 1 - Math.pow(1 - t, 3);
      this._draw();
      if (t < 1 && this._root && this._root.isConnected) requestAnimationFrame(tick);
      else this._traceT = 1;
    };
    requestAnimationFrame(tick);
  },

  /** The route a trace takes from a parent's right edge to a child's left edge. */
  _route(parentId, childId) {
    const L = this._layout;
    const pp = L.positions[parentId];
    const cp = L.positions[childId];
    if (!pp || !cp) return null;
    const midH = L.plateH / 2;
    const px = pp.x + PLATE_W, py = pp.y + midH;
    const cx = cp.x, cy = cp.y + midH;
    const busX = cx - COL_GAP / 2;
    if (L.shelfOf[parentId] === L.shelfOf[childId] && busX > px) {
      return [[px, py], [busX, py], [busX, cy], [cx, cy]];
    }
    // Across shelves: out into the parent's gap, along the corridor between the shelves, then in.
    const upper = Math.min(L.shelfOf[parentId], L.shelfOf[childId]);
    const shelf = L.shelves[upper];
    const corridorY = shelf.y + shelf.h + SHELF_GAP / 2;
    const outX = px + COL_GAP / 2;
    return [[px, py], [outX, py], [outX, corridorY], [busX, corridorY], [busX, cy], [cx, cy]];
  },

  _draw() {
    const g = this._g, cv = this._canvas, L = this._layout;
    if (!g || !cv || !L) return;
    const zoom = this._zoom || 1;
    const inks = this._inks || INK_FALLBACK;
    const forced = forcedColorsActive();
    const px = (n) => n / zoom; // a length in screen pixels, in canvas units
    this._drawSig = this._drawSignature();
    g.setTransform(this._dpr * zoom, 0, 0, this._dpr * zoom, 0, 0);
    g.clearRect(0, 0, L.width, L.height); // transparent: the sky is the ground
    g.imageSmoothingEnabled = true;
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const nodes = this._nodes();
    const pos = L.positions;
    const researched = new Set(this._researched());
    const selChain = this._selectedId ? ancestorsOf(this._selectedId, L.byId) : new Set();
    const hovChain = this._hoverId && this._hoverId !== this._selectedId ? ancestorsOf(this._hoverId, L.byId) : new Set();

    // ---- lanes: the name etched in the gutter, the count as a reading under it ----
    g.textAlign = 'left';
    g.textBaseline = 'top';
    for (const b of BRANCHES) {
      const lane = L.laneRects[b.id];
      if (!lane) continue;
      g.fillStyle = inks.inkDim;
      g.font = kitFont(700, 12, zoom, KIT_DISPLAY_FACE);
      setSpacing(g, px(1.6));
      g.fillText(String(lane.label).toUpperCase(), lane.x, lane.y + 2);
      setSpacing(g, 0);
      const done = lane.ids.filter((id) => researched.has(id)).length;
      g.fillStyle = done ? inks.phos : inks.phosDim;
      g.font = kitFont(600, 18, zoom);
      g.fillText(done + '/' + lane.ids.length, lane.x, lane.y + 22);
      g.fillStyle = inks.inkMute;
      g.font = kitFont(400, 12, zoom);
      g.fillText('researched', lane.x, lane.y + 46);
    }

    // ---- traces: a dim hairline where nothing is owned, the idle lamp where the parent is owned,
    // lit where both ends are owned ----
    const edges = [];
    for (const n of nodes) {
      for (const p of n.prereqs || []) {
        const route = this._route(p, n.id);
        if (route) edges.push({ from: p, to: n.id, route });
      }
    }
    for (const e of edges) {
      const fromOwned = researched.has(e.from);
      const toOwned = researched.has(e.to);
      g.save();
      if (fromOwned && toOwned) {
        g.strokeStyle = inks.lamp;
        g.lineWidth = px(1.5);
        if (!forced) { g.shadowColor = inks.lampBloom; g.shadowBlur = 6 * this._dpr; }
      } else if (fromOwned) {
        g.strokeStyle = inks.lampDim;
        g.lineWidth = px(1.25);
      } else {
        g.strokeStyle = inks.ruleHi;
        g.lineWidth = px(1);
      }
      tracePath(g, e.route, TRACE_R);
      g.stroke();
      g.restore();
    }
    // The path back to the roots: the hovered node's in the lamp, the selected node's hot, with bloom.
    const lightChain = (targetId, chain, colour, width, progress) => {
      const inChain = (id) => id === targetId || chain.has(id);
      g.save();
      g.strokeStyle = colour;
      g.lineWidth = px(width);
      if (!forced) { g.shadowColor = inks.lampBloom; g.shadowBlur = 10 * this._dpr; }
      for (const e of edges) {
        if (!inChain(e.to) || !chain.has(e.from)) continue;
        tracePath(g, e.route, TRACE_R);
        if (progress < 1) {
          let len = 0;
          for (let i = 1; i < e.route.length; i += 1) {
            len += Math.abs(e.route[i][0] - e.route[i - 1][0]) + Math.abs(e.route[i][1] - e.route[i - 1][1]);
          }
          g.setLineDash([len, len]);
          g.lineDashOffset = len * (1 - progress);
        }
        g.stroke();
        g.setLineDash([]);
      }
      g.restore();
    };
    if (hovChain.size) lightChain(this._hoverId, hovChain, inks.lamp, 1.75, 1);
    if (selChain.size) lightChain(this._selectedId, selChain, inks.lampHot, 2, this._traceT == null ? 1 : this._traceT);

    // ---- nodes: printed fields; state is form and light ----
    const nameLines = L.nameLines;
    for (const n of nodes) {
      const p = pos[n.id];
      if (!p) continue;
      const stt = this._nodeState(n);
      const sel = n.id === this._selectedId;
      const hov = n.id === this._hoverId;
      const onPath = selChain.has(n.id);
      const x = p.x, y = p.y, w = PLATE_W, h = L.plateH;
      g.save();
      platePath(g, x, y, w, h, CUT);
      g.fillStyle = stt === 'locked' ? inks.fieldLocked : inks.field;
      g.fill();
      if (stt === 'researched') { g.fillStyle = inks.fieldLit; g.fill(); }
      if (sel || hov) { g.fillStyle = inks.fieldInk; g.fill(); }
      // the edge: the lamp around what you can research now, bone around what is open but not
      // yet affordable, a hairline around what is locked
      const affordable = stt === 'available' && this._affordable(n);
      if (stt === 'available') {
        g.strokeStyle = affordable ? inks.lamp : inks.inkDim;
        g.globalAlpha = sel || hov ? 1 : (affordable ? 0.82 : 0.6);
        g.lineWidth = px(1);
        g.stroke();
        g.globalAlpha = 1;
      } else if (stt === 'locked') {
        g.strokeStyle = onPath || hov || sel ? inks.ruleHi : inks.rule;
        g.lineWidth = px(1);
        if (forced) g.setLineDash([px(3), px(3)]);
        g.stroke();
        g.setLineDash([]);
      } else if (forced) {
        g.strokeStyle = inks.ink;
        g.lineWidth = px(1);
        g.stroke();
      }
      // selection: the lamp bar on the leading edge (the one selection language)
      if (sel) {
        g.fillStyle = inks.lamp;
        g.fillRect(x, y, px(2.5), h);
      }
      // the cut corner lights on what is owned and on what is selected
      if (stt === 'researched' || sel) {
        g.beginPath();
        g.moveTo(x + w - CUT, y);
        g.lineTo(x + w, y + CUT);
        g.strokeStyle = inks.lampHot;
        g.lineWidth = px(2);
        if (!forced) { g.shadowColor = inks.lampBloom; g.shadowBlur = 8 * this._dpr; }
        g.stroke();
      }
      g.restore();

      // the words
      const tx = x + PLATE_PAD_X, ty = y + PLATE_PAD_Y;
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillStyle = stt === 'locked' && !sel && !hov ? inks.inkMute : inks.ink;
      g.font = kitFont(stt === 'locked' ? 400 : 500, 16, zoom);
      setSpacing(g, 0);
      wrapText(g, n.name, tx, ty, NODE_W, NAME_LINE_H, nameLines);
      const costY = ty + nameLines * NAME_LINE_H + 1;
      if (stt === 'researched') {
        g.fillStyle = inks.lamp;
        g.font = kitFont(700, 12, zoom, KIT_DISPLAY_FACE);
        setSpacing(g, px(1.6));
        g.fillText('RESEARCHED', tx, costY);
        setSpacing(g, 0);
      } else {
        const cost = n.cost || {};
        const credits = Math.round(cost.credits || 0);
        const rp = Math.round(cost.rp || 0);
        const text = fmtCostCompact(credits) + ' cr' + (rp ? ' · ' + rp.toLocaleString() + ' RP' : '');
        g.fillStyle = stt === 'locked' ? inks.inkMute : (affordable ? inks.phos : inks.phosDim);
        g.font = kitFont(500, 12, zoom);
        g.fillText(text, tx, costY);
      }
    }
  },

  /** Whether the player holds the credits and research points a node costs. */
  _affordable(node) {
    const cost = (node && node.cost) || {};
    const player = (this._ctx && this._ctx.state && this._ctx.state.player) || {};
    return Math.round(cost.credits || 0) <= (Number(player.credits) || 0)
      && Math.round(cost.rp || 0) <= (Number(player.researchPoints) || 0);
  },

  _onCanvasMove(e) {
    if (this._dragMoved && this._drag) return;
    const hit = this._hitTest(e);
    const id = hit ? hit.id : null;
    if (id !== this._hoverId) { this._hoverId = id; this._draw(); }
    this._canvas.style.cursor = hit ? 'pointer' : (this._zoomBadge && this._zoomBadge.dataset.whole === '0' ? 'grab' : 'default');
  },

  _onCanvasClick(e) {
    if (this._dragMoved) { this._dragMoved = false; return; }
    const hit = this._hitTest(e);
    if (!hit) return;
    this._selectNode(hit.id);
  },

  _selectNode(id) {
    if (!this._nodes().some((node) => node.id === id)) return;
    this._selectedId = id;
    if (this._nodeSelect) this._nodeSelect.value = id;
    cue('move');
    this._syncSidebar();
    this._lightTrace();
  },

  _hitTest(e) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / this._zoom;
    const my = (e.clientY - rect.top) / this._zoom;
    const L = this._layout;
    for (const n of this._nodes()) {
      const p = L.positions[n.id];
      if (!p) continue;
      if (mx >= p.x && mx <= p.x + PLATE_W && my >= p.y && my <= p.y + L.plateH) return n;
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
    // The line under the title says what the player can do here, in numbers.
    const nodes = this._nodes();
    const ready = nodes.filter((n) => describeTechNodeReadiness(n, st, nodes).state === 'available').length;
    const open = nodes.filter((n) => this._nodeState(n) === 'available').length;
    const line = ready
      ? (ready === 1 ? 'One node' : ready + ' nodes') + ' ready to research now'
      : open
        ? (open === 1 ? 'One node is' : open + ' nodes are') + ' open; earn credits and research points to unlock them'
        : researchedCount >= nodes.length ? 'Every node researched' : 'Research the open nodes to reach the rest';
    setText(this._els && this._els.branch, line);
  },

  _paintDossier() {
    const sel = this._els && this._els.selected;
    const actions = this._els && this._els.actions;
    if (sel) {
      for (const cap of sel.querySelectorAll('.k-caps')) paintLegend(cap);
      for (const row of sel.querySelectorAll('.k-row')) row.classList.add('fh-row');
      for (const p of sel.querySelectorAll('.k-sentence, .k-empty')) paintBody(p);
    }
    if (actions) {
      const btn = actions.querySelector('button');
      if (btn) paintKey(btn, btn.getAttribute('data-act') === 'unlock' ? 'primary' : 'legend');
    }
  },

  _syncSidebar() {
    const sel = this._els && this._els.selected;
    const actions = this._els && this._els.actions;
    if (!sel || !actions) return;
    this._sidebarSig = this._sidebarSignature();
    if (!this._selectedId) {
      if (actions.parentNode === sel && sel.parentNode) sel.parentNode.appendChild(actions);
      sel.innerHTML = `<p class="k-empty">Select a node to inspect its cost, effects and prerequisites.</p>`;
      actions.innerHTML = '';
      this._paintDossier();
      return;
    }
    const n = this._layout.byId[this._selectedId] || this._nodes().find((x) => x.id === this._selectedId);
    if (!n) { sel.innerHTML = ''; actions.innerHTML = ''; return; }
    const st = this._ctx.state;
    const cost = n.cost || {};
    const readiness = describeTechNodeReadiness(n, st, this._nodes());
    const branch = BRANCHES.find((b) => b.id === n.branch);
    const branchLabel = branch ? branch.label : String(n.branch || '');
    const tier = (this._layout.depthOf[n.id] || 0) + 1;

    const prereqHtml = (n.prereqs && n.prereqs.length)
      ? `<ul class="k-rows tt-reqs" aria-label="Prerequisites">` + n.prereqs.map((p) => {
          const pn = (this._layout.byId[p] || {}).name || p;
          const ok = this._isResearched(p);
          return `<li class="k-row k-row--static" data-met="${ok ? '1' : '0'}"><span class="k-row__name">${escapeHtml(pn)}</span><span class="k-row__sub">${ok ? 'researched' : 'not yet researched'}</span></li>`;
        }).join('') + `</ul>`
      : `<p class="k-sentence">No prerequisites.</p>`;
    const unlockRows = unlockRowsHtml(n.unlocks);
    const effects = formatUnlocks(n.unlocks);
    const rpText = cost.rp ? Math.round(cost.rp).toLocaleString() : '0';

    sel.innerHTML = `
      <p class="tt-dossier__kicker">${escapeHtml(branchLabel)} branch · tier ${tier}</p>
      <h2 class="tt-dossier__name">${escapeHtml(n.name)}</h2>
      <p class="tt-dossier__state" data-state="${escapeHtml(readiness.state)}">${escapeHtml(stateSentence(readiness))}</p>
      <dl class="tt-dossier__cost" aria-label="Cost">
        <div><dt>Credits</dt><dd>${escapeHtml(fmtCr(cost.credits || 0))}</dd></div>
        <div><dt>Research points</dt><dd>${escapeHtml(rpText)}</dd></div>
      </dl>
      ${effects || !unlockRows ? `<p class="k-sentence">${effects || 'No listed effects.'}</p>` : ''}
      ${unlockRows ? `<div class="k-caps">Unlocks</div><ul class="k-rows tt-unlocks" aria-label="Unlocks">${unlockRows}</ul>` : ''}
      <div class="k-caps">Requires</div>
      ${prereqHtml}
    `;

    if (readiness.state === 'available') {
      actions.innerHTML = `<button class="k-word k-word--emph k-word--primary tt-unlock" data-act="unlock" data-why="${escapeHtml(readiness.actionTitle)}" aria-label="${escapeHtml(readiness.actionTitle)}">Unlock</button>`;
    } else {
      actions.innerHTML = disabledActionHtml(readiness);
    }
    // The verb sits under the price it spends, above the lists, so a node with six unlocks never
    // pushes Unlock (or the reason it is locked) below the pane.
    const costEl = sel.querySelector('.tt-dossier__cost');
    if (costEl) costEl.insertAdjacentElement('afterend', actions);
    this._paintDossier();
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
  const row = (name, kind, ref) => `<li class="k-row k-row--static"><span class="k-row__name">${ref ? entitySpanHtml(ref, name) : name}</span><span class="k-row__sub">${kind}</span></li>`;
  const rows = [];
  if (u.ships && u.ships.length) {
    const names = u.ships.map(unlockDisplayName);
    rows.push(...u.ships.map((id, i) => row(names[i], 'ship', 'hull:' + id)));
  }
  if (u.modules && u.modules.length) {
    const names = u.modules.map(unlockDisplayName);
    rows.push(...u.modules.map((id, i) => row(names[i], 'module', 'module:' + id)));
  }
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

/** One compact cost voice on the tiles: 6k, 12k, 2.5M (fmtCr keeps exact thousands elsewhere). */
function fmtCostCompact(v) {
  v = Math.round(v || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 === 0 || v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(v % 1e3 === 0 || v >= 1e4 ? 0 : 1) + 'k';
  return String(v);
}
function fmtCr(v) {
  v = Math.round(v || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  return v.toLocaleString();
}

function wrapText(g, text, x, y, maxW, lineH, maxLines) {
  const lines = wrapCanvasLines((value) => g.measureText(value).width, text, maxW);
  const limit = Math.max(1, maxLines || lines.length);
  for (let i = 0; i < Math.min(limit, lines.length); i += 1) {
    g.fillText(lines[i], x, y + i * lineH);
  }
}
