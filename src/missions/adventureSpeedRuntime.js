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
export function stepAdventureSpeed(params, { events = [], player, simTime, setPiece = null } = {}) {
  const config = params?.adventureSpeed;
  if (!params?.adventureSpeedId || !config) return empty();
  if (config.kind === 'thermal' || config.kind === 'rescue') {
    return stepCargoPassage(params, { events, player, simTime, setPiece });
  }
  const count = Array.isArray(params.gates) ? params.gates.length : 0;
  if (!['escape', 'windows', 'wake', 'listening'].includes(config.kind) || count < 2
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
  if (config.kind === 'listening') {
    if (setPiece?.failureReason && (!state || state.outcome === 'active')) {
      state ||= { version: 1, startElapsedS: null, deadlineElapsedS: currentElapsed };
      fail(setPiece.failureReason, currentElapsed);
    }
    patch.raceLease = !!state && state.outcome === 'active';
    if (!state || state.outcome === 'active') {
      const observation = setPiece || {};
      const exposure = Math.round(Number(observation.exposure) || 0);
      const mode = observation.listenerMode || 'listening';
      patch.adventureSpeedHint = mode === 'cleared' ? 'HUNTER DISABLED · Finish the transfer'
        : mode === 'engaged' ? `HUNTER ENGAGED · ${exposure}% exposure · Coast beyond 700 wu for eight quiet seconds to lose it`
        : mode === 'searching' ? `HUNTER SEARCHING · ${exposure}% exposure · Keep engines quiet and build separation`
        : `LISTENER ${exposure}% EXPOSURE · Ordinary thrust is quiet; boost and gunfire are loud`;
      if (state) patch.adventureSpeedHint += ` · ${Math.max(0, state.deadlineElapsedS - currentElapsed).toFixed(1)}s TRANSFER WINDOW`;
      if (params.nextGate === count - 1) patch.adventureSpeedHint += ` · Handoff below ${config.finishSpeedLimit} wu/s`;
    } else if (state.reason === 'speed_listener_unavailable') patch.adventureSpeedHint = 'The transfer lost contact with its hunter. Request a fresh passage.';
  }
  if (state) {
    patch.adventureSpeedState = state;
    patch.adventureSpeedStartSimS = params.raceStartSimS + state.startElapsedS;
    patch.adventureSpeedRemainingS = round(Math.max(0, state.deadlineElapsedS - currentElapsed));
  }
  return { patch, outcome: state?.outcome || 'active', reason: state?.reason || null, finishedEvent };
}

function stepCargoPassage(params, { events, player, simTime, setPiece }) {
  const config = params.adventureSpeed, thermal = config.kind === 'thermal', count = params.gates?.length || 0;
  if (!finite(simTime) || !finite(params.raceStartSimS) || count < 2) return empty();
  const elapsed = Math.max(0, simTime - params.raceStartSimS);
  const prior = params.adventureSpeedState;
  const state = prior ? { ...prior } : { version: 1, outcome: 'active', reason: null, lastGate: -1,
    startElapsedS: null, lastElapsedS: 0, lastSampleElapsedS: elapsed, deadlineElapsedS: null,
    temperature: config.thermal?.startTemperature || 20, quality: 100, spoiledUnits: 0 };
  let finishedEvent = null, cargoLoss = 0, candidate = null;
  const fail = reason => { state.outcome = 'failed'; state.reason = reason; };
  if (state.outcome === 'active') {
    if (!setPiece) return empty(); // the physical/cargo owner must supply observations
    if (setPiece.failureReason) fail(setPiece.failureReason);
    for (const event of events) {
      if (state.outcome !== 'active') break;
      if (!event || event.lap !== 0 || event.gateIndex !== state.lastGate + 1 || event.gateIndex >= count
          || !finite(event.elapsedS) || event.elapsedS < state.lastElapsedS || event.elapsedS > elapsed + 1e-6) continue;
      if (!thermal && !setPiece.attached) continue;
      if (state.startElapsedS == null) {
        state.startElapsedS = event.elapsedS;
        state.deadlineElapsedS = event.elapsedS + config.totalWindowS;
        state.lastSampleElapsedS = event.elapsedS;
      }
      if (event.elapsedS > state.deadlineElapsedS + 1e-6) { fail(config.failureReason); break; }
      state.lastGate = event.gateIndex; state.lastElapsedS = event.elapsedS;
      if (event.finished && event.gateIndex === count - 1) candidate = event;
    }
    const sampleUntil = Math.min(candidate ? candidate.elapsedS : elapsed, state.deadlineElapsedS ?? Infinity);
    const dt = state.startElapsedS == null ? 0 : Math.max(0, sampleUntil - state.lastSampleElapsedS);
    state.lastSampleElapsedS = Math.max(state.lastSampleElapsedS, sampleUntil);
    if (thermal) {
      const tuning = config.thermal;
      const expectedUnits = Math.max(0, tuning.units - state.spoiledUnits);
      if (!finite(setPiece.cargoUnits) || setPiece.cargoUnits < expectedUnits) fail('speed_payload_missing');
      const heatRate = setPiece.sheltered ? -tuning.coolingPerS
        : tuning.exposedHeatPerS + (setPiece.burning ? tuning.burnHeatPerS : 0);
      const before = state.temperature;
      const uncappedTemperature = before + heatRate * dt;
      state.temperature = Math.max(0, Math.min(120, uncappedTemperature));
      // Integrate only the hot portion when a tick crosses the safe temperature.
      const hotFraction = heatRate === 0 ? (before > tuning.safeTemperature ? 1 : 0)
        : Math.max(0, Math.min(1, heatRate > 0
          ? (uncappedTemperature - tuning.safeTemperature) / (heatRate * Math.max(dt, 1e-9))
          : (before - tuning.safeTemperature) / (-heatRate * Math.max(dt, 1e-9))));
      state.quality = Math.max(0, state.quality - tuning.qualityLossPerS * dt * hotFraction);
      const spoiled = Math.min(tuning.units, Math.floor((100 - state.quality + 1e-6) / (100 / tuning.units)));
      cargoLoss = Math.max(0, spoiled - state.spoiledUnits);
      state.spoiledUnits = spoiled;
      if (state.quality <= 0 || spoiled >= tuning.units) fail('speed_payload_spoiled');
    }
    if (candidate && state.outcome === 'active') {
      if (!thermal && (!(setPiece.towedWU >= config.rescue.minTowedWU) || !setPiece.attached)) fail('speed_rescue_not_towed');
      else if (!thermal && (!(setPiece.podSpeed <= config.finishSpeedLimit) || !(setPiece.playerSpeed <= config.finishSpeedLimit))) fail('speed_handoff_too_fast');
      else {
        state.outcome = 'complete'; state.terminalElapsedS = candidate.elapsedS;
        state.runElapsedS = round(candidate.elapsedS - state.startElapsedS);
        finishedEvent = { ...candidate, elapsedS: state.runElapsedS };
      }
    }
    if (state.outcome === 'active' && state.deadlineElapsedS != null && elapsed > state.deadlineElapsedS + 1e-6) fail(config.failureReason);
  }
  const running = state.startElapsedS != null && state.outcome === 'active';
  const left = state.deadlineElapsedS == null ? null : Math.max(0, state.deadlineElapsedS - elapsed);
  let hint;
  if (thermal) hint = `PAYLOAD ${Math.round(state.temperature)}° · QUALITY ${Math.round(state.quality)}% · ${config.thermal.units - state.spoiledUnits}/${config.thermal.units} PACKS`
    + (setPiece?.sheltered ? ` · COOLING: ${setPiece.shelterName || 'solid cover'}` : ' · EXPOSED: shelter east of solid cover');
  else hint = setPiece?.attached ? `POD IN TOW · ${Math.round(Number(setPiece.podSpeed) || 0)} wu/s · Handoff below ${config.finishSpeedLimit} wu/s`
    : 'ATTACH MASSLINE TO EVACUATION POD · The pod must cross every gate';
  if (left != null) hint += ` · ${left.toFixed(1)}s TRANSFER WINDOW`;
  if (state.outcome === 'complete') hint = thermal ? `DELIVERED · ${Math.round(state.quality)}% quality · ${config.thermal.units - state.spoiledUnits} medical packs` : 'EVACUATION POD HANDED OVER';
  if (state.outcome === 'failed') {
    const reasons = { speed_payload_missing: 'The sealed medical load is missing.', speed_payload_spoiled: 'The medical load overheated and spoiled.',
      speed_rescue_pod_lost: 'The evacuation pod was lost.', speed_rescue_not_towed: 'The pod did not complete a physical tow.',
      speed_handoff_too_fast: `Handoff missed: both ship and pod must be below ${config.finishSpeedLimit} wu/s.` };
    hint = reasons[state.reason] || config.failureText;
  }
  const patch = { adventureSpeedState: state, adventureSpeedHint: hint, raceLease: running,
    adventureSpeedRemainingS: round(left || 0) };
  if (state.startElapsedS != null) patch.adventureSpeedStartSimS = params.raceStartSimS + state.startElapsedS;
  if (thermal) { patch.payloadTemperature = round(state.temperature); patch.payloadQuality = round(state.quality); }
  return { patch, outcome: state.outcome, reason: state.reason, finishedEvent, cargoLoss,
    rewardScale: thermal ? 0.5 + state.quality / 200 : 1 };
}
