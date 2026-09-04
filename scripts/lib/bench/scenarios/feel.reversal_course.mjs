// B2 — nimble regime. Rest→cruise, 180° velocity reversal (Motion Lab M3), and
// turn radius at cruise in screen depths, measured on the real path.
import { wrapAngle } from '../../../../src/core/rng.js';
import { runM3 } from '../../../../src/systems/motionScenarios.js';
import { writeRealPathInput } from '../realPath.mjs';
import {
  bootPlayer,
  settle,
  planarSpeed,
  chaseCameraRefs,
  screenDepthWuAtSpeed,
} from './feel.screen_crossing.mjs';

const CRUISE_HOLD_TICKS = 900;
const TURN_SWEEP_TICKS = 1800;
const NINETY_DEG = Math.PI / 2;
const HULLS = Object.freeze([
  Object.freeze({ hullId: 'ship_kestrel', key: 'hitch', name: 'Hitch (starter)' }),
  Object.freeze({ hullId: 'ship_wasp', key: 'wasp', name: 'Wasp' }),
]);

export const scenario = {
  id: 'feel.reversal_course',
  label: 'B2 Nimble regime — rest to cruise, 180 degree velocity reversal, turn radius at cruise (real path)',
  async run(seed) {
    const eventTrace = [];
    const hulls = {};
    const bars = [];
    const realPathProof = {};

    for (const hull of HULLS) {
      const measured = await measureHull(seed, hull, eventTrace);
      hulls[hull.hullId] = measured.metrics;
      realPathProof[hull.key] = measured.proof;
      bars.push(...measured.bars);
    }

    return {
      eventTrace,
      metrics: {
        seed,
        hulls,
        ship_kestrel: hulls.ship_kestrel,
        ship_wasp: hulls.ship_wasp,
        realPathProof,
        bars,
      },
    };
  },
};

async function measureHull(seed, hull, eventTrace) {
  const rest = await measureRestToCruise(seed, hull, eventTrace);
  const velocity180TimeS = await measureVelocity180(seed, hull, eventTrace);
  const turn = await measureTurnRadius(seed, hull, eventTrace);

  const restMet = Number.isFinite(rest.restToCruiseS) && rest.restToCruiseS <= 1.5;
  const reversalMet = Number.isFinite(velocity180TimeS) && velocity180TimeS <= 3.0;
  const radiusMet = Number.isFinite(turn.turnRadiusScreenDepths) && turn.turnRadiusScreenDepths <= 1.0;

  const restNote = rest.cruiseAsymptoteConverged
    ? undefined
    : 'cruise asymptote had not converged: speed still rising by more than 0.5 WU/s over the last 60 ticks';
  const reversalNote = Number.isFinite(velocity180TimeS)
    ? undefined
    : 'the M3 tape never completed the reversal';
  const radiusNote = turn.sweepIncomplete
    ? '90 deg velocity sweep incomplete in 1800 ticks; turn radius unmeasured'
    : `r = ${turn.turnRadiusWu} WU at cruise ${turn.cruiseSpeed} WU/s; screen depth ${turn.screenDepthAtCruiseWu} WU read from the live chase camera`;

  const bars = [
    {
      bar: 'B2',
      label: `rest to cruise, ${hull.name}`,
      value: rest.restToCruiseS,
      unit: 's',
      met: restMet,
      ...(restNote ? { note: restNote } : {}),
    },
    {
      bar: 'B2',
      label: `full 180 deg velocity reversal, ${hull.name}`,
      value: velocity180TimeS,
      unit: 's',
      met: reversalMet,
      ...(reversalNote ? { note: reversalNote } : {}),
    },
    {
      bar: 'B2',
      label: `turn radius at cruise, ${hull.name}`,
      value: turn.barTurnRadiusScreenDepths,
      unit: 'screen depths',
      met: radiusMet,
      note: radiusNote,
    },
  ];

  return {
    proof: { restToCruise: rest.proof, turnRadius: turn.proof },
    bars,
    metrics: {
      seed,
      cruiseSpeed: rest.cruiseSpeed,
      restToCruiseS: rest.restToCruiseS,
      cruiseAsymptoteConverged: rest.cruiseAsymptoteConverged,
      velocity180TimeS,
      turnRadiusWu: turn.turnRadiusWu,
      turnRadiusScreenDepths: turn.turnRadiusScreenDepths,
      turnRateRadPerS: turn.turnRateRadPerS,
      screenDepthAtCruiseWu: turn.screenDepthAtCruiseWu,
      sweepIncomplete: turn.sweepIncomplete,
      maxSpeedRef: rest.maxSpeedRef,
    },
  };
}

