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

/**
 * The section glyphs, drawn in the ORRERY icon hand (a 24 grid, one stroke weight). A codex entry
 * that has no produced art stands its section's glyph in the plate's aperture.
 */
export const ARCHIVE_GLYPHS = Object.freeze({
  story: 'M12 6.2C9.4 4.7 6.4 4.5 3.6 5.5V19c2.8-1 5.8-.8 8.4.7 2.6-1.5 5.6-1.7 8.4-.7V5.5c-2.8-1-5.8-.8-8.4.7ZM12 6.2v13.5M6.2 8.6c1.4-.3 2.9-.2 4.2.3M6.2 11.6c1.4-.3 2.9-.2 4.2.3M13.6 8.9c1.3-.5 2.8-.6 4.2-.3',
  comms: 'M12 14.5v6M8.6 20.5h6.8M10.75 13.2a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0M9.3 10.4a3.9 3.9 0 0 1 5.4 0M6.9 8a7.3 7.3 0 0 1 10.2 0M4.5 5.6a10.7 10.7 0 0 1 15 0',
  discoveries: 'M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 1 0 0-11ZM12 9.6l2.4 2.4-2.4 2.4-2.4-2.4Z',
  graffiti: 'M3.8 16.4c1.6-5.2 3.2 2.7 4.9-2.6 1.3-4.1 2.7-4.3 3.6-.5.7 3 2 3.7 3.4.6 1-2.2 2.2-4.8 4.5-6.4M5.6 19.6h12.8',
  figures: 'M12 4a3.6 3.6 0 1 0 0 7.2A3.6 3.6 0 1 0 12 4ZM4.8 20.2c.6-4.2 3.4-6.6 7.2-6.6s6.6 2.4 7.2 6.6',
  ship: 'M12 3.2 15.6 10.6 20.2 19.4 12 16.2 3.8 19.4 8.4 10.6ZM12 3.2v13M8.4 10.6h7.2',
  archive: 'M4 6.5h16v11H4ZM4 9.2h16M4 14.8h16M6.5 6.5v2.7M9.5 6.5v2.7M12.5 6.5v2.7M15.5 6.5v2.7M6.5 14.8v2.7M9.5 14.8v2.7M12.5 14.8v2.7M15.5 14.8v2.7',
  ledger: 'M6 3.8h9.2l2.8 2.8v13.6H6ZM15.2 3.8v2.8H18M8.8 10h6.4M8.8 13h6.4M8.8 16h4',
  locked: 'M8 10.8V8.3a4 4 0 0 1 8 0v2.5M6.4 10.8h11.2v9H6.4ZM12 14.1v2.6',
});

/**
 * The archive plate: the entry's aperture (produced art or its glyph sits under it in HTML) inside a
 * ring instrument. The segment ring is the entry's section, one arc per entry, the one being read
 * lit; the engraving names the section over the top and the entry's place under it.
 * @param {{segments?: string[], current?: number, top?: string, bottom?: string, glyph?: string, locked?: boolean}} o
 *   segments: one state per entry in the section ('open' | 'locked'); current: the index being read.
 */
