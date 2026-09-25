// src/ui/orrery/ledgerTape.js — the Ship's Ledger as a tape on a cycle scale (design/frontend/ORRERY.md
// §6 Ledger: "a Ticker Tape of transactions and Arc-gauge summaries"). One ruled scale runs the
// reading's width; every filed entry stands on it as a tick at its moment — up for credits in, down
// for credits out, a short bone tick for a fact with no figure, red at the tip for a loss or a scar
// (the threat channel). The Hand rides the tape at the entry being read: its tick turns amber and
// a leader drops from it to the reading beneath. Right of the tape, the purse's story as an arc:
// the net of every filed credit, signed, with what was bought and sold under it.
//
// Pure over what it is given: `set({ entries, selectedId })` where an entry is
// `{ id, type, at, cycleLabel, amount, label }` (amount signed in credits or null). Clicking a tick
// calls `onPick(id)`. Under `html.sf-reduce-motion` nothing moves; otherwise the scale draws in,
// the ticks stagger in and the Hand's ring settles on a spring.

import { svg, arcD, polar } from './svg.js';
import { injectOrrery } from './tokens.js';
import { reducedMotion } from './motion.js';

const STYLE_ID = 'orr-ledger-tape-style';
const BONE = '236 230 216';
const THREAT_TYPES = new Set(['loss', 'scar', 'patch']);

