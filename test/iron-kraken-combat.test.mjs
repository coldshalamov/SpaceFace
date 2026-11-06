import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createRunState } from '../src/core/runState.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { makeEnemySpawnSpec, combat } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { capitalOrderKey, guardCapitalBossActionPort } from '../src/ai/capitalBossOrders.js';
import { SWARM_ROSTER, SWARM_RULESET, SWARM_DEBUT_TICKS, resetSwarmPressureState } from '../src/data/swarmMode.js';
import { IRON_KRAKEN_PROFILES, ironKrakenProfileFor } from '../src/data/ironKraken.js';
import { IRON_KRAKEN_HEAVY, IRON_KRAKEN_COLOSSUS } from '../src/data/encounters/capital-boss/iron-kraken.js';
import { validateCapitalBossEncounter } from '../src/data/encounters/capital-boss/validate.js';
import { createCapitalBossFight, restoreCapitalBossFight, stepCapitalBossFight } from '../src/combat/capitalBossScore.js';
import { bodyIntersectsBossShapes, resolveBossShapes } from '../src/combat/capitalBossGeometry.js';
import { createDamageRouter } from '../src/combat/damage.js';
import { createCombatCatalog, ensureCombatant } from '../src/combat/runtime.js';

const DT = 1 / 60;
const clone = value => JSON.parse(JSON.stringify(value));
const planFor = (wave, extra = {}) => planWave({ seed: 4242, arenaId: 'helios_core', wave,
  ruleset: SWARM_RULESET, ...extra });

test('both variants have one honest head body, no inherited guns, and bounded authored scores', () => {
  for (const p of Object.values(IRON_KRAKEN_PROFILES)) {
    const spec = makeEnemySpawnSpec(p.enemyId, 1, { x: 0, z: 0 });
    assert.equal(ironKrakenProfileFor(spec), p);
    assert.equal(spec.data.silhouette, 'iron_kraken');
    assert.equal(spec.hullMax, p.hull);
    assert.deepEqual(spec.data.weapons, []);
    const body = resolvePhysicsBodySpec(spec);
    assert.equal(body.shape, 'ball');
    assert.equal(body.radius, p.coreRadius);
    assert.equal(body.mass, p.mass);
    assert.equal(body.parts, undefined, 'arms are not a compound/joint chain');
    assert.equal(spec.visualRadius, p.armReach);
    assert.equal(spec.flightModel.inertia, body.inertiaY);
    assert.equal(spec.flightModel.maxSpeed, p.maxSpeed);
    assert.equal(spec.data.derived.flightModel.mass, p.mass);
    const propulsion = resolvePropulsionProfile(spec);
    assert.equal(propulsion.family, 'gravimetric');
    assert.equal(propulsion.maxSpeed, p.maxSpeed);
    assert.equal(propulsion.maxAccel, p.accel);
    assert.equal(propulsion.maxYawRate, p.turnRate, 'the production flight owner uses the authored heavy helm');
    assert.equal(propulsion.designMass, p.mass);
    assert.equal(spec.data.derived.propulsion, spec.propulsion);
    const runtime = ensureCombatant(createGameState(1), { ...spec, id: 2 }, createCombatCatalog());
    assert.notEqual(runtime.capabilities.weapon, false, 'the arm hardware remains a real disableable weapon subsystem');
  }
  for (const encounter of [IRON_KRAKEN_HEAVY, IRON_KRAKEN_COLOSSUS]) {
    assert.deepEqual(validateCapitalBossEncounter(encounter).errors, []);
    assert.equal(encounter.score.wings.length, 0);
    assert.equal(encounter.actors.length, 1, 'no hidden ballast population is spawned');
    assert.equal(encounter.plates.length, 2);
  }
});

