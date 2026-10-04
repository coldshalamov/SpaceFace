// RUBRIC / HM-11 — the hull marker. Content, voice and save normalization only: no renderer, no
// runtime side effects. Rubric is the retired stencil drone of the Tethys Customs Gate. A marker's
// one law is that a mark is a measurement, so it paints what its gauges read beside what the desk
// filed, and it will not mark a hull that is moving.
//
// VOICE LAW (docs/worldbuilding/vibe/vibe-CANONICAL.md, "Dialog Register"): flat declaratives of
// physical and economic reality, in the register of inventory and log entries. A Rubric line never
// names its own emotional state, never signals irony, never performs, never narrates its own story.
// test/rubric.test.mjs lints every string below with violatesRegister() (src/characters/rubricRules.js).

export const RUBRIC = Object.freeze({
  id: 'character_rubric', name: 'Rubric', callsign: 'HM-11 · RUBRIC',
  sectorId: 'sector_tethys_junction',
  // Inside The Tally zone (authoredPlaces zone_tethys_tally), south of the held-for-count rack and
  // off the inbound queue lane, so traffic does not run through the studio.
  anchor: Object.freeze({ x: -790, z: -1190 }),
  // The marker: small, fragile, passive. It is not a weapon and is never hostile.
  radius: 6.5, mass: 14, hull: 160,
  maxSpeed: 42, maxAccel: 30, hoverHeight: 5,
  // Hull F-41 — the filing it was ordered to mark CLEARED. A heavy wreck on a slack mooring.
  hullRadius: 11, hullMass: 70, hullSpin: 0.34,
  swingRadius: 55, swingRate: 0.2, mooringAccel: 3.4, mooringLeash: 900, recallSeconds: 22,
  // Streaming. The world's far-actor table shelves any drone or wreck beyond its exit radius of the player,
  // so the encounter exists only while the player is inside it: spawn within (exit - streamInMargin),
  // despawn beyond (exit - streamOutMargin), and never roam past (exit - roamMargin) of the player.
  // farFallback stands in where there is no far-actor table (minimal harnesses).
  streamInMargin: 350, streamOutMargin: 200, roamMargin: 150, farFallback: 1300,
  // Ranges (world units).
  discoverRadius: 520, scanRadius: 300, hearRadius: 380, workRadius: 1300, reach: 22,
  // "Still" is a physical fact the sim checks, not a rule the sim grants: the hull's own speed and
  // spin. Wrecks never slow on their own (no linear damping in vacuum), so a drifting hull stays a
  // guess until somebody puts a line on it and brings it to rest.
  stillSpeed: 4, stillSpin: 0.45,
  paintSeconds: 6, smearGrace: 1.2, smearDecay: 0.35,
  // Red lead is finite. A mark costs paint; the tank refills at the line.
  paintPerMark: 0.17, lowPaint: 0.22, reloadSeconds: 20,
  // Danger: a marker withdraws, and remembers who hurt it.
  fleeRange: 420, fleeSeconds: 14, hurtQuietSeconds: 9,
  // The Last Layer: after this many corrections the marker asks to be held still itself.
  lastAfter: 6,
  // The one-voice arbiter queues a line against the sim clock and DROPS it unspoken if the floor stays held past its
  // ttl (a Customs alert easily holds it for 13 s). Story lines the marker cares about are re-offered, never forced.
  voiceTtl: 9, offerAttempts: 2,
  // Cadence.
  retargetSeconds: 2, retargetMargin: 40, nudgeSeconds: 40, quietSeconds: 55, voiceCooldown: 6,
  maxMarks: 24, maxLiveMarks: 8, markTextMax: 160,
});

