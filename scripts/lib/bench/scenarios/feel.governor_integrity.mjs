// PQ-137.03b — assisted governor integrity on the production Rapier path.
// Caps planar speed the ship's own translation creates; preserves given momentum.
import { PROPULSION_PROFILES, resolveGovernedCombatSpeed } from '../../../../src/core/flight/propulsionCatalog.js';
import { resolveTravelCeiling } from '../../../../src/core/flight/propulsionKernel.js';
import { writeRealPathInput } from '../realPath.mjs';
import {
  bootPlayer,
  settle,
  planarSpeed,
  queueDoubleCruiseImpulse,
} from './feel.screen_crossing.mjs';

const HULL_ID = 'ship_kestrel';
const STRAIGHT_TICKS = 900;
const WEAVE_TICKS = 2400;
const HOLD_TICKS = 1800;
const BOOST_TICKS = 900;
const UNGOVERNED_TICKS = 900;
const YAW_TICKS = 180;
const EARNED_HOLD_TICKS = 60;
const WEAVE_MARK_S = Object.freeze([10, 20, 30, 40]);

export const AUTHORED_TRAVEL_CEILINGS = Object.freeze({
  drive_reaction_s: 472.5,
  drive_reaction_m: 438.75,
  drive_reaction_l: 382.5,
  drive_gravimetric_s: 252,
  drive_gravimetric_m: 225,
  drive_pulse_plate_m: 715,
  drive_torch_l: 1120,
  drive_field_sail_m: 190,
});

export const scenario = {
  id: 'feel.governor_integrity',
  label: 'B1 Governor integrity — planar assisted cap, weave/lateral/boost/earned, Drift and Newtonian ungoverned (real path)',
  async run(seed) {
    const eventTrace = [];
    const hitch = await measureHitch(seed, eventTrace);
    const travelCeilings = snapshotTravelCeilings();
    const bars = hitch.bars.concat(travelCeilingBars(travelCeilings));

    return {
      eventTrace,
      metrics: {
        seed,
        hullId: HULL_ID,
        cruiseSpeed: hitch.cruiseSpeed,
        boostCap: hitch.boostCap,
        weaveMarks: hitch.weaveMarks,
        terminalWeaveSpeed: hitch.terminalWeaveSpeed,
        terminalWeaveRatio: hitch.terminalWeaveRatio,
        diagonalLeftRatio: hitch.diagonalLeftRatio,
        diagonalRightRatio: hitch.diagonalRightRatio,
        lateralRatio: hitch.lateralRatio,
        boostRatio: hitch.boostRatio,
        driftRatio: hitch.driftRatio,
        newtonianRatio: hitch.newtonianRatio,
        earnedKeptFraction: hitch.earnedKeptFraction,
        travelCeilings,
        realPathProof: hitch.proof,
        bars,
      },
    };
  },
};

