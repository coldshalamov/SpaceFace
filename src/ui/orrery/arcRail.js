// ORRERY Arc Rail (design/frontend/ORRERY.md §4 #1 Orbit Ring + #2 the Hand; §6 Title, Pause).
//
// A menu set round the rim of a dial. A huge engraved emblem sits on a pivot just off the leading
// edge of the screen, drifting; the verbs ride an arc of light outside its rim, each on its own
// tick; the amber Hand swings from the pivot to whichever verb is awake (hovered, focused, or the
// primary at rest), with a spring that overshoots a little and settles, like a needle.
//
// It does NOT build the menu. It takes the list a screen already builds (kit `words()`: real
// <button data-action> elements with their aria names, notes and roving focus — the contract every
// boot check, probe and capture uses) and only POSITIONS those items and draws the instrument
// behind them. So the arc can be taken off again and the menu is exactly what it was.
//
// Motion: the emblem's drift and the arrival are compositor transforms/opacity; the Hand is the
// shared spring; nothing runs per frame at rest. Reduced motion (html.sf-reduce-motion) stills it.
import { svg, arcD, polar, circularText, ticksD } from './svg.js';
import { createSpring } from './motion.js';
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-arcrail-style';

const CSS = `
/* An abspos child of a grid frame honours justify/align-self: a start-aligned frame shrink-wraps it,
   and with every child absolute that is 0 x 0. So the host states its size and stretches outright. */
.orr-arcrail-host { position:absolute !important; inset:0 !important; margin:0 !important; padding:0 !important;
  width:100% !important; height:100% !important; max-width:none !important; max-height:none !important;
  place-self:stretch !important; display:block !important; grid-area:auto !important; pointer-events:none; z-index:1; }
.orr-arcrail-host > .orr-arcrail__list { position:absolute !important; inset:0; display:block !important; margin:0; padding:0; }
.orr-arcrail-host > .orr-arcrail__list > li { position:absolute; margin:0; width:max-content; max-width:46vw; pointer-events:auto; }
.orr-arcrail-host > .orr-arcrail__list > li[role="presentation"] { display:none; }
.orr-arcrail-host > .orr-arcrail__extra { position:absolute !important; margin:0 !important; width:max-content; pointer-events:auto; }
/* ONE awake state. The needle, its bead on the lit tick, and light inside the awake word say what is
   current; the attention pool (a soft box behind the word), the 2 px bracket (a text cursor) and a
   word's own lamp bead would each say it a second time, so under the dial they are off. Hover moves
   focus, so keyboard and mouse can never light two words at once. */
.orr-arcrail-host.dp-attend::before, .orr-arcrail-host .dp-attend::before { display:none !important; }
.orr-arcrail-host .dp-lit__item::before, .orr-arcrail-host .dp-lit__item::after,
.orr-arcrail-host [data-dp-focus]::before { display:none !important; }
/* one weight, wide capitals, the HUD's spacing; the awake word gains light and a small step */
.orr-arcrail-host .dp-lit__item, .orr-arcrail-host .dp-lit__item--primary {
  font-size:clamp(20px, 2.7vh, 31px) !important; font-variation-settings:"wght" 600, "wdth" 118 !important;
  letter-spacing:.06em !important; color:rgb(232 226 212 / .7) !important; padding:4px 0 !important;
  text-shadow:0 1px 0 rgb(0 0 0 / .55), 0 0 16px rgb(0 0 0 / .45) !important;
  transform-origin:0 50%; transition:color .16s linear, transform .24s var(--dp-ease-out, ease-out), text-shadow .16s linear; }
.orr-arcrail-host .dp-lit__item[data-awake] {
  color:rgb(246 241 230) !important; transform:scale(1.06);
  text-shadow:0 0 1px rgb(255 226 178 / .55), 0 0 9px rgb(255 217 140 / .2), 0 1px 0 rgb(0 0 0 / .6) !important; }
.orr-arcrail-host .dp-lit__item[aria-disabled="true"], .orr-arcrail-host .dp-lit__item:disabled {
  color:rgb(232 226 212 / .34) !important; text-shadow:0 1px 0 rgb(0 0 0 / .5) !important; }
/* a verb that waits on a screen still loading stands at rest light under the Hand, never greyed */
.orr-arcrail-host .dp-lit__item[data-awake][aria-disabled="true"] { color:rgb(232 226 212 / .7) !important; }
.orr-arcrail-host .dp-lit__item--danger[data-awake] { color:var(--dp-danger-hot, #ff7a5c) !important;
  text-shadow:0 0 22px rgb(255 80 56 / .36), 0 1px 0 rgb(0 0 0 / .6) !important; }
/* a grouped dial: the group's name is a legend on its stop's line, quiet caps ahead of its verbs */
.orr-svg text.orr-arcrail__legend { font-family:var(--dp-face-display, "Archivo"), sans-serif; font-size:10.5px; font-variation-settings:"wght" 600, "wdth" 112;
  letter-spacing:.22em; fill:rgb(232 226 212 / .56); dominant-baseline:auto; }
/* the emblem's lettering: its name round the rim, quiet wide capitals */
.orr-svg .orr-arcrail__lettering, .orr-svg .orr-arcrail__lettering text { font-family:var(--dp-face-display, "Archivo"), sans-serif; font-variation-settings:"wght" 600, "wdth" 112;
  letter-spacing:.3em; fill:rgb(232 226 212 / .58); }
.orr-svg text.orr-arcrail__legend.is-lit { fill:rgb(246 241 230 / .92); }
/* a grouped row: the awake word lights without growing, so it never eats the gap to its neighbour */
.orr-arcrail-host--grouped .dp-lit__item[data-awake] { transform:none !important; }
/* the extra fine row (the title's ARCHIVE and SANDBOX) is one line on its stop, one tick for both */
.orr-arcrail-host > .orr-arcrail__extra { display:flex !important; flex-direction:row !important; flex-wrap:nowrap !important; align-items:baseline; gap:22px !important; }
.orr-arcrail-host > .orr-arcrail__extra > li { position:static !important; margin:0 !important; flex:0 0 auto !important; width:auto !important; }
@media (max-height:800px) { .orr-svg .orr-arcrail__lettering, .orr-svg .orr-arcrail__lettering text { letter-spacing:.2em; } }
/* a grouped row runs out over the held world: each word carries its own halo of dark (light, not a box) */
.orr-arcrail-host--grouped .orr-arcrail__glow { background:radial-gradient(closest-side, rgb(4 6 9 / .66), rgb(4 6 9 / .6) 45%, rgb(4 6 9 / .5) 60%, rgb(4 6 9 / .18) 82%, transparent); }
.orr-arcrail-host--grouped .dp-lit__item { text-shadow:0 0 8px rgb(4 6 9 / .95), 0 0 18px rgb(4 6 9 / .85), 0 0 32px rgb(4 6 9 / .6) !important; }
.orr-arcrail-host--grouped .orr-svg text.orr-arcrail__legend { paint-order:stroke; stroke:rgb(4 6 9 / .9); stroke-width:5px; stroke-linejoin:round; }
/* a dense dial (pause): smaller words, the primary a size up as the one lamp key */
.orr-arcrail-host--dense .dp-lit__item { font-size:clamp(15px, 1.95vh, 22px) !important; letter-spacing:.09em !important; }
.orr-arcrail-host--dense .dp-lit__item--primary { font-size:clamp(28px, 3.6vh, 42px) !important; letter-spacing:.05em !important; }
.orr-arcrail-host--dense li[data-tier="low"] .dp-lit__item { font-size:clamp(12px, 1.45vh, 16px) !important; letter-spacing:.14em !important;
  color:rgb(232 226 212 / .62) !important; }
.orr-arcrail-host--dense li[data-tier="low"] .dp-lit__item[data-awake] { color:rgb(246 241 230) !important; }
.orr-arcrail-host .dp-kbd { display:none !important; }
.orr-svg text.orr-arcrail__cluster { font-size:9px; letter-spacing:.3em; fill:rgb(232 226 212 / .5); text-anchor:start; }
.orr-svg .orr-arcrail__sector text { letter-spacing:.3em; fill:rgb(232 226 212 / .72); font-weight:700; }
/* notes stay for the accessibility tree; the dial shows the fact elsewhere (the eyebrow) */
.orr-arcrail-host .dp-lit__note { position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important;
  clip-path:inset(50%) !important; white-space:nowrap !important; margin:0 !important; }
/* minor stations: fine words lettered like the rim engraving */
.orr-arcrail-host .dp-lit--fine .dp-lit__item { font-size:10px !important; letter-spacing:.32em !important; font-variation-settings:"wght" 600, "wdth" 100 !important;
  color:rgb(232 226 212 / .64) !important; }
.orr-arcrail-host .dp-lit--fine .dp-lit__item[data-awake] { color:var(--dp-ink, #e8e2d4) !important; transform:none; }
.orr-arcrail-host .dp-kbd { background:none !important; border:0 !important; box-shadow:none !important; color:rgb(232 226 212 / .5) !important;
  font-size:.62em !important; letter-spacing:.2em !important; padding:0 0 0 .4em !important; }
.orr-arcrail__trail { fill:none; stroke:var(--dp-hand, #f2b950); stroke-linecap:round; animation:orr-trail-fade 520ms ease-out forwards; }
@keyframes orr-trail-fade { from { opacity:.5; } to { opacity:0; } }
@media (forced-colors: active) {
  .orr-arcrail-host [data-dp-focus]::before, .orr-arcrail-host .dp-lit__item:focus-visible::before {
    display:block !important; content:""; position:absolute; left:-10px; top:14%; bottom:14%; width:2px; background:CanvasText; }
}
html.sf-reduce-motion .orr-arcrail__trail { display:none; }
.orr-arcrail { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.orr-arcrail__layer { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
.orr-arcrail__emblem { position:absolute; border-radius:50%; pointer-events:none; opacity:.17;
  background:center / contain no-repeat; transform-origin:50% 50%;
  -webkit-mask-image:radial-gradient(circle closest-side, rgb(0 0 0 / .18) 0%, rgb(0 0 0 / .45) 48%, #000 82%);
  mask-image:radial-gradient(circle closest-side, rgb(0 0 0 / .18) 0%, rgb(0 0 0 / .45) 48%, #000 82%);
  animation:orr-emblem-drift 540s linear infinite; }
.orr-arcrail__glow { position:absolute; border-radius:50%; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 6 9 / .36), rgb(4 6 9 / .26) 46%, rgb(4 6 9 / .1) 72%, transparent); }
.orr-arcrail__face { animation:orr-emblem-drift 720s linear infinite; }
.orr-arcrail.is-arriving .orr-arcrail__face { animation:orr-face-in 1100ms var(--dp-ease-out, cubic-bezier(.2,.9,.25,1)) both, orr-emblem-drift 720s linear 1100ms infinite; }
@keyframes orr-face-in { from { opacity:0; transform:rotate(-24deg); } to { opacity:1; transform:none; } }
@keyframes orr-emblem-drift { to { transform:rotate(360deg); } }
.orr-arcrail__orbit { animation:orr-emblem-drift 900s linear infinite reverse; }
.orr-arcrail__tick { transition:stroke .18s linear, opacity .18s linear; }
.orr-svg text.orr-arcrail__group { letter-spacing:.3em; fill:rgb(232 226 212 / .5); }
.orr-arcrail.is-arriving .orr-arcrail__emblem { animation:orr-emblem-in 1100ms var(--dp-ease-out, cubic-bezier(.2,.9,.25,1)) both, orr-emblem-drift 540s linear 1100ms infinite; }
@keyframes orr-emblem-in { from { opacity:0; transform:rotate(-28deg) scale(.94); } to { opacity:.17; transform:none; } }
.orr-arcrail.is-arriving .orr-arcrail__rail { stroke-dasharray:1; stroke-dashoffset:1; animation:orr-rail-draw 900ms var(--dp-ease-out, ease-out) 180ms forwards; }
@keyframes orr-rail-draw { to { stroke-dashoffset:0; } }
html.sf-reduce-motion .orr-arcrail__emblem, html.sf-reduce-motion .orr-arcrail__orbit, html.sf-reduce-motion .orr-arcrail__face,
html.sf-reduce-motion .orr-arcrail.is-arriving .orr-arcrail__rail { animation:none !important; }
html.sf-reduce-motion .orr-arcrail.is-arriving .orr-arcrail__rail { stroke-dashoffset:0; }
@media (forced-colors: active) { .orr-arcrail__emblem, .orr-arcrail__glow { display:none; } }
`;

