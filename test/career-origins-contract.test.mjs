import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { missions as missionsPrototype } from '../src/systems/missions.js';
import {
  CAREER_ORIGINS_EVENTS,
  createCareerOriginsSystem,
  deserializeCareerOrigins,
  ensureCareerOriginsState,
  getCareerOfferView,
  serializeCareerOrigins,
} from '../src/careers/origins/careerOrigins.js';
import { installPlayer, makeHostilePirate } from './hunter-origin-fixtures.mjs';

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

function makeState(seed = 3101) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  state.playerId = 1;
  state.player.targetId = null;
  state.player.heat = 0;
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 100,
  };
  installPlayer(state, 1);
  seedMarkets(state);
  return state;
}

function makeHarness() {
  const state = makeState();
  const bus = createBus();
  const posted = [];
  const missions = {
    postAndAcceptAuthoredOffer(offer) {
      posted.push(structuredClone(offer));
      return { ok: true, offerId: offer.id, missionId: `active_${offer.id}` };
    },
  };
  const registry = { get: (name) => (name === 'missions' ? missions : null) };
  const system = createCareerOriginsSystem();
  system.init({ state, bus, registry });
  return { state, bus, system, posted };
}

test('canonical state migrates legacy leaves without deleting peer career data', () => {
  const state = makeState();
  state.careers = {
    reputationCourse: { level: 2 },
    haulerOrigin: { status: 'declined', schemaVersion: 1 },
    hunterOrigin: { schemaVersion: 1, offer: { status: 'declined' } },
  };

  const origins = ensureCareerOriginsState(state);
  assert.ok(origins.hauler);
  assert.ok(origins.hunter);
  assert.ok(origins.prospector);
  assert.ok(origins.__meta);
  assert.equal(state.careers.haulerOrigin, undefined);
  assert.equal(state.careers.hunterOrigin, undefined);
  assert.deepEqual(state.careers.reputationCourse, { level: 2 });
});

test('one first-dock bundle exposes three independent, non-binding offers', () => {
  const { state, bus, system } = makeHarness();
  const bundles = [];
  bus.on(CAREER_ORIGINS_EVENTS.OFFERED, (payload) => bundles.push(payload));

  bus.emit('dock:docked', { stationId: 'station_helios' });
  bus.emit('dock:docked', { stationId: 'station_helios' });

  assert.equal(bundles.length, 1);
  assert.equal(bundles[0].nonBinding, true);
  assert.deepEqual(bundles[0].offers.map((offer) => offer.careerId), ['hauler', 'hunter', 'prospector']);
  assert.ok(bundles[0].offers.every((offer) => offer.canAccept && offer.nonBinding));

  system.destroy();
  assert.equal(state.careers.origins.__meta.offerNonce, 1);
});

test('all origins can be accepted together and each binds a missions-owned active id', () => {
  const { state, bus, system, posted } = makeHarness();
  bus.emit('dock:docked', { stationId: 'station_helios' });

  const hauler = system.accept('hauler');
  const hunter = system.accept('hunter');
  const prospector = system.accept('prospector');

  assert.equal(hauler.ok, true);
  assert.equal(hunter.ok, true);
  assert.equal(prospector.ok, true);
  assert.equal(posted.length, 3);
  assert.equal(posted[0].storyTag, 'origin.hauler.v1:manifest_truth');
  assert.equal(posted[1].storyTag, 'origin.hunter.v1:yard_writ');
  assert.equal(posted[2].storyTag, 'origin.prospector.v1:ceres_survey');
  assert.equal(state.careers.origins.hauler.activeContract.offerId, posted[0].id);
  assert.equal(state.careers.origins.hauler.activeContract.missionId, `active_${posted[0].id}`);
  assert.equal(state.careers.origins.hunter.offer.status, 'accepted');
  assert.equal(state.careers.origins.prospector.status, 'active');
  assert.ok(getCareerOfferView(state).offers.every((offer) => offer.nonBinding));
});

test('failed missions authority rolls Hauler acceptance back atomically', () => {
  const state = makeState();
  const bus = createBus();
  const registry = {
    get: () => ({ postAndAcceptAuthoredOffer: () => ({ ok: false, reason: 'accept_failed' }) }),
  };
  const system = createCareerOriginsSystem();
  system.init({ state, bus, registry });
  bus.emit('dock:docked', { stationId: 'station_helios' });

  const before = structuredClone(state.careers.origins.hauler);
  const result = system.accept('hauler');

  assert.deepEqual(result, { ok: false, reason: 'accept_failed' });
  assert.deepEqual(state.careers.origins.hauler, before);
});

