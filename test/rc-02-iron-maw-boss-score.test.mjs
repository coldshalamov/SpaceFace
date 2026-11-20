// RC-02 — the Iron Maw runs its AUTHORED score, not a stock dreadnought carrying
// a hunter trick. The `iron_maw` rotation row now wires `enemyId`+`scoreId` like every other
// capital row (FB-024), so the wave owner materializes the same one dreadnought_boss hull it
// always fielded and hands it to `capital_boss_hulk`: `capitalBoss:start` opens the fight, the
// score's orders gate its fire, the acts advance on hull thresholds, and the named beats
// (SOUNDING SHOT, PORT BATTERY, KEELBREAKER) telegraph and fire on the roster clock.
// FIX-05 — the stale wave pin moved to the current course: C01-01 (ca74e15f33) compressed the
// Pit to six champions at 5/10/15/20/25/30 (deep course fields them on decades), so the Iron
// Maw holds wave 5 — the row, hull and score are unchanged from the round-10 era this test
// was written against (the FIX-05 packet referenced 2065539416, the wing's five-ace body).
// Same seed-4242 harness as fb-024-swarm-capital-champions — the real wave owner and the real
// production ports, no stub score.

import test from 'node:test';
import assert from 'node:assert/strict';

import { applyDomainPathUpdate, createDomainDiffer } from '../scripts/lib/simReadModel.mjs';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { circleIntersectsBossShape, readIronMawMouth } from '../src/combat/capitalBossGeometry.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { capitalBossReadouts } from '../src/presentation/capitalBossPresentation.js';
import { solveCadenceRelease } from '../src/combat/masslineReleaseGeometry.js';
import { applyFeatureConfigToMaps, COMBAT_FLAGS, restoreFeatureMaps, snapshotFeatureMaps } from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { combat } from '../src/systems/combat.js';
import { physics } from '../src/core/physics.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { contextualAttachmentWorlds, tetherGameplay } from '../src/systems/tetherGameplay.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { masslineImpactDamage } from '../src/systems/masslineImpactDamage.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { makeBudgetApi, spawnBudget } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { capitalOrderKey } from '../src/ai/capitalBossOrders.js';
import {
  SWARM_MIN_ARRIVAL_WU, SWARM_RULESET, swarmBossFor, bossPackagesFor, swarmCatalogIssues, swarmEligibleEnemyIds,
  SWARM_BREATH_TICKS, resetSwarmPressureState, swarmPressureSuppressing, swarmReinforceCount,
} from '../src/data/swarmMode.js';
import { requireCapitalBossEncounter } from '../src/data/encounters/capital-boss.js';
import { materializeWaveBatch, SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { isMasslineObstructed } from '../src/world/asteroidField.js';
import { noteSwarmPilotAction, SWARM_SPAWN_RETRY_TICKS } from '../src/systems/swarmSafety.js';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';
const IRON_MAW_BEATS = new Set(requireCapitalBossEncounter('capital_boss_hulk').score.beats.map((b) => b.id));

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
  return { state, bus, emitted, spawned, capSys, ctx };
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

function capitalBody(h) {
  return h.spawned.find((e) => e.data && e.data.runCohort === SURVIVAL_COHORT_TAG
    && e.data.missionTag === 'capital_boss');
}
function fightStore(h) {
  return h.state.capitalBossEncounters;
}
function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}

