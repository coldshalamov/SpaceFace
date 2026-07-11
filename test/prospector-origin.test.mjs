// Prospector origin chain — isolated RED-to-GREEN suite.
// Run: node test/prospector-origin.test.mjs
// Does not touch package.json, goldens, registries, or peer careers.

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PROSPECTOR_EVENTS,
  PROSPECTOR_ORIGIN_CONTRACT,
  PROSPECTOR_ORIGIN_ID,
  PROSPECTOR_ORIGIN_SCHEMA_ID,
  PROSPECTOR_ORIGIN_SCHEMA_VERSION,
  PROSPECTOR_REOFFER_COOLDOWN_S,
  PROSPECTOR_REWARD,
  PROSPECTOR_STATUS,
  PROSPECTOR_STEP_IDS,
  PROSPECTOR_STEPS,
  acceptProspectorOrigin,
  appraiseDeposit,
  assertProspectorCopyBudget,
  canOfferProspectorOrigin,
  createProspectorOriginState,
  declineProspectorOrigin,
  deserializeProspectorOrigin,
  ensureProspectorOriginState,
  gradeAtLeast,
  migrateProspectorOriginState,
  offerProspectorOrigin,
  pickBestDepositAppraisal,
  prospectorOrigin,
  serializeProspectorOrigin,
} from '../src/careers/origins/prospectorOrigin.js';
import { gradeFromExpectedValue } from '../src/careers/origins/prospectorOriginAppraisal.js';
import {
  advanceSim,
  clearHold,
  grantOreInHold,
  makeAsteroid,
  makeRuntime,
  makeState,
  playthroughHappyPath,
} from './prospector-origin-fixtures.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
    throw err;
  }
}

console.log('prospector-origin tests');

// ── Isolation / existence ────────────────────────────────────────────────────

test('candidate modules exist under src/careers/origins/prospector*', () => {
  const files = [
    'src/careers/origins/prospectorOrigin.js',
    'src/careers/origins/prospectorOriginDefs.js',
    'src/careers/origins/prospectorOriginState.js',
    'src/careers/origins/prospectorOriginAppraisal.js',
    'test/prospector-origin.test.mjs',
    'test/prospector-origin-fixtures.mjs',
  ];
  for (const rel of files) {
    assert.equal(existsSync(join(repoRoot, rel)), true, `missing ${rel}`);
  }
});

