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

function departForRescue(h) {
  h.bus.emit('dock:undocked', {});
  const mission = h.state.missions.active.find((row) => row.storyTag === CONTRACT_47A_B2_TAG);
  assert.ok(mission, 'departing Tethys dispatches the pod rescue');
  assert.equal(mission.type, 'rescue_under_fire');
  assert.equal(h.state.ui.trackedMissionId, mission.id);
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  const pod = mission.targetEntityIds
    .map((id) => h.state.entities.get(id))
    .find((entity) => entity && entity.data && entity.data.physicalRole === 'life_pod');
  assert.ok(pod && pod.alive, 'a life pod is a physical mission target');
  return { mission, pod };
}

test('47-A B2 is a linear pod rescue under fire, not an Elroy choice menu', () => {
  const h = harness();
  const { mission, pod } = departForRescue(h);
  if (![...h.state.entities.values()].some((e) => e && e.type === 'station' && e.data && e.data.stationId === mission.destStationId)) {
    const station = {
      id: 80, type: 'station', alive: true, pos: { x: 80, z: 40 },
      data: { stationId: mission.destStationId, dockRadius: 80 },
    };
    h.state.entities.set(station.id, station);
    h.state.entityList.push(station);
  }
  const berth = [...h.state.entities.values()].find((e) => (
    e && e.type === 'station' && e.data && e.data.stationId === mission.destStationId
  ));
  assert.ok(berth && berth.pos, 'B2 dest berth must exist for the leftover latch-dock');
  h.bus.emit('tether:latched', { targetId: pod.id });
  pod.pos = { x: berth.pos.x, z: berth.pos.z };
  h.bus.emit('dock:docked', { stationId: mission.destStationId });

  assert.equal(h.state.story.beatIndex, 3);
  assert.equal(h.state.story.flags.elroy_outcome, undefined);
  assert.equal(h.resolved.length, 0, 'pod rescue adds no Elroy branch');
  assert.equal(h.credits.filter((row) => row.amount === 800).length, 1);
  const receipt = h.state.missions.receipts.find((row) => row.missionId === mission.id);
  assert.equal(receipt.outcome, 'completed');
});
