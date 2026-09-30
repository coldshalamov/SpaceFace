// PRO-13 — six more achievements, every one bound to a counter the ledger already keeps.
//
// The line's Done sentence: a focused test proves 26 definitions validate through
// validateAchievementDefinitions and each new one binds to an EXISTING counter; seed-4242 scripts
// earn two of them. The "do not" is explicit: add a counter here, add hidden-only achievements.
// So this test's real job is to prove NEITHER happened — that ACHIEVEMENT_COUNTERS and
// ACHIEVEMENT_EVENT_HANDLERS are unchanged, and that the six new rows are further rungs on
// counters the catalog already had.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_COUNTERS,
  ACHIEVEMENT_ID_PATTERN,
  validateAchievementDefinitions,
} from '../src/data/achievements.js';
import {
  ACHIEVEMENT_EVENT_HANDLERS,
  ACHIEVEMENT_UNLOCKED_EVENT,
  applyCrucibleResult,
  emptyAchievementBag,
  installAchievements,
  mergeAchievementBags,
  parseAchievementBag,
  rememberPreRunBest,
  resetAchievementsForTests,
  seedBagFromCrucibleProfile,
  useAchievementClock,
} from '../src/systems/achievements.js';
import {
  loadCrucibleMeta,
  recordKey,
  settleCrucibleRun,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';

const PLAYER = 1;
const cleanCount = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
const CRUCIBLE_RUN = { seed: 3303, arenaId: 'arena_foundry', ruleset: 'swarm', arenaMutators: [] };
const resultFor = (over) => ({
  seed: CRUCIBLE_RUN.seed, arenaId: CRUCIBLE_RUN.arenaId, ruleset: CRUCIBLE_RUN.ruleset,
  mutators: [], kills: 12, wavesCleared: 3, ...over,
});

// The six this unit added. Ids are forever once shipped, so they are named here as the contract.
const ADDED = [
  'returning_caller', 'ten_permits', 'the_hundred_thousand',
  'quarry', 'long_haul', 'salvage_crew',
];

// ---------------------------------------------------------------------------------------
// The Done sentence
// ---------------------------------------------------------------------------------------

test('PRO-13: the six new definitions validate and are structurally sound', () => {
  const verdict = validateAchievementDefinitions();
  assert.equal(verdict.ok, true, verdict.issues.join('\n'));
  // The line's Done sentence says "26", which assumed a 20-row catalog. HEAD actually carried 16
  // (four were removed by an earlier lane without the count being revisited), so six more is 22.
  // The binding claim — six more, all on existing counters — is what this unit delivers; the
  // absolute number is recorded as the arithmetic actually is rather than asserted to a stale base.
  assert.equal(ACHIEVEMENTS.length, 22, `22 achievements (16 + 6), got ${ACHIEVEMENTS.length}`);
  for (const id of ADDED) {
    assert.ok(ACHIEVEMENTS.some((d) => d.id === id), `${id} is defined`);
  }
  const ids = ACHIEVEMENTS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const d of ACHIEVEMENTS) {
    assert.match(d.id, ACHIEVEMENT_ID_PATTERN, `${d.id} matches the id pattern`);
    assert.equal(d.steamApiName, `SF_${d.id.toUpperCase()}`);
  }
  // The line's "do not": no hidden-only additions. paperwork_filed is the catalog's one pre-existing
  // hidden row, so the check is over the ids this unit added, not over the whole list.
  for (const id of ADDED) {
    assert.equal(ACHIEVEMENTS.find((d) => d.id === id).hidden, false,
      `${id} must not be a hidden-only tease`);
  }
});

