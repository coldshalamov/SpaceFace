// src/ui/orrery/helpInstruments.js — Help's small instruments (design/frontend/ORRERY.md §6 Meta).
//
// Each tab of Help is its own instrument in the ORRERY grammar (light over glass, bands with body, one
// amber Hand):
// - the LOOP ORRERY: the six core loops ride a lit ring; choosing one turns the ring (with mass) until
//   that loop reaches the gate at the Hand, and its steps run out of the gate as stations on a beam;
// - the HULL DIAL: the chosen hull's produced render inside a ring of five arc gauges (hull, shield,
//   handling, cargo, price against the fleet's best), the figures rolling to their values;
// - the PRICE SCALE: every good on one logarithmic ruler, the chosen one's price band lit; you scrub the
//   ruler to pick (pointer drag or arrow keys);
// - the ORE MIX: the six asteroid types orbit a split ring of the open type's ore drops, each share a lit
//   arc with its ore on a leader.
// Plus keyGlyph(): a binding drawn as its letter over a bar of light, never a chip.

import { svg, polar, arcD, ticksD } from './svg.js';
import { createSpring, reducedMotion, onFrame } from './motion.js';
import { injectOrrery } from './tokens.js';
import { rollTo } from './text.js';
import { hullPosterUrl } from '../hullPosters.js';

const STYLE_ID = 'orr-help-instruments-style';
const BONE = '236 230 216';
const HOT = '248 244 234';
const ICE = '143 203 255';
const LABEL = 'font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-weight:650; text-transform:uppercase;';
const BODY = 'font-family:var(--dp-face-body, "Instrument Sans"), system-ui, sans-serif;';
const f = (n) => Math.round(n * 100) / 100;

