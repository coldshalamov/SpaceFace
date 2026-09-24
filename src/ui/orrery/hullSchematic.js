// src/ui/orrery/hullSchematic.js — a hull on the jig (design/frontend/ORRERY.md §6, the Crucible refit).
//
// The ship stands at the middle of a dial as a drawing in light (its plan render turned into bone
// line work, tools/art/jig_glyph.py). Every hardpoint is a node on its real socket (the render's
// projected hook empties). The labels stand in two balanced columns outside the dial, evenly
// spaced; each hardpoint's line runs from its node out to the rim -- behind the drawing while it
// crosses the ship -- and flat from the rim to its label. The Hand rides the rim to where the lit
// hardpoint's line leaves the ship. A screen hands in its own row elements and keeps their words
// and controls; the schematic only places them, draws the light, and says which one is lit.
//
// Where a hull has no plan render, or there is no layout at all (node tests), it stands down and
// the rows keep their own flow.

import { svg, polar, arcD, ticksD, circularText } from './svg.js';
import { createSpring } from './motion.js';
import { injectOrrery } from './tokens.js';
import { hullPosterUrl } from '../hullPosters.js';
import { loadHullPosterManifest, markForSlot, SLOT_MARKS } from '../ship/hullPoster.js';
import { separateBeads } from '../ship/calloutLayout.js';

const STYLE_ID = 'orr-hull-schematic-style';

