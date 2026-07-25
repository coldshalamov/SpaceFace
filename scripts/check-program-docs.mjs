#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  ProgramControlError,
  parsePacketDocument,
  validateControlPlane,
} from './lib/programControlPlane.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const errors = [];
const warnings = [];

let values;
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    allowPositionals: false,
    options: {
      root: { type: 'string' },
      'allow-no-git': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  }));
} catch (error) {
  console.error(`program-docs: ${error.message}`);
  process.exit(2);
}

if (values.help) {
  console.log('Usage: node scripts/check-program-docs.mjs [--root PATH] [--allow-no-git]');
  process.exit(0);
}

const ROOT = values.root ? path.resolve(values.root) : path.resolve(SCRIPT_DIR, '..');
const ALLOW_NO_GIT = Boolean(values['allow-no-git']);

const stableFiles = [
  'CANONICAL_BUILD_MAP.md',
  'AGENTS.md',
  'design/AGENTS.md',
  'design/program/AGENTS.md',
  'design/program/README.md',
  'design/program/PROGRAM_MAP.md',
  'design/program/roadmap/README.md',
  'design/program/roadmap/00_EXECUTION_PROTOCOL.md',
  'docs/POLICY_MANIFEST.md',
  'docs/README.md',
  'docs/OPEN_SOURCE_INTAKE.md',
  'scripts/AGENTS.md',
];

function absolute(rel) {
  return path.join(ROOT, ...rel.split('/'));
}

function exists(rel) {
  return fs.existsSync(absolute(rel));
}

function read(rel) {
  try {
    return fs.readFileSync(absolute(rel), 'utf8');
  } catch (error) {
    errors.push(`${rel}: cannot read (${error.message})`);
    return '';
  }
}

function requireFile(rel) {
  if (!exists(rel)) errors.push(`${rel}: required file is missing`);
}

function requirePattern(rel, text, pattern, message) {
  if (!pattern.test(text)) errors.push(`${rel}: ${message}`);
}

function linkTargets(text) {
  const withoutFences = text.replace(/```[\s\S]*?```/g, '');
  const targets = [];
  const inline = /!?\[[^\]]*]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g;
  for (const match of withoutFences.matchAll(inline)) targets.push(match[1]);
  const reference = /^\s*\[[^\]]+]:\s*(<[^>]+>|\S+)/gm;
  for (const match of withoutFences.matchAll(reference)) targets.push(match[1]);
  return targets;
}

function checkLinks(rel, text) {
  for (let rawTarget of linkTargets(text)) {
    rawTarget = rawTarget.trim();
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) {
      rawTarget = rawTarget.slice(1, -1);
    }
    if (!rawTarget || rawTarget.startsWith('#')) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(rawTarget) || path.isAbsolute(rawTarget)) continue;

    const fileTarget = rawTarget.split('#')[0].split('?')[0];
    if (!fileTarget) continue;
    let decoded = fileTarget;
    try {
      decoded = decodeURIComponent(fileTarget);
    } catch {
      errors.push(`${rel}: link has invalid URI encoding: ${rawTarget}`);
      continue;
    }

    const resolved = path.resolve(path.dirname(absolute(rel)), decoded);
    const relativeToRoot = path.relative(ROOT, resolved);
    if (relativeToRoot === '..' || relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
      errors.push(`${rel}: link escapes repository root: ${rawTarget}`);
      continue;
    }
    if (!fs.existsSync(resolved)) {
      errors.push(`${rel}: broken relative link -> ${rawTarget}`);
    }
  }
}

