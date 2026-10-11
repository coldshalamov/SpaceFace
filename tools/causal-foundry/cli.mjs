#!/usr/bin/env node
// One command: ranked candidates, rejection reasons, and the accepted-scene proof.
// node tools/causal-foundry/cli.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACCEPTED_SCENES } from '../../src/data/causalFoundry/accepted.js';
import { PRESENTATION_IDS } from '../../src/data/causalFoundry/presentation.js';
import { criticSample, HARD_GATES } from './evaluate.js';
import { testCandidates } from './generate.js';
import { proveScene } from './proofs.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(ROOT, '../../artifacts/causal-foundry');

const started = Date.now();
const generated = await testCandidates();
const proofs = [];
for (const scene of ACCEPTED_SCENES) {
  const proof = await proveScene(scene);
  proofs.push(slimProof(scene, proof));
}

const ranked = {
  schema: 'spaceface.causalFoundry.ranked.v1',
  note: 'auditOrder lists accepted rows first by how many observables fired, then by tick cost. It is not a fun score. A candidate is accepted only when every hard gate passes.',
  gates: HARD_GATES,
  simulated: generated.simulated,
  candidateCount: generated.rows.length,
  acceptedCount: generated.rows.filter((row) => row.accepted).length,
  rejectedCount: generated.rows.filter((row) => !row.accepted).length,
  candidates: generated.rows.map(slimCandidate),
  critic: criticSample(generated.rows, PRESENTATION_IDS),
};
const accepted = {
  schema: 'spaceface.causalFoundry.acceptedProof.v1',
  sceneCount: proofs.length,
  presentationIds: PRESENTATION_IDS,
  failureIds: ACCEPTED_SCENES.filter((scene) => scene.failure).map((scene) => scene.id),
  scenes: proofs,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'ranked.json'), JSON.stringify(ranked, null, 2));
writeFileSync(join(OUT_DIR, 'accepted-proof.json'), JSON.stringify(accepted, null, 2));

const failedAccepted = proofs.filter((row) => !row.ok);
console.log(JSON.stringify({
  schema: 'spaceface.causalFoundry.cliResult.v1',
  simulated: ranked.simulated,
  candidateCount: ranked.candidateCount,
  generatorAccepted: ranked.acceptedCount,
  generatorRejected: ranked.rejectedCount,
  catalogScenes: proofs.length,
  catalogOk: failedAccepted.length === 0,
  catalogFailed: failedAccepted.map((row) => row.id),
  ms: Date.now() - started,
  out: OUT_DIR,
}, null, 2));
process.exit(failedAccepted.length === 0 && ranked.simulated >= 100 ? 0 : 1);

function slimCandidate(row) {
  return {
    id: row.id,
    accepted: row.accepted,
    reasons: row.reasons,
    signature: row.signature,
    family: row.family,
    traceHash: row.traceHash,
    auditOrder: row.auditOrder,
    simulated: row.simulated,
    metrics: row.metrics,
    error: row.error || null,
  };
}

function slimProof(scene, proof) {
  const ok = proof.verdict.accepted
    && proof.repeatOk
    && proof.expectFailures.length === 0
    && proof.contrastFailures.length === 0
    && proof.varietyFailures.length === 0;
  return {
    id: scene.id,
    ok,
    layout: scene.layout,
    mechanics: scene.mechanics,
    failure: scene.failure || null,
    presentation: scene.presentation === true,
    traceHash: proof.primary.traceHash,
    repeatHash: proof.repeat.traceHash,
    repeatOk: proof.repeatOk,
    altHash: proof.alt && proof.alt.traceHash,
    reasons: proof.verdict.reasons,
    expectFailures: proof.expectFailures,
    contrastFailures: proof.contrastFailures,
    varietyFailures: proof.varietyFailures,
    fired: proof.verdict.metrics.firedObservables,
    playerDisp: proof.primary.summary.playerDisp,
    endSpeed: proof.primary.summary.endSpeed,
    error: proof.primary.error,
  };
}
