// Motion Lab scenarios — deterministic headless movement cases on the real sim path.
// Player input writes state.input. NPC/AI motion uses data.intent and/or the aiPorts actuator.
// No rendering, no UI, no position/velocity writes.

import { SIM_DT } from '../core/sim.js';
import { wrapAngle } from '../core/rng.js';
import { queuePhysicsImpulse, readPhysicsTelemetry } from '../core/physicsAuthority.js';
import { AI_CONTRACT_VERSION, ManeuverKind, makeThrusterRequest } from '../ai/contracts.js';
import { createAuthoritativeRuntime } from '../runtime/createAuthoritativeRuntime.js';
import { actions } from './actions.js';
import { aiPorts } from './aiPorts.js';
import { makeEnemySpawnSpec } from './combat.js';
import { flightV3 } from './flightV3.js';
import { physics } from '../core/physics.js';
import { makeShipEntitySpec } from './ships.js';
import { createTacticalAISystem } from './tacticalAI.js';
import { weapons } from './weapons.js';
import {
  angularSignChangesPerSecond,
  compactMetrics,
  controlSignChangesPerSecond,
  createMotionTrace,
  flowAlignment,
  headingOscillationRms,
  jsonNumber,
  maybePushSample,
  minPairDistance,
  namedScenarioMetrics,
  nearestNeighborStats,
  playerMotionMetrics,
  pushContact,
  pushPhase,
  sampleBody,
  settleTimeToSlot,
  slotErrors,
} from './motionTelemetry.js';

export const MOTION_LAB_DT = SIM_DT;
export const MOTION_LAB_SEED = 13502;

export const M1_HULLS = Object.freeze([
  Object.freeze({ id: 'ship_kestrel', name: 'Hitch' }),
  Object.freeze({ id: 'ship_wasp', name: 'Wasp' }),
  Object.freeze({ id: 'ship_drifter', name: 'Drifter' }),
  Object.freeze({ id: 'ship_atlas', name: 'Atlas' }),
]);

const TRACE_STRIDE = 5;
const STANDARD_REPULSOR_ACCEL = 300;
const STANDARD_REPULSOR_S = 0.2;
const SLOT_OFFSET = Object.freeze({ forward: -48, right: 72 });

export async function runM1({ seed = MOTION_LAB_SEED, hullId } = {}) {
  const hulls = hullId
    ? M1_HULLS.filter((h) => h.id === hullId)
    : M1_HULLS.slice();
  if (!hulls.length) throw new Error(`unknown M1 hull: ${hullId}`);
  const byHull = {};
  const traces = {};
  for (const hull of hulls) {
    const result = await runM1Hull(seed, hull);
    byHull[hull.id] = result.metrics;
    traces[hull.id] = result.trace;
  }
  return {
    metrics: namedScenarioMetrics('M1', seed, { hulls: byHull }),
    traces,
  };
}

export async function runM4({ seed = MOTION_LAB_SEED } = {}) {
  const host = await bootMotionLab({ seed, kind: 'actuator' });
  try {
    const follower = spawnNpcShip(host, {
      defId: 'ship_wasp',
      pos: { x: -90, z: 140 },
      rot: 0,
      team: 1,
    });
    await host.ready();
    const dense = [];
    const trace = createMotionTrace({
      scenarioId: 'M4',
      seed,
      hullId: 'ship_wasp',
      extra: { role: 'follower' },
    });
    const contacts = bindContacts(host, trace, [follower.id]);
    let lastPhase = null;
    const ticks = 510;
    for (let i = 0; i < ticks; i++) {
      const t = i * MOTION_LAB_DT;
      const frame = virtualSlotFrame(t);
      const slot = slotFromFrame(frame, SLOT_OFFSET);
      const command = seekSlotCommand(follower, slot);
      writeNpcIntent(follower, command.intent);
      requestActuator(host, follower, command.request);
      const phase = frame.segment;
      if (phase !== lastPhase) {
        pushPhase(trace, phase, host.state.tick | 0);
        lastPhase = phase;
      }
      host.runtime.step(MOTION_LAB_DT);
      const sample = sampleBody(follower, {
        tick: host.state.tick | 0,
        t: host.state.simTime,
        control: command.intent,
        phase,
        slotX: slot.x,
        slotZ: slot.z,
        slotVx: slot.vx,
        slotVz: slot.vz,
        achievedAccel: telemetryAccel(follower),
      });
      dense.push(sample);
      maybePushSample(trace, sample, TRACE_STRIDE);
    }
    contacts.unbind();
    const errors = slotErrors(dense);
    const metrics = namedScenarioMetrics('M4', seed, {
      rmsPositionError: errors.rmsPositionError,
      rmsVelocityError: errors.rmsVelocityError,
      peakOvershoot: errors.peakOvershoot,
      settleTimeS: settleTimeToSlot(dense, MOTION_LAB_DT, 28),
      controlSignChangesPerS: controlSignChangesPerSecond(dense, MOTION_LAB_DT),
      angularSignChangesPerS: angularSignChangesPerSecond(dense, MOTION_LAB_DT),
      collisions: trace.contacts.length,
      finalSlotError: lastSlotError(dense),
    });
    return { metrics, trace };
  } finally {
    host.dispose();
  }
}

