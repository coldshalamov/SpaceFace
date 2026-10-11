// Repeat, intervention, and ablation proofs on the authoritative lab.

import { compileScene, geometryOf } from './compileScene.js';
import { executeScenario } from './execute.js';
import { hostileCount } from './factoryBridge.js';
import { evaluateCandidate, signatureOf } from './evaluate.js';
import { checkExpect, contrastFails, deriveFired, readPath } from './observe.js';

export async function proveScene(scene) {
  const primaryDoc = compileScene(scene);
  const primary = await executeScenario(primaryDoc);
  const repeat = await executeScenario(primaryDoc);
  const alt = scene.alt
    ? await executeScenario(compileScene(scene, { tape: scene.alt }))
    : null;
  const ablate = scene.ablate
    ? await executeScenario(compileScene(scene, {
      tape: scene.ablate.tape || scene.primary,
      dropBody: scene.ablate.dropBody || null,
      dropAttachment: scene.ablate.dropAttachment === true,
      dropSave: scene.ablate.dropSave === true,
    }))
    : null;
  const report = reportFrom(scene, primary, scene.primary);
  const verdict = evaluateCandidate(report);
  return {
    id: scene.id,
    primaryDoc,
    primary,
    repeat,
    alt,
    ablate,
    report,
    verdict,
    expectFailures: checkExpect(primary.summary, scene.expect),
    contrastFailures: ablate ? contrastFails(primary.summary, ablate.summary, scene.contrast) : [],
    varietyFailures: scene.variety ? varietyFails(primary, alt, scene.varietyOn) : [],
    repeatOk: primary.traceHash != null && primary.traceHash === repeat.traceHash,
  };
}

export function reportFrom(scene, run, tape) {
  const geo = geometryOf(scene);
  const summary = run.summary || {};
  const fired = deriveFired(summary, tape || scene.primary || {}, scene.mechanics);
  return {
    id: scene.id,
    family: scene.layout,
    layout: scene.layout,
    mechanics: scene.mechanics,
    fired,
    ticks: scene.ticks,
    entityCount: geo.entityCount,
    hostileCount: hostileCount(scene),
    minSeparation: geo.minSeparation,
    overlap: geo.overlap,
    playerAlive: summary.playerAlive === true,
    finite: summary.finite === true,
    labOk: run.labOk === true,
    playerDisp: summary.playerDisp,
    restDelta: summary.restDelta,
    maxTension: summary.maxTension,
    interventionAffordances: scene.alt ? 2 : 1,
    signature: signatureOf(scene.layout, fired),
  };
}

export function varietyFails(primary, alt, keys) {
  if (!alt) return ['missing alternate intervention'];
  if (!primary.traceHash || primary.traceHash === alt.traceHash) return ['intervention hashes matched'];
  const changed = (keys || []).filter((key) => readPath(primary.summary, key) !== readPath(alt.summary, key));
  if (!changed.length) return [`no witness changed (${(keys || []).join(', ')})`];
  return [];
}
