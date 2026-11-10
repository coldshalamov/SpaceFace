import test from 'node:test';
import assert from 'node:assert/strict';
import { bindStuntEvidence, bodyLife, journalFor } from '../src/combat/stuntEvidence.js';
import { sampleProjectileEvidence } from '../src/combat/stuntProjectileEvidence.js';

function harness() {
  const entities = new Map();
  const entityList = [];
  const add = (e) => { entities.set(e.id, e); entityList.push(e); return e; };
  const player = add({
    id: 1, type: 'ship', alive: true, collides: true, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 10, z: 0 },
    surfaceMaterial: 'ship', data: {}, name: 'player',
    mass: 10, radius: 8, hull: 100, hullMax: 100,
  });
  add({
    id: 2, type: 'structure', alive: true, collides: true, rot: 0.1,
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    surfaceMaterial: 'plate', data: { surfaceMaterial: 'plate' },
    name: 'near-plate', mass: 50, radius: 20, hull: 200, hullMax: 200,
  });
  add({
    id: 3, type: 'structure', alive: true, collides: true, rot: 0,
    pos: { x: 900, z: 0 }, vel: { x: 0, z: 0 },
    surfaceMaterial: 'mirror', data: { surfaceMaterial: 'mirror' },
    name: 'far-mirror', mass: 50, radius: 20, hull: 200, hullMax: 200,
  });
  add({
    id: 4, type: 'asteroid', alive: true, collides: true, rot: 0,
    pos: { x: 50, z: 50 }, vel: { x: 0, z: 0 },
    surfaceMaterial: 'rock', data: { surfaceMaterial: 'rock' },
    name: 'rock', mass: 30, radius: 15, hull: 80, hullMax: 80,
  });
  for (let i = 10; i < 200; i++) {
    add({
      id: i, type: 'ship', alive: true, collides: true, rot: 0,
      pos: { x: 300 + (i % 40) * 20, z: 300 + (i % 30) * 20 },
      vel: { x: 0, z: 0 }, surfaceMaterial: 'ship', data: {},
      name: `ship-${i}`, mass: 5, radius: 8, hull: 40, hullMax: 40,
    });
  }
  const state = { tick: 500, mode: 'flight', playerId: 1, entities, entityList };
  bindStuntEvidence(state);
  bodyLife(player, state);
  return state;
}

test('sampleProjectileEvidence records near reflective surfaces only', () => {
  const state = harness();
  sampleProjectileEvidence(state, null);
  const j = journalFor(state);
  const hist = j.projectiles.surfaceHistory;
  const ids = Object.values(hist).map((row) => row.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [2], 'only the near plate is tracked');
  const plateLife = bodyLife(state.entities.get(2), state);
  assert.ok(hist[plateLife.id]);
  assert.equal(hist[plateLife.id].frames.length, 1);
  assert.equal(hist[plateLife.id].frames[0].tick, 500);
});

test('distance-first still advances surface frames on later ticks', () => {
  const state = harness();
  sampleProjectileEvidence(state, null);
  state.tick = 501;
  sampleProjectileEvidence(state, null);
  const j = journalFor(state);
  const plateLife = bodyLife(state.entities.get(2), state);
  assert.equal(j.projectiles.surfaceHistory[plateLife.id].frames.length, 2);
});
