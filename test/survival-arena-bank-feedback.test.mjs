// PQ-133.04 R3 — bank feedback is kernel-produced now. The survival room no longer reflects
// shots off plates and no longer emits `combat:bankShot`: plate acceptance lives in the combat
// kernel (compiled AttackSpec runtime + physics-issued surface receipt -> resolveRicochet).
// These tests pin the seam that replaced the room-side solver, on the SAME authored plates the
// old acceptance used (Cryo's ice plates) plus the Foundry room solids. No skipped acceptance:
// every old reflection/feedback assertion is restated against the kernel or inverted fail-closed.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { createLineage } from '../src/combat/attackLineage.js';
import { resolveRicochet } from '../src/combat/surfaceReflection.js';
import {
  isSurfaceContactReceipt,
  surfaceContactFromBodies,
  surfaceResponseFor,
} from '../src/core/surfaceContact.js';
import { bankShotOffPlate } from '../src/data/arenaModuleLibrary.js';
import { CRYO_ARENA_ID } from '../src/systems/cryoDriftArena.js';
import { planArenaInstall, survivalArena } from '../src/systems/survivalArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const SEED = 7;
const ANCHOR = { x: 400, z: -120 };

function boot(t, arenaId, { withHelpers = false } = {}) {
  const state = createGameState(SEED);
  state.simTime = 0;
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
  const helpers = withHelpers
    ? {
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
        return entity;
      },
    }
    : {};
  const player = {
    id: state.nextEntityId++,
    alive: true,
    type: 'ship',
    team: 0,
    pos: { ...ANCHOR },
    vel: { x: 0, z: 0 },
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const registry = { get: () => null };
  const system = Object.create(survivalArena);
  system.init({ state, bus, registry, helpers });
  t.after(() => system.destroy());
  const run = createRunState({ kind: 'survival', ruleset: 'scored', seed: SEED });
  run.arenaId = arenaId;
  run.phase = 'active';
  run.wave = 1;
  state.run = run;
  const plan = planWave({ seed: SEED, arenaId, wave: 1 });
  assert.notEqual(plan.ok, false, `${arenaId} wave 1 must plan`);
  bus.emit('run:wavePlanned', { wave: 1, plan, tick: 0 });
  const expected = planArenaInstall({
    arenaPhase: plan.arenaPhase,
    arenaId,
    wave: 1,
    seed: SEED,
    anchor: ANCHOR,
  });
  return {
    state, bus, emitted, system, expected,
    plates: expected.toys.filter((toy) => toy.kind === 'plate'),
    banks: () => emitted.filter(({ event }) => event === 'combat:bankShot').map(({ payload }) => payload),
    tick() {
      system.update(1 / 60, state);
      state.tick++;
      state.simTime = state.tick / 60;
    },
  };
}

function compiledBankSpec() {
  const result = compileAttackSpec({
    weaponId: 'wpn_pulse_laser_s',
    modifiers: [['mod_bank_shot', 1]],
  });
  assert.equal(result.ok, true);
  return result.spec;
}

test('the authored Cryo plates publish no room-side bank feedback, and the room writes no shot', (t) => {
  const h = boot(t, CRYO_ARENA_ID);
  assert.ok(h.plates.length >= 2, 'the authored Cryo plates are still installed');
  const shot = {
    id: 10, type: 'projectile', alive: true, radius: 0.7,
    pos: { x: h.plates[0].pos.x + h.plates[0].normal.x * 12, z: h.plates[0].pos.z + h.plates[0].normal.z * 12 },
    vel: { x: -h.plates[0].normal.x * 120, z: -h.plates[0].normal.z * 120 },
    data: {},
  };
  h.state.entities.set(shot.id, shot);
  const velBefore = { ...shot.vel };
  for (let i = 0; i < 10; i++) h.tick();
  assert.deepEqual(h.banks(), [], 'combat:bankShot has no emitter left in the room');
  assert.deepEqual(shot.vel, velBefore, 'the room must not write a projectile velocity');
  assert.equal(shot.alive, true, 'the room must not kill shots off the plates');
});

