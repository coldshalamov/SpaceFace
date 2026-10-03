import { refKey, increment, compareId, clone, MAX_RETAINED_FACTS } from './schema.js';

// An edge is documentary lineage, not an inference from distance, actor, commodity or time.
const PARENT_STAGES = Object.freeze({
  aftermath: ['kill'], binding: ['aftermath'], salvage: ['binding', 'aftermath'],
  recovered: ['salvage', 'aftermath'], sold: ['recovered'],
  law: ['sold', 'kill', 'scan', 'recovered', 'trade'],
  reactor: ['binding', 'aftermath'], remedy: ['cause'],
});
const RELATION = Object.freeze({
  aftermath: 'left_aftermath', binding: 'materialized_as', salvage: 'processed',
  recovered: 'recovered_from', sold: 'sold_from', law: 'legal_consequence_of',
  reactor: 'reactor_action_on', remedy: 'remedied',
});

function freshStory(memory, fact) {
  const sequence = memory.nextStory++;
  return {
    id: `ch:s:${sequence}`, sequence, createdAt: fact.t, updatedAt: fact.t,
    nodes: [], edges: [], groups: [],
    revision: 0, signature: '', announcedRevision: 0,
    newsRevision: 0, newsAt: null, radioRevision: 0,
  };
}

/** Preserve a saga's important new outcome without discarding any causal-graph participant.
 * Repeated sightings are less useful than a later defeat; redundant wanted transitions are less
 * useful than the clear signal. General causal chains are never truncated to make room.
 */
function makeDetailRoom(story, incoming) {
  const unlinked = f => !story.edges.some(e => e.from === f.id || e.to === f.id);
  let disposable = null;
  if (incoming.stage === 'ace' && incoming.details.transition !== 'encountered') {
    disposable = story.nodes.find(f => f.stage === 'ace' && f.details.transition === 'encountered' && unlinked(f));
    if (!disposable) {
      const first = new Set();
      disposable = story.nodes.find(f => {
        if (f.stage !== 'ace') return false;
        const repeated = first.has(f.details.transition); first.add(f.details.transition);
        return repeated && unlinked(f);
      });
    }
  } else if (incoming.stage === 'wanted') {
    const wanted = story.nodes.filter(f => f.stage === 'wanted');
    const peak = wanted.reduce((a, b) => Math.max(a.details.level, a.details.previousLevel)
      >= Math.max(b.details.level, b.details.previousLevel) ? a : b, wanted[0]);
    disposable = wanted.find(f => f !== peak && unlinked(f));
  }
  if (!disposable) return false;
  story.nodes.splice(story.nodes.indexOf(disposable), 1);
  return disposable;
}

/**
 * Append facts, then resolve lineage across the WHOLE bounded memory in one batch.
 * This handles synchronous re-entrant publishers: a heat/wreck callback may run before the
 * Chronicler sees the kill which invoked it. Same-tick delivery order is not causality.
 */