async function measureRestToCruise(seed, hull, eventTrace) {
  const host = await bootPlayer(seed, hull.hullId);
  try {
    const player = host.player;
    settle(host);
    pushTrace(eventTrace, host, `${hull.key}:rest:settle:end`);

    const samples = [];
    let holdStartSimTime = null;
    host.step(CRUISE_HOLD_TICKS, {
      before: ({ index, state }) => {
        writeRealPathInput(state, { moveZ: 1 });
        if (index === 0) holdStartSimTime = state.simTime;
      },
      after: ({ state, host: h }) => {
        samples.push({ simTime: state.simTime, speed: planarSpeed(h.player) });
      },
    });

    const cruiseSpeed = samples.length ? samples[samples.length - 1].speed : 0;
    const threshold = 0.95 * cruiseSpeed;
    const crossed = samples.find((row) => row.speed >= threshold);
    const restToCruiseS = crossed && holdStartSimTime != null
      ? crossed.simTime - holdStartSimTime
      : null;

    let cruiseAsymptoteConverged = true;
    if (samples.length >= 61) {
      const last = samples[samples.length - 1].speed;
      const prior = samples[samples.length - 61].speed;
      if (last - prior > 0.5) cruiseAsymptoteConverged = false;
    }

    const { fovDeg, maxSpeedRef } = chaseCameraRefs(host.state, player);
    pushTrace(eventTrace, host, `${hull.key}:rest:cruise:sampled`, {
      cruiseSpeed,
      restToCruiseS,
      cruiseAsymptoteConverged,
    });

    return {
      cruiseSpeed,
      restToCruiseS,
      cruiseAsymptoteConverged,
      fovDeg,
      maxSpeedRef,
      proof: host.proof(),
    };
  } finally {
    host.dispose();
  }
}

async function measureVelocity180(seed, hull, eventTrace) {
  const m3 = await runM3({ seed, hullId: hull.hullId });
  const row = m3 && m3.metrics && m3.metrics.hulls && m3.metrics.hulls[hull.hullId];
  const velocity180TimeS = row && Number.isFinite(row.velocity180TimeS) ? row.velocity180TimeS : null;
  eventTrace.push({
    tick: null,
    simTime: null,
    type: `${hull.key}:m3:velocity180`,
    hullId: hull.hullId,
    velocity180TimeS,
  });
  return velocity180TimeS;
}

async function measureTurnRadius(seed, hull, eventTrace) {
  const host = await bootPlayer(seed, hull.hullId);
  try {
    const player = host.player;
    settle(host);
    host.step(CRUISE_HOLD_TICKS, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); },
    });
    const cruiseSpeed = planarSpeed(player);
    const { fovDeg, maxSpeedRef } = chaseCameraRefs(host.state, player);
    const screenDepthAtCruiseWu = screenDepthWuAtSpeed(cruiseSpeed, {
      fovDeg,
      maxSpeedRef,
      physicsEarned: false,
    });
    pushTrace(eventTrace, host, `${hull.key}:turn:cruise:sampled`, { cruiseSpeed, screenDepthAtCruiseWu });

    let prevHeading = null;
    let sweptRad = 0;
    let speedSum = 0;
    let speedN = 0;
    let startSimTime = null;
    let endSimTime = null;
    let reached = false;

    host.step(TURN_SWEEP_TICKS, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1, turnIntent: 1 }); },
      after: ({ state, host: h }) => {
        const vel = h.player.vel;
        const heading = Math.atan2(vel.z, vel.x);
        const speed = planarSpeed(h.player);
        if (prevHeading == null) {
          prevHeading = heading;
          startSimTime = state.simTime;
          endSimTime = state.simTime;
          speedSum += speed;
          speedN += 1;
          return;
        }
        sweptRad += wrapAngle(heading - prevHeading);
        prevHeading = heading;
        endSimTime = state.simTime;
        speedSum += speed;
        speedN += 1;
        if (Math.abs(sweptRad) >= NINETY_DEG) {
          reached = true;
          return false;
        }
      },
    });

    const sweepS = startSimTime != null && endSimTime != null ? endSimTime - startSimTime : 0;
    const meanSpeed = speedN > 0 ? speedSum / speedN : 0;
    const signedRate = sweepS > 0 ? sweptRad / sweepS : null;
    const turnRateRadPerS = Number.isFinite(signedRate) ? Math.abs(signedRate) : null;
    const sweepIncomplete = !reached;
    const partialRadiusWu = Number.isFinite(turnRateRadPerS) && turnRateRadPerS > 0
      ? meanSpeed / turnRateRadPerS
      : null;
    const partialScreenDepths = Number.isFinite(partialRadiusWu) && screenDepthAtCruiseWu > 0
      ? partialRadiusWu / screenDepthAtCruiseWu
      : null;
    const turnRadiusWu = sweepIncomplete ? null : partialRadiusWu;
    const turnRadiusScreenDepths = sweepIncomplete ? null : partialScreenDepths;

    pushTrace(eventTrace, host, `${hull.key}:turn:sweep:${reached ? 'complete' : 'incomplete'}`, {
      sweptRad,
      sweepS,
      meanSpeed,
      turnRadiusWu,
      turnRadiusScreenDepths,
    });

    return {
      cruiseSpeed,
      screenDepthAtCruiseWu,
      turnRadiusWu,
      turnRadiusScreenDepths,
      barTurnRadiusScreenDepths: Number.isFinite(turnRadiusScreenDepths)
        ? turnRadiusScreenDepths
        : partialScreenDepths,
      turnRateRadPerS,
      sweepIncomplete,
      proof: host.proof(),
    };
  } finally {
    host.dispose();
  }
}

function pushTrace(eventTrace, host, type, extra = {}) {
  const state = host.state;
  eventTrace.push({
    tick: state.tick | 0,
    simTime: state.simTime,
    type,
    ...extra,
  });
}
