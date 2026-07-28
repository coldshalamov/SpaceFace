import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateAshlineEvidenceEpoch,
} from '../tools/art/lib/ashlineEvidenceEpoch.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECEIPT_PATH = resolve(
  ROOT,
  'assets/ships/m4_ashline_v2/evidence/family/finalize_report.json',
);
const EXPECTED_EPOCH_DIGEST = 'D5B5799FF20C2804EDAE0A4DEA251033BF8467A5DE19023EF6A7DABC7F13419B';

function receipt() {
  const report = JSON.parse(readFileSync(RECEIPT_PATH, 'utf8'));
  return report.evidenceEpoch;
}

test('Ashline V2 receipt binds one exact source/candidate/tool epoch', async () => {
  const value = receipt();
  const validation = await validateAshlineEvidenceEpoch(value, { root: ROOT });

  assert.equal(validation.pass, true, validation.failures.join('\n'));
  assert.equal(value.epochDigest, EXPECTED_EPOCH_DIGEST);
  assert.equal(value.sourceCandidatePairs.length, 3);
  assert.deepEqual(
    value.sourceCandidatePairs.map((row) => row.key),
    ['dart', 'lode', 'rig'],
  );
  assert.ok(value.tools.some((row) => row.path.endsWith('build_m4_ashline_v2.py')));
  assert.ok(value.tools.some((row) => row.path.endsWith('ashlineSurfaceMaps.mjs')));
  assert.ok(value.tools.some((row) => row.path.endsWith('finalize_m4_ashline_v2_candidate.mjs')));
  assert.ok(value.tools.some(
    (row) => row.path.endsWith('render_m4_ashline_material_truth.py'),
  ));
});

test('historical Ashline renders remain preserved but cannot impersonate current evidence', async () => {
  const value = receipt();
  assert.equal(value.eligibleArtifacts.length, 8);
  assert.deepEqual(value.currentAcceptance.perShip, {
    dart: true,
    lode: false,
    rig: false,
  });
  assert.equal(value.currentAcceptance.visualEvidenceEligible, false);
  assert.equal(value.currentAcceptance.historicalArtifactsEligible, false);
  assert.equal(value.currentAcceptance.requiresCurrentRender, true);
  for (const artifact of value.eligibleArtifacts) {
    assert.equal(artifact.eligible, true);
    assert.ok(artifact.path.includes('/evidence/material_truth_v2/dart/'));
    assert.deepEqual(
      artifact.inputBindings.map((binding) => binding.shipKey),
      ['dart'],
    );
    assert.equal(
      artifact.producer.path,
      'tools/blender/render_m4_ashline_material_truth.py',
    );
  }
  assert.ok(value.legacyArtifacts.length >= 35);
  assert.ok(value.legacyArtifacts.some(
    (row) => row.path.endsWith('evidence/family/runtime_lineup.png'),
  ));
  assert.ok(value.legacyArtifacts.some(
    (row) => row.path.endsWith('evidence/family/surface_review_dart.png'),
  ));
  for (const artifact of value.legacyArtifacts) {
    assert.equal(artifact.eligible, false);
    assert.equal(artifact.inputBindings, null);
  }
});

test('Ashline evidence validation fails closed on binary or artifact epoch drift', async () => {
  const hashDrift = structuredClone(receipt());
  hashDrift.sourceCandidatePairs[0].sourceSha256 = '0'.repeat(64);
  assert.equal(
    (await validateAshlineEvidenceEpoch(hashDrift, { root: ROOT })).pass,
    false,
  );

  const artifactDrift = structuredClone(receipt());
  artifactDrift.legacyArtifacts[0].eligible = true;
  assert.equal(
    (await validateAshlineEvidenceEpoch(artifactDrift, { root: ROOT })).pass,
    false,
  );

  const forgedLegacy = structuredClone(receipt());
  const dart = forgedLegacy.sourceCandidatePairs.find((row) => row.key === 'dart');
  forgedLegacy.eligibleArtifacts = [{
    ...forgedLegacy.legacyArtifacts.find(
      (row) => row.path.endsWith('evidence/family/runtime_lineup.png'),
    ),
    eligible: true,
    inputBindings: [{ shipKey: 'dart', sourceSha256: dart.sourceSha256 }],
    producer: { path: 'fake-renderer', sha256: 'F'.repeat(64) },
    reason: null,
  }];
  forgedLegacy.currentAcceptance.visualEvidenceEligible = true;
  forgedLegacy.currentAcceptance.requiresCurrentRender = false;
  const forgedValidation = await validateAshlineEvidenceEpoch(forgedLegacy, { root: ROOT });
  assert.equal(forgedValidation.pass, false);
  assert.ok(forgedValidation.failures.some((failure) => (
    failure.includes('legacy-or-unversioned-path')
  )));
  assert.ok(forgedValidation.failures.some((failure) => (
    failure.includes('unregistered-producer')
  )));
});
