// CL-01 Hauler professional ladder — focused contract tests (candidate).
// Run: node --test test/hauler-ladder.test.mjs
// Does not edit goldens, package.json, registry, save, UI, systems, or framework sources.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CAREER_LADDERS_SCHEMA_ID,
  LADDER_STATUS,
  clearLadderDefinitions,
  createCareerLaddersSystem,
  getLadderDefinition,
  listLadderDefinitions,
  registerLadderDefinition,
  validateLadderDefinition,
} from '../src/careers/ladders/careerLadders.js';
import {
  assertNoNondeterminism,
  attemptMultiplier,
  isForbiddenHeatEvent,
  LADDER_REWARD_EVENTS,
  STEP_STATUS,
} from '../src/careers/ladders/ladderShared.js';
import {
  HAULER_LADDER_CAREER_ID,
  HAULER_LADDER_DEF,
  HAULER_LADDER_STEP_IDS,
  HAULER_LADDER_TEST_VECTORS,
  HAULER_LANE_TOLL_CR,
  HAULER_SKILL_PROOF_KEY,
  HAULER_STEP_PARAMS,
  buildHaulerLadderDefinition,
  buildHaulerLadderMissionOffer,
  haulerLadderMissionId,
  haulerLadderStepSeed,
  haulerLadderStoryTag,
  pickHaulerInjectEvent,
  validateHaulerLadderDefinition,
} from '../src/careers/ladders/haulerLadderDefs.js';
import {
  createHaulerLadderSystem,
  emitInfrastructureBoom,
  registerHaulerLadder,
} from '../src/careers/ladders/haulerLadderFsm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const ALLOWED_FILES = [
  'src/careers/ladders/haulerLadderDefs.js',
  'src/careers/ladders/haulerLadderFsm.js',
  'test/hauler-ladder.test.mjs',
];

/**
 * Forbidden heat *reward* intents the ladder must never emit.
 * Distinct from live observation `heat:changed` (heat system → ladder).
 * Framework isForbiddenHeatEvent() uses startsWith('heat:') and therefore
 * also flags the observation event — do not use it to bucket emit intents.
 */
const FORBIDDEN_HEAT_REWARD_INTENTS = new Set(['heat:delta', 'heat:raise', 'heat:set']);

function isForbiddenHeatRewardIntent(eventName) {
  return FORBIDDEN_HEAT_REWARD_INTENTS.has(String(eventName || ''));
}

function makeHarness(seed = 7701, opts = {}) {
  clearLadderDefinitions();
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 100;
  state.tick = 6000;
  state.player = state.player || {};
  state.player.credits = 5000;
  state.player.heat = 0;
  state.player.cargo = state.player.cargo || { items: {}, usedVolume: 0, usedMass: 0 };
  state.story = state.story || { beatIndex: 2, phase: 1 };
  state.careers = state.careers || {};
  state.careers.origins = {
    __meta: { schemaId: 'spaceface.careerOrigins.v1', schemaVersion: 1 },
    hauler: { status: opts.originStatus || 'completed' },
    hunter: { status: 'idle' },
    prospector: { status: 'offered' },
  };

  const bus = createBus();
  const intents = [];
  const events = [];
  const origEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    events.push({ event, payload });
    if (
      event === LADDER_REWARD_EVENTS.GRANT_CREDITS
      || event === LADDER_REWARD_EVENTS.CHARGE_CREDITS
      || event === LADDER_REWARD_EVENTS.REP_DELTA
      || event === 'mission:forceEvent'
      || isForbiddenHeatRewardIntent(event)
    ) {
      intents.push({ event, payload });
    }
    return origEmit(event, payload);
  };

  const ladders = createCareerLaddersSystem();
  ladders.init({ state, bus, registry: { get: () => null } });
  clearLadderDefinitions();
  assert.equal(registerHaulerLadder().ok, true);

  const hauler = createHaulerLadderSystem({ ladders });
  hauler.init({ state, bus, registry: opts.registry || { get: () => null } });

  return { state, bus, ladders, hauler, intents, events, seed };
}

function grantCreditsCount(intents) {
  return intents.filter((i) => i.event === LADDER_REWARD_EVENTS.GRANT_CREDITS).length;
}

/** Re-read leaf after every framework transition (ensureLadderLeaf migrates/replaces). */
function leaf(h) {
  return h.state.careers.ladders.hauler;
}

