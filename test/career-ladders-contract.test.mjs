// CL-00 career ladder framework contract tests (repair: DEF-01..05).
// Run: node --test test/career-ladders-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { save } from '../src/save/saveSystem.js';
import { MIGRATIONS, CURRENT_VERSION } from '../src/save/migrations.js';
import {
  CAREER_LADDERS_SCHEMA_ID,
  CAREER_LADDERS_SCHEMA_VERSION,
  LADDER_STATUS,
  clearLadderDefinitions,
  createCareerLaddersSystem,
  createEmptyCareerLaddersBlob,
  ensureCareerLaddersState,
  getLadderDefinition,
  listLadderDefinitions,
  migrateCareerLaddersBlob,
  registerLadderDefinition,
  seedCareerLaddersOnData,
  deserializeCareerLadders,
  validateLadderDefinition,
} from '../src/careers/ladders/careerLadders.js';
import {
  assertNoNondeterminism,
  attemptMultiplier,
  buildChoiceConsequenceIntents,
  buildRewardIntents,
  computeLadderRngSeed,
  hasReceipt,
  grantReceipt,
  isForbiddenHeatEvent,
  LADDER_REWARD_EVENTS,
  STEP_STATUS,
} from '../src/careers/ladders/ladderShared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function makeFixtureDef(overrides = {}) {
  return {
    careerId: 'fixture_runner',
    title: 'Fixture Runner',
    nonBinding: true,
    steps: [
      {
        id: 'step_a',
        index: 0,
        title: 'Alpha',
        prerequisites: [{ type: 'always' }],
        rewards: { credits: 200, rep: [{ factionId: 'faction_mts', delta: 2 }] },
        recovery: { cooldownS: 10, hint: 'Retry the alpha leg.' },
        choices: [
          {
            id: 'spare_parts',
            label: 'Spare parts',
            consequences: [
              {
                event: LADDER_REWARD_EVENTS.REP_DELTA,
                payload: { factionId: 'faction_mts', delta: 1, reason: 'choice' },
              },
            ],
          },
          {
            id: 'cut_corners',
            label: 'Cut corners',
            // Canonical charge intent only — heat:delta is forbidden until a heat owner seam exists.
            consequences: [
              {
                event: LADDER_REWARD_EVENTS.CHARGE_CREDITS,
                payload: { amount: 50, reason: 'cut_corners' },
              },
            ],
          },
        ],
      },
      {
        id: 'step_b',
        index: 1,
        title: 'Bravo',
        prerequisites: [{ type: 'ladderStepDone', careerId: 'fixture_runner', stepId: 'step_a' }],
        rewards: { credits: 300 },
        recovery: { cooldownS: 5, hint: 'Rebook bravo.' },
      },
      {
        id: 'step_c',
        index: 2,
        title: 'Charlie',
        rewards: { credits: 400 },
      },
      {
        id: 'step_d',
        index: 3,
        title: 'Delta',
        rewards: { credits: 250 },
      },
      {
        id: 'step_e',
        index: 4,
        title: 'Echo',
        rewards: { credits: 350 },
      },
    ],
    completionBonus: { credits: 1000, rep: [{ factionId: 'faction_mts', delta: 5 }] },
    ...overrides,
  };
}

function makeHarness(seed = 4201) {
  clearLadderDefinitions();
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 100;
  state.tick = 6000;
  state.player = state.player || {};
  state.player.credits = 1000;
  state.player.heat = 0;
  state.player.cargo = state.player.cargo || { items: {}, usedVolume: 0, usedMass: 0 };
  state.careers = state.careers || {};
  state.careers.origins = {
    __meta: { schemaId: 'spaceface.careerOrigins.v1', schemaVersion: 1 },
    hauler: { status: 'completed' },
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
      || isForbiddenHeatEvent(event)
    ) {
      intents.push({ event, payload });
    }
    return origEmit(event, payload);
  };
  const system = createCareerLaddersSystem();
  system.init({ state, bus, registry: { get: () => null } });
  clearLadderDefinitions();
  assert.equal(registerLadderDefinition(makeFixtureDef()).ok, true);
  system.init({ state, bus, registry: { get: () => null } });
  return { state, bus, system, intents, events, seed };
}

