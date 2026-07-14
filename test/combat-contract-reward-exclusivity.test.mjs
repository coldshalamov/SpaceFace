import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';

function bootRewardScenario({ missionTarget }) {
  const sim = createSimulation({ seed: 0x47a, systems: [economy, missions, combat] });
  const { state, bus, registry } = sim;
  state.mode = 'flight';

  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free', pos: { x: 0, z: 0 },
    hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  registry.get('economy').newGame();
  state.player.credits = 0;

  const missionId = 'test_hunter_contract';
  const target = sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 25, z: 0 },
    hull: 50, hullMax: 50,
    data: {
      bountyCr: 120,
      shipClass: 'fighter',
      lootTableId: 'test_contract_loot',
      loot: {
        creditsRange: [80, 80],
        guaranteed: [{ id: 'cmdty_ore', qtyRange: [1, 1] }],
        drops: [],
      },
      ...(missionTarget ? {
        missionId,
        missionTag: missionId,
        missionPinned: true,
      } : {}),
    },
  });

  if (missionTarget) {
    state.missions.active.push({
      id: missionId,
      title: 'Bring In the Writ',
      type: 'bounty_hunt',
      status: 'active',
      targetEntityIds: [target.id],
      objectiveProgress: 0,
      objectiveTarget: 1,
      reward_cr: 500,
      collateral_cr: 0,
      riskTier: 1,
      factionId: null,
      params: {},
      clauses: [],
    });
  }

  const creditEvents = [];
  const lootDrops = [];
  bus.on('credits:changed', (payload) => creditEvents.push(structuredClone(payload)));
  bus.on('loot:drop', (payload) => lootDrops.push(structuredClone(payload)));

  registry.get('combat').kill(target, player.id);
  return { sim, state, creditEvents, lootDrops };
}

test('contract target settles once through missions without generic bounty or loot', () => {
  const run = bootRewardScenario({ missionTarget: true });

  assert.equal(run.state.player.credits, 500);
  assert.deepEqual(run.creditEvents.map((event) => event.reason), ['mission:test_hunter_contract']);
  assert.equal(run.lootDrops.length, 0);
  assert.equal(run.state.entityList.some((entity) => entity.type === 'pickup'), false);
  assert.equal(run.state.missions.active.length, 0);
  assert.equal(run.state.missions.completedLog[0]?.success, 1);
  run.sim.dispose();
});

test('ambient player kill keeps its authored bounty and loot', () => {
  const run = bootRewardScenario({ missionTarget: false });

  assert.equal(run.state.player.credits, 200);
  assert.deepEqual(run.creditEvents.map((event) => event.reason), ['bounty', 'loot']);
  assert.equal(run.lootDrops.length, 1);
  assert.deepEqual(run.lootDrops[0].items, [{ id: 'cmdty_ore', qty: 1 }]);
  assert.equal(run.state.entityList.filter((entity) => entity.type === 'pickup').length, 1);
  run.sim.dispose();
});
