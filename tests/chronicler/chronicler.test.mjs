import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, chain, receipts } from './harness.mjs';
import { normalizeFact } from '../../src/chronicler/normalize.js';
import { createChronicler } from '../../src/systems/chronicler.js';
import { createChroniclerVoiceBridge } from '../../src/chronicler/voiceBridge.js';
import { DEFAULT_CONFIG, FACT_EVENTS } from '../../src/chronicler/schema.js';

const full = h => h.system.query({ completeOnly: true, limit: 256 });
const statuses = h => h.system.query({ includePrivate: true, limit: 256 }).flatMap(v => v.evidence.map(f => f.parentStatus));

test('seven real-shaped receipts make a six-stage explicit causal story', () => {
  const h = harness(); chain(h); h.step(13);
  assert.equal(full(h).length, 1);
  const view = full(h)[0];
  assert.equal(view.kind, 'combat_salvage_economy_law');
  assert.deepEqual(view.milestones, ['kill', 'aftermath', 'salvage', 'recovered', 'sold', 'law']);
  assert.equal(view.evidence.length, 7);
  assert.equal(view.causalLinks.length, 6);
  assert.match(view.summary, /4 of those units were sold/);
  assert.match(view.summary, /a structure/);
  assert.doesNotMatch(view.summary, /999|asteroid|mercy/);
  assert.equal(h.events('news:publish').length, 1);
  assert.equal(h.events('chronicler:story').length, 1);
  assert.equal(h.events('news:publish')[0].sourceRef, `${view.id}:r${view.revision}`);
  assert.ok(h.events('news:publish')[0].evidence.every(e => e.factId && e.event));
});

test('processing a wreck is not inventory acquisition; native sale is not sourced salvage', () => {
  const h = harness(); chain(h, { through: 4 });
  h.emit(10, 'economy:tradeCompleted', { side: 'sell', commodityId: 'cmdty_salvage', qty: 999,
    total: 9000, stationId: 'station_helios_dock' });
  h.step(13);
  assert.equal(full(h).length, 0);
  const views = h.system.query();
  assert.equal(views.length, 2);
  assert.equal(views.find(v => v.kind === 'battle_salvage').milestones.length, 3);
  assert.equal(views.find(v => v.kind === 'trade').evidence[0].details.provenanceMissing, true);
});

test('re-entrant aftermath publication before its parent kill still resolves', () => {
  const rs = receipts();
  const h = harness({}, 4242, bus => {
    bus.on('entity:killed', () => { for (const packet of rs.slice(1)) bus.emit(...packet); });
  });
  h.emit(10, ...rs[0]); h.step(13);
  assert.equal(full(h).length, 1);
  assert.equal(h.system.diagnostics().unresolvedLinks, 0);
});

test('every same-tick delivery permutation resolves without treating delivery order as causality', () => {
  for (const order of [[6, 5, 4, 3, 2, 1, 0], [3, 6, 1, 4, 0, 5, 2], [5, 0, 6, 2, 4, 1, 3]]) {
    const h = harness(); chain(h, { order }); h.step(13);
    assert.equal(full(h).length, 1);
    assert.equal(full(h)[0].causalLinks.length, 6);
  }
});

test('a parent arriving in a later batch at the same sim-time backfills an unresolved chain', () => {
  const h = harness({ settleSeconds: 0 }); const rs = receipts();
  for (const packet of rs.slice(1)) h.emit(10, ...packet);
  h.step(10); assert.equal(full(h).length, 0);
  h.emit(10, ...rs[0]); h.step(10);
  assert.equal(full(h).length, 1);
});

test('a future parent is not permitted to explain an earlier effect', () => {
  const h = harness(); const rs = receipts();
  for (const packet of rs.slice(1)) h.emit(10, ...packet);
  h.step(10); h.emit(100, ...rs[0]); h.step(103);
  assert.equal(full(h).length, 0);
  assert.ok(h.system.diagnostics().unresolvedLinks > 0);
});

