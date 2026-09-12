// src/ui/screens/techTree.js — Tech-tree progression screen (ARCHITECTURE §5, spec 09).
// Field Hardware BENCH: lanes etched on the held world, nodes as kit legend-strip tiles with
// status lights, the selected dossier on a sunk plate, Unlock as one key, quiet type.
// Click a node -> the side column -> Unlock emits ui:unlockTech{nodeId} (ships handles it).
// READ-ONLY on state; emits intents only. A labelled node selector is the keyboard and
// screen-reader equivalent of canvas picking. This file owns no CSS; hardware is the produced
// kit sprites pinned on the elements. Canvas 2D cannot read CSS custom properties, so ink and
// faces are spelled below from the kit tokens.
//
// Export: techTreeScreen  (id 'techTree'). No 'three' import.

import { TECH_NODES } from '../../data/tech.js';
import { SHIPS } from '../../data/ships.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { BODY_MODULES } from '../../data/claimableBodies.js';
import { escapeMarkup as escapeHtml } from '../views/identity.js';
import { el, hero, settle, cue } from '../kit/index.js';
import {
  wrapCanvasLines,
  techTreeNameLineBudget,
  techTreeNodeHeight,
} from '../../localization/layout.js';

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
// NODE_W is the word box width. Height follows techTreeNodeHeight() so a growth locale can take a
// third name line instead of an ellipsis. The register border follows the same hit-test rectangle.
const NODE_W = 168, COL_GAP = 56, ROW_GAP = 16, PAD_X = 32, PAD_Y = 40;
const LANE_GAP = 34;          // vertical space between branch lanes (holds the lane label)
const LANE_LABEL_H = 22;      // label sits inside the lane's top inset
const NAME_LINE_H = 20;       // canvas line height for the node's name at body size (16 px × 1.25)
const PLATE_PAD_X = 8;
const PLATE_PAD_Y = 6;
const STRIP_SLICE = Object.freeze({ t: 12, r: 16, b: 12, l: 16 });
const SELECTED_SLICE = Object.freeze({ t: 8, r: 16, b: 8, l: 16 });

const FH_KEY = {
  primary: { file: 'key.primary', width: '18px', minW: '132px', minH: '44px', pad: '0 16px', font: '16px' },
  legend: { file: 'key.legend', width: '14px', minW: '72px', minH: '32px', pad: '0 10px', font: '12px' },
};
const FH_PLATE = {
  sunk: { file: 'plate.bench.sunk.png', width: '24px', slice: '24 fill' },
  edge: { file: 'plate.edge.small.png', width: '16px', slice: '16 fill' },
};

