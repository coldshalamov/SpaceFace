import { createHash, randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  assertValidRenderPackage,
  computeRenderPackageContentHash,
} from '../../src/contracts/renderPackage.js';
import { RENDER_PACKAGE_PILOTS } from '../../src/render/renderPackageManifest.js';
import { buildRuntimeTableForRenderGlb } from './renderPackageRuntimeTable.mjs';

export const RELEASE_BUILD_RECEIPT = 'spaceface.releaseBuild.v2';
export const RELEASE_RECEIPT_FILE = 'spaceface-release-build.json';
export const RENDER_PACKAGE_SOURCE_PROJECTION = 'render-package-sources-v1';
const RELEASE_GAMEPLAY_BACKENDS = Object.freeze({
  physics: 'rapier-dynamic',
  ai: 'sg06-tactical',
  flight: 'v3',
});

export const RELEASE_COPY_MAPPINGS = Object.freeze([
  Object.freeze({ source: 'styles', destination: 'styles' }),
  Object.freeze({ source: 'assets/cinematics', destination: 'assets/cinematics' }),
  Object.freeze({ source: 'assets/ui', destination: 'assets/ui' }),
  // Normal play is release-authored by contract. Blender sources, evidence, candidates, and
  // previous exports do not belong in the retail package and are not runtime fallbacks. Source
  // GLBs that the shipping manifest always routes through a proven render package are omitted from
  // retail too; canonical release GLBs remain untouched in the repository.
  Object.freeze({
    source: 'assets/ships/release',
    destination: 'assets/ships/release',
    projection: RENDER_PACKAGE_SOURCE_PROJECTION,
  }),
  Object.freeze({ source: 'assets/portraits', destination: 'assets/portraits' }),
  // Runtime plume/RCS masks are loaded through template paths in vfx.js. Copy only this manifest-
  // governed subtree; the labelled FX reference sheets in assets/fx/ remain authoring-only.
  Object.freeze({ source: 'assets/fx/thruster', destination: 'assets/fx/thruster' }),
  Object.freeze({ source: 'src/data/scenarios', destination: 'data/scenarios' }),
  Object.freeze({ source: 'vendor/addons/libs', destination: 'vendor/addons/libs' }),
]);

export async function acquireReleaseBuildLock({
  buildRoot,
  projectRoot = null,
  pid = process.pid,
  isProcessAlive = defaultProcessIsAlive,
} = {}) {
  const root = resolve(buildRoot);
  const lockDir = join(root, 'web.__build.lock');
  const ownerPath = join(lockDir, 'owner.json');
  const token = randomUUID();
  if (projectRoot) {
    await assertReleasePathSafe({ root: projectRoot, path: root, label: 'release build root', allowMissing: true });
  }
  await mkdir(root, { recursive: true });
  if (projectRoot) {
    await assertReleasePathSafe({ root: projectRoot, path: root, label: 'release build root' });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    if (projectRoot) {
      await assertReleasePathSafe({
        root: projectRoot,
        path: lockDir,
        label: 'release build lock',
        allowMissing: true,
      });
    }
    try {
      await mkdir(lockDir);
      try {
        await writeFile(ownerPath, `${JSON.stringify({ pid, token })}\n`, { encoding: 'utf8', flag: 'wx' });
      } catch (error) {
        await rm(lockDir, { recursive: true, force: true });
        throw error;
      }
      let released = false;
      return Object.freeze({
        lockDir,
        token,
        async release() {
          if (released) return;
          const owner = JSON.parse(await readFile(ownerPath, 'utf8'));
          if (owner?.token !== token || owner?.pid !== pid) {
            throw new Error('release build lock ownership changed before release');
          }
          await rm(lockDir, { recursive: true, force: false });
          released = true;
        },
      });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const owner = await readBuildLockOwner(ownerPath);
      if (owner && isProcessAlive(owner.pid)) {
        throw new Error(`release build already active in pid ${owner.pid}`);
      }
      if (!owner) {
        const lockInfo = await stat(lockDir);
        if (Date.now() - lockInfo.mtimeMs < 30_000) {
          throw new Error('release build lock is still initializing');
        }
      }
      const staleDir = `${lockDir}.stale-${pid}-${token}`;
      try {
        await rename(lockDir, staleDir);
      } catch (renameError) {
        if (renameError?.code === 'ENOENT') continue;
        throw renameError;
      }
      await rm(staleDir, { recursive: true, force: true });
    }
  }
  throw new Error('release build lock could not be acquired');
}

