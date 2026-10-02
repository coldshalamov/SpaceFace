// FB-120 — every champion wave stages a DISTINCT room, and the champion gates the clear.
//
// Six rooms, six lessons: the berm to throw the pack into, the bank that catches a wing, the
// wall between you and the brawlers, the room that holds you for the ghosts — and now the
// Foreman's mirrored lane (a cross-current sweeping the pass and a repulsor wall the committed
// run banks off) and the Regent's crown furnace (the centre shoves to the rim, a rim current
// racetracks you to the stern, and the face approach is salted). A living champion — not a
// kill count — is what keeps the round open.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import {
  ARENA_FIELD_SLOT_IDS,
  ARENA_MINE_MAX,
  planArenaInstall,
} from '../src/systems/survivalArena.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { bossRoomNote, SWARM_BOSS_ROTATION, SWARM_RULESET } from '../src/data/swarmMode.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';

function installFor(bossRoom, wave = 20) {
  const install = planArenaInstall({
    arenaPhase: 'boss', arenaId: ARENA, wave, seed: SEED,
    anchor: { x: 0, z: 0 }, laneGate: 'front', bossRoom,
  });
  assert.ok(install, `${bossRoom} installs`);
  return install;
}

test('six champion rooms, six distinct recipes — all inside the two-field budget', () => {
  const signatures = new Map();
  for (const boss of SWARM_BOSS_ROTATION) {
    const install = installFor(boss.room);
    assert.ok(install.fields.length <= ARENA_FIELD_SLOT_IDS.length,
      `${boss.room} stays inside the field budget`);
    assert.ok(install.mines.length <= ARENA_MINE_MAX);
    assert.ok(typeof bossRoomNote(boss.room) === 'string' && bossRoomNote(boss.room),
      `${boss.room} carries a real room note`);
    const sig = JSON.stringify({
      kinds: install.fields.map((f) => f.kind),
      mines: install.mines.length,
      cover: install.cover === true,
    });
    assert.ok(!signatures.has(sig), `${boss.room} is not a re-skin of ${signatures.get(sig)}`);
    signatures.set(sig, boss.room);
  }
  assert.equal(signatures.size, SWARM_BOSS_ROTATION.length, 'every room is a different recipe');
});

test('mirror_lane is the Foreman lesson in geometry — cross-current plus the mirror wall', () => {
  const install = installFor('mirror_lane');
  assert.equal(install.fields.length, 2);
  const [cone, mirror] = install.fields;
  assert.equal(cone.kind, 'cone', 'the pass lane is swept by a directed current');
  assert.equal(mirror.kind, 'repulsor', 'the pass banks off a wall at the lane\'s end');
  assert.equal(install.cover, true, 'a plate mid-room breaks the prow\'s head-on line');
  assert.equal(install.mines.length, 0, 'the lane is a current room, not a mined one');
  // The cone's push runs ACROSS the arrival lane — its centre sits on the lane bearing, so a
  // dir perpendicular to that centre vector is a current that sweeps the pass sideways.
  const cLen = Math.hypot(cone.center.x, cone.center.z);
  const laneDot = (cone.dir.x * cone.center.x + cone.dir.z * cone.center.z) / cLen;
  assert.ok(Math.abs(laneDot) < 0.01, 'the current sweeps across the lane, not along it');
  // The mirror wall sits further out along the lane than the current's centre.
  const mirrorDist = Math.hypot(mirror.center.x, mirror.center.z);
  assert.ok(mirrorDist > cLen, 'the pass runs the lane and banks off the far wall');
});

