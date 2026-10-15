export function selectPerformanceDiagnostic(results) {
  const severity = ({ summary: s }) => Math.max(s.callbackGaps?.p99 || 0,
    s.healthyCallbacksFrozenWorld > 0 ? s.maxWorldStaleMs || 0 : 0,
    s.healthyCallbacksFrozenSimulation > 0 ? s.maxSimStaleMs || 0 : 0,
    s.actualMeshObserved === true ? s.actualMeshStaleMs?.max || 0 : 0);
  return results.filter(r => r.summary).sort((a, b) => severity(b) - severity(a))[0] || null;
}

function actualMeshEvidence(summary) {
  const observed = summary?.actualMeshStatus === 'observed' || summary?.actualMeshObserved === true;
  const eligibleSamples = Number(summary?.actualMeshEligibleSamples);
  const rawMissingSamples = summary?.actualMeshMissingSamples;
  const missingSamples = typeof rawMissingSamples === 'number' && Number.isFinite(rawMissingSamples)
    ? rawMissingSamples : NaN;
  const stale = summary?.actualMeshStaleMs;
  const gaps = summary?.actualMeshPoseChangeGaps;
  const reasons = [];
  if (!observed || !(eligibleSamples > 0)) reasons.push('actual mesh pose unmeasured');
  if (!Number.isFinite(missingSamples) || missingSamples < 0) reasons.push('actual mesh missing-sample coverage unavailable');
  if (!(summary?.activeMs > 0)) reasons.push('active measurement window empty');
  if (!stale || !Number.isFinite(stale.count) || !Number.isFinite(stale.over50)) {
    reasons.push('actual mesh stale distribution unavailable');
  }
  if (!gaps || !Number.isFinite(gaps.count) || !Number.isFinite(gaps.over50)) {
    reasons.push('actual mesh pose-change distribution unavailable');
  }
  return {
    available: reasons.length === 0,
    reason: reasons.join('; ') || 'measured',
    eligibleSamples: eligibleSamples > 0 ? eligibleSamples : null,
    missingSamples: Number.isFinite(missingSamples) && missingSamples >= 0 ? missingSamples : null,
    missing: Number.isFinite(missingSamples) && missingSamples > 0,
    stale,
    gaps,
  };
}

function distributionTail(value, key) {
  return Number.isFinite(value?.[key]) ? value[key] : 0;
}

function lowerDistributionTail(before, after) {
  return distributionTail(after, 'p99') <= Math.max(34, distributionTail(before, 'p99') * 0.9)
    && distributionTail(after, 'max') <= Math.max(34, distributionTail(before, 'max') * 0.9);
}

