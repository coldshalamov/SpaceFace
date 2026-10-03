// Morrow / R-07: an authored, civilian momentum-rescue machine. No platform dependencies.
export const MORROW = Object.freeze({
  id: 'character_morrow', name: 'Morrow', callsign: 'R-07 · MORROW',
  sectorId: 'sector_helios_prime',
  // Beside (not on) the tutorial-to-starter-seam corridor. The player flies past naturally.
  anchor: Object.freeze({ x: 510, z: -72 }),
  radius: 15, mass: 18000, hull: 1600,
  discoverRadius: 180, scanRadius: 190, nearRadius: 125,
  orbitInner: 38, orbitOuter: 100, orbitSweep: Math.PI * 0.65,
  minimumSpeed: 14, maximumSpeed: 190, deltaSpeed: 48,
  armSeconds: 24, windupSeconds: 1.2, launchSeconds: 0.42, cooldownSeconds: 28,
  shySeconds: 18, idleSeconds: 22, maxStep: 0.1,
});

export const MORROW_LINES = Object.freeze({
  discovered: 'MORROW / R-07 — an old rescue machine. Your scanner can hail it.',
  hello: 'MORROW: You are not debris. Good. Scan me again for a push; fly a wide arc around my light.',
  welcome: 'MORROW: Same little engine. Different scratches. Welcome back.',
  armed: 'MORROW: Wide arc. Keep moving. I will give the motion back. Scan again to cancel.',
  windup: 'MORROW: There. Hold that curve. Leaving the light cancels the push.',
  launched: 'MORROW: Go on. There is more sky.',
  tenth: 'MORROW: Ten departures. Ten arrivals, I hope.',
  cooldown: 'MORROW: Catching my breath. Old machinery. Very old manners.',
  cancel: 'MORROW: No hurry. The sky keeps.',
  shy: 'MORROW: Please do not make me remember what that sound is.',
  dance: 'MORROW: Excellent. We are lost in a circle.',
  quiet: 'MORROW: We do not have to go anywhere.',
  obstruction: 'MORROW: Something solid ahead. Find another curve.',
  tether: 'MORROW: You have a line out. I will not pull it out of your hands.',
  memorial: 'MORROW / R-07 — no answer. The rescue light is dark.',
});

export function freshMorrowMemory() {
  return { version: 1, met: false, destroyed: false, visits: 0, launches: 0,
    danced: false, quietHeard: false, cooldownUntil: 0, shyUntil: 0, hull: MORROW.hull };
}

// Whitelist rather than spreading untrusted saves into a live object.
export function normalizeMorrowMemory(raw, now = 0) {
  const m = freshMorrowMemory();
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return m;
  for (const key of ['met', 'destroyed', 'danced', 'quietHeard']) m[key] = raw[key] === true;
  for (const key of ['visits', 'launches']) m[key] = Math.min(1000000, Math.max(0,
    Number.isFinite(raw[key]) ? Math.floor(raw[key]) : 0));
  for (const [key, limit] of [['cooldownUntil', MORROW.cooldownSeconds], ['shyUntil', MORROW.shySeconds]]) {
    m[key] = Number.isFinite(raw[key]) ? Math.max(0, Math.min(raw[key], now + limit)) : 0;
  }
  m.hull = Number.isFinite(raw.hull) ? Math.max(0, Math.min(MORROW.hull, raw.hull)) : MORROW.hull;
  if (m.hull === 0) m.destroyed = true;
  return m;
}

// New synthesized voices, not renamed stock effects. AudioContext synthesis uses existing mixer,
// positional attenuation, mute controls, and disposal. Three pitches form Morrow's signature.
export const MORROW_AUDIO_RECIPES = Object.freeze([
  ...[174.61, 261.63, 349.23].map((hz, i) => ({
    id: `sfx_morrow_bell_${i}`, category: 'world', type: 'oscillator', wave: 'sine',
    baseFreq: hz, freqSweep: [hz * 1.012, hz], sweepTimeS: 0.12,
    gainEnvelope: { attack: 0.018, decay: 0.18, sustain: 0.4, release: 1.1 + i * 0.12 },
    filterType: 'lowpass', filterFreq: 1200, gainMult: 0.32,
  })),
  { id: 'sfx_morrow_charge', category: 'world', type: 'oscillator', wave: 'triangle',
    baseFreq: 65, freqSweep: [65, 196], sweepTimeS: 1.15,
    gainEnvelope: { attack: 0.25, decay: 0.45, sustain: 0.55, release: 0.5 },
    filterType: 'lowpass', filterFreq: 750, gainMult: 0.27 },
  { id: 'sfx_morrow_release', category: 'world', type: 'noise_burst', noiseColor: 'pink',
    gainEnvelope: { attack: 0.025, decay: 0.08, sustain: 0.38, release: 0.65 },
    filterType: 'bandpass', filterFreq: 420, filterQ: 0.7, gainMult: 0.38 },
]);
