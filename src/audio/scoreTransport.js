// @ts-nocheck
// The Outer Measure — SpaceFace's live score.
//
// One clock at 80 BPM, 4/4. Every stem names the same root (A) at every step,
// so a crossfade is an orchestration change and never a key collision.
// The pad is an A-minor triad and it does not restrike. The contract motifs
// still speak, each on its own stem, only when that stem is actually in front.
// After bar 12's cell the line stops. Bar 14 brings G#4 and does not rise to A.
// Bar 15 brings Bb4 and does not fall. Eight sixteenths of nothing follow.
//
// Sector change is air only: lowpass brightness, delay send, an optional
// unpitched tick. Pitches do not move. The Band already owns the sector drone.
//
// Left out on purpose (the mix ceiling): odd meters, formant and comb filters,
// a second sidechain on musicBus, portamento, a second travel melody, risers,
// a walking bass, per-sector delay times, random notes.
//
// Tooling: Tone.js would be a second transport. Elementary already renders the
// engine and the rope. FluidSynth / FluidR3 needs apt and a ~140MB orchestra
// that would fight the limiter under lasers. This file is the instrument.
// The pure functions are the test. Web Audio is the performance.

export const TRANSPORT_BPM = 80;
export const STEPS_PER_BAR = 16;
export const PHRASE_BARS = 16;
export const PHRASE_STEPS = STEPS_PER_BAR * PHRASE_BARS;
export const SIXTEENTH_S = 60 / TRANSPORT_BPM / 4;
export const LOOKAHEAD_S = 0.1;
export const TICK_MS = 50;
export const AUDIBLE_GATE = 0.02;
export const MOTIF_GATE = 0.45;
export const FOREGROUND_GATE = 0.55;
export const VOICE_CAP = 8;

const BASE_HZ = Object.freeze({ A: 900, B: 1100, C: 2200, D: 1400 });

const SEMITONES = Object.freeze({
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
});

/** Contract cells. Notes and octaves match themeMatrix; durations are the authored sixteenths. */
const MOTIF = Object.freeze({
  A: Object.freeze([
    Object.freeze({ beat: 0, note: 'A', oct: 4, dur: 4 }),
    Object.freeze({ beat: 4, note: 'C', oct: 5, dur: 4 }),
    Object.freeze({ beat: 8, note: 'E', oct: 5, dur: 4 }),
    Object.freeze({ beat: 12, note: 'A', oct: 5, dur: 8 }),
  ]),
  B: Object.freeze([
    Object.freeze({ beat: 0, note: 'A', oct: 3, dur: 4 }),
    Object.freeze({ beat: 4, note: 'Bb', oct: 3, dur: 4 }),
    Object.freeze({ beat: 8, note: 'A', oct: 3, dur: 4 }),
    Object.freeze({ beat: 12, note: 'E', oct: 3, dur: 8 }),
  ]),
  C: Object.freeze([
    Object.freeze({ beat: 0, note: 'A', oct: 3, dur: 4 }),
    Object.freeze({ beat: 4, note: 'E', oct: 4, dur: 4 }),
    Object.freeze({ beat: 8, note: 'A', oct: 3, dur: 4 }),
    Object.freeze({ beat: 12, note: 'C', oct: 4, dur: 8 }),
  ]),
  D: Object.freeze([
    Object.freeze({ beat: 0, note: 'C', oct: 4, dur: 4 }),
    Object.freeze({ beat: 4, note: 'E', oct: 4, dur: 4 }),
    Object.freeze({ beat: 8, note: 'G', oct: 4, dur: 4 }),
    Object.freeze({ beat: 12, note: 'B', oct: 4, dur: 8 }),
  ]),
});

