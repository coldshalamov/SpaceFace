// PQ-166.02 — five language catalogs ship; store page and bark corpus in all five.
// Machine first for inventory copy; bark register and store copy are a human-quality pass.
// Seed 16602.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { messages as englishExtracted } from '../src/localization/catalogs/en-US.generated.js';
import { messages as esMessages } from '../src/localization/catalogs/es-ES.js';
import { messages as frMessages } from '../src/localization/catalogs/fr-FR.js';
import { messages as deMessages } from '../src/localization/catalogs/de-DE.js';
import { messages as ptMessages } from '../src/localization/catalogs/pt-BR.js';
import {
  CATALOGS,
  LANGUAGE_OPTIONS,
  gameLocalization,
  localizeText,
  setGameLocale,
} from '../src/localization/gameLocalization.js';
import { SHIPPED_LOCALES, catalogFor, fiveCatalogsShip } from '../src/localization/fiveLocales.js';
import { STORE_COPY, STORE_KEYS } from '../src/localization/storeCopy.js';
import { barkMessagesFor, barkParityErrors, barkTextMap } from '../src/localization/barks.js';
import { extractPlaceholders, hasPlaceholderParity } from '../src/localization/runtime.js';
import { LOCALE_FONT_STACKS, fontStackForLocale } from '../src/localization/fonts.js';
import { LOCALIZED_CORE_COPY } from '../src/ui/localizedCoreCopy.js';

const SEED = 16602;
const CATALOG_BY_LOCALE = {
  'en-US': catalogFor('en-US'),
  'es-ES': esMessages,
  'fr-FR': frMessages,
  'de-DE': deMessages,
  'pt-BR': ptMessages,
};

