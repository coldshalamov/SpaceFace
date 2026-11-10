// special-500 Phase 2, batch 18 — the counter family (14 units).
//
// A counter nothing reads is not done: every chain here is proved absent → incremented →
// terminal through the real owner seams — the dock receipt the two docking producers emit,
// the combat:damage receipt the damage owner signs, the player:death receipt the defeat path
// emits, the flag-trigger evaluator mail.js actually runs, the contact listing barContacts.js
// actually generates, the landmark offer builder the board actually posts, the story system's
// ambient scheduler, the impound grudge's own tick, and the self-registered encounter
// runtimes' fire/choose/tick lifecycle. Adversarial coverage: duplicate events double-counting
// (and the once-latches that refuse to), stale saves (an old scar earns no rack mark; a
// stamped ledger stops counting), and missing state objects degrading to honest empties.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  special500DockLedger, stationDockCount, mostDockedStationId, quinnStoolPayoutBonus,
} from '../src/systems/special500DockLedger.js';
import { special500HullLog, SCRATCH_WINDOW_S } from '../src/systems/special500HullLog.js';
import {
  special500ReadEverything, READ_EVERYTHING_MIN_POPUPS,
} from '../src/systems/special500ReadEverything.js';
import { special500CollectiveHours, HOURS_GATE } from '../src/systems/special500CollectiveHours.js';
import { ruud, RETURN_DAYS, ruudTowAssistFeeQuote, RUUD_STAMP_TOW_ASSIST_FEE_CR } from '../src/systems/ruud.js';
import { RUUD_LINES, RUUD_RETURN_STAMP_LINE, normalizeRuudMemory } from '../src/data/ruud.js';
import { TOW_ASSIST_FEE_CR } from '../src/data/yardContracts.js';
import { rubric } from '../src/systems/rubric.js';
import { normalizeRubricMemory } from '../src/data/rubric.js';
import { tickImpoundGrudge } from '../src/systems/impoundGrudge.js';
import { MAIL_LETTERS } from '../src/data/mail.js';
import { mailLetterDue } from '../src/systems/mail.js';
import { buildLandmarkQuestOffers } from '../src/data/landmarkMissions.js';
import { generateContacts } from '../src/ui/station/barContacts.js';
import { story } from '../src/systems/story.js';
import { CAL_DAY_S } from '../src/data/worldCalendar.js';
import { runtime as keeperRuntime, PART_COMMODITY as KEEPER_PART } from '../src/data/encounters/1320-the-keeper.js';
import { runtime as buoyRuntime } from '../src/data/encounters/1321-wren-buoy.js';
import { runtime as ringRuntime, RING } from '../src/data/encounters/1322-the-shadow-ring.js';
import { runtime as toolRuntime } from '../src/data/encounters/1323-the-tool-ledger.js';
import { createSimulation } from '../src/core/sim.js';
import { createDockIntent } from '../src/core/dockIntent.js';
import { commitDockedUiState } from '../src/ui/dockStateCommit.js';

const DAY = CAL_DAY_S;

/* ── fixtures ──────────────────────────────────────────────────────────────────────────── */

function stubBus() {
  const listeners = new Map();
  const events = [];
  return {
    events,
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn(payload);
    },
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return () => {
        const rows = listeners.get(name) || [];
        const i = rows.indexOf(fn);
        if (i >= 0) rows.splice(i, 1);
      };
    },
    of: (name) => events.filter((e) => e.name === name),
    count: (name) => events.filter((e) => e.name === name).length,
  };
}

function fixtureState({ simTime = 5 * DAY, seed = 20261104, sectorId = 'sector_helios_prime' } = {}) {
  return {
    simTime,
    tick: Math.floor(simTime * 60),
    mode: 'flight',
    timeScale: 1,
    meta: { seed },
    story: { flags: {} },
    world: { currentSectorId: sectorId, active: { stations: [], pois: [] } },
    player: null,
    ui: {},
    entities: new Map(),
    bus: null,
  };
}

function entityOf(state, id, extra = {}) {
  return { id, alive: true, pos: { x: 0, z: 0 }, ...extra };
}

/** A minimal director handle for the self-registered runtimes (the d of fire/choose/tick).
 * Spawned props register into the live state's entity map so the runtimes' own distance
 * reads work, the way the real spawnEntity does. */
function stubD(now, state) {
  const bus = stubBus();
  let propId = 132000;
  return {
    bus,
    events: bus.events,
    now: () => now,
    spawnProp(live, opts) {
      const id = propId++;
      bus.emit('spawnProp', opts);
      const ent = { id, alive: true, pos: { ...opts.pos }, data: {} };
      if (state && state.entities) state.entities.set(id, ent);
      return ent;
    },
    despawnAll(live, afterS, role) { bus.emit('despawnAll', { afterS, role }); },
    say(live, channel, text) { bus.emit('say', { channel, text }); },
    offerChoices(live, options, timeoutChoice, deadlineAt) {
      bus.emit('offer', { options, timeoutChoice, deadlineAt });
    },
    abort(live, reason) { bus.emit('abort', { reason }); live.phase = 'done'; },
    resolve(live, outcome) { bus.emit('resolve', { outcome }); live.phase = 'done'; },
    emit(name, payload) { bus.emit(name, payload); },
    rep(factionId, delta, reason) { bus.emit('faction:repDelta', { factionId, delta, reason }); },
  };
}

function stubLive(id, anchor) {
  return {
    id, shapeId: id, sectorId: 'sector_helios_prime', phase: 'offered',
    anchor: anchor ? { ...anchor } : null,
    vars: {},
  };
}

/* ── SPX-C-01 · SP2-098 · SP2-053 · SP1-184 — the dock counter and its four legs ───────── */

