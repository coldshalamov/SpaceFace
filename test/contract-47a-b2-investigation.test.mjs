import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const CONTRACT_47A_B2_TAG = 'campaign47a:b2:elroy';

function harness() {
  const state = createGameState(472);
  state.mode = 'flight';
  state.simTime = 30;
  state.playerId = 1;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
  state.player.targetId = null;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_tethys_junction';
  state.factions.faction_scn = { ...(state.factions.faction_scn || {}), rep: 100 };

  let nextId = 10;
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  state.entities.set(player.id, player);
  const bus = createBus();
  const credits = [];
  const resolved = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  bus.on('story:elroyResolved', (payload) => resolved.push(payload));
  const helpers = {
    hash32,
    mulberry32,
    player: () => player,
    voice: { say: () => true },
    spawnEntity: (spec) => {
      const entity = { ...spec, id: nextId++, alive: true, pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  missions.newGame();
  state.missions.active = [];
  state.ui.trackedMissionId = null;
  state.story.beatIndex = 2;
  missions._syncCampaignSidecarAfterAdvance();
  // W-BOOKS-0-2 (§34.7): the register contract posts only after the cinder board, the
  // Compost Run, and the Nest are done — stamp those steps so the departure dispatches
  // the named writ, exactly as a save resuming late in Book 2 would.
  state.story.campaign47a.stepProgress = state.story.campaign47a.stepProgress || {};
  state.story.campaign47a.stepProgress['2'] = {
    completed: ['cinder_board', 'compost', 'nest'], updatedAtS: 30,
  };

  return { state, bus, missions, player, credits, resolved };
}

function departForElroy(h) {
  h.bus.emit('dock:undocked', {});
  const mission = h.state.missions.active.find((row) => row.storyTag === CONTRACT_47A_B2_TAG);
  assert.ok(mission, 'departing Tethys dispatches the register writ');
  assert.equal(mission.type, 'bounty_hunt');
  assert.equal(h.state.ui.trackedMissionId, mission.id);
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  const elroy = mission.targetEntityIds
    .map((id) => h.state.entities.get(id))
    .find((entity) => entity && entity.data && entity.data.storyTargetId === 'npc_elroy');
  assert.ok(elroy && elroy.alive, 'the named vessel is a physical mission target');
  return { mission, elroy };
}

test('47-A B2 posts the register writ — scan identifies Elroy, fire resolves force', () => {
  const h = harness();
  const { mission, elroy } = departForElroy(h);
  elroy.pos = { x: 5, z: 0 };

  // Scan first — the UNKNOWN resolves to the filed civilian hull before the tag closes.
  h.bus.emit('scan:completed', { targetId: elroy.id });
  assert.equal(mission.params.investigationStage, 'identified');
  assert.equal(mission.params.identifiedBy, 'scanner');

  h.bus.emit('entity:killed', { id: elroy.id, killerId: h.state.playerId });
  assert.equal(h.resolved.length, 1);
  assert.equal(h.resolved[0].outcome, 'force');
  assert.equal(h.state.story.flags.elroy_outcome, 'force');
  assert.equal(h.state.story.beatIndex, 3, 'the writ closes First Blood when the list is done');
  assert.equal(h.credits.filter((row) => row.amount === 800).length, 1);
  const receipt = h.state.missions.receipts.find((row) => row.missionId === mission.id);
  assert.equal(receipt.outcome, 'completed');
});

test('47-A B2 register writ — the custody reel resolves without a kill', () => {
  const h = harness();
  const { mission, elroy } = departForElroy(h);
  elroy.pos = { x: 5, z: 0 };
  h.bus.emit('scan:completed', { targetId: elroy.id });
  h.bus.emit('tether:reel', { actorId: h.state.playerId, targetId: elroy.id, after: 50 });
  assert.equal(h.resolved.length, 1);
  assert.equal(h.resolved[0].outcome, 'custody');
  assert.equal(h.state.story.flags.elroy_outcome, 'custody');
  assert.equal(h.state.story.beatIndex, 3);
  assert.equal(h.credits.filter((row) => row.amount === 800).length, 1);
  const receipt = h.state.missions.receipts.find((row) => row.missionId === mission.id);
  assert.equal(receipt.outcome, 'completed');
});