const CSS = `
.orr-hi-svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
.orr-hi-svg .orr-hi__band { fill:none; stroke:rgb(${BONE} / var(--orr-band-a, .27)); stroke-linecap:butt; }
.orr-hi-svg .orr-hi__edge { fill:none; stroke:rgb(${BONE} / .58); stroke-width:1.6px; }
.orr-hi-svg .orr-hi__notch { fill:none; stroke:rgb(5 7 10 / .92); stroke-width:1.6px; stroke-linecap:butt; }
.orr-hi-svg .orr-hi__tick { fill:none; stroke:rgb(${BONE} / .45); stroke-width:1.5px; stroke-linecap:butt; }
.orr-hi-svg .orr-hi__tick--major { stroke:rgb(${BONE} / .8); stroke-width:2px; }
.orr-hi-svg .orr-hi__lit { fill:none; stroke:rgb(${HOT}); stroke-linecap:butt; }
.orr-hi-svg .orr-hi__lit-bloom { fill:none; stroke:rgb(255 244 222 / .22); stroke-linecap:butt; }
.orr-hi-svg .orr-hi__hand { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:2.6px; stroke-linecap:round; }
.orr-hi-svg .orr-hi__hand-bloom { fill:none; stroke:rgb(242 185 80 / .24); stroke-width:11px; stroke-linecap:round; }
.orr-hi-svg .orr-hi__hand-bead { fill:var(--dp-hand-hot, #ffd98c); }
.orr-hi-svg .orr-hi__beam { fill:none; stroke:rgb(${BONE} / .55); stroke-width:2px; stroke-linecap:round; }
.orr-hi-svg .orr-hi__beam-band { fill:none; stroke:rgb(${BONE} / .2); stroke-width:8px; stroke-linecap:round; }
.orr-hi-svg .orr-hi__pulse { fill:none; stroke:rgb(236 247 255); stroke-width:3.4px; stroke-linecap:round; stroke-dasharray:.1 1.2; stroke-dashoffset:.1; animation:orr-hi-pulse 2.8s cubic-bezier(.45, 0, .55, 1) infinite; }
.orr-hi-svg .orr-hi__pulse-bloom { fill:none; stroke:rgb(${ICE} / .45); stroke-width:12px; stroke-linecap:round; stroke-dasharray:.14 1.2; stroke-dashoffset:.14; animation:orr-hi-pulse 2.8s cubic-bezier(.45, 0, .55, 1) infinite; }
@keyframes orr-hi-pulse { 0% { stroke-dashoffset:.12; opacity:0; } 8% { opacity:1; } 86% { opacity:1; } 100% { stroke-dashoffset:-1.04; opacity:0; } }
.orr-hi-rise { animation:orr-hi-rise .46s var(--dp-ease-out, ease-out) both; animation-delay:var(--orr-delay, 0ms); }
@keyframes orr-hi-rise { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
html.sf-reduce-motion .orr-hi-rise { animation:none; }
html.sf-reduce-motion .orr-hi-svg .orr-hi__pulse, html.sf-reduce-motion .orr-hi-svg .orr-hi__pulse-bloom { animation:none; display:none; }

/* ---------------------------------------------------------------- LOOP ORRERY */
.orr-hloop { position:relative; width:100%; height:100%; min-height:300px; isolation:isolate; }
.orr-hloop__pool { position:absolute; border-radius:50%; pointer-events:none; z-index:-1;
  background:radial-gradient(closest-side, rgb(5 7 10 / .82), rgb(5 7 10 / .6) 60%, rgb(5 7 10 / 0)); }
.orr-hloop__body { all:unset; box-sizing:border-box; position:absolute; left:0; top:0; z-index:3; width:34px; height:34px; margin:-17px 0 0 -17px; border-radius:50%; cursor:pointer;
  display:flex; align-items:center; justify-content:center; }
.orr-hloop__num { ${LABEL} font-size:12px; letter-spacing:.06em; color:rgb(${HOT}); position:relative; z-index:1; font-variant-numeric:tabular-nums; }
.orr-hloop__body::before { content:""; position:absolute; inset:0; border-radius:50%; background:rgb(5 7 10 / .92); box-shadow:inset 0 0 0 2px rgb(${BONE} / .66); transition:box-shadow .16s linear, background .16s linear; }
.orr-hloop__body:hover::before { box-shadow:inset 0 0 0 2px rgb(${HOT}); }
.orr-hloop__body:focus-visible { outline:none; }
.orr-hloop__body:focus-visible::before { box-shadow:inset 0 0 0 3px rgb(255 255 255), 0 0 12px rgb(255 250 236 / .5); }
.orr-hloop__body[aria-selected="true"]::before { background:rgb(${HOT}); box-shadow:0 0 16px rgb(255 244 222 / .5); }
.orr-hloop__body[aria-selected="true"] .orr-hloop__num { color:#12100c; }
.orr-hloop__name { position:absolute; ${LABEL} font-size:clamp(12px, .64vw, 16px); letter-spacing:.14em; line-height:1.25; color:rgb(${BONE} / .8); white-space:nowrap; pointer-events:none;
  text-shadow:0 0 8px rgb(4 6 9 / .95); transition:color .16s linear; }
.orr-hloop__body:is(:hover, :focus-visible) .orr-hloop__name { color:rgb(255 255 255); }
.orr-hloop__body[aria-selected="true"] .orr-hloop__name { color:rgb(255 255 255); }
.orr-hloop__centre { position:absolute; z-index:2; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; gap:8px; pointer-events:none; text-align:center; }
.orr-hloop__big { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 250; font-weight:250; line-height:.86;
  font-variant-numeric:tabular-nums lining-nums; letter-spacing:-.02em; color:var(--dp-phos, #dfeeff); }
.orr-hloop__of { ${LABEL} font-size:12px; letter-spacing:.3em; color:rgb(${BONE} / .72); }
.orr-hloop__read { position:absolute; z-index:2; display:flex; flex-direction:column; gap:0; }
.orr-hloop__read::before { content:""; position:absolute; z-index:-1; left:-40px; right:-60px; top:-30px; bottom:-30px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(5 7 10 / .7), rgb(5 7 10 / .4) 60%, rgb(5 7 10 / 0)); }
.orr-hloop__kicker { margin:0 0 8px; ${LABEL} font-size:12px; letter-spacing:.26em; color:rgb(${BONE} / .72); }
.orr-hloop__title { margin:0 0 18px; font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800; font-weight:800;
  font-size:clamp(24px, 2vw, 40px); line-height:1; letter-spacing:.02em; text-transform:uppercase; color:rgb(${HOT}); }
.orr-hloop__steps { list-style:none; margin:0; padding:0; position:relative; }
.orr-hloop__step { position:relative; display:flex; align-items:baseline; gap:14px; padding:9px 0 9px 40px; ${BODY} font-size:clamp(15px, .8vw, 19px); line-height:1.35; color:rgb(${HOT}); }
.orr-hloop__step b { ${LABEL} font-size:12px; letter-spacing:.12em; color:rgb(${BONE} / .76); font-variant-numeric:tabular-nums; flex:none; width:22px; }
.orr-hloop__why { margin:22px 0 0; max-width:520px; ${BODY} font-size:clamp(14px, .76vw, 18px); line-height:1.5; color:rgb(${BONE} / .86); }
.orr-hloop__why::before { content:"Why it pays"; display:block; margin:0 0 6px; ${LABEL} font-size:12px; letter-spacing:.24em; color:rgb(${BONE} / .72); }
.orr-hloop.is-off > * { display:none; }

/* ---------------------------------------------------------------- HULL DIAL */
.orr-hdial { position:relative; width:100%; height:100%; min-height:280px; isolation:isolate; }
.orr-hdial__pool { position:absolute; border-radius:50%; pointer-events:none; z-index:-1;
  background:radial-gradient(closest-side, rgb(5 7 10 / .84), rgb(5 7 10 / .62) 60%, rgb(5 7 10 / 0)); }
.orr-hdial__art { position:absolute; z-index:1; pointer-events:none; object-fit:contain; opacity:0; transition:opacity .4s var(--dp-ease-out, ease-out), transform .6s var(--dp-ease-out, ease-out);
  filter:drop-shadow(0 16px 22px rgb(0 0 0 / .65)); }
.orr-hdial__art.is-ready { opacity:1; }
.orr-hdial__tier { position:absolute; z-index:1; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; gap:10px; pointer-events:none; }
.orr-hdial__tier > b { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 250; font-weight:250; line-height:.86; letter-spacing:-.02em; color:var(--dp-phos, #dfeeff); }
.orr-hdial__tier > span { ${LABEL} font-size:clamp(12px, .64vw, 16px); letter-spacing:.3em; color:rgb(${BONE} / .76); }
.orr-hdial__g { position:absolute; z-index:2; display:flex; flex-direction:column; gap:3px; pointer-events:none; white-space:nowrap; }
.orr-hdial__g.is-left { align-items:flex-end; text-align:right; }
.orr-hdial__g-name { ${LABEL} font-size:12px; letter-spacing:.22em; color:rgb(${BONE} / .74); }
.orr-hdial__g-val { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 320; font-weight:320; font-size:clamp(24px, 1.5vw, 34px);
  line-height:1; letter-spacing:-.01em; color:rgb(${HOT}); font-variant-numeric:tabular-nums; }
.orr-hdial__g-val small { font-size:.5em; margin-left:4px; ${LABEL} letter-spacing:.14em; color:rgb(${BONE} / .76); }
.orr-hdial.is-off > * { display:none; }

/* ---------------------------------------------------------------- PRICE SCALE */
.orr-hscale { position:relative; width:100%; height:clamp(104px, 12vh, 150px); cursor:ew-resize; outline:none; touch-action:none; isolation:isolate; }
.orr-hscale::before { content:""; position:absolute; z-index:-1; left:-24px; right:-24px; top:-10px; bottom:-10px; pointer-events:none;
  background:radial-gradient(60% 70% at 50% 60%, rgb(5 7 10 / .66), rgb(5 7 10 / 0)); }
.orr-hscale:focus-visible .orr-hi__edge { stroke:rgb(255 255 255); }
.orr-hscale__title { position:absolute; left:0; top:0; ${LABEL} font-size:12px; letter-spacing:.26em; color:rgb(${BONE} / .76); pointer-events:none; }
.orr-hscale__read { position:absolute; top:0; transform:translateX(-50%); display:flex; align-items:baseline; gap:10px; white-space:nowrap; pointer-events:none; transition:left .34s cubic-bezier(.34, 1.36, .64, 1); }
.orr-hscale__read b { font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 320; font-weight:320; font-size:clamp(26px, 1.7vw, 38px); line-height:1; color:rgb(${HOT}); font-variant-numeric:tabular-nums; }
.orr-hscale__read > span { ${LABEL} font-size:12px; letter-spacing:.2em; color:rgb(${HOT}); }
.orr-hscale__ghost { position:absolute; bottom:0; transform:translateX(-50%); ${LABEL} font-size:12px; letter-spacing:.14em; color:rgb(255 255 255); white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .12s linear; }
.orr-hscale.is-hover .orr-hscale__ghost { opacity:1; }
.orr-hscale .orr-hi-svg text { font-family:var(--dp-face-label, "Archivo"); font-size:12px; font-weight:650; letter-spacing:.12em; fill:rgb(${BONE} / .76); }
.orr-hscale .orr-hscale__good { stroke:rgb(${BONE} / .56); stroke-width:2px; }
.orr-hscale .orr-hscale__good.is-out { stroke:rgb(${BONE} / .14); }
.orr-hscale .orr-hscale__good.is-foe { stroke:rgb(255 122 102 / .8); }
.orr-hscale .orr-hscale__cursor { stroke:rgb(255 255 255 / .8); stroke-width:1.5px; opacity:0; }
.orr-hscale.is-hover .orr-hscale__cursor { opacity:1; }
html.sf-reduce-motion .orr-hscale__read { transition:none; }

/* ---------------------------------------------------------------- ORE MIX */
.orr-hmix { position:relative; width:100%; height:100%; min-height:300px; isolation:isolate; }
.orr-hmix__pool { position:absolute; border-radius:50%; pointer-events:none; z-index:-1;
  background:radial-gradient(closest-side, rgb(5 7 10 / .84), rgb(5 7 10 / .62) 60%, rgb(5 7 10 / 0)); }
.orr-hmix__rock { all:unset; box-sizing:border-box; position:absolute; left:0; top:0; z-index:3; border-radius:50%; cursor:pointer; }
.orr-hmix__rock::before { content:""; position:absolute; inset:0; border-radius:50%; background:rgb(5 7 10 / .9); box-shadow:inset 0 0 0 2px rgb(${BONE} / .62); transition:box-shadow .16s, background .16s; }
.orr-hmix__rock:hover::before { box-shadow:inset 0 0 0 2px rgb(${HOT}); }
.orr-hmix__rock:focus-visible { outline:none; }
.orr-hmix__rock:focus-visible::before { box-shadow:inset 0 0 0 3px rgb(255 255 255), 0 0 12px rgb(255 250 236 / .5); }
.orr-hmix__rock[aria-pressed="true"]::before { background:rgb(${HOT}); box-shadow:0 0 16px rgb(255 244 222 / .5); }
.orr-hmix__rock.is-above .orr-hmix__rock-name { top:auto; bottom:calc(100% + 10px); }
.orr-hmix__rock-name { position:absolute; left:50%; top:calc(100% + 10px); transform:translateX(-50%); ${LABEL} font-size:12px; letter-spacing:.16em; color:rgb(${BONE} / .8); white-space:nowrap; pointer-events:none; text-shadow:0 0 8px rgb(4 6 9 / .95); }
.orr-hmix__rock[aria-pressed="true"] .orr-hmix__rock-name, .orr-hmix__rock:is(:hover, :focus-visible) .orr-hmix__rock-name { color:rgb(255 255 255); }
.orr-hmix__centre { position:absolute; z-index:2; transform:translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; gap:6px; pointer-events:none; text-align:center; }
.orr-hmix__centre > b { line-height:1.05; font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800; font-weight:800; font-size:clamp(16px, 1.1vw, 24px); letter-spacing:.06em; text-transform:uppercase; color:rgb(${HOT}); }
.orr-hmix__centre > span { ${LABEL} font-size:12px; letter-spacing:.22em; color:rgb(${BONE} / .76); }
.orr-hmix__lbl { all:unset; box-sizing:border-box; position:absolute; z-index:3; display:flex; flex-direction:column; gap:1px; white-space:nowrap; cursor:pointer; }
.orr-hmix__lbl.is-left { align-items:flex-end; text-align:right; }
.orr-hmix__lbl-name { ${BODY} font-size:clamp(14px, .74vw, 18px); color:rgb(${HOT}); line-height:1.2; }
.orr-hmix__lbl-pc { font-family:var(--dp-face-numeral, "Archivo"); font-variation-settings:"wdth" 100, "wght" 400; font-size:clamp(13px, .7vw, 17px); color:rgb(${BONE} / .78); font-variant-numeric:tabular-nums; }
.orr-hmix__lbl:is(:hover, :focus-visible) .orr-hmix__lbl-name { color:rgb(255 255 255); text-decoration:underline 2px rgb(255 255 255 / .6); text-underline-offset:4px; outline:none; }
.orr-hmix__lbl.is-chosen .orr-hmix__lbl-name { color:rgb(255 255 255); font-weight:600; }
.orr-hmix__lbl.is-chosen .orr-hmix__lbl-pc { color:rgb(${HOT}); }
.orr-hmix.is-off > * { display:none; }

/* ---------------------------------------------------------------- GOOD TOKEN */
.orr-htoken { position:relative; width:100%; height:100%; min-height:220px; isolation:isolate; }
.orr-htoken::before { content:""; position:absolute; z-index:-1; inset:0; pointer-events:none; background:radial-gradient(closest-side, rgb(5 7 10 / .8), rgb(5 7 10 / .5) 60%, rgb(5 7 10 / 0)); }
.orr-htoken__glyph { position:absolute; color:rgb(${HOT}); filter:drop-shadow(0 0 14px rgb(255 244 222 / .35)); }
.orr-htoken__glyph svg { width:100%; height:100%; display:block; stroke-width:.9px; }
.orr-htoken__glyph.is-foe { color:#ff7a66; }
.orr-htoken__word { position:absolute; transform:translate(-50%, -50%); ${LABEL} font-size:12px; letter-spacing:.24em; color:rgb(${BONE} / .76); white-space:nowrap; pointer-events:none; }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

function canDraw(host) {
  const doc = host && host.ownerDocument ? host.ownerDocument : globalThis.document;
  return !!(host && doc && typeof doc.createElementNS === 'function' && typeof host.getBoundingClientRect === 'function') ? doc : null;
}

function observe(host, fn) {
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') frame = raf(() => { frame = 0; fn(); });
    else fn();
  };
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(schedule); ro.observe(host); }
  return {
    schedule,
    stop() { if (ro) ro.disconnect(); if (frame && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(frame); frame = 0; },
  };
}

function rise(node, delay, on) {
  if (!on) return node;
  node.classList.add('orr-hi-rise');
  node.style.setProperty('--orr-delay', `${delay}ms`);
  return node;
}

/** A band ring with ticks cut through it (an annulus you could grip), plus its edges. */
function bandRing(g, cx, cy, r, w, { a = 0.27, notches = 72, from = 0, to = 360 } = {}) {
  g.appendChild(svg('path', { d: arcD(cx, cy, r, from, to), class: 'orr-hi__band', style: `stroke-width:${w}px; --orr-band-a:${a}` }));
  if (notches) g.appendChild(svg('path', { d: ticksD(cx, cy, r + w / 2, notches, { len: w, inward: true, from, to }), class: 'orr-hi__notch' }));
  g.appendChild(svg('path', { d: arcD(cx, cy, r + w / 2, from, to), class: 'orr-hi__edge' }));
  g.appendChild(svg('path', { d: arcD(cx, cy, r - w / 2, from, to), class: 'orr-hi__edge', style: 'stroke:rgb(236 230 216 / .34)' }));
}

/** A key glyph: the key's letter over a bar of light (never a chip). A sentence reads as quiet text. */
export function keyGlyph(label, { small = false } = {}) {
  const doc = globalThis.document;
  const node = doc.createElement('span');
  const text = String(label == null ? '' : label).trim();
  const none = !text || text === '—' || text === '-';
  const sentence = !none && (text.length > 16 || /[:(]|when |button|prompted|->|near |target |then /i.test(text));
  node.className = 'orr-hkey' + (small ? ' orr-hkey--small' : '') + (none ? ' orr-hkey--none' : '') + (sentence ? ' orr-hkey--text' : '');
  if (none) { node.textContent = 'not bound'; node.classList.add('orr-hkey--word'); return node; }
  if (sentence) { node.textContent = text; return node; }
  const parts = text.split(/\s+\/\s+|\//).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1 && parts.every((p) => p.length <= 9)) {
    parts.forEach((p, i) => {
      if (i) { const sep = doc.createElement('span'); sep.className = 'orr-hkey__sep'; sep.textContent = '·'; node.appendChild(sep); }
      node.appendChild(doc.createTextNode(p));
    });
    if (parts.some((p) => p.length > 3)) node.classList.add('orr-hkey--word');
    return node;
  }
  node.textContent = text;
  if (text.length > 3) node.classList.add('orr-hkey--word');
  return node;
}

// ================================================================================================
// LOOP ORRERY

/**
 * @param {HTMLElement} host
 * @param {{ loops: {id:string,name:string,steps:string[],why:string}[], onPick: (index:number) => void }} o
 */
export function createLoopOrrery(host, { loops = [], onPick = () => {} } = {}) {
  const doc = canDraw(host);
  const inert = { set() {}, dispose() {} };
  if (!doc || !loops.length) return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-hloop', 'is-off');
  const n = loops.length;
  const STEP = 360 / n;
  const GATE = 90;
  const pool = doc.createElement('i'); pool.className = 'orr-hloop__pool';
  const under = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false' });
  const over = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false', style: 'z-index:2' });
  const centre = doc.createElement('div'); centre.className = 'orr-hloop__centre';
  const big = doc.createElement('b'); big.className = 'orr-hloop__big';
  const of = doc.createElement('span'); of.className = 'orr-hloop__of';
  centre.append(big, of);
  const read = doc.createElement('div'); read.className = 'orr-hloop__read'; read.setAttribute('aria-live', 'polite');
  const kicker = doc.createElement('p'); kicker.className = 'orr-hloop__kicker';
  const title = doc.createElement('h2'); title.className = 'orr-hloop__title';
  const steps = doc.createElement('ol'); steps.className = 'orr-hloop__steps';
  const why = doc.createElement('p'); why.className = 'orr-hloop__why';
  read.append(kicker, title, steps, why);
  const group = doc.createElement('div');
  group.setAttribute('role', 'listbox');
  group.setAttribute('aria-label', 'Core loops');
  group.style.cssText = 'position:absolute; inset:0; pointer-events:none;';
  const bodies = loops.map((loop, i) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'orr-hloop__body';
    b.setAttribute('role', 'option');
    b.dataset.loop = String(i);
    b.dataset.action = 'help-loop:' + i;
    b.style.pointerEvents = 'auto';
    const num = doc.createElement('span'); num.className = 'orr-hloop__num'; num.textContent = String(i + 1).padStart(2, '0');
    const name = doc.createElement('span'); name.className = 'orr-hloop__name'; name.textContent = loop.name;
    b.append(num, name);
    b.setAttribute('aria-label', `${i + 1}. ${loop.name}`);
    b.addEventListener('click', () => onPick(i));
    b.addEventListener('keydown', (ev) => {
      const dir = ev.key === 'ArrowDown' || ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      ev.preventDefault();
      const next = (i + dir + n) % n;
      onPick(next);
      const nb = bodies[next];
      if (nb && typeof nb.focus === 'function') nb.focus();
    });
    group.appendChild(b);
    return b;
  });
  host.append(pool, under, over, centre, read, group);

  let selected = 0;
  let geo = null;
  let arrived = false;
  let handG = null;
  let beamG = null;
  let wheelAt = 0;
  const spring = createSpring({ value: 0, preset: 'swing', onUpdate: (v) => paintBodies(v) });

  function paintBodies(v) {
    if (!geo) return;
    const { cx, cy, R, small } = geo;
    bodies.forEach((b, i) => {
      const deg = GATE + (i - v) * STEP;
      const [x, y] = polar(cx, cy, R, deg);
      b.style.left = `${f(x)}px`;
      b.style.top = `${f(y)}px`;
      const name = b.querySelector('.orr-hloop__name');
      const [lx, ly] = polar(0, 0, small ? 30 : 36, deg);
      const a = ((deg % 360) + 360) % 360;
      // names face outward; the one at the gate is named in the reading, so its ring name rests
      const east = a > 20 && a < 160;
      const west = a > 200 && a < 340;
      name.style.left = east ? `${f(17 + lx)}px` : west ? 'auto' : '50%';
      name.style.right = west ? `${f(17 - lx)}px` : 'auto';
      name.style.top = `${f(17 + ly)}px`;
      name.style.transform = east || west ? 'translateY(-50%)' : `translate(-50%, ${a <= 20 || a >= 340 ? '-100%' : '0'})`;
      name.style.opacity = i === selected && Math.abs(v - selected) < 0.3 ? '0' : '1';
    });
  }

  function paintRead(swing) {
    const loop = loops[selected];
    kicker.textContent = `Loop ${String(selected + 1).padStart(2, '0')} of ${String(n).padStart(2, '0')}`;
    title.textContent = loop.name;
    big.textContent = String(selected + 1).padStart(2, '0');
    of.textContent = `of ${String(n).padStart(2, '0')} loops`;
    steps.textContent = '';
    loop.steps.forEach((s, i) => {
      const li = doc.createElement('li');
      li.className = 'orr-hloop__step';
      const num = doc.createElement('b'); num.textContent = String(i + 1).padStart(2, '0');
      const t = doc.createElement('span'); t.textContent = s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
      li.append(num, t);
      rise(li, 80 + i * 70, swing && !reducedMotion());
      steps.appendChild(li);
    });
    why.textContent = loop.why;
    bodies.forEach((b, i) => { b.setAttribute('aria-selected', String(i === selected)); b.tabIndex = i === selected ? 0 : -1; });
  }

  // the steps hang off a beam that leaves the ring at the gate: the list is centred on the gate's
  // height, a trunk runs from the gate to the beam, and pulses run out of the gate and down the steps
  function paintBeam() {
    if (!geo || !beamG) return;
    beamG.textContent = '';
    const { cx, cy, R } = geo;
    const items = [...steps.children];
    if (!items.length) return;
    // centre the steps on the gate
    const stepsMid = steps.offsetTop + steps.offsetHeight / 2;
    read.style.top = `${f(Math.max(0, Math.min(geo.H - read.offsetHeight, cy - stepsMid)))}px`;
    const hostBox = host.getBoundingClientRect();
    const ys = items.map((li) => { const r = li.getBoundingClientRect(); return r.top - hostBox.top + r.height / 2; });
    const xs = read.getBoundingClientRect().left - hostBox.left + 14;
    const [gx, gy] = polar(cx, cy, R + geo.bandW / 2 + 4, GATE);
    const top = ys[0];
    const bottom = ys[ys.length - 1];
    const trunk = `M ${f(gx)} ${f(gy)} L ${f(xs)} ${f(gy)}`;
    const spine = `M ${f(xs)} ${f(top)} L ${f(xs)} ${f(bottom)}`;
    for (const d of [trunk, spine]) beamG.appendChild(svg('path', { d, class: 'orr-hi__beam-band' }));
    for (const d of [trunk, spine]) beamG.appendChild(svg('path', { d, class: 'orr-hi__beam' }));
    beamG.appendChild(svg('path', { d: trunk, class: 'orr-hi__pulse-bloom', pathLength: 1 }));
    beamG.appendChild(svg('path', { d: trunk, class: 'orr-hi__pulse', pathLength: 1 }));
    const sp = svg('path', { d: spine, class: 'orr-hi__pulse-bloom', pathLength: 1, style: 'animation-delay:.9s' });
    const sc = svg('path', { d: spine, class: 'orr-hi__pulse', pathLength: 1, style: 'animation-delay:.9s' });
    beamG.append(sp, sc);
    ys.forEach((y) => {
      beamG.appendChild(svg('circle', { cx: f(xs), cy: f(y), r: 7.5, fill: 'rgb(5 7 10)', stroke: `rgb(${BONE} / .82)`, 'stroke-width': 2 }));
      beamG.appendChild(svg('circle', { cx: f(xs), cy: f(y), r: 2.8, fill: `rgb(${HOT})` }));
    });
    beamG.appendChild(svg('circle', { cx: f(xs), cy: f(gy), r: 4, fill: 'rgb(236 247 255)' }));
  }

  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (W < 360 || H < 260) { host.classList.add('is-off'); geo = null; return; }
    host.classList.remove('is-off');
    const small = W < 900 || H < 480;
    const R = Math.max(110, Math.min(H * 0.36, W * 0.2));
    const bandW = small ? 10 : 14;
    const nameRoom = small ? 150 : 210;
    const cx = nameRoom + R;
    const cy = H / 2;
    geo = { W, H, R, cx, cy, bandW, small };
    under.setAttribute('viewBox', `0 0 ${W} ${H}`);
    over.setAttribute('viewBox', `0 0 ${W} ${H}`);
    under.textContent = '';
    over.textContent = '';
    const arriveNow = !arrived && !reducedMotion();
    const pd = R * 3;
    Object.assign(pool.style, { left: `${f(cx - pd / 2)}px`, top: `${f(cy - pd / 2)}px`, width: `${f(pd)}px`, height: `${f(pd)}px` });
    const g = svg('g', {});
    bandRing(g, cx, cy, R, bandW, { a: 0.27, notches: 72 });
    // the inner scale, drifting; the gate's major tick
    const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${f(cx)}px ${f(cy)}px; --orr-drift-s:600s` });
    drift.appendChild(svg('path', { d: ticksD(cx, cy, R - bandW / 2 - 8, 90, { len: 3, major: 15, majorLen: 9, inward: true }), class: 'orr-hi__tick', style: 'stroke:rgb(236 230 216 / .34)' }));
    g.appendChild(drift);
    g.appendChild(svg('path', { d: arcD(cx, cy, R * 0.46, 0, 360), class: 'orr-hi__edge', style: 'stroke:rgb(236 230 216 / .3)' }));
    under.appendChild(rise(g, 0, arriveNow));
    // the Hand: from the centre's ring to the gate, the screen's one amber
    handG = svg('g', {});
    const [h0x, h0y] = polar(cx, cy, R * 0.46 + 6, GATE);
    const [h1x, h1y] = polar(cx, cy, R - bandW / 2 - 22, GATE);
    handG.appendChild(svg('path', { d: `M ${f(h0x)} ${f(h0y)} L ${f(h1x)} ${f(h1y)}`, class: 'orr-hi__hand-bloom' }));
    handG.appendChild(svg('path', { d: `M ${f(h0x)} ${f(h0y)} L ${f(h1x)} ${f(h1y)}`, class: 'orr-hi__hand' }));
    handG.appendChild(svg('path', { d: `M ${f(h1x - 9)} ${f(h1y - 7)} L ${f(h1x + 2)} ${f(h1y)} L ${f(h1x - 9)} ${f(h1y + 7)}`, class: 'orr-hi__hand' }));
    handG.appendChild(svg('circle', { cx: f(h0x), cy: f(h0y), r: 3.6, class: 'orr-hi__hand-bead' }));
    over.appendChild(rise(handG, 360, arriveNow));
    beamG = svg('g', {});
    over.appendChild(beamG);
    // the centre numeral
    centre.style.left = `${f(cx)}px`;
    centre.style.top = `${f(cy)}px`;
    big.style.fontSize = `${f(Math.max(48, R * 0.4))}px`;
    // the reading stands right of the gate
    const readLeft = cx + R + (small ? 70 : 110);
    Object.assign(read.style, { left: `${f(readLeft)}px`, top: `${f(Math.max(0, cy - R))}px`, width: `${f(Math.max(240, Math.min(620, W - readLeft - 10)))}px` });
    arrived = true;
    paintBodies(spring.value);
    paintBeam();
  }

  const obs = observe(host, layout);
  const onWheel = (ev) => {
    if (!geo) return;
    const now = Date.now();
    if (now - wheelAt < 220 || Math.abs(ev.deltaY) < 4) return;
    wheelAt = now;
    ev.preventDefault();
    onPick((selected + (ev.deltaY > 0 ? 1 : -1) + n) % n);
  };
  host.addEventListener('wheel', onWheel, { passive: false });

  return {
    set({ selected: next = 0, swing = false } = {}) {
      const target = Math.max(0, Math.min(n - 1, Number(next) || 0));
      // turn the short way round
      let t = target;
      const cur = spring.value;
      while (t - cur > n / 2) t -= n;
      while (t - cur < -n / 2) t += n;
      selected = target;
      paintRead(swing);
      paintBeam();
      spring.set(t, { instant: !swing });
      paintBodies(spring.value);
      obs.schedule();
    },
    dispose() {
      obs.stop();
      spring.stop();
      host.removeEventListener('wheel', onWheel);
      host.textContent = '';
      host.classList.remove('orr-hloop', 'is-off');
    },
  };
}

