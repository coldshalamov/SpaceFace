#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const rootArgIndex = process.argv.indexOf('--root');
const ROOT = rootArgIndex >= 0
  ? path.resolve(process.argv[rootArgIndex + 1] || '')
  : path.resolve(SCRIPT_DIR, '..');

const errors = [];
const warnings = [];
const activeIds = ['PQ-018', 'PQ-019', 'PQ-020', 'PQ-021', 'PQ-022', 'PQ-023', 'PQ-024', 'PQ-025'];

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

const activeFiles = [
  'design/program/roadmap/active/README.md',
  'design/program/roadmap/active/PACKET_TEMPLATE.md',
  ...activeIds.map((id) => `design/program/roadmap/active/${id}.md`),
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

function normalizeTarget(sourceRel, rawTarget) {
  let target = rawTarget.trim();
  if (!target || target.startsWith('#')) return null;
  if (/^(?:https?:|mailto:|data:|javascript:)/i.test(target)) return null;
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
  target = target.split('#')[0].split('?')[0];
  try { target = decodeURIComponent(target); } catch { /* preserve original */ }
  if (!target) return null;
  const sourceDir = path.dirname(sourceRel);
  return path.normalize(path.join(sourceDir, target)).replaceAll('\\', '/');
}

function checkLinks(rel, text) {
  const withoutFences = text.replace(/```[\s\S]*?```/g, '');
  const linkPattern = /!?(?:\[[^\]]*\])\(([^)]+)\)/g;
  for (const match of withoutFences.matchAll(linkPattern)) {
    const raw = match[1].trim().replace(/^['"]|['"]$/g, '');
    const target = normalizeTarget(rel, raw);
    if (!target) continue;
    if (target.startsWith('../') || target === '..') {
      errors.push(`${rel}: link escapes repository root: ${raw}`);
      continue;
    }
    if (!exists(target)) errors.push(`${rel}: broken relative link -> ${raw} (resolved ${target})`);
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
    if (/\b[0-9a-f]{40}\b/i.test(text)) {
      errors.push(`${rel}: stable document contains a commit SHA; link volatile/evidence state instead`);
    }
    checkLinks(rel, text);
  }
}

function checkVolatileBoard() {
  const rel = 'design/program/NOW.md';
  requireFile(rel);
  if (!exists(rel)) return;
  const text = read(rel);
  requirePattern(rel, text, /<!--\s*LIFETIME:\s*VOLATILE\s*-->/, 'missing VOLATILE lifetime marker');
  requirePattern(rel, text, /refreshed:\s*\d{4}-\d{2}-\d{2}/, 'missing refreshed date');
  requirePattern(rel, text, /baseCommit:\s*[0-9a-f]{40}\b/i, 'missing 40-hex baseCommit');
  requirePattern(rel, text, /expiresAfterCommits:\s*\d+/, 'missing expiresAfterCommits');

  const forbiddenHeadings = /^#{1,6}\s+.*(?:closeout|integration record|timeline|histor(?:y|ical log)|daily log)/gmi;
  for (const match of text.matchAll(forbiddenHeadings)) {
    errors.push(`${rel}: volatile board contains historical heading: ${match[0]}`);
  }
  checkLinks(rel, text);

  const base = text.match(/baseCommit:\s*([0-9a-f]{40})\b/i)?.[1];
  const expiry = Number(text.match(/expiresAfterCommits:\s*(\d+)/)?.[1] || 0);
  if (base && expiry > 0 && exists('.git')) {
    try {
      const count = Number(execFileSync('git', ['rev-list', '--count', `${base}..HEAD`], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim());
      if (Number.isFinite(count) && count > expiry) {
        errors.push(`${rel}: stale by ${count} commits (expiry ${expiry}); refresh leases before dispatch`);
      }
    } catch (error) {
      warnings.push(`${rel}: could not evaluate baseCommit freshness (${error.message})`);
    }
  }
}

function checkQueue() {
  const rel = 'design/program/roadmap/program-queue.json';
  requireFile(rel);
  if (!exists(rel)) return;

  let parsed;
  try {
    parsed = JSON.parse(read(rel));
  } catch (error) {
    errors.push(`${rel}: invalid JSON (${error.message})`);
    return;
  }

  const rows = Array.isArray(parsed) ? parsed : (parsed.queue || parsed.items || parsed.packets || parsed.tasks);
  if (!Array.isArray(rows)) {
    errors.push(`${rel}: expected top-level array or queue/items/packets/tasks array`);
    return;
  }

  const ids = new Map();
  const priorities = new Map();
  const canon = new Map();

  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object') {
      errors.push(`${rel}: row ${index} is not an object`);
      continue;
    }
    if (typeof row.id !== 'string' || !/^PQ-\d{3}$/.test(row.id)) {
      errors.push(`${rel}: row ${index} has invalid id ${JSON.stringify(row.id)}`);
      continue;
    }
    if (ids.has(row.id)) errors.push(`${rel}: duplicate id ${row.id}`);
    ids.set(row.id, row);

    if (row.priority !== undefined) {
      if (!Number.isInteger(row.priority)) errors.push(`${rel}: ${row.id} priority must be an integer`);
      else if (priorities.has(row.priority)) errors.push(`${rel}: duplicate priority ${row.priority} (${priorities.get(row.priority)}, ${row.id})`);
      else priorities.set(row.priority, row.id);
    }

    for (const token of [...(row.canonical || []), ...(row.aliases || [])]) {
      if (typeof token !== 'string' || !token) continue;
      if (!canon.has(token)) canon.set(token, []);
      canon.get(token).push(row.id);
    }
  }

  for (const row of rows) {
    if (!row?.id) continue;
    for (const dependency of row.dependsOn || []) {
      if (!ids.has(dependency)) errors.push(`${rel}: ${row.id} depends on missing ${dependency}`);
      if (dependency === row.id) errors.push(`${rel}: ${row.id} depends on itself`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      errors.push(`${rel}: dependency cycle ${[...stack.slice(start), id].join(' -> ')}`);
      return;
    }
    visiting.add(id);
    stack.push(id);
    for (const dep of ids.get(id)?.dependsOn || []) if (ids.has(dep)) visit(dep);
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids.keys()) visit(id);

  for (const [token, owners] of canon.entries()) {
    const unique = [...new Set(owners)];
    if (unique.length > 1) warnings.push(`${rel}: canonical/alias token ${token} is shared by ${unique.join(', ')}`);
  }

  for (const id of activeIds) {
    if (!ids.has(id)) errors.push(`${rel}: active packet ${id} has no queue row`);
  }
}

function checkActivePackets() {
  for (const rel of activeFiles) {
    requireFile(rel);
    if (!exists(rel)) continue;
    const text = read(rel);
    requirePattern(rel, text, /<!--\s*LIFETIME:\s*ACTIVE_PACKET\s*-->/, 'missing ACTIVE_PACKET lifetime marker');
    checkLinks(rel, text);
  }

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

  for (const id of activeIds) {
    const rel = `design/program/roadmap/active/${id}.md`;
    if (!exists(rel)) continue;
    const text = read(rel);
    requirePattern(rel, text, new RegExp(`queueId:\\s*${id.replace('-', '\\-')}\\b`), `metadata does not bind ${id}`);
    for (const [label, pattern] of required) requirePattern(rel, text, pattern, `missing required section: ${label}`);
    requirePattern(rel, text, /maxAcceptanceLaunchesPerCandidateDigest:\s*1\b/, 'must declare one acceptance launch per candidate digest');
    requirePattern(rel, text, /maxIndependentReviewPasses:\s*2\b/, 'must declare finite two-pass review budget');
  }
}

function main() {
  if (!ROOT || !fs.existsSync(ROOT)) {
    console.error(`program-docs: invalid root ${ROOT}`);
    process.exit(2);
  }

  checkStableDocuments();
  checkVolatileBoard();
  checkQueue();
  checkActivePackets();

  for (const warning of warnings) console.warn(`WARN ${warning}`);
  for (const error of errors) console.error(`ERROR ${error}`);

  if (errors.length) {
    console.error(`program-docs: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
    process.exit(1);
  }
  console.log(`program-docs: PASS (${warnings.length} warning(s))`);
}

main();
