import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { ships as shipsProto, buildSlotList } from '../src/systems/ships.js';
import { economy as economyProto } from '../src/systems/economy.js';
import { SHIPS } from '../src/data/ships.js';
import { ensureShipjack, normalizeShipjack } from '../src/shipjack/model.js';
import { quoteYardOperation, executeYardOperation } from '../src/shipjack/yardOperations.js';

function fixture(beforeEconomy) {
  const state = createGameState(4242), bus = createBus();
  state.mode = 'flight';
  state.ui.docked = true; state.ui.dockedStationId = 'station_helios';
  state.player.credits = 1000000; state.player.heat = 7;
  const def = SHIPS.find(s => s.id === 'ship_mule');
  const slot = buildSlotList(def).findIndex(s => s.type === 'engine');
  const owned = { defId: def.id, vesselId: 'vessel:adversary:1', cargo: { items: {} },
    fittings: Array(buildSlotList(def).length).fill(null), fittedInstances: {} };
  owned.fittings[slot] = 'mod_engine_ion_m';
  owned.fittedInstances[slot] = { instanceId: 'mi_adversary_drive', defId: 'mod_engine_ion_m', condition: 0.7,
    provenance: { sourceVesselId: owned.vesselId, titleAtCapture: 'disputed', incidentId: 'incident:adversary:1' } };
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [], fittedInstances: {} }, owned];
  state.player.activeShipIndex = 0; state.player.moduleInventory = [];
  const vessel = ensureShipjack(state).vesselsById[owned.vesselId] = { version: 1, vesselId: owned.vesselId,
    defId: def.id, originalOwner: 'captain_mara_venn', recognizedOwner: 'captain_mara_venn',
    custodian: 'player', title: 'disputed', profile: 'civilian', crew: 'evacuated', crewSafe: true,
    lienCr: 2400, incidentId: 'incident:adversary:1', condition: { hull: 0.6 }, history: [],
    signature: { frame: 'ADVERSARY-FRAME', engine: 'ADVERSARY-DRIVE', broadcastFlagged: true, tamper: 1 },
    location: { kind: 'berth', stationId: 'station_helios', sectorId: 'sector_helios_prime' } };
  const ships = Object.create(shipsProto), economy = Object.create(economyProto);
  const registry = { get: name => name === 'ships' ? ships : name === 'economy' ? economy : null };
  const ctx = { state, bus, registry, helpers: {} };
  ships.init(ctx); beforeEconomy?.({ ...ctx, ships, economy, owned, vessel }); economy.init(ctx);
  const request = operationId => {
    const p = { vesselId: vessel.vesselId, action: 'settle_title', operationId };
    const q = quoteYardOperation(state, p); assert.equal(q.ok, true, q.reason);
    return { ...p, quote: q.quote };
  };
  return { ...ctx, ships, economy, owned, vessel, slot, request };
}

test('adversary: unfit before buying title cannot clean the removed item or the lender lien', () => {
  const h = fixture(), beforeQuote = h.request('claim:before:strip').quote;
  assert.equal(h.ships.unfitModule({ shipIndex: 1, slotIndex: h.slot }), true);
  const removed = h.state.player.moduleInventory.find(m => m.instanceId === 'mi_adversary_drive');
  assert.ok(removed);
  const evidence = structuredClone(removed.provenance);
  const p = h.request('claim:after:strip'), wallet = h.state.player.credits;
  assert.ok(-p.quote.amount < -beforeQuote.amount, 'only remaining property is appraised');
  assert.equal(executeYardOperation(h, p).ok, true);
  h.state.player.shipjack = normalizeShipjack(h.state.player.shipjack); ensureShipjack(h.state);
  assert.deepEqual(removed.provenance, evidence);
  assert.equal(removed.provenance.titleAtCapture, 'disputed');
  assert.equal(h.state.shipjack.vesselsById[h.vessel.vesselId].lienCr, 2400);
  assert.equal(h.state.player.heat, 7);
  assert.match(quoteYardOperation(h.state, { vesselId: h.vessel.vesselId, action: 'sell' }).reason, /lien/);
  assert.equal(h.state.player.moduleInventory.filter(m => m.instanceId === removed.instanceId).length, 1);
  assert.equal(h.state.player.credits, wallet + p.quote.amount);
});

test('adversary: a prior wallet spender and nested yard request cannot leave partially purchased title', () => {
  let nested, request;
  const h = fixture(ctx => ctx.bus.on('economy:chargeCredits', p => {
    if (!p?.reason?.startsWith('shipjack:claim:race')) return;
    nested = executeYardOperation(ctx, { ...request, operationId: 'claim:race:nested' });
    ctx.economy.chargeCredits(1, 'adversarial:concurrent-service');
  }));
  request = h.request('claim:race:1');
  const wallet = h.state.player.credits, title = structuredClone(h.vessel);
  const r = executeYardOperation(h, request);
  assert.equal(r.ok, false); assert.match(r.reason, /Payment changed/);
  assert.equal(nested.ok, false); assert.match(nested.reason, /settling another transaction/);
  assert.equal(h.state.player.credits, wallet - 1, 'only the independent real service was charged');
  assert.deepEqual(h.vessel, title);
  assert.equal(h.state.shipjack.yardReceipts?.length || 0, 0);
});
