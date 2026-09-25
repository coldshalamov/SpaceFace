// src/ui/orrery/lampKey.js — the Lamp Key (design/frontend/ORRERY.md §3.6, §4 #10): the one primary
// verb on a screen. An amber field with dark ink and one 45-degree cut at the top right, a slow sheen
// that crosses it, a ripple on press; and for an irreversible verb the Hold: a line of the Hand's
// light that traces the key's own silhouette while the key is held — out from the cut, down the
// right edge, along the foot, up the left edge and back across the top — with a bright bead at its
// head, and a short red segment before the cut where the verb commits. Let go early and it empties.
// The line reads the hold from `--sf-hold-p` (0..1), which src/ui/kit/holdVerb.js clocks on the
// `span.dp-holdring` it appends; this module puts the drawing inside that span.
//
// A screen dresses its existing button; the word, the handlers and the attributes stay its own.
// The station's one Lamp Key is the tab's commit verb (Accept, Trade, Buy); Undock stays a word.

import { injectOrrery } from './tokens.js';

export const LAMPKEY_STYLE_ID = 'orr-lampkey-style';
const BONE = '236 230 216';
const SVG_NS = 'http://www.w3.org/2000/svg';
/** the hold line runs this far outside the field, so it stands on the glass and not on the amber */
const RING_OUT = 9;
/** the field's cut, in px (matches the clip-path below) */
const CUT = 13;
/** the last stretch of the perimeter before the cut, where the hold commits */
const COMMIT_LEN = 40;

