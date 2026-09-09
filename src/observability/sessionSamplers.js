// Pure deterministic samplers for the Gameplay Observatory. These functions only read the live
// state passed to them. They never call RNG, emit events, retain gameplay references, or consult
// wall-clock time; presentation alignment metadata is supplied by the caller.

import { fnv1a } from '../save/checksum.js';

export const OBSERVATORY_CADENCE = Object.freeze({
  inputEveryTicks: 1,
  stateEveryTicks: 3,
  assetEveryTicks: 6,
  hashEveryTicks: 60,
});

const CANONICAL_ROOT_KEYS = Object.freeze([
  'meta', 'mode', 'timeScale', 'tick', 'simTime', 'days', 'playerId', 'player', 'flight', 'fuel',
  'nav', 'world', 'combat', 'economy', 'factions', 'conflicts', 'missions', 'careers', 'scenario',
  'story', 'crafting', 'automation', 'sectorSim', 'interventions', 'interventionMeta', 'drill',
  'claims', 'traffic', 'jump',
]);

const OMIT_CANONICAL_KEYS = new Set([
  'rng', 'spatialHash', 'mesh', 'view', 'obj', 'prevPos', 'prevRot', 'render', 'audio',
  'observatory', 'observatoryHooks', '_observatory',
]);

export function sampleAppliedInput(state) {
  return {
    seed: seedOf(state),
    tick: tickOf(state),
    simTime: timeOf(state),
    input: cloneObservatoryValue(state && state.input || {}),
  };
}

export function sampleState(state, aiIntent = null) {
  const entity = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId) : null;
  return {
    seed: seedOf(state),
    tick: tickOf(state),
    simTime: timeOf(state),
    mode: String(state && state.mode || 'unknown'),
    timeScale: finite(state && state.timeScale, 1),
    currentSectorId: state && state.world && state.world.currentSectorId || null,
    player: cloneObservatoryValue({
      id: state && state.playerId || 0,
      targetId: state && state.player && state.player.targetId || null,
      credits: state && state.player && state.player.credits || 0,
      heat: state && state.player && state.player.heat || 0,
      cargo: state && state.player && state.player.cargo || null,
      pose: entity ? {
        pos: entity.pos,
        vel: entity.vel,
        rot: entity.rot,
        angVel: entity.angVel,
        hull: entity.hull,
        hullMax: entity.hullMax,
        shield: entity.shield,
        shieldMax: entity.shieldMax,
        cap: entity.cap,
        capMax: entity.capMax,
      } : null,
    }),
    entityCount: Array.isArray(state && state.entityList) ? state.entityList.length : 0,
    aiIntent: cloneObservatoryValue(aiIntent),
  };
}

export function sampleAssetExposure(state, exposure = null) {
  const fallback = state && state.render && state.render.assetExposure || {};
  return {
    seed: seedOf(state),
    tick: tickOf(state),
    simTime: timeOf(state),
    exposure: cloneObservatoryValue(exposure == null ? fallback : exposure),
  };
}

export function sampleFramePerformance(state, frameDt, alpha, alignment = {}) {
  return {
    seed: seedOf(state),
    tick: tickOf(state),
    simTime: timeOf(state),
    frameDt: round6(frameDt),
    alpha: round6(alpha),
    frameId: nonNegativeInt(alignment.frameId),
    wallOffsetMs: round6(alignment.wallOffsetMs),
    diagnostics: cloneObservatoryValue(alignment.diagnostics || null),
  };
}

export function canonicalStateSnapshot(state) {
  const out = {};
  for (const key of CANONICAL_ROOT_KEYS) {
    if (!state || !Object.prototype.hasOwnProperty.call(state, key)) continue;
    out[key] = canonicalClone(state[key]);
  }
  const entities = Array.isArray(state && state.entityList)
    ? state.entityList.filter(Boolean).map(canonicalEntity).sort(compareEntity)
    : [];
  out.entities = entities;
  return out;
}

export function canonicalStateHash(state) {
  const encoded = stableObservatoryStringify(canonicalStateSnapshot(state));
  let digest = '';
  for (let lane = 0; lane < 8; lane += 1) digest += fnv1a(`observatory:${lane}:${encoded}`);
  return digest;
}

