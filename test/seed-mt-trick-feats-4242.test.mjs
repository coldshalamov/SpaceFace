// SEED-MT-01 and SEED-MT-03..20 — a player trick receipt unlocks one feat, once.
// Seed 4242. The live ledger hears stunt:trickDetected. It does not detect the trick itself.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  achievementById,
  describeAchievementRule,
  validateAchievementDefinitions,
} from '../src/data/achievements.js';
import {
  ACHIEVEMENT_EVENT_HANDLERS,
  ACHIEVEMENT_UNLOCKED_EVENT,
  installAchievements,
  resetAchievementsForTests,
} from '../src/systems/achievements.js';

const SEED = 4242;
const PLAYER = 7;

function mapStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function harness() {
  const bus = createBus();
  const unlocks = [];
  bus.on(ACHIEVEMENT_UNLOCKED_EVENT, (payload) => unlocks.push(payload));
  const state = {
    playerId: PLAYER,
    simTime: 100,
    meta: { seed: SEED },
    onboarding: { active: false, finished: true },
  };
  const ledger = installAchievements({
    bus,
    state,
    storage: mapStorage(),
    voice: false,
  });
  return { bus, unlocks, ledger, state };
}

function receipt(over = {}) {
  const { modifiers, consequence, ...rest } = over;
  return {
    trickId: 'bolas',
    actorId: PLAYER,
    episodeId: 'ep-1',
    variantId: null,
    ...rest,
    modifiers: { collateralCount: 1, razorRelease: null, ...(modifiers || {}) },
    consequence: { killed: true, ...(consequence || {}) },
  };
}

function idsOf(unlocks, id) {
  return unlocks.filter((row) => row && row.id === id);
}

const FEATS = [
  { line: 'SEED-MT-03', id: 'two_hulls_one_rope', name: 'Two Hulls, One Rope', good: { trickId: 'bolas', episodeId: 'ep-bolas' }, bad: { trickId: 'clothesline', episodeId: 'ep-other' } },
  { line: 'SEED-MT-04', id: 'keep_the_heavy_end', name: 'Keep the Heavy End Moving', good: { trickId: 'wrecking_ball', episodeId: 'ep-wreck' }, bad: { trickId: 'bolas', episodeId: 'ep-other' } },
  { line: 'SEED-MT-05', id: 'watch_the_cable', name: 'Watch the Cable', good: { trickId: 'clothesline', episodeId: 'ep-line' }, bad: { trickId: 'bolas', episodeId: 'ep-other' } },
  { line: 'SEED-MT-06', id: 'one_mistake_three_wrecks', name: 'One Mistake, Three Wrecks', good: { trickId: 'clothesline', episodeId: 'ep-three', modifiers: { collateralCount: 3 } }, bad: { trickId: 'clothesline', episodeId: 'ep-two', modifiers: { collateralCount: 2 } } },
  { line: 'SEED-MT-07', id: 'still_flying', name: 'Still Flying', good: { trickId: 'near_miss', episodeId: 'ep-shave' }, bad: { trickId: 'bolas', episodeId: 'ep-other' } },
  { line: 'SEED-MT-08', id: 'dragged_all_the_way', name: 'Dragged All the Way In', good: { trickId: 'tow_kill', episodeId: 'ep-tow' }, bad: { trickId: 'bolas', episodeId: 'ep-other' } },
  { line: 'SEED-MT-09', id: 'the_rock_won', name: 'The Rock Won', good: { trickId: 'rock_discovery', episodeId: 'ep-rock' }, bad: { trickId: 'bolas', episodeId: 'ep-other' } },
  { line: 'SEED-MT-10', id: 'out_the_other_side', name: 'Out the Other Side', good: { trickId: 'well_golf', episodeId: 'ep-well' }, bad: { trickId: 'bolas', episodeId: 'ep-other' } },
  { line: 'SEED-MT-11', id: 'one_job_left', name: 'One Job Left', good: { trickId: 'dead_mans_mass', episodeId: 'ep-dead' }, bad: { trickId: 'bolas', episodeId: 'ep-other' } },
  { line: 'SEED-MT-12', id: 'cover_not_guaranteed', name: 'Cover Is Not a Guarantee', good: { trickId: 'bank_job', episodeId: 'ep-bank' }, bad: { trickId: 'bolas', episodeId: 'ep-other' } },
  { line: 'SEED-MT-13', id: 'back_with_your_name', name: 'Back With Your Name On It', good: { trickId: 'return_to_sender', episodeId: 'ep-return' }, bad: { trickId: 'bolas', episodeId: 'ep-other' } },
  { line: 'SEED-MT-14', id: 'rode_the_blast', name: 'Rode the Blast', good: { trickId: 'kickstart', episodeId: 'ep-blast' }, bad: { trickId: 'bolas', episodeId: 'ep-other' } },
  { line: 'SEED-MT-15', id: 'you_fit', name: 'You Fit', good: { trickId: 'needle_thread', episodeId: 'ep-gap' }, bad: { trickId: 'bolas', episodeId: 'ep-other' } },
  { line: 'SEED-MT-16', id: 'second_impulse', name: 'Second Impulse', good: { trickId: 'one_two', episodeId: 'ep-two' }, bad: { trickId: 'bolas', episodeId: 'ep-other' } },
  { line: 'SEED-MT-17', id: 'rope_well_wreck', name: 'Rope, Well, Wreck', good: { trickId: 'slingshot_golf', episodeId: 'ep-sling' }, bad: { trickId: 'bolas', episodeId: 'ep-other' } },
  { line: 'SEED-MT-18', id: 'two_hulls_one_rock', name: 'Two Hulls, One Rope, One Rock', good: { trickId: 'bolas', variantId: 'bolas_pair', episodeId: 'ep-pair' }, bad: { trickId: 'bolas', variantId: null, episodeId: 'ep-plain' } },
  { line: 'SEED-MT-19', id: 'his_own_wingman', name: 'His Own Wingman', good: { trickId: 'dead_mans_mass', variantId: 'own_wingman', episodeId: 'ep-wing' }, bad: { trickId: 'dead_mans_mass', variantId: 'other_faction', episodeId: 'ep-else' } },
  { line: 'SEED-MT-20', id: 'perfect_cut', name: 'Perfect Cut', good: { trickId: 'tow_kill', episodeId: 'ep-razor', modifiers: { razorRelease: 'razor' }, consequence: { killed: true } }, bad: { trickId: 'tow_kill', episodeId: 'ep-safe', modifiers: { razorRelease: 'razor' }, consequence: { killed: false } } },
];