const CSS = `
.orr-ltape { position:relative; display:block; width:100%; min-height:120px; isolation:isolate; }
/* a dissolved pool under the whole tape: the lit set never runs through its figures */
.orr-ltape::before { content:""; position:absolute; z-index:-1; inset:-26px -34px -8px -34px; pointer-events:none;
  background:radial-gradient(ellipse 60% 62% at 45% 52%, rgb(6 8 11 / .74), rgb(6 8 11 / .58) 52%, rgb(6 8 11 / 0) 86%); }
.orr-ltape.is-off > * { display:none; }
.orr-ltape > svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; }
.orr-ltape__tick { cursor:pointer; }
.orr-svg .orr-ltape__rule { stroke:rgb(${BONE} / .34); }
.orr-svg .orr-ltape__rule-bloom { stroke:rgb(${BONE} / .9); opacity:.1; }
.orr-svg .orr-ltape__minor { stroke:rgb(${BONE} / .26); }
.orr-svg .orr-ltape__major { stroke:rgb(${BONE} / .6); }
.orr-svg .orr-ltape__stem { stroke:rgb(${BONE} / .62); }
.orr-svg .orr-ltape__settle { transform-box:fill-box; transform-origin:center; animation:orr-ltape-settle 520ms cubic-bezier(.3,1.7,.5,1) both; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-ltape-settle { from { transform:scale(0); opacity:0; } to { transform:none; opacity:1; } }
html.sf-reduce-motion .orr-svg .orr-ltape__settle { animation:none; }
.orr-svg .orr-ltape__stem--fact { stroke:rgb(${BONE} / .42); }
.orr-svg .orr-ltape__stem-bloom { stroke:rgb(${BONE} / .9); opacity:.16; }
.orr-svg .orr-ltape__tip { fill:rgb(246 241 230); }
.orr-svg .orr-ltape__tip--threat { fill:var(--dp-danger, #ff5038); }
.orr-svg .orr-ltape__tip-bloom { fill:rgb(${BONE}); opacity:.16; }
.orr-svg .orr-ltape__tip-bloom--threat { fill:var(--dp-danger, #ff5038); opacity:.3; }
.orr-svg .orr-ltape__tick.is-chosen .orr-ltape__stem { stroke:var(--dp-hand-hot, #ffd98c); stroke-width:1.8; }
.orr-svg .orr-ltape__tick.is-chosen .orr-ltape__stem-bloom { stroke:var(--dp-hand, #f2b950); opacity:.55; }
.orr-svg .orr-ltape__tick.is-chosen .orr-ltape__tip { fill:var(--dp-hand-hot, #ffd98c); }
.orr-svg .orr-ltape__tick.is-chosen .orr-ltape__figure { fill:var(--dp-hand-hot, #ffd98c); }
.orr-svg .orr-ltape__tick:is(:hover, :focus-visible) .orr-ltape__stem { stroke:rgb(255 250 240); stroke-width:2; }
.orr-svg .orr-ltape__tick:is(:hover, :focus-visible) .orr-ltape__stem-bloom { opacity:.34; }
.orr-svg .orr-ltape__hand-ring { stroke:var(--dp-hand-hot, #ffd98c); fill:none; }
.orr-svg .orr-ltape__hand-glow { fill:var(--dp-hand, #f2b950); opacity:.18; }
.orr-svg .orr-ltape__hand-bead { fill:var(--dp-hand-hot, #ffd98c); }
.orr-svg .orr-ltape__leader { stroke:rgb(${BONE} / .6); stroke-linecap:butt; }
.orr-svg .orr-ltape__axis-line { stroke:rgb(${BONE} / .5); }
.orr-svg .orr-ltape__axis-minor { stroke:rgb(${BONE} / .28); }
.orr-ltape text.orr-ltape__key.orr-ltape__axis-n { fill:rgb(${BONE} / .72); font-size:11px; }
.orr-svg .orr-ltape__ghost-stem { stroke:rgb(${BONE} / .4); }
.orr-svg .orr-ltape__ghost-bead { fill:none; stroke:rgb(${BONE} / .5); stroke-width:1; }
.orr-svg .orr-ltape__arc-headbloom { fill:rgb(248 244 234); opacity:.22; }
.orr-svg .orr-ltape__arc-headbloom--out { fill:rgb(${BONE}); opacity:.14; }
.orr-svg .orr-ltape__arc-bloom--out { opacity:.1; }
.orr-ltape text.orr-ltape__figure.orr-ltape__foot-n, .orr-ltape__purse text.orr-ltape__figure.orr-ltape__foot-n { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-size:22px !important; font-weight:250; letter-spacing:-.01em; fill:rgb(248 244 234); }
.orr-ltape text.orr-ltape__key.orr-ltape__foot-k, .orr-ltape__purse text.orr-ltape__key.orr-ltape__foot-k { font-size:11px; fill:rgb(${BONE} / .6); }
.orr-ltape__purse text.orr-ltape__key { fill:rgb(${BONE} / .55); font-size:9px; }
.orr-svg .orr-ltape__hand-drop { stroke:var(--dp-hand, #f2b950); }
.orr-ltape text.orr-ltape__net-key, .orr-ltape__purse text.orr-ltape__net-key { font-size:9.5px; fill:rgb(${BONE} / .6); }
.orr-ltape__purse text.orr-ltape__figure.orr-ltape__foot-n { fill:rgb(${BONE} / .76); }
.orr-svg .orr-ltape__break { stroke:rgb(6 8 11); }
.orr-ltape__pursehost { position:relative; display:block; }
.orr-ltape__pursehost > svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; }
.orr-svg .orr-ltape__leader-bloom { stroke:rgb(${BONE}); opacity:.2; }
.orr-svg .orr-ltape__ref-line { stroke:rgb(${BONE} / .3); }
.orr-ltape text.orr-ltape__ref-n { fill:rgb(${BONE} / .5); }
.orr-svg .orr-ltape__cursor { stroke:rgb(248 244 234); }
.orr-svg .orr-ltape__cursor-bloom { stroke:rgb(248 244 234); opacity:.22; }
.orr-ltape text { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:9.5px; letter-spacing:.14em; text-transform:uppercase; fill:rgb(${BONE} / .6); paint-order:stroke; stroke:rgb(6 8 11 / .92); stroke-width:3px; stroke-linejoin:round; }
.orr-ltape text.orr-ltape__figure { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-weight:500; font-size:12px; letter-spacing:.02em; text-transform:none; fill:rgb(248 244 234); font-variant-numeric:tabular-nums; }
.orr-ltape text.orr-ltape__figure--out { fill:rgb(${BONE}); }
.orr-ltape text.orr-ltape__cycle--now { fill:rgb(248 244 234 / .8); }
.orr-ltape text.orr-ltape__net, .orr-ltape__purse text.orr-ltape__net { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-weight:250; font-size:22px; letter-spacing:-.01em; text-transform:none; fill:rgb(248 244 234); font-variant-numeric:tabular-nums; }
.orr-ltape text.orr-ltape__key { fill:rgb(${BONE} / .55); font-size:8.5px; }
.orr-ltape text.orr-ltape__cycle { fill:rgb(${BONE} / .66); font-size:10.5px; }
.orr-svg .orr-ltape__arc-track { stroke:rgb(${BONE} / .22); fill:none; }
.orr-svg .orr-ltape__arc-zero { stroke:rgb(${BONE} / .6); }
.orr-svg .orr-ltape__arc { stroke:rgb(248 244 234); fill:none; }
.orr-svg .orr-ltape__arc--out { stroke:rgb(${BONE} / .5); }
.orr-svg .orr-ltape__arc-bloom { stroke:rgb(${BONE}); opacity:.18; fill:none; }
.orr-svg .orr-ltape__arc-head { fill:rgb(248 244 234); }
.orr-svg .orr-ltape__arc-head--out { fill:rgb(${BONE} / .6); }
.orr-ltape__rise { opacity:0; animation:orr-ltape-rise .4s var(--dp-ease-out, ease-out) forwards; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-ltape-rise { to { opacity:1; } }
html.sf-reduce-motion .orr-ltape__rise { animation:none; opacity:1; }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const f = (n) => Math.round(n * 100) / 100;
const fmt = (n) => Math.round(Math.abs(n)).toLocaleString('en-US');
const signed = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(n)}` : '0');

