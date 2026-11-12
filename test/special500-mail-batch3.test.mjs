// special-500 Phase 2 — batch 3, the serial mail pass (14 letter units).
// Each unit is ONE letter in src/data/mail.js keyed to the story flag the director writes
// when its catalog entry fires: state.story.flags['special500.<id>'] (the director is the
// only writer of that namespace). The letter is the world remembering the beat — the sender
// is the entry's own voice, and nothing delivers until the entry has actually fired.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MAIL_LETTERS, MAIL_KINDS } from '../src/data/mail.js';
import { mail, mailLetterDue } from '../src/systems/mail.js';
import { SPECIAL500_ALL } from '../src/data/special500/index.js';

// catalog unit id -> authored letter id (pattern: mail_special500_<entryid-lowercased>)
const UNITS = {
  'SPX-A-11': 'mail_special500_spx-a-11',
  'SP1-097': 'mail_special500_sp1-097',
  'SP2-163': 'mail_special500_sp2-163',
  'SPX-C-03': 'mail_special500_spx-c-03',
  'SP2-002': 'mail_special500_sp2-002',
  'SP1-056': 'mail_special500_sp1-056',
  'SP3-061': 'mail_special500_sp3-061',
  'SPX-B-03': 'mail_special500_spx-b-03',
  'SP2-062': 'mail_special500_sp2-062',
  'SPX-A-03': 'mail_special500_spx-a-03',
  'SPX-A-10': 'mail_special500_spx-a-10',
  'SPX-A-05': 'mail_special500_spx-a-05',
  'SPX-A-04': 'mail_special500_spx-a-04',
  'SP1-191': 'mail_special500_sp1-191',
};

const wordCount = (s) => s.trim().split(/\s+/).length;

function row(unit) {
  const letter = MAIL_LETTERS.find((l) => l.id === UNITS[unit]);
  assert.ok(letter, `${unit}: letter ${UNITS[unit]} is authored in the mailbox`);
  return letter;
}

