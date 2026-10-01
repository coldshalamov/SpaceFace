// PRO-06 — exiting to the menu forces a verified autosave before the screen changes.
//
// The bug this pins: `game:exitToMenu` had NO save listener at all. Every other progression
// milestone autosaves (dock, undock, sector, jump, mission, trade, story, respawn), so the one
// route a player takes when they simply stop playing was the one route that threw away their
// session. The pause menu's own "back to main menu" button emitted it.
//
// The Done sentence, in full: an exit-to-menu request triggers a forced autosave that VERIFIES
// before the screen changes, and never while dead or mid-jump.
//
// Proof is the live owner — the real `save` system, the real bus, the real localStorage-backed
// write+read-back verify path — not a copy of the expectation.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';
import { createBus } from '../src/core/eventBus.js';

// A real-enough localStorage: the exit path must survive a genuine write + read-back verify, so
// this is a Map-backed store that actually stores and actually returns, not a spy.
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

function flightState(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'paused'; // the real state when the player picks "back to main menu"
  state.simTime = 900;
  state.meta.playtimeS = 900;
  state.world.currentSectorId = 'sector_helios_prime';
  state.economy.credits = 4242;
  // The player owner is the single writer for credits; the economy system is the one that
  // mirrors them onto state.player. Both are set so the fixture matches a real session.
  state.player.credits = 4242;
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

// Boot the real system against a state and a real bus, the way the game does.
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

// ---------------------------------------------------------------------------------------
// The Done sentence
// ---------------------------------------------------------------------------------------

test('PRO-06: exiting to the menu writes a save, and the bytes are durable before the mode flips', () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    assert.equal(h.state.mode, 'paused');
    // main.js installs its mode flip AFTER createRegistry, and the bus dispatches listeners in
    // registration order — so on the real route the save lands before state.mode becomes 'menu'.
    h.bus.on('game:exitToMenu', () => { h.state.mode = 'menu'; });

    h.bus.emit('game:exitToMenu', { source: 'pause' });

    // The autosave slot now holds a real, complete envelope...
    const raw = store.storage.getItem('sf.save.auto');
    assert.ok(raw, 'exiting to the menu must leave a save in the autosave slot');
    const envelope = JSON.parse(raw);
    assert.equal(envelope.fmt, 'spaceface-save');
    assert.equal(envelope.slot, 'auto');
    assert.ok(envelope.checksum, 'the envelope must carry a checksum — the write verifies');
    // Credits are the player owner's record in the live capture plan, not the economy system's.
    assert.equal(envelope.data.player.credits, 4242,
      'the save must contain the session state, not an empty shell');
    assert.equal(envelope.data.entities.player.data.defId, 'ship_kestrel',
      'the player entity must be in the save, or Continue restores a world with nobody in it');
    assert.equal(envelope.playtimeS, 900, 'the session length is carried, so Continue is honest');

    // ...and it is a completed, verified save rather than a started one.
    const completed = h.events('save:completed');
    assert.equal(completed.length, 1, 'exactly one save:completed — no double write');
    assert.equal(completed[0].payload.reason, 'exit_to_menu');
    assert.equal(h.events('save:error').length, 0, 'the write must not error');

    // The screen changed only after the bytes were down.
    assert.equal(h.state.mode, 'menu', 'the exit still reaches the menu');
    assert.equal(h.state.save.currentSlot, 'auto');
  } finally {
    h.restore();
    store.restore();
  }
});

test('PRO-06: the write is verified, not merely issued', () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    const raw = store.storage.getItem('sf.save.auto');
    // Read-back verify is the save system's own contract; assert the stored bytes are the ones a
    // reader will parse and that the checksum the envelope advertises is the one it carries.
    const envelope = JSON.parse(raw);
    assert.equal(typeof envelope.checksum, 'string');
    assert.ok(envelope.checksum.length > 0);
    assert.equal(envelope.data.entities.player.id, 1,
      'the stored bytes parse as a save a reader can actually restore from');
    // The slot index is updated in the same boundary, so the menu lists the save it just wrote.
    const index = JSON.parse(store.storage.getItem('sf.save.index'));
    assert.ok(index.auto, 'the autosave slot must be listed for the menu to show it');
  } finally {
    h.restore();
    store.restore();
  }
});

