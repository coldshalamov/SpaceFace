// src/ui/orrery/waveform.js — the Waveform (design/frontend/ORRERY.md §4 #30): voice bars on a comms
// line, breathing with it. A row of thin bars of light; at rest they breathe slowly at a low height;
// while a line is spoken they rise and fall in a spread of rhythms and settle again when it ends.
// Every bar is a CSS animation on the compositor (transform only); under reduced motion the bars
// stand still at their rest height. The rest heights are an envelope of the line itself (vowels
// high, consonants mid, spaces low, both ends tapered), so a still frame reads as a voice trace and
// never as a dotted rule under the name.

import { injectOrrery } from './tokens.js';
import { reducedMotion } from './motion.js';
import { svg, arcD, polar } from './svg.js';

const STYLE_ID = 'orr-waveform-style';
let sweepSeq = 0;
const BONE = '236 230 216';

const CSS = `
.orr-wave { display:flex; align-items:center; gap:3px; height:22px; }
.orr-wave__bar { display:block; width:2px; height:100%; border-radius:1px; background:rgb(${BONE} / .62); transform-origin:50% 50%;
  transform:scaleY(var(--orr-wave-rest, .18)); animation:orr-wave-breathe var(--orr-wave-d, 2.6s) ease-in-out var(--orr-wave-delay, 0s) infinite alternate; }
.orr-wave.is-speaking .orr-wave__bar { background:rgb(248 244 234); animation:orr-wave-speak var(--orr-wave-sd, .42s) ease-in-out var(--orr-wave-delay, 0s) infinite alternate; }
@keyframes orr-wave-breathe { from { transform:scaleY(var(--orr-wave-rest, .18)); } to { transform:scaleY(calc(var(--orr-wave-rest, .18) * 1.18 + .03)); } }
@keyframes orr-wave-speak { from { transform:scaleY(var(--orr-wave-lo, .2)); } to { transform:scaleY(var(--orr-wave-hi, 1)); } }
html.sf-reduce-motion .orr-wave__bar, html.sf-reduce-motion .orr-wave.is-speaking .orr-wave__bar { animation:none; transform:scaleY(var(--orr-wave-rest, .18)); }
/* the voice arc: bars of light radiating from an open arc round a face, breathing as a whole */
.orr-voicearc { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:2; }
/* weight, not wire: the voice stands on a luminous band with a crisp edge; its bars are 2.6px of light */
.orr-voicearc .orr-voicearc__band { --orr-w-band:7px; --orr-band-a:.34; stroke-linecap:butt; }
.orr-voicearc .orr-voicearc__track { --orr-w-edge:1.5px; --orr-edge-a:.52; stroke-linecap:butt; }
.orr-voicearc .orr-voicearc__bloom { fill:none; stroke:rgb(${BONE}); stroke-width:7; opacity:.12; stroke-linecap:butt; }
.orr-voicearc .orr-voicearc__bars { fill:none; stroke:rgb(${BONE} / .56); stroke-width:2.6; stroke-linecap:butt; transform-box:fill-box; transform-origin:center; animation:orr-voicearc-breathe 3.2s ease-in-out infinite alternate; }
.orr-voicearc .orr-voicearc__leader { fill:none; stroke:rgb(${BONE} / .45); stroke-width:1.5; stroke-linejoin:miter; }
.orr-voicearc .orr-voicearc__foot { fill:rgb(${BONE} / .7); }
/* the contact's standing: a tick past the voice's foot, leaning warm or cold with the reply in focus */
.orr-voicearc .orr-voicearc__stand-bloom { fill:none; stroke:rgb(${BONE} / .1); stroke-width:6px; stroke-linecap:butt; }
.orr-voicearc .orr-voicearc__stand-tick { fill:none; stroke:rgb(${BONE} / .6); stroke-width:2.2px; stroke-linecap:butt; }
.orr-voicearc .orr-voicearc__standing.is-warm .orr-voicearc__stand-tick { stroke:rgb(255 240 214); }
.orr-voicearc .orr-voicearc__standing.is-warm .orr-voicearc__stand-bloom { stroke:rgb(255 240 214 / .22); }
.orr-voicearc .orr-voicearc__standing.is-cold .orr-voicearc__stand-tick { stroke:rgb(143 203 255); }
.orr-voicearc .orr-voicearc__standing.is-cold .orr-voicearc__stand-bloom { stroke:rgb(143 203 255 / .22); }
@keyframes orr-voicearc-breathe { from { opacity:.82; } to { opacity:1; } }
html.sf-reduce-motion .orr-voicearc .orr-voicearc__bars { animation:none; opacity:1; }
.orr-voicearc .orr-voicearc__sweep { fill:none; stroke:#fff; stroke-width:96; stroke-linecap:butt; stroke-dasharray:1 1; stroke-dashoffset:-1; animation:orr-voicearc-sweep 1s linear forwards; }
@keyframes orr-voicearc-sweep { from { stroke-dashoffset:-1; } to { stroke-dashoffset:0; } }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/**
 * The rest envelope of a spoken line, resampled to `bars` heights in 0..1: a syllable-ish rhythm
 * (vowels peak, consonants carry, spaces and stops fall) smoothed over three taps and tapered at
 * both ends. Deterministic: the same line always draws the same trace.
 * @param {string} text
 * @param {number} bars
 * @returns {number[]}
 */
export function voiceEnvelope(text, bars) {
  const n = Math.max(1, bars | 0);
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return Array.from({ length: n }, (_, i) => 0.22 + 0.18 * Math.sin((i + 0.5) / n * Math.PI));
  const raw = [];
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === ' ') raw.push(0.08);
    else if (/[.,;:!?…—-]/.test(ch)) raw.push(0.04);
    else if (/[aeiouyAEIOUY]/.test(ch)) raw.push(0.78 + 0.22 * (((i * 7919) % 13) / 12));
    else raw.push(0.34 + 0.16 * (((i * 104729) % 11) / 10));
  }
  const out = [];
  for (let b = 0; b < n; b += 1) {
    const p = (b + 0.5) / n * raw.length;
    let acc = 0; let wsum = 0;
    for (let k = Math.floor(p - 2); k <= Math.ceil(p + 2); k += 1) {
      if (k < 0 || k >= raw.length) continue;
      const w = 1 - Math.abs(k + 0.5 - p) / 2.5;
      if (w > 0) { acc += raw[k] * w; wsum += w; }
    }
    const v = wsum ? acc / wsum : 0.2;
    const taper = Math.min(1, Math.min(b + 1, n - b) / 3);
    out.push(Math.max(0.06, Math.min(1, v * taper)));
  }
  return out;
}

/**
 * @param {HTMLElement} host
 * @param {{ bars?: number, envelope?: number[] }} [opts] envelope: rest heights in 0..1 per bar
 *   (see voiceEnvelope); without one the bars rest on a low bell.
 */
export function createWaveform(host, { bars = 28, envelope = null } = {}) {
  const doc = host && host.ownerDocument ? host.ownerDocument : globalThis.document;
  const inert = { el: host, speak() {}, idle() {}, dispose() {} };
  if (!host || !doc || typeof doc.createElement !== 'function') return inert;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-wave');
  host.setAttribute('aria-hidden', 'true');
  host.textContent = '';
  // cosmetic randomness only: the sim's rng is never touched by presentation
  for (let i = 0; i < bars; i += 1) {
    const bar = doc.createElement('i');
    bar.className = 'orr-wave__bar';
    const centre = 1 - Math.abs((i - (bars - 1) / 2) / ((bars - 1) / 2));
    const env = envelope && Number.isFinite(envelope[i]) ? Math.max(0, Math.min(1, envelope[i])) : null;
    // 2..14px of a 24px line at rest: a real envelope, tapered at the ends; the breathe adds to it
    bar.style.setProperty('--orr-wave-rest', env === null ? (0.12 + centre * 0.16 + Math.random() * 0.06).toFixed(2) : (0.14 + env * 0.68).toFixed(2));
    bar.style.setProperty('--orr-wave-d', `${(2.2 + Math.random() * 1.6).toFixed(2)}s`);
    bar.style.setProperty('--orr-wave-sd', `${(0.28 + Math.random() * 0.3).toFixed(2)}s`);
    bar.style.setProperty('--orr-wave-delay', `${(-Math.random() * 2).toFixed(2)}s`);
    bar.style.setProperty('--orr-wave-lo', (0.15 + Math.random() * 0.2).toFixed(2));
    bar.style.setProperty('--orr-wave-hi', (0.45 + centre * 0.5 + Math.random() * 0.15).toFixed(2));
    host.appendChild(bar);
  }
  let timer = 0;
  return {
    el: host,
    /** The line is being spoken for `ms` (0 = until idle() is called). */
    speak(ms = 0) {
      if (reducedMotion()) return;
      host.classList.add('is-speaking');
      if (timer) clearTimeout(timer);
      timer = ms > 0 ? setTimeout(() => { host.classList.remove('is-speaking'); timer = 0; }, ms) : 0;
    },
    idle() { host.classList.remove('is-speaking'); if (timer) { clearTimeout(timer); timer = 0; } },
    dispose() { if (timer) clearTimeout(timer); host.classList.remove('orr-wave', 'is-speaking'); host.textContent = ''; },
  };
}

/**
 * A line's phrasing as bar lengths (0..28 px at full scale), one per bar: the bars are shared among the words by their
 * length; each word is a hump (a sine over the word, scaled by a seed from its characters), each word boundary drops to
 * a whisper (4), and a full stop rests for three bars (0). Deterministic: the same line always draws the same voice.
 * @param {string} text
 * @param {number} n
 * @returns {number[]}
 */
export function voicePhrases(text, n) {
  const src = String(text || '').replace(/\s+/g, ' ').trim();
  const lens = new Array(n).fill(4);
  const words = src ? src.split(' ') : [];
  const totalChars = words.reduce((a, w) => a + w.length, 0) || 1;
  // the words' budget is what is left after every whisper and rest, so the line's last word is spoken too
  const stops = words.filter((w, wi) => /[.!?]$/.test(w) && wi < words.length - 1).length;
  const budget = Math.max(words.length, n - Math.max(0, words.length - 1) - 3 * stops - 1);
  let cursor = 0;
  words.forEach((w, wi) => {
    const stop = /[.!?]$/.test(w) && wi < words.length - 1;
    let count = Math.max(1, Math.round((w.length / totalChars) * budget));
    if (cursor + count > n) count = Math.max(0, n - cursor);
    const seed = ((w.charCodeAt(0) * 2654435761) >>> 0) % 1000 / 1000;
    for (let k = 0; k < count; k += 1) {
      const t = (k + 0.5) / count;
      const jitter = ((((w.charCodeAt(k % w.length) || 97) * 40503) ^ (k * 2654435761)) >>> 0) % 1000 / 1000;
      lens[cursor + k] = Math.round(4 + 24 * Math.sin(Math.PI * t) * (0.6 + 0.4 * seed) * (0.82 + 0.18 * jitter));
    }
    cursor += count;
    if (cursor < n) { lens[cursor] = 4; cursor += 1; }
    if (stop) for (let r = 0; r < 3 && cursor < n; r += 1) { lens[cursor] = 0; cursor += 1; }
  });
  for (let k = cursor; k < n; k += 1) lens[k] = 4;
  return lens;
}

/**
 * The voice on the person: a Waveform drawn on an open arc anchored to a portrait, on the face's speaking side only,
 * never closing round the head. Bars radiate outward from a faint track; their heights are the line's own envelope
 * (two phrases, two swells; a silence at the full stop). A leader from the spoken line's last glyph runs level and
 * elbows at 45 degrees to the track, so the words label the voice. Coordinates are the host's own px.
 * @param {HTMLElement} host - a positioned box (the arc's svg fills it, overflow visible)
 * @param {{ text?:string, cx:number, cy:number, r:number, from?:number, to?:number, bars?:number, leaderFrom?:{x:number,y:number}|null, land?:number, play?:number }} o
 *   from/to: degrees, 0 at twelve o'clock, clockwise (270 is the left); land: the leader's landing angle; play: ms over
 *   which the line is spoken — the bars are revealed along the arc from its top as the words are typed (never under
 *   reduced motion, where the whole voice stands at once)
 * @returns {{ el:SVGSVGElement, layer:SVGSVGElement, cx:number, cy:number, r:number, from:number, to:number, n:number, scale:number, reach:number, setLean(dir:number):void, dispose():void }|null}
 *   reach: the bars' outer radius (a second instrument seated round the voice keeps clear of it)
 *   setLean: lean the contact's standing tick warm (+1), cold (-1) or upright (0)
 */
export function createVoiceArc(host, { text = '', cx, cy, r, from = 232, to = 308, bars = 64, leaderFrom = null, land = 284, play = 0 } = {}) {
  const doc = host && host.ownerDocument;
  if (!doc) return null;
  injectOrrery(doc);
  injectStyle(doc);
  const layer = svg('svg', { class: 'orr-svg orr-voicearc', 'aria-hidden': 'true', focusable: 'false' });
  const W = Math.max(1, host.clientWidth || 1); const H = Math.max(1, host.clientHeight || 1);
  layer.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const f = (n) => Math.round(n * 100) / 100;
  const n = Math.max(12, bars | 0);
  const lens = voicePhrases(text, n);
  const span = to - from;
  layer.appendChild(svg('path', { d: arcD(cx, cy, r, from, to), class: 'orr-band orr-voicearc__band' }));
  layer.appendChild(svg('path', { d: arcD(cx, cy, r, from, to), class: 'orr-edge orr-voicearc__track' }));
  let leaderSegs = [];
  let leaderPath = '';
  if (leaderFrom) {
    const [px, py] = polar(cx, cy, r, land);
    const lx = leaderFrom.x + 10; const ly = Math.round(leaderFrom.y) + 0.5;
    const ex = px - Math.abs(py - ly);
    if (ex > lx + 16) { leaderSegs = [[lx, ly, ex, ly], [ex, ly, px, py]]; leaderPath = `M ${f(lx)} ${ly} H ${f(ex)} L ${f(px)} ${f(py)}`; }
    else { leaderSegs = [[lx, ly, px, py]]; leaderPath = `M ${f(lx)} ${ly} L ${f(px)} ${f(py)}`; }
  }
  const segDist = (ax, ay, bx, by, px, py) => { const dx = bx - ax; const dy = by - ay; const L = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)); return Math.hypot(ax + t * dx - px, ay + t * dy - py); };
  const nearLeader = (x0, y0, x1, y1) => leaderSegs.some(([ax, ay, bx, by]) => { for (let k = 0; k <= 4; k += 1) { const qx = x0 + ((x1 - x0) * k) / 4; const qy = y0 + ((y1 - y0) * k) / 4; if (segDist(ax, ay, bx, by, qx, qy) < 5) return true; } return false; });
  let dBars = '';
  for (let i = 0; i < n; i += 1) {
    const a = from + (span * (i + 0.5)) / n;
    const len = lens[i];
    if (!len) continue;
    const [x0, y0] = polar(cx, cy, r + 5.5, a);
    const s = Math.min(1, r / 310);
    const L = len <= 4 ? Math.max(3, Math.round(4 * s)) : len * s;
    const [x1, y1] = polar(cx, cy, r + 5.5 + L, a);
    if (leaderFrom && nearLeader(x0, y0, x1, y1)) continue; // the bars part wherever the leader passes
    dBars += `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)} `;
  }
  const barsG = svg('g', { class: 'orr-voicearc__voice' });
  barsG.appendChild(svg('path', { d: dBars, class: 'orr-voicearc__bloom' }));
  barsG.appendChild(svg('path', { d: dBars, class: 'orr-voicearc__bars' }));
  layer.appendChild(barsG);
  // the line spoken: a mask arc wider than the bars sweeps from the arc's top (the line's first word) to its foot
  if (play > 0 && !reducedMotion()) {
    const id = `orr-voicearc-sweep-${(sweepSeq += 1)}`;
    const mask = svg('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H });
    const sweep = svg('path', { d: arcD(cx, cy, r + 18, from - 2, to + 2), pathLength: 1, class: 'orr-voicearc__sweep' });
    sweep.style.animationDuration = `${Math.round(play)}ms`;
    mask.appendChild(sweep);
    const defs = svg('defs'); defs.appendChild(mask); layer.insertBefore(defs, layer.firstChild);
    barsG.setAttribute('mask', `url(#${id})`);
    sweep.addEventListener('animationend', () => { barsG.removeAttribute('mask'); if (defs.parentNode) defs.parentNode.removeChild(defs); }, { once: true });
  }
  if (leaderFrom && leaderPath) {
    layer.appendChild(svg('path', { d: leaderPath, class: 'orr-voicearc__leader' }));
    layer.appendChild(svg('circle', { cx: f(leaderSegs[0][0]), cy: leaderSegs[0][1], r: 2.4, class: 'orr-voicearc__foot' }));
  }
  // the contact's standing: a tick past the voice's foot. Focusing a reply leans it warm (back toward
  // the line) or cold (away down the foot) and tints it, so her reception reads before the player commits.
  const standA = to + 4;
  const [sbx, sby] = polar(cx, cy, r - 4, standA);
  const [stx, sty] = polar(cx, cy, r + 12, standA);
  const standG = svg('g', { class: 'orr-voicearc__standing' });
  const standD = `M ${f(sbx)} ${f(sby)} L ${f(stx)} ${f(sty)}`;
  standG.appendChild(svg('path', { d: standD, class: 'orr-voicearc__stand-bloom' }));
  standG.appendChild(svg('path', { d: standD, class: 'orr-voicearc__stand-tick' }));
  layer.appendChild(standG);
  let lean = 0;
  const setLean = (dir) => {
    const next = dir > 0 ? 1 : dir < 0 ? -1 : 0;
    if (next === lean) return;
    lean = next;
    standG.classList.toggle('is-warm', lean > 0);
    standG.classList.toggle('is-cold', lean < 0);
    if (lean) standG.setAttribute('transform', `rotate(${lean > 0 ? -5 : 5} ${f(sbx)} ${f(sby)})`);
    else standG.removeAttribute('transform');
  };
  host.appendChild(layer);
  const scale = Math.min(1, r / 310);
  return { el: layer, layer, cx, cy, r, from, to, n, scale, reach: r + 5.5 + 28 * scale, setLean, dispose() { if (layer.parentNode) layer.parentNode.removeChild(layer); } };
}
