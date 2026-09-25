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
.orr-crest::before { content:""; display:none; position:absolute; left:50%; top:50%; width:58px; height:58px; margin:-29px 0 0 -29px; border-radius:50%; background:radial-gradient(circle, rgb(248 244 234 / .18), rgb(248 244 234 / .06) 46%, rgb(248 244 234 / 0) 70%); pointer-events:none; }
/* the bloom marks the chosen rim crest only when the sun is not the chosen power: one lit object on the orbit */
.orr-crestorbit.is-pivoted .orr-crest.is-chosen::before { display:block; }
.orr-crestorbit:not(.is-pivoted) .orr-crest.is-chosen > img { opacity:.82; }
.orr-crest > img { position:relative; display:block; width:38px; height:38px; margin:6px; opacity:.52; transition:opacity .18s linear, transform .28s var(--dp-ease-over, ease-out); pointer-events:none;
  filter:brightness(1.18) drop-shadow(0 0 4px rgb(0 0 0 / .8)); }
.orr-crest:is(:hover, :focus-visible) > img { opacity:.82; transform:scale(1.12); }
.orr-crest:focus-visible { outline:none; }
.orr-crest.is-chosen > img { opacity:1; }
.orr-crest.is-authority::after { display:none; } / .45); pointer-events:none; }
.orr-crest__words { position:absolute; display:flex; flex-direction:column; gap:1px; pointer-events:none; white-space:nowrap; hyphens:none; word-break:keep-all; }
.orr-crest.is-south .orr-crest__words { left:50%; top:calc(100% + 14px); transform:translateX(-50%); align-items:center; }
.orr-crest.is-north .orr-crest__words { left:50%; top:auto; bottom:calc(100% + 14px); transform:translateX(-50%); align-items:center; flex-direction:column-reverse; }
.orr-crest.is-east .orr-crest__words { left:calc(100% + 12px); top:50%; transform:translateY(-50%); align-items:flex-start; }
.orr-crest.is-west .orr-crest__words { right:calc(100% + 12px); top:50%; transform:translateY(-50%); align-items:flex-end; }
.orr-crest__name { pointer-events:none;
  font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:9px; letter-spacing:.14em; text-transform:uppercase; color:rgb(${BONE} / .62);
  paint-order:stroke; text-shadow:0 0 6px rgb(4 6 9 / .9); }
.orr-crest.is-chosen .orr-crest__name, .orr-crest:is(:hover, :focus-visible) .orr-crest__name { color:rgb(248 244 234); }
.orr-crest__rep { pointer-events:none; display:block; white-space:nowrap;
  font-family:var(--dp-face-numeral, "Archivo"); font-size:10.5px; font-weight:600; letter-spacing:.02em; color:rgb(248 244 234); font-variant-numeric:tabular-nums; text-shadow:0 0 6px rgb(4 6 9 / .9); }
