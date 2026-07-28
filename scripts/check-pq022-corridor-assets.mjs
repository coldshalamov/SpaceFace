#!/usr/bin/env node
// PQ-022.gold-corridor-required-assets — the milestone's standing gate.
//
// Walks the required-asset set in scripts/lib/pq022CorridorAssetSet.mjs and, for every asset a
// player meets on the three careers' Helios -> Ceres -> Tethys routes, proves:
//
//   1. a source manifest row exists          (assets/ships/parts/parts_manifest.json)
//   2. a release manifest row exists         (assets/ships/release/release_manifest.json)
//   3. both artifacts exist on disk
//   4. the hashes BIND — sha256 recomputed from the bytes on disk equals the manifest row
//   5. the third hash authority agrees      (src/data/worldSiteAssetBindings.js, 4 place ids)
//   6. the machine-derivable membership still re-derives from live data, in BOTH directions
//
// (6) is what makes this a standing gate rather than a snapshot: if someone adds a POI to Ceres or
// edits the part-library contract, the required set is stale and this fails until it is updated.
//
// EXPECTED GAPS. The corridor has real, named, owned gaps today. `--expected-gaps=<file>` accepts an
// allowlist so the gate can be green-with-named-gaps until completion. The allowlist is deliberately
// strict in three ways, or it becomes a graveyard:
//   * entries are exact (assetId + gap kind). No wildcards.
//   * a gap that is NOT allowlisted fails.
//   * an allowlisted gap that no longer reproduces ALSO fails, telling you to delete the entry.
//
// Headless and read-only. No browser, no GPU, no Electron, no asset mutation.
//
// Usage:
//   node scripts/check-pq022-corridor-assets.mjs
//   node scripts/check-pq022-corridor-assets.mjs --expected-gaps=design/program/roadmap/receipts/pq022-corridor-expected-gaps.json
//   node scripts/check-pq022-corridor-assets.mjs --json

import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

import {
  CORRIDOR_ASSET_SET, CORRIDOR_SECTOR_IDS, CORRIDOR_CAREER_IDS,
  derivePlaceAssets, deriveModularSlots, machineDerivedAssetIds,
  MODULAR_TRANSCRIPTION, EXCLUDED_WITH_REASON,
} from './lib/pq022CorridorAssetSet.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const GAP_KINDS = Object.freeze([
  'source-manifest-row-missing',
  'release-manifest-row-missing',
  'source-artifact-missing',
  'release-artifact-missing',
  'source-hash-mismatch',
  'release-hash-mismatch',
  'source-bytes-mismatch',
  'binding-hash-mismatch',
  'derivation-drift',
]);

const argv = process.argv.slice(2);
const jsonOut = argv.includes('--json');
const expectedGapsArg = argv.find((a) => a.startsWith('--expected-gaps='));
const expectedGapsPath = expectedGapsArg ? expectedGapsArg.slice('--expected-gaps='.length) : null;

const gaps = [];
const addGap = (assetId, gap, detail) => {
  if (!GAP_KINDS.includes(gap)) throw new Error(`unknown gap kind: ${gap}`);
  gaps.push({ assetId, gap, detail });
};

// --------------------------------------------------------------------------------------------
// Manifests — the identity authority. This gate reads them; it never writes them.
// --------------------------------------------------------------------------------------------