function fhUrl(rel) {
  return new URL(`../../../assets/ui/kit/assets/${rel}`, import.meta.url).href;
}
function forcedColorsActive() {
  return typeof matchMedia === 'function' && matchMedia('(forced-colors: active)').matches;
}
function pin(node, props) {
  if (!node || !node.style || typeof node.style.setProperty !== 'function') return node;
  for (const name of Object.keys(props)) node.style.setProperty(name, props[name], 'important');
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
  const spec = FH_PLATE[variant] || FH_PLATE.sunk;
  node.classList.add('fh-plate', variant === 'edge' ? 'fh-plate--edge' : 'fh-plate--sunk');
  if (forcedColorsActive()) {
    return pin(node, {
      'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
      background: 'transparent', ...extra,
    });
  }
  return pin(node, {
    'border-style': 'solid',
    'border-width': spec.width,
    'border-image-source': 'url("' + fhUrl('plates/' + spec.file) + '")',
    'border-image-slice': spec.slice,
    'border-image-repeat': 'stretch',
    'border-image-width': spec.width,
    background: 'transparent',
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
      'border-style': 'solid',
      'border-width': '12px',
      'border-image-source': 'url("' + fhUrl('controls/input.underline.' + state + '.png') + '")',
      'border-image-slice': '12 fill',
      'border-image-repeat': 'stretch',
      'border-image-width': '12px',
      background: 'transparent',
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
      padding: spec.pad,
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
      'border-style': 'solid',
      'border-width': spec.width,
      'border-image-source': 'url("' + fhUrl('keys/' + spec.file + '.' + state + '.png') + '")',
      'border-image-slice': parseInt(spec.width, 10) + ' fill',
      'border-image-repeat': 'stretch',
      'border-image-width': spec.width,
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
function paintRow(row) {
  if (!row) return row;
  row.classList.add('fh-row');
  return pin(row, {
    border: '0',
    'box-shadow': 'none',
    'background-image': 'url("' + fhUrl('tiles/tile.etch.hairline.png') + '")',
    'background-repeat': 'repeat-x',
    'background-position': 'top left',
    'background-color': 'transparent',
    color: 'var(--fh-text-resting)',
  });
}
function paintHairline(node) {
  if (!node) return node;
  node.classList.add('fh-hairline');
  return pin(node, {
    border: '0',
    height: '4px',
    background: 'url("' + fhUrl('tiles/tile.etch.hairline.png') + '") repeat-x left center',
    'background-color': 'transparent',
    margin: '12px 0',
  });
}

const KIT_IMG = Object.create(null);
function kitImage(rel) {
  if (Object.prototype.hasOwnProperty.call(KIT_IMG, rel)) return KIT_IMG[rel];
  if (typeof Image === 'undefined') {
    KIT_IMG[rel] = null;
    return null;
  }
  const img = new Image();
  KIT_IMG[rel] = img;
  try { img.src = fhUrl(rel); }
  catch {
    KIT_IMG[rel] = null;
    return null;
  }
  img.addEventListener('load', () => {
    if (techTreeScreen._g) techTreeScreen._draw();
  });
  return img;
}
function imgReady(img) {
  return !!(img && img.complete && img.naturalWidth > 1);
}
function drawNineSlice(g, img, dx, dy, dw, dh, slice) {
  if (!imgReady(img) || dw < 4 || dh < 4) return false;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const l = slice.l;
  const r = slice.r;
  const t = slice.t;
  const b = slice.b;
  if (iw < l + r + 1 || ih < t + b + 1) return false;
  const cl = Math.min(l, Math.max(1, Math.floor(dw / 2) - 1));
  const cr = Math.min(r, Math.max(1, Math.floor(dw / 2) - 1));
  const ct = Math.min(t, Math.max(1, Math.floor(dh / 2) - 1));
  const cb = Math.min(b, Math.max(1, Math.floor(dh / 2) - 1));
  const srcCW = iw - l - r;
  const srcCH = ih - t - b;
  const dstCW = dw - cl - cr;
  const dstCH = dh - ct - cb;
  const parts = [
    [0, 0, l, t, dx, dy, cl, ct],
    [l, 0, srcCW, t, dx + cl, dy, dstCW, ct],
    [iw - r, 0, r, t, dx + cl + dstCW, dy, cr, ct],
    [0, t, l, srcCH, dx, dy + ct, cl, dstCH],
    [l, t, srcCW, srcCH, dx + cl, dy + ct, dstCW, dstCH],
    [iw - r, t, r, srcCH, dx + cl + dstCW, dy + ct, cr, dstCH],
    [0, ih - b, l, b, dx, dy + ct + dstCH, cl, cb],
    [l, ih - b, srcCW, b, dx + cl, dy + ct + dstCH, dstCW, cb],
    [iw - r, ih - b, r, b, dx + cl + dstCW, dy + ct + dstCH, cr, cb],
  ];
  for (const p of parts) {
    if (p[2] < 1 || p[3] < 1 || p[6] < 1 || p[7] < 1) continue;
    g.drawImage(img, p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]);
  }
  return true;
}
function drawEtchLine(g, x1, y, x2) {
  const img = kitImage('tiles/tile.etch.hairline.png');
  const yy = Math.round(y);
  if (imgReady(img)) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    for (let x = x1; x < x2; x += w) {
      const dw = Math.min(w, x2 - x);
      g.drawImage(img, 0, 0, dw, h, x, yy - h / 2, dw, h);
    }
    return;
  }
  g.strokeStyle = KIT_INK.hair;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x1, yy + 0.5);
  g.lineTo(x2, yy + 0.5);
  g.stroke();
}
function drawLight(g, kind, x, y) {
  const file = kind === 'good'
    ? 'lights/light.dot.good.on.png'
    : kind === 'on'
      ? 'lights/light.dot.legend.on.png'
      : kind === 'dim'
        ? 'lights/light.dot.legend.dim.png'
        : 'lights/light.dot.legend.off.png';
  const img = kitImage(file);
  if (imgReady(img)) {
    g.drawImage(img, x, y, 12, 12);
    return;
  }
  g.fillStyle = kind === 'good' ? KIT_INK.good : kind === 'off' ? KIT_INK.bone38 : KIT_INK.signal;
  g.beginPath();
  g.arc(x + 6, y + 6, 3, 0, Math.PI * 2);
  g.fill();
}

