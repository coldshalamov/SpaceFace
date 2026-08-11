#!/usr/bin/env node
/**
 * Append a unit, run, or defect to the INFERENCE memory
 * (design/program/inference-memory.json) with validation.
 *
 * Why a script instead of hand-editing: the memory is what future runs use for
 * anti-pile-on decay, rejected-idea blocking, and starvation scheduling.
 * Hand edits drift; this validates shape, enforces the evidence pairing for
 * accepted+live units, and prunes to keep the file small.
 *
 * Usage:
 *   node scripts/inference-record.mjs unit --id <slug> --wf WF-01 \
 *     --mode repair|starved|opportunity|integration|recovery|multiplication \
 *     --verdict accepted|rejected|rebuilt|cut --reason "six words or so" \
 *     --fp "verb=steal,subject=hauler,sector=ceres,layer=foreground,tempo=burst,domain=wf-01" \
 *     [--root-reason "causal defect for rejected/cut"] [--refs "eve,watchdogs"] \
 *     [--integration live|source-only|cut] [--evidence <path>] [--review <path>]
 *
 *   node scripts/inference-record.mjs run --mode repair --domains WF-01,WF-02 \
 *     [--scope NPCS] [--nx 3] [--note "..."]
 *
 *   node scripts/inference-record.mjs defect --id <slug> --wf WF-15 \
 *     --severity foundation|suspected-foundation|ambient --note "..."
 *   node scripts/inference-record.mjs defect --id <slug> --resolve
 *
 * Rules enforced here (not just prose):
 * - verdict=accepted with integration=live REQUIRES --evidence and --review,
 *   both existing files. A unit nobody can audit is not accepted.
 * - rejected/cut units REQUIRE --root-reason so failed-twice detection works.
 * - fingerprints need >=3 axes so distinctness/resurrection checks have signal.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeMemory, recordUnit, recordRun, parseFingerprint, isBlockedCandidate,
} from './lib/inferenceCore.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MEMORY_PATH = resolve(ROOT, 'design/program/inference-memory.json');

const argv = process.argv.slice(2);
const command = argv[0];
const flag = (name) => {
  const i = argv.findIndex((a) => a === `--${name}`);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const hasFlag = (name) => argv.includes(`--${name}`) || argv.some((a) => a.startsWith(`--${name}=`));

const today = new Date().toISOString().slice(0, 10);

function fail(msg) {
  console.error(`inference-record: ${msg}`);
  process.exit(1);
}

function loadMemory() {
  let raw = null;
  if (existsSync(MEMORY_PATH)) {
    try { raw = JSON.parse(readFileSync(MEMORY_PATH, 'utf8')); }
    catch { fail(`memory file exists but is not valid JSON: ${MEMORY_PATH}. Fix it (git diff/checkout) before recording.`); }
  }
  const { memory, warnings } = normalizeMemory(raw, today);
  for (const w of warnings) console.warn(`inference-record: ${w}`);
  return memory;
}

function saveMemory(memory) {
  writeFileSync(MEMORY_PATH, `${JSON.stringify(memory, null, 2)}\n`, 'utf8');
  console.log(`inference-record: wrote ${MEMORY_PATH}`);
}

if (command === 'unit') {
  const id = flag('id') || fail('unit requires --id');
  const wf = flag('wf') || fail('unit requires --wf (e.g. WF-01)');
  const mode = flag('mode') || fail('unit requires --mode');
  const verdict = flag('verdict') || fail('unit requires --verdict accepted|rejected|rebuilt|cut');
  const reason = flag('reason') || fail('unit requires --reason');
  const fp = flag('fp') || fail('unit requires --fp "axis=value,..." (axes: verb,subject,sector,layer,tempo,domain)');
  if (!/^WF-\d\d$/.test(wf)) fail(`--wf must look like WF-07, got "${wf}"`);
  if (!['accepted', 'rejected', 'rebuilt', 'cut'].includes(verdict)) fail(`unknown verdict "${verdict}"`);
  if (!['repair', 'starved', 'opportunity', 'integration', 'recovery', 'multiplication'].includes(mode)) fail(`unknown mode "${mode}"`);

  const parsed = parseFingerprint(fp);
  if (Object.keys(parsed).length < 3) fail('fingerprint needs at least 3 axes so distinctness and resurrection checks have signal');

  const integration = flag('integration') || (verdict === 'accepted' ? 'live' : 'cut');
  const evidence = flag('evidence');
  const review = flag('review');
  if (verdict === 'accepted' && integration === 'live') {
    if (!evidence) fail('accepted live units require --evidence <path> (route proof artifact). A unit nobody can audit is not accepted.');
    if (!review) fail('accepted live units require --review <path> (filled adversarial review record). Self-attested acceptance does not count.');
    if (!existsSync(resolve(ROOT, evidence))) fail(`--evidence file not found: ${evidence}`);
    if (!existsSync(resolve(ROOT, review))) fail(`--review file not found: ${review}`);
  }
  if ((verdict === 'rejected' || verdict === 'cut') && !flag('root-reason')) {
    fail('rejected/cut units require --root-reason (causal defect) so failed-twice detection works');
  }

  const memory = loadMemory();
  const check = isBlockedCandidate(memory, fp, today);
  if (check.blocked && verdict === 'accepted' && !hasFlag('new-evidence')) {
    fail(`fingerprint matches recently rejected/cut unit "${check.by.id}" (${check.by.date}). If new evidence justifies resurrection, pass --new-evidence and say so in --reason.`);
  }

  recordUnit(memory, {
    id,
    date: today,
    wf,
    mode,
    verdict,
    reason,
    rootReason: flag('root-reason') || undefined,
    fingerprint: fp,
    references: (flag('refs') || '').split(',').map((s) => s.trim()).filter(Boolean),
    integration,
    evidence: evidence || undefined,
    review: review || undefined,
    sector: flag('sector') || undefined,
  });
  saveMemory(memory);
} else if (command === 'run') {
  const mode = flag('mode') || fail('run requires --mode');
  const domains = (flag('domains') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (domains.length === 0) fail('run requires --domains WF-XX[,WF-YY]');
  const memory = loadMemory();
  recordRun(memory, {
    date: today,
    mode,
    domains,
    scope: flag('scope') || undefined,
    nx: flag('nx') ? Number(flag('nx')) : undefined,
    note: flag('note') || undefined,
  });
  saveMemory(memory);
} else if (command === 'defect') {
  const id = flag('id') || fail('defect requires --id');
  const memory = loadMemory();
  if (hasFlag('resolve')) {
    const d = memory.knownDefects.find((x) => x.id === id);
    if (!d) fail(`no known defect with id "${id}"`);
    d.status = 'resolved';
    d.resolvedDate = today;
  } else {
    const wf = flag('wf') || fail('defect requires --wf');
    const severity = flag('severity') || fail('defect requires --severity foundation|suspected-foundation|ambient');
    if (!['foundation', 'suspected-foundation', 'ambient'].includes(severity)) fail(`unknown severity "${severity}"`);
    const note = flag('note') || fail('defect requires --note');
    memory.knownDefects.push({ id, wf, severity, status: 'open', date: today, note });
  }
  saveMemory(memory);
} else {
  console.log([
    'inference-record — append to the INFERENCE memory with validation.',
    '',
    'Commands: unit | run | defect',
    'Run with a command and no flags to see its required flags.',
    '',
    'Examples:',
    '  node scripts/inference-record.mjs run --mode starved --domains WF-13 --scope AUDIO --nx 1',
    '  node scripts/inference-record.mjs unit --id refinery-shift-whistle --wf WF-13 --mode starved \\',
    '    --verdict accepted --reason "refinery pocket gains shift-change audio identity" \\',
    '    --fp "verb=hear,subject=refinery,sector=ceres,layer=midground,tempo=ambient,domain=wf-13" \\',
    '    --evidence design/program/receipts/<receipt>.md --review design/inference-workflows/records/<review>.md',
    '  node scripts/inference-record.mjs unit --id gravity-toll-gate --wf WF-05 --mode repair \\',
    '    --verdict cut --reason "redundant with mass seed" --root-reason "no new tactic; overlaps existing tool" \\',
    '    --fp "verb=push,subject=chokepoint,sector=any,domain=wf-05"',
  ].join('\n'));
  process.exit(command ? 1 : 0);
}