export async function runM6({ seed = MOTION_LAB_SEED } = {}) {
  const host = await bootMotionLab({ seed, kind: 'ai' });
  try {
    const target = spawnPlayer(host, 'ship_kestrel', { x: 220, z: 0 }, 0);
    const wing = [
      spawnEnemy(host, 'corsair_raider', { x: 0, z: -110 }, { squadId: 'm6_wing' }),
      spawnEnemy(host, 'corsair_raider', { x: 40, z: -150 }, { squadId: 'm6_wing' }),
      spawnEnemy(host, 'corsair_raider', { x: 0, z: 110 }, { squadId: 'm6_wing' }),
      spawnEnemy(host, 'corsair_raider', { x: 40, z: 150 }, { squadId: 'm6_wing' }),
    ];
    await host.ready();
    const ids = wing.map((e) => e.id);
    const trace = createMotionTrace({ scenarioId: 'M6', seed, extra: { wing: ids, targetId: target.id } });
    const contacts = bindContacts(host, trace, ids.concat(target.id));
    const entryTick = new Array(wing.length).fill(null);
    const firstShotTick = new Array(wing.length).fill(null);
    const closest = new Array(wing.length).fill(Infinity);
    const closestTick = new Array(wing.length).fill(null);
    const passed = new Array(wing.length).fill(false);
    const reverseAfterPass = new Array(wing.length).fill(false);
    let minFriendly = Infinity;
    let laneConflicts = 0;
    const denseById = new Map(ids.map((id) => [id, []]));
    const ticks = 720;
    for (let i = 0; i < ticks; i++) {
      writePlayerInput(host.state, { moveZ: 0.28, turnIntent: 0.12 });
      host.runtime.step(MOTION_LAB_DT);
      const tick = host.state.tick | 0;
      const tpos = target.pos;
      const positions = [];
      for (let w = 0; w < wing.length; w++) {
        const ship = wing[w];
        if (!ship || ship.alive === false) continue;
        positions.push({ x: ship.pos.x, z: ship.pos.z, id: ship.id });
        const dx = tpos.x - ship.pos.x;
        const dz = tpos.z - ship.pos.z;
        const dist = Math.hypot(dx, dz);
        if (entryTick[w] == null && dist < 520) entryTick[w] = tick;
        if (dist < closest[w]) {
          closest[w] = dist;
          closestTick[w] = tick;
        }
        if (closestTick[w] != null && tick > closestTick[w] + 12 && dist > closest[w] + 18) passed[w] = true;
        if (passed[w]) {
          const away = ((ship.pos.x - tpos.x) * (ship.vel.x || 0)) + ((ship.pos.z - tpos.z) * (ship.vel.z || 0));
          if (away < 0) reverseAfterPass[w] = true;
        }
        const intent = ship.data && ship.data.intent;
        if (firstShotTick[w] == null && intent && intent.fire) firstShotTick[w] = tick;
        const sample = sampleBody(ship, {
          tick,
          t: host.state.simTime,
          phase: 'attack',
          achievedAccel: telemetryAccel(ship),
        });
        denseById.get(ship.id).push(sample);
        maybePushSample(trace, sample, TRACE_STRIDE);
      }
      const pairMin = minPairDistance(positions);
      if (pairMin != null && pairMin < minFriendly) minFriendly = pairMin;
      laneConflicts += countLaneConflicts(wing, target);
      maybePushSample(trace, sampleBody(target, {
        tick,
        t: host.state.simTime,
        control: host.state.input,
        phase: 'target',
      }), TRACE_STRIDE);
    }
    contacts.unbind();
    const entries = entryTick.filter((v) => v != null);
    const shots = firstShotTick.filter((v) => v != null);
    const reformTick = reformTickFrom(wing, host.state.tick | 0);
    const quality = mergeDense(denseById);
    const metrics = namedScenarioMetrics('M6', seed, {
      entryTimingSpreadS: spreadSeconds(entries, MOTION_LAB_DT),
      minFriendlySeparation: Number.isFinite(minFriendly) ? jsonNumber(minFriendly) : null,
      targetExposureBeforeFirstShotS: shots.length
        ? jsonNumber(Math.min(...shots) * MOTION_LAB_DT)
        : null,
      laneConflicts,
      cleanExtensions: passed.reduce((n, ok, i) => n + (ok && !reverseAfterPass[i] ? 1 : 0), 0),
      instantTurnbacks: reverseAfterPass.reduce((n, v) => n + (v ? 1 : 0), 0),
      reformTimeS: reformTick == null ? null : jsonNumber(reformTick * MOTION_LAB_DT),
      firstShotCount: shots.length,
      collisions: trace.contacts.length,
      controlSignChangesPerS: controlSignChangesPerSecond(quality, MOTION_LAB_DT),
      headingOscillationRms: headingOscillationRms(quality),
    });
    return { metrics, trace };
  } finally {
    host.dispose();
  }
}

