// PQ-019C Phase H1 — static readiness for the broker-authorized headed Browser cell.
//
// These tests do not launch the broker or a browser. They pin the one-use manifest, its complete
// invalidation surface, the fixed-seed New Game route, the real station/Mission Log DOM controls,
// and the production seams used for compressed physical outcomes. The actual product route remains
// one broker attempt after this file is green.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import manifest, {
  classifyPq019CapsuleWaitSnapshot,
  createPq019SurfaceHeistManifest,
  PQ019_CAPSULE_LAUNCH_GRACE_S,
  PQ019_SURFACE_HEIST_FIXED_SEED,
} from '../scripts/validation-manifests/pq019-surface-heist.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const abs = (relative) => fileURLToPath(new URL(relative, ROOT));
const probe = () => read('scripts/probe-pq019-surface-heist.mjs');

test('the pq019-surface-heist manifest is a one-use headed Browser acceptance cell', () => {
  assert.equal(manifest.id, 'pq019-surface-heist');
  assert.equal(manifest.runtimeKind, 'browser');
  assert.equal(manifest.mode, 'acceptance');
  assert.deepEqual(manifest.commandArgs, [
    'scripts/probe-pq019-surface-heist.mjs',
    '--continuation-only',
  ]);
  assert.equal(manifest.requireBrokerClaim, true);
  assert.equal(manifest.maxLaunchesPerCandidate, 1,
    'the H1 one-attempt rule must be structural at the broker boundary');
  assert.equal(manifest.fixedSeed, PQ019_SURFACE_HEIST_FIXED_SEED);
  assert.equal(PQ019_SURFACE_HEIST_FIXED_SEED, 19019);
  assert.match(manifest.artifactRoot.replace(/\\/g, '/'), /^\.devshots\/pq019-surface-heist$/);
  assert.ok(manifest.timeoutMs >= 300_000, 'six sequential fixed-seed contexts need a non-toy timeout');
  assert.equal(createPq019SurfaceHeistManifest({ timeoutMs: 1234 }).timeoutMs, 1234,
    'manifest overrides must not be dropped');
});

test('every source path declared by the manifest exists', () => {
  const groups = ['regressionSourcePaths', 'productionSourcePaths', 'harnessSourcePaths'];
  const missing = [];
  for (const group of groups) {
    assert.ok(manifest[group].length > 0, `${group} must not be empty`);
    for (const relative of manifest[group]) {
      if (!existsSync(abs(relative))) missing.push(`${group}: ${relative}`);
    }
  }
  assert.deepEqual(missing, [], `manifest declares missing paths: ${missing.join(', ')}`);
});

test('receipt invalidation includes the real DOM, voice, law, combat, and cleanup owners', () => {
  for (const required of [
    'src/ai/engagementAuthority.js',
    'src/combat/damage.js',
    'src/core/coreSystem.js',
    'src/law/authorityResponse.js',
    'src/missions/heistArbiter.js',
    'src/missions/heistMissionRuntime.js',
    'src/systems/heistFacilities.js',
    'src/systems/lawSecurity.js',
    'src/systems/npcJobsRuntime.js',
    'src/systems/tetherGameplay.js',
    'src/ui/alerts.js',
    'src/ui/confirm.js',
    'src/ui/screens/missionLog.js',
    'src/ui/station/screens/contracts.js',
    'src/ui/toasts.js',
    'src/ui/voiceArbiter.js',
  ]) {
    assert.ok(manifest.productionSourcePaths.includes(required),
      `${required} must invalidate a stale PQ-019C Browser receipt`);
  }
  assert.ok(manifest.harnessSourcePaths.includes('scripts/lib/visualProbeServer.mjs'),
    'the probe must bind the shared fresh-server owner');
});

test('the deterministic mission, seam, facility, and sim gates run before claim issue', () => {
  assert.deepEqual(manifest.fastGateCommands, [
    'npm run check:pq019c:mission',
    'npm run check:pq019b:seams',
    'npm run check:pq019a:facility-embodiment',
    'npm run check:sim:compare',
  ]);
});

