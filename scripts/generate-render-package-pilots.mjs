#!/usr/bin/env node
// Derive the render-package pilot manifest from the release manifest.
//
// WHY THIS EXISTS
// ---------------
// Package coverage used to be a hand-maintained list in pilots.json. A curated list cannot answer
// "is every shipping asset packaged?" — it can only answer "is every asset someone remembered
// packaged?", and the two diverged: 60 of 86 release GLBs had no package and silently fell back to
// the source route, recompiling a blueprint at load. Coverage has to be derived from the same
// manifest the release pipeline writes, so a newly released asset is packaged or the gate fails.
//
// Existing entries are preserved verbatim. Only genuinely missing assets are appended, so running
// this never churns a package that is already correct.
//
//   node scripts/generate-render-package-pilots.mjs           # write missing entries
//   node scripts/generate-render-package-pilots.mjs --check    # fail if any asset is unpackaged

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readGlbJson } from './lib/renderPackageRuntimeTable.mjs';
import { derivePilotSemanticManifest } from './build-render-package-pilots.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'assets/ships/render-packages/pilots.json';
const PACKAGE_ROOT = 'assets/ships/release/render-packages';

// The authoring contract's slot vocabulary, keyed by release directory. A GLB normally declares its
// own slot in `asset.extras.spacefaceAsset.slot`; a handful predate that and the directory is the
// only other authority. Whole ships occupy the hull slot — they are complete bodies, not a slot of
// their own.
const SLOT_BY_DIR = Object.freeze({
  cockpits: 'cockpit',
  engines: 'engine',
  fins: 'fin',
  gear: 'gear',
  greebles: 'greeble',
  hulls: 'hull',
  places: 'place',
  pods: 'pod',
  weapons: 'weapon',
  wholeships: 'hull',
  works: 'place',
});

/** Package kind, as the render-package schema understands it. */
function kindForDir(dir) {
  if (dir === 'wholeships') return 'ship';
  if (dir === 'places' || dir === 'works') return 'place';
  return 'part';
}

/**
 * Package key: the stable, human-readable handle used for the output directory. Mirrors how the
 * existing entries were named — drop the authoring prefix, then hyphenate.
 */
function keyFor(file, taken) {
  const stem = basename(file, '.glb')
    .replace(/^(place|part|wholeship)_/, '')
    .replace(/^(station|gate|asteroid|landmark|claim)_/, '')
    .replace(/_/g, '-');
  let key = stem;
  let n = 1;
  while (taken.has(key)) key = `${stem}-${++n}`;
  taken.add(key);
  return key;
}

/**
 * A package needs exactly one of `rootNode` or `sceneRoot`. GLTFLoader returns a single root object
 * for a one-root scene and a wrapping Group otherwise, so the choice is a property of the file.
 */
function rootBinding(json) {
  const scene = (json.scenes || [])[json.scene ?? 0];
  const roots = (scene && scene.nodes) || [];
  if (roots.length === 1) {
    const name = (json.nodes || [])[roots[0]]?.name;
    if (name) return { rootNode: name };
  }
  return { sceneRoot: true };
}

