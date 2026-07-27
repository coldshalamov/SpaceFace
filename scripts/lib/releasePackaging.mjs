import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

export const RELEASE_BUILD_RECEIPT = 'spaceface.releaseBuild.v1';
export const RELEASE_RECEIPT_FILE = 'spaceface-release-build.json';

export const RELEASE_COPY_MAPPINGS = Object.freeze([
  Object.freeze({ source: 'styles', destination: 'styles' }),
  Object.freeze({ source: 'assets/cinematics', destination: 'assets/cinematics' }),
  Object.freeze({ source: 'assets/ui', destination: 'assets/ui' }),
  // Normal play is release-authored by contract. Blender sources, evidence, candidates, and
  // previous exports do not belong in the retail package and are not runtime fallbacks.
  Object.freeze({ source: 'assets/ships/release', destination: 'assets/ships/release' }),
  Object.freeze({ source: 'assets/portraits', destination: 'assets/portraits' }),
  // Runtime plume/RCS masks are loaded through template paths in vfx.js. Copy only this manifest-
  // governed subtree; the labelled FX reference sheets in assets/fx/ remain authoring-only.
  Object.freeze({ source: 'assets/fx/thruster', destination: 'assets/fx/thruster' }),
  Object.freeze({ source: 'src/data/scenarios', destination: 'data/scenarios' }),
  Object.freeze({ source: 'vendor/addons/libs', destination: 'vendor/addons/libs' }),
]);

export async function writeReleaseBuildReceipt({ root, webRoot, mappings = RELEASE_COPY_MAPPINGS } = {}) {
  const receipt = await createReleaseBuildReceipt({ root, webRoot, mappings });
  await writeFile(join(webRoot, RELEASE_RECEIPT_FILE), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receipt;
}

export async function createReleaseBuildReceipt({ root, webRoot, mappings = RELEASE_COPY_MAPPINGS } = {}) {
  const projectRoot = resolve(root);
  const bundleRoot = resolve(webRoot);
  const copies = [];
  for (const mapping of mappings) {
    const sourceTree = await digestTree(join(projectRoot, mapping.source));
    const destinationTree = await digestTree(join(bundleRoot, mapping.destination));
    copies.push({
      source: normalizeRel(mapping.source),
      destination: normalizeRel(mapping.destination),
      fileCount: destinationTree.files.length,
      bytes: destinationTree.bytes,
      digest: destinationTree.digest,
      sourceDigest: sourceTree.digest,
      exact: sourceTree.digest === destinationTree.digest
        && sourceTree.files.length === destinationTree.files.length
        && sourceTree.bytes === destinationTree.bytes,
    });
  }

  const output = await digestTree(bundleRoot, { exclude: new Set([RELEASE_RECEIPT_FILE]) });
  return {
    schema: RELEASE_BUILD_RECEIPT,
    playerRoute: '/',
    entrypoint: 'main.js',
    desktopOrigin: 'http://127.0.0.1:41788',
    runtimeAssetMode: 'release-authored',
    gameplayBackends: Object.freeze({ physics: 'rapier-dynamic', ai: 'sg06-tactical', flight: 'v3' }),
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

export async function validateReleaseBuildReceipt({ root, webRoot, receipt, mappings = RELEASE_COPY_MAPPINGS } = {}) {
  const failures = [];
  if (!receipt || receipt.schema !== RELEASE_BUILD_RECEIPT) failures.push(`schema must be ${RELEASE_BUILD_RECEIPT}`);
  if (receipt?.playerRoute !== '/') failures.push('playerRoute must be /');
  if (receipt?.entrypoint !== 'main.js') failures.push('entrypoint must be main.js');
  if (receipt?.desktopOrigin !== 'http://127.0.0.1:41788') failures.push('desktopOrigin must preserve the stable save origin');
  if (receipt?.runtimeAssetMode !== 'release-authored') failures.push('runtimeAssetMode must be release-authored');
  if (receipt?.productionDebug !== false) failures.push('productionDebug must be false');
  if (receipt?.sourcemaps !== false) failures.push('sourcemaps must be false');
  if ('generatedAt' in (receipt || {}) || 'timestamp' in (receipt || {})) failures.push('receipt must not contain wall-clock fields');

  const expected = await createReleaseBuildReceipt({ root, webRoot, mappings });
  if (stableJson(receipt?.copies) !== stableJson(expected.copies)) failures.push('copied runtime roots do not match their source bytes');
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
  files.sort((a, b) => lexicalCompare(a.path, b.path));
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

async function walk(base, directory, files, exclude) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => lexicalCompare(a.name, b.name));
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    const rel = normalizeRel(relative(base, absolute));
    if (exclude.has(rel)) continue;
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

function lexicalCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
