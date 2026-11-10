import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, chain, receipts } from './harness.mjs';
import { normalizeFact } from '../../src/chronicler/normalize.js';
import { createChronicler } from '../../src/systems/chronicler.js';
let compactKillCausality;
try { ({ compactKillCausality } = await import('../../src/combat/killCausality.js')); }
catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  ({ compactKillCausality } = await import('../../../fixtures/killCausality.js'));
}

test('kill semantics conform to the supplied production helper over 1,176 combinations', () => {
  const h = harness();
  const causes = ['generic', 'kinetic', 'explosive', 'terrain_collision', 'ship_collision', 'unknown', undefined];
  let compared = 0;
  for (const cause of causes) for (const other of causes)
    for (const surface of ['terrain', 'craft', 'structure', 'unknown'])
      for (const playerCaused of [true, false, undefined]) for (const killerId of [1, 9]) {
        const p = { id: 42, killerId, cause: other, presentation: { cause, surface, playerCaused } };
        const d = normalizeFact('entity:killed', p, h.state).details;
        const expected = compactKillCausality(p, 1);
        assert.deepEqual({ cause: d.cause, surface: d.surface, playerCaused: d.playerCaused },
          { cause: expected.cause, surface: expected.surface, playerCaused: expected.playerCaused });
        compared++;
      }
  assert.equal(compared, 1176);
});

test('a remote event does not inherit the currently rendered sector name', () => {
  const h = harness();
  h.emit(10, 'entity:killed', { id: 42, killerId: 1, sectorId: 'sector_nyx', victimName: 'Courier' }); h.step(13);
  assert.match(h.system.query()[0].summary, /nyx/);
  assert.doesNotMatch(h.system.query()[0].summary, /Helios/);
});

test('ace record sector and explicit sector labels agree instead of mixing locations', () => {
  const h = harness();
  h.emit(10, 'aceMemory:transition', { aceId: 'iona', aceName: 'Iona', transition: 'encountered', record: { lastSectorId: 'sector_nyx' } }); h.step(13);
  assert.match(h.system.query()[0].summary, /nyx/);
  assert.doesNotMatch(h.system.query()[0].summary, /Helios/);
});

test('a multi-sector causal arc is recallable where its cargo was sold', () => {
  const h = harness(); const rs = receipts();
  for (let i = 0; i < rs.length; i++) {
    if (i >= 5) Object.assign(rs[i][1], { sectorId: 'nyx', sectorName: 'Nyx' });
    h.emit(10, ...rs[i]);
  }
  h.step(13); h.at(400);
  const v = h.system.query({ sectorId: 'nyx' })[0];
  assert.equal(v.complete, true); assert.deepEqual(v.sectorIds, ['helios', 'nyx']);
  assert.ok(h.system.requestRecall({ context: 'dock', stationId: 'station_helios_dock', sectorId: 'nyx' }));
});

test('clock rewind fails closed at capture as well as at update', () => {
  const h = harness(); chain(h); h.step(13); const before = h.system.serialize();
  h.emit(1, 'entity:killed', { id: 5, killerId: 1 });
  assert.deepEqual(h.system.serialize(), before);
  assert.equal(h.system.diagnostics().clockBlocked, true);
  h.step(14); assert.equal(h.system.diagnostics().clockBlocked, false);
});

test('semantically corrupt saves fail atomically, including event-stage and proof mismatches', () => {
  const h = harness(); chain(h); h.step(13); const before = h.system.serialize();
  const changes = [
    s => { s.stories[0].nodes[0].stage = 'ace'; },
    s => { s.stories[0].nodes[0].subject = null; },
    s => { s.stories[0].nodes[0].details.cause = 'invented_physics'; },
    s => { s.stories[0].nodes.find(f => f.stage === 'sold').parent.kind = 'wreck'; },
    s => { s.stories[0].nodes.find(f => f.stage === 'law').details.kind = {}; },
  ];
  for (const change of changes) {
    const bad = structuredClone(before); change(bad);
    assert.throws(() => h.system.deserialize(bad));
    assert.deepEqual(h.system.serialize(), before);
  }
});

