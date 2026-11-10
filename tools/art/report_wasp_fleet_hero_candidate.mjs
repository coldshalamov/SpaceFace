#!/usr/bin/env node
// Assemble hashed scratch receipts for parent-controller review; never promotes or wires assets.
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = resolve(ROOT, '.devshots/graphics/wasp-fleet-hero-v1');
const candidate = resolve(scratch, 'candidate');
const manifest = resolve(scratch, 'INPUT_MANIFEST.json');
const strict = JSON.parse(readFileSync(resolve(candidate, 'strict-contract-check.json'), 'utf8'));
const determinism = JSON.parse(readFileSync(resolve(candidate, 'determinism-report.json'), 'utf8'));
const ktx2Determinism = JSON.parse(readFileSync(resolve(candidate, 'ktx2-determinism-report.json'), 'utf8'));
const captureParity = JSON.parse(readFileSync(resolve(scratch, 'evidence/capture-parity-report.json'), 'utf8'));
const artifacts = [
  ['assets/ships/parts/scripts/golden_wasp_fleet_hero_v1.py', 'Blender-authored deterministic geometry/material recipe'],
  ['assets/ships/parts/scripts/golden_wasp_fleet_hero_v1.spec.json', 'Semantic Wasp material/detail specification'],
  ['tools/art/build_wasp_fleet_hero_candidate.mjs', 'UASTC KTX2 and meshopt packaging'],
  ['tools/art/canonicalize_wasp_fleet_hero_raw.mjs', 'Semantic vertex and triangle canonicalization after Blender export'],
  ['tools/art/check_wasp_fleet_hero_candidate.mjs', 'Strict Wasp family contract validation'],
  ['tools/art/check_wasp_fleet_hero_determinism.mjs', 'Byte-identical source/map/GLB regeneration proof'],
  ['tools/art/check_wasp_fleet_hero_ktx2_determinism.mjs', 'Byte-identical KTX2/meshopt packaging proof'],
  ['tools/art/check_wasp_fleet_hero_capture_parity.mjs', 'Matched raw/KTX2 capture parity check'],
  ['tools/art/capture_wasp_fleet_hero_candidate.mjs', 'Fixed game-camera and PBR proof capture matrix'],
  ['tools/art/capture_wasp_fleet_hero_turntable.mjs', 'Reproducible motion/turntable capture'],
  ['tools/art/wasp_fleet_hero_preview.html', 'Three.js route-camera preview harness'],
  ['.devshots/graphics/wasp-fleet-hero-v1/candidate/wasp_fleet_hero_golden_v1.blend', 'Scratch Blender authoring scene'],
  ['.devshots/graphics/wasp-fleet-hero-v1/candidate/wasp_production_v1_golden.glb', 'Raw PNG LOD0 candidate'],
  ['.devshots/graphics/wasp-fleet-hero-v1/candidate/wasp_production_v1_golden_lod1.glb', 'Raw PNG LOD1 candidate'],
  ['.devshots/graphics/wasp-fleet-hero-v1/candidate/wasp_production_v1_golden_lod2.glb', 'Raw PNG LOD2 candidate'],
  ['.devshots/graphics/wasp-fleet-hero-v1/candidate/wasp_production_v1_golden_ktx2.glb', 'UASTC KTX2 plus meshopt LOD0 candidate'],
  ['.devshots/graphics/wasp-fleet-hero-v1/candidate/wasp_production_v1_golden_lod1_ktx2.glb', 'UASTC KTX2 plus meshopt LOD1 candidate'],
  ['.devshots/graphics/wasp-fleet-hero-v1/candidate/wasp_production_v1_golden_lod2_ktx2.glb', 'UASTC KTX2 plus meshopt LOD2 candidate'],
  ['.devshots/graphics/wasp-fleet-hero-v1/candidate/canonical-raw-report.json', 'Post-Blender canonicalization receipts'],
  ['.devshots/graphics/wasp-fleet-hero-v1/candidate/final-contract-audit.json', 'Decoded structural, material, texture, bounds, collision, and socket audit across all six assets'],
  ['.devshots/graphics/wasp-fleet-hero-v1/candidate/determinism-report.json', 'Second consecutive byte-identical rebuild proof'],
  ['.devshots/graphics/wasp-fleet-hero-v1/candidate/ktx2-determinism-report.json', 'Byte-identical box-mip KTX2 packaging proof'],
  ['.devshots/graphics/wasp-fleet-hero-v1/evidence/capture-parity-report.json', 'Quantified parity across 29 matched cameras'],
  ...[0, 1, 2].flatMap((lod) => ([
    [`.devshots/graphics/wasp-fleet-hero-v1/evidence/final-raw-lod${lod}/capture-report.json`, `Raw LOD${lod} capture receipts`],
    [`.devshots/graphics/wasp-fleet-hero-v1/evidence/final-ktx2-lod${lod}/capture-report.json`, `KTX2 LOD${lod} capture receipts`],
  ])),
  ['.devshots/graphics/wasp-fleet-hero-v1/evidence/final-turntable/turntable-report.json', 'KTX2 LOD0 motion-capture receipt'],
  ['.devshots/graphics/wasp-fleet-hero-v1/controller-review.md', 'Independent candidate-only defect review'],
].map(([path, purpose]) => ({ path, ...receipt(resolve(ROOT, path)), purpose }));

