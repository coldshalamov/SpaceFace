import { CHRONICLER_VERSION, DEFAULT_CONFIG, COUNTERS, FACT_EVENTS, STAGES, REF_KINDS,
  freshMemory, configFor } from './schema.js';

const ROOT_KEYS = ['schemaVersion', 'config', 'nextFact', 'nextStory', 'clock', 'pending',
  'seen', 'stories', 'profiles', 'legends', 'activeWanted', 'cadence', 'recallKeys', 'metrics'];
const FACT_KEYS = ['event', 'stage', 't', 'tick', 'sectorId', 'sectorName', 'zoneId', 'zoneName',
  'stationId', 'stationName', 'factionId', 'visibility', 'actor', 'subject', 'externalId',
  'provides', 'parent', 'group', 'details', 'dedupe', 'id', 'seq', 'parentStatus'];
const DETAILS = new Set(['cause', 'playerCaused', 'surface', 'victimClass', 'factionLawful', 'pos',
  'markerId', 'wreckId', 'victimId', 'sourceKind', 'commodityId', 'qty', 'total', 'kind',
  'provenanceMissing', 'transition', 'aceId', 'crew', 'count', 'returnTier', 'encounterId',
  'level', 'previousLevel', 'reason', 'tier', 'cleared', 'found', 'outcome', 'missionId']);
const STORY_KEYS = ['id', 'sequence', 'createdAt', 'updatedAt', 'nodes', 'edges', 'groups',
  'revision', 'signature', 'announcedRevision', 'newsRevision', 'newsAt', 'radioRevision'];