const partsManifest = JSON.parse(readFileSync(join(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'));
const releaseManifest = JSON.parse(readFileSync(join(ROOT, 'assets/ships/release/release_manifest.json'), 'utf8'));
const sourceById = new Map(partsManifest.parts.map((p) => [p.id, p]));
const releaseById = new Map(releaseManifest.assets.map((a) => [a.id, a]));

const hashCache = new Map();
function fileFacts(relPath) {
  if (hashCache.has(relPath)) return hashCache.get(relPath);
  const abs = join(ROOT, relPath);
  let facts;
  if (!existsSync(abs)) {
    facts = { exists: false, bytes: 0, sha256: null };
  } else {
    const buf = readFileSync(abs);
    facts = {
      exists: true,
      bytes: statSync(abs).size,
      sha256: createHash('sha256').update(buf).digest('hex'),
    };
  }
  hashCache.set(relPath, facts);
  return facts;
}

/**
 * Manifest id for a required asset. Whole-ship bodies are catalogued with a `wholeship_` prefix;
 * every other family uses the bare asset id.
 */
function manifestIdFor(entry) {
  return entry.family.startsWith('wholeship-') ? `wholeship_${entry.assetId}` : entry.assetId;
}

// --------------------------------------------------------------------------------------------
// Per-asset reconciliation.
// --------------------------------------------------------------------------------------------

const reconciled = [];

for (const entry of CORRIDOR_ASSET_SET) {
  const manifestId = manifestIdFor(entry);
  const sourceRow = sourceById.get(manifestId) || null;
  const releaseRow = releaseById.get(manifestId) || null;
  const record = {
    assetId: entry.assetId,
    manifestId,
    family: entry.family,
    horizon: entry.horizon,
    status: entry.status,
    ownerLane: entry.ownerLane,
    sourceRow: !!sourceRow,
    releaseRow: !!releaseRow,
    sourceArtifact: false,
    releaseArtifact: false,
    hashesBind: false,
  };

  if (!sourceRow) addGap(entry.assetId, 'source-manifest-row-missing', `no row '${manifestId}' in parts_manifest.json`);
  if (!releaseRow) addGap(entry.assetId, 'release-manifest-row-missing', `no row '${manifestId}' in release_manifest.json`);

  // The release manifest row carries the authoritative source AND release paths plus both hashes.
  if (releaseRow) {
    const src = fileFacts(releaseRow.source);
    const rel = fileFacts(releaseRow.release);
    record.sourceArtifact = src.exists;
    record.releaseArtifact = rel.exists;

    if (!src.exists) addGap(entry.assetId, 'source-artifact-missing', releaseRow.source);
    if (!rel.exists) addGap(entry.assetId, 'release-artifact-missing', releaseRow.release);

    let bind = true;
    if (src.exists && src.sha256 !== String(releaseRow.sourceSha256 || '').toLowerCase()) {
      bind = false;
      addGap(entry.assetId, 'source-hash-mismatch',
        `${releaseRow.source}: on-disk ${src.sha256} != manifest ${releaseRow.sourceSha256}`);
    }
    if (rel.exists && rel.sha256 !== String(releaseRow.releaseSha256 || '').toLowerCase()) {
      bind = false;
      addGap(entry.assetId, 'release-hash-mismatch',
        `${releaseRow.release}: on-disk ${rel.sha256} != manifest ${releaseRow.releaseSha256}`);
    }
    record.hashesBind = bind && src.exists && rel.exists;

    // The source manifest carries an independent byte count for the same artifact. Cross it.
    if (sourceRow && src.exists && Number.isFinite(sourceRow.bytes) && sourceRow.bytes !== src.bytes) {
      addGap(entry.assetId, 'source-bytes-mismatch',
        `${releaseRow.source}: on-disk ${src.bytes} != parts_manifest ${sourceRow.bytes}`);
    }
  }

  reconciled.push(record);
}

// --------------------------------------------------------------------------------------------
// Third hash authority: worldSiteAssetBindings.js duplicates source/release hashes for four place
// ids. A drift between the duplicated copies is invisible until it isn't.
// --------------------------------------------------------------------------------------------

const { WORLD_SITE_ASSET_BINDINGS } = await import('../src/data/worldSiteAssetBindings.js');
for (const [placeId, binding] of Object.entries(WORLD_SITE_ASSET_BINDINGS)) {
  const releaseRow = releaseById.get(placeId);
  if (!releaseRow) continue;
  if (binding.source.sha256.toLowerCase() !== String(releaseRow.sourceSha256).toLowerCase()) {
    addGap(placeId, 'binding-hash-mismatch',
      `worldSiteAssetBindings source ${binding.source.sha256} != release_manifest ${releaseRow.sourceSha256}`);
  }
  if (binding.release.sha256.toLowerCase() !== String(releaseRow.releaseSha256).toLowerCase()) {
    addGap(placeId, 'binding-hash-mismatch',
      `worldSiteAssetBindings release ${binding.release.sha256} != release_manifest ${releaseRow.releaseSha256}`);
  }
}

// --------------------------------------------------------------------------------------------
// Live re-derivation. Both directions. This is what keeps the set from rotting.
// --------------------------------------------------------------------------------------------

const [sectorAnchors, sectors, mining, claimable, heist, worldSites, partsLibrary] = await Promise.all([
  import('../src/data/sectorAnchors.js'),
  import('../src/data/sectors.js'),
  import('../src/data/mining.js'),
  import('../src/data/claimableBodies.js'),
  import('../src/data/heistFacilities.js'),
  import('../src/data/worldSiteManifests.js'),
  import('../src/render/partsLibrary.js'),
]);

const derivedPlaces = derivePlaceAssets({
  SECTOR_ANCHORS: sectorAnchors.SECTOR_ANCHORS,
  SECTORS: sectors.SECTORS,
  ASTEROIDS: mining.ASTEROIDS,
  CLAIMABLE_BODY_SITES: claimable.CLAIMABLE_BODY_SITES,
  PQ019_FACILITIES: heist.PQ019_FACILITIES,
  PQ019_CAPSULE: heist.PQ019_CAPSULE,
  WORLD_SITE_MANIFESTS: worldSites.WORLD_SITE_MANIFESTS,
  WORLD_SITE_ASSET_BINDINGS,
});

const derivedIds = [...derivedPlaces.keys()].sort();
const staticMachineIds = machineDerivedAssetIds().sort();
for (const id of derivedIds) {
  if (!staticMachineIds.includes(id)) {
    addGap(id, 'derivation-drift', 'live data routes this asset on the corridor but the required set omits it');
  }
}
for (const id of staticMachineIds) {
  if (!derivedIds.includes(id)) {
    addGap(id, 'derivation-drift', 'the required set claims this asset but live data no longer routes it on the corridor');
  }
}

const derivedModular = deriveModularSlots(partsLibrary.PART_LIBRARY_CONTRACT);
if (JSON.stringify(derivedModular.hulls) !== JSON.stringify([...MODULAR_TRANSCRIPTION.hulls])) {
  addGap('modular-hull-slot', 'derivation-drift',
    `contract hull slot ${JSON.stringify(derivedModular.hulls)} != transcription ${JSON.stringify([...MODULAR_TRANSCRIPTION.hulls])}`);
}
for (const [slot, ids] of Object.entries(MODULAR_TRANSCRIPTION.slots)) {
  if (JSON.stringify(derivedModular.slots[slot]) !== JSON.stringify([...ids])) {
    addGap(`modular-${slot}-slot`, 'derivation-drift',
      `contract ${slot} slot ${JSON.stringify(derivedModular.slots[slot])} != transcription ${JSON.stringify([...ids])}`);
  }
}

// --------------------------------------------------------------------------------------------
// Expected-gaps allowlist.
// --------------------------------------------------------------------------------------------

let allowlist = [];
if (expectedGapsPath) {
  const abs = resolve(ROOT, expectedGapsPath);
  if (!existsSync(abs)) {
    console.error(`[pq022] --expected-gaps file not found: ${expectedGapsPath}`);
    process.exit(2);
  }
  const parsed = JSON.parse(readFileSync(abs, 'utf8'));
  allowlist = Array.isArray(parsed.gaps) ? parsed.gaps : [];
  for (const item of allowlist) {
    if (!item.assetId || !item.gap) {
      console.error(`[pq022] allowlist entry needs exact assetId and gap: ${JSON.stringify(item)}`);
      process.exit(2);
    }
    if (String(item.assetId).includes('*') || String(item.gap).includes('*')) {
      console.error(`[pq022] allowlist wildcards are not permitted: ${JSON.stringify(item)}`);
      process.exit(2);
    }
    if (!GAP_KINDS.includes(item.gap)) {
      console.error(`[pq022] allowlist entry names an unknown gap kind '${item.gap}'`);
      process.exit(2);
    }
  }
}

const key = (g) => `${g.assetId}::${g.gap}`;
const observed = new Set(gaps.map(key));
const allowed = new Set(allowlist.map(key));

const unexpected = gaps.filter((g) => !allowed.has(key(g)));
const stale = allowlist.filter((a) => !observed.has(key(a)));

// --------------------------------------------------------------------------------------------
// Report.
// --------------------------------------------------------------------------------------------

const summary = {
  schema: 'spaceface.pq022.corridorAssetGate.v1',
  careers: CORRIDOR_CAREER_IDS,
  sectors: CORRIDOR_SECTOR_IDS,
  requiredAssetCount: CORRIDOR_ASSET_SET.length,
  excludedCount: EXCLUDED_WITH_REASON.length,
  derivedPlaceCount: derivedIds.length,
  gapCount: gaps.length,
  unexpectedGapCount: unexpected.length,
  staleAllowlistCount: stale.length,
  ok: unexpected.length === 0 && stale.length === 0,
};

if (jsonOut) {
  console.log(JSON.stringify({ summary, gaps, unexpected, stale, reconciled }, null, 2));
} else {
  console.log(`[pq022] Gold Corridor required-asset gate`);
  console.log(`        careers  : ${CORRIDOR_CAREER_IDS.join(', ')}`);
  console.log(`        sectors  : ${CORRIDOR_SECTOR_IDS.join(', ')}`);
  console.log(`        required : ${CORRIDOR_ASSET_SET.length} assets (${derivedIds.length} machine-derived places, ${EXCLUDED_WITH_REASON.length} recorded exclusions)`);

  const byFamily = new Map();
  for (const r of reconciled) byFamily.set(r.family, (byFamily.get(r.family) || 0) + 1);
  console.log(`        families : ${[...byFamily].sort().map(([f, n]) => `${f}=${n}`).join(' ')}`);

  const clean = reconciled.filter((r) => r.sourceRow && r.releaseRow && r.hashesBind).length;
  console.log(`        binding  : ${clean}/${reconciled.length} assets have source row + release row + on-disk hashes that bind`);
  console.log('');

  if (gaps.length === 0) {
    console.log('[pq022] no gaps.');
  } else {
    console.log(`[pq022] ${gaps.length} gap(s):`);
    const grouped = new Map();
    for (const g of gaps) {
      if (!grouped.has(g.gap)) grouped.set(g.gap, []);
      grouped.get(g.gap).push(g);
    }
    for (const [kind, list] of [...grouped].sort()) {
      console.log(`  ${kind} (${list.length}):`);
      for (const g of list) {
        const mark = allowed.has(key(g)) ? 'allowed' : 'UNEXPECTED';
        console.log(`    [${mark}] ${g.assetId} — ${g.detail}`);
      }
    }
  }

  if (stale.length) {
    console.log('');
    console.log(`[pq022] ${stale.length} STALE allowlist entr(ies) — the gap no longer reproduces, remove them:`);
    for (const s of stale) console.log(`    ${s.assetId} :: ${s.gap}`);
  }

  console.log('');
  console.log(summary.ok
    ? `[pq022] PASS — ${gaps.length} gap(s), all named in the allowlist, none stale.`
    : `[pq022] FAIL — ${unexpected.length} unexpected gap(s), ${stale.length} stale allowlist entr(ies).`);
}

process.exit(summary.ok ? 0 : 1);
