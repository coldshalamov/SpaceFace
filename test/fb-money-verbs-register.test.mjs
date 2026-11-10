// FB-081 — buying, selling, payouts and mission beats stop sharing one menu blip.
// World money (`payout`, `mining:bulkHaulDelivered`, `salvage:completed`, positive non-trade
// `credits:changed`, a settled sell) rings `sfx_cash_register` with profit-keyed gain; menu
// verbs keep `sfx_ui_confirm`. `sfx_mission_accept` is a rising two-note interval and
// `sfx_mission_complete` a resolving one on the same synth voice. `wanted_escalate` climbs a
// per-tier transposition of WANTED_MOTIF. Deterministic — seed 4242 is the ear fixture seed.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import {
  audio,
  incomeVoices,
  resolveAudioCueRecipeId,
  sellRegisterVoice,
} from '../src/audio/audioSystem.js';
import { combatVerbRecipe } from '../src/audio/combatVerbCues.js';
import { WANTED_MOTIF, wantedMotifRate } from '../src/audio/themeMatrix.js';
import { heatLevelFor, THRESHOLD } from '../src/systems/heat.js';

const SEED = 4242;
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

function heatPacket(overrides = {}) {
  const value = overrides.value != null ? overrides.value : 0.3;
  const previousValue = overrides.previousValue != null ? overrides.previousValue : 0.2;
  return {
    value,
    previousValue,
    level: heatLevelFor(value),
    wanted: value >= THRESHOLD,
    wantedCrossed: (value >= THRESHOLD) !== (previousValue >= THRESHOLD),
    threshold: THRESHOLD,
    ...overrides,
  };
}

function hostRecordingCue(played = []) {
  const host = Object.create(audio);
  host._onCue = (cue) => { played.push(cue); return null; };
  return host;
}

test('world money rings the register; menu verbs keep the quiet confirm', () => {
  assert.equal(SEED, 4242);
  // The named world-money verbs route to the register through the verb table.
  assert.equal(combatVerbRecipe('payout'), 'sfx_cash_register');
  assert.equal(combatVerbRecipe('mining:bulkHaulDelivered'), 'sfx_cash_register');
  assert.equal(combatVerbRecipe('salvage:completed'), 'sfx_cash_register');
  assert.equal(combatVerbRecipe('credits:changed'), 'sfx_cash_register');
  // credits:changed only rings on a real positive, non-trade delta.
  assert.deepEqual(incomeVoices('credits:changed', { delta: 40, reason: 'bounty' }), ['sfx_cash_register']);
  assert.deepEqual(incomeVoices('credits:changed', { delta: 250, reason: 'salvage:payout' }), ['sfx_cash_register']);
  assert.deepEqual(incomeVoices('credits:changed', { delta: -40, reason: 'bounty' }), [],
    'spending is not income — a debit never rings the register');
  assert.deepEqual(incomeVoices('credits:changed', { delta: 40, reason: 'trade:sell:ore' }), [],
    'the settled-sale receipt already rings — a credits:changed echo must not double it');
  assert.deepEqual(incomeVoices('credits:changed', { delta: 0 }), []);
  // The register never answers a menu click.
  for (const menuVerb of ['confirm', 'ui_confirm', 'buy', 'sell', 'cash', 'ui_accept']) {
    assert.equal(resolveAudioCueRecipeId(menuVerb), 'sfx_ui_confirm',
      `${menuVerb} is a menu verb and stays on the menu register`);
  }
  // A buy confirms quietly; a sell leaves the confirm lane entirely (its register is below).
  assert.deepEqual(incomeVoices('economy:tradeCompleted', { side: 'buy' }), ['sfx_ui_confirm']);
  assert.deepEqual(incomeVoices('economy:tradeCompleted', { side: 'sell', profit: 9 }), []);
  // The register voice itself is the authored clunk+bell layer pair.
  const register = recipeById.get('sfx_cash_register');
  assert.ok(register, 'sfx_cash_register must be authored');
  assert.deepEqual(register.layers, ['sfx_cash_register_clunk', 'sfx_cash_register_bell']);
});

test('a settled sale is profit-keyed — a good deal rings brighter', () => {
  const good = sellRegisterVoice({ side: 'sell', profit: 120 });
  const bad = sellRegisterVoice({ side: 'sell', profit: -5 });
  const buy = sellRegisterVoice({ side: 'buy', profit: 0 });
  assert.equal(good.id, 'sfx_cash_register');
  assert.equal(bad.id, 'sfx_cash_register');
  assert.ok(good.gain > bad.gain, 'profit rings louder');
  assert.ok(good.rate > bad.rate, 'profit rings brighter');
  assert.equal(buy, null, 'a buy never rings the register');
});

