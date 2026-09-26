// src/ui/orrery/constellationMedals.js — the Medal Orrery (design/frontend/ORRERY.md §6 Meta:
// "Achievements: medal Arc Gauges on a ring grid"), and the word scale its categories stand on.
//
// Every achievement is a medal: produced art inside an Arc Gauge whose arc is how far along the deed
// is. An earned medal is a full ring of warm light; a counted goal under way is an arc to its figure
// with a bright head; a medal not yet earned is a ghost -- its face dim inside a dotted ring of light.
// The medals ride four orbits round a hero gauge (the medals you hold, as a thin numeral inside an arc):
// Career innermost, then Massline, Adventure and Crucible outermost. The one amber Hand is an arm from
// the gauge out to the chosen medal, and the chosen medal always stands under it: choosing one TURNS its
// orbit (a spring) until the medal arrives at the Hand, while the other orbits turn aside to keep the
// Hand's way clear. Choosing a category turns that orbit to its first medal, brightens it, and dims the
// rest. The names of the front orbit's medals resolve once it comes to rest; the chosen medal's line is
// read beside the orrery by the screen.
//
// Every medal is a real <button data-id> (roving tabindex): left and right turn the orbit a medal, up
// and down step to the next orbit out or in, the wheel turns the front orbit, and the pad moves by
// direction. A screen hands in the host, calls set() with every row, and keeps its handlers via onPick.
// `createWordScale` lays a ruler under a row of words (the categories): a tick under each word, a count
// under each tick, a bone bead that slides to the current word.

import { svg, polar, arcD, ticksD } from './svg.js';
import { injectOrrery } from './tokens.js';
import { createSpring, reducedMotion } from './motion.js';
import { solveLabels } from './constellation.js';

const STYLE_ID = 'orr-medal-orrery-style';
const BONE = '236 230 216';
const WARM = '248 244 234';
const f = (n) => Math.round(n * 100) / 100;
/** Orbits from the gauge outward; a category not named here takes an orbit beyond them. */
export const MEDAL_ORBITS = Object.freeze(['career', 'massline', 'adventure', 'crucible']);
/** The Hand points here (east, toward the reading beside the orrery). */
const HAND_BEARING = 90;
/** Each orbit's radius and medal size, as fractions of the outermost orbit. */
const RING_R = [0.4, 0.6, 0.8, 1.0];
const RING_S = [0.2, 0.225, 0.25, 0.27];
const wrap180 = (a) => { let x = a % 360; if (x > 180) x -= 360; if (x <= -180) x += 360; return x; };

