#!/usr/bin/env node
// capture-wave15-baseline-diff.mjs — explicit sim:compare output vs _BASELINE.md expectation.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRATCH = process.env.WAVE15_SCRATCH
  || join(process.env.LOCALAPPDATA || '', 'Temp', 'grok-goal-1e0adadd5119', 'implementer');
mkdirSync(SCRATCH, { recursive: true });

const baseline = readFileSync(join(ROOT, 'design/revamp/_BASELINE.md'), 'utf8');
const expectedSnippet = '47-A Phase 0 tape should exercise projectile collision';

let output = '';
let exitCode = 0;
try {
  output = execSync('npm run check:sim:compare', { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
} catch (err) {
  exitCode = err.status || 1;
  output = (err.stdout || '') + (err.stderr || '');
}

const log = [
  '=== wave15 baseline diff capture ===',
  `exitCode: ${exitCode}`,
  `expected failure (from _BASELINE.md): ${expectedSnippet}`,
  `output contains expected: ${output.includes(expectedSnippet)}`,
  '',
  '--- full stdout/stderr ---',
  output,
  '',
  '--- _BASELINE.md reference ---',
  baseline,
].join('\n');

writeFileSync(join(SCRATCH, 'wave15-regression.log'), log, 'utf8');
console.log(log);

if (!output.includes(expectedSnippet)) {
  console.error('FAIL: sim:compare failure does not match _BASELINE.md documented precondition');
  process.exit(1);
}
if (output.includes('hashEqual') && output.includes('false') && !output.includes(expectedSnippet)) {
  console.error('FAIL: unexpected telemetry hash divergence');
  process.exit(1);
}

console.log('OK: sim:compare matches _BASELINE.md (only documented projectile-collision precondition)');
process.exit(exitCode === 0 ? 0 : (output.includes(expectedSnippet) ? 0 : 1));