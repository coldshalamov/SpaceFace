import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { serializeAlienEcologyState, deserializeAlienEcologyState } from '../src/systems/alienEcology.js';
import { BOLUS_SECTOR_ID as SID, BOLUS_RIB_STATE as KEY, readBolusRibState, migrateBolusRibState, planBolusLayout } from '../src/data/theBolus.js';
import { materializeBolus, captureBolusRib, tickBolus } from '../src/systems/theBolus.js';

const origin = { x: 120000, z: -47000 };
const ribs = state => state.entityList.filter(e => e.alive && e.data?.bolus?.key === 'bolus_rib');
function fixture(flags = {}) {
  const sim = createSimulation({ seed: 71, systems: [] }), s = sim.state;
  s.settings.gameplay.physicsBackend = 'legacy'; s.mode = 'flight'; s.world.currentSectorId = SID;
  Object.assign(ensureAlienEcologyState(s).sectorFlags, flags);
  const physics = {};
  const world = { state: s, bus: sim.bus, helpers: { spawnEntity: spec => sim.spawn(spec) },
    registry: { get: key => key === 'physics' ? physics : null },
    _toGlobal: p => ({ x: p.x + origin.x, z: p.z + origin.z }), _sectorOrigin: () => origin };
  const materialize = () => materializeBolus(world, { id: SID }, { dressing: [] });
  materialize();
  s.entityIndex.ready = false; // This isolated fixture has no world membership-index owner.
  return { sim, s, world, physics, materialize, rib: () => ribs(s)[0], flags: () => ensureAlienEcologyState(s).sectorFlags,
    close: () => { physics._sg02?.dispose(); sim.dispose(); } };
}
const near = (actual, expected, tolerance = 1e-5) => assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('fresh cast, exact geometry, migration provenance and corrupt quarantine', () => {
  const h = fixture(); try {
    assert.equal(h.s.entityList.length, planBolusLayout(71).length);
    assert.equal(ribs(h.s).length, 1); near(h.rib().pos.x - origin.x, -20); near(h.rib().pos.z - origin.z, -460);
    assert.equal(h.rib().radius, 16); assert.equal(h.rib().mass, 200); assert.equal(h.rib().hull, 48);
    h.materialize(); assert.equal(ribs(h.s).length, 1, 'no duplicate original on repeated materialization');
  } finally { h.close(); }
  const old = fixture({ 'bolus:ribLodged': true }); try {
    assert.equal(old.flags()[KEY].source, 'legacy-lodged'); near(old.rib().pos.x - origin.x, 2347);
    near(old.rib().pos.z - origin.z, 1173); assert.equal(old.flags()['bolus:ribLodged'], true);
  } finally { old.close(); }
  for (const bad of [{ version: 2 }, { version: 1, key: 'foreign', status: 'lost' }, { version: 1, key: 'bolus_rib', status: 'present', x: Infinity }]) {
    const h = fixture({ [KEY]: bad, 'bolus:ribLodged': true }); try { assert.equal(ribs(h.s).length, 0); assert.equal(readBolusRibState(h.flags()), null); } finally { h.close(); }
  }
});

test('validated finite bounded rows survive the real ecology serializer; New Game flags are fresh', () => {
  const flags = { 'bolus:ribLodged': true }; migrateBolusRibState(flags);
  const h = fixture(flags); try {
    for (const [key, value] of [['x', NaN], ['vx', Infinity], ['spin', 1e9], ['hull', -1]]) {
      assert.equal(readBolusRibState({ [KEY]: { ...flags[KEY], [key]: value } }), null);
    }
    const saved = serializeAlienEcologyState(h.s);
    const fresh = createSimulation({ seed: 71, systems: [] }); try {
      assert.equal(ensureAlienEcologyState(fresh.state).sectorFlags[KEY], undefined);
      deserializeAlienEcologyState(fresh.state, saved); assert.deepEqual(ensureAlienEcologyState(fresh.state).sectorFlags[KEY], flags[KEY]);
    } finally { fresh.dispose(); }
  } finally { h.close(); }
});

