// Ships pop from the floor (2026-11-20): every live ship gets a dark contact pool and a team ring in
// one draw; hostiles read as broken red arcs, the player as a full warm ring plus a heading chevron.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShipMarkers, TEAM_COLORS } from '../src/render/vfx/kit/shipMarkers.js';

const toLocal = (x, z, out) => { out.x = x; out.z = z; return out; };

// The game's teams: the player flies team 0, enemies team 1, civilian traffic team 2.
test('one draw: pool + ring per ship, chevron for the player, team colours by side', () => {
  const m = new ShipMarkers(new THREE.Scene());
  const me = { id: 1, type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, radius: 12, rot: 0, isPlayer: true };
  const foe = { id: 2, type: 'ship', team: 1, alive: true, pos: { x: 100, z: 0 }, radius: 10, rot: 1 };
  const trader = { id: 3, type: 'ship', team: 2, alive: true, pos: { x: -100, z: 0 }, radius: 10, rot: 0 };
  const rock = { id: 4, type: 'asteroid', alive: true, pos: { x: 0, z: 50 }, radius: 20 };
  const state = { playerId: 1, entities: new Map([[1, me]]), entityList: [me, foe, trader, rock] };
  assert.equal(m.update(state, toLocal), 7, 'player 3 quads, each other ship 2, rocks none');
  assert.equal(m.geometry.instanceCount, 7);
  assert.equal(m.b[4 * 4 + 0], Math.fround(TEAM_COLORS.hostile[0]), 'the hostile ring is red');
  assert.equal(m.b[4 * 4 + 3], 2, 'the hostile ring is the broken-arc threat ring');
  assert.equal(m.b[6 * 4 + 0], Math.fround(TEAM_COLORS.neutral[0]), 'civilian traffic wears the cool neutral ring');
  assert.equal(m.b[6 * 4 + 3], 1, 'a civilian ring is whole, never a threat ring');
  assert.equal(m.b[2 * 4 + 3], 3, 'the player has a heading chevron');
  assert.equal(m.material.depthWrite, false);
  m.dispose();
});

test('a working harbour reads calm: civilian traffic and passive lesson bodies wear no threat ring', () => {
  const m = new ShipMarkers(new THREE.Scene());
  const me = { id: 1, type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, radius: 12, rot: 0, isPlayer: true };
  const tug = { id: 2, type: 'ship', team: 2, alive: true, pos: { x: 100, z: 0 }, radius: 10, data: { trafficRole: 'tug' } };
  const scout = { id: 3, type: 'ship', team: 1, alive: true, pos: { x: 200, z: 0 }, radius: 8, data: { ai: { passive: true } } };
  const state = { playerId: 1, entities: new Map([[1, me]]), entityList: [me, tug, scout] };
  m.update(state, toLocal);
  for (let i = 3; i < m.count; i++) assert.notEqual(m.b[i * 4 + 3], 2, `quad ${i} is not a threat ring`);
  m.dispose();
});

test('dead and docked ships carry no marker; an empty frame hides the draw', () => {
  const m = new ShipMarkers(new THREE.Scene());
  const state = { playerId: 1, entities: new Map(), entityList: [
    { id: 2, type: 'ship', team: 2, alive: false, pos: { x: 0, z: 0 } },
    { id: 3, type: 'ship', team: 2, alive: true, flags: { docked: true }, pos: { x: 0, z: 0 } },
  ] };
  assert.equal(m.update(state, toLocal), 0);
  assert.equal(m.mesh.visible, false);
  m.dispose();
});

test('enemy markers name the job by shape; fodder is faint; the player ring fades out in calm flight', () => {
  const m = new ShipMarkers(new THREE.Scene());
  const me = { id: 1, type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, radius: 12, rot: 0, isPlayer: true };
  const wasp = { id: 2, type: 'ship', team: 1, alive: true, pos: { x: 100, z: 0 }, radius: 6, data: { enemyTypeId: 'wasp_swarmer' } };
  const sniper = { id: 3, type: 'ship', team: 1, alive: true, pos: { x: 200, z: 0 }, radius: 10, data: { enemyTypeId: 'lancer_sniper' } };
  const state = { playerId: 1, entities: new Map([[1, me]]), entityList: [me, wasp, sniper] };
  m.update(state, toLocal, 0, false, null, 'fight');
  const ringOf = (i) => ({ pattern: m.c[i * 4 + 2], alpha: m.c[i * 4 + 1] });
  // order: player pool, ring, chevron, wasp pool, wasp ring, sniper pool, sniper ring
  assert.equal(ringOf(4).pattern, 1, 'a rusher wears the three-arc fodder ring');
  assert.ok(ringOf(4).alpha < 0.5, 'and it is faint, so thirty wasps are not thirty loud rings');
  assert.equal(ringOf(6).pattern, 3, 'a sniper wears the two-bracket reach ring');
  for (let i = 0; i < 40; i++) m.update(state, toLocal, 0.05 * (i + 1), false, null, 'calm');
  let ringQuads = 0;
  for (let i = 0; i < m.count; i++) if (m.b[i * 4 + 3] === 1) ringQuads++;
  assert.equal(ringQuads, 0, 'in calm flight the player ring is gone; only the heading chevron stays');
  m.dispose();
});
