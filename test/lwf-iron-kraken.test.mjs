// LW-05 — Iron Kraken maturity: the swarm wave opener names the scheduled character before
// contact, the score fields a bounded hull-aimed wake trawl whose packet carries a real
// momentum-sink hold, the later acts actually cast it, and a Kraken-sourced sink keeps the
// wave's henchmen at tell/attack volume through the character's recovery window.
//
// Harnesses mirror crucible-announce.test.mjs (live-run announce boot),
// iron-kraken-combat.test.mjs (planWave options, the direct score driver, and the wave harness
// that boots survivalWave + production capitalBossEncounters).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalAnnounce, waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { SWARM_RULESET, SWARM_DEBUT_TICKS, resetSwarmPressureState } from '../src/data/swarmMode.js';
import { STATUS_DEFS, MOMENTUM_SINK_STATUS_ID } from '../src/data/combatDefs.js';
import { IRON_KRAKEN_PROFILES } from '../src/data/ironKraken.js';
import { IRON_KRAKEN_HEAVY, IRON_KRAKEN_COLOSSUS } from '../src/data/encounters/capital-boss/iron-kraken.js';
import { THROW_WINDOW } from '../src/data/encounters/capital-boss/shared.js';
import { validateCapitalBossEncounter } from '../src/data/encounters/capital-boss/validate.js';
import { createCapitalBossFight, stepCapitalBossFight } from '../src/combat/capitalBossScore.js';
import { wrapAngle, bodyIntersectsBossShapes } from '../src/combat/capitalBossGeometry.js';

const DT = 1 / 60;
const clone = (value) => JSON.parse(JSON.stringify(value));
const planFor = (wave, extra = {}) => planWave({ seed: 4242, arenaId: 'helios_core', wave,
  ruleset: SWARM_RULESET, ...extra });

// The same vocabulary the production contract test supplies — a status id that is not real
// content fails the score here rather than shipping as dead metadata.
const VOCABULARY = Object.freeze({ statusIds: new Set(STATUS_DEFS.map((d) => d.id)) });

function bootAnnounce() {
  const state = createGameState(7);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const run = createRunState({ kind: 'survival', seed: 7 });
  run.arenaId = 'helios_core';
  run.phase = 'active';
  run.wave = 19;
  state.run = run;
  survivalAnnounce.init({ state, bus, helpers: {} });
  return { state, bus, emitted };
}

test('the swarm wave opener names the scheduled Kraken before its staged seat lands', () => {
  const heavyPlan = planFor(19);
  assert.equal(heavyPlan.swarm.boss, false, 'a character wave is not a champion wave');
  assert.equal(heavyPlan.swarm.character.name, 'Iron Kraken');
  const line = waveOpeningLine(19, heavyPlan);
  assert.ok(line.includes('Iron Kraken'), line);
  assert.ok(line.length < 160, `the opener stays inside the banner budget: ${line.length}`);
  const colossusPlan = planFor(31);
  assert.equal(colossusPlan.swarm.character.name, 'Iron Kraken Colossus');
  assert.ok(waveOpeningLine(31, colossusPlan).includes('Iron Kraken Colossus'));
  // Ordinary waves have no character seat and stay unnamed.
  assert.equal(planFor(8).swarm.character, undefined);
  assert.ok(!waveOpeningLine(8, planFor(8)).includes('Kraken'), 'no borrowed name on a plain wave');

  const h = bootAnnounce();
  try {
    h.bus.emit('run:wavePlanned', { wave: 19, plan: heavyPlan });
    const spoken = h.emitted.filter((e) => e.event === 'voice:say' || e.event === 'alert');
    const opener = spoken.filter((e) => e.payload.id === 'survival:w19:open');
    assert.equal(opener.length, 1, 'the character joins the one opener line — the wave budget is intact');
    assert.ok(opener[0].payload.text.includes('Iron Kraken'));
    assert.ok(spoken.length <= 5, `per-wave line budget holds, got ${spoken.length}`);
  } finally { survivalAnnounce.destroy(); }
});

