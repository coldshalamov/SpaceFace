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
// and no array push on the disabled path — `test/perf-counters-zero-cost.test.mjs` proves it by
// asserting that a disabled counter set is structurally identical before and after a large number of
// calls. The heavier observers (GL context wrappers, MutationObserver) are not merely branched over
// but INSTALLED ON ENABLE, so when disabled they do not exist as call sites at all.
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
  // Frames are counted from the moment the boot boundary is declared, so "post-boot compiles" is a
  // property of the report rather than something each caller has to recompute.
  let bootBoundaryFrame = -1;

  const frame = createFieldBag();     // reset every frame
  const totals = createFieldBag();    // accumulated across the capture
  const peak = createFieldBag();      // worst single frame
  const postBoot = createFieldBag();  // accumulated only after the boot boundary
  const nonZeroFrames = createFieldBag();

  const events = [];
  let eventsDropped = 0;
  const stepsPerFrameHistogram = Object.create(null);

  // Nondeterministic by construction (G). Kept apart from the field bags so it cannot be mistaken
  // for a Tier-1 signal or accidentally swept into the equivalence gate.
  const allocation = { heapBytesDeltaTotal: 0, collectionsDetected: 0, samples: 0, lastHeapBytes: 0 };

  function record(field, amount) {
    // The single boolean read that the whole zero-cost claim rests on.
    if (!enabled) return;
    frame[field] += amount;
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

    /** Mark the end of boot. Counts after this point are what the zero-budgets in §7 apply to. */
    markBootBoundary() {
      if (!enabled) return -1;
      bootBoundaryFrame = frameIndex;
      return bootBoundaryFrame;
    },
    getBootBoundaryFrame() { return bootBoundaryFrame; },
    getFrameIndex() { return frameIndex; },

    beginFrame() {
      if (!enabled) return;
      resetFieldBag(frame);
    },

    endFrame() {
      if (!enabled) return;
      const afterBoot = bootBoundaryFrame >= 0 && frameIndex > bootBoundaryFrame;
      for (const field of COUNTER_FIELDS) {
        const value = frame[field];
        totals[field] += value;
        if (value > peak[field]) peak[field] = value;
        if (value !== 0) {
          nonZeroFrames[field]++;
          if (afterBoot) postBoot[field] += value;
        }
      }
      frameIndex++;
      framesObserved++;
    },

    // --- Counter entry points -------------------------------------------------------------------
    // One per family. `amount` defaults to 1 so the GL wrappers stay branch-free at the call site.

    countShaderLink(cacheKey = '', name = '') {
      if (!enabled) return;
      frame.shaderLinks += 1;
      api.recordEvent('shaderLink', { cacheKey, name });
    },
    countShaderCompile() { record('shaderCompiles', 1); },
    countRenderTargetAllocation(width = 0, height = 0) {
      if (!enabled) return;
      frame.renderTargetAllocations += 1;
      api.recordEvent('renderTargetAllocation', { width, height });
    },
    countRenderTargetResize(width = 0, height = 0) {
      if (!enabled) return;
      frame.renderTargetResizes += 1;
      api.recordEvent('renderTargetResize', { width, height });
    },
    countTextureUpload(full = true) {
      if (!enabled) return;
      if (full) frame.textureUploads += 1;
      else frame.textureSubUploads += 1;
    },
    countMipmapGeneration() { record('mipmapGenerations', 1); },
    countBufferUpload(full, bytes = 0) {
      if (!enabled) return;
      if (full) frame.bufferFullUploads += 1;
      else frame.bufferPartialUploads += 1;
      frame.bufferUploadBytes += Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
    },
    countDraw(instanced = false) {
      if (!enabled) return;
      frame.drawCalls += 1;
      if (instanced) frame.drawInstancedCalls += 1;
    },
    countProgramSwitch() { record('programSwitches', 1); },
    countTextureBind() { record('textureBinds', 1); },
    countLayoutRead() { record('layoutReads', 1); },
    countLongTask() { record('longTasks', 1); },
    countDomMutation(type) {
      if (!enabled) return;
      frame.domMutations += 1;
      if (type === 'childList') frame.domChildListMutations += 1;
      else if (type === 'attributes') frame.domAttributeMutations += 1;
      else if (type === 'characterData') frame.domCharacterDataMutations += 1;
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
      resetFieldBag(frame);
      resetFieldBag(totals);
      resetFieldBag(peak);
      resetFieldBag(postBoot);
      resetFieldBag(nonZeroFrames);
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
        postBootFrames: bootBoundaryFrame >= 0 ? Math.max(0, frameIndex - bootBoundaryFrame - 1) : 0,
        deterministicFields: [...DETERMINISTIC_FIELDS],
        totals: { ...totals },
        postBoot: { ...postBoot },
        peakPerFrame: { ...peak },
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
