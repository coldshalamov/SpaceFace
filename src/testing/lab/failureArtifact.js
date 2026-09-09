// spaceface.labFailure.v1 — structured failure artifacts (§13).

import { createHash } from 'node:crypto';
import { canonicalStringify } from '../../core/simSnapshot.js';

export const LAB_FAILURE_SCHEMA = 'spaceface.labFailure.v1';

/**
 * Build a concise causal-window failure artifact.
 * @param {object} opts
 */
export function buildLabFailure(opts = {}) {
  const firstBadTick = Number.isInteger(opts.firstBadTick) ? opts.firstBadTick : null;
  const oracle = opts.oracle || null;
  const trace = Array.isArray(opts.trace) ? opts.trace : [];
  const windowRadius = Number.isInteger(opts.windowRadius) ? opts.windowRadius : 5;

  const inputWindow = sliceWindow(opts.inputLog || [], firstBadTick, windowRadius, 'tick');
  const eventWindow = sliceWindow(opts.eventLog || [], firstBadTick, windowRadius, 'tick');
  const metricWindow = sliceWindow(trace, firstBadTick, windowRadius, 'tick');

  const stateSlice = opts.stateSlice || extractStateSlice(opts.state, opts.aliasMap);

  const identity = {
    scenarioId: opts.scenarioId || null,
    runId: opts.runId || null,
    seed: opts.seed ?? null,
    build: opts.build || null,
    manifestHash: opts.manifestHash || null,
    profileId: opts.profileId || null,
    scenarioDigest: opts.scenarioDigest || null,
    inputDigest: opts.inputDigest || null,
  };

  const oracleDetail = oracle
    ? {
      family: oracle.family,
      id: oracle.id,
      expected: oracle.expected,
      actual: oracle.actual,
      signedDelta: oracle.signedDelta,
    }
    : null;

  const fingerprintPayload = {
    scenarioId: identity.scenarioId,
    firstBadTick,
    oracleId: oracle && oracle.id,
    signedDelta: oracle && oracle.signedDelta,
    expected: oracle && oracle.expected,
    actual: summarizeActual(oracle && oracle.actual),
  };
  const failureFingerprint = sha256(canonicalStringify(fingerprintPayload));

  const replayCommand = opts.replayCommand
    || `sf lab replay ${identity.scenarioId || '<scenario>'} --fingerprint ${failureFingerprint}`;

  return {
    schema: LAB_FAILURE_SCHEMA,
    status: opts.status || 'fail',
    scenarioId: identity.scenarioId,
    runId: identity.runId,
    identity,
    firstBadTick,
    oracle: oracleDetail,
    stateSlice,
    inputWindow,
    eventWindow,
    metricWindow,
    possibleWritersThisTick: opts.possibleWritersThisTick || [],
    failureFingerprint,
    replayCommand,
    verbosity: opts.verbosity ?? 1,
  };
}

/**
 * From an oracle evaluation, pick the first failure and build an artifact.
 */
export function failureFromOracleEval(evalResult, context = {}) {
  if (!evalResult || evalResult.ok) return null;
  const oracle = (evalResult.failed && evalResult.failed[0]) || null;
  return buildLabFailure({
    ...context,
    firstBadTick: evalResult.firstBadTick ?? (oracle && oracle.firstBadTick),
    oracle,
    status: 'fail',
  });
}

function sliceWindow(items, centerTick, radius, tickKey) {
  if (!Array.isArray(items) || centerTick == null) {
    return items.slice ? items.slice(0, Math.min(items.length, radius * 2 + 1)) : [];
  }
  return items.filter((item) => {
    const t = item && (item[tickKey] | 0);
    return Math.abs(t - centerTick) <= radius;
  });
}

function extractStateSlice(state, aliasMap) {
  if (!state) return null;
  const player = state.entities && state.playerId != null
    ? state.entities.get(state.playerId)
    : null;
  const aliases = {};
  if (aliasMap && state.entities) {
    for (const [alias, id] of Object.entries(aliasMap)) {
      const e = state.entities.get(id);
      if (e) {
        aliases[alias] = {
          id: e.id,
          pos: e.pos ? { x: round6(e.pos.x), z: round6(e.pos.z) } : null,
          vel: e.vel ? { x: round6(e.vel.x), z: round6(e.vel.z) } : null,
          alive: !!e.alive,
        };
      }
    }
  }
  return {
    tick: state.tick | 0,
    simTime: round6(state.simTime),
    player: player
      ? {
        id: player.id,
        pos: player.pos ? { x: round6(player.pos.x), z: round6(player.pos.z) } : null,
        vel: player.vel ? { x: round6(player.vel.x), z: round6(player.vel.z) } : null,
        rot: round6(player.rot),
        hull: round6(player.hull),
      }
      : null,
    aliases,
    tether: state.player && state.player.tether
      ? {
        active: !!state.player.tether.active,
        targetId: state.player.tether.targetId,
        restLength: round6(state.player.tether.restLength),
      }
      : null,
  };
}

function summarizeActual(actual) {
  if (actual == null) return null;
  if (typeof actual === 'number' || typeof actual === 'boolean' || typeof actual === 'string') return actual;
  try {
    return JSON.parse(JSON.stringify(actual));
  } catch {
    return String(actual);
  }
}

function round6(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1e6) / 1e6;
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}
