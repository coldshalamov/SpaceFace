// Annex wave 2 (SPX-E-001..200): the second wave of 200 entries riding the
// same director. These proofs pin the wave's size and id space, schema
// validity inside the combined 750-entry sweep set, id/title uniqueness,
// the anchor-lives-in-gated-sector invariant (which the registration test's
// name-existence check does not cover), chain/flag dependency liveness, and
// a live fire-through plus an after-chain ordering proof.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SPECIAL500,
  SPECIAL500_ANNEX,
  SPECIAL500_ANNEX_2,
  SPECIAL500_ALL,
  validateSpecial500,
  special500ById,
} from '../src/data/special500/index.js';
import { SECTORS } from '../src/data/sectors.js';
import { CAL_DAY_S } from '../src/data/worldCalendar.js';
import { special500Director } from '../src/systems/special500Director.js';
import { rankRacingEntrants } from '../src/missions/racingOpponents.js';

function stubBus() {
  const handlers = new Map();
  const seen = [];
  return {
    seen,
    on(ev, fn) { (handlers.get(ev) || handlers.set(ev, []).get(ev)).push(fn); },
    emit(ev, payload) { seen.push({ event: ev, payload }); },
    deliver(ev, payload = {}) { for (const fn of handlers.get(ev) || []) fn(payload); },
  };
}

function fixtureState() {
  return {
    simTime: 10,
    tick: 42,
    seed: 7,
    world: {
      currentSectorId: 'sector_ceres_belt',
      active: { stations: [], pois: [] },
    },
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 } }]]),
    playerId: 1,
    story: { flags: {} },
    meta: { seed: 7 },
  };
}

test('annex wave 2 is exactly 200 entries, all SPX-E ids, unique inside 750', () => {
  assert.equal(SPECIAL500.length, 500, 'the ratified catalog still reads 500');
  assert.equal(SPECIAL500_ANNEX.length, 50, 'wave 1 stays at 50');
  assert.equal(SPECIAL500_ANNEX_2.length, 200, 'wave 2 lands at 200');
  assert.equal(SPECIAL500_ALL.length, 767, 'the sweep set is the union');
  assert.deepEqual([...new Set(SPECIAL500_ALL.map((e) => e.id))].length, 767, 'no id collisions across waves');
  for (const e of SPECIAL500_ANNEX_2) {
    assert.match(e.id, /^SPX-E-\d{3}$/, `${e.id} follows the wave-2 id convention`);
  }
  const seq = SPECIAL500_ANNEX_2.map((e) => Number(e.id.slice(6)));
  assert.deepEqual([...seq].sort((a, b) => a - b), Array.from({ length: 200 }, (_, i) => i + 1),
    'the SPX-E number line is complete 001..200');
});

test('wave 2 is schema-valid inside the full sweep set and titles stay unique', () => {
  const problems = validateSpecial500(SPECIAL500_ALL);
  assert.deepEqual(problems, [], `schema problems: ${problems.slice(0, 8).join('; ')}`);
  const raceEntry = {
    id: 'SPX-E-invalid-race-filter', kind: 'easter-egg', title: 'Invalid Race Filter', sectors: [],
    trigger: { type: 'receipt', event: 'mission:completed', raceOutcome: 'dnf' },
    channel: 'memory', payload: { text: 'A schema fixture.' },
  };
  assert.ok(validateSpecial500([raceEntry]).some((problem) => problem.includes('unknown race outcome dnf')),
    'race outcome filters reject unknown values');
  raceEntry.trigger.raceOutcome = 'finish';
  raceEntry.trigger.event = 'race:ended';
  assert.ok(validateSpecial500([raceEntry]).some((problem) => problem.includes('requires a mission:completed receipt')),
    'race outcome filters only attach to canonical successful mission receipts');
  const titles = new Map();
  for (const e of SPECIAL500_ALL) titles.set(e.title, (titles.get(e.title) || 0) + 1);
  const dups = [...titles].filter(([, c]) => c > 1).map(([t]) => t);
  assert.deepEqual(dups, [], `title collisions: ${dups.join(', ')}`);
});

