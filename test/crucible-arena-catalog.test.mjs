// The arena row's completeness contract — EC-G14, PR #981.
//
// ceres_belt and tethys_hub sat in COMBAT_LAB_ARENAS with authored sectors and spawn points
// for months, but the door's description map never grew their cards — the public filter
// (`COMBAT_LAB_ARENAS.filter(entry => arenaDescriptions[entry.id])`) silently dropped them,
// so two finished rooms were unreachable on the ordinary route. The tests below pin the
// contract that keeps this from recurring:
//
//   • every catalog arena is described on the door, OR is provably unreachable AND named in
//     the unreachability table — silence in BOTH lists fails;
//   • every described card is complete (name, pitch, real signature names) and has a face;
//   • every described arena's launch mapping resolves (real sector, finite spawn);
//   • a room with no authored star gate is never locked by the ladder — the lock copy can
//     never promise an unlock that cannot be earned.
//
// Headless; data-level only; no wall clock.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { SECTORS } from '../src/data/sectors.js';
import { survivalArenaSpawn } from '../src/data/survivalArenas.js';
import { SWARM_EVENT_BY_ID, SWARM_EVENT_TABLES } from '../src/data/swarmEvents.js';
import { SWARM_ARENA_STAR_GATES } from '../src/data/swarmLadder.js';
import { hasDpIcon } from '../src/ui/deckplate/icons.js';
import {
  ARENA_DESCRIPTIONS,
  ARENA_GLYPH,
  ARENA_TILE,
  crucibleArenaLadderLocked,
} from '../src/ui/screens/crucible.js';

const CATALOG_IDS = COMBAT_LAB_ARENAS.map((arena) => arena.id);
const SECTOR_IDS = new Set(SECTORS.map((sector) => sector.id));

// A catalog room the door cannot honestly offer must be named here WITH its proof — never
// left out of both lists. (Empty on purpose: today every catalog arena is a public door.)
const PROVABLY_UNREACHABLE = new Map([
  // id: 'why the ordinary route cannot reach it'
]);

// ---------------------------------------------------------------------------------------------
// 1. The filter the door paints is the whole catalog — no silent gaps.
// ---------------------------------------------------------------------------------------------

test('every catalog arena is offered on the door or provably unreachable', () => {
  for (const arena of COMBAT_LAB_ARENAS) {
    const described = ARENA_DESCRIPTIONS[arena.id];
    if (described) {
      assert.ok(!PROVABLY_UNREACHABLE.has(arena.id),
        `${arena.id} is both described and declared unreachable`);
      continue;
    }
    assert.ok(PROVABLY_UNREACHABLE.has(arena.id),
      `${arena.id} is missing from the door's catalog with no unreachability proof`);
  }
});

test('the door paints exactly the public filter — same expression the row uses', () => {
  // Mirror of crucible.js's `COMBAT_LAB_ARENAS.filter(entry => ARENA_DESCRIPTIONS[entry.id])`:
  // if the filter ever drops a launchable room again, this is the assertion that names it.
  const offered = COMBAT_LAB_ARENAS
    .filter((entry) => ARENA_DESCRIPTIONS[entry.id])
    .map((entry) => entry.id);
  const dropped = CATALOG_IDS.filter((id) => !offered.includes(id));
  assert.deepEqual(dropped, [...PROVABLY_UNREACHABLE.keys()],
    'a launchable room fell off the arena row');
});

test('no orphan cards — every described arena exists in the catalog', () => {
  for (const id of Object.keys(ARENA_DESCRIPTIONS)) {
    assert.ok(CATALOG_IDS.includes(id),
      `${id} is described on the door but is not a Combat Lab arena`);
  }
});

// ---------------------------------------------------------------------------------------------
// 2. Every card is a complete, honest card.
// ---------------------------------------------------------------------------------------------

