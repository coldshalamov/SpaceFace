import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  createReleaseBuildReceipt,
  RELEASE_BUILD_RECEIPT,
  validateReleaseBuildReceipt,
} from '../scripts/lib/releasePackaging.mjs';

test('release receipt is deterministic and fails closed on omission or retail-only artifacts', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-release-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const web = join(root, 'build', 'web');
  const source = join(root, 'runtime');
  const destination = join(web, 'runtime');
  await mkdir(source, { recursive: true });
  await mkdir(destination, { recursive: true });
  await writeFile(join(source, 'model.glb'), 'authored-runtime-bytes');
  await writeFile(join(destination, 'model.glb'), 'authored-runtime-bytes');
  await writeFile(join(web, 'index.html'), '<script type="module" src="./main.js"></script>');
  await writeFile(join(web, 'main.js'), 'console.log("release")');

  const mappings = [{ source: 'runtime', destination: 'runtime' }];
  const first = await createReleaseBuildReceipt({ root, webRoot: web, mappings });
  const second = await createReleaseBuildReceipt({ root, webRoot: web, mappings });
  assert.equal(first.schema, RELEASE_BUILD_RECEIPT);
  assert.deepEqual(second, first, 'identical inputs must produce a byte-stable receipt without wall-clock fields');
  assert.equal(first.desktopOrigin, 'http://127.0.0.1:41788');
  assert.equal(first.playerRoute, '/');
  assert.equal(first.runtimeAssetMode, 'release-authored');
  assert.equal(first.productionDebug, false);
  assert.equal(first.copies[0].exact, true);

  const green = await validateReleaseBuildReceipt({ root, webRoot: web, receipt: first, mappings });
  assert.equal(green.pass, true, green.failures.join('; '));

  await writeFile(join(destination, 'model.glb'), 'truncated');
  const tampered = await validateReleaseBuildReceipt({ root, webRoot: web, receipt: first, mappings });
  assert.equal(tampered.pass, false);
  assert.ok(tampered.failures.some((failure) => /copied runtime roots|bundle output|byte-identical/i.test(failure)));

  await writeFile(join(destination, 'model.glb'), 'authored-runtime-bytes');
  await writeFile(join(web, 'source.blend'), 'authoring-source-must-not-ship');
  const leaked = await validateReleaseBuildReceipt({ root, webRoot: web, receipt: first, mappings });
  assert.equal(leaked.pass, false);
  assert.ok(leaked.failures.some((failure) => /authoring\/debug artifact/i.test(failure)));
});
