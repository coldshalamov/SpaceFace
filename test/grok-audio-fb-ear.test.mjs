// Row 256 — FB-078 kill ladder, FB-079 continuous voices, FB-081 money and motif,
// FB-082 stunt hush, FB-083 wider duck, FB-122 sector beds, FB-135 fuel, FB-123 captions.
// Seed 4242 is the fixture seed the ear plans name. These ears are deterministic.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import {
  alertCueOwnsAudio,
  audio,
  FUEL_THIN_GAIN,
  HUSH,
  incomeVoices,
  killVoiceAdmitted,
  KILL_ADMIT_MS,
  resolveCruiseLoopEdge,
  resolveKillMassVoice,
  sellRegisterVoice,
  STUNT_HUSH_GAP_MS,
  admitStuntHush,
} from '../src/audio/audioSystem.js';
import { resolveTetherTone } from '../src/audio/masslineInstrument.js';
import { FIELD_LOOP_CAP, FIELD_LOOP_RECIPES } from '../src/audio/fieldAudio.js';
import {
  isPriorityDuckTarget,
  PRIORITY_DUCK_TARGETS,
} from '../src/audio/cuePriorityBus.js';
import {
  mixAudibleStemWeights,
  resolveThemeMatrix,
  SECTOR_BEDS,
  wantedMotifRate,
} from '../src/audio/themeMatrix.js';
import { captionForGameplayRecipe, isUiBlipRecipe } from '../src/ui/captions.js';
import { combatVerbRecipe } from '../src/audio/combatVerbCues.js';

const SEED = 4242;

test('FB-078 kill mass picks a body, adds a confirm, and does not hush a light hull', () => {
  assert.equal(SEED, 4242);
  const light = resolveKillMassVoice({ mass: 16, killedByPlayer: true, type: 'ship' });
  const mid = resolveKillMassVoice({ mass: 48, killedByPlayer: true, type: 'ship' });
  const heavy = resolveKillMassVoice({ mass: 200, killedByPlayer: true, type: 'ship' });
  const capital = resolveKillMassVoice({ victimClass: 'capital', killedByPlayer: true });
  assert.equal(light.recipeId, 'sfx_kill_sine');
  assert.equal(mid.recipeId, 'sfx.killSmall');
  assert.equal(heavy.recipeId, 'sfx_kill_noise');
  assert.notEqual(light.recipeId, heavy.recipeId);
  assert.ok(light.rate > heavy.rate, 'a light hull speaks higher');
  assert.equal(light.confirmRecipeId, 'sfx_kill_confirm');
  assert.notEqual(light.confirmRecipeId, light.recipeId);
  assert.equal(light.hush, null);
  assert.equal(capital.hush, 'capital');
  assert.equal(capital.recipeId, 'sfx.killCapital');
  const book = Object.create(null);
  assert.equal(killVoiceAdmitted(book, 7, 1000), true);
  assert.equal(killVoiceAdmitted(book, 7, 1000 + KILL_ADMIT_MS - 1), false);
  assert.equal(killVoiceAdmitted(book, 8, 1000), true);
});

test('FB-079 cruise, fields, and a towed mass are continuous and stop when the state ends', () => {
  assert.equal(SEED, 4242);
  const on = resolveCruiseLoopEdge({ engaged: true });
  const off = resolveCruiseLoopEdge({ dropped: true });
  assert.equal(on.active, true);
  assert.equal(on.stop, false);
  assert.equal(off.stop, true);
  assert.equal(off.active, false);
  assert.equal(on.recipeId, 'sfx.cruiseEngaged');
  const cruise = RECIPES.find((row) => row.id === 'sfx.cruiseEngaged');
  assert.equal(cruise.type, 'continuous_oscillator');

  const kinds = Object.keys(FIELD_LOOP_RECIPES);
  assert.ok(kinds.length >= 3);
  assert.ok(FIELD_LOOP_CAP <= 6);
  for (const kind of kinds) {
    const recipe = RECIPES.find((row) => row.id === FIELD_LOOP_RECIPES[kind].recipeId);
    assert.ok(recipe, kind);
    assert.match(recipe.type, /^continuous/);
  }

  const slack = resolveTetherTone({ tether: { phase: 'slack', load: 0 }, towMass: 80 });
  assert.equal(slack.playing, false);
  const empty = resolveTetherTone({ tether: { phase: 'loaded', load: 0, active: true } });
  const towing = resolveTetherTone({ tether: { phase: 'loaded', load: 0, active: true }, towMass: 80 });
  assert.ok(towing.gain > empty.gain, 'tow mass lifts the tone');
  assert.ok(towing.hz > empty.hz);

  const host = Object.create(audio);
  host._endLoopVoice = () => {};
  host.rt = { loops: { cruise: { recipeId: on.recipeId } }, _wantCruise: true };
  host._stopCruiseLoop();
  assert.equal(host.rt.loops.cruise, undefined, 'drop ends the loop on that tick');
});

