// A hunter ledger choice and a capture handoff read the dock the player is at.
// Seed 4242. The mission log emits career id + choice id only. A live dock
// event names the station id and does not carry a station type.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CAREER_LADDER_EVENTS,
  LADDER_STATUS,
  clearLadderDefinitions,
  createCareerLaddersSystem,
} from '../src/careers/ladders/careerLadders.js';
import { LADDER_REWARD_EVENTS, STEP_STATUS } from '../src/careers/ladders/ladderShared.js';
import {
  HUNTER_LADDER_PURSUIT_CONTACT_TICKS,
  HUNTER_LADDER_STEP_IDS,
  HUNTER_ROLE_HULL_DEF_ID,
} from '../src/careers/ladders/hunterLadderDefs.js';
import { createHunterLadderFsm } from '../src/careers/ladders/hunterLadderFsm.js';
import { CombatDoctrineId } from '../src/ai/combatDoctrine.js';
import { installPlayer, makeHostilePirate } from './hunter-origin-fixtures.mjs';

const MILITARY = 'station_coalition';
const BLACKMARKET = 'station_smuggler';
const TRADE = 'station_helios';

function harness() {
  clearLadderDefinitions();
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 100;
  state.tick = 6000;
  state.player = state.player || {};
  state.player.credits = 5000;
  state.player.heat = 0;
  state.player.cargo = state.player.cargo || { items: {}, usedVolume: 0, usedMass: 0 };
  state.story = state.story || { beatIndex: 3, branch: null };
  state.careers = state.careers || {};
  state.careers.origins = {
    hunter: { status: 'completed' },
    hauler: { status: 'idle' },
    prospector: { status: 'idle' },
  };
  state.ui = state.ui || {};
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  installPlayer(state, 1);

  const bus = createBus();
  const intents = [];
  const origEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    if (event === LADDER_REWARD_EVENTS.GRANT_CREDITS || event === LADDER_REWARD_EVENTS.REP_DELTA) {
      intents.push({ event, payload });
    }
    return origEmit(event, payload);
  };
  const ladders = createCareerLaddersSystem();
  ladders.init({ state, bus, registry: { get: () => null } });
  clearLadderDefinitions();
  const hunter = createHunterLadderFsm({ ladders });
  assert.equal(hunter.register(ladders).ok, true);
  hunter.init({ state, bus, ladders });
  return { state, bus, ladders, hunter, intents };
}

function leaf(h) {
  return h.state.careers.ladders.hunter;
}

function advanceTo(h, stepId) {
  const target = HUNTER_LADDER_STEP_IDS.indexOf(stepId);
  assert.ok(target >= 0);
  assert.equal(h.hunter.offer({ ignorePrereqs: true }).ok, true);
  assert.equal(h.hunter.accept({ ignorePrereqs: true }).ok, true);
  const pirate = makeHostilePirate({ id: 50, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY });
  pirate.pos = { x: 10, z: 10 };
  h.state.entities.set(pirate.id, pirate);
  h.state.entityList.push(pirate);
  const player = h.state.entities.get(1);
  if (player) player.pos = { x: 0, z: 0 };
  for (let i = 0; i < target; i++) {
    const cur = leaf(h).stepId;
    if (cur === 'warrant_desk') {
      assert.equal(h.hunter.confirmMark(pirate).ok, true);
    } else if (cur === 'doctrine_pursuit') {
      leaf(h).steps.doctrine_pursuit.payload.markEntityId = 50;
      assert.equal(h.hunter.tickPursuit({ inContact: true, dtTicks: HUNTER_LADDER_PURSUIT_CONTACT_TICKS }).ok, true);
    } else if (cur === 'escalation_package') {
      leaf(h).steps.escalation_package.payload.markEntityId = 50;
      leaf(h).steps.escalation_package.payload.packageSawTrick = true;
      h.hunter.notePackageCleared({ sawTrick: true, allowTrickOnly: true });
      if (leaf(h).stepId === 'escalation_package') {
        leaf(h).steps.escalation_package.payload.packageCleared = true;
        assert.equal(h.ladders.applySignal('hunter', { kind: 'complete' }).ok, true);
      }
    } else if (cur === 'capture_window') {
      leaf(h).steps.capture_window.payload.markEntityId = 50;
      leaf(h).steps.capture_window.payload.markDisabled = true;
      h.hunter.choose('execute', { completeNow: true, markDead: true, ignoreStation: true });
      if (leaf(h).stepId === 'capture_window') {
        h.ladders.choose('hunter', 'execute');
        h.ladders.applySignal('hunter', { kind: 'complete' });
      }
    }
  }
  assert.equal(leaf(h).stepId, stepId);
}