export function ingestBatch(memory, batch) {
  const groups = new Map();
  for (const s of memory.stories) for (const group of s.groups) groups.set(group, s);
  const touched = new Set();
  const droppedDedupe = [];
  // The lineage pass is only reachable when a batch carries provides/parent refs (a link can
  // only be created or re-resolved by one) or appends a node out of t/seq order (the pass owns
  // node sorting). Plain kill/heat/receipt batches satisfy neither and skip the archive-wide
  // rebuild entirely.
  let needsLineage = false;
  for (const f of batch) {
    let group = f.group;
    if (f.stage === 'wanted') {
      const active = memory.stories.find(s => s.id === memory.activeWanted);
      if (active && f.details.previousLevel > 0) group = `wanted:${active.id}`;
    }
    let story = group ? groups.get(group) : null;
    if (!story) {
      story = freshStory(memory, f);
      memory.stories.push(story);
    }
    if (story.nodes.length >= memory.config.maxFactsPerStory) {
      increment(memory.metrics, 'detailDropped');
      const dropped = makeDetailRoom(story, f);
      if (!dropped) { droppedDedupe.push(f.dedupe); continue; }
      droppedDedupe.push(dropped.dedupe);
      touched.add(story.id);
    }
    const last = story.nodes[story.nodes.length - 1];
    if (last && (f.t - last.t || f.seq - last.seq) < 0) needsLineage = true;
    if (f.parent || (f.provides && f.provides.length)) needsLineage = true;
    else if (f.parentStatus === undefined) f.parentStatus = 'none';
    story.nodes.push(f);
    touched.add(story.id);
    story.updatedAt = Math.max(story.updatedAt, f.t);
    if (group && !story.groups.includes(group)) story.groups.push(group);
    if (f.stage === 'wanted' && f.details.level > 0) {
      const wantedGroup = `wanted:${story.id}`;
      if (!story.groups.includes(wantedGroup)) story.groups.push(wantedGroup);
      memory.activeWanted = story.id;
    } else if (f.stage === 'wanted' && f.details.cleared) memory.activeWanted = null;
    for (const g of story.groups) groups.set(g, story);
    increment(memory.metrics, 'accepted');
    updateProfile(memory, f);
  }
  if (needsLineage) {
    for (const id of resolveLineage(memory, touched)) touched.add(id);
  }
  return { touched, droppedDedupe };
}

/**
 * Rebuild lineage across the whole archive and return the ids of stories whose view-relevant
 * content changed: ingested/absorbed members (seedTouched), nodes whose parentStatus flipped,
 * and merged stories whose edge set differs from all prior contributors'. Callers that only
 * need the rebuild may ignore the return.
 */
