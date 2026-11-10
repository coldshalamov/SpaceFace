// Inventory-only collector. Read-only by default; prints deterministic JSON to stdout.
// Optional --write=<new-path> creates a new file exclusively; never overwrites one.
// Does not run reachability, render, test, or playback checks, and does not date their results.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { SECTORS } from '../../../src/data/sectors.js';
import * as ships from '../../../src/data/wholeShipVisualIdentity.js';
import * as kit from '../../../src/data/everydaySpaceKitDressing.js';
import * as wrecks from '../../../src/data/wreckAftermathDressing.js';
import { PENDING_CANONICAL_PORTRAITS } from '../../../src/data/portraits.js';
import { WORLD_SITE_MANIFESTS } from '../../../src/data/worldSiteManifests.js';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log('Usage: node catalog-evidence.mjs [--write=<new-path>]\nDefault: inventory JSON to stdout; no files written.\n--write: explicitly create a NEW inventory file, relative to current directory. Existing files are never replaced.\nNo external checks are run; this collector emits no check outcomes or observation timestamps.');
  process.exit(0);
}
if (args.length > 1 || (args.length === 1 && !/^--write=.+/.test(args[0]))) {
  throw new Error('Expected no arguments or one --write=<new-path>; use --help.');
}
const writePath = args.length ? path.resolve(args[0].slice('--write='.length)) : null;
if (writePath && fs.existsSync(writePath)) throw new Error(`Refusing to overwrite existing file: ${writePath}`);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const absolute = relative => path.join(root, relative);
const sha = relative => crypto.createHash('sha256').update(fs.readFileSync(absolute(relative))).digest('hex');
const parts = JSON.parse(fs.readFileSync(absolute('assets/ships/parts/parts_manifest.json')));
const release = JSON.parse(fs.readFileSync(absolute('assets/ships/release/release_manifest.json')));
const countBy = (rows, key) => rows.reduce((counts, row) => {
  counts[row[key]] = (counts[row[key]] || 0) + 1;
  return counts;
}, {});
const wanted = new Set([
  'kestrel.glb', 'helios_cradle.glb', 'helios_span.glb', 'yard_tug.glb',
  'repair_tender.glb', 'salvage_cutter.glb', 'rescue_lifter.glb', 'place_cold_locker.glb',
  'place_lane_beacon.glb', 'place_claim_outpost_relay.glb', 'place_landmark_candle_fleet.glb',
  'place_ceres_second_measure.glb', 'place_tally_three.glb', 'place_conveyor_barge.glb',
  'place_landmark_wreck_cathedral.glb', 'swarm_warden.glb', 'swarm_anchor.glb',
  'swarm_jackal.glb', 'pod_47a_evidence_spindle.glb', 'place_47a_rescue_capsule.glb',
]);
const selected = release.assets.filter(asset => wanted.has(asset.release.split('/').at(-1)))
  .map(asset => {
    const exists = fs.existsSync(absolute(asset.release));
    return {
      id: asset.id, file: asset.release, exists,
      declaredBytes: asset.releaseBytes,
      actualBytes: exists ? fs.statSync(absolute(asset.release)).size : null,
      declaredSha256: asset.releaseSha256,
      actualSha256: exists ? sha(asset.release) : null,
      contractNodeCount: asset.contractNodeCount,
    };
  });
const sourcePaths = [
  'assets/ships/parts/parts_manifest.json', 'assets/ships/release/release_manifest.json',
  'src/data/sectors.js', 'src/data/sectorAnchors.js', 'src/data/swarmOpeningTerrain.js',
  'src/data/worldSiteManifests.js', 'src/data/everydaySpaceKitDressing.js',
  'src/data/wreckAftermathDressing.js', 'src/data/wholeShipVisualIdentity.js',
  'src/data/portraits.js', 'src/render/partsLibrary.js', 'src/systems/world.js',
  'src/systems/swarmArena.js', 'src/render/broodPresentation.js',
];
const evidence = {
  schemaVersion: 2,
  recordType: 'inventory-only',
  collectionMethod: 'Synchronous file reads and imported data modules; deterministic for unchanged source and HEAD. No reachability or render checks are run.',
  scope: 'Non-atomic working-tree snapshot, including concurrent edits. Not a release certification or a claim about historical checks.',
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sources: sourcePaths.map(source => ({ path: source, sha256: sha(source) })),
  parts: { entries: parts.parts.length, categories: countBy(parts.parts, 'category') },
  release: {
    entries: release.assets.length, kinds: countBy(release.assets, 'kind'),
    declaredTotalBytes: release.assets.reduce((total, asset) => total + (asset.releaseBytes || 0), 0),
    missingFiles: release.assets.filter(asset => !fs.existsSync(absolute(asset.release))).map(asset => asset.release),
  },
  selectedReleaseChecks: selected,
  ships: {
    byPlayerDefinition: ships.WHOLE_SHIP_FILE_BY_DEF_ID,
    byTrafficRole: ships.WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE,
    byHostile: ships.WHOLE_SHIP_FILE_BY_HOSTILE_ID,
  },
  everydayKit: kit.EVERYDAY_SPACE_KIT_LEGAL_MODELS,
  wreckAftermath: {
    catalog: wrecks.WRECK_AFTERMATH_MODELS,
    ordinarySpawnIds: wrecks.WRECK_AFTERMATH_SPAWN_MODELS.map(row => row.id),
    skipSectors: wrecks.WRECK_AFTERMATH_SKIP_SECTORS,
  },
  firstSectors: SECTORS.filter(sector => ['sector_helios_prime', 'sector_ceres_belt', 'sector_tethys_junction'].includes(sector.id))
    .map(sector => ({ id: sector.id, enemyDensity: sector.enemyDensity, stations: sector.stations, fields: sector.fields, pois: sector.pois })),
  worldSites: WORLD_SITE_MANIFESTS.map(site => ({
    id: site.id, name: site.name, sectorId: site.sectorId, placement: site.placement,
    visualRoot: site.visualRoot, operations: site.operations, stages: site.stages,
  })),
  pendingCanonicalPortraits: Object.entries(PENDING_CANONICAL_PORTRAITS)
    .map(([id, file]) => ({ id, file, exists: fs.existsSync(absolute('assets/portraits/' + file)) })),
};
const output = JSON.stringify(evidence, null, 2) + '\n';
if (writePath) {
  fs.writeFileSync(writePath, output, { flag: 'wx' });
  console.log(`Created inventory-only snapshot: ${writePath}`);
} else {
  process.stdout.write(output);
}
