// SEED-SE-01 — every recipe that sounds leaves a caption (INFERENCE_IDEAS PULSE row).
// The bridge is the play() exit: each admitted voice passes through
// emitAdmittedRecipeCaption, which resolves captionForGameplayRecipe once per recipe and
// speaks on the single presentation:caption channel. Semantic-owned receipts, comms-bus
// voices, and UI blips stay silent on that path.
// Drives the REAL play() against a fake Web Audio surface, so the voice is actually
// admitted before the caption claim is checked.
import assert from 'node:assert/strict';
import test from 'node:test';

import { audio } from '../src/audio/audioSystem.js';
import { createBus } from '../src/core/eventBus.js';
import { RECIPES } from '../src/data/audioRecipes.js';
import { captionForGameplayRecipe, isUiBlipRecipe } from '../src/ui/captions.js';

const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

// --- minimal Web Audio surface (the audio-micro-interactions fake) ---
function fakeParam() {
  return {
    value: 0,
    setValueAtTime() {},
    setTargetAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
    setValueCurveAtTime() {},
  };
}
function fakeNode() {
  return {
    gain: fakeParam(),
    frequency: fakeParam(),
    Q: fakeParam(),
    detune: fakeParam(),
    playbackRate: fakeParam(),
    type: '',
    loop: false,
    buffer: null,
    curve: null,
    connect() {},
    disconnect() {},
    start() {},
    stop() {},
  };
}
function fakeCtx(now = 10) {
  return {
    currentTime: now,
    state: 'running',
    sampleRate: 48000,
    destination: {},
    createGain: fakeNode,
    createOscillator: fakeNode,
    createBiquadFilter: fakeNode,
    createBufferSource: fakeNode,
    createWaveShaper: fakeNode,
    createDynamicsCompressor: fakeNode,
    createStereoPanner: fakeNode,
    createBuffer: (channels, len, rate) => ({
      getChannelData: () => new Float32Array(len),
      sampleRate: rate,
    }),
  };
}

function makeHost({ settings, now = 10 } = {}) {
  const bus = createBus();
  const state = {
    mode: 'flight',
    playerId: 'player',
    simTime: 10,
    tick: 5,
    entities: new Map([['player', { id: 'player', pos: { x: 0, z: 0 }, rot: 0 }]]),
    entityList: [],
    input: { actions: {} },
    ui: {},
    settings: settings || { audio: { muted: false, master: 1, sfx: 1, music: 0.5 } },
    audioRuntime: {},
  };
  const host = Object.create(audio);
  host.init({ state, bus, helpers: {} });
  host.rt.ctx = fakeCtx(now);
  host.rt._samples = null; // a unit test never schedules a fetch/decode
  for (const key of ['sfxBus', 'engineBus', 'ambientBus', 'combatBus', 'uiBus', 'commsBus']) {
    host.rt[key] = fakeNode();
  }
  const captions = [];
  bus.on('presentation:caption', (p) => captions.push(p));
  return { host, bus, state, captions };
}

test('a played recipe with no semantic-cue row emits exactly one caption carrying the resolver\'s text', () => {
  const { host, captions } = makeHost();
  const recipe = RECIPE_BY_ID.get('sfx_mining_impact');
  const resolved = captionForGameplayRecipe('sfx_mining_impact', recipe);
  assert.ok(resolved && resolved.text, 'the resolver must cover this recipe');
  const voice = host.play('sfx_mining_impact');
  assert.ok(voice, 'the cue actually sounded');
  assert.equal(captions.length, 1, `expected exactly one caption, got ${JSON.stringify(captions)}`);
  assert.equal(captions[0].text, resolved.text, 'the caption carries the resolver\'s text');
  assert.equal(captions[0].recipeId, 'sfx_mining_impact');
  assert.equal(captions[0].channel, 'cue', 'the bridge speaks on the one caption channel');
});

test('a layered recipe captions once per played recipe, not once per layer node', () => {
  const { host, captions } = makeHost();
  const voice = host.play('sfx_mining_scan_pulse'); // layered: scan_root + scan_air
  assert.ok(voice, 'the layered cue sounded');
  assert.ok(voice.subVoices.length >= 2, 'the recipe really built more than one voice layer');
  assert.equal(captions.length, 1, `a layered recipe captions once, got ${captions.length}`);
  assert.equal(captions[0].text,
    captionForGameplayRecipe('sfx_mining_scan_pulse', RECIPE_BY_ID.get('sfx_mining_scan_pulse')).text);
});

test('a recipe outside the explicit table falls back to the family caption', () => {
  const { host, captions } = makeHost();
  const resolved = captionForGameplayRecipe('sfx_stunt_link', RECIPE_BY_ID.get('sfx_stunt_link'));
  assert.ok(resolved && resolved.authored === false, 'sfx_stunt_link is a family-fallback row');
  const voice = host.play('sfx_stunt_link');
  assert.ok(voice);
  assert.equal(captions.length, 1);
  assert.equal(captions[0].text, resolved.text);
  assert.equal(captions[0].authored, false, 'the emit flags a family-built caption');
});

test('UI blips still emit no caption even though the blip itself plays', () => {
  const { host, captions } = makeHost();
  assert.equal(isUiBlipRecipe('sfx_ui_confirm'), true);
  assert.equal(captionForGameplayRecipe('sfx_ui_confirm', RECIPE_BY_ID.get('sfx_ui_confirm')), null);
  const voice = host.play('sfx_ui_confirm');
  assert.ok(voice, 'the blip still sounds');
  assert.equal(captions.length, 0, `UI blips must not caption, got ${JSON.stringify(captions)}`);
});

test('a receipt-owned recipe does not double-caption through the bridge', () => {
  const { host, captions } = makeHost();
  // sfx_cash_register's semantic owner already captions the sale (SEED-SE-08); the generic
  // bridge must not stack a second caption on the same sound.
  const voice = host.play('sfx_cash_register');
  assert.ok(voice, 'the register still rings');
  assert.equal(captions.length, 0, 'the semantic owner speaks; the bridge stays out of it');
});

test('captions off in accessibility settings silences the bridge', () => {
  const { host, captions } = makeHost({
    settings: { audio: { muted: false }, accessibility: { captions: false } },
  });
  const voice = host.play('sfx_mining_impact');
  assert.ok(voice, 'the sound still plays');
  assert.equal(captions.length, 0, 'no captions when the player switched them off');
});

test('a repeat inside the dedupe window does not stack a second caption', () => {
  const { host, captions } = makeHost();
  host.play('sfx_mining_impact');
  host.play('sfx_mining_impact');
  assert.equal(captions.length, 1, 'a same-recipe burst captions once');
  host.rt.ctx.currentTime += 2; // outside the 1.2 s dedupe window
  host.play('sfx_mining_impact');
  assert.equal(captions.length, 2, 'the window is a debounce, not a latch');
});