test('the wave-5 row resolves the authored script id and the same single hull', () => {
  const boss = swarmBossFor(5);
  assert.equal(boss.id, 'iron_maw');
  assert.equal(boss.scoreId, 'capital_boss_hulk');
  assert.equal(boss.enemyId, 'dreadnought_boss', 'the Iron Maw hull def, unchanged');
  assert.equal(boss.trickId, undefined, 'a capital row never carries a hunter trick');
  assert.equal(boss.packages, undefined, 'capital rows carry enemyId, not packages');
  // The implied package is exactly what the old compositional row fielded: one elite hull.
  assert.deepEqual(bossPackagesFor(boss), [{ enemyId: 'dreadnought_boss', count: 1, role: 'elite' }]);

  const plan = planFor(5);
  const swarm = plan.swarm;
  assert.equal(swarm.bossScoreId, 'capital_boss_hulk');
  assert.equal(swarm.bossEnemyId, 'dreadnought_boss');
  assert.equal(swarm.bossTrickId, null);
  const champions = plan.packages.filter((p) => p.champion === true);
  assert.equal(champions.length, 1, 'wave 10 fields one capital hull');
  assert.equal(champions[0].enemyId, 'dreadnought_boss');
  assert.equal(champions[0].count, 1);

  // The score id must name a shipped encounter and the hull a catalog id — the validator
  // is the tripwire a typo'd wiring trips on.
  assert.equal(requireCapitalBossEncounter('capital_boss_hulk').score.name, 'IRON MAW');
  assert.ok(swarmEligibleEnemyIds(5).has('dreadnought_boss'), 'the boss hull stays prewarmed');
  assert.deepEqual(swarmCatalogIssues(), [], 'the whole swarm catalog still resolves');
});

test('the landed champion opens the Iron Maw score and the script moves', () => {
  const h = boot(5);
  startWave(h, 5);
  const boss = capitalBody(h);
  assert.ok(boss, 'the dreadnought hull is a real cohort body stamped capital_boss');
  assert.equal(boss.data.lootTableId, 'dreadnought_boss');
  assert.equal(boss.data.runWave, 5);
  assert.equal(boss.data.bountyHunt, undefined, 'no hunter trick on a capital champion');

  const start = named(h, 'capitalBoss:start');
  assert.equal(start.length, 1, 'capitalBoss:start fired exactly once');
  assert.equal(start[0].payload.encounterId, 'capital_boss_hulk');
  const fight = fightStore(h).fights['swarm:w5'];
  assert.ok(fight, 'the fight record opened under the wave fight id');
  assert.equal(fight.encounterId, 'capital_boss_hulk');
  assert.equal(fight.bossId, boss.id);
  assert.equal(fight.targetId, h.state.playerId);

  // The score owns the hull's trigger before its first AI tick — stock fire is suppressed.
  const order = fightStore(h).orders[capitalOrderKey(boss.id)];
  assert.ok(order, 'the boss hull is under a capital order');
  assert.equal(order.scoreOwnsAttacks, true);
  assert.equal(order.suppressStockFire, true);

  // Drive through the intro (180) and act-I transition (150): the authored pattern must be
  // what telegraphs and fires — the script's own named moves, not generic AI shots.
  tick(h, 700);
  assert.equal(fight.started, true, 'the score is running on the live pair');
  assert.ok(named(h, 'capitalBoss:started').length > 0);
  assert.equal(fight.actIndex, 0, 'act I · THE BEARING is the entered act');
  const telegraphs = named(h, 'capitalBoss:telegraph');
  const attacks = named(h, 'capitalBoss:attack');
  assert.ok(telegraphs.length > 0, 'the script telegraphs');
  assert.ok(attacks.length > 0, 'the script fires authored beats');
  const beatIds = new Set([...telegraphs, ...attacks].map((e) => e.payload.beatId));
  assert.ok(beatIds.size > 0 && [...beatIds].every((id) => IRON_MAW_BEATS.has(id)),
    `every move is an Iron Maw beat, saw ${[...beatIds].join(', ')}`);
  assert.ok(beatIds.has('sounding_shot'), 'the lesson shot is the opener the score authored');
  assert.ok(fight.telemetry.casts > 0, 'the fight ledger counts real casts');
});

function advanceToFirstMawHeavyTell(h) {
  const fight = fightStore(h).fights['swarm:w5'];
  for (let i = 0; i < 650 && fight.recovery?.beatId !== 'sounding_shot'; i++) tick(h);
  assert.equal(fight.recovery?.beatId, 'sounding_shot');
  tick(h, fight.nextAt - fight.clock);
  return fight;
}

