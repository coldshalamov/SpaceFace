import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { automation, droneRecoveryCost } from '../src/systems/automation.js';
import { automationScreen, describeDroneEarnings } from '../src/ui/screens/automationPanel.js';
import { AUTO_BALANCE, DRONES, TRADERS } from '../src/data/automation.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SECTORS } from '../src/data/sectors.js';
import { SHIPS } from '../src/data/ships.js';
import { buildSlotList } from '../src/systems/ships.js';

const DT = 1 / 60;
const HOME = 'sector_helios_prime';
const AWAY = 'sector_ceres_belt';
const MK1 = DRONES.find((d) => d.id === 'drone_mk1');
const copy = (v) => JSON.parse(JSON.stringify(v));

function boot({ physical = false, credits = 10_000, x = 400 } = {}) {
  const towDriver = { name: 'rescueTestTug', update(dt, state) {
    if (!state.rescueTestTow) return;
    writePhysicsControl(state.entities.get(state.playerId), { source: 'rescue-test-tug', mode: 'newtonian',
      force: { x: -160, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, maxSpeed: 60 });
  } };
  const sim = createSimulation({ seed: 4242, systems: physical
    ? [flightV3, towDriver, physics, combat, economy, automation] : [economy, automation] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = HOME;
  state.player.credits = credits;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.combat.attachments ||= { nextId: 1, byId: {} };
  const inst = sim.registry.get('automation');
  const events = [];
  for (const name of ['automation:droneDistressed', 'automation:assetDistressed',
    'automation:droneRecovered', 'economy:chargeCredits', 'toast']) {
    sim.bus.on(name, (payload) => events.push({ name, payload: copy(payload) }));
  }
  const player = sim.spawn({ type: 'ship', isPlayer: true, pos: { x: x - 60, z: 0 },
    radius: 8, mass: 24, hull: 100, hullMax: 100, collides: false,
    data: { defId: 'ship_kestrel' } });
  state.playerId = player.id;
  const g = {
    id: 'rescue-4242', defId: MK1.id, count: 1, sectorId: HOME,
    status: 'mining', fuel: 0.001, fuelMax: MK1.fuelMax, buffer: 7, bufferCap: MK1.bufferCap,
    durability: MK1.durabilityMax, durabilityMax: MK1.durabilityMax,
    originPos: { x, z: 0 }, entityIds: [],
    shipment: { items: { cmdty_ore_iron: 7 }, usedVolume: 7, usedMass: 7 },
  };
  state.automation.drones.push(g);
  const drone = sim.spawn({ type: 'drone', pos: { x, z: 0 }, radius: 2.4, mass: 6,
    hull: MK1.durabilityMax, hullMax: MK1.durabilityMax, collides: false,
    maxSpeed: 130, drag: 1.4, data: { kind: 'mining_drone', groupId: g.id, scanLabel: 'My miner' } });
  g.entityIds = [drone.id];
  const step = (n = 1) => { for (let i = 0; i < n; i++) sim.step(DT); };
  const named = (name) => events.filter((e) => e.name === name);
  const beacons = () => state.entityList.filter((e) => e.alive !== false
    && e.type === 'beacon' && e.data?.automationRecoveryId === g.id);
  const station = (id = 'station_helios', sx = 0, sz = 0) => sim.spawn({
    type: 'station', pos: { x: sx, z: sz }, radius: 30, mass: 1e6,
    hull: 1e6, hullMax: 1e6, collides: false, data: { stationId: id, dockRadius: 90 },
  });
  const line = (overrides = {}) => {
    const record = { id: 'fixture-line', state: 'active', ownerId: player.id,
      targetId: drone.id, ...overrides };
    state.combat.attachments.byId[record.id] = record;
    return record;
  };
  return { sim, state, inst, events, player, g, drone, step, named, beacons, station, line,
    dispose() {
      sim.registry.get('physics')?._disableSg02DynamicAuthority?.();
      sim.dispose();
    } };
}

function screenFor(state) {
  const screen = Object.create(automationScreen);
  screen._ctx = { state, bus: { emit() {} } };
  screen._tab = 'drones';
  screen._section = (text) => ({ innerHTML: text, className: '' });
  screen._close = () => { screen.closed = true; };
  return screen;
}

function renderDrones(screen) {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ innerHTML: '', className: '' }) };
  const cards = [];
  try { screen._renderDrones({ appendChild: (el) => cards.push(el) }); }
  finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
  return cards;
}

