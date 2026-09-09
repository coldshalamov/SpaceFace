import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  BOUNTY_HUNTER_NEUTRAL_CONTEXT,
  BOUNTY_HUNTER_PLAYER_CONTEXT,
} from '../src/data/bountyHunters.js';
import {
  bountyHunt,
  bountyHunterOutcomeForContract,
  makeBountyHunterSpec,
  makeBountyQuarrySpec,
} from '../src/systems/bountyHunt.js';

function place(state, spec, id) {
  const entity = { id, alive: true, ...spec, pos: { ...(spec.pos || { x: 0, z: 0 }) } };
  if (!entity.data) entity.data = spec.data;
  state.entities.set(id, entity);
  state.entityList.push(entity);
  return entity;
}

function bootHunt() {
  const state = createGameState(47);
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 8;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, data: {},
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const system = Object.create(bountyHunt);
  system.init({ state, bus, helpers: {} });
  return { state, bus, system, player };
}

test('a hunter chasing an NPC quarry stays scanner-neutral; hunting the player flips hostile', () => {
  const { state, bus, system } = bootHunt();
  try {
    const quarry = place(state, makeBountyQuarrySpec({ contractId: 'c-npc', pos: { x: 80, z: 0 } }), 20);
    const hunter = place(state, makeBountyHunterSpec({
      contractId: 'c-npc',
      contractTargetId: quarry.id,
      pos: { x: 40, z: 0 },
    }), 21);
    system.update(1 / 60, state);
    assert.equal(hunter.data.ai.spawnContext, BOUNTY_HUNTER_NEUTRAL_CONTEXT);
    assert.equal(hunter.data.ai.forcePlayerTarget, false);
    assert.deepEqual(hunter.data.ai.hostileTeams, []);
    assert.equal(hunter.data.bountyHunt.pursuing, true);
    assert.equal(hunter.data.intent.targetId, quarry.id);

    hunter.data.contractTargetId = state.playerId;
    system.update(1 / 60, state);
    assert.equal(hunter.data.ai.spawnContext, BOUNTY_HUNTER_PLAYER_CONTEXT);
    assert.equal(hunter.data.ai.forcePlayerTarget, true);
    assert.deepEqual(hunter.data.ai.hostileTeams, [0]);
    assert.equal(hunter.data.intent.mode, 'bounty_player');
  } finally {
    system.destroy?.();
    bus.clear();
  }
});

test('the player killing the quarry records a helped-hunter outcome', () => {
  const { state, bus, system } = bootHunt();
  try {
    const quarry = place(state, makeBountyQuarrySpec({ contractId: 'c-help', pos: { x: 60, z: 0 } }), 30);
    place(state, makeBountyHunterSpec({
      contractId: 'c-help',
      contractTargetId: quarry.id,
      pos: { x: 20, z: 0 },
    }), 31);
    system.update(1 / 60, state);
    bus.emit('entity:killed', { id: quarry.id, killerId: state.playerId });
    const outcome = bountyHunterOutcomeForContract(state, 'c-help');
    assert.ok(outcome);
    assert.equal(outcome.outcome, 'player_helped_hunter');
  } finally {
    system.destroy?.();
    bus.clear();
  }
});
