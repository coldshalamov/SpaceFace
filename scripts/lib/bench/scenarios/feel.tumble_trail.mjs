// scripts/lib/bench/scenarios/feel.tumble_trail.mjs — PQ-139.04 production tumble trail instrument
//
// MEASUREMENT CONTRACT:
// "A scenario that integrates its own physics is not a measurement."
// Every number here comes out of runtime.step() on bootRealPath (rapier-dynamic).
// Production authority is tumbleStates impulse/spin -> Rapier integration ->
// SG-02 yaw/angvel sync -> render root yaw/bank/pitch -> _updateRibbonTrails() socket sampling
// -> projected XZ ribbon history.
//
// Label: shipping XZ projection (never a 3D helix).
// The historical 0 / 0.25 WU measurements are preserved only as invalid synthetic baselines.

import * as THREE from 'three';
import { bootRealPath } from '../realPath.mjs';
import { writeNpcIntent } from './feel.hitstun_curve.mjs';
import { queuePhysicsImpulse, readPhysicsTelemetry } from '../../../../src/core/physicsAuthority.js';
import { resolveFlightProfile } from '../../../../src/core/flightDynamics.js';
import { tumbleStates } from '../../../../src/systems/tumbleStates.js';
import { vfx } from '../../../../src/render/vfx.js';
import { updateShipPitchPresentation } from '../../../../src/render/shipPitchPresentation.js';
import { readControlLossPresentation } from '../../../../src/render/masslinePresentation.js';

export const HISTORICAL_BASELINE = Object.freeze({
  fallbackSamplerWU: 0,
  sceneGraphEulerCrossCouplingWU: 0.25,
  valid: false,
  reason: 'freezes rot=0 while supplying nonzero angVel, hand-integrates position without Rapier, assumes 48 segments while live NPC ribbons retain 24, inspects only terminal buffer after transient curvature ages out, and measures XZ while calling it a 3D helix',
});

export const SCENARIO_SYSTEMS = Object.freeze(['actions', 'flightV3', tumbleStates, 'physics']);

const SETTLE_TICKS = 30;
const TOTAL_TICKS = 270; // 4.5 seconds: 0.5s pre-throw, tumble duration, plus recovery observation

export const scenario = {
  id: 'feel.tumble_trail',
  label: 'B11/PQ-139 Tumble trail geometry and lateral excursion on production path',
  async run(seed) {
    if (!Number.isFinite(seed)) throw new Error('feel.tumble_trail: seed must be a finite number');

    const eventTrace = [];
    const straight = await runTumbleCase({ seed, caseName: 'matched_straight', deltaV: 0, eventTrace });
    const moderate = await runTumbleCase({ seed, caseName: 'moderate_tumble', deltaV: 50, eventTrace });
    const saturated = await runTumbleCase({ seed, caseName: 'saturated_tumble', deltaV: 120, eventTrace });

    const bars = [
      finiteBar(
        'PQ-139.04-turns',
        'actual yaw turns during tumble (physics context, not a full-turn requirement)',
        saturated.yawTurns,
        'turns',
        (value) => value > 0,
        (value) => `${value.toFixed(3)} actual yaw turns / ${fmtFinite(saturated.totalYawRad)} rad; the active outcome judges the presented wake, not a minimum full physics rotation`,
      ),
      finiteBar(
        'PQ-139.04-crosstrack',
        'peak max cross-track departure in shipping XZ projection',
        saturated.peakMaxCrossTrackWU,
        'WU',
        (value) => value > 2.0,
        (value, met) => (met
          ? `production dynamic impulse yields ${value.toFixed(3)} WU peak departure (${fmtFinite(saturated.peakNozzleExcursionRadii)} hull radii), refuting the invalid 0 WU baseline`
          : `peak max cross-track ${value.toFixed(3)} WU is not above 2.0 WU; shipping XZ projection did not produce a durable wake excursion`),
      ),
      finiteBar(
        'PQ-139.04-recovery',
        'retained wake straightens out upon recovery (residual max cross-track < 0.05 WU)',
        saturated.terminalResidualCrossTrackWU,
        'WU',
        (value) => value < 0.05 && Number.isFinite(saturated.recoveryTimeS),
        (value, met) => {
          if (saturated.recoveryTimeS == null) {
            return `recovery was not observed; terminal residual ${value.toFixed(4)} WU remains an open measurement, not a green zero`;
          }
          return met
            ? `retained wake straightens back to ${value.toFixed(4)} WU following recovery torque (${saturated.recoveryTimeS.toFixed(3)} s)`
            : `retained wake residual ${value.toFixed(4)} WU after observed recovery (${saturated.recoveryTimeS.toFixed(3)} s) did not fall below 0.05 WU`;
        },
      ),
    ];

    return {
      eventTrace,
      metrics: {
        schema: 'spaceface.feel.tumbleTrail.v1',
        seed,
        projection: 'shipping XZ projection',
        historicalBaseline: HISTORICAL_BASELINE,
        cases: {
          matched_straight: straight,
          moderate_tumble: moderate,
          saturated_tumble: saturated,
        },
        bars,
      },
    };
  },
};