test('Hauler offer enters the real missions authority and binds its runtime mission id', () => {
  const state = makeState();
  const bus = createBus();
  const missionSystem = { ...missionsPrototype };
  missionSystem.init({ state, bus, helpers: {} });
  const registry = { get: (name) => (name === 'missions' ? missionSystem : null) };
  const origins = createCareerOriginsSystem();
  origins.init({ state, bus, registry });

  bus.emit('dock:docked', { stationId: 'station_helios' });
  const result = origins.accept('hauler');

  assert.equal(result.ok, true);
  assert.equal(state.missions.active.length, 1);
  assert.equal(state.missions.active[0].storyTag, 'origin.hauler.v1:manifest_truth');
  assert.equal(state.missions.active[0].markerId, 'origin:hauler:manifest_truth');
  assert.equal(state.nav.waypoint.markerId, 'origin:hauler:manifest_truth');
  assert.equal(state.missions.active[0].params.cmdtyId, 'cmdty_food');
  assert.equal(state.ui.trackedMissionId, state.missions.active[0].id);
  assert.equal(state.careers.origins.hauler.activeContract.missionId, state.missions.active[0].id);
});

test('Hauler spread step requires both live trade legs before mission completion closes the origin', () => {
  const state = makeState();
  const bus = createBus();
  const missionSystem = { ...missionsPrototype };
  const registry = { get: (name) => (name === 'missions' ? missionSystem : null) };
  const origins = createCareerOriginsSystem();
  // Default registry init order deliberately records trade tickets before missions resolves a sell.
  origins.init({ state, bus, registry });
  missionSystem.init({ state, bus, helpers: {} });
  bus.emit('dock:docked', { stationId: 'station_helios' });

  let own = state.careers.origins.hauler;
  own.status = 'offered';
  own.stepIndex = 2;
  own.stepId = 'market_spread';
  own.offerNonce += 1;
  own.activeContract = null;
  assert.equal(origins.accept('hauler').ok, true);
  own = state.careers.origins.hauler;
  assert.equal(own.status, 'active');

  bus.emit('economy:tradeCompleted', {
    side: 'buy', stationId: 'station_beltout', commodityId: 'cmdty_ore_iron',
    qty: 10, unitAvg: 26, total: 260,
  });
  assert.equal(own.status, 'active');
  bus.emit('economy:tradeCompleted', {
    side: 'sell', stationId: 'station_ceres', commodityId: 'cmdty_ore_iron',
    qty: 10, unitAvg: 32, total: 320,
  });
  own = state.careers.origins.hauler;
  assert.equal(own.status, 'completed');
  assert.equal(own.rewardsGranted, true);
});

test('Prospector counts only player-mined raw ore and only sells tracked ore', () => {
  const { state, bus, system } = makeHarness();
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(system.accept('prospector').ok, true);

  const rock = {
    id: 91, type: 'asteroid',
    data: { typeId: 'ast_metallic', scanOreGlyph: 'Fe' },
  };
  state.entities.set(rock.id, rock);
  state.entityList.push(rock);
  bus.emit('scan:completed', { found: { asteroids: 1 } });
  assert.equal(state.careers.origins.prospector.activeStepId, 'extract');

  bus.emit('mining:yield', { minerId: 77, commodityId: 'cmdty_ore_iron', qty: 3 });
  bus.emit('mining:yield', { minerId: state.playerId, commodityId: 'cmdty_food', qty: 3 });
  assert.equal(state.careers.origins.prospector.steps.extract.oreCollected, 0);

  bus.emit('mining:yield', { minerId: state.playerId, commodityId: 'cmdty_ore_iron', qty: 3 });
  assert.equal(state.careers.origins.prospector.activeStepId, 'sell');
  bus.emit('economy:tradeCompleted', { side: 'sell', commodityId: 'cmdty_food', qty: 1, total: 25 });
  assert.equal(state.careers.origins.prospector.status, 'active');
  bus.emit('economy:tradeCompleted', { side: 'sell', commodityId: 'cmdty_ore_iron', qty: 1, total: 32 });
  assert.equal(state.careers.origins.prospector.status, 'completed');
});

test('Hunter live adapter confirms a legal marked quarry, then holds pursuit deterministically', () => {
  const { state, bus, system } = makeHarness();
  const quarry = makeHostilePirate({ id: 50 });
  quarry.pos = { x: 100, z: 0 };
  state.entities.set(quarry.id, quarry);
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(system.accept('hunter').ok, true);

  state.player.targetId = quarry.id;
  system.update(1 / 60, state);
  assert.equal(state.careers.origins.hunter.stepId, 'pursuit');
  for (let i = 0; i < 270; i += 1) {
    state.tick += 1;
    state.simTime += 1 / 60;
    system.update(1 / 60, state);
  }
  assert.equal(state.careers.origins.hunter.stepId, 'counterplay');
});

test('save round-trip is deterministic and preserves unrelated career peers', () => {
  const { state, bus, system } = makeHarness();
  state.careers.guildRank = { courier: 3 };
  bus.emit('dock:docked', { stationId: 'station_helios' });
  system.accept('hunter');
  system.accept('prospector');
  const blob = serializeCareerOrigins(state);

  const restored = makeState(999);
  restored.careers = {};
  restored.careers.guildRank = { courier: 7 };
  deserializeCareerOrigins(restored, structuredClone(blob));

  assert.deepEqual(serializeCareerOrigins(restored), blob);
  assert.deepEqual(restored.careers.guildRank, { courier: 7 });
});
