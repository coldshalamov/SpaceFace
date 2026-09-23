// ORRERY Stop Scale (design/frontend/ORRERY.md §4 #8 Scale + #2 the Hand; §6 New game: the starter
// hulls as stations, difficulty as a stop selector with the Hand).
//
// A ruled line of light with a station per choice and an amber index that slides (on the shared
// spring, one slight overshoot) to the chosen station. It builds no controls: it takes a row of real
// buttons a screen already made — aria-pressed marks the choice; the screen keeps its roving focus,
// Tab stops and click handlers — and only seats them under their stations and draws the scale.
// Optional produced art per station (a hull's holo plan view) stands above the ruler.
//
// (A dial was tried first: four labelled stops on a dial narrow enough for a form column put the two
// middle labels on top of each other, and the needle crossed the hull art. A scale keeps every
// station a full column apart.)
import { svg } from './svg.js';
import { createSpring } from './motion.js';
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-stopscale-style';
const CSS = `
.orr-stopscale { position:relative; width:var(--orr-scale-w, 460px); height:var(--orr-scale-h, 76px); margin:4px 0 2px; }
.orr-stopscale > svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.orr-stopscale > .orr-stopscale__row { position:absolute !important; inset:0; margin:0 !important; padding:0 !important; display:block !important; }
.orr-stopscale > .orr-stopscale__row > li { position:absolute; margin:0; transform:translateX(-50%); list-style:none; text-align:center; }
.orr-stoparc { position:relative; width:var(--orr-arc-w, 560px); height:var(--orr-arc-h, 220px); }
.orr-stoparc > svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.orr-stoparc > .orr-stoparc__row { position:absolute !important; inset:0; margin:0 !important; padding:0 !important; display:block !important; }
.orr-stoparc > .orr-stoparc__row > li { position:absolute; margin:0; transform:translateX(-50%); list-style:none; text-align:center; }
.orr-turntable { position:absolute; inset:0; pointer-events:none; z-index:3; }
.orr-turntable > svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.orr-turntable > .orr-turntable__row { position:absolute !important; inset:0; margin:0 !important; padding:0 !important; display:block !important; }
.orr-turntable > .orr-turntable__row > li { position:absolute; margin:0; transform:translateX(-50%); list-style:none; text-align:center; pointer-events:auto; }
.orr-turntable__art { position:absolute; transform:translateX(-50%); pointer-events:none; opacity:.46; background:center / 178% auto no-repeat;
  filter:saturate(.6) brightness(.8); transition:opacity .22s linear, filter .22s linear, transform .3s var(--dp-ease-out, ease-out); }
.orr-turntable__art.is-on { opacity:1; filter:saturate(1) brightness(1.05) drop-shadow(0 0 16px rgb(255 226 178 / .25)); transform:translateX(-50%) scale(1.1); }
html.sf-reduce-motion .orr-turntable__art { transition:none; }
.orr-stationrow { position:relative !important; padding-bottom:26px !important; }
.orr-stationrow > .orr-stationrow__rule { position:absolute; left:0; right:0; bottom:0; width:100%; height:20px; overflow:visible; pointer-events:none; }
.orr-stopscale__art { position:absolute; transform:translate(-50%, -50%); pointer-events:none; opacity:.42;
  background:center / contain no-repeat; transition:opacity .2s linear, transform .32s var(--dp-ease-out, ease-out), filter .2s linear; }
.orr-stopscale__art.is-on { opacity:1; transform:translate(-50%, -50%) scale(1.14); filter:drop-shadow(0 0 12px rgb(223 238 255 / .4)); }
html.sf-reduce-motion .orr-stopscale__art { transition:none; }
`;

function injectStyle(doc) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/**
 * @param {object} o
 * @param {HTMLElement} o.row        the row (ul) of buttons; the one with aria-pressed="true" is the choice
 * @param {number} [o.width]         scale width in px
 * @param {Object<string,string>} [o.art]  per-button produced art: data-action -> image url
 * @param {number} [o.artSize]       art size in px
 */