export const SECTOR_AIR = Object.freeze({
  sector_helios_prime: Object.freeze({ cutoffMul: 1.35, delaySend: 0.16, tick: true, motifGain: 1, label: 'Helios — open, close' }),
  sector_ceres_belt: Object.freeze({ cutoffMul: 0.62, delaySend: 0.08, tick: false, motifGain: 0.72, label: 'Ceres — dry, near' }),
  sector_tethys_junction: Object.freeze({ cutoffMul: 1.08, delaySend: 0.18, tick: false, motifGain: 0.92, label: 'Tethys — a little open' }),
  sector_vesta_forge: Object.freeze({ cutoffMul: 0.55, delaySend: 0.14, tick: false, motifGain: 0.8, label: 'Vesta — low, warm' }),
  sector_pallas_drift: Object.freeze({ cutoffMul: 0.84, delaySend: 0.22, tick: false, motifGain: 0.86, label: 'Pallas — mid drift' }),
  sector_io_reach: Object.freeze({ cutoffMul: 0.58, delaySend: 0.15, tick: false, motifGain: 0.78, label: 'Io — closed heat' }),
  sector_charon_expanse: Object.freeze({ cutoffMul: 0.48, delaySend: 0.3, tick: false, motifGain: 0.7, label: 'Charon — far, dark' }),
  sector_sker_haven: Object.freeze({ cutoffMul: 0.4, delaySend: 0.46, tick: false, motifGain: 0.56, label: 'Sker — long dark tail' }),
  sector_veil_nebula: Object.freeze({ cutoffMul: 0.7, delaySend: 0.36, tick: false, motifGain: 0.74, label: 'Veil — soft distance' }),
  sector_ashfall_reach: Object.freeze({ cutoffMul: 0.42, delaySend: 0.18, tick: false, motifGain: 0.66, label: 'Ashfall — dull, close' }),
});

export const DEFAULT_AIR = Object.freeze({
  cutoffMul: 0.9, delaySend: 0.2, tick: false, motifGain: 0.85, label: 'Open void',
});

export function noteToHz(note, octave = 4) {
  const s = SEMITONES[note];
  if (s == null) return 440;
  return 440 * Math.pow(2, (s - 9) / 12 + (octave - 4));
}

export function barBeat(step) {
  const s = ((step % PHRASE_STEPS) + PHRASE_STEPS) % PHRASE_STEPS;
  return { step: s, bar: Math.floor(s / STEPS_PER_BAR), beat: s % STEPS_PER_BAR };
}

/** Swing never touches the motif quarters (beats 0, 4, 8, 12). */
export function swingOffsetS(step) {
  const beat = barBeat(step).beat;
  if (beat % 4 === 0) return 0;
  if (beat % 2 === 0) return 0.018;
  return 0.008;
}

export function chordAt(step) {
  const pos = barBeat(step);
  return {
    root: 'A',
    tones: [
      { note: 'A', oct: 3 },
      { note: 'C', oct: 4 },
      { note: 'E', oct: 4 },
    ],
    bar: pos.bar,
    beat: pos.beat,
  };
}

export function registerFor(sectorId) {
  if (sectorId && SECTOR_AIR[sectorId]) return SECTOR_AIR[sectorId];
  if (!sectorId) return DEFAULT_AIR;
  let h = 2166136261;
  const id = String(sectorId);
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return {
    cutoffMul: Math.round((0.55 + (h % 48) / 100) * 100) / 100,
    delaySend: Math.round((0.12 + ((h >>> 8) % 28) / 100) * 100) / 100,
    tick: false,
    motifGain: 0.8,
    label: 'Uncharted air',
  };
}

function scarEvents(bar, beat) {
  if (bar === 14 && beat === 7) {
    return [{ kind: 'scar', note: 'G#', oct: 4, dur: 6, vel: 0.12, wave: 'sine' }];
  }
  if (bar === 15 && beat === 4) {
    return [{ kind: 'scar', note: 'Bb', oct: 4, dur: 4, vel: 0.11, wave: 'sine' }];
  }
  return [];
}

/**
 * Pure score. `root` is A for every stem at every step.
 * Motif rows are always reported (the scheduler decides whether to voice them).
 * Scar is the bed's refusal and is reported only on stem A.
 */