test('the edited score still satisfies the authored contract against the real status vocabulary', () => {
  for (const encounter of [IRON_KRAKEN_HEAVY, IRON_KRAKEN_COLOSSUS]) {
    assert.deepEqual(validateCapitalBossEncounter(encounter, VOCABULARY).errors, []);
  }
  assert.ok(VOCABULARY.statusIds.has('status_momentum_sink'), 'the sink is shipped content, not a dead id');
});

test('mantle_trawl is a bounded authored beat that acts II and III actually field', () => {
  for (const encounter of [IRON_KRAKEN_HEAVY, IRON_KRAKEN_COLOSSUS]) {
    const s = encounter.score;
    const beat = s.beats.find((b) => b.id === 'mantle_trawl');
    assert.ok(beat, `${encounter.id} fields the trawl`);
    assert.ok(Number.isSafeInteger(beat.trackTicks) && beat.trackTicks >= 0);
    assert.ok(Number.isSafeInteger(beat.tellTicks) && beat.tellTicks - beat.trackTicks >= 90,
      'the locked window still meets the telegraph floor');
    assert.ok(Number.isSafeInteger(beat.activeTicks) && beat.activeTicks >= 1 && beat.activeTicks <= 60);
    assert.ok(Number.isSafeInteger(beat.recoverTicks) && beat.recoverTicks >= 90);
    assert.deepEqual(beat.expose, THROW_WINDOW, 'recovery exposes the ordinary throw window');
    assert.equal(beat.shapes.length, 1);
    assert.equal(beat.shapes[0].kind, 'sector');
    // Hull-aimed, stern-facing: the only beat whose paint is not pointed at the player, so the
    // front hemisphere that hosts the open-mantle reward stays genuinely clear.
    assert.equal(beat.shapes[0].aim, 'hull');
    assert.equal(beat.shapes[0].heading, Math.PI);
    assert.deepEqual(beat.packet.statuses.map((st) => [st.id, st.durationTicks]),
      [['status_momentum_sink', 90]], 'the hold matches the longest boss-authored sink, not more');
    assert.ok(beat.packet.channels.kinetic > 0);
    const acts = Object.fromEntries(s.acts.map((a) => [a.id, a]));
    assert.deepEqual(acts.disassembly.opening, ['mantle_trawl'], 'act II opens on the trawl');
    assert.ok(acts.disassembly.pattern.includes('mantle_trawl'), 'act II keeps it in rotation');
    assert.ok(acts.complaint.pattern.includes('mantle_trawl'), 'the finale fields the trawl');
    assert.ok(acts.complaint.pattern.includes('siphon_jet'), 'the finale stays heavy');
    assert.equal(acts.claim.opening.concat(acts.claim.pattern).includes('mantle_trawl'), false,
      'act I stays the gentle opening lesson');
  }
});

// The direct score driver from iron-kraken-combat.test.mjs. The boss faces +X (rot 0), so its
// wake is -X: the hull that gets caught sits behind the machine, and the bystander parks on
// the nose where the open-mantle reward position lives.
function scoreHarness({ bystander = false } = {}) {
  const p = IRON_KRAKEN_PROFILES.heavy;
  const boss = { id: 2, alive: true, pos: { x: 0, z: 0 }, rot: 0,
    radius: p.coreRadius, hull: p.hull, hullMax: p.hull, disabled: [] };
  const target = { id: 1, alive: true, pos: { x: -80, z: 0 }, radius: 7, hull: 200, hullMax: 200 };
  const extra = { id: 9, alive: true, pos: { x: 75, z: 0 }, radius: 7, hull: 200, hullMax: 200 };
  const fight = createCapitalBossFight({
    encounterId: p.scoreId, fightId: 'test:trawl', bossId: 2, targetId: 1 });
  let tick = 0;
  const targets = bystander ? [target, extra] : [target];
  const observe = () => ({ tick, simTime: tick * DT, active: true, boss, target, targets });
  return { boss, target, extra, fight, observe,
    step() { const commands = stepCapitalBossFight(fight, observe()); tick++; return commands; } };
}

