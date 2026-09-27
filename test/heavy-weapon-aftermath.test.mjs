import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';
import { resolveWeaponRecipe } from '../src/render/weapons/recipes.js';
import { HeavyImpactVfx } from '../src/render/weapons/heavyImpactVfx.js';

const weapons = [
  ['wpn_siege_lance_l', 'siege-lance', [1, 2, 3]],
  ['wpn_railgun_m', 'railgun', [1, 3, 6]],
  ['wpn_plasma_cannon_m', 'thermal-bolt', [1, 3]],
  ['wpn_emp_disruptor_m', 'disruptor', [3, 5]],
  ['wpn_concussion_cannon_m', 'concussion-slug', [3, 4]],
  ['wpn_missile_rack_m', 'missile', [1, 3, 4]],
  ['wpn_torpedo_l', 'torpedo', [1, 3, 4]],
];
function harness() {
  const scene = new THREE.Scene(), mesh = new THREE.Group();
  mesh.position.set(20, 0, -5); scene.add(mesh);
  const body = { id: 2, type: 'asteroid', alive: true, radius: 11, pos: { x: 20, z: -5 } };
  const state = { simTime: 0, playerId: 1, settings: { video: {} }, entities: new Map([[2, body]]),
    entityList: [], render: { scene, meshes: new Map([[2, mesh]]) } };
  const presenter = new WeaponVfxPresenter({ scene, state });
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 60, 80);
  const update = time => { state.simTime = time; presenter.update(1 / 60, { state, camera }); };
  const hit = weaponId => presenter.handleHit({ weaponId, targetId: 2, projectileId: 9,
    pos: { x: 31, z: -5 }, normal: { x: 1, z: 0 }, approach: { x: -1, z: 0 } }, false);
  return { presenter, state, mesh, body, update, hit };
}

test('heavy native hits retain distinct substantial aftermath beyond the generic flash', () => {
  for (const [weaponId, variant, primitives] of weapons) {
    const h = harness();
    assert.equal(resolveWeaponRecipe(weaponId).variant, variant, 'fixture uses an actual catalog weapon');
    const before = JSON.stringify(h.body);
    h.hit(weaponId); h.update(.24);
    const pool = h.presenter.heavyImpacts, s = pool.slots.find(s => s.alive);
    assert.equal(s.variant, variant); assert.equal(s.attached, true); assert.equal(s.targetId, 2);
    assert.ok(s.radius > 4 && s.life > .9);
    assert.ok(pool.mesh.visible && pool.mesh.count >= 4);
    const kinds = new Set();
    for (let i = 0; i < pool.mesh.count; i++) kinds.add(pool.batch.attributes[1].getX(i));
    assert.deepEqual([...kinds].sort(), primitives);
    assert.equal(h.presenter.discharges.slots.some(s => s.alive), false, 'new matter replaces the generic hull surface');
    assert.equal(JSON.stringify(h.body), before, 'no effect writes gameplay or invents destruction');
    h.update(3); assert.equal(pool.live, 0); assert.equal(pool.mesh.visible, false);
    const versions = pool.batch.attributes.map(a => a.version);
    h.update(4); assert.deepEqual(pool.batch.attributes.map(a => a.version), versions, 'no idle uploads');
    h.presenter.dispose();
  }
});

test('retained contact follows target rotation and rebasing, with a paused material clock', () => {
  const h = harness(); h.hit('wpn_siege_lance_l'); h.update(.3);
  const pool = h.presenter.heavyImpacts, attr = pool.batch.attributes[0];
  const beforeX = attr.getX(0), beforeZ = attr.getZ(0), versions = pool.batch.attributes.map(a => a.version);
  h.update(.3); assert.deepEqual(pool.batch.attributes.map(a => a.version), versions);
  h.mesh.rotation.y = Math.PI / 2; h.update(.32);
  assert.ok(Math.abs(attr.getX(0) - 20) < .01);
  assert.ok(attr.getZ(0) < beforeZ - 10, 'target-local contact rotates with the actual drawn hull');
  h.mesh.position.x -= 100; h.presenter.reproject(-100, 20); h.mesh.position.z += 20;
  h.update(.32);
  assert.ok(Math.abs(attr.getX(0) + 80) < .01);
  assert.ok(beforeX > 30);
  h.state.render.meshes.delete(2); h.update(.35);
  assert.equal(pool.live, 0, 'removed receiver cannot leave an attached effect floating');
  h.presenter.dispose();
});

