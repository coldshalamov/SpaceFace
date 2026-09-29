// PRO-02: the layout pseudo-locale is a dev tool. A player build's language
// picker does not offer it. An explicit request can still reach the runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IS_DEV } from '../src/core/devMode.js';
import {
  LANGUAGE_OPTIONS,
  SHIPPED_LOCALES,
  currentGameLocale,
  languageOptionsFor,
  resolveStartupLocale,
  setGameLocale,
} from '../src/localization/gameLocalization.js';
import { PSEUDO_LOCALE } from '../src/localization/runtime.js';

function ids(rows) {
  return rows.map((row) => row.id);
}

test('the language picker offers the pseudo-locale only while dev is strictly on', () => {
  const shipped = ids(languageOptionsFor(false));
  const dev = ids(languageOptionsFor(true));
  assert.deepEqual(shipped, [...SHIPPED_LOCALES]);
  assert.equal(shipped.includes(PSEUDO_LOCALE), false);
  assert.deepEqual(dev, [...SHIPPED_LOCALES, PSEUDO_LOCALE]);
  assert.deepEqual(ids(languageOptionsFor(undefined)), shipped);
  for (const id of SHIPPED_LOCALES) {
    assert.equal(shipped.includes(id), true);
    assert.equal(dev.includes(id), true);
  }
  assert.equal(shipped[0], SHIPPED_LOCALES[0]);
  assert.deepEqual(ids(LANGUAGE_OPTIONS), ids(languageOptionsFor(IS_DEV)));
  const src = readFileSync(new URL('../src/localization/gameLocalization.js', import.meta.url), 'utf8');
  assert.match(src, /languageOptionsFor\(IS_DEV\)/);
});

test('an explicit pseudo-locale request still switches the runtime when the picker hides it', () => {
  const previous = currentGameLocale();
  try {
    assert.equal(resolveStartupLocale(`?locale=${PSEUDO_LOCALE}`), PSEUDO_LOCALE);
    assert.equal(setGameLocale(PSEUDO_LOCALE), PSEUDO_LOCALE);
    assert.equal(ids(languageOptionsFor(false)).includes(PSEUDO_LOCALE), false);
  } finally {
    setGameLocale(previous);
  }
});
