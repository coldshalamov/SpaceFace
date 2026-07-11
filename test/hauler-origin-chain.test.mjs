// RED→GREEN isolated tests for M3 Hauler origin chain candidate.
// Run: node test/hauler-origin-chain.test.mjs
// Does not edit goldens, package.json, registries, or other career files.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HAULER_CAREER_ID,
  HAULER_COMPLETION_REWARD,
  HAULER_EXCLUSIVITY,
  HAULER_FAIL_RETRY_COOLDOWN_S,
  HAULER_REOFFER_COOLDOWN_S,
  HAULER_SCHEMA_VERSION,
  HAULER_STEPS,
  haulerRewardMultiplier,
} from '../src/careers/origins/haulerOriginData.js';
import {
  acceptOrigin,
  allowsOtherCareers,
  declineOrigin,
  evaluateStepSignal,
  getHaulerOriginPublicView,
  onFirstDock,
  recordMarketLeg,
  tickHaulerOrigin,
} from '../src/careers/origins/haulerOriginChain.js';
import {
  applyHaulerOriginSaveBlob,
  createHaulerOriginState,
  ensureHaulerOriginState,
  migrateHaulerOriginState,
  serializeHaulerOriginState,
  validateHaulerOriginState,
} from '../src/careers/origins/haulerOriginSchema.js';
import {
  buildFirstDockOriginOffer,
  buildHaulerStepMissionOffer,
  buildStepMarketSnapshot,
  haulerMissionId,
  readMarketTruth,
} from '../src/careers/origins/haulerOriginOffers.js';
import { createHaulerOriginSystem } from '../src/careers/origins/haulerOriginSystem.js';
import {
  attachCreditAuthority,
  collectBusEvents,
  findNondeterminism,
  makeBus,
  makeHaulerState,
  seedIronSpreadMarkets,
} from './hauler-origin-fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ORIGIN_DIR = path.join(ROOT, 'src', 'careers', 'origins');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err && err.message ? err.message : err}`);
  }
}

console.log('hauler-origin-chain');

// ── Schema / save ──────────────────────────────────────────────────────────
check('default state is valid and non-binding', () => {
  const own = createHaulerOriginState();
  const v = validateHaulerOriginState(own);
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.equal(own.schemaVersion, HAULER_SCHEMA_VERSION);
  assert.equal(own.careerId, HAULER_CAREER_ID);
  assert.equal(own.exclusivity.blocksOtherOrigins, false);
  assert.equal(own.flags.otherCareersAllowed, true);
  assert.equal(own.flags.nonBinding, true);
});

check('migrate lifts missing fields without inventing completion', () => {
  const migrated = migrateHaulerOriginState({ schemaVersion: 0, status: 'idle' });
  assert.equal(migrated.schemaVersion, HAULER_SCHEMA_VERSION);
  assert.equal(migrated.status, 'idle');
  assert.equal(migrated.rewardsGranted, false);
  assert.equal(migrated.exclusivity.blocksOtherOrigins, false);
});

check('serialize/applySave round-trip preserves progress', () => {
  const state = makeHaulerState();
  const own = ensureHaulerOriginState(state);
  own.status = 'active';
  own.stepIndex = 1;
  own.stepId = 'route_risk';
  own.attempt = 2;
  own.history.push({ kind: 'test', atS: 1 });
  const blob = serializeHaulerOriginState(state);
  const state2 = makeHaulerState();
  applyHaulerOriginSaveBlob(state2, blob);
  const own2 = ensureHaulerOriginState(state2);
  assert.equal(own2.status, 'active');
  assert.equal(own2.stepIndex, 1);
  assert.equal(own2.stepId, 'route_risk');
  assert.equal(own2.attempt, 2);
  assert.equal(own2.history.length, 1);
});

// ── Three steps present ────────────────────────────────────────────────────
check('exactly three meaningful steps with teach lines', () => {
  assert.equal(HAULER_STEPS.length, 3);
  for (const step of HAULER_STEPS) {
    assert.ok(step.id && step.title && step.teach);
    assert.ok(step.commodityId && step.qty > 0);
    assert.ok(step.originStationId && step.destStationId);
    assert.ok(step.failLine && step.recoveryLine);
  }
  assert.equal(HAULER_STEPS[0].id, 'manifest_truth');
  assert.equal(HAULER_STEPS[1].id, 'route_risk');
  assert.equal(HAULER_STEPS[2].id, 'market_spread');
  assert.ok(HAULER_STEPS[1].collateralCr > 0, 'route risk teaches bond');
  assert.ok(HAULER_STEPS[1].deadlineSlackS > 0, 'route risk teaches timer');
});