const CSS = `
.con-morr { position:absolute; inset:0; isolation:isolate; }
.con-morr.is-off > * { display:none !important; }
.con-morr__pool { position:absolute; z-index:-1; left:var(--mo-cx, 50%); top:var(--mo-cy, 50%); width:var(--mo-pool, 900px); height:var(--mo-pool, 900px);
  transform:translate(-50%, -50%); border-radius:50%; pointer-events:none;
  background:radial-gradient(closest-side, rgb(5 7 10 / .88), rgb(5 7 10 / .74) 60%, rgb(5 7 10 / .32) 84%, rgb(5 7 10 / 0)); }
/* a spotlight rides the pointer across the orbits */
.con-morr__spot { position:absolute; z-index:0; left:0; top:0; width:560px; height:560px; margin:-280px 0 0 -280px; border-radius:50%; pointer-events:none; opacity:0;
  transform:translate(var(--con-mx, -999px), var(--con-my, -999px)); transition:opacity .25s linear;
  background:radial-gradient(closest-side, rgb(${WARM} / .11), rgb(${WARM} / .05) 45%, rgb(${WARM} / 0)); }
.con-morr.is-lit .con-morr__spot { opacity:1; }
.con-morr > svg.con-morr__svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:1; }
.con-morr__medals, .con-morr__labels { position:absolute; inset:0; pointer-events:none; z-index:2; }
.con-morr__labels { z-index:3; }
/* the orbits: a track of light, a fine scale that turns with the orbit, the category engraved on it */
.orr-svg .con-morr__track { fill:none; stroke:rgb(${BONE} / .3); stroke-width:1.6; }
.orr-svg .con-morr__trackbloom { fill:none; stroke:rgb(${WARM}); stroke-width:8; opacity:.05; }
.orr-svg .con-morr__ticks { fill:none; stroke:rgb(${BONE} / .34); stroke-width:1.2; }
.orr-svg .con-morr__ring.is-front .con-morr__track { stroke:rgb(${WARM} / .7); stroke-width:2.2; }
.orr-svg .con-morr__ring.is-front .con-morr__trackbloom { opacity:.16; }
.orr-svg .con-morr__ring.is-front .con-morr__ticks { stroke:rgb(${WARM} / .55); }
.orr-svg .con-morr__ring.is-dim { opacity:.4; }
.orr-svg text.con-morr__ringname { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:var(--mo-rn, 10px); letter-spacing:.26em;
  text-transform:uppercase; fill:rgb(${BONE} / .72); }
.orr-svg text.con-morr__ringname tspan { fill:rgb(${WARM}); letter-spacing:.1em; }
.orr-svg text.con-morr__ringname { opacity:0; transition:opacity .2s linear; }
.orr-svg text.con-morr__ringname.is-on { opacity:1; transition:opacity .35s linear var(--mo-ld, 420ms); }
.orr-svg .con-morr__ring.is-front text.con-morr__ringname { fill:rgb(${WARM}); }
/* the hero gauge: the medals you hold */
.orr-svg .con-morr__gtrack { fill:none; stroke:rgb(${BONE} / .16); stroke-width:6; }
.orr-svg .con-morr__gfill { fill:none; stroke:rgb(${WARM}); stroke-width:6; stroke-linecap:butt; }
.orr-svg .con-morr__gbloom { fill:none; stroke:rgb(${WARM}); stroke-width:16; opacity:.16; stroke-linecap:butt; }
.orr-svg .con-morr__gtick { stroke:rgb(${BONE} / .3); stroke-width:1.6; }
.orr-svg .con-morr__gtick.is-on { stroke:rgb(${WARM}); }
.orr-svg .con-morr__gscale { fill:none; stroke:rgb(${BONE} / .26); stroke-width:1; }
.con-morr__count { position:absolute; z-index:2; left:var(--mo-cx, 50%); top:var(--mo-cy, 50%); transform:translate(-50%, -52%); display:flex; flex-direction:column; align-items:center;
  gap:var(--mo-gap, 6px); pointer-events:none; text-align:center; }
.con-morr__n { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-weight:250; font-variation-settings:"wght" 250, "wdth" 100; font-size:var(--mo-num, 96px);
  line-height:.86; letter-spacing:-.02em; font-variant-numeric:tabular-nums lining-nums; color:var(--dp-phos, #dfeeff); }
.con-morr__of { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:var(--mo-of, 12px); letter-spacing:.24em; text-transform:uppercase;
  color:rgb(${BONE} / .72); white-space:nowrap; }
/* the Hand: out from the gauge to the chosen medal */
.orr-svg .con-morr__arm { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:2.4; stroke-linecap:round; }
.orr-svg .con-morr__armbloom { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:10; opacity:.24; stroke-linecap:round; }
.orr-svg .con-morr__tip { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:2.4; stroke-linejoin:miter; }
.orr-svg .con-morr__hub { fill:var(--dp-hand, #f2b950); }
.orr-svg .con-morr__hubring { fill:rgb(5 7 10); stroke:rgb(${WARM}); stroke-width:1.4; }
/* medals: a dark coin, its produced face, the gauge round it */
.con-medal { all:unset; box-sizing:border-box; position:absolute; left:0; top:0; width:var(--ms, 90px); height:var(--ms, 90px); margin:calc(var(--ms, 90px) / -2) 0 0 calc(var(--ms, 90px) / -2);
  border-radius:50% !important; cursor:pointer; pointer-events:auto; -webkit-tap-highlight-color:transparent; transition:opacity .3s linear; }
.con-medal:focus, .con-medal:focus-visible { outline:none !important; box-shadow:none !important; }
.con-medal__face { position:absolute; inset:0; display:block; pointer-events:none; }
.con-medal__body { position:absolute; inset:5%; border-radius:50% !important; background:rgb(6 8 11 / .96); }
.con-medal__face > svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
.con-medal__art { position:absolute; left:7%; top:7%; width:86%; height:86%; display:block; object-fit:contain; opacity:.22; transition:opacity .25s linear, transform .35s var(--dp-ease-over, ease-out); }
.con-medal[data-state="going"] .con-medal__art { opacity:.6; }
.con-medal[data-state="earned"] .con-medal__art { opacity:1; }
.con-medal:is(:hover, :focus-visible, [aria-current="true"]) .con-medal__art { opacity:.72; }
.con-medal[data-state="earned"]:is(:hover, :focus-visible, [aria-current="true"]) .con-medal__art { opacity:1; transform:scale(1.04); }
.con-medal__glyph { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); display:grid; place-items:center; width:30%; height:30%; color:rgb(${WARM}); pointer-events:none; }
.con-medal__glyph svg { width:100%; height:100%; display:block; }
.con-medal__glyph .accent { fill:currentColor; }
.con-medal__face.has-art > .con-medal__glyph { display:none; }
.con-medal__face.has-art.has-glyph > .con-medal__glyph { display:grid; }
.con-medal__glyph:has(.con-medal__scramble) { width:auto; height:auto; }
.con-medal__glyph:has(.con-medal__emblem) { width:56%; height:56%; }
.con-medal__emblem { width:100%; height:100%; overflow:visible; }
.con-medal__emblem .con-emblem__core { fill:none; stroke:rgb(${WARM}); stroke-width:1.9; stroke-linejoin:round; stroke-linecap:round; }
.con-medal__emblem .con-emblem__bloom { fill:none; stroke:rgb(${WARM}); stroke-width:5.5; opacity:.22; stroke-linejoin:round; stroke-linecap:round; }
.con-medal__emblem .con-emblem__seal { fill:rgb(6 8 11); stroke:rgb(${WARM}); stroke-width:1.9; }
.con-medal__emblem .con-emblem__ring { fill:none; stroke:rgb(${WARM}); stroke-width:1.1; stroke-dasharray:1.6 1.8; }
.con-medal__emblem .con-emblem__dot { fill:rgb(${WARM}); }
.con-medal[data-state="locked"] .con-medal__glyph:has(.con-medal__emblem) { opacity:.34; }
.con-medal[data-state="going"] .con-medal__glyph:has(.con-medal__emblem) { opacity:.72; }
.con-medal[data-state="locked"]:is(:hover, :focus-visible, [aria-current="true"]) .con-medal__glyph:has(.con-medal__emblem) { opacity:.75; }
.con-medal__scramble { display:block; font-family:var(--dp-face-code, "Spline Sans Mono"), ui-monospace, monospace; font-size:calc(var(--ms, 90px) * .12); line-height:1.08; letter-spacing:.1em; color:rgb(${BONE} / .6); text-align:center; white-space:nowrap; }
.con-medal__q { font-family:var(--dp-face-numeral, "Archivo"); font-weight:250; font-size:calc(var(--ms, 90px) * .3); line-height:1; }
.orr-svg .con-medal__ghost { fill:none; stroke:rgb(${BONE} / .46); stroke-width:1.5; stroke-dasharray:1.4 3.2; stroke-linecap:round; vector-effect:non-scaling-stroke; }
.orr-svg .con-medal__arc { fill:none; stroke:rgb(${WARM}); stroke-width:4.5; stroke-linecap:butt; }
.orr-svg .con-medal__bloom { fill:none; stroke:rgb(${WARM}); stroke-width:13; opacity:.2; stroke-linecap:butt; }
.orr-svg .con-medal__head { fill:rgb(255 252 245); }
.orr-svg .con-medal__head-bloom { fill:rgb(255 252 245); opacity:.3; }
.orr-svg .con-medal__focus { fill:none; stroke:rgb(${WARM} / .95); stroke-width:1.6; opacity:0; transition:opacity .15s linear; vector-effect:non-scaling-stroke; }
.con-medal:focus-visible .con-medal__focus, html.sf-gamepad-focus .con-medal:focus .con-medal__focus { opacity:1; }
.con-medal[data-state="earned"] .orr-svg .con-medal__ghost { stroke-dasharray:none; stroke:rgb(${WARM} / .5); }
.con-medal[data-state="going"] .orr-svg .con-medal__ghost { stroke-dasharray:none; stroke:rgb(${BONE} / .24); }
.con-medal.is-dim { opacity:.4; }
.con-medal.is-dim:is(:hover, :focus-visible) { opacity:.85; }
/* a medal struck while the screen is open: it flares where it stands */
.con-medal.is-struck .con-medal__art { animation:con-medal-strike 900ms cubic-bezier(.3, 1.4, .5, 1) both; }
@keyframes con-medal-strike { 0% { transform:scale(.6); opacity:.2; } 40% { transform:scale(1.25); opacity:1; } 100% { transform:none; opacity:1; } }
/* the front orbit's names, resolving once it has come to rest */
.con-morr__label { position:absolute; display:flex; flex-direction:column; gap:3px; white-space:nowrap; opacity:0; transition:opacity .2s linear;
  text-shadow:0 0 2px rgb(4 6 9), 0 0 5px rgb(4 6 9), 0 0 10px rgb(4 6 9 / .9); }
.con-morr__label.is-on { opacity:1; transition:opacity .35s linear var(--mo-ld, 420ms); }
.con-morr__label.is-w, .con-morr__label.is-nw, .con-morr__label.is-sw { align-items:flex-end; text-align:right; }
.con-morr__label.is-n, .con-morr__label.is-s { align-items:center; text-align:center; }
.con-morr__lname { display:block; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:var(--mo-lpx, 11.5px); line-height:1.25;
  letter-spacing:.12em; text-transform:uppercase; color:rgb(${BONE} / .86); }
.con-morr__label[data-state="earned"] .con-morr__lname { color:rgb(${WARM}); }
.con-morr__lsub { display:block; font-family:var(--dp-face-label, "Archivo"); font-stretch:100%; font-weight:600; font-size:calc(var(--mo-lpx, 11.5px) - 1.5px); line-height:1.2;
  letter-spacing:.1em; text-transform:uppercase; color:rgb(${BONE} / .68); font-variant-numeric:tabular-nums; }
.con-morr__label[data-state="going"] .con-morr__lsub { color:var(--dp-phos, #dfeeff); }
/* arrival: the orbits draw, the medals rise along them */
.con-morr.is-arriving .con-morr__track { stroke-dasharray:1 1; stroke-dashoffset:1; animation:con-morr-draw 700ms var(--dp-ease-out, ease-out) forwards; animation-delay:var(--mo-d, 0ms); }
.con-morr.is-arriving .con-medal__face { opacity:0; animation:con-morr-in 420ms var(--dp-ease-out, ease-out) forwards; animation-delay:var(--mo-d, 0ms); }
@keyframes con-morr-draw { to { stroke-dashoffset:0; } }
@keyframes con-morr-in { from { opacity:0; transform:scale(.7); } to { opacity:1; transform:none; } }
html.sf-reduce-motion .con-morr *, html.sf-reduce-motion .con-morr.is-arriving * { animation:none !important; transition:none !important; }
html.sf-reduce-motion .con-morr__spot { display:none; }
@media (forced-colors:active) {
  .con-morr__pool, .con-morr__spot { display:none; }
  .orr-svg .con-medal__arc, .orr-svg .con-medal__ghost, .orr-svg .con-morr__track { stroke:CanvasText; }
  .orr-svg .con-morr__arm, .orr-svg .con-morr__tip { stroke:Highlight; }
}
/* the word scale under the categories */
.con-wordscale { position:relative; display:inline-block; padding-bottom:var(--con-scale-h, 34px); }
.con-wordscale > svg.con-wordscale__face { position:absolute; left:0; bottom:0; width:100%; height:var(--con-scale-h, 34px); overflow:visible; pointer-events:none; }
.orr-svg .con-wordscale__rule { stroke:rgb(${BONE} / .34); stroke-width:1.2; }
.orr-svg .con-wordscale__fine { stroke:rgb(${BONE} / .18); stroke-width:1; }
.orr-svg .con-wordscale__stop { stroke:rgb(${BONE} / .55); stroke-width:1.4; }
.orr-svg text.con-wordscale__n { font-family:var(--dp-face-label, "Archivo"); font-stretch:100%; font-weight:600; font-size:10.5px; letter-spacing:.08em; fill:rgb(${BONE} / .62); text-anchor:middle; }
.orr-svg text.con-wordscale__n.is-now { fill:rgb(${WARM}); }
.orr-svg .con-wordscale__bead { fill:rgb(${WARM}); }
.orr-svg .con-wordscale__beadbloom { fill:rgb(${WARM}); opacity:.2; }
.orr-svg .con-wordscale__cursor { stroke:rgb(${WARM}); stroke-width:1.5; }
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
 * The medal's gauge as SVG markup in a -50..50 box: the ghost ring (dotted until earned), the arc of
 * progress with its bloom and a bright head. The produced face carries its own scale, so none is drawn.
 */
export function medalDialSvg(k, { focusRing = true } = {}) {
  const r = 46;
  const p = Math.max(0, Math.min(1, Number(k) || 0));
  const [hx, hy] = polar(0, 0, r, 360 * p);
  const arc = p > 0
    ? `<circle class="con-medal__bloom" r="${r}" pathLength="1" stroke-dasharray="${f(p)} 1" transform="rotate(-90)"></circle>`
      + `<circle class="con-medal__arc" r="${r}" pathLength="1" stroke-dasharray="${f(p)} 1" transform="rotate(-90)"></circle>`
      + (p < 1 ? `<circle class="con-medal__head-bloom" cx="${f(hx)}" cy="${f(hy)}" r="6"></circle><circle class="con-medal__head" cx="${f(hx)}" cy="${f(hy)}" r="3"></circle>` : '')
    : '';
  return `<svg class="orr-svg con-medal__dial" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">`
    + `<circle class="con-medal__ghost" r="${r}"></circle>`
    + arc
    + (focusRing ? `<circle class="con-medal__focus" r="55"></circle>` : '')
    + `</svg>`;
}