// Canvas 2D cannot read a CSS custom property, so the kit tokens are spelled here — the only
// colour literals allowed in this file. Values match assets/ui/kit/tokens/tokens.css.
const KIT_INK = Object.freeze({
  bone: '#eae6df',
  bone62: 'rgba(234,230,223,0.62)',
  bone38: 'rgba(234,230,223,0.38)',
  hair: 'rgba(234,230,223,0.14)',
  signal: '#f2b950',
  legend: '#ffb347',
  red: '#ff4d3d',
  good: '#9bd8a0',
  ink: '#0c0a08',
  available: '#26211b',
  researched: '#1a1714',
  locked: '#100e0c',
});
// The kit's text face (styles/kit.css --k-text / --fh-face-text), spelled out because ctx.font
// cannot resolve var(). Lane legends use the display face.
const KIT_TEXT_FACE = '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const KIT_DISPLAY_FACE = 'Archivo, system-ui, sans-serif';

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
function kitLegendFont(screenPx, zoom) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const size = Math.max(12, Number.isFinite(screenPx) ? screenPx : 12) / z;
  return '600 ' + size + 'px ' + KIT_DISPLAY_FACE;
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
  const boxH = techTreeNodeHeight();
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
          y: cardsTop + l.slot * (boxH + ROW_GAP),
        };
        maxX = Math.max(maxX, positions[n.id].x + NODE_W);
      }
    }
    laneBottom[b.id] = cardsTop + lane.rows * (boxH + ROW_GAP) - ROW_GAP;
    y = laneBottom[b.id] + LANE_GAP;
  }
  return { byId, positions, width: maxX + PAD_X, height: y - LANE_GAP + PAD_Y, branchTop, laneBottom };
}

