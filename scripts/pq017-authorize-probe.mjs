#!/usr/bin/env node
// I3: External claim issuer + probe launcher for PQ-017 acceptance.
// Probes themselves refuse to self-mint — this parent process issues the claim
// after fast gates have published a receipt, then spawns the probe with SF_BROKER_CLAIM.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { issuePq017AcceptanceClaim } from './lib/pq017ProbeIterationGuard.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUTPUT_ROOT = path.join(ROOT, '.devshots', 'pq017-world-site');

const runtimeKind = process.argv.includes('--electron') ? 'electron' : 'browser';
const probeScript = runtimeKind === 'electron'
  ? 'scripts/probe-pq017-world-site-electron.mjs'
  : 'scripts/probe-pq017-world-site.mjs';

let issued;
try {
  issued = await issuePq017AcceptanceClaim({
    root: ROOT,
    outputRoot: OUTPUT_ROOT,
    runtimeKind,
  });
} catch (error) {
  console.error(`[pq017-authorize] FAIL: ${error && error.message ? error.message : error}`);
  if (error && error.gateResult) {
    console.error(`[pq017-authorize] reason: ${error.gateResult.reason}`);
  }
  process.exitCode = 2;
  process.exit();
}

console.log(`[pq017-authorize] issued ${runtimeKind} claim: ${issued.claimPath}`);

const child = spawn(
  process.execPath,
  [probeScript, '--acceptance', ...process.argv.slice(2).filter((a) => a !== '--electron' && a !== '--browser')],
  {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      SF_BROKER_CLAIM: issued.claimPath,
    },
  },
);

child.once('error', (err) => {
  console.error(`[pq017-authorize] spawn failed: ${err.message}`);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  if (signal) {
    console.error(`[pq017-authorize] probe terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