export function createStopScale({ row, width = 460, art = null, artSize = 72 } = {}) {
  const doc = (row && row.ownerDocument) || globalThis.document;
  if (!row || !doc || typeof doc.createElementNS !== 'function' || !row.parentNode) {
    return { el: null, update() {}, dispose() {} };
  }
  injectOrrery();
  injectStyle(doc);
  const hasArt = !!art;
  const ruleY = hasArt ? artSize + 26 : 16;
  // room under the ruler for a word and its one-line sub (a row without subs needs less)
  const hasSub = !!row.querySelector('.k-word-sub, .dp-menu__note, .dp-lit__note');
  const H = ruleY + (hasSub ? 56 : 40);
  const pad = 46;
  const wrap = doc.createElement('div');
  wrap.className = 'orr-stopscale';
  wrap.style.setProperty('--orr-scale-w', `${width}px`);
  wrap.style.setProperty('--orr-scale-h', `${H}px`);
  row.parentNode.insertBefore(wrap, row);
  const face = svg('svg', { class: 'orr-svg', viewBox: `0 0 ${width} ${H}`, 'aria-hidden': 'true' });
  wrap.appendChild(face);
  wrap.appendChild(row);
  row.classList.add('orr-stopscale__row');

  const items = () => [...row.children].filter((li) => li.querySelector && li.querySelector('button'));
  const n = Math.max(1, items().length);
  const xs = Array.from({ length: n }, (_, i) => (n > 1 ? pad + (i * (width - pad * 2)) / (n - 1) : width / 2));

  // the ruler: a line of light, fine graduations, a heavier tick at each station
  const x0 = Math.max(2, pad - 26);
  const x1 = Math.min(width - 2, width - pad + 26);
  face.appendChild(svg('path', { d: `M ${x0} ${ruleY} L ${x1} ${ruleY}`, class: 'orr-core orr-rest', 'stroke-width': 1 }));
  const fine = [];
  for (let x = x0 + 4; x < x1; x += 8) fine.push(`M ${x.toFixed(1)} ${ruleY} L ${x.toFixed(1)} ${ruleY + 4}`);
  face.appendChild(svg('path', { d: fine.join(' '), class: 'orr-core orr-faint', 'stroke-width': 1 }));
  const stationTicks = xs.map((x) => {
    const t = svg('path', { d: `M ${x.toFixed(1)} ${ruleY - 6} L ${x.toFixed(1)} ${ruleY + 8}`, class: 'orr-core orr-hi', 'stroke-width': 1.5 });
    face.appendChild(t);
    return t;
  });
  // the index: a short amber blade standing on the ruler, a bead at its foot, a faint bloom
  const bloom = svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 7, opacity: '.22' });
  const blade = svg('path', { d: '', fill: 'var(--dp-hand, #f2b950)' });
  const beadBloom = svg('circle', { r: 7, fill: 'var(--dp-hand, #f2b950)', opacity: '.22' });
  const bead = svg('circle', { r: 3.4, fill: 'var(--dp-hand-hot, #ffd98c)' });
  face.append(bloom, blade, beadBloom, bead);
  const top = ruleY - 16;
  const paint = (x) => {
    blade.setAttribute('d', `M ${(x - 2).toFixed(1)} ${ruleY} L ${x.toFixed(1)} ${top} L ${(x + 2).toFixed(1)} ${ruleY} Z`);
    bloom.setAttribute('d', `M ${x.toFixed(1)} ${ruleY} L ${x.toFixed(1)} ${top}`);
    for (const b of [bead, beadBloom]) { b.setAttribute('cx', x.toFixed(1)); b.setAttribute('cy', String(ruleY)); }
  };
  const spring = createSpring({ value: xs[0], preset: { k: 300, c: 25 }, onUpdate: paint });
  paint(xs[0]);

  // seat each button under its station; the art stands above it
  const arts = [];
  items().forEach((li, i) => {
    li.style.left = `${xs[i].toFixed(1)}px`;
    li.style.top = `${ruleY + 14}px`;
    const action = li.querySelector('button').dataset.action;
    if (hasArt && art[action]) {
      const img = doc.createElement('div');
      img.className = 'orr-stopscale__art';
      Object.assign(img.style, { left: `${xs[i].toFixed(1)}px`, top: `${(ruleY - 12 - artSize / 2).toFixed(1)}px`, width: `${artSize}px`, height: `${artSize}px`, backgroundImage: `url("${art[action]}")` });
      wrap.insertBefore(img, row);
      arts[i] = img;
    }
  });

  let current = -1;
  function update({ instant = false } = {}) {
    let idx = items().findIndex((li) => li.querySelector('button[aria-pressed="true"]'));
    if (idx < 0) idx = 0;
    if (idx === current && !instant) return;
    current = idx;
    spring.set(xs[idx], { instant });
    stationTicks.forEach((t, i) => {
      t.setAttribute('class', `orr-core ${i === idx ? 'orr-hand' : 'orr-hi'}`);
      t.setAttribute('opacity', i === idx ? '1' : '.5');
    });
    arts.forEach((img, i) => { if (img) img.classList.toggle('is-on', i === idx); });
  }
  // the screen flips aria-pressed on pick: follow it without the screen having to call us
  let mo = null;
  if (typeof MutationObserver === 'function') {
    mo = new MutationObserver(() => update());
    mo.observe(row, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  }
  update({ instant: true });
  return {
    el: wrap,
    update,
    dispose() { spring.stop(); if (mo) mo.disconnect(); },
  };
}