test('ordinary rounds contain at most one scheduled character; special rooms and reinforcement weights remain clear', () => {
  assert.equal(SWARM_ROSTER.some(row => ironKrakenProfileFor(row.enemyId)), false);
  const expected = new Map([[7, 'heavy'], [19, 'heavy'], [31, 'colossus'], [37, 'heavy'],
    [43, 'heavy'], [49, 'heavy'], [55, 'colossus']]);
  for (let wave = 1; wave <= 160; wave++) {
    const plan = planFor(wave);
    assert.equal(plan.error, undefined, `wave ${wave}: ${JSON.stringify(plan.issues)}`);
    assert.deepEqual(plan, planFor(wave), 'planning consumes no hidden clock or RNG');
    const rows = plan.schedule.filter(row => row.characterScoreId);
    assert.ok(rows.length <= 1, `wave ${wave} has at most one Kraken`);
    if (wave <= 60) assert.equal(rows.length, expected.has(wave) ? 1 : 0, `wave ${wave} route`);
    if (!rows.length) continue;
    const row = rows[0], p = ironKrakenProfileFor(row.enemyId);
    assert.equal(row.count, 1);
    assert.equal(row.staged, true);
    assert.equal(row.atTick, SWARM_DEBUT_TICKS);
    assert.equal(row.characterScoreId, p.scoreId);
    assert.equal(plan.swarm.boss, false);
    assert.equal(plan.packages.some(pkg => pkg.champion || pkg.debut || pkg.wall), false);
    assert.equal(plan.swarm.act, undefined);
    assert.equal(plan.swarm.character.variant, p.variant);
    if (expected.has(wave)) assert.equal(p.variant, expected.get(wave));
  }
  for (const extra of [{ mutators: ['heavies_only'] }, { circuitRound: { kind: 'survive', durationTicks: 1800 } }]) {
    assert.equal(planFor(7, extra).schedule.some(row => row.characterScoreId), false);
  }
  for (const swarmStake of ['exhibition', 'contender', 'veteran', 'ironbound']) {
    const plan = planFor(7, { swarmStake });
    assert.equal(plan.schedule.filter(row => row.characterScoreId).reduce((n, row) => n + row.count, 0), 1,
      'pressure never multiplies the character seat');
  }
});

function waveHarness(wave = 7, act = true) {
  resetSwarmPressureState();
  const state = createGameState(4242), raw = createBus(), events = [], damage = [], spawned = [];
  const bus = { on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { events.push({ event, payload }); raw.emit(event, payload); } };
  state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: 4242 });
  Object.assign(state.run, { arenaId: 'helios_core', phase: 'active', wave });
  const player = { id: state.nextEntityId++, alive: true, type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, rot: 0, radius: 14, hull: 200, hullMax: 200, data: {} };
  state.entities.set(player.id, player); state.entityList.push(player); state.playerId = player.id;
  const budget = makeBudgetApi(state);
  const helpers = { spawnBudget: budget, routeCombatDamage(input) { damage.push(input); },
    spawnEntity(spec) {
      const e = { ...spec, id: state.nextEntityId++, alive: true, pos: { ...spec.pos } };
      state.entities.set(e.id, e); state.entityList.push(e); spawned.push(e); return e;
    } };
  raw.on('entity:destroyed', p => budget.releaseEntity(p.id));
  const ctx = { state, bus, helpers };
  const waveSystem = Object.create(survivalWave); waveSystem.init(ctx);
  const capital = createProductionCapitalBossEncounters(); capital.init(ctx);
  if (act) noteSwarmPilotAction(state);
  bus.emit('run:wavePlanned', { wave, plan: planFor(wave) });
  bus.emit('run:waveStarted', { wave });
  const h = { state, bus, events, damage, spawned, player, budget, waveSystem, capital };
  h.tick = (count = 1) => { for (let i = 0; i < count; i++) {
    state.tick++; state.simTime += DT; waveSystem.update(DT); capital.update(DT);
  } };
  h.kill = e => {
    e.alive = false; e.hull = 0;
    bus.emit('entity:killed', { id: e.id, entity: e, victim: e, killerId: player.id });
    state.entities.delete(e.id);
    bus.emit('entity:destroyed', { id: e.id, entity: e });
  };
  h.close = () => { waveSystem.destroy(); capital.destroy(); };
  h.krakens = () => spawned.filter(e => e.data?.ironKraken);
  return h;
}

