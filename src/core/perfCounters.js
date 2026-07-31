// Tier-1 deterministic performance counters.
//
// WHY THIS IS SEPARATE FROM perfRuntime.js
// ----------------------------------------
// `perfRuntime.js` measures DURATIONS. Every number it produces is a wall-clock span, so every
// number it produces is only as trustworthy as the machine it was captured on. This workstation
// routinely runs many concurrent agents; a millisecond captured here is informational, never
// evidence.
//
// This module measures COUNTS, SIZES and IDENTITIES — never durations. "47 shader programs were
// linked after the first playable frame" means exactly the same thing on an idle machine and on a
// machine running twelve agents, because CPU contention cannot change an integer. That property is
// the entire point: it is what makes a counter delta between two commits a real regression rather
// than noise, and therefore bisectable.
//
// Do not add a timing field to this module. If you need timings, they belong in perfRuntime (Tier 2)
// and must be captured in a separate run — the GL wrappers that feed these counters deoptimise the
// hottest calls in the frame, so counts and timings taken together would be instrument-distorted.
//
// ZERO COST WHEN OFF
// ------------------
// This is a performance tool; it must not be a performance problem. Every entry point begins with a
// single boolean read and returns. There is no allocation, no closure creation, no string building
// and no array push on the disabled path — `test/perf-counters.test.mjs` proves it by driving 5,000
// disabled frames and asserting the event list, the histogram and every total are still untouched.
// The heavier observers (GL context wrappers, MutationObserver) are not merely branched over but
// INSTALLED ON ENABLE, so when disabled they do not exist as call sites at all.
//
// DETERMINISM
// -----------
// Not every counter here is reproducible run to run, and pretending otherwise would make the
// equivalence gate either vacuous or permanently red. `DETERMINISTIC_FIELDS` is the explicit
// allowlist the gate compares; everything else is reported but excluded. See
// design/program/roadmap/PERF_INSTRUMENTATION_INVENTORY.md §4 for why each exclusion is there.

export const PERF_COUNTERS_SCHEMA = 'spaceface.perfCounters.v1';

// Counter fields, in report order. Kept as one frozen list so the per-frame reset is a fixed loop
// over known keys rather than an Object.keys() allocation on every frame.
export const COUNTER_FIELDS = Object.freeze([
  // A — shader programs. The highest-value family: a link is a 50-300 ms main-thread stall.
  'shaderLinks',
  'shaderCompiles',
  // B — render targets.
  'renderTargetAllocations',
  'renderTargetResizes',
  // C — textures.
  'textureUploads',
  'textureSubUploads',
  'mipmapGenerations',
  // D — buffers.
  'bufferFullUploads',
  'bufferPartialUploads',
  'bufferUploadBytes',
  // E — draw and state.
  'drawCalls',
  'drawInstancedCalls',
  'programSwitches',
  'textureBinds',
  // H — DOM.
  'domMutations',
  'domChildListMutations',
  'domAttributeMutations',
  'domCharacterDataMutations',
  'layoutReads',
  'longTasks',
]);

// The subset the equivalence gate may assert byte-identity on. Everything omitted here is still
// reported — it is simply not treated as a bisectable signal.
//
// Excluded, and why:
//   drawCalls / drawInstancedCalls / programSwitches / textureBinds
//       Culling-dependent. Deterministic only under a synthetic monotonic frame pump, not under
//       wall-clock rAF, so they cannot be asserted by a gate that runs in a real browser frame loop.
//   textureUploads / textureSubUploads
//       Include canvas-sourced HUD textures, which vary with font and DOM timing.
//   layoutReads / longTasks / domMutations family
//       Depend on browser scheduling and on when the HUD's own async work lands.
export const DETERMINISTIC_FIELDS = Object.freeze([
  'shaderLinks',
  'shaderCompiles',
  'renderTargetAllocations',
  'renderTargetResizes',
  'mipmapGenerations',
  'bufferFullUploads',
  'bufferPartialUploads',
  'bufferUploadBytes',
]);

