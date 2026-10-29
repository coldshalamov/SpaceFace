// Stale-restore guard on the async load lanes' error emissions.
//
// The defect this pins (save deep-review, HIGH): `loadAsync()` and
// `_loadEnvelopeFromStringAsync()` stamp `acceptSeq` before their awaits, but a request
// whose async leg resolves AFTER a newer restore advanced `_restoreSequence` could still
// reach its `save:error` emit — the loser's message landing on top of the winner's run.
// Every post-await error branch now re-checks `acceptSeq !== this._restoreSequence` — the
// same idiom the apply path uses to reject stale restores (`_restorePreparedEnvelopeAsync`,
// `_restoreAsync`) — and resolves handled instead of publishing.
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

function flightState() {
  const state = createGameState(4242);
  state.mode = 'paused';
  state.simTime = 900;
  state.meta.playtimeS = 900;
  state.world.currentSectorId = 'sector_helios_prime';
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

// A prepared-verdict gate the test releases by hand: the async prepare stays suspended until
// the race is staged, then settles with the scripted verdict — the deterministic form of the
// worker roundtrip a newer restore outruns on the real scheduler.
function gatedPrepare(verdict) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const original = save._prepareEnvelopeStringAsync;
  save._prepareEnvelopeStringAsync = () => gate;
  return {
    release: () => release(verdict),
    restore() { save._prepareEnvelopeStringAsync = original; },
  };
}

test('a superseded import restore resolves false without publishing its stale error', async () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    const gate = gatedPrepare({ ok: false, reason: 'load_failed' });
    try {
      // Request A stamps acceptSeq, then suspends inside the async prepare.
      const stale = save._loadEnvelopeFromStringAsync('{"fmt":"spaceface-save"}', 'imported');
      // Restore B commits while A is suspended — the sequence advances under it.
      save._beginRestoreSequence();
      gate.release();
      const settled = await stale;
      assert.equal(settled, false);
      assert.equal(h.events('save:error').length, 0,
        'the loser must not publish its stale error over the newer restore');
    } finally {
      gate.restore();
    }
  } finally {
    h.restore();
    store.restore();
  }
});

test('the same failing import prepare still publishes its error while the request is current', async () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    const gate = gatedPrepare({ ok: false, reason: 'checksum' });
    try {
      const current = save._loadEnvelopeFromStringAsync('{"fmt":"spaceface-save"}', 'imported');
      gate.release();
      const settled = await current;
      assert.equal(settled, false);
      const errors = h.events('save:error');
      assert.equal(errors.length, 1, 'a current request still owns its failure receipt');
      assert.equal(errors[0].payload.reason, 'checksum');
    } finally {
      gate.restore();
    }
  } finally {
    h.restore();
    store.restore();
  }
});

test('a superseded loadAsync reaches its failure tail without publishing the stale error', async () => {
  const store = installStorage({ 'sf.save.stale': '{"corrupt":true}' });
  const h = boot(flightState());
  try {
    const gate = gatedPrepare({ ok: false, reason: 'checksum' });
    try {
      // Primary and recovery prepares both suspend on the same gate; recovery is absent, so
      // the only remaining outcome is the final save:error once the gate releases.
      const stale = save.loadAsync('stale');
      save._beginRestoreSequence();
      gate.release();
      const settled = await stale;
      assert.equal(settled, true, 'a superseded request resolves handled, not failed');
      assert.equal(h.events('save:error').length, 0,
        'the stale load must not emit the loser error receipt');
    } finally {
      gate.restore();
    }
  } finally {
    h.restore();
    store.restore();
  }
});

test('a superseded latest-slot scan resolves handled without publishing no-save over the newer run', async () => {
  const store = installStorage();
  const h = boot(flightState());
  const previousScan = save._newerUnplayableSkipAsync;
  const previousLatest = save._latestSlotAsync;
  try {
    let releaseScan;
    save._newerUnplayableSkipAsync = () => new Promise(resolve => { releaseScan = resolve; });
    save._latestSlotAsync = async () => null;
    const stale = save.loadAsync('latest');
    save._beginRestoreSequence();
    releaseScan(null);

    assert.equal(await stale, true, 'the superseded latest request is handled quietly');
    assert.equal(h.events('save:error').length, 0,
      'a stale no-save result must not cover the newer route with an error receipt');
  } finally {
    save._newerUnplayableSkipAsync = previousScan;
    save._latestSlotAsync = previousLatest;
    h.restore();
    store.restore();
  }
});

test('a current latest-slot miss still reports no-save', async () => {
  const store = installStorage();
  const h = boot(flightState());
  const previousScan = save._newerUnplayableSkipAsync;
  const previousLatest = save._latestSlotAsync;
  try {
    save._newerUnplayableSkipAsync = async () => null;
    save._latestSlotAsync = async () => null;

    assert.equal(await save.loadAsync('latest'), false);
    assert.equal(h.events('save:error').length, 1);
    assert.equal(h.events('save:error')[0].payload.reason, 'no_save');
  } finally {
    save._newerUnplayableSkipAsync = previousScan;
    save._latestSlotAsync = previousLatest;
    h.restore();
    store.restore();
  }
});

test('a superseded FileReader import failure stays silent once a newer restore owns the run', async () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    let pendingError;
    const hadReader = Object.hasOwn(globalThis, 'FileReader');
    const prevReader = globalThis.FileReader;
    globalThis.FileReader = class {
      readAsText() { pendingError = () => this.onerror && this.onerror(); }
    };
    try {
      let callbackResult = null;
      save.importFile({ size: 4 }, (ok) => { callbackResult = ok; });
      // The newer restore commits while the file read is still in flight.
      save._beginRestoreSequence();
      pendingError();
      assert.equal(callbackResult, false, 'the failed read still reports to its caller');
      assert.equal(h.events('save:error').length, 0,
        'but its stale error never reaches the player');
    } finally {
      if (hadReader) globalThis.FileReader = prevReader;
      else delete globalThis.FileReader;
    }
  } finally {
    h.restore();
    store.restore();
  }
});
