import assert from 'node:assert/strict';
import test from 'node:test';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';

for (const rockPresent of [true, false]) {
  test(`drill cargo refusal normalizes tile coordinates with rock ${rockPresent ? 'present' : 'gone'}`, () => {
    const listeners = new Map();
    const bus = {
      on(name, fn) {
        const set = listeners.get(name) || new Set();
        listeners.set(name, set); set.add(fn);
        return () => set.delete(fn);
      },
      emit(name, payload) { for (const fn of listeners.get(name) || []) fn(payload); },
    };
    const rock = { id: 42, pos: { x: 180, z: -72 } };
    const state = { tick: 30, simTime: .5, playerId: 1, drill: { asteroidId: 42 },
      entities: new Map(rockPresent ? [[42, rock]] : []) };
    const owner = Object.create(presentationOrchestrator);
    const cues = [];
    owner.init({ state, bus });
    bus.on('presentation:cue', cue => cues.push(cue));
    const payload = Object.freeze({ commodityId: 'cmdty_ore_iron', qty: 3,
      pos: Object.freeze({ col: 3, row: 4 }) });
    try {
      assert.doesNotThrow(() => bus.emit('drill:cargoFull', payload));
      assert.equal(cues.length, 1);
      assert.equal(cues[0].id, 'mining.cargo.full');
      assert.equal(cues[0].sourceEvent, 'drill:cargoFull');
      assert.equal(cues[0].targetId, 42);
      assert.deepEqual(cues[0].position, rockPresent ? { x: 180, y: 0, z: -72 } : null);
      assert.deepEqual(payload.pos, { col: 3, row: 4 });
      assert.equal(cues[0].payload.qty, 3);
    } finally { owner.dispose(); }
  });
}
