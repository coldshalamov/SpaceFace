import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  LADDER_STATUS,
  clearLadderDefinitions,
  createCareerLaddersSystem,
} from '../src/careers/ladders/careerLadders.js';
import { LADDER_REWARD_EVENTS, STEP_STATUS } from '../src/careers/ladders/ladderShared.js';
import {
  HAULER_LADDER_DEF,
  HAULER_LADDER_STEP_IDS,
} from '../src/careers/ladders/haulerLadderDefs.js';
import { createHaulerLadderSystem } from '../src/careers/ladders/haulerLadderFsm.js';
import {
  HUNTER_LADDER_DEF,
  HUNTER_LADDER_STEP_IDS,
} from '../src/careers/ladders/hunterLadderDefs.js';
import { createHunterLadderFsm } from '../src/careers/ladders/hunterLadderFsm.js';
import {
  PROSPECTOR_LADDER_DEF,
  PROSPECTOR_LADDER_STEP_IDS,
} from '../src/careers/ladders/prospectorLadderDefs.js';
import {
  createProspectorLadderSystem,
  resetProspectorLadderRegistration,
} from '../src/careers/ladders/prospectorLadderFsm.js';
import { buildMissionLogCareerChip } from '../src/ui/careerLadderView.js';

const CAPSTONE_ID = 'role_hull_capstone';
const REWARD_EVENTS = new Set([
  LADDER_REWARD_EVENTS.GRANT_CREDITS,
  LADDER_REWARD_EVENTS.CHARGE_CREDITS,
  LADDER_REWARD_EVENTS.REP_DELTA,
]);

const CAREERS = Object.freeze([
  Object.freeze({
    careerId: 'hauler',
    targetDefId: 'ship_mule',
    targetName: 'Mule',
    definition: HAULER_LADDER_DEF,
    stepIds: HAULER_LADDER_STEP_IDS,
    createBranch: (ladders) => createHaulerLadderSystem({ ladders }),
  }),
  Object.freeze({
    careerId: 'hunter',
    targetDefId: 'ship_wasp',
    targetName: 'Wasp',
    definition: HUNTER_LADDER_DEF,
    stepIds: HUNTER_LADDER_STEP_IDS,
    createBranch: (ladders) => createHunterLadderFsm({ ladders }),
  }),
  Object.freeze({
    careerId: 'prospector',
    targetDefId: 'ship_pelican',
    targetName: 'Pelican',
    definition: PROSPECTOR_LADDER_DEF,
    stepIds: PROSPECTOR_LADDER_STEP_IDS,
    createBranch: (ladders) => createProspectorLadderSystem({ ladders }),
  }),
]);

function makeHarness(spec, ownedDefIds = ['ship_kestrel'], seed = 0xC4A5_0001) {
  clearLadderDefinitions();
  resetProspectorLadderRegistration();

  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 120;
  state.player.ownedShips = ownedDefIds.map((defId) => ({ defId, fittings: [] }));
  state.careers = state.careers || {};
  state.careers.origins = {
    __meta: { schemaId: 'spaceface.careerOrigins.v1', schemaVersion: 1 },
    hauler: { status: 'completed' },
    hunter: { status: 'completed' },
    prospector: { status: 'completed' },
  };

  const bus = createBus();
  const events = [];
  const rewards = [];
  const originalEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    events.push({ event, payload });
    if (REWARD_EVENTS.has(event)) rewards.push({ event, payload });
    return originalEmit(event, payload);
  };

  const ladders = createCareerLaddersSystem();
  const registry = { get: (name) => (name === 'careerLadders' ? ladders : null) };
  ladders.init({ state, bus, registry });
  const branch = spec.createBranch(ladders);
  branch.init({ state, bus, registry, ladders });

  return { state, bus, events, rewards, ladders, branch, registry };
}

function leaf(h, careerId) {
  return h.state.careers.ladders[careerId];
}

function advanceToCapstone(h, spec) {
  assert.equal(h.branch.offer({ ignorePrereqs: true }).ok, true);
  assert.equal(h.branch.accept({ ignorePrereqs: true }).ok, true);
  for (let index = 0; index < 5; index += 1) {
    const current = leaf(h, spec.careerId);
    assert.equal(current.stepId, spec.stepIds[index], `${spec.careerId} step ${index}`);
    const result = h.ladders.applySignal(spec.careerId, {
      kind: 'complete',
      receiptId: `test-step:${spec.careerId}:${current.stepId}`,
    });
    assert.equal(result.ok, true, `${spec.careerId} advance ${current.stepId}`);
  }
  return leaf(h, spec.careerId);
}

function rewardCount(h) {
  return h.rewards.length;
}

function markAsLegacyFiveStepCompletion(h, spec) {
  const own = leaf(h, spec.careerId);
  const capstone = own.steps[CAPSTONE_ID];
  assert.ok(capstone, `${spec.careerId} capstone runtime exists`);
  capstone.status = STEP_STATUS.PENDING;
  capstone.attempts = 0;
  capstone.activeSinceS = null;
  capstone.doneAtS = null;
  own.status = LADDER_STATUS.COMPLETED;
  own.stepIndex = 4;
  own.stepId = null;
  own.completedAtS = 90;
  own.rewardsGranted = true;
  own.completionReceiptId = `ladder_done:${spec.careerId}`;
  own.receipts[own.completionReceiptId] = true;
}