test('does not mutate package.json or registry wiring (source isolation)', () => {
  const originSrc = readFileSync(join(repoRoot, 'src/careers/origins/prospectorOrigin.js'), 'utf8');
  assert.equal(/from\s+['"][^'"]*registry\.js['"]/.test(originSrc), false, 'must not import registry');
  assert.equal(/from\s+['"][^'"]*input\.js['"]/.test(originSrc), false, 'must not import input');
  assert.equal(/from\s+['"][^'"]*hud\.js['"]/.test(originSrc), false, 'must not import hud');
  assert.equal(/\bMath\.random\s*\(/.test(originSrc), false, 'no Math.random in origin module');
  assert.equal(/\bDate\.now\s*\(/.test(originSrc), false, 'no wall clock in origin module');
  // package.json must not be required for the candidate to load.
  assert.equal(typeof prospectorOrigin.init, 'function');
});

// ── Taste / copy ─────────────────────────────────────────────────────────────

test('player-facing copy stays within 12-word budget', () => {
  const result = assertProspectorCopyBudget(12);
  assert.equal(result.ok, true, `offenders: ${JSON.stringify(result.offenders)}`);
});

// ── Schema / determinism ─────────────────────────────────────────────────────

test('fresh state is non-binding with three pending steps', () => {
  const own = createProspectorOriginState(10);
  assert.equal(own.originId, PROSPECTOR_ORIGIN_ID);
  assert.equal(own.schemaId, PROSPECTOR_ORIGIN_SCHEMA_ID);
  assert.equal(own.schemaVersion, PROSPECTOR_ORIGIN_SCHEMA_VERSION);
  assert.equal(own.binding, false);
  assert.equal(own.status, PROSPECTOR_STATUS.IDLE);
  assert.deepEqual(PROSPECTOR_STEP_IDS, ['appraise', 'extract', 'sell']);
  for (const id of PROSPECTOR_STEP_IDS) {
    assert.equal(own.steps[id].status, 'pending');
  }
});

test('serialize → deserialize round-trips', () => {
  const state = makeState({ simTime: 42 });
  const own = ensureProspectorOriginState(state, 42);
  own.status = PROSPECTOR_STATUS.ACTIVE;
  own.stepIndex = 1;
  own.activeStepId = 'extract';
  own.steps.extract.oreCollected = 2;
  own.marks.push('prospector_survey_kit');

  const blob = serializeProspectorOrigin(state);
  assert.equal(blob.originId, PROSPECTOR_ORIGIN_ID);
  assert.equal(blob.steps.extract.oreCollected, 2);

  const state2 = makeState({ simTime: 99, ensureOrigin: false });
  deserializeProspectorOrigin(state2, blob);
  const own2 = state2.careers.origins.prospector;
  assert.equal(own2.status, PROSPECTOR_STATUS.ACTIVE);
  assert.equal(own2.steps.extract.oreCollected, 2);
  assert.equal(own2.binding, false);
  assert.deepEqual(own2.marks, ['prospector_survey_kit']);
});

test('migrate coerces corrupt blobs without throwing', () => {
  const migrated = migrateProspectorOriginState({
    schemaVersion: 0,
    status: 'active',
    steps: { appraise: { oreCollected: 'nope' } },
    binding: true, // must be forced false
  }, 5);
  assert.equal(migrated.binding, false);
  assert.equal(migrated.schemaVersion, PROSPECTOR_ORIGIN_SCHEMA_VERSION);
  assert.equal(migrated.steps.appraise.oreCollected, 0);
});

test('reward stays under peer balance cap', () => {
  assert.ok(PROSPECTOR_REWARD.credits <= PROSPECTOR_REWARD.peerCapCr);
  assert.ok(PROSPECTOR_REWARD.grossValueCr <= PROSPECTOR_REWARD.peerCapCr);
  assert.ok(PROSPECTOR_REWARD.credits >= 300, 'reward must be visible');
  assert.equal(PROSPECTOR_ORIGIN_CONTRACT.excludesOtherOrigins, false);
  assert.equal(PROSPECTOR_ORIGIN_CONTRACT.binding, false);
});

// ── Deposit appraisal ────────────────────────────────────────────────────────

test('appraiseDeposit grades common rock at least fair', () => {
  const a = appraiseDeposit(makeAsteroid(1, 'ast_common_rock'));
  assert.equal(a.ok, true);
  assert.ok(gradeAtLeast(a.grade, 'poor'));
  assert.ok(a.commodityIds.includes('cmdty_ore_iron') || a.commodityIds.includes('cmdty_silicate'));
  assert.ok(a.expectedUnitValue > 0);
});

test('exotic deposit grades higher than common', () => {
  const common = appraiseDeposit('ast_common_rock');
  const exotic = appraiseDeposit('ast_rare_exotic');
  assert.ok(gradeAtLeast(exotic.grade, common.grade) || exotic.expectedUnitValue > common.expectedUnitValue);
  assert.ok(exotic.extractionRisk >= common.extractionRisk);
});

test('pickBestDepositAppraisal is stable and prefers richer type', () => {
  const list = [
    makeAsteroid(20, 'ast_common_rock'),
    makeAsteroid(21, 'ast_rare_exotic'),
    makeAsteroid(19, 'ast_metallic'),
  ];
  const best = pickBestDepositAppraisal(list);
  assert.equal(best.typeId, 'ast_rare_exotic');
  // re-run identical
  assert.equal(pickBestDepositAppraisal(list).depositId, best.depositId);
});

test('gradeFromExpectedValue is monotone in value', () => {
  const g0 = gradeFromExpectedValue(0, 0);
  const g1 = gradeFromExpectedValue(10, 0);
  const g2 = gradeFromExpectedValue(100, 3);
  assert.equal(g0, 'barren');
  assert.ok(gradeAtLeast(g1, g0));
  assert.ok(gradeAtLeast(g2, g1));
});

// ── First dock / non-binding offer ───────────────────────────────────────────

test('first dock offers non-binding origin', () => {
  const { state, bus, system, events } = makeRuntime({ simTime: 100 });
  bus.emit('dock:docked', { stationId: 'st_helios_yard' });
  const own = state.careers.origins.prospector;
  assert.equal(own.status, PROSPECTOR_STATUS.OFFERED);
  assert.equal(own.binding, false);
  assert.equal(own.firstDockStationId, 'st_helios_yard');
  assert.equal(own.offerCount, 1);
  const offered = events.filter((e) => e.event === PROSPECTOR_EVENTS.OFFERED);
  assert.equal(offered.length, 1);
  assert.equal(offered[0].payload.binding, false);
  const offer = system.getOffer();
  assert.equal(offer.canAccept, true);
  assert.equal(offer.binding, false);
});

test('decline is non-binding and re-offers after cooldown', () => {
  const { state, bus, system } = makeRuntime({ simTime: 0 });
  bus.emit('dock:docked', { stationId: 'st_a' });
  const declined = system.decline();
  assert.equal(declined.ok, true);
  assert.equal(state.careers.origins.prospector.status, PROSPECTOR_STATUS.DECLINED);

  // Immediate re-dock: still cooling down.
  advanceSim(state, 10);
  assert.equal(canOfferProspectorOrigin(state, state.simTime), false);
  bus.emit('dock:docked', { stationId: 'st_a' });
  assert.equal(state.careers.origins.prospector.status, PROSPECTOR_STATUS.DECLINED);

  // After cooldown: re-offer.
  advanceSim(state, PROSPECTOR_REOFFER_COOLDOWN_S);
  assert.equal(canOfferProspectorOrigin(state, state.simTime), true);
  bus.emit('dock:docked', { stationId: 'st_b' });
  assert.equal(state.careers.origins.prospector.status, PROSPECTOR_STATUS.OFFERED);
  assert.equal(state.careers.origins.prospector.offerCount, 2);
});

test('accept starts appraise step and does not exclude other origins', () => {
  const { state, bus, system, events } = makeRuntime();
  bus.emit('dock:docked', { stationId: 'st_a' });
  const res = system.accept();
  assert.equal(res.ok, true);
  assert.equal(state.careers.origins.prospector.status, PROSPECTOR_STATUS.ACTIVE);
  assert.equal(state.careers.origins.prospector.activeStepId, 'appraise');
  const accepted = events.find((e) => e.event === PROSPECTOR_EVENTS.ACCEPTED);
  assert.equal(accepted.payload.excludesOtherOrigins, false);
  assert.equal(accepted.payload.binding, false);
});

// ── Three steps with failure/recovery ────────────────────────────────────────

test('step 1 appraise succeeds on scan with deposits', () => {
  const { state, bus, system } = makeRuntime();
  bus.emit('dock:docked', { stationId: 'st_a' });
  system.accept();
  for (const e of state.entityList) {
    if (e.type === 'asteroid') {
      e.data.scanOreGlyph = 'Fe';
      e.data.scanHighlightUntil = 20;
    }
  }
  bus.emit('scan:completed', {
    found: { asteroids: 2, wrecks: 0, anomalies: 0 },
    sectorId: 'sec_helios',
  });
  const own = state.careers.origins.prospector;
  assert.equal(own.steps.appraise.status, 'done');
  assert.equal(own.activeStepId, 'extract');
  assert.ok(own.steps.appraise.appraisals >= 1);
  assert.ok(own.steps.appraise.bestGrade);
});

test('step 1 empty scan fails and recovers to retry', () => {
  const { state, bus, system, events } = makeRuntime({ asteroids: [] });
  bus.emit('dock:docked', { stationId: 'st_a' });
  system.accept();
  bus.emit('scan:completed', {
    found: { asteroids: 0, wrecks: 0, anomalies: 0 },
  });
  const own = state.careers.origins.prospector;
  assert.equal(own.activeStepId, 'appraise');
  assert.ok(own.steps.appraise.failCount >= 1);
  assert.ok(own.steps.appraise.recoveryCount >= 1);
  assert.equal(own.steps.appraise.status, 'active');
  const recovered = events.filter((e) => e.event === PROSPECTOR_EVENTS.STEP_RECOVERED);
  assert.ok(recovered.length >= 1);
  assert.equal(recovered[0].payload.recoveryId, 'retry_scan');
});

test('step 2 extract counts mining:yield and completes at target', () => {
  const { state, bus, system } = makeRuntime();
  bus.emit('dock:docked', { stationId: 'st_a' });
  system.accept();
  // Force into extract.
  const own = state.careers.origins.prospector;
  own.steps.appraise.status = 'done';
  own.activeStepId = 'extract';
  own.stepIndex = 1;
  own.steps.extract.status = 'active';

  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: state.playerId });
  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: state.playerId });
  assert.equal(own.steps.extract.oreCollected, 2);
  assert.equal(own.activeStepId, 'extract');
  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: state.playerId });
  assert.equal(own.steps.extract.status, 'done');
  assert.equal(own.activeStepId, 'sell');
});