export function eventsAt(step, stem, sectorId) {
  const chord = chordAt(step);
  const { bar, beat } = chord;
  const air = registerFor(sectorId);
  const events = [];
  if (stem === 'A' && bar === 0 && beat === 0) {
    events.push({ kind: 'pad', tones: chord.tones, dur: PHRASE_STEPS, vel: 0.045 });
  }
  if (bar % 4 === 0) {
    const row = (MOTIF[stem] || []).find((n) => n.beat === beat);
    if (row) {
      events.push({
        kind: 'motif',
        note: row.note,
        oct: row.oct,
        dur: row.dur,
        vel: stem === 'C' ? 0.11 : 0.085,
        wave: 'sine',
      });
    }
  }
  if (stem === 'A') {
    for (const ev of scarEvents(bar, beat)) events.push(ev);
    if (air.tick && beat === 0 && bar % 2 === 0) events.push({ kind: 'tick', dur: 1, vel: 0.03 });
  }
  if (stem === 'B') {
    if (beat === 0 || beat === 8) events.push({ kind: 'pulse', dur: 1, vel: 0.07, duck: true });
    if (beat === 10) events.push({ kind: 'hat', dur: 1, vel: 0.035 });
  }
  if (stem === 'C') {
    if (beat % 2 === 0) events.push({ kind: 'kick', dur: 1, vel: beat % 4 === 0 ? 0.12 : 0.07 });
    if (beat % 2 === 1) events.push({ kind: 'hat', dur: 1, vel: 0.04 });
    if (beat === 4 || beat === 12) events.push({ kind: 'snare', dur: 1, vel: 0.08 });
  }
  if (stem === 'D' && bar === 2 && beat === 6) {
    events.push({ kind: 'bell', note: 'D', oct: 4, dur: 8, vel: 0.07, wave: 'sine' });
  }
  return { root: chord.root, bar, beat, register: air, events };
}

export function phraseMark(step) {
  const { bar, beat } = barBeat(step);
  if (bar % 4 === 0 && beat <= 12) return 'Outbound';
  if (bar === 14 && beat >= 7) return 'The leading tone refuses';
  if (bar === 15 && beat >= 4 && beat < 8) return 'Flat nine, unresolved';
  if (bar === 15 && beat >= 8) return 'The hole';
  if (bar === 2 && beat >= 6 && beat < 14) return 'A fifth answers, once';
  return 'Pedal';
}

/**
 * Advance the shared cursor. A hole larger than one lookahead emits nothing
 * and jumps — background tabs must not dump a burst of late notes.
 */
export function advanceCursor(cursor, now, sixteenthS = SIXTEENTH_S, lookaheadS = LOOKAHEAD_S) {
  let step = cursor && cursor.step ? cursor.step | 0 : 0;
  let next = cursor && Number.isFinite(cursor.nextNoteTime) ? cursor.nextNoteTime : now + lookaheadS;
  if (next < now - lookaheadS) {
    const skip = Math.max(1, Math.round((now - next) / sixteenthS));
    step = (step + skip) % PHRASE_STEPS;
    return { cursor: { step, nextNoteTime: now + lookaheadS }, due: [] };
  }
  const due = [];
  while (next < now + lookaheadS && due.length < 6) {
    due.push({ step, when: next + swingOffsetS(step) });
    step = (step + 1) % PHRASE_STEPS;
    next += sixteenthS;
  }
  return { cursor: { step, nextNoteTime: next }, due };
}

const clocks = new WeakMap();

function rampTo(param, value, when, tau) {
  if (!param) return;
  const v = Math.max(0.0001, value);
  if (typeof param.setTargetAtTime === 'function') {
    try { param.setTargetAtTime(v, when, tau); return; } catch (_) {}
  }
  if (typeof param.setValueAtTime === 'function') {
    try { param.setValueAtTime(v, when); return; } catch (_) {}
  }
  try { param.value = v; } catch (_) {}
}

function envGain(ctx, when, vel, attack, hold, release) {
  const g = ctx.createGain();
  const p = g.gain;
  const peak = Math.max(0.0001, vel);
  if (typeof p.setValueAtTime !== 'function') {
    p.value = peak;
    return g;
  }
  const a = Math.max(0.005, attack);
  const h = Math.max(0, hold);
  const r = Math.max(0.02, release);
  p.setValueAtTime(0.0001, when);
  p.exponentialRampToValueAtTime(peak, when + a);
  p.setValueAtTime(peak, when + a + h);
  p.exponentialRampToValueAtTime(0.0001, when + a + h + r);
  return g;
}

