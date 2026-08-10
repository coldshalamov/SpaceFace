#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fileRecord as fileRecordForRoot,
  glbMetrics as glbMetricsForRoot,
  verifyAssetReceipt,
} from './lib/graphics-asset-receipts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PARTS_MANIFEST_PATH = 'assets/ships/parts/parts_manifest.json';
const RELEASE_MANIFEST_PATH = 'assets/ships/release/release_manifest.json';
const AUTHORING_PATH = 'assets/ships/parts/blender/authoring.json';

// Root-bound helpers so existing assertions read identically to the inline originals while the
// new coverage section reuses the shared, testable implementations from the helper module.
const fileRecord = (path) => fileRecordForRoot(ROOT, path);
const glbMetrics = (path) => glbMetricsForRoot(ROOT, path);

const partsManifest = json(PARTS_MANIFEST_PATH);
const releaseManifest = json(RELEASE_MANIFEST_PATH);
const authoring = json(AUTHORING_PATH);
const partById = new Map(partsManifest.parts.map((part) => [part.id, part]));
const releaseById = new Map(releaseManifest.assets.map((asset) => [asset.id, asset]));

const heliosProduction = json('assets/ships/m4_helios_hub/production/helios-golden-production-report.json');
const heliosPromotion = json('assets/ships/m4_helios_hub/production/promotion-report.json');
const heliosPart = required(partById.get('place_station_trade_hub'), 'place_station_trade_hub', 'parts manifest');
const heliosRelease = required(releaseById.get('place_station_trade_hub'), 'place_station_trade_hub', 'release manifest');
const heliosSourceMetrics = glbMetrics(heliosRelease.source);

assertFileReceipt(heliosProduction.outputBlend, heliosProduction.outputBlendBytes,
  heliosProduction.outputBlendSha256, 'Helios production blend');
assertFileReceipt(heliosProduction.outputGlb, heliosProduction.outputGlbBytes,
  heliosProduction.outputGlbSha256, 'Helios production GLB');
assertFileReceipt(heliosProduction.releaseGlb, heliosProduction.releaseGlbBytes,
  heliosProduction.releaseGlbSha256, 'Helios release GLB');
assertFileReceipt(heliosPromotion.candidate, heliosPromotion.candidateBytes,
  heliosPromotion.candidateSha256, 'Helios promotion candidate');
assertFileReceipt(heliosPromotion.source, heliosPromotion.sourceBytes,
  heliosPromotion.sourceSha256, 'Helios promoted source');
assertFileReceipt(heliosPromotion.release, heliosPromotion.releaseBytes,
  heliosPromotion.releaseSha256, 'Helios promoted release');
assertFileReceipt(heliosPromotion.authoringBlend, heliosPromotion.authoringBlendBytes,
  heliosPromotion.authoringBlendSha256, 'Helios promoted authoring blend');
assertReleaseManifest(heliosRelease, 'Helios release manifest');
assert.equal(heliosPart.bytes, fileRecord(heliosRelease.source).bytes, 'Helios parts-manifest bytes');
assert.equal(heliosPart.tris, heliosSourceMetrics.triangles, 'Helios parts-manifest triangles');
assert.equal(heliosPromotion.meshoptBufferViews, heliosRelease.meshoptBufferViews,
  'Helios promotion/release meshopt count');

const rockSummary = json('assets/ships/m4_helios_hub/evidence/helios_rock_a_build_summary.json');
const rockReceipt = rockSummary.receiptClosure;
const rockPart = required(partById.get('place_asteroid_rock_a'), 'place_asteroid_rock_a', 'parts manifest');
const rockRelease = required(releaseById.get('place_asteroid_rock_a'), 'place_asteroid_rock_a', 'release manifest');
assert.equal(rockReceipt.schema, 'spaceface.graphicsAssetReceiptClosure.v1');
assert.equal(rockReceipt.status, 'accepted_live');
assertFileReceipt(rockSummary.sourceGlb, rockSummary.sourceBytes, rockSummary.sourceSha256,
  'Rock A current build summary source');
assertObjectReceipt(rockReceipt.authoringBlend, 'Rock A authoring blend');
assertObjectReceipt(rockReceipt.familySource, 'Rock A family source');
assertObjectReceipt(rockReceipt.liveSource, 'Rock A live source');
assertObjectReceipt(rockReceipt.release, 'Rock A release');
assertReleaseManifest(rockRelease, 'Rock A release manifest');
assert.equal(fileRecord(rockReceipt.familySource.path).sha256, fileRecord(rockReceipt.liveSource.path).sha256,
  'Rock A family source must be byte-identical to the live source');
