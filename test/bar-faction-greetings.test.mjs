import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { createGameState } from '../src/core/gameState.js';
import { generateContacts } from '../src/ui/station/barContacts.js';
import {
  BAR_GREETING_BARKS,
  BAR_APPROACH_BARKS,
  barGreetingBarkFor,
  barApproachBarkFor,
} from '../src/data/barks.js';
import {
  FACTION_SHEET_DIR,
  REGISTER_SHEET_FILES,
  loadFactionSheet,
  normalizeLine,
  parseKeyList,
  scoreHouse,
} from '../src/story/factionRegisters.js';

// Bar contacts used to open with one global role line no matter which house they
// flew for. Generated contacts now draw their greeting and approach lines from
// per-faction bar pools; authored canonical contacts keep their written lines.

const GREETING_FACTIONS = Object.keys(BAR_GREETING_BARKS);
const APPROACH_FACTIONS = Object.keys(BAR_APPROACH_BARKS);
const WORD_LIMIT = 12;

function wordCount(line) {
  return String(line).trim().split(/\s+/).filter(Boolean).length;
}

function greetingPool(factionId, role) {
  const cell = BAR_GREETING_BARKS[factionId] || BAR_GREETING_BARKS.faction_free;
  return (role && cell[role]) || cell.any || [];
}

test('every bar faction has non-empty greeting and approach pools', () => {
  assert.equal(GREETING_FACTIONS.length, 8, 'greeting table covers the eight reachable houses');
  assert.equal(APPROACH_FACTIONS.length, 8, 'approach table covers the eight reachable houses');
  for (const id of GREETING_FACTIONS) {
    const cell = BAR_GREETING_BARKS[id];
    assert.ok(Array.isArray(cell.any) && cell.any.length >= 3, `${id} greeting.any non-empty`);
    assert.ok(Array.isArray(BAR_APPROACH_BARKS[id]) && BAR_APPROACH_BARKS[id].length >= 3, `${id} approach pool non-empty`);
  }
});

test('bar voice lines are short non-empty strings', () => {
  for (const id of GREETING_FACTIONS) {
    for (const [role, pool] of Object.entries(BAR_GREETING_BARKS[id])) {
      for (const line of pool) {
        assert.equal(typeof line, 'string', `${id}.${role} line is a string`);
        assert.ok(line.trim().length > 0, `${id}.${role} line non-empty`);
        assert.ok(wordCount(line) <= WORD_LIMIT, `${id}.${role} line within ${WORD_LIMIT} words: ${line}`);
      }
    }
    for (const line of BAR_APPROACH_BARKS[id]) {
      assert.equal(typeof line, 'string', `${id} approach line is a string`);
      assert.ok(line.trim().length > 0, `${id} approach line non-empty`);
      assert.ok(wordCount(line) <= WORD_LIMIT, `${id} approach line within ${WORD_LIMIT} words: ${line}`);
    }
  }
});

test('bar voice lines obey each house register (no forbidden terms, tells present)', () => {
  for (const [factionId, sheetFile] of Object.entries(REGISTER_SHEET_FILES)) {
    if (!BAR_GREETING_BARKS[factionId]) continue;
    const sheet = loadFactionSheet(join(FACTION_SHEET_DIR, sheetFile));
    const allLines = [
      ...Object.values(BAR_GREETING_BARKS[factionId]).flat(),
      ...(BAR_APPROACH_BARKS[factionId] || []),
    ];
    for (const line of allLines) {
      assert.ok(scoreHouse(sheet, line) >= 0, `${factionId} line avoids forbidden terms: ${line}`);
    }
    const tells = parseKeyList(sheet.register_tell).map(normalizeLine).filter(Boolean);
    if (tells.length > 0) {
      const voiced = allLines.some((line) => scoreHouse(sheet, line) >= 1);
      assert.ok(voiced, `${factionId} pool carries at least one of its own tells`);
    }
  }
});

test('selectors are deterministic and fall back cleanly', () => {
  for (const id of GREETING_FACTIONS) {
    for (let i = 0; i < 6; i++) {
      const line = barGreetingBarkFor(id, 'smuggler', i);
      assert.ok(greetingPool(id, 'smuggler').includes(line), `${id} greeting pick comes from its pool`);
      const again = barGreetingBarkFor(id, 'smuggler', i);
      assert.equal(line, again, 'same index same line');
      assert.ok(BAR_APPROACH_BARKS[id].includes(barApproachBarkFor(id, i)), `${id} approach pick comes from its pool`);
    }
  }
  // Unknown factions inherit the free-frontier voice instead of throwing or
  // speaking for a house they are not.
  assert.ok(BAR_GREETING_BARKS.faction_free.any.includes(barGreetingBarkFor('faction_unknown', 'pilot', 0)));
  assert.ok(BAR_APPROACH_BARKS.faction_free.includes(barApproachBarkFor('faction_unknown', 0)));
});

test('generated contacts speak their own faction register', () => {
  const state = createGameState(4242);
  const contacts = generateContacts('station_io_merc', state);
  const generated = contacts.filter((c) => !c.canonicalKey);
  assert.ok(generated.length >= 2, 'station_io_merc has generated contacts beside Sallow');

  const quietBarkeep = generated.find((c) => c.role === 'barkeep' && c.factionId === 'faction_quiet');
  assert.ok(quietBarkeep, 'a generated quiet barkeep exists at the quiet outpost');
  assert.ok(
    BAR_GREETING_BARKS.faction_quiet.barkeep.includes(quietBarkeep.line),
    `generated quiet barkeep greets in quiet voice, got: ${quietBarkeep.line}`,
  );
  assert.ok(
    BAR_APPROACH_BARKS.faction_quiet.includes(quietBarkeep.approach),
    `generated quiet barkeep approach comes from the quiet pool, got: ${quietBarkeep.approach}`,
  );

  for (const c of generated) {
    assert.ok(
      greetingPool(c.factionId, c.role).includes(c.line),
      `${c.id} (${c.factionId}/${c.role}) line comes from its own faction pool`,
    );
    assert.ok(
      (BAR_APPROACH_BARKS[c.factionId] || BAR_APPROACH_BARKS.faction_free).includes(c.approach),
      `${c.id} approach comes from its own faction pool`,
    );
  }
});

test('generation stays deterministic and authored contacts are untouched', () => {
  const state = createGameState(4242);
  const first = generateContacts('station_sker', state);
  const second = generateContacts('station_sker', state);
  assert.deepEqual(first, second, 'two calls produce identical contacts');

  const quinn = first.find((c) => c.canonicalKey === 'quinn');
  assert.ok(quinn, 'Quinn is still on the Sker roster');
  assert.equal(quinn.line, 'Same rates. Same management. Same drawer under the bar.');
  assert.equal(quinn.approach, undefined, 'authored contacts keep their own stage voice');

  const helios = generateContacts('station_helios', state);
  const kessler = helios.find((c) => c.canonicalKey === 'kessler');
  assert.ok(kessler, 'Kessler is still on the Helios roster');
  assert.equal(kessler.line, '"Weight matches prior haul." Contract 47-A is still under review.');
});

test('the unheard wreck rumor still stamps onto a generated barkeep', () => {
  const state = createGameState(4242);
  const contacts = generateContacts('station_helios', state);
  const host = contacts.find((c) => c.rumorSourceRef === 'bar.helios_meridian.silver_draft');
  assert.ok(host, 'Helios contacts carry the Silver-Draft rumor');
  assert.match(String(host.line), /Silver-Draft/i);
});