test('capsule readiness is decided by simulation progress and terminal state, never wall time', () => {
  const oldWallTimeoutFingerprint = {
    startedAtSimT: 100,
    simTime: 102,
    tick: 6_120,
    timeScale: 0.1,
    mode: 'flight',
    schedule: { scheduleId: 'heist:mission-1', status: 'scheduled', launchAtSimT: 104 },
    mission: {
      found: true,
      status: 'active',
      heist: {
        scheduleId: 'heist:mission-1',
        scheduleRequested: true,
        launchAtSimT: 104,
        launchTick: null,
        capsuleEntityId: null,
        capsuleSeen: false,
        settled: false,
        settledOutcome: null,
        terminalReceipt: null,
      },
    },
    capsule: null,
  };

  assert.deepEqual(classifyPq019CapsuleWaitSnapshot(oldWallTimeoutFingerprint), {
    status: 'pending',
    reason: 'launch_not_due',
    simElapsedS: 2,
    launchLagS: -2,
  }, 'twenty wall seconds at 0.1x is not a missing capsule when only two sim seconds elapsed');

  const scheduleNotYetObserved = structuredClone(oldWallTimeoutFingerprint);
  scheduleNotYetObserved.schedule = null;
  scheduleNotYetObserved.mission.heist.launchAtSimT = null;
  assert.equal(
    classifyPq019CapsuleWaitSnapshot(scheduleNotYetObserved).reason,
    'launch_schedule_unobserved',
    'a null launch timestamp must not be coerced into simulation time zero',
  );

  const afterLaunchGrace = {
    ...oldWallTimeoutFingerprint,
    simTime: 104 + PQ019_CAPSULE_LAUNCH_GRACE_S,
    tick: 6_300,
  };
  assert.equal(classifyPq019CapsuleWaitSnapshot(afterLaunchGrace).status, 'launch_missed');

  const terminalRace = structuredClone(oldWallTimeoutFingerprint);
  terminalRace.mission.heist.terminalReceipt = {
    receiptId: 'heist-terminal-1',
    outcome: 'unresolved_absent',
  };
  assert.equal(classifyPq019CapsuleWaitSnapshot(terminalRace).status, 'terminal_race');

  const liveCapsule = {
    ...oldWallTimeoutFingerprint,
    simTime: 104,
    capsule: { id: 77, role: 'cargo_capsule', hull: 160 },
  };
  assert.equal(classifyPq019CapsuleWaitSnapshot(liveCapsule).status, 'ready');
});

test('the broker CLI registers and lists pq019-surface-heist', () => {
  const cli = read('scripts/validation-broker-cli.mjs');
  assert.ok(cli.includes("'pq019-surface-heist': () => import('./validation-manifests/pq019-surface-heist.mjs')"));
  const help = cli.slice(cli.indexOf('Manifests:'), cli.indexOf('Environment on spawned probes:'));
  assert.ok(help.includes('pq019-surface-heist'), 'the one-command cell must appear in CLI help');
});

test('the probe is broker-gated and applies the broker seed through New Game', () => {
  const source = probe();
  assert.ok(source.includes('requireBrokerClaimOrDiagnostic'));
  assert.ok(source.includes('process.env.SF_BROKER_CLAIM'));
  assert.ok(source.includes('process.exit(2)'), 'an unclaimed direct run must stop before Browser launch');
  assert.ok(source.includes('process.env.SF_PROBE_SEED'));
  assert.ok(source.includes("page.fill('#sf-ng-seed', String(FIXED_SEED))"),
    'seed metadata is not enough: the actor must fill the shipped seed field');
  assert.ok(source.includes('state.meta?.seed ?? null'));
  assert.ok(source.includes("assert.equal(recordedSeed, FIXED_SEED"));
});

