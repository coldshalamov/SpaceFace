import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { ships as shipsProto, buildSlotList, makeShipEntitySpec } from '../src/systems/ships.js';
import { economy as economyProto } from '../src/systems/economy.js';
import { cargo as cargoProto } from '../src/systems/cargo.js';
import { traffic as trafficProto } from '../src/systems/traffic.js';
import { makeEntity } from '../src/core/entity.js';
import { buildCargoManifest } from '../src/economy/freightCausality.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { SHIPS } from '../src/data/ships.js';
import { ensureShipjack, normalizeShipjack } from '../src/shipjack/model.js';
import { valuationBreakdown, inspectVessel, sanitizeYardPersistence } from '../src/shipjack/market.js';
import { quoteYardOperation, executeYardOperation, advanceYardOperations } from '../src/shipjack/yardOperations.js';

function boot({ title = 'clean', stationId = 'station_helios' } = {}) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.ui.docked = true;
  state.ui.dockedStationId = stationId;
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
    name: 'Empty Seat', title, originalOwner: 'captain_mara_venn', recognizedOwner: title === 'clean' ? 'player' : 'captain_mara_venn',
    custodian: 'player', condition: { hull: 0.7 }, revision: 0, lienCr: 0, history: [],
    signature: { broadcast: 'REG-MARA', frame: 'FRAME-MARA', engine: 'DRIVE-MARA' },
    location: { kind: 'berth', stationId, sectorId: 'sector_helios_prime' } };
  const bus = createBus();
  const ships = Object.create(shipsProto);
  const economy = Object.create(economyProto);
  const registry = { get: (name) => name === 'ships' ? ships : name === 'economy' ? economy : null };
  const ctx = { state, bus, registry, helpers: {} };
  ships.init(ctx);
  economy.init(ctx);
  let sequence = 0;
  const execute = (action, extra = {}) => {
    const request = { vesselId: vessel.vesselId, action, ...extra };
    const result = quoteYardOperation(state, request);
    if (!result.ok) return result;
    return executeYardOperation(ctx, { ...request, quote: result.quote, operationId: `yard:test:${++sequence}` });
  };
  return { ...ctx, ships, economy, vessel, owned, slot, execute };
}

test('appraisal separates shell and fitted value; extraction lowers intact resale', () => {
  const { vessel, owned, slot } = boot();
  const before = valuationBreakdown(vessel, owned);
  owned.fittings[slot] = null;
  const after = valuationBreakdown(vessel, owned);
  assert.equal(before.componentValue, 1260);
  assert.equal(after.componentValue, 0);
  assert.equal(before.intact - after.intact, 1260);
  assert.ok(before.shell + before.componentValue < before.hullBase, 'buy/strip/sell cannot refund a hull purchase');
});

test('hot custody can fool a broadcast inspector while title and frame remain disputed', () => {
  const { vessel } = boot({ title: 'disputed' });
  vessel.signature.forged = true;
  vessel.signature.tamper = 1;
  assert.equal(inspectVessel(vessel, { grade: 1 }).accepted, true);
  const customs = inspectVessel(vessel, { grade: 3 });
  assert.equal(customs.accepted, false);
  assert.ok(customs.findings.some((line) => line.includes('Engine signature')));
  assert.ok(customs.findings.some((line) => line.includes('Title')));
});

test('honest yard denies hot property and liens independently', () => {
  const { state, vessel } = boot({ title: 'disputed' });
  assert.match(quoteYardOperation(state, { vesselId: vessel.vesselId, action: 'sell' }).reason, /title/);
  vessel.title = 'clean';
  vessel.lienCr = 400;
  assert.match(quoteYardOperation(state, { vesselId: vessel.vesselId, action: 'sell' }).reason, /lien/);
});

test('ordinary Shipworks sale cannot bypass a recorded lender lien or terminal registry settlement', () => {
  const ctx = boot();
  ctx.vessel.lienCr = 5000;
  const before = ctx.state.player.credits;
  assert.equal(ctx.ships.sellShip(1), false);
  assert.equal(ctx.state.player.credits, before);
  assert.equal(ctx.state.player.ownedShips.length, 2);
  assert.equal(ctx.vessel.custodian, 'player');
});

test('berth switching cannot heal a damaged prize by borrowing the starter hull integrity', () => {
  const ctx = boot();
  ctx.state.playerId = 1;
  const active = makeEntity({ ...makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: ctx.state.player }), id: 1 });
  ctx.state.entities.set(1, active);
  ctx.state.entityList.push(active);
  assert.equal(active.hull / active.hullMax, 1);
  assert.equal(ctx.ships.setActiveShip(1), true);
  assert.ok(active.hull / active.hullMax <= ctx.vessel.condition.hull + 1e-6,
    'the incoming 70% hull cannot become a free 100% hull');
});