/**
 * @param {HTMLElement} host
 * @param {{ onPick?: (id: string) => void }} [opts]
 */
export function createLedgerTape(host, { onPick = null, purseHost = null } = {}) {
  const doc = host && host.ownerDocument ? host.ownerDocument : globalThis.document;
  const inert = { el: host, set() {}, relayout() {}, dispose() {} };
  if (!host || !doc || typeof doc.createElementNS !== 'function' || typeof host.getBoundingClientRect !== 'function') return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-ltape', 'is-off');
  const layer = svg('svg', { class: 'orr-svg orr-ltape__svg', 'aria-hidden': 'true', focusable: 'false' });
  host.appendChild(layer);
  // the purse gauge stands in its own zone when a host is given: two instruments, two places
  let purseLayer = null;
  if (purseHost && typeof purseHost.appendChild === 'function') {
    purseHost.classList.add('orr-ltape__pursehost');
    purseLayer = svg('svg', { class: 'orr-svg orr-ltape__svg orr-ltape__purse', 'aria-hidden': 'true', focusable: 'false' });
    purseHost.appendChild(purseLayer);
  }

  let data = null;
  let frame = 0;
  let ro = null;
  let drawnKey = '';

  const schedule = () => {
    if (frame) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') frame = raf(() => { frame = 0; layout(); });
    else layout();
  };
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => schedule()); ro.observe(host); }

  const onClick = (ev) => {
    const t = ev.target && ev.target.closest ? ev.target.closest('.orr-ltape__tick') : null;
    if (!t || !onPick) return;
    onPick(t.getAttribute('data-id'));
  };
  layer.addEventListener('click', onClick);

  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (!data || W < 240 || H < 80) { host.classList.add('is-off'); layer.textContent = ''; return; }
    const entries = Array.isArray(data.entries) ? data.entries.filter(Boolean) : [];
    const key = `${W}x${H}|${entries.map((e) => `${e.id}:${e.amount}:${e.at}`).join(',')}|${data.selectedId}`;
    if (key === drawnKey) return;
    drawnKey = key;
    host.classList.remove('is-off');
    const arriveNow = !reducedMotion();
    const rise = (node, delay) => { if (!arriveNow) return node; node.classList.add('orr-ltape__rise'); node.style.setProperty('--orr-delay', `${delay}ms`); return node; };
    layer.textContent = '';
    layer.setAttribute('viewBox', `0 0 ${W} ${H}`);

    // the purse gauge always holds the right end, so the tape's extent never changes between states
    const withArc = !purseLayer && W >= 520;
    const R_ARC = H >= 190 ? 52 : 44;
    const arcW = withArc ? R_ARC * 2 + 140 : 0;
    const padL = 0;
    const padR = 12;
    const x0 = padL;
    const x1 = W - padR - arcW;
    const LEADER_STRIP = 22;
    // one linear scale both ways: the origin sits at 46% so the debit half keeps room for the leader strip
    const y = Math.round(H * 0.46);
    const maxUp = Math.max(18, Math.min(y - 30, H - y - 30 - LEADER_STRIP));
    const maxDown = maxUp;
    // the now cursor keeps the right end: the tape ends there, it draws no future
    const nowX = x1 - 44;

    // the rule and its fine scale
    const rule = svg('g', {});
    rule.append(
      svg('path', { d: `M ${x0} ${y} L ${f(nowX)} ${y}`, class: 'orr-bloom orr-ltape__rule-bloom', 'stroke-width': 5 }),
      svg('path', { d: `M ${x0} ${y} L ${f(nowX)} ${y}`, class: 'orr-core orr-ltape__rule', 'stroke-width': 1 }),
    );
    let minor = '';
    const step = 8;
    for (let x = x0; x <= nowX; x += step) minor += `M ${f(x)} ${y + 2} L ${f(x)} ${y + (Math.round((x - x0) / step) % 5 === 0 ? 7 : 4)} `;
    rule.appendChild(svg('path', { d: minor, class: 'orr-core orr-ltape__minor', 'stroke-width': 1 }));
    // the origin cap: the tape begins here in both states
    rule.appendChild(svg('path', { d: `M ${f(x0)} ${y - 6} L ${f(x0)} ${y + 12}`, class: 'orr-core orr-ltape__major', 'stroke-width': 1.2 }));
    layer.appendChild(rise(rule, 0));

    // the entries by their moment, pushed apart where they would touch; the now cursor keeps the right end
    const sorted = entries.map((e, i) => ({ ...e, i, at: Number.isFinite(e.at) ? e.at : i })).sort((a, b) => a.at - b.at);
    const tMin = sorted.length ? sorted[0].at : 0;
    const tMax = sorted.length ? sorted[sorted.length - 1].at : 1;
    const span = Math.max(1e-6, tMax - tMin);
    const inner0 = x0 + 44;
    const inner1 = nowX - 76;
    const spread = sorted.length === 1 || span < 1e-3;
    // moments that coincide keep the list's newest-first order; the tape runs oldest to now, so reverse them
    if (spread && sorted.length > 1) sorted.reverse();
    const xs = sorted.map((e, k) => (spread ? inner0 + ((k + 0.5) / sorted.length) * (inner1 - inner0) : inner0 + ((e.at - tMin) / span) * (inner1 - inner0)));
    const minGap = 26;
    for (let k = 1; k < xs.length; k += 1) if (xs[k] - xs[k - 1] < minGap) xs[k] = xs[k - 1] + minGap;
    const over = xs.length ? xs[xs.length - 1] - inner1 : 0;
    if (over > 0) for (let k = 0; k < xs.length; k += 1) xs[k] = Math.max(inner0, xs[k] - over);
    for (let k = xs.length - 2; k >= 0; k -= 1) if (xs[k + 1] - xs[k] < minGap) xs[k] = xs[k + 1] - minGap;

    // cycle boundaries as major ticks, the first cycle named at the origin
    let lastCycle = null;
    sorted.forEach((e, k) => {
      const c = e.cycleLabel || '';
      if (c && c !== lastCycle) {
        const mx = k === 0 ? x0 : xs[k] - 13;
        if (k > 0) layer.appendChild(rise(svg('path', { d: `M ${f(mx)} ${y - 6} L ${f(mx)} ${y + 12}`, class: 'orr-core orr-ltape__major', 'stroke-width': 1.2 }), 60));
        // the origin's name yields a line when the first tick stands within its run
        const crowded = k === 0 && xs.length && xs[0] - x0 < 64;
        // the origin's name hangs off the origin, past the axis figures' column
        const labelY = k === 0 ? Math.min(y + (crowded ? 38 : 24), y + maxUp / 2 - 10) : y + 24;
        const t = svg('text', { x: f(mx + (k === 0 ? 62 : 4)), y: f(labelY), 'text-anchor': 'start', class: 'orr-ltape__cycle' });
        t.textContent = c;
        layer.appendChild(rise(t, 80));
        lastCycle = c;
      }
    });
    // the now cursor: the same bright mark at the tape's right end in both states, named with the current cycle
    {
      const ng = svg('g', { class: 'orr-ltape__now' });
      ng.append(
        svg('path', { d: `M ${f(nowX)} ${y - 12} L ${f(nowX)} ${y + 12}`, class: 'orr-bloom orr-ltape__cursor-bloom', 'stroke-width': 6 }),
        svg('path', { d: `M ${f(nowX)} ${y - 12} L ${f(nowX)} ${y + 12}`, class: 'orr-core orr-ltape__cursor', 'stroke-width': 1.6 }),
      );
      const t = svg('text', { x: f(nowX), y: f(y + 24), 'text-anchor': 'middle', class: 'orr-ltape__cycle orr-ltape__cycle--now' });
      t.textContent = data.nowCycle || data.emptyCycle || 'CYCLE 0001';
      ng.appendChild(t);
      layer.appendChild(rise(ng, 90));
    }

    // heights on a linear scale to a round ceiling, declared by an axis at the origin: majors above and
    // below the tape with their figures, minors between, so every stem lands where the ticks say
    const maxAbs = Math.max(1, ...sorted.map((e) => Math.abs(Number(e.amount) || 0)));
    const niceCeil = (v) => { const p10 = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p10 >= v) return m * p10; return 10 * p10; };
    const ceilCr = niceCeil(maxAbs);
    const stemLen = (amt) => (Math.abs(amt) / ceilCr) * maxUp;
    if (sorted.some((e) => Number.isFinite(e.amount) && e.amount !== 0)) {
      const rg = svg('g', { class: 'orr-ltape__axis' });
      let majors = ''; let minors = '';
      for (const sign of [1, -1]) {
        for (let k = 1; k <= 4; k += 1) {
          const v = (ceilCr * k) / 4;
          const len = stemLen(v);
          const yy = sign > 0 ? y - len : y + len;
          if (k % 2 === 0) majors += `M ${f(x0)} ${f(yy)} L ${f(x0 + 6)} ${f(yy)} `;
          else minors += `M ${f(x0)} ${f(yy)} L ${f(x0 + 3)} ${f(yy)} `;
          if (k % 2 === 0) {
            const t = svg('text', { x: f(x0 + 9), y: f(yy + 3.5), 'text-anchor': 'start', class: 'orr-ltape__key orr-ltape__axis-n' });
            t.textContent = `${sign < 0 ? '\u2212' : ''}${fmt(v)}${k === 4 && sign > 0 ? ' cr' : ''}`;
            rg.appendChild(t);
          }
        }
      }
      // the axis runs from the ceiling down and out of the tape: the reading beneath hangs from it
      rg.appendChild(svg('path', { d: `M ${f(x0 + 0.5)} ${f(y - stemLen(ceilCr))} L ${f(x0 + 0.5)} ${H}`, class: 'orr-core orr-ltape__axis-line', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }));
      rg.appendChild(svg('path', { d: majors, class: 'orr-core orr-ltape__axis-line', 'stroke-width': 1.2 }));
      rg.appendChild(svg('path', { d: minors, class: 'orr-core orr-ltape__axis-minor', 'stroke-width': 1 }));
      layer.appendChild(rise(rg, 70));
    } else if (!sorted.length) {
      // the empty tape keeps its axis (a 2,500 cr ceiling by default) and shows a ghost stem on the origin rising to the half major
      const rg = svg('g', { class: 'orr-ltape__axis' });
      const ghostCeil = 2500;
      const gLen = (v) => (v / ghostCeil) * maxUp;
      let majors = '';
      for (const sign of [1, -1]) for (let k = 2; k <= 4; k += 2) { const yy = sign > 0 ? y - gLen((ghostCeil * k) / 4) : y + gLen((ghostCeil * k) / 4); majors += `M ${f(x0)} ${f(yy)} L ${f(x0 + 6)} ${f(yy)} `; { const t = svg('text', { x: f(x0 + 9), y: f(yy + 3.5), 'text-anchor': 'start', class: 'orr-ltape__key orr-ltape__axis-n' }); t.textContent = `${sign < 0 ? '\u2212' : ''}${fmt((ghostCeil * k) / 4)}${k === 4 && sign > 0 ? ' cr' : ''}`; rg.appendChild(t); } }
      rg.appendChild(svg('path', { d: `M ${f(x0 + 0.5)} ${f(y - gLen(ghostCeil))} L ${f(x0 + 0.5)} ${f(y + gLen(ghostCeil))}`, class: 'orr-core orr-ltape__axis-line', 'stroke-width': 1, 'shape-rendering': 'crispEdges' }));
      rg.appendChild(svg('path', { d: majors, class: 'orr-core orr-ltape__axis-line', 'stroke-width': 1.2 }));
      const gx = x0 + 64; // clear of the axis figures (x0 + 9 .. x0 + 48)
      rg.appendChild(svg('path', { d: `M ${f(gx)} ${y} L ${f(gx)} ${f(y - gLen(ghostCeil / 2))}`, class: 'orr-core orr-ltape__ghost-stem', 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }));
      rg.appendChild(svg('circle', { cx: f(gx), cy: f(y - gLen(ghostCeil / 2) - 4), r: 4, class: 'orr-ltape__ghost-bead' }));
      layer.appendChild(rise(rg, 70));
    }
    let chosen = null;
    sorted.forEach((e, k) => {
      const x = xs[k];
      const amt = Number.isFinite(e.amount) ? e.amount : null;
      const threat = THREAT_TYPES.has(String(e.type));
      const up = amt == null ? true : amt > 0;
      const len = amt == null ? 10 : Math.max(10, stemLen(amt));
      const tipY = up ? y - len : y + len;
      const isChosen = e.id === data.selectedId;
      const g = svg('g', { class: `orr-ltape__tick${isChosen ? ' is-chosen' : ''}`, 'data-id': e.id, tabindex: '-1' });
      // a wide invisible hit zone so a tick is not a two-pixel target
      g.appendChild(svg('rect', { x: f(x - 11), y: f(Math.min(y, tipY) - 8), width: 22, height: f(Math.abs(tipY - y) + 16), fill: 'transparent', stroke: 'none' }));
      // on arrival each stem draws out of the tape to its tip, and the tip lands with a small settle
      const drawIn = arriveNow ? { pathLength: 1, style: `--orr-delay:${140 + k * 50}ms` } : {};
      const draw = arriveNow ? ' orr-draw' : '';
      const settle = arriveNow ? { style: `--orr-delay:${140 + k * 50 + 380}ms` } : {};
      g.appendChild(svg('path', { d: `M ${f(x)} ${y} L ${f(x)} ${f(tipY)}`, class: `orr-bloom orr-ltape__stem-bloom${draw}`, 'stroke-width': 5, ...drawIn }));
      g.appendChild(svg('path', { d: `M ${f(x)} ${y} L ${f(x)} ${f(tipY)}`, class: `orr-core orr-ltape__stem${amt == null ? ' orr-ltape__stem--fact' : ''}${draw}`, 'stroke-width': 1.4, ...drawIn }));
      g.appendChild(svg('circle', { cx: f(x), cy: f(tipY), r: 6, class: `orr-ltape__tip-bloom${threat ? ' orr-ltape__tip-bloom--threat' : ''}${arriveNow ? ' orr-ltape__settle' : ''}`, ...settle }));
      g.appendChild(svg('circle', { cx: f(x), cy: f(tipY), r: amt == null ? 2 : 2.6, class: `orr-ltape__tip${threat ? ' orr-ltape__tip--threat' : ''}${arriveNow ? ' orr-ltape__settle' : ''}`, ...settle }));
      if (amt != null && !isChosen) {
        // neighbours closer than a figure's width take alternate heights
        const crowd = (k > 0 && xs[k] - xs[k - 1] < 58) || (k + 1 < xs.length && xs[k + 1] - xs[k] < 58);
        const lift = crowd && k % 2 === 1 ? 12 : 0;
        const t = svg('text', { x: f(x), y: f(up ? tipY - 10 - lift : tipY + 17 + lift), 'text-anchor': 'middle', class: `orr-ltape__figure${amt < 0 ? ' orr-ltape__figure--out' : ''}` });
        t.textContent = signed(amt);
        g.appendChild(t);
      }
      layer.appendChild(rise(g, 120 + k * 50));
      if (isChosen) chosen = { x, tipY, up };
    });

    // the Hand: the chosen tick in hot amber with a bead and a ring at its tip, and a leader from the
    // ring's foot down, an elbow to the tape's origin edge, and out of the tape into the reading beneath
    if (chosen) {
      const hg = svg('g', { class: 'orr-ltape__hand' });
      const foot = chosen.tipY + 8;
      // a leader callout: down from the bead (its first inch in the Hand's own amber), a true 45-degree elbow
      // of 24px toward the origin, along to the axis
      // the leader ends where the reading's first words begin, never on a rule: down past the tape's foot, a 24px
      // 45-degree elbow, then along the reading's kicker line to twelve px past its last glyph, with an end tick
      const yRun = H + 34.5;
      const xEnd = x0 + (Number.isFinite(data.leaderEndX) ? data.leaderEndX : 148) + 0.5;
      const xl = Math.round(chosen.x) + 0.5;
      const ex = xl - 24;
      const withRun = ex > xEnd + 8;
      // the orthogonal runs on the pixel grid (crisp), the 45-degree elbow anti-aliased: one leader, two paths
      const leaderD = withRun
        ? `M ${f(xl)} ${f(foot + 12)} L ${f(xl)} ${f(yRun - 24)} M ${f(ex)} ${f(yRun)} L ${f(xEnd)} ${f(yRun)} M ${f(xEnd)} ${f(yRun - 3)} L ${f(xEnd)} ${f(yRun + 3)}`
        : `M ${f(xl)} ${f(foot + 12)} L ${f(xl)} ${f(yRun)}`;
      const elbowD = withRun ? `M ${f(xl)} ${f(yRun - 24)} L ${f(ex)} ${f(yRun)}` : '';
      hg.appendChild(svg('path', { d: `M ${f(chosen.x)} ${f(foot)} L ${f(chosen.x)} ${f(foot + 12)}`, class: 'orr-core orr-ltape__hand-drop', 'stroke-width': 1.4 }));
      // a sold entry's stem crosses the tape through a break in its core
      if (chosen.up) hg.appendChild(svg('path', { d: `M ${f(chosen.x)} ${y - 3} L ${f(chosen.x)} ${y + 4}`, class: 'orr-ltape__break', 'stroke-width': 5 }));
      hg.append(
        svg('circle', { cx: f(chosen.x), cy: f(chosen.tipY), r: 12, class: 'orr-ltape__hand-glow' }),
        svg('circle', { cx: f(chosen.x), cy: f(chosen.tipY), r: 7, class: 'orr-core orr-ltape__hand-ring', 'stroke-width': 1.6 }),
        svg('circle', { cx: f(chosen.x), cy: f(chosen.tipY), r: 2.6, class: 'orr-ltape__hand-bead' }),
        svg('path', { d: leaderD, class: 'orr-core orr-ltape__leader', 'stroke-width': 1, fill: 'none', 'shape-rendering': 'crispEdges' }),
        svg('path', { d: elbowD, class: 'orr-core orr-ltape__leader', 'stroke-width': 1, fill: 'none' }),
      );
      layer.appendChild(rise(hg, 120 + sorted.length * 50));
    }

    // the purse's story as an arc gauge: a 270-degree track open at the foot, a zero tick at the top,
    // SOLD sweeping clockwise from zero and BOUGHT counter-clockwise, both to the larger of the two,
    // so the net is the visible difference; the signed net inside; a glass pool under it all
    // the purse's story as an arc gauge, drawn into any target: a 270-degree track open at the foot, a
    // zero tick at the top, SOLD clockwise in bone and BOUGHT counter-clockwise dimmer, both to the
    // larger of the two, so the net is the visible difference; the signed net inside; a glass pool under
    const drawPurse = (target, acx, acy, r) => {
      const bought = sorted.reduce((s2, e) => s2 + (Number.isFinite(e.amount) && e.amount < 0 ? -e.amount : 0), 0);
      const sold = sorted.reduce((s2, e) => s2 + (Number.isFinite(e.amount) && e.amount > 0 ? e.amount : 0), 0);
      const net = sold - bought;
      const ag = svg('g', { class: 'orr-ltape__summary' });
      const gid = `orr-ltape-pool-${Math.round(acx)}-${Math.round(acy)}`;
      const defs = svg('defs', {});
      const grad = svg('radialGradient', { id: gid, cx: '50%', cy: '50%', r: '50%' });
      grad.append(
        svg('stop', { offset: '0%', 'stop-color': 'rgb(6 8 11)', 'stop-opacity': '.84' }),
        svg('stop', { offset: '58%', 'stop-color': 'rgb(6 8 11)', 'stop-opacity': '.62' }),
        svg('stop', { offset: '100%', 'stop-color': 'rgb(6 8 11)', 'stop-opacity': '0' }),
      );
      defs.appendChild(grad);
      ag.appendChild(defs);
      ag.appendChild(svg('circle', { cx: f(acx), cy: f(acy), r: r + 44, fill: `url(#${gid})`, stroke: 'none' }));
      ag.appendChild(svg('path', { d: arcD(acx, acy, r, -150, 150), class: 'orr-core orr-ltape__arc-track', 'stroke-width': 1 }));
      const [zx0, zy0] = polar(acx, acy, r - 5, 0); const [zx1, zy1] = polar(acx, acy, r + 5, 0);
      ag.appendChild(svg('path', { d: `M ${f(zx0)} ${f(zy0)} L ${f(zx1)} ${f(zy1)}`, class: 'orr-core orr-ltape__arc-zero', 'stroke-width': 1.2 }));
      const mx = Math.max(1, sold, bought);
      const soldDeg = (sold / mx) * 135;
      const boughtDeg = (bought / mx) * 135;
      if (soldDeg > 0.5) {
        const d = arcD(acx, acy, r, 0, soldDeg);
        ag.appendChild(svg('path', { d, class: 'orr-bloom orr-ltape__arc-bloom', 'stroke-width': 8 }));
        ag.appendChild(svg('path', { d, class: 'orr-core orr-ltape__arc', 'stroke-width': 3 }));
        const [bx, by] = polar(acx, acy, r, soldDeg);
        ag.appendChild(svg('circle', { cx: f(bx), cy: f(by), r: 7, class: 'orr-ltape__arc-headbloom' }));
        ag.appendChild(svg('circle', { cx: f(bx), cy: f(by), r: 3, class: 'orr-ltape__arc-head' }));
        const n = svg('text', { x: f(acx + 14), y: f(acy + r + 16), 'text-anchor': 'start', class: 'orr-ltape__figure orr-ltape__foot-n' });
        n.textContent = fmt(sold);
        const t = svg('text', { x: f(acx + 14), y: f(acy + r + 32), 'text-anchor': 'start', class: 'orr-ltape__key orr-ltape__foot-k' });
        t.textContent = 'SOLD';
        ag.append(n, t);
      }
      if (boughtDeg > 0.5) {
        const d = arcD(acx, acy, r, -boughtDeg, 0);
        ag.appendChild(svg('path', { d, class: 'orr-bloom orr-ltape__arc-bloom orr-ltape__arc-bloom--out', 'stroke-width': 8 }));
        ag.appendChild(svg('path', { d, class: 'orr-core orr-ltape__arc orr-ltape__arc--out', 'stroke-width': 3 }));
        const [bx, by] = polar(acx, acy, r, -boughtDeg);
        ag.appendChild(svg('circle', { cx: f(bx), cy: f(by), r: 7, class: 'orr-ltape__arc-headbloom orr-ltape__arc-headbloom--out' }));
        ag.appendChild(svg('circle', { cx: f(bx), cy: f(by), r: 3, class: 'orr-ltape__arc-head orr-ltape__arc-head--out' }));
        const n = svg('text', { x: f(acx - 14), y: f(acy + r + 16), 'text-anchor': 'end', class: 'orr-ltape__figure orr-ltape__foot-n' });
        n.textContent = fmt(bought);
        const t = svg('text', { x: f(acx - 14), y: f(acy + r + 32), 'text-anchor': 'end', class: 'orr-ltape__key orr-ltape__foot-k' });
        t.textContent = 'BOUGHT';
        ag.append(n, t);
      }
      if (!sorted.length) {
        for (const [x, anchor] of [[acx - 14, 'end'], [acx + 14, 'start']]) { const d = svg('text', { x: f(x), y: f(acy + r + 16), 'text-anchor': anchor, class: 'orr-ltape__figure orr-ltape__foot-n' }); d.textContent = '\u2014'; ag.appendChild(d); }
        for (const [x, anchor, w] of [[acx - 14, 'end', 'BOUGHT'], [acx + 14, 'start', 'SOLD']]) { const t = svg('text', { x: f(x), y: f(acy + r + 32), 'text-anchor': anchor, class: 'orr-ltape__key orr-ltape__foot-k' }); t.textContent = w; ag.appendChild(t); }
      }
      const label = sorted.length ? signed(net) : '\u2014';
      const fs = Math.min(22, Math.max(12, Math.floor((r * 1.1) / Math.max(1, label.length * 0.58))));
      const nt = svg('text', { x: f(acx), y: f(acy + fs * 0.36), 'text-anchor': 'middle', class: 'orr-ltape__net', style: `font-size:${fs}px` });
      nt.textContent = label;
      const kt = svg('text', { x: f(acx), y: f(acy + fs * 0.36 + 15), 'text-anchor': 'middle', class: 'orr-ltape__key orr-ltape__net-key' });
      kt.textContent = 'NET \u00b7 CR';
      ag.append(nt, kt);
      target.appendChild(rise(ag, 200));
    };
    if (withArc) drawPurse(layer, x1 + 46 + R_ARC, y - 4, R_ARC);
    if (purseLayer) {
      purseLayer.textContent = '';
      const W2 = purseHost.clientWidth || 220;
      const H2 = purseHost.clientHeight || 200;
      purseLayer.setAttribute('viewBox', `0 0 ${W2} ${H2}`);
      const r2 = Math.max(36, Math.min(56, Math.floor(Math.min(W2 / 2 - 60, H2 / 2 - 36))));
      drawPurse(purseLayer, W2 / 2, H2 / 2 - 8, r2);
    }
  }

  return {
    el: host,
    /** @param {{ entries: {id:string,type:string,at:number,cycleLabel?:string,amount:number|null,label?:string}[], selectedId?: string|null, emptyCycle?: string, nowCycle?: string }} next */
    set(next) {
      data = next ? { ...next } : null;
      drawnKey = '';
      schedule();
    },
    relayout: schedule,
    dispose() {
      if (ro) ro.disconnect();
      if (frame && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frame);
      layer.removeEventListener('click', onClick);
      layer.textContent = '';
      host.classList.add('is-off');
      data = null;
    },
  };
}
