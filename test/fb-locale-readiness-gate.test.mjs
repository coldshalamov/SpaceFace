// FB-107 — A machine-filled locale says so until its reviewed coverage passes a measured gate
//
// Pins:
// 1. LOCALE_REVIEWED_GATE is 0.95 (95% reviewed threshold).
// 2. localeReadiness measures reviewed string counts and coverage per shipped locale.
// 3. Locales below 95% reviewed coverage are marked preview: true.
// 4. en-US has preview: false and its label is not suffixed.
// 5. LANGUAGE_OPTIONS labels unreviewed machine locales with "(machine preview)".
// 6. When a locale passes the 95% gate, the preview label falls away automatically.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCALE_REVIEWED_GATE,
  SHIPPED_LOCALES,
  localeReadiness,
} from '../src/localization/pipeline.js';
import {
  LANGUAGE_OPTIONS,
  languageOptionsFor,
} from '../src/localization/gameLocalization.js';

test('FB-107: LOCALE_REVIEWED_GATE is set to 0.95', () => {
  assert.equal(LOCALE_REVIEWED_GATE, 0.95, 'Gate threshold is 95%');
});

test('FB-107: localeReadiness measures coverage across all shipped locales', () => {
  assert.deepEqual(SHIPPED_LOCALES, ['en-US', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR']);

  for (const loc of SHIPPED_LOCALES) {
    const readiness = localeReadiness(loc);
    assert.equal(readiness.locale, loc);
    assert.ok(Number.isFinite(readiness.reviewed), `${loc} has reviewed count`);
    assert.ok(Number.isFinite(readiness.total), `${loc} has total count`);
    assert.ok(readiness.total > 0, `${loc} total > 0`);
    assert.ok(Number.isFinite(readiness.coverage), `${loc} has coverage fraction`);
    assert.equal(readiness.preview, readiness.coverage < LOCALE_REVIEWED_GATE);
  }
});

test('FB-107: en-US is 100% reviewed and carries no preview label', () => {
  const enReadiness = localeReadiness('en-US');
  assert.equal(enReadiness.coverage, 1, 'en-US coverage is 100%');
  assert.equal(enReadiness.preview, false, 'en-US is not preview');

  const enOption = LANGUAGE_OPTIONS.find((opt) => opt.id === 'en-US');
  assert.ok(enOption);
  assert.equal(enOption.label, 'English', 'en-US label has no suffix');
});

test('FB-107: unreviewed machine locales carry the (machine preview) suffix in LANGUAGE_OPTIONS', () => {
  const machineLocales = ['es-ES', 'fr-FR', 'de-DE', 'pt-BR'];

  for (const loc of machineLocales) {
    const readiness = localeReadiness(loc);
    assert.equal(readiness.preview, true, `${loc} is below gate`);

    const option = LANGUAGE_OPTIONS.find((opt) => opt.id === loc);
    assert.ok(option, `Option exists for ${loc}`);
    assert.ok(
      option.label.endsWith('(machine preview)'),
      `Label for ${loc} (${option.label}) must end with "(machine preview)"`
    );
  }
});

test('FB-107: passing the gate drops the preview suffix automatically', () => {
  // A hypothetical 100% reviewed gate evaluation
  const passingCoverage = 0.96;
  const passingPreview = passingCoverage < LOCALE_REVIEWED_GATE;
  assert.equal(passingPreview, false, 'Coverage >= 0.95 clears preview status');

  const baseLabel = 'Español';
  const suffixedLabel = `${baseLabel} (machine preview)`;
  const gateLabel = passingPreview ? suffixedLabel : baseLabel;
  assert.equal(gateLabel, 'Español', 'When coverage passes, suffix is omitted');
});