function activateOnStep(h, stepIndex = 0) {
  // Complete prior steps via signals to land on stepIndex.
  h.hauler.offer({ ignorePrereqs: true });
  h.hauler.accept({ ignorePrereqs: true });
  for (let i = 0; i < stepIndex; i += 1) {
    const r = h.hauler.applySignal({ kind: 'complete' });
    assert.equal(r.ok, true, `complete step ${i}: ${r.reason}`);
  }
  const own = leaf(h);
  assert.equal(own.status, LADDER_STATUS.ACTIVE);
  assert.equal(own.stepId, HAULER_LADDER_STEP_IDS[stepIndex]);
  return own;
}

// ── file allowlist / determinism ─────────────────────────────────────────────

test('candidate modules exist under allowlist paths', () => {
  for (const rel of ALLOWED_FILES) {
    assert.equal(existsSync(join(repoRoot, rel)), true, `missing ${rel}`);
  }
});

test('no Math.random or Date.now in hauler ladder modules', () => {
  for (const rel of [
    'src/careers/ladders/haulerLadderDefs.js',
    'src/careers/ladders/haulerLadderFsm.js',
  ]) {
    const src = readFileSync(join(repoRoot, rel), 'utf8');
    const flags = assertNoNondeterminism(src);
    assert.equal(flags.hasMathRandom, false, rel);
    assert.equal(flags.hasDateNow, false, rel);
  }
});

test('definition validates and registers with framework', () => {
  clearLadderDefinitions();
  const v = validateHaulerLadderDefinition();
  assert.equal(v.ok, true, v.errors && v.errors.join('; '));
  assert.equal(validateLadderDefinition(HAULER_LADDER_DEF).ok, true);
  const reg = registerHaulerLadder();
  assert.equal(reg.ok, true, reg.reason);
  assert.equal(getLadderDefinition(HAULER_LADDER_CAREER_ID).careerId, 'hauler');
  assert.equal(listLadderDefinitions().length, 1);
  assert.equal(getLadderDefinition('hauler').steps.length, 5);
});

test('exactly five embodied steps with stable ids and themes', () => {
  assert.deepEqual(HAULER_LADDER_STEP_IDS, [
    'broker_desk',
    'bonded_convoy',
    'risk_lane_tax',
    'spread_counterplay',
    'lane_infrastructure',
  ]);
  assert.equal(HAULER_LADDER_DEF.steps.length, 5);
  assert.equal(HAULER_LADDER_DEF.nonBinding, true);
  for (let i = 0; i < 5; i += 1) {
    const step = HAULER_LADDER_DEF.steps[i];
    assert.equal(step.id, HAULER_LADDER_STEP_IDS[i]);
    assert.equal(step.index, i);
    assert.ok(step.rewards && Number.isFinite(step.rewards.credits));
    assert.ok(step.recovery && Number.isFinite(step.recovery.cooldownS));
    assert.ok(HAULER_STEP_PARAMS[step.id], `params for ${step.id}`);
    assert.ok(HAULER_STEP_PARAMS[step.id].teach);
    assert.ok(HAULER_STEP_PARAMS[step.id].acceptLine.split(/\s+/).length <= 12);
  }
  assert.ok(HAULER_LADDER_DEF.completionBonus.credits >= 1000);
});

test('definition rejects forbidden reward shapes (framework fail-closed)', () => {
  clearLadderDefinitions();
  const bad = buildHaulerLadderDefinition();
  bad.steps[0].rewards = { cargo: { ore: 1 }, heat: 0.2 };
  assert.equal(validateLadderDefinition(bad).ok, false);
  const heatChoice = buildHaulerLadderDefinition();
  heatChoice.steps[2].choices[0].consequences = [
    { event: 'heat:delta', payload: { delta: 0.1 } },
  ];
  assert.equal(validateLadderDefinition(heatChoice).ok, false);
});

test('rewards and choices use only canonical owner intents', () => {
  const def = HAULER_LADDER_DEF;
  for (const step of def.steps) {
    const keys = Object.keys(step.rewards || {});
    for (const k of keys) {
      assert.ok(['credits', 'chargeCredits', 'rep', 'intents'].includes(k), `bad key ${k}`);
    }
    if (Array.isArray(step.choices)) {
      for (const ch of step.choices) {
        for (const c of ch.consequences || []) {
          assert.ok(
            Object.values(LADDER_REWARD_EVENTS).includes(c.event),
            `non-canonical choice event ${c.event}`,
          );
          assert.equal(isForbiddenHeatEvent(c.event), false);
        }
      }
    }
  }
});

