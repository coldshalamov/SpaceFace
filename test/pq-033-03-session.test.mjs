// PQ-033.03 — SESSION PROOF: achievements unlock in one headless session on one bus, driven through
// the real systems that own each outcome:
//   • Adventure, seed 47: the live missions system receives Contract 47-A on New Game. The player's
//     ore release (the payload mining.js emits) mints the sample; the dock intent (the payload
//     src/ui/input.js emits) delivers it, and the missions system itself settles the contract and
//     emits mission:completed.
//   • Crucible, seed 33003: runSession + survivalResults run two default-ruleset (swarm) runs to
//     their end; survivalResults settles each into the survivalRecords profile and publishes
//     run:resultsReady. The second is today's daily run and ends by extraction.
// Then the session reloads: a fresh ledger on the same storage announces nothing and replaying the
// same events unlocks nothing. Prints the unlocked achievements and the seeds.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { CONTRACT_47A_B0_TAG, missions as missionsProto } from '../src/systems/missions.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import { clearQueuedChallenge, queueSurvivalChallenge } from '../src/systems/survivalMutators.js';
import {
  loadCrucibleMeta,
  resetCrucibleMetaForTests,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import {
  ACHIEVEMENT_UNLOCKED_EVENT,
  installAchievements,
  loadAchievementBag,
  resetAchievementsForTests,
  useAchievementClock,
} from '../src/systems/achievements.js';
import { CRUCIBLE_ARENA_ID, CRUCIBLE_DEFAULT_RULESET } from '../src/ui/crucibleLaunch.js';

const ADVENTURE_SEED = 47;
const CRUCIBLE_SEED = 33003;
const DAILY = '2026-09-14';

function mapStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function recordingBus() {
  const raw = createBus();
  const emitted = [];
  return {
    emitted,
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
}

function bootAdventure(bus) {
  const state = createGameState(ADVENTURE_SEED);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } });
  const asteroid = { id: 2, type: 'asteroid', alive: true, pos: { x: 180, z: -60 }, data: { typeId: 'ast_common_rock' } };
  const station = { id: 3, type: 'station', alive: true, pos: { x: -420, z: 100 }, data: { stationId: 'station_helios', name: 'Helios Station' } };
  state.entities.set(2, asteroid);
  state.entities.set(3, station);
  state.entityList.push(asteroid, station);
  state.onboarding = { active: false, finished: true };
  state.settings.gameplay.tutorialHints = false;
  const helpers = {
    voice: { say: () => true },
    mulberry32: (value) => {
      let a = value >>> 0;
      return () => ((a = (a + 0x6D2B79F5) >>> 0) / 4294967296);
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  missions.newGame();
  return { state, asteroid, station };
}

function bootCrucible(bus) {
  const state = createGameState(CRUCIBLE_SEED);
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;
  const ctx = { state, bus, helpers: {} };
  runSession.init(ctx);
  survivalResults.init(ctx);
  return { state };
}

function runToActive(bus) {
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: CRUCIBLE_DEFAULT_RULESET, seed: CRUCIBLE_SEED, arenaId: CRUCIBLE_ARENA_ID });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 'session', tick: 0 });
    from = next;
  }
}

function cohortKill(crucible, bus) {
  const id = crucible.state.nextEntityId++;
  const entity = { id, alive: true, type: 'ship', team: 1, pos: { x: 5, z: 5 }, data: { level: 1, runCohort: 'survival' } };
  crucible.state.entities.set(id, entity);
  entity.alive = false;
  bus.emit('entity:killed', { id, killerId: 1, type: 'ship', pos: { x: 5, z: 5 } });
}

