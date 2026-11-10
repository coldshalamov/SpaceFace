// inf-tether-field-ab — the named Lane-2 investigation, settled by a fixed-seed sim A/B.
//
// A towed/latched pair (heavy tug leading, light payload trailing on a tether_standard rope)
// crosses a field zone. The question the board reserved: does the constraint law treat both
// bodies honestly inside the field — the rope carries the DIFFERENTIAL pull as readable load
// — or does one body get flung through the other?
//
// Arms, same initial conditions, same per-tick production field law (fields.js _applyForces:
// accel = sampleFieldAcceleration per body, impulse = a·m·dt through queuePhysicsImpulse):
//   A (latched): tug + payload joined by the tether_standard rope joint inside SG-02.
//   B (free):    the same two hulls, no rope — the uncoupled baseline.
// Fields exercised:
//   well — a head-on crossing (light payload enters first, couples ~12× harder, yanks the
//          line taut; at exit the payload sheds the pull faster and the tug catches up —
//          the compressive moment where a pass-through would show).
//   current (CONE) — a lateral push across the tow axis (the fling stress).
// Honesty claims proven here:
//   1. The room reaches a latched pair: both members bend into the field exactly as the
//      coupling law says (light couples more; heavy shrugs; the rope drags the heavy in).
//   2. Constraint forces are internal: the latched pair's measured COM shift matches the
//      accumulated external field impulses alone — the rope adds no net momentum.
//   3. Nobody is flung through anybody: surface gap stays positive, line length stays
//      inside the authored stretch envelope, no per-tick step beyond honest speed.
//   4. The line tells: tension rises from its slack baseline while the differential pull
//      bites — the rope is a readable instrument, not a ghost.
//   5. Determinism: the same seed replays identically.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse, writePhysicsControl } from '../src/core/physicsAuthority.js';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { FIELD_MAX_ACCEL } from '../src/data/fields.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';

const DT = 1 / 60;
const REST = 64;
const TUG_MASS = 400;    // coupling 12/400 -> floor 0.05 (the heavy shrug)
const LOAD_MASS = 12;    // coupling 12/12 = 1.0 (the light feels it fully)
const RADIUS = 6;
const ENTRY_SPEED = 70;
const TICKS = 900;       // 15 s: entry, transit, exit, catch-up
const TETHER_DEF = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');

const WELL = () => normalizeField({
  id: 'ab-well', kind: 'well', center: { x: 320, z: 55 },
  radius: 170, strength: 620, falloff: 1, createdAt: 0, durationS: Infinity,
});

const CURRENT = () => normalizeField({
  id: 'ab-current', kind: 'cone', center: { x: 60, z: -170 },
  dir: { x: 0, z: 1 }, radius: 240, strength: 340, falloff: 1,
  halfAngleRad: Math.PI * 0.45, createdAt: 0, durationS: Infinity,
});

