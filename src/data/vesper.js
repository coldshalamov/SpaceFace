// Vesper / SV-3. Content and save normalization only; no renderer or runtime side effects.
export const VESPER = Object.freeze({
  id: 'character_vesper', callsign: 'VESPER / SV-3', sectorId: 'sector_helios_prime',
  anchor: Object.freeze({ x: 720, z: 250 }), radius: 11, mass: 420, hull: 1400,
  bellRadius: 4.5, bellMass: 18, bellHull: 500,
  scanRadius: 195, discoverRadius: 250, hearRadius: 340,
  pluckSpeed: 9, pluckTravel: 7, noteCooldown: 0.55, phraseGap: 24,
  ballisticSeconds: 4, returnAcceleration: 4.5, followAcceleration: 6,
  mutedSeconds: 14, bloomSeconds: 6, quietSeconds: 19,
  // Away from the starter seam's physical footprint; three pitches have three silhouettes.
  perches: Object.freeze([
    Object.freeze({ x: -43, z: -30 }), Object.freeze({ x: 0, z: -51 }), Object.freeze({ x: 43, z: -30 }),
  ]),
  pitches: Object.freeze([130.8128, 195.9977, 261.6256]),
  names: Object.freeze(['LOW · barrel', 'MIDDLE · fork', 'HIGH · crown']),
  phrase: Object.freeze([0, 2, 1]), reverse: Object.freeze([1, 2, 0]),
});
export const VESPER_LINES = Object.freeze({
  discover: 'VESPER / SV-3 — three loose resonators and a retired survey machine. Scan nearby to say hello.',
  hello: 'VESPER: Calibration cancelled. Music remains. Target a resonator, Massline it, pull and release. LOW, HIGH, MIDDLE.',
  demonstrate: 'VESPER: Listen: LOW barrel, HIGH crown, MIDDLE fork. No hurry between notes. Scan repeats the phrase.',
  soft: 'VESPER: A little more momentum. Pull the bell, then let it go.',
  missed: 'VESPER: That is yours. Mine goes LOW, HIGH, MIDDLE.',
  success: 'VESPER: That was not in the manual. Keeping it. Scan me to bring the band along, or leave us playing here.',
  encore: 'VESPER: Again, but with different dents. Excellent.',
  follow: 'VESPER: A walking rehearsal. I will follow you around Helios. Scan again and we settle here.',
  stay: 'VESPER: This patch of nothing has excellent acoustics. We will rehearse here.',
  welcome: 'VESPER: I kept your part. The silence was getting presumptuous.',
  reverse: 'VESPER: You played it backwards. So that is what the other side of a memory sounds like.',
  unison: 'VESPER: All three at once. Deeply unprofessional. Do it again.',
  quiet: 'VESPER: We were built to measure the distance between things. Nobody specified which things.',
  shy: 'VESPER: Please. These are the only ears I have left.',
  missing: 'VESPER: There is a rest where that note was. We can still make something.',
  memorial: 'VESPER / SV-3 — conductor silent. The surviving resonators are still real, still loose.',
});
const finite = (v, fallback, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
function freshBody(i = -1) {
  const offset = i < 0 ? { x: 0, z: 0 } : VESPER.perches[i];
  return { dead: false, hull: i < 0 ? VESPER.hull : VESPER.bellHull,
    x: VESPER.anchor.x + offset.x, z: VESPER.anchor.z + offset.z, vx: 0, vz: 0, rot: 0, angVel: 0 };
}
export function freshVesperMemory() {
  return { version: 1, met: false, visits: 0, performances: 0, reverseHeard: false,
    unisonHeard: false, quietHeard: false, mutedUntil: 0, hub: freshBody(),
    bells: [freshBody(0), freshBody(1), freshBody(2)] };
}
export function normalizeVesperMemory(raw, now = 0) {
  const out = freshVesperMemory();
  if (!raw || raw.version !== 1 || typeof raw !== 'object') return out;
  for (const key of ['met', 'reverseHeard', 'unisonHeard', 'quietHeard']) out[key] = raw[key] === true;
  for (const key of ['visits', 'performances']) out[key] = Math.floor(finite(raw[key], 0, 0, 1e6));
  out.mutedUntil = finite(raw.mutedUntil, 0, 0, Math.max(0, Number.isFinite(now) ? now : 0) + VESPER.mutedSeconds);
  function body(value, i) {
    const b = freshBody(i); if (!value || typeof value !== 'object') return b;
    const maxHull = i < 0 ? VESPER.hull : VESPER.bellHull;
    b.hull = finite(value.hull, maxHull, 0, maxHull); b.dead = value.dead === true || b.hull === 0;
    if (b.dead) b.hull = 0;
    for (const k of ['x', 'z']) b[k] = finite(value[k], b[k], -1e7, 1e7);
    for (const k of ['vx', 'vz']) b[k] = finite(value[k], 0, -1e5, 1e5);
    b.rot = finite(value.rot, 0, -1e6, 1e6); b.angVel = finite(value.angVel, 0, -30, 30);
    return b;
  }
  out.hub = body(raw.hub, -1);
  out.bells = [0, 1, 2].map(i => body(Array.isArray(raw.bells) ? raw.bells[i] : null, i));
  return out;
}
// The existing audio mixer handles gesture unlock, user mute, category volume and spatial falloff.
export const VESPER_AUDIO_RECIPES = Object.freeze(VESPER.pitches.map((hz, i) => ({
  id: `sfx_vesper_resonator_${i}`, category: 'world', type: 'oscillator', wave: 'triangle',
  baseFreq: hz, freqSweep: [hz * 1.025, hz], sweepTimeS: 0.09,
  gainEnvelope: { attack: 0.006, decay: 0.28, sustain: 0.24, release: 1.8 - i * 0.2 },
  filterType: 'lowpass', filterFreq: 1500 + i * 380, gainMult: 0.29,
})));
