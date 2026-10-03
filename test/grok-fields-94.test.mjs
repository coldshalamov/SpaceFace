// PB-ORD-B — SF-034 goo edge/recovery, SF-038 pin law, SF-039 overlap bend,
// SF-040 projectile bend provenance and mine breakout. Seed 4242.
// The read is published from the live field state. Force magnitudes stay authored.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS, FIELD_DEFS, FIELD_COUPLING } from '../src/data/fields.js';
import { sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { bombDef } from '../src/data/bombs.js';
import { FieldForcePresentation } from '../src/render/forceLanguage/fieldForcePresentation.js';

const SEED = 4242;

function withFields(fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    return fn();
  } finally {
    FIELD_FLAGS.enabled = prev;
  }
}

function boot() {
  const sim = createSimulation({ seed: SEED, bus: createBus(), systems: [fields] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 900, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0,
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, dynamic: true, material: 'ship' },
    data: {},
  });
  state.playerId = player.id;
  return { sim, state, player, sys: sim.registry.get('fields') };
}

function spawnBody(sim, spec) {
  return sim.spawn({
    alive: true,
    collides: true,
    vel: { x: spec.velX || 0, z: spec.velZ || 0 },
    rot: 0,
    radius: spec.radius || 6,
    team: spec.team != null ? spec.team : 1,
    type: spec.type,
    pos: { x: spec.x, z: spec.z },
    physicsBody: spec.physicsBody || {
      schemaVersion: 1,
      radius: spec.radius || 6,
      mass: spec.mass,
      dynamic: spec.dynamic !== false,
      material: 'ship',
    },
    data: spec.data || {},
    ownerId: spec.ownerId,
  });
}

function plant(sys, spec) {
  return sys._kernel.register({
    durationS: Infinity,
    damping: 0,
    falloff: 1,
    strength: 200,
    radius: 100,
    center: { x: 0, z: 0 },
    ...spec,
  });
}

function rowById(rows, id) {
  return (rows || []).find((row) => String(row.id) === String(id));
}

test('SF-034 tar edge is a slow band with a recovery exit, and two hulls are not frozen', () => {
  withFields(() => {
    assert.equal(bombDef('bomb_goo').field.dragPerS, 2.4);
    const t = boot();
    t.player.pos.x = 20;
    t.player.pos.z = 0;
    t.state.combat = t.state.combat || {};
    t.state.combat.entities = t.state.combat.entities || {};
    t.state.combat.entities[String(t.player.id)] = {
      statuses: { status_goo: { stacks: 2, expiresTick: 400 } },
    };
    const near = t.sim.spawn({
      type: 'bomb', alive: true, radius: 4, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      data: { bombId: 'bomb_goo', phase: 'field', fieldStartedAt: 0, ownerId: t.player.id, retired: false },
    });
    const far = t.sim.spawn({
      type: 'bomb', alive: true, radius: 4, pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 },
      data: { bombId: 'bomb_goo', phase: 'field', fieldStartedAt: 0, ownerId: 4, retired: false },
    });
    t.sim.step(1 / 60);
    const edge = t.state.fields.familyRead.edge;
    assert.equal(t.state.meta.seed, SEED);
    assert.equal(edge.active, true);
    assert.equal(edge.law, 'viscosity');
    assert.equal(edge.controlFrozen, false);
    const cloud = rowById(edge.clouds, near.id);
    const other = rowById(edge.clouds, far.id);
    assert.ok(cloud && other);
    assert.ok(cloud.centerDrag > cloud.edgeDrag && cloud.edgeDrag > 0, 'the rim brakes less than the middle');
    assert.equal(cloud.outsideDrag, 0);
    assert.ok(cloud.clearX > cloud.radius, 'the exit sits outside the tar');
    assert.equal(cloud.recoveryX > 0, true);
    assert.equal(cloud.overlap, 2);
    assert.equal(cloud.share, 0.5);
    assert.equal(cloud.stacks, 2);
    assert.equal(cloud.maxStacks, 3);
    assert.ok(cloud.movement > 0 && cloud.movement < 1, 'stacks shed thrust; they do not deaden input');
    assert.equal(cloud.shedding, true);
    assert.equal(cloud.controlFrozen, false);
    assert.ok(cloud.probeLight > 30 && cloud.probeLight < FIELD_FAMILY_READ_SPEED());
    assert.ok(Math.abs(cloud.probeLight - cloud.probeHeavy) < 1e-6, 'light and heavy keep the same recovery speed');
    assert.equal(other.share, 0.5);
    t.sim.dispose();
  });
});

function FIELD_FAMILY_READ_SPEED() {
  return 40;
}

