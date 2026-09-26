// ORRERY Yard Carousel — "Spin the yard" (design/frontend/OVERHAUL_PLAN_2026-09-25.md §4, New Game).
//
// The hull choice as a turntable you can grab. The ring lies on a lit floor under the hero render; the hulls
// ride it at even spacing, the chosen one front-centre under the amber index. Drag anywhere over the yard and
// the ring turns under your hand; each hull's MASS sets how the ring answers — a heavy hull at the front
// resists and glides short, a light one flicks and runs on — and on release it springs onto the nearest hull
// with a small overshoot and picks it (the screen's own button is clicked, so every contract downstream is the
// same as a click). While it turns, `onTurn(i0, i1, f)` reports the two hulls it is between, so the screen can
// sweep its readings between them.
//
// It seats the screen's own buttons (roving focus, data-action, aria-pressed) and follows aria-pressed; a
// click on a word turns the ring to it. Reduced motion: no glide, the ring snaps. Nothing runs at rest.
import { svg } from './svg.js';
import { createSpring, reducedMotion } from './motion.js';
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-yard-style';
const CSS = `
.orr-yard__grab { position:absolute; pointer-events:auto; cursor:grab; touch-action:none; z-index:0; }
.orr-yard.is-dragging .orr-yard__grab { cursor:grabbing; }
.orr-yard.is-dragging > .orr-turntable__row > li, .orr-yard.is-dragging > .orr-turntable__art { transition:none !important; }
.orr-yard > .orr-turntable__row { z-index:1; }
.orr-svg .orr-yard__floor { pointer-events:none; }
.orr-yard__back { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:-1; }
/* the detent: the index bead flashes as each hull passes the front */
.orr-yard .orr-yard__bead { transform-box:fill-box; transform-origin:center; transition:transform 220ms cubic-bezier(.2,1.6,.4,1); }
.orr-yard .orr-yard__bead.is-detent { transform:scale(1.9); transition:none; }
html.sf-reduce-motion .orr-yard .orr-yard__bead { transition:none; }
`;
let seq = 0;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const wrapDeg = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} o
 * @param {HTMLElement} o.row       the screen's row of hull buttons (aria-pressed marks the chosen)
 * @param {HTMLElement} o.host      the element the yard is laid over (the screen root)
 * @param {HTMLElement} o.anchor    the stage; `hero` is a selector inside it for the hero's box
 * @param {string} o.hero
 * @param {Object<string,string>} [o.art]   data-action -> produced hull art
 * @param {number} [o.artWidth]
 * @param {Object<string,number>} [o.mass]  data-action -> tonnes (how the ring answers with that hull in front)
 * @param {(i0:number, i1:number, f:number) => void} [o.onTurn]
 */
