#!/usr/bin/env node
// PQ-178.02 — faction-register gate. Headless. No headed capture.
import { resolve } from 'node:path';

import {
  REPO_ROOT,
  validateFactionRegister,
  validateFactionRegisterCorpus,
  loadFactionSheet,
  loadRegisterHouses,
  scanHouseTableForForbidden,
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
  console.error('check-faction-registers: no faction sheets found');
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

// Lexical overlaps are editorial hints. Common words such as "pattern" or
// "salvage" do not make valid military/legal dialogue a broken game. Structural
// sheet/citation errors above remain blocking. Skip corpus hints for --file.
if (!requested) {
  for (const sheet of loadRegisterHouses()) {
    const fouls = scanHouseTableForForbidden(sheet);
    if (fouls.length === 0) continue;
    console.log(`  NOTE ${sheet.rel} — voice overlaps to review in context`);
    for (const row of fouls.slice(0, 8)) {
      console.log(`    voice_overlap [${row.situation}[${row.index}]] "${row.foul}": ${row.line}`);
    }
    if (fouls.length > 8) console.log(`    ... and ${fouls.length - 8} more`);
  }
}

if (failed) {
  console.error(`check-faction-registers: FAIL — ${failed} sheet(s)`);
  process.exit(1);
}

console.log(`check-faction-registers: PASS — ${reports.length} sheet(s)`);
