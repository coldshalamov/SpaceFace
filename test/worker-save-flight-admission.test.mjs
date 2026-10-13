import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { save } from '../src/save/saveSystem.js';
import { applyLaneMode } from '../src/core/simLaneCommands.js';
import { createTimeEffects } from '../src/core/timeEffects.js';

function storage() {
  const previous = globalThis.localStorage;
  const rows = new Map();
  globalThis.localStorage = {
    getItem: key => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, String(value)),
    removeItem: key => rows.delete(key),
    key: index => [...rows.keys()][index] ?? null,
    get length() { return rows.size; },
  };
  return { rows, restore() {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  } };
}

for (const deferred of [true, false]) {
  test(`paused save restore ${deferred ? 'waits for main flight admission' : 'retains standalone flight completion'}`, async () => {
    const store = storage();
    let run;
    try {
      run = await bootRealPath({ seed: 4242,
        systems: [Object.create(save), 'flightV3', 'actions', 'physics'],
        hulls: [{ hullId: 'ship_kestrel', pos: { x: 0, z: 0 }, isPlayer: true }] });
      const owner = run.runtime.getSystem('save');
      run.runtime.getHelpers().deferFlightAdmission = deferred;
      run.state.world.currentSectorId = 'sector_helios_prime';
      run.step(2);
      run.state.mode = 'paused';
      createTimeEffects(run.state).set('ui:pausing-screen', { scale: 0 });
      const writes = [];
      run.bus.on('save:completed', payload => writes.push(payload));
      run.bus.emit('game:save', { slot: 'quick', label: 'Paused flight' });
      assert.equal(await owner._activePacedSave.promise, true);
      assert.equal(writes.length, 1);
      const envelope = JSON.parse(store.rows.get('sf.save.quick'));
      assert.equal(envelope.data.ui, undefined, 'pause overlays are transient');
      assert.equal(envelope.data.timeScale, undefined, 'save bytes carry no freeze scalar');
      assert.equal(envelope.data.timeEffects, undefined, 'save bytes carry no runtime freeze requests');

      run.state.mode = 'menu';
      const modes = [];
      const loaded = [];
      run.bus.on('mode:changed', payload => modes.push(payload.mode));
      run.bus.on('save:loaded', payload => loaded.push(payload));
      assert.equal(await owner.load('quick', { preferAsync: true }), true);
      assert.equal(loaded.length, 1);
      assert.equal(loaded[0].visualGatePending, deferred);
      assert.equal(run.state.mode, deferred ? 'loading' : 'flight');
      assert.equal(modes.includes('flight'), !deferred,
        'the worker must not announce a transient flight before main visual admission');
      assert.deepEqual(createTimeEffects(run.state).describeRequests(), {},
        'restore releases its own freeze; the main loading owner holds the presentation gate');
      assert.equal(owner._restoring, false, 'the native restore has finished before visual handoff');
      if (deferred) {
        assert.equal(applyLaneMode(run.state, run.bus, 'flight'), true,
          'only the existing main-to-worker mode command admits completed flight');
        assert.equal(modes.at(-1), 'flight');
      }
      run.player = run.state.entities.get(run.state.playerId);
      const tick = run.state.tick;
      const simTime = run.state.simTime;
      run.step(2);
      assert(run.state.tick > tick);
      assert(run.state.simTime > simTime);
      run.assertBodies(run.player, 'restored admitted flight');
      assert.equal(run.proof().physicsBackend, 'rapier-dynamic');
    } finally {
      run?.dispose();
      store.restore();
    }
  });
}