// ── unlock / non-binding ─────────────────────────────────────────────────────

test('origin completed unlocks offer; skillProof alternate also works', () => {
  const h = makeHarness(11, { originStatus: 'completed' });
  const offered = h.hauler.offer();
  assert.equal(offered.ok, true, offered.reason);
  assert.equal(h.state.careers.ladders.hauler.status, LADDER_STATUS.OFFERED);

  clearLadderDefinitions();
  const h2 = makeHarness(12, { originStatus: 'idle' });
  // Without origin complete, prereqs fail unless skillProof.
  const blocked = h2.hauler.offer();
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'prerequisites_unmet');

  h2.ladders.noteSkillProof(HAULER_SKILL_PROOF_KEY, 1);
  const viaProof = h2.hauler.offer();
  assert.equal(viaProof.ok, true, viaProof.reason);
});

test('completing hauler ladder does not block peer origins or invent exclusive lock', () => {
  const h = makeHarness();
  activateOnStep(h, 0);
  for (let i = 0; i < 5; i += 1) {
    assert.equal(h.hauler.applySignal({ kind: 'complete' }).ok, true);
  }
  const own = h.state.careers.ladders.hauler;
  assert.equal(own.status, LADDER_STATUS.COMPLETED);
  assert.equal(own.flags.exclusive, false);
  assert.equal(own.flags.blocksOtherCareers, false);
  assert.equal(own.nonBinding, true);
  assert.equal(h.state.careers.origins.hunter.status, 'idle');
  assert.equal(h.state.careers.origins.prospector.status, 'offered');
  assert.equal(h.state.careers.origins.hauler.status, 'completed');
});

// ── H0 broker desk ───────────────────────────────────────────────────────────

test('H0-success: mission complete settles broker_desk with idempotent grant', () => {
  const h = makeHarness();
  activateOnStep(h, 0);
  const missionId = leaf(h).steps.broker_desk.payload.missionId;
  assert.ok(missionId);
  assert.equal(leaf(h).steps.broker_desk.payload.storyTag, haulerLadderStoryTag('broker_desk'));

  h.bus.emit('mission:completed', { missionId, type: 'cargo_delivery' });
  assert.equal(leaf(h).steps.broker_desk.status, STEP_STATUS.DONE);
  assert.equal(leaf(h).stepId, 'bonded_convoy');
  const grants1 = grantCreditsCount(h.intents);
  assert.ok(grants1 >= 1);

  // Double complete same receipt path: step already advanced — no double grant for broker.
  h.bus.emit('mission:completed', { missionId, type: 'cargo_delivery' });
  assert.equal(grantCreditsCount(h.intents), grants1);
});

test('H0-fail-deadline: recover applies attemptMult 0.85', () => {
  const h = makeHarness();
  activateOnStep(h, 0);
  const deadlineS = leaf(h).steps.broker_desk.payload.deadlineS;
  h.state.simTime = deadlineS + 1;
  h.hauler.update(0, h.state);
  assert.equal(leaf(h).status, LADDER_STATUS.RECOVERING);
  assert.equal(leaf(h).steps.broker_desk.failures, 1);
  assert.equal(leaf(h).attemptMult, attemptMultiplier(1));
  assert.equal(leaf(h).attemptMult, 0.85);

  h.state.simTime = leaf(h).recoverReadyAtS + 0.01;
  const rec = h.hauler.recover();
  assert.equal(rec.ok, true, rec.reason);
  assert.equal(leaf(h).status, LADDER_STATUS.ACTIVE);
  assert.equal(leaf(h).stepId, 'broker_desk');
});

test('H0-idempotent-reward: duplicate complete receipt grants once', () => {
  const h = makeHarness();
  activateOnStep(h, 0);
  const r1 = h.hauler.applySignal({ kind: 'complete', receiptId: 'fixed_h0' });
  assert.equal(r1.ok, true);
  const n1 = grantCreditsCount(h.intents);
  const r2 = h.hauler.applySignal({
    kind: 'complete',
    stepId: 'broker_desk',
    receiptId: 'fixed_h0',
  });
  // After advance, step mismatch or duplicate — either way no extra broker grant.
  assert.equal(grantCreditsCount(h.intents), n1);
  void r2;
});

// ── H1 convoy ────────────────────────────────────────────────────────────────

