import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { receiverPosition, UNDERSTORY_RECEIVER } from '../src/data/understoryReceiver.js';
import { missions as missionsProto } from '../src/systems/missions.js';

function harness() {
  const state = createGameState(472);
  state.mode = 'flight';
  state.playerId = 1;
  state.world.currentSectorId = UNDERSTORY_RECEIVER.sectorId;
  state.story.beatIndex = 2;
  state.story.campaign47a ||= {};
  state.story.campaign47a.stepProgress = {
    ...(state.story.campaign47a.stepProgress || {}),
    '2': { completed: ['cinder_board'], updatedAtS: 1 },
  };
  state.player.cargo = { items: { cmdty_ore_iron: 5 }, usedVolume: 5, usedMass: 4, capVolume: 100, capMass: 200 };
  const player = { id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {
      derived: { operationalMass: 100, propulsion: { mainAccel: 100 } },
    } };
  state.entities.set(player.id, player);
  const garden = { id: 2, type: 'garden', factionId: 'faction_understory', alive: true,
    hull: 100, pos: receiverPosition(), radius: 90,
    data: { understoryGarden: true, gardenId: UNDERSTORY_RECEIVER.gardenId,
      gardenStage: 1, gardenBiomass: UNDERSTORY_RECEIVER.initialBiomass, compostFedMass: 0 } };
  state.entities.set(garden.id, garden);
  state.entityList.push(player, garden);
  const registry = { get(id) {
    if (id === 'understoryGardens') return { gardenFeedMass: () => null };
    if (id === 'cargo') return { jettison() {} };
    if (id === 'lootShards') return { gardenFeedMass: () => null };
    return null;
  } };
  const missions = Object.assign({}, missionsProto, { state, registry });
  return { state, missions };
}

test('47-A compost waypoint reflects free feed without changing cargo or the safe receiver approach', () => {
  const { state, missions } = harness();
  const before = JSON.stringify({ cargo: state.player.cargo, garden: state.entities.get(2).data });
  const waypoint = missions._storyWaypointForBeat({ beat: 2, id: 'first_blood' });
  assert.equal(waypoint.label, `Compost Run — ${UNDERSTORY_RECEIVER.name} west outside-mouth approach`);
  assert.equal(waypoint.targetEntityId, null, 'the route remains a safe outside-mouth staging point');
  assert.deepEqual(waypoint.pos, {
    x: receiverPosition().x + UNDERSTORY_RECEIVER.approachOffset.x,
    z: receiverPosition().z + UNDERSTORY_RECEIVER.approachOffset.z,
  });
  assert.match(waypoint.reason, /free Iron Ore: jettison 5u \(4t feed\)/);
  assert.doesNotMatch(waypoint.reason, /mine ordinary iron.*17u/i,
    'do not direct the player to mine when enough free cargo is already available');
  assert.equal(JSON.stringify({ cargo: state.player.cargo, garden: state.entities.get(2).data }), before,
    'navigation is a read-only projection');

  state.player.cargo.items.cmdty_ore_iron = 0;
  state.player.cargo.usedVolume = 0;
  state.player.cargo.usedMass = 0;
  const withoutCargo = missions._storyWaypointForBeat({ beat: 2, id: 'first_blood' });
  assert.doesNotMatch(withoutCargo.reason, /free Iron Ore/);
  assert.doesNotMatch(withoutCargo.reason, /jettison 17u/,
    'a missing eligible source is not represented as a guaranteed supply');
});

test('nearest ore guidance reads eligible dormant field records without promoting them', async () => {
  const { nearestMiningResourceFace } = await import('../src/missions/starterWorkday.js');
  const state = createGameState(472);
  const good = { id: 'field-iron', type: 'asteroid', alive: true, fieldResident: true,
    pos: { x: 10, z: 0 }, sectorId: UNDERSTORY_RECEIVER.sectorId,
    data: { typeId: 'ast_metallic', oreHP: 20, sectorId: UNDERSTORY_RECEIVER.sectorId } };
  const wrongOre = { ...good, id: 'field-ice', pos: { x: 1, z: 0 },
    data: { ...good.data, typeId: 'ast_icy' } };
  const tagged = { ...good, id: 'mission-iron', pos: { x: 2, z: 0 },
    data: { ...good.data, missionTag: 'protected-contract' } };
  state.world.asteroidField = { schema: 'spaceface.asteroidField.v1', rocks: [wrongOre, tagged, good] };
  state.entities.delete(good.id);
  const before = JSON.stringify(state.world.asteroidField.rocks);
  const result = nearestMiningResourceFace(state, {
    sectorId: UNDERSTORY_RECEIVER.sectorId, center: { x: 0, z: 0 }, commodityId: 'cmdty_ore_iron',
  }, [{ id: 'ast_metallic', oreTable: { cmdty_ore_iron: 1 } }, { id: 'ast_icy', oreTable: { cmdty_ore_iron: 0 } }]);
  assert.equal(result.face, good);
  assert.equal(result.distance, 10);
  assert.equal(JSON.stringify(state.world.asteroidField.rocks), before);
  assert.equal(state.entities.has(good.id), false, 'navigation does not materialize the dormant rock');
});
