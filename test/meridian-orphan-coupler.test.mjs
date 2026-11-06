import assert from 'node:assert/strict';
import test from 'node:test';
import { factionMeridian } from '../src/systems/faction_meridian.js';

const body = (id, x, data, generation) => ({
  id, occupantGeneration: generation, alive: true, type: 'container', collides: true,
  pos: { x, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 40,
  data: { cargoValueCr: 4000, ...data },
});

test('orphaned train cannot reattach loose freight to a detached tail', () => {
  const a = body('a', 0, { spineId: 'train', spineIndex: 1 }, 4);
  const b = body('b', 25, { spineLoose: true, lostFromSpineId: 'train' }, 8);
  const state = { entities: new Map([[a.id, a], [b.id, b]]), simTime: 0, tick: 0 };
  const events = [];
  const sys = { ...factionMeridian };
  sys.init({ state, bus: { emit: (name, payload) => events.push({ name, payload }) }, helpers: {} });
  for (let i = 0; i < 4; i++) { state.tick++; state.simTime += 1 / 60; sys.update(1 / 60, state); }
  assert.deepEqual(events.filter(e => e.name === 'meridian:couplerSnapped').map(e => e.payload.tailIds), [['a']]);
  assert.equal(events.filter(e => e.name === 'meridian:containerRecoupled').length, 0);
  for (const [e, id, gen, x] of [[a, 'a', 4, 0], [b, 'b', 8, 25]]) {
    assert.equal(state.entities.get(id), e);
    assert.equal(e.occupantGeneration, gen);
    assert.equal(e.data.spineLoose, true);
    assert.equal(e.data.spineId, undefined);
    assert.equal(e.collides, true);
    assert.equal(e.pos.x, x);
  }
  assert.equal(events.filter(e => e.name === 'meridian:claimSettled').length, 0);

  // A real tug arriving permits recovery, and a later genuine tear still snaps.
  const tug = body('tug', -25, { spineId: 'new-train', spineIndex: 0 }, 9);
  tug.type = 'ship';
  state.entities.set(tug.id, tug);
  state.tick++; state.simTime += 1 / 60; sys.update(1 / 60, state);
  assert.equal(a.data.spineId, 'new-train');
  assert.equal(b.data.spineId, 'new-train');
  b.pos.x = 200;
  state.tick++; state.simTime += 1 / 60; sys.update(1 / 60, state);
  assert.equal(b.data.spineLoose, true);
  assert.deepEqual(events.filter(e => e.name === 'meridian:couplerSnapped').map(e => e.payload.tailIds), [['a'], ['b']]);
});

test('a partially broken train accepts freight only at its surviving tail', () => {
  const tug = body('tug', 0, { spineId: 'train', spineIndex: 0 }, 1);
  tug.type = 'ship';
  const linked = body('linked', 46, { spineId: 'train', spineIndex: 1 }, 2);
  const detached = body('detached', 200, { spineId: 'train', spineIndex: 2 }, 3);
  const loose = body('loose', 225, { spineLoose: true }, 4);
  const state = { entities: new Map([tug, linked, detached, loose].map(e => [e.id, e])), simTime: 0, tick: 0 };
  const events = [];
  const sys = { ...factionMeridian };
  sys.init({ state, bus: { emit: (name, payload) => events.push({ name, payload }) }, helpers: {} });
  sys.update(1 / 60, state);
  assert.equal(detached.data.spineLoose, true);
  assert.equal(loose.data.spineLoose, true, 'a snapped tail cannot receive cargo');
  loose.pos.x = 70;
  sys.update(1 / 60, state);
  assert.equal(loose.data.spineId, 'train');
  assert.equal(loose.data.spineIndex, 2, 'the surviving tail remains usable');
  assert.equal(events.filter(e => e.name === 'meridian:couplerSnapped').length, 1);
});
