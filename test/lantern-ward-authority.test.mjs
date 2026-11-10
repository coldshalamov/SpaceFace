import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { makeEntity } from '../src/core/entity.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { world } from '../src/systems/world.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import {
  LANTERN_WARD_RECORD_IDS as IDS, LANTERN_WARD_LAMP_SERIAL as LAMP,
  LANTERN_WARD_PART_SERIAL as PART, LANTERN_WARD_HARDWARE_ROLES,
  lanternWardHardwareSpec, lanternWardHardwareRoleForRecord, lanternWardRecordHasCustody,
  captureLanternWardHardware, isLanternWardWorkpieceEligible, lanternWardCanonicalAnchor,
} from '../src/data/lanternWardHardware.js';
import { lanternWardActorSpec } from '../src/world/lanternWardActors.js';
import {
  captureEntityRecord, normalizeRecord, normalizeRecordsBag, serializeRecordsBag, spawnSpecFromRecord, recordShouldRematerialize,
} from '../src/world/worldRecords.js';
import {
  restoreLanternWard, serializeLanternWard, lanternWardStatus, lanternWardCompletionReceipt,
} from '../src/systems/lanternWardWork.js';

const SECTOR = 'sector_helios_prime', CONTROL = 'lantern_ward_attended_work';
const entity = role => ({ id: 100, occupantGeneration: 1, ...lanternWardHardwareSpec(role) });
const record = e => captureEntityRecord(e, { sectorId: SECTOR, tick: 10, simTime: 1 / 6 });
const serial = role => role === 'lamp' ? LAMP : PART;
const holderId = holder => holder === 'source' ? 'lantern-ward:maintenance-source' : IDS[holder] || holder;
function setPieceCustody(e, holder, withClamp = !['source', 'loose', 'player'].includes(holder)) {
  const role = e.data.lanternWardRole;
  e.data.lanternWardCustody = { holder, serial: serial(role), ...(withClamp ? { clamp: {
    active: true, attachmentId: `accepted:${role}:${holder}`, ownerRecordId: IDS[holder], targetRecordId: IDS[role],
    defId: holder === 'maintenance' ? 'tether_standard' : 'attachment_transport_clamp', controlMode: CONTROL,
  } } : {}) };
  e.data.cargoManifest.custody = { holderId: holderId(holder) };
}

test('complete live admission and record restoration accept every original and coherent custody phase', () => {
  for (const role of LANTERN_WARD_HARDWARE_ROLES) {
    const e = entity(role), r = record(e);
    assert.equal(lanternWardHardwareRoleForRecord(r), role);
    assert.ok(spawnSpecFromRecord(r), role);
  }
  for (const [role, holders] of [
    ['lamp', ['cradle', 'receiver', 'loose', 'player']],
    ['maintenance_part', ['source', 'maintenance', 'service_face', 'loose', 'player']],
  ]) {
    for (const holder of holders) {
      const e = entity(role); setPieceCustody(e, holder);
      assert.equal(isLanternWardWorkpieceEligible(e), true, `${role}/${holder} live`);
      const r = record(e), restored = spawnSpecFromRecord(normalizeRecord(r));
      assert.ok(restored, `${role}/${holder} restore`);
      assert.deepEqual(restored.data.cargoManifest, e.data.cargoManifest);
      assert.deepEqual(restored.data.lanternWardCustody, e.data.lanternWardCustody);
      assert.equal(lanternWardRecordHasCustody(r), !!e.data.lanternWardCustody.clamp, `${role}/${holder} catch-up`);
    }
  }
  assert.equal(isLanternWardWorkpieceEligible(entity('lamp')), true, 'fresh cradle seat may precede its first clamp');
  assert.equal(lanternWardRecordHasCustody(record(entity('lamp'))), false, 'an unproven initial seat does not freeze a body');
});