test('tier-1 shop and owned cards say 113 capped, shared and before upkeep; shop has Buy and no Throttle', () => {
  const h = boot();
  try {
    h.state.player.ownedShips = [{ defId: 'ship_ranger',
      fittings: buildSlotList(SHIPS.find((s) => s.id === 'ship_ranger'))
        .map((slot) => slot.type === 'utility' && slot.size === 'L' ? 'mod_drone_bay_l' : null) }];
    h.state.player.activeShipIndex = 0;
    h.state.player.researchedNodes = ['tech_drone_control'];
    const earnings = describeDroneEarnings(h.state, MK1);
    assert.equal(earnings.capPerMin, 112.5);
    assert.equal(earnings.cappedPerMin, 112.5);
    assert.equal(earnings.grossPerMin, MK1.mineRate * 60 * COMMODITIES.find((c) => c.id === 'cmdty_ore_iron').basePrice);
    for (const token of ['113', 'capped', 'shared', 'before upkeep']) assert.ok(earnings.text.includes(token));
    const cards = renderDrones(screenFor(h.state));
    const owned = cards.find((c) => c.className === 'au-card');
    const shop = cards.filter((c) => c.className.includes('au-shop--drones'));
    assert.ok(owned.innerHTML.includes(earnings.text));
    assert.match(owned.innerHTML, /Bank stored ore on Recall/);
    assert.ok(shop[0].innerHTML.includes(earnings.text));
    for (const card of shop) {
      assert.match(card.innerHTML, /data-act="buyDrone"/);
      assert.doesNotMatch(card.innerHTML, /Throttle|data-act="conduct"/);
    }
    assert.match(shop[0].innerHTML, />Buy /);
    const screen = screenFor(h.state);
    screen.refresh = () => {};
    screen._onAction('conduct', 'drones');
    assert.equal(screen._conduct, 'drones', 'flow-strip conduct remains available');
    screen._onAction('conduct', 'drones');
    assert.equal(screen._conduct, null);
  } finally { h.dispose(); }
});

test('multiple manual drones describe one shared ceiling, while depot sales preserve their actual receipt', () => {
  const h = boot();
  try {
    const group = { ...h.g, count: 2 };
    const earnings = describeDroneEarnings(h.state, group);
    assert.equal(earnings.grossPerMin, describeDroneEarnings(h.state, MK1).grossPerMin * 2);
    assert.equal(earnings.cappedPerMin, 112.5);
    assert.match(earnings.text, /shared ceiling/);
    h.state.automation.drones.push({ ...h.g, id: 'other' });
    for (const g of h.state.automation.drones) assert.equal(describeDroneEarnings(h.state, g).capPerMin, 112.5);
    h.g.program = { templateId: 'mine_to_depot' };
    h.g.operation = { storedUnits: 7, storedCap: 40, grossUnits: 9,
      lastSale: { credited: 987, quantity: 11 }, operatingCostPerMin: 6 };
    const before = copy(h.g.operation.lastSale);
    const throughput = describeDroneEarnings(h.state, h.g);
    assert.equal(throughput.settlement, 'throughput');
    assert.equal(throughput.cappedPerMin, null);
    const owned = renderDrones(screenFor(h.state)).find((c) => c.className === 'au-card');
    assert.match(owned.innerHTML, /Depot sales/);
    assert.match(owned.innerHTML, /987 cr for 11u/);
    assert.deepEqual(h.g.operation.lastSale, before);
  } finally { h.dispose(); }
});

