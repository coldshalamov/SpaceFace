import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { scanReveal } from '../src/systems/scanReveal.js';
import { lossLedger } from '../src/systems/lossLedger.js';

function rig(saved = null) {
  const state = { meta: { seed: 4242 }, simTime: 1, playerId: 1, player: {},
    entities: new Map(), entityList: [], world: { currentSectorId: 'sector_test', sectors: {} } };
  const bus = createBus();
  const ledger = Object.create(lossLedger); ledger.init({ state, bus });
  if (saved) ledger.deserialize(saved);
  const scanner = Object.create(scanReveal); scanner.init({ state, bus });
  const grants = []; bus.on('economy:grantCredits', p => grants.push(p));
  function add(id, sectorId = 'sector_test') {
    let loss = Object.values(state.lossLedger.bySector).flat().find(e => e.lossId === id);
    if (!loss) {
      loss = { lossId: id, kind: 'trader', sectorId, simDay: 1, t: state.simTime };
      (state.lossLedger.bySector[sectorId] ||= []).push(loss);
      state.lossLedger.entries.unshift(loss);
      state.lossLedger.entries.length = Math.min(64, state.lossLedger.entries.length);
    }
    const e = { id, type: 'wreck', alive: true, pos: { x: 100, z: 0 }, radius: 8,
      data: { provenance: { lossId: id }, salvagePool: { cmdty_scrap_metal: 3 } } };
    state.entityList = [e]; state.entities = new Map([[id, e]]); return e;
  }
  function pulse() { state.simTime += 1; bus.emit('scan:pulse', { pos: { x: 0, z: 0 } }); }
  return { state, bus, scanner, ledger, grants, add, pulse };
}

test('survey claims and chart milestones remain spent across a cold ledger restore', () => {
  const a = rig(); for (let i = 0; i < 3; i++) { a.add(`loss-${i}`); a.pulse(); }
  assert.equal(a.grants.filter(g => g.reason === 'survey_chart_bonus').length, 1);
  const saved = JSON.parse(JSON.stringify(a.ledger.serialize()));
  const b = rig(saved);
  for (let i = 0; i < 3; i++) { b.add(`loss-${i}`); b.pulse(); }
  assert.equal(b.grants.length, 0, 'Continue must not turn known wrecks into new claims');
  b.add('loss-new'); b.pulse();
  assert.deepEqual(b.grants.map(g => g.reason), ['survey_cartography']);
});

test('evicting the 64-entry survey cache cannot re-monetize a retained loss', () => {
  const a = rig();
  for (let i = 0; i < 65; i++) { a.add(`loss-${i}`, `sector-${Math.floor(i / 8)}`); a.pulse(); }
  assert.ok(Object.keys(a.state.scanReveal.investigated).length <= 64);
  const before = a.grants.length;
  a.add('loss-0', 'sector-0'); a.pulse();
  assert.equal(a.grants.length, before, 'the durable loss remains surveyed after cache eviction');
  a.state.entityList[0].pos.x = 1500; a.pulse();
  assert.equal(a.state.entityList[0].data.scanRevealed.recognized, true, 'a far scan still recognizes the known story');
});

test('restoring an older save replaces the current survey book rather than contaminating it', () => {
  const a = rig(); a.add('future-loss'); a.pulse();
  a.ledger.deserialize({ entries: [], seed: 4242 });
  assert.deepEqual(a.state.scanReveal, { investigated: {}, milestones: {} });
  a.add('future-loss'); a.pulse();
  assert.equal(a.grants.filter(g => g.lossId === 'future-loss').length, 2);
});

test('a new game clears survey memory and the serialized snapshot does not alias the live book', () => {
  const a = rig(); a.add('loss-1'); a.pulse();
  const saved = a.ledger.serialize();
  a.state.scanReveal.investigated['loss-1'].at = 999;
  assert.notEqual(saved.scanSurvey?.investigated['loss-1'].at, 999);
  a.ledger.newGame();
  assert.deepEqual(a.state.scanReveal, { investigated: {}, milestones: {} });
});

test('restored survey memory is bounded and invalid rows cannot invent past claims', () => {
  const investigated = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [String(i), { at: i, sectorId: 's' }]));
  investigated.bad = null; investigated.negative = { at: -1 }; investigated.nan = { at: 'wrong' };
  const a = rig({ entries: [], seed: 4242, scanSurvey: { investigated, milestones: { 's:3': { at: 1, count: 3 }, bad: null } } });
  assert.equal(Object.keys(a.state.scanReveal.investigated).length, 64);
  assert.equal(a.state.scanReveal.investigated.bad, undefined);
  assert.equal(a.state.scanReveal.investigated.negative, undefined);
  assert.equal(a.state.scanReveal.investigated.nan, undefined);
  assert.equal(a.state.scanReveal.milestones.bad, undefined);
});