test('five catalogs ship and the picker lists them with English first', () => {
  assert.equal(SEED, 16602);
  assert.deepEqual(SHIPPED_LOCALES, ['en-US', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR']);
  assert.equal(fiveCatalogsShip(), true);
  assert.equal(LANGUAGE_OPTIONS[0].id, 'en-US');
  for (const locale of SHIPPED_LOCALES) {
    assert.ok(LANGUAGE_OPTIONS.some((row) => row.id === locale), `${locale} missing from picker`);
    assert.ok(CATALOGS[locale], `${locale} missing from runtime catalogs`);
    assert.ok(Object.keys(CATALOG_BY_LOCALE[locale]).length > 5000, `${locale} catalog is thin`);
  }
  assert.ok(LANGUAGE_OPTIONS.some((row) => row.id === 'qps-ploc'), 'pseudo-locale stays on the picker');
});

test('store page copy exists in all five languages', () => {
  for (const locale of SHIPPED_LOCALES) {
    const catalog = CATALOG_BY_LOCALE[locale];
    for (const key of STORE_KEYS) {
      assert.equal(typeof catalog[key], 'string', `${locale} missing ${key}`);
      assert.ok(catalog[key].length > 0, `${locale} empty ${key}`);
    }
    if (locale !== 'en-US') {
      assert.notEqual(catalog['store.page.sentence'], STORE_COPY['en-US']['store.page.sentence']);
      assert.notEqual(catalog['store.page.about'], STORE_COPY['en-US']['store.page.about']);
      assert.equal(catalog['store.page.title'], 'SpaceFace');
    }
  }
  const original = gameLocalization.locale;
  try {
    for (const locale of SHIPPED_LOCALES) {
      setGameLocale(locale);
      assert.equal(gameLocalization.t('store.page.sentence'), STORE_COPY[locale]['store.page.sentence']);
      assert.equal(gameLocalization.t('store.title'), STORE_COPY[locale]['store.title']);
    }
  } finally {
    setGameLocale(original);
  }
});

test('bark corpus is register-faithful, not a raw English dump', () => {
  assert.deepEqual(barkParityErrors(), []);
  const en = barkMessagesFor('en-US');
  const keys = Object.keys(en);
  assert.ok(keys.length >= 300, `bark overlay too small: ${keys.length}`);
  for (const locale of ['es-ES', 'fr-FR', 'de-DE', 'pt-BR']) {
    const translated = barkMessagesFor(locale);
    let different = 0;
    for (const key of keys) {
      const source = en[key];
      const row = translated[key];
      assert.equal(typeof row, 'string', `${locale} missing ${key}`);
      assert.equal(hasPlaceholderParity(source, row), true, `${locale} ${key} placeholder mismatch`);
      if (source.length > 12 && row !== source) different += 1;
    }
    assert.ok(different / keys.length > 0.9, `${locale} bark dump looks English (${different}/${keys.length})`);
  }
  const concord = 'Concord Patrol. Stand by for routine transponder verification. Ref 44-C.';
  assert.match(barkTextMap('es-ES').get(concord), /Ref 44-C/);
  assert.match(barkTextMap('de-DE').get(concord), /Ref 44-C/);
  const quiet = barkTextMap('fr-FR').get('Seen.');
  assert.ok(quiet && quiet.split(/\s+/).length <= 3, 'Quiet stays terse in French');
  const vael = 'Vael Consensus. Clause 1: your presence is registered. Await disposition.';
  assert.match(barkTextMap('es-ES').get(vael), /Cláusula 1/);
  assert.match(barkTextMap('pt-BR').get(vael), /Cláusula 1/);
});

test('core UI phrases and placeholders survive in every catalog', () => {
  const original = gameLocalization.locale;
  try {
    for (const locale of SHIPPED_LOCALES) {
      setGameLocale(locale);
      const launch = localizeText('Launch');
      assert.ok(launch.length > 0);
      if (locale !== 'en-US') assert.notEqual(launch, 'Launch');
      const templated = localizeText('Continue: {summary}', { summary: 'Helios' });
      assert.match(templated, /Helios/);
      const mission = localizeText('Mission Log ({key})', { key: 'M' });
      assert.match(mission, /M/);
      assert.equal(hasPlaceholderParity(LOCALIZED_CORE_COPY.continueSummary.label, catalogFor(locale)[
        Object.keys(englishExtracted).find((key) => englishExtracted[key] === LOCALIZED_CORE_COPY.continueSummary.label)
        || 'missing'
      ] || LOCALIZED_CORE_COPY.continueSummary.label), true);
    }
  } finally {
    setGameLocale('en-US');
    assert.equal(gameLocalization.locale, 'en-US');
    gameLocalization.setLocale(original);
  }
});

test('extracted keys keep placeholder parity in every shipped catalog', () => {
  const sampleKeys = Object.keys(englishExtracted).filter((key) => /\{[A-Za-z_]/.test(englishExtracted[key]));
  assert.ok(sampleKeys.length > 50);
  for (const locale of ['es-ES', 'fr-FR', 'de-DE', 'pt-BR']) {
    const catalog = CATALOG_BY_LOCALE[locale];
    let mismatches = 0;
    for (const key of sampleKeys) {
      if (!hasPlaceholderParity(englishExtracted[key], catalog[key])) mismatches += 1;
    }
    assert.equal(mismatches, 0, `${locale} placeholder mismatches: ${mismatches}`);
    assert.deepEqual(extractPlaceholders(catalog[sampleKeys[0]]), extractPlaceholders(englishExtracted[sampleKeys[0]]));
  }
});

test('font fallbacks cover every launch locale including the display face', () => {
  for (const locale of [...SHIPPED_LOCALES, 'qps-ploc']) {
    const stack = fontStackForLocale(locale);
    assert.match(stack.display, /Bricolage Grotesque/);
    assert.match(stack.body, /Instrument Sans/);
    assert.match(stack.body, /Noto Sans|Segoe UI|system-ui/);
    assert.ok(LOCALE_FONT_STACKS[locale]);
  }
  const source = readFileSync(new URL('../src/localization/domBridge.js', import.meta.url), 'utf8');
  assert.match(source, /applyLocaleFonts/);
});