export async function assertReleasePathSafe({ root, path, label = 'release path', allowMissing = false } = {}) {
  const projectRoot = resolve(root);
  const absolute = resolve(path);
  const rel = normalizeRel(relative(projectRoot, absolute));
  if (!rel || rel === '..' || rel.startsWith('../')) {
    throw new Error(`${label} must remain below ${projectRoot}: ${absolute}`);
  }
  await assertNoSymlinkPath(projectRoot, rel, label, { allowMissing });
  return absolute;
}

export async function createReleaseCopyPlans({
  root,
  mappings = RELEASE_COPY_MAPPINGS,
  pilots = RENDER_PACKAGE_PILOTS,
} = {}) {
  const projectRoot = resolve(root);
  const plans = [];
  for (const rawMapping of mappings) {
    const mapping = {
      ...rawMapping,
      source: safeRelativePath(rawMapping?.source, 'release copy source'),
      destination: safeRelativePath(rawMapping?.destination, 'release copy destination'),
    };
    const projection = mapping.projection || 'exact';
    await assertNoSymlinkPath(projectRoot, mapping.source, 'release copy source');
    const omissions = projection === RENDER_PACKAGE_SOURCE_PROJECTION
      ? await renderPackageSourceOmissions(projectRoot, mapping, pilots)
      : [];
    if (projection !== 'exact' && projection !== RENDER_PACKAGE_SOURCE_PROJECTION) {
      throw new Error(`unknown release copy projection ${projection}`);
    }
    plans.push({ mapping, projection, omissions });
  }
  return plans;
}

export async function copyReleaseRuntimeTrees({
  root,
  webRoot,
  mappings = RELEASE_COPY_MAPPINGS,
  pilots = RENDER_PACKAGE_PILOTS,
} = {}) {
  const projectRoot = resolve(root);
  const bundleRoot = resolve(webRoot);
  const plans = await createReleaseCopyPlans({ root: projectRoot, mappings, pilots });
  for (const plan of plans) {
    const source = resolveContained(projectRoot, plan.mapping.source, 'release copy source');
    const destination = resolveContained(bundleRoot, plan.mapping.destination, 'release copy destination');
    await assertNoSymlinkPath(bundleRoot, plan.mapping.destination, 'release copy destination', { allowMissing: true });
    const excluded = new Set(plan.omissions.map((entry) => entry.path));
    await copyProjectedDir(source, destination, source, excluded);
  }
  return plans;
}

export async function writeReleaseBuildReceipt({
  root,
  webRoot,
  mappings = RELEASE_COPY_MAPPINGS,
  pilots = RENDER_PACKAGE_PILOTS,
} = {}) {
  const receipt = await createReleaseBuildReceipt({ root, webRoot, mappings, pilots });
  await writeFile(join(webRoot, RELEASE_RECEIPT_FILE), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receipt;
}

export async function createReleaseBuildReceipt({
  root,
  webRoot,
  mappings = RELEASE_COPY_MAPPINGS,
  pilots = RENDER_PACKAGE_PILOTS,
} = {}) {
  const projectRoot = resolve(root);
  const bundleRoot = resolve(webRoot);
  // Re-derive the plan after copying instead of trusting the earlier copy plan. If an asset writer
  // changes a source, metadata file, or replacement payload during the build, receipt creation must
  // fail rather than bless a package assembled from two generations.
  const copyPlans = await createReleaseCopyPlans({ root: projectRoot, mappings, pilots });
  const copies = [];
  for (const plan of copyPlans) {
    const { mapping, omissions, projection } = plan;
    await assertNoSymlinkPath(bundleRoot, mapping.destination, 'release copy destination');
    const excluded = new Set(omissions.map((entry) => entry.path));
    const sourceTree = await digestTree(resolveContained(projectRoot, mapping.source, 'release copy source'), { exclude: excluded });
    const destinationTree = await digestTree(resolveContained(bundleRoot, mapping.destination, 'release copy destination'));
    const omittedTree = digestFileRecords(omissions.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })));
    const inputTree = digestFileRecords([
      ...sourceTree.files,
      ...omissions.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
    ]);
    copies.push({
      source: normalizeRel(mapping.source),
      destination: normalizeRel(mapping.destination),
      projection,
      sourceFileCount: inputTree.files.length,
      sourceBytes: inputTree.bytes,
      sourceInputDigest: inputTree.digest,
      fileCount: destinationTree.files.length,
      bytes: destinationTree.bytes,
      digest: destinationTree.digest,
      sourceDigest: sourceTree.digest,
      exact: sourceTree.digest === destinationTree.digest
        && sourceTree.files.length === destinationTree.files.length
        && sourceTree.bytes === destinationTree.bytes,
      omittedFileCount: omittedTree.files.length,
      omittedBytes: omittedTree.bytes,
      omittedDigest: omittedTree.digest,
      omissions,
    });
  }

  const output = await digestTree(bundleRoot, { exclude: new Set([RELEASE_RECEIPT_FILE]) });
  return {
    schema: RELEASE_BUILD_RECEIPT,
    playerRoute: '/',
    entrypoint: 'main.js',
    desktopOrigin: 'http://127.0.0.1:41788',
    runtimeAssetMode: 'release-authored',
    gameplayBackends: RELEASE_GAMEPLAY_BACKENDS,
    productionDebug: false,
    sourcemaps: false,
    copies,
    output: {
      fileCount: output.files.length,
      bytes: output.bytes,
      digest: output.digest,
      files: output.files,
    },
  };
}

