import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  AMBIENT_GAP_STEP_S,
  admitNpcCounterplayBark,
} from '../src/systems/barkDirector.js';
import { broadcastDishBeatRecord } from '../src/render/stationSideEventVfx.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { buildReply, rememberGhostConvoyRumor } from '../src/ui/station/barContacts.js';
import { resolveGateVerdictRingRate } from '../src/render/infrastructureMotion.js';

test('an NPC contesting the line barks once inside the ambient gap', () => {
  const host = {};
  const first = admitNpcCounterplayBark(host, { actorId: 4, role: 'specialist' }, 0);
  const second = admitNpcCounterplayBark(host, { actorId: 4, role: 'specialist' }, 1);
  const later = admitNpcCounterplayBark(host, { actorId: 9, role: 'ace' }, AMBIENT_GAP_STEP_S);
  assert.equal(first.text, 'Specialist on your line. Cutting it.');
  assert.equal(second, null);
  assert.equal(later.role, 'ace');
  assert.equal(host._npcCounterplayBarks.length, 2);
});

test('a broadcast tic beats the dish and a quiet broadcaster does not', () => {
  const beat = broadcastDishBeatRecord({
    stationId: 'station_helios', tic: 3, pos: { x: 10, z: 4 },
  });
  assert.equal(beat.kind, 'dish-beat');
  assert.equal(beat.pattern, 'station:sideEvent');
  assert.equal(beat.trajectory, 'dish-sweep');
  assert.equal(broadcastDishBeatRecord({ stationId: 'station_helios', quiet: true, tic: 3, pos: { x: 1, z: 1 } }), null);
  assert.equal(broadcastDishBeatRecord({ stationId: 'station_helios', pos: { x: 1, z: 1 } }), null);
});

test('a miner relocation in the current sector is one cited headline', () => {
  const state = {
    meta: { seed: 4242 },
    simTime: 12,
    world: { currentSectorId: 'sector_helios_prime' },
    ui: {},
  };
  const news = createMarketNews({ state, bus: createBus(), helpers: {} });
  state.bus = null;
  news.bus && news.bus.emit;
  const bus = createBus();
  const wired = createMarketNews({ state, bus, helpers: {} });
  bus.emit('npcjobs:minerRelocated', { sectorId: 'sector_ceres_drift', simTime: 12 });
  assert.equal(state.ui.marketNews.log.length, 0, 'off-sector relocation stays off the ticker');
  bus.emit('npcjobs:minerRelocated', { sectorId: 'sector_helios_prime', simTime: 12 });
  assert.equal(state.ui.marketNews.log.length, 1);
  assert.match(state.ui.marketNews.log[0].text, /sector_helios_prime/);
  assert.equal(state.ui.marketNews.log[0].sourceRef, 'miner-relocated:sector_helios_prime:12');
  wired.destroy && wired.destroy();
  news.destroy && news.destroy();
});

test('a ghost convoy rumour is a bar line and does not name a position', () => {
  const state = { ui: {}, world: { currentSectorId: 'sector_helios_prime' } };
  const rumor = rememberGhostConvoyRumor(state, {
    line: 'A convoy went quiet on the lane.',
    sectorId: 'sector_helios_prime',
    laneKey: 'helios-freight',
  });
  assert.equal(rumor.text, 'A convoy went quiet on the lane.');
  assert.equal(/position|bearing|coords/i.test(rumor.text), false);
  const reply = buildReply('barkeep', 'rumors', { state }, 'station_helios', { role: 'barkeep' });
  assert.equal(reply.text, rumor.text);
});

test('gate verdicts change the ring rate in three different ways', () => {
  const base = 0.2;
  const pass = resolveGateVerdictRingRate(base, 'pass');
  const hold = resolveGateVerdictRingRate(base, 'hold');
  const refusal = resolveGateVerdictRingRate(base, 'refusal');
  assert.ok(pass > base);
  assert.ok(hold < base && hold > refusal);
  assert.ok(refusal < hold);
  assert.notEqual(pass, hold);
  assert.notEqual(hold, refusal);
});
