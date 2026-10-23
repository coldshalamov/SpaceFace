// W2-A / O29 — Mail and world-clock history must survive Continue, and a watch is announced once.
//
// mail.js and worldClock.js have serialize()/deserialize(), but no save path called them: every
// Continue re-sent each due letter and re-announced the day's watch, market and festival lines.
// They ride the envelope now (data.mail, data.calendar), through both capture paths and the one
// restore chain. A second defect lived in worldClock: the watch announcement keyed on the world
// day while a berth's watches turn on its own offset clock, so a watch that straddled the world
// midnight was announced twice.
// Run: node --test test/w2a-mail-calendar-save.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { fnv1a } from '../src/save/checksum.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';
import { resetSharedPlayerStoreMemoForTests } from '../src/save/sharedPlayerStore.js';
import { mail as mailDefinition } from '../src/systems/mail.js';
import { worldClock as worldClockDefinition } from '../src/systems/worldClock.js';
import { MAIL_DAY_S, MAIL_LETTERS } from '../src/data/mail.js';
import { CAL_DAY_S, rushHourAt, stationShiftAt } from '../src/data/worldCalendar.js';
import { SECTORS } from '../src/data/sectors.js';

const HELIOS = 'station_helios';

function vec(x = 0, z = 0) {
  return {
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(other) { this.x = other.x || 0; this.y = other.y || 0; this.z = other.z || 0; return this; },
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
}

function installEnv(storage) {
  const previous = { localStorage: globalThis.localStorage, location: globalThis.location, fetch: globalThis.fetch };
  globalThis.localStorage = storage;
  globalThis.location = { protocol: 'http:', host: '127.0.0.1' };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ keys: {} }) });
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  };
}

function makeBus() {
  const handlers = new Map();
  return {
    emitted: [],
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {
        const list = handlers.get(name) || [];
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    },
    emit(name, payload = {}) {
      this.emitted.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
    off() {},
  };
}

// A live campaign with the REAL mail and worldClock owners behind a registry, the real
// createGameState, and the real restore chain; every other owner is absent (the save system
// skips an unregistered section).
function makeShell({ seed = 73, simTime = 0, docked = true } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.save.currentSlot = 'quick';
  state.meta.playtimeS = 31;
  state.simTime = simTime;
  state.tick = Math.floor(simTime * 60);
  state.world.currentSectorId = 'sector_helios_prime';
  state.ui.docked = docked;
  state.ui.dockedStationId = docked ? HELIOS : null;
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: vec(120, -35), vel: vec(8, -2), rot: 0.35, prevRot: 0.35,
    hull: 88, hullMax: 100, shield: 42, shieldMax: 50, cap: 12, capMax: 20, radius: 6,
    team: 0, factionId: 'faction_free', flags: {},
    data: { defId: 'ship_kestrel', weapons: [{ id: 'wpn_pulse_laser_s' }], fittings: [] },
  };
  state.playerId = player.id;
  state.nextEntityId = 2;
  state.entities.set(player.id, player);
  state.entityList.push(player);

  const bus = makeBus();
  const mail = Object.create(mailDefinition);
  mail.init({ state, bus });
  const worldClock = Object.create(worldClockDefinition);
  worldClock.init({ state, bus });

  const save = Object.create(saveDefinition);
  save.state = state;
  save.bus = bus;
  save.registry = { get(name) { return name === 'mail' ? mail : name === 'worldClock' ? worldClock : null; } };
  save.helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const spawned = {
        ...spec, id, alive: spec.alive !== false,
        pos: vec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        vel: vec(spec.vel && spec.vel.x, spec.vel && spec.vel.z),
        prevPos: vec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        prevRot: Number.isFinite(spec.rot) ? spec.rot : 0,
        flags: { ...(spec.flags || {}) },
        data: spec.data || {},
      };
      state.entities.set(id, spawned);
      state.entityList.push(spawned);
      return spawned;
    },
    getEntity(id) { return state.entities.get(id); },
    player() { return state.entities.get(state.playerId); },
  };
  save._restoring = false;
  save._pendingRunTransition = null;
  save._restoreSequence = 0;
  save._lastAutosaveAt = 0;
  save._lastAutosavePlaytime = 0;
  save._rollbackCaptureActive = false;
  save._rollbackInProgress = false;
  save._sharedStoreReady = false;
  save._sharedStoreMirrorHealthy = true;
  save._publishSharedStoreStatus();
  save._sharedStorePatch = null;
  save._sharedStoreFlushTimer = null;
  save._queueSharedStoreMirror = () => {};
  return { save, state, bus, mail, worldClock };
}

// One mail pass and one calendar pass at the shell's simTime.
function runOwners(shell) {
  shell.mail.update(MAIL_DAY_S, shell.state);
  shell.worldClock.update(0.5, shell.state);
}

