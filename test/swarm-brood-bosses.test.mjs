// SWARM-07 B3 — the Brood champions: the Brood Queen at wave 70 and the Tendril at wave 80.
//
// Both are REAL entities on the shipped capital machinery (the FB-024 contract): the wave's
// plan carries a single champion package, the hull materializes through the ordinary cohort
// path, and `capitalBoss:start` hands it to the authored score. The Queen's flood is the
// brood cohort itself — her wave fields nothing but mites at the full population curve. The
// Tendril's body is the brood engine's segment chain: light bodies that trail the champion
// hull, split Centipede-style when a middle link dies, and collapse when the head does.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { capitalOrderKey } from '../src/ai/capitalBossOrders.js';
import {
  SWARM_RULESET, swarmBossFor, swarmCatalogIssues, swarmEligibleEnemyIds,
} from '../src/data/swarmMode.js';
import {
  swarmBroodPlan, swarmBroodPopulation, swarmBroodBossFor,
  TENDRIL_HEAD_LOOT_ID, TENDRIL_SEG_PER_WORM, TENDRIL_SEG_SPACING,
  SWARM_BROOD_MIN,
} from '../src/data/swarmBrood.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';

function boot(wave) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    routeCombatDamage(packet) { return packet; },
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  state.run.arenaId = ARENA;
  state.run.phase = 'active';
  state.run.wave = wave;

  const ctx = { state, bus, helpers };
  survivalWave.init(ctx);
  const capSys = createProductionCapitalBossEncounters();
  capSys.init(ctx);
  return { state, bus, emitted, spawned, capSys };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
    h.state.simTime += DT;
    survivalWave.update(DT);
    h.capSys.update(DT);
  }
}

function planFor(wave) {
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
  assert.ok(!plan.error, `wave ${wave} plans`);
  return plan;
}

function startWave(h, wave) {
  h.bus.emit('run:wavePlanned', { wave, plan: planFor(wave) });
  h.bus.emit('run:waveStarted', { wave });
  tick(h, 2);
}

function cohort(h) {
  return h.spawned.filter((e) => e.data && e.data.runCohort === SURVIVAL_COHORT_TAG);
}
function capitalBody(h) {
  return cohort(h).find((e) => e.data.missionTag === 'capital_boss');
}
function fightStore(h) {
  return h.state.capitalBossEncounters;
}
function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}

test('the rotation walks eight champions — the brood champions land at waves 70 and 80', () => {
  const order = ['iron_maw', 'mirrorjaw_foreman', 'forge_regent', 'corsair_wing', 'the_anvil',
    'quiet_choir', 'brood_queen', 'brood_tendril'];
  for (const [i, wave] of [10, 20, 30, 40, 50, 60, 70, 80].entries()) {
    const boss = swarmBossFor(wave);
    assert.equal(boss && boss.id, order[i], `wave ${wave}`);
  }
  assert.equal(swarmBossFor(90).id, 'iron_maw', 'the rotation wraps after the eighth');
  const w70 = planFor(70).swarm;
  assert.equal(w70.bossScoreId, 'capital_boss_brood_queen');
  assert.equal(w70.bossEnemyId, 'brood_queen');
  assert.equal(w70.bossRoom, 'brood_nest');
  const w80 = planFor(80).swarm;
  assert.equal(w80.bossScoreId, 'capital_boss_tendril');
  assert.equal(w80.bossEnemyId, 'brood_tendril');
  assert.equal(w80.bossRoom, 'coil_field');
  for (const wave of [70, 80]) {
    const champions = planFor(wave).packages.filter((p) => p.champion === true);
    assert.equal(champions.length, 1, `wave ${wave} fields one capital hull`);
    assert.equal(champions[0].count, 1);
  }
  // The whole rotation still validates — the new rows name shipped ids end to end.
  assert.deepEqual(swarmCatalogIssues(), []);
});

