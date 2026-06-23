// src/audio/synth.js — 100% Web Audio synthesis primitives for the audio system.
// No audio files, no three, no DOM. Pure node-graph helpers: a shared white-noise
// buffer, an ADSR envelope helper, biquad builders, and a recipe-driven one-shot/loop
// voice player feeding a voice pool. Consumed by src/audio/audioSystem.js.
//
// Recipe shape (from src/data/audioRecipes.js, RECIPES[]):
//   { id, category, type:'oscillator'|'noise_filtered'|'noise_burst'|'continuous_oscillator'|'layered',
//     baseFreq, freqMod?, freqSweep?[from,to], sweepTimeS?, noiseColor?, wave?,
//     gainEnvelope:{attack,sustain,release}, filterType?, filterFreq?, filterQ?,
//     lfoRate?, lfoDepth?, pitchRange?[lo,hi], layers?[ids], gainMult?, filterFreqMult?,
//     distortionAmount?, dopplerEnabled? }

import { RECIPES } from '../data/audioRecipes.js';

const TWO_PI = Math.PI * 2;

// Default oscillator wave per recipe type / category (recipes don't always specify `wave`).
function waveFor(recipe) {
  if (recipe.wave) return recipe.wave;
  switch (recipe.category) {
    case 'weapon': return 'sawtooth';
    case 'ui': return 'sine';
    default: return 'sine';
  }
}

/** One shared 2s white-noise buffer, lazily built at the context sample rate. */
export function getNoiseBuffer(ctx, cache) {
  if (cache.noise && cache.noise.sampleRate === ctx.sampleRate) return cache.noise;
  const len = Math.max(1, Math.floor(ctx.sampleRate * 2));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  // Deterministic-ish white noise (cosmetic, Math.random allowed for VFX/audio).
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  cache.noise = buf;
  return buf;
}

function makeNoiseSource(ctx, cache, loop) {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx, cache);
  src.loop = !!loop;
  return src;
}

/**
 * ADSR on a GainNode's gain param. Linear attack/decay, exponential release tail
 * (never to exactly 0 — avoids clicks). Returns { stopAt } — when the voice should
 * be torn down. For sustaining (loop) voices pass sustainHold=true; caller releases later.
 */
export function applyEnvelope(param, t0, peak, env, sustainHold) {
  const a = Math.max(0.001, env.attack || 0.005);
  const s = env.sustain == null ? 0 : env.sustain;
  const r = Math.max(0.01, env.release || 0.05);
  const decayTo = peak * (s > 0 ? s : 0.0001);
  param.cancelScheduledValues(t0);
  param.setValueAtTime(0.0001, t0);
  param.linearRampToValueAtTime(peak, t0 + a);
  // decay toward sustain (or toward release if no sustain)
  const dEnd = t0 + a + 0.04;
  param.linearRampToValueAtTime(Math.max(0.0001, decayTo), dEnd);
  if (sustainHold) {
    // hold at sustain level; release handled later by releaseVoice()
    return { stopAt: Infinity, releaseDur: r, peak };
  }
  // transient: schedule exponential release after the decay
  const relStart = dEnd;
  param.exponentialRampToValueAtTime(0.0001, relStart + r);
  return { stopAt: relStart + r + 0.02, releaseDur: r, peak };
}

/** Release a held (sustaining) voice's gain to silence over the recipe release time. */
export function releaseEnvelope(param, t1, releaseDur) {
  const r = Math.max(0.01, releaseDur || 0.1);
  let cur = 0.0001;
  try { cur = Math.max(0.0001, param.value); } catch (_) { cur = 0.0001; }
  param.cancelScheduledValues(t1);
  param.setValueAtTime(cur, t1);
  param.exponentialRampToValueAtTime(0.0001, t1 + r);
  return t1 + r + 0.02;
}

function makeFilter(ctx, recipe, freqMult) {
  if (!recipe.filterType) return null;
  const f = ctx.createBiquadFilter();
  f.type = recipe.filterType;
  f.frequency.value = Math.max(20, (recipe.filterFreq || 1000) * (freqMult || 1));
  if (recipe.filterQ != null) f.Q.value = recipe.filterQ;
  return f;
}

// Cheap soft-clip waveshaper curve, cached by amount.
function makeDistortion(ctx, amount, cache) {
  const k = Math.max(0, Math.min(1, amount)) * 50;
  const key = 'dist_' + k.toFixed(2);
  if (cache[key]) {
    const ws = ctx.createWaveShaper();
    ws.curve = cache[key];
    ws.oversample = '2x';
    return ws;
  }
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
  }
  cache[key] = curve;
  const ws = ctx.createWaveShaper();
  ws.curve = curve;
  ws.oversample = '2x';
  return ws;
}

function ensureRecipeById(caches) {
  if (caches.recipeById) return caches.recipeById;
  caches.recipeById = {};
  for (const r of RECIPES) caches.recipeById[r.id] = r;
  return caches.recipeById;
}