export function stableObservatoryStringify(value) {
  return JSON.stringify(cloneObservatoryValue(value));
}

export function cloneObservatoryValue(value, options = {}) {
  const maxDepth = Number.isInteger(options.maxDepth) ? Math.max(1, options.maxDepth) : 12;
  const maxArray = Number.isInteger(options.maxArray) ? Math.max(1, options.maxArray) : 4096;
  return cloneValue(value, 0, maxDepth, maxArray, new WeakSet(), false);
}

function canonicalEntity(entity) {
  return canonicalClone({
    id: entity && entity.id,
    type: entity && entity.type,
    alive: entity && entity.alive,
    team: entity && entity.team,
    factionId: entity && entity.factionId,
    pos: entity && entity.pos,
    vel: entity && entity.vel,
    rot: entity && entity.rot,
    angVel: entity && entity.angVel,
    radius: entity && entity.radius,
    mass: entity && entity.mass,
    hull: entity && entity.hull,
    hullMax: entity && entity.hullMax,
    shield: entity && entity.shield,
    shieldMax: entity && entity.shieldMax,
    cap: entity && entity.cap,
    capMax: entity && entity.capMax,
    flags: entity && entity.flags,
    data: entity && entity.data,
    physicsBody: entity && entity.physicsBody,
  });
}

function canonicalClone(value) {
  return cloneValue(value, 0, 18, 16384, new WeakSet(), true);
}

function cloneValue(value, depth, maxDepth, maxArray, seen, canonical) {
  if (value == null) return value;
  if (depth > maxDepth) return '[depth]';
  const type = typeof value;
  if (type === 'number') return round6(value);
  if (type === 'string' || type === 'boolean') return value;
  if (type === 'bigint') return String(value);
  if (type === 'undefined' || type === 'function' || type === 'symbol') return undefined;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.slice(0, maxArray).map((entry) => {
        const next = cloneValue(entry, depth + 1, maxDepth, maxArray, seen, canonical);
        return next === undefined ? null : next;
      });
    }
    if (value instanceof Map) {
      const entries = [...value.entries()].sort((a, b) => codeUnitCompare(String(a[0]), String(b[0])));
      if (entries.every(([key]) => typeof key === 'string')) {
        const object = {};
        for (const [key, entry] of entries) {
          const next = cloneValue(entry, depth + 1, maxDepth, maxArray, seen, canonical);
          if (next !== undefined) object[key] = next;
        }
        return object;
      }
      return entries.slice(0, maxArray).map(([key, entry]) => [
        cloneValue(key, depth + 1, maxDepth, maxArray, seen, canonical),
        cloneValue(entry, depth + 1, maxDepth, maxArray, seen, canonical),
      ]);
    }
    if (value instanceof Set) {
      return [...value].map((entry) => cloneValue(entry, depth + 1, maxDepth, maxArray, seen, canonical))
        .sort((a, b) => codeUnitCompare(stableScalar(a), stableScalar(b)));
    }
    if (value instanceof Date) return value.toISOString();
    if (value.isObject3D || value.isMesh || value.isMaterial || value.isTexture) return undefined;
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (canonical && OMIT_CANONICAL_KEYS.has(key)) continue;
      let next;
      try { next = cloneValue(value[key], depth + 1, maxDepth, maxArray, seen, canonical); }
      catch (_error) { next = '[unreadable]'; }
      if (next !== undefined) out[key] = next;
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

function compareEntity(a, b) {
  const ai = Number.isFinite(a && a.id) ? a.id : Number.MAX_SAFE_INTEGER;
  const bi = Number.isFinite(b && b.id) ? b.id : Number.MAX_SAFE_INTEGER;
  if (ai !== bi) return ai - bi;
  return codeUnitCompare(String(a && a.id || ''), String(b && b.id || ''));
}

function codeUnitCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function stableScalar(value) {
  try { return JSON.stringify(value); } catch (_error) { return String(value); }
}

function seedOf(state) {
  return Number(state && state.meta && state.meta.seed) >>> 0;
}

function tickOf(state) {
  return nonNegativeInt(state && state.tick);
}

function timeOf(state) {
  return round6(state && state.simTime);
}

function nonNegativeInt(value) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function round6(value) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}