test('candidate modules exist under allowlist paths', () => {
  for (const rel of [
    'src/careers/ladders/ladderShared.js',
    'src/careers/ladders/ladderSchema.js',
    'src/careers/ladders/careerLadders.js',
    'test/career-ladders-contract.test.mjs',
  ]) {
    assert.equal(existsSync(join(repoRoot, rel)), true, `missing ${rel}`);
  }
});

test('no Math.random or Date.now in ladder modules', () => {
  for (const rel of [
    'src/careers/ladders/ladderShared.js',
    'src/careers/ladders/ladderSchema.js',
    'src/careers/ladders/careerLadders.js',
  ]) {
    const src = readFileSync(join(repoRoot, rel), 'utf8');
    const flags = assertNoNondeterminism(src);
    assert.equal(flags.hasMathRandom, false, rel);
    assert.equal(flags.hasDateNow, false, rel);
  }
});

test('invalid definitions are rejected', () => {
  clearLadderDefinitions();
  assert.equal(validateLadderDefinition(null).ok, false);
  assert.equal(validateLadderDefinition({}).ok, false);
  assert.equal(validateLadderDefinition({
    careerId: 'x', title: 'X', nonBinding: false, steps: [{ id: 'a' }],
  }).ok, false);
  assert.equal(validateLadderDefinition({
    careerId: 'x', title: 'X', steps: [{ id: 'a' }, { id: 'a' }],
  }).ok, false);
  assert.equal(registerLadderDefinition({ careerId: 'x' }).ok, false);
  assert.equal(listLadderDefinitions().length, 0);
});

test('DEF-04: definition validation rejects bare cargo/heat/beatIndex and direct-write keys', () => {
  clearLadderDefinitions();
  const base = { careerId: 'bad_runner', title: 'Bad', nonBinding: true };

  const cases = [
    { rewards: { cargo: { ore: 1 } }, needle: 'cargo' },
    { rewards: { heat: 0.2 }, needle: 'heat' },
    { rewards: { beatIndex: 3 }, needle: 'beatIndex' },
    { rewards: { 'player.credits': 50 }, needle: 'player.credits' },
    { rewards: { 'player.cargo': {} }, needle: 'player.cargo' },
    { rewards: { 'player.heat': 1 }, needle: 'player.heat' },
    { rewards: { credits_write: 10 }, needle: 'credits_write' },
    { rewards: { unknownKey: 1 }, needle: 'unknown' },
  ];

  for (const c of cases) {
    const v = validateLadderDefinition({
      ...base,
      steps: [{ id: 's0', rewards: c.rewards }],
    });
    assert.equal(v.ok, false, `expected reject for ${JSON.stringify(c.rewards)}`);
    assert.ok(
      v.errors.some((e) => e.includes(c.needle) || e.includes('forbidden') || e.includes('unknown')),
      `errors should mention ${c.needle}: ${v.errors.join('; ')}`,
    );
  }

  const heatChoice = validateLadderDefinition({
    ...base,
    steps: [{
      id: 's0',
      choices: [{
        id: 'bad_heat',
        consequences: [{ event: 'heat:delta', payload: { delta: 0.1 } }],
      }],
    }],
  });
  assert.equal(heatChoice.ok, false);
  assert.ok(heatChoice.errors.some((e) => e.includes('heat')));

  const ok = validateLadderDefinition({
    ...base,
    steps: [{
      id: 's0',
      rewards: {
        credits: 100,
        chargeCredits: 10,
        rep: [{ factionId: 'faction_mts', delta: 1 }],
        intents: [{ event: LADDER_REWARD_EVENTS.GRANT_CREDITS, payload: { amount: 5, reason: 'x' } }],
      },
    }],
  });
  assert.equal(ok.ok, true, ok.errors && ok.errors.join('; '));
});