test('the first heavy warning waits for the normal reserved Dart admission after a wipe break', (t) => {
  resetSwarmPressureState();
  t.after(() => resetSwarmPressureState());
  const h = boot(5);
  h.state.run.retireToken = 1;
  t.after(() => h.capSys.destroy());
  startWave(h, 5);
  const fight = advanceToFirstMawHeavyTell(h);
  const warnings = () => named(h, 'capitalBoss:telegraph').filter(e => e.payload.beatId === 'port_battery');
  const receipts = () => named(h, 'run:waveMaterialized').filter(e => e.payload.mawSupply);
  assert.equal(swarmReinforceCount(3), 0, 'a real replenishment deficit earns a wipe break');
  assert.equal(swarmPressureSuppressing(), true);
  tick(h, 12);
  assert.equal(warnings().length, 0, 'the heavy warning cannot spend its lead while the reserve is held');
  assert.equal(receipts().length, 0, 'the arrival respects the earned wipe break');

  for (let i = 0; i <= SWARM_BREATH_TICKS + SWARM_SPAWN_RETRY_TICKS && !warnings().length; i++) tick(h);
  assert.equal(swarmPressureSuppressing(), false);
  const admission = receipts()[0];
  const warning = warnings()[0];
  assert.ok(admission && warning, 'the normal gate admits the reserve and the held beat starts');
  assert.equal(receipts().length, 1);
  assert.ok(h.emitted.indexOf(admission) < h.emitted.indexOf(warning), 'the exact life exists before the first warning');
  assert.equal(admission.payload.mawSupply.runToken, 1);
  assert.equal(admission.payload.mawSupply.bossId, fight.bossId);
  const body = h.state.entities.get(admission.payload.mawSupply.entityId);
  assert.equal(body?.data?.lootTableId, 'detonator_dart');
  assert.equal(body?.alive, true);
  const beat = requireCapitalBossEncounter(fight.encounterId).score.beats.find(b => b.id === 'port_battery');
  assert.equal(warning.payload.fireAt - warning.payload.startedAt, beat.tellTicks, 'the warning keeps its full authored lead');

  h.bus.emit('run:ended', { reason: 'retry' });
  assert.equal(fightStore(h).fights['swarm:w5'], undefined, 'retiring the run clears the old request and receipt');
  h.state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  Object.assign(h.state.run, { arenaId: ARENA, wave: 5, phase: 'active', retireToken: 2 });
  resetSwarmPressureState();
  const missing = structuredClone(planFor(5));
  missing.schedule = missing.schedule.filter(entry => !entry.staged);
  h.bus.emit('run:wavePlanned', { wave: 5, plan: missing });
  h.bus.emit('run:waveStarted', { wave: 5 });
  tick(h, 2);
  const retryFight = advanceToFirstMawHeavyTell(h);
  const priorWarnings = warnings().length;
  tick(h);
  h.bus.emit('run:waveMaterialized', admission.payload);
  assert.equal(retryFight.mawSupplyAdmission, undefined);
  const timeout = SWARM_BREATH_TICKS + SWARM_SPAWN_RETRY_TICKS + 1;
  tick(h, timeout - 1);
  assert.equal(warnings().length, priorWarnings, 'an obsolete receipt cannot admit a cast in a Retry');
  tick(h);
  assert.equal(warnings().length, priorWarnings + 1, 'an unavailable reserve cannot stall this fight');
  assert.equal(receipts().some(e => e.payload.mawSupply.runToken === 2), false);
  for (let i = 0; i < 360 && !named(h, 'capitalBoss:telegraph').some(e => e.payload.beatId === 'starboard_battery'); i++) tick(h);
  assert.ok(named(h, 'capitalBoss:telegraph').some(e => e.payload.beatId === 'starboard_battery'),
    'later heavy attacks do not repeat the admission wait');
});

