import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { ships as shipsProto, buildSlotList } from '../src/systems/ships.js';
import { economy as economyProto } from '../src/systems/economy.js';
import { save as saveProto } from '../src/save/saveSystem.js';
import { SHIPS } from '../src/data/ships.js';
import { ensureShipjack, normalizeShipjack } from '../src/shipjack/model.js';
import { componentDefinition, inspectVessel, valuationBreakdown } from '../src/shipjack/market.js';
import { quoteYardOperation, executeYardOperation } from '../src/shipjack/yardOperations.js';

function boot({ stationId = 'station_helios', active = false, walletListener = true } = {}) {
  const state = createGameState(4242), bus = createBus();
  state.mode = 'flight';
  state.ui.docked = true; state.ui.dockedStationId = stationId;
  state.player.credits = 500000; state.player.heat = 9;
  const def = SHIPS.find(s => s.id === 'ship_mule');
  const slot = buildSlotList(def).findIndex(s => s.type === 'engine');
  const owned = { defId: def.id, vesselId: 'vessel:title:1', fittings: Array(buildSlotList(def).length).fill(null),
    fittedInstances: {}, cargo: { items: { cmdty_ore_iron: 3 } } };
  owned.fittings[slot] = 'mod_engine_ion_m';
  owned.fittedInstances[slot] = { instanceId: 'mi_claim_drive', defId: 'mod_engine_ion_m', condition: 0.4,
    provenance: { sourceVesselId: owned.vesselId, titleAtExtraction: 'disputed', label: 'Original claimant drive' } };
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [], fittedInstances: {} }, owned];
  state.player.activeShipIndex = active ? 1 : 0;
  state.player.moduleInventory = [{ instanceId: 'mi_previously_stripped', defId: 'mod_cargo_scanner_s', condition: 0.6,
    provenance: { sourceVesselId: owned.vesselId, titleAtExtraction: 'disputed' } }];
  const vessel = ensureShipjack(state).vesselsById[owned.vesselId] = { version: 1, vesselId: owned.vesselId,
    defId: def.id, name: 'Claimant’s Mule', originalOwner: 'captain_mara_venn', recognizedOwner: 'captain_mara_venn',
    custodian: 'player', title: 'disputed', profile: 'civilian', crew: 'safe passage agreed', crewSafe: true,
    condition: { hull: 0.5, driveMissing: true }, lienCr: 800, incidentId: 'incident:theft:1',
    signature: { broadcast: 'STOLEN-CODE', frame: 'ORIGINAL-FRAME', engine: 'ORIGINAL-DRIVE',
      broadcastFlagged: true, forged: true, tamper: 2 }, noticeAt: 120, history: [], revision: 1,
    location: { kind: active ? 'active' : 'berth', stationId, sectorId: 'sector_helios_prime' },
    parkedBody: { hull: 25, shield: 0, vel: { x: 0, z: 0 } } };
  const ships = Object.create(shipsProto), economy = Object.create(economyProto);
  const registry = { get: name => name === 'ships' ? ships : name === 'economy' ? economy : null };
  const ctx = { state, bus, registry, helpers: {} };
  ships.init(ctx);
  if (walletListener) economy.init(ctx);
  const save = Object.assign(Object.create(saveProto), ctx);
  const request = (operationId = 'yard:claim:1') => {
    const payload = { action: 'settle_title', vesselId: vessel.vesselId, operationId };
    const quoted = quoteYardOperation(state, payload);
    assert.equal(quoted.ok, true, quoted.reason);
    return { ...payload, quote: quoted.quote };
  };
  return { ...ctx, ships, economy, save, vessel, owned, slot, request };
}

