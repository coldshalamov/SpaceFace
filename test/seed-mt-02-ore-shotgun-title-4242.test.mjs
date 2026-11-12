// SEED-MT-02 — a witnessed ore-shotgun kill holds the Shellwright title. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STUNT_SITUATION_LINES,
  STUNT_TITLE_RULES,
  qualifyStuntTitles,
} from '../src/combat/stuntWitnesses.js';

const SEED = 4242;

function witnessedKill(over = {}) {
  return {
    id: 'ore-4242',
    trickId: 'ore_shotgun',
    rootId: 'ore-4242',
    tick: 40,
    pilotId: `pilot:${SEED}`,
    shipId: 'ship-hitch',
    visibility: 'witnessed',
    consequence: { killed: true },
    victimLives: [{ lifeId: 'pod-victim' }],
    modifiers: {},
    witnesses: [{
      provenance: 'live-physical-samples',
      sourceTicks: 6,
      transferTicks: 6,
      payoffTicks: 6,
      identity: 'witness-4242',
      name: 'Lane witness',
      lifeId: 'life-witness',
      terminalLives: [],
    }],
    ...over,
  };
}

function freshState() {
  return { tick: 40, meta: { seed: SEED }, story: { titles: { byId: {}, stuntProgress: {} }, titlesSeen: [] } };
}

test('SEED-MT-02 a witnessed pod-kill holds Shellwright once', () => {
  assert.equal(SEED, 4242);
  const rule = STUNT_TITLE_RULES.find((row) => row.trickId === 'ore_shotgun');
  assert.equal(rule.title, 'Shellwright');
  assert.equal(rule.kind, 'kill');
  assert.equal(rule.count, 1);
  assert.deepEqual(STUNT_SITUATION_LINES.ore_shotgun, [
    'That pod was a shell.',
    'You shoved cargo into him. Cargo won.',
    "Don't let him spend your hold on us!",
  ]);

  const held = freshState();
  const earned = qualifyStuntTitles(held, witnessedKill(), null);
  assert.equal(earned.length, 1);
  assert.equal(earned[0].title, 'Shellwright');
  assert.equal(held.story.titles.byId.title_ore_shotgun.status, 'held');
  assert.equal(held.story.titles.byId.title_ore_shotgun.title, 'Shellwright');

  const again = qualifyStuntTitles(held, witnessedKill({ id: 'ore-again', rootId: 'ore-again' }), null);
  assert.equal(again.length, 0, 'a second witnessed kill does not grant the title again');
  assert.equal(held.story.titles.byId.title_ore_shotgun.status, 'held');

  const miss = freshState();
  const missed = qualifyStuntTitles(miss, witnessedKill({
    id: 'ore-miss',
    rootId: 'ore-miss',
    consequence: { killed: false },
  }), null);
  assert.equal(missed.length, 0);
  assert.equal(miss.story.titles.byId.title_ore_shotgun, undefined, 'a pod that does not kill holds nothing');
});
