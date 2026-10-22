import test from 'node:test';
import assert from 'node:assert/strict';
import { pallasReefNativeFixture } from './fixtures/pallas-reef-native.mjs';
import { PALLAS_REEF_CREW as C, reefBody, pallasReefStatus } from '../src/data/pallasReefCrew.js';
import { livingWorkStatusText, createContactHailOffer, createContactHailResponse } from '../src/data/contactHail.js';
import {
  createDomainDiffer, applyDomainPathUpdate, createReadModel, applySpawnInfos, applyEntityVitals,
  canonicalClone, DOMAIN_MIRROR_KEYS,
} from '../scripts/lib/simReadModel.mjs';
import { collectEntityVitals, entityVitalsOf } from '../scripts/lib/simWorkerHost.mjs';
import { vfx, initNpcJobContactScratch } from '../src/render/vfx.js';
import { createNpcJobSignatureFrameScratch, installNpcJobLiveSignatureDraw, resolvePallasReefCutTarget } from '../src/render/npcJobSignatureVfx.js';

// Production worker serializer, JSON wire, main-side domain receiver and entity SPAWN shape.
// The fixture supplies real authored crew/jobs, with native physics deliberately disabled.
// Phase snapshots below exercise presentation transport, not physical-cut or delivery acceptance.
test('Pallas reef facts reach Hail through the bounded worker/main projection', async t => {
  const h = await pallasReefNativeFixture({ native: false });
  t.after(() => h.close());
  h.step();
  const workerActors = C.actors.map(a => reefBody(h.state, a.id));
  assert.ok(workerActors.every(Boolean), 'the production owner manifests all three reef workers');
  assert.equal(h.state.traffic.pallasReefCrew.id, C.id);
  assert.equal(typeof entityVitalsOf(workerActors[0], h.state).pallasReefCutting, 'boolean',
    'the real authored cutter satisfies the bounded beam producer identity gate');
  for (const actor of workerActors.slice(1)) {
    assert.equal(entityVitalsOf(actor, h.state).pallasReefCutting, undefined, 'tug and carrier have no cutter channel');
  }

  const main = {};
  const differ = createDomainDiffer();
  const domains = new Map();
  const model = createReadModel();
  applySpawnInfos(model, workerActors.map(e => ({
    v: 2, entityId: e.id, type: e.type, alive: e.alive, x: e.pos.x, z: e.pos.z,
    data: canonicalClone(e.data), vitals: { hull: e.hull },
  })));
  main.entities = model.entities;
  main.entityList = [...model.entities.values()];

  function transmit() {
    const wire = JSON.parse(JSON.stringify(differ.diff(h.state, h.state.tick).updates));
    for (const update of wire) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.')
        ? update.segs[0].split('.') : update.segs;
      domains.clear();
      domains.set(segs[0], main[segs[0]]);
      applyDomainPathUpdate(domains, { ...update, segs }, new Set());
      main[segs[0]] = domains.get(segs[0]);
    }
    return wire;
  }
  function publishPhase(phase, receipt = null) {
    // Advancing the transport clock is not a simulation step or proof of work performed.
    h.state.tick += 121;
    Object.assign(h.state.traffic.pallasReefCrew, {
      phase, receipt, observedTick: h.state.tick,
    });
    transmit();
    assert.equal(main.tick, h.state.tick);
    assert.equal(main.traffic.pallasReefCrew.phase, phase);
  }
  const actors = C.actors.map(a => reefBody(main, a.id));
  const [cutter, tug, carrier] = actors;
  const hail = (entity, choice = 'status') => {
    const response = createContactHailResponse(main, { kind: 'trader', targetId: entity.id }, choice);
    assert.ok(response, `${entity.data.pallasReefRole} has a ${choice} response`);
    return response.lines.join('\n');
  };

  await t.test('only the bounded reef leaf and projected jobs cross the wire', () => {
    h.state.traffic.reefPrivateProbe = { ownerGraph: 'must remain worker-only' };
    const wire = transmit();
    assert.equal(DOMAIN_MIRROR_KEYS.filter(k => k === 'traffic.pallasReefCrew').length, 1);
    assert.equal(DOMAIN_MIRROR_KEYS.includes('traffic'), false);
    assert.ok(wire.some(u => u.segs.join('.') === 'traffic.pallasReefCrew'));
    assert.deepEqual(main.traffic.pallasReefCrew, h.state.traffic.pallasReefCrew);
    assert.notEqual(main.traffic.pallasReefCrew, h.state.traffic.pallasReefCrew);
    assert.ok(Object.keys(main.traffic).every(k => ['pallasWorkLoop', 'pallasReefCrew'].includes(k)));
    assert.equal(main.traffic.reefPrivateProbe, undefined);
    assert.equal(main.traffic.freighters, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(main.traffic.pallasReefCrew)) < 1024);
    for (let i = 0; i < actors.length; i++) {
      const entity = actors[i], worker = workerActors[i];
      assert.ok(entity);
      assert.notEqual(entity, worker);
      assert.notEqual(entity.data, worker.data);
      const entry = main.npcJobs.byId[entity.data.jobId];
      assert.equal(entry.entityId, entity.id);
      assert.equal(entry.worldRecordId, C.actors[i].id);
      assert.notEqual(entry, h.state.npcJobs.byId[worker.data.jobId]);
      assert.equal(entry.job.payload.role, C.actors[i].role);
      assert.equal(entry.job.payload.pallasReefCrew, undefined, 'job work authority is not mirrored');
      assert.match(hail(entity), /Reef crew:/);
    }
  });

  await t.test('status and route describe reef work without promising a Sker delivery', () => {
    publishPhase('cutting');
    for (const entity of actors) {
      assert.match(livingWorkStatusText(entity, { state: main }), /cut window open/);
      assert.match(hail(entity), /cutter and tug assigned to the light section/);
      const route = hail(entity, 'route');
      assert.match(route, /Reef light cut to Drift Market/);
      assert.match(route, /Carrier intake follows the physical handoff/);
      assert.doesNotMatch(route, /Sker|Smuggler Den|Hollow Hub/i);
      const offer = createContactHailOffer(main, {
        enabled: true, kind: 'trader', targetId: entity.id, entity,
      }, 'reef-wire', 30);
      assert.ok(offer.actions.some(a => a.id === 'status'));
      assert.ok(offer.actions.some(a => a.id === 'route'));
    }
    publishPhase('holding');
    assert.match(hail(tug), /section released.*Awaiting calm before transfer/);
    publishPhase('transfer');
    assert.match(hail(carrier), /preparing a handoff outside the surge cone/);
    assert.doesNotMatch(hail(carrier), /received \d|has been sold/i);
  });

  await t.test('received, interrupted and recovered remain distinct after wire updates', () => {
    const receipt = {
      sourceKey: C.sourceKey, sectionRecordId: C.sectionId,
      carrierRecordId: C.actors[2].id, qty: 4, at: h.state.simTime,
    };
    publishPhase('received', receipt);
    assert.match(hail(carrier), /carrier received 4 units/);
    assert.match(hail(carrier), /original section is on the carrier’s external line/);
    assert.match(hail(carrier), /has not been sold/);
    assert.notEqual(main.traffic.pallasReefCrew.receipt, receipt);
    assert.ok(Buffer.byteLength(JSON.stringify(main.traffic.pallasReefCrew)) < 1024);
    // A retained historical receipt must not override the current interrupted/recovered state.
    publishPhase('interrupted', receipt);
    assert.match(hail(carrier), /work interrupted.*remains recoverable/);
    assert.doesNotMatch(hail(carrier), /carrier received|is on the carrier’s external line/);
    publishPhase('recovered', receipt);
    assert.match(hail(cutter), /someone else recovered.*no second cut/);
    assert.doesNotMatch(hail(cutter), /carrier received|remains recoverable/);
    publishPhase('lost', receipt);
    assert.match(hail(tug), /light section was lost.*No replacement stock/);
  });

  await t.test('stale, future and absent observation stamps cannot report current success', () => {
    const receipt = {
      sourceKey: C.sourceKey, sectionRecordId: C.sectionId,
      carrierRecordId: C.actors[2].id, qty: 4, at: h.state.simTime,
    };
    publishPhase('received', receipt);
    for (const offset of [-121, 1, null]) {
      h.state.tick += 121;
      h.state.traffic.pallasReefCrew.observedTick = offset === null ? undefined : h.state.tick + offset;
      transmit();
      assert.match(hail(carrier), /waiting for a current work report/);
      assert.match(livingWorkStatusText(carrier, { state: main }), /waiting for a current work report/);
      assert.doesNotMatch(hail(carrier), /carrier received|has not been sold/);
    }
    publishPhase('cutting');
    assert.match(hail(cutter), /cut window open/);
  });

  await t.test('a role marker alone cannot turn an unrelated actor into the reef crew', () => {
    const unrelated = { ...cutter, data: { ...cutter.data, worldRecordId: 'unrelated-worker' } };
    assert.equal(pallasReefStatus(main, unrelated), null);
    assert.doesNotMatch(livingWorkStatusText(unrelated, { state: main }) || '', /Reef crew:/);
    const mismatchedRole = { ...cutter, data: { ...cutter.data, pallasReefRole: 'carrier' } };
    assert.equal(pallasReefStatus(main, mismatchedRole), null);
    const wrongBook = { ...main, traffic: { ...main.traffic, pallasReefCrew: {
      ...main.traffic.pallasReefCrew, id: 'unrelated-crew',
    } } };
    assert.equal(pallasReefStatus(wrongBook, cutter), null);
    const wrongSector = { ...main, world: { ...main.world, currentSectorId: 'sector_hollow_hub' } };
    assert.equal(pallasReefStatus(wrongSector, cutter), null);
  });
});


