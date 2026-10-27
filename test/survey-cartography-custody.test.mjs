import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { lossLedger } from '../src/systems/lossLedger.js';
import { scanReveal } from '../src/systems/scanReveal.js';
import { save } from '../src/save/saveSystem.js';
import { MIGRATIONS } from '../src/save/migrations.js';
import { debrisCacheFor } from '../src/data/scanReveal.js';
import { normalizeSurveyMemory, legacySurveyMemory } from '../src/data/surveyCartography.js';

const sectorId = 'sector_helios_prime';
function boot(t) {
  const sim = createSimulation({ seed: 4242, systems: [economy, lossLedger, scanReveal, save], updateOrder: [] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight'; state.simTime = 100; state.world.currentSectorId = sectorId;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100,
    data: { defId: 'ship_kestrel' } });
  state.playerId = player.id;
  const grants = [];
  bus.on('economy:grantCredits', payload => { if (payload.reason.startsWith('survey')) grants.push(payload); });
  return { sim, state, bus, grants, save: sim.registry.get('save'), scan: sim.registry.get('scanReveal'),
    ledger: sim.registry.get('lossLedger') };
}
function loss(h, id, sector = sectorId) {
  h.state.simTime++;
  h.bus.emit('automation:assetLost', { kind: 'trader', id, value: 10, sectorId: sector });
  return h.state.lossLedger.entries[0].lossId;
}
function wreck(h, data = {}) {
  return h.sim.spawn({ type: 'wreck', team: 0, alive: true, pos: { x: 100, z: 0 }, radius: 8,
    hull: 10, hullMax: 10, flags: { persistent: true },
    data: { scanLabel: 'Wreck Debris', salvagePool: {}, ...data } });
}
const pulse = (h, x = 0) => h.bus.emit('scan:pulse', { pos: { x, z: 0 } });
const snapshot = h => JSON.parse(JSON.stringify(h.save.serialize('cartography-custody')));

// These are focused real-owner contracts, not a rendered/player-flight route.
test('structural frame does not receive the sector ship-loss identity', t => {
  const h = boot(t); loss(h, 'foreign'); const frame = wreck(h, { worldSiteStructural: true });
  assert.equal(frame.data.provenance?.lossId, undefined); pulse(h);
  assert.equal(frame.data.scanRevealed.lossId, null); assert.equal(h.grants.length, 0);
});

test('already contaminated structural save loses only cached false story, never wallet/provenance', async t => {
  const h = boot(t), id = loss(h, 'foreign');
  const frame = wreck(h, { worldSiteStructural: true, scanLabel: 'Authored frame',
    provenance: { lossId: id, authoredNote: 'preserve' },
    scanRevealed: { kind: 'wreck', quality: 'deep', lossId: id, story: 'A foreign ship went dark.' } });
  const before = h.state.player.credits, envelope = snapshot(h), cold = boot(t);
  assert.equal(await cold.save.loadEnvelope(envelope), true);
  const restored = cold.state.entityList.find(e => e.data?.worldSiteStructural);
  assert.equal(restored.data.scanRevealed, undefined, 'no stale false story before the first scan');
  assert.deepEqual(restored.data.provenance, frame.data.provenance);
  pulse(cold); assert.equal(restored.data.scanRevealed.story, null);
  assert.equal(restored.data.scanRevealed.lossId, null); assert.equal(restored.data.scanRevealed.wreckLabel, 'Authored frame');
  assert.equal(cold.grants.length, 0); assert.equal(cold.state.player.credits, before);
});

test('an authentic bound wreck keeps its loss through newer sector losses and repeated Continue', async t => {
  const h = boot(t), original = loss(h, 'original'), body = wreck(h);
  loss(h, 'newer'); h.bus.emit('entity:spawned', { type: 'wreck', entity: body, id: body.id });
  assert.equal(body.data.provenance.lossId, original);
  for (let i = 0; i < 3; i++) {
    assert.equal(await h.save.loadEnvelope(snapshot(h)), true);
    assert.equal(h.state.entityList.find(e => e.type === 'wreck').data.provenance.lossId, original);
  }
});