test('common player, sector, commodity and timing do not merge unrelated battles', () => {
  const h = harness(); chain(h, { suffix: '-A', through: 4 }); chain(h, { suffix: '-B', through: 4 });
  h.step(13);
  assert.equal(h.system.query().length, 2);
  assert.ok(h.system.query().every(v => v.evidence.filter(f => f.stage === 'kill').length === 1));
});

test('an encounter may group multiple losses but only a connected path counts as a full story', () => {
  const h = harness();
  h.emit(10, 'entity:killed', { id: 5, killerId: 1, encounterId: 'e1' });
  h.emit(10, 'entity:killed', { id: 6, killerId: 1, encounterId: 'e1' });
  h.emit(10, 'aftermathWreck:recorded', { victimId: 999, markerId: 'wrong', encounterId: 'e1' });
  h.emit(10, 'salvage:completed', { markerId: 'wrong', wreckId: 9 }); h.step(13);
  assert.equal(h.system.query().length, 1);
  assert.equal(full(h).length, 0);
  assert.equal(h.system.query()[0].milestones.length, 1);
});

test('overdrawn source quantities cannot finish a causal chain', () => {
  const h = harness(); const rs = receipts(); rs[5][1].qty = 9;
  for (const r of rs) h.emit(10, ...r); h.step(13);
  assert.equal(full(h).length, 0);
  assert.ok(statuses(h).includes('overdrawn_proof'));
  assert.equal(h.system.diagnostics().invalidLinks, 1);
});

test('partial sales conserve documentary quantity across distinct receipts', () => {
  const h = harness(); chain(h);
  const sale = receipts()[5][1];
  h.emit(10, 'chronicler:provenance', { ...sale, receiptId: 'second-sale', qty: 4 });
  h.emit(10, 'chronicler:provenance', { ...sale, receiptId: 'third-sale', qty: 1 }); h.step(13);
  assert.equal(full(h).length, 1);
  assert.equal(statuses(h).filter(s => s === 'overdrawn_proof').length, 1);
  const sales = h.system.query({ limit: 256 }).flatMap(v => v.evidence)
    .filter(f => f.stage === 'sold' && f.parentStatus === 'resolved');
  assert.equal(sales.reduce((n, f) => n + f.details.qty, 0), 8);
});

test('same-source sales cannot swap commodity or custody owner', () => {
  for (const [field, value, status] of [['commodityId', 'cmdty_gold', 'commodity_mismatch'], ['actorId', 22, 'custody_mismatch']]) {
    const h = harness(); const rs = receipts(); rs[5][1][field] = value;
    for (const r of rs) h.emit(10, ...r); h.step(13);
    assert.equal(full(h).length, 0); assert.ok(statuses(h).includes(status));
  }
});

test('ambiguous source aliases fail closed instead of choosing a convenient parent', () => {
  const h = harness();
  h.emit(10, 'entity:killed', { id: 7, killerId: 1, killId: 'life-a' });
  h.emit(10, 'entity:killed', { id: 7, killerId: 2, killId: 'life-b' });
  h.emit(10, 'aftermathWreck:recorded', { markerId: 'ambiguous', victimId: 7 }); h.step(13);
  assert.equal(h.system.diagnostics().ambiguousLinks, 1);
  assert.equal(h.system.query({ limit: 256 }).length, 3);
});

test('duplicates are suppressed in pending, retained and serialized memory even with a tiny recent ring', () => {
  const h = harness({ maxSeen: 1 }); const rs = chain(h);
  for (const r of rs) h.emit(10, ...r);
  h.step(13);
  assert.equal(h.system.diagnostics().facts, 7);
  const saved = h.system.serialize(); h.system.deserialize(saved);
  for (const r of rs.slice(1)) h.emit(13, ...r);
  h.step(13);
  assert.equal(h.system.diagnostics().facts, 7);
  assert.equal(h.system.diagnostics().duplicates, 13);
});

