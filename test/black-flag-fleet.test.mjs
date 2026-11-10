import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { economy as economyProto } from '../src/systems/economy.js';
import { ensureShipjack, normalizeShipjack } from '../src/shipjack/model.js';
import { quoteFleetOperation, executeFleetOperation, advanceFleetOperations,
  normalizeFleetPersistence, recoveryRoute } from '../src/shipjack/fleetOperations.js';

function boot() {
  const state = createGameState(4242), bus = createBus();
  state.mode = 'flight'; state.simTime = 100; state.playerId = 1;
  state.ui.docked = true; state.ui.dockedStationId = 'station_forge';
  state.player.credits = 10000; state.player.activeShipIndex = 0;
  const owned = { vesselId: 'vessel:retained:2', defId: 'ship_kestrel',
    fittings: ['wpn_pulse_laser_s'], fittedInstances: { 0: { defId: 'wpn_pulse_laser_s', instanceId: 'mi_old_gun', condition: 0.4 } },
    cargo: { items: { cmdty_ore_iron: 4 }, usedVolume: 4, usedMass: 4 } };
  state.player.ownedShips = [{ defId: 'ship_wasp', fittings: [] }, owned];
  const sj = ensureShipjack(state);
  const vessel = sj.vesselsById[owned.vesselId] = { version: 1, vesselId: owned.vesselId, defId: owned.defId,
    name: 'Battered Hitch', originalOwner: 'player', recognizedOwner: 'player', custodian: 'player', title: 'clean',
    generation: 'retained:2', revision: 0, condition: { hull: 0.5 }, history: [],
    location: { kind: 'field', entityId: 2, sectorId: 'sector_helios_prime', pos: { x: 600, z: 40 }, vel: { x: 3, z: 1 }, rot: 0.6, angVel: 0.2, at: 100 },
    signature: { broadcast: 'REG-HITCH', frame: 'FRAME-ORIGINAL', engine: 'DRIVE-ORIGINAL' } };
  const body = makeEntity({ id: 2, type: 'ship', pos: vessel.location.pos, vel: vessel.location.vel,
    hull: 70, hullMax: 140, shield: 8, armorHp: 6, cap: 11, rot: 0.6, angVel: 0.2,
    data: { vesselId: vessel.vesselId, shipjackGeneration: vessel.generation, defId: owned.defId, fittings: owned.fittings } });
  state.entities.set(2, body); state.entityList.push(body);
  const economy = Object.create(economyProto);
  const registry = { get: name => name === 'economy' ? economy : null };
  const ctx = { state, bus, registry, helpers: {}, detachCount: 0, detachVessel(v) {
    const entity = state.entities.get(v.location.entityId);
    if (!entity || entity.id === state.playerId || entity.data.vesselId !== v.vesselId) return false;
    v.parkedBody = { hull: entity.hull, shield: entity.shield, cap: entity.cap, armorHp: entity.armorHp,
      fittings: [...entity.data.fittings], subsystems: { subsystem_drive: { id: 'subsystem_drive', health: 0, maxHealth: 45, destroyed: true, effectiveDisabled: true } } };
    state.entities.delete(entity.id); entity.alive = false; this.detachCount++;
    return true;
  } };
  economy.init(ctx);
  const book = (operationId = 'fleet:recover:1', extra = {}) => {
    const p = { action: 'recover', vesselId: vessel.vesselId, ...extra };
    const result = quoteFleetOperation(state, p);
    if (!result.ok) return result;
    return executeFleetOperation(ctx, { ...p, quote: result.quote, operationId });
  };
  return { ctx, state, bus, owned, vessel, body, book };
}

test('recovery route follows real canonical sector neighbors and rejects unknown worlds', () => {
  assert.deepEqual(recoveryRoute('sector_helios_prime', 'sector_vesta_forge'), ['sector_helios_prime', 'sector_vesta_forge']);
  assert.equal(recoveryRoute('sector_invented', 'sector_helios_prime'), null);
});

