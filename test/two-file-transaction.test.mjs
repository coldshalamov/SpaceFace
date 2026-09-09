import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let publishTwoFileTransaction = async () => {
  throw new Error('publishTwoFileTransaction is not implemented');
};
try {
  ({ publishTwoFileTransaction } = await import('../tools/art/lib/twoFileTransaction.mjs'));
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

async function assertNoTransactionResidue(directory) {
  const residue = (await readdir(directory)).filter((name) => name.includes('.sf-transaction-'));
  assert.deepEqual(residue, [], `transaction residue must be cleaned: ${residue.join(', ')}`);
}

const directory = await mkdtemp(join(tmpdir(), 'sf-two-file-transaction-'));
try {
  const glbPath = join(directory, 'part.glb');
  const manifestPath = join(directory, 'parts_manifest.json');
  await writeFile(glbPath, 'old-glb');
  await writeFile(manifestPath, 'old-manifest');

  const validated = [];
  await publishTwoFileTransaction({
    files: [
      {
        path: glbPath,
        bytes: Buffer.from('new-glb'),
        validate: async (stagedPath) => {
          validated.push('glb');
          assert.equal(await readFile(stagedPath, 'utf8'), 'new-glb');
          assert.equal(await readFile(glbPath, 'utf8'), 'old-glb', 'validation must precede destination mutation');
        },
      },
      {
        path: manifestPath,
        bytes: Buffer.from('new-manifest'),
        validate: async (stagedPath) => {
          validated.push('manifest');
          assert.equal(await readFile(stagedPath, 'utf8'), 'new-manifest');
          assert.equal(await readFile(manifestPath, 'utf8'), 'old-manifest', 'both staged files validate before backup');
        },
      },
    ],
  });
  assert.deepEqual(validated, ['glb', 'manifest']);
  assert.equal(await readFile(glbPath, 'utf8'), 'new-glb');
  assert.equal(await readFile(manifestPath, 'utf8'), 'new-manifest');
  await assertNoTransactionResidue(directory);

  await writeFile(glbPath, 'rollback-old-glb');
  await writeFile(manifestPath, 'rollback-old-manifest');
  await assert.rejects(
    () => publishTwoFileTransaction({
      files: [
        { path: glbPath, bytes: Buffer.from('rollback-new-glb'), validate: async () => {} },
        { path: manifestPath, bytes: Buffer.from('rollback-new-manifest'), validate: async () => {} },
      ],
      fileOps: {
        rename: async (source, destination) => {
          const isSecondPromotion = destination === manifestPath && source.endsWith('.tmp');
          if (isSecondPromotion) {
            assert.equal(
              await readFile(glbPath, 'utf8'),
              'rollback-new-glb',
              'the injected failure must occur during the actual second staged-file rename',
            );
            throw new Error('injected second-file rename failure');
          }
          await rename(source, destination);
        },
      },
    }),
    /two-file publish failed.*promot.*parts_manifest\.json.*injected second-file rename failure/i,
  );
  assert.equal(await readFile(glbPath, 'utf8'), 'rollback-old-glb', 'first destination must be restored');
  assert.equal(await readFile(manifestPath, 'utf8'), 'rollback-old-manifest', 'second destination must be restored');
  await assertNoTransactionResidue(directory);

  const absentGlbPath = join(directory, 'absent-first.glb');
  const absentManifestPath = join(directory, 'absent-first-manifest.json');
  await writeFile(absentManifestPath, 'absent-case-old-manifest');
  await assert.rejects(
    () => publishTwoFileTransaction({
      files: [
        { path: absentGlbPath, bytes: Buffer.from('newly-created-glb'), validate: async () => {} },
        { path: absentManifestPath, bytes: Buffer.from('absent-case-new-manifest'), validate: async () => {} },
      ],
      fileOps: {
        rename: async (source, destination) => {
          if (destination === absentManifestPath && source.endsWith('.tmp')) {
            throw new Error('injected absent-case second rename failure');
          }
          await rename(source, destination);
        },
      },
    }),
    /absent-case second rename failure/,
  );
  await assert.rejects(() => readFile(absentGlbPath), { code: 'ENOENT' });
  assert.equal(await readFile(absentManifestPath, 'utf8'), 'absent-case-old-manifest');
  await assertNoTransactionResidue(directory);

  const validationGlbPath = join(directory, 'validation.glb');
  const validationManifestPath = join(directory, 'validation-manifest.json');
  await writeFile(validationGlbPath, 'validation-old-glb');
  await writeFile(validationManifestPath, 'validation-old-manifest');
  await assert.rejects(
    () => publishTwoFileTransaction({
      files: [
        { path: validationGlbPath, bytes: Buffer.from('validation-new-glb'), validate: async () => {} },
        {
          path: validationManifestPath,
          bytes: Buffer.from('validation-new-manifest'),
          validate: async () => { throw new Error('injected staged validation failure'); },
        },
      ],
    }),
    /validating.*validation-manifest\.json.*injected staged validation failure/i,
  );
  assert.equal(await readFile(validationGlbPath, 'utf8'), 'validation-old-glb');
  assert.equal(await readFile(validationManifestPath, 'utf8'), 'validation-old-manifest');
  await assertNoTransactionResidue(directory);

  const rollbackGlbPath = join(directory, 'rollback-failure.glb');
  const rollbackManifestPath = join(directory, 'rollback-failure-manifest.json');
  await writeFile(rollbackGlbPath, 'rollback-failure-old-glb');
  await writeFile(rollbackManifestPath, 'rollback-failure-old-manifest');
  await assert.rejects(
    () => publishTwoFileTransaction({
      files: [
        { path: rollbackGlbPath, bytes: Buffer.from('rollback-failure-new-glb'), validate: async () => {} },
        { path: rollbackManifestPath, bytes: Buffer.from('rollback-failure-new-manifest'), validate: async () => {} },
      ],
      fileOps: {
        rename: async (source, destination) => {
          if (destination === rollbackManifestPath && source.endsWith('.tmp')) {
            throw new Error('injected promotion failure before rollback failure');
          }
          if (destination === rollbackManifestPath && source.endsWith('.bak')) {
            throw new Error('injected rollback restore failure');
          }
          await rename(source, destination);
        },
      },
    }),
    /rollback incomplete.*rollback-failure-manifest\.json.*\.bak.*backups retained/i,
  );
  const retainedBackups = (await readdir(directory)).filter((name) =>
    name.includes('rollback-failure-manifest.json.sf-transaction-') && name.endsWith('.bak'));
  assert.equal(retainedBackups.length, 1, 'failed rollback must retain the named recovery backup');

  const cleanupGlbPath = join(directory, 'cleanup-failure.glb');
  const cleanupManifestPath = join(directory, 'cleanup-failure-manifest.json');
  await writeFile(cleanupGlbPath, 'cleanup-old-glb');
  await writeFile(cleanupManifestPath, 'cleanup-old-manifest');
  await assert.rejects(
    () => publishTwoFileTransaction({
      files: [
        { path: cleanupGlbPath, bytes: Buffer.from('cleanup-new-glb'), validate: async () => {} },
        { path: cleanupManifestPath, bytes: Buffer.from('cleanup-new-manifest'), validate: async () => {} },
      ],
      fileOps: {
        remove: async (path, options) => {
          if (path.endsWith('.bak')) throw new Error('injected committed-backup cleanup failure');
          await rm(path, options);
        },
      },
    }),
    /publish completed.*cleanup failed.*\.bak.*injected committed-backup cleanup failure/i,
  );
  assert.equal(await readFile(cleanupGlbPath, 'utf8'), 'cleanup-new-glb');
  assert.equal(await readFile(cleanupManifestPath, 'utf8'), 'cleanup-new-manifest');

  await assert.rejects(
    () => publishTwoFileTransaction({
      files: [
        { path: '   ', bytes: Buffer.from('bad'), validate: async () => {} },
        { path: cleanupManifestPath, bytes: Buffer.from('bad'), validate: async () => {} },
      ],
    }),
    /non-empty path/i,
    'blank descriptors must be rejected before path resolution',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('PASS two-file transaction: success, validation, rollback, absent-file, and cleanup failure cases');