export async function validateReleaseBuildReceipt({
  root,
  webRoot,
  receipt,
  mappings = RELEASE_COPY_MAPPINGS,
  pilots = RENDER_PACKAGE_PILOTS,
} = {}) {
  const failures = [];
  if (!receipt || receipt.schema !== RELEASE_BUILD_RECEIPT) failures.push(`schema must be ${RELEASE_BUILD_RECEIPT}`);
  if (receipt?.playerRoute !== '/') failures.push('playerRoute must be /');
  if (receipt?.entrypoint !== 'main.js') failures.push('entrypoint must be main.js');
  if (receipt?.desktopOrigin !== 'http://127.0.0.1:41788') failures.push('desktopOrigin must preserve the stable save origin');
  if (receipt?.runtimeAssetMode !== 'release-authored') failures.push('runtimeAssetMode must be release-authored');
  if (!isDeepStrictEqual(receipt?.gameplayBackends, RELEASE_GAMEPLAY_BACKENDS)) {
    failures.push('gameplayBackends must preserve rapier-dynamic, sg06-tactical, and v3');
  }
  if (receipt?.productionDebug !== false) failures.push('productionDebug must be false');
  if (receipt?.sourcemaps !== false) failures.push('sourcemaps must be false');
  if ('generatedAt' in (receipt || {}) || 'timestamp' in (receipt || {})) failures.push('receipt must not contain wall-clock fields');

  let expected = null;
  try {
    expected = await createReleaseBuildReceipt({ root, webRoot, mappings, pilots });
  } catch (error) {
    failures.push(`release copy projection is invalid: ${error && error.message || error}`);
    return { pass: false, failures, expected };
  }
  if (!isDeepStrictEqual(receipt, expected)) failures.push('release receipt envelope does not match the exact build contract');
  if (stableJson(receipt?.copies) !== stableJson(expected.copies)) failures.push('copied runtime roots do not match their declared projections');
  if (stableJson(receipt?.output) !== stableJson(expected.output)) failures.push('bundle output digest/file list does not match the receipt');
  for (const copy of receipt?.copies || []) {
    if (copy.exact !== true) failures.push(`${copy.source || 'copy'} is not byte-identical in the bundle`);
  }
  // Inspect the live output, not only the claimed receipt list, so an added authoring/debug file
  // cannot hide behind a stale otherwise-valid manifest.
  for (const file of expected.output.files || []) {
    if (/\.(?:map|blend|blend1)$/i.test(file.path)) failures.push(`retail bundle contains authoring/debug artifact ${file.path}`);
    if (/(?:^|\/)(?:evidence|release_candidates|revamp-evidence)(?:\/|$)/i.test(file.path)) {
      failures.push(`retail bundle contains non-runtime asset corpus ${file.path}`);
    }
  }
  return { pass: failures.length === 0, failures, expected };
}

export async function digestTree(root, { exclude = new Set() } = {}) {
  const base = resolve(root);
  const files = [];
  await walk(base, base, files, exclude);
  return digestFileRecords(files);
}

function digestFileRecords(inputFiles) {
  const files = inputFiles.slice().sort((a, b) => lexicalCompare(a.path, b.path));
  const hash = createHash('sha256');
  let bytes = 0;
  for (const file of files) {
    bytes += file.bytes;
    hash.update(file.path); hash.update('\0');
    hash.update(String(file.bytes)); hash.update('\0');
    hash.update(file.sha256); hash.update('\n');
  }
  return { files, bytes, digest: hash.digest('hex') };
}

