import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CAREER_ORIGINS_EVENTS,
  createCareerOriginsSystem,
  deserializeCareerOrigins,
  serializeCareerOrigins,
} from '../src/careers/origins/careerOrigins.js';
import { buildMissionLogOriginChoiceModel } from '../src/ui/careerLadderView.js';

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

function harness(seed = 9081) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  state.playerId = 1;
  state.player.moduleInventory = [];
  state.world.currentSectorId = 'sector_helios_prime';
  seedMarkets(state);
  const bus = createBus();
  const posted = [];
  const granted = [];
  let missionSeq = 0;
  const missions = {
    postAndAcceptAuthoredOffer(offer) {
      posted.push(structuredClone(offer));
      missionSeq += 1;
      return { ok: true, offerId: offer.id, missionId: `origin_mission_${missionSeq}` };
    },
  };
  const ships = {
    grantModule(payload) {
      granted.push({ ...payload });
      state.player.moduleInventory.push({ instanceId: `kit_${granted.length}`, defId: payload.defId });
      return true;
    },
  };
  const system = createCareerOriginsSystem();
  const registry = {
    get(name) {
      if (name === 'careerOrigins') return system;
      if (name === 'missions') return missions;
      if (name === 'ships') return ships;
      return null;
    },
  };
  system.init({ state, bus, registry });
  return { state, bus, system, registry, posted, granted };
}

test('fresh flight exposes three distinct origin starts in Mission Log without docking', () => {
  const h = harness();
  const bundles = [];
  h.bus.on(CAREER_ORIGINS_EVENTS.OFFERED, (payload) => bundles.push(payload));

  h.bus.emit('game:started', {});

  assert.equal(bundles.length, 1);
  assert.deepEqual(bundles[0].offers.map((offer) => offer.careerId), [
    'hauler', 'hunter', 'prospector',
  ]);
  const model = buildMissionLogOriginChoiceModel(h.state, h.registry);
  assert.equal(model.visible, true);
  assert.deepEqual(model.cards.map((card) => card.careerId), ['hauler', 'hunter', 'prospector']);
  assert.deepEqual(model.cards.map((card) => card.verb), ['carry', 'intercept', 'survey']);
  assert.equal(model.cards.every((card) => card.canOriginAccept), true);
  assert.equal(model.cards.every((card) => card.upgradeKit?.defId), true);
});

test('first accepted origin persists as primary and immediately issues its distinct starter kit', () => {
  const h = harness(9082);
  h.bus.emit('game:started', {});

  h.bus.emit(CAREER_ORIGINS_EVENTS.ACCEPT, { careerId: 'prospector' });

  assert.equal(h.state.careers.origins.__meta.primaryCareerId, 'prospector');
  assert.equal(h.posted.length, 1);
  assert.equal(h.posted[0].storyTag, 'origin.prospector.v1:ceres_survey');
  assert.deepEqual(h.granted, [{
    defId: 'mod_winch_hd', reason: 'career_origin:prospector:starter',
  }]);
  assert.equal(h.state.player.moduleInventory[0].defId, 'mod_winch_hd');
  assert.equal(h.state.careers.origins.__meta.identityReceipts.prospector.verb, 'survey');

  const save = serializeCareerOrigins(h.state);
  const loaded = createGameState(9082);
  deserializeCareerOrigins(loaded, save);
  assert.equal(loaded.careers.origins.__meta.primaryCareerId, 'prospector');
  assert.equal(loaded.careers.origins.__meta.identityReceipts.prospector.loadout.status, 'inventory');
});

test('declined and failed origins can be recovered from flight without a Station UI round trip', () => {
  const declined = harness(9083);
  declined.bus.emit('game:started', {});
  declined.bus.emit(CAREER_ORIGINS_EVENTS.DECLINE, { careerId: 'hunter' });
  let model = buildMissionLogOriginChoiceModel(declined.state, declined.registry);
  const hunterCard = model.cards.find((card) => card.careerId === 'hunter');
  assert.equal(hunterCard.status, 'declined');
  assert.equal(hunterCard.canOriginRecover, true);

  declined.bus.emit(CAREER_ORIGINS_EVENTS.REOFFER, { careerId: 'hunter' });
  model = buildMissionLogOriginChoiceModel(declined.state, declined.registry);
  assert.equal(model.cards.find((card) => card.careerId === 'hunter').canOriginAccept, true);

  const failed = harness(9084);
  failed.bus.emit('game:started', {});
  failed.bus.emit(CAREER_ORIGINS_EVENTS.ACCEPT, { careerId: 'hunter' });
  const firstMissionId = failed.state.careers.origins.__meta.routes.hunter.activeMissionId;
  const firstMarker = failed.posted[0].markerId;
  failed.bus.emit('mission:failed', { missionId: firstMissionId, reason: 'player_destroyed' });
  model = buildMissionLogOriginChoiceModel(failed.state, failed.registry);
  assert.equal(model.cards.find((card) => card.careerId === 'hunter').canOriginRecover, true);

  failed.bus.emit(CAREER_ORIGINS_EVENTS.REOFFER, { careerId: 'hunter' });
  const route = failed.state.careers.origins.__meta.routes.hunter;
  assert.equal(route.status, 'active');
  assert.notEqual(route.activeMissionId, firstMissionId);
  assert.equal(failed.posted.at(-1).markerId, firstMarker);
});

test('Continue defers an old-save flight offer until the authored-visual loading gate commits', () => {
  const h = harness(9085);
  h.state.mode = 'loading';

  h.bus.emit('save:loaded', { visualGatePending: true });
  assert.equal(buildMissionLogOriginChoiceModel(h.state, h.registry).visible, false);

  h.state.mode = 'flight';
  h.bus.emit('mode:changed', { previousMode: 'loading', mode: 'flight' });
  assert.equal(buildMissionLogOriginChoiceModel(h.state, h.registry).visible, true);
});