const manifestMutations = [
  ['manifest identity', e => { e.data.cargoManifest.manifestId = 'counterfeit'; }],
  ['lot identity', e => { e.data.cargoManifest.lotId = 'other-family:01'; }],
  ['destination', e => { e.data.cargoManifest.destinationId = 'other-receiver'; }],
  ['commodity', e => { e.data.cargoManifest.lines[0].commodityId = 'cmdty_ore'; }],
  ['line quantity', e => { e.data.cargoManifest.lines[0].qty = 2; }],
  ['total quantity', e => { e.data.cargoManifest.totalQty = 2; }],
  ['extra unit', e => { e.data.cargoManifest.lines.push({ commodityId: 'cmdty_electronics', qty: 1 }); }],
  ['manifest holder', e => { e.data.cargoManifest.custody.holderId = 'player'; }],
  ['custody serial', e => { e.data.lanternWardCustody.serial = 'other-serial'; }],
  ['custody role', e => { e.data.lanternWardCustody.holder = 'ward'; }],
  ['recipe serial', e => { e.data.itinerary.lanternWard.serial = 'other-serial'; }],
  ['physical original', e => { e.data.physicalCustodyOnly = false; }],
  ['canonical hull maximum', e => { e.hullMax = 900; e.hull = 91; }],
  ['nonfinite motion', e => { e.vel.x = NaN; }],
];

test('each live manifest and custody substitution fails independently and cannot heal through save normalization', () => {
  for (const role of ['lamp', 'maintenance_part']) for (const [label, mutate] of manifestMutations) {
    const e = entity(role); mutate(e);
    assert.equal(isLanternWardWorkpieceEligible(e), false, `${role}: ${label}`);
    assert.ok(captureLanternWardHardware(e), `${role}: ${label} still records original identity`);
    const r = record(e);
    assert.equal(r.recordId, IDS[role]);
    assert.equal(spawnSpecFromRecord(r), null, `${role}: ${label} raw restore`);
    const normalized = normalizeRecord(r);
    assert.equal(normalized.extra.lanternWardInvalid, true, `${role}: ${label} unavailable marker`);
    assert.equal(spawnSpecFromRecord(normalized), null, `${role}: ${label} normalized restore`);
  }
});

test('clamp custody rejects empty IDs, wrong owners, mismatched roles and contradictory cradle loads', () => {
  const edits = [
    ['empty attachment', c => { c.clamp.attachmentId = ''; }],
    ['whitespace attachment', c => { c.clamp.attachmentId = '   '; }],
    ['inactive clamp', c => { c.clamp.active = false; }],
    ['wrong owner', c => { c.clamp.ownerRecordId = IDS.obstruction; }],
    ['wrong target', c => { c.clamp.targetRecordId = IDS.cradle; }],
    ['wrong definition', c => { c.clamp.defId = 'tether_standard'; }],
    ['wrong control mode', c => { c.clamp.controlMode = 'player'; }],
    ['loose body with clamp', c => { c.holder = 'loose'; }],
  ];
  for (const role of ['lamp', 'maintenance_part']) for (const [label, mutate] of edits) {
    const e = entity(role); setPieceCustody(e, role === 'lamp' ? 'receiver' : 'service_face');
    mutate(e.data.lanternWardCustody);
    e.data.cargoManifest.custody.holderId = holderId(e.data.lanternWardCustody.holder);
    assert.equal(isLanternWardWorkpieceEligible(e), false, `${role}: ${label}`);
    assert.equal(lanternWardRecordHasCustody(record(e)), false, `${role}: ${label} does not freeze catch-up`);
    assert.equal(spawnSpecFromRecord(record(e)), null, `${role}: ${label} does not rematerialize`);
  }
  const cradle = entity('cradle');
  cradle.data.lanternWardCustody = { holder: 'player', loadSerial: LAMP, clamp: {
    active: true, attachmentId: 'actual-load', ownerRecordId: IDS.cradle, targetRecordId: IDS.lamp,
  } };
  assert.equal(lanternWardRecordHasCustody(record(cradle)), true, 'stolen platform retains the actual clamped load');
  for (const mutate of [c => { c.loadSerial = 'other-lamp'; }, c => { c.holder = 'receiver'; },
    c => { delete c.loadSerial; }, c => { delete c.clamp; }, c => { c.clamp.ownerRecordId = IDS.receiver; }]) {
    const changed = structuredClone(cradle); mutate(changed.data.lanternWardCustody);
    assert.equal(lanternWardRecordHasCustody(record(changed)), false);
    assert.equal(spawnSpecFromRecord(record(changed)), null);
  }
});

