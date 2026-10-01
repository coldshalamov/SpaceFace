// MACH-02 — "The chronicler has a hard cap on facts and prunes to it".
//
// The fact ledger has no array of its own: it IS `memory.stories[].nodes[]`. Before this line the
// archive's fact ceiling was the implicit product `maxStories * maxFactsPerStory` — two knobs
// `configFor` raises independently — and nothing enforced it, named it, or tested it. The line's
// own do-not also required cited facts to outlive uncited ones, which the eviction score ignored.
//
// Run: node --test test/chronicler-fact-cap.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RETAINED_FACTS, DEFAULT_CONFIG, configFor } from '../src/chronicler/schema.js';
import { pruneMemory } from '../src/chronicler/ledger.js';
import { harness, chain, receipts } from '../tests/chronicler/harness.mjs';

const FULL_CHAIN = ['kill', 'aftermath', 'salvage', 'recovered', 'sold', 'law'];

function factCount(memory) {
  return memory.stories.reduce((n, s) => n + s.nodes.length, 0);
}

/** A minimal memory shaped the way `pruneMemory` actually reads one: no schema, no registry. */
function archiveMemory({ stories, maxStories, incubationSeconds = 0 }) {
  return {
    config: { maxStories, incubationSeconds },
    stories,
    activeWanted: null,
    metrics: { storiesEvicted: 0 },
  };
}
function syntheticStory(sequence, nodeCount, { cited = false, createdAt = 0 } = {}) {
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({ id: `ch:f:${sequence}:${i}`, stage: 'kill', t: createdAt, seq: sequence * 1000 + i });
  }
  return {
    id: `ch:s:${sequence}`, sequence, createdAt, updatedAt: createdAt,
    nodes, edges: [], groups: [], revision: 1,
    announcedRevision: cited ? 1 : 0, newsRevision: 0, radioRevision: 0,
  };
}

test('the fact ceiling is a named constant that does not narrow the shipped defaults', () => {
  assert.equal(typeof MAX_RETAINED_FACTS, 'number');
  assert.ok(Number.isInteger(MAX_RETAINED_FACTS) && MAX_RETAINED_FACTS > 0,
    'MAX_RETAINED_FACTS must be a positive integer');
  // The defaults' product must stay at or under the ceiling, or this line would silently retune
  // every existing save's retention instead of naming a bound.
  const defaultProduct = DEFAULT_CONFIG.maxStories * DEFAULT_CONFIG.maxFactsPerStory;
  assert.ok(defaultProduct <= MAX_RETAINED_FACTS,
    `default retention ${defaultProduct} exceeds the ceiling ${MAX_RETAINED_FACTS}`);
  // And `configFor` must stay byte-canonical: restoreMemory rejects a load whose recorded config is
  // not exactly configFor(config), so naming a bound must never make a valid save unloadable.
  assert.deepEqual(configFor({}), DEFAULT_CONFIG);
  assert.deepEqual(configFor(configFor({})), configFor({}));
});

test('an archive over the fact ceiling is pruned even when it is under the story ceiling', () => {
  // 60 stories of 80 facts each is 4800 facts but only 60 stories — legal on every story-count
  // knob, and the exact shape the old rule could not see.
  const stories = [];
  for (let i = 1; i <= 60; i++) stories.push(syntheticStory(i, 80, { createdAt: i * 10 }));
  const memory = archiveMemory({ stories, maxStories: 96 });
  assert.equal(factCount(memory), 4800);
  assert.ok(4800 > MAX_RETAINED_FACTS);

  pruneMemory(memory, new Map(), 100000);

  assert.ok(factCount(memory) <= MAX_RETAINED_FACTS,
    `fact ceiling not enforced: ${factCount(memory)} > ${MAX_RETAINED_FACTS}`);
  assert.ok(memory.stories.length <= 96);
  assert.ok(memory.metrics.storiesEvicted > 0);
});

test('the fact ceiling does not disturb an archive already inside it', () => {
  const stories = [];
  for (let i = 1; i <= 40; i++) stories.push(syntheticStory(i, 80, { createdAt: i * 10 }));
  const memory = archiveMemory({ stories, maxStories: 96 });
  const before = stories.map(s => s.id);
  pruneMemory(memory, new Map(), 100000);
  assert.deepEqual(memory.stories.map(s => s.id), before, 'a within-bound archive must not be pruned');
  assert.equal(memory.metrics.storiesEvicted, 0);
});