test('claimant appraisal uses canonical full replacement prices and exceeds all immediate clean resale', () => {
  const h = boot(), value = h.request().quote.value;
  const hull = SHIPS.find(s => s.id === h.owned.defId);
  assert.equal(value.claimantCompensation, Math.floor(hull.price * 0.5
    + Math.floor(componentDefinition('mod_engine_ion_m').price * 0.4)));
  assert.equal(value.titleSettlementCost, value.claimantCompensation + value.titleServiceFee);
  assert.ok(value.titleServiceFee >= 300);
  assert.ok(value.titleSettlementCost > valuationBreakdown({ ...h.vessel, title: 'clean' }, h.owned).intact);
  const payload = h.request(), balance = h.state.player.credits;
  assert.equal(executeYardOperation(h, payload).ok, true);
  h.owned.cargo.items = {};
  const resale = quoteYardOperation(h.state, { vesselId: h.vessel.vesselId, action: 'sell' });
  assert.match(resale.reason, /lien/, 'the claim purchase does not pay the lender');
  const lien = quoteYardOperation(h.state, { vesselId: h.vessel.vesselId, action: 'settle_lien' }).quote;
  assert.equal(executeYardOperation(h, { ...lien, quote: lien, operationId: 'yard:lender:1' }).ok, true);
  const sale = quoteYardOperation(h.state, { vesselId: h.vessel.vesselId, action: 'sell' }).quote;
  assert.equal(executeYardOperation(h, { ...sale, quote: sale, operationId: 'yard:resale:1' }).ok, true);
  assert.ok(h.state.player.credits < balance, 'buy-title/pay-lien/sell has a real net cost');
});

test('paid settlement changes title and broadcast, preserving bodies, damage, cargo, liens, heat and extracted provenance', () => {
  const h = boot({ active: true });
  const body = JSON.stringify(h.vessel.parkedBody), fittings = JSON.stringify(h.owned), inventory = JSON.stringify(h.state.player.moduleInventory);
  const payload = h.request(), before = h.state.player.credits;
  let published = 0;
  h.bus.on('shipjack:yardReceipt', receipt => {
    if (receipt.action !== 'settle_title') return;
    published++;
    assert.equal(h.state.player.credits, before + payload.quote.amount, 'success publication follows the actual debit');
    assert.equal(executeYardOperation(h, payload).ok, false, 'reentrant clicks cannot settle twice');
  });
  const receipt = executeYardOperation(h, payload);
  assert.equal(receipt.ok, true); assert.equal(published, 1);
  assert.equal(h.vessel.title, 'clean'); assert.equal(h.vessel.recognizedOwner, 'player');
  assert.equal(h.vessel.originalOwner, 'captain_mara_venn'); assert.equal(h.vessel.claimResolved, true);
  assert.equal(h.vessel.signature.broadcastFlagged, false); assert.equal(h.vessel.signature.forged, false);
  assert.match(h.vessel.signature.broadcast, /^REG-/); assert.equal(h.vessel.noticeAt, 0);
  assert.equal(h.vessel.signature.frame, 'ORIGINAL-FRAME'); assert.equal(h.vessel.signature.engine, 'ORIGINAL-DRIVE');
  assert.equal(h.vessel.signature.tamper, 2); assert.equal(h.vessel.lienCr, 800); assert.equal(h.state.player.heat, 9);
  assert.equal(h.vessel.condition.hull, 0.5); assert.equal(h.vessel.condition.driveMissing, true);
  assert.equal(JSON.stringify(h.vessel.parkedBody), body); assert.equal(JSON.stringify(h.owned), fittings);
  assert.equal(JSON.stringify(h.state.player.moduleInventory), inventory);
  assert.ok(inspectVessel(h.vessel, { grade: 3 }).findings.some(s => /tampering/.test(s)));
  assert.equal(executeYardOperation(h, payload), receipt);
  assert.equal(h.state.player.credits, before + payload.quote.amount);
  assert.match(quoteYardOperation(h.state, { vesselId: h.vessel.vesselId, action: 'register' }).reason, /salvage claim/);
});