test('stolen movable originals survive a canonical sector crossing without changing their Helios provenance', () => {
  const remote = 'sector_ceres_belt';
  for (const role of ['cradle', 'lamp', 'obstruction', 'maintenance_part']) {
    const e = entity(role);
    e.pos = { x: 7000, z: 2500 }; e.vel = { x: 1.5, z: -.25 }; e.hull -= 9;
    e.data.sectorId = remote;
    if (role === 'lamp' || role === 'maintenance_part') setPieceCustody(e, 'player');
    if (role === 'cradle') e.data.lanternWardCustody = { holder: 'player' };
    const traveled = captureEntityRecord(e, { sectorId: remote, tick: 50, simTime: 5 });
    assert.equal(traveled.sectorId, remote);
    assert.equal(traveled.homeSectorId, SECTOR);
    assert.equal(lanternWardHardwareRoleForRecord(traveled), role);
    const saved = JSON.parse(JSON.stringify(serializeRecordsBag({ byId: { [IDS[role]]: traveled } })));
    const remembered = normalizeRecordsBag(saved).byId[IDS[role]], restored = spawnSpecFromRecord(remembered);
    assert.ok(restored, `${role}: traveled original survives Continue`);
    assert.equal(restored.data.worldRecordId, IDS[role]);
    assert.equal(restored.homeSectorId, SECTOR); assert.equal(restored.data.homeSectorId, SECTOR);
    assert.equal(restored.data.sectorId, remote);
    assert.equal(restored.hull, e.hull);
    assert.deepEqual(restored.pos, e.pos); assert.deepEqual(restored.vel, e.vel);
    assert.deepEqual(restored.data.lanternWardCustody, e.data.lanternWardCustody);
    assert.deepEqual(restored.data.cargoManifest, e.data.cargoManifest);
    for (const mutate of [r => { r.homeSectorId = remote; }, r => { r.sectorId = 'sector_nonexistent'; }]) {
      const forged = structuredClone(traveled); mutate(forged);
      assert.equal(spawnSpecFromRecord(forged), null, `${role}: wrong provenance is still refused`);
    }
  }
  const loaded = entity('cradle'), lamp = entity('lamp');
  setPieceCustody(lamp, 'cradle');
  loaded.data.lanternWardCustody = { holder: 'player', loadSerial: LAMP,
    clamp: structuredClone(lamp.data.lanternWardCustody.clamp) };
  for (const e of [loaded, lamp]) {
    const traveled = captureEntityRecord(e, { sectorId: remote });
    assert.ok(spawnSpecFromRecord(traveled), 'a stolen loaded pair preserves its real internal clamp');
    assert.equal(lanternWardRecordHasCustody(traveled), true);
  }
  for (const role of ['receiver', 'service_face']) {
    assert.equal(spawnSpecFromRecord(captureEntityRecord(entity(role), { sectorId: remote })), null,
      `${role}: a fixed civic receiver cannot acquire a foreign-sector identity`);
  }
  for (const [role, holder] of [['lamp', 'receiver'], ['maintenance_part', 'service_face']]) {
    const e = entity(role); setPieceCustody(e, holder);
    assert.equal(spawnSpecFromRecord(captureEntityRecord(e, { sectorId: remote })), null,
      `${role}: a foreign body cannot claim the fixed Helios socket`);
  }
});

