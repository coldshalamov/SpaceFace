import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createFlightPlaneObserver, compareFlightPlane } from '../scripts/lib/cleanFlightPlane.mjs';

function fixture() {
  const player = { id: 1, alive: true, collides: true, radius: 5, pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 } };
  const prop = { id: 2, alive: true, collides: true, radius: 8, type: 'wreck', pos: { x: 40, z: 0 } };
  const state = { tick: 0, mode: 'flight', playerId: 1, player: {}, entities: new Map([[1, player], [2, prop]]), entityList: [player, prop] };
  const bus = createBus(), observer = createFlightPlaneObserver(state, bus);
  const done = () => observer.finish({ seed: 4242, ticks: 3600, reached: true, inputHash: 'fixed-policy' });
  return { state, bus, observer, prop, done };
}

test('counts contact episodes and forward obstruction without counting passable/depth decoration', () => {
  const h = fixture();
  h.observer.sample({ x: 500, z: 0 });
  for (const tick of [1, 2, 3, 40]) {
    h.state.tick = tick;
    h.bus.emit('physics:impact', { aId: 1, bId: 2 });
  }
  h.prop.collides = false;
  h.observer.sample({ x: 500, z: 0 });
  h.bus.emit('physics:impact', { aId: 2, bId: 1 });
  const result = h.done();
  assert.equal(result.contacts, 2);
  assert.equal(result.blockedTicks, 1);
  assert.equal(result.samples, 2);
  h.bus.emit('physics:impact', { aId: 1, bId: 2 });
  assert.equal(result.contacts, 2);
});

test('targeted jobs, attached tow and behind/off-path solids do not count as unwanted clutter', () => {
  for (const kind of ['target', 'tow', 'behind', 'beside']) {
    const h = fixture();
    if (kind === 'target') h.state.player.targetId = 2;
    if (kind === 'tow') h.state.combat = { attachments: { byId: { line: { ownerId: 1, targetId: 2, state: 'active' } } } };
    if (kind === 'behind') h.prop.pos.x = -20;
    if (kind === 'beside') h.prop.pos.z = 50;
    h.observer.sample({ x: 500, z: 0 });
    assert.equal(h.done().blockedTicks, 0, kind);
  }
});

test('comparison rejects incomplete/unmeasured/mismatched routes and any higher contact or obstruction rate', () => {
  const h = fixture(); h.observer.sample({ x: 500, z: 0 });
  const before = h.done();
  assert.equal(compareFlightPlane(before, { ...before }).ok, true);
  for (const patch of [{ reached: false }, { samples: 0 }, { seed: 47 }, { route: 'other' },
    { contactsPerMinute: null }, { contactsPerMinute: 1 }, { obstructionSecondsPerMinute: 61 }]) {
    assert.equal(compareFlightPlane(before, { ...before, ...patch }).ok, false, JSON.stringify(patch));
  }
});