function stopNode(node) {
  if (!node) return;
  try { node.stop(); } catch (_) {}
  try { node.disconnect(); } catch (_) {}
}

function noiseBuffer(ctx, cache) {
  if (cache.noise) return cache.noise;
  const n = Math.max(1, Math.floor((ctx.sampleRate || 44100) * 0.25));
  if (typeof ctx.createBuffer !== 'function') return null;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate || 44100);
  const d = buf.getChannelData(0);
  let x = 0x6d2b79f5;
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    d[i] = (x / 4294967296) * 2 - 1;
  }
  cache.noise = buf;
  return buf;
}

function killVoice(voice) {
  if (!voice || voice.dead) return;
  voice.dead = true;
  for (const n of voice.nodes) stopNode(n);
}

function trackVoice(stem, voice) {
  stem.voices = stem.voices || [];
  stem.voices.push(voice);
  const mortal = stem.voices.filter((v) => v && !v.protect && !v.dead);
  while (mortal.length > VOICE_CAP) {
    killVoice(mortal.shift());
  }
}

function tone(ctx, stem, dest, delaySend, when, freq, durS, vel, wave) {
  if (!(freq > 0) || !(vel > 0)) return;
  const o = ctx.createOscillator();
  o.type = wave || 'sine';
  try { o.frequency.setValueAtTime(freq, when); } catch (_) { o.frequency.value = freq; }
  const attack = Math.min(0.035, Math.max(0.008, durS * 0.2));
  const release = Math.min(0.5, Math.max(0.05, durS * 0.45));
  const hold = Math.max(0.01, durS * 0.72);
  const g = envGain(ctx, when, vel, attack, hold, release);
  const nodes = [o, g];
  o.connect(g);
  g.connect(dest);
  if (delaySend) {
    const send = ctx.createGain();
    try { send.gain.value = 1; } catch (_) {}
    g.connect(send);
    send.connect(delaySend);
    nodes.push(send);
  }
  const voice = { nodes, protect: false, dead: false };
  trackVoice(stem, voice);
  const end = when + hold + release + 0.05;
  try { o.start(when); o.stop(end); } catch (_) {}
  o.onended = () => killVoice(voice);
}

function burst(ctx, stem, dest, when, vel, kind) {
  const cache = stem.clockCache;
  const buf = noiseBuffer(ctx, cache);
  let src = null;
  const nodes = [];
  if (buf && typeof ctx.createBufferSource === 'function') {
    src = ctx.createBufferSource();
    src.buffer = buf;
    nodes.push(src);
  }
  const filter = ctx.createBiquadFilter();
  nodes.push(filter);
  if (kind === 'hat' || kind === 'tick') {
    filter.type = 'highpass';
    filter.frequency.value = kind === 'tick' ? 5000 : 7000;
  } else {
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
  }
  const dur = kind === 'tick' ? 0.03 : kind === 'hat' ? 0.045 : 0.12;
  const g = envGain(ctx, when, vel, 0.003, 0.01, dur);
  nodes.push(g);
  if (src) src.connect(filter);
  else {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = kind === 'snare' ? 180 : 3200;
    nodes.push(o);
    o.connect(filter);
    try { o.start(when); o.stop(when + dur + 0.05); } catch (_) {}
  }
  filter.connect(g);
  g.connect(dest);
  if (kind === 'snare') {
    const body = ctx.createOscillator();
    body.type = 'sine';
    try {
      body.frequency.setValueAtTime(190, when);
      body.frequency.exponentialRampToValueAtTime(120, when + 0.08);
    } catch (_) { body.frequency.value = 180; }
    const bg = envGain(ctx, when, vel * 0.6, 0.003, 0.02, 0.08);
    body.connect(bg);
    bg.connect(dest);
    nodes.push(body, bg);
    try { body.start(when); body.stop(when + 0.12); } catch (_) {}
  }
  const voice = { nodes, protect: false, dead: false };
  trackVoice(stem, voice);
  if (src) {
    try { src.start(when); src.stop(when + dur + 0.02); } catch (_) {}
    src.onended = () => killVoice(voice);
  }
}

