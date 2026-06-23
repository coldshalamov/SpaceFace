import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SG04_RELEASE_ASSET_CONTRACT,
  validateReleaseAssetPairs,
  validateReleaseAssetSet,
} from '../src/contracts/assetReleaseValidation.js';
import { PART_LIBRARY_CONTRACT } from '../src/render/partsLibrary.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const PACKAGE_JSON = resolve(ROOT, 'package.json');
const SCENARIO_47A = resolve(ROOT, 'src/data/scenarios/47a.scenario.json');
const releaseMode = process.argv.includes('--release');
const BUNDLE_PREFIX = 'build/web/';

const partManifest = JSON.parse(readFileSync(PART_MANIFEST, 'utf8'));
const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
const scenario47a = JSON.parse(readFileSync(SCENARIO_47A, 'utf8'));
const releaseManifest = existsSync(RELEASE_MANIFEST)
  ? JSON.parse(readFileSync(RELEASE_MANIFEST, 'utf8'))
  : null;
const devAssetPaths = [
  'assets/ships/kestrel/kestrel_reference.glb',
  ...(partManifest.parts || []).map((part) => `assets/ships/parts/${part.file}`),
];
const releaseAssetPaths = [
  'assets/ships/release/kestrel/kestrel_reference.glb',
  ...(partManifest.parts || []).map((part) => `assets/ships/release/parts/${part.file}`),
];
const assetPairs = devAssetPaths.map((source, index) => ({
  source,
  release: releaseAssetPaths[index],
}));

const SCENARIO_47A_ASSET_COVERAGE = Object.freeze({
  ship_kestrel: {
    status: 'authored-glb',
    kind: 'ship',
    devEvidence: [
      'assets/ships/kestrel/kestrel_reference.glb',
      'assets/ships/kestrel/kestrel_manifest.json',
      'scripts/check-kestrel-asset.mjs',
    ],
    releaseEvidence: [
      'assets/ships/release/kestrel/kestrel_reference.glb',
      'assets/ships/release/release_manifest.json',
      'scripts/build-sg04-release-assets.mjs',
    ],
  },
  'asset.slice.47a_spindle': {
    status: 'authored-runtime-asset',
    kind: 'story-prop',
    releaseReady: true,
    evidence: ['src/render/scenarioProps47a.js', 'scripts/check-47a-visual-assets.mjs'],
    assetId: 'SF_47A_EVIDENCE_SPINDLE',
    note: '47-A evidence spindle is backed by deterministic runtime prop art and an assetRef seam test.',
  },
  'asset.slice.bourse_carrier_wreck': {
    status: 'authored-runtime-asset',
    kind: 'arena-landmark',
    releaseReady: true,
    evidence: ['src/render/scenarioProps47a.js', 'scripts/check-47a-visual-assets.mjs'],
    assetId: 'SF_47A_BOURSE_CARRIER_WRECK',
    note: 'Bourse carrier wreck is backed by deterministic runtime landmark art and an assetRef seam test.',
  },
  enemy_reaver_skirmisher: {
    status: 'authored-runtime-asset',
    kind: 'enemy-ship',
    releaseReady: true,
    evidence: ['src/render/ships/reaverPirate.js', 'src/render/visualOverrides.js', 'scripts/check-47a-visual-assets.mjs', 'scripts/check-reaver-pirate.mjs'],
    assetId: 'SF_REACH_REAVER_PIRATE',
    note: '47-A Reaver skirmisher assetRef routes to the bespoke Reaver pirate runtime asset.',
  },
  enemy_reaver_tug: {
    status: 'authored-runtime-asset',
    kind: 'enemy-ship',
    releaseReady: true,
    evidence: ['src/render/ships/reaverPirate.js', 'src/render/visualOverrides.js', 'scripts/check-47a-visual-assets.mjs', 'scripts/check-reaver-pirate.mjs'],
    assetId: 'SF_REACH_REAVER_PIRATE',
    note: '47-A Reaver tug assetRef routes to the bespoke Reaver runtime asset with tether-capable live actor data.',
  },
  'asset.slice.meridian_recovery_tug': {
    status: 'authored-runtime-asset',
    kind: 'faction-ship',
    releaseReady: true,
    evidence: ['src/render/ships/concordPatrol.js', 'src/render/visualOverrides.js', 'scripts/check-47a-visual-assets.mjs', 'scripts/check-concord-patrol.mjs'],
    assetId: 'SF_SCN_CONCORD_INTERDICTOR',
    note: '47-A recovery tug assetRef routes to the bespoke Concord authority runtime asset.',
  },
  'asset.slice.civilian_pod': {
    status: 'authored-runtime-asset',
    kind: 'story-prop',
    releaseReady: true,
    evidence: ['src/render/scenarioProps47a.js', 'scripts/check-47a-visual-assets.mjs'],
    assetId: 'SF_47A_CIVILIAN_POD',
    note: 'Civilian pod is backed by deterministic runtime rescue-pod art and an assetRef seam test.',
  },
  'lore.contact.kessler': {
    status: 'narrative-ref',
    kind: 'lore',
    releaseReady: true,
    note: 'Remote contact reference; not a visible render asset.',
  },
  'asset.slice.kessler_handoff_beacon': {
    status: 'authored-runtime-asset',
    kind: 'story-prop',
    releaseReady: true,
    evidence: ['src/render/scenarioProps47a.js', 'scripts/check-47a-visual-assets.mjs'],
    assetId: 'SF_47A_KESSLER_HANDOFF_BEACON',
    note: 'Handoff beacon is backed by deterministic runtime objective-zone art and an assetRef seam test.',
  },
});