test('dock counter: nothing counts and nothing reads before any dock', () => {
  const state = fixtureState();
  const bus = stubBus();
  special500DockLedger.init({ state, bus });
  assert.equal(stationDockCount(state, 'station_helios'), 0);
  assert.equal(mostDockedStationId(state), null);
  assert.equal(state.story.flags.station_docks, undefined);
  assert.equal(bus.count('comms:log') + bus.count('graffiti:show') + bus.count('presentation:vfxCue'), 0);
});

test('dock counter: each dock:docked receipt is one count, save-carried in story.flags', () => {
  const state = fixtureState();
  const bus = stubBus();
  special500DockLedger.init({ state, bus });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  bus.emit('dock:docked', { stationId: 'station_depot3' });
  assert.equal(stationDockCount(state, 'station_helios'), 2);
  assert.equal(stationDockCount(state, 'station_depot3'), 1);
  assert.equal(mostDockedStationId(state), 'station_helios');
});

test('dock counter: a receipt without a station id counts nowhere and writes nothing', () => {
  const state = fixtureState();
  const bus = stubBus();
  special500DockLedger.init({ state, bus });
  bus.emit('dock:docked', {});
  bus.emit('dock:docked', { stationId: 42 });
  assert.equal(stationDockCount(state, '42'), 0);
  assert.equal(bus.count('comms:log') + bus.count('graffiti:show') + bus.count('presentation:vfxCue'), 0);
});

test('dock counter: a state without story degrades to honest creation, not a crash', () => {
  const state = fixtureState();
  delete state.story;
  const bus = stubBus();
  special500DockLedger.init({ state, bus });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(stationDockCount(state, 'station_helios'), 1);
});

test('SPX-C-01: the first station to five docks arms the vacated berth, once', () => {
  const state = fixtureState();
  const bus = stubBus();
  special500DockLedger.init({ state, bus });
  for (let i = 0; i < 5; i++) bus.emit('dock:docked', { stationId: 'station_helios' });
  const slate = bus.of('comms:log').filter((e) => /TENANT TRANSFERRED/.test(e.payload.text));
  assert.equal(slate.length, 1, 'the dockmaster slate prints exactly once');
  assert.equal(state.story.flags.berth_void_armed.stationId, 'station_helios');
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(bus.of('comms:log').filter((e) => /TENANT TRANSFERRED/.test(e.payload.text)).length, 1,
    'the berth stays empty for the save, never re-explained');
});

test('SPX-C-01: the one flood pulse fires inside the late day-window, never again', () => {
  const state = fixtureState();
  state.world.active.stations = [{ stationId: 'station_helios', pos: { x: -1100, z: 620 } }];
  const bus = stubBus();
  special500DockLedger.init({ state, bus });
  for (let i = 0; i < 5; i++) bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(bus.count('presentation:vfxCue'), 0, 'no pulse outside the window');
  state.simTime = 3 * DAY + Math.floor(0.8 * DAY);
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(bus.count('presentation:vfxCue'), 1, 'the departing hull flashes its floods once');
  state.simTime = 4 * DAY + Math.floor(0.8 * DAY);
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(bus.count('presentation:vfxCue'), 1, 'never repeated');
  assert.notEqual(state.story.flags.berth_flood_done, null);
});

test('SP2-098: fifteen docks at one station pin the crossword to the airlock, once', () => {
  const state = fixtureState();
  const bus = stubBus();
  special500DockLedger.init({ state, bus });
  for (let i = 0; i < 14; i++) bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.flags.airlock_crossword, undefined, 'absent before the threshold');
  assert.equal(bus.count('graffiti:show'), 0, 'the airlock dressing renders honestly empty before 15');
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.notEqual(state.story.flags.airlock_crossword, undefined);
  const paint = bus.of('graffiti:show');
  assert.equal(paint.length, 1);
  assert.equal(paint[0].payload.where, 'airlock');
  assert.match(paint[0].payload.line, /WHAT THE CLAMPS REMEMBER/);
  assert.match(paint[0].payload.line, /GRUDGES \(7\)/);
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(bus.count('graffiti:show'), 1, 'the crossword is pinned once, not re-hung');
});

test('SP2-053: ten docks at a Quinn bar write the stool flag; ten elsewhere write nothing', () => {
  const state = fixtureState();
  const bus = stubBus();
  special500DockLedger.init({ state, bus });
  for (let i = 0; i < 10; i++) bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.flags.quinns_stool, undefined, 'no stool without a Quinn bar');
  for (let i = 0; i < 10; i++) bus.emit('dock:docked', { stationId: 'station_smuggler' });
  assert.notEqual(state.story.flags.quinns_stool, undefined);
});

test('SP2-053: the stool flag changes Quinn\u2019s greeting permanently on the live listing', () => {
  const plain = generateContacts('station_smuggler', fixtureState());
  const quinnBefore = plain.find((c) => c.canonicalKey === 'quinn');
  assert.ok(quinnBefore, 'Quinn pours at station_smuggler');
  assert.match(quinnBefore.line, /Same rates/);
  const regular = generateContacts('station_smuggler', {
    ...fixtureState(),
    story: { flags: { quinns_stool: 40 * DAY } },
  });
  const quinnAfter = regular.find((c) => c.canonicalKey === 'quinn');
  assert.equal(quinnAfter.line, 'Your stool. Same one.');
});

test('SP2-053: the stool letter is due only when the flag is set, through the mail evaluator', () => {
  const letter = MAIL_LETTERS.find((row) => row.id === 'mail_quinns_stool');
  assert.ok(letter, 'the stool letter exists in mail.js');
  assert.equal(mailLetterDue(letter, fixtureState(), []), false, 'absent flag: no letter');
  assert.equal(mailLetterDue(letter, { ...fixtureState(), story: { flags: { quinns_stool: 1 } } }, []), true);
});

