import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FACTION_CONTACT_GRAMMAR,
  contactGrammarFor,
  liveContactProfile,
} from '../src/data/factionContactGrammar.js';
import { BARKS, barkFor } from '../src/data/barks.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

test('WORLD-08: FACTION_CONTACT_GRAMMAR.faction_dmc exists and specifies yard grammar', () => {
  const dmc = FACTION_CONTACT_GRAMMAR.faction_dmc;
  assert.ok(dmc, 'FACTION_CONTACT_GRAMMAR.faction_dmc must exist');
  assert.equal(dmc.id, 'faction_dmc');
  assert.equal(dmc.callsign, 'Drift Collective');
  assert.equal(dmc.contactWord, 'YARD');
  assert.equal(dmc.firstFire, false);
  assert.equal(dmc.lawfulRoe, 'defensive_only');
  assert.equal(dmc.demandType, 'claim_dispute');
  assert.equal(dmc.primaryBark, 'patrol-greeting');
  assert.ok(dmc.sampleLine.includes('Ceres yard hail'), 'sample line speaks in Ceres yard voice');

  const lookedUp = contactGrammarFor('faction_dmc');
  assert.equal(lookedUp, dmc);
});

test('WORLD-08: liveContactProfile for faction_dmc binds live doctrine and bark', () => {
  const profile = liveContactProfile('faction_dmc', 42);
  assert.ok(profile, 'profile must exist for faction_dmc');
  assert.equal(profile.factionId, 'faction_dmc');
  assert.equal(profile.grammar.contactWord, 'YARD');
  assert.equal(profile.doctrine.id, 'drift_worksite_defense');
  assert.equal(profile.doctrine.firstFire, false);
  assert.ok(typeof profile.primaryBarkLine === 'string' && profile.primaryBarkLine.length > 0);
});

test('WORLD-08: Ceres yard and trader lines are present in faction_dmc barks', () => {
  const greetings = BARKS.faction_dmc['patrol-greeting'];
  assert.ok(Array.isArray(greetings));
  const yardHail = greetings.find((line) => line.includes('Ceres yard hail'));
  assert.ok(yardHail, 'Ceres yard hail line must be present in patrol-greeting');

  const traderLine = greetings.find((line) => line.includes('Ceres trader inbound'));
  assert.ok(traderLine, 'Ceres trader line must be present in patrol-greeting');

  const scans = BARKS.faction_dmc.scan;
  assert.ok(Array.isArray(scans));
  const yardScan = scans.find((line) => line.includes('Ceres yard control'));
  assert.ok(yardScan, 'Ceres yard control line must be present in scan');
});

test('WORLD-08: combat enemy spawn spec attaches Collective yard contactWord', () => {
  const spec = makeEnemySpawnSpec('wasp_swarmer', 1, { x: 0, z: 0 }, {
    factionId: 'faction_dmc',
  });
  assert.equal(spec.data.contactWord, 'YARD');
  assert.equal(spec.data.demandType, 'claim_dispute');
});