// Synthetic authority snapshots isolate the real transport and comparison shadow. They do not
// claim that a native cut happened; the physical owner tests prove who can set these fields.
test('reef cutting vitals transport only a current authenticated cutter and exact target life', () => {
  const cutter = {
    id: 901, type: 'ship', alive: true, occupantGeneration: 41, radius: 12, pos: { ...C.actors[0].pos },
    data: {
      worldRecordId: C.actors[0].id, identityKey: C.actors[0].id, pallasReefRole: 'cutter',
      defId: C.actors[0].ship, sectorId: C.sectorId, homeSectorId: C.sectorId, jobId: 'reef-cutter-job',
      minerShiftActive: false, minerShiftRockId: null, pallasReefCutTargetGeneration: null,
    },
  };
  const section = {
    id: 902, type: 'wreck', alive: true, occupantGeneration: 42, radius: C.radius, pos: { ...C.pos },
    data: { worldRecordId: C.sectionId, salvageSourceKey: C.sourceKey, salvagePointId: C.salvagePointId },
  };
  const state = {
    mode: 'flight', tick: 50, world: { currentSectorId: C.sectorId },
    traffic: { pallasReefCrew: { id: C.id, phase: 'cutting', observedTick: 50 } },
    entities: new Map([[cutter.id, cutter], [section.id, section]]), entityList: [cutter, section],
    npcJobs: { byId: { 'reef-cutter-job': { entityId: cutter.id, worldRecordId: C.actors[0].id,
      kind: C.actors[0].kind, job: { id: 'reef-cutter-job', kind: C.actors[0].kind, phase: 'work',
        route: [{ id: 'not-a-real-cut', pos: { x: 99999, z: 99999 } }], payload: { role: 'cutter' } } } } },
  };
  const model = createReadModel(), shadow = new Map();
  const spawnInfo = e => ({
    v: 2, entityId: e.id, type: e.type, alive: e.alive, occupantGeneration: e.occupantGeneration,
    x: e.pos.x, z: e.pos.z, radius: e.radius, data: canonicalClone(e.data), vitals: entityVitalsOf(e, state),
  });
  applySpawnInfos(model, JSON.parse(JSON.stringify([spawnInfo(cutter), spawnInfo(section)])));
  const mainCutter = model.entities.get(cutter.id), retainedData = mainCutter.data;
  const main = { entities: model.entities, entityList: [...model.entities.values()] };
  const domainDiffer = createDomainDiffer();
  function publishDomains() {
    for (const update of JSON.parse(JSON.stringify(domainDiffer.diff(state, state.tick).updates))) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.')
        ? update.segs[0].split('.') : update.segs;
      const holder = new Map([[segs[0], main[segs[0]]]]);
      applyDomainPathUpdate(holder, { ...update, segs }, new Set());
      main[segs[0]] = holder.get(segs[0]);
    }
  }
  const strokes = [];
  const renderer = Object.assign(Object.create(vfx), {
    state: main, _ent: id => main.entities.get(id), _npcJobSignatureGen: 0,
    _npcJobSignatureSlots: [initNpcJobContactScratch({ jobId: null, profileId: null, elapsed: 0,
      lastEmitStep: -1, seed: 0, gen: -1, deploy: 0, reaction: 'none', reactionT: 0,
      frame: createNpcJobSignatureFrameScratch() })],
    _pirateInterceptScratch: null,
    _spawnStationSideEventStreak(...args) { strokes.push(args); return 1; },
    _spawnSprite() { assert.fail('reef cutter must not show a generic survey or work pulse'); },
  });
  installNpcJobLiveSignatureDraw(renderer);
  function render(reduced = false) {
    strokes.length = 0;
    main.settings = { video: { motionReduce: reduced } };
    renderer._updateNpcJobSignatures(1);
    return strokes;
  }
  function publish() {
    const wire = JSON.parse(JSON.stringify(collectEntityVitals(state, shadow)));
    applyEntityVitals(model, wire);
    publishDomains();
    return wire;
  }
  function assertOff(label) {
    assert.equal(mainCutter.data.minerShiftActive, false, label);
    assert.equal(mainCutter.data.minerShiftRockId, null, label);
    assert.equal(mainCutter.data.pallasReefCutTargetGeneration, null, label);
    assert.equal(render().length, 0, `${label}: real renderer emits no false work beam or generic pulse`);
  }
  function activate() {
    Object.assign(cutter.data, {
      minerShiftActive: true, minerShiftRockId: section.id,
      pallasReefCutTargetGeneration: section.occupantGeneration,
    });
    state.traffic.pallasReefCrew.observedTick = state.tick;
    const wire = publish();
    assert.equal(mainCutter.data.minerShiftActive, true);
    assert.equal(mainCutter.data.minerShiftRockId, section.id);
    assert.equal(mainCutter.data.pallasReefCutTargetGeneration, section.occupantGeneration);
    return wire;
  }
  publish();
  assertOff('spawn begins dark');
  const activeWire = activate();
  assert.equal(activeWire.length, 1);
  const fields = activeWire[0][1];
  assert.deepEqual(Object.keys(fields).filter(k => k.startsWith('pallasReef')).sort(), [
    'pallasReefCutTargetGeneration', 'pallasReefCutTargetId', 'pallasReefCutting',
  ]);
  assert.equal(fields.pallasReefCutting, true);
  assert.equal(fields.pallasReefCutTargetId, section.id);
  assert.equal(fields.pallasReefCutTargetGeneration, section.occupantGeneration);
  assert.equal(fields.data, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(fields)) < 256);
  assert.equal(publish().length, 0, 'unchanged cutting emits no new vitals');
  assert.equal(mainCutter.data, retainedData, 'renderer-held data reference stays live');
  assert.equal(render().length, 2, 'real renderer emits contact beam and spall from transported facts');
  const beam = strokes[0];
  const distance = Math.hypot(section.pos.x - cutter.pos.x, section.pos.z - cutter.pos.z);
  const ux = (section.pos.x - cutter.pos.x) / distance, uz = (section.pos.z - cutter.pos.z) / distance;
  const end = distance - section.radius, start = cutter.radius * 0.8;
  assert.ok(Math.abs(beam[0] - (cutter.pos.x + ux * (start + end) / 2)) < 1e-8);
  assert.ok(Math.abs(beam[2] - (cutter.pos.z + uz * (start + end) / 2)) < 1e-8);
  assert.ok(Math.abs(beam[5] - (end - start)) < 1e-8, 'beam ends on the real section, not the fake waypoint');
  assert.equal(render(true).length, 1, 'reduced-motion mode omits moving spall');

  // Renderer independently rejects bad local target membership/identity before any next wire reply.
  const mainSection = main.entities.get(section.id), mainJob = main.npcJobs.byId[cutter.data.jobId].job;
  for (const [label, invalidate, restore] of [
    ['missing facade target', () => main.entities.delete(section.id), () => main.entities.set(section.id, mainSection)],
    ['dead facade target', () => { mainSection.alive = false; }, () => { mainSection.alive = true; }],
    ['foreign facade source', () => { mainSection.data.salvageSourceKey = 'foreign'; }, () => { mainSection.data.salvageSourceKey = C.sourceKey; }],
    ['recycled facade target', () => main.entities.set(section.id, { ...mainSection, occupantGeneration: 43 }), () => main.entities.set(section.id, mainSection)],
    ['stale report without new vitals', () => { main.tick += 3; }, () => { main.tick -= 3; }],
    ['stale job binding', () => { main.npcJobs.byId[cutter.data.jobId].entityId = -1; }, () => { main.npcJobs.byId[cutter.data.jobId].entityId = cutter.id; }],
  ]) {
    invalidate();
    assert.equal(resolvePallasReefCutTarget(main, mainCutter, mainJob), null, label);
    assert.equal(render().length, 0, label);
    restore();
  }
  assert.equal(render().length, 2, 'restored current identity resumes the existing renderer path');

  for (const [label, invalidate, restore] of [
    ['dead target', () => { section.alive = false; }, () => { section.alive = true; }],
    ['missing target', () => state.entities.delete(section.id), () => state.entities.set(section.id, section)],
    ['foreign source', () => { section.data.salvageSourceKey = 'foreign'; }, () => { section.data.salvageSourceKey = C.sourceKey; }],
    ['foreign section', () => { section.data.worldRecordId = 'foreign'; }, () => { section.data.worldRecordId = C.sectionId; }],
    ['recycled target life', () => state.entities.set(section.id, { ...section, occupantGeneration: 43 }), () => state.entities.set(section.id, section)],
    ['stale observation', () => { state.traffic.pallasReefCrew.observedTick = state.tick - 3; }, () => {}],
    ['future observation', () => { state.traffic.pallasReefCrew.observedTick = state.tick + 1; }, () => {}],
    ['Continue awaiting observation', () => { state.traffic.pallasReefCrew.observedTick = -1; }, () => {}],
    ['interrupted work', () => { state.traffic.pallasReefCrew.phase = 'interrupted'; }, () => { state.traffic.pallasReefCrew.phase = 'cutting'; }],
    ['outside flight', () => { state.mode = 'docked'; }, () => { state.mode = 'flight'; }],
    ['wrong sector', () => { state.world.currentSectorId = 'foreign'; }, () => { state.world.currentSectorId = C.sectorId; }],
    ['dead cutter', () => { cutter.alive = false; }, () => { cutter.alive = true; }],
  ]) {
    activate();
    invalidate();
    const wire = publish();
    const off = wire.find(([id]) => id === cutter.id)?.[1];
    assert.ok(off, `${label} emits a clearing row even if the cutter fields did not change`);
    assert.equal(off.pallasReefCutting, false, label);
    assert.equal(off.pallasReefCutTargetId, null, label);
    assert.equal(off.pallasReefCutTargetGeneration, null, label);
    assertOff(label);
    restore();
  }
  activate();
  cutter.data.minerShiftActive = false;
  cutter.data.minerShiftRockId = null;
  cutter.data.pallasReefCutTargetGeneration = null;
  publish();
  assertOff('ordinary producer stop is false/null, not omitted fields');

  // Replayed SPAWN/Continue must override stale copied data with the current dark vitals.
  activate();
  state.traffic.pallasReefCrew.observedTick = -1;
  applySpawnInfos(model, JSON.parse(JSON.stringify([spawnInfo(cutter)])));
  publishDomains();
  assert.equal(model.entities.get(cutter.id), mainCutter);
  assertOff('Continue does not replay an old cutting beam before a current owner observation');
  const unrelated = { ...cutter, id: 903, data: { ...cutter.data, worldRecordId: 'unrelated' } };
  assert.equal(entityVitalsOf(unrelated, state).pallasReefCutting, undefined);
  unrelated.data.minerShiftActive = false;
  unrelated.data.minerShiftRockId = null;
  unrelated.data.pallasReefCutTargetGeneration = null;
  applySpawnInfos(model, [spawnInfo(unrelated)]);
  applyEntityVitals(model, [[unrelated.id, fields]]);
  assert.equal(model.entities.get(unrelated.id).data.minerShiftActive, false, 'receiver rejects an unrelated role marker');
  assert.equal(model.entities.get(unrelated.id).data.minerShiftRockId, null);
  assert.equal(resolvePallasReefCutTarget(main, model.entities.get(unrelated.id), main.npcJobs.byId[cutter.data.jobId].job), null);
});