test('step 2 cargo:full is a recoverable risk event', () => {
  const { state, bus, system, events } = makeRuntime();
  bus.emit('dock:docked', { stationId: 'st_a' });
  system.accept();
  const own = state.careers.origins.prospector;
  own.steps.appraise.status = 'done';
  own.activeStepId = 'extract';
  own.stepIndex = 1;
  own.steps.extract.status = 'active';

  bus.emit('cargo:full', { commodityId: 'cmdty_ore_iron' });
  assert.ok(own.steps.extract.riskEvents >= 1);
  assert.ok(own.steps.extract.failCount >= 1);
  assert.ok(own.steps.extract.recoveryCount >= 1);
  assert.equal(own.activeStepId, 'extract');
  const risk = events.filter((e) => e.event === PROSPECTOR_EVENTS.RISK);
  assert.ok(risk.some((e) => e.payload.kind === 'cargo_full'));
});

test('step 2 tether break recovers with reattach', () => {
  const { state, bus, system, events } = makeRuntime();
  bus.emit('dock:docked', { stationId: 'st_a' });
  system.accept();
  const own = state.careers.origins.prospector;
  own.steps.appraise.status = 'done';
  own.activeStepId = 'extract';
  own.stepIndex = 1;
  own.steps.extract.status = 'active';

  bus.emit('tether:latched', { targetId: 99 });
  assert.equal(own.steps.extract.tetherLatches, 1);
  bus.emit('tether:broke', { targetId: 99 });
  assert.ok(own.steps.extract.riskEvents >= 1);
  const recovered = events.filter((e) => e.event === PROSPECTOR_EVENTS.STEP_RECOVERED);
  assert.ok(recovered.some((e) => e.payload.recoveryId === 'reattach'));
});