const devResult = validateReleaseAssetSet(devAssetPaths, { root: ROOT, releaseMode: false });
const releaseResult = validateReleaseAssetSet(releaseAssetPaths, { root: ROOT, releaseMode: true });
const releasePairResult = validateReleaseAssetPairs(assetPairs, { root: ROOT });
const result = releaseMode ? releaseResult : devResult;
const packageCoverage = inspectPackagedAssetCoverage(packageJson);
const releaseManifestCoverage = inspectReleaseManifestCoverage(releaseManifest, assetPairs);
const scenarioCoverage = inspect47aScenarioAssetCoverage(scenario47a, result.assets, { releaseMode });

if (releaseMode) {
  const releaseIssues = [
    ...result.issues,
    ...releasePairResult.issues,
    ...releaseManifestCoverage.issues,
    ...packageCoverage.issues,
    ...scenarioCoverage.issues,
    ...scenarioCoverage.releaseIssues,
  ];
  if (!result.ok || !releasePairResult.ok || !releaseManifestCoverage.ok || !packageCoverage.ok || !scenarioCoverage.releaseReady) {
    console.error(JSON.stringify({
      schema: result.schema,
      ok: false,
      releaseMode: true,
      issueCount: releaseIssues.length,
      issues: releaseIssues.slice(0, 30),
      releasePairResult,
      releaseManifestCoverage,
      packageCoverage,
      scenarioCoverage,
    }, null, 2));
    process.exit(1);
  }
  console.log(`SG-04 release asset gate OK (${releaseAssetPaths.length} assets, releaseReady=true)`);
  process.exit(0);
}

assert.equal(devResult.runtime.schema, 'spaceface.sg04RuntimeDecoderFiles.v1');
assert.equal(devResult.runtime.ok, true, 'SG-04 release decoder runtime files must be vendored');
assert.equal(devResult.ok, true, 'SG-04 dev audit should parse every current GLB');
assert.equal(
  releasePairResult.ok,
  true,
  `SG-04 release assets must be built, compressed, and semantically paired: ${releasePairResult.issues.map((issue) => issue.detail || issue.message).join('; ')}`,
);
assert.equal(
  releaseManifestCoverage.ok,
  true,
  `SG-04 release manifest must enumerate generated assets: ${releaseManifestCoverage.issues.map((issue) => issue.detail || issue.message).join('; ')}`,
);
assert.equal(
  packageCoverage.ok,
  true,
  `packaged builds must include SG-04 runtime files and ship assets: ${packageCoverage.issues.map((issue) => issue.detail || issue.message).join('; ')}`,
);
assert.equal(
  scenarioCoverage.ok,
  true,
  `every 47-A scenario assetRef must have explicit SG-04 coverage status: ${scenarioCoverage.issues.map((issue) => issue.detail || issue.message).join('; ')}`,
);
assert.equal(
  devResult.runtime.files.length,
  SG04_RELEASE_ASSET_CONTRACT.requiredRuntimeFiles.length,
  'SG-04 runtime dependency list should stay aligned with the contract',
);
assert.equal(
  PART_LIBRARY_CONTRACT.releaseRoot,
  'assets/ships/release/parts/',
  'release-mode authored parts must load from the generated release asset root',
);

