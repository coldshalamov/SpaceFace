import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  acquireReleaseBuildLock,
  copyReleaseRuntimeTrees,
  createReleaseBuildReceipt,
  createReleaseCopyPlans,
  RELEASE_BUILD_RECEIPT,
  RELEASE_COPY_MAPPINGS,
  RENDER_PACKAGE_SOURCE_PROJECTION,
  validateReleaseBuildReceipt,
} from '../scripts/lib/releasePackaging.mjs';
import { RENDER_PACKAGE_PILOTS } from '../src/render/renderPackageManifest.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('release copy map includes only the live thruster texture runtime subtree', () => {
  assert.ok(
    RELEASE_COPY_MAPPINGS.some(({ source, destination }) =>
      source === 'assets/fx/thruster' && destination === 'assets/fx/thruster'),
    'the dynamically loaded thruster masks and their manifest must ship in web and Electron releases',
  );
  assert.equal(
    RELEASE_COPY_MAPPINGS.some(({ source }) => source === 'assets/fx'),
    false,
    'authoring-only FX contact sheets must remain outside the retail bundle',
  );
});

test('release build lock serializes candidates and recovers only dead owners', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-release-lock-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const buildRoot = join(root, 'build');
  const first = await acquireReleaseBuildLock({ projectRoot: root, buildRoot });
  await assert.rejects(
    acquireReleaseBuildLock({ projectRoot: root, buildRoot }),
    /already active/,
    'a concurrent build must fail before touching the shared staging tree',
  );
  await first.release();

  const stale = await acquireReleaseBuildLock({ projectRoot: root, buildRoot, pid: 987654321 });
  const recovered = await acquireReleaseBuildLock({ projectRoot: root, buildRoot, isProcessAlive: () => false });
  await recovered.release();
  await assert.rejects(
    stale.release(),
    /ENOENT|ownership changed/,
    'a stale owner may not remove the successor lock after recovery',
  );

  const externalLock = join(root, 'external-lock');
  const lockPath = join(buildRoot, 'web.__build.lock');
  await mkdir(externalLock, { recursive: true });
  await symlink(externalLock, lockPath, 'junction');
  await assert.rejects(
    acquireReleaseBuildLock({ projectRoot: root, buildRoot }),
    /may not traverse symbolic link/,
    'a redirected lock directory must not be inspected, renamed, or removed',
  );
  await rm(lockPath, { recursive: true, force: true });

  const externalBuild = join(root, 'external-build');
  await rm(buildRoot, { recursive: true, force: true });
  await mkdir(externalBuild, { recursive: true });
  try {
    await symlink(externalBuild, buildRoot, 'junction');
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.diagnostic('build-parent junction creation unavailable on this Windows host');
      return;
    }
    throw error;
  }
  await assert.rejects(
    acquireReleaseBuildLock({ projectRoot: root, buildRoot }),
    /may not traverse symbolic link/,
    'a repo-local build junction must fail before any recursive cleanup or publication',
  );
});

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

  const backendTampered = structuredClone(first);
  backendTampered.gameplayBackends.ai = 'legacy';
  const wrongBackend = await validateReleaseBuildReceipt({
    root,
    webRoot: web,
    receipt: backendTampered,
    mappings,
  });
  assert.equal(wrongBackend.pass, false);
  assert.ok(wrongBackend.failures.some((failure) => /gameplayBackends/));

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