export function comparePerformanceRuns(before, after, target = 3) {
  const keys = ['cpu', 'platform', 'gpu', 'userAgent', 'viewport', 'buffer', 'settings', 'simLane', 'mode', 'seed', 'sampleMs', 'settleMs', 'travelMs', 'observer', 'displayHz', 'probeDigest'];
  const mismatches = keys.filter(k => before.metadata[k] == null || after.metadata[k] == null
    || JSON.stringify(before.metadata[k]) !== JSON.stringify(after.metadata[k]));
  const a = before.summary, b = after.summary;
  const failures = [];
  if (before.metadata.sourceStable !== true || after.metadata.sourceStable !== true) {
    failures.push('source stability unverified or changed during capture');
  }
  if (mismatches.length) failures.push('identity mismatch: ' + mismatches.join(', '));
  if (!a.submissionObserved || !b.submissionObserved) failures.push('world submission unobserved');
  if (!(a.wallMs > 0 && b.wallMs > 0)) failures.push('empty sample');
  if (b.healthyCallbacksFrozenWorld > 0) failures.push('world frozen behind live callbacks');
  if (b.healthyCallbacksFrozenSimulation > 0) failures.push('simulation frozen behind live callbacks');
  if (b.healthyCallbacksFrozenSimulation == null) failures.push('simulation staleness unobserved');
  if (!(b.simWallRatio > 0.8)) failures.push('simulation cadence below 80% of wall time');
  if (!(b.worldSubmitFps > 0)) failures.push('no world submissions');
  if (b.callbackGaps.p99 > a.callbackGaps.p99 * 1.1) failures.push('p99 regressed over 10%');
  const fpsRatio = a.worldSubmitFps > 0 ? b.worldSubmitFps / a.worldSubmitFps : null;
  const p95Ratio = b.submissionGaps?.p95 > 0 ? a.submissionGaps.p95 / b.submissionGaps.p95 : null;
  const hitchRate = s => s.activeMs > 0 ? s.callbackGaps.over50 * 1000 / s.activeMs : null;
  const oldRate = hitchRate(a), newRate = hitchRate(b);
  if (newRate > oldRate * 1.1 + 0.05) failures.push('hitch rate regressed');
  const hitchRatio = newRate > 0 ? oldRate / newRate : oldRate > 0 ? Infinity : 1;
  const motionObserved = Number.isFinite(a.worldMotionFps) && Number.isFinite(b.worldMotionFps)
    && a.motionSubmissionGaps && b.motionSubmissionGaps;
  const motionRate = s => s.activeMs > 0 ? s.motionSubmissionGaps.over50 * 1000 / s.activeMs : null;
  const oldMotionRate = motionObserved ? motionRate(a) : null;
  const newMotionRate = motionObserved ? motionRate(b) : null;
  const motionHitchRatio = motionObserved
    ? newMotionRate > 0 ? oldMotionRate / newMotionRate : oldMotionRate > 0 ? Infinity : 1
    : null;
  const lowerMotionTail = motionObserved
    && b.motionSubmissionGaps.p99 <= Math.max(34, a.motionSubmissionGaps.p99 * 0.9)
    && b.motionSubmissionGaps.max <= Math.max(34, a.motionSubmissionGaps.max * 0.9);
  const lowerTail = b.callbackGaps.p99 <= Math.max(17, a.callbackGaps.p99 * 0.9)
    && b.callbackGaps.max <= Math.max(34, a.callbackGaps.max * 0.9);
  const atDisplayLimit = after.metadata.displayHz > 0
    && b.worldSubmitFps >= after.metadata.displayHz * 0.95;
  const beforePose = actualMeshEvidence(a);
  const afterPose = actualMeshEvidence(b);
  const actualPoseObserved = beforePose.available && afterPose.available;
  const actualPoseMissing = beforePose.missing || afterPose.missing;
  const actualPoseReason = actualPoseObserved
    ? actualPoseMissing
      ? `measured with missing samples; before ${beforePose.missingSamples}; after ${afterPose.missingSamples}`
      : 'measured in both arms'
    : actualPoseMissing
      ? `measured disappearance; before ${beforePose.missingSamples}; after ${afterPose.missingSamples}`
    : `before: ${beforePose.reason}; after: ${afterPose.reason}`;
  const actualPoseGapEventsPerSecond = actualPoseObserved
    ? afterPose.gaps.over50 * 1000 / b.activeMs : null;
  const beforePoseGapEventsPerSecond = actualPoseObserved
    ? beforePose.gaps.over50 * 1000 / a.activeMs : null;
  const actualPoseStaleExposurePerSecond = actualPoseObserved
    ? afterPose.stale.over50 * 1000 / b.activeMs : null;
  const beforePoseStaleExposurePerSecond = actualPoseObserved
    ? beforePose.stale.over50 * 1000 / a.activeMs : null;
  const actualPoseGapTarget = actualPoseObserved
    && actualPoseGapEventsPerSecond <= beforePoseGapEventsPerSecond / target;
  const actualPoseStaleTarget = actualPoseObserved
    && actualPoseStaleExposurePerSecond <= beforePoseStaleExposurePerSecond / target;
  const actualPoseLowerTail = actualPoseObserved
    && lowerDistributionTail(beforePose.gaps, afterPose.gaps)
    && lowerDistributionTail(beforePose.stale, afterPose.stale);
  const actualPoseStatus = !actualPoseObserved
    ? actualPoseMissing ? 'measured-with-missing' : 'incomplete'
    : actualPoseMissing ? 'measured-with-missing' : 'measured';
  if (!actualPoseObserved && !actualPoseMissing) failures.push('actual mesh pose target incomplete: ' + actualPoseReason);
  else {
    if (actualPoseMissing) failures.push(`actual mesh missing samples: before ${beforePose.missingSamples}; after ${afterPose.missingSamples}`);
    if (!actualPoseGapTarget) failures.push('actual mesh pose-change gap event rate did not improve 3x');
    if (!actualPoseStaleTarget) failures.push('actual mesh stale-pose exposure did not improve 3x');
    if (!actualPoseLowerTail) failures.push('actual mesh pose tail did not improve');
  }
  return {
    comparable: mismatches.length === 0, failures, fpsRatio, p95Ratio,
    beforeHitchesPerSecond: oldRate, afterHitchesPerSecond: newRate,
    hitchRatio: Number.isFinite(hitchRatio) ? hitchRatio : 'no-after-hitches',
    beforeMotionHitchesPerSecond: oldMotionRate, afterMotionHitchesPerSecond: newMotionRate,
    motionHitchRatio: motionHitchRatio === Infinity ? 'no-after-hitches' : motionHitchRatio,
    beforeSnapshotFps: a.worldMotionFps ?? null, afterSnapshotFps: b.worldMotionFps ?? null,
    snapshotCadenceStatus: motionObserved ? 'informational-measured' : 'informational-unmeasured',
    snapshotTailLower: lowerMotionTail,
    actualPoseStatus,
    actualPoseReason: actualPoseMissing && actualPoseObserved
      ? `measured with missing samples; before ${beforePose.missingSamples}; after ${afterPose.missingSamples}`
      : actualPoseReason,
    beforeActualPoseEligibleSamples: beforePose.eligibleSamples,
    afterActualPoseEligibleSamples: afterPose.eligibleSamples,
    beforeActualPoseMissingSamples: beforePose.missingSamples,
    afterActualPoseMissingSamples: afterPose.missingSamples,
    beforeActualPoseGapEventsPerSecond: beforePoseGapEventsPerSecond,
    afterActualPoseGapEventsPerSecond: actualPoseGapEventsPerSecond,
    beforeActualPoseStaleExposurePerSecond: beforePoseStaleExposurePerSecond,
    afterActualPoseStaleExposurePerSecond: actualPoseStaleExposurePerSecond,
    actualPoseGapEventRatio: actualPoseObserved
      ? actualPoseGapEventsPerSecond > 0 ? beforePoseGapEventsPerSecond / actualPoseGapEventsPerSecond
        : beforePoseGapEventsPerSecond > 0 ? 'no-after-events' : 1 : null,
    actualPoseStaleExposureRatio: actualPoseObserved
      ? actualPoseStaleExposurePerSecond > 0 ? beforePoseStaleExposurePerSecond / actualPoseStaleExposurePerSecond
        : beforePoseStaleExposurePerSecond > 0 ? 'no-after-exposure' : 1 : null,
    actualPoseLowerTail,
    displayHz: after.metadata.displayHz ?? null, atDisplayLimit,
    targetMetric: '3x fewer >50ms callback and actual mesh pose-change gap events plus stale-pose exposure samples (preserve zero-hitch floor), lower tails, protect world/sim cadence, >=95% display Hz submissions',
    targetMet: failures.length === 0 && newRate <= oldRate / target
      && lowerTail && actualPoseObserved && actualPoseGapTarget && actualPoseStaleTarget
      && actualPoseLowerTail && atDisplayLimit,
    // Neither call counts nor matching settings certify identical pixels.
    pictureAcceptance: 'separate required check; this comparison measures cadence',
  };
}