test('intact sale consumes installed instances once through ships and canonical economy', () => {
  const ctx = boot();
  const request = { vesselId: ctx.vessel.vesselId, action: 'sell' };
  const { quote } = quoteYardOperation(ctx.state, request);
  const payload = { ...request, quote, operationId: 'yard:sale:1' };
  const credits = ctx.state.player.credits;
  const receipt = executeYardOperation(ctx, payload);
  assert.equal(receipt.ok, true);
  assert.equal(ctx.state.player.ownedShips.length, 1);
  assert.equal(ctx.state.player.moduleInventory.length, 0, 'no implicit fitted-module refund');
  assert.equal(ctx.state.player.credits, credits + quote.amount);
  assert.deepEqual(executeYardOperation(ctx, payload), receipt);
  assert.equal(ctx.state.player.credits, credits + quote.amount);
  assert.equal(ctx.vessel.location.kind, 'sold');
});

test('stale quotes refuse before inventory or credits move', () => {
  const ctx = boot();
  const request = { vesselId: ctx.vessel.vesselId, action: 'sell' };
  const { quote } = quoteYardOperation(ctx.state, request);
  ctx.owned.fittedInstances[ctx.slot].condition = 0.2;
  const credits = ctx.state.player.credits;
  assert.match(executeYardOperation(ctx, { ...request, quote, operationId: 'yard:stale' }).reason, /revised quote/);
  assert.equal(ctx.state.player.credits, credits);
  assert.equal(ctx.state.player.ownedShips.length, 2);
});

test('active ship and cargo loaded ships cannot be sold', () => {
  const ctx = boot();
  ctx.state.player.activeShipIndex = 1;
  assert.match(ctx.execute('sell').reason, /Change to another ship/);
  ctx.state.player.activeShipIndex = 0;
  ctx.owned.cargo = { items: { cmdty_ore_iron: 1 } };
  assert.match(ctx.execute('sell').reason, /cargo hold/);
});

test('timed extraction moves the exact damaged module and preserves its source', () => {
  const ctx = boot();
  const before = ctx.state.player.credits;
  const started = ctx.execute('extract', { slotIndex: ctx.slot });
  assert.equal(started.status, 'processing');
  assert.equal(ctx.state.player.moduleInventory.length, 0);
  assert.equal(ctx.owned.fittings[ctx.slot], 'mod_engine_ion_m');
  ctx.state.simTime = started.completesAt;
  advanceYardOperations(ctx);
  assert.equal(ctx.owned.fittings[ctx.slot], null);
  assert.equal(ctx.owned.shipjackDriveRemoved, true);
  const [module] = ctx.state.player.moduleInventory;
  assert.equal(module.instanceId, 'mi_prize_drive');
  assert.equal(module.condition, 0.6);
  assert.equal(module.provenance.label, 'Mara’s repaired drive');
  assert.equal(module.provenance.sourceVesselId, ctx.vessel.vesselId);
  assert.equal(ctx.state.player.credits, before + started.quote.amount);
  advanceYardOperations(ctx);
  assert.equal(ctx.state.player.moduleInventory.length, 1);
});

test('changed extraction target cancels and refunds once, without phantom output', () => {
  const ctx = boot();
  const credits = ctx.state.player.credits;
  const job = ctx.execute('extract', { slotIndex: ctx.slot });
  ctx.owned.fittedInstances[ctx.slot].instanceId='mi_replacement_after_booking';
  ctx.state.simTime = job.completesAt;
  advanceYardOperations(ctx);
  assert.equal(ctx.state.player.credits, credits);
  assert.equal(ctx.state.player.moduleInventory.length, 0);
  advanceYardOperations(ctx);
  assert.equal(ctx.state.player.credits, credits);
});

test('extraction becomes ready while flying and settles only on return to its receiving berth', () => {
  const ctx = boot();
  const job = ctx.execute('extract', { slotIndex: ctx.slot });
  const paidBalance = ctx.state.player.credits;
  ctx.state.ui.docked = false;
  ctx.state.simTime = job.completesAt + 30;
  advanceYardOperations(ctx);
  assert.equal(ctx.state.player.credits, paidBalance, 'undocking does not refund booked labor');
  assert.equal(ctx.state.player.moduleInventory.length, 0);
  assert.ok(ctx.state.shipjack.yards[ctx.vessel.vesselId]);
  ctx.state.ui.docked = true;
  ctx.state.ui.dockedStationId = 'station_forge';
  advanceYardOperations(ctx);
  assert.equal(ctx.state.player.moduleInventory.length, 0, 'another port cannot teleport the output');
  ctx.state.ui.dockedStationId = 'station_helios';
  advanceYardOperations(ctx);
  assert.equal(ctx.state.player.moduleInventory.length, 1);
  assert.equal(ctx.state.player.credits, paidBalance, 'the original quote was paid exactly once');
});

