// AL-SHOW-5 — reviewed first-hour overlays in the four shipped non-English locales
// plus the per-locale glossary files the machine pass applies. Seed 4242.
//
// Pins the row's done-when:
// 1. Every string that fires in the first hour from the row-409 capture inventory
//    (localizableCaptionMessages) has a reviewed overlay in es-ES, fr-FR, de-DE, pt-BR —
//    it resolves through the authored table, never the machine pass.
// 2. Placeholder parity holds on every overlay row, and the per-locale glossary files
//    are what machineTranslate applies.
// 3. Machine-filled strings outside that set stay marked unreviewed (locales keep the
//    honest "(machine preview)" gate).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { localizableCaptionMessages } from '../src/ui/captions.js';
import { FIRST_HOUR_OVERLAY } from '../src/localization/firstHourOverlay.js';
import GLOSSARY_ES from '../src/localization/glossary/es-ES.js';
import GLOSSARY_FR from '../src/localization/glossary/fr-FR.js';
import GLOSSARY_DE from '../src/localization/glossary/de-DE.js';
import GLOSSARY_PT from '../src/localization/glossary/pt-BR.js';
import {
  LOCALE_REVIEWED_GATE,
  localeReadiness,
  machineTranslate,
  translateMessage,
  unreviewedKeys,
} from '../src/localization/pipeline.js';
import { hasPlaceholderParity, interpolate } from '../src/localization/runtime.js';

const SEED = 4242;
const LOCALES = Object.freeze(['es-ES', 'fr-FR', 'de-DE', 'pt-BR']);
const GLOSSARY_FILES = Object.freeze({
  'es-ES': GLOSSARY_ES,
  'fr-FR': GLOSSARY_FR,
  'de-DE': GLOSSARY_DE,
  'pt-BR': GLOSSARY_PT,
});

const BOOT_OVERLAY_STRINGS = Object.freeze([
  'SpaceFace',
  'SPACEFACE',
  'SPACEFACE · FLIGHT SYSTEMS',
  'Initializing systems…',
  'Preparing your next departure',
]);

test(`seed ${SEED}: every capture-inventory caption has a reviewed overlay in all four locales`, () => {
  const captions = localizableCaptionMessages();
  assert.ok(captions.length >= 90, 'the row-409 capture inventory must not shrink');
  for (const english of captions) {
    const row = FIRST_HOUR_OVERLAY[english];
    assert.ok(row, `missing first-hour overlay row for "${english}"`);
    for (const locale of LOCALES) {
      const reviewed = row[locale];
      assert.equal(typeof reviewed, 'string', `${locale} overlay for "${english}"`);
      assert.ok(reviewed.length > 0, `${locale} overlay for "${english}" is empty`);
      // The shipped catalog resolves the authored overlay, never the machine pass.
      assert.equal(translateMessage(locale, english, 'test.key'), reviewed,
        `${locale} translateMessage("${english}")`);
    }
  }
});

test(`seed ${SEED}: no capture-inventory caption stays unreviewed`, () => {
  const captions = new Set(localizableCaptionMessages());
  for (const locale of LOCALES) {
    const leaks = unreviewedKeys(locale, 13000).filter((row) => captions.has(row.english));
    assert.deepEqual(leaks, [], `${locale} still machine-fills ${leaks.length} first-hour captions`);
  }
});

test(`seed ${SEED}: placeholder parity holds on every overlay row`, () => {
  for (const [english, row] of Object.entries(FIRST_HOUR_OVERLAY)) {
    for (const locale of LOCALES) {
      const translated = row[locale];
      assert.equal(hasPlaceholderParity(english, translated), true,
        `${locale} loses placeholders on "${english}"`);
      // The translated template still interpolates to a complete caption.
      const filled = interpolate(translated, { sound: 'Gravity well', clock: 8 });
      assert.ok(!/[{][^}]+[}]/.test(filled), `${locale} leaves a placeholder in "${filled}"`);
    }
  }
  // The bearing template carries a real bearing in every locale.
  assert.equal(translateMessage('de-DE', "{sound}, {clock} o'clock.", 'k'), '{sound}, auf {clock} Uhr.');
  assert.equal(interpolate(translateMessage('fr-FR', "{sound}, {clock} o'clock.", 'k'), { sound: 'Puits de gravité', clock: 8 }),
    'Puits de gravité, à 8 heures.');
});

test(`seed ${SEED}: the per-locale glossary files are what the machine pass applies`, () => {
  for (const locale of LOCALES) {
    const table = GLOSSARY_FILES[locale];
    assert.ok(Object.keys(table).length >= 240, `${locale} glossary must carry the reviewed term set`);
    // The reviewed domain terms ride the machine pass as whole tokens.
    const the = machineTranslate(locale, 'the');
    for (const term of ['hull', 'tether', 'seam', 'warrant', 'ore']) {
      const expected = table[term];
      assert.equal(typeof expected, 'string', `${locale} glossary missing "${term}"`);
      assert.equal(machineTranslate(locale, `the ${term} waits`), `${the} ${expected} waits`);
    }
  }
  // Whole-token law: a glossary term must not rewrite a longer word (AGENTS.md).
  assert.equal(machineTranslate('es-ES', 'payload loading'), 'payload cargando');
  assert.equal(machineTranslate('de-DE', 'payload loading'), 'payload lädt');
});

test(`seed ${SEED}: machine-filled strings outside the reviewed set stay unreviewed`, () => {
  for (const locale of LOCALES) {
    const readiness = localeReadiness(locale);
    assert.equal(readiness.preview, true, `${locale} keeps the honest machine-preview gate`);
    assert.ok(readiness.coverage < LOCALE_REVIEWED_GATE, `${locale} coverage must not fake the gate`);
    assert.ok(readiness.reviewed >= 190, `${locale} reviewed count reflects the landed overlay`);
  }
  assert.equal(localeReadiness('en-US').preview, false, 'en-US stays the reviewed source');
});

test(`seed ${SEED}: boot plate copy reads as written in all four locales`, () => {
  for (const english of BOOT_OVERLAY_STRINGS) {
    for (const locale of LOCALES) {
      const reviewed = FIRST_HOUR_OVERLAY[english][locale];
      assert.equal(translateMessage(locale, english, 'k'), reviewed, `${locale} boot "${english}"`);
    }
  }
  assert.equal(translateMessage('es-ES', 'Initializing systems…', 'k'), 'Inicializando sistemas…');
  assert.equal(translateMessage('de-DE', 'Initializing systems…', 'k'), 'Systeme werden initialisiert…');
});
