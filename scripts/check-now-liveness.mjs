#!/usr/bin/env node
// Liveness verdicts for design/program/NOW.md mutation rows.
//
// A NOW row is a CLAIM, not evidence. This script produces the evidence: for every row in the
// "Active mutation windows" table it finds the newest mtime across the row's claimed paths and
// issues a mechanical verdict. A row whose claimed files have not changed in STALE_MINUTES is
// STALE BY DEFINITION — any agent may adopt the work and delete the row. No judgment call, no
// deference to a dead session.
//
// Usage:
//   node scripts/check-now-liveness.mjs            report all rows
//   node scripts/check-now-liveness.mjs --strict   exit 1 if any STALE row remains on the board
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOW_PATH = resolve(ROOT, 'design/program/NOW.md');
const STALE_MINUTES = 90;

function newestMtime(rawPath) {
  const cleaned = rawPath.replace(/\*\*?$/, '').replace(/\/$/, '');
  const abs = resolve(ROOT, cleaned);
  let newest = 0;
  const visit = (p) => {
    let st;
    try { st = statSync(p); } catch { return; }
    if (st.isFile()) { if (st.mtimeMs > newest) newest = st.mtimeMs; return; }
    if (st.isDirectory()) {
      let entries = [];
      try { entries = globSync('*', { cwd: p }); } catch { return; }
      for (const e of entries.slice(0, 500)) visit(resolve(p, e));
    }
  };
  if (cleaned.includes('*')) {
    let matches = [];
    try { matches = globSync(cleaned, { cwd: ROOT }); } catch { /* ignore */ }
    for (const m of matches.slice(0, 500)) visit(resolve(ROOT, m));
  } else {
    visit(abs);
  }
  return newest;
}

function main() {
  const strict = process.argv.includes('--strict');
  const text = readFileSync(NOW_PATH, 'utf8');
  const section = text.split('## Active mutation windows')[1]?.split('\n## ')[0] || '';
  const rows = section.split('\n').filter((l) => l.trim().startsWith('|') && !/^\|[\s|-]+\|?$/.test(l.trim()) && !/^\|\s*Task\s*\|/i.test(l));
  if (!rows.length) {
    console.log('now-liveness: no active mutation rows. Board is quiet.');
    return;
  }
  let staleCount = 0;
  const nowMs = Date.now();
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim());
    const task = cells[1] || '(unnamed)';
    const thread = cells[2] || '(no thread)';
    const paths = [...row.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((p) => /[\/\\.]/.test(p));
    let newest = 0;
    for (const p of paths) { const t = newestMtime(p); if (t > newest) newest = t; }
    const ageMin = newest ? Math.round((nowMs - newest) / 60000) : Infinity;
    const stale = ageMin > STALE_MINUTES;
    if (stale) staleCount += 1;
    const age = Number.isFinite(ageMin) ? `${ageMin} min ago` : 'no claimed file found on disk';
    console.log(`${stale ? 'STALE' : 'LIVE '}  ${task} [${thread}] — newest claimed-file write: ${age}`);
    if (stale) {
      console.log(`       -> claimed files untouched for over ${STALE_MINUTES} minutes. The writer is dead or done.`);
      console.log('       -> Any agent may ADOPT this work (evaluate the dirty diff, finish or land it, receipt it) and DELETE this row.');
    }
  }
  if (strict && staleCount) {
    console.error(`now-liveness: ${staleCount} stale row(s) squatting on the board.`);
    process.exit(1);
  }
}

main();