const CSS = `
.orr-hull__pool { position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none; }
.orr-hull__art { position:absolute; pointer-events:none; user-select:none; opacity:0;
  transition:opacity .6s var(--dp-ease-out, ease-out); }
.orr-hull__art.is-ready { opacity:1; }
/* a scan of cold light passes down the drawing, masked to the ship's own silhouette */
.orr-hull__scan { position:absolute; pointer-events:none; overflow:hidden;
  -webkit-mask-size:100% 100%; mask-size:100% 100%; -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat; }
.orr-hull__scan::before { content:""; position:absolute; left:0; right:0; top:-30%; height:30%;
  background:linear-gradient(rgb(143 203 255 / 0), rgb(143 203 255 / .12) 70%, rgb(223 238 255 / .34) 97%, rgb(143 203 255 / 0));
  animation:orr-hull-scan 8s cubic-bezier(.45, 0, .25, 1) 1.4s infinite; }
@keyframes orr-hull-scan { 0% { transform:translateY(0); } 55%, 100% { transform:translateY(440%); } }
html.sf-reduce-motion .orr-hull__scan::before { animation:none; opacity:0; }
.orr-hull__svg { position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
.orr-hull__label { position:absolute !important; margin:0 !important; box-sizing:border-box; }
.orr-hull--settled .orr-hull__label { transition:top .34s var(--dp-ease-out, ease-out); }
html.sf-reduce-motion .orr-hull--settled .orr-hull__label { transition:none; }
.orr-svg .orr-hull__leader { transition:stroke .18s linear, opacity .18s linear; }
.orr-svg .orr-hull__leader.is-lit { stroke:var(--dp-hand, #f2b950); opacity:.95; }
.orr-svg .orr-hull__leader--hidden { stroke-dasharray:3 3; }
.orr-svg .orr-hull__leader--hidden.is-lit { opacity:.85; }
.orr-svg .orr-hull__bearing { font-size:10px; font-weight:650; letter-spacing:.08em; fill:rgb(236 230 216 / .5); }
.orr-svg .orr-hull__leader-bloom { opacity:0; transition:opacity .18s linear; }
.orr-svg .orr-hull__leader-bloom.is-lit { opacity:.22; }
.orr-hull__node { transform-box:fill-box; transform-origin:center; transition:transform .28s var(--dp-ease-over, ease-out); }
.orr-hull__node .orr-hull__well { fill:rgb(4 6 9 / .88); stroke:rgb(10 9 8 / .96); stroke-width:4; }
.orr-hull__node .orr-hull__ring { fill:none; stroke:rgb(236 230 216 / .88); stroke-width:1.4; transition:stroke .18s linear; }
.orr-hull__node .orr-hull__core { fill:rgb(246 241 230); transition:fill .18s linear; }
.orr-hull__node .orr-hull__glow { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:8; opacity:0; transition:opacity .18s linear; }
.orr-hull__node.is-open .orr-hull__core { fill:none; }
.orr-hull__node.is-open .orr-hull__ring { stroke-dasharray:3.2 2.2; }
.orr-hull__node.is-bare .orr-hull__ring { stroke:rgb(236 230 216 / .55); stroke-dasharray:3.2 2.2; }
.orr-hull__node .orr-hull__hit { fill:transparent; stroke:none; pointer-events:all; cursor:pointer; }
.orr-hull__node.is-bare .orr-hull__core { fill:none; }
.orr-hull__node.is-lit { transform:scale(1.3); }
.orr-hull__node.is-lit .orr-hull__ring { stroke:var(--dp-hand-hot, #ffd98c); stroke-dasharray:none; }
.orr-hull__node.is-lit .orr-hull__core { fill:var(--dp-hand-hot, #ffd98c); }
.orr-hull__node.is-lit .orr-hull__glow { opacity:.24; }
.orr-svg text.orr-hull__num { font-size:11.5px; font-weight:700; letter-spacing:.04em; fill:rgb(236 230 216 / .86);
  paint-order:stroke; stroke:rgb(4 6 9 / .95); stroke-width:4px; stroke-linejoin:round; }
.orr-svg .orr-hull__fitted { fill:none; stroke-linecap:butt; }
.orr-svg .orr-hull__fitted.is-fitted { stroke:rgb(236 230 216 / .8); }
.orr-svg .orr-hull__fitted.is-empty { stroke:rgb(236 230 216 / .22); }
.orr-svg .orr-hull__fitted.is-lit { stroke:var(--dp-hand, #f2b950); }
.orr-svg text.orr-hull__num.is-lit { fill:var(--dp-hand-hot, #ffd98c); }
.orr-hull__rise { opacity:0; animation:orr-hull-rise .5s var(--dp-ease-out, ease-out) forwards; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-hull-rise { from { opacity:0; } to { opacity:1; } }
html.sf-reduce-motion .orr-hull__rise { animation:none; opacity:1; }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/** Bearing in dial degrees (0 = up, clockwise) from (cx, cy) to (x, y). */
export function bearing(cx, cy, x, y) {
  return ((Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI + 360) % 360;
}

/** The nearest equivalent of `target` degrees to `from`, so the Hand never swings the long way. */
export function nearestTurn(from, target) {
  let t = target;
  while (t - from > 180) t -= 360;
  while (t - from < -180) t += 360;
  return t;
}

/**
 * Two balanced columns: the half of the nodes furthest left label on the left, the rest on the
 * right; each column in the order of its nodes' height, so lines from a column do not cross.
 * Returns { left: [index...], right: [index...] }.
 */
export function splitColumns(points) {
  const order = points.map((_, i) => i).sort((a, b) => (points[a].x - points[b].x) || (a - b));
  const leftCount = Math.floor(points.length / 2);
  const byY = (a, b) => (points[a].y - points[b].y) || (points[a].x - points[b].x) || (a - b);
  return { left: order.slice(0, leftCount).sort(byY), right: order.slice(leftCount).sort(byY) };
}

/**
 * Evenly spaced tops for a column of labels of `heights`, centred on `centre` inside [top, bottom].
 * The gap between labels is as even as the column allows, between `minGap` and `maxGap`.
 */
export function stackEvenly(heights, centre, top, bottom, { minGap = 16, maxGap = 60 } = {}) {
  if (!heights.length) return [];
  const total = heights.reduce((s, h) => s + h, 0);
  const n = heights.length;
  const gap = n > 1 ? Math.max(minGap, Math.min(maxGap, (bottom - top - total) / (n - 1))) : 0;
  const block = total + gap * (n - 1);
  let y = Math.max(top, Math.min(bottom - block, centre - block / 2));
  if (block > bottom - top) y = top;
  return heights.map((h) => { const t = y; y += h + gap; return t; });
}

/**
 * Where a label's line crosses the rim: level with the label's middle while that height meets the
 * ring, else at the ring's shoulder nearest it. `side` is -1 (left) or +1 (right).
 */
export function rimExit(hx, hy, R, side, y) {
  const lim = R * 0.92;
  const dy = Math.max(-lim, Math.min(lim, y - hy));
  return [hx + side * Math.sqrt(R * R - dy * dy), hy + dy];
}

const INERT = Object.freeze({
  setHull() {}, setNodes() {}, light() {}, lit: () => -1, relayout() {}, active: () => false,
  laidOutAt: () => 0, dispose() {},
});

/**
 * @param {object} o
 * @param {HTMLElement} o.host the stage the schematic fills (positioned; the labels live inside it)
 * @param {() => Element[]} [o.avoid] chrome the labels and the ship keep clear of (title, keys)
 * @param {number} [o.labelWidth] label column width in px
 */
export function createHullSchematic({ host, avoid = () => [], onPick = null, labelWidth = 300, gap = 34, edge = 72, allowNone = false } = {}) {
  const doc = host && host.ownerDocument;
  if (!doc || typeof doc.createElementNS !== 'function' || typeof host.getBoundingClientRect !== 'function'
    || typeof doc.createElement !== 'function') return INERT;
  injectOrrery(doc);
  injectStyle(doc);

  const pool = doc.createElement('div');
  pool.className = 'orr-hull__pool';
  const under = svg('svg', { class: 'orr-svg orr-hull__svg orr-hull__svg--under' });
  const art = doc.createElement('img');
  art.className = 'orr-hull__art';
  art.alt = '';
  art.decoding = 'async';
  art.draggable = false;
  art.hidden = true;
  const scan = doc.createElement('div');
  scan.className = 'orr-hull__scan';
  scan.hidden = true;
  const layer = svg('svg', { class: 'orr-svg orr-hull__svg' });
  for (const n of [pool, under, art, scan, layer]) n.setAttribute('aria-hidden', 'true');
  host.prepend(pool, under, art, scan, layer);

  let hullId = null;
  let nodes = [];
  let engraving = '';
  let litIndex = -1;
  let manifest = null;
  let on = false;
  let arrived = false;
  let frame = 0;
  let laidOut = 0;
  let geo = null; // { hx, hy, R, angles: [] }
  let nodeEls = [];
  let numEls = [];
  let leaderEls = [];
  let segEls = [];
  let hand = null;
  let litChangedAt = -1e9;
  // the drawing's own coverage, sampled once per picture, so a line knows where it is hidden
  let alphaMap = null;
  function sampleArt() {
    alphaMap = null;
    try {
      const c = doc.createElement('canvas');
      c.width = 256; c.height = 256;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(art, 0, 0, 256, 256);
      alphaMap = g.getImageData(0, 0, 256, 256).data;
    } catch (_) { alphaMap = null; }
  }

  const schedule = () => {
    if (frame) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== 'function') { relayout(); return; }
    frame = raf(() => { frame = 0; relayout(); });
  };

  art.addEventListener('load', () => { art.classList.add('is-ready'); sampleArt(); schedule(); });
  art.addEventListener('error', () => schedule());
  loadHullPosterManifest().then((m) => { manifest = m; schedule(); });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null;
  if (ro) ro.observe(host);
  if (doc.fonts && doc.fonts.ready && typeof doc.fonts.ready.then === 'function') doc.fonts.ready.then(() => schedule());

  // near-critically damped: the Hand crosses the rim in about a quarter of a second and stops
  const spring = createSpring({ value: 0, preset: { k: 240, c: 29 }, onUpdate: (deg) => paintHand(deg) });
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  /** The plan view's entry (its size and marks); the drawing shares its frame exactly. */
  function entry() {
    const hull = manifest && manifest.hulls && manifest.hulls[hullId];
    return hull && hull.top && hull.top.marks ? hull.top : null;
  }

  function paintHand(deg) {
    if (!hand || !geo) return;
    const { hx, hy, R } = geo;
    const half = (Math.atan(8 / (R + 22)) * 180) / Math.PI;
    const [tx, ty] = polar(hx, hy, R + 2, deg);
    const [bx0, by0] = polar(hx, hy, R + 22, deg - half);
    const [bx1, by1] = polar(hx, hy, R + 22, deg + half);
    const [kx, ky] = polar(hx, hy, R + 18, deg);
    // a blade with a notched heel, pointing in at the ring
    hand.blade.setAttribute('d', `M ${bx0.toFixed(1)} ${by0.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} L ${bx1.toFixed(1)} ${by1.toFixed(1)} L ${kx.toFixed(1)} ${ky.toFixed(1)} Z`);
    // its glow lies along the blade only (a longer one read as a smudge beyond the heel)
    const [ox, oy] = polar(hx, hy, R + 16, deg);
    const [ix, iy] = polar(hx, hy, R + 5, deg);
    hand.bloom.setAttribute('d', `M ${ox.toFixed(1)} ${oy.toFixed(1)} L ${ix.toFixed(1)} ${iy.toFixed(1)}`);
    const g = arcD(hx, hy, R, deg - 9, deg + 9);
    hand.glint.setAttribute('d', g);
    hand.glintBloom.setAttribute('d', g);
    const [cx, cy] = polar(hx, hy, R, deg);
    hand.bead.setAttribute('cx', cx.toFixed(1));
    hand.bead.setAttribute('cy', cy.toFixed(1));
  }

  function paintLit(instant) {
    nodeEls.forEach((n, i) => { if (n) n.classList.toggle('is-lit', i === litIndex); });
    numEls.forEach((n, i) => { if (n) n.classList.toggle('is-lit', i === litIndex); });
    leaderEls.forEach((set, i) => { if (set) for (const p of set) p.classList.toggle('is-lit', i === litIndex); });
    segEls.forEach((s, i) => { if (s) s.classList.toggle('is-lit', i === litIndex); });
    if (!geo || !hand) return;
    const target = geo.angles[litIndex];
    const visible = on && Number.isFinite(target);
    // visibility, not opacity: the arrival animation owns opacity and would hold it at 1
    hand.g.setAttribute('visibility', visible ? 'visible' : 'hidden');
    if (!visible) return;
    spring.set(nearestTurn(spring.value, target), { instant });
  }

  function markLabels() {
    nodes.forEach((n, i) => { if (n && n.el && n.el.classList) n.el.classList.toggle('is-lit', i === litIndex); });
  }

  function standDown() {
    on = false;
    host.classList.remove('orr-hull--on', 'orr-hull--settled');
    art.hidden = true;
    scan.hidden = true;
    pool.style.display = 'none';
    layer.textContent = '';
    under.textContent = '';
    nodeEls = []; numEls = []; leaderEls = []; segEls = []; hand = null; geo = null;
    for (const n of nodes) {
      if (!n || !n.el || !n.el.style) continue;
      n.el.classList.remove('orr-hull__label', 'is-left', 'is-right');
      for (const p of ['left', 'top', 'width']) n.el.style.removeProperty(p);
    }
  }

  function relayout() {
    const artUrl = hullPosterUrl(hullId, 'jig') || hullPosterUrl(hullId, 'top');
    const info = entry();
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (!artUrl || !info || W < 480 || H < 320 || !nodes.length) { standDown(); return; }
    on = true;
    host.classList.add('orr-hull--on');
    if (art.getAttribute('src') !== artUrl) { art.classList.remove('is-ready'); alphaMap = null; art.src = artUrl; }
    if (art.complete && art.naturalWidth) { art.classList.add('is-ready'); if (!alphaMap) sampleArt(); }
    art.hidden = false;
    pool.style.display = '';
    markLabels();

    const hb = host.getBoundingClientRect();
    const local = (r, pad) => ({ left: r.left - hb.left - pad, top: r.top - hb.top - pad, right: r.right - hb.left + pad, bottom: r.bottom - hb.top + pad });
    const obstacles = [];
    for (const el of avoid() || []) {
      if (!el || typeof el.getBoundingClientRect !== 'function') continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) obstacles.push(local(r, 12));
    }
    // the ship's band: chrome that crosses the middle third pushes the band off it
    const region = { left: edge, right: W - edge, top: 28, bottom: H - 28 };
    const midL = W * 0.34; const midR = W * 0.66;
    for (const ob of obstacles) {
      if (ob.right <= midL || ob.left >= midR) continue;
      if ((ob.top + ob.bottom) / 2 < H / 2) region.top = Math.max(region.top, ob.bottom);
      else region.bottom = Math.min(region.bottom, ob.top);
    }

    // label heights at the column width
    for (const n of nodes) {
      n.el.classList.add('orr-hull__label');
      n.el.style.width = `${labelWidth}px`;
    }
    const heights = nodes.map((n) => Math.max(24, n.el.offsetHeight || 64));

    // the dial: as large as the band allows with a label column clear of it on each side (the band
    // also holds the drifting orbit above and the engraving below: 52 px of it each side)
    const R = Math.max(110, Math.min(W / 2 - edge - gap - labelWidth, (region.bottom - region.top) / 2 - 52));
    const hx = (region.left + region.right) / 2;
    const hy = (region.top + region.bottom) / 2;
    // the drawing: the plan frame is square with the ship inside ~0.85 of it; the ship's length fills
    // the dial's diameter less a margin
    const aspect = info.width && info.height ? info.width / info.height : 1;
    const imgH = (2 * R - 20) / 0.86;
    const imgW = imgH * aspect;
    const imgRect = { left: hx - imgW / 2, top: hy - imgH / 2, width: imgW, height: imgH };
    Object.assign(art.style, { left: `${Math.round(imgRect.left)}px`, top: `${Math.round(imgRect.top)}px`, width: `${Math.round(imgW)}px`, height: `${Math.round(imgH)}px` });
    Object.assign(scan.style, { left: art.style.left, top: art.style.top, width: art.style.width, height: art.style.height });
    scan.style.webkitMaskImage = `url("${artUrl}")`;
    scan.style.maskImage = `url("${artUrl}")`;
    scan.hidden = false;
    const reach = R + gap + labelWidth + 60;
    pool.style.background = `radial-gradient(circle at ${Math.round(hx)}px ${Math.round(hy)}px, rgb(4 6 9 / .66) 0, rgb(4 6 9 / .74) ${Math.round(reach)}px, rgb(4 6 9 / .86) 100%)`;

    // the beads on the render's own sockets; several of one type spread along their mark
    const totals = {};
    const ordinals = nodes.map((n) => { totals[n.slotType] = (totals[n.slotType] || 0) + 1; return totals[n.slotType] - 1; });
    const uvs = nodes.map((n, i) => markForSlot(info.marks, n.slotType, ordinals[i], totals[n.slotType]) || [0.5, 0.5]);
    for (const type of Object.keys(totals)) {
      if (totals[type] < 2 || (SLOT_MARKS[type] || []).length > 1) continue;
      const members = nodes.map((n, i) => i).filter((i) => nodes[i].slotType === type);
      const base = members.reduce((s, i) => s + uvs[i][0], 0) / members.length;
      members.forEach((i, k) => { uvs[i] = [base + (k - (members.length - 1) / 2) * 0.062, uvs[i][1]]; });
    }
    let points = uvs.map(([u, v]) => ({ x: imgRect.left + u * imgW, y: imgRect.top + v * imgH }));
    points = separateBeads(points, 22);

    // two balanced columns, evenly spaced, each clear of the chrome in its lane; sides and order come
    // from the image's own coordinates, so they are the same at every screen size
    const cols = splitColumns(uvs.map(([u, v]) => ({ x: u, y: v })));
    const tops = new Array(nodes.length);
    const sides = new Array(nodes.length);
    for (const [key, side] of [['left', -1], ['right', 1]]) {
      const list = cols[key];
      if (!list.length) continue;
      const colLeft = side < 0 ? hx - R - gap - labelWidth : hx + R + gap;
      const colRight = colLeft + labelWidth;
      let top = 24; let bottom = H - 24;
      for (const ob of obstacles) {
        if (ob.right <= colLeft || ob.left >= colRight) continue;
        if ((ob.top + ob.bottom) / 2 < hy) top = Math.max(top, ob.bottom);
        else bottom = Math.min(bottom, ob.top);
      }
      const t = stackEvenly(list.map((i) => heights[i]), hy, top, bottom, { minGap: 16, maxGap: 56 });
      list.forEach((i, k) => { tops[i] = t[k]; sides[i] = side; });
    }

    // the labels, in their own offset frame
    nodes.forEach((n, i) => {
      const el = n.el;
      const side = sides[i];
      const left = side < 0 ? hx - R - gap - labelWidth : hx + R + gap;
      const op = el.offsetParent;
      const ob = op && typeof op.getBoundingClientRect === 'function' ? op.getBoundingClientRect() : hb;
      el.style.left = `${Math.round(left + hb.left - ob.left)}px`;
      el.style.top = `${Math.round(tops[i] + hb.top - ob.top)}px`;
      el.classList.toggle('is-left', side < 0);
      el.classList.toggle('is-right', side > 0);
    });

    // the light
    for (const l of [layer, under]) { l.setAttribute('viewBox', `0 0 ${W} ${H}`); l.textContent = ''; }
    const rise = (node, delay) => {
      if (arrived) return node;
      node.classList.add('orr-hull__rise');
      node.style.setProperty('--orr-delay', `${delay}ms`);
      return node;
    };
    const dial = svg('g', { class: 'orr-hull__dial' });
    dial.append(
      svg('path', { d: arcD(hx, hy, R, 0, 360), class: 'orr-core orr-rest', 'stroke-width': 1 }),
      svg('path', { d: ticksD(hx, hy, R, 72, { len: 3, major: 6, majorLen: 8 }), class: 'orr-core orr-faint', 'stroke-width': 1 }),
    );
    const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${hx.toFixed(1)}px ${hy.toFixed(1)}px; --orr-drift-s:720s` });
    drift.appendChild(svg('path', { d: ticksD(hx, hy, R + 30, 48, { len: 4, inward: false }), class: 'orr-core orr-faint', 'stroke-width': 1 }));
    dial.appendChild(drift);
    layer.appendChild(rise(dial, 0));

    geo = { hx, hy, R, angles: [] };
    leaderEls = []; nodeEls = []; numEls = [];
    const exits = [];
    const hidden = [];
    // the bearing scale: a numeral every 30 degrees just inside the rim, where no line leaves
    for (let deg = 30; deg < 360 && W >= 1440; deg += 30) {
      const near = (a) => Math.abs(((a - deg + 540) % 360) - 180) < 7;
      if (deg === 180) continue;
      const [bx, by] = polar(hx, hy, R - 17, deg);
      const t = svg('text', { x: bx.toFixed(1), y: (by + 3).toFixed(1), 'text-anchor': 'middle', class: 'orr-hull__bearing', 'data-deg': deg });
      t.textContent = String(deg).padStart(3, '0');
      t._near = near;
      layer.appendChild(rise(t, 60));
    }
    nodes.forEach((n, i) => {
      const p = points[i];
      const side = sides[i];
      const cy = tops[i] + Math.min(heights[i], 44) / 2 + 2;
      const [ex, ey] = rimExit(hx, hy, R, side, cy);
      exits[i] = [ex, ey];
      const colEdge = side < 0 ? hx - R - gap + 6 : hx + R + gap - 6;
      geo.angles[i] = bearing(hx, hy, ex, ey);
      // inside the ring the line runs behind the drawing; outside it runs flat to its label
      const inner = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      const outer = Math.abs(cy - ey) < 4
        ? `M ${ex.toFixed(1)} ${ey.toFixed(1)} L ${colEdge.toFixed(1)} ${cy.toFixed(1)}`
        : `M ${ex.toFixed(1)} ${ey.toFixed(1)} L ${(ex + side * 10).toFixed(1)} ${ey.toFixed(1)} L ${(colEdge - side * 22).toFixed(1)} ${cy.toFixed(1)} L ${colEdge.toFixed(1)} ${cy.toFixed(1)}`;
      const stop = `M ${colEdge.toFixed(1)} ${(cy - 5).toFixed(1)} L ${colEdge.toFixed(1)} ${(cy + 5).toFixed(1)}`;
      // where it crosses the ship it is a hidden line, a fine dash over the drawing; over open glass
      // it is a plain line -- the run is split at the silhouette
      const overShip = (x, y) => {
        if (!alphaMap) return true;
        const u = (x - imgRect.left) / imgW; const v = (y - imgRect.top) / imgH;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
        return alphaMap[(((v * 256) | 0) * 256 + ((u * 256) | 0)) * 4 + 3] > 120;
      };
      const runLen = Math.hypot(ex - p.x, ey - p.y);
      const steps = Math.max(2, Math.ceil(runLen / 4));
      const runs = [];
      let from = 0; let state = overShip(p.x, p.y);
      for (let k = 1; k <= steps; k += 1) {
        const t = k / steps;
        const s = overShip(p.x + (ex - p.x) * t, p.y + (ey - p.y) * t);
        if (s !== state || k === steps) { runs.push([from, t, state]); from = t; state = s; }
      }
      const at = (t) => `${(p.x + (ex - p.x) * t).toFixed(1)} ${(p.y + (ey - p.y) * t).toFixed(1)}`;
      const hiddenD = runs.filter((r) => r[2]).map((r) => `M ${at(r[0])} L ${at(r[1])}`).join(' ');
      const openD = runs.filter((r) => !r[2]).map((r) => `M ${at(r[0])} L ${at(r[1])}`).join(' ');
      const lineUnder = svg('path', { d: hiddenD || 'M 0 0', class: 'orr-core orr-hi orr-hull__leader orr-hull__leader--hidden', 'stroke-width': 1, opacity: '.34' });
      const lineOpen = svg('path', { d: openD || 'M 0 0', class: 'orr-core orr-hi orr-hull__leader', 'stroke-width': 1, opacity: '.72' });
      layer.appendChild(rise(lineOpen, 120 + i * 40));
      const bloom = svg('path', { d: outer, class: 'orr-bloom orr-hand orr-hull__leader-bloom', 'stroke-width': 5, opacity: '0' });
      const lineOver = svg('path', { d: `${outer} ${stop}`, class: 'orr-core orr-hi orr-hull__leader', 'stroke-width': 1, opacity: '.72' });
      hidden.push(rise(lineUnder, 120 + i * 40));
      layer.appendChild(rise(bloom, 120 + i * 40));
      layer.appendChild(rise(lineOver, 120 + i * 40));
      leaderEls[i] = [lineUnder, lineOpen, bloom, lineOver];
      // the tick on the rim where this line leaves the ship
      const [t1x, t1y] = polar(hx, hy, R + 7, geo.angles[i]);
      layer.appendChild(rise(svg('path', { d: `M ${ex.toFixed(1)} ${ey.toFixed(1)} L ${t1x.toFixed(1)} ${t1y.toFixed(1)}`, class: 'orr-core orr-hi', 'stroke-width': 1.2 }), 120 + i * 40));
    });
    for (const h of hidden) layer.appendChild(h);
    for (const t of layer.querySelectorAll('.orr-hull__bearing')) {
      if (geo.angles.some((a) => t._near(a))) t.remove();
    }
    // the fitted gauge and the engraving sit on the dial where no hardpoint's line crosses it: the
    // bottom if it is free, else the top, else nowhere
    // the engraving carries the ship's length (the plan view's own measure) after its name
    const lengthM = Array.isArray(info.hullSize) ? Number(info.hullSize[info.longAxis || 0]) : NaN;
    const withLength = engraving && Number.isFinite(lengthM) && lengthM > 0
      ? engraving.replace(/^([^·]+?)(\s*·|$)/, `$1 · ${lengthM.toFixed(1)} m$2`) : engraving;
    const text = withLength ? withLength.toUpperCase() : '';
    const spanDeg = Math.max(36, ((text.length * 9.4) / (R + 46)) * (180 / Math.PI) + 8);
    const clear = (mid) => geo.angles.every((a) => Math.abs(((a - mid + 540) % 360) - 180) > spanDeg / 2 + 5);
    const at = clear(180) ? 180 : clear(0) ? 0 : null;
    segEls = [];
    if (at != null) {
      const n = nodes.length;
      const segSpan = Math.min(spanDeg, 8 * n + 8);
      const step = segSpan / n;
      const bottom = at === 180;
      nodes.forEach((node, i) => {
        // read left to right whichever arc it is on
        const k = bottom ? n - 1 - i : i;
        const s0 = at - segSpan / 2 + k * step + 0.9;
        const seg = svg('path', {
          d: arcD(hx, hy, R + 16, s0, s0 + step - 1.8),
          class: `orr-hull__fitted ${node.state === 'fitted' ? 'is-fitted' : 'is-empty'}`, 'stroke-width': 4,
        });
        layer.appendChild(rise(seg, 160 + i * 30));
        segEls[i] = seg;
      });
      if (text) {
        layer.appendChild(rise(circularText(hx, hy, R + 38, text, {
          startDeg: bottom ? 270 : 90, size: 10, className: 'orr-micro', anchor: 'middle', upright: bottom,
        }), 200));
      }
    }
    // nodes and their numerals over the lines
    const placedNums = [];
    points.forEach((p, i) => {
      const kind = nodes[i].state === 'fitted' ? 'is-fitted' : nodes[i].state === 'open' ? 'is-open' : 'is-bare';
      const g = svg('g', { class: `orr-hull__node ${kind}` });
      g.append(
        svg('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 12, class: 'orr-hull__glow' }),
        svg('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 9.5, class: 'orr-hull__well' }),
        svg('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 8, class: 'orr-hull__ring' }),
        svg('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 3, class: 'orr-hull__core' }),
        svg('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 14, class: 'orr-hull__hit' }),
      );
      if (typeof onPick === 'function') g.addEventListener('click', () => onPick(i));
      layer.appendChild(rise(g, 200 + i * 40));
      nodeEls[i] = g;
      // the numeral beside its node: out along the way its line leaves, else the first of eight
      // places round the node clear of every node and every numeral already set
      const [ex, ey] = exits[i];
      const len = Math.hypot(ex - p.x, ey - p.y) || 1;
      const base = Math.atan2((ey - p.y) / len, (ex - p.x) / len);
      let spot = null;
      for (const turn of [0, 0.785, -0.785, 1.571, -1.571, 2.356, -2.356, 3.142]) {
        const a = base + turn;
        const cxn = p.x + Math.cos(a) * 21; const cyn = p.y + Math.sin(a) * 21;
        const box = { l: cxn - 9, r: cxn + 9, t: cyn - 7, b: cyn + 7 };
        const hitsNode = points.some((q, j) => j !== i && q.x > box.l - 10 && q.x < box.r + 10 && q.y > box.t - 10 && q.y < box.b + 10);
        const hitsNum = placedNums.some((o) => o.l < box.r && o.r > box.l && o.t < box.b && o.b > box.t);
        if (!hitsNode && !hitsNum) { spot = { x: cxn, y: cyn, box }; break; }
      }
      if (!spot) {
        const cxn = p.x + Math.cos(base) * 21; const cyn = p.y + Math.sin(base) * 21;
        spot = { x: cxn, y: cyn, box: { l: cxn - 9, r: cxn + 9, t: cyn - 7, b: cyn + 7 } };
      }
      placedNums.push(spot.box);
      const num = svg('text', {
        x: spot.x.toFixed(1), y: (spot.y + 4).toFixed(1), class: 'orr-hull__num', 'text-anchor': 'middle',
      });
      num.textContent = nodes[i].num || String(i + 1).padStart(2, '0');
      layer.appendChild(rise(num, 240 + i * 40));
      numEls[i] = num;
    });
    // the Hand: the rim's glint, the index and its glow, one bead on the ring
    const hg = svg('g', { class: 'orr-hull__hand' });
    hand = {
      g: hg,
      glintBloom: svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 6, opacity: '.22' }),
      glint: svg('path', { d: '', class: 'orr-core orr-hand', 'stroke-width': 1.6 }),
      bloom: svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 10, opacity: '.28' }),
      blade: svg('path', { d: '', fill: 'var(--dp-hand, #f2b950)' }),
      bead: svg('circle', { r: 3, fill: 'var(--dp-hand-hot, #ffd98c)' }),
    };
    hg.append(hand.glintBloom, hand.glint, hand.bloom, hand.blade, hand.bead);
    layer.appendChild(rise(hg, 360));
    const first = !arrived;
    arrived = true;
    // the refit always has a hardpoint in hand; a screen that rests with nothing chosen passes allowNone
    if (litIndex >= nodes.length || (!allowNone && litIndex < 0)) litIndex = allowNone ? -1 : 0;
    markLabels();
    paintLit(first || now() - litChangedAt > 450);
    paintHand(spring.value);
    laidOut = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    // after the first placement, labels glide when a lit label unfolds and its column re-spaces
    if (first) {
      const raf = globalThis.requestAnimationFrame;
      if (typeof raf === 'function') raf(() => host.classList.add('orr-hull--settled'));
    }
  }

  return {
    /** Which hull stands on the jig. */
    setHull(next) {
      if (next === hullId) return;
      hullId = next || null;
      arrived = false;
      host.classList.remove('orr-hull--settled');
      schedule();
    },
    /**
     * The hardpoints, in slot order: `el` is the screen's own label element, `state` is
     * 'fitted' | 'open' (empty, a spare fits) | 'bare' (empty, nothing fits); `num` is the numeral
     * drawn beside its node.
     */
    setNodes(next, { engraving: text = '' } = {}) {
      nodes = Array.isArray(next) ? next.filter((n) => n && n.el) : [];
      engraving = text || '';
      markLabels();
      schedule();
    },
    /**
     * Light one hardpoint: its node, its line, its label (which may unfold), and the Hand goes to it --
     * swinging when the player chose it, placed when the screen did (`swing: false`).
     */
    light(index, { swing = true } = {}) {
      if (!Number.isInteger(index) || index === litIndex) return;
      litIndex = index;
      if (swing) litChangedAt = now();
      markLabels();
      paintLit(!swing);
      // a lit label can change height (it unfolds its choices): its column re-spaces
      schedule();
    },
    lit: () => litIndex,
    relayout: schedule,
    active: () => on,
    /** When the labels last moved (a pointer resting where a label moved to is not a choice). */
    laidOutAt: () => laidOut,
    dispose() {
      if (ro) ro.disconnect();
      spring.stop();
      if (frame && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frame);
      frame = 0;
      standDown();
      for (const n of [pool, under, art, scan, layer]) if (n.parentNode) n.parentNode.removeChild(n);
    },
  };
}