function kick(ctx, stem, dest, when, vel, deep) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  const f0 = deep ? 92 : 150;
  const f1 = deep ? 36 : 46;
  try {
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f1, when + 0.09);
  } catch (_) { o.frequency.value = f1; }
  const g = envGain(ctx, when, vel, 0.004, 0.02, deep ? 0.16 : 0.1);
  o.connect(g);
  g.connect(dest);
  const voice = { nodes: [o, g], protect: false, dead: false };
  trackVoice(stem, voice);
  try { o.start(when); o.stop(when + 0.28); } catch (_) {}
  o.onended = () => killVoice(voice);
}

function ensurePad(ctx, stem, dest, when, tones, vel) {
  if (stem.pad && !stem.pad.dead) return;
  const nodes = [];
  const gains = [];
  tones.forEach((toneRow, i) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    const hz = noteToHz(toneRow.note, toneRow.oct);
    const cents = i === 1 ? 3 : i === 2 ? -3 : 0;
    const freq = hz * Math.pow(2, cents / 1200);
    o.frequency.value = freq;
    const g = ctx.createGain();
    const partial = i === 0 ? vel : vel * 0.72;
    if (typeof g.gain.setValueAtTime === 'function') {
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, partial), when + 2.2);
    } else g.gain.value = partial;
    o.connect(g);
    g.connect(dest);
    nodes.push(o, g);
    gains.push(g);
    try { o.start(when); } catch (_) {}
  });
  stem.padVel = vel;
  stem.padGains = gains;
  stem.pad = { nodes, protect: true, dead: false, gains };
  stem.voices = stem.voices || [];
  stem.voices.push(stem.pad);
}

function duckPad(clock, when) {
  const bed = clock.stems.get('A');
  if (!bed || !bed.padGains) return;
  const base = bed.padVel || 0.045;
  for (const g of bed.padGains) {
    rampTo(g.gain, base * 0.62, when, 0.02);
    rampTo(g.gain, base, when + 0.14, 0.09);
  }
}

function bell(ctx, stem, dest, delaySend, when, vel) {
  const freq = noteToHz('D', 4);
  const carrier = ctx.createOscillator();
  const mod = ctx.createOscillator();
  carrier.type = 'sine';
  mod.type = 'sine';
  carrier.frequency.value = freq;
  mod.frequency.value = freq * 2;
  const modGain = ctx.createGain();
  if (typeof modGain.gain.setValueAtTime === 'function') {
    modGain.gain.setValueAtTime(freq * 1.4, when);
    modGain.gain.exponentialRampToValueAtTime(0.0001, when + 1.1);
  } else modGain.gain.value = 40;
  mod.connect(modGain);
  if (carrier.frequency && typeof modGain.connect === 'function') modGain.connect(carrier.frequency);
  const g = envGain(ctx, when, vel, 0.004, 0.08, 1.3);
  carrier.connect(g);
  g.connect(dest);
  const nodes = [carrier, mod, modGain, g];
  if (delaySend) {
    const send = ctx.createGain();
    send.gain.value = 1;
    g.connect(send);
    send.connect(delaySend);
    nodes.push(send);
  }
  const voice = { nodes, protect: false, dead: false };
  trackVoice(stem, voice);
  try { mod.start(when); mod.stop(when + 1.4); } catch (_) {}
  try { carrier.start(when); carrier.stop(when + 1.6); } catch (_) {}
  carrier.onended = () => killVoice(voice);
}

function gainOf(stem) {
  const g = stem && stem.gainNode && stem.gainNode.gain && stem.gainNode.gain.value;
  return Number.isFinite(g) ? g : 0;
}

function leadKey(clock) {
  let best = '';
  let bestG = -1;
  for (const stem of clock.stems.values()) {
    const g = gainOf(stem);
    if (g > bestG) {
      bestG = g;
      best = stem.key;
    }
  }
  return best;
}

