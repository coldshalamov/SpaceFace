// src/ui/orrery/constellationMedals.js — the Medal Ring Grid (design/frontend/ORRERY.md §6 Meta:
// "Achievements: medal Arc Gauges on a ring grid"), and the word scale its filters stand on.
//
// Every achievement is a medal: an Arc Gauge whose arc is how far along the deed is, its glyph inside,
// a fine scale round its rim. An earned medal is a full ring of warm light with a second ring inside
// it; a counted goal under way is an arc to its figure with a bright head; a medal not yet earned is a
// ghost ring, dashed. The medals stand on a grid of rings. The one amber Hand is a pointer on the
// chosen medal's rim that swings (spring) from medal to medal; the chosen medal's line is read beside
// the grid by the screen.
//
// Every medal is a real <button data-id> (roving tabindex; the arrow keys and the pad move between
// medals by direction). A screen hands in the host, calls set() with the rows, and keeps its own
// handlers through onPick. `createWordScale` lays a ruler under a row of words (the filters): a tick
// under each word, a count under each tick, a bone bead that slides to the current word.

import { svg, polar, ticksD } from './svg.js';
import { injectOrrery } from './tokens.js';
import { createSpring, reducedMotion } from './motion.js';
import { starInDirection } from './constellation.js';

const STYLE_ID = 'orr-medal-grid-style';
const BONE = '236 230 216';
const WARM = '248 244 234';
const f = (n) => Math.round(n * 100) / 100;

