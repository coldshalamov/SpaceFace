// Structural clip check for the +40 % growth pass. Headed capture is the real picture; this is
// the headless stand-in: string width vs the layout box each catalog key is allowed to occupy.
// Boxes match the wrap-safe rules the document bridge injects for every non-English locale.
// Do not "fix" a clip by shrinking the font — grow or wrap the box.

import { pseudoLocalize } from './runtime.js';

export const GROWTH_VIEWPORT = Object.freeze({ width: 1280, height: 720 });

const SCREEN_KEY_RE = /^loc\.src\.ui\.screens\./;
const HUD_KEY_RE = /^loc\.src\.ui\.hud\./;
const STATION_KEY_RE = /^loc\.src\.ui\.station\./;
const PLACEHOLDER_ONLY_RE = /^[\s{\}A-Za-z0-9_.-]*$/;
const HTMLISH_RE = /<[a-z/]|Html|_html|escapeHtml/i;

/** Average Latin glyph widths at 1px, including the pseudo-locale accents and pad ticks. */
const GLYPH_WIDTH = Object.freeze({
  default: 0.56,
  wide: 0.78,
  narrow: 0.32,
  space: 0.28,
  pad: 0.34,
  bracket: 0.55,
  cjk: 1.0,
});

const WIDE = new Set('mwMW@%—…⟦⟧'.split(''));
const NARROW = new Set('ijlIt1!.,;:\'"|()[]{}'.split(''));

export function isScreenCatalogKey(key) {
  return SCREEN_KEY_RE.test(key) || STATION_KEY_RE.test(key);
}

export function isHudCatalogKey(key) {
  return HUD_KEY_RE.test(key);
}

export function isLayoutSweepKey(key) {
  return isScreenCatalogKey(key) || isHudCatalogKey(key);
}

/** Skip interpolations and markup — they are not a painted label. */
export function isPaintedCopy(message) {
  const text = String(message == null ? '' : message).trim();
  if (!text) return false;
  if (HTMLISH_RE.test(text)) return false;
  const withoutTokens = text.replace(/\{[A-Za-z_][A-Za-z0-9_.-]*\}/g, '');
  if (!withoutTokens.trim()) return false;
  if (PLACEHOLDER_ONLY_RE.test(withoutTokens) && !/[A-Za-z]/.test(withoutTokens)) return false;
  return true;
}

export function classifyKey(key, message = '') {
  const k = String(key || '');
  const text = String(message == null ? '' : message);
  const long = text.length > 72 || /[.?!]/.test(text);
  if (HUD_KEY_RE.test(k)) {
    if (k.includes('.attr.aria')) return 'hud-aria';
    if (k.includes('field.body') || long) return 'hud-body';
    if (k.includes('field.title') || k.includes('dom.textcontent')) return 'hud-label';
    return 'hud-chip';
  }
  if (k.includes('.attr.aria') || k.includes('.attr.placeholder') || k.includes('.attr.alt')) {
    return 'screen-aria';
  }
  if (long) return 'screen-body';
  if (k.includes('field.title') || k.includes('.field.headline') || k.includes('screen-title')) {
    return 'screen-title';
  }
  if (k.includes('field.label') || k.includes('field.name') || k.includes('dom.textcontent')) {
    return 'screen-button';
  }
  return 'screen-body';
}

/** Layout boxes after the growth CSS: wrap is allowed; heights include a second line. */
export const LAYOUT_BOXES = Object.freeze({
  'screen-title': Object.freeze({ width: 720, height: 112, fontSize: 28, lineHeight: 1.15, wrap: true }),
  'screen-button': Object.freeze({ width: 320, height: 64, fontSize: 15, lineHeight: 1.25, wrap: true }),
  'screen-label': Object.freeze({ width: 360, height: 52, fontSize: 14, lineHeight: 1.3, wrap: true }),
  'screen-body': Object.freeze({ width: 720, height: 280, fontSize: 14, lineHeight: 1.35, wrap: true }),
  'screen-aria': Object.freeze({ width: 720, height: 120, fontSize: 14, lineHeight: 1.3, wrap: true }),
  'hud-label': Object.freeze({ width: 280, height: 48, fontSize: 13, lineHeight: 1.25, wrap: true }),
  'hud-chip': Object.freeze({ width: 220, height: 40, fontSize: 12, lineHeight: 1.25, wrap: true }),
  'hud-body': Object.freeze({ width: 420, height: 96, fontSize: 13, lineHeight: 1.3, wrap: true }),
  'hud-aria': Object.freeze({ width: 480, height: 80, fontSize: 13, lineHeight: 1.3, wrap: true }),
});

