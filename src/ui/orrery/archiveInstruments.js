// src/ui/orrery/archiveInstruments.js — the archive's instruments (design/frontend/ORRERY.md §6 Meta:
// "Codex: an archive — a Ladder index, plates with generated art, lore via Scroll Reveal, undiscovered
// entries Decrypt-scrambled." "Mission log: a Tracing-Beam timeline.").
//
// Every builder here returns an SVG *string*, never nodes: the codex and the mission log write them
// with innerHTML, which also mounts in the minimal fake documents the reachability checks build
// (they have createElement and an innerHTML parser, never createElementNS). Angles follow svg.js:
// degrees, 0 = straight up, clockwise. Colour is the stylesheet's (archiveLayouts.js): bone at rest,
// phosphor for a reading, the Hand's amber only on the one chosen thing, red only for a threat.
import { arcD, ticksD, polar } from './svg.js';
import { createSpring, reducedMotion } from './motion.js';

const q = (n) => Math.round(n * 100) / 100;
const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let uidSeq = 0;
const uid = (p) => `${p}-${(uidSeq += 1).toString(36)}`;

/** A small, stable hash of a string (FNV-1a), for the per-entry scramble. */
export function archiveHash(text) {
  let h = 0x811c9dc5;
  const s = String(text == null ? '' : text);
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

const CIPHER = 'ABCDEFHJKLMNPRSTUVWXYZ0123456789#%/<>';
/**
 * The undiscovered entry's words as cipher: the same shape (spaces and length kept, so a scrambled
 * title reads as a title), noise glyphs chosen from a hash of `seed` so the picture never flickers.
 * Static at rest; the live decrypt belongs to entries the player has actually reached.
 */
export function archiveScramble(text, seed = '') {
  let h = archiveHash(`${seed}|${text}`);
  let out = '';
  for (const ch of String(text == null ? '' : text)) {
    if (/\s/.test(ch)) { out += ch; continue; }
    if (/[—\-·:,.]/.test(ch)) { out += ch; continue; }
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    out += CIPHER[h % CIPHER.length];
  }
  return out;
}

/** Text on the upper arc (reading left to right over the top) or the lower arc (upright underneath). */
function arcText(cx, cy, r, text, { lower = false, size = 9, cls = 'orr-arc-engrave' } = {}) {
  const id = uid('orr-arc-tp');
  const [lx, ly] = polar(cx, cy, r, 270);
  const [rx, ry] = polar(cx, cy, r, 90);
  const d = `M ${q(lx)} ${q(ly)} A ${r} ${r} 0 0 ${lower ? 0 : 1} ${q(rx)} ${q(ry)}`;
  return `<path id="${id}" d="${d}" fill="none" stroke="none"/>`
    + `<text class="${cls}" font-size="${size}" text-anchor="middle"><textPath href="#${id}" startOffset="50%">${esc(text)}</textPath></text>`;
}

/** The archive dial's geometry, in its own 400-unit box (shared by the drawing and the pointer). */
export const ARCHIVE_DIAL = Object.freeze({ C: 200, ENTRY_R: 174, RIM_R: 140, BLADE_R0: 161, BLADE_R1: 199 });

/** The angle (degrees, 0 = up, clockwise) at the middle of entry `i` of `n` round the dial. */
export function archiveDialAngle(i, n) {
  return n > 0 ? ((i + 0.5) * 360) / n : 0;
}

/** Which of `n` entries lies under the angle `deg`. */
export function archiveDialIndex(deg, n) {
  if (!(n > 0)) return -1;
  const a = ((deg % 360) + 360) % 360;
  return Math.max(0, Math.min(n - 1, Math.floor((a / 360) * n)));
}

/**
 * The archive dial: the entry's aperture (its produced art sits under it in HTML) ringed by every
 * entry of the open tab, one arc each — the one being read lit in phosphor, the ones already read
 * brighter than the ones still to read, the locked ones dark — with a long graduation where each
 * section starts. The engraving names the section over the top and the entry's place under it.
 * A locked entry's cipher runs round the aperture's rim. The Hand is a separate drawing (the blade).
 * @param {{entries?: string[], current?: number, starts?: number[], top?: string, bottom?: string, cipher?: string, locked?: boolean}} o
 *   entries: one state per entry ('read' | 'open' | 'locked'); starts: the indices where a section begins.
 */
export function archivePlateSvg({ entries = [], current = -1, starts = [], top = '', bottom = '', cipher = '', locked = false } = {}) {
  const { C, ENTRY_R, RIM_R } = ARCHIVE_DIAL;
  const parts = [];
  // the outer scale: a major every 15 degrees, turning slowly
  parts.push(`<g class="orr-arc-drift"><path class="orr-arc-major" d="${ticksD(C, C, 199, 24, { len: 4 })}"/></g>`);
  // the entry ring: a soft band under every arc, the arcs themselves as bands of light
  parts.push(`<path class="orr-arc-band orr-arc-draw" pathLength="1" stroke-width="22" d="${arcD(C, C, ENTRY_R, 0, 360)}"/>`);
  const n = Math.max(0, entries.length | 0);
  if (n) {
    const span = 360 / n;
    const gap = n > 48 ? 0.8 : n > 20 ? 1.5 : n > 8 ? 2.6 : 4;
    const groups = { read: [], open: [], locked: [] };
    for (let i = 0; i < n; i += 1) {
      if (i === current) continue;
      const d = arcD(C, C, ENTRY_R, i * span + gap / 2, (i + 1) * span - gap / 2);
      (groups[entries[i]] || groups.open).push(d);
    }
    for (const kind of ['locked', 'open', 'read']) {
      if (!groups[kind].length) continue;
      const d = groups[kind].join(' ');
      parts.push(`<path class="orr-arc-seg-glow orr-arc-seg-glow--${kind}" d="${d}"/><path class="orr-arc-seg orr-arc-seg--${kind}" d="${d}"/>`);
    }
    // a section starts: a long graduation across the ring
    const majors = [];
    for (const s of starts) {
      if (!(s > 0 && s < n)) continue;
      const a = s * span;
      const [x0, y0] = polar(C, C, ENTRY_R - 12, a);
      const [x1, y1] = polar(C, C, ENTRY_R + 14, a);
      majors.push(`M ${q(x0)} ${q(y0)} L ${q(x1)} ${q(y1)}`);
    }
    if (majors.length) parts.push(`<path class="orr-arc-start" d="${majors.join(' ')}"/>`);
    if (current >= 0 && current < n) {
      const d = arcD(C, C, ENTRY_R, current * span + gap / 2, (current + 1) * span - gap / 2);
      parts.push(`<g class="orr-arc-now${locked ? ' is-locked' : ''}"><path class="orr-arc-seg-bloom" d="${d}"/><path class="orr-arc-seg orr-arc-seg--now" d="${d}"/></g>`);
    }
  }
  // the engraving
  if (top) parts.push(arcText(C, C, 150, top, { size: 9.5 }));
  if (bottom) parts.push(arcText(C, C, 157, bottom, { lower: true, size: 9.5 }));
  // the aperture's rim, lit, and its four index marks
  parts.push(`<path class="orr-arc-band" stroke-width="14" d="${arcD(C, C, RIM_R, 0, 360)}"/>`);
  parts.push(`<path class="orr-arc-ring orr-arc-ring--rim" d="${arcD(C, C, RIM_R, 0, 360)}"/>`);
  parts.push(`<path class="orr-arc-tick orr-arc-tick--hi" d="${ticksD(C, C, RIM_R, 4, { len: 10 })}"/>`);
  // a locked entry: its cipher runs round the inside of the rim
  if (locked && cipher) {
    const id = uid('orr-arc-ci');
    const r = RIM_R - 11;
    parts.push(`<path id="${id}" d="${arcD(C, C, r, 0, 359.9)}" fill="none" stroke="none"/>`
      + `<text class="orr-arc-cipher" font-size="11"><textPath href="#${id}">${esc(cipher)}</textPath></text>`);
  }
  return `<svg class="orr-svg orr-arc-plate__svg" viewBox="0 0 400 400" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
}

/**
 * The Hand on the archive dial: an amber blade across the entry ring (the arm of the hero
 * instrument IS the Hand). Drawn pointing straight up; the screen turns its group to the entry.
 * The bloom is geometry (a wider stroke of the same path), never a filter.
 */
export function archiveBladeSvg() {
  const { C, ENTRY_R, BLADE_R0, BLADE_R1 } = ARCHIVE_DIAL;
  const d = `M ${C} ${C - BLADE_R0} L ${C} ${C - BLADE_R1}`;
  const pip = `M ${C} ${C - ENTRY_R - 6} L ${C + 5} ${C - ENTRY_R} L ${C} ${C - ENTRY_R + 6} L ${C - 5} ${C - ENTRY_R} Z`;
  const tip = `M ${C - 5} ${C - BLADE_R0 + 1} L ${C} ${C - BLADE_R0 - 7} L ${C + 5} ${C - BLADE_R0 + 1}`;
  return `<svg class="orr-svg cx-blade" viewBox="0 0 400 400" aria-hidden="true" focusable="false"><g class="cx-blade__arm">`
    + `<path class="cx-blade__bloom" d="${d}"/><path class="cx-blade__core" d="${d}"/>`
    + `<path class="cx-blade__tip" d="${tip}"/><path class="cx-blade__pip" d="${pip}"/></g></svg>`;
}

/**
 * A reading dial for one unlock count: a 270° arc (the whole collection), its filled share in
 * phosphor with a bead at the head, and a graduation per item when there are few enough to count.
 */
export function archiveGaugeSvg(frac, { count = 0 } = {}) {
  const C = 32; const r = 25; const from = -135; const to = 135;
  const v = clamp01(frac);
  const d = arcD(C, C, r, from, to);
  const n = count > 1 && count <= 12 ? count : 4;
  const ticks = ticksD(C, C, r + 3, n, { len: 3, from, to, inward: false });
  const [hx, hy] = polar(C, C, r, from + (to - from) * v);
  return `<svg class="orr-svg orr-arc-gauge" viewBox="0 0 64 64" aria-hidden="true" focusable="false" style="--v:${q(v)}">`
    + `<path class="orr-arc-gauge__trackglow" d="${d}"/><path class="orr-arc-gauge__track" d="${d}"/>`
    + `<path class="orr-arc-gauge__ticks" d="${ticks}"/>`
    + (v > 0.004
      ? `<path class="orr-arc-gauge__bloom" d="${d}" pathLength="1" stroke-dasharray="${q(v)} 1"/>`
        + `<path class="orr-arc-gauge__fill" d="${d}" pathLength="1" stroke-dasharray="${q(v)} 1"/>`
        + `<circle class="orr-arc-gauge__bead" cx="${q(hx)}" cy="${q(hy)}" r="2.2"/>`
      : '')
    + '</svg>';
}

/**
 * The tracked contract's dial on the mission log's stage: progress round the inner ring in
 * phosphor, the clock round the outer (red once it is a threat), ticks at every quarter.
 * @param {{progress?: number, time?: number|null, urgent?: boolean}} o time: share of the clock left, null when untimed
 */
export function missionDialSvg({ progress = 0, time = null, urgent = false } = {}) {
  const C = 120;
  const p = clamp01(progress);
  const parts = [];
  parts.push(`<g class="orr-arc-drift orr-arc-drift--slow"><path class="orr-arc-tick" d="${ticksD(C, C, 117, 72, { len: 2.5, major: 6, majorLen: 7 })}"/></g>`);
  // the clock
  const outer = arcD(C, C, 104, 0, 360);
  parts.push(`<path class="orr-arc-ring" d="${outer}"/>`);
  if (time != null) {
    const t = clamp01(time);
    if (t > 0.004) {
      const d = arcD(C, C, 104, 0, 360 * t);
      parts.push(`<path class="orr-mdial__clock-bloom${urgent ? ' is-threat' : ''}" d="${d}" pathLength="1"/><path class="orr-mdial__clock${urgent ? ' is-threat' : ''}" d="${d}" pathLength="1"/>`);
    }
  }
  // progress
  const inner = arcD(C, C, 88, 0, 360);
  parts.push(`<path class="orr-arc-ring orr-arc-ring--rim" d="${inner}"/>`);
  parts.push(`<path class="orr-arc-tick orr-arc-tick--hi" d="${ticksD(C, C, 88, 4, { len: 6 })}"/>`);
  if (p > 0.004) {
    const d = p >= 0.999 ? inner : arcD(C, C, 88, 0, 360 * p);
    const [hx, hy] = polar(C, C, 88, 360 * p);
    parts.push(`<path class="orr-mdial__prog-bloom" d="${d}" pathLength="1"/><path class="orr-mdial__prog" d="${d}" pathLength="1"/><circle class="orr-mdial__bead" cx="${q(hx)}" cy="${q(hy)}" r="3"/>`);
  }
  return `<svg class="orr-svg orr-mdial__svg" viewBox="0 0 240 240" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
}

/** The scale between an element's screen pixels and its own CSS pixels (CSS zoom on an ancestor). */
export function archiveZoom(node, rect = null) {
  if (!node || typeof node.getBoundingClientRect !== 'function') return 1;
  const r = rect || node.getBoundingClientRect();
  const w = Number(node.offsetWidth) || 0;
  return w > 0 && r.width > 0 ? r.width / w : 1;
}

/**
 * The fan of light that joins one graduation of a coarse scale (x0, y0) to the fine rail its entries
 * stand on (x1, from `top` to `bottom`): a faint wedge, its two edges, a pip at the graduation.
 * Coordinates are the host box's own pixels.
 */
export function archiveWedgeSvg({ w, h, x0, y0, x1, top, bottom }) {
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  const fan = `M ${q(x0)} ${q(y0)} L ${q(x1)} ${q(top)} L ${q(x1)} ${q(bottom)} Z`;
  const edges = `M ${q(x0)} ${q(y0)} L ${q(x1)} ${q(top)} M ${q(x0)} ${q(y0)} L ${q(x1)} ${q(bottom)}`;
  // the fill is light graded from the graduation (brightest) out to the rail; the edges are light with a bloom
  const g = uid('cx-wedge-g');
  return `<svg class="cx-wedge__svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">`
    + `<defs><linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${q(x0)}" y1="0" x2="${q(x1)}" y2="0">`
    + `<stop offset="0" stop-color="rgb(236,230,216)" stop-opacity=".16"/><stop offset="1" stop-color="rgb(236,230,216)" stop-opacity=".04"/></linearGradient></defs>`
    + `<path class="cx-wedge__fan" fill="url(#${g})" d="${fan}"/><path class="cx-wedge__bloom" d="${edges}"/><path class="cx-wedge__edge" d="${edges}"/>`
    + `<circle class="cx-wedge__pip" cx="${q(x0)}" cy="${q(y0)}" r="3.4"/></svg>`;
}

/**
 * The Hand on a ladder: one amber notched chevron that swings (spring, overshoot, settle) to the
 * chosen rung of a list. `host` is the positioned scroll box the rungs live in; the hand is its
 * child, so it scrolls with them. Re-attaches itself when the host's content is rebuilt.
 */
export function createLadderHand(host, { className = 'orr-arc-hand', nodeY = null } = {}) {
  if (!host || typeof host.appendChild !== 'function') return { moveTo() {}, el: null, dispose() {} };
  const doc = host.ownerDocument || globalThis.document;
  const hand = doc.createElement('i');
  hand.className = className;
  hand.setAttribute('aria-hidden', 'true');
  let shownOnce = false;
  const paint = (y) => { if (hand.style) hand.style.transform = `translate3d(0, ${q(y)}px, 0)`; };
  const spring = createSpring({ value: 0, preset: 'swing', onUpdate: paint });
  // Rects are the screen's pixels; the hand moves in the host's own (a zoomed screen scales them).
  const yOf = (row) => {
    if (typeof row.getBoundingClientRect !== 'function' || typeof host.getBoundingClientRect !== 'function') return null;
    const hr = host.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    if (!(rr.height > 0)) return null;
    const z = archiveZoom(host, hr);
    const top = (rr.top - hr.top) / z + (Number(host.scrollTop) || 0);
    return nodeY != null ? top + nodeY : top + rr.height / z / 2;
  };
  return {
    el: hand,
    /** Swing to `row` (instant on the first show, under reduced motion, or with {instant}). */
    moveTo(row, { instant = false } = {}) {
      if (hand.parentNode !== host) host.appendChild(hand);
      if (!row) { hand.hidden = true; return; }
      const y = yOf(row);
      if (y == null) { hand.hidden = true; return; }
      hand.hidden = false;
      const still = instant || !shownOnce || reducedMotion();
      spring.set(y, { instant: still });
      shownOnce = true;
    },
    dispose() { spring.stop(); if (hand.parentNode) hand.parentNode.removeChild(hand); },
  };
}
