// Finite voices on the existing ambient bus. No new context or unbounded loop graph.
export const STATION_LIFE_AUDIO_RECIPES = Object.freeze([
  { id: 'ambient_station_crowd', category: 'ambient', type: 'noise_filtered', noiseColor: 'pink',
    duration: 5.05, repeatCount: 2, repeatIntervalS: 1.6,
    filterType: 'bandpass', filterFreq: 680, filterQ: .7,
    // Noise voices borrow the synth's finite two-second source: overlap three soft
    // phrases instead of letting a long envelope outlive its actual source buffer.
    gainEnvelope: { attack: .35, decay: .8, sustain: .45, release: .7, peak: .22 },
    lfoRate: 3.1, lfoDepth: .35 },
  { id: 'ambient_station_murmur', category: 'ambient', type: 'oscillator', wave: 'triangle',
    baseFreq: 153, duration: 5.4, filterType: 'bandpass', filterFreq: 430, filterQ: .8,
    gainEnvelope: { attack: 1.1, decay: 2.8, sustain: .3, release: 1.5, peak: .055 },
    lfoRate: 4.3, lfoDepth: .16 },
  { id: 'ambient_station_shift_bell', category: 'ambient', type: 'oscillator', wave: 'sine',
    baseFreq: 659.255, duration: 1.25, filterType: 'lowpass', filterFreq: 2200,
    gainEnvelope: { attack: .008, decay: .035, sustain: .1, release: 1.2, peak: .3 } },
]);
