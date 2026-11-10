// special-500 SP2-018 "The Manifest That Reads You" — the mail leg. Buoy T-9 files an intent
// reading on the pilot, and Hale writes the letter that says to ignore it, which he does too.
// The hail half of the unit (the contactHail variants that set flag `weighslip_intent`) is a
// separate build: until it lands the letter waits, gated and honest — nothing arrives untriggered.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MAIL_LETTERS, MAIL_EVENT_NAMES } from '../src/data/mail.js';
import { mail, mailLetterDue } from '../src/systems/mail.js';
import { isRacingCorridorSession } from '../src/world/racingCorridor.js';

const LETTER_ID = 'mail_hale_special500_weighslip';
const WEIGHSLIP_FLAG = 'weighslip_intent';

function letter() {
  const row = MAIL_LETTERS.find((l) => l.id === LETTER_ID);
  assert.ok(row, 'the Hale weigh-slip letter is authored in the mailbox');
  return row;
}

function baseState(over = {}) {
  return {
    meta: { seed: 5018 },
    simTime: 0,
    tick: 0,
    ui: { docked: false, dockedStationId: null },
    player: { credits: 0, heat: 0, stats: {}, cargo: { items: {} }, ownedShips: [] },
    factions: {},
    story: { beatIndex: 0, flags: {} },
    world: { currentSectorId: 'sector_tethys_junction' },
    ...over,
  };
}

function fakeBus() {
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
    emit(name, payload) {
      this.emitted.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
    off() {},
  };
}

test('Hale files the intent-reading letter on the weighslip_intent flag, from the Tethys mailbox', () => {
  const row = letter();
  assert.equal(row.kind, 'cast', 'a cast letter from the named figures');
  assert.equal(row.from, 'Hale', 'Hale writes it — customs reads everything');
  assert.ok(row.body.includes('Buoy T-9 filed an intent reading on you'),
    'the authored line survives: the buoy filed an intent reading');
  assert.ok(row.body.includes('Ignore it. I ignore mine.'),
    'Hale\'s dry solidarity is in the copy');
  // The one trigger conjunct is the plain story flag the hail leg writes — no time window
  // would make the reading arrive before the buoy actually filed it.
  assert.deepEqual(row.triggers, [{ type: 'flag', flag: WEIGHSLIP_FLAG }],
    'gated on the weighslip_intent flag alone');
  assert.ok(MAIL_EVENT_NAMES.includes('ship:purchased'), 'sanity: event vocabulary intact');
});

test('the letter waits while the flag is unset — the hail leg has not filed anything yet', () => {
  const state = baseState({ simTime: 600 });
  assert.equal(mailLetterDue(letter(), state, []), false,
    'no weighslip_intent flag, no letter — the evaluator fails closed');
  // The director writes the filing time as the flag value; day-one-zero would read falsy,
  // so the fixture files at a real simTime like the live buoy leg does.
  state.story.flags[WEIGHSLIP_FLAG] = state.simTime;
  assert.equal(mailLetterDue(letter(), state, []), true,
    'the flag the hail leg writes is the whole trigger');
});

test('a witnessed purchase or any other event never stands in for the flag', () => {
  const state = baseState();
  const events = [
    { n: 'ship:purchased', t: 1, f: { defId: 'ship_kestrel', price: 12000 } },
    { n: 'dock:docked', t: 2, f: { stationId: 'station_tethys' } },
  ];
  assert.equal(mailLetterDue(letter(), state, events), false,
    'only the intent filing triggers the letter');
});

test('the letter delivers once through the real evaluator, then never refires', () => {
  const bus = fakeBus();
  const state = baseState({ simTime: 900 });
  mail.init({ state, bus, helpers: {} });
  state.story.flags[WEIGHSLIP_FLAG] = state.simTime;
  mail.update(1.5, state);
  const pops = bus.emitted.filter((e) => e.name === 'comms:popup'
    && e.payload.id === `mail:${LETTER_ID}`);
  assert.equal(pops.length, 1, 'the letter lands as a persistent comms popup');
  assert.equal(pops[0].payload.sender, 'Hale');
  assert.equal(pops[0].payload.persist, true, 'it stays in the backlog');
  mail.update(1.5, state);
  mail.update(1.5, state);
  assert.equal(bus.emitted.filter((e) => e.name === 'comms:popup'
    && e.payload.id === `mail:${LETTER_ID}`).length, 1, 'no refire on later ticks');
});

test('a stale save that already delivered the letter does not deliver it again', () => {
  const bus = fakeBus();
  const state = baseState();
  mail.init({ state, bus, helpers: {} });
  state.story.flags[WEIGHSLIP_FLAG] = 5;
  mail.update(1.5, state);
  assert.equal(state.mail.delivered.includes(LETTER_ID), true, 'delivered before the save');
  const saved = JSON.parse(JSON.stringify(mail.serialize()));
  // A Continue restores into a fresh system; the delivered list is the durable receipt.
  const bus2 = fakeBus();
  const state2 = baseState();
  state2.story.flags[WEIGHSLIP_FLAG] = 5;
  mail.init({ state: state2, bus: bus2, helpers: {} });
  mail.deserialize(saved);
  mail.update(1.5, state2);
  assert.equal(bus2.emitted.filter((e) => e.name === 'comms:popup'
    && e.payload.id === `mail:${LETTER_ID}`).length, 0,
    'the delivered list survives the save; the letter never re-arrives');
});

test('the campaign mailbox stays closed inside a racing corridor session', () => {
  const state = baseState();
  state.story.flags[WEIGHSLIP_FLAG] = 5;
  configureSilently(state);
  assert.equal(isRacingCorridorSession(state) || !!state.physicsVenueSession, true,
    'fixture is a borrowed circuit');
  assert.equal(mailLetterDue(letter(), state, []), true,
    'the evaluator is honest about the trigger');
  const bus = fakeBus();
  mail.init({ state, bus, helpers: {} });
  mail.update(1.5, state);
  assert.equal(bus.emitted.filter((e) => e.name === 'comms:popup').length, 0,
    'borrowed circuits get no campaign mail');
});

// The racing-corridor read keys off a registered world session; a borrowed circuit fixture
// only needs the same false the real registration path produces.
function configureSilently(state) {
  state.physicsVenueSession = { id: 'fixture' };
}