test('the reserved Dart seats outside the arrival floor along a legal latch lane', (t) => {
  const stock = boot(5);
  const req = { ownerId: 'survival-wave:5', seed: SEED, wave: 5, enemyId: 'detonator_dart', count: 1,
    swarm: true, gateGroup: 'sw', distance: SWARM_MIN_ARRIVAL_WU, packageIndex: 2, batchIndex: 2 };
  const stockId = materializeWaveBatch(stock.ctx, req).spawnedIds[0];
  const stockDart = stock.state.entities.get(stockId);
  assert.ok(stockDart, 'stock produced a real Dart candidate');
  const h = boot(5);
  t.after(() => { stock.capSys.destroy(); h.capSys.destroy(); });
  const player = h.state.entities.get(h.state.playerId);
  h.ctx.helpers.spawnEntity({ type: 'asteroid', radius: 32, mass: 120, collides: true,
    pos: { x: stockDart.pos.x * 0.5, z: stockDart.pos.z * 0.5 } });
  const blocked = target => isMasslineObstructed({ state: h.state, player, target,
    ...contextualAttachmentWorlds(player, target, target.pos) });
  assert.equal(blocked({ ...stockDart, id: null }), true, 'the rock intersects the stock line while leaving the stock hull seat clear');
  const receipt = materializeWaveBatch(h.ctx, { ...req, requireClearMassline: true });
  assert.equal(receipt.admitted, 1, 'the legal search admits exactly the one owed hull');
  const dart = h.state.entities.get(receipt.spawnedIds[0]);
  assert.equal(blocked(dart), false);
  assert.ok(Math.hypot(dart.pos.x - player.pos.x, dart.pos.z - player.pos.z) >= SWARM_MIN_ARRIVAL_WU);
  assert.deepEqual(dart.data.detonator, stockDart.data.detonator);
});

test('the Iron Maw bow avoids the locked broadside and recovery opens a mass window', () => {
  const capital = createProductionCapitalBossEncounters();
  const sim = createSimulation({ seed: SEED, systems: [spawnBudget, combat, survivalWave, capital] });
  try {
    const { state, bus, helpers } = sim;
    state.mode = 'flight';
    state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
    Object.assign(state.run, { arenaId: ARENA, wave: 5, phase: 'active' });
    const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 8 });
    state.playerId = player.id;
    noteSwarmPilotAction(state);

    let tell, attack, recovery;
    bus.on('capitalBoss:telegraph', event => { if (event.beatId === 'port_battery' && event.locked) tell = event; });
    bus.on('capitalBoss:attack', event => { if (event.beatId === 'port_battery') attack = event; });
    bus.on('capitalBoss:recovery', event => { if (event.beatId === 'port_battery') recovery = event; });
    const plan = planFor(5);
    assert.ok(plan.packages.some(row => row.enemyId === 'detonator_dart'), 'the room still supplies the authored darts');
    bus.emit('run:wavePlanned', { wave: 5, plan });
    bus.emit('run:waveStarted', { wave: 5 });
    const scores = sim.registry.get('capitalBossEncounters');
    const wave = sim.registry.get('survivalWave');
    const kernel = sim.registry.get('combat').kernel;
    const step = () => {
      state.tick++;
      state.simTime += DT;
      kernel.prePhysics(DT);
      wave.update(DT, state);
      scores.update(DT, state);
    };
    step(); step();
    const boss = state.entityList.find(entity => entity.data?.missionTag === 'capital_boss');
    assert.equal(boss?.data?.lootTableId, 'dreadnought_boss');
    const response = () => state.combat.entities[boss.id].physicsResponse.massScale;
    const shot = () => helpers.routeCombatDamage({
      attackerId: player.id, targetId: boss.id, packet: scalarHitToDamagePacket({ damage: 12 }),
      origin: { kind: 'weapon', id: 'pulse' },
    });
    Object.assign(player.pos, { x: boss.pos.x + 120, z: boss.pos.z });
    const normal = shot();
    assert.ok(normal.totalApplied > 0, 'ordinary fire can damage the boss immediately');
    for (let i = 0; i < 1200 && !tell; i++) step();
    assert.match(tell?.counter, /Leave the port wedge/);
    const wedge = tell.shapes[0];
    const atBearing = heading => ({ x: wedge.x + Math.cos(heading) * 120, z: wedge.z + Math.sin(heading) * 120 });
    assert.ok(circleIntersectsBossShape(atBearing(wedge.heading), player.radius, wedge));
    const bow = atBearing(boss.rot);
    assert.equal(circleIntersectsBossShape(bow, player.radius, wedge), false);
    Object.assign(player.pos, bow);
    const beforeAttack = player.hull;
    assert.equal(shot().totalApplied, normal.totalApplied);
    assert.equal(response(), 1);
    for (let i = 0; i < 300 && !recovery; i++) step();
    assert.deepEqual(attack?.shapes, tell.shapes, 'the locked warning uses the live shot geometry');
    assert.equal(player.hull, beforeAttack, 'the bow stays clear while the battery fires');
    assert.deepEqual(recovery?.exposure, { status: 'status_unmoored', durationTicks: 90 });

    step();
    assert.equal(response(), 0.3, 'the combat owner applies the lighter recovery window');
    assert.equal(shot().totalApplied, normal.totalApplied, 'recovery does not gate ordinary damage');
    for (let i = 0; i < 90; i++) step();
    assert.equal(response(), 1, 'the window closes on the authored status clock');
  } finally { sim.dispose(); }
});