test('paid recovery has travel phases and delivers the same damaged hull, cargo and fitted identities', () => {
  const { ctx, state, vessel, owned, body, book } = boot();
  const before = structuredClone(owned), credits = state.player.credits;
  const started = book();
  assert.equal(started.ok, true); assert.equal(started.status, 'queued');
  assert.ok(started.feeCr > 0); assert.equal(state.player.credits, credits - started.feeCr);
  assert.equal(body.alive, true, 'a booking does not teleport the parked ship');
  state.simTime = started.departureAt; advanceFleetOperations(ctx);
  assert.equal(state.shipjack.fleetOperations[vessel.vesselId].status, 'outbound');
  assert.equal(body.alive, true, 'the source remains physical until the tug reaches it');
  state.simTime = started.pickupAt; advanceFleetOperations(ctx);
  assert.equal(ctx.detachCount, 1); assert.equal(vessel.location.kind, 'in_transit');
  assert.equal(vessel.location.entityId, null); assert.equal(vessel.parkedBody.hull, 70);
  assert.equal(vessel.parkedBody.subsystems.subsystem_drive.health, 0);
  state.simTime = started.arrivalAt; advanceFleetOperations(ctx);
  assert.equal(vessel.location.kind, 'berth'); assert.equal(vessel.location.stationId, 'station_forge');
  assert.equal(vessel.location.sectorId, 'sector_vesta_forge');
  assert.equal(vessel.condition.hull, 0.5); assert.equal(vessel.title, 'clean');
  assert.deepEqual(owned, before, 'no module, cargo, or owned-hull copy was minted');
  assert.equal(state.player.ownedShips.length, 2); assert.equal(state.player.moduleInventory.length, 0);
  assert.equal(state.player.credits, credits - started.feeCr, 'there is no passive recovery reward');
  advanceFleetOperations(ctx);
  assert.equal(state.shipjack.fleetReceipts.length, 1); assert.equal(ctx.detachCount, 1);
});

test('a departed tug does not delete a hull the player has reoccupied; finite travel charge is explicit', () => {
  const { ctx, state, vessel, body, book } = boot();
  const credits = state.player.credits, job = book();
  state.simTime = job.departureAt; advanceFleetOperations(ctx);
  state.player.activeShipIndex = 1; state.playerId = 2;
  state.simTime = job.pickupAt; advanceFleetOperations(ctx);
  assert.equal(body.alive, true); assert.equal(vessel.location.kind, 'field');
  assert.equal(ctx.detachCount, 0);
  assert.equal(state.player.credits, credits - job.feeCr + Math.floor(job.feeCr * 0.75));
  const [result] = state.shipjack.fleetReceipts;
  assert.equal(result.status, 'failed'); assert.match(result.reason, /piloted ship/);
  advanceFleetOperations(ctx);
  assert.equal(state.shipjack.fleetReceipts.length, 1);
});

test('predeparture cancellation refunds exactly once and cannot cancel a later job with an old identity', () => {
  const { ctx, state, vessel, book } = boot();
  const credits = state.player.credits, job = book();
  const cancel = { action: 'cancel_recovery', vesselId: vessel.vesselId,
    jobOperationId: job.operationId, operationId: 'fleet:cancel:1' };
  const receipt = executeFleetOperation(ctx, cancel);
  assert.equal(receipt.ok, true); assert.equal(receipt.refundCr, job.feeCr);
  assert.equal(state.player.credits, credits);
  assert.deepEqual(executeFleetOperation(ctx, cancel), receipt);
  assert.equal(state.player.credits, credits);
  const second = book('fleet:recover:2');
  assert.equal(second.ok, true);
  const staleCancel = executeFleetOperation(ctx, { ...cancel, operationId: 'fleet:cancel:late' });
  assert.equal(staleCancel.ok, false); assert.match(staleCancel.reason, /original recovery order/);
  assert.equal(state.shipjack.fleetOperations[vessel.vesselId].operationId, second.operationId);
});

test('missing funds and stale quotes create no paid phantom transport', () => {
  const { ctx, state, vessel } = boot();
  const request = { action: 'recover', vesselId: vessel.vesselId };
  const { quote } = quoteFleetOperation(state, request);
  vessel.revision++;
  assert.equal(executeFleetOperation(ctx, { ...request, quote, operationId: 'fleet:stale:1' }).ok, false);
  assert.equal(Object.keys(state.shipjack.fleetOperations).length, 0);
  const fresh = quoteFleetOperation(state, request).quote;
  state.player.credits = 0;
  assert.equal(executeFleetOperation(ctx, { ...request, quote: fresh, operationId: 'fleet:broke:1' }).ok, false);
  assert.equal(state.player.credits, 0); assert.equal(Object.keys(state.shipjack.fleetOperations).length, 0);
});

