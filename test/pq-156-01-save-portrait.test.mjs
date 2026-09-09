// PQ-156.01 — the load screen is a portrait of the save: hull with scars, titles,
// rap sheet, the ace who hates you. Headless model; no headed capture.
import assert from 'node:assert/strict';
import test from 'node:test';

import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import {
  SAVE_PORTRAIT_FIELDS,
  SAVE_PORTRAIT_SEED,
  buildSavePortrait,
  paintSavePortrait,
  roundTripSavePortrait,
  savePortraitFieldsPresent,
} from '../src/ui/screens/saveLoad.js';

const SEED = 15610;
const VISION = 'The load screen is a portrait of the save: hull with scars, titles, rap sheet, the ace who hates you.';

function portraitSave(seed = SEED) {
  return {
    player: {
      credits: 4800,
      heat: 0.4,
      bounty: 4800,
      activeShipIndex: 0,
      ownedShips: [{
        defId: 'ship_kestrel',
        fittings: ['wpn_pulse_laser_s', 'mod_mining_laser_s', 'mod_engine_ion_m', 'mod_shield_booster_s'],
        livingHull: {
          schema: 'spaceface.livingHull.v1',
          killTally: 1,
          repairPatches: 0,
          heatScorch: 0,
          lastWashAtT: 0,
          washCount: 0,
          graffitiLine: null,
          graffitiAuthor: null,
          updatedAtT: 12,
          historyVersion: 2,
          scars: [{
            id: `weapon:${seed}:starboard beam`,
            cause: 'weapon',
            surface: 'weapon',
            band: 'heavy',
            facing: 'starboard beam',
            atT: 12,
            tick: seed,
            patchedAtT: null,
          }],
        },
      }],
    },
    missions: {
      story: {
        titles: {
          schemaVersion: 2,
          byId: {
            title_thunderchild: {
              status: 'held',
              holderKey: 'player',
              title: 'Thunderchild',
              titleId: 'title_thunderchild',
            },
          },
        },
        titlesSeen: [],
      },
    },
    aceMemory: {
      schemaVersion: 2,
      news: {},
      activeReturns: {},
      cultureIntros: {},
      planetChallenges: {},
      ace_yara_no_cut: {
        id: 'ace_yara_no_cut',
        name: 'Yara No-Cut',
        fled: true,
        defeated: false,
        returnTier: 2,
        fleeCount: 1,
        returnsBigger: true,
        encounterCount: 2,
      },
    },
  };
}

function envelopeFor(data, seed = SEED) {
  return {
    fmt: 'spaceface-save',
    version: CURRENT_VERSION,
    savedAt: '2026-09-08T00:00:00.000Z',
    playtimeS: seed,
    data,
  };
}

test('PQ-156.01: seed matches the packet', () => {
  assert.equal(SEED, 15610);
  assert.equal(SAVE_PORTRAIT_SEED, 15610);
  assert.deepEqual(SAVE_PORTRAIT_FIELDS.slice(), ['hull', 'scars', 'titles', 'rapSheet', 'grudge']);
});

test('PQ-156.01: a file-list index still yields five portrait fields', () => {
  const portrait = buildSavePortrait({
    meta: {
      savedAt: '2026-09-08T00:00:00.000Z',
      playtimeS: 12,
      credits: 5000,
      sectorName: 'Helios Prime',
      shipName: 'ship_kestrel',
    },
  });
  assert.equal(savePortraitFieldsPresent(portrait), true, VISION);
  assert.equal(portrait.hull.line, 'Kestrel');
  assert.equal(portrait.scars.line, 'Clean plates');
  assert.equal(portrait.titles.line, 'No titles');
  assert.equal(portrait.rapSheet.line, 'Clean');
  assert.equal(portrait.grudge.line, 'No one hunts you');
});

test('PQ-156.01: seed 15610 portrait is hull + scars + titles + rap + grudge', () => {
  const data = portraitSave(SEED);
  const portrait = buildSavePortrait({ data });
  assert.equal(savePortraitFieldsPresent(portrait), true, VISION);
  assert.equal(portrait.hull.id, 'ship_kestrel');
  assert.equal(portrait.hull.line, 'Kestrel');
  assert.match(portrait.scars.line, /starboard beam/);
  assert.match(portrait.scars.line, /heavy/);
  assert.equal(portrait.scars.count, 1);
  assert.equal(portrait.titles.line, 'Thunderchild');
  assert.match(portrait.rapSheet.line, /bounty\/hunters/);
  assert.match(portrait.rapSheet.line, /4,800 CR bounty/);
  assert.equal(portrait.grudge.name, 'Yara No-Cut');
  assert.match(portrait.grudge.line, /Yara No-Cut hates you/);
  assert.match(portrait.grudge.line, /comes back harder/);
});

test('PQ-156.01: save envelope round-trip keeps the portrait', () => {
  const data = portraitSave(SEED);
  const env = envelopeFor(data, SEED);
  const persisted = JSON.parse(JSON.stringify(env));
  const before = buildSavePortrait({ data });
  const after = buildSavePortrait({ envelope: persisted });
  assert.equal(savePortraitFieldsPresent(after), true, VISION);
  assert.deepEqual(after, before);
  const trip = roundTripSavePortrait({ data });
  assert.equal(trip.ok, true, VISION);
  assert.deepEqual(trip.second, trip.first);
});

test('PQ-156.01: paint writes scars, titles, rap sheet, and grudge', () => {
  const portrait = buildSavePortrait({ data: portraitSave(SEED) });
  const nodes = {
    scars: { textContent: '' },
    titles: { textContent: '' },
    rapSheet: { textContent: '' },
    grudge: { textContent: '' },
  };
  paintSavePortrait(nodes, portrait);
  assert.equal(nodes.scars.textContent, portrait.scars.line);
  assert.equal(nodes.titles.textContent, portrait.titles.line);
  assert.equal(nodes.rapSheet.textContent, portrait.rapSheet.line);
  assert.equal(nodes.grudge.textContent, portrait.grudge.line);
});
