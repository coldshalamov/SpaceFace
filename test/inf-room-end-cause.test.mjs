// inf-room-end-cause — the room's ends read as the room's ends.
//
// Before this admission only collisions and authored weapon packets carried a kill cause,
// so a hull a mine, a drift bomb, a sympathetic cookoff or the crusher's jaws took stamped
// 'generic' and read — popup word and style family alike — as a gun kill (SHREDDED/PUNCHED),
// while the room-grammar law (row 481) says MINED is "an explosive end (mine, charge,
// cookoff)". The crusher's own damage owner routes terrainCrumpleDamage, so its end is
// terrain and a shover's crush pays the documented PQ-174.02 physics rate.
//
// Headless: buildKillPresentationReceipt is pure over (state, target, killerId, lethal);
// the downstream readers (styleCauseFromKill, physicsPlayScoreMult, swarmKillCauseWord)
// are pure tables.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildKillPresentationReceipt } from '../src/systems/combat.js';
import {
  styleCauseFromKill,
  physicsPlayScoreMult,
} from '../src/systems/survivalStyle.js';
import { swarmKillCauseWord, SWARM_ARENA_KILL_WORDS } from '../src/data/swarmJuice.js';

const STATE = { playerId: 7, entities: { get: () => null } };
const TARGET = { id: 11, type: 'ship', pos: { x: 5, z: 5 }, vel: { x: 0, z: 0 }, data: {} };

function lethalFor(origin, sourceKind) {
  return {
    origin,
    packet: { source: sourceKind ? { kind: sourceKind } : {} },
  };
}

function causeFor(origin, sourceKind) {
  return buildKillPresentationReceipt(STATE, TARGET, 7, lethalFor(origin, sourceKind)).cause;
}

test('an explosive room end stamps explosive, not generic', () => {
  // mine: origin kind 'mine' (mines.js), source kind rides the same id.
  assert.equal(causeFor({ kind: 'mine', id: 'm1' }, 'mine'), 'explosive');
  // drift bomb blast: origin kind 'bomb' (bombs.js).
  assert.equal(causeFor({ kind: 'bomb', id: 'b1', payloadId: 'bomb_shredder' }, 'bomb'), 'explosive');
  // sympathetic cookoff: origin kind 'light_cookoff' (impulseCharges.js).
  assert.equal(causeFor({ kind: 'light_cookoff', id: 'c1' }, 'light_cookoff'), 'explosive');
});

test('the crusher bite is a terrain-crumple end', () => {
  assert.equal(causeFor({ kind: 'crusher_jaws', id: 'toy1' }, 'crusher_jaws'), 'terrain_collision');
});

test('source.kind alone carries the room end when the origin is bare', () => {
  assert.equal(causeFor({ id: 'x' }, 'mine'), 'explosive');
});

test('ordinary non-weapon ends stay generic (no vocabulary drift)', () => {
  assert.equal(causeFor({ kind: 'storm_discharge', id: 'n1' }, 'storm_discharge'), 'generic');
  assert.equal(causeFor({ kind: 'status', id: 'status_burning' }, 'status'), 'generic');
  assert.equal(causeFor(null, null), 'generic');
});

test('authored weapon causes outrank the room-end table', () => {
  // A weapon kill keeps its damageType cause even with a room-end-shaped source kind.
  const lethal = {
    origin: { kind: 'weapon', weaponId: 'wpn_autocannon_s' },
    packet: { source: { kind: 'weapon', weaponId: 'wpn_autocannon_s' } },
  };
  assert.equal(buildKillPresentationReceipt(STATE, TARGET, 7, lethal).cause, 'kinetic');
});

test('the word the room says matches the honest family', () => {
  const mined = styleCauseFromKill({
    presentation: buildKillPresentationReceipt(STATE, TARGET, 7, lethalFor({ kind: 'mine', id: 'm1' }, 'mine')),
  });
  assert.equal(mined, 'explosive');
  assert.equal(swarmKillCauseWord({ cause: mined, arenaId: 'helios_core' }), 'COOKED');
  const crushed = styleCauseFromKill({
    presentation: buildKillPresentationReceipt(STATE, TARGET, 7, lethalFor({ kind: 'crusher_jaws', id: 'toy1' }, 'crusher_jaws')),
  });
  assert.equal(crushed, 'terrain');
  assert.equal(swarmKillCauseWord({ cause: crushed, surface: 'terrain', arenaId: 'asteroid_mill' }), 'MILLED');
});

test('a player-attributed explosive end pays the documented physics style rate', () => {
  // PQ-174.02: a player-attributed explosive kill pays the force-table ratio — reachable
  // for the first time by mine/charge/cookoff ends through this admission.
  assert.ok(physicsPlayScoreMult('explosive', null, true) > 1);
  // An NPC-attributed explosive end stays at gun rate.
  assert.equal(physicsPlayScoreMult('explosive', null, false), 1);
});

test('every arena names the mined and slammed ends the honest families resolve to', () => {
  for (const [arenaId, words] of Object.entries(SWARM_ARENA_KILL_WORDS)) {
    assert.equal(swarmKillCauseWord({ cause: 'explosive', arenaId }), words.mined);
    assert.equal(swarmKillCauseWord({ cause: 'terrain', surface: 'terrain', arenaId }), words.slammed);
  }
});
