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
import { PRESENTATION_SCENES } from '../../src/data/causalFoundry/presentation.js';

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

test('presentation rows are the operable primary control, not an unverified caption', () => {
  assert.equal(PRESENTATION_SCENES.length, 10);
  for (const card of PRESENTATION_SCENES) {
    const scene = ACCEPTED_SCENES.find((entry) => entry.id === card.id);
    assert.ok(scene, card.id);
    assert.deepEqual(card.trace, scene.primary);
    assert.equal(card.verified, true, card.id);
    assert.ok(card.controls.length > 0, card.id);
  }
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
