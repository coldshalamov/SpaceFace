import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CAREER_ORIGIN_CONTRACTS,
  ORIGIN_PHYSICAL_IDENTITIES,
  ORIGIN_ROLE_KITS,
} from '../src/careers/origins/careerOriginContracts.js';
import {
  createCareerOriginsSystem,
  deserializeCareerOrigins,
  getCareerOfferView,
  serializeCareerOrigins,
} from '../src/careers/origins/careerOrigins.js';

function makeHarness(seed = 51) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 30;
  state.tick = 1800;
  state.playerId = 1;
  state.player.moduleInventory = [];
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 100,
  };
  state.economy.markets = {
    station_helios: {
      cmdty_food: { stock: 80, lastMid: 18, lastBuy: 20, lastSell: 16 },
      cmdty_fuel_cells: { stock: 60, lastMid: 28, lastBuy: 30, lastSell: 26 },
    },
    station_coalition: {
      cmdty_food: { stock: 20, lastMid: 26, lastBuy: 28, lastSell: 24 },
    },
    station_ceres: {
      cmdty_fuel_cells: { stock: 15, lastMid: 38, lastBuy: 40, lastSell: 36 },
      cmdty_ore_iron: { stock: 20, lastMid: 34, lastBuy: 36, lastSell: 32 },
    },
    station_beltout: {
      cmdty_ore_iron: { stock: 80, lastMid: 24, lastBuy: 26, lastSell: 22 },
    },
  };
  const posted = [];
  const granted = [];
  let nextMissionId = 1;
  const missions = {
    postAndAcceptAuthoredOffer(offer) {
      posted.push(structuredClone(offer));
      return { ok: true, offerId: offer.id, missionId: `m_${nextMissionId++}` };
    },
    abandonMission() { return true; },
  };
  const ships = {
    grantModule(payload) { granted.push({ ...payload }); return true; },
  };
  const bus = createBus();
  const system = createCareerOriginsSystem();
  system.init({
    state, bus,
    registry: { get: (name) => name === 'missions' ? missions : name === 'ships' ? ships : null },
  });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  return { state, bus, system, posted, granted };
}

function finishRoute(harness, careerId) {
  const { state, bus } = harness;
  const route = state.careers.origins.__meta.routes[careerId];
  while (route.status === 'active') {
    assert.ok(route.activeMissionId);
    bus.emit('mission:completed', { missionId: route.activeMissionId });
  }
}

test('origin focus is temporary rather than a permanent career lock', () => {
  const harness = makeHarness();
  assert.equal(harness.system.accept('hunter').ok, true);
  assert.deepEqual(harness.system.accept('prospector'), {
    ok: false, reason: 'origin_in_progress', activeCareerId: 'hunter',
  });
  assert.equal(getCareerOfferView(harness.state, 'prospector').availability,
    'available_after_active_origin');

  finishRoute(harness, 'hunter');
  assert.equal(getCareerOfferView(harness.state).focusedCareerId, null);
  assert.equal(harness.state.careers.origins.__meta.identityReceipts.hunter.status, 'completed');
  assert.equal(harness.state.careers.origins.__meta.identityReceipts.hunter.activeMissionId, null);
  assert.equal(harness.state.careers.origins.__meta.identityReceipts.hunter.loadout.status, 'inventory');
  assert.equal(harness.system.accept('prospector').ok, true);
});

test('abandon releases focus without deleting peer offers or completed history', () => {
  const harness = makeHarness(52);
  assert.equal(harness.system.accept('prospector').ok, true);
  assert.equal(harness.system.abandon('prospector').ok, true);
  assert.equal(getCareerOfferView(harness.state).focusedCareerId, null);
  assert.equal(harness.state.careers.origins.__meta.identityReceipts.prospector.status, 'abandoned');
  assert.equal(harness.state.careers.origins.__meta.identityReceipts.prospector.activeMissionId, null);
  assert.equal(harness.system.accept('hauler').ok, true);
  assert.equal(harness.state.careers.origins.__meta.focusCareerId, 'hauler');
  assert.ok(harness.state.careers.origins.prospector, 'peer career state remains durable');
});

test('deterministic identity receipts preserve distinct cargo, mission, and loadout roles', () => {
  for (const careerId of ['hauler', 'hunter', 'prospector']) {
    const harness = makeHarness(900 + careerId.length);
    const accepted = harness.system.accept(careerId);
    assert.equal(accepted.ok, true);
    const receipt = harness.state.careers.origins.__meta.identityReceipts[careerId];
    const identity = ORIGIN_PHYSICAL_IDENTITIES[careerId];
    assert.equal(receipt.lane, identity.lane);
    assert.equal(receipt.verb, identity.verb);
    assert.deepEqual(receipt.cargo, identity.cargo);
    assert.equal(receipt.loadout.defId, ORIGIN_ROLE_KITS[careerId].defId);
    assert.equal(receipt.loadout.slotType, 'utility');
    assert.ok(receipt.activeMissionId, 'identity is bound to a missions-owned runtime id');
    assert.ok(receipt.markerId && receipt.markerId.startsWith(`origin:${careerId}:`));
    if (careerId !== 'hauler') {
      assert.ok(CAREER_ORIGIN_CONTRACTS[careerId].some((def) => def.id === receipt.markerId.split(':').at(-1)));
    }

    const blob = serializeCareerOrigins(harness.state);
    const restored = createGameState(1);
    deserializeCareerOrigins(restored, structuredClone(blob));
    assert.equal(restored.careers.origins.__meta.focusCareerId, careerId,
      'save/load restores the active origin focus');
    assert.deepEqual(
      restored.careers.origins.__meta.identityReceipts[careerId],
      receipt,
      'save/load preserves the physical identity receipt exactly',
    );
  }
});
