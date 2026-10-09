// FB-135 — fuel has a voice before it is gone. Crossing under reserve speaks a low, slow
// `sfx_fuel_reserve` bed on the first frame only; refueling stops the bed outright (a stop,
// not a fade) and lifts the thinned mix. `fuel:empty` plays the authored `sfx_fuel_empty`
// sting once per empty state — never the menu `sfx_ui_alert`, never a per-tick beep.
// Deterministic — seed 4242 is the ear fixture seed.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { audio, FUEL_THIN_GAIN } from '../src/audio/audioSystem.js';
import { fuelReserveWarning, FUEL_LOW_FRACTION } from '../src/ui/fuelReserveWarning.js';

const SEED = 4242;
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

function fuelHost({ current = 160, max = 200 } = {}) {
  const played = [];
  const started = [];
  const ended = [];
  const captions = [];
  const host = Object.create(audio);
  host.rt = { loops: {}, ctx: { currentTime: 0 }, _fuelThin: 1 };
  host.state = { fuel: { current, max }, playerId: 'p', entities: new Map() };
  host.play = (id, opts = {}) => { played.push({ id, ...opts }); return { id }; };
  host._emitPresentationCaption = (text, opts) => captions.push({ text, ...opts });
  host._startLoopVoice = (id) => {
    started.push(id);
    return { id, gain: { gain: { value: 0.4 }, value: 0.4 } };
  };
  host._endLoopVoice = (voice) => ended.push(voice && voice.id);
  return { host, played, started, ended, captions };
}

test('the reserve edge speaks once and only a refuel rearms it', () => {
  assert.equal(SEED, 4242);
  assert.equal(FUEL_LOW_FRACTION, 0.25, 'reserve is the bottom quarter of the tank');
  // Pure fraction edges: the first frame under speaks, the rest of the slide stays quiet.
  let prev = null;
  prev = fuelReserveWarning(prev, 0.6, true);
  assert.equal(prev.speak, false);
  prev = fuelReserveWarning(prev, 0.24, true);
  assert.equal(prev.speak, true, 'the downward crossing is the speech frame');
  assert.equal(prev.low, true);
  prev = fuelReserveWarning(prev, 0.2, true);
  assert.equal(prev.speak, false, 'still under reserve: no second speech');
  prev = fuelReserveWarning(prev, 0.1, true);
  assert.equal(prev.speak, false);
  // Refueling clears — and the NEXT downward crossing speaks again.
  prev = fuelReserveWarning(prev, 0.7, true);
  assert.equal(prev.clear, true);
  prev = fuelReserveWarning(prev, 0.2, true);
  assert.equal(prev.speak, true, 'a fresh crossing after refuel speaks again');
  // Strict threshold: exactly a quarter tank is still above reserve.
  const exact = fuelReserveWarning({ low: false }, FUEL_LOW_FRACTION, true);
  assert.equal(exact.low, false, 'exactly 25% is not under reserve');
  // An unarmed first frame lights the lamp silently — a save loaded already low never blurts.
  const cold = fuelReserveWarning(null, 0.2, false);
  assert.equal(cold.low, true);
  assert.equal(cold.speak, false, 'the baseline frame arms without speaking');
});

test('the reserve bed starts on the crossing, stops on refuel, and thins the mix', () => {
  const { host, started, ended } = fuelHost();
  // The first update establishes the baseline above reserve (armed, silent).
  host._updateFuelVoice();
  assert.equal(started.length, 0);
  // First frame under reserve: the bed begins exactly once.
  host.state.fuel.current = 40;
  host._updateFuelVoice();
  assert.deepEqual(started, ['sfx_fuel_reserve'], 'the bed starts on the crossing frame');
  // Still under: no re-start, no per-tick voice.
  host.state.fuel.current = 30;
  host._updateFuelVoice();
  host.state.fuel.current = 18;
  host._updateFuelVoice();
  assert.equal(started.length, 1, 'no re-start while the tank stays under reserve');
  assert.equal(ended.length, 0);
  // Refuel: the bed stops outright.
  host.state.fuel.current = 120;
  host._updateFuelVoice();
  assert.deepEqual(ended, ['sfx_fuel_reserve'], 'refuel ends the loop voice — a stop, not a fade');
  assert.equal(host.rt.loops.fuelReserve, undefined, 'the loop slot is released');
  // The edge is rearmed: dipping under again speaks the bed again.
  host.state.fuel.current = 40;
  host._updateFuelVoice();
  assert.equal(started.length, 2, 'a fresh crossing after refuel starts the bed again');
});

test('fuel:empty plays the authored sting once per empty state — never the menu alert', () => {
  const { host, played, captions } = fuelHost({ current: 0 });
  host._onFuelEmpty();
  assert.deepEqual(played.map((row) => row.id), ['sfx_fuel_empty']);
  assert.ok(played[0].critical === true, 'the empty sting is a critical voice');
  assert.ok(!played.some((row) => row.id === 'sfx_ui_alert'), 'empty is not the menu alert');
  assert.ok(captions.some((c) => c.channel === 'fuel'), 'the empty beat still captions');
  assert.equal(host.rt._fuelThin, FUEL_THIN_GAIN, 'empty keeps the mix thin');
  // A second empty packet in the same state is silent — the sting is per-state.
  host._onFuelEmpty();
  assert.equal(played.filter((row) => row.id === 'sfx_fuel_empty').length, 1,
    'the sting fires once per empty state');
  // Refuel clears the latch: the next empty speaks again.
  host.state.fuel.current = 150;
  host._updateFuelVoice();
  assert.equal(host.rt._fuelThin, 1, 'refuel lifts the thinned mix');
  assert.equal(host.rt._fuelEmptyStung, false, 'refuel rearms the sting');
  host.state.fuel.current = 0;
  host._onFuelEmpty();
  assert.equal(played.filter((row) => row.id === 'sfx_fuel_empty').length, 2);
});

test('the recipes are authored voices, not borrowed UI rows', () => {
  const bed = recipeById.get('sfx_fuel_reserve');
  const sting = recipeById.get('sfx_fuel_empty');
  assert.ok(bed, 'sfx_fuel_reserve must be authored');
  assert.equal(bed.type, 'continuous_oscillator', 'the reserve voice is a loop, not a beep');
  assert.ok(bed.baseFreq <= 80, `the bed sits low (${bed.baseFreq} Hz)`);
  assert.ok(sting, 'sfx_fuel_empty must be authored');
  assert.notEqual(sting.id, 'sfx_ui_alert');
  assert.equal(sting.type, 'oscillator', 'the sting is a one-shot body, not a loop');
  assert.ok(sting.freqSweep[1] < sting.freqSweep[0],
    'the sting falls — the tank giving out, not a flat beep');
  // The fuel rows never borrow the menu register.
  for (const id of ['sfx_fuel_reserve', 'sfx_fuel_empty']) {
    assert.ok(!id.startsWith('sfx_ui_'), `${id} must not be a UI recipe`);
  }
});