test('normal fuel exhaustion emits one copied distress position; disabled ticks reconcile one harmless beacon', () => {
  const h = boot();
  try {
    h.step(2);
    const distressed = h.named('automation:droneDistressed');
    assert.equal(distressed.length, 1);
    assert.deepEqual(distressed[0].payload, { id: h.g.id, sectorId: HOME, pos: { x: 400, z: 0 }, reason: 'fuel' });
    assert.notStrictEqual(h.g.recovery.pos, h.drone.pos);
    assert.notStrictEqual(h.g.recovery.pos, h.g.recovery.beaconPos);
    assert.ok(Number.isFinite(h.g.recovery.startedAt));
    h.step(120);
    assert.equal(h.named('automation:droneDistressed').length, 1);
    assert.equal(h.beacons().length, 1);
    const marker = h.beacons()[0];
    assert.equal(marker.collides, false);
    assert.equal(marker.physicsBody, false);
    assert.equal(marker.data.masslineTetherable, false);
    assert.equal(marker.radius, 5);
    assert.match(marker.data.scanLabel, /Stranded Drone.*tow to a station/);
    assert.equal(h.drone.alive, true);
    assert.equal(h.drone.data.scanLabel, 'Stranded Drone');
    assert.equal(h.drone.data.intent.brake, true);
    assert.equal(h.state.beacons?.length || 0, 0, 'the hostile-attracting beacon owner is untouched');
    h.g.recovery.pos.x = 401;
    assert.equal(distressed[0].payload.pos.x, 400, 'event position is an independent snapshot');
  } finally { h.dispose(); }
});

test('unpaid upkeep emits existing and drone distress events once, then a paid tow restores the previous status', () => {
  const h = boot({ credits: 0, x: 100 });
  try {
    h.g.fuel = MK1.fuelMax;
    h.state.automation.accumulators.upkeepDebt = 9;
    h.station();
    h.step(2);
    assert.equal(h.g.status, 'distressed');
    assert.equal(h.g.recovery.reason, 'upkeep');
    assert.equal(h.named('automation:assetDistressed').length, 1);
    assert.equal(h.named('automation:droneDistressed').length, 1);
    h.step(120);
    assert.equal(h.named('automation:droneDistressed').length, 1);
    h.line();
    h.step();
    assert.equal(h.g.recovery.delivered, true);
    assert.equal(h.drone.data.intent.brake, false);
    const bill = droneRecoveryCost(h.state, h.g);
    const debt = h.state.automation.accumulators.upkeepDebt;
    h.state.player.credits = bill.totalCr;
    h.step();
    assert.equal(h.g.status, 'mining');
    assert.equal(h.g.recovery, null);
    assert.equal(h.named('automation:droneRecovered').length, 1);
    assert.equal(h.named('economy:chargeCredits').filter((e) => e.payload.reason === 'automation:upkeep').length, 1);
    assert.ok(h.state.automation.accumulators.upkeepDebt < 1);
    assert.ok(debt >= bill.upkeepCr);
    assert.equal(h.beacons().length, 0);
    assert.equal(h.drone.data.scanLabel, 'My miner');
  } finally { h.dispose(); }
});

test('Locate targets only the validated local group and otherwise opens its recovery sector on the galaxy map', () => {
  const h = boot();
  try {
    h.station(); h.step(2);
    const screen = screenFor(h.state);
    let html = renderDrones(screen).find((c) => c.className === 'au-card').innerHTML;
    assert.match(html, /Stranded Drone — tow to Helios/);
    assert.match(html, /Fuel and unpaid upkeep are charged on recovery/);
    assert.match(html, /Locate drone/);
    screen._onAction('locateDrone', h.g.id);
    assert.equal(h.state.player.targetId, h.drone.id);
    assert.equal(screen.closed, true);
    const signature = screen._bodySignature();
    h.g.recovery.delivered = true;
    assert.notEqual(screen._bodySignature(), signature);
    html = renderDrones(screen).find((c) => c.className === 'au-card').innerHTML;
    assert.match(html, /Waiting for payment: 120 cr/);
    const costSignature = screen._bodySignature();
    h.state.automation.accumulators.upkeepDebt = 5;
    assert.notEqual(screen._bodySignature(), costSignature);
    screen.closed = false;
    h.state.world.currentSectorId = AWAY;
    screen._onAction('locateDrone', h.g.id);
    assert.deepEqual(h.state.ui.mapOpenIntent, { focus: 'galaxy', sectorId: HOME,
      missionId: null, stationId: null, pos: null, label: 'Stranded Drone', source: 'automation:drone-recovery' });
    assert.equal(screen.closed, false);
    h.state.world.currentSectorId = HOME;
    h.drone.data.groupId = 'foreign';
    h.state.player.targetId = null;
    screen._onAction('locateDrone', h.g.id);
    assert.equal(h.state.player.targetId, null, 'a recycled local ID opens the map instead of selecting foreign work');
  } finally { h.dispose(); }
});