test('native trade and explicit trade proof share a transaction but do not double-count sourced cargo', () => {
  const h = harness(); chain(h);
  h.emit(10, 'economy:tradeCompleted', { receiptId: 'trade-29', side: 'sell', commodityId: 'cmdty_salvage',
    qty: 4, total: 240, stationId: 'station_helios_dock' }); h.step(13);
  assert.equal(h.system.query().length, 1);
  assert.equal(full(h).length, 1);
  assert.equal(full(h)[0].evidence.filter(f => f.stage === 'sold').length, 1);
});

test('source objects and query/event snapshots cannot mutate durable evidence', () => {
  const h = harness(); const rs = chain(h);
  rs[0][1].victimName = 'MUTATED'; rs[5][1].qty = 9999; h.step(13);
  h.bus.on('news:publish', p => { p.text = 'changed'; p.evidence.length = 0; });
  const view = full(h)[0]; view.summary = 'bad'; view.evidence[0].details.cause = 'bad';
  assert.match(full(h)[0].summary, /Morrow/);
  assert.equal(full(h)[0].evidence[0].details.cause, 'terrain_collision');
  assert.equal(full(h)[0].evidence.find(f => f.stage === 'sold').details.qty, 4);
});

test('normalization retains no renderer payloads, entity references or cyclic source objects', () => {
  const h = harness();
  const visual = { cause: 'ship_collision', surface: 'structure', playerCaused: false };
  visual.mesh = { parent: visual }; visual.pos = { x: 0, y: 123, z: 3 };
  h.emit(10, 'entity:killed', { id: 7, killerId: 1, presentation: visual, cause: 'kinetic' }); h.step(13);
  const saved = JSON.stringify(h.system.serialize());
  assert.doesNotMatch(saved, /mesh|123|"y"/);
  const f = h.system.query()[0].evidence[0];
  assert.equal(f.details.cause, 'ship_collision'); assert.equal(f.details.surface, 'structure');
  assert.equal(f.details.playerCaused, false); assert.equal(f.actor.player, false);
  assert.equal(h.system.diagnostics().profiles, 1); // NPC/uncredited key, NOT the player profile
  assert.notEqual(h.system.serialize().profiles[0].actorKey, 'player');
});

test('private/player-only evidence does not leak to public feeds, queries or recalls', () => {
  for (const visibility of ['private', 'player']) {
    const h = harness(); chain(h, { visibility }); h.step(13); h.step(200);
    assert.equal(h.system.query().length, 0);
    assert.equal(h.system.query({ includePrivate: true }).length, 1);
    assert.equal(h.outputs.length, 0);
    assert.equal(h.system.requestRecall({ sectorId: 'helios' }), null);
  }
});

test('legends are earned from distinct receipts and preserve exemplar evidence after episode eviction', () => {
  const h = harness({ maxStories: 2 });
  for (let i = 0; i < 3; i++) {
    h.emit(i * 10, 'entity:killed', { id: `ship-${i}`, killerId: 1, cause: 'ship_collision' }); h.step(i * 10 + 3);
  }
  assert.equal(h.system.diagnostics().stories, 2);
  assert.equal(h.system.getLegends()[0].title, 'The Wreckwright');
  assert.equal(h.system.getLegends()[0].count, 3);
  assert.equal(h.system.getLegends()[0].evidence.length, 3);
  assert.equal(h.events('chronicler:legend').length, 1);
});

test('a public last event cannot launder private history into a legend', () => {
  const h = harness();
  for (let i = 0; i < 3; i++) {
    h.emit(i, 'entity:killed', { id: i + 20, killerId: 1, cause: 'ship_collision', visibility: i === 0 ? 'private' : 'public' }); h.step(i);
  }
  h.step(10);
  assert.equal(h.system.getLegends().length, 0);
  assert.equal(h.system.getLegends({ includePrivate: true }).length, 1);
  assert.equal(h.events('chronicler:legend').length, 0);
});

