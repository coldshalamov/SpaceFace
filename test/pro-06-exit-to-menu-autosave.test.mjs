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
import { core } from '../src/core/coreSystem.js';
import { resetRunState } from '../src/core/newGameBoot.js';
import { resetFreshRunSystems } from '../src/core/runReset.js';
import { runSession } from '../src/systems/runSession.js';
import { economy } from '../src/systems/economy.js';
import { PRODUCTION_INIT_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { orbitalGallery } from '../src/gallery/orbital/system.js';
import { installPhysicsVenueHooks, stagePhysicsVenue } from '../src/ui/physicsVenues.js';

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
  state.nextEntityId = player.id + 1;
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
function boot(state, { withEconomy = false, withVenue = false } = {}) {
  const bus = createBus();
  const seen = [];
  const wrapped = {
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),
    once: bus.once.bind(bus),
    queue: bus.queue.bind(bus),
    emit(event, payload) { seen.push({ event, payload }); return bus.emit(event, payload); },
  };
  const prev = { state: save.state, bus: save.bus, helpers: save.helpers, registry: save.registry };
  const session = Object.create(runSession);
  const owners = new Map([['runSession', session], ['save', save]]);
  if (withEconomy) {
    owners.set('core', Object.create(core));
    owners.set('economy', Object.create(economy));
  }
  if (withVenue) owners.set('orbitalGallery', Object.create(orbitalGallery));
  const helpers = {};
  const registry = { get(name) { return owners.get(name) || null; } };
  const ctx = { state, bus: wrapped, helpers, registry };
  // In particular runSession MUST register its Exit/restore listeners before save.
  for (const name of PRODUCTION_INIT_ORDER) owners.get(name)?.init(ctx);
  return {
    bus: wrapped, seen, state, helpers, registry,
    events: (name) => seen.filter((e) => e.event === name),
    restore() {
      owners.get('orbitalGallery')?.destroy();
      session.destroy();
      owners.get('core')?.destroy();
      save.state = prev.state; save.bus = prev.bus;
      save.helpers = prev.helpers; save.registry = prev.registry;
    },
  };
}

// ---------------------------------------------------------------------------------------
// The Done sentence
// ---------------------------------------------------------------------------------------

// The exit write is a paced chain (saveAsync): the emit schedules the serialize→write
// legs across task hops so the menu transition paints between them; the durable bytes
// and the save:completed receipt land when the chain settles. Tests that assert on the
// write await it here — same assertions as the old synchronous contract.
async function settlePacedSave() {
  const job = save._activePacedSave;
  if (job && job.promise) await job.promise;
}

