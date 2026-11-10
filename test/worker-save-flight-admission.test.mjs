import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRealPath, writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
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
      writeRealPathInput(run.state, { moveX: 1 });
      run.step(60);
      writeRealPathInput(run.state);
      assert(Math.hypot(run.player.vel.x, run.player.vel.z) > 10, 'real propulsion establishes a moving save');
      run.state.player.cargo.items.cmdty_ore_iron = 52;
      run.state.player.cargo.items.cmdty_silicate = 7;
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
      const committed = [];
      run.bus.on('mode:changed', payload => modes.push(payload.mode));
      run.bus.on('save:loaded', payload => loaded.push(payload));
      run.bus.on('save:restoreCommitted', payload => committed.push(payload));
      assert.equal(await owner.load('quick', { preferAsync: true }), true);
      assert.equal(loaded.length, 1);
      assert.equal(loaded[0].visualGatePending, deferred);
      assert.equal(committed.length, 1);
      const motion = committed[0].restoredMotion;
      const savedPlayer = envelope.data.entities.player;
      assert.deepEqual(motion?.pos, { x: savedPlayer.pos.x, z: savedPlayer.pos.z });
      assert.deepEqual(motion?.vel, { x: savedPlayer.vel.x, z: savedPlayer.vel.z });
      const restoredPlayer = run.state.entities.get(run.state.playerId);
      assert.deepEqual(motion.pos, { x: restoredPlayer.pos.x, z: restoredPlayer.pos.z },
        'the committed receipt captures the completed native restore before gameplay');
      assert.deepEqual(motion.vel, { x: restoredPlayer.vel.x, z: restoredPlayer.vel.z },
        'the committed receipt captures native velocity before any gameplay step');
      assert(Object.isFrozen(motion) && Object.isFrozen(motion.pos) && Object.isFrozen(motion.vel));
      const bridgedMotion = projectBridgeEvent('save:restoreCommitted', committed[0]).flat?.restoredMotion;
      assert.deepEqual(bridgedMotion, motion, 'the actual event bridge keeps detached motion primitives');
      const immutableMotion = structuredClone(motion);
      assert.deepEqual(loaded[0].restoredEconomy, {
        credits: envelope.data.player.credits,
        cargoItems: envelope.data.cargo.items,
      }, 'the restore receipt reflects the selected save before resumed gameplay');
      const restoredEconomy = structuredClone(loaded[0].restoredEconomy);
      run.state.player.cargo.items.cmdty_ore_iron += 1;
      run.state.player.credits += 1;
      assert.deepEqual(loaded[0].restoredEconomy, restoredEconomy,
        'later changes to the canonical player cannot mutate the restore receipt');
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
      writeRealPathInput(run.state, { brake: true });
      run.step(30);
      assert(Math.abs(Math.hypot(run.player.vel.x, run.player.vel.z)
        - Math.hypot(immutableMotion.vel.x, immutableMotion.vel.z)) > 2,
      'later real braking changes live speed beyond the restoration tolerance');
      assert.deepEqual(committed[0].restoredMotion, immutableMotion,
        'subsequent physics cannot rewrite the restore-boundary receipt');
      assert.deepEqual(bridgedMotion, immutableMotion,
        'event replay can retain the restore speed while live physics advances');
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