function injectStyle(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ROW_GAP = 26;
let clearSeq = 0;

/**
 * The dial's geometry for a host of W x H holding `count` verbs. Pure, so it is testable: the pivot
 * sits off the leading edge, the emblem fills most of the height, and the verbs spread
 * symmetrically about "east" (90 deg, 0 = up, clockwise) on a ring just outside the emblem.
 */
export function arcRailGeometry(W, H, count, { span = null, pivotY = 0.56, gaps = null, place = null } = {}) {
  // place(W, H) -> { pivot:{x,y}, re, centerDeg }: an emblem set where the screen wants it (the title's
  // sits behind its logotype); by default the pivot sits just inside the leading edge
  const at = typeof place === 'function' ? place(W, H) : null;
  const re = at && at.re ? at.re : clamp(H * 0.33, 210, 420);
  // the hub sits just inside the leading edge: a needle needs a visible pivot to read as one
  const pivot = at && at.pivot ? { x: at.pivot.x, y: at.pivot.y } : { x: clamp(W * 0.056, 56, 112), y: clamp(H * pivotY, re * 0.7, H - re * 0.35) };
  const ri = re + clamp(H * 0.046, 34, 56);
  const n = Math.max(1, count);
  const spread = span != null ? span : clamp(n * 12, 30, 80);
  const center = at && Number.isFinite(at.centerDeg) ? at.centerDeg : 90;
  // Equal VERTICAL rhythm, not equal angles: words are set horizontally, so what must stay even is
  // the line spacing; equal angles bunch the lines where the arc turns steep at its ends. A group
  // change adds most of a line of air.
  const gapBefore = new Set(gaps || []);
  const units = (n - 1) + gapBefore.size * 0.7;
  // the arc runs from center - spread/2 to center + spread/2 (0 = up, clockwise); its lines are evenly spaced in y
  const rad = Math.PI / 180;
  const yA = pivot.y - ri * Math.cos((center - spread / 2) * rad);
  const yB = pivot.y - ri * Math.cos((center + spread / 2) * rad);
  const angles = [];
  let u = 0;
  for (let i = 0; i < n; i += 1) {
    if (i > 0) u += gapBefore.has(i) ? 1.7 : 1;
    const y = n > 1 ? yA + ((yB - yA) * u) / units : pivot.y - ri * Math.cos(center * rad);
    angles.push(Math.acos(clamp((pivot.y - y) / ri, -1, 1)) * 180 / Math.PI);
  }
  const step = n > 1 ? spread / units : 0;
  const anchors = angles.map((a) => { const [x, y] = polar(pivot.x, pivot.y, ri, a); return { a, x, y }; });
  return { W, H, re, ri, pivot, step, angles, anchors };
}

// The dial's face, drawn in its own line language instead of a raster emblem: orbits at three tiers
// of light (brightest outside, fading to ~6 % at the hub), a graduated scale, a sun with rays, three
// small ringed bodies, and the game's verb -- a rock on a tether swinging round the centre.
function drawFace(p, re) {
  const g = svg('g', { class: 'orr-arcrail__face', style: `transform-origin:${p.x}px ${p.y}px`, fill: 'none' });
  const bone = (a) => `rgb(232 226 212 / ${a})`;
  const ringAt = (f, a, extra = {}) => g.appendChild(svg('path', { d: arcD(p.x, p.y, re * f, 0, 360), stroke: bone(a), 'stroke-width': 1, ...extra }));
  ringAt(0.9, 0.2);
  ringAt(0.78, 0.13, { 'stroke-dasharray': '1 6', 'stroke-linecap': 'round', 'stroke-width': 1.4 });
  ringAt(0.66, 0.14);
  ringAt(0.52, 0.1, { 'stroke-dasharray': '10 5' });
  ringAt(0.38, 0.08);
  ringAt(0.24, 0.06, { 'stroke-dasharray': '1 4', 'stroke-linecap': 'round' });
  g.appendChild(svg('path', { d: ticksD(p.x, p.y, re * 0.66, 180, { len: 4, major: 15, majorLen: 9, inward: true }), stroke: bone(0.12), 'stroke-width': 1 }));
  // crosshair and a sun with rays
  g.appendChild(svg('path', { d: `M ${p.x - re * 0.9} ${p.y} L ${p.x + re * 0.9} ${p.y} M ${p.x} ${p.y - re * 0.9} L ${p.x} ${p.y + re * 0.9}`, stroke: bone(0.05), 'stroke-width': 1 }));
  g.appendChild(svg('path', { d: arcD(p.x, p.y, re * 0.07, 0, 360), stroke: bone(0.18), 'stroke-width': 1.2 }));
  g.appendChild(svg('path', { d: ticksD(p.x, p.y, re * 0.16, 24, { len: re * 0.05, inward: true }), stroke: bone(0.1), 'stroke-width': 1 }));
  // three small bodies riding their orbits, each with its own thin ring
  for (const [f, a, r] of [[0.66, 58, 9], [0.52, 128, 6], [0.9, 12, 5]]) {
    const [bx, by] = polar(p.x, p.y, re * f, a);
    g.appendChild(svg('circle', { cx: bx.toFixed(1), cy: by.toFixed(1), r, stroke: bone(0.3), 'stroke-width': 1.2, fill: 'rgb(5 7 10 / .6)' }));
    g.appendChild(svg('path', { d: arcD(bx, by, r + 5, 0, 360), stroke: bone(0.14), 'stroke-width': 1 }));
  }
  // the tether: from the centre, sagging round to a faceted rock on the outer orbit
  const [rx, ry] = polar(p.x, p.y, re * 0.78, 152);
  const [qx, qy] = polar(p.x, p.y, re * 0.66, 104);
  g.appendChild(svg('path', { d: `M ${p.x} ${p.y} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${rx.toFixed(1)} ${ry.toFixed(1)}`, stroke: bone(0.26), 'stroke-width': 1.2 }));
  const rock = [0, 55, 120, 170, 230, 290].map((a, i) => polar(rx, ry, [11, 8, 12, 9, 13, 8][i], a)).map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`);
  g.appendChild(svg('path', { d: `M ${rock.join(' L ')} Z`, stroke: bone(0.34), 'stroke-width': 1.2, fill: 'rgb(5 7 10 / .55)' }));
  return g;
}

/**
 * @param {object} o
 * @param {HTMLElement} o.host      the element that holds the list (it becomes the full-screen host)
 * @param {HTMLElement} [o.frame]   the screen root the host is lifted into: a host left inside a grid
 *                                  cell resolves its absolute box against that (auto, empty) cell
 * @param {HTMLElement} o.list      the words() <ul> whose <li> items ride the arc
 * @param {HTMLElement[]} [o.extra] further items (e.g. a fine aside row) set on the arc after the list
 * @param {string} [o.emblemUrl]    the engraved emblem art (transparent, bone line work)
 * @param {string} [o.engraving]    micro text engraved along the lower rim
 * @param {boolean} [o.grouped]     verbs sharing a data-group ride ONE tick as a row, the group's
 *                                  name engraved over it (a long menu stays a readable dial)
 */
export function createArcRail({ host, list, frame = null, extra = [], emblemUrl = null, engraving = '', grouped = false, dense = false,
  clustered = false, span = null, pivotY = 0.56, place = null, engravingDeg = null, clearOf = null } = {}) {
  const doc = (host && host.ownerDocument) || globalThis.document;
  // Headless shims (tests) mount screens without a real document: the rail is presentation only, so
  // it steps aside and the menu stays exactly the list the screen built.
  if (!host || !list || !doc || typeof doc.createElement !== 'function' || typeof doc.createElementNS !== 'function'
    || !host.classList || typeof host.insertBefore !== 'function') {
    return { el: null, layout() {}, rest() {}, get geometry() { return null; }, dispose() {} };
  }
  injectOrrery();
  injectStyle();
  const home = host.parentNode;
  const homeNext = host.nextSibling;
  if (frame && host.parentNode !== frame) frame.appendChild(host);
  host.classList.add('orr-arcrail-host');
  if (dense) host.classList.add('orr-arcrail-host--dense');
  if (grouped) host.classList.add('orr-arcrail-host--grouped');
  list.classList.add('orr-arcrail__list');

  const root = doc.createElement('div');
  root.className = 'orr-arcrail is-arriving';
  root.setAttribute('aria-hidden', 'true');
  const glow = doc.createElement('div');
  glow.className = 'orr-arcrail__glow';
  const emblem = doc.createElement('div');
  emblem.className = 'orr-arcrail__emblem';
  if (emblemUrl) emblem.style.backgroundImage = `url("${emblemUrl}")`;
  const layer = svg('svg', { class: 'orr-svg orr-arcrail__layer' });
  root.append(glow, emblem, layer);
  host.insertBefore(root, host.firstChild);

  for (const node of extra) node.classList.add('orr-arcrail__extra');
  const items = () => [...list.children].filter((li) => li.getAttribute('role') !== 'presentation' && !li.hidden).concat(extra);
  // Rows: each verb its own row, or (grouped) consecutive verbs of one data-group sharing a row.
  const rows = () => {
    const out = [];
    for (const li of items()) {
      const g = grouped && li.dataset ? li.dataset.group : null;
      const last = out[out.length - 1];
      if (g && last && last.group === g) last.items.push(li);
      else out.push({ group: g || null, items: [li] });
    }
    return out;
  };
  let geo = null;
  let blade = null; let bladeBloom = null; let core = null; let tail = null; let bead = null; let beadBloom = null;
  let glint = null; let glintBloom = null; let trailHost = null; let ticks = []; let leader = null;
  // a needle's spring: one slight overshoot, settled in about a quarter second
  const handSpring = createSpring({ value: 20, preset: { k: 95, c: 11.5 }, onUpdate: (deg) => paintHand(deg) });
  let handIndex = -1;

  function paintHand(deg) {
    if (!geo || !blade) return;
    const { pivot, ri } = geo;
    const rt = ri - 8;                       // the rim: the blade ends ON the lit tick
    const [tx, ty] = polar(pivot.x, pivot.y, rt, deg);
    const [lx, ly] = polar(pivot.x, pivot.y, 4.2, deg - 90);
    const [rx, ry] = polar(pivot.x, pivot.y, 4.2, deg + 90);
    // a blade: about 8 px at the hub tapering to a true point on the rim, a pale hot core down it
    const d = `M ${lx.toFixed(1)} ${ly.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} L ${rx.toFixed(1)} ${ry.toFixed(1)} Z`;
    blade.setAttribute('d', d);
    const [c0x, c0y] = polar(pivot.x, pivot.y, 12, deg);
    const [c1x, c1y] = polar(pivot.x, pivot.y, rt - 16, deg);
    core.setAttribute('d', `M ${c0x.toFixed(1)} ${c0y.toFixed(1)} L ${c1x.toFixed(1)} ${c1y.toFixed(1)}`);
    bladeBloom.setAttribute('d', `M ${pivot.x.toFixed(1)} ${pivot.y.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`);
    // a teardrop counterweight: narrow at the hub, swelling to a round end
    const back = deg + 180;
    const [n0x, n0y] = polar(pivot.x, pivot.y, 2.4, back - 90);
    const [n1x, n1y] = polar(pivot.x, pivot.y, 2.4, back + 90);
    const [ex, ey] = polar(pivot.x, pivot.y, 30, back);
    const [w0x, w0y] = polar(ex, ey, 6, back - 90);
    const [w1x, w1y] = polar(ex, ey, 6, back + 90);
    const [tipx, tipy] = polar(ex, ey, 6, back);
    tail.setAttribute('d', `M ${n0x.toFixed(1)} ${n0y.toFixed(1)} L ${w0x.toFixed(1)} ${w0y.toFixed(1)} Q ${polar(ex, ey, 8.5, back - 45).map((v) => v.toFixed(1)).join(' ')} ${tipx.toFixed(1)} ${tipy.toFixed(1)} Q ${polar(ex, ey, 8.5, back + 45).map((v) => v.toFixed(1)).join(' ')} ${w1x.toFixed(1)} ${w1y.toFixed(1)} L ${n1x.toFixed(1)} ${n1y.toFixed(1)} Z`);
    // the rim answers where the Hand points: a short arc of light on the orbit, centred on the needle
    const g = arcD(pivot.x, pivot.y, geo.re + 4, deg - 12, deg + 12);
    glint.setAttribute('d', g);
    glintBloom.setAttribute('d', g);
    for (const b of [bead, beadBloom]) { b.setAttribute('cx', tx.toFixed(1)); b.setAttribute('cy', ty.toFixed(1)); }
    // the awake word lights only once the tip is within a few degrees of it
    if (pendingWake !== undefined && handIndex >= 0 && Math.abs(deg - geo.angles[handIndex]) < 5) { applyWake(pendingWake); pendingWake = undefined; }
  }

  // the swing leaves a fading arc of light on the rim between where it was and where it went
  function trail(fromDeg, toDeg) {
    if (!geo || !trailHost || Math.abs(toDeg - fromDeg) < 1) return;
    const a0 = Math.min(fromDeg, toDeg);
    const a1 = Math.max(fromDeg, toDeg);
    trailHost.textContent = '';
    trailHost.appendChild(svg('path', { d: arcD(geo.pivot.x, geo.pivot.y, geo.ri - 8, a0, a1), class: 'orr-arcrail__trail', 'stroke-width': 1.4 }));
  }

  function build() {
    const W = host.clientWidth || doc.documentElement.clientWidth;
    const H = host.clientHeight || doc.documentElement.clientHeight;
    const all = rows();
    // clustered: every verb its own tick, a wider gap where its group changes, the group's name
    // engraved on the rim beside its cluster
    const gaps = [];
    if (clustered) all.forEach((row, i) => { if (i > 0 && (row.items[0].dataset.group || '') !== (all[i - 1].items[0].dataset.group || '')) gaps.push(i); });
    geo = arcRailGeometry(W, H, all.length, { span, pivotY, gaps, place });
    layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
    layer.textContent = '';
    const { pivot, re, ri, angles } = geo;
    // the emblem and its glow, centred on the pivot
    const size = re * 2;
    Object.assign(emblem.style, { width: `${size}px`, height: `${size}px`, left: `${pivot.x - re}px`, top: `${pivot.y - re}px` });
    // a pool of shadow reaching past the verbs: they read over any world (the held flight, the rock)
    const reach = ri + 420;
    Object.assign(glow.style, { width: `${reach * 2}px`, height: `${reach * 2}px`, left: `${pivot.x - reach}px`, top: `${pivot.y - reach}px` });
    // an outer orbit of fine ticks round the emblem, counter-drifting
    if (!emblemUrl) layer.appendChild(drawFace(pivot, re));
    // the rim scale is the brightest tier: bone ticks over a soft bloom, a lit rim ring
    const orbit = svg('g', { class: 'orr-arcrail__orbit', style: `transform-origin:${pivot.x}px ${pivot.y}px` });
    const rimTicks = ticksD(pivot.x, pivot.y, re + 9, 144, { len: 3, major: 12, majorLen: 8, inward: false });
    orbit.appendChild(svg('path', { d: rimTicks, class: 'orr-bloom orr-hi', 'stroke-width': 4, opacity: '.18' }));
    orbit.appendChild(svg('path', { d: rimTicks, stroke: 'rgb(236 230 216 / .72)', 'stroke-width': 1, fill: 'none' }));
    layer.appendChild(orbit);
    layer.appendChild(svg('path', { d: arcD(pivot.x, pivot.y, re + 4, 0, 360), class: 'orr-bloom orr-hi', 'stroke-width': 5, opacity: '.1' }));
    layer.appendChild(svg('path', { d: arcD(pivot.x, pivot.y, re + 4, 0, 360), stroke: 'rgb(236 230 216 / .62)', 'stroke-width': 1.2, fill: 'none' }));
    glintBloom = svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 8, opacity: '.18' });
    glint = svg('path', { d: '', class: 'orr-core orr-hand', 'stroke-width': 1.4, opacity: '.55' });
    layer.append(glintBloom, glint);
    // the rail: an arc of light through the verbs' ticks
    const a0 = angles[0] - 8;
    const a1 = angles[angles.length - 1] + 8;
    layer.appendChild(svg('path', { d: arcD(pivot.x, pivot.y, ri - 8, a0, a1), class: 'orr-core orr-rest orr-arcrail__rail', 'stroke-width': 1, pathLength: 1 }));
    layer.appendChild(svg('path', { d: arcD(pivot.x, pivot.y, ri - 8, a0, a1), class: 'orr-bloom orr-rest', 'stroke-width': 4, opacity: '.12' }));
    ticks = angles.map((a) => {
      const [tx0, ty0] = polar(pivot.x, pivot.y, ri - 13, a);
      const [tx1, ty1] = polar(pivot.x, pivot.y, ri - 3, a);
      const t = svg('path', { d: `M ${tx0.toFixed(1)} ${ty0.toFixed(1)} L ${tx1.toFixed(1)} ${ty1.toFixed(1)}`, class: 'orr-core orr-hi orr-arcrail__tick', 'stroke-width': 1.4 });
      layer.appendChild(t);
      return t;
    });
    if (clustered) {
      let start = 0;
      for (let i = 1; i <= all.length; i += 1) {
        const g = all[start].items[0].dataset.group;
        const next = i < all.length ? all[i].items[0].dataset.group : Symbol('end');
        if (next !== g) {
          if (g) {
            // a sector on the ring: a thin bracket arc over the cluster, its name curved along it
            const sa = angles[start] - 3;
            const sb = angles[i - 1] + 3;
            const rb = re + 22;
            layer.appendChild(svg('path', { d: arcD(pivot.x, pivot.y, rb, sa, sb), stroke: 'rgb(232 226 212 / .38)', 'stroke-width': 1, fill: 'none' }));
            for (const a of [sa, sb]) {
              const [e0x, e0y] = polar(pivot.x, pivot.y, rb - 4, a); const [e1x, e1y] = polar(pivot.x, pivot.y, rb + 1, a);
              layer.appendChild(svg('path', { d: `M ${e0x.toFixed(1)} ${e0y.toFixed(1)} L ${e1x.toFixed(1)} ${e1y.toFixed(1)}`, stroke: 'rgb(232 226 212 / .38)', 'stroke-width': 1 }));
            }
            const mid = (sa + sb) / 2;
            layer.appendChild(circularText(pivot.x, pivot.y, rb - 8, String(g).toUpperCase(),
              { startDeg: mid + 90, size: 11.5, className: 'orr-arcrail__sector', anchor: 'middle', upright: true }));
          }
          start = i;
        }
      }
    } else if (engraving) {
      // the emblem's name on its rim: a chosen bearing (the title letters its upper-left quarter) or past the verbs
      const big = engravingDeg != null;
      const words = String(typeof engraving === 'function' ? engraving(W, H) : engraving).toUpperCase();
      layer.appendChild(circularText(pivot.x, pivot.y, re + (big ? 26 : 22), words,
        { startDeg: big ? engravingDeg : a1 + 34, size: big ? (H <= 800 ? 9 : 11) : 8, className: big ? 'orr-arcrail__lettering' : 'orr-micro', anchor: 'middle', upright: true }));
    }
    // clearOf: the dial's face, rings and scales break round the screen's own words (the title's name and
    // kicker), the way a dial's rule breaks for its numeral; the Hand and the verbs stay whole
    if (typeof clearOf === 'function') {
      const hr = host.getBoundingClientRect();
      const boxes = (clearOf() || []).filter((e) => e && typeof e.getBoundingClientRect === 'function').map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0);
      if (boxes.length) {
        const id = `orr-arcrail-clear-${++clearSeq}`;
        const m = svg('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H });
        m.appendChild(svg('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }));
        for (const b of boxes) m.appendChild(svg('rect', { x: (b.left - hr.left - 8).toFixed(1), y: (b.top - hr.top - 6).toFixed(1), width: (b.width + 16).toFixed(1), height: (b.height + 12).toFixed(1), rx: 4, fill: '#000' }));
        const defs = svg('defs'); defs.appendChild(m);
        const back = svg('g', { mask: `url(#${id})` });
        while (layer.firstChild) back.appendChild(layer.firstChild);
        layer.append(defs, back);
      }
    }
    leader = svg('path', { d: '', class: 'orr-core orr-hand', 'stroke-width': 1.2, opacity: '.9' });
    layer.appendChild(leader);
    // the Hand: trail, counterweight, bloom, the tapered blade, the hub cap, one bead on the rim
    trailHost = svg('g');
    tail = svg('path', { d: '', fill: 'var(--dp-hand, #f2b950)', opacity: '.8' });
    bladeBloom = svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 5, opacity: '.2' });
    blade = svg('path', { d: '', fill: 'var(--dp-hand, #f2b950)' });
    core = svg('path', { d: '', stroke: 'rgb(255 244 214)', 'stroke-width': 1, 'stroke-linecap': 'round', opacity: '.85', fill: 'none' });
    const hub = svg('g');
    // the hub: a soft glow, a dark well with a fine bone rim, and a flat amber disc at its heart
    hub.append(
      svg('circle', { cx: pivot.x, cy: pivot.y, r: 22, class: 'orr-bloom orr-hand', 'stroke-width': 10, opacity: '.12', fill: 'none' }),
      svg('circle', { cx: pivot.x, cy: pivot.y, r: 16, fill: 'rgb(4 6 9 / .92)', stroke: 'rgb(236 230 216 / .55)', 'stroke-width': 1 }),
      // a flat amber disc: light, not a lens (no gradient ball, no specular crescent)
      svg('circle', { cx: pivot.x, cy: pivot.y, r: 8, fill: 'var(--dp-hand, #f2b950)' }),
    );
    beadBloom = svg('circle', { r: 8, fill: 'var(--dp-hand, #f2b950)', opacity: '.22' });
    bead = svg('circle', { r: 3.4, fill: 'var(--dp-hand-hot, #ffd98c)' });
    layer.append(trailHost, tail, bladeBloom, blade, core, hub, beadBloom, bead);
    // seat each row on its tick: the first verb starts just past the tick, its first line centred on
    // it, and a row's further verbs follow along the line; a group's name is engraved over the row
    all.forEach((row, i) => {
      const { x, y } = geo.anchors[i];
      let cursor = x + 6;
      let rowTop = y;
      // grouped: the group's name is the row's legend, on the tick's own line, and its verbs follow it
      if (grouped && row.group) {
        const legend = svg('text', { x: (x + 8).toFixed(1), y: (y + 4).toFixed(1), class: 'orr-arcrail__legend', 'data-row': String(i) });
        legend.textContent = String(row.group).toUpperCase();
        layer.appendChild(legend);
        let lw = 0; try { lw = legend.getComputedTextLength(); } catch (_) { lw = 0; }
        cursor = x + 8 + (lw > 0 ? lw : String(row.group).length * 9) + 20;
      }
      row.items.forEach((li) => {
        const button = li.querySelector('button') || li;
        const bh = button.offsetHeight || 40;
        // left/top only: a screen's own arrival (kit stamp) owns the item's transform
        li.style.left = `${Math.round(cursor)}px`;
        li.style.top = `${Math.round(y - bh / 2)}px`;
        rowTop = Math.min(rowTop, y - bh / 2);
        cursor += (li.offsetWidth || 120) + (grouped ? 22 : ROW_GAP);
      });
      if (row.group && !grouped) {
        const t = svg('text', { x: (x + 8).toFixed(1), y: (rowTop - 2).toFixed(1), 'font-size': 9, class: 'orr-arcrail__group' });
        t.textContent = String(row.group).toUpperCase();
        layer.appendChild(t);
      }
    });
    // a grouped dial's rows run out over the held world: the shadow pool stretches into an ellipse whose
    // dark core reaches the end of the longest row, so every verb reads over any world behind it
    if (grouped) {
      let maxRight = 0;
      for (const li of items()) maxRight = Math.max(maxRight, (parseFloat(li.style.left) || 0) + (li.offsetWidth || 0));
      const hx = Math.max(reach, (maxRight - pivot.x) / 0.6);
      Object.assign(glow.style, { width: `${Math.round(hx * 2)}px`, height: `${Math.round(reach * 2)}px`, left: `${Math.round(pivot.x - hx)}px`, top: `${Math.round(pivot.y - reach)}px` });
    }
    paintHand(handSpring.value);
    lightTick(handIndex);
  }

  function lightTick(index) {
    // a grouped dial: the row the Hand stops on lights its legend, so the row itself says which it is
    if (grouped) for (const lg of layer.querySelectorAll('text.orr-arcrail__legend')) lg.classList.toggle('is-lit', Number(lg.getAttribute('data-row')) === index);
    ticks.forEach((t, i) => {
      t.setAttribute('class', `orr-core ${i === index ? 'orr-hand' : 'orr-hi'} orr-arcrail__tick`);
      t.setAttribute('opacity', i === index ? '1' : '.5');
    });
    // the lit verb alone gets a leader from the rail out to its word
    if (leader && geo && index >= 0 && index < geo.angles.length) {
      const [x0, y0] = polar(geo.pivot.x, geo.pivot.y, geo.ri - 13, geo.angles[index]);
      const [x1, y1] = polar(geo.pivot.x, geo.pivot.y, geo.ri + 4, geo.angles[index]);
      leader.setAttribute('d', `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`);
    }
  }

  function pointAt(index, { instant = false } = {}) {
    if (!geo || index < 0 || index >= geo.angles.length) return;
    if (index === handIndex && !instant) return;
    if (handIndex >= 0 && !instant) trail(handSpring.value, geo.angles[index]);
    handIndex = index;
    handSpring.set(geo.angles[index], { instant });
    lightTick(index);
  }

  // exactly one word is awake: the hovered/focused one, else the screen's current one
  let awakeButton = null;
  let pendingWake;
  function applyWake(button) {
    if (button === awakeButton) return;
    if (awakeButton) awakeButton.removeAttribute('data-awake');
    awakeButton = button || null;
    if (awakeButton) awakeButton.setAttribute('data-awake', '');
  }
  function wake(button) {
    // the previous word goes dark at once; the new one waits for the needle (see paintHand)
    if (button === awakeButton) { pendingWake = undefined; return; }
    if (awakeButton) { awakeButton.removeAttribute('data-awake'); awakeButton = null; }
    pendingWake = button || null;
    if (handIndex >= 0 && geo && Math.abs(handSpring.value - geo.angles[handIndex]) < 5) { applyWake(pendingWake); pendingWake = undefined; }
  }
  const buttonOf = (node) => (node && typeof node.closest === 'function' ? node.closest('button') : null);
  const restButton = () => {
    for (const li of items()) {
      const b = li.querySelector('[aria-current="true"]') || null;
      if (b) return b;
    }
    return list.querySelector('.dp-lit__item--primary') || null;
  };

  const indexOf = (node) => rows().findIndex((row) => row.items.some((li) => li.contains(node)));
  const restIndex = () => {
    const all = rows();
    const current = all.findIndex((row) => row.items.some((li) => li.querySelector('[aria-current="true"], .dp-lit__item--primary')));
    return current >= 0 ? current : 0;
  };
  const onOver = (e) => {
    const b = buttonOf(e.target);
    const i = indexOf(e.target);
    if (i < 0 || !b) return;
    // hover takes focus, so the mouse and the keyboard share the one awake word
    if (doc.activeElement !== b) { try { b.focus({ preventScroll: true }); } catch (_) {} }
    pointAt(i);
    wake(b);
  };
  const onFocus = (e) => { const i = indexOf(e.target); if (i >= 0) { pointAt(i); wake(buttonOf(e.target)); } };
  const onLeave = () => {
    const active = doc.activeElement;
    const i = active ? indexOf(active) : -1;
    if (i >= 0) { pointAt(i); wake(buttonOf(active)); return; }
    pointAt(restIndex());
    wake(restButton());
  };
  // a grouped dial is a grid of stops: up/down step between rows (to the row's first verb), left/right
  // along a row and on into the next. Capture phase, so the list's one-dimensional roving never sees it.
  const onKey = (e) => {
    if (!grouped || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const active = doc.activeElement;
    const all = rows();
    const ri0 = active ? indexOf(active) : -1;
    if (ri0 < 0) return;
    const buttons = (row) => row.items.map((li) => li.querySelector('button') || li);
    const flat = all.flatMap(buttons);
    const at = flat.indexOf(buttonOf(active) || active);
    let target = null;
    if (e.key === 'ArrowDown' && ri0 < all.length - 1) target = buttons(all[ri0 + 1])[0];
    else if (e.key === 'ArrowUp' && ri0 > 0) target = buttons(all[ri0 - 1])[0];
    else if (e.key === 'ArrowRight' && at >= 0 && at < flat.length - 1) target = flat[at + 1];
    else if (e.key === 'ArrowLeft' && at > 0) target = flat[at - 1];
    e.preventDefault();
    e.stopPropagation();
    if (target && typeof target.focus === 'function') target.focus();
  };
  host.addEventListener('keydown', onKey, true);
  host.addEventListener('pointerover', onOver);
  host.addEventListener('focusin', onFocus);
  host.addEventListener('pointerleave', onLeave);
  host.addEventListener('focusout', () => setTimeout(onLeave, 0));

  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => build());
    ro.observe(host);
  }
  build();
  onLeave();
  // Words are measured to seat a row; they change size once fonts load and the dial's type rules
  // apply, so seat them again then (a row measured early packs its verbs on top of each other).
  const relayout = () => { if (root.isConnected) { build(); paintHand(handSpring.value); } };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(relayout));
  if (doc.fonts && doc.fonts.ready && typeof doc.fonts.ready.then === 'function') doc.fonts.ready.then(relayout, () => {});
  const arrivalTimer = setTimeout(() => root.classList.remove('is-arriving'), 1500);

  return {
    el: root,
    layout: build,
    /** the verb at rest (the screen resolves its primary after a save scan) */
    rest() { onLeave(); },
    get geometry() { return geo; },
    dispose() {
      clearTimeout(arrivalTimer);
      handSpring.stop();
      if (ro) ro.disconnect();
      host.removeEventListener('keydown', onKey, true);
      host.removeEventListener('pointerover', onOver);
      host.removeEventListener('focusin', onFocus);
      host.removeEventListener('pointerleave', onLeave);
      root.remove();
      wake(null);
      host.classList.remove('orr-arcrail-host', 'orr-arcrail-host--dense', 'orr-arcrail-host--grouped');
      if (frame && home && host.parentNode === frame) home.insertBefore(host, homeNext);
      list.classList.remove('orr-arcrail__list');
      for (const li of items()) { li.style.left = ''; li.style.top = ''; }
    },
  };
}