test('escaped captain, return and defeat form a remembered saga without inventing mercy', () => {
  const h = harness();
  h.emit(10, 'aceMemory:transition', { aceId: 'ace-iona', aceName: 'Iona', transition: 'fled', record: { encounterCount: 1 } }); h.step(13);
  h.emit(400, 'aceMemory:returnSpawned', { aceId: 'ace-iona', aceName: 'Iona' }); h.step(403);
  h.emit(800, 'aceMemory:transition', { aceId: 'ace-iona', aceName: 'Iona', transition: 'defeated', record: { encounterCount: 2 } }); h.step(803);
  const v = h.system.query()[0];
  assert.equal(v.kind, 'ace_saga'); assert.match(v.summary, /escaping and returning/);
  assert.doesNotMatch(v.summary + v.radio, /mercy|spared|grateful|revenge/);
});

test('heat edges form one pursuit episode; clearing is not exoneration', () => {
  const h = harness();
  h.emit(10, 'heat:changed', { level: 2, previousValue: 0, value: .3, wantedCrossed: true, reason: 'piracy kill (ship)' }); h.step(13);
  h.emit(20, 'heat:changed', { level: 3, previousValue: .3, value: .5 }); h.step(23);
  h.emit(30, 'heat:changed', { level: 0, previousValue: .5, value: 0, wantedCrossed: true }); h.step(33);
  assert.equal(h.system.query().length, 1);
  assert.equal(h.system.query()[0].kind, 'wanted_cleared');
  assert.match(h.system.query()[0].summary, /level 3/);
  assert.match(h.system.query()[0].summary, /not an acquittal/);
  assert.equal(h.system.query()[0].causalLinks.length, 0);
});

test('a near-simultaneous piracy kill and WANTED event are not fabricated as an explicit causal edge', () => {
  const h = harness(); chain(h, { through: 1 });
  h.emit(10, 'heat:changed', { level: 2, previousValue: 0, value: .3, wantedCrossed: true, reason: 'piracy kill (ship)' }); h.step(13);
  assert.equal(h.system.query().length, 2);
  assert.ok(h.system.query().every(v => v.causalLinks.length === 0));
});

test('reactor and remedy facts are useful without inventing victims or outcomes', () => {
  const h = harness();
  h.emit(10, 'salvage:reactorVented', { wreckId: 800 });
  h.emit(10, 'aftermath:causeRecorded', { fingerprint: 'cause-a', consequenceKind: 'freight_loss' });
  h.emit(10, 'aftermath:remedied', { fingerprint: 'cause-a', missionId: 'mission-a', consequenceKind: 'freight_loss' }); h.step(13);
  assert.ok(h.system.query().some(v => v.kind === 'reactor_action'));
  assert.ok(h.system.query().some(v => v.kind === 'aftermath_remedied'));
  assert.doesNotMatch(h.system.query().map(v => v.summary).join(' '), /saved lives|averted/);
});

test('three documented rescues produce a distinct humanitarian legend', () => {
  const h = harness();
  for (let i = 0; i < 3; i++) h.emit(10, 'distress:rescued', { distressId: `d${i}`, targetId: i + 40 });
  h.step(13);
  assert.equal(h.system.getLegends()[0].title, 'A Hand in the Dark');
});

test('save preserves pending facts and serialization emits nothing', () => {
  const h = harness(); chain(h);
  const before = h.outputs.length, snap = h.system.serialize();
  assert.equal(snap.pending.length, 7); assert.equal(h.outputs.length, before);
  const resumed = harness(); resumed.at(10); resumed.system.deserialize(snap); resumed.step(13);
  h.step(13);
  assert.deepEqual(resumed.system.serialize(), h.system.serialize());
  assert.deepEqual(resumed.outputs, h.outputs);
});

test('mid-arc save/resume produces exactly the uninterrupted state and subsequent outputs', () => {
  const h = harness(); const rs = chain(h, { through: 4 }); h.step(13);
  const resumed = harness(); resumed.at(13); resumed.system.deserialize(h.system.serialize());
  const start = h.outputs.length;
  for (const r of receipts().slice(4)) { h.emit(30, ...r); resumed.emit(30, ...r); }
  for (const t of [33, 133, 260, 1000]) { h.step(t); resumed.step(t); }
  assert.deepEqual(resumed.system.serialize(), h.system.serialize());
  assert.deepEqual(resumed.outputs, h.outputs.slice(start));
});

