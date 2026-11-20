// Ships pop from the floor (2026-11-20): every live ship gets a dark contact pool and a team ring in
// one draw; hostiles read as broken red arcs, the player as a full warm ring plus a heading chevron.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShipMarkers, TEAM_COLORS } from '../src/render/vfx/kit/shipMarkers.js';

const toLocal = (x, z, out) => { out.x = x; out.z = z; return out; };

test('one draw: pool + ring per ship, chevron for the player, team colours by side', () => {
  const m = new ShipMarkers(new THREE.Scene());
  const me = { id: 1, type: 'ship', team: 1, alive: true, pos: { x: 0, z: 0 }, radius: 12, rot: 0, isPlayer: true };
  const foe = { id: 2, type: 'ship', team: 2, alive: true, pos: { x: 100, z: 0 }, radius: 10, rot: 1 };
  const trader = { id: 3, type: 'ship', team: 0, alive: true, pos: { x: -100, z: 0 }, radius: 10, rot: 0 };
  const rock = { id: 4, type: 'asteroid', alive: true, pos: { x: 0, z: 50 }, radius: 20 };
  const state = { playerId: 1, entities: new Map([[1, me]]), entityList: [me, foe, trader, rock] };
  assert.equal(m.update(state, toLocal), 7, 'player 3 quads, each other ship 2, rocks none');
  assert.equal(m.geometry.instanceCount, 7);
  assert.equal(m.b[4 * 4 + 0], Math.fround(TEAM_COLORS.hostile[0]), 'the hostile ring is red');
  assert.equal(m.b[4 * 4 + 3], 2, 'the hostile ring is the broken-arc threat ring');
  assert.equal(m.b[2 * 4 + 3], 3, 'the player has a heading chevron');
  assert.equal(m.material.depthWrite, false);
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