// ── First dock non-binding offer ───────────────────────────────────────────
check('first dock offers non-binding hauler origin', () => {
  const state = makeHaulerState({ simTime: 10 });
  const r = onFirstDock(state, 'station_helios', 10);
  assert.equal(r.ok, true);
  assert.ok(r.offer);
  assert.equal(r.offer.nonBinding, true);
  assert.equal(r.offer.careerId, 'hauler');
  assert.equal(r.offer.exclusivity.blocksOtherOrigins, false);
  assert.equal(r.own.status, 'offered');
  assert.equal(r.own.firstDockSeen, true);
  assert.equal(r.own.firstDockStationId, 'station_helios');
});

check('decline is non-binding and re-offers after cooldown', () => {
  const state = makeHaulerState({ simTime: 0 });
  onFirstDock(state, 'station_helios', 0);
  const d = declineOrigin(state, 5);
  assert.equal(d.ok, true);
  assert.equal(d.own.status, 'declined');
  assert.equal(allowsOtherCareers(state), true);

  const early = onFirstDock(state, 'station_helios', 5 + HAULER_REOFFER_COOLDOWN_S - 1);
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'reoffer_cooldown');

  const again = onFirstDock(state, 'station_helios', 5 + HAULER_REOFFER_COOLDOWN_S);
  assert.equal(again.ok, true);
  assert.equal(again.own.status, 'offered');
});

// ── Accept returns an authored offer for the missions authority ────────────
check('accept returns an authored mission and never writes credits directly', () => {
  const state = makeHaulerState({ simTime: 20 });
  const creditsBefore = state.player.credits;
  onFirstDock(state, 'station_helios', 20);
  const r = acceptOrigin(state, 20);
  assert.equal(r.ok, true);
  assert.equal(r.own.status, 'active');
  assert.equal(r.own.stepId, 'manifest_truth');
  assert.equal(state.player.credits, creditsBefore, 'accept must not mutate credits');
  const events = r.intents.map((i) => i.event);
  assert.ok(events.includes('career:origin:step'));
  assert.ok(!events.includes('mission:offered'), 'dead mission event must stay removed');
  const offered = r.missionOffer;
  assert.equal(offered.type, 'cargo_delivery');
  assert.equal(offered.originCareer, 'hauler');
  assert.ok(String(offered.storyTag).includes('manifest_truth'));
  assert.ok(offered.marketTruth, 'mission carries market truth snapshot');
});

// ── Deterministic mission ids ──────────────────────────────────────────────
check('mission ids and offers are deterministic for same seed', () => {
  const a = haulerMissionId(47, 'route_risk', 1, 2);
  const b = haulerMissionId(47, 'route_risk', 1, 2);
  const c = haulerMissionId(48, 'route_risk', 1, 2);
  assert.equal(a, b);
  assert.notEqual(a, c);

  const state = makeHaulerState({ meta: { seed: 99 }, simTime: 3 });
  const step = HAULER_STEPS[0];
  const o1 = buildHaulerStepMissionOffer(state, step, 0, 1);
  const o2 = buildHaulerStepMissionOffer(state, step, 0, 1);
  assert.equal(o1.id, o2.id);
  assert.equal(o1.reward_cr, o2.reward_cr);
  assert.deepEqual(o1.marketTruth.fantasyMidSpread, o2.marketTruth.fantasyMidSpread);
});

// ── Market truth teaching ──────────────────────────────────────────────────
check('market snapshot exposes mid fantasy vs real bid/ask spread', () => {
  const state = seedIronSpreadMarkets(makeHaulerState());
  const step = HAULER_STEPS[2];
  const snap = buildStepMarketSnapshot(state, step);
  assert.equal(snap.origin.source, 'economy.markets');
  assert.equal(snap.dest.source, 'economy.markets');
  assert.equal(snap.origin.buy, 26);
  assert.equal(snap.dest.sell, 32);
  assert.equal(snap.fantasyMidSpread, 34 - 24);
  assert.equal(snap.realTradeSpread, 32 - 26);
  assert.ok(snap.lesson.includes('spread') || snap.lesson.includes('Spread') || snap.lesson.length > 10);
});

// ── Step success / failure / recovery ──────────────────────────────────────
check('manual delivery completes step 1 and opens step 2 offer', () => {
  const state = makeHaulerState({ simTime: 30 });
  onFirstDock(state, 'station_helios', 30);
  acceptOrigin(state, 30);
  const r = evaluateStepSignal(state, {
    kind: 'manual_delivery',
    stationId: 'station_coalition',
  }, 40);
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'step_complete');
  assert.equal(r.completedStepId, 'manifest_truth');
  assert.equal(r.nextStepId, 'route_risk');
  assert.equal(r.own.status, 'offered');
  assert.equal(r.own.stepIndex, 1);
  assert.ok(r.intents.some((i) => i.event === 'economy:grantCredits'));
});