test('restoring cadence does not replay an already published headline', () => {
  const h = harness(); chain(h); h.step(13);
  const resumed = harness(); resumed.at(13); resumed.system.deserialize(h.system.serialize());
  resumed.step(13); resumed.step(20); resumed.step(100);
  assert.equal(resumed.events('news:publish').length, 0);
  resumed.step(140); assert.equal(resumed.events('chronicler:radio').length, 1);
});

test('unsupported, corrupt and identity-rewinding saves fail atomically', () => {
  const h = harness(); chain(h); h.step(13); const original = h.system.serialize();
  const corruptions = [
    s => { s.schemaVersion = 99; },
    s => { s.nextFact = 1; },
    s => { s.stories[0].nodes[4].details.qty = -1; },
    s => { s.stories[0].edges[0].from = 'not-a-fact'; },
    s => { s.config.maxStories = 999999; },
    s => { s.secret = 'unrecognized'; },
  ];
  for (const corrupt of corruptions) {
    const s = structuredClone(original); corrupt(s);
    assert.throws(() => h.system.deserialize(s), /snapshot/i);
    assert.deepEqual(h.system.serialize(), original);
  }
});

test('legacy saves without Chronicler data start empty rather than manufacturing history', () => {
  const h = harness(); chain(h); h.step(13); h.system.deserialize(null);
  assert.equal(h.system.query().length, 0); assert.equal(h.system.diagnostics().facts, 0);
});

test('Continue does not clear memory; explicit new-game does', () => {
  const h = harness(); chain(h); h.step(13);
  h.bus.emit('game:started', {}); assert.equal(full(h).length, 1);
  h.at(0); h.bus.emit('game:new', {}); assert.equal(h.system.query().length, 0);
  assert.equal(h.system.diagnostics().accepted, 0);
});

test('load restoration ignores synthetic materialization events and resumes after failure', () => {
  const h = harness(); h.bus.emit('save:restoring', {});
  chain(h); h.step(13); assert.equal(h.system.diagnostics().facts, 0);
  h.bus.emit('save:error', {}); chain(h, { t: 20 }); h.step(23); assert.equal(full(h).length, 1);
});

test('field replacement at save:loaded rebinds the system rather than reading a stale object', () => {
  const h = harness(); chain(h); h.step(13); const snap = h.system.serialize();
  h.system.newGame(); h.state.chronicler = snap; h.bus.emit('save:loaded', {});
  assert.equal(full(h).length, 1);
});

test('unannounced clock rewinds stop processing until a proper lifecycle restore', () => {
  const h = harness(); chain(h); h.step(13); const saved = h.system.serialize();
  h.step(2); assert.equal(h.system.diagnostics().clockBlocked, true);
  assert.deepEqual(h.system.serialize(), saved);
  h.at(13); h.system.deserialize(saved); h.step(13);
  assert.equal(h.system.diagnostics().clockBlocked, false);
});

test('re-entrant publication reserves its cadence and leaves newly captured facts for the next step', () => {
  const h = harness(); let calls = 0;
  h.bus.on('news:publish', () => {
    calls++; h.bus.emit('distress:rescued', { distressId: 'during-publish', targetId: 987 });
    assert.equal(h.system.update(0, h.state), 0);
  });
  chain(h); h.step(13);
  assert.equal(calls, 1); assert.equal(h.system.diagnostics().pending, 1);
  h.step(14); assert.equal(h.system.diagnostics().pending, 0); assert.equal(calls, 1);
});

test('destroy and repeated init remove subscriptions, preserving only owned durable data', () => {
  const h = harness();
  h.system.init({ state: h.state, bus: h.bus });
  for (const event of FACT_EVENTS) assert.equal(h.bus._listeners.get(event)?.size, 1);
  chain(h); h.step(13); const snap = h.state.chronicler;
  h.system.destroy();
  for (const event of FACT_EVENTS) assert.equal(h.bus._listeners.get(event)?.size || 0, 0);
  assert.equal(h.state.chronicler, snap);
});

