/**
 * Package D — Concord / Reach / Quiet contact grammar on live data + system seams.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { FACTION_DOCTRINES } from '../src/data/factionDoctrines.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { BARKS, BARK_SITUATIONS, barkFor } from '../src/data/barks.js';
import {
  FACTION_CONTACT_GRAMMAR,
  PRESSURE_FACTION_IDS,
  contactGrammarFor,
  liveContactProfile,
  pressureProfilesDiffer,
} from '../src/data/factionContactGrammar.js';
import { hunterTrickById } from '../src/data/hunterTricks.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { classifyBarkSituation } from '../src/systems/barkDirector.js';

test('pressure factions export distinct live contact profiles', () => {
  assert.equal(PRESSURE_FACTION_IDS.length, 3);
  assert.equal(pressureProfilesDiffer(), true);

  const scn = liveContactProfile('faction_scn', 11);
  const reach = liveContactProfile('faction_reach', 11);
  const quiet = liveContactProfile('faction_quiet', 11);
  assert.ok(scn && reach && quiet);

  // Concord: measured, no first fire, longer engagement, lawful ROE enemies exist.
  assert.equal(scn.doctrine.firstFire, false);
  assert.equal(scn.grammar.demandType, 'manifest_inspection');
  assert.ok(scn.hasLawfulEnemies);
  assert.ok(scn.enemyRoes.includes('lawful_wanted_only'));
  assert.ok(scn.doctrine.engagementRange[0] >= 400);

  // Reach: first fire, short range, predatory, tithe demand.
  assert.equal(reach.doctrine.firstFire, true);
  assert.equal(reach.grammar.demandType, 'tithe');
  assert.ok(reach.doctrine.engagementRange[1] <= 300);
  assert.ok(reach.doctrine.pursuit[0] >= 0.7);
  assert.equal(reach.hasLawfulEnemies, false);

  // Quiet: first fire, longest watch range, blank/off-book demand.
  assert.equal(quiet.doctrine.firstFire, true);
  assert.equal(quiet.grammar.demandType, 'none_or_blank_contract');
  assert.ok(quiet.doctrine.engagementRange[0] >= 500);
  assert.ok(quiet.grammar.aftermath.blankNews);

  // Not isomorphic.
  assert.notEqual(scn.grammar.contactWord, reach.grammar.contactWord);
  assert.notEqual(reach.grammar.contactWord, quiet.grammar.contactWord);
  assert.notEqual(scn.doctrine.combatDoctrineId === reach.doctrine.combatDoctrineId
    && scn.doctrine.firstFire === reach.doctrine.firstFire, true);
});

test('bark situations differ in voice and primary contact situation', () => {
  for (const id of PRESSURE_FACTION_IDS) {
    const g = contactGrammarFor(id);
    assert.ok(BARKS[id], `bark corpus for ${id}`);
    for (const sit of g.barkSituations) {
      assert.ok(BARK_SITUATIONS.includes(sit) || sit, `situation ${sit}`);
      assert.ok(Array.isArray(BARKS[id][sit]) && BARKS[id][sit].length > 0, `${id} ${sit}`);
    }
    const a = barkFor(id, g.primaryBark, () => 0);
    const b = barkFor(id, g.primaryBark, () => 0);
    assert.equal(a, b, 'deterministic bark');
    // Quiet is terse by design; still non-empty.
    assert.ok(a.length >= 3, `${id} bark too empty: ${JSON.stringify(a)}`);
  }
  // Distinct primary lines at same seed index.
  const lines = PRESSURE_FACTION_IDS.map((id) => {
    const g = contactGrammarFor(id);
    return barkFor(id, g.primaryBark, () => 0);
  });
  assert.equal(new Set(lines).size, 3, 'three factions do not share primary bark line');
  // Concord cites regs; Reach demands cargo; Quiet is minimal.
  assert.match(lines[0], /Concord|transponder|Ref|manifest|inspection|stand by/i);
  assert.match(lines[1], /cargo|hold|drop|tithe|weigh|everything|lane/i);
  assert.ok(lines[2].length <= lines[0].length, 'Quiet primary contact is shorter than Concord paperwork');
});

test('encounter selection grammar: Concord inspects, Reach extorts, Quiet assassinates', () => {
  const scn = Object.values(ENCOUNTERS).filter((e) => e.factionId === 'faction_scn');
  const reach = Object.values(ENCOUNTERS).filter((e) => e.factionId === 'faction_reach');
  const quiet = Object.values(ENCOUNTERS).filter((e) => e.factionId === 'faction_quiet');
  assert.ok(scn.length >= 1 && reach.length >= 1 && quiet.length >= 1);

  assert.ok(
    scn.some((e) => /scan|lawful|inspection|patrol/i.test(`${e.motive || ''} ${e.engagementTrigger || ''} ${e.id || ''}`)),
    'Concord has inspection/patrol encounters',
  );
  assert.ok(
    reach.some((e) => /extort|toll|raid|cargo/i.test(`${e.motive || ''} ${e.engagementTrigger || ''} ${e.id || ''}`)),
    'Reach has cargo extortion/raid encounters',
  );
  assert.ok(
    quiet.some((e) => /bounty|assassin|ghost/i.test(`${e.motive || ''} ${e.engagementTrigger || ''} ${e.id || ''} ${e.title || ''}`)),
    'Quiet has bounty/ghost encounters',
  );

  // ROE: Concord carriers are lawful_wanted_only; Reach/Quiet free-fire.
  const scnEnemies = ENEMY_TYPES.filter((e) => e.factionId === 'faction_scn');
  const reachEnemies = ENEMY_TYPES.filter((e) => e.factionId === 'faction_reach');
  assert.ok(scnEnemies.every((e) => e.factionLawful || e.aiDoctrine?.roe === 'lawful_wanted_only'));
  assert.ok(reachEnemies.some((e) => e.aiDoctrine?.roe === 'weapons_free'));
});

test('aftermath hooks: rep channel + optional heat/ace differ by faction grammar', () => {
  const scn = FACTION_CONTACT_GRAMMAR.faction_scn.aftermath;
  const reach = FACTION_CONTACT_GRAMMAR.faction_reach.aftermath;
  const quiet = FACTION_CONTACT_GRAMMAR.faction_quiet.aftermath;
  assert.equal(scn.paperwork, true);
  assert.equal(reach.paperwork, false);
  assert.equal(quiet.blankNews, true);
  assert.equal(reach.aceReturn, true);
  assert.ok(scn.repChannel === 'faction:repDelta');
  // Reach hunter tricks exist for ace-return style aftermath.
  assert.ok(hunterTrickById('wake-mines') || hunterTrickById('tether-cutter'));
});

test('doctrine engagement ranges and first-fire form a readable political triangle', () => {
  const scn = FACTION_DOCTRINES.faction_scn;
  const reach = FACTION_DOCTRINES.faction_reach;
  const quiet = FACTION_DOCTRINES.faction_quiet;
  assert.equal(scn.firstFire, false);
  assert.equal(reach.firstFire, true);
  assert.equal(quiet.firstFire, true);
  // Quiet watches farther than Reach commits.
  assert.ok(quiet.engagementRange[0] > reach.engagementRange[1]);
  // Concord middle band, not raider knife-fight.
  assert.ok(scn.engagementRange[0] > reach.engagementRange[1]);
  assert.ok(reach.pursuit[0] > scn.pursuit[1]);
});

test('live combat spawn attaches contact grammar for HUD/bark consumers', () => {
  const reaver = makeEnemySpawnSpec('reaver_pirate', 3, { x: 0, z: 0 });
  assert.equal(reaver.data.contactWord, 'TOLL');
  assert.equal(reaver.data.demandType, 'tithe');
  assert.equal(reaver.data.ai.barkSituation, 'demand-cargo');

  const patrol = makeEnemySpawnSpec('patrol_lawman', 3, { x: 0, z: 0 });
  assert.equal(patrol.data.contactWord, 'CUSTOMS');
  assert.equal(patrol.data.demandType, 'manifest_inspection');
  assert.equal(patrol.data.scanPolicy, 'always_on_wanted_or_contraband');
  assert.equal(patrol.data.ai.barkSituation, 'scan');

  const ghost = makeEnemySpawnSpec('quiet_ghost', 4, { x: 0, z: 0 });
  assert.equal(ghost.data.contactWord, 'GHOST');
  assert.equal(ghost.data.lootLegality, 'off_book_unlogged');
});

test('barkDirector classify uses live grammar for Reach opening demand vs Concord scan', () => {
  const state = {
    playerId: 1,
    entities: new Map([
      [1, { id: 1, team: 0, type: 'ship', alive: true, pos: { x: 0, z: 0 } }],
    ]),
    entityList: [],
  };
  const reach = {
    id: 2, team: 1, type: 'ship', alive: true, factionId: 'faction_reach',
    data: {
      factionId: 'faction_reach',
      openingContact: true,
      ai: { fsm: 'approach', openingContact: true },
    },
  };
  const scn = {
    id: 3, team: 1, type: 'ship', alive: true, factionId: 'faction_scn',
    data: {
      factionId: 'faction_scn',
      openingContact: true,
      ai: { fsm: 'scan', lawful: true, openingContact: true },
    },
  };
  state.entities.set(2, reach);
  state.entities.set(3, scn);
  state.entityList = [reach, scn, state.entities.get(1)];

  assert.equal(classifyBarkSituation(reach, state), 'demand-cargo');
  assert.equal(classifyBarkSituation(scn, state), 'scan');
});
