import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy, marketStockStatus } from '../src/systems/economy.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { missions } from '../src/systems/missions.js';
import { mining } from '../src/systems/mining.js';
import { cargo, addCargo, removeCargo } from '../src/systems/cargo.js';
import { isShortageGateRepair } from '../src/data/economyContractTemplates.js';
import { SECTORS } from '../src/data/sectors.js';
import { missionDossierSummary } from '../src/ui/station/screens/contracts.js';

const PART = 'cmdty_comp_hullplate';
const DEST = 'station_forge';
const SUPPLIER = 'station_ceres';

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [economy, missions, economyContracts, cargo, mining] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 100;
  state.onboarding = { active: false, finished: true };
  state.player.credits = 20000;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12,
    mass: 24, hull: 100, hullMax: 100, data: {} });
  state.playerId = player.id;
  const econ = sim.registry.get('economy');
  const contracts = sim.registry.get('economyContracts');
  const missionSystem = sim.registry.get('missions');
  const events = [];
  for (const name of ['economy:shortageRepairRestored', 'economy:freightAccepted', 'mission:completed',
    'mission:failed', 'economy:tradeCompleted', 'toast', 'comms:popup', 'salvage:claimJumped']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  const h = { sim, state, bus, econ, contracts, missionSystem, player, events };
  dock(h, 'station_helios');
  return h;
}

function dock(h, stationId) {
  const sector = SECTORS.find((sec) => sec.stations.some((st) => st.id === stationId));
  h.state.world.currentSectorId = sector.id;
  h.state.world.activeSector = sector;
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = stationId;
  h.bus.emit('dock:docked', { stationId });
}

function shortage(h, over = {}) {
  const market = h.econ.ensureMarket(DEST);
  h.econ.applyStockPressure(DEST, PART, 'buy', market[PART].stock - 1);
  return h.econ.injectEvent({ type: 'shortage', stationId: DEST, commodityId: PART, duration: 900, ...over });
}

function offer(h) {
  dock(h, 'station_helios');
  return h.state.missions.boards.station_helios.slots.find(isShortageGateRepair);
}

function accept(h) {
  const row = offer(h);
  assert.ok(row, 'the ordinary station board carries the repair offer');
  h.bus.emit('ui:acceptMission', { missionId: row.id });
  const mission = h.state.missions.active.find(isShortageGateRepair);
  assert.ok(mission, 'the ordinary accept intent starts the job');
  return mission;
}

const facts = (h, name) => h.events.filter((event) => event.name === name).map((event) => event.payload);

function buy(h, qty = 4) {
  dock(h, SUPPLIER);
  h.bus.emit('ui:buy', { commodityId: PART, qty, sourceStationId: SUPPLIER, requireFullQuantity: true });
  assert.equal(facts(h, 'economy:tradeCompleted').at(-1)?.qty, qty, 'real market acquisition settles');
}

function assertRestored(h, mission, method) {
  assert.equal(h.state.missions.active.some((m) => m.id === mission.id), false);
  assert.equal(marketStockStatus(h.state, DEST, PART).soldOut, false, 'the formerly dry listing is buyable');
  assert.equal(h.state.economy.markets[DEST][PART].stock, 5, 'only the four delivered parts reached stock');
  const restored = facts(h, 'economy:shortageRepairRestored');
  assert.equal(restored.length, 1);
  assert.equal(restored[0].receiptId, `mission-delivery:${mission.id}`);
  assert.equal(restored[0].completionMethod, method);
  const receipt = h.state.missions.receipts.find((r) => r.missionId === mission.id && r.outcome === 'completed');
  assert.match(receipt.restoration.text, /Hull Plate stock restored/);
  assert.equal(receipt.restoration.stationId, DEST);
  assert.equal(receipt.rewardCr, mission.reward_cr);
  assert.equal(facts(h, 'comms:popup').filter((p) => /Hull Plate stock restored/.test(p.text)).length, 1);
  const correction = h.state.economy.econEvents.find((e) => e.type === 'boom' && e.stationId === DEST && e.commodityId === PART);
  assert.equal(correction.duration, 180);
  return correction;
}

