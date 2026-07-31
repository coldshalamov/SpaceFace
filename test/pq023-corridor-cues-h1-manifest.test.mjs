// PQ-023 H1 — static readiness for the single Browser motion cell and sequential Electron parity.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import manifest, {
  PQ023_CATHEDRAL_ADMISSION_REGRESSION,
  createPq023CorridorCuesManifest,
  PQ023_CORRIDOR_CUES_FIXED_SEED,
} from '../scripts/validation-manifests/pq023-corridor-cues.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const abs = (relative) => fileURLToPath(new URL(relative, ROOT));
const wrapper = () => read('scripts/probe-pq023-corridor-cues.mjs');
const capture = () => read('scripts/capture-combat-vfx-acceptance.mjs');
const electron = () => read('scripts/check-pq023-corridor-cues-electron.mjs');

test('pq023-corridor-cues is a one-use fixed-seed Browser acceptance manifest', () => {
  assert.equal(manifest.id, 'pq023-corridor-cues');
  assert.equal(manifest.runtimeKind, 'browser');
  assert.equal(manifest.mode, 'acceptance');
  assert.deepEqual(manifest.commandArgs, ['scripts/probe-pq023-corridor-cues.mjs']);
  assert.equal(manifest.requireBrokerClaim, true);
  assert.equal(manifest.maxLaunchesPerCandidate, 1);
  assert.equal(manifest.fixedSeed, PQ023_CORRIDOR_CUES_FIXED_SEED);
  assert.equal(PQ023_CORRIDOR_CUES_FIXED_SEED, 47);
  assert.ok(manifest.timeoutMs >= 480_000);
  assert.match(manifest.artifactRoot.replace(/\\/g, '/'), /^\.devshots\/pq023-corridor-cues$/);
  assert.equal(createPq023CorridorCuesManifest({ timeoutMs: 1234 }).timeoutMs, 1234);
});

test('every source path declared by the manifest exists', () => {
  const missing = [];
  for (const group of ['regressionSourcePaths', 'productionSourcePaths', 'harnessSourcePaths']) {
    assert.ok(manifest[group].length > 0, `${group} must not be empty`);
    for (const relative of manifest[group]) {
      if (!existsSync(abs(relative))) missing.push(`${group}: ${relative}`);
    }
  }
  assert.deepEqual(missing, [], `manifest declares missing paths: ${missing.join(', ')}`);
});

test('deterministic cue, presentation, sim, and static gates precede claim issue', () => {
  assert.deepEqual(manifest.fastGateCommands, [
    'npm run check:pq023:corridor-cues',
    'npm run check:presentation',
    'npm run check:sim:compare',
    'node --test test/pq023-corridor-cues-h1-manifest.test.mjs',
  ]);
});

test('broker CLI registers and lists pq023-corridor-cues', () => {
  const cli = read('scripts/validation-broker-cli.mjs');
  assert.ok(cli.includes("'pq023-corridor-cues': () => import('./validation-manifests/pq023-corridor-cues.mjs')"));
  const help = cli.slice(cli.indexOf('Manifests:'), cli.indexOf('Environment on spawned probes:'));
  assert.ok(help.includes('pq023-corridor-cues'));
});

