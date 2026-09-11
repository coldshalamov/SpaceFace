#!/usr/bin/env node
// assets/audio/generate-samples.mjs — the PQ-158.00 sample-library authoring pipeline.
//
// Renders the designed SFX sample library (assets/audio/<family>/<id>.wav) from pure, seeded DSP.
// No recorded actors, no downloaded audio, no network: every sample is designed offline and the
// output is byte-identical on every run and machine (mulberry32 + hash32 integer seeding only).
// Any agent can re-run this file to reproduce or extend the library:
//
//   node assets/audio/generate-samples.mjs            # write all WAVs + print the manifest
//   node assets/audio/generate-samples.mjs --check    # verify tree matches generator (no writes)
//
// The runtime side (residency-gated decode + hybrid sample/synth playback) lives in
// src/audio/sampleLibrary.js; the recipe->sample binding table lives in src/data/audioRecipes.js
// (export SAMPLE_BINDINGS). Keep all three in sync: this file's SAMPLES[] is the single design
// source, and the manifest it prints is what sampleLibrary.js freezes.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const SR = 32000; // mono 16-bit; bright cues need ~14 kHz, impacts need weight, one rate for all

// ---------------------------------------------------------------------------
// deterministic primitives
// ---------------------------------------------------------------------------

function hash32(a, b = 0x9e3779b9, c = 0x85ebca6b) {
  let h = (a ^ b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), c) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
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

function seedFor(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return hash32(h, 15800);
}

// ---------------------------------------------------------------------------
// DSP kit (streaming, sample-rate aware)
// ---------------------------------------------------------------------------

class Biquad {
  constructor(type, f0, q, sr) {
    const w0 = (2 * Math.PI * Math.min(f0, sr * 0.49)) / sr;
    const cos = Math.cos(w0), sin = Math.sin(w0), alpha = sin / (2 * Math.max(0.1, q));
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
    } else if (type === 'hp') {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0;
      a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
    } else { // bandpass (constant 0 dB peak)
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

function renderSample(spec) {
  const rng = mulberry32(seedFor(spec.id));
  const dur = spec.dur;
  const n = Math.max(1, Math.round(dur * SR));
  const out = new Float64Array(n);

  // --- layer 1: modal bank (struck/bowed resonances) ---
  if (spec.modals) {
    for (const m of spec.modals) {
      const count = m.count || 4;
      const base = m.base;
      const decay = m.decay; // seconds to -60 dB
      const amp = (m.amp == null ? 0.5 : m.amp) / count;
      const attack = m.attack || 0.002;
      const a0 = Math.round((m.at || 0) * SR);
      for (let p = 0; p < count; p++) {
        const ratio = m.stretch
          ? 1 + p * (m.stretch - 1)
          : (m.ratios ? m.ratios[p % m.ratios.length] : p + 1);
        const f = Math.min(base * ratio, SR * 0.47);
        const detune = 1 + (rng() - 0.5) * (m.detune || 0.004);
        const phase = rng() * 2 * Math.PI;
        const k = -6.907755 / (decay * SR); // exp(-6.9) ≈ -60 dB
        const pa = amp * (m.shape === 'down' ? Math.pow(0.62, p) : Math.pow(0.82, p));
        const len = Math.min(n - a0, Math.round(decay * 4 * SR));
        let s = Math.sin(phase);
        let c = Math.cos(phase);
        const w = 2 * Math.PI * f * detune / SR;
        const sw = Math.sin(w), cw = Math.cos(w);
        for (let i = 0; i < len; i++) {
          const t = i / SR;
          const env = Math.min(1, t / attack) * Math.exp(k * i);
          out[a0 + i] += pa * env * s;
          const ns = s * cw + c * sw;
          c = c * cw - s * sw;
          s = ns;
        }
      }
    }
  }

  // --- layer 2: shaped noise (air, grit, cracks) ---
  if (spec.noise) {
    for (const nz of spec.noise) {
      const f0 = nz.f0, f1 = nz.f1 == null ? nz.f0 : nz.f1;
      const type = nz.type || 'bp';
      const q = nz.q == null ? 1 : nz.q;
      const attack = nz.attack || 0.002;
      const decay = nz.decay || dur * 0.5;
      const amp = nz.amp == null ? 0.4 : nz.amp;
      const a0 = Math.round((nz.at || 0) * SR);
      const len = Math.min(n - a0, Math.round((decay * 4 + attack) * SR));
      const bq = new Biquad(type, f0, q, SR);
      const k = -6.907755 / (decay * SR);
      // per-sample logarithmic frequency sweep
      const sweep = f1 !== f0;
      const logF0 = Math.log(f0), logF1 = Math.log(f1);
      const sweepDur = nz.sweepDur || decay;
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        if (sweep) {
          const u = Math.min(1, t / sweepDur);
          bq.b0 = bq.b1 = bq.b2 = 0; // rebuilt below via recompute
          const f = Math.exp(logF0 + (logF1 - logF0) * u);
          const fresh = new Biquad(type, f, q, SR);
          bq.b0 = fresh.b0; bq.b1 = fresh.b1; bq.b2 = fresh.b2; bq.a1 = fresh.a1; bq.a2 = fresh.a2;
        }
        const white = rng() * 2 - 1;
        // pink-ish: mix two lows with white
        lp += 0.04 * (white - lp);
        const shaped = nz.color === 'pink' ? (0.6 * lp + 0.4 * white) : white;
        const env = Math.min(1, t / attack) * Math.exp(k * i);
        out[a0 + i] += amp * env * bq.process(shaped);
      }
    }
  }

  // --- layer 3: tonal body (swept sine / square-ish growl) ---
  if (spec.tone) {
    for (const tn of spec.tone) {
      const f0 = tn.f0, f1 = tn.f1 == null ? tn.f0 : tn.f1;
      const attack = tn.attack || 0.004;
      const decay = tn.decay || dur * 0.6;
      const amp = tn.amp == null ? 0.4 : tn.amp;
      const a0 = Math.round((tn.at || 0) * SR);
      const len = Math.min(n - a0, Math.round((decay * 4 + attack) * SR));
      const k = -6.907755 / (decay * SR);
      const logF0 = Math.log(Math.max(1, f0)), logF1 = Math.log(Math.max(1, f1));
      const sweepDur = tn.sweepDur || decay;
      let phase = rng() * 2 * Math.PI;
      let prev = 0;
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        const u = f1 !== f0 ? Math.min(1, t / sweepDur) : 0;
        const f = Math.exp(logF0 + (logF1 - logF0) * u);
        phase += (2 * Math.PI * f) / SR;
        let s = Math.sin(phase);
        if (tn.square) s = Math.tanh(s * 6) * 0.8; // hollow square-ish growl without full aliasing
        if (tn.trem) s *= 1 + tn.trem * Math.sin(2 * Math.PI * tn.tremHz * t);
        // suppress zipper artifacts on long sweeps with a one-pole smoother
        s = prev + 0.35 * (s - prev); prev = s;
        const env = Math.min(1, t / attack) * Math.exp(k * i);
        out[a0 + i] += amp * env * s;
      }
    }
  }