/** Kept for callers of the first draft; the dial became a scale (see the file note). */
export const createStopDial = createStopScale;

/**
 * Stop ARC: the wide form, for a stage rather than a form column. Stations ride an upward arc with a
 * visible hub beneath it; the amber Hand rises from the hub to the chosen station; each station can
 * carry produced art (a hull's holo plan view) with its word above it. Same contract as the scale:
 * it seats the screen's own buttons and follows aria-pressed.
 */
export function createStopArc({ row, width = 560, radius = 160, span = 84, art = null, artSize = 46 } = {}) {
  const doc = (row && row.ownerDocument) || globalThis.document;
  if (!row || !doc || typeof doc.createElementNS !== 'function' || !row.parentNode) {
    return { el: null, update() {}, dispose() {} };
  }
  injectOrrery();
  injectStyle(doc);
  const H = radius + 58;
  const cx = width / 2;
  const cy = H - 18;
  const wrap = doc.createElement('div');
  wrap.className = 'orr-stoparc';
  wrap.style.setProperty('--orr-arc-w', `${width}px`);
  wrap.style.setProperty('--orr-arc-h', `${H}px`);
  row.parentNode.insertBefore(wrap, row);
  const face = svg('svg', { class: 'orr-svg', viewBox: `0 0 ${width} ${H}`, 'aria-hidden': 'true' });
  wrap.appendChild(face);
  wrap.appendChild(row);
  row.classList.add('orr-stoparc__row');
  const items = () => [...row.children].filter((li) => li.querySelector && li.querySelector('button'));
  const n = Math.max(1, items().length);
  const step = n > 1 ? span / (n - 1) : 0;
  const angles = Array.from({ length: n }, (_, i) => -span / 2 + step * i);
  const pt = (r, a) => [cx + r * Math.sin(a * Math.PI / 180), cy - r * Math.cos(a * Math.PI / 180)];
  const arcPath = (r, a0, a1) => { const [x0, y0] = pt(r, a0); const [x1, y1] = pt(r, a1); return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  const a0 = -span / 2 - 14;
  const a1 = span / 2 + 14;
  face.appendChild(svg('path', { d: arcPath(radius, a0, a1), class: 'orr-bloom orr-hi', 'stroke-width': 5, opacity: '.12' }));
  face.appendChild(svg('path', { d: arcPath(radius, a0, a1), stroke: 'rgb(236 230 216 / .6)', 'stroke-width': 1.2, fill: 'none' }));
  const fine = [];
  for (let a = a0 + 2; a < a1; a += 3) { const [x0, y0] = pt(radius, a); const [x1, y1] = pt(radius - 5, a); fine.push(`M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`); }
  face.appendChild(svg('path', { d: fine.join(' '), class: 'orr-core orr-faint', 'stroke-width': 1 }));
  face.appendChild(svg('path', { d: arcPath(radius * 0.42, a0, a1), stroke: 'rgb(232 226 212 / .12)', 'stroke-width': 1, 'stroke-dasharray': '1 5', fill: 'none' }));
  const stationTicks = angles.map((a) => {
    const [x0, y0] = pt(radius - 10, a); const [x1, y1] = pt(radius + 8, a);
    const t = svg('path', { d: `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`, class: 'orr-core orr-hi', 'stroke-width': 1.5 });
    face.appendChild(t);
    return t;
  });
  const tail = svg('path', { d: '', fill: 'var(--dp-hand, #f2b950)', opacity: '.8' });
  const bloom = svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 9, opacity: '.22' });
  const blade = svg('path', { d: '', fill: 'var(--dp-hand, #f2b950)' });
  const hub = svg('g');
  hub.append(
    svg('circle', { cx, cy, r: 10, fill: 'var(--dp-hand, #f2b950)' }),
    svg('circle', { cx, cy, r: 10, fill: 'none', stroke: 'rgb(236 230 216)', 'stroke-width': 1.4 }),
    svg('circle', { cx, cy, r: 3.4, fill: 'rgb(255 244 214)' }),
  );
  const beadBloom = svg('circle', { r: 8, fill: 'var(--dp-hand, #f2b950)', opacity: '.22' });
  const bead = svg('circle', { r: 3.4, fill: 'var(--dp-hand-hot, #ffd98c)' });
  face.append(tail, bloom, blade, hub, beadBloom, bead);
  const paint = (deg) => {
    const [tx, ty] = pt(radius - 4, deg);
    const [lx, ly] = [cx + 3.2 * Math.cos(deg * Math.PI / 180), cy + 3.2 * Math.sin(deg * Math.PI / 180)];
    const [rx, ry] = [cx - 3.2 * Math.cos(deg * Math.PI / 180), cy - 3.2 * Math.sin(deg * Math.PI / 180)];
    blade.setAttribute('d', `M ${lx.toFixed(1)} ${ly.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} L ${rx.toFixed(1)} ${ry.toFixed(1)} Z`);
    bloom.setAttribute('d', `M ${cx} ${cy} L ${tx.toFixed(1)} ${ty.toFixed(1)}`);
    const [kx, ky] = pt(-18, deg);
    tail.setAttribute('d', `M ${(cx + 5 * Math.cos(deg * Math.PI / 180)).toFixed(1)} ${(cy + 5 * Math.sin(deg * Math.PI / 180)).toFixed(1)} L ${kx.toFixed(1)} ${ky.toFixed(1)} L ${(cx - 5 * Math.cos(deg * Math.PI / 180)).toFixed(1)} ${(cy - 5 * Math.sin(deg * Math.PI / 180)).toFixed(1)} Z`);
    for (const b of [bead, beadBloom]) { b.setAttribute('cx', tx.toFixed(1)); b.setAttribute('cy', ty.toFixed(1)); }
  };
  const spring = createSpring({ value: angles[0], preset: { k: 190, c: 15 }, onUpdate: paint });
  paint(angles[0]);
  const arts = [];
  items().forEach((li, i) => {
    const [sx, sy] = pt(radius, angles[i]);
    const action = li.querySelector('button').dataset.action;
    const hasArt = !!(art && art[action]);
    li.style.left = `${sx.toFixed(1)}px`;
    li.style.top = `${(sy - (hasArt ? artSize + 62 : 48)).toFixed(1)}px`;
    if (hasArt) {
      const img = doc.createElement('div');
      img.className = 'orr-stopscale__art';
      Object.assign(img.style, { left: `${sx.toFixed(1)}px`, top: `${(sy - 18 - artSize / 2).toFixed(1)}px`, width: `${artSize}px`, height: `${artSize}px`, backgroundImage: `url("${art[action]}")` });
      wrap.insertBefore(img, row);
      arts[i] = img;
    }
  });
  let current = -1;
  function update({ instant = false } = {}) {
    let idx = items().findIndex((li) => li.querySelector('button[aria-pressed="true"]'));
    if (idx < 0) idx = 0;
    if (idx === current && !instant) return;
    current = idx;
    spring.set(angles[idx], { instant });
    stationTicks.forEach((t, i) => { t.setAttribute('class', `orr-core ${i === idx ? 'orr-hand' : 'orr-hi'}`); t.setAttribute('opacity', i === idx ? '1' : '.5'); });
    arts.forEach((img, i) => { if (img) img.classList.toggle('is-on', i === idx); });
  }
  let mo = null;
  if (typeof MutationObserver === 'function') {
    mo = new MutationObserver(() => update());
    mo.observe(row, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  }
  update({ instant: true });
  return { el: wrap, update, dispose() { spring.stop(); if (mo) mo.disconnect(); } };
}

