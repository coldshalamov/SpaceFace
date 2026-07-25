#!/usr/bin/env node
// Phase 4 — ONE broker-authorized browser acceptance.
// Runs Node/Chromium differential replay under a consumed claim, writes a receipt, cleans up.
// Direct execution without SF_BROKER_CLAIM exits 2 (BROKER_CLAIM_REQUIRED).

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireBrokerClaimOrDiagnostic } from './lib/validationBroker.mjs';
import {
  LAB_CHROMIUM_PARITY_FIXED_SEED,
  createLabChromiumParityManifest,
} from './validation-manifests/lab-chromium-parity.mjs';
import { runDifferentialReplay } from '../src/testing/lab/differentialReplay.js';
import { compileSimScenario } from '../src/contracts/simScenarioSchema.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACT_ROOT = join(ROOT, '.devshots', 'lab-chromium-parity');
const DIAGNOSTIC = process.argv.includes('--diagnostic');
const SCENARIO_PATH = join(ROOT, 'src/testing/scenarios/flight-fixed-input.scenario.json');

const manifest = createLabChromiumParityManifest();
const brokerGate = await requireBrokerClaimOrDiagnostic({
  outputRoot: ARTIFACT_ROOT,
  manifest,
  tokenOrPath: process.env.SF_BROKER_CLAIM ?? null,
  diagnostic: DIAGNOSTIC,
  explicitDiagnostic: DIAGNOSTIC,
  root: ROOT,
});

if (!brokerGate.ok) {
  console.error(`[lab-chromium-acceptance] BROKER_CLAIM_REQUIRED: ${brokerGate.reason}`);
  console.error('[lab-chromium-acceptance] invoke via: node scripts/validation-broker-cli.mjs --manifest lab-chromium-parity');
  console.error('[lab-chromium-acceptance] or pass --diagnostic for non-promoting local inspection');
  process.exit(2);
}

mkdirSync(ARTIFACT_ROOT, { recursive: true });

const doc = JSON.parse(readFileSync(SCENARIO_PATH, 'utf8'));
// N1: acceptance ticks must keep at least one in-range tape row; drop frames ≥ ticks.
const ACCEPTANCE_TICKS = 60;
const shortDoc = {
  ...doc,
  id: 'flight.fixed-input.acceptance',
  ticks: ACCEPTANCE_TICKS,
  seed: LAB_CHROMIUM_PARITY_FIXED_SEED,
  frames: (doc.frames || []).filter((f) => Number.isInteger(f?.tick) && f.tick < ACCEPTANCE_TICKS),
  inputEvents: (doc.inputEvents || []).filter((e) => Number.isInteger(e?.tick) && e.tick < ACCEPTANCE_TICKS),
};

const compiled = compileSimScenario(shortDoc, { file: SCENARIO_PATH });
if (!compiled.ok) {
  const report = {
    schema: 'spaceface.labChromiumAcceptance.v1',
    ok: false,
    status: 'invalid-config',
    validation: compiled.validation,
    browserLaunches: 0,
    electronLaunches: 0,
    broker: { reason: brokerGate.reason, diagnostic: brokerGate.diagnostic },
  };
  writeFileSync(join(ARTIFACT_ROOT, 'acceptance-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(4);
}

let result;
try {
  result = await runDifferentialReplay(shortDoc, {
    canonical: compiled.canonical,
    file: SCENARIO_PATH,
    verbosity: 1,
    checkpointEvery: 20,
    timeoutMs: 180_000,
    headless: true,
    root: ROOT,
  });
} catch (err) {
  result = {
    schema: 'spaceface.labDifferentialReplay.v1',
    ok: false,
    status: 'infra_error',
    error: err && err.message ? err.message : String(err),
    browserLaunches: 0,
  };
}

const report = {
  schema: 'spaceface.labChromiumAcceptance.v1',
  ok: !!result.ok,
  status: result.status,
  exitClass: result.exitClass,
  scenarioId: result.scenarioId || shortDoc.id,
  seed: LAB_CHROMIUM_PARITY_FIXED_SEED,
  scenarioDigest: result.scenarioDigest,
  inputDigest: result.inputDigest,
  sameCompiledArtifact: result.sameCompiledArtifact,
  firstDivergenceReport: result.firstDivergenceReport || (result.ok ? 'match' : 'unknown'),
  compare: result.compare
    ? {
      match: result.compare.match,
      lastMatchingTick: result.compare.lastMatchingTick,
      classification: result.compare.classification,
      firstDivergence: result.compare.firstDivergence,
    }
    : null,
  browserLaunches: result.browserLaunches | 0,
  electronLaunches: 0,
  fullSuiteRuns: 0,
  broker: {
    reason: brokerGate.reason,
    diagnostic: !!brokerGate.diagnostic,
    primaryAcceptance: !!brokerGate.primaryAcceptance,
    claimId: brokerGate.claim?.claimId || brokerGate.claim?.id || null,
  },
  exactWithin: result.exactWithin || { crossRuntime: false },
  error: result.error || null,
};

writeFileSync(join(ARTIFACT_ROOT, 'acceptance-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exitCode = result.exitClass != null ? result.exitClass : 1;
} else {
  process.exitCode = 0;
}