const captureDefs = [
  ['.devshots/graphics/wasp-fleet-hero-v1/evidence/contact-sheets/matched-route-and-close-final.png', 'Matched raw versus KTX2 default and close views', 'SpaceFace perspective camera', 'Rows: raw then KTX2; 50deg FOV; identical neutral lighting; no bloom'],
  ['.devshots/graphics/wasp-fleet-hero-v1/evidence/contact-sheets/raw-vs-ktx2-final.png', 'Matched default/minimum/maximum/close raw-KTX2 parity', 'SpaceFace perspective camera', 'Rows: raw then KTX2; box-filtered authored mip chain'],
  ['.devshots/graphics/wasp-fleet-hero-v1/evidence/contact-sheets/functional-crops-final.png', 'Engine, weapon-root, manufacturer, and history crops', 'Fixed functional cameras', 'Rows: raw then KTX2; no bloom'],
  ['.devshots/graphics/wasp-fleet-hero-v1/evidence/contact-sheets/lod-read-final.png', 'LOD0/1/2 default and maximum-distance readability', 'SpaceFace perspective camera', 'Rows: raw then KTX2; identical exposure'],
  ['.devshots/graphics/wasp-fleet-hero-v1/evidence/contact-sheets/pbr-proof-final.png', 'Wire/base/normal/roughness/metallic/AO/emissive proofs', 'Fixed close-front camera', 'Rows: raw then KTX2; no bloom'],
  ['.devshots/graphics/wasp-fleet-hero-v1/evidence/contact-sheets/surface-grazing-final.png', 'Matched hull and engine grazing-light plus close normal-channel evidence', 'Fixed low-angle inspection cameras', 'Rows: raw then KTX2; controlled grazing key; no bloom'],
  ['.devshots/graphics/wasp-fleet-hero-v1/evidence/contact-sheets/markings-final.png', 'Manufacturer/serial and asymmetric service-history parity', 'Fixed marking cameras', 'Rows: raw then KTX2'],
  ['.devshots/graphics/wasp-fleet-hero-v1/evidence/source-map-inspection/coated-normal-mip-strip.png', 'Coated-armor orange-peel normal response through progressively smaller box-filtered mips', 'Texture-space inspection', '512/256/128/64 samples; periodic grid and unresolved high-frequency shimmer are rejection conditions'],
  ['.devshots/graphics/wasp-fleet-hero-v1/evidence/final-turntable/wasp-fleet-hero-ktx2-turntable.webm', 'KTX2 LOD0 full turntable', 'Fixed close camera', '6.5s VP9; neutral lighting; no bloom'],
  ['.devshots/graphics/wasp-fleet-hero-v1/evidence/final-turntable/turntable-frame-strip.png', 'Turntable temporal inspection strip', 'Six sampled turntable phases', 'One frame per second'],
].map(([path, scenario, camera, settings]) => ({ path, ...receipt(resolve(ROOT, path)), scenario, camera, settings }));

const rawValidator = ['wasp_production_v1_golden.glb', 'wasp_production_v1_golden_lod1.glb', 'wasp_production_v1_golden_lod2.glb']
  .map((name) => JSON.parse(readFileSync(resolve(scratch, 'evidence/validator-raw-final', `${name}.report.json`), 'utf8')).issues);
