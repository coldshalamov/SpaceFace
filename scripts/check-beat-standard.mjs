#!/usr/bin/env node
// PQ-178.00 — beat-standard gate. Headless. No headed capture.
import { resolve } from 'node:path';

import {
  REPO_ROOT,
  validateBeatCorpus,
  validateBeatFile,
} from '../src/story/beatStandard.js';

const args = process.argv.slice(2);
const fileFlag = args.findIndex((token) => token === '--file');
const requested = fileFlag >= 0 ? args[fileFlag + 1] : null;

const reports = requested
  ? [validateBeatFile(resolve(REPO_ROOT, requested))]
  : validateBeatCorpus();

if (reports.length === 0) {
  console.error('check-beat-standard: no beat sheets found');
  process.exit(1);
}

let failed = 0;
for (const report of reports) {
  if (report.issues.length === 0) {
    const kind = report.sheet && report.sheet.kind ? report.sheet.kind : 'beat';
    console.log(`  PASS ${report.rel} (${kind})`);
    continue;
  }
  failed += 1;
  console.error(`  FAIL ${report.rel}`);
  for (const issue of report.issues) {
    const loc = issue.path ? ` [${issue.path}]` : '';
    console.error(`    ${issue.code}${loc}: ${issue.message}`);
  }
}

if (failed) {
  console.error(`check-beat-standard: FAIL — ${failed} sheet(s)`);
  process.exit(1);
}

console.log(`check-beat-standard: PASS — ${reports.length} sheet(s)`);