check('route risk charges collateral intent and fails on deadline with recovery', () => {
  const state = makeHaulerState({ simTime: 0 });
  onFirstDock(state, 'station_helios', 0);
  acceptOrigin(state, 0);
  // complete step 0
  evaluateStepSignal(state, { kind: 'manual_delivery', stationId: 'station_coalition' }, 10);
  // accept route risk
  const acc = acceptOrigin(state, 20);
  assert.equal(acc.ok, true);
  assert.equal(acc.own.stepId, 'route_risk');
  assert.ok(!acc.intents.some((i) => i.event === 'economy:chargeCredits'),
    'missions authority owns collateral settlement');
  const deadline = acc.own.activeContract.deadlineS;
  assert.ok(deadline > 20);

  const tick = tickHaulerOrigin(state, deadline);
  assert.equal(tick.ok, true);
  assert.equal(tick.kind, 'step_failed');
  assert.equal(tick.own.status, 'step_failed');
  assert.equal(tick.canRetry, true);
  assert.equal(tick.own.attempt, 1);
  assert.ok(haulerRewardMultiplier(1) < 1);

  // cooldown then re-offer same step with reduced reward
  const early = onFirstDock(state, 'station_helios', deadline + HAULER_FAIL_RETRY_COOLDOWN_S - 1);
  assert.equal(early.ok, false);
  const re = onFirstDock(state, 'station_helios', deadline + HAULER_FAIL_RETRY_COOLDOWN_S);
  assert.equal(re.ok, true);
  assert.equal(re.own.stepIndex, 1);
  const acc2 = acceptOrigin(state, deadline + HAULER_FAIL_RETRY_COOLDOWN_S + 1);
  assert.equal(acc2.ok, true);
  assert.ok(acc2.missionOffer.reward_cr < HAULER_STEPS[1].baseRewardCr);
  assert.ok(acc2.missionOffer.collateral_cr < HAULER_STEPS[1].collateralCr);
});

check('full chain completes with visible non-exclusive reward', () => {
  const state = seedIronSpreadMarkets(makeHaulerState({ simTime: 0 }));
  const bus = makeBus();
  attachCreditAuthority(bus, state);
  const log = collectBusEvents(bus);
  const credits0 = state.player.credits;

  // Drive pure FSM + emit intents through mock authority.
  function fire(result) {
    if (result && result.intents) {
      for (const intent of result.intents) bus.emit(intent.event, intent.payload);
    }
  }

  fire(onFirstDock(state, 'station_helios', 0));
  fire(acceptOrigin(state, 1));
  fire(evaluateStepSignal(state, { kind: 'manual_delivery', stationId: 'station_coalition' }, 2));

  fire(acceptOrigin(state, 3));
  fire(evaluateStepSignal(state, { kind: 'manual_delivery', stationId: 'station_ceres' }, 4));

  fire(acceptOrigin(state, 5));
  recordMarketLeg(state, 'buy', {
    stationId: 'station_beltout',
    commodityId: 'cmdty_ore_iron',
    qty: 10,
    unitPrice: 26,
    total: 260,
  }, 6);
  recordMarketLeg(state, 'sell', {
    stationId: 'station_ceres',
    commodityId: 'cmdty_ore_iron',
    qty: 10,
    unitPrice: 32,
    total: 320,
  }, 7);
  fire(evaluateStepSignal(state, { kind: 'market_spread' }, 8));

  const own = ensureHaulerOriginState(state);
  assert.equal(own.status, 'completed');
  assert.equal(own.rewardsGranted, true);
  assert.ok(own.rewardReceipt);
  assert.equal(own.rewardReceipt.credits, HAULER_COMPLETION_REWARD.credits);
  assert.equal(own.exclusivity.blocksOtherOrigins, false);
  assert.deepEqual(own.exclusivity.peerCareers, HAULER_EXCLUSIVITY.peerCareers.slice());
  assert.equal(allowsOtherCareers(state), true);

  const grants = log.of('economy:grantCredits');
  assert.ok(grants.some((e) => e.payload.reason === HAULER_COMPLETION_REWARD.reason));
  const rep = log.of('faction:repDelta');
  assert.ok(rep.some((e) => e.payload.factionId === 'faction_mts' && e.payload.delta === 5));
  assert.ok(log.of('career:origin:completed').length >= 1);
  assert.ok(state.player.credits > credits0, 'visible credit reward applied via authority');

  // Reward band is modest vs not invalidating other careers (schema check).
  assert.ok(HAULER_COMPLETION_REWARD.credits <= 800);
  assert.ok(HAULER_COMPLETION_REWARD.unlockHints.length >= 1);
});

