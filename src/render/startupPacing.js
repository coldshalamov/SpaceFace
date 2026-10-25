// Device-scaled startup budgets — the phone menu-loop fix (2026-10-23).
//
// The New Game / Continue readiness chain is fail-closed by design: every gate has a wall-clock
// budget, and an expired budget refuses the launch back to the main menu instead of entering
// flight with stalls. Those budgets were tuned on fast desktop hosts. A physical phone pays the
// same work several times over — slower CPU decode, slower GPU program compiles, and a network
// stack sharing one radio with dozens of parallel render-package fetches (~85 MB of GLB on the
// opening route) — so it blows the fixed 20 s picture/physics/presentation budgets and the 90 s
// render-package fetch timeout on every launch: tap New Game, wait, GAME START FAILED, menu
// again (D188, D242). The deployed-mobile probe reproduces the loop against production under
// handset-class throttling; desktop hosts also refuse intermittently under contention.
//
// The scale multiplies only the ceilings: gates still settle the moment their work completes,
// so a fast host is unaffected, and a wedged boot still fails closed — on a budget the device
// class can actually meet.

let cachedScale = null;

function detectStartupBudgetScale(win = globalThis) {
  const nav = win && win.navigator;
  let coarse = false;
  try {
    coarse = !!(win && typeof win.matchMedia === 'function'
      && win.matchMedia('(pointer: coarse)').matches);
  } catch (_) { /* media query unavailable — treat as fine-pointer host */ }
  let touch = false;
  try {
    touch = (nav && Number(nav.maxTouchPoints) > 0)
      || !!(win && 'ontouchstart' in win);
  } catch (_) { /* navigator unavailable — no touch signal */ }
  let smallHost = false;
  try {
    const cores = nav && Number(nav.hardwareConcurrency);
    smallHost = Number.isFinite(cores) && cores > 0 && cores <= 6;
  } catch (_) { /* navigator unavailable — no core-count signal */ }
  if (coarse && (touch || smallHost)) return 6; // handset-class: phones, large-cell tablets
  if (coarse || (touch && smallHost)) return 4; // touch-leaning host
  return 2; // desktop, with a margin for contended hosts (D242 intermittent refusals)
}

/** Startup ceiling multiplier for this device class (cached for the session). */
export function startupBudgetScale() {
  if (cachedScale === null) cachedScale = detectStartupBudgetScale();
  return cachedScale;
}

/** A short fail-closed gate budget (picture prepare, physics bring-up, presentation hold). */
export function openingGateBudgetMs(baseMs = 20000) {
  return Math.max(1, Math.round(Number(baseMs) || 20000) * startupBudgetScale());
}

/**
 * The long library/visuals budget. Handsets get a wide window — the opening route streams a
 * large authored payload before flight — while desktops keep the tuned base; their observed
 * load times sit far inside it.
 */
export function authoredVisualBudgetMs(baseMs = 180000) {
  const base = Math.max(1, Number(baseMs) || 180000);
  return startupBudgetScale() >= 4 ? Math.max(base, 540000) : base;
}

/**
 * The async-admission deadline (single decode/compose/compile jobs). Slow hosts legitimately
 * take longer per job under radio + decode contention; a wedge still dies, later.
 */
export function authoredAdmissionDeadlineMs(baseMs = 120000) {
  const base = Math.max(1, Number(baseMs) || 120000);
  return startupBudgetScale() >= 4 ? Math.max(base, 480000) : Math.max(base, 240000);
}

/** Test seam: pin the scale so budget math stays deterministic under fake timers. */
export function __setStartupBudgetScaleForTests(scale) {
  cachedScale = Number.isFinite(scale) && scale >= 1 ? scale : null;
}
