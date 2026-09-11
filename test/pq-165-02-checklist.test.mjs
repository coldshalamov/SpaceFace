// PQ-165.02 — checklist reads live settings; per-screen rows are measured. Seed 16502.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  ACCESSIBILITY_STATEMENT_ID,
  ACCESSIBILITY_STATEMENT_ROUTE,
  CHECKLIST_CAPABILITIES,
  CHECKLIST_SEED,
  evaluateChecklist,
  flagsFromSettings,
  screenCapabilityChecklist,
  statementReachableFromSettings,
} from '../src/ui/accessibilityChecklist.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function fullOnSettings() {
  return {
    uiScale: 1.25,
    accessibility: {
      highContrast: true,
      motionPreference: 'reduce',
      captions: true,
    },
    video: { motionReduce: true },
    gameplay: { controlScheme: 'pilot', orbitAssistStrength: 'arm' },
  };
}

test(`seed ${CHECKLIST_SEED}: empty/default settings are not a green checklist`, () => {
  const empty = evaluateChecklist({});
  assert.equal(empty.green, false);
  assert.ok(empty.missing.includes('contrast'));
  assert.ok(empty.missing.includes('captions'));
  const defaults = evaluateChecklist({
    accessibility: { highContrast: false, captions: true },
    gameplay: { controlScheme: 'pilot', orbitAssistStrength: 'arm' },
    uiScale: 1,
  });
  assert.equal(defaults.green, false, 'highContrast default false must fail contrast');
  assert.deepEqual(defaults.missing, ['contrast', 'motion']);
  const flags = flagsFromSettings({});
  assert.equal(flags.contrast, false);
  assert.equal(flags.captions, false);
});

test(`seed ${CHECKLIST_SEED}: live settings paths turn the checklist green, and screens are measured`, () => {
  const settingsSrc = readFileSync(join(ROOT, 'src/ui/screens/settings.js'), 'utf8');
  assert.equal(statementReachableFromSettings(settingsSrc), true);
  assert.ok(settingsSrc.includes('evaluateChecklist(s)'), 'Access tab must pass live settings, not hardcoded trues');
  assert.equal(ACCESSIBILITY_STATEMENT_ROUTE.from, 'settings');
  assert.ok(settingsSrc.includes(ACCESSIBILITY_STATEMENT_ID) || settingsSrc.includes('ACCESSIBILITY_STATEMENT_ID'));
  assert.match(settingsSrc, /Accessibility statement:/);
  assert.doesNotMatch(settingsSrc, /build\.note\(ACCESSIBILITY_STATEMENT_ID\)/);

  const offCaptions = fullOnSettings();
  offCaptions.accessibility.captions = false;
  const red = evaluateChecklist(offCaptions);
  assert.equal(red.green, false);
  assert.deepEqual(red.missing, ['captions']);

  const on = fullOnSettings();
  const green = evaluateChecklist(on);
  assert.equal(green.green, true, `missing ${green.missing.join(',')}`);
  const report = screenCapabilityChecklist(on);
  assert.equal(report.green, true);
  assert.ok(report.rows.length >= 8);
  for (const row of report.rows) {
    for (const cap of CHECKLIST_CAPABILITIES) {
      assert.equal(row[cap], true, `${row.screen} ${cap} measured false under full-on settings`);
    }
  }
  const offReport = screenCapabilityChecklist({ accessibility: { highContrast: false, captions: true } });
  assert.equal(offReport.green, false);
  assert.ok(offReport.rows.every((row) => row.contrast === false));
  console.log(`SEED=${CHECKLIST_SEED} checklistGreen=${green.green} screens=${report.rows.length} statement=${ACCESSIBILITY_STATEMENT_ID}`);
});
