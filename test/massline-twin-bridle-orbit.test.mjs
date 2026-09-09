// PQ-031.01 — Coupled-pair physics: a Twin Bridle pair orbits as one system and hits terrain.
// Range stays untouched; no headed capture. Five seeds, four must lawn-dart a rock.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';

const DT = 1 / 60;
const REST = 80;
const MASS = 16;
const RADIUS = 6;
const ROCK_RADIUS = 18;
const ROCK_X = 220;
const SEEDS = [0, 1, 2, 3, 4];
// 300 ticks only covers the approach chord. COM drift 42 needs ~5.2s to reach the
// rock and another second for the receding hull to sweep it, so 480 ticks.
const TICKS = 480;
const BRIDLE = ATTACHMENT_DEFS.find((def) => def.id === 'attachment_twin_bridle');

test('Twin Bridle pair orbits and impacts terrain in at least 4 of 5 seeds', async () => {
  assert.ok(BRIDLE && BRIDLE.spring && BRIDLE.break);
  const hits = [];
  for (const seed of SEEDS) {
    const result = await runSeed(seed);
    hits.push(result);
    console.log(
      `PQ-031.01 seed=${seed} hit=${result.hit} spinDeg=${result.spinDeg.toFixed(1)} `
      + `minRock=${result.minRock.toFixed(1)} distSwing=${result.distSwing.toFixed(1)}`,
    );
  }
  const hitCount = hits.filter((row) => row.hit).length;
  const spun = hits.filter((row) => row.spinDeg >= 90).length;
  assert.ok(spun >= 4, `the pair must read as one spinning system in ≥4 seeds, got ${spun}`);
  assert.ok(hitCount >= 4, `bridled lights must lawn-dart terrain in ≥4 of 5 seeds, got ${hitCount}`);
});

async function runSeed(seed) {
  const phase = seed * (Math.PI * 2) / SEEDS.length;
  const half = REST * 0.5;
  const a = makeBody('a', Math.cos(phase) * half, Math.sin(phase) * half, MASS, 0, 0);
  const b = makeBody('b', -a.pos.x, -a.pos.z, MASS, 0, 0);
  const spin = 55;
  a.vel.x = -Math.sin(phase) * spin + 42;
  a.vel.z = Math.cos(phase) * spin;
  b.vel.x = Math.sin(phase) * spin + 42;
  b.vel.z = -Math.cos(phase) * spin;
  const rock = makeBody('rock', ROCK_X, 0, 4000, 0, 0);
  rock.type = 'asteroid';
  rock.radius = ROCK_RADIUS;
  rock.physicsBody.radius = ROCK_RADIUS;
  rock.physicsBody.mass = 4000;
  rock.physicsBody.dynamic = false;
  rock.physicsBody.ccd = false;

  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([a, b, rock]);
    const handle = runtime.createAttachment({
      attachmentId: `bridle-${seed}`,
      defId: 'attachment_twin_bridle',
      ownerId: a.id,
      targetId: b.id,
      sourceWorld: a.pos,
      targetWorld: b.pos,
      restLength: REST,
      spring: BRIDLE.spring,
      tick: 0,
    });
    assert.ok(handle, `seed ${seed} must create the bridle`);

    let minDist = Infinity;
    let maxDist = 0;
    let minRock = Infinity;
    let spinRad = 0;
    let prevAngle = Math.atan2(a.pos.z - b.pos.z, a.pos.x - b.pos.x);
    for (let tick = 0; tick < TICKS; tick += 1) {
      writePhysicsControl(a, idleControl());
      writePhysicsControl(b, idleControl());
      runtime.step(DT);
      const dist = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
      minDist = Math.min(minDist, dist);
      maxDist = Math.max(maxDist, dist);
      const rockA = Math.hypot(a.pos.x - rock.pos.x, a.pos.z - rock.pos.z) - (RADIUS + ROCK_RADIUS);
      const rockB = Math.hypot(b.pos.x - rock.pos.x, b.pos.z - rock.pos.z) - (RADIUS + ROCK_RADIUS);
      minRock = Math.min(minRock, rockA, rockB);
      const angle = Math.atan2(a.pos.z - b.pos.z, a.pos.x - b.pos.x);
      let step = angle - prevAngle;
      while (step > Math.PI) step -= Math.PI * 2;
      while (step < -Math.PI) step += Math.PI * 2;
      spinRad += step;
      prevAngle = angle;
    }
    return {
      hit: minRock <= 0,
      spinDeg: Math.abs(spinRad) * 180 / Math.PI,
      minRock,
      distSwing: maxDist - minDist,
    };
  } finally {
    runtime.dispose();
  }
}

function idleControl() {
  return {
    source: 'pq-031-01-orbit',
    mode: 'newtonian',
    force: { x: 0, y: 0, z: 0 },
    torque: { x: 0, y: 0, z: 0 },
    maxSpeed: Infinity,
  };
}

function makeBody(id, x, z, mass, vx, vz) {
  return {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    radius: RADIUS,
    mass,
    maxSpeed: 260,
    physicsBody: {
      schemaVersion: 1,
      radius: RADIUS,
      mass,
      inertiaY: mass * 4,
      dynamic: true,
      ccd: true,
      revision: 0,
    },
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot: 0,
    angVel: 0,
    data: {},
  };
}