test('real ordinary wave starts one score, gates stock attacks and grants henchmen a readable fire budget', () => {
  const h = waveHarness();
  try {
    h.tick(SWARM_DEBUT_TICKS + 5);
    assert.equal(h.krakens().length, 1);
    const boss = h.krakens()[0], fightId = boss.data.ironKraken.fightId;
    assert.equal(fightId, 'swarm:w7:kraken');
    const fight = h.state.capitalBossEncounters.fights[fightId];
    assert.equal(fight.bossId, boss.id);
    assert.equal(boss.data.missionTag, 'capital_boss');
    assert.equal(boss.data.runCohort, 'survival');
    assert.equal(boss.rot, Math.atan2(-boss.pos.z, -boss.pos.x));
    assert.equal(h.waveSystem._bossIds.has(boss.id), true, 'straggler/disabled cleanup cannot erase the character');
    const order = h.state.capitalBossEncounters.orders[capitalOrderKey(boss.id)];
    assert.equal(order.scoreOwnsAttacks, true); assert.equal(order.suppressStockFire, true);
    const actions = guardCapitalBossActionPort({ canStart: () => ({ ok: true }), start: () => true }, () => h.state);
    assert.equal(actions.canStart(boss.id, 'action_burst').reason, 'capital_score_gate');
    assert.equal(actions.start(boss.id, 'action_sling'), null);
    h.tick(190);
    assert.equal(fight.phase, 'tell');
    assert.equal(h.events.filter(e => e.event === 'capitalBoss:start').length, 1);
    const ordinaryShooters = [...h.waveSystem._cohort.values()].filter(m => !m.entity.data.ironKraken
      && m.entity.data.ai.swarmFireHeld === false);
    assert.ok(ordinaryShooters.length <= 2, 'two henchmen can shoot while the character declares its move');
    assert.equal(h.damage.some(hit => hit.origin?.kind === 'capital_score'), false, 'no damage during the full first warning');
    const saved = clone(h.capital.serialize());
    const clock = fight.clock;
    h.capital.restore(saved);
    assert.equal(h.state.capitalBossEncounters.fights[fightId].clock, clock);
    h.tick();
    assert.equal(h.state.capitalBossEncounters.fights[fightId].clock, clock + 1);
    h.bus.emit('run:ended', {});
    assert.equal(h.state.capitalBossEncounters.fights[fightId], undefined);
    assert.equal(h.state.capitalBossEncounters.orders[capitalOrderKey(boss.id)], undefined);
  } finally { h.close(); }
});

test('idle arrival holds the score, a refused seat stays owed, and repeated lifecycle work does not duplicate it', () => {
  const h = waveHarness(7, false);
  try {
    h.budget.setMax(1);
    h.tick(SWARM_DEBUT_TICKS + 100);
    assert.equal(h.krakens().length, 0);
    assert.equal(h.waveSystem._pending.filter(item => item.entry.characterScoreId).length, 1);
    h.budget.setMax(38);
    for (let i = 0; i < 900 && h.krakens().length === 0; i++) h.tick();
    assert.equal(h.krakens().length, 1, 'the seat survives both cap refusal and the normal pressure breath');
    const boss = h.krakens()[0], fight = h.state.capitalBossEncounters.fights[boss.data.ironKraken.fightId];
    assert.equal(fight.started, false); assert.equal(fight.suspended, true);
    assert.equal(h.damage.length, 0);
    noteSwarmPilotAction(h.state); h.tick(5);
    assert.equal(fight.started, true); assert.equal(fight.suspended, false);
    h.tick(500);
    assert.equal(h.krakens().length, 1);
    assert.equal(h.events.filter(e => e.event === 'capitalBoss:start').length, 1);
    h.waveSystem.destroy(); h.waveSystem.destroy();
    assert.equal(h.state.capitalBossEncounters.fights[fight.fightId], undefined);
  } finally { h.close(); }
});

test('colossus role rebind carries the rig/core identity and drops the old binding before a fresh warning', () => {
  const h = waveHarness(31);
  try {
    // The normal wave owner spaces later-wave opening groups; the scheduled character
    // keeps its seat while that existing ingress cadence advances its actual arrival.
    for (let i = 0; i < 900 && h.krakens().length === 0; i++) h.tick();
    const boss = h.krakens()[0]; assert.ok(boss);
    assert.equal(boss.data.ironKraken.variant, 'colossus');
    const fightId = boss.data.ironKraken.fightId;
    assert.equal(fightId, 'swarm:w31:kraken');
    h.tick(190);
    assert.ok(h.state.capitalBossEncounters.fights[fightId].cast);
    const next = { ...makeEnemySpawnSpec(IRON_KRAKEN_PROFILES.colossus.enemyId, 1, { x: 300, z: 20 }),
      id: h.state.nextEntityId++, alive: true };
    h.state.entities.set(next.id, next); h.state.entityList.push(next);
    h.capital.rebind(fightId, { bossId: next.id, targetId: h.player.id });
    assert.equal(boss.data.ironKraken.fightId, null);
    assert.equal(next.data.ironKraken.fightId, fightId);
    const rebound = h.state.capitalBossEncounters.fights[fightId];
    assert.equal(rebound.cast, null, 'a shot locked at the old position cannot survive rematerialization');
    assert.equal(rebound.suspended, true);
    assert.equal(h.state.capitalBossEncounters.orders[capitalOrderKey(boss.id)], undefined);
    h.tick();
    assert.equal(rebound.phase, 'transition');
    assert.ok(rebound.nextAt - rebound.clock >= 119, 'a full resume warning is earned');
    h.capital.detach(fightId);
    assert.equal(next.data.ironKraken.fightId, null);
  } finally { h.close(); }
});

