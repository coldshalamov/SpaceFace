// Type governor — one voice for every UPPERCASE label and caption on the 2D screens.
//
// Why this exists. Each screen sheet defines its own `LABEL` (Archivo, wdth 112-125, uppercase) and
// then tracks it by hand: the UI sources carry 30+ distinct letter-spacing values across 146 files
// (.14em x216, .16em x153, .18em x127, .22em x62, .24em x49 ...). Seen side by side the screens read
// as one poster style repeated at six different widths, which is the "slop" the owner called out
// (STATION_STANDARD §2: labels `letter-spacing <= .08em`, sentences in sentence case).
// CSS cannot select on a computed `text-transform`, so the screens' own rules cannot be capped from
// the shared sheet. This module applies the standard where it can be measured: after a screen's
// elements exist, from their computed style.
//
// The rules only ever NARROW or CALM type (less tracking, normal width, sentence case for running
// text), so they cannot push a layout into a new overflow. They never touch SVG text, form fields,
// or anything marked `data-type-ink="keep"`. The flight HUD lives outside `#screens` and is untouched.
//
//   tracking   uppercase label <=17px  -> letter-spacing <= .075em
//              uppercase 18-27px       -> <= .06em;   28px and up -> <= .04em
//   width      uppercase <22px with a wide axis (wdth > 105) -> wdth 100, weight kept (<= 700)
//   sentence   uppercase running text (>= 6 words or >= 40 chars, <= 17px) -> Instrument Sans,
//              sentence case, 13px floor, normal tracking

export const TYPE_GOVERNOR = Object.freeze({
  trackingSmall: 0.075,   // em, labels up to 17px
  trackingMedium: 0.06,   // em, 18-27px
  trackingLarge: 0.04,    // em, 28px and up
  wideAxisCeiling: 105,   // wdth above this is "poster width" at label sizes
  labelCeilingPx: 22,     // below this the width rule applies
  sentenceMaxPx: 17,
  sentenceWords: 6,
  sentenceChars: 40,
  sentenceMinPx: 13,
  maxWeight: 700,
});

const READ_FACE = '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'CANVAS', 'IMG', 'VIDEO']);
const governed = new WeakSet();
const installed = new WeakSet();

/**
 * Pure rule: given the measured style of one uppercase text element, return the declarations to
 * apply (property -> value) or null when it already meets the standard.
 * @param {{fontSize:number, letterSpacingPx:number, words:number, chars:number, wdth:number, weight:number, variation:string}} m
 */
export function governType(m, cfg = TYPE_GOVERNOR) {
  const fs = m.fontSize > 0 ? m.fontSize : 12;
  const out = {};
  const isSentence = fs <= cfg.sentenceMaxPx && (m.words >= cfg.sentenceWords || m.chars >= cfg.sentenceChars);
  if (isSentence) {
    out['text-transform'] = 'none';
    out['letter-spacing'] = '.005em';
    out['font-family'] = READ_FACE;
    out['font-stretch'] = '100%';
    out['font-variation-settings'] = 'normal';
    out['font-weight'] = '500';
    if (fs < cfg.sentenceMinPx) out['font-size'] = `${cfg.sentenceMinPx}px`;
    return out;
  }
  const trackingEm = (m.letterSpacingPx || 0) / fs;
  const cap = fs >= 28 ? cfg.trackingLarge : fs >= 18 ? cfg.trackingMedium : cfg.trackingSmall;
  if (trackingEm > cap + 0.002) out['letter-spacing'] = `${cap}em`;
  if (fs < cfg.labelCeilingPx && m.wdth > cfg.wideAxisCeiling) {
    const weight = Math.min(cfg.maxWeight, Math.round(m.weight || 650));
    out['font-stretch'] = '100%';
    out['font-variation-settings'] = `"wdth" 100, "wght" ${weight}`;
  }
  return Object.keys(out).length ? out : null;
}

function measure(el, win) {
  const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.nodeValue.trim()).map(n => n.nodeValue.trim()).join(' ');
  if (!own) return null;
  const s = win.getComputedStyle(el);
  if (s.textTransform !== 'uppercase') return null;
  const variation = s.fontVariationSettings || '';
  const wdthMatch = /"wdth"\s*([\d.]+)/.exec(variation);
  const stretch = parseFloat(s.fontStretch);
  return {
    fontSize: parseFloat(s.fontSize) || 12,
    letterSpacingPx: parseFloat(s.letterSpacing) || 0,
    words: own.split(/\s+/).length,
    chars: own.length,
    wdth: wdthMatch ? parseFloat(wdthMatch[1]) : (Number.isFinite(stretch) ? stretch : 100),
    weight: parseFloat(s.fontWeight) || 650,
    variation,
  };
}

/** Govern every uppercase text element under `root`. Reads first, writes second: one style pass. */
export function governTree(root, win = globalThis.window) {
  if (!root || !win?.getComputedStyle) return 0;
  const jobs = [];
  const visit = (el) => {
    if (el.nodeType !== 1 || SKIP_TAGS.has(el.tagName) || governed.has(el)) return;
    if (el.namespaceURI === 'http://www.w3.org/2000/svg' || el.dataset?.typeInk === 'keep') return;
    const m = measure(el, win);
    if (m) { const patch = governType(m); if (patch) jobs.push([el, patch]); }
  };
  visit(root);
  const walker = root.ownerDocument.createTreeWalker(root, 1 /* SHOW_ELEMENT */, {
    acceptNode: (n) => (n.namespaceURI === 'http://www.w3.org/2000/svg' || n.dataset?.typeInk === 'keep' ? 2 /* REJECT */ : 1),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) visit(n);
  for (const [el, patch] of jobs) {
    for (const [prop, value] of Object.entries(patch)) el.style.setProperty(prop, value, 'important');
    governed.add(el);
  }
  return jobs.length;
}

/** Watch `#screens`; govern what mounts. Idempotent per document; never throws into the UI. */
export function installTypeGovernor(doc = globalThis.document) {
  const win = doc?.defaultView;
  if (!doc || !win?.MutationObserver || installed.has(doc)) return;
  installed.add(doc);
  const queue = new Set();
  let frame = 0;
  const flush = () => {
    frame = 0;
    const roots = [...queue]; queue.clear();
    for (const root of roots) { if (root.isConnected) { try { governTree(root, win); } catch { /* cosmetic only */ } } }
  };
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(flush); };
  const observer = new win.MutationObserver((records) => {
    for (const rec of records) for (const node of rec.addedNodes) if (node.nodeType === 1) queue.add(node);
    if (queue.size) schedule();
  });
  const attach = (host) => { observer.observe(host, { childList: true, subtree: true }); queue.add(host); schedule(); };
  const host = doc.getElementById('screens');
  if (host) { attach(host); return; }
  const waiter = new win.MutationObserver(() => {
    const found = doc.getElementById('screens');
    if (found) { waiter.disconnect(); attach(found); }
  });
  waiter.observe(doc.documentElement, { childList: true, subtree: true });
  win.setTimeout(() => waiter.disconnect(), 30000); // a page that never mounts #screens costs nothing after boot
}