test('every proximity anchor in the sweep set lives inside its gated sector', () => {
  const home = new Map();
  for (const s of SECTORS) {
    for (const st of s.stations || []) home.set(st.id, s.id);
    for (const p of s.pois || []) home.set(p.id, s.id);
  }
  const problems = [];
  for (const e of SPECIAL500_ALL) {
    const t = e.trigger || {};
    if (t.type !== 'proximity') continue;
    const sector = home.get(t.nearStation);
    if (!sector) problems.push(`${e.id}: unknown anchor ${t.nearStation}`);
    else if ((e.sectors || []).length && !e.sectors.includes(sector)) {
      problems.push(`${e.id}: anchor ${t.nearStation} lives in ${sector}, not ${e.sectors.join('+')}`);
    }
  }
  assert.deepEqual(problems, [], problems.slice(0, 8).join('; '));
});

test('every wave-2 chain and flag gate names a live entry', () => {
  const byId = new Map(SPECIAL500_ALL.map((e) => [e.id, e]));
  for (const e of SPECIAL500_ANNEX_2) {
    for (const id of e.after || []) {
      const dep = byId.get(id);
      assert.ok(dep && !dep.dormant, `${e.id} after ${id} resolves to a live entry`);
    }
    const req = e.trigger && e.trigger.requires;
    if (req && String(req).startsWith('special500.')) {
      const dep = byId.get(req.slice('special500.'.length));
      assert.ok(dep && !dep.dormant, `${e.id} flag-gates on a live entry`);
    }
  }
});

test('a wave-2 entry fires through the director seam and records memory', () => {
  const bus = stubBus();
  special500Director.init({ bus });
  const state = fixtureState();
  // SPX-E-007 — the flare rack, proximity 300 wu at poi_ceres_flare_rack.
  state.world.active.pois = [{ id: 2, poiId: 'poi_ceres_flare_rack', pos: { x: 100, z: 0 } }];
  state.entities.get(1).pos = { x: 150, z: 0 };
  special500Director.update(0.5, state);
  assert.ok(state.story.flags['special500.SPX-E-007'] != null, 'the flare rack fired');
  const rec = state.story.depthProgramEncounters.completed['special500.SPX-E-007'];
  assert.ok(rec && rec.outcome === 'observed', 'memory channel recorded the place record');
  // a recurring wave-2 calendar entry re-arms yearly
  const rState = fixtureState();
  rState.simTime = 17 * CAL_DAY_S + 60; // day 17, inside The Filing Season Opens' window
  special500Director.init({ bus: stubBus() });
  special500Director.update(0.5, rState);
  assert.ok(rState.story.flags['special500.SPX-E-101'] != null, 'filing season fires day 17');
  rState.simTime = (40 + 17) * CAL_DAY_S + 60; // same day, next world year
  special500Director.update(0.5, rState);
  assert.equal(rState.story.flags['special500.SPX-E-101.y'], 1, 'the ritual re-arms next world year');
  assert.equal(rState.story.flags['special500.SPX-E-101'], rState.simTime, 'and fires again on the year-1 day');
});

test('the wave-2 chain holds: the margin withdraws only after answering twice', () => {
  const bus = stubBus();
  special500Director.init({ bus });
  const state = fixtureState();
  bus.deliver('hull:fractured');
  special500Director.update(0.5, state);
  assert.ok(state.story.flags['special500.SP2-007'] != null, 'the Hull Remembers fires on the first fracture');
  assert.equal(state.story.flags['special500.SPX-E-167'], undefined, 'the margin does not withdraw early');
  state.simTime += 2;
  bus.deliver('hull:fractured');
  special500Director.update(0.5, state);
  assert.ok(state.story.flags['special500.SPX-D-05'] != null, 'the margin answers on the second fracture');
  assert.equal(state.story.flags['special500.SPX-E-167'], undefined, 'still no withdrawal before the third');
  state.simTime += 2;
  bus.deliver('hull:fractured');
  special500Director.update(0.5, state);
  const log = bus.seen.filter((s) => s.event === 'comms:log' && /STOP MAKING ME/.test(s.payload.text));
  assert.equal(log.length, 1, 'the margin withdraws on exactly the third fracture');
  assert.equal(state.story.flags['special500.SPX-E-167'], state.simTime);
});

test('special500ById resolves wave-2 entries', () => {
  assert.equal(special500ById('SPX-E-200')?.title, 'The Registrar\'s Final Stamp');
  assert.equal(special500ById('SPX-E-001')?.kind, 'world-oneoff');
});