test('every described card names the room and its law in real words', () => {
  for (const [id, card] of Object.entries(ARENA_DESCRIPTIONS)) {
    assert.ok(Array.isArray(card) && card.length === 3, `${id} is not a [name, pitch, signatures] card`);
    const [name, pitch, signatures] = card;
    assert.ok(typeof name === 'string' && name.length > 0, `${id} has no room name`);
    assert.ok(typeof pitch === 'string' && pitch.length > 0, `${id} has no authored pitch`);
    assert.ok(typeof signatures === 'string', `${id} signatures is not a string`);
    for (const text of [name, pitch, signatures]) {
      assert.ok(!/undefined|NaN|\[object/.test(text), `${id} renders badly: ${text}`);
    }
  }
});

test('signature names come only from events that exist and have authored names', () => {
  // The card assembles signature text straight off the event table; an id without a def
  // would render a gap, an id without a name would render nothing.
  for (const [arenaId, table] of Object.entries(SWARM_EVENT_TABLES)) {
    for (const eventId of table) {
      const def = SWARM_EVENT_BY_ID[eventId];
      assert.ok(def && typeof def.name === 'string' && def.name.length > 0,
        `${arenaId} advertises event ${eventId} with no authored name`);
    }
  }
});

test('the two finished side rooms carry the authored pitches', () => {
  assert.equal(ARENA_DESCRIPTIONS.ceres_belt[0], 'Ceres Mining Belt');
  assert.equal(ARENA_DESCRIPTIONS.tethys_hub[0], 'Tethys Exchange');
  // Neither room owns a swarm event table — the card must show the plain pitch and never
  // a "Signature events:" clause that names tricks that cannot fire.
  assert.equal(ARENA_DESCRIPTIONS.ceres_belt[2], '');
  assert.equal(ARENA_DESCRIPTIONS.tethys_hub[2], '');
});

test('every described arena has a face — authored tile or its own glyph', () => {
  // S9: an untiled room wears its own glyph, never another room's picture and never a blank
  // square. A described room with neither is a card that renders nothing.
  for (const id of Object.keys(ARENA_DESCRIPTIONS)) {
    assert.ok(ARENA_TILE[id] || ARENA_GLYPH[id],
      `${id} has no authored tile and no glyph — the card would render blank`);
    if (ARENA_GLYPH[id]) {
      assert.ok(hasDpIcon(ARENA_GLYPH[id]),
        `${id} names glyph ${ARENA_GLYPH[id]} which is not in the kit`);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// 3. Every door leads somewhere real.
// ---------------------------------------------------------------------------------------------

test('every catalog arena resolves a real sector and a finite spawn', () => {
  for (const arena of COMBAT_LAB_ARENAS) {
    assert.ok(SECTOR_IDS.has(arena.sectorId),
      `${arena.id} names sector ${arena.sectorId} which does not exist`);
    const spawn = survivalArenaSpawn(arena.id);
    assert.ok(spawn && spawn.pos, `${arena.id} has no launchable spawn mapping`);
    assert.ok(Number.isFinite(spawn.pos.x) && Number.isFinite(spawn.pos.z),
      `${arena.id} spawn is not finite: ${JSON.stringify(spawn.pos)}`);
  }
});

// ---------------------------------------------------------------------------------------------
// 4. The ladder gate never lies.
// ---------------------------------------------------------------------------------------------

test('a room with no authored star gate is never locked by the climb', () => {
  // The side rooms have no gate and no ladder seed: locking them would paint "opens at 0
  // ladder stars" on a door that could never open. They stay open in every mode.
  for (const id of ['ceres_belt', 'tethys_hub']) {
    assert.ok(!Number.isInteger(SWARM_ARENA_STAR_GATES[id]), `${id} grew a gate — re-aim this test`);
    assert.equal(crucibleArenaLadderLocked(null, id), false, `${id} locked on an empty profile`);
    assert.equal(crucibleArenaLadderLocked({ arenas: {} }, id), false, `${id} locked on a real profile`);
  }
});

test('gated rooms still lock until the stars are earned, and the Foundry never locks', () => {
  const broke = { arenas: {} };
  assert.equal(crucibleArenaLadderLocked(broke, 'helios_core'), false, 'gate 0 is always open');
  assert.equal(crucibleArenaLadderLocked(broke, 'cinder_sluice'), true, 'gate 4 locked at 0 stars');
  assert.equal(crucibleArenaLadderLocked(broke, 'the_hive'), true, 'gate 12 locked at 0 stars');
  // A profile holding every star opens the whole climb.
  const rich = {
    arenas: Object.fromEntries(
      Object.keys(SWARM_ARENA_STAR_GATES)
        .map((id) => [id, { zones: { 0: { stars: 3 }, 1: { stars: 3 }, 2: { stars: 3 } } }]),
    ),
  };
  for (const id of Object.keys(SWARM_ARENA_STAR_GATES)) {
    assert.equal(crucibleArenaLadderLocked(rich, id), false, `${id} still locked on a full climb`);
  }
});