export function resolveLineage(memory, seedTouched = null) {
  const providers = new Map();
  const nodes = [];
  const owner = new Map();
  const priorStatus = new Map();
  const priorEdgeKeys = new Map();
  const stories = memory.stories;
  const byId = new Map(stories.map(s => [s.id, s]));
  const roots = new Map(stories.map(s => [s.id, s.id]));
  const sizes = new Map(stories.map(s => [s.id, s.nodes.length]));
  function root(key) {
    let r = key;
    while (roots.get(r) !== r) r = roots.get(r);
    while (key !== r) { const next = roots.get(key); roots.set(key, r); key = next; }
    return r;
  }
  function join(a, b) {
    a = root(a); b = root(b);
    if (a === b) return true;
    // One Map.get, not two: `join` runs once per resolved lineage edge per batch, so the redundant
    // lookup is on the hot path of every ingest.
    const total = sizes.get(a) + sizes.get(b);
    if (total > memory.config.maxFactsPerStory) return false;
    if (byId.get(a).sequence > byId.get(b).sequence) [a, b] = [b, a];
    roots.set(b, a); sizes.set(a, total);
    return true;
  }
  for (const story of stories) {
    const edgeKeys = new Set();
    for (const e of story.edges || []) {
      edgeKeys.add(`${e.from}|${e.to}|${e.relation}|${e.certainty || ''}`);
    }
    priorEdgeKeys.set(story.id, edgeKeys);
    for (const fact of story.nodes) {
      nodes.push(fact); owner.set(fact.id, story.id);
      priorStatus.set(fact, fact.parentStatus);
      for (const r of fact.provides) {
        const key = refKey(r);
        if (!providers.has(key)) providers.set(key, []);
        providers.get(key).push(fact);
      }
    }
  }
  // Reserve fungible source quantities in deterministic simulation/receipt order. This is only
  // a proof-accounting check; it never changes cargo, credits or the authoritative trade result.
  nodes.sort((a, b) => a.t - b.t || a.seq - b.seq);
  const spent = new Map();
  const edges = [];
  let unresolved = 0, invalid = 0, ambiguous = 0;
  for (const fact of nodes) {
    if (!fact.parent) { fact.parentStatus = 'none'; continue; }
    const prior = fact.parentStatus;
    const allowed = PARENT_STAGES[fact.stage] || [];
    const raw = (providers.get(refKey(fact.parent)) || []).filter(p => p.id !== fact.id);
    let candidates = raw.filter(p => allowed.includes(p.stage) && p.t <= fact.t + 1e-9);
    // A death ID is ephemeral: do not connect a new body to an old death just because its
    // numeric entity ID was reused. Durable marker/receipt links have no such time horizon.
    if (fact.parent.kind === 'death') candidates = candidates.filter(p => Math.abs(p.t - fact.t) <= 1);
    const priority = Math.min(...candidates.map(p => allowed.indexOf(p.stage)));
    candidates = candidates.filter(p => allowed.indexOf(p.stage) === priority);
    if (candidates.length !== 1) {
      fact.parentStatus = candidates.length > 1 ? 'ambiguous' : 'pending';
      if (candidates.length > 1) ambiguous++;
      else unresolved++;
      continue;
    }
    const parent = candidates[0];
    let reason = null;
    if (fact.stage === 'sold') {
      if (fact.details.commodityId !== parent.details.commodityId) reason = 'commodity_mismatch';
      else if (!fact.actor.key || fact.actor.key !== parent.actor.key) reason = 'custody_mismatch';
      else if ((spent.get(parent.id) || 0) + fact.details.qty > parent.details.qty + 1e-9) reason = 'overdrawn_proof';
    }
    if (reason) {
      fact.parentStatus = reason; invalid++; continue;
    }
    if (!join(owner.get(fact.id), owner.get(parent.id))) {
      fact.parentStatus = 'capacity'; unresolved++; continue;
    }
    fact.parentStatus = 'resolved';
    if (prior !== 'resolved') increment(memory.metrics, 'linksResolved');
    if (fact.stage === 'sold') spent.set(parent.id, (spent.get(parent.id) || 0) + fact.details.qty);
    edges.push({ from: parent.id, to: fact.id, relation: RELATION[fact.stage], certainty: 'explicit' });
  }
  const merged = new Map();
  for (const story of stories) {
    const key = root(story.id);
    if (!merged.has(key)) {
      const primary = byId.get(key);
      merged.set(key, { ...primary, nodes: [], edges: [], groups: [] });
    }
    const target = merged.get(key);
    target.nodes.push(...story.nodes);
    target.groups = [...new Set([...target.groups, ...story.groups])].slice(0, 32);
    target.createdAt = Math.min(target.createdAt, story.createdAt);
    target.updatedAt = Math.max(target.updatedAt, story.updatedAt);
    if (story.id !== key) {
      // Preserve the surviving semantic signature. Only a changed narrative deserves a new
      // revision; a rematerialization binding must not republish an old battle.
      target.newsAt = later(target.newsAt, story.newsAt);
    }
  }
  for (const edge of edges) merged.get(root(owner.get(edge.from))).edges.push(edge);
  memory.stories = [...merged.values()].sort((a, b) => a.sequence - b.sequence);
  for (const s of memory.stories) {
    s.nodes.sort((a, b) => a.t - b.t || a.seq - b.seq);
    const meaningful = s.nodes.filter(n => !['binding', 'cause'].includes(n.stage));
    s.updatedAt = Math.max(...(meaningful.length ? meaningful : s.nodes).map(n => n.t));
    s.edges.sort((a, b) => compareId(a.from, b.from) || compareId(a.to, b.to));
  }
  if (memory.activeWanted) memory.activeWanted = roots.has(memory.activeWanted) ? root(memory.activeWanted) : null;
  // These three metrics are gauges of retained evidence, not cumulative failure counters.
  memory.metrics.unresolvedLinks = unresolved;
  memory.metrics.invalidLinks = invalid;
  memory.metrics.ambiguousLinks = ambiguous;
  // Touched-set: every story whose (nodes, edges, node statuses) changed this pass, in
  // post-merge root ids. Status flips and seed ids land through their owner's root; absorbed
  // stories mark both sides; the edge diff catches a re-resolution to a different parent that
  // keeps the same 'resolved' status (the only view change no flip reveals).
  const touchedPreMerge = new Set(seedTouched || []);
  for (const fact of nodes) {
    if (priorStatus.get(fact) !== fact.parentStatus) touchedPreMerge.add(owner.get(fact.id));
  }
  for (const story of stories) {
    const key = root(story.id);
    if (key !== story.id) { touchedPreMerge.add(key); touchedPreMerge.add(story.id); }
  }
  const touched = new Set();
  for (const id of touchedPreMerge) touched.add(root(id));
  for (const [key, mergedStory] of merged) {
    if (touched.has(key)) continue;
    const priorKeys = new Set();
    for (const story of stories) {
      if (root(story.id) === key) for (const k of priorEdgeKeys.get(story.id)) priorKeys.add(k);
    }
    let differs = mergedStory.edges.length !== priorKeys.size;
    if (!differs) {
      for (const e of mergedStory.edges) {
        if (!priorKeys.has(`${e.from}|${e.to}|${e.relation}|${e.certainty || ''}`)) { differs = true; break; }
      }
    }
    if (differs) touched.add(key);
  }
  return touched;
}
function later(a, b) { return a === null ? b : b === null ? a : Math.max(a, b); }