assert.equal(releaseResult.ok, true, 'built release assets should pass release mode');

const devReleaseResult = validateReleaseAssetSet(devAssetPaths, { root: ROOT, releaseMode: true });
assert.equal(devReleaseResult.ok, false, 'uncompressed dev assets must fail release mode');
assert(
  devReleaseResult.issues.some((issue) => issue.rule === 'asset.releaseCompression'),
  'dev release failure should identify asset compression as the blocker',
);

const devOnlyAssets = devResult.assets.filter((asset) => !asset.releaseReady);
for (const asset of devOnlyAssets) {
  const rules = new Set(asset.releaseIssues.map((issue) => issue.rule));
  // KTX2-native assets (authored hulls) already satisfy the texture contract in dev form, so they
  // only need to be blocked by mesh compression. PNG-based assets must still be blocked by KTX2.
  const hasKtx2 = asset.metrics.textureCount === 0
    || asset.metrics.ktx2TextureCount === asset.metrics.textureCount;
  if (asset.metrics.textureCount > 0 && !hasKtx2) {
    assert(rules.has('release.textures.ktx2'), `${asset.assetPath} should be blocked by missing KTX2 textures`);
  }
  if (asset.metrics.primitiveCount > 0) {
    assert(rules.has('release.mesh.compression'), `${asset.assetPath} should be blocked by missing mesh compression`);
  }
}

const scenarioSummary = [
  `authored=${scenarioCoverage.counts.authored}`,
  `runtime=${scenarioCoverage.counts.runtime}`,
  `pending=${scenarioCoverage.counts.pending}`,
  `narrative=${scenarioCoverage.counts.narrative}`,
].join(' ');
console.log(`SG-04 release asset gate OK (${devAssetPaths.length} assets, releaseReady=${releaseResult.releaseReady}, 47a ${scenarioSummary})`);

function inspectPackagedAssetCoverage(pkg) {
  const buildFiles = (((pkg || {}).build || {}).files || []).map(normalizeRel);
  const runtimeFiles = SG04_RELEASE_ASSET_CONTRACT.requiredRuntimeFiles.map(normalizeRel);
  // A bundled release ships runtime files under build/web/... while still resolving the same
  // relative URLs at runtime, so consider both the raw path and the bundle-prefixed path covered.
  const unpackagedRuntimeFiles = runtimeFiles.filter(
    (file) => !isPackagedPath(file, buildFiles) && !isPackagedPath(BUNDLE_PREFIX + file, buildFiles));
  const requiredRoots = ['assets/ships'];
  const uncoveredRoots = requiredRoots.filter(
    (root) => !isPackagedRoot(root, buildFiles) && !isPackagedRoot(BUNDLE_PREFIX + root, buildFiles));
  const issues = [];

  if (unpackagedRuntimeFiles.length > 0) {
    issues.push({
      rule: 'package.sg04RuntimeFiles',
      message: 'electron package must include SG-04 decoder runtime files',
      detail: unpackagedRuntimeFiles.join(','),
    });
  }
  if (uncoveredRoots.length > 0) {
    issues.push({
      rule: 'package.sg04ShipAssets',
      message: 'electron package must include authored ship asset roots',
      detail: uncoveredRoots.join(','),
    });
  }

  return {
    schema: 'spaceface.sg04PackageAssetCoverage.v1',
    ok: issues.length === 0,
    buildFiles,
    requiredRoots,
    runtimeFiles,
    unpackagedRuntimeFiles,
    uncoveredRoots,
    issues,
  };
}