function randomInRange(range) {
  if (!range || range.length < 2) return 1;
  const lo = range[0], hi = range[1];
  return lo + Math.random() * (hi - lo);
}

function mergeLayerRecipe(parent, layer) {
  return {
    ...layer,
    gainEnvelope: parent.gainEnvelope || layer.gainEnvelope,
    gainMult: (parent.gainMult || 1) * (layer.gainMult || 1),
    filterFreqMult: (parent.filterFreqMult || 1) * (layer.filterFreqMult || 1),
    filterType: parent.filterType || layer.filterType,
    filterFreq: parent.filterFreq != null ? parent.filterFreq : layer.filterFreq,
    filterQ: parent.filterQ != null ? parent.filterQ : layer.filterQ,
    distortionAmount: parent.distortionAmount != null ? parent.distortionAmount : layer.distortionAmount,
    pitchRange: layer.pitchRange || parent.pitchRange,
  };
}

function pickRate(recipe, opts) {
  // An explicit non-unity rate overrides the recipe's pitchRange.
  if (opts.rate != null && opts.rate !== 1) return opts.rate;
  if (recipe.pitchRange) return randomInRange(recipe.pitchRange);
  return opts.rate || 1;
}

function buildRecipeVoice(ctx, recipe, dest, t0, rate, detune, peak, freqMult, caches) {
  const isLoop = recipe.type === 'continuous_oscillator';
  const env = recipe.gainEnvelope || { attack: 0.005, sustain: 0, release: 0.08 };
  const vGain = ctx.createGain();
  vGain.gain.value = 0.0001;
  const tail = applyEnvelope(vGain.gain, t0, peak, env, isLoop);

  const filter = makeFilter(ctx, recipe, freqMult);
  const dist = recipe.distortionAmount ? makeDistortion(ctx, recipe.distortionAmount, caches) : null;

  // chain: sources -> (dist) -> (filter) -> vGain -> dest
  let chainIn = vGain;
  if (filter) { filter.connect(vGain); chainIn = filter; }
  if (dist) { dist.connect(chainIn); chainIn = dist; }
  vGain.connect(dest);

  const sources = [];
  const extra = [];
  const nodes = [vGain];
  if (filter) nodes.push(filter);
  if (dist) nodes.push(dist);

  function addOsc(freq, type) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = Math.max(1, freq);
    if (detune) o.detune.value = detune;
    o.connect(chainIn);
    sources.push(o);
    return o;
  }

  const t = recipe.type;
  if (t === 'oscillator' || t === 'continuous_oscillator') {
    const base = (recipe.baseFreq || 440) * rate;
    const o = addOsc(base, waveFor(recipe));
    // frequency sweep / glide
    if (recipe.freqSweep && recipe.sweepTimeS) {
      const from = recipe.freqSweep[0] * rate, to = recipe.freqSweep[1] * rate;
      o.frequency.setValueAtTime(Math.max(1, from), t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + recipe.sweepTimeS);
    }
    // vibrato / frequency LFO via a detune-driving oscillator
    if (recipe.lfoRate && recipe.lfoDepth) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = recipe.lfoRate;
      lg.gain.value = recipe.lfoDepth * base; // depth as fraction of base freq
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t0); extra.push(lfo, lg);
      nodes.push(lfo, lg);
    } else if (recipe.freqMod) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.value = recipe.freqMod * base;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t0); extra.push(lfo, lg);
      nodes.push(lfo, lg);
    }
  } else if (t === 'noise_burst' || t === 'noise_filtered') {
    const src = makeNoiseSource(ctx, caches, t === 'noise_filtered' && isLoop);
    src.playbackRate.value = rate;
    src.connect(chainIn);
    sources.push(src);
    // sweeping bandpass/lowpass to give the noise motion when a filter is present
    if (filter && recipe.lfoRate && recipe.lfoDepth) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = recipe.lfoRate;
      lg.gain.value = (recipe.filterFreq || 800) * recipe.lfoDepth;
      lfo.connect(lg); lg.connect(filter.frequency);
      lfo.start(t0); extra.push(lfo, lg);
      nodes.push(lfo, lg);
    }
  }

  // start all sources
  for (const s of sources) { try { s.start(t0); } catch (_) {} }

  return { nodes, sources, extra, gain: vGain, tail, loop: isLoop };
}

/**
 * Build and start a voice from a recipe. Returns a Voice object:
 *   { nodes:[], gain, source(s), startedAt, loop, recipe, stopAt, release(t), stop(t), id }
 * `dest` is the node to connect into (a per-call gain that the system has already
 * panned/attenuated and wired to the sfx bus). `opts`: { rate, detune, peakGain }.
 */
