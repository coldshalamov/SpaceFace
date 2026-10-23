// W2-B O38 — a paid component extraction books while docked, matures while flying, and is
// delivered when the pilot comes back to the originating berth. Docking freezes the full tick, so
// shipjack.update() never sees a docked player: the settlement has to ride the dock itself.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { ships as shipsProto, buildSlotList } from '../src/systems/ships.js';
import { economy as economyProto } from '../src/systems/economy.js';
import { shipjack as shipjackProto } from '../src/systems/shipjack.js';
import { SHIPS } from '../src/data/ships.js';
import { ensureShipjack } from '../src/shipjack/model.js';
import { quoteYardOperation, executeYardOperation } from '../src/shipjack/yardOperations.js';
import { commitDockedUiState } from '../src/ui/dockStateCommit.js';

const STATION = 'station_helios';

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.ui.docked = true;
  state.ui.dockedStationId = STATION;
  state.player.credits = 50000;
  state.player.activeShipIndex = 0;
  state.player.moduleInventory = [];
  const def = SHIPS.find((s) => s.id === 'ship_mule');
  const owned = { vesselId: 'vessel:test:1', defId: def.id,
    fittings: Array(buildSlotList(def).length).fill(null), fittedInstances: {} };
  const slot = buildSlotList(def).findIndex((s) => s.type === 'engine');
  owned.fittings[slot] = 'mod_engine_ion_m';
  owned.fittedInstances[slot] = { instanceId: 'mi_prize_drive', defId: 'mod_engine_ion_m', condition: 0.6,
    provenance: { label: 'Mara’s repaired drive', source: 'traffic' } };
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [], fittedInstances: {} }, owned];
  const sj = ensureShipjack(state);
  const vessel = sj.vesselsById[owned.vesselId] = { version: 1, vesselId: owned.vesselId, defId: owned.defId,
    name: 'Empty Seat', title: 'clean', originalOwner: 'captain_mara_venn', recognizedOwner: 'player',
    custodian: 'player', condition: { hull: 0.7 }, revision: 0, lienCr: 0, history: [],
    signature: { broadcast: 'REG-MARA', frame: 'FRAME-MARA', engine: 'DRIVE-MARA' },
    location: { kind: 'berth', stationId: STATION, sectorId: 'sector_helios_prime' } };
  const bus = createBus();
  const ships = Object.create(shipsProto);
  const economy = Object.create(economyProto);
  const system = Object.create(shipjackProto);
  const slots = { ships, economy, shipjack: system };
  const registry = { get: (name) => slots[name] || null };
  const ctx = { state, bus, registry, helpers: {} };
  ships.init(ctx);
  economy.init(ctx);
  system.init(ctx);
  const request = { vesselId: vessel.vesselId, action: 'extract', slotIndex: slot };
  const quote = quoteYardOperation(state, request);
  assert.equal(quote.ok, true, quote.reason);
  const job = executeYardOperation(ctx, { ...request, quote: quote.quote, operationId: 'yard:w2b:1' });
  assert.equal(job.status, 'processing');
  return { state, bus, system, vessel, owned, slot, job };
}

function dockAt(h, stationId) {
  // The real route: systems hear dock:docked first, THEN the UI commits ui.docked and emits
  // dock:committed.
  h.bus.emit('dock:docked', { stationId });
  return commitDockedUiState(h.state, { stationId }, h.bus);
}

test('pay, undock, wait past the timer, dock: the part is delivered once and the slot frees', () => {
  const h = boot();
  const paidBalance = h.state.player.credits;
  assert.equal(Object.keys(h.state.shipjack.yards).length, 1, 'the cradle is booked');

  // Undock and fly past the timer. shipjack.update() runs, but the cradle waits for its berth.
  h.state.ui.docked = false;
  h.state.ui.dockedStationId = null;
  h.state.simTime = h.job.completesAt + 30;
  h.system.update(1 / 60, h.state);
  assert.equal(h.state.player.moduleInventory.length, 0, 'flying does not deliver the part');
  assert.ok(h.state.shipjack.yards[h.vessel.vesselId], 'the job is still booked');

  // Docking elsewhere does not teleport the output either.
  dockAt(h, 'station_forge');
  assert.equal(h.state.player.moduleInventory.length, 0, 'another port cannot deliver it');
  h.state.ui.docked = false;
  h.state.ui.dockedStationId = null;

  // Dock at the originating station through the real two-step dock.
  const committed = dockAt(h, STATION);
  assert.equal(committed, true);
  assert.equal(h.state.player.moduleInventory.length, 1, 'the extracted part is in inventory');
  assert.equal(h.state.player.moduleInventory[0].instanceId, 'mi_prize_drive');
  assert.equal(h.owned.fittings[h.slot], null, 'the hardpoint was emptied');
  assert.deepEqual(h.state.shipjack.yards, {}, 'the job slot is free again');
  assert.equal(h.state.player.credits, paidBalance, 'the booked price was paid exactly once');
  const receipts = h.state.shipjack.yardReceipts.filter((r) => r.operationId === 'yard:w2b:1');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].status, 'completed');

  // Docking again (or any later tick) delivers nothing more.
  h.state.ui.docked = false;
  h.state.ui.dockedStationId = null;
  dockAt(h, STATION);
  h.system.update(1 / 60, h.state);
  assert.equal(h.state.player.moduleInventory.length, 1, 'delivered once');
  assert.equal(h.state.player.credits, paidBalance);
});

test('docking before the timer expires leaves the job booked', () => {
  const h = boot();
  h.state.ui.docked = false;
  h.state.ui.dockedStationId = null;
  h.state.simTime = h.job.completesAt - 1;
  dockAt(h, STATION);
  assert.equal(h.state.player.moduleInventory.length, 0);
  assert.ok(h.state.shipjack.yards[h.vessel.vesselId], 'not ready yet, still booked');
});