test('no station keeps rescue pending; nearest destination uses a catalog ID and stable distance tie-break', () => {
  const h = boot({ x: 0 });
  try {
    h.step(2);
    assert.equal(h.g.recovery.stationId, null);
    assert.match(renderDrones(screenFor(h.state)).find((c) => c.className === 'au-card').innerHTML, /Tow to a station/);
    const ids = SECTORS.find((s) => s.id === HOME).stations.map((s) => s.id).sort();
    assert.ok(ids.length >= 2);
    h.station(ids[1], -300);
    h.station(ids[0], 300);
    h.step();
    assert.equal(h.g.recovery.stationId, ids[0]);
    assert.equal(typeof h.g.recovery.stationId, 'string');
  } finally { h.dispose(); }
});

for (const invalid of ['player-only', 'unattached', 'notification-only', 'broken', 'foreign-group', 'npc', 'stale-generation', 'dead-owner']) {
  test(`${invalid} cannot complete a rescue`, () => {
    const h = boot({ x: invalid === 'player-only' ? 400 : 100 });
    try {
      h.station(); h.player.pos.x = 0; h.step(2);
      if (invalid === 'notification-only') h.sim.bus.emit('tether:latched', { targetId: h.drone.id, ownerId: h.player.id });
      if (invalid === 'broken') h.line({ state: 'broken' });
      if (invalid === 'foreign-group') {
        const foreign = h.sim.spawn({ type: 'drone', pos: { x: 100, z: 0 }, data: { groupId: 'foreign' } });
        h.line({ targetId: foreign.id });
      }
      if (invalid === 'npc') {
        const npc = h.sim.spawn({ type: 'ship', pos: { x: 110, z: 0 } });
        h.line({ ownerId: npc.id });
      }
      if (invalid === 'stale-generation') h.line({ targetGeneration: 'replaced-occupant' });
      if (invalid === 'dead-owner') h.line({ ownerId: 999999 });
      h.step(2);
      assert.equal(h.g.status, 'stranded');
      assert.equal(h.g.recovery.delivered, false);
      assert.equal(h.named('automation:droneRecovered').length, 0);
      assert.equal(h.named('economy:chargeCredits').length, 0);
      assert.equal(h.beacons().length, 1);
    } finally { h.dispose(); }
  });
}

test('a player-controlled attachment can deliver, and a combined bill waits intact then settles exactly once', () => {
  const h = boot({ credits: 100, x: 100 });
  try {
    h.station(); h.step(2);
    const anchor = h.sim.spawn({ type: 'asteroid', pos: { x: 130, z: 0 } });
    h.line({ ownerId: anchor.id, controllerId: h.player.id });
    h.g.status = 'distressed'; h.g._prevStatus = 'stranded';
    h.state.automation.accumulators.upkeepDebt = 10.25;
    const shipment = copy(h.g.shipment);
    h.step(120);
    assert.equal(h.g.recovery.delivered, true);
    assert.equal(h.g.fuel, 0);
    assert.equal(h.state.player.credits, 100, 'neither component of the combined bill can be partially charged');
    assert.equal(h.named('economy:chargeCredits').length, 0);
    assert.equal(h.named('automation:droneRecovered').length, 0);
    assert.equal(h.named('toast').filter((e) => /Insufficient credits/.test(e.payload.text)).length, 0);
    assert.deepEqual(h.g.shipment, shipment);
    h.state.player.credits = 130;
    h.step();
    assert.equal(h.state.player.credits, 0);
    assert.equal(h.g.fuel, MK1.fuelMax);
    assert.equal(h.g.status, 'mining');
    assert.equal(h.g.recovery, null);
    assert.deepEqual(h.g.shipment, shipment);
    assert.deepEqual(h.named('economy:chargeCredits').map((e) => [e.payload.reason, e.payload.amount]),
      [['automation:drone:refuel', 120], ['automation:upkeep', 10]]);
    assert.equal(h.named('automation:droneRecovered').length, 1);
    assert.equal(h.named('toast').filter((e) => e.payload.kind === 'success').length, 1);
    assert.equal(h.beacons().length, 0);
    h.inst._syncDroneRecovery = () => assert.fail('restored drone must not revisit recovery');
    h.step(10);
    assert.equal(h.named('automation:droneRecovered').length, 1);
    assert.equal(h.named('economy:chargeCredits').length, 2);
  } finally { h.dispose(); }
});

