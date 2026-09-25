// src/ui/orrery/waveform.js — the Waveform (design/frontend/ORRERY.md §4 #30): voice bars on a comms
// line, breathing with it. A row of thin bars of light; at rest they breathe slowly at a low height;
// while a line is spoken they rise and fall in a spread of rhythms and settle again when it ends.
// Every bar is a CSS animation on the compositor (transform only); under reduced motion the bars
// stand still at their rest height. The rest heights are an envelope of the line itself (vowels
// high, consonants mid, spaces low, both ends tapered), so a still frame reads as a voice trace and
// never as a dotted rule under the name.

import { injectOrrery } from './tokens.js';
import { reducedMotion } from './motion.js';

const STYLE_ID = 'orr-waveform-style';
const BONE = '236 230 216';

const CSS = `
.orr-wave { display:flex; align-items:center; gap:3px; height:22px; }
.orr-wave__bar { display:block; width:2px; height:100%; border-radius:1px; background:rgb(${BONE} / .62); transform-origin:50% 50%;
  transform:scaleY(var(--orr-wave-rest, .18)); animation:orr-wave-breathe var(--orr-wave-d, 2.6s) ease-in-out var(--orr-wave-delay, 0s) infinite alternate; }
.orr-wave.is-speaking .orr-wave__bar { background:rgb(248 244 234); animation:orr-wave-speak var(--orr-wave-sd, .42s) ease-in-out var(--orr-wave-delay, 0s) infinite alternate; }
@keyframes orr-wave-breathe { from { transform:scaleY(var(--orr-wave-rest, .18)); } to { transform:scaleY(calc(var(--orr-wave-rest, .18) * 1.18 + .03)); } }
@keyframes orr-wave-speak { from { transform:scaleY(var(--orr-wave-lo, .2)); } to { transform:scaleY(var(--orr-wave-hi, 1)); } }
html.sf-reduce-motion .orr-wave__bar, html.sf-reduce-motion .orr-wave.is-speaking .orr-wave__bar { animation:none; transform:scaleY(var(--orr-wave-rest, .18)); }
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
    bar.style.setProperty('--orr-wave-rest', env === null ? (0.12 + centre * 0.16 + Math.random() * 0.06).toFixed(2) : (0.08 + env * 0.74).toFixed(2));
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
