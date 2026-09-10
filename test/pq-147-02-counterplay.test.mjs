// PQ-147.02 — Counterplay. Each of the five powers has one deterministic escape.
// Done-when: each field has one named verb; a trapped body becomes free after that verb.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import {
  fieldContainsPoint,
  integrateFieldEscape,
  normalizeField,
} from '../src/core/fields/fieldKernel.js';
import { PINNED_STATUS_ID, UNMOORED_STATUS_ID } from '../src/data/combatDefs.js';
import {
  FIELD_DEFS,
  FIELD_ESCAPES,
  FIELD_ESCAPE_BOOST_ACCEL,
  FIELD_FLAGS,
  POWER_ROSTER,
  fieldEscapeOf,
} from '../src/data/fields.js';
import { actions } from '../src/systems/actions.js';
import { fields, fieldBodyProfile } from '../src/systems/fields.js';

const SEED = 14702;
const BOOST = FIELD_ESCAPE_BOOST_ACCEL;
const DT = SIM_DT;
const HITCH = { mass: 28, type: 'ship', team: 0, fieldResponseMult: 1, id: 1 };

function withFlag(on, fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = on;
  let result;
  try {
    result = fn();
  } catch (err) {
    FIELD_FLAGS.enabled = prev;
    throw err;
  }
  if (result && typeof result.then === 'function') {
    return result.finally(() => { FIELD_FLAGS.enabled = prev; });
  }
  FIELD_FLAGS.enabled = prev;
  return result;
}

function printEscape(id, verb, timeS) {
  const line = `PQ-147.02 ${id} ${verb} ${Number(timeS).toFixed(2)}s`;
  console.log(line);
  return line;
}

function wellField(extra = {}) {
  const d = FIELD_DEFS.well;
  return normalizeField({
    id: 'escape_well', kind: d.kind, center: { x: 0, z: 0 }, radius: d.radius,
    strength: d.strength, damping: d.damping, falloff: d.falloff, createdAt: 0, durationS: Infinity, ...extra,
  });
}

function coneField() {
  const d = FIELD_DEFS.cone;
  return normalizeField({
    id: 'escape_cone', kind: d.kind, center: { x: 0, z: 0 }, dir: { x: 1, z: 0 },
    radius: d.radius, strength: d.strength, falloff: d.falloff,
    halfAngleRad: d.halfAngleRad, edgeSoftRad: d.edgeSoftRad, createdAt: 0, durationS: Infinity,
  });
}

function skimField() {
  const d = FIELD_DEFS.skim;
  return normalizeField({
    id: 'escape_skim', kind: d.kind, center: { x: 0, z: 0 }, dir: { x: 1, z: 0 },
    radius: d.radius, halfWidth: d.halfWidth, strength: d.strength, falloff: d.falloff,
    createdAt: 0, durationS: Infinity,
  });
}