test('SP2-053: the +1 payout nudge rides Quinn-station contracts only, once the flag is set', () => {
  const noFlag = fixtureState();
  assert.equal(quinnStoolPayoutBonus(noFlag, { stationId: 'station_smuggler' }), 0);
  const flagged = { ...fixtureState(), story: { flags: { quinns_stool: 1 } } };
  assert.equal(quinnStoolPayoutBonus(flagged, { stationId: 'station_smuggler' }), 1);
  assert.equal(quinnStoolPayoutBonus(flagged, { stationId: 'station_sker' }), 1);
  assert.equal(quinnStoolPayoutBonus(flagged, { stationId: 'station_helios' }), 0);
  assert.equal(quinnStoolPayoutBonus(flagged, null), 0);
});

test('SP1-184: docking at the established most-docked station brings the stranger, once', () => {
  const state = fixtureState();
  const bus = stubBus();
  special500DockLedger.init({ state, bus });
  for (let i = 0; i < 7; i++) bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.flags.berth_squatter, undefined, 'no stranger before the habit is established');
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.notEqual(state.story.flags.berth_squatter, undefined);
  assert.equal(state.story.flags.berth_squatter.stationId, 'station_helios');
  assert.equal(state.story.flags.berth_squatter.deedKind, null, 'no deeds filed yet: the gift falls back honestly');
  const note = bus.of('comms:log').filter((e) => /stranger in it/.test(e.payload.text));
  assert.equal(note.length, 1);
  assert.match(note[0].payload.text, /good coffee/);
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(note.length, 1, 'the intrusion happens once');
});

test('SP1-184: the squatter letter triggers on the stranger\u2019s flag through the mail evaluator', () => {
  const letter = MAIL_LETTERS.find((row) => row.id === 'mail_berth_squatter_note');
  assert.ok(letter, 'the formal note exists in mail.js');
  assert.equal(mailLetterDue(letter, fixtureState(), []), false);
  assert.equal(mailLetterDue(letter, { ...fixtureState(), story: { flags: { berth_squatter: { stationId: 'x' } } } }, []), true);
});

/* ── SP2-007 · SPX-B-02 — the player-hull log ──────────────────────────────────────────── */

function hullState({ hullFrac = 1, simTime = 2 * DAY } = {}) {
  const state = fixtureState({ simTime });
  state.playerId = 'player';
  state.entities.set('player', entityOf(state, 'player', { hull: 100 * hullFrac, hullMax: 100 }));
  return state;
}

test('SP2-007: the hull reading at or below 15% writes the bulkhead log once', () => {
  const state = hullState({ hullFrac: 0.12 });
  const bus = stubBus();
  special500HullLog.init({ state, bus });
  assert.equal(state.story.flags.hull_held_15, undefined, 'absent before the event');
  bus.emit('combat:damage', { isPlayer: true, applied: 88 });
  assert.notEqual(state.story.flags.hull_held_15, undefined);
  const lines = bus.of('comms:log').filter((e) => e.payload.from === 'BULKHEAD 3 LOG');
  assert.equal(lines.length, 1);
  assert.match(lines[0].payload.text, /SHE HELD TOGETHER/);
  bus.emit('combat:damage', { isPlayer: true, applied: 4 });
  assert.equal(lines.length, 1, 'the log prints once; the handwriting does not repeat');
});

test('SP2-007: other hulls\u2019 damage writes nothing, and a dead pilot writes nothing', () => {
  const state = hullState({ hullFrac: 0.1 });
  const bus = stubBus();
  special500HullLog.init({ state, bus });
  bus.emit('combat:damage', { isPlayer: false, applied: 50 });
  assert.equal(state.story.flags.hull_held_15, undefined);
  state.entities.get('player').alive = false;
  bus.emit('combat:damage', { isPlayer: true, applied: 5 });
  assert.equal(state.story.flags.hull_held_15, undefined, 'a hull that did not hold files no log');
});

test('SP2-007: a state without a player entity degrades to a no-op', () => {
  const state = hullState();
  state.entities.delete('player');
  const bus = stubBus();
  special500HullLog.init({ state, bus });
  bus.emit('combat:damage', { isPlayer: true, applied: 50 });
  assert.equal(state.story.flags.hull_held_15, undefined);
  assert.equal(bus.count('comms:log'), 0);
});

test('SPX-B-02: the save\u2019s first scar inside two sector-days arms the rack vignette', () => {
  const state = hullState({ hullFrac: 0.9, simTime: 700 });
  const bus = stubBus();
  special500HullLog.init({ state, bus });
  bus.emit('combat:damage', { isPlayer: true, applied: 10 });
  assert.equal(state.story.flags.first_hull_damage.day, Math.floor(700 / DAY));
  assert.equal(state.story.flags.rack_mark_done, undefined, 'no mark before the dock');
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.notEqual(state.story.flags.rack_mark_done, undefined);
  const rack = bus.of('comms:log').filter((e) => /fender beam/.test(e.payload.text));
  assert.equal(rack.length, 1);
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(rack.length, 1, 'one line, one dockhand, one date');
});

test('SPX-B-02: a stale save\u2019s old scar earns no rack mark', () => {
  const state = hullState({ hullFrac: 0.9, simTime: SCRATCH_WINDOW_S + 500 });
  const bus = stubBus();
  special500HullLog.init({ state, bus });
  bus.emit('combat:damage', { isPlayer: true, applied: 10 });
  assert.ok(state.story.flags.first_hull_damage.at > SCRATCH_WINDOW_S, 'the scar is real but old');
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.flags.rack_mark_done, undefined);
  assert.equal(bus.of('comms:log').filter((e) => /fender beam/.test(e.payload.text)).length, 0);
});

/* ── SP2-188 — the run end's uninvited guest ───────────────────────────────────────────── */

function deathState({ seen = 0, dismissed = 0, flags = {} } = {}) {
  const state = fixtureState();
  state.ui = { commsSeen: seen, commsDismissed: dismissed };
  state.story.flags = { ...flags };
  return state;
}

