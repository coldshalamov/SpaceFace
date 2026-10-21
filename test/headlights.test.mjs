import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HeadlightPool, HEADLIGHT_POOL_SIZE } from '../src/render/headlights.js';
import { LOOK_HEADLIGHT } from '../src/data/lookMoods.js';
import { FieldForcePresentation } from '../src/render/forceLanguage/fieldForcePresentation.js';

const membrane = { toLocal(pos, out) { out.x = pos.x; out.z = pos.z; return out; } };

function ship(id, x, z, rot = 0, extra = {}) {
  return { id, type: 'ship', alive: true, pos: { x, z }, rot, radius: 10, data: {}, ...extra };
}

function world(entities, playerId = 1) {
  const map = new Map(entities.map((e) => [e.id, e]));
  return { playerId, entities: map, entityList: entities };
}

function lightCount(scene) {
  let n = 0;
  scene.traverse((o) => { if (o.isLight) n++; });
  return n;
}

function step(pool, state, seconds, opts) {
  for (let t = 0; t < seconds; t += 1 / 60) pool.update(state, 1 / 60, membrane, opts);
}

test('headlights are real SpotLights with no geometry, and the light count never changes', () => {
  const scene = new THREE.Scene();
  const pool = new HeadlightPool(scene);
  assert.equal(pool.size, HEADLIGHT_POOL_SIZE);
  let meshes = 0;
  scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) meshes++; });
  assert.equal(meshes, 0, 'a headlight is light, never a mesh posing as one');
  const spots = [];
  scene.traverse((o) => { if (o.isSpotLight) spots.push(o); });
  assert.equal(spots.length, HEADLIGHT_POOL_SIZE);
  assert.ok(spots.every((s) => s.castShadow === false));
  const census = lightCount(scene);

  const player = ship(1, 0, 0, 0);
  const state = world([player, ship(2, 60, 0), ship(3, -80, 40), ship(4, 900, 0)]);
  step(pool, state, 1);
  assert.equal(lightCount(scene), census);
  assert.ok(spots.every((s) => s.visible), 'lamps switch by intensity, never by visibility');
  player.alive = false;
  step(pool, state, 1);
  pool.clear();
  assert.equal(lightCount(scene), census);
  pool.dispose();
  assert.equal(lightCount(scene), 0);
});

test('the player lamp rides the bow, pitched down onto what is ahead, and fades in', () => {
  const scene = new THREE.Scene();
  const pool = new HeadlightPool(scene);
  const player = ship(1, 100, 50, Math.PI / 2);
  const state = world([player]);
  pool.update(state, 1 / 60, membrane);
  pool.update(state, 1 / 60, membrane);
  const lamp = pool.slots[0].light;
  assert.ok(lamp.intensity > 0 && lamp.intensity < LOOK_HEADLIGHT.intensity, 'fading in, not popping on');
  step(pool, state, LOOK_HEADLIGHT.fadeSeconds + 0.1);
  assert.ok(Math.abs(lamp.intensity - LOOK_HEADLIGHT.intensity) < 1e-6);
  assert.ok(Math.abs(lamp.position.x - 100) < 1e-6);
  assert.ok(lamp.position.z > 50, 'lamp sits on the bow (+heading)');
  assert.ok(lamp.position.y > lamp.target.position.y, 'beam is pitched down');
  assert.ok(lamp.target.position.z > lamp.position.z, 'beam points along the heading');

  // The Bolus nose cone takes the bow: the lamp fades out rather than doubling up.
  step(pool, state, LOOK_HEADLIGHT.fadeSeconds + 0.1, { playerLamp: false });
  assert.equal(lamp.intensity, 0);
});

test('NPC lamps go to the nearest powered hulls in reach and hold them', () => {
  const scene = new THREE.Scene();
  const pool = new HeadlightPool(scene);
  const player = ship(1, 0, 0);
  const near = ship(2, 50, 0);
  const mid = ship(3, 0, 120);
  const far = ship(4, 0, 200);
  const derelict = ship(5, 10, 10, 0, { data: { derelict: true } });
  const docked = ship(6, 12, 0, 0, { docked: true });
  const outOfReach = ship(7, LOOK_HEADLIGHT.npcReach + 50, 0);
  const state = world([player, far, mid, near, derelict, docked, outOfReach]);
  step(pool, state, 1);
  const lit = pool.slots.slice(1).map((s) => s.entity && s.entity.id).sort();
  assert.deepEqual(lit, [2, 3], 'the two nearest powered hulls carry the lamps');
  for (const slot of pool.slots.slice(1)) assert.ok(slot.light.intensity > 0);

  // A closer hull arriving does not steal a held lamp while its hull stays in reach.
  const arrival = ship(8, 5, 5);
  state.entities.set(8, arrival);
  state.entityList.push(arrival);
  step(pool, state, 1);
  assert.deepEqual(pool.slots.slice(1).map((s) => s.entity && s.entity.id).sort(), [2, 3]);

  // A hull that dies hands its lamp on after the fade.
  mid.alive = false;
  step(pool, state, 1);
  assert.deepEqual(pool.slots.slice(1).map((s) => s.entity && s.entity.id).sort(), [2, 8]);
});

test('a lamp follows the drawn hull when the presented root is available', () => {
  const scene = new THREE.Scene();
  const pool = new HeadlightPool(scene);
  const player = ship(1, 0, 0, 0);
  const root = new THREE.Group();
  scene.add(root);
  root.position.set(30, 0, -20);
  root.rotation.y = -Math.PI / 2; // three's +X turned to world +Z
  const state = world([player]);
  step(pool, state, 1, { meshes: new Map([[1, root]]) });
  const lamp = pool.slots[0].light;
  assert.ok(Math.abs(lamp.position.x - 30) < 1e-6, 'x from the drawn root, not the sim pose');
  assert.ok(lamp.position.z > -20 && lamp.target.position.z > lamp.position.z);
});

test('a running power reads as light: the player field first, following its envelope', () => {
  const scene = new THREE.Scene();
  const fields = new FieldForcePresentation(scene);
  const reads = [0, 1].map(() => ({ active: false, score: 0, x: 0, z: 0, radius: 0, level: 0, color: new THREE.Color() }));
  const mine = { id: 'f1', kind: 'well', ownerId: 1, center: { x: 400, z: 0 }, radius: 60, dir: { x: 1, z: 0 } };
  const theirs = { id: 'f2', kind: 'repulsor', ownerId: 9, center: { x: 10, z: 0 }, radius: 40, dir: { x: 1, z: 0 } };
  const state = { simTime: 0, fields: { active: [theirs, mine] }, settings: {} };
  fields.update(1 / 60, state);
  fields.glowRead(reads, 1, 0, 0);
  const igniting = reads[0].level;
  for (let t = 1; t <= 90; t++) { state.simTime = t / 60; fields.update(1 / 60, state); }
  fields.glowRead(reads, 1, 0, 0);
  assert.equal(reads[0].active, true);
  assert.equal(reads[0].x, 400, 'the player\'s own field outranks a nearer one');
  assert.equal(reads[1].x, 10);
  assert.ok(reads[0].level > igniting, 'glow builds with the field');
  assert.ok(reads[0].color.getHex() !== reads[1].color.getHex(), 'each family lights in its own colour');

  state.fields.active = [];
  for (let t = 91; t <= 200; t++) { state.simTime = t / 60; fields.update(1 / 60, state); }
  fields.glowRead(reads, 1, 0, 0);
  assert.ok(reads.every((r) => !r.active), 'the glow dies with the field');
});