test('a source entity id reused by a different occupant never detaches that body', () => {
  const { ctx, state, vessel, body, book } = boot();
  const job = book();
  body.data.shipjackGeneration = 'new:occupant';
  state.simTime = job.pickupAt; advanceFleetOperations(ctx);
  assert.equal(body.alive, true); assert.equal(ctx.detachCount, 0);
  assert.equal(vessel.location.kind, 'field');
  assert.match(state.shipjack.fleetReceipts[0].reason, /different vessel/);
});

test('recovery can retrieve a remote recorded hull without globally materializing physics', () => {
  const { ctx, state, vessel, book } = boot();
  vessel.location.kind = 'remote'; vessel.location.entityId = null;
  vessel.parkedBody = { hull: 70, shield: 4, armorHp: 0, cap: 6, fittings: ['wpn_pulse_laser_s'], subsystems: {} };
  state.entities.clear();
  const job = book(); state.simTime = job.arrivalAt; advanceFleetOperations(ctx);
  assert.equal(vessel.location.kind, 'berth'); assert.equal(vessel.parkedBody.hull, 70);
  assert.equal(state.entities.size, 0); assert.equal(ctx.detachCount, 0);
});

test('save normalization preserves a towing operation, frozen damage and once-only settlement', () => {
  const { ctx, state, vessel, book } = boot();
  const job = book(); state.simTime = job.pickupAt; advanceFleetOperations(ctx);
  const credits = state.player.credits;
  const saved = JSON.parse(JSON.stringify(state.player.shipjack));
  const normalized = normalizeShipjack(saved);
  state.player.shipjack = normalized; state.shipjack = normalized;
  assert.equal(normalized.vesselsById[vessel.vesselId].location.kind, 'in_transit');
  assert.equal(normalized.fleetOperations[vessel.vesselId].status, 'towing');
  state.simTime = job.arrivalAt; advanceFleetOperations(ctx);
  assert.equal(normalized.vesselsById[vessel.vesselId].location.kind, 'berth');
  assert.equal(normalized.vesselsById[vessel.vesselId].parkedBody.hull, 70);
  assert.equal(state.player.credits, credits);
  const twice = normalizeShipjack(JSON.parse(JSON.stringify(normalized)));
  assert.equal(twice.fleetReceipts.filter(r => r.operationId === job.operationId).length, 1);
});

test('malformed dispatches cannot orphan an in-transit owned hull or grow a receipt ledger', () => {
  const { vessel } = boot();
  vessel.location.kind = 'in_transit';
  const raw = { fleetOperations: {}, fleetReceipts: [] };
  for (let i = 0; i < 10000; i++) {
    raw.fleetOperations[`vessel:invalid:${i}`] = { feeCr: Infinity, action: 'recover' };
    raw.fleetReceipts.push({ operationId: `fleet:old:${i}`, vesselId: vessel.vesselId, feeCr: NaN });
  }
  const normalized = normalizeFleetPersistence(raw, { [vessel.vesselId]: vessel });
  assert.equal(Object.keys(normalized.fleetOperations).length, 0);
  assert.equal(normalized.fleetReceipts.length, 96);
  assert.equal(vessel.location.kind, 'remote', 'the last known retrieval route survives malformed optional service data');
  assert.ok(normalized.fleetReceipts.every(r => Number.isFinite(r.feeCr)));
});

test('temporary modes never start or advance campaign dispatches', () => {
  const { ctx, state, vessel, book } = boot();
  const job = book();
  const saved = JSON.stringify(state.player);
  state.run.kind = 'survival'; state.run.phase = 'active'; state.simTime = job.arrivalAt;
  assert.equal(quoteFleetOperation(state, { action: 'recover', vesselId: vessel.vesselId }).ok, false);
  assert.equal(executeFleetOperation(ctx, { action: 'cancel_recovery', vesselId: vessel.vesselId, jobOperationId: job.operationId, operationId: 'fleet:badmode' }).ok, false);
  advanceFleetOperations(ctx);
  assert.equal(JSON.stringify(state.player), saved);
});
