// REV-5 follow-up (SWARM-07 B3/B4 review) — the authored capital-score contract was written
// (src/data/encounters/capital-boss/validate.js) but never wired: no module-init assert and no
// test iterated the catalog, so a row violating the telegraph floor shipped silently. This suite
// is the guard that was missing: every shipped score runs through the SAME vocabulary the live
// catalogs own (statuses, wing grammars, twist clauses, enemy roster) AND through the production
// encounter system — `capitalBoss:start` on the factory the registry builds, stepped until the
// score's first telegraph — so a row that cannot validate or cannot execute fails here loudly.
//
// Landing this guard surfaced four rows that had drifted below the floor:
//   foreman/last_charge tracked 48 of 126 tell ticks (78 locked < 90) — the lock now lands at
//     36, earliest in the fight exactly as the counter reads ("locks earliest").
//   regent/last_beam left 78 locked ticks — the tell is 144 (90 locked); the 54-tick track is
//     still the catalog's longest commitment and the cast still declares before the first burn's.
//   brood-queen/brood_screen named a twist clause that does not exist — the warden_screen
//     grammar's own clause (protect_the_pack) is the one the squad resolver would draw and the
//     one every sibling screen already stamps.
//   tendril/tail_sweep opened lanes at start -150 — the ±PI/2 pair from 0..150 draws the
//     identical band through the hull inside the lane bound.
// The validator's floors did not move. The rows did.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import {
  CAPITAL_BOSS_ENCOUNTERS,
  requireCapitalBossEncounter,
} from '../src/data/encounters/capital-boss.js';
import { assertCapitalBossEncounter } from '../src/data/encounters/capital-boss/validate.js';
import { STATUS_DEFS, WING_COMPOSITION_GRAMMAR, TWIST_CLAUSES } from '../src/data/combatDefs.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { LAST_ARGUMENT as LAST_ARGUMENT } from '../src/data/lastArgument.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { combat } from '../src/systems/combat.js';
import { bootRealPath, OPEN_SPACE_BOUNDS } from '../scripts/lib/bench/realPath.mjs';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { observeLastArgument } from '../src/systems/lastArgument.js';

const DT = 1 / 60;
const SEED = 4242;

// The validator's vocabulary is the caller's to supply — these are the same catalogs the
// production consumers resolve against, so a wing/status/grammar/archetype that is not real
// content fails the contract rather than shipping as dead metadata.
const VOCABULARY = Object.freeze({
  statusIds: new Set(STATUS_DEFS.map((d) => d.id)),
  grammarIds: new Set(WING_COMPOSITION_GRAMMAR.map((g) => g.id)),
  twistIds: new Set(Object.keys(TWIST_CLAUSES)),
  enemyIds: new Set(ENEMY_TYPES.map((e) => e.id)),
});

test('every shipped capital score satisfies the authored telegraph contract', () => {
  const rows = Object.values(CAPITAL_BOSS_ENCOUNTERS);
  assert.equal(rows.length, 8, 'the seven established capitals and Last Argument remain catalogued');
  const failures = [];
  for (const encounter of rows) {
    try {
      assertCapitalBossEncounter(encounter, VOCABULARY);
    } catch (error) {
      failures.push(`${encounter.id}: ${error.message}`);
    }
  }
  assert.deepEqual(failures, [], 'a score that breaks the floor fails loudly');
});