test('DEF-02: no heat:delta advertisement; heat consequences omitted at emit', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(LADDER_REWARD_EVENTS, 'HEAT_DELTA'), false);
  assert.ok(!Object.values(LADDER_REWARD_EVENTS).includes('heat:delta'));
  assert.equal(isForbiddenHeatEvent('heat:delta'), true);

  const omitted = buildChoiceConsequenceIntents({
    consequences: [
      { event: 'heat:delta', payload: { delta: 0.05 } },
      { event: LADDER_REWARD_EVENTS.REP_DELTA, payload: { factionId: 'faction_mts', delta: -1 } },
    ],
  });
  assert.equal(omitted.length, 1);
  assert.equal(omitted[0].event, LADDER_REWARD_EVENTS.REP_DELTA);

  const badIntents = buildRewardIntents('c', 's', {
    intents: [{ event: 'heat:delta', payload: { delta: 1 } }],
  });
  assert.equal(badIntents.length, 0);

  const { system, intents, events } = makeHarness();
  system.offer('fixture_runner', { ignorePrereqs: true });
  system.accept('fixture_runner', { ignorePrereqs: true });
  system.choose('fixture_runner', 'cut_corners');
  assert.ok(intents.every((i) => !isForbiddenHeatEvent(i.event)));
  assert.ok(events.every((e) => !isForbiddenHeatEvent(e.event)));
  assert.ok(intents.some((i) => i.event === LADDER_REWARD_EVENTS.CHARGE_CREDITS));
});

test('duplicate careerId registration is rejected', () => {
  clearLadderDefinitions();
  assert.equal(registerLadderDefinition(makeFixtureDef()).ok, true);
  assert.deepEqual(registerLadderDefinition(makeFixtureDef()), {
    ok: false, reason: 'duplicate_careerId', careerId: 'fixture_runner',
  });
});

test('generic five-step definition registers without hardcoding roles', () => {
  clearLadderDefinitions();
  const def = makeFixtureDef();
  assert.equal(def.steps.length, 5);
  assert.equal(registerLadderDefinition(def).ok, true);
  assert.equal(getLadderDefinition('fixture_runner').steps.length, 5);
  assert.equal(getLadderDefinition('hauler'), null);
  assert.equal(getLadderDefinition('hunter'), null);
  assert.equal(getLadderDefinition('prospector'), null);
});

test('attempt multiplier floors at 0.7', () => {
  assert.equal(attemptMultiplier(0), 1);
  assert.equal(attemptMultiplier(1), 0.85);
  assert.equal(attemptMultiplier(2), 0.7);
  assert.equal(attemptMultiplier(9), 0.7);
});

test('reward intents never write credits/cargo/rep/heat directly', () => {
  const { state, system, intents } = makeHarness();
  const creditsBefore = state.player.credits;
  const heatBefore = state.player.heat;
  const cargoBefore = JSON.stringify(state.player.cargo);

  system.offer('fixture_runner', { ignorePrereqs: true });
  system.accept('fixture_runner', { ignorePrereqs: true });
  system.applySignal('fixture_runner', { kind: 'complete' });

  assert.equal(state.player.credits, creditsBefore);
  assert.equal(state.player.heat, heatBefore);
  assert.equal(JSON.stringify(state.player.cargo), cargoBefore);

  assert.ok(intents.some((i) => i.event === LADDER_REWARD_EVENTS.GRANT_CREDITS));
  assert.ok(intents.some((i) => i.event === LADDER_REWARD_EVENTS.REP_DELTA));
  assert.ok(intents.every((i) => i.event !== 'economy:writeCredits'));
  assert.ok(intents.every((i) => !isForbiddenHeatEvent(i.event)));
});

test('duplicate receipts are idempotent (no double pay intents)', () => {
  const { system, intents } = makeHarness();
  system.offer('fixture_runner', { ignorePrereqs: true });
  system.accept('fixture_runner', { ignorePrereqs: true });
  const first = system.applySignal('fixture_runner', {
    kind: 'complete',
    receiptId: 'fixed_receipt_step_a',
  });
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, undefined);
  const grantCount1 = intents.filter((i) => i.event === LADDER_REWARD_EVENTS.GRANT_CREDITS).length;
  const second = system.applySignal('fixture_runner', {
    kind: 'complete',
    receiptId: 'fixed_receipt_step_a',
  });
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  const grantCount2 = intents.filter((i) => i.event === LADDER_REWARD_EVENTS.GRANT_CREDITS).length;
  assert.equal(grantCount2, grantCount1);
});