function baseState(over = {}) {
  return {
    meta: { seed: 5043 },
    simTime: 0,
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

function batch3Popups(bus) {
  return bus.emitted.filter((e) => e.name === 'comms:popup'
    && e.payload && typeof e.payload.id === 'string'
    && e.payload.id.startsWith('mail:mail_special500_'));
}

// ── corpus shape ──────────────────────────────────────────────────────────────────────

test('the fourteen batch-3 letters are authored with unique stable ids', () => {
  assert.equal(Object.keys(UNITS).length, 14, 'the batch is fourteen units');
  const allIds = new Set(MAIL_LETTERS.map((l) => l.id));
  assert.equal(allIds.size, MAIL_LETTERS.length,
    'mailbox ids stay unique with batch 3 appended');
  assert.equal(new Set(Object.values(UNITS)).size, 14, 'letter ids are distinct');
  for (const unit of Object.keys(UNITS)) {
    const letter = row(unit);
    assert.ok(letter.id.startsWith('mail_special500_'),
      `${letter.id}: batch-3 id pattern`);
    assert.equal(letter.kind, 'cast', `${letter.id}: kind registered (cast)`);
    assert.ok(MAIL_KINDS.includes(letter.kind), `${letter.id}: kind in MAIL_KINDS`);
    assert.ok(letter.from && letter.from.length > 0, `${letter.id}: sender named`);
    assert.ok(letter.subject && letter.subject.length > 2, `${letter.id}: subject authored`);
    const words = wordCount(letter.body);
    assert.ok(words >= 80 && words <= 160,
      `${letter.id}: body within the 80-160 word house bar (got ${words})`);
  }
});

test('each letter triggers on exactly its entry\'s special500 flag', () => {
  for (const unit of Object.keys(UNITS)) {
    const entry = SPECIAL500_ALL.find((e) => e.id === unit);
    assert.ok(entry, `${unit}: catalog entry exists in SPECIAL500_ALL`);
    assert.deepEqual(row(unit).triggers, [{ type: 'flag', flag: `special500.${unit}` }],
      `${UNITS[unit]} waits on the director's flag for ${unit}, and nothing else`);
  }
});

// ── evaluator honesty: the flag is the occurrence ─────────────────────────────────────

test('no letter delivers before its entry fires — the director\'s flag is the occurrence', () => {
  const noise = [{ n: 'dock:docked', t: 1, f: { stationId: 'station_helios' } }];
  for (const unit of Object.keys(UNITS)) {
    const letter = row(unit);
    const clean = baseState({ simTime: 120 * 600 });
    assert.equal(mailLetterDue(letter, clean, noise), false,
      `${letter.id}: deep into a run, no delivery without the ${unit} flag`);
    const fired = baseState({ simTime: 120 * 600 });
    fired.story.flags[`special500.${unit}`] = 120 * 600; // the director writes simTime
    assert.equal(mailLetterDue(letter, fired, noise), true,
      `${letter.id}: due once the director has written the ${unit} flag`);
    const falsy = baseState({ simTime: 120 * 600 });
    falsy.story.flags[`special500.${unit}`] = 0; // a falsy write is not a firing
    assert.equal(mailLetterDue(letter, falsy, noise), false,
      `${letter.id}: a falsy flag value is not a firing`);
    const wrong = baseState({ simTime: 120 * 600 });
    wrong.story.flags[`special500.${unit}.y`] = 2; // recurring year ledger, not the firing flag
    assert.equal(mailLetterDue(letter, wrong, noise), false,
      `${letter.id}: a per-year ledger suffix flag is not the firing flag`);
  }
});

// ── delivery through the real system ──────────────────────────────────────────────────

test('all fourteen deliver once through the real system, and later ticks never refire', () => {
  const bus = fakeBus();
  const state = baseState({ simTime: 120 * 600 });
  for (const unit of Object.keys(UNITS)) state.story.flags[`special500.${unit}`] = 120 * 600;
  mail.init({ state, bus, helpers: {} });
  mail.update(1.5, state);
  const popups = batch3Popups(bus);
  assert.equal(popups.length, 14, 'each batch-3 letter arrives exactly once');
  assert.equal(new Set(popups.map((e) => e.payload.id)).size, 14,
    'fourteen distinct letters, one each');
  for (const unit of Object.keys(UNITS)) {
    const letter = row(unit);
    const hit = popups.find((e) => e.payload.id === `mail:${letter.id}`);
    assert.ok(hit, `${letter.id} delivered when ${unit} fired`);
    assert.equal(hit.payload.sender, letter.from,
      `${letter.id}: popup sender is the authored sender`);
    assert.equal(hit.payload.note, letter.subject,
      `${letter.id}: popup note is the authored subject`);
    assert.equal(hit.payload.persist, true,
      `${letter.id}: persists into the comms backlog — the inbox`);
  }
  // a replayed flag write and duplicate ticks change nothing — delivery is once, durable
  state.story.flags['special500.SPX-A-11'] = 121 * 600;
  mail.update(1.5, state);
  mail.update(1.5, state);
  assert.equal(batch3Popups(bus).length, 14,
    'no refire on replayed flags or later ticks');
});

test('a stale save that already delivered batch-3 letters never re-delivers them after Continue', () => {
  const bus = fakeBus();
  const state = baseState({ simTime: 120 * 600 });
  for (const unit of Object.keys(UNITS)) state.story.flags[`special500.${unit}`] = 120 * 600;
  mail.init({ state, bus, helpers: {} });
  mail.update(1.5, state);
  const saved = JSON.parse(JSON.stringify(mail.serialize()));
  for (const unit of Object.keys(UNITS)) {
    assert.ok(saved.delivered.includes(UNITS[unit]),
      `${UNITS[unit]} is on the delivered record before the save`);
  }
  // Continue: fresh process, fresh state, the save restored, flags still set, clock moved on
  const bus2 = fakeBus();
  const state2 = baseState({ simTime: 121 * 600 });
  for (const unit of Object.keys(UNITS)) state2.story.flags[`special500.${unit}`] = 120 * 600;
  mail.init({ state: state2, bus: bus2, helpers: {} });
  mail.deserialize(saved);
  mail.update(1.5, state2);
  assert.equal(batch3Popups(bus2).length, 0,
    'the delivered receipts survive Continue — no letter twice');
});

// ── the letters remember their own beats, not boilerplate ─────────────────────────────

test('every letter honestly names the beat it remembers', () => {
  const expectations = {
    'SPX-A-11': ['NOT FOR RESALE. YES, FOR YOU, FRANK', 'wilted', 'tomatoes'],
    'SP1-097': ['owes the belt one honest tow', 'FAVORS OWED', 'maintained by nobody'],
    'SP2-163': ['CROSS-REFERENCED TO NOTHING', 'THE SHELF IS PLEASED', 'ELEVEN YEARS'],
    'SPX-C-03': ['ALL BANDS NOMINAL', 'EXTRA BAND', 'not weather and not any code'],
    'SP2-002': ['Tessera-class', 'locker', 'scratched from the inside'],
    'SP1-056': ['PAID', 'SKIP', 'light-dust stencil'],
    'SP3-061': ['double and smear into a ring', 'safe line', 'refraction'],
    'SPX-B-03': ['ROOKIE RATE', 'ON THE HOUSE', "Don't make it a thing"],
    'SP2-062': ['OPEN', 'COVERED', 'Closing it feels like filing', 'Wraith Kell'],
    'SPX-A-03': ['noticed the absence', 'compliment', 'shift bells'],
    'SPX-A-10': ['in order of keel', 'underlined', 'census'],
    'SPX-A-05': ['Two stars', 'load-bearing', 'Nobody escaped'],
    'SPX-A-04': ['MINE', 'hand-painted white ring', 'repainted'],
    'SP1-191': ['smuggler of people', 'the hull just CAME', 'candle'],
  };
  for (const [unit, needles] of Object.entries(expectations)) {
    const letter = row(unit);
    for (const needle of needles) {
      assert.ok(letter.body.toLowerCase().includes(needle.toLowerCase()),
        `${letter.id} names its beat: "${needle}"`);
    }
  }
});