export function playRecipe(ctx, recipe, dest, opts, caches) {
  opts = opts || {};
  caches = caches || {};
  ensureRecipeById(caches);
  const t0 = ctx.currentTime;
  const detune = opts.detune || 0;
  const basePeak = Math.max(0.0001, Math.min(1, opts.peakGain == null ? 1 : opts.peakGain));
  const peak = basePeak * (recipe.gainMult || 1);
  const isLoop = recipe.type === 'continuous_oscillator';

  // Master voice gain. Sub-voices (layers / repeats) each have their own envelope
  // and connect through this master so release/dispose work on the whole group.
  const vGain = ctx.createGain();
  vGain.gain.value = 1.0;
  vGain.connect(dest);

  const subVoices = [];
  const sources = [];
  const extra = [];
  const nodes = [vGain];

  const repeatCount = Math.max(0, Number(recipe.repeatCount) || 0);
  const repeatIntervalS = Math.max(0, Number(recipe.repeatIntervalS) || 0);

  function addSubVoice(subRecipe, startTime, gainMult, freqMult) {
    const rate = pickRate(subRecipe, opts);
    const subPeak = Math.max(0.0001, peak * gainMult);
    const sub = buildRecipeVoice(ctx, subRecipe, vGain, startTime, rate, detune, subPeak, freqMult, caches);
    subVoices.push(sub);
    sources.push(...sub.sources);
    extra.push(...sub.extra);
    nodes.push(...sub.nodes);
  }

  function buildLayers(layerRecipe, gainMult, freqMult, startTime) {
    if (layerRecipe.type === 'layered') {
      for (const layerId of layerRecipe.layers || []) {
        const next = caches.recipeById[layerId];
        if (!next) continue;
        const merged = mergeLayerRecipe(layerRecipe, next);
        buildLayers(merged, gainMult * (layerRecipe.gainMult || 1), freqMult * (layerRecipe.filterFreqMult || 1), startTime);
      }
    } else {
      addSubVoice(layerRecipe, startTime, gainMult, freqMult);
    }
  }

  // Build the initial sound (may be a layered recipe).
  buildLayers(recipe, 1, 1, t0);

  // Schedule additional repeats at fixed intervals, each with fresh pitch randomization.
  for (let n = 1; n <= repeatCount; n++) {
    buildLayers(recipe, 1, 1, t0 + repeatIntervalS * n);
  }

  // Overall voice lifetime is the longest sub-voice lifetime.
  let maxStopAt = 0;
  let maxReleaseDur = 0;
  for (const sub of subVoices) {
    if (sub.tail.stopAt === Infinity) { maxStopAt = Infinity; break; }
    maxStopAt = Math.max(maxStopAt, sub.tail.stopAt);
    maxReleaseDur = Math.max(maxReleaseDur, sub.tail.releaseDur);
  }

  const voice = {
    id: opts.id || 0,
    recipe, loop: isLoop,
    gain: vGain, sources, extra, nodes, subVoices,
    startedAt: t0,
    releaseDur: maxReleaseDur,
    stopAt: maxStopAt,
    _stopped: false,
    trackId: opts.trackId || null,
    callGain: peak,
  };

  // For transient voices, schedule a hard stop a hair after the release tail.
  if (!isLoop && maxStopAt !== Infinity) {
    scheduleStop(voice, maxStopAt);
  }

  return voice;
}

function scheduleStop(voice, when) {
  for (const s of voice.sources) { try { s.stop(when); } catch (_) {} }
  for (const e of voice.extra) { if (e.stop) { try { e.stop(when); } catch (_) {} } }
}

/** Release a sustaining voice and schedule teardown. */
export function releaseVoice(ctx, voice) {
  if (voice._stopped) return;
  const t1 = ctx.currentTime;
  if (voice.subVoices && voice.subVoices.length) {
    let end = 0;
    for (const sub of voice.subVoices) {
      const subEnd = releaseEnvelope(sub.gain.gain, t1, sub.tail.releaseDur);
      scheduleStopSub(sub, subEnd);
      end = Math.max(end, subEnd);
    }
    voice.stopAt = end;
  } else {
    const end = releaseEnvelope(voice.gain.gain, t1, voice.releaseDur);
    voice.stopAt = end;
    scheduleStop(voice, end);
  }
  voice._stopped = true;
}

function scheduleStopSub(sub, when) {
  for (const s of sub.sources) { try { s.stop(when); } catch (_) {} }
  for (const e of sub.extra) { if (e.stop) { try { e.stop(when); } catch (_) {} } }
}

/** Immediately tear down + disconnect a voice's nodes (called after stopAt passes). */
export function disposeVoice(voice) {
  try { voice.gain.disconnect(); } catch (_) {}
  for (const s of voice.sources) { try { s.disconnect(); } catch (_) {} }
  for (const e of voice.extra) { try { e.disconnect(); } catch (_) {} }
  if (voice.nodes) {
    for (const n of voice.nodes) { try { n.disconnect(); } catch (_) {} }
  }
  voice.sources.length = 0;
  voice.extra.length = 0;
}

export { TWO_PI };