test('reload mid-step preserves active step and receipts', () => {
  const { state, system } = makeHarness(777);
  system.offer('fixture_runner', { ignorePrereqs: true });
  system.accept('fixture_runner', { ignorePrereqs: true });
  system.applySignal('fixture_runner', { kind: 'complete' });
  assert.equal(state.careers.ladders.fixture_runner.stepId, 'step_b');
  assert.equal(state.careers.ladders.fixture_runner.status, LADDER_STATUS.ACTIVE);

  const blob = system.serialize();
  assert.equal(blob.schemaId, CAREER_LADDERS_SCHEMA_ID);
  assert.equal(blob.schemaVersion, CAREER_LADDERS_SCHEMA_VERSION);

  const restored = createGameState(777);
  restored.simTime = 100;
  restored.careers = { origins: { hauler: { status: 'completed' } }, guildRank: { x: 1 } };
  const system2 = createCareerLaddersSystem();
  system2.init({ state: restored, bus: createBus(), registry: { get: () => null } });
  system2.deserialize(structuredClone(blob));

  assert.equal(restored.careers.ladders.fixture_runner.stepId, 'step_b');
  assert.equal(restored.careers.ladders.fixture_runner.status, LADDER_STATUS.ACTIVE);
  assert.equal(restored.careers.ladders.fixture_runner.steps.step_a.status, STEP_STATUS.DONE);
  assert.equal(restored.careers.guildRank.x, 1, 'peer careers preserved');
  assert.deepEqual(system2.serialize().ladders.fixture_runner.stepId, 'step_b');
});

test('DEF-03: version=11 missing careerLadders defaults via deserialize (no v12 claim)', () => {
  assert.equal(CURRENT_VERSION, 11, 'live CURRENT_VERSION must remain 11; this packet does not bump v12');

  const mig910 = MIGRATIONS.find((m) => m.from === 9 && m.to === 10);
  assert.ok(mig910, 'v9→v10 origins migration still present');
  const payload910 = {};
  mig910.fn(payload910);
  assert.ok(payload910.careerOrigins, 'origins still seeded on v9→v10');
  assert.equal(
    Object.prototype.hasOwnProperty.call(payload910, 'careerLadders'),
    false,
    'v9→v10 must not piggyback careerLadders as live seed',
  );

  const v11Data = { meta: { seed: 42 } };
  let v = 11;
  let guard = 0;
  while (v < CURRENT_VERSION && guard++ < 64) {
    const step = MIGRATIONS.find((m) => m.from === v);
    if (!step) break;
    step.fn(v11Data);
    v = step.to;
  }
  assert.equal(Object.prototype.hasOwnProperty.call(v11Data, 'careerLadders'), false);

  const state = createGameState(42);
  state.careers = {
    origins: { hauler: { status: 'completed' }, hunter: { status: 'idle' } },
  };
  const empty = migrateCareerLaddersBlob(null);
  assert.equal(empty.schemaId, CAREER_LADDERS_SCHEMA_ID);
  assert.ok(empty.ladders.__meta);

  deserializeCareerLadders(state, undefined);
  assert.ok(state.careers.ladders.__meta, 'missing key defaults via deserialize');
  assert.equal(state.careers.origins.hauler.status, 'completed', 'origins peer preserved');

  const data = { meta: { seed: 1 } };
  seedCareerLaddersOnData(data);
  assert.equal(data.careerLadders.schemaId, CAREER_LADDERS_SCHEMA_ID);

  assert.equal(MIGRATIONS.some((m) => m.from === 11 && m.to === 12), false);
});