export async function runM8({ seed = MOTION_LAB_SEED } = {}) {
  const host = await bootMotionLab({ seed, kind: 'ai' });
  try {
    const target = spawnPlayer(host, 'ship_kestrel', { x: 240, z: 0 }, 0);
    const group = [
      spawnEnemy(host, 'wasp_swarmer', { x: 0, z: 0 }, { squadId: 'm8_wing' }),
      spawnEnemy(host, 'wasp_swarmer', { x: -40, z: -55 }, { squadId: 'm8_wing' }),
      spawnEnemy(host, 'wasp_swarmer', { x: -40, z: 55 }, { squadId: 'm8_wing' }),
      spawnEnemy(host, 'wasp_swarmer', { x: -80, z: 0 }, { squadId: 'm8_wing' }),
    ];
    const leader = group[0];
    const obstacle = spawnObstacle(host, { x: 90, z: -20 });
    await host.ready();
    const ids = group.map((e) => e.id);
    const trace = createMotionTrace({
      scenarioId: 'M8',
      seed,
      extra: { leaderId: leader.id, obstacleId: obstacle.id },
    });
    const contacts = bindContacts(host, trace, ids.concat(target.id, obstacle.id));
    const ticks = 720;
    const disruptTick = 210;
    const disableTick = 300;
    let impulseApplied = false;
    let leaderDisabled = false;
    let preImpulseSpeed = 0;
    let postImpulseSpeed = 0;
    let recoveryTick = null;
    const spacing0 = meanSpacing(group);
    for (let i = 0; i < ticks; i++) {
      writePlayerInput(host.state, { moveZ: 0.3 });
      const tick = host.state.tick | 0;
      if (tick === disruptTick) {
        preImpulseSpeed = meanSpeed(group);
        applyStandardRepulsorImpulse(group, { x: -1, z: 0.15 });
        impulseApplied = true;
      }
      if (tick === disableTick) {
        disableLeader(leader);
        leaderDisabled = true;
      }
      host.runtime.step(MOTION_LAB_DT);
      if (tick === disruptTick) postImpulseSpeed = meanSpeed(group);
      const live = group.filter((e) => e && e.alive !== false);
      const phase = tick < disruptTick ? 'form'
        : tick < disableTick ? 'repulsor'
          : 'recovery';
      if (tick === 0 || tick === disruptTick || tick === disableTick) pushPhase(trace, phase, tick);
      for (const ship of live) {
        maybePushSample(trace, sampleBody(ship, {
          tick: host.state.tick | 0,
          t: host.state.simTime,
          phase,
          achievedAccel: telemetryAccel(ship),
        }), TRACE_STRIDE);
      }
      if (leaderDisabled && live.length >= 2) {
        const aligned = flowAlignment(live.map((e) => e.vel));
        const spacing = meanSpacing(live);
        if (
          recoveryTick == null
          && (host.state.tick | 0) > disableTick + 30
          && aligned > 0.5
          && spacing < Math.max(140, spacing0 * 2.6)
        ) {
          recoveryTick = host.state.tick | 0;
        }
      }
    }
    contacts.unbind();
    const physicsPreserved = impulseApplied && postImpulseSpeed > preImpulseSpeed + 4;
    const disrupted = recoveryTick == null
      ? jsonNumber((host.state.tick | 0) * MOTION_LAB_DT)
      : jsonNumber((recoveryTick - disableTick) * MOTION_LAB_DT);
    const metrics = namedScenarioMetrics('M8', seed, {
      impulseApplied,
      leaderDisabled,
      physicsPreserved: !!physicsPreserved,
      preImpulseSpeed: jsonNumber(preImpulseSpeed, 0),
      postImpulseSpeed: jsonNumber(postImpulseSpeed, 0),
      timeDisruptedS: disrupted,
      recovered: recoveryTick != null,
      collisions: trace.contacts.length,
      remainingAlive: group.filter((e) => e && e.alive !== false).length,
    });
    return { metrics, trace };
  } finally {
    host.dispose();
  }
}

