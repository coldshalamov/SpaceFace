// Holistic V1 system-level hole regressions (H1–H15).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';

import { runLabScenario } from '../src/testing/lab/runScenario.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { travelFlag, massline2Flag, combatFlag } from '../src/data/featureFlags.js';
import { validateSimScenario } from '../src/contracts/simScenarioSchema.js';
import { deriveEvidenceClass } from '../src/testing/lab/evidenceClass.js';
import {
  issueBrokerClaim,
  consumeBrokerClaim,
  validateBrokerClaim,
  getCandidateLaunchCount,
} from '../scripts/lib/validationBroker.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const flightDoc = JSON.parse(readFileSync(
  join(ROOT, '../src/testing/scenarios/flight-fixed-input.scenario.json'),
  'utf8',
));

// ── H1 ───────────────────────────────────────────────────────────────────────

test('H1: production-profile lab step seeds process MAPS (travelBurn + massline2 enabled)', async () => {
  let midStepFlags = null;
  const probe = {
    name: 'h1FlagProbe',
    init() {},
    update() {
      // Runs inside withFeatureMaps during runtime.step.
      midStepFlags = {
        travelBurn: travelFlag('travelBurn'),
        masslineEnabled: massline2Flag('enabled'),
        weaponImpulse: combatFlag('weaponImpulseConsequences'),
      };
    },
  };

  const { FOCUSED_FLIGHT_SYSTEMS } = await import('../src/testing/lab/systemBundles.js');
  const result = await runLabScenario(flightDoc, {
    systems: [...FOCUSED_FLIGHT_SYSTEMS, probe],
    verbosity: 1,
  });
  assert.notEqual(result.exitClass, 3, result.error || 'infra');
  assert.ok(midStepFlags, 'probe must run during a step');
  assert.equal(midStepFlags.travelBurn, true, 'travelFlag(travelBurn) must be true mid-step');
  assert.equal(midStepFlags.masslineEnabled, true, 'massline2Flag(enabled) must be true mid-step');
  assert.equal(midStepFlags.weaponImpulse, true, 'combatFlag(weaponImpulseConsequences) must be true mid-step');
});

// ── H2 ───────────────────────────────────────────────────────────────────────

test('H2: focused lab never returns production-fixture even when authored', async () => {
  const authored = {
    ...flightDoc,
    id: 'h2.production-claim',
    evidenceClass: 'production-fixture',
  };
  const result = await runLabScenario(authored, { verbosity: 1 });
  assert.notEqual(result.exitClass, 3, result.error);
  assert.notEqual(result.evidenceClass, 'production-fixture');
  assert.equal(result.evidenceClass, 'focused-fixture');
  assert.equal(result.authoredEvidenceClass, 'production-fixture');
  assert.equal(result.evidenceDemoted, true);
});

test('H2: deriveEvidenceClass demotes production claims for focused runs', () => {
  const d = deriveEvidenceClass({
    authored: 'production-fixture',
    manifestEvidenceClass: 'focused-explicit',
    focusedSystems: true,
    systemNames: ['actions', 'flight', 'weapons', 'physics'],
  });
  assert.equal(d.evidenceClass, 'focused-fixture');
  assert.equal(d.demoted, true);
});

// ── H3 + H4 ──────────────────────────────────────────────────────────────────

test('H3/H4: full production manifest initializes in Node without ReferenceError', () => {
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed: 7,
  });
  assert.ok(runtime.state, 'runtime.state must initialize');
  assert.equal(runtime.manifest.evidenceClass, 'production-manifest');
  assert.ok(runtime.manifest.authoritativeSystemIds.includes('input'));
  assert.ok(runtime.manifest.authoritativeSystemIds.length >= 100);
  // input init must not throw; system must be registered
  const inputSys = runtime.getSystem('input');
  assert.ok(inputSys, 'input system present');
  assert.equal(inputSys._domAdapterAttached, false);
  runtime.dispose();
});

