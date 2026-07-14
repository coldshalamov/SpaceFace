import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import {
  CAREER_ORIGINS_EVENTS,
  createCareerOriginsSystem,
  deserializeCareerOrigins,
  serializeCareerOrigins,
} from '../src/careers/origins/careerOrigins.js';
import { buildMissionLogOriginChoiceModel } from '../src/ui/careerLadderView.js';
import { objectiveText } from '../src/ui/screens/missionLog.js';
import { missions as missionsPrototype } from '../src/systems/missions.js';

function seedMarkets(state) {
  state.economy.markets = {
    station_helios: {
      cmdty_food: { stock: 80, lastMid: 18, lastBuy: 20, lastSell: 16, role: 'produce' },
      cmdty_fuel_cells: { stock: 60, lastMid: 28, lastBuy: 30, lastSell: 26, role: 'produce' },
    },
    station_coalition: {
      cmdty_food: { stock: 20, lastMid: 26, lastBuy: 28, lastSell: 24, role: 'consume' },
    },
    station_ceres: {
      cmdty_fuel_cells: { stock: 15, lastMid: 38, lastBuy: 40, lastSell: 36, role: 'consume' },
      cmdty_ore_iron: { stock: 20, lastMid: 34, lastBuy: 36, lastSell: 32, role: 'consume' },
    },
    station_beltout: {
      cmdty_ore_iron: { stock: 80, lastMid: 24, lastBuy: 26, lastSell: 22, role: 'produce' },
    },
  };
}

function harness(seed = 12001) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  state.playerId = 1;
  state.player.moduleInventory = [];
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 100 };
  state.world.currentSectorId = 'sector_helios_prime';
  seedMarkets(state);

  const player = {
    id: state.playerId, type: 'ship', isPlayer: true, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);

  const bus = createBus();
  const credits = [];
  const completions = [];
  let entitySeq = 100;
  const helpers = {
    hash32,
    mulberry32,
    player: () => player,
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: entitySeq++,
        alive: true,
        pos: { ...spec.pos },
        vel: { x: 0, z: 0 },
        data: structuredClone(spec.data || {}),
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const missionSystem = { ...missionsPrototype };
  const originSystem = createCareerOriginsSystem();
  const ships = { grantModule: () => true };
  const registry = {
    get(name) {
      if (name === 'missions') return missionSystem;
      if (name === 'careerOrigins') return originSystem;
      if (name === 'ships') return ships;
      return null;
    },
  };
  missionSystem.init({ state, bus, helpers });
  originSystem.init({ state, bus, registry });
  bus.on('economy:grantCredits', (payload) => credits.push({ ...payload }));
  bus.on('mission:completed', (payload) => completions.push({ ...payload }));
  bus.emit('game:started', {});
  return { state, bus, missionSystem, originSystem, registry, credits, completions };
}

test('Hauler starts with a sealed physical manifest, delivers it, and persists the next contract', () => {
  const h = harness(12002);
  h.bus.emit(CAREER_ORIGINS_EVENTS.ACCEPT, { careerId: 'hauler' });

  const mission = h.state.missions.active.find((row) => row.storyTag === 'origin.hauler.v1:manifest_truth');
  assert.equal(mission.type, 'cargo_delivery');
  assert.equal(mission.preloadedCargo, true);
  assert.equal(h.state.player.cargo.items.cmdty_food, 8);
  assert.equal(mission.destStationId, 'station_coalition');

  h.bus.emit('dock:docked', { stationId: 'station_coalition' });
  assert.equal(h.state.player.cargo.items.cmdty_food, undefined);
  assert.equal(h.state.careers.origins.hauler.status, 'offered');
  assert.equal(h.state.careers.origins.hauler.stepIndex, 1);
  let model = buildMissionLogOriginChoiceModel(h.state, h.registry);
  let hauler = model.cards.find((card) => card.careerId === 'hauler');
  assert.equal(hauler.canOriginAccept, false, 'service class must be chosen before the bonded run');
  assert.equal(hauler.canChoose, true);
  assert.deepEqual(hauler.choices.map((choice) => choice.id), ['bonded_express', 'open_manifest']);
  assert.match(hauler.choiceSummary, /1,100 cr payout/);
  assert.match(hauler.choiceSummary, /no bond/);

  h.bus.emit(CAREER_ORIGINS_EVENTS.CHOOSE, {
    careerId: 'hauler', choiceId: 'open_manifest', source: 'test',
  });
  model = buildMissionLogOriginChoiceModel(h.state, h.registry);
  hauler = model.cards.find((card) => card.careerId === 'hauler');
  assert.equal(hauler.canOriginAccept, true);
  assert.equal(hauler.selectedChoiceId, 'open_manifest');
  assert.match(hauler.receiptLine, /no bond/);
  assert.equal(h.credits.some((row) => row.amount === 1120 && String(row.reason).startsWith('mission:')), true);

  const loaded = createGameState(12002);
  deserializeCareerOrigins(loaded, serializeCareerOrigins(h.state));
  assert.equal(loaded.careers.origins.hauler.stepIndex, 1);
  assert.equal(loaded.careers.origins.hauler.status, 'offered');
  assert.equal(loaded.careers.origins.hauler.choicesByStep.route_risk, 'open_manifest');
});

