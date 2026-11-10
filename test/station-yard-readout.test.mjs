// STATION-YARD-READOUT — the dock tells you what the yard is doing to your paid job.
//
// stationServices always simulated pads, crews and a job queue, and charged credits up front —
// but no dock surface read the slice, and undocking cancelled a paid job in total silence.
// Proves, headless:
//   1. yardJobReadout turns the live state into the readout a player is owed (underway %,
//      queued-while-berthed, holding-when-the-yard-is-full, extra queued jobs);
//   2. departureReadinessChips gains a Yard chip while a job is live and the undock summary
//      flips to CHECK — the warning happens before the player commits, and never hard-blocks;
//   3. undocking mid-job now says so: the abort emits the completion toast's mirror, with the
//      honest stop-percentage for a started job and the "never started" line for a queued one.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { economy } from '../src/systems/economy.js';
import { stationServices } from '../src/systems/stationServices.js';
import { playerYardJobs, yardJobReadout } from '../src/ui/station/serviceQuotes.js';
import { departureReadinessChips, departureReadinessSummary } from '../src/ui/station/stationDepartureModel.js';

const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';

function makeHarness({
  seed = 42,
  rep = 0,
  hullMax = 140,
  hull = 100,
  fuelCurrent = 20,
  fuelMax = 100,
  credits = 100000,
  simTime = 0,
} = {}) {
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    hull, hullMax, armorHp: 0, armorMax: 0,
    flags: { docked: false },
  };
  const entities = new Map([[player.id, player]]);
  const state = {
    playerId: 'player',
    player: { credits, flags: { docked: false }, cargo: { items: {}, usedVolume: 0, capVolume: 100 } },
    entities,
    entityList: [player],
    fuel: { current: fuelCurrent, max: fuelMax },
    meta: { seed },
    factions: { faction_scn: { rep } },
    ui: { docked: false, dockedStationId: null },
    world: { currentSectorId: SECTOR },
    content: {},
    simTime,
    tick: 0,
  };
  const bus = createBus();
  const systems = {};
  const registry = { get: (n) => systems[n] || null };
  const yard = Object.create(stationServices);
  yard.init({ state, bus, registry, helpers: {} });
  systems.stationServices = yard;
  const econ = Object.create(economy);
  econ.state = state;
  econ.bus = bus;
  econ._registry = registry;
  econ._lastDockedStation = null;
  systems.economy = econ;
  const events = [];
  for (const ev of ['service:queued', 'service:started', 'service:progress', 'service:completed',
    'service:aborted', 'station:berthAssigned', 'station:holding', 'station:yardChanged']) {
    bus.on(ev, (p) => events.push({ ev, t: state.simTime, p }));
  }
  bus.on('toast', (p) => events.push({ ev: 'toast', t: state.simTime, p }));
  return { state, bus, yard, econ, player, events, systems, registry };
}

function dock(h) {
  h.state.ui.docked = true;
  h.state.ui.dockedStationId = STATION;
  h.player.flags.docked = true;
  h.bus.emit('dock:docked', { stationId: STATION });
}

function undock(h) {
  h.state.ui.docked = false;
  h.state.ui.dockedStationId = null;
  h.player.flags.docked = false;
  h.bus.emit('dock:undocked', {});
}

function step(h, seconds, stepSize = 0.25) {
  for (let t = 0; t < seconds - 1e-9; t += stepSize) {
    h.state.simTime += stepSize;
    h.yard.update(stepSize, h.state);
  }
}

function toasts(h) { return h.events.filter((e) => e.ev === 'toast'); }

// ── 1. the readout ──────────────────────────────────────────────────────────────────────────

test('no job → no readout; a live job reads as underway with progress and pad', () => {
  const h = makeHarness({});
  assert.equal(yardJobReadout(h.state), null, 'an idle dock has no yard story');
  assert.deepEqual(playerYardJobs(h.state), []);

  dock(h);
  step(h, 2); // settle onto the pad
  h.econ.handleService({ type: 'repair' });
  assert.equal(playerYardJobs(h.state).length, 1, 'the paid job exists');
  const readout = yardJobReadout(h.state);
  assert.ok(readout, 'a paid job must produce a readout');
  assert.match(readout.status, /Repair (underway|queued)/);
  assert.match(readout.value, /^\d+%$/);
  assert.ok(readout.frac >= 0 && readout.frac <= 1);
  assert.ok(readout.aria.includes('Yard'), 'the readout must be speakable');
  h.yard.destroy();
});

test('underway readout names the pad; holding readout says the yard is full', () => {
  const state = {
    stationServices: {
      player: {
        stationId: STATION,
        padIdx: 2,
        jobs: [{ id: 'j1', type: 'repair', stationId: STATION, total: 100, applied: 43, status: 'active' }],
      },
      stations: { [STATION]: { busyCrews: 2, waitingClients: 1 } },
    },
  };
  const r = yardJobReadout(state);
  assert.equal(r.status, 'Repair underway');
  assert.equal(r.value, '43%');
  assert.equal(r.frac, 0.43);
  assert.match(r.detail, /Pad 3/, 'pad index is spoken one-based');
  assert.match(r.detail, /2 crews on the floor/);

  const holding = yardJobReadout({
    stationServices: {
      player: {
        stationId: STATION,
        padIdx: -1,
        jobs: [{ id: 'j1', type: 'refuel', stationId: STATION, total: 80, applied: 0, status: 'queued' }],
      },
      stations: { [STATION]: { busyCrews: 3, waitingClients: 2 } },
    },
  });
  assert.equal(holding.status, 'Holding');
  assert.equal(holding.value, 'yard full');
  assert.match(holding.detail, /2 clients ahead of you/);
  assert.equal(holding.tone, 'warn');
});

