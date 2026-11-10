// Shrink a failing tape to the shortest prefix that still trips the same detector.

import { runSession } from './session.mjs';

export async function shrinkFailure(run, detectorId) {
  if (!run || !run.tape || !detectorId) {
    return { ok: false, reason: 'nothing-to-shrink' };
  }
  const full = run.ticks | 0;
  let lo = 1;
  let hi = full;
  let best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const replay = await runSession({
      journeyId: run.journeyId,
      personaId: run.personaId,
      seed: run.seed,
      fault: null,
      surface: run.surface,
      ticks: mid,
      playbackTape: run.tape,
    });
    const hit = (replay.failures || []).some((failure) => failure.id === detectorId);
    if (hit) {
      best = replay;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  if (!best) return { ok: false, reason: 'prefix-lost-the-failure', fullTicks: full };
  return {
    ok: true,
    detectorId,
    fullTicks: full,
    minimalTicks: best.ticks,
    fingerprint: best.fingerprint,
    digest: best.digest,
    tape: best.tape,
    tapeHash: best.tapeHash,
    run: best,
  };
}
