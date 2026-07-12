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

  return { state, bus, missions, player, credits, resolved };
}

function departForElroy(h) {
  h.bus.emit('dock:undocked', {});
  const mission = h.state.missions.active.find((row) => row.storyTag === CONTRACT_47A_B2_TAG);
  assert.ok(mission, 'departing Tethys dispatches the authored B2 investigation');
  assert.equal(h.state.ui.trackedMissionId, mission.id);
  assert.match(h.state.nav.waypoint.reason, /scan the marked vessel/i);

  h.state.world.currentSectorId = 'sector_charon_expanse';
  h.bus.emit('sector:enter', { sectorId: 'sector_charon_expanse' });
  const target = h.state.entities.get(mission.targetEntityIds[0]);
  assert.ok(target && target.alive, 'Elroy is a physical mission target');
  assert.equal(target.data.storyTargetId, 'npc_elroy');
  return { mission, target };
}

function identifyElroy(h, mission, target) {
  h.state.player.targetId = target.id;
  h.player.pos.x = target.pos.x + 1300;
  h.player.pos.z = target.pos.z;
  h.bus.emit('scan:completed', { targetId: null });
  assert.notEqual(mission.params.investigationStage, 'identified', 'an out-of-range scan cannot identify Elroy');

  h.player.pos.x = target.pos.x + 100;
  h.bus.emit('scan:completed', { targetId: null });
  assert.equal(mission.params.investigationStage, 'identified');
  assert.match(h.state.nav.waypoint.reason, /fire.*reel|reel.*fire/i);
}

test('47-A B2 identifies Elroy then resolves deterministic custody or force', () => {
  const custody = harness();
  const custodyRun = departForElroy(custody);
  identifyElroy(custody, custodyRun.mission, custodyRun.target);
  custody.bus.emit('tether:reel', {
    actorId: custody.state.playerId,
    targetId: custodyRun.target.id,
    before: 72,
    after: 60,
  });

  assert.equal(custody.state.story.beatIndex, 3);
  assert.equal(custody.state.story.flags.elroy_outcome, 'custody');
  assert.equal(custody.resolved.length, 1);
  assert.equal(custody.resolved[0].outcome, 'custody');
  assert.equal(custody.credits.filter((row) => row.amount === 800).length, 1);
  const custodyReceipt = custody.state.missions.receipts.find((row) => row.missionId === custodyRun.mission.id);
  assert.equal(custodyReceipt.storyOutcome, 'custody');
  assert.equal(custodyRun.target.alive, false, 'custody removes Elroy from combat without a kill');

  const force = harness();
  const forceRun = departForElroy(force);
  identifyElroy(force, forceRun.mission, forceRun.target);
  force.bus.emit('entity:killed', { id: forceRun.target.id, killerId: force.state.playerId });

  assert.equal(force.state.story.beatIndex, 3);
  assert.equal(force.state.story.flags.elroy_outcome, 'force');
  assert.equal(force.resolved.length, 1);
  assert.equal(force.resolved[0].outcome, 'force');
  assert.equal(force.credits.filter((row) => row.amount === 800).length, 1);
  const forceReceipt = force.state.missions.receipts.find((row) => row.missionId === forceRun.mission.id);
  assert.equal(forceReceipt.storyOutcome, 'force');
});