test('H1-success: escort mission complete advances bonded_convoy', () => {
  const h = makeHarness();
  activateOnStep(h, 1);
  const missionId = leaf(h).steps.bonded_convoy.payload.missionId;
  h.bus.emit('mission:completed', { missionId, type: 'escort' });
  assert.equal(leaf(h).steps.bonded_convoy.status, STEP_STATUS.DONE);
  assert.equal(leaf(h).stepId, 'risk_lane_tax');
});

test('H1-escortee-lost: entity:killed escortee fails step', () => {
  const h = makeHarness();
  activateOnStep(h, 1);
  leaf(h).steps.bonded_convoy.payload.escorteeId = 42;
  h.bus.emit('entity:killed', { id: 42, data: { escortee: true } });
  assert.equal(leaf(h).status, LADDER_STATUS.RECOVERING);
  assert.equal(leaf(h).steps.bonded_convoy.status, STEP_STATUS.RECOVERING);
  assert.ok(leaf(h).history.some((e) => e.code === 'escortee_destroyed' || e.kind === 'step_failed'));
});

test('H1-civilian-heat: WANTED via heat:changed fails convoy; no heat reward intents', () => {
  const h = makeHarness();
  activateOnStep(h, 1);
  // Product observation: heat owner already raised WANTED; ladder only *listens*.
  h.state.player.heat = 0.2;
  h.bus.emit('heat:changed', { value: 0.2, level: 1 });

  // Product truth: WANTED observation moves bonded_convoy → recovering.
  assert.equal(leaf(h).status, LADDER_STATUS.RECOVERING);
  assert.equal(leaf(h).steps.bonded_convoy.status, STEP_STATUS.RECOVERING);

  // Observation heat:changed is on the bus as *input*, not a ladder emit.
  assert.ok(h.events.some((e) => e.event === 'heat:changed'));
  // harness must not bucket observation heat:changed as a forbidden reward intent
  assert.ok(!h.intents.some((i) => i.event === 'heat:changed'));

  // Product truth: ladder emits no heat:delta / heat:raise / heat:set reward intent.
  assert.ok(h.intents.every((i) => !isForbiddenHeatRewardIntent(i.event)));
  assert.equal(
    h.events.filter((e) => isForbiddenHeatRewardIntent(e.event)).length,
    0,
  );
});

// ── H2 risk lane tax ─────────────────────────────────────────────────────────

test('H2-success-toll: pay_toll charges 80cr then deliver completes', () => {
  const h = makeHarness();
  activateOnStep(h, 2);
  const missionId = leaf(h).steps.risk_lane_tax.payload.missionId;
  const choice = h.hauler.choose('pay_toll');
  assert.equal(choice.ok, true, choice.reason);
  assert.ok(h.intents.some((i) => (
    i.event === LADDER_REWARD_EVENTS.CHARGE_CREDITS
    && i.payload && i.payload.amount === HAULER_LANE_TOLL_CR
  )));
  // Credits unchanged until economy owner applies — ladder only emits intent.
  assert.equal(h.state.player.credits, 5000);

  h.bus.emit('mission:completed', { missionId, type: 'cargo_delivery' });
  assert.equal(leaf(h).steps.risk_lane_tax.status, STEP_STATUS.DONE);
});

test('H2-fragile-fail: cargo:fragileLost fails with cargo_cracked', () => {
  const h = makeHarness();
  activateOnStep(h, 2);
  h.bus.emit('cargo:fragileLost', {
    t: h.state.simTime,
    totalQty: 2,
    items: [{ commodityId: 'cmdty_fuel_cells', qty: 2 }],
  });
  assert.equal(leaf(h).status, LADDER_STATUS.RECOVERING);
  assert.equal(leaf(h).steps.risk_lane_tax.payload.fragileLost, true);
  assert.ok(leaf(h).history.some((e) => e.kind === 'step_failed'));
});

test('H2-blockade-inject: arming risk_lane_tax emits mission:forceEvent once', () => {
  const h = makeHarness();
  activateOnStep(h, 2);
  const forces = h.intents.filter((i) => i.event === 'mission:forceEvent');
  assert.ok(forces.length >= 1, 'expected mission:forceEvent on arm');
  const types = forces.map((f) => f.payload && f.payload.type);
  assert.ok(types.some((t) => t === 'piracy' || t === 'blockade'));
  // Deterministic type from step seed.
  const seed = leaf(h).steps.risk_lane_tax.payload.stepSeed;
  const expected = pickHaulerInjectEvent('risk_lane_tax', seed);
  assert.equal(leaf(h).steps.risk_lane_tax.payload.eventType, expected.type);
});