function makeBody(id, x, z, mass, vx, vz) {
  return {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    radius: RADIUS,
    mass,
    maxSpeed: 400,
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

function pair(seed) {
  // Tug leads on +x, payload trails exactly one rope behind, both on the same course.
  const tug = makeBody('tug', -300, 0, TUG_MASS, ENTRY_SPEED, 0);
  const load = makeBody('load', -300 - REST, 0, LOAD_MASS, ENTRY_SPEED, 0);
  // A fixed-seed nudge on the entry bearing so the arms are not one geometry.
  const phase = seed * 0.35;
  tug.vel.z = Math.sin(phase) * 8;
  load.vel.z = Math.sin(phase) * 8;
  return { tug, load };
}

// The production force seam, lifted from src/systems/fields.js _applyForces: per-body
// coupling-scaled acceleration, then p = a·m·dt through the one membrane write.
function applyFieldImpulse(entity, fields, time, tag) {
  const profile = { mass: entity.physicsBody.mass, type: entity.type, id: entity.id };
  const accel = sampleFieldAcceleration(entity.pos, entity.vel, fields, time, profile);
  if (accel.ax === 0 && accel.az === 0) return { ax: 0, az: 0, queued: false };
  const mass = entity.physicsBody.mass;
  const queued = queuePhysicsImpulse(entity, {
    x: accel.ax * mass * DT, y: 0, z: accel.az * mass * DT,
  }, { tag, tick: Math.round(time / DT), continuous: true, dt: DT, externalEffect: true });
  return { ax: accel.ax, az: accel.az, queued: queued === true };
}

async function runArm({ latched, field, seed, tag }) {
  const { tug, load } = pair(seed);
  const bodies = [tug, load];
  const totalMass = TUG_MASS + LOAD_MASS;
  const v0Com = {
    x: (tug.vel.x * TUG_MASS + load.vel.x * LOAD_MASS) / totalMass,
    z: (tug.vel.z * TUG_MASS + load.vel.z * LOAD_MASS) / totalMass,
  };
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities(bodies);
    let handle = null;
    if (latched) {
      handle = runtime.createAttachment({
        attachmentId: `${tag}-rope`,
        defId: 'tether_standard',
        ownerId: tug.id,
        targetId: load.id,
        sourceWorld: tug.pos,
        targetWorld: load.pos,
        restLength: REST,
        spring: TETHER_DEF.spring,
        break: TETHER_DEF.break,
        tick: 0,
      });
      assert.ok(handle, 'the rope must attach for the latched arm');
    }

    const fields = [field()];
    const well = fields[0];
    const trace = {
      minGap: Infinity,               // surface gap between the two hulls (negative = overlap)
      maxLineLength: 0,               // rope distance; bounded by REST * (1 + maxStretchRatio)
      maxStep: 0,                     // largest per-tick displacement (teleport detector)
      maxSpeed: 0,
      tugMaxSpeed: 0, loadMaxSpeed: 0,
      peakTension: 0,
      slackTension: Infinity,         // tension before the field ever bites
      tensionBites: false,            // tension rose materially above the slack baseline
      tugBent: false, loadBent: false,
      tugMinFieldDist: Infinity, loadMinFieldDist: Infinity,
      fieldImpulseTicks: 0,
      // Internal-force bookkeeping: expected end COM velocity from external impulses only.
      sumJX: 0, sumJZ: 0,
    };
    const fieldDist = (b) => Math.hypot(b.pos.x - well.center.x, b.pos.z - well.center.z);
    const tugStart = fieldDist(tug);
    const loadStart = fieldDist(load);
    const comStart = {
      x: (tug.pos.x * TUG_MASS + load.pos.x * LOAD_MASS) / totalMass,
      z: (tug.pos.z * TUG_MASS + load.pos.z * LOAD_MASS) / totalMass,
    };
    const fieldBitesAtTick = Math.round(0.6 / DT); // force in range well before first entry

    for (let tick = 0; tick < TICKS; tick += 1) {
      const time = tick * DT;
      let anyForce = false;
      for (const body of bodies) {
        const applied = applyFieldImpulse(body, fields, time, tag);
        if (applied.queued) {
          anyForce = true;
          trace.sumJX += applied.ax * body.physicsBody.mass * DT;
          trace.sumJZ += applied.az * body.physicsBody.mass * DT;
        }
      }
      if (anyForce) trace.fieldImpulseTicks += 1;

      // Controls keep the command channel well-formed (no thrust in either arm).
      for (const body of bodies) {
        writePhysicsControl(body, {
          source: tag, mode: 'newtonian',
          force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
        });
      }

      const before = bodies.map((b) => ({ x: b.pos.x, z: b.pos.z }));
      runtime.step(DT);

      const gap = Math.hypot(load.pos.x - tug.pos.x, load.pos.z - tug.pos.z) - 2 * RADIUS;
      trace.minGap = Math.min(trace.minGap, gap);
      trace.maxStep = Math.max(trace.maxStep,
        Math.hypot(tug.pos.x - before[0].x, tug.pos.z - before[0].z),
        Math.hypot(load.pos.x - before[1].x, load.pos.z - before[1].z));
      trace.tugMinFieldDist = Math.min(trace.tugMinFieldDist, fieldDist(tug));
      trace.loadMinFieldDist = Math.min(trace.loadMinFieldDist, fieldDist(load));
      const tugSpeed = Math.hypot(tug.vel.x, tug.vel.z);
      const loadSpeed = Math.hypot(load.vel.x, load.vel.z);
      trace.maxSpeed = Math.max(trace.maxSpeed, tugSpeed, loadSpeed);
      trace.tugMaxSpeed = Math.max(trace.tugMaxSpeed, tugSpeed);
      trace.loadMaxSpeed = Math.max(trace.loadMaxSpeed, loadSpeed);

      if (latched) {
        const tele = runtime.getAttachmentTelemetry({ attachmentId: `${tag}-rope` });
        if (tele) {
          trace.maxLineLength = Math.max(trace.maxLineLength, tele.distance);
          trace.peakTension = Math.max(trace.peakTension, tele.tension);
          if (tick < fieldBitesAtTick) trace.slackTension = Math.min(trace.slackTension, tele.tension);
          else if (tele.tension > trace.slackTension * 4 + 1) trace.tensionBites = true;
        }
      }
    }

    // The bend claim, measured against each hull's OWN free coast: the closest approach its
    // initial straight line makes with the field heart. Falling meaningfully below that is
    // the field (or the rope) bending the hull — never just the geometry of the crossing.
    const straightClosest = (b) => {
      const rx = b.pos.x - well.center.x, rz = b.pos.z - well.center.z;
      const vx = ENTRY_SPEED, vz = b.vel.z;
      const vv = vx * vx + vz * vz;
      const t = Math.max(0, -(rx * vx + rz * vz) / vv);
      return Math.hypot(rx + vx * t, rz + vz * t);
    };
    trace.tugStraightDist = straightClosest({ pos: { x: -300, z: 0 }, vel: { z: tug.vel.z } });
    trace.loadStraightDist = straightClosest({ pos: { x: -300 - REST, z: 0 }, vel: { z: load.vel.z } });
    trace.tugBent = trace.tugMinFieldDist < trace.tugStraightDist * 0.9;
    trace.loadBent = trace.loadMinFieldDist < trace.loadStraightDist * 0.5;
    trace.startSpeed = ENTRY_SPEED;
    trace.tugStartDist = tugStart;
    trace.loadStartDist = loadStart;
    const comEnd = {
      x: (tug.pos.x * TUG_MASS + load.pos.x * LOAD_MASS) / totalMass,
      z: (tug.pos.z * TUG_MASS + load.pos.z * LOAD_MASS) / totalMass,
    };
    // The exact internal-momentum law: constraint and contact impulses are internal, so the
    // pair's end COM velocity must equal v0 + (Σ external impulses)/M_total, alone.
    const vComEnd = {
      x: (tug.vel.x * TUG_MASS + load.vel.x * LOAD_MASS) / totalMass,
      z: (tug.vel.z * TUG_MASS + load.vel.z * LOAD_MASS) / totalMass,
    };
    const vExpected = { x: v0Com.x + trace.sumJX / totalMass, z: v0Com.z + trace.sumJZ / totalMass };
    trace.vComEnd = vComEnd;
    trace.vExpected = vExpected;
    trace.comError = Math.hypot(vComEnd.x - vExpected.x, vComEnd.z - vExpected.z);
    trace.comDrift = Math.hypot(comEnd.x - comStart.x, comEnd.z - comStart.z);
    trace.com = comEnd;
    trace.tugVel = { x: tug.vel.x, z: tug.vel.z };
    trace.loadVel = { x: load.vel.x, z: load.vel.z };
    trace.fieldKind = well.kind;
    console.log(`[${tag}] seed=${seed} latched=${latched} field=${trace.fieldKind}`
      + ` bend tug=${trace.tugMinFieldDist.toFixed(1)}/${trace.tugStartDist.toFixed(1)}`
      + ` load=${trace.loadMinFieldDist.toFixed(1)}/${trace.loadStartDist.toFixed(1)}`
      + ` gap=${trace.minGap.toFixed(2)} line=${trace.maxLineLength.toFixed(1)}`
      + ` step=${trace.maxStep.toFixed(3)} speed=${trace.maxSpeed.toFixed(1)}`
      + ` tension slack=${Number.isFinite(trace.slackTension) ? trace.slackTension.toFixed(2) : 'n/a'}`
      + ` peak=${trace.peakTension.toFixed(2)} forceTicks=${trace.fieldImpulseTicks}`
      + ` vCom=(${trace.vComEnd.x.toFixed(2)},${trace.vComEnd.z.toFixed(2)})`
      + ` vExpect=(${trace.vExpected.x.toFixed(2)},${trace.vExpected.z.toFixed(2)})`
      + ` comErr=${trace.comError.toFixed(3)}`);
    return trace;
  } finally {
    runtime.dispose();
  }
}

async function runComPair(field, seed, tag) {
  const latched = await runArm({ latched: true, field, seed, tag: `${tag}-a` });
  const free = await runArm({ latched: false, field, seed, tag: `${tag}-b` });
  return { latched, free };
}

test('inf-tether-field-ab WELL: the room reaches a latched pair and the rope carries the pull honestly', async () => {
  const { latched: a, free: b } = await runComPair(WELL, 1, 'well');

  // 1. The room reaches the pair — both hulls bend below their own free-coast line.
  assert.equal(a.tugBent, true, `the latched tug must bend below its own coast line (min ${a.tugMinFieldDist.toFixed(1)} vs straight ${a.tugStraightDist.toFixed(1)})`);
  assert.equal(a.loadBent, true, `the latched load must dive below its own coast line (min ${a.loadMinFieldDist.toFixed(1)} vs straight ${a.loadStraightDist.toFixed(1)})`);
  assert.equal(b.loadBent, true, 'the free load dives too');
  // The coupling differential is honest: the light hull (couple 1.0) gains far more speed
  // from the same well than the floored heavy (couple 0.05) — the heavy shrug is real.
  const tugGain = b.tugMaxSpeed - ENTRY_SPEED;
  const loadGain = b.loadMaxSpeed - ENTRY_SPEED;
  assert.ok(loadGain >= 4 * Math.max(tugGain, 1),
    `light hull must out-gain the shrugging heavy (load +${loadGain.toFixed(1)} vs tug +${tugGain.toFixed(1)} WU/s)`);

  // 2. Constraint forces are internal: the pair's end COM velocity equals the initial COM
  //    velocity plus the accumulated external field impulses, alone — the rope never adds
  //    net momentum to the pair.
  assert.ok(a.comError < 2.5,
    `rope must add no net momentum: COM velocity ${a.vComEnd.x.toFixed(2)},${a.vComEnd.z.toFixed(2)} vs external-impulse prediction ${a.vExpected.x.toFixed(2)},${a.vExpected.z.toFixed(2)} (err ${a.comError.toFixed(3)} WU/s)`);

  // 3. Nobody is flung through anybody.
  assert.ok(a.minGap > -1.5, `surface gap must stay physical, worst ${a.minGap.toFixed(2)} WU`);
  const stretchBound = REST * (1 + TETHER_DEF.spring.maxStretchRatio) + 2;
  assert.ok(a.maxLineLength <= stretchBound,
    `rope length ${a.maxLineLength.toFixed(1)} must hold under the authored stretch envelope ${stretchBound.toFixed(1)}`);
  assert.ok(a.maxStep <= a.maxSpeed * DT + 0.5,
    `no per-tick teleport beyond honest speed: step ${a.maxStep.toFixed(3)} vs speed bound ${(a.maxSpeed * DT).toFixed(3)}`);
  // Speeds stay physical: coast + the capped field accel cannot outrun the bound.
  const speedBound = ENTRY_SPEED + (FIELD_MAX_ACCEL * TICKS * DT) / 4 + 40;
  assert.ok(a.maxSpeed < speedBound, `speeds stay physical: peak ${a.maxSpeed.toFixed(1)} < ${speedBound.toFixed(1)}`);

  // 4. The line tells: the differential pull reads in the rope, then the rope holds.
  assert.equal(a.tensionBites, true,
    `the rope must read the pull (slack ${a.slackTension?.toFixed(1)} -> peak ${a.peakTension.toFixed(1)})`);
  assert.ok(a.peakTension <= TETHER_DEF.break.maxTension,
    'an authored crossing must not snap the infrastructure line');

  // 5. Determinism: the same seed replays identically.
  const replay = await runArm({ latched: true, field: WELL, seed: 1, tag: 'well-replay' });
  assert.ok(Math.abs(replay.com.x - a.com.x) < 1e-9 && Math.abs(replay.com.z - a.com.z) < 1e-9,
    'same seed must replay identically');
});

test('inf-tether-field-ab CURRENT: a lateral current flings the pair and the rope still holds both', async () => {
  const { latched: a } = await runComPair(CURRENT, 2, 'current');

  assert.equal(a.tugBent || a.loadBent, true, 'the current reaches the pair');
  assert.ok(a.comError < 2.5,
    `rope must add no net momentum across the current: COM velocity ${a.vComEnd.x.toFixed(2)},${a.vComEnd.z.toFixed(2)} vs prediction ${a.vExpected.x.toFixed(2)},${a.vExpected.z.toFixed(2)}`);
  assert.ok(a.minGap > -1.5, `surface gap must stay physical under the fling, worst ${a.minGap.toFixed(2)} WU`);
  const stretchBound = REST * (1 + TETHER_DEF.spring.maxStretchRatio) + 2;
  assert.ok(a.maxLineLength <= stretchBound,
    `rope length ${a.maxLineLength.toFixed(1)} must hold under the current's fling`);
  assert.ok(a.maxStep <= a.maxSpeed * DT + 0.5,
    `no per-tick teleport under the fling: step ${a.maxStep.toFixed(3)} vs speed bound ${(a.maxSpeed * DT).toFixed(3)}`);
});

test('inf-tether-field-ab FREE-ARM SANITY: the uncoupled baseline bends only where coupling says', async () => {
  const b = await runArm({ latched: false, field: WELL, seed: 3, tag: 'well-free' });
  // Without a rope the light hull dives deep while the floored heavy barely gains —
  // the honest uncoupled baseline the latched arm is judged against.
  assert.ok(b.loadMinFieldDist < b.tugMinFieldDist,
    `light load must dive deeper than the shrugging tug (${b.loadMinFieldDist.toFixed(1)} vs ${b.tugMinFieldDist.toFixed(1)})`);
  const tugGain = b.tugMaxSpeed - ENTRY_SPEED;
  const loadGain = b.loadMaxSpeed - ENTRY_SPEED;
  assert.ok(loadGain >= 4 * Math.max(tugGain, 1),
    `uncoupled light hull out-gains the heavy (load +${loadGain.toFixed(1)} vs tug +${tugGain.toFixed(1)} WU/s)`);
  // And the free arm obeys the same internal-momentum law (no constraint forces exist in it).
  assert.ok(b.comError < 2.5,
    `free pair must follow external impulses only: COM velocity ${b.vComEnd.x.toFixed(2)},${b.vComEnd.z.toFixed(2)} vs prediction ${b.vExpected.x.toFixed(2)},${b.vExpected.z.toFixed(2)}`);
});