test('the same installed Cryo plates bank through the kernel: receipt, reflection, same body', (t) => {
  const h = boot(t, CRYO_ARENA_ID);
  const plate = h.plates[0];
  const spec = compiledBankSpec();
  const pos = {
    x: plate.pos.x + plate.normal.x * 12,
    z: plate.pos.z + plate.normal.z * 12,
  };
  const vel = { x: -plate.normal.x * 120, z: -plate.normal.z * 120 };
  const runtime = createLineage({ spec });
  const body = { id: 'bolt', type: 'projectile', alive: true, radius: 0.7, pos: { ...pos }, vel: { ...vel } };
  const geometry = bankShotOffPlate(plate, {
    id: body.id, type: 'projectile', spec, runtime, pos: { ...pos }, vel: { ...vel },
  });
  assert.equal(geometry.ok, true, 'the authored plate accepts an eligible runtime');
  assert.equal(geometry.vel, undefined, 'geometry only: no velocity leaves the helper');
  assert.equal(geometry.receipt, undefined, 'geometry only: no receipt leaves the helper');

  const surface = {
    id: plate.id, pos: { ...plate.pos }, vel: { x: 0, z: 0 }, angVel: 0, surfaceMaterial: 'plate',
  };
  const receipt = surfaceContactFromBodies(body, surface, {
    point: geometry.point, normal: geometry.normal, material: 'plate', velocity: vel,
  }, 0);
  assert.ok(isSurfaceContactReceipt(receipt), 'the bank rides a physics-issued receipt');
  const result = resolveRicochet(runtime, spec, receipt, body);
  assert.equal(result.ok, true, 'the kernel banks the accepted contact');
  assert.equal(result.consume, false, 'the same body continues');
  // Head-on into the face reflects straight back. The kernel quantizes the contact normal to
  // 1e-6, so an off-axis plate drifts ~1e-4 — compare with tolerance, not deepEqual.
  const normalComponent = result.velocity.x * plate.normal.x + result.velocity.z * plate.normal.z;
  assert.ok(normalComponent > 0, `head-on bank must leave along +normal, got ${normalComponent}`);
  assert.ok(Math.abs(Math.hypot(result.velocity.x, result.velocity.z) - 120) < 1e-3,
    `head-on bank keeps speed, got ${Math.hypot(result.velocity.x, result.velocity.z)}`);
});

test('eligibility is absolute: a direct shot is refused with no_spec on every authored plate', (t) => {
  const h = boot(t, CRYO_ARENA_ID);
  for (const plate of h.plates) {
    const refused = bankShotOffPlate(plate, {
      id: 'plain-bolt', type: 'projectile',
      pos: { x: plate.pos.x + plate.normal.x * 12, z: plate.pos.z + plate.normal.z * 12 },
      vel: { x: -plate.normal.x * 120, z: -plate.normal.z * 120 },
    });
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'no_spec');
  }
});

test('Foundry room plates materialize as reflective solids and bank the same way', (t) => {
  const h = boot(t, 'helios_core', { withHelpers: true });
  assert.ok(h.plates.length >= 2, 'the Foundry idle room authors bank plates');
  const solids = h.state.entityList.filter((entity) => entity
    && entity.data && entity.data.roomKind === 'plate');
  assert.equal(solids.length, h.plates.length, 'every authored plate materialized');
  for (const solid of solids) {
    assert.equal(solid.type, 'station');
    assert.equal(surfaceResponseFor(solid.data.surfaceMaterial), 'reflect', 'a Foundry plate reflects');
  }
  const plate = h.plates[0];
  const spec = compiledBankSpec();
  const runtime = createLineage({ spec });
  const pos = { x: plate.pos.x + plate.normal.x * 30, z: plate.pos.z + plate.normal.z * 30 };
  const vel = { x: -plate.normal.x * 90, z: -plate.normal.z * 90 };
  const geometry = bankShotOffPlate(plate, {
    id: 'bolt', type: 'projectile', spec, runtime, pos, vel,
  });
  assert.equal(geometry.ok, true);
  const body = { id: 'bolt', type: 'projectile', alive: true, radius: 0.7, pos: { ...pos }, vel: { ...vel } };
  const surface = {
    id: plate.id, pos: { ...plate.pos }, vel: { x: 0, z: 0 }, angVel: 0, surfaceMaterial: 'plate',
  };
  const receipt = surfaceContactFromBodies(body, surface, {
    point: geometry.point, normal: geometry.normal, material: 'plate', velocity: vel,
  }, 0);
  const result = resolveRicochet(runtime, spec, receipt, body);
  assert.equal(result.ok, true);
  assert.equal(result.consume, false);
  assert.deepEqual(h.banks(), [], 'still no room-side feedback, even with a bankable shot in flight');
});