const rockMetrics = glbMetrics(rockReceipt.liveSource.path);
assert.equal(rockPart.bytes, fileRecord(rockReceipt.liveSource.path).bytes, 'Rock A parts-manifest bytes');
assert.equal(rockPart.tris, rockMetrics.triangles, 'Rock A parts-manifest triangles');
assert.deepEqual(rockReceipt.metrics, {
  triangles: rockMetrics.triangles,
  lod0Triangles: rockMetrics.lods.lod0,
  lod1Triangles: rockMetrics.lods.lod1,
  lod2Triangles: rockMetrics.lods.lod2,
  materials: rockMetrics.materials,
  textures: rockMetrics.textures,
}, 'Rock A closure metrics must describe the current live GLB');
assert.equal(rockSummary.totalTriangles, rockMetrics.triangles, 'Rock A top-level triangle summary');
assert.equal(rockSummary.lod0Triangles, rockMetrics.lods.lod0, 'Rock A top-level LOD0 triangle summary');
const embeddedRock = rockMetrics.gltf.asset?.extras?.spacefaceAsset || {};
assert.equal(rockReceipt.legacyEmbeddedMetadata.triangleCount,
  rockMetrics.gltf.asset?.extras?.triangleCount, 'Rock A legacy embedded triangle count must be explicit');
assert.equal(rockReceipt.legacyEmbeddedMetadata.wiringStatus,
  embeddedRock.wiringStatus, 'Rock A legacy embedded wiring status must be explicit');
assert.equal(authoring.entries.place_asteroid_rock_a.blend_path, rockReceipt.authoringBlend.path,
  'Rock A authoring registry must name the bound blend');
assert.equal(authoring.entries.place_asteroid_rock_a.promotion_pipeline,
  'scripts/promote-m4-surface-remaster.mjs', 'Rock A authoring registry must name its promoter');

const waspReport = json('assets/ships/wasp_production_v1/evidence/finalize_report.json');
const waspPart = required(partById.get('wholeship_wasp_production_v1'), 'wholeship_wasp_production_v1', 'parts manifest');
const waspRelease = required(releaseById.get('wholeship_wasp_production_v1'), 'wholeship_wasp_production_v1', 'release manifest');
assert.equal(waspReport.status, 'accepted_live');
assert.equal(waspReport.promoted, true);
assert.equal(waspReport.promotion.manifestId, waspPart.id);
assert.equal(waspReport.promotion.runtimeShipId, 'ship_wasp');
assertObjectReceipt(waspReport.promotion.authoringBlend, 'Wasp authoring blend');
for (const receipt of waspReport.promotion.sourceLods) assertObjectReceipt(receipt, `Wasp source LOD${receipt.lod}`);
for (const receipt of waspReport.promotion.releaseLods) assertObjectReceipt(receipt, `Wasp release LOD${receipt.lod}`);
for (const candidate of waspReport.lods) {
  const source = required(waspReport.promotion.sourceLods.find((item) => item.lod === candidate.lod),
    `LOD${candidate.lod}`, 'Wasp source receipts');
  assert.equal(fileRecord(candidate.path).sha256, fileRecord(source.path).sha256,
    `Wasp accepted source LOD${candidate.lod} must match the finalized candidate`);
}
assertReleaseManifest(waspRelease, 'Wasp release manifest');
assert.equal(waspPart.bytes, fileRecord(waspReport.promotion.sourceLods[0].path).bytes,
  'Wasp parts-manifest bytes');
assert.equal(waspPart.tris, glbMetrics(waspReport.promotion.sourceLods[0].path).triangles,
  'Wasp parts-manifest triangles');