// ================================================================================================
// HULL DIAL

const GAUGES = Object.freeze([
  { key: 'hull', name: 'Hull', fmt: (s) => String(s.hull) },
  { key: 'shield', name: 'Shield', fmt: (s) => String(s.shield) },
  { key: 'handling', name: 'Handling', fmt: (s) => (s.handling != null ? s.handling.toFixed(2) : '-') },
  { key: 'cargo', name: 'Cargo', fmt: (s) => String(s.cargo), unit: 'u' },
  { key: 'price', name: 'Price', fmt: (s) => (s.price ? s.price.toLocaleString('en-US') : '0'), unit: 'cr' },
]);

/**
 * The fraction of the fleet's best a hull reaches on one gauge. The fleet spans two orders of
 * magnitude from the starter to the flagship, so size reads on a square-root scale, price on a log
 * scale, and handling (a narrow band) straight.
 */
export function gaugeFraction(key, ship, maxima) {
  const v = Number(ship && ship[key]) || 0;
  const m = Number(maxima && maxima[key]) || 1;
  if (key === 'price') return v <= 0 ? 0 : Math.max(0.04, Math.min(1, Math.log10(v + 1) / Math.log10(m + 1)));
  if (key === 'handling') return Math.max(0, Math.min(1, v / m));
  return Math.max(0, Math.min(1, Math.sqrt(v / m)));
}

