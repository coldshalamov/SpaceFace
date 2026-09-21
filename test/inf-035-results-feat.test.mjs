// INF-035 — the results screen celebrates one real physical achievement.
//
// The ledger band carries the strongest banked stunt as a small cause-to-consequence line
// beside the score. Every named link comes from the bank's own evidenced acts; a run with
// no bank gets an honest alternative from its own figures, never a fake stunt.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { featDiagram } from '../src/ui/screens/crucible.js';

function act(episodeId, trickId, name) {
  return { episodeId, trickId, name, evidence: [{ kind: 'impulse' }], tick: episodeId * 60 };
}

const STUNT_RESULT = {
  seed: 7,
  score: 2400,
  kills: 9,
  bestChain: 6,
  bestLine: {
    points: 420,
    seed: 7,
    acts: [act(1, 'sling', 'Sling'), act(2, 'collision', 'Collision'), act(3, 'wasp_down', 'Wasp')],
  },
};

test('INF-035: the strongest stunt reads as a cause-to-consequence line', () => {
  const feat = featDiagram(STUNT_RESULT);
  assert.equal(feat.kind, 'stunt');
  const { text } = feat;
  const sling = text.indexOf('Sling');
  const collision = text.indexOf('Collision');
  const wasp = text.indexOf('Wasp');
  assert.ok(sling >= 0 && collision > sling && wasp > collision, 'launch, collision, victim in order');
  assert.match(text, /420/, 'the banked points travel with it');
  assert.match(text, /→/, 'a diagram, not a sentence');
});

test('INF-035: names without receipts are refused — the honest alternative wins', () => {
  const stripped = {
    ...STUNT_RESULT,
    bestLine: {
      points: 420,
      seed: 7,
      // Same names, but the middle act carries no evidence: not a receipt, not named.
      acts: [act(1, 'sling', 'Sling'), { episodeId: 2, trickId: 'collision', name: 'Collision', evidence: [] }, act(3, 'wasp_down', 'Wasp')],
    },
  };
  const feat = featDiagram(stripped);
  assert.notEqual(feat.kind, 'stunt', 'an evidenced refusal is never papered over');
  assert.match(feat.text, /No stunts banked/, 'the run still gets its honest line');
});

test('INF-035: a gun-only run gets an honest alternative, never a fake stunt', () => {
  const feat = featDiagram({ seed: 7, score: 800, kills: 5, bestChain: 0 });
  assert.equal(feat.kind, 'kills');
  assert.match(feat.text, /No stunts banked/);
  assert.match(feat.text, /5 kills/);
  assert.doesNotMatch(feat.text, /Sling|Collision|→/, 'no stunt vocabulary is invented');
});

test('INF-035: a chain without banks celebrates the chain', () => {
  const feat = featDiagram({ seed: 7, score: 800, kills: 9, bestChain: 12 });
  assert.equal(feat.kind, 'chain');
  assert.match(feat.text, /best chain 12/);
});

test('INF-035: one kill reads singular; nothing reads as nothing', () => {
  assert.match(featDiagram({ seed: 7, kills: 1 }).text, /1 kill\./);
  assert.equal(featDiagram({ seed: 7, kills: 0 }), null);
  assert.equal(featDiagram(null), null);
});