test('PRO-13: every new achievement binds to a counter the game already kept', () => {
  for (const id of ADDED) {
    const def = ACHIEVEMENTS.find((d) => d.id === id);
    assert.equal(def.rule.source, 'counter', `${id} reads a counter`);
    assert.ok(ACHIEVEMENT_COUNTERS[def.rule.key], `${id} binds to a DECLARED counter`);
    // The real "already keeps" proof: another (earlier) achievement reads the same counter at a
    // LOWER target, so the counter predates this unit and the new row is a further rung.
    const earlier = ACHIEVEMENTS.filter((d) => d.id !== id
      && d.rule.source === 'counter' && d.rule.key === def.rule.key);
    assert.ok(earlier.length > 0, `${id} shares its counter with an existing row`);
    const lowest = Math.min(...earlier.map((d) => d.rule.target));
    assert.ok(def.rule.target > lowest,
      `${id} reads ${def.rule.key} at ${def.rule.target}, further than the existing ${lowest}`);
  }
});

test('PRO-13: no new counter and no new event tap were added', () => {
  // The counters and the ledger's event table are the two things the line forbids touching.
  // Pinning the exact sets is what makes that checkable rather than a promise.
  assert.deepEqual(Object.keys(ACHIEVEMENT_COUNTERS).sort(), [
    'contracts', 'creditsEarned', 'crucibleBests', 'crucibleExtractions', 'crushingImpacts',
    'docks', 'jumps', 'latches', 'oreUnits', 'razorReleases', 'throws', 'trades', 'wantedTimes',
  ], 'the counter set is unchanged — PRO-13 adds a milestone, not a measurement');
  assert.deepEqual(Object.keys(ACHIEVEMENT_EVENT_HANDLERS).sort(), [
    'credits:changed', 'dock:docked', 'economy:tradeCompleted', 'heat:changed', 'jump:arrive',
    'massline:throw', 'mining:yield', 'mission:completed', 'tether:latched', 'tether:releaseRated',
    'tether:whipImpact',
  ], 'the ledger listens to exactly the events it listened to before');
});

test('PRO-13: the catalog is a ladder — no counter has two rungs at one target', () => {
  const byCounter = new Map();
  for (const d of ACHIEVEMENTS) {
    if (d.rule.source !== 'counter') continue;
    if (!byCounter.has(d.rule.key)) byCounter.set(d.rule.key, []);
    byCounter.get(d.rule.key).push(d.rule.target);
  }
  for (const [key, targets] of byCounter) {
    assert.equal(new Set(targets).size, targets.length, `${key} has no two rungs at one target`);
  }
  // Counters that count REPEATED acts must still offer the first single act, or a new player's
  // first dock/mission/jump would stop being an achievement. (creditsEarned is a lifetime total
  // and correctly has no rung at 1 — "earn one credit" is not a thing to celebrate.)
  for (const key of ['docks', 'contracts', 'jumps', 'latches', 'throws', 'oreUnits', 'trades']) {
    assert.equal(Math.min(...byCounter.get(key)), 1, `${key} still has its target-1 first rung`);
  }
  const extended = [...byCounter.entries()].filter(([, t]) => t.length > 1).map(([k]) => k).sort();
  assert.ok(extended.length >= 5, `milestones extend several counters, got ${extended.join(',')}`);
});

// ---------------------------------------------------------------------------------------
// seed 4242: a scripted session earns these through the live ledger
// ---------------------------------------------------------------------------------------

