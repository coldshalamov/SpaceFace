import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildAssetPhysicsInventory,
  buildReleaseAssetInventory,
  loadReleaseAssetSources,
  loadAssetPhysicsSources,
  selectAssetPhysicsShipIds,
} from './lib/assetPhysicsInventory.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = parseArgs(process.argv.slice(2));
const outputPath = path.resolve(repoRoot, options.out || '.devshots/asset-physics/asset-physics-inventory.json');
let inventory;
if (options.catalog === 'release') {
  const sources = await loadReleaseAssetSources(repoRoot);
  inventory = buildReleaseAssetInventory({ ...sources, assetIds: options.ids, shard: options.shard });
  inventory.provenance = {
    inputs: sources.inputHashes,
    paths: {
      partsManifest: 'assets/ships/parts/parts_manifest.json',
      releaseManifest: 'assets/ships/release/release_manifest.json',
      modelTruthCensus: 'src/data/modelTruthCensus.json',
      packagePilots: 'assets/ships/render-packages/pilots.json',
      flightStatic: 'assets/ships/render-packages/flight-static-v3.json',
      runtimePackageCode: 'src/render/renderPackageManifest.js',
      codeInputs: {
        ships: 'src/data/ships.js',
        shipSystem: 'src/systems/ships.js',
        partsLibrary: 'src/render/partsLibrary.js',
        modelTruthReader: 'src/data/modelTruth.js',
        collisionProxyReader: 'src/data/collisionProxyManifests.js',
        physicsMaterials: 'src/data/physicsMaterials.js',
        lodTriangleReader: 'scripts/lib/partsManifestMetrics.mjs',
      },
      optionalGfxAudit: '.devshots/asset-audit/gltf-audit.json',
    },
    selection: { ids: options.ids, shard: options.shard },
  };
} else {
  const { partsManifest, releaseManifest } = await loadAssetPhysicsSources(repoRoot);
  const selectedIds = selectAssetPhysicsShipIds(options.ids, options.shard
    ? { shardIndex: options.shard.index, shardCount: options.shard.count }
    : {});
  inventory = buildAssetPhysicsInventory({ partsManifest, releaseManifest, shipIds: selectedIds });
  inventory.provenance = {
    partsManifest: 'assets/ships/parts/parts_manifest.json',
    releaseManifest: 'assets/ships/release/release_manifest.json',
    selection: {
      ids: options.ids,
      shard: options.shard ? { index: options.shard.index, count: options.shard.count } : null,
    },
  };
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
const outputSummary = options.catalog === 'ships' ? {
  output: path.relative(repoRoot, outputPath).replaceAll('\\', '/'),
  rows: inventory.rows.length,
  measuredCollisionSkin: inventory.summary.measuredCollisionSkin,
  missingWholeShipIdentity: inventory.summary.missingWholeShipIdentity,
  largestPlanarRenderCollisionDeltas: inventory.summary.largestPlanarRenderCollisionDeltas,
} : {
  output: path.relative(repoRoot, outputPath).replaceAll('\\', '/'),
  catalog: options.catalog,
  rows: inventory.rows.length,
  families: inventory.summary.families,
  byRole: inventory.summary.byRole,
  runtimePackageIndexed: inventory.summary.runtimePackageIndexed,
  runtimePackageIdentityMismatches: inventory.summary.runtimePackageIdentityMismatches.length,
  notIndexedInPartsManifest: inventory.summary.notIndexedInPartsManifest.length,
  requiredModelTruthFamiliesNotIndexed: inventory.summary.requiredModelTruthFamiliesNotIndexed.length,
  runtimePackageCandidatesNotIndexed: inventory.summary.runtimePackageCandidatesNotIndexed.length,
  runtimePackageNotIndexedNonCandidates: inventory.summary.runtimePackageNotIndexedNonCandidates.length,
  unresolvedMetadata: inventory.summary.unresolvedMetadata.length,
  canonicalShipVisualsMissingFromReleaseManifest: inventory.summary.canonicalShipVisualsMissingFromReleaseManifest.length,
};
console.log(JSON.stringify(outputSummary));

function parseArgs(args) {
  const options = { out: null, ids: null, shard: null, catalog: 'ships' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const [key, inlineValue] = arg.split('=', 2);
    const value = inlineValue ?? args[++index];
    if (key === '--out' && value) options.out = value;
    else if (key === '--catalog' && (value === 'ships' || value === 'release')) options.catalog = value;
    else if (key === '--ids' && value) {
      options.ids = [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))].sort();
      if (!options.ids.length) throw new Error('--ids requires at least one comma-separated ship ID');
    } else if (key === '--shard' && value) {
      const match = /^(\d+)\/(\d+)$/.exec(value);
      if (!match) throw new Error('--shard must be a zero-based INDEX/COUNT pair, such as 0/4');
      const indexValue = Number(match[1]);
      const count = Number(match[2]);
      if (count < 1 || indexValue >= count) throw new Error('--shard index must be less than a positive shard count');
      options.shard = { index: indexValue, count };
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return options;
}
