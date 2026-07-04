import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import {
  createSg02CombatPhysicsPort,
  createSg02DynamicBodyOwner,
} from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;
const REST_LENGTH = 220;
const MISS_DISTANCE = REST_LENGTH * 0.8;
const START_SPEED = 150;
const SIM_TICKS = Math.round(2.0 / DT);
const CAPTURE_PLUS_HALF_S = 0.5;

await assertDampedSpringCapture();
assertNodeCheck('scripts/check-tether-gameplay.mjs', 'slingshot contract');

console.log('Massline feel checks OK');

async function assertDampedSpringCapture() {
  const player = makeBody({
    id: 1,
    type: 'ship',
    x: 0,
    z: -MISS_DISTANCE,
    vx: START_SPEED,
    vz: 0,
    mass: 16,
    radius: 4,
    dynamic: true,
  });
  const asteroid = makeBody({
    id: 2,
    type: 'asteroid',
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    mass: 55,
    radius: 11,
    dynamic: true,
  });

  const runtime = await createSg02DynamicBodyOwner({
    fixedDt: DT,
    quantum: 1e-5,
    mode: 'massline-feel-check',
    publishTelemetry: false,
  });
  const port = createSg02CombatPhysicsPort(runtime);

  try {
    runtime.syncFromEntities([player, asteroid]);
    const handle = port.createAttachment({
      attachmentId: 'massline_feel_capture',
      defId: 'tether_standard',
      ownerId: player.id,
      targetId: asteroid.id,
      sourceSocketId: 'massline',
      targetSocketId: 'tether',
      sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z },
      targetWorld: { x: asteroid.pos.x, y: 0, z: asteroid.pos.z },
      restLength: REST_LENGTH,
      break: { maxTension: 100000, maxImpulse: 100000, stiffness: 90, damping: 6 },
      spring: { K: 140, zeta: 0.95, captureS: 0.35 },
      tick: 0,
    });
    assert(handle && handle.attachmentId === 'massline_feel_capture', 'Massline feel fixture should create a tether');

    const records = [];
    let lastSlack = null;
    let captureStart = -1;
    let captureEnd = -1;
    let cutIndex = -1;
    let handleActive = true;
    let maxCaptureSpeedDelta = 0;
    let previous = null;

    for (let tick = 1; tick <= SIM_TICKS; tick++) {
      runtime.step(DT);
      const telemetry = handleActive ? port.getAttachmentTelemetry({ physicsHandle: handle, tick }) : null;
      if (handleActive) {
        assert(telemetry, 'Massline feel fixture should keep telemetry until cut');
        assert.equal(telemetry.breakRequested, false, 'feel fixture should not hit the max-stretch guard');
      }
      const record = telemetry
        ? sample(tick * DT, player, asteroid, telemetry)
        : sampleDetached(tick * DT, player, asteroid);
      records.push(record);

      if (telemetry && telemetry.stretch <= 1e-5) lastSlack = record;
      if (telemetry && captureStart < 0 && telemetry.phase === 'capture') {
        captureStart = records.length - 1;
        assert(lastSlack, 'capture should start after a measurable slack interval');
      }
      if (telemetry && captureStart >= 0 && captureEnd < 0 && telemetry.phase !== 'capture') {
        captureEnd = records.length - 1;
      }
      if (previous && (previous.phase === 'capture' || record.phase === 'capture')) {
        maxCaptureSpeedDelta = Math.max(maxCaptureSpeedDelta, Math.abs(record.playerSpeed - previous.playerSpeed));
      }
      if (handleActive && captureEnd >= 0 && Math.abs(record.radialSpeed) <= 2.0) {
        cutIndex = records.length - 1;
        assert.equal(port.cutAttachment({ physicsHandle: handle, reason: 'massline_feel_cut', tick }), true,
          'feel fixture should cut cleanly at the first tangent point');
        handleActive = false;
      }
      previous = record;
    }

    assert(captureStart >= 0, 'spring capture phase should be observed');
    assert(captureEnd > captureStart, 'capture should complete before the scenario ends');
    assert(cutIndex > captureEnd, 'scenario should cut at the first tangent after capture');

    const preTaut = lastSlackBefore(records, captureStart);
    const afterCapture = records[captureEnd];
    const preRadial = Math.abs(preTaut.radialSpeed);
    const preTangential = preTaut.tangentialSpeed;
    assert(preRadial > 40, `pre-taut radial speed should be meaningful; got ${preRadial.toFixed(2)}`);
    assert(preTangential > 80, `pre-taut tangential speed should be meaningful; got ${preTangential.toFixed(2)}`);

    assert(Math.abs(afterCapture.radialSpeed) <= preRadial * 0.15,
      `radial speed after capture should be <=15% of pre-taut; got ${Math.abs(afterCapture.radialSpeed).toFixed(2)} from ${preRadial.toFixed(2)}`);

    const preSign = Math.sign(preTaut.radialSpeed) || 1;
    const maxReverse = maxRadialReverse(records, captureStart, cutIndex, preSign);
    assert(maxReverse <= preRadial * 0.10,
      `radial velocity should not reverse by >10%; got ${maxReverse.toFixed(2)} from ${preRadial.toFixed(2)}`);

    const halfSecond = firstAtOrAfter(records, records[captureStart].t + CAPTURE_PLUS_HALF_S);
    assert(halfSecond, 'scenario should cover capture+0.5s');
    assert(halfSecond.tangentialSpeed >= preTangential * 0.85,
      `tangential speed at capture+0.5s should preserve >=85%; got ${halfSecond.tangentialSpeed.toFixed(2)} from ${preTangential.toFixed(2)}`);

    assert(maxCaptureSpeedDelta <= 9,
      `per-tick speed delta during capture should be <=9 wu/s; got ${maxCaptureSpeedDelta.toFixed(2)}`);

    assertArcMonotonic(records, captureStart, cutIndex);
  } finally {
    runtime.dispose();
  }
}

