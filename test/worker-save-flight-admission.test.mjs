import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRealPath, writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { save } from '../src/save/saveSystem.js';
import { applyLaneMode } from '../src/core/simLaneCommands.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { focusLossPauseBlocked } from '../src/core/focusLossHold.js';
import { fnv1a } from '../src/save/checksum.js';
import { installSalvageTenderSaveAdapter } from '../src/features/salvageTender/saveAdapter.js';

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

test('live Quick Save detaches the current flight before paced encoding and keeps the newest write', async () => {
  const store = storage();
  let run;
  let releaseAdapter;
  try {
    run = await bootRealPath({ seed: 4242,
      systems: [Object.create(save), 'flightV3', 'actions', 'physics'],
      hulls: [{ hullId: 'ship_kestrel', pos: { x: 0, z: 0 }, isPlayer: true }] });
    const { state, bus } = run;
    const owner = run.runtime.getSystem('save');
    releaseAdapter = installSalvageTenderSaveAdapter(owner);
    state.world.currentSectorId = 'sector_helios_prime';
    writeRealPathInput(state, { moveX: 1 });
    run.step(30);
    assert.equal(state.mode, 'flight');
    assert.equal(owner._frozenTickBoundary(), false);
    assert.ok(Math.hypot(run.player.vel.x, run.player.vel.z) > 10);
    const completed = [];
    bus.on('save:completed', receipt => completed.push(receipt));

    function holdQuick(label) {
      const schedule = owner._scheduleAutosaveWork;
      let release;
      owner._scheduleAutosaveWork = callback => {
        release = callback;
        owner._scheduleAutosaveWork = schedule;
      };
      bus.emit('game:save', { slot: 'quick', label });
      owner._scheduleAutosaveWork = schedule;
      assert.equal(typeof release, 'function', 'Quick encoding and storage start on later tasks');
      return { release, promise: owner._activePacedSave.promise };
    }

    const xz = ({ x, z }) => ({ x, z });
    const bound = { tick: state.tick, playtimeS: Math.floor(state.meta.playtimeS),
      pos: xz(run.player.pos), vel: xz(run.player.vel) };
    state.player.credits = 2302;
    state.player.cargo.items.cmdty_ore_iron = 7;
    // Older World News rows are accepted as a JSON array and the serializer slices the outer array.
    const previousDockLine = { text: 'Original bulletin', detail: { severity: 1 } };
    state.worldNews = { dockLines: [previousDockLine] };
    const quick = holdQuick('Flying at capture');
    assert.equal(focusLossPauseBlocked(state), false, 'a detached save can no longer block background pause');
    assert.equal(store.rows.has('sf.save.quick'), false);
    assert.equal(completed.length, 0);
    state.player.credits = 3302;
    state.player.cargo.items.cmdty_ore_iron = 8;
    state.meta.playtimeS += 10;
    previousDockLine.detail.severity = 2;
    run.step(5);
    assert.ok(state.tick > bound.tick, 'real native flight advances with Quick still pending');
    assert.notDeepEqual(xz(run.player.pos), bound.pos);

    quick.release();
    assert.equal(await quick.promise, true);
    assert.equal(completed.length, 1);
    const { blockingSamples, serializerTimings } = completed[0];
    assert.deepEqual(serializerTimings.map(({ key }) => key), [
      'physics.exportAndCanonicalize', 'physics.compactAttestations', 'otherSaveReaders', 'detach.structuredClone',
    ]);
    assert.ok(serializerTimings.every(({ ms }) => Number.isFinite(ms) && ms >= 0));
    const capture = blockingSamples.find(({ phase }) => phase === 'serialize');
    assert.ok(capture && serializerTimings.reduce((sum, { ms }) => sum + ms, 0) <= capture.ms);
    const selected = JSON.parse(store.rows.get('sf.save.quick'));
    assert.equal(selected.label, 'Flying at capture');
    assert.equal(selected.playtimeS, bound.playtimeS);
    assert.equal(selected.checksum, fnv1a(JSON.stringify(selected.data)));
    assert.equal(selected.data.entities.tick, bound.tick);
    assert.deepEqual(selected.data.entities.player.pos, bound.pos);
    assert.deepEqual(selected.data.entities.player.vel, bound.vel);
    assert.equal(selected.data.player.credits, 2302);
    assert.equal(selected.data.cargo.items.cmdty_ore_iron, 7);
    assert.equal(selected.data.worldNews.dockLines[0].detail.severity, 1);

    previousDockLine.legacyRuntimeHint = () => 'ignored by the existing JSON serializer';
    const legacy = holdQuick('Legacy JSON capture');
    previousDockLine.detail.severity = 3;
    delete previousDockLine.legacyRuntimeHint;
    legacy.release();
    assert.equal(await legacy.promise, true, 'clone-incompatible data the old writer could stringify still saves');
    assert.equal(completed.at(-1).serializerTimings.at(-1).key, 'detach.cloneThenJsonFallback');
    const legacyLine = JSON.parse(store.rows.get('sf.save.quick')).data.worldNews.dockLines[0];
    assert.deepEqual(legacyLine, { text: 'Original bulletin', detail: { severity: 2 } });

    const older = holdQuick('Older paced save');
    state.player.credits = 4302;
    assert.equal(owner.save('quick', { label: 'Newer synchronous save' }), true);
    assert.equal(await owner._lastSaveDurability, true);
    const latestRaw = store.rows.get('sf.save.quick');
    older.release();
    assert.equal(await older.promise, false);
    assert.equal(store.rows.get('sf.save.quick'), latestRaw);
    assert.equal(JSON.parse(latestRaw).data.player.credits, 4302);

    const preRestore = holdQuick('Pre-restore save');
    assert.equal(await owner.load('quick', { preferAsync: true }), true);
    preRestore.release();
    assert.equal(await preRestore.promise, false, 'another restore boundary retires a waiting Quick save');
    assert.equal(store.rows.get('sf.save.quick'), latestRaw);
    assert.equal(state.save.pendingWrite, null, 'the retired Quick clears only its own pending marker');
  } finally {
    releaseAdapter?.();
    run?.dispose();
    store.restore();
  }
});

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
