// special-500 Phase 2 — SP2-012 "The Question, Answered Wrong" (choice leg).
//
// The catalog entry fires once on the first sector entry to sector_sedna_dark and the director
// writes flag special500.SP2-012; this leg is the firing's reply-listen interpreter on the comms
// surfaces. These proofs pin: unmet gates stay inert (no catalog flag, channel already closed),
// the fresh firing asks the question, ten seconds of silence answer "Correct," and close the
// channel forever, any transmission inside the window answers "No. Try again next cycle." once,
// the re-ask stays hash-seeded 50% per later day and never repeats inside one day, a save taken
// mid-window resumes on Continue and still resolves, and a stale save without an ask falls to
// the designed re-ask path instead of asking out of nowhere.
import test from 'node:test';
import assert from 'node:assert/strict';

import { special500Question, QUESTION_WINDOW_S, FIRING_FRESH_S } from '../src/systems/special500Question.js';
import { seededChance } from '../src/systems/special500Director.js';
import { SPECIAL500_ALL } from '../src/data/special500/index.js';
import { CAL_DAY_S } from '../src/data/worldCalendar.js';

const QUESTION_TEXT = SPECIAL500_ALL.find((e) => e.id === 'SP2-012').payload.text;
const SEDNA_DARK = 'sector_sedna_dark';
const SEED = 20261104;

// Recording stub bus, same shape the registry hands systems (synchronous dispatch).
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
    deliver(name, payload) { for (const fn of listeners.get(name) || []) fn(payload); },
    of: (name) => events.filter((e) => e.name === name),
  };
}

function fixtureState({ simTime = 0, sectorId = null, flags = {} } = {}) {
  return {
    simTime,
    tick: Math.floor(simTime * 60),
    meta: { seed: SEED },
    story: { flags: { ...flags } },
    world: { currentSectorId: sectorId },
    player: { sectorId },
  };
}

function popups(bus) { return bus.of('comms:popup'); }
function logs(bus) { return bus.of('comms:log'); }

function bootSystem(bus, state) {
  const system = Object.create(special500Question);
  system.init({ bus, state });
  return system;
}

test('without the catalog firing the leg stays inert: no ask, no flags', () => {
  const bus = stubBus();
  const state = fixtureState({ simTime: 5 * CAL_DAY_S, sectorId: SEDNA_DARK });
  const system = bootSystem(bus, state);
  system.update(0.5, state);
  system.update(0.5, state);
  assert.equal(popups(bus).length, 0, 'no popup without the director\'s fired flag');
  assert.equal(state.story.flags.the_question_asked_at, undefined);
});

test('a fresh firing asks the question on the comms surfaces exactly once', () => {
  const bus = stubBus();
  const firedAt = 3 * CAL_DAY_S;
  const state = fixtureState({ simTime: firedAt + 0.2, sectorId: SEDNA_DARK, flags: { 'special500.SP2-012': firedAt } });
  const system = bootSystem(bus, state);
  system.update(0.5, state);
  const asks = popups(bus).filter((e) => e.payload.text === QUESTION_TEXT);
  assert.equal(asks.length, 1, 'the question goes out once');
  assert.equal(asks[0].payload.sender, 'no callsign', 'the voice does not use a callsign');
  assert.equal(state.story.flags.the_question_asked_at, firedAt + 0.2, 'the window is stamped save-carried');
  assert.equal(logs(bus).filter((e) => e.payload.text === QUESTION_TEXT).length, 1, 'the backlog carries it too');
  // The same pass again: the open window is not a second ask.
  system.update(0.5, state);
  assert.equal(popups(bus).filter((e) => e.payload.text === QUESTION_TEXT).length, 1, 'no duplicate ask while the window hangs');
});