test('M15 seed 4242: a posted industrial shortage boards an offer, exposes prerequisites, and allows decline', () => {
  const h = boot();
  try {
    assert.equal(offer(h), undefined, 'no manufactured shortage');
    shortage(h);
    const credits = h.state.player.credits;
    const row = offer(h);
    assert.equal(row.params.cmdtyId, PART);
    assert.equal(row.preloadedCargo, false);
    assert.equal(row.collateral_cr, 0);
    assert.match(row.brief, /Ceres Refinery.*salvage-capable beam/);
    assert.match(row.brief, /claimed.*2.8u cargo room.*permission to dock/);
    assert.match(row.brief, /public gate route stays open.*Decline.*abort/i);
    assert.match(missionDossierSummary(row), /salvage-capable beam.*Helios Station's outfitter.*2.8u cargo room/,
      'the actual pre-accept dossier projection exposes both acquisition routes and their prerequisites');
    dock(h, SUPPLIER); // leave the offer without accepting or moving cargo
    assert.equal(h.state.player.credits, credits);
    assert.equal(h.state.missions.active.length, 0);
    assert.deepEqual(h.state.player.cargo.items, {});
    h.state.player.cargo.capVolume = 1;
    dock(h, 'station_helios');
    h.bus.emit('ui:acceptMission', { missionId: row.id });
    assert.equal(h.state.missions.active.length, 0, 'capacity is checked before accepting');
    assert.equal(h.state.player.credits, credits);
    assert.ok(facts(h, 'toast').some((p) => /2.8u cargo capacity/.test(p.text)));
  } finally { h.sim.dispose(); }
});

test('M15 seed 4242: buying the component restores real stock, pays once, and the price correction expires', () => {
  const h = boot();
  try {
    shortage(h);
    const mission = accept(h);
    const startCredits = h.state.player.credits;
    buy(h);
    assert.ok(h.state.player.credits < startCredits, 'the replacement has an actual acquisition cost');
    const beforePay = h.state.player.credits;
    const beforePrice = h.state.economy.markets[DEST][PART].lastBuy;
    dock(h, DEST);
    assert.equal(h.state.player.credits, beforePay + mission.reward_cr);
    assert.equal(h.state.player.cargo.items[PART] || 0, 0);
    const correction = assertRestored(h, mission, 'replacement_delivery');
    h.bus.emit('cargo:delivered', { stationId: DEST, commodityId: PART, qty: 4, missionId: mission.id });
    dock(h, DEST);
    assert.equal(h.state.economy.markets[DEST][PART].stock, 5, 'delivery replay cannot mint stock');
    assert.equal(facts(h, 'economy:shortageRepairRestored').length, 1);
    assert.equal(facts(h, 'mission:completed').length, 1);
    for (let i = 0; i < 35; i++) {
      h.state.simTime += 5;
      h.econ.econTick(5, h.state);
    }
    assert.ok(h.state.economy.markets[DEST][PART].lastBuy < beforePrice,
      'the normal economy tick applies the finite correction to the real listing');
    h.state.simTime += 5;
    h.econ.ageEvents(h.state);
    assert.equal(h.state.economy.econEvents.some((e) => e.id === correction.id), false);
    assert.equal(h.state.economy.markets[DEST][PART].eventMods.some((m) => m.eventId === correction.id), false);
  } finally { h.sim.dispose(); }
});

test('M15 seed 4242: the equivalent workpiece is real wreck cargo; salvage and claim risk precede delivery', () => {
  const h = boot();
  try {
    shortage(h);
    const mission = accept(h);
    h.state.world.currentSectorId = mission.destSectorId;
    h.state.world.activeSector = SECTORS.find((s) => s.id === mission.destSectorId);
    h.state.ui.docked = false;
    h.state.ui.dockedStationId = null;
    h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
    const wreck = h.state.entityList.find((e) => e.alive && e.data?.contractClaimSiteOf === mission.id);
    assert.ok(wreck, 'the normal salvage target owner placed the workpiece');
    assert.equal(wreck.data.salvagePool[PART], 4);
    assert.ok(wreck.mass > h.player.mass && wreck.collides, 'the workpiece has physical handling risk');
    assert.ok(wreck.data.salvorClaimedBy, 'the existing claim crew makes the risk real');
    const miner = h.sim.registry.get('mining');
    miner._drainWreck(h.player, wreck, 18, 12);
    const parts = h.state.entityList.filter((e) => e.alive && e.type === 'pickup' && e.data?.commodityId === PART);
    assert.ok(parts.length > 0, 'cutting releases physical replacement parts');
    for (const pickup of parts) miner._collectPickupViaEvent(pickup, h.player);
    assert.equal(h.state.player.cargo.items[PART], 4, 'cargo owner accepted the real pickups');
    assert.equal(mission.params.contractWreckGone, 'drained');
    assert.equal(mission.params.contractCrewSprung, true, 'stripping the claim provokes its existing crew');
    assert.equal(facts(h, 'economy:shortageRepairRestored').length, 0, 'salvage alone does not repair the receiver');
    dock(h, DEST);
    assertRestored(h, mission, 'salvaged_workpiece');
    assert.equal(facts(h, 'economy:tradeCompleted').length, 0, 'this approach did not buy the parts');
  } finally { h.sim.dispose(); }
});

