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
  font-size:clamp(20px, 2.7vh, 31px) !important; font-variation-settings:"wght" 600, "wdth" 94 !important;
  letter-spacing:.075em !important; color:rgb(232 226 212 / .7) !important; padding:4px 0 !important;
  text-shadow:0 1px 0 rgb(0 0 0 / .55), 0 0 16px rgb(0 0 0 / .45) !important;
  transform-origin:0 50%; transition:color .16s linear, transform .24s var(--dp-ease-out, ease-out), text-shadow .16s linear; }
.orr-arcrail-host .dp-lit__item[data-awake] {
  color:var(--dp-ink, #e8e2d4) !important; transform:scale(1.06);
  text-shadow:0 0 24px rgb(255 217 140 / .4), 0 0 7px rgb(255 217 140 / .26), 0 1px 0 rgb(0 0 0 / .6) !important; }
.orr-arcrail-host .dp-lit__item[aria-disabled="true"], .orr-arcrail-host .dp-lit__item:disabled {
  color:rgb(232 226 212 / .34) !important; text-shadow:0 1px 0 rgb(0 0 0 / .5) !important; }
.orr-arcrail-host .dp-lit__item--danger[data-awake] { color:var(--dp-danger-hot, #ff7a5c) !important;
  text-shadow:0 0 22px rgb(255 80 56 / .36), 0 1px 0 rgb(0 0 0 / .6) !important; }
/* a dense dial (pause): smaller words, the primary a size up as the one lamp key */
.orr-arcrail-host--dense .dp-lit__item { font-size:clamp(15px, 1.95vh, 22px) !important; letter-spacing:.09em !important; }
.orr-arcrail-host--dense .dp-lit__item--primary { font-size:clamp(24px, 3.1vh, 36px) !important; letter-spacing:.06em !important; }
/* notes stay for the accessibility tree; the dial shows the fact elsewhere (the eyebrow) */
.orr-arcrail-host .dp-lit__note { position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important;
  clip-path:inset(50%) !important; white-space:nowrap !important; margin:0 !important; }
/* minor stations: fine words lettered like the rim engraving */
.orr-arcrail-host .dp-lit--fine .dp-lit__item { font-size:10px !important; letter-spacing:.32em !important; font-variation-settings:"wght" 600, "wdth" 100 !important;
  color:rgb(232 226 212 / .46) !important; }
.orr-arcrail-host .dp-lit--fine .dp-lit__item[data-awake] { color:var(--dp-ink, #e8e2d4) !important; transform:none; }
.orr-arcrail-host .dp-kbd { background:none !important; border:0 !important; box-shadow:none !important; color:rgb(232 226 212 / .5) !important;
  font-size:.62em !important; letter-spacing:.2em !important; padding:0 0 0 .4em !important; }
.orr-arcrail__trail { fill:none; stroke:var(--dp-hand, #f2b950); stroke-linecap:round; animation:orr-trail-fade 700ms linear forwards; }
@keyframes orr-trail-fade { from { opacity:.55; } to { opacity:0; } }
@media (forced-colors: active) {
  .orr-arcrail-host [data-dp-focus]::before, .orr-arcrail-host .dp-lit__item:focus-visible::before {
    display:block !important; content:""; position:absolute; left:-10px; top:14%; bottom:14%; width:2px; background:CanvasText; }
}
html.sf-reduce-motion .orr-arcrail__trail { display:none; }
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
.orr-svg text.orr-arcrail__group { letter-spacing:.3em; fill:rgb(232 226 212 / .5); }
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
const ROW_GAP = 26;

/**
 * The dial's geometry for a host of W x H holding `count` verbs. Pure, so it is testable: the pivot
 * sits off the leading edge, the emblem fills most of the height, and the verbs spread
 * symmetrically about "east" (90 deg, 0 = up, clockwise) on a ring just outside the emblem.
 */
export function arcRailGeometry(W, H, count, { span = null } = {}) {
  const re = clamp(H * 0.36, 230, 440);
  // the hub sits just inside the leading edge: a needle needs a visible pivot to read as one
  const pivot = { x: re * 0.05, y: clamp(H * 0.585, re * 0.7, H - re * 0.35) };
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
 * @param {boolean} [o.grouped]     verbs sharing a data-group ride ONE tick as a row, the group's
 *                                  name engraved over it (a long menu stays a readable dial)
 */
export function createArcRail({ host, list, frame = null, extra = [], emblemUrl = null, engraving = '', grouped = false, dense = false } = {}) {
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
  let blade = null; let bladeBloom = null; let tail = null; let bead = null; let beadBloom = null; let trailHost = null; let ticks = [];
  // a needle's spring: one slight overshoot, settled in about a quarter second
  const handSpring = createSpring({ value: 20, preset: { k: 300, c: 25 }, onUpdate: (deg) => paintHand(deg) });
  let handIndex = -1;

  function paintHand(deg) {
    if (!geo || !blade) return;
    const { pivot, ri } = geo;
    const rt = ri - 8;                       // the rim: the blade ends ON the lit tick
    const [tx, ty] = polar(pivot.x, pivot.y, rt, deg);
    const [lx, ly] = polar(pivot.x, pivot.y, 2.2, deg - 90);
    const [rx, ry] = polar(pivot.x, pivot.y, 2.2, deg + 90);
    // tapered: about 4 px at the hub to a point at the rim
    const d = `M ${lx.toFixed(1)} ${ly.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} L ${rx.toFixed(1)} ${ry.toFixed(1)} Z`;
    blade.setAttribute('d', d);
    bladeBloom.setAttribute('d', `M ${pivot.x.toFixed(1)} ${pivot.y.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`);
    const [cx, cy] = polar(pivot.x, pivot.y, geo.re * 0.2, deg + 180);
    tail.setAttribute('d', `M ${pivot.x.toFixed(1)} ${pivot.y.toFixed(1)} L ${cx.toFixed(1)} ${cy.toFixed(1)}`);
    for (const b of [bead, beadBloom]) { b.setAttribute('cx', tx.toFixed(1)); b.setAttribute('cy', ty.toFixed(1)); }
  }

  // the swing leaves a fading arc of light on the rim between where it was and where it went
  function trail(fromDeg, toDeg) {
    if (!geo || !trailHost || Math.abs(toDeg - fromDeg) < 1) return;
    const a0 = Math.min(fromDeg, toDeg);
    const a1 = Math.max(fromDeg, toDeg);
    trailHost.textContent = '';
    trailHost.appendChild(svg('path', { d: arcD(geo.pivot.x, geo.pivot.y, geo.ri - 8, a0, a1), class: 'orr-arcrail__trail', 'stroke-width': 2.2 }));
  }

  function build() {
    const W = host.clientWidth || doc.documentElement.clientWidth;
    const H = host.clientHeight || doc.documentElement.clientHeight;
    const all = rows();
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
    // the Hand: trail, counterweight, bloom, the tapered blade, the hub cap, one bead on the rim
    trailHost = svg('g');
    tail = svg('path', { d: '', class: 'orr-core orr-hand', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: '.55' });
    bladeBloom = svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 7, opacity: '.22' });
    blade = svg('path', { d: '', fill: 'var(--dp-hand, #f2b950)' });
    const hub = svg('g');
    hub.append(
      svg('circle', { cx: pivot.x, cy: pivot.y, r: 9, fill: 'rgb(5 7 10 / .8)', class: 'orr-core orr-hand', 'stroke-width': 1.4 }),
      svg('circle', { cx: pivot.x, cy: pivot.y, r: 14, class: 'orr-core orr-faint', 'stroke-width': 1, fill: 'none' }),
      svg('circle', { cx: pivot.x, cy: pivot.y, r: 3, fill: 'var(--dp-hand, #f2b950)' }),
    );
    beadBloom = svg('circle', { r: 8, fill: 'var(--dp-hand, #f2b950)', opacity: '.22' });
    bead = svg('circle', { r: 3.4, fill: 'var(--dp-hand-hot, #ffd98c)' });
    layer.append(trailHost, tail, bladeBloom, blade, hub, beadBloom, bead);
    // seat each row on its tick: the first verb starts just past the tick, its first line centred on
    // it, and a row's further verbs follow along the line; a group's name is engraved over the row
    all.forEach((row, i) => {
      const { x, y } = geo.anchors[i];
      let cursor = x + 6;
      let rowTop = y;
      row.items.forEach((li) => {
        const button = li.querySelector('button') || li;
        const bh = button.offsetHeight || 40;
        // left/top only: a screen's own arrival (kit stamp) owns the item's transform
        li.style.left = `${Math.round(cursor)}px`;
        li.style.top = `${Math.round(y - bh / 2)}px`;
        rowTop = Math.min(rowTop, y - bh / 2);
        cursor += (li.offsetWidth || 120) + ROW_GAP;
      });
      if (row.group) {
        const t = svg('text', { x: (x + 8).toFixed(1), y: (rowTop - 2).toFixed(1), 'font-size': 9, class: 'orr-arcrail__group' });
        t.textContent = String(row.group).toUpperCase();
        layer.appendChild(t);
      }
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
    if (handIndex >= 0 && !instant) trail(handSpring.value, geo.angles[index]);
    handIndex = index;
    handSpring.set(geo.angles[index], { instant });
    lightTick(index);
  }

  // exactly one word is awake: the hovered/focused one, else the screen's current one
  let awakeButton = null;
  function wake(button) {
    if (button === awakeButton) return;
    if (awakeButton) awakeButton.removeAttribute('data-awake');
    awakeButton = button || null;
    if (awakeButton) awakeButton.setAttribute('data-awake', '');
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
    wake(b);
    pointAt(i);
  };
  const onFocus = (e) => { const i = indexOf(e.target); if (i >= 0) { wake(buttonOf(e.target)); pointAt(i); } };
  const onLeave = () => {
    const active = doc.activeElement;
    const i = active ? indexOf(active) : -1;
    if (i >= 0) { wake(buttonOf(active)); pointAt(i); return; }
    wake(restButton());
    pointAt(restIndex());
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
      host.removeEventListener('pointerover', onOver);
      host.removeEventListener('focusin', onFocus);
      host.removeEventListener('pointerleave', onLeave);
      root.remove();
      wake(null);
      host.classList.remove('orr-arcrail-host', 'orr-arcrail-host--dense');
      if (frame && home && host.parentNode === frame) home.insertBefore(host, homeNext);
      list.classList.remove('orr-arcrail__list');
      for (const li of items()) { li.style.left = ''; li.style.top = ''; }
    },
  };
}
