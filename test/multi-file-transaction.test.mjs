import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  inspectFileSetCooperativeLock,
  publishFileSetTransaction,
  reclaimOrphanedFileSetLocks,
} from '../tools/art/lib/multiFileTransaction.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function exitedChildPid() {
  const child = spawn(process.execPath, ['-e', 'process.exit(0)'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  const pid = child.pid;
  await once(child, 'exit');
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  return pid;
}

async function createRecoveryLockFixture(root, {
  ownerPid,
  ownerHostname = hostname(),
  createdAt = '2000-01-01T00:00:00.000Z',
} = {}) {
  const token = randomUUID();
  const destination = join(root, 'published.bin');
  const lockPath = join(root, '.published.bin.sf-file-set.lock');
  const staged = join(root, `.published.bin.sf-file-set-${token}-0.tmp`);
  const backup = join(root, `.published.bin.sf-file-set-${token}-0.bak`);
  const document = {
    schema: 'spaceface-file-set-lock/v1',
    kind: 'spaceface-file-set',
    token,
    owner: {
      pid: ownerPid,
      hostname: ownerHostname,
      createdAt,
    },
    target: destination,
    lockPath,
    participants: [{ target: destination, lockPath, role: 'destination' }],
    artifacts: [{
      index: 0,
      destination,
      staged,
      backup,
    }],
  };
  await writeFile(lockPath, `${JSON.stringify(document, null, 2)}\n`);
  return {
    token,
    destination,
    lockPath,
    staged,
    backup,
    document,
  };
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
  await assert.rejects(
    () => publishFileSetTransaction({
      files: paths.map((path, index) => ({
        path,
        bytes: Buffer.from(`new-${index}`),
        expectedCurrentSha256: sha256(`old-${index}`),
        validate: async () => {},
      })),
      fileOps: {
        link: async (from, to) => {
          const { link } = await import('node:fs/promises');
          if (from.endsWith('.tmp') && to === paths[1]) {
            throw new Error('synthetic promotion failure');
          }
          await link(from, to);
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
        link: async (from, to) => {
          const { link } = await import('node:fs/promises');
          await link(from, to);
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
        link: async (from, to) => {
          const { link } = await import('node:fs/promises');
          if (from.endsWith('.tmp') && to === paths[1]) {
            throw new Error('synthetic second-promotion failure');
          }
          await link(from, to);
          if (to === paths[0] && !injectedExternalEdit) {
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

test('rollback restore refuses recreation at its atomic no-replace boundary', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = ['one.bin', 'two.bin'].map((name) => join(root, name));
  await Promise.all(paths.map((path, index) => writeFile(path, `old-${index}`)));
  let injectedRestoreRecreation = false;

  await assert.rejects(
    () => publishFileSetTransaction({
      files: paths.map((path, index) => ({
        path,
        bytes: Buffer.from(`new-${index}`),
        expectedCurrentSha256: sha256(`old-${index}`),
        validate: async () => {},
      })),
      fileOps: {
        link: async (from, to) => {
          const { link } = await import('node:fs/promises');
          if (from.endsWith('.tmp') && to === paths[1]) {
            throw new Error('synthetic second-promotion failure');
          }
          if (from.endsWith('.bak') && to === paths[0] && !injectedRestoreRecreation) {
            injectedRestoreRecreation = true;
            await writeFile(to, 'external-at-restore-boundary');
          }
          await link(from, to);
        },
      },
    }),
    /synthetic second-promotion failure.*rollback incomplete.*destination recreated at atomic no-replace rollback restore.*backups retained/s,
  );

  assert.equal(await readFile(paths[0], 'utf8'), 'external-at-restore-boundary');
  assert.equal(await readFile(paths[1], 'utf8'), 'old-1');
  const names = await readdir(root);
  const firstBackup = names.find(
    (name) => name.startsWith('.one.bin.') && name.endsWith('.bak'),
  );
  assert.ok(firstBackup, 'the original displaced at restore must remain recoverable');
  assert.equal(await readFile(join(root, firstBackup), 'utf8'), 'old-0');
  assert.equal(names.some((name) => name.endsWith('.sf-file-set.lock')), false);
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

test('checks read-only guards without replacing them', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = join(root, 'published.bin');
  const guard = join(root, 'epoch-input.bin');
  await writeFile(destination, 'old-output');
  await writeFile(guard, 'epoch-input');

  await publishFileSetTransaction({
    files: [{
      path: destination,
      bytes: Buffer.from('new-output'),
      expectedCurrentSha256: sha256('old-output'),
      validate: async () => {},
    }],
    guards: [{
      path: guard,
      expectedCurrentSha256: sha256('epoch-input'),
    }],
  });

  assert.equal(await readFile(destination, 'utf8'), 'new-output');
  assert.equal(await readFile(guard, 'utf8'), 'epoch-input');
  assert.deepEqual((await readdir(root)).sort(), ['epoch-input.bin', 'published.bin']);
});

test('rejects a stale read-only guard before moving any destination', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = join(root, 'published.bin');
  const guard = join(root, 'epoch-input.bin');
  await writeFile(destination, 'old-output');
  await writeFile(guard, 'external-update');
  let renameCount = 0;

  await assert.rejects(
    () => publishFileSetTransaction({
      files: [{
        path: destination,
        bytes: Buffer.from('new-output'),
        expectedCurrentSha256: sha256('old-output'),
        validate: async () => {},
      }],
      guards: [{
        path: guard,
        expectedCurrentSha256: sha256('epoch-input'),
      }],
      fileOps: {
        rename: async (...args) => {
          renameCount++;
          const { rename } = await import('node:fs/promises');
          await rename(...args);
        },
      },
    }),
    /checking read-only guards.*current SHA-256 changed.*original destinations restored/s,
  );

  assert.equal(renameCount, 0);
  assert.equal(await readFile(destination, 'utf8'), 'old-output');
  assert.equal(await readFile(guard, 'utf8'), 'external-update');
});

test('guards an expected-missing input against concurrent creation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = join(root, 'published.bin');
  const guard = join(root, 'new-epoch-receipt.json');
  await writeFile(destination, 'old-output');
  let renameCount = 0;

  await assert.rejects(
    () => publishFileSetTransaction({
      files: [{
        path: destination,
        bytes: Buffer.from('new-output'),
        expectedCurrentSha256: sha256('old-output'),
        validate: async () => {
          await writeFile(guard, '{"epoch":"concurrent"}\n');
        },
      }],
      guards: [{
        path: guard,
        expectedCurrentSha256: null,
      }],
      fileOps: {
        rename: async (...args) => {
          renameCount++;
          const { rename } = await import('node:fs/promises');
          await rename(...args);
        },
      },
    }),
    /checking read-only guards.*expected <missing>.*original destinations restored/s,
  );

  assert.equal(renameCount, 0);
  assert.equal(await readFile(destination, 'utf8'), 'old-output');
  assert.equal(await readFile(guard, 'utf8'), '{"epoch":"concurrent"}\n');
});

test('rolls back promoted destinations when a read-only guard drifts during promotion', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destinations = ['one.bin', 'two.bin'].map((name) => join(root, name));
  const guard = join(root, 'epoch-input.bin');
  await Promise.all(destinations.map((path, index) => writeFile(path, `old-${index}`)));
  await writeFile(guard, 'epoch-input');
  let injectedGuardDrift = false;

  await assert.rejects(
    () => publishFileSetTransaction({
      files: destinations.map((path, index) => ({
        path,
        bytes: Buffer.from(`new-${index}`),
        expectedCurrentSha256: sha256(`old-${index}`),
        validate: async () => {},
      })),
      guards: [{
        path: guard,
        expectedCurrentSha256: sha256('epoch-input'),
      }],
      fileOps: {
        link: async (from, to) => {
          const { link } = await import('node:fs/promises');
          await link(from, to);
          if (to === destinations[0] && !injectedGuardDrift) {
            injectedGuardDrift = true;
            await writeFile(guard, 'external-update');
          }
        },
      },
    }),
    /promoting.*current SHA-256 changed.*original destinations restored/s,
  );

  assert.deepEqual(
    await Promise.all(destinations.map((path) => readFile(path, 'utf8'))),
    ['old-0', 'old-1'],
  );
  assert.equal(await readFile(guard, 'utf8'), 'external-update');
});

test('cooperative lock rejects an overlapping publisher before its precondition check', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = join(root, 'published.bin');
  await writeFile(destination, 'old-output');
  let announceBackup;
  let releaseBackup;
  const backupStarted = new Promise((resolveStarted) => {
    announceBackup = resolveStarted;
  });
  const backupCanContinue = new Promise((resolveContinue) => {
    releaseBackup = resolveContinue;
  });

  const firstPublish = publishFileSetTransaction({
    files: [{
      path: destination,
      bytes: Buffer.from('first-output'),
      expectedCurrentSha256: sha256('old-output'),
      validate: async () => {},
    }],
    fileOps: {
      rename: async (from, to) => {
        const { rename } = await import('node:fs/promises');
        await rename(from, to);
        if (from === destination && to.includes('.bak')) {
          announceBackup();
          await backupCanContinue;
        }
      },
    },
  });
  await backupStarted;

  const liveLock = await inspectFileSetCooperativeLock(
    join(root, '.published.bin.sf-file-set.lock'),
  );
  assert.equal(liveLock.ownerStatus, 'alive');
  assert.equal(liveLock.reclaimable, false);
  assert.deepEqual(
    liveLock.artifacts.map((artifact) => [artifact.role, artifact.status]),
    [['staged', 'file'], ['backup', 'file']],
  );

  await assert.rejects(
    () => publishFileSetTransaction({
      files: [{
        path: destination,
        bytes: Buffer.from('second-output'),
        expectedCurrentSha256: sha256('old-output'),
        validate: async () => {},
      }],
    }),
    /acquiring cooperative locks.*cooperative lock already held.*original destinations restored/s,
  );
  releaseBackup();
  await firstPublish;

  assert.equal(await readFile(destination, 'utf8'), 'first-output');
  assert.equal(
    (await readdir(root)).some((name) => name.endsWith('.sf-file-set.lock')),
    false,
  );
});

test('detects destination recreation after backup and preserves both recovery copies', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = join(root, 'published.bin');
  await writeFile(destination, 'old-output');
  let injectedRecreation = false;

  await assert.rejects(
    () => publishFileSetTransaction({
      files: [{
        path: destination,
        bytes: Buffer.from('new-output'),
        expectedCurrentSha256: sha256('old-output'),
        validate: async () => {},
      }],
      fileOps: {
        link: async (from, to) => {
          const { link } = await import('node:fs/promises');
          if (to === destination && !injectedRecreation) {
            injectedRecreation = true;
            await writeFile(destination, 'external-recreation');
          }
          await link(from, to);
        },
      },
    }),
    /destination recreated at atomic no-replace promotion.*rollback incomplete.*externally recreated after backup/s,
  );

  assert.equal(await readFile(destination, 'utf8'), 'external-recreation');
  const names = await readdir(root);
  const backupName = names.find(
    (name) => name.startsWith('.published.bin.') && name.endsWith('.bak'),
  );
  assert.ok(backupName, 'the displaced original must remain as an explicit recovery copy');
  assert.equal(await readFile(join(root, backupName), 'utf8'), 'old-output');
  assert.equal(names.some((name) => name.endsWith('.sf-file-set.lock')), false);
  assert.equal(names.some((name) => name.endsWith('.tmp')), false);
});

test('inspects and explicitly reclaims a clean dead-owner cooperative lock', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createRecoveryLockFixture(root, {
    ownerPid: await exitedChildPid(),
  });

  const inspection = await inspectFileSetCooperativeLock(fixture.lockPath);
  assert.equal(inspection.token, fixture.token);
  assert.equal(inspection.ownerStatus, 'dead');
  assert.equal(inspection.reclaimable, true);
  assert.deepEqual(
    inspection.artifacts.map((artifact) => [artifact.role, artifact.status]),
    [['staged', 'missing'], ['backup', 'missing']],
  );

  const wrongToken = randomUUID();
  await assert.rejects(
    () => reclaimOrphanedFileSetLocks({
      lockPath: fixture.lockPath,
      expectedToken: wrongToken,
    }),
    /token confirmation failed/,
  );
  assert.equal((await readFile(fixture.lockPath, 'utf8')).length > 0, true);

  const reclaimed = await reclaimOrphanedFileSetLocks({
    lockPath: fixture.lockPath,
    expectedToken: fixture.token,
  });
  assert.deepEqual(reclaimed.removedLockPaths, [fixture.lockPath]);
  assert.equal((await readdir(root)).includes('.published.bin.sf-file-set.lock'), false);
});

test('refuses to reclaim an old cooperative lock whose owning PID appears alive', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createRecoveryLockFixture(root, {
    ownerPid: process.pid,
    createdAt: '1999-01-01T00:00:00.000Z',
  });

  const inspection = await inspectFileSetCooperativeLock(fixture.lockPath);
  assert.equal(inspection.ownerStatus, 'alive');
  assert.equal(inspection.reclaimable, false);
  assert.match(inspection.blockers.join('; '), /owner PID appears alive/);
  await assert.rejects(
    () => reclaimOrphanedFileSetLocks({
      lockPath: fixture.lockPath,
      expectedToken: fixture.token,
    }),
    /recovery refused fail-closed.*owner PID appears alive/s,
  );
  assert.equal((await readFile(fixture.lockPath, 'utf8')).length > 0, true);
});

test('inventories recovery artifacts and retains their dead-owner lock fail-closed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await createRecoveryLockFixture(root, {
    ownerPid: await exitedChildPid(),
  });
  await writeFile(fixture.staged, 'unresolved staged bytes');

  const inspection = await inspectFileSetCooperativeLock(fixture.lockPath);
  assert.equal(inspection.ownerStatus, 'dead');
  assert.equal(inspection.reclaimable, false);
  assert.deepEqual(
    inspection.artifacts.map((artifact) => [artifact.role, artifact.status]),
    [['staged', 'file'], ['backup', 'missing']],
  );
  await assert.rejects(
    () => reclaimOrphanedFileSetLocks({
      lockPath: fixture.lockPath,
      expectedToken: fixture.token,
    }),
    /recovery refused fail-closed.*unresolved staged recovery artifact/s,
  );
  assert.equal(await readFile(fixture.staged, 'utf8'), 'unresolved staged bytes');
  assert.equal((await readFile(fixture.lockPath, 'utf8')).length > 0, true);
});

test('never reclaims an unknown or path-invalid lock document', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-file-set-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const unknownLockPath = join(root, '.unknown.bin.sf-file-set.lock');
  const unknownPayload = 'legacy-or-foreign-lock\n';
  await writeFile(unknownLockPath, unknownPayload);

  await assert.rejects(
    () => inspectFileSetCooperativeLock(unknownLockPath),
    /not valid JSON/,
  );
  await assert.rejects(
    () => reclaimOrphanedFileSetLocks({
      lockPath: unknownLockPath,
      expectedToken: randomUUID(),
    }),
    /not valid JSON/,
  );
  assert.equal(await readFile(unknownLockPath, 'utf8'), unknownPayload);

  const fixture = await createRecoveryLockFixture(root, {
    ownerPid: await exitedChildPid(),
  });
  fixture.document.lockPath = join(root, '.different.bin.sf-file-set.lock');
  await writeFile(fixture.lockPath, `${JSON.stringify(fixture.document, null, 2)}\n`);
  await assert.rejects(
    () => inspectFileSetCooperativeLock(fixture.lockPath),
    /document path mismatch/,
  );
  assert.equal((await readFile(fixture.lockPath, 'utf8')).length > 0, true);
});
