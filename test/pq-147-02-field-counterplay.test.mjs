// PQ-147.02 — Field counterplay. Each of the five powers has one named escape.
// Start trapped or overlapped, apply the verb, assert free (outside volume or emitter gone).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { physics } from '../src/core/physics.js';
import { fields, fieldBodyProfile } from '../src/systems/fields.js';
import {
  createFieldKernel,
  fieldContainsPoint,
  integrateFieldEscape,
  normalizeField,
} from '../src/core/fields/fieldKernel.js';
import {
  FIELD_DEFS,
  FIELD_ESCAPES,
  FIELD_ESCAPE_BOOST_ACCEL,
  FIELD_FLAGS,
  FIELD_KINDS,
  POWER_ROSTER,
  fieldEscapeOf,
} from '../src/data/fields.js';

const SEED = 14702;
const BOOST = FIELD_ESCAPE_BOOST_ACCEL;
const DT = SIM_DT;

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

function boot(seed = SEED, opts = {}) {
  const sim = createSimulation({
    seed,
    bus: createBus(),
    systems: opts.withPhysics ? [fields, physics] : [fields],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const mass = Number.isFinite(opts.mass) ? opts.mass : 28;
  const pos = opts.pos || { x: 0, z: 0 };
  const vel = opts.vel || { x: 0, z: 0 };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: pos.x, z: pos.z }, radius: 12, collides: true,
    vel: { x: vel.x, z: vel.z }, rot: 0, angVel: 0,
    hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship', hitchMass: opts.hitchMass || 0 },
  });
  state.playerId = player.id;
  return { sim, state, player, fieldsSys: sim.registry.get('fields'), physicsSys: sim.registry.get('physics') };
}

async function bootPhysics(seed = SEED, opts = {}) {
  const t = boot(seed, { ...opts, withPhysics: true });
  t.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await t.physicsSys.prepareBackend(t.state), true, 'rapier-dynamic should initialize headless');
  t.cleanup = () => {
    if (typeof t.physicsSys._disableSg02DynamicAuthority === 'function') {
      t.physicsSys._disableSg02DynamicAuthority();
    }
  };
  return t;
}

function queueEscapeAccel(entity, ax, az) {
  const mass = Number.isFinite(entity && entity.physicsBody && entity.physicsBody.mass)
    ? entity.physicsBody.mass
    : 1;
  queuePhysicsImpulse(entity, { x: ax * mass * DT, y: 0, z: az * mass * DT });
}

function liveInside(t, fieldId) {
  const field = t.fieldsSys._kernel.get(fieldId);
  return !!(field && fieldContainsPoint(field, t.player.pos.x, t.player.pos.z));
}

function stepUntilFree(t, fieldId, opts = {}) {
  const maxTimeS = Number.isFinite(opts.maxTimeS) ? opts.maxTimeS : 6;
  const extra = opts.extraAccel || null;
  const maxTicks = Math.max(1, Math.ceil(maxTimeS / DT));
  for (let i = 1; i <= maxTicks; i++) {
    if (extra) queueEscapeAccel(t.player, extra.x, extra.z);
    t.sim.step();
    if (!liveInside(t, fieldId)) {
      return { free: true, timeS: i * DT, ticks: i };
    }
  }
  return { free: false, timeS: maxTicks * DT, ticks: maxTicks };
}

function printEscape(id, verb, timeS) {
  const line = `PQ-147.02 ${id} ${verb} ${timeS.toFixed(2)}s`;
  console.log(line);
  return line;
}

function wellField(extra = {}) {
  const d = FIELD_DEFS.well;
  return normalizeField({
    id: 'escape_well',
    kind: d.kind,
    center: { x: 0, z: 0 },
    radius: d.radius,
    strength: d.strength,
    damping: d.damping,
    falloff: d.falloff,
    createdAt: 0,
    durationS: Infinity,
    ...extra,
  });
}