test('H4: getNodeSystemFactoryTable materializes node-safe production set', () => {
  const table = getNodeSystemFactoryTable();
  assert.ok(table.has('input'));
  assert.ok(table.has('save'));
  assert.ok(table.has('weapons'));
  assert.equal(table.has('render'), false);
  assert.equal(table.has('ui'), false);
});

// ── H11 schema ───────────────────────────────────────────────────────────────

test('H11: metric assertion without metric is rejected at validation', () => {
  const doc = {
    ...flightDoc,
    assertions: [{ kind: 'metric', op: '<=', value: 1 }],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.path.includes('metric') || i.message.includes('metric')));
});

test('H11: never assertion without signal is rejected at validation', () => {
  const doc = {
    ...flightDoc,
    assertions: [{ kind: 'never' }],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => /signal|never/.test(i.message + i.path)));
});

// ── H14 ──────────────────────────────────────────────────────────────────────

test('H14: pointer/gamepad/touch input events are rejected', () => {
  const doc = {
    ...flightDoc,
    inputEvents: [{ tick: 0, device: 'gamepad', code: 'Button0', pressed: true }],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.rule === 'unsupported-field'));
});

test('H14: non-empty relations are rejected', () => {
  const doc = {
    ...flightDoc,
    relations: [{ type: 'tether', a: 'player', b: 'rock' }],
  };
  const v = validateSimScenario(doc);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.path === '$.relations'));
});

// ── H6/H7 broker claims ──────────────────────────────────────────────────────

test('H6: issueBrokerClaim reserves launch quota', async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), 'broker-h6-'));
  try {
    const manifest = {
      id: 'h6-test',
      claimSchema: 'spaceface.validation-broker-claim.v1',
      maxLaunchesPerCandidate: 1,
    };
    const digests = { candidateDigest: 'h6-candidate-aaa' };
    await issueBrokerClaim({
      outputRoot,
      manifest,
      mode: 'acceptance',
      digests,
      receipt: { routeDigest: 'r', regressionDigest: 'g', candidateDigest: digests.candidateDigest },
    });
    assert.equal(await getCandidateLaunchCount(outputRoot, digests.candidateDigest), 1);
    await assert.rejects(
      () => issueBrokerClaim({
        outputRoot,
        manifest,
        mode: 'acceptance',
        digests,
        receipt: { routeDigest: 'r', regressionDigest: 'g', candidateDigest: digests.candidateDigest },
      }),
      /max-launches-per-candidate/,
    );
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('H7: copied claim is rejected as already-consumed by identity', async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), 'broker-h7-'));
  try {
    const manifest = {
      id: 'h7-test',
      claimSchema: 'spaceface.validation-broker-claim.v1',
      maxLaunchesPerCandidate: 5,
    };
    const digests = { candidateDigest: 'h7-cand' };
    const issued = await issueBrokerClaim({
      outputRoot,
      manifest,
      mode: 'acceptance',
      digests,
      receipt: { routeDigest: 'r', regressionDigest: 'g', candidateDigest: digests.candidateDigest },
    });
    const ok1 = await consumeBrokerClaim({ outputRoot, tokenOrPath: issued.claimPath });
    assert.equal(ok1, true);

    // Copy to another path outside claims dir
    const copyDir = join(outputRoot, 'copied');
    await mkdir(copyDir, { recursive: true });
    const copyPath = join(copyDir, 'claim-copy.json');
    copyFileSync(issued.claimPath, copyPath);

    const check = await validateBrokerClaim({
      outputRoot,
      manifest,
      tokenOrPath: copyPath,
    });
    assert.equal(check.ok, false);
    // Non-canonical path or already-consumed by identity
    assert.ok(
      check.reason === 'broker-claim-noncanonical-path'
      || check.reason === 'broker-claim-already-consumed',
      check.reason,
    );
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