test('an aimed miss leaves Iron Maw intact and a physical recovery hit pays once', async (t) => {
  const previousContactFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previousContactFlag; });
  const capital = createProductionCapitalBossEncounters();
  const sim = createSimulation({ seed: SEED, systems: [spawnBudget, physics, combat, survivalWave, masslineThrow, capital] });
  try {
    const { state, bus } = sim;
    state.mode = 'flight';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
    Object.assign(state.run, { arenaId: ARENA, wave: 5, phase: 'active' });
    const player = sim.spawn({
      type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      radius: 12, mass: 90, hull: 200, hullMax: 200, data: { defId: 'ship_hornet' },
    });
    state.playerId = player.id;
    noteSwarmPilotAction(state);
    const bodies = sim.registry.get('physics');
    const kernel = sim.registry.get('combat').kernel;
    const wave = sim.registry.get('survivalWave');
    const scores = sim.registry.get('capitalBossEncounters');
    const releaser = sim.registry.get('masslineThrow');
    let recovery;
    bus.on('capitalBoss:recovery', (event) => { if (event.beatId === 'port_battery') recovery = event; });
    bus.emit('run:wavePlanned', { wave: 5, plan: planFor(5) });
    bus.emit('run:waveStarted', { wave: 5 });
    function step(withPhysics = false) {
      state.tick++;
      state.simTime += DT;
      kernel.prePhysics(DT);
      if (withPhysics) bodies.update(DT, state);
      wave.update(DT, state);
      scores.update(DT, state);
    }
    step(); step();
    const boss = state.entityList.find((entity) => entity.data?.missionTag === 'capital_boss');
    assert.equal(boss?.data.lootTableId, 'dreadnought_boss');
    const hits = [];
    bus.on('combat:damage', (event) => {
      if (event.targetId === boss.id && event.origin?.kind === 'thrown_mass') {
        hits.push({ tick: state.tick, part: event.origin.subsystemId });
      }
    });
    let release;
    bus.on('massline:throw', (event) => { release = event; });
    const range = Math.hypot(boss.pos.x, boss.pos.z);
    const away = { x: -boss.pos.x / range, z: -boss.pos.z / range };
    const rock = sim.spawn({
      type: 'asteroid', pos: { x: away.x * 50, z: away.z * 50 }, vel: { x: away.x * 120, z: away.z * 120 },
      radius: 15, mass: 50, hull: 200, hullMax: 200, data: {},
    });
    assert.equal(await bodies.prepareBackend(state), true);
    function throwRock() {
      const made = kernel.attachments.create({ defId: 'tether_standard', ownerId: player.id, targetId: rock.id });
      assert.equal(made.ok, true, made.reason);
      Object.assign(state.player.tether ??= {}, { active: true, targetId: rock.id, attachmentId: made.attachment.id });
      const solution = solveCadenceRelease(rock, boss);
      assert.ok(releaser._executeThrow(state, player, rock, { entity: boss }, solution, 'off'));
      assert.equal(release.aimTargetId, boss.id);
      state.player.tether.active = false;
    }
    for (let i = 0; i < 1200 && !recovery; i++) step();
    assert.equal(recovery?.beatId, 'port_battery');
    step(true);
    assert.equal(state.combat.entities[boss.id].physicsResponse.massScale, 0.3);
    const startingShield = boss.shield;
    throwRock();
    assert.equal(release.prediction.onSolution, false);
    for (let i = 0; i < 5; i++) step(true);
    assert.equal(hits.length, 0, 'a release directly away from the boss leaves its parts alone');
    assert.equal(boss.shield, startingShield);

    const bow = { x: Math.cos(boss.rot), z: Math.sin(boss.rot) };
    const startDistance = boss.radius * 2.2 + rock.radius + 16;
    Object.assign(rock.pos, { x: boss.pos.x + bow.x * startDistance, z: boss.pos.z + bow.z * startDistance });
    Object.assign(rock.vel, { x: -bow.x * 160, z: -bow.z * 160 });
    Object.assign(player.pos, { x: rock.pos.x + bow.z * 60, z: rock.pos.z - bow.x * 60 });
    step(true);
    let impact;
    bus.on('physics:impact', (event) => {
      if (event.backend === 'rapier-dynamic' && [event.aId, event.bId].includes(boss.id)
          && [event.aId, event.bId].includes(rock.id) && event.causalActorId === rock.id) {
        impact ??= { tick: event.tick, massScale: state.combat.entities[boss.id].physicsResponse.massScale };
      }
    });
    throwRock();
    assert.equal(hits.length, 0, 'the on-target release still waits for physical contact');
    for (let i = 0; i < 54; i++) step(true);
    assert.ok(impact, 'Rapier settles the live rock against the same boss');
    assert.equal(impact.massScale, 0.3, 'the native hit lands during the visible recovery opening');
    assert.deepEqual(hits, [{ tick: impact.tick, part: 'subsystem_drive' }],
      'one contact spends one named subsystem strike per throw');
    assert.ok(boss.shield < startingShield);
  } finally { sim.dispose(); }
});

