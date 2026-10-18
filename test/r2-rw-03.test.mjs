// RW-03 — an energy shot into a pinned Snarl node charges the chord. A hull that
// crosses the live chord loses shield and takes Cryo Lock (Thermal Shock if it was
// already burning). A hull beside the same chord does not. Charge dies on sim time
// and is spent by a crossing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { ensureCombatant } from '../src/combat/runtime.js';
import { CRYO_LOCK_STATUS_ID } from '../src/combat/cryoLock.js';
import { BURNING_STATUS_ID } from '../src/combat/thermalShock.js';
import { combat } from '../src/systems/combat.js';
import { masslineSnares } from '../src/systems/masslineSnares.js';
import { WEB_DEF_ID } from '../src/combat/tetherWebs.js';
import { TetherWebFx } from '../src/render/combat/tetherWebFx.js';

const DT = 1 / 60;

function ship(id, x, z, extra = {}) {
  const radius = extra.radius ?? 6;
  return {
    id,
    type: 'ship',
    alive: true,
    team: extra.team ?? 2,
    pos: { x, z },
    vel: { x: extra.vx || 0, z: extra.vz || 0 },
    rot: 0,
    radius,
    mass: 16,
    hull: extra.hull ?? 200,
    hullMax: extra.hull ?? 200,
    armorHp: extra.armor ?? 40,
    armorMax: extra.armor ?? 40,
    shield: extra.shield ?? 0,
    shieldMax: extra.shieldMax ?? 80,
    physicsBody: {
      schemaVersion: 1, radius, mass: 16, inertiaY: 128, dynamic: true, ccd: true, revision: 0,
    },
    data: {},
  };
}

function makeWorld(t) {
  const player = ship(1, -80, 40, { team: 1, shield: 40 });
  const nodeA = ship(2, 0, 0, { radius: 8, hull: 400, shield: 0 });
  const nodeB = ship(3, 160, 0, { radius: 8, hull: 400, shield: 0 });
  // Current pose is already past the chord; the previous pose (rewound by vel * dt) is on the other side.
  const crosser = ship(10, 80, -12, { shield: 80, vz: -900 });
  const beside = ship(11, 80, 48, { shield: 80, vx: 40 });
  const late = ship(12, 110, -12, { shield: 80, vz: -900 });
  const list = [player, nodeA, nodeB, crosser, beside, late];
  const state = {
    tick: 1,
    simTime: 20,
    seed: 4242,
    rng: mulberry32(4242),
    mode: 'flight',
    playerId: 1,
    entityList: list,
    entities: new Map(list.map((e) => [e.id, e])),
    settings: { gameplay: { difficulty: 'veteran' } },
  };
  const bus = createBus();
  const physics = {
    createAttachment() { return { id: 1 }; },
    cutAttachment() { return true; },
    setAttachmentReel() { return true; },
    getAttachmentTelemetry() { return { tension: 0, impulse: 0, yank: 0 }; },
  };
  const slot = {};
  const registry = {
    get(id) { return id === 'combat' || id === 'actions' ? slot : null; },
  };
  const helpers = { combatPhysics: physics };
  const kernel = getCombatKernel({ state, bus, helpers, registry });
  slot.kernel = kernel;
  const created = kernel.attachments.create({
    defId: WEB_DEF_ID,
    ownerId: nodeA.id,
    targetId: nodeB.id,
    controllerId: player.id,
    controlMode: 'snarl',
    sourceWorld: nodeA.pos,
    targetWorld: nodeB.pos,
  });
  assert.equal(created.ok, true, created.reason);
  const snares = Object.create(masslineSnares);
  snares.init({ state, bus, helpers, registry });
  t.after(() => snares.destroy());
  const guns = Object.create(combat);
  guns.state = state;
  guns.bus = bus;
  guns.registry = registry;
  guns.helpers = helpers;
  guns.kernel = kernel;
  return { state, kernel, snares, guns, chord: created.attachment, nodeA, nodeB, crosser, beside, late, player };
}

function shootEnergy(world, target = world.nodeA) {
  return world.guns.onHit({
    targetId: target.id,
    ownerId: world.player.id,
    damage: 4,
    damageType: 'energy',
    weaponId: 'wpn_beam_laser_m',
    pos: { x: target.pos.x, z: target.pos.z },
  });
}

function cryoOf(state, id) {
  const runtime = state.combat && state.combat.entities && state.combat.entities[String(id)];
  return runtime && runtime.statuses && runtime.statuses[CRYO_LOCK_STATUS_ID] || null;
}

function burnOf(state, id) {
  const runtime = state.combat && state.combat.entities && state.combat.entities[String(id)];
  return runtime && runtime.statuses && runtime.statuses[BURNING_STATUS_ID] || null;
}

function widths(fx) {
  const out = [];
  for (let i = 0; i < fx.mesh.count; i++) {
    const matrix = fx.mesh.instanceMatrix.array;
    const start = i * 16;
    out.push(Math.hypot(matrix[start], matrix[start + 1], matrix[start + 2]));
  }
  return out;
}

