// src/data/audioRecipes.js – audio synthesis recipes and music stem definitions.
// RECIPES: SFX synthesis parameter sets for runtime AudioContext nodes.
// MUSIC_STEMS: adaptive music stem layer definitions.
// Pure data, no imports, no three/DOM deps.

export const RECIPES = [
  // --- Engine SFX ---
  {
    id: 'sfx_engine_idle',
    category: 'engine',
    type: 'oscillator',
    baseFreq: 80, freqMod: 0.05,
    gainEnvelope: { attack: 0.3, sustain: 0.8, release: 0.5 },
    filterType: 'lowpass', filterFreq: 400, filterQ: 1.2,
    lfoRate: 4.5, lfoDepth: 0.08,
  },
  {
    id: 'sfx_engine_thrust',
    category: 'engine',
    type: 'noise_filtered',
    noiseColor: 'pink',
    gainEnvelope: { attack: 0.1, sustain: 1.0, release: 0.3 },
    filterType: 'bandpass', filterFreq: 320, filterQ: 0.8,
    pitchRange: [0.85, 1.15],
  },
  {
    id: 'sfx_engine_boost',
    category: 'engine',
    type: 'layered',
    layers: ['sfx_engine_thrust'],
    gainMult: 1.8, filterFreqMult: 1.6,
    gainEnvelope: { attack: 0.05, sustain: 1.0, release: 0.4 },
  },

  // --- Weapon SFX ---
  {
    id: 'sfx_wpn_pulse_laser',
    category: 'weapon',
    type: 'oscillator',
    baseFreq: 1200, freqSweep: [1200, 300], sweepTimeS: 0.12,
    gainEnvelope: { attack: 0.005, sustain: 0.0, release: 0.12 },
    filterType: 'highpass', filterFreq: 600,
    pitchRange: [0.9, 1.1],
  },
  {
    id: 'sfx_wpn_autocannon',
    category: 'weapon',
    type: 'noise_burst',
    noiseColor: 'white',
    gainEnvelope: { attack: 0.002, sustain: 0.0, release: 0.08 },
    filterType: 'bandpass', filterFreq: 900, filterQ: 0.5,
    pitchRange: [0.8, 1.2],
  },
  {
    id: 'sfx_wpn_railgun',
    category: 'weapon',
    type: 'layered',
    layers: ['sfx_wpn_autocannon'],
    gainEnvelope: { attack: 0.001, sustain: 0.0, release: 0.25 },
    filterType: 'lowpass', filterFreq: 2000,
    reverbMix: 0.3,
  },
  {
    id: 'sfx_wpn_beam_laser',
    category: 'weapon',
    type: 'continuous_oscillator',
    baseFreq: 440, freqMod: 0.02,
    gainEnvelope: { attack: 0.08, sustain: 1.0, release: 0.1 },
    filterType: 'bandpass', filterFreq: 880, filterQ: 2.0,
    distortionAmount: 0.4,
  },
  {
    id: 'sfx_wpn_missile',
    category: 'weapon',
    type: 'noise_filtered',
    noiseColor: 'pink',
    gainEnvelope: { attack: 0.05, sustain: 1.0, release: 0.2 },
    filterType: 'highpass', filterFreq: 200,
    pitchRange: [0.95, 1.05],
    dopplerEnabled: true,
  },

  // --- Explosion SFX ---
  {
    id: 'sfx_explosion_small',
    category: 'explosion',
    type: 'noise_burst',
    noiseColor: 'white',
    gainEnvelope: { attack: 0.001, sustain: 0.0, release: 0.4 },
    filterType: 'lowpass', filterFreq: 800, filterQ: 0.4,
    reverbMix: 0.5, reverbDecay: 1.2,
  },
  {
    id: 'sfx_explosion_large',
    category: 'explosion',
    type: 'layered',
    layers: ['sfx_explosion_small'],
    gainMult: 2.5, filterFreqMult: 0.5,
    gainEnvelope: { attack: 0.001, sustain: 0.0, release: 1.2 },
    reverbMix: 0.7, reverbDecay: 3.0,
  },

  // --- Mining SFX ---
  {
    id: 'sfx_mining_beam',
    category: 'mining',
    type: 'continuous_oscillator',
    baseFreq: 200, freqMod: 0.15,
    gainEnvelope: { attack: 0.15, sustain: 1.0, release: 0.2 },
    filterType: 'bandpass', filterFreq: 400, filterQ: 1.5,
    lfoRate: 8.0, lfoDepth: 0.12,
  },
  {
    id: 'sfx_mining_impact',
    category: 'mining',
    type: 'noise_burst',
    noiseColor: 'pink',
    gainEnvelope: { attack: 0.005, sustain: 0.0, release: 0.15 },
    filterType: 'bandpass', filterFreq: 600, filterQ: 0.8,
    pitchRange: [0.7, 1.3],
  },

  // --- UI SFX ---
  {
    id: 'sfx_ui_click',
    category: 'ui',
    type: 'oscillator',
    baseFreq: 880, freqSweep: [880, 660], sweepTimeS: 0.06,
    gainEnvelope: { attack: 0.002, sustain: 0.0, release: 0.06 },
    filterType: 'highpass', filterFreq: 440,
  },
  {
    id: 'sfx_ui_confirm',
    category: 'ui',
    type: 'oscillator',
    baseFreq: 660, freqSweep: [660, 880], sweepTimeS: 0.12,
    gainEnvelope: { attack: 0.01, sustain: 0.0, release: 0.12 },
  },
  {
    id: 'sfx_ui_alert',
    category: 'ui',
    type: 'oscillator',
    baseFreq: 440, freqMod: 0.5,
    gainEnvelope: { attack: 0.01, sustain: 0.3, release: 0.1 },
    filterType: 'bandpass', filterFreq: 440, filterQ: 3.0,
    repeatCount: 2, repeatIntervalS: 0.4,
  },
];

