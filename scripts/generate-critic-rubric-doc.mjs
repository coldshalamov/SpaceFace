#!/usr/bin/env node
// scripts/generate-critic-rubric-doc.mjs — FUN_CONVERGENCE_LOOP.md §3.3 is generated, not written.
//
// The critic's rubric (the ten questions, the seven blockers, the intent result, the play judgment,
// and the sentences that bind them) lives ONCE, in scripts/lib/critic/rubric.mjs. This script writes
// that rubric into the document between its markers, so the law the owner reads and the law the
// tool enforces cannot drift. `--check` refuses a document that differs (test/fun-critic.test.mjs
// runs the same comparison).
//
// Usage:
//   node scripts/generate-critic-rubric-doc.mjs           # write the block
//   node scripts/generate-critic-rubric-doc.mjs --check   # exit 1 if the block is stale

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spliceRubricDoc, RUBRIC_DOC_BEGIN, RUBRIC_DOC_END } from './lib/critic/rubric.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const RUBRIC_DOC_PATH = resolve(__dirname, '../design/program/FUN_CONVERGENCE_LOOP.md');

/**
 * @param {{ check?: boolean, path?: string }} [options]
 * @returns {{ ok: boolean, changed: boolean, reason?: string }}
 */
export function syncRubricDoc({ check = false, path = RUBRIC_DOC_PATH } = {}) {
  const original = readFileSync(path, 'utf8');
  const result = spliceRubricDoc(original);
  if (!result.ok) {
    return { ok: false, changed: false, reason: `${result.reason} in ${path} (expected ${RUBRIC_DOC_BEGIN} … ${RUBRIC_DOC_END})` };
  }
  if (!result.changed) return { ok: true, changed: false };
  if (check) {
    return { ok: false, changed: true, reason: `${path} §3.3 does not match scripts/lib/critic/rubric.mjs; run node scripts/generate-critic-rubric-doc.mjs` };
  }
  writeFileSync(path, result.text, 'utf8');
  return { ok: true, changed: true };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const check = process.argv.includes('--check');
  const res = syncRubricDoc({ check });
  if (!res.ok) {
    console.error(`[critic-rubric-doc] ${res.reason}`);
    process.exit(1);
  }
  console.log(`[critic-rubric-doc] ${res.changed ? 'wrote' : 'up to date:'} ${RUBRIC_DOC_PATH}`);
}
