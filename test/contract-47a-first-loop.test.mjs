import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { removeCargo } from '../src/systems/cargo.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import {
  CONTRACT_47A_B0_TAG,
  CONTRACT_47A_SAMPLE_ID,
  missions as missionsProto,
} from '../src/systems/missions.js';

function harness(seed = 47) {
  const state = createGameState(seed);
  state.world.currentSectorId = 'sector_helios_prime';
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  const asteroid = { id: 2, type: 'asteroid', alive: true, pos: { x: 180, z: -60 }, data: { typeId: 'ast_common_rock', fieldId: 'f_helios_starter', asteroidSlotId: 'fixture-47a-slot' } };
  const station = { id: 3, type: 'station', alive: true, pos: { x: -420, z: 100 }, data: { stationId: 'station_helios', name: 'Helios Station' } };
  state.entities.set(2, asteroid);
  state.entities.set(3, station);
  state.entityList.push(asteroid, station);
  state.onboarding = { active: false, finished: true };
  state.settings.gameplay.tutorialHints = false;

  const bus = createBus();
  const credits = [];
  const rep = [];
  const toasts = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  bus.on('faction:repDelta', (payload) => rep.push(payload));
  bus.on('toast', (payload) => toasts.push(payload));
  const helpers = {
    voice: { say: () => true },
    mulberry32: (value) => {
      let a = value >>> 0;
      return () => ((a = (a + 0x6D2B79F5) >>> 0) / 4294967296);
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  missions.newGame();
  return { state, bus, missions, asteroid, station, credits, rep, toasts };
}

function contract(h) {
  return h.state.missions.active.find((mission) => mission.storyTag === CONTRACT_47A_B0_TAG);
}

test('Contract 47-A is received, located, recovered, delivered and settled once', () => {
  const h = harness();
  const mission = contract(h);
  assert.ok(mission, 'new game receives one active 47-A recovery order');
  assert.equal(h.state.ui.trackedMissionId, mission.id);
  assert.equal(h.state.nav.waypoint.label, '47-A Recovery Site');
  assert.deepEqual(h.state.nav.waypoint.pos, h.asteroid.pos);
  assert.match(h.state.nav.waypoint.reason, /Recover the 47-A sample/);

  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 0, 'dock-before-recovery cannot skip the contract');
  assert.ok(contract(h), 'failed delivery remains recoverable');

  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: 1, pos: { x: 900, z: 900 } });
  assert.equal(h.state.player.cargo.items[CONTRACT_47A_SAMPLE_ID], undefined, 'unmarked rock cannot mint evidence');
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: 1, pos: { ...h.asteroid.pos } });
  assert.equal(h.state.player.cargo.items[CONTRACT_47A_SAMPLE_ID], 1);
  assert.ok(h.state.story.persistentCargo.includes(CONTRACT_47A_SAMPLE_ID), 'sample is protected in transit');
  assert.equal(removeCargo(h.state, CONTRACT_47A_SAMPLE_ID, 1), 0, 'sample cannot be discarded before delivery');
  assert.match(h.state.nav.waypoint.reason, /Deliver the 47-A sample/);
  assert.deepEqual(h.state.nav.waypoint.pos, h.station.pos);

  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);
  assert.equal(h.state.player.cargo.items[CONTRACT_47A_SAMPLE_ID], undefined);
  assert.equal(h.state.story.persistentCargo.includes(CONTRACT_47A_SAMPLE_ID), false);
  assert.equal(contract(h), undefined);
  assert.equal(h.credits.filter((row) => row.amount === 400).length, 1, 'canonical story reward lands once');
  assert.ok(h.rep.some((row) => row.factionId === 'faction_scn' && row.delta === 5));
  const receipt = h.state.missions.receipts.find((row) => row.missionId === mission.id);
  assert.equal(receipt.outcome, 'completed');
  assert.equal(receipt.rewardCr, 400);
  assert.ok(h.toasts.some((row) => /Contract 47-A.*\+400 cr/.test(row.text)));
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.credits.filter((row) => row.amount === 400).length, 1, 'repeat dock cannot duplicate settlement');
});

test('recovery site fix survives the bound body shelving to its field record', () => {
  const h = harness();
  const mission = contract(h);
  assert.ok(mission, 'new game receives one active 47-A recovery order');
  const site = h.missions.contract47aSampleSite();
  assert.ok(site && site.live === true && site.pos, 'bound body is the live site while materialized');
  assert.deepEqual(site.pos, h.asteroid.pos);

  // The far-actor regime shelves the body: entity removed, durable record takes the identity.
  const shelf = insertAsteroidFieldRock(h.state, {
    id: h.asteroid.id,
    pos: { x: h.asteroid.pos.x, z: h.asteroid.pos.z },
    radius: 8, mass: 400, hull: 100, hullMax: 100,
    data: { ...h.asteroid.data },
  });
  h.state.entities.delete(h.asteroid.id);
  h.state.entityList.length = 0;
  assert.equal(h.missions.contract47aSampleEntity(), null, 'live read must not fake a shelved body');

  const shelved = h.missions.contract47aSampleSite();
  assert.ok(shelved && shelved.live === false, 'the recorded fix keeps the site while shelved');
  assert.deepEqual(shelved.pos, mission.params.samplePos,
    'the display fix is the recorded site, never a substitute body');

  // The seam lesson promotes the durable record back rather than staging a substitute rock.
  h.missions.helpers.spawnEntity = (spec) => {
    const ent = { alive: true, vel: { x: 0, z: 0 }, ...spec };
    h.state.entities.set(ent.id, ent);
    h.state.entityList.push(ent);
    return ent;
  };
  const promoted = h.missions.promoteContract47aSample();
  assert.ok(promoted && promoted.id === shelf.id, 'promote re-mints the bound body by durable id');
  assert.equal(h.missions.contract47aSampleEntity(), promoted, 'the promoted body is the live source again');
});

test('the first visit to Helios before the sample is cut says nothing about a missing sample', () => {
  const h = harness(48);
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  const mission = contract(h);
  assert.ok(mission, 'the 47-A contract stays active');
  assert.notEqual(mission.params.sampleRecovered, true);
  assert.ok(!h.toasts.some((row) => /sample missing|re-marked/i.test(row.text)),
    'docking before the seam is not a loss');
});

test('missing sample re-marks recovery instead of dead-ending delivery', () => {
  const h = harness(48);
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: 1, pos: { ...h.asteroid.pos } });
  h.state.story.persistentCargo = [];
  assert.equal(removeCargo(h.state, CONTRACT_47A_SAMPLE_ID, 1), 1);
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  const mission = contract(h);
  assert.ok(mission);
  assert.equal(mission.params.sampleRecovered, false);
  assert.match(h.state.nav.waypoint.reason, /Recover the 47-A sample/);
  assert.ok(h.toasts.some((row) => /Recovery site re-marked/.test(row.text)));
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: 1, pos: { ...h.asteroid.pos } });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);
});
