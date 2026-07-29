#!/usr/bin/env node
// Validation broker CLI — authorize (and optionally spawn) a manifest-driven probe.
// Usage:
//   node scripts/validation-broker-cli.mjs --manifest massline-live [-- --probe-args]
//   node scripts/validation-broker-cli.mjs --manifest pq017-world-site --issue-claim-only

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createValidationBroker, getLaunchCounts } from './lib/validationBroker.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

const MANIFEST_LOADERS = {
  'massline-live': () => import('./validation-manifests/massline-live.mjs'),
  'pq017-world-site': () => import('./validation-manifests/pq017-world-site.mjs'),
  'lab-chromium-parity': () => import('./validation-manifests/lab-chromium-parity.mjs'),
  'pq021-ledger-route': () => import('./validation-manifests/pq021-ledger-route.mjs'),
  'pq019-surface-heist': () => import('./validation-manifests/pq019-surface-heist.mjs'),
  'pq020-ceres-topology': () => import('./validation-manifests/pq020-ceres-topology.mjs'),
  'pq023-corridor-cues': () => import('./validation-manifests/pq023-corridor-cues.mjs'),
};

function parseArgs(argv) {
  const out = {
    manifestId: null,
    issueClaimOnly: false,
    diagnostic: false,
    extraArgs: [],
  };
  const dashDash = argv.indexOf('--');
  const primary = dashDash >= 0 ? argv.slice(0, dashDash) : argv;
  out.extraArgs = dashDash >= 0 ? argv.slice(dashDash + 1) : [];
  for (let i = 0; i < primary.length; i += 1) {
    const arg = primary[i];
    if (arg === '--manifest' || arg === '-m') {
      out.manifestId = primary[i + 1] ?? null;
      i += 1;
    } else if (arg === '--issue-claim-only') {
      out.issueClaimOnly = true;
    } else if (arg === '--diagnostic') {
      out.diagnostic = true;
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    }
  }
  return out;
}

function printHelp() {
  console.log(`validation-broker-cli — Phase 1 validation broker

Usage:
  node scripts/validation-broker-cli.mjs --manifest <id> [--issue-claim-only] [--diagnostic] [-- <probe args>]

Manifests:
  massline-live
  pq017-world-site
  lab-chromium-parity
  pq021-ledger-route
  pq019-surface-heist
  pq020-ceres-topology
  pq023-corridor-cues

Environment on spawned probes:
  SF_BROKER_CLAIM   one-use claim path
  SF_PROBE_SEED     fixed seed when manifest declares fixedSeed
`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.manifestId) {
  printHelp();
  process.exitCode = args.help ? 0 : 1;
} else {
  await main(args);
}

async function main({ manifestId, issueClaimOnly, diagnostic, extraArgs }) {
  const loader = MANIFEST_LOADERS[manifestId];
  if (!loader) {
    console.error(`[validation-broker] unknown manifest: ${manifestId}`);
    console.error(`[validation-broker] known: ${Object.keys(MANIFEST_LOADERS).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const mod = await loader();
  const rawManifest = mod.default
    ?? mod.masslineLiveManifest
    ?? mod.pq017WorldSiteManifest
    ?? mod.labChromiumParityManifest;
  if (!rawManifest) {
    console.error(`[validation-broker] manifest module did not export a manifest: ${manifestId}`);
    process.exitCode = 1;
    return;
  }

  const outputRoot = path.resolve(ROOT, rawManifest.artifactRoot);
  const broker = createValidationBroker(rawManifest, { root: ROOT, outputRoot });

  if (diagnostic) {
    console.log('[validation-broker] diagnostic mode: non-promoting, claim optional for probe');
    // H8: pass mode:'diagnostic' so runProbeProcess does not consume acceptance quota
    // or persist diagnostic failures as primary acceptance failures.
    const run = await broker.runProbeProcess({
      mode: 'diagnostic',
      extraArgs: ['--diagnostic', ...extraArgs],
      env: {
        SF_PROBE_SEED: rawManifest.fixedSeed != null ? String(rawManifest.fixedSeed) : '',
      },
    });
    printRun(run);
    process.exitCode = run.exitCode == null ? 1 : run.exitCode;
    return;
  }

  const result = await broker.authorizeAndMaybeRun({
    mode: 'acceptance',
    explicitAcceptance: true,
    spawnProbe: !issueClaimOnly,
    extraArgs,
  });

  if (result.cached || result.launched === false) {
    console.error(`[validation-broker] ${result.status}: ${result.reason}`);
    if (result.failureFingerprint) {
      console.error(`[validation-broker] failureFingerprint: ${result.failureFingerprint}`);
    }
    if (result.claim?.claimPath) {
      console.log(`[validation-broker] claim: ${result.claim.claimPath}`);
    }
    // blocked_* statuses are non-zero exits (do not launch indefinitely).
    process.exitCode = result.status === 'pass' ? 0 : 2;
    return;
  }

  if (issueClaimOnly) {
    console.log(`[validation-broker] claim issued: ${result.claim.claimPath}`);
    process.exitCode = 0;
    return;
  }

  printRun(result);
  process.exitCode = result.exitCode == null ? (result.status === 'pass' ? 0 : 1) : result.exitCode;
}

function printRun(run) {
  console.log(`[validation-broker] status: ${run.status}`);
  if (run.fixedSeed != null) console.log(`[validation-broker] fixedSeed: ${run.fixedSeed}`);
  if (run.timedOut) console.error('[validation-broker] timed out; process tree cleaned up');
  if (run.pidRecord) {
    console.log(`[validation-broker] pid: ${run.pidRecord.pid} exit=${run.exitCode} signal=${run.signal}`);
  }
  const counts = getLaunchCounts();
  console.log(`[validation-broker] launchCounts global=${counts.global} browser=${counts.browser} electron=${counts.electron}`);
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
}
