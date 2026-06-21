import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SG04_RELEASE_ASSET_CONTRACT,
  validateReleaseAssetSet,
} from '../src/contracts/assetReleaseValidation.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const PACKAGE_JSON = resolve(ROOT, 'package.json');
const SCENARIO_47A = resolve(ROOT, 'src/data/scenarios/47a.scenario.json');
const releaseMode = process.argv.includes('--release');

const partManifest = JSON.parse(readFileSync(PART_MANIFEST, 'utf8'));
const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
const scenario47a = JSON.parse(readFileSync(SCENARIO_47A, 'utf8'));
const assetPaths = [
  'assets/ships/kestrel/kestrel_reference.glb',
  ...(partManifest.parts || []).map((part) => `assets/ships/parts/${part.file}`),
];

const SCENARIO_47A_ASSET_COVERAGE = Object.freeze({
  ship_kestrel: {
    status: 'authored-glb',
    kind: 'ship',
    evidence: [
      'assets/ships/kestrel/kestrel_reference.glb',
      'assets/ships/kestrel/kestrel_manifest.json',
      'scripts/check-kestrel-asset.mjs',
    ],
  },
  'asset.slice.47a_spindle': {
    status: 'pending-authored-asset',
    kind: 'story-prop',
    note: '47-A evidence spindle is required visible slice art; sim placeholder is dev-only.',
  },
  'asset.slice.bourse_carrier_wreck': {
    status: 'pending-authored-asset',
    kind: 'arena-landmark',
    note: 'Bourse carrier wreck modules need authored asset coverage before release.',
  },
  enemy_reaver_skirmisher: {
    status: 'pending-authored-asset',
    kind: 'enemy-ship',
    note: 'Current Reaver ship visual coverage is a procedural/bespoke fallback, not this scenario assetRef.',
  },
  enemy_reaver_tug: {
    status: 'pending-authored-asset',
    kind: 'enemy-ship',
    note: 'Counter-tether tug needs a release asset tied to the scenario assetRef.',
  },
  'asset.slice.meridian_recovery_tug': {
    status: 'pending-authored-asset',
    kind: 'faction-ship',
    note: 'Official recovery tug is visible hero slice art and cannot ship as a placeholder.',
  },
  'asset.slice.civilian_pod': {
    status: 'pending-authored-asset',
    kind: 'story-prop',
    note: 'Civilian pod is a narrative-priority visible prop and needs authored release art.',
  },
  'lore.contact.kessler': {
    status: 'narrative-ref',
    kind: 'lore',
    releaseReady: true,
    note: 'Remote contact reference; not a visible render asset.',
  },
  'asset.slice.kessler_handoff_beacon': {
    status: 'pending-authored-asset',
    kind: 'story-prop',
    note: 'Handoff beacon is a visible spatial objective and needs authored release art.',
  },
});

const result = validateReleaseAssetSet(assetPaths, { root: ROOT, releaseMode });
const packageCoverage = inspectPackagedAssetCoverage(packageJson);
const scenarioCoverage = inspect47aScenarioAssetCoverage(scenario47a, result.assets);

if (releaseMode) {
  const releaseIssues = [
    ...result.issues,
    ...packageCoverage.issues,
    ...scenarioCoverage.issues,
    ...scenarioCoverage.releaseIssues,
  ];
  if (!result.ok || !packageCoverage.ok || !scenarioCoverage.releaseReady) {
    console.error(JSON.stringify({
      schema: result.schema,
      ok: false,
      releaseMode: true,
      issueCount: releaseIssues.length,
      issues: releaseIssues.slice(0, 30),
      packageCoverage,
      scenarioCoverage,
    }, null, 2));
    process.exit(1);
  }
  console.log(`SG-04 release asset gate OK (${assetPaths.length} assets)`);
  process.exit(0);
}

assert.equal(result.runtime.schema, 'spaceface.sg04RuntimeDecoderFiles.v1');
assert.equal(result.runtime.ok, true, 'SG-04 release decoder runtime files must be vendored');
assert.equal(result.ok, true, 'SG-04 dev audit should parse every current GLB');
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
  result.runtime.files.length,
  SG04_RELEASE_ASSET_CONTRACT.requiredRuntimeFiles.length,
  'SG-04 runtime dependency list should stay aligned with the contract',
);

const releaseResult = validateReleaseAssetSet(assetPaths, { root: ROOT, releaseMode: true });
if (result.releaseReady) {
  assert.equal(releaseResult.ok, true, 'release-ready assets should pass release mode');
} else {
  assert.equal(releaseResult.ok, false, 'uncompressed dev assets must fail release mode');
  assert(
    releaseResult.issues.some((issue) => issue.rule === 'asset.releaseCompression'),
    'release failure should identify asset compression as the blocker',
  );
}

const devOnlyAssets = result.assets.filter((asset) => !asset.releaseReady);
for (const asset of devOnlyAssets) {
  const rules = new Set(asset.releaseIssues.map((issue) => issue.rule));
  assert(rules.has('release.textures.ktx2'), `${asset.assetPath} should be blocked by missing KTX2 textures`);
  assert(rules.has('release.mesh.compression'), `${asset.assetPath} should be blocked by missing mesh compression`);
}

const scenarioSummary = [
  `authored=${scenarioCoverage.counts.authored}`,
  `pending=${scenarioCoverage.counts.pending}`,
  `narrative=${scenarioCoverage.counts.narrative}`,
].join(' ');
console.log(`SG-04 release asset gate OK (${assetPaths.length} assets, releaseReady=${result.releaseReady}, 47a ${scenarioSummary})`);

function inspectPackagedAssetCoverage(pkg) {
  const buildFiles = (((pkg || {}).build || {}).files || []).map(normalizeRel);
  const runtimeFiles = SG04_RELEASE_ASSET_CONTRACT.requiredRuntimeFiles.map(normalizeRel);
  const unpackagedRuntimeFiles = runtimeFiles.filter((file) => !isPackagedPath(file, buildFiles));
  const requiredRoots = ['assets/ships'];
  const uncoveredRoots = requiredRoots.filter((root) => !isPackagedRoot(root, buildFiles));
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

function inspect47aScenarioAssetCoverage(scenario, inspectedAssets = []) {
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
    const authored = coverage.status === 'authored-glb';
    const narrative = coverage.status === 'narrative-ref';
    const evidence = (coverage.evidence || []).map(normalizeRel);
    const evidenceGlbs = evidence.filter((path) => path.endsWith('.glb'));
    const inspectedGlbs = evidenceGlbs
      .map((path) => inspectedAssetMap.get(path))
      .filter(Boolean);
    const evidenceReady = !authored || (evidenceGlbs.length > 0 && inspectedGlbs.length === evidenceGlbs.length);
    const releaseReady = coverage.releaseReady === true
      || narrative
      || (authored && evidenceReady);
    return {
      assetRef,
      actors,
      status: coverage.status,
      kind: coverage.kind,
      evidenceReady,
      releaseReady,
      evidence,
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
    .filter((entry) => entry.status === 'authored-glb' && !entry.evidenceReady)
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
    authored: entries.filter((entry) => entry.status === 'authored-glb').length,
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
  return patterns.some((pattern) =>
    pattern === 'assets/**'
    || pattern === 'assets/**/*'
    || pattern === `${relRoot}/**`
    || pattern === `${relRoot}/**/*`);
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
