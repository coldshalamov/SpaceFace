// RC-SWARM-CLEAN — a Swarm run reads and behaves like a run, not an Adventure field.
//
// Row 456: the Crucible runs with world.currentSectorId === null and its kill receipts also
// carry sectorId null, so the Adventure aftermath filter (null !== null) treated every arena
// kill as a live field and mounted the "FIELD STILL LIVE" card over the run's own keys 1–2.
// These fixtures pin the gate (a live survival run never offers the card, Adventure still
// does), the run's own copy ("One hostile", "+10 cr"), and the seed-4242 proof that round 1
// resolves into round 2 when its quota actually dies.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeEntity } from '../src/core/entity.js';
import { core } from '../src/core/coreSystem.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  WAVE_CLEARED_SEAM,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { combatOutcome, setCombatOutcomeQuietLatchForBench } from '../src/systems/combatOutcome.js';
import { survivalAnnounce } from '../src/systems/survivalAnnounce.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { swarmQuota } from '../src/data/swarmMode.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { pickupFloatingTextSpec } from '../src/ui/floatingText.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEED = 4242;
const SECTOR = 'sector_tethys_junction';

function bootSwarm() {
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
  const helpers = {
    spawnBudget: budget,
    voice: { say() { return true; } },
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      entity.alive = true;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = {
    // The live player is team 0; the arena's swarmers are team 1. (The wreck fixtures that
    // this boot copies only needed a non-hostile hull, so they parked the player on team 1.)
    id: state.nextEntityId++, alive: true, type: 'ship', team: 0, radius: 16, mass: 58,
    pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const registry = { get: (name) => (name === 'aftermathWrecks' ? aftermathWrecks : null) };
  const ctx = { state, bus, helpers, registry };
  runSession.init(ctx);
  survivalWave.init(ctx);
  aftermathWrecks.init(ctx);
  survivalRun.init(ctx);
  const outcome = Object.create(combatOutcome);
  outcome.init(ctx);

  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      state.tick += 1;
      state.simTime += DT;
      survivalWave.update(DT);
      survivalRun.update(DT);
      aftermathWrecks.update(DT, state);
    }
  };
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  bus.emit('run:loadoutReady', {});
  tick(1 + SURVIVAL_ARENA_INTRO_TICKS + SURVIVAL_WAVE_INTRO_TICKS + 90);
  return { state, bus, emitted, helpers, player, tick, outcome };
}

function cohortHostiles(h) {
  return h.state.entityList.filter((e) => e && e.alive !== false && e !== h.player
    && e.data && e.data.runCohort === SURVIVAL_COHORT_TAG);
}

// The same payload shape the combat kernel and combat.js publish on a gunfire kill.
function killByGunfire(h, entity) {
  entity.alive = false;
  h.bus.emit('entity:killed', {
    id: entity.id, killerId: h.player.id, type: entity.type,
    pos: { x: entity.pos.x, z: entity.pos.z }, factionId: entity.factionId || null,
    victimClass: (entity.data && entity.data.shipClass) || entity.type,
  });
}

function makeAdventureHarness() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.tick = 40;
  state.simTime = 1;
  state.ui = {};
  state.world = { currentSectorId: SECTOR, sectors: {} };
  const bus = createBus();
  const emitted = [];
  const wrappers = {
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),
    once: bus.once.bind(bus),
    emit(event, payload) {
      emitted.push({ event, payload });
      bus.emit(event, payload);
    },
  };
  const helpers = { voice: { say() { return true; } } };
  core.init({ state, bus: wrappers, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, team: 0,
    hull: 100, hullMax: 100, data: { ai: { passive: true } },
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const ships = [player];
  Object.assign(state.entityIndex, {
    ready: true, __spacefaceEntityIndexV1: true, ships, shipLike: ships, version: 1,
  });
  const outcome = Object.create(combatOutcome);
  outcome.init({ state, bus: wrappers, helpers, registry: null });

  const spawnHostile = (x) => {
    const ship = helpers.spawnEntity({
      type: 'ship', pos: { x, z: 20 }, vel: { x: 0, z: 0 }, team: 1,
      hull: 80, hullMax: 80,
      data: { ai: { passive: true, hostileTeams: [0] }, name: 'Bandit' },
    });
    ships.push(ship);
    state.entityIndex.ships = ships;
    state.entityIndex.shipLike = ships;
    return ship;
  };
  return { state, bus: wrappers, emitted, helpers, player, spawnHostile };
}

function choiceEmits(emitted) {
  return emitted.filter((e) => e.event === 'combat:aftermathChoices');
}

test('seed 4242: an arena kill never mounts the aftermath card', () => {
  setCombatOutcomeQuietLatchForBench(true);
  const h = bootSwarm();
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.state.world.currentSectorId, null, 'the arena has no sector');

  const victims = cohortHostiles(h).slice(0, 3);
  assert.equal(victims.length, 3, 'wave one fielded three cohort hostiles to kill');
  for (const victim of victims) {
    killByGunfire(h, victim);
    h.tick(1);
  }

  const cards = choiceEmits(h.emitted).filter((e) => (e.payload && e.payload.choices || []).length >= 2);
  assert.equal(cards.length, 0, 'a live run never borrows keys 1–2 with an Adventure card');
  assert.equal(h.state.combatOutcome.aftermath, null, 'no offer is held in the run');
  assert.ok(h.state.combatOutcome.outcomes.length >= 3, 'the observer still records every kill');
});