test('release copier rejects path escapes and symbolic-link inputs', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-release-boundary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const web = join(root, 'build', 'web');
  await mkdir(join(root, 'runtime'), { recursive: true });
  await writeFile(join(root, 'runtime', 'model.glb'), 'runtime');

  await assert.rejects(
    copyReleaseRuntimeTrees({
      root,
      webRoot: web,
      mappings: [{ source: '../outside', destination: 'runtime' }],
      pilots: [],
    }),
    /contained relative path/,
  );
  await assert.rejects(
    copyReleaseRuntimeTrees({
      root,
      webRoot: web,
      mappings: [{ source: 'runtime', destination: '../outside' }],
      pilots: [],
    }),
    /contained relative path/,
  );

  let linkPath = join(root, 'runtime', 'linked.glb');
  try {
    await symlink(join(root, 'runtime', 'model.glb'), linkPath, 'file');
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      const targetDir = join(root, 'link-target');
      linkPath = join(root, 'runtime', 'linked-dir');
      await mkdir(targetDir, { recursive: true });
      await writeFile(join(targetDir, 'external.glb'), 'external');
      try {
        await symlink(targetDir, linkPath, 'junction');
      } catch (junctionError) {
        if (junctionError?.code === 'EPERM' || junctionError?.code === 'EACCES') {
          t.diagnostic('symbolic-link and junction creation unavailable on this Windows host');
          return;
        }
        throw junctionError;
      }
    } else {
      throw error;
    }
  }
  await assert.rejects(
    copyReleaseRuntimeTrees({
      root,
      webRoot: web,
      mappings: [{ source: 'runtime', destination: 'runtime' }],
      pilots: [],
    }),
    /refuses symbolic link/,
  );

  const mappedTarget = join(root, 'mapped-target');
  const mappedRoot = join(root, 'mapped-root');
  await mkdir(join(mappedTarget, 'nested'), { recursive: true });
  await writeFile(join(mappedTarget, 'outside.glb'), 'outside');
  await writeFile(join(mappedTarget, 'nested', 'outside.glb'), 'outside-nested');
  try {
    await symlink(mappedTarget, mappedRoot, 'junction');
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.diagnostic('mapping-root junction creation unavailable on this Windows host');
      return;
    }
    throw error;
  }
  await assert.rejects(
    copyReleaseRuntimeTrees({
      root,
      webRoot: web,
      mappings: [{ source: 'mapped-root', destination: 'mapped-root' }],
      pilots: [],
    }),
    /may not traverse symbolic link/,
  );
  await assert.rejects(
    copyReleaseRuntimeTrees({
      root,
      webRoot: web,
      mappings: [{ source: 'mapped-root/nested', destination: 'mapped-root' }],
      pilots: [],
    }),
    /may not traverse symbolic link/,
    'an ancestor junction below the project root must not redirect a mapped source',
  );

  const cleanSource = join(root, 'clean-runtime');
  const redirectedWeb = join(root, 'redirected-web');
  const redirectedTarget = join(root, 'redirected-target');
  await mkdir(cleanSource, { recursive: true });
  await mkdir(redirectedTarget, { recursive: true });
  await writeFile(join(cleanSource, 'clean.glb'), 'clean');
  await symlink(redirectedTarget, redirectedWeb, 'junction');
  await assert.rejects(
    copyReleaseRuntimeTrees({
      root,
      webRoot: redirectedWeb,
      mappings: [{ source: 'clean-runtime', destination: 'runtime' }],
      pilots: [],
    }),
    /may not traverse symbolic link/,
    'a destination-root junction must fail before any external write',
  );
});

