import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEntityVitals, entityVitalsOf } from '../scripts/lib/simWorkerHost.mjs';
import { createReadModel, applySpawnInfos, applyEntityVitals, createDomainDiffer,
  applyDomainPathUpdate, DOMAIN_MIRROR_KEYS, DOMAIN_CADENCE } from '../scripts/lib/simReadModel.mjs';
function lamp(life = 4, lit = false) {
  return {id: 71, type: 'payload', alive: true, hull: 40, occupantGeneration: life,
    data: {ninthMouthRole: 'lamp:0', ninthMouthIdentity: 'lw_ceres_ninth_mouth:lamp:0',
      worldRecordId: 'lw_ceres_ninth_mouth:lamp:0', ninthMouthLight: lit, ninthMouthInstalled: false}};
}
function spawn(model, e) {
  applySpawnInfos(model, [{entityId: e.id, type: e.type, occupantGeneration: e.occupantGeneration,
    data: {...e.data}, vitals: entityVitalsOf(e)}]);
}
test('original false lamp light reaches mirror then changes both ways without repeated steady traffic', () => {
  const e = lamp(), model = createReadModel(), shadow = new Map(), seen = new Set();
  const state = {entityList: [e]}; spawn(model, e);
  const row = model.entities.get(e.id), data = row.data;
  assert.equal(data.ninthMouthLight, false); assert.equal(row.occupantGeneration, 4);
  assert.equal(collectEntityVitals(state, shadow, seen).length, 1);
  assert.equal(collectEntityVitals(state, shadow, seen).length, 0);
  e.data.ninthMouthLight = true;
  const updates = collectEntityVitals(state, shadow, seen); assert.equal(updates.length, 1);
  applyEntityVitals(model, updates);
  assert.equal(row.data, data); assert.equal(data.ninthMouthLight, true);
  assert.equal(Object.hasOwn(row, 'ninthMouthLightOn'), false);
  assert.equal(collectEntityVitals(state, shadow, seen).length, 0);
  e.data.ninthMouthLight = false; applyEntityVitals(model, collectEntityVitals(state, shadow, seen));
  assert.equal(data.ninthMouthLight, false);
  e.hull = 0; applyEntityVitals(model, collectEntityVitals(state, shadow, seen)); assert.equal(row.hull, 0);
});
test('recycled identity, incomplete data and foreign lamp fields cannot switch another occupant light', () => {
  const old = lamp(4, true), model = createReadModel(); spawn(model, old);
  const delayed = entityVitalsOf(old), fresh = lamp(5, false); spawn(model, fresh);
  const row = model.entities.get(fresh.id);
  applyEntityVitals(model, [[fresh.id, delayed]]); assert.equal(row.data.ninthMouthLight, false);
  for (const fields of [
    {ninthMouthLightOn: true},
    {ninthMouthLightLife: 5, ninthMouthLightIdentity: 'lw_ceres_ninth_mouth:lamp:1', ninthMouthLightOn: true},
    {ninthMouthLightLife: 5, ninthMouthLightIdentity: fresh.data.ninthMouthIdentity, ninthMouthLightOn: 'true'},
  ]) { applyEntityVitals(model, [[fresh.id, fields]]); assert.equal(row.data.ninthMouthLight, false); }
  const fields = entityVitalsOf({...fresh, data: {...fresh.data, ninthMouthLight: true}});
  applyEntityVitals(model, [[fresh.id, fields]]); assert.equal(row.data.ninthMouthLight, true);
  const foreign = {...fresh, data: {...fresh.data, worldRecordId: 'foreign'}};
  assert.equal(Object.hasOwn(entityVitalsOf(foreign), 'ninthMouthLightOn'), false);
});
test('offer service marks ship hot and update in place on each changed tick', () => {
  assert.ok(DOMAIN_MIRROR_KEYS.includes('ceresNinthMouthOffer'));
  assert.equal(DOMAIN_CADENCE.ceresNinthMouthOffer, 1);
  const state = {ceresNinthMouthOffer: {id:'a', playerLife:4,
    serviceMarks:[{id:'berth',label:'Receiving apron',pos:{x:12,z:23},radius:20}]}};
  const differ = createDomainDiffer(), domains = new Map();
  for (const u of differ.diff(state, 1).updates) applyDomainPathUpdate(domains, u);
  const offer = domains.get('ceresNinthMouthOffer');
  assert.equal(offer.serviceMarks[0].pos.x, 12);
  state.ceresNinthMouthOffer.id = 'b'; state.ceresNinthMouthOffer.serviceMarks[0].pos.x = 99;
  for (const u of differ.diff(state, 2).updates) applyDomainPathUpdate(domains, u);
  assert.equal(domains.get('ceresNinthMouthOffer'), offer);
  assert.equal(offer.id, 'b'); assert.equal(offer.serviceMarks[0].pos.x, 99);
});

test('production worker channel transports lamp light changes and rebuilds without sharing native data', async t => {
  const {readFileSync} = await import('node:fs');
  const {createGameState} = await import('../src/core/gameState.js');
  const {createBus} = await import('../src/core/eventBus.js');
  const {createSimLaneRuntime} = await import('../src/core/simLaneMain.js');
  const {createSimHost} = await import('../scripts/lib/simWorkerHost.mjs');
  const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
  const worker = createSimHost(); let deliver, pending;
  const channelFactory = () => ({
    post(message) {
      if (message.kind === 'shutdown') return worker.shutdown();
      const op = message.kind === 'init' ? worker.init({...message, scenarioContract}) : worker.tick(message);
      Promise.resolve(op).then(reply => {
        const envelope = structuredClone({kind: message.kind === 'init' ? 'ready' : 'tickDone', seq: message.seq, ...reply});
        deliver(envelope);
        if (message.kind === 'tick' && message.steps > 0 && pending) {const p = pending; pending = null; p.resolve(envelope);}
      }, error => {
        deliver({kind:'error', seq:message.seq, message:String(error)});
        if (pending) {const p = pending; pending = null; p.reject(error);}
      });
    }, onMessage(callback) {deliver = callback;}, terminate() {worker.shutdown();},
  });
  const state = createGameState(4242);
  const lane = createSimLaneRuntime({state, registry:{}, bus:createBus(), flags:{lane:'worker', warnings:[], sab:false}, channelFactory});
  t.after(() => {lane.close(); worker.shutdown();}); await lane.readyPromise;
  const tick = () => new Promise((resolve,reject) => {pending = {resolve,reject}; lane.runner.stepOnce();});
  const spec = lamp(); delete spec.id; delete spec.occupantGeneration;
  Object.assign(spec, {physicsBody:false, radius:3, pos:{x:40,z:0}, vel:{x:0,z:0}});
  const native = worker.host.runtime.spawn(spec); await tick();
  const row = state.entities.get(native.id); assert.ok(row); assert.notEqual(row.data, native.data);
  assert.equal(row.data.ninthMouthLight, false);
  native.data.ninthMouthLight = true; await tick(); assert.equal(row.data.ninthMouthLight, true);
  assert.equal(state.entities.get(native.id), row);
  native.data.ninthMouthLight = false; lane.journal.requestRebuild(); await tick();
  assert.equal(state.entities.get(native.id), row); assert.equal(row.data.ninthMouthLight, false);
  native.data.ninthMouthLight = true; await tick(); assert.equal(row.data.ninthMouthLight, true);
});