test('finish memories match canonical successful race receipts and last place requires terminal standings', () => {
  const bus = stubBus();
  special500Director.init({ bus });
  const state = fixtureState();
  const deliver = (payload, at) => {
    state.simTime = at;
    bus.deliver('mission:completed', payload);
    special500Director.update(0.5, state);
  };
  const hasFlag = (id) => state.story.flags[`special500.${id}`] != null;
  const completion = (rows) => {
    const standings = rankRacingEntrants(rows);
    const player = standings.find((row) => row.id === 'player' && row.player === true);
    return {
      type: 'race', racingContractId: 'contract_ceres_sprint', raceMode: 'race',
      raceElapsedS: player.elapsedS, racePosition: player.position, raceEntrants: standings.length,
      raceStandings: standings,
    };
  };

  deliver({ type: 'cargo_delivery', racingContractId: 'unrelated', raceElapsedS: 81 }, 10);
  assert.equal(hasFlag('SPX-E-196'), false, 'unrelated mission completion cannot count as a race finish');
  const finisher = completion([
    { id: 'rival-1', status: 'finished', elapsedS: 50, progress: 1 },
    { id: 'player', player: true, status: 'finished', elapsedS: 60, progress: 1 },
  ]);
  deliver(finisher, 11);
  assert.equal(hasFlag('SPX-E-196'), false, 'the second-finish memory preserves its authored count');
  deliver(finisher, 12);
  assert.equal(hasFlag('SPX-E-196'), true, 'two actual successful circuit receipts unlock it');

  const lastPlaceBus = stubBus();
  special500Director.init({ bus: lastPlaceBus });
  const lastPlaceState = fixtureState();
  const lastPlace = completion([
    { id: 'rival-1', status: 'finished', elapsedS: 40, progress: 1 },
    { id: 'rival-2', status: 'finished', elapsedS: 50, progress: 1 },
    { id: 'player', player: true, status: 'finished', elapsedS: 60, progress: 1 },
  ]);
  const send = (payload, at) => {
    lastPlaceState.simTime = at;
    lastPlaceBus.deliver('mission:completed', payload);
    special500Director.update(0.5, lastPlaceState);
  };
  send(completion([
    { id: 'player', player: true, status: 'finished', elapsedS: 40, progress: 1 },
    { id: 'rival-1', status: 'finished', elapsedS: 60, progress: 1 },
    { id: 'rival-2', status: 'finished', elapsedS: 70, progress: 1 },
  ]), 10);
  assert.equal(lastPlaceState.story.flags['special500.SPX-E-074'], undefined,
    'a non-last successful finish cannot trigger the last-place line');
  const unfinishedRows = rankRacingEntrants([
    { id: 'rival-1', status: 'finished', elapsedS: 40, progress: 1 },
    { id: 'player', player: true, status: 'finished', elapsedS: 60, progress: 1 },
    { id: 'rival-2', status: 'racing', progress: 0.2 },
  ]);
  const unfinished = { ...lastPlace, racePosition: 2, raceEntrants: 3, raceStandings: unfinishedRows };
  send(unfinished, 11);
  assert.equal(lastPlaceState.story.flags['special500.SPX-E-074'], undefined,
    'interim standings cannot claim the player was definitively last');
  send(lastPlace, 12);
  assert.ok(lastPlaceState.story.flags['special500.SPX-E-074'] != null,
    'the canonical terminal last-place finish triggers the line');
});

test('Rey tuition memory only matches an unsabotaged player win in his relief contest', () => {
  const bus = stubBus();
  special500Director.init({ bus });
  const state = fixtureState();
  const settle = (payload, at) => {
    state.simTime = at;
    bus.deliver('coldburnRey:raceSettled', payload);
    special500Director.update(0.5, state);
    return state.story.flags['special500.SP2-074'] != null;
  };
  const base = { missionId: 'coldburn-bid:test', captainId: 'captain:coldburn-rey', t: 20 };
  assert.equal(settle({ ...base, winner: 'rey', sabotaged: false }, 10), false);
  assert.equal(settle({ ...base, winner: 'player', captainId: 'captain:other', sabotaged: false }, 11), false);
  assert.equal(settle({ ...base, winner: 'player', sabotaged: true }, 12), false);
  assert.equal(settle({ ...base, winner: 'player', sabotaged: false }, 13), true);
});
