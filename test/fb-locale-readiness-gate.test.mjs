// FB-107 (row 261) — honest locale labels, measured.
//
// A machine-filled locale says so. The four non-English shipped catalogs machine-generate at
// import time (pipeline.js machineTranslate); a string counts as reviewed only when it resolves
// from an authored table (PHRASES, reviewed barks, reviewed store copy). While reviewed coverage
// stands under the gate, the picker label reads "(machine preview)"; the label is data, so a
// reviewed batch that lifts coverage over the gate drops the label with no code change.
// PRO-02's landed law — the pseudo-locale is a dev tool the picker hides — is re-pinned here
// beside the label law it shares the rows with.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SHIPPED_LOCALES,
  languageOptionsFor,
  localeReadiness,
} from '../src/localization/gameLocalization.js';
import { LOCALE_REVIEWED_GATE, machineTranslate } from '../src/localization/pipeline.js';
import { PSEUDO_LOCALE } from '../src/localization/runtime.js';

const PREVIEW_SUFFIX = ' (machine preview)';
const MACHINE_LOCALES = ['es-ES', 'fr-FR', 'de-DE', 'pt-BR'];

test('the source locale is fully reviewed and never labelled a preview', () => {
  const readiness = localeReadiness('en-US');
  assert.equal(readiness.locale, 'en-US');
  assert.equal(readiness.total, readiness.reviewed);
  assert.equal(readiness.coverage, 1);
  assert.equal(readiness.preview, false);
  const english = languageOptionsFor(false).find((row) => row.id === 'en-US');
  assert.equal(english.label.includes(PREVIEW_SUFFIX), false);
});

test('today es-ES is machine-filled and its picker label honestly says so', () => {
  const readiness = localeReadiness('es-ES');
  assert.equal(readiness.preview, true, 'measured reviewed coverage stands under the gate');
  assert.ok(readiness.coverage < LOCALE_REVIEWED_GATE);
  const rows = languageOptionsFor(false);
  const spanish = rows.find((row) => row.id === 'es-ES');
  assert.ok(spanish.label.startsWith('Español'));
  assert.ok(spanish.label.endsWith(PREVIEW_SUFFIX));
  // Every machine-filled locale carries the suffix today; the ids are untouched.
  for (const id of MACHINE_LOCALES) {
    const row = rows.find((candidate) => candidate.id === id);
    assert.ok(row.label.endsWith(PREVIEW_SUFFIX), `${id} reads as a machine preview`);
  }
  assert.deepEqual(rows.map((row) => row.id), [...SHIPPED_LOCALES]);
});

test('the gate is the measured data, and a fully-reviewed fixture drops the label by itself', () => {
  // The label rule both ways, over the same rows the picker renders: a locale AT or above the
  // gate (en-US, the 100%-reviewed fixture) is unlabelled; below it, labelled.
  assert.equal(LOCALE_REVIEWED_GATE, 0.95);
  for (const row of languageOptionsFor(false)) {
    const preview = localeReadiness(row.id).preview;
    assert.equal(row.label.endsWith(PREVIEW_SUFFIX), preview, `${row.id} label follows its measurement`);
  }
  // Deterministic: the measurement is a pure read of the catalogs, stable across calls.
  assert.deepEqual(localeReadiness('es-ES'), localeReadiness('es-ES'));
});

test("PRO-02's law still holds beside the label law: the pseudo-locale stays a dev-only row", () => {
  const shipped = languageOptionsFor(false);
  const dev = languageOptionsFor(true);
  assert.equal(shipped.some((row) => row.id === PSEUDO_LOCALE), false);
  assert.equal(dev.some((row) => row.id === PSEUDO_LOCALE), true);
  // The dev-only row is not itself labelled a machine preview — it is a tool, not a language.
  const pseudoRow = dev.find((row) => row.id === PSEUDO_LOCALE);
  assert.equal(pseudoRow.label.endsWith(PREVIEW_SUFFIX), false);
});

test('the machine fill is real: an unreviewed string resolves through the glossary pass, not an authored table', () => {
  // "Hull critical" has no authored row in any non-English table, so the machine pass produced it.
  const authored = machineTranslate('es-ES', 'HULL CRITICAL');
  assert.notEqual(authored, 'HULL CRITICAL');
  assert.equal(typeof authored, 'string');
});
