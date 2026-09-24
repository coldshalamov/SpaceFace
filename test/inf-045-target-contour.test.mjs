import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  TARGET_CONTOUR_RENDER_ORDER,
  TargetContour,
  resolveTargetContour,
} from '../src/render/targetContour.js';

// INF-045 — the lock target keeps a disciplined world-space contour, so its position and
// hostile tell read through a Well without dimming the effect itself.

function ship(id, team, x = 100, z = -40, radius = 12, hostile = false) {
  return {
    id, type: 'ship', alive: true, team,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, radius, mass: 60,
    hull: 100, hullMax: 100, shield: 0, shieldMax: 0, flags: {},
    data: hostile ? { ai: { huntPlayer: true } } : {},
  };
}

function stateFor(playerTeam, target, gunTarget = null) {
  const entities = new Map([[1, ship(1, playerTeam, 0, 0)]]);
  entities.get(1).player = true;
  if (target) entities.set(target.id, target);
  if (gunTarget) entities.set(gunTarget.id, gunTarget);
  return {
    mode: 'flight',
    playerId: 1,
    player: { targetId: target ? target.id : null, gunTargetId: gunTarget ? gunTarget.id : null, team: playerTeam },
    entities,
    entityList: [...entities.values()],
  };
}

test('INF-045: the live selection subjects the contour with its hull read', () => {
  const target = ship(7, 1, 100, -40, 12, true);
  const resolved = resolveTargetContour(stateFor(0, target));
  assert.deepEqual(resolved, { id: 7, x: 100, z: -40, radius: 12, hostile: true });
});

test('INF-045: the engaged contact subjects only with no live selection', () => {
  const dead = ship(7, 1);
  dead.alive = false;
  const guns = ship(9, 1, -30, 55, 8, true);
  const resolved = resolveTargetContour(stateFor(0, dead, guns));
  assert.deepEqual(resolved, { id: 9, x: -30, z: 55, radius: 8, hostile: true });
  assert.equal(resolveTargetContour(stateFor(0, null, null)), null, 'no subject, no contour');
});

test('INF-045: friendlies contour cyan, hostiles red — same shape either way', () => {
  const foe = resolveTargetContour(stateFor(0, ship(7, 1, 100, -40, 12, true)));
  const friend = resolveTargetContour(stateFor(0, ship(8, 0)));
  assert.equal(foe.hostile, true);
  assert.equal(friend.hostile, false);
  const scene = new THREE.Scene();
  const contour = new TargetContour(scene);
  try {
    contour.setTarget(0, 0, 12, true);
    const hostileColor = contour.mesh.material.color.getHex();
    const hostileScale = contour.mesh.scale.x;
    contour.setTarget(0, 0, 12, false);
    assert.notEqual(contour.mesh.material.color.getHex(), hostileColor, 'faction rides tint alone');
    assert.equal(contour.mesh.scale.x, hostileScale, 'geometry stays disciplined across factions');
  } finally { contour.dispose(); }
});

test('INF-045: the contour draws after field surfaces yet loses to real occluders', () => {
  const contour = new TargetContour(new THREE.Scene());
  try {
    assert.equal(contour.mesh.renderOrder, TARGET_CONTOUR_RENDER_ORDER);
    assert.ok(TARGET_CONTOUR_RENDER_ORDER > 16, 'after the field force surfaces (16)');
    assert.equal(contour.mesh.material.depthTest, true, 'hulls and rock still occlude');
    assert.equal(contour.mesh.material.depthWrite, false, 'the contour itself hides nothing');
    assert.equal(contour.mesh.material.transparent, true);
  } finally { contour.dispose(); }
});

test('INF-045: the contour follows, sizes, hides, and survives a rebase', () => {
  const scene = new THREE.Scene();
  const contour = new TargetContour(scene);
  try {
    assert.equal(contour.mesh.visible, false);
    assert.equal(scene.children.length, 1);
    assert.equal(contour.setTarget(30, -25, 10, true), true);
    assert.equal(contour.mesh.visible, true);
    assert.equal(contour.mesh.position.x, 30);
    assert.equal(contour.mesh.position.z, -25);
    assert.ok(contour.mesh.scale.x > 10, 'ring clears the hull');
    contour.reproject(100, -50);
    assert.equal(contour.mesh.position.x, 130);
    assert.equal(contour.mesh.position.z, -75);
    contour.clear();
    assert.equal(contour.mesh.visible, false);
    assert.equal(contour.setTarget(NaN, 0, 10, true), false, 'bad fix refuses instead of teleporting');
    const inspection = contour.inspect();
    assert.equal(inspection.schema, 'spaceface.target-contour.v1');
    assert.equal(inspection.visible, false);
  } finally {
    contour.dispose();
    contour.dispose();
    assert.equal(scene.children.length, 0);
  }
});

test('INF-045: identity ignores the flash budget entirely', () => {
  const contour = new TargetContour(new THREE.Scene());
  try {
    contour.setTarget(0, 0, 10, true);
    assert.equal(contour.mesh.material.opacity, 0.9, 'no flash scale, no dimming path');
  } finally { contour.dispose(); }
});
