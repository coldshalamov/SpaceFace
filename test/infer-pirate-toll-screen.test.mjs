// WF-02: the opening toll can deal a point-defense screen — a priority target
// in the first fight, not three interchangeable brawlers.
import test from 'node:test';
import assert from 'node:assert/strict';
import toll, { trigger } from '../src/data/encounters/010-pirate-toll.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((e) => [e.id, e]));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('pirate toll can deal a screen while staying a tier-2 toll', () => {
  assert.deepEqual(trigger.gates, { minCargoValue: 240, maxSecurity: 0.75, minSectorTier: 2 });
  assert.equal(trigger.weight, 3);
  assert.equal(trigger.script, 'toll');
  const arch = toll.squad.archetypes;
  assert.ok(arch.includes('pd_screen_escort'), 'screen is in the rotation');
  assert.ok(arch.includes('reaver_pirate') && arch.includes('corsair_raider'), 'brawlers stay');
  assert.deepEqual(toll.squad.size, [2, 3], 'fight size unchanged');
  for (const id of arch) assert.ok(ENEMY_BY_ID.has(id), `${id} is a known enemy`);
  const screen = ENEMY_BY_ID.get('pd_screen_escort');
  assert.equal(screen.telegraph.cue, 'pd_curtain');
  assert.ok(screen.counterHint, 'screen carries its counter-hint');
});

test('seed 4242 toll rotation actually deals the screen', () => {
  const arch = toll.squad.archetypes;
  const rng = mulberry32(4242);
  let screens = 0;
  const draws = 60;
  for (let i = 0; i < draws; i++) {
    const pick = arch[Math.floor(rng() * arch.length) % arch.length];
    if (pick === 'pd_screen_escort') screens++;
  }
  assert.ok(screens > 0, 'screen appears in rotation');
  assert.ok(screens < draws, 'toll is not all screens');
});