test('deterministic replay: same seed + signals → identical history hash', () => {
  function play(seed) {
    clearLadderDefinitions();
    const state = createGameState(seed);
    state.simTime = 50;
    const bus = createBus();
    const system = createCareerLaddersSystem();
    system.init({ state, bus, registry: { get: () => null } });
    registerLadderDefinition(makeFixtureDef());
    system.init({ state, bus, registry: { get: () => null } });
    system.offer('fixture_runner', { ignorePrereqs: true });
    system.accept('fixture_runner', { ignorePrereqs: true });
    system.choose('fixture_runner', 'spare_parts');
    system.applySignal('fixture_runner', { kind: 'complete', receiptId: 'r1' });
    system.applySignal('fixture_runner', { kind: 'fail', code: 'timeout', receiptId: 'f1' });
    state.simTime = 70;
    system.recover('fixture_runner', { force: true });
    system.applySignal('fixture_runner', { kind: 'complete', receiptId: 'r2' });
    const leaf = state.careers.ladders.fixture_runner;
    return {
      history: structuredClone(leaf.history),
      receipts: structuredClone(leaf.receipts),
      stepId: leaf.stepId,
      status: leaf.status,
      rngSeed: leaf.rngSeed,
      ladderSeed: computeLadderRngSeed(seed, 'fixture_runner'),
    };
  }
  const a = play(9001);
  const b = play(9001);
  const c = play(9002);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.ladderSeed, c.ladderSeed);
});

test('origins remain non-binding peers; ladders do not wipe origins', () => {
  const { state, system } = makeHarness();
  assert.equal(state.careers.origins.hauler.status, 'completed');
  system.offer('fixture_runner', { ignorePrereqs: true });
  system.accept('fixture_runner', { ignorePrereqs: true });
  assert.equal(state.careers.origins.hauler.status, 'completed');
  assert.equal(state.careers.origins.hunter.status, 'idle');
  assert.equal(state.careers.ladders.fixture_runner.flags.blocksOtherCareers, false);
  assert.equal(state.careers.ladders.fixture_runner.nonBinding, true);

  system.newGame();
  assert.ok(state.careers.origins, 'newGame on ladders must not delete origins object when only ladders reset');
  assert.ok(state.careers.ladders.__meta);
  const leaf = state.careers.ladders.fixture_runner;
  assert.ok(leaf);
  assert.equal(leaf.status, LADDER_STATUS.LATENT);
});

test('failure + recovery path works with cooldown gate', () => {
  const { state, system } = makeHarness();
  system.offer('fixture_runner', { ignorePrereqs: true });
  system.accept('fixture_runner', { ignorePrereqs: true });
  const fail = system.applySignal('fixture_runner', { kind: 'fail', code: 'deadline' });
  assert.equal(fail.ok, true);
  assert.equal(state.careers.ladders.fixture_runner.status, LADDER_STATUS.RECOVERING);
  const early = system.recover('fixture_runner');
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'cooldown');
  state.simTime = 200;
  const ok = system.recover('fixture_runner');
  assert.equal(ok.ok, true);
  assert.equal(state.careers.ladders.fixture_runner.status, LADDER_STATUS.ACTIVE);
  assert.equal(state.careers.ladders.fixture_runner.attemptMult, 0.85);
});

test('branch choice emits consequence intents only once', () => {
  const { system, intents } = makeHarness();
  system.offer('fixture_runner', { ignorePrereqs: true });
  system.accept('fixture_runner', { ignorePrereqs: true });
  const r1 = system.choose('fixture_runner', 'cut_corners');
  assert.equal(r1.ok, true);
  const charge1 = intents.filter((i) => i.event === LADDER_REWARD_EVENTS.CHARGE_CREDITS).length;
  const r2 = system.choose('fixture_runner', 'cut_corners');
  assert.equal(r2.duplicate, true);
  const charge2 = intents.filter((i) => i.event === LADDER_REWARD_EVENTS.CHARGE_CREDITS).length;
  assert.equal(charge2, charge1);
  assert.ok(intents.every((i) => !isForbiddenHeatEvent(i.event)));
});

test('full five-step ladder completion grants completion bonus intent once', () => {
  const { state, system, intents } = makeHarness();
  system.offer('fixture_runner', { ignorePrereqs: true });
  system.accept('fixture_runner', { ignorePrereqs: true });
  for (let i = 0; i < 5; i += 1) {
    const r = system.applySignal('fixture_runner', { kind: 'complete', receiptId: `done_${i}` });
    assert.equal(r.ok, true, `step ${i}: ${r.reason}`);
  }
  assert.equal(state.careers.ladders.fixture_runner.status, LADDER_STATUS.COMPLETED);
  assert.equal(state.careers.ladders.fixture_runner.rewardsGranted, true);
  const completeGrants = intents.filter(
    (i) => i.event === LADDER_REWARD_EVENTS.GRANT_CREDITS
      && i.payload && String(i.payload.reason).endsWith(':complete'),
  );
  assert.equal(completeGrants.length, 1);
  assert.equal(completeGrants[0].payload.amount, 1000);
});

