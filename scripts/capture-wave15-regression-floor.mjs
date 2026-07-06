#!/usr/bin/env node
// capture-wave15-regression-floor.mjs — single combined regression floor log (plan verification step 1).
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRATCH = process.env.WAVE15_SCRATCH
  || join(process.env.LOCALAPPDATA || '', 'Temp', 'grok-goal-1e0adadd5119', 'implementer');
mkdirSync(SCRATCH, { recursive: true });

const baselineSnippet = '47-A Phase 0 tape should exercise projectile collision';
const lines = ['=== Wave 1.5 combined regression floor ===', ''];

function runStep(label, cmd) {
  lines.push(`--- ${label} ---`);
  lines.push(`$ ${cmd}`);
  let exit = 0;
  let out = '';
  try {
    out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    exit = err.status || 1;
    out = (err.stdout || '') + (err.stderr || '');
  }
  lines.push(out.trimEnd());
  lines.push(`exit: ${exit}`);
  lines.push('');
  return { exit, out };
}

const bundle = runStep('check:bundle', 'npm run check:bundle');
const mining = runStep('check:mining:2', 'npm run check:mining:2');
const ai = runStep('check:ai', 'npm run check:ai');
const sim = runStep('check:sim:compare', 'npm run check:sim:compare');

const log = lines.join('\n');
writeFileSync(join(SCRATCH, 'wave15-regression.log'), log, 'utf8');
console.log(log);

let fail = false;
if (bundle.exit !== 0) { console.error('FAIL: check:bundle'); fail = true; }
if (mining.exit !== 0) { console.error('FAIL: check:mining:2'); fail = true; }
if (ai.exit !== 0) { console.error('FAIL: check:ai'); fail = true; }
if (!sim.out.includes(baselineSnippet)) {
  console.error('FAIL: sim:compare does not match _BASELINE.md documented failure');
  fail = true;
}

if (fail) process.exit(1);
console.log('OK: combined regression floor — bundle/mining/ai green; sim:compare matches _BASELINE.md');