function boot(seed = SEED) {
  const sim = createSimulation({ seed, bus: createBus(), systems: [fields] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  return { sim, state, player, fieldsSys: sim.registry.get('fields') };
}

function shipSpec(id, x, z, mass, inertiaY) {
  return {
    id, type: 'ship', alive: true, team: id === 1 ? 0 : 1, collides: true, radius: 10, mass,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200,
    shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, cap: 100, capMax: 100, flags: {},
    physicsBody: { schemaVersion: 1, radius: 10, mass, inertiaY, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  };
}

test('each of the five powers names one escape verb', () => {
  for (const row of POWER_ROSTER) {
    const escape = fieldEscapeOf(row.id);
    assert.ok(escape, `${row.id} must name an escape`);
    assert.equal(FIELD_ESCAPES[row.id].verb, escape.verb);
  }
  assert.equal(fieldEscapeOf('well').verb, 'boost_out');
  assert.equal(fieldEscapeOf('repulsor').verb, 'cut_emitter');
  assert.equal(fieldEscapeOf('cone').verb, 'sidestep');
  assert.equal(fieldEscapeOf('skim').verb, 'out_mass');
  assert.equal(fieldEscapeOf('seed').verb, 'cut_hitch');
});

test('WELL Boost out leaves the ring; without boost it does not', () => {
  const field = wellField();
  const start = { x: 50, z: 0 };
  assert.equal(fieldContainsPoint(field, start.x, start.z), true);
  const trapped = integrateFieldEscape(start, { x: 0, z: 0 }, [field], HITCH, {
    extraAccel: { x: 0, z: 0 }, maxTimeS: 4,
  });
  assert.equal(trapped.free, false, 'without boost the well keeps the Hitch');
  const freed = integrateFieldEscape(start, { x: 0, z: 0 }, [field], { ...HITCH, boosting: true }, {
    extraAccel: { x: BOOST, z: 0 }, maxTimeS: 6,
  });
  assert.equal(freed.free, true);
  printEscape('well', FIELD_ESCAPES.well.verb, freed.timeS);
});

test('REPULSOR Cut the emitter unregisters the plow the same tick', () => {
  withFlag(true, () => {
    const t = boot(SEED + 1);
    t.player.pos.x = 20;
    const planted = t.fieldsSys.plantField(t.state, { defKey: 'repulsor', center: { x: 0, z: 0 }, tag: 'npc' });
    assert.ok(planted && planted.emitterId);
    const emitter = t.state.entities.get(planted.emitterId);
    assert.ok(fieldContainsPoint(t.fieldsSys._kernel.get(planted.fieldId), t.player.pos.x, t.player.pos.z));
    emitter.alive = false;
    t.sim.step();
    assert.equal(t.fieldsSys._kernel.has(planted.fieldId), false);
    printEscape('repulsor', FIELD_ESCAPES.repulsor.verb, DT);
  });
});

test('CONE Sidestep leaves the wedge; without a strafe it does not', () => {
  const field = coneField();
  const start = { x: 50, z: 22 };
  assert.equal(fieldContainsPoint(field, start.x, start.z), true);
  const trapped = integrateFieldEscape(start, { x: 0, z: 0 }, [field], HITCH, {
    extraAccel: { x: 0, z: 0 }, maxTimeS: 2,
  });
  assert.equal(trapped.free, false);
  const freed = integrateFieldEscape(start, { x: 0, z: 0 }, [field], HITCH, {
    extraAccel: { x: 0, z: 90 }, maxTimeS: 4,
  });
  assert.equal(freed.free, true);
  printEscape('cone', FIELD_ESCAPES.cone.verb, freed.timeS);
});

test('SKIM Out-mass shrugs the sheet; a light hull stays glued', () => {
  const field = skimField();
  const start = { x: 90, z: 28 };
  const outVel = { x: 0, z: 12 };
  assert.equal(fieldContainsPoint(field, start.x, start.z), true);
  const trapped = integrateFieldEscape(start, outVel, [field], { ...HITCH, mass: 16 }, {
    extraAccel: { x: 0, z: 0 }, maxTimeS: 3,
  });
  assert.equal(trapped.free, false, 'a light hull stays glued to the sheet');
  const freed = integrateFieldEscape(start, outVel, [field], { ...HITCH, mass: 216 }, {
    extraAccel: { x: 0, z: 0 }, maxTimeS: 4,
  });
  assert.equal(freed.free, true);
  printEscape('skim', FIELD_ESCAPES.skim.verb, freed.timeS);
});

test('SEED Cut the hitch frees the lock-ring; boost cannot', () => {
  withFlag(true, () => {
    const t = boot(SEED + 4);
    t.player.pos.x = 16;
    const planted = t.fieldsSys.plantField(t.state, { defKey: 'seed', center: { x: 0, z: 0 }, tag: 'npc' });
    t.fieldsSys.latchFieldHitch(t.state, t.player.id, planted.fieldId);
    t.sim.step();
    const field = t.fieldsSys._kernel.get(planted.fieldId);
    const locked = fieldBodyProfile(t.player, t.state);
    assert.equal(String(locked.hitchedTo), String(planted.emitterId));
    const stillHeld = integrateFieldEscape(
      { x: t.player.pos.x, z: t.player.pos.z }, { x: 0, z: 0 }, [field], locked,
      { extraAccel: { x: BOOST, z: 0 }, maxTimeS: 3 },
    );
    assert.equal(stillHeld.free, false, 'boost cannot beat the hitch lock');
    const cutAt = t.state.simTime;
    assert.equal(t.fieldsSys.cutFieldHitch(t.state, t.player.id), true);
    const freed = integrateFieldEscape(
      { x: t.player.pos.x, z: t.player.pos.z }, { x: 0, z: 0 }, [field], fieldBodyProfile(t.player, t.state),
      { extraAccel: { x: BOOST, z: 0 }, maxTimeS: 4 },
    );
    assert.equal(freed.free, true);
    printEscape('seed', FIELD_ESCAPES.seed.verb, (t.state.simTime - cutAt) + freed.timeS);
  });
});

test('newer opposite-polarity field cancels a live pin while still inside the Well', async () => {
  await withFlag(true, async () => {
    const sim = createSimulation({
      seed: SEED,
      bus: createBus(),
      systems: [actions, fields, physics],
    });
    const { state } = sim;
    state.mode = 'flight';
    state.input.actions = {};
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const player = sim.spawn(shipSpec(1, 0, 0, 28, 88));
    const target = sim.spawn(shipSpec(2, 80, 0, 40, 160));
    state.playerId = player.id;
    const physicsSystem = sim.registry.get('physics');
    assert.equal(await physicsSystem.prepareBackend(state), true);
    try {
      state.input.aimWorld = { x: 100, z: 0 };
      state.input.actions.deployWell = true;
      sim.step();
      sim.step();
      const pinned = state.combat.entities[String(target.id)];
      assert.ok(pinned.statuses[PINNED_STATUS_ID], 'the Well pins before the counter');
      assert.ok(Math.abs(readPhysicsTelemetry(target).mass - 240) < 1e-4);
      assert.equal(state.entities.get(player.id).type, 'ship', 'Well emitter must not steal the player id');
      assert.equal(state.entities.get(target.id).type, 'ship', 'Well emitter must not steal the target id');

      state.fields.cooldowns.repulsor = 0;
      state.input.actions.deployRepulsor = true;
      sim.step();
      sim.step();
      const freed = state.combat.entities[String(target.id)];
      assert.equal(state.entities.get(player.id).type, 'ship');
      assert.equal(state.entities.get(target.id).type, 'ship');
      assert.equal(freed.statuses[PINNED_STATUS_ID], undefined, 'newer Repulsor removes Pinned even inside the Well');
      assert.ok(freed.statuses[UNMOORED_STATUS_ID]);
      assert.equal(state.combat.entities[String(player.id)].statuses[UNMOORED_STATUS_ID], undefined);
      assert.ok(Math.abs(readPhysicsTelemetry(target).mass - 12) < 1e-4);
      printEscape('well+repulsor', 'polarity_cancel', 2 * DT);
    } finally {
      if (typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
        physicsSystem._disableSg02DynamicAuthority();
      }
    }
  });
});