test('PRO-06: exiting to the menu writes a save, and the bytes are durable once the chain settles', async () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    assert.equal(h.state.mode, 'paused');
    // main.js installs its mode flip AFTER createRegistry, and the bus dispatches listeners in
    // registration order — the paced write still lands while the mode flip is this emit's tail.
    h.bus.on('game:exitToMenu', () => { h.state.mode = 'menu'; });

    h.bus.emit('game:exitToMenu', { source: 'pause' });
    await settlePacedSave();

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

test('PRO-06: the write is verified, not merely issued', async () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    await settlePacedSave();
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

test('PRO-06: requestAutosave could not have done this — the exit needs its own immediate write', async () => {
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
    await settlePacedSave();
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

test('PRO-06: a settled jump state still saves', async () => {
  const store = installStorage();
  const state = flightState();
  state.jump = { state: 'IDLE', progress: 0 };
  const h = boot(state);
  try {
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    await settlePacedSave();
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

const STATION = 'station_beltout';
const FOOD = 'cmdty_food';

async function arcadeBoundary(kind = 'survival', { exit = true } = {}) {
  const store = installStorage();
  const isVenue = kind === 'venue' || kind === 'direct-venue';
  const h = boot(flightState(), { withEconomy: true, withVenue: isVenue });
  const econ = h.registry.get('economy');
  econ.ensureMarket(STATION);
  const originalStock = h.state.economy.markets[STATION][FOOD].stock;
  assert.equal(save.save('auto'), true);
  await save._lastSaveDurability;
  const original = store.storage.getItem('sf.save.auto');
  const originalIndex = store.storage.getItem('sf.save.index');
  const completed = h.events('save:completed').length;
  if (kind === 'racing') {
    h.bus.emit('game:new', { seed: 4242, racingSession: true });
    h.bus.emit('game:started', {});
    assert.equal(save._ephemeralRacing, true);
  } else if (isVenue) {
    h.state.mode = 'flight';
    if (kind === 'venue') {
      const off = installPhysicsVenueHooks(h.bus, () => ({ state: h.state }));
      try {
        assert.equal(stagePhysicsVenue(h.bus, 'gallery', 'og-a1-straight-cue'), true);
        h.state.physicsVenueSession = true; // the new-game boot's session flag
        h.bus.emit('game:started', {});
        await Promise.resolve();
      } finally { off(); }
      assert.equal(save._ephemeralRacing, true);
    } else h.bus.emit('orbital-gallery:enter', { scenarioId: 'og-a1-straight-cue' });
    assert.equal(h.state.physicsVenue?.active, true, 'the real court owner entered');
    h.state.mode = 'paused';
  } else {
    h.bus.emit('run:beginRequested', { kind, ruleset: 'swarm', seed: 4242 });
    for (const [expectedPhase, nextPhase] of [
      ['loadout', 'arena_intro'], ['arena_intro', 'wave_intro'], ['wave_intro', 'active'],
    ]) h.bus.emit('run:transitionRequested', { expectedPhase, nextPhase, tick: h.state.tick });
    h.bus.emit('run:awardRequested', { credits: 999, xp: 40, reason: 'arena_loot' });
    assert.equal(h.state.run.credits, 999, 'the existing run wallet still receives loot');
  }
  h.state.player.credits = 5000;
  econ.applyStockPressure(STATION, FOOD, 'buy', 20);
  h.bus.emit('freight:loss', {
    stationId: STATION, freighterKey: 'arena-cargo',
    manifest: { lines: [{ commodityId: FOOD, qty: 10 }] },
  });
  assert.ok(h.state.economy.coldChain[STATION], 'the actual cold-chain consequence remains');
  assert.notEqual(h.state.economy.markets[STATION][FOOD].stock, originalStock);
  h.bus.on('game:exitToMenu', () => { h.state.mode = 'menu'; });
  if (exit) {
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    await settlePacedSave();
  }
  const preserved = () => {
    assert.equal(store.storage.getItem('sf.save.auto'), original, 'Adventure bytes survive');
    assert.equal(store.storage.getItem('sf.save.index'), originalIndex, 'Continue keeps its Adventure card');
    const data = JSON.parse(store.storage.getItem('sf.save.auto')).data;
    assert.equal(data.player.credits, 4242);
    const foodRow = data.economy.markets[STATION].find(row => row[0] === FOOD);
    assert.equal(foodRow[1], originalStock, 'durable Adventure stock survives the arena loss');
    assert.equal(h.events('save:completed').length, completed, 'no arena save completes');
  };
  const blocked = async () => {
    assert.equal(save._campaignSaveSuppressed(), true);
    assert.equal(save.save('auto'), false);
    assert.equal(await save.saveAsync('quick'), false);
    h.bus.emit('game:save', { slot: 'auto' });
    assert.equal(save.requestExitAutosave(), false);
    assert.equal(save.exportSlot('missing'), null);
    assert.equal(await save.exportSlotAsync('missing'), null);
    assert.equal(save.exportSlot('auto'), original, 'exporting existing Adventure bytes stays legal');
    preserved();
  };
  return { ...h, store, econ, original, originalStock, preserved, blocked,
    close() { h.restore(); store.restore(); } };
}

for (const kind of ['survival', 'lab']) {
  test(`PRO-06: ${kind} Exit and later menu writes preserve Adventure bytes, credits and stock`, async () => {
    const h = await arcadeBoundary(kind);
    try {
      assert.equal(h.state.run.kind, 'adventure', 'the real runSession already cleared its envelope');
      assert.equal(h.state.run.phase, 'inactive');
      await h.blocked();
    } finally {
      h.close();
    }
  });
}

test('PRO-06: attempted/canceled New Game and failed/stale restore cannot release arcade protection', async () => {
  const h = await arcadeBoundary();
  try {
    h.bus.emit('game:new', { seed: 19 }); // canceled before the actual state reset
    h.bus.emit('game:newGame', { seed: 19 }); // even an alias alone cannot replace the bags
    await h.blocked();
    assert.equal(save.load('missing'), false);
    const invalid = JSON.parse(h.original);
    invalid.checksum = 'not-the-checksum';
    assert.equal(save.loadEnvelope(invalid, 'invalid'), false);
    const canceled = save._restore(JSON.parse(h.original).data, 'canceled', {
      acceptSeq: (save._restoreSequence || 0) - 1,
    });
    assert.equal(canceled.stale, true);
    h.bus.emit('save:restoring', { slot: 'attempt-only' });
    h.bus.emit('save:loaded', { slot: 'not-a-completed-restore' });
    await h.blocked();
  } finally { h.close(); }
});

for (const kind of ['survival', 'racing', 'venue', 'direct-venue']) {
test(`PRO-06: ${kind} late restore failure and rollback preserve session ownership`, async (t) => {
  const h = await arcadeBoundary(kind, { exit: kind === 'survival' });
  assert.equal(save._campaignSaveSuppressed(), true, 'the actual ownership flag initially protects state');
  const registryGet = h.registry.get.bind(h.registry);
  let fail = true;
  h.registry.get = name => name === 'physics' ? { completeRestore() {
    if (fail) { fail = false; throw new Error('injected failure after save:loaded'); }
  } } : registryGet(name);
  const oldError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    assert.equal(save.loadEnvelope(JSON.parse(h.original), 'auto'), false);
    assert.ok(h.events('save:loaded').length >= 2, 'target and rollback both reached the loaded event');
    assert.equal(h.events('save:error').at(-1)?.payload.rollback, 'restored');
    assert.equal(h.state.player.credits, 5000, 'rollback returned the live temporary player');
    assert.ok(h.state.economy.coldChain[STATION], 'rollback retained the real arena consequence');
    t.diagnostic(JSON.stringify({ kind, ephemeralRacing: save._ephemeralRacing,
      activeVenue: h.state.physicsVenue?.active === true, suppressed: save._campaignSaveSuppressed() }));
    assert.equal(errors.filter(([message]) => String(message).startsWith('[bus]')).length, 0,
      errors.map(args => args.map(value => value?.message || String(value)).join(' ')).join('\n'));
    if (kind === 'direct-venue') {
      assert.equal(h.state.physicsVenue, undefined, 'the real court owner cleaned up during restore');
      assert.equal(save._campaignSaveSuppressed(), false, 'the remaining state is the ongoing Adventure');
      assert.equal(save.save('after_court'), true);
      await save._lastSaveDurability;
      assert.equal(JSON.parse(h.store.storage.getItem('sf.save.after_court')).data.player.credits, 5000);
      assert.equal(h.store.storage.getItem('sf.save.auto'), h.original);
    } else await h.blocked();
  } finally { console.error = oldError; h.close(); }
});
}

for (const kind of ['survival', 'racing', 'venue']) {
test(`PRO-06: ${kind} successful campaign restore releases protection after owners finish restoring`, async () => {
  const h = await arcadeBoundary(kind);
  try {
    assert.equal(save.loadEnvelope(JSON.parse(h.original), 'auto'), true);
    assert.equal(save._campaignSaveSuppressed(), false);
    assert.equal(h.state.player.credits, 4242);
    assert.equal(h.state.economy.markets[STATION][FOOD].stock, h.originalStock);
    assert.deepEqual(h.state.economy.coldChain, {});
    h.state.mode = 'paused';
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    await settlePacedSave();
    assert.equal(h.events('save:completed').length, 2, 'ordinary Adventure Exit saves again');
  } finally { h.close(); }
});
}

for (const kind of ['survival', 'racing', 'venue']) {
test(`PRO-06: ${kind} production New Game releases protection only after campaign bags change`, async () => {
  const h = await arcadeBoundary(kind);
  try {
    h.bus.emit('game:new', { seed: 19 });
    assert.equal(save._campaignSaveSuppressed(), true);
    resetRunState(h.state, { seed: 19 });
    h.state.physicsVenueSession = false; // runNewGameSimBoot stamps this after resetRunState
    resetFreshRunSystems(h.registry);
    h.bus.emit('game:newGame', { seed: 19 });
    assert.equal(save._campaignSaveSuppressed(), false);
    h.state.mode = 'flight';
    assert.equal(save.requestAutosave('fresh_campaign', { force: true }), true,
      'ordinary Adventure autosave can schedule after the real reset');
    save._beginRunEpoch('test-cleanup');
  } finally { h.close(); }
});
}

test('PRO-06: an Adventure court can leave or travel without acquiring temporary-session quarantine', async () => {
  for (const event of ['orbital-gallery:leave', 'sector:exit']) {
    const h = await arcadeBoundary('direct-venue', { exit: false });
    try {
      assert.equal(save._ephemeralRacing, false);
      assert.equal(save._temporaryCampaignState, null);
      h.bus.emit(event, {});
      assert.equal(h.state.physicsVenue, undefined);
      assert.equal(save._campaignSaveSuppressed(), false);
      assert.equal(save.save('after_court'), true);
      await save._lastSaveDurability;
      assert.equal(JSON.parse(h.store.storage.getItem('sf.save.after_court')).data.player.credits, 5000);
      assert.equal(h.store.storage.getItem('sf.save.auto'), h.original);
    } finally { h.close(); }
  }
});

test('PRO-06: an inactive run does not block the exit save', async () => {
  const store = installStorage();
  const state = flightState();
  state.run = { kind: 'survival', phase: 'inactive' };
  const h = boot(state);
  try {
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    await settlePacedSave();
    assert.ok(store.storage.getItem('sf.save.auto'),
      'a finished run is ordinary campaign state again');
  } finally {
    h.restore();
    store.restore();
  }
});

test('PRO-06: a repeat exit request does not pay for a second full write', async () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    // The real route: main.js flips the mode on the same event, and its listener is installed
    // after the save system's, so the second request genuinely arrives already at the menu.
    h.bus.on('game:exitToMenu', () => { h.state.mode = 'menu'; });
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    await settlePacedSave();
    assert.equal(h.events('save:completed').length, 1, 'the first exit writes once');
    assert.equal(h.state.mode, 'menu');
    // A second exit request, arriving after the mode is already 'menu', must not write again.
    // (Two writes would differ only by their savedAt stamp, so the count is the honest probe.)
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    await settlePacedSave();
    assert.equal(h.events('save:completed').length, 1,
      'a repeat exit must not pay for a second full write');
    assert.equal(h.events('save:started').length, 1, 'and must not even start one');
  } finally {
    h.restore();
    store.restore();
  }
});

test('PRO-06: a queued autosave is dropped rather than paid for twice', async () => {
  const store = installStorage();
  const h = boot(flightState());
  try {
    // Stand in a pending autosave job, as a debounced trigger would leave it.
    save._autosavePending = { reason: 'interval', force: false, requestedAt: 0, runEpoch: save._runEpoch };
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    await settlePacedSave();
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
  const restore = () => { if (had) globalThis.window = prev; else delete globalThis.window; };
  try {
    const result = fn(fake);
    if (result && typeof result.then === 'function') return result.finally(restore);
    restore();
    return result;
  } catch (error) { restore(); throw error; }
}

for (const eventName of ['pagehide', 'beforeunload']) {
  test(`PRO-06: closing the tab (${eventName}) writes the session`, async () => {
    const store = installStorage();
    await withFakeWindow(async (fake) => {
      const h = boot(flightState());
      try {
        assert.ok(fake.types().includes(eventName),
          `the save system must listen for ${eventName}`);
        fake.fire(eventName);
        assert.ok(store.storage.getItem('sf.save.auto'),
          `a ${eventName} must not discard the session — this route used to save nothing`);
        // Local bytes are synchronous; save:completed follows durability settlement.
        await save._lastSaveDurability;
        assert.equal(h.events('save:completed').length, 1);
      } finally {
        h.restore();
      }
    });
    store.restore();
  });
}

test('PRO-06: quitting to the menu and then closing the tab writes once, not twice', async () => {
  const store = installStorage();
  const listeners = new Map();
  const fake = {
    addEventListener(type, handler) { (listeners.get(type) || listeners.set(type, []).get(type)).push(handler); },
    fire(type) { for (const fn of listeners.get(type) || []) fn(); },
  };
  const prevWindow = Object.hasOwn(globalThis, 'window') ? globalThis.window : undefined;
  globalThis.window = fake;
  const h = boot(flightState());
  try {
    h.bus.on('game:exitToMenu', () => { h.state.mode = 'menu'; });
    h.bus.emit('game:exitToMenu', { source: 'pause' });
    await settlePacedSave();
    fake.fire('pagehide');
    assert.equal(h.events('save:completed').length, 1,
      'the two session-end doors must not both pay for a full write');
  } finally {
    h.restore();
    if (prevWindow !== undefined) globalThis.window = prevWindow;
    else delete globalThis.window;
  }
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
  const store = installStorage();
  // `save` is the process-wide system singleton: the throwing serializer must not outlive this
  // test, or every later suite sharing the module (one-process runs) serializes into 'boom'.
  const hadOwnSerialize = Object.hasOwn(save, 'serialize');
  const prevSerialize = save.serialize;
  try {
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
        if (hadOwnSerialize) save.serialize = prevSerialize; else delete save.serialize;
        h.restore();
      }
    });
  } finally {
    store.restore();
  }
});
