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
import combatReadabilityManifest, {
  createPq023CombatReadabilityManifest,
  PQ023_COMBAT_READABILITY_FIXED_SEED,
} from '../scripts/validation-manifests/pq023-combat-readability.mjs';
import {
  findLivePq023CathedralRoot,
  pq023CathedralApproachPose,
} from '../scripts/lib/pq023CathedralFraming.mjs';
import {
  buildPq023CombatReadabilityProjection,
  PQ023_COMBAT_READABILITY_CELLS,
  validatePq023CombatReadabilityProjection,
} from '../scripts/lib/pq023CombatReadabilityProjection.mjs';
import { setPq023AccessibilityPreference } from '../scripts/lib/pq023Accessibility.mjs';
import { quiescePq023Capture } from '../scripts/lib/pq023CaptureCleanup.mjs';
import { applyAccessibility } from '../src/ui/accessibility.js';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';

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

test('the tracked registry resolves pq023-corridor-cues', async () => {
  const registered = await loadValidationManifestById({
    root: fileURLToPath(ROOT),
    id: 'pq023-corridor-cues',
  });
  assert.equal(registered.id, manifest.id);
  assert.match(registered.__trackedManifest.relativePath, /pq023-corridor-cues\.mjs$/);
});

test('the tracked registry resolves the targeted combat-readability continuation', async () => {
  const registered = await loadValidationManifestById({
    root: fileURLToPath(ROOT),
    id: 'pq023-combat-readability',
  });
  assert.equal(registered.id, combatReadabilityManifest.id);
  assert.match(registered.__trackedManifest.relativePath, /pq023-combat-readability\.mjs$/);
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
    "failedAcceptanceChecks",
    "ok: failedAcceptanceChecks.length === 0",
  ]) assert.ok(source.includes(required), `missing motion evidence contract: ${required}`);
});

test('the combat-readability continuation is a separate five-cell claim that retains prior evidence', () => {
  const source = capture();
  assert.equal(combatReadabilityManifest.id, 'pq023-combat-readability');
  assert.equal(combatReadabilityManifest.runtimeKind, 'browser');
  assert.equal(combatReadabilityManifest.mode, 'acceptance');
  assert.equal(combatReadabilityManifest.requireBrokerClaim, true);
  assert.equal(combatReadabilityManifest.maxLaunchesPerCandidate, 1);
  assert.equal(combatReadabilityManifest.fixedSeed, PQ023_COMBAT_READABILITY_FIXED_SEED);
  assert.equal(PQ023_COMBAT_READABILITY_FIXED_SEED, 47);
  assert.deepEqual(combatReadabilityManifest.commandArgs, ['scripts/probe-pq023-combat-readability.mjs']);
  assert.match(combatReadabilityManifest.artifactRoot.replace(/\\/g, '/'),
    /^\.devshots\/pq023-combat-readability$/);
  assert.equal(createPq023CombatReadabilityManifest({ timeoutMs: 1234 }).timeoutMs, 1234);
  for (const group of ['regressionSourcePaths', 'productionSourcePaths', 'harnessSourcePaths']) {
    for (const relative of combatReadabilityManifest[group]) {
      assert.equal(existsSync(abs(relative)), true, `targeted manifest path missing: ${relative}`);
    }
  }
  assert.deepEqual(PQ023_COMBAT_READABILITY_CELLS.map((row) => row.browserFile), [
    'pq023-impact-autocannon-02.png',
    'pq023-impact-flak-02.png',
    '06-small-01.png',
    'pq023-reduced-small-01.png',
    'pq023-dense-representative.png',
  ]);
  for (const required of [
    'PQ023_COMBAT_READABILITY_ONLY',
    'PQ023_COMBAT_READABILITY_CELLS.map',
    'retainedEvidenceNotRecaptured',
  ]) assert.ok(source.includes(required), `missing targeted continuation contract: ${required}`);
  const electronSource = electron();
  assert.ok(electronSource.includes("process.argv.includes('--combat-readability-only')"));
  assert.ok(electronSource.includes('captureElectronCombatReadability(page, impactProfiles)'));
  assert.ok(electronSource.includes('validatePq023CombatReadabilityProjection'));
});

