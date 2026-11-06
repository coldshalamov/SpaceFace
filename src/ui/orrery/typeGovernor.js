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
//   width      STATIC uppercase <22px with a wide axis (wdth > 105) -> wdth 100, weight kept (<= 800).
//              Interactive elements (buttons, links, tabs, anything focusable) keep their own width
//              and weight: their selected / hover states often change exactly those axes, and an
//              inline value would freeze the state styling (seen on the Credits and Settings tabs).
//   sentence   uppercase running text (>= 7 words or >= 44 chars, <= 17px, not a chain joined by
//              separators such as "SECTOR · CONCORD") -> Instrument Sans, sentence case, 13px floor
//
// Cost. Writing styles needs a measure per text element (getComputedStyle): ~5ms on a simple screen
// and 10-30ms on the densest station/armory screens. That must never be one long task at boot, when
// every screen is pre-built, so the work is sliced: the visible screen first (8ms a frame), hidden
// pre-built screens only in idle time (3ms a slice). `typeGovernorStats()` reports what it has done.

export const TYPE_GOVERNOR = Object.freeze({
  trackingSmall: 0.075,   // em, labels up to 17px
  trackingMedium: 0.06,   // em, 18-27px
  trackingLarge: 0.04,    // em, 28px and up
  wideAxisCeiling: 105,   // wdth above this is "poster width" at label sizes
  labelCeilingPx: 22,     // below this the width rule applies
  sentenceMaxPx: 17,
  sentenceWords: 7,
  sentenceChars: 44,
  sentenceMinPx: 13,
  maxWeight: 800,
  visibleBudgetMs: 8,     // per animation frame, for the screen the player is looking at
  idleBudgetMs: 3,        // per idle slice, for pre-built hidden screens
  chunk: 48,              // elements read, then written, per step
});

const READ_FACE = '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'CANVAS', 'IMG', 'VIDEO']);
const INTERACTIVE = 'button, a, summary, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="radio"], [role="link"], [tabindex]:not([tabindex="-1"])';
const SVG_NS = 'http://www.w3.org/2000/svg';
const governed = new WeakSet();
const installed = new WeakSet();
const stats = { roots: 0, elements: 0, changed: 0, slices: 0, ms: 0, maxSliceMs: 0 };

export function typeGovernorStats() { return { ...stats }; }

/**
 * Pure rule: given the measured style of one uppercase text element, return the declarations to
 * apply (property -> value) or null when it already meets the standard.
 * @param {{fontSize:number, letterSpacingPx:number, words:number, chars:number, chain?:boolean, interactive?:boolean, wdth:number, weight:number, variation:string}} m
 */
export function governType(m, cfg = TYPE_GOVERNOR) {
  const fs = m.fontSize > 0 ? m.fontSize : 12;
  const out = {};
  // A chain joined by separators ("SECTOR · CONCORD · YOU ARE HERE") is a row of labels, not a sentence:
  // it keeps its capitals and only has its tracking governed.
  const isSentence = fs <= cfg.sentenceMaxPx && !m.chain
    && (m.words >= cfg.sentenceWords || m.chars >= cfg.sentenceChars);
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
  if (!m.interactive && fs < cfg.labelCeilingPx && m.wdth > cfg.wideAxisCeiling) {
    const weight = Math.min(cfg.maxWeight, Math.round(m.weight || 650));
    out['font-stretch'] = '100%';
    out['font-variation-settings'] = `"wdth" 100, "wght" ${weight}`;
  }
  return Object.keys(out).length ? out : null;
}

function measure(el, win, cfg) {
  let own = '';
  const kids = el.childNodes;
  for (let i = 0; i < kids.length; i++) { const n = kids[i]; if (n.nodeType === 3 && n.nodeValue.trim()) own += `${own ? ' ' : ''}${n.nodeValue.trim()}`; }
  if (!own) return null;
  const s = win.getComputedStyle(el);
  if (s.textTransform !== 'uppercase') return null;
  const variation = s.fontVariationSettings || '';
  const wdthMatch = /"wdth"\s*([\d.]+)/.exec(variation);
  const stretch = parseFloat(s.fontStretch);
  const fontSize = parseFloat(s.fontSize) || 12;
  const wdth = wdthMatch ? parseFloat(wdthMatch[1]) : (Number.isFinite(stretch) ? stretch : 100);
  // only the width rule cares whether the element is interactive, so only pay for the ancestor walk then
  const wide = fontSize < cfg.labelCeilingPx && wdth > cfg.wideAxisCeiling;
  return {
    fontSize,
    letterSpacingPx: parseFloat(s.letterSpacing) || 0,
    words: own.split(/\s+/).filter((token) => /[A-Za-z]/.test(token)).length,
    chars: own.length,
    chain: /[·•|›»—]/.test(own),
    interactive: wide && typeof el.closest === 'function' ? !!el.closest(INTERACTIVE) : false,
    wdth,
    weight: parseFloat(s.fontWeight) || 650,
    variation,
  };
}