for (const credits of [0, 100]) {
  test(`a delivered rescue waiting with ${credits} credits preserves its bill while other assets face upkeep enforcement`, () => {
    const h = boot({ credits, x: 100 });
    try {
      // A real Mk2 costs more than this trader, so ordinary lowest-value repossession
      // selects the trader while the delivered rescue remains available for payment.
      const def = DRONES.find((d) => d.id === 'drone_mk2');
      h.g.defId = def.id;
      h.g.fuelMax = def.fuelMax;
      h.station(); h.step(2);
      h.line(); h.step();
      assert.equal(h.g.recovery.delivered, true);
      const trader = { id: 'unpaid-trader', defId: TRADERS[0].id, status: 'idle' };
      const a = h.state.automation;
      a.traders.push(trader);
      a.accumulators.upkeepDebt = 10.25;
      const shipment = copy(h.g.shipment);
      h.step(2);
      assert.equal(trader.status, 'distressed');
      assert.equal(h.named('automation:assetDistressed').filter((e) => e.payload.id === trader.id).length, 1);
      assert.ok(a.accumulators.upkeepDebt > 10.25, 'unpaid upkeep continues accruing');
      assert.ok(a.meta.graceTimer > 0, 'unpaid upkeep advances the ordinary grace timer');
      assert.equal(h.state.player.credits, credits, 'the combined rescue bill is not partially charged');
      assert.equal(h.named('economy:chargeCredits').length, 0);
      assert.equal(h.named('automation:droneRecovered').length, 0);
      assert.equal(h.g.recovery.delivered, true);
      assert.deepEqual(h.g.shipment, shipment);

      const repossessed = [];
      h.sim.bus.on('automation:assetRepossessed', (event) => repossessed.push(copy(event)));
      a.meta.graceTimer = AUTO_BALANCE.distressGraceSec - DT / 2;
      h.step();
      assert.equal(a.traders.includes(trader), false, 'the waiting rescue cannot shield unrelated assets from repossession');
      assert.deepEqual(repossessed.map(({ kind, id }) => ({ kind, id })), [{ kind: 'trader', id: trader.id }]);
      assert.equal(a.drones.includes(h.g), true);
      assert.equal(h.g.recovery.delivered, true);
      assert.deepEqual(h.g.shipment, shipment);
      assert.equal(h.state.player.credits, credits);
      assert.equal(h.named('economy:chargeCredits').length, 0);
    } finally { h.dispose(); }
  });
}

for (const delivered of [false, true]) {
  test(`JSON continuation ${delivered ? 'after delivery awaiting payment' : 'before towing'} preserves position and reconciles one beacon`, () => {
    const h = boot({ credits: 0, x: delivered ? 100 : 400 });
    const restored = boot({ credits: 0 });
    try {
      h.station(); h.step(2);
      if (delivered) { h.line(); h.step(); }
      const before = copy(h.g.recovery);
      const save = copy(h.inst.serialize());
      assert.deepEqual(save.drones[0].recovery, before);
      assert.equal(Object.hasOwn(save.drones[0], 'entityIds'), false);
      assert.equal(Object.hasOwn(save.drones[0], '_recoveryBeaconId'), false);
      assert.deepEqual(Object.keys(save.drones[0].recovery).sort(),
        ['version', 'reason', 'sectorId', 'pos', 'beaconPos', 'stationId', 'delivered', 'startedAt'].sort());
      restored.station();
      restored.inst.deserialize(save);
      restored.events.length = 0;
      restored.step(3);
      const g = restored.state.automation.drones[0];
      assert.deepEqual(g.recovery, before);
      assert.deepEqual(restored.state.entities.get(g.entityIds[0]).pos.x, before.pos.x);
      assert.equal(restored.beacons().length, 1);
      assert.equal(restored.named('automation:droneDistressed').length, 0);
      assert.equal(restored.named('automation:droneRecovered').length, 0);
      if (delivered) {
        restored.state.player.credits = 120;
        restored.step(2);
        assert.equal(g.recovery, null);
        assert.equal(restored.named('economy:chargeCredits').length, 1);
        assert.equal(restored.named('automation:droneRecovered').length, 1);
      }
    } finally { h.dispose(); restored.dispose(); }
  });
}