const popupIds = (shell) => shell.bus.emitted.filter((e) => e.name === 'comms:popup').map((e) => e.payload.id);

// ── history rides the save ───────────────────────────────────────────────────────────────

test('delivered letters and spoken announcements survive Continue and do not repeat', () => {
  resetSharedPlayerStoreMemoForTests();
  const storage = memoryStorage();
  const restoreEnv = installEnv(storage);
  try {
    const first = makeShell({ simTime: 5 * MAIL_DAY_S + 40 });
    runOwners(first);
    const delivered = [...first.state.mail.delivered];
    const emitted = [...first.state.calendar.emitted];
    assert.ok(delivered.length > 0, 'the run has delivered letters');
    assert.ok(emitted.length > 0, 'the run has spoken announcements');

    const envelope = first.save.serialize('quick');
    assert.deepEqual(envelope.data.mail.delivered, delivered, 'the envelope carries the delivered letters');
    assert.ok(Array.isArray(envelope.data.mail.events));
    assert.deepEqual(envelope.data.calendar.emitted, emitted, 'the envelope carries the spoken announcements');
    storage.setItem('sf.save.quick', JSON.stringify(envelope));

    // Continue on a fresh boot: brand-new state, empty history.
    const second = makeShell({ seed: 9, simTime: 0 });
    assert.deepEqual(second.state.mail.delivered, []);
    assert.equal(second.save.load('quick'), true);
    assert.deepEqual(second.state.mail.delivered, delivered, 'delivered letters restored');
    assert.deepEqual(second.state.calendar.emitted, emitted, 'announcements restored');

    // The restored game ticks on: nothing already delivered or spoken is sent again.
    second.bus.emitted.length = 0;
    runOwners(second);
    assert.deepEqual(second.bus.emitted.filter((e) => e.name === 'mail:delivered'), [],
      'no letter repeats after Continue');
    assert.deepEqual(second.bus.emitted.filter((e) => e.name === 'comms:popup'), [],
      'no letter or watch line repeats after Continue');
    assert.deepEqual(second.bus.emitted.filter((e) => e.name === 'news:publish'), [],
      'no calendar headline repeats after Continue');
  } finally { restoreEnv(); }
});

test('without the fix path: a fresh game with no history does deliver the same letters (control)', () => {
  const control = makeShell({ simTime: 5 * MAIL_DAY_S + 40 });
  runOwners(control);
  const ids = control.bus.emitted.filter((e) => e.name === 'mail:delivered').map((e) => e.payload.id);
  assert.ok(ids.length > 0, 'letters are due at this time, so the no-repeat assertion above is meaningful');
  assert.ok(ids.every((id) => MAIL_LETTERS.some((l) => l.id === id)));
});

test('an older save with no mail/calendar sections starts a fresh log, never the outgoing run\'s', () => {
  resetSharedPlayerStoreMemoForTests();
  const storage = memoryStorage();
  const restoreEnv = installEnv(storage);
  try {
    const writer = makeShell({ simTime: 5 * MAIL_DAY_S + 40 });
    const data = writer.save.serializeData();
    delete data.mail;
    delete data.calendar;
    storage.setItem('sf.save.quick', JSON.stringify({
      fmt: 'spaceface-save', version: CURRENT_VERSION, savedAt: '2026-10-01T00:00:00.000Z',
      playtimeS: 31, slot: 'quick', checksum: fnv1a(JSON.stringify(data)), data,
    }));

    // The player is mid-run with their own history when they load the old save.
    const live = makeShell({ seed: 5, simTime: 7 * MAIL_DAY_S });
    runOwners(live);
    assert.ok(live.state.mail.delivered.length > 0);
    assert.ok(live.state.calendar.emitted.length > 0);
    assert.equal(live.save.load('quick'), true);
    assert.deepEqual(live.state.mail.delivered, [], 'the other run\'s letters do not bleed into the old save');
    assert.deepEqual(live.state.mail.events, []);
    assert.deepEqual(live.state.calendar.emitted, []);
  } finally { restoreEnv(); }
});

test('both capture paths write the sections in the same order after stationServices', () => {
  const shell = makeShell({ simTime: 5 * MAIL_DAY_S });
  const planKeys = shell.save._saveCapturePlan().map(([key]) => key);
  const dataKeys = Object.keys(shell.save.serializeData());
  for (const key of ['mail', 'calendar']) {
    assert.ok(planKeys.includes(key), `${key} is in the bounded-autosave capture plan`);
    assert.ok(dataKeys.includes(key), `${key} is in the synchronous capture`);
  }
  const shared = dataKeys.filter((k) => planKeys.includes(k));
  assert.deepEqual(planKeys.filter((k) => dataKeys.includes(k)), shared,
    'plan and steps agree on order: the envelope checksum is insertion-order sensitive');
  assert.ok(dataKeys.indexOf('stationServices') < dataKeys.indexOf('mail'));
  assert.equal(dataKeys.indexOf('calendar'), dataKeys.indexOf('mail') + 1);
});