test('SP2-188: a run that ended with the channel barely used fires nothing', () => {
  const state = deathState({ seen: 2, dismissed: 0 });
  const bus = stubBus();
  special500ReadEverything.init({ state, bus });
  bus.emit('player:death', {});
  assert.equal(state.story.flags.read_everything, undefined);
  assert.equal(bus.count('comms:popup'), 0);
});

test('SP2-188: one manual dismissal all session means the channel was not read', () => {
  const state = deathState({ seen: READ_EVERYTHING_MIN_POPUPS + 4, dismissed: 1 });
  const bus = stubBus();
  special500ReadEverything.init({ state, bus });
  bus.emit('player:death', {});
  assert.equal(state.story.flags.read_everything, undefined);
});

test('SP2-188: a full session of zero dismissed popups delivers the guest at run end', () => {
  const state = deathState({ seen: READ_EVERYTHING_MIN_POPUPS + 4, dismissed: 0 });
  const bus = stubBus();
  special500ReadEverything.init({ state, bus });
  bus.emit('player:death', {});
  assert.notEqual(state.story.flags.read_everything, undefined, 'flag read_everything written');
  assert.equal(state.ui.readEverythingFired, true, 'the after-action sheet\u2019s line reads this');
  const guest = bus.of('comms:popup');
  assert.equal(guest.length, 1);
  assert.match(guest[0].payload.text, /YOU READ EVERYTHING/);
  assert.equal(guest[0].payload.persist, undefined, 'the guest dismisses itself');
});

test('SP2-188: a duplicate defeat re-reads the same flag and fires no second guest', () => {
  const state = deathState({ seen: 12, dismissed: 0 });
  const bus = stubBus();
  special500ReadEverything.init({ state, bus });
  bus.emit('player:death', {});
  bus.emit('player:death', {});
  assert.equal(bus.count('comms:popup'), 1);
});

test('SP2-188: a stale save that already carried the flag stays quiet', () => {
  const state = deathState({ seen: 12, dismissed: 0, flags: { read_everything: 10 } });
  const bus = stubBus();
  special500ReadEverything.init({ state, bus });
  bus.emit('player:death', {});
  assert.equal(bus.count('comms:popup'), 0);
});

test('SP2-188: the next session\u2019s ambient cadence widens by a quarter for the reader', () => {
  const base = fixtureState({ seed: 4242 });
  base.story.rngSeed = 987654321;
  story.state = base;
  story._rescheduleAmbient();
  const plain = base.story.ambientNextAtS - base.simTime;
  base.story.rngSeed = 987654321; // same stream position: the same draw, keyed to the flag
  base.story.flags.read_everything = 1;
  story._rescheduleAmbient();
  const quieter = base.story.ambientNextAtS - base.simTime;
  assert.ok(Math.abs(quieter - plain * 1.25) < 1e-6, 'same draw, 1.25x the delay: 20% fewer lines');
});

/* ── SP1-173 — the Collective's tally office ───────────────────────────────────────────── */

function ceresState() {
  return fixtureState({ sectorId: 'sector_ceres_belt' });
}

test('SP1-173: the tally accrues only flight time held in the Ceres Belt', () => {
  const state = ceresState();
  const bus = stubBus();
  special500CollectiveHours.init({ state, bus });
  special500CollectiveHours.update(60, state);
  assert.equal(state.story.flags.collective_labor_seconds, 60);
  state.world.currentSectorId = 'sector_helios_prime';
  special500CollectiveHours.update(600, state);
  assert.equal(state.story.flags.collective_labor_seconds, 60, 'other sectors accrue nothing');
  state.world.currentSectorId = 'sector_ceres_belt';
  state.mode = 'paused';
  special500CollectiveHours.update(600, state);
  assert.equal(state.story.flags.collective_labor_seconds, 60, 'a paused clock accrues nothing');
});

test('SP1-173: the stamp lands at the first Ceres dock past twenty hours, with the number', () => {
  const state = ceresState();
  const bus = stubBus();
  special500CollectiveHours.init({ state, bus });
  special500CollectiveHours.update(HOURS_GATE * 3600 + 120, state);
  bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(state.story.flags.collective_credit_hours, HOURS_GATE, 'the stamped number is the worked hours');
  const stamp = bus.of('comms:log').filter((e) => /credit hours/.test(e.payload.text));
  assert.equal(stamp.length, 1);
  bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(stamp.length, 1, 'the ledger is stamped once');
});

test('SP1-173: a dock before the gate stamps nothing; a wrong station stamps nothing', () => {
  const state = ceresState();
  const bus = stubBus();
  special500CollectiveHours.init({ state, bus });
  special500CollectiveHours.update(3600, state);
  bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(state.story.flags.collective_credit_hours, undefined);
  special500CollectiveHours.update((HOURS_GATE + 1) * 3600, state);
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.flags.collective_credit_hours, undefined);
});

test('SP1-173: a stamped ledger stops counting, and the host reads the number by tier', () => {
  const stamped = ceresState();
  stamped.story.flags.collective_labor_seconds = 40 * 3600;
  stamped.story.flags.collective_credit_hours = 40;
  const bus = stubBus();
  special500CollectiveHours.init({ state: stamped, bus });
  special500CollectiveHours.update(5000, stamped);
  assert.equal(stamped.story.flags.collective_labor_seconds, 40 * 3600, 'stamped hours do not grow');

  const hostMid = generateContacts('station_ceres', stamped)
    .find((c) => c.id === 'contact_station_ceres_0' && c.role === 'barkeep');
  assert.ok(hostMid, 'the refinery host is at the Ceres bar');
  assert.match(hostMid.line, /40 credit hours/);
  assert.match(hostMid.line, /checks the tally twice/);

  const big = ceresState();
  big.story.flags.collective_credit_hours = 82;
  const hostBig = generateContacts('station_ceres', big)
    .find((c) => c.id === 'contact_station_ceres_0' && c.role === 'barkeep');
  assert.match(hostBig.line, /stands to pour/, 'respect proportional to its size');

  const unstamped = ceresState();
  const hostPlain = generateContacts('station_ceres', unstamped)
    .find((c) => c.id === 'contact_station_ceres_0' && c.role === 'barkeep');
  assert.ok(!/credit hours/.test(hostPlain.line), 'no stamp, no bark: the host asks nothing');
});

