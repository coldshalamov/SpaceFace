#!/usr/bin/env node
// ECON-P6 — professional economy depth / anti-exploit gate (tests & evidence only).
//
// Ownership: this file + test/economy-professional-anti-exploit.test.mjs +
// .devshots/economy/README.md. Does NOT edit package.json, production code, goldens,
// or existing tests. Does NOT register itself in package.json (run by path).
//
// Exit codes:
//   0 — no RED (fail) cases. SKIP is allowed and printed.
//   1 — one or more RED cases, or suite could not load.
//
// Machine-readable matrix always printed as the final JSON object on stdout
// (prefixed with a short human summary on stderr/stdout lines).

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const TEST_FILE = join(REPO_ROOT, 'test/economy-professional-anti-exploit.test.mjs');
const README_FILE = join(REPO_ROOT, '.devshots/economy/README.md');

assert.equal(typeof window, 'undefined', 'check-economy-professional-depth must run headless');

function failLoad(message, extra = {}) {
  const matrix = {
    packet: 'ECON-P6',
    suite: 'economy-professional-anti-exploit',
    results: [{
      id: 'suite_load',
      title: 'Load anti-exploit suite',
      status: 'fail',
      reason: 'load_error',
      detail: message,
    }],
    summary: { pass: 0, fail: 1, skip: 0, total: 1 },
    red: [{ id: 'suite_load', status: 'fail', reason: 'load_error', detail: message }],
    skip: [],
    ok: false,
    evidenceReadme: existsSync(README_FILE),
    ...extra,
  };
  console.log(JSON.stringify(matrix, null, 2));
  process.exit(1);
}

if (!existsSync(TEST_FILE)) {
  failLoad(`missing ${TEST_FILE}`);
}

const mod = await import(pathToFileURL(TEST_FILE).href);
if (typeof mod.runAntiExploitSuite !== 'function') {
  failLoad('test/economy-professional-anti-exploit.test.mjs must export runAntiExploitSuite()');
}

const matrix = mod.runAntiExploitSuite();

// README is the third owned artifact — routes only, no capture claims.
const readmeOk = existsSync(README_FILE);
let readmeDetail = readmeOk ? 'present' : 'missing';
if (readmeOk) {
  const text = readFileSync(README_FILE, 'utf8');
  const numbered = (text.match(/###?\s*Route\s*\d/gi) || []).length
    || (text.match(/\|\s*R0[1-7]\s*\|/g) || []).length
    || (text.match(/^\d+\.\s+\*\*/gm) || []).length;
  if (numbered < 7) {
    readmeDetail = `route_count=${numbered}<7`;
  }
  if (/captured on|artifact present|PASS evidence|screenshot exists/i.test(text)) {
    readmeDetail = 'claims_artifacts';
  }
}

const envelope = {
  ...matrix,
  evidenceReadme: {
    path: '.devshots/economy/README.md',
    ok: readmeOk && readmeDetail === 'present',
    detail: readmeDetail,
  },
  // Compact red/skip matrix for orchestration consumers.
  red_skip_matrix: {
    red: (matrix.red || []).map((r) => ({
      id: r.id,
      status: 'fail',
      reason: r.reason || 'assert',
      detail: r.detail || null,
    })),
    skip: (matrix.skip || []).map((r) => ({
      id: r.id,
      status: 'skip',
      reason: r.reason || 'skip',
      detail: r.detail || null,
    })),
    pass_ids: (matrix.results || []).filter((r) => r.status === 'pass').map((r) => r.id),
  },
};

// Human summary (lines before the JSON payload).
const { summary } = matrix;
console.log(
  `[check-economy-professional-depth] ECON-P6 `
  + `pass=${summary.pass} skip=${summary.skip} fail=${summary.fail} total=${summary.total}`,
);
for (const r of matrix.results || []) {
  const tag = r.status === 'pass' ? 'PASS' : r.status === 'skip' ? 'SKIP' : 'RED';
  const why = r.reason ? ` ${r.reason}` : '';
  const det = r.detail ? ` — ${r.detail}` : '';
  console.log(`  ${tag} ${r.id}${why}${det}`);
}
if (!envelope.evidenceReadme.ok) {
  console.log(`  WARN evidence README: ${envelope.evidenceReadme.detail}`);
}

console.log(JSON.stringify(envelope, null, 2));

// README defects are warnings for depth-check unless missing entirely (owned deliverable).
if (!readmeOk) {
  process.exit(1);
}
process.exit(matrix.ok ? 0 : 1);