export async function runM11({ seed = MOTION_LAB_SEED } = {}) {
  const cohort12 = await runSwarmCohort(seed, 12);
  const cohort24 = await runSwarmCohort(seed, 24);
  return {
    metrics: namedScenarioMetrics('M11', seed, {
      cohort12: cohort12.metrics,
      cohort24: cohort24.metrics,
    }),
    traces: { cohort12: cohort12.trace, cohort24: cohort24.trace },
    cost: { cohort12: cohort12.cost, cohort24: cohort24.cost },
  };
}

export function virtualSlotFrame(t) {
  const time = Math.max(0, t);
  if (time < 2) {
    const speed = 70;
    return {
      segment: 'straight',
      x: speed * time,
      z: 0,
      heading: 0,
      vx: speed,
      vz: 0,
      headingRate: 0,
    };
  }
  if (time < 4) {
    const u = time - 2;
    const radius = 110;
    const omega = (Math.PI / 2) / 2;
    const ang = omega * u;
    const speed = radius * omega;
    const x = 140 + radius * Math.sin(ang);
    const z = radius * (1 - Math.cos(ang));
    const heading = ang;
    return {
      segment: 'curved',
      x,
      z,
      heading,
      vx: speed * Math.cos(heading),
      vz: speed * Math.sin(heading),
      headingRate: omega,
    };
  }
  if (time < 6) {
    const u = time - 4;
    const heading = Math.PI / 2;
    const speed = 70 + 40 * u;
    const x = 140 + 110;
    const z = 110 + (70 * u + 20 * u * u);
    return {
      segment: 'accelerating',
      x,
      z,
      heading,
      vx: 0,
      vz: speed,
      headingRate: 0,
    };
  }
  const u = time - 6;
  const heading = Math.PI / 2 + u * 0.9;
  const speed = 150;
  const x = 250 + speed * Math.cos(heading) * 0.15;
  const z = 190 + speed * u * 0.35;
  return {
    segment: 'rotating',
    x,
    z,
    heading,
    vx: speed * 0.15 * -Math.sin(heading) * 0.9,
    vz: speed * 0.35,
    headingRate: 0.9,
  };
}

export function slotFromFrame(frame, offset = SLOT_OFFSET) {
  const c = Math.cos(frame.heading);
  const s = Math.sin(frame.heading);
  const fx = c;
  const fz = s;
  const rx = -s;
  const rz = c;
  const x = frame.x + fx * offset.forward + rx * offset.right;
  const z = frame.z + fz * offset.forward + rz * offset.right;
  const rate = frame.headingRate || 0;
  return {
    x,
    z,
    vx: frame.vx + (-fz * offset.forward - c * offset.right) * rate,
    vz: frame.vz + (fx * offset.forward - s * offset.right) * rate,
    heading: frame.heading,
    segment: frame.segment,
  };
}

export function formatM1Table(metrics) {
  const hulls = (metrics && metrics.hulls) || {};
  const hitch = hulls.ship_kestrel || {};
  const wasp = hulls.ship_wasp || {};
  const rows = [
    ['metric', 'Hitch', 'Wasp'],
    ['onsetS', num(hitch.onsetS), num(wasp.onsetS)],
    ['responseTime10to90S', num(hitch.responseTime10to90S), num(wasp.responseTime10to90S)],
    ['yawOvershootRad', num(hitch.yawOvershootRad), num(wasp.yawOvershootRad)],
    ['yawSettleS', num(hitch.yawSettleS), num(wasp.yawSettleS)],
    ['stopDistance', num(hitch.stopDistance), num(wasp.stopDistance)],
    ['stopTimeS', num(hitch.stopTimeS), num(wasp.stopTimeS)],
    ['lateralVelocityKillTimeS', num(hitch.lateralVelocityKillTimeS), num(wasp.lateralVelocityKillTimeS)],
    ['speedRetainedThroughTurn', num(hitch.speedRetainedThroughTurn), num(wasp.speedRetainedThroughTurn)],
    ['controlSignChangesPerS', num(hitch.controlSignChangesPerS), num(wasp.controlSignChangesPerS)],
    ['accelerationJerkRms', num(hitch.accelerationJerkRms), num(wasp.accelerationJerkRms)],
    ['peakForwardSpeed', num(hitch.peakForwardSpeed), num(wasp.peakForwardSpeed)],
    ['peakYawRate', num(hitch.peakYawRate), num(wasp.peakYawRate)],
  ];
  const widths = [0, 0, 0];
  for (const row of rows) {
    for (let i = 0; i < 3; i++) widths[i] = Math.max(widths[i], String(row[i]).length);
  }
  return rows.map((row) => row.map((cell, i) => String(cell).padEnd(widths[i])).join('  ')).join('\n');
}