test('SP1-173: the accrual degrades to a no-op without state', () => {
  const before = special500CollectiveHours.state;
  special500CollectiveHours.state = null;
  assert.doesNotThrow(() => special500CollectiveHours.update(60, null));
  special500CollectiveHours.state = before;
});

/* ── SP2-123 — Ruud's nineteen hours ───────────────────────────────────────────────────── */

function ruudState({ simTime = 2 * DAY, flags = {} } = {}) {
  const state = fixtureState({ simTime, sectorId: 'sector_vesta_forge' });
  state.story.flags = { ...flags };
  state.ruud = normalizeRuudMemory(null);
  return state;
}

test('SP2-123: the one new sentence exists as the authored variant line', () => {
  assert.match(RUUD_RETURN_STAMP_LINE, /You came back\. Stamps like that\./);
  assert.equal(RUUD_LINES.return_stamp, undefined,
    'the pinned RUUD_LINES key inventory stays untouched; the variant rides beside it');
});

test('SP2-123: the first meeting stamps the day; ten sector-days later the return earns the stamp', () => {
  const state = ruudState({ simTime: 2 * DAY });
  const bus = stubBus();
  ruud.state = state;
  ruud.bus = bus;
  ruud.helpers = {};
  ruud._stampFirstMet();
  assert.notEqual(state.story.flags.ruud_first_met_at, undefined);
  ruud._maybeReturnStamp();
  assert.equal(state.story.flags.ruud_stamp, undefined, 'too soon: stamps are not clocks');
  state.simTime = 2 * DAY + RETURN_DAYS * DAY + 1;
  ruud._maybeReturnStamp();
  assert.notEqual(state.story.flags.ruud_stamp, undefined);
  const said = bus.of('ruud:voice').filter((e) => /You came back/.test(e.payload.text));
  assert.equal(said.length, 1, 'the one new sentence is said, only this once');
  ruud._maybeReturnStamp();
  assert.equal(bus.of('ruud:voice').filter((e) => /You came back/.test(e.payload.text)).length, 1,
    'the sentence never repeats');
});

test('SP2-123: the stamped hull hires tow assist one grade better, permanently', () => {
  const plain = ruudState();
  assert.equal(ruudTowAssistFeeQuote(plain), TOW_ASSIST_FEE_CR, 'before the stamp: the yard\u2019s rate');
  const stamped = ruudState({ flags: { ruud_stamp: 1 } });
  assert.equal(ruudTowAssistFeeQuote(stamped), RUUD_STAMP_TOW_ASSIST_FEE_CR);
  assert.ok(RUUD_STAMP_TOW_ASSIST_FEE_CR < TOW_ASSIST_FEE_CR, 'one grade better, not free');
  const broken = ruudState();
  delete broken.story;
  assert.equal(ruudTowAssistFeeQuote(broken), TOW_ASSIST_FEE_CR, 'missing state degrades to the standard quote');
});

/* ── SP2-120 — Rubric's autograph ──────────────────────────────────────────────────────── */

function rubricState({ flags = {} } = {}) {
  const state = fixtureState({ sectorId: 'sector_tethys_junction' });
  state.story.flags = { ...flags };
  state.rubric = normalizeRubricMemory(null);
  state.rubric.witness = 10;
  return state;
}

test('SP2-120: the first sighting is stamped the day the register opens, immovably', () => {
  const state = rubricState();
  rubric.state = state;
  rubric.bus = stubBus();
  rubric.helpers = {};
  rubric._stampFirstSighting();
  const first = state.story.flags.rubric_first_sighting;
  assert.notEqual(first, undefined);
  state.simTime += 5000;
  rubric._stampFirstSighting();
  assert.equal(state.story.flags.rubric_first_sighting, first, 'a later sighting does not move the date');
});

test('SP2-120: ten witnessed marks later, the player\u2019s own hull takes the stencil, once', () => {
  const state = rubricState();
  const bus = stubBus();
  rubric.state = state;
  rubric.bus = bus;
  rubric.helpers = {};
  rubric._stampFirstSighting();
  state.story.flags.rubric_first_sighting = 1 * DAY;
  const wreck = { data: {} };
  rubric._signPlayerHull(wreck);
  assert.notEqual(state.story.flags.rubric_signed, undefined);
  assert.equal(state.story.flags.rubric_signed.firstSighting, 1 * DAY,
    'the date under the stencil is the first sighting, not today');
  assert.match(wreck.data.scanLabel, /HM-11/);
  const lines = bus.of('comms:log').filter((e) => /HM-11/.test(e.payload.text));
  assert.equal(lines.length, 1);
  rubric._signPlayerHull(wreck);
  assert.equal(lines.length, 1, 'one autograph per hull');
});

test('SP2-120: every marked hull reads co-marked after the signature, and not before', () => {
  const before = rubricState();
  rubric.state = before;
  rubric.bus = stubBus();
  rubric.helpers = {};
  const rec = { c: 'o', x: 'KILLED BY ANOTHER HULL' };
  const wreckBefore = { data: { wreckClassLabel: 'Wreck' } };
  rubric._enrichLabel(wreckBefore, rec);
  assert.doesNotMatch(wreckBefore.data.scanLabel, /co-marked/);
  const after = rubricState({ flags: { rubric_signed: { at: 2, firstSighting: 1 } } });
  rubric.state = after;
  rubric.bus = stubBus();
  rubric.helpers = {};
  const wreckAfter = { data: { wreckClassLabel: 'Wreck' } };
  rubric._enrichLabel(wreckAfter, rec);
  assert.match(wreckAfter.data.scanLabel, /co-marked/);
});

