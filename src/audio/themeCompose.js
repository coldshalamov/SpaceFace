// PQ-158.03 — authored theme stems and the stranger listen.
//
// Pure DSP: render the four state motifs and per-sector beds to PCM, encode WAV, and recover
// what a listener would hum / name without reading motif labels. Audio is presentation.
// Seed 15803. No Math.random, no wall clock.

import {
  THEME_MATRIX_SEED,
  THEME_STATES,
  THEME_MOTIFS,
  MOTIF_STEPS_PER_BAR,
  SECTOR_BEDS,
  resolveSectorBed,
} from './themeMatrix.js';
import { renderComposedSectorBedPcm } from './sectorScoreBeds.js';

export const THEME_SAMPLE_RATE = 32000;
export const THEME_STEM_SECONDS = 16;
export const THEME_BED_SECONDS = 2;

const SEMITONES = Object.freeze({
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
});
const NOTE_FROM_PC = Object.freeze(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']);

export function noteToHz(note, octave = 4) {
  const s = SEMITONES[note];
  if (s == null) return 440;
  return 440 * Math.pow(2, (s - 9) / 12 + (octave - 4));
}

export function hzToNoteName(hz) {
  if (!(hz > 20) || !Number.isFinite(hz)) return null;
  const midi = 69 + 12 * Math.log2(hz / 440);
  const rounded = Math.round(midi);
  return NOTE_FROM_PC[(rounded % 12 + 12) % 12];
}

export function sampleOsc(phase, wave) {
  const p = phase - Math.floor(phase);
  if (wave === 'triangle') return 1 - 4 * Math.abs(p - 0.5);
  if (wave === 'sawtooth') return 2 * p - 1;
  if (wave === 'square') return p < 0.5 ? 1 : -1;
  return Math.sin(2 * Math.PI * p);
}

function hash32(str) {
  let h = 0x811c9dc5 ^ THEME_MATRIX_SEED;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

function noiseAt(i, seed) {
  let x = Math.imul(i + 1, 0x6d2b79f5) ^ seed;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  return (x / 4294967296) * 2 - 1;
}

function motifSteps(motif) {
  if (motif && Array.isArray(motif.steps) && motif.steps.length) return motif.steps;
  const notes = (motif && motif.notes) || [];
  const octaves = (motif && motif.octaves) || [];
  return notes.map((note, i) => ({
    bar: 0,
    beat: i * 4,
    note,
    oct: octaves[i] == null ? 4 : octaves[i],
    dur: i === notes.length - 1 ? 8 : 4,
  }));
}

function sixteenthSeconds(motif) {
  const bpm = Math.max(40, Number(motif && motif.bpm) || 80);
  return (60 / bpm) / 4;
}

/**
 * X4 #1 — a motif row's time on the loop, in seconds. `beat` is a SIXTEENTH index inside its bar
 * (the sequencer reads `step % 16`), so `bar` advances sixteen sixteenths, not one. Reading `beat`
 * alone put the boss's bar-1 F# on top of its bar-0 A and the whole performance lost its tune.
 */
export function motifStepSeconds(row, sixteenth) {
  const bar = Math.max(0, Number(row && row.bar) || 0);
  const beat = Math.max(0, Number(row && row.beat) || 0);
  return (bar * MOTIF_STEPS_PER_BAR + beat) * sixteenth;
}

/** One phrase's length in seconds: the last note's end, rests after it excluded. */
export function motifSpanSeconds(motif) {
  const sixteenth = sixteenthSeconds(motif);
  let end = 0;
  for (const row of motifSteps(motif)) {
    const t1 = motifStepSeconds(row, sixteenth) + (Number(row.dur) || 0) * sixteenth;
    if (t1 > end) end = t1;
  }
  return end;
}

/** Write one enveloped oscillator note into `pcm` at `t0`. */
function addTone(pcm, sr, hz, t0, dur, peak, wave) {
  if (!(hz > 0) || !(dur > 0) || !(peak > 0)) return;
  const i0 = Math.round(t0 * sr);
  const len = Math.round(dur * sr);
  const attack = Math.max(2, Math.round(0.012 * sr));
  const release = Math.max(2, Math.round(Math.min(0.08, dur * 0.22) * sr));
  for (let i = 0; i < len && i0 + i < pcm.length; i++) {
    if (i0 + i < 0) continue;
    let env = 1;
    if (i < attack) env = i / attack;
    const remain = len - 1 - i;
    if (remain < release) env *= remain / release;
    pcm[i0 + i] += peak * env * sampleOsc((i / sr) * hz, wave);
  }
}

/** Isolated hummable lead: one oscillator per motif step, gaps between notes, no pad. */
export function renderMotifLeadPcm(motif, options = {}) {
  const steps = motifSteps(motif);
  const sixteenth = sixteenthSeconds(motif);
  const sr = options.sampleRate || THEME_SAMPLE_RATE;
  const extra = options.tailS == null ? 0.25 : options.tailS;
  let endS = extra;
  for (const row of steps) {
    const t1 = motifStepSeconds(row, sixteenth) + (Number(row.dur) || 0) * sixteenth;
    if (t1 > endS) endS = t1;
  }
  endS += extra;
  const n = Math.max(1, Math.round(endS * sr));
  const pcm = new Float64Array(n);
  const peak = options.peak == null ? 0.62 : options.peak;
  const wave = options.wave || 'sine';
  for (const row of steps) {
    addTone(
      pcm, sr, noteToHz(row.note, row.oct),
      motifStepSeconds(row, sixteenth),
      (Number(row.dur) || 0) * sixteenth * 0.82,
      peak, wave,
    );
  }
  return pcm;
}

export function renderSectorBedPcm(bed, options = {}) {
  const row = bed && bed.hzA ? bed : resolveSectorBed(bed);
  if (row.composition) return renderComposedSectorBedPcm(row, { ...options, sampleRate: options.sampleRate || THEME_SAMPLE_RATE });
  const sr = options.sampleRate || THEME_SAMPLE_RATE;
  const seconds = options.seconds == null ? THEME_BED_SECONDS : options.seconds;
  const n = Math.max(1, Math.round(seconds * sr));
  const pcm = new Float64Array(n);
  const seed = hash32(row.id || row.label || 'bed');
  const ampA = 0.42;
  const ampB = 0.22;
  const noiseAmp = Math.max(0, Number(row.noise) || 0) * 0.55;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const a = sampleOsc(t * row.hzA, row.waveA || 'sine');
    const b = sampleOsc(t * row.hzB, row.waveB || 'sine');
    const white = noiseAt(i, seed);
    lp = lp * 0.72 + white * 0.28;
    let s = ampA * a + ampB * b + noiseAmp * lp;
    const fade = Math.min(1, t / 0.03, (seconds - t) / 0.03);
    pcm[i] = s * fade;
  }
  return pcm;
}

function addPadWindow(pcm, sr, hz, wave, amp, t0, t1) {
  if (!(hz > 0) || !(amp > 0)) return;
  const i0 = Math.max(0, Math.round(t0 * sr));
  const i1 = Math.min(pcm.length, Math.round(t1 * sr));
  if (i1 <= i0) return;
  const fade = Math.max(1, Math.round(0.12 * sr));
  for (let i = i0; i < i1; i++) {
    const a = Math.min(1, (i - i0) / fade, (i1 - i) / fade);
    pcm[i] += amp * a * sampleOsc((i / sr) * hz, wave);
  }
}

/**
 * X4 #2 — the 16 s form. Four passes, each one motif phrase long, and they are NOT the same bar:
 * A the written line, B the same line walked backwards with a fill (a musical answer, not a key
 * change), A again with a fill and a held fifth, C the same notes from the second degree and a
 * pad on the fourth. A tiled 4 s loop was the brief's own never-list ("a 4-bar loop with no
 * development"); this is the change across the loop the listener hears.
 */
export const STEM_PASS_FORM = Object.freeze([
  Object.freeze({ id: 'A', order: Object.freeze([0, 1, 2, 3]), padInterval: 0, fill: false, fifth: false, gain: 1 }),
  Object.freeze({ id: 'B', order: Object.freeze([3, 2, 1, 0]), padInterval: 0, fill: true, fifth: false, gain: 0.9 }),
  Object.freeze({ id: 'A2', order: Object.freeze([0, 1, 2, 3]), padInterval: 0, fill: true, fifth: true, gain: 1 }),
  Object.freeze({ id: 'C', order: Object.freeze([1, 0, 2, 3]), padInterval: 5, fill: false, fifth: false, gain: 0.92 }),
]);

/** Authored stem: the motif phrased across a developing 16 s form, a moving chord pad and bass. */
export function renderThemeStemPcm(state, options = {}) {
  const motif = THEME_MOTIFS[state] || THEME_MOTIFS.travel;
  const sr = options.sampleRate || THEME_SAMPLE_RATE;
  const seconds = options.seconds == null ? THEME_STEM_SECONDS : options.seconds;
  const n = Math.max(1, Math.round(seconds * sr));
  const pcm = new Float64Array(n);
  const sixteenth = sixteenthSeconds(motif);
  const steps = motifSteps(motif);
  const span = Math.max(0.25, motifSpanSeconds(motif));
  // A short breath between phrases keeps the form legible without silence inside the loop.
  const passSpan = span + Math.min(0.2, span * 0.05);
  const leadPeak = 0.58;
  const hard = state === 'combat' || state === 'boss';
  const waveA = hard ? 'sawtooth' : 'sine';
  const waveB = hard ? 'square' : 'triangle';
  const unique = [...new Set(motif.notes)];
  const rootOct = Math.max(2, (motif.octaves[0] || 4) - 1);
  const barS = (60 / Math.max(40, Number(motif.bpm) || 80)) * 4;
  const padGain = state === 'boss' ? 0.045 : 0.028;
  const passes = Math.max(1, Math.ceil(seconds / passSpan));

  for (let p = 0; p < passes; p++) {
    const base = p * passSpan;
    const form = STEM_PASS_FORM[p % STEM_PASS_FORM.length];
    const passEnd = Math.min(seconds, base + passSpan);
    // The pass's line: the motif's note slots in this section's order. Reordering the notes
    // (never the rhythm) is the answer phrase; the key stays the key.
    const line = steps.map((row, i) => steps[form.order[i] % steps.length] && {
      note: steps[form.order[i] % steps.length].note,
      oct: steps[form.order[i] % steps.length].oct,
      dur: row.dur,
      at: motifStepSeconds(row, sixteenth),
    });

    // Lead: the line in this pass's voice. Alternating passes change timbre as well as pitch
    // order, so the loop's four sections are distinguishable even at low volume.
    for (const row of line) {
      if (!row) continue;
      const t0 = base + row.at;
      if (t0 >= seconds) continue;
      addTone(
        pcm, sr, noteToHz(row.note, row.oct), t0,
        (Number(row.dur) || 0) * sixteenth * 0.82,
        leadPeak * form.gain,
        p % 2 === 1 ? waveB : waveA,
      );
    }
    // Fill: two passing sixteenths an octave up, laid over the phrase's tail.
    if (form.fill && unique[1] && unique[2]) {
      const fillAt = base + span - sixteenth * 2;
      addTone(pcm, sr, noteToHz(unique[1], (motif.octaves[1] || 4) + 1), fillAt, sixteenth * 0.9, leadPeak * 0.42, waveB);
      addTone(pcm, sr, noteToHz(unique[2], (motif.octaves[2] || 4) + 1), fillAt + sixteenth, sixteenth * 0.9, leadPeak * 0.36, waveB);
    }

    // Pad: the pass's own root, low and slow, re-voiced each section.
    const padRatio = Math.pow(2, form.padInterval / 12);
    const rootHz = noteToHz(unique[0], rootOct) * padRatio;
    addPadWindow(pcm, sr, rootHz, 'triangle', padGain, base, passEnd);
    if (unique[1]) addPadWindow(pcm, sr, noteToHz(unique[1], 4) * padRatio, 'sine', padGain * 0.6, base, passEnd);
    if (unique[2]) addPadWindow(pcm, sr, noteToHz(unique[2], 4) * padRatio, 'sine', padGain * 0.5, base, passEnd);
    // A2 holds the fifth under the phrase: the one section with a counter-voice.
    if (form.fifth) addPadWindow(pcm, sr, rootHz * 1.5, 'triangle', padGain * 0.8, base, passEnd);

    // The advertised layers that a pad alone does not carry: choir (boss/station) and a brass
    // answer (combat/boss). Both sit well under the lead so the stranger still names the motif.
    if (state === 'boss' || state === 'station') {
      const choir = state === 'boss' ? 0.055 : 0.03;
      addPadWindow(pcm, sr, rootHz, 'sine', choir, base, passEnd);
      addPadWindow(pcm, sr, rootHz * 1.5, 'triangle', choir * 0.7, base, passEnd);
      addPadWindow(pcm, sr, rootHz * 2, 'sine', choir * 0.5, base, passEnd);
    }
    if (hard) {
      const brass = state === 'boss' ? 0.06 : 0.045;
      const stabAt = base + span * 0.5;
      addTone(pcm, sr, rootHz * 2, stabAt, sixteenth * 4, brass, 'sawtooth');
      addTone(pcm, sr, rootHz * 3, stabAt, sixteenth * 4, brass * 0.7, 'sawtooth');
    }

    // A root pulse at each bar: the body that makes the loop feel like a piece, not a lead line.
    for (let t0 = base; t0 < passEnd; t0 += barS) {
      const i0 = Math.round(t0 * sr);
      const len = Math.min(n - i0, Math.round(barS * 0.6 * sr));
      for (let i = 0; i < len; i++) {
        pcm[i0 + i] += 0.045 * Math.exp(-3 * (i / Math.max(1, len)))
          * sampleOsc((i / sr) * rootHz * 0.5, 'sine');
      }
    }
  }
  return pcm;
}

export function encodeWavPcm16(pcm, sampleRate = THEME_SAMPLE_RATE) {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  const norm = peak > 1e-9 ? 0.97 / peak : 0;
  const n = pcm.length;
  const data = n * 2;
  const buf = Buffer.alloc(44 + data);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + data, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(data, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, pcm[i] * norm));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

export function decodePcmWav(buf) {
  if (!buf || buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  if (channels !== 1 || bits !== 16) return null;
  const dataBytes = buf.readUInt32LE(40);
  const n = Math.floor(dataBytes / 2);
  const pcm = new Float64Array(n);
  for (let i = 0; i < n; i++) pcm[i] = buf.readInt16LE(44 + i * 2) / 32768;
  return { pcm, sampleRate, seconds: n / sampleRate };
}

export function detectPitchHz(pcm, sampleRate, start = 0, end = pcm.length, options = {}) {
  const i0 = Math.max(0, start | 0);
  const i1 = Math.min(pcm.length, end | 0);
  const n = i1 - i0;
  if (n < 32) return 0;
  const minHz = options.minHz || 180;
  const maxHz = options.maxHz || 1000;
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(n - 2, Math.floor(sampleRate / minHz));
  let bestLag = 0;
  let bestCorr = 0;
  const corrs = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    let e1 = 0;
    let e2 = 0;
    const count = n - lag;
    for (let i = 0; i < count; i++) {
      const a = pcm[i0 + i];
      const b = pcm[i0 + i + lag];
      acc += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    const corr = acc / Math.sqrt(e1 * e2 + 1e-12);
    corrs.push(corr);
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestCorr < 0.55 || !bestLag) return 0;
  // Shortest local peak near the global max — fundamental, not a shoulder or subharmonic.
  const floor = bestCorr * 0.9;
  let chosen = bestLag;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const c = corrs[lag - minLag];
    if (c < floor) continue;
    if (c >= corrs[lag - 1 - minLag] && c >= corrs[lag + 1 - minLag]) {
      chosen = lag;
      break;
    }
  }
  const idx = chosen - minLag;
  const c0 = corrs[idx - 1] || 0;
  const c1 = corrs[idx];
  const c2 = corrs[idx + 1] || 0;
  const denom = c0 - 2 * c1 + c2;
  const delta = Math.abs(denom) > 1e-9 ? 0.5 * (c0 - c2) / denom : 0;
  const lag = chosen + Math.max(-0.45, Math.min(0.45, delta));
  return sampleRate / lag;
}

export function detectNoteWindows(pcm, sampleRate) {
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  const win = Math.max(hop, Math.round(sampleRate * 0.03));
  const rms = [];
  for (let i = 0; i + win <= pcm.length; i += hop) {
    let s = 0;
    for (let j = 0; j < win; j++) s += pcm[i + j] * pcm[i + j];
    rms.push({ i, v: Math.sqrt(s / win) });
  }
  let peak = 0;
  for (const r of rms) if (r.v > peak) peak = r.v;
  const thr = peak * 0.22;
  const windows = [];
  let inNote = false;
  let start = 0;
  for (const r of rms) {
    if (!inNote && r.v >= thr) {
      inNote = true;
      start = r.i;
    } else if (inNote && r.v < thr * 0.55) {
      windows.push({ start, end: r.i });
      inNote = false;
    }
  }
  if (inNote) windows.push({ start, end: pcm.length });
  return windows.filter((w) => (w.end - w.start) / sampleRate >= 0.12);
}

/**
 * Stranger hum: recover note names from PCM. Never reads motif.hummable or motif.notes.
 */
export function humMelodyFromPcm(pcm, sampleRate = THEME_SAMPLE_RATE) {
  const windows = detectNoteWindows(pcm, sampleRate);
  const notes = [];
  for (const w of windows) {
    const mid0 = w.start + Math.floor((w.end - w.start) * 0.2);
    const mid1 = w.start + Math.floor((w.end - w.start) * 0.8);
    const hz = detectPitchHz(pcm, sampleRate, mid0, mid1, { minHz: 180, maxHz: 1100 });
    const name = hzToNoteName(hz);
    if (name) notes.push(name);
  }
  return notes;
}

function goertzelMag(pcm, sampleRate, freq) {
  if (!(freq > 0)) return 0;
  const w = 2 * Math.PI * freq / sampleRate;
  const coeff = 2 * Math.cos(w);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  const i0 = Math.floor(pcm.length * 0.1);
  const i1 = Math.floor(pcm.length * 0.9);
  for (let i = i0; i < i1; i++) {
    s0 = pcm[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const real = s1 - s2 * Math.cos(w);
  const imag = s2 * Math.sin(w);
  return Math.hypot(real, imag) / Math.max(1, i1 - i0);
}

/**
 * Energy at one frequency inside a time window (Goertzel). The note-window tests use it to prove
 * which pitch is actually sounding at a moment, independent of the motif's label.
 */
export function toneEnergy(pcm, sampleRate, hz, t0 = 0, t1 = null) {
  if (!(hz > 20) || !pcm || !pcm.length) return 0;
  const i0 = Math.max(0, Math.round(t0 * sampleRate));
  const i1 = Math.min(pcm.length, Math.round((t1 == null ? pcm.length / sampleRate : t1) * sampleRate));
  if (i1 - i0 < 32) return 0;
  const w = 2 * Math.PI * hz / sampleRate;
  const coeff = 2 * Math.cos(w);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = i0; i < i1; i++) {
    s0 = pcm[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const real = s1 - s2 * Math.cos(w);
  const imag = s2 * Math.sin(w);
  return Math.hypot(real, imag) / Math.max(1, i1 - i0);
}

export function measureBedFromPcm(pcm, sampleRate = THEME_SAMPLE_RATE) {
  const f0 = detectPitchHz(
    pcm,
    sampleRate,
    Math.floor(pcm.length * 0.15),
    Math.floor(pcm.length * 0.85),
    { minHz: 35, maxHz: 250 },
  );
  const mag1 = goertzelMag(pcm, sampleRate, f0);
  const mag2 = goertzelMag(pcm, sampleRate, f0 * 2);
  const mag3 = goertzelMag(pcm, sampleRate, f0 * 3);
  const even = mag1 > 1e-9 ? mag2 / mag1 : 0;
  const odd = mag1 > 1e-9 ? mag3 / mag1 : 0;
  let waveGuess = 'sine';
  if (even > 1.0) waveGuess = 'sawtooth';
  else if (odd > 0.25 && even < 0.5) waveGuess = 'square';
  else if (odd > 0.05 && even < 0.25) waveGuess = 'triangle';
  let hf = 0;
  let all = 0;
  const i0 = Math.floor(pcm.length * 0.15);
  const i1 = Math.floor(pcm.length * 0.85);
  let prev = 0;
  for (let i = i0; i < i1; i++) {
    const x = pcm[i];
    all += x * x;
    const d = x - prev;
    hf += d * d;
    prev = x;
  }
  const count = Math.max(1, i1 - i0);
  const noise = Math.sqrt(hf / count) / (Math.sqrt(all / count) + 1e-9);
  const brightness = goertzelMag(pcm, sampleRate, Math.max(400, f0 * 8));
  return {
    f0,
    even,
    odd,
    waveGuess,
    noise,
    brightness,
  };
}

/** Name a sector from measured sound. Uses hz/wave/noise, never the label field. */
export function identifySectorBedFromMeasurement(measured) {
  if (!measured || !(measured.f0 > 0)) return null;
  let best = null;
  let bestScore = Infinity;
  for (const [sectorId, bed] of Object.entries(SECTOR_BEDS)) {
    const df = Math.abs(Math.log2(measured.f0 / bed.hzA));
    const dw = measured.waveGuess === bed.waveA ? 0 : 1.8;
    const dn = Math.abs(measured.noise - bed.noise);
    const score = df * 6 + dw + dn * 1.2;
    if (score < bestScore) {
      bestScore = score;
      best = sectorId;
    }
  }
  return best;
}

/** Blind name: energy at each authored bed's hz/wave, never the clip's label. */
export function identifySectorBedFromPcm(pcm, sampleRate = THEME_SAMPLE_RATE) {
  let best = null;
  let bestScore = -Infinity;
  for (const [sectorId, bed] of Object.entries(SECTOR_BEDS)) {
    const magA = goertzelMag(pcm, sampleRate, bed.hzA);
    const magB = goertzelMag(pcm, sampleRate, bed.hzB);
    const hf = goertzelMag(pcm, sampleRate, Math.max(600, bed.hzA * 8));
    const sawBonus = bed.waveA === 'sawtooth' || bed.waveA === 'square' ? hf * 4 : -hf * 2;
    const score = magA * 2 + magB + sawBonus;
    if (score > bestScore) {
      bestScore = score;
      best = sectorId;
    }
  }
  return best;
}

export function describeBedFromPcm(pcm, sampleRate = THEME_SAMPLE_RATE) {
  const m = measureBedFromPcm(pcm, sampleRate);
  let character = 'other';
  if (m.waveGuess === 'sine' && m.noise < 0.12) character = 'warm-sine';
  else if (m.waveGuess === 'sawtooth') character = 'saw-growl';
  else if (m.waveGuess === 'square') character = 'square-buzz';
  else if (m.waveGuess === 'triangle') character = 'triangle';
  return { f0: m.f0, wave: m.waveGuess, noise: m.noise, character, measured: m };
}

export const AUTHORED_STEM_SAMPLES = Object.freeze({
  travel: 'theme_travel',
  combat: 'theme_combat',
  station: 'theme_station',
  wanted: 'theme_wanted',
  boss: 'theme_boss',
});

/**
 * X4 #3 — residency on first use. The five 16 s loops are tier 2 (a reference/listening asset and
 * the runtime's authored body), ~1 MB encoded each and ~10 MB decoded for the set. Acquiring all
 * five when the audio graph is built made the menu pay for music the player may never reach;
 * the runtime calls this when a state is first heard instead.
 */
export function acquireThemeStem(samples, state) {
  const id = AUTHORED_STEM_SAMPLES[state];
  if (!id || !samples || typeof samples.acquire !== 'function') return null;
  return samples.acquire(id);
}

export const THEME_ASSETS = Object.freeze([
  ...THEME_STATES.map((state) => Object.freeze({
    id: AUTHORED_STEM_SAMPLES[state],
    family: 'music',
    tier: 2,
    loop: true,
    kind: 'stem',
    state,
    seconds: THEME_STEM_SECONDS,
  })),
  ...Object.keys(SECTOR_BEDS).map((sectorId) => Object.freeze({
    id: SECTOR_BEDS[sectorId].id,
    family: 'music',
    tier: 2,
    loop: true,
    kind: 'bed',
    sectorId,
    seconds: THEME_BED_SECONDS,
  })),
]);

export function renderThemeAssetPcm(asset) {
  if (asset.kind === 'stem') return renderThemeStemPcm(asset.state);
  return renderSectorBedPcm(resolveSectorBed(asset.sectorId), { seconds: asset.seconds });
}