test('real native Massline moves the original; capture ignores scalar edits and preserves native motion', async () => {
  const h = fixture(); try {
    const rib = h.rib(), s = h.s;
    // Source/materialization fixture, not ordinary gate flight or a camera witness.
    const tug = h.sim.spawn({ type: 'ship', hull: 100, mass: 1000, radius: 10,
      pos: { x: rib.pos.x + 150, z: rib.pos.z }, vel: { x: 0, z: 0 }, collides: true,
      physicsBody: { dynamic: true, mass: 1000, radius: 10, shape: 'ball' } });
    const n = h.physics._sg02 = await createSg02DynamicBodyOwner({ frameOrigin: origin });
    s.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const step = () => { s.tick++; n.syncFromEntities([rib, tug]); n.step(1 / 60, s.tick); };
    step();
    assert(n.createAttachment({ attachmentId: 'bolus-test-line', defId: 'attachment_massline', ownerId: tug.id, targetId: rib.id,
      sourceWorld: { ...tug.pos }, targetWorld: { ...rib.pos }, restLength: 100, tick: s.tick }));
    const start = rib.pos.x, beforePose = { x: rib.pos.x - origin.x, z: rib.pos.z - origin.z, rot: rib.rot };
    for (let i = 0; i < 90; i++) { queuePhysicsImpulse(tug, { x: 100, y: 0, z: 0 }); step(); }
    assert(rib.pos.x > start + 1, 'actual native rope moved the original rib');
    assert(captureBolusRib(h.world));
    const row = { ...h.flags()[KEY] }; assert.equal(row.source, 'native');
    const rec = n.records.get(rib.id), p = rec.body.translation(), v = rec.body.linvel();
    near(row.x, p.x); near(row.z, p.z); near(row.vx, v.x); near(row.vz, v.z);
    rib.pos.x += 500; rib.vel.x += 500;
    assert(captureBolusRib(h.world)); assert.deepEqual(h.flags()[KEY], row, 'live native observation, not scalar compatibility');
    const saved = serializeAlienEcologyState(s), returned = fixture(saved.sectorFlags);
    try { assert.equal(ribs(returned.s).length, 1); near(returned.rib().pos.x - origin.x, row.x); near(returned.rib().vel.x, row.vx);
      console.log(JSON.stringify({ kind: 'bolus-native-tether-pose-trace', witness: 'isolated native solver and original materialization, not live camera',
        solvedTetherTicks: 90, before: beforePose, moved: { x: row.x, z: row.z, rot: row.rot },
        returned: { x: returned.rib().pos.x - origin.x, z: returned.rib().pos.z - origin.z, rot: returned.rib().rot } }));
    }
    finally { returned.close(); }
    const originalSpec = rib.physicsBody;
    for (const changed of [{ dynamic: false }, { shape: 'capsule' }, { mass: 201 }, { radius: 17 }]) {
      rib.physicsBody = { ...originalSpec, ...changed };
      assert.equal(captureBolusRib(h.world), false, 'same revision cannot certify a changed body contract');
      assert.deepEqual(h.flags()[KEY], row);
    }
    rib.physicsBody = originalSpec;
    const setters = ['setTranslation', 'setRotation', 'setLinvel', 'setAngvel'];
    const originals = setters.map(key => rec.body[key]);
    setters.forEach(key => { rec.body[key] = () => { throw new Error('capture attempted live native mutation'); }; });
    try { assert(captureBolusRib(h.world)); } finally { setters.forEach((key, i) => { rec.body[key] = originals[i]; }); }
    for (const mutate of [
      () => { rec.revision++; }, () => { rec.proxyId = 'foreign'; },
      () => { rec._postStepReadTick--; }, () => { n._simTick = s.tick - 3; },
      () => { h.physics._nativeRestorePending = true; }, () => { rib.occupantGeneration++; },
      () => { s.entities.set(rib.id, { ...rib }); },
    ]) {
      const restore = { revision: rec.revision, proxy: rec.proxyId, post: rec._postStepReadTick, tick: n._simTick, life: rib.occupantGeneration };
      mutate(); assert.equal(captureBolusRib(h.world), false); assert.deepEqual(h.flags()[KEY], row);
      rec.revision = restore.revision; rec.proxyId = restore.proxy; rec._postStepReadTick = restore.post; n._simTick = restore.tick;
      h.physics._nativeRestorePending = false; rib.occupantGeneration = restore.life; s.entities.set(rib.id, rib);
    }
  } finally { h.close(); }
});

test('unknown absence and recycled IDs never prove loss or mint a replacement', () => {
  const h = fixture(); try {
    const rib = h.rib(); assert(captureBolusRib(h.world)); const row = { ...h.flags()[KEY] };
    h.s.entities.delete(rib.id); rib.alive = false; h.materialize(); assert.equal(ribs(h.s).length, 0);
    assert.deepEqual(h.flags()[KEY], row);
    h.sim.bus.emit('entity:destroyed', { id: rib.id, entity: { ...rib, hull: 0 } }); assert.deepEqual(h.flags()[KEY], row);
    rib.hull = 0; h.sim.bus.emit('entity:destroyed', { id: rib.id, entity: rib });
    assert.equal(h.flags()[KEY].status, 'lost'); h.materialize(); assert.equal(ribs(h.s).length, 0);
  } finally { h.close(); }
});

