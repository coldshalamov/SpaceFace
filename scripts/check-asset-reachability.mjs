// check-asset-reachability.mjs — regression guardrail for the asset-integration work.
//
// Fails when a player-facing asset is referenced by runtime code/styles but would not ship (missing
// on disk, or outside the roots that build-bundle.mjs copies and package.json globs into the release),
// and when an authoring-only reference sheet gets wired into the runtime game. This is a guardrail,
// not a deliverable: it prevents the "wired-but-not-bundled 404" and "labelled-contact-sheet-pasted-
// into-the-game" regressions from creeping back after the wiring landed.
//
// Scans src/ + styles/ only (runtime surfaces). Build/check tooling under scripts/ legitimately names
// release/dev asset paths that never ship, so it is not scanned. The one Node-only validation module
// under src/contracts is excluded for the same reason: its default names an authoring input and it is
// imported only by scripts/tests, never by the player entry graph.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_PORTRAITS,
  NAMED_CONTACT_PORTRAITS,
  PORTRAIT_ASSET_ROOT,
} from '../src/data/portraits.js';
import { WRECK_CATHEDRAL_EVIDENCE_CATALOG } from '../src/data/wreckCathedralEvidenceCatalog.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';
import { RELEASE_COPY_MAPPINGS } from './lib/releasePackaging.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Asset roots copied into build/web by build-bundle.mjs (RELEASE_COPY_MAPPINGS is the authority —
// a referenced asset outside them 404s in the shipped game). Derived rather than duplicated so a
// new bundled root cannot drift from this contract.
const BUNDLED_ROOTS = RELEASE_COPY_MAPPINGS
  .map((m) => m.source)
  .filter((source) => source.startsWith('assets/'));

// UI kit helpers (kitUrl/fhUrl in src/ui/kit) resolve their asset arguments under this prefix at
// runtime, so a source literal like 'assets/tiles/x.png' inside a kitUrl() call really ships as
// 'assets/ui/kit/assets/tiles/x.png'.
const UI_KIT_ROOT = 'assets/ui/kit';

// Authoring/reference-only assets: AI-generated LABELLED contact-sheet bibles (baked caption text, and in the
// pilot sheet's case the forbidden helmet/visor motif) must stay OUT of the runtime game. Each entry must exist on
// disk and must never be live-referenced by src/ or styles/. Owner ruling 2026-10-03: sheets like these are garbage and
// are deleted outright (the bible boards, the four ore sheets, the three fx sheets, the pilot sheet and the labelled
// menu reference still were removed that day), so the list is empty; add an entry only for a sheet that must be kept.
const REFERENCE_ONLY = {};

const SCAN_DIRS = ['src', 'styles'];
const SCAN_EXT = /\.(m?js|css)$/;
const NON_RUNTIME_SCAN_FILES = new Set(['src/contracts/assetValidation.js']);
// Match a relative assets/... path with a media extension (the leading ../ or ./ falls outside).
const ASSET_RE = /assets\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp|gif|mp4|webm|ogg|wav|mp3|aac|m4a|flac|opus|glb|gltf|ktx2|svg|json)/g;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Strip comments so asset paths that only appear in explanatory comments are not treated as live
// references. Handles /* ... */ blocks and whole-line // or * comments (the forms used here). Relative
// asset paths never contain "//", so trailing line-comment stripping cannot truncate a real reference.
function stripComments(src) {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlocks.split('\n').map((line) => {
    const t = line.trimStart();
    if (t.startsWith('//') || t.startsWith('*')) return '';
    const idx = line.indexOf('//');
    return idx >= 0 ? line.slice(0, idx) : line;
  }).join('\n');
}

