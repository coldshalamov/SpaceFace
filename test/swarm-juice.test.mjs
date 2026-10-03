// SWARM-02 — the arcade juice layer: the chain hero, kill popups with cause tags, the
// multi-kill announcer, the round slam and clear tally, the boss card/bar/down, and the
// one Arcade effects setting (SWARM_ARCADE §5, §10 step 2).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import {
  SWARM_CHAIN_TIERS,
  SWARM_CLOSE_CALL_HULL,
  SWARM_HITSTOP_SOURCE,
  arcadeEffectsLevel,
  swarmChainNextTier,
  swarmChainTier,
  swarmChainTierCrossed,
  swarmHitStopSeconds,
  swarmKillCauseWord,
  swarmMultiKillWord,
  swarmPileUp,
  swarmRoundTally,
} from '../src/data/swarmJuice.js';
import { swarmPopupText, swarmSlamSub } from '../src/ui/swarmJuiceHud.js';

const DT = 1 / 60;

function boot({ ruleset = 'swarm', phase = 'active', effects = 'full' } = {}) {
  const state = createGameState(9);
  state.settings.video.arcadeEffects = effects;
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = {
    id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship',
    hull: 200, hullMax: 200,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.simTime = 0;

  const ctx = { state, bus, helpers: {}, timeEffects: createTimeEffects(state) };
  runSession.init(ctx);
  swarmJuice.init(ctx);
  state.run = createRunState({ kind: 'survival', ruleset, seed: 4242 });
  state.run.phase = phase;
  state.run.wave = 3;
  return { state, bus, emitted, player, ctx };
}

let victimN = 0;
/** Spawn a cohort body, then emit its death at the current sim time. */
function kill(h, { cause = 'direct', surface = null, killer = null, alive = false } = {}) {
  const id = h.state.nextEntityId++;
  const victim = {
    id, alive, type: 'ship', pos: { x: 10, z: 10 },
    data: { runCohort: SURVIVAL_COHORT_TAG, tag: victimN++, stuntThreat: { baseScore: 120, credits: 4 } },
  };
  h.state.entities.set(id, victim);
  h.state.entityList.push(victim);
  h.bus.emit('entity:killed', {
    id, killerId: killer != null ? killer : h.state.playerId, type: 'ship',
    pos: { x: 10, z: 10 },
    presentation: { cause, surface, playerCaused: killer == null || killer === h.state.playerId },
  });
  return victim;
}

function advance(h, seconds) {
  h.state.simTime += seconds;
  swarmJuice.update(DT, h.state);
}

function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}

test('swarmJuice is registered beside the chain and ticks for the hit-stop and boss bar', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('swarmJuice'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('swarmJuice'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('swarmJuice') > PRODUCTION_UPDATE_ORDER.indexOf('swarmChain'),
    'it reads the kills this tick settled, after the chain has');
  assert.ok(PRODUCTION_INIT_ORDER.includes('swarmJuiceHud'));
});

// --- pure vocabulary ---------------------------------------------------------------

test('chain tiers: the named marks in order, and crossing is reported once', () => {
  assert.deepEqual(SWARM_CHAIN_TIERS.map((t) => t.at), [10, 25, 50, 100, 200]);
  assert.equal(swarmChainTier(9), null);
  assert.equal(swarmChainTier(10).name, 'IGNITION');
  assert.equal(swarmChainTier(99).name, 'NOVA');
  assert.equal(swarmChainTier(500).name, 'SINGULARITY');
  assert.equal(swarmChainNextTier(0).name, 'IGNITION');
  assert.equal(swarmChainNextTier(200), null, 'the top has no next mark');
  assert.equal(swarmChainTierCrossed(25, 0).name, 'FLARE');
  assert.equal(swarmChainTierCrossed(30, 25), null, 'between marks says nothing');
  assert.equal(swarmChainTierCrossed(120, 9).name, 'SUPERNOVA', 'a burst reports the highest');
});