test('old saves materialize disabled hulls at origin; malformed/unsupported recovery data is rejected', () => {
  const h = boot();
  try {
    h.step(2);
    const legacy = copy(h.inst.serialize());
    delete legacy.drones[0].recovery;
    h.inst.deserialize(legacy);
    let g = h.state.automation.drones[0];
    assert.equal(g.recovery, null);
    h.step(2);
    assert.deepEqual(g.recovery.pos, { x: 400, z: 0 });
    for (const bad of [{ ...copy(g.recovery), version: 99 }, { ...copy(g.recovery), pos: { x: null, z: 0 } }]) {
      const save = copy(h.inst.serialize()); save.drones[0].recovery = bad;
      h.inst.deserialize(save);
      assert.equal(h.state.automation.drones[0].recovery, null);
    }
  } finally { h.dispose(); }
});

test('hard sector exit preserves the latest tow position and re-entry rematerializes there without duplicate distress', () => {
  const h = boot();
  try {
    h.step(2);
    h.drone.pos.x = 333;
    h.sim.bus.emit('sector:exit', { sectorId: HOME });
    assert.equal(h.beacons().length, 0);
    assert.equal(h.drone.alive, false);
    assert.deepEqual(h.g.recovery.pos, { x: 333, z: 0 });
    h.state.world.currentSectorId = AWAY;
    h.step(2);
    assert.equal(h.g.entityIds.length, 0);
    h.state.world.currentSectorId = HOME;
    h.sim.bus.emit('sector:enter', { sectorId: HOME });
    h.step(2);
    const rematerialized = h.state.entities.get(h.g.entityIds[0]);
    assert.equal(rematerialized.pos.x, 333);
    assert.equal(h.beacons().length, 1);
    assert.equal(h.named('automation:droneDistressed').length, 1);
  } finally { h.dispose(); }
});

test('continuous sector handoff keeps physical identity and updates recovery membership', () => {
  const h = boot();
  try {
    h.step(2); h.drone.pos.x = 350;
    h.sim.bus.emit('sector:exit', { sectorId: HOME, continuous: true });
    h.state.world.currentSectorId = AWAY;
    h.sim.bus.emit('sector:enter', { sectorId: AWAY, continuous: true });
    h.step();
    assert.equal(h.state.entities.get(h.g.entityIds[0]), h.drone);
    assert.equal(h.g.sectorId, AWAY);
    assert.equal(h.g.recovery.sectorId, AWAY);
    assert.deepEqual(h.g.recovery.pos, { x: 350, z: 0 });
    assert.deepEqual(h.g.recovery.beaconPos, { x: 400, z: 0 }, 'the beacon retains the original failure position');
    assert.equal(h.beacons().length, 1);
    assert.equal(h.named('automation:droneDistressed').length, 1);
  } finally { h.dispose(); }
});

for (const action of ['manual-refuel', 'paid-undistress', 'recall', 'repossession', 'destruction', 'physical-destruction', 'new-game']) {
  test(`${action} clears recovery beacons and never resurrects a removed group`, () => {
    const h = boot();
    try {
      h.step(2);
      if (action === 'manual-refuel') h.inst.refuelDrone(h.g.id);
      if (action === 'paid-undistress') {
        h.g.fuel = MK1.fuelMax;
        h.g.status = 'distressed'; h.g._prevStatus = 'mining';
        h.inst._undistressAll(h.state.automation);
      }
      if (action === 'recall') h.inst.recallDrone(h.g.id);
      if (action === 'repossession') h.inst._repossessOne(h.state.automation);
      if (action === 'destruction') h.sim.bus.emit('combat:hitAsset', { assetKind: 'drone', assetId: h.g.id, damage: 1000 });
      if (action === 'physical-destruction') { h.drone.hull = 0; h.drone.alive = false; }
      if (action === 'new-game') h.inst.newGame();
      h.step(3);
      assert.equal(h.beacons().length, 0);
      if (['manual-refuel', 'paid-undistress'].includes(action)) {
        assert.equal(h.g.recovery, null);
        assert.equal(h.drone.data.scanLabel, 'My miner');
      } else {
        assert.equal(h.state.automation.drones.length, 0);
        assert.equal(h.state.entityList.filter((e) => e.alive !== false && e.data?.groupId === h.g.id).length, 0);
      }
    } finally { h.dispose(); }
  });
}