/** The orbits for a set of rows: MEDAL_ORBITS first, any other category after, each with its medal ids. */
function orbitsOf(rows) {
  const cats = [];
  for (const c of MEDAL_ORBITS) if (rows.some((r) => r.category === c)) cats.push(c);
  for (const r of rows) if (!cats.includes(r.category)) cats.push(r.category);
  return cats.map((c) => ({ id: c, ids: rows.filter((r) => r.category === c).map((r) => r.id) }));
}

/**
 * @param {HTMLElement} host
 * @param {{ onPick?: (id: string, how: string) => void, onEdge?: (dir: string) => void, glyph?: (row: object) => string,
 *   art?: (row: object) => ({ url: string, glyph?: boolean } | null), avoid?: () => DOMRect[], label?: (id: string) => string,
 *   measure?: (text: string, px: number) => number }} [opts]
 */
export function createMedalOrrery(host, { onPick = null, onEdge = null, glyph = null, art = null, avoid = null, label = null, measure = null } = {}) {
  const doc = host && host.ownerDocument ? host.ownerDocument : globalThis.document;
  const inert = { el: host, list: null, set() {}, choose() {}, focusChosen() {}, arrive() {}, strike() {}, button: () => null, dispose() {} };
  if (!host || !doc || typeof doc.createElement !== 'function') return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('con-morr', 'is-off');
  const canDraw = typeof doc.createElementNS === 'function';
  const pool = doc.createElement('div');
  pool.className = 'con-morr__pool';
  const spot = doc.createElement('div');
  spot.className = 'con-morr__spot';
  const layer = canDraw ? svg('svg', { class: 'orr-svg con-morr__svg', 'aria-hidden': 'true', focusable: 'false' }) : null;
  const count = doc.createElement('div');
  count.className = 'con-morr__count';
  count.setAttribute('aria-hidden', 'true');
  const countN = doc.createElement('span');
  countN.className = 'con-morr__n';
  const countOf = doc.createElement('span');
  countOf.className = 'con-morr__of';
  count.append(countN, countOf);
  const list = doc.createElement('div');
  list.className = 'con-morr__medals';
  list.setAttribute('role', 'group');
  const labelLayer = doc.createElement('div');
  labelLayer.className = 'con-morr__labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  host.append(pool, spot);
  if (layer) host.appendChild(layer);
  host.append(count, list, labelLayer);

  let rows = [];
  let chosen = null;
  let section = 'all';
  let geo = null;
  let rings = [];
  let buttons = new Map();
  let labels = new Map();
  let drawnKey = '';
  let frame = 0;
  let ro = null;
  let arriveTimer = 0;
  let restoring = false;
  let reach = 0;
  let armG = null;
  let arm = null;
  let armBloom = null;
  let tip = null;
  const reachSpring = createSpring({ value: 0, preset: 'settle', onUpdate: (v) => { reach = v; paintArm(); } });

  let g2 = null;
  const textW = (text, px) => {
    if (typeof measure === 'function') { const w = measure(text, px); if (Number.isFinite(w) && w > 0) return w; }
    try {
      if (!g2) g2 = doc.createElement('canvas').getContext('2d');
      g2.font = `650 ${px}px Archivo, system-ui, sans-serif`;
      return g2.measureText(String(text)).width * 1.08 + String(text).length * px * 0.12;
    } catch (_) { return String(text).length * px * 0.78; }
  };

  const rowOf = (id) => rows.find((r) => r.id === id) || null;
  const ringOf = (id) => rings.find((r) => r.ids.includes(id)) || null;
  const frontRing = () => (section !== 'all' ? rings.find((r) => r.id === section) : null) || ringOf(chosen) || rings[0] || null;

  function paintArm() {
    if (!geo || !arm) return;
    const { cx, cy } = geo;
    const r0 = geo.gaugeR + 11;
    const r1 = Math.max(r0 + 6, reach);
    const [x0, y0] = polar(cx, cy, r0, HAND_BEARING);
    const [x1, y1] = polar(cx, cy, r1, HAND_BEARING);
    const d = `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`;
    arm.setAttribute('d', d);
    armBloom.setAttribute('d', d);
    // the chevron points out, at the medal
    tip.setAttribute('d', `M ${f(x1 - 7)} ${f(y1 - 5.5)} L ${f(x1 + 0.5)} ${f(y1)} L ${f(x1 - 7)} ${f(y1 + 5.5)}`);
  }

  function paintRing(ring) {
    if (!geo) return;
    const step = 360 / ring.n;
    ring.ids.forEach((id, i) => {
      const b = buttons.get(id);
      if (!b) return;
      const [x, y] = polar(geo.cx, geo.cy, ring.r, ring.off + step * i);
      b.style.transform = `translate(${f(x)}px, ${f(y)}px)`;
    });
    if (ring.ticksG) ring.ticksG.setAttribute('transform', `rotate(${f(ring.off)} ${f(geo.cx)} ${f(geo.cy)})`);
  }

  /** Where every orbit should come to rest: the chosen medal under the Hand, the rest out of each other's way. */
  function targets() {
    const out = new Map();
    const placed = [];
    const front = frontRing();
    const chosenRing = ringOf(chosen);
    const ordered = [...rings].sort((a, b) => (a === chosenRing ? -1 : b === chosenRing ? 1 : a.r - b.r));
    const armTo = chosenRing ? chosenRing.r : 0;
    for (const ring of ordered) {
      const step = 360 / ring.n;
      const at = (off) => ring.ids.map((_, i) => off + step * i);
      let best = null;
      if (ring === chosenRing) {
        const idx = ring.ids.indexOf(chosen);
        const want = HAND_BEARING - step * idx;
        best = ring.off + wrap180(want - ring.off);
      } else {
        const channel = ring.r < armTo ? ((ring.size / 2 + 12) / ring.r) * (180 / Math.PI) : 0;
        let bestScore = -Infinity;
        for (let phi = 0; phi < step; phi += 2) {
          // the candidate nearest where the orbit stands now
          const off = ring.off + (((phi - ring.off) % step) + step + step / 2) % step - step / 2;
          let clear = 40;
          let penalty = 0;
          for (const deg of at(off)) {
            const [x, y] = polar(0, 0, ring.r, deg);
            for (const p of placed) clear = Math.min(clear, Math.hypot(x - p.x, y - p.y) - (ring.size + p.s) / 2 - 8);
            if (channel && Math.abs(wrap180(deg - HAND_BEARING)) < channel) penalty += 200;
            if (Math.abs(wrap180(deg - ring.nameAt)) < ring.nameSpan / 2 + 6) penalty += 30;
          }
          const score = clear - penalty - Math.abs(off - ring.off) * 0.02;
          if (score > bestScore) { bestScore = score; best = off; }
        }
      }
      out.set(ring.id, best);
      for (const deg of at(best)) { const [x, y] = polar(0, 0, ring.r, deg); placed.push({ x, y, s: ring.size }); }
    }
    return { out, front };
  }

  /** The front orbit's names, placed where the orbit will rest, shown once it gets there. */
  function placeLabels(target, front, { instant = false } = {}) {
    for (const el of labels.values()) el.classList.remove('is-on');
    if (!geo || !front) return;
    const posOf = new Map();
    for (const ring of rings) {
      const step = 360 / ring.n;
      ring.ids.forEach((id, i) => posOf.set(id, polar(geo.cx, geo.cy, ring.r, target.get(ring.id) + step * i)));
    }
    const discs = [];
    for (const ring of rings) for (const id of ring.ids) { const [x, y] = posOf.get(id); discs.push({ id, x, y, r: ring.size / 2 + 4 }); }
    discs.push({ id: '__gauge', x: geo.cx, y: geo.cy, r: geo.gaugeR + 14 });
    const [ax, ay] = polar(geo.cx, geo.cy, geo.gaugeR + 11, HAND_BEARING);
    const armLen = Math.max(0, reachTarget() - geo.gaugeR - 11);
    const segs = [{ x1: ax, y1: ay, x2: ax + armLen, y2: ay }];
    for (const ring of rings) {
      let prev = polar(geo.cx, geo.cy, ring.r, 0);
      for (let a = 7.5; a <= 360; a += 7.5) {
        const pt = polar(geo.cx, geo.cy, ring.r, a);
        const sg = { x1: prev[0], y1: prev[1], x2: pt[0], y2: pt[1] };
        segs.push(sg);
        if (ring === front) segs.push(sg, sg);
        prev = pt;
      }
    }
    const items = front.ids.filter((id) => id !== chosen).map((id) => {
      const el = labels.get(id);
      const [x, y] = posOf.get(id);
      return { id, star: { x, y, ox: x - geo.cx, oy: y - geo.cy }, boxes: [{ w: el.__w, h: el.__h, nameH: el.__nh, lines: [] }], gap: front.size / 2 + 8, rank: 0, depth: 0 };
    });
    const points = [];
    for (const ring of rings) {
      if (!ring.nameArc) continue;
      const { mid, span, r } = ring.nameArc;
      for (let a = mid - span / 2; a <= mid + span / 2; a += (5 / r) * (180 / Math.PI)) {
        for (const rr of [r - ring.namePx * 0.9, r - ring.namePx * 0.2, r + ring.namePx * 0.4]) { const [x, y] = polar(geo.cx, geo.cy, rr, a); points.push({ x, y }); }
      }
    }
    const solved = solveLabels(items, { discs, segs, rects: geo.avoid || [], points, bounds: { x: 4, y: 4, w: geo.W - 8, h: geo.H - 8 } });
    for (const [id, sol] of Object.entries(solved)) {
      const el = labels.get(id);
      if (!el || !sol) continue;
      el.className = `con-morr__label is-${sol.dir.k}`;
      el.dataset.state = medalState(rowOf(id));
      el.style.left = `${f(sol.rect.x)}px`;
      el.style.top = `${f(sol.rect.y)}px`;
      el.style.setProperty('--mo-ld', instant ? '0ms' : '460ms');
      if (!sol.dropped) el.classList.add('is-on');
    }
  }

  /** Each orbit's name in its widest gap at rest, clear of the Hand's way; upright on the lower half. */
  function placeNames(target, { instant = false } = {}) {
    if (!geo) return;
    const { cx, cy } = geo;
    for (const ring of rings) {
      if (!ring.nameText || !ring.namePath) continue;
      ring.nameText.classList.remove('is-on');
      const step = 360 / ring.n;
      const bs = ring.ids.map((_, i) => ((target.get(ring.id) + step * i) % 360 + 360) % 360).sort((a, b) => a - b);
      const half = ((ring.size / 2 + 6) / ring.nameR) * (180 / Math.PI);
      let best = null;
      for (let i = 0; i < bs.length; i += 1) {
        const a0 = bs[i] + half;
        const a1 = (i + 1 < bs.length ? bs[i + 1] : bs[0] + 360) - half;
        const room = a1 - a0;
        if (room < ring.nameSpan + 2) continue;
        // a gap may hold the name anywhere inside it: prefer the foot, and never the Hand's way
        const lo = a0 + ring.nameSpan / 2 + 1;
        const hi = a1 - ring.nameSpan / 2 - 1;
        const near = (c) => Math.max(lo, Math.min(hi, c));
        const at = [180, 540].map(near).sort((p, q) => Math.min(Math.abs(p - 180), Math.abs(p - 540)) - Math.min(Math.abs(q - 180), Math.abs(q - 540)))[0];
        const mid = ((at % 360) + 360) % 360;
        if (Math.abs(wrap180(mid - HAND_BEARING)) < ring.nameSpan / 2 + 14) continue;
        const score = room - Math.abs(wrap180(mid - 180)) * 0.6;
        if (!best || score > best.score) best = { mid, score };
      }
      ring.nameArc = null;
      if (!best) continue;
      const lower = best.mid > 90 && best.mid < 270;
      const r = lower ? ring.nameR + ring.namePx * 0.1 : ring.nameR - ring.namePx * 0.72;
      const start = lower ? best.mid + ring.nameSpan / 2 : best.mid - ring.nameSpan / 2;
      const [x0, y0] = polar(cx, cy, r, start);
      const [x1, y1] = polar(cx, cy, r, lower ? start - 179 : start + 179);
      ring.namePath.setAttribute('d', `M ${f(x0)} ${f(y0)} A ${f(r)} ${f(r)} 0 0 ${lower ? 0 : 1} ${f(x1)} ${f(y1)}`);
      ring.nameText.style.setProperty('--mo-ld', instant ? '0ms' : '460ms');
      ring.nameText.classList.add('is-on');
      ring.nameArc = { mid: best.mid, span: ring.nameSpan, r: lower ? r : r + ring.namePx * 0.72 };
    }
  }

  function reachTarget() {
    const ring = ringOf(chosen);
    return ring ? ring.r - ring.size / 2 - 7 : 0;
  }

  /** Turn every orbit to its rest; the chosen one swings, the others settle. */
  function aim({ instant = false } = {}) {
    if (!geo) return;
    const { out, front } = targets();
    const chosenRing = ringOf(chosen);
    for (const ring of rings) {
      const to = out.get(ring.id);
      if (!ring.spring) {
        ring.spring = createSpring({ value: ring.off, preset: ring === chosenRing ? 'swing' : 'settle', onUpdate: (v) => { ring.off = v; paintRing(ring); } });
      }
      ring.spring.set(to, { instant });
      ring.g.classList.toggle('is-front', ring === front && section !== 'all');
      ring.g.classList.toggle('is-dim', section !== 'all' && ring !== front);
      for (const id of ring.ids) {
        const b = buttons.get(id);
        if (b) b.classList.toggle('is-dim', section !== 'all' && ring !== front);
      }
    }
    reachSpring.set(reachTarget(), { instant });
    // the orbits' names first: the medal names then stand clear of them
    placeNames(out, { instant });
    placeLabels(out, front, { instant });
    for (const ring of rings) paintRing(ring);
    paintArm();
  }

  function mark() {
    for (const [id, b] of buttons) {
      if (id === chosen) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    }
    let stop = chosen && buttons.get(chosen);
    if (!stop) stop = buttons.values().next().value;
    for (const b of buttons.values()) b.tabIndex = b === stop ? 0 : -1;
  }

  function standDown() {
    host.classList.add('is-off');
    geo = null;
  }

  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (!rows.length || W < 320 || H < 280) { standDown(); return; }
    const key = `${W}x${H}|${rows.map((r) => `${r.id}:${medalState(r)}:${r.current}:${r.name}`).join(',')}`;
    if (key === drawnKey && geo) { aim(); return; }
    drawnKey = key;
    // the avoid rects (the screen's title and its categories), in host px
    const hb = host.getBoundingClientRect();
    const avoidRects = [];
    if (typeof avoid === 'function') {
      for (const r of avoid() || []) if (r && r.width > 0 && r.height > 0) avoidRects.push({ x: r.left - hb.left - 10, y: r.top - hb.top - 8, w: r.width + 20, h: r.height + 16 });
    }
    const orbits = orbitsOf(rows);
    const nR = Math.max(1, orbits.length);
    const rr = orbits.map((_, i) => RING_R[Math.min(RING_R.length - 1, i + Math.max(0, RING_R.length - nR))] || 1);
    const rs = orbits.map((_, i) => RING_S[Math.min(RING_S.length - 1, i + Math.max(0, RING_S.length - nR))] || 0.24);
    const outerS = rs[rs.length - 1];
    // the largest orrery that clears the edges (the outer medals and their names) and the title
    const margin = (R) => R * outerS / 2 + 34;
    const distTo = (x, y, r) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));
    const fit = (x, y) => {
      const lim = [y, H - y, x, W - x, ...avoidRects.map((r) => distTo(x, y, r))];
      // R + margin(R) <= each limit, so R <= (limit - 34) / (1 + outerS / 2)
      return Math.min(...lim.map((l) => (l - 34) / (1 + outerS / 2)));
    };
    let cx = W / 2;
    let cy = H / 2;
    let R = fit(cx, cy);
    // the largest orrery, and of the largest the one nearest the middle of its column
    const off = (x, y) => Math.hypot(x - W / 2, y - H / 2);
    for (let x = W * 0.3; x <= W * 0.7; x += 4) {
      for (let y = H * 0.4; y <= H * 0.62; y += 4) {
        const r = fit(x, y);
        if (r > R + 1 || (Math.abs(r - R) <= 1 && off(x, y) < off(cx, cy))) { R = Math.max(R, r); cx = x; cy = y; }
      }
    }
    R = Math.max(90, R);
    geo = { W, H, cx, cy, R, gaugeR: rr[0] * R - rs[0] * R / 2 - 12, avoid: avoidRects };
    host.classList.remove('is-off');
    host.style.setProperty('--mo-cx', `${f(cx)}px`);
    host.style.setProperty('--mo-cy', `${f(cy)}px`);
    host.style.setProperty('--mo-pool', `${f((R + margin(R)) * 2 + 120)}px`);
    host.style.setProperty('--mo-num', `${Math.round(Math.max(36, Math.min(112, geo.gaugeR * 0.92)))}px`);
    host.style.setProperty('--mo-of', `${Math.max(10.5, Math.min(13, geo.gaugeR / 8)).toFixed(1)}px`);
    host.style.setProperty('--mo-rn', `${Math.max(9.5, Math.min(12, R / 38)).toFixed(1)}px`);
    const lpx = Math.max(11, Math.min(13.5, R / 32));
    host.style.setProperty('--mo-lpx', `${lpx.toFixed(1)}px`);
    const prevOff = new Map(rings.map((r) => [r.id, r.off]));
    for (const r of rings) if (r.spring) r.spring.stop();
    rings = orbits.map((o, i) => ({
      id: o.id, ids: o.ids, n: Math.max(1, o.ids.length), r: rr[i] * R, size: Math.round(rs[i] * R), off: prevOff.get(o.id) ?? (i * 17), spring: null,
    }));
    build(lpx);
    aim({ instant: true });
  }

  function build(lpx) {
    const { cx, cy, R, W, H } = geo;
    if (layer) {
      layer.textContent = '';
      layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
      // the hero gauge: the medals held, one tick per medal round it
      const total = rows.length || 1;
      const earned = rows.filter((r) => r.unlocked).length;
      const gr = geo.gaugeR;
      const gauge = svg('g', { class: 'con-morr__gauge' });
      gauge.append(
        svg('circle', { cx: f(cx), cy: f(cy), r: f(gr), class: 'con-morr__gtrack' }),
        svg('path', { d: arcD(cx, cy, gr, 0, 359.99), class: 'con-morr__gbloom', pathLength: 1, 'stroke-dasharray': `${f(earned / total)} 1` }),
        svg('path', { d: arcD(cx, cy, gr, 0, 359.99), class: 'con-morr__gfill', pathLength: 1, 'stroke-dasharray': `${f(earned / total)} 1` }),
        svg('path', { d: ticksD(cx, cy, gr - 9, 64, { len: 2, major: 8, majorLen: 4 }), class: 'con-morr__gscale' }),
      );
      rows.forEach((r, i) => {
        const a = (360 * (i + 0.5)) / total;
        const [x0, y0] = polar(cx, cy, gr + 7, a);
        const [x1, y1] = polar(cx, cy, gr + 13, a);
        gauge.appendChild(svg('path', { d: `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`, class: `con-morr__gtick${r.unlocked ? ' is-on' : ''}` }));
      });
      layer.appendChild(gauge);
      // the orbits
      rings.forEach((ring, i) => {
        const g = svg('g', { class: 'con-morr__ring', 'data-ring': ring.id });
        g.style.setProperty('--mo-d', `${60 + i * 90}ms`);
        g.append(
          svg('circle', { cx: f(cx), cy: f(cy), r: f(ring.r), class: 'con-morr__trackbloom' }),
          svg('circle', { cx: f(cx), cy: f(cy), r: f(ring.r), class: 'con-morr__track', pathLength: 1 }),
        );
        const ticksG = svg('g');
        ticksG.appendChild(svg('path', { d: ticksD(cx, cy, ring.r + 4, 120, { len: 2.5, major: 10, majorLen: 6, inward: false }), class: 'con-morr__ticks' }));
        g.appendChild(ticksG);
        ring.ticksG = ticksG;
        // the category engraved at the foot of its orbit, reading upright
        const word = String(typeof label === 'function' ? label(ring.id) : ring.id).toUpperCase();
        const held = ring.ids.filter((id) => (rowOf(id) || {}).unlocked).length;
        const rn = Math.max(9.5, Math.min(12, R / 38));
        const textLen = (word.length + 6) * rn * 0.95;
        const r = ring.r - 9 - rn * 0.1;
        const spanDeg = (textLen / r) * (180 / Math.PI);
        ring.nameAt = 180;
        ring.nameSpan = spanDeg;
        ring.nameR = r;
        ring.namePx = rn;
        const pid = `con-morr-name-${ring.id}-${Math.round(R)}`;
        const namePath = svg('path', { id: pid, d: 'M 0 0', fill: 'none', stroke: 'none' });
        g.appendChild(namePath);
        ring.namePath = namePath;
        const text = svg('text', { class: 'con-morr__ringname' });
        ring.nameText = text;
        const tp = svg('textPath', { href: `#${pid}` });
        tp.appendChild(doc.createTextNode(`${word}  `));
        const c = svg('tspan');
        c.textContent = `${held}/${ring.ids.length}`;
        tp.appendChild(c);
        text.appendChild(tp);
        g.appendChild(text);
        ring.g = g;
        layer.appendChild(g);
      });
      // the Hand: its pivot on the gauge, its arm out to the chosen medal
      armG = svg('g', { class: 'con-morr__hand' });
      armBloom = svg('path', { class: 'con-morr__armbloom', d: 'M 0 0' });
      arm = svg('path', { class: 'con-morr__arm', d: 'M 0 0' });
      tip = svg('path', { class: 'con-morr__tip', d: 'M 0 0' });
      const [hx, hy] = polar(cx, cy, geo.gaugeR + 11, HAND_BEARING);
      armG.append(armBloom, arm, tip, svg('circle', { cx: f(hx), cy: f(hy), r: 6.5, class: 'con-morr__hubring' }), svg('circle', { cx: f(hx), cy: f(hy), r: 3.4, class: 'con-morr__hub' }));
      layer.appendChild(armG);
    }
    countN.textContent = String(rows.filter((r) => r.unlocked).length);
    countOf.textContent = `of ${rows.length}`;

    // the medals, one button each, riding their orbits
    const active = doc.activeElement;
    const focusedId = active && list.contains(active) && active.dataset ? active.dataset.id : null;
    list.textContent = '';
    labelLayer.textContent = '';
    buttons = new Map();
    labels = new Map();
    rings.forEach((ring, ri) => {
      ring.ids.forEach((id, i) => {
        const row = rowOf(id);
        if (!row) return;
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'con-medal';
        b.dataset.id = id;
        b.dataset.state = medalState(row);
        if (row.masked) b.dataset.masked = '1';
        b.style.setProperty('--ms', `${ring.size}px`);
        b.style.setProperty('--mo-d', `${180 + ri * 90 + i * 40}ms`);
        const face = doc.createElement('span');
        face.className = 'con-medal__face';
        const src = typeof art === 'function' ? art(row) : null;
        face.innerHTML = '<span class="con-medal__body"></span>' + medalDialSvg(medalProgress(row))
          + (src && src.url ? `<img class="con-medal__art" src="${src.url}" alt="" draggable="false" decoding="async">` : '')
          + `<span class="con-medal__glyph">${typeof glyph === 'function' ? glyph(row) : ''}</span>`;
        if (src && src.url) face.classList.add('has-art');
        if (src && src.glyph) face.classList.add('has-glyph');
        b.appendChild(face);
        b.setAttribute('aria-label', `${row.name}. ${row.description} ${row.status}.`);
        b.addEventListener('click', () => { if (typeof onPick === 'function') onPick(id, 'click'); });
        b.addEventListener('focus', () => { if (!restoring && chosen !== id && typeof onPick === 'function') onPick(id, 'focus'); });
        list.appendChild(b);
        buttons.set(id, b);
        // its name, for when its orbit is the front one
        const el = doc.createElement('div');
        el.className = 'con-morr__label';
        const nm = doc.createElement('span');
        nm.className = 'con-morr__lname';
        nm.textContent = row.name;
        el.appendChild(nm);
        const state = medalState(row);
        const counted = !row.masked && Number(row.target) > 1;
        const subText = row.unlocked ? String(row.status || '').replace(/^Unlocked\s*/i, '') : counted ? row.status : '';
        let w = textW(row.name, lpx);
        let h = Math.round(lpx * 1.25);
        const nh = h;
        if (subText) {
          const sb = doc.createElement('span');
          sb.className = 'con-morr__lsub';
          sb.textContent = subText;
          el.appendChild(sb);
          w = Math.max(w, textW(subText, lpx - 1.5));
          h += Math.round((lpx - 1.5) * 1.2) + 3;
        }
        el.__w = Math.ceil(w) + 4;
        el.__h = h;
        el.__nh = nh;
        el.dataset.state = state;
        labelLayer.appendChild(el);
        labels.set(id, el);
      });
    });
    mark();
    if (focusedId && buttons.get(focusedId)) {
      restoring = true;
      try { buttons.get(focusedId).focus({ preventScroll: true }); } catch (_) { /* focus is a nicety */ }
      restoring = false;
    }
  }

  const schedule = () => {
    if (frame) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') frame = raf(() => { frame = 0; layout(); });
    else layout();
  };
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => { drawnKey = ''; schedule(); }); ro.observe(host); }

  // left and right turn the orbit a medal; up and down step to the next orbit out or in
  list.addEventListener('keydown', (event) => {
    const from = event.target && event.target.closest ? event.target.closest('.con-medal') : null;
    if (!from || !/^Arrow/.test(event.key)) return;
    const id = from.dataset.id;
    const ring = ringOf(id);
    if (!ring) return;
    let next = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const i = ring.ids.indexOf(id);
      const d = event.key === 'ArrowRight' ? 1 : -1;
      next = ring.ids[(i + d + ring.ids.length) % ring.ids.length];
    } else {
      const ri = rings.indexOf(ring) + (event.key === 'ArrowUp' ? 1 : -1);
      const to = rings[ri];
      if (!to) { event.preventDefault(); if (typeof onEdge === 'function') onEdge(event.key === 'ArrowUp' ? 'up' : 'down'); return; }
      // the medal of that orbit nearest the Hand: the least turn
      const step = 360 / to.n;
      let best = Infinity;
      to.ids.forEach((mid, i) => { const dd = Math.abs(wrap180(to.off + step * i - HAND_BEARING)); if (dd < best) { best = dd; next = mid; } });
    }
    event.preventDefault();
    const b = next && buttons.get(next);
    if (b) { try { b.focus(); } catch (_) { /* focus is a nicety */ } }
  });
  // the wheel turns the front orbit
  host.addEventListener('wheel', (event) => {
    const ring = ringOf(chosen);
    if (!ring || !geo) return;
    event.preventDefault();
    const i = ring.ids.indexOf(chosen);
    const next = ring.ids[(i + (event.deltaY > 0 ? 1 : -1) + ring.ids.length) % ring.ids.length];
    if (typeof onPick === 'function') onPick(next, 'wheel');
  }, { passive: false });
  host.addEventListener('pointermove', (event) => {
    const r = host.getBoundingClientRect();
    host.style.setProperty('--con-mx', `${Math.round(event.clientX - r.left)}px`);
    host.style.setProperty('--con-my', `${Math.round(event.clientY - r.top)}px`);
    host.classList.add('is-lit');
  });
  host.addEventListener('pointerleave', () => host.classList.remove('is-lit'));

  return {
    el: host,
    list,
    /** Every row (all categories), the chosen medal and the category in front ('all' for none). */
    set(nextRows, { chosen: nextChosen = chosen, section: nextSection = section } = {}) {
      rows = Array.isArray(nextRows) ? nextRows : [];
      chosen = nextChosen || null;
      section = nextSection || 'all';
      layout();
    },
    choose(id, { section: nextSection, instant = false } = {}) {
      if (nextSection) section = nextSection;
      chosen = id || null;
      mark();
      aim({ instant });
    },
    arrive() {
      if (reducedMotion() || !geo) return;
      host.classList.remove('is-arriving');
      void host.offsetWidth;
      host.classList.add('is-arriving');
      clearTimeout(arriveTimer);
      arriveTimer = setTimeout(() => host.classList.remove('is-arriving'), 1500);
      // the orbits spin up to rest
      for (const ring of rings) ring.spring && ring.spring.set(ring.off - 40, { instant: true });
      reachSpring.set(geo.gaugeR + 20, { instant: true });
      setTimeout(() => aim(), 260);
    },
    /** A medal struck while open: it flares where it stands. */
    strike(id) {
      const b = buttons.get(id);
      if (!b || reducedMotion()) return;
      b.classList.remove('is-struck');
      void b.offsetWidth;
      b.classList.add('is-struck');
      setTimeout(() => b.classList.remove('is-struck'), 1000);
    },
    focusChosen() {
      const b = (chosen && buttons.get(chosen)) || buttons.values().next().value;
      if (b) { try { b.focus({ preventScroll: true }); } catch (_) { /* focus is a nicety */ } }
    },
    button: (id) => buttons.get(id) || null,
    dispose() {
      reachSpring.stop();
      for (const r of rings) if (r.spring) r.spring.stop();
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