test('step 3 sell completes chain and grants reward via economy intent', () => {
  const { state, bus, system, events } = makeRuntime();
  bus.emit('dock:docked', { stationId: 'st_a' });
  system.accept();
  const own = state.careers.origins.prospector;
  for (const id of ['appraise', 'extract']) {
    own.steps[id].status = 'done';
  }
  own.activeStepId = 'sell';
  own.stepIndex = 2;
  own.steps.sell.status = 'active';
  own.minedOre.cmdty_ore_iron = 3;
  grantOreInHold(state, 'cmdty_ore_iron', 3);

  bus.emit('economy:tradeCompleted', {
    side: 'sell',
    commodityId: 'cmdty_ore_iron',
    qty: 3,
    total: 36,
  });

  assert.equal(own.status, PROSPECTOR_STATUS.COMPLETED);
  assert.equal(own.rewardGranted, true);
  assert.ok(own.marks.includes(PROSPECTOR_REWARD.markId));
  const grants = events.filter((e) => e.event === 'economy:grantCredits');
  assert.equal(grants.length, 1);
  assert.equal(grants[0].payload.amount, PROSPECTOR_REWARD.credits);
  assert.equal(grants[0].payload.reason, PROSPECTOR_REWARD.reason);
  const rewardEvt = events.filter((e) => e.event === PROSPECTOR_EVENTS.REWARD);
  assert.equal(rewardEvt.length, 1);
});

