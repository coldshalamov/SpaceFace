// SEED-HF-07 — a swarm capital fight puts its authored throw-mass on the field once.
// The wave already spawned the hull. capitalBoss:start places the ballast. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { capitalBossBallastPosition } from '../src/missions/capitalBossSpawn.js';
import { requireCapitalBossEncounter } from '../src/data/encounters/capital-boss.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const DT = 1 / 60;
const SEED = 4242;

function boot() {
  const state = createGameState(SEED);
  const raw = createBus();
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { raw.emit(event, payload); },
  };
  const helpers = {
    spawnBudget: makeBudgetApi(state),
    routeCombatDamage(packet) { return packet; },
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, y: 0, z: spec.pos.z } : { x: 0, y: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, y: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  state.run.arenaId = 'helios_core';
  state.run.phase = 'active';
  state.run.wave = 20;
  const ctx = { state, bus, helpers };
  survivalWave.init(ctx);
  const capSys = createProductionCapitalBossEncounters();
  capSys.init(ctx);
  return { state, bus, capSys };
}

function rocks(state) {
  return [...state.entities.values()].filter((entity) => entity && entity.data && entity.data.physicalRole === 'throw_mass');
}

test('seed 4242: the Foreman fight fields its lane wreckage once and does not field a second hull', () => {
  const h = boot();
  const plan = planWave({ seed: SEED, arenaId: 'helios_core', wave: 20, ruleset: SWARM_RULESET });
  h.bus.emit('run:wavePlanned', { wave: 20, plan });
  h.bus.emit('run:waveStarted', { wave: 20 });
  h.state.tick += 1;
  h.state.simTime += DT;
  survivalWave.update(DT);
  h.capSys.update(DT);

  const encounter = requireCapitalBossEncounter('capital_boss_foreman');
  const fight = h.state.capitalBossEncounters.fights['swarm:w20'];
  assert.ok(fight, 'the swarm fight started');
  const boss = h.state.entities.get(fight.bossId);
  assert.ok(boss, 'the wave hull is the boss');
  const mass = rocks(h.state);
  assert.equal(mass.length, 3, 'the authored ballast count is on the field');
  assert.ok(mass.every((rock) => rock.data.scanLabel === 'LANE WRECKAGE'));
  assert.ok(mass.every((rock) => rock.type === 'asteroid' && rock.collides === true && rock.data.tetherable === true));
  assert.equal(mass.filter((rock) => rock.data.physicalRole === 'capital_hull').length, 0);
  const pose = { pos: { x: boss.pos.x, z: boss.pos.z }, rot: boss.rot || 0 };
  for (let i = 0; i < mass.length; i++) {
    const expected = capitalBossBallastPosition(encounter, pose, i);
    const rock = mass.find((row) => row.data.capitalBossActorKey === `swarm:w20/throw_mass/${i}`);
    assert.ok(rock, `slot ${i} was issued`);
    assert.ok(Math.abs(rock.pos.x - expected.x) < 0.001 && Math.abs(rock.pos.z - expected.z) < 0.001);
  }

  const before = mass.length;
  h.bus.emit('capitalBoss:start', {
    encounterId: 'capital_boss_foreman',
    fightId: 'swarm:w20',
    bossId: fight.bossId,
    targetId: h.state.playerId,
  });
  mass[0].alive = false;
  h.bus.emit('capitalBoss:start', {
    encounterId: 'capital_boss_foreman',
    fightId: 'swarm:w20',
    bossId: fight.bossId,
    targetId: h.state.playerId,
  });
  assert.equal(rocks(h.state).length, before, 'a second start does not replace spent mass or add a rock');
});