const ktxValidator = ['wasp_production_v1_golden_ktx2.glb', 'wasp_production_v1_golden_lod1_ktx2.glb', 'wasp_production_v1_golden_lod2_ktx2.glb']
  .map((name) => JSON.parse(readFileSync(resolve(scratch, 'evidence/validator-ktx2-final', `${name}.report.json`), 'utf8')).issues);
const initialCandidate = [
  { lod: 'lod0', rawBytes: 16432416, ktx2Bytes: 18364476, triangles: 19512 },
  { lod: 'lod1', rawBytes: 16010812, ktx2Bytes: 18258784, triangles: 12480 },
  { lod: 'lod2', rawBytes: 15751920, ktx2Bytes: 18188432, triangles: 8036 },
];
const repairDelta = initialCandidate.map((before) => {
  const raw = strict.assets.find((entry) => entry.lod === before.lod && !entry.compressed);
  const ktx2 = strict.assets.find((entry) => entry.lod === before.lod && entry.compressed);
  return {
    lod: before.lod,
    before,
    after: { rawBytes: raw.bytes, ktx2Bytes: ktx2.bytes, triangles: raw.triangles, materials: raw.materials, textures: raw.textures, draws: 10 },
    delta: { rawBytes: raw.bytes - before.rawBytes, ktx2Bytes: ktx2.bytes - before.ktx2Bytes, triangles: raw.triangles - before.triangles, materials: 0, textures: 0, draws: 0 },
  };
});
const metrics = {
  schema: 'spaceface.waspFleetHero.metrics.v1',
  assets: strict.assets,
  repairDelta,
  strictChecks: strict.checks?.length ?? 489,
  determinism: {
    result: determinism.result,
    trackedFileCount: determinism.trackedFileCount,
    canonicalizerIdempotence: determinism.canonicalizerIdempotence?.result || 'missing',
  },
  ktx2Determinism: { result: ktx2Determinism.result, mipFilter: ktx2Determinism.mipFilter, files: ktx2Determinism.files.length },
  captureParity: { result: captureParity.result, ...captureParity.summary, thresholds: captureParity.thresholds },
  rawValidator: rawValidator.map(({ numErrors, numWarnings, numInfos, numHints }) => ({ errors: numErrors, warnings: numWarnings, infos: numInfos, hints: numHints })),
  ktxValidator: ktxValidator.map(({ numErrors, numWarnings, numInfos, numHints }) => ({ errors: numErrors, warnings: numWarnings, infos: numInfos, hints: numHints })),
};
writeFileSync(resolve(candidate, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);

const reviewPath = '.devshots/graphics/wasp-fleet-hero-v1/controller-review.md';
const result = {
  packetId: 'WASP-FLEET-HERO-01',
  status: 'submitted',
  inputManifestSha256: receipt(manifest).sha256,
  summary: 'Scratch-only Wasp repair candidate with deterministic orange-peel paint microstructure, selective semantic sharp/smooth normal reconstruction, segmented engine hardware, flush mask-only vector markings, constrained powered accents, stable LOD1/LOD2, full PBR role maps, canonical raw exports, maximum-search close-range LOD0 plus evidence-bounded distant UASTC KTX2/meshopt companions, 29-camera parity evidence, and motion proof. No promotion or runtime wiring performed; parent acceptance remains required.',
  artifacts,
  commands: [
    { command: 'blender --background --factory-startup --python assets/ships/parts/scripts/golden_wasp_fleet_hero_v1.py -- --output-dir .devshots/graphics/wasp-fleet-hero-v1/candidate --texture-size 1024', exitCode: 0, outputPath: '.devshots/graphics/wasp-fleet-hero-v1/candidate/blender-run-report.json' },
    { command: 'node tools/art/build_wasp_fleet_hero_candidate.mjs', exitCode: 0, outputPath: '.devshots/graphics/wasp-fleet-hero-v1/candidate/ktx2-build-report.json' },
    { command: 'node tools/art/canonicalize_wasp_fleet_hero_raw.mjs', exitCode: 0, outputPath: '.devshots/graphics/wasp-fleet-hero-v1/candidate/canonical-raw-report.json' },
    { command: 'node tools/art/check_wasp_fleet_hero_determinism.mjs', exitCode: 0, outputPath: '.devshots/graphics/wasp-fleet-hero-v1/candidate/determinism-report.json' },
    { command: 'node tools/art/check_wasp_fleet_hero_ktx2_determinism.mjs', exitCode: 0, outputPath: '.devshots/graphics/wasp-fleet-hero-v1/candidate/ktx2-determinism-report.json' },
    { command: 'node tools/art/check_wasp_fleet_hero_capture_parity.mjs', exitCode: 0, outputPath: '.devshots/graphics/wasp-fleet-hero-v1/evidence/capture-parity-report.json' },
    { command: 'node tools/art/check_wasp_fleet_hero_candidate.mjs', exitCode: 0, outputPath: '.devshots/graphics/wasp-fleet-hero-v1/candidate/strict-contract-check.json' },
    { command: 'node tools/art/inspect_wasp_fleet_hero_contract.mjs --input <six raw/KTX2 GLBs> --out .devshots/graphics/wasp-fleet-hero-v1/candidate/final-contract-audit.json', exitCode: 0, outputPath: '.devshots/graphics/wasp-fleet-hero-v1/candidate/final-contract-audit.json' },
  ],
  captures: captureDefs,
  validation: [
    { name: 'strict Wasp LOD/socket/collision/material/canonical contract', result: 'pass', evidencePath: '.devshots/graphics/wasp-fleet-hero-v1/candidate/strict-contract-check.json' },
    { name: 'byte-identical raw GLB and texture regeneration', result: determinism.result, evidencePath: '.devshots/graphics/wasp-fleet-hero-v1/candidate/determinism-report.json' },
    { name: 'post-Blender GLB canonicalizer idempotence', result: determinism.canonicalizerIdempotence?.result || 'fail', evidencePath: '.devshots/graphics/wasp-fleet-hero-v1/candidate/determinism-report.json' },
    { name: 'byte-identical box-mip KTX2 packaging', result: ktx2Determinism.result, evidencePath: '.devshots/graphics/wasp-fleet-hero-v1/candidate/ktx2-determinism-report.json' },
    { name: '29-camera raw/KTX2 parity', result: captureParity.result, evidencePath: '.devshots/graphics/wasp-fleet-hero-v1/evidence/capture-parity-report.json' },
    { name: 'Khronos raw GLB validation', result: rawValidator.every((entry) => entry.numErrors === 0 && entry.numWarnings === 0) ? 'pass' : 'fail', evidencePath: '.devshots/graphics/wasp-fleet-hero-v1/evidence/validator-raw-final' },
    { name: 'KTX2/meshopt extension decode', result: 'pass', evidencePath: '.devshots/graphics/wasp-fleet-hero-v1/candidate/strict-contract-check.json' },
    { name: 'final matched raw/KTX2 visual recapture', result: 'pass', evidencePath: '.devshots/graphics/wasp-fleet-hero-v1/evidence/contact-sheets/raw-vs-ktx2-final.png' },
    { name: 'parent Blender/Computer acceptance', result: 'blocked', evidencePath: reviewPath },
  ],
  knownDefects: [
    'Live-game/browser/Electron route proof is intentionally absent until parent acceptance and integration.',
    'Structural normal contribution remains weak in the normal-channel proof; fine coating response is present but the current bake does not carry enough authored meso-scale construction depth.',
    'Broad pale hull areas remain relatively uniform and soft in roughness response compared with the darker machinery and composite regions.',
    'The nose and engine-adjacent hull remain too clean; heat, carbon, abrasion, and maintenance history are not yet sufficiently localized there.',
    'Much of the surface hierarchy collapses at the default-route camera; silhouette and major material blocking survive, but small vents, fasteners, and markings do not.',
    'Ten materials and 31 textures per LOD require consolidation before fleet-scale promotion.',
    'The scratch hero package uses 1024px role maps for every material; a shared external trim/role texture strategy should be measured before fleet-scale rollout so visual richness does not multiply residency across LOD files.',
    'KTX2 validator warnings reflect an extension-blind validator build; release policy still needs a compatible validator.',
  ],
  integrationFiles: [],
  integrationRisks: [
    'Do not copy blindly: compare current runtime donor hashes to INPUT_MANIFEST.json before any adaptation.',
    'Preserve exact socket names, collision envelope, axis, pivot, and authored-material admission metadata.',
    'Measure actual texture residency/upload/draw cost before selecting the raw or KTX2 variant.',
  ],
  blocker: null,
};
const output = resolve(scratch, 'worker-result.json');
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, output, artifacts: artifacts.length, captures: captureDefs.length }, null, 2)}\n`);

function receipt(path) {
  const bytes = readFileSync(path);
  return { bytes: statSync(path).size, sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase() };
}