function coneField(extra = {}) {
  const d = FIELD_DEFS.cone;
  return normalizeField({
    id: 'escape_cone',
    kind: d.kind,
    center: { x: 0, z: 0 },
    dir: { x: 1, z: 0 },
    radius: d.radius,
    strength: d.strength,
    falloff: d.falloff,
    halfAngleRad: d.halfAngleRad,
    edgeSoftRad: d.edgeSoftRad,
    createdAt: 0,
    durationS: Infinity,
    ...extra,
  });
}

function skimField(extra = {}) {
  const d = FIELD_DEFS.skim;
  return normalizeField({
    id: 'escape_skim',
    kind: d.kind,
    center: { x: 0, z: 0 },
    dir: { x: 1, z: 0 },
    radius: d.radius,
    halfWidth: d.halfWidth,
    strength: d.strength,
    falloff: d.falloff,
    createdAt: 0,
    durationS: Infinity,
    ...extra,
  });
}

function seedField(sourceId = 'seed_emitter', extra = {}) {
  const d = FIELD_DEFS.seed;
  return normalizeField({
    id: 'escape_seed',
    kind: d.kind,
    center: { x: 0, z: 0 },
    radius: d.radius,
    strength: 0,
    damping: 0,
    falloff: d.falloff,
    lockStrength: d.lockStrength,
    sourceId,
    createdAt: 0,
    durationS: Infinity,
    ...extra,
  });
}

const HITCH = { mass: 28, type: 'ship', team: 0, fieldResponseMult: 1, id: 1 };

test('each of the five powers names one escape verb', () => {
  for (const row of POWER_ROSTER) {
    const escape = fieldEscapeOf(row.id);
    assert.ok(escape, `${row.id} must name an escape`);
    assert.equal(escape.id, row.id);
    assert.ok(escape.verb && escape.name, `${row.id} escape must have verb + name`);
    assert.equal(FIELD_ESCAPES[row.id].verb, escape.verb);
  }
  assert.equal(fieldEscapeOf('well').name, 'Boost out');
  assert.equal(fieldEscapeOf('repulsor').name, 'Cut the emitter');
  assert.equal(fieldEscapeOf('cone').name, 'Sidestep');
  assert.equal(fieldEscapeOf('skim').name, 'Out-mass');
  assert.equal(fieldEscapeOf('seed').name, 'Cut the hitch');
});

test('WELL escape is Boost out — player leaves the ring', () => {
  const field = wellField();
  const start = { x: 50, z: 0 };
  assert.equal(fieldContainsPoint(field, start.x, start.z), true, 'start trapped in the well');
  const trapped = integrateFieldEscape(start, { x: 0, z: 0 }, [field], HITCH, {
    extraAccel: { x: 0, z: 0 },
    maxTimeS: 4,
  });
  assert.equal(trapped.free, false, 'without boost the well keeps the Hitch');
  const boosting = { ...HITCH, boosting: true };
  const freed = integrateFieldEscape(start, { x: 0, z: 0 }, [field], boosting, {
    extraAccel: { x: BOOST, z: 0 },
    maxTimeS: 6,
  });
  assert.equal(freed.free, true, 'Boost out must leave the ring');
  assert.ok(!fieldContainsPoint(field, freed.pos.x, freed.pos.z));
  printEscape('well', FIELD_ESCAPES.well.verb, freed.timeS);
});

test('REPULSOR escape is Cut the emitter — field gone the same tick', () => {
  withFlag(true, () => {
    const t = boot(SEED + 1);
    t.player.pos.x = 20;
    t.player.pos.z = 0;
    const planted = t.fieldsSys.plantField(t.state, {
      defKey: 'repulsor',
      center: { x: 0, z: 0 },
      tag: 'npc',
    });
    assert.ok(planted && planted.emitterId, 'hostile plow has a shootable emitter');
    const emitter = t.state.entities.get(planted.emitterId);
    assert.ok(emitter && emitter.alive);
    assert.equal(t.fieldsSys._kernel.has(planted.fieldId), true);
    assert.ok(fieldContainsPoint(t.fieldsSys._kernel.get(planted.fieldId), t.player.pos.x, t.player.pos.z),
      'start overlapped with the plow');
    emitter.alive = false;
    t.sim.step();
    const timeS = DT;
    assert.equal(t.fieldsSys._kernel.has(planted.fieldId), false, 'cut emitter unregisters the same tick');
    assert.equal(emitter.alive, false);
    printEscape('repulsor', FIELD_ESCAPES.repulsor.verb, timeS);
  });
});