// ── H3 spread counterplay ────────────────────────────────────────────────────

test('H3-spread-ok: buy/sell legs meeting minSpread complete step', () => {
  const h = makeHarness();
  activateOnStep(h, 3);
  const params = HAULER_STEP_PARAMS.spread_counterplay;
  h.bus.emit('economy:tradeCompleted', {
    stationId: params.originStationId,
    commodityId: params.commodityId,
    side: 'buy',
    qty: 12,
    unitAvg: 20,
  });
  h.bus.emit('economy:tradeCompleted', {
    stationId: params.destStationId,
    commodityId: params.commodityId,
    side: 'sell',
    qty: 12,
    unitAvg: 30, // > 20 * 1.08
  });
  assert.equal(leaf(h).steps.spread_counterplay.status, STEP_STATUS.DONE);
  assert.equal(leaf(h).stepId, 'lane_infrastructure');
});

test('H3-spread-fail: insufficient spread does not complete', () => {
  const h = makeHarness();
  activateOnStep(h, 3);
  const params = HAULER_STEP_PARAMS.spread_counterplay;
  h.bus.emit('economy:tradeCompleted', {
    stationId: params.originStationId,
    commodityId: params.commodityId,
    side: 'buy',
    qty: 12,
    unitAvg: 20,
  });
  h.bus.emit('economy:tradeCompleted', {
    stationId: params.destStationId,
    commodityId: params.commodityId,
    side: 'sell',
    qty: 12,
    unitAvg: 21, // 21 <= 21.6
  });
  assert.equal(leaf(h).steps.spread_counterplay.status, STEP_STATUS.ACTIVE);
  assert.equal(leaf(h).stepId, 'spread_counterplay');
});

test('H3-receipt-gate: double complete grants stamp once', () => {
  const h = makeHarness();
  activateOnStep(h, 3);
  h.hauler.applySignal({ kind: 'complete', receiptId: 'spread_fixed' });
  const n1 = grantCreditsCount(h.intents);
  h.hauler.applySignal({ kind: 'complete', receiptId: 'spread_fixed', stepId: 'spread_counterplay' });
  assert.equal(grantCreditsCount(h.intents), n1);
});

// ── H4 infrastructure ────────────────────────────────────────────────────────

test('H4-complete: final step completes ladder and emits boom forceEvent once', () => {
  const h = makeHarness();
  activateOnStep(h, 4);
  const beatBefore = h.state.story.beatIndex;
  const missionId = leaf(h).steps.lane_infrastructure.payload.missionId;
  h.bus.emit('mission:completed', { missionId, type: 'cargo_delivery' });
  assert.equal(leaf(h).status, LADDER_STATUS.COMPLETED);
  assert.equal(leaf(h).rewardsGranted, true);
  const booms = h.intents.filter((i) => (
    i.event === 'mission:forceEvent' && i.payload && i.payload.type === 'boom'
  ));
  assert.ok(booms.length >= 1, 'boom on complete');
  // Idempotent boom receipt.
  const again = emitInfrastructureBoom(leaf(h), 'lane_infrastructure', h.bus);
  assert.equal(again.duplicate, true);
  assert.equal(h.state.story.beatIndex, beatBefore);
});

test('H4-complete alternate: mining:bulkHaulDelivered settles infrastructure', () => {
  const h = makeHarness();
  activateOnStep(h, 4);
  h.bus.emit('mining:bulkHaulDelivered', {
    stationId: 'station_ceres',
    storyTag: haulerLadderStoryTag('lane_infrastructure'),
  });
  assert.equal(leaf(h).status, LADDER_STATUS.COMPLETED);
});

test('H4-save-roundtrip: mid-step serialize/deserialize preserves payload + origins peer', () => {
  const h = makeHarness(4242);
  activateOnStep(h, 2);
  leaf(h).steps.risk_lane_tax.payload.choiceId = 'veer_slip';
  const missionId = leaf(h).steps.risk_lane_tax.payload.missionId;
  const blob = h.hauler.serialize();
  assert.equal(blob.schemaId, CAREER_LADDERS_SCHEMA_ID);
  assert.ok(blob.ladders.hauler);

  const restored = createGameState(4242);
  restored.simTime = 100;
  restored.careers = {
    origins: {
      hauler: { status: 'completed' },
      hunter: { status: 'idle' },
    },
    guildRank: { keep: true },
  };
  clearLadderDefinitions();
  const ladders2 = createCareerLaddersSystem();
  ladders2.init({ state: restored, bus: createBus(), registry: { get: () => null } });
  registerHaulerLadder();
  ladders2.deserialize(structuredClone(blob));

  const restoredLeaf = restored.careers.ladders.hauler;
  assert.equal(restoredLeaf.status, LADDER_STATUS.ACTIVE);
  assert.equal(restoredLeaf.stepId, 'risk_lane_tax');
  assert.equal(restoredLeaf.steps.risk_lane_tax.payload.missionId, missionId);
  assert.equal(restoredLeaf.steps.risk_lane_tax.payload.choiceId, 'veer_slip');
  assert.equal(restored.careers.origins.hauler.status, 'completed');
  assert.equal(restored.careers.guildRank.keep, true);
});