/** @param {HTMLElement} host @param {{ maxima: object }} o */
export function createHullDial(host, { maxima = {} } = {}) {
  const doc = canDraw(host);
  const inert = { set() {}, dispose() {} };
  if (!doc) return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-hdial', 'is-off');
  const pool = doc.createElement('i'); pool.className = 'orr-hdial__pool';
  const under = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false' });
  const art = doc.createElement('img'); art.className = 'orr-hdial__art'; art.alt = ''; art.decoding = 'async'; art.draggable = false;
  art.addEventListener('load', () => art.classList.add('is-ready'));
  const tier = doc.createElement('div'); tier.className = 'orr-hdial__tier';
  const tierNum = doc.createElement('b');
  const tierRole = doc.createElement('span');
  tier.append(tierNum, tierRole);
  const over = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false', style: 'z-index:2' });
  const labels = GAUGES.map((gd) => {
    const g = doc.createElement('div'); g.className = 'orr-hdial__g';
    const name = doc.createElement('span'); name.className = 'orr-hdial__g-name'; name.textContent = gd.name;
    const val = doc.createElement('span'); val.className = 'orr-hdial__g-val';
    const num = doc.createElement('span');
    val.appendChild(num);
    if (gd.unit) { const u = doc.createElement('small'); u.textContent = gd.unit; val.appendChild(u); }
    g.append(name, val);
    return { g, num };
  });
  host.append(pool, under, art, tier, over, ...labels.map((l) => l.g));

  let ship = null;
  let geo = null;
  let arrived = false;
  const fills = GAUGES.map(() => null);
  const springs = GAUGES.map((_, i) => createSpring({ value: 0, preset: 'settle', onUpdate: (v) => paintFill(i, v) }));

  // five gauges round the dial, each 56 degrees, starting at the upper left
  const span = 56;
  const gapDeg = 16;
  const startOf = (i) => -142 + i * (span + gapDeg);

  function paintFill(i, v) {
    const fl = fills[i];
    if (!fl || !geo) return;
    const { cx, cy, R } = geo;
    const a0 = startOf(i);
    const a1 = a0 + span * Math.max(0.001, v);
    const d = arcD(cx, cy, R, a0, a1);
    fl.lit.setAttribute('d', d);
    fl.bloom.setAttribute('d', d);
    const [bx, by] = polar(cx, cy, R, a1);
    fl.bead.setAttribute('cx', f(bx));
    fl.bead.setAttribute('cy', f(by));
  }

  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (!ship || W < 300 || H < 260) { host.classList.add('is-off'); geo = null; return; }
    host.classList.remove('is-off');
    const small = W < 620 || H < 460;
    const R = Math.max(100, Math.min(H * 0.4, (W - (small ? 200 : 236)) / 2));
    const cx = W / 2;
    const cy = H / 2;
    const bandW = small ? 12 : 16;
    geo = { W, H, R, cx, cy, bandW, small };
    under.setAttribute('viewBox', `0 0 ${W} ${H}`);
    over.setAttribute('viewBox', `0 0 ${W} ${H}`);
    under.textContent = '';
    over.textContent = '';
    const arriveNow = !arrived && !reducedMotion();
    const pd = R * 2.9;
    Object.assign(pool.style, { left: `${f(cx - pd / 2)}px`, top: `${f(cy - pd / 2)}px`, width: `${f(pd)}px`, height: `${f(pd)}px` });
    const g = svg('g', {});
    // the gauge tracks: five bands with ticks cut through, a quiet inner ring
    GAUGES.forEach((_, i) => bandRing(g, cx, cy, R, bandW, { a: 0.27, notches: 40, from: startOf(i), to: startOf(i) + span }));
    g.appendChild(svg('path', { d: arcD(cx, cy, R - bandW - 14, 0, 360), class: 'orr-hi__edge', style: 'stroke:rgb(236 230 216 / .26)' }));
    const drift = svg('g', { class: 'orr-drift orr-drift--rev', style: `transform-origin:${f(cx)}px ${f(cy)}px; --orr-drift-s:720s` });
    drift.appendChild(svg('path', { d: ticksD(cx, cy, R + bandW / 2 + 16, 120, { len: 3, major: 10, majorLen: 8, inward: true }), class: 'orr-hi__tick', style: 'stroke:rgb(236 230 216 / .3)' }));
    g.appendChild(drift);
    under.appendChild(rise(g, 0, arriveNow));
    // the fills: a lit core over its bloom, a bead at the value
    GAUGES.forEach((_, i) => {
      const grp = svg('g', {});
      const bloom = svg('path', { d: '', class: 'orr-hi__lit-bloom', style: `stroke-width:${bandW + 8}px` });
      const lit = svg('path', { d: '', class: 'orr-hi__lit', style: `stroke-width:${Math.round(bandW * 0.42)}px` });
      const bead = svg('circle', { r: small ? 4 : 5.5, fill: 'rgb(255 253 246)' });
      grp.append(bloom, lit, bead);
      over.appendChild(grp);
      fills[i] = { bloom, lit, bead };
      // the gauge's name and figure stand outside its arc's middle
      const mid = startOf(i) + span / 2;
      const [lx, ly] = polar(cx, cy, R + bandW / 2 + 30, mid);
      const lab = labels[i].g;
      const a = ((mid % 360) + 360) % 360;
      const left = a > 180;
      // the label's corner nearest the ring sits on the anchor, so the words never cross the arc
      const upper = a < 90 || a > 270;
      const bottom = a > 150 && a < 210;
      lab.classList.toggle('is-left', left && !bottom);
      lab.style.alignItems = bottom ? 'center' : '';
      lab.style.left = left && !bottom ? 'auto' : `${f(lx)}px`;
      lab.style.right = left && !bottom ? `${f(W - lx)}px` : 'auto';
      lab.style.top = `${f(ly)}px`;
      lab.style.transform = bottom ? 'translate(-50%, 0)' : upper ? 'translateY(-100%)' : 'none';
      rise(lab, 200 + i * 60, arriveNow);
    });
    // the render: the hero three-quarter where it exists, else the class numeral
    const url = hullPosterUrl(ship.id, 'hero');
    if (url) {
      const aw = R * 2.1;
      const ah = aw * 1350 / 2400;
      Object.assign(art.style, { left: `${f(cx - aw / 2)}px`, top: `${f(cy - ah / 2)}px`, width: `${f(aw)}px`, height: `${f(ah)}px`, display: 'block' });
      tier.style.display = 'none';
    } else {
      art.style.display = 'none';
      tier.style.display = 'flex';
      tier.style.left = `${f(cx)}px`;
      tier.style.top = `${f(cy)}px`;
      tierNum.style.fontSize = `${f(Math.max(56, R * 0.55))}px`;
    }
    arrived = true;
    springs.forEach((sp, i) => paintFill(i, sp.value));
  }

  const obs = observe(host, layout);
  return {
    set({ ship: next = null, swing = false } = {}) {
      ship = next;
      if (!ship) { obs.schedule(); return; }
      const url = hullPosterUrl(ship.id, 'hero');
      if (url && art.getAttribute('src') !== url) { art.classList.remove('is-ready'); art.src = url; }
      tierNum.textContent = `T${ship.tier}`;
      tierRole.textContent = String(ship.role || '').replace(/_/g, ' ');
      GAUGES.forEach((gd, i) => {
        springs[i].set(gaugeFraction(gd.key, ship, maxima));
        const num = labels[i].num;
        const raw = gd.key === 'handling' ? null : Number(ship[gd.key]) || 0;
        if (raw == null) num.textContent = gd.fmt(ship);
        else rollTo(num, raw);
      });
      obs.schedule();
    },
    dispose() {
      obs.stop();
      springs.forEach((s) => s.stop());
      host.textContent = '';
      host.classList.remove('orr-hdial', 'is-off');
    },
  };
}