async function measureHitch(seed, eventTrace) {
  const straight = await runThrottleArm(seed, eventTrace, 'straight', { moveZ: 1 }, STRAIGHT_TICKS);
  const cruiseSpeed = straight.governedCruise;
  const boostCap = cruiseSpeed * hitchBoostMult();

  const weave = await runWeaveArm(seed, eventTrace, cruiseSpeed);
  const diagonalLeft = await runThrottleArm(seed, eventTrace, 'diagonalLeft', { moveZ: 1, moveX: -1 }, HOLD_TICKS);
  const diagonalRight = await runThrottleArm(seed, eventTrace, 'diagonalRight', { moveZ: 1, moveX: 1 }, HOLD_TICKS);
  const lateral = await runThrottleArm(seed, eventTrace, 'lateral', { moveX: 1 }, HOLD_TICKS);
  const boost = await runThrottleArm(seed, eventTrace, 'boost', { moveZ: 1, boost: true }, BOOST_TICKS);
  const drift = await runModeArm(seed, eventTrace, 'drift', 'drift', { moveZ: 1 }, UNGOVERNED_TICKS);
  const newtonian = await runModeArm(seed, eventTrace, 'newtonian', 'newtonian', { moveZ: 1 }, UNGOVERNED_TICKS);
  const earned = await runEarnedObliqueArm(seed, eventTrace, cruiseSpeed);

  const terminalWeaveRatio = ratio(weave.finalSpeed, cruiseSpeed);
  const diagonalLeftRatio = ratio(diagonalLeft.finalSpeed, cruiseSpeed);
  const diagonalRightRatio = ratio(diagonalRight.finalSpeed, cruiseSpeed);
  const lateralRatio = ratio(lateral.finalSpeed, cruiseSpeed);
  const boostRatio = ratio(boost.finalSpeed, boostCap);
  const driftRatio = ratio(drift.finalSpeed, cruiseSpeed);
  const newtonianRatio = ratio(newtonian.finalSpeed, cruiseSpeed);

  const bars = [
    bar('B1', 'straight assisted cruise vs governed cap, Hitch', ratio(straight.finalSpeed, cruiseSpeed), 'fraction',
      Math.abs(straight.finalSpeed - cruiseSpeed) <= cruiseSpeed * 0.01,
      `governed ${cruiseSpeed} WU/s, measured ${straight.finalSpeed} WU/s`),
    bar('B1', 'terminal weave speed / cruise, Hitch 40 s', terminalWeaveRatio, 'fraction',
      terminalWeaveRatio <= 1.02,
      `marks ${JSON.stringify(weave.marks)}; terminal ${weave.finalSpeed} WU/s`),
    bar('B1', 'held W+A speed / cruise, Hitch', diagonalLeftRatio, 'fraction', diagonalLeftRatio <= 1.02),
    bar('B1', 'held W+D speed / cruise, Hitch', diagonalRightRatio, 'fraction', diagonalRightRatio <= 1.02),
    bar('B1', 'pure lateral speed / cruise, Hitch', lateralRatio, 'fraction', lateralRatio <= 1.02),
    bar('B1', 'held boost speed / authored boost cap, Hitch', boostRatio, 'fraction', boostRatio <= 1.02,
      `boost cap ${boostCap} WU/s`),
    bar('B1', 'Drift remains ungoverned, Hitch', driftRatio, 'fraction',
      drift.governor == null && driftRatio > 1.5),
    bar('B1', 'Newtonian remains ungoverned, Hitch', newtonianRatio, 'fraction',
      newtonian.governor == null && newtonianRatio > 1.5),
    bar('B1', 'oblique 2x physics-earned kept after 1 s held thrust, Hitch', earned.keptFraction, 'fraction',
      earned.keptFraction >= 0.99,
      `exit ${earned.exitSpeed} WU/s`),
  ];

  return {
    cruiseSpeed,
    boostCap,
    weaveMarks: weave.marks,
    terminalWeaveSpeed: weave.finalSpeed,
    terminalWeaveRatio,
    diagonalLeftRatio,
    diagonalRightRatio,
    lateralRatio,
    boostRatio,
    driftRatio,
    newtonianRatio,
    earnedKeptFraction: earned.keptFraction,
    proof: straight.proof,
    bars,
  };
}

async function runThrottleArm(seed, eventTrace, name, input, ticks) {
  const host = await bootPlayer(seed, HULL_ID);
  try {
    settle(host);
    host.step(ticks, {
      before: ({ state }) => { writeRealPathInput(state, input); },
    });
    const finalSpeed = planarSpeed(host.player);
    const governor = readGovernor(host.player);
    const governedCruise = resolveGovernedCombatSpeed(
      host.player,
      host.state,
      PROPULSION_PROFILES.drive_reaction_m.combatSpeed,
    );
    pushTrace(eventTrace, host, `${name}:end`, { finalSpeed, governorCap: governor && governor.cap, governedCruise });
    return { finalSpeed, governor, governedCruise, proof: host.proof() };
  } finally {
    host.dispose();
  }
}

async function runModeArm(seed, eventTrace, name, assistMode, input, ticks) {
  const host = await bootPlayer(seed, HULL_ID);
  try {
    settle(host);
    host.step(ticks, {
      before: ({ state }) => {
        writeRealPathInput(state, input);
        state.input.assistMode = assistMode;
      },
    });
    const finalSpeed = planarSpeed(host.player);
    const governor = readGovernor(host.player);
    pushTrace(eventTrace, host, `${name}:end`, { finalSpeed, governor: governor && { cap: governor.cap } });
    return { finalSpeed, governor, proof: host.proof() };
  } finally {
    host.dispose();
  }
}