test('the finite round waits for its living Kraken, death pays once, and next wave detaches its score', () => {
  const h = waveHarness();
  try {
    h.tick(SWARM_DEBUT_TICKS + 5);
    const boss = h.krakens()[0]; assert.ok(boss);
    for (let tick = 0; tick < 3000; tick++) {
      for (const member of [...h.waveSystem._cohort.values()]) if (member.entity !== boss) h.kill(member.entity);
      h.tick();
      if (!h.waveSystem._pending.length && h.waveSystem._admittedTotal >= h.waveSystem._plannedBodies
        && h.waveSystem._cohort.size === 1) break;
    }
    assert.equal(h.waveSystem._pending.length, 0);
    assert.equal(h.waveSystem._cohort.size, 1);
    assert.equal(h.waveSystem._cohort.has(boss.id), true);
    assert.equal(h.events.filter(e => e.event === 'run:waveCleared').length, 0);
    h.kill(boss); h.tick(5);
    assert.equal(h.events.filter(e => e.event === 'capitalBoss:ended').length, 1);
    assert.equal(h.events.filter(e => e.event === 'run:waveCleared').length, 1);
    h.bus.emit('entity:killed', { id: boss.id, entity: boss, victim: boss }); h.tick();
    assert.equal(h.events.filter(e => e.event === 'run:waveCleared').length, 1);
    h.state.run.wave = 8;
    h.bus.emit('run:wavePlanned', { wave: 8, plan: planFor(8) });
    assert.deepEqual(h.state.capitalBossEncounters.fights, {});
    assert.deepEqual(h.state.capitalBossEncounters.orders, {});
  } finally { h.close(); }
});

function scoreHarness() {
  const p = IRON_KRAKEN_PROFILES.heavy;
  const boss = { id: 2, alive: true, pos: { x: 0, z: 0 }, rot: 0,
    radius: p.coreRadius, hull: p.hull, hullMax: p.hull, disabled: [] };
  const target = { id: 1, alive: true, pos: { x: 75, z: 0 }, radius: 7, hull: 200, hullMax: 200 };
  const fight = createCapitalBossFight({ encounterId: p.scoreId, fightId: 'test:kraken', bossId: 2, targetId: 1 });
  let tick = 0;
  const observe = () => ({ tick, simTime: tick * DT, active: true, boss, target });
  return { boss, target, fight, observe,
    step() { const commands = stepCapitalBossFight(fight, observe()); tick++; return commands; } };
}

test('rake commits its shape, each cast hits once across restore, and recovery exposes without immunity', () => {
  const h = scoreHarness();
  for (let i = 0; i < 220; i++) {
    const commands = h.step();
    assert.equal(commands.some(c => c.type === 'damage'), false);
    if (h.fight.cast?.locked) break;
  }
  assert.equal(h.fight.cast?.beatId, 'arm_rake'); assert.equal(h.fight.cast.locked, true);
  const locked = clone(h.fight.cast.shapes);
  h.target.pos = { x: 0, z: 75 };
  const hits = [];
  while (h.fight.phase !== 'active') hits.push(...h.step().filter(c => c.type === 'damage'));
  assert.deepEqual(h.fight.cast.shapes, locked, 'after lock, dodging does not drag the warning');
  assert.equal(hits.length, 1);
  const restored = restoreCapitalBossFight(clone(h.fight));
  while (h.fight.phase !== 'recovery') {
    const observation = clone(h.observe());
    const expected = stepCapitalBossFight(restored, observation);
    const commands = h.step();
    assert.deepEqual(commands, expected, 'JSON resume preserves fixed clocks and hit receipts');
    hits.push(...commands.filter(c => c.type === 'damage' && c.targetId === h.target.id));
  }
  assert.equal(hits.length, 1);
  assert.equal(h.fight.cast, null);
  assert.ok(h.fight.nextAt > h.fight.clock);
  assert.equal(h.fight.telemetry.hits, 1);
});