const LEGEND_RULES = Object.freeze({
  collisionKills: { title: 'The Wreckwright', noun: 'confirmed collision kills' },
  rescues: { title: 'A Hand in the Dark', noun: 'documented rescues' },
  aceDefeats: { title: 'The Ace Breaker', noun: 'documented ace defeats' },
});
const THRESHOLDS = [3, 7, 15];
function updateProfile(memory, f) {
  const key = f.actor.key;
  if (!key || !['kill', 'rescue', 'ace'].includes(f.stage)) return;
  let kind = null;
  if (f.stage === 'kill' && ['terrain_collision', 'ship_collision'].includes(f.details.cause)) kind = 'collisionKills';
  if (f.stage === 'rescue') kind = 'rescues';
  if (f.stage === 'ace' && f.details.transition === 'defeated') kind = 'aceDefeats';
  if (!kind) return;
  let profile = memory.profiles.find(p => p.actorKey === key);
  if (!profile) {
    if (memory.profiles.length >= memory.config.maxProfiles) {
      // A full sort of at most maxProfiles (64 by default) entries: bounded and not worth a heap,
      // and sorting the whole array keeps the choice deterministic under ties.
      const candidate = memory.profiles.filter(p => p.actorKey !== 'player')
        .sort((a, b) => a.lastAt - b.lastAt || compareId(a.actorKey, b.actorKey))[0];
      if (!candidate) return;
      memory.profiles.splice(memory.profiles.indexOf(candidate), 1);
    }
    profile = { actorKey: key, actorName: f.actor.name, lastAt: f.t, visibility: f.visibility,
      counts: { collisionKills: 0, rescues: 0, aceDefeats: 0 },
      examples: { collisionKills: [], rescues: [], aceDefeats: [] } };
    memory.profiles.push(profile);
  }
  profile.visibility = [profile.visibility, f.visibility].includes('private') ? 'private'
    : [profile.visibility, f.visibility].includes('player') ? 'player' : 'public';
  profile.lastAt = f.t;
  profile.actorName = f.actor.name;
  profile.counts[kind] = Math.min(Number.MAX_SAFE_INTEGER, profile.counts[kind] + 1);
  const proof = {
    factId: f.id, sourceEvent: f.event, receiptId: f.externalId,
    t: f.t, subject: f.subject?.name || null, sectorId: f.sectorId,
    cause: f.details.cause || f.details.transition || 'rescued',
  };
  profile.examples[kind].push(proof);
  if (profile.examples[kind].length > 3) profile.examples[kind].shift();
  const count = profile.counts[kind];
  if (!THRESHOLDS.includes(count)) return;
  const legendId = `ch:legend:${JSON.stringify([key, kind])}`;
  const prior = memory.legends.find(l => l.id === legendId);
  if (prior && prior.count >= count) return;
  const legend = {
    id: legendId, actorKey: key, actorName: f.actor.name, kind,
    title: LEGEND_RULES[kind].title, count, formedAt: f.t,
    text: `${f.actor.name === 'you' ? 'Your record' : f.actor.name + "'s record"}: ${count} ${LEGEND_RULES[kind].noun}.`,
    // Bounded exemplar receipts remain self-contained if the original episode is later evicted.
    evidence: clone(profile.examples[kind]), announced: false,
    visibility: profile.visibility,
  };
  if (prior) memory.legends.splice(memory.legends.indexOf(prior), 1);
  memory.legends.push(legend);
  if (memory.legends.length > memory.config.maxLegends) memory.legends.shift();
  increment(memory.metrics, 'legendsFormed');
}