test('actor catch-up custody uses finite living original hull, pose, recipe and accepted work lease', () => {
  for (const role of ['tug', 'commuter', 'maintenance']) {
    const e = makeEntity(lanternWardActorSpec(role, lanternWardCanonicalAnchor()));
    e.id = 200; e.occupantGeneration = 1;
    e.data.jobId = `job:${IDS[role]}`; e.data.itinerary.lanternWard.workLease = CONTROL;
    const good = record(e);
    assert.equal(lanternWardRecordHasCustody(good), true, role);
    for (const mutate of [r => { r.extra.lanternWardInvalid = true; }, r => { r.pos.x = NaN; },
      r => { r.vel.z = Infinity; }, r => { r.hull = 0; }, r => { r.hull = r.hullMax + 1; },
      r => { r.hullMax = 0; }, r => { r.outcome = 'destroyed'; }, r => { r.playerOwned = true; },
      r => { r.shipDefId = 'ship_kestrel'; }, r => { r.homeSectorId = 'sector_sump'; },
      r => { delete r.itinerary.lanternWard.workLease; }]) {
      const broken = structuredClone(good); mutate(broken);
      assert.equal(lanternWardRecordHasCustody(broken), false, role);
    }
  }
});

test('malformed Ward pose and null ledger values retain permanent unavailable identities across repeated normalization', () => {
  for (const role of ['lamp', 'cradle', 'maintenance_part']) {
    const good = record(entity(role));
    for (const mutate of [r => { delete r.pos; }, r => { r.pos = { x: 1710 }; },
      r => { r.pos.x = NaN; }, r => { r.pos.z = Infinity; }, r => { delete r.kind; },
      r => { delete r.sectorId; delete r.homeSectorId; }, r => { r.recordId = 'substituted-record'; }]) {
      const broken = structuredClone(good); mutate(broken);
      let bag = normalizeRecordsBag({ byId: { [IDS[role]]: broken } });
      for (let pass = 0; pass < 3; pass++) {
        const remembered = bag.byId[IDS[role]];
        assert.ok(remembered, `${role}: missing pose is not missing identity`);
        assert.equal(remembered.extra.lanternWardInvalid, true);
        assert.equal(remembered.retentionClass, 'permanent');
        assert.equal(spawnSpecFromRecord(remembered), null);
        bag = normalizeRecordsBag(JSON.parse(JSON.stringify(serializeRecordsBag(bag))));
      }
    }
    for (const broken of [null, [], 0, 'corrupt']) {
      const bag = normalizeRecordsBag({ byId: { [IDS[role]]: broken } });
      assert.equal(bag.byId[IDS[role]]?.extra.lanternWardInvalid, true);
      assert.equal(spawnSpecFromRecord(bag.byId[IDS[role]]), null);
    }
  }
  assert.equal(normalizeRecord({ recordId: 'generic-npc', kind: 'npc', sectorId: SECTOR, pos: null }), null,
    'the Ward-specific unavailable marker does not change unrelated record normalization');
});

test('malformed Ward hardware and actors cannot reach the generic enemy rematerialization shortcut', () => {
  const originals = LANTERN_WARD_HARDWARE_ROLES.map(role => record(entity(role)));
  for (const role of ['tug', 'commuter', 'maintenance']) {
    originals.push(record(makeEntity(lanternWardActorSpec(role, lanternWardCanonicalAnchor()))));
  }
  for (const original of originals) {
    assert.equal(recordShouldRematerialize(original, 'FULL'), true, original.recordId);
    const poisoned = structuredClone(original); poisoned.enemyTypeId = 'corsair_raider';
    assert.equal(recordShouldRematerialize(poisoned, 'FULL'), false, `${original.recordId}: raw enemy shortcut refused`);
    const normalized = normalizeRecord(poisoned);
    assert.equal(normalized.extra.lanternWardInvalid, true);
    assert.equal(recordShouldRematerialize(normalized, 'FULL'), false);
    assert.equal(spawnSpecFromRecord(normalized), null);
    const state = createGameState(8413); state.world.currentSectorId = SECTOR;
    state.world.records = normalizeRecordsBag({ byId: { [original.recordId]: poisoned } });
    let spawnCalls = 0;
    const owner = { state, _spawnFromDurableRecord() { spawnCalls++; return null; } };
    const steps = world._rematerializeSectorRecordsChunks.call(owner, SECTOR, { enemies: [] }, 'FULL',
      { restoreDurableRecords: true });
    for (const _ of steps) { /* Execute the production owner admission loop. */ }
    assert.equal(spawnCalls, 0, `${original.recordId}: no generic/native spawn dispatch`);
  }
  const unrelated = { ...structuredClone(originals[0]), recordId: 'ambient:enemy-control',
    enemyTypeId: 'corsair_raider', itinerary: null, extra: { lanternWardInvalid: true } };
  assert.equal(recordShouldRematerialize(unrelated, 'FULL'), true, 'Ward-only marker does not redefine unrelated enemy admission');
});

