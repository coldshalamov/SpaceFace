#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  collectBlurbVoiceEntries,
  selectChangedBlurbEntries,
} from './lib/blurbVoiceSources.mjs';
import {
  formatValidationIssues,
  validateBlurbEntries,
} from './lib/depthProgramValidators.mjs';

const args = process.argv.slice(2);
const fixtureAt = args.indexOf('--fixture');
const strictWarnings = args.includes('--strict-warnings');
let entries;
let baseline;

if (fixtureAt >= 0 && args[fixtureAt + 1]) {
  const fixture = JSON.parse(readFileSync(resolve(args[fixtureAt + 1]), 'utf8'));
  entries = fixture.entries || [];
  baseline = fixture.baseline || {};
} else {
  entries = collectBlurbVoiceEntries();
  const since = JSON.parse(readFileSync(new URL('../test/fixtures/depth-program/blurb-voice-since.json', import.meta.url), 'utf8'));
  if (since.schemaVersion !== 1 || since.hashAlgorithm !== 'sha256-kind-null-text') {
    throw new Error('Blurb-voice since fixture must use schemaVersion 1 and sha256-kind-null-text.');
  }
  baseline = since.entries || {};
}

const changed = args.includes('--all') ? entries : selectChangedBlurbEntries(entries, baseline);
const issues = validateBlurbEntries(changed.map((entry) => ({
  id: entry.key || entry.id,
  text: entry.text,
})));
const warnings = issues.filter((entry) => entry.severity === 'warning');
const errors = issues.filter((entry) => entry.severity !== 'warning');

if (warnings.length) console.warn(formatValidationIssues(warnings));
if (errors.length || (strictWarnings && warnings.length)) {
  throw new Error(`Blurb-voice contract failed (${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}):\n${formatValidationIssues(issues)}`);
}

console.log(`Blurb-voice contract OK: ${entries.length} scoped lines, ${changed.length} new/changed, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`);
