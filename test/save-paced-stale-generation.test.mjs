// Stale-generation guard on the paced/async save lanes.
//
// The defect this pins: `_writeSlot` and the autosave transaction each trusted a `previousRaw`
// the caller read before a chain of scheduled hops — but a synchronous save, a delete, an
// autosave transaction, or a shared-store apply can all write the same localStorage key in
// between. On drift the stale lane still rotated its old bytes into recovery and wrote its
// own snapshot over the interleaved generation, erasing it from BOTH primary and recovery.
// A delete fared no better: the pending lane resurrected the slot the player just removed.
//
// This is the write-side twin of the load path's stable-pair re-read (754b7e3a2f0): every leg
// that acts on the previous generation re-reads the live primary first, and a writer that
// finds the slot moved concedes with a 'superseded' receipt instead of clobbering.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';
import { createBus } from '../src/core/eventBus.js';

function installStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
  const had = Object.hasOwn(globalThis, 'localStorage');
  const prev = globalThis.localStorage;
  globalThis.localStorage = storage;
  return {
    storage,
    restore() { if (had) globalThis.localStorage = prev; else delete globalThis.localStorage; },
  };
}

function flightState(credits = 4242) {
  const state = createGameState(4242);
  state.mode = 'paused'; // the real state behind the pause menu's save/exit routes
  state.simTime = 900;
  state.meta.playtimeS = 900;
  state.world.currentSectorId = 'sector_helios_prime';
  state.economy.credits = credits;
  state.player.credits = credits;
  const player = {
    id: 1, alive: true, type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 9, mass: 18, hull: 100, hullMax: 100,
    flags: { isPlayer: true }, data: { defId: 'ship_kestrel' },
  };
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  for (const key of ['claims', 'aceMemory', 'lossLedger', 'aftermathWrecks', 'fieldDepletion',
    'livingPoiBehaviors', 'signalInvestigation', 'recoveryEncounters', 'regionalEcology']) {
    state[key] = { history: [] };
  }
  state.careers.origins = { history: [] };
  state.careers.ladders = { history: [] };
  return state;
}

function boot(state) {
  const bus = createBus();
  const seen = [];
  const wrapped = {
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),
    once: bus.once.bind(bus),
    emit(event, payload) { seen.push({ event, payload }); return bus.emit(event, payload); },
  };
  const prev = { state: save.state, bus: save.bus, helpers: save.helpers, registry: save.registry };
  save.state = state;
  save.bus = wrapped;
  save.helpers = {};
  save.registry = { get() { return null; } };
  save.init({ state, bus: wrapped });
  return {
    bus: wrapped, seen, state,
    events: (name) => seen.filter((e) => e.event === name),
    restore() {
      save.state = prev.state; save.bus = prev.bus;
      save.helpers = prev.helpers; save.registry = prev.registry;
    },
  };
}

function creditsOf(storage, key) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  return JSON.parse(raw).data.player.credits;
}

// A synchronous write by another lane while the wrapped leg is mid-flight. The hook runs before
// the delegate, so the interleaved generation lands inside the stale-read window — exactly what
// a pagehide exit save, a delete, or a shared-store apply does on the real scheduler.
function injectOnce(fn) {
  let fired = false;
  return () => {
    if (fired) return;
    fired = true;
    fn();
  };
}