test('CONE escape is Sidestep — player leaves the wedge', () => {
  const field = coneField();
  const start = { x: 50, z: 22 };
  assert.equal(fieldContainsPoint(field, start.x, start.z), true, 'start overlapped in the wedge');
  const trapped = integrateFieldEscape(start, { x: 0, z: 0 }, [field], HITCH, {
    extraAccel: { x: 0, z: 0 },
    maxTimeS: 2,
  });
  assert.equal(trapped.free, false, 'without a sidestep the sluice keeps you in the lane');
  const freed = integrateFieldEscape(start, { x: 0, z: 0 }, [field], HITCH, {
    extraAccel: { x: 0, z: 90 },
    maxTimeS: 4,
  });
  assert.equal(freed.free, true, 'Sidestep must leave the wedge');
  assert.ok(!fieldContainsPoint(field, freed.pos.x, freed.pos.z));
  printEscape('cone', FIELD_ESCAPES.cone.verb, freed.timeS);
});

test('SKIM escape is Out-mass — Hitch-mass body leaves the sheet', () => {
  const field = skimField();
  const start = { x: 90, z: 28 };
  const outVel = { x: 0, z: 12 };
  assert.equal(fieldContainsPoint(field, start.x, start.z), true, 'start overlapped on the scoop');
  const light = { ...HITCH, mass: 16 };
  const trapped = integrateFieldEscape(start, outVel, [field], light, {
    extraAccel: { x: 0, z: 0 },
    maxTimeS: 3,
  });
  assert.equal(trapped.free, false, 'a light hull stays glued to the sheet');
  const heavy = { ...HITCH, mass: 16 + 200 };
  const freed = integrateFieldEscape(start, outVel, [field], heavy, {
    extraAccel: { x: 0, z: 0 },
    maxTimeS: 4,
  });
  assert.equal(freed.free, true, 'Out-mass must shrug the scoop and leave');
  assert.ok(!fieldContainsPoint(field, freed.pos.x, freed.pos.z));
  printEscape('skim', FIELD_ESCAPES.skim.verb, freed.timeS);
});

test('SEED escape is Cut the hitch — Hitch-mass body is free', () => {
  withFlag(true, () => {
    const t = boot(SEED + 4);
    t.player.pos.x = 16;
    t.player.pos.z = 0;
    const planted = t.fieldsSys.plantField(t.state, {
      defKey: 'seed',
      center: { x: 0, z: 0 },
      tag: 'npc',
    });
    assert.ok(planted && planted.emitterId);
    t.fieldsSys.latchFieldHitch(t.state, t.player.id, planted.fieldId);
    t.sim.step();
    const field = t.fieldsSys._kernel.get(planted.fieldId);
    assert.ok(fieldContainsPoint(field, t.player.pos.x, t.player.pos.z), 'start locked in the ring');
    const lockedProfile = fieldBodyProfile(t.player, t.state);
    assert.equal(String(lockedProfile.hitchedTo), String(planted.emitterId));
    const stillHeld = integrateFieldEscape(
      { x: t.player.pos.x, z: t.player.pos.z },
      { x: 0, z: 0 },
      [field],
      lockedProfile,
      { extraAccel: { x: BOOST, z: 0 }, maxTimeS: 3 },
    );
    assert.equal(stillHeld.free, false, 'boost cannot beat the hitch lock');
    const cutAt = t.state.simTime;
    assert.equal(t.fieldsSys.cutFieldHitch(t.state, t.player.id), true);
    const freedProfile = fieldBodyProfile(t.player, t.state);
    assert.equal(freedProfile.hitchedTo, null);
    const freed = integrateFieldEscape(
      { x: t.player.pos.x, z: t.player.pos.z },
      { x: 0, z: 0 },
      [field],
      freedProfile,
      { extraAccel: { x: BOOST, z: 0 }, maxTimeS: 4 },
    );
    assert.equal(freed.free, true, 'Cut the hitch lets the Hitch leave the lock-ring');
    const timeS = (t.state.simTime - cutAt) + freed.timeS;
    printEscape('seed', FIELD_ESCAPES.seed.verb, timeS);
  });
});