async function nativeHarness({ seed = 8411, records = null, wardState } = {}) {
  const state = createGameState(seed); state.mode = 'flight'; state.world.currentSectorId = SECTOR;
  if (records) state.world.records = normalizeRecordsBag(records);
  const recordOwner = { name: 'world', init(ctx) { this.state = ctx.state; }, upsertWorldRecord: world.upsertWorldRecord };
  const modules = { flightSlot: flightV3, physics, combat, npcJobsRuntime, spawnBudget, world: recordOwner };
  const sim = createSimulation({ state, seed,
    systems: PRODUCTION_INIT_ORDER.filter(id => modules[id]).map(id => modules[id]),
    updateOrder: PRODUCTION_UPDATE_ORDER.filter(id => modules[id]).map(id => modules[id]),
  });
  const player = sim.spawn({ type: 'ship', team: 0, alive: true, isPlayer: true,
    pos: { x: 1590, z: -520 }, vel: { x: 0, z: 0 }, radius: 12, mass: 100,
    hull: 100, hullMax: 100, flags: { persistent: true }, data: {} });
  state.playerId = player.id;
  await sim.registry.get('physics').prepareBackend(state);
  const owner = sim.registry.get('npcJobsRuntime');
  if (wardState !== undefined) restoreLanternWard(owner, wardState);
  const events = []; sim.bus.on('lanternWard:serviceCommitted', e => events.push(e));
  const actor = role => state.entityList.find(e => e.alive && e.data?.worldRecordId === IDS[role]);
  const run = n => { for (let i = 0; i < n; i++) sim.step(); };
  run(10);
  return { sim, state, owner, events, actor, run };
}

test('real spawn reconciliation never remints a malformed original with valid, absent or legacy Ward state', async () => {
  const first = await nativeHarness();
  const validState = serializeLanternWard(first.owner), original = record(first.actor('lamp'));
  first.sim.dispose();
  for (const [name, wardState, mutate] of [
    ['remembered state', validState, r => { delete r.pos; return r; }],
    ['absent legacy state', null, r => { r.pos.x = NaN; return r; }],
    ['malformed state', { version: 0 }, () => null],
  ]) {
    const bad = mutate(structuredClone(original));
    let stored = { byId: { [IDS.lamp]: bad } }, history = wardState;
    for (let visit = 0; visit < 2; visit++) {
      const h = await nativeHarness({ records: stored, wardState: history });
      try {
        h.run(60);
        assert.equal(h.actor('lamp'), undefined, `${name}: no original minted on visit ${visit}`);
        assert.equal(h.events.length, 0);
        h.state.world.currentSectorId = 'sector_sump'; h.run(2);
        h.state.world.currentSectorId = SECTOR; h.run(60);
        assert.equal(h.actor('lamp'), undefined, `${name}: no original minted on sector return`);
        assert.equal(lanternWardStatus(h.owner).installed, false);
        assert.equal(lanternWardCompletionReceipt(h.owner, 'lantern-ward:venn-family-lamp:service:01'), null);
        stored = JSON.parse(JSON.stringify(serializeRecordsBag(h.state.world.records)));
        history = serializeLanternWard(h.owner);
        assert.equal(stored.byId[IDS.lamp].extra.lanternWardInvalid, true);
      } finally { h.sim.dispose(); }
    }
  }
});

