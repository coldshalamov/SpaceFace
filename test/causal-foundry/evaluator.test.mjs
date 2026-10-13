import test from 'node:test';
import assert from 'node:assert/strict';

import { REJECTED_FIXTURES } from '../../src/data/causalFoundry/rejected.js';
import { blockedAtoms, runnableAtoms } from '../../tools/causal-foundry/vocabulary.js';
import { liveFactorySanity, screenScene } from '../../tools/causal-foundry/factoryBridge.js';
import { bodyClassOf, criticSample, evaluateCandidate, signatureOf } from '../../tools/causal-foundry/evaluate.js';
import { contrastFails, deriveHappened } from '../../tools/causal-foundry/observe.js';
import { gameableHoles } from '../../tools/causal-foundry/critic.js';
import { buildCandidates } from '../../tools/causal-foundry/generate.js';
import { ACCEPTED_SCENES } from '../../src/data/causalFoundry/accepted.js';
import {
  PRESENTATION_SCENES,
  certifyPresentationCard,
  controlsCoverTape,
  requiredControlNames,
} from '../../src/data/causalFoundry/presentation.js';
import { runLabScenario } from '../../src/testing/lab/runScenario.js';
import { compileScene } from '../../tools/causal-foundry/compileScene.js';

const ACCEPT = {
  id: 'syn.reel',
  family: 'reel',
  mechanics: ['massline.latch', 'massline.reel'],
  fired: ['massline.latch', 'massline.reel'],
  ticks: 150,
  entityCount: 2,
  hostileCount: 0,
  minSeparation: 80,
  overlap: false,
  playerAlive: true,
  finite: true,
  labOk: true,
  playerDisp: 50,
  restDelta: -60,
  maxTension: 400,
  interventionAffordances: 2,
};

test('runnable vocabulary excludes cold latch, fields, cargo, law, machines, jobs, contact hull', () => {
  const runnable = new Set(runnableAtoms().map((row) => row.id));
  for (const id of ['ship.thrust', 'ship.coast', 'massline.reel', 'massline.cut', 'physics.collision', 'weapons.fire', 'save.restore']) {
    assert.equal(runnable.has(id), true, id);
  }
  const blocked = new Set(blockedAtoms().map((row) => row.id));
  for (const id of ['fields.force', 'cargo.custody', 'law.witness', 'machine.industrial', 'npc.job', 'collision.hull', 'massline.coldLatch']) {
    assert.equal(blocked.has(id), true, id);
    assert.equal(runnable.has(id), false, id);
  }
});

test('evaluator accepts a two-cause reel and rejects frozen negatives', () => {
  const good = evaluateCandidate(ACCEPT);
  assert.equal(good.accepted, true, good.reasons.join(','));
  assert.equal(good.metrics.physicalCauseFraction, 1);
  for (const fixture of REJECTED_FIXTURES) {
    const verdict = evaluateCandidate(fixture);
    assert.equal(verdict.accepted, false, fixture.id);
  }
});

test('breadth and intervention count do not flip a zero-force reject', () => {
  const wide = evaluateCandidate(REJECTED_FIXTURES[0]);
  const narrow = evaluateCandidate({ ...REJECTED_FIXTURES[0], id: 'neg.breadth-small', entityCount: 2, interventionAffordances: 0 });
  assert.equal(wide.accepted, false);
  assert.equal(narrow.accepted, false);
  assert.ok(wide.reasons.some((reason) => reason.startsWith('zero-force:')));
  assert.equal(wide.metrics.costEntities, 6);
  assert.equal(wide.metrics.interventionAffordances, 8);
});

test('a second copy of an accepted signature is a trivial variant', () => {
  const seen = new Set();
  const first = evaluateCandidate(ACCEPT, { seenSignatures: seen });
  assert.equal(first.accepted, true);
  seen.add(first.signature);
  const second = evaluateCandidate({ ...ACCEPT, id: 'syn.reel.copy' }, { seenSignatures: seen });
  assert.equal(second.accepted, false);
  assert.ok(second.reasons.includes('trivial-variant'));
});

test('content factory caps and power-axis ban apply to scenes', () => {
  const sanity = liveFactorySanity();
  assert.equal(sanity.overCapRejected, true);
  assert.equal(sanity.heraldAccepted, true);
  const granted = screenScene({ id: 'x', bodies: [], rewards: { credits: 10 } });
  assert.equal(granted.ok, false);
  const swarm = screenScene({
    id: 'swarm',
    bodies: Array.from({ length: 30 }, (_, i) => ({ alias: `h${i}`, role: 'hostile', team: 1 })),
  });
  assert.equal(swarm.ok, false);
});

