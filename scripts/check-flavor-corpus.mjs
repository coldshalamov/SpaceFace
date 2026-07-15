#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FLAVOR_MODULES,
  FLAVOR_PACKS,
  FLAVOR_SOURCE_BY_REF,
  FLAVOR_TEXT_ENTRIES,
} from '../src/data/flavor/index.generated.js';
import {
  formatValidationIssues,
  validateBlurbEntries,
} from './lib/depthProgramValidators.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const UNIQUE_LOOT = JSON.parse(readFileSync(join(ROOT, 'design/depth-program/unique-loot-reservations.json'), 'utf8'));
const args = process.argv.slice(2);
const issues = validateCorpus();

if (issues.length) {
  throw new Error(`Flavor corpus failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n${formatValidationIssues(issues)}`);
}

const review = renderReview();
const reviewAt = args.indexOf('--review-out');
const outputPath = reviewAt >= 0 && args[reviewAt + 1]
  ? resolve(args[reviewAt + 1])
  : (args.includes('--write-review') ? join(ROOT, '.devshots/corpus-review.md') : null);
if (outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, review, 'utf8');
}

const digest = createHash('sha256').update(review).digest('hex');
const bandLines = FLAVOR_PACKS.band.entries.reduce((sum, channel) => sum + channel.lines.length, 0);
const landmarkLines = FLAVOR_PACKS.landmark_lore.entries.reduce((sum, landmark) => sum + landmark.lines.length, 0);
const wreckSourceCount = Object.values(FLAVOR_SOURCE_BY_REF)
  .filter((source) => source.packId === 'wreck_rumors').length;
console.log(
  `Flavor corpus OK: ${FLAVOR_MODULES.length} packs, ${FLAVOR_TEXT_ENTRIES.length} lines, ` +
  `${wreckSourceCount} wreck rumor sources, ${Object.keys(FLAVOR_SOURCE_BY_REF).length} indexed sources, ` +
  `${bandLines} Band tickers, ` +
  `${landmarkLines} landmark fragments. Review sha256:${digest}${outputPath ? ` -> ${outputPath}` : ''}`,
);

function validateCorpus() {
  const found = [];
  const add = (code, path, message) => found.push({ code, path, message, severity: 'error' });
  const expectedPacks = [
    'wreck_rumors',
    'ad_board',
    'graffiti',
    'band',
    'roaming_events',
    'quiessence',
    'hush',
    'landmark_lore',
    'set_piece_missions',
  ];
  if (FLAVOR_MODULES.length !== expectedPacks.length) {
    add('flavor.pack-count', 'FLAVOR_MODULES', `Expected ${expectedPacks.length} packs, found ${FLAVOR_MODULES.length}.`);
  }
  if (JSON.stringify(Object.keys(FLAVOR_PACKS)) !== JSON.stringify(expectedPacks)) {
    add('flavor.pack-order', 'FLAVOR_PACKS', `Expected ${expectedPacks.join(', ')}.`);
  }
  if (FLAVOR_PACKS.wreck_rumors.entries.length !== 12) add('flavor.rumors', 'wreck_rumors', 'Expected D1-D12 rumor sets.');
  if (FLAVOR_PACKS.ad_board.entries.length < 20) add('flavor.ads', 'ad_board', 'Expected at least 20 ads.');
  if (FLAVOR_PACKS.band.entries.length !== 8) add('flavor.band-channels', 'band', 'Expected eight Band channels.');
  const bandLineCount = FLAVOR_PACKS.band.entries.reduce((sum, channel) => sum + channel.lines.length, 0);
  if (bandLineCount < 60) add('flavor.band-lines', 'band', `Expected at least 60 ticker lines, found ${bandLineCount}.`);
  if (FLAVOR_PACKS.roaming_events.entries.length !== 2) add('flavor.roaming', 'roaming_events', 'Expected Insolvent and Slow Fleet.');
  if (FLAVOR_PACKS.quiessence.entries.length !== 17) add('flavor.quiessence', 'quiessence', 'Expected seventeen black-box facts.');
  if (FLAVOR_PACKS.hush.entries.length < 8) add('flavor.hush', 'hush', 'Expected a complete scanner progression.');
  if (FLAVOR_PACKS.landmark_lore.entries.length !== 19) add('flavor.landmarks', 'landmark_lore', 'Expected nineteen physical landmark targets.');

  const manifestSources = UNIQUE_LOOT.wrecks.flatMap((wreck) => (wreck.rumorSources || []).map((source) => ({
    ...source, wreckId: wreck.id, programSlot: wreck.programSlot,
  })));
  for (const expected of manifestSources) {
    const actual = FLAVOR_SOURCE_BY_REF[expected.sourceRef];
    if (!actual) {
      add('flavor.source-unresolved', expected.sourceRef, 'Reservation has no authored flavor source.');
      continue;
    }
    for (const field of ['id', 'wreckId', 'programSlot', 'channelId']) {
      if (actual[field] !== expected[field]) add('flavor.source-mismatch', `${expected.sourceRef}.${field}`, `Expected ${expected[field]}, found ${actual[field]}.`);
    }
  }
  const wreckSourceCount = Object.values(FLAVOR_SOURCE_BY_REF)
    .filter((source) => source.packId === 'wreck_rumors').length;
  if (wreckSourceCount !== manifestSources.length) {
    add('flavor.source-count', 'FLAVOR_SOURCE_BY_REF', `Expected ${manifestSources.length} exact wreck reservation refs, found ${wreckSourceCount}.`);
  }

  found.push(...validateBlurbEntries(FLAVOR_TEXT_ENTRIES.map((entry) => ({ id: entry.key, text: entry.text }))));
  return found;
}

function renderReview() {
  const lines = [
    '# SpaceFace V2 Corpus Review',
    '',
    `Deterministic readout: ${FLAVOR_MODULES.length} packs, ${FLAVOR_TEXT_ENTRIES.length} authored lines.`,
    '',
    '| Pack | Records | Authored lines |',
    '|---|---:|---:|',
  ];
  for (const record of FLAVOR_MODULES) {
    const pack = record.namespace.default;
    const prefix = `src/data/flavor/${record.sourceFile}#`;
    const textRows = FLAVOR_TEXT_ENTRIES.filter((entry) => entry.key.startsWith(prefix));
    lines.push(`| ${title(pack.id)} | ${pack.entries.length} | ${textRows.length} |`);
  }
  for (const record of FLAVOR_MODULES) {
    const pack = record.namespace.default;
    const prefix = `src/data/flavor/${record.sourceFile}#`;
    const textRows = FLAVOR_TEXT_ENTRIES.filter((entry) => entry.key.startsWith(prefix));
    lines.push('', `## ${title(pack.id)}`, '', `_${pack.description}_`, '');
    for (const entry of textRows) lines.push(`- \`${entry.id}\` — ${entry.text}`);
  }
  return `${lines.join('\n')}\n`;
}

function title(id) {
  return String(id).split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}
