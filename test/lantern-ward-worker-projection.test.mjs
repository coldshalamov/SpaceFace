import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEntityVitals, entityVitalsOf } from '../scripts/lib/simWorkerHost.mjs';
import { createReadModel, applySpawnInfos, applyEntityVitals, applyDestroyIds,
  createDomainDiffer, applyDomainPathUpdate, configureDomainMirroring } from '../scripts/lib/simReadModel.mjs';
import { bindSabEnvelopeChannel, sabArenaTotalBytes, sabEnvelopePost, sabEnvelopeDrain,
  SAB_ENV_KIND } from '../scripts/lib/simSabEnvelope.mjs';
import { SAB_V8_CODEC } from '../scripts/lib/simSabV8Codec.mjs';
import { lanternWardHardwareSpec, LANTERN_WARD_RECORD_IDS as IDS } from '../src/data/lanternWardHardware.js';
import { LANTERN_WARD_ID, LANTERN_WARD_SECTOR } from '../src/data/lanternWardLayout.js';
import { lanternWardHailOffer, lanternWardDialogueFacts } from '../src/data/lanternWardHail.js';
import { lanternWardVisualPose } from '../src/render/lanternWardVisuals.js';

// Exercise both production envelope encodings, then the actual producer and receiver. These
// cases qualify projection only; the ordinary renderer/flight route has separate visual proof.
function transport(codec = null) {
  const shape = { slotCount: 1, recordCap: 8 };
  const sab = new SharedArrayBuffer(sabArenaTotalBytes(shape));
  const channel = bindSabEnvelopeChannel({ ...shape, sab, header: new Int32Array(sab, 0, 16) }, codec);
  return value => {
    sabEnvelopePost(channel, 'reply', value, SAB_ENV_KIND.TICK_DONE);
    let decoded;
    assert.equal(sabEnvelopeDrain(channel, 'reply', message => { decoded = message; }), 1);
    return decoded;
  };
}
function hardware(role, id = 41, life = 11) {
  return { ...lanternWardHardwareSpec(role), id, occupantGeneration: life };
}
function actor(role, id = 51, life = 21) {
  return { id, occupantGeneration: life, type: 'ship', alive: true, hull: 100, hullMax: 100,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 12, rot: 0,
    data: { lanternWardId: LANTERN_WARD_ID, lanternWardActor: role, worldRecordId: IDS[role] } };
}
function spawnInfo(entity) {
  return { v: 2, entityId: entity.id, occupantGeneration: entity.occupantGeneration,
    type: entity.type, alive: entity.alive, hull: entity.hull, radius: entity.radius,
    x: entity.pos.x, z: entity.pos.z, data: entity.data, vitals: entityVitalsOf(entity) };
}

for (const [name, codec] of [['browser JSON', null], ['node V8', SAB_V8_CODEC]]) {
  test(`Ward articulation and explicit cleared flags cross ${name} with scalar dirty detection`, () => {
    const wire = transport(codec), model = createReadModel(), cradle = hardware('cradle');
    applySpawnInfos(model, wire([spawnInfo(cradle)]));
    const row = model.entities.get(cradle.id), data = row.data, shadow = new Map();
    const state = { entityList: [cradle] };
    collectEntityVitals(state, shadow);
    assert.equal(collectEntityVitals(state, shadow).length, 0);
    for (const phase of ['approach', 'brace', 'connect', 'finish', 'retreat']) {
      Object.assign(cradle.data, { lanternWardPhase: phase, lanternWardProgress01: .5,
        lanternWardWorkerPresent: true, lanternWardClamp01: 1 });
      const changed = wire(collectEntityVitals(state, shadow));
      assert.equal(changed.length, 1, `${phase} changes must not be lost behind the spawn clone`);
      applyEntityVitals(model, changed);
      assert.equal(row.data, data, 'the renderer retains the same data object');
      const pose = lanternWardVisualPose(data);
      assert.equal(pose.phase, phase);
      assert.equal(pose.progress, .5);
      assert.equal(pose.worker, true);
      assert.equal(pose.clamp, 1);
      assert.equal(pose.contact, phase === 'connect' || phase === 'finish');
      assert.equal(collectEntityVitals(state, shadow).length, 0);
    }
    cradle.data.lanternWardProgress01 = .5001;
    assert.equal(collectEntityVitals(state, shadow).length, 0, 'subpixel progress does not force a packet');
    cradle.data.lanternWardProgress01 = .51;
    assert.equal(collectEntityVitals(state, shadow).length, 1, 'visible progress still publishes');
    Object.assign(cradle.data, { lanternWardPhase: 'finish', lanternWardLit: true, lanternWardRepaired: true });
    applyEntityVitals(model, wire(collectEntityVitals(state, shadow)));
    assert.equal(lanternWardVisualPose(data).lit, true);
    assert.equal(lanternWardVisualPose(data).shutter, 1);
    Object.assign(cradle.data, { lanternWardPhase: 'damaged', lanternWardLit: false,
      lanternWardWorkerPresent: false, lanternWardRepaired: false, lanternWardProgress01: 0,
      lanternWardClamp01: 0, lanternWardDamage01: .75 });
    applyEntityVitals(model, wire(collectEntityVitals(state, shadow)));
    const damaged = lanternWardVisualPose(data);
    assert.deepEqual([damaged.lit, damaged.worker, damaged.clamp, damaged.progress, damaged.shutter, damaged.damage],
      [false, false, 0, 0, 0, .75]);
    assert.equal(collectEntityVitals(state, shadow).length, 0);
  });
}

