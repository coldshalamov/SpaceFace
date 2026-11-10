#!/usr/bin/env node
/**
 * Record an INFERENCE run, production unit, or known defect.
 *
 * Production-first semantics:
 * - `implemented` and `accepted` live/source units require a production commit.
 * - `implemented` may be `unproven` or `focused_green`.
 * - `accepted` requires current evidence and `route_accepted` or `milestone_accepted`.
 * - a separate review record is optional; reviewer availability never blocks implementation.
 * - rejected/cut units require a causal root reason for anti-resurrection memory.
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

function fail(message) {
  console.error(`inference-record: ${message}`);
  process.exit(1);
}

function loadMemory() {
  let raw = null;
  if (existsSync(MEMORY_PATH)) {
    try {
      raw = JSON.parse(readFileSync(MEMORY_PATH, 'utf8'));
    } catch {
      fail(`memory file exists but is not valid JSON: ${MEMORY_PATH}. Fix it before recording.`);
    }
  }
  const { memory, warnings } = normalizeMemory(raw, today);
  for (const warning of warnings) console.warn(`inference-record: ${warning}`);
  return memory;
}

function saveMemory(memory) {
  writeFileSync(MEMORY_PATH, `${JSON.stringify(memory, null, 2)}\n`, 'utf8');
  console.log(`inference-record: wrote ${MEMORY_PATH}`);
}

function existingOptionalPath(name) {
  const value = flag(name);
  if (value && !existsSync(resolve(ROOT, value))) {
    fail(`--${name} file not found: ${value}`);
  }
  return value || undefined;
}

if (command === 'unit') {
  const id = flag('id') || fail('unit requires --id');
  const wf = flag('wf') || fail('unit requires --wf (for example WF-01)');
  const mode = flag('mode') || fail('unit requires --mode');
  const verdict = flag('verdict') || fail(
    'unit requires --verdict implemented|accepted|rejected|rebuilt|cut',
  );
  const reason = flag('reason') || fail('unit requires --reason');
  const fingerprint = flag('fp') || fail(
    'unit requires --fp "axis=value,..." (axes: verb,subject,sector,layer,tempo,domain)',
  );

  if (!/^WF-\d\d$/.test(wf)) fail(`--wf must look like WF-07, got "${wf}"`);
  if (!['implemented', 'accepted', 'rejected', 'rebuilt', 'cut'].includes(verdict)) {
    fail(`unknown verdict "${verdict}"`);
  }
  if (!['repair', 'starved', 'opportunity', 'integration', 'recovery', 'multiplication'].includes(mode)) {
    fail(`unknown mode "${mode}"`);
  }

  const parsed = parseFingerprint(fingerprint);
  if (Object.keys(parsed).length < 3) {
    fail('fingerprint needs at least 3 axes so distinctness and resurrection checks have signal');
  }

  const productionVerdict = verdict === 'implemented' || verdict === 'accepted';
  const integration = flag('integration') || (productionVerdict ? 'live' : 'cut');
  const commit = flag('commit');
  const verification = flag('verification')
    || (verdict === 'accepted' ? 'route_accepted' : verdict === 'implemented' ? 'focused_green' : undefined);
  const evidence = existingOptionalPath('evidence');
  const review = existingOptionalPath('review');

  if (productionVerdict) {
    if (!commit) {
      fail(`${verdict} units require --commit <production commit sha>; support artifacts do not count`);
    }
    if (!/^[0-9a-f]{7,40}$/i.test(commit)) {
      fail(`--commit must be a 7-40 character hexadecimal Git commit sha, got "${commit}"`);
    }
    if (!['live', 'source-only'].includes(integration)) {
      fail(`${verdict} units require --integration live|source-only, got "${integration}"`);
    }
  }

  if (verdict === 'implemented') {
    if (!['unproven', 'focused_green'].includes(verification)) {
      fail('implemented units require --verification unproven|focused_green');
    }
  }

  if (verdict === 'accepted') {
    if (!['route_accepted', 'milestone_accepted'].includes(verification)) {
      fail('accepted units require --verification route_accepted|milestone_accepted');
    }
    if (!evidence) {
      fail('accepted units require --evidence <current route or milestone evidence path>');
    }
  }

  if ((verdict === 'rejected' || verdict === 'cut') && !flag('root-reason')) {
    fail('rejected/cut units require --root-reason so failed-twice detection works');
  }

  const memory = loadMemory();
  const blocked = isBlockedCandidate(memory, fingerprint, today);
  if (blocked.blocked && productionVerdict && !hasFlag('new-evidence')) {
    fail(
      `fingerprint matches recently rejected/cut unit "${blocked.by.id}" (${blocked.by.date}). `
      + 'Pass --new-evidence only when the reason explains the new evidence.',
    );
  }

  recordUnit(memory, {
    id,
    date: today,
    wf,
    mode,
    verdict,
    reason,
    rootReason: flag('root-reason') || undefined,
    fingerprint,
    references: (flag('refs') || '').split(',').map((value) => value.trim()).filter(Boolean),
    integration,
    commit: commit || undefined,
    verification,
    evidence,
    review,
    sector: flag('sector') || undefined,
  });
  saveMemory(memory);
} else if (command === 'run') {
  const mode = flag('mode') || fail('run requires --mode');
  const domains = (flag('domains') || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (domains.length === 0) fail('run requires --domains WF-XX[,WF-YY]');
  if (!['repair', 'starved', 'opportunity', 'integration', 'recovery', 'multiplication'].includes(mode)) {
    fail(`unknown mode "${mode}"`);
  }

  const nxRaw = flag('nx');
  const nx = nxRaw == null ? undefined : Number(nxRaw);
  if (nxRaw != null && (!Number.isInteger(nx) || nx < 1)) {
    fail(`--nx must be a positive integer, got "${nxRaw}"`);
  }

  const memory = loadMemory();
  recordRun(memory, {
    date: today,
    mode,
    domains,
    scope: flag('scope') || undefined,
    nx,
    note: flag('note') || undefined,
  });
  saveMemory(memory);
} else if (command === 'defect') {
  const id = flag('id') || fail('defect requires --id');
  const memory = loadMemory();

  if (hasFlag('resolve')) {
    const defect = memory.knownDefects.find((entry) => entry.id === id);
    if (!defect) fail(`no known defect with id "${id}"`);
    defect.status = 'resolved';
    defect.resolvedDate = today;
  } else {
    const wf = flag('wf') || fail('defect requires --wf');
    const severity = flag('severity')
      || fail('defect requires --severity foundation|suspected-foundation|ambient');
    if (!['foundation', 'suspected-foundation', 'ambient'].includes(severity)) {
      fail(`unknown severity "${severity}"`);
    }
    const note = flag('note') || fail('defect requires --note');
    memory.knownDefects.push({ id, wf, severity, status: 'open', date: today, note });
  }
  saveMemory(memory);
} else {
  console.log([
    'inference-record — record bounded production inference.',
    '',
    'Commands: unit | run | defect',
    '',
    'Implemented unit:',
    '  node scripts/inference-record.mjs unit --id refinery-shift-whistle --wf WF-13 \\',
    '    --mode starved --verdict implemented --verification focused_green \\',
    '    --commit abc1234 --reason "live shift-change audio" \\',
    '    --fp "verb=hear,subject=refinery,sector=ceres,domain=wf-13"',
    '',
    'Accepted unit:',
    '  node scripts/inference-record.mjs unit --id refinery-shift-whistle --wf WF-13 \\',
    '    --mode starved --verdict accepted --verification route_accepted \\',
    '    --commit abc1234 --evidence design/program/receipts/refinery-route.md \\',
    '    --reason "ordinary route exposes shift-change audio" \\',
    '    --fp "verb=hear,subject=refinery,sector=ceres,domain=wf-13"',
    '',
    'A --review path is optional metadata for either production verdict.',
  ].join('\n'));
  process.exit(command ? 1 : 0);
}