// Counters that are DECLARED but have no producer wired yet.
//
// This list exists because an unsourced counter and a perfectly healthy subsystem report the same
// thing: 0. Reading `layoutReads: 0` as "no forced layouts, healthy" while nothing calls
// countLayoutRead() would be exactly the vacuous zero this whole design is built to avoid, and it
// would be believed precisely because it is the answer everyone wants.
//
// The list is currently EMPTY: every declared field has a producer. Family H (DOM mutations,
// layout reads, longtasks) was wired by Phase 3a in src/ui/domInstrumentation.js (installed from
// the renderer construction seam), and the family G heap sampler was wired by Phase 3c in
// src/core/presentationRunner.js. The list and its discipline stay for future fields: a new
// counter field enters this list when it is declared, and wiring its producer means DELETING the
// field here in the same change. `snapshot()` republishes the list so no downstream report can
// present an unsourced field as a measurement.
export const UNSOURCED_FIELDS = Object.freeze([
]);

// Bounded so a pathological run cannot grow this without limit. A compile storm is fully
// characterised by its first few hundred events; the counts stay exact regardless of this cap.
const MAX_RECORDED_EVENTS = 512;

function createFieldBag() {
  const bag = Object.create(null);
  for (const field of COUNTER_FIELDS) bag[field] = 0;
  return bag;
}

function resetFieldBag(bag) {
  for (const field of COUNTER_FIELDS) bag[field] = 0;
}

/**
 * Has a measurement probe asked for Tier-1 instrumentation?
 *
 * Read once, at renderer construction, because the GL wrappers are install-on-enable: there is no
 * way to start counting mid-session without leaving a report whose provenance is invisible. Two
 * opt-ins, both explicit and both unavailable to ordinary play:
 *
 *   window.__SPACEFACE_PERF_COUNTERS__ = true   set by a Playwright addInitScript before boot
 *   ?perfCounters=1                             set by a human driving the game by hand
 *
 * Deliberately NOT gated on SF_DEBUG. `window.SF` is absent from a production bundle
 * (src/main.js:40), and invariant #5 requires the browser and Electron routes to produce the same
 * counters for the same scenario — a debug-only seam could not satisfy that.
 */
export function perfCountersRequested() {
  if (typeof window === 'undefined') return false;
  if (window.__SPACEFACE_PERF_COUNTERS__ === true) return true;
  try {
    return new URLSearchParams(window.location?.search || '').get('perfCounters') === '1';
  } catch (_) {
    return false;   // exotic location objects must not break boot
  }
}

/**
 * Create a Tier-1 counter set. Default OFF.
 *
 * The returned object is the single sink every instrumentation source writes into: the GL context
 * wrappers, the DOM observer and the frame loop all call methods here rather than keeping private
 * tallies, so there is exactly one place a report is assembled from and no second copy to drift.
 */
