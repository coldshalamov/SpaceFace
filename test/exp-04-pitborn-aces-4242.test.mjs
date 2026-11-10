// EXP-04 — three Pitborn aces on the variety roster, seed 4242.
// Drives the live named-ace readers and the enemy catalog they point at.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import {
  NAMED_ACE_IDS,
  VARIETY_ACES,
  aceById,
  knownAces,
  returnCrewForAce,
} from '../src/data/namedAces.js';

const SEED = 4242;

const EXPECTED = [
  {
    id: 'ace_clatter',
    name: 'Clatter',
    crew: 'The Ballast Yard',
    factionId: 'faction_pitborn',
    gimmickTag: 'tether-scrapline',
    returnArchetype: 'corsair_raider',
    escortArchetype: 'reaver_pirate',
    baseReturnLevel: 4,
    signatureBark: 'BALLAST YARD: that rock had my name on it. It has your hull on it now.',
  },
  {
    id: 'ace_big_ballast',
    name: 'Big Ballast',
    crew: "Sprocket's Own",
    factionId: 'faction_pitborn',
    gimmickTag: 'swarm-screen',
    returnArchetype: 'reaver_pirate',
    escortArchetype: 'wasp_swarmer',
    baseReturnLevel: 5,
    signatureBark: "SPROCKET'S OWN: heavy's honest. You're light.",
  },
  {
    id: 'ace_ratchet_lu',
    name: 'Ratchet Lu',
    crew: "Lu's Fence",
    factionId: 'faction_pitborn',
    gimmickTag: 'salvage-surgeon',
    returnArchetype: 'bruiser_brawler',
    escortArchetype: 'corsair_raider',
    baseReturnLevel: 4,
    signatureBark: "LU'S FENCE: you break it, it's ammunition. You break, you're inventory.",
  },
];

const enemyIds = new Set(ENEMY_TYPES.map((enemy) => enemy.id));

test('seed 4242: variety roster carries three Pitborn aces on existing hulls and gimmicks', () => {
  assert.equal(SEED, 4242);
  assert.equal(NAMED_ACE_IDS.length, 3, 'the original three-ace export stays three');
  const priorGimmicks = new Set(
    knownAces()
      .filter((ace) => !EXPECTED.some((row) => row.id === ace.id))
      .map((ace) => ace.gimmickTag),
  );
  for (const row of EXPECTED) {
    const ace = VARIETY_ACES[row.id];
    assert.ok(ace, `variety roster missing ${row.id}`);
    assert.equal(aceById(row.id), ace);
    assert.equal(knownAces().some((known) => known.id === row.id), true);
    for (const key of Object.keys(row)) assert.equal(ace[key], row[key], `${row.id}.${key}`);
    assert.equal(ace.role, undefined, `${row.id} stays a variety ace, not a rival seat`);
    assert.ok(enemyIds.has(ace.returnArchetype), `${row.id} return hull is live`);
    assert.ok(enemyIds.has(ace.escortArchetype), `${row.id} escort hull is live`);
    assert.ok(priorGimmicks.has(ace.gimmickTag), `${row.id} reuses a gimmick that already existed`);
    const crew = returnCrewForAce(ace, 1);
    assert.equal(crew[0].archetype, row.returnArchetype);
    assert.equal(crew[0].role, 'boss');
    assert.ok(crew.slice(1).every((ship) => ship.archetype === row.escortArchetype));
  }
  const pitborn = knownAces().filter((ace) => ace.factionId === 'faction_pitborn');
  assert.equal(pitborn.length, 3);
});