async function runM1Hull(seed, hull) {
  const host = await bootMotionLab({ seed, kind: 'player' });
  try {
    const player = spawnPlayer(host, hull.id, { x: 0, z: 0 }, 0);
    await host.ready();
    const dense = [];
    const trace = createMotionTrace({ scenarioId: 'M1', seed, hullId: hull.id });
    const plan = m1InputPlan();
    const contacts = bindContacts(host, trace, [player.id]);
    let lastPhase = null;
    const marks = {
      accelEdgeTick: null,
      yawReleaseTick: null,
      brakeTick: null,
      turnStartTick: null,
      turnEndTick: null,
      lateralKillTick: null,
    };
    for (let i = 0; i < plan.ticks; i++) {
      const step = plan.at(i);
      const input = { ...step.input };
      if (step.phase === 'lateralKill') {
        const c = Math.cos(player.rot || 0);
        const s = Math.sin(player.rot || 0);
        const lateral = (player.vel.x || 0) * -s + (player.vel.z || 0) * c;
        input.moveX = lateral > 0.4 ? -1 : lateral < -0.4 ? 1 : 0;
        input.moveZ = 0;
        input.turnIntent = 0;
      }
      writePlayerInput(host.state, input);
      if (step.phase !== lastPhase) {
        const tickNow = host.state.tick | 0;
        pushPhase(trace, step.phase, tickNow);
        if (step.phase === 'accel' && marks.accelEdgeTick == null) marks.accelEdgeTick = tickNow;
        if (step.phase === 'yawRelease' && marks.yawReleaseTick == null) marks.yawReleaseTick = tickNow;
        if (step.phase === 'brake' && marks.brakeTick == null) marks.brakeTick = tickNow;
        if (step.phase === 'turn' && marks.turnStartTick == null) marks.turnStartTick = tickNow;
        if (step.phase === 'lateralKill' && marks.lateralKillTick == null) {
          marks.turnEndTick = tickNow;
          marks.lateralKillTick = tickNow;
        }
        lastPhase = step.phase;
      }
      host.runtime.step(MOTION_LAB_DT);
      const sample = sampleBody(player, {
        tick: host.state.tick | 0,
        t: host.state.simTime,
        control: host.state.input,
        phase: step.phase,
        achievedAccel: telemetryAccel(player),
      });
      dense.push(sample);
      maybePushSample(trace, sample, TRACE_STRIDE);
    }
    contacts.unbind();
    const ledger = player.data && player.data.propulsionResources || {};
    const hullMetrics = playerMotionMetrics(dense, trace.phases, MOTION_LAB_DT, {
      ...marks,
      propulsionEnergySpent: ledger.energySpent,
      propulsionHeat: ledger.heat,
    });
    return { metrics: hullMetrics, trace };
  } finally {
    host.dispose();
  }
}

async function runSwarmCohort(seed, count) {
  const host = await bootMotionLab({ seed, kind: 'ai' });
  const started = nowNs();
  try {
    spawnPlayer(host, 'ship_kestrel', { x: 520, z: 0 }, 0);
    const ships = [];
    const cols = Math.ceil(Math.sqrt(count));
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      ships.push(spawnEnemy(host, 'wasp_swarmer', {
        x: -40 - row * 36,
        z: (col - (cols - 1) / 2) * 34,
      }, { squadId: 'm11_river' }));
    }
    await host.ready();
    const ids = ships.map((e) => e.id);
    const trace = createMotionTrace({ scenarioId: 'M11', seed, extra: { count } });
    const contacts = bindContacts(host, trace, ids);
    const ticks = 360;
    const disruptTick = 150;
    let disruptedTick = null;
    let reacqTick = null;
    let preAlign = 0;
    for (let i = 0; i < ticks; i++) {
      writePlayerInput(host.state, { moveZ: 0.8 });
      const tick = host.state.tick | 0;
      if (tick === disruptTick) {
        preAlign = flowAlignment(ships.filter((e) => e.alive !== false).map((e) => e.vel));
        applyStandardRepulsorImpulse(ships.slice(0, Math.min(4, ships.length)), { x: 0.2, z: 1 });
        disruptedTick = tick;
      }
      host.runtime.step(MOTION_LAB_DT);
      const live = ships.filter((e) => e && e.alive !== false);
      const positions = live.map((e) => ({ x: e.pos.x, z: e.pos.z }));
      const velocities = live.map((e) => e.vel);
      const align = flowAlignment(velocities);
      if (disruptedTick != null && reacqTick == null && tick > disruptedTick + 20 && align >= Math.max(0.45, preAlign * 0.85)) {
        reacqTick = tick;
      }
      const phase = tick < disruptTick ? 'flow' : 'disrupted';
      if (tick === 0 || tick === disruptTick) pushPhase(trace, phase, tick);
      if (tick % 8 === 0) {
        for (const ship of live) {
          maybePushSample(trace, sampleBody(ship, {
            tick: host.state.tick | 0,
            t: host.state.simTime,
            phase,
          }), 1);
        }
      }
    }
    contacts.unbind();
    const live = ships.filter((e) => e && e.alive !== false);
    const positions = live.map((e) => ({ x: e.pos.x, z: e.pos.z }));
    const velocities = live.map((e) => e.vel);
    const nn = nearestNeighborStats(positions);
    const wallMs = nsToMs(nowNs() - started);
    const metrics = compactMetrics({
      count,
      flowAlignment: flowAlignment(velocities),
      ...nn,
      disruptionResponseS: disruptedTick == null
        ? null
        : jsonNumber(((reacqTick == null ? host.state.tick | 0 : reacqTick) - disruptedTick) * MOTION_LAB_DT),
      reacquired: reacqTick != null,
      collisions: trace.contacts.length,
      alive: live.length,
    });
    return {
      metrics,
      trace,
      cost: {
        stepWallMs: wallMs,
        perMemberMs: live.length ? wallMs / live.length : wallMs,
        memberCount: count,
      },
    };
  } finally {
    host.dispose();
  }
}