test('out-mass hitchMass is visible on the live body profile', () => {
  const t = boot(SEED + 5);
  assert.equal(fieldBodyProfile(t.player, t.state).mass, 28);
  t.player.data.hitchMass = 200;
  assert.equal(fieldBodyProfile(t.player, t.state).mass, 228);
  t.player.flags.boosting = true;
  assert.equal(fieldBodyProfile(t.player, t.state).boosting, true);
});

test('planted hostile fields do not eat the player well cooldown', () => {
  withFlag(true, () => {
    const t = boot(SEED + 6);
    const planted = t.fieldsSys.plantField(t.state, { defKey: 'well', center: { x: 80, z: 0 } });
    const emitter = t.state.entities.get(planted.emitterId);
    emitter.alive = false;
    t.sim.step();
    assert.equal(t.state.fields.cooldowns.well, 0);
  });
});

test('kernel plant register preserves lockStrength for seed', () => {
  const k = createFieldKernel();
  const rec = k.register(seedField(9));
  assert.equal(rec.lockStrength, FIELD_DEFS.seed.lockStrength);
  assert.equal(rec.strength, 0);
  assert.equal(rec.kind, FIELD_KINDS.WELL);
});

test('WELL live body Boost out through a planted ring', async () => {
  await withFlag(true, async () => {
    const trapped = await bootPhysics(SEED + 10, { pos: { x: 50, z: 0 } });
    const plantedTrap = trapped.fieldsSys.plantField(trapped.state, {
      defKey: 'well',
      center: { x: 0, z: 0 },
      tag: 'npc',
    });
    assert.ok(plantedTrap && liveInside(trapped, plantedTrap.fieldId), 'start trapped in the live well');
    const held = stepUntilFree(trapped, plantedTrap.fieldId, { maxTimeS: 4 });
    assert.equal(held.free, false, 'without boost the live well keeps the Hitch');
    trapped.cleanup();

    const t = await bootPhysics(SEED + 11, { pos: { x: 50, z: 0 } });
    const planted = t.fieldsSys.plantField(t.state, {
      defKey: 'well',
      center: { x: 0, z: 0 },
      tag: 'npc',
    });
    t.player.flags.boosting = true;
    assert.equal(fieldBodyProfile(t.player, t.state).boosting, true);
    const freed = stepUntilFree(t, planted.fieldId, {
      extraAccel: { x: BOOST, z: 0 },
      maxTimeS: 6,
    });
    assert.equal(freed.free, true, 'Boost out must leave the live ring');
    printEscape('well', FIELD_ESCAPES.well.verb, freed.timeS);
    t.cleanup();
  });
});

