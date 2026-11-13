import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { save } from '../src/save/saveSystem.js';
import { economy } from '../src/systems/economy.js';
import { world } from '../src/systems/world.js';

function boot(t) {
  const bytes = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    get length() { return bytes.size; },
    key: index => [...bytes.keys()][index] ?? null,
    getItem: key => bytes.get(key) ?? null,
    setItem: (key, value) => bytes.set(key, String(value)),
    removeItem: key => bytes.delete(key),
  };
  const sim = createSimulation({ seed: 4242, systems: [{ ...world, update() {} }, economy, save], updateOrder: [] });
  t.after(() => {
    sim.dispose();
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.playerId = sim.spawn({ type: 'ship', hull: 100, radius: 8, pos: { x: 0, z: 0 } }).id;
  state.player.credits = 5000;
  return { state, bus, bytes, save: sim.registry.get('save'), world: sim.registry.get('world') };
}

test('F5 during a paid gate charge refuses the write and preserves the previous Continue', async t => {
  const h = boot(t);
  assert.equal(h.save.save('quick'), true);
  const previous = h.bytes.get('sf.save.quick');
  h.bus.emit('world:requestJump', { targetSectorId: 'sector_tethys_junction', via: 'gate' });
  assert.equal(h.state.jump.state, 'CHARGING');
  assert.equal(h.state.player.credits, 4820);

  const events = [];
  for (const event of ['save:started', 'save:completed', 'save:error']) {
    h.bus.on(event, payload => events.push([event, payload.reason]));
  }
  h.bus.emit('game:save', { slot: 'quick' });
  assert.deepEqual(events, [['save:error', 'jump_in_progress']]);
  assert.equal(h.bytes.get('sf.save.quick'), previous);
  assert.equal(await h.save.load('latest'), true);
  assert.equal(h.state.world.currentSectorId, 'sector_helios_prime');
  assert.equal(h.state.jump.state, 'IDLE');
  assert.equal(h.state.player.credits, 5000);
});

test('both write lanes refuse a jump in transit and save again after it settles', async t => {
  const h = boot(t);
  h.bus.emit('world:requestJump', { targetSectorId: 'sector_tethys_junction', via: 'gate' });
  h.world._tickCharging(h.state.jump.chargeNeeded, h.state);
  assert.equal(h.state.jump.state, 'JUMPING');
  const refused = [];
  h.bus.on('save:error', p => refused.push(p.reason));
  assert.equal(h.save.save('quick'), false);
  h.state.mode = 'paused';
  assert.equal(await h.save.saveAsync('quick'), false);
  assert.deepEqual(refused, ['jump_in_progress', 'jump_in_progress']);
  assert.equal(h.bytes.has('sf.save.quick'), false);

  h.state.mode = 'flight';
  h.world._tickJumping(2, h.state);
  assert.equal(h.state.world.currentSectorId, 'sector_tethys_junction');
  assert.equal(h.save.save('quick'), true);
  const stored = JSON.parse(h.bytes.get('sf.save.quick'));
  assert.equal(stored.data.world.currentSectorId, 'sector_tethys_junction');
  assert.equal(stored.data.player.credits, 4820);
});

test('a refused F5 leaves the pending receipt of an earlier coherent save', async t => {
  const h = boot(t);
  h.state.mode = 'paused';
  const earlier = h.save.saveAsync('quick');
  const pending = h.state.save.pendingWrite;
  assert.ok(pending);
  h.state.mode = 'flight';
  h.bus.emit('world:requestJump', { targetSectorId: 'sector_tethys_junction', via: 'gate' });
  h.bus.emit('game:save', { slot: 'quick' });
  assert.equal(h.state.save.pendingWrite, pending);
  assert.equal(await earlier, true);
  const stored = JSON.parse(h.bytes.get('sf.save.quick'));
  assert.equal(stored.data.world.jump.state, 'IDLE');
  assert.equal(stored.data.player.credits, 5000);
});

test('a paced save cannot retake its snapshot after the player resumes and starts a jump', async t => {
  const h = boot(t);
  h.state.mode = 'paused';
  const steps = h.save._serializeDataSteps;
  let resume;
  h.save._serializeDataSteps = function* () {
    // Trigger the production yield budget between two serialization regions.
    yield 'first-region';
    return yield* steps.call(this);
  };
  h.save._restoreFrameYield = () => new Promise(resolve => { resume = resolve; });
  const refused = [];
  h.bus.on('save:error', p => refused.push(p.reason));
  const clock = globalThis.performance;
  let time = 0;
  let saving;
  try {
    globalThis.performance = { now: () => (time += 20) };
    saving = h.save.saveAsync('quick');
  } finally {
    globalThis.performance = clock;
  }
  assert.equal(typeof resume, 'function');
  h.state.mode = 'flight';
  h.bus.emit('world:requestJump', { targetSectorId: 'sector_tethys_junction', via: 'gate' });
  resume();
  assert.equal(await saving, false);
  assert.deepEqual(refused, ['jump_in_progress']);
  assert.equal(h.bytes.has('sf.save.quick'), false);
});

test('a confirmed Ashfall ending still saves its committed return and drive fare', async t => {
  const h = boot(t);
  h.state.world.currentSectorId = 'sector_ashfall_reach';
  h.state.fuel.current = 80;
  Object.assign(h.state.jump, {
    state: 'CHARGING', via: 'drive', targetSectorId: 'sector_helios_prime',
    _unfiled: true, _unfiledConfirmed: true, _fuelCost: 12,
  });
  h.state.mode = 'paused';
  assert.equal(await h.save.saveAsync('quick'), true);
  const stored = JSON.parse(h.bytes.get('sf.save.quick'));
  assert.equal(stored.data.world.currentSectorId, 'sector_helios_prime');
  assert.equal(stored.data.world.jump.state, 'COOLDOWN');
  assert.equal(stored.data.world.fuel.current, 68);
});