function m1InputPlan() {
  const settle = 24;
  const accel = 150;
  const yawHold = 48;
  const yawRelease = 90;
  const accel2 = 120;
  const brake = 240;
  const accel3 = 90;
  const turn = 90;
  const lateral = 150;
  const ticks = settle + accel + yawHold + yawRelease + accel2 + brake + accel3 + turn + lateral;
  const accelEdge = settle;
  const yawReleaseTick = settle + accel + yawHold;
  const brakeStart = settle + accel + yawHold + yawRelease + accel2;
  const turnStart = brakeStart + brake + accel3;
  const turnEnd = turnStart + turn;
  const lateralStart = turnEnd;
  return {
    ticks,
    accelEdge,
    yawRelease: yawReleaseTick,
    brakeStart,
    turnStart,
    turnEnd,
    lateralStart,
    at(i) {
      if (i < settle) return { phase: 'settle', input: {} };
      if (i < settle + accel) return { phase: 'accel', input: { moveZ: 1 } };
      if (i < settle + accel + yawHold) return { phase: 'yawHold', input: { turnIntent: 1 } };
      if (i < yawReleaseTick + yawRelease) return { phase: 'yawRelease', input: {} };
      if (i < brakeStart) return { phase: 'accel2', input: { moveZ: 1 } };
      if (i < brakeStart + brake) return { phase: 'brake', input: { brake: true } };
      if (i < turnStart) return { phase: 'accel3', input: { moveZ: 1 } };
      if (i < turnEnd) return { phase: 'turn', input: { moveZ: 1, turnIntent: 1 } };
      return { phase: 'lateralKill', input: { moveX: -1 } };
    },
  };
}

async function bootMotionLab({ seed, kind }) {
  const systems = motionLabSystems(kind);
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    seed,
    systems,
  });
  const state = runtime.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };
  return {
    runtime,
    state,
    kind,
    async ready() {
      const physicsSys = runtime.getSystem('physics');
      if (!physicsSys || typeof physicsSys.prepareBackend !== 'function') {
        throw new Error('physics prepareBackend missing');
      }
      const ok = await physicsSys.prepareBackend(state, { reset: true });
      if (ok !== true) throw new Error('SG-02 dynamic authority failed to become ready');
    },
    dispose() {
      runtime.dispose();
    },
  };
}

function motionLabSystems(kind) {
  if (kind === 'player') return [actions, flightV3, physics];
  if (kind === 'actuator') return [actions, flightV3, aiPorts, physics];
  return [createTacticalAISystem(), actions, flightV3, aiPorts, weapons, physics];
}

function spawnPlayer(host, hullId, pos, rot = 0) {
  const spec = makeShipEntitySpec(hullId, {
    isPlayer: true,
    player: host.state.player,
    fittings: [],
    pos,
    rot,
    team: 0,
    factionId: 'faction_free',
  });
  const entity = host.runtime.spawn(spec);
  host.state.playerId = entity.id;
  return entity;
}

function spawnNpcShip(host, { defId, pos, rot = 0, team = 1 }) {
  const spec = makeShipEntitySpec(defId, {
    isPlayer: false,
    fittings: [],
    pos,
    rot,
    team,
  });
  spec.data = spec.data || {};
  spec.data.intent = emptyIntent();
  return host.runtime.spawn(spec);
}