test('the prewarm seam sees single-enemy boss rows — the eligible-ids fix', () => {
  // Reading boss.packages directly made every capital champion invisible to the launch/dwell
  // prewarm. bossPackagesFor is the seam; the ids the wave actually fields must appear.
  assert.ok(swarmEligibleEnemyIds(20).has('mirrorjaw_foreman'), 'the Foreman prewarms');
  assert.ok(swarmEligibleEnemyIds(70).has('brood_queen'), 'the Queen prewarms');
  assert.ok(swarmEligibleEnemyIds(80).has('brood_tendril'), 'the Tendril prewarms');
});

test('the queen wave fields the flood — every body a mite, at the full population curve', () => {
  // The flood is the fight: her wave ignores the boss-fraction discount (that law exists so a
  // champion stays legible — the Queen IS her own flood, so the full curve stays on).
  const plan = swarmBroodPlan(70, () => 0.5);
  assert.equal(plan.length, 1, 'one family, nothing else');
  assert.equal(plan[0].id, 'mite');
  assert.equal(plan[0].count, swarmBroodPopulation(70));
  // The population law pins the band: boss waves discount to the fraction's floor, hers does not.
  assert.equal(swarmBroodPopulation(70), 400, 'the curve maxed out long before wave 70 — hers keeps it');
  const w50 = swarmBroodPopulation(50);
  assert.ok(w50 >= SWARM_BROOD_MIN && w50 < swarmBroodPopulation(70),
    'an ordinary boss wave still discounts toward the floor');
  assert.equal(swarmBroodBossFor(70), 'brood_queen');
  assert.equal(swarmBroodBossFor(80), 'brood_tendril');
  assert.equal(swarmBroodBossFor(50), null, 'other champions carry no brood rule');
  assert.equal(swarmBroodBossFor(71), null, 'ordinary waves carry no brood boss');
});

test('the queen lands as a real capital boss and her score runs the fight', () => {
  const h = boot(70);
  startWave(h, 70);
  const boss = capitalBody(h);
  assert.ok(boss, 'the Queen hull is a real cohort body');
  assert.equal(boss.data.lootTableId, 'brood_queen');
  assert.equal(boss.data.runWave, 70);
  assert.equal(boss.data.bountyHunt, undefined, 'capital champions never enter the hunter path');

  const fight = fightStore(h).fights['swarm:w70'];
  assert.ok(fight, 'capitalBoss:start opened a fight record');
  assert.equal(fight.encounterId, 'capital_boss_brood_queen');
  assert.equal(fight.bossId, boss.id);
  assert.equal(fight.targetId, h.state.playerId);

  const order = fightStore(h).orders[capitalOrderKey(boss.id)];
  assert.ok(order, 'the boss hull is under a capital order');
  assert.equal(order.scoreOwnsAttacks, true);

  // The score runs on its own observation: past the intro the fight starts and the flood's
  // language telegraphs through the ordinary capital seam.
  tick(h, 620);
  assert.equal(fight.started, true, 'the score is running on the live pair');
  assert.ok(named(h, 'capitalBoss:started').length > 0);
  assert.ok(named(h, 'capitalBoss:telegraph').length > 0, 'her beats telegraph before they land');
});