test('the Browser wrapper is inert without a broker claim and opts into one headed capture', () => {
  const source = wrapper();
  assert.ok(source.includes('requireBrokerClaimOrDiagnostic'));
  assert.ok(source.includes('process.env.SF_BROKER_CLAIM'));
  assert.ok(source.includes("process.env.SF_PQ023_H1 = '1'"));
  assert.ok(source.includes("process.env.SF_COMBAT_CAPTURE_DIR = '.devshots/pq023-corridor-cues'"));
  assert.ok(source.includes("await import('./capture-combat-vfx-acceptance.mjs')"));
  assert.equal((capture().match(/chromium\.launch\(/g) || []).length, 1);
  assert.ok(capture().includes('headless: !PQ023_H1'));
});

test('the motion cell captures distinct impact, destruction, reduced, dense, and Cathedral sequences', () => {
  const source = capture();
  for (const required of [
    "wpn_autocannon_m",
    "wpn_flak_turret_s",
    "pq023-impact-${spec.key}-",
    "{ key: 'autocannon', weaponId: 'wpn_autocannon_m' }",
    "{ key: 'flak', weaponId: 'wpn_flak_turret_s' }",
    "`${spec.classId} destruction lifecycle motion`",
    "{ classId: 'small'",
    "{ classId: 'ordinary'",
    "{ classId: 'capital'",
    "reduced-motion and reduced-flash ordinary destruction",
    "dense mixed destruction lifecycle motion",
    "pq023-cathedral-${key}-",
    "key: 'recovery-normal'",
    "key: 'damage-normal'",
    "key: 'recovery-reduced'",
    "key: 'damage-reduced'",
    "captures.length === (PQ023_H1 ? 87 : 67)",
    "recordVideo",
  ]) assert.ok(source.includes(required), `missing motion evidence contract: ${required}`);
});

test('Cathedral transitions flow through production owners rather than status assignment', () => {
  const source = capture();
  assert.ok(source.includes("applyWorldSiteBeamOperation({"));
  assert.ok(source.includes("sf.bus.emit('physics:impact'"));
  assert.ok(source.includes("worldSiteCueIds, ["));
  assert.ok(source.includes("'world_site.recovery'"));
  assert.ok(source.includes("'world_site.damage'"));
  assert.ok(source.includes("['ring', 'bracket', 'ring', 'bracket']"));
  assert.doesNotMatch(source, /components\.cathedral_hull\.status\s*=/);
  assert.doesNotMatch(source, /record\.stageId\s*=/);
});

test('Cathedral framing enters authored-admission range before either runtime waits for ready', () => {
  assert.deepEqual(PQ023_CATHEDRAL_ADMISSION_REGRESSION, {
    retainedPlayerDistanceWu: 4936.901,
    authoredApproachDistanceWu: 2400,
    failure: 'waited-for-authored-admission-before-framing',
  });
  assert.ok(
    PQ023_CATHEDRAL_ADMISSION_REGRESSION.retainedPlayerDistanceWu
      > PQ023_CATHEDRAL_ADMISSION_REGRESSION.authoredApproachDistanceWu,
    'the retained failure position must remain outside Cathedral authored-admission range',
  );

  const cases = [
    {
      runtime: 'Browser',
      source: capture(),
      sequence: 'async function capturePq023WorldSiteSequences',
      sequenceEnd: 'async function setPq023Accessibility',
      discover: "waitForPq023CathedralRoot(targetPage, 'failed')",
      frame: 'framePq023Cathedral(targetPage, initialRoot.rootId)',
      admit: "waitForPq023CathedralState(targetPage, 'failed')",
    },
    {
      runtime: 'Electron',
      source: electron(),
      sequence: "window.SF.registry.get('world').enterSector('sector_ceres_belt'",
      sequenceEnd: 'const transitions = [];',
      discover: "waitForCathedralRoot(page, 'failed')",
      frame: 'frameCathedral(page, initialRoot.rootId)',
      admit: "waitForCathedralState(page, 'failed')",
    },
  ];

  for (const spec of cases) {
    const start = spec.source.indexOf(spec.sequence);
    const end = spec.source.indexOf(spec.sequenceEnd, start);
    const body = spec.source.slice(start, end);
    const discover = body.indexOf(spec.discover);
    const frame = body.indexOf(spec.frame);
    const admit = body.indexOf(spec.admit);
    assert.ok(start >= 0 && end > start, `${spec.runtime} Cathedral sequence must remain inspectable`);
    assert.ok(discover >= 0 && frame > discover && admit > frame,
      `${spec.runtime} must discover, frame inside 2400 WU, then wait for authored admission`);
  }
});

test('the Browser cell rejects software rendering and makes no H1 performance claim', () => {
  const source = capture();
  assert.ok(source.includes('SwiftShader|llvmpipe|software'));
  assert.ok(source.includes('informational_contended: PQ023_H1'));
  assert.ok(source.includes('noPerformanceEvidence: PQ023_H1'));
  assert.ok(source.includes('Matched performance remains Phase H3'));
});

test('Electron launches only after Browser PASS and compares normalized cue semantics', () => {
  const source = electron();
  const guard = source.indexOf('browserReport.ok !== true');
  const launch = source.indexOf('electron.launch(launch.options)');
  assert.ok(guard >= 0 && launch > guard);
  for (const required of [
    'createIsolatedElectronLaunch',
    'createElectronCanonicalUrlTracker',
    'waitForCanonicalRoot',
    'assertIsolatedElectronRootUrl',
    'createElectronProcessMonitor',
    'closeOwnedElectronRuntime',
    'launch.cleanup({ runtimeClosed: true })',
    "applyWorldSiteBeamOperation({",
    "sf.bus.emit('physics:impact'",
    'assert.deepEqual(semanticProjection, browserReport.pq023H1.semanticProjection',
    'informational_contended: true',
    'noPerformanceEvidence: true',
  ]) assert.ok(source.includes(required), `missing Electron parity contract: ${required}`);
  assert.doesNotMatch(source, /components\.cathedral_hull\.status\s*=/);
});