test('PRO-06: requestAutosave could not have done this — the exit needs its own synchronous write', () => {
  // Pins WHY the exit path is separate. requestAutosave() bails when mode !== 'flight', and the
  // player is in 'paused' when they leave. If this ever stops being true the two paths can merge.
  const store = installStorage();
  const h = boot(flightState());
  try {
    assert.equal(h.state.mode, 'paused');
    // Drive the ordinary debounced path in the same state and show it writes nothing.
    const system = save;
    const prevSchedule = system._scheduleAutosaveWork;
    system._scheduleAutosaveWork = () => true;
    try {
      assert.equal(system.requestAutosave('test'), false,
        'the debounced autosave refuses a non-flight mode');
    } finally {
      system._scheduleAutosaveWork = prevSchedule;
    }
    assert.equal(store.storage.getItem('sf.save.auto'), null,
      'nothing was written by the debounced path');

    // The exit path writes from that same state.
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    assert.ok(store.storage.getItem('sf.save.auto'),
      'the exit path must still write from a paused state');
  } finally {
    h.restore();
    store.restore();
  }
});

// ---------------------------------------------------------------------------------------
// The gates the Done sentence names: never while dead, never mid-jump
// ---------------------------------------------------------------------------------------

test('PRO-06: exiting while dead writes nothing', () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    h.bus.emit('player:death', {});
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    assert.equal(store.storage.getItem('sf.save.auto'), null,
      'a death-gated state must not be written as the session');
    assert.equal(h.events('save:started').length, 0, 'no save is even started while dead');
  } finally {
    h.restore();
    store.restore();
  }
});

for (const jumpState of ['CHARGING', 'JUMPING']) {
  test(`PRO-06: exiting mid-jump (${jumpState}) writes nothing`, () => {
    const store = installStorage();
    const state = flightState();
    state.jump = { state: jumpState, progress: 0.5 };
    const h = boot(state);
    try {
      h.bus.emit('game:exitToMenu', { source: 'pause' });
      assert.equal(store.storage.getItem('sf.save.auto'), null,
        `${jumpState} is not a truthful moment to snapshot`);
      assert.equal(h.events('save:started').length, 0);
    } finally {
      h.restore();
      store.restore();
    }
  });
}

test('PRO-06: a settled jump state still saves', () => {
  const store = installStorage();
  const state = flightState();
  state.jump = { state: 'IDLE', progress: 0 };
  const h = boot(state);
  try {
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    assert.ok(store.storage.getItem('sf.save.auto'),
      'a jump that is not in flight must not block the exit save');
  } finally {
    h.restore();
    store.restore();
  }
});

// ---------------------------------------------------------------------------------------
// The "do not" on the line: never autosave an arena run onto a campaign slot
// ---------------------------------------------------------------------------------------

for (const kind of ['survival', 'lab']) {
  test(`PRO-06: a live ${kind} run never reaches a campaign slot on exit`, () => {
    const store = installStorage();
    const state = flightState();
    state.run = { kind, phase: 'active', credits: 999, xp: 0, modifiers: [], draftHistory: [] };
    const h = boot(state);
    try {
      h.bus.emit('game:exitToMenu', { source: 'pause' });
      assert.equal(store.storage.getItem('sf.save.auto'), null,
        `PQ-133 ruling 2: a ${kind} run is ephemeral and must not contaminate the campaign save`);
    } finally {
      h.restore();
      store.restore();
    }
  });
}

test('PRO-06: an inactive run does not block the exit save', () => {
  const store = installStorage();
  const state = flightState();
  state.run = { kind: 'survival', phase: 'inactive' };
  const h = boot(state);
  try {
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    assert.ok(store.storage.getItem('sf.save.auto'),
      'a finished run is ordinary campaign state again');
  } finally {
    h.restore();
    store.restore();
  }
});