function* elementsOf(root) {
  yield root;
  const walker = root.ownerDocument.createTreeWalker(root, 1 /* SHOW_ELEMENT */, {
    acceptNode: (n) => (n.namespaceURI === SVG_NS || n.dataset?.typeInk === 'keep' ? 2 /* REJECT */ : 1),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) yield n;
}

function skip(el) {
  return el.nodeType !== 1 || SKIP_TAGS.has(el.tagName) || governed.has(el) || el.namespaceURI === SVG_NS || el.dataset?.typeInk === 'keep';
}

/** Read up to cfg.chunk elements, then write their patches: one style pass per step. Returns true at the end of the tree. */
function governStep(task, win, cfg) {
  const jobs = [];
  let finished = false;
  for (let i = 0; i < cfg.chunk; i++) {
    const next = task.it.next();
    if (next.done) { finished = true; break; }
    const el = next.value;
    if (skip(el)) continue;
    stats.elements++;
    const m = measure(el, win, cfg);
    if (m) { const patch = governType(m, cfg); if (patch) jobs.push([el, patch]); }
  }
  for (const [el, patch] of jobs) {
    for (const [prop, value] of Object.entries(patch)) el.style.setProperty(prop, value, 'important');
    governed.add(el);
  }
  stats.changed += jobs.length;
  task.changed += jobs.length;
  return finished;
}

/** Govern every uppercase text element under `root`, synchronously (tests, tools). Returns how many changed. */
export function governTree(root, win = globalThis.window, cfg = TYPE_GOVERNOR) {
  if (!root || !win?.getComputedStyle) return 0;
  const task = { it: elementsOf(root), changed: 0 };
  while (!governStep(task, win, cfg)) { /* keep stepping */ }
  stats.roots++;
  return task.changed;
}

function isVisibleScreenRoot(node) {
  const screen = typeof node.closest === 'function' ? node.closest('.k-screen') : null;
  return !screen || screen.classList.contains('sf-screen--visible');
}

/** Watch `#screens`; govern what mounts, in slices. Idempotent per document; never throws into the UI. */
export function installTypeGovernor(doc = globalThis.document) {
  const win = doc?.defaultView;
  if (!doc || !win?.MutationObserver || installed.has(doc)) return;
  installed.add(doc);
  const cfg = TYPE_GOVERNOR;
  const now = () => (win.performance ? win.performance.now() : Date.now());
  const visible = []; const hidden = [];
  const seen = new WeakSet();
  let frame = 0; let idle = 0;

  const run = (list, budgetMs) => {
    const t0 = now();
    while (list.length && now() - t0 < budgetMs) {
      const task = list[0];
      if (!task.root.isConnected) { list.shift(); continue; }
      let done = false;
      try { done = governStep(task, win, cfg); } catch { done = true; /* cosmetic only */ }
      if (done) { list.shift(); stats.roots++; }
    }
    const spent = now() - t0;
    stats.slices++; stats.ms += spent; if (spent > stats.maxSliceMs) stats.maxSliceMs = spent;
  };
  const pump = () => {
    if (visible.length && !frame) frame = win.requestAnimationFrame(() => { frame = 0; run(visible, cfg.visibleBudgetMs); pump(); });
    if (!visible.length && hidden.length && !idle) {
      const later = (cb) => (typeof win.requestIdleCallback === 'function' ? win.requestIdleCallback(cb, { timeout: 1500 }) : win.setTimeout(cb, 60));
      idle = later(() => { idle = 0; run(hidden, cfg.idleBudgetMs); pump(); });
    }
  };
  const enqueue = (node) => {
    if (node.nodeType !== 1 || seen.has(node)) return;
    seen.add(node);
    const task = { root: node, it: elementsOf(node), changed: 0 };
    (isVisibleScreenRoot(node) ? visible : hidden).push(task);
  };

  const observer = new win.MutationObserver((records) => {
    for (const rec of records) for (const node of rec.addedNodes) enqueue(node);
    pump();
  });
  const attach = (host) => { observer.observe(host, { childList: true, subtree: true }); for (const child of host.children) enqueue(child); pump(); };
  const host = doc.getElementById('screens');
  if (host) { attach(host); return; }
  const waiter = new win.MutationObserver(() => {
    const found = doc.getElementById('screens');
    if (found) { waiter.disconnect(); attach(found); }
  });
  waiter.observe(doc.documentElement, { childList: true, subtree: true });
  win.setTimeout(() => waiter.disconnect(), 30000); // a page that never mounts #screens costs nothing after boot
}