test('DEF-01: createRegistry systems + updateOrder place careerLadders after careerOrigins', () => {
  const state = createGameState(1);
  const bus = createBus();
  const ctx = { state, bus, helpers: {}, registry: null };
  const registry = createRegistry(ctx);
  ctx.registry = registry;

  const systemNames = registry.systems.map((s) => s.name);
  const oSys = systemNames.indexOf('careerOrigins');
  const lSys = systemNames.indexOf('careerLadders');
  assert.ok(oSys >= 0, 'careerOrigins in SYSTEMS');
  assert.ok(lSys >= 0, 'careerLadders in SYSTEMS');
  assert.ok(oSys < lSys, 'careerOrigins before careerLadders in SYSTEMS');

  assert.equal(registry.get('careerOrigins').name, 'careerOrigins');
  assert.equal(registry.get('careerLadders').name, 'careerLadders');

  assert.ok(Array.isArray(registry.updateOrder), 'updateOrder exposed for behavioral order check');
  const updateNames = registry.updateOrder.map((s) => s.name);
  const oUp = updateNames.indexOf('careerOrigins');
  const lUp = updateNames.indexOf('careerLadders');
  assert.ok(oUp >= 0 && lUp >= 0, 'both in UPDATE_ORDER');
  assert.ok(oUp < lUp, 'careerOrigins before careerLadders in UPDATE_ORDER');
});

test('DEF-01/05: full save serializeData + _callDeserialize preserves mid-step + origins peer', () => {
  clearLadderDefinitions();
  assert.equal(registerLadderDefinition(makeFixtureDef()).ok, true);

  const state = createGameState(555);
  state.mode = 'flight';
  state.simTime = 120;
  state.player = state.player || {};
  state.player.credits = 2500;
  state.careers = {
    origins: {
      __meta: { schemaId: 'spaceface.careerOrigins.v1', schemaVersion: 1 },
      hauler: { status: 'completed', receiptId: 'origin_hauler_done' },
      hunter: { status: 'idle' },
    },
  };

  const bus = createBus();
  const ladderSys = createCareerLaddersSystem();
  ladderSys.init({ state, bus, registry: { get: () => null } });
  ladderSys.offer('fixture_runner', { ignorePrereqs: true });
  ladderSys.accept('fixture_runner', { ignorePrereqs: true });
  ladderSys.applySignal('fixture_runner', { kind: 'complete', receiptId: 'env_step_a' });

  const leafBefore = state.careers.ladders.fixture_runner;
  assert.equal(leafBefore.stepId, 'step_b');
  assert.equal(leafBefore.status, LADDER_STATUS.ACTIVE);
  assert.equal(leafBefore.receipts.env_step_a, true);
  const originsSnapshot = structuredClone(state.careers.origins);

  const originsSys = {
    name: 'careerOrigins',
    serialize() {
      return structuredClone(state.careers.origins);
    },
    deserialize(blob) {
      if (!state.careers) state.careers = {};
      if (blob && typeof blob === 'object') {
        state.careers.origins = structuredClone(blob);
      }
    },
  };

  const registry = {
    get(name) {
      if (name === 'careerLadders') return ladderSys;
      if (name === 'careerOrigins') return originsSys;
      return null;
    },
  };

  save.init({ state, bus, helpers: {}, registry });
  const data = save.serializeData();
  assert.ok(data.careerLadders, 'serializeData includes careerLadders');
  assert.equal(data.careerLadders.schemaId, CAREER_LADDERS_SCHEMA_ID);
  assert.equal(data.careerLadders.ladders.fixture_runner.stepId, 'step_b');
  assert.equal(data.careerLadders.ladders.fixture_runner.status, LADDER_STATUS.ACTIVE);
  assert.equal(data.careerLadders.ladders.fixture_runner.receipts.env_step_a, true);
  assert.ok(data.careerOrigins, 'serializeData includes careerOrigins peer');
  assert.equal(data.careerOrigins.hauler.status, 'completed');

  const state2 = createGameState(555);
  state2.mode = 'flight';
  state2.simTime = 120;
  state2.careers = {
    origins: { hauler: { status: 'wiped' } },
    guildRank: { keep: true },
  };
  const ladderSys2 = createCareerLaddersSystem();
  ladderSys2.init({ state: state2, bus: createBus(), registry: { get: () => null } });
  const originsSys2 = {
    name: 'careerOrigins',
    serialize() { return structuredClone(state2.careers.origins); },
    deserialize(blob) {
      if (!state2.careers) state2.careers = {};
      if (blob && typeof blob === 'object') state2.careers.origins = structuredClone(blob);
    },
  };
  const registry2 = {
    get(name) {
      if (name === 'careerLadders') return ladderSys2;
      if (name === 'careerOrigins') return originsSys2;
      return null;
    },
  };
  save.init({ state: state2, bus: createBus(), helpers: {}, registry: registry2 });
  save._callDeserialize('careerOrigins', structuredClone(data.careerOrigins));
  save._callDeserialize('careerLadders', structuredClone(data.careerLadders));

  const leaf = state2.careers.ladders.fixture_runner;
  assert.equal(leaf.stepId, 'step_b');
  assert.equal(leaf.status, LADDER_STATUS.ACTIVE);
  assert.equal(leaf.receipts.env_step_a, true);
  assert.equal(leaf.steps.step_a.status, STEP_STATUS.DONE);
  assert.equal(state2.careers.origins.hauler.status, 'completed');
  assert.equal(state2.careers.origins.hauler.receiptId, 'origin_hauler_done');
  assert.deepEqual(state2.careers.origins, originsSnapshot);
  assert.equal(state2.careers.guildRank.keep, true, 'unrelated peer career keys preserved');
});