function checkStableDocuments() {
  for (const rel of stableFiles) {
    requireFile(rel);
    if (!exists(rel)) continue;
    const text = read(rel);
    requirePattern(rel, text, /<!--\s*LIFETIME:\s*STABLE\s*-->/, 'missing STABLE lifetime marker');
    if (/^\s*(?:Snapshot(?: date)?|Current integration snapshot|Current checkout reality):/mi.test(text)) {
      errors.push(`${rel}: stable document contains volatile snapshot prose`);
    }
    checkLinks(rel, text);
  }
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function gitResult(args) {
  return spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function checkVolatileBoard() {
  const rel = 'design/program/NOW.md';
  requireFile(rel);
  if (!exists(rel)) return;
  const text = read(rel);
  requirePattern(rel, text, /<!--\s*LIFETIME:\s*VOLATILE\s*-->/, 'missing VOLATILE lifetime marker');
  checkLinks(rel, text);

  const refreshed = text.match(/refreshed:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  const base = text.match(/baseCommit:\s*([0-9a-f]{40})\b/i)?.[1];
  const expiryCommits = Number(text.match(/expiresAfterCommits:\s*(\d+)/)?.[1]);
  const expiryDays = Number(text.match(/expiresAfterDays:\s*(\d+)/)?.[1]);

  if (!refreshed || !validIsoDate(refreshed)) errors.push(`${rel}: refreshed must be a real ISO date`);
  if (!base) errors.push(`${rel}: missing 40-hex baseCommit`);
  if (!Number.isInteger(expiryCommits) || expiryCommits < 1 || expiryCommits > 100) {
    errors.push(`${rel}: expiresAfterCommits must be an integer from 1 to 100`);
  }
  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 30) {
    errors.push(`${rel}: expiresAfterDays must be an integer from 1 to 30`);
  }

  if (refreshed && validIsoDate(refreshed) && Number.isInteger(expiryDays) && expiryDays > 0) {
    const ageDays = Math.floor((Date.now() - new Date(`${refreshed}T00:00:00Z`).getTime()) / 86_400_000);
    if (ageDays > expiryDays) errors.push(`${rel}: stale by age (${ageDays} days, expiry ${expiryDays})`);
    if (ageDays < -1) errors.push(`${rel}: refreshed date is in the future`);
  }

  const inside = gitResult(['rev-parse', '--is-inside-work-tree']);
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    if (!ALLOW_NO_GIT) errors.push(`${rel}: Git freshness is unavailable; use --allow-no-git only for exported fixtures`);
    return;
  }
  if (!base || !Number.isInteger(expiryCommits) || expiryCommits < 1) return;

  const object = gitResult(['cat-file', '-e', `${base}^{commit}`]);
  if (object.status !== 0) {
    errors.push(`${rel}: baseCommit is not available as a commit`);
    return;
  }
  const ancestor = gitResult(['merge-base', '--is-ancestor', base, 'HEAD']);
  if (ancestor.status !== 0) {
    errors.push(`${rel}: baseCommit is not an ancestor of HEAD`);
    return;
  }
  try {
    const count = Number(execFileSync('git', ['rev-list', '--count', `${base}..HEAD`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim());
    if (!Number.isFinite(count)) errors.push(`${rel}: commit freshness returned a non-number`);
    else if (count > expiryCommits) {
      errors.push(`${rel}: stale by ${count} commits (expiry ${expiryCommits})`);
    }
  } catch (error) {
    errors.push(`${rel}: could not evaluate commit freshness (${error.message})`);
  }
}

function readQueue() {
  const rel = 'design/program/roadmap/program-queue.json';
  requireFile(rel);
  if (!exists(rel)) return null;
  let parsed;
  try {
    parsed = JSON.parse(read(rel));
  } catch (error) {
    errors.push(`${rel}: invalid JSON (${error.message})`);
    return null;
  }
  try {
    return validateControlPlane(ROOT, parsed, { allowNoGit: ALLOW_NO_GIT });
  } catch (error) {
    if (error instanceof ProgramControlError) {
      for (const detail of error.details.length ? error.details : [error.message]) {
        errors.push(`${rel}: ${detail}`);
      }
      return null;
    }
    throw error;
  }
}

function activePacketFiles() {
  const dir = absolute('design/program/roadmap/active');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^PQ-\d{3}\.md$/.test(name))
    .sort()
    .map((name) => `design/program/roadmap/active/${name}`);
}

function checkPacketSections(rel, packet) {
  const required = [
    ['Outcome', /^##\s+Outcome\b/mi],
    ['Entry conditions', /^##\s+Entry conditions\b/mi],
    ['Work breakdown/phased implementation', /^##\s+(?:Work breakdown|Phased implementation)\b/mi],
    ['Non-goals', /^##\s+Non-goals\b/mi],
    ['Performance', /^##\s+.*Performance.*\b/mi],
    ['Verification budget', /^##\s+Verification budget\b/mi],
    ['Review questions', /^##\s+Review questions\b/mi],
    ['Stop conditions', /^##\s+Stop conditions\b/mi],
    ['Checkoff', /^##\s+.*Checkoff.*\b/mi],
  ];
  for (const [label, pattern] of required) {
    if (!pattern.test(packet.prose)) errors.push(`${rel}: missing required section: ${label}`);
  }
}

function checkActivePackets(control) {
  for (const rel of [
    'design/program/roadmap/active/README.md',
    'design/program/roadmap/active/PACKET_TEMPLATE.md',
  ]) {
    requireFile(rel);
    if (!exists(rel)) continue;
    requirePattern(rel, read(rel), /<!--\s*LIFETIME:\s*ACTIVE_PACKET\s*-->/, 'missing ACTIVE_PACKET lifetime marker');
    checkLinks(rel, read(rel));
  }

  const files = activePacketFiles();
  const packets = new Map();
  for (const rel of files) {
    const text = read(rel);
    checkLinks(rel, text);
    try {
      const packet = parsePacketDocument(text, rel);
      const id = path.basename(rel, '.md');
      if (packet.metadata.queueId !== id) {
        errors.push(`${rel}: queueId ${packet.metadata.queueId} does not match filename ${id}`);
      }
      if (packets.has(packet.metadata.queueId)) {
        errors.push(`${rel}: duplicate active packet for ${packet.metadata.queueId}`);
      }
      packets.set(packet.metadata.queueId, { rel, packet });
      checkPacketSections(rel, packet);
    } catch (error) {
      if (error instanceof ProgramControlError) {
        for (const detail of error.details.length ? error.details : [error.message]) errors.push(detail);
      } else {
        throw error;
      }
    }
  }

  const needsPacket = new Set(['planned', 'ready', 'claimed', 'implemented', 'blocked']);
  for (const row of control.rows) {
    if (needsPacket.has(row.state) && !packets.has(row.id)) {
      errors.push(`design/program/roadmap/active: ${row.id} state ${row.state} requires an active packet`);
    }
  }
  for (const [id, entry] of packets) {
    const row = control.byId.get(id);
    if (!row) {
      errors.push(`${entry.rel}: no queue row for ${id}`);
      continue;
    }
    if (control.contract.checkedOff.has(row.state) || row.state === 'deferred') {
      errors.push(`${entry.rel}: queue state ${row.state} requires packet retirement`);
    }
  }

  for (const [token, owners] of control.canonicalOwners) {
    if (owners.size < 2) continue;
    for (const id of owners) {
      const entry = packets.get(id);
      if (!entry) continue;
      if (['planned', 'ready'].includes(entry.packet.metadata.lifecycle)
          && !entry.packet.metadata.identityAction) {
        errors.push(`${entry.rel}: unresolved shared identity ${token} requires identityAction or blocked lifecycle`);
      }
    }
  }
}

function main() {
  if (!ROOT || !fs.existsSync(ROOT)) {
    console.error(`program-docs: invalid root ${ROOT}`);
    process.exit(2);
  }

  checkStableDocuments();
  checkVolatileBoard();
  const control = readQueue();
  if (control) {
    checkActivePackets(control);
  }

  for (const warning of warnings) console.warn(`WARN ${warning}`);
  for (const error of [...new Set(errors)]) console.error(`ERROR ${error}`);

  if (errors.length) {
    console.error(`program-docs: FAIL (${new Set(errors).size} error(s), ${warnings.length} warning(s))`);
    process.exit(1);
  }
  console.log(`program-docs: PASS (${warnings.length} warning(s))`);
}

main();