test('H4-no-story-touch: full ladder never mutates story.beatIndex or player owners', () => {
  const h = makeHarness();
  const beat = h.state.story.beatIndex;
  const credits = h.state.player.credits;
  const heat = h.state.player.heat;
  const cargo = JSON.stringify(h.state.player.cargo);
  activateOnStep(h, 0);
  for (let i = 0; i < 5; i += 1) {
    h.hauler.applySignal({ kind: 'complete' });
  }
  assert.equal(h.state.story.beatIndex, beat);
  assert.equal(h.state.player.credits, credits);
  assert.equal(h.state.player.heat, heat);
  assert.equal(JSON.stringify(h.state.player.cargo), cargo);
  assert.ok(h.intents.every((i) => !isForbiddenHeatRewardIntent(i.event)));
  assert.ok(h.intents.some((i) => i.event === LADDER_REWARD_EVENTS.GRANT_CREDITS));
  assert.ok(h.intents.some((i) => i.event === LADDER_REWARD_EVENTS.REP_DELTA));
  assert.equal(leaf(h).status, LADDER_STATUS.COMPLETED);
});

// ── determinism / mission offer shape ────────────────────────────────────────

test('deterministic mission ids and step seeds are stable for seed', () => {
  const a = haulerLadderMissionId(9001, 'broker_desk', 1, 0);
  const b = haulerLadderMissionId(9001, 'broker_desk', 1, 0);
  const c = haulerLadderMissionId(9002, 'broker_desk', 1, 0);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(haulerLadderStepSeed(1, 'risk_lane_tax', 3), haulerLadderStepSeed(1, 'risk_lane_tax', 3));
  const offer = buildHaulerLadderMissionOffer(
    { meta: { seed: 9 }, simTime: 10 },
    'broker_desk',
    0,
    1,
  );
  assert.equal(offer.storyTag, 'ladder.hauler:broker_desk');
  assert.equal(offer.ladderCareer, 'hauler');
  assert.equal(offer.type, 'cargo_delivery');
  assert.ok(offer.id.startsWith('mo_ladder_hauler_'));
});

test('test vector catalog covers draft H0–H4 ids', () => {
  const ids = HAULER_LADDER_TEST_VECTORS.map((v) => v.id);
  for (const need of [
    'H0-success', 'H0-fail-deadline', 'H0-idempotent-reward',
    'H1-success', 'H1-escortee-lost',
    'H2-fragile-fail', 'H2-blockade-inject',
    'H3-spread-ok',
    'H4-complete', 'H4-no-story-touch',
  ]) {
    assert.ok(ids.includes(need), `missing vector ${need}`);
  }
});

test('attempt mult table floors at 0.7 across recovery', () => {
  const h = makeHarness();
  activateOnStep(h, 0);
  h.hauler.applySignal({ kind: 'fail', code: 'deadline' });
  assert.equal(leaf(h).attemptMult, 0.85);
  h.state.simTime = (leaf(h).recoverReadyAtS || 0) + 1;
  h.hauler.recover();
  h.hauler.applySignal({ kind: 'fail', code: 'deadline' });
  assert.equal(leaf(h).attemptMult, 0.7);
  h.state.simTime = (leaf(h).recoverReadyAtS || 0) + 1;
  h.hauler.recover();
  h.hauler.applySignal({ kind: 'fail', code: 'deadline' });
  assert.equal(leaf(h).attemptMult, 0.7);
});
test('framework contract module still importable after branch load', async () => {
  // Ensure branch modules do not break framework exports.
  clearLadderDefinitions();
  assert.equal(typeof registerLadderDefinition, 'function');
  assert.equal(typeof createCareerLaddersSystem, 'function');
  assert.equal(validateHaulerLadderDefinition().ok, true);
});