/** Drive the score into act II, whose opening cast is the trawl, and stop once it locks. */
function driveToTrawlLock(h) {
  h.boss.hull = h.boss.hullMax * 0.5;
  const telegraphs = [];
  for (let guard = 0; guard < 4000; guard++) {
    telegraphs.push(...h.step().filter((c) => c.type === 'telegraph'));
    if (h.fight.cast && h.fight.cast.beatId === 'mantle_trawl' && h.fight.cast.locked) {
      return telegraphs.filter((c) => c.beatId === 'mantle_trawl');
    }
  }
  assert.fail('the disassembly act never opened with the trawl');
}

test('the trawl paints the machine\'s wake, then sinks only what it catches', () => {
  const h = scoreHarness({ bystander: true });
  const telegraphs = driveToTrawlLock(h);
  assert.equal(h.fight.actIndex, 1, 'hull threshold entered the disassembly act');
  assert.ok(telegraphs.some((c) => c.locked === false), 'the cast telegraphs while still tracking');
  assert.ok(telegraphs.some((c) => c.locked === true), 'the lock is announced');
  assert.ok(telegraphs.every((c) => c.shapes.length === 1 && c.shapes[0].kind === 'sector'),
    'the telegraph carries the same sector the damage reads');
  const locked = h.fight.cast.shapes[0];
  // The paint locks onto the hull's stern bearing, not onto the player — this is the read that
  // keeps the front reward position honest.
  assert.ok(Math.abs(wrapAngle(locked.heading - (h.boss.rot + Math.PI))) < 1e-6,
    'the sector locks onto the machine\'s own wake');
  // Geometric proof, not assertion-by-construction: the target is inside the painted wake, and
  // the whole nose hemisphere the reward position occupies is outside it.
  assert.equal(bodyIntersectsBossShapes(h.target, [locked]), true,
    'the hull in the wake is inside the paint');
  for (const noseBearing of [-1.4, -0.7, 0, 0.7, 1.4]) {
    for (const dist of [20, 60, 100]) {
      const pos = { x: h.boss.pos.x + Math.cos(noseBearing) * dist,
        z: h.boss.pos.z + Math.sin(noseBearing) * dist };
      assert.equal(bodyIntersectsBossShapes({ pos, radius: h.extra.radius }, [locked]), false,
        `nose position bearing ${noseBearing} at ${dist} is outside the wake paint`);
    }
  }
  assert.equal(bodyIntersectsBossShapes(h.extra, [locked]), false,
    'the bystander on the nose — the reward position — is outside the paint');

  const hits = [];
  while (h.fight.phase !== 'recovery') hits.push(...h.step());
  const damage = hits.filter((c) => c.type === 'damage' && c.origin && c.origin.kind === 'capital_score');
  const caught = damage.filter((c) => c.targetId === h.target.id);
  assert.equal(caught.length, 1, 'one cast, one receipt on the caught hull');
  assert.equal(caught[0].packet.channels.kinetic, 8);
  assert.deepEqual(caught[0].packet.statuses.map((st) => [st.id, st.durationTicks]),
    [['status_momentum_sink', 90]], 'the catch hauls the hull to the Kraken frame for 1.5s');
  assert.equal(damage.some((c) => c.targetId === h.extra.id), false,
    'a body on the nose — the front reward position — takes nothing');
  const exposure = hits.find((c) => c.type === 'damage' && c.origin && c.origin.kind === 'capital_exposure');
  assert.ok(exposure, 'recovery emits the expose packet');
  assert.equal(exposure.targetId, h.boss.id);
  assert.deepEqual(exposure.packet.statuses.map((st) => st.id), ['status_unmoored']);
});

test('a hull that slips the locked wake paint before the trawl fires takes nothing', () => {
  const h = scoreHarness();
  driveToTrawlLock(h);
  const locked = clone(h.fight.cast.shapes);
  h.target.pos = { x: 75, z: 0 };
  const hits = [];
  while (h.fight.phase !== 'active') hits.push(...h.step());
  assert.deepEqual(h.fight.cast.shapes, locked, 'after lock, dodging does not drag the warning');
  while (h.fight.phase !== 'recovery') hits.push(...h.step());
  assert.equal(hits.filter((c) => c.type === 'damage' && c.origin && c.origin.kind === 'capital_score')
    .length, 0, 'crossing to the nose escapes the locked wake sector');
});

