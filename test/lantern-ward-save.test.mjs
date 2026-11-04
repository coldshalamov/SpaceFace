import test from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATIONS } from '../src/save/migrations.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { lanternWardHardwareSpec, LANTERN_WARD_HARDWARE_ROLES, lanternWardCanonicalAnchor } from '../src/data/lanternWardHardware.js';
import { lanternWardActorSpec, LANTERN_WARD_ACTOR_ROLES } from '../src/world/lanternWardActors.js';
import { captureEntityRecord, normalizeRecord, spawnSpecFromRecord, entityIsDurableCandidate,
  serializeRecordsBag, normalizeRecordsBag } from '../src/world/worldRecords.js';

const migrate = MIGRATIONS.find(m => m.from === 22 && m.to === 23)?.fn;

test('legacy Continue starts unvisited Ward history without replacing existing jobs or memorial records', () => {
  assert.ok(CURRENT_VERSION >= 23);
  assert.equal(typeof migrate, 'function');
  const old = { npcJobs: { byId: { 'old-hauler': { sectorId: 'sector_sump' } } },
    missions: { completed: ['previous-story'] },
    world: { records: { byId: { 'canonical-memorial': { lit: 24, missing: 25 } } } } };
  const beforeWorld = structuredClone(old.world);
  migrate(old);
  assert.deepEqual(old.world, beforeWorld);
  assert.deepEqual(old.npcJobs.byId, { 'old-hauler': { sectorId: 'sector_sump' } });
  assert.equal(old.npcJobs.lanternWard, null);
  assert.equal(old.missions.lanternWardReward, null);
  assert.deepEqual(old.missions.completed, ['previous-story']);
  const once = structuredClone(old); migrate(old); assert.deepEqual(old, once);
});

test('migration never resurrects supplied Ward history and tolerates malformed old envelopes', () => {
  const ward = { missing: ['original-lamp'], paid: true };
  const data = { npcJobs: { byId: {}, lanternWard: ward }, missions: { lanternWardReward: { settled: true } } };
  const before = structuredClone(data); migrate(data); assert.deepEqual(data, before);
  for (const value of [null, undefined, [], 'old-save']) assert.doesNotThrow(() => migrate(value));
  const malformed = { npcJobs: [] }; migrate(malformed);
  assert.deepEqual(malformed.npcJobs, { byId: {}, lanternWard: null });
});

test('world owner captures every finite body with its actual pose, damage and custody', () => {
  const byId = {};
  for (const [i, role] of LANTERN_WARD_HARDWARE_ROLES.entries()) {
    const e = { id: 100 + i, ...lanternWardHardwareSpec(role) };
    e.pos.x += 17; e.pos.z -= 9; e.rot += 0.4; e.vel = { x: 1.2, z: -0.5 };
    e.hull -= 13; e.data.lanternWardDamage01 = 0.31;
    e.data.lanternWardCustody = { holder: 'loose', operation: 'interrupted',
      ...(role === 'lamp' ? { serial: 'venn-family-lamp:01' } : {}) };
    assert.equal(entityIsDurableCandidate(e, 1), true);
    const r = captureEntityRecord(e, { sectorId: 'sector_helios_prime', seed: 7401 });
    assert.equal(r.type, 'payload');
    assert.equal(r.kind, 'npc', 'finite hardware does not consume the ambient convoy ledger');
    assert.equal(r.retentionClass, 'permanent');
    byId[r.recordId] = r;
  }
  const saved = serializeRecordsBag(normalizeRecordsBag({ byId }));
  const restored = normalizeRecordsBag(JSON.parse(JSON.stringify(saved)));
  for (const [id, r] of Object.entries(restored.byId)) {
    const e = spawnSpecFromRecord(r);
    assert.ok(e, id); assert.equal(e.data.worldRecordId, id);
    assert.deepEqual(e.pos, byId[id].pos); assert.deepEqual(e.vel, byId[id].vel);
    assert.equal(e.hull, byId[id].hull); assert.equal(e.data.lanternWardDamage01, 0.31);
    assert.deepEqual(e.data.lanternWardCustody, byId[id].itinerary.lanternWard.custody);
  }
});

test('dead, substituted and malformed lamp records cannot fall through to a generic ship', () => {
  const good = captureEntityRecord({ id: 101, ...lanternWardHardwareSpec('lamp') }, { sectorId: 'sector_helios_prime' });
  for (const mutate of [
    r => { r.alive = false; r.hull = 0; r.outcome = 'destroyed'; },
    r => { r.type = 'ship'; },
    r => { r.itinerary.lanternWard.serial = 'some-other-family'; },
    r => { r.itinerary.lanternWard.role = 'cradle'; },
    r => { r.sectorId = 'sector_ceres_belt'; },
    r => { delete r.vel; },
    r => { r.rot = null; },
  ]) {
    const broken = JSON.parse(JSON.stringify(good)); mutate(broken);
    assert.equal(spawnSpecFromRecord(broken), null);
    const normalized = normalizeRecord(broken);
    assert.ok(normalized, 'the unavailable identity stays in the ledger');
    assert.equal(spawnSpecFromRecord(normalized), null, 'normalization cannot heal an invalid workpiece');
  }
});

test('Continue preserves all three crew hulls, work identities, damage and an emptied hold', () => {
  for (const [index, role] of LANTERN_WARD_ACTOR_ROLES.entries()) {
    const original = { id: 200 + index, alive: true, ...lanternWardActorSpec(role, lanternWardCanonicalAnchor()) };
    original.vel = { x: 1.25, z: -0.75 }; original.rot = 0.7; original.angVel = 0;
    original.hull -= 17;
    if (role === 'maintenance') original.data.cargoManifest = {
      manifestId: 'lantern-ward:shutter-bearing:01', lines: [], totalQty: 0,
      custody: { holderId: 'lantern-ward:service_face' },
    };
    const record = captureEntityRecord(original, { sectorId: 'sector_helios_prime' });
    const loaded = normalizeRecordsBag(JSON.parse(JSON.stringify(serializeRecordsBag({ byId: { [record.recordId]: record } }))));
    const restored = spawnSpecFromRecord(loaded.byId[record.recordId]);
    assert.ok(restored, role);
    for (const key of ['radius', 'mass', 'thrust', 'hull', 'hullMax']) assert.equal(restored[key], original[key], `${role} ${key}`);
    for (const key of ['lanternWardActor', 'lanternWardId', 'worldRecordId', 'lawWitness', 'occupationalCraft', 'name']) {
      assert.equal(restored.data[key], original.data[key], `${role} ${key}`);
    }
    assert.deepEqual(restored.vel, original.vel);
    assert.deepEqual(restored.data.cargoManifest, original.data.cargoManifest ?? null);
    assert.deepEqual(restored.collisionProxy, original.collisionProxy);
    for (const mutate of [r => { r.shipDefId = 'ship_kestrel'; }, r => { delete r.pos; },
      r => { r.itinerary.lanternWard.role = 'stranger'; }, r => { r.type = 'payload'; }]) {
      const broken = structuredClone(record); mutate(broken);
      assert.equal(spawnSpecFromRecord(broken), null);
      assert.equal(spawnSpecFromRecord(normalizeRecord(broken)), null);
    }
  }
});