test('M15 seed 4242: wrong and damaged short loads leave a recoverable job with real partial costs', () => {
  const h = boot();
  try {
    shortage(h);
    const mission = accept(h);
    addCargo(h.state, 'cmdty_scrap_metal', 4);
    dock(h, DEST);
    assert.equal(mission.status, 'active');
    assert.equal(h.state.player.cargo.items.cmdty_scrap_metal, 4, 'the wrong component stays in custody');
    buy(h);
    const creditsAfterPurchase = h.state.player.credits;
    removeCargo(h.state, PART, 2); // two replacement units are lost in transit
    dock(h, DEST);
    assert.equal(mission.status, 'active', 'a short load cannot close the job');
    assert.equal(h.state.player.cargo.items[PART], 2, 'the surviving work remains usable');
    assert.equal(h.state.economy.markets[DEST][PART].stock, 1);
    assert.equal(facts(h, 'economy:shortageRepairRestored').length, 0);
    buy(h, 2);
    assert.ok(h.state.player.credits < creditsAfterPurchase, 'replacing the lost units costs money');
    dock(h, DEST);
    assertRestored(h, mission, 'replacement_delivery');
  } finally { h.sim.dispose(); }
});

test('M15 seed 4242: a destroyed workpiece can be replaced, and an aborted job can be taken again', () => {
  const h = boot();
  try {
    shortage(h);
    const first = accept(h);
    h.bus.emit('ui:abandonMission', { missionId: first.id });
    assert.equal(first.status, 'failed');
    assert.equal(facts(h, 'economy:shortageRepairRestored').length, 0);
    const mission = accept(h); // same epoch, no repeat deposit or permanently spent offer
    h.state.world.currentSectorId = mission.destSectorId;
    h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
    const wreck = h.state.entityList.find((e) => e.alive && e.data?.contractClaimSiteOf === mission.id);
    assert.ok(wreck);
    wreck.alive = false;
    h.bus.emit('entity:destroyed', { id: wreck.id, entity: wreck, reason: 'combat' });
    assert.equal(mission.params.contractWreckGone, 'destroyed');
    assert.equal(mission.status, 'active');
    buy(h);
    dock(h, DEST);
    assertRestored(h, mission, 'replacement_delivery');
  } finally { h.sim.dispose(); }
});

test('M15 seed 4242: repair before acceptance or an already stocked counter retires stale work without payment', () => {
  const h = boot();
  try {
    shortage(h);
    const row = offer(h);
    h.state.economy.markets[DEST][PART].stock = 50;
    const credits = h.state.player.credits;
    h.bus.emit('ui:acceptMission', { missionId: row.id });
    assert.equal(h.state.missions.active.length, 0);
    assert.equal(h.state.player.credits, credits);
    assert.equal(offer(h), undefined);
    assert.equal(facts(h, 'economy:shortageRepairRestored').length, 0);
  } finally { h.sim.dispose(); }
});

test('M15 seed 4242: two station desks cannot sell the same repair obligation twice', () => {
  const h = boot();
  try {
    shortage(h);
    const first = offer(h);
    dock(h, DEST);
    const other = h.state.missions.boards[DEST].slots.find(isShortageGateRepair);
    assert.ok(other, 'the receiving desk can post the same shortage');
    dock(h, 'station_helios');
    h.bus.emit('ui:acceptMission', { missionId: first.id });
    dock(h, DEST);
    h.bus.emit('ui:acceptMission', { missionId: other.id });
    assert.equal(h.state.missions.active.filter(isShortageGateRepair).length, 1);
    assert.equal(h.state.missions.boards[DEST].slots.some((row) => row.id === other.id), false);
  } finally { h.sim.dispose(); }
});

test('M15 seed 4242: stock, the restoration receipt and its once-only aftermath survive reload', () => {
  const h = boot();
  const restored = boot();
  try {
    shortage(h);
    const mission = accept(h);
    buy(h);
    dock(h, DEST);
    restored.econ.deserialize(JSON.parse(JSON.stringify(h.econ.serialize())));
    restored.contracts.deserialize(JSON.parse(JSON.stringify(h.contracts.serialize())));
    restored.missionSystem.deserialize(JSON.parse(JSON.stringify(h.missionSystem.serialize())));
    const before = restored.state.player.credits;
    dock(restored, DEST);
    restored.bus.emit('cargo:delivered', { stationId: DEST, commodityId: PART, qty: 4, missionId: mission.id });
    assert.equal(restored.state.economy.markets[DEST][PART].stock, 5);
    assert.equal(restored.state.player.credits, before);
    assert.equal(facts(restored, 'economy:shortageRepairRestored').length, 0);
    assert.equal(offer(restored), undefined);
    assert.match(restored.state.missions.receipts.find((r) => r.missionId === mission.id).restoration.text,
      /Hull Plate stock restored/);
  } finally { h.sim.dispose(); restored.sim.dispose(); }
});
