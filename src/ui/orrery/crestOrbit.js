// src/ui/orrery/crestOrbit.js — the Crest Orbit and the Standing Scale (design/frontend/ORRERY.md §6
// Station, Factions): the fourteen powers as their crests on an Orbit Ring, the chosen one large at
// the centre with the Hand swinging to it on the rim; round every crest a short arc of standing --
// red counter-clockwise when the power is against you, warm white clockwise when it is for you --
// so the whole belt's opinion of you reads at a glance. The Standing Scale is the ladder as a ruler:
// the nine tiers as ticks from Sworn Enemy to Hero, the aggro line in red, a light cursor at your rep.
//
// The crests are the produced art in assets/ui/generated/crests/. A screen hands in the host, calls
// `set()` with the powers and the chosen one, and keeps its own click handling: every crest is a
// button carrying `data-fac`, the same hook the screen's rail rows carry.

import { svg, polar, arcD, ticksD } from './svg.js';
import { createSpring, reducedMotion } from './motion.js';
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'orr-crest-orbit-style';
const BONE = '236 230 216';
const REP_CAP = 1000;

const CREST_ROOT = new URL('../../../assets/ui/generated/crests/', import.meta.url).href;
export function crestUrl(factionId) {
  const id = String(factionId || '').replace(/^faction[_-]/, '');
  return id ? `${CREST_ROOT}faction_${id}.webp` : '';
}