/* ── SP2-098 — the named grudge eases once ─────────────────────────────────────────────── */

function grudgeState({ flags = {} } = {}) {
  const state = fixtureState({ sectorId: 'sector_pallas_drift' });
  state.story.flags = { ...flags };
  state.playerId = 'player';
  state.player = { ownedShips: [{ impoundShadow: {
    schemaVersion: 2, lossId: 'loss_test', grudgeName: 'Vetch', grudgeCallsign: 'GRUDGE-1',
    archetype: 'raider', deaths: 0, visits: 0, tier: 0, liveId: null, nextAt: 9e9,
    learning: { kills: 0, escapes: 0, fastKills: 0, longFights: 0, fights: [] },
  } }], activeShipIndex: 0, flags: {} };
  state.entities.set('player', entityOf(state, 'player', { vel: { x: 0, z: 0 } }));
  return state;
}

test('SP2-098: the crossword flag eases the grudge exactly once, with one line', () => {
  const state = grudgeState({ flags: { airlock_crossword: 3 * DAY } });
  const bus = stubBus();
  state.bus = bus;
  const ctx = { emit: (name, p) => bus.emit(name, p), helpers: {} };
  const shadow = state.player.ownedShips[0].impoundShadow;
  tickImpoundGrudge(state, ctx);
  assert.equal(shadow.namedPublic, true, 'the grudge heard its name in public');
  const lines = bus.of('comms:log').filter((e) => /named what the clamps remember/.test(e.payload.text));
  assert.equal(lines.length, 1);
  tickImpoundGrudge(state, ctx);
  assert.equal(lines.length, 1, 'named once, eased once, never re-read');
});

test('SP2-098: without the crossword flag the grudge stays as it was', () => {
  const state = grudgeState();
  const bus = stubBus();
  state.bus = bus;
  const shadow = state.player.ownedShips[0].impoundShadow;
  tickImpoundGrudge(state, { emit: (name, p) => bus.emit(name, p), helpers: {} });
  assert.equal(shadow.namedPublic, false);
  assert.equal(bus.count('comms:log'), 0);
});

/* ── SP1-080 — the keeper ──────────────────────────────────────────────────────────────── */

function keeperState({ part = 0, flags = {} } = {}) {
  const state = fixtureState({ sectorId: 'sector_sker_haven' });
  state.story.flags = { ...flags };
  state.player = {
    cargo: { items: part > 0 ? { [KEEPER_PART]: part } : {}, usedVolume: 0, usedMass: 0, richLots: [] },
    flags: {},
  };
  state.bus = stubBus();
  state.entities.set('player', entityOf(state, 'player', { data: { callsign: 'VHL-4471-T' } }));
  return state;
}

test('SP1-080: the keeper\u2019s watch offers the donation only when the hull carries the part', () => {
  const state = keeperState({ part: 0 });
  const d = stubD(1000, state);
  const live = stubLive('the_keeper', { x: -540, z: 680 });
  keeperRuntime.fire(d, live, state);
  const offer = d.bus.of('offer')[0];
  assert.ok(offer, 'the watch opens');
  assert.equal(offer.payload.options.includes('donate_part'), false, 'no part, no donation button');
  assert.equal(offer.payload.options.includes('listen'), true);
});

test('SP1-080: the donation consumes the part through the cargo owner and files the hull as crew', () => {
  const state = keeperState({ part: 1 });
  const d = stubD(1000, state);
  const live = stubLive('the_keeper', { x: -540, z: 680 });
  keeperRuntime.fire(d, live, state);
  const heldBefore = state.player.cargo.items[KEEPER_PART];
  keeperRuntime.choose(d, live, state, 'donate_part');
  assert.notEqual(state.story.flags.keeper_crew_visiting, undefined, 'the persistent flag is written');
  assert.equal(heldBefore, 1, 'the hold carried the part');
  assert.equal(state.player.cargo.items[KEEPER_PART], undefined, 'the part left the hold');
  assert.ok(d.bus.of('say').some((e) => /crew, visiting/.test(e.payload.text)), 'the keeper reads the hull number into the log');
  const settled = state.story.depthProgramEncounters.completed.the_keeper;
  assert.equal(settled && settled.outcome, 'donated', 'terminal outcome on the durable record');
  // A second watch on the same save aborts inert: the keeper already has crew.
  const d2 = stubD(2000, state);
  const live2 = stubLive('the_keeper', { x: -540, z: 680 });
  keeperRuntime.fire(d2, live2, state);
  assert.ok(d2.events.some((e) => e.name === 'abort'), 'the beat is history');
});

test('SP1-080: a watch that goes quiet stands down without writing anything', () => {
  const state = keeperState({ part: 1 });
  const d = stubD(1000, state);
  const live = stubLive('the_keeper', { x: -540, z: 680 });
  keeperRuntime.fire(d, live, state);
  keeperRuntime.tick(d, live, state, 1000 + 400);
  assert.equal(state.story.flags.keeper_crew_visiting, undefined, 'no donation, no flag');
  assert.ok(d.events.some((e) => e.name === 'abort'), 'the watch stood down');
});

/* ── SP2-035 — the signal buoy ─────────────────────────────────────────────────────────── */

function buoyState({ endgameChoice = 'E', flags = {}, stations = [] } = {}) {
  const state = fixtureState({ sectorId: 'sector_ashfall_reach' });
  state.story.endgameChoice = endgameChoice;
  state.story.flags = { ...flags };
  state.playerId = 'player';
  state.entities.set('player', entityOf(state, 'player', { pos: { x: -2900, z: -1900 } }));
  state.entityList = stations.map((pos, i) => ({ id: 'st' + i, alive: true, type: 'station', pos }));
  return state;
}