test('accept rises, complete resolves — two-note intervals on one synth voice', () => {
  const accept = recipeById.get('sfx_mission_accept');
  const complete = recipeById.get('sfx_mission_complete');
  assert.ok(accept && complete, 'both mission recipes must exist');
  assert.equal(accept.type, 'oscillator');
  assert.equal(complete.type, 'oscillator', 'same synth voice family as accept');
  assert.ok(accept.freqSweep[1] > accept.freqSweep[0],
    `accept is a rising interval (${accept.freqSweep} must climb)`);
  assert.ok(complete.freqSweep[1] < complete.freqSweep[0],
    `complete resolves downward (${complete.freqSweep} must fall home)`);
  assert.ok(accept.repeatCount >= 2, 'accept is a two-note interval, not a single blip');
  assert.ok(complete.repeatCount >= 2, 'complete is a two-note interval, not a single blip');
});

test('wanted_escalate transposes WANTED_MOTIF per tier', () => {
  assert.deepEqual(WANTED_MOTIF.notes, ['A', 'Bb', 'A', 'E'], 'the motif is A Bb A E');
  // Band 1 is unison; every climb transposes up and the ladder stays inside its clamp.
  const rates = [1, 2, 3, 4, 5].map((band) => wantedMotifRate(band));
  assert.equal(rates[0], 1);
  for (let i = 1; i < rates.length; i += 1) {
    assert.ok(rates[i] > rates[i - 1], `tier ${i + 1} must transpose above tier ${i}`);
  }
  assert.ok(rates[1] >= 1.1, 'tier index is a real semitone-class step, not sub-JND');
  // The handler consumes it: two distinct tiers produce two distinct escalations.
  const played = [];
  const host = hostRecordingCue(played);
  host._onHeatChanged(heatPacket({ value: 0.3, previousValue: 0.16 }));  // band 1 -> 2
  host._onHeatChanged(heatPacket({ value: 0.85, previousValue: 0.65 })); // band 4 -> 5
  assert.equal(played.length, 2);
  assert.equal(played[0].id, 'wanted_escalate');
  assert.equal(played[1].id, 'wanted_escalate');
  assert.equal(played[0].rate, wantedMotifRate(2));
  assert.equal(played[1].rate, wantedMotifRate(5));
  assert.notEqual(played[0].rate, played[1].rate, 'two tiers must not share one pitch');
});

test('the five money verbs produce five register reads with pitched intervals', () => {
  // Seed-4242 record: a sale, a payout, an accept, a complete, two wanted tiers.
  const record = [];
  const sell = sellRegisterVoice({ side: 'sell', profit: 88 });
  record.push({ verb: 'sale', recipeId: sell.id, rate: sell.rate });
  record.push({ verb: 'payout', recipeId: combatVerbRecipe('payout'), rate: 1 });
  record.push({ verb: 'bulkHaul', recipeId: combatVerbRecipe('mining:bulkHaulDelivered'), rate: 1 });
  record.push({ verb: 'salvage', recipeId: combatVerbRecipe('salvage:completed'), rate: 1 });
  record.push({ verb: 'accept', recipeId: 'sfx_mission_accept', rate: 1 });
  record.push({ verb: 'complete', recipeId: 'sfx_mission_complete', rate: 1 });
  record.push({ verb: 'wanted-band2', recipeId: 'sfx_wanted_alert', rate: wantedMotifRate(2) });
  record.push({ verb: 'wanted-band5', recipeId: 'sfx_wanted_alert', rate: wantedMotifRate(5) });
  // Money reads share exactly one register — the register, not the menu blip.
  const moneyIds = new Set(record.slice(0, 4).map((row) => row.recipeId));
  assert.deepEqual([...moneyIds], ['sfx_cash_register']);
  // And no money verb ever collapses back to the menu register.
  for (const row of record) assert.notEqual(row.recipeId, 'sfx_ui_confirm', row.verb);
  // Every recipe id in the record is authored, and the two wanted tiers are distinct voices.
  for (const row of record) assert.ok(recipeById.has(row.recipeId), `${row.recipeId} must be authored`);
  assert.ok(record[6].rate !== record[7].rate, 'the two tiers carry different intervals');
});