export function archivePlateSvg({ segments = [], current = -1, top = '', bottom = '', glyph = '', locked = false } = {}) {
  const C = 200;
  const parts = [];
  // the outer scale turns slowly: 120 graduations, a major every tenth
  parts.push(`<g class="orr-arc-drift"><path class="orr-arc-tick" d="${ticksD(C, C, 197, 120, { len: 3, major: 10, majorLen: 8 })}"/></g>`);
  parts.push(`<path class="orr-arc-ring orr-arc-ring--outer orr-arc-draw" pathLength="1" d="${arcD(C, C, 186, 0, 360)}"/>`);
  // the section: one arc per entry
  const n = Math.max(0, segments.length | 0);
  if (n) {
    const span = 360 / n;
    const gap = n > 48 ? 0.7 : n > 20 ? 1.4 : n > 8 ? 2.6 : 4;
    const segs = { open: [], locked: [] };
    for (let i = 0; i < n; i += 1) {
      if (i === current) continue;
      const a0 = i * span + gap / 2;
      const a1 = (i + 1) * span - gap / 2;
      (segments[i] === 'locked' ? segs.locked : segs.open).push(arcD(C, C, 172, a0, a1));
    }
    if (segs.open.length) parts.push(`<path class="orr-arc-seg orr-arc-seg--open" d="${segs.open.join(' ')}"/>`);
    if (segs.locked.length) parts.push(`<path class="orr-arc-seg orr-arc-seg--locked" d="${segs.locked.join(' ')}"/>`);
    if (current >= 0 && current < n) {
      const a0 = current * span + gap / 2;
      const a1 = (current + 1) * span - gap / 2;
      const d = arcD(C, C, 172, a0, a1);
      const mid = (a0 + a1) / 2;
      const [t0x, t0y] = polar(C, C, 179, mid);
      const [t1x, t1y] = polar(C, C, 191, mid);
      parts.push(`<g class="orr-arc-now${locked ? ' is-locked' : ''}"><path class="orr-arc-seg-bloom" d="${d}"/><path class="orr-arc-seg orr-arc-seg--now" d="${d}"/>`
        + `<path class="orr-arc-now-tick" d="M ${q(t0x)} ${q(t0y)} L ${q(t1x)} ${q(t1y)}"/></g>`);
    }
  }
  // the engraved band: the section over the top, the entry's place under it
  parts.push(`<path class="orr-arc-ring" d="${arcD(C, C, 160, 0, 360)}"/>`);
  if (top) parts.push(arcText(C, C, 146, top, { size: 9.5 }));
  if (bottom) parts.push(arcText(C, C, 152, bottom, { lower: true, size: 9.5 }));
  // the aperture's rim and its four index marks
  parts.push(`<path class="orr-arc-ring orr-arc-ring--rim" d="${arcD(C, C, 132, 0, 360)}"/>`);
  parts.push(`<path class="orr-arc-tick orr-arc-tick--hi" d="${ticksD(C, C, 132, 4, { len: 9 })}"/>`);
  if (glyph && ARCHIVE_GLYPHS[glyph]) {
    // the glyph at the aperture's heart: 24 grid scaled to 110, centred
    const s = 110 / 24;
    parts.push(`<g class="orr-arc-glyph${locked ? ' is-locked' : ''}" transform="translate(${q(C - 55)} ${q(C - 55)}) scale(${q(s)})"><path d="${ARCHIVE_GLYPHS[glyph]}"/></g>`);
  }
  return `<svg class="orr-svg orr-arc-plate__svg" viewBox="0 0 400 400" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
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
    + `<path class="orr-arc-gauge__track" d="${d}"/>`
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
      parts.push(`<path class="orr-mdial__clock-bloom${urgent ? ' is-threat' : ''}" d="${d}"/><path class="orr-mdial__clock${urgent ? ' is-threat' : ''}" d="${d}"/>`);
    }
  }
  // progress
  const inner = arcD(C, C, 88, 0, 360);
  parts.push(`<path class="orr-arc-ring orr-arc-ring--rim" d="${inner}"/>`);
  parts.push(`<path class="orr-arc-tick orr-arc-tick--hi" d="${ticksD(C, C, 88, 4, { len: 6 })}"/>`);
  if (p > 0.004) {
    const d = p >= 0.999 ? inner : arcD(C, C, 88, 0, 360 * p);
    const [hx, hy] = polar(C, C, 88, 360 * p);
    parts.push(`<path class="orr-mdial__prog-bloom" d="${d}"/><path class="orr-mdial__prog" d="${d}"/><circle class="orr-mdial__bead" cx="${q(hx)}" cy="${q(hy)}" r="3"/>`);
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
  return `<svg class="cx-wedge__svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">`
    + `<path class="cx-wedge__fan" d="${fan}"/><path class="cx-wedge__edge" d="${edges}"/>`
    + `<circle class="cx-wedge__pip" cx="${q(x0)}" cy="${q(y0)}" r="2.6"/></svg>`;
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