test('ten seconds of silence answer "Correct," and close the channel forever', () => {
  const bus = stubBus();
  const firedAt = 3 * CAL_DAY_S;
  const state = fixtureState({ simTime: firedAt + 0.2, sectorId: SEDNA_DARK, flags: { 'special500.SP2-012': firedAt } });
  const system = bootSystem(bus, state);
  system.update(0.5, state);
  // Inside the window: still waiting.
  state.simTime = firedAt + QUESTION_WINDOW_S - 1;
  system.update(0.5, state);
  assert.equal(popups(bus).filter((e) => /Correct/.test(e.payload.text || '')).length, 0, 'silence inside the window is not yet the answer');
  // The window expires in silence.
  state.simTime = firedAt + QUESTION_WINDOW_S + 0.5;
  system.update(0.5, state);
  const correct = popups(bus).filter((e) => /"Correct,"/.test(e.payload.text || ''));
  assert.equal(correct.length, 1, 'the voice says "Correct," once');
  assert.equal(state.story.flags.the_question_answered > 0, true, 'the answered flag is written');
  // The channel is closed forever: days later, re-entries, nothing.
  bus.events.length = 0;
  state.simTime = firedAt + 9 * CAL_DAY_S;
  system.update(0.5, state);
  assert.equal(popups(bus).length, 0, 'an answered channel never speaks again');
});

test('a transmission inside the window answers "No. Try again next cycle." once, and never turns into "Correct,"', () => {
  const bus = stubBus();
  const firedAt = 4 * CAL_DAY_S;
  const state = fixtureState({ simTime: firedAt + 0.2, sectorId: SEDNA_DARK, flags: { 'special500.SP2-012': firedAt } });
  const system = bootSystem(bus, state);
  system.update(0.5, state);
  // The player hails — any transmission on the band is an answer.
  state.simTime = firedAt + 3;
  bus.emit('contactHail:request', { targetId: 'some_hull', source: 'radial' });
  const no = popups(bus).filter((e) => /No\. Try again next cycle\./.test(e.payload.text || ''));
  assert.equal(no.length, 1, 'the voice refuses the answer once');
  assert.equal(state.story.flags.the_question_refused_at, firedAt + 3, 'the refusal is stamped');
  assert.equal(state.story.flags.the_question_asked_at, undefined, 'the window closed with the refusal');
  // A duplicate transmission lands on an empty band: inert.
  bus.emit('contactHail:request', { targetId: 'some_hull', source: 'radial' });
  bus.emit('contactHail:choice', { targetId: 'some_hull', choice: 'status' });
  assert.equal(popups(bus).filter((e) => /No\. Try again next cycle\./.test(e.payload.text || '')).length, 1, 'duplicate hails do not repeat the refusal');
  // The expired window never resolves "Correct," after a refusal.
  state.simTime = firedAt + 30;
  system.update(0.5, state);
  assert.equal(state.story.flags.the_question_answered, undefined, 'a refused exchange is not a correct one');
});

test('after a refusal the re-ask waits for a later day and the entry\'s hash-seeded chance', () => {
  const bus = stubBus();
  const firedAt = 4 * CAL_DAY_S + 50;
  const state = fixtureState({ simTime: firedAt + 0.2, sectorId: SEDNA_DARK, flags: { 'special500.SP2-012': firedAt } });
  const system = bootSystem(bus, state);
  system.update(0.5, state); // ask
  state.simTime = firedAt + 3;
  bus.emit('contactHail:request', { targetId: 'x', source: 'radial' }); // refused
  bus.events.length = 0;
  // Still the same world day, the player leaves and re-enters the dark margin: no re-ask.
  state.simTime = firedAt + 100;
  state.world.currentSectorId = 'sector_ashfall_reach';
  system.update(0.5, state);
  state.world.currentSectorId = SEDNA_DARK;
  system.update(0.5, state);
  assert.equal(popups(bus).length, 0, '"try again next cycle" means a later day, not a later entry');
  // The next day, an entry whose hash misses stays silent; a hash hit asks again.
  for (let day = 5; day < 12; day++) {
    const at = day * CAL_DAY_S + 120;
    state.simTime = at;
    state.world.currentSectorId = 'sector_ashfall_reach';
    system.update(0.5, state);
    state.world.currentSectorId = SEDNA_DARK;
    system.update(0.5, state);
    const chance = seededChance(`SP2-012|${day}|${SEED}`);
    const asked = popups(bus).filter((e) => e.payload.text === QUESTION_TEXT).length;
    assert.equal(asked, chance < 0.5 ? 1 : 0, `day ${day}: the re-ask follows the entry's 50% hash`);
    if (asked) {
      state.simTime = at + 3;
      bus.emit('contactHail:request', { targetId: 'x', source: 'radial' });
      bus.events.length = 0;
    }
  }
});