test('SF-038 the pin law holds light cargo and a fighter, shrugs a heavy, and names refusals', () => {
  withFields(() => {
    assert.equal(FIELD_DEFS.well.strength, 240);
    const t = boot();
    const cargo = spawnBody(t.sim, { type: 'pickup', x: 40, z: 8, mass: 0.4, radius: 3 });
    const fighter = spawnBody(t.sim, { type: 'ship', x: 36, z: -12, mass: 12, radius: 8 });
    const heavy = spawnBody(t.sim, { type: 'ship', x: 48, z: 16, mass: 400, radius: 14 });
    const machine = spawnBody(t.sim, {
      type: 'ship', x: 52, z: -18, mass: 800, radius: 16, dynamic: false,
    });
    const primed = spawnBody(t.sim, { type: 'ship', x: 44, z: 24, mass: 12, radius: 8 });
    const source = spawnBody(t.sim, { type: 'ship', x: 30, z: 28, mass: 12, radius: 8 });
    t.sim.spawn({
      type: 'charge', alive: true, pos: { x: 44, z: 24 }, radius: 2,
      data: { armed: true, hostId: primed.id },
    });
    plant(t.sys, {
      id: 'pin_well', kind: 'well', radius: 180, strength: 200, falloff: 1,
      ownerId: source.id, sourceId: source.id, center: { x: 0, z: 0 },
    });
    const before = {
      cargo: { x: cargo.vel.x, z: cargo.vel.z },
      fighter: { x: fighter.vel.x, z: fighter.vel.z },
    };
    t.sim.step(1 / 60);
    const pin = t.state.fields.familyRead.pin;
    assert.equal(pin.law, 'mass_response');
    assert.equal(pin.massScale, 6);
    assert.equal(pin.storedImpulse, 0);
    assert.equal(pin.teleports, false);
    const cargoRow = rowById(pin.rows, cargo.id);
    const fighterRow = rowById(pin.rows, fighter.id);
    const heavyRow = rowById(pin.rows, heavy.id);
    const machineRow = rowById(pin.rows, machine.id);
    const primedRow = rowById(pin.rows, primed.id);
    const sourceRow = rowById(pin.rows, source.id);
    assert.equal(cargoRow.phase, 'held');
    assert.equal(cargoRow.anchor, 'full');
    assert.equal(fighterRow.phase, 'held');
    assert.equal(fighterRow.anchor, 'full');
    assert.equal(heavyRow.phase, 'held', 'a heavy is the same pin, not a second trap');
    assert.equal(heavyRow.anchor, 'shrug');
    assert.ok(heavyRow.couple <= FIELD_COUPLING.minShipCouple + 1e-9);
    assert.equal(machineRow.phase, 'ineligible');
    assert.equal(machineRow.reason, 'kinematic');
    assert.equal(primedRow.phase, 'ineligible');
    assert.equal(primedRow.reason, 'primed');
    assert.equal(sourceRow.phase, 'ineligible');
    assert.equal(sourceRow.reason, 'source_excluded');
    assert.equal(cargo.vel.x, before.cargo.x);
    assert.equal(fighter.vel.z, before.fighter.z);
    assert.equal(cargo.pos.x, 40);
    t.sys._kernel.unregister('pin_well');
    t.sim.step(1 / 60);
    const released = rowById(t.state.fields.familyRead.pin.rows, cargo.id);
    assert.equal(released.phase, 'released');
    assert.equal(released.reason, 'released');
    assert.equal(released.storedImpulse, 0);
    assert.equal(cargo.vel.x, before.cargo.x, 'release does not dump a stored impulse');
    assert.equal(cargo.pos.x, 40);
    t.sim.dispose();
  });
});

test('SF-039 equal fields publish an equilibrium, and dropping one leaves no stale counterforce', () => {
  withFields(() => {
    const t = boot();
    plant(t.sys, { id: 'bend_well', kind: 'well', ownerId: 1, sourceId: 1 });
    plant(t.sys, { id: 'bend_repulsor', kind: 'repulsor', ownerId: 2, sourceId: 2 });
    const shot = spawnBody(t.sim, {
      type: 'projectile', x: 35, z: 0, mass: 0.2, radius: 1, ownerId: 77, team: 3,
      velX: 20,
    });
    const velBefore = shot.vel.x;
    t.sim.step(1 / 60);
    const bend = t.state.fields.familyRead.bend;
    const equilibrium = bend.samples.find((sample) => sample.kind === 'equilibrium');
    const inactive = bend.samples.find((sample) => sample.kind === 'inactive');
    assert.ok(equilibrium, 'opposed fields read as an equilibrium, not as nothing');
    assert.ok(inactive, 'empty space stays inactive');
    assert.ok(Math.abs(equilibrium.ax) < 1e-4 && Math.abs(equilibrium.az) < 1e-4);
    const well = equilibrium.contributors.find((row) => row.kind === 'well');
    const repulsor = equilibrium.contributors.find((row) => row.kind === 'repulsor');
    assert.ok(well && repulsor);
    assert.ok(well.ax * repulsor.ax < 0, 'the contributors keep their own signs');
    const accel = { ax: 0, az: 0 };
    sampleFieldAcceleration(
      { x: equilibrium.x, z: equilibrium.z },
      null,
      t.sys._kernel.list(),
      t.state.simTime,
      { mass: FIELD_COUPLING.refMass, type: 'ship', fieldResponseMult: 1, boosting: false, hitchedTo: null },
      accel,
    );
    assert.ok(Math.abs(accel.ax - equilibrium.ax) < 1e-6);
    assert.ok(Math.abs(accel.az - equilibrium.az) < 1e-6);
    assert.equal(shot.ownerId, 77);
    assert.equal(shot.vel.x, velBefore, 'the illustrated sample does not rewrite the shot');
    t.sys._kernel.unregister('bend_repulsor');
    t.sim.step(1 / 60);
    const after = t.state.fields.familyRead.bend;
    const stale = after.samples.find((sample) => sample.kind === 'equilibrium');
    const tendency = after.samples.find((sample) => sample.kind === 'tendency');
    assert.equal(stale, undefined);
    assert.ok(tendency);
    assert.ok(tendency.ax < -1, 'only the remaining well pulls');
    assert.equal(tendency.contributors.length, 1);
    assert.equal(tendency.contributors[0].kind, 'well');
    assert.equal(shot.ownerId, 77);
    assert.equal(shot.vel.x, velBefore);
    t.sim.dispose();
  });
});