test('same-process restore cannot lend the outgoing ledger to an unbound saved wreck', async t => {
  const h = boot(t); wreck(h); const emptyHistory = snapshot(h);
  loss(h, 'outgoing-only');
  assert.equal(await h.save.loadEnvelope(emptyHistory), true);
  const restored = h.state.entityList.find(e => e.type === 'wreck');
  assert.equal(restored.data.provenance?.lossId, undefined); pulse(h); assert.equal(h.grants.length, 0);
});

for (const coldBoot of [false, true]) test(`${coldBoot ? 'cold' : 'same-process'} Continue keeps first claim and chart milestones exactly once`, async t => {
  const h = boot(t);
  for (let i = 0; i < 6; i++) { loss(h, `paid-${i}`); wreck(h); pulse(h); }
  const credits = h.state.player.credits, envelope = snapshot(h), next = coldBoot ? boot(t) : h;
  assert.equal(h.grants.filter(p => p.reason === 'survey_cartography').length, 6);
  assert.deepEqual(h.grants.filter(p => p.reason === 'survey_chart_bonus').map(p => p.amount), [200, 450]);
  const prior = next.grants.length;
  assert.equal(await next.save.loadEnvelope(envelope), true);
  pulse(next, 1400); pulse(next); pulse(next);
  assert.equal(next.grants.length, prior); assert.equal(next.state.player.credits, credits);
  assert.deepEqual(next.scan.serialize(), envelope.data.signalInvestigation.wreckSurvey);
  assert(next.state.lossLedger.entries.every(row => Number.isFinite(row.surveyedAt)));
});

test('sync, stepped and capture-plan serializers carry identical detached survey receipts', t => {
  const h = boot(t); loss(h, 'serialized'); wreck(h); pulse(h);
  const sync = h.save.serializeData(), steps = h.save._serializeDataSteps();
  let result; while (!(result = steps.next()).done) {}
  const plan = h.save._saveCapturePlan().find(([key]) => key === 'signalInvestigation')[1]().wreckSurvey;
  assert.deepEqual(sync.signalInvestigation.wreckSurvey, result.value.signalInvestigation.wreckSurvey); assert.deepEqual(plan, sync.signalInvestigation.wreckSurvey);
  const id = Object.keys(plan.investigated)[0]; plan.investigated[id].at = -1;
  assert.notEqual(h.state.scanReveal.investigated[id].at, -1);
});

test('recognition eviction and ledger pruning cannot reopen paid custody', async t => {
  const h = boot(t), id = loss(h, 'keep'); const body = wreck(h); pulse(h);
  const paid = h.state.player.credits;
  // Deliberately exhaust only the bounded recognition cache. The retained real loss owns payment.
  h.scan.deserialize({ investigated: Object.fromEntries(Array.from({ length: 70 }, (_, i) =>
    [`recognition-${i}`, { at: 1000 + i, sectorId, entityId: i }])), milestones: {} });
  assert.equal(Object.keys(h.state.scanReveal.investigated).length, 64);
  assert.equal(h.state.scanReveal.investigated[id], undefined);
  pulse(h, 1400); pulse(h); assert.equal(h.state.player.credits, paid);
  assert.equal(await h.save.loadEnvelope(snapshot(h)), true); pulse(h, 1400); pulse(h);
  assert.equal(h.state.player.credits, paid);
  // Real ledger pruning can leave a bySector-only row. It is readable but no longer payable.
  for (let i = 0; i < 65; i++) loss(h, `other-${i}`, `sector-other-${i}`);
  assert.equal(h.state.lossLedger.entries.some(row => row.lossId === id), false);
  assert(h.state.lossLedger.bySector[sectorId].some(row => row.lossId === id));
  h.scan.deserialize(null); pulse(h, 1400); pulse(h);
  assert.equal(h.state.player.credits, paid); assert.equal(body.data.provenance.lossId, id);
});

test('missing custody owner fails closed, then can retry without changing presentation', t => {
  const h = boot(t); loss(h, 'retry'); wreck(h); const owner = h.ledger._onSurveyClaim;
  h.bus.off('lossLedger:claimSurvey', owner); pulse(h); assert.equal(h.grants.length, 0);
  h.bus.on('lossLedger:claimSurvey', owner); pulse(h); assert.equal(h.grants.length, 1);
  pulse(h); assert.equal(h.grants.length, 1);
});