  // --- layer 4: comb/echo tail (space without a convolver) ---
  if (spec.echo) {
    const d = Math.max(1, Math.round(spec.echo.delay * SR));
    const g = spec.echo.gain;
    const wet = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      wet[i] = out[i] + (i >= d ? wet[i - d] : 0) * g;
    }
    for (let i = 0; i < n; i++) out[i] = (1 - spec.echo.mix) * out[i] + spec.echo.mix * wet[i];
  }

  // --- post: saturation, global fades, normalize ---
  if (spec.drive) {
    const norm = Math.tanh(spec.drive);
    for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * spec.drive) / norm;
  }
  const fade = Math.round(0.004 * SR);
  for (let i = 0; i < fade && i < n; i++) {
    out[i] *= i / fade;
    out[n - 1 - i] *= i / fade;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const norm = peak > 1e-9 ? (spec.peak == null ? 0.98 : spec.peak) / peak : 0;
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, out[i] * norm));
    pcm[i] = Math.round(v * 32767);
  }
  return pcm;
}

function wavBytes(pcm) {
  const data = pcm.byteLength;
  const buf = Buffer.alloc(44 + data);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + data, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(data, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, data).copy(buf, 44);
  return buf;
}

// ---------------------------------------------------------------------------
// THE LIBRARY — one designed voice per cue family.
// tier: 0 = core (resident from first unlock), 1 = action (decode on first use),
//       2 = context (decode on first use, first out under residency pressure)
// loop: seamless sustained bed (rendered with matched ends; runtime loops it)
// ---------------------------------------------------------------------------