const CSS = `
.orr-lampkey { position:relative; display:inline-flex !important; align-items:center; gap:0; min-height:44px !important; height:auto !important;
  padding:0 26px 0 20px !important; margin:0; border:0 !important; border-radius:0 !important; background:none !important; box-shadow:none !important; clip-path:none !important;
  color:#1c1406 !important; cursor:pointer; overflow:visible !important; isolation:isolate; text-shadow:none !important;
  font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125% !important; font-variation-settings:"wdth" 125, "wght" 800 !important; font-weight:800 !important;
  font-size:15px !important; letter-spacing:.14em !important; text-transform:uppercase; line-height:1 !important; }
.orr-lampkey::before { content:"" !important; position:absolute !important; z-index:-1; inset:0 !important; display:block !important; width:auto !important; height:auto !important; margin:0 !important;
  background:var(--dp-hand, #f2b950) !important; clip-path:polygon(0 0, calc(100% - ${CUT}px) 0, 100% ${CUT}px, 100% 100%, 0 100%) !important; box-shadow:none !important; border:0 !important;
  transition:background .16s linear; }
/* the sheen: a band of light crossing the field every six seconds */
.orr-lampkey::after { content:"" !important; position:absolute !important; z-index:-1; inset:0 !important; display:block !important; pointer-events:none;
  clip-path:polygon(0 0, calc(100% - ${CUT}px) 0, 100% ${CUT}px, 100% 100%, 0 100%) !important; border:0 !important; box-shadow:none !important;
  background:linear-gradient(112deg, transparent 38%, rgb(255 250 236 / .42) 50%, transparent 62%) !important; background-size:60% 100% !important; background-repeat:no-repeat !important;
  background-position:-80% 0 !important; animation:orr-lampkey-sheen 6s linear infinite; }
@keyframes orr-lampkey-sheen { 0% { background-position:-80% 0; } 22% { background-position:180% 0; } 100% { background-position:180% 0; } }
.orr-lampkey > .orr-lampkey__word { position:relative; z-index:1; }
.orr-lampkey:not(:disabled):is(:hover, :focus-visible)::before { background:var(--dp-hand-hot, #ffd98c) !important; }
.orr-lampkey:focus-visible { outline:1px solid rgb(255 217 140 / .9) !important; outline-offset:4px !important; }
.orr-lampkey:not(:disabled):active, .orr-lampkey.is-holding { transform:translateY(1px); }
/* the key being charged stays the brightest filled shape; the travelling light is bigger than the field's edge */
.orr-lampkey.is-holding::before { background:var(--dp-hand-hot, #ffd98c) !important; }
.orr-lampkey:disabled { cursor:default; color:rgb(${BONE} / .5) !important; opacity:1 !important; filter:none !important; }
/* a disabled key is its silhouette alone: the field's cut shape as a 1px bone outline (the overlay hollows it), the verb in dim ink */
.orr-lampkey:disabled::before { background:transparent !important; background-image:none !important; box-shadow:none !important; }
.orr-lampkey__rim { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; display:none; z-index:1; }
.orr-lampkey__rim path { fill:none; stroke:rgb(${BONE} / .5); stroke-width:1; stroke-linejoin:miter; }
.orr-lampkey:disabled .orr-lampkey__rim { display:block; }
.orr-lampkey:disabled .orr-lampkey__track { stroke:rgb(${BONE} / .34); }
.orr-lampkey:disabled .orr-lampkey__commit, .orr-lampkey:disabled .orr-lampkey__commit-bloom, .orr-lampkey:disabled .orr-lampkey__fill, .orr-lampkey:disabled .orr-lampkey__fillbloom { display:none; }
.orr-lampkey:disabled::after { display:none !important; inset:1px !important; animation:none !important; background:rgb(6 8 11 / .92) !important; background-size:auto !important;
  clip-path:polygon(0 0, calc(100% - ${CUT - 0.4}px) 0, 100% ${CUT - 0.4}px, 100% 100%, 0 100%) !important; }
/* the hold: the ring span becomes a drawing laid over the key's silhouette, a little outside the field */
.orr-lampkey[data-hold] { margin-left:0 !important; margin-right:0 !important; }
.orr-lampkey .dp-holdring { position:absolute !important; left:${-RING_OUT}px !important; right:auto !important; top:${-RING_OUT}px !important; width:calc(100% + ${RING_OUT * 2}px) !important;
  height:calc(100% + ${RING_OUT * 2}px) !important; margin:0 !important; display:block !important; border-radius:0 !important; vertical-align:baseline !important; flex:none !important;
  background:none !important; -webkit-mask:none !important; mask:none !important; pointer-events:none; overflow:visible; z-index:2; }
.orr-lampkey .dp-holdring::before, .orr-lampkey .dp-holdring::after { display:none !important; content:none !important; }
.orr-lampkey .dp-holdring > svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; display:block; }
/* at rest a faint track says "hold"; the fill is the Hand's light, its bloom under it; the commit segment is red */
.orr-lampkey .orr-lampkey__track { fill:none; stroke:rgb(${BONE} / .5); stroke-width:1; }
.orr-lampkey .orr-lampkey__commit { fill:none; stroke:var(--dp-hand-hot, #ffd98c); stroke-width:2; }
.orr-lampkey .orr-lampkey__commit-bloom { fill:none; stroke:var(--dp-hand-hot, #ffd98c); stroke-width:8; opacity:.28; }
.orr-lampkey .orr-lampkey__fillbloom, .orr-lampkey .orr-lampkey__fill { fill:none; stroke:var(--dp-hand-hot, #ffd98c); stroke-linecap:round;
  stroke-dasharray:100; stroke-dashoffset:calc(100 - var(--sf-hold-p, 0) * 100); }
.orr-lampkey .orr-lampkey__fill { stroke-width:3; }
.orr-lampkey .orr-lampkey__fillbloom { stroke-width:11; opacity:.36; }
/* the bead rides the same silhouette, ahead of the fill */
.orr-lampkey .dp-holdring > .orr-lampkey__bead { position:absolute; left:0; top:0; width:10px; height:10px; margin:-5px 0 0 -5px; border-radius:50%; pointer-events:none;
  background:var(--dp-hand-hot, #ffd98c); box-shadow:0 0 10px 3px rgb(255 217 140 / .7);
  offset-path:var(--orr-hold-path); offset-distance:calc(var(--sf-hold-p, 0) * 100%); offset-rotate:0deg; opacity:0; transition:opacity .12s linear; }
.orr-lampkey.is-holding .orr-lampkey__bead { opacity:1; }
/* the word under the key's left edge */
.orr-lampkey .orr-lampkey__note { position:absolute; left:100%; right:auto; top:50%; transform:translateY(-50%); margin:0 0 0 18px; width:auto; text-align:left; pointer-events:none;
  font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:rgb(${BONE} / .62); white-space:nowrap; }
.orr-lampkey.orr-lampkey--small { min-height:38px !important; font-size:13.5px !important; }
.orr-lampkey.orr-lampkey--small .orr-lampkey__note { margin-left:14px; font-size:10px; }
html.sf-reduce-motion .orr-lampkey::after { animation:none; }
`;