export const RUBRIC_LINES = Object.freeze({
  discover: 'RUBRIC — HM-11, a retired Customs Gate hull marker, still marking. Hull F-41 hangs on its line. Scan to read its work.',
  hello: 'RUBRIC: HM-11. Hull marker, Tethys Customs Gate. Hull F-41 is on the line. Filed CLEARED. My gauges read organic 0.7. Deck mass 12.4. Manifest zero.',
  brief: 'RUBRIC: I do not mark a moving hull. A mark on a moving hull is a guess. Put a line on F-41 and bring it to rest.',
  nudge: 'RUBRIC: Moving. Not marked.',
  lineOn: 'RUBRIC: Line on. Bring it to rest. Speed first. Then the turn.',
  turning: 'RUBRIC: Slow now. Still turning. The face must stop.',
  still: 'RUBRIC: Still. Marking.',
  smear: 'RUBRIC: It moved. The mark smeared. Hold it.',
  f41: 'RUBRIC: F-41. Filed CLEARED by the desk. Corrected NOT CLEARED by the gauge. Both marks stay. The correction goes beside the filing.',
  seek: 'RUBRIC: Hull in range. Moving. Waiting for a line.',
  yours: 'RUBRIC: Cause on file: you. Two lines. Two lines mean the hand is known.',
  playerHull: 'RUBRIC: Your hull. Marked while you were gone. Cause on file. It stands.',
  lowPaint: 'RUBRIC: Red lead low. Back to the line.',
  reloaded: 'RUBRIC: Tank full.',
  flee: 'RUBRIC: Contact. Marker is not armed. Withdrawing.',
  safe: 'RUBRIC: Clear. Resuming.',
  hit: 'RUBRIC: Marker. Not a weapon. The marks stand.',
  wronged: 'RUBRIC: Damage logged. Cause: you. Double line.',
  witness3: 'RUBRIC: Three corrections. The filings stay beside them. Nobody has painted over either.',
  lastOffer: 'RUBRIC: Red lead nearly out. One mark left. Not a wreck. A marker that corrects is not CLEARED either. Put a line on me. Hold me still.',
  lastStill: 'RUBRIC: Still. Marking HM-11.',
  last: 'RUBRIC: HM-11. Filed CLEARED by the desk. Corrected by the gauge. The mark stands. Nothing further to mark.',
  news: 'TETHYS JUNCTION — A Customs marking drone has re-marked hull F-41 NOT CLEARED. The Gate has no statement.',
  memorial: 'RUBRIC — HM-11 is dark. Its marks stand on every hull it was given.',
  memorialScan: 'RUBRIC — the stencil wheel is blank and the tank is dry. The marks stand.',
  dead: 'RUBRIC — marker lost. The last mark on its tank is a double line. WAS HONEST.',
  third: 'RUBRIC: Third visit logged.',
});

// Ambient testimony while the player sits near the line without scanning. [after F-41?, text].
export const RUBRIC_QUIET = Object.freeze([
  Object.freeze({ f41: false, text: 'RUBRIC: Forty-one filings this season. Forty-one CLEARED.' }),
  Object.freeze({ f41: true, text: 'RUBRIC: Forty filings uncorrected. I can only mark what stops.' }),
  Object.freeze({ f41: null, text: 'RUBRIC: Red lead. Hull primer. Vacuum does not remove it.' }),
  Object.freeze({ f41: null, text: 'RUBRIC: The desk files what was wanted. The gauge reads what is there. I paint the gauge.' }),
  Object.freeze({ f41: null, text: 'RUBRIC: Wrecks do not stop on their own. Someone stops them.' }),
  Object.freeze({ f41: null, text: 'RUBRIC: Customs reads every hull. It does not read the marks beside them.' }),
  Object.freeze({ f41: null, text: 'RUBRIC: A wreck is the only filing that stopped.' }),
]);

// Truth-line vocabulary (composer lives in src/characters/rubricRules.js). Every fragment is a
// flat declarative; the composer joins them in a seeded order, never with Math.random.
export const RUBRIC_TRUTH = Object.freeze({
  causePlayer: Object.freeze(['Killed by you.', 'Cause on file: you.', 'Hand on file: yours.']),
  causeOther: Object.freeze(['Killed by {killer}.', 'Cause on file: {killer}.']),
  causeOtherUnnamed: Object.freeze(['Killed by another hull.', 'Hand on file: not named.']),
  causeLedger: Object.freeze(['Lost on the ledger.', 'Loss on the ledger, no hand named.']),
  causeUnknown: Object.freeze(['Cause not on file.', 'Cause: unlogged.']),
  causeYourHull: Object.freeze(['Yours. Cause on file: {killer}.', 'Yours. Killed by {killer}.']),
  causeYourHullUnnamed: Object.freeze(['Yours. Cause not on file.', 'Yours. Hand not named.']),
  holdScoured: 'Hold: scoured.',
  holdLean: Object.freeze({ scrap: 'Hold: scrap.', intact: 'Hold: cargo, mostly intact.', arms: 'Hold: arms residue.', thin: 'Hold: thin.' }),
  holdNone: 'Hold: nothing logged.',
  carried: Object.freeze(['Carried: {freight}.', 'Manifest: {freight}.']),
  legalRestricted: 'Strip: permit required.',
  legalOpen: 'Strip: nobody will ask.',
  ageMinutes: Object.freeze(['Dead {n} min.', 'Down {n} min.']),
  ageDays: Object.freeze(['Dead {n} {unit}.', 'Down {n} {unit}.']),
  ageFresh: 'Dead under a minute.',
  f41: 'Hull F-41. Filed CLEARED. Gauge: organic 0.7, deck mass 12.4. Manifest: zero. Marked NOT CLEARED.',
  self: 'Hull HM-11. Filed CLEARED by the desk. Corrected by the gauge. Marked.',
});

// One-time lines. Normalization keeps only these keys.
export const RUBRIC_TOLD = Object.freeze(['hello', 'brief', 'lineOn', 'f41', 'yours', 'playerHull',
  'witness3', 'lastOffer', 'wronged', 'seek']);