const COUNTS = ['collisionKills', 'rescues', 'aceDefeats'];
const EVENT_STAGES = Object.freeze({
  'entity:killed': ['kill'], 'aftermathWreck:recorded': ['aftermath'],
  'loot:manifestPayload': ['aftermath'], 'aftermathWreck:spawned': ['binding'],
  'salvage:completed': ['salvage'], 'chronicler:provenance': ['recovered', 'sold', 'law'],
  'economy:tradeCompleted': ['trade'], 'aceMemory:transition': ['ace'],
  'aceMemory:returnSpawned': ['ace'], 'distress:rescued': ['rescue'],
  'heat:changed': ['wanted'], 'contraband:scanned': ['scan'],
  'salvage:reactorVented': ['reactor'], 'salvage:reactorTowedClear': ['reactor'],
  'salvage:reactorBurst': ['reactor'], 'aftermath:causeRecorded': ['cause'],
  'aftermath:remedied': ['remedy'],
});
function check(ok, message) { if (!ok) throw new TypeError(`Invalid Chronicler snapshot: ${message}`); }
function object(value, keys, path) {
  check(value && typeof value === 'object' && !Array.isArray(value), `${path} must be an object`);
  check(Object.keys(value).every(k => keys.includes(k)), `${path} has unknown fields`);
}
function number(n, path, min = 0) { check(Number.isFinite(n) && n >= min, `${path} must be finite and >= ${min}`); }
function integer(n, path, min = 0) { check(Number.isSafeInteger(n) && n >= min, `${path} must be a safe integer`); }
function string(s, path, max = 512, nullable = false) {
  check(nullable && s === null || typeof s === 'string' && s.length <= max, `${path} must be a bounded string`);
}
function array(a, max, path) { check(Array.isArray(a) && a.length <= max, `${path} exceeds its bounded array contract`); }
function clock(n, path) { if (n !== null) number(n, path); }
function reference(r, path) {
  if (r === null) return;
  object(r, ['kind', 'id'], path);
  check(REF_KINDS.includes(r.kind), `${path}.kind`);
  string(r.id, `${path}.id`, 192); check(r.id.length > 0, `${path}.id is empty`);
}
function identity(a, path) {
  if (a === null) return;
  object(a, ['id', 'key', 'name', 'player'], path);
  string(a.id, `${path}.id`, 192, true); string(a.key, `${path}.key`, 256, true);
  string(a.name, `${path}.name`, 160); check(typeof a.player === 'boolean', `${path}.player`);
}
function fact(f, path) {
  object(f, FACT_KEYS, path);
  check(FACT_EVENTS.includes(f.event) && STAGES.includes(f.stage)
    && EVENT_STAGES[f.event].includes(f.stage), `${path}.event/stage`);
  integer(f.seq, `${path}.seq`, 1); check(f.id === `ch:f:${f.seq}`, `${path}.id`);
  number(f.t, `${path}.t`); integer(f.tick, `${path}.tick`);
  for (const k of ['sectorId', 'zoneId', 'stationId', 'factionId', 'externalId']) string(f[k], `${path}.${k}`, 192, true);
  for (const k of ['sectorName', 'zoneName', 'stationName']) string(f[k], `${path}.${k}`, 160);
  string(f.group, `${path}.group`, 384, true); string(f.dedupe, `${path}.dedupe`, 1024);
  check(['public', 'private', 'player'].includes(f.visibility), `${path}.visibility`);
  identity(f.actor, `${path}.actor`); check(f.actor !== null, `${path}.actor cannot be null`);
  identity(f.subject, `${path}.subject`);
  array(f.provides, 4, `${path}.provides`); f.provides.forEach(r => { reference(r, path); check(r !== null, path); });
  reference(f.parent, `${path}.parent`);
  object(f.details, [...DETAILS], `${path}.details`);
  for (const [k, value] of Object.entries(f.details)) {
    if (k === 'pos') {
      if (value !== null) {
        object(value, ['x', 'z'], path);
        number(value.x, path, -Number.MAX_VALUE); number(value.z, path, -Number.MAX_VALUE);
      }
    } else check(value === null || typeof value === 'boolean'
      || typeof value === 'string' && value.length <= 192
      || typeof value === 'number' && Number.isFinite(value), `${path}.details.${k}`);
  }
  if (['kill', 'ace', 'rescue'].includes(f.stage)) check(f.subject !== null, `${path}.subject is required`);
  if (f.stage === 'kill') {
    check(['generic', 'kinetic', 'explosive', 'terrain_collision', 'ship_collision'].includes(f.details.cause), `${path}.cause`);
    check(typeof f.details.playerCaused === 'boolean', `${path}.playerCaused`);
    check([null, 'terrain', 'craft', 'structure'].includes(f.details.surface), `${path}.surface`);
  }
  if (f.stage === 'ace') {
    check(['encountered', 'fled', 'defeated', 'flung', 'returned'].includes(f.details.transition), `${path}.transition`);
    string(f.details.aceId, `${path}.aceId`, 192);
  }
  if (f.stage === 'wanted') {
    integer(f.details.level, `${path}.level`); integer(f.details.previousLevel, `${path}.previousLevel`);
    check(f.details.level <= 5 && f.details.previousLevel <= 5 && typeof f.details.cleared === 'boolean', `${path}.wanted`);
  }
  if (f.stage === 'reactor') check(['reactorVented', 'reactorTowedClear', 'reactorBurst'].includes(f.details.outcome), `${path}.outcome`);
  if (['law', 'cause', 'remedy'].includes(f.stage)) string(f.details.kind, `${path}.kind`, 64);
  if (f.event === 'chronicler:provenance') {
    check(typeof f.externalId === 'string' && f.externalId.length > 0 && f.actor.id !== null, `${path}.receipt identity`);
    check(f.parent && (f.stage === 'recovered' ? ['marker', 'wreck'] : ['receipt']).includes(f.parent.kind), `${path}.source kind`);
  }
  if (['recovered', 'sold', 'trade'].includes(f.stage)) {
    number(f.details.qty, `${path}.qty`, Number.MIN_VALUE);
    check(f.details.qty <= 1e12 && typeof f.details.commodityId === 'string', `${path} cargo quantity/identity`);
  }
  if (['sold', 'trade'].includes(f.stage)) number(f.details.total, `${path}.total`);
  if (f.parentStatus !== undefined) check(['none', 'pending', 'ambiguous', 'resolved', 'capacity',
    'commodity_mismatch', 'custody_mismatch', 'overdrawn_proof'].includes(f.parentStatus), `${path}.parentStatus`);
}
function exemplar(e, path) {
  object(e, ['factId', 'sourceEvent', 'receiptId', 't', 'subject', 'sectorId', 'cause'], path);
  string(e.factId, path, 64); string(e.sourceEvent, path, 80);
  string(e.receiptId, path, 192, true); string(e.subject, path, 160, true);
  string(e.sectorId, path, 192, true); string(e.cause, path, 64); number(e.t, path);
}

