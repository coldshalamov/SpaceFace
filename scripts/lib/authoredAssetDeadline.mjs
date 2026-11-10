import { performance } from 'node:perf_hooks';

export async function waitForAuthoredAssetDeadline({
  timeoutMs,
  sample,
  isReady,
  onPoll = null,
  pollIntervalMs = 50,
  now = () => performance.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const gateStartMs = now();
  const deadlineMs = gateStartMs + timeoutMs;
  let lastOnTimeSnapshot = null;
  let lastOnTimeSampleCompletedAtMs = null;

  while (now() < deadlineMs) {
    if (typeof onPoll === 'function') await onPoll();
    const snapshot = await sample();
    const sampleCompletedAtMs = now();
    if (sampleCompletedAtMs <= deadlineMs) {
      lastOnTimeSnapshot = snapshot;
      lastOnTimeSampleCompletedAtMs = sampleCompletedAtMs;
      if (isReady(snapshot)) {
        return {
          passed: true,
          gateStartMs,
          deadlineMs,
          passedAtMs: sampleCompletedAtMs,
          lastOnTimeSampleCompletedAtMs,
          lastOnTimeSnapshot,
        };
      }
    }
    const remainingMs = deadlineMs - now();
    if (remainingMs > 0) await sleep(Math.min(pollIntervalMs, remainingMs));
  }

  const postDeadlineSnapshot = await sample();
  return {
    passed: false,
    gateStartMs,
    deadlineMs,
    passedAtMs: null,
    lastOnTimeSampleCompletedAtMs,
    lastOnTimeSnapshot,
    postDeadlineSampleCompletedAtMs: now(),
    postDeadlineSnapshot,
  };
}