test('Hauler service class changes real mission stakes, is immutable in flight, and survives retry', () => {
  const h = harness(12006);
  h.bus.emit(CAREER_ORIGINS_EVENTS.ACCEPT, { careerId: 'hauler' });
  const first = h.state.missions.active.find((row) => row.storyTag === 'origin.hauler.v1:manifest_truth');
  h.bus.emit('dock:docked', { stationId: first.destStationId });

  const beforeBlockedAccept = h.state.missions.active.length;
  assert.equal(h.originSystem.accept('hauler').reason, 'choice_required');
  assert.equal(h.state.missions.active.length, beforeBlockedAccept,
    'blocked accept cannot post an unchosen mission');
  assert.equal(h.originSystem.choose('hauler', 'open_manifest').ok, true);
  assert.equal(h.originSystem.accept('hauler').ok, true);

  let own = h.state.careers.origins.hauler;
  let mission = h.state.missions.active.find((row) => row.id === own.activeContract.missionId);
  assert.equal(own.activeContract.choiceId, 'open_manifest');
  assert.equal(own.activeContract.reward_cr, 920);
  assert.equal(own.activeContract.collateral_cr, 0);
  assert.equal(own.activeContract.deadlineS - own.acceptedAtS, 300);
  assert.equal(mission.reward_cr, 920);
  assert.equal(mission.collateral_cr, 0);
  assert.match(mission.mapLabel, /no collateral/);
  const openObjective = objectiveText(mission);
  assert.match(openObjective, /OPEN.*longer window.*no collateral/i);

  const bonded = harness(12007);
  bonded.bus.emit(CAREER_ORIGINS_EVENTS.ACCEPT, { careerId: 'hauler' });
  const bondedFirst = bonded.state.missions.active.find(
    (row) => row.storyTag === 'origin.hauler.v1:manifest_truth',
  );
  bonded.bus.emit('dock:docked', { stationId: bondedFirst.destStationId });
  bonded.state.player.credits = 80;
  assert.equal(bonded.originSystem.choose('hauler', 'bonded_express').ok, true);
  assert.equal(bonded.originSystem.accept('hauler').ok, true);
  const bondedOwn = bonded.state.careers.origins.hauler;
  const bondedMission = bonded.state.missions.active.find(
    (row) => row.id === bondedOwn.activeContract.missionId,
  );
  const bondedObjective = objectiveText(bondedMission);
  assert.match(bondedObjective, /EXPRESS.*short clock.*80 cr bond at risk/i);
  assert.notEqual(bondedObjective, openObjective,
    'accepted service classes must render distinct active objective text');
  assert.equal(h.originSystem.choose('hauler', 'bonded_express').reason, 'bad_status:active');

  h.missionSystem.abandonMission(mission.id);
  own = h.state.careers.origins.hauler;
  assert.equal(own.status, 'step_failed');
  assert.equal(own.choicesByStep.route_risk, 'open_manifest');
  h.state.simTime += 13;
  assert.equal(h.originSystem.reoffer('hauler').ok, true);
  assert.equal(h.originSystem.accept('hauler').ok, true);
  own = h.state.careers.origins.hauler;
  mission = h.state.missions.active.find((row) => row.id === own.activeContract.missionId);
  assert.equal(own.activeContract.choiceId, 'open_manifest');
  assert.equal(mission.reward_cr, 782, 'retry decay applies to the selected service class');
  assert.equal(mission.collateral_cr, 0);

  const saved = serializeCareerOrigins(h.state);
  const restored = createGameState(12006);
  deserializeCareerOrigins(restored, saved);
  assert.equal(restored.careers.origins.hauler.activeContract.choiceId, 'open_manifest');
  assert.equal(restored.careers.origins.hauler.activeContract.reward_cr, 782);
});