export function injectLampKey(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(LAMPKEY_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = LAMPKEY_STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/** The key's silhouette in the ring's own box (which stands RING_OUT outside the field on every side). */
/** The key's own silhouette on the half-pixel grid, for the rim a disabled key shows. */
export function rimPathD(width, height, edges = null) {
  const W = Math.max(1, width); const H = Math.max(1, height); const c = CUT;
  const q = (n) => Math.round(n * 100) / 100;
  // edges: the straight edges' centre lines in the key's own box (each on a device pixel's centre); by default a 0.75 inset
  const l = edges ? edges.l : 0.75; const t = edges ? edges.t : 0.75;
  const r = edges ? edges.r : W - 0.75; const b = edges ? edges.b : H - 0.75;
  return `M ${q(r - c)} ${q(t)} L ${q(r)} ${q(t + c)} L ${q(r)} ${q(b)} L ${q(l)} ${q(b)} L ${q(l)} ${q(t)} Z`;
}

function layoutRim(button) {
  const rim = button.querySelector && button.querySelector(':scope > .orr-lampkey__rim');
  if (!rim || typeof button.getBoundingClientRect !== 'function') return;
  const r = button.getBoundingClientRect();
  if (!(r.width > 0) || !(r.height > 0)) return;
  // the rim draws in CSS px (viewBox = the box), each straight edge on the centre of the first whole pixel inside the
  // box, so a key at a fractional position still lights one row or column per edge, like its cut
  const W = r.width; const H = r.height;
  rim.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const edges = { l: Math.ceil(r.left) + 0.5 - r.left, t: Math.ceil(r.top) + 0.5 - r.top, r: Math.floor(r.right - 0.5) + 0.5 - r.left, b: Math.floor(r.bottom - 0.5) + 0.5 - r.top };
  const path = rim.querySelector('path');
  if (path) path.setAttribute('d', rimPathD(W, H, edges));
}

export function holdPathD(width, height) {
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const c = CUT + RING_OUT;
  // starts at the cut corner and runs clockwise (right edge, foot, left edge, top, the cut), on the half-pixel
  // grid so a 1px track reads as one row
  return `M ${W - 0.5} ${c + 0.5} L ${W - 0.5} ${H - 0.5} L 0.5 ${H - 0.5} L 0.5 0.5 L ${W - c + 0.5} 0.5 Z`;
}

function svgEl(doc, name, attrs) {
  const el = doc.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Lay the hold drawing over the key's current box. Re-run whenever the key's size changes. */
function layoutHold(button, ring) {
  if (!button || !ring || typeof button.getBoundingClientRect !== 'function') return;
  const r = button.getBoundingClientRect();
  if (!(r.width > 0) || !(r.height > 0)) return;
  const W = Math.round(r.width + RING_OUT * 2);
  const H = Math.round(r.height + RING_OUT * 2);
  const d = holdPathD(W, H);
  const svg = ring.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    for (const p of svg.querySelectorAll('.orr-lampkey__track, .orr-lampkey__fillbloom, .orr-lampkey__fill')) p.setAttribute('d', d);
    const c = CUT + RING_OUT;
    for (const commit of svg.querySelectorAll('.orr-lampkey__commit, .orr-lampkey__commit-bloom')) commit.setAttribute('d', `M ${Math.max(0, W - c - COMMIT_LEN)} 0.5 L ${W - c + 0.5} 0.5`);
  }
  if (ring.style && typeof ring.style.setProperty === 'function') ring.style.setProperty('--orr-hold-path', `path("${d}")`);
}

/**
 * Dress a screen's own button as the Lamp Key. With `hold`, the button carries `data-hold` and its
 * `.dp-holdring` (from attachHoldVerb) becomes the hold drawing round the key; `note` is the word
 * under the key. The fill and the bead read `--sf-hold-p` from the ring, so the caller's hold
 * clock drives both.
 */
export function dressLampKey(button, { hold = false, note = '' } = {}) {
  if (!button || typeof button.classList !== 'object') return button;
  const doc = button.ownerDocument || globalThis.document;
  injectLampKey(doc);
  button.classList.add('orr-lampkey');
  if (!button.querySelector || !button.querySelector('.orr-lampkey__word')) {
    // wrap the loose word so it can stand above the field
    const word = doc.createElement('span');
    word.className = 'orr-lampkey__word';
    const first = [...button.childNodes].find((n) => n.nodeType === 3 ? n.textContent.trim() : (n.nodeType === 1 && !n.classList.contains('dp-holdring')));
    if (first) { button.insertBefore(word, first); word.appendChild(first); }
  }
  // the rim: the silhouette a disabled key shows instead of a field (drawn along the cut, which a box shadow cannot follow)
  if (button.querySelector && !button.querySelector(':scope > .orr-lampkey__rim') && typeof doc.createElementNS === 'function') {
    const rim = svgEl(doc, 'svg', { class: 'orr-lampkey__rim', 'aria-hidden': 'true', focusable: 'false', viewBox: '0 0 100 40' });
    rim.appendChild(svgEl(doc, 'path', { d: rimPathD(100, 40), 'vector-effect': 'non-scaling-stroke' }));
    button.appendChild(rim);
    layoutRim(button);
    if (typeof ResizeObserver === 'function') { try { new ResizeObserver(() => layoutRim(button)).observe(button); } catch (_) { /* no observer, no resize */ } }
  }
  if (hold) {
    button.setAttribute('data-hold', '1');
    const ring = button.querySelector && button.querySelector('.dp-holdring');
    if (ring && !ring.querySelector('svg') && typeof doc.createElementNS === 'function') {
      const svg = svgEl(doc, 'svg', { 'aria-hidden': 'true', focusable: 'false', viewBox: '0 0 100 40' });
      svg.append(
        svgEl(doc, 'path', { class: 'orr-lampkey__track', d: holdPathD(100, 40), 'vector-effect': 'non-scaling-stroke' }),
        svgEl(doc, 'path', { class: 'orr-lampkey__commit-bloom', d: 'M 0 0 L 0 0', 'vector-effect': 'non-scaling-stroke' }),
        svgEl(doc, 'path', { class: 'orr-lampkey__commit', d: 'M 0 0 L 0 0', 'vector-effect': 'non-scaling-stroke' }),
        svgEl(doc, 'path', { class: 'orr-lampkey__fillbloom', d: holdPathD(100, 40), pathLength: 100, 'vector-effect': 'non-scaling-stroke' }),
        svgEl(doc, 'path', { class: 'orr-lampkey__fill', d: holdPathD(100, 40), pathLength: 100, 'vector-effect': 'non-scaling-stroke' }),
      );
      ring.appendChild(svg);
      const bead = doc.createElement('span');
      bead.className = 'orr-lampkey__bead';
      bead.setAttribute('aria-hidden', 'true');
      ring.appendChild(bead);
      layoutHold(button, ring);
      const raf = globalThis.requestAnimationFrame;
      if (typeof raf === 'function') raf(() => layoutHold(button, ring));
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(() => layoutHold(button, ring));
        ro.observe(button);
      }
    }
    if (note && button.querySelector && !button.querySelector('.orr-lampkey__note')) {
      const n = doc.createElement('span');
      n.className = 'orr-lampkey__note';
      n.setAttribute('aria-hidden', 'true');
      n.textContent = note;
      button.appendChild(n);
    }
  }
  return button;
}