test('the station and Mission Log claims are driven by the real visible controls', () => {
  const source = probe();
  for (const required of [
    '[data-nav="contracts"]',
    '.sx-ct-row[data-mid=',
    '[data-accept=',
    "page.keyboard.press('KeyJ')",
    '[data-act="abandon"]',
    '.sf-confirm__cancel',
    '.sf-confirm__ok',
  ]) assert.ok(source.includes(required), `missing public-control route: ${required}`);
  assert.ok(source.includes('await commit.click()'), 'offer acceptance must click the real DOM control');
  assert.ok(!/\.emit\(['"]ui:acceptMission['"]/.test(source),
    'the probe must not bypass the station DOM with the acceptance intent');
  assert.ok(source.includes('mission?.sourceOfferId === id'),
    'offer ids and active mission ids are distinct and must be joined explicitly');
  assert.ok(source.includes('initialFocusIsCancel'),
    'the dangerous abandon confirmation must prove its safe initial focus');
});

test('terminal routes use production ownership seams and never assign terminal state', () => {
  const source = probe();
  for (const required of [
    "sf.bus.emit('tether:latched'",
    "sf.bus.emit('physics:impact'",
    'sf.helpers.routeCombatDamage',
    "origin: { kind: 'acceptance_fixture'",
    'offer.params.recoveryEnabled = recovery',
    "waitForOutcome(page, accepted.mission.id",
    "waitForOutcome(page, retryAccepted.mission.id",
  ]) assert.ok(source.includes(required), `missing production route seam: ${required}`);
  assert.ok(!/state\.player\.heat\s*=/.test(source), 'the heat owner must remain the only heat writer');
  assert.ok(!/\.arbiter\.(?:phase|receipt)\s*=/.test(source), 'the harness must not assign arbiter state');
  assert.ok(!/\.settledOutcome\s*=/.test(source), 'the harness must not assign terminal outcomes');
  assert.ok(!/capsule\.(?:alive|hull)\s*=/.test(source),
    'destruction must route through combat rather than hand-killing the payload');
  assert.ok(!/PQ019C_HEIST_TUNING\.recoveryEnabled\s*=/.test(source),
    'the frozen shipping policy must not be mutated for the acceptance fixture');
});

test('one headed Browser process runs the six isolated contexts sequentially', () => {
  const source = probe();
  assert.equal((source.match(/chromium\.launch\(/g) || []).length, 1,
    'the whole row owns one Browser launch');
  assert.ok(/chromium\.launch\(\{[\s\S]*?headless:\s*false/.test(source),
    'H1 requires a visible headed Browser route');
  assert.equal((source.match(/await runScenario\(/g) || []).length, 6,
    'DOM abandon plus five terminal routes run as six sequential contexts');
  assert.equal((source.match(/browser\.newContext\(/g) || []).length, 1,
    'all contexts must be created through the one sequential route helper');
  assert.ok(source.includes("reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference'"));
  assert.ok(source.includes("assert.doesNotMatch(scenarioGpu.renderer, /SwiftShader|llvmpipe|software/i"),
    'the functional receipt must not silently come from software rendering');
});

test('the fresh H1 claim executes only the four missing route contexts', () => {
  const source = probe();
  assert.ok(source.includes("const CONTINUATION_ONLY = process.argv.includes('--continuation-only')"));
  assert.match(source, /if \(!DIAGNOSTIC && !CONTINUATION_ONLY\)[\s\S]*?process\.exit\(2\)/,
    'an acceptance claim must fail closed before consumption unless it is the declared continuation');
  assert.match(source, /const abandon = CONTINUATION_ONLY \? null : await runScenario\('dom-abandon'/);
  assert.match(source, /const lawful = CONTINUATION_ONLY \? null : await runScenario\('lawful-observe'/);
  assert.match(source, /CONTINUATION_ONLY[\s\S]*?assertContinuationContract\(\{ fenced, confiscated, destroyed, recovery \}\)/);
  assert.match(source, /retainedEvidenceReferences:[\s\S]*?row4-pq019-surface-heist/);
});

test('the H1 probe contains no performance sampler or timing result field', () => {
  const source = probe();
  for (const forbidden of [
    /performance\.now\s*\(/,
    /renderer\.info/,
    /frameTimes?\s*[:=]/,
    /hitch(?:Count|es)\s*[:=]/i,
    /p(?:95|99)\s*[:=]/i,
  ]) assert.doesNotMatch(source, forbidden);
  assert.ok(source.includes('noPerformanceEvidence: true'));
  assert.ok(source.includes('matched performance remains Phase H3'));
});