/**
 * Score bonus for a story the player has already been shown — announced on comms, published as
 * news, or offered on band. Published evidence outranks unpublished evidence of equal standing.
 * See `pruneMemory` for why this cannot starve a chain that is still developing.
 */
const CITED_BONUS = 100;

/** Whole-story eviction preserves referential integrity: never leave half a causal proof.
 *  Returns the dedupe keys of evicted nodes so callers can retire dedupe slots. */
export function pruneMemory(memory, views, now) {
  // The bound is enforced on the fact count as well as the story count, because the fact ledger IS
  // `stories[].nodes[]`: two individually-legal configs (many small stories, few large ones) can
  // each sit under `maxStories` while together exceeding MAX_RETAINED_FACTS by a wide margin.
  let facts = 0;
  for (const story of memory.stories) facts += story.nodes.length;
  const over = Math.max(memory.stories.length - memory.config.maxStories,
    facts - MAX_RETAINED_FACTS, 0);
  if (over <= 0) return [];
  const scored = memory.stories.map(story => {
    const view = views.get(story.id);
    const agePenalty = Math.min(35, Math.max(0, now - story.updatedAt) / 600);
    const activeBonus = story.id === memory.activeWanted ? 100 : 0;
    // Without incubation, an archive full of old 100-point stories evicts a new kill before
    // its recovery/sale receipts can arrive. Protect development briefly, not indefinitely.
    //
    // This is a SORT TIER, not a score term, and that is deliberate. As arithmetic it was fragile:
    // a settled old story scores 100 with almost no age penalty while a brand-new kill scores 0, so
    // the old code's protection was worth about 1.7 points — any change to the scoring above would
    // silently starve the next causal chain. `hardening.test.mjs` pins exactly that starvation, so
    // the protection is now structural: a chain inside its incubation window is evicted only after
    // every chain outside one, regardless of how the scores fall. The window stays time-bounded,
    // so this is protection, not immortality.
    const incubating = now - story.createdAt < memory.config.incubationSeconds ? 1 : 0;
    // A story the player has already been TOLD is not the same evidence as one nobody has seen, and
    // must not be the first thing a flood of unremarkable kills evicts. Read from fields already on
    // the story, so no schema change and no save migration. Flat rather than lexicographic on
    // purpose: the archive is bounded and ties break on age, so a cited story still ages out.
    const citedBonus = story.announcedRevision > 0 || story.newsRevision > 0 || story.radioRevision > 0
      ? CITED_BONUS : 0;
    return {
      story,
      score: (view?.score || 0) - agePenalty + activeBonus + citedBonus,
      incubating,
    };
  }).sort((a, b) => a.incubating - b.incubating || a.score - b.score
    || a.story.updatedAt - b.story.updatedAt || a.story.sequence - b.story.sequence);
  const remove = new Set(scored.slice(0, over).map(r => r.story.id));
  const droppedDedupe = [];
  memory.stories = memory.stories.filter(s => {
    if (!remove.has(s.id)) return true;
    for (const f of s.nodes) droppedDedupe.push(f.dedupe);
    return false;
  });
  increment(memory.metrics, 'storiesEvicted', remove.size);
  if (remove.has(memory.activeWanted)) memory.activeWanted = null;
  return droppedDedupe;
}
