#!/usr/bin/env node
// check-named-captains.mjs — schema gate for NAMED_CAPTAINS + hunter bark resolution.

import assert from 'node:assert/strict';

import { NAMED_CAPTAINS, ENCOUNTER_BARKS, barkText } from '../src/data/encounters.js';

const ARCHETYPES = new Set([
  'lancer_sniper', 'bruiser_brawler', 'corsair_raider', 'reaver_pirate',
  'wasp_swarmer', 'mule_trader', 'patrol_lawman',
]);
const DOCTRINES = new Set(['scavenger', 'balanced', 'official', 'wolfpack']);
const FORMATIONS = new Set(['wedge', 'loose', 'ring', 'column']);

let sections = 0;
function ok(label) { sections++; console.log(`  ✓ ${label}`); }

{
  const n = NAMED_CAPTAINS.length;
  assert(n >= 1, `roster empty`);
  const ids = NAMED_CAPTAINS.map((c) => c.id);
  const barks = NAMED_CAPTAINS.map((c) => c.bark);
  assert.equal(new Set(ids).size, ids.length, 'duplicate captain ids');
  assert.equal(new Set(barks).size, barks.length, 'duplicate bark keys');
  ok(`roster: ${n} captains, unique ids/barks`);
}

{
  for (const c of NAMED_CAPTAINS) {
    assert(typeof c.name === 'string' && c.name.length > 0, `${c.id}: name required`);
    assert(typeof c.gimmick === 'string' && c.gimmick.length > 0, `${c.id}: gimmick required`);
    assert(ARCHETYPES.has(c.archetype), `${c.id}: archetype ${c.archetype} not allowed`);
    assert(c.levelBonus >= 1 && c.levelBonus <= 3, `${c.id}: levelBonus ${c.levelBonus} outside [1,3]`);
    assert(c.bountyCr >= 300 && c.bountyCr <= 800, `${c.id}: bountyCr ${c.bountyCr} outside [300,800]`);
    const esc = c.escort;
    assert(esc && Array.isArray(esc.archetypes) && esc.archetypes.length === 1, `${c.id}: escort.archetypes must be length-1 array`);
    assert(ARCHETYPES.has(esc.archetypes[0]), `${c.id}: escort archetype ${esc.archetypes[0]} not allowed`);
    assert(Array.isArray(esc.size) && esc.size.length === 2, `${c.id}: escort.size must be [min,max]`);
    assert(esc.size[0] >= 1 && esc.size[1] >= esc.size[0], `${c.id}: escort.size invalid`);
    assert(DOCTRINES.has(esc.doctrine), `${c.id}: doctrine ${esc.doctrine} not allowed`);
    assert(FORMATIONS.has(esc.formation), `${c.id}: formation ${esc.formation} not allowed`);
    assert(/^hunter_/.test(c.bark), `bark ${c.bark} must start with hunter_`);
    assert(ENCOUNTER_BARKS[c.bark], `${c.id}: bark key ${c.bark} missing from ENCOUNTER_BARKS`);
    const text = barkText(c.bark);
    assert(typeof text === 'string' && text.length > 0, `${c.id}: barkText(${c.bark}) empty`);
  }
  ok(`schema: ${NAMED_CAPTAINS.length} captains pass field-for-field validation`);
}

console.log(`[check-named-captains] PASS — ${sections} sections green`);