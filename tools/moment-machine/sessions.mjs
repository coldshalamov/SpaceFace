// Fixed-seed sessions on the authoritative production runtime.
// Receipts are whatever the Adventure tape and Chronicle actually wrote.
// Positions are the entity poses the sim already has while the session steps.

import { createAuthoritativeRuntime } from '../../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../../src/systems/ships.js';
import { ADVENTURE_POSE_ACTORS, ADVENTURE_POSE_STRIDE } from '../../src/systems/killReplay.js';
import { analyzeMomentStream, playRecordedPoses } from '../../src/presentation/momentMachine/index.js';
import { SHAPE_IDS } from '../../src/presentation/momentMachine/contract.js';

const POSE_RANGE_SQ = 1400 * 1400;

export const SESSION_COUNT = 40;
export const SESSION_TICKS = 60;

function generationOf(entity) {
  const generation = entity && entity.occupantGeneration;
  return Number.isInteger(generation) && generation >= 0 ? generation : 0;
}

/** Positions already on the sim. Nothing here is invented from a caption or a canvas. */
function posesNow(state) {
  const player = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
  const tick = state.tick | 0;
  const rows = [];
  const consider = (entity) => {
    if (!entity || entity.alive === false || !entity.pos || entity.id == null) return;
    let distance = -1;
    if (player && entity !== player) {
      const dx = entity.pos.x - player.pos.x;
      const dz = entity.pos.z - player.pos.z;
      distance = dx * dx + dz * dz;
      if (distance > POSE_RANGE_SQ) return;
    }
    rows.push({
      distance,
      pose: {
        tick,
        id: String(entity.id),
        generation: generationOf(entity),
        x: Number(entity.pos.x) || 0,
        z: Number(entity.pos.z) || 0,
        heading: Number(entity.rot) || 0,
      },
    });
  };
  if (Array.isArray(state.entityList)) {
    for (let i = 0; i < state.entityList.length; i += 1) consider(state.entityList[i]);
  } else if (state.entities && typeof state.entities.forEach === 'function') {
    state.entities.forEach(consider);
  }
  rows.sort((a, b) => a.distance - b.distance);
  if (rows.length > ADVENTURE_POSE_ACTORS) rows.length = ADVENTURE_POSE_ACTORS;
  return rows.map((row) => row.pose);
}

function recorderSamples(recording) {
  if (!recording || typeof recording !== 'object') return null;
  if (Array.isArray(recording.samples) && recording.samples.length) {
    return recording.samples.map((sample) => ({ ...sample }));
  }
  if (!Array.isArray(recording.poseFrames)) return null;
  const samples = [];
  for (let i = 0; i < recording.poseFrames.length; i += 1) {
    const poses = recording.poseFrames[i] && recording.poseFrames[i].poses;
    if (!Array.isArray(poses)) continue;
    for (let j = 0; j < poses.length; j += 1) samples.push({ ...poses[j] });
  }
  return samples.length ? samples : null;
}

function plainTape(recording, samples) {
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
    samples: samples && samples.length ? samples : null,
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
    const logged = [];
    for (let done = 0; done < SESSION_TICKS; done += ADVENTURE_POSE_STRIDE) {
      runtime.runTicks(Math.min(ADVENTURE_POSE_STRIDE, SESSION_TICKS - done));
      if ((state.tick % ADVENTURE_POSE_STRIDE) !== 0) continue;
      const poses = posesNow(state);
      for (let i = 0; i < poses.length; i += 1) logged.push(poses[i]);
    }
    const recording = state.replay && state.replay.recording;
    const samples = logged.length ? logged : recorderSamples(recording);
    const tape = plainTape(recording, samples);
    const analysis = analyzeMomentStream({
      seed,
      adventureTape: tape,
      chronicle: state.chronicler,
    });
    const selection = analysis.selection || analysis;
    const ranked = Array.isArray(selection.ranked) ? selection.ranked : [];
    const streamSamples = selection.stream && Array.isArray(selection.stream.samples)
      ? selection.stream.samples : [];
    const playback = playRecordedPoses(streamSamples);
    const playbackVerified = streamSamples.length > 0 && playback.length === streamSamples.length
      && playback.every((pose, index) => {
        const sample = streamSamples[index];
        return pose && pose.tick === sample.tick && pose.id === sample.id
          && pose.x === sample.x && pose.z === sample.z && pose.heading === sample.heading;
      });
    return {
      seed,
      ok: true,
      evidenceClass: runtime.config && runtime.config.evidenceClass,
      tapeTicks: tape ? tape.ticks : 0,
      tapeEvents: tape ? tape.events : [],
      hasInputRing: tape ? tape.hasInputRing === true : false,
      positionSource: selection.stream ? selection.stream.positionSource : 'none',
      sampleCount: streamSamples.length,
      samples: streamSamples,
      playback,
      playbackVerified,
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