test('crown_furnace is the Regent lesson — the middle shoves, the rim carries you, the face is salted', () => {
  const install = installFor('crown_furnace', 30);
  assert.equal(install.fields.length, 2);
  const [furnace, racetrack] = install.fields;
  assert.equal(furnace.kind, 'repulsor');
  assert.ok(Math.hypot(furnace.center.x, furnace.center.z) < 1,
    'the furnace is the room\'s own centre — nobody camps the crown\'s face');
  assert.equal(racetrack.kind, 'cone', 'a rim current carries an orbiting fighter around');
  assert.equal(install.mines.length, ARENA_MINE_MAX,
    'the gate-facing approach inside the furnace is mined — the face costs, the rim is free');
  assert.equal(install.cover, false, 'the furnace room is fields, not rocks');
  // The mine arc straddles the arrival bearing — the `front` lane bearing is (0,-1), so the
  // salt is a straight rank on the room's near face: every mine sits ~190 WU out the gate.
  const faceSide = install.mines.every((m) => m.z < -120 && m.z > -260);
  assert.ok(faceSide, 'the salt sits on the face approach, not the rim');
  const xs = install.mines.map((m) => m.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 100, 'the rank covers the approach, not a point');
});

test('the room recipes are deterministic — same seed, same room, byte for byte', () => {
  for (const boss of SWARM_BOSS_ROTATION) {
    assert.deepEqual(installFor(boss.room, 40), installFor(boss.room, 40), boss.room);
  }
});

// ---- the clear is owed to the champion, not the body count -------------------

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
  const helpers = {
    spawnBudget: budget,
    routeCombatDamage(packet) { return packet; },
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec, id, alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  // The kill loop frees budget slots exactly the way the shipped sweep does.
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  state.run.arenaId = ARENA;
  state.run.phase = 'active';
  state.run.wave = wave;
  const ctx = { state, bus, helpers };
  survivalWave.init(ctx);
  const capSys = createProductionCapitalBossEncounters();
  capSys.init(ctx);
  return { state, bus, emitted, capSys };
}

function liveCohort(h) {
  const out = [];
  for (const e of h.state.entities.values()) {
    if (e.id === h.state.playerId || e.alive === false) continue;
    if (e.data && e.data.runCohort === SURVIVAL_COHORT_TAG) out.push(e);
  }
  return out;
}
function kill(h, entity) {
  entity.alive = false;
  entity.hull = 0;
  h.state.entities.delete(entity.id);
  h.bus.emit('entity:killed', { id: entity.id });
  h.bus.emit('entity:destroyed', { id: entity.id });
}

test('the wave never clears over a living champion — chaff quota is not the boss', () => {
  const h = boot(20);
  h.bus.emit('run:wavePlanned', {
    wave: 20,
    plan: planWave({ seed: SEED, arenaId: ARENA, wave: 20, ruleset: SWARM_RULESET }),
  });
  h.bus.emit('run:waveStarted', { wave: 20 });
  const cleared = () => named(h, 'run:waveCleared').length > 0;

  const isChampion = (e) => e.data && e.data.missionTag === 'capital_boss';
  const step = () => {
    h.state.tick += 1;
    h.state.simTime += DT;
    survivalWave.update(DT);
    h.capSys.update(DT);
  };
  // Feed the stream its whole quota while the Foreman stays alive: kill everything but it,
  // every tick, until nothing but the champion is left standing on the field.
  let guard = 0;
  while (guard++ < 6000 && !cleared()) {
    for (const e of liveCohort(h)) if (!isChampion(e)) kill(h, e);
    step();
    const standing = liveCohort(h);
    if (survivalWave._pending.length === 0
      && survivalWave._admittedTotal >= survivalWave._plannedBodies
      && standing.length === 1 && isChampion(standing[0])) break;
  }
  const boss = liveCohort(h).find(isChampion);
  assert.ok(boss, 'the champion is the only body left on the field');
  assert.ok(!cleared(), 'quota drained and every chaff body dead — the living Foreman still holds the wave open');

  kill(h, boss);
  let settle = 0;
  while (settle++ < 240 && !cleared()) {
    for (const e of liveCohort(h)) if (!isChampion(e)) kill(h, e);
    step();
  }
  assert.ok(cleared(), 'the round clears once the champion resolves');
  assert.equal(h.state.capitalBossEncounters.fights['swarm:w20'].terminal, 'victory',
    'the score records the kill as its ending, not a disappearance');
});

function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}