test('v21 migration recovers strong read evidence, marks unknown eligibility honestly, and is idempotent', async t => {
  const h = boot(t), paidId = loss(h, 'legacy-paid'); wreck(h); pulse(h); pulse(h, 1400);
  const unknownId = loss(h, 'legacy-unknown'), unknown = wreck(h);
  const envelope = snapshot(h), before = h.state.player.credits;
  // Synthetic pre-receipt shape for a migration contract, not an archived historical fixture.
  delete envelope.data.signalInvestigation.wreckSurvey;
  for (const row of envelope.data.lossLedger.entries) delete row.surveyedAt;
  envelope.version = 21; delete envelope.checksum;
  const migrate = MIGRATIONS.find(step => step.from === 21).fn, candidate = structuredClone(envelope.data);
  migrate(candidate); const once = structuredClone(candidate); migrate(candidate); assert.deepEqual(candidate, once);
  assert(Number.isFinite(candidate.lossLedger.entries.find(row => row.lossId === paidId).surveyedAt));
  const oldUnknown = candidate.lossLedger.entries.find(row => row.lossId === unknownId);
  assert.equal(oldUnknown.surveyRewardUnknown, true); assert.equal(oldUnknown.surveyedAt, undefined);
  const cold = boot(t), investigated = []; cold.bus.on('scan:wreckInvestigated', row => investigated.push(row));
  assert.equal(await cold.save.loadEnvelope(envelope), true); pulse(cold, 1400); pulse(cold);
  assert.equal(cold.grants.length, 0); assert.equal(cold.state.player.credits, before);
  const restoredUnknown = cold.state.entityList.find(e => e.data?.provenance?.lossId === unknown.data.provenance.lossId);
  assert.match(restoredUnknown.data.scanRevealed.story, /hauler went dark/);
  assert.equal(investigated.find(row => row.lossId === unknownId)?.paid, 0);
  pulse(cold, 1400); assert.equal(restoredUnknown.data.scanRevealed.recognized, true);
  assert.equal(cold.scan.serialize().legacyChartBonusesUnknown, true);
  const fresh = loss(cold, 'new-after-legacy'); wreck(cold); pulse(cold);
  assert.equal(cold.grants.filter(row => row.lossId === fresh).length, 1);
  for (let i = 0; i < 4; i++) { loss(cold, `new-chart-${i}`); wreck(cold); pulse(cold); }
  assert.equal(cold.grants.filter(row => row.reason === 'survey_chart_bonus').length, 0,
    'unrecorded old tier history cannot pay again even after fresh bounties');
});

test('malformed or absent scan memory and New Game do not inherit outgoing recognition/milestones', async t => {
  const h = boot(t); loss(h, 'old'); wreck(h); pulse(h);
  h.scan.deserialize({ investigated: ['bad'], milestones: ['bad'] });
  assert.deepEqual(h.scan.serialize(), { investigated: {}, milestones: {} });
  const empty = boot(t), envelope = snapshot(empty); delete envelope.data.signalInvestigation.wreckSurvey; delete envelope.checksum;
  assert.equal(await h.save.loadEnvelope(envelope), true);
  assert.deepEqual(h.scan.serialize(), { investigated: {}, milestones: {} });
  loss(h, 'new'); wreck(h); pulse(h); assert.notDeepEqual(h.scan.serialize().investigated, {});
  h.bus.emit('game:newGame', {}); assert.deepEqual(h.scan.serialize(), { investigated: {}, milestones: {} });
});

test('normalization rejects malformed/prototype keys and structural legacy claims', () => {
  const value = JSON.parse('{"investigated":{"__proto__":{"at":1},"constructor":{"at":1},"ok":{"at":-1,"sectorId":42}},"milestones":{"invalid":{},"sector:3":{"at":9,"count":99999}}}');
  const normalized = normalizeSurveyMemory(value);
  assert.deepEqual(Object.keys(normalized.investigated), ['ok']); assert.equal(normalized.investigated.ok.at, 0);
  assert.equal(normalized.milestones['sector:3'].count, 64); assert.equal({}.at, undefined);
  assert.deepEqual(legacySurveyMemory({ entities: { persistent: [{ type: 'wreck', data: {
    worldSiteStructural: true, scanRevealed: { quality: 'deep', lossId: 'foreign', revealedAt: 1 },
  } }] } }), { investigated: {}, milestones: {} });
});

