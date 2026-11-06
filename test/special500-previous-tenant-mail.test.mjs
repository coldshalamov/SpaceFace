// special-500 SP2-041 "The Previous Tenant's Mail" — the mail leg plus the bar leg. The mail
// system routes by hull, not by person, so the first delivery after the player's second hull
// arrives addressed to whoever held the seat before. The letter's author drinks at Quinn's.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MAIL_LETTERS } from '../src/data/mail.js';
import { mail, mailLetterDue } from '../src/systems/mail.js';
import { generateContacts } from '../src/ui/station/barContacts.js';

const LETTER_ID = 'mail_previous_tenant_01';

function letter() {
  const row = MAIL_LETTERS.find((l) => l.id === LETTER_ID);
  assert.ok(row, "the previous tenant's letter is authored in the mailbox");
  return row;
}

function baseState(over = {}) {
  return {
    meta: { seed: 5041 },
    simTime: 600,
    tick: 0,
    ui: { docked: false, dockedStationId: null },
    player: { credits: 0, heat: 0, stats: {}, cargo: { items: {} }, ownedShips: [] },
    factions: {},
    story: { beatIndex: 0, flags: {} },
    world: { currentSectorId: 'sector_helios_prime' },
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

test('the cushion letter is authored for the hull, addressed to the operator before you', () => {
  const row = letter();
  assert.equal(row.kind, 'cast');
  assert.equal(row.from, 'Rets', 'the letter\'s author — the same regular the bar gains');
  assert.ok(row.body.includes('RE: THE SEAT CUSHION YOU TOOK'), 'the authored subject line');
  assert.ok(row.body.includes('WE HAVE NOT FORGIVEN'), 'the grievance survives editing');
  assert.ok(row.body.includes('LOAD-BEARING SOCIALLY'), 'the cushion\'s structural role is on record');
  assert.deepEqual(row.triggers,
    [{ type: 'event', name: 'ship:purchased' }, { type: 'ownedShips', gte: 2 }],
    'witnessed purchase plus the live second-hull read — no counter flag to go stale');
});

test('the first hull purchase earns Zell and the spam desk, not this letter', () => {
  const state = baseState();
  state.player.ownedShips = [{ shipId: 'ship_kestrel' }];
  const events = [{ n: 'ship:purchased', t: 1, f: { defId: 'ship_kestrel', price: 9000 } }];
  assert.equal(mailLetterDue(letter(), state, events), false,
    'one hull is not the second tenant\'s mail');
});

test('the letter is due on the first delivery after the second hull, once the event is witnessed', () => {
  const state = baseState();
  state.player.ownedShips = [{ shipId: 'ship_kestrel' }, { defId: 'ship_mule' }];
  assert.equal(mailLetterDue(letter(), state, []), false,
    'two hulls but no witnessed purchase — the mail only delivers what it saw');
  const events = [{ n: 'ship:purchased', t: 2, f: { defId: 'ship_mule', price: 21000 } }];
  assert.equal(mailLetterDue(letter(), state, events), true,
    'second hull onward, purchase witnessed');
  // A later purchase keeps the letter due until the evaluator delivers it once — then the
  // delivered list, not the trigger, is what stops it.
  events.push({ n: 'ship:purchased', t: 3, f: { defId: 'ship_vagrant', price: 5000 } });
  assert.equal(mailLetterDue(letter(), state, events), true,
    'duplicate purchase events do not break the conjunct');
});

test('the letter delivers once through the real system and never refires on later purchases', () => {
  const bus = fakeBus();
  const state = baseState();
  mail.init({ state, bus, helpers: {} });
  state.player.ownedShips = [{ shipId: 'ship_kestrel' }, { defId: 'ship_mule' }];
  bus.emit('ship:purchased', { defId: 'ship_mule', price: 21000 });
  mail.update(1.5, state);
  const pops = bus.emitted.filter((e) => e.name === 'comms:popup'
    && e.payload.id === `mail:${LETTER_ID}`);
  assert.equal(pops.length, 1, 'the misdelivered letter arrives once');
  assert.equal(pops[0].payload.sender, 'Rets');
  bus.emit('ship:purchased', { defId: 'ship_vagrant', price: 5000 });
  mail.update(1.5, state);
  mail.update(1.5, state);
  assert.equal(bus.emitted.filter((e) => e.name === 'comms:popup'
    && e.payload.id === `mail:${LETTER_ID}`).length, 1, 'no refire — delivered is durable');
});

test('a stale save that already delivered the letter never delivers it again', () => {
  const bus = fakeBus();
  const state = baseState();
  mail.init({ state, bus, helpers: {} });
  state.player.ownedShips = [{ shipId: 'ship_kestrel' }, { defId: 'ship_mule' }];
  bus.emit('ship:purchased', { defId: 'ship_mule' });
  mail.update(1.5, state);
  const saved = JSON.parse(JSON.stringify(mail.serialize()));
  const bus2 = fakeBus();
  const state2 = baseState();
  state2.player.ownedShips = [{ shipId: 'ship_kestrel' }, { defId: 'ship_mule' }];
  mail.init({ state: state2, bus: bus2, helpers: {} });
  mail.deserialize(saved);
  bus2.emit('ship:purchased', { defId: 'ship_mule' });
  mail.update(1.5, state2);
  assert.equal(bus2.emitted.filter((e) => e.name === 'comms:popup'
    && e.payload.id === `mail:${LETTER_ID}`).length, 0,
    'the delivered receipt survives Continue');
});

test('the letter\'s author is a regular at the station bar', () => {
  const contacts = generateContacts('station_smuggler', baseState());
  const rets = contacts.find((c) => c.canonicalKey === 'rets');
  assert.ok(rets, 'Rets sits at Quinn\'s through the canonical contact pattern');
  assert.equal(rets.id, 'contact_station_smuggler_rets');
  assert.equal(rets.name, 'Rets');
  assert.ok(rets.line.includes('chair'), 'the first line is about the seat');
  // The author exists at the bar on the ordinary route — the bar the letter names by existing.
  const other = generateContacts('station_helios', baseState());
  assert.equal(other.some((c) => c.canonicalKey === 'rets'), false,
    'Rets keeps to the one berth, like every authored regular');
});