test('the same painted mouth spits ordinary bodies back and consumes only an armed Detonator', async (t) => {
  const previousFlags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  t.after(() => restoreFeatureMaps(previousFlags));
  for (const { enemyId, spent } of [
    { enemyId: 'wasp_swarmer', spent: false },
    { enemyId: 'detonator_dart', spent: false },
    { enemyId: 'detonator_dart', spent: true },
  ]) {
    const sim = createSimulation({ seed: SEED, systems: [
      spawnBudget, physics, combat, impulseCharges, survivalWave, tetherGameplay,
      masslineImpacts, masslineThrow, masslineImpactDamage, createProductionCapitalBossEncounters(),
    ] });
    try {
      const { state, bus, registry } = sim;
      const differ = createDomainDiffer();
      const mirror = new Map();
      const paintedState = () => {
        for (const update of differ.diff(state, state.tick).updates) {
          applyDomainPathUpdate(mirror, update, new WeakSet());
        }
        return {
          run: mirror.get('run'), capitalBossEncounters: mirror.get('capitalBossEncounters'),
          player: mirror.get('player'), combat: mirror.get('combat'), masslineAcquisition: mirror.get('masslineAcquisition'),
          entities: state.entities, playerId: state.playerId, simTime: state.simTime,
        };
      };
      state.mode = 'flight';
      state.settings.gameplay.physicsBackend = 'rapier-dynamic';
      state.input.actions = {};
      state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
      Object.assign(state.run, { arenaId: ARENA, wave: 5, phase: 'active' });
      const player = sim.spawn({
        type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
        radius: 12, mass: 90, hull: 200, hullMax: 200, data: { defId: 'ship_hornet' },
      });
      state.playerId = player.id;
      noteSwarmPilotAction(state);
      const bodies = registry.get('physics');
      const charges = registry.get('impulseCharges');
      const tether = registry.get('tetherGameplay');
      const swings = registry.get('masslineImpacts');
      const thrower = registry.get('masslineThrow');
      const wave = registry.get('survivalWave');
      const scores = registry.get('capitalBossEncounters');
      const kernel = registry.get('combat').kernel;
      const step = (flight = false) => {
        state.tick++;
        state.simTime += DT;
        kernel.prePhysics(DT);
        if (flight) {
          charges.update(DT, state);
          bodies.update(DT, state);
          tether.update(DT, state);
          swings.update(DT, state);
          thrower.update(DT, state);
        }
        wave.update(DT, state);
        scores.update(DT, state);
        bus.flush();
      };
      let latch, release, recovery;
      const blasts = [];
      const whipHits = [];
      bus.on('tether:latched', (event) => { latch = event; });
      bus.on('massline:throw', (event) => { release = event; });
      bus.on('capitalBoss:recovery', (event) => { if (event.beatId === 'port_battery') recovery = event; });
      bus.on('detonator:detonated', (event) => blasts.push(event));
      bus.on('tether:whipImpact', (event) => whipHits.push(event));
      const darts = () => state.entityList.filter((entity) => entity.data?.lootTableId === 'detonator_dart');
      bus.emit('run:wavePlanned', { wave: 5, plan: planFor(5) });
      bus.emit('run:waveStarted', { wave: 5 });
      let body;
      for (let i = 0; i < 300 && !body; i++) {
        step();
        body = state.entityList.find((entity) => entity.data?.lootTableId === enemyId);
      }
      assert.ok(body?.alive);
      assert.equal(darts().length, 4, 'one scheduled Dart is held for the first heavy tell');
      assert.equal(await bodies.prepareBackend(state), true);
      state.input.aimIntentActive = true;
      state.input.aimWorld = { ...body.pos };
      tether.update(DT, state);
      assert.equal(state.masslineAcquisition.selected.targetId, body.id);
      state.input.actions.tetherFire = true;
      step(true);
      state.input.actions.tetherFire = false;
      step(true);
      assert.equal(latch?.targetId, body.id);
      assert.equal(readIronMawMouth(state), null, 'the aperture is closed before the heavy broadside');
      for (let i = 0; i < 1200 && !recovery; i++) step();
      const expectedCounter = enemyId === 'detonator_dart'
        ? 'Throw the Detonator into the ring.' : 'Use the opening to hit the hull.';
      assert.equal(recovery?.mouthLine, `Mouth open. ${expectedCounter}`);
      assert.ok(darts().length >= 5, 'the staged Dart arrives by the opening');

      // Put the normally acquired body on a valid incoming line to isolate the outcome.
      const mouth = readIronMawMouth(state);
      const { boss, fight, forwardX, forwardZ } = mouth;
      const facade = paintedState();
      const painted = readIronMawMouth(facade);
      assert.deepEqual([painted?.x, painted?.z, painted?.radius], [mouth.x, mouth.z, mouth.radius],
        'the worker publishes the same live aperture the throw owner uses');
      assert.equal(capitalBossReadouts(facade)[0]?.move?.counter, expectedCounter,
        'the mirrored attachment life gives the same instruction as the authoritative recovery');
      if (spent) {
        // Trigger the normal proximity fuse away from the other scheduled bodies.
        // A held hull can survive that blast under the ordinary damage rules.
        const oldPlayerPos = { ...player.pos }, oldBodyPos = { ...body.pos };
        const hash = state.spatialHash;
        try {
          Object.assign(body.pos, { x: -2000, z: -2000 });
          Object.assign(player.pos, { x: -1972, z: -2000 });
          state.spatialHash = null;
          charges.update(DT, state);
        } finally {
          state.spatialHash = hash;
          Object.assign(player.pos, oldPlayerPos);
          Object.assign(body.pos, oldBodyPos);
        }
        assert.deepEqual(blasts.map(event => [event.entityId, event.trigger]), [[body.id, 'proximity']]);
        assert.ok(body.alive && state.player.tether.targetId === body.id);
        assert.equal(capitalBossReadouts(state)[0]?.move?.counter, 'Use the opening to hit the hull.');
        assert.equal(capitalBossReadouts(paintedState())[0]?.move?.counter, 'Use the opening to hit the hull.');
      }
      const previousRecoveryEnd = fight.nextAt;
      const incomingSpeed = 160;
      Object.assign(body.pos, { x: boss.pos.x + 110 * forwardX, z: boss.pos.z + 110 * forwardZ });
      Object.assign(body.vel, { x: -incomingSpeed * forwardX, z: -incomingSpeed * forwardZ });
      Object.assign(player.pos, { x: body.pos.x + 126 * forwardZ, z: body.pos.z - 126 * forwardX });
      state.input.aimWorld = { x: mouth.x, z: mouth.z };
      state.input.actions.throwTap = true;
      thrower.update(DT, state);
      state.input.actions.throwTap = false;
      assert.equal(release?.payloadId, body.id);
      assert.equal(release.mode, 'snap');
      assert.equal(release.prediction.onSolution, true);
      assert.equal(release.aimSynthetic, true, 'painting the ring aims at the intake instead of the hull centre');
      assert.equal(blasts.length, spent ? 1 : 0, 'release alone never spends the Dart');
      let outwardSpeed = 0;
      for (let i = 0; i < 100; i++) {
        step(true);
        outwardSpeed = Math.max(outwardSpeed, body.vel.x * forwardX + body.vel.z * forwardZ);
        if (i === 23) {
          assert.equal(!!readIronMawMouth(paintedState()), enemyId === 'wasp_swarmer' || spent,
            'the worker picture closes on a fed Dart during the original opening');
        }
      }
      assert.equal(whipHits.some((event) => event.targetId === body.id && event.victimId === boss.id), false);
      if (enemyId === 'wasp_swarmer' || spent) {
        assert.equal(blasts.length, spent ? 1 : 0, 'normal ejection does not fire a spent fuse again');
        assert.equal(state.entities.get(body.id), body);
        assert.ok(body.alive && outwardSpeed > incomingSpeed, 'the same ordinary body travels back faster');
        assert.equal(fight.nextAt, previousRecoveryEnd);
      } else {
        const fed = blasts.filter((event) => event.entityId === body.id);
        assert.equal(fed.length, 1);
        assert.equal(fed[0].trigger, 'iron_maw_mouth');
        assert.equal(fed[0].killerId, player.id);
        assert.ok(fed[0].hits.includes(boss.id) && body.alive === false);
        assert.equal(readIronMawMouth(state), null, 'the fed counter closes the aperture');
        assert.ok(fight.nextAt > previousRecoveryEnd);
        assert.equal(state.combat.entities[boss.id].physicsResponse.massScale, 0.3,
          'the recovered mass window actually stays light past the original exposure');
      }
    } finally { sim.dispose(); }
  }
});