test('kill cause words: SLAMMED, BANKED, SLUNG, MINED, SHREDDED, FRIENDLY FIRE', () => {
  assert.equal(swarmKillCauseWord({ cause: 'terrain', surface: 'terrain' }), 'SLAMMED');
  assert.equal(swarmKillCauseWord({ cause: 'terrain', surface: 'structure' }), 'BANKED');
  assert.equal(swarmKillCauseWord({ cause: 'collision' }), 'SLUNG');
  assert.equal(swarmKillCauseWord({ cause: 'explosive' }), 'MINED');
  assert.equal(swarmKillCauseWord({ cause: 'direct' }), 'SHREDDED');
  assert.equal(swarmKillCauseWord({ cause: 'direct', friendlyFire: true }), 'FRIENDLY FIRE');
  assert.equal(swarmKillCauseWord({}), 'DOWN');
});

test('multi-kill words and the pile-up rule', () => {
  assert.equal(swarmMultiKillWord(1), null);
  assert.equal(swarmMultiKillWord(2), 'DOUBLE');
  assert.equal(swarmMultiKillWord(3), 'TRIPLE');
  assert.equal(swarmMultiKillWord(4), 'QUAD');
  assert.equal(swarmMultiKillWord(9), 'SWARM WIPE');
  assert.ok(swarmPileUp(['terrain', 'collision', 'terrain']), 'all physics is a pile-up');
  assert.ok(!swarmPileUp(['terrain', 'direct']), 'a mixed burst is not');
  assert.ok(!swarmPileUp(['terrain']), 'one body is not a pile-up');
});

test('the tally lists what was earned, in order, and skips what was not', () => {
  const rows = swarmRoundTally({ flawless: true, durationS: 12, kills: 31, bestChain: 44 });
  assert.deepEqual(rows.map((r) => r.id), ['flawless', 'speed', 'kills', 'chain']);
  assert.equal(rows[2].value, '×31');
  const flat = swarmRoundTally({ flawless: false, durationS: 80, kills: 3, bestChain: 0 });
  assert.deepEqual(flat.map((r) => r.id), ['kills'], 'a flat round is short, not shamed');
});

test('hit-stop scales with chain tier inside the 40–80 ms bound', () => {
  assert.equal(swarmHitStopSeconds(0), 0.04);
  assert.ok(swarmHitStopSeconds(10) > swarmHitStopSeconds(9));
  assert.equal(swarmHitStopSeconds(500), 0.08, 'capped at the top');
});

test('the Arcade effects setting: full/reduced/off, accessibility pulls it down', () => {
  assert.equal(arcadeEffectsLevel({ video: {} }), 'full');
  assert.equal(arcadeEffectsLevel({ video: { arcadeEffects: 'reduced' } }), 'reduced');
  assert.equal(arcadeEffectsLevel({ video: { arcadeEffects: 'off' } }), 'off');
  assert.equal(arcadeEffectsLevel({ video: { arcadeEffects: 'full', motionReduce: true } }), 'reduced',
    'reduced motion caps the arcade layer');
  assert.equal(arcadeEffectsLevel({ video: { arcadeEffects: 'off', motionReduce: true } }), 'off',
    'off stays off — accessibility never turns effects UP');
  assert.equal(arcadeEffectsLevel({ video: {}, accessibility: { flashReduce: true } }), 'reduced');
});

test('popup text: the figure rides the cause word', () => {
  assert.equal(swarmPopupText({ word: 'SLAMMED', score: 120 }), '+120 SLAMMED');
  assert.equal(swarmPopupText({ word: 'MINED', score: 0, credits: 4 }), '+4 CR MINED');
  assert.equal(swarmPopupText({ word: 'FRIENDLY FIRE' }), 'FRIENDLY FIRE');
  assert.equal(swarmSlamSub({ boss: { name: 'The Anvil' } }), 'BOSS · The Anvil');
  assert.equal(swarmSlamSub({ newcomer: { name: 'Detonator Dart' } }), 'NEW THREAT · Detonator Dart');
});