export function createYardCarousel({ row, host, anchor, hero, art = null, artWidth = 132, mass = null, onTurn = null } = {}) {
  const doc = (row && row.ownerDocument) || globalThis.document;
  if (!row || !host || !anchor || !doc || typeof doc.createElementNS !== 'function' || typeof anchor.getBoundingClientRect !== 'function') {
    return { el: null, update() {}, layout() {}, dispose() {} };
  }
  injectOrrery();
  injectStyle(doc);
  const wrap = doc.createElement('div');
  wrap.className = 'orr-turntable orr-turntable--carousel orr-yard';
  const face = svg('svg', { class: 'orr-svg', 'aria-hidden': 'true' });
  const grab = doc.createElement('div');
  grab.className = 'orr-yard__grab';
  grab.setAttribute('aria-hidden', 'true');
  wrap.append(face, grab, row);
  row.classList.add('orr-turntable__row');
  host.appendChild(wrap);

  const items = () => [...row.children].filter((li) => li.querySelector && li.querySelector('button'));
  const actionOf = (li) => li.querySelector('button').dataset.action;
  const massOf = (i) => { const li = items()[i]; const m = li && mass ? Number(mass[actionOf(li)]) : NaN; return Number.isFinite(m) && m > 0 ? m : 32; };
  const lightest = () => Math.min(...items().map((_, i) => massOf(i)), 32);
  const pressedIndex = () => { const i = items().findIndex((li) => li.querySelector('button[aria-pressed="true"]')); return i < 0 ? 0 : i; };
  const n = () => Math.max(1, items().length);
  const sp = () => 360 / n();

  let g = null;
  let rot = 0;
  const pt = (t) => [g.cx + g.rx * Math.sin(t * Math.PI / 180), g.cy + g.ry * Math.cos(t * Math.PI / 180)];
  const ring = (t0, t1, steps = 64) => {
    const pts = [];
    for (let i = 0; i <= steps; i += 1) { const [x, y] = pt(t0 + ((t1 - t0) * i) / steps); pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`); }
    return `M ${pts.join(' L ')}`;
  };

  // the face: a lit floor, a faint back rim, a solid front rim with its scale, the amber index at the front
  const gid = `orr-yard-floor-${++seq}`;
  const defs = svg('defs');
  const grad = svg('radialGradient', { id: gid, cx: '50%', cy: '50%', r: '50%' });
  grad.append(svg('stop', { offset: '0', 'stop-color': 'rgb(236 230 216)', 'stop-opacity': '.085' }),
    svg('stop', { offset: '.62', 'stop-color': 'rgb(236 230 216)', 'stop-opacity': '.035' }),
    svg('stop', { offset: '1', 'stop-color': 'rgb(236 230 216)', 'stop-opacity': '0' }));
  defs.appendChild(grad);
  const floor = svg('ellipse', { class: 'orr-yard__floor', fill: `url(#${gid})` });
  const backBand = svg('path', { d: '', class: 'orr-band', style: '--orr-band-a:.035; --orr-w-band:6px' });
  const backEdge = svg('path', { d: '', class: 'orr-edge', style: '--orr-edge-a:.22' });
  const frontBand = svg('path', { d: '', class: 'orr-band', style: '--orr-band-a:.1; --orr-w-band:9px' });
  const frontEdge = svg('path', { d: '', class: 'orr-edge', style: '--orr-edge-a:.6; --orr-w-edge:1.75px' });
  const fine = svg('path', { d: '', class: 'orr-tick', style: 'stroke:rgb(236 230 216 / .34)' });
  const litBloom = svg('path', { d: '', class: 'orr-lit-bloom is-hand' });
  const lit = svg('path', { d: '', class: 'orr-lit is-hand' });
  const slot = svg('path', { d: '', class: 'orr-lit is-hand', style: '--orr-w-lit:2px' });
  const beadBloom = svg('circle', { r: 10, fill: 'var(--dp-hand, #f2b950)', opacity: '.24', class: 'orr-yard__bead' });
  const bead = svg('circle', { r: 4.5, fill: 'var(--dp-hand-hot, #ffd98c)', class: 'orr-yard__bead' });
  // the back half of the yard lies BEHIND the hero: its floor and rim go in a layer under the stage's picture
  const back = svg('svg', { class: 'orr-svg orr-yard__back', 'aria-hidden': 'true' });
  back.append(defs, floor, backBand, backEdge);
  face.append(frontBand, frontEdge, fine, litBloom, lit, slot, beadBloom, bead);
  const arts = [];
  let lastFront = -1;

  function place(r) {
    if (!g) return;
    const lis = items();
    const step = sp();
    lis.forEach((li, i) => {
      const t = wrapDeg(i * step - r);
      const at = Math.abs(t);
      const [x, y] = pt(t);
      if (at < 30) { li.style.left = `${x.toFixed(1)}px`; li.style.top = `${(y + 20).toFixed(1)}px`; li.style.transform = ''; li.style.textAlign = ''; }
      else {
        // a hull off the front names itself beside the ring's widest point, outside the rim and clear of the hero
        const side = t < 0 ? -1 : 1;
        const edgeX = g.cx + side * (g.rx + 26);
        const lx = at < 60 ? x + side * 16 : edgeX;
        const ly = at < 60 ? y - 14 : g.cy - 42;
        li.style.left = `${lx.toFixed(1)}px`; li.style.top = `${ly.toFixed(1)}px`;
        li.style.transform = side < 0 ? 'translateX(-100%)' : 'none'; li.style.textAlign = side < 0 ? 'right' : 'left';
      }
      const fade = at > 128 ? clamp(1 - (at - 128) / 36, 0, 1) : 1;
      li.style.opacity = fade.toFixed(2);
      li.style.pointerEvents = fade < 0.35 ? 'none' : '';
      li.classList.toggle('is-front', at < 12);
      const img = arts[i];
      if (img) {
        const h = artWidth * 0.56;
        Object.assign(img.style, { left: `${x.toFixed(1)}px`, top: `${(y - 8 - h).toFixed(1)}px`, width: `${artWidth}px`, height: `${h.toFixed(0)}px`,
          // the far side of the ring is far away: a hull behind the hero reads dim, so the hero stands in front of it
          opacity: (at < 24 ? 0 : (at > 90 ? 0.3 : 0.58) * fade).toFixed(2) });
        img.classList.toggle('is-on', at < 12);
      }
    });
    const nearest = lis.reduce((best, _, i) => (Math.abs(wrapDeg(i * step - r)) < Math.abs(wrapDeg(best * step - r)) ? i : best), 0);
    if (lastFront !== -1 && nearest !== lastFront && !reducedMotion()) {
      for (const b of [bead, beadBloom]) b.classList.add('is-detent');
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(() => { for (const b of [bead, beadBloom]) b.classList.remove('is-detent'); }));
    }
    lastFront = nearest;
    if (typeof onTurn === 'function') {
      const count = lis.length;
      const p = (((r / step) % count) + count) % count;
      const i0 = Math.floor(p) % count;
      onTurn(i0, (i0 + 1) % count, p - Math.floor(p));
    }
  }

  function build() {
    const hb = host.getBoundingClientRect();
    const heroEl = hero && typeof anchor.querySelector === 'function' ? anchor.querySelector(hero) : null;
    const hr = heroEl ? heroEl.getBoundingClientRect() : null;
    const ab = hr && hr.width ? hr : anchor.getBoundingClientRect();
    if (!hb.width || !ab.width) return;
    const W = hb.width; const H = hb.height;
    const rx = Math.min(ab.width * 0.42, 420);
    const ry = rx * 0.2;
    g = { cx: ab.left - hb.left + ab.width / 2, cy: Math.min(ab.top - hb.top + ab.height + 4, H - ry - 96), rx, ry };
    face.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // the back layer lives in the anchor (the stage), under its picture, measured in the host's box
    if (!back.isConnected && anchor.firstChild) anchor.insertBefore(back, anchor.firstChild);
    const sb = anchor.getBoundingClientRect();
    back.setAttribute('viewBox', `${(sb.left - hb.left).toFixed(1)} ${(sb.top - hb.top).toFixed(1)} ${sb.width.toFixed(1)} ${sb.height.toFixed(1)}`);
    Object.entries({ cx: g.cx, cy: g.cy, rx: rx * 1.02, ry: ry * 1.1 }).forEach(([k, v]) => floor.setAttribute(k, v.toFixed(1)));
    backBand.setAttribute('d', ring(104, 256));
    backEdge.setAttribute('d', ring(104, 256));
    frontBand.setAttribute('d', ring(-104, 104));
    frontEdge.setAttribute('d', ring(-104, 104));
    const f = [];
    for (let t = -100; t <= 100; t += 5) { const [x0, y0] = pt(t); f.push(`M ${x0.toFixed(1)} ${(y0 + 5).toFixed(1)} L ${x0.toFixed(1)} ${(y0 + (t % 25 === 0 ? 12 : 9)).toFixed(1)}`); }
    fine.setAttribute('d', f.join(' '));
    const lp = ring(-10, 10, 12);
    lit.setAttribute('d', lp); litBloom.setAttribute('d', lp);
    const [fx, fy] = pt(0);
    slot.setAttribute('d', `M ${fx.toFixed(1)} ${(fy - 12).toFixed(1)} L ${fx.toFixed(1)} ${(fy + 14).toFixed(1)}`);
    for (const b of [bead, beadBloom]) { b.setAttribute('cx', fx.toFixed(1)); b.setAttribute('cy', fy.toFixed(1)); }
    // the grab surface: the yard itself, from the hero's top to just under the ring
    const top = ab.top - hb.top;
    Object.assign(grab.style, { left: `${(g.cx - rx - 30).toFixed(0)}px`, top: `${top.toFixed(0)}px`, width: `${(2 * rx + 60).toFixed(0)}px`, height: `${(g.cy + ry + 26 - top).toFixed(0)}px` });
    items().forEach((li, i) => {
      const a = art && art[actionOf(li)];
      if (a && !arts[i]) { const img = doc.createElement('div'); img.className = 'orr-turntable__art'; img.style.backgroundImage = `url("${a}")`; wrap.insertBefore(img, row); arts[i] = img; }
    });
    if (!drag && !settling) rot = pressedIndex() * sp();
    place(rot);
  }

  // ---- the settle: a spring whose stiffness follows the arriving hull's mass (heavy settles slow and deep)
  let settle = null;
  let settling = false;
  let settleTarget = 0;
  function settleTo(target, v, m, instant = false) {
    if (settle) settle.stop();
    settleTarget = target;
    if (instant || reducedMotion() || typeof requestAnimationFrame !== 'function') { settle = null; settling = false; rot = target; place(rot); return; }
    const light = lightest();
    const k = 170 * clamp(light / m, 0.55, 1.3);
    const c = 2 * Math.sqrt(k) * 0.74;
    settling = true;
    settle = createSpring({ value: rot, preset: { k, c }, onUpdate: (x) => { rot = x; place(rot); if (x === settleTarget) settling = false; } });
    settle.set(target);
    if (v) settle.kick(v * 0.35);
  }
  const frontIndex = () => { const c = n(); return ((Math.round(rot / sp()) % c) + c) % c; };
  function pick(i) {
    const li = items()[i];
    const b = li && li.querySelector('button');
    if (b && b.getAttribute('aria-pressed') !== 'true' && b.getAttribute('aria-disabled') !== 'true') b.click();
  }

  // ---- the drag
  let drag = null;
  grab.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !g) return;
    if (settle) settle.stop();
    settling = false;
    drag = { x: e.clientX, t: performance.now(), v: 0, moved: 0 };
    try { grab.setPointerCapture(e.pointerId); } catch (_) {}
    wrap.classList.add('is-dragging');
  });
  grab.addEventListener('pointermove', (e) => {
    if (!drag || !g) return;
    const now = performance.now();
    const dx = e.clientX - drag.x;
    // the hull at the front sets how the ring answers the hand: heavy resists, light runs
    const resist = clamp(lightest() / massOf(frontIndex()), 0.55, 1.2);
    const d = -(dx / g.rx) * (180 / Math.PI) * resist;
    rot += d;
    const dt = Math.max(0.001, (now - drag.t) / 1000);
    drag.v = 0.7 * drag.v + 0.3 * (d / dt);
    drag.moved += Math.abs(dx);
    drag.x = e.clientX; drag.t = now;
    place(rot);
  });
  const end = () => {
    if (!drag) return;
    const v = performance.now() - drag.t > 140 ? 0 : drag.v;
    drag = null;
    wrap.classList.remove('is-dragging');
    const step = sp();
    // a light hull glides on; a heavy one stops short
    const glide = reducedMotion() ? 0 : 0.2 * clamp(lightest() / massOf(frontIndex()), 0.5, 1.4);
    const projected = rot + v * glide;
    const k = Math.round(projected / step);
    const c = n();
    const idx = ((k % c) + c) % c;
    settleTo(k * step, v, massOf(idx));
    pick(idx);
  };
  grab.addEventListener('pointerup', end);
  grab.addEventListener('pointercancel', end);

  // a click on a word (or any aria-pressed change) turns the ring to it, the short way round
  function update({ instant = false } = {}) {
    if (!g || drag) return;
    const idx = pressedIndex();
    const target = rot + wrapDeg(idx * sp() - rot);
    if (settling && Math.abs(target - settleTarget) < 0.01) return;
    if (!settling && Math.abs(target - rot) < 0.01) { place(rot); return; }
    settleTo(target, 0, massOf(idx), instant);
  }
  let mo = null;
  if (typeof MutationObserver === 'function') {
    mo = new MutationObserver(() => update());
    mo.observe(row, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  }
  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => build());
    ro.observe(host);
    for (const li of items()) ro.observe(li);
  }
  if (doc.fonts && doc.fonts.ready && typeof doc.fonts.ready.then === 'function') doc.fonts.ready.then(() => build());
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => build());
  build();
  return {
    el: wrap,
    update,
    layout: build,
    get geometry() { return g; },
    dispose() { if (settle) settle.stop(); if (mo) mo.disconnect(); if (ro) ro.disconnect(); wrap.remove(); back.remove(); },
  };
}