test('queued-behind-a-crew and extra jobs are named', () => {
  const r = yardJobReadout({
    stationServices: {
      player: {
        stationId: STATION,
        padIdx: 0,
        jobs: [
          { id: 'j1', type: 'repair', stationId: STATION, total: 100, applied: 0, status: 'queued' },
          { id: 'j2', type: 'refuel', stationId: STATION, total: 40, applied: 0, status: 'queued' },
        ],
      },
      stations: { [STATION]: { busyCrews: 3, waitingClients: 0 } },
    },
  });
  assert.match(r.status, /Repair queued/);
  assert.match(r.detail, /waiting on a free crew/i);
  assert.match(r.detail, /\+1 more job queued/);
});

// ── 2. the departure warning ────────────────────────────────────────────────────────────────

function cleanDepartureState(extra = {}) {
  return {
    playerId: 'player',
    entities: new Map([['player', { id: 'player', hull: 100, hullMax: 100, armorHp: 0, armorMax: 0 }]]),
    player: { cargo: { items: {}, usedVolume: 0, capVolume: 100 }, credits: 5000 },
    fuel: { current: 100, max: 100 },
    missions: [],
    stationServices: { player: null, stations: {} },
    ...extra,
  };
}

test('a live yard job becomes a warn chip and the undock summary names it', () => {
  const base = cleanDepartureState();
  let chips = departureReadinessChips(base);
  assert.equal(chips.some((c) => c && c.label === 'Yard'), false, 'no job, no chip');
  assert.ok(!departureReadinessSummary(chips).title.includes('Yard:'),
    'the summary says nothing about the yard when the yard is idle');

  const withJob = cleanDepartureState({
    stationServices: {
      player: {
        stationId: STATION,
        padIdx: 1,
        jobs: [{ id: 'j1', type: 'repair', stationId: STATION, total: 100, applied: 30, status: 'active' }],
      },
      stations: {},
    },
  });
  chips = departureReadinessChips(withJob);
  const yard = chips.find((c) => c && c.label === 'Yard');
  assert.ok(yard, 'a paid job must warn on the departure check');
  assert.equal(yard.kind, 'warn');
  assert.match(yard.text, /Repair 30% — undock cancels the paid job/);
  const summary = departureReadinessSummary(chips);
  assert.equal(summary.state, 'check', 'the tile reads CHECK, not RISK — undock stays available');
  assert.match(summary.title, /Yard: Repair 30%/, 'the summary names the yard and the progress');
});

// ── 3. the abort speaks ─────────────────────────────────────────────────────────────────────

test('undocking mid-job emits the honest stop-percentage toast', () => {
  const h = makeHarness({ hull: 20, hullMax: 140 }); // a long job so it cannot finish
  dock(h);
  step(h, 2);
  h.econ.handleService({ type: 'repair' });
  step(h, 4); // the yard welds for a while — the job is part-done, credits already spent
  const aborted = h.events.find((e) => e.ev === 'service:aborted');
  assert.equal(aborted, undefined, 'nothing aborted yet');
  const job = playerYardJobs(h.state)[0];
  assert.ok(job && job.applied > 0, 'the yard made progress before the undock');
  const paidPct = Math.round((job.applied / job.total) * 100);
  undock(h);
  const abortEvents = h.events.filter((e) => e.ev === 'service:aborted');
  assert.equal(abortEvents.length, 1, 'the abort event fires');
  const toast = toasts(h).find((e) => /Undocked — repair stopped at/.test(e.p.text));
  assert.ok(toast, 'the yard says the job stopped');
  assert.match(toast.p.text, new RegExp(`stopped at ${paidPct}%`), 'the percentage matches the real work');
  assert.match(toast.p.text, /paid job was cancelled/);
  assert.equal(toast.p.kind, 'warn');
  h.yard.destroy();
});

test('undocking before the yard starts reads the never-started line', () => {
  const h = makeHarness({ hull: 20, hullMax: 140 });
  dock(h);
  h.econ.handleService({ type: 'repair' });
  // No step(): the job is booked and paid but the yard never touched the hull.
  const job = playerYardJobs(h.state)[0];
  assert.ok(job, 'the paid job exists');
  assert.equal(job.applied, 0);
  undock(h);
  const toast = toasts(h).find((e) => /cancelled before the yard started/.test(e.p.text));
  assert.ok(toast, 'the never-started cancellation is spoken');
  h.yard.destroy();
});

test('a completed job undocks quietly — no false abort', () => {
  const h = makeHarness({ hull: 139, hullMax: 140, fuelCurrent: 100, fuelMax: 100 });
  dock(h);
  step(h, 2);
  h.econ.handleService({ type: 'repair' });
  // Run until the single-unit job completes.
  let guard = 0;
  while (playerYardJobs(h.state).length > 0 && guard < 120) { step(h, 1); guard++; }
  assert.equal(playerYardJobs(h.state).length, 0, 'the job completed');
  const toastsBefore = toasts(h).length;
  undock(h);
  assert.equal(h.events.filter((e) => e.ev === 'service:aborted').length, 0,
    'a finished job is not an abort');
  assert.equal(toasts(h).length, toastsBefore, 'no new toast on undock after completion');
  h.yard.destroy();
});