// --- the detector ---------------------------------------------------------------------

test('every paid kill emits a popup at the kill point with its cause word', () => {
  const h = boot();
  kill(h, { cause: 'terrain_collision', surface: 'terrain' });
  const pops = named(h, 'swarm:killPopup');
  assert.equal(pops.length, 1);
  assert.equal(pops[0].payload.word, 'SLAMMED');
  assert.equal(pops[0].payload.score, 120, 'the kill figure rides the popup');
  assert.deepEqual(pops[0].payload.pos, { x: 10, z: 10 });
  swarmJuice.destroy();
});

test('multi-kill announcer: DOUBLE, TRIPLE inside the window — and silence outside it', () => {
  const h = boot();
  kill(h, { cause: 'direct' });
  advance(h, 0.3);
  kill(h, { cause: 'direct' });
  advance(h, 0.3);
  kill(h, { cause: 'explosive' });
  const calls = named(h, 'swarm:announce').filter((e) => e.payload.kind === 'multikill');
  assert.deepEqual(calls.map((c) => c.payload.text), ['DOUBLE', 'TRIPLE']);
  const h2 = boot();
  kill(h2, { cause: 'direct' });
  advance(h2, 1.0); // the window is ~0.6 s — a slower pair is two singles
  kill(h2, { cause: 'direct' });
  assert.equal(named(h2, 'swarm:announce').filter((e) => e.payload.kind === 'multikill').length, 0);
  swarmJuice.destroy();
});

test('a pure physics burst is a PILE-UP ×N, not a generic word', () => {
  const h = boot();
  kill(h, { cause: 'terrain_collision', surface: 'terrain' });
  kill(h, { cause: 'ship_collision', surface: 'craft' });
  kill(h, { cause: 'terrain_collision', surface: 'terrain' });
  const calls = named(h, 'swarm:announce').filter((e) => e.payload.kind === 'pileup');
  assert.equal(calls.length, 2, 'each new body in the pile re-says the count');
  assert.equal(calls[1].payload.text, 'PILE-UP ×3');
  assert.equal(named(h, 'swarm:announce').filter((e) => e.payload.kind === 'multikill').length, 0);
  swarmJuice.destroy();
});

test('COLLATERAL: a cohort body killed by a cohort body is named and popups as FRIENDLY FIRE', () => {
  const h = boot();
  const roomKiller = { id: h.state.nextEntityId++, alive: true, type: 'ship', pos: { x: 0, z: 0 },
    data: { runCohort: SURVIVAL_COHORT_TAG } };
  h.state.entities.set(roomKiller.id, roomKiller);
  kill(h, { cause: 'ship_collision', surface: 'craft', killer: roomKiller.id });
  const calls = named(h, 'swarm:announce').filter((e) => e.payload.kind === 'collateral');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.text, 'COLLATERAL');
  assert.equal(named(h, 'swarm:killPopup')[0].payload.word, 'FRIENDLY FIRE');
  swarmJuice.destroy();
});

test('REVENGE names the kill that answers the last hit on you', () => {
  const h = boot();
  const hitter = { id: h.state.nextEntityId++, alive: true, type: 'ship', pos: { x: 0, z: 0 },
    data: { runCohort: SURVIVAL_COHORT_TAG } };
  h.state.entities.set(hitter.id, hitter);
  h.bus.emit('combat:damage', { isPlayer: true, attackerId: hitter.id, hullDamage: 12 });
  // A cohort body is the victim — REVENGE needs the hitter to be the one you killed.
  hitter.data.swarmChampion = false;
  h.bus.emit('entity:killed', {
    id: hitter.id, killerId: h.state.playerId, type: 'ship', pos: { x: 0, z: 0 },
    presentation: { cause: 'kinetic' },
  });
  const calls = named(h, 'swarm:announce').filter((e) => e.payload.kind === 'revenge');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.text, 'REVENGE');
  swarmJuice.destroy();
});

