import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { CIRCUIT_OWNER, cohortIdentity, createCircuitPhysical } from '../src/features/counterweightCircuit/physical.js';

test('unrelated impacts skip native readiness while Circuit payload impacts retain it', () => {
  const bus = createBus();
  const ship = { id: 1, type: 'ship', occupantGeneration: 1 };
  const rock = { id: 2, type: 'asteroid', occupantGeneration: 2 };
  const cargo = { id: 3, type: 'payload', occupantGeneration: 3, data: { worldRecordId: 'other-cargo', identityKey: 'other-cargo' } };
  const worldRecordId = cohortIdentity(1, 'pod');
  const payload = { id: 4, type: 'payload', occupantGeneration: 4,
    data: { persistenceOwner: CIRCUIT_OWNER, worldRecordId, identityKey: worldRecordId } };
  const entityList = [ship, rock, cargo, payload];
  const state = { tick: 4, entities: new Map(entityList.map(e => [e.id, e])), entityList };
  let physicsQueries = 0, nativeQueries = 0;
  const physics = { _sg02: { records: { get() { nativeQueries++; return null; } } } };
  const registry = { get(name) { if (name === 'physics') { physicsQueries++; return physics; } return null; } };
  const physical = createCircuitPhysical({ state, bus, registry, helpers: {} });
  const impact = (a, b, generation = a.occupantGeneration) => bus.emit('physics:impact', {
    backend: 'rapier-dynamic', tick: state.tick, aId: a.id, bId: b.id,
    aGeneration: generation, bGeneration: b.occupantGeneration, impulse: 10,
  });
  try {
    impact(ship, rock);
    impact(rock, ship);
    impact(cargo, ship);
    impact(ship, cargo);
    assert.equal(physicsQueries, 0);
    assert.equal(nativeQueries, 0);
    cargo.data.persistenceOwner = CIRCUIT_OWNER;
    delete cargo.data.identityKey;
    impact(cargo, ship);
    assert.equal(physicsQueries, 0, 'partial Circuit identity is rejected before native lookup');
    impact(payload, ship, -1);
    assert.equal(physicsQueries, 0, 'stale occupants are rejected before native lookup');
    impact(payload, ship);
    impact(ship, payload);
    assert.equal(physicsQueries, 2, 'either Circuit payload orientation still requires native readiness');
    assert.equal(nativeQueries, 2);
  } finally {
    physical.dispose();
  }
});