test('SF-040 a bent shot keeps its owner, and a mine breakout keeps its arm', () => {
  withFields(() => {
    const t = boot();
    plant(t.sys, {
      id: 'own_well', kind: 'well', radius: 120, strength: 220, falloff: 1,
      ownerId: 5, sourceId: 5, center: { x: 0, z: 0 },
    });
    plant(t.sys, {
      id: 'own_repulsor', kind: 'repulsor', radius: 100, strength: 260, falloff: 1,
      ownerId: 6, sourceId: 6, center: { x: 300, z: 0 },
    });
    const shot = spawnBody(t.sim, {
      type: 'projectile', x: 40, z: 0, mass: 0.2, radius: 1, ownerId: 77, team: 4, velX: 30,
    });
    const heldMine = spawnBody(t.sim, {
      type: 'mine', x: 20, z: 0, mass: 8, radius: 6,
      data: { kind: 'mine', mine: true, ownerId: 11, armed: true, triggered: false },
    });
    const rimMine = spawnBody(t.sim, {
      type: 'mine', x: 390, z: 0, mass: 8, radius: 6,
      data: { kind: 'mine', mine: true, ownerId: 12, armed: true, triggered: false },
    });
    const vel = shot.vel.x;
    t.sim.step(1 / 60);
    const read = t.state.fields.familyRead;
    const bent = rowById(read.bend.projectiles, shot.id);
    assert.ok(bent);
    assert.equal(bent.ownerId, 77);
    assert.equal(bent.reassigned, false);
    assert.equal(bent.fieldOwnerId, 5);
    assert.equal(bent.ambiguous, false);
    assert.equal(bent.bent, true);
    assert.ok(bent.ax < 0);
    assert.equal(shot.ownerId, 77);
    assert.equal(shot.vel.x, vel);
    const deep = rowById(read.breakout.mines, heldMine.id);
    const rim = rowById(read.breakout.mines, rimMine.id);
    assert.equal(deep.held, true);
    assert.equal(deep.breakout, false);
    assert.equal(deep.ownerId, 11);
    assert.equal(deep.armed, true);
    assert.equal(deep.triggered, false);
    assert.equal(rim.breakout, true);
    assert.equal(rim.held, false);
    assert.equal(rim.ownerId, 12);
    assert.equal(rim.armed, true);
    assert.ok(rim.exitX > 0);
    rimMine.pos.x = 430;
    t.sim.step(1 / 60);
    const left = rowById(t.state.fields.familyRead.breakout.mines, rimMine.id);
    assert.equal(left.left, true);
    assert.equal(left.breakout, true);
    assert.equal(left.inside, false);
    assert.equal(left.ownerId, 12);
    assert.equal(rimMine.data.armed, true);
    assert.equal(rimMine.data.triggered, false);
    assert.equal(shot.ownerId, 77);
    t.sim.dispose();
  });
});

test('the force picture draws the family read and stays quiet without one', () => {
  withFields(() => {
    const t = boot();
    t.player.pos.x = 20;
    t.sim.spawn({
      type: 'bomb', alive: true, radius: 4, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      data: { bombId: 'bomb_goo', phase: 'field', fieldStartedAt: 0, ownerId: t.player.id, retired: false },
    });
    t.sim.step(1 / 60);
    const quiet = new FieldForcePresentation(new THREE.Scene());
    quiet.update(1 / 60, { simTime: 1, settings: {}, fields: { active: [] } });
    assert.equal(quiet.stats.surfaces, 0);
    quiet.update(1 / 60, { simTime: 2, settings: {}, fields: { active: [], familyRead: t.state.fields.familyRead } });
    assert.ok(quiet.stats.surfaces > 0, 'the tar edge and exit are drawn from the live read');
    quiet.dispose?.();
    t.sim.dispose();
  });
});
