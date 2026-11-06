import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SAVE_PORTRAIT_FIELDS,
  buildSavePortrait,
  paintSavePortrait,
  roundTripSavePortrait,
  savePortraitFieldsPresent,
} from '../src/ui/screens/saveLoad.js';

// The contested pair whose front sector is Tethys Junction, as the factions system files it.
const PAIR = 'faction_dmc:faction_mts';

function envelopeWithStanding({ repBag, conflicts }) {
  return {
    player: { ownedShips: [{ defId: 'ship_kestrel', fittings: [] }], activeShipIndex: 0 },
    story: { titles: { byId: {} } },
    aceMemory: {},
    factions: { factions: repBag || {}, conflicts: conflicts || {} },
  };
}

test('the slot card names the strongest house and its rank word', () => {
  const portrait = buildSavePortrait({
    data: envelopeWithStanding({ repBag: { faction_dmc: { rep: 320 }, faction_mts: { rep: 40 } } }),
  });
  assert.equal(savePortraitFieldsPresent(portrait), true, 'the standing line always reads');
  assert.match(portrait.standing.line, /Drift/, 'the card names the house by its short name');
  assert.match(portrait.standing.line, /Foreman/, 'the card names the rung in that house\'s own ladder');
  assert.equal(portrait.standing.factionId, 'faction_dmc', 'the line carries the house id for its entity link');
});

test('a hostile standing reads as honestly as a friendly one', () => {
  const portrait = buildSavePortrait({
    data: envelopeWithStanding({ repBag: { faction_scn: { rep: -420 } } }),
  });
  assert.match(portrait.standing.line, /Concord/, 'the card names the house that marks you');
  assert.match(portrait.standing.line, /Suspect/, 'the hostile rung is named in the house\'s own word');
  assert.equal(portrait.standing.factionId, 'faction_scn');
});

test('a war still burning at save time rides the standing line', () => {
  const portrait = buildSavePortrait({
    data: envelopeWithStanding({
      repBag: { faction_dmc: { rep: 220 } },
      conflicts: { [PAIR]: { tension: 80, state: 'war', playerLean: 0.2, momentum: 30 } },
    }),
  });
  assert.match(portrait.standing.line, /Drift · Foreman/, 'the standing reads first');
  assert.match(portrait.standing.line, /front at Tethys Junction still burns/, 'the war names its front');
  assert.match(portrait.standing.line, /Drift and Meridian/, 'the war names both houses');
  assert.equal(portrait.standing.warPair, PAIR);
});

test('a war reads even when no deep standing exists', () => {
  const portrait = buildSavePortrait({
    data: envelopeWithStanding({
      repBag: { faction_mts: { rep: 20 } },
      conflicts: { [PAIR]: { tension: 80, state: 'war', playerLean: 0, momentum: 0 } },
    }),
  });
  assert.doesNotMatch(portrait.standing.line, /·/, 'no invented house when nobody stood deep enough');
  assert.match(portrait.standing.line, /still burns/, 'but the war the world still fights is real');
});

test('a quiet run with no deep standing and no war reads the honest empty line', () => {
  const portrait = buildSavePortrait({
    data: envelopeWithStanding({ repBag: { faction_dmc: { rep: 90 }, faction_scn: { rep: -100 } } }),
  });
  assert.match(portrait.standing.line, /No house stands with you/, 'nothing invented, the empty line speaks');
  assert.equal(portrait.standing.factionId, null);
  assert.equal(portrait.standing.warPair, null);
  assert.equal(savePortraitFieldsPresent(portrait), true, 'the empty line still satisfies the portrait contract');
});

test('a legacy meta-only save never invents a house', () => {
  const portrait = buildSavePortrait({
    meta: { savedAt: '2026-09-08T00:00:00.000Z', playtimeS: 12, shipName: 'ship_kestrel' },
  });
  assert.match(portrait.standing.line, /No house stands with you/);
  assert.equal(savePortraitFieldsPresent(portrait), true);
});

test('the live-state path reads the same bags the save path reads', () => {
  const state = {
    player: { ownedShips: [{ defId: 'ship_kestrel', fittings: [] }], activeShipIndex: 0 },
    story: { titles: { byId: {} } },
    aceMemory: {},
    factions: { faction_mts: { rep: 180 } },
    conflicts: { [PAIR]: { tension: 75, state: 'war', playerLean: 0, momentum: 0 } },
  };
  const portrait = buildSavePortrait({ state });
  assert.match(portrait.standing.line, /Meridian · Regular/);
  assert.match(portrait.standing.line, /still burns/);
});

test('the standing line survives a JSON save round-trip byte for byte', () => {
  const source = {
    data: envelopeWithStanding({
      repBag: { faction_dmc: { rep: 760 } },
      conflicts: { [PAIR]: { tension: 90, state: 'war', playerLean: -0.3, momentum: 80 } },
    }),
  };
  const trip = roundTripSavePortrait(source);
  assert.equal(trip.ok, true, 'the portrait round-trips');
  assert.match(trip.first.standing.line, /Charter/, 'rep 760 reads the top rung');
  assert.deepEqual(trip.second, trip.first);
});

test('paint writes the standing line and links the house', () => {
  const portrait = buildSavePortrait({
    data: envelopeWithStanding({ repBag: { faction_dmc: { rep: 320 } } }),
  });
  const painted = [];
  const nodes = {
    hull: { textContent: '' },
    scars: { textContent: '' },
    repairs: { textContent: '' },
    titles: { textContent: '' },
    standing: {
      set textContent(v) { painted.push(['text', v]); },
      classList: { remove() {}, add() {} },
      removeAttribute() {},
      setAttribute() {},
    },
    rapSheet: { textContent: '' },
    grudge: { textContent: '' },
  };
  paintSavePortrait(nodes, portrait);
  assert.equal(savePortraitFieldsPresent(portrait), true);
  assert.ok(painted.some(([, v]) => v === portrait.standing.line), 'the standing line is painted');
});

test('the portrait contract lists standing between titles and the rap sheet', () => {
  const fields = SAVE_PORTRAIT_FIELDS.slice();
  assert.equal(fields.indexOf('standing'), fields.indexOf('titles') + 1, 'standing reads right after titles');
  assert.equal(fields.indexOf('standing') + 1, fields.indexOf('rapSheet'), 'the rap sheet follows the standing');
});
