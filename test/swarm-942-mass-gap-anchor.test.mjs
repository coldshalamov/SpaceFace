// PRI-11f / PR #942 F22 — the mass-gap wall's delayed heavies belong to the room
// the chord was planted in. The wall batch waits SWARM_MASS_GAP_CLOSE_TICKS while
// the pilot fights the fodder opening; if the materializer re-reads the pilot's
// position at the dispatch tick, the muscle arrives wherever the pilot has flown
// to — through a gate that exists nowhere — instead of pouring through the wall's
// own gaps beside the chord. Today's course is 30 rounds, so the first mass-gap
// wave this can happen on is generated wave 36 (every sixth non-boss round).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  batchStreamSeed,
  gateBearing,
  materializeWaveBatch,
} from '../src/systems/waveMaterialization.js';
import {
  SWARM_MASS_GAP_CLOSE_TICKS,
  SWARM_MASS_GAP_WALL_DISTANCE,
  SWARM_RULESET,
  resetSwarmPressureState,
} from '../src/data/swarmMode.js';

const SEED = 7;
const ARENA = 'helios_core';
const MASS_GAP_WAVE = 36; // first generated mass-gap wave past the 30-round course

function room({ seed = SEED, wave = MASS_GAP_WAVE, origin = { x: 0, z: 0 } } = {}) {
  resetSwarmPressureState();
  const state = createGameState(seed);
  const bus = createBus();
  state.mode = 'flight';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed }),
    phase: 'active', wave, arenaId: ARENA };
  const budget = makeBudgetApi(state);
  budget.setMax(40);
  const spawnedLog = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const e = { ...spec, id: state.nextEntityId++, alive: true, collides: true,
        pos: { ...spec.pos }, vel: { ...(spec.vel || { x: 0, z: 0 }) } };
      state.entities.set(e.id, e);
      state.entityList.push(e);
      spawnedLog.push({ entity: e, atTick: state.tick });
      return e;
    },
    removeEntity(id) {
      const e = state.entities.get(id);
      if (!e) return;
      e.alive = false;
      state.entities.delete(id);
      state.entityList = state.entityList.filter((other) => other !== e);
      bus.emit('entity:destroyed', { id, entity: e });
    },
  };
  bus.on('entity:destroyed', (p) => budget.releaseEntity(p.id, p.entity));
  const player = helpers.spawnEntity({ type: 'ship', pos: origin, radius: 8, mass: 40, data: {} });
  state.playerId = player.id;
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  return { state, bus, helpers, budget, player, spawnedLog, ctx };
}

function planned(seed, wave) {
  const plan = planWave({ seed, wave, ruleset: SWARM_RULESET, arenaId: ARENA });
  assert.ok(plan && plan.ok !== false && !plan.error, `plan wave ${wave}`);
  return plan;
}

