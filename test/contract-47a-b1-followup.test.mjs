import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { laneSetMode } from '../src/core/simLaneCommands.js';
import { save } from '../src/save/saveSystem.js';
import { addCargo, removeCargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { onboarding } from '../src/systems/onboarding.js';
import {
  CONTRACT_47A_B1_TAG,
  missions as missionsProto,
} from '../src/systems/missions.js';
import { flightDestinationSurface, resolveFlightObjectiveCommand } from '../src/ui/hud.js';

function harness() {
  const state = createGameState(471);
  state.mode = 'flight';
  state.simTime = 20;
  state.playerId = 1;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_helios_prime';
  let nextId = 10;
  const entities = [
    { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } },
    { id: 2, type: 'asteroid', alive: true, pos: { x: 160, z: -40 },
      data: { typeId: 'ast_common_rock', fieldId: 'f_helios_starter', asteroidSlotId: 'fixture-47a-slot' } },
    { id: 3, type: 'station', alive: true, pos: { x: -400, z: 80 }, data: { stationId: 'station_helios', name: 'Helios Station' } },
  ];
  for (const entity of entities) {
    state.entities.set(entity.id, entity);
    if (entity.id !== 1) state.entityList.push(entity);
  }
  const bus = createBus();
  const credits = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  const helpers = {
    voice: { say: () => true },
    spawnEntity: (spec) => {
      const entity = { ...spec, id: nextId++, alive: true, pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
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
  return { state, bus, missions, credits, asteroid: entities[1] };
}

function activeB1(h) {
  return h.state.missions.active.find((mission) => mission.storyTag === CONTRACT_47A_B1_TAG);
}

const HELIOS = 'sector_helios_prime';
const TETHYS = 'sector_tethys_junction';
const ALLOYS = 'cmdty_alloys';

function bootAtFirstBerth(t, { tutorialAtDock = false } = {}) {
  const bytes = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    get length() { return bytes.size; },
    key: index => [...bytes.keys()][index] ?? null,
    getItem: key => bytes.get(key) ?? null,
    setItem: (key, value) => bytes.set(key, String(value)),
    removeItem: key => bytes.delete(key),
  };
  const sim = createSimulation({ seed: 471, systems: [economy, missionsProto, onboarding, save], updateOrder: [] });
  t.after(() => {
    sim.dispose();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 40;
  state.settings.gameplay.tutorialHints = tutorialAtDock;
  if (tutorialAtDock) {
    sim.registry.get('onboarding').deserialize({
      version: 2, active: true, mainRailActive: true, currentBeatKey: 'dock',
    });
  }
  state.world.currentSectorId = HELIOS;
  state.playerId = sim.spawn({ type: 'ship', hull: 100, radius: 8, pos: { x: 1280, z: -420 } }).id;
  sim.spawn({ type: 'station', pos: { x: 1280, z: -420 }, data: { stationId: 'station_helios', name: 'Helios Station' } });
  state.player.credits = 5000;
  Object.assign(state.player.cargo, { capVolume: 100, capMass: 100 });
  const rock = sim.spawn({ type: 'asteroid', pos: { x: 1640, z: -420 }, radius: 12,
    data: { fieldId: 'f_helios_starter', asteroidSlotId: 'fixture-47a-slot' } });
  const missions = sim.registry.get('missions');
  missions.newGame();
  bus.emit('mining:yield', { minerId: state.playerId, commodityId: 'cmdty_ore_iron', qty: 1, pos: { ...rock.pos } });
  const dock = (stationId, sectorId) => {
    state.world.currentSectorId = sectorId;
    Object.assign(state.ui, { docked: true, dockedStationId: stationId });
    bus.emit('dock:docked', { stationId });
  };
  dock('station_helios', HELIOS);
  assert.equal(state.story.beatIndex, 1);
  const activeAlloyRun = () => state.missions.active.find(m => m.storyTag === 'campaign47a:b1:alloy_run');
  return { state, bus, missions, save: sim.registry.get('save'), dock, activeAlloyRun,
    onboarding: sim.registry.get('onboarding') };
}

function receipt(bus, eventName) {
  return new Promise(resolve => {
    const off = bus.on(eventName, value => { off(); resolve(value); });
  });
}

test('Continue after leaving the first Helios berth points to the open alloy contract before delivery',
  { timeout: 5000 }, async t => {
  const h = bootAtFirstBerth(t, { tutorialAtDock: true });
  assert.equal(h.state.onboarding.beatDoneAt.dock, h.state.simTime);
  assert.equal(h.activeAlloyRun(), undefined);
  const written = receipt(h.bus, 'save:completed');
  h.bus.emit('game:exitToMenu', { source: 'pause' });
  laneSetMode(h.state, h.bus, 'menu');
  const { slot } = await written;
  assert.equal(slot, 'auto');
  const loaded = receipt(h.bus, 'save:loaded');
  h.bus.emit('game:load', { slot });
  await loaded;
  assert.equal(h.state.mode, 'flight');
  assert.equal(h.state.ui.docked, false);
  assert.equal(h.activeAlloyRun(), undefined);
  assert.equal(h.state.nav.waypoint.stationId, 'station_helios');
  const restoredObjective = /Dock at Helios Station.*accept.*Weigh-In/;
  assert.match(flightDestinationSurface(h.state, resolveFlightObjectiveCommand(h.state)).line, restoredObjective);
  h.state.simTime += 5;
  h.onboarding.update(0.25, h.state);
  assert.match(h.state.nav.waypoint.reason, restoredObjective);
  assert.equal(h.state.onboarding.finished, false);
  assert.equal(h.save.save('quick'), true);
  assert.equal(await h.save.load('quick'), true);
  assert.match(h.state.nav.waypoint.reason, restoredObjective);
  assert.equal(h.activeAlloyRun(), undefined);

  h.dock('station_helios', HELIOS);
  const offer = h.missions.ensureBoard('station_helios').slots
    .find(row => row.storyTag === 'campaign47a:b1:alloy_run');
  assert.ok(offer);
  h.bus.emit('ui:acceptMission', { missionId: offer.id });
  const mission = h.activeAlloyRun();
  assert.ok(mission);
  assert.equal(h.state.player.cargo.items[ALLOYS], 6);
  assert.equal(h.state.nav.waypoint.missionId, mission.id);
  assert.equal(h.state.nav.waypoint.stationId, 'station_tethys');
  assert.equal(h.state.onboarding.finished, true);
});

test('Continue restages an already-started flight drill at the completed berth', async t => {
  const h = bootAtFirstBerth(t, { tutorialAtDock: true });
  Object.assign(h.state.ui, { docked: false, dockedStationId: null });
  h.state.simTime += 5;
  h.onboarding.update(0.25, h.state);
  assert.equal(h.onboarding.serialize().currentBeatKey, 'thrust');
  assert.equal(h.save.save('quick'), true);
  assert.equal(await h.save.load('latest'), true);
  assert.equal(h.state.onboarding.active, true);
  assert.equal(h.onboarding.serialize().currentBeatKey, 'thrust');
  assert.ok(!h.state.nav.waypoint || h.state.nav.waypoint.markerId === 'onboarding:thrust');
  assert.equal(h.activeAlloyRun(), undefined);
});

test('the authored alloy run can replace a lost seal after Continue and pays only on delivery', async t => {
  const h = bootAtFirstBerth(t);
  h.bus.emit('dock:undocked', { stationId: 'station_helios' });
  const mission = h.activeAlloyRun();
  assert.ok(mission);
  const credits = h.state.player.credits;
  assert.equal(removeCargo(h.state, ALLOYS, 6), 6);
  h.dock('station_tethys', TETHYS);
  assert.equal(mission.params.cargoRecoveryNeeded, true);
  assert.equal(h.state.nav.waypoint.stationId, 'station_helios');
  assert.match(h.state.nav.waypoint.reason, /Return to Helios Station for replacement cargo/);
  assert.equal(h.state.player.credits, credits);

  assert.equal(h.save.save('quick'), true);
  assert.equal(await h.save.load('latest'), true);
  assert.equal(h.activeAlloyRun().params.cargoRecoveryNeeded, true);
  assert.equal(h.state.nav.waypoint.stationId, 'station_helios');
  const replacements = [];
  h.bus.on('toast', value => {
    if (value.text?.startsWith('Replacement sealed.')) replacements.push(value.text);
  });
  h.dock('station_helios', HELIOS);
  assert.equal(h.activeAlloyRun().params.cargoRecoveryNeeded, false);
  assert.equal(h.state.player.cargo.items[ALLOYS], 6);
  assert.equal(h.state.nav.waypoint.stationId, 'station_tethys');
  assert.equal(h.state.player.credits, credits);
  h.dock('station_helios', HELIOS);
  assert.equal(h.state.player.cargo.items[ALLOYS], 6);
  assert.deepEqual(replacements, ['Replacement sealed. Deliver it to Tethys Trade Hub.']);
  assert.equal(addCargo(h.state, ALLOYS, 2), 2);
  h.dock('station_tethys', TETHYS);
  h.dock('station_tethys', TETHYS);
  assert.equal(h.state.player.cargo.items[ALLOYS], 2);
  assert.equal(h.state.player.credits, credits + 600);
  assert.equal(h.state.missions.receipts.filter(r => r.missionId === mission.id && r.outcome === 'completed').length, 1);
});

test('replacement stock restores only the undelivered part of an accounted alloy manifest', t => {
  const h = bootAtFirstBerth(t);
  h.bus.emit('dock:undocked', { stationId: 'station_helios' });
  const mission = h.activeAlloyRun();
  assert.ok(mission);
  const credits = h.state.player.credits;
  assert.deepEqual(h.missions.deliverSealedPortion(mission.id, 2), { ok: true, removed: 2, remaining: 4 });
  assert.equal(removeCargo(h.state, ALLOYS, 3), 3);
  h.dock('station_tethys', TETHYS);
  assert.equal(mission.params.cargoRecoveryNeeded, true);
  assert.equal(h.state.player.cargo.items[ALLOYS], 1);
  assert.equal(h.state.player.credits, credits);
  h.dock('station_helios', HELIOS);
  assert.equal(h.state.player.cargo.items[ALLOYS], 4);
  assert.equal(mission.params.cargoRecoveryNeeded, false);
  assert.equal(h.state.player.credits, credits);
});

test('47-A settlement dispatches the sealed alloy run — §34.7 Book 1 first post', () => {
  const h = harness();
  h.bus.emit('mining:yield', {
    commodityId: 'cmdty_ore_iron', qty: 1, minerId: 1, pos: { ...h.asteroid.pos },
  });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);
  const activeB1 = () => h.state.missions.active
    .find((mission) => mission.storyTag === 'campaign47a:b1:alloy_run');
  assert.equal(activeB1(), undefined, 'follow-up waits until the player departs the settlement dock');

  h.bus.emit('dock:undocked', {});
  const mission = activeB1();
  assert.ok(mission, 'undock dispatches the book’s first Honest Work contract');
  assert.equal(mission.type, 'cargo_delivery');
  // the receiving berth is Tethys (destStationId), so the title names the job, not a station
  assert.equal(mission.title, 'Weigh-In — sealed alloy delivery');
  assert.equal(mission.preloadedCargo, true, 'the crate is sealed aboard');
  assert.equal(mission.params.silentRecat, true);
  assert.equal(h.state.ui.trackedMissionId, mission.id);

  // The sealed crate settles its list step at Tycho — but Book 1 stays open:
  // Scale 4 and the furnace detail are still owed before the beat advances.
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(mission.status, 'completed');
  assert.equal(h.state.story.beatIndex, 1, 'the alloy run alone cannot close the book');
  const receipt = h.state.missions.receipts.find((row) => row.missionId === mission.id);
  assert.equal(receipt.outcome, 'completed');
  assert.equal(receipt.rewardCr, 600, 'the posted offer pays exactly once');
  assert.equal(h.credits.some((row) => row.reason === 'story:honest_work'), false, 'B1 reward only follows the whole list');
});
