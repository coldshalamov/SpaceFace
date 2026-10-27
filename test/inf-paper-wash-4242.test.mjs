import test from 'node:test';
import assert from 'node:assert/strict';

import { launderCutCredits } from '../src/data/salvageLegality.js';
import { pirateDisguise } from '../src/systems/pirateDisguise.js';

const STATION = {
  id: 'station_smuggler',
  name: 'Smuggler Den',
  type: 'blackmarket',
  factionId: 'faction_quiet',
  services: ['black_market', 'missions', 'refuel'],
};

function harness(credits) {
  const player = { id: 'player', alive: true, type: 'ship', pos: { x: 0, z: 0 }, occupantGeneration: 1 };
  const berth = { id: 'berth', alive: true, type: 'station', pos: { x: 0, z: 0 }, occupantGeneration: 1, data: { stationId: STATION.id } };
  const pod = {
    id: 'pod-hot',
    alive: true,
    type: 'payload',
    pos: { x: 12, z: 0 },
    occupantGeneration: 1,
    data: {
      payloadType: 'jettisoned_cargo',
      commodityId: 'cmdty_narcotics',
      amount: 8,
      legality: 'contraband',
    },
  };
  const log = [];
  const state = {
    simTime: 40,
    tick: 2400,
    mode: 'flight',
    meta: { seed: 4242 },
    playerId: 'player',
    world: {
      currentSectorId: 'sector_pallas_drift',
      frontierRumors: {
        byId: {
          'frontier-rumor:station_tethys:tethys-black-market': {
            phase: 'contacted',
            contactId: 'quiet:tethys-black-market',
            entranceRun: { runId: 'tethys:pallas-entrance:1', phase: 'delivered' },
          },
        },
      },
    },
    // Docked at the den: the wash is the explicit quote-then-confirm service, never a dock side effect.
    ui: { docked: true, dockedStationId: STATION.id },
    player: { credits, heat: 0, launderLedger: [] },
    factions: { faction_quiet: { rep: 0 } },
    entities: new Map([['player', player], ['berth', berth], [pod.id, pod]]),
    entityList: [player, berth, pod],
  };
  const sys = Object.create(pirateDisguise);
  sys.init({
    state,
    bus: {
      on() { return () => {}; },
      emit(name, payload) {
        log.push({ name, payload });
        // The economy's exact-charge contract: balance must match, commit first, then the money moves.
        if (name === 'economy:chargeCredits' && payload.requireFull === true) {
          payload.result = false;
          if (state.player.credits !== payload.expectedCredits || state.player.credits < payload.amount
              || payload.commit() !== true) return;
          state.player.credits -= payload.amount;
          payload.result = true;
        }
      },
    },
    helpers: {},
  });
  return { state, sys, pod, log };
}

function wash(h) {
  const ask = { stationId: STATION.id, contextId: 'ctx:4242' };
  const quoted = h.sys.launderAtDock({ ...ask, requestId: 'req:quote', action: 'quote' });
  assert.equal(quoted.accepted, true);
  assert.equal(quoted.quotes.length, 1);
  assert.equal(h.log.some((event) => event.name === 'economy:chargeCredits'), false, 'the price is free to ask');
  return h.sys.launderAtDock({ ...ask, requestId: 'req:confirm', action: 'confirm', quoteId: quoted.quotes[0].quoteId });
}

test('a short wash at the Pallas den says the cut and leaves the pod hot, seed 4242', () => {
  const cut = launderCutCredits('cmdty_narcotics', 8, 0);
  const h = harness(10);
  const receipt = wash(h);
  assert.equal(receipt.accepted, false);
  assert.equal(receipt.reason, 'short');
  assert.equal(receipt.cut, cut);
  assert.equal(h.pod.data.laundered, undefined);
  assert.equal(h.pod.data.legality, 'contraband');
  assert.equal(h.state.player.credits, 10);
  const toast = h.log.find((event) => event.name === 'toast');
  assert.equal(toast.payload.text, `Papers refused — the cut is ${cut} cr and you are holding 10.`);
  assert.equal(h.log.some((event) => event.name === 'economy:chargeCredits'), false);
});

test('paying the cut still washes the papers and does not call it a refusal, seed 4242', () => {
  const h = harness(50000);
  const receipt = wash(h);
  assert.equal(receipt.accepted, true);
  assert.equal(h.pod.data.laundered, true);
  assert.equal(h.pod.data.legality, 'legal');
  const toast = h.log.find((event) => event.name === 'toast');
  assert.match(toast.payload.text, /^Papers washed — cut \d+ cr$/);
  assert.equal(h.log.some((event) => event.name === 'toast' && /refused/i.test(event.payload.text)), false);
});
