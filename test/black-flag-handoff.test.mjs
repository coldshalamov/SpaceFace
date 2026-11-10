import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { makeShipEntitySpec, ships, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { cargo } from '../src/systems/cargo.js';

function runtime() {
  const state = createGameState(4242);
  const bus = createBus();
  state.mode = 'flight';
  const fittings = fittingsFromDefaultModules('ship_kestrel', ['wpn_pulse_laser_s']);
  state.player.ownedShips = [{ defId: 'ship_kestrel', vesselId: 'vessel:starter', fittings, fittedInstances: {} }];
  state.player.activeShipIndex = 0;
  const from = makeEntity(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player, fittings }));
  const to = makeEntity(makeShipEntitySpec('ship_wasp', { team: 1, fittings: [], ai: { fsm: 'surrender' }, pos: { x: 65, z: 0 } }));
  from.id = 1; to.id = 2;
  from.occupantGeneration = 1; to.occupantGeneration = 2;
  from.data.vesselId = 'vessel:starter'; from.data.shipjackGeneration = 'starter:1';
  to.data.vesselId = 'vessel:prize'; to.data.shipjackGeneration = 'prize:1';
  from.vel.set(3, 0, 1); to.vel.set(2, 0, 1); to.angVel = 0.2;
  from.hull = 65; to.hull = 12; to.shield = 0; to.armorHp = 0;
  to.data.fittedInstances = {};
  state.entities = new Map([[1, from], [2, to]]);
  state.entityList = [from, to]; state.playerId = 1;
  state.player.cargo = { items: { cmdty_ore_iron: 3 }, usedVolume: 3, usedMass: 3, capVolume: 40, capMass: 40 };
  const owner = Object.create(ships);
  owner.init({ state, bus, helpers: { getEntity: id => state.entities.get(id) } });
  const cargoOwner = Object.create(cargo);
  cargoOwner.init({ state, bus, helpers: {} });
  const request = { targetId: 2, targetGeneration: 'prize:1', vesselId: 'vessel:prize', operationId: 'bf:transfer:1' };
  return { state, bus, owner, from, to, request };
}

test('physical handoff and reverse retain the two bodies, damage, motion, and hull-specific cargo', () => {
  const { state, owner, from, to, request } = runtime();
  const motion = entity => ({ pos: { ...entity.pos }, vel: { ...entity.vel }, rot: entity.rot, angVel: entity.angVel });
  const beforeFrom = motion(from), beforeTo = motion(to);
  const result = owner.captureAndTransfer(request);
  assert.equal(result.ok, true);
  assert.equal(state.playerId, 2);
  assert.equal(state.entities.size, 2);
  assert.equal(state.entities.get(1), from);
  assert.equal(state.entities.get(2), to);
  assert.deepEqual(motion(from), beforeFrom);
  assert.deepEqual(motion(to), beforeTo);
  assert.equal(to.hull, 12); assert.equal(to.shield, 0); assert.equal(to.armorHp, 0);
  assert.equal(from.isPlayer, false); assert.equal(to.isPlayer, true);
  assert.equal(from.data.ai, null); assert.equal(to.data.ai, null);
  assert.equal(from.flags.persistent, true);
  assert.equal(state.player.cargo.items.cmdty_ore_iron, undefined);
  assert.equal(state.player.ownedShips[0].cargo.items.cmdty_ore_iron, 3);
  const reverse = owner.captureAndTransfer({ targetId: 1, targetGeneration: 'starter:1', vesselId: 'vessel:starter', operationId: 'bf:transfer:2' });
  assert.equal(reverse.ok, true);
  assert.equal(state.playerId, 1); assert.equal(state.player.activeShipIndex, 0);
  assert.equal(state.player.ownedShips.length, 2);
  assert.equal(from.hull, 65);
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 3);
  assert.deepEqual(motion(from), beforeFrom); assert.deepEqual(motion(to), beforeTo);
});

test('duplicate operation after save-like journal roundtrip returns terminal receipt without another switch', () => {
  const { state, bus, owner, request } = runtime();
  assert.equal(owner.captureAndTransfer(request).ok, true);
  state.player.shipControlTransfers = JSON.parse(JSON.stringify(state.player.shipControlTransfers));
  const repeat = owner.captureAndTransfer(request);
  assert.equal(repeat.ok, true); assert.equal(repeat.replayed, true);
  assert.equal(state.player.ownedShips.length, 2);
  assert.equal(state.player.shipControlTransfers.receipts.length, 1);
  assert.equal(state.playerId, 2);
  bus.emit('game:new', {});
  assert.equal(state.player.shipControlTransfers, undefined, 'a new campaign cannot inherit prior-run terminal keys');
});

