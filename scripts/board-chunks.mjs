#!/usr/bin/env node
// Live read of build_map.md §1C seams.
// The old packet queue can be empty while this board is full. This command is how an
// agent sees which seams are free. It does not assign work and it does not read the
// inference catalog.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOARD = path.join(ROOT, 'build_map.md');

function cellsOf(line) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim());
}

function section1C(text) {
  const start = text.indexOf('## 1C.');
  const end = text.indexOf('\n## 2.');
  if (start < 0 || end < start) throw new Error('build_map.md is missing §1C or §2');
  return text.slice(start, end);
}

export function readBoard(text = fs.readFileSync(BOARD, 'utf8')) {
  const body = section1C(text);
  const lines = body.split(/\n/);
  const seams = [];
  let inSeamTable = false;
  const seamNumbers = new Map();
  for (const line of lines) {
    if (line.startsWith('| Seam |')) {
      inSeamTable = true;
      continue;
    }
    if (inSeamTable && line.startsWith('|---')) continue;
    if (inSeamTable && !line.startsWith('|')) {
      inSeamTable = false;
      continue;
    }
    if (!inSeamTable || !line.startsWith('|')) continue;
    const cells = cellsOf(line);
    if (cells.length < 4 || cells[0] === 'Seam') continue;
    const rows = cells[3].split(/,\s*/).map((part) => Number(part)).filter((n) => Number.isInteger(n));
    const seam = {
      seam: cells[0],
      claim: cells[1] || 'free',
      files: cells[2],
      rows,
    };
    seams.push(seam);
    for (const row of rows) {
      if (!seamNumbers.has(row)) seamNumbers.set(row, []);
      seamNumbers.get(row).push(seam.seam);
    }
  }

  const open = [];
  const known = new Set();
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = cellsOf(line);
    const number = Number(cells[0]);
    if (!Number.isInteger(number)) continue;
    known.add(number);
    const status = cells[cells.length - 1] || '';
    const id = cells[1] || '';
    if (status.startsWith('OPEN')) open.push({ number, id, status });
  }

  const laneIds = new Set(['L-MACHINE', 'L-HAND', 'L-FIGHTWORLD', 'L-LONGGAME', 'L-EAR']);
  const orphans = open.filter((row) => !seamNumbers.has(row.number) && !laneIds.has(row.id));
  const missing = [];
  const dupes = [];
  for (const [number, names] of seamNumbers) {
    if (!known.has(number)) missing.push(number);
    if (names.length > 1) dupes.push({ number, names });
  }

  return { seams, open, orphans, missing, dupes };
}

export function boardReport(board = readBoard()) {
  const free = [];
  const claimed = [];
  for (const seam of board.seams) {
    const openRows = seam.rows.filter((number) => board.open.some((row) => row.number === number));
    const entry = { seam: seam.seam, claim: seam.claim, files: seam.files, openRows };
    if (seam.claim === 'free') free.push(entry);
    else claimed.push(entry);
  }
  return {
    legacyQueue: 'drained-or-not-this-command',
    work: 'build_map.md §1C seams',
    rule: 'Claim a free seam and do its open rows. An empty packet queue is not an empty plan and is not the inference catalog.',
    free,
    claimed,
    orphans: board.orphans.map((row) => row.number),
    missingFromBoard: board.missing,
    duplicatedRows: board.dupes,
  };
}

function printHuman(report) {
  console.log('Board seams. A drained packet queue is this list, not an empty plan.');
  console.log('Claim a free seam in build_map.md §1C, then do its open rows.');
  console.log('Do not switch to the inference catalog unless the owner said INFERENCE.');
  console.log('');
  console.log('Free:');
  for (const seam of report.free) {
    console.log(`  ${seam.seam}  ${seam.openRows.length} open  [${seam.openRows.join(', ')}]`);
    console.log(`    ${seam.files}`);
  }
  if (report.claimed.length) {
    console.log('In flight:');
    for (const seam of report.claimed) {
      console.log(`  ${seam.seam}  ${seam.claim}  ${seam.openRows.length} open`);
    }
  }
  if (report.orphans.length || report.missingFromBoard.length || report.duplicatedRows.length) {
    console.log('Drift:');
    if (report.orphans.length) console.log(`  open rows missing from the seam table: ${report.orphans.join(', ')}`);
    if (report.missingFromBoard.length) console.log(`  seam rows missing on the board: ${report.missingFromBoard.join(', ')}`);
    if (report.duplicatedRows.length) {
      console.log(`  rows listed in two seams: ${report.duplicatedRows.map((item) => item.number).join(', ')}`);
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const report = boardReport();
  const check = process.argv.includes('--check');
  const json = process.argv.includes('--json');
  if (json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  const drift = report.orphans.length + report.missingFromBoard.length + report.duplicatedRows.length;
  if (check && drift) process.exit(1);
}