async function runWeaveArm(seed, eventTrace, cruiseSpeed) {
  const host = await bootPlayer(seed, HULL_ID);
  try {
    settle(host);
    const marks = {};
    host.step(WEAVE_TICKS, {
      before: ({ index, state }) => {
        writeRealPathInput(state, {
          moveZ: 1,
          turnIntent: Math.sin(index / 600) * 0.06,
        });
      },
      after: ({ index, host: h }) => {
        const t = (index + 1) / 60;
        if (WEAVE_MARK_S.includes(t)) {
          marks[t] = planarSpeed(h.player);
        }
      },
    });
    const finalSpeed = planarSpeed(host.player);
    pushTrace(eventTrace, host, 'weave:end', {
      finalSpeed,
      marks,
      cruiseSpeed,
    });
    return { finalSpeed, marks, proof: host.proof() };
  } finally {
    host.dispose();
  }
}

async function runEarnedObliqueArm(seed, eventTrace, cruiseSpeed) {
  const host = await bootPlayer(seed, HULL_ID);
  try {
    const player = host.player;
    settle(host);
    host.step(STRAIGHT_TICKS, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); },
    });
    host.step(1, {
      before: ({ state, host: h }) => {
        writeRealPathInput(state, { moveZ: 1 });
        queueDoubleCruiseImpulse(h.player, cruiseSpeed);
      },
    });
    const startRot = player.rot || 0;
    host.step(YAW_TICKS, {
      before: ({ state, host: h }) => {
        const err = wrapPi((startRot + Math.PI / 2) - (h.player.rot || 0));
        writeRealPathInput(state, {
          turnIntent: Math.max(-1, Math.min(1, err / 0.32)),
        });
      },
      after: ({ host: h }) => {
        const err = wrapPi((startRot + Math.PI / 2) - (h.player.rot || 0));
        if (Math.abs(err) < 0.06) return false;
      },
    });
    const exitSpeed = planarSpeed(player);
    host.step(EARNED_HOLD_TICKS, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); },
    });
    const speedAt1s = planarSpeed(player);
    const keptFraction = exitSpeed > 0 ? speedAt1s / exitSpeed : 0;
    pushTrace(eventTrace, host, 'earnedOblique:end', { exitSpeed, speedAt1s, keptFraction });
    return { exitSpeed, speedAt1s, keptFraction, proof: host.proof() };
  } finally {
    host.dispose();
  }
}

function snapshotTravelCeilings() {
  const authored = {};
  const resolved = {};
  for (const [id, profile] of Object.entries(PROPULSION_PROFILES)) {
    authored[id] = profile.travelCeiling;
    resolved[id] = resolveTravelCeiling(profile);
  }
  return { authored, resolved };
}

function travelCeilingBars(travelCeilings) {
  const authoredMet = Object.entries(AUTHORED_TRAVEL_CEILINGS).every(([id, value]) => (
    travelCeilings.authored[id] === value
  ));
  return [
    bar('B1', 'authored travel ceilings unchanged', authoredMet ? 1 : 0, 'bool', authoredMet),
  ];
}

function hitchBoostMult() {
  const profile = PROPULSION_PROFILES.drive_reaction_m;
  return Number.isFinite(profile.boostSpeedMult) && profile.boostSpeedMult > 0
    ? profile.boostSpeedMult
    : 1.55;
}

function readGovernor(player) {
  const frame = player && player._flightFrame;
  return frame && frame.governor ? frame.governor : null;
}

function ratio(speed, cap) {
  return cap > 0 ? speed / cap : 0;
}

function bar(id, label, value, unit, met, note) {
  return {
    bar: id,
    label,
    value,
    unit,
    met: !!met,
    ...(note ? { note } : {}),
  };
}

function wrapPi(value) {
  let v = value;
  while (v <= -Math.PI) v += Math.PI * 2;
  while (v > Math.PI) v -= Math.PI * 2;
  return v;
}

function pushTrace(eventTrace, host, type, extra = {}) {
  const state = host.state;
  eventTrace.push({
    tick: state.tick | 0,
    simTime: state.simTime,
    type,
    ...    extra,
  });
}
