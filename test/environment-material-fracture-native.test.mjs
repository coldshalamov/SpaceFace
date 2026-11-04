import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { environmentMaterials, addEnvironmentHeat } from '../src/systems/environmentMaterials.js';
import { environmentSurfaceData } from '../src/data/environmentMaterials.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { actions } from '../src/systems/actions.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

const DT = 1 / 60;
const pocket = JSON.parse(fs.readFileSync(new URL('./fixtures/environment-material-pocket.json', import.meta.url)));

async function boot(specs = []) {
  const sim = createSimulation({ seed: 73311, systems: [physics, environmentMaterials], updateOrder: [] });
  sim.state.mode = 'flight';
  sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  for (const { entity, generation } of specs) {
    if (generation) sim.state.nextOccupantGeneration = generation;
    sim.spawn(structuredClone(entity));
  }
  sim.state.playerId = specs.find(r => r.entity.type === 'ship')?.entity.id ?? null;
  assert.equal(await sim.registry.get('physics').prepareBackend(sim.state, {}), true);
  return { sim, state: sim.state, native: sim.registry.get('physics')._sg02, materials: sim.registry.get('environmentMaterials') };
}

function solve(h, controls = []) {
  for (const [id, force] of controls) writePhysicsControl(h.state.entities.get(id), { force });
  h.native.syncFromEntities(h.state.entityList);
  h.native.step(DT, ++h.state.tick);
  h.state.simTime += DT;
}

function overlap(native, a, b) {
  const aa = native.records.get(a)?.colliders || [], bb = native.records.get(b)?.colliders || [];
  let deepest = 0;
  for (const ca of aa) for (const cb of bb) {
    const contact = ca.contactCollider(cb, 0);
    if (contact) deepest = Math.min(deepest, contact.distance);
  }
  return deepest;
}

const crystal = (extra = {}) => ({ type: 'asteroid', pos: { x: 0, z: 0 }, vel: { x: 12, z: -7 }, rot: 0.3, angVel: 0.45,
  radius: 20, mass: 640, hull: 600, hullMax: 600, collides: true, ttl: 40,
  physicsBody: { radius: 31, mass: 640 },
  data: environmentSurfaceData('crystal', { typeId: 'ast_crystalline', yieldU: 20, yieldRemainingU: 20, asteroidSlotId: 'crystal', despawnAt: 30 }), ...extra });

