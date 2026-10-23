// src/render/slowFrameOffer.js — the one-time "this looks slow" offer.
//
// Detection by hardware class (adaptiveQuality.detectGpu) is a guess; the frame rate the player
// actually gets is the fact. When live flight holds a median under ~30 fps for ~20 seconds, the
// game offers — once per session, never applied on its own — the High performance preset through
// a receipt line with a Switch button. Accepting goes through the same path the Settings screen
// uses (applyQualityPreset, then one `settings:changed` per key that moved), so the choice
// persists and the Quality mode row there shows it pressed.
//
// Two pieces:
//   createSlowFrameWatch  the pure detector: frame times in, "the window is slow" out. No clock,
//                         no DOM, no per-frame allocation (fixed typed-array ring of 1-second
//                         buckets; the median test is a count, not a sort).
//   installSlowFrameOffer the wiring: reads the presentation runner's per-callback frame time
//                         (state.render.lastPresentDtMs, the rAF delta, so a player-chosen frame
//                         cap cannot read as slowness), decides when the sample counts, emits the
//                         toast, applies the preset.
//
// The software renderer is skipped: it already has its emergency profile and its own toast.

import {
  applyQualityPreset,
  videoMatchesQualityTier,
} from './adaptiveQuality.js';
import { laneWriteSetting } from '../core/simLaneCommands.js';

/** The preset the offer applies — the Quality mode row's "High performance". */
export const SLOW_OFFER_PRESET = 'low';
/** Id the Switch button carries; toasts.js resolves it through registerToastAction. */
export const SLOW_OFFER_ACTION_ID = 'slow-frame-offer';

export const SLOW_OFFER_TOAST = Object.freeze({
  text: 'SpaceFace is running slowly on this device. Switch to the Performance preset?',
  kind: 'info',
  ttl: 14,
  action: Object.freeze({
    id: SLOW_OFFER_ACTION_ID,
    label: 'Switch',
    ariaLabel: 'Switch to the High performance preset',
  }),
});

// Names the row where the player finds it again (Settings → Video → Quality mode). "saved" is true
// (settings:changed persists the profile) and keeps the line readable while a fight has the
// receipt lane quiet (hudAttention COMBAT_KEEP).
export const SLOW_OFFER_CONFIRM_TOAST = Object.freeze({
  text: 'High performance preset on, saved. Change it any time in Settings → Video.',
  kind: 'info',
  ttl: 6,
});

// Presets that are already budgeted for weak silicon (renderer._budgetPostQualityPreset): nothing
// faster to offer, and the integrated bundle has its own boot suggestion.
const PERFORMANCE_CLASS_PRESETS = Object.freeze(['low', 'integrated', 'igpu60']);

export const SLOW_WATCH_DEFAULTS = Object.freeze({
  /** A frame longer than this counts as slow: 34.5 ms is just under 29 fps, so a 30 Hz-locked
   *  presentation (33.3 ms ± jitter) is not slow, and a genuine 28 fps one is. */
  slowFrameMs: 34.5,
  /** Median must stay slow across this many seconds of counted flight. */
  windowSeconds: 20,
  /** Counted flight time ignored first: shader/asset admission frames right after the opening. */
  settleSeconds: 5,
  /** The loop clamps frame time to 250 ms, so a sample this long carries no real timing (a
   *  throttled or backgrounded pane reports it for every frame). Skipped, never counted. */
  untrustedFrameMs: 240,
  /** A gap this long is a suspend/tab switch, not a frame: the window starts over. */
  discontinuityMs: 1000,
});

/**
 * The detector. `sample(dtMs, eligible)` is called once per presented frame and returns true on
 * the frame that closes a one-second bucket while the whole window is full and its median frame
 * time is slow. An ineligible frame (menu, dock, hidden tab, software renderer...) restarts the
 * window: "sustained" means one unbroken stretch of flight.
 *
 * The median is slow exactly when more than half of the window's frames are slow, so the ring
 * keeps two counts per bucket instead of the samples.
 */
export function createSlowFrameWatch(options = {}) {
  const cfg = { ...SLOW_WATCH_DEFAULTS, ...options };
  const buckets = Math.max(1, Math.floor(cfg.windowSeconds));
  const settleMs = Math.max(0, cfg.settleSeconds) * 1000;
  const frames = new Int32Array(buckets);
  const slow = new Int32Array(buckets);
  let head = 0;           // next bucket slot to write
  let filled = 0;         // closed buckets in the ring (<= buckets)
  let bucketMs = 0;
  let bucketFrames = 0;
  let bucketSlow = 0;
  let settledMs = 0;

  function reset() {
    frames.fill(0);
    slow.fill(0);
    head = 0;
    filled = 0;
    bucketMs = 0;
    bucketFrames = 0;
    bucketSlow = 0;
    settledMs = 0;
  }

  function windowIsSlow() {
    let total = 0;
    let slowTotal = 0;
    for (let i = 0; i < buckets; i++) {
      total += frames[i];
      slowTotal += slow[i];
    }
    return total > 0 && slowTotal * 2 > total;
  }

  return {
    sample(dtMs, eligible) {
      if (eligible !== true) { reset(); return false; }
      const dt = Number(dtMs);
      if (!(dt > 0) || dt >= cfg.discontinuityMs) { reset(); return false; }
      if (dt >= cfg.untrustedFrameMs) return false;
      if (settledMs < settleMs) { settledMs += dt; return false; }
      bucketMs += dt;
      bucketFrames++;
      if (dt > cfg.slowFrameMs) bucketSlow++;
      if (bucketMs < 1000) return false;
      frames[head] = bucketFrames;
      slow[head] = bucketSlow;
      head = (head + 1) % buckets;
      if (filled < buckets) filled++;
      bucketMs = 0;
      bucketFrames = 0;
      bucketSlow = 0;
      return filled >= buckets && windowIsSlow();
    },
    reset,
    /** Seconds of the window filled so far, for diagnostics and tests. */
    get filledSeconds() { return filled; },
  };
}