/**
 * Run one tumble trail case on the real production path.
 *
 * @param {object} options
 * @param {number} options.seed
 * @param {string} options.caseName
 * @param {number} options.deltaV
 * @param {Array} options.eventTrace
 */
export async function runTumbleCase({ seed, caseName, deltaV = 0, eventTrace = [] } = {}) {
  const host = await bootRealPath({
    seed,
    profileId: 'production',
    systems: SCENARIO_SYSTEMS,
    hulls: [
      { defId: 'ship_drifter', id: 1, pos: { x: 0, z: 0 }, isPlayer: true, loadoutId: 'massline_rig' },
      { defId: 'ship_ironback', id: 2, pos: { x: 100, z: 0 } },
    ],
  });

  const proof = host.proof();
  if (proof.backend !== 'rapier-dynamic') {
    throw new Error(`feel.tumble_trail: fail-closed: backend is ${proof.backend}, expected rapier-dynamic`);
  }

  const victim = host.state.entities.get(2);
  if (!victim) throw new Error('feel.tumble_trail: victim entity 2 not found');
  victim.radius = 24; // ribbon-eligible medium-large ship

  const scene = new THREE.Scene();
  host.state.render = { scene };
  host.state.player = { cruise: null, targetId: victim.id };

  // Production-style trail socket: marked spacefaceSocket on local -X, matching
  // ensureStandardSockets() axis/role and the shipping fallback distance (-0.88 * radius).
  const root = new THREE.Group();
  const hull = new THREE.Group();
  const socket = new THREE.Group();
  socket.name = 'SOCKET_Trail_Main';
  socket.position.set(-victim.radius * 0.88, -0.04, 0);
  socket.userData = { spacefaceSocket: true, role: 'vfx', forward: [-1, 0, 0] };
  hull.add(socket);
  root.add(hull);
  victim.view = { root, hull, mesh: hull };

  const vfxSys = Object.create(vfx);
  vfxSys.init({ state: host.state, bus: host.bus, helpers: {} });

  let tumbleReceipt = null;
  host.bus.on('massline:tumbled', (e) => {
    if (e && e.victimId === victim.id) {
      tumbleReceipt = e;
      eventTrace.push({ tick: host.state.tick, event: 'massline:tumbled', payload: e });
    }
  });

  const hullMass = resolveFlightProfile('ship_ironback')?.mass || 90;

  let maxPeakCrossTrack = 0;
  let peakMeanCrossTrack = 0;
  let peakReversals = 0;
  let lastYaw = victim.rot || 0;
  let unwrappedYaw = lastYaw;
  let totalYawTravel = 0;
  let entrySpin = 0;
  let peakSpin = 0;
  let endSpin = 0;
  let tumbleEndedTick = null;
  let recoveryTimeS = null;
  let terminalResidualCrossTrack = 0;
  let ribbonEverVisible = false;
  let peakHistoryCount = 0;
  let observedHistoryCapacity = null;
  let socketSamplerHits = 0;
  let fallbackSamplerHits = 0;
  let peakDrive = 0;
  let peakThrottle = 0;
  let peakSpeed = 0;
  let driveSampleCount = 0;
  let driveSum = 0;
  let peakAppliedThrust = 0;
  const sampleSocket = vfxSys._trailSocketPoseFromObject;
  vfxSys._trailSocketPoseFromObject = function (object) {
    if (object === socket) socketSamplerHits += 1;
    return sampleSocket.call(this, object);
  };
  const sampleWorldSocket = vfxSys._trailSocketWorldPose;
  vfxSys._trailSocketWorldPose = function (entity) {
    const pose = sampleWorldSocket.call(this, entity);
    if (entity === victim && !pose) fallbackSamplerHits += 1;
    return pose;
  };

  try {
    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
      writeNpcIntent(victim, { moveZ: 1 });

      if (tick === SETTLE_TICKS && deltaV > 0) {
        host.withFeatures(() => {
          queuePhysicsImpulse(victim, { x: 0, y: 0, z: hullMass * deltaV });
          host.bus.emit('massline:throw', { payloadId: victim.id, payloadSpeed: deltaV });
        });
      }

      host.step(1);
      if (tick === 0) {
        host.assertBodies([victim], `feel.tumble_trail ${caseName}`);
      }

    const telem = readPhysicsTelemetry(victim);
    const angVel = Math.abs(telem.angVel || victim.angVel || 0);
    if (tick === SETTLE_TICKS && deltaV > 0) {
      entrySpin = angVel;
    }
    if (angVel > peakSpin) peakSpin = angVel;
    if (tick >= SETTLE_TICKS) endSpin = angVel;

    const curYaw = victim.rot || 0;
    let dYaw = curYaw - lastYaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    unwrappedYaw += dYaw;
    totalYawTravel += Math.abs(dYaw);
    lastYaw = curYaw;

    updateShipPitchPresentation(host.state, 1 / 60);
    root.position.set(victim.pos.x, 0, victim.pos.z);
    root.rotation.y = -curYaw;
    // renderer.js applies the presentation owner's entity.bank/pitch, not view-only fields.
    hull.rotation.x = victim.bank || 0;
    hull.rotation.z = victim.pitch || 0;
    socket.updateWorldMatrix(true, false);

    const driveInfo = vfxSys._engineDriveFor(victim);
    const drive = Number(driveInfo && driveInfo.drive);
    const throttle = Number(driveInfo && driveInfo.throttle);
    const speed = Number(driveInfo && driveInfo.speed);
    if (Number.isFinite(drive)) {
      driveSampleCount += 1;
      driveSum += drive;
      if (drive > peakDrive) peakDrive = drive;
    }
    if (Number.isFinite(throttle) && throttle > peakThrottle) peakThrottle = throttle;
    if (Number.isFinite(speed) && speed > peakSpeed) peakSpeed = speed;
    const appliedThrust = telem && telem.force
      ? Math.hypot(telem.force.x, telem.force.z) : NaN;
    if (Number.isFinite(appliedThrust)) peakAppliedThrust = Math.max(peakAppliedThrust, appliedThrust);

    vfxSys._updateRibbonTrails(1 / 60);

    const trail = vfxSys._ribbonTrails.get(victim.id);
    let frameMaxDev = null;
    let frameMeanDev = 0;

    if (trail) {
      const stats = trail.inspect();
      if (Number.isFinite(stats.capacity)) observedHistoryCapacity = stats.capacity;
      if (Number.isFinite(stats.historyCount) && stats.historyCount > peakHistoryCount) {
        peakHistoryCount = stats.historyCount;
      }
      if (trail.getMesh().visible && stats.historyCount > 0) ribbonEverVisible = true;

      const geo = trail.getMesh().geometry;
      const posAttr = geo.attributes.position.array;
      const rendered = stats.renderedCount;
      if (trail.getMesh().visible && rendered >= 3) {
        frameMaxDev = 0;
        const pts = [];
        for (let i = 0; i < rendered; i++) {
          pts.push({
            x: (posAttr[i * 6] + posAttr[i * 6 + 3]) * 0.5,
            z: (posAttr[i * 6 + 2] + posAttr[i * 6 + 5]) * 0.5,
          });
        }
        let mx = 0;
        let mz = 0;
        for (let i = 0; i < pts.length; i++) {
          mx += pts[i].x;
          mz += pts[i].z;
        }
        mx /= pts.length;
        mz /= pts.length;

        let cxx = 0;
        let czz = 0;
        let cxz = 0;
        for (let i = 0; i < pts.length; i++) {
          const dx = pts[i].x - mx;
          const dz = pts[i].z - mz;
          cxx += dx * dx;
          czz += dz * dz;
          cxz += dx * dz;
        }
        cxx /= pts.length;
        czz /= pts.length;
        cxz /= pts.length;

        // Principal motion axis and normal
        const theta = 0.5 * Math.atan2(2 * cxz, cxx - czz);
        const nx = -Math.sin(theta);
        const nz = Math.cos(theta);

        const signedDevs = [];
        let sumDev = 0;
        for (let i = 0; i < pts.length; i++) {
          const signedDev = (pts[i].x - mx) * nx + (pts[i].z - mz) * nz;
          const absDev = Math.abs(signedDev);
          signedDevs.push(signedDev);
          if (absDev > frameMaxDev) frameMaxDev = absDev;
          sumDev += absDev;
        }
        frameMeanDev = sumDev / pts.length;

        const reversals = countZeroCompressedReversals(signedDevs, 0.05);
        if (reversals > peakReversals) peakReversals = reversals;
        if (frameMaxDev > maxPeakCrossTrack) maxPeakCrossTrack = frameMaxDev;
        if (frameMeanDev > peakMeanCrossTrack) peakMeanCrossTrack = frameMeanDev;
        terminalResidualCrossTrack = frameMaxDev;
      }
    }

      if (tumbleReceipt && tumbleEndedTick == null && tick > SETTLE_TICKS) {
        if (readControlLossPresentation(host.state, victim).mode !== 'tumbling') tumbleEndedTick = tick;
      }
      if (tumbleEndedTick != null && recoveryTimeS == null && tick > tumbleEndedTick) {
        if (Number.isFinite(frameMaxDev) && frameMaxDev < 0.05) {
          recoveryTimeS = (tick - tumbleEndedTick) / 60;
        }
      }
    }

    if (socketSamplerHits <= 0 || fallbackSamplerHits > 0) {
      throw new Error(
        `feel.tumble_trail: fail-closed: production socket sampler was not used for ${caseName} `
        + `(socketHits=${socketSamplerHits}, fallbackHits=${fallbackSamplerHits})`,
      );
    }
    if (!ribbonEverVisible) {
      throw new Error(`feel.tumble_trail: fail-closed: live ribbon was never created/visible for ${caseName}`);
    }
    if (!(peakHistoryCount > 0)) {
      throw new Error(`feel.tumble_trail: fail-closed: ribbon history never accumulated for ${caseName}`);
    }
    if (observedHistoryCapacity !== 24) {
      throw new Error(
        `feel.tumble_trail: fail-closed: observed ribbon capacity ${observedHistoryCapacity} is not the governed 24 for ${caseName}`,
      );
    }
    if (!(peakSpeed > 4) || !(peakAppliedThrust > 0)) {
      throw new Error(
        `feel.tumble_trail: fail-closed: no real drive/thrust evidence for ${caseName} `
        + `(peakSpeed=${peakSpeed}, peakAppliedThrust=${peakAppliedThrust})`,
      );
    }

    // Fail-closed checks for tumble cases
    if (deltaV > 0) {
      if (!tumbleReceipt) {
        throw new Error(`feel.tumble_trail: fail-closed: massline:tumbled event was not received for ${caseName}`);
      }
      if (tumbleReceipt.victimId !== victim.id) {
        throw new Error(`feel.tumble_trail: fail-closed: tumble receipt victimId ${tumbleReceipt.victimId} !== ${victim.id}`);
      }
      if (!(peakSpin > 0.1)) {
        throw new Error(`feel.tumble_trail: fail-closed: measured peak angVel ${peakSpin} was not nonzero for ${caseName}`);
      }
    }
  } finally {
    host.dispose();
  }

  return {
    caseName,
    seed,
    deltaV,
    totalYawRad: totalYawTravel,
    unwrappedYawRad: unwrappedYaw,
    yawTurns: totalYawTravel / (2 * Math.PI),
    entrySpin,
    peakSpin,
    endSpin,
    historyCount: peakHistoryCount,
    historyCapacity: observedHistoryCapacity,
    peakMeanCrossTrackWU: peakMeanCrossTrack,
    peakMaxCrossTrackWU: maxPeakCrossTrack,
    peakNozzleExcursionWU: maxPeakCrossTrack,
    peakNozzleExcursionRadii: maxPeakCrossTrack / victim.radius,
    lateralReversals: peakReversals,
    lateralCycles: peakReversals / 2,
    recoveryTimeS,
    terminalResidualCrossTrackWU: terminalResidualCrossTrack,
    tumbledReceiptReceived: !!tumbleReceipt,
    socketSamplerUsed: socketSamplerHits > 0 && fallbackSamplerHits === 0,
    socketSamplerHits,
    fallbackSamplerHits,
    peakDrive,
    peakThrottle,
    peakAppliedThrust,
    peakSpeed,
    meanDrive: driveSampleCount > 0 ? driveSum / driveSampleCount : 0,
  };
}

function countZeroCompressedReversals(devs, deadband = 0.05) {
  let lastSign = 0;
  let reversals = 0;
  for (let i = 0; i < devs.length; i++) {
    const value = devs[i];
    if (!Number.isFinite(value) || Math.abs(value) <= deadband) continue;
    const sign = value > 0 ? 1 : -1;
    if (lastSign !== 0 && sign !== lastSign) reversals += 1;
    lastSign = sign;
  }
  return reversals;
}

function fmtFinite(value) {
  return Number.isFinite(value) ? value.toFixed(3) : 'non-finite';
}

function finiteBar(id, label, value, unit, metWhenFinite, noteWhenFinite) {
  const finite = Number.isFinite(value);
  const met = finite ? !!metWhenFinite(value) : false;
  const note = finite
    ? noteWhenFinite(value, met)
    : `${label}: missing/non-finite value fails closed`;
  return { bar: id, label, value: finite ? value : null, unit, met, note };
}