test('a 10,000-fact seed-4242 soak stays under the ceiling with no dangling lineage', () => {
  const h = harness({}, 4242);
  let emitted = 0;
  let peakFacts = 0;
  let peakStories = 0;
  // ~1,430 seven-fact episodes is a little over 10,000 facts. Step every episode so the pending
  // inbox never outgrows maxPending and the soak exercises the real update path, not a shortcut.
  for (let i = 0; i < 1440; i++) {
    chain(h, { t: 10 + i * 7, suffix: `-${i}` });
    emitted += receipts(`-${i}`).length;
    h.step(11 + i * 7);
    const d = h.system.diagnostics();
    peakFacts = Math.max(peakFacts, d.facts);
    peakStories = Math.max(peakStories, d.stories);
  }
  assert.ok(emitted > 10000, `soak emitted only ${emitted} facts`);

  assert.ok(peakFacts <= MAX_RETAINED_FACTS,
    `soak peaked at ${peakFacts} retained facts, above the ${MAX_RETAINED_FACTS} ceiling`);
  assert.ok(peakStories <= DEFAULT_CONFIG.maxStories,
    `soak peaked at ${peakStories} stories, above maxStories`);

  const saved = h.system.serialize();
  // Whole-story eviction is the contract: an edge may only name nodes inside its own story.
  let chains = 0;
  for (const s of saved.stories) {
    const ids = new Set(s.nodes.map(f => f.id));
    assert.ok(s.edges.every(e => ids.has(e.from) && ids.has(e.to)),
      `dangling edge in ${s.id}: the cap amputated a causal proof`);
    const stages = new Set(s.nodes.map(f => f.stage));
    if (FULL_CHAIN.every(stage => stages.has(stage))) chains++;
  }
  assert.ok(chains > 0, 'no complete causal chain survived the soak');
  assert.ok(h.system.diagnostics().storiesEvicted > 0, 'the soak evicted nothing — it proved nothing');
});

test('a cited episode outlives uncited peers of equal standing, but still ages out', () => {
  // Three weak, fully ANNOUNCED episodes (announcedRevision > 0) against a flood of fresh, louder,
  // never-published ones. Published evidence is not the same thing as evidence nobody has seen.
  const h = harness({
    maxStories: 4, settleSeconds: 0, incubationSeconds: 0,
    publishNews: false, offerRadio: false,
  }, 4242);

  const cited = [];
  for (let i = 0; i < 3; i++) {
    chain(h, { t: 10 + i * 10, suffix: `-cited${i}`, through: 2 });
    h.step(11 + i * 10);
    cited.push(`-cited${i}`);
  }
  const settled = h.system.serialize().stories.filter(s => s.announcedRevision > 0);
  assert.equal(settled.length, 3, 'the cited fixtures did not actually settle/announce');

  // Fresh uncited episodes, each scoring far higher than the thin cited ones.
  for (let i = 0; i < 24; i++) {
    chain(h, { t: 200 + i * 10, suffix: `-fresh${i}` });
    h.step(201 + i * 10);
  }

  const survivors = h.system.serialize().stories;
  assert.ok(survivors.length <= 4, 'retention cap not respected');
  // Identity, not the announced flag: with settleSeconds 0 the fresh episodes settle too, so
  // `announcedRevision` stops discriminating once the flood lands. Name the fixtures instead.
  const isCitedFixture = s => s.nodes.some(f => String(f.subject?.id || '').includes('-cited'));
  const keptCited = survivors.filter(isCitedFixture).length;
  assert.equal(keptCited, 3,
    'an announced episode was evicted ahead of an uncited peer — the line\'s do-not is violated');
  assert.equal(survivors.length - keptCited, 1,
    'the citation bonus is not discriminating: too many uncited episodes survived the flood');
});

test('a cited episode is protected, not immortal: it is still evictable once it is the coldest', () => {
  // The do-not is "do not drop cited facts BEFORE uncited ones" — a lexicographic cited-first rule
  // would satisfy that letter forever and starve the archive. Citation must decay.
  const stories = [];
  for (let i = 1; i <= 8; i++) {
    stories.push(syntheticStory(i, 4, { createdAt: i * 1000, cited: i === 1 }));
  }
  // A very old story: agePenalty saturates at 35, the cited bonus is worth 100. To be evictable it
  // must be the lowest scorer, which requires the peers to be newer AND worth more than it.
  stories[0].createdAt = 1;
  stories[0].updatedAt = 1;
  const memory = archiveMemory({ stories, maxStories: 7, incubationSeconds: 0 });
  const views = new Map(stories.slice(1).map(s => [s.id, { score: 1000 }]));

  pruneMemory(memory, views, 100000);

  assert.equal(memory.stories.length, 7);
  assert.ok(!memory.stories.some(s => s.id === 'ch:s:1'),
    'the cited episode survived against only uncited peers — the citation bonus never decays');
});

test('a soak archive round-trips through serialize/deserialize byte-for-byte', () => {
  const h = harness({ maxStories: 6 }, 4242);
  for (let i = 0; i < 40; i++) { chain(h, { t: 10 + i * 10, suffix: `-rt${i}` }); h.step(11 + i * 10); }
  const saved = h.system.serialize();

  h.system.deserialize(saved);
  assert.deepEqual(h.system.serialize(), saved,
    'a bounded archive must survive its own save boundary unchanged');
});