/** True when the video block is already on a preset at least as light as the offer. */
export function alreadyOnPerformancePreset(video) {
  if (!video || typeof video !== 'object') return false;
  if (PERFORMANCE_CLASS_PRESETS.includes(video.qualityPreset)) return true;
  return videoMatchesQualityTier(video, SLOW_OFFER_PRESET);
}

/**
 * Apply a preset exactly as the Settings screen does: presentation keys only, then one
 * `settings:changed` per key that moved (the renderer live-applies each, the save system persists
 * the profile) with the sim-lane mirror written alongside. Returns the applied record or null.
 */
export function applyPresetThroughSettings(state, bus, presetId = SLOW_OFFER_PRESET) {
  if (!state || !state.settings) return null;
  const applied = applyQualityPreset(state.settings, presetId);
  if (!applied) return null;
  const video = state.settings.video;
  for (const key of applied.changed) {
    const value = video[key];
    laneWriteSetting(state, 'settings.video.' + key, value);
    if (bus && typeof bus.emit === 'function') bus.emit('settings:changed', { section: 'video', key, value });
  }
  return applied;
}

// A fight or a critical hull has the receipt lane quiet (hudAttention.admitReceipt 'combat-quiet'):
// an info receipt emitted then would be dropped and the once-per-session offer spent unseen.
function hudQuiet() {
  try {
    const job = typeof document !== 'undefined' && document.body && document.body.dataset
      ? document.body.dataset.sfHudJob
      : '';
    return job !== 'fight' && job !== 'hurt';
  } catch (_) {
    return true;
  }
}

function documentHidden() {
  return typeof document !== 'undefined' && document.hidden === true;
}

/**
 * Wire the offer to a running game. `onPresented()` goes in the presentation runner's
 * per-present hook; `accept()` is what the Switch button calls (see registerToastAction).
 *
 * options: { watch, canShow, isHidden } — seams for tests; production passes none.
 */
export function installSlowFrameOffer({ state, bus, watch, canShow = hudQuiet, isHidden = documentHidden } = {}) {
  const detector = watch || createSlowFrameWatch();
  let offered = false;
  let accepted = false;

  function eligible() {
    if (offered || !state || state.mode !== 'flight') return false;
    const render = state.render;
    // Past the opening: the first playable frame has been minted (loading frames never count).
    if (!render || !Number.isFinite(render.firstPlayableFrameAt)) return false;
    const gpu = render.gpu;
    if (gpu && (gpu.software === true || gpu.tier === 'software')) return false;
    if (isHidden()) return false;
    // The preset id is a string compare per frame; the full "video block matches low" test (which
    // walks every preset key) waits for the verdict below.
    const video = state.settings && state.settings.video;
    if (video && PERFORMANCE_CLASS_PRESETS.includes(video.qualityPreset)) return false;
    return true;
  }

  function onPresented() {
    if (offered) return;
    const dt = state && state.render ? state.render.lastPresentDtMs : 0;
    if (!detector.sample(dt, eligible())) return;
    // The window is slow (at most once a second from here). A hand-tuned block that already
    // equals the preset has nothing to offer; otherwise hold the offer until a receipt can be
    // seen, and let the next bucket closing re-ask while the window stays slow.
    if (alreadyOnPerformancePreset(state.settings && state.settings.video)) return;
    if (!canShow()) return;
    offered = true;
    // Fresh copies, as renderer.js emits its toasts: a listener that writes to a payload must not
    // hit the frozen constant (modules are strict, so the write would throw inside the bus).
    if (bus && typeof bus.emit === 'function') bus.emit('toast', { ...SLOW_OFFER_TOAST, action: { ...SLOW_OFFER_TOAST.action } });
  }

  function accept() {
    if (accepted) return null;
    accepted = true;
    offered = true;
    const applied = applyPresetThroughSettings(state, bus, SLOW_OFFER_PRESET);
    if (applied && bus && typeof bus.emit === 'function') bus.emit('toast', { ...SLOW_OFFER_CONFIRM_TOAST });
    return applied;
  }

  return {
    onPresented,
    accept,
    /** True once the offer toast has been emitted this session. */
    get offered() { return offered; },
    get accepted() { return accepted; },
    watch: detector,
  };
}