export function layoutBoxForKey(key, message = '') {
  return LAYOUT_BOXES[classifyKey(key, message)] || LAYOUT_BOXES['screen-body'];
}

export function glyphWidth(char, fontSize) {
  const size = Number(fontSize) || 14;
  const code = char.codePointAt(0) || 0;
  if (char === '·') return GLYPH_WIDTH.pad * size;
  if (char === '⟦' || char === '⟧') return GLYPH_WIDTH.bracket * size;
  if (char === ' ' || char === '\u00a0') return GLYPH_WIDTH.space * size;
  if (code > 0x2e80) return GLYPH_WIDTH.cjk * size;
  if (WIDE.has(char)) return GLYPH_WIDTH.wide * size;
  if (NARROW.has(char)) return GLYPH_WIDTH.narrow * size;
  return GLYPH_WIDTH.default * size;
}

export function measureStringWidth(text, fontSize = 14) {
  let width = 0;
  for (const char of String(text == null ? '' : text)) width += glyphWidth(char, fontSize);
  return width;
}

function wrapLines(text, fontSize, maxWidth) {
  const source = String(text == null ? '' : text);
  if (!source) return [''];
  const words = source.split(/(\s+)/);
  const lines = [];
  let current = '';
  let currentWidth = 0;
  const push = () => {
    if (current) lines.push(current);
    current = '';
    currentWidth = 0;
  };
  for (const word of words) {
    if (!word) continue;
    const width = measureStringWidth(word, fontSize);
    if (width > maxWidth && !/^\s+$/.test(word)) {
      push();
      let chunk = '';
      let chunkWidth = 0;
      for (const char of word) {
        const cw = glyphWidth(char, fontSize);
        if (chunk && chunkWidth + cw > maxWidth) {
          lines.push(chunk);
          chunk = char;
          chunkWidth = cw;
        } else {
          chunk += char;
          chunkWidth += cw;
        }
      }
      current = chunk;
      currentWidth = chunkWidth;
      continue;
    }
    if (current && currentWidth + width > maxWidth && !/^\s+$/.test(word)) {
      push();
      if (/^\s+$/.test(word)) continue;
    }
    current += word;
    currentWidth += width;
  }
  push();
  return lines.length ? lines : [''];
}

export function layoutString(text, box) {
  const fontSize = box.fontSize;
  const width = measureStringWidth(text, fontSize);
  if (!box.wrap) {
    return {
      width,
      height: fontSize * box.lineHeight,
      lines: 1,
      clipped: width > box.width + 0.5,
      overflowX: Math.max(0, width - box.width),
      overflowY: 0,
    };
  }
  const lines = wrapLines(text, fontSize, box.width);
  const height = lines.length * fontSize * box.lineHeight;
  const overflowY = Math.max(0, height - box.height);
  return {
    width: Math.min(width, box.width),
    height,
    lines: lines.length,
    clipped: overflowY > 0.5,
    overflowX: 0,
    overflowY,
  };
}

export function clipRecord(key, source, rendered, box, layout) {
  if (!layout.clipped) return null;
  return Object.freeze({
    key,
    source,
    rendered,
    box: box.role || classifyKey(key),
    width: box.width,
    height: box.height,
    lines: layout.lines,
    overflowX: layout.overflowX,
    overflowY: layout.overflowY,
  });
}

/** Seed for the growth capture sweep. Headed stills and the structural stand-in both use this. */
export const CLIP_SWEEP_SEED = 16601;

/**
 * Painted-label selectors the capture sweep walks. Screens, HUD chips, and station copy.
 * Keep this list in the shipped module so headed captures import it instead of copying.
 */
export const CLIP_SWEEP_SELECTORS = [
  'button', 'label', 'h1', 'h2', 'h3', 'h4', 'p', 'li', 'td', 'th',
  '.k-display', '.k-sentence', '.sf-slot-name', '.sf-slot-sub',
  '.sf-barrow__label', '.sf-barrow__num', '.sf-wpn-heat__label',
  '.sf-overview-row__name', '.sf-overview-row__detail', '.sf-overview-footer',
  '.sf-pslot__name', '.sf-prail__label', '.sf-target__name', '.sf-obj__t',
  '.sf-mt-title', '.sf-mt-obj', '.sf-nav-label', '.sf-alert', '.sf-toast',
  '.sf-stat__v', '.sf-cargo-row__name',
].join(',');