// ================================================================================================
// PRICE SCALE

const P_MIN = 5;
const P_MAX = 20000;

/** @param {HTMLElement} host @param {{ items: object[], onPick: (id:string) => void }} o */
export function createPriceScale(host, { items = [], onPick = () => {} } = {}) {
  const doc = canDraw(host);
  const inert = { set() {}, dispose() {} };
  if (!doc || !items.length) return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-hscale');
  host.tabIndex = 0;
  host.setAttribute('role', 'slider');
  host.setAttribute('aria-label', 'Price scale: scrub to choose a good');
  host.dataset.action = 'help-scale';
  const layer = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false' });
  const title = doc.createElement('span'); title.className = 'orr-hscale__title'; title.textContent = 'Base price · scrub to choose';
  const read = doc.createElement('div'); read.className = 'orr-hscale__read';
  const readNum = doc.createElement('b'); const readName = doc.createElement('span');
  read.append(readNum, readName);
  const ghost = doc.createElement('div'); ghost.className = 'orr-hscale__ghost';
  host.append(layer, title, read, ghost);

  const byPrice = items.slice().sort((a, b) => a.basePrice - b.basePrice || a.name.localeCompare(b.name));
  let selectedId = byPrice[0].id;
  let filter = '';
  let geo = null;
  let dragging = false;
  let goodEls = new Map();
  let bandEl = null; let bandBloom = null; let beadEl = null; let cursor = null;

  const xOf = (p) => {
    if (!geo) return 0;
    const t = (Math.log10(Math.max(P_MIN, p)) - Math.log10(P_MIN)) / (Math.log10(P_MAX) - Math.log10(P_MIN));
    return geo.x0 + t * (geo.x1 - geo.x0);
  };
  const visible = () => byPrice.filter((c) => !filter || (c.name + ' ' + (c.category || '')).toLowerCase().includes(filter));

  function paintChosen() {
    if (!geo) return;
    const c = byPrice.find((x) => x.id === selectedId) || byPrice[0];
    const vol = Math.max(0.04, Number(c.volatility) || 0.1);
    const xa = xOf(c.basePrice * (1 - vol));
    const xb = xOf(c.basePrice * (1 + vol));
    const x = xOf(c.basePrice);
    const y = geo.y;
    bandEl.setAttribute('d', `M ${f(xa)} ${f(y)} L ${f(xb)} ${f(y)}`);
    bandBloom.setAttribute('d', `M ${f(xa)} ${f(y)} L ${f(xb)} ${f(y)}`);
    beadEl.setAttribute('cx', f(x));
    beadEl.setAttribute('cy', f(y));
    read.style.left = `${f(Math.max(120, Math.min(geo.W - 160, x)))}px`;
    rollTo(readNum, c.basePrice);
    readName.textContent = `cr · ${c.name}`;
    for (const [id, el] of goodEls) el.setAttribute('d', tickD(byPrice.find((q) => q.id === id), id === selectedId));
    host.setAttribute('aria-valuetext', `${c.name}, ${c.basePrice} credits`);
    host.setAttribute('aria-valuenow', String(c.basePrice));
  }
  function tickD(c, chosen) {
    const x = xOf(c.basePrice);
    const len = chosen ? 22 : 12;
    return `M ${f(x)} ${f(geo.y - 6)} L ${f(x)} ${f(geo.y - 6 - len)}`;
  }

  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (W < 300 || H < 60) { geo = null; return; }
    const x0 = 14;
    const x1 = W - 14;
    const y = Math.round(H * 0.66);
    geo = { W, H, x0, x1, y };
    layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
    layer.textContent = '';
    // the ruler: a band with body, a lit edge, decades as majors with their figures under
    layer.appendChild(svg('path', { d: `M ${x0} ${y} L ${x1} ${y}`, class: 'orr-hi__band', style: 'stroke-width:9px' }));
    layer.appendChild(svg('path', { d: `M ${x0} ${y} L ${x1} ${y}`, class: 'orr-hi__edge', style: 'stroke-width:2px; stroke:rgb(236 230 216 / .62)' }));
    const minor = [];
    const major = [];
    for (let dec = 1; dec <= 10000; dec *= 10) {
      for (let k = 1; k <= 9; k += 1) {
        const p = dec * k;
        if (p < P_MIN || p > P_MAX) continue;
        const x = xOf(p);
        (k === 1 ? major : minor).push(`M ${f(x)} ${f(y + 5)} L ${f(x)} ${f(y + (k === 1 ? 14 : 9))}`);
      }
    }
    layer.appendChild(svg('path', { d: minor.join(' '), class: 'orr-hi__tick' }));
    layer.appendChild(svg('path', { d: major.join(' '), class: 'orr-hi__tick orr-hi__tick--major' }));
    for (const [p, t] of [[10, '10 cr'], [100, '100'], [1000, '1k'], [10000, '10k']]) {
      const tx = svg('text', { x: f(xOf(p)), y: f(y + 30), 'text-anchor': 'middle' });
      tx.textContent = t;
      layer.appendChild(tx);
    }
    // every good, a tick at its base price
    goodEls = new Map();
    const shown = new Set(visible().map((c) => c.id));
    for (const c of byPrice) {
      const p = svg('path', { d: tickD(c, c.id === selectedId), class: 'orr-hscale__good' + (shown.has(c.id) ? '' : ' is-out') + (c.legality === 'contraband' ? ' is-foe' : '') });
      layer.appendChild(p);
      goodEls.set(c.id, p);
    }
    bandBloom = svg('path', { d: '', class: 'orr-hi__lit-bloom', style: 'stroke-width:18px; stroke-linecap:round' });
    bandEl = svg('path', { d: '', class: 'orr-hi__lit', style: 'stroke-width:5px; stroke-linecap:round' });
    beadEl = svg('circle', { r: 6.5, fill: 'rgb(255 253 246)' });
    cursor = svg('path', { d: '', class: 'orr-hscale__cursor' });
    layer.append(bandBloom, bandEl, cursor, beadEl);
    paintChosen();
  }

  const nearest = (clientX) => {
    if (!geo) return null;
    const box = host.getBoundingClientRect();
    const x = clientX - box.left;
    let best = null; let bd = Infinity;
    for (const c of visible()) { const d = Math.abs(xOf(c.basePrice) - x); if (d < bd) { bd = d; best = c; } }
    return best ? { c: best, x } : null;
  };
  const hover = (ev) => {
    const hit = nearest(ev.clientX);
    if (!hit || !geo) return;
    host.classList.add('is-hover');
    const x = xOf(hit.c.basePrice);
    cursor.setAttribute('d', `M ${f(x)} ${f(geo.y - 34)} L ${f(x)} ${f(geo.y + 10)}`);
    ghost.textContent = hit.c.name;
    ghost.style.left = `${f(Math.max(60, Math.min(geo.W - 60, x)))}px`;
    if (dragging && hit.c.id !== selectedId) onPick(hit.c.id);
  };
  const onDown = (ev) => {
    if (ev.button !== 0) return;
    dragging = true;
    try { host.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic events */ }
    const hit = nearest(ev.clientX);
    if (hit && hit.c.id !== selectedId) onPick(hit.c.id);
    hover(ev);
  };
  const onUp = () => { dragging = false; };
  const onLeave = () => { if (!dragging) host.classList.remove('is-hover'); };
  const onKey = (ev) => {
    const list = visible();
    if (!list.length) return;
    let i = list.findIndex((c) => c.id === selectedId);
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') i = Math.min(list.length - 1, i + 1);
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') i = Math.max(0, i - 1);
    else if (ev.key === 'Home') i = 0;
    else if (ev.key === 'End') i = list.length - 1;
    else return;
    ev.preventDefault();
    if (list[i] && list[i].id !== selectedId) onPick(list[i].id);
  };
  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', hover);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', onUp);
  host.addEventListener('pointerleave', onLeave);
  host.addEventListener('keydown', onKey);
  const obs = observe(host, layout);

  return {
    set({ selectedId: id, filter: q } = {}) {
      if (id != null) selectedId = id;
      if (q != null) {
        filter = String(q).trim().toLowerCase();
        const shown = new Set(visible().map((c) => c.id));
        for (const [gid, el] of goodEls) el.classList.toggle('is-out', !shown.has(gid));
      }
      if (geo) paintChosen(); else obs.schedule();
    },
    dispose() {
      obs.stop();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', hover);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('keydown', onKey);
      host.textContent = '';
      host.classList.remove('orr-hscale', 'is-hover');
    },
  };
}

