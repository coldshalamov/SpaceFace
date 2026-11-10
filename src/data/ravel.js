/** RAVEL: an alien gravity loom still trying to hold together a moon that is gone. */
export const RAVEL = Object.freeze({
  id: 'character_ravel', callsign: 'RAVEL / THE UNRAVELLER', name: 'Ravel',
  sectorId: 'sector_pallas_drift', anchor: Object.freeze({ x: -940, z: 620 }),
  coreRadius: 24, coreMass: 40000, hull: 720,
  spoolRadius: 5.8, spoolMass: 24, spoolHull: 110, orbitRadius: 65,
  freeRadius: 128, freeHold: 0.35, touchGrace: 3.0,
  // Streaming. The world's far-actor table shelves any drone beyond its exit radius of the player,
  // so the encounter exists only while the player is inside it: spawn within (exit - streamInMargin)
  // of the anchor, withdraw beyond (exit - streamOutMargin). Core and spools stay near the anchor
  // (servo goals and a cast excursion of ~200 WU), so the hysteresis band is also the roam bound.
  // farFallback stands in where there is no far-actor table (minimal harnesses).
  streamInMargin: 350, streamOutMargin: 200, farFallback: 1300,
  discoverRadius: 440, scanRadius: 300, leashRadius: 520,
  windup: 2.1, cast: 1.5, exposed: 4.2, recover: 1.8,
  waveStart: 28, waveSpeed: 145, waveHalfAngle: 0.43,
  waveThickness: 14, waveDamage: 12, waveDeltaV: 24,
  castSpeed: 82, returnAcceleration: 34, orbitRate: 0.16,
  quietSeconds: 18, voiceCooldown: 5,
});
export const RAVEL_LINES = Object.freeze({
  discover: 'RAVEL — a gravity loom with three loose counterweights. Scan to hail. It is waiting, not hunting.',
  hello: 'RAVEL: You are not the missing piece. Scan again to challenge me. Sidestep my marked cast; shoot the open spindle, or Massline my three weights beyond the outer teeth.',
  begin: 'RAVEL: Everything that leaves must return. Show me otherwise.',
  cancel: 'RAVEL: A thread withdrawn. No debt remains. Scan when you are ready.',
  cast: 'RAVEL: The line is chosen.',
  exposed: 'RAVEL — spindle exposed. Four seconds. Or pull a counterweight beyond the outer teeth.',
  freed: 'RAVEL: That was holding something. I no longer remember what.',
  broken: 'RAVEL: An answer with fewer pieces.',
  peaceful: 'RAVEL: Nothing is holding me together. I am still here. That is... new.',
  scarred: 'RAVEL: The work is finished. Not the way I imagined. But finished.',
  welcome: 'RAVEL: A returning thread. I know the difference now.',
  quiet: 'RAVEL: There was a fourth weight. There was a moon. I kept the place for both.',
  returned: 'RAVEL: You brought it back. Not because I pulled. I will remember that.',
  third: 'RAVEL: Three visits. I have stopped calling this an intrusion.',
  dead: 'RAVEL — the last thread loosens. The missing moon remains missing.',
  loose: 'RAVEL: Those are free now. So are you.',
});
export function freshRavelMemory() {
  return { version: 1, met: false, destroyed: false, pacified: false, hull: RAVEL.hull,
    freed: 0, broken: 0, visits: 0, quiet: false, returned: false };
}
export function normalizeRavelMemory(raw) {
  const out = freshRavelMemory();
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return out;
  for (const key of ['met', 'destroyed', 'quiet', 'returned']) out[key] = raw[key] === true;
  const mask = n => Number.isSafeInteger(n) && n >= 0 && n <= 7 ? n : 0;
  out.freed = mask(raw.freed); out.broken = mask(raw.broken) & ~out.freed;
  out.hull = Number.isFinite(raw.hull) ? Math.max(0, Math.min(RAVEL.hull, raw.hull)) : RAVEL.hull;
  out.visits = Number.isFinite(raw.visits) ? Math.min(1e6, Math.max(0, Math.floor(raw.visits))) : 0;
  out.destroyed ||= out.hull === 0;
  out.pacified = !out.destroyed && (out.freed | out.broken) === 7;
  if (out.destroyed) out.hull = 0;
  return out;
}
export const RAVEL_AUDIO_RECIPES = Object.freeze([
  { id: 'sfx_ravel_wake', category: 'world', type: 'oscillator', wave: 'triangle',
    baseFreq: 73.42, freqSweep: [55, 146.83], sweepTimeS: 1.4, filterType: 'lowpass', filterFreq: 850,
    gainEnvelope: { attack: 0.16, decay: 0.2, sustain: 0.4, release: 1.2 }, gainMult: 0.30 },
  { id: 'sfx_ravel_load', category: 'world', type: 'oscillator', wave: 'sawtooth',
    baseFreq: 42, freqSweep: [42, 126], sweepTimeS: 2.0, filterType: 'lowpass', filterFreq: 500,
    gainEnvelope: { attack: 0.3, decay: 1.35, sustain: 0.45, release: 0.4 }, gainMult: 0.18 },
  { id: 'sfx_ravel_cast', category: 'world', type: 'noise_burst', noiseColor: 'pink',
    filterType: 'bandpass', filterFreq: 240, filterQ: 0.9,
    gainEnvelope: { attack: 0.02, decay: 0.18, sustain: 0.24, release: 0.7 }, gainMult: 0.42 },
  { id: 'sfx_ravel_unthread', category: 'world', type: 'oscillator', wave: 'triangle',
    baseFreq: 587.33, freqSweep: [587.33, 146.83], sweepTimeS: 0.4,
    gainEnvelope: { attack: 0.012, decay: 0.18, sustain: 0.32, release: 1.4 }, gainMult: 0.30 },
  { id: 'sfx_ravel_peace', category: 'world', type: 'oscillator', wave: 'sine',
    baseFreq: 220, freqSweep: [146.83, 220], sweepTimeS: 1.5,
    gainEnvelope: { attack: 0.25, decay: 0.5, sustain: 0.5, release: 2.5 }, gainMult: 0.34 },
]);