test('the combat-readability projection fails closed on all five executed runtime grammars', () => {
  assert.deepEqual(PQ023_COMBAT_READABILITY_CELLS.map((row) => row.key), [
    'autocannon', 'flak', 'small', 'small-reduced', 'dense',
  ]);
  const projection = buildPq023CombatReadabilityProjection({
    impactProfiles: {
      autocannon: { weaponId: 'wpn_autocannon_m', mode: 'directional-fragments' },
      flak: { weaponId: 'wpn_flak_turret_s', mode: 'proximity-burst' },
    },
    cells: [
      { key: 'autocannon', runtime: { particles: 8, sprites: 0, trailStreaks: 2, settings: {} } },
      { key: 'flak', runtime: { particles: 12, sprites: 1, spriteKinds: [0], trailStreaks: 6, settings: {} } },
      { key: 'small', runtime: { particles: 0, sprites: 2, spriteKinds: [0, 3], trailStreaks: 2, settings: {} } },
      { key: 'small-reduced', runtime: {
        particles: 0,
        sprites: 2,
        spriteKinds: [0, 3],
        trailStreaks: 2,
        settings: { motionReduce: true, flashReduce: true },
      } },
      { key: 'dense', runtime: { particles: 20, sprites: 12, trailStreaks: 8, combatBeams: 1, settings: {} } },
    ],
  });
  assert.deepEqual(validatePq023CombatReadabilityProjection(projection), []);
  const mutants = [
    { key: 'flak', field: 'trailStreaks', value: 0 },
    { key: 'small', field: 'spriteKinds', value: [0, 1, 3] },
    { key: 'small-reduced', field: 'motionReduce', value: false },
    { key: 'dense', field: 'combatBeams', value: 0 },
  ];
  for (const mutant of mutants) {
    const copy = structuredClone(projection);
    const runtime = copy.cells.find((row) => row.key === mutant.key).runtime;
    runtime[mutant.field] = mutant.value;
    assert.ok(validatePq023CombatReadabilityProjection(copy).length > 0,
      `${mutant.key}.${mutant.field} mutant must fail closed`);
  }
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
      approach: 'approachPq023Cathedral(targetPage)',
      admit: "waitForPq023CathedralState(targetPage, 'failed')",
      frame: 'framePq023Cathedral(targetPage)',
    },
    {
      runtime: 'Electron',
      source: electron(),
      sequence: "window.SF.registry.get('world').enterSector('sector_ceres_belt'",
      sequenceEnd: 'const transitions = [];',
      discover: "waitForCathedralRoot(page, 'failed')",
      approach: 'approachCathedral(page)',
      admit: "waitForCathedralState(page, 'failed')",
      frame: 'frameCathedral(page)',
    },
  ];

  for (const spec of cases) {
    const start = spec.source.indexOf(spec.sequence);
    const end = spec.source.indexOf(spec.sequenceEnd, start);
    const body = spec.source.slice(start, end);
    const discover = body.indexOf(spec.discover);
    const approach = body.indexOf(spec.approach);
    const admit = body.indexOf(spec.admit);
    const frame = body.indexOf(spec.frame);
    assert.ok(start >= 0 && end > start, `${spec.runtime} Cathedral sequence must remain inspectable`);
    assert.ok(discover >= 0 && approach > discover && admit > approach && frame > admit,
      `${spec.runtime} must discover, approach inside 2400 WU, await authored replacement, then frame`);
  }
});

