#!/usr/bin/env node
// Gate that the backend and native decisions are driven by evidence rather than by assumption.
//
// The failure mode being prevented is a decision function that always says yes, or always says no,
// and is therefore just an opinion with a return type. So the check drives both functions across the
// thresholds in both directions, and separately proves they REFUSE when evidence is missing —
// because a function that guesses when it lacks data is worse than one that throws.

import {
  decideWebGpuAdoption,
  decideNativeTrigger,
  WEBGPU_ADOPTION_THRESHOLDS,
  NATIVE_TRIGGER_THRESHOLDS,
} from '../src/render/backendDecision.js';

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) { console.log(`ok   ${name}`); return; }
  failures++;
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

const FRAMES = WEBGPU_ADOPTION_THRESHOLDS.minSampleFrames;

// --- WebGPU: the verdict must move with the evidence ---------------------------------------------
{
  const clearWin = decideWebGpuAdoption({
    webgl2FrameMsP95: 20, webgpuFrameMsP95: 12, sampleFrames: FRAMES, parityRegressions: 0,
  });
  check('a large, clean gain adopts WebGPU', clearWin.verdict === 'adopt-webgpu', clearWin.reason);

  const marginal = decideWebGpuAdoption({
    webgl2FrameMsP95: 20, webgpuFrameMsP95: 18, sampleFrames: FRAMES, parityRegressions: 0,
  });
  check('a gain inside driver noise stays on WebGL2', marginal.verdict === 'stay-webgl2', marginal.reason);
  check('the marginal verdict names the threshold that decided it',
    marginal.decidedBy === 'minFrameTimeGainRatio', String(marginal.decidedBy));

  const broken = decideWebGpuAdoption({
    webgl2FrameMsP95: 20, webgpuFrameMsP95: 8, sampleFrames: FRAMES, parityRegressions: 1,
  });
  check('a parity regression outweighs any speed gain', broken.verdict === 'stay-webgl2', broken.reason);
  check('parity is what decided it', broken.decidedBy === 'maxParityRegressions', String(broken.decidedBy));
}

// --- WebGPU: refuse rather than default ----------------------------------------------------------
{
  const noEvidence = decideWebGpuAdoption(null);
  check('no evidence yields no verdict', noEvidence.verdict === 'insufficient-evidence', noEvidence.reason);

  const partial = decideWebGpuAdoption({ webgl2FrameMsP95: 20 });
  check('partial evidence yields no verdict', partial.verdict === 'insufficient-evidence', partial.reason);
  check('the refusal names what is missing',
    partial.missing.includes('webgpuFrameMsP95') && partial.missing.includes('parityRegressions'),
    partial.missing.join(','));

  const shortRun = decideWebGpuAdoption({
    webgl2FrameMsP95: 20, webgpuFrameMsP95: 10, sampleFrames: 30, parityRegressions: 0,
  });
  check('too few frames to see the tail yields no verdict',
    shortRun.verdict === 'insufficient-evidence', shortRun.reason);
}

// --- native trigger ------------------------------------------------------------------------------
{
  const runs = NATIVE_TRIGGER_THRESHOLDS.minQuietMachineRuns;

  const unfinished = decideNativeTrigger({
    frameMsP99: 120, quietMachineRuns: runs, workFamiliesExhausted: false,
  });
  check('a bad p99 with unfinished optimization does NOT trigger native',
    unfinished.verdict === 'stay-browser', unfinished.reason);
  check('the unfinished-work condition is what decided it',
    unfinished.decidedBy === 'requiresWorkFamiliesExhausted', String(unfinished.decidedBy));

  const exhausted = decideNativeTrigger({
    frameMsP99: 120, quietMachineRuns: runs, workFamiliesExhausted: true,
  });
  check('a bad p99 with structural work exhausted triggers native',
    exhausted.verdict === 'go-native', exhausted.reason);

  const healthy = decideNativeTrigger({
    frameMsP99: 28, quietMachineRuns: runs, workFamiliesExhausted: true,
  });
  check('a healthy p99 stays in the browser', healthy.verdict === 'stay-browser', healthy.reason);

  const noisy = decideNativeTrigger({
    frameMsP99: 120, quietMachineRuns: 1, workFamiliesExhausted: true,
  });
  check('a single noisy run is not enough to condemn the platform',
    noisy.verdict === 'insufficient-evidence', noisy.reason);

  const partial = decideNativeTrigger({ frameMsP99: 120 });
  check('incomplete certification yields no verdict',
    partial.verdict === 'insufficient-evidence', partial.missing.join(','));
}

console.log(`\n${failures === 0 ? 'backend decision: evidence decides, not assumption' : `${failures} assertion(s) failed`}`);
if (failures > 0) process.exit(1);
