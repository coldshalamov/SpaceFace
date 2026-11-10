import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { auditExpectedTree } from '../scripts/lib/treeAudit.mjs';

test('auditExpectedTree flags only unowned files, scopes by extension, and prunes files only', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-tree-audit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, 'voice');
  await mkdir(join(dir, 'blind'), { recursive: true });
  await mkdir(join(dir, 'orphan-dir'), { recursive: true });
  await writeFile(join(dir, 'keep.wav'), 'k');
  await writeFile(join(dir, 'stale.wav'), 's');
  await writeFile(join(dir, 'blind', 'clip_0.wav'), 'c');
  await writeFile(join(dir, 'blind', 'stale_blind.wav'), 's');
  await writeFile(join(dir, 'orphan-dir', 'nested.wav'), 'n');
  await writeFile(join(dir, 'Thumbs.db'), 'os');

  const expected = new Set(['keep.wav', 'blind/clip_0.wav']);

  const flagged = auditExpectedTree(dir, expected, { extensions: /\.wav$/i });
  assert.deepEqual(flagged.sort(), ['blind/stale_blind.wav', 'orphan-dir/nested.wav', 'stale.wav'],
    'only unowned .wav files flag — OS debris and owned files stay silent');

  const pruned = auditExpectedTree(dir, expected, { extensions: /\.wav$/i, prune: true });
  assert.deepEqual(pruned.sort(), flagged, 'prune reports the same strays it deletes');
  assert.equal(existsSync(join(dir, 'stale.wav')), false, 'pruned file deleted');
  assert.equal(existsSync(join(dir, 'keep.wav')), true, 'owned file untouched');
  assert.equal(existsSync(join(dir, 'orphan-dir')), true, 'prune never removes directories');
  assert.equal(existsSync(join(dir, 'Thumbs.db')), true, 'non-wav debris untouched');

  assert.deepEqual(auditExpectedTree(join(root, 'missing'), expected), [], 'missing tree flags nothing');
});