/**
 * Station ROW: the flowing form, for rows of produced-art choices (mode, build, arena tiles). The row
 * keeps its own flex flow -- each choice keeps its art and its word -- and loses its card; a ruled
 * line of light runs under the row with a tick under every choice, and the amber index slides to
 * the chosen one (aria-pressed / aria-selected). Measured from the laid-out row, re-measured when
 * the row resizes, so it follows wrapping and responsive sizes without a fixed geometry.
 */
export function createStationRow({ row } = {}) {
  const doc = (row && row.ownerDocument) || globalThis.document;
  if (!row || !doc || typeof doc.createElementNS !== 'function' || !row.parentNode || typeof row.getBoundingClientRect !== 'function') {
    return { el: null, update() {}, dispose() {} };
  }
  injectOrrery();
  injectStyle(doc);
  row.classList.add('orr-stationrow');
  const face = svg('svg', { class: 'orr-svg orr-stationrow__rule', 'aria-hidden': 'true' });
  row.appendChild(face);
  const line = svg('path', { d: '', class: 'orr-core orr-rest', 'stroke-width': 1 });
  const fine = svg('path', { d: '', class: 'orr-core orr-faint', 'stroke-width': 1 });
  const ticks = svg('g');
  const bloom = svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 7, opacity: '.22' });
  const blade = svg('path', { d: '', fill: 'var(--dp-hand, #f2b950)' });
  const beadBloom = svg('circle', { r: 7, fill: 'var(--dp-hand, #f2b950)', opacity: '.22' });
  const bead = svg('circle', { r: 3.2, fill: 'var(--dp-hand-hot, #ffd98c)' });
  face.append(line, fine, ticks, bloom, blade, beadBloom, bead);
  const Y = 10;
  const buttons = () => [...row.querySelectorAll('button')];
  let xs = [];
  let current = -1;
  const paint = (x) => {
    blade.setAttribute('d', `M ${(x - 2).toFixed(1)} ${Y} L ${x.toFixed(1)} ${Y - 14} L ${(x + 2).toFixed(1)} ${Y} Z`);
    bloom.setAttribute('d', `M ${x.toFixed(1)} ${Y} L ${x.toFixed(1)} ${Y - 14}`);
    for (const b of [bead, beadBloom]) { b.setAttribute('cx', x.toFixed(1)); b.setAttribute('cy', String(Y)); }
  };
  const spring = createSpring({ value: 0, preset: { k: 300, c: 25 }, onUpdate: paint });
  function measure() {
    const rb = row.getBoundingClientRect();
    if (!rb.width) return;
    face.setAttribute('viewBox', `0 0 ${rb.width.toFixed(1)} 20`);
    xs = buttons().map((b) => { const bb = b.getBoundingClientRect(); return bb.left - rb.left + bb.width / 2; });
    // the line spans the stations (and a little air), not the whole row box
    const x0 = Math.max(0, (xs[0] ?? 0) - 36);
    const x1 = Math.min(rb.width, (xs[xs.length - 1] ?? rb.width) + 36);
    line.setAttribute('d', `M ${x0} ${Y} L ${x1.toFixed(1)} ${Y}`);
    const f = [];
    for (let x = x0 + 4; x < x1; x += 8) f.push(`M ${x.toFixed(1)} ${Y} L ${x.toFixed(1)} ${Y + 4}`);
    fine.setAttribute('d', f.join(' '));
    ticks.textContent = '';
    xs.forEach((x) => ticks.appendChild(svg('path', { d: `M ${x.toFixed(1)} ${Y - 5} L ${x.toFixed(1)} ${Y + 7}`, class: 'orr-core orr-hi', 'stroke-width': 1.4, opacity: '.5' })));
    current = -1;
    update({ instant: true });
  }
  function update({ instant = false } = {}) {
    const list = buttons();
    let idx = list.findIndex((b) => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true');
    if (idx < 0 || !xs.length) return;
    if (idx === current && !instant) return;
    current = idx;
    spring.set(xs[idx], { instant });
    [...ticks.children].forEach((t, i) => { t.setAttribute('class', `orr-core ${i === idx ? 'orr-hand' : 'orr-hi'}`); t.setAttribute('opacity', i === idx ? '1' : '.5'); });
  }
  let mo = null;
  if (typeof MutationObserver === 'function') {
    mo = new MutationObserver(() => update());
    mo.observe(row, { subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected'] });
  }
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => measure()); ro.observe(row); }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => measure());
  measure();
  return { el: face, update, measure, dispose() { spring.stop(); if (mo) mo.disconnect(); if (ro) ro.disconnect(); face.remove(); } };
}

