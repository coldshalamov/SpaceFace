import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FACTION_CONTACT_GRAMMAR,
  contactGrammarFor,
  liveContactProfile,
} from '../src/data/factionContactGrammar.js';
import { BARKS } from '../src/data/barks.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

test('a Choir zealot is stamped with verse, not a Concord hail', () => {
  const choir = FACTION_CONTACT_GRAMMAR.faction_choir;
  assert.ok(choir);
  assert.equal(choir.contactWord, 'PATTERN');
  assert.equal(choir.firstFire, true);
  assert.equal(choir.primaryBark, 'attack');
  assert.equal(contactGrammarFor('faction_choir'), choir);
  assert.ok(BARKS.faction_choir.attack.includes(choir.sampleLine));
  assert.equal(choir.sampleLine.includes('Concord'), false);
  assert.equal(choir.sampleLine.includes('transponder'), false);

  const profile = liveContactProfile('faction_choir', 4242);
  assert.ok(profile);
  assert.equal(profile.doctrine.firstFire, true);
  assert.ok(BARKS.faction_choir.attack.includes(profile.primaryBarkLine));

  const spec = makeEnemySpawnSpec('choir_zealot', 4, { x: 0, z: 0 });
  assert.equal(spec.factionId, 'faction_choir');
  assert.equal(spec.data.contactWord, 'PATTERN');
  assert.equal(spec.data.demandType, 'tithe');
  assert.equal(spec.data.ai.barkSituation, 'attack');
});
