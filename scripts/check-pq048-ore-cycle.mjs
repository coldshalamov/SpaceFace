#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  preflightCeresFiveMinuteRuntime,
  runCeresFiveMinuteAcceptance,
} from './lib/ceresFiveMinuteAcceptance.mjs';
import {
  PQ048_ORE_CYCLE_MIN_POST_CONTINUE_TICKS,
  PQ048_ORE_CYCLE_MANIFEST_ID,
  publishPq048OreCycleEvidence,
} from './lib/pq048OreCycleAcceptance.mjs';
import { loadValidationManifestById } from './lib/validationManifestRegistry.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PQ048_ORE_CYCLE_ROUTE_GATE = Object.freeze({
  enabled: true,
  minPostContinueTicks: PQ048_ORE_CYCLE_MIN_POST_CONTINUE_TICKS,
  timeoutMs: 150_000,
});

await main();

async function main() {
  const preflight = process.argv.includes('--preflight');
  const acceptanceRequested = process.argv.includes('--acceptance');
  const diagnostic = process.argv.includes('--diagnostic');
  if (preflight && (acceptanceRequested || diagnostic)) {
    return usage('--preflight is exclusive');
  }
  if (!preflight && !acceptanceRequested && !diagnostic) {
    return usage('--preflight, --acceptance, or --diagnostic is required');
  }
  const mode = acceptanceRequested && !diagnostic ? 'acceptance' : 'diagnostic';

  let manifest;
  try {
    manifest = await loadValidationManifestById({ root: ROOT, id: PQ048_ORE_CYCLE_MANIFEST_ID });
  } catch (error) {
    console.error(`[pq048-ore-cycle] BLOCKED: ${error?.message || error}`);
    process.exitCode = 2;
    return;
  }

  if (preflight) {
    const result = await preflightCeresFiveMinuteRuntime({
      root: ROOT,
      runtimeKind: 'browser',
      manifest,
    });
    if (!result.pass) {
      console.error(`[pq048-ore-cycle] BLOCKED: ${(result.failures || []).join(' | ')}`);
      process.exitCode = 2;
      return;
    }
    console.log('[pq048-ore-cycle] PREFLIGHT PASS (browser; no runtime launched)');
    process.exitCode = 0;
    return;
  }

  try {
    const sharedResult = await runCeresFiveMinuteAcceptance({
      root: ROOT,
      runtimeKind: 'browser',
      manifest,
      mode,
      outputRoot: path.resolve(ROOT, manifest.artifactRoot),
      brokerClaimToken: process.env.SF_BROKER_CLAIM || null,
      routeOptions: { oreCycleGate: PQ048_ORE_CYCLE_ROUTE_GATE },
      log: (line) => console.log(`[pq048-ore-cycle:browser] ${line}`),
    });
    if (!sharedResult.pass) {
      console.error(`[pq048-ore-cycle] ${sharedResult.blocked ? 'BLOCKED' : 'FAIL'}: ${(sharedResult.failures || []).join(' | ')}`);
      process.exitCode = sharedResult.blocked ? 2 : 1;
      return;
    }
    const oreCycle = await publishPq048OreCycleEvidence({ sharedResult, root: ROOT });
    if (!oreCycle.pass) {
      console.error(`[pq048-ore-cycle] FAIL: ${(oreCycle.failures || []).join(' | ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[pq048-ore-cycle] ${mode === 'acceptance' ? 'PASS' : 'DIAGNOSTIC PASS'}: ${path.relative(ROOT, oreCycle.artifactSetPath)}`);
    process.exitCode = 0;
  } catch (error) {
    const blocked = /^(?:VALIDATION_|BROKER_|CERES_)/.test(String(error?.code || error?.message || ''));
    console.error(`[pq048-ore-cycle] ${blocked ? 'BLOCKED' : 'FAIL'}: ${error?.message || error}`);
    process.exitCode = blocked ? 2 : 1;
  }
}

function usage(message) {
  console.error(`[pq048-ore-cycle] ${message}`);
  process.exitCode = 2;
}
