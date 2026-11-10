// SFQ-I030 — a sealed cargo offer is refused before collateral moves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { missions } from '../src/systems/missions.js';

const SEED = 4242;
const OFFER_ID = 'iron-run-4242';

function harness(capVolume) {
  const state = createGameState(SEED);
  const bus = createBus();
  const charges = [];
  bus.on('economy:chargeCredits', (payload) => {
    charges.push(payload);
    state.player.credits -= payload.amount;
  });
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  state.simTime = 1200;
  state.player.credits = 5000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume, richLots: [] };
  state.missions = {
    config: { refreshSec: 600, maxActive: 8 },
    nextId: 1,
    active: [],
    boards: {
      station_helios: {
        refreshEpoch: 1,
        slots: [{
          id: OFFER_ID,
          stationId: 'station_helios',
          type: 'cargo_delivery',
          title: 'Iron to the next berth',
          params: { cmdtyId: 'cmdty_ore_iron', qty: 8 },
          preloadedCargo: true,
          collateral_cr: 100,
          reward_cr: 400,
        }],
      },
    },
  };
  const owner = Object.create(missions);
  owner.state = state;
  owner.bus = bus;
  owner.helpers = {};
  owner._ensureMissionTargets = () => {};
  owner.trackMission = () => true;
  owner._emitMissionTargetProjection = () => {};
  owner._maybeSetBranch = () => {};
  owner._startLongReadObjective = () => {};
  owner._startWreckBoundStageObjective = () => {};
  return { state, owner, charges, toasts };
}

test('a full hold refuses the sealed offer and does not take collateral', () => {
  const { state, owner, charges, toasts } = harness(0);
  assert.equal(owner.acceptMission(OFFER_ID), false);
  assert.equal(state.missions.active.length, 0);
  assert.deepEqual(state.player.cargo.items, {});
  assert.equal(state.player.credits, 5000);
  assert.equal(charges.length, 0);
  const text = toasts.map((row) => row && row.text).join(' ');
  assert.match(text, /cargo/i);
  assert.equal(/[a-z]+_[a-z0-9]+/.test(text), false);
});

test('a hold with room pays the collateral once', () => {
  const { state, owner, charges } = harness(40);
  assert.equal(owner.acceptMission(OFFER_ID), true);
  assert.equal(owner.acceptMission(OFFER_ID), false);
  assert.equal(charges.length, 1);
  assert.equal(charges[0].amount, 100);
  assert.equal(state.player.credits, 4900);
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 8);
});