test('a card mounted in Adventure resolves when the run starts', () => {
  setCombatOutcomeQuietLatchForBench(true);
  const h = makeAdventureHarness();
  const first = h.spawnHostile(400);
  h.spawnHostile(800);
  h.bus.emit('entity:killed', { id: first.id, killerId: h.state.playerId });

  const offered = choiceEmits(h.emitted);
  assert.ok(offered.length > 0, 'Adventure published the field');
  assert.ok((offered[offered.length - 1].payload.choices || []).length >= 2,
    'Adventure still offers the card outside a run');

  const chosenBefore = h.emitted.filter((e) => e.event === 'combat:aftermathChosen').length;
  h.state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  h.state.run.phase = 'active';
  h.state.run.wave = 1;
  h.bus.emit('run:started', { kind: 'survival', ruleset: 'swarm', seed: SEED });

  const resolved = choiceEmits(h.emitted);
  assert.equal((resolved[resolved.length - 1].payload.choices || []).length, 0,
    'the run commit resolves the mounted card');

  h.bus.emit('combat:aftermathChoose', { choiceId: 'escape' });
  const chosenAfter = h.emitted.filter((e) => e.event === 'combat:aftermathChosen').length;
  assert.equal(chosenAfter, chosenBefore, 'a stray digit in a run never applies an Adventure verb');
});

test('Adventure still offers the card outside a run', () => {
  setCombatOutcomeQuietLatchForBench(true);
  const h = makeAdventureHarness();
  h.state.run = createRunState();
  const victim = h.spawnHostile(400);
  h.bus.emit('entity:killed', { id: victim.id, killerId: h.state.playerId });
  const offered = choiceEmits(h.emitted);
  assert.ok(offered.length > 0);
  assert.ok((offered[offered.length - 1].payload.choices || []).length >= 2,
    'an inactive run does not gate Adventure');
});

test('seed 4242: round 1 resolves into round 2 when its quota dies', () => {
  setCombatOutcomeQuietLatchForBench(true);
  const h = bootSwarm();
  assert.equal(h.state.run.phase, 'active');
  assert.equal(h.state.run.wave, 1);
  const quota = swarmQuota(1);

  let guard = 0;
  while (!(h.state.run.phase === 'active' && h.state.run.wave === 2) && guard++ < 60 * 600) {
    const victim = cohortHostiles(h)[0];
    if (victim) killByGunfire(h, victim);
    h.tick(1);
    const phase = h.state.run.phase;
    if (phase === 'draft' || phase === 'refit') {
      h.bus.emit(phase === 'draft' ? 'run:draftResolved' : 'run:refitClosed', {});
    }
  }

  const cleared = h.emitted.filter((e) => e.event === WAVE_CLEARED_SEAM && e.payload && e.payload.wave === 1);
  assert.equal(cleared.length, 1, 'wave 1 cleared exactly once');
  assert.equal(cleared[0].payload.completionKind, 'cohort', 'a kill-target round clears on its cohort');
  assert.ok(cleared[0].payload.killed >= quota,
    `the wave cleared only after its quota (killed ${cleared[0].payload.killed}, quota ${quota})`);
  assert.equal(h.state.run.wave, 2, 'the run reached round 2');
  assert.equal(h.state.run.phase, 'active');
});

function bootSurvivalAnnounce({ stored, tick, wave = 2 } = {}) {
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
  const run = createRunState({ kind: 'survival', seed: SEED });
  run.ruleset = 'swarm';
  run.phase = 'active';
  run.wave = wave;
  state.run = run;
  state.tick = 100;
  survivalAnnounce.init({ state, bus, helpers: {} });
  bus.emit('swarm:pressureTelegraph', { wave, stored, tick });
  const lines = emitted.filter((e) => e.event === 'voice:say');
  return { lines };
}

test('One hostile, not One hostiles', () => {
  const singular = bootSurvivalAnnounce({ stored: 1, tick: 200 });
  assert.equal(singular.lines.length, 1);
  assert.equal(singular.lines[0].payload.text, 'Inbound surge. One hostile on approach.');

  const plural = bootSurvivalAnnounce({ stored: 3, tick: 300 });
  assert.equal(plural.lines.length, 1);
  assert.equal(plural.lines[0].payload.text, 'Inbound surge. Three hostiles on approach.');
});

test('a run credit chip reads +N cr', () => {
  const chip = pickupFloatingTextSpec({
    pickupId: 1, collectorId: 1, kind: 'credit_chip', amount: 10, credits: 10,
    wallet: 'run', pos: { x: 0, z: 0 },
  });
  assert.ok(chip);
  assert.equal(chip.text, '+10 cr');
  assert.equal(chip.cls, 'sf-ft--credits');
  assert.equal(/Item/.test(chip.text), false);

  const commodity = pickupFloatingTextSpec({
    pickupId: 2, collectorId: 1, commodityId: 'cmdty_scrap_metal', kind: 'ore', amount: 2,
    pos: { x: 0, z: 0 },
  });
  assert.ok(commodity);
  assert.equal(commodity.text, '+2 Scrap Metal');
  assert.equal(/ cr$/.test(commodity.text), false);
});