function spawnEnemy(host, typeId, pos, opts = {}) {
  const spec = makeEnemySpawnSpec(typeId, 1, pos, {
    motive: 'motion_lab',
    engagementTrigger: 'authorized_hostile_spawn',
    zoneId: 'motion_lab',
  });
  spec.rot = opts.rot || 0;
  spec.data = spec.data || {};
  spec.data.ai = spec.data.ai || {};
  spec.data.ai.squadId = opts.squadId || spec.data.ai.squadId || 'motion_lab';
  spec.data.ai.activity = {
    ...(spec.data.ai.activity || {}),
    kind: 'attack_run',
    reason: 'motion_lab',
    anchor: pos,
    leashRadius: 4000,
  };
  spec.data.ai.roe = 'weapons_free';
  spec.data.ai.passive = false;
  spec.data.ai.huntPlayer = true;
  spec.data.ai.forcePlayerTarget = true;
  spec.data.ai.spawnContext = 'zone_hostile';
  spec.data.intent = emptyIntent();
  spec.data.combat = spec.data.combat || {};
  if (host.state.playerId) spec.data.combat.targetId = host.state.playerId;
  return host.runtime.spawn(spec);
}

function spawnObstacle(host, pos) {
  return host.runtime.spawn({
    type: 'asteroid',
    pos,
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 22,
    mass: 480,
    collides: true,
    hull: 400,
    hullMax: 400,
    physicsBody: {
      schemaVersion: 1,
      radius: 22,
      mass: 480,
      inertiaY: 220,
      dynamic: false,
      ccd: false,
      material: 'asteroid',
      revision: 0,
    },
    data: { motionLab: 'obstacle' },
  });
}

function writePlayerInput(state, input = {}) {
  const packet = state.input;
  packet.moveX = finiteAxis(input.moveX);
  packet.moveZ = finiteAxis(input.moveZ);
  packet.turnIntent = finiteAxis(input.turnIntent);
  packet.boost = !!input.boost;
  packet.brake = !!input.brake;
  packet.fire = !!input.fire;
  if (!packet.actions) packet.actions = {};
  packet.actions.brake = packet.brake;
  packet.actions.autopursuit = false;
}

function writeNpcIntent(entity, input = {}) {
  const data = entity.data || (entity.data = {});
  const intent = data.intent || (data.intent = emptyIntent());
  intent.moveX = finiteAxis(input.moveX);
  intent.moveZ = finiteAxis(input.moveZ);
  intent.turnIntent = finiteAxis(input.turnIntent);
  intent.boost = !!input.boost;
  intent.brake = !!input.brake;
  intent.fire = false;
}

function emptyIntent() {
  return { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, fire: false };
}

function seekSlotCommand(entity, slot) {
  const dx = slot.x - (entity.pos.x || 0);
  const dz = slot.z - (entity.pos.z || 0);
  const dist = Math.hypot(dx, dz);
  const desired = Math.atan2(dz, dx);
  const err = wrapAngle(desired - (entity.rot || 0));
  const c = Math.cos(entity.rot || 0);
  const s = Math.sin(entity.rot || 0);
  const fwd = dx * c + dz * s;
  const right = -dx * s + dz * c;
  const relVx = slot.vx - (entity.vel.x || 0);
  const relVz = slot.vz - (entity.vel.z || 0);
  const fwdRel = relVx * c + relVz * s;
  const rightRel = -relVx * s + relVz * c;
  const moveZ = clamp(fwd / 70 + fwdRel / 45, -1, 1);
  const moveX = clamp(right / 55 + rightRel / 40, -1, 1);
  const turnIntent = clamp(err / 0.42, -1, 1);
  const brake = dist < 22 && Math.hypot(relVx, relVz) > 16;
  const boost = dist > 160 && Math.abs(err) < 0.45;
  return {
    intent: { moveX, moveZ, turnIntent, boost, brake },
    request: {
      forceLocal: { forward: moveZ, right: moveX },
      torqueYaw: turnIntent,
      boost,
      brake,
      targetHeading: desired,
      kind: ManeuverKind.FORMATION,
      reason: 'motion_lab_slot',
    },
  };
}

function requestActuator(host, entity, request) {
  const helpers = host.runtime.getHelpers();
  if (!helpers || typeof helpers.aiManeuver?.request !== 'function') return false;
  const packet = makeThrusterRequest(entity.id, host.state.tick | 0, request);
  if (packet.version !== AI_CONTRACT_VERSION) return false;
  return helpers.aiManeuver.request(packet);
}