// 4 adaptive music stems (A=ambient/safe, B=tension, C=combat, D=boss).
export const MUSIC_STEMS = [
  {
    id: 'stem_a',
    label: 'Ambient',
    triggerCondition: 'enemyDensityNear < 0.1 && !inCombat',
    bpm: 80,
    key: 'Am',
    loopBars: 8,
    layers: [
      { instrument: 'pad',    gainBase: 0.6, gainRange: [0.4, 0.8] },
      { instrument: 'bass',   gainBase: 0.3, gainRange: [0.2, 0.5] },
      { instrument: 'space_fx', gainBase: 0.4, gainRange: [0.2, 0.6] },
    ],
    crossfadeS: 3.0,
  },
  {
    id: 'stem_b',
    label: 'Tension',
    triggerCondition: 'enemyDensityNear >= 0.1 && !inCombat',
    bpm: 95,
    key: 'Am',
    loopBars: 8,
    layers: [
      { instrument: 'pad',    gainBase: 0.5, gainRange: [0.3, 0.7] },
      { instrument: 'bass',   gainBase: 0.5, gainRange: [0.3, 0.7] },
      { instrument: 'perc',   gainBase: 0.3, gainRange: [0.1, 0.5] },
      { instrument: 'strings', gainBase: 0.4, gainRange: [0.2, 0.6] },
    ],
    crossfadeS: 2.0,
  },
  {
    id: 'stem_c',
    label: 'Combat',
    triggerCondition: 'inCombat && !bossActive',
    bpm: 130,
    key: 'Am',
    loopBars: 4,
    layers: [
      { instrument: 'drums',   gainBase: 0.8, gainRange: [0.6, 1.0] },
      { instrument: 'bass',    gainBase: 0.6, gainRange: [0.4, 0.8] },
      { instrument: 'synth',   gainBase: 0.5, gainRange: [0.3, 0.7] },
      { instrument: 'brass',   gainBase: 0.4, gainRange: [0.2, 0.6] },
    ],
    crossfadeS: 0.5,
  },
  {
    id: 'stem_d',
    label: 'Boss',
    triggerCondition: 'bossActive',
    bpm: 140,
    key: 'Am',
    loopBars: 4,
    layers: [
      { instrument: 'drums',   gainBase: 1.0, gainRange: [0.8, 1.0] },
      { instrument: 'bass',    gainBase: 0.8, gainRange: [0.6, 1.0] },
      { instrument: 'synth',   gainBase: 0.7, gainRange: [0.5, 0.9] },
      { instrument: 'brass',   gainBase: 0.6, gainRange: [0.4, 0.8] },
      { instrument: 'choir',   gainBase: 0.5, gainRange: [0.3, 0.7] },
      { instrument: 'strings', gainBase: 0.5, gainRange: [0.3, 0.7] },
    ],
    crossfadeS: 0.25,
  },
];