test('achievements unlock in one session through the real mission and Crucible systems, exactly once', () => {
  resetAchievementsForTests();
  resetCrucibleMetaForTests();
  clearQueuedChallenge();
  useAchievementClock(() => '2026-09-14T18:00:00.000Z');
  useCrucibleMetaClock(() => '2026-09-14T18:00:00.000Z');
  useCrucibleMetaStorage(mapStorage());
  const storage = mapStorage();

  try {
    const bus = recordingBus();
    const unlocks = [];
    const notices = [];
    bus.on(ACHIEVEMENT_UNLOCKED_EVENT, (payload) => unlocks.push(payload.id));
    bus.on('voice:say', (payload) => notices.push(payload.text));
    const adventure = bootAdventure(bus);
    const ledger = installAchievements({ bus, state: adventure.state, storage, shell: null });
    assert.equal(unlocks.length, 0, 'a fresh profile starts with nothing');
    const contract = adventure.state.missions.active.find((m) => m.storyTag === CONTRACT_47A_B0_TAG);
    assert.ok(contract, 'New Game hands the player Contract 47-A');

    // Adventure: recover the sample at the marked rock, then dock at Helios to deliver it.
    const oreRelease = { commodityId: 'cmdty_ore_iron', qty: 1, minerId: 1, pos: { ...adventure.asteroid.pos } };
    const dockIntent = { stationId: 'station_helios' };
    bus.emit('mining:yield', oreRelease);
    bus.emit('dock:docked', dockIntent);
    const completed = bus.emitted.filter((e) => e.event === 'mission:completed');
    assert.equal(completed.length, 1, 'the missions system settled Contract 47-A itself');
    assert.equal(adventure.state.story.beatIndex, 1);
    // The missions system subscribed before the ledger (as the registry does before src/main.js
    // installs it), so on the one dock it settles the contract first and "Signed and Delivered"
    // lands a moment before "Berth Assigned" — both from that single dock.
    assert.deepEqual(unlocks, ['rock_has_a_price', 'signed_and_delivered', 'berth_assigned']);

    // Crucible run 1: a defeat on wave 4. Play time passes between the dock and the arena.
    adventure.state.simTime = 900;
    const crucible = bootCrucible(bus);
    runToActive(bus);
    crucible.state.run.wave = 4;
    cohortKill(crucible, bus);
    cohortKill(crucible, bus);
    bus.emit('run:awardRequested', { credits: 40, xp: 260, score: 900 });
    bus.emit('player:death', { attacker: 'Reaver Corsair', cause: 'Destroyed by Reaver Corsair', recoverable: true });
    let results = bus.emitted.filter((e) => e.event === 'run:resultsReady');
    assert.equal(results.length, 1);
    assert.equal(results[0].payload.outcome, 'defeat');
    assert.deepEqual(unlocks.slice(3), ['into_the_crucible']);

    // Crucible run 2: "run again" goes through New Game, which resets the run and forgets the last
    // result; then today's daily reaches the wave-10 bench, beats the score, and extracts.
    adventure.state.simTime = 1500;
    runSession.newGame();
    survivalResults.newGame();
    queueSurvivalChallenge({ seed: CRUCIBLE_SEED, ruleset: CRUCIBLE_DEFAULT_RULESET, dailyDateKey: DAILY });
    runToActive(bus);
    assert.equal(crucible.state.run.phase, 'active', 'the second run is live');
    crucible.state.run.wave = 10;
    for (let i = 0; i < 5; i += 1) cohortKill(crucible, bus);
    bus.emit('run:awardRequested', { credits: 90, xp: 900, score: 1400 });
    bus.emit('run:endRequested', { outcome: 'aborted', reason: 'extracted', tick: 1 });
    results = bus.emitted.filter((e) => e.event === 'run:resultsReady');
    assert.equal(results.length, 2);
    assert.equal(results[1].payload.outcome, 'extracted');
    assert.deepEqual(unlocks.slice(4).sort(), ['better_than_last_time', 'same_seed_same_day', 'tenth_wave', 'walked_out']);

    const profile = loadCrucibleMeta();
    assert.equal(profile.records.lifetime.runs, 2, 'both runs settled into survivalRecords');
    assert.equal(profile.records.lifetime.deepestWave, 10);
    assert.ok(profile.daily.byDate[DAILY], 'the daily board holds today');

    const snap = ledger.snapshot();
    assert.equal(snap.unlockedCount, 8);
    assert.equal(new Set(unlocks).size, unlocks.length, 'no achievement unlocked twice');
    ledger.dispose();

    // Reload: a new ledger on the same storage, then the same events again.
    const bus2 = recordingBus();
    const again = [];
    bus2.on(ACHIEVEMENT_UNLOCKED_EVENT, (payload) => again.push(payload.id));
    const reloaded = installAchievements({ bus: bus2, state: adventure.state, storage, shell: null });
    bus2.emit('mining:yield', oreRelease);
    bus2.emit('dock:docked', dockIntent);
    bus2.emit('run:resultsReady', results[1].payload);
    assert.deepEqual(again, [], 'reload plus replay unlocks nothing');
    assert.equal(Object.keys(loadAchievementBag(storage).unlocked).length, 8, 'the eight unlocks are persisted');
    reloaded.dispose();

    console.log(`PQ-033.03 session seeds: adventure=${ADVENTURE_SEED} crucible=${CRUCIBLE_SEED} daily=${DAILY}`);
    console.log(`PQ-033.03 session unlocked ${unlocks.length}/${ACHIEVEMENTS.length}: ${unlocks.join(', ')}`);
    console.log(`PQ-033.03 session crucible: runs=${profile.records.lifetime.runs} deepestWave=${profile.records.lifetime.deepestWave} bests=${snap.counters.crucibleBests} extractions=${snap.counters.crucibleExtractions}`);
    console.log(`PQ-033.03 session notices: ${notices.map((text) => JSON.stringify(text)).join(' | ')}`);
    console.log('PQ-033.03 session reload: 0 new unlocks after replay');
  } finally {
    clearQueuedChallenge();
    resetAchievementsForTests();
    resetCrucibleMetaForTests();
  }
});