function renderStem(clock, stem, step, when, sectorId) {
  const g = gainOf(stem);
  if (g < AUDIBLE_GATE) return;
  const row = eventsAt(step, stem.key, sectorId);
  const air = row.register;
  const motifScale = air.motifGain || 1;
  const fg = g >= FOREGROUND_GATE;
  const lead = leadKey(clock) === stem.key;
  for (const ev of row.events) {
    if (ev.kind === 'pad') {
      ensurePad(clock.ctx, stem, stem.dest, when, ev.tones, ev.vel);
    } else if (ev.kind === 'motif' && lead) {
      const durSteps = stem.key === 'C' ? Math.min(ev.dur, 2) : ev.dur;
      const vel = ev.vel * motifScale * Math.min(1, 0.55 + g * 0.45);
      tone(clock.ctx, stem, stem.dest, stem.delaySend, when, noteToHz(ev.note, ev.oct), durSteps * SIXTEENTH_S, vel, 'sine');
    } else if (ev.kind === 'scar') {
      const combat = leadKey(clock) === 'C';
      const durSteps = combat ? 3 : ev.dur;
      const vel = ev.vel * (combat ? 1.5 : 1);
      tone(clock.ctx, stem, stem.dest, stem.delaySend, when, noteToHz(ev.note, ev.oct), durSteps * SIXTEENTH_S, vel, 'sine');
    } else if (ev.kind === 'tick' && lead) {
      burst(clock.ctx, stem, stem.dest, when, ev.vel, 'tick');
    } else if ((ev.kind === 'pulse' || ev.kind === 'hat') && stem.key === 'B' && fg) {
      if (ev.kind === 'pulse') {
        kick(clock.ctx, stem, stem.dest, when, ev.vel, true);
        if (ev.duck) duckPad(clock, when);
      } else burst(clock.ctx, stem, stem.dest, when, ev.vel, 'hat');
    } else if (stem.key === 'C' && fg && (ev.kind === 'kick' || ev.kind === 'hat' || ev.kind === 'snare')) {
      if (ev.kind === 'kick') kick(clock.ctx, stem, stem.dest, when, ev.vel, false);
      else burst(clock.ctx, stem, stem.dest, when, ev.vel, ev.kind);
    } else if (ev.kind === 'bell' && fg) {
      bell(clock.ctx, stem, stem.dest, stem.delaySend, when, ev.vel);
    }
  }
}

function applyAir(clock, sectorId, when) {
  if (clock.airId === sectorId) return;
  clock.airId = sectorId;
  const air = registerFor(sectorId);
  for (const stem of clock.stems.values()) {
    const base = (stem.baseHz || BASE_HZ[stem.key] || 900) * air.cutoffMul;
    if (stem.dest && stem.dest.frequency) rampTo(stem.dest.frequency, base, when, 0.7);
    if (stem.delaySend && stem.delaySend.gain) rampTo(stem.delaySend.gain, air.delaySend, when, 0.7);
  }
  clock.sectorLabel = air.label;
}

function makeClock(ctx) {
  const clock = {
    ctx,
    stems: new Map(),
    running: false,
    destroyed: false,
    started: false,
    timerId: 0,
    cursor: { step: 0, nextNoteTime: 0 },
    sectorId: '',
    airId: null,
    host: null,
    cache: {},
    arm() {
      if (this.timerId || this.destroyed || !this.running) return;
      this.timerId = setTimeout(() => this.tick(), TICK_MS);
    },
    tick() {
      this.timerId = 0;
      if (!this.running || this.destroyed) return;
      const now = this.ctx.currentTime || 0;
      const adv = advanceCursor(this.cursor, now);
      this.cursor = adv.cursor;
      const paused = !!(this.host && this.host.rt && this.host.rt._paused);
      const sectorId = (this.host && this.host.rt && this.host.rt._themeSectorId) || this.sectorId || '';
      if (!paused && adv.due.length) {
        applyAir(this, sectorId, adv.due[0].when);
        for (const due of adv.due) {
          this.step = due.step;
          let mark = phraseMark(due.step);
          const docked = gainOf(this.stems.get('D') || {}) >= FOREGROUND_GATE;
          if (!docked && mark.indexOf('fifth') !== -1) mark = 'Pedal';
          this.mark = mark;
          for (const stem of this.stems.values()) {
            stem.clockCache = this.cache;
            renderStem(this, stem, due.step, due.when, sectorId);
          }
        }
      } else if (!paused) {
        this.step = this.cursor.step;
        this.mark = phraseMark(this.cursor.step);
      }
      this.arm();
    },
    pause() {
      if (!this.running) return;
      this.running = false;
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = 0;
      }
    },
    resume() {
      if (this.destroyed || this.running) return;
      this.running = true;
      const now = this.ctx.currentTime || 0;
      if (!(this.cursor.nextNoteTime > now)) this.cursor.nextNoteTime = now + LOOKAHEAD_S;
      this.arm();
    },
    releaseStem(key) {
      const stem = this.stems.get(key);
      if (stem) {
        for (const v of stem.voices || []) killVoice(v);
        stem.pad = null;
        stem.padGains = null;
        this.stems.delete(key);
      }
      if (this.stems.size === 0) {
        this.running = false;
        this.destroyed = true;
        if (this.timerId) {
          clearTimeout(this.timerId);
          this.timerId = 0;
        }
      }
    },
  };
  return clock;
}