/**
 * TURNTABLE: the choice made at the object. A ring in perspective round the base of a staged object
 * (the new-game hull); only its front arc is drawn, so it never crosses the object. The choices stand
 * on it as produced art with their words under them; the amber index -- a bead with a short lit arc
 * -- rides the ring to the chosen one on the needle's spring. Same contract as the other stop
 * elements: it seats the screen's own buttons and follows aria-pressed. `anchor` is the element the
 * ring sits under; it is measured on build and on resize (no per-frame reads).
 */
export function createTurntable({ row, host, anchor, art = null, artWidth = 150 } = {}) {
  const doc = (row && row.ownerDocument) || globalThis.document;
  if (!row || !host || !anchor || !doc || typeof doc.createElementNS !== 'function' || typeof anchor.getBoundingClientRect !== 'function') {
    return { el: null, update() {}, dispose() {} };
  }
  injectOrrery();
  injectStyle(doc);
  const wrap = doc.createElement('div');
  wrap.className = 'orr-turntable';
  const face = svg('svg', { class: 'orr-svg', 'aria-hidden': 'true' });
  wrap.appendChild(face);
  wrap.appendChild(row);
  row.classList.add('orr-turntable__row');
  host.appendChild(wrap);
  const items = () => [...row.children].filter((li) => li.querySelector && li.querySelector('button'));
  const n = Math.max(1, items().length);
  const T = n === 1 ? [0] : Array.from({ length: n }, (_, i) => -56 + (112 * i) / (n - 1));
  let g = null;
  const pt = (t, k = 1) => [g.cx + g.rx * k * Math.sin(t * Math.PI / 180), g.cy + g.ry * k * Math.cos(t * Math.PI / 180)];
  const ring = (t0, t1, steps = 48, k = 1) => {
    const pts = [];
    for (let i = 0; i <= steps; i += 1) { const [x, y] = pt(t0 + ((t1 - t0) * i) / steps, k); pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`); }
    return `M ${pts.join(' L ')}`;
  };
  const track = svg('path', { d: '', stroke: 'rgb(236 230 216 / .5)', 'stroke-width': 1.2, fill: 'none' });
  const trackBloom = svg('path', { d: '', class: 'orr-bloom orr-hi', 'stroke-width': 6, opacity: '.12' });
  const inner = svg('path', { d: '', stroke: 'rgb(232 226 212 / .16)', 'stroke-width': 1, 'stroke-dasharray': '1 6', 'stroke-linecap': 'round', fill: 'none' });
  const fine = svg('path', { d: '', class: 'orr-core orr-faint', 'stroke-width': 1 });
  const ticks = svg('g');
  const lit = svg('path', { d: '', class: 'orr-core orr-hand', 'stroke-width': 2, 'stroke-linecap': 'round', fill: 'none' });
  const litBloom = svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 8, opacity: '.2' });
  const beadBloom = svg('circle', { r: 9, fill: 'var(--dp-hand, #f2b950)', opacity: '.22' });
  const bead = svg('circle', { r: 4, fill: 'var(--dp-hand-hot, #ffd98c)' });
  face.append(trackBloom, track, inner, fine, ticks, litBloom, lit, beadBloom, bead);
  const paint = (t) => {
    if (!g) return;
    const d = ring(t - 9, t + 9, 12);
    lit.setAttribute('d', d);
    litBloom.setAttribute('d', d);
    const [x, y] = pt(t);
    for (const b of [bead, beadBloom]) { b.setAttribute('cx', x.toFixed(1)); b.setAttribute('cy', y.toFixed(1)); }
  };
  const spring = createSpring({ value: T[0], preset: { k: 190, c: 15 }, onUpdate: paint });
  const arts = [];
  let current = -1;
  function build() {
    const hb = host.getBoundingClientRect();
    const ab = anchor.getBoundingClientRect();
    if (!hb.width || !ab.width) return;
    const W = hb.width; const H = hb.height;
    // round the object's base: centred a little right of the cell (where the staged hull sits),
    // low enough that only the floor is under the front arc, never the object
    const rx = Math.min(ab.width * 0.33, 470);
    const ry = rx * 0.27;
    g = { cx: ab.left - hb.left + ab.width * 0.56, cy: Math.min(ab.top - hb.top + ab.height * 0.8, H - ry - 132), rx, ry };
    face.setAttribute('viewBox', `0 0 ${W} ${H}`);
    track.setAttribute('d', ring(-104, 104));
    trackBloom.setAttribute('d', ring(-104, 104));
    inner.setAttribute('d', ring(-96, 96, 48, 0.8));
    const f = [];
    for (let t = -100; t <= 100; t += 4) { const [x0, y0] = pt(t); f.push(`M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x0.toFixed(1)} ${(y0 - 4).toFixed(1)}`); }
    fine.setAttribute('d', f.join(' '));
    ticks.textContent = '';
    T.forEach((t) => { const [x, y] = pt(t); ticks.appendChild(svg('path', { d: `M ${x.toFixed(1)} ${(y - 9).toFixed(1)} L ${x.toFixed(1)} ${(y + 9).toFixed(1)}`, class: 'orr-core orr-hi', 'stroke-width': 1.5, opacity: '.55' })); });
    items().forEach((li, i) => {
      const [x, y] = pt(T[i]);
      li.style.left = `${x.toFixed(1)}px`;
      li.style.top = `${(y + 18).toFixed(1)}px`;
      const action = li.querySelector('button').dataset.action;
      if (art && art[action]) {
        let img = arts[i];
        if (!img) { img = doc.createElement('div'); img.className = 'orr-turntable__art'; img.style.backgroundImage = `url("${art[action]}")`; wrap.insertBefore(img, row); arts[i] = img; }
        const h = artWidth * 0.56;
        Object.assign(img.style, { left: `${x.toFixed(1)}px`, top: `${(y - 8 - h).toFixed(1)}px`, width: `${artWidth}px`, height: `${h.toFixed(0)}px` });
      }
    });
    current = -1;
    update({ instant: true });
  }
  function update({ instant = false } = {}) {
    let idx = items().findIndex((li) => li.querySelector('button[aria-pressed="true"]'));
    if (idx < 0) idx = 0;
    if (idx === current && !instant) return;
    current = idx;
    spring.set(T[idx], { instant });
    [...ticks.children].forEach((t, i) => { t.setAttribute('class', `orr-core ${i === idx ? 'orr-hand' : 'orr-hi'}`); t.setAttribute('opacity', i === idx ? '1' : '.55'); });
    arts.forEach((img, i) => { if (img) img.classList.toggle('is-on', i === idx); });
  }
  let mo = null;
  if (typeof MutationObserver === 'function') {
    mo = new MutationObserver(() => update());
    mo.observe(row, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  }
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => build()); ro.observe(host); }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => build());
  build();
  return { el: wrap, update, layout: build, get geometry() { return g; }, dispose() { spring.stop(); if (mo) mo.disconnect(); if (ro) ro.disconnect(); wrap.remove(); } };
}
