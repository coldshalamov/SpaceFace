import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { publishFileSetTransaction } from '../tools/art/lib/multiFileTransaction.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('publishes a validated file set as one transaction', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = ['one.bin', 'two.bin', 'three.bin'].map((name) => join(root, name));
  await Promise.all(paths.map((path, index) => writeFile(path, `old-${index}`)));

  await publishFileSetTransaction({
    files: paths.map((path, index) => ({
      path,
      bytes: Buffer.from(`new-${index}`),
      expectedCurrentSha256: sha256(`old-${index}`),
      validate: async (_stagedPath, bytes) => {
        assert.equal(bytes.toString(), `new-${index}`);
      },
    })),
  });

  assert.deepEqual(
    await Promise.all(paths.map((path) => readFile(path, 'utf8'))),
    ['new-0', 'new-1', 'new-2'],
  );
});

test('restores every original when a later promotion fails', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = ['one.bin', 'two.bin', 'three.bin'].map((name) => join(root, name));
  await Promise.all(paths.map((path, index) => writeFile(path, `old-${index}`)));
  let liveRenameCount = 0;

  await assert.rejects(
    () => publishFileSetTransaction({
      files: paths.map((path, index) => ({
        path,
        bytes: Buffer.from(`new-${index}`),
        expectedCurrentSha256: sha256(`old-${index}`),
        validate: async () => {},
      })),
      fileOps: {
        rename: async (from, to) => {
          const { rename } = await import('node:fs/promises');
          if (to === paths[1]) {
            liveRenameCount++;
            if (liveRenameCount === 1) throw new Error('synthetic promotion failure');
          }
          await rename(from, to);
        },
      },
    }),
    /synthetic promotion failure.*original destinations restored/s,
  );

  assert.deepEqual(
    await Promise.all(paths.map((path) => readFile(path, 'utf8'))),
    ['old-0', 'old-1', 'old-2'],
  );
});

test('rejects a stale destination before moving any live file', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = ['one.bin', 'two.bin'].map((name) => join(root, name));
  await Promise.all(paths.map((path, index) => writeFile(path, `old-${index}`)));
  let renameCount = 0;

  await assert.rejects(
    () => publishFileSetTransaction({
      files: paths.map((path, index) => ({
        path,
        bytes: Buffer.from(`new-${index}`),
        expectedCurrentSha256: index === 0 ? sha256('some-other-version') : sha256(`old-${index}`),
        validate: async () => {},
      })),
      fileOps: {
        rename: async (...args) => {
          renameCount++;
          const { rename } = await import('node:fs/promises');
          await rename(...args);
        },
      },
    }),
    /checking current-hash preconditions.*current SHA-256 changed.*original destinations restored/s,
  );

  assert.equal(renameCount, 0);
  assert.deepEqual(
    await Promise.all(paths.map((path) => readFile(path, 'utf8'))),
    ['old-0', 'old-1'],
  );
});

test('preserves an external update detected after staged validation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = ['one.bin', 'two.bin'].map((name) => join(root, name));
  await Promise.all(paths.map((path, index) => writeFile(path, `old-${index}`)));
  let mutated = false;

  await assert.rejects(
    () => publishFileSetTransaction({
      files: paths.map((path, index) => ({
        path,
        bytes: Buffer.from(`new-${index}`),
        expectedCurrentSha256: sha256(`old-${index}`),
        validate: async () => {
          if (!mutated) {
            mutated = true;
            await writeFile(paths[1], 'external-update');
          }
        },
      })),
    }),
    /checking current-hash preconditions.*current SHA-256 changed.*original destinations restored/s,
  );

  assert.deepEqual(
    await Promise.all(paths.map((path) => readFile(path, 'utf8'))),
    ['old-0', 'external-update'],
  );
});

test('rolls back prior promotions when a later destination changes after the batch check', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = ['one.bin', 'two.bin'].map((name) => join(root, name));
  await Promise.all(paths.map((path, index) => writeFile(path, `old-${index}`)));
  let injectedLateUpdate = false;

  await assert.rejects(
    () => publishFileSetTransaction({
      files: paths.map((path, index) => ({
        path,
        bytes: Buffer.from(`new-${index}`),
        expectedCurrentSha256: sha256(`old-${index}`),
        validate: async () => {},
      })),
      fileOps: {
        rename: async (from, to) => {
          const { rename } = await import('node:fs/promises');
          await rename(from, to);
          if (to === paths[0] && !injectedLateUpdate) {
            injectedLateUpdate = true;
            await writeFile(paths[1], 'external-update');
          }
        },
      },
    }),
    /promoting.*current SHA-256 changed.*original destinations restored/s,
  );

  assert.deepEqual(
    await Promise.all(paths.map((path) => readFile(path, 'utf8'))),
    ['old-0', 'external-update'],
  );
});

test('rollback preserves an external edit to an already-promoted destination', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = ['one.bin', 'two.bin'].map((name) => join(root, name));
  await Promise.all(paths.map((path, index) => writeFile(path, `old-${index}`)));
  let injectedExternalEdit = false;

  await assert.rejects(
    () => publishFileSetTransaction({
      files: paths.map((path, index) => ({
        path,
        bytes: Buffer.from(`new-${index}`),
        expectedCurrentSha256: sha256(`old-${index}`),
        validate: async () => {},
      })),
      fileOps: {
        rename: async (from, to) => {
          const { rename } = await import('node:fs/promises');
          if (to === paths[1] && from.includes('.tmp')) {
            throw new Error('synthetic second-promotion failure');
          }
          await rename(from, to);
          if (to === paths[0] && from.includes('.tmp') && !injectedExternalEdit) {
            injectedExternalEdit = true;
            await writeFile(paths[0], 'external-update');
          }
        },
      },
    }),
    /synthetic second-promotion failure.*rollback incomplete.*externally changed after promotion.*backups retained/s,
  );

  assert.equal(await readFile(paths[0], 'utf8'), 'external-update');
  assert.equal(await readFile(paths[1], 'utf8'), 'old-1');
  assert.ok(
    (await readdir(root)).some((name) => name.startsWith('.one.bin.') && name.endsWith('.bak')),
    'the displaced original remains recoverable beside the external edit',
  );
});

test('supports a missing-destination hash precondition', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'new.bin');

  await publishFileSetTransaction({
    files: [{
      path,
      bytes: Buffer.from('created'),
      expectedCurrentSha256: null,
      validate: async () => {},
    }],
  });

  assert.equal(await readFile(path, 'utf8'), 'created');
});
