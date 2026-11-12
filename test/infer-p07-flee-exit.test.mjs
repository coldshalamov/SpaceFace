// I019 — a mission target that is already fleeing must leave on the existing
// egress exit instead of vanishing the moment the contract settles.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { EGRESS_FADE_S } from '../src/ai/egressExit.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const SEED = 4242;

function boot() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.simTime = 80;
  state.tick = 120;
  state.playerId = 1;
  state.player.credits = 500;
  state.player.stats = state.player.stats || {};
  state.world.currentSectorId = 'sector_helios_prime';
  state.missions.active = [];
  state.story = state.story || { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    data: {},
  };
  state.entities.set(player.id, player);
  if (Array.isArray(state.entityList)) state.entityList.push(player);

  const bus = createBus();
  const egress = [];
  bus.on('ai:egressExit', (payload) => egress.push(payload));
  const missions = Object.assign({}, missionsProto);
  missions.init({
    state,
    bus,
    helpers: { hash32, mulberry32, voice: { say: () => true }, player: () => player },
    registry: { get() { return null; } },
  });
  return { state, bus, missions, egress, player };
}

function ship(id, x, fsm) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    data: {
      ai: { fsm },
      missionTag: 'bounty',
      missionId: 'm-flee-4242',
      missionPinned: true,
    },
  };
}

test('a fleeing mission target is handed to the egress exit when the contract ends', () => {
  const { state, missions, egress } = boot();
  const fleeing = ship(41, 1200, 'flee');
  const staying = ship(42, 40, 'attack');
  state.entities.set(fleeing.id, fleeing);
  state.entities.set(staying.id, staying);
  if (Array.isArray(state.entityList)) state.entityList.push(fleeing, staying);

  const mission = {
    id: 'm-flee-4242',
    status: 'active',
    type: 'bounty_hunt',
    title: 'Loose mark',
    reward_cr: 100,
    collateral_cr: 0,
    riskTier: 0,
    factionId: null,
    params: {},
    targetEntityIds: [fleeing.id, staying.id],
    destSectorId: state.world.currentSectorId,
  };
  state.missions.active.push(mission);
  missions._completeMission(mission, 0);

  assert.equal(mission.status, 'completed');
  assert.equal(state.entities.get(fleeing.id), fleeing);
  assert.notEqual(fleeing.alive, false);
  assert.equal(fleeing.data.despawnAt, state.simTime + EGRESS_FADE_S);
  assert.equal(fleeing.data._egressExitAt, fleeing.data.despawnAt);
  assert.equal(egress.some((row) => row && row.entityId === fleeing.id), true);

  assert.equal(staying.alive, false);
  assert.equal(staying.data._egressExitAt, undefined);
});
