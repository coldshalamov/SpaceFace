// Wave G10 — the hand and the engine share one breath.
// Zero throttle is silence and a dark plume inside a quarter second.
// Full throttle is the loud cue and a grown plume inside 120 ms.
// The sample is not restarted every tick; gain and length move on these windows.

export const THROTTLE_WINDOWS = Object.freeze({
  grownS: 0.12,
  darkS: 0.25,
  loudGain: 0.72,
  silentGain: 0,
  cueRiseTau: 0.035,
  cueFallTau: 0.06,
  plumeRiseTau: 0.04,
  plumeFallTau: 0.06,
  plumeDark: 0.02,
  plumeGrown: 0.85,
});

export const CUE_GAIN = Object.freeze({
  loud: THROTTLE_WINDOWS.loudGain,
  silent: THROTTLE_WINDOWS.silentGain,
  riseTau: THROTTLE_WINDOWS.cueRiseTau,
  fallTau: THROTTLE_WINDOWS.cueFallTau,
});

/** Advance engine-cue gain toward silence or the loud cue. Allocates nothing when `out` is passed. */
export function stepCueGain(gain, throttle, dt, out = null) {
  const current = Number.isFinite(gain) ? gain : 0;
  const cmd = Math.max(0, Math.min(1, Number(throttle) || 0));
  const target = cmd > 0.02 ? CUE_GAIN.loud : CUE_GAIN.silent;
  const tau = target > current ? CUE_GAIN.riseTau : CUE_GAIN.fallTau;
  const step = Math.max(0, Number(dt) || 0);
  const next = current + (target - current) * (1 - Math.exp(-step / Math.max(tau, 1e-4)));
  const rec = out && typeof out === 'object' ? out : { gain: 0, target: 0 };
  rec.gain = next;
  rec.target = target;
  return rec;
}
