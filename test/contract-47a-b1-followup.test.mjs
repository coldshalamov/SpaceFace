import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { removeCargo } from '../src/systems/cargo.js';
import {
  CONTRACT_47A_B1_TAG,
  missions as missionsProto,
} from '../src/systems/missions.js';

function harness() {
  const state = createGameState(471);
  state.mode = 'flight';
  state.simTime = 20;
  state.playerId = 1;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  const entities = [
    { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } },
    { id: 2, type: 'asteroid', alive: true, pos: { x: 160, z: -40 }, data: { typeId: 'ast_common_rock' } },
    { id: 3, type: 'station', alive: true, pos: { x: -400, z: 80 }, data: { stationId: 'station_helios', name: 'Helios Station' } },
    { id: 4, type: 'station', alive: true, pos: { x: 2200, z: -500 }, data: { stationId: 'station_tethys', name: 'Tethys Relay' } },
  ];
  for (const entity of entities) {
    state.entities.set(entity.id, entity);
    if (entity.id !== 1) state.entityList.push(entity);
  }
  const bus = createBus();
  const credits = [];
  const toasts = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  bus.on('toast', (payload) => toasts.push(payload));
  const helpers = {
    voice: { say: () => true },
    mulberry32: (seed) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let value = a;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  missions.newGame();
  return { state, bus, missions, credits, toasts, asteroid: entities[1] };
}

function activeB1(h) {
  return h.state.missions.active.find((mission) => mission.storyTag === CONTRACT_47A_B1_TAG);
}

test('47-A settlement dispatches a physical Tycho investigation with cargo recovery', () => {
  const h = harness();
  h.bus.emit('mining:yield', {
    commodityId: 'cmdty_ore_iron', qty: 1, minerId: 1, pos: { ...h.asteroid.pos },
  });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);
  assert.equal(activeB1(h), undefined, 'follow-up waits until the player departs the settlement dock');

  h.bus.emit('dock:undocked', {});
  const mission = activeB1(h);
  assert.ok(mission, 'undock dispatches the authored Kessler follow-up');
  assert.equal(mission.title, '47-A FOLLOW-UP — TYCHO VARIANCE');
  assert.equal(h.state.ui.trackedMissionId, mission.id);
  assert.equal(h.state.player.cargo.items.cmdty_alloys, 4);
  assert.equal(h.state.nav.waypoint.stationId, 'station_tethys');
  assert.match(h.state.nav.waypoint.reason, /Deliver sealed alloys to Tycho; compare the manifest/);

  assert.equal(removeCargo(h.state, 'cmdty_alloys', 4), 4);
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.ok(activeB1(h), 'missing cargo cannot complete or erase the investigation');
  assert.equal(mission.params.cargoRecoveryNeeded, true);
  assert.equal(h.state.nav.waypoint.stationId, 'station_helios');
  assert.match(h.state.nav.waypoint.reason, /Return to Helios for replacement cargo/);

  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.player.cargo.items.cmdty_alloys, 4);
  assert.equal(mission.params.cargoRecoveryNeeded, false);
  assert.equal(h.state.nav.waypoint.stationId, 'station_tethys');
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(h.state.story.beatIndex, 2);
  assert.equal(activeB1(h), undefined);
  assert.equal(h.credits.filter((row) => row.amount === 600).length, 1);
  assert.equal(h.credits.some((row) => row.reason === 'story:honest_work'), false, 'B1 reward cannot double-pay');
  const receipt = h.state.missions.receipts.find((row) => row.missionId === mission.id);
  assert.equal(receipt.outcome, 'completed');
  assert.equal(receipt.rewardCr, 600);
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(h.credits.filter((row) => row.amount === 600).length, 1);
});