test('the player save boundary retains paid title and terminal receipt even when captured by the debit notification', () => {
  const h = boot(), payload = h.request(), before = h.state.player.credits;
  let captured;
  h.bus.on('credits:changed', () => { captured = JSON.parse(JSON.stringify(h.save._serializePlayer())); });
  assert.equal(executeYardOperation(h, payload).ok, true);
  assert.ok(captured.shipjack.yardReceipts.some(r => r.operationId === payload.operationId));
  h.save._restorePlayer(captured);
  h.state.player.shipjack = normalizeShipjack(h.state.player.shipjack);
  ensureShipjack(h.state);
  assert.equal(executeYardOperation(h, payload).ok, true);
  assert.equal(h.state.player.credits, before + payload.quote.amount);
  const restored = h.state.player.shipjack.vesselsById[h.vessel.vesselId];
  assert.equal(restored.title, 'clean'); assert.equal(restored.claimResolved, true); assert.equal(restored.lienCr, 800);
  assert.equal(quoteYardOperation(h.state, { vesselId: restored.vesselId, action: 'settle_title' }).ok, false);
});

test('no partial payment or absent wallet owner listener can grant clean title', () => {
  for (const walletListener of [true, false]) {
    const h = boot({ walletListener }), payload = h.request();
    if (walletListener) h.state.player.credits = -payload.quote.amount - 1;
    const before = h.state.player.credits;
    assert.equal(executeYardOperation(h, payload).ok, false);
    assert.equal(h.state.player.credits, before); assert.equal(h.vessel.title, 'disputed');
    assert.equal(h.vessel.claimResolved, undefined); assert.equal(h.vessel.signature.broadcast, 'STOLEN-CODE');
    assert.equal(h.state.shipjack.yardReceipts?.length || 0, 0);
  }
});

test('claimant, equipment and expiry changes require an honest revised quote before any debit', () => {
  for (const mutate of [h => { h.vessel.originalOwner = h.vessel.recognizedOwner = 'ceres_shift_cooperative'; },
    h => { h.owned.fittedInstances[h.slot].condition = 0.2; }, h => { h.state.simTime = 46; }]) {
    const h = boot(), payload = h.request(), before = h.state.player.credits;
    mutate(h);
    assert.match(executeYardOperation(h, payload).reason, /revised quote|expired/);
    assert.equal(h.state.player.credits, before); assert.equal(h.vessel.title, 'disputed');
  }
});

test('licensed registry requires a real claimant, safe crew and the actual local hull; military title remains withheld', () => {
  const cases = [
    [h => { h.vessel.recognizedOwner = 'unregistered'; }, /No registered claimant/],
    [h => { h.vessel.recognizedOwner = 'ceres_shift_cooperative'; }, /Competing registry claimants/],
    [h => { h.vessel.profile = 'military'; }, /military frames/],
    [h => { h.vessel.originalOwner = h.vessel.recognizedOwner = 'faction_scn'; }, /Government/],
    [h => { h.vessel.crewSafe = false; h.vessel.crew = 'aboard'; }, /safe crew passage/],
    [h => { h.state.player.activeShipIndex = 1; h.vessel.location.kind = 'field'; }, /Physically berth/],
    [h => { h.state.player.activeShipIndex = 1; h.vessel.location.stationId = 'station_forge'; }, /Physically berth/],
    [h => { h.vessel.condition.hull = 0; }, /destroyed frame/],
  ];
  for (const [mutate, expected] of cases) {
    const h = boot(); mutate(h);
    assert.match(quoteYardOperation(h.state, { vesselId: h.vessel.vesselId, action: 'settle_title' }).reason, expected);
  }
  const fence = boot({ stationId: 'station_smuggler' });
  assert.match(quoteYardOperation(fence.state, { vesselId: fence.vessel.vesselId, action: 'settle_title' }).reason, /licensed recovery registry/);
  const drone = boot(); drone.vessel.crew = 'automated'; drone.vessel.crewSafe = false;
  assert.equal(quoteYardOperation(drone.state, { vesselId: drone.vessel.vesselId, action: 'settle_title' }).ok, true);
});
