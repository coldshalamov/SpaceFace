#!/usr/bin/env node
/**
 * INFERENCE hygiene ledger — the whole-game state on one screen.
 *
 * Default: print every domain's grade, inspection freshness (computed from
 * git: an inspection dies when its paths changed since its commit), open
 * gaps, and three suggested picks. Suggestions are hints; looking wins.
 *
 *   node scripts/inference-ledger.mjs [--wf WF-10]
 *   node scripts/inference-ledger.mjs inspect --wf WF-10 --paths a.js,b.js --finding "..." [--grade B] [--next "..."]
 *   node scripts/inference-ledger.mjs grade --wf WF-10 --grade B [--next "..."]
 *   node scripts/inference-ledger.mjs gap --wf WF-10 --id slug --note "..."
 *   node scripts/inference-ledger.mjs done --wf WF-10 --id slug [--by unit-id]
 *   node scripts/inference-ledger.mjs init
 *
 * Bounded: 3 inspections + 5 open gaps per domain, pruned on write. Grades:
 * S exemplary / A shippable / B good with gaps / C weak / D broken or thin /
 * U uninspected.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DOMAINS } from './lib/inferenceCore.mjs';
import {
  normalizeLedger, recordInspection, addGap, closeGap, setGrade,
  inspectionFreshness, rankDomains, openGaps, validWf, validGrade,
  MAX_INSPECTIONS, MAX_OPEN_GAPS,
} from './lib/inferenceLedger.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER_PATH = resolve(ROOT, 'design/program/inference-ledger.json');

const argv = process.argv.slice(2);
const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
const flag = (name) => {
  const i = argv.findIndex((a) => a === `--${name}`);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const today = new Date().toISOString().slice(0, 10);

function fail(message) {
  console.error(`inference-ledger: ${message}`);
  process.exit(1);
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function headCommit() {
  return git(['rev-parse', 'HEAD']);
}

function commitKnown(sha) {
  if (!sha) return false;
  return git(['cat-file', '-e', `${sha}^{commit}`]) !== null;
}

/**
 * True when any path changed since atCommit (fail closed: unknown commit,
 * git failure, or unrecorded paths with later commits all read as changed).
 */
function pathsChangedSince(atCommit, paths, head) {
  if (!atCommit || !commitKnown(atCommit)) return true;
  if (!paths || paths.length === 0) return atCommit !== head;
  const out = git(['log', '--format=%H', '-1', `${atCommit}..HEAD`, '--', ...paths]);
  if (out === null) return true;
  return out.length > 0;
}

function loadLedger() {
  let raw = null;
  if (existsSync(LEDGER_PATH)) {
    try {
      raw = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
    } catch {
      fail(`ledger file exists but is not valid JSON: ${LEDGER_PATH}. Fix it before recording.`);
    }
  }
  const { ledger, warnings } = normalizeLedger(raw, today);
  for (const warning of warnings) console.warn(`inference-ledger: ${warning}`);
  return ledger;
}

function saveLedger(ledger) {
  writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  console.log(`inference-ledger: wrote ${LEDGER_PATH}`);
}

function freshnessMap(ledger) {
  const head = headCommit();
  const map = new Map();
  for (const d of DOMAINS) {
    const entry = ledger.domains[d.wf];
    const latest = entry.inspections[entry.inspections.length - 1];
    if (!latest) {
      map.set(d.wf, 'none');
      continue;
    }
    map.set(d.wf, inspectionFreshness(latest, {
      atCommitKnown: commitKnown(latest.atCommit),
      pathsChanged: pathsChangedSince(latest.atCommit, latest.paths, head),
    }));
  }
  return map;
}

