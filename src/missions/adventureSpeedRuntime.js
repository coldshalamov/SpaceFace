// Pure pressure rules layered onto missions' ordered plane crossings. No movement, payout,
// spawning, clock, or bus owner lives here. The caller applies the returned JSON-safe patch.

const finite = value => Number.isFinite(value);
const round = value => Math.round(value * 100) / 100;
const empty = () => ({ patch: {}, outcome: 'active', reason: null, finishedEvent: null });

function hintFor(config, state, elapsed, nextGate, count) {
  if (!state) return 'Reach the start marker. The pressure clock begins when you cross it.';
  if (state.outcome === 'failed') return state.reason === 'speed_handoff_too_fast'
    ? `Handoff missed: cross the final marker below ${config.finishSpeedLimit} wu/s.`
    : config.failureText;
  if (state.outcome === 'complete') return 'Passage complete.';
  const left = Math.max(0, state.deadlineElapsedS - elapsed).toFixed(1);
  if (config.kind === 'escape') return `ESCAPE MARGIN ${left}s · Clear the next gate to extend it`;
  if (config.kind === 'windows') return `GATE ${Math.min(count, nextGate + 1)} CLOSES IN ${left}s`
    + (nextGate === count - 1 ? ` · Finish below ${config.finishSpeedLimit} wu/s` : '');
  return `PASSAGE ${left}s · Draft the projected pace light; burn ring at gate 3`;
}

/**
 * events are exclusively advanceCircuit's events, in order. Their times share raceStartSimS.
 * Equality at a deadline is a successful crossing; a late crossing cannot rescue an expired
 * window. A finish before the deadline wins even when observed by a tick after the deadline.
 * Recovery never resets these stamps. params and input events are not mutated.
 */
export function stepAdventureSpeed(params, { events = [], player, simTime } = {}) {
  const config = params?.adventureSpeed;
  if (!params?.adventureSpeedId || !config) return empty();
  const count = Array.isArray(params.gates) ? params.gates.length : 0;
  if (!['escape', 'windows', 'wake'].includes(config.kind) || count < 2
      || !(config.initialWindowS > 0) || !finite(params.raceStartSimS) || !finite(simTime)) return empty();
  const currentElapsed = Math.max(0, simTime - params.raceStartSimS);
  let state = params.adventureSpeedState ? { ...params.adventureSpeedState } : null;
  let finishedEvent = null;

  const fail = (reason, at) => {
    state.outcome = 'failed'; state.reason = reason;
    state.terminalElapsedS = at;
  };
  if (!state || state.outcome === 'active') {
    for (const event of events) {
      if (!event || event.lap !== 0 || !Number.isInteger(event.gateIndex)
          || !finite(event.elapsedS) || event.elapsedS < 0 || event.elapsedS > currentElapsed + 1e-6) continue;
      if (!state) {
        if (event.gateIndex !== 0) continue;
        const window = config.kind === 'escape' ? config.initialWindowS
          : config.kind === 'windows' ? config.gateDeadlinesS?.[1] : config.totalWindowS;
        if (!(window > 0) || !finite(window)) return empty();
        state = { version: 1, outcome: 'active', reason: null, lastGate: 0,
          startElapsedS: event.elapsedS, lastElapsedS: event.elapsedS,
          deadlineElapsedS: event.elapsedS + window };
        continue;
      }
      // Ignoring replays and out-of-order input keeps premiums/time from being farmed. The
      // geometry owner is still the sole authority that can advance a mission's nextGate.
      if (event.gateIndex !== state.lastGate + 1 || event.gateIndex >= count
          || event.elapsedS < state.lastElapsedS) continue;
      if (event.elapsedS > state.deadlineElapsedS + 1e-6) {
        fail(config.failureReason, state.deadlineElapsedS); break;
      }
      state.lastGate = event.gateIndex;
      state.lastElapsedS = event.elapsedS;
      if (event.finished && event.gateIndex === count - 1) {
        const speed = finite(player?.vel?.x) && finite(player?.vel?.z)
          ? Math.hypot(player.vel.x, player.vel.z) : Infinity;
        if (config.finishSpeedLimit > 0 && speed > config.finishSpeedLimit) {
          fail('speed_handoff_too_fast', event.elapsedS); break;
        }
        state.outcome = 'complete'; state.terminalElapsedS = event.elapsedS;
        state.runElapsedS = round(event.elapsedS - state.startElapsedS);
        finishedEvent = { ...event, elapsedS: state.runElapsedS };
        break;
      }
      if (config.kind === 'escape') {
        const credit = config.legBudgetsS?.[event.gateIndex + 1];
        if (finite(credit) && credit > 0) state.deadlineElapsedS = Math.min(
          state.deadlineElapsedS + credit, event.elapsedS + config.maxBankS);
      } else if (config.kind === 'windows') {
        const nextDeadline = config.gateDeadlinesS?.[event.gateIndex + 1];
        if (finite(nextDeadline) && nextDeadline > 0) state.deadlineElapsedS = state.startElapsedS + nextDeadline;
      }
    }
    if (state?.outcome === 'active' && currentElapsed > state.deadlineElapsedS + 1e-6) {
      fail(config.failureReason, state.deadlineElapsedS);
    }
  }
  const patch = { adventureSpeedHint: hintFor(config, state, currentElapsed, params.nextGate | 0, count) };
  if (state) {
    patch.adventureSpeedState = state;
    patch.adventureSpeedStartSimS = params.raceStartSimS + state.startElapsedS;
    patch.adventureSpeedRemainingS = round(Math.max(0, state.deadlineElapsedS - currentElapsed));
  }
  return { patch, outcome: state?.outcome || 'active', reason: state?.reason || null, finishedEvent };
}