test('context recall works while docked, is local, and persists anti-repeat keys', () => {
  const h = harness(); chain(h); h.step(13); h.at(200); h.state.mode = 'docked';
  h.bus.emit('dock:docked', { stationId: 'unrelated-local-station', sectorId: 'helios' });
  assert.equal(h.events('chronicler:recall').length, 1);
  assert.match(h.events('chronicler:recall')[0].text, /sim-minutes ago/);
  assert.equal(h.system.requestRecall({ sectorId: 'other-sector' }), null);
  const saved = h.system.serialize();
  const resumed = harness(); resumed.at(200); resumed.system.deserialize(saved); resumed.at(1000);
  assert.equal(resumed.system.requestRecall({ context: 'dock', stationId: 'unrelated-local-station', sectorId: 'helios' }), null);
});

test('headline budgets and meaningful-revision cooldowns suppress spam', () => {
  const h = harness(); for (let i = 0; i < 10; i++) chain(h, { suffix: `-${i}` });
  h.step(13); assert.equal(h.events('news:publish').length, 1); assert.equal(h.events('chronicler:story').length, 4);
  h.step(14); assert.equal(h.events('chronicler:story').length, 8); assert.equal(h.events('news:publish').length, 1);
  h.step(73); assert.equal(h.events('news:publish').length, 2);
});

test('wreck rematerialization neither republishes nor rejuvenates an old story', () => {
  const h = harness(); chain(h); h.step(13); const original = full(h)[0];
  h.emit(1000, 'aftermathWreck:spawned', { markerId: 'aft-morrow', entityId: 'new-body' }); h.step(1003);
  const current = full(h)[0];
  assert.equal(current.revision, original.revision);
  assert.equal(current.updatedAt, original.updatedAt);
  assert.equal(h.events('news:publish').length, 1);
});

test('queue admission preserves higher-value provenance over ambient kill floods', () => {
  const h = harness({ maxPending: 8 });
  for (let i = 0; i < 100; i++) h.emit(10, 'entity:killed', { id: i + 100, killerId: 999 });
  chain(h); h.step(13);
  assert.equal(full(h).length, 1);
  assert.ok(h.system.diagnostics().queueDropped >= 99);
  assert.ok(h.system.diagnostics().pending <= 8);
});

test('per-update work budgets never publish an inbox-incomplete proof', () => {
  const h = harness({ factsPerUpdate: 2, settleSeconds: 0 }); chain(h);
  for (let i = 0; i < 3; i++) { assert.equal(h.step(10), 2); assert.equal(h.outputs.length, 0); }
  assert.equal(h.step(10), 1); assert.equal(full(h).length, 1); assert.equal(h.events('news:publish').length, 1);
});

test('retention caps evict whole episodes with no dangling edges', () => {
  const h = harness({ maxStories: 8, maxSeen: 16 });
  for (let i = 0; i < 80; i++) { chain(h, { t: i * 10, suffix: `-${i}` }); h.step(i * 10 + 3); }
  const saved = h.system.serialize();
  assert.ok(saved.stories.length <= 8); assert.ok(saved.seen.length <= 16);
  for (const s of saved.stories) {
    const ids = new Set(s.nodes.map(f => f.id));
    assert.ok(s.edges.every(e => ids.has(e.from) && ids.has(e.to)));
  }
  assert.ok(h.system.diagnostics().storiesEvicted > 0);
  assert.doesNotThrow(() => h.system.deserialize(saved));
});

test('dense single-episode detail is capped without growing an unbounded character saga', () => {
  const h = harness({ maxFactsPerStory: 12 });
  for (let i = 0; i < 100; i++) {
    h.emit(i, 'aceMemory:transition', { aceId: 'same-ace', aceName: 'Iona', transition: 'encountered', record: { encounterCount: i } }); h.step(i);
  }
  assert.equal(h.system.diagnostics().facts, 12);
  assert.equal(h.system.diagnostics().detailDropped, 88);
});

