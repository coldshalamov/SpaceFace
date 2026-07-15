// A1 The Band — pooled procedural carrier beds.
//
// The deterministic radio system emits presentation intent; this module owns only cosmetic Web
// Audio nodes. A retune replaces one small graph, while signal-strength changes reuse that graph.

export const BAND_BED_PROFILES = Object.freeze({
  civil_service: profile({ waveA: 'square', waveB: 'sine', hzA: 118, hzB: 236, detune: 2,
    tone: 1480, q: 1.2, noise: 0.16, noiseRate: 0.82, pan: -0.08, level: 0.72 }),
  investigative: profile({ waveA: 'triangle', waveB: 'sine', hzA: 93, hzB: 186, detune: -5,
    tone: 960, q: 1.8, noise: 0.38, noiseRate: 0.67, pan: 0.06, level: 0.78 }),
  pirate_roast: profile({ waveA: 'sawtooth', waveB: 'square', hzA: 72, hzB: 145, detune: 11,
    tone: 720, q: 0.9, noise: 0.58, noiseRate: 1.18, pan: 0.12, level: 0.82 }),
  frontier_ballad: profile({ waveA: 'triangle', waveB: 'sine', hzA: 110, hzB: 165, detune: -2,
    tone: 1240, q: 1.4, noise: 0.12, noiseRate: 0.54, pan: -0.12, level: 0.68 }),
  harmonic_drone: profile({ waveA: 'sine', waveB: 'sine', hzA: 82.4, hzB: 123.6, detune: 7,
    tone: 680, q: 2.1, noise: 0.05, noiseRate: 0.4, pan: 0, level: 0.74 }),
  routing_loop: profile({ waveA: 'square', waveB: 'triangle', hzA: 132, hzB: 264, detune: 0,
    tone: 1840, q: 2.5, noise: 0.2, noiseRate: 1.4, pan: 0.08, level: 0.65 }),
  numbers_station: profile({ waveA: 'sine', waveB: 'sine', hzA: 440, hzB: 880, detune: -1,
    tone: 1120, q: 5.5, noise: 0.08, noiseRate: 0.32, pan: -0.04, level: 0.56 }),
  landmark_override: profile({ waveA: 'sine', waveB: 'triangle', hzA: 61.8, hzB: 92.7, detune: 13,
    tone: 540, q: 3.2, noise: 0.26, noiseRate: 0.22, pan: 0, level: 0.7 }),
});

const SILENCE_GAIN = 0.0001;

/**
 * Build the Band's cosmetic carrier runtime over an existing audio bus.
 * The caller owns AudioContext lifecycle and must call destroy when replacing the context.
 */
export function createBandBedRuntime(ctx, destination, options = {}) {
  if (!ctx || !destination) throw new TypeError('Band bed runtime requires an AudioContext and destination.');
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const runtime = {
    ctx,
    destination,
    activeGraph: null,
    lastIntent: null,
    _noiseBuffer: null,

    setIntent(value = {}) {
      const intent = normalizeIntent(value);
      this.lastIntent = intent;
      if (!intent.active || intent.silence || intent.strength <= 0 || !intent.profile) {
        this._stopGraph();
        return null;
      }

      if (!this.activeGraph || this.activeGraph.profileKey !== intent.profileKey) {
        this._stopGraph();
        this.activeGraph = buildGraph(ctx, destination, intent.profileKey, intent.profile,
          this._noiseBuffer || (this._noiseBuffer = makeNoiseBuffer(ctx, random)));
      }
      updateGraph(ctx, this.activeGraph, intent);
      return this.activeGraph;
    },

    _stopGraph() {
      if (!this.activeGraph) return;
      stopGraph(this.activeGraph);
      this.activeGraph = null;
    },

    destroy() {
      this._stopGraph();
      this.lastIntent = null;
      this._noiseBuffer = null;
    },
  };
  return runtime;
}

function normalizeIntent(value) {
  const bed = value && value.bed || {};
  const profileKey = typeof bed.kind === 'string' ? bed.kind : null;
  return {
    active: !!(value && value.active),
    silence: !!(value && value.silence),
    strength: clamp01(finite(value && value.strength, 0)),
    channelId: value && value.channelId || null,
    sourceId: value && value.sourceId || null,
    profileKey,
    profile: profileKey && BAND_BED_PROFILES[profileKey] || null,
  };
}