const CSS = `
.con-medalgrid { position:relative; }
/* a spotlight rides the pointer across the grid of rings */
.con-medalgrid::after { content:""; position:absolute; inset:0; z-index:0; pointer-events:none; opacity:0; transition:opacity .25s linear;
  background:radial-gradient(circle at var(--con-mx, 50%) var(--con-my, 50%), rgb(248 244 234 / .075), rgb(248 244 234 / .025) 16%, transparent 34%); }
.con-medalgrid.is-lit::after { opacity:1; }
html.sf-reduce-motion .con-medalgrid::after { transition:none; }
.con-medal-lattice { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.orr-svg .con-medal-lattice__line { fill:none; stroke:rgb(${BONE} / .26); stroke-width:2.2; stroke-dasharray:0 8; stroke-linecap:round; }
.orr-svg .con-medal-lattice__mark { fill:none; stroke:rgb(${BONE} / .42); stroke-width:1.6; }
.con-medalgrid.is-arriving .con-medal-lattice { opacity:0; animation:con-medal-in 600ms var(--dp-ease-out, ease-out) 420ms forwards; }
.con-medals { position:relative; list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(var(--con-cols, 4), minmax(0, 1fr)); row-gap:var(--con-row-gap, 18px); column-gap:12px; }
.con-medals > li { display:flex; justify-content:center; min-width:0; }
.con-medal { all:unset; box-sizing:border-box; position:relative; display:flex; flex-direction:column; align-items:center; gap:clamp(4px, .7vh, 9px); width:100%; max-width:240px;
  padding:4px 6px 6px; cursor:pointer; text-align:center; -webkit-tap-highlight-color:transparent; }
.con-medal__face { position:relative; display:block; width:var(--con-medal, 112px); height:var(--con-medal, 112px); flex:none; }
.con-medal__face > svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
.con-medal__art { position:absolute; left:9%; top:9%; width:82%; height:82%; display:block; object-fit:contain; pointer-events:none; opacity:.3;
  transition:opacity .25s linear, transform .35s var(--dp-ease-over, ease-out); }
.con-medal[data-state="going"] .con-medal__art { opacity:.62; }
.con-medal[data-state="earned"] .con-medal__art { opacity:1; }
.con-medal:is(:hover, :focus-visible, [aria-current="true"]) .con-medal__art { opacity:calc(var(--con-art-o, .3) + .3); }
.con-medal[data-state="earned"]:is(:hover, :focus-visible, [aria-current="true"]) .con-medal__art { opacity:1; transform:scale(1.04); }
.con-medal__face.has-art > .con-medal__glyph { display:none; }
.con-medal__face.has-art.has-glyph > .con-medal__glyph { display:grid; }
.con-medal__glyph { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); display:grid; place-items:center; width:var(--con-glyph, 30px); height:var(--con-glyph, 30px);
  color:rgb(${BONE} / .5); pointer-events:none; }
.con-medal__glyph svg { width:100%; height:100%; display:block; }
.con-medal__glyph .accent { fill:currentColor; }
.con-medal__q { font-family:var(--dp-face-numeral, "Archivo"); font-weight:250; font-size:calc(var(--con-glyph, 30px) * 1.05); line-height:1; }
.con-medal__name { display:block; max-width:100%; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:var(--con-medal-px, 12px); line-height:1.25;
  letter-spacing:.12em; text-transform:uppercase; color:rgb(${BONE} / .76); text-wrap:balance; min-height:2.5em; display:flex; align-items:flex-start; justify-content:center; }
.con-medal__status { display:block; white-space:nowrap; font-family:var(--dp-face-label, "Archivo"); font-stretch:100%; font-weight:600; font-size:calc(var(--con-medal-px, 12px) - 1px); line-height:1.2;
  letter-spacing:.1em; text-transform:uppercase; color:rgb(${BONE} / .6); font-variant-numeric:tabular-nums; }
.con-medal[data-state="locked"][data-counted="0"] .con-medal__status { visibility:hidden; }
.con-medal[data-state="earned"] .con-medal__name { color:rgb(${WARM}); }
.con-medal[data-state="earned"] .con-medal__status { color:rgb(${WARM} / .82); }
.con-medal[data-state="earned"] .con-medal__glyph { color:rgb(${WARM}); }
.con-medal[data-state="going"] .con-medal__glyph { color:rgb(${BONE} / .78); }
.con-medal[data-state="going"] .con-medal__status { color:var(--dp-phos, #dfeeff); }
.con-medal:is(:hover, :focus-visible, [aria-current="true"]) .con-medal__name { color:rgb(255 252 245); }
.con-medal:is(:hover, :focus-visible) .con-medal__glyph { color:rgb(${WARM}); }
.con-medal:focus-visible { outline:none !important; }
.con-medal:focus-visible .con-medal__focus { opacity:1; }
.orr-svg .con-medal__ticks { fill:none; stroke:rgb(${BONE} / .26); stroke-width:1; }
.orr-svg .con-medal__ghost { fill:none; stroke:rgb(${BONE} / .3); stroke-width:2; stroke-dasharray:2.2 3.4; }
.orr-svg .con-medal__inner { fill:none; stroke:rgb(${BONE} / 0); stroke-width:1; }
.orr-svg .con-medal__arc { fill:none; stroke:rgb(${WARM}); stroke-width:4; stroke-linecap:butt; }
.orr-svg .con-medal__bloom { fill:none; stroke:rgb(${WARM}); stroke-width:12; opacity:.2; stroke-linecap:butt; }
.orr-svg .con-medal__head { fill:rgb(255 252 245); }
.orr-svg .con-medal__head-bloom { fill:rgb(255 252 245); opacity:.3; }
.orr-svg .con-medal__focus { fill:none; stroke:rgb(${WARM} / .9); stroke-width:1; opacity:0; transition:opacity .15s linear; }
.con-medal[data-state="earned"] .orr-svg .con-medal__ghost { stroke-dasharray:none; stroke:rgb(${WARM} / .5); }
.con-medal[data-state="earned"] .orr-svg .con-medal__inner { stroke:rgb(${WARM} / .5); }
.con-medal[data-state="earned"] .orr-svg .con-medal__ticks { stroke:rgb(${WARM} / .45); }
.con-medal[data-state="going"] .orr-svg .con-medal__ghost { stroke-dasharray:none; stroke:rgb(${BONE} / .22); }
.con-medal:is(:hover, [aria-current="true"]) .orr-svg .con-medal__ghost { stroke:rgb(${BONE} / .5); }
/* the grid arrives medal by medal: the ring draws, the glyph and words follow */
.con-medalgrid.is-arriving .con-medal { opacity:0; animation:con-medal-in 420ms var(--dp-ease-out, ease-out) forwards; animation-delay:var(--con-d, 0ms); }
.con-medalgrid.is-arriving .orr-svg .con-medal__arc, .con-medalgrid.is-arriving .orr-svg .con-medal__bloom { animation:con-medal-arc 720ms var(--dp-ease-out, ease-out) both; animation-delay:calc(var(--con-d, 0ms) + 120ms); }
@keyframes con-medal-in { from { opacity:0; transform:translateY(6px) scale(.96); } to { opacity:1; transform:none; } }
@keyframes con-medal-arc { from { stroke-dasharray:0 1; } }
/* the Hand: an amber pointer on the chosen medal's rim */
.con-medal-hand { position:absolute; left:0; top:0; width:0; height:0; overflow:visible; pointer-events:none; z-index:2; }
.con-medal-hand > svg { position:absolute; overflow:visible; }
.orr-svg .con-medal-hand__arm { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:1.8; stroke-linecap:round; }
.orr-svg .con-medal-hand__bloom { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:7; opacity:.22; stroke-linecap:round; }
.orr-svg .con-medal-hand__grip { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:2.4; stroke-linecap:butt; }
.orr-svg .con-medal-hand__tip { fill:var(--dp-hand, #f2b950); }
/* the word scale under the filters */
.con-wordscale { position:relative; display:inline-block; padding-bottom:var(--con-scale-h, 34px); }
.con-wordscale > svg.con-wordscale__face { position:absolute; left:0; bottom:0; width:100%; height:var(--con-scale-h, 34px); overflow:visible; pointer-events:none; }
.orr-svg .con-wordscale__rule { stroke:rgb(${BONE} / .34); stroke-width:1; }
.orr-svg .con-wordscale__fine { stroke:rgb(${BONE} / .16); stroke-width:1; }
.orr-svg .con-wordscale__stop { stroke:rgb(${BONE} / .55); stroke-width:1.2; }
.orr-svg text.con-wordscale__n { font-family:var(--dp-face-label, "Archivo"); font-stretch:100%; font-weight:600; font-size:10.5px; letter-spacing:.08em; fill:rgb(${BONE} / .62); text-anchor:middle; }
.orr-svg text.con-wordscale__n.is-now { fill:rgb(${WARM}); }
.orr-svg .con-wordscale__bead { fill:rgb(${WARM}); }
.orr-svg .con-wordscale__beadbloom { fill:rgb(${WARM}); opacity:.2; }
.orr-svg .con-wordscale__cursor { stroke:rgb(${WARM}); stroke-width:1.5; }
html.sf-reduce-motion .con-medalgrid.is-arriving .con-medal, html.sf-reduce-motion .con-medalgrid.is-arriving .orr-svg .con-medal__arc,
html.sf-reduce-motion .con-medalgrid.is-arriving .orr-svg .con-medal__bloom { animation:none; opacity:1; }
@media (forced-colors:active) {
  .orr-svg .con-medal__arc, .orr-svg .con-medal__ghost { stroke:CanvasText; }
  .orr-svg .con-medal-hand__arm, .orr-svg .con-medal-hand__grip { stroke:Highlight; }
}
`;