test('a rotating native parent fractures without birth overlap or an invented radial kick', async () => {
  const h = await boot([{ entity: crystal({ id: 50 }), generation: 999 }]);
  try {
    const parent = h.state.entities.get(50), rec = h.native.records.get(50);
    solve(h);
    const actual = { pos: rec.body.worldCom(), vel: rec.body.linvel(), angular: -rec.body.angvel().y, inertia: rec.body.principalInertia().y };
    assert.ok(actual.angular > 0.4);
    let chunks = 0, destroyed = 0;
    let terminalCondition;
    const get = h.sim.registry.get.bind(h.sim.registry);
    h.sim.registry.get = name => name === 'world' ? { persistResourceBody: e => { terminalCondition = { ...e.data.materialCondition }; } } : get(name);
    h.sim.bus.on('asteroid:chunked', () => chunks++);
    h.sim.bus.on('asteroid:destroyed', () => destroyed++);
    addEnvironmentHeat(h.state, parent, 48);
    h.materials.update(DT);
    const children = h.state.entityList.filter(e => e.data?.materialFragment);
    assert.equal(children.length, 4);
    assert.equal(parent.alive, false);
    assert.equal(terminalCondition.pending, false);
    assert.equal(terminalCondition.reacted, true, 'durable terminal state is persisted after reaction completion');
    assert.equal(children.reduce((sum, e) => sum + e.mass, 0), 640);
    assert.equal(children.reduce((sum, e) => sum + e.data.yieldRemainingU, 0), 20);
    const inertia = children.reduce((sum, e) => sum + e.physicsBody.inertiaY + e.mass * ((e.pos.x-actual.pos.x)**2+(e.pos.z-actual.pos.z)**2), 0);
    const inheritedAngular = actual.angular * actual.inertia / inertia;
    assert.ok(Math.abs(inheritedAngular) < Math.abs(actual.angular));
    for (const child of children) {
      const dx = child.pos.x - actual.pos.x, dz = child.pos.z - actual.pos.z;
      assert.ok(Math.abs(child.vel.x - (actual.vel.x - inheritedAngular * dz)) < 1e-5);
      assert.ok(Math.abs(child.vel.z - (actual.vel.z + inheritedAngular * dx)) < 1e-5);
      assert.ok(Math.abs(child.angVel - inheritedAngular) < 1e-8);
      assert.equal(child.data.materialFragmentOf.occupantGeneration, 999);
      assert.equal(child.data.despawnAt, 30);
    }
    h.native.syncFromEntities(h.state.entityList);
    for (const a of children) for (const b of children) if (a !== b) assert.equal(overlap(h.native, a.id, b.id), 0);
    const expectedAfterDamping = children.reduce((sum,e)=>{
      const d=h.native.records.get(e.id).body.angularDamping();
      return sum+e.physicsBody.inertiaY*inheritedAngular/(1+d*DT)
        +e.mass*((e.pos.x-actual.pos.x)**2+(e.pos.z-actual.pos.z)**2)*inheritedAngular;
    },0);
    solve(h);
    assert.equal(h.native.records.has(parent.id), false, 'the terminal parent leaves no native handle');
    for (const a of children) for (const b of children) if (a !== b) assert.equal(overlap(h.native, a.id, b.id), 0);
    const velocity = children.reduce((v, e) => ({ x: v.x + e.vel.x / 4, z: v.z + e.vel.z / 4 }), { x: 0, z: 0 });
    assert.ok(Math.abs(velocity.x - actual.vel.x) < 0.02 && Math.abs(velocity.z - actual.vel.z) < 0.02);
    const angularMomentum = children.reduce((sum, e) => {
      const dx=e.pos.x-actual.pos.x, dz=e.pos.z-actual.pos.z;
      return sum+e.physicsBody.inertiaY*e.angVel+e.mass*(dx*(e.vel.z-actual.vel.z)-dz*(e.vel.x-actual.vel.x));
    },0);
    assert.ok(Math.abs(angularMomentum-expectedAfterDamping) < 1,
      `native solve angular momentum ${angularMomentum}, expected after authored damping ${expectedAfterDamping}`);
    const relativeEnergy = children.reduce((sum,e)=>sum+0.5*e.physicsBody.inertiaY*e.angVel**2
      +0.5*e.mass*((e.vel.x-actual.vel.x)**2+(e.vel.z-actual.vel.z)**2),0);
    assert.ok(relativeEnergy <= 0.5*actual.inertia*actual.angular**2+0.1);
    h.materials.update(DT);
    assert.equal(chunks, 4); assert.equal(destroyed, 1);
  } finally { h.sim.dispose(); }
});

test('an incompatible parent inertia defers rather than inventing rotational energy or clamping spin', async () => {
  const h = await boot([{ entity: crystal({ id: 50, physicsBody: { radius: 31, mass: 640, inertiaY: 1e9 } }), generation: 50 }]);
  try {
    const parent = h.state.entities.get(50);
    addEnvironmentHeat(h.state, parent, 48);
    h.materials.update(DT);
    assert.equal(parent.alive, true);
    assert.equal(h.state.materialReactions.length, 1);
    assert.equal(h.state.entityList.filter(e => e.data?.materialFragment).length, 0);
  } finally { h.sim.dispose(); }
});

test('the observed native pocket keeps its real footprint, force response and fracture provenance', async () => {
  const h = await boot(pocket.rows);
  try {
    const player = h.state.entities.get(pocket.playerId);
    assert.equal(h.native.records.get(player.id).colliders.length, 10);
    assert.deepEqual(pocket.attachments, []);
    for (const id of [534, 588, 720, 750]) assert.ok(overlap(h.native, player.id, id) < -0.1, `captured solid contact ${id}`);
    assert.equal(h.state.entities.get(534).occupantGeneration, 3672);
    assert.equal(h.state.entities.get(588).data.asteroidSlotId, '534:shard:2', 'raw recycled parent id is historical provenance, not current occupant identity');
    const force = pocket.rows.find(r => r.entity.id === player.id).native.userForce;
    const before = { ...player.pos };
    for (let i = 0; i < 60; i++) solve(h, [[player.id, force]]);
    const moved = Math.hypot(player.pos.x - before.x, player.pos.z - before.z);
    assert.ok(Number.isFinite(moved));
    assert.ok(moved < 50, `captured pocket resists available native thrust (${moved.toFixed(2)} WU); this test does not claim escape`);
  } finally { h.sim.dispose(); }
});