test('buildRewardIntents scales with attempt mult', () => {
  const intents = buildRewardIntents('c', 's', { credits: 200 }, 0.7, 'test');
  assert.equal(intents[0].payload.amount, 140);
});

test('receipt helpers guard idempotency at leaf level', () => {
  const own = { receipts: {} };
  assert.equal(grantReceipt(own, 'x'), true);
  assert.equal(hasReceipt(own, 'x'), true);
  assert.equal(grantReceipt(own, 'x'), false);
});

test('empty serialize defaults and Continue parity from missing blob', () => {
  clearLadderDefinitions();
  const state = createGameState(1);
  const system = createCareerLaddersSystem();
  system.init({ state, bus: createBus() });
  const blob = system.serialize();
  assert.equal(blob.schemaId, CAREER_LADDERS_SCHEMA_ID);
  assert.ok(blob.ladders.__meta);

  const state2 = createGameState(2);
  system.state = state2;
  system.deserialize(null);
  assert.ok(state2.careers.ladders.__meta);
  assert.deepEqual(createEmptyCareerLaddersBlob().schemaId, CAREER_LADDERS_SCHEMA_ID);
});

test('soft unlock via originCompleted prerequisite', () => {
  const { state, system } = makeHarness();
  clearLadderDefinitions();
  const def = makeFixtureDef({
    steps: [
      {
        id: 'gated',
        index: 0,
        prerequisites: [{ type: 'originCompleted', careerId: 'hauler' }],
        rewards: { credits: 100 },
      },
    ],
  });
  assert.equal(registerLadderDefinition(def).ok, true);
  system.init({ state, bus: createBus() });
  state.careers.origins.hauler.status = 'completed';
  const offered = system.offer('fixture_runner');
  assert.equal(offered.ok, true);

  state.careers.origins.hauler.status = 'idle';
  state.careers.ladders.fixture_runner.status = LADDER_STATUS.LATENT;
  const blocked = system.offer('fixture_runner');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'prerequisites_unmet');
});

test('cleanup definition registry', () => {
  clearLadderDefinitions();
  assert.equal(listLadderDefinitions().length, 0);
});