test('recycled beacon and drone IDs never remove or relabel a foreign entity', () => {
  const h = boot();
  try {
    h.step(2);
    const beaconId = h.g._recoveryBeaconId;
    const foreignBeacon = { id: beaconId, type: 'beacon', alive: true,
      pos: { x: 900, z: 3 }, data: { automationRecoveryId: 'foreign', scanLabel: 'Foreign beacon' } };
    const foreignDrone = { id: h.drone.id, type: 'drone', alive: true,
      pos: { x: 700, z: 3 }, data: { groupId: 'foreign', scanLabel: 'Foreign drone' } };
    h.state.entities.set(beaconId, foreignBeacon);
    h.state.entities.set(h.drone.id, foreignDrone);
    h.state.entityList[h.state.entityList.findIndex((e) => e.id === beaconId)] = foreignBeacon;
    h.state.entityList[h.state.entityList.findIndex((e) => e.id === h.drone.id)] = foreignDrone;
    const before = [copy(foreignBeacon), copy(foreignDrone)];
    h.inst._syncDroneRecovery(h.g, MK1, DT);
    assert.deepEqual([foreignBeacon, foreignDrone], before);
    assert.notEqual(h.g.entityIds[0], foreignDrone.id);
    h.inst.recallDrone(h.g.id);
    assert.deepEqual([foreignBeacon, foreignDrone], before);
    assert.equal(h.beacons().length, 0, 'replacement recovery beacon is cleaned without deleting the foreign marker');
  } finally { h.dispose(); }
});

async function physicalRecovery() {
  const h = boot({ physical: true });
  const physicsSystem = h.sim.registry.get('physics');
  try {
    h.station();
    assert.equal(await physicsSystem.prepareBackend(h.state), true);
    h.step(2);
    const kernel = h.sim.registry.get('combat').kernel;
    const attached = kernel.attachments.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: h.drone.id });
    assert.equal(attached.ok, true, attached.reason);
    const shipment = copy(h.g.shipment);
    const startX = h.drone.pos.x;
    h.state.rescueTestTow = true;
    let towedTicks = 0;
    for (let tick = 0; tick < 1800 && h.g.recovery; tick++) {
      // The tug uses the canonical physics control port. The rescued drone is moved solely
      // by the production attachment joint; automation only publishes its neutral intent.
      h.step();
      if (h.g.recovery) {
        assert.equal(h.drone.data.intent.brake, false);
        assert.equal(h.drone.data.intent.moveX, 0);
        assert.equal(h.drone.data.intent.moveZ, 0);
        towedTicks++;
      }
    }
    assert.ok(towedTicks > 0);
    assert.ok(startX - h.drone.pos.x > 200, `real tow displacement: ${startX - h.drone.pos.x}`);
    assert.ok(Math.hypot(h.drone.pos.x, h.drone.pos.z) <= 154, 'delivery uses drone berth distance');
    assert.equal(h.g.recovery, null, 'the physical tow completes');
    assert.equal(h.g.status, 'mining');
    assert.equal(h.g.fuel, MK1.fuelMax);
    assert.deepEqual(h.g.shipment, shipment);
    assert.equal(h.named('economy:chargeCredits').filter((e) => e.payload.reason === 'automation:drone:refuel').length, 1);
    assert.equal(h.named('economy:chargeCredits').find((e) => e.payload.reason === 'automation:drone:refuel').payload.amount, 120);
    assert.equal(h.named('automation:droneRecovered').length, 1);
    assert.equal(h.beacons().length, 0);
    return { dronePos: { x: h.drone.pos.x, z: h.drone.pos.z }, fuel: h.g.fuel, status: h.g.status,
      recovery: h.g.recovery, shipment: copy(h.g.shipment),
      events: h.events.filter((e) => e.name.startsWith('automation:drone') || e.name === 'economy:chargeCredits') };
  } finally { h.dispose(); }
}

test('production attachment kernel and headless Rapier physically tow and restore a stranded drone deterministically', async () => {
  const first = await physicalRecovery();
  const second = await physicalRecovery();
  assert.deepEqual(first, second, 'seed-4242 normalized recovery state and event sequences repeat');
});
