// Run a compiled scenario through the authoritative lab. Traces stay on the
// internal runner because the public certifying API does not return the oracle stream.
// Hashes match the public runner: retain flags do not change the sim.

import { ENEMY_TYPES } from '../../src/data/enemies.js';
import { runLabScenarioInternal } from '../../src/testing/lab/runScenario.js';

const ENEMY_HULL = new Map(ENEMY_TYPES.map((row) => [row.id, row.hull]));

export async function executeScenario(doc) {
  let result;
  try {
    result = await runLabScenarioInternal(doc, {
      retainOracleTrace: true,
      retainCheckpointSurfaces: true,
      verbosity: 3,
    });
  } catch (err) {
    return {
      labOk: false,
      finite: false,
      playerAlive: false,
      error: err && err.message ? err.message : String(err),
      traceHash: null,
      summary: emptySummary(),
    };
  }
  const trace = Array.isArray(result.oracleTrace) ? result.oracleTrace : [];
  const entities = checkpointEntities(result);
  const summary = summarize(trace, entities, doc, result);
  summary.labOk = result.ok === true && result.status !== 'infra';
  summary.status = result.status || null;
  summary.error = result.error
    || (summary.labOk ? null : JSON.stringify(result.oracle && result.oracle.failed || []).slice(0, 500));
  summary.exitClass = result.exitClass;
  if (result.status === 'infra' || result.ok == null) summary.labOk = false;
  return {
    labOk: summary.labOk,
    finite: summary.finite,
    playerAlive: summary.playerAlive,
    traceHash: result.traceHash || null,
    error: summary.error,
    status: summary.status,
    summary,
    nonPromoting: result.nonPromoting === true,
    systems: result.live && result.live.systems ? result.live.systems.slice() : [],
  };
}

function summarize(trace, entities, doc, result) {
  if (!trace.length) {
    return {
      ...emptySummary(),
      labOk: false,
      error: result && result.error,
    };
  }
  const first = trace[0];
  const last = trace[trace.length - 1];
  const finite = trace.every((sample) => (
    Number.isFinite(sample.playerX)
    && Number.isFinite(sample.playerZ)
    && Number.isFinite(sample.playerVelX)
    && Number.isFinite(sample.playerVelZ)
  ));
  let maxSpeed = 0;
  let maxTension = 0;
  let maxAngular = 0;
  let attTrue = false;
  let attFalseAfter = false;
  let minRest = null;
  for (const sample of trace) {
    const speed = Math.hypot(sample.playerVelX || 0, sample.playerVelZ || 0);
    if (speed > maxSpeed) maxSpeed = speed;
    if ((sample.tension || 0) > maxTension) maxTension = sample.tension || 0;
    const ang = Math.abs(sample.angularSpeed || 0);
    if (ang > maxAngular) maxAngular = ang;
    if (sample.attachmentActive === true) attTrue = true;
    if (attTrue && sample.attachmentActive === false) attFalseAfter = true;
    if (sample.attachmentActive !== false && Number.isFinite(sample.restLength)) {
      if (minRest == null || sample.restLength < minRest) minRest = sample.restLength;
    }
  }
  const authored = new Map();
  for (const entity of doc.entities || []) {
    if (!entity || !entity.alias || entity.alias === 'player') continue;
    authored.set(entity.alias, entity);
  }
  const others = [];
  for (const entity of entities) {
    const alias = entity.data && entity.data.scenarioAlias;
    if (!alias || !authored.has(alias)) continue;
    const spec = authored.get(alias);
    const pos = entity.pos || { x: 0, z: 0 };
    const vel = entity.vel || { x: 0, z: 0 };
    const hull0 = initialHull(spec);
    const hull = Number(entity.hull);
    others.push({
      alias,
      launchSpeed: Math.hypot(spec.vel && spec.vel.x || 0, spec.vel && spec.vel.z || 0),
      speed: Math.hypot(vel.x || 0, vel.z || 0),
      hull: Number.isFinite(hull) ? hull : null,
      hullDrop: Number.isFinite(hull) && Number.isFinite(hull0) ? hull0 - hull : 0,
      disp: Math.hypot((pos.x || 0) - (spec.pos && spec.pos.x || 0), (pos.z || 0) - (spec.pos && spec.pos.z || 0)),
      pos,
      vel,
    });
  }
  const speedAt10 = trace.length > 10
    ? Math.hypot(trace[10].playerVelX || 0, trace[10].playerVelZ || 0)
    : Math.hypot(first.playerVelX || 0, first.playerVelZ || 0);
  const rest0 = Number.isFinite(first.restLength) ? first.restLength : null;
  const rest1 = Number.isFinite(last.restLength) ? last.restLength : null;
  return {
    playerDisp: Math.hypot((last.playerX || 0) - (first.playerX || 0), (last.playerZ || 0) - (first.playerZ || 0)),
    playerX: last.playerX || 0,
    playerZ: last.playerZ || 0,
    endSpeed: Math.hypot(last.playerVelX || 0, last.playerVelZ || 0),
    launchSpeed: Math.hypot(first.playerVelX || 0, first.playerVelZ || 0),
    maxSpeed,
    speedAt10,
    rotDelta: Math.abs((last.playerRot || 0) - (first.playerRot || 0)),
    rest0,
    rest1,
    minRest,
    restDelta: rest0 != null && rest1 != null ? rest1 - rest0 : 0,
    reelDrop: rest0 != null && minRest != null ? rest0 - minRest : 0,
    maxTension,
    maxAngular,
    attStart: first.attachmentActive === true,
    attEnd: last.attachmentActive === true,
    cut: attFalseAfter,
    playerAlive: last.playerAlive !== false,
    finite,
    savePerformed: !!(result.params && result.params.saveLoadPerformed),
    others,
    labOk: true,
  };
}

function initialHull(spec) {
  if (spec.profile && ENEMY_HULL.has(spec.profile)) return ENEMY_HULL.get(spec.profile);
  return 1;
}

function checkpointEntities(result) {
  const surface = result
    && result.checkpoints
    && result.checkpoints.final
    && result.checkpoints.final.deterministicCovered
    && result.checkpoints.final.deterministicCovered.surface;
  return surface && Array.isArray(surface.entities) ? surface.entities : [];
}

function emptySummary() {
  return {
    playerDisp: 0,
    playerX: 0,
    playerZ: 0,
    endSpeed: 0,
    launchSpeed: 0,
    maxSpeed: 0,
    speedAt10: 0,
    rotDelta: 0,
    rest0: null,
    rest1: null,
    minRest: null,
    restDelta: 0,
    reelDrop: 0,
    maxTension: 0,
    maxAngular: 0,
    attStart: false,
    attEnd: false,
    cut: false,
    playerAlive: false,
    finite: false,
    savePerformed: false,
    others: [],
    labOk: false,
  };
}
