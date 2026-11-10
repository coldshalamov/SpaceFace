#!/usr/bin/env node
// One command: ranked candidates, rejection reasons, and the accepted-scene proof.
// node tools/causal-foundry/cli.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACCEPTED_SCENES } from '../../src/data/causalFoundry/accepted.js';
import { PRESENTATION_IDS, PRESENTATION_SCENES, certifyPresentationDocument } from '../../src/data/causalFoundry/presentation.js';
import { HARD_GATES } from './evaluate.js';
import { executeCritic } from './critic.js';
import { testCandidates } from './generate.js';
import { proveScene } from './proofs.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const outputArg = process.argv.slice(2).find((arg) => arg.startsWith('--out='));
const OUT_DIR = outputArg ? outputArg.slice('--out='.length) : join(ROOT, '../../artifacts/causal-foundry');

const started = Date.now();
const generated = await testCandidates();
const proofs = [];
for (const scene of ACCEPTED_SCENES) {
  const proof = await proveScene(scene);
  proofs.push(slimProof(scene, proof));
}
const critic = await executeCritic({ catalog: ACCEPTED_SCENES, rows: generated.rows });

// Public certification of the stored card document. proveScene compiles a fresh
// document and uses the internal runner; that result is not this verified flag.
const presentation = [];
for (const card of PRESENTATION_SCENES) {
  const verdict = await certifyPresentationDocument(card, card.document);
  presentation.push(presentationRecord(card, verdict));
}
const presentationById = new Map(presentation.map((row) => [row.id, row]));

const ranked = {
  schema: 'spaceface.causalFoundry.ranked.v1',
  note: 'auditOrder lists accepted rows first by how many observables fired, then by tick cost. It is not a fun score. A candidate is accepted only when every hard gate passes.',
  gates: HARD_GATES,
  simulated: generated.simulated,
  simulatedVariants: generated.simulatedVariants,
  templateCount: generated.templateCount,
  templateFamilies: generated.templateFamilies,
  generationNote: 'Numeric and seed variations are attempts, not distinct authored compositions.',
  candidateCount: generated.rows.length,
  acceptedCount: generated.rows.filter((row) => row.accepted).length,
  rejectedCount: generated.rows.filter((row) => !row.accepted).length,
  candidates: generated.rows.map(slimCandidate),
  critic: {
    ok: critic.ok,
    problems: critic.problems,
    acceptedIds: critic.acceptedIds,
    rejectedIds: critic.rejectedIds,
    presentationIds: PRESENTATION_IDS,
    presentation,
  },
  presentation,
};
const accepted = {
  schema: 'spaceface.causalFoundry.acceptedProof.v1',
  note: 'presentation[].verified is true only when runLabScenario accepts that card\'s stored document. The module constant stays false at import.',
  sceneCount: proofs.length,
  presentationIds: PRESENTATION_IDS,
  presentation,
  failureIds: ACCEPTED_SCENES.filter((scene) => scene.failure).map((scene) => scene.id),
  scenes: proofs.map((row) => {
    const pub = presentationById.get(row.id);
    return pub ? { ...row, verified: pub.verified === true, publicStatus: pub.status } : { ...row, verified: false };
  }),
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'ranked.json'), JSON.stringify(ranked, null, 2));
writeFileSync(join(OUT_DIR, 'accepted-proof.json'), JSON.stringify(accepted, null, 2));

const failedAccepted = proofs.filter((row) => !row.ok);
console.log(JSON.stringify({
  schema: 'spaceface.causalFoundry.cliResult.v1',
  simulated: ranked.simulated,
  templateCount: ranked.templateCount,
  simulatedVariants: ranked.simulatedVariants,
  candidateCount: ranked.candidateCount,
  generatorAccepted: ranked.acceptedCount,
  generatorRejected: ranked.rejectedCount,
  catalogScenes: proofs.length,
  catalogOk: failedAccepted.length === 0,
  catalogFailed: failedAccepted.map((row) => row.id),
  criticOk: critic.ok,
  criticProblems: critic.problems,
  presentationOk: presentation.every((row) => row.verified === true),
  presentationVerified: presentation.filter((row) => row.verified === true).map((row) => row.id),
  presentationFailed: presentation.filter((row) => row.verified !== true).map((row) => row.id),
  ms: Date.now() - started,
  out: OUT_DIR,
}, null, 2));
process.exit(failedAccepted.length === 0 && critic.ok && presentation.every((row) => row.verified === true) ? 0 : 1);

function presentationRecord(card, verdict) {
  const passed = !!(
    verdict
    && verdict.verified === true
    && verdict.ok === true
    && verdict.status === 'pass'
    && verdict.certifying === true
  );
  return {
    id: card.id,
    verified: passed,
    ok: !!(verdict && verdict.ok === true),
    status: verdict && verdict.status ? verdict.status : 'invalid-config',
    certifying: !!(verdict && verdict.certifying === true),
    traceHash: verdict && verdict.traceHash ? verdict.traceHash : null,
    schema: card.document && card.document.schema ? card.document.schema : null,
    error: verdict && verdict.error ? verdict.error : null,
  };
}

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