check('mission_completed path skips double step payout', () => {
  const state = makeHaulerState({ simTime: 0 });
  onFirstDock(state, 'station_helios', 0);
  const acc = acceptOrigin(state, 1);
  const missionId = `active_${acc.missionOffer.id}`;
  acc.own.activeContract.missionId = missionId;
  const r = evaluateStepSignal(state, {
    kind: 'mission_completed',
    missionId,
    missionPaid: true,
  }, 2);
  assert.equal(r.ok, true);
  assert.ok(!r.intents.some((i) =>
    i.event === 'economy:grantCredits' && String(i.payload.reason).startsWith('hauler_origin_step:')));
  assert.ok(!r.intents.some((i) =>
    i.event === 'economy:grantCredits' && String(i.payload.reason).includes('collateral_refund')));
});

// ── System integration (isolated init, not registered) ─────────────────────
check('system reacts to dock:docked and career accept intents', () => {
  const state = makeHaulerState({ simTime: 100, meta: { seed: 7 } });
  const bus = makeBus();
  attachCreditAuthority(bus, state);
  const log = collectBusEvents(bus);
  const sys = createHaulerOriginSystem();
  sys.init({ state, bus, helpers: {} });

  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.ok(log.of('career:origin:offered').length >= 1);
  const view = sys.getView();
  assert.equal(view.status, 'offered');
  assert.equal(view.nonBinding, true);

  bus.emit('career:hauler:accept');
  assert.equal(sys.getView().status, 'active');
  assert.equal(log.of('mission:offered').length, 0);

  bus.emit('career:hauler:delivered', { stationId: 'station_coalition' });
  assert.equal(sys.getView().status, 'offered');
  assert.equal(sys.getView().stepIndex, 1);
});

check('system newGame resets origin without touching other careers root peers', () => {
  const state = makeHaulerState();
  state.careers.origins = { hunter: { status: 'active' } }; // peer origin blob — must survive
  const bus = makeBus();
  const sys = createHaulerOriginSystem();
  sys.init({ state, bus });
  onFirstDock(state, 'station_helios', 0);
  acceptOrigin(state, 1);
  sys.newGame();
  assert.equal(state.careers.origins.hauler.status, 'idle');
  assert.equal(state.careers.origins.hunter.status, 'active');
});

check('save blob from system serialize migrates cleanly', () => {
  const state = makeHaulerState({ meta: { seed: 3 } });
  const bus = makeBus();
  const sys = createHaulerOriginSystem();
  sys.init({ state, bus });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  sys.accept();
  const blob = sys.serialize();
  const state2 = makeHaulerState();
  const sys2 = createHaulerOriginSystem();
  sys2.init({ state: state2, bus: makeBus() });
  sys2.applySave(blob);
  assert.equal(sys2.getView().status, 'active');
  assert.equal(sys2.getView().stepId, 'manifest_truth');
});

// ── Forbidden nondeterminism in candidate sources ──────────────────────────
check('hauler origin sources avoid Math.random and wall clock', () => {
  const files = fs.readdirSync(ORIGIN_DIR).filter((f) => f.startsWith('hauler') && f.endsWith('.js'));
  assert.ok(files.length >= 4, `expected hauler* modules, got ${files.join(',')}`);
  for (const file of files) {
    const text = fs.readFileSync(path.join(ORIGIN_DIR, file), 'utf8');
    const hits = findNondeterminism(text);
    assert.deepEqual(hits, [], `${file} has nondeterminism: ${hits.join(',')}`);
  }
});

// ── Cross-career mutual non-exclusion schema ───────────────────────────────
check('reward schema documents peer careers and no exclusivity', () => {
  assert.equal(HAULER_EXCLUSIVITY.exclusive, false);
  assert.equal(HAULER_EXCLUSIVITY.blocksOtherOrigins, false);
  assert.ok(HAULER_EXCLUSIVITY.peerCareers.includes('hunter'));
  assert.ok(HAULER_EXCLUSIVITY.peerCareers.includes('prospector'));
  const offer = buildFirstDockOriginOffer(makeHaulerState(), 'station_helios', 1);
  assert.equal(offer.exclusivity.blocksOtherOrigins, false);
  const view = getHaulerOriginPublicView(makeHaulerState());
  assert.equal(view.allowsOtherCareers, true);
});

check('readMarketTruth prefers live economy over synthetic', () => {
  const state = seedIronSpreadMarkets(makeHaulerState());
  const live = readMarketTruth(state, 'station_beltout', 'cmdty_ore_iron');
  assert.equal(live.source, 'economy.markets');
  assert.equal(live.mid, 24);
  const cold = readMarketTruth(
    makeHaulerState({ economy: { markets: {} } }),
    'station_beltout',
    'cmdty_ore_iron',
    { allowSynthetic: true },
  );
  assert.equal(cold.source, 'synthetic_fallback');
  assert.ok(cold.buy > 0);
});

// ── Exit ───────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll hauler-origin checks passed.');
process.exit(0);