export function clockFor(ctx) {
  let clock = clocks.get(ctx);
  if (!clock) {
    clock = makeClock(ctx);
    clocks.set(ctx, clock);
  }
  return clock;
}

/**
 * Register one stem on the shared clock. The first stem arms the only timer.
 * Later stems join the same step index. pause/resume/stop are idempotent.
 */
export function registerScoreStem(ctx, record) {
  const clock = clockFor(ctx);
  if (clock.destroyed) return clock;
  record.voices = [];
  record.clockCache = clock.cache;
  clock.stems.set(record.key, record);
  if (record.host) clock.host = record.host;
  if (!clock.started) {
    clock.started = true;
    clock.running = true;
    clock.cursor = { step: 0, nextNoteTime: (ctx.currentTime || 0) + 0.2 };
    clock.arm();
  }
  return clock;
}

const STEM_KEYS = ['A', 'B', 'C', 'D'];

/** Browser listening room. Same clock, same events, its own small graph. */
export function mountOuterMeasure(ctx, destination) {
  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(destination);
  const gains = {};
  for (const key of STEM_KEYS) {
    const g = ctx.createGain();
    g.gain.value = key === 'A' ? 1 : 0.0001;
    g.connect(master);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = BASE_HZ[key] * DEFAULT_AIR.cutoffMul;
    lp.Q.value = 0.55;
    lp.connect(g);
    let delaySend = null;
    if (key !== 'C') {
      const delay = ctx.createDelay(1.2);
      delay.delayTime.value = SIXTEENTH_S * 2;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2400;
      const fb = ctx.createGain();
      fb.gain.value = 0.28;
      delay.connect(damp);
      damp.connect(fb);
      fb.connect(delay);
      delay.connect(lp);
      delaySend = ctx.createGain();
      delaySend.gain.value = DEFAULT_AIR.delaySend;
      delaySend.connect(delay);
    }
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 0.06;
    lfoG.gain.value = key === 'C' ? 70 : 120;
    lfo.connect(lfoG);
    lfoG.connect(lp.frequency);
    try { lfo.start(); } catch (_) {}
    registerScoreStem(ctx, {
      key,
      dest: lp,
      delaySend,
      gainNode: g,
      baseHz: BASE_HZ[key],
      lfo,
    });
    gains[key] = g;
  }
  const clock = clockFor(ctx);
  return {
    clock,
    master,
    setMix(weights, seconds = 1.4) {
      const now = ctx.currentTime || 0;
      const tau = Math.max(0.05, seconds / 3);
      for (const key of STEM_KEYS) {
        const target = Math.max(0.0001, Number(weights[key]) || 0);
        rampTo(gains[key].gain, target, now, tau);
      }
    },
    setSector(id) {
      clock.sectorId = id || '';
      clock.airId = null;
    },
  };
}

export const MIX = Object.freeze({
  haul: Object.freeze({ A: 1, B: 0.0001, C: 0.0001, D: 0.0001 }),
  wanted: Object.freeze({ A: 0.22, B: 1, C: 0.0001, D: 0.0001 }),
  combat: Object.freeze({ A: 0.28, B: 0.0001, C: 1, D: 0.0001 }),
  dock: Object.freeze({ A: 0.2, B: 0.0001, C: 0.0001, D: 1 }),
});