function printStatus(ledger, onlyWf) {
  const fresh = freshnessMap(ledger);
  const show = onlyWf ? DOMAINS.filter((d) => d.wf === onlyWf) : DOMAINS;
  if (onlyWf && show.length === 0) fail(`unknown workflow ${onlyWf}`);
  console.log(`ledger ${ledger.updated} — grades S/A/B/C/D/U, freshness valid/stale/none`);
  for (const d of show) {
    const entry = ledger.domains[d.wf];
    const gaps = openGaps(entry);
    const gapText = gaps.length ? ` gaps:${gaps.map((g) => g.id).join(',')}` : '';
    const nextText = entry.next ? ` next:${entry.next}` : '';
    console.log(
      `${d.wf} [${entry.grade}] ${entry.updated || 'never'} fresh:${fresh.get(d.wf)}${gapText}${nextText}`,
    );
    if (onlyWf) {
      for (const i of entry.inspections) {
        console.log(`  ${i.date} @${String(i.atCommit).slice(0, 7)} ${i.paths.join(',') || '(no paths)'}`);
        console.log(`    ${i.finding}`);
      }
      for (const g of gaps) console.log(`  gap ${g.id}: ${g.note}`);
    }
  }
  if (!onlyWf) {
    const ranked = rankDomains(ledger, (wf) => fresh.get(wf));
    console.log('suggested (hint, not assignment):');
    for (const row of ranked.slice(0, 3)) {
      console.log(`  ${row.wf} [${row.grade}] ${row.freshness} — ${row.reason}`);
    }
  }
}

if (!command) {
  printStatus(loadLedger(), flag('wf'));
} else if (command === 'init') {
  if (existsSync(LEDGER_PATH)) fail('ledger already exists; refusing to overwrite');
  saveLedger(normalizeLedger(null, today).ledger);
} else if (command === 'inspect') {
  const wf = flag('wf') || fail('inspect requires --wf (for example WF-10)');
  const finding = flag('finding') || fail('inspect requires --finding "..."');
  if (!validWf(wf)) fail(`unknown workflow ${wf}`);
  const grade = flag('grade');
  if (grade && !validGrade(grade)) fail(`unknown grade ${grade}`);
  const paths = (flag('paths') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ledger = loadLedger();
  recordInspection(ledger, {
    wf, date: today, atCommit: headCommit() || '', paths, finding, grade, next: flag('next'),
  });
  saveLedger(ledger);
} else if (command === 'grade') {
  const wf = flag('wf') || fail('grade requires --wf');
  const grade = flag('grade') || fail('grade requires --grade S|A|B|C|D|U');
  if (!validWf(wf)) fail(`unknown workflow ${wf}`);
  if (!validGrade(grade)) fail(`unknown grade ${grade}`);
  const ledger = loadLedger();
  setGrade(ledger, { wf, grade, next: flag('next'), date: today });
  saveLedger(ledger);
} else if (command === 'gap') {
  const wf = flag('wf') || fail('gap requires --wf');
  const id = flag('id') || fail('gap requires --id');
  const note = flag('note') || fail('gap requires --note "..."');
  if (!validWf(wf)) fail(`unknown workflow ${wf}`);
  const ledger = loadLedger();
  const result = addGap(ledger, { wf, id, note, date: today });
  if (!result.ok) fail(result.reason);
  saveLedger(ledger);
} else if (command === 'done') {
  const wf = flag('wf') || fail('done requires --wf');
  const id = flag('id') || fail('done requires --id');
  if (!validWf(wf)) fail(`unknown workflow ${wf}`);
  const ledger = loadLedger();
  closeGap(ledger, { wf, id, byUnit: flag('by'), date: today });
  saveLedger(ledger);
} else {
  console.log([
    `caps: ${MAX_INSPECTIONS} inspections + ${MAX_OPEN_GAPS} open gaps per domain; rows update in place.`,
    '',
    '  node scripts/inference-ledger.mjs [--wf WF-10]',
    '  node scripts/inference-ledger.mjs inspect --wf WF-10 --paths a.js --finding "..." [--grade B] [--next "..."]',
    '  node scripts/inference-ledger.mjs grade --wf WF-10 --grade B [--next "..."]',
    '  node scripts/inference-ledger.mjs gap --wf WF-10 --id slug --note "..."',
    '  node scripts/inference-ledger.mjs done --wf WF-10 --id slug [--by unit-id]',
  ].join('\n'));
  process.exit(command ? 1 : 0);
}