test('legal return extinguishes custody without inventing title or gifting fittings', () => {
  const ctx = boot({ title: 'disputed' });
  const receipt = ctx.execute('return');
  assert.equal(receipt.ok, true);
  assert.equal(ctx.vessel.custodian, 'captain_mara_venn');
  assert.equal(ctx.vessel.title, 'returned');
  assert.equal(ctx.vessel.claimResolved, true);
  assert.equal(ctx.state.player.moduleInventory.length, 0);
  assert.equal(ctx.state.player.ownedShips.length, 1);
});

test('possession does not establish salvage title, while abandoned frames can be registered', () => {
  const ctx = boot({ title: 'disputed' });
  assert.match(ctx.execute('register').reason, /custody alone/);
  ctx.vessel.title = 'salvage';
  ctx.vessel.originalOwner = 'unregistered';
  assert.equal(ctx.execute('register').ok, true);
  assert.equal(ctx.vessel.title, 'clean');
  assert.equal(ctx.vessel.recognizedOwner, 'player');
});

test('broadcast forgery consumes a real donor and retains forensic evidence', () => {
  const ctx = boot({ title: 'disputed', stationId: 'station_smuggler' });
  assert.match(ctx.execute('forge_broadcast').reason, /donor/);
  ctx.state.player.moduleInventory.push({ instanceId: 'mi_donor', defId: 'mod_cargo_scanner_s' });
  assert.equal(ctx.execute('forge_broadcast').ok, true);
  assert.equal(ctx.state.player.moduleInventory.length, 0);
  assert.equal(ctx.vessel.title, 'disputed');
  assert.equal(ctx.vessel.signature.forged, true);
  assert.equal(inspectVessel(ctx.vessel, { grade: 1 }).accepted, true);
  assert.equal(inspectVessel(ctx.vessel, { grade: 3 }).accepted, false);
});

test('module restoration modifies the canonical installed instance and charges the quoted cost', () => {
  const ctx = boot();
  const receipt = ctx.execute('repair_module', { slotIndex: ctx.slot });
  assert.equal(receipt.ok, true);
  assert.equal(ctx.owned.fittedInstances[ctx.slot].instanceId, 'mi_prize_drive');
  assert.equal(ctx.owned.fittedInstances[ctx.slot].condition, 1);
  assert.ok(receipt.amount < 0);
});

test('repairing an active engine restores real combat drive authority on the next simulation beat', () => {
  const ctx = boot();
  ctx.state.playerId = 1; ctx.state.player.activeShipIndex = 1;
  const body = makeEntity({ ...makeShipEntitySpec(ctx.owned.defId, { isPlayer: true, player: ctx.state.player, fittings: ctx.owned.fittings }), id: 1 });
  ctx.state.entities.set(1, body); ctx.state.entityList.push(body);
  const helpers = { getEntity: id => ctx.state.entities.get(id) };
  const kernel = createCombatKernel({ ...ctx, helpers });
  const oldGet = ctx.registry.get;
  ctx.registry.get = name => name === 'combat' ? { kernel } : oldGet(name);
  assert.equal(helpers.disableShipjackSubsystem({ entityId: 1, subsystemId: 'subsystem_drive' }).ok, true);
  ctx.state.tick = 1; ctx.state.simTime = 1 / 60; kernel.prePhysics(1 / 60);
  const drive = ctx.state.combat.entities[1].subsystems.subsystem_drive;
  assert.equal(drive.destroyed, true);
  const result = ctx.execute('repair_module', { slotIndex: ctx.slot });
  assert.equal(result.ok, true); assert.equal(result.subsystemId, 'subsystem_drive');
  assert.equal(drive.health, drive.maxHealth);
  ctx.state.tick = 2; ctx.state.simTime = 2 / 60; kernel.prePhysics(1 / 60);
  assert.equal(drive.destroyed, false); assert.equal(drive.effectiveDisabled, false);
  kernel.dispose();
});

test('extraction survives normalized save and commits once after reload', () => {
  const ctx = boot();
  const job = ctx.execute('extract', { slotIndex: ctx.slot });
  ctx.state.player.shipjack = normalizeShipjack(JSON.parse(JSON.stringify(ctx.state.player.shipjack)));
  ctx.state.shipjack = ctx.state.player.shipjack;
  ctx.state.simTime = job.completesAt;
  advanceYardOperations(ctx);
  assert.equal(ctx.state.player.moduleInventory.length, 1);
  assert.equal(ctx.state.player.moduleInventory[0].instanceId, 'mi_prize_drive');
  const saved = normalizeShipjack(ctx.state.player.shipjack);
  assert.ok(saved.yardReceipts.some((r) => r.operationId === job.operationId && r.ok));
});