const CSS = `
.orr-crestorbit { position:relative; width:100%; height:100%; min-height:240px; isolation:isolate; }
.orr-crestorbit::before { content:""; position:absolute; z-index:-1; left:50%; top:50%; width:112%; height:112%; transform:translate(-50%, -50%); pointer-events:none;
  background:radial-gradient(closest-side, rgb(6 8 11 / .8), rgb(6 8 11 / .58) 58%, rgb(6 8 11 / 0)); }
.orr-crestorbit > svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.orr-crestorbit.is-off > svg, .orr-crestorbit.is-off > .orr-crest, .orr-crestorbit.is-off > .orr-crestorbit__centre { display:none; }
.orr-crest { position:absolute; display:block; width:50px; height:50px; margin:-25px 0 0 -25px; padding:0; border:0; background:none; cursor:pointer; border-radius:50%;
  transition:transform .28s var(--dp-ease-over, ease-out); }
.orr-crest::before { content:""; position:absolute; left:50%; top:50%; width:46px; height:46px; margin:-23px 0 0 -23px; border-radius:50%; background:radial-gradient(circle, rgb(6 8 11 / .92) 40%, rgb(6 8 11 / 0) 72%); pointer-events:none; }
.orr-crest > img { position:relative; display:block; width:38px; height:38px; margin:6px; opacity:.92; transition:opacity .18s linear, transform .28s var(--dp-ease-over, ease-out); pointer-events:none;
  filter:brightness(1.18) drop-shadow(0 0 4px rgb(0 0 0 / .8)); }
.orr-crest:is(:hover, :focus-visible) > img { opacity:1; transform:scale(1.12); }
.orr-crest:focus-visible { outline:none; }
.orr-crest.is-chosen > img { opacity:1; }
.orr-crest.is-authority::after { content:""; position:absolute; left:50%; top:50%; width:58px; height:58px; margin:-29px 0 0 -29px; border-radius:50%;
  border:1px dashed rgb(${BONE} / .45); pointer-events:none; }
.orr-crest__name { position:absolute; left:50%; top:100%; transform:translateX(-50%); white-space:nowrap; pointer-events:none;
  font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:rgb(${BONE} / .62);
  paint-order:stroke; text-shadow:0 0 6px rgb(4 6 9 / .9); }
.orr-crest.is-chosen .orr-crest__name, .orr-crest:is(:hover, :focus-visible) .orr-crest__name { color:rgb(248 244 234); }
.orr-crest.is-flipped .orr-crest__name { top:auto; bottom:100%; }
.orr-crestorbit__centre { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); pointer-events:none; }
.orr-crestorbit__centre > img { display:block; width:100%; height:100%; opacity:.96; filter:drop-shadow(0 0 18px rgb(0 0 0 / .7)); transition:opacity .22s linear; }
.orr-crestorbit__centre.is-swapping > img { opacity:0; }
.orr-svg .orr-crestorbit__ring { stroke:rgb(${BONE} / .26); }
.orr-svg .orr-crestorbit__standing { stroke:rgb(248 244 234); }
.orr-svg .orr-crestorbit__standing--against { stroke:var(--dp-danger, #ff5038); }
.orr-svg .orr-crestorbit__standing--none { stroke:rgb(${BONE} / .45); }
.orr-svg .orr-crestorbit__standing-bloom { opacity:.22; }
.orr-svg .orr-crestorbit__zero { stroke:rgb(${BONE} / .5); }
.orr-crestorbit__rise { opacity:0; animation:orr-crestorbit-rise .5s var(--dp-ease-out, ease-out) forwards; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-crestorbit-rise { to { opacity:1; } }
html.sf-reduce-motion .orr-crestorbit__rise { animation:none; opacity:1; }
html.sf-reduce-motion .orr-crest, html.sf-reduce-motion .orr-crest > img { transition:none; }
.orr-crestorbit.is-small .orr-crest { width:40px; height:40px; margin:-20px 0 0 -20px; }
.orr-crestorbit.is-small .orr-crest > img { width:30px; height:30px; margin:5px; }
.orr-crestorbit.is-small .orr-crest::before { width:36px; height:36px; margin:-18px 0 0 -18px; }
.orr-crestorbit.is-small .orr-crest__name { font-size:8px; letter-spacing:.1em; }
.orr-crestorbit.is-small .orr-crest.is-authority::after { width:42px; height:42px; margin:-21px 0 0 -21px; }
/* the standing scale: a ruler from Sworn Enemy to Hero, the light cursor at the rep */
.orr-standing { position:relative; width:100%; height:82px; }
.orr-standing > svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; }
.orr-svg .orr-standing__rule { stroke:rgb(${BONE} / .32); }
.orr-svg .orr-standing__hostile { stroke:var(--dp-danger, #ff5038); opacity:.55; }
.orr-svg .orr-standing__tick { stroke:rgb(${BONE} / .5); }
.orr-svg .orr-standing__tick--aggro { stroke:var(--dp-danger, #ff5038); }
.orr-svg text.orr-standing__name { font-size:8.5px; font-weight:650; letter-spacing:.14em; fill:rgb(${BONE} / .52); text-transform:uppercase; }
.orr-svg text.orr-standing__name.is-current { fill:rgb(248 244 234); }
.orr-svg text.orr-standing__name.is-hostile { fill:rgb(255 80 56 / .8); }
.orr-svg .orr-standing__cursor { stroke:rgb(248 244 234); }
.orr-svg .orr-standing__cursor-bloom { stroke:rgb(248 244 234); opacity:.25; }
.orr-svg text.orr-standing__rep { font-family:var(--dp-face-numeral, "Archivo"); font-size:12px; font-weight:600; letter-spacing:.02em; fill:rgb(248 244 234); }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const f = (n) => Math.round(n * 100) / 100;
const clampRep = (r) => Math.max(-REP_CAP, Math.min(REP_CAP, Number(r) || 0));

/**
 * @param {HTMLElement} host
 * @param {{ crestSize?: number, centreSize?: number }} [opts]
 */
export function createCrestOrbit(host, { crestSize = 50, centreSize = 150 } = {}) {
  const doc = host && host.ownerDocument ? host.ownerDocument : globalThis.document;
  const inert = { el: host, set() {}, relayout() {}, active: () => false, dispose() {} };
  if (!host || !doc || typeof doc.createElementNS !== 'function' || typeof host.getBoundingClientRect !== 'function') return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-crestorbit', 'is-off');
  const layer = svg('svg', { class: 'orr-svg', 'aria-hidden': 'true', focusable: 'false' });
  host.appendChild(layer);
  const centre = doc.createElement('span');
  centre.className = 'orr-crestorbit__centre';
  centre.setAttribute('aria-hidden', 'true');
  const centreImg = doc.createElement('img');
  centreImg.alt = '';
  centreImg.decoding = 'sync';
  centreImg.draggable = false;
  centre.appendChild(centreImg);
  host.appendChild(centre);

  let data = null;
  let frame = 0;
  let ro = null;
  let on = false;
  let drawnKey = '';
  let hand = null;
  let geo = null;
  let crestEls = new Map();
  let arrived = false;
  let handDeg = 0;
  const spring = createSpring({ value: 0, preset: 'swing', onUpdate: (v) => paintHand(v) });

  const schedule = () => {
    if (frame) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') frame = raf(() => { frame = 0; layout(); });
    else layout();
  };
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => schedule()); ro.observe(host); }

  function paintHand(deg) {
    handDeg = deg;
    if (!hand || !geo) return;
    const { cx, cy, R } = geo;
    const r0 = (geo.centreNow || centreSize) / 2 + 10;
    const r1 = R - (geo.cs || crestSize) / 2 - 4;
    const [x0, y0] = polar(cx, cy, r0, deg);
    const [x1, y1] = polar(cx, cy, r1, deg);
    hand.bloom.setAttribute('d', `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`);
    hand.core.setAttribute('d', `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`);
    const [bx, by] = polar(cx, cy, r1, deg);
    hand.bead.setAttribute('cx', f(bx));
    hand.bead.setAttribute('cy', f(by));
  }

  function standDown() {
    on = false;
    host.classList.add('is-off');
    layer.textContent = '';
    for (const el of crestEls.values()) if (el.parentNode) el.parentNode.removeChild(el);
    crestEls = new Map();
    hand = null;
  }

  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (!data || !Array.isArray(data.items) || !data.items.length || W < 240 || H < 220) { standDown(); return; }
    const key = `${W}x${H}|${data.items.map((i) => `${i.id}:${Math.round(i.rep)}`).join(',')}|${data.authorityId}`;
    const rebuilt = key !== drawnKey;
    drawnKey = key;
    on = true;
    host.classList.remove('is-off');
    const n = data.items.length;
    const cx = W / 2;
    const cy = H / 2;
    const small = Math.min(W, H) < 340;
    const cs = small ? Math.round(crestSize * 0.8) : crestSize;
    const centreNow = small ? Math.round(centreSize * 0.7) : centreSize;
    const R = Math.max(90, Math.min(W, H) / 2 - cs / 2 - 22);
    geo = { cx, cy, R, cs, centreNow };
    host.classList.toggle('is-small', small);
    const arriveNow = !arrived && !reducedMotion();
    const rise = (node, delay) => { if (!arriveNow) return node; node.classList.add('orr-crestorbit__rise'); node.style.setProperty('--orr-delay', `${delay}ms`); return node; };

    if (rebuilt) {
      layer.textContent = '';
      layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
      // the ring, its drifting scale
      const rings = svg('g', {});
      rings.appendChild(svg('path', { d: arcD(cx, cy, R, 0, 360), class: 'orr-core orr-crestorbit__ring', 'stroke-width': 1 }));
      const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${f(cx)}px ${f(cy)}px; --orr-drift-s:720s` });
      drift.appendChild(svg('path', { d: ticksD(cx, cy, R + cs / 2 + 10, 96, { len: 3, major: 12, majorLen: 7, inward: false }), class: 'orr-core orr-faint', 'stroke-width': 1 }));
      rings.appendChild(drift);
      rings.appendChild(svg('path', { d: arcD(cx, cy, centreNow / 2 + 6, 0, 360), class: 'orr-core orr-faint', 'stroke-width': 1 }));
      layer.appendChild(rise(rings, 0));
      // the Hand: a bloom and a core from the centre crest to the rim, a bead where it meets the crest
      const hg = svg('g', { class: 'orr-crestorbit__hand' });
      hand = {
        bloom: svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 7, opacity: '.24' }),
        core: svg('path', { d: '', class: 'orr-core orr-hand', 'stroke-width': 1.6 }),
        bead: svg('circle', { r: 3, fill: 'var(--dp-hand-hot, #ffd98c)' }),
      };
      hg.append(hand.bloom, hand.core, hand.bead);
      layer.appendChild(rise(hg, 360));
      // the crests on the ring, each with its standing arc
      const stale = new Map(crestEls);
      crestEls = new Map();
      data.items.forEach((item, i) => {
        const deg = (360 * i) / n;
        const [x, y] = polar(cx, cy, R, deg);
        const rep = clampRep(item.rep);
        const frac = Math.min(1, Math.abs(rep) / REP_CAP);
        const r = cs / 2 + 4;
        // the arc grows from the crest's top: clockwise for a gain, counter-clockwise against you
        const sweep = 300 * frac;
        const arcs = svg('g', {});
        if (Math.abs(rep) < 30) {
          const [zx0, zy0] = polar(x, y, r - 2, 0); const [zx1, zy1] = polar(x, y, r + 3, 0);
          arcs.appendChild(svg('path', { d: `M ${f(zx0)} ${f(zy0)} L ${f(zx1)} ${f(zy1)}`, class: 'orr-core orr-crestorbit__zero', 'stroke-width': 1 }));
        } else {
          const cls = rep < 0 ? 'orr-crestorbit__standing orr-crestorbit__standing--against' : 'orr-crestorbit__standing';
          const d = rep < 0 ? arcD(x, y, r, -sweep, 0) : arcD(x, y, r, 0, sweep);
          arcs.appendChild(svg('path', { d, class: `orr-bloom ${cls} orr-crestorbit__standing-bloom`, 'stroke-width': 6, opacity: '.22' }));
          arcs.appendChild(svg('path', { d, class: `orr-core ${cls}`, 'stroke-width': 2, 'stroke-linecap': 'butt' }));
        }
        layer.appendChild(rise(arcs, 120 + i * 30));
        let btn = stale.get(item.id);
        if (!btn) {
          btn = doc.createElement('button');
          btn.type = 'button';
          btn.className = 'orr-crest';
          btn.setAttribute('data-fac', item.id);
          const img = doc.createElement('img');
          img.alt = '';
          img.decoding = 'sync';
          img.draggable = false;
          img.src = crestUrl(item.id);
          btn.appendChild(img);
          const name = doc.createElement('span');
          name.className = 'orr-crest__name';
          btn.appendChild(name);
          host.appendChild(btn);
        } else stale.delete(item.id);
        btn.setAttribute('aria-label', `${item.name}, ${item.tierName || ''} ${rep > 0 ? '+' : ''}${rep}`.trim());
        btn.querySelector('.orr-crest__name').textContent = String(item.short || item.name || '').toUpperCase();
        btn.style.left = `${f(x)}px`;
        btn.style.top = `${f(y)}px`;
        btn.classList.toggle('is-flipped', deg > 250 || deg < 110 ? false : false);
        btn.classList.toggle('is-authority', item.id === data.authorityId);
        if (arriveNow) { btn.classList.add('orr-crestorbit__rise'); btn.style.setProperty('--orr-delay', `${160 + i * 30}ms`); }
        crestEls.set(item.id, btn);
      });
      for (const el of stale.values()) if (el.parentNode) el.parentNode.removeChild(el);
      centre.style.width = `${centreNow}px`;
      centre.style.height = `${centreNow}px`;
      arrived = true;
    }
    // the chosen one: its crest large at the centre, the Hand on its rim seat
    const idx = Math.max(0, data.items.findIndex((i) => i.id === data.selectedId));
    const chosen = data.items[idx];
    for (const [id, el] of crestEls) el.classList.toggle('is-chosen', id === (chosen && chosen.id));
    const url = chosen ? crestUrl(chosen.id) : '';
    if (centreImg.getAttribute('src') !== url) {
      centre.classList.add('is-swapping');
      const swap = () => { centreImg.src = url; centre.classList.remove('is-swapping'); };
      if (reducedMotion() || typeof setTimeout !== 'function') swap(); else setTimeout(swap, 120);
    }
    const target = (360 * idx) / n;
    let t = target;
    while (t - handDeg > 180) t -= 360;
    while (t - handDeg < -180) t += 360;
    spring.set(t, { instant: rebuilt && !data.swing });
    paintHand(spring.value);
  }

  return {
    el: host,
    /** @param {{ items: {id:string,name:string,short?:string,rep:number,tierName?:string}[], selectedId: string, authorityId?: string, swing?: boolean }} next */
    set(next) { data = next ? { ...next } : null; schedule(); },
    relayout: schedule,
    active: () => on,
    dispose() {
      if (ro) ro.disconnect();
      spring.stop();
      if (frame && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frame);
      frame = 0;
      standDown();
      for (const n of [layer, centre]) if (n.parentNode) n.parentNode.removeChild(n);
      host.classList.remove('orr-crestorbit', 'is-off');
    },
  };
}