test('FB-081 income rings, missions resolve downward, and heat climbs by two semitones', () => {
  assert.equal(SEED, 4242);
  assert.deepEqual(incomeVoices('credits:changed', { delta: 40, reason: 'bounty' }), ['sfx_cash_register']);
  assert.deepEqual(incomeVoices('credits:changed', { delta: 40, reason: 'trade:sell:ore' }), []);
  assert.deepEqual(incomeVoices('economy:tradeCompleted', { kind: 'buy' }), ['sfx_ui_confirm']);
  assert.deepEqual(incomeVoices('economy:tradeCompleted', { side: 'sell', profit: 12 }), []);
  const sell = sellRegisterVoice({ side: 'sell', profit: 12 });
  assert.equal(sell.id, 'sfx_cash_register');
  assert.equal(combatVerbRecipe('payout'), 'sfx_cash_register');
  assert.equal(combatVerbRecipe('mining:bulkHaulDelivered'), 'sfx_cash_register');
  assert.equal(combatVerbRecipe('salvage:completed'), 'sfx_cash_register');

  const accept = RECIPES.find((row) => row.id === 'sfx_mission_accept');
  const complete = RECIPES.find((row) => row.id === 'sfx_mission_complete');
  assert.ok(accept.freqSweep[0] < accept.freqSweep[1], 'accept rises');
  assert.ok(complete.freqSweep[0] > complete.freqSweep[1], 'complete resolves down');
  assert.equal(accept.repeatCount >= 2, true);

  const rates = [1, 2, 3, 4, 5].map((band) => wantedMotifRate(band));
  assert.equal(rates[0], 1);
  for (let i = 1; i < rates.length; i++) assert.ok(rates[i] > rates[i - 1]);
  assert.ok(rates[4] >= 1.4 && rates[4] <= 1.6);

  const played = [];
  const host = Object.create(audio);
  host._onCue = (cue) => { played.push(cue); };
  host._onHeatChanged({ value: 0.85, previousValue: 0.65, level: 5, previousLevel: 4, wanted: true });
  assert.equal(played.length, 1);
  assert.equal(played[0].rate, rates[4]);
});

test('FB-082 a razor release and the slingshot apex hush; a clean let-go does not', () => {
  assert.equal(SEED, 4242);
  assert.equal(HUSH.stunt.depth, 0.07);
  assert.ok(HUSH.stunt.attackS >= 0.3);
  assert.equal(STUNT_HUSH_GAP_MS, 6000);
  assert.equal(admitStuntHush({ classification: 'clean', nowMs: 0 }).play, false);
  assert.equal(admitStuntHush({ classification: 'razor', nowMs: 0 }).play, true);
  assert.equal(admitStuntHush({ classification: 'razor', nowMs: 1000, lastMs: 0 }).play, false);
  assert.equal(admitStuntHush({ apex: true, cueId: 'massline.slingshotApex', nowMs: 7000, lastMs: 0 }).play, true);

  const kinds = [];
  const host = Object.create(audio);
  host._triggerHush = (input) => { kinds.push(input.kind); };
  host.rt = {};
  host.state = { simTime: 1 };
  host._maybeStuntHush({ classification: 'good' });
  host._maybeStuntHush({ classification: 'razor' });
  host.state.simTime = 2;
  host._maybeStuntHush({ classification: 'razor' });
  host.state.simTime = 8;
  host._onCue({ id: 'massline.slingshotApex' });
  assert.deepEqual(kinds, ['stunt', 'stunt']);
});

test('FB-083 sustained world loops duck and music, comms, and ui do not', () => {
  assert.equal(SEED, 4242);
  assert.deepEqual(PRIORITY_DUCK_TARGETS, ['weaponLoop', 'engineLoop']);
  assert.equal(isPriorityDuckTarget({ busName: 'ambient', loop: true, role: 'ambient' }), true);
  assert.equal(isPriorityDuckTarget({ busName: 'engine', loop: true }), true);
  assert.equal(isPriorityDuckTarget({ busName: 'sfx', loop: true }), true);
  assert.equal(isPriorityDuckTarget({ busName: 'combat', category: 'weapon', loop: false }), false);
  assert.equal(isPriorityDuckTarget({ busName: 'music', loop: true }), false);
  assert.equal(isPriorityDuckTarget({ busName: 'comms', loop: true }), false);
  assert.equal(isPriorityDuckTarget({ busName: 'ui', loop: true }), false);
  assert.equal(isPriorityDuckTarget('music'), false);
  assert.equal(isPriorityDuckTarget({ critical: true, busName: 'ambient', loop: true }), false);
});

