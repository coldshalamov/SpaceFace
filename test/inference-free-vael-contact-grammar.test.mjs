// The two factions with live doctrines and full bark tables but no contact grammar —
// faction_free (Io Reach / Veil independents) and faction_vael (Ashfall) — now spawn with
// contact words, demand types and register barks like every other house (WORLD-08's defect
// class, closed for the last two uncovered factions).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FACTION_CONTACT_GRAMMAR,
  contactGrammarFor,
  liveContactProfile,
} from '../src/data/factionContactGrammar.js';
import { BARKS, barkFor } from '../src/data/barks.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

test('free/vael: FACTION_CONTACT_GRAMMAR covers the last two houses', () => {
  for (const factionId of ['faction_free', 'faction_vael']) {
    const grammar = FACTION_CONTACT_GRAMMAR[factionId];
    assert.ok(grammar, `FACTION_CONTACT_GRAMMAR.${factionId} must exist`);
    assert.equal(contactGrammarFor(factionId), grammar);
    assert.equal(grammar.id, factionId);
    assert.ok(grammar.contactWord, 'a contact word exists for the HUD chip');
    assert.ok(grammar.demandType && grammar.scanPolicy && grammar.lootLegality);
    assert.ok(Array.isArray(grammar.barkSituations) && grammar.barkSituations.length);
  }
});

test('free/vael: grammar values align with the live doctrines', () => {
  const free = liveContactProfile('faction_free', 42);
  assert.ok(free, 'profile exists for faction_free');
  assert.equal(free.doctrine.id, 'frontier_mutual_cover');
  assert.equal(free.doctrine.firstFire, false, 'mutual cover does not fire first');
  assert.equal(free.grammar.contactWord, 'MUTUAL');
  assert.ok(typeof free.primaryBarkLine === 'string' && free.primaryBarkLine.length > 0);

  const vael = liveContactProfile('faction_vael', 42);
  assert.ok(vael, 'profile exists for faction_vael');
  assert.equal(vael.doctrine.id, 'vael_clause_lattice');
  assert.equal(vael.doctrine.firstFire, true, 'the clause lattice fires first');
  assert.equal(vael.grammar.contactWord, 'CLAUSE');
  assert.ok(typeof vael.primaryBarkLine === 'string' && vael.primaryBarkLine.length > 0);
});

test('free/vael: sector-grounded register lines are present in the bark tables', () => {
  const reachHail = BARKS.faction_free['patrol-greeting'].find((l) => l.includes('Reach Station lane hail'));
  assert.ok(reachHail, 'an Io Reach grounded greeting exists for faction_free');

  const ashfallScan = BARKS.faction_vael.scan.find((l) => l.includes('Ashfall relay clause'));
  assert.ok(ashfallScan, 'an Ashfall grounded scan line exists for faction_vael');

  // barkFor resolves both registers end to end.
  for (const situation of ['patrol-greeting', 'scan']) {
    for (const factionId of ['faction_free', 'faction_vael']) {
      assert.ok(barkFor(factionId, situation, () => 0.5), `${factionId} ${situation} resolves a line`);
    }
  }
});

test('free/vael: combat spawn specs carry the contact words into the world', () => {
  const freeSpec = makeEnemySpawnSpec('wasp_swarmer', 1, { x: 0, z: 0 }, { factionId: 'faction_free' });
  assert.equal(freeSpec.data.contactWord, 'MUTUAL');
  assert.equal(freeSpec.data.demandType, 'lean_share');

  const vaelSpec = makeEnemySpawnSpec('wasp_swarmer', 1, { x: 0, z: 0 }, { factionId: 'faction_vael' });
  assert.equal(vaelSpec.data.contactWord, 'CLAUSE');
  assert.equal(vaelSpec.data.demandType, 'accord_claim');
});