const finite = (v, fallback, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
const CAUSE = new Set(['p', 'o', 'l', 'u', 'y']);
const cleanText = (v, max) => typeof v === 'string'
  ? v.replace(/[^\x20-\x7e·—]/g, '').slice(0, max) : '';

export function freshRubricMemory() {
  return { version: 1, met: false, destroyed: false, hull: RUBRIC.hull, visits: 0, wronged: 0,
    f41: false, witness: 0, paint: 1, last: '', told: [], marks: [] };
}

export function normalizeRubricMemory(raw) {
  const out = freshRubricMemory();
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return out;
  for (const key of ['met', 'destroyed', 'f41']) out[key] = raw[key] === true;
  out.hull = finite(raw.hull, RUBRIC.hull, 0, RUBRIC.hull);
  out.visits = Math.floor(finite(raw.visits, 0, 0, 1e6));
  out.wronged = Math.floor(finite(raw.wronged, 0, 0, 99));
  out.paint = finite(raw.paint, 1, 0, 1);
  out.last = raw.last === 'offered' || raw.last === 'done' ? raw.last : '';
  out.told = Array.isArray(raw.told)
    ? [...new Set(raw.told.filter(k => RUBRIC_TOLD.includes(k)))] : [];
  const seen = new Set();
  const marks = [];
  for (const m of Array.isArray(raw.marks) ? raw.marks : []) {
    if (!m || typeof m !== 'object') continue;
    const k = cleanText(m.k, 48);
    if (!k || seen.has(k) || !CAUSE.has(m.c)) continue;
    seen.add(k);
    marks.push({ k, c: m.c, s: m.s === 3 ? 3 : m.s === 2 ? 2 : 1,
      x: cleanText(m.x, RUBRIC.markTextMax), t: finite(m.t, 0, 0, 1e9) });
  }
  out.marks = marks.slice(-RUBRIC.maxMarks);
  out.witness = Math.floor(finite(raw.witness, 0, 0, 1e6));
  out.witness = Math.max(out.witness, out.marks.length);
  out.f41 = out.f41 || out.marks.some(m => m.k === 'f41');
  out.destroyed ||= out.hull === 0;
  if (out.destroyed) { out.hull = 0; out.last = out.last === 'done' ? '' : out.last; }
  return out;
}

export const RUBRIC_AUDIO_RECIPES = Object.freeze([
  // Stencil wheel indexing to a new cartridge: a short mechanical tick.
  { id: 'sfx_rubric_wake', category: 'world', type: 'oscillator', wave: 'square',
    baseFreq: 1900, freqSweep: [1900, 1100], sweepTimeS: 0.05, filterType: 'bandpass', filterFreq: 1500, filterQ: 2,
    gainEnvelope: { attack: 0.002, decay: 0.05, sustain: 0.0, release: 0.08 }, gainMult: 0.16 },
  // Aerosol hiss while the nozzle is open.
  { id: 'sfx_rubric_spray', category: 'world', type: 'noise_burst', noiseColor: 'white',
    filterType: 'bandpass', filterFreq: 4200, filterQ: 0.8,
    gainEnvelope: { attack: 0.06, decay: 0.2, sustain: 0.5, release: 0.5 }, gainMult: 0.24 },
  // Clamp pads closing on a hull.
  { id: 'sfx_rubric_clamp', category: 'world', type: 'oscillator', wave: 'triangle',
    baseFreq: 120, freqSweep: [120, 62], sweepTimeS: 0.16, filterType: 'lowpass', filterFreq: 600,
    gainEnvelope: { attack: 0.004, decay: 0.14, sustain: 0.1, release: 0.3 }, gainMult: 0.34 },
  // A completed mark: one flat tone, no flourish.
  { id: 'sfx_rubric_done', category: 'world', type: 'oscillator', wave: 'triangle',
    baseFreq: 392, freqSweep: [392, 330], sweepTimeS: 0.22,
    gainEnvelope: { attack: 0.008, decay: 0.3, sustain: 0.18, release: 1.1 }, gainMult: 0.26 },
  // Withdrawal tone.
  { id: 'sfx_rubric_alarm', category: 'world', type: 'oscillator', wave: 'sawtooth',
    baseFreq: 520, freqSweep: [520, 260], sweepTimeS: 0.3, filterType: 'lowpass', filterFreq: 1800,
    gainEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.12, release: 0.5 }, gainMult: 0.2 },
  // The last mark: low, long, quiet.
  { id: 'sfx_rubric_last', category: 'world', type: 'oscillator', wave: 'sine',
    baseFreq: 110, freqSweep: [110, 98], sweepTimeS: 2.4,
    gainEnvelope: { attack: 0.4, decay: 1.2, sustain: 0.3, release: 3.2 }, gainMult: 0.3 },
]);