function injectStyle(doc) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/** How far along a row is: 1 when earned, current/target for a counted goal, else 0. */
export function medalProgress(row) {
  if (!row) return 0;
  if (row.unlocked) return 1;
  if (row.masked) return 0;
  const target = Number(row.target) || 0;
  const current = Number(row.current) || 0;
  return target > 1 ? Math.max(0, Math.min(1, current / target)) : 0;
}

/** A medal's state word: earned, going (a counted goal with progress), or locked. */
export function medalState(row) {
  if (row && row.unlocked) return 'earned';
  return medalProgress(row) > 0 ? 'going' : 'locked';
}

/**
 * The medal's dial as SVG markup in a -50..50 box: a fine scale round the rim, the ghost ring, the
 * arc of progress with its bloom and a bright head, and (earned) a second ring inside.
 */
export function medalDialSvg(k, { focusRing = true } = {}) {
  const r = 46;
  const p = Math.max(0, Math.min(1, Number(k) || 0));
  const ticks = ticksD(0, 0, 50, 60, { len: 1.6, major: 15, majorLen: 3.4, inward: true });
  const [hx, hy] = polar(0, 0, r, 360 * p);
  const arc = p > 0
    ? `<circle class="con-medal__bloom" r="${r}" pathLength="1" stroke-dasharray="${f(p)} 1" transform="rotate(-90)"></circle>`
      + `<circle class="con-medal__arc" r="${r}" pathLength="1" stroke-dasharray="${f(p)} 1" transform="rotate(-90)"></circle>`
      + (p < 1 ? `<circle class="con-medal__head-bloom" cx="${f(hx)}" cy="${f(hy)}" r="6"></circle><circle class="con-medal__head" cx="${f(hx)}" cy="${f(hy)}" r="3"></circle>` : '')
    : '';
  return `<svg class="orr-svg con-medal__dial" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">`
    + `<path class="con-medal__ticks" d="${ticks}"></path>`
    + `<circle class="con-medal__ghost" r="${r}"></circle>`
    + arc
    + (focusRing ? `<circle class="con-medal__focus" r="55"></circle>` : '')
    + `</svg>`;
}