test('retail projection replaces only manifest-proven source GLBs with their render packages', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-render-package-projection-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const web = join(root, 'build', 'web');
  const release = join(root, 'assets', 'ships', 'release');
  const pilot = RENDER_PACKAGE_PILOTS.find((entry) => entry.key === 'cockpit-dome');
  assert.ok(pilot, 'shipping cockpit-dome package fixture must exist');
  const sourceRel = pilot.sourceUrl.replace(/^assets\/ships\/release\//, '');
  const uncoveredRel = 'parts/wholeships/uncovered.glb';
  const metadataRel = pilot.metadataUrl.replace(/^assets\/ships\/release\//, '');
  const metadataBytes = await readFile(join(ROOT, ...pilot.metadataUrl.split('/')));
  const metadata = JSON.parse(metadataBytes.toString('utf8'));
  const renderRel = metadataRel.replace(/\/[^/]+$/, `/${metadata.render.uri}`);
  const sourceBytes = await readFile(join(ROOT, ...pilot.sourceUrl.split('/')));
  const renderBytes = await readFile(join(ROOT, 'assets', 'ships', 'release', ...renderRel.split('/')));
  await mkdir(dirname(join(release, ...sourceRel.split('/'))), { recursive: true });
  await mkdir(dirname(join(release, ...uncoveredRel.split('/'))), { recursive: true });
  await mkdir(dirname(join(release, ...metadataRel.split('/'))), { recursive: true });
  await writeFile(join(release, ...sourceRel.split('/')), sourceBytes);
  await writeFile(join(release, ...uncoveredRel.split('/')), 'uncovered-runtime-source');
  await writeFile(join(release, ...renderRel.split('/')), renderBytes);
  await writeFile(join(release, ...metadataRel.split('/')), metadataBytes);

  const mappings = [{
    source: 'assets/ships/release',
    destination: 'assets/ships/release',
    projection: RENDER_PACKAGE_SOURCE_PROJECTION,
  }];
  const plans = await createReleaseCopyPlans({ root, mappings, pilots: [pilot] });
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0].omissions.map(({ path }) => path), [sourceRel]);
  assert.equal(plans[0].omissions[0].bytes, sourceBytes.length);
  assert.equal(plans[0].omissions[0].replacement.renderPath, renderRel);

  await copyReleaseRuntimeTrees({ root, webRoot: web, mappings, pilots: [pilot] });
  const bundledRelease = join(web, 'assets', 'ships', 'release');
  assert.equal(existsSync(join(bundledRelease, ...sourceRel.split('/'))), false,
    'a source URL intercepted by the shipping package manifest must not duplicate its package in retail');
  assert.equal(existsSync(join(bundledRelease, ...uncoveredRel.split('/'))), true,
    'an uncovered source GLB must remain available to the ordinary loader');
  assert.equal(existsSync(join(bundledRelease, ...metadataRel.split('/'))), true);
  assert.equal(existsSync(join(bundledRelease, ...renderRel.split('/'))), true);

  await writeFile(join(web, 'index.html'), '<script type="module" src="./main.js"></script>');
  await writeFile(join(web, 'main.js'), 'console.log("projected release")');
  const receipt = await createReleaseBuildReceipt({
    root,
    webRoot: web,
    mappings,
    pilots: [pilot],
  });
  assert.equal(receipt.copies[0].projection, RENDER_PACKAGE_SOURCE_PROJECTION);
  assert.equal(receipt.copies[0].omittedFileCount, 1);
  assert.equal(receipt.copies[0].omittedBytes, sourceBytes.length);
  assert.equal(receipt.copies[0].exact, true);
  const valid = await validateReleaseBuildReceipt({ root, webRoot: web, receipt, mappings, pilots: [pilot] });
  assert.equal(valid.pass, true, valid.failures.join('; '));

  await writeFile(join(release, ...sourceRel.split('/')), 'changed-source');
  await assert.rejects(
    createReleaseCopyPlans({ root, mappings, pilots: [pilot] }),
    /does not match its package provenance and shipping manifest/,
    'a stale package may never authorize omission of changed source bytes',
  );
  await writeFile(join(release, ...sourceRel.split('/')), sourceBytes);

  await writeFile(join(release, ...renderRel.split('/')), 'changed-package');
  await assert.rejects(
    createReleaseCopyPlans({ root, mappings, pilots: [pilot] }),
    /render payload does not match/,
    'a missing or stale replacement payload must fail before copy',
  );
  await writeFile(join(release, ...renderRel.split('/')), renderBytes);

  const contentTampered = structuredClone(metadata);
  contentTampered.kind = metadata.kind === 'prop' ? 'part' : 'prop';
  await writeFile(join(release, ...metadataRel.split('/')), `${JSON.stringify(contentTampered)}\n`);
  await assert.rejects(
    createReleaseCopyPlans({ root, mappings, pilots: [pilot] }),
    /computed content hash does not match/,
    'metadata claims must be recomputed rather than trusted as self-attested hashes',
  );

  const semanticRuntimeTampered = structuredClone(metadata);
  semanticRuntimeTampered.runtime.primitives[0].matrix[12] += 1;
  await writeFile(join(release, ...metadataRel.split('/')), `${JSON.stringify(semanticRuntimeTampered)}\n`);
  await assert.rejects(
    createReleaseCopyPlans({ root, mappings, pilots: [pilot] }),
    /runtime table does not match its compiled render\.glb/,
    'runtime transform/tag/profile semantics outside contentHash must still be derived and verified',
  );

  const runtimeTampered = structuredClone(metadata);
  const firstRuntimeRecord = runtimeTampered.runtime.primitives[0] || runtimeTampered.runtime.markers[0];
  assert.ok(firstRuntimeRecord, 'real shipping fixture must carry runtime records');
  firstRuntimeRecord.planIndex = 999999;
  await writeFile(join(release, ...metadataRel.split('/')), `${JSON.stringify(runtimeTampered)}\n`);
  const runtimeGate = spawnSync(process.execPath, [
    join(ROOT, 'scripts', 'check-render-package-instance-plan.mjs'),
    '--package-dir', join(release, 'render-packages'),
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(runtimeGate.status, 0,
    'the exact package gate run by build-bundle must reject a tampered runtime table');
  assert.match(`${runtimeGate.stdout}\n${runtimeGate.stderr}`, /FAIL cockpit-dome|planIndex|runtime/i);
});