test('the queen\'s call lands real damage and act II requests her brood_screen wing', () => {
  const h = boot(70);
  startWave(h, 70);
  const boss = capitalBody(h);
  assert.ok(boss, 'the Queen hull is a real cohort body');
  const player = h.state.entities.get(h.state.playerId);
  // Park the pilot inside the call's band: 130 wu sits inside brood_call's 30-230 ring (and
  // inside the engage bubble), so the first authored cast has a body inside its shape when
  // the tell expires — the machinery is shared with the covered capitals; this pins the
  // Queen's own packet actually reaching the damage port.
  player.pos.x = boss.pos.x + 130;
  player.pos.z = boss.pos.z;

  // 180 intro + 150 transition, then a 126-tick tell — the call is act I's whole opening.
  tick(h, 520);
  const hits = named(h, 'capitalBoss:hit').filter((e) => e.payload.targetId === player.id);
  assert.ok(hits.length > 0, 'a live cast reached active with the pilot inside the shape');
  assert.equal(hits[0].payload.beatId, 'brood_call', 'the call is the first thing she throws');
  const damages = named(h, 'capitalBoss:damage').filter((e) => e.payload.targetId === player.id);
  assert.ok(damages.length > 0, 'the hit routes through the one damage port');
  assert.equal(damages[0].payload.origin && damages[0].payload.origin.kind, 'capital_score');
  assert.equal(damages[0].payload.attackerId, boss.id);
  assert.equal(damages[0].payload.packet.channels.kinetic, 6, 'the authored packet pays out');

  // Hurt her past the nest's 0.62 threshold — the screen request is the score's own ask,
  // stamped through the survival port exactly like the Foreman's covered screen.
  boss.hull = Math.floor(boss.hullMax * 0.5);
  tick(h, 40);
  const requests = named(h, 'capitalBoss:wingRequested');
  const screen = requests.find((e) => e.payload.wing && e.payload.wing.id === 'brood_screen');
  assert.ok(screen, 'act II asks for the brood_screen wing');
  const memberIds = named(h, 'survivalWave:cohortJoined').flatMap((e) => e.payload.ids || []);
  assert.equal(memberIds.length, 2, 'the screen fields its two authored bodies');
  const members = memberIds.map((id) => h.state.entities.get(id)).filter(Boolean);
  for (const member of members) {
    assert.equal(member.data.capitalWingGrammar, 'warden_screen');
    assert.equal(member.data.capitalWingTwist, 'protect_the_pack');
    assert.equal(member.data.runCohort, SURVIVAL_COHORT_TAG);
  }
});

test('the tendril lands as a real capital boss on wave 80', () => {
  const h = boot(80);
  startWave(h, 80);
  const boss = capitalBody(h);
  assert.ok(boss, 'the Tendril head hull landed');
  assert.equal(boss.data.lootTableId, 'brood_tendril');
  const fight = fightStore(h).fights['swarm:w80'];
  assert.ok(fight);
  assert.equal(fight.encounterId, 'capital_boss_tendril');
  tick(h, 200);
  assert.equal(fight.started, true);
});

// --- the body behind the head: the engine's segment chain ---------------------------------

function broodBoot(wave) {
  const state = createGameState(SEED);
  state.mode = 'flight';
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const damages = [];
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 400,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  state.run.arenaId = ARENA;
  state.run.phase = 'active';
  state.run.wave = wave;
  const engine = createBroodEngine({
    bus,
    getState: () => state,
    fieldList: () => [],
    routeDamage: (request) => { damages.push(request); return request; },
  });
  engine.prepareWave(state.run, wave);
  engine.spawnWave(state);
  return { state, bus, emitted, engine, damages };
}

function tendrilStep(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
    h.state.simTime += DT;
    h.engine.step(h.state);
  }
}

function addTendrilHead(h, x = 120, z = 0, vx = -30, vz = 0) {
  const head = {
    id: h.state.nextEntityId++, alive: true, type: 'ship', team: 2,
    pos: { x, z }, vel: { x: vx, z: vz }, radius: 26, mass: 300,
    data: { lootTableId: TENDRIL_HEAD_LOOT_ID, runCohort: SURVIVAL_COHORT_TAG },
  };
  h.state.entities.set(head.id, head);
  h.state.entityList.push(head);
  return head;
}

test('the tendril wave arms the body — the chain trails the head and never touches the ship budget', () => {
  const h = broodBoot(80);
  assert.equal(h.engine.view.tendril, true, 'the wave armed tendril mode');
  assert.equal(h.engine.view.segAliveCount, 0, 'no chain before the head lands');

  const head = addTendrilHead(h);
  tendrilStep(h, 1);
  assert.equal(h.engine._tendril().spawned, true, 'the chain laid behind the head');
  assert.equal(h.engine.view.segAliveCount, TENDRIL_SEG_PER_WORM);
  // The link contract: slot 0 trails the head, every deeper link trails the one ahead.
  const { lead, alive } = h.engine._segs;
  assert.equal(lead[0], h.engine.view.segLeadHead, 'the first link trails the head');
  assert.equal(lead[3], 2, 'each deeper link trails the one ahead');

  // The chain follows: move the head and the constraint keeps the authored spacing.
  head.pos.x -= TENDRIL_SEG_SPACING * 2;
  tendrilStep(h, 3);
  const { x, z } = h.engine._segs;
  const dx0 = x[0] - head.pos.x;
  const dz0 = z[0] - head.pos.z;
  const d0 = Math.sqrt(dx0 * dx0 + dz0 * dz0);
  assert.ok(Math.abs(d0 - TENDRIL_SEG_SPACING) < 0.5,
    `the first link holds the authored spacing (got ${d0.toFixed(2)})`);
  const dx3 = x[3] - x[2];
  const dz3 = z[3] - z[2];
  assert.ok(Math.abs(Math.sqrt(dx3 * dx3 + dz3 * dz3) - TENDRIL_SEG_SPACING) < 0.5,
    'link-to-link spacing holds through the weave');
  void alive;
});