const partsLibrary = text('src/render/partsLibrary.js');
assert.match(partsLibrary, /['"]?ship_wasp['"]?:\s*'wholeships\/wasp_production_v1\.glb'/,
  'Wasp runtime must select the accepted production GLB');

const rcsPart = required(partById.get('greeble_rcs'), 'greeble_rcs', 'parts manifest');
const rcsRelease = required(releaseById.get('greeble_rcs'), 'greeble_rcs', 'release manifest');
assert.equal(authoring.entries.greeble_rcs.blend_path,
  'assets/ships/parts/blender/greeble_rcs_authored.blend', 'RCS authoring registry');
assertFileReceipt(authoring.entries.greeble_rcs.blend_path, 618095,
  '63A86488ECEB5B6E415581D5D75C3489F5327EB06916EBE2661A48567C32FFA9', 'RCS authoring blend');
assertReleaseManifest(rcsRelease, 'RCS release manifest');
assert.equal(rcsPart.bytes, fileRecord(rcsRelease.source).bytes, 'RCS parts-manifest bytes');
assert.equal(rcsPart.tris, glbMetrics(rcsRelease.source).triangles, 'RCS parts-manifest triangles');
assert.doesNotMatch(rcsPart.note, /antenna/i, 'RCS note must not describe a different asset family');

const visualPlan = text('VISUAL_ASSET_PLAN.md');
assert.doesNotMatch(visualPlan, /vfx\.js loads and uses fx_thruster_main\.jpg/,
  'visual plan must not claim the reference JPG is a runtime thruster source');
assert.match(visualPlan, /assets\/fx\/thruster\/manifest\.json/,
  'visual plan must name the deterministic runtime thruster texture manifest');

// ---------------------------------------------------------------------------
// Extended coverage: verify every asset family the check claims to gate.
//
// The check stayed green for weeks while two of three asteroid rocks were corrupt because it
// inspected only rockA. This section verifies, against disk, the manifest-recorded SHA/hash and
// byte count for BOTH source and release GLBs of every asset the release manifest records, plus
// the parts-manifest bytes/tris cross-check the existing assets already enforce. Coverage is
// collected with per-asset diagnostics (not one aggregate boolean) so every drift is named.
// ---------------------------------------------------------------------------

// Resolve the live player-ship GLB from source, never from a filename guess.
// newGameDefaults.js -> shipId; partsLibrary.js -> WHOLE_SHIP_FILE_BY_DEF_ID[shipId].
const newGameDefaultsSrc = text('src/data/newGameDefaults.js');
const liveShipDefIdMatch = newGameDefaultsSrc.match(/shipId:\s*['"]([^'"]+)['"]/);
const liveShipDefId = required(liveShipDefIdMatch && liveShipDefIdMatch[1],
  'shipId', 'src/data/newGameDefaults.js');
assert.match(partsLibrary, new RegExp(`['"]${liveShipDefId}['"]\\s*:\\s*['"](wholeships/[^'"]+\\.glb)['"]`),
  'partsLibrary.js must wire the live player ship to a whole-ship GLB');
const liveShipFileMatch = partsLibrary.match(new RegExp(`['"]${liveShipDefId}['"]\\s*:\\s*['"](wholeships/[^'"]+\\.glb)['"]`));
const liveShipFile = liveShipFileMatch[1];
const livePlayerShipRelease = required(
  releaseById.get(partsManifest.parts.find((p) => p.file === liveShipFile)?.id)
    || releaseManifest.assets.find((a) => a.source.endsWith(liveShipFile)),
  `file ${liveShipFile} (resolved from ${liveShipDefId})`, 'release manifest');
const livePlayerShipPart = required(partById.get(livePlayerShipRelease.id),
  livePlayerShipRelease.id, 'parts manifest');
assert.equal(partsManifest.parts.find((p) => p.id === livePlayerShipRelease.id).file, liveShipFile,
  'live player-ship parts-manifest file must match the runtime-wired GLB');

const extendedAssetIds = [
  'place_asteroid_rock_b',
  'place_asteroid_rock_c',
  'hull_starter', 'hull_fighter', 'hull_miner', 'hull_freighter', 'hull_interceptor',
  'hull_corvette', 'hull_frigate', 'hull_capital', 'hull_multirole', 'hull_gunship',
  livePlayerShipRelease.id,
];

const extendedResults = [];
for (const id of extendedAssetIds) {
  const release = required(releaseById.get(id), id, 'release manifest');
  const part = required(partById.get(id), id, 'parts manifest');
  extendedResults.push(verifyAssetReceipt(ROOT, release, part));
}
const extendedFailures = extendedResults.flatMap((r) => r.failures);
if (extendedFailures.length) {
  console.error('Extended receipt coverage: FAIL');
  for (const f of extendedFailures) {
    console.error(`  ${f.asset} ${f.manifest} ${f.field}: expected=${f.expected} actual=${f.actual}` +
      (f.path ? ` path=${f.path}` : '') + (f.note ? ` (${f.note})` : ''));
  }
  console.error(`Extended receipt coverage: ${extendedFailures.length} drift(s) across ${extendedAssetIds.length} assets`);
  process.exit(1);
}

const extendedSummary = {};
for (const r of extendedResults) {
  const release = releaseById.get(r.id);
  extendedSummary[r.id] = {
    bytes: fileRecord(release.source).bytes,
    triangles: partById.get(r.id).tris,
    sha256: fileRecord(release.source).sha256,
  };
}

console.log('Graphics asset receipt closure: PASS');
console.log(JSON.stringify({
  helios: { bytes: heliosPart.bytes, triangles: heliosPart.tris, sha256: fileRecord(heliosRelease.source).sha256 },
  rockA: { bytes: rockPart.bytes, triangles: rockPart.tris, sha256: fileRecord(rockRelease.source).sha256 },
  wasp: { bytes: waspPart.bytes, triangles: waspPart.tris, sha256: fileRecord(waspRelease.source).sha256 },
  rcs: { bytes: rcsPart.bytes, triangles: rcsPart.tris, sha256: fileRecord(rcsRelease.source).sha256 },
  ...extendedSummary,
}, null, 2));

function json(path) {
  return JSON.parse(text(path));
}

function text(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function assertFileReceipt(path, bytes, sha256, label) {
  assertObjectReceipt({ path, bytes, sha256 }, label);
}

function assertObjectReceipt(receipt, label) {
  assert.ok(receipt && typeof receipt.path === 'string', `${label} path`);
  const actual = fileRecord(receipt.path);
  assert.equal(actual.bytes, receipt.bytes, `${label} bytes`);
  assert.equal(actual.sha256, String(receipt.sha256).toUpperCase(), `${label} sha256`);
}

function assertReleaseManifest(entry, label) {
  assertFileReceipt(entry.source, entry.sourceBytes, entry.sourceSha256, `${label} source`);
  assertFileReceipt(entry.release, entry.releaseBytes, entry.releaseSha256, `${label} release`);
}

function required(value, key, collection) {
  assert.ok(value, `${collection} must contain ${key}`);
  return value;
}
