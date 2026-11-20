// wreck:ruptureFired — the rupture clip's "already played" latch is sim-owned.
// Render reports the fire over the bus; aftermathWrecks stamps entity.data so the
// marker write-back persists it and a rematerialized fragment does not replay the
// kick. Render never writes entity.data on the (possibly mirrored) piece itself.
import test from 'node:test';
import assert from 'node:assert/strict';

import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }

  on(name, fn) {
    const list = this.handlers.get(name) || [];
    list.push(fn);
    this.handlers.set(name, list);
  }

  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function boot() {
  const state = {
    meta: { seed: 7 },
    tick: 60,
    simTime: 10,
    playerId: 1,
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map(),
    entityList: [],
    rng() { return 0.5; },
  };
  const bus = new Bus();
  const helpers = { spawnEntity() { throw new Error('not needed here'); } };
  const registry = { get(name) { return name === 'aftermathWrecks' ? aftermathWrecks : null; } };
  aftermathWrecks.init({ state, bus, helpers, registry });
  return { state, bus };
}

function fracturePiece(id, occupantGeneration = 11) {
  const entity = {
    id,
    type: 'wreck',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    occupantGeneration,
    data: { fracturePiece: { piece: 'fin' }, fractureSeamId: 'seam_1' },
  };
  return entity;
}

test('wreck:ruptureFired stamps and unwinds the sim-owned latch', () => {
  const { state, bus } = boot();
  const piece = fracturePiece(901);
  state.entities.set(piece.id, piece);

  bus.emit('wreck:ruptureFired', { entityId: 901, occupantGeneration: 11, fired: true });
  assert.equal(piece.data.fractureRuptureFired, true, 'sim stamps the durable latch');

  // The orphaned-commit reversal unwinds the stamp so a re-admission can re-fire.
  bus.emit('wreck:ruptureFired', { entityId: 901, occupantGeneration: 11, fired: false });
  assert.equal(piece.data.fractureRuptureFired, false, 'orphan reversal clears the latch');

  // `id` alias payload (the report carries both spellings).
  bus.emit('wreck:ruptureFired', { id: 901, occupantGeneration: 11, fired: true });
  assert.equal(piece.data.fractureRuptureFired, true, 'id alias stamps identically');
});

test('wreck:ruptureFired rejects recycled ids and non-fracture entities', () => {
  const { state, bus } = boot();
  const piece = fracturePiece(902, 12);
  state.entities.set(piece.id, piece);
  const hull = { id: 903, type: 'wreck', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} };
  state.entities.set(hull.id, hull);

  // A stale report carrying the dead occupant's generation must not latch the
  // replacement — the receipt's generation is not this occupant's.
  bus.emit('wreck:ruptureFired', { entityId: 902, occupantGeneration: 9, fired: true });
  assert.equal(piece.data.fractureRuptureFired, undefined, 'stale-generation report ignored');

  // Ordinary wreck hulls are not fracture pieces — no latch.
  bus.emit('wreck:ruptureFired', { entityId: 903, occupantGeneration: null, fired: true });
  assert.equal(hull.data.fractureRuptureFired, undefined, 'non-fracture entity untouched');

  // Missing entities are dropped without touching state.
  bus.emit('wreck:ruptureFired', { entityId: 9999, occupantGeneration: 1, fired: true });
  assert.equal(state.entities.get(9999), undefined);
});