// Drive the save system's scheduled hops plus the real timer yields inside async legs until a
// condition holds or the bounded loop gives up. _scheduleAutosaveWork is left on real
// setTimeout(0): the injection spies, not the scheduler, are what makes each race deterministic.
async function until(cond, tries = 400) {
  for (let i = 0; i < tries; i++) {
    if (cond()) return true;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return cond();
}

// Build an in-flight autosave transaction the way _flushAutosave does once the capture is done:
// a real serialize/stringify snapshot and a job stamped with the live epoch counters.
function startAutosaveTransaction() {
  const envelope = save.serialize('auto');
  const snapshot = {
    envelope,
    json: JSON.stringify(envelope),
    serializeMs: 0,
    stringifyMs: 0,
    blockingSlices: [0],
    blockingSamples: [],
    snapshotBoundary: null,
    workerRoundtripMs: 0,
  };
  const job = {
    reason: 'interval',
    force: true,
    requestedAt: 0,
    runEpoch: save._runEpoch,
    restoreSequence: save._restoreSequence,
  };
  save._autosaveInFlight = true;
  save._activeAutosaveJob = job;
  job.generation = ++save._autosaveGeneration;
  save._beginAutosaveTransaction(job, snapshot);
  return { job, snapshot };
}

test('a paced save concedes to a synchronous generation that landed mid-chain', async () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    // Seed the slot with an older generation so the paced chain has a previousRaw to prove.
    assert.equal(save.save('auto', { reason: 'seed' }), true);
    assert.equal(creditsOf(store.storage, 'sf.save.auto'), 4242);

    // When the paced chain reaches its write leg, a synchronous save (the pagehide flush is
    // the real-world actor) lands inside the read→write window the chain already crossed.
    const originalWriteSlot = save._writeSlot;
    const inject = injectOnce(() => {
      h.state.player.credits = 7777;
      h.state.economy.credits = 7777;
      assert.equal(save.save('auto', { reason: 'unload' }), true);
    });
    save._writeSlot = function (slot, envelope, options) {
      if (options && options.previousRaw !== undefined) inject();
      return originalWriteSlot.call(this, slot, envelope, options);
    };
    try {
      const settled = await save.saveAsync('auto', { reason: 'exit_to_menu' });
      assert.equal(settled, false, 'the stale paced chain concedes rather than writing');
    } finally {
      save._writeSlot = originalWriteSlot;
    }

    // The interleaved generation owns the slot, and the pre-both generation still rides the
    // recovery copy the synchronous writer rotated in.
    assert.equal(creditsOf(store.storage, 'sf.save.auto'), 7777,
      'the newer synchronous save must survive — before the guard it was erased entirely');
    assert.equal(creditsOf(store.storage, 'sf.recovery.auto'), 4242,
      'recovery still holds the generation that preceded both writers');
    assert.equal(h.events('save:completed').filter((e) => e.payload && e.payload.reason === 'exit_to_menu').length, 0,
      'the conceding paced chain must not publish a success receipt');
    const superseded = h.events('save:error').filter((e) => e.payload && e.payload.failure === 'superseded');
    assert.equal(superseded.length, 1, 'the conceding lane publishes one superseded receipt');
  } finally {
    h.restore();
    store.restore();
  }
});

test('a paced save does not resurrect a slot deleted mid-chain', async () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    assert.equal(save.save('auto', { reason: 'seed' }), true);

    const originalWriteSlot = save._writeSlot;
    const inject = injectOnce(() => save.deleteSlot('auto'));
    save._writeSlot = function (slot, envelope, options) {
      if (options && options.previousRaw !== undefined) inject();
      return originalWriteSlot.call(this, slot, envelope, options);
    };
    try {
      const settled = await save.saveAsync('auto', { reason: 'exit_to_menu' });
      assert.equal(settled, false);
    } finally {
      save._writeSlot = originalWriteSlot;
    }

    assert.equal(store.storage.getItem('sf.save.auto'), null,
      'the delete wins — the pending chain must not recreate the primary');
    assert.equal(store.storage.getItem('sf.recovery.auto'), null,
      'and must not leave the recovery copy behind either');
    assert.equal(h.events('save:completed').length, 1,
      'only the seed write completed; the delete is a mutation, not a save');
  } finally {
    h.restore();
    store.restore();
  }
});

