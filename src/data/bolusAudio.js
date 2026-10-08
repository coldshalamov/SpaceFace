// Four oscillator one-shots for The Bolus. No wav, no new bus.
// A cue id that lives in RECIPES plays as a synth recipe.

export const BOLUS_CUE = Object.freeze({
  latch: 'bolus_latch',
  freeze: 'bolus_freeze',
  iris: 'bolus_iris',
  crest: 'bolus_crest',
});

export const BOLUS_AUDIO_RECIPES = Object.freeze([
  Object.freeze({
    id: 'bolus_latch',
    category: 'world',
    type: 'oscillator',
    wave: 'triangle',
    baseFreq: 196,
    freqSweep: [196, 140],
    sweepTimeS: 0.18,
    gainEnvelope: { attack: 0.01, sustain: 0.2, release: 0.22 },
    filterType: 'lowpass',
    filterFreq: 900,
    filterQ: 0.8,
  }),
  Object.freeze({
    id: 'bolus_freeze',
    category: 'world',
    type: 'oscillator',
    wave: 'sine',
    baseFreq: 740,
    freqSweep: [740, 520],
    sweepTimeS: 0.08,
    gainEnvelope: { attack: 0.004, sustain: 0.0, release: 0.1 },
    filterType: 'highpass',
    filterFreq: 400,
    filterQ: 0.6,
  }),
  Object.freeze({
    id: 'bolus_iris',
    category: 'world',
    type: 'oscillator',
    wave: 'sawtooth',
    baseFreq: 90,
    freqSweep: [90, 48],
    sweepTimeS: 0.2,
    gainEnvelope: { attack: 0.008, sustain: 0.15, release: 0.28 },
    filterType: 'lowpass',
    filterFreq: 420,
    filterQ: 1.1,
  }),
  Object.freeze({
    id: 'bolus_crest',
    category: 'world',
    type: 'oscillator',
    wave: 'triangle',
    baseFreq: 62,
    freqSweep: [62, 110],
    sweepTimeS: 0.32,
    gainEnvelope: { attack: 0.02, sustain: 0.35, release: 0.4 },
    filterType: 'lowpass',
    filterFreq: 280,
    filterQ: 0.7,
  }),
]);