test('low-information or malformed input is bounded and cannot crash a fixed step', () => {
  const h = harness();
  for (const payload of [null, [], 1, {}, { id: NaN }, { id: 'x'.repeat(1000) }]) h.emit(10, 'entity:killed', payload);
  h.emit(10, 'economy:tradeCompleted', { side: 'buy' });
  h.emit(10, 'heat:changed', { level: 2, value: .3, previousValue: .3 });
  h.emit(10, 'chronicler:provenance', { receiptId: '__proto__', stage: 'sold', source: { kind: 'receipt', id: 'x' }, actorId: 1, commodityId: 'x', qty: Infinity });
  assert.doesNotThrow(() => h.step(13));
  assert.equal(h.system.diagnostics().facts, 0); assert.ok(h.system.diagnostics().invalid >= 6);
  assert.equal({}.polluted, undefined);
});

test('queries, serialization and simulation do not consult wall time or the gameplay RNG', () => {
  const h = harness(); chain(h);
  const random = Math.random, wall = Date.now;
  Math.random = () => { throw new Error('random'); }; Date.now = () => { throw new Error('wall time'); };
  try { h.step(13); h.system.query(); h.system.serialize(); h.step(1000); }
  finally { Math.random = random; Date.now = wall; }
  assert.equal(full(h).length, 1);
});

test('identical fixed-seed tapes produce byte-identical archives and emitted content', () => {
  const run = () => { const h = harness({}, 8008); chain(h); h.step(13); h.step(180); h.system.requestRecall({ sectorId: 'helios' }); return h; };
  const a = run(), b = run();
  assert.equal(JSON.stringify(a.system.serialize()), JSON.stringify(b.system.serialize()));
  assert.deepEqual(a.outputs, b.outputs);
});

test('idle fast path does not rebuild or sort stories on every simulation tick', () => {
  const h = harness(); chain(h); h.step(13); h.step(1000);
  let publishes = 0, refreshes = 0;
  const publish = h.system._publish, refresh = h.system._refreshViews;
  h.system._publish = function (...args) { publishes++; return publish.apply(this, args); };
  h.system._refreshViews = function (...args) { refreshes++; return refresh.apply(this, args); };
  for (let i = 1; i < 10000; i++) h.step(1000 + i / 60);
  assert.equal(publishes, 0); assert.equal(refreshes, 0);
});

test('campaign observation gate suppresses sealed-run writes and returns cleanly', () => {
  const h = harness({ shouldObserve: s => !s.sealed }); h.state.sealed = true;
  chain(h); h.step(13); assert.equal(h.system.diagnostics().observed, 0);
  h.state.sealed = false; chain(h, { t: 20 }); h.step(23); assert.equal(full(h).length, 1);
});

test('optional voice bridge submits real offers and never mislabels rejection as hearing', () => {
  const h = harness(); let accepted = false; const heard = [];
  const bridge = createChroniclerVoiceBridge({ bus: h.bus, helpers: { voice: { say(p) { heard.push(p); return accepted; } } } });
  chain(h); h.step(13); h.step(150);
  assert.equal(h.events('chronicler:voiceRejected').length, 1); assert.equal(heard[0].channel, 'band');
  accepted = true; h.at(200); h.system.requestRecall({ sectorId: 'helios' });
  assert.equal(h.events('chronicler:voiceAccepted').length, 1); assert.equal(heard[1].channel, 'comms');
  bridge.destroy(); assert.equal(h.bus._listeners.get('chronicler:radio').size, 1); // harness recorder only
});

test('each factory instance is independent and init enforces the real bus contract', () => {
  assert.throws(() => createChronicler().init({}), /requires/);
  const a = harness(), b = harness(); chain(a); a.step(13);
  assert.equal(b.system.query().length, 0);
  assert.equal(Object.keys(DEFAULT_CONFIG).length > 0, true);
});
