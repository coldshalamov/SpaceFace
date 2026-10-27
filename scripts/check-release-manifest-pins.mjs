// Fast pre-push gate: every render-package pilot pin must match the files on disk.
//
// This is the cheap half of the bundle's release-manifest gate
// (scripts/lib/releasePackaging.mjs renderPackageSourceOmissions): it verifies
//   - render-package.json contentHash == its own computed hash (package not stale)
//   - pilot.expectedContentHash == package contentHash (manifest re-pinned after recompile)
//   - pilot.sourceSha256 + provenance bind the actual release GLB bytes
//   - render.glb bytes match the package's render claims
// It skips the GLTF runtime-table deep parse (the heavy half) — run
// `npm run check:render-package-pilots` or `npm run build:bundle` for the full proof.
//
// Why this exists: a commit that re-authors a release GLB + pilots.json but skips
// the package recompile / manifest regeneration leaves every push failing the
// Vercel production build ~3 minutes in (see docs/VERCEL_DEPLOYMENT.md).
// Run this BEFORE pushing any change under assets/ships/release/ or pilots.json.
//
//   node scripts/check-release-manifest-pins.mjs
//   node scripts/check-release-manifest-pins.mjs --only=towline-kit,massline-express-liner-v1
import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  assertValidRenderPackage,
  computeRenderPackageContentHash,
} from '../src/contracts/renderPackage.js';
import { RENDER_PACKAGE_PILOTS } from '../src/render/renderPackageManifest.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice(7).split(',')) : null;

const failures = [];
let checked = 0;
for (const pilot of RENDER_PACKAGE_PILOTS) {
  if (only && !only.has(pilot.key)) continue;
  checked++;
  const prefix = pilot.key;
  try {
    const metadataPath = join(ROOT, pilot.metadataUrl);
    const metadata = JSON.parse(await readFile(metadataPath));
    assertValidRenderPackage(metadata, { file: pilot.metadataUrl });

    const computed = await computeRenderPackageContentHash(metadata);
    if (computed !== metadata.contentHash) {
      throw new Error('contentHash is stale vs its own contents; rebuild the package');
    }
    if (metadata.assetId !== pilot.assetId) {
      throw new Error(`assetId ${metadata.assetId} != pilot ${pilot.assetId}`);
    }
    if (metadata.contentHash !== pilot.expectedContentHash) {
      throw new Error(
        'package contentHash does not match the shipping manifest; '
        + 'regenerate src/render/renderPackageManifest.js '
        + '(node scripts/build-render-package-pilots.mjs --only=' + prefix + ')',
      );
    }
    if (metadata.runtime?.schema !== 'spaceface.renderPackageRuntime.v1') {
      throw new Error('missing shipping runtime table');
    }

    const sourceBytes = await readFile(join(ROOT, pilot.sourceUrl));
    const sourceSha = sha256(sourceBytes);
    const provenance = metadata.provenance?.sourceGlb;
    if (pilot.sourceSha256 !== sourceSha) {
      throw new Error(
        'pilot.sourceSha256 does not match the release GLB; '
        + 'rebuild the package and regenerate the manifest',
      );
    }
    if (provenance?.uri !== basename(pilot.sourceUrl)
      || provenance?.bytes !== sourceBytes.length
      || provenance?.sha256 !== sourceSha) {
      throw new Error(
        'package provenance does not match the release GLB; '
        + 'recompile the render package against the current GLB',
      );
    }

    const renderPath = join(dirname(metadataPath), 'render.glb');
    const renderBytes = await readFile(renderPath);
    if (metadata.render?.uri !== 'render.glb'
      || metadata.render?.bytes !== renderBytes.length
      || metadata.render?.sha256 !== sha256(renderBytes)) {
      throw new Error('render.glb does not match the package render claims; recompile the package');
    }
  } catch (error) {
    failures.push(`${prefix}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(`release-manifest-pins: ${failures.length}/${checked} pilots stale`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nRe-authoring protocol: recompile the package + regenerate the manifest in the same commit\n'
    + '(assets/ships/AGENTS.md step 4). See docs/VERCEL_DEPLOYMENT.md.',
  );
  process.exit(1);
}

// Every GLB in the retail copy must be declared by the release manifest. A release build writes
// files but never deletes one that a later blocking decision retired, and the retail projection
// copies the tree wholesale - so a retired original silently rides along in every deploy. This is
// the cheapest place to catch it: no GLB parsing, just the manifest against the directory.
if (!only) {
  const RELEASE_ROOT = join(ROOT, 'assets/ships/release');
  const declared = new Set(
    JSON.parse(await readFile(join(RELEASE_ROOT, 'release_manifest.json'), 'utf8'))
      .assets.map((asset) => String(asset.release).replace(/\\/g, '/')),
  );
  const undeclared = [];
  const walk = async (dir) => {
    const { readdir } = await import('node:fs/promises');
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'render-packages') continue;
        await walk(full);
      } else if (entry.name.endsWith('.glb')) {
        const relative = full.slice(ROOT.length + 1).replace(/\\/g, '/');
        if (!declared.has(relative)) undeclared.push(relative);
      }
    }
  };
  await walk(RELEASE_ROOT);
  if (undeclared.length) {
    console.error(`release-manifest-pins: ${undeclared.length} shipped GLB(s) are not declared by release_manifest.json`);
    for (const file of undeclared) console.error(`  ${file}`);
    console.error(
      '\nA release build never deletes a file a later decision retired. Delete it, or give it a\n'
      + 'manifest row (and a render package) if it still ships. npm run check:asset-census prints\n'
      + 'the bytes this is costing.',
    );
    process.exit(1);
  }
}

console.log(`release-manifest-pins: ${checked} pilots consistent with on-disk release assets`);