test('the sling counter: a rock severs the weave, a mid-link kill splits the body', () => {
  const h = broodBoot(80);
  addTendrilHead(h);
  tendrilStep(h, 1);
  const { x, z, alive, lead } = h.engine._segs;

  // A THROWN rock — moving fast relative to the body — kills the link it touches and reads
  // 'collision' (SLUNG), exactly the room law the flock obeys. Small enough to take exactly
  // one link: the freed follower advances toward the pilot the same tick it splits, so the
  // kill reach (radius*1.05 + seg radius) must stay under the 9 wu spacing minus that step.
  const rock = {
    id: h.state.nextEntityId++, alive: true, type: 'asteroid',
    pos: { x: x[4], z: z[4] }, vel: { x: 60, z: 0 }, radius: 2, mass: 3000,
    collides: true,
  };
  h.state.entities.set(rock.id, rock);
  h.state.entityList.push(rock);
  tendrilStep(h, 1);
  assert.equal(alive[4], 0, 'the slung rock killed the link it hit');
  assert.equal(lead[5], h.engine.view.segLeadFree,
    'the Centipede rule: the dead link\'s follower now leads a free body');
  const kills = h.emitted.filter((e) => e.event === 'swarm:broodKills');
  assert.ok(kills.length > 0, 'the sever paid a brood kill receipt, never entity:killed');
  assert.equal(h.emitted.filter((e) => e.event === 'entity:killed').length, 0);

  // The thrown rock is spent — pull it out of the freed lead's path so the hunt is the only
  // thing being measured (a fast rock on the corridor would just sever the next link too).
  rock.pos.x = 9000;
  rock.pos.z = 9000;

  // A free body still hunts: the freed lead steers toward the pilot on its own.
  const px = h.state.entities.get(h.state.playerId).pos.x;
  const pz = h.state.entities.get(h.state.playerId).pos.z;
  const dBefore = Math.sqrt((x[5] - px) ** 2 + (z[5] - pz) ** 2);
  tendrilStep(h, 60);
  const dAfter = Math.sqrt((x[5] - px) ** 2 + (z[5] - pz) ** 2);
  assert.ok(dAfter < dBefore, 'the freed body hunts the pilot');
});

test('the head dying collapses the whole body — the knot comes apart', () => {
  const h = broodBoot(80);
  const head = addTendrilHead(h);
  tendrilStep(h, 1);
  assert.equal(h.engine.view.segAliveCount, TENDRIL_SEG_PER_WORM);
  head.alive = false;
  tendrilStep(h, 1);
  assert.equal(h.engine.view.segAliveCount, 0, 'the body died with the head');
  assert.equal(h.engine._tendril().done, true, 'the collapse is terminal for the wave');
  const kills = h.emitted.filter((e) => e.event === 'swarm:broodKills');
  const collapsed = kills.filter((e) => e.payload.cause === 'direct')
    .reduce((sum, e) => sum + e.payload.count, 0);
  assert.equal(collapsed, TENDRIL_SEG_PER_WORM,
    'every link paid out on the collapse — the head\'s death is the body\'s death');
  assert.equal(h.emitted.filter((e) => e.event === 'entity:killed').length, 0,
    'brood deaths never enter the entity kill stream');
});
