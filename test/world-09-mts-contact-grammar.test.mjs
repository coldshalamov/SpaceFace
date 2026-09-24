import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FACTION_CONTACT_GRAMMAR,
  contactGrammarFor,
  liveContactProfile,
} from '../src/data/factionContactGrammar.js';
import { BARKS, barkFor } from '../src/data/barks.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

test('WORLD-09: FACTION_CONTACT_GRAMMAR.faction_mts exists and specifies invoice grammar', () => {
  const mts = FACTION_CONTACT_GRAMMAR.faction_mts;
  assert.ok(mts, 'FACTION_CONTACT_GRAMMAR.faction_mts must exist');
  assert.equal(mts.id, 'faction_mts');
  assert.equal(mts.callsign, 'Meridian Trade');
  assert.equal(mts.contactWord, 'INVOICE');
  assert.equal(mts.firstFire, false);
  assert.equal(mts.lawfulRoe, 'defensive_only');
  assert.equal(mts.demandType, 'tariff_inspection');
  assert.equal(mts.primaryBark, 'patrol-greeting');
  assert.ok(mts.sampleLine.includes('Tethys exchange hail'), 'sample line speaks in Tethys invoice voice');

  const lookedUp = contactGrammarFor('faction_mts');
  assert.equal(lookedUp, mts);
});

test('WORLD-09: liveContactProfile for faction_mts binds live doctrine and bark', () => {
  const profile = liveContactProfile('faction_mts', 42);
  assert.ok(profile, 'profile must exist for faction_mts');
  assert.equal(profile.factionId, 'faction_mts');
  assert.equal(profile.grammar.contactWord, 'INVOICE');
  assert.equal(profile.doctrine.id, 'meridian_convoy_preservation');
  assert.equal(profile.doctrine.firstFire, false);
  assert.ok(typeof profile.primaryBarkLine === 'string' && profile.primaryBarkLine.length > 0);
});

test('WORLD-09: Tethys exchange and trader lines are present in faction_mts barks', () => {
  const greetings = BARKS.faction_mts['patrol-greeting'];
  assert.ok(Array.isArray(greetings));
  const exchangeHail = greetings.find((line) => line.includes('Tethys exchange hail'));
  assert.ok(exchangeHail, 'Tethys exchange hail line must be present in patrol-greeting');

  const traderLine = greetings.find((line) => line.includes('Tethys trader inbound'));
  assert.ok(traderLine, 'Tethys trader line must be present in patrol-greeting');

  const scans = BARKS.faction_mts.scan;
  assert.ok(Array.isArray(scans));
  const laneScan = scans.find((line) => line.includes('Tethys lane control'));
  assert.ok(laneScan, 'Tethys lane control line must be present in scan');
});

test('WORLD-09: combat enemy spawn spec attaches Meridian invoice contactWord', () => {
  const spec = makeEnemySpawnSpec('wasp_swarmer', 1, { x: 0, z: 0 }, {
    factionId: 'faction_mts',
  });
  assert.equal(spec.data.contactWord, 'INVOICE');
  assert.equal(spec.data.demandType, 'tariff_inspection');
});