test('the wall batch materializes beyond the wall line from the ROOM anchor, not the moved pilot', () => {
  const h = room();
  const plan = planned(SEED, MASS_GAP_WAVE);
  const massGap = plan.swarm && plan.swarm.massGap;
  assert.ok(massGap, 'generated wave 36 is a mass-gap round');
  const wall = plan.packages.find((pkg) => pkg.wall === true);
  assert.ok(wall, 'a heavy pair pours through the wall gate late');
  assert.equal(wall.atTick, SWARM_MASS_GAP_CLOSE_TICKS);
  assert.ok(wall.distance > SWARM_MASS_GAP_WALL_DISTANCE,
    'the muscle arrives on the far side of the chord');

  const sys = Object.create(survivalWave);
  sys.init(h.ctx);
  const materialized = [];
  h.bus.on('run:waveMaterialized', (p) => materialized.push(p));
  try {
    h.bus.emit('run:wavePlanned', { wave: MASS_GAP_WAVE, plan });
    h.bus.emit('run:waveStarted', { wave: MASS_GAP_WAVE });
    // The pilot wins the fodder skirmish a long way from the room the wall was built in.
    h.player.pos.x = 900;
    h.player.pos.z = 0;

    const heavyId = massGap.heavyEnemyId;
    const wallBodies = [];
    // The opener's own spacing can push the owed wall batch past its authored tick —
    // it is a floor, not a deadline — so the window leaves room for the breath.
    for (let tick = 0; tick < SWARM_MASS_GAP_CLOSE_TICKS + 120 && wallBodies.length === 0; tick++) {
      h.state.tick++;
      h.state.simTime += 1 / 60;
      // Chaff dies on contact; the wall pair alone survives to be measured.
      for (const e of [...h.state.entityList]) {
        if (e.alive !== false && e.type !== 'beacon' && e.data?.runCohort === 'survival'
            && e.data?.lootTableId !== heavyId) {
          e.alive = false;
          h.helpers.removeEntity(e.id);
        }
      }
      sys.update();
      for (const row of h.spawnedLog) {
        if (row.entity.data?.lootTableId === heavyId && !wallBodies.includes(row.entity)) {
          wallBodies.push(row.entity);
        }
      }
    }

    const wallEvent = materialized.find((p) => p.enemyId === heavyId
      && p.gateGroup === massGap.gate && p.admitted > 0);
    assert.ok(wallEvent, 'the wall batch must land — it is owed');
    assert.ok(wallEvent.atTick >= SWARM_MASS_GAP_CLOSE_TICKS,
      'the muscle still waits for the corridor close');
    assert.ok(wallBodies.length > 0, 'the heavies are real bodies in the room');

    // Each heavy sits beyond the chord line measured from the wave's own room — the
    // anchor the wall was planted on at planning — not beside the pilot at +900.
    for (const body of wallBodies) {
      const fromRoom = Math.hypot(body.pos.x, body.pos.z);
      const fromPilot = Math.hypot(body.pos.x - 900, body.pos.z);
      assert.ok(fromRoom < 430,
        `heavy at ${JSON.stringify(body.pos)} followed the pilot (${fromRoom.toFixed(0)} WU from the room)`);
      assert.ok(fromPilot > 160,
        `heavy materialised ${fromPilot.toFixed(0)} WU from the moved pilot — on top of them`);
      // And the wall's own bearing still describes the approach: the pair pours
      // through the gate the chord was planted on.
      const bearing = gateBearing(massGap.gate);
      const along = (body.pos.x * bearing.x + body.pos.z * bearing.z);
      assert.ok(along > SWARM_MASS_GAP_WALL_DISTANCE - 60,
        'the heavy stands past the wall line, pouring through the gaps');
    }
    assert.deepEqual(sys._massGapAnchor, { x: 0, z: 0 },
      'the wave owner snapshots the room anchor at planning');
  } finally {
    sys.destroy();
  }
});

test('a re-plan of the same wave keeps the anchor, and a non-mass-gap wave drops it', () => {
  const h = room();
  const plan36 = planned(SEED, MASS_GAP_WAVE);
  const plan37 = planned(SEED, MASS_GAP_WAVE + 1);
  assert.equal(plan37.swarm.massGap, undefined, 'wave 37 is not mass-gap');
  const sys = Object.create(survivalWave);
  sys.init(h.ctx);
  try {
    h.bus.emit('run:wavePlanned', { wave: MASS_GAP_WAVE, plan: plan36 });
    assert.deepEqual(sys._massGapAnchor, { x: 0, z: 0 });
    // The identical replan is a no-op — the snapshot is the same room.
    h.bus.emit('run:wavePlanned', { wave: MASS_GAP_WAVE, plan: plan36 });
    assert.deepEqual(sys._massGapAnchor, { x: 0, z: 0 });
    h.state.run.wave = MASS_GAP_WAVE + 1;
    h.bus.emit('run:wavePlanned', { wave: MASS_GAP_WAVE + 1, plan: plan37 });
    assert.equal(sys._massGapAnchor, null, 'the next wave owns no room anchor');
  } finally {
    sys.destroy();
  }
});

test('the materializer honors a wall roomAnchor identically for any pilot position', () => {
  const plan = planned(SEED, MASS_GAP_WAVE);
  const wall = plan.packages.find((pkg) => pkg.wall === true);
  const packageIndex = plan.packages.indexOf(wall);
  const request = (roomAnchor) => ({
    ownerId: 'survival-wave:36', enemyId: wall.enemyId, count: wall.count,
    wave: MASS_GAP_WAVE, seed: SEED, packageIndex, batchIndex: 9,
    gateGroup: wall.gateGroup, distance: wall.distance,
    swarm: true, wall: true, roomAnchor,
  });
  // The same seeded batch from two different pilot positions must land identically:
  // the room anchor, not the live pose, is what the wall's heavies commit to.
  const poses = [];
  for (const pilotPos of [{ x: 0, z: 0 }, { x: 220, z: 300 }]) {
    const h = room({ origin: pilotPos });
    const receipt = materializeWaveBatch(h.ctx, request({ x: 0, z: 0 }));
    assert.equal(receipt.admitted, 2, 'both wall heavies land');
    poses.push(h.state.entities.get(receipt.spawnedIds[0]).pos);
  }
  assert.deepEqual(poses[0], poses[1], 'same seed, same room, same arrivals');
});