test('SEED-MT-01 a player trick receipt unlocks a declared feat once; the same episode amend is silent', () => {
  assert.equal(SEED, 4242);
  const verdict = validateAchievementDefinitions();
  assert.equal(verdict.ok, true, verdict.issues.join('\n'));
  assert.equal(ACHIEVEMENT_EVENT_HANDLERS['stunt:trickDetected'], undefined);
  const def = achievementById('two_hulls_one_rope');
  assert.equal(def.rule.source, 'trick');
  assert.equal(def.rule.trickId, 'bolas');
  assert.match(describeAchievementRule(def), /bolas/);

  const quiet = harness();
  assert.equal(quiet.ledger.isUnlocked('two_hulls_one_rope'), false, 'clean flight unlocks nothing');
  assert.equal(quiet.unlocks.length, 0);
  quiet.ledger.dispose({ flush: false });

  const npc = harness();
  npc.bus.emit('stunt:trickDetected', receipt({ actorId: PLAYER + 1, episodeId: 'ep-npc' }));
  assert.equal(npc.ledger.isUnlocked('two_hulls_one_rope'), false, 'another pilot does not unlock it');
  npc.ledger.dispose({ flush: false });

  const h = harness();
  h.bus.emit('stunt:trickDetected', receipt({ trickId: 'bolas', episodeId: 'ep-bolas' }));
  assert.equal(h.ledger.isUnlocked('two_hulls_one_rope'), true);
  assert.equal(idsOf(h.unlocks, 'two_hulls_one_rope').length, 1);
  assert.equal(idsOf(h.unlocks, 'two_hulls_one_rope')[0].via, 'stunt:trickDetected');
  h.bus.emit('stunt:trickAmended', receipt({ trickId: 'bolas', episodeId: 'ep-bolas' }));
  h.bus.emit('stunt:trickDetected', receipt({ trickId: 'bolas', episodeId: 'ep-bolas-again' }));
  assert.equal(idsOf(h.unlocks, 'two_hulls_one_rope').length, 1, 'an amend of the same episode re-announces nothing');
  h.ledger.dispose({ flush: false });
});

for (const feat of FEATS) {
  test(`${feat.line} ${feat.name} unlocks once from the player receipt and stays locked otherwise`, () => {
    const def = achievementById(feat.id);
    assert.equal(def.name, feat.name);
    assert.equal(def.rule.source, 'trick');
    const h = harness();
    assert.equal(h.ledger.isUnlocked(feat.id), false, 'clean flight unlocks nothing');
    h.bus.emit('stunt:trickDetected', receipt(feat.bad));
    assert.equal(h.ledger.isUnlocked(feat.id), false, 'the negative receipt stays locked');
    h.bus.emit('stunt:trickDetected', receipt(feat.good));
    assert.equal(h.ledger.isUnlocked(feat.id), true);
    assert.equal(idsOf(h.unlocks, feat.id).length, 1);
    h.bus.emit('stunt:trickDetected', receipt({ ...feat.good, episodeId: `${feat.good.episodeId}-again` }));
    h.bus.emit('stunt:trickAmended', receipt(feat.good));
    assert.equal(idsOf(h.unlocks, feat.id).length, 1, 'a repeat receipt re-announces nothing');
    h.ledger.dispose({ flush: false });
  });
}

test('SEED-MT feats do not write GameState', () => {
  const h = harness();
  const before = JSON.stringify(h.state);
  h.bus.emit('stunt:trickDetected', receipt({ trickId: 'bolas', episodeId: 'ep-state' }));
  assert.equal(JSON.stringify(h.state), before);
  h.ledger.dispose({ flush: false });
  resetAchievementsForTests();
});
