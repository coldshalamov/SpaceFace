// Out-of-combat hull patching has to say it started, once, until the next hit.
import test from 'node:test';
import assert from 'node:assert/strict';

import { uniqueLootAbilities, KNITBOTS_OOC_DELAY_S } from '../src/systems/uniqueLootAbilities.js';

function host(simTime, lastDamageT) {
  const events = [];
  const player = {
    id: 1,
    alive: true,
    hull: 40,
    hullMax: 100,
    lastDamageT,
    data: { derived: { hullRepairOOC: 4 } },
  };
  const state = {
    playerId: 1,
    simTime,
    entities: new Map([[1, player]]),
    player: {},
  };
  const sys = Object.assign(Object.create(uniqueLootAbilities), {
    state,
    bus: { emit(name, payload) { events.push({ name, payload }); } },
  });
  return { sys, state, player, events };
}

test('knitbots say so once when they start patching', () => {
  const { sys, state, player, events } = host(20, 20 - KNITBOTS_OOC_DELAY_S - 1);
  sys._updateKnitbots(1, state, player);
  sys._updateKnitbots(1, state, player);
  const toasts = events.filter((event) => event.name === 'toast');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].payload.text, 'Knitbots patching the hull');
  assert.ok(player.hull > 40);
});

test('a fresh hit keeps the knitbots quiet', () => {
  const { sys, state, player, events } = host(20, 19);
  sys._updateKnitbots(1, state, player);
  assert.equal(player.hull, 40);
  assert.equal(events.some((event) => event.name === 'toast'), false);
});

test('the next hit lets a later patch announce again, and the latch stays off the ship', () => {
  const { sys, state, player, events } = host(20, 20 - KNITBOTS_OOC_DELAY_S - 1);
  sys._updateKnitbots(1, state, player);
  assert.equal(player.knitbotsTold, undefined);
  assert.equal(state.player.uniqueLootAbilities.knitbotsTold, true);
  player.lastDamageT = 21;
  state.simTime = 21;
  sys._updateKnitbots(1, state, player);
  assert.equal(state.player.uniqueLootAbilities.knitbotsTold, false);
  state.simTime = 21 + KNITBOTS_OOC_DELAY_S + 1;
  sys._updateKnitbots(1, state, player);
  assert.equal(events.filter((event) => event.name === 'toast').length, 2);
});

test('a hull that fills can announce again the next time it is short', () => {
  const { sys, state, player, events } = host(20, 10);
  player.hull = 99;
  player.data.derived.hullRepairOOC = 5;
  sys._updateKnitbots(1, state, player);
  assert.equal(player.hull, 100);
  assert.equal(state.player.uniqueLootAbilities.knitbotsTold, false);
  player.hull = 50;
  player.lastDamageT = 30;
  state.simTime = 30 + KNITBOTS_OOC_DELAY_S + 1;
  sys._updateKnitbots(1, state, player);
  assert.equal(events.filter((event) => event.name === 'toast').length, 2);
});