// Reject at the shared cache producer, so both scanner and beam paths stay inert.
test('structural fixtures cannot turn rejected ship stories into generic cargo caches', t => {
  const h = boot(t); loss(h, 'foreign');
  const ordinary = { id: 19, type: 'wreck', data: { salvagePool: {} } };
  assert(debrisCacheFor(ordinary, 4242), 'seeded control is an actual cache winner');
  const frame = h.sim.spawn({ ...ordinary, alive: true, pos: { x: 100, z: 0 },
    data: { ...ordinary.data, worldSiteStructural: true } });
  const caches = []; h.bus.on('scan:debrisCache', row => caches.push(row));
  pulse(h);
  assert.equal(debrisCacheFor(frame, 4242), null);
  assert.equal(h.scan._resolveDebrisCache(h.state, frame, h.state.simTime, 'beam'), null);
  assert.equal(caches.length, 0); assert.equal(h.grants.length, 0);
});

test('v21 sidecar receipts migrate without a duplicate top-level shelf or lost chart-tier knowledge', () => {
  const migrate = MIGRATIONS.find(step => step.from === 21).fn;
  const data = { signalInvestigation: { records: { live: { stage: 'known' } }, wreckSurvey: {
    investigated: { paid: { at: 40, sectorId }, denied: { at: 41, sectorId, credited: false } },
    milestones: { [sectorId + ':3']: { at: 30, count: 3 } },
  } }, lossLedger: { entries: [{ lossId: 'paid' }, { lossId: 'denied' }, { lossId: 'unknown' }] },
    worldPressure: { marker: 19 }, crew: { marker: 20 }, salvageTender: { marker: 21 } };
  migrate(data); const once = structuredClone(data); migrate(data); assert.deepEqual(data, once);
  assert.equal(data.scanReveal, undefined);
  assert.equal(data.lossLedger.entries[0].surveyedAt, 40);
  assert.equal(data.lossLedger.entries[1].surveyRewardUnknown, true);
  assert.equal(data.lossLedger.entries[1].surveyedAt, undefined);
  assert.equal(data.lossLedger.entries[2].surveyRewardUnknown, true);
  assert.equal(data.signalInvestigation.wreckSurvey.legacyChartBonusesUnknown, undefined);
  assert.deepEqual(data.signalInvestigation.records, { live: { stage: 'known' } });
  assert.deepEqual([data.worldPressure.marker, data.crew.marker, data.salvageTender.marker], [19, 20, 21]);
});

test('missing sidecar adoption never borrows a deep investigation from the outgoing live wrecks', t => {
  const h = boot(t); loss(h, 'outgoing-live'); wreck(h); pulse(h);
  assert.notDeepEqual(h.scan.serialize().investigated, {});
  h.scan.deserialize(undefined);
  assert.deepEqual(h.scan.serialize(), { investigated: {}, milestones: {} });
});

test('a retained paid loss stays recognized after Continue even when the bounded survey cache is evicted', async t => {
  const h = boot(t), id = loss(h, 'retained-receipt'); wreck(h); pulse(h);
  const paid = h.state.player.credits, grants = h.grants.length;
  assert.equal(await h.save.loadEnvelope(snapshot(h)), true);
  h.scan.deserialize(null);
  const investigations = []; h.bus.on('scan:wreckInvestigated', p => investigations.push(p));
  pulse(h, 1400);
  const body = h.state.entityList.find(e => e.data?.provenance?.lossId === id);
  assert.equal(body.data.scanRevealed.recognized, true, 'the retained durable receipt identifies an old discovery');
  pulse(h);
  assert.equal(investigations.length, 0, 'recognition eviction is not another first investigation');
  assert.equal(h.grants.length, grants); assert.equal(h.state.player.credits, paid);
});
