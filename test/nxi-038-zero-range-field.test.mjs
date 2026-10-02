import test from 'node:test';
import assert from 'node:assert/strict';
import { bombRadialDirection } from '../src/combat/bombDynamics.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { bombScenario } from './helpers/bombScenario.mjs';

test('coincident centers resolve to a finite zero radial, not a stand-in axis', () => {
  const zero = bombRadialDirection(0, 0);
  assert.deepEqual(zero, { x: 0, z: 0, dist: 0 });
  assert.ok(Number.isFinite(zero.x) && Number.isFinite(zero.z));
  assert.deepEqual(bombRadialDirection(NaN, 4), { x: 0, z: 0, dist: 0 });
  const unit = bombRadialDirection(3, 4);
  assert.ok(Math.abs(unit.x - 0.6) < 1e-12);
  assert.ok(Math.abs(unit.z - 0.8) < 1e-12);
  assert.ok(Math.abs(unit.dist - 5) < 1e-12);
});

test('a blast on a body at the field center does not invent a shove', () => {
  const t = bombScenario();
  try {
    const victim = t.spawn({ pos: { x: 10, z: -4 }, radius: 6, mass: 32 });
    const before = { x: victim.pos.x, z: victim.pos.z };
    t.system._targets = [victim];
    const result = t.system._blastVictims(t.state, {
      pos: { x: victim.pos.x, z: victim.pos.z },
      def: BOMB_DEFS.bomb_scrambler,
      ownerId: t.player.id,
      originId: -1,
      trigger: 'fuze',
    });
    assert.equal(t.impulses.length, 0, 'overlap does not apply an impulse');
    assert.equal(result.shoves.length, 0);
    assert.equal(victim.pos.x, before.x);
    assert.equal(victim.pos.z, before.z);
    assert.ok(t.damage.some((row) => row.targetId === victim.id), 'center overlap still deals the payload');
  } finally {
    t.close();
  }
});

test('an offset concussion still shoves outward through the physics authority', () => {
  const t = bombScenario();
  try {
    const victim = t.spawn({ pos: { x: 40, z: 0 }, radius: 6, mass: 32 });
    t.system._targets = [victim];
    t.system._blastVictims(t.state, {
      pos: { x: 0, z: 0 },
      def: BOMB_DEFS.bomb_concussion,
      ownerId: t.player.id,
      originId: -1,
      trigger: 'fuze',
    });
    const imp = t.impulses.find((row) => row.entityId === victim.id);
    assert.ok(imp, 'offset victim is shoved');
    assert.ok(imp.impulse.x > 1000, `outward impulse, got ${imp.impulse.x}`);
    assert.ok(Number.isFinite(imp.impulse.z));
    assert.equal(t.damage.length, 0, 'a concussion still routes no damage');
  } finally {
    t.close();
  }
});

test('a singularity centered on a hull queues no pull and still pulls an offset hull', () => {
  const t = bombScenario();
  try {
    const overlapped = t.spawn({ pos: { x: 5, z: 5 }, vel: { x: 1, z: 0 }, radius: 6, mass: 32 });
    const offset = t.spawn({ pos: { x: 35, z: 5 }, vel: { x: 0, z: 0 }, radius: 6, mass: 32 });
    const bomb = {
      id: -1,
      alive: true,
      pos: { x: 5, z: 5 },
      vel: { x: 0, z: 0 },
      data: {
        bombId: 'bomb_singularity',
        fieldStartedAt: 0,
        nextFieldTick: 0,
        ownerId: t.player.id,
      },
    };
    t.state.simTime = 0.05;
    t.state.tick = 1;
    t.system._targets = [overlapped, offset];
    t.system._tickField(bomb, t.state, 1 / 60);
    const onCenter = consumePhysicsCommand(overlapped);
    assert.equal(onCenter, null, 'exact overlap does not queue a pull');
    assert.equal(overlapped.pos.x, 5);
    assert.equal(overlapped.pos.z, 5);
    assert.ok(Number.isFinite(overlapped.vel.x) && Number.isFinite(overlapped.vel.z));
    const pulled = consumePhysicsCommand(offset);
    assert.ok(pulled && pulled.impulses.length === 1, 'offset hull still feels the well');
    assert.ok(pulled.impulses[0].x < 0, 'pull points toward the slug');
    assert.ok(Number.isFinite(pulled.impulses[0].x) && Number.isFinite(pulled.impulses[0].z));
  } finally {
    t.close();
  }
});
