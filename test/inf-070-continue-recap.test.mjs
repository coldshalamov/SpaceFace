// INF-070 — Continue restores the player's intention. The recap reads restored state only:
// the tracked active objective in the one shared wording, the current sector, and one
// unresolved risk (blocking term, then clock, then hull). It emits nothing, so it can never
// replay a reward; the single comms popup is dismissible, non-modal, and leaves controls free.
import test from 'node:test';
import assert from 'node:assert/strict';

import { continueRecap } from '../src/ui/screens/missionLog.js';
import { onboarding } from '../src/systems/onboarding.js';
import { SECTORS } from '../src/data/sectors.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { missions } from '../src/systems/missions.js';
import { CONTRACT_47A_B0_BODY } from '../src/data/narrative.js';

const sectorId = SECTORS[0].id;
const sectorName = SECTORS[0].name;

function stateWith({ missions = [], trackedId = null, simTime = 1000, hull = 100, hullMax = 100 } = {}) {
  return {
    simTime,
    playerId: 1,
    entities: new Map([[1, { id: 1, hull, hullMax }]]),
    world: { currentSectorId: sectorId },
    ui: { trackedMissionId: trackedId },
    missions: { active: missions },
  };
}

function installedB0WithSampleRock() {
  const state = createGameState(4242);
  // Isolate mission-owner navigation from the staged opening tutorial's temporary pin.
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.entities.set(state.playerId, {
    id: state.playerId, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100,
  });
  const rock = { id: 901, type: 'asteroid', alive: true, pos: { x: 120, z: 80 } };
  state.entities.set(rock.id, rock);
  state.entityList.push(rock);
  const bus = createBus();
  const owner = Object.create(missions);
  owner.init({ state, bus, helpers: {}, registry: { get: () => null } });
  owner._installContract47aColdStart();
  const mission = state.missions.active.find((row) => row && row.storyTag === 'campaign47a:b0:recovery');
  return { state, bus, owner, rock, mission };
}

function mineInstalledB0Sample({ state, owner }, source) {
  owner._onMiningYield({
    commodityId: 'cmdty_ore_iron',
    qty: 1,
    minerId: state.playerId,
    pos: { x: source.pos.x, z: source.pos.z },
  });
}

const escort = {
  id: 'm_1',
  type: 'escort',
  status: 'active',
  title: 'Convoy screen',
  destStationId: 'station_helios',
  objectiveProgress: 0,
  objectiveTarget: 1,
  params: {},
};

test('the recap names the tracked objective and the current sector', () => {
  const recap = continueRecap(stateWith({ missions: [escort], trackedId: 'm_1' }));
  assert.match(recap.objective, /Convoy screen/, 'the active objective leads');
  assert.match(recap.objective, /Escort to/, 'the shared wording, not a copy');
  assert.equal(recap.location, sectorName, 'the restored sector, not the last run');
  assert.equal(recap.risk, null, 'no risk invented when the state is clean');
});

test('the installed B0 recap follows the real sample-yield owner from recovery site to Helios', () => {
  const context = installedB0WithSampleRock();
  const { state, mission } = context;
  assert.ok(mission, 'the ordinary cold-start installer supplies the active contract');
  assert.equal(mission.type, 'salvage_retrieval');
  assert.equal(mission.storyTag, 'campaign47a:b0:recovery');
  assert.equal(mission.params.contractId, CONTRACT_47A_B0_BODY.contractId);
  assert.equal(mission.params.sampleRecovered, false);
  const source = context.owner._resolveContract47aSampleSource(mission);
  assert.ok(source, 'the owner resolves the installed recovery source');
  assert.equal(source.id, context.rock.id, 'the authored source is the actual marked rock');
  assert.equal(state.nav.waypoint.missionId, mission.id);
  assert.deepEqual(state.nav.waypoint.pos, source.pos, 'the waypoint uses the same fix as the yield owner');

  const before = continueRecap(state);
  assert.match(before.objective, /Contract 47-A/);
  assert.match(before.objective, /recover the 47-A assay sample at the marked recovery site in Helios Prime/i);
  assert.match(before.objective, /then return it to Helios Station/i);
  assert.equal(before.location, 'Helios Prime');
  assert.equal(before.risk, null);

  // Transition by the actual mission owner at the installed marked-rock position.
  const creditsBefore = state.player.credits;
  const beatBefore = state.story.beatIndex;
  const completedStepsBefore = [ ...(state.story.campaign47a?.stepProgress?.['0']?.completed || []) ];
  mineInstalledB0Sample(context, source);
  assert.equal(mission.params.sampleRecovered, true);
  assert.equal(state.player.cargo.items[mission.params.cmdtyId], 1);
  assert.equal(mission.status, 'active', 'recovering the sample is not delivery');
  assert.equal(state.player.credits, creditsBefore, 'recovery does not release additional payment');
  assert.equal(state.story.beatIndex, beatBefore, 'sample recovery alone does not advance the campaign beat');
  const completedStepsAfter = state.story.campaign47a?.stepProgress?.['0']?.completed || [];
  assert.deepEqual(completedStepsAfter, [...completedStepsBefore, 'mine'],
    'recovery records the mining step but not the separate dock/delivery step');

  const after = continueRecap(state);
  assert.match(after.objective, /deliver the recovered 47-A assay sample to Helios Station/i);
  assert.doesNotMatch(after.objective, /marked recovery site/i);
  assert.equal(after.location, 'Helios Prime');
  assert.equal(after.risk, null);
});