/**
 * The Standing Scale as markup: a ruler from -1000 to +1000 with a tick and a name per tier, the
 * hostile span red, the aggro line marked, and a light cursor with the rep at your standing.
 * @param {{ rep:number, tiers:{min:number,name:string}[], aggro?:number, width?:number }} o
 */
export function standingScaleSvg({ rep = 0, tiers = [], aggro = -150, width = 520 } = {}) {
  const w = Math.max(240, width);
  const h = 82;
  const x0 = 12; const x1 = w - 12;
  const y = 30;
  const xAt = (r) => x0 + ((clampRep(r) + REP_CAP) / (2 * REP_CAP)) * (x1 - x0);
  const cur = clampRep(rep);
  let current = -1;
  tiers.forEach((t, i) => { if (cur >= t.min) current = i; });
  let out = `<svg class="orr-svg" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">`;
  out += `<path class="orr-core orr-standing__rule" d="M ${x0} ${y} L ${x1} ${y}" stroke-width="1"/>`;
  out += `<path class="orr-core orr-standing__hostile" d="M ${x0} ${y} L ${f(xAt(aggro))} ${y}" stroke-width="1.5"/>`;
  // fine graduations every 50
  let fine = '';
  for (let r = -REP_CAP; r <= REP_CAP; r += 50) { const x = xAt(r); fine += `M ${f(x)} ${y} L ${f(x)} ${y + (r % 250 === 0 ? 6 : 3)} `; }
  out += `<path class="orr-core orr-faint" d="${fine}" stroke-width="1"/>`;
  // names take the first of three rows (above, below, further below) where they touch no neighbour
  const rowsRight = [-Infinity, -Infinity, -Infinity];
  const rowY = [y - 12, y + 20, y + 31];
  tiers.forEach((t, i) => {
    const x = xAt(t.min);
    const hostile = t.min < aggro || (t.min <= aggro && t.min < -100);
    out += `<path class="orr-core orr-standing__tick${t.min === aggro || (t.min > aggro - 1 && t.min < aggro + 1) ? ' orr-standing__tick--aggro' : ''}" d="M ${f(x)} ${y - 7} L ${f(x)} ${y + 8}" stroke-width="1.2"/>`;
    const name = String(t.name).toUpperCase();
    const wText = name.length * 6.3;
    const anchor = i === 0 ? 'start' : i === tiers.length - 1 ? 'end' : 'middle';
    const left = anchor === 'start' ? x : anchor === 'end' ? x - wText : x - wText / 2;
    let row = rowsRight.findIndex((r) => left > r + 8);
    if (row < 0) row = 0;
    rowsRight[row] = left + wText;
    out += `<text class="orr-standing__name${i === current ? ' is-current' : ''}${hostile ? ' is-hostile' : ''}" x="${f(x)}" y="${rowY[row]}" text-anchor="${anchor}">${name}</text>`;
  });
  const xc = xAt(cur);
  out += `<path class="orr-bloom orr-standing__cursor-bloom" d="M ${f(xc)} ${y - 14} L ${f(xc)} ${y + 14}" stroke-width="6"/>`;
  out += `<path class="orr-core orr-standing__cursor" d="M ${f(xc)} ${y - 14} L ${f(xc)} ${y + 14}" stroke-width="1.6"/>`;
  out += `<path d="M ${f(xc - 4)} ${y - 18} L ${f(xc)} ${y - 14} L ${f(xc + 4)} ${y - 18}" class="orr-core orr-standing__cursor" stroke-width="1.2" fill="none"/>`;
  out += `<text class="orr-standing__rep" x="${f(xc)}" y="${y + 48}" text-anchor="middle">${cur > 0 ? '+' : ''}${cur}</text>`;
  out += `</svg>`;
  return `<div class="orr-standing" style="height:${h}px">${out}</div>`;
}