/**
 * @param {HTMLElement} host the grid's stage
 * @param {{ onPick?: (id: string, how: string) => void, onEdge?: (dir: string) => void, glyph?: (row: object) => string }} [opts]
 */
export function createMedalGrid(host, { onPick = null, onEdge = null, glyph = null, art = null } = {}) {
  const doc = host && host.ownerDocument ? host.ownerDocument : globalThis.document;
  const inert = { el: host, list: null, set() {}, choose() {}, focusChosen() {}, arrive() {}, button: () => null, dispose() {} };
  if (!host || !doc || typeof doc.createElement !== 'function') return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('con-medalgrid');
  const list = doc.createElement('ul');
  list.className = 'con-medals';
  host.appendChild(list);
  const lattice = typeof doc.createElementNS === 'function' ? svg('svg', { class: 'orr-svg con-medal-lattice', 'aria-hidden': 'true', focusable: 'false' }) : null;
  if (lattice) host.insertBefore(lattice, list);
  const handLayer = doc.createElement('div');
  handLayer.className = 'con-medal-hand';
  handLayer.setAttribute('aria-hidden', 'true');
  host.appendChild(handLayer);
  const canDraw = typeof doc.createElementNS === 'function';
  let handSvg = null;
  let handGroup = null;
  if (canDraw) {
    handSvg = svg('svg', { class: 'orr-svg', width: 1, height: 1 });
    handGroup = svg('g');
    handSvg.appendChild(handGroup);
    handLayer.appendChild(handSvg);
  }
  let buttons = new Map();
  let rows = [];
  let chosen = null;
  let at = { x: 0, y: 0, r: 0 };
  let arriveTimer = 0;
  let ro = null;
  const paintHand = () => {
    if (!handGroup) return;
    if (!chosen || !(at.r > 0)) { handGroup.setAttribute('opacity', '0'); return; }
    handGroup.removeAttribute('opacity');
    handGroup.setAttribute('transform', `translate(${f(x.value)} ${f(y.value)})`);
  };
  const x = createSpring({ value: 0, preset: 'swing', onUpdate: paintHand });
  const y = createSpring({ value: 0, preset: 'swing', onUpdate: paintHand });

  function drawHand(r) {
    if (!handGroup) return;
    handGroup.textContent = '';
    // the pointer stands on the rim at twelve o'clock: an arm down onto the ring, a grip along it
    const r0 = r + 6;
    const r1 = r + 30;
    const grip = (a0, a1) => {
      const [x0, y0] = polar(0, 0, r + 1.5, a0);
      const [x1, y1] = polar(0, 0, r + 1.5, a1);
      return `M ${f(x0)} ${f(y0)} A ${f(r + 1.5)} ${f(r + 1.5)} 0 0 1 ${f(x1)} ${f(y1)}`;
    };
    handGroup.append(
      svg('path', { class: 'con-medal-hand__bloom', d: `M 0 ${f(-r1)} L 0 ${f(-r0)}` }),
      svg('path', { class: 'con-medal-hand__arm', d: `M 0 ${f(-r1)} L 0 ${f(-r0)}` }),
      svg('path', { class: 'con-medal-hand__grip', d: grip(-20, 20) }),
      svg('path', { class: 'con-medal-hand__tip', d: `M -5.5 ${f(-r0 - 9)} L 0 ${f(-r0 + 0.5)} L 5.5 ${f(-r0 - 9)} Z` }),
    );
  }

  function measure() {
    const box = faceBox(chosen && buttons.get(chosen));
    // the dial's ring is r=40 in a 100 box
    return box ? { x: box.x, y: box.y, r: box.w * 0.4 } : null;
  }

  /** Where a medal's face sits in the host, by layout: an arriving medal's transform does not move it. */
  function faceBox(b) {
    const face = b && b.querySelector('.con-medal__face');
    if (!face || !(face.offsetWidth > 0)) return null;
    let x = 0;
    let y = 0;
    let node = face;
    while (node && node !== host) { x += node.offsetLeft || 0; y += node.offsetTop || 0; node = node.offsetParent; }
    if (node !== host) return null;
    const w = face.offsetWidth;
    return { x: x + w / 2, y: y + face.offsetHeight / 2, w };
  }

  /** The lattice: a dotted line from ring to ring along each row, stopping at each ring's scale. */
  function drawLattice() {
    if (!lattice || typeof host.getBoundingClientRect !== 'function') return;
    const hr = host.getBoundingClientRect();
    lattice.textContent = '';
    if (!(hr.width > 0)) return;
    lattice.setAttribute('viewBox', `0 0 ${f(hr.width)} ${f(hr.height)}`);
    const cells = [...buttons.values()].map((b) => {
      const box = faceBox(b);
      return box ? { x: box.x, y: box.y, r: box.w * 0.5 } : null;
    }).filter(Boolean);
    const parts = [];
    const marks = [];
    const join = (a, b) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < a.r + b.r + 16) return;
      const ux = dx / len;
      const uy = dy / len;
      parts.push(`M ${f(a.x + ux * (a.r + 6))} ${f(a.y + uy * (a.r + 6))} L ${f(b.x - ux * (b.r + 6))} ${f(b.y - uy * (b.r + 6))}`);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      marks.push(`M ${f(mx - uy * 4)} ${f(my + ux * 4)} L ${f(mx + uy * 4)} ${f(my - ux * 4)}`);
    };
    for (const a of cells) {
      const right = cells.filter((c) => Math.abs(c.y - a.y) < 2 && c.x > a.x + 2).sort((p, q) => p.x - q.x)[0];
      if (right) join(a, right);
    }
    lattice.appendChild(svg('path', { d: parts.join(' '), class: 'con-medal-lattice__line' }));
    lattice.appendChild(svg('path', { d: marks.join(' '), class: 'con-medal-lattice__mark' }));
  }

  function fitColumns() {
    if (!(host.clientHeight > 0) || !list.children.length) return;
    const cs = typeof getComputedStyle === 'function' ? getComputedStyle(host) : null;
    const room = host.clientHeight - (cs ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) : 0);
    // the medal's own size from the sheet, then a little smaller before a column is added: a square
    // grid of rings reads better than a wide one
    list.style.removeProperty('--con-medal');
    const face = list.querySelector('.con-medal__face');
    const base = face ? face.offsetWidth : 0;
    for (const c of [4, 5, 6, 8]) {
      list.style.setProperty('--con-cols', String(c));
      for (const k of base > 0 ? [1, 0.92, 0.85] : [1]) {
        if (k < 1) list.style.setProperty('--con-medal', `${Math.round(base * k)}px`);
        if (list.offsetHeight <= room + 1) return;
      }
      list.style.removeProperty('--con-medal');
    }
  }

  function aim({ instant = false } = {}) {
    const m = measure();
    if (!m) { at = { x: 0, y: 0, r: 0 }; paintHand(); return; }
    if (Math.abs(m.r - at.r) > 0.5) drawHand(m.r);
    const first = !(at.r > 0);
    at = m;
    x.set(m.x, { instant: instant || first });
    y.set(m.y, { instant: instant || first });
    paintHand();
  }
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => { fitColumns(); drawLattice(); aim({ instant: true }); }); ro.observe(host); }

  host.addEventListener('pointermove', (event) => {
    if (typeof host.getBoundingClientRect !== 'function') return;
    const r = host.getBoundingClientRect();
    host.style.setProperty('--con-mx', `${Math.round(event.clientX - r.left)}px`);
    host.style.setProperty('--con-my', `${Math.round(event.clientY - r.top)}px`);
    host.classList.add('is-lit');
  });
  host.addEventListener('pointerleave', () => host.classList.remove('is-lit'));
  list.addEventListener('keydown', (event) => {
    const from = event.target && event.target.closest ? event.target.closest('.con-medal') : null;
    if (!from || !/^Arrow/.test(event.key)) return;
    const next = starInDirection([...buttons.values()], from, event.key);
    event.preventDefault();
    if (next) { try { next.focus(); } catch (_) { /* focus is a nicety */ } return; }
    if (typeof onEdge === 'function') onEdge(event.key.replace('Arrow', '').toLowerCase());
  });

  function mark() {
    for (const [id, b] of buttons) {
      const on = id === chosen;
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    }
    let stop = chosen && buttons.get(chosen);
    if (!stop) stop = buttons.values().next().value;
    for (const b of buttons.values()) b.tabIndex = b === stop ? 0 : -1;
  }

  return {
    el: host,
    list,
    set(nextRows, nextChosen) {
      rows = Array.isArray(nextRows) ? nextRows : [];
      chosen = nextChosen || null;
      list.textContent = '';
      buttons = new Map();
      rows.forEach((row, i) => {
        const li = doc.createElement('li');
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'con-medal';
        b.dataset.id = row.id;
        b.dataset.state = medalState(row);
        if (row.masked) b.dataset.masked = '1';
        b.dataset.counted = !row.masked && Number(row.target) > 1 ? '1' : '0';
        b.style.setProperty('--con-d', `${Math.min(15, i) * 34}ms`);
        const face = doc.createElement('span');
        face.className = 'con-medal__face';
        face.setAttribute('aria-hidden', 'true');
        const src = typeof art === 'function' ? art(row) : null;
        face.innerHTML = medalDialSvg(medalProgress(row)) + (src && src.url ? `<img class="con-medal__art" src="${src.url}" alt="" draggable="false" decoding="async">` : '')
          + `<span class="con-medal__glyph">${typeof glyph === 'function' ? glyph(row) : ''}</span>`;
        if (src && src.url) face.classList.add('has-art');
        if (src && src.glyph) face.classList.add('has-glyph');
        const name = doc.createElement('span');
        name.className = 'con-medal__name';
        name.textContent = row.name;
        const status = doc.createElement('span');
        status.className = 'con-medal__status';
        // an earned medal's full ring says earned: its word under it is the day
        status.textContent = row.unlocked ? (String(row.status || '').replace(/^Unlocked\s*/i, '') || row.status) : row.status;
        b.append(face, name, status);
        b.setAttribute('aria-label', `${row.name}. ${row.description} ${row.status}.`);
        b.addEventListener('click', () => { if (typeof onPick === 'function') onPick(row.id, 'click'); });
        b.addEventListener('focus', () => { if (chosen !== row.id && typeof onPick === 'function') onPick(row.id, 'focus'); });
        li.appendChild(b);
        list.appendChild(li);
        buttons.set(row.id, b);
      });
      mark();
      at = { x: 0, y: 0, r: 0 };
      const raf = globalThis.requestAnimationFrame;
      fitColumns();
      const settleIn = () => { fitColumns(); drawLattice(); aim({ instant: true }); };
      if (typeof raf === 'function') raf(settleIn); else settleIn();
    },
    choose(id, { instant = false } = {}) {
      chosen = id || null;
      mark();
      aim({ instant });
    },
    arrive() {
      if (reducedMotion()) return;
      host.classList.remove('is-arriving');
      void host.offsetWidth;
      host.classList.add('is-arriving');
      clearTimeout(arriveTimer);
      arriveTimer = setTimeout(() => host.classList.remove('is-arriving'), 1400);
    },
    focusChosen() {
      const b = (chosen && buttons.get(chosen)) || buttons.values().next().value;
      if (b) { try { b.focus({ preventScroll: true }); } catch (_) { /* focus is a nicety */ } }
    },
    button: (id) => buttons.get(id) || null,
    dispose() {
      x.stop(); y.stop();
      clearTimeout(arriveTimer);
      if (ro) { try { ro.disconnect(); } catch (_) { /* gone */ } }
    },
  };
}

