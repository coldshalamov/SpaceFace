// Row 475 — Around the World prints on a full-circle swing, and the Trick Book lists all
// seventeen tricks with their proven marks. stuntVariantFor is pure; the receipts are fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWN_TRICK_IDS,
  STUNT_VARIANT_NAMES,
  stuntVariantFor,
} from '../src/combat/stuntRecognition.js';
import { trickBookFor } from '../src/systems/survivalRecords.js';
import { ARENA_LAWS, arenaLawBountyFor } from '../src/data/survivalArenas.js';

const receipt = (sweep, { primary = 'wrecking_ball', surface = 'hull' } = {}) => ({
  surface,
  stuntEvidence: {
    root: {
      kind: 'constraint',
      tick: 100,
      reference: { cruise: 100, mass: 40 },
      constraint: { attached: true, loadedTicks: 90, sweep },
      sourceHostile: true, sourceType: 'ship', sourceDeathTick: null,
      before: { x: 10, z: 0 }, after: { x: -10, z: 0 }, dv: { x: 0, z: 0 },
    },
  },
});

test('w-475: a full-circle swing is Around the World — wrecking ball and bolas alike', () => {
  assert.equal(stuntVariantFor('wrecking_ball', receipt(370)), 'around_the_world');
  assert.equal(stuntVariantFor('bolas', receipt(400)), 'around_the_world');
  assert.equal(stuntVariantFor('wrecking_ball', receipt(360)), 'around_the_world', 'the boundary counts');
});

test('w-475: a shorter swing keeps the primary\'s own name — no variant', () => {
  assert.equal(stuntVariantFor('wrecking_ball', receipt(359)), null);
  assert.equal(stuntVariantFor('wrecking_ball', receipt(90)), null);
  assert.equal(stuntVariantFor('tow_kill', receipt(370)), null, 'a tow is not a swing');
  assert.equal(stuntVariantFor('rock_discovery', receipt(720)), null);
});

test('w-475: the variant reads through a chained prior root, like the swing check does', () => {
  const r = receipt(80);
  r.stuntEvidence.root.constraint = null;
  r.stuntEvidence.previousRoot = { constraint: { attached: false, loadedTicks: 40, sweep: 380 } };
  assert.equal(stuntVariantFor('bolas', r), 'around_the_world');
});

test('w-475: the print name exists and the trick count stays seventeen', () => {
  assert.equal(STUNT_VARIANT_NAMES.around_the_world, 'Around the World');
  assert.equal(KNOWN_TRICK_IDS.length, 17, 'the Trick Book lists the seventeen authored tricks');
});

test('w-475: the Trick Book lists every trick, proven flags come from filed Best Lines', () => {
  const book = trickBookFor(null);
  assert.equal(book.length, 17);
  assert.ok(book.every((row) => row.proven === false), 'an empty profile proves nothing');
  const names = new Set(book.map((row) => row.name));
  for (const want of ['Bolas', 'Wrecking Ball', 'Slingshot Golf', 'Ore Shotgun', 'Needle Thread']) {
    assert.ok(names.has(want), `the book lists ${want}`);
  }

  const profile = {
    bestLines: [{
      seed: 4242, points: 900,
      acts: [
        { episodeId: 'e1', trickId: 'wrecking_ball', name: 'Around the World', variantId: 'around_the_world',
          tick: 40, rootTick: 30, points: 120, evidence: [{ type: 'x' }], modifiers: {} },
        { episodeId: 'e2', trickId: 'bank_job', name: 'Bank Job',
          tick: 60, rootTick: 55, points: 90, evidence: [{ type: 'x' }], modifiers: {} },
        { episodeId: 'e3', trickId: 'not_a_trick', name: 'noise',
          tick: 70, rootTick: 65, points: 5, evidence: [{ type: 'x' }], modifiers: {} },
      ],
    }],
  };
  const filled = trickBookFor(profile);
  const ball = filled.find((row) => row.trickId === 'wrecking_ball');
  assert.equal(ball.proven, true);
  assert.deepEqual(ball.variants, ['Around the World'], 'the flourish attaches to its primary');
  assert.equal(filled.find((row) => row.trickId === 'bank_job').proven, true);
  assert.equal(filled.find((row) => row.trickId === 'bolas').proven, false);
  assert.equal(filled.filter((row) => row.proven).length, 2, 'unknown ids never enter the book');
});

test('w-475: every law arena names a real signature trick, and the bounty only answers it', () => {
  const known = new Set(KNOWN_TRICK_IDS);
  for (const [arenaId, law] of Object.entries(ARENA_LAWS)) {
    assert.ok(known.has(law.signatureTrick), `${arenaId} signs a real trick (${law.signatureTrick})`);
    const bounty = arenaLawBountyFor(arenaId, law.signatureTrick);
    assert.ok(bounty, `${arenaId} bounties its signature`);
    assert.equal(bounty.law, law.law);
    assert.equal(arenaLawBountyFor(arenaId, 'needle_thread'),
      law.signatureTrick === 'needle_thread' ? bounty : null, 'a non-signature trick pays no bounty');
  }
  assert.equal(arenaLawBountyFor('not_an_arena', 'bank_job'), null, 'unknown arenas pay nothing');
  assert.equal(arenaLawBountyFor(null, 'bank_job'), null);
});