test('PRO-06: a repeat exit request does not pay for a second full write', () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    // The real route: main.js flips the mode on the same event, and its listener is installed
    // after the save system's, so the second request genuinely arrives already at the menu.
    h.bus.on('game:exitToMenu', () => { h.state.mode = 'menu'; });
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    assert.equal(h.events('save:completed').length, 1, 'the first exit writes once');
    assert.equal(h.state.mode, 'menu');
    // A second exit request, arriving after the mode is already 'menu', must not write again.
    // (Two writes would differ only by their savedAt stamp, so the count is the honest probe.)
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    assert.equal(h.events('save:completed').length, 1,
      'a repeat exit must not pay for a second full write');
    assert.equal(h.events('save:started').length, 1, 'and must not even start one');
  } finally {
    h.restore();
    store.restore();
  }
});

test('PRO-06: a queued autosave is dropped rather than paid for twice', () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    // Stand in a pending autosave job, as a debounced trigger would leave it.
    save._autosavePending = { reason: 'interval', force: false, requestedAt: 0, runEpoch: save._runEpoch };
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    assert.equal(save._autosavePending, null, 'the stale job is cleared by the exit write');
    assert.equal(h.events('save:completed').length, 1, 'only the fresher exit write ran');
  } finally {
    h.restore();
    store.restore();
  }
});

// ---------------------------------------------------------------------------------------
// The second route: the tab closes / the window quits. Same defect, different door.
// ---------------------------------------------------------------------------------------

function withFakeWindow(fn) {
  const listeners = new Map();
  const fake = {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    fire(type) { for (const h of listeners.get(type) || []) h(); },
    types() { return Array.from(listeners.keys()).sort(); },
  };
  const had = Object.hasOwn(globalThis, 'window');
  const prev = globalThis.window;
  globalThis.window = fake;
  try { return fn(fake); } finally { if (had) globalThis.window = prev; else delete globalThis.window; }
}

for (const eventName of ['pagehide', 'beforeunload']) {
  test(`PRO-06: closing the tab (${eventName}) writes the session`, () => {
    const store = installStorage();
    withFakeWindow((fake) => {
      const h = boot(flightState());
      try {
        assert.ok(fake.types().includes(eventName),
          `the save system must listen for ${eventName}`);
        fake.fire(eventName);
        assert.ok(store.storage.getItem('sf.save.auto'),
          `a ${eventName} must not discard the session — this route used to save nothing`);
        assert.equal(h.events('save:completed').length, 1);
      } finally {
        h.restore();
      }
    });
    store.restore();
  });
}

test('PRO-06: quitting to the menu and then closing the tab writes once, not twice', () => {
  const store = installStorage();
  withFakeWindow((fake) => {
    const h = boot(flightState());
    try {
      h.bus.on('game:exitToMenu', () => { h.state.mode = 'menu'; });
      h.bus.emit('game:exitToMenu', { source: 'pause' });
      fake.fire('pagehide');
      assert.equal(h.events('save:completed').length, 1,
        'the two session-end doors must not both pay for a full write');
    } finally {
      h.restore();
    }
  });
  store.restore();
});

test('PRO-06: a backgrounded tab is not a finished session and does not autosave', () => {
  // visibilitychange is deliberately not wired: the interval autosave owns that cadence, and
  // writing on every tab switch would make alt-tabbing cost a full save every time.
  const store = installStorage();
  withFakeWindow((fake) => {
    const h = boot(flightState());
    try {
      assert.equal(fake.types().includes('visibilitychange'), false,
        'alt-tabbing must not trigger a save');
      fake.fire('visibilitychange');
      assert.equal(store.storage.getItem('sf.save.auto'), null);
    } finally {
      h.restore();
    }
  });
  store.restore();
});

test('PRO-06: an unload handler that throws does not block the exit', () => {
  installStorage();
  withFakeWindow((fake) => {
    const h = boot(flightState());
    const errors = [];
    const prevError = console.error;
    console.error = (...args) => errors.push(args[0]);
    try {
      // Make the save itself throw, as a corrupt serializer would.
      save.serialize = () => { throw new Error('boom'); };
      assert.doesNotThrow(() => fake.fire('pagehide'),
        'a failed final save must never cancel the unload');
      assert.equal(errors.length, 1, 'and it is reported once, not swallowed');
    } finally {
      console.error = prevError;
      h.restore();
    }
  });
});