function applyStandardRepulsorImpulse(entities, dir) {
  const mag = Math.hypot(dir.x || 0, dir.z || 0) || 1;
  const nx = (dir.x || 0) / mag;
  const nz = (dir.z || 0) / mag;
  for (const entity of entities) {
    if (!entity || entity.alive === false) continue;
    const mass = Number.isFinite(entity.mass) && entity.mass > 0 ? entity.mass : 20;
    queuePhysicsImpulse(entity, {
      x: nx * mass * STANDARD_REPULSOR_ACCEL * STANDARD_REPULSOR_S,
      y: 0,
      z: nz * mass * STANDARD_REPULSOR_ACCEL * STANDARD_REPULSOR_S,
    });
  }
}

function disableLeader(entity) {
  if (!entity) return;
  entity.alive = false;
  entity.hull = 0;
  if (!entity.flags) entity.flags = {};
  entity.flags.disabled = true;
  const data = entity.data || (entity.data = {});
  data.ai = data.ai || {};
  data.ai.passive = true;
}

function bindContacts(host, trace, watchIds) {
  const watch = new Set(watchIds);
  const handler = (payload) => {
    const a = payload && payload.aId;
    const b = payload && payload.bId;
    if (watch.has(a) || watch.has(b)) pushContact(trace, host.state.tick | 0, a, b);
  };
  host.runtime.bus.on('collision', handler);
  return {
    unbind() {
      if (typeof host.runtime.bus.off === 'function') host.runtime.bus.off('collision', handler);
    },
  };
}

function telemetryAccel(entity) {
  const phys = readPhysicsTelemetry(entity);
  if (phys && phys.linearAcceleration) return phys.linearAcceleration;
  const frame = entity && entity._flightFrame;
  return frame && frame.acceleration || { x: 0, z: 0 };
}

function lastSlotError(samples) {
  for (let i = samples.length - 1; i >= 0; i--) {
    const sample = samples[i];
    if (!Number.isFinite(sample.slotX) || !Number.isFinite(sample.slotZ)) continue;
    return jsonNumber(Math.hypot(sample.x - sample.slotX, sample.z - sample.slotZ));
  }
  return null;
}

function countLaneConflicts(wing, target) {
  let conflicts = 0;
  const bearings = [];
  for (const ship of wing) {
    if (!ship || ship.alive === false) continue;
    const dx = target.pos.x - ship.pos.x;
    const dz = target.pos.z - ship.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 20 || dist > 420) continue;
    bearings.push({ id: ship.id, heading: Math.atan2(dz, dx), dist });
  }
  for (let i = 0; i < bearings.length; i++) {
    for (let j = i + 1; j < bearings.length; j++) {
      const dHead = Math.abs(wrapAngle(bearings[i].heading - bearings[j].heading));
      const dDist = Math.abs(bearings[i].dist - bearings[j].dist);
      if (dHead < 0.22 && dDist < 70) conflicts++;
    }
  }
  return conflicts;
}

function spreadSeconds(ticks, dt) {
  if (!ticks.length) return null;
  const min = Math.min(...ticks);
  const max = Math.max(...ticks);
  return jsonNumber((max - min) * dt, 0);
}

function reformTickFrom(wing, fallbackTick) {
  const live = wing.filter((e) => e && e.alive !== false);
  if (live.length < 2) return fallbackTick;
  const align = flowAlignment(live.map((e) => e.vel));
  const spacing = meanSpacing(live);
  if (align > 0.5 && spacing < 220) return fallbackTick;
  return null;
}

function meanSpacing(entities) {
  const live = entities.filter((e) => e && e.alive !== false && e.pos);
  if (live.length < 2) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      sum += Math.hypot(live[i].pos.x - live[j].pos.x, live[i].pos.z - live[j].pos.z);
      n++;
    }
  }
  return n ? sum / n : 0;
}

function meanSpeed(entities) {
  const live = entities.filter((e) => e && e.alive !== false);
  if (!live.length) return 0;
  let sum = 0;
  for (const entity of live) sum += Math.hypot(entity.vel.x || 0, entity.vel.z || 0);
  return sum / live.length;
}

function mergeDense(map) {
  const all = [];
  for (const series of map.values()) {
    for (const sample of series) all.push(sample);
  }
  all.sort((a, b) => (a.tick - b.tick) || ((a.id || 0) - (b.id || 0)));
  return all;
}

function finiteAxis(value) {
  return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function num(value) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 100) return value.toFixed(1);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

function nowNs() {
  if (typeof process !== 'undefined' && process.hrtime && typeof process.hrtime.bigint === 'function') {
    return process.hrtime.bigint();
  }
  return 0n;
}

function nsToMs(ns) {
  const value = typeof ns === 'bigint' ? Number(ns) / 1e6 : 0;
  return jsonNumber(value, 0);
}


