// PIC-16: a shot the warden absorbs draws one sheet on the aimed hull, oriented
// to that hit's normal. The aimed hull takes no damage flash. The escort still does.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createDamageRouter, scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { ActionVfx } from '../src/render/actionVfx.js';

function ship(id, pos, team, extra = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    hull: 80,
    hullMax: 80,
    shield: 0,
    shieldMax: 0,
    armorHp: 0,
    armorMax: 0,
    radius: 8,
    collisionRadius: 12,
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    ...extra,
  };
}

function boot() {
  const state = createGameState(4242);
  const bus = createBus();
  const warded = [];
  const damage = [];
  bus.on('combat:warded', (payload) => warded.push(payload));
  bus.on('combat:damage', (payload) => damage.push(payload));
  const attacker = ship(2, { x: 0, z: 0 }, 1);
  const aimed = ship(3, { x: 100, z: 0 }, 2);
  const escort = ship(4, { x: 50, z: 0 }, 2, { data: { enemyTypeId: 'warden_escort' } });
  for (const entity of [attacker, aimed, escort]) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
  }
  const router = createDamageRouter({
    state,
    catalog: createCombatCatalog(),
    bus,
    helpers: {},
  }, { schedule() {} });
  return { state, router, attacker, aimed, escort, warded, damage };
}

function packet() {
  return scalarHitToDamagePacket({
    damage: 20,
    damageType: 'kinetic',
    pos: { x: 40, z: 12 },
    approach: { x: 2, z: 0 },
    normal: { x: 3, z: 4 },
  });
}

function fire(h) {
  return h.router({
    attackerId: h.attacker.id,
    targetId: h.aimed.id,
    packet: packet(),
    origin: { kind: 'weapon', id: 'wpn_pulse', weaponId: 'wpn_pulse' },
  });
}

test('a warded hit sheets the aimed hull along the hit normal and does not damage it', () => {
  const h = boot();
  const aimedHull = h.aimed.hull;
  const escortHull = h.escort.hull;
  const result = fire(h);
  assert.equal(result.ok, true);
  assert.equal(result.targetId, h.escort.id);
  assert.equal(h.warded.length, 1);
  const event = h.warded[0];
  const raw = { x: 3, z: 4 };
  const length = Math.hypot(event.normal.x, event.normal.z);
  assert.ok(Math.abs(length - 1) < 1e-9, 'the ward normal is unit length');
  assert.ok(event.normal.x * raw.x + event.normal.z * raw.z > 0);
  assert.ok(Math.abs(event.normal.x * raw.z - event.normal.z * raw.x) < 1e-6);
  assert.equal(event.pos.x, 40);
  assert.equal(event.pos.z, 12);
  assert.notEqual(event.pos.x, h.aimed.pos.x);
  assert.notEqual(event.pos.z, h.escort.pos.z);
  assert.equal(h.aimed.hull, aimedHull);
  assert.ok(h.escort.hull < escortHull, 'the escort absorbs the hit');
  assert.equal(h.damage.filter((row) => row.targetId === h.aimed.id).length, 0);
  const escortDamage = h.damage.filter((row) => row.targetId === h.escort.id);
  assert.equal(escortDamage.length, 1);

  const sheets = new ActionVfx(new THREE.Scene());
  assert.equal(sheets.emit('combat:warded', event, h.state), true);
  const live = sheets.slots.filter((slot) => slot.alive && slot.event === 'combat:warded');
  assert.equal(live.length, 1);
  const slot = live[0];
  assert.equal(slot.recipe.verb, 'cool');
  assert.equal(slot.recipe.primitive, 'deposition');
  assert.equal(slot.recipe.continuous, false);
  assert.ok(slot.recipe.life > 0 && slot.recipe.life < 1);
  assert.ok(Math.abs(slot.angle - Math.atan2(event.normal.z, event.normal.x)) < 1e-9);
  assert.equal(slot.x, event.pos.x);
  assert.equal(slot.z, event.pos.z);
  sheets.dispose();
});

test('an escort off the shot does not sheet the hull, and the hull takes the hit', () => {
  const h = boot();
  h.escort.pos.x = 50;
  h.escort.pos.z = 400;
  const aimedHull = h.aimed.hull;
  const result = fire(h);
  assert.equal(result.ok, true);
  assert.equal(result.targetId, h.aimed.id);
  assert.equal(h.warded.length, 0);
  assert.ok(h.aimed.hull < aimedHull);
  const hit = h.damage.find((row) => row.targetId === h.aimed.id);
  assert.ok(hit);
  assert.ok(hit.normal && Number.isFinite(hit.normal.x) && Number.isFinite(hit.normal.z));
  assert.ok(hit.hullHit === true || hit.shieldAbsorbed === true);
});
