import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadValidationManifestById,
  parseTrackedManifestStage,
} from '../scripts/lib/validationManifestRegistry.mjs';

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));

async function createFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sf-manifest-registry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scripts', 'validation-manifests'), { recursive: true });
  await execFileAsync('git', ['init', '--quiet'], { cwd: root });
  return root;
}

async function writeManifest(root, id, source, { tracked = true } = {}) {
  const relative = path.posix.join('scripts', 'validation-manifests', `${id}.mjs`);
  await writeFile(path.join(root, ...relative.split('/')), source, 'utf8');
  if (tracked) await execFileAsync('git', ['add', '--', relative], { cwd: root });
  return relative;
}

test('tracked regular manifest loads only through matching default export', async (t) => {
  const root = await createFixture(t);
  await writeManifest(root, 'safe-cell', "export default { id: 'safe-cell', runtimeKind: 'browser' };\n");
  const manifest = await loadValidationManifestById({ root, id: 'safe-cell' });
  assert.equal(manifest.id, 'safe-cell');
  assert.equal(manifest.runtimeKind, 'browser');
});

test('unsafe ids and unknown modules fail before path import', async (t) => {
  const root = await createFixture(t);
  for (const id of ['../escape', 'nested/cell', 'nested\\cell', '.hidden', 'UPPER', 'cell.mjs', '']) {
    await assert.rejects(loadValidationManifestById({ root, id }), /VALIDATION_MANIFEST_ID_UNSAFE/);
  }
  await assert.rejects(
    loadValidationManifestById({ root, id: 'missing-cell' }),
    /VALIDATION_MANIFEST_NOT_TRACKED/,
  );
});

test('untracked module is rejected before its top-level side effect executes', async (t) => {
  const root = await createFixture(t);
  delete globalThis.__sfUntrackedManifestExecuted;
  await writeManifest(
    root,
    'untracked-cell',
    "globalThis.__sfUntrackedManifestExecuted = true; export default { id: 'untracked-cell' };\n",
    { tracked: false },
  );
  await assert.rejects(
    loadValidationManifestById({ root, id: 'untracked-cell' }),
    /VALIDATION_MANIFEST_NOT_TRACKED/,
  );
  assert.equal(globalThis.__sfUntrackedManifestExecuted, undefined);
});

test('missing default export and mismatched id fail closed', async (t) => {
  const root = await createFixture(t);
  await writeManifest(root, 'named-only', "export const namedOnly = { id: 'named-only' };\n");
  await writeManifest(root, 'wrong-id', "export default { id: 'different-id' };\n");
  await assert.rejects(
    loadValidationManifestById({ root, id: 'named-only' }),
    /VALIDATION_MANIFEST_DEFAULT_EXPORT_REQUIRED/,
  );
  await assert.rejects(
    loadValidationManifestById({ root, id: 'wrong-id' }),
    /VALIDATION_MANIFEST_ID_MISMATCH/,
  );
});

test('tracked manifests can remain explicitly disabled until their entry conditions are true', async (t) => {
  const root = await createFixture(t);
  await writeManifest(
    root,
    'deferred-cell',
    "export default { id: 'deferred-cell', registryEnabled: false };\n",
  );
  await assert.rejects(
    loadValidationManifestById({ root, id: 'deferred-cell' }),
    /VALIDATION_MANIFEST_REGISTRY_DISABLED/,
  );
});

test('deferred PQ-025 manifests remain unavailable through the live broker registry', async () => {
  for (const id of [
    'pq025-gold-corridor-smoke',
    'pq025-gold-corridor-qualification',
  ]) {
    await assert.rejects(
      loadValidationManifestById({ root: REPO_ROOT, id }),
      /VALIDATION_MANIFEST_REGISTRY_DISABLED/,
    );
  }
});

test('Git symlink and non-regular index modes are rejected before import', () => {
  assert.throws(
    () => parseTrackedManifestStage('120000 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0\tscripts/validation-manifests/link.mjs'),
    /VALIDATION_MANIFEST_NOT_REGULAR_TRACKED_FILE/,
  );
  assert.throws(
    () => parseTrackedManifestStage('160000 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0\tscripts/validation-manifests/submodule.mjs'),
    /VALIDATION_MANIFEST_NOT_REGULAR_TRACKED_FILE/,
  );
  assert.deepEqual(
    parseTrackedManifestStage('100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0\tscripts/validation-manifests/cell.mjs'),
    { mode: '100644', objectId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', stage: 0 },
  );
});
