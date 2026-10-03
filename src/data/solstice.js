// src/data/solstice.js — Solstice / SL-9: an ancient celestial lantern and astronomical observatory automaton.
// Pure data, no imports or platform dependencies.

export const SOLSTICE = Object.freeze({
  id: 'character_solstice',
  name: 'Solstice',
  callsign: 'SL-9 · SOLSTICE',
  sectorId: 'sector_ceres_belt',
  // Anchored in the quiet northwest pocket of Ceres Belt, surrounded by metallic/crystalline asteroid drift.
  anchor: Object.freeze({ x: -840, z: -760 }),
  coreRadius: 26,
  coreMass: 45000,
  hull: 2000,
  prismRadius: 5.5,
  prismMass: 24,
  prismHull: 800,
  orbitRadius: 78,
  // 3 Harmonic focal nodes at angles (0, 2π/3, 4π/3) around the core
  focalRadius: 82,
  focalTolerance: 26,
  wispRadius: 3.5,
  wispSpeed: 95,
  discoverRadius: 420,
  scanRadius: 320,
  beamLength: 170,
  beamHalfAngle: 0.38, // ~22 degrees
  beamRechargeRate: 22, // shield pts / sec
  beamChargeTimeNeeded: 2.5, // sec continuous in beam to earn Lumen Charge buff
  chargeBuffDuration: 20, // sec
  chargeSpeedMult: 1.25, // +25% boost speed
  bloomHoldTime: 1.8, // sec all 3 prisms must stay aligned
  bloomRadius: 360,
  voiceCooldown: 4.5,
  quietSeconds: 5.0,
  orbitSpeedEasterEgg: 110, // speed in WU/s to trigger speed orbit easter egg
});

export const SOLSTICE_LINES = Object.freeze({
  discover: 'SL-9 · SOLSTICE — an ancient stellar lantern turning in the dark belt. Scan to hail.',
  hello: 'SOLSTICE: Traveler. The belt is dark and full of cold iron. Come into my focal plane; let the light find your hull.',
  welcome: 'SOLSTICE: A familiar silhouette on my lenses. Welcome back into the light.',
  beamEnter: 'SOLSTICE: Good. Hold that line. Let the photons wash the frost off your plating.',
  charged: 'SOLSTICE: Shield capacitors saturated, drive coils humming. You glow nicely in the dark.',
  tether: 'SOLSTICE: Mind the mirrors. Those were ground before your station laid its first girder.',
  prismOne: 'SOLSTICE: Amber locked. One note in the chord.',
  prismTwo: 'SOLSTICE: Emerald focused. The harmonic frequency is tightening.',
  bloom: 'SOLSTICE: Resonance achieved! Three colors, one focus. Behold the bloom!',
  wispDeploy: 'SOLSTICE: Take a spark of my hearth with you. It doesn’t like being alone either.',
  wispRecall: 'SOLSTICE: Welcome home, little spark. Come back whenever the dark gets too cold.',
  eclipse: 'SOLSTICE: A deliberate eclipse. You make an excellent shadow puppet.',
  speedOrbit: 'SOLSTICE: Look at you, orbiting like a hyperactive comet! Don’t get dizzy.',
  quiet: 'SOLSTICE: Stillness in a universe that won’t stop expanding. I like your company, pilot.',
  hurt: 'SOLSTICE: Photons I understand. Ballistic ammunition is dreadfully uncivilized. I am closing my mirrors.',
  memorial: 'SL-9 · SOLSTICE — the last prism goes dark. The belt is cold once more.',
});

export function freshSolsticeMemory() {
  return {
    version: 1,
    met: false,
    destroyed: false,
    bloomed: false,
    wispActive: false,
    visits: 0,
    bloomsCount: 0,
    chargesCount: 0,
    quietHeard: false,
    eclipseHeard: false,
    orbitHeard: false,
    hull: SOLSTICE.hull,
  };
}

export function normalizeSolsticeMemory(raw) {
  const m = freshSolsticeMemory();
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return m;
  for (const k of ['met', 'destroyed', 'bloomed', 'wispActive', 'quietHeard', 'eclipseHeard', 'orbitHeard']) {
    m[k] = raw[k] === true;
  }
  for (const k of ['visits', 'bloomsCount', 'chargesCount']) {
    m[k] = Number.isFinite(raw[k]) ? Math.min(1e6, Math.max(0, Math.floor(raw[k]))) : 0;
  }
  m.hull = Number.isFinite(raw.hull) ? Math.max(0, Math.min(SOLSTICE.hull, raw.hull)) : SOLSTICE.hull;
  m.destroyed ||= m.hull === 0;
  return m;
}

export const SOLSTICE_AUDIO_RECIPES = Object.freeze([
  {
    id: 'sfx_solstice_wake',
    category: 'world',
    type: 'oscillator',
    wave: 'sine',
    baseFreq: 220,
    freqSweep: [220, 587.33], // A3 to D5
    sweepTimeS: 1.2,
    gainEnvelope: { attack: 0.1, decay: 0.25, sustain: 0.5, release: 1.4 },
    filterType: 'lowpass',
    filterFreq: 1400,
    gainMult: 0.35,
  },
  {
    id: 'sfx_solstice_chime',
    category: 'world',
    type: 'oscillator',
    wave: 'triangle',
    baseFreq: 659.25, // E5
    freqSweep: [659.25, 1318.5], // E5 to E6
    sweepTimeS: 0.25,
    gainEnvelope: { attack: 0.01, decay: 0.18, sustain: 0.35, release: 0.9 },
    gainMult: 0.30,
  },
  {
    id: 'sfx_solstice_charge',
    category: 'world',
    type: 'oscillator',
    wave: 'sine',
    baseFreq: 174.61, // F3
    freqSweep: [174.61, 880], // F3 rising to A5
    sweepTimeS: 2.2,
    gainEnvelope: { attack: 0.3, decay: 0.8, sustain: 0.6, release: 0.5 },
    gainMult: 0.28,
  },
  {
    id: 'sfx_solstice_bloom',
    category: 'world',
    type: 'oscillator',
    wave: 'sine',
    baseFreq: 110, // A2 low root
    freqSweep: [110, 880],
    sweepTimeS: 3.0,
    gainEnvelope: { attack: 0.05, decay: 0.4, sustain: 0.7, release: 2.5 },
    filterType: 'lowpass',
    filterFreq: 2200,
    gainMult: 0.45,
  },
  {
    id: 'sfx_solstice_wisp',
    category: 'world',
    type: 'oscillator',
    wave: 'triangle',
    baseFreq: 880,
    freqSweep: [880, 1046.5],
    sweepTimeS: 0.15,
    gainEnvelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.4 },
    gainMult: 0.22,
  },
]);
