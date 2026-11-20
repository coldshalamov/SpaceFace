// Boot-shell presentation pacing. The intro visualizer is a natively decoded, compositor-owned
// movie, but its frames still need GPU and compositor time: the boot GPU cook (shader links,
// uniform-table first use, texture/geometry residency) used to run as unpliced bursts, and a
// 3.1 s long-task storm plus driver-side link saturation froze the movie for seconds (33 of 91
// decoded frames dropped on a real GPU, `waiting` stalls, progress needle jumping 0→60→100).
//
// While the boot overlay is the picture, every cook yield hands a frame back to the compositor
// before the next slice: small main-thread slices, and GL submissions spaced so the video
// decoder and the compositor keep their GPU time. Once the shell is gone the yields are exactly
// what they were — flight-time behavior is untouched.
import { postTaskAtBackgroundPriorityBounded } from './backgroundPost.js';

// Work per compositor frame before handing off. 24 fps video needs ~40 ms of presents per
// second; a ~6–7 ms slice leaves the rest of every 60 Hz frame to the compositor. When the
// compositor is slow (software GL, contended host) each handoff waits longer, and the budget
// doubles (bounded) so the cook keeps a healthy duty cycle instead of serializing on waits.
const MIN_SLICE_BUDGET_MS = 6;
const MAX_SLICE_BUDGET_MS = 40;
const START_SLICE_BUDGET_MS = 7;
const PRESENT_HANDOFF_BOUND_MS = 100;
const SLOW_HANDOFF_MS = 48;

const clockNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? performance.now()
  : Date.now());

let reducedMotionQuery = null;
try {
  reducedMotionQuery = typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
} catch { /* media queries unavailable on this host */ }

function titleCinematicVisible(doc) {
  const cinematic = doc.getElementById('cinematic-splash');
  return !!cinematic && !cinematic.hidden && cinematic.style?.display !== 'none';
}

/** True while either startup film owns the visible picture and motion is enabled. */
export function bootShellPacingActive() {
  const doc = globalThis.document;
  if (!doc || typeof doc.getElementById !== 'function') return false;
  if (doc.hidden === true) return false; // occluded window: nothing visible to protect
  if (doc.documentElement?.classList?.contains?.('sf-reduce-motion')) return false;
  if (reducedMotionQuery?.matches) return false;
  const overlay = doc.getElementById('boot-overlay');
  return (!!overlay && !overlay.classList.contains('hidden') && overlay.style?.display !== 'none')
    || titleCinematicVisible(doc);
}

/** Resume in a background task after the compositor asked for a frame (bounded: a starved
 * compositor must never park the cook — the bound keeps slices draining at a degraded cadence,
 * exactly like the starved-rAF unstick in startupGpuResidency's yieldToNextPresent). */
function yieldUntilPresentHandoff() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => postTaskAtBackgroundPriorityBounded(finish));
      setTimeout(finish, PRESENT_HANDOFF_BOUND_MS);
    } else setTimeout(finish, 0);
  });
}

let sliceBudgetMs = START_SLICE_BUDGET_MS;
let lastHandoffAt = -Infinity;

/** The native boot veil and the title cinematic each own the picture through their fade.
 * The title film mounts as the native veil starts fading, so the veil alone cannot release
 * a one-shot PMREM convolve or nebula bake. */
export function startupPictureRetired({ allowWorldLoadingVeil = false } = {}) {
  const doc = globalThis.document;
  if (!doc || typeof doc.getElementById !== 'function') return true;
  const overlay = doc.getElementById('boot-overlay');
  const stage = overlay?.dataset?.loadingStage;
  // The loading presenter reuses the boot overlay for every world transition.
  const worldLoadingVeil = allowWorldLoadingVeil && stage && !stage.startsWith('boot-');
  return (!overlay || overlay.style?.display === 'none' || worldLoadingVeil === true)
    && !titleCinematicVisible(doc);
}

/** Wait for the startup picture to retire, with a bounded wake for callers to recheck ownership. */
export function whenStartupPictureRetired({ timeoutMs = 15000, pollMs = 150, host = globalThis,
  allowWorldLoadingVeil = false } = {}) {
  const pictureRetired = () => startupPictureRetired({ allowWorldLoadingVeil });
  if (pictureRetired()) return Promise.resolve();
  return new Promise((resolve) => {
    const startedAt = clockNow();
    const timer = host.setInterval(() => {
      if (pictureRetired() || clockNow() - startedAt >= timeoutMs) {
        host.clearInterval(timer);
        resolve();
      }
    }, Math.max(16, pollMs));
  });
}

/** Wrap a plain task-queue yield (`fastYield`) with boot-shell pacing. While the boot overlay
 * is live: bursts of work up to the current budget continue in microtask hops, and once the
 * budget is spent the next yield waits for a compositor frame before resuming. Otherwise it is
 * the wrapped yield, unchanged. */
export function pacedBootShellYield(fastYield) {
  if (!bootShellPacingActive()) {
    sliceBudgetMs = START_SLICE_BUDGET_MS;
    lastHandoffAt = clockNow();
    return fastYield();
  }
  if (clockNow() - lastHandoffAt < sliceBudgetMs) return Promise.resolve();
  const started = clockNow();
  return yieldUntilPresentHandoff().then(() => {
    const waited = clockNow() - started;
    sliceBudgetMs = waited > SLOW_HANDOFF_MS
      ? Math.min(MAX_SLICE_BUDGET_MS, sliceBudgetMs * 2)
      : Math.max(MIN_SLICE_BUDGET_MS, Math.floor(sliceBudgetMs * 0.75));
    lastHandoffAt = clockNow();
  });
}
