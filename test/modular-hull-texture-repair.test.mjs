import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('modular hull finalizer dry-run removes hard texture findings without changing geometry', () => {
  const stdout = execFileSync(
    process.execPath,
    [
      'tools/art/repair_modular_hull_texture_roles.mjs',
      '--id=hull_fighter',
      '--force',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      timeout: 60_000,
    },
  );
  const report = JSON.parse(stdout);

  assert.equal(report.schema, 'spaceface.modularHullTextureRoleRepair.v1');
  assert.deepEqual(report.selectedIds, ['hull_fighter']);
  assert.equal(report.repaired, 1);
  assert.equal(report.alreadyRepaired, 0);
  assert.equal(report.totals.errorsAfter, 0);
  assert.equal(report.totals.warningsAfter, 0);
  assert.match(report.hulls[0].geometrySignature, /^[0-9a-f]{64}$/);
  assert.match(report.hulls[0].materialPreservationSignature, /^[0-9a-f]{64}$/);
  assert.match(report.hulls[0].materialSemanticSignature, /^[0-9a-f]{64}$/);
  assert.equal(
    report.hulls[0].authoredInputs.algorithm,
    'neutral-normal-authored-ao-uv0-material-class-v2',
  );
  assert.equal(
    report.hulls[0].assetGenerator,
    'SpaceFace tools/art/repair_modular_hull_texture_roles.mjs v2',
  );
  assert.match(report.hulls[0].priorGenerator, /SpaceFace/);
  assert.match(report.hulls[0].authoredInputs.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(report.hulls[0].khronosValidation, null);
  assert.ok(report.hulls[0].auditAfter.boundImages >= 3);
  for (const material of report.hulls[0].materialSampling) {
    assert.equal(material.occlusion.texCoord ?? 0, 0);
    assert.equal(material.occlusion.extensions?.KHR_texture_transform, undefined);
  }
});

test('an external already-finalized input with different bytes remains a publication candidate', () => {
  const temp = mkdtempSync(join(tmpdir(), 'spaceface-finalized-input-'));
  try {
    const input = join(temp, 'hull_fighter.glb');
    const bytes = readFileSync(resolve(ROOT, 'assets/ships/parts/hulls/hull_fighter.glb'));
    const marker = Buffer.from(
      'SpaceFace tools/art/generate_ship_parts_library.py - procedural ship parts library v3',
    );
    const markerOffset = bytes.indexOf(marker);
    assert.ok(markerOffset >= 0, 'fixture must carry prior-generator provenance');
    bytes[markerOffset] = 's'.charCodeAt(0);
    writeFileSync(input, bytes);

    const stdout = execFileSync(
      process.execPath,
      [
        'tools/art/repair_modular_hull_texture_roles.mjs',
        '--id=hull_fighter',
        `--input=${input}`,
      ],
      {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        timeout: 60_000,
      },
    );
    const report = JSON.parse(stdout);
    assert.equal(report.repaired, 0);
    assert.equal(report.alreadyRepaired, 1);
    assert.equal(report.hulls[0].publishSource, true);
    assert.notEqual(
      report.hulls[0].sourceSha256Before,
      report.hulls[0].targetSha256Before,
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