export function createPerfCounters() {
  let enabled = false;
  let frameIndex = 0;
  let framesObserved = 0;
  // The frame index at which the boot boundary was declared, and the frame tally at that moment.
  // Both are kept so `postBootFrames` is an exact subtraction rather than an index arithmetic that
  // is off by one depending on whether a frame happened to be open when the boundary was marked.
  let bootBoundaryFrame = -1;
  let framesObservedAtBoundary = 0;

  const frame = createFieldBag();     // reset every frame; feeds peak and nonZeroFrames only
  const totals = createFieldBag();    // accumulated AT RECORD TIME — see the note below
  const peak = createFieldBag();      // worst single frame
  const postBoot = createFieldBag();  // accumulated at record time, after markBootBoundary()
  const offFrame = createFieldBag();  // recorded outside any beginFrame/endFrame pair
  const nonZeroFrames = createFieldBag();
  let insideFrame = false;
  let afterBootBoundary = false;

  const events = [];
  let eventsDropped = 0;
  const stepsPerFrameHistogram = Object.create(null);

  // Nondeterministic by construction (G). Kept apart from the field bags so it cannot be mistaken
  // for a Tier-1 signal or accidentally swept into the equivalence gate.
  const allocation = { heapBytesDeltaTotal: 0, collectionsDetected: 0, samples: 0, lastHeapBytes: 0 };

  /**
   * The one accumulation path. Every counter routes through here.
   *
   * `totals` is incremented HERE and not in endFrame(), because a large share of the work worth
   * counting does not happen inside the rAF callback at all:
   *
   *   - The boot shader ramp links before the first presentation frame ever runs. That ramp is the
   *     positive control that stops a post-boot zero from being vacuous, so losing it would quietly
   *     defeat the only guard against a dead hook.
   *   - `precompilePipelines` uses `renderer.compileAsync`, which finishes on a promise
   *     continuation. That is precisely the traverse -> prepareMaterial -> linkProgram class the
   *     first capture found.
   *   - Texture decodes and asset-load uploads land on their own callbacks.
   *
   * Accumulating totals in endFrame() would let beginFrame()'s reset discard all of it, and the
   * failure would read as good news — a smaller number, not an error. `frame` therefore feeds only
   * the per-frame derivatives (peak, nonZeroFrames), which are the only figures that are genuinely
   * per-frame.
   */
  function record(field, amount) {
    // The single boolean read that the whole zero-cost claim rests on.
    if (!enabled) return;
    totals[field] += amount;
    if (afterBootBoundary) postBoot[field] += amount;
    if (insideFrame) frame[field] += amount;
    else offFrame[field] += amount;
  }

  const api = {
    schema: PERF_COUNTERS_SCHEMA,

    isEnabled() { return enabled === true; },
    setEnabled(on) {
      const next = !!on;
      // Re-enabling mid-capture without a reset would blend two windows into one report, and the
      // blend is invisible in the output. Make the boundary explicit instead.
      if (next && !enabled) api.reset();
      enabled = next;
      return enabled;
    },

    /**
     * Mark the end of boot. Everything recorded after this call is post-boot, and post-boot is what
     * every zero-budget in the brief's §7 is actually about.
     *
     * Called by the MEASUREMENT PROBE, not by the runtime, and deliberately so: "boot has settled"
     * is a quiescence predicate over observed counts (K consecutive frames that linked no new
     * program), and evaluating it belongs with the harness that also owns the scenario. Putting a
     * wall-clock or heuristic boundary in the runtime would bake a moving definition into shipped
     * code. Reachable from `__SPACEFACE_PERF__.tier1.markBootBoundary()`, which exists on both the
     * browser and Electron routes because __SPACEFACE_PERF__ is not debug-gated.
     */
    markBootBoundary() {
      if (!enabled) return -1;
      bootBoundaryFrame = frameIndex;
      framesObservedAtBoundary = framesObserved;
      afterBootBoundary = true;
      return bootBoundaryFrame;
    },
    getBootBoundaryFrame() { return bootBoundaryFrame; },
    getFrameIndex() { return frameIndex; },

    beginFrame() {
      if (!enabled) return;
      resetFieldBag(frame);
      insideFrame = true;
    },

    endFrame() {
      if (!enabled) return;
      // Totals were already accumulated at record time; this only derives the per-frame figures.
      for (const field of COUNTER_FIELDS) {
        const value = frame[field];
        if (value > peak[field]) peak[field] = value;
        if (value !== 0) nonZeroFrames[field]++;
      }
      insideFrame = false;
      frameIndex++;
      framesObserved++;
    },

    // --- Counter entry points -------------------------------------------------------------------
    // One per family. `amount` defaults to 1 so the GL wrappers stay branch-free at the call site.

    countShaderLink(cacheKey = '', name = '') {
      if (!enabled) return;
      record('shaderLinks', 1);
      api.recordEvent('shaderLink', { cacheKey, name });
    },
    countShaderCompile() { record('shaderCompiles', 1); },
    countRenderTargetAllocation(width = 0, height = 0) {
      if (!enabled) return;
      record('renderTargetAllocations', 1);
      api.recordEvent('renderTargetAllocation', { width, height });
    },
    countRenderTargetResize(width = 0, height = 0) {
      if (!enabled) return;
      record('renderTargetResizes', 1);
      api.recordEvent('renderTargetResize', { width, height });
    },
    countTextureUpload(full = true) {
      record(full ? 'textureUploads' : 'textureSubUploads', 1);
    },
    countMipmapGeneration() { record('mipmapGenerations', 1); },
    countBufferUpload(full, bytes = 0) {
      if (!enabled) return;
      record(full ? 'bufferFullUploads' : 'bufferPartialUploads', 1);
      record('bufferUploadBytes', Number.isFinite(bytes) && bytes > 0 ? bytes : 0);
    },
    countDraw(instanced = false) {
      if (!enabled) return;
      record('drawCalls', 1);
      if (instanced) record('drawInstancedCalls', 1);
    },
    countProgramSwitch() { record('programSwitches', 1); },
    countTextureBind() { record('textureBinds', 1); },
    countLayoutRead() { record('layoutReads', 1); },
    countLongTask() { record('longTasks', 1); },
    countDomMutation(type) {
      if (!enabled) return;
      record('domMutations', 1);
      if (type === 'childList') record('domChildListMutations', 1);
      else if (type === 'attributes') record('domAttributeMutations', 1);
      else if (type === 'characterData') record('domCharacterDataMutations', 1);
    },

    /** Steps-per-frame DISTRIBUTION (I). perfRuntime keeps a max and a multi-step count; a
     *  histogram is what actually distinguishes "occasionally 2" from "routinely 4". */
    recordStepsThisFrame(steps) {
      if (!enabled) return;
      const key = String(Number.isFinite(steps) ? steps | 0 : 0);
      stepsPerFrameHistogram[key] = (stepsPerFrameHistogram[key] || 0) + 1;
    },

    /** Nondeterministic (G): a heap-size sample. A drop is read as a collection. */
    sampleHeap(usedBytes) {
      if (!enabled || !Number.isFinite(usedBytes)) return;
      if (allocation.samples > 0) {
        const delta = usedBytes - allocation.lastHeapBytes;
        if (delta < 0) allocation.collectionsDetected++;
        else allocation.heapBytesDeltaTotal += delta;
      }
      allocation.lastHeapBytes = usedBytes;
      allocation.samples++;
    },

    recordEvent(kind, detail) {
      if (!enabled) return;
      if (events.length >= MAX_RECORDED_EVENTS) { eventsDropped++; return; }
      events.push({ frame: frameIndex, kind, ...detail });
    },

    reset() {
      frameIndex = 0;
      framesObserved = 0;
      bootBoundaryFrame = -1;
      framesObservedAtBoundary = 0;
      resetFieldBag(frame);
      resetFieldBag(totals);
      resetFieldBag(peak);
      resetFieldBag(postBoot);
      resetFieldBag(offFrame);
      resetFieldBag(nonZeroFrames);
      insideFrame = false;
      afterBootBoundary = false;
      events.length = 0;
      eventsDropped = 0;
      for (const key of Object.keys(stepsPerFrameHistogram)) delete stepsPerFrameHistogram[key];
      allocation.heapBytesDeltaTotal = 0;
      allocation.collectionsDetected = 0;
      allocation.samples = 0;
      allocation.lastHeapBytes = 0;
    },

    /** Caller-owned snapshot. Allocates, so this is a report-time call, never a per-frame one. */
    snapshot() {
      return {
        schema: PERF_COUNTERS_SCHEMA,
        enabled,
        framesObserved,
        bootBoundaryFrame,
        postBootFrames: bootBoundaryFrame >= 0 ? framesObserved - framesObservedAtBoundary : 0,
        deterministicFields: [...DETERMINISTIC_FIELDS],
        // Republished so a report cannot present "0" from a counter that has no producer as though
        // it were a measurement. A reader who ignores this will conclude the HUD performs no forced
        // layouts, which is not something this run established either way.
        unsourcedFields: [...UNSOURCED_FIELDS],
        totals: { ...totals },
        postBoot: { ...postBoot },
        peakPerFrame: { ...peak },
        // Work that landed outside any beginFrame/endFrame pair. Diagnostic in its own right: a
        // shader link here is an async compile (compileAsync, asset load), while one inside a frame
        // is a draw-time cache miss stalling the frame being drawn. Same counter, different defect.
        offFrame: { ...offFrame },
        nonZeroFrames: { ...nonZeroFrames },
        stepsPerFrameHistogram: { ...stepsPerFrameHistogram },
        // Segregated, and labelled, so no reader mistakes it for a bisectable counter.
        nondeterministic: {
          allocation: { ...allocation },
        },
        events: events.slice(),
        eventsDropped,
      };
    },
  };

  return api;
}

/**
 * Compare two snapshots over the deterministic allowlist only.
 * Returns the differing fields; an empty array means the two runs agree where agreement is required.
 */
export function diffDeterministicCounters(a, b) {
  const differences = [];
  for (const field of DETERMINISTIC_FIELDS) {
    const left = a?.totals?.[field] ?? null;
    const right = b?.totals?.[field] ?? null;
    if (left !== right) differences.push({ field, left, right });
  }
  return differences;
}
