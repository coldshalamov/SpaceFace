/**
 * THE WORLD REMEMBERS, U-F - the Record in the Codex (Figures tab). The pure section model reads the
 * deed ledger without ever creating it; the screen draws it through the same _section/makeEntry path
 * every tab uses.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { recordDeed, markTold, peekDeedRecord } from '../src/systems/deedRecord.js';
import {
  recordSectionModel, standingWord, deedAgo, RECORD_ROWS, RECORD_EMPTY_LINE,
} from '../src/ui/screens/codexRecord.js';

const SEEDS = [4242, 8008];

function freshState(seed) {
  const state = createGameState(seed);
  state.meta.seed = seed;
  state.simTime = 7200;
  return state;
}

test('a bare state: the empty line, and the reader never creates the record key', () => {
  for (const seed of SEEDS) {
    const state = freshState(seed);
    const model = recordSectionModel(state);
    assert.equal(model.empty, true);
    assert.equal(model.emptyLine, 'No deeds the world would repeat yet.');
    assert.equal(model.emptyLine, RECORD_EMPTY_LINE);
    assert.deepEqual(model.rows, []);
    assert.deepEqual(model.standing, []);
    assert.equal(peekDeedRecord(state), null);
    assert.equal('record' in state.story, false);
  }
  assert.equal(recordSectionModel(null).empty, true);
  assert.equal(recordSectionModel({}).empty, true);
});

test('fifteen deeds: twelve rows, newest first, with kind label, line and time-ago', () => {
  for (const seed of SEEDS) {
    const state = freshState(seed);
    const ids = [];
    for (let i = 0; i < 15; i++) {
      const deed = recordDeed(state, {
        kind: i % 2 ? 'dock_slam' : 'stunt', sectorId: 'sector_helios_prime',
        factionId: i % 2 ? 'faction_mts' : null, t: 7200 - (15 - i) * 120, tick: i + 1,
      });
      ids.push(deed.id);
    }
    const model = recordSectionModel(state);
    assert.equal(model.empty, false);
    assert.equal(model.total, 15);
    assert.equal(model.rows.length, RECORD_ROWS);
    assert.deepEqual(model.rows.map((r) => r.id), ids.slice(3).reverse(), 'newest first');
    assert.equal(model.rows[0].ago, '2m');
    assert.equal(model.rows[0].label, 'stunt');
    assert.ok(model.rows[0].line.length > 0);
    assert.ok(model.rows.every((r) => r.told === false));
  }
});

test('standing words follow the thresholds', () => {
  assert.equal(standingWord(-4), 'hostile');
  assert.equal(standingWord(-9), 'hostile');
  assert.equal(standingWord(-3.99), 'wary');
  assert.equal(standingWord(-1), 'wary');
  assert.equal(standingWord(-0.99), 'even');
  assert.equal(standingWord(0), 'even');
  assert.equal(standingWord(0.99), 'even');
  assert.equal(standingWord(1), 'approving');
  assert.equal(standingWord(3.99), 'approving');
  assert.equal(standingWord(4), 'admired');
  assert.equal(standingWord(undefined), 'even');
});

test('the standing strip names up to four factions the record touches, in the game\'s register', () => {
  const state = freshState(4242);
  const hostile = recordDeed(state, { kind: 'base_destroyed', sectorId: 'sector_helios_prime', factionId: 'faction_scn', weight: 6, t: 7190 });
  recordDeed(state, { kind: 'kill_outlaw', sectorId: 'sector_ceres_belt', factionId: 'faction_reach', t: 7195 });
  const strip = () => recordSectionModel(state).standing;
  assert.equal(hostile.kind, 'base_destroyed');
  assert.deepEqual(strip().map((s) => s.factionId), ['faction_reach', 'faction_scn']);
  const scn = strip().find((s) => s.factionId === 'faction_scn');
  assert.equal(scn.word, 'hostile');
  assert.equal(scn.text, scn.name + ': hostile');
  for (const id of ['faction_mts', 'faction_dmc', 'faction_quiet']) {
    recordDeed(state, { kind: 'dock_slam', sectorId: 'sector_helios_prime', factionId: id, t: 7199 });
  }
  const full = strip();
  assert.equal(full.length, 4, 'capped at four');
  assert.equal(new Set(full.map((s) => s.factionId)).size, 4);
  assert.ok(full.every((s) => ['hostile', 'wary', 'even', 'approving', 'admired'].includes(s.word)));
});

test('the told mark follows markTold', () => {
  for (const seed of SEEDS) {
    const state = freshState(seed);
    const a = recordDeed(state, { kind: 'stunt', sectorId: 'sector_ceres_belt', t: 7000 });
    const b = recordDeed(state, { kind: 'stunt', sectorId: 'sector_ceres_belt', t: 7100 });
    assert.deepEqual(recordSectionModel(state).rows.map((r) => r.told), [false, false]);
    markTold(state, a.id, { by: 'test' });
    const rows = recordSectionModel(state).rows;
    assert.equal(rows.find((r) => r.id === a.id).told, true);
    assert.equal(rows.find((r) => r.id === b.id).told, false);
  }
});

test('deedAgo speaks in minutes then hours', () => {
  assert.equal(deedAgo(5), '<1m');
  assert.equal(deedAgo(60), '1m');
  assert.equal(deedAgo(59 * 60), '59m');
  assert.equal(deedAgo(3600), '1h');
  assert.equal(deedAgo(7500), '2h');
  assert.equal(deedAgo(-30), '<1m');
});

test('the Figures tab draws the Record through the section path; empty is one line', async () => {
  const { codexScreen } = await import('../src/ui/screens/codex.js');
  const dom = {
    createElement: (tag) => ({
      tag, className: '', children: [], style: { setProperty() {} }, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild(c) { this.children.push(c); return c; },
      append(...cs) { for (const c of cs) this.children.push(c); },
      setAttribute() {}, removeAttribute() {}, addEventListener() {},
      set textContent(v) { this._text = String(v); },
      get textContent() { return this._text || ''; },
    }),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
  };
  const previousDocument = globalThis.document;
  const previous = { sections: codexScreen._sections, entries: codexScreen._entries };
  globalThis.document = dom;
  try {
    const empty = freshState(4242);
    codexScreen._sections = []; codexScreen._entries = [];
    codexScreen._renderRecord({ state: empty });
    assert.equal(codexScreen._sections.length, 1);
    assert.equal(codexScreen._sections[0].label, 'The Record');
    assert.equal(codexScreen._sections[0].empty, RECORD_EMPTY_LINE);
    assert.equal(codexScreen._entries.length, 0);
    assert.equal('record' in empty.story, false, 'drawing never creates the key');

    const full = freshState(8008);
    recordDeed(full, { kind: 'stunt', sectorId: 'sector_ceres_belt', t: 7100 });
    codexScreen._sections = []; codexScreen._entries = [];
    codexScreen._renderRecord({ state: full });
    assert.equal(codexScreen._entries.length, 1);
    assert.equal(codexScreen._entries[0].id, 'record:deeds');
    assert.ok(codexScreen._entries[0].article, 'one real article');
  } finally {
    codexScreen._sections = previous.sections;
    codexScreen._entries = previous.entries;
    globalThis.document = previousDocument;
  }
});
