// Fixed-seed sessions on the authoritative production runtime.
// Receipts are whatever the Adventure tape and Chronicle actually wrote.
// Positions are copied only when those recorders stored them.

import { createAuthoritativeRuntime } from '../../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../../src/systems/ships.js';
import { analyzeMomentStream } from '../../src/presentation/momentMachine/index.js';
import { SHAPE_IDS } from '../../src/presentation/momentMachine/contract.js';

export const SESSION_COUNT = 40;
export const SESSION_TICKS = 60;

function plainTape(recording) {
  if (!recording || typeof recording !== 'object') return null;
  const events = Array.isArray(recording.events) ? recording.events : [];
  return {
    seed: recording.seed,
    tickRate: recording.tickRate,
    ticks: recording.ticks,
    seconds: recording.seconds,
    base: recording.base,
    absoluteBaseTick: recording.absoluteBaseTick,
    events: events.map((event) => ({
      tick: event && event.tick,
      absoluteTick: event && event.absoluteTick,
      type: event && event.type,
      label: event && event.label,
    })),
    samples: Array.isArray(recording.samples) ? recording.samples
      : recording.poseFrames?.flatMap((frame) => frame.poses.map((pose) => ({ ...pose }))) || null,
    hasInputRing: !!(recording.inputRing && typeof recording.inputRing.read === 'function'),
  };
}

export function runSession(seed) {
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed,
  });
  try {
    const state = runtime.state;
    state.mode = 'flight';
    const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
      isPlayer: true,
      player: state.player,
      pos: { x: 0, z: 0 },
    }));
    state.playerId = player.id;
    runtime.runTicks(SESSION_TICKS);
    const tape = plainTape(state.replay && state.replay.recording);
    const analysis = analyzeMomentStream({
      seed,
      adventureTape: tape,
      chronicle: state.chronicler,
    });
    const selection = analysis.selection || analysis;
    const ranked = Array.isArray(selection.ranked) ? selection.ranked : [];
    return {
      seed,
      ok: true,
      evidenceClass: runtime.config && runtime.config.evidenceClass,
      tapeTicks: tape ? tape.ticks : 0,
      tapeEvents: tape ? tape.events : [],
      hasInputRing: tape ? tape.hasInputRing === true : false,
      positionSource: selection.stream ? selection.stream.positionSource : 'none',
      ranked: ranked.map((moment) => ({
        shape: moment.shape,
        footage: moment.footage && moment.footage.status,
        missingPreTicks: moment.footage && moment.footage.missingPreTicks,
        reason: moment.reason,
      })),
      dropped: selection.dropped || [],
    };
  } catch (error) {
    return {
      seed,
      ok: false,
      error: error && error.message ? String(error.message) : String(error),
      ranked: [],
      positionSource: 'none',
    };
  } finally {
    runtime.dispose();
  }
}

export function runSessions(count = SESSION_COUNT) {
  const started = process.hrtime.bigint();
  const rows = [];
  const limit = Math.max(1, count | 0);
  for (let seed = 1; seed <= limit; seed += 1) {
    rows.push(runSession(seed));
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  const selectedShapes = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const ranked = rows[i].ranked || [];
    for (let j = 0; j < ranked.length; j += 1) selectedShapes.add(ranked[j].shape);
  }
  const unselectedShapes = SHAPE_IDS.filter((shape) => !selectedShapes.has(shape));
  return {
    count: rows.length,
    elapsedMs,
    evidenceClass: rows.find((row) => row.evidenceClass) ? rows.find((row) => row.evidenceClass).evidenceClass : null,
    rows,
    selectedShapes: Array.from(selectedShapes),
    unselectedShapes,
  };
}
