// Spatial voices for emergent primitive reactions.
// Plays through the live audio context when one exists. Node labs only record the cue.

import { playRecipe, disposeVoice } from './synth.js';

const RECIPES = Object.freeze({
  sfx_emergent_seismic: {
    id: 'sfx_emergent_seismic', category: 'weapon', type: 'oscillator', wave: 'sine',
    baseFreq: 36, gainMult: 0.95,
    gainEnvelope: { attack: 0.008, decay: 0.12, sustain: 0.35, release: 0.62 },
  },
  sfx_emergent_crackle: {
    id: 'sfx_emergent_crackle', category: 'weapon', type: 'noise_burst', wave: 'sawtooth',
    baseFreq: 1400, filterType: 'bandpass', filterFreq: 1800, filterQ: 4, gainMult: 0.55,
    gainEnvelope: { attack: 0.002, decay: 0.04, sustain: 0, release: 0.08 },
  },
  sfx_emergent_crumple: {
    id: 'sfx_emergent_crumple', category: 'weapon', type: 'noise_filtered',
    baseFreq: 180, filterType: 'lowpass', filterFreq: 420, filterQ: 0.7, gainMult: 0.7,
    gainEnvelope: { attack: 0.004, decay: 0.09, sustain: 0.15, release: 0.28 },
  },
  sfx_emergent_spring: {
    id: 'sfx_emergent_spring', category: 'weapon', type: 'oscillator', wave: 'triangle',
    baseFreq: 92, gainMult: 0.4,
    gainEnvelope: { attack: 0.01, decay: 0.08, sustain: 0.2, release: 0.22 },
  },
  sfx_emergent_cook: {
    id: 'sfx_emergent_cook', category: 'weapon', type: 'noise_burst',
    baseFreq: 90, filterType: 'lowpass', filterFreq: 240, filterQ: 0.8, gainMult: 0.85,
    gainEnvelope: { attack: 0.004, decay: 0.16, sustain: 0.2, release: 0.4 },
  },
  sfx_emergent_slug: {
    id: 'sfx_emergent_slug', category: 'weapon', type: 'oscillator', wave: 'square',
    baseFreq: 70, gainMult: 0.5,
    gainEnvelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.12 },
  },
  sfx_emergent_gel: {
    id: 'sfx_emergent_gel', category: 'weapon', type: 'oscillator', wave: 'sine',
    baseFreq: 120, gainMult: 0.28,
    gainEnvelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.3 },
  },
  sfx_emergent_prism: {
    id: 'sfx_emergent_prism', category: 'weapon', type: 'oscillator', wave: 'sine',
    baseFreq: 880, gainMult: 0.35,
    gainEnvelope: { attack: 0.002, decay: 0.04, sustain: 0.1, release: 0.12 },
  },
  sfx_emergent_spin: {
    id: 'sfx_emergent_spin', category: 'weapon', type: 'oscillator', wave: 'sawtooth',
    baseFreq: 210, gainMult: 0.32,
    gainEnvelope: { attack: 0.01, decay: 0.06, sustain: 0.25, release: 0.18 },
  },
});

export function emergentRecipe(id) {
  return RECIPES[id] || null;
}

export function createEmergentVoice() {
  const live = [];
  const caches = {};
  return {
    play(cue, registry) {
      if (!cue || !cue.id) return false;
      const recipe = RECIPES[cue.id];
      if (!recipe) return false;
      const audio = registry && registry.get && registry.get('audio');
      const rt = audio && audio.rt;
      const ctx = rt && rt.ctx;
      const dest = rt && (rt.sfxBus || rt.masterGain || ctx.destination);
      if (!ctx || !dest || ctx.state === 'closed') return false;
      const now = ctx.currentTime;
      for (let i = live.length - 1; i >= 0; i--) {
        const row = live[i];
        if (row.voice.stopAt <= now) {
          disposeVoice(row.voice);
          if (row.panner) { try { row.panner.disconnect(); } catch (_) { /* already gone */ } }
          live.splice(i, 1);
        }
      }
      while (live.length > 24) {
        const old = live.shift();
        disposeVoice(old.voice);
        if (old.panner) { try { old.panner.disconnect(); } catch (_) { /* already gone */ } }
      }
      let node = dest;
      let panner = null;
      const pan = Number(cue.pan);
      if (Number.isFinite(pan) && pan !== 0 && ctx.createStereoPanner) {
        panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        panner.connect(dest);
        node = panner;
      }
      const voice = playRecipe(ctx, recipe, node, {
        peakGain: Number.isFinite(cue.gain) ? cue.gain : 0.8,
        startTime: now,
      }, caches);
      live.push({ voice, panner });
      return true;
    },
    dispose() {
      while (live.length) {
        const row = live.pop();
        disposeVoice(row.voice);
        if (row.panner) { try { row.panner.disconnect(); } catch (_) { /* already gone */ } }
      }
    },
  };
}
