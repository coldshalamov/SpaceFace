export function selectPerformanceDiagnostic(results) {
  const severity = ({ summary: s }) => Math.max(s.callbackGaps?.p99 || 0,
    s.healthyCallbacksFrozenWorld > 0 ? s.maxWorldStaleMs || 0 : 0,
    s.healthyCallbacksFrozenSimulation > 0 ? s.maxSimStaleMs || 0 : 0);
  return results.filter(r => r.summary).sort((a, b) => severity(b) - severity(a))[0] || null;
}

export function comparePerformanceRuns(before, after, target = 3) {
  const keys = ['cpu', 'platform', 'gpu', 'userAgent', 'viewport', 'buffer', 'settings', 'simLane', 'mode', 'seed', 'sampleMs', 'settleMs', 'travelMs', 'observer', 'displayHz'];
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
  if (!motionObserved) failures.push('distinct world snapshot cadence unobserved');
  const motionRate = s => s.activeMs > 0 ? s.motionSubmissionGaps.over50 * 1000 / s.activeMs : null;
  const oldMotionRate = motionObserved ? motionRate(a) : null;
  const newMotionRate = motionObserved ? motionRate(b) : null;
  const motionHitchRatio = motionObserved
    ? newMotionRate > 0 ? oldMotionRate / newMotionRate : oldMotionRate > 0 ? Infinity : 1
    : null;
  if (motionObserved && newMotionRate > oldMotionRate * 1.1 + 0.05) failures.push('world snapshot hitch rate regressed');
  const lowerMotionTail = motionObserved
    && b.motionSubmissionGaps.p99 <= Math.max(34, a.motionSubmissionGaps.p99 * 0.9)
    && b.motionSubmissionGaps.max <= Math.max(34, a.motionSubmissionGaps.max * 0.9);
  const lowerTail = b.callbackGaps.p99 <= Math.max(17, a.callbackGaps.p99 * 0.9)
    && b.callbackGaps.max <= Math.max(34, a.callbackGaps.max * 0.9);
  const atDisplayLimit = after.metadata.displayHz > 0
    && b.worldSubmitFps >= after.metadata.displayHz * 0.95;
  return {
    comparable: mismatches.length === 0, failures, fpsRatio, p95Ratio,
    beforeHitchesPerSecond: oldRate, afterHitchesPerSecond: newRate,
    hitchRatio: Number.isFinite(hitchRatio) ? hitchRatio : 'no-after-hitches',
    beforeMotionHitchesPerSecond: oldMotionRate, afterMotionHitchesPerSecond: newMotionRate,
    motionHitchRatio: motionHitchRatio === Infinity ? 'no-after-hitches' : motionHitchRatio,
    beforeSnapshotFps: a.worldMotionFps ?? null, afterSnapshotFps: b.worldMotionFps ?? null,
    displayHz: after.metadata.displayHz ?? null, atDisplayLimit,
    targetMetric: '3x fewer >50ms callback and world snapshot gaps (preserve zero-hitch floor), lower tails, protect world/sim cadence, >=95% display Hz submissions',
    targetMet: failures.length === 0 && newRate <= oldRate / target
      && motionObserved && newMotionRate <= oldMotionRate / target
      && lowerTail && lowerMotionTail && atDisplayLimit,
    // Neither call counts nor matching settings certify identical pixels.
    pictureAcceptance: 'separate required check; this comparison measures cadence',
  };
}