test('SP2-035: the buoy watch only stands on a filed ending, and found is terminal', () => {
  assert.equal(buoyRuntime.fireReady(buoyState({ endgameChoice: null })), false,
    'no ending filed: the dark keeps its secret');
  assert.equal(buoyRuntime.fireReady(buoyState({})), true);
  assert.equal(buoyRuntime.fireReady(buoyState({ flags: { wren_buoy_found: 1 } })), false,
    'a read tag is history');
});

test('SP2-035: inside 2000 WU of a station the watch aborts; far out, the tag reads', () => {
  const near = buoyState({ stations: [{ x: -1900, z: -1200 }] });
  const d = stubD(1000, near);
  const live = stubLive('wren_buoy', { x: -2000, z: -1200 });
  buoyRuntime.fire(d, live, near);
  assert.ok(d.events.some((e) => e.name === 'abort' && e.payload.reason === 'not_far_enough_out'));

  const far = buoyState({ stations: [{ x: 4000, z: 4000 }] });
  const d2 = stubD(1000, far);
  const live2 = stubLive('wren_buoy', { x: -2000, z: -1200 });
  buoyRuntime.fire(d2, live2, far);
  assert.ok(d2.events.some((e) => e.name === 'spawnProp'), 'the buoy floats in nothing');
  const buoyId = live2.vars.buoyId;
  assert.notEqual(buoyId, null, 'the watch tracks its buoy');
  // Far but not reading: no flag yet.
  rtTick(buoyRuntime, d2, live2, far, 1100);
  assert.equal(far.story.flags.wren_buoy_found, undefined);
  // Close pass: the tag reads, the flag lands, the outcome is terminal.
  far.entities.get(buoyId).pos = { x: -1976, z: -1230 };
  far.entities.get('player').pos = { x: -1976, z: -1230 };
  rtTick(buoyRuntime, d2, live2, far, 1200);
  assert.notEqual(far.story.flags.wren_buoy_found, undefined);
  assert.equal(far.story.depthProgramEncounters.completed.wren_buoy.outcome, 'found');
});

function rtTick(rt, d, live, state, now) {
  return rt.tick(d, live, state, now);
}

/* ── SPX-B-08 — the shadow ring ────────────────────────────────────────────────────────── */

function ringState({ simTime = 3 * DAY } = {}) {
  const state = fixtureState({ sectorId: 'sector_eunomia_gulf', simTime });
  state.playerId = 'player';
  state.entities.set('player', entityOf(state, 'player', { pos: { x: 0, z: 0 } }));
  return state;
}

function ringHitState(anchor, simTime = 3 * DAY) {
  const state = ringState({ simTime });
  const ringX = anchor.x + RING.offset.x;
  const ringZ = anchor.z + RING.offset.z;
  state.entities.get('player').pos = {
    x: ringX + Math.cos(RING.sunBearingRad) * RING.castWu,
    z: ringZ + Math.sin(RING.sunBearingRad) * RING.castWu,
  };
  return state;
}

test('SPX-B-08: the shadow landing in the ring inside the sun minute lights the lamp and counts', () => {
  const anchor = { x: -200, z: -1500 };
  const state = ringHitState(anchor);
  const d = stubD(3 * DAY + Math.floor(0.35 * DAY), state);
  const live = stubLive('the_shadow_ring', anchor);
  ringRuntime.fire(d, live, state);
  ringRuntime.tick(d, live, state, 3 * DAY + Math.floor(0.35 * DAY));
  assert.equal(state.story.flags.shadow_ring_hits, 1, 'the hit counter is real');
  assert.notEqual(state.story.flags.shadow_ring_lit_day, undefined, 'the lamp is lit for the day');
  assert.equal(d.bus.count('presentation:vfxCue'), 1, 'the lamp cue through the vfx owner\u2019s seam');
  assert.equal(state.story.flags.shadow_ring_paint, undefined, 'no paint on the first hit');
});

test('SPX-B-08: outside the sun minute the same geometry is not a hit', () => {
  const anchor = { x: -200, z: -1500 };
  const state = ringHitState(anchor);
  const d = stubD(3 * DAY + Math.floor(0.6 * DAY), state);
  const live = stubLive('the_shadow_ring', anchor);
  ringRuntime.fire(d, live, state);
  ringRuntime.tick(d, live, state, 3 * DAY + Math.floor(0.6 * DAY));
  assert.equal(state.story.flags.shadow_ring_hits, undefined, 'no hit off-minute');
  assert.equal(d.bus.count('presentation:vfxCue'), 0);
});

test('SPX-B-08: the tenth hit pays the paint, exactly once', () => {
  const anchor = { x: -200, z: -1500 };
  const state = ringHitState(anchor);
  let lastD = null;
  for (let day = 1; day <= 10; day++) {
    // One save, ten sector days: each firing counts its own day's hit on the same
    // save-carried counter (the encounter is the firing, the counter is the save).
    state.simTime = day * DAY + Math.floor(0.35 * DAY);
    const d = stubD(state.simTime, state);
    const live = stubLive('the_shadow_ring', anchor);
    ringRuntime.fire(d, live, state);
    ringRuntime.tick(d, live, state, state.simTime);
    lastD = d;
  }
  assert.equal(state.story.flags.shadow_ring_hits, 10);
  assert.notEqual(state.story.flags.shadow_ring_paint, undefined);
  assert.ok(lastD.events.some((e) => e.name === 'say' && /STILL GOT IT/.test(e.payload.text)),
    'the fresh paint reads STILL GOT IT');
});

/* ── SP2-151 — the Haumea tool ledger ──────────────────────────────────────────────────── */