test('a hull crossing a beam-charged snarl chord takes shield strip and Cryo Lock; a hull beside it does not', (t) => {
  const world = makeWorld(t);
  const { state, kernel, snares, chord, crosser, beside, late } = world;
  const kinetic = world.guns.onHit({
    targetId: world.nodeA.id,
    ownerId: world.player.id,
    damage: 4,
    damageType: 'kinetic',
    pos: { x: 0, z: 0 },
  });
  assert.equal(kinetic.ok, true);
  assert.equal(chord.arcWire, undefined, 'a kinetic shot does not charge the chord');

  const shot = shootEnergy(world);
  assert.equal(shot.ok, true);
  assert.ok(chord.arcWire && chord.arcWire.left > 0 && chord.arcWire.until > state.simTime,
    'an energy shot into a pinned web node charges the chord');
  const budget = chord.arcWire.left;

  snares.update(DT, state);
  assert.ok(crosser.shield < 70, `crossing hull loses shield (now ${crosser.shield})`);
  assert.equal(crosser.hull, 200, 'the strip stays on the shield');
  assert.equal(crosser.armorHp, 40, 'the strip stays on the shield');
  assert.equal(beside.shield, 80, 'a hull beside the same chord is untouched');
  assert.equal(beside.hull, 200);
  assert.equal(late.shield, 80, 'the crossing spends the charge, so the next hull does not eat it');
  assert.ok(chord.arcWire.left < budget, 'each crossing spends charge');

  state.tick += 1;
  kernel.prePhysics(DT);
  assert.ok(cryoOf(state, crosser.id), 'the crossing hull takes Cryo Lock');
  assert.equal(cryoOf(state, beside.id), null);
  assert.equal(cryoOf(state, late.id), null);

  late.pos.z = -20;
  late.vel.z = -900;
  const lateShield = late.shield;
  snares.update(DT, state);
  assert.equal(late.shield, lateShield, 'a spent chord does not keep biting while its clock still runs');
  assert.equal(cryoOf(state, late.id), null);
});

test('charge dies on sim time, and a fresh shot can arm the chord again', (t) => {
  const world = makeWorld(t);
  const { state, snares, chord, crosser, beside, late } = world;
  shootEnergy(world);
  const until = chord.arcWire.until;
  // Park everyone off the chord so the clock, not a crossing, is what ends the charge.
  for (const hull of [crosser, beside, late]) {
    hull.pos.x = 80;
    hull.pos.z = 70;
    hull.vel.x = 0;
    hull.vel.z = 0;
  }
  state.simTime = until;
  snares.update(DT, state);
  assert.equal(chord.arcWire, undefined, 'the charge is gone when sim time reaches its end');

  crosser.pos.x = 80;
  crosser.pos.z = -12;
  crosser.vel.z = -900;
  const shield = crosser.shield;
  snares.update(DT, state);
  assert.equal(crosser.shield, shield, 'a dark chord does not strip a hull that crosses it');

  shootEnergy(world);
  assert.ok(chord.arcWire && chord.arcWire.left > 0 && state.simTime < chord.arcWire.until,
    'another energy shot arms the chord again');
});

test('a burning hull that crosses takes Thermal Shock instead of keeping Cryo Lock', (t) => {
  const world = makeWorld(t);
  const { state, kernel, snares, crosser, beside, late } = world;
  // Keep the other two hulls off the chord so only the burning one crosses.
  beside.pos.z = 70;
  beside.vel.x = 0;
  late.pos.z = 70;
  late.vel.z = 0;
  const combatant = ensureCombatant(state, crosser, kernel.catalog);
  kernel.statuses.schedule(crosser, combatant, {
    id: BURNING_STATUS_ID,
    stacks: 1,
    durationTicks: 120,
    applyTick: state.tick,
  }, { attackerId: world.nodeA.id });
  state.tick += 1;
  kernel.prePhysics(DT);
  assert.ok(burnOf(state, crosser.id), 'the hull is burning before it hits the chord');

  shootEnergy(world);
  const shieldBefore = crosser.shield;
  snares.update(DT, state);
  assert.ok(crosser.shield < shieldBefore, 'Thermal Shock still strips shield');
  assert.equal(crosser.hull, 200);
  state.tick += 1;
  kernel.prePhysics(DT);
  assert.equal(burnOf(state, crosser.id), null, 'the shock consumes the burn');
  assert.equal(cryoOf(state, crosser.id), null, 'the shock consumes Cryo Lock instead of leaving it on');
});

test('the energizing shot is visible on the chord itself', (t) => {
  const world = makeWorld(t);
  const scene = new THREE.Scene();
  const fx = new TetherWebFx(scene, (x, z, out) => { out.x = x; out.z = z; });
  t.after(() => fx.dispose());
  shootEnergy(world);
  fx.update(world.state);
  const hot = widths(fx);
  assert.ok(hot.length > 1, 'the charged chord is drawn');
  const hottest = Math.max(...hot);
  const coolest = Math.min(...hot);
  assert.ok(hottest > 0.7, `the charged chord reads thicker than a slack snarl (${hottest})`);
  assert.ok(hottest > coolest + 0.05, 'the shot sits on the chord as a thicker reach, not a flat recolor');
  delete world.chord.arcWire;
  fx.update(world.state);
  const cold = Math.max(...widths(fx));
  assert.ok(hottest > cold + 0.2, 'the chord goes back to an ordinary snarl when the charge is gone');
});