test('initial existing-state adoption derives edges and does not trust a forged serialized edge', () => {
  const h = harness(); chain(h); h.step(13); const saved = h.system.serialize();
  const s = saved.stories[0]; s.edges = [{ from: s.nodes[0].id, to: s.nodes[6].id, relation: 'made_up', certainty: 'explicit' }];
  h.system.destroy(); h.state.chronicler = saved;
  const system = createChronicler().init({ state: h.state, bus: h.bus });
  assert.equal(system.query()[0].causalLinks.length, 6);
  assert.ok(system.query()[0].causalLinks.every(e => e.relation !== 'made_up'));
});

test('small positive quantities are never narrated as zero', () => {
  const h = harness();
  h.emit(10, 'economy:tradeCompleted', { side: 'sell', commodityId: 'ore', qty: 0.000001,
    total: 0.000002, stationId: 'dock' }); h.step(13);
  assert.match(h.system.query()[0].summary, /0\.000001 units/);
});

test('a dense ace saga makes room for the later outcome, not another routine sighting', () => {
  const h = harness({ maxFactsPerStory: 12 });
  for (let i = 0; i < 100; i++) {
    h.emit(i, 'aceMemory:transition', { aceId: 'iona', aceName: 'Iona', transition: 'encountered', record: { encounterCount: i } }); h.step(i);
  }
  for (const [t, transition] of [[110, 'fled'], [120, 'returned'], [130, 'defeated']]) {
    h.emit(t, 'aceMemory:transition', { aceId: 'iona', aceName: 'Iona', transition }); h.step(t);
  }
  assert.equal(h.system.diagnostics().facts, 12);
  assert.match(h.system.query()[0].summary, /defeated after escaping and returning/);
});

test('dense wanted transitions preserve the peak and the final clear flag', () => {
  const h = harness({ maxFactsPerStory: 12 });
  for (let i = 1; i <= 50; i++) {
    const level = i % 2 ? 5 : 2;
    h.emit(i, 'heat:changed', { level, value: .5, previousLevel: i === 1 ? 0 : level === 5 ? 2 : 5 }); h.step(i);
  }
  h.emit(60, 'heat:changed', { level: 0, value: 0, previousLevel: 2 }); h.step(63);
  assert.equal(h.system.query()[0].kind, 'wanted_cleared');
  assert.match(h.system.query()[0].summary, /reaching level 5/);
  assert.equal(h.state.chronicler.activeWanted, null);
  assert.equal(h.system.diagnostics().facts, 12);
});

test('fifteen documented rescues graduate a single legend through all three thresholds', () => {
  const h = harness({ maxStories: 4 });
  for (let i = 0; i < 15; i++) { h.emit(i * 10, 'distress:rescued', { id: `rescue-${i}` }); h.step(i * 10 + 3); }
  assert.equal(h.system.getLegends().length, 1);
  assert.equal(h.system.getLegends()[0].count, 15);
  assert.equal(h.system.diagnostics().legendsFormed, 3);
  const before = h.system.serialize(); h.system.deserialize(before);
  assert.deepEqual(h.system.serialize(), before);
});

test('a full archive of old legends cannot starve the next developing causal chain', () => {
  const h = harness({ maxStories: 3 });
  for (let i = 0; i < 3; i++) { chain(h, { suffix: `old-${i}`, t: i * 100 }); h.step(i * 100 + 3); }
  assert.equal(h.system.query({ completeOnly: true }).length, 3);
  const rs = receipts('new');
  for (let i = 0; i < rs.length; i++) {
    const t = 1000 + [0, 0, 0, 3, 8, 15, 23][i];
    h.emit(t, ...rs[i]); h.step(t);
  }
  h.step(1026);
  assert.ok(h.system.query({ completeOnly: true }).some(v => v.summary.includes('Morrownew')));
  assert.ok(h.system.diagnostics().stories <= 3);
});