function readOverflow(el) {
  // Unknown overflow is treated as clipping so a mock / capture without computed style still
  // reports scrollWidth > clientWidth the way the headed scripts do.
  let ox = 'hidden';
  let oy = 'hidden';
  try {
    const view = el.ownerDocument && el.ownerDocument.defaultView;
    const style = view && typeof view.getComputedStyle === 'function'
      ? view.getComputedStyle(el)
      : el.style;
    if (style) {
      const fallback = String(style.overflow || '');
      ox = String(style.overflowX || fallback || 'hidden').trim() || 'hidden';
      oy = String(style.overflowY || fallback || 'hidden').trim() || 'hidden';
    }
  } catch {
    // Headless fixtures have no window; keep the hidden default.
  }
  return { x: ox, y: oy };
}

function clipsAlong(overflow, scroll, client, slop) {
  if (overflow === 'visible') return false;
  return scroll > client + slop;
}

/** True when the element's painted glyphs are cut off on either axis. */
export function isElementClipped(el, slop = 1) {
  if (!el) return false;
  const cw = Number(el.clientWidth) || 0;
  const ch = Number(el.clientHeight) || 0;
  const sw = Number(el.scrollWidth) || 0;
  const sh = Number(el.scrollHeight) || 0;
  if (cw < 2 && ch < 2) return false;
  const overflow = readOverflow(el);
  return clipsAlong(overflow.x, sw, cw, slop) || clipsAlong(overflow.y, sh, ch, slop);
}

function clipId(el) {
  const className = typeof el.className === 'string' ? el.className : '';
  return el.id || className || el.tagName || '';
}

/**
 * Walk a live (or fixture) DOM root and list clipped painted labels.
 * Headed capture imports this; tests must not copy the predicate.
 */
export function collectDomClips(root, options = {}) {
  const selector = options.selector || CLIP_SWEEP_SELECTORS;
  const slop = options.slop == null ? 1 : Number(options.slop);
  if (!root || typeof root.querySelectorAll !== 'function') {
    return Object.freeze({ present: false, clipCount: 0, clips: Object.freeze([]) });
  }
  const clips = [];
  for (const el of root.querySelectorAll(selector)) {
    if (!isElementClipped(el, slop)) continue;
    clips.push(Object.freeze({
      id: clipId(el),
      tag: el.tagName || '',
      scrollWidth: Number(el.scrollWidth) || 0,
      clientWidth: Number(el.clientWidth) || 0,
      scrollHeight: Number(el.scrollHeight) || 0,
      clientHeight: Number(el.clientHeight) || 0,
      text: String(el.textContent || '').trim().slice(0, 80),
    }));
  }
  return Object.freeze({
    present: true,
    clipCount: clips.length,
    clips: Object.freeze(clips),
  });
}

/**
 * Build the capture-sweep report the leaf's done-when names.
 * `roots` is `{ screenId: element }` including `hud`.
 */
export function captureSweepReport(roots, options = {}) {
  const screens = [];
  let clipCount = 0;
  for (const [id, root] of Object.entries(roots || {})) {
    const row = collectDomClips(root, options);
    screens.push(Object.freeze({
      id,
      present: row.present,
      clipCount: row.clipCount,
      clips: row.clips,
    }));
    clipCount += row.clipCount;
  }
  return Object.freeze({
    seed: CLIP_SWEEP_SEED,
    clipCount,
    screens: Object.freeze(screens),
  });
}

/**
 * Sweep every screen and HUD catalog key at the growth locale.
 * `translate` defaults to the shipped pseudo-locale so growth is never tested in English.
 */
export function sweepGrowthClips(messages, translate = pseudoLocalize) {
  const clips = [];
  let scanned = 0;
  let skipped = 0;
  for (const [key, source] of Object.entries(messages || {})) {
    if (!isLayoutSweepKey(key)) continue;
    if (!isPaintedCopy(source)) {
      skipped += 1;
      continue;
    }
    scanned += 1;
    const rendered = translate(source);
    const box = layoutBoxForKey(key, source);
    const layout = layoutString(rendered, box);
    const record = clipRecord(key, source, rendered, box, layout);
    if (record) clips.push(record);
  }
  return Object.freeze({
    scanned,
    skipped,
    clips: Object.freeze(clips),
    clipCount: clips.length,
  });
}

export default {
  isScreenCatalogKey,
  isHudCatalogKey,
  layoutBoxForKey,
  measureStringWidth,
  layoutString,
  sweepGrowthClips,
  isElementClipped,
  collectDomClips,
  captureSweepReport,
  CLIP_SWEEP_SEED,
};