// Collect live-referenced assets: path -> [referencing files].
const referenced = new Map();
const addReference = (asset, source) => {
  const rel = String(asset).replace(/^\.\//, '').replace(/\\/g, '/');
  if (!referenced.has(rel)) referenced.set(rel, []);
  if (!referenced.get(rel).includes(source)) referenced.get(rel).push(source);
};
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    if (!SCAN_EXT.test(file)) continue;
    const relFile = file.slice(ROOT.length + 1).replace(/\\/g, '/');
    if (NON_RUNTIME_SCAN_FILES.has(relFile)) continue;
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const match of code.match(ASSET_RE) || []) {
      addReference(match, relFile);
    }
  }
}

const thrusterManifestPath = 'assets/fx/thruster/manifest.json';
const thrusterManifest = JSON.parse(readFileSync(join(ROOT, thrusterManifestPath), 'utf8'));
const dynamicRegistries = Object.freeze({
  portraits: Object.freeze(
    [...Object.values(CANONICAL_PORTRAITS), ...Object.values(NAMED_CONTACT_PORTRAITS)]
      .map((file) => `${PORTRAIT_ASSET_ROOT}${file}`),
  ),
  wreckCathedralEvidence: Object.freeze(
    Object.values(WRECK_CATHEDRAL_EVIDENCE_CATALOG).map((entry) => entry.media.path),
  ),
  thrusterTextures: Object.freeze(
    (thrusterManifest.textures || []).map((entry) => entry.path),
  ),
});

for (const asset of dynamicRegistries.portraits) {
  addReference(asset, 'src/data/portraits.js#registry');
}
for (const asset of dynamicRegistries.wreckCathedralEvidence) {
  addReference(asset, 'src/data/wreckCathedralEvidenceCatalog.js#registry');
}
for (const asset of dynamicRegistries.thrusterTextures) {
  addReference(asset, thrusterManifestPath);
}

// Resolve kit-scoped literals: a literal that is missing at the repo root but present under
// UI_KIT_ROOT was passed through kitUrl/fhUrl and resolves there at runtime. Rewrite the reference
// to the resolved path so existence and bundled-root checks measure what actually ships.
for (const [asset, files] of [...referenced]) {
  if (existsSync(join(ROOT, asset))) continue;
  const kitPath = `${UI_KIT_ROOT}/${asset}`;
  if (!existsSync(join(ROOT, kitPath))) continue;
  referenced.delete(asset);
  if (!referenced.has(kitPath)) referenced.set(kitPath, []);
  for (const f of files) {
    if (!referenced.get(kitPath).includes(f)) referenced.get(kitPath).push(f);
  }
}

const issues = [];
const underBundledRoot = (asset) => BUNDLED_ROOTS.some((r) => asset === r || asset.startsWith(`${r}/`));
const packageRouteFor = (asset) => renderPackagePilotForSourceUrl(asset);
const physicallyBundled = (asset) => underBundledRoot(asset) && !packageRouteFor(asset);

// 1. Every referenced asset must exist on disk.
for (const [asset, files] of referenced) {
  if (!existsSync(join(ROOT, asset))) {
    issues.push(`MISSING: "${asset}" is referenced by ${files.join(', ')} but does not exist on disk.`);
  }
}

// 2. Every referenced asset must either remain physically present under a copied root or be an
// exact source URL intercepted by the shipping render-package manifest. Package-routed source GLBs
// are deliberately projected out of retail; their metadata and payload remain in the copied tree.
for (const [asset, files] of referenced) {
  const packageRoute = packageRouteFor(asset);
  if (!underBundledRoot(asset) && !packageRoute) {
    issues.push(`NOT RETAIL-ROUTABLE: "${asset}" (referenced by ${files.join(', ')}) is outside the bundled roots [${BUNDLED_ROOTS.join(', ')}] and has no render-package route. ` +
      `Add its directory to build-bundle.mjs + package.json build.files, or drop the reference.`);
  }
  if (packageRoute) {
    if (!existsSync(join(ROOT, packageRoute.metadataUrl))) {
      issues.push(`PACKAGE ROUTE MISSING: "${asset}" maps to absent metadata ${packageRoute.metadataUrl}.`);
      continue;
    }
    const metadata = JSON.parse(readFileSync(join(ROOT, packageRoute.metadataUrl), 'utf8'));
    const packageDir = dirname(packageRoute.metadataUrl).replace(/\\/g, '/');
    const renderPath = `${packageDir}/${metadata.render?.uri || ''}`;
    if (!metadata.render?.uri || !existsSync(join(ROOT, renderPath))) {
      issues.push(`PACKAGE ROUTE MISSING: "${asset}" maps to absent payload ${renderPath}.`);
    }
  }
}