test('CLOSE CALL: a kill under a tenth of hull gets named', () => {
  const h = boot();
  h.player.hull = h.player.hullMax * (SWARM_CLOSE_CALL_HULL / 2);
  kill(h, { cause: 'direct' });
  const calls = named(h, 'swarm:announce').filter((e) => e.payload.kind === 'closecall');
  assert.equal(calls.length, 1);
  swarmJuice.destroy();
});

test('the round slam fires at plan time with the boss card and the debut card', () => {
  const h = boot();
  h.state.run.phase = 'wave_intro';
  h.bus.emit('run:wavePlanned', { wave: 10, plan: {} });
  const slam = named(h, 'swarm:roundSlam');
  assert.equal(slam.length, 1);
  assert.equal(slam[0].payload.wave, 10);
  assert.ok(slam[0].payload.boss && slam[0].payload.boss.name, 'a boss round names its boss');
  const intro = named(h, 'swarm:bossIntro');
  assert.equal(intro.length, 1);
  assert.equal(intro[0].payload.name, "Dreadnought 'Iron Maw'");
  swarmJuice.destroy();
});

test('a debut round carries the new threat and its five-word counter', () => {
  const h = boot();
  h.state.run.phase = 'wave_intro';
  h.bus.emit('run:wavePlanned', { wave: 5, plan: {} });
  const slam = named(h, 'swarm:roundSlam')[0];
  assert.equal(slam.payload.newcomer.enemyId, 'detonator_dart');
  assert.equal(slam.payload.newcomer.counter, 'It explodes. Throw it.');
  swarmJuice.destroy();
});

test('the clear tally: FLAWLESS and ROOM KILLS land on the wave-cleared receipt', () => {
  const h = boot();
  h.bus.emit('run:waveStarted', { wave: 3 });
  kill(h, { cause: 'direct' });
  kill(h, { cause: 'terrain' });
  h.bus.emit('run:waveCleared', { wave: 3 });
  const clear = named(h, 'swarm:roundClear');
  assert.equal(clear.length, 1);
  const ids = clear[0].payload.tally.map((r) => r.id);
  assert.ok(ids.includes('flawless'), 'no hull damage means FLAWLESS');
  assert.ok(ids.includes('kills'));
  const last = named(h, 'swarm:announce').filter((e) => e.payload.kind === 'lastone');
  assert.equal(last.length, 1, 'the final kill right before the clear is the LAST ONE');
  swarmJuice.destroy();
});

test('a hull hit inside the wave costs the FLAWLESS line', () => {
  const h = boot();
  h.bus.emit('run:waveStarted', { wave: 3 });
  h.bus.emit('combat:damage', { isPlayer: true, attackerId: 999, hullDamage: 5 });
  kill(h, { cause: 'direct' });
  h.bus.emit('run:waveCleared', { wave: 3 });
  const ids = named(h, 'swarm:roundClear')[0].payload.tally.map((r) => r.id);
  assert.ok(!ids.includes('flawless'));
  swarmJuice.destroy();
});

