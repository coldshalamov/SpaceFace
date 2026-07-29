// DOM / layout instrumentation — the producers behind counter family H (DOM mutations, layout
// reads, longtasks).
//
// WHY THIS EXISTS
// ---------------
// The HUD is DOM on the game thread, and PERF-C05 was exactly this failure mode: a roster
// rebuilding at ~5 Hz because its cache guard hashed a continuously changing value — invisible in
// source, obvious as a count. An unsourced DOM counter and a perfectly healthy HUD report the
// same thing (0), which is the vacuous-zero failure this program exists to prevent. This module
// is what makes family H sourced.
//
// WHY THE OBSERVER SITS ON A STABLE ANCESTOR, NOT ON #hud
// -------------------------------------------------------
// Install happens at renderer construction (src/render/renderer.js, the same block as the GL
// seam); the HUD root is built later. A root captured once at install would therefore be null
// forever and the counter would silently report 0 for the whole session — good news, no error,
// precisely the failure mode the handoff's trap 1 names. So the MutationObserver attaches to
// document.documentElement (which outlives every UI rebuild) and each delivered batch re-resolves
// document.getElementById('hud') and keeps only records inside its subtree. The price is
// delivering non-HUD mutations and discarding them; the payoff is that late creation, teardown,
// and replacement of #hud are all handled by one code path with no missed window.
//
// PROTOTYPE PATCHING, NOT INSTANCE SHADOWING — AND WHAT THAT COSTS
// ----------------------------------------------------------------
// The GL seam shadows one context object; there is exactly one context. Layout reads
// (offsetWidth, getBoundingClientRect, getComputedStyle, ...) are accessor/method properties on
// Element.prototype / HTMLElement.prototype / Window.prototype — they cannot be shadowed per
// element without touching every element in the page. So this module patches prototypes, which
// affects EVERY element in the process, including ones belonging to other tests in the same
// page. Two consequences, both enforced by test:
//   1. uninstall() is mandatory and exact. Every original descriptor is captured with
//      Object.getOwnPropertyDescriptor and restored verbatim — get/set/value/writable/
//      enumerable/configurable — so an instrumented run leaves no residue.
//   2. Missing or non-configurable properties are SKIPPED, never forced. defineProperty on a
//      non-configurable property throws; instrumentation must degrade, not break boot.
//
// THE DELIBERATE SCOPE CUT
// ------------------------
// This ships RAW layout-read counts. It does NOT implement read-after-write "forced synchronous
// layout" detection: that needs defineProperty surgery on Element.prototype.innerHTML /
// Node.prototype.textContent / className to maintain a dirty flag, and getting that subtly wrong
// breaks the game silently (reasoned in PERF_INSTRUMENTATION_INVENTORY.md §3). Mutation counts
// already catch the real failure mode: DOM writes scaling with frame count instead of with state
// changes.
//
// INSTALL-ON-ENABLE IS THE ZERO-COST CONTRACT
// -------------------------------------------
// The only production call site is renderer.js's `if (perfCountersRequested())` block. When
// instrumentation is off, none of these observers or patched descriptors EXIST — there is no
// boolean read on the hot path because there is no hot path. uninstall() exists for tests and
// for proof, mirroring installGlInstrumentation's contract; production never uninstalls.

// Reads of any of these force the browser to have an up-to-date layout. offset* live on
// HTMLElement.prototype; client*/scroll* live on Element.prototype.
const LAYOUT_ACCESSOR_PROPERTIES = Object.freeze([
  'offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft',
  'clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight',
]);

// childList: rows coming and going; attributes: class/style flips; characterData: text rewrites.
// subtree because the HUD's own root is nearly silent — the churn is levels below it.
const MUTATION_OBSERVE_OPTIONS = Object.freeze({
  childList: true,
  attributes: true,
  characterData: true,
  subtree: true,
});

const HUD_ROOT_ID = 'hud';

// One handle per document (per counters when there is no document), so a second install returns
// the existing handle instead of double-wrapping: double-wrapping would double every count, and
// the second uninstall would restore a wrapper rather than the original — the same hazard the GL
// module documents on gl.__sfInstrumentation.
const activeHandles = new WeakMap();

/** Containment by parent-chain walk: true when `node` IS `root` or sits under it. */
function isWithin(root, node) {
  for (let current = node; current; current = current.parentNode) {
    if (current === root) return true;
  }
  return false;
}

/**
 * Install DOM/layout counting producers.
 *
 * @param {object} counters - a createPerfCounters() instance
 * @param {object} [options] - ambient overrides, used by tests; production passes nothing and the
 *   globals are used: { document, MutationObserver, PerformanceObserver, elementPrototype,
 *   htmlElementPrototype, window }
 * @returns {{uninstall: function}} - uninstall restores every patched descriptor exactly and
 *   disconnects every observer
 */