// 3. Reference-only assets must still exist AND must never be live-referenced.
for (const [asset, reason] of Object.entries(REFERENCE_ONLY)) {
  if (!existsSync(join(ROOT, asset))) {
    issues.push(`STALE ALLOWLIST: reference-only "${asset}" no longer exists — prune it from REFERENCE_ONLY.`);
  }
  if (referenced.has(asset)) {
    issues.push(`REFERENCE-ONLY WIRED: "${asset}" is live-referenced by ${referenced.get(asset).join(', ')}, but it is authoring-only.\n    Reason it must not ship: ${reason}`);
  }
}

// 4. Keep BUNDLED_ROOTS honest: if build-bundle.mjs or the electron package stops shipping a root,
//    every asset referenced from it would silently start 404-ing.
const bundleSrc = readFileSync(join(ROOT, 'scripts/build-bundle.mjs'), 'utf8');
const releasePackSrc = readFileSync(join(ROOT, 'scripts/lib/releasePackaging.mjs'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const pkgFiles = (((pkg.build || {}).files) || []).map((f) => String(f).replace(/\\/g, '/'));
for (const root of BUNDLED_ROOTS) {
  const leaf = root.split('/').pop();
  const copiedInReleasePack = releasePackSrc.includes(`'${root}'`);
  if (!bundleSrc.includes(`'${leaf}'`) && !copiedInReleasePack) {
    issues.push(`BUNDLE DRIFT: scripts/build-bundle.mjs or releasePackaging.mjs no longer copies "${root}" — referenced assets there would 404 in the web release.`);
  }
  const globbed = pkgFiles.some((f) => f === `${root}/**` || f === `${root}/**/*` || f === root || f === 'assets/**' || f === 'assets/**/*' || f === 'build/web/**' || f === 'build/web/**/*');
  if (!globbed) {
    issues.push(`PACKAGE DRIFT: package.json build.files no longer globs "${root}" — referenced assets there would be absent from the electron package.`);
  }
}

const physicallyBundledRefs = [...referenced.keys()].filter(physicallyBundled).length;
const packageRoutedRefs = [...referenced.keys()].filter((asset) => Boolean(packageRouteFor(asset))).length;
const retailRoutableRefs = [...referenced.keys()].filter(
  (asset) => physicallyBundled(asset) || Boolean(packageRouteFor(asset)),
).length;
const report = {
  pass: issues.length === 0,
  issues,
  referencedAssetCount: referenced.size,
  physicallyBundledReferenceCount: physicallyBundledRefs,
  packageRoutedReferenceCount: packageRoutedRefs,
  retailRoutableReferenceCount: retailRoutableRefs,
  referenceOnlyCount: Object.keys(REFERENCE_ONLY).length,
  dynamicRegistries,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else if (issues.length) {
  console.error('asset reachability FAILED:\n' + issues.map((i) => '  - ' + i).join('\n'));
} else {
  console.log(`asset reachability OK — ${referenced.size} referenced runtime assets exist and are retail-routable ` +
    `(${physicallyBundledRefs} physically bundled, ${packageRoutedRefs} render-package-routed); ` +
    `${Object.keys(REFERENCE_ONLY).length} authoring-only reference sheets held out of the runtime.`);
}

if (issues.length) process.exit(1);
