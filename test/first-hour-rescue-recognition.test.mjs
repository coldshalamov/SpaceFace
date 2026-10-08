// SFQ-B113 — finishing the opening rescue posts the existing bar-gossip receipt
// once. No credits. A notice already in the sector is left alone.
import test from 'node:test';
import assert from 'node:assert/strict';

import { onboarding } from '../src/systems/onboarding.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { freshRescueState } from '../src/onboarding/rescueOpening.js';

const SECTOR = 'sector_helios_prime';

function busOf(log) {
  const handlers = {};
  return {
    on(event, handler) {
      (handlers[event] = handlers[event] || []).push(handler);
    },
    emit(event, payload) {
      log.push({ event, payload });
      for (const handler of handlers[event] || []) handler(payload);
    },
  };
}

function harness({ notice = null } = {}) {
  const log = [];
  const bus = busOf(log);
  const rescue = freshRescueState();
  rescue.beats.swing.state = 'done';
  rescue.beats.shove.state = 'done';
  rescue.beats.grab.state = 'current';
  rescue.current = 'grab';
  const state = {
    simTime: 88,
    meta: { seed: 4242 },
    player: { credits: 40 },
    world: { currentSectorId: SECTOR },
    onboarding: { rescue, finished: false, active: true },
    stationLife: notice ? { rescueNotices: { [SECTOR]: notice }, traffic: [], deeds: {} } : undefined,
  };
  stationContacts.init({ state, bus });
  if (notice) state.stationLife.rescueNotices[SECTOR] = notice;
  const sys = Object.create(onboarding);
  sys.state = state;
  sys.bus = bus;
  sys.helpers = {};
  sys._setRescueWaypoint = () => {};
  sys._refreshBeatPanel = () => {};
  sys._maybeAdvanceMissingThree = () => {};
  return { sys, state, log };
}

function completions(log) {
  return log.filter((row) => row.event === 'recovery:completed');
}

test('seed 4242: the opening pod posts one zero-pay rescue the sector can remember', () => {
  const { sys, state, log } = harness();
  const posted = sys._rescueDone('grab');
  assert.equal(posted, undefined);
  const rows = completions(log);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payload.recoveryId, 'onboarding-pod:4242');
  assert.equal(rows[0].payload.outcome, 'rescue');
  assert.equal(rows[0].payload.credits, 0);
  assert.equal(rows[0].payload.repDelta, 0);
  assert.deepEqual(rows[0].payload.cargo, {});
  assert.equal(rows[0].payload.sectorId, SECTOR);
  assert.equal(state.stationLife.rescueNotices[SECTOR].recordId, 'onboarding-pod:4242');
  assert.equal(state.player.credits, 40);

  state.onboarding.rescue.completed = false;
  state.onboarding.rescue.beats.grab.state = 'current';
  sys._rescueDone('grab');
  assert.equal(completions(log).length, 1, 'a second pass does not overwrite the notice');
  assert.equal(state.stationLife.rescueNotices[SECTOR].recordId, 'onboarding-pod:4242');
});

test('seed 4242: an existing sector rescue is not replaced by the opening pod', () => {
  const prior = { recordId: 'rec-real', sectorId: SECTOR, simTime: 10 };
  const { sys, state, log } = harness({ notice: prior });
  assert.equal(sys._postOpeningRescueRecognition(88), false);
  sys._rescueDone('grab');
  assert.equal(completions(log).length, 0);
  assert.equal(state.stationLife.rescueNotices[SECTOR].recordId, 'rec-real');
  assert.equal(state.player.credits, 40);
});