async function renderPackageSourceOmissions(projectRoot, mapping, pilots) {
  const sourcePrefix = `${safeRelativePath(mapping.source, 'release copy source').replace(/\/$/, '')}/`;
  const seen = new Set();
  const omissions = [];
  for (const pilot of pilots || []) {
    const sourceUrl = safeRelativePath(pilot?.sourceUrl, 'render-package source URL');
    const metadataUrl = safeRelativePath(pilot?.metadataUrl, 'render-package metadata URL');
    if (!sourceUrl.startsWith(sourcePrefix)) {
      throw new Error(`render package ${pilot?.assetId || '<unknown>'} source escapes ${mapping.source}: ${sourceUrl}`);
    }
    if (!metadataUrl.startsWith(sourcePrefix)) {
      throw new Error(`render package ${pilot?.assetId || '<unknown>'} metadata escapes ${mapping.source}: ${metadataUrl}`);
    }
    if (seen.has(sourceUrl)) throw new Error(`duplicate render-package source URL ${sourceUrl}`);
    seen.add(sourceUrl);

    const sourcePath = resolveProjectFile(projectRoot, sourceUrl);
    const metadataPath = resolveProjectFile(projectRoot, metadataUrl);
    await assertNoSymlinkPath(projectRoot, sourceUrl, 'render-package source URL');
    await assertNoSymlinkPath(projectRoot, metadataUrl, 'render-package metadata URL');
    const mappingRoot = resolveContained(projectRoot, mapping.source, 'release copy source');
    const metadataRecord = await readFileRecord(metadataPath, normalizeRel(relative(mappingRoot, metadataPath)));
    const metadata = JSON.parse((await readFile(metadataPath)).toString('utf8'));
    assertValidRenderPackage(metadata, { file: metadataUrl });
    const computedContentHash = await computeRenderPackageContentHash(metadata);
    if (computedContentHash !== metadata.contentHash) {
      throw new Error(`${metadataUrl} computed content hash does not match its claim`);
    }
    if (metadata.assetId !== pilot.assetId) {
      throw new Error(`${metadataUrl} assetId ${metadata.assetId} does not match ${pilot.assetId}`);
    }
    if (metadata.contentHash !== pilot.expectedContentHash) {
      throw new Error(`${metadataUrl} content hash does not match the shipping manifest`);
    }
    if (metadata.runtime?.schema !== 'spaceface.renderPackageRuntime.v1') {
      throw new Error(`${metadataUrl} has no shipping runtime table`);
    }

    const sourceRecord = await readFileRecord(
      sourcePath,
      normalizeRel(relative(mappingRoot, sourcePath)),
    );
    const provenance = metadata.provenance?.sourceGlb;
    if (provenance?.uri !== basename(sourceUrl)
      || provenance?.bytes !== sourceRecord.bytes
      || provenance?.sha256 !== sourceRecord.sha256
      || pilot.sourceSha256 !== sourceRecord.sha256) {
      throw new Error(`${sourceUrl} does not match its package provenance and shipping manifest`);
    }

    const renderUri = normalizeRel(metadata.render?.uri);
    if (renderUri !== 'render.glb') {
      throw new Error(`${metadataUrl} render payload must be its package-local render.glb`);
    }
    const renderPath = resolve(dirname(metadataPath), ...renderUri.split('/'));
    const renderRel = normalizeRel(relative(mappingRoot, renderPath));
    if (renderRel.startsWith('../')) throw new Error(`${metadataUrl} render payload escapes ${mapping.source}`);
    await assertNoSymlinkPath(
      projectRoot,
      normalizeRel(relative(projectRoot, renderPath)),
      'render-package payload',
    );
    const renderRecord = await readFileRecord(renderPath, renderRel);
    if (metadata.render?.bytes !== renderRecord.bytes || metadata.render?.sha256 !== renderRecord.sha256) {
      throw new Error(`${metadataUrl} render payload does not match its bytes and SHA-256`);
    }
    const expectedRuntime = await buildRuntimeTableForRenderGlb(renderPath, {
      url: pilot.sourceUrl,
      slot: pilot.slot,
      assetId: pilot.runtimeAssetId,
      boundsOverride: unionGeometryBounds(metadata.geometry),
    });
    if (!isDeepStrictEqual(metadata.runtime, expectedRuntime)) {
      throw new Error(`${metadataUrl} runtime table does not match its compiled render.glb`);
    }

    omissions.push({
      path: sourceRecord.path,
      bytes: sourceRecord.bytes,
      sha256: sourceRecord.sha256,
      replacement: {
        assetId: pilot.assetId,
        contentHash: pilot.expectedContentHash,
        metadataPath: metadataRecord.path,
        metadataBytes: metadataRecord.bytes,
        metadataSha256: metadataRecord.sha256,
        renderPath: renderRecord.path,
        renderBytes: renderRecord.bytes,
        renderSha256: renderRecord.sha256,
      },
    });
  }
  omissions.sort((a, b) => lexicalCompare(a.path, b.path));
  return omissions;
}