test('rail, siege and molten flight retain fundamentally different carried anatomy', () => {
  const rail = resolveWeaponRecipe('wpn_railgun_m').flight;
  const siege = resolveWeaponRecipe('wpn_siege_lance_l').flight;
  const thermal = resolveWeaponRecipe('wpn_plasma_cannon_m').flight;
  assert.equal(new Set([rail.boltVariant, siege.boltVariant, thermal.boltVariant]).size, 3);
  assert.ok(siege.width > rail.width * 4, 'a loaded bore chamber is not a rail needle');
  assert.ok(rail.intensity < 2 && siege.intensity < 2, 'body identity survives broad white clipping');
  assert.notEqual(thermal.coreColor, rail.coreColor);
});

test('missile and torpedo motors follow the rear nozzle and replace legacy capsules', () => {
  for (const weaponId of ['wpn_missile_rack_m', 'wpn_torpedo_l']) {
    const h = harness(), root = new THREE.Group();
    for (const name of ['ProjectileMissileBody', 'ProjectileMissileExhaust', 'ProjectileMissileExhaustSheath']) {
      const part = new THREE.Object3D(); part.name = name; root.add(part);
    }
    const projectile = { id: 7, type: 'projectile', alive: true, radius: .7,
      pos: { x: 8, z: 0 }, prevPos: { x: 5, z: 0 }, vel: { x: 180, z: 0 }, data: { weaponId } };
    h.state.entityList.push(projectile); h.state.entities.set(7, projectile); h.state.render.meshes.set(7, root);
    h.update(.1);
    const recipe = resolveWeaponRecipe(weaponId);
    assert.equal(h.presenter.bolts.live, 1, 'native projectile route draws a powered motor');
    const mid = h.presenter.bolts.pos.getX(0), length = h.presenter.bolts.size.getX(0);
    assert.ok(Math.abs(mid + length * .5 - (projectile.pos.x - projectile.radius)) < .001,
      'hot end is at the actual rear, not floating behind the moving round');
    assert.equal(h.presenter.bolts.size.getW(0), recipe.flight.boltVariant);
    assert.equal(root.getObjectByName('ProjectileMissileBody').visible, true);
    assert.equal(root.getObjectByName('ProjectileMissileExhaust').visible, false);
    assert.equal(root.getObjectByName('ProjectileMissileExhaustSheath').visible, false);
    h.presenter.dispose();
  }
});

test('heavy aftermath admission and clear/disposal stay bounded', () => {
  const scene = new THREE.Scene(), pool = new HeavyImpactVfx(scene, { capacity: 2 });
  const captured = { x: 0, y: .4, z: 0, nx: 1, ny: 0, nz: 0, attached: false };
  for (let i = 0; i < 30; i++) pool.spawn('thermal-bolt', captured, { id: i }, 11, 0);
  assert.equal(pool.live, 2); assert.equal(pool.slots.length, 2);
  pool.update(.4, s => ({ x: s.x, y: s.y, z: s.z, ax: 1, az: 0 }), { id: 'full' });
  assert.ok(pool.mesh.count <= pool.batch.capacity);
  pool.clear(); assert.equal(pool.live, 0); assert.equal(pool.mesh.visible, false);
  pool.dispose(); pool.dispose(); assert.equal(scene.children.length, 0);
});