// ================================================================================================
// ORE MIX

/**
 * The six asteroid types stand on a scale across the top (each a body sized by how common it is);
 * the chosen type's ore drops open below as a split ring, each ore its share of the circle as a lit
 * arc with its name on a leader; a beam runs from the chosen type down into the ring.
 * @param {HTMLElement} host
 * @param {{ asteroids: object[], ores: object[], onPickRock: (id:string) => void, onPickOre: (id:string) => void }} o
 */
export function createOreMix(host, { asteroids = [], ores = [], onPickRock = () => {}, onPickOre = () => {} } = {}) {
  const doc = canDraw(host);
  const inert = { set() {}, dispose() {} };
  if (!doc || !asteroids.length) return inert;
  injectOrrery(doc);
  injectStyle(doc);
  const box = doc.createElement('div');
  box.className = 'orr-hmix is-off';
  host.appendChild(box);
  const pool = doc.createElement('i'); pool.className = 'orr-hmix__pool';
  const under = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false' });
  const over = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false', style: 'z-index:2' });
  const centre = doc.createElement('div'); centre.className = 'orr-hmix__centre';
  const cName = doc.createElement('b'); const cSub = doc.createElement('span');
  centre.append(cName, cSub);
  const group = doc.createElement('div');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Asteroid types');
  group.style.cssText = 'position:absolute; inset:0; pointer-events:none;';
  const nameOf = (a) => a.id.replace('ast_', '').replace(/_/g, ' ');
  const maxW = Math.max(...asteroids.map((a) => a.spawnWeight || 1));
  const totalW = asteroids.reduce((s, a) => s + (a.spawnWeight || 0), 0) || 1;
  const rocks = asteroids.map((a, i) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'orr-hmix__rock';
    b.dataset.rock = a.id;
    b.dataset.action = 'help-rock:' + a.id;
    b.style.pointerEvents = 'auto';
    b.setAttribute('aria-label', `${nameOf(a)} asteroids`);
    const nm = doc.createElement('span'); nm.className = 'orr-hmix__rock-name'; nm.textContent = nameOf(a);
    b.appendChild(nm);
    b.addEventListener('click', () => onPickRock(a.id));
    b.addEventListener('keydown', (ev) => {
      const dir = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
      if (!dir) return;
      ev.preventDefault();
      const next = asteroids[(i + dir + asteroids.length) % asteroids.length];
      onPickRock(next.id);
      const nb = rocks.find((r) => r.dataset.rock === next.id);
      if (nb && typeof nb.focus === 'function') nb.focus();
    });
    group.appendChild(b);
    return b;
  });
  const lblLayer = doc.createElement('div');
  lblLayer.style.cssText = 'position:absolute; inset:0; pointer-events:none;';
  box.append(pool, under, over, centre, group, lblLayer);

  let rockId = asteroids[0].id;
  let oreId = null;
  let geo = null;
  let arrived = false;
  let turn = null;
  const spin = createSpring({ value: 0, preset: 'swing', onUpdate: (v) => { if (turn && geo) turn.setAttribute('transform', `rotate(${f(v)} ${f(geo.cx)} ${f(geo.cy)})`); } });

  function layout() {
    const W = box.clientWidth || 0;
    const H = box.clientHeight || 0;
    if (W < 320 || H < 300) { box.classList.add('is-off'); geo = null; return; }
    box.classList.remove('is-off');
    const small = W < 620 || H < 470;
    // the scale of rock types across the top
    const sy = small ? 40 : 52;
    const sx0 = Math.max(46, W * 0.09);
    const sx1 = W - sx0;
    const top = sy + (small ? 50 : 70);
    const R = Math.max(80, Math.min((H - top) * 0.36, (W - (small ? 240 : 340)) / 2));
    const cx = W / 2;
    const cy = top + (H - top) / 2;
    const bandW = small ? 16 : 24;
    geo = { W, H, R, cx, cy, bandW, small, sy, sx0, sx1 };
    under.setAttribute('viewBox', `0 0 ${W} ${H}`);
    over.setAttribute('viewBox', `0 0 ${W} ${H}`);
    under.textContent = '';
    const arriveNow = !arrived && !reducedMotion();
    const pd = R * 3.4;
    Object.assign(pool.style, { left: `${f(cx - pd / 2)}px`, top: `${f(cy - pd / 2)}px`, width: `${f(pd)}px`, height: `${f(pd)}px` });
    const g = svg('g', {});
    // the scale: a band with body and a ruler of ticks under it
    g.appendChild(svg('path', { d: `M ${f(sx0 - 24)} ${sy} L ${f(sx1 + 24)} ${sy}`, class: 'orr-hi__band', style: 'stroke-width:9px' }));
    g.appendChild(svg('path', { d: `M ${f(sx0 - 24)} ${sy} L ${f(sx1 + 24)} ${sy}`, class: 'orr-hi__edge', style: 'stroke-width:2px; stroke:rgb(236 230 216 / .6)' }));
    const minor = [];
    for (let k = 0; k <= 50; k += 1) {
      const x = sx0 - 24 + ((sx1 - sx0 + 48) * k) / 50;
      minor.push(`M ${f(x)} ${f(sy - 4.5)} L ${f(x)} ${f(sy + 4.5)}`);
    }
    g.appendChild(svg('path', { d: minor.join(' '), class: 'orr-hi__notch' }));
    // the mix ring's track and the scales round it
    g.appendChild(svg('path', { d: arcD(cx, cy, R, 0, 360), class: 'orr-hi__band', style: `stroke-width:${bandW}px; --orr-band-a:.12` }));
    const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${f(cx)}px ${f(cy)}px; --orr-drift-s:900s` });
    drift.appendChild(svg('path', { d: ticksD(cx, cy, R - bandW / 2 - 10, 72, { len: 3, major: 6, majorLen: 8, inward: true }), class: 'orr-hi__tick', style: 'stroke:rgb(236 230 216 / .32)' }));
    drift.appendChild(svg('path', { d: ticksD(cx, cy, R + bandW / 2 + 10, 120, { len: 3, major: 10, majorLen: 7, inward: false }), class: 'orr-hi__tick', style: 'stroke:rgb(236 230 216 / .28)' }));
    g.appendChild(drift);
    under.appendChild(rise(g, 0, arriveNow));
    asteroids.forEach((a, i) => {
      const x = asteroids.length > 1 ? sx0 + ((sx1 - sx0) * i) / (asteroids.length - 1) : cx;
      const size = Math.round((small ? 16 : 20) + (small ? 12 : 18) * Math.sqrt((a.spawnWeight || 1) / maxW));
      const b = rocks[i];
      Object.assign(b.style, { left: `${f(x - size / 2)}px`, top: `${f(sy - size / 2)}px`, width: `${size}px`, height: `${size}px` });
      b.dataset.x = String(x);
      b.dataset.size = String(size);
      // names alternate below and above the scale so neighbours never touch
      b.classList.toggle('is-above', i % 2 === 1);
      rise(b, 120 + i * 50, arriveNow);
    });
    centre.style.left = `${f(cx)}px`;
    centre.style.top = `${f(cy)}px`;
    centre.style.maxWidth = `${f(R * 1.5)}px`;
    arrived = true;
    paintMix(false);
  }

  function paintMix(swing) {
    if (!geo) return;
    const { cx, cy, R, bandW, W, sy } = geo;
    const rock = asteroids.find((a) => a.id === rockId) || asteroids[0];
    rocks.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rock === rock.id)));
    cName.textContent = nameOf(rock);
    cSub.textContent = `${Math.round((100 * (rock.spawnWeight || 0)) / totalW)}% of rocks · cap T${rock.tierCap}`;
    over.textContent = '';
    lblLayer.textContent = '';
    // a beam from the chosen type on the scale down into the ring
    const rb = rocks.find((b) => b.dataset.rock === rock.id);
    const rx = rb ? Number(rb.dataset.x) : cx;
    const rs = rb ? Number(rb.dataset.size) : 20;
    const y0 = sy + rs / 2 + 30;
    const y1 = cy - R - bandW / 2 - 16;
    const d = `M ${f(rx)} ${f(y0)} C ${f(rx)} ${f((y0 + y1) / 2)}, ${f(cx)} ${f((y0 + y1) / 2)}, ${f(cx)} ${f(y1)}`;
    over.appendChild(svg('path', { d, class: 'orr-hi__beam-band' }));
    over.appendChild(svg('path', { d, class: 'orr-hi__beam' }));
    over.appendChild(svg('path', { d, class: 'orr-hi__pulse-bloom', pathLength: 1 }));
    over.appendChild(svg('path', { d, class: 'orr-hi__pulse', pathLength: 1 }));
    over.appendChild(svg('circle', { cx: f(cx), cy: f(y1), r: 3.5, fill: 'rgb(236 247 255)' }));
    // the split ring: each ore its share of the circle, a band with ticks cut through, a gap between
    turn = svg('g', {});
    over.appendChild(turn);
    const entries = Object.entries(rock.oreTable || {}).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, w]) => s + w, 0) || 1;
    let at = 0;
    const gap = 3;
    const placed = [];
    entries.forEach(([id, w], k) => {
      const sweep = (360 * w) / total;
      const a0 = at + gap / 2;
      const a1 = at + sweep - gap / 2;
      const chosen = id === oreId;
      const dd = arcD(cx, cy, R, a0, a1);
      turn.appendChild(svg('path', { d: dd, class: 'orr-hi__band', style: `stroke-width:${bandW}px; --orr-band-a:${chosen ? 0.7 : k % 2 ? 0.3 : 0.44}` }));
      turn.appendChild(svg('path', { d: ticksD(cx, cy, R + bandW / 2, Math.max(2, Math.round(sweep / 5)), { len: bandW, inward: true, from: a0, to: a1 }), class: 'orr-hi__notch' }));
      if (chosen) {
        turn.appendChild(svg('path', { d: dd, class: 'orr-hi__lit-bloom', style: `stroke-width:${bandW + 12}px` }));
        turn.appendChild(svg('path', { d: dd, class: 'orr-hi__lit', style: `stroke-width:${Math.round(bandW * 0.4)}px` }));
      }
      placed.push({ id, w, mid: at + sweep / 2, chosen });
      at += sweep;
    });
    // each share's ore on a leader outside the ring, left or right, never on top of another
    const rows = { L: [], R: [] };
    placed.forEach((p) => { const a = ((p.mid % 360) + 360) % 360; (a > 180 ? rows.L : rows.R).push({ ...p, a }); });
    for (const [side, list] of Object.entries(rows)) {
      list.sort((a, b) => polar(cx, cy, R, a.mid)[1] - polar(cx, cy, R, b.mid)[1]);
      let lastY = -Infinity;
      list.forEach((p) => {
        const ore = ores.find((o) => o.id === p.id);
        const [x0, y0e] = polar(cx, cy, R + bandW / 2 + 2, p.mid);
        const [x1, y1e] = polar(cx, cy, R + bandW / 2 + (geo.small ? 22 : 34), p.mid);
        const ly = Math.max(y1e, lastY + (geo.small ? 38 : 46));
        lastY = ly;
        const left = side === 'L';
        const x2 = left ? Math.min(x1, cx - R - bandW) - 24 : Math.max(x1, cx + R + bandW) + 24;
        over.appendChild(svg('path', { d: `M ${f(x0)} ${f(y0e)} L ${f(x1)} ${f(y1e)} L ${f(x1)} ${f(ly)} L ${f(x2)} ${f(ly)}`, fill: 'none', stroke: p.chosen ? 'rgb(255 255 255)' : `rgb(${BONE} / .66)`, 'stroke-width': p.chosen ? 2.2 : 1.6, 'stroke-linejoin': 'round' }));
        const lbl = doc.createElement('button');
        lbl.type = 'button';
        lbl.className = 'orr-hmix__lbl' + (left ? ' is-left' : '') + (p.chosen ? ' is-chosen' : '');
        lbl.dataset.action = 'help-ore:' + p.id;
        lbl.style.pointerEvents = 'auto';
        const nm = doc.createElement('span'); nm.className = 'orr-hmix__lbl-name'; nm.textContent = ore ? ore.name : p.id;
        const pc = doc.createElement('span'); pc.className = 'orr-hmix__lbl-pc'; pc.textContent = `${Math.round(p.w * 100)}% of the yield`;
        lbl.append(nm, pc);
        lbl.style.top = `${f(ly)}px`;
        lbl.style.transform = 'translateY(-50%)';
        if (left) lbl.style.right = `${f(W - x2 + 8)}px`; else lbl.style.left = `${f(x2 + 8)}px`;
        lbl.addEventListener('click', () => onPickOre(p.id));
        lblLayer.appendChild(lbl);
      });
    }
    if (swing && !reducedMotion()) { spin.set(-28, { instant: true }); spin.set(0); } else spin.set(0, { instant: true });
  }

  const obs = observe(box, layout);
  return {
    set({ rockId: r, oreId: o, swing = false } = {}) {
      if (r) rockId = r;
      oreId = o || null;
      if (geo) paintMix(swing); else obs.schedule();
    },
    dispose() {
      obs.stop();
      spin.stop();
      box.remove();
    },
  };
}

// ================================================================================================
// GOOD TOKEN: the chosen good's pictogram as an object of light in a gripped ring

/** @param {HTMLElement} host */
export function createGoodToken(host, { glyph = () => '' } = {}) {
  const doc = canDraw(host);
  const inert = { set() {}, dispose() {} };
  if (!doc) return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-htoken');
  const layer = svg('svg', { class: 'orr-hi-svg', 'aria-hidden': 'true', focusable: 'false' });
  const pict = doc.createElement('div'); pict.className = 'orr-htoken__glyph'; pict.setAttribute('aria-hidden', 'true');
  const word = doc.createElement('span'); word.className = 'orr-htoken__word';
  host.append(layer, pict, word);
  let data = null;
  let arrived = false;
  function layout() {
    const W = host.clientWidth || 0;
    const H = host.clientHeight || 0;
    if (!data || W < 160 || H < 160) { layer.textContent = ''; return; }
    const R = Math.min(W, H) * 0.36;
    const cx = W / 2;
    const cy = H / 2;
    layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
    layer.textContent = '';
    const g = svg('g', { class: !arrived && !reducedMotion() ? 'orr-spin-in' : '', style: `transform-origin:${f(cx)}px ${f(cy)}px` });
    bandRing(g, cx, cy, R, Math.max(12, R * 0.08), { a: 0.27, notches: 60 });
    g.appendChild(svg('path', { d: arcD(cx, cy, R * 0.72, 0, 360), class: 'orr-hi__edge', style: 'stroke:rgb(236 230 216 / .3)' }));
    const drift = svg('g', { class: 'orr-drift', style: `transform-origin:${f(cx)}px ${f(cy)}px; --orr-drift-s:700s` });
    drift.appendChild(svg('path', { d: ticksD(cx, cy, R + Math.max(12, R * 0.08) / 2 + 14, 90, { len: 3, major: 15, majorLen: 8, inward: true }), class: 'orr-hi__tick', style: 'stroke:rgb(236 230 216 / .32)' }));
    g.appendChild(drift);
    // the good's swing as a lit arc on the ring: its volatility, both ways from the top
    const vol = Math.max(0.04, Number(data.volatility) || 0.1);
    const sweep = Math.min(170, vol * 360);
    const bw = Math.max(12, R * 0.08);
    g.appendChild(svg('path', { d: arcD(cx, cy, R, -sweep / 2, sweep / 2), class: 'orr-hi__lit-bloom', style: `stroke-width:${bw + 10}px` }));
    g.appendChild(svg('path', { d: arcD(cx, cy, R, -sweep / 2, sweep / 2), class: 'orr-hi__lit', style: `stroke-width:${Math.round(bw * 0.42)}px` }));
    layer.appendChild(g);
    const gs = R * 0.9;
    Object.assign(pict.style, { left: `${f(cx - gs / 2)}px`, top: `${f(cy - gs / 2)}px`, width: `${f(gs)}px`, height: `${f(gs)}px` });
    word.style.left = `${f(cx)}px`;
    word.style.top = `${f(cy + R + bw / 2 + 30)}px`;
    arrived = true;
  }
  const obs = observe(host, layout);
  return {
    set(next) {
      data = next ? { ...next } : null;
      pict.innerHTML = data ? glyph(data.category) : '';
      pict.classList.toggle('is-foe', !!(data && data.legality === 'contraband'));
      word.textContent = data ? `swing ±${Math.round((Number(data.volatility) || 0) * 100)}%` : '';
      obs.schedule();
    },
    dispose() { obs.stop(); host.textContent = ''; host.classList.remove('orr-htoken'); },
  };
}

void onFrame;
