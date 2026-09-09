// B1 — earned speed is kept. 2× cruise exit by physics impulse, then 10 s later
// hands-off and with forward held, measured on the real path.
import { writeRealPathInput } from '../realPath.mjs';
import {
  bootPlayer,
  settle,
  planarSpeed,
  queueDoubleCruiseImpulse,
} from './feel.screen_crossing.mjs';

const CRUISE_HOLD_TICKS = 900;
const HOLD_10S_TICKS = 600;
const HULL_ID = 'ship_kestrel';

export const scenario = {
  id: 'feel.earned_speed_kept',
  label: 'B1 Earned speed is kept — 2x cruise exit by impulse, 10 s later hands off and with forward held (real path)',
  async run(seed) {
    const eventTrace = [];
    const handsOff = await runKeptTape(seed, HULL_ID, 'handsOff', eventTrace);
    const forwardHeld = await runKeptTape(seed, HULL_ID, 'forwardHeld', eventTrace);

    const bars = [
      {
        bar: 'B1',
        label: 'speed kept 10 s after a 2x cruise exit, hands off',
        value: handsOff.keptFraction,
        unit: 'fraction',
        met: Number.isFinite(handsOff.keptFraction) && handsOff.keptFraction >= 0.99,
        note: `exit ${handsOff.exitSpeed} WU/s from a physics impulse; cruise ${handsOff.cruiseSpeed} WU/s`,
      },
      {
        bar: 'B1',
        label: 'speed kept 10 s after a 2x cruise exit, forward held',
        value: forwardHeld.keptFraction,
        unit: 'fraction',
        met: Number.isFinite(forwardHeld.keptFraction) && forwardHeld.keptFraction >= 0.99,
        note: `exit ${forwardHeld.exitSpeed} WU/s from a physics impulse; cruise ${forwardHeld.cruiseSpeed} WU/s`,
      },
    ];

    return {
      eventTrace,
      metrics: {
        seed,
        cruiseSpeed: handsOff.cruiseSpeed,
        exitSpeedHandsOff: handsOff.exitSpeed,
        exitSpeedForwardHeld: forwardHeld.exitSpeed,
        speedAt10sHandsOff: handsOff.speedAt10s,
        speedAt10sForwardHeld: forwardHeld.speedAt10s,
        keptHandsOffFraction: handsOff.keptFraction,
        keptForwardHeldFraction: forwardHeld.keptFraction,
        realPathProof: {
          hitch: { handsOff: handsOff.proof, forwardHeld: forwardHeld.proof },
        },
        bars,
      },
    };
  },
};

async function runKeptTape(seed, hullId, mode, eventTrace) {
  const host = await bootPlayer(seed, hullId);
  try {
    const player = host.player;
    settle(host);
    pushTrace(eventTrace, host, `${mode}:settle:end`);

    const samples = [];
    host.step(CRUISE_HOLD_TICKS, {
      before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); },
      after: ({ state, host: h }) => {
        samples.push({ simTime: state.simTime, speed: planarSpeed(h.player) });
      },
    });
    const cruiseSpeed = samples.length ? samples[samples.length - 1].speed : 0;
    pushTrace(eventTrace, host, `${mode}:cruise:sampled`, { cruiseSpeed });

    host.step(1, {
      before: ({ state, host: h }) => {
        writeRealPathInput(state, { moveZ: 1 });
        queueDoubleCruiseImpulse(h.player, cruiseSpeed);
      },
    });
    const exitSpeed = planarSpeed(player);
    pushTrace(eventTrace, host, `${mode}:exit:sampled`, { exitSpeed });

    const holdInput = mode === 'forwardHeld' ? { moveZ: 1 } : {};
    host.step(HOLD_10S_TICKS, {
      before: ({ state }) => { writeRealPathInput(state, holdInput); },
    });
    const speedAt10s = planarSpeed(player);
    const keptFraction = exitSpeed > 0 ? speedAt10s / exitSpeed : null;
    pushTrace(eventTrace, host, `${mode}:t10s:sampled`, { speedAt10s, keptFraction });

    return {
      cruiseSpeed,
      exitSpeed,
      speedAt10s,
      keptFraction,
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