test('secured tow admission is idempotent, preserves real component damage and leaves the pilot aboard', () => {
  const { state, owner, to, request } = runtime();
  const fit = fittingsFromDefaultModules('ship_wasp', ['mod_engine_ion_m']);
  assert.ok(fit.includes('mod_engine_ion_m'));
  to.data.fittings = fit;
  state.combat.entities ||= {};
  state.combat.entities[2] = { subsystems: { subsystem_drive: { health: 9, maxHealth: 45 } } };
  const first = owner.admitCapturedVessel(request);
  assert.equal(first.ok, true); assert.equal(first.admitted, true);
  assert.equal(state.playerId, 1);
  const owned = state.player.ownedShips[first.index];
  const instances = Object.values(owned.fittedInstances);
  assert.equal(instances.length, 1); assert.equal(instances[0].condition, 0.2);
  const ids = instances.map(item => item.instanceId);
  assert.equal(owner.admitCapturedVessel(request).admitted, false);
  assert.equal(state.player.ownedShips.length, 2);
  assert.deepEqual(Object.values(owned.fittedInstances).map(item => item.instanceId), ids);
  assert.equal(owner.captureAndTransfer(request).ok, true);
  assert.equal(state.player.ownedShips.length, 2);
  assert.equal(to.data.weapons.length, 0, 'capture does not mint a synthetic legacy starter gun');
});

test('remote field equipment cannot teleport through the ordinary berth fitting/sale surfaces', () => {
  const { state, owner, to, request } = runtime();
  owner.admitCapturedVessel(request);
  const owned = state.player.ownedShips[1];
  state.shipjack = { vesselsById: { [request.vesselId]: {
    title: 'clean', location: { kind: 'remote', sectorId: 'sector_helios_prime' },
  } } };
  state.ui.docked = true; state.ui.dockedStationId = 'station_helios';
  assert.equal(owner.setActiveShip(1), false);
  assert.equal(owner.sellShip(1), false);
  assert.equal(owner.takeFittedModuleInstance(1, 0), null);
  assert.equal(owner.unfitModule({ shipIndex: 1, slotIndex: 0 }), false);
  assert.equal(state.player.ownedShips[1], owned);
  assert.equal(to.alive, true);
});

test('stale generation, motion, dead pilot, missing cargo owner, and temporary modes reject without property change', () => {
  for (const kind of ['generation', 'motion', 'dead', 'cargo', 'swarm', 'tutorial', 'kill_switch']) {
    const { state, owner, to, from, request } = runtime();
    if (kind === 'generation') to.data.shipjackGeneration = 'recycled:2';
    if (kind === 'motion') to.vel.x = 100;
    if (kind === 'dead') from.alive = false;
    if (kind === 'cargo') owner.bus = createBus();
    if (kind === 'swarm') state.run.kind = 'survival';
    if (kind === 'tutorial') state.tutorial = { active: true };
    if (kind === 'kill_switch') state.flags = { blackFlagControlTransfer: false };
    const before = JSON.stringify(state.player.ownedShips);
    assert.equal(owner.captureAndTransfer(request).ok, false, kind);
    assert.equal(state.playerId, 1, kind);
    assert.equal(JSON.stringify(state.player.ownedShips), before, kind);
    assert.equal(state.player.cargo.items.cmdty_ore_iron, 3, kind);
  }
});

test('Rapier retains both native bodies through handoff; disabled hull continues ballistic rotation and motion', async () => {
  const { state, owner, from, to, request } = runtime();
  const native = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60 });
  try {
    for (const entity of [from, to]) entity.physicsBody = resolvePhysicsBodySpec(entity);
    native.syncFromEntities([from, to]);
    const fromBody = native.records.get(from.id).body;
    const toBody = native.records.get(to.id).body;
    const before = { x: to.pos.x, z: to.pos.z, rot: to.rot };
    assert.equal(owner.captureAndTransfer(request).ok, true);
    native.syncFromEntities([from, to]);
    assert.equal(native.records.get(from.id).body, fromBody);
    assert.equal(native.records.get(to.id).body, toBody);
    native.step(1 / 60, 1);
    assert.notEqual(to.pos.x, before.x);
    assert.notEqual(to.rot, before.rot);
    assert.equal(state.playerId, to.id);
    assert.equal(from.alive, true); assert.equal(to.alive, true);
  } finally { native.dispose(); }
});