test('worker custody, delivery completion and commuter yield update without transporting authority', () => {
  const wire = transport(), model = createReadModel(), part = hardware('maintenance_part');
  const tender = actor('maintenance', 52), commuter = actor('commuter', 53), face = hardware('service_face', 42);
  const state = { entityList: [part, tender, commuter, face] }, shadow = new Map();
  applySpawnInfos(model, wire(state.entityList.map(spawnInfo)));
  collectEntityVitals(state, shadow);
  part.data.lanternWardCustody = { holder: 'maintenance', serial: part.data.lanternWardSerial,
    clamp: { attachmentId: 'private-native-line', active: true } };
  part.data.cargoManifest.custody = { holderId: IDS.maintenance };
  tender.data.lanternWardCarrying = IDS.maintenance_part;
  commuter.data.lanternWardYielding = true;
  const carried = wire(collectEntityVitals(state, shadow));
  assert.equal(JSON.stringify(carried).includes('private-native-line'), false);
  applyEntityVitals(model, carried);
  assert.equal(model.entities.get(part.id).data.lanternWardCustody.holder, 'maintenance');
  assert.equal(model.entities.get(part.id).data.lanternWardCustody.clamp, undefined);
  assert.equal(model.entities.get(tender.id).data.lanternWardCarrying, IDS.maintenance_part);
  assert.equal(model.entities.get(commuter.id).data.lanternWardYielding, true);
  part.data.lanternWardCustody.holder = 'service_face';
  part.data.cargoManifest.custody.holderId = IDS.service_face;
  tender.data.lanternWardCarrying = null;
  commuter.data.lanternWardYielding = false;
  face.data.lanternWardInstalledPartRecordId = IDS.maintenance_part;
  face.data.lanternWardRepaired = true;
  applyEntityVitals(model, wire(collectEntityVitals(state, shadow)));
  assert.equal(model.entities.get(part.id).data.lanternWardCustody.holder, 'service_face');
  assert.equal(model.entities.get(part.id).data.cargoManifest.custody.holderId, IDS.service_face);
  assert.equal(model.entities.get(tender.id).data.lanternWardCarrying, null);
  assert.equal(model.entities.get(commuter.id).data.lanternWardYielding, false);
  assert.equal(lanternWardVisualPose(model.entities.get(face.id).data).shutter, 1);
  assert.equal(collectEntityVitals(state, shadow).length, 0);
});

