// A persistent saved actor that also carries a durable worldRecordId is rematerialized by the
// residency plan during enterSector; the saved copy must not spawn a second body. Release soak
// 2026-09-15: every load doubled the Helios arclight/tanker/customs fixtures (x6 after ten loads,
// 31 live ships against a 24 budget). Node only, no renderer.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';

function makeSave() {
  const state = createGameState(7);
  state.entityList = [];
  state.entities = new Map();
  state.nextEntityId = 100;
  const save = Object.create(saveDefinition);
  save.state = state;
  save.bus = { emit() {} };
  save.registry = { get() { return null; } };
  const spawned = [];
  save.helpers = {
    spawnEntity(spec) {
      const e = { ...spec, id: state.nextEntityId++, alive: true };
      state.entityList.push(e);
      state.entities.set(e.id, e);
      spawned.push(e);
      return e;
    },
  };
  return { state, save, spawned };
}

test('a persistent actor whose worldRecordId is already live is not spawned twice', () => {
  const { state, save, spawned } = makeSave();
  // The residency plan already materialized the record body.
  const live = save.helpers.spawnEntity({ type: 'ship', pos: { x: 10, z: 0 }, data: { trafficRole: 'arclight', worldRecordId: 'wr_convoy_arclight' } });
  spawned.length = 0;
  const remap = new Map();
  save._spawnPersistentEntities([
    { id: 41, type: 'ship', pos: { x: 12, z: 1 }, flags: { persistent: true }, data: { trafficRole: 'arclight', worldRecordId: 'wr_convoy_arclight' } },
    { id: 42, type: 'ship', pos: { x: 40, z: 4 }, flags: { persistent: true }, data: { trafficRole: 'tanker', worldRecordId: 'wr_convoy_tanker_evicted' } },
    { id: 43, type: 'ship', pos: { x: 90, z: 9 }, flags: { persistent: true }, data: { escortOf: 'player' } },
  ], remap);
  assert.equal(spawned.length, 2, 'only the evicted-record actor and the record-less actor spawn');
  assert.equal(state.entityList.filter((e) => e.data.worldRecordId === 'wr_convoy_arclight').length, 1, 'one arclight body');
  assert.equal(remap.get('41'), live.id, 'the saved id remaps onto the live record body');
  assert.equal(spawned[0].data.worldRecordId, 'wr_convoy_tanker_evicted');
  assert.equal(remap.get('42'), spawned[0].id);
  assert.equal(remap.get('43'), spawned[1].id);
  assert.equal(spawned[1].flags.persistent, true);
});
