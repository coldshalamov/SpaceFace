// Executes a sample and refuses gates that can be satisfied without a player-caused change.

import { bodyClassOf, criticSample, evaluateCandidate } from './evaluate.js';
import { compileScene, geometryOf } from './compileScene.js';
import { executeScenario } from './execute.js';
import { contrastFails, deriveFired, deriveHappened } from './observe.js';
import { proveScene } from './proofs.js';

export function gameableHoles() {
  const holes = [];
  const preseed = deriveHappened({
    attStart: true, attEnd: true, playerDisp: 0, launchSpeed: 0, endSpeed: 0,
    maxSpeed: 0, speedAt10: 0, rotDelta: 0, reelDrop: 0, restDelta: 0,
    maxTension: 0, maxAngular: 0, cut: false, others: [],
  }, { hold: true });
  if (preseed.includes('massline.latch')) holes.push('pre-seeded attachment counts as massline.latch');

  const glide = deriveHappened({
    attStart: false, attEnd: false, playerDisp: 140, launchSpeed: 80, endSpeed: 79,
    maxSpeed: 80, speedAt10: 80, rotDelta: 0, reelDrop: 0, restDelta: 0,
    maxTension: 0, maxAngular: 0, cut: false, others: [],
  }, {});
  if (glide.includes('ship.coast')) holes.push('hands-off motion without decay counts as ship.coast');

  const shot = deriveHappened({
    attStart: false, attEnd: false, playerDisp: 0, launchSpeed: 0, endSpeed: 0,
    maxSpeed: 0, speedAt10: 0, rotDelta: 0, reelDrop: 0, restDelta: 0,
    maxTension: 0, maxAngular: 0, cut: false,
    others: [{ alias: 'wasp', speed: 55, launchSpeed: 0, disp: 40, hullDrop: 30 }],
  }, { fire: true });
  if (shot.includes('physics.collision')) holes.push('gun drift counts as physics.collision');

  const missingBody = contrastFails(
    { others: [{ alias: 'rock', speed: 40 }] },
    { others: [] },
    { path: 'others.rock.speed', primaryGtBy: 5 },
  );
  if (missingBody.length === 0) holes.push('ablation passes when the witness body is gone');

  const heavy = evaluateCandidate({
    id: 'hole.reel.a',
    mechanics: ['massline.reel', 'massline.tension'],
    happened: ['massline.reel', 'massline.tension'],
    fired: ['massline.reel', 'massline.tension'],
    bodyClass: 'heavy',
    family: 'gen-reel',
    ticks: 150,
    entityCount: 2,
    hostileCount: 0,
    minSeparation: 80,
    playerAlive: true,
    finite: true,
    labOk: true,
  });
  const same = evaluateCandidate({
    id: 'hole.reel.b',
    mechanics: ['massline.reel', 'massline.tension'],
    happened: ['massline.reel', 'massline.tension'],
    fired: ['massline.reel', 'massline.tension'],
    bodyClass: 'heavy',
    family: 'gen-static',
    ticks: 150,
    entityCount: 2,
    hostileCount: 0,
    minSeparation: 80,
    playerAlive: true,
    finite: true,
    labOk: true,
  }, { seenSignatures: new Set([heavy.signature]) });
  if (heavy.signature !== same.signature) holes.push('signature still depends on family name');
  if (same.accepted) holes.push('same fired set and body class accepted twice');
  return holes;
}

export async function executeCritic({ catalog, rows }) {
  const holes = gameableHoles();
  const problems = holes.slice();
  const acceptedScenes = [];
  for (const scene of catalog) {
    if (scene.presentation && acceptedScenes.length < 10) acceptedScenes.push(scene);
  }
  for (const scene of catalog) {
    if (acceptedScenes.length >= 10) break;
    if (!acceptedScenes.includes(scene)) acceptedScenes.push(scene);
  }
  const sample = criticSample(rows.filter((row) => row.simulated !== false));
  const rejected = [];
  for (const id of sample.rejectedIds) {
    const row = rows.find((item) => item.id === id && item.scene);
    if (row) rejected.push(row);
  }
  for (const row of rows) {
    if (rejected.length >= 10) break;
    if (!row.accepted && row.scene && !rejected.includes(row)) rejected.push(row);
  }

  const acceptedIds = [];
  for (const scene of acceptedScenes.slice(0, 10)) {
    const proof = await proveScene(scene);
    acceptedIds.push(scene.id);
    if (!proof.verdict.accepted) problems.push(`${scene.id} accepted scene failed gates: ${proof.verdict.reasons.join(',')}`);
    if ((proof.report.happened || []).includes('massline.latch')) problems.push(`${scene.id} fired pre-seeded latch`);
    if ((proof.report.happened || []).includes('ship.coast')) {
      const decay = proof.primary.summary.launchSpeed - proof.primary.summary.endSpeed;
      const releasedDecay = proof.primary.summary.maxSpeed - proof.primary.summary.endSpeed;
      if (decay < 8 && releasedDecay < 8) problems.push(`${scene.id} coast without decay`);
    }
    if ((proof.report.happened || []).includes('physics.collision')) {
      const ram = (proof.primary.summary.contacts || []).some((contact) => contact.playerInvolved && contact.impulse > 0);
      if (!ram) problems.push(`${scene.id} collision has no physics-owner contact receipt`);
    }
    if ((proof.report.happened || []).length < 2) problems.push(`${scene.id} fewer than two player-caused atoms`);
  }

  const rejectedIds = [];
  for (const row of rejected.slice(0, 10)) {
    rejectedIds.push(row.id);
    const run = await executeScenario(compileScene(row.scene));
    const happened = deriveHappened(run.summary, row.scene.primary);
    const fired = deriveFired(run.summary, row.scene.primary, row.scene.mechanics);
    const geo = geometryOf(row.scene);
    const verdict = evaluateCandidate({
      id: row.scene.id,
      family: row.family,
      mechanics: row.scene.mechanics,
      happened,
      fired,
      bodyClass: bodyClassOf(row.scene.bodies, run.summary, row.scene.attachment),
      ticks: row.scene.ticks,
      entityCount: geo.entityCount,
      hostileCount: (row.scene.bodies || []).filter((body) => body.role === 'hostile').length,
      minSeparation: geo.minSeparation,
      overlap: geo.overlap,
      playerAlive: run.summary.playerAlive === true,
      finite: run.summary.finite === true,
      labOk: run.labOk === true,
    }, { seenSignatures: new Set() });
    if (row.reasons.includes('trivial-variant')) continue;
    if (verdict.accepted && !row.reasons.includes('trivial-variant')) {
      problems.push(`${row.id} was rejected for ${row.reasons[0]} but a fresh run accepted it`);
    }
  }

  const seen = new Map();
  for (const row of rows) {
    if (!row.accepted) continue;
    if (seen.has(row.signature)) problems.push(`duplicate accept ${row.signature}: ${seen.get(row.signature)} and ${row.id}`);
    else seen.set(row.signature, row.id);
  }

  return {
    ok: problems.length === 0,
    problems,
    acceptedIds,
    rejectedIds,
  };
}
