// One-shots for Hasp's wash. No loop, no music stem. Spread into RECIPES.

export const SECOND_RINSE_AUDIO_RECIPES = Object.freeze([
  Object.freeze({
    id: 'sfx.secondRinse.clap',
    category: 'world',
    type: 'noise_burst',
    noiseColor: 'pink',
    gainEnvelope: { attack: 0.004, decay: 0.05, sustain: 0.15, release: 0.14 },
    filterType: 'bandpass',
    filterFreq: 420,
    filterQ: 0.7,
  }),
  Object.freeze({
    id: 'sfx.secondRinse.pin',
    category: 'world',
    type: 'oscillator',
    wave: 'triangle',
    baseFreq: 1860,
    freqSweep: [1860, 1240],
    sweepTimeS: 0.04,
    gainEnvelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.05 },
    filterType: 'bandpass',
    filterFreq: 2400,
    filterQ: 4,
  }),
  Object.freeze({
    id: 'sfx.secondRinse.steam',
    category: 'world',
    type: 'noise_filtered',
    noiseColor: 'white',
    gainEnvelope: { attack: 0.04, decay: 0.12, sustain: 0.35, release: 0.55 },
    filterType: 'highpass',
    filterFreq: 3200,
    filterQ: 0.6,
    gainMult: 0.4,
  }),
]);