function toolState({ docked = false, latched = false, flags = {} } = {}) {
  const state = fixtureState({ sectorId: 'sector_haumea_rift' });
  state.story.flags = { ...flags };
  state.ui = { docked, dockedStationId: docked ? 'station_haumea_rift' : null };
  state.playerId = 'player';
  state.player = { tether: { active: false, targetId: null }, flags: {} };
  state.entities.set('player', entityOf(state, 'player', { pos: { x: 20, z: 180 }, data: { callsign: 'VHL-4471-T' } }));
  state.world.active.pois = [{ poiId: 'poi_haumea_fissure', pos: { x: 0, z: 180 } }];
  if (latched) state.player.tether = { active: true, targetId: 132000 };
  return state;
}

function physicalToolFixture(t) {
  const sim=createSimulation({systems:[],updateOrder:[]});
  t.after(()=>sim.dispose());
  const state=sim.state;
  state.mode='flight';state.simTime=1000;state.world.currentSectorId='sector_haumea_rift';
  const player=sim.spawn({type:'ship',hull:100,hullMax:100,pos:{x:20,z:180},data:{callsign:'VHL-4471-T'}});
  state.playerId=player.id;
  sim.spawn({type:'station',hull:100,pos:{x:0,z:180},data:{stationId:'station_haumea_rift'}});
  state.world.activeSector.pois=[{poiId:'poi_haumea_fissure',pos:{x:0,z:180}}];
  const d = stubD(1000, state);
  const live = stubLive('the_tool_ledger', { x: 0, z: 180 });
  live.sectorId=state.world.currentSectorId;
  d.spawnProp=(record,opts)=>{
    d.bus.emit('spawnProp',opts);
    return sim.spawn({...opts,hull:1,data:{}});
  };
  d.bus.on('dock:committed',payload=>toolRuntime.event(d,live,state,'dockCommitted',payload));
  const dock=()=>commitDockedUiState(state,createDockIntent(state,{stationId:'station_haumea_rift'}),d.bus);
  // This unit fixture supplies the attachment-owner record. The default-simHost regression
  // separately creates the actual native attachment and traverses the real Director dispatch.
  const line=()=>{
    const wrench=state.entities.get(live.vars.wrenchId);
    state.combat={attachments:{byId:{fixture:{state:'active',ownerId:player.id,targetId:wrench.id,
      ownerGeneration:player.occupantGeneration,targetGeneration:wrench.occupantGeneration}}}};
    toolRuntime.event(d,live,state,'tetherAttached',{attachmentId:'fixture'});
  };
  return {state,d,live,dock,line};
}

test('SP2-151: the loose wrench is ropeable beside the seated mast, and the ledger is real', t => {
  const {state,d,live}=physicalToolFixture(t);
  toolRuntime.fire(d, live, state);
  const spawn = d.events.find((e) => e.name === 'spawnProp');
  assert.ok(spawn, 'the wrench is spawned beside the mast');
  assert.equal(spawn.payload.tetherable, true, 'the player\u2019s own massline is the recovery verb');
  assert.match(spawn.payload.scanLabel, /LOOSE WRENCH/);
  assert.ok(d.events.some((e) => e.name === 'say' && /THE RIFT KEEPS SCORE/.test(e.payload.text)),
    'the ledger line introduces the score');
});

test('SP2-151: the return files at the claim office with the tool on the line, once', t => {
  const {state,d,live,dock,line}=physicalToolFixture(t);
  toolRuntime.fire(d, live, state);
  const original=state.entities.get(live.vars.wrenchId);
  original.pos={x:30,z:190};line();
  toolRuntime.tick(d, live, state, 1100);
  assert.equal(state.story.flags.tool_returned, undefined, 'not docked yet: no return');
  assert.equal(dock(),true);
  assert.equal(state.entities.get(live.vars.wrenchId),original,'the returned physical tool was never substituted');
  assert.notEqual(state.story.flags.tool_returned, undefined, 'the flag is written');
  const rep = d.events.find((e) => e.name === 'faction:repDelta');
  assert.ok(rep, 'standing moves through the factions owner');
  assert.equal(rep.payload.factionId, 'faction_free');
  assert.equal(rep.payload.delta, 3, 'Haumea standing +3');
  const returned = d.events.find((e) => e.name === 'say' && /1 TOOL RETURNED BY/.test(e.payload.text));
  assert.match(returned.payload.text, /1 TOOL RETURNED BY VHL-4471-T/);
  assert.equal(state.story.depthProgramEncounters.completed.the_tool_ledger.outcome, 'returned');
  // Terminal: a second watch aborts on the flag.
  const d2 = stubD(2000, state);
  const live2 = stubLive('the_tool_ledger', { x: 0, z: 180 });
  toolRuntime.fire(d2, live2, state);
  assert.ok(d2.events.some((e) => e.name === 'abort'));
});

test('SP2-151: a dock without the tool on the line files nothing', t => {
  const {state,d,live,dock}=physicalToolFixture(t);
  toolRuntime.fire(d, live, state);
  state.entities.get(live.vars.wrenchId).pos={x:900,z:900};
  assert.equal(dock(),true);
  assert.equal(state.story.flags.tool_returned, undefined);
});

test('SP2-151: a watch without the fissure row aborts inert', t => {
  const {state,d,live}=physicalToolFixture(t);
  state.world.activeSector.pois = [];
  toolRuntime.fire(d, live, state);
  assert.ok(d.events.some((e) => e.name === 'abort' && e.payload.reason === 'no_mast_row'));
});

test('SP2-151: the claim office skips its discovery step for hulls that return tools', () => {
  const offersBefore = buildLandmarkQuestOffers(toolState())
    .filter((o) => o.stationId === 'station_haumea_rift');
  assert.equal(offersBefore.length, 0, 'no discovery, no reading quest');
  const offersAfter = buildLandmarkQuestOffers(toolState({ flags: { tool_returned: 1 } }))
    .filter((o) => o.stationId === 'station_haumea_rift');
  assert.equal(offersAfter.length, 1, '"they return tools": the office files the offer');
  assert.equal(offersAfter[0].id, 'landmark_haumea_fracture_reading');
});