function mapStorage() {
  const map = new Map();
// ---------------------------------------------------------------------------------------
// The personal-best comparison (the go-beyond fix). These are the semantics the live route
// depends on; each one was silently wrong before.
// ---------------------------------------------------------------------------------------

test('PRO-13 go-beyond: a run beats the record only when it beats the PRE-run record', () => {
  const bag = emptyAchievementBag();
  const run1 = resultFor({ outcome: 'defeat', score: 900 });
  const run2 = resultFor({ outcome: 'defeat', score: 700 });
  const run3 = resultFor({ outcome: 'extracted', extracted: true, score: 1400 });

  // First run on a key establishes it.
  rememberPreRunBest(bag, run1);
  assert.ok(applyCrucibleResult(bag, run1).includes('crucibleBests'),
    'the first run of a challenge is the one moment that always pays');
  assert.equal(bag.counters.crucibleBests, 1);

  // A worse run must not pay, even though the profile now holds this run's own score.
  rememberPreRunBest(bag, run2);
  assert.deepEqual(applyCrucibleResult(bag, run2), [],
    'a worse run beats nothing');
  assert.equal(bag.counters.crucibleBests, 1, 'the counter did not move for a worse run');
  assert.equal(bag.crucibleBestByKey[recordKey(run1)], 900, 'the record is still the 900 run');

  // A better run pays.
  rememberPreRunBest(bag, run3);
  assert.ok(applyCrucibleResult(bag, run3).includes('crucibleBests'), 'a better run beats the record');
  assert.equal(bag.counters.crucibleBests, 2);
});

test('PRO-13 go-beyond: a profile already containing this run does not poison the comparison', () => {
  // This is the exact shape the live route produces: survivalResults settles the run into the
  // profile BEFORE run:resultsReady, so seeding from the profile first makes prior === score.
  const bag = emptyAchievementBag();
  const run = resultFor({ outcome: 'defeat', score: 1200 });
  settleCrucibleRun({ result: run, run: { seed: run.seed, arenaId: run.arenaId, ruleset: run.ruleset, arenaMutators: [] } });
  // The profile now proves 1200 for this key.
  assert.equal(Object.values(loadCrucibleMeta().records.byKey)[0].bestScore, 1200);

  // rememberPreRunBest runs BEFORE the profile seed (onRunResults order), so the pre-run value is 0.
  rememberPreRunBest(bag, run);
  seedBagFromCrucibleProfile(bag, loadCrucibleMeta());
  // Re-read the remembered pre-run value the way applyCrucibleResult does.
  const key = recordKey(run);
  const prior = Number.isFinite(bag.crucibleBestByRunKey[key]) ? bag.crucibleBestByRunKey[key] : bag.crucibleBestByKey[key];
  assert.equal(prior, 0, 'the pre-run value survives the profile seed');
  assert.ok(cleanCount(run.score) > prior, 'so the establishing run still counts');
});

test('PRO-13 go-beyond: a real record key survives the bag round trip', () => {
  // recordKey() emits a ~217-char pq146:{...} key. The old migrate cap was 200, so EVERY real
  // Crucible personal best was silently dropped on load — the returning player's records were
  // gone. This pins that a real key round-trips.
  const run = resultFor({ outcome: 'defeat', score: 500 });
  const bag = emptyAchievementBag();
  rememberPreRunBest(bag, run);
  applyCrucibleResult(bag, run);
  const key = recordKey(run);
  assert.ok(key.length > 200, `the real key must exceed the old 200 cap, got ${key.length}`);
  const back = parseAchievementBag(JSON.stringify(bag));
  assert.equal(back.crucibleBestByKey[key], 500, 'the personal best survived the round trip');
  assert.ok(Object.hasOwn(back.crucibleBestByRunKey, key),
    'the pre-run key survived too — and it is 0, which is a real value');
});

test('PRO-13 go-beyond: the pre-run map is bounded and max-merged across shells', () => {
  const a = emptyAchievementBag();
  const b = emptyAchievementBag();
  const run = resultFor({ outcome: 'defeat', score: 500 });
  rememberPreRunBest(a, run);
  applyCrucibleResult(a, run);
  b.crucibleBestByRunKey = { ...a.crucibleBestByRunKey };
  const merged = mergeAchievementBags(a, b);
  assert.deepEqual(merged.crucibleBestByRunKey, a.crucibleBestByRunKey,
    'two shells agree on the pre-run map');
  // A hostile/oversized bag is still bounded by the same key-length rule (512).
  const wide = emptyAchievementBag();
  for (let i = 0; i < 20; i += 1) wide.crucibleBestByRunKey[`${'x'.repeat(600)}${i}`] = i + 1;
  const parsed = parseAchievementBag(JSON.stringify({
    schemaVersion: 1, unlocked: {}, counters: {}, crucibleBestByRunKey: wide.crucibleBestByRunKey,
  }));
  assert.equal(Object.keys(parsed.crucibleBestByRunKey).length, 0,
    'a key past the defensive bound is still refused');
});
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(String(k), String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function runScript(events) {
  resetAchievementsForTests();
  const storage = mapStorage();
  const bus = createBus();
  const unlocks = [];
  bus.on(ACHIEVEMENT_UNLOCKED_EVENT, (p) => unlocks.push(p.id ?? p.achievementId));
  const state = { playerId: PLAYER, simTime: 100, onboarding: { active: false, finished: true } };
  useAchievementClock(() => '2026-09-30T00:00:00.000Z');
  const ledger = installAchievements({ bus, state, storage, voice: false });
  try {
    for (const [event, payload] of events) bus.emit(event, payload);
    return { earned: new Set(unlocks), storage, unlocks };
  } finally {
    ledger.dispose({ flush: false });
    resetAchievementsForTests();
  }
}

test('PRO-13: a seed-4242 campaign script earns the dock, contract and jump milestones', () => {
  // Payload shapes copied from the live emit sites (input.js, missions.js, world.js).
  const script = [];
  for (let i = 0; i < 10; i += 1) script.push(['dock:docked', { stationId: `station_${i}` }]);
  for (let i = 0; i < 10; i += 1) {
    script.push(['mission:completed', { missionId: `m${i}`, type: 'cargo_delivery', factionId: 'faction_scn' }]);
  }
  for (let i = 0; i < 25; i += 1) {
    script.push(['jump:arrive', { sectorId: `sector_${i}`, interdicted: false, ambushCount: 0, toPos: { x: 0, z: 0 } }]);
  }
  const { earned } = runScript(script);
  assert.ok(earned.has('returning_caller'), 'ten docks earns Returning Caller');
  assert.ok(earned.has('ten_permits'), 'ten contracts earns Ten Permits');
  assert.ok(earned.has('long_haul'), 'twenty-five jumps earns Long Haul');
  // And the first-session rows still fire, so the ladder reads top to bottom.
  assert.ok(earned.has('berth_assigned') && earned.has('signed_and_delivered')
    && earned.has('out_of_the_pocket'), 'the rung-1 rows still earn alongside the milestones');
});

test('PRO-13: a mining and throwing script earns the two remaining milestones', () => {
  const script = [];
  for (let i = 0; i < 5; i += 1) {
    script.push(['mining:yield', { commodityId: 'cmdty_ore_iron', qty: 200, pos: { x: 0, z: 0 }, minerId: PLAYER }]);
  }
  for (let i = 0; i < 50; i += 1) {
    script.push(['massline:throw', { releaseId: `m:${i}`, payloadId: 9, mode: 'aimed', tick: 100 + i }]);
  }
  const { earned } = runScript(script);
  assert.ok(earned.has('quarry'), 'a thousand ore units earns Quarry');
  assert.ok(earned.has('salvage_crew'), 'fifty throws earns Salvage Crew');
  assert.equal(earned.has('the_hundred_thousand'), false,
    'mining and throwing earn no credits, so the credit milestone stays unearned');
});

test('PRO-13: an NPC miner does not count toward the player\'s quarry milestone', () => {
  // The ledger's own filter: a miner that is someone else must not advance the player's tally, or
  // a busy field would earn the player's achievement for them.
  const script = [];
  for (let i = 0; i < 20; i += 1) {
    script.push(['mining:yield', { commodityId: 'cmdty_ore_iron', qty: 200, pos: { x: 0, z: 0 }, minerId: 999 }]);
  }
  const { earned } = runScript(script);
  assert.equal(earned.has('quarry'), false, 'another miner\'s ore is not the player\'s quarry');
});

test('PRO-13: the first-rung achievement is not gated behind the milestone', () => {
  // The regression a milestone tier invites: if the target-1 row were retargeted upward, a new
  // player's first dock would stop being an achievement. Both rungs must coexist.
  const docks = ACHIEVEMENTS.filter((d) => d.rule.source === 'counter' && d.rule.key === 'docks');
  assert.deepEqual(docks.map((d) => [d.id, d.rule.target]).sort(),
    [['berth_assigned', 1], ['returning_caller', 10]].sort());
});