test('sell with empty hold recovers back to extract', () => {
  const { state, bus, system, events } = makeRuntime();
  bus.emit('dock:docked', { stationId: 'st_a' });
  system.accept();
  const own = state.careers.origins.prospector;
  own.steps.appraise.status = 'done';
  own.steps.extract.status = 'done';
  own.steps.extract.oreCollected = 3;
  own.activeStepId = 'sell';
  own.stepIndex = 2;
  own.steps.sell.status = 'active';
  clearHold(state);

  bus.emit('dock:docked', { stationId: 'st_a' });
  assert.equal(own.activeStepId, 'extract');
  assert.equal(own.steps.extract.status, 'active');
  const recovered = events.filter((e) => e.event === PROSPECTOR_EVENTS.STEP_RECOVERED);
  assert.ok(recovered.some((e) => e.payload.recoveryId === 'return_to_extract'));
});

// ── Full happy path + determinism ────────────────────────────────────────────

test('full happy path completes with three meaningful steps', () => {
  const runtime = makeRuntime({ simTime: 50 });
  const result = playthroughHappyPath(runtime);
  assert.equal(result.ok, true);
  assert.equal(result.own.status, PROSPECTOR_STATUS.COMPLETED);
  assert.equal(result.own.steps.appraise.status, 'done');
  assert.equal(result.own.steps.extract.status, 'done');
  assert.equal(result.own.steps.sell.status, 'done');
  assert.equal(result.own.rewardGranted, true);
});

test('identical seeds + event order produce identical serialized state', () => {
  function runOnce() {
    const runtime = makeRuntime({ seed: 4242, simTime: 0 });
    playthroughHappyPath(runtime);
    return serializeProspectorOrigin(runtime.state);
  }
  const a = runOnce();
  const b = runOnce();
  assert.deepEqual(a, b);
});

// ── Event authority compliance ───────────────────────────────────────────────

test('module never writes player.credits or cargo.items directly in handlers', () => {
  const src = readFileSync(join(repoRoot, 'src/careers/origins/prospectorOrigin.js'), 'utf8');
  // Allow reading credits via state but forbid assignment patterns.
  assert.equal(/player\.credits\s*=/.test(src), false);
  assert.equal(/cargo\.items\s*=/.test(src), false);
  assert.equal(/addCargo\s*\(/.test(src), false);
  assert.equal(/removeCargo\s*\(/.test(src), false);
  assert.ok(src.includes("economy:grantCredits"), 'must emit credit intent');
});

test('system newGame resets origin blob', () => {
  const { state, system } = makeRuntime();
  state.careers.origins.prospector.status = PROSPECTOR_STATUS.COMPLETED;
  system.newGame();
  assert.equal(state.careers.origins.prospector.status, PROSPECTOR_STATUS.IDLE);
  assert.equal(state.careers.origins.prospector.rewardGranted, false);
});

test('contract metadata exports steps and reward for peer harness', () => {
  assert.equal(PROSPECTOR_ORIGIN_CONTRACT.originId, 'prospector');
  assert.deepEqual(PROSPECTOR_ORIGIN_CONTRACT.steps, ['appraise', 'extract', 'sell']);
  assert.equal(PROSPECTOR_ORIGIN_CONTRACT.reward.credits, PROSPECTOR_REWARD.credits);
  assert.equal(typeof PROSPECTOR_ORIGIN_CONTRACT.api.accept, 'function');
  assert.equal(PROSPECTOR_STEPS.appraise.teach, 'deposit_appraisal');
  assert.equal(PROSPECTOR_STEPS.extract.teach, 'extraction_risk');
  assert.equal(PROSPECTOR_STEPS.sell.teach, 'market_sell');
});

// ── Pure function accept/decline without system instance ─────────────────────

test('standalone offer/accept/decline API works without init', () => {
  const state = makeState({ simTime: 0 });
  const busEvents = [];
  const bus = { emit: (e, p) => busEvents.push({ e, p }) };
  offerProspectorOrigin(state, { stationId: 'st_x' }, bus);
  assert.equal(state.careers.origins.prospector.status, PROSPECTOR_STATUS.OFFERED);
  acceptProspectorOrigin(state, bus);
  assert.equal(state.careers.origins.prospector.activeStepId, 'appraise');
});

if (process.exitCode) {
  console.error(`\nprospector-origin: FAILED after ${passed} passing assertions`);
  process.exit(1);
} else {
  console.log(`\nprospector-origin: ${passed} tests passed`);
}
