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
/* the needle's pip and the lit tick mark the awake verb; a word's own lamp bar or bead would double it */
.orr-arcrail-host .dp-lit__item::before, .orr-arcrail-host .dp-lit__item::after { display:none !important; }
.orr-arcrail { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
.orr-arcrail__layer { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
.orr-arcrail__emblem { position:absolute; border-radius:50%; pointer-events:none; opacity:.26;
  background:center / contain no-repeat; transform-origin:50% 50%;
  animation:orr-emblem-drift 540s linear infinite; }
.orr-arcrail__glow { position:absolute; border-radius:50%; pointer-events:none;
  background:radial-gradient(closest-side, rgb(255 217 140 / .07), rgb(255 217 140 / .025) 55%, transparent); }
@keyframes orr-emblem-drift { to { transform:rotate(360deg); } }
.orr-arcrail__orbit { animation:orr-emblem-drift 900s linear infinite reverse; }
.orr-arcrail__tick { transition:stroke .18s linear, opacity .18s linear; }
.orr-arcrail.is-arriving .orr-arcrail__emblem { animation:orr-emblem-in 1100ms var(--dp-ease-out, cubic-bezier(.2,.9,.25,1)) both, orr-emblem-drift 540s linear 1100ms infinite; }
@keyframes orr-emblem-in { from { opacity:0; transform:rotate(-28deg) scale(.94); } to { opacity:.26; transform:none; } }
.orr-arcrail.is-arriving .orr-arcrail__rail { stroke-dasharray:1; stroke-dashoffset:1; animation:orr-rail-draw 900ms var(--dp-ease-out, ease-out) 180ms forwards; }
@keyframes orr-rail-draw { to { stroke-dashoffset:0; } }
html.sf-reduce-motion .orr-arcrail__emblem, html.sf-reduce-motion .orr-arcrail__orbit,
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

/**
 * The dial's geometry for a host of W x H holding `count` verbs. Pure, so it is testable: the pivot
 * sits off the leading edge, the emblem fills most of the height, and the verbs spread
 * symmetrically about "east" (90 deg, 0 = up, clockwise) on a ring just outside the emblem.
 */
export function arcRailGeometry(W, H, count, { span = null } = {}) {
  const re = clamp(H * 0.36, 230, 440);
  const pivot = { x: -re * 0.34, y: clamp(H * 0.565, re * 0.7, H - re * 0.35) };
  const ri = re + clamp(H * 0.046, 34, 56);
  const n = Math.max(1, count);
  const spread = span != null ? span : clamp(n * 12, 30, 80);
  const step = n > 1 ? spread / (n - 1) : 0;
  const from = 90 - spread / 2;
  const angles = Array.from({ length: n }, (_, i) => from + step * i);
  const anchors = angles.map((a) => { const [x, y] = polar(pivot.x, pivot.y, ri, a); return { a, x, y }; });
  return { W, H, re, ri, pivot, step, angles, anchors };
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
 */
export function createArcRail({ host, list, frame = null, extra = [], emblemUrl = null, engraving = '' } = {}) {
  injectOrrery();
  injectStyle();
  const doc = host.ownerDocument;
  const home = host.parentNode;
  const homeNext = host.nextSibling;
  if (frame && host.parentNode !== frame) frame.appendChild(host);
  host.classList.add('orr-arcrail-host');
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
  const items = () => [...list.children].filter((li) => li.getAttribute('role') !== 'presentation').concat(extra);
  let geo = null;
  let armArm = null; let armBloom = null; let armPip = null; let ticks = [];
  const handSpring = createSpring({ value: 20, preset: 'swing', onUpdate: (deg) => paintHand(deg) });
  let handIndex = -1;

  function paintHand(deg) {
    if (!geo || !armArm) return;
    const [x0, y0] = polar(geo.pivot.x, geo.pivot.y, geo.re * 0.2, deg);
    const [x1, y1] = polar(geo.pivot.x, geo.pivot.y, geo.ri - 16, deg);
    const d = `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    armArm.setAttribute('d', d);
    armBloom.setAttribute('d', d);
    armPip.setAttribute('cx', x1.toFixed(1));
    armPip.setAttribute('cy', y1.toFixed(1));
  }

  function build() {
    const W = host.clientWidth || doc.documentElement.clientWidth;
    const H = host.clientHeight || doc.documentElement.clientHeight;
    const all = items();
    geo = arcRailGeometry(W, H, all.length);
    layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
    layer.textContent = '';
    const { pivot, re, ri, angles } = geo;
    // the emblem and its glow, centred on the pivot
    const size = re * 2;
    Object.assign(emblem.style, { width: `${size}px`, height: `${size}px`, left: `${pivot.x - re}px`, top: `${pivot.y - re}px` });
    Object.assign(glow.style, { width: `${size * 1.5}px`, height: `${size * 1.5}px`, left: `${pivot.x - re * 1.5}px`, top: `${pivot.y - re * 1.5}px` });
    // an outer orbit of fine ticks round the emblem, counter-drifting
    const orbit = svg('g', { class: 'orr-arcrail__orbit', style: `transform-origin:${pivot.x}px ${pivot.y}px` });
    orbit.appendChild(svg('path', { d: ticksD(pivot.x, pivot.y, re + 9, 144, { len: 3, major: 12, majorLen: 8, inward: false }), class: 'orr-core orr-rest', 'stroke-width': 1 }));
    layer.appendChild(orbit);
    layer.appendChild(svg('path', { d: arcD(pivot.x, pivot.y, re + 4, 0, 360), class: 'orr-core orr-faint', 'stroke-width': 1 }));
    // the rail: an arc of light through the verbs' ticks
    const a0 = angles[0] - 8;
    const a1 = angles[angles.length - 1] + 8;
    layer.appendChild(svg('path', { d: arcD(pivot.x, pivot.y, ri - 8, a0, a1), class: 'orr-core orr-rest orr-arcrail__rail', 'stroke-width': 1, pathLength: 1 }));
    layer.appendChild(svg('path', { d: arcD(pivot.x, pivot.y, ri - 8, a0, a1), class: 'orr-bloom orr-rest', 'stroke-width': 4, opacity: '.12' }));
    ticks = angles.map((a) => {
      const [tx0, ty0] = polar(pivot.x, pivot.y, ri - 14, a);
      const [tx1, ty1] = polar(pivot.x, pivot.y, ri - 2, a);
      const t = svg('path', { d: `M ${tx0.toFixed(1)} ${ty0.toFixed(1)} L ${tx1.toFixed(1)} ${ty1.toFixed(1)}`, class: 'orr-core orr-hi orr-arcrail__tick', 'stroke-width': 1.4 });
      layer.appendChild(t);
      return t;
    });
    if (engraving) {
      layer.appendChild(circularText(pivot.x, pivot.y, re + 22, engraving.toUpperCase(),
        { startDeg: a1 + 34, size: 8, className: 'orr-micro', anchor: 'middle', upright: true }));
    }
    // the Hand
    armBloom = svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 6, opacity: '.3' });
    armArm = svg('path', { d: '', class: 'orr-core orr-hand', 'stroke-width': 1.6 });
    armPip = svg('circle', { r: 3, fill: 'var(--dp-hand, #f2b950)' });
    layer.append(armBloom, armArm, armPip);
    // seat each verb on its tick: the label starts just past the tick, its first line centred on it
    all.forEach((li, i) => {
      const { x, y } = geo.anchors[i];
      const button = li.querySelector('button') || li;
      const bh = button.offsetHeight || 40;
      // left/top only: a screen's own arrival (kit stamp) owns the item's transform
      li.style.left = `${Math.round(x + 6)}px`;
      li.style.top = `${Math.round(y - bh / 2)}px`;
    });
    paintHand(handSpring.value);
    lightTick(handIndex);
  }

  function lightTick(index) {
    ticks.forEach((t, i) => {
      t.setAttribute('class', `orr-core ${i === index ? 'orr-hand' : 'orr-hi'} orr-arcrail__tick`);
      t.setAttribute('opacity', i === index ? '1' : '.55');
    });
  }

  function pointAt(index, { instant = false } = {}) {
    if (!geo || index < 0 || index >= geo.angles.length) return;
    if (index === handIndex && !instant) return;
    handIndex = index;
    handSpring.set(geo.angles[index], { instant });
    lightTick(index);
  }

  const indexOf = (node) => items().findIndex((li) => li.contains(node));
  const restIndex = () => {
    const all = items();
    const current = all.findIndex((li) => li.querySelector('[aria-current="true"], .dp-lit__item--primary'));
    return current >= 0 ? current : 0;
  };
  const onOver = (e) => { const i = indexOf(e.target); if (i >= 0) pointAt(i); };
  const onFocus = (e) => { const i = indexOf(e.target); if (i >= 0) pointAt(i); };
  const onLeave = () => {
    const active = doc.activeElement;
    const i = active ? indexOf(active) : -1;
    pointAt(i >= 0 ? i : restIndex());
  };
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
  pointAt(restIndex());
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
      host.removeEventListener('pointerover', onOver);
      host.removeEventListener('focusin', onFocus);
      host.removeEventListener('pointerleave', onLeave);
      root.remove();
      host.classList.remove('orr-arcrail-host');
      if (frame && home && host.parentNode === frame) home.insertBefore(host, homeNext);
      list.classList.remove('orr-arcrail__list');
      for (const li of items()) { li.style.left = ''; li.style.top = ''; }
    },
  };
}
