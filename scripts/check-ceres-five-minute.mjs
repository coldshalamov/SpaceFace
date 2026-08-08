#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkCeresFiveMinuteEvidence,
  preflightCeresFiveMinuteRuntime,
  runCeresFiveMinuteAcceptance,
} from './lib/ceresFiveMinuteAcceptance.mjs';
import { loadValidationManifestById } from './lib/validationManifestRegistry.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

await main();

async function main() {
  const runtimeKind = readArg('runtime');
  if (!runtimeKind) {
    if (process.argv.includes('--preflight')
        || process.argv.includes('--acceptance')
        || process.argv.includes('--diagnostic')) {
      return usage('--runtime is required with a runtime mode');
    }
    try {
      const result = await checkCeresFiveMinuteEvidence({ root: ROOT });
      printAggregate(result);
      process.exitCode = result.status === 'pass'
        ? 0
        : ['pending', 'partial'].includes(result.status) ? 2 : 1;
    } catch (error) {
      console.error(`[ceres-five-minute] BLOCKED: ${error?.message || error}`);
      process.exitCode = 2;
    }
    return;
  }

  if (!['browser', 'electron'].includes(runtimeKind)) {
    return usage('--runtime must be browser or electron');
  }
  const preflight = process.argv.includes('--preflight');
  const acceptanceRequested = process.argv.includes('--acceptance');
  const diagnostic = process.argv.includes('--diagnostic');
  if ((preflight && (acceptanceRequested || diagnostic))
      || (!preflight && !acceptanceRequested && !diagnostic)) {
    return usage('--preflight is exclusive; otherwise --acceptance or --diagnostic is required with --runtime');
  }
  // The generic broker appends --diagnostic to acceptance-authored manifest args.
  // An explicit diagnostic always wins and remains non-promoting/no-claim.
  const acceptance = acceptanceRequested && !diagnostic;
  if (acceptance && readArg('seed') != null) {
    return usage('acceptance seed overrides are forbidden; the manifest owns fixed seed 47');
  }

  let manifest;
  try {
    manifest = await loadValidationManifestById({
      root: ROOT,
      id: `ceres-five-minute-${runtimeKind}`,
    });
  } catch (error) {
    console.error(`[ceres-five-minute] manifest rejected: ${error?.message || error}`);
    process.exitCode = 2;
    return;
  }

  if (preflight) {
    const result = await preflightCeresFiveMinuteRuntime({
      root: ROOT,
      runtimeKind,
      manifest,
    });
    if (!result.pass) {
      console.error(`[ceres-five-minute] BLOCKED: ${(result.failures || []).join(' | ')}`);
      process.exitCode = 2;
      return;
    }
    console.log(`[ceres-five-minute] PREFLIGHT PASS (${runtimeKind}; no runtime launched)`);
    process.exitCode = 0;
    return;
  }

  const outputRoot = path.resolve(ROOT, readArg('output-root', manifest.artifactRoot));
  try {
    const result = await runCeresFiveMinuteAcceptance({
      root: ROOT,
      runtimeKind,
      manifest,
      mode: acceptance ? 'acceptance' : 'diagnostic',
      outputRoot,
      brokerClaimToken: process.env.SF_BROKER_CLAIM || null,
      log: (line) => console.log(`[ceres-five-minute:${runtimeKind}] ${line}`),
    });
    if (!result.pass) {
      console.error(`[ceres-five-minute] FAIL: ${(result.failures || []).join(' | ')}`);
      process.exitCode = result.blocked === true ? 2 : 1;
      return;
    }
    if (result.primaryAcceptance === true && result.humanReviewRequired === false) {
      console.log('[ceres-five-minute] MACHINE PASS; HUMAN REVIEW NOT REQUIRED FOR ELECTRON');
    } else if (result.primaryAcceptance === true && result.humanReviewClosed !== true) {
      console.log('[ceres-five-minute] MACHINE PASS; HUMAN REVIEW PENDING');
    } else if (result.primaryAcceptance === true) {
      console.log('[ceres-five-minute] MACHINE PASS; BOUND HUMAN KEEP');
    } else {
      console.log('[ceres-five-minute] DIAGNOSTIC PASS (non-promoting)');
    }
    process.exitCode = 0;
  } catch (error) {
    const blocked = error?.blocked === true || /^(?:VALIDATION_|BROKER_|CERES_)/.test(
      String(error?.code || error?.message || ''),
    );
    console.error(`[ceres-five-minute] ${blocked ? 'BLOCKED' : 'FAIL'}: ${error?.message || error}`);
    process.exitCode = blocked ? 2 : 1;
  }
}

function readArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const entry = process.argv.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function usage(message) {
  console.error(`[ceres-five-minute] ${message}`);
  process.exitCode = 2;
}

function printAggregate(result) {
  console.log(`[ceres-five-minute] ${String(result.status || 'pending').toUpperCase()}`);
  for (const runtime of result.runtimes || []) {
    console.log(`  ${runtime.runtimeKind}: machine=${runtime.machineStatus} review=${runtime.reviewStatus}`);
  }
  for (const failure of result.failures || []) console.error(`  - ${failure}`);
  for (const open of result.open || []) console.log(`  open: ${open}`);
}