// The wave-owner harness from iron-kraken-combat.test.mjs: real survivalWave + the production
// capital encounter owner, so _characterFightId, fight.bossId and the shooter cap are the
// shipped seam rather than a stub.
function waveHarness(wave = 7) {
  resetSwarmPressureState();
  const state = createGameState(4242), raw = createBus(), events = [], spawned = [], damage = [];
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
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p.id));
  const ctx = { state, bus, helpers };
  const waveSystem = Object.create(survivalWave); waveSystem.init(ctx);
  const capital = createProductionCapitalBossEncounters(); capital.init(ctx);
  noteSwarmPilotAction(state);
  bus.emit('run:wavePlanned', { wave, plan: planFor(wave) });
  bus.emit('run:waveStarted', { wave });
  const h = { state, bus, events, spawned, player, waveSystem, capital };
  h.tick = (count = 1) => { for (let i = 0; i < count; i++) {
    state.tick++; state.simTime += DT; waveSystem.update(DT); capital.update(DT);
  } };
  h.krakens = () => spawned.filter((e) => e.data?.ironKraken);
  h.close = () => { waveSystem.destroy(); capital.destroy(); };
  return h;
}

test('a Kraken-sourced sink keeps the wave\'s shooters at tell volume through recovery', () => {
  const h = waveHarness(19);
  try {
    for (let guard = 0; guard < 1200 && h.krakens().length === 0; guard++) h.tick();
    const boss = h.krakens()[0];
    assert.ok(boss, 'the character seat landed');
    const fight = h.state.capitalBossEncounters.fights[boss.data.ironKraken.fightId];
    assert.equal(fight.bossId, boss.id);
    // Enough armed henchmen for the recovery cap to bind: round nineteen permits at least six, so the
    // recovery budget of five releases four besides the boss, and tell volume releases two.
    for (let i = 0; i < 6; i++) {
      const henchman = { id: h.state.nextEntityId++, alive: true, type: 'ship',
        pos: { x: 60 + i * 10, z: 40 }, radius: 8, hull: 60, hullMax: 60, data: { ai: {} } };
      h.state.entities.set(henchman.id, henchman);
      h.waveSystem._cohort.set(henchman.id, { entity: henchman, armedAt: -1 });
    }
    const released = () => [...h.waveSystem._cohort.values()]
      .filter((m) => m.entity !== boss && m.entity.data.ai.swarmFireHeld === false).length;

    for (let guard = 0; guard < 4000 && fight.phase !== 'recovery'; guard++) h.tick();
    assert.equal(fight.phase, 'recovery', 'the opening cast spent into its open-mantle window');
    h.tick(3);
    assert.equal(released(), 4, 'recovery volume: four henchmen beside the boss');

    // The player carries the Kraken's own sink: recovery keeps tell/attack volume.
    h.state.combat.entities = h.state.combat.entities || {};
    h.state.combat.entities[h.player.id] = { statuses: { [MOMENTUM_SINK_STATUS_ID]: {
      id: MOMENTUM_SINK_STATUS_ID, stacks: 1,
      appliedTick: h.state.tick, expiresTick: h.state.tick + 90, attackerId: boss.id } } };
    h.tick();
    assert.equal(released(), 2, 'kraken-sourced sink holds the wave at tell volume through recovery');
    h.tick(2);
    assert.equal(released(), 2, 'the hold persists while the sink is live');

    // The same status from any other attacker restores the ordinary recovery budget.
    h.state.combat.entities[h.player.id].statuses[MOMENTUM_SINK_STATUS_ID].attackerId = 555;
    h.tick();
    assert.equal(released(), 4, 'a sink from another source does not extend the cap');
    h.state.combat.entities[h.player.id].statuses[MOMENTUM_SINK_STATUS_ID].attackerId = boss.id;

    // And when the grip has run its clock, the budget returns on the next shaping pass.
    h.state.combat.entities[h.player.id].statuses[MOMENTUM_SINK_STATUS_ID].expiresTick = h.state.tick;
    h.tick();
    assert.equal(released(), 4, 'an expired sink restores recovery volume');
  } finally { h.close(); }
});