async function readFileRecord(absolute, path) {
  const linkInfo = await lstat(absolute);
  if (linkInfo.isSymbolicLink()) throw new Error(`release inputs may not be symbolic links: ${absolute}`);
  const info = await stat(absolute);
  if (!info.isFile()) throw new Error(`required release file is not a file: ${absolute}`);
  return {
    path: normalizeRel(path),
    bytes: info.size,
    sha256: createHash('sha256').update(await readFile(absolute)).digest('hex'),
  };
}

function resolveProjectFile(projectRoot, url) {
  const clean = safeRelativePath(url, 'release file');
  const absolute = resolve(projectRoot, ...clean.split('/'));
  const rel = normalizeRel(relative(projectRoot, absolute));
  if (!rel || rel === '..' || rel.startsWith('../')) throw new Error(`release file escapes project root: ${url}`);
  return absolute;
}

async function copyProjectedDir(sourceRoot, destinationRoot, directory, excluded) {
  await mkdir(destinationRoot, { recursive: true });
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const source = join(directory, entry.name);
    const rel = normalizeRel(relative(sourceRoot, source));
    if (excluded.has(rel)) continue;
    if (entry.isSymbolicLink()) throw new Error(`release copy refuses symbolic link ${source}`);
    const destination = join(destinationRoot, ...rel.split('/'));
    if (entry.isDirectory()) await copyProjectedDir(sourceRoot, destinationRoot, source, excluded);
    else if (entry.isFile()) {
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
    } else throw new Error(`release copy refuses non-file entry ${source}`);
  }
}

async function walk(base, directory, files, exclude) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => lexicalCompare(a.name, b.name));
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    const rel = normalizeRel(relative(base, absolute));
    if (exclude.has(rel)) continue;
    if (entry.isSymbolicLink()) throw new Error(`release receipt refuses symbolic link ${absolute}`);
    if (entry.isDirectory()) {
      await walk(base, absolute, files, exclude);
      continue;
    }
    if (!entry.isFile()) continue;
    const info = await stat(absolute);
    const sha256 = createHash('sha256').update(await readFile(absolute)).digest('hex');
    files.push({ path: rel, bytes: info.size, sha256 });
  }
}

function stableJson(value) {
  return JSON.stringify(value ?? null);
}

function normalizeRel(value) {
  return String(value || '').split(sep).join('/').replace(/^\.\//, '');
}

function safeRelativePath(value, label) {
  const clean = String(value ?? '').replace(/\\/g, '/');
  const segments = clean.split('/');
  if (!clean || clean.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(clean) || clean.includes('\0')
    || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label} must be a contained relative path: ${clean || '<empty>'}`);
  }
  return segments.join('/');
}

function resolveContained(base, value, label) {
  const root = resolve(base);
  const clean = safeRelativePath(value, label);
  const absolute = resolve(root, ...clean.split('/'));
  const rel = normalizeRel(relative(root, absolute));
  if (!rel || rel === '..' || rel.startsWith('../')) {
    throw new Error(`${label} escapes ${root}: ${clean}`);
  }
  return absolute;
}

async function assertNoSymlinkPath(base, value, label, { allowMissing = false } = {}) {
  const root = resolve(base);
  const clean = safeRelativePath(value, label);
  let current = root;
  const components = ['<root>', ...clean.split('/')];
  for (let index = 0; index < components.length; index++) {
    if (index > 0) current = join(current, components[index]);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (allowMissing && error?.code === 'ENOENT') return;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`${label} may not traverse symbolic link ${current}`);
  }
}

function unionGeometryBounds(geometry) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const entry of geometry || []) {
    const bounds = entry?.bounds;
    if (!bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) continue;
    for (let axis = 0; axis < 3; axis++) {
      if (bounds.min[axis] < min[axis]) min[axis] = bounds.min[axis];
      if (bounds.max[axis] > max[axis]) max[axis] = bounds.max[axis];
    }
  }
  if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) {
    throw new Error('render package geometry carries no finite bounds; cannot verify runtime table');
  }
  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    center: [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2],
  };
}

function lexicalCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

async function readBuildLockOwner(ownerPath) {
  try {
    const owner = JSON.parse(await readFile(ownerPath, 'utf8'));
    return Number.isSafeInteger(owner?.pid) && owner.pid > 0 && typeof owner?.token === 'string'
      ? owner
      : null;
  } catch {
    return null;
  }
}

function defaultProcessIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}
