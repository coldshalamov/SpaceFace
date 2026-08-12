#!/usr/bin/env node
/**
 * Static contract check for the active INFERENCE control surface.
 *
 * This catches the exact class of regression that caused the August 2026 loop:
 * unbounded autonomous prompts, mandatory fresh-review bureaucracy, and support
 * infrastructure being allowed to masquerade as production.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const activeFiles = [
  'design/program/AGENTS.md',
  'design/program/INFERENCE_LANES.md',
  'design/program/INFERENCE_LEDGER.md',
  'design/inference-workflows/README.md',
  'design/inference-workflows/MASTER_AGENT_PROMPT.md',
  'design/inference-workflows/01_SCALE_AND_DISPATCH.md',
  'design/inference-workflows/02_CREATIVE_CONVERGENCE_LOOP.md',
  'design/inference-workflows/05_ADVERSARIAL_REVIEW_PROTOCOL.md',
  'design/inference-workflows/templates/INVOCATION_TEMPLATE.md',
  'scripts/inference-record.mjs',
];

const banned = [
  [/run continuously for days/i, 'unbounded multi-day loop'],
  [/iterate until no substantive faults remain/i, 'impossible perfection stop condition'],
  [/creator\s+(?:\*\*)?never(?:\*\*)?\s+issues its own verdict/i, 'mandatory external verdict'],
  [/self-attested acceptance does not count/i, 'blanket rejection of disclosed self-review'],
  [/accepted live units require evidence \+ review/i, 'mandatory evidence-plus-review paperwork'],
  [/follow the selected workflow completely/i, 'mandatory whole-workflow ceremony'],
  [/inference-detect\.mjs[^\n]*--nx/i, 'passing production target into advisory detector'],
];

function read(relative) {
  const path = resolve(ROOT, relative);
  if (!existsSync(path)) {
    errors.push(`${relative}: missing`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

for (const relative of activeFiles) {
  const text = read(relative);
  for (const [pattern, label] of banned) {
    if (pattern.test(text)) errors.push(`${relative}: contains ${label}`);
  }
}

const lanes = read('design/program/INFERENCE_LANES.md');
for (const marker of ['PRODUCTION-FIRST', 'SUPPORT-WORK CAP', 'TERMINATION']) {
  if (!lanes.includes(marker)) errors.push(`design/program/INFERENCE_LANES.md: missing ${marker}`);
}
for (const claim of [
  'support-only commit',
  'route-unproven',
  'implemented',
  'production units',
]) {
  if (!lanes.toLowerCase().includes(claim.toLowerCase())) {
    errors.push(`design/program/INFERENCE_LANES.md: missing required claim "${claim}"`);
  }
}

const rootGoal = read('GOAL_PROMPT.txt');
if (!/LIFETIME:\s*HISTORICAL/i.test(rootGoal) || !/INACTIVE LEGACY PROMPT/i.test(rootGoal)) {
  errors.push('GOAL_PROMPT.txt: legacy root prompt must remain explicitly historical and inactive');
}

const recorder = read('scripts/inference-record.mjs');
for (const required of [
  "'implemented'",
  '--commit <production commit sha>',
  'route_accepted',
  'A --review path is optional',
]) {
  if (!recorder.includes(required)) {
    errors.push(`scripts/inference-record.mjs: missing production-first recorder contract "${required}"`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  console.error(`inference-control: FAIL (${errors.length} error(s))`);
  process.exit(1);
}

console.log(`inference-control: PASS (${activeFiles.length} active surfaces checked)`);
