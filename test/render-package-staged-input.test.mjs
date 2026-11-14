import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildRenderPackagePilots, parseRenderPackagePilotArgs } from '../scripts/build-render-package-pilots.mjs';

const outputParent = resolve('.devshots/fleet/cold-locker-package-stage');

test('staged source requires isolated scoped single-pilot output and an explicit digest', async () => {
  await mkdir(outputParent, { recursive: true });
  const temp = await mkdtemp(join(tmpdir(), 'render-stage-guard-'));
  try {
    const source = join(temp, 'wrong.glb');
    await writeFile(source, 'self-contained source');
    const base = { onlyKeys: ['cold-locker'], scopedInputs: true, stagedSource: source,
      stagedSha256: '0'.repeat(64), outputRoot: '.devshots/fleet/cold-locker-package-stage/guard-test' };
    await assert.rejects(buildRenderPackagePilots({ ...base, outputRoot: '.' }), /under .devshots/);
    await assert.rejects(buildRenderPackagePilots({ ...base, onlyKeys: ['cold-locker', 'kestrel'] }), /requires one --only/);
    await assert.rejects(buildRenderPackagePilots({ ...base, scopedInputs: false }), /requires one --only/);
    await assert.rejects(buildRenderPackagePilots(base), /staged source SHA-256/);
    await assert.rejects(buildRenderPackagePilots({ ...base, stagedAuthoringSource: source }), /requires --staged-source/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('renamed staged source retains the canonical compiled provenance', async () => {
  await mkdir(outputParent, { recursive: true });
  const temp = await mkdtemp(join(outputParent, 'renamed-source-test-'));
  try {
    const source = join(temp, 'renamed.glb');
    await copyFile('assets/ships/release/parts/places/place_cold_locker.glb', source);
    const digest = createHash('sha256').update(await readFile(source)).digest('hex');
    const authoringSource = join(temp, 'authored.glb');
    const authoringBytes = Buffer.from('distinct authoring source fixture');
    await writeFile(authoringSource, authoringBytes);
    const authoringDigest = createHash('sha256').update(authoringBytes).digest('hex');
    const output = join(temp, 'output');
    await assert.rejects(buildRenderPackagePilots({ onlyKeys: ['cold-locker'], scopedInputs: true,
      stagedSource: source, stagedSha256: digest, stagedAuthoringSource: authoringSource,
      stagedAuthoringSha256: '0'.repeat(64), outputRoot: output }), /staged authoring source SHA-256/);
    await buildRenderPackagePilots({ onlyKeys: ['cold-locker'], scopedInputs: true,
      stagedSource: source, stagedSha256: digest, stagedAuthoringSource: authoringSource,
      stagedAuthoringSha256: authoringDigest, outputRoot: output });
    const metadata = JSON.parse(await readFile(join(output, 'assets/ships/release/render-packages/cold-locker/render-package.json')));
    const descriptor = JSON.parse(await readFile(join(output, 'assets/ships/render-packages/inputs/cold-locker.json')));
    assert.equal(metadata.provenance.sourceGlb.uri, 'place_cold_locker.glb');
    assert.equal(metadata.provenance.sourceGlb.sha256, digest);
    assert.equal(descriptor.sourceGlb.uri, 'assets/ships/release/parts/places/place_cold_locker.glb');
    assert.equal(descriptor.sourceGlb.sha256, digest);
    assert.equal(descriptor.releaseRow.source, 'assets/ships/parts/places/place_cold_locker.glb');
    assert.equal(descriptor.releaseRow.sourceSha256, authoringDigest);
    assert.equal(descriptor.releaseRow.sourceBytes, authoringBytes.length);
    assert.equal(descriptor.releaseRow.releaseSha256, digest);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('staged flags are parsed', () => {
  const args = parseRenderPackagePilotArgs(['--only=cold-locker', '--scoped-inputs', '--staged-source=fixture.glb', '--staged-sha256=' + 'a'.repeat(64)]);
  assert.equal(args.stagedSource, 'fixture.glb');
  assert.equal(args.stagedSha256, 'a'.repeat(64));
  assert.deepEqual(args.onlyKeys, ['cold-locker']);
});
