/** RU-7 / RUCKUS. A demolition tug with a new work order: play.
 * All quantities use sim seconds, global XZ world units and the physics authority's mass units.
 * No timers, DOM, renderer imports, random draws or currency writes belong in this module. */
export const RUCKUS = Object.freeze({
  id: 'character_ruckus', name: 'RUCKUS', callsign: 'RU-7 / demolition retriever',
  sectorId: 'sector_ceres_belt', anchor: Object.freeze({ x: 680, z: 640 }),
  radius: 17, visualRadius: 29, mass: 160, hull: 900,
  toyRadius: 5.5, toyMass: 18, yardRadius: 430,
  maxSpeed: 108, maxAccel: 85, carrySpeed: 60, carryAccel: 60,
  catchGap: 10, catchRelativeSpeed: 52, mouthOffset: 27,
  throwMinSpeed: 16, throwMinDistance: 38, throwCreditSeconds: 24,
  returnStandOff: 82, returnSeconds: 36, chaseSeconds: 35,
  discoverRadius: 460, hailRadius: 330, hearRadius: 490,
  quietSeconds: 28, hurtSeconds: 12, voiceCooldown: 4.5,
  streamInMargin: 500, streamOutMargin: 420, farFallback: 1500,
  pulseRadius: 125, pulseSeconds: 3.2, pulseDeltaSpeed: 42,
  pulseMaxMass: 1800, pulseMaxBodies: 24,
  bondedAfter: 3, version: 1,
});

export const RUCKUS_LINES = Object.freeze({
  discover: 'RU-7 / RUCKUS — demolition retriever. One machine. One dented pressure core. Scan to hail.',
  hello: 'RUCKUS: Crew absent. Work order expired. One object remains for retrieval. Put a Massline on the core. Throw it.',
  welcome: 'RUCKUS: Returning crew identified. Core retained.',
  fetch: 'RUCKUS: Loose object. On it.',
  caught: 'RUCKUS: Secured. Returning.',
  returned: 'RUCKUS: Retrieved. No structural losses. Again.',
  second: 'RUCKUS: Second retrieval. This work order can stay open.',
  bonded: 'RUCKUS: Crew count amended. Two.',
  present: 'RUCKUS: Pressure core charged. Present for crew. Three seconds after release. Keep clear.',
  held: 'RUCKUS: Core held. Countdown held.',
  bark: 'RUCKUS: Pressure released. Crew still present. Acceptable.',
  yours: 'RUCKUS: Your line. Releasing mine.',
  rest: 'RUCKUS: Work suspended. Core stays here.',
  far: 'RUCKUS: Outside the yard. Retrieval discontinued.',
  nudge: 'RUCKUS: Core available. Put a line on it. Throw it clear of the jaws.',
  quiet: 'RUCKUS: Last crew did not return for their tools. You did.',
  hurt: 'RUCKUS: Live damage. Not a work signal. Withdrawing.',
  recovered: 'RUCKUS: Damage recorded. Retrieval service remains available.',
  dead: 'RU-7 — drive pressure zero. The open work order was PLAY.',
  memorial: 'RU-7 — no reply. The core was kept for the next throw.',
});

const bounded = (n, lo, hi, fallback = 0) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
export function freshRuckusMemory() {
  return { version: 1, met: false, destroyed: false, hull: RUCKUS.hull,
    returns: 0, visits: 0, pulses: 0, longestThrow: 0, quietHeard: false };
}
export function normalizeRuckusMemory(raw) {
  const out = freshRuckusMemory();
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return out;
  for (const k of ['met', 'destroyed', 'quietHeard']) out[k] = raw[k] === true;
  for (const k of ['returns', 'visits', 'pulses']) out[k] = Math.floor(bounded(raw[k], 0, 1e6));
  out.hull = bounded(raw.hull, 0, RUCKUS.hull, RUCKUS.hull);
  out.longestThrow = bounded(raw.longestThrow, 0, RUCKUS.yardRadius * 2);
  out.destroyed ||= out.hull <= 0;
  if (out.destroyed) out.hull = 0;
  return out;
}
export const ruckusBond = memory => Math.min(RUCKUS.bondedAfter, memory?.returns || 0);

// These feed the existing synthesized-audio recipe owner; there are no external audio downloads.
export const RUCKUS_AUDIO_RECIPES = Object.freeze([
  { id: 'sfx_ruckus_wake', category: 'world', type: 'oscillator', wave: 'triangle',
    baseFreq: 92, freqSweep: [92, 220], sweepTimeS: .36,
    gainEnvelope: { attack: .025, decay: .18, sustain: .24, release: .4 }, gainMult: .3 },
  { id: 'sfx_ruckus_catch', category: 'world', type: 'oscillator', wave: 'square',
    baseFreq: 84, freqSweep: [150, 55], sweepTimeS: .15, filterType: 'lowpass', filterFreq: 850,
    gainEnvelope: { attack: .005, decay: .13, sustain: 0, release: .12 }, gainMult: .25 },
  { id: 'sfx_ruckus_return', category: 'world', type: 'oscillator', wave: 'triangle',
    baseFreq: 220, freqSweep: [220, 330], sweepTimeS: .35,
    gainEnvelope: { attack: .025, decay: .18, sustain: .3, release: .5 }, gainMult: .26 },
  { id: 'sfx_ruckus_tick', category: 'world', type: 'oscillator', wave: 'sine',
    baseFreq: 660, freqSweep: [660, 440], sweepTimeS: .08,
    gainEnvelope: { attack: .004, decay: .07, sustain: 0, release: .12 }, gainMult: .18 },
  { id: 'sfx_ruckus_bark', category: 'world', type: 'noise_burst', noiseColor: 'pink',
    filterType: 'lowpass', filterFreq: 1000,
    gainEnvelope: { attack: .015, decay: .15, sustain: .1, release: .5 }, gainMult: .4 },
  { id: 'sfx_ruckus_bond', category: 'world', type: 'oscillator', wave: 'sine',
    baseFreq: 196, freqSweep: [196, 392], sweepTimeS: .8,
    gainEnvelope: { attack: .08, decay: .35, sustain: .32, release: 1.1 }, gainMult: .26 },
]);