/**
 * A ruler under a row of words: a rule, fine graduations, a stop tick under each word with its count
 * beneath, and a bone bead that slides (spring) to the current word. `counts(action)` names each stop.
 */
export function createWordScale(wrap, list, { counts = null } = {}) {
  const doc = (wrap && wrap.ownerDocument) || globalThis.document;
  const inert = { update() {}, dispose() {} };
  if (!wrap || !list || !doc || typeof doc.createElementNS !== 'function') return inert;
  injectOrrery(doc);
  injectStyle(doc);
  wrap.classList.add('con-wordscale');
  const face = svg('svg', { class: 'orr-svg con-wordscale__face', 'aria-hidden': 'true', focusable: 'false' });
  wrap.appendChild(face);
  const H = 34;
  const ruleY = 8;
  const gBase = svg('g');
  const cursor = svg('g');
  const bloom = svg('circle', { r: 6.5, cy: ruleY, class: 'con-wordscale__beadbloom' });
  const bead = svg('circle', { r: 3, cy: ruleY, class: 'con-wordscale__bead' });
  const tick = svg('path', { d: `M 0 ${ruleY - 8} L 0 ${ruleY}`, class: 'con-wordscale__cursor' });
  cursor.append(bloom, tick, bead);
  face.append(gBase, cursor);
  const spring = createSpring({ value: 0, preset: { k: 300, c: 25 }, onUpdate: (v) => cursor.setAttribute('transform', `translate(${f(v)} 0)`) });
  let placed = false;
  let ro = null;
  function layout({ instant = false } = {}) {
    const wr = wrap.getBoundingClientRect();
    const words = [...list.querySelectorAll('button')];
    if (!(wr.width > 0) || !words.length) return;
    face.setAttribute('viewBox', `0 0 ${f(wr.width)} ${H}`);
    gBase.textContent = '';
    const xs = words.map((b) => { const r = b.getBoundingClientRect(); return r.left - wr.left + r.width / 2; });
    const x0 = Math.max(0, xs[0] - 22);
    const x1 = Math.min(wr.width, xs[xs.length - 1] + 22);
    gBase.appendChild(svg('path', { d: `M ${f(x0)} ${ruleY} L ${f(x1)} ${ruleY}`, class: 'con-wordscale__rule' }));
    const fine = [];
    for (let px = x0 + 4; px < x1; px += 8) fine.push(`M ${f(px)} ${ruleY} L ${f(px)} ${ruleY + 3}`);
    gBase.appendChild(svg('path', { d: fine.join(' '), class: 'con-wordscale__fine' }));
    const current = words.findIndex((b) => b.getAttribute('aria-current') === 'true');
    words.forEach((b, i) => {
      gBase.appendChild(svg('path', { d: `M ${f(xs[i])} ${ruleY} L ${f(xs[i])} ${ruleY + 7}`, class: 'con-wordscale__stop' }));
      const n = typeof counts === 'function' ? counts(b.dataset.action) : '';
      if (n) {
        const t = svg('text', { x: f(xs[i]), y: ruleY + 20, class: `con-wordscale__n${i === current ? ' is-now' : ''}` });
        t.textContent = n;
        gBase.appendChild(t);
      }
    });
    const target = xs[Math.max(0, current)];
    spring.set(target, { instant: instant || !placed });
    placed = true;
  }
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => layout({ instant: true })); ro.observe(wrap); }
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf === 'function') raf(() => layout({ instant: true })); else layout({ instant: true });
  return {
    update(opts) { layout(opts); },
    dispose() { spring.stop(); if (ro) { try { ro.disconnect(); } catch (_) { /* gone */ } } },
  };
}