test('prospective fracture at the captured fragment footprint cannot add bodies inside the captured player', async () => {
  // The checkpoint is post-birth. Re-arm only this fixture's initial material condition
  // to exercise a prospective producer at that observed footprint; this is not a
  // claimed reconstruction of the unknown historical parent pose or an escape.
  const rows = structuredClone(pocket.rows);
  const initial = rows.find(r => r.entity.id === 534);
  initial.entity.data.materialCondition = { heat: 0, reacted: false };
  const h = await boot(rows);
  try {
    const parent = h.state.entities.get(534), beforeCount = h.state.entityList.length;
    const hull = parent.hull, mass = parent.mass, yieldU = parent.data.yieldRemainingU;
    const before = h.native.records.get(parent.id).body.translation();
    addEnvironmentHeat(h.state, parent, 48);
    h.materials.update(DT);
    assert.equal(parent.alive, true);
    assert.equal(parent.hull, hull); assert.equal(parent.mass, mass); assert.equal(parent.data.yieldRemainingU, yieldU);
    assert.equal(h.state.entityList.length, beforeCount);
    assert.equal(h.state.materialReactions.length, 1);
    assert.equal(parent.data.materialCondition.pending, true);
    assert.deepEqual(h.native.records.get(parent.id).body.translation(), before, 'admission cannot move the original');
    solve(h, [[pocket.playerId, pocket.rows[0].native.userForce]]);
    assert.equal(h.state.entityList.length, beforeCount);
    assert.equal(h.native.attachments.size, 0);
  } finally { h.sim.dispose(); }
});

test('no-space fractures defer intact and can finish once moving native obstacles clear', async () => {
  const block = { id: 80, type: 'station', radius: 150, mass: 1e9, pos: { x: 0, z: 0 }, vel: { x: 240, z: 0 }, collides: true,
    physicsBody: { dynamic: true, shape: 'ball', radius: 150, mass: 1e9, useMeasuredSkin: false }, data: {} };
  const h = await boot([{ entity: crystal({ id: 50, vel: { x: 0, z: 0 }, angVel: 0 }), generation: 50 }, { entity: block, generation: 80 }]);
  try {
    const parent = h.state.entities.get(50), hull = parent.hull;
    let destroyed = 0;
    h.sim.bus.on('asteroid:destroyed', () => destroyed++);
    addEnvironmentHeat(h.state, parent, 48);
    h.materials.update(DT);
    assert.equal(parent.alive, true); assert.equal(parent.hull, hull);
    assert.equal(parent.data.yieldRemainingU, 20);
    assert.equal(parent.data.materialCondition.pending, true);
    assert.equal(parent.data.materialCondition.reacted, false);
    assert.equal(h.state.materialReactions.length, 1);
    const retryAt = h.state.materialReactions[0].retryAt;
    h.materials.deserialize(h.materials.serialize());
    h.materials.update(DT);
    assert.equal(h.state.materialReactions[0].retryAt, retryAt, 'blocked jobs do not query every frame');
    for (let i = 0; i < 120 && parent.alive; i++) { solve(h); h.materials.update(DT); }
    assert.equal(parent.alive, false);
    assert.equal(destroyed, 1);
    assert.equal(h.state.materialReactions.length, 0);
    assert.equal(h.state.entityList.filter(e => e.data?.materialFragment).length, 4);
    solve(h);
    assert.equal(h.native.records.has(parent.id), false);
  } finally { h.sim.dispose(); }
});