function dock(h, stationId) {
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = stationId;
}

function paid(h, amount) {
  return h.intents.some((row) => row.event === LADDER_REWARD_EVENTS.GRANT_CREDITS && row.payload.amount === amount);
}

test('filing with law from the mission log counts only at a military dock', () => {
  const h = harness();
  advanceTo(h, 'ledger_choice');
  h.state.player.ownedShips = [{ defId: HUNTER_ROLE_HULL_DEF_ID, fittings: [] }];

  dock(h, TRADE);
  h.bus.emit(CAREER_LADDER_EVENTS.CHOOSE, { careerId: 'hunter', choiceId: 'file_law' });
  assert.equal(leaf(h).status, LADDER_STATUS.ACTIVE);
  assert.equal(leaf(h).stepId, 'ledger_choice');
  assert.equal(paid(h, 900), false);

  h.state.ui.docked = false;
  h.state.ui.dockedStationId = MILITARY;
  h.bus.emit(CAREER_LADDER_EVENTS.CHOOSE, { careerId: 'hunter', choiceId: 'file_law' });
  assert.equal(leaf(h).stepId, 'ledger_choice');
  assert.equal(paid(h, 900), false);

  dock(h, MILITARY);
  h.bus.emit(CAREER_LADDER_EVENTS.CHOOSE, { careerId: 'hunter', choiceId: 'file_law' });
  assert.equal(leaf(h).status, LADDER_STATUS.COMPLETED);
  assert.equal(leaf(h).ledgerPath, 'law');
  assert.equal(paid(h, 900), true);
});

test('selling dark from the mission log counts only at a black-market dock', () => {
  const h = harness();
  advanceTo(h, 'ledger_choice');
  h.state.player.ownedShips = [{ defId: HUNTER_ROLE_HULL_DEF_ID, fittings: [] }];

  dock(h, MILITARY);
  h.bus.emit(CAREER_LADDER_EVENTS.CHOOSE, { careerId: 'hunter', choiceId: 'sell_dark' });
  assert.equal(leaf(h).stepId, 'ledger_choice');
  assert.equal(paid(h, 1100), false);

  dock(h, BLACKMARKET);
  h.bus.emit(CAREER_LADDER_EVENTS.CHOOSE, { careerId: 'hunter', choiceId: 'sell_dark' });
  assert.equal(leaf(h).status, LADDER_STATUS.COMPLETED);
  assert.equal(leaf(h).ledgerPath, 'dark');
  assert.equal(paid(h, 1100), true);
});

test('taking them in from the mission log finishes only at a military dock', () => {
  const h = harness();
  advanceTo(h, 'capture_window');
  leaf(h).steps.capture_window.payload.markEntityId = 50;

  h.bus.emit(CAREER_LADDER_EVENTS.CHOOSE, { careerId: 'hunter', choiceId: 'capture' });
  assert.equal(leaf(h).stepId, 'capture_window');
  assert.equal(paid(h, 550), false);

  leaf(h).steps.capture_window.payload.markDisabled = true;
  h.bus.emit(CAREER_LADDER_EVENTS.CHOOSE, { careerId: 'hunter', choiceId: 'capture' });
  assert.equal(leaf(h).steps.capture_window.payload.choiceId, 'capture');
  assert.equal(leaf(h).stepId, 'capture_window');
  assert.equal(paid(h, 550), true);
  assert.equal(leaf(h).steps.capture_window.status, STEP_STATUS.ACTIVE);

  h.bus.emit('dock:docked', { stationId: TRADE });
  assert.equal(leaf(h).steps.capture_window.status, STEP_STATUS.ACTIVE);

  h.bus.emit('dock:docked', { stationId: MILITARY });
  assert.equal(leaf(h).steps.capture_window.status, STEP_STATUS.DONE);
  assert.equal(leaf(h).stepId, 'ledger_choice');
});

test('taking them in while already at a military dock finishes the capture', () => {
  const h = harness();
  advanceTo(h, 'capture_window');
  leaf(h).steps.capture_window.payload.markEntityId = 50;
  leaf(h).steps.capture_window.payload.markDisabled = true;
  dock(h, MILITARY);
  h.bus.emit(CAREER_LADDER_EVENTS.CHOOSE, { careerId: 'hunter', choiceId: 'capture' });
  assert.equal(leaf(h).steps.capture_window.status, STEP_STATUS.DONE);
  assert.equal(paid(h, 550), true);
});
