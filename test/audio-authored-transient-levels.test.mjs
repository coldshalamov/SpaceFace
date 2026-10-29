import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { playRecipe } from '../src/audio/synth.js';

function param(events) {
  return {
    value: 0,
    cancelScheduledValues() {},
    setValueAtTime(value, time) { events.push(['set', value, time]); },
    linearRampToValueAtTime(value, time) { events.push(['linear', value, time]); },
    exponentialRampToValueAtTime(value, time) { events.push(['exponential', value, time]); },
  };
}

function play(id) {
  const gains = [];
  const node = () => ({ connect() {}, start() {}, stop() {} });
  const ctx = {
    currentTime: 0,
    sampleRate: 1000,
    createGain() {
      const events = [];
      const result = { gain: param(events), events, connect() {} };
      gains.push(result);
      return result;
    },
    createOscillator() {
      return { ...node(), frequency: param([]), detune: param([]) };
    },
    createBufferSource() { return { ...node(), playbackRate: { value: 1 } }; },
    createBiquadFilter() { return { ...node(), frequency: { value: 0 }, Q: { value: 0 } }; },
    createBuffer(_channels, length) {
      const samples = new Float32Array(length);
      return { sampleRate: 1000, getChannelData() { return samples; } };
    },
  };
  const recipe = RECIPES.find((row) => row.id === id);
  assert.ok(recipe, `recipe ${id} exists`);
  playRecipe(ctx, recipe, { connect() {} }, { peakGain: 1 }, {});
  return gains.flatMap((gain) => gain.events
    .filter(([kind]) => kind === 'linear')
    .map(([, value]) => value));
}

test('massline latch authored sub-bass and click gains reach the synthesizer', () => {
  const ramps = play('sfx_tether_latch_wave');
  assert.ok(ramps.includes(0.5), 'sub-bass should use the authored 0.5 peak');
  assert.ok(ramps.includes(0.15), 'transient click should use the authored 0.15 peak');
});

test('mass-seed collapse authored sub-bass gain reaches the synthesizer', () => {
  assert.ok(play('sfx_massseed_collapse').includes(0.5));
});