test('rake and ink ring keep usable gaps; a locked jet can be dodged and broken drive cancels it', () => {
  const h = scoreHarness();
  for (const id of ['arm_rake', 'ink_ring']) {
    const beat = IRON_KRAKEN_HEAVY.score.beats.find(row => row.id === id);
    const shapes = resolveBossShapes(beat, h.boss, h.target);
    const distance = id === 'arm_rake' ? 75 : 145;
    assert.equal(bodyIntersectsBossShapes({ pos: { x: distance, z: 0 }, radius: 14 }, shapes), false, `${id} prow gap`);
    assert.equal(bodyIntersectsBossShapes({ pos: { x: -distance, z: 0 }, radius: 14 }, shapes), false, `${id} tail gap`);
    assert.equal(bodyIntersectsBossShapes({ pos: { x: 0, z: distance }, radius: 14 }, shapes), true, `${id} marked flank`);
  }
  let guard = 0;
  while (!(h.fight.cast?.beatId === 'siphon_jet' && h.fight.cast.locked) && guard++ < 2000) h.step();
  assert.ok(guard < 2000);
  const locked = clone(h.fight.cast.shapes);
  h.target.pos = { x: 100, z: 90 };
  while (h.fight.phase !== 'active') h.step();
  assert.deepEqual(h.fight.cast.shapes, locked);
  assert.equal(h.fight.cast.hitKeys.length, 0, 'sideways escape clears the pressure jet');
  h.boss.disabled = ['subsystem_drive'];
  const cancelled = h.step();
  assert.equal(h.fight.phase, 'recovery');
  assert.equal(h.fight.cast, null);
  assert.equal(cancelled.some(c => c.type === 'countered' && c.reason === 'subsystem_disabled'), true);
  assert.equal(cancelled.some(c => c.type === 'damage'), false);
});

function damageHarness() {
  const state = createGameState(2), bus = createBus(), cues = [];
  state.settings.gameplay.difficulty = 'veteran';
  const p = IRON_KRAKEN_PROFILES.heavy;
  const target = { ...makeEnemySpawnSpec(p.enemyId, 1, { x: 0, z: 0 }), id: 2, alive: true, rot: 0,
    hull: 1000, hullMax: 1000, armorHp: 0, armorMax: 0, armorFlat: 0, shield: 0, shieldMax: 0 };
  const attacker = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 100, z: 0 },
    radius: 14, hull: 200, hullMax: 200, data: {} };
  state.entities.set(1, attacker); state.entities.set(2, target); state.entityList.push(attacker, target); state.playerId = 1;
  target.data.ironKraken.fightId = 'test:core';
  const fight = createCapitalBossFight({ encounterId: p.scoreId, fightId: 'test:core', bossId: 2, targetId: 1 });
  fight.phase = 'recovery';
  state.capitalBossEncounters = { version: 1, fights: { 'test:core': fight }, orders: {} };
  bus.on('combat:weakPointHit', cue => cues.push(cue));
  const route = createDamageRouter({ state, bus, catalog: createCombatCatalog() }, { schedule() {} });
  const request = { attackerId: 1, targetId: 2, origin: { kind: 'weapon', id: 'wpn_pulse_laser_s' },
    packet: { channels: { kinetic: 10 }, subsystemShare: 0, flags: {}, source: { kind: 'weapon' },
      hit: { pos: { x: 28, z: 0 }, approach: { x: -1, z: 0 } } } };
  return { state, bus, target, attacker, fight, request, route, cues };
}