async function main(argv) {
  const check = argv.includes('--check');
  const manifestPath = resolve(REPO_ROOT, MANIFEST);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const release = JSON.parse(await readFile(resolve(REPO_ROOT, manifest.releaseManifest), 'utf8'));
  const releaseRows = new Map((release.assets || []).map((row) => [
    String(row.release || '').replace(/\\/g, '/'),
    row,
  ]));
  const developmentOnlyReason = (row) => {
    if (row?.developmentOnly !== true) return null;
    const reason = String(row.developmentOnlyReason || '').trim();
    if (!reason) throw new Error(`${row.id || row.release}: developmentOnly rows require developmentOnlyReason.`);
    return reason;
  };

  // Drop entries that were claimed but never successfully built. Only candidates with no output
  // directory are eligible, so an already-compiled package is never removed by a validation change.
  const pruned = [];
  const surviving = [];
  for (const pilot of manifest.pilots) {
    const row = releaseRows.get(String(pilot.sourceUrl || '').replace(/\\/g, '/'));
    const devOnlyReason = developmentOnlyReason(row);
    if (devOnlyReason) {
      pruned.push(`${pilot.sourceUrl} (development-only: ${devOnlyReason})`);
      continue;
    }
    if (existsSync(resolve(REPO_ROOT, pilot.outputDir, 'render-package.json'))) {
      surviving.push(pilot);
      continue;
    }
    try {
      await derivePilotSemanticManifest(pilot, resolve(REPO_ROOT, pilot.sourceUrl));
      surviving.push(pilot);
    } catch (error) {
      pruned.push(`${pilot.sourceUrl} (${error?.message || error})`);
    }
  }
  if (pruned.length && !check) manifest.pilots = surviving;

  const packaged = new Set(manifest.pilots.map((pilot) => pilot.sourceUrl));
  const taken = new Set(manifest.pilots.map((pilot) => pilot.key));
  const added = [];
  const skipped = [];
  const invalid = [];

  for (const row of release.assets || []) {
    const url = String(row.release || '').replace(/\\/g, '/');
    if (!url.endsWith('.glb') || packaged.has(url)) continue;
    const absolute = resolve(REPO_ROOT, url);
    if (!existsSync(absolute)) {
      const devOnlyReason = developmentOnlyReason(row);
      if (devOnlyReason) skipped.push(`${url} (development-only: ${devOnlyReason})`);
      else invalid.push(`${url} (declared in the release manifest but absent on disk)`);
      continue;
    }
    const devOnlyReason = developmentOnlyReason(row);
    if (devOnlyReason) {
      skipped.push(`${url} (development-only: ${devOnlyReason})`);
      continue;
    }

    const dir = url.split('/')[4];
    const json = readGlbJson(await readFile(absolute));
    const scene = (json.scenes || [])[json.scene ?? 0];
    const sceneRoot = scene && Array.isArray(scene.nodes) && scene.nodes.length === 1
      ? (json.nodes || [])[scene.nodes[0]]
      : null;
    const asset = [
      json.asset?.extras?.spacefaceAsset,
      json.asset?.extras?.spaceface,
      scene?.extras?.spacefaceAsset,
      scene?.extras?.spaceface,
      sceneRoot?.extras?.spacefaceAsset,
      sceneRoot?.extras?.spaceface,
      json.asset?.extras,
    ].find((value) => value && typeof value === 'object') || {};
    const runtimeAssetId = asset.assetId;
    if (!runtimeAssetId) {
      const detail = 'no spacefaceAsset.assetId; cannot bind a runtime identity';
      if (devOnlyReason) skipped.push(`${url} (development-only: ${devOnlyReason})`);
      else invalid.push(`${url} (${detail})`);
      continue;
    }
    const slot = asset.slot || SLOT_BY_DIR[dir];
    if (!slot) {
      const detail = `no slot, and directory "${dir}" has no slot mapping`;
      if (devOnlyReason) skipped.push(`${url} (development-only: ${devOnlyReason})`);
      else invalid.push(`${url} (${detail})`);
      continue;
    }

    const key = keyFor(url, taken);
    const candidate = {
      key,
      assetId: `sf.render.${key}`,
      runtimeAssetId,
      kind: kindForDir(dir),
      slot,
      releaseAssetId: row.id,
      sourceUrl: url,
      releaseSha256: row.releaseSha256,
      releaseBytes: row.releaseBytes,
      ...rootBinding(json),
      dynamicNameIncludes: [],
      outputDir: `${PACKAGE_ROOT}/${key}`,
      metadataUrl: `${PACKAGE_ROOT}/${key}/render-package.json`,
    };

    // Prove the asset can actually be packaged before claiming it. Running the real semantic
    // derivation — rather than re-implementing its rules here — means an asset that violates the
    // authoring contract (duplicate node names, no mesh nodes) is reported with the contract's own
    // message and never silently enters the manifest to break the build later.
    try {
      await derivePilotSemanticManifest(candidate, absolute);
    } catch (error) {
      taken.delete(key);
      const detail = error?.message || error;
      if (devOnlyReason) skipped.push(`${url} (development-only: ${devOnlyReason})`);
      else invalid.push(`${url} (${detail})`);
      continue;
    }
    added.push(candidate);
  }

  for (const note of pruned) console.log(`prune ${note}`);
  for (const note of skipped) console.log(`skip ${note}`);

  if (check) {
    if (invalid.length) {
      console.error(`\n${invalid.length} released assets cannot enter the render-package graph:`);
      for (const note of invalid) console.error(`  ${note}`);
      console.error('\nRepair the authored release asset or mark it developmentOnly with a reason in the canonical release builder.');
      return 1;
    }
    if (added.length) {
      console.error(`\n${added.length} release assets have no render package:`);
      for (const pilot of added) console.error(`  ${pilot.sourceUrl}`);
      console.error('\nRun: node scripts/generate-render-package-pilots.mjs');
      return 1;
    }
    const developmentOnlyCount = (release.assets || []).filter((row) => row.developmentOnly === true).length;
    console.log(
      `render-package coverage: all ${manifest.pilots.length} production release assets packaged; `
      + `${developmentOnlyCount} development-only release assets explicitly excluded`,
    );
    return 0;
  }

  if (invalid.length) {
    console.error(`\n${invalid.length} released assets cannot enter the render-package graph:`);
    for (const note of invalid) console.error(`  ${note}`);
    console.error('\nRepair the authored release asset or mark it developmentOnly with a reason in the canonical release builder.');
    return 1;
  }
  if (!added.length && !pruned.length) {
    console.log(`render-package coverage: already complete (${manifest.pilots.length} pilots)`);
    return 0;
  }
  manifest.pilots = [...manifest.pilots, ...added];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nadded ${added.length} pilots (${manifest.pilots.length} total)`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