test('native cough stops once through impulses; real re-towing preserves historical lodging and new pose', async () => {
  const flags = { 'bolus:ribLodged': true }; migrateBolusRibState(flags); flags['bolus:ribLodged'] = false;
  const h = fixture(flags); try {
    const rib = h.rib(), s = h.s;
    const tug = h.sim.spawn({ type: 'ship', hull: 100, mass: 1000, radius: 10,
      pos: { x: rib.pos.x + 150, z: rib.pos.z }, collides: true,
      physicsBody: { dynamic: true, mass: 1000, radius: 10, shape: 'ball' } });
    s.playerId = tug.id; s.player.tether = { phase: 'slack' }; s.entityIndex.ready = false;
    const n = h.physics._sg02 = await createSg02DynamicBodyOwner({ frameOrigin: origin });
    s.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const step = () => { s.tick++; n.syncFromEntities([rib, tug]); n.step(1 / 60, s.tick); };
    step(); queuePhysicsImpulse(rib, { x: 2000, y: 0, z: 1000 }); step();
    const before = n.records.get(rib.id).body.linvel(); assert(before.x > 1);
    tickBolus(h.world, 1 / 60);
    assert.equal(h.flags()['bolus:ribLodged'], true); near(n.records.get(rib.id).body.linvel().x, before.x);
    step(); near(n.records.get(rib.id).body.linvel().x, 0, .001); near(n.records.get(rib.id).body.linvel().z, 0, .001);
    assert(captureBolusRib(h.world)); const lodged = { ...h.flags()[KEY] };
    assert(n.createAttachment({ attachmentId: 'retow', defId: 'attachment_massline', ownerId: tug.id, targetId: rib.id,
      sourceWorld: { ...tug.pos }, targetWorld: { ...rib.pos }, restLength: 100, tick: s.tick }));
    for (let i = 0; i < 90; i++) { queuePhysicsImpulse(tug, { x: 100, y: 0, z: 0 }); step(); tickBolus(h.world, 1 / 60); }
    assert(captureBolusRib(h.world)); assert(h.flags()[KEY].x > lodged.x + 1); assert(h.flags()[KEY].vx > 0);
    assert.equal(h.flags()['bolus:ribLodged'], true);
    const returned = fixture(serializeAlienEcologyState(s).sectorFlags); try {
      assert.equal(ribs(returned.s).length, 1); near(returned.rib().pos.x - origin.x, h.flags()[KEY].x);
      near(returned.rib().vel.x, h.flags()[KEY].vx); assert.equal(returned.flags()['bolus:ribLodged'], true);
    } finally { returned.close(); }
  } finally { h.close(); }
});

import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
const external = (runtime, fn) => { const old = snapshotFeatureMaps(); applyFeatureConfigToMaps(runtime.config.features); try { return fn(); } finally { restoreFeatureMaps(old); } };

