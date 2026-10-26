import assert from 'node:assert/strict';
import test from 'node:test';
import { audioCueCaption, captionForGameplayRecipe, formatCaptionText } from '../src/ui/captions.js';
import { emitAdmittedRecipeCaption, localizedCaptionText } from '../src/audio/recipeCaptions.js';
import { createLocalizationRuntime } from '../src/localization/runtime.js';
import { gameLocalization } from '../src/localization/gameLocalization.js';

const position = { x: -50, z: -Math.sqrt(3) * 50 };
const listener = { x: 0, z: 0, rot: 0 };

test('formatter preserves landed English punctuation and absent direction', () => {
  assert.equal(formatCaptionText('Incoming telegraph.', 8), "Incoming telegraph, 8 o'clock.");
  assert.equal(formatCaptionText('Incoming telegraph...  ', 8), "Incoming telegraph, 8 o'clock.");
  for (const clock of [undefined, null, 0]) {
    assert.equal(formatCaptionText('Ship lost.', clock), 'Ship lost.');
  }
  assert.equal(formatCaptionText('Ahead.', 12), "Ahead, 12 o'clock.");
  assert.equal(formatCaptionText('', 8), '');
  assert.equal(formatCaptionText(null, 8), null);
});

test('formatter translates a non-directional base exactly once through the real runtime', () => {
  const runtime = createLocalizationRuntime({
    locale: 'fr-FR',
    catalogs: { 'en-US': { base: 'Incoming telegraph.' }, 'fr-FR': { base: 'Signal entrant.' } },
  });
  const calls = [];
  const translate = (source, values = {}) => {
    calls.push({ source, values });
    return runtime.t('base', values);
  };
  assert.equal(formatCaptionText('Incoming telegraph.', undefined, translate), 'Signal entrant.');
  assert.deepEqual(calls, [{ source: 'Incoming telegraph.', values: {} }]);
  calls.length = 0;
  assert.equal(formatCaptionText('', 8, translate), '');
  assert.equal(calls.length, 0);
});

test('resolver adds raw text and authorship without changing legacy directional text', () => {
  const explicit = captionForGameplayRecipe('sfx_mining_impact', { category: 'mining' }, { position, listener });
  assert.equal(explicit.baseText, 'The rock chips.');
  assert.equal(explicit.authored, true);
  assert.equal(explicit.text, "The rock chips, 8 o'clock.");
  assert.equal(explicit.clock, 8);
  assert.equal(Object.isFrozen(explicit), true);
  const fallback = captionForGameplayRecipe('sfx_caption_contract_unknown', { category: 'cue' });
  assert.equal(fallback.baseText, 'Caption contract unknown.');
  assert.equal(fallback.text, fallback.baseText);
  assert.equal(fallback.authored, false);
  assert.equal(Object.hasOwn(fallback, 'clock'), false);
  assert.equal(captionForGameplayRecipe('sfx_ui_confirm', {}), null);
  assert.equal(audioCueCaption('telegraph', true, { position, listener }).text, "Incoming telegraph, 8 o'clock.");
});

function host() {
  const emissions = [];
  const owner = {
    state: { playerId: 'player', entities: new Map([['player', { pos: listener, rot: 0 }]]),
      simTime: 10, settings: { accessibility: { captions: true } } },
    rt: { ctx: { currentTime: 10 } },
    _emitPresentationCaption(text, opts) {
      assert.ok(text, 'bridge must pass real base text, not undefined metadata');
      emissions.push({ text: localizedCaptionText(text, opts.clock), ...opts });
    },
  };
  return { owner, emissions };
}

test('real recipe bridge emits raw metadata and formats the bearing only once', () => {
  const previous = gameLocalization.locale;
  try {
    gameLocalization.setLocale('en-US');
    const { owner, emissions } = host();
    const resolved = emitAdmittedRecipeCaption(owner, 'sfx_mining_impact', { category: 'mining' }, { position }, 'sfx');
    assert.equal(emissions.length, 1);
    assert.equal(emissions[0].text, resolved.text);
    assert.equal(emissions[0].text, "The rock chips, 8 o'clock.");
    assert.equal(emissions[0].authored, true);
    assert.equal(emissions[0].clock, 8);
    assert.equal(emissions[0].showVisible, true);
    emitAdmittedRecipeCaption(owner, 'sfx_caption_contract_unknown', { category: 'weapon' }, {}, 'combat');
    assert.equal(emissions[1].text, 'Caption contract unknown.');
    assert.equal(emissions[1].authored, false);
    assert.equal(emissions[1].physical, true);
    assert.equal(emissions[1].showVisible, false);
  } finally { gameLocalization.setLocale(previous); }
});

test('real recipe bridge preserves suppression, directional dedupe and clock rewind', () => {
  const { owner, emissions } = host();
  const recipe = { category: 'mining' };
  assert.equal(emitAdmittedRecipeCaption(owner, 'sfx_ui_confirm', recipe, {}, 'ui'), null);
  assert.equal(emitAdmittedRecipeCaption(owner, 'sfx_cash_register', recipe, {}, 'sfx'), null);
  assert.equal(emitAdmittedRecipeCaption(owner, 'sfx_mining_impact', recipe, { captionOwned: true }, 'sfx'), null);
  assert.equal(emitAdmittedRecipeCaption(owner, 'sfx_mining_impact', recipe, {}, 'comms'), null);
  owner.state.settings.accessibility.captions = false;
  assert.equal(emitAdmittedRecipeCaption(owner, 'sfx_mining_impact', recipe, {}, 'sfx'), null);
  owner.state.settings.accessibility.captions = true;
  assert.equal(emissions.length, 0);
  emitAdmittedRecipeCaption(owner, 'sfx_mining_impact', recipe, { position }, 'sfx');
  assert.equal(emitAdmittedRecipeCaption(owner, 'sfx_mining_impact', recipe, { position }, 'sfx'), null);
  emitAdmittedRecipeCaption(owner, 'sfx_mining_impact', recipe, { position: { x: 50, z: 0 } }, 'sfx');
  assert.equal(emissions.length, 2, 'another bearing is not suppressed');
  owner.rt.ctx.currentTime += 2;
  emitAdmittedRecipeCaption(owner, 'sfx_mining_impact', recipe, { position }, 'sfx');
  owner.rt.ctx.currentTime = 1;
  emitAdmittedRecipeCaption(owner, 'sfx_mining_impact', recipe, { position }, 'sfx');
  assert.equal(emissions.length, 4, 'window expiry and clock rewind both admit again');
});

test('real bridge localization uses the runtime pseudo path without raw placeholders', () => {
  const previous = gameLocalization.locale;
  try {
    gameLocalization.setLocale('qps-ploc');
    const runtime = createLocalizationRuntime({ locale: 'qps-ploc' });
    const translate = (source, values = {}) => runtime.t(source, values, () => source);
    const expected = formatCaptionText('The rock chips.', 8, translate);
    const { owner, emissions } = host();
    emitAdmittedRecipeCaption(owner, 'sfx_mining_impact', { category: 'mining' }, { position }, 'sfx');
    assert.equal(emissions[0].text, expected);
    assert.ok(expected.includes('8'));
    assert.ok(expected.includes('⟦'));
    assert.equal(/\{(?:caption|clock)\}/.test(expected), false);
  } finally { gameLocalization.setLocale(previous); }
});