test('an expired deferred original is retired without resurrection, fragments or a reward', async () => {
  const h = await boot([{ entity: crystal({ id: 50, ttl: 0.1 }), generation: 50 }, {
    entity: { id: 80, type: 'station', pos: { x: 0, z: 0 }, radius: 150, mass: 1e9, collides: true,
      physicsBody: { shape: 'ball', radius: 150, dynamic: false, useMeasuredSkin: false }, data: {} }, generation: 80 }]);
  try {
    const parent = h.state.entities.get(50);
    let destroyed = 0;
    h.sim.bus.on('asteroid:destroyed', () => destroyed++);
    addEnvironmentHeat(h.state, parent, 48);
    h.materials.update(DT);
    assert.equal(h.state.materialReactions.length, 1);
    for (let i = 0; i < 45; i++) {
      h.sim.step(DT);
      h.materials.update(DT);
      h.native.syncFromEntities(h.state.entityList);
      h.native.step(DT, h.state.tick);
    }
    assert.equal(h.native.records.has(parent.id), false);
    assert.equal(h.state.materialReactions.length, 0);
    assert.equal(destroyed, 0);
    assert.equal(h.state.entityList.filter(e => e.data?.materialFragment).length, 0);
  } finally { h.sim.dispose(); }
});

test('fracture restores authored material lifetime without cloning a Gyre flight lease', async () => {
  const data = environmentSurfaceData('crystal', { typeId: 'ast_crystalline', yieldU: 20,
    gyreLaunched: true, gyreLaunchMeta: { holdUntilSim: 9 }, despawnAt: 9,
    gyrePrevDespawnAt: 30, gyrePrevTtl: 40 });
  const h = await boot([{ entity: crystal({ id: 50, ttl: Infinity, data }), generation: 50 }]);
  try {
    addEnvironmentHeat(h.state, h.state.entities.get(50), 48);
    h.materials.update(DT);
    const children = h.state.entityList.filter(e => e.data?.materialFragment);
    assert.equal(children.length, 4);
    assert.ok(children.every(e => e.data.despawnAt === 30 && !e.data.gyreLaunched && !e.data.gyreLaunchMeta));
  } finally { h.sim.dispose(); }
});

test('the stock Line actually acquires, moves and releases an admitted 160 t crystal remnant', async () => {
  const sim = createSimulation({ seed: 73311, systems: [actions, flightV3, physics, combat, tetherGameplay, environmentMaterials] });
  try {
    const { state } = sim;
    state.mode = 'flight';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    state.settings.gameplay.flightBackend = 'v3';
    const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, { isPlayer: true, team: 0, pos: { x: -100, z: 0 },
      fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules) }));
    state.playerId = player.id;
    const parent = sim.spawn(crystal({ radius: 5.559897275706275 * Math.cbrt(4), vel: { x: 0, z: 0 }, angVel: 0,
      data: environmentSurfaceData('crystal', { typeId: 'ast_crystalline', placeId: 'place_rock_crystal_pebble', yieldU: 10 }) }));
    assert.equal(await sim.registry.get('physics').prepareBackend(state, {}), true);
    addEnvironmentHeat(state, parent, 48);
    sim.registry.get('environmentMaterials').update(DT);
    const target = state.entityList.filter(e => e.data?.materialFragment).sort((a,b)=>a.pos.x-b.pos.x)[0];
    assert.equal(target.mass, 160);
    const start = { ...target.pos };
    let attached = false, cut = false;
    sim.bus.on('tether:attached', p => { if (p.targetId === target.id) attached = true; });
    sim.bus.on('tether:cut', p => { if (p.targetId === target.id) cut = true; });
    state.input.aimWorld = { ...target.pos };
    state.input.aimIntentActive = true;
    state.input.pointerScreen = { active: true, x: 0, y: 0 };
    state.input.actions = { tetherFire: true };
    sim.step(DT);
    state.input.actions.tetherFire = false;
    for (let i = 0; i < 180; i++) {
      state.input.moveX = -1;
      state.input.actions.tetherCut = i === 170;
      sim.step(DT);
    }
    assert.equal(attached, true);
    assert.equal(cut, true);
    assert.ok(Math.hypot(target.pos.x - start.x, target.pos.z - start.z) > 5);
  } finally { sim.dispose(); }
});
