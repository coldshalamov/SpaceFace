// words-standing-house-fallback — a house the record no longer lists reads as words.
//
// Player problem: a save-slot card whose standing record named a house the current catalog
// no longer lists printed the prefix-stripped id remnant ("vael_rc") in the slot card's
// "{house} · {rank}" line, and the epilogue's war line printed the same mangled remnant as
// if it were a proper name ("leaning old_barrow's way"). Both owners now fall back to an
// honest generic noun and never leak a raw or mangled id.
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSavePortrait } from '../src/ui/screens/saveLoad.js';
import { buildEndingEpilogueModel } from '../src/ui/endingEpilogue.js';
import { ENDING_DEFS } from '../src/story/endings/endingDefs.js';

const UNKNOWN = 'faction_old_barrow_club';

function envelopeWithStanding(repBag, conflicts = {}) {
  return {
    player: { ownedShips: [{ defId: 'ship_kestrel', fittings: [] }], activeShipIndex: 0 },
    story: { titles: { byId: {} } },
    aceMemory: {},
    factions: { factions: repBag, conflicts },
  };
}

test('a standing for a house the catalog does not list reads as an honest noun', () => {
  const portrait = buildSavePortrait({
    data: envelopeWithStanding({ [UNKNOWN]: { rep: 320 } }),
  });
  assert.match(portrait.standing.line, /an unlisted house/, 'the line still reads as words');
  assert.doesNotMatch(portrait.standing.line, /old_barrow_club/, 'the raw id never leaks');
  assert.doesNotMatch(portrait.standing.line, /barrow/, 'not even the prefix-stripped remnant');
});

test('a catalogued house still reads by its authored short name', () => {
  const portrait = buildSavePortrait({
    data: envelopeWithStanding({ faction_dmc: { rep: 320 } }),
  });
  assert.match(portrait.standing.line, /Drift/, 'the authored short name wins');
  assert.doesNotMatch(portrait.standing.line, /unlisted/, 'the fallback stays out of the way');
});

test('a war line with one unlisted house keeps the sentence whole', () => {
  const portrait = buildSavePortrait({
    data: envelopeWithStanding(
      { faction_dmc: { rep: 300 } },
      { [`faction_dmc:${UNKNOWN}`]: { state: 'war' } },
    ),
  });
  assert.match(portrait.standing.line, /Drift/, 'the catalogued house keeps its name');
  assert.match(portrait.standing.line, /an unlisted house/, 'the unknown side reads as words');
  assert.doesNotMatch(portrait.standing.line, /old_barrow_club/, 'no raw id on the card');
});

test('two unlisted houses still burn honestly', () => {
  const portrait = buildSavePortrait({
    data: envelopeWithStanding(
      {},
      { [`${UNKNOWN}:faction_other_ghost`]: { state: 'war' } },
    ),
  });
  assert.match(portrait.standing.line, /an unlisted house.*an unlisted house/, 'both sides say the honest noun');
  assert.doesNotMatch(portrait.standing.line, /ghost|faction_/, 'no id material of either side leaks');
});

function epilogueState(conflicts) {
  const def = ENDING_DEFS[0];
  return {
    story: {
      postEnding: {
        choiceId: def.id,
        endingId: def.id,
        title: def.continuity.title,
        objective: def.continuity.objective,
        status: 'active',
      },
    },
    conflicts,
  };
}

test('the epilogue war line names an unlisted house instead of a mangled id', () => {
  const model = buildEndingEpilogueModel({
    event: 'endgame:chosen',
    payload: { choice: ENDING_DEFS[0].id },
    state: epilogueState({
      [`faction_dmc:${UNKNOWN}`]: { tension: 80, state: 'war', playerLean: 0.3, momentum: 20 },
    }),
  });
  assert.ok(model && model.warLine, 'the war line builds');
  assert.match(model.warLine, /Drift/, 'the catalogued house keeps its authored name');
  assert.match(model.warLine, /an unlisted house/, 'the unknown house reads as words');
  assert.match(model.warLine, /leaning an unlisted house's way/, 'the lean names it too');
  assert.doesNotMatch(model.warLine, /old_barrow_club/, 'no raw id on the ending card');
});
