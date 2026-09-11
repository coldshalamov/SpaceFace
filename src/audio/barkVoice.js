// PQ-158.04 — directed synthetic voice for the 271-line bark corpus.
//
// Eight faction registers + the mechanic. No recorded actors. Speech params, radio processing,
// and caption text are pure functions of (faction, situation, line). Sim RNG is never read.
// Agents run scripts/generate-bark-voice.mjs to emit representative WAVs.

import { BARKS, BARK_FACTIONS, BARK_SITUATIONS } from '../data/barks.js';
import { SAMPLE_MANIFEST } from './sampleLibrary.js';
import { detectPitchHz, decodePcmWav } from './themeCompose.js';

export const BARK_VOICE_SEED = 15804;
export const BARK_CORPUS_TARGET = 271;

export const BARK_RECIPE_ID = 'sfx_bark_radio';

function hash32(text) {
  const s = String(text || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

function register(id, label, spec) {
  return Object.freeze({
    id,
    label,
    sampleId: spec.sampleId,
    f0: spec.f0,
    pitch: spec.pitch,
    rate: spec.rate,
    filterHz: spec.filterHz,
    q: spec.q,
    noise: spec.noise,
    bandpassLo: spec.bandpassLo,
    bandpassHi: spec.bandpassHi,
    drive: spec.drive,
    formants: Object.freeze(spec.formants.slice()),
  });
}

// Eight registers a stranger can tell apart blind: pitch, cadence, filter, and grit.
export const FACTION_VOICE_REGISTERS = Object.freeze({
  faction_scn: register('faction_scn', 'Concord', {
    sampleId: 'bark_scn', f0: 110, pitch: 0.88, rate: 0.94,
    filterHz: 1200, q: 2.2, noise: 0.10, bandpassLo: 420, bandpassHi: 2600, drive: 0.18,
    formants: [700, 1220, 2600],
  }),
  faction_mts: register('faction_mts', 'Meridian', {
    sampleId: 'bark_mts', f0: 140, pitch: 1.06, rate: 1.04,
    filterHz: 2100, q: 1.1, noise: 0.06, bandpassLo: 380, bandpassHi: 3200, drive: 0.08,
    formants: [480, 1450, 2450],
  }),
  faction_dmc: register('faction_dmc', 'Drift', {
    sampleId: 'bark_dmc', f0: 95, pitch: 0.82, rate: 0.90,
    filterHz: 900, q: 1.4, noise: 0.18, bandpassLo: 280, bandpassHi: 2200, drive: 0.28,
    formants: [550, 1000, 2300],
  }),
  faction_reach: register('faction_reach', 'Reach', {
    sampleId: 'bark_reach', f0: 155, pitch: 1.12, rate: 1.08,
    filterHz: 2400, q: 0.8, noise: 0.14, bandpassLo: 500, bandpassHi: 3400, drive: 0.22,
    formants: [650, 1600, 2800],
  }),
  faction_quiet: register('faction_quiet', 'Quiet', {
    sampleId: 'bark_quiet', f0: 125, pitch: 0.96, rate: 0.78,
    filterHz: 800, q: 3.5, noise: 0.04, bandpassLo: 360, bandpassHi: 1800, drive: 0.06,
    formants: [400, 900, 2100],
  }),
  faction_choir: register('faction_choir', 'Choir', {
    sampleId: 'bark_choir', f0: 170, pitch: 1.18, rate: 0.88,
    filterHz: 1600, q: 4.0, noise: 0.08, bandpassLo: 440, bandpassHi: 3000, drive: 0.12,
    formants: [800, 1400, 2700],
  }),
  faction_free: register('faction_free', 'Frontier', {
    sampleId: 'bark_free', f0: 130, pitch: 1.00, rate: 1.00,
    filterHz: 1700, q: 1.0, noise: 0.09, bandpassLo: 350, bandpassHi: 2800, drive: 0.14,
    formants: [600, 1300, 2500],
  }),
  faction_vael: register('faction_vael', 'Vael', {
    sampleId: 'bark_vael', f0: 80, pitch: 0.74, rate: 0.86,
    filterHz: 600, q: 2.8, noise: 0.05, bandpassLo: 220, bandpassHi: 1600, drive: 0.32,
    formants: [350, 800, 1900],
  }),
});

export const MECHANIC_VOICE_REGISTER = register('mechanic', 'Mechanic', {
  sampleId: 'bark_mechanic', f0: 105, pitch: 0.90, rate: 0.98,
  filterHz: 1100, q: 1.6, noise: 0.16, bandpassLo: 300, bandpassHi: 2400, drive: 0.2,
  formants: [580, 1150, 2400],
});

export const MECHANIC_LINES = Object.freeze([
  'Graze on the hull. Soft enough the paint still argues.',
  'Hard scar on the hull. That is a real hit.',
  'Heavy scar on the hull. Do not call it weather.',
  'Crushing scar on the hull. The frame kept it.',
  'Yard patched the hull. The weld is still proud.',
  'Heat is on this hull. The law already filed the rap.',
  'The ship ledger already has a fact on this hull.',
  'Clean plate. Nothing on this hull to file.',
]);

export function resolveVoiceRegister(factionId, mechanic = false) {
  if (mechanic || factionId === 'mechanic') return MECHANIC_VOICE_REGISTER;
  return FACTION_VOICE_REGISTERS[factionId] || FACTION_VOICE_REGISTERS.faction_free;
}

function durationS(line, rate) {
  const words = String(line || '').trim().split(/\s+/).filter(Boolean).length;
  const seconds = 0.28 + words * 0.22 * (1 / Math.max(0.5, rate));
  return Math.round(Math.min(4.8, Math.max(0.45, seconds)) * 1000) / 1000;
}

/**
 * Directed speech params for one line. Deterministic: same inputs always yield the same object.
 * Caption text is the line itself so subtitles never drift from the voice.
 */
export function resolveBarkVoice(input = {}) {
  const mechanic = !!(input.mechanic || input.kind === 'mechanic' || input.factionId === 'mechanic');
  const factionId = mechanic
    ? 'mechanic'
    : (input.factionId && FACTION_VOICE_REGISTERS[input.factionId] ? input.factionId : 'faction_free');
  const situation = mechanic
    ? 'berth'
    : (BARK_SITUATIONS.includes(input.situation) ? input.situation : 'scan');
  const line = typeof input.line === 'string' && input.line.trim()
    ? input.line.trim()
    : (mechanic ? MECHANIC_LINES[0] : ((BARKS[factionId] && BARKS[factionId][situation] && BARKS[factionId][situation][0]) || '...'));
  const register = resolveVoiceRegister(factionId, mechanic);
  const h = hash32(`${factionId}|${situation}|${line}`);
  const jitter = ((h % 17) - 8) / 400; // ±0.02, hashed, not Math.random
  const pitch = Math.round((register.pitch + jitter) * 1000) / 1000;
  const rate = Math.round((register.rate + ((h >>> 8) % 9 - 4) / 500) * 1000) / 1000;
  // Identity pitch is the register fundamental. Pitch/rate shape cadence and the synth layer;
  // multiplying f0 by pitch made Vael (59 Hz) inaudible to the stranger and to radio HP.
  const f0 = register.f0;
  return Object.freeze({
    schema: 'spaceface.barkVoice.v1',
    seed: BARK_VOICE_SEED,
    factionId,
    situation,
    mechanic,
    registerId: register.id,
    registerLabel: register.label,
    sampleId: register.sampleId,
    recipeId: BARK_RECIPE_ID,
    caption: line,
    line,
    speech: Object.freeze({
      f0,
      pitch,
      rate,
      filterHz: register.filterHz,
      q: register.q,
      formants: register.formants,
      durationS: durationS(line, rate),
    }),
    radio: Object.freeze({
      bandpassLo: register.bandpassLo,
      bandpassHi: register.bandpassHi,
      noise: register.noise,
      drive: register.drive,
    }),
    gain: mechanic ? 0.72 : 0.8,
    assertive: situation === 'attack' || situation === 'warn' || situation === 'demand-cargo',
    hash: h,
  });
}

export function resolveBarkSampleBinding(sampleId) {
  const entry = sampleId ? SAMPLE_MANIFEST.get(sampleId) : null;
  if (!entry) return null;
  return {
    sampleId,
    file: entry.file,
    tier: entry.tier,
    loop: !!entry.loop,
    share: 0.78,
    gain: 1,
    rate: 1,
  };
}

export function countBarkCorpus() {
  let count = 0;
  for (const factionId of BARK_FACTIONS) {
    const pack = BARKS[factionId];
    if (!pack) continue;
    for (const situation of BARK_SITUATIONS) {
      const lines = pack[situation];
      if (Array.isArray(lines)) count += lines.length;
    }
  }
  return count;
}

/**
 * Every bark line through the directed pipeline: speech params + caption, no WAV required.
 * Order is faction × situation × line, stable.
 */
export function enumerateBarkPipeline() {
  const rows = [];
  for (const factionId of BARK_FACTIONS) {
    const pack = BARKS[factionId];
    if (!pack) continue;
    for (const situation of BARK_SITUATIONS) {
      const lines = pack[situation] || [];
      for (let i = 0; i < lines.length; i++) {
        rows.push(resolveBarkVoice({ factionId, situation, line: lines[i] }));
      }
    }
  }
  return rows;
}

export function enumerateMechanicPipeline() {
  return MECHANIC_LINES.map((line) => resolveBarkVoice({ mechanic: true, line }));
}

export function factionRegistersAreDistinct() {
  const sigs = BARK_FACTIONS.map((id) => {
    const r = FACTION_VOICE_REGISTERS[id];
    return `${r.f0}:${r.pitch}:${r.rate}:${r.filterHz}:${r.q}:${r.noise}`;
  });
  return new Set(sigs).size === sigs.length;
}

/** Blind listen: name the faction from f0/rate/filter, never from the label. */
export function identifyRegisterFromSpeech(speech = {}) {
  const f0 = Number(speech.f0);
  const rate = Number(speech.rate);
  const filterHz = Number(speech.filterHz);
  let best = null;
  let bestDist = Infinity;
  for (const factionId of BARK_FACTIONS) {
    const r = FACTION_VOICE_REGISTERS[factionId];
    const dist = Math.abs(r.f0 - f0) + Math.abs(r.rate - rate) * 40 + Math.abs(r.filterHz - filterHz) / 80;
    if (dist < bestDist) {
      bestDist = dist;
      best = factionId;
    }
  }
  return bestDist < 8 ? best : null;
}

/** Pipeline delivery path: one WAV per corpus row, written by generate-bark-voice.mjs --all. */
export function deliveredBarkWavRelPath(index, registerId) {
  const n = String(Number(index) || 0).padStart(3, '0');
  return `assets/audio/voice/line_${n}_${registerId}.wav`;
}

export function enumerateDeliveredBarkWavs() {
  return enumerateBarkPipeline().map((row, index) => Object.freeze({
    index,
    file: deliveredBarkWavRelPath(index, row.registerId),
    factionId: row.factionId,
    registerId: row.registerId,
    caption: row.caption,
  }));
}

export const BARK_UTTERANCE_SECONDS = 1.05;
export const REGISTER_CALLSIGN_SECONDS = 0.7;

class VoiceBiquad {
  constructor(type, f0, q, sr) {
    const w0 = (2 * Math.PI * Math.min(f0, sr * 0.49)) / sr;
    const cos = Math.cos(w0);
    const sin = Math.sin(w0);
    const alpha = sin / (2 * Math.max(0.1, q));
    let b0;
    let b1;
    let b2;
    let a0;
    let a1;
    let a2;
    if (type === 'lp') {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
    } else if (type === 'hp') {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
    } else {
      b0 = alpha; b1 = 0; b2 = -alpha;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = a1 / a0; this.a2 = a2 / a0;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Directed synthetic utterance: glottal identity at the register fundamental, formants, radio
 * band, and a dry carrier so a stranger can name the register from the WAV. Hash-seeded noise
 * only. Never reads sim RNG.
 */
export function renderBarkUtterancePcm(resolved, options = {}) {
  const sr = options.sampleRate || 32000;
  const dur = options.seconds == null
    ? (resolved && resolved.speech && resolved.speech.durationS) || BARK_UTTERANCE_SECONDS
    : options.seconds;
  const n = Math.max(1, Math.round(Number(dur) * sr));
  const out = new Float64Array(n);
  if (!resolved || !resolved.speech) return out;
  const f0 = Number(resolved.speech.f0);
  if (!(f0 > 0)) return out;
  const rng = mulberry32((resolved.hash || 0) ^ BARK_VOICE_SEED);
  const formants = (resolved.speech.formants || []).map((hz) => new VoiceBiquad('bp', hz, 8, sr));
  const radio = resolved.radio || {};
  const radioLo = new VoiceBiquad('hp', radio.bandpassLo || 300, 0.7, sr);
  const radioHi = new VoiceBiquad('lp', radio.bandpassHi || 2800, 0.7, sr);
  const words = String(resolved.line || '').trim().split(/\s+/).filter(Boolean).length || 1;
  let phase = 0;
  const noiseAmt = Math.min(0.08, Number(radio.noise || 0) * 0.35);
  const drive = Number(radio.drive) || 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.02) * Math.min(1, (dur - t) / 0.08);
    const syllable = 0.84 + 0.16 * Math.abs(Math.sin(Math.PI * words * (t / Math.max(0.05, dur))));
    const carrier = 0.72 * Math.sin(2 * Math.PI * f0 * t) + 0.18 * Math.sin(2 * Math.PI * 2 * f0 * t);
    const buzz = (phase % 1) < 0.12 ? 1 : -0.12;
    phase += f0 / sr;
    let wet = buzz * 0.4;
    for (const f of formants) wet = f.process(wet);
    wet = radioHi.process(radioLo.process(wet));
    if (drive) wet = Math.tanh(wet * (1 + drive * 3));
    wet += (rng() * 2 - 1) * noiseAmt;
    out[i] = env * syllable * (0.46 * carrier + 0.54 * wet);
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const norm = peak > 1e-9 ? 0.92 / peak : 0;
  if (norm !== 1) for (let i = 0; i < n; i++) out[i] *= norm;
  return out;
}

/** Isolated pitch callsign: a stranger hears the register's fundamental, no radio hash. */
export function renderRegisterCallsignPcm(register, options = {}) {
  const f0 = Number(register && register.f0);
  const sr = options.sampleRate || 32000;
  const seconds = options.seconds == null ? REGISTER_CALLSIGN_SECONDS : options.seconds;
  const n = Math.max(1, Math.round(seconds * sr));
  const pcm = new Float64Array(n);
  if (!(f0 > 0)) return pcm;
  const attack = Math.max(2, Math.round(0.02 * sr));
  const release = Math.max(2, Math.round(0.05 * sr));
  for (let i = 0; i < n; i++) {
    let env = 1;
    if (i < attack) env = i / attack;
    const remain = n - 1 - i;
    if (remain < release) env *= remain / release;
    const t = i / sr;
    pcm[i] = env * 0.78 * Math.sin(2 * Math.PI * f0 * t);
  }
  return pcm;
}

/** Name a faction from unlabeled PCM. Never reads the filename or the register label. */
export function identifyRegisterFromPcm(pcm, sampleRate = 32000) {
  const f0 = detectPitchHz(
    pcm,
    sampleRate,
    Math.floor(pcm.length * 0.15),
    Math.floor(pcm.length * 0.85),
    { minHz: 70, maxHz: 200 },
  );
  if (!(f0 > 0)) return null;
  let best = null;
  let bestDist = Infinity;
  for (const factionId of BARK_FACTIONS) {
    const dist = Math.abs(FACTION_VOICE_REGISTERS[factionId].f0 - f0);
    if (dist < bestDist) {
      bestDist = dist;
      best = factionId;
    }
  }
  return bestDist < 3 ? best : null;
}

/** Decode a WAV and name the register. Never reads the filename. */
export function identifyRegisterFromWavBuffer(buf) {
  const decoded = decodePcmWav(buf);
  if (!decoded) return null;
  return identifyRegisterFromPcm(decoded.pcm, decoded.sampleRate);
}

export const BLIND_REGISTER_CLIPS = Object.freeze(
  [...BARK_FACTIONS]
    .sort((a, b) => FACTION_VOICE_REGISTERS[a].f0 - FACTION_VOICE_REGISTERS[b].f0)
    .map((factionId, index) => Object.freeze({
      index,
      file: `assets/audio/voice/blind/clip_${String(index).padStart(2, '0')}.wav`,
      factionId,
    })),
);

