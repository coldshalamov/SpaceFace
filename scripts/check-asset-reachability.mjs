// check-asset-reachability.mjs — regression guardrail for the asset-integration work.
//
// Fails when a player-facing asset is referenced by runtime code/styles but would not ship (missing
// on disk, or outside the roots that build-bundle.mjs copies and package.json globs into the release),
// and when an authoring-only reference sheet gets wired into the runtime game. This is a guardrail,
// not a deliverable: it prevents the "wired-but-not-bundled 404" and "labelled-contact-sheet-pasted-
// into-the-game" regressions from creeping back after the wiring landed.
//
// Scans src/ + styles/ only (runtime surfaces). Build/check tooling under scripts/ legitimately names
// release/dev asset paths that never ship, so it is not scanned.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_PORTRAITS,
  PORTRAIT_ASSET_ROOT,
  ROLE_PORTRAITS,
} from '../src/data/portraits.js';
import { WRECK_CATHEDRAL_EVIDENCE_CATALOG } from '../src/data/wreckCathedralEvidenceCatalog.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Asset roots copied into build/web by build-bundle.mjs AND globbed into the electron package by
// package.json build.files. A referenced asset outside these roots 404s in the shipped game.
const BUNDLED_ROOTS = [
  'assets/cinematics',
  'assets/ui',
  'assets/ships',
  'assets/portraits',
  'assets/fx/thruster',
];

// Authoring/reference-only assets: AI-generated LABELLED contact-sheet bibles (baked caption text,
// and in the pilot sheet's case the forbidden helmet/visor motif). They must stay OUT of the runtime
// game. Each entry must exist on disk (so the allowlist stays real) and must never be live-referenced
// by src/ or styles/. This list is the machine-readable record of "deliberately not wired, and why",
// so future passes stop re-discovering these as unwired assets and trying to wire them.
const REFERENCE_ONLY = {
  'assets/pilots/pf_spaceface_portraits.jpg':
    'Labelled pilot-portrait bible sheet of helmet+visor pilots — the exact banned no-visor/no-avatar motif; runtime HUD never uses this. Station bar contacts use assets/portraits/*.jpg instead.',
  'assets/ores/ore_ice_hero.jpg':
    'Labelled multi-panel ore contact sheet (baked panel captions). Only 4 of 21 ores have art and no clean per-ore inspection surface exists, so a partial gallery would read broken — left as reference.',
  'assets/ores/ore_iron_hero.jpg':
    'Labelled multi-panel ore contact sheet (baked panel captions) — left as reference (see ore_ice_hero reason).',
  'assets/ores/ore_luminite_hero.jpg':
    'Labelled multi-panel ore contact sheet (inconsistent layout, baked captions) — left as reference (see ore_ice_hero reason).',
  'assets/ores/ore_xenium_hero.jpg':
    'Labelled multi-panel ore contact sheet (baked panel captions) — left as reference (see ore_ice_hero reason).',
  'assets/fx/fx_explosion_small_elements.jpg':
    'Labelled FX contact sheet — runtime explosions are procedural (vfx.js glow/ring canvas textures); pasting the sheet rendered its caption text.',
  'assets/fx/fx_mining_beam.jpg':
    'Labelled FX contact sheet — the mining beam is procedural additive quads (vfx.js).',
  'assets/fx/fx_thruster_main.jpg':
    'Labelled FX contact sheet — engine trails are procedural particles (vfx.js).',
  'assets/ui/reticle.jpg':
    'Labelled reticle reference JPG (baked title/description text, no alpha) — the HUD uses the clean inline RETICLE_SVG in uiRoot.js.',
  'assets/cinematics/menu_background.jpg':
    'Labelled "MENU / INTRO BACKGROUND TREATMENT" reference still — menus, splash and boot use the clean label-free C-INTRO-01.jpg instead.',
};

const SCAN_DIRS = ['src', 'styles'];
const SCAN_EXT = /\.(m?js|css)$/;
// Match a relative assets/... path with a media extension (the leading ../ or ./ falls outside).
const ASSET_RE = /assets\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp|gif|mp4|webm|ogg|glb|gltf|ktx2|svg|json)/g;

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
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const match of code.match(ASSET_RE) || []) {
      const relFile = file.slice(ROOT.length + 1).replace(/\\/g, '/');
      addReference(match, relFile);
    }
  }
}

const thrusterManifestPath = 'assets/fx/thruster/manifest.json';
const thrusterManifest = JSON.parse(readFileSync(join(ROOT, thrusterManifestPath), 'utf8'));
const dynamicRegistries = Object.freeze({
  portraits: Object.freeze(
    [...Object.values(CANONICAL_PORTRAITS), ...Object.values(ROLE_PORTRAITS)]
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

const issues = [];
const underBundledRoot = (asset) => BUNDLED_ROOTS.some((r) => asset === r || asset.startsWith(`${r}/`));

// 1. Every referenced asset must exist on disk.
for (const [asset, files] of referenced) {
  if (!existsSync(join(ROOT, asset))) {
    issues.push(`MISSING: "${asset}" is referenced by ${files.join(', ')} but does not exist on disk.`);
  }
}

// 2. Every referenced asset must live under a bundled root (or it 404s in the shipped game).
for (const [asset, files] of referenced) {
  if (!underBundledRoot(asset)) {
    issues.push(`NOT BUNDLED: "${asset}" (referenced by ${files.join(', ')}) is outside the bundled roots [${BUNDLED_ROOTS.join(', ')}]. ` +
      `Add its directory to build-bundle.mjs + package.json build.files, or drop the reference.`);
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
  const copiedInReleasePack = releasePackSrc.includes(`'${root}'`) || (root === 'assets/ships' && releasePackSrc.includes('assets/ships/release'));
  if (!bundleSrc.includes(`'${leaf}'`) && !copiedInReleasePack) {
    issues.push(`BUNDLE DRIFT: scripts/build-bundle.mjs or releasePackaging.mjs no longer copies "${root}" — referenced assets there would 404 in the web release.`);
  }
  const globbed = pkgFiles.some((f) => f === `${root}/**` || f === `${root}/**/*` || f === root || f === 'assets/**' || f === 'assets/**/*' || f === 'build/web/**' || f === 'build/web/**/*');
  if (!globbed) {
    issues.push(`PACKAGE DRIFT: package.json build.files no longer globs "${root}" — referenced assets there would be absent from the electron package.`);
  }
}

const bundledRefs = [...referenced.keys()].filter(underBundledRoot).length;
const report = {
  pass: issues.length === 0,
  issues,
  referencedAssetCount: referenced.size,
  bundledReferenceCount: bundledRefs,
  referenceOnlyCount: Object.keys(REFERENCE_ONLY).length,
  dynamicRegistries,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else if (issues.length) {
  console.error('asset reachability FAILED:\n' + issues.map((i) => '  - ' + i).join('\n'));
} else {
  console.log(`asset reachability OK — ${referenced.size} referenced runtime assets exist and are bundled (${bundledRefs} under bundled roots); ` +
    `${Object.keys(REFERENCE_ONLY).length} authoring-only reference sheets held out of the runtime.`);
}

if (issues.length) process.exit(1);