function buildGraph(ctx, destination, profileKey, cfg, noiseBuffer) {
  const output = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
  output.gain.value = SILENCE_GAIN;
  filter.type = 'bandpass';
  filter.frequency.value = cfg.tone;
  filter.Q.value = cfg.q;
  if (panner) {
    panner.pan.value = cfg.pan;
    filter.connect(panner);
    panner.connect(output);
  } else {
    filter.connect(output);
  }
  output.connect(destination);

  const nodes = [output, filter];
  if (panner) nodes.push(panner);
  const sources = [];
  const addOscillator = (wave, hz, detune, mix) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = hz;
    if (oscillator.detune) oscillator.detune.value = detune;
    gain.gain.value = mix;
    oscillator.connect(gain);
    gain.connect(filter);
    oscillator.start();
    nodes.push(oscillator, gain);
    sources.push(oscillator);
  };
  addOscillator(cfg.waveA, cfg.hzA, 0, 0.54);
  addOscillator(cfg.waveB, cfg.hzB, cfg.detune, 0.26);

  if (noiseBuffer && typeof ctx.createBufferSource === 'function') {
    const noise = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    if (noise.playbackRate) noise.playbackRate.value = cfg.noiseRate;
    noiseGain.gain.value = cfg.noise;
    noise.connect(noiseGain);
    noiseGain.connect(filter);
    noise.start();
    nodes.push(noise, noiseGain);
    sources.push(noise);
  }

  return { profileKey, cfg, output, filter, panner, nodes, sources, stopped: false };
}

function updateGraph(ctx, graph, intent) {
  const strength = clamp01(intent.strength);
  // Carriers remain restrained under the existing ambient mix and become noisier, not simply
  // louder, at weak reception. The sim chooses the copy; this curve is cosmetic only.
  const target = Math.max(SILENCE_GAIN, (0.008 + strength * 0.034) * graph.cfg.level);
  setTarget(graph.output.gain, target, ctx.currentTime, 0.08);
  setTarget(graph.filter.frequency, graph.cfg.tone * (0.72 + strength * 0.38), ctx.currentTime, 0.12);
  if (graph.panner && graph.panner.pan) {
    setTarget(graph.panner.pan, graph.cfg.pan * (0.5 + strength * 0.5), ctx.currentTime, 0.15);
  }
}

function stopGraph(graph) {
  if (!graph || graph.stopped) return;
  graph.stopped = true;
  const when = graph.output && graph.output.context && graph.output.context.currentTime;
  for (const source of graph.sources || []) {
    try { source.stop(Number.isFinite(when) ? when : undefined); } catch (_) {}
  }
  for (const node of graph.nodes || []) {
    try { node.disconnect(); } catch (_) {}
  }
}

function makeNoiseBuffer(ctx, random) {
  if (typeof ctx.createBuffer !== 'function') return null;
  const rate = Math.max(8000, finite(ctx.sampleRate, 48000));
  const buffer = ctx.createBuffer(1, rate, rate);
  const channel = buffer && typeof buffer.getChannelData === 'function' ? buffer.getChannelData(0) : null;
  if (!channel) return buffer;
  let previous = 0;
  for (let i = 0; i < channel.length; i++) {
    const white = random() * 2 - 1;
    previous = previous * 0.74 + white * 0.26;
    channel[i] = previous;
  }
  return buffer;
}

function profile(value) { return Object.freeze({ ...value }); }
function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
function clamp01(value) { return value < 0 ? 0 : value > 1 ? 1 : value; }
function setTarget(param, value, now, timeConstant) {
  if (!param) return;
  try {
    if (typeof param.cancelScheduledValues === 'function') param.cancelScheduledValues(now);
    if (typeof param.setTargetAtTime === 'function') param.setTargetAtTime(value, now, timeConstant);
    else param.value = value;
  } catch (_) { try { param.value = value; } catch (__) {} }
}
