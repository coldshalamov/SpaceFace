#!/usr/bin/env node
// Liveness verdicts for design/program/NOW.md mutation rows.
//
// A NOW row is a CLAIM, not evidence. This script produces the evidence: for every row in the
// "Active mutation windows" table it finds checkpoint progress or the newest mtime across the row's
// claimed paths and issues a mechanical verdict. A row/checkpoint whose progress is older than
// STALE_MINUTES is STALE BY DEFINITION — any agent may adopt the work and delete the row. Fresh
// checkpoint lookahead reservations are also printed so another agent does not claim the next task
// in a longform session by accident. No judgment call, no deference to a dead session.
//
// Usage:
//   node scripts/check-now-liveness.mjs            report all rows
//   node scripts/check-now-liveness.mjs --strict   exit 1 if any STALE row remains on the board
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOW_PATH = resolve(ROOT, 'design/program/NOW.md');
const CHECKPOINT_DIR = resolve(ROOT, '.codex', 'agent-checkpoints');
const STALE_MINUTES = 90;
const CHECKPOINT_MARKER = /(?:^|[\\/])\.codex[\\/]agent-checkpoints[\\/][^\\/`]+\.json$/i;

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

function checkpointInfo(rawPath) {
  const abs = resolve(ROOT, rawPath);
  if (!existsSync(abs)) return { error: 'checkpoint is missing' };
  let value;
  try {
    value = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (error) {
    return { error: `checkpoint is unreadable (${error.message})` };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'checkpoint is not an object' };
  const timestamp = Date.parse(String(value.lastProgressAt || ''));
  if (!Number.isFinite(timestamp)) return { error: 'checkpoint has no valid lastProgressAt' };
  return {
    state: String(value.state || 'UNKNOWN'),
    owner: String(value.owner || 'unknown owner'),
    task: String(value.task || 'unnamed task'),
    next: String(value.next || 'none'),
    reservedTasks: Array.isArray(value.reservedTasks) ? value.reservedTasks.map(String) : [],
    timestamp,
  };
}

function checkpointFiles() {
  if (!existsSync(CHECKPOINT_DIR)) return [];
  let entries = [];
  try { entries = globSync('*.json', { cwd: CHECKPOINT_DIR }); } catch { return []; }
  return entries.map((entry) => resolve(CHECKPOINT_DIR, entry));
}

function main() {
  const strict = process.argv.includes('--strict');
  const text = readFileSync(NOW_PATH, 'utf8');
  const section = text.split('## Active mutation windows')[1]?.split('\n## ')[0] || '';
  const rows = section.split('\n').filter((l) => l.trim().startsWith('|') && !/^\|[\s|-]+\|?$/.test(l.trim()) && !/^\|\s*Task\s*\|/i.test(l));
  if (!rows.length) {
    console.log('now-liveness: no active mutation rows. Board is quiet.');
  }
  let staleCount = 0;
  const nowMs = Date.now();
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim());
    const task = cells[1] || '(unnamed)';
    const thread = cells[2] || '(no thread)';
    const backtickPaths = [...row.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((p) => /[\/\\.]/.test(p));
    const checkpointPaths = backtickPaths.filter((p) => CHECKPOINT_MARKER.test(p.replaceAll('\\', '/')));
    const paths = backtickPaths.filter((p) => !CHECKPOINT_MARKER.test(p.replaceAll('\\', '/')));
    let newest = 0;
    for (const p of paths) { const t = newestMtime(p); if (t > newest) newest = t; }
    let ageMin = newest ? Math.round((nowMs - newest) / 60000) : Infinity;
    let livenessSource = 'legacy path mtime';
    let checkpoint = null;
    let checkpointError = null;
    if (checkpointPaths.length) {
      checkpoint = checkpointInfo(checkpointPaths[0]);
      if (checkpoint.error) checkpointError = checkpoint.error;
      else {
        ageMin = Math.round((nowMs - checkpoint.timestamp) / 60000);
        livenessSource = `checkpoint progress; next: ${checkpoint.next}`;
      }
    }
    const stale = checkpointError ? true : (checkpoint?.state === 'DONE' || ageMin > STALE_MINUTES);
    if (stale) staleCount += 1;
    const age = checkpointError
      ? checkpointError
      : Number.isFinite(ageMin) ? `${ageMin} min ago (${livenessSource})` : 'no claimed file found on disk';
    console.log(`${stale ? 'STALE' : 'LIVE '}  ${task} [${thread}] — newest progress: ${age}`);
    if (checkpoint?.reservedTasks?.length > 1) {
      console.log(`       -> lookahead reservation: ${checkpoint.reservedTasks.join(' -> ')}`);
    }
    if (checkpointPaths.length > 1) {
      console.log(`       -> multiple checkpoints listed; using ${checkpointPaths[0]}`);
    }
    if (stale) {
      const reason = checkpointError || checkpoint?.state === 'DONE'
        ? checkpointError || 'checkpoint is marked DONE while the NOW row remains'
        : `no checkpoint progress for over ${STALE_MINUTES} minutes`;
      console.log(`       -> ${reason}. The row is adoptable by definition.`);
      console.log('       -> Inspect the dirty diff, adopt the checkpoint, preserve existing hunks, finish or land the work, receipt it, and delete the row.');
    } else if (!checkpointPaths.length) {
      console.log('       -> legacy row: add a checkpoint path on the next mutation; path mtime is only a fallback.');
    }
  }

  const rowCheckpointFiles = new Set(checkpointPathsForRows(rows).map((p) => resolve(ROOT, p).toLowerCase()));
  const unlistedReservations = [];
  for (const file of checkpointFiles()) {
    if (rowCheckpointFiles.has(file.toLowerCase())) continue;
    const info = checkpointInfo(file);
    if (info.error || info.reservedTasks.length < 2) continue;
    const ageMin = Math.round((nowMs - info.timestamp) / 60000);
    const stale = info.state === 'DONE' || ageMin > STALE_MINUTES;
    if (stale) {
      staleCount += 1;
      console.log(`STALE  lookahead ${info.reservedTasks.join(' -> ')} [${info.owner}] — ${ageMin} min ago`);
      console.log(`       -> reservation checkpoint ${file} is stale; inspect it before adopting or deleting it.`);
    } else {
      unlistedReservations.push({ file, info, ageMin });
    }
  }
  for (const { file, info, ageMin } of unlistedReservations) {
    console.log(`RESERVED  ${info.reservedTasks.join(' -> ')} [${info.owner}] — ${ageMin} min ago`);
    console.log(`       -> soft lookahead only; it expires after ${STALE_MINUTES} minutes without checkpoint progress (${file}).`);
  }
  if (strict && staleCount) {
    console.error(`now-liveness: ${staleCount} stale row(s) squatting on the board.`);
    process.exit(1);
  }
}

function checkpointPathsForRows(rows) {
  return rows.flatMap((row) => [...row.matchAll(/`([^`]+)`/g)]
    .map((m) => m[1])
    .filter((p) => CHECKPOINT_MARKER.test(p.replaceAll('\\', '/'))));
}

main();
