// special-500 Phase 2 — batch 2, the serial mail pass (14 letter units).
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
  'SP1-089': 'mail_special500_sp1-089',
  'SP2-036': 'mail_special500_sp2-036',
  'SP2-056': 'mail_special500_sp2-056',
  'SP2-178': 'mail_special500_sp2-178',
  'SP2-046': 'mail_special500_sp2-046',
  'SP2-051': 'mail_special500_sp2-051',
  'SP2-132': 'mail_special500_sp2-132',
  'SP3-014': 'mail_special500_sp3-014',
  'SP3-019': 'mail_special500_sp3-019',
  'SPX-A-02': 'mail_special500_spx-a-02',
  'SP1-008': 'mail_special500_sp1-008',
  'SP3-033': 'mail_special500_sp3-033',
  'SPX-A-01': 'mail_special500_spx-a-01',
  'SP3-048': 'mail_special500_sp3-048',
};

const wordCount = (s) => s.trim().split(/\s+/).length;

function row(unit) {
  const letter = MAIL_LETTERS.find((l) => l.id === UNITS[unit]);
  assert.ok(letter, `${unit}: letter ${UNITS[unit]} is authored in the mailbox`);
  return letter;
}

function baseState(over = {}) {
  return {
    meta: { seed: 5042 },
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

function batch2Popups(bus) {
  return bus.emitted.filter((e) => e.name === 'comms:popup'
    && e.payload && typeof e.payload.id === 'string'
    && e.payload.id.startsWith('mail:mail_special500_'));
}

// ── corpus shape ──────────────────────────────────────────────────────────────────────

test('the fourteen batch-2 letters are authored with unique stable ids', () => {
  assert.equal(Object.keys(UNITS).length, 14, 'the batch is fourteen units');
  const allIds = new Set(MAIL_LETTERS.map((l) => l.id));
  assert.equal(allIds.size, MAIL_LETTERS.length,
    'mailbox ids stay unique with batch 2 appended');
  assert.equal(new Set(Object.values(UNITS)).size, 14, 'letter ids are distinct');
  for (const unit of Object.keys(UNITS)) {
    const letter = row(unit);
    assert.ok(letter.id.startsWith('mail_special500_'),
      `${letter.id}: batch-2 id pattern`);
    const expectedKind = unit === 'SP2-056' ? 'crew' : 'cast';
    assert.equal(letter.kind, expectedKind,
      `${letter.id}: kind registered (${expectedKind} — SP2-056 files under the Tessera thread)`);
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
  const popups = batch2Popups(bus);
  assert.equal(popups.length, 14, 'each batch-2 letter arrives exactly once');
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
  state.story.flags['special500.SP2-036'] = 121 * 600;
  mail.update(1.5, state);
  mail.update(1.5, state);
  assert.equal(batch2Popups(bus).length, 14,
    'no refire on replayed flags or later ticks');
});

test('a stale save that already delivered batch-2 letters never re-delivers them after Continue', () => {
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
  assert.equal(batch2Popups(bus2).length, 0,
    'the delivered receipts survive Continue — no letter twice');
});

// ── the letters remember their own beats, not boilerplate ─────────────────────────────

test('every letter honestly names the beat it remembers', () => {
  const expectations = {
    'SP1-089': ['SORRY', 'Black Orchard'],
    'SP2-036': ['SHIFT ENDED', 'overtime pin'],
    'SP2-056': ['SEVENTH RUN', 'deposits'],
    'SP2-178': ['ONE (1) ENGINE', 'NOTIFIED 41 TIMES'],
    'SP2-046': ['short, loud, and useful', 'Meridian'],
    'SP2-051': ['paper clip', 'convoy that never logged'],
    'SP2-132': ['MARRY US COMMERCIALLY', 'SECOND NAME'],
    'SP3-014': ['22 degrees', 'mock suns'],
    'SP3-019': ['umbra transit', 'second bell'],
    'SPX-A-02': ['IN TRANSIT, YEAR 3', 'stratified'],
    'SP1-008': ['long burn', 'gun salute'],
    'SP3-033': ['eleven real cargo tethers', 'f_ceres_2'],
    'SPX-A-01': ['five dead nav buoys', 'hand-chalked X'],
    'SP3-048': ['ion, wind, iron', 'bell'],
  };
  for (const [unit, needles] of Object.entries(expectations)) {
    const letter = row(unit);
    for (const needle of needles) {
      assert.ok(letter.body.toLowerCase().includes(needle.toLowerCase()),
        `${letter.id} names its beat: "${needle}"`);
    }
  }
});