test('an autosave transaction concedes when a foreign write lands before its storage legs', async () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    assert.equal(save.save('auto', { reason: 'seed' }), true);
    assert.equal(creditsOf(store.storage, 'sf.save.auto'), 4242);

    // The transaction reads + validates the previous generation across several hops; the
    // foreign write lands in that window, just before the first storage mutation.
    const originalWriteBackup = save._autosaveWriteBackup;
    const inject = injectOnce(() => {
      h.state.player.credits = 7777;
      h.state.economy.credits = 7777;
      assert.equal(save.save('auto', { reason: 'unload' }), true);
    });
    save._autosaveWriteBackup = function (job, snapshot, tx) {
      inject();
      return originalWriteBackup.call(this, job, snapshot, tx);
    };
    try {
      startAutosaveTransaction();
      assert.equal(await until(() => save._activeAutosaveTransaction == null), true,
        'the transaction settles');
    } finally {
      save._autosaveWriteBackup = originalWriteBackup;
    }

    assert.equal(creditsOf(store.storage, 'sf.save.auto'), 7777,
      'the foreign generation survives — the transaction cannot rotate stale bytes over it');
    assert.equal(creditsOf(store.storage, 'sf.recovery.auto'), 4242);
    const superseded = h.events('save:error').filter((e) => e.payload && e.payload.failure === 'superseded');
    assert.ok(superseded.length >= 1, 'the transaction publishes a superseded receipt');
    assert.equal(save._autosaveInFlight, false);
  } finally {
    h.restore();
    store.restore();
  }
});

test('an autosave rollback concedes instead of restoring over a foreign generation', async () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    assert.equal(save.save('auto', { reason: 'seed' }), true);

    // The transaction lands its primary, then a foreign generation arrives before the
    // read-back verify. The rollback this used to schedule would have restored the old
    // bytes over the interleaved save — now it must concede and leave it alone.
    const originalReadback = save._autosaveReadback;
    const inject = injectOnce(() => {
      h.state.player.credits = 7777;
      h.state.economy.credits = 7777;
      assert.equal(save.save('auto', { reason: 'unload' }), true);
    });
    save._autosaveReadback = function (job, snapshot, tx) {
      inject();
      return originalReadback.call(this, job, snapshot, tx);
    };
    try {
      startAutosaveTransaction();
      assert.equal(await until(() => save._activeAutosaveTransaction == null), true);
    } finally {
      save._autosaveReadback = originalReadback;
    }

    assert.equal(creditsOf(store.storage, 'sf.save.auto'), 7777,
      'the foreign generation survives the rollback window too');
    assert.equal(creditsOf(store.storage, 'sf.recovery.auto'), 4242);
    assert.equal(h.events('save:completed').filter((e) => e.payload && e.payload.reason === 'interval').length, 0,
      'the conceding transaction must not publish a success receipt for bytes it did not write');
  } finally {
    h.restore();
    store.restore();
  }
});

test('an exit save deterministically wins over an autosave already in flight', async () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    assert.equal(save.save('auto', { reason: 'seed' }), true);

    // An autosave transaction is mid-flight when the player exits — the explicit exit write
    // is the newer snapshot and must own the final generation, not race for it.
    startAutosaveTransaction();
    assert.ok(save._activeAutosaveTransaction, 'the autosave is genuinely in flight');
    h.state.player.credits = 7777;
    h.state.economy.credits = 7777;

    const settled = await save.saveAsync('auto', { reason: 'exit_to_menu' });
    assert.equal(settled, true, 'the exit write still lands');
    assert.equal(await until(() => save._activeAutosaveTransaction == null), true);

    assert.equal(creditsOf(store.storage, 'sf.save.auto'), 7777,
      'the exit save — not the older autosave — is the final generation');
    const superseded = h.events('save:error').filter((e) => e.payload && e.payload.failure === 'superseded');
    assert.ok(superseded.length >= 1, 'the autosave takes a superseded receipt');
    assert.equal(save._autosaveInFlight, false);
  } finally {
    h.restore();
    store.restore();
  }
});