test('the act structure is the authored one: act II calls the maw screen wing', () => {
  const h = boot(5);
  startWave(h, 5);
  const boss = capitalBody(h);
  tick(h, 400);
  const fight = fightStore(h).fights['swarm:w5'];
  assert.equal(fight.started, true);

  // Push the hull under act II's authored threshold — II · THE BROKEN RUDDER requests the
  // warden screen the score wrote for itself.
  boss.hull = Math.floor(boss.hullMax * 0.5);
  tick(h, 40);
  assert.equal(fight.actIndex, 1, 'act II entered on the hull threshold');
  const wings = named(h, 'capitalBoss:wingRequested');
  assert.ok(wings.length > 0, 'the score requested its screen');
  assert.equal(wings[0].payload.wing.id, 'maw_screen');

  // The wing materializes through the survival port as real run-cohort bodies.
  const joins = named(h, 'survivalWave:cohortJoined');
  assert.ok(joins.length > 0, 'wing members were registered into the wave cohort');
  const memberIds = joins.flatMap((e) => e.payload.ids);
  assert.equal(memberIds.length, 2, 'the maw screen is the authored two-ship wedge');
});

test('killing the champion resolves the score as a victory, not a disappearance', () => {
  const h = boot(5);
  startWave(h, 5);
  const boss = capitalBody(h);
  tick(h, 200);

  boss.alive = false;
  boss.hull = 0;
  h.bus.emit('entity:killed', { id: boss.id });
  tick(h, 3);
  const fight = fightStore(h).fights['swarm:w5'];
  assert.equal(fight.terminal, 'victory', 'champion death is the score\u2019s authored ending');

  h.bus.emit('run:wavePlanned', { wave: 6, plan: planFor(6) });
  assert.equal(fightStore(h).fights['swarm:w5'], undefined, 'the fight detaches with the wave');
});
