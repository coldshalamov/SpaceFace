import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { tableVfxDrawWuFromState } from '../src/render/tabletopPolicy.js';
import { PROJECTILE_DRAW_PAD_WU } from '../src/combat/projectileFlight.js';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';
import { WeaponRibbonPool } from '../src/render/weapons/ribbonPool.js';

function projectile(id, x, ownerId = 'npc') {
  return {
    id,
    ownerId,
    type: 'projectile',
    alive: true,
    team: ownerId === 'pilot' ? 0 : 1,
    pos: { x, z: 0 },
    prevPos: { x, z: 0 },
    vel: { x: 320, z: 0 },
    data: { weaponId: 'wpn_pulse_laser_s', damageType: 'energy' },
  };
}

function harness(projectiles, targetId = null) {
  const pilot = { id: 'pilot', pos: { x: 0, z: 0 } };
  const state = {
    playerId: 'pilot',
    player: { targetId },
    entityList: projectiles,
    entities: new Map([['pilot', pilot]]),
    camera: {
      liveZoom: 330,
      zoom: 330,
      fov: 50,
      aspect: 16 / 9,
      tilt: 60,
      focus: { x: 0, z: 0 },
    },
    settings: { video: { fov: 50 }, accessibility: {} },
    render: { meshes: new Map() },
  };
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 4000);
  camera.position.set(0, 0, 0);
  const presenter = new WeaponVfxPresenter({ scene: null });
  const update = () => presenter.update(1 / 60, {
    state,
    camera,
    interpolationAlpha: 1,
    viewportHeight: 1000,
  });
  return { presenter, state, update };
}

function ribbonHeadX(presenter, entityId) {
  const slot = presenter.ribbons.byEntity.get(entityId);
  assert.notEqual(slot, undefined, `expected ribbon for projectile ${entityId}`);
  return presenter.ribbons.hist[slot * presenter.ribbons.segments * 3];
}

test('ribbon advances beyond the obsolete 520-WU cutoff while still inside the live table', () => {
  const shot = projectile(10, 500);
  const { presenter, state, update } = harness([shot]);
  try {
    const drawWu = tableVfxDrawWuFromState(state);
    assert.ok(drawWu > 554, 'fixture requires the live table to include the 554-WU visible corner');
    update();
    shot.prevPos.x = shot.pos.x;
    shot.pos.x = 554;
    update();
    assert.equal(ribbonHeadX(presenter, shot.id), 554);
  } finally {
    presenter.dispose();
  }
});

test('non-priority ribbon begins releasing after it leaves the live table envelope', () => {
  const shot = projectile(11, 500);
  const { presenter, state, update } = harness([shot]);
  try {
    update();
    const drawWu = tableVfxDrawWuFromState(state);
    shot.prevPos.x = shot.pos.x;
    shot.pos.x = drawWu + PROJECTILE_DRAW_PAD_WU + 8;
    update();
    const slot = presenter.ribbons.byEntity.get(shot.id);
    assert.notEqual(slot, undefined, 'released ribbon should remain briefly while it fades');
    assert.ok(presenter.ribbons.lingerAge[slot] > 0, 'off-table ribbon must enter its release fade');
  } finally {
    presenter.dispose();
  }
});

test('rapid frame re-entry starts a fresh wake while the old wake fades', () => {
  const shot = projectile(14, 500);
  const { presenter, state, update } = harness([shot]);
  try {
    update();
    const oldSlot = presenter.ribbons.byEntity.get(shot.id);
    shot.prevPos.x = shot.pos.x;
    shot.pos.x = tableVfxDrawWuFromState(state) + PROJECTILE_DRAW_PAD_WU + 8;
    update();
    assert.ok(presenter.ribbons.lingerAge[oldSlot] > 0);
    shot.prevPos.x = shot.pos.x; shot.pos.x = -500;
    update();
    const newSlot = presenter.ribbons.byEntity.get(shot.id);
    assert.notEqual(newSlot, oldSlot);
    const base = newSlot * presenter.ribbons.segments * 3;
    assert.equal(presenter.ribbons.hist[base], -500);
    assert.equal(presenter.ribbons.hist[base + 3], -500, 'new history does not bridge the old position');
    assert.equal(presenter.ribbons.alive[oldSlot], 1, 'the old wake keeps fading');
    for (let i = 0; i < 30; i++) update();
    assert.equal(presenter.ribbons.alive[oldSlot], 0);
    assert.equal(presenter.ribbons.byEntity.get(shot.id), newSlot, 'old retirement cannot remove the new mapping');
  } finally { presenter.dispose(); }
});

test('a full ribbon pool reuses a detached wake without losing its new mapping', () => {
  const pool = new WeaponRibbonPool(null, { capacity: 1 });
  try {
    pool.spawn({ entityId: 14, x: 500, y: 0, z: 0 });
    pool.release(14); pool.detachReleased(14);
    const slot = pool.spawn({ entityId: 14, x: -500, y: 0, z: 0 });
    assert.equal(slot, 0);
    assert.equal(pool.live, 1);
    assert.equal(pool.byEntity.get(14), 0);
    assert.equal(pool.hist[0], -500);
    assert.equal(pool.hist[3], -500);
    assert.equal(pool.lingerAge[0], 0);
  } finally { pool.dispose(); }
});

for (const priority of [
  { name: 'player', ownerId: 'pilot', targetId: null },
  { name: 'current target', ownerId: 'foe', targetId: 'foe' },
]) {
  test(`${priority.name} projectile ribbon releases past the padded frame`, () => {
    const { presenter, state, update } = harness([], priority.targetId);
    const drawWu = tableVfxDrawWuFromState(state);
    const shot = projectile(
      priority.ownerId === 'pilot' ? 12 : 13,
      drawWu + PROJECTILE_DRAW_PAD_WU + 24,
      priority.ownerId,
    );
    state.entityList.push(shot);
    try {
      update();
      const slot = presenter.ribbons.byEntity.get(shot.id);
      assert.equal(slot, undefined, 'an off-frame ribbon is not drawn, whoever fired it');
    } finally {
      presenter.dispose();
    }
  });
}