test('Cathedral framing reacquires the durable root after admission replaces its runtime id', () => {
  const staleRoot = {
    id: 41,
    alive: false,
    pos: { x: 10, z: 20 },
    data: { worldSiteId: 'world_site_wreck_cathedral', role: 'world_site_root' },
  };
  const admittedRoot = {
    id: 42,
    alive: true,
    pos: { x: 1000, z: -500 },
    radius: 400,
    data: {
      worldSiteId: 'world_site_wreck_cathedral',
      role: 'world_site_root',
      placeRadius: 400,
    },
  };
  const state = {
    entities: new Map([[staleRoot.id, staleRoot]]),
    entityList: [staleRoot, admittedRoot],
  };
  assert.equal(findLivePq023CathedralRoot(state), admittedRoot,
    'framing must use durable site/role identity rather than the pre-admission runtime id');
  const pose = pq023CathedralApproachPose(admittedRoot);
  assert.ok(Math.abs(pose.x - 360.8) < 1e-9);
  assert.ok(Math.abs(pose.z + 731.2) < 1e-9);
  assert.equal(pose.zoom, 1040);
  assert.equal(pose.radius, 400);

  const source = capture();
  const start = source.indexOf('async function framePq023Cathedral');
  const end = source.indexOf('async function capturePq023WorldSiteFrames', start);
  const body = source.slice(start, end);
  assert.ok(body.includes('return targetPage.evaluate(async () =>'));
  assert.doesNotMatch(body, /},\s*targetId\);/,
    'post-admission framing must not retain the discarded pre-admission runtime id argument');

  const captureFramesStart = source.indexOf('async function capturePq023WorldSiteFrames');
  const captureFramesEnd = source.indexOf('async function readPq023WorldSiteFrame', captureFramesStart);
  const captureFramesBody = source.slice(captureFramesStart, captureFramesEnd);
  assert.ok(
    captureFramesBody.indexOf('framePq023Cathedral(targetPage)')
      < captureFramesBody.indexOf('for (let index = 0; index < 3; index += 1)'),
    'every Browser stage must reacquire and frame its replacement root before capturing frames',
  );
  assert.equal((electron().match(/await frameCathedral\(page\);/g) || []).length, 5,
    'Electron must frame the initial root and each of four admitted stage replacements');
});

test('PQ-023 reduced capture changes the motion preference owner, not only its effective boolean', () => {
  const settings = {
    video: { motionReduce: false },
    accessibility: { motionPreference: 'system', flashReduce: false },
  };
  assert.deepEqual(setPq023AccessibilityPreference(settings, true), {
    motionPreference: 'reduce',
    motionReduce: true,
    flashReduce: true,
  });
  const reduced = applyAccessibility(settings, null);
  assert.equal(reduced.motionPreference, 'reduce');
  assert.equal(reduced.motionReduced, true);
  assert.equal(reduced.flashReduced, true);

  setPq023AccessibilityPreference(settings, false);
  const full = applyAccessibility(settings, null);
  assert.equal(full.motionPreference, 'full');
  assert.equal(full.motionReduced, false);
  assert.equal(full.flashReduced, false);
});

test('PQ-023 cleanup freezes simulation before clearing acceptance-owned VFX pools', () => {
  const state = { timeScale: 1, accumulator: 0.75 };
  let observed = null;
  assert.equal(quiescePq023Capture(state, () => {
    observed = { timeScale: state.timeScale, accumulator: state.accumulator };
  }), true);
  assert.deepEqual(observed, { timeScale: 0, accumulator: 0 });
  assert.deepEqual(state, { timeScale: 0, accumulator: 0 });
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
  const bootStart = source.indexOf('async function bootSeededFlight');
  const bootEnd = source.indexOf('async function readGpuContract', bootStart);
  const bootSource = source.slice(bootStart, bootEnd);
  assert.ok(guard >= 0 && launch > guard);
  assert.ok(bootSource.includes('new URL(targetPage.url()).href'),
    'Electron must prove that the first window already owns the canonical root');
  assert.doesNotMatch(bootSource, /targetPage\.goto|targetPage\.reload/,
    'Electron must not cancel the first-window boot with a redundant canonical-root navigation');
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
