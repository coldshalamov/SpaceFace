#!/usr/bin/env node
// PQ-178.02 — leftover faction-register gate. Headless. No headed capture.
import { resolve } from 'node:path';

import {
  REPO_ROOT,
  validateFactionRegister,
  validateFactionRegisterCorpus,
  loadFactionSheet,
} from '../src/story/factionRegisters.js';

const args = process.argv.slice(2);
const fileFlag = args.findIndex((token) => token === '--file');
const requested = fileFlag >= 0 ? args[fileFlag + 1] : null;

const reports = requested
  ? (() => {
    const sheet = loadFactionSheet(resolve(REPO_ROOT, requested));
    return [{ rel: sheet.rel, id: sheet.id, issues: validateFactionRegister(sheet) }];
  })()
  : validateFactionRegisterCorpus();

if (reports.length === 0) {
  console.error('check-faction-registers: no leftover faction sheets found');
  process.exit(1);
}

let failed = 0;
for (const report of reports) {
  if (report.issues.length === 0) {
    console.log(`  PASS ${report.rel} (${report.id || 'sheet'})`);
    continue;
  }
  failed += 1;
  console.error(`  FAIL ${report.rel}`);
  for (const row of report.issues) {
    const loc = row.path ? ` [${row.path}]` : '';
    console.error(`    ${row.code}${loc}: ${row.message}`);
  }
}

if (failed) {
  console.error(`check-faction-registers: FAIL — ${failed} leftover sheet(s)`);
  process.exit(1);
}

console.log(`check-faction-registers: PASS — ${reports.length} leftover sheet(s)`);