test('a save taken mid-window resumes on Continue and still resolves from simTime alone', () => {
  const bus = stubBus();
  const firedAt = 5 * CAL_DAY_S;
  const askedAt = firedAt + 0.2;
  // The save: the question was asked, nothing else has happened yet.
  const state = fixtureState({
    simTime: firedAt + 4,
    sectorId: SEDNA_DARK,
    flags: { 'special500.SP2-012': firedAt, the_question_asked_at: askedAt },
  });
  const system = bootSystem(bus, state);
  // Continue: the window is still open, and the leg waits.
  system.update(0.5, state);
  assert.equal(popups(bus).length, 0, 'a resumed window does not re-ask');
  // Transmission after Continue inside the window still refuses.
  bus.emit('contactHail:choice', { targetId: 'x', choice: 'help' });
  assert.equal(state.story.flags.the_question_refused_at > 0, true, 'the resumed window still listens');
  assert.equal(state.story.flags.the_question_answered, undefined);
});

test('a stale save whose catalog flag predates the leg never asks out of nowhere: only the designed re-ask reaches it', () => {
  const bus = stubBus();
  const firedAt = 2 * CAL_DAY_S;
  // Loaded on day 9 far from the firing, docked, sector unchanged: no ask.
  const state = fixtureState({ simTime: 9 * CAL_DAY_S + 10, sectorId: SEDNA_DARK, flags: { 'special500.SP2-012': firedAt } });
  const system = bootSystem(bus, state);
  system.update(0.5, state);
  system.update(0.5, state);
  assert.equal(popups(bus).length, 0, 'an old firing does not reopen the exchange mid-sector');
  // The re-ask path: a later day's entry, hash-gated, asks.
  let asked = false;
  for (let day = 9; day < 20 && !asked; day++) {
    state.simTime = day * CAL_DAY_S + 300;
    state.world.currentSectorId = 'sector_ashfall_reach';
    system.update(0.5, state);
    state.world.currentSectorId = SEDNA_DARK;
    system.update(0.5, state);
    asked = popups(bus).some((e) => e.payload.text === QUESTION_TEXT);
    assert.equal(asked, seededChance(`SP2-012|${day}|${SEED}`) < 0.5, `day ${day}: hash decides`);
    if (asked) {
      state.simTime = state.simTime + QUESTION_WINDOW_S + 1;
      system.update(0.5, state);
      assert.equal(state.story.flags.the_question_answered > 0, true, 'silence on the re-ask still answers "Correct,"');
    }
  }
  assert.ok(asked, 'within ten days the 50% hash gives the question back at least once');
});

test('the fresh window is short: a firing older than one calendar pass is stale, not fresh', () => {
  const bus = stubBus();
  const firedAt = 6 * CAL_DAY_S;
  const state = fixtureState({ simTime: firedAt + FIRING_FRESH_S + 1, sectorId: SEDNA_DARK, flags: { 'special500.SP2-012': firedAt } });
  const system = bootSystem(bus, state);
  system.update(0.5, state);
  assert.equal(popups(bus).length, 0, 'a stale firing defers to the re-ask design');
});
