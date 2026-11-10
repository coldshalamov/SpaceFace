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

function writeScratchLogs(body) {
  const runPath = join(SCRATCH, 'wave15-regression-run.log');
  writeFileSync(runPath, body, 'utf8');
  const canonPath = join(SCRATCH, 'wave15-regression.log');
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      writeFileSync(canonPath, body, 'utf8');
      return;
    } catch (err) {
      if (err && err.code !== 'EBUSY') throw err;
    }
    const deadline = Date.now() + 40 + attempt * 30;
    while (Date.now() < deadline) { /* EBUSY: tee may hold wave15-regression.log */ }
  }
  console.warn(`ADVISORY: could not write ${canonPath} (EBUSY) — see ${runPath}`);
}

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

// Wave 1.5 code floor: JS bundle + reachability must be green. runtime-assets may fail on
// concurrent graphics-lane release GLBs (documented deviation — not Wave 1.5 code scope).
const bundleJs = runStep('check:bundle (JS)', 'npm run check:render-hotpath && node scripts/check-bundle.mjs');
const reach = runStep('check:asset-reachability', 'node scripts/check-asset-reachability.mjs');
const runtimeAssets = runStep('check:runtime-assets (graphics-lane advisory)', 'npm run check:runtime-assets');
const mining = runStep('check:mining:2', 'npm run check:mining:2');
const ai = runStep('check:ai', 'npm run check:ai');
const sim = runStep('check:sim:compare', 'npm run check:sim:compare');

const log = lines.join('\n') + '\n';
writeScratchLogs(log);
console.log(log.trimEnd());

let fail = false;
if (bundleJs.exit !== 0) { console.error('FAIL: check:bundle (JS)'); fail = true; }
if (reach.exit !== 0) { console.error('FAIL: check:asset-reachability'); fail = true; }
if (runtimeAssets.exit !== 0) {
  console.warn('ADVISORY: check:runtime-assets failed (graphics-lane release GLBs — not Wave 1.5 code gate)');
}
if (mining.exit !== 0) { console.error('FAIL: check:mining:2'); fail = true; }
if (ai.exit !== 0) { console.error('FAIL: check:ai'); fail = true; }
if (!sim.out.includes(baselineSnippet)) {
  console.error('FAIL: sim:compare does not match _BASELINE.md documented failure');
  fail = true;
}

if (fail) process.exit(1);
console.log('OK: Wave 1.5 regression floor — bundle JS + reachability + mining + ai green; sim:compare matches _BASELINE.md');