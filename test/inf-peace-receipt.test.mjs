// inf-peace-receipt — a war that ends says so at the desk.
//
// The conflict lifecycle had a declaration (news beat, war posture at the desk) and a
// resolution (the flip toast, the ship's ledger page when the player leaned) — but the peace
// itself vanished into silence: factions drops the resolved pair to tense, the war posture
// gate goes quiet, and no surface anywhere read the flip-time facts the record already keeps.
// Now, for a bounded memory window after factions' own durable flip stamp, the desk of either
// house names the peace — who took the ground, from whom — from the same record, nothing
// invented. Past the window the berth moves on; a live war outranks peace news; bystander
// houses and corrupt stamps fail closed.
//
// Focused owner: src/ui/station/stationArrival.js (pure read of factions' saved conflict
// record — no new persistent fields, the flip stamp already rides the save).
import assert from 'node:assert/strict';
import test from 'node:test';

import { stationWarPostureLineFor } from '../src/ui/station/stationArrival.js';
import { FACTION_KITS } from '../src/data/factions/index.js';

const KIT_IDS = FACTION_KITS.map((kit) => kit.id);
const NOW = 60000;
// The real Reach/Concord front and its real contested ground (authored sector name resolves).
const A = 'faction_reach';
const B = 'faction_scn';
const GROUND = 'sector_helios_prime';

function peaceState({ at = NOW - 200, state = 'tense', flip = true, sectorId = GROUND } = {}) {
  const rec = { state, tension: 50 };
  if (flip) {
    rec.lastFlip = {
      pairKey: `${A}:${B}`, sectorId,
      previousOwner: A, newOwner: B,
      t: at, flipId: `front:${A}:${B}:1`, playerLeanMag: 0.4,
    };
  }
  return { simTime: NOW, conflicts: { [`${A}:${B}`]: rec } };
}

test('a war that just resolved names its peace at either house desk', () => {
  const state = peaceState();
  const winnerLine = stationWarPostureLineFor(state, B);
  assert.ok(winnerLine, 'the winner house speaks the peace');
  assert.match(winnerLine, /The war is over/, `the clause names the peace: ${winnerLine}`);
  const winnerKit = FACTION_KITS.find((entry) => entry.id === B);
  const winnerName = (winnerKit && (winnerKit.short || winnerKit.name)) || B;
  assert.ok(winnerLine.includes(winnerName), `the taker is named: ${winnerLine}`);
  assert.ok(winnerLine.includes('Helios Prime'), `the ground is named by its authored name: ${winnerLine}`);
  const loserKit = FACTION_KITS.find((entry) => entry.id === A);
  const loserName = (loserKit && (loserKit.short || loserKit.name)) || A;
  assert.ok(winnerLine.includes(loserName), `the house that lost it is named: ${winnerLine}`);

  // The loser's dock reads the same peace from the same record.
  const loserLine = stationWarPostureLineFor(state, A);
  assert.ok(loserLine && loserLine.includes('The war is over'), 'the loser house speaks the same peace');

  // An unmapped ground still degrades to a readable name, never an id with its prefix.
  const unknown = peaceState({ sectorId: 'sector_nowhere_lane' });
  const line = stationWarPostureLineFor(unknown, B);
  assert.ok(line.includes('nowhere lane'), `the ground degrades readable: ${line}`);
  assert.ok(!line.includes('sector_'), 'no raw sector id reaches the desk');
});

test('a live war still speaks the war posture, not peace news from the last turn', () => {
  const state = peaceState({ state: 'war', tension: 80 });
  const line = stationWarPostureLineFor(state, A);
  assert.ok(line, 'the war posture speaks');
  assert.match(line, /at war/, `the live war outranks the old flip: ${line}`);
  assert.doesNotMatch(line, /war is over/, 'no peace clause while the front is live');

  // Peace on one front never drowns a live war on another.
  const c = KIT_IDS.find((id) => id !== A && id !== B);
  const twoFronts = peaceState();
  twoFronts.conflicts[`${A}:${c}`] = { state: 'war', tension: 90 };
  const line2 = stationWarPostureLineFor(twoFronts, A);
  assert.match(line2, /at war/, `the live front outranks the resolved one: ${line2}`);
});

test('past the memory window the berth moves on', () => {
  assert.equal(stationWarPostureLineFor(peaceState({ at: NOW - 1800 - 1 }), A), null,
    'three sim days of peace news, then history');
  assert.equal(stationWarPostureLineFor(peaceState({ at: NOW - 1800 }), A) !== null, true,
    'the window edge itself still speaks');
  // A tense pair with no flip stamp at all stays silent — tension alone was never war news.
  assert.equal(stationWarPostureLineFor(peaceState({ flip: false }), A), null,
    'a merely tense pair does not invent a peace');
});

test('bystander houses and corrupt stamps fail closed', () => {
  const third = KIT_IDS.find((id) => id !== A && id !== B);
  assert.equal(stationWarPostureLineFor(peaceState(), third), null,
    'a bystander house does not claim the peace');

  const noTime = peaceState();
  noTime.conflicts[`${A}:${B}`].lastFlip.t = 'recently';
  assert.equal(stationWarPostureLineFor(noTime, A), null, 'a corrupt flip time files nothing');

  const futureFlip = peaceState({ at: NOW + 60 });
  assert.equal(stationWarPostureLineFor(futureFlip, A), null, 'a flip from the future files nothing');

  const noWinner = peaceState();
  delete noWinner.conflicts[`${A}:${B}`].lastFlip.newOwner;
  assert.equal(stationWarPostureLineFor(noWinner, A), null, 'a flip with no taker files nothing');

  assert.equal(stationWarPostureLineFor(null, A), null);
  assert.equal(stationWarPostureLineFor({}, A), null);
  assert.equal(stationWarPostureLineFor({ simTime: NOW }, A), null);
});