test('only a real direct frontal hit on the open core earns 1.8× through the canonical router', () => {
  const h = damageHarness();
  const result = h.route(h.request);
  assert.equal(result.ok, true); assert.equal(result.rawTotal, 18);
  assert.equal(result.ironKrakenCoreFactor, 1.8);
  assert.equal(h.cues.length, 1); assert.equal(h.cues[0].label, 'MANTLE CORE');
  for (const change of [
    h => { h.fight.phase = 'tell'; },
    h => { h.fight.suspended = true; },
    h => { h.fight.terminal = 'victory'; },
    h => { h.fight.bossId = 3; },
    h => { h.request.packet.hit.pos = { x: -28, z: 0 }; },
    h => { h.request.packet.hit.pos = { x: 0, z: 0 }; },
    h => { h.request.packet.hit.pos = { x: 100, z: 0 }; },
    h => { h.request.packet.hit.pos = { x: NaN, z: 0 }; },
    h => { delete h.request.packet.hit; },
    h => { h.request.packet.hit.approach = { x: 1, z: 0 }; },
    h => { h.request.origin.kind = 'status'; },
    h => { h.request.origin.kind = 'field'; },
    h => { h.request.packet.source.kind = 'weapon_splash'; },
    h => { h.request.packet.flags.area = true; },
    h => { h.request.packet.flags.shieldOnly = true; },
    h => { h.target.data.lootTableId = 'wasp_swarmer'; },
  ]) {
    const neutral = damageHarness(); change(neutral);
    const result = neutral.route(neutral.request);
    assert.equal(result.rawTotal, 10, change.toString());
    assert.equal(neutral.cues.length, 0, 'closed/invalid core never announces a crit');
  }
  const rotated = damageHarness();
  rotated.target.rot = Math.PI / 2;
  rotated.request.packet.hit = { pos: { x: 0, z: 28 }, approach: { x: 0, z: -1 } };
  assert.equal(rotated.route(rotated.request).rawTotal, 18, 'aperture follows hull rotation');
  const beam = damageHarness();
  beam.request.packet.armorFlatScale = DT;
  assert.equal(beam.route(beam.request).rawTotal, 18, 'a directed continuous beam is still a real aperture impact');
  const host = Object.assign(Object.create(combat), { state: h.state, bus: h.bus });
  assert.equal(host._weakPointMult(h.target.id, h.attacker.id, { x: 28, z: 0 }), 1,
    'legacy weak-point multiplier cannot stack a second bonus or announce a closed-core crit');
});

test('the real mortar blast centered on an open aperture remains area damage', () => {
  const h = damageHarness(), receipts = [];
  const host = Object.assign(Object.create(weapons), { bus: h.bus,
    helpers: { routeCombatDamage(input) { receipts.push({ input, result: h.route(input) }); } } });
  host._mortarDetonate({ pos: { x: 28, z: 0 }, ownerId: h.attacker.id,
    sourceTeam: h.attacker.team, weaponId: 'wpn_singularity_mortar_m',
    cfg: { blastRadius: 80, blastDmg: 10, impulse: 0 } }, h.state);
  const hit = receipts.find(row => row.input.targetId === h.target.id);
  assert.ok(hit, 'the actual scheduled blast reaches the Kraken');
  assert.equal(hit.input.packet.source.kind, 'weapon', 'splash keeps canonical weapon provenance');
  assert.equal(hit.input.packet.flags.splash, true);
  assert.equal(hit.result.rawTotal, 10);
  assert.equal(hit.result.ironKrakenCoreFactor, undefined);
  assert.equal(h.cues.length, 0);
});

test('the production beam sweep earns the aperture bonus at its first visible surface contact', () => {
  const h = damageHarness(), receipts = [];
  h.state.combat.beams = [{ ownerId: h.attacker.id, weaponId: 'wpn_laser_m', dmgType: 'kinetic',
    from: { x: 100, z: 0 }, to: { x: -100, z: 0 }, dpsThisTick: 10,
    damagePacket: { channels: { kinetic: 10 }, subsystemShare: 0, flags: {},
      armorFlatScale: DT, source: { kind: 'weapon', weaponId: 'wpn_laser_m' } } }];
  const host = Object.assign(Object.create(combat), { state: h.state, bus: h.bus,
    kernel: { routeDamage(input) { const result = h.route(input); receipts.push({ input, result }); return result; } } });
  host._applyBeamDamage(h.state);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].result.rawTotal, 18);
  assert.ok(receipts[0].input.packet.hit.pos.x >= h.target.radius);
  assert.equal(receipts[0].input.packet.hit.approach, undefined,
    'the existing beam emitter supplies an actual surface position without approach metadata');
  assert.equal(h.state.combat.beams[0].to.x, receipts[0].input.packet.hit.pos.x,
    'visible beam and damage terminate at the same aperture contact');
  assert.equal(h.cues.length, 1);
});
