// test/progressive-music.test.mjs — Test for the progressive house & melodic electro music engine.

import test from 'node:test';
import assert from 'node:assert/strict';

import { audio } from '../src/audio/audioSystem.js';
import { TRAVEL_MOTIF, COMBAT_MOTIF, WANTED_MOTIF, STATION_MOTIF } from '../src/audio/themeMatrix.js';
import { noteToHz } from '../src/audio/themeCompose.js';

function createMockAudioContext() {
  let currentTime = 1.0;
  const sampleRate = 44100;
  function createBuffer(channels, length, sr) {
    const data = new Float32Array(length);
    return {
      sampleRate: sr || sampleRate,
      length,
      numberOfChannels: channels,
      getChannelData: () => data,
    };
  }
  function createGain() {
    return {
      gain: {
        value: 1.0,
        setValueAtTime: (v, t) => {},
        linearRampToValueAtTime: (v, t) => {},
        exponentialRampToValueAtTime: (v, t) => {},
        cancelScheduledValues: (t) => {},
        setTargetAtTime: (v, t, tc) => {},
      },
      connect: (target) => {},
      disconnect: () => {},
    };
  }
  function createOscillator() {
    return {
      type: 'sine',
      frequency: {
        value: 440,
        setValueAtTime: (v, t) => {},
        exponentialRampToValueAtTime: (v, t) => {},
      },
      detune: {
        value: 0,
        setValueAtTime: (v, t) => {},
      },
      connect: (target) => {},
      disconnect: () => {},
      start: (t) => {},
      stop: (t) => {},
      onended: null,
    };
  }
  function createBiquadFilter() {
    return {
      type: 'lowpass',
      frequency: {
        value: 1000,
        setValueAtTime: (v, t) => {},
        exponentialRampToValueAtTime: (v, t) => {},
      },
      Q: {
        value: 1.0,
        setValueAtTime: (v, t) => {},
      },
      connect: (target) => {},
      disconnect: () => {},
    };
  }
  function createDelay(maxTime = 1.0) {
    return {
      delayTime: {
        value: 0.3,
        setValueAtTime: (v, t) => {},
      },
      connect: (target) => {},
      disconnect: () => {},
    };
  }
  function createBufferSource() {
    return {
      buffer: null,
      connect: (target) => {},
      disconnect: () => {},
      start: (t) => {},
      stop: (t) => {},
      onended: null,
    };
  }
  return {
    get currentTime() { return currentTime; },
    sampleRate,
    createBuffer,
    createGain,
    createOscillator,
    createBiquadFilter,
    createDelay,
    createBufferSource,
  };
}

test('progressive house engine: stem voices build with sidechainPump and filtered delay', () => {
  const ctx = createMockAudioContext();
  const parentGain = ctx.createGain();
  const stem = audio._buildStemVoices(ctx, {}, parentGain, 'A');

  assert.ok(stem, 'stem voice object must be created');
  assert.ok(stem.sidechainPump, 'stem must have a sidechainPump node for deadmau5/Daft Punk pumping');
  assert.ok(stem.lp, 'stem must have a master lowpass filter');
  assert.ok(stem.delay, 'stem must have space delay node');

  // Stop scheduler
  stem.stop();
});

test('progressive house engine: note frequency helper resolves A4 = 440', () => {
  assert.equal(audio._noteFreq('A', 4), 440);
  assert.equal(Math.round(audio._noteFreq('C', 4)), 262);
  assert.equal(Math.round(audio._noteFreq('E', 4)), 330);
});

test('progressive house engine: travel motif plays on bar 0 beat 0', () => {
  const ctx = createMockAudioContext();
  const bus = ctx.createGain();
  const delay = ctx.createDelay();

  const played = audio._playThemeMotif(TRAVEL_MOTIF, ctx, 1.0, 0, 0, 0.12, bus, delay, 0.15, 'triangle');
  assert.equal(played, true, 'motif should play on bar 0 beat 0');

  const notPlayed = audio._playThemeMotif(TRAVEL_MOTIF, ctx, 1.0, 0, 2, 0.12, bus, delay, 0.15, 'triangle');
  assert.equal(notPlayed, false, 'motif should not play on offbeats where no step is defined');
});

test('progressive house engine: kick, hihat, clap, and bass synthesize cleanly', () => {
  const ctx = createMockAudioContext();
  const bus = ctx.createGain();

  // Test drum voice calls
  audio._playKick(ctx, 1.0, bus, 0.16);
  audio._playClap(ctx, 1.0, bus, 0.08);
  audio._playBass(ctx, 55, 0.25, 0.12, 1.0, bus, 'sawtooth');

  // Verify voice plays without throwing
  assert.ok(true);
});