export function installDomInstrumentation(counters, options = {}) {
  if (!counters) throw new TypeError('installDomInstrumentation requires a createPerfCounters() instance');

  const doc = options.document ?? globalThis.document;
  const MutationObserverImpl = options.MutationObserver ?? globalThis.MutationObserver;
  const PerformanceObserverImpl = options.PerformanceObserver ?? globalThis.PerformanceObserver;
  const elementPrototype = options.elementPrototype ?? globalThis.Element?.prototype;
  const htmlElementPrototype = options.htmlElementPrototype ?? globalThis.HTMLElement?.prototype;
  const win = options.window ?? globalThis.window;

  const key = doc || counters;
  const existing = activeHandles.get(key);
  if (existing) return existing;

  const restoreSteps = [];

  installMutationCounter(doc, MutationObserverImpl, counters, restoreSteps);
  installLongTaskCounter(PerformanceObserverImpl, counters, restoreSteps);
  installLayoutReadCounters(counters, elementPrototype, htmlElementPrototype, win, restoreSteps);

  const handle = {
    uninstall() {
      for (let i = restoreSteps.length - 1; i >= 0; i--) restoreSteps[i]();
      restoreSteps.length = 0;
      activeHandles.delete(key);
    },
  };
  activeHandles.set(key, handle);
  return handle;
}

// --- H: DOM mutations ---------------------------------------------------------------------------

function installMutationCounter(doc, MutationObserverImpl, counters, restoreSteps) {
  if (!doc || typeof doc.getElementById !== 'function') return;
  if (typeof MutationObserverImpl !== 'function') return;
  const ancestor = doc.documentElement || doc.body;
  if (!ancestor) return;
  const observer = new MutationObserverImpl((records) => {
    // Re-resolved per batch, never captured at install — see the header. If the HUD root does not
    // exist yet, nothing delivered can be inside it.
    const hudRoot = doc.getElementById(HUD_ROOT_ID);
    if (!hudRoot) return;
    for (const record of records || []) {
      if (record && isWithin(hudRoot, record.target)) {
        counters.countDomMutation(record.type);
      }
    }
  });
  observer.observe(ancestor, MUTATION_OBSERVE_OPTIONS);
  restoreSteps.push(() => observer.disconnect());
}

// --- H: long tasks -------------------------------------------------------------------------------

function installLongTaskCounter(PerformanceObserverImpl, counters, restoreSteps) {
  if (typeof PerformanceObserverImpl !== 'function') return;
  try {
    const observer = new PerformanceObserverImpl((list) => {
      const entries = list && typeof list.getEntries === 'function' ? list.getEntries() : [];
      for (let i = 0; i < entries.length; i++) counters.countLongTask();
    });
    observer.observe({ entryTypes: ['longtask'] });
    restoreSteps.push(() => observer.disconnect());
  } catch (_) {
    // 'longtask' is not a supported entry type everywhere (Firefox, Safari); observe() throws
    // there. That must degrade to "no longtask producer this run", never to a broken boot —
    // the renderer's init must not throw because a measurement probe was armed.
  }
}

// --- H: layout reads -----------------------------------------------------------------------------

function installLayoutReadCounters(counters, elementPrototype, htmlElementPrototype, win, restoreSteps) {
  // HTMLElement.prototype first: offset* lives there, client*/scroll* and getBoundingClientRect
  // on Element.prototype. Each property is patched on whichever prototype actually owns it; in
  // practice each lives on exactly one of the two.
  for (const prototype of [htmlElementPrototype, elementPrototype]) {
    if (!prototype) continue;
    for (const name of LAYOUT_ACCESSOR_PROPERTIES) {
      patchAccessor(prototype, name, counters, restoreSteps);
    }
    patchMethod(prototype, 'getBoundingClientRect', counters, restoreSteps);
  }
  // getComputedStyle is an own property of the window object in some environments and of
  // Window.prototype in browsers; walk the chain and patch the owner that actually holds it.
  for (let owner = win; owner; owner = Object.getPrototypeOf(owner)) {
    if (Object.getOwnPropertyDescriptor(owner, 'getComputedStyle')) {
      patchMethod(owner, 'getComputedStyle', counters, restoreSteps);
      break;
    }
  }
}

function patchAccessor(prototype, name, counters, restoreSteps) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
  // Missing or non-configurable: skip, never force. A non-configurable property cannot be
  // redefined, and instrumentation must degrade rather than throw.
  if (!descriptor || descriptor.configurable !== true || typeof descriptor.get !== 'function') return;
  const originalGet = descriptor.get;
  Object.defineProperty(prototype, name, {
    get: function sfLayoutReadCounter() {
      counters.countLayoutRead();
      return originalGet.call(this);
    },
    set: descriptor.set,
    enumerable: descriptor.enumerable,
    configurable: descriptor.configurable,
  });
  // The captured descriptor object itself is the restore: redefining with it puts back
  // get/set/value/writable/enumerable/configurable byte-identically.
  restoreSteps.push(() => { Object.defineProperty(prototype, name, descriptor); });
}

function patchMethod(prototype, name, counters, restoreSteps) {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
  if (!descriptor || descriptor.configurable !== true || typeof descriptor.value !== 'function') return;
  const original = descriptor.value;
  Object.defineProperty(prototype, name, {
    value: function sfLayoutReadCounter() {
      counters.countLayoutRead();
      return original.apply(this, arguments);
    },
    writable: descriptor.writable,
    enumerable: descriptor.enumerable,
    configurable: descriptor.configurable,
  });
  restoreSteps.push(() => { Object.defineProperty(prototype, name, descriptor); });
}