// Through the production factory: a fabricated ACTIVE mission-row fight — the same observe/
// spawnWing ports the registry singleton binds — stepped until each score declares its first
// telegraph. A row that validates but cannot execute on the shipped machinery still fails.
function bootScoreFight(encounterId) {
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
  const spawned = [];
  const helpers = {
    spawnBudget: makeBudgetApi(state),
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
    getCombatCapabilities() { return null; },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  // Inside the 620 engage radius but outside every authored opening shape (bands start at 30).
  const boss = {
    id: state.nextEntityId++, alive: true, pos: { x: 300, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, radius: 20, type: 'ship', team: 1,
  };
  state.entities.set(boss.id, boss);
  state.entityList.push(boss);
  // A live mission row is what makes a non-swarm fight's observe() active; the sector gate
  // matches it exactly like a posted capital contract's destination.
  const fightId = `contract:${encounterId}`;
  state.missions.active.push({ id: fightId, status: 'active', destSectorId: 'contract_room' });
  state.world.currentSectorId = 'contract_room';
  const capSys = createProductionCapitalBossEncounters();
  capSys.init({ state, bus, helpers });
  bus.emit('capitalBoss:start', {
    encounterId, fightId, bossId: boss.id, targetId: player.id,
  });
  return { state, bus, emitted, spawned, capSys, fightId, boss, player };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
    h.state.simTime += DT;
    h.capSys.update(DT);
  }
}

test('the production factory executes mission-owned capital scores to their first telegraph', () => {
  for (const id of Object.keys(CAPITAL_BOSS_ENCOUNTERS)) {
    // Last Argument's admission belongs to encounterDirector, not a fabricated mission row.
    // Its real director/native-physics route is exercised below.
    if (id === LAST_ARGUMENT.scoreId) continue;
    const h = bootScoreFight(id);
    const score = requireCapitalBossEncounter(id).score;
    const authored = new Set(score.beats.map((b) => b.id));
    // intro + one act transition, then the cast — the same window the live fights use.
    tick(h, score.introTicks + score.transitionTicks + 40);
    const fight = h.state.capitalBossEncounters.fights[h.fightId];
    assert.ok(fight, `${id}: capitalBoss:start opened a fight record`);
    assert.equal(fight.started, true, `${id}: the score is running on the live pair`);
    const telegraphs = h.emitted.filter((e) => e.event === 'capitalBoss:telegraph');
    assert.ok(telegraphs.length > 0, `${id}: the score telegraphs before it lands`);
    assert.ok(authored.has(telegraphs[0].payload.beatId),
      `${id}: the telegraph is an authored beat, got ${telegraphs[0].payload.beatId}`);
    assert.ok(telegraphs[0].payload.fireAt > telegraphs[0].payload.startedAt,
      `${id}: the telegraph carries a readable warning window`);
    h.capSys.destroy();
  }
});

test('Last Argument admits through the real director and native runtime before starting its score', async () => {
  const sectorId = LAST_ARGUMENT.sectors[0];
  const playerPos = sectorLocalToGlobalForSector({ x: 0, z: 0 }, sectorId);
  const host = await bootRealPath({ seed: SEED, bounds: OPEN_SPACE_BOUNDS,
    systems: [spawnBudget, combat, encounterDirector, createProductionCapitalBossEncounters()],
    prepareState({ state }) {
      state.mode = 'flight'; state.run = { kind: 'adventure' };
      state.simTime = LAST_ARGUMENT.earliestSeconds + LAST_ARGUMENT.firstDelayMin + LAST_ARGUMENT.firstDelaySpan + 1;
      state.world.currentSectorId = sectorId;
      state.world.activeSector = SECTORS.find(row => row.id === sectorId);
    },
    hulls: [{ hullId: 'ship_kestrel', isPlayer: true, pos: playerPos, team: 0 }],
  });
  try {
    const telegraphs = [];
    host.bus.on('capitalBoss:telegraph', payload => telegraphs.push(payload));
    host.step(2);
    const own = host.state.capitalBossEncounters.lastArgument;
    assert.ok(own?.active, 'ordinary capital owner requests and admits the director encounter');
    const body = host.state.entities.get(own.active.bossId);
    assert.equal(body.data.lootTableId, LAST_ARGUMENT.enemyId);
    assert.equal(body.physicsBody.shape, 'compound');
    const score = requireCapitalBossEncounter(LAST_ARGUMENT.scoreId).score;
    host.step(score.introTicks + score.transitionTicks + 40);
    const record = host.state.capitalBossEncounters.fights[own.active.key];
    assert.equal(record.started, true, 'the director-admitted live pair starts its real score');
    assert.ok(telegraphs.some(p => p.fightId === record.fightId && p.beatId === 'sounding'));
    assert.equal(host.proof().backend, 'rapier-dynamic');
    const clock = record.clock;
    host.state.ui.docked = true; host.step(2);
    assert.equal(record.clock, clock, 'docking suspends the admitted fight instead of bypassing lifecycle authority');
    assert.equal(observeLastArgument(record, host.state, host.runtime.getHelpers()).active, false);
  } finally { host.dispose(); }
});

test('Last Argument vocabulary accepts its real banks while rejecting invented banks and oversized wings', () => {
  const original = requireCapitalBossEncounter(LAST_ARGUMENT.scoreId);
  assert.doesNotThrow(() => assertCapitalBossEncounter(original, VOCABULARY));
  const badBank = structuredClone(original);
  badBank.score.beats[0].requires.push('last_argument_invented_bank');
  assert.throws(() => assertCapitalBossEncounter(badBank, VOCABULARY), /requirements/);
  const oversized = structuredClone(original);
  oversized.score.maxWingMembers = 3;
  assert.throws(() => assertCapitalBossEncounter(oversized, VOCABULARY), /two-wing-member ceiling/);
});