const SAMPLES = [
  // ---- weapons ----
  { id: 'wpn_pulse', family: 'wpn', tier: 0, dur: 0.34, drive: 2.2,
    modals: [{ base: 560, count: 5, stretch: 1.9, decay: 0.16, amp: 0.5, shape: 'down' }],
    tone: [{ f0: 620, f1: 96, decay: 0.2, amp: 0.55, sweepDur: 0.13 }],
    noise: [{ f0: 2600, f1: 700, decay: 0.1, amp: 0.3, q: 0.9 }] },
  { id: 'wpn_cannon', family: 'wpn', tier: 0, dur: 0.5, drive: 3.2,
    modals: [{ base: 210, count: 6, stretch: 2.1, decay: 0.22, amp: 0.55, shape: 'down' }],
    tone: [{ f0: 150, f1: 44, decay: 0.3, amp: 0.8, sweepDur: 0.14 }],
    noise: [{ f0: 1500, f1: 300, decay: 0.14, amp: 0.65, q: 1.1 }] },
  { id: 'wpn_rail', family: 'wpn', tier: 1, dur: 0.9, drive: 3.6,
    modals: [{ base: 120, count: 7, stretch: 2.4, decay: 0.5, amp: 0.5 }],
    tone: [{ f0: 260, f1: 30, decay: 0.6, amp: 0.9, sweepDur: 0.4 }, { f0: 90, f1: 36, decay: 0.7, amp: 0.5, at: 0.05 }],
    noise: [{ f0: 3800, f1: 400, decay: 0.3, amp: 0.5, q: 0.8, attack: 0.001 }],
    echo: { delay: 0.05, gain: 0.35, mix: 0.4 } },
  { id: 'wpn_missile_loop', family: 'wpn', tier: 1, dur: 2.4, loop: true,
    noise: [{ f0: 900, f1: 500, decay: 2.4, amp: 0.5, q: 0.7, attack: 0.2, sweepDur: 2.4, color: 'pink' }],
    tone: [{ f0: 140, f1: 190, decay: 2.4, amp: 0.16, attack: 0.5, sweepDur: 2.4 }] },
  { id: 'wpn_beam_loop', family: 'wpn', tier: 1, dur: 2.0, loop: true,
    tone: [{ f0: 438, decay: 2.0, amp: 0.3, attack: 0.4 }, { f0: 879, decay: 2.0, amp: 0.14, attack: 0.6, trem: 0.25, tremHz: 13 }],
    noise: [{ f0: 1760, decay: 2.0, amp: 0.1, q: 6, attack: 0.5 }] },
  { id: 'near_miss', family: 'wpn', tier: 1, dur: 0.4,
    noise: [{ f0: 700, f1: 3400, decay: 0.22, amp: 0.65, q: 0.8, sweepDur: 0.16, attack: 0.03 }] },

  // ---- doctrine telegraphs ----
  { id: 'doctrine_flyby', family: 'doctrine', tier: 1, dur: 0.5, drive: 1.8,
    tone: [{ f0: 480, f1: 1650, decay: 0.3, amp: 0.5, sweepDur: 0.16, attack: 0.006 }],
    noise: [{ f0: 900, f1: 2600, decay: 0.26, amp: 0.35, q: 0.7, sweepDur: 0.2 }] },
  { id: 'doctrine_spool', family: 'doctrine', tier: 1, dur: 0.55,
    modals: [{ base: 340, count: 6, stretch: 1.5, decay: 0.1, amp: 0.6 }],
    noise: [{ f0: 310, decay: 0.3, amp: 0.5, q: 3.2, attack: 0.008 }] },
  { id: 'doctrine_charge', family: 'doctrine', tier: 1, dur: 0.65,
    tone: [{ f0: 240, f1: 1250, decay: 0.4, amp: 0.5, sweepDur: 0.26, attack: 0.012 }],
    modals: [{ base: 760, count: 4, stretch: 1.6, decay: 0.3, amp: 0.3, at: 0.06 }] },
  { id: 'doctrine_broadside', family: 'doctrine', tier: 1, dur: 1.5, drive: 3.4,
    tone: [{ f0: 72, f1: 150, decay: 0.9, amp: 0.85, sweepDur: 0.4 }, { f0: 80, f1: 158, decay: 0.9, amp: 0.8, sweepDur: 0.4, at: 0.24 }],
    modals: [{ base: 130, count: 6, stretch: 2.0, decay: 0.8, amp: 0.5, at: 0.24 }],
    noise: [{ f0: 700, f1: 180, decay: 0.7, amp: 0.6, q: 0.8 }, { f0: 700, f1: 180, decay: 0.7, amp: 0.6, q: 0.8, at: 0.24 }],
    echo: { delay: 0.09, gain: 0.3, mix: 0.35 } },
  { id: 'doctrine_escort', family: 'doctrine', tier: 1, dur: 0.6,
    modals: [{ base: 460, count: 4, stretch: 1.35, decay: 0.35, amp: 0.6, attack: 0.02 }],
    tone: [{ f0: 230, f1: 320, decay: 0.4, amp: 0.3, sweepDur: 0.24, attack: 0.02 }] },
  { id: 'doctrine_growl', family: 'doctrine', tier: 1, dur: 0.85, drive: 2.6,
    tone: [{ f0: 96, f1: 230, decay: 0.6, amp: 0.7, sweepDur: 0.3, square: true, attack: 0.02 }],
    noise: [{ f0: 260, decay: 0.5, amp: 0.3, q: 1.2, color: 'pink', attack: 0.03 }] },

  // ---- impacts (mass ladder; PQ-158.01 layers the 3x3 grid on top) ----
  { id: 'impact_hull', family: 'impact', tier: 0, dur: 0.55, drive: 2.8,
    modals: [{ base: 180, count: 7, stretch: 2.3, decay: 0.3, amp: 0.55, shape: 'down' }],
    tone: [{ f0: 96, f1: 38, decay: 0.4, amp: 0.8, sweepDur: 0.2 }],
    noise: [{ f0: 1100, f1: 260, decay: 0.18, amp: 0.55, q: 1.0 }] },
  { id: 'impact_rock', family: 'impact', tier: 0, dur: 0.6, drive: 2.4,
    modals: [{ base: 320, count: 9, stretch: 1.9, decay: 0.2, amp: 0.5 }],
    noise: [{ f0: 900, f1: 220, decay: 0.28, amp: 0.7, q: 0.7, color: 'pink' }],
    tone: [{ f0: 130, f1: 48, decay: 0.35, amp: 0.6, sweepDur: 0.18 }] },
  { id: 'impact_armor', family: 'impact', tier: 1, dur: 0.5, drive: 3.0,
    modals: [{ base: 520, count: 6, stretch: 2.6, decay: 0.24, amp: 0.55 }],
    noise: [{ f0: 2400, f1: 600, decay: 0.14, amp: 0.6, q: 2.2 }] },
  { id: 'impact_kiss', family: 'impact', tier: 1, dur: 0.45,
    modals: [{ base: 150, count: 4, stretch: 2.0, decay: 0.16, amp: 0.7, attack: 0.004 }],
    tone: [{ f0: 82, f1: 60, decay: 0.2, amp: 0.6, sweepDur: 0.12 }] },
  { id: 'impact_slam', family: 'impact', tier: 1, dur: 1.1, drive: 3.2,
    tone: [{ f0: 120, f1: 26, decay: 0.8, amp: 0.95, sweepDur: 0.35 }],
    modals: [{ base: 200, count: 6, stretch: 2.1, decay: 0.5, amp: 0.5 }],
    noise: [{ f0: 900, f1: 140, decay: 0.6, amp: 0.7, q: 0.8, color: 'pink' }],
    echo: { delay: 0.07, gain: 0.28, mix: 0.3 } },

  // ---- PQ-158.01 impact ladder: material x force, layered transient/body/tail ----
  // Nine cells, one designed voice each. The transient (fast shaped-noise strike) says WHAT you
  // hit, the body (struck modals + swept thump) says HOW MUCH mass, and the tail (ring-out/echo)
  // says HOW BIG the structure is. Force (light/medium/heavy) stretches duration, depth and tail
  // inside a material; the runtime mass law keeps pitch/loudness coupling on top of these.
  // hull: plated metal — bright clank transient, modal ring body, hang tail.
  { id: 'ladder_hull_light', family: 'impact', tier: 0, dur: 0.42, drive: 2.6,
    noise: [{ f0: 2600, f1: 900, decay: 0.05, amp: 0.7, q: 2.0, attack: 0.001 }],
    modals: [{ base: 420, count: 5, stretch: 2.4, decay: 0.13, amp: 0.55, shape: 'down' },
      { base: 240, count: 3, stretch: 2.1, decay: 0.4, amp: 0.3, at: 0.012 }],
    tone: [{ f0: 200, f1: 110, decay: 0.14, amp: 0.5, sweepDur: 0.08 }],
    echo: { delay: 0.035, gain: 0.22, mix: 0.22 } },
  { id: 'ladder_hull_medium', family: 'impact', tier: 0, dur: 0.65, drive: 2.9,
    noise: [{ f0: 1700, f1: 480, decay: 0.09, amp: 0.7, q: 1.4, attack: 0.001 }],
    modals: [{ base: 300, count: 6, stretch: 2.3, decay: 0.26, amp: 0.55, shape: 'down' },
      { base: 190, count: 3, stretch: 2.1, decay: 0.6, amp: 0.3, at: 0.015 }],
    tone: [{ f0: 150, f1: 62, decay: 0.3, amp: 0.7, sweepDur: 0.16 }],
    echo: { delay: 0.05, gain: 0.26, mix: 0.28 } },
  { id: 'ladder_hull_heavy', family: 'impact', tier: 0, dur: 1.05, drive: 3.2,
    noise: [{ f0: 1100, f1: 220, decay: 0.22, amp: 0.75, q: 1.0, attack: 0.001 }],
    modals: [{ base: 210, count: 7, stretch: 2.2, decay: 0.5, amp: 0.55, shape: 'down' },
      { base: 150, count: 4, stretch: 2.0, decay: 1.0, amp: 0.35, at: 0.02 }],
    tone: [{ f0: 110, f1: 34, decay: 0.62, amp: 0.9, sweepDur: 0.3 }],
    echo: { delay: 0.07, gain: 0.3, mix: 0.34 } },
  // rock: granular, almost no ring — crunch transient, dense low modals, gravel-settle tail.
  { id: 'ladder_rock_light', family: 'impact', tier: 0, dur: 0.4, drive: 2.2,
    noise: [{ f0: 1500, f1: 520, decay: 0.07, amp: 0.75, q: 0.9, color: 'pink', attack: 0.001 },
      { f0: 340, f1: 190, decay: 0.45, amp: 0.35, q: 0.7, color: 'pink', attack: 0.004, at: 0.02 }],
    modals: [{ base: 270, count: 6, stretch: 1.7, decay: 0.1, amp: 0.45 }],
    tone: [{ f0: 95, f1: 64, decay: 0.12, amp: 0.4, sweepDur: 0.07 }] },
  { id: 'ladder_rock_medium', family: 'impact', tier: 0, dur: 0.62, drive: 2.4,
    noise: [{ f0: 950, f1: 270, decay: 0.18, amp: 0.8, q: 0.8, color: 'pink', attack: 0.001 },
      { f0: 320, f1: 180, decay: 0.7, amp: 0.38, q: 0.7, color: 'pink', attack: 0.006, at: 0.03 }],
    modals: [{ base: 190, count: 7, stretch: 1.8, decay: 0.22, amp: 0.45 }],
    tone: [{ f0: 82, f1: 46, decay: 0.26, amp: 0.6, sweepDur: 0.14 }],
    echo: { delay: 0.04, gain: 0.2, mix: 0.2 } },
  { id: 'ladder_rock_heavy', family: 'impact', tier: 0, dur: 1.0, drive: 2.6,
    noise: [{ f0: 640, f1: 130, decay: 0.42, amp: 0.85, q: 0.7, color: 'pink', attack: 0.002 },
      { f0: 260, f1: 130, decay: 1.1, amp: 0.42, q: 0.7, color: 'pink', attack: 0.008, at: 0.04 }],
    modals: [{ base: 130, count: 8, stretch: 1.8, decay: 0.4, amp: 0.45 }],
    tone: [{ f0: 64, f1: 26, decay: 0.6, amp: 0.8, sweepDur: 0.3 }],
    echo: { delay: 0.06, gain: 0.24, mix: 0.26 } },
  // station: the structure itself — deepest thump, slowest modals, the longest hang of the three.
  { id: 'ladder_station_light', family: 'impact', tier: 0, dur: 0.5, drive: 2.4,
    noise: [{ f0: 620, f1: 230, decay: 0.07, amp: 0.6, q: 1.2, color: 'pink', attack: 0.001 }],
    modals: [{ base: 160, count: 5, stretch: 2.0, decay: 0.28, amp: 0.55 }],
    tone: [{ f0: 72, f1: 50, decay: 0.26, amp: 0.65, sweepDur: 0.12 },
      { f0: 54, f1: 40, decay: 0.55, amp: 0.4, sweepDur: 0.2, at: 0.02 }],
    echo: { delay: 0.08, gain: 0.3, mix: 0.3 } },
  { id: 'ladder_station_medium', family: 'impact', tier: 0, dur: 0.8, drive: 2.8,
    noise: [{ f0: 470, f1: 150, decay: 0.16, amp: 0.7, q: 1.0, color: 'pink', attack: 0.001 }],
    modals: [{ base: 118, count: 6, stretch: 2.1, decay: 0.45, amp: 0.55 }],
    tone: [{ f0: 58, f1: 33, decay: 0.45, amp: 0.8, sweepDur: 0.22 },
      { f0: 46, f1: 30, decay: 0.85, amp: 0.4, sweepDur: 0.3, at: 0.03 }],
    echo: { delay: 0.1, gain: 0.32, mix: 0.36 } },
  { id: 'ladder_station_heavy', family: 'impact', tier: 0, dur: 1.4, drive: 3.2,
    noise: [{ f0: 380, f1: 100, decay: 0.4, amp: 0.8, q: 0.8, color: 'pink', attack: 0.002 }],
    modals: [{ base: 88, count: 7, stretch: 2.1, decay: 0.8, amp: 0.55 }],
    tone: [{ f0: 46, f1: 20, decay: 1.0, amp: 0.95, sweepDur: 0.42 },
      { f0: 38, f1: 22, decay: 1.5, amp: 0.45, sweepDur: 0.5, at: 0.04 }],
    echo: { delay: 0.13, gain: 0.36, mix: 0.42 } },

  // ---- explosions ----
  { id: 'exp_small', family: 'explosion', tier: 0, dur: 0.9, drive: 3.0,
    tone: [{ f0: 150, f1: 30, decay: 0.6, amp: 0.9, sweepDur: 0.3 }],
    modals: [{ base: 260, count: 5, stretch: 2.2, decay: 0.3, amp: 0.4 }],
    noise: [{ f0: 800, f1: 160, decay: 0.5, amp: 0.85, q: 0.7, color: 'pink' }],
    echo: { delay: 0.06, gain: 0.3, mix: 0.3 } },
  { id: 'exp_large', family: 'explosion', tier: 0, dur: 1.7, drive: 3.4,
    tone: [{ f0: 170, f1: 22, decay: 1.2, amp: 1.0, sweepDur: 0.6 }],
    modals: [{ base: 190, count: 6, stretch: 2.0, decay: 0.7, amp: 0.45 }],
    noise: [{ f0: 700, f1: 110, decay: 1.1, amp: 0.9, q: 0.6, color: 'pink', attack: 0.004 }],
    echo: { delay: 0.11, gain: 0.34, mix: 0.38 } },
  { id: 'exp_capital', family: 'explosion', tier: 1, dur: 2.6, drive: 3.4,
    tone: [{ f0: 120, f1: 17, decay: 1.9, amp: 1.0, sweepDur: 1.0 }, { f0: 60, decay: 2.2, amp: 0.7, attack: 0.05 }],
    noise: [{ f0: 500, f1: 80, decay: 1.8, amp: 0.9, q: 0.6, color: 'pink' }],
    echo: { delay: 0.17, gain: 0.4, mix: 0.45 } },
  { id: 'vector_mine', family: 'explosion', tier: 1, dur: 0.7,
    noise: [{ f0: 2100, f1: 900, decay: 0.2, amp: 0.8, q: 1.6, attack: 0.001 }],
    modals: [{ base: 1500, count: 5, stretch: 1.4, decay: 0.35, amp: 0.4, at: 0.015 }],
    tone: [{ f0: 180, f1: 40, decay: 0.3, amp: 0.55, sweepDur: 0.12 }] },
  { id: 'shield_break', family: 'explosion', tier: 0, dur: 0.7,
    modals: [{ base: 1560, count: 7, stretch: 1.5, decay: 0.3, amp: 0.6 }],
    tone: [{ f0: 1560, f1: 700, decay: 0.28, amp: 0.4, sweepDur: 0.2 }],
    noise: [{ f0: 3400, f1: 1400, decay: 0.2, amp: 0.5, q: 3.4 }] },
  { id: 'shield_blowout', family: 'explosion', tier: 1, dur: 0.6, drive: 2.6,
    tone: [{ f0: 880, f1: 55, decay: 0.25, amp: 0.8, sweepDur: 0.14 }],
    modals: [{ base: 2200, count: 5, stretch: 1.6, decay: 0.16, amp: 0.5 }],
    noise: [{ f0: 2800, f1: 900, decay: 0.18, amp: 0.6, q: 3.0 }] },
  { id: 'player_death', family: 'explosion', tier: 1, dur: 2.4, drive: 3.2,
    tone: [{ f0: 140, f1: 20, decay: 1.8, amp: 1.0, sweepDur: 0.9 }],
    noise: [{ f0: 600, f1: 70, decay: 1.6, amp: 0.9, q: 0.6, color: 'pink' }],
    modals: [{ base: 170, count: 7, stretch: 2.1, decay: 0.9, amp: 0.4 }],
    echo: { delay: 0.15, gain: 0.42, mix: 0.5 } },

  // ---- mining ----
  { id: 'mine_beam_loop', family: 'mining', tier: 1, dur: 2.0, loop: true,
    noise: [{ f0: 1100, f1: 1200, decay: 2.0, amp: 0.5, q: 4.5, attack: 0.15, sweepDur: 2.0 }],
    tone: [{ f0: 620, decay: 2.0, amp: 0.1, attack: 0.3, trem: 0.3, tremHz: 22 }] },
  { id: 'mine_impact', family: 'mining', tier: 1, dur: 0.4, drive: 2.2,
    modals: [{ base: 480, count: 6, stretch: 1.8, decay: 0.13, amp: 0.6 }],
    noise: [{ f0: 1300, f1: 400, decay: 0.12, amp: 0.6, q: 1.4 }] },
  { id: 'mine_scan', family: 'mining', tier: 1, dur: 0.6,
    tone: [{ f0: 880, decay: 0.3, amp: 0.4, attack: 0.006 }, { f0: 1320, decay: 0.24, amp: 0.2, at: 0.01 }] },
  { id: 'mine_seam', family: 'mining', tier: 1, dur: 0.8,
    modals: [{ base: 660, count: 5, stretch: 2.0, decay: 0.45, amp: 0.55 }],
    noise: [{ f0: 1600, f1: 500, decay: 0.12, amp: 0.5, q: 1.6 }],
    tone: [{ f0: 660, f1: 1320, decay: 0.3, amp: 0.25, sweepDur: 0.18 }] },
  { id: 'mine_fracture', family: 'mining', tier: 1, dur: 1.2, drive: 2.4,
    tone: [{ f0: 55, f1: 36, decay: 0.7, amp: 0.85, sweepDur: 0.3 }],
    noise: [{ f0: 500, f1: 130, decay: 0.6, amp: 0.8, q: 0.7, color: 'pink', attack: 0.004 }],
    modals: [{ base: 300, count: 5, stretch: 1.8, decay: 0.35, amp: 0.35 }] },
  { id: 'mine_core', family: 'mining', tier: 1, dur: 1.1,
    modals: [{ base: 660, count: 6, stretch: 2.2, decay: 0.7, amp: 0.6 }],
    tone: [{ f0: 330, f1: 495, decay: 0.5, amp: 0.3, sweepDur: 0.2, at: 0.02 }],
    echo: { delay: 0.08, gain: 0.3, mix: 0.35 } },
  { id: 'mine_drill', family: 'mining', tier: 1, dur: 0.7, drive: 2.6,
    noise: [{ f0: 620, f1: 420, decay: 0.4, amp: 0.75, q: 1.6, color: 'pink', attack: 0.02 }],
    modals: [{ base: 240, count: 5, stretch: 1.6, decay: 0.3, amp: 0.4 }],
    tone: [{ f0: 110, f1: 96, decay: 0.4, amp: 0.3, square: true }] },
  { id: 'mine_vent', family: 'mining', tier: 1, dur: 1.1,
    noise: [{ f0: 3400, f1: 640, decay: 0.8, amp: 0.7, q: 1.2, attack: 0.03, sweepDur: 0.7 }] },
  { id: 'mine_abort', family: 'mining', tier: 1, dur: 0.55,
    tone: [{ f0: 420, f1: 120, decay: 0.35, amp: 0.55, sweepDur: 0.24 }],
    modals: [{ base: 300, count: 4, stretch: 1.7, decay: 0.2, amp: 0.35 }] },
  { id: 'mine_gas', family: 'mining', tier: 1, dur: 1.8,
    noise: [{ f0: 1250, decay: 0.16, amp: 0.9, q: 0.8, attack: 0.004 },
      { f0: 2300, f1: 900, decay: 1.5, amp: 0.4, q: 1.4, attack: 0.06, at: 0.12 }],
    tone: [{ f0: 62, f1: 33, decay: 0.5, amp: 0.9, sweepDur: 0.3, at: 0.02 }] },
  { id: 'mine_gravel', family: 'mining', tier: 1, dur: 0.6,
    noise: [{ f0: 700, f1: 300, decay: 0.3, amp: 0.7, q: 0.9, color: 'pink' }],
    modals: [{ base: 380, count: 8, stretch: 1.5, decay: 0.1, amp: 0.5 }] },

  // ---- UI kit ----
  { id: 'ui_click', family: 'ui', tier: 0, dur: 0.14,
    tone: [{ f0: 880, f1: 640, decay: 0.07, amp: 0.7, sweepDur: 0.05 }],
    modals: [{ base: 1900, count: 3, stretch: 1.4, decay: 0.05, amp: 0.3 }] },
  { id: 'ui_confirm', family: 'ui', tier: 0, dur: 0.5,
    tone: [{ f0: 440, decay: 0.28, amp: 0.6 }, { f0: 880, decay: 0.22, amp: 0.15, at: 0.005 }] },
  { id: 'ui_deny', family: 'ui', tier: 1, dur: 0.45,
    tone: [{ f0: 330, f1: 247, decay: 0.3, amp: 0.6, sweepDur: 0.12 }, { f0: 247, f1: 196, decay: 0.24, amp: 0.4, sweepDur: 0.1, at: 0.09 }] },
  { id: 'ui_open', family: 'ui', tier: 1, dur: 0.4,
    tone: [{ f0: 110, f1: 100, decay: 0.25, amp: 0.8, sweepDur: 0.1 }],
    noise: [{ f0: 500, decay: 0.08, amp: 0.25, q: 1.2 }] },
  { id: 'ui_alert', family: 'ui', tier: 1, dur: 1.0,
    tone: [{ f0: 196, decay: 0.85, amp: 0.6, attack: 0.22 }, { f0: 392, decay: 0.85, amp: 0.1, attack: 0.22 }] },
  { id: 'ui_lock', family: 'ui', tier: 1, dur: 0.3,
    tone: [{ f0: 990, decay: 0.08, amp: 0.6 }, { f0: 1320, decay: 0.1, amp: 0.6, at: 0.07 }] },
  { id: 'ui_mission', family: 'ui', tier: 1, dur: 0.7,
    tone: [{ f0: 523, decay: 0.2, amp: 0.5 }, { f0: 659, decay: 0.2, amp: 0.5, at: 0.09 },
      { f0: 784, decay: 0.3, amp: 0.55, at: 0.18 }] },
  { id: 'ui_loot', family: 'ui', tier: 0, dur: 0.35,
    tone: [{ f0: 780, f1: 1170, decay: 0.12, amp: 0.6, sweepDur: 0.07 }, { f0: 1560, decay: 0.1, amp: 0.3, at: 0.05 }] },
  { id: 'ui_dock', family: 'ui', tier: 0, dur: 1.0,
    tone: [{ f0: 48, f1: 62, decay: 0.85, amp: 0.8, sweepDur: 0.5, attack: 0.18 }],
    modals: [{ base: 190, count: 4, stretch: 2.0, decay: 0.3, amp: 0.3, at: 0.05 }] },
  { id: 'ui_undock', family: 'ui', tier: 1, dur: 0.8,
    tone: [{ f0: 62, f1: 48, decay: 0.6, amp: 0.8, sweepDur: 0.35, attack: 0.06 }],
    noise: [{ f0: 700, f1: 1500, decay: 0.4, amp: 0.25, q: 0.9, attack: 0.04, at: 0.03 }] },
  { id: 'ui_respawn', family: 'ui', tier: 1, dur: 1.0,
    tone: [{ f0: 440, f1: 1320, decay: 0.7, amp: 0.55, sweepDur: 0.4, attack: 0.01 }],
    echo: { delay: 0.09, gain: 0.3, mix: 0.4 } },
  { id: 'ui_detent', family: 'ui', tier: 1, dur: 0.16,
    tone: [{ f0: 760, f1: 520, decay: 0.08, amp: 0.65, sweepDur: 0.03, square: true }],
    noise: [{ f0: 980, decay: 0.04, amp: 0.35, q: 1.8 }] },

  // ---- engine / travel ----
  { id: 'engine_thrust_loop', family: 'engine', tier: 0, dur: 3.0, loop: true,
    noise: [{ f0: 320, f1: 360, decay: 3.0, amp: 0.55, q: 0.8, attack: 0.3, sweepDur: 3.0, color: 'pink' }],
    tone: [{ f0: 78, f1: 84, decay: 3.0, amp: 0.3, attack: 0.5, sweepDur: 3.0 }] },
  { id: 'boost_whoosh', family: 'engine', tier: 1, dur: 0.7,
    noise: [{ f0: 300, f1: 1500, decay: 0.4, amp: 0.8, q: 0.5, attack: 0.04, sweepDur: 0.3, color: 'pink' }],
    tone: [{ f0: 90, f1: 160, decay: 0.35, amp: 0.3, sweepDur: 0.25 }] },
  { id: 'dash_punch', family: 'engine', tier: 1, dur: 0.4,
    noise: [{ f0: 600, f1: 240, decay: 0.12, amp: 0.7, q: 1.0 }],
    tone: [{ f0: 55, f1: 40, decay: 0.14, amp: 0.85 }] },
  { id: 'jump_charge', family: 'engine', tier: 1, dur: 1.7, drive: 1.6,
    tone: [{ f0: 80, f1: 800, decay: 1.4, amp: 0.6, sweepDur: 1.5, attack: 0.1, trem: 0.3, tremHz: 12 }] },
  { id: 'jump_arrive', family: 'engine', tier: 1, dur: 1.0,
    noise: [{ f0: 2200, f1: 500, decay: 0.6, amp: 0.75, q: 0.7, attack: 0.005, sweepDur: 0.5 }],
    modals: [{ base: 1400, count: 5, stretch: 1.6, decay: 0.4, amp: 0.3, at: 0.02 }],
    echo: { delay: 0.08, gain: 0.32, mix: 0.4 } },
  { id: 'travel_lock', family: 'engine', tier: 1, dur: 0.5,
    tone: [{ f0: 98, f1: 147, decay: 0.35, amp: 0.55, sweepDur: 0.22 }] },
  { id: 'travel_gate', family: 'engine', tier: 1, dur: 1.5,
    tone: [{ f0: 73.5, f1: 294, decay: 1.2, amp: 0.55, sweepDur: 1.2, attack: 0.04 }] },
  { id: 'travel_commit', family: 'engine', tier: 1, dur: 1.0,
    tone: [{ f0: 49, f1: 98, decay: 0.7, amp: 0.8, sweepDur: 0.4 }],
    noise: [{ f0: 700, f1: 1300, decay: 0.6, amp: 0.5, q: 0.6, attack: 0.03, sweepDur: 0.5 }] },
  { id: 'travel_arrival', family: 'engine', tier: 1, dur: 1.2,
    tone: [{ f0: 294, f1: 98, decay: 0.8, amp: 0.5, sweepDur: 0.5, attack: 0.015 }],
    noise: [{ f0: 1800, f1: 400, decay: 0.7, amp: 0.5, q: 0.7, sweepDur: 0.4 }],
    echo: { delay: 0.1, gain: 0.3, mix: 0.35 } },
  { id: 'travel_fail', family: 'engine', tier: 1, dur: 0.9,
    tone: [{ f0: 147, f1: 55, decay: 0.6, amp: 0.6, sweepDur: 0.36, square: true }],
    noise: [{ f0: 400, f1: 180, decay: 0.4, amp: 0.45, q: 1.3 }] },
  { id: 'travel_interdict', family: 'engine', tier: 1, dur: 0.8,
    tone: [{ f0: 110, decay: 0.55, amp: 0.5 }, { f0: 104, decay: 0.55, amp: 0.5 }],
    noise: [{ f0: 330, decay: 0.4, amp: 0.3, q: 2.2 }] },

  // ---- comms / squelch ----
  { id: 'squelch_story', family: 'comms', tier: 1, dur: 0.9,
    tone: [{ f0: 330, decay: 0.8, amp: 0.55, attack: 0.01, trem: 0.15, tremHz: 7 }] },
  { id: 'squelch_ambient', family: 'comms', tier: 1, dur: 0.15,
    noise: [{ f0: 3400, decay: 0.08, amp: 0.7, q: 1.2, type: 'hp' }] },
  { id: 'squelch_danger', family: 'comms', tier: 1, dur: 0.9, drive: 2.0,
    tone: [{ f0: 800, f1: 780, decay: 0.8, amp: 0.5, attack: 0.005, trem: 0.2, tremHz: 11 }],
    noise: [{ f0: 900, decay: 0.5, amp: 0.4, q: 3.0, attack: 0.005 }] },

  // ---- massline / tether ----
  { id: 'massline_throw', family: 'massline', tier: 1, dur: 0.5,
    tone: [{ f0: 240, f1: 860, decay: 0.3, amp: 0.6, sweepDur: 0.1 }],
    noise: [{ f0: 1400, f1: 3600, decay: 0.2, amp: 0.4, q: 0.9, sweepDur: 0.12 }] },
  { id: 'massline_sling', family: 'massline', tier: 1, dur: 0.9,
    tone: [{ f0: 140, f1: 60, decay: 0.6, amp: 0.7, sweepDur: 0.3 }],
    noise: [{ f0: 320, f1: 900, decay: 0.5, amp: 0.7, q: 1.1, attack: 0.05, sweepDur: 0.4, color: 'pink' }] },
  { id: 'massline_tumble', family: 'massline', tier: 1, dur: 0.9,
    tone: [{ f0: 320, f1: 120, decay: 0.7, amp: 0.5, sweepDur: 0.4, trem: 0.7, tremHz: 9 }] },
  { id: 'massline_bt', family: 'massline', tier: 1, dur: 0.6,
    tone: [{ f0: 420, f1: 130, decay: 0.4, amp: 0.7, sweepDur: 0.18 }] },
  { id: 'massline_cloak', family: 'massline', tier: 1, dur: 0.9,
    noise: [{ f0: 1400, f1: 3600, decay: 0.7, amp: 0.5, q: 1.4, attack: 0.02, sweepDur: 0.6, type: 'hp' }] },
  { id: 'tether_latch', family: 'massline', tier: 1, dur: 0.3,
    modals: [{ base: 196, count: 4, stretch: 2.0, decay: 0.12, amp: 0.6 }],
    noise: [{ f0: 360, decay: 0.07, amp: 0.6, q: 2.8 }] },
  { id: 'tether_snap', family: 'massline', tier: 1, dur: 0.5,
    noise: [{ f0: 2000, decay: 0.05, amp: 0.9, q: 1.2, type: 'hp', attack: 0.001 }],
    tone: [{ f0: 180, f1: 60, decay: 0.3, amp: 0.7, sweepDur: 0.18, at: 0.005 }] },
  { id: 'tether_strain', family: 'massline', tier: 1, dur: 0.6,
    noise: [{ f0: 460, f1: 620, decay: 0.4, amp: 0.6, q: 5.2, color: 'pink', attack: 0.02, sweepDur: 0.3 }] },
  { id: 'massline_reel', family: 'massline', tier: 1, dur: 0.55,
    tone: [{ f0: 320, f1: 640, decay: 0.5, amp: 0.55, sweepDur: 0.22, trem: 0.35, tremHz: 18 }],
    noise: [{ f0: 900, decay: 0.4, amp: 0.25, q: 6.5 }] },
  { id: 'massline_release', family: 'massline', tier: 1, dur: 0.35,
    tone: [{ f0: 310, f1: 620, decay: 0.22, amp: 0.7, sweepDur: 0.07 }],
    noise: [{ f0: 1800, decay: 0.04, amp: 0.25, q: 1.4, type: 'hp', attack: 0.001 }] },
  { id: 'massline_bridle', family: 'massline', tier: 1, dur: 0.55,
    tone: [{ f0: 196, decay: 0.45, amp: 0.55 }, { f0: 294, decay: 0.5, amp: 0.5 }],
    modals: [{ base: 196, count: 4, stretch: 1.5, decay: 0.28, amp: 0.4 }] },

  // ---- kills / subsystems / countermeasures ----
  { id: 'kill_confirm_chime', family: 'combat', tier: 1, dur: 0.5,
    tone: [{ f0: 740, f1: 1110, decay: 0.3, amp: 0.55, sweepDur: 0.14 }] },
  { id: 'subsystem_pop', family: 'combat', tier: 1, dur: 0.5,
    noise: [{ f0: 980, f1: 300, decay: 0.3, amp: 0.6, q: 2.2, type: 'hp' }],
    modals: [{ base: 420, count: 4, stretch: 1.7, decay: 0.2, amp: 0.4 }] },
  { id: 'cm_chaff', family: 'combat', tier: 1, dur: 0.5,
    noise: [{ f0: 2600, f1: 3400, decay: 0.25, amp: 0.8, q: 0.9, type: 'hp', attack: 0.004, sweepDur: 0.15 }] },
  { id: 'cm_ecm', family: 'combat', tier: 1, dur: 0.9,
    tone: [{ f0: 1200, f1: 200, decay: 0.6, amp: 0.6, sweepDur: 0.36 }] },
  { id: 'rcs_disrupt', family: 'combat', tier: 1, dur: 0.5, drive: 2.2,
    tone: [{ f0: 880, f1: 240, decay: 0.32, amp: 0.65, sweepDur: 0.16, square: true }] },
  { id: 'escalation_sub', family: 'combat', tier: 1, dur: 0.7,
    tone: [{ f0: 82, f1: 61, decay: 0.5, amp: 0.75, sweepDur: 0.26 }] },

  // ---- wanted / heat ----
  { id: 'wanted_alert', family: 'ui', tier: 1, dur: 1.3,
    tone: [{ f0: 196, decay: 1.1, amp: 0.6, attack: 0.25 }, { f0: 98, decay: 1.1, amp: 0.25, attack: 0.25 }] },
  { id: 'wanted_clear', family: 'ui', tier: 1, dur: 0.8,
    tone: [{ f0: 523, f1: 349, decay: 0.55, amp: 0.55, sweepDur: 0.26 }] },

  // ---- station / world context ----
  { id: 'station_hum_loop', family: 'station', tier: 2, dur: 4.0, loop: true,
    tone: [{ f0: 60, decay: 4.0, amp: 0.4, attack: 1.2 }, { f0: 120.4, decay: 4.0, amp: 0.2, attack: 1.4, trem: 0.2, tremHz: 0.3 }],
    noise: [{ f0: 300, decay: 4.0, amp: 0.1, q: 0.6, attack: 1.0, color: 'pink' }] },
  { id: 'station_tick', family: 'station', tier: 2, dur: 0.3,
    noise: [{ f0: 180, decay: 0.09, amp: 0.6, q: 2.5, color: 'pink' }],
    modals: [{ base: 220, count: 3, stretch: 2.0, decay: 0.1, amp: 0.3 }] },
  { id: 'traffic_blip', family: 'station', tier: 2, dur: 0.5,
    tone: [{ f0: 520, f1: 410, decay: 0.3, amp: 0.5, sweepDur: 0.18 }] },
  { id: 'rock_groan', family: 'world', tier: 2, dur: 2.8,
    tone: [{ f0: 38, f1: 52, decay: 2.4, amp: 0.6, sweepDur: 1.6, attack: 0.45, square: true, trem: 0.3, tremHz: 2.2 }] },
  { id: 'rock_calve', family: 'world', tier: 2, dur: 1.2, drive: 2.2,
    noise: [{ f0: 420, f1: 120, decay: 0.8, amp: 0.8, q: 0.9, color: 'pink', attack: 0.004 }],
    tone: [{ f0: 70, f1: 40, decay: 0.6, amp: 0.5, sweepDur: 0.3 }] },
  { id: 'ambient_swell', family: 'world', tier: 2, dur: 2.2,
    tone: [{ f0: 55, f1: 148, decay: 1.6, amp: 0.5, sweepDur: 0.9, attack: 0.12 }],
    echo: { delay: 0.19, gain: 0.35, mix: 0.45 } },
  { id: 'fringe_tick', family: 'world', tier: 2, dur: 0.2,
    noise: [{ f0: 2800, decay: 0.06, amp: 0.7, q: 4.0 }] },
  { id: 'ore_tick', family: 'mining', tier: 1, dur: 0.25,
    modals: [{ base: 1180, count: 3, stretch: 1.5, decay: 0.08, amp: 0.6 }],
    noise: [{ f0: 2700, decay: 0.04, amp: 0.3, q: 4.0 }] },
  { id: 'hopper_thock', family: 'mining', tier: 1, dur: 0.3,
    modals: [{ base: 226, count: 4, stretch: 1.9, decay: 0.12, amp: 0.7 }],
    noise: [{ f0: 1150, decay: 0.04, amp: 0.4, q: 3.0 }] },
];

