// Finite mechanical phrases for the existing combat bus. No private context, samples or loops.
export const IRON_KRAKEN_AUDIO_RECIPES = Object.freeze([
  {
    id: 'sfx_kraken_charge', category: 'weapon', type: 'oscillator', wave: 'triangle',
    baseFreq: 108, freqSweep: [108, 286], sweepTimeS: .25,
    filterType: 'bandpass', filterFreq: 530, filterQ: 2.2,
    gainEnvelope: { attack: .015, decay: .13, sustain: .22, release: .17 },
    repeatCount: 2, repeatIntervalS: .12, lfoRate: 8, lfoDepth: .13,
  },
  {
    id: 'sfx_kraken_rake', category: 'weapon', type: 'noise_burst', noiseColor: 'pink',
    filterType: 'bandpass', filterFreq: 1050, filterQ: 2.5,
    gainEnvelope: { attack: .006, decay: .055, sustain: .15, release: .14 },
    repeatCount: 1, repeatIntervalS: .085,
    transientClick: { gain: .22 }, subBass: { startFreq: 140, endFreq: 78, dur: .13, gain: .22 },
  },
  {
    id: 'sfx_kraken_jet', category: 'weapon', type: 'noise_filtered', noiseColor: 'pink',
    filterType: 'bandpass', filterFreq: 340, filterQ: .85,
    gainEnvelope: { attack: .018, decay: .65, sustain: .45, release: .21 },
    lfoRate: 6, lfoDepth: .12, distortionAmount: .12, distortionCurve: 'tanh',
    subBass: { startFreq: 76, endFreq: 38, dur: .30, gain: .25 },
  },
  {
    id: 'sfx_kraken_ink', category: 'weapon', type: 'oscillator', wave: 'sawtooth',
    baseFreq: 410, freqSweep: [410, 95], sweepTimeS: .24,
    filterType: 'bandpass', filterFreq: 620, filterQ: 2.8,
    gainEnvelope: { attack: .012, decay: .18, sustain: .30, release: .19 },
    lfoRate: 14, lfoDepth: .15,
    subBass: { startFreq: 55, endFreq: 42, dur: .18, gain: .22 },
  },
  {
    id: 'sfx_kraken_vent', category: 'weapon', type: 'noise_filtered', noiseColor: 'white',
    filterType: 'bandpass', filterFreq: 900, filterQ: 1.2,
    gainEnvelope: { attack: .025, decay: .15, sustain: .28, release: .26 },
    lfoRate: 5.3, lfoDepth: .10,
  },
].map(recipe => Object.freeze(recipe)));