test('malformed service state cannot create unbounded jobs or NaN settlements', () => {
  const { vessel } = boot();
  const data = { yards: {}, yardReceipts: [], yardDemand: {} };
  for (let i = 0; i < 10000; i++) {
    data.yards[`invalid:${i}`] = { action: 'extract', quote: { amount: -Infinity } };
    data.yardReceipts.push({ operationId: `receipt:${i}`, amount: NaN });
    data.yardDemand[`station_helios:ship_invalid_${i}`] = Infinity;
  }
  const result = sanitizeYardPersistence(data, { [vessel.vesselId]: vessel });
  assert.equal(Object.keys(result.yards).length, 0);
  assert.equal(result.yardReceipts.length, 128);
  assert.equal(Object.keys(result.yardDemand).length, 512);
  assert.ok(result.yardReceipts.every((r) => Number.isFinite(r.amount)));
});

test('Crucible and racing refuse yard writes and leave campaign inventory unchanged', () => {
  const ctx = boot();
  const before = JSON.stringify(ctx.state.player);
  ctx.state.run = { kind: 'survival', phase: 'active' };
  assert.equal(ctx.execute('sell').ok, false);
  assert.equal(JSON.stringify(ctx.state.player), before);
  ctx.state.run = { kind: 'adventure', phase: 'active' };
  ctx.state.racing = { active: true };
  assert.equal(ctx.execute('return').ok, false);
  assert.equal(JSON.stringify(ctx.state.player), before);
});

test('a breached freight hatch releases a physical finite lot, with original owner provenance', () => {
  const ctx = boot({ title: 'disputed' });
  ctx.state.ui.docked = false;
  ctx.state.playerId = 1;
  const manifest = buildCargoManifest({ seed: 4242, freighterKey: 'black_flag_test_hauler', role: 'hauler', marketKeys: ['cmdty_food'], capacity: 20 });
  const initialQty = manifest.totalQty;
  const player = makeEntity({ id: 1, type: 'ship', pos: { x: 0, z: 0 }, data: { defId: 'ship_kestrel' } });
  const target = makeEntity({ id: 2, type: 'ship', pos: { x: 50, z: 0 },
    factionId: 'faction_mts', data: { vesselId: ctx.vessel.vesselId, shipjackGeneration: 'generation:1',
      trafficRole: 'hauler', name: 'Empty Seat', cargoManifest: manifest } });
  ctx.state.entities.set(1, player);
  ctx.state.entities.set(2, target);
  ctx.state.entityList.push(player, target);
  const record = { id: 2, role: 'hauler', manifest };
  ctx.state.traffic = { freighters: [record] };
  ctx.vessel.location = { kind: 'field', entityId: 2 };
  ctx.vessel.generation = 'generation:1';
  ctx.state.shipjack.custodyAttempts[ctx.vessel.vesselId] = { phase: 'foothold', windowUntil: 20 };
  let nextId = 2;
  const helpers = { spawnEntity(spec) {
    const body = makeEntity({ ...spec, id: ++nextId });
    ctx.state.entities.set(body.id, body);
    ctx.state.entityList.push(body);
    return body;
  } };
  const traffic = Object.assign(Object.create(trafficProto), { state: ctx.state, bus: ctx.bus, helpers });
  const oldGet = ctx.registry.get;
  ctx.registry.get = (name) => name === 'traffic' ? traffic : oldGet(name);
  const cargo = Object.create(cargoProto);
  cargo.init({ ...ctx, helpers });
  const request = { vesselId: ctx.vessel.vesselId, entityId: 2, operationId: 'cargo:breach:1' };
  const release = cargo.releaseVesselFreight(request);
  assert.equal(release.ok, true);
  const pod = ctx.state.entities.get(release.payloadId);
  assert.equal(pod.type, 'payload');
  assert.equal(pod.flags.persistent, true);
  assert.equal(pod.data.sourceVesselId, ctx.vessel.vesselId);
  assert.equal(pod.data.ownerId, 2);
  assert.equal(pod.data.releaseOperationId, request.operationId);
  assert.equal(record.manifest.totalQty + pod.data.amount, initialQty);
  assert.equal(target.data.cargoManifest, record.manifest);
  assert.equal(ctx.state.player.cargo.items.cmdty_food, undefined, 'physical retrieval is still required');
  assert.equal(cargo.releaseVesselFreight({ ...request, operationId: 'cargo:breach:2' }).ok, false);
  assert.equal(ctx.state.entityList.filter((e) => e.type === 'payload').length, 1);
  target.data.shipjackGeneration = 'recycled:occupant';
  assert.match(cargo.releaseVesselFreight(request).reason, /occupant changed/);
});
