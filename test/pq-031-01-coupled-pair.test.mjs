// PQ-031.01 — Coupled-pair physics: shared inertia, shared helm loss, bounded load, break by rating.
// Seeds 0–4 for orbit/impact. Seed 31001 for helm share and load-break. No headed capture.

import assert from 'node:assert/strict';
import test from 'node:test';

import { HITSTUN_IMPULSE_EVENT } from '../src/combat/impulseKernel.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;
const REST = 80;
const MASS = 16;
const RADIUS = 6;
const ROCK_RADIUS = 18;
const ROCK_X = 220;
const SEEDS = [0, 1, 2, 3, 4];
const TICKS = 480;
const BRIDLE = ATTACHMENT_DEFS.find((def) => def.id === 'attachment_twin_bridle');
const SHARE_SEED = 31001;

test('PQ-031.01 seeds 0-4: Twin Bridle pair orbits and impacts terrain in at least 4 of 5', async () => {
  assert.ok(BRIDLE && BRIDLE.spring && BRIDLE.break);
  const hits = [];
  for (const seed of SEEDS) {
    const result = await runOrbitSeed(seed);
    hits.push(result);
    console.log(
      `PQ-031.01 seed=${seed} hit=${result.hit} spinDeg=${result.spinDeg.toFixed(1)} `
      + `minRock=${result.minRock.toFixed(1)} distSwing=${result.distSwing.toFixed(1)}`,
    );
  }
  const hitCount = hits.filter((row) => row.hit).length;
  const spun = hits.filter((row) => row.spinDeg >= 90).length;
  const loadBound = REST * BRIDLE.spring.maxStretchRatio;
  const bounded = hits.filter((row) => row.distSwing <= loadBound).length;
  assert.ok(Number.isFinite(BRIDLE.break.maxTension) && BRIDLE.break.maxTension > 0,
    'the leftover bridle must break by a finite load rating');
  assert.ok(spun >= 4, `the pair must read as one spinning system in ≥4 seeds, got ${spun}`);
  assert.ok(hitCount >= 4, `bridled lights must lawn-dart terrain in ≥4 of 5 seeds, got ${hitCount}`);
  assert.ok(bounded >= 4,
    `line length swing must stay inside leftover stretch ${loadBound.toFixed(1)}, got ${bounded}`);
});

test('PQ-031.01 seed 31001: a taut bridle shares helm loss and breaks by load rating', async () => {
  const victim = hull(2, 0, 0, MASS);
  const partner = hull(3, 0, REST, MASS);
  const entities = new Map([[victim.id, victim], [partner.id, partner]]);
  const attachment = {
    id: 'bridle_share',
    state: 'active',
    ownerId: victim.id,
    targetId: partner.id,
    defId: 'attachment_twin_bridle',
    physicsHandle: 'h1',
  };
  const emitted = [];
  const bus = {
    emit(name, payload) { emitted.push({ name, payload }); },
    on() { return () => {}; },
  };
  const system = Object.create(tetherGameplay);
  system.state = {
    mode: 'flight',
    tick: 12,
    simTime: 0.2,
    seed: SHARE_SEED,
    playerId: 1,
    entities,
    entityList: [victim, partner],
    combat: { attachments: { byId: { bridle_share: attachment } } },
    player: {},
    input: { actions: {} },
  };
  system.bus = bus;
  system.helpers = {
    combatPhysics: {
      getAttachmentTelemetry: () => ({
        attachmentId: 'bridle_share',
        phase: 'loaded',
        stretch: 4,
        distance: REST,
        relativeSpeed: 2,
      }),
    },
  };

  const shared = system._shareHelmLoss({
    victimId: victim.id,
    source: 'collision',
    deltaV: 40,
    dirX: 0,
    dirZ: 1,
  });
  assert.equal(shared, 1, 'a taut bridle must hand the partner a share of the helm loss');
  const published = emitted.find((entry) => entry.name === HITSTUN_IMPULSE_EVENT
    && entry.payload.victimId === partner.id);
  assert.ok(published, 'the partner receives a published hitstun intent, never a written velocity');
  const mu = (MASS * MASS) / (MASS + MASS);
  assert.ok(Math.abs(published.payload.deltaV - 40 * (mu / MASS)) < 1e-9,
    'the share is the coupled inertia the rope already carries');
  assert.deepEqual(partner.vel, { x: 0, z: 0 }, 'the rope never writes the other hull\'s velocity');

  const overload = await runOverloadSeed();
  console.log(
    `PQ-031.01 seed=${SHARE_SEED} shareDv=${published.payload.deltaV.toFixed(3)} `
    + `breakRequested=${overload.breakRequested} tension=${overload.tension.toFixed(1)} `
    + `rating=${BRIDLE.break.maxTension}`,
  );
  assert.equal(overload.breakRequested, true, 'a hard swing must request a break by the leftover rating');
  assert.ok(overload.tension >= BRIDLE.break.maxTension,
    `tension ${overload.tension} must meet leftover rating ${BRIDLE.break.maxTension}`);
});

async function runOrbitSeed(seed) {
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
      break: BRIDLE.break,
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

async function runOverloadSeed() {
  const a = makeBody('a', -30, 0, MASS, 0, 220);
  const b = makeBody('b', 30, 0, MASS, 0, -220);
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([a, b]);
    const handle = runtime.createAttachment({
      attachmentId: 'bridle-overload',
      defId: 'attachment_twin_bridle',
      ownerId: a.id,
      targetId: b.id,
      sourceWorld: a.pos,
      targetWorld: b.pos,
      restLength: 60,
      spring: BRIDLE.spring,
      break: BRIDLE.break,
      tick: 0,
    });
    assert.ok(handle, 'overload seed must create the bridle');
    let peak = { breakRequested: false, tension: 0 };
    for (let tick = 0; tick < 180; tick += 1) {
      writePhysicsControl(a, idleControl());
      writePhysicsControl(b, idleControl());
      runtime.step(DT);
      const telemetry = runtime.getAttachmentTelemetry({ attachmentId: 'bridle-overload' });
      if (telemetry && telemetry.tension > peak.tension) {
        peak = {
          breakRequested: !!telemetry.breakRequested,
          tension: telemetry.tension,
        };
      }
      if (telemetry && telemetry.breakRequested) {
        return { breakRequested: true, tension: telemetry.tension };
      }
    }
    return peak;
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

function hull(id, x, z, mass) {
  return {
    id,
    type: 'ship',
    alive: true,
    rot: 0,
    angVel: 0,
    pos: { x, z },
    prevPos: { x, z },
    vel: { x: 0, z: 0 },
    radius: 14,
    mass,
    physicsBody: {
      schemaVersion: 1,
      radius: 14,
      mass,
      inertiaY: 40,
      dynamic: true,
      ccd: false,
      material: 'ship',
      revision: 0,
    },
    data: { derived: { propulsion: { combatSpeed: 105 } } },
  };
}