// ── a watch is announced once per occurrence ─────────────────────────────────────────────

function clockAt(simTime, stationId = HELIOS) {
  const state = {
    meta: { seed: 5 },
    simTime,
    ui: { docked: true, dockedStationId: stationId },
    world: { currentSectorId: 'sector_helios_prime' },
    player: { stats: {} },
    factions: {},
    story: { beatIndex: 0, flags: {} },
    economy: {},
  };
  return state;
}

function newClock(state) {
  const bus = makeBus();
  const clock = Object.create(worldClockDefinition);
  clock.init({ state, bus });
  return { clock, bus };
}

const count = (bus, name) => bus.emitted.filter((e) => e.name === name).length;
const watchPopups = (bus) => bus.emitted.filter((e) => e.name === 'comms:popup' && /is on the floor/i.test(e.payload.text));

test('a watch that straddles the world midnight is announced exactly once (Helios 599.99 -> 600.01)', () => {
  const before = stationShiftAt(HELIOS, CAL_DAY_S - 0.01);
  const after = stationShiftAt(HELIOS, CAL_DAY_S + 0.01);
  assert.equal(before.index, 0, 'Helios is on first watch just before the world midnight');
  assert.equal(after.index, 0, 'and still on first watch just after it');
  assert.equal(before.watchDay, after.watchDay, 'it is one watch occurrence');

  const state = clockAt(CAL_DAY_S - 0.01);
  const { clock, bus } = newClock(state);
  clock.update(0.5, state);
  state.simTime = CAL_DAY_S + 0.01;
  clock.update(0.5, state);
  assert.equal(count(bus, 'calendar:shiftChanged'), 1, 'one shiftChanged event for one watch');
  assert.equal(watchPopups(bus).length, 1, 'the PA speaks the watch once');
  assert.equal(clock.state.calendar.emitted.filter((k) => k.startsWith('shift:')).length, 1);
});

test('the dedupe survives a save between the two ticks', () => {
  const state = clockAt(CAL_DAY_S - 0.01);
  const a = newClock(state);
  a.clock.update(0.5, state);
  const snapshot = a.clock.serialize();

  const resumed = clockAt(CAL_DAY_S + 0.01);
  const b = newClock(resumed);
  b.clock.deserialize(JSON.parse(JSON.stringify(snapshot)));
  b.clock.update(0.5, resumed);
  assert.equal(count(b.bus, 'calendar:shiftChanged'), 0, 'a restored clock does not re-announce the watch');
  assert.equal(watchPopups(b.bus).length, 0);
});

test('every real watch change still speaks, with its own popup id', () => {
  const state = clockAt(0);
  const { clock, bus } = newClock(state);
  // Walk three world days in 10 s steps: nine watches, each announced once.
  for (let t = 0; t <= 3 * CAL_DAY_S; t += 10) {
    state.simTime = t;
    clock.update(0.5, state);
  }
  const shifts = bus.emitted.filter((e) => e.name === 'calendar:shiftChanged');
  const occurrences = new Set(shifts.map((e) => `${e.payload.watchDay}:${e.payload.index}`));
  assert.equal(shifts.length, occurrences.size, 'no watch occurrence is announced twice');
  assert.ok(shifts.length >= 9 && shifts.length <= 11, `~3 watches a day over 3 days, saw ${shifts.length}`);
  const ids = watchPopups(bus).map((e) => e.payload.id);
  assert.equal(new Set(ids).size, ids.length, 'each watch popup carries its own id');
});

test('a rush window that straddles the world midnight fires once', () => {
  // Find a berth whose inbound/outbound rush window spans a world midnight inside one watch.
  const stations = SECTORS.flatMap((s) => (s.stations || []).map((st) => st.id));
  let pick = null;
  for (const id of stations) {
    for (let k = 1; k <= 3 && !pick; k++) {
      const m = k * CAL_DAY_S;
      const a = rushHourAt(id, m - 0.01);
      const b = rushHourAt(id, m + 0.01);
      const sa = stationShiftAt(id, m - 0.01);
      const sb = stationShiftAt(id, m + 0.01);
      if (a.active && b.active && a.kind === b.kind && sa.index === sb.index && sa.watchDay === sb.watchDay) {
        pick = { id, m };
      }
    }
    if (pick) break;
  }
  assert.ok(pick, 'the authored stations include a rush window across a world midnight');
  const state = clockAt(pick.m - 0.01, pick.id);
  const { clock, bus } = newClock(state);
  clock.update(0.5, state);
  state.simTime = pick.m + 0.01;
  clock.update(0.5, state);
  assert.equal(count(bus, 'calendar:rushHour'), 1, 'one rush window, one advisory');
  assert.equal(count(bus, 'calendar:shiftChanged'), 1, 'and one watch announcement');
});