test('all career ladders end in a reward-free physical role-hull capstone', () => {
  for (const spec of CAREERS) {
    assert.equal(spec.definition.steps.length, 6, spec.careerId);
    assert.equal(spec.stepIds.length, 6, spec.careerId);
    assert.equal(spec.stepIds.at(-1), CAPSTONE_ID, spec.careerId);
    const step = spec.definition.steps.at(-1);
    assert.equal(step.id, CAPSTONE_ID, spec.careerId);
    assert.equal(step.index, 5, spec.careerId);
    assert.equal(step.params.roleHullDefId, spec.targetDefId, spec.careerId);
    assert.match(
      typeof step.objective === 'string' ? step.objective : step.objective.playerVisible,
      new RegExp(`\\b${spec.targetName}\\b`),
      `${spec.careerId} Mission Log objective names the physical hull`,
    );
    assert.deepEqual(step.rewards || {}, {}, `${spec.careerId} purchase step never pays itself`);
  }
});

test('real ship:purchased completes only the matching active capstone and never double-pays', () => {
  for (const spec of CAREERS) {
    const h = makeHarness(spec);
    const own = advanceToCapstone(h, spec);
    assert.equal(own.status, LADDER_STATUS.ACTIVE, spec.careerId);
    assert.equal(own.stepId, CAPSTONE_ID, spec.careerId);

    const chip = buildMissionLogCareerChip(h.state, h.ladders).chips
      .find((entry) => entry.careerId === spec.careerId);
    assert.ok(chip, `${spec.careerId} Mission Log chip`);
    assert.equal(chip.progressLabel, `Step 6/6 · ${spec.definition.steps[5].title}`);
    assert.match(chip.objective, new RegExp(`\\b${spec.targetName}\\b`));

    const before = rewardCount(h);
    h.bus.emit('ship:purchased', { defId: 'ship_ranger', price: 1 });
    assert.equal(leaf(h, spec.careerId).status, LADDER_STATUS.ACTIVE, `${spec.careerId} wrong hull ignored`);
    assert.equal(rewardCount(h), before, `${spec.careerId} wrong hull pays nothing`);

    h.state.player.ownedShips.push({ defId: spec.targetDefId, fittings: [] });
    h.bus.emit('ship:purchased', { defId: spec.targetDefId, price: 15_000 });
    assert.equal(leaf(h, spec.careerId).status, LADDER_STATUS.COMPLETED, spec.careerId);
    assert.equal(leaf(h, spec.careerId).steps[CAPSTONE_ID].status, STEP_STATUS.DONE, spec.careerId);
    const after = rewardCount(h);
    assert.ok(after >= before, `${spec.careerId} completion intents remain canonical`);

    h.bus.emit('ship:purchased', { defId: spec.targetDefId, price: 15_000 });
    h.bus.emit('save:loaded', { slot: 0 });
    assert.equal(rewardCount(h), after, `${spec.careerId} duplicate purchase/Continue pays nothing`);
    h.branch.destroy();
    h.ladders.destroy();
  }
});

test('owning the role hull before capstone activation catches up immediately', () => {
  for (const spec of CAREERS) {
    const h = makeHarness(spec, ['ship_kestrel', spec.targetDefId]);
    advanceToCapstone(h, spec);
    const own = leaf(h, spec.careerId);
    assert.equal(own.status, LADDER_STATUS.COMPLETED, spec.careerId);
    assert.equal(own.steps[CAPSTONE_ID].status, STEP_STATUS.DONE, spec.careerId);
    const after = rewardCount(h);
    h.bus.emit('ship:purchased', { defId: spec.targetDefId, price: 0 });
    assert.equal(rewardCount(h), after, `${spec.careerId} grant/rebuy remains idempotent`);
    h.branch.destroy();
    h.ladders.destroy();
  }
});

test('legacy five-step completion reopens or stamps the capstone on Continue without replaying rewards', () => {
  for (const spec of CAREERS) {
    const source = makeHarness(spec, ['ship_kestrel', spec.targetDefId]);
    // Prevent immediate owned-hull catch-up while building the legacy fixture.
    source.state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
    advanceToCapstone(source, spec);
    markAsLegacyFiveStepCompletion(source, spec);
    source.state.player.ownedShips.push({ defId: spec.targetDefId, fittings: [] });
    const blob = source.ladders.serialize();
    source.branch.destroy();
    source.ladders.destroy();

    const restored = makeHarness(spec, ['ship_kestrel', spec.targetDefId], 0xC4A5_0002);
    restored.rewards.length = 0;
    restored.ladders.deserialize(blob);
    restored.bus.emit('save:loaded', { slot: 0 });
    const own = leaf(restored, spec.careerId);
    assert.equal(own.status, LADDER_STATUS.COMPLETED, spec.careerId);
    assert.equal(own.steps[CAPSTONE_ID].status, STEP_STATUS.DONE, spec.careerId);
    assert.equal(rewardCount(restored), 0, `${spec.careerId} migration replays no rewards`);

    const roundTrip = restored.ladders.serialize();
    restored.ladders.deserialize(roundTrip);
    restored.bus.emit('save:loaded', { slot: 0 });
    restored.bus.emit('ship:purchased', { defId: spec.targetDefId, price: 0 });
    assert.equal(rewardCount(restored), 0, `${spec.careerId} repeated load stays idempotent`);
    restored.branch.destroy();
    restored.ladders.destroy();
  }
});
