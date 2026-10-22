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
  const player = { id: 'player', alive: true, type: 'ship', pos: { x: 0, z: 0 } };
  const pod = {
    id: 'pod-hot',
    alive: true,
    type: 'payload',
    pos: { x: 12, z: 0 },
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
    player: { credits, heat: 0, launderLedger: [] },
    factions: { faction_quiet: { rep: 0 } },
    entities: new Map([['player', player], [pod.id, pod]]),
    entityList: [player, pod],
  };
  const sys = Object.create(pirateDisguise);
  sys.init({
    state,
    bus: { on() { return () => {}; }, emit(name, payload) { log.push({ name, payload }); } },
    helpers: {},
  });
  return { state, sys, pod, log };
}

test('a short wash at the Pallas den says the cut and leaves the pod hot, seed 4242', () => {
  const cut = launderCutCredits('cmdty_narcotics', 8, 0);
  const h = harness(10);
  const receipt = h.sys.launderAtDock({ station: STATION, stationId: STATION.id });
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
  const receipt = h.sys.launderAtDock({ station: STATION, stationId: STATION.id });
  assert.equal(receipt.accepted, true);
  assert.equal(h.pod.data.laundered, true);
  assert.equal(h.pod.data.legality, 'legal');
  const toast = h.log.find((event) => event.name === 'toast');
  assert.match(toast.payload.text, /^Papers washed — cut \d+ cr$/);
  assert.equal(h.log.some((event) => event.name === 'toast' && /refused/i.test(event.payload.text)), false);
});
