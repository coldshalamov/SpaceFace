import assert from 'node:assert/strict';
import test from 'node:test';

import {
  livingHullGrimeAt,
  normalizeLivingHull,
} from '../src/core/livingHull.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { SERVICE_PRICES, showroomRebuildQuoteForState } from '../src/systems/economy.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { serviceQuote } from '../src/ui/screens/services.js';

const STATION_ID = 'station_helios';

function boot() {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 0x4458 });
  const { state, bus } = runtime;
  const shipOwner = runtime.getSystem('ships');
  shipOwner.newGame();
  const owned = state.player.ownedShips[0];
  state.simTime = 2400;
  owned.livingHull = normalizeLivingHull({
    killTally: 6,
    repairPatches: 1,
    heatScorch: 2,
    lastWashAtT: 0,
    washCount: 0,
    graffitiLine: 'BORROWED, NOT BROKEN',
    graffitiAuthor: 'Iri March',
    updatedAtT: 1800,
  }, state.simTime);
  const originalAppearance = structuredClone(owned.appearance);
  const originalFittings = structuredClone(owned.fittings);
  const player = runtime.spawn(makeShipEntitySpec(owned.defId, {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    fittings: owned.fittings,
    appearance: owned.appearance,
    livingHull: owned.livingHull,
    pos: { x: 0, z: 0 },
  }));
  player.flags = { ...(player.flags || {}), persistent: true };
  state.playerId = player.id;
  state.player.credits = 25_000;
  state.mode = 'station';
  state.ui.docked = true;
  state.ui.dockedStationId = STATION_ID;
  bus.emit('dock:docked', { stationId: STATION_ID, shipId: player.id });
  shipOwner.reconcileLivingHull();
  return { runtime, state, bus, shipOwner, owned, player, originalAppearance, originalFittings };
}

test('repair berth presents a real choice: field repair keeps history, showroom rebuild erases it', () => {
  const route = boot();
  try {
    const { state, bus, owned, player, originalAppearance, originalFittings } = route;
    const receipts = [];
    bus.on('service:completed', (payload) => receipts.push(structuredClone(payload)));

    player.hull = 30;
    player.armorHp = 10;
    const fieldQuote = serviceQuote('repair', state, player);
    assert.equal(fieldQuote.buttonLabel, 'Field Repair');
    assert.match(fieldQuote.detail, /hull history stays/);
    const beforeFieldCredits = state.player.credits;
    bus.emit('ui:service', { type: 'repair', amount: fieldQuote.amount });

    assert.equal(player.hull, player.hullMax);
    assert.equal(player.armorHp, player.armorMax);
    assert.equal(state.player.credits, beforeFieldCredits - fieldQuote.cost,
      'Economy alone charges the quoted field repair');
    assert.equal(owned.livingHull.killTally, 6);
    assert.equal(owned.livingHull.heatScorch, 2);
    assert.equal(owned.livingHull.graffitiLine, 'BORROWED, NOT BROKEN');
    assert.equal(owned.livingHull.repairPatches, 2,
      'the retained hull history gains the ordinary heavy-repair patch');
    assert.deepEqual(owned.appearance, originalAppearance);
    assert.deepEqual(owned.fittings, originalFittings);
    assert.equal(receipts.at(-1).type, 'repair');

    player.hull = 72;
    player.armorHp = Math.max(0, (Number(player.armorMax) || 0) - 15);
    const fieldAgain = serviceQuote('repair', state, player);
    const rebuildQuote = serviceQuote('showroom_rebuild', state, player);
    const ownerQuote = showroomRebuildQuoteForState(state, player);
    assert.equal(rebuildQuote.buttonLabel, 'Rebuild Clean');
    assert.match(rebuildQuote.detail, /paint and fitted systems stay/);
    assert.ok(rebuildQuote.cost > fieldAgain.cost);
    assert.equal(rebuildQuote.cost, ownerQuote.repairCr + ownerQuote.refinishCr);
    assert.ok(ownerQuote.refinishCr >= SERVICE_PRICES.showroomRebuildMinCr);
    assert.equal(ownerQuote.markCount, 11);

    state.mode = 'flight';
    state.ui.docked = false;
    state.ui.dockedStationId = null;
    bus.emit('dock:undocked', { stationId: STATION_ID });
    const forgedCredits = state.player.credits;
    const forgedHistory = owned.livingHull;
    bus.emit('ui:service', { type: 'showroom_rebuild', amount: 1 });
    assert.equal(state.player.credits, forgedCredits);
    assert.equal(owned.livingHull, forgedHistory,
      'a raw off-berth service intent cannot erase hull history');
    assert.equal(player.hull, 72);

    state.mode = 'station';
    state.ui.docked = true;
    state.ui.dockedStationId = STATION_ID;
    bus.emit('dock:docked', { stationId: STATION_ID, shipId: player.id });
    const liveQuote = serviceQuote('showroom_rebuild', state, player);
    state.player.credits = liveQuote.cost - 1;
    const deniedHistory = owned.livingHull;
    bus.emit('ui:service', { type: 'showroom_rebuild', amount: 1 });
    assert.equal(owned.livingHull, deniedHistory);
    assert.equal(player.hull, 72);

    state.player.credits = liveQuote.cost + 5_000;
    const beforeRebuildCredits = state.player.credits;
    bus.emit('ui:service', { type: 'showroom_rebuild', amount: 1 });
    const showroomReceipt = receipts.at(-1);
    assert.equal(showroomReceipt.type, 'showroom_rebuild');
    assert.equal(state.player.credits, beforeRebuildCredits - liveQuote.cost);
    assert.equal(player.hull, player.hullMax);
    assert.equal(player.armorHp, player.armorMax);
    assert.equal(owned.livingHull.killTally, 0);
    assert.equal(owned.livingHull.repairPatches, 0);
    assert.equal(owned.livingHull.heatScorch, 0);
    assert.equal(owned.livingHull.graffitiLine, null);
    assert.equal(livingHullGrimeAt(owned.livingHull, state.simTime), 0);
    assert.deepEqual(owned.appearance, originalAppearance,
      'showroom work resets history, not the commissioned paint');
    assert.deepEqual(owned.fittings, originalFittings,
      'showroom work resets history, not the fitted build');

    const save = route.runtime.getSystem('save');
    const envelope = save.serialize('plan44-showroom-rebuild');
    assert.equal(save.loadEnvelope(structuredClone(envelope), 'plan44-showroom-rebuild'), true);
    const restored = state.player.ownedShips[state.player.activeShipIndex];
    assert.equal(restored.livingHull.killTally, 0);
    assert.equal(restored.livingHull.repairPatches, 0);
    assert.equal(restored.livingHull.heatScorch, 0);
    assert.equal(restored.livingHull.graffitiLine, null);
    assert.deepEqual(restored.appearance, originalAppearance);
    assert.deepEqual(restored.fittings, originalFittings);
    assert.equal(serviceQuote('showroom_rebuild', state, state.entities.get(state.playerId)).disabled, true,
      'Continue retains delivery condition instead of reminting the old scars');
  } finally {
    route.runtime.dispose();
  }
});