function inspectReleaseManifestCoverage(manifest, pairs = []) {
  const issues = [];
  if (!manifest) {
    issues.push({
      rule: 'release.manifest.exists',
      path: 'assets/ships/release/release_manifest.json',
      message: 'SG-04 release manifest must be generated',
    });
    return {
      schema: 'spaceface.sg04ReleaseManifestCoverage.v1',
      ok: false,
      assetCount: 0,
      expectedCount: pairs.length,
      issues,
    };
  }

  if (manifest.schemaVersion !== 1) {
    issues.push({
      rule: 'release.manifest.schema',
      path: 'assets/ships/release/release_manifest.json',
      message: 'SG-04 release manifest schemaVersion must be 1',
      detail: String(manifest.schemaVersion),
    });
  }
  const entries = Array.isArray(manifest.assets) ? manifest.assets : [];
  if (entries.length !== pairs.length) {
    issues.push({
      rule: 'release.manifest.assetCount',
      path: 'assets/ships/release/release_manifest.json',
      message: 'SG-04 release manifest must enumerate every validated release asset',
      detail: `${entries.length}/${pairs.length}`,
    });
  }

  const byRelease = new Map(entries.map((entry) => [normalizeRel(entry.release), entry]));
  for (const pair of pairs) {
    const source = normalizeRel(pair.source);
    const release = normalizeRel(pair.release);
    const entry = byRelease.get(release);
    if (!entry) {
      issues.push({
        rule: 'release.manifest.asset',
        path: 'assets/ships/release/release_manifest.json',
        message: 'release manifest is missing an asset entry',
        detail: release,
      });
      continue;
    }
    if (normalizeRel(entry.source) !== source) {
      issues.push({
        rule: 'release.manifest.source',
        path: 'assets/ships/release/release_manifest.json',
        message: 'release manifest source path must match the validated pair',
        detail: `${entry.source} != ${source}`,
      });
    }
    const sourceAbs = resolve(ROOT, source);
    const releaseAbs = resolve(ROOT, release);
    if (existsSync(sourceAbs) && entry.sourceSha256 !== sha256(readFileSync(sourceAbs))) {
      issues.push({
        rule: 'release.manifest.sourceHash',
        path: 'assets/ships/release/release_manifest.json',
        message: 'release manifest source hash is stale',
        detail: source,
      });
    }
    if (existsSync(releaseAbs) && entry.releaseSha256 !== sha256(readFileSync(releaseAbs))) {
      issues.push({
        rule: 'release.manifest.releaseHash',
        path: 'assets/ships/release/release_manifest.json',
        message: 'release manifest release hash is stale',
        detail: release,
      });
    }
  }

  return {
    schema: 'spaceface.sg04ReleaseManifestCoverage.v1',
    ok: issues.length === 0,
    assetCount: entries.length,
    expectedCount: pairs.length,
    issues,
  };
}

