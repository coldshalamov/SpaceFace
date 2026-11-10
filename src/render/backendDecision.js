// Decide the rendering backend from measured evidence, and decide when the browser has run out.
//
// WHY THIS IS CODE AND NOT A DOCUMENT
// -----------------------------------
// "Should we move to WebGPU?" and "is it time to go native?" are the two questions most likely to be
// answered by taste, vendor enthusiasm, or whoever argued last. Both are decidable from numbers, and
// writing the decision as a function with explicit thresholds forces the numbers to exist: this
// module cannot return a verdict without evidence, and it records which threshold decided.
//
// The thresholds are the argument. They are stated here so disagreeing with a verdict means
// disagreeing with a number, not with a mood.

export const BACKEND_DECISION_SCHEMA = 'spaceface.backendDecision.v1';

/**
 * A backend swap is a large, risky rewrite of the hot path. It has to buy enough to be worth that,
 * and "enough" needs a number rather than a feeling.
 *
 * `minFrameTimeGainRatio` is 1.25 because anything under a quarter is inside the noise band of
 * driver and machine variation — a win that small cannot be distinguished from a good afternoon.
 * `maxParityRegressions` is 0 because a backend that renders the scene differently is not a faster
 * backend, it is a different game.
 */
export const WEBGPU_ADOPTION_THRESHOLDS = Object.freeze({
  minFrameTimeGainRatio: 1.25,
  maxParityRegressions: 0,
  minSampleFrames: 600,
});

/**
 * The hard native trigger.
 *
 * Native is not a reward for the browser being slow; it is what happens when the browser cannot meet
 * the budget *after* the structural work is done. So the trigger requires the optimization work to
 * be exhausted first — otherwise "go native" becomes a way to avoid fixing an algorithm.
 *
 * p99 rather than average: a 60 fps average with a 90 ms tail is a worse game than a steady 50 fps,
 * and averages hide exactly the frames players feel.
 */
export const NATIVE_TRIGGER_THRESHOLDS = Object.freeze({
  floorFrameMs: 33.3,
  p99CeilingMs: 50,
  minQuietMachineRuns: 3,
  requiresWorkFamiliesExhausted: true,
});

function insufficient(reason, missing) {
  return Object.freeze({
    schema: BACKEND_DECISION_SCHEMA,
    verdict: 'insufficient-evidence',
    reason,
    missing: Object.freeze([...missing]),
    decidedBy: null,
  });
}

/**
 * Decide whether to adopt WebGPU.
 *
 * Refuses rather than defaults when evidence is missing. A default here would be an assumption
 * wearing a verdict's clothes, and the whole point is that the decision is evidence-driven.
 */
export function decideWebGpuAdoption(evidence, thresholds = WEBGPU_ADOPTION_THRESHOLDS) {
  const missing = [];
  if (!evidence || typeof evidence !== 'object') return insufficient('no evidence supplied', ['evidence']);
  if (!Number.isFinite(evidence.webgl2FrameMsP95)) missing.push('webgl2FrameMsP95');
  if (!Number.isFinite(evidence.webgpuFrameMsP95)) missing.push('webgpuFrameMsP95');
  if (!Number.isFinite(evidence.sampleFrames)) missing.push('sampleFrames');
  if (!Number.isFinite(evidence.parityRegressions)) missing.push('parityRegressions');
  if (missing.length) return insufficient('backend comparison is incomplete', missing);

  if (evidence.sampleFrames < thresholds.minSampleFrames) {
    return insufficient(
      `only ${evidence.sampleFrames} frames sampled; ${thresholds.minSampleFrames} needed to see the tail`,
      ['sampleFrames'],
    );
  }

  const gain = evidence.webgl2FrameMsP95 / evidence.webgpuFrameMsP95;
  if (evidence.parityRegressions > thresholds.maxParityRegressions) {
    return Object.freeze({
      schema: BACKEND_DECISION_SCHEMA,
      verdict: 'stay-webgl2',
      reason: `${evidence.parityRegressions} parity regression(s); a backend that renders differently is not a faster backend`,
      gain,
      decidedBy: 'maxParityRegressions',
    });
  }
  if (gain < thresholds.minFrameTimeGainRatio) {
    return Object.freeze({
      schema: BACKEND_DECISION_SCHEMA,
      verdict: 'stay-webgl2',
      reason: `${gain.toFixed(2)}x p95 gain is below the ${thresholds.minFrameTimeGainRatio}x bar and inside driver noise`,
      gain,
      decidedBy: 'minFrameTimeGainRatio',
    });
  }
  return Object.freeze({
    schema: BACKEND_DECISION_SCHEMA,
    verdict: 'adopt-webgpu',
    reason: `${gain.toFixed(2)}x p95 gain with no parity regressions`,
    gain,
    decidedBy: 'minFrameTimeGainRatio',
  });
}

/**
 * Decide whether the browser has run out of room.
 *
 * Requires the work families to be exhausted first. Without that condition this becomes a way to
 * skip an unfinished optimization by declaring the platform at fault.
 */
export function decideNativeTrigger(evidence, thresholds = NATIVE_TRIGGER_THRESHOLDS) {
  const missing = [];
  if (!evidence || typeof evidence !== 'object') return insufficient('no evidence supplied', ['evidence']);
  if (!Number.isFinite(evidence.frameMsP99)) missing.push('frameMsP99');
  if (!Number.isFinite(evidence.quietMachineRuns)) missing.push('quietMachineRuns');
  if (typeof evidence.workFamiliesExhausted !== 'boolean') missing.push('workFamiliesExhausted');
  if (missing.length) return insufficient('corridor certification is incomplete', missing);

  if (evidence.quietMachineRuns < thresholds.minQuietMachineRuns) {
    return insufficient(
      `${evidence.quietMachineRuns} quiet-machine run(s); ${thresholds.minQuietMachineRuns} needed before trusting a tail`,
      ['quietMachineRuns'],
    );
  }
  if (thresholds.requiresWorkFamiliesExhausted && !evidence.workFamiliesExhausted) {
    return Object.freeze({
      schema: BACKEND_DECISION_SCHEMA,
      verdict: 'stay-browser',
      reason: 'structural work families are not exhausted; native must not substitute for an unfinished optimization',
      decidedBy: 'requiresWorkFamiliesExhausted',
    });
  }
  if (evidence.frameMsP99 > thresholds.p99CeilingMs) {
    return Object.freeze({
      schema: BACKEND_DECISION_SCHEMA,
      verdict: 'go-native',
      reason: `p99 ${evidence.frameMsP99.toFixed(1)}ms exceeds the ${thresholds.p99CeilingMs}ms ceiling with structural work exhausted`,
      decidedBy: 'p99CeilingMs',
    });
  }
  return Object.freeze({
    schema: BACKEND_DECISION_SCHEMA,
    verdict: 'stay-browser',
    reason: `p99 ${evidence.frameMsP99.toFixed(1)}ms is within the ${thresholds.p99CeilingMs}ms ceiling`,
    decidedBy: 'p99CeilingMs',
  });
}