test('late recycled occupants, wrong records, partial frames and removed entities cannot inherit Ward visuals', () => {
  const wire = transport(), model = createReadModel(), lamp = hardware('lamp');
  applySpawnInfos(model, wire([spawnInfo(lamp)]));
  const oldRow = model.entities.get(lamp.id);
  lamp.data.lanternWardLit = true;
  const oldPacket = wire([[lamp.id, entityVitalsOf(lamp)]]);
  const replacement = hardware('lamp', lamp.id, lamp.occupantGeneration + 1);
  applySpawnInfos(model, wire([spawnInfo(replacement)]));
  const row = model.entities.get(lamp.id);
  assert.notEqual(row, oldRow);
  assert.equal(oldRow.alive, false);
  applyEntityVitals(model, oldPacket);
  assert.equal(row.data.lanternWardLit, false);
  replacement.data.lanternWardLit = true;
  const current = entityVitalsOf(replacement);
  for (const fields of [{ ...current, lanternWardRecordId: IDS.receiver },
    { ...current, lanternWardClamp01: -1 }, { lanternWardLife: replacement.occupantGeneration,
      lanternWardRecordId: IDS.lamp, lanternWardLit: true }]) {
    applyEntityVitals(model, wire([[replacement.id, fields]]));
    assert.equal(row.data.lanternWardLit, false);
  }
  const data = row.data;
  applyEntityVitals(model, wire([[replacement.id, current], [replacement.id, current]]));
  assert.equal(row.data, data);
  assert.equal(row.data.lanternWardLit, true, 'duplicate current receipts are idempotent');
  applyDestroyIds(model, [replacement.id]);
  applyEntityVitals(model, oldPacket);
  assert.equal(model.entities.has(replacement.id), false);
  const unrelated = { ...replacement, data: { ...replacement.data, lanternWardSerial: 'substitute' } };
  assert.equal(entityVitalsOf(unrelated).lanternWardLife, undefined);
});

test('bounded Ward domains keep Nessa Hail and saved causal history in step with the worker', () => {
  configureDomainMirroring({});
  const wire = transport(), differ = createDomainDiffer(), model = createReadModel(), tug = actor('tug');
  applySpawnInfos(model, wire([spawnInfo(tug)]));
  const ward = { version: 1, phase: 'blocked', blocked: true, history: {},
    objects: { cradle: { lost: false, nativeBinding: 'private-binding' } },
    firstCompletionReceipt: { authority: 'private-receipt' }, workS: 0 };
  const state = { npcJobs: { lanternWard: ward }, missions: { lanternWardConversation: { visits: 2 } },
    world: { currentSectorId: LANTERN_WARD_SECTOR }, entities: new Map([[tug.id, tug]]) };
  const main = { entities: model.entities, npcJobs: { localPresentation: true } };
  const domains = new Map([['npcJobs', main.npcJobs]]), touched = new Set();
  let tick = 0;
  function land() {
    const updates = [];
    for (let i = 0; i < 60; i++) updates.push(...wire(differ.diff(state, tick++).updates));
    for (const update of updates) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
      applyDomainPathUpdate(domains, { ...update, segs }, touched);
      main[segs[0]] = domains.get(segs[0]);
    }
    return updates;
  }
  const offer = source => lanternWardHailOffer(source, { targetId: tug.id, entity: source.entities.get(tug.id) }, 'request', 100);
  land();
  assert.deepEqual(offer(main), offer(state));
  assert.equal(main.npcJobs.localPresentation, true);
  assert.equal(main.npcJobs.lanternWard.firstCompletionReceipt, undefined);
  assert.equal(main.npcJobs.lanternWard.objects.cradle.nativeBinding, undefined);
  ward.workS = 3; ward.firstCompletionReceipt.authority = 'another-private-receipt';
  assert.equal(land().filter(update => update.segs.join('.') === 'npcJobs.lanternWard').length, 0);
  for (const [phase, history] of [['damaged', { damaged: true }],
    ['installed', { repaired: true, recovered: true, playerCarried: true }],
    ['missing', { cradleStolen: true, lampStolen: true }]]) {
    ward.phase = phase; ward.blocked = false; ward.history = history;
    land();
    assert.deepEqual(offer(main), offer(state), `${phase} Hail reads the authoritative saved facts`);
  }
  delete state.npcJobs.lanternWard;
  land();
  assert.equal(lanternWardDialogueFacts(main), null, 'a removed work journal leaves no stale remembered success');
});