test('Hunter first writ materializes one named hostile and advances only on the player kill', () => {
  const h = harness(12003);
  h.bus.emit(CAREER_ORIGINS_EVENTS.ACCEPT, { careerId: 'hunter' });

  let route = h.state.careers.origins.__meta.routes.hunter;
  const mission = h.state.missions.active.find((row) => row.id === route.activeMissionId);
  assert.equal(mission.type, 'bounty_hunt');
  assert.equal(mission.targetEntityIds.length, 1);
  const mark = h.state.entities.get(mission.targetEntityIds[0]);
  assert.equal(mark.data.name, 'Rook Nine');
  assert.equal(mark.data.missionPinned, true);

  h.bus.emit('entity:killed', { id: mark.id, killerId: 999, type: 'ship' });
  assert.equal(h.state.careers.origins.__meta.routes.hunter.contractIndex, 0);
  h.bus.emit('entity:killed', { id: mark.id, killerId: h.state.playerId, type: 'ship' });
  route = h.state.careers.origins.__meta.routes.hunter;
  assert.equal(route.contractIndex, 1);
  assert.equal(route.status, 'active');
  assert.equal(h.credits.some((row) => row.amount === 180), true);
  assert.equal(h.completions[0].factionId, 'faction_scn');
});

test('Prospector survey requires an asteroid reading and a mined sample before reward/progress', () => {
  const h = harness(12004);
  h.bus.emit(CAREER_ORIGINS_EVENTS.ACCEPT, { careerId: 'prospector' });
  let route = h.state.careers.origins.__meta.routes.prospector;
  let mission = h.state.missions.active.find((row) => row.id === route.activeMissionId);
  assert.equal(mission.type, 'recon_scan');
  assert.equal(mission.params.originSurveySample, true);

  h.state.world.currentSectorId = 'sector_ceres_belt';
  h.bus.emit('scan:completed', { sectorId: 'sector_ceres_belt', found: { stations: 1 } });
  assert.equal(mission.objectiveProgress, 0, 'a generic contact scan is not a deposit survey');
  h.bus.emit('scan:completed', { sectorId: 'sector_ceres_belt', found: { asteroids: 1 } });
  assert.equal(mission.params.surveyComplete, true);
  assert.equal(mission.objectiveProgress, 1);
  assert.equal(h.credits.length, 0, 'survey alone does not close the extraction contract');

  h.bus.emit('mining:yield', {
    minerId: h.state.playerId, commodityId: 'cmdty_ore_iron', qty: 2,
  });
  assert.equal(mission.objectiveProgress, 3);
  h.bus.emit('mining:yield', {
    minerId: h.state.playerId, commodityId: 'cmdty_ore_iron', qty: 1,
  });
  route = h.state.careers.origins.__meta.routes.prospector;
  assert.equal(route.contractIndex, 1);
  assert.equal(h.credits.some((row) => row.amount === 220), true);
  assert.equal(h.state.player.researchPoints, 3);
});

test('failed sealed manifest removes contract cargo and reissues one replacement load', () => {
  const h = harness(12005);
  h.bus.emit(CAREER_ORIGINS_EVENTS.ACCEPT, { careerId: 'hauler' });
  const firstMission = h.state.missions.active.find((row) => row.storyTag === 'origin.hauler.v1:manifest_truth');
  assert.equal(h.state.player.cargo.items.cmdty_food, 8);

  h.missionSystem.abandonMission(firstMission.id);
  assert.equal(h.state.player.cargo.items.cmdty_food, undefined);
  assert.equal(h.state.careers.origins.hauler.status, 'step_failed');
  const failedSave = serializeCareerOrigins(h.state);
  assert.equal(failedSave.origins.hauler.status, 'step_failed');

  h.state.simTime += 13;
  h.bus.emit(CAREER_ORIGINS_EVENTS.REOFFER, { careerId: 'hauler' });
  h.bus.emit(CAREER_ORIGINS_EVENTS.ACCEPT, { careerId: 'hauler' });
  assert.equal(h.state.player.cargo.items.cmdty_food, 8);
  const replacement = h.state.missions.active.find((row) => row.storyTag === 'origin.hauler.v1:manifest_truth');
  assert.ok(replacement);
  assert.notEqual(replacement.id, firstMission.id);
});
