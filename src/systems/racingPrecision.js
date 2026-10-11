// Ordered circuit skill rewards. Missions own the score; flight alone owns boost energy.
import { circuitLaps, gateApproach, planeCrossFraction } from './racingGeometry.js';

export const RACING_PRECISION = Object.freeze({
  version: 1, coreRadiusFraction: 0.25, minSpeed: 120, minAlignment: 0.94,
  baseEnergy: 2, maxEnergy: 5,
});
const issued = new WeakMap();
const spent = new WeakMap();
const activeCircuit = mission => mission?.status === 'active' && mission.type === 'race'
  && !!mission.params?.racingContractId && mission.params.closedCircuit === true;
const nonNegativeInt = value => Number.isSafeInteger(value) && value >= 0;
const ordinalOf = (lap, gate, count) => lap * (count - 1) + gate;

/** Score one event returned by advanceCircuit, using that call's unchanged swept sample. */
export function scoreRacingPrecision(mission, event, sample = {}) {
  const params = mission?.params;
  if (!activeCircuit(mission)) return { patch: {}, intent: null, reason: 'inactive' };
  const { prev, pos, vel, gates, previousTime, now } = sample;
  const count = Array.isArray(gates) ? gates.length : 0;
  const gateIndex = event?.gateIndex, lap = event?.lap;
  const prior = nonNegativeInt(params.precisionLastOrdinal) ? params.precisionLastOrdinal : -1;
  const reject = reason => ({ patch: { precisionChain: 0 }, intent: null, reason });
  if (count < 2 || !nonNegativeInt(gateIndex) || gateIndex >= count || !nonNegativeInt(lap)
      || lap >= circuitLaps(params) || (lap > 0 && gateIndex === 0)) return reject('invalid_order');
  const ordinal = ordinalOf(lap, gateIndex, count);
  if (ordinal <= prior) return { patch: {}, intent: null, reason: 'duplicate' };
  if (ordinal !== prior + 1) return reject('invalid_order');
  const progress = ordinalOf(Math.max(0, params.lap | 0), Math.max(0, params.nextGate | 0), count);
  if (ordinal >= progress || !Number.isFinite(params.raceStartSimS)
      || !Number.isFinite(now) || !Number.isFinite(previousTime) || now < previousTime
      || !Number.isFinite(event.elapsedS) || event.elapsedS < 0) return reject('unearned_event');
  const from = gateApproach(gates, gateIndex);
  const radius = Number(params.gateRadiusWU) || 90;
  const fraction = planeCrossFraction({ prev, pos, vel, from, gate: gates[gateIndex], radius });
  if (fraction === null || !Number.isFinite(vel?.x) || !Number.isFinite(vel?.z)) return reject('no_crossing');
  const atSimS = previousTime + fraction * (now - previousTime);
  if (atSimS < params.raceStartSimS || Math.abs(atSimS - params.raceStartSimS - event.elapsedS) > 1e-6) {
    return reject('unearned_event');
  }
  const gate = gates[gateIndex];
  const x = prev.x + (pos.x - prev.x) * fraction - gate.x;
  const z = prev.z + (pos.z - prev.z) * fraction - gate.z;
  const offsetWU = Math.abs(x * -from.nz + z * from.nx);
  const speed = Math.hypot(vel.x, vel.z);
  const alignment = speed > 0 ? (vel.x * from.nx + vel.z * from.nz) / speed : 0;
  const resets = Math.max(0, params.resetCount | 0);
  const recovered = resets !== Math.max(0, params.precisionResetCount | 0);
  const kind = recovered ? 'recovery' : speed < RACING_PRECISION.minSpeed ? 'slow'
    : alignment < RACING_PRECISION.minAlignment ? 'alignment'
      : offsetWU > radius * RACING_PRECISION.coreRadiusFraction ? 'wide' : 'precise';
  const priorChain = nonNegativeInt(params.precisionChain) ? Math.min(9999, params.precisionChain) : 0;
  const chain = kind === 'precise' ? priorChain + 1 : 0;
  const energy = chain ? Math.min(RACING_PRECISION.maxEnergy, RACING_PRECISION.baseEnergy + chain - 1) : 0;
  const best = nonNegativeInt(params.precisionBest) ? Math.min(10000, params.precisionBest) : 0;
  const patch = {
    precisionVersion: RACING_PRECISION.version, precisionChain: chain, precisionBest: Math.max(best, chain),
    precisionLastOrdinal: ordinal, precisionResetCount: resets,
    lastPrecision: { kind, lap, gateIndex, offsetWU, speed, alignment, energy, chain, atSimS },
  };
  let intent = null;
  if (energy > 0) {
    intent = Object.freeze({ missionId: mission.id, lap, gateIndex, ordinal, energy });
    issued.set(intent, { mission, params, resets });
  }
  return { patch, intent, reason: kind };
}

/** Flight's one-use admission gate. Copies, replays and detached/completed missions earn nothing. */
export function consumePrecisionBoostIntent(state, intent) {
  const receipt = intent && typeof intent === 'object' ? issued.get(intent) : null;
  if (!receipt) return 0;
  issued.delete(intent);
  const { mission, params, resets } = receipt;
  if (state?.mode !== 'flight' || !activeCircuit(mission)
      || !state.missions?.active?.includes(mission) || mission.params !== params
      || state.entities?.get?.(state.playerId)?.alive !== true
      || params.precisionLastOrdinal !== intent.ordinal || params.precisionChain < 1
      || (params.resetCount | 0) !== resets || (spent.get(params) ?? -1) >= intent.ordinal) return 0;
  spent.set(params, intent.ordinal);
  return Math.min(RACING_PRECISION.maxEnergy, intent.energy);
}