function sample(t, player, target, telemetry) {
  const relVx = target.vel.x - player.vel.x;
  const relVz = target.vel.z - player.vel.z;
  const radial = telemetry.relativeSpeed;
  const relSpeed = Math.hypot(relVx, relVz);
  const tangentSq = Math.max(0, relSpeed * relSpeed - radial * radial);
  return {
    tick: Math.round(t / DT),
    t,
    phase: telemetry.phase,
    radialSpeed: radial,
    tangentialSpeed: Math.sqrt(tangentSq),
    playerSpeed: Math.hypot(player.vel.x, player.vel.z),
    orbitAngle: Math.atan2(player.pos.z - target.pos.z, player.pos.x - target.pos.x),
  };
}

function sampleDetached(t, player, target) {
  const dx = target.pos.x - player.pos.x;
  const dz = target.pos.z - player.pos.z;
  const distance = Math.hypot(dx, dz) || 1;
  const nx = dx / distance;
  const nz = dz / distance;
  const relVx = target.vel.x - player.vel.x;
  const relVz = target.vel.z - player.vel.z;
  const radial = relVx * nx + relVz * nz;
  const relSpeed = Math.hypot(relVx, relVz);
  const tangentSq = Math.max(0, relSpeed * relSpeed - radial * radial);
  return {
    tick: Math.round(t / DT),
    t,
    phase: 'cut',
    radialSpeed: radial,
    tangentialSpeed: Math.sqrt(tangentSq),
    playerSpeed: Math.hypot(player.vel.x, player.vel.z),
    orbitAngle: Math.atan2(player.pos.z - target.pos.z, player.pos.x - target.pos.x),
  };
}

function lastSlackBefore(records, captureStart) {
  for (let i = captureStart - 1; i >= 0; i--) {
    if (records[i].phase === 'slack') return records[i];
  }
  return records[Math.max(0, captureStart - 1)];
}

function maxRadialReverse(records, captureStart, cutIndex, preSign) {
  let maxReverse = 0;
  for (let i = captureStart; i <= cutIndex; i++) {
    const signed = records[i].radialSpeed * preSign;
    if (signed < 0) maxReverse = Math.max(maxReverse, -signed);
  }
  return maxReverse;
}

function firstAtOrAfter(records, t) {
  return records.find((record) => record.t >= t) || null;
}

function assertArcMonotonic(records, start, end) {
  let previous = records[start].orbitAngle;
  let direction = 0;
  let total = 0;
  for (let i = start + 1; i <= end; i++) {
    const next = unwrapNear(records[i].orbitAngle, previous);
    const delta = next - previous;
    if (Math.abs(delta) > 1e-4) {
      const sign = Math.sign(delta);
      if (direction === 0) direction = sign;
      assert(sign === direction, `orbit arc should remain one sign; reversed at tick ${records[i].tick}`);
      total += Math.abs(delta);
    }
    previous = next;
  }
  assert(total > 0, `orbit arc should accumulate before cut; got ${total.toFixed(3)} rad`);
}

function unwrapNear(value, reference) {
  let out = value;
  while (out - reference > Math.PI) out -= Math.PI * 2;
  while (out - reference < -Math.PI) out += Math.PI * 2;
  return out;
}

function assertNodeCheck(script, label) {
  const result = spawnSync(process.execPath, [script], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.error) process.stderr.write(`${result.error.message}\n`);
  }
  assert.equal(result.status, 0, `${label} should pass`);
}

function makeBody({ id, type, x, z, vx, vz, mass, radius, dynamic }) {
  return {
    id,
    type,
    alive: true,
    collides: true,
    radius,
    mass,
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass,
      inertiaY: Math.max(1, 0.5 * mass * radius * radius),
      dynamic,
      ccd: true,
      revision: 0,
    },
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot: 0,
    angVel: 0,
    flags: {},
    data: {},
  };
}
