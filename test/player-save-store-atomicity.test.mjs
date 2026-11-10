// The on-disk player save store must never trade a known-good save for a failed write.
// writeAtomicSync used to answer a failed rename by deleting the live primary and retrying:
// any promote failure (lock, AV scan, transient EPERM) destroyed the previous save it was
// meant to protect. These tests pin: temp write + ONE rename — success replaces, failure
// preserves the old bytes, propagates the real error, and leaves no abandoned temp.
//   node --test test/player-save-store-atomicity.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  readPlayerStoreKeysSync,
  writePlayerStoreKeysSync,
} = require('../scripts/lib/playerSaveStore.cjs');

const PRIMARY = 'sf.save.auto.json';
const ORIGINAL = '{"fmt":"spaceface-save","version":11,"data":"keep me"}';

const noAbandonedTemp = (dir) => fs.readdirSync(dir).filter((n) => n.includes('.tmp-'));

test('a failed promote preserves the previous primary and cleans only its own temp', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'spaceface-store-atomic-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const primary = path.join(dir, PRIMARY);
  fs.writeFileSync(primary, ORIGINAL);

  const boom = new Error('rename denied');
  t.mock.method(fs, 'renameSync', () => { throw boom; });

  assert.throws(
    () => writePlayerStoreKeysSync(dir, { 'sf.save.auto': '{"v":2}' }),
    (err) => err === boom,
    'the original rename error must propagate, not be masked',
  );
  assert.equal(fs.readFileSync(primary, 'utf8'), ORIGINAL,
    'a failed promote must not delete the known-good save');
  assert.deepEqual(noAbandonedTemp(dir), [], 'this attempt leaves no temp behind');
});

test('a temp-write failure before rename keeps the primary and propagates', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'spaceface-store-atomic-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const primary = path.join(dir, PRIMARY);
  fs.writeFileSync(primary, ORIGINAL);

  const boom = new Error('disk full');
  t.mock.method(fs, 'writeFileSync', () => { throw boom; });

  assert.throws(
    () => writePlayerStoreKeysSync(dir, { 'sf.save.auto': '{"v":2}' }),
    (err) => err === boom,
  );
  assert.equal(fs.readFileSync(primary, 'utf8'), ORIGINAL, 'the primary was never touched');
  assert.deepEqual(noAbandonedTemp(dir), []);
});

test('a torn temp write (real bytes, then error) still cleans the temp and keeps the primary', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'spaceface-store-atomic-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const primary = path.join(dir, PRIMARY);
  fs.writeFileSync(primary, ORIGINAL);

  const realWrite = fs.writeFileSync;
  const boom = new Error('ENOSPC mid-write');
  t.mock.method(fs, 'writeFileSync', (file, contents, opts) => {
    // A torn write: real partial bytes land on the temp path, then the disk reports full.
    realWrite.call(fs, file, typeof contents === 'string' ? contents.slice(0, 4) : contents, opts);
    throw boom;
  });

  assert.throws(
    () => writePlayerStoreKeysSync(dir, { 'sf.save.auto': '{"v":2}' }),
    (err) => err === boom,
    'the original write error must propagate, not a cleanup artifact',
  );
  assert.equal(fs.readFileSync(primary, 'utf8'), ORIGINAL, 'the primary was never touched');
  assert.deepEqual(noAbandonedTemp(dir), [], 'the torn temp must not be abandoned on disk');
});

test('a healthy promote still replaces the primary atomically', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'spaceface-store-atomic-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const primary = path.join(dir, PRIMARY);
  fs.writeFileSync(primary, ORIGINAL);

  writePlayerStoreKeysSync(dir, { 'sf.save.auto': '{"v":2}' });
  assert.equal(fs.readFileSync(primary, 'utf8'), '{"v":2}', 'the new bytes replace the old');
  assert.deepEqual(noAbandonedTemp(dir), [], 'the temp is gone after a successful promote');
});

test('empty and blank store dirs never resolve to cwd: read {} and write throws before any disk I/O', async (t) => {
  // path.resolve('') is the cwd — an empty/blank dir used to sail through the root guard and
  // then mkdir+write save files into whatever directory the process happened to be in. The raw
  // directory must be validated before resolve.
  const boom = new Error('disk touched');
  t.mock.method(fs, 'mkdirSync', () => { throw boom; });
  t.mock.method(fs, 'writeFileSync', () => { throw boom; });

  for (const dir of ['', '   ']) {
    assert.deepEqual(readPlayerStoreKeysSync(dir), {}, `empty/blank dir ${JSON.stringify(dir)} reads as no saves`);
    assert.throws(
      () => writePlayerStoreKeysSync(dir, { 'sf.save.auto': '{"v":1}' }),
      /player store directory is required/,
      'write must reject before mkdir/temp write, not land in cwd',
    );
  }
});