test('B0 copy is gated by canonical tag, mission type, and contract ID, not its title', () => {
  const { state, mission } = installedB0WithSampleRock();
  const lookalikes = [
    { ...mission, storyTag: 'campaign47a:other:recovery' },
    { ...mission, type: 'cargo_delivery' },
    { ...mission, params: { ...mission.params, contractId: 'not-47-A' } },
  ];
  for (const lookalike of lookalikes) {
    const recap = continueRecap({
      ...state,
      ui: { trackedMissionId: lookalike.id },
      missions: { active: [lookalike] },
    });
    assert.match(recap.objective, /Contract 47-A/, 'same visible title is not identity');
    assert.doesNotMatch(recap.objective, /marked recovery site/i, 'non-B0 missions keep shared generic wording');
  }
});

test('one unresolved risk surfaces: blocking term, then clock, then hull', () => {
  const held = {
    ...escort,
    type: 'cargo_delivery',
    clauses: [{ conditionId: 'soft_berth' }],
  };
  const heldRecap = continueRecap(stateWith({ missions: [held], trackedId: 'm_1' }));
  assert.match(heldRecap.risk, /^Held:/, 'a blocking term is the risk');
  assert.match(heldRecap.risk, /alongside/i, 'the live pending text, not a generic warning');

  const timed = { ...escort, title: 'Rush job', deadline_s: 1090 };
  const timedRecap = continueRecap(stateWith({ missions: [timed], trackedId: 'm_1', simTime: 1000 }));
  assert.match(timedRecap.risk, /^Clock:/, 'a tight clock is the risk when nothing blocks');

  const hurtRecap = continueRecap(stateWith({ hull: 20, hullMax: 100 }));
  assert.match(hurtRecap.risk, /Hull critical/, 'a critical hull is the risk with no mission');
});

test('a null deadline is absent but an actual zero deadline remains a clock risk', () => {
  const noDeadline = { ...escort, deadline_s: null };
  const noClock = continueRecap(stateWith({ missions: [noDeadline], trackedId: 'm_1', simTime: 0 }));
  assert.equal(noClock.risk, null, 'null is not coerced into a zero deadline');

  const dueNow = { ...escort, deadline_s: 0 };
  const clockRisk = continueRecap(stateWith({ missions: [dueNow], trackedId: 'm_1', simTime: 0 }));
  assert.match(clockRisk.risk, /^Clock: 0s left/, 'a real numeric-zero deadline still surfaces');
});

test('silence when there is nothing to restore, and no completed missions leak in', () => {
  assert.equal(continueRecap(stateWith({})), null, 'empty state says nothing');
  const done = { ...escort, status: 'completed' };
  const recap = continueRecap(stateWith({ missions: [done], trackedId: 'm_1' }));
  assert.equal(recap && recap.objective, null, 'settled missions never recap as intention');
});

test('the recap speaks once on load through the dismissible comms surface', () => {
  const state = { ...stateWith({ missions: [escort], trackedId: 'm_1' }), mode: 'flight' };
  const events = [];
  onboarding._speakContinueRecap.call({
    state,
    bus: { emit: (event, payload) => events.push({ event, payload }) },
  }, { loaded: true });
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'comms:popup');
  assert.equal(events[0].payload.sender, 'Flight Log');
  assert.match(events[0].payload.text, /Convoy screen.*Escort to/);
  assert.equal(state.mode, 'flight');
  assert.equal(events.some(({ event }) => event.startsWith('economy:') || event.startsWith('faction:')), false);
});

test('scenario and harness loads do not announce a player recap', () => {
  const events = [];
  for (const payload of [{ scenario: '47a' }, { harness: true }]) {
    onboarding._speakContinueRecap.call({
      state: stateWith({ missions: [escort], trackedId: 'm_1' }),
      bus: { emit: (event, value) => events.push({ event, value }) },
    }, payload);
  }
  assert.deepEqual(events, []);
});