test('live work and receipt authority reject independent manifest substitutions on the actual native original', async () => {
  const h = await nativeHarness({ seed: 8412 });
  try {
    const mast = h.actor('obstruction');
    queuePhysicsImpulse(mast, { x: mast.mass * 20, z: mast.mass * 6 }, { tick: h.state.tick, tag: 'authority_fixture_impulse' });
    for (let i = 0; i < 15000 && lanternWardStatus(h.owner).phase !== 'connect'; i++) h.sim.step();
    assert.equal(lanternWardStatus(h.owner).phase, 'connect', 'the original is physically seated and attended first');
    const lamp = h.actor('lamp');
    for (const [label, mutate] of manifestMutations.slice(0, 10)) {
      const before = structuredClone(lamp.data); mutate(lamp); h.run(2);
      assert.equal(h.events.length, 0, `${label}: no committed service`);
      assert.equal(serializeLanternWard(h.owner).workS, 0, `${label}: no attended progress`);
      assert.equal(lanternWardCompletionReceipt(h.owner, 'lantern-ward:venn-family-lamp:service:01'), null);
      lamp.data = before;
    }
    const service = h.sim.registry.get('combat').kernel.attachments, receiver = h.actor('receiver');
    for (const [label, defId, controlMode] of [
      ['wrong definition', 'tether_standard', CONTROL],
      ['wrong control mode', 'attachment_transport_clamp', 'foreign_work'],
    ]) {
      for (let i = 0; i < 600 && lanternWardStatus(h.owner).phase !== 'connect'; i++) h.sim.step();
      const authentic = service.listForEntity(lamp.id).find(a => a.state === 'active'
        && a.ownerId === receiver.id && a.targetId === lamp.id && a.controlMode === CONTROL
        && a.defId === 'attachment_transport_clamp');
      assert.ok(authentic, `${label}: authentic original clamp exists first`);
      service.breakAttachment(authentic, 'authority_fixture_release', null);
      const request = { defId, controlMode, ownerId: receiver.id, targetId: lamp.id,
        sourceWorld: { x: receiver.pos.x + 2, y: 0, z: receiver.pos.z },
        targetWorld: { ...lamp.pos, y: 0 } };
      let wrong = service.create(request);
      if (!wrong.ok && defId === 'tether_standard') {
        assert.equal(wrong.reason, 'source_socket_unavailable', 'ordinary receiver hardware refuses a tether source');
        // An ordinary request is already refused upstream. Also exercise a
        // corrupted/restored descriptor on a genuinely accepted native clamp,
        // because the job may never trust that descriptor without rechecking it.
        wrong = service.create({ ...request, defId: 'attachment_transport_clamp' });
        assert.equal(wrong.ok, true);
        wrong.attachment.defId = defId;
      }
      assert.equal(wrong.ok, true, `${label}: negative candidate has a real native attachment`);
      const attachmentPort = h.owner._combatAttachments;
      // Deny a replacement native clamp so the wrong-profile attachment is the
      // only candidate. Rejection here is intentional authority fault injection,
      // not a claim that the normal job cannot create a fresh legitimate clamp.
      const deniedPort = { ...service, create(request) {
        return request.targetId === lamp.id && request.defId === 'attachment_transport_clamp'
          && request.controlMode === CONTROL ? { ok: false, reason: 'fixture_native_capture_denied' }
          : service.create(request);
      } };
      h.owner._combatAttachments = () => deniedPort;
      try {
        h.run(4);
        assert.equal(serializeLanternWard(h.owner).workS, 0, `${label}: no work through wrong link`);
        assert.equal(h.events.length, 0, `${label}: no service through wrong link`);
        assert.equal(lanternWardCompletionReceipt(h.owner, 'lantern-ward:venn-family-lamp:service:01'), null);
      } finally {
        h.owner._combatAttachments = attachmentPort;
        if (wrong.attachment.state === 'active') service.breakAttachment(wrong.attachment, 'authority_fixture_removed', null);
      }
    }
    for (let i = 0; i < 3000 && !h.events.length; i++) h.sim.step();
    assert.equal(h.events.length, 1, 'restored legitimate original can finish once');
    const receiptId = h.events[0].receiptId;
    assert.ok(lanternWardCompletionReceipt(h.owner, receiptId));
    for (const [label, mutate] of manifestMutations.slice(0, 10)) {
      const before = structuredClone(lamp.data); mutate(lamp);
      assert.equal(lanternWardCompletionReceipt(h.owner, receiptId), null, `${label}: minted receipt refuses changed workpiece`);
      lamp.data = before;
    }
    assert.equal(h.events.length, 1);
  } finally { h.sim.dispose(); }
});