test('FB-122 Helios stays harmonic and Sker stays percussive without rewriting state weights', () => {
  assert.equal(SEED, 4242);
  const helios = resolveThemeMatrix({ sectorId: 'sector_helios_prime', inCombat: true, threat: 0.8 });
  const sker = resolveThemeMatrix({ sectorId: 'sector_sker_haven', inCombat: true, threat: 0.8 });
  const belt = resolveThemeMatrix({ sectorId: 'sector_ceres_belt', inCombat: true, threat: 0.8 });
  assert.equal(helios.stemWeights.C, 1);
  assert.equal(sker.stemWeights.C, helios.stemWeights.C);
  assert.equal(sker.stemWeights.B, helios.stemWeights.B);
  assert.ok(helios.audibleStemWeights.B < helios.stemWeights.B, 'Helios pulls the percussive stem down');
  assert.ok(helios.audibleStemWeights.A > helios.audibleStemWeights.B);
  assert.ok(sker.audibleStemWeights.A < sker.stemWeights.A, 'Sker pulls the harmonic stem down');
  assert.ok(sker.audibleStemWeights.B > sker.audibleStemWeights.A);
  assert.deepEqual(belt.audibleStemWeights, belt.stemWeights);
  assert.equal(SECTOR_BEDS.sector_helios_prime.signature.includes('stem'), false);
  assert.deepEqual(
    mixAudibleStemWeights({ A: 1, B: 1, C: 1, D: 1 }, { A: 1, B: 1, C: 1, D: 1 }),
    { A: 1, B: 1, C: 1, D: 1 },
  );
});

test('FB-135 fuel reserve is a bed and empty is one sting, not a menu beep', () => {
  assert.equal(SEED, 4242);
  assert.equal(alertCueOwnsAudio({ key: 'fuel-low' }), false);
  assert.equal(alertCueOwnsAudio({ key: 'fuel' }), false);
  const reserve = RECIPES.find((row) => row.id === 'sfx_fuel_reserve');
  const empty = RECIPES.find((row) => row.id === 'sfx_fuel_empty');
  assert.match(reserve.type, /^continuous/);
  assert.equal(empty.type, 'oscillator');
  assert.ok(empty.freqSweep[0] > empty.freqSweep[1]);

  const played = [];
  const host = Object.create(audio);
  host.play = (id) => { played.push(id); return { id }; };
  host._emitPresentationCaption = () => {};
  host._startLoopVoice = (id) => ({ recipeId: id, gain: { gain: {} }, _baseGain: 0.4 });
  host._endLoopVoice = () => {};
  host.rt = { loops: {} };
  host.state = { fuel: { current: 80, max: 100 }, simTime: 1 };
  host._updateFuelVoice();
  assert.equal(host.rt.loops.fuelReserve, undefined, 'arming the gauge does not speak');
  host.state.fuel.current = 20;
  host._updateFuelVoice();
  assert.equal(host.rt.loops.fuelReserve.recipeId, 'sfx_fuel_reserve');
  host._onFuelEmpty();
  host._onFuelEmpty();
  assert.deepEqual(played, ['sfx_fuel_empty']);
  assert.equal(host.rt._fuelThin, FUEL_THIN_GAIN);
  host.state.fuel.current = 90;
  host._updateFuelVoice();
  assert.equal(host.rt.loops.fuelReserve, undefined);
  assert.equal(host.rt._fuelThin, 1);
});

test('FB-123 gameplay recipes caption and menu blips do not', () => {
  assert.equal(SEED, 4242);
  assert.equal(isUiBlipRecipe('sfx_ui_confirm'), true);
  assert.equal(captionForGameplayRecipe('sfx_ui_confirm'), null);
  assert.equal(captionForGameplayRecipe('sfx_ui_error'), null);
  let gameplay = 0;
  for (const recipe of RECIPES) {
    if (isUiBlipRecipe(recipe.id)) continue;
    const row = captionForGameplayRecipe(recipe.id, recipe);
    assert.ok(row && row.text, recipe.id);
    gameplay += 1;
  }
  assert.ok(gameplay > 40);
  assert.equal(captionForGameplayRecipe('sfx_refusal_empty').text, 'No ammunition.');
  assert.equal(captionForGameplayRecipe('sfx_fuel_empty').text, 'Fuel empty.');
});