.orr-crest__rep.is-against { color:var(--dp-danger, #ff5038); }
.orr-crest__rep.is-zero { color:rgb(${BONE} / .5); }
.orr-crestorbit__centre { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); pointer-events:none; }
.orr-crestorbit__centre > img { display:block; width:100%; height:100%; opacity:1; filter:grayscale(1) drop-shadow(0 0 18px rgb(0 0 0 / .7)); transition:opacity .22s linear; }
.orr-crestorbit__centre.is-pivot > img { opacity:.3; }
.orr-crestorbit.is-pivoted .orr-crestorbit__sunrings { opacity:.28; }
.orr-svg .orr-crestorbit__sunring { stroke:rgb(${BONE} / .3); }
.orr-crestorbit__armlayer { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:2; }
.orr-crestorbit__centre { z-index:1; }
.orr-crestorbit.is-armunder .orr-crestorbit__armlayer { z-index:2; }
.orr-svg .orr-hand { stroke:var(--dp-hand, #f2b950); }
.orr-crest > img { filter:grayscale(1) brightness(1.25); mix-blend-mode:screen; }
.orr-crestorbit__centre > img { mix-blend-mode:screen; }
.orr-crestorbit__centre.is-swapping > img { opacity:0; }
.orr-svg .orr-crestorbit__ring { stroke:rgb(${BONE} / .26); }
.orr-svg .orr-crestorbit__standing { stroke:rgb(248 244 234); }
.orr-svg .orr-crestorbit__standing--against { stroke:var(--dp-danger, #ff5038); }
.orr-svg .orr-crestorbit__standing--none { stroke:rgb(${BONE} / .45); }
.orr-svg .orr-crestorbit__standing-bloom { opacity:.22; }
.orr-svg .orr-crestorbit__ghost { stroke:rgb(${BONE} / .18); }
.orr-svg .orr-crestorbit__zero { stroke:rgb(${BONE} / .5); }
.orr-svg .orr-crestorbit__rel { stroke:rgb(${BONE} / .4); }
.orr-crestorbit.is-small .orr-svg .orr-crestorbit__rel { stroke-width:1.5px; }
.orr-svg .orr-crestorbit__rel.is-hostile { stroke:rgb(255 80 56 / .45); }
.orr-svg .orr-crestorbit__rel-bloom { stroke:rgb(${BONE}); opacity:.13; }
.orr-svg .orr-crestorbit__rel-bloom.is-hostile { stroke:rgb(255 80 56); opacity:.14; }
.orr-svg .orr-crestorbit__rel-bead { fill:rgb(${BONE} / .85); }
.orr-svg .orr-crestorbit__rel-bead.is-hostile { fill:rgb(255 80 56 / .8); }
.orr-crestorbit.has-relations .orr-crest:not(.is-related):not(.is-chosen) > img { opacity:.34; }
.orr-crestorbit.has-relations .orr-crest.is-related > img { opacity:.92; }
.orr-crestorbit__rise { opacity:0; animation:orr-crestorbit-rise .5s var(--dp-ease-out, ease-out) forwards; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-crestorbit-rise { to { opacity:1; } }
html.sf-reduce-motion .orr-crestorbit__rise { animation:none; opacity:1; }
html.sf-reduce-motion .orr-crest, html.sf-reduce-motion .orr-crest > img { transition:none; }
.orr-crestorbit.is-small .orr-crest { width:40px; height:40px; margin:-20px 0 0 -20px; }
.orr-crestorbit.is-small .orr-crest > img { width:30px; height:30px; margin:5px; }
.orr-crestorbit.is-small .orr-crest::before { width:48px; height:48px; margin:-24px 0 0 -24px; }
.orr-crestorbit.is-small .orr-crest__name { font-size:8px; letter-spacing:.1em; }
.orr-crestorbit.is-small .orr-crest.is-authority::after { display:none; }
/* the standing scale: a ruler from Sworn Enemy to Hero, the light cursor at the rep */
.orr-standing { position:relative; width:100%; height:74px; }
.orr-standing > svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; }
.orr-svg .orr-standing__rule { stroke:rgb(${BONE} / .32); }
.orr-svg .orr-standing__hostile { stroke:var(--dp-danger, #ff5038); opacity:.32; }
.orr-svg .orr-standing__tick { stroke:rgb(${BONE} / .5); }
.orr-svg .orr-standing__tick--aggro { stroke:var(--dp-danger, #ff5038); }
.orr-svg text.orr-standing__name { font-size:10.5px; font-weight:650; letter-spacing:.12em; fill:rgb(${BONE} / .52); text-transform:uppercase; paint-order:stroke; stroke:rgb(6 8 11 / .92); stroke-width:3px; stroke-linejoin:round; }
.orr-svg .orr-standing__bracket { stroke:rgb(${BONE} / .5); }
.orr-svg text.orr-standing__bracket-n { fill:rgb(248 244 234); font-family:var(--dp-face-label, "Archivo"); font-size:9.5px; font-weight:650; letter-spacing:.14em; }
.orr-svg text.orr-standing__name.is-current { fill:rgb(248 244 234); }
.orr-svg.is-compact text.orr-standing__name { font-size:9px; letter-spacing:.1em; }
.orr-svg text.orr-standing__name.is-hostile { fill:rgb(${BONE} / .52); }
.orr-svg text.orr-standing__name.is-hostile.is-current { fill:var(--dp-danger, #ff5038); }
.orr-svg text.orr-standing__val { font-family:var(--dp-face-numeral, "Archivo"); font-size:9px; font-weight:500; letter-spacing:.02em; fill:rgb(${BONE} / .42); paint-order:stroke; stroke:rgb(6 8 11 / .9); stroke-width:3px; }
.orr-svg text.orr-standing__val.is-hostile { fill:rgb(255 80 56 / .55); }
.orr-svg .orr-standing__cursor { stroke:rgb(248 244 234); }
.orr-svg .orr-standing__cursor-bloom { stroke:rgb(248 244 234); opacity:.25; }
.orr-svg .orr-standing__rung-leader { stroke:rgb(${BONE} / .32); }
.orr-standing text.orr-standing__rung { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:9px; letter-spacing:.12em; fill:rgb(248 244 234); }
.orr-standing text.orr-standing__rung.is-locked { fill:rgb(${BONE} / .48); }
.orr-standing text.orr-standing__rung.is-sealed { fill:rgb(${BONE} / .3); }
.orr-svg .orr-standing__rung-tick { stroke:rgb(248 244 234); }
.orr-svg .orr-standing__rung-tick.is-locked { stroke:rgb(${BONE} / .45); }
.orr-svg .orr-standing__rung-tick.is-sealed { stroke:rgb(${BONE} / .28); }
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
  const armLayer = svg('svg', { class: 'orr-svg orr-crestorbit__armlayer', 'aria-hidden': 'true', focusable: 'false' });
  host.appendChild(armLayer);

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
  let armFromRim = false;
  let relG = null;
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
    // the arm rises from the sun's outer ring (never across the emblem) to the seat ring round the chosen crest
    const r0 = geo.centreNow ? geo.centreNow / 2 + 18 : 0;
    const cs0 = geo.cs || crestSize;
    const r1 = R - cs0 / 2 - 13;
    const [x0, y0] = polar(cx, cy, r0, deg);
    const [x1, y1] = polar(cx, cy, r1, deg);
    hand.bloom.setAttribute('d', `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`);
    hand.core.setAttribute('d', `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`);
    const [bx, by] = polar(cx, cy, r1, deg);
    hand.bead.setAttribute('cx', f(bx));
    hand.bead.setAttribute('cy', f(by));
    // the seat: one amber ring round the chosen crest, outside its standing arc, where the arm lands
    const [sx, sy] = polar(cx, cy, R, deg);
    hand.seat.setAttribute('cx', f(sx));
    hand.seat.setAttribute('cy', f(sy));
    hand.seat.setAttribute('r', f(cs0 / 2 + 11));
    // the arm's footing: a short bone arc on the sun's ring, centred on the arm
    hand.tip.setAttribute('d', r0 > 0 ? arcD(cx, cy, r0, deg - 12, deg + 12) : '');
    paintRelations(deg);
  }

  // the relations: from the sun's ring (the authority chosen) or the chosen crest's seat to each related crest's
  // emblem edge; a rim-to-rim beam bows toward the centre so it clears the sun; hostile ones red, all under the Hand
  function paintRelations(deg) {
    if (!relG || !geo || !data) return;
    relG.textContent = '';
    const rels = Array.isArray(data.relations) ? data.relations : [];
    const n = data.items.length;
    const chosenIdx = Math.max(0, data.items.findIndex((i) => i.id === data.selectedId));
    const fromSun = !!(data.authorityId && data.items[chosenIdx] && data.items[chosenIdx].id === data.authorityId);
    const { cx, cy, R, cs, centreNow } = geo;
    const related = new Set();
    for (const rel of rels) {
      const k = data.items.findIndex((i) => i.id === rel.id);
      if (k < 0 || k === chosenIdx) continue;
      related.add(rel.id);
      const tDeg = (360 * k) / n;
      const [tx, ty] = polar(cx, cy, R - cs / 2 - 4, tDeg);
      let d;
      if (fromSun) {
        const [sx, sy] = polar(cx, cy, centreNow / 2 + 18, tDeg);
        d = `M ${f(sx)} ${f(sy)} L ${f(tx)} ${f(ty)}`;
      } else {
        // from the chosen crest's seat, bowing through the interior with a minimum radius that clears the sun's ring
        const [ox, oy] = polar(cx, cy, R - cs / 2 - 11, deg);
        const mid = (deg + tDeg) / 2 + (Math.abs(((tDeg - deg) % 360 + 540) % 360 - 180) > 180 ? 180 : 0);
        const rc = Math.max(centreNow / 2 + 40, R * 0.45);
        const [mx, my] = polar(cx, cy, rc, mid);
        d = `M ${f(ox)} ${f(oy)} Q ${f(mx)} ${f(my)} ${f(tx)} ${f(ty)}`;
      }
      const hostile = rel.weight < 0;
      relG.appendChild(svg('path', { d, class: `orr-bloom orr-crestorbit__rel-bloom${hostile ? ' is-hostile' : ''}`, 'stroke-width': 4 }));
      relG.appendChild(svg('path', { d, class: `orr-core orr-crestorbit__rel${hostile ? ' is-hostile' : ''}`, 'stroke-width': 1 }));
      const [bx, by] = polar(cx, cy, R - cs / 2 - 6, tDeg);
      relG.appendChild(svg('circle', { cx: f(bx), cy: f(by), r: 2.5, class: `orr-crestorbit__rel-bead${hostile ? ' is-hostile' : ''}` }));
    }
    host.classList.toggle('has-relations', related.size > 0);
    for (const [id, el] of crestEls) el.classList.toggle('is-related', related.has(id));
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
    // the words sit outside the crests: at east and west they need their own room, so a wide-enough
    // host is bounded by its height and a narrow one by its width less a name's length
    const R = Math.max(90, Math.min(H / 2 - cs / 2 - 48, W / 2 - cs / 2 - (small ? 80 : 118)));
    geo = { cx, cy, R, cs, centreNow };
    host.classList.toggle('is-small', small);
    const arriveNow = !arrived && !reducedMotion();
    const rise = (node, delay) => { if (!arriveNow) return node; node.classList.add('orr-crestorbit__rise'); node.style.setProperty('--orr-delay', `${delay}ms`); return node; };

    if (rebuilt) {
      layer.textContent = '';
      armLayer.textContent = '';
      layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
      armLayer.setAttribute('viewBox', `0 0 ${W} ${H}`);
      // the ring, its drifting scale
      const rings = svg('g', {});
      // the ring breaks 5px short of every crest, so the emblem stands on the ring instead of on a disc over it
      // the ring breaks at the emblem's own edge (the art is 38/50 of the button), not at the old plate's
      const gapDeg = Math.asin(Math.min(0.9, (cs * 0.38 + 3) / R)) * 180 / Math.PI;
      const ringD = n > 0
        ? Array.from({ length: n }, (_, i) => arcD(cx, cy, R, (360 * i) / n + gapDeg, (360 * (i + 1)) / n - gapDeg)).join(' ')
        : arcD(cx, cy, R, 0, 360);
      rings.appendChild(svg('path', { d: ringD, class: 'orr-bloom orr-crestorbit__ring', 'stroke-width': 5, opacity: '.12' }));
      rings.appendChild(svg('path', { d: ringD, class: 'orr-core orr-crestorbit__ring', 'stroke-width': 1 }));
      const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${f(cx)}px ${f(cy)}px; --orr-drift-s:720s` });
      // the drift field runs inside the crests, under the arm, where it cuts no figure and no name
      drift.appendChild(svg('path', { d: ticksD(cx, cy, R - cs / 2 - 12, 56, { len: 3, major: 4, majorLen: 8, inward: true }), class: 'orr-core orr-faint', 'stroke-width': 1 }));
      rings.appendChild(drift);
      const sunRings = svg('g', { class: 'orr-crestorbit__sunrings' });
      sunRings.appendChild(svg('path', { d: arcD(cx, cy, centreNow / 2 + 4, 0, 360), class: 'orr-core orr-faint', 'stroke-width': 1 }));
      sunRings.appendChild(svg('path', { d: arcD(cx, cy, centreNow / 2 + 18, 0, 360), class: 'orr-core orr-crestorbit__sunring', 'stroke-width': 1 }));
      rings.appendChild(sunRings);
      layer.appendChild(rise(rings, 0));
      // the chosen power's relations: beams of light across the orbit's interior, drawn under the Hand
      relG = svg('g', { class: 'orr-crestorbit__relations' });
      armLayer.appendChild(relG);
      // the Hand: a bloom and a core from the centre crest to the rim, a bead where it meets the crest
      const hg = svg('g', { class: 'orr-crestorbit__hand' });
      hand = {
        bloom: svg('path', { d: '', class: 'orr-bloom orr-hand', 'stroke-width': 7, opacity: '.24' }),
        core: svg('path', { d: '', class: 'orr-core orr-hand', 'stroke-width': 2 }),
        bead: svg('circle', { r: 3, fill: 'var(--dp-hand-hot, #ffd98c)' }),
        tip: svg('path', { d: '', class: 'orr-core orr-hand', 'stroke-width': 1.6 }),
        seat: svg('circle', { r: 0, fill: 'none', class: 'orr-core orr-hand orr-crestorbit__seat', 'stroke-width': 1.2, opacity: '.85' }),
      };
      hg.append(hand.bloom, hand.core, hand.tip, hand.seat, hand.bead);
      armLayer.appendChild(rise(hg, 360));
      // the crests on the ring, each with its standing arc
      const stale = new Map(crestEls);
      crestEls = new Map();
      data.items.forEach((item, i) => {
        const deg = (360 * i) / n;
        const [x, y] = polar(cx, cy, R, deg);
        const rep = clampRep(item.rep);
        const r = cs / 2 + 6;
        // a ghost ring carries every arc; the arc grows from the crest's top, one step of 30 degrees per
        // tier from neutral: clockwise for a gain, counter-clockwise against you
        const steps = Number.isFinite(item.tierSteps) ? item.tierSteps : Math.sign(rep) * Math.min(4, Math.ceil(Math.abs(rep) / 250));
        // the arc's sweep carries magnitude: 22 degrees per tier band, the fraction inside the band included
        const pos = Number.isFinite(item.bandPos) ? item.bandPos : steps;
        const sweep = Math.max(12, Math.min(150, Math.abs(pos) * 22));
        const arcs = svg('g', {});
        arcs.appendChild(svg('path', { d: arcD(x, y, r, -50, 50), class: 'orr-core orr-crestorbit__ghost', 'stroke-width': 1 }));
        // the zero tick on every crest: the arc's direction reads against it
        const [zx0, zy0] = polar(x, y, r - 2, 0); const [zx1, zy1] = polar(x, y, r + 4, 0);
        arcs.appendChild(svg('path', { d: `M ${f(zx0)} ${f(zy0)} L ${f(zx1)} ${f(zy1)}`, class: 'orr-core orr-crestorbit__zero', 'stroke-width': 1 }));
        if (steps || Math.abs(pos) > 0.05) {
          const cls = item.hostile ? 'orr-crestorbit__standing orr-crestorbit__standing--against' : 'orr-crestorbit__standing';
          const d = rep < 0 ? arcD(x, y, r, -sweep, 0) : arcD(x, y, r, 0, sweep);
          arcs.appendChild(svg('path', { d, class: `orr-bloom ${cls} orr-crestorbit__standing-bloom`, 'stroke-width': 7, opacity: '.24' }));
          arcs.appendChild(svg('path', { d, class: `orr-core ${cls}`, 'stroke-width': 3, 'stroke-linecap': 'butt' }));
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
          const words = doc.createElement('span');
          words.className = 'orr-crest__words';
          const name = doc.createElement('span');
          name.className = 'orr-crest__name';
          const figure = doc.createElement('span');
          figure.className = 'orr-crest__rep';
          words.append(name, figure);
          btn.appendChild(words);
          host.appendChild(btn);
        } else stale.delete(item.id);
        btn.setAttribute('aria-label', `${item.name}, ${item.tierName || ''} ${rep > 0 ? '+' : ''}${rep}`.trim());
        btn.querySelector('.orr-crest__name').textContent = String(item.short || item.name || '').toUpperCase();
        const figure = btn.querySelector('.orr-crest__rep');
        // nothing to say at zero: the ring's zero tick already says it
        figure.textContent = rep === 0 ? '' : (rep > 0 ? `+${rep}` : `−${Math.abs(rep)}`);
        figure.classList.toggle('is-against', !!item.hostile);
        figure.classList.toggle('is-zero', rep === 0);
        btn.style.left = `${f(x)}px`;
        btn.style.top = `${f(y)}px`;
        // the words face outward: above at the top of the ring, below at the foot, beside on the flanks
        const side = deg < 14 || deg > 346 ? 'north' : deg > 166 && deg < 194 ? 'south' : deg <= 180 ? 'east' : 'west';
        for (const s of ['north', 'south', 'east', 'west']) btn.classList.toggle(`is-${s}`, s === side);
        // placed inline: a kit reset on a button's spans had left the words static and stacked under the emblem
        const wordsEl = btn.querySelector('.orr-crest__words');
        if (wordsEl) {
          const base = 'position:absolute; display:flex; flex-direction:column; gap:1px; white-space:nowrap; pointer-events:none; margin:0; padding:0;';
          const by = {
            north: 'left:50%; right:auto; top:auto; bottom:calc(100% + 14px); transform:translateX(-50%); align-items:center; flex-direction:column-reverse;',
            south: 'left:50%; right:auto; bottom:auto; top:calc(100% + 14px); transform:translateX(-50%); align-items:center;',
            east: 'left:calc(100% + 12px); right:auto; bottom:auto; top:50%; transform:translateY(-50%); align-items:flex-start;',
            west: 'right:calc(100% + 12px); left:auto; bottom:auto; top:50%; transform:translateY(-50%); align-items:flex-end;',
          };
          wordsEl.style.cssText = base + by[side];
        }
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
    // the centre holds the station's authority (its sun); the chosen power's crest stands in the reading
    const centreId = data.authorityId || (chosen && chosen.id);
    const pivoted = !!(data.authorityId && chosen && chosen.id !== data.authorityId);
    centre.classList.toggle('is-pivot', pivoted);
    host.classList.toggle('is-pivoted', pivoted);
    armFromRim = !!(data.authorityId && chosen && chosen.id === data.authorityId);
    host.classList.toggle('is-armunder', armFromRim);
    const url = centreId ? crestUrl(centreId) : '';
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
export function standingScaleSvg({ rep = 0, tiers = [], aggro = -150, width = 520, rungs = [], brackets = [], compact = false, rungWords = true } = {}) {
  const w = Math.max(240, width);
  // brackets (distances measured on the rule) hang above the names; the rungs hang below in rows
  const top = brackets.length ? 22 : 0;
  // a rung's word breaks at its space into two short lines, so a word's run rarely covers its neighbour
  const pitch = compact ? 26 : 30;
  const rungTop = compact ? 50 : 56;
  let h = 74 + top;
  const x0 = 0; const x1 = w - 12;
  const y = 40 + top;
  const n = Math.max(2, tiers.length);
  const cur = clampRep(rep);
  // tier-indexed: each tier is one equal step; the rep sits a fraction of the way through its tier
  const tierIndexOf = (r) => { let i = 0; tiers.forEach((t, k) => { if (r >= t.min) i = k; }); return i; };
  const posOf = (r) => {
    const i = tierIndexOf(r);
    const lo = tiers[i].min;
    const hi = i + 1 < n ? tiers[i + 1].min : REP_CAP;
    const frac = hi > lo ? Math.max(0, Math.min(1, (r - lo) / (hi - lo))) : 0;
    return Math.min(n, i + frac);
  };
  const xAt = (p) => x0 + (p / n) * (x1 - x0);
  const current = tierIndexOf(cur);
  const aggroPos = posOf(aggro);
  // the rungs' rows, assigned right to left: a rung stands one row deeper than the deepest rung that
  // stands inside its own word's run, so no leader ever drops through a neighbour's word
  const glyph = compact ? 8.2 : 8.9;
  const placed = rungs.slice().sort((a, b) => a.minRep - b.minRep).map((rung) => {
    const name = String(rung.name).toUpperCase();
    const words = name.split(' ');
    const lines = words.length > 1 ? [words[0], words.slice(1).join(' ')] : [name];
    return { rung, name, lines, x: xAt(posOf(rung.minRep)), w: Math.max(...lines.map((l) => l.length)) * glyph, row: 0 };
  });
  for (let k = placed.length - 1; k >= 0; k -= 1) {
    let row = 0;
    for (let j = k + 1; j < placed.length; j += 1) if (placed[j].x < placed[k].x + 15 + placed[k].w + 6) row = Math.max(row, placed[j].row + 1);
    placed[k].row = row;
  }
  const rowsUsed = placed.length ? Math.max(...placed.map((q) => q.row)) + 1 : 0;
  if (rungs.length && rungWords) h = 40 + top + rungTop + (rowsUsed - 1) * pitch + 11 + 10;
  else if (rungs.length) h = 74 + 10 + top;
  let out = `<svg class="orr-svg${compact ? ' is-compact' : ''}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">`;
  out += `<path class="orr-bloom orr-standing__rule" d="M ${x0} ${y} L ${x1} ${y}" stroke-width="4" opacity=".12"/>`;
  out += `<path class="orr-core orr-standing__rule" d="M ${x0} ${y} L ${x1} ${y}" stroke-width="1"/>`;
  out += `<path class="orr-core orr-standing__hostile" d="M ${x0} ${y} L ${f(xAt(aggroPos))} ${y}" stroke-width="1.5"/>`;
  // minor ticks every 25 points of standing: their density shows each tier's true width
  let fine = '';
  const repMin = tiers.length ? tiers[0].min : -REP_CAP;
  for (let v = Math.ceil(repMin / 25) * 25; v <= REP_CAP; v += 25) { if (tiers.some((t) => t.min === v)) continue; const x = xAt(posOf(v)); fine += `M ${f(x)} ${y} L ${f(x)} ${y + 3} `; }
  out += `<path class="orr-core orr-faint" d="${fine}" stroke-width="1"/>`;
  out += '<!--pin-->';
  tiers.forEach((t, i) => {
    const x = xAt(i);
    const hostile = t.min <= aggro;
    out += `<path class="orr-core orr-standing__tick${Math.abs(t.min - aggro) < 1 ? ' orr-standing__tick--aggro' : ''}" d="M ${f(x)} ${y - 7} L ${f(x)} ${y + 8}" stroke-width="1.2"/>`;
    // a tier's name sits in the middle of its band (the tick is where the band begins)
    const name = String(t.name).toUpperCase();
    const anchor = 'middle';
    const nx = xAt(i + 0.5);
    const band = (x1 - x0) / n;
    const sp = name.indexOf(' ');
    const parts = name.length * 8.4 > band - 4 && sp > 0 ? [name.slice(0, sp), name.slice(sp + 1)] : [name];
    parts.forEach((part, pi) => {
      const py = y - 13 - (parts.length - 1 - pi) * 11;
      out += `<text class="orr-standing__name${i === current ? ' is-current' : ''}${hostile ? ' is-hostile' : ''}" x="${f(nx)}" y="${py}" text-anchor="${anchor}">${part}</text>`;
    });
    // the boundary's value under its tick: a ruler is labelled like equipment
    if (i > 0) out += `<text class="orr-standing__val${hostile ? ' is-hostile' : ''}" x="${f(x)}" y="${y + 22}" text-anchor="middle">${t.min > 0 ? '+' : t.min < 0 ? '\u2212' : ''}${Math.abs(t.min)}</text>`;
  });
  out += `<path class="orr-core orr-standing__tick" d="M ${f(xAt(n))} ${y - 7} L ${f(xAt(n))} ${y + 8}" stroke-width="1.2"/>`;
  const xc = xAt(posOf(cur));
  // the pin: from the bracket line (when there is one) down through the rule; it runs behind the names
  const pinTop = brackets.length ? y - 42 : y - 8;
  let pin = `<path class="orr-bloom orr-standing__cursor-bloom" d="M ${f(xc)} ${pinTop} L ${f(xc)} ${y + 14}" stroke-width="6"/>`;
  pin += `<path class="orr-core orr-standing__cursor" d="M ${f(xc)} ${pinTop} L ${f(xc)} ${y + 14}" stroke-width="1.6"/>`;
  pin += `<path d="M ${f(xc - 4)} ${y + 18} L ${f(xc)} ${y + 14} L ${f(xc + 4)} ${y + 18}" class="orr-core orr-standing__cursor" stroke-width="1.2" fill="none"/>`;
  // dimension brackets: a line between two points of the rule with a drop at each end and the distance riding it
  brackets.forEach((b) => {
    const xa = xAt(posOf(b.from)); const xb = xAt(posOf(b.to));
    const lo = Math.min(xa, xb); const hi = Math.max(xa, xb);
    const yb = y - 42;
    if (hi - lo < 1) return;
    pin += `<path class="orr-core orr-standing__bracket" d="M ${f(lo)} ${yb} L ${f(hi)} ${yb} M ${f(lo)} ${yb} L ${f(lo)} ${yb + 5} M ${f(hi)} ${yb} L ${f(hi)} ${yb + 5}" stroke-width="1"/>`;
    // a label sits outward from the cursor when asked (two brackets meeting at the cursor never overprint)
    const ba = b.anchor === 'start' ? 'start' : b.anchor === 'end' ? 'end' : 'middle';
    const bx = ba === 'start' ? lo + 8 : ba === 'end' ? hi - 8 : (lo + hi) / 2;
    pin += `<text class="orr-standing__rep orr-standing__bracket-n" x="${f(bx)}" y="${yb - 5}" text-anchor="${ba}">${String(b.label)}</text>`;
  });
  out = out.replace('<!--pin-->', pin);
  if (rungs.length) {
    // the contract rungs are points on this same axis: a leader down from the rule to each rung's word,
    // reached ones in the light, locked ones dim, sealed ones dimmer; the cursor already says where you are
    // rows are assigned so no leader ever drops through a neighbour's word: a rung standing inside an
    // earlier word's run takes a shallower row than that word; outside every run it takes the deepest
    placed.forEach(({ rung, lines, x, row }) => {
      const state = rung.state === 'reached' ? 'is-reached' : rung.state === 'sealed' ? 'is-sealed' : 'is-locked';
      if (!rungWords) {
        // a short screen: the rungs are ticks under the rule (reached ones in the light); the reading names the next
        out += `<path class="orr-core orr-standing__rung-tick ${state}" d="M ${f(x)} ${y + 10} L ${f(x)} ${y + 18}" stroke-width="1.4"/>`;
        return;
      }
      const rowY = y + rungTop + row * pitch;
      // the leader: down from the rule, a 45-degree elbow of 12px, the word after it
      out += `<path class="orr-core orr-standing__rung-leader" d="M ${f(x)} ${y + 10} L ${f(x)} ${rowY - 15} L ${f(x + 12)} ${rowY - 3}" stroke-width="1"/>`;
      out += `<text class="orr-standing__rung ${state}" x="${f(x + 15)}" y="${rowY}" text-anchor="start">${lines.map((l, li) => `<tspan x="${f(x + 15)}" dy="${li ? 11 : 0}">${l}</tspan>`).join('')}</text>`;
    });
  } else {
    out += `<text class="orr-standing__rep" x="${f(xc)}" y="${y + 32}" text-anchor="middle">${cur > 0 ? '+' : ''}${cur}</text>`;
  }
  out += `</svg>`;
  return `<div class="orr-standing" style="height:${h}px">${out}</div>`;
}