test('the boss bar: a champion wave reports hp, and the last champion down says BOSS DOWN', () => {
  const h = boot();
  h.state.run.wave = 10;
  h.state.run.phase = 'wave_intro';
  h.bus.emit('run:wavePlanned', { wave: 10, plan: {} });
  h.state.run.phase = 'active';
  const boss = {
    id: h.state.nextEntityId++, alive: true, type: 'ship', pos: { x: 40, z: 0 },
    hull: 500, hullMax: 1000,
    data: { runCohort: SURVIVAL_COHORT_TAG, runWave: 10, swarmChampion: true, stuntThreat: { baseScore: 900, credits: 60 } },
  };
  h.state.entities.set(boss.id, boss);
  advance(h, DT * 20); // the collector sweeps on its 15-tick cadence
  const hp = named(h, 'swarm:bossHp');
  assert.ok(hp.length >= 1, 'the bar publishes once the champion is found');
  assert.ok(Math.abs(hp[0].payload.frac - 0.5) < 0.01, `frac reads the hull (${hp[0].payload.frac})`);
  boss.alive = false;
  h.bus.emit('entity:killed', {
    id: boss.id, killerId: h.state.playerId, type: 'ship', pos: { x: 40, z: 0 },
    presentation: { cause: 'explosive' },
  });
  const down = named(h, 'swarm:bossDown');
  assert.equal(down.length, 1);
  assert.equal(down[0].payload.name, "Dreadnought 'Iron Maw'");
  assert.ok(named(h, 'swarm:announce').some((e) => e.payload.text === 'BOSS DOWN'));
  swarmJuice.destroy();
});

test('the chain tier crossing lands its name; a broken chain shatters', () => {
  const h = boot();
  h.bus.emit('swarm:chain', { chain: 25, best: 25, cause: 'terrain', step: 2, at: 0, wave: 3 });
  const tiers = named(h, 'swarm:chainTier');
  assert.equal(tiers.length, 1);
  assert.equal(tiers[0].payload.name, 'FLARE');
  h.bus.emit('swarm:chainBroken', { chain: 26, best: 26 });
  const shatter = named(h, 'swarm:chainShatter');
  assert.equal(shatter.length, 1);
  assert.equal(shatter[0].payload.chain, 26);
  swarmJuice.destroy();
});

test('hit-stop dips the world on a big kill through the time-effects channel, then releases', () => {
  const h = boot();
  kill(h, { cause: 'direct' });
  kill(h, { cause: 'direct' });
  kill(h, { cause: 'direct' }); // TRIPLE is a beat worth the dip
  assert.ok(h.state.timeScale < 1, `the dip is live (timeScale ${h.state.timeScale})`);
  for (let i = 0; i < 30; i++) advance(h, DT);
  assert.equal(h.state.timeScale, 1, 'the lease released itself');
  swarmJuice.destroy();
});

test('Reduced keeps the words and drops the dip; Off still emits — the presenter owns off', () => {
  const h = boot({ effects: 'reduced' });
  kill(h, { cause: 'direct' });
  kill(h, { cause: 'direct' });
  kill(h, { cause: 'direct' });
  assert.equal(h.state.timeScale, 1, 'no hit-stop under reduced effects');
  assert.ok(named(h, 'swarm:announce').some((e) => e.payload.text === 'TRIPLE'),
    'the announcer still speaks');
  swarmJuice.destroy();
});

test('the layer is swarm-only: the scored arc and ambient traffic get silence', () => {
  const h = boot({ ruleset: 'scored' });
  kill(h, { cause: 'direct' });
  kill(h, { cause: 'direct' });
  assert.equal(named(h, 'swarm:killPopup').length, 0);
  assert.equal(named(h, 'swarm:announce').length, 0);
  const h2 = boot();
  // An ambient bystander with no cohort mark is never arcade business.
  const id = h2.state.nextEntityId++;
  h2.state.entities.set(id, { id, alive: false, type: 'ship', pos: { x: 0, z: 0 }, data: {} });
  h2.bus.emit('entity:killed', { id, killerId: h2.state.playerId, type: 'ship', pos: { x: 0, z: 0 } });
  assert.equal(named(h2, 'swarm:killPopup').length, 0);
  swarmJuice.destroy();
});

test('the hit-stop lease cannot outlive the system', () => {
  const h = boot();
  kill(h, { cause: 'direct' });
  kill(h, { cause: 'direct' });
  kill(h, { cause: 'direct' });
  assert.ok(h.state.timeScale < 1);
  swarmJuice.destroy();
  assert.equal(h.state.timeScale, 1, 'destroy releases the lease');
});