test('production Save captures native movement at world boundary; Continue, residency return and New Game', async () => {
  let runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 71 });
  try {
    let s = runtime.state; s.mode = 'flight';
    const player = runtime.spawn(makeShipEntitySpec('ship_hawser', { isPlayer: true, player: s.player, pos: { x: 0, z: 0 }, fittings: [] }));
    s.playerId = player.id;
    external(runtime, () => runtime.getSystem('world').enterSector(SID, { continuous: false, noTeleport: true, placePlayer: false }));
    external(runtime, () => runtime.getSystem('world').relocatePlayerInSector({ ...runtime.getSystem('world')._toGlobal({ x: -20, z: -300 }, SID), heading: 0 }, { reason: 'bolus-rib-native-fixture' }));
    const physics = runtime.getSystem('physics'); assert.equal(await physics.prepareBackend(s, { reset: true }), true);
    runtime.step(1 / 60); runtime.step(1 / 60);
    const rib = ribs(s)[0]; assert(rib); assert.equal(ribs(s).length, 1);
    // Real impulse authority after the last world tick makes this capture newer than
    // tickBolus's last sample. No manual capture is called before actual Save.
    queuePhysicsImpulse(rib, { x: 1400, y: 0, z: 600 });
    external(runtime, () => physics.update(1 / 60, s));
    const n = physics._sg02, p = n.records.get(rib.id).body.translation(), v = n.records.get(rib.id).body.linvel();
    const o = runtime.getSystem('world')._sectorOrigin(SID), f = n._frameOrigin;
    const expected = { x: p.x + f.x - o.x, z: p.z + f.z - o.z, vx: v.x, vz: v.z };
    const credits = s.player.credits, cargo = JSON.stringify(s.player.cargo.items);
    const envelope = runtime.getSystem('save').serialize('bolus-rib-continuity');
    const row = envelope.data.world.alienEcology.sectorFlags[KEY];
    assert.equal(row.source, 'native'); for (const key of Object.keys(expected)) near(row[key], expected[key]);
    runtime.dispose(); runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 72 });
    assert.equal(await runtime.getSystem('save').loadEnvelope(envelope, 'bolus-rib-continuity'), true);
    s = runtime.state; s.mode = 'flight'; assert.equal(ribs(s).length, 1);
    const returned = ribs(s)[0], world = runtime.getSystem('world'), origin = world._sectorOrigin(SID);
    near(returned.pos.x - origin.x, row.x); near(returned.pos.z - origin.z, row.z); near(returned.vel.x, row.vx);
    assert.equal(s.player.credits, credits); assert.equal(JSON.stringify(s.player.cargo.items), cargo);
    assert.equal(await runtime.getSystem('physics').prepareBackend(s), true);
    const resumedNative = runtime.getSystem('physics')._sg02;
    const resumedBody = resumedNative.records.get(returned.id)?.body; assert(resumedBody, 'restored original has a real native body');
    near(resumedBody.translation().x + resumedNative._frameOrigin.x - origin.x, row.x, .002);
    near(resumedBody.translation().z + resumedNative._frameOrigin.z - origin.z, row.z, .002);
    near(resumedBody.linvel().x, row.vx); near(resumedBody.linvel().z, row.vz);
    runtime.step(1 / 60); runtime.step(1 / 60);
    // Real world residency owner retires and rematerializes; this is a boundary
    // fixture, not a claim of ordinary gate flight or live-camera acceptance.
    external(runtime, () => world.enterSector('sector_charon_expanse', { continuous: false, noTeleport: true, placePlayer: false }));
    external(runtime, () => world._demoteSectorToRecordOnly(SID));
    const shelved = { ...ensureAlienEcologyState(s).sectorFlags[KEY] };
    assert.equal(ribs(s).length, 0);
    external(runtime, () => world.enterSector(SID, { continuous: false, noTeleport: true, placePlayer: false }));
    assert.equal(ribs(s).length, 1); near(ribs(s)[0].pos.x - origin.x, shelved.x); near(ribs(s)[0].vel.x, shelved.vx);
    external(runtime, () => world.newGame());
    assert.equal(ensureAlienEcologyState(s).sectorFlags[KEY], undefined);
    console.log(JSON.stringify({ fixture: 'production native boundary, not camera/gate flight', nativeSaveSource: row.source, nativeRestore: s.physicsRuntime?.nativeRestore,
      savedLocal: expected, originalCountAfterContinue: 1, originalCountAfterResidencyReturn: 1, duplicateReward: false }));
  } finally { runtime?.dispose(); }
});

test('confirmed exact-life death is captured before destroy-event flush, never confused with shelving', () => {
  for (const reason of ['serialize', 'evict']) {
    const h = fixture(); try { const rib = h.rib(); captureBolusRib(h.world); rib.hull = 0; rib.alive = false;
      assert(captureBolusRib(h.world, SID, { reason })); assert.equal(h.flags()[KEY].status, 'lost');
      h.materialize(); assert.equal(ribs(h.s).length, 0);
    } finally { h.close(); }
  }
});

test('retirement requires actual removal eligibility and stale loss events cannot claim a replacement', () => {
  for (const options of [{ reason: 'strip_full', despawnIds: new Set() }, { reason: 'evict', protected: true }]) {
    const h = fixture(); try {
      const rib = h.rib(); h.world._isProtectedFromResidency = () => options.protected === true;
      captureBolusRib(h.world, SID, options); rib.alive = false; h.s.entities.delete(rib.id); h.materialize();
      assert.equal(ribs(h.s).length, 0, 'unknown absence remains blocked, not authorized retirement');
    } finally { h.close(); }
  }
  const h = fixture(); try {
    const old = h.rib(); captureBolusRib(h.world, SID, { reason: 'strip_full', despawnIds: new Set([old.id]) });
    old.alive = false; h.s.entities.delete(old.id); h.materialize(); const replacement = h.rib(); assert(replacement); assert.notEqual(replacement, old);
    old.hull = 0; h.sim.bus.emit('entity:destroyed', { id: old.id, entity: old }); assert.notEqual(h.flags()[KEY].status, 'lost');
    replacement.data = { ...replacement.data }; replacement.hull = 0;
    h.sim.bus.emit('entity:destroyed', { id: replacement.id, entity: replacement }); assert.notEqual(h.flags()[KEY].status, 'lost');
  } finally { h.close(); }
});

test('missing presentation owner is unready, not a new pose or terminal loss', () => {
  const h = fixture(); try {
    assert(captureBolusRib(h.world)); const row = { ...h.flags()[KEY] };
    h.s.render = { scene: {} }; h.rib().data.presentationOwnerWorldRecordId = 'missing-original-view';
    assert.equal(captureBolusRib(h.world), false); assert.deepEqual(h.flags()[KEY], row);
  } finally { h.s.render = null; h.close(); }
});