test('critic sample spreads rejection reasons', () => {
  const rows = [
    { id: 'a', accepted: true, reasons: [] },
    { id: 'r1', accepted: false, reasons: ['trivial-variant'] },
    { id: 'r2', accepted: false, reasons: ['trivial-variant'] },
    { id: 'z', accepted: false, reasons: ['zero-force:massline.reel'] },
    { id: 's', accepted: false, reasons: ['single-mechanic'] },
    { id: 'o', accepted: false, reasons: ['spawn-overlap'] },
  ];
  const sample = criticSample(rows, ['cf.reel-berth']);
  assert.deepEqual(sample.rejectedIds.slice(0, 4), ['r1', 'z', 's', 'o']);
  assert.deepEqual(sample.catalogIds, ['cf.reel-berth']);
});

test('player-caused gates are not satisfied by preseed, glide, or gun drift', () => {
  assert.deepEqual(gameableHoles(), []);
  const glide = deriveHappened({
    attStart: false, attEnd: false, playerDisp: 100, launchSpeed: 40, endSpeed: 39.5,
    maxSpeed: 40, speedAt10: 40, rotDelta: 0, reelDrop: 0, restDelta: 0,
    maxTension: 0, maxAngular: 0, cut: false, others: [],
  }, {});
  assert.equal(glide.includes('ship.coast'), false);
  assert.equal(signatureOf(['massline.reel', 'massline.tension'], 'heavy'), signatureOf(['massline.tension', 'massline.reel'], 'heavy'));
  assert.equal(bodyClassOf([{ profile: 'asteroid.heavy', mass: 800 }]), 'heavy');
  assert.equal(bodyClassOf([{ profile: 'asteroid.light', mass: 40 }]), 'light');
  assert.equal(bodyClassOf([{ profile: 'asteroid.heavy', mass: 800, dynamic: false }]), 'anchored-heavy');
  const gone = contrastFails(
    { others: [{ alias: 'rock', speed: 20 }] },
    { others: [] },
    { path: 'others.rock.speed', primaryGtBy: 5 },
  );
  assert.ok(gone.length > 0);
});

test('generator candidates are deterministic and stay on runnable atoms', () => {
  const first = buildCandidates().map((row) => row.scene.id);
  const second = buildCandidates().map((row) => row.scene.id);
  assert.deepEqual(first, second);
  assert.ok(first.length >= 100);
  assert.equal(new Set(first).size, first.length);
});

