import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { checkRetailMotionBanks } from '../scripts/check-retail-motion-banks.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'sf-mobile-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageDir = join(root, 'assets/ships/release/render-packages/test');
  await mkdir(packageDir, { recursive: true });
  const uri = 'assets/ships/motions/test.motion.json';
  const bankPath = join(root, uri);
  await mkdir(join(root, 'assets/ships/motions'), { recursive: true });
  const text = JSON.stringify({ schema: 'spaceface.rigidMotionBank.v1', rigId: 'test-rig', bindings: [] }, null, 2) + '\n';
  const ref = { uri, bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'), rigId: 'test-rig' };
  const save = () => writeFile(join(packageDir, 'render-package.json'), JSON.stringify({ runtime: { motionBank: ref } }));
  await save(); await writeFile(bankPath, text);
  return { root, bankPath, text, ref, save };
}
test('retail motion refs resolve to the exact shipped bank, with canonical LF pins', async t => {
  const f = await fixture(t);
  assert.deepEqual(await checkRetailMotionBanks(f.root), { packages: 1, references: 1, banks: 1 });
  await writeFile(f.bankPath, f.text.replace(/\n/g, '\r\n'));
  assert.equal((await checkRetailMotionBanks(f.root)).banks, 1);
});
test('an omitted motion subtree fails the shipping check even if the GLB exists', async t => {
  const f = await fixture(t); await rm(f.bankPath);
  await assert.rejects(checkRetailMotionBanks(f.root), /ENOENT/);
});
test('same-size swapped motion bytes cannot pass the package pin', async t => {
  const f = await fixture(t); await writeFile(f.bankPath, f.text.replace('test-rig', 'evil-rig'));
  await assert.rejects(checkRetailMotionBanks(f.root), /pin mismatch/);
});
test('runtime bank references cannot escape the shipping motion directory', async t => {
  const f = await fixture(t); f.ref.uri = '../secret.motion.json'; await f.save();
  await assert.rejects(checkRetailMotionBanks(f.root), /Unsafe or non-shipping/);
});