test('CONE live body Sidestep through a planted wedge', async () => {
  await withFlag(true, async () => {
    const trapped = await bootPhysics(SEED + 12, { pos: { x: 50, z: 22 } });
    const plantedTrap = trapped.fieldsSys.plantField(trapped.state, {
      defKey: 'cone',
      center: { x: 0, z: 0 },
      dir: { x: 1, z: 0 },
      tag: 'npc',
    });
    assert.ok(liveInside(trapped, plantedTrap.fieldId), 'start overlapped in the live wedge');
    const held = stepUntilFree(trapped, plantedTrap.fieldId, { maxTimeS: 2 });
    assert.equal(held.free, false, 'without a sidestep the live sluice keeps you in the lane');
    trapped.cleanup();

    const t = await bootPhysics(SEED + 13, { pos: { x: 50, z: 22 } });
    const planted = t.fieldsSys.plantField(t.state, {
      defKey: 'cone',
      center: { x: 0, z: 0 },
      dir: { x: 1, z: 0 },
      tag: 'npc',
    });
    const freed = stepUntilFree(t, planted.fieldId, {
      extraAccel: { x: 0, z: 90 },
      maxTimeS: 4,
    });
    assert.equal(freed.free, true, 'Sidestep must leave the live wedge');
    printEscape('cone', FIELD_ESCAPES.cone.verb, freed.timeS);
    t.cleanup();
  });
});

test('SKIM live body Out-mass through a planted sheet', async () => {
  await withFlag(true, async () => {
    const light = await bootPhysics(SEED + 14, {
      pos: { x: 90, z: 28 },
      vel: { x: 0, z: 12 },
      mass: 16,
    });
    const plantedLight = light.fieldsSys.plantField(light.state, {
      defKey: 'skim',
      center: { x: 0, z: 0 },
      dir: { x: 1, z: 0 },
      tag: 'npc',
    });
    assert.ok(liveInside(light, plantedLight.fieldId), 'start overlapped on the live scoop');
    const held = stepUntilFree(light, plantedLight.fieldId, { maxTimeS: 3 });
    assert.equal(held.free, false, 'a light hull stays glued to the live sheet');
    light.cleanup();

    const heavy = await bootPhysics(SEED + 15, {
      pos: { x: 90, z: 28 },
      vel: { x: 0, z: 12 },
      mass: 16,
      hitchMass: 200,
    });
    const plantedHeavy = heavy.fieldsSys.plantField(heavy.state, {
      defKey: 'skim',
      center: { x: 0, z: 0 },
      dir: { x: 1, z: 0 },
      tag: 'npc',
    });
    assert.equal(fieldBodyProfile(heavy.player, heavy.state).mass, 216);
    const freed = stepUntilFree(heavy, plantedHeavy.fieldId, { maxTimeS: 4 });
    assert.equal(freed.free, true, 'Out-mass must shrug the live scoop and leave');
    printEscape('skim', FIELD_ESCAPES.skim.verb, freed.timeS);
    heavy.cleanup();
  });
});

test('SEED live body leaves the lock-ring after Cut the hitch', async () => {
  await withFlag(true, async () => {
    const t = await bootPhysics(SEED + 16, { pos: { x: 16, z: 0 } });
    const planted = t.fieldsSys.plantField(t.state, {
      defKey: 'seed',
      center: { x: 0, z: 0 },
      tag: 'npc',
    });
    t.fieldsSys.latchFieldHitch(t.state, t.player.id, planted.fieldId);
    t.sim.step();
    assert.ok(liveInside(t, planted.fieldId), 'start locked in the live ring');
    assert.equal(String(fieldBodyProfile(t.player, t.state).hitchedTo), String(planted.emitterId));
    t.player.flags.boosting = true;
    const stillHeld = stepUntilFree(t, planted.fieldId, {
      extraAccel: { x: BOOST, z: 0 },
      maxTimeS: 3,
    });
    assert.equal(stillHeld.free, false, 'boost cannot beat the live hitch lock');
    const cutAt = t.state.simTime;
    assert.equal(t.fieldsSys.cutFieldHitch(t.state, t.player.id), true);
    assert.equal(fieldBodyProfile(t.player, t.state).hitchedTo, null);
    const freed = stepUntilFree(t, planted.fieldId, {
      extraAccel: { x: BOOST, z: 0 },
      maxTimeS: 4,
    });
    assert.equal(freed.free, true, 'Cut the hitch lets the live Hitch leave the lock-ring');
    printEscape('seed', FIELD_ESCAPES.seed.verb, (t.state.simTime - cutAt));
    t.cleanup();
  });
});