test('presentation cards are verified only after the public lab accepts the compiled scenario', { timeout: 180000 }, async () => {
  assert.equal(PRESENTATION_SCENES.length, 10);
  for (const card of PRESENTATION_SCENES) {
    const scene = ACCEPTED_SCENES.find((entry) => entry.id === card.id);
    assert.ok(scene, card.id);
    assert.equal(card.verified, false, `${card.id} verified before a lab run`);
    assert.equal(card.trace, undefined, card.id);
    assert.equal(card.document && card.document.schema, 'spaceface.simScenario.v1', card.id);
    assert.deepEqual(card.document, compileScene(scene), card.id);
    assert.equal(controlsCoverTape(card.controls, scene.primary), true, `${card.id} ${card.controls.join(', ')}`);
    const verdict = await certifyPresentationCard(card);
    assert.equal(verdict.ok, true, `${card.id} ${verdict.status} ${verdict.error || ''}`);
    assert.notEqual(verdict.status, 'invalid-config', card.id);
    assert.equal(verdict.status, 'pass', card.id);
    assert.equal(verdict.certifying, true, card.id);
    assert.equal(typeof verdict.traceHash, 'string', card.id);
    assert.equal(verdict.verified, true, card.id);
    assert.equal(card.verified, false, `${card.id} import row flipped during the run`);
  }

  const reel = ACCEPTED_SCENES.find((entry) => entry.id === 'cf.reel-berth');
  const raw = await runLabScenario(reel.primary);
  assert.equal(raw.ok, false);
  assert.equal(raw.status, 'invalid-config');
  const rawCard = await certifyPresentationCard({
    id: 'cf.reel-berth',
    controls: ['KeyF hold', 'KeyQ reel'],
    document: reel.primary,
  });
  assert.equal(rawCard.verified, false);
  assert.equal(rawCard.ok, false);
  assert.equal(rawCard.status, 'invalid-config');

  const holdOnly = await runLabScenario({ hold: true });
  assert.equal(holdOnly.ok, false);
  assert.equal(holdOnly.status, 'invalid-config');
  assert.equal(holdOnly.exitClass, 4);

  const cutScene = ACCEPTED_SCENES.find((entry) => entry.id === 'cf.boost-cut');
  const cut = PRESENTATION_SCENES.find((card) => card.id === 'cf.boost-cut');
  const cutNames = requiredControlNames(cutScene.primary);
  assert.ok(cutNames.includes('thrust'));
  assert.ok(cutNames.includes('release'));
  assert.equal(controlsCoverTape(['KeyF hold', 'boost', 'KeyF tap'], cutScene.primary), false);
  const omitted = await certifyPresentationCard({
    id: cut.id,
    controls: ['KeyF hold', 'boost', 'KeyF tap'],
    document: cut.document,
  });
  assert.equal(omitted.ok, true, omitted.error || omitted.status);
  assert.notEqual(omitted.status, 'invalid-config');
  assert.equal(omitted.verified, false);

  const reelCard = PRESENTATION_SCENES.find((card) => card.id === 'cf.reel-berth');
  const swapped = structuredClone(reelCard.document);
  swapped.inputEvents = swapped.inputEvents.filter((event) => event.code !== 'KeyQ');
  swapped.frames[0].input.moveZ = 0;
  assert.equal(controlsCoverTape(reelCard.controls, reel.primary), true);
  assert.notDeepEqual(swapped, compileScene(reel));
  const substituted = await certifyPresentationCard({
    id: reelCard.id,
    controls: reelCard.controls,
    document: swapped,
    verified: false,
  });
  assert.equal(substituted.ok, true, `${substituted.status} ${substituted.error || ''}`);
  assert.equal(substituted.status, 'pass');
  assert.equal(substituted.certifying, true);
  assert.equal(substituted.verified, false);
  assert.equal(reelCard.verified, false);

  const unattached = structuredClone(reelCard.document);
  delete unattached.attachments;
  assert.notEqual(JSON.stringify(unattached), JSON.stringify(compileScene(reel)));
  const missingAttachment = await certifyPresentationCard({
    id: reelCard.id,
    controls: reelCard.controls,
    document: unattached,
  });
  assert.equal(missingAttachment.ok, true, `${missingAttachment.status} ${missingAttachment.error || ''}`);
  assert.equal(missingAttachment.status, 'pass');
  assert.equal(missingAttachment.certifying, true);
  assert.equal(missingAttachment.verified, false);

  const towCard = PRESENTATION_SCENES.find((card) => card.id === 'cf.tow-light');
  const relabeled = structuredClone(towCard.document);
  relabeled.id = 'cf.reel-berth';
  assert.notEqual(JSON.stringify(relabeled), JSON.stringify(compileScene(reel)));
  const otherBody = await certifyPresentationCard({
    id: reelCard.id,
    controls: reelCard.controls,
    document: relabeled,
  });
  assert.equal(otherBody.ok, true, `${otherBody.status} ${otherBody.error || ''}`);
  assert.equal(otherBody.status, 'pass');
  assert.equal(otherBody.certifying, true);
  assert.equal(otherBody.verified, false);

  const reseeded = structuredClone(reelCard.document);
  reseeded.seed = 1;
  assert.notEqual(JSON.stringify(reseeded), JSON.stringify(compileScene(reel)));
  const otherSeed = await certifyPresentationCard({
    id: reelCard.id,
    controls: reelCard.controls,
    document: reseeded,
  });
  assert.equal(otherSeed.ok, true, `${otherSeed.status} ${otherSeed.error || ''}`);
  assert.equal(otherSeed.status, 'pass');
  assert.equal(otherSeed.verified, false);

  const retitledDoc = structuredClone(reelCard.document);
  retitledDoc.title = 'not the compiled title';
  retitledDoc.description = 'not the compiled description';
  assert.notEqual(JSON.stringify(retitledDoc), JSON.stringify(compileScene(reel)));
  const retitled = await certifyPresentationCard({
    id: reelCard.id,
    controls: reelCard.controls,
    document: retitledDoc,
  });
  assert.equal(retitled.ok, true, `${retitled.status} ${retitled.error || ''}`);
  assert.equal(retitled.status, 'pass');
  assert.equal(retitled.verified, false);
});

test('speed changes and harmless projectile drift are not hull contacts without an owner receipt', () => {
  const moved = { alias: 'pod', speed: 55, launchSpeed: 0, disp: 40, hullDrop: 0 };
  const summary = { others: [moved], contacts: [] };
  assert.equal(deriveHappened(summary, { fire: true }).includes('physics.collision'), false);
  summary.contacts = [{ aAlias: 'projectile', bAlias: 'pod', impulse: 200, playerInvolved: false }];
  assert.equal(deriveHappened(summary, { fire: true }).includes('physics.collision'), false);
  summary.contacts = [{ aAlias: 'player', bAlias: 'pod', impulse: 200, playerInvolved: true }];
  assert.equal(deriveHappened(summary, {}).includes('physics.collision'), true);
});