/** A hero block in the corner whose number carries a data hook (`data-cr`, `data-rp`, `data-count`). */
function cornerHero(parent, word, hook) {
  const block = hero('0', word);
  const n = block.querySelector('.k-hero__n');
  const w = block.querySelector('.k-hero__w');
  n.setAttribute(hook, '');
  n.classList.add('fh-heronum', 'fh-data');
  pin(n, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 800, 'wdth' 125",
    color: 'var(--fh-signal)',
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

  mount(rootEl, ctx) {
    this._ctx = ctx;
    this._root = rootEl;
    // `#sf-techtree` stays as an inert hook (probe-frontend-unblind-capture reads `#sf-techtree canvas`).
    rootEl.id = 'sf-techtree';
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu', 'sf-menu-wide', 'sf-techtree');
    rootEl.classList.add('k-screen');
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
    const branchLine = el('p', 'k-t-emph k-62 fh-legend', 'Select a node');
    paintLegend(branchLine);
    head.appendChild(branchLine);
    rootEl.appendChild(head);

    // .k-corner — credits, research points, unlocked n/N as three hero numbers on an edge plate.
    const corner = el('div', 'k-corner');
    corner.setAttribute('aria-label', 'Research resources');
    paintPlate(corner, 'edge', {
      display: 'flex',
      'flex-direction': 'column',
      gap: '8px',
      'text-align': 'right',
    });
    const crEl = cornerHero(corner, 'credits', 'data-cr');
    const rpEl = cornerHero(corner, 'research points', 'data-rp');
    const countEl = cornerHero(corner, 'unlocked', 'data-count');
    setText(countEl, '0/' + TECH_NODES.length);
    rootEl.appendChild(corner);

    // .k-stage — canvas on the held world (leftover orbital fill killed), selected node on a plate.
    const stage = el('div', 'k-stage k-span k-panel k-panel--split');
    pin(stage, {
      background: 'transparent',
      'border-width': '0',
      'box-shadow': 'none',
      'grid-template-columns': 'minmax(0, 1fr) minmax(220px, 310px)',
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
    // The zoom badge pins to the stage's bottom-left (the kit's stage caption slot) and does not scroll.
    const zoomBadge = el('div', 'tt-zoom-badge k-stage__foot k-t-fine k-38 fh-legend', '100% zoom');
    zoomBadge.setAttribute('aria-live', 'off');
    paintLegend(zoomBadge);
    pin(zoomBadge, { background: 'transparent', border: '0', padding: '0' });
    scrollEl.appendChild(zoomBadge);
    stage.appendChild(scrollEl);

    const side = el('div', 'tt-side k-stage--scroll');
    side.setAttribute('aria-label', 'Selected node');
    paintPlate(side, 'sunk', {
      'padding-top': 'calc(80px * var(--k-s))',
      background: 'transparent',
    });
    const selected = el('div');
    selected.setAttribute('data-sel', '');
    const actions = el('div', 'of-pause');
    actions.setAttribute('data-actions', '');
    side.appendChild(selected);
    side.appendChild(actions);
    stage.appendChild(side);
    rootEl.appendChild(stage);

    // .k-foot — the legend as three quiet words; node picker stays the keyboard equivalent.
    const foot = el('footer', 'k-foot');
    foot.setAttribute('aria-label', 'Legend');
    pin(foot, { 'border-top': '0' });
    const availableWord = el('span', 'k-word--fine k-62 fh-legend', 'available');
    paintLegend(availableWord, true);
    const researchedWord = el('span', 'k-word--fine fh-legend', 'researched');
    paintLegend(researchedWord, true);
    researchedWord.setAttribute('data-fh-lit', 'on');
    const lockedWord = el('span', 'k-word--fine k-38 fh-legend', 'locked');
    paintLegend(lockedWord, false);
    foot.appendChild(availableWord);
    foot.appendChild(researchedWord);
    foot.appendChild(lockedWord);
    // Canvas labels have a native keyboard/screen-reader equivalent. Selecting a locked node is
    // allowed: it reveals the exact prerequisite reason without pretending it can be researched.
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
    foot.appendChild(nodeLabel); foot.appendChild(nodeSelect);
    this._nodeSelect = nodeSelect;
    rootEl.appendChild(foot);

    this._regions = { head, corner, stage, foot };
    this._canvas = canvas;
    this._g = canvas.getContext('2d');
    this._layout = buildLayout(this._nodes());
    this._layoutLocale = (typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset.locale) || 'en-US';
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
    const loc = (typeof document !== 'undefined' && document.documentElement && document.documentElement.dataset.locale) || 'en-US';
    if (this._layoutLocale !== loc) {
      this._layout = buildLayout(this._nodes());
      this._layoutLocale = loc;
    }
    const boxH = techTreeNodeHeight(loc);
    const nameLines = techTreeNameLineBudget(loc);
    this._drawSig = this._drawSignature();
    g.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    const w = cv.width / this._dpr, h = cv.height / this._dpr;
    g.clearRect(0, 0, w, h); // transparent: the sky is the ground
    g.imageSmoothingEnabled = true;
    if (g.imageSmoothingQuality) g.imageSmoothingQuality = 'high';

    const nodes = this._nodes();
    const pos = this._layout.positions;
    const zoom = this._zoom || 1;
    const strip = kitImage('plates/plate.legend.strip.png');
    const stripSel = kitImage('plates/plate.row.selected.png');

    // Lane labels sit in each lane's top inset at data size, 38 %; an etched hairline closes the
    // lane below its last tile. Branch identity is lane + word, never hue.
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.lineWidth = 1;
    for (const b of BRANCHES) {
      const top = this._layout.branchTop[b.id];
      if (top == null) continue;
      g.fillStyle = KIT_INK.legend;
      g.globalAlpha = 0.45;
      g.font = kitLegendFont(12, zoom);
      g.fillText(String(b.label).toUpperCase(), PAD_X, top + 2);
      g.globalAlpha = 1;
      const bottom = this._layout.laneBottom[b.id];
      if (bottom != null && bottom + LANE_GAP < this._layout.height - PAD_Y) {
        drawEtchLine(g, PAD_X, bottom + LANE_GAP / 2, this._layout.width - PAD_X);
      }
    }

    // ---- prereq edges: parent's right edge → child's left edge, always pointing right, etched ----
    g.strokeStyle = KIT_INK.hair;
    g.globalAlpha = 1;
    for (const n of nodes) {
      if (!n.prereqs) continue;
      const np = pos[n.id];
      if (!np) continue;
      const childLeft = { x: np.x, y: np.y + boxH / 2 };
      for (const p of n.prereqs) {
        const pp = pos[p];
        if (!pp) continue;
        const parentRight = { x: pp.x + NODE_W, y: pp.y + boxH / 2 };
        const reach = Math.max(COL_GAP * 0.55, (childLeft.x - parentRight.x) * 0.5);
        g.beginPath();
        g.moveTo(parentRight.x, parentRight.y);
        g.bezierCurveTo(parentRight.x + reach, parentRight.y, childLeft.x - reach, childLeft.y, childLeft.x, childLeft.y);
        g.stroke();
      }
    }

    // ---- kit tiles: legend-strip plates, status light, quiet type ----
    for (const n of nodes) {
      const p = pos[n.id];
      if (!p) continue;
      const stt = this._nodeState(n);
      const sel = n.id === this._selectedId;
      const hov = n.id === this._hoverId;
      const px = p.x - PLATE_PAD_X;
      const py = p.y - PLATE_PAD_Y;
      const pw = NODE_W + PLATE_PAD_X * 2;
      const ph = boxH + PLATE_PAD_Y * 2;
      // Lit legend strips are a solid amber bar — they wash the name. Nodes sit on the
      // dark strip; the selected node takes the amber-edge row plate instead.
      const plateImg = sel ? stripSel : strip;
      const slice = sel ? SELECTED_SLICE : STRIP_SLICE;
      g.globalAlpha = stt === 'locked' && !sel ? 0.62 : 1;
      const plated = !forcedColorsActive() && drawNineSlice(g, plateImg, px, py, pw, ph, slice);
      if (!plated) {
        g.fillStyle = KIT_INK[stt];
        g.fillRect(px, py, pw, ph);
        g.strokeStyle = sel ? KIT_INK.signal : KIT_INK.hair;
        g.lineWidth = (sel ? 2 : 1) / zoom;
        g.setLineDash(stt === 'locked' ? [3 / zoom, 3 / zoom] : []);
        g.strokeRect(px, py, pw, ph);
        g.setLineDash([]);
      }
      g.globalAlpha = 1;
      if (!sel && stt !== 'locked') {
        g.fillStyle = stt === 'researched' ? KIT_INK.good : KIT_INK.signal;
        g.fillRect(px + 3, py + 10, 2, Math.max(8, ph - 20));
      }
      const lightKind = stt === 'researched' ? 'good' : stt === 'available' ? (sel || hov ? 'on' : 'dim') : 'off';
      // Status light sits bottom-right so the name still wraps to NODE_W
      // (growth locales already budget every pixel of that box).
      drawLight(g, lightKind, p.x + NODE_W - 10, p.y + boxH - 14);

      g.fillStyle = this._nodeInk(stt, sel, hov);
      g.font = kitFont(sel ? 500 : 400, 16, zoom);
      g.textAlign = 'left'; g.textBaseline = 'top';
      wrapText(g, n.name, p.x, p.y, NODE_W, NAME_LINE_H, nameLines);

      g.font = kitFont(400, 12, zoom);
      g.fillStyle = KIT_INK.bone38;
      g.textBaseline = 'bottom';
      if (stt === 'researched') {
        g.fillText('researched', p.x, p.y + boxH);
      } else {
        const cost = n.cost || {};
        g.fillText(fmtCr(cost.credits || 0) + ' cr · ' + (cost.rp || 0) + ' RP', p.x, p.y + boxH);
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
    this._selectNode(hit.id);
  },

  _selectNode(id) {
    if (!this._nodes().some(node => node.id === id)) return;
    this._selectedId = id;
    if (this._nodeSelect) this._nodeSelect.value = id;
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
    const boxH = techTreeNodeHeight();
    for (const n of this._nodes()) {
      const p = pos[n.id];
      if (!p) continue;
      if (
        mx >= p.x - PLATE_PAD_X && mx <= p.x + NODE_W + PLATE_PAD_X
        && my >= p.y - PLATE_PAD_Y && my <= p.y + boxH + PLATE_PAD_Y
      ) return n;
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

  _paintDossier() {
    const sel = this._els && this._els.selected;
    const actions = this._els && this._els.actions;
    if (sel) {
      const heading = sel.querySelector('h2');
      if (heading) paintMarking(heading);
      for (const cap of sel.querySelectorAll('.k-caps')) paintLegend(cap);
      for (const row of sel.querySelectorAll('.k-row')) paintRow(row);
      for (const p of sel.querySelectorAll('.k-sentence, .k-empty')) paintBody(p);
      const heroN = sel.querySelector('.k-hero__n');
      if (heroN) {
        heroN.classList.add('fh-heronum');
        pin(heroN, {
          'font-family': 'var(--fh-face-display)',
          'font-variation-settings': "'wght' 800, 'wdth' 125",
          color: 'var(--fh-signal)',
        });
      }
      const heroW = sel.querySelector('.k-hero__w');
      if (heroW) paintLegend(heroW, true);
      const rule = sel.querySelector('.k-rule');
      if (rule) paintHairline(rule);
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
      setText(this._els.branch, 'Select a node');
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
  const lines = wrapCanvasLines((value) => g.measureText(value).width, text, maxW);
  const limit = Math.max(1, maxLines || lines.length);
  for (let i = 0; i < Math.min(limit, lines.length); i += 1) {
    g.fillText(lines[i], x, y + i * lineH);
  }
}