function inspect47aScenarioAssetCoverage(scenario, inspectedAssets = [], options = {}) {
  const useReleaseEvidence = options.releaseMode === true;
  const inspectedAssetMap = new Map((inspectedAssets || []).map((asset) => [normalizeRel(asset.assetPath), asset]));
  const refs = new Map();
  for (const actor of scenario.actors || []) {
    if (!actor.assetRef) continue;
    const ref = normalizeRel(actor.assetRef);
    if (!refs.has(ref)) refs.set(ref, []);
    refs.get(ref).push({ actorId: actor.id, role: actor.role, required: actor.required !== false });
  }

  const entries = [...refs.entries()].map(([assetRef, actors]) => {
    const coverage = SCENARIO_47A_ASSET_COVERAGE[assetRef] || {
      status: 'unknown',
      kind: 'unknown',
      note: 'No SG-04 coverage classification exists for this scenario assetRef.',
    };
    const authoredGlb = coverage.status === 'authored-glb';
    const authoredRuntime = coverage.status === 'authored-runtime-asset';
    const narrative = coverage.status === 'narrative-ref';
    const selectedEvidence = useReleaseEvidence
      ? (coverage.releaseEvidence || coverage.evidence || [])
      : (coverage.devEvidence || coverage.evidence || []);
    const evidence = selectedEvidence.map(normalizeRel);
    const evidenceFiles = evidence.map((path) => ({ path, exists: existsSync(resolve(ROOT, path)) }));
    const evidenceGlbs = evidence.filter((path) => path.endsWith('.glb'));
    const inspectedGlbs = evidenceGlbs
      .map((path) => inspectedAssetMap.get(path))
      .filter(Boolean);
    const evidenceReady = authoredGlb
      ? (evidenceGlbs.length > 0 && inspectedGlbs.length === evidenceGlbs.length)
      : (!authoredRuntime || (evidence.length > 0 && evidenceFiles.every((file) => file.exists)));
    const glbReleaseReady = !useReleaseEvidence || inspectedGlbs.every((asset) => asset.releaseReady);
    const releaseReady = coverage.releaseReady === true
      || narrative
      || (authoredGlb && evidenceReady && glbReleaseReady);
    return {
      assetRef,
      actors,
      status: coverage.status,
      kind: coverage.kind,
      assetId: coverage.assetId || '',
      evidenceReady,
      releaseReady,
      evidence,
      evidenceFiles,
      inspectedGlbs: inspectedGlbs.map((asset) => ({
        path: asset.assetPath,
        ok: asset.ok,
        releaseReady: asset.releaseReady,
      })),
      note: coverage.note || '',
    };
  });

  const issues = entries
    .filter((entry) => entry.status === 'unknown')
    .map((entry) => ({
      rule: 'scenario.assetRef.unclassified',
      path: 'src/data/scenarios/47a.scenario.json',
      message: '47-A scenario assetRef must declare its SG-04 release coverage status',
      detail: `${entry.assetRef} (${entry.actors.map((actor) => actor.actorId).join(',')})`,
    }));
  const authoredEvidenceIssues = entries
    .filter((entry) => (entry.status === 'authored-glb' || entry.status === 'authored-runtime-asset') && !entry.evidenceReady)
    .map((entry) => ({
      rule: 'scenario.assetRef.authoredEvidence',
      path: 'src/data/scenarios/47a.scenario.json',
      message: 'authored 47-A scenario assetRef must point at GLB evidence included in SG-04 validation',
      detail: `${entry.assetRef} evidence=${entry.evidence.join(',') || '(none)'}`,
    }));
  const releaseIssues = entries
    .filter((entry) => !entry.releaseReady && entry.status !== 'unknown')
    .map((entry) => ({
      rule: 'scenario.assetRef.releaseCoverage',
      path: 'src/data/scenarios/47a.scenario.json',
      message: '47-A visible scenario assetRef is not backed by authored release asset coverage',
      detail: `${entry.assetRef} (${entry.kind}): ${entry.note}`,
    }));

  const counts = {
    authored: entries.filter((entry) => entry.status === 'authored-glb' || entry.status === 'authored-runtime-asset').length,
    runtime: entries.filter((entry) => entry.status === 'authored-runtime-asset').length,
    pending: entries.filter((entry) => entry.status === 'pending-authored-asset').length,
    narrative: entries.filter((entry) => entry.status === 'narrative-ref').length,
    unknown: entries.filter((entry) => entry.status === 'unknown').length,
  };

  return {
    schema: 'spaceface.sg04ScenarioAssetCoverage.v1',
    scenarioId: scenario.id,
    ok: issues.length === 0 && authoredEvidenceIssues.length === 0,
    releaseReady: issues.length === 0 && authoredEvidenceIssues.length === 0 && releaseIssues.length === 0,
    counts,
    entries,
    issues: [...issues, ...authoredEvidenceIssues],
    releaseIssues,
  };
}

function isPackagedRoot(root, patterns) {
  const relRoot = normalizeRel(root);
  return patterns.some((pattern) => {
    const p = normalizeRel(pattern);
    if (p === 'assets/**' || p === 'assets/**/*' || p === `${relRoot}/**` || p === `${relRoot}/**/*`) return true;
    // A glob like build/web/** covers build/web/assets/ships as a bundled prefix.
    if (p.endsWith('/**') && relRoot.startsWith(`${p.slice(0, -3)}/`)) return true;
    if (p.endsWith('/**/*') && relRoot.startsWith(`${p.slice(0, -5)}/`)) return true;
    return false;
  });
}

function isPackagedPath(path, patterns) {
  const rel = normalizeRel(path);
  return patterns.some((pattern) => {
    const p = normalizeRel(pattern);
    if (p === rel) return true;
    if (p.endsWith('/**')) return rel.startsWith(`${p.slice(0, -3)}/`);
    if (p.endsWith('/**/*')) return rel.startsWith(`${p.slice(0, -5)}/`);
    return false;
  });
}

function normalizeRel(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