// ---------------------------------------------------------------------------
// driver
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');

const results = [];
let mismatches = [];
for (const spec of SAMPLES) {
  const rel = `${spec.family}/${spec.id}.wav`;
  const file = path.join(OUT_ROOT, rel);
  const bytes = wavBytes(renderSample(spec));
  if (checkOnly) {
    if (!existsSync(file)) { mismatches.push(`missing ${rel}`); continue; }
    const existing = readFileSync(file);
    if (!existing.equals(bytes)) mismatches.push(`drifted ${rel}`);
  } else {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
  results.push({ id: spec.id, file: `assets/audio/${rel}`, tier: spec.tier, loop: !!spec.loop, seconds: +(spec.dur).toFixed(2), bytes: bytes.length });
}

if (mismatches.length) {
  console.error(`sample tree does not match the generator (${mismatches.length}):`);
  for (const m of mismatches) console.error(`  ${m}`);
  process.exitCode = 1;
} else {
  const total = results.reduce((s, r) => s + r.bytes, 0);
  console.log(`${results.length} designed samples, ${(total / 1024).toFixed(0)} KiB total${checkOnly ? ' (verified byte-identical)' : ''}`);
  for (const r of results) console.log(`  ${r.id.padEnd(22)} T${r.tier}${r.loop ? ' loop' : '     '} ${String(r.seconds).padStart(5)}s ${String(r.bytes).padStart(7)}B  ${r.file}`);
}
