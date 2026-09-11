/**
 * FH.sound — a WebAudio player for recipes in the game's own shape.
 *
 * Classic script (no modules) so the prototypes open from `file://`. Exposes `window.FH.sound`.
 *
 * The game has no audio files: every sound is a synthesis recipe (`src/data/audioRecipes.js`),
 * and `src/audio/synth.js` plays them. This is the same recipe vocabulary implemented
 * standalone, so a cue authored here plays identically once the recipes are dropped into the
 * game's table — no translation layer, no second format.
 *
 * Two things it refuses to do, because they are floors rather than preferences:
 *   - it never creates an AudioContext until a real user gesture has happened (browsers
 *     suspend one created earlier, and a suspended context silently plays nothing);
 *   - it starts **muted**. The game ships muted and silence is the default (§10).
 */
(function (global) {
  'use strict';

  var FH = (global.FH = global.FH || {});

  var ctx = null;
  var master = null;
  var byId = Object.create(null);
  var muted = true;
  var volume = 0.7;
  var noiseCache = Object.create(null);

  function ensureContext() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    return ctx;
  }

  function load(recipes) {
    var list = Array.isArray(recipes) ? recipes : recipes && recipes.recipes;
    (list || []).forEach(function (r) {
      if (r && r.id) byId[r.id] = r;
    });
    return Object.keys(byId).length;
  }

  /** Noise buffers are cached per colour: allocating one per cue is the classic UI audio leak. */
  function noiseBuffer(colour) {
    if (noiseCache[colour]) return noiseCache[colour];
    var len = Math.floor(ctx.sampleRate * 2);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    if (colour === 'pink') {
      var b0 = 0, b1 = 0, b2 = 0;
      for (var i = 0; i < len; i++) {
        var w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
      }
    } else if (colour === 'brown') {
      var last = 0;
      for (var j = 0; j < len; j++) {
        var wn = Math.random() * 2 - 1;
        last = (last + 0.02 * wn) / 1.02;
        d[j] = last * 3.2;
      }
    } else {
      for (var k = 0; k < len; k++) d[k] = Math.random() * 2 - 1;
    }
    noiseCache[colour] = buf;
    return buf;
  }

  function distortionCurve(amount, kind) {
    var n = 1024;
    var curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      curve[i] = kind === 'softclip'
        ? Math.max(-1, Math.min(1, x * (1 + amount * 2)))
        : Math.tanh(x * (1 + amount * 6));
    }
    return curve;
  }

  function envelopeDuration(r) {
    var e = r.gainEnvelope || {};
    return (e.attack || 0) + (e.sustain || 0) + (e.release || 0);
  }

  /** Total wall time a cue occupies, including any layer that starts late. */
  function duration(id) {
    var r = byId[id];
    if (!r) return 0;
    if (r.type === 'layered') {
      var longest = 0;
      (r.layers || []).forEach(function (lid) {
        var sub = byId[lid];
        if (!sub) return;
        longest = Math.max(longest, (sub.startOffsetS || 0) + envelopeDuration(sub));
      });
      return Math.max(longest, envelopeDuration(r));
    }
    return envelopeDuration(r);
  }

  function buildVoice(r, dest, when, gainMult) {
    var e = r.gainEnvelope || { attack: 0.005, sustain: 0, release: 0.1 };
    var t0 = when + (r.startOffsetS || 0);
    var peak = (r.gainMult == null ? 1 : r.gainMult) * (gainMult == null ? 1 : gainMult);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + Math.max(0.0005, e.attack || 0.005));
    var holdEnd = t0 + (e.attack || 0.005) + (e.sustain || 0);
    gain.gain.setValueAtTime(Math.max(0.0001, peak), holdEnd);
    gain.gain.exponentialRampToValueAtTime(0.0001, holdEnd + Math.max(0.01, e.release || 0.1));

    var tail = gain;
    if (r.distortionAmount) {
      var shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(r.distortionAmount, r.distortionCurve || 'tanh');
      shaper.oversample = '2x';
      gain.connect(shaper);
      tail = shaper;
    }
    if (r.filterType) {
      var f = ctx.createBiquadFilter();
      f.type = r.filterType;
      f.frequency.setValueAtTime(r.filterSweep ? r.filterSweep[0] : (r.filterFreq || 1000), t0);
      if (r.filterSweep) {
        f.frequency.exponentialRampToValueAtTime(
          Math.max(20, r.filterSweep[1]), t0 + (r.sweepTimeS || 0.2));
      }
      f.Q.value = r.filterQ == null ? 1 : r.filterQ;
      tail.connect(f);
      tail = f;
    }
    tail.connect(dest);

    var stop = holdEnd + (e.release || 0.1) + 0.05;
    var sources = [];

    if (r.type === 'noise_filtered' || r.type === 'continuous_noise') {
      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer(r.noiseColor || 'white');
      src.loop = true;
      src.connect(gain);
      src.start(t0);
      src.stop(stop);
      sources.push(src);
    } else {
      var osc = ctx.createOscillator();
      osc.type = r.wave || 'sine';
      var f0 = r.freqSweep ? r.freqSweep[0] : (r.baseFreq || 220);
      osc.frequency.setValueAtTime(f0, t0);
      if (r.freqSweep) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, r.freqSweep[1]), t0 + (r.sweepTimeS || 0.2));
      }
      osc.connect(gain);
      osc.start(t0);
      osc.stop(stop);
      sources.push(osc);
      if (r.lfoRate && r.lfoDepth) {
        var lfo = ctx.createOscillator();
        var lg = ctx.createGain();
        lfo.frequency.value = r.lfoRate;
        lg.gain.value = f0 * r.lfoDepth;
        lfo.connect(lg).connect(osc.frequency);
        lfo.start(t0);
        lfo.stop(stop);
        sources.push(lfo);
      }
    }

    if (r.subBass) {
      var sb = r.subBass;
      var sosc = ctx.createOscillator();
      var sgain = ctx.createGain();
      sosc.type = 'sine';
      sosc.frequency.setValueAtTime(sb.startFreq, t0);
      sosc.frequency.exponentialRampToValueAtTime(Math.max(20, sb.endFreq), t0 + sb.dur);
      sgain.gain.setValueAtTime(0.0001, t0);
      sgain.gain.exponentialRampToValueAtTime(Math.max(0.0001, (sb.gain || 0.4) * peak),
                                              t0 + 0.008);
      sgain.gain.exponentialRampToValueAtTime(0.0001, t0 + sb.dur);
      sosc.connect(sgain).connect(dest);
      sosc.start(t0);
      sosc.stop(t0 + sb.dur + 0.05);
      sources.push(sosc);
    }
    return sources;
  }

  /**
   * play — fire a cue by id. Returns a handle with `stop()`.
   * Silently does nothing when muted, when the id is unknown, or before a user gesture.
   */
  function play(id, opts) {
    opts = opts || {};
    if (muted && !opts.force) return { stop: function () {} };
    var r = byId[id];
    if (!r) return { stop: function () {} };
    if (!ensureContext()) return { stop: function () {} };
    if (ctx.state === 'suspended') ctx.resume();

    var when = ctx.currentTime + (opts.delay || 0);
    var bus = ctx.createGain();
    bus.gain.value = opts.gain == null ? 1 : opts.gain;
    bus.connect(master);

    var sources = [];
    if (r.type === 'layered') {
      (r.layers || []).forEach(function (lid) {
        var sub = byId[lid];
        if (sub) sources = sources.concat(buildVoice(sub, bus, when, r.gainMult));
      });
    } else {
      sources = buildVoice(r, bus, when, 1);
    }
    var repeats = Math.max(0, r.repeatCount || 0);
    for (var i = 1; i <= repeats; i++) {
      sources = sources.concat(
        buildVoice(r, bus, when + i * (r.repeatIntervalS || 0.1), 1));
    }
    return {
      stop: function () {
        sources.forEach(function (s) { try { s.stop(); } catch (e) { /* already stopped */ } });
        try { bus.disconnect(); } catch (e) { /* detached */ }
      },
    };
  }

  function setMuted(on) {
    muted = !!on;
    if (master) master.gain.value = muted ? 0 : volume;
    return muted;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master && !muted) master.gain.value = volume;
    return volume;
  }

  /** Bind the kit's cues to the DOM events that should fire them. */
  function attach(root) {
    root = root || document;
    root.addEventListener('pointerdown', function (e) {
      var el = e.target.closest && e.target.closest('[data-fh-cue]');
      if (el) play(el.getAttribute('data-fh-cue') || 'ui_key_press');
    });
    root.addEventListener('focusin', function (e) {
      var el = e.target.closest && e.target.closest('[data-fh-focus-cue]');
      if (el) play(el.getAttribute('data-fh-focus-cue') || 'ui_legend_on');
    });
    return root;
  }

  FH.sound = {
    load: load,
    play: play,
    duration: duration,
    ids: function () { return Object.keys(byId); },
    setMuted: setMuted,
    isMuted: function () { return muted; },
    setVolume: setVolume,
    attach: attach,
    context: function () { return ctx; },
  };
})(typeof window !== 'undefined' ? window : this);