/** Strict and atomic. Missing legacy data starts empty; malformed/future schemas do not wipe a run. */
export function restoreMemory(input, fallbackConfig, now = 0) {
  if (input === null || input === undefined) return freshMemory(fallbackConfig, now);
  check(typeof input === 'object' && input.schemaVersion === CHRONICLER_VERSION, 'unsupported schemaVersion');
  // Reject giant/cyclic input before traversal. This path runs only at a load boundary.
  const json = JSON.stringify(input);
  check(json.length <= 32 * 1024 * 1024, 'snapshot is larger than 32 MiB');
  const m = JSON.parse(json);
  object(m, ROOT_KEYS, 'root');
  object(m.config, Object.keys(DEFAULT_CONFIG), 'config');
  check(JSON.stringify(m.config) === JSON.stringify(configFor(m.config)), 'config is not canonical');
  integer(m.nextFact, 'nextFact', 1); integer(m.nextStory, 'nextStory', 1); number(m.clock, 'clock');
  array(m.pending, m.config.maxPending, 'pending');
  array(m.seen, m.config.maxSeen, 'seen'); m.seen.forEach(s => string(s, 'seen key', 1024));
  array(m.stories, m.config.maxStories, 'stories');
  const ids = new Set(), sequences = new Set(), storyIds = new Set();
  function uniqueFact(f, p) {
    fact(f, p); check(!ids.has(f.id) && !sequences.has(f.seq), 'duplicate fact identity');
    ids.add(f.id); sequences.add(f.seq); check(f.seq < m.nextFact, 'nextFact does not advance');
  }
  m.pending.forEach((f, i) => uniqueFact(f, `pending[${i}]`));
  for (const s of m.stories) {
    object(s, STORY_KEYS, 'story'); integer(s.sequence, 'story.sequence', 1);
    check(s.id === `ch:s:${s.sequence}` && s.sequence < m.nextStory && !storyIds.has(s.id), 'story identity');
    storyIds.add(s.id); number(s.createdAt, 'createdAt'); number(s.updatedAt, 'updatedAt');
    check(s.updatedAt >= s.createdAt, 'story chronology');
    array(s.nodes, m.config.maxFactsPerStory, 'story.nodes'); check(s.nodes.length > 0, 'empty story');
    s.nodes.forEach(f => uniqueFact(f, 'story.fact'));
    const local = new Set(s.nodes.map(f => f.id));
    array(s.edges, s.nodes.length, 'story.edges');
    for (const e of s.edges) {
      object(e, ['from', 'to', 'relation', 'certainty'], 'edge');
      check(local.has(e.from) && local.has(e.to) && e.from !== e.to && e.certainty === 'explicit', 'dangling/invalid edge');
      string(e.relation, 'edge.relation', 64);
    }
    array(s.groups, 32, 'groups'); s.groups.forEach(g => string(g, 'group', 384));
    for (const key of ['revision', 'announcedRevision', 'newsRevision', 'radioRevision']) integer(s[key], key);
    check(s.announcedRevision <= s.revision && s.newsRevision <= s.revision && s.radioRevision <= s.revision, 'revision order');
    clock(s.newsAt, 'story.newsAt'); string(s.signature, 'signature', 8192);
  }
  check(m.activeWanted === null || storyIds.has(m.activeWanted), 'activeWanted');
  object(m.cadence, ['newsAt', 'radioAt', 'recallAt'], 'cadence');
  for (const key of ['newsAt', 'radioAt', 'recallAt']) clock(m.cadence[key], key);
  array(m.recallKeys, 128, 'recallKeys'); m.recallKeys.forEach(k => string(k, 'recall key', 1024));
  object(m.metrics, COUNTERS, 'metrics'); COUNTERS.forEach(k => integer(m.metrics[k], `metrics.${k}`));
  array(m.profiles, m.config.maxProfiles, 'profiles');
  for (const p of m.profiles) {
    object(p, ['actorKey', 'actorName', 'lastAt', 'counts', 'examples', 'visibility'], 'profile');
    string(p.actorKey, 'actorKey', 256); string(p.actorName, 'actorName', 160); number(p.lastAt, 'profile.lastAt');
    check(['public', 'private', 'player'].includes(p.visibility), 'profile.visibility');
    object(p.counts, COUNTS, 'counts'); object(p.examples, COUNTS, 'examples');
    for (const key of COUNTS) { integer(p.counts[key], 'count'); array(p.examples[key], 3, 'examples'); p.examples[key].forEach(e => exemplar(e, 'example')); }
  }
  array(m.legends, m.config.maxLegends, 'legends');
  for (const l of m.legends) {
    object(l, ['id', 'actorKey', 'actorName', 'kind', 'title', 'count', 'formedAt', 'text', 'evidence', 'announced', 'visibility'], 'legend');
    string(l.id, 'legend.id', 512); string(l.actorKey, 'actorKey', 256); string(l.actorName, 'actorName', 160);
    check(COUNTS.includes(l.kind), 'legend.kind'); string(l.title, 'title', 160); string(l.text, 'text', 512);
    integer(l.count, 'legend.count', 1); number(l.formedAt, 'formedAt');
    check(typeof l.announced === 'boolean' && ['public', 'private', 'player'].includes(l.visibility), 'legend audience');
    array(l.evidence, 3, 'legend.evidence'); l.evidence.forEach(e => exemplar(e, 'legend evidence'));
  }
  return m;
}
