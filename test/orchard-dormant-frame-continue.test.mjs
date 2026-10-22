import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { orchardFrameBodySpec, ORCHARD_GEOMETRY as G } from '../src/data/anvilOrchardBody.js';
import { ensurePhysicsBodySpec } from '../src/core/physicsAuthority.js';

const canonical = ensurePhysicsBodySpec({ type: 'wreck', radius: G.radius, data: {}, physicsBody: orchardFrameBodySpec() });
const frameOf = state => state.entityList.find(e => e.alive !== false && e.data?.orchardKind === 'frame');

// Ordinary production producers and clocks only: no Orchard fixture actors, native
// frame construction, relocation, authored history, or readiness substitutions.
async function ordinaryProducer(ticks = 2) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 804 });
  try {
    const state = runtime.state;
    state.mode = 'flight';
    runtime.getSystem('ships').newGame();
    const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
      isPlayer: true, player: state.player, fittings: state.player.ownedShips[0].fittings,
    }));
    state.playerId = player.id;
    runtime.getSystem('world').enterSector('sector_tethys_junction');
    const physics = runtime.getSystem('physics');
    assert.equal(await physics.prepareBackend(state), true);
    for (let i = 0; i < ticks; i++) {
      runtime.step();
      const frame = frameOf(state);
      if (frame) assert.equal(physics._sg02.records.has(frame.id), false, 'ordinary distant frame never enters native residency');
    }
    const frame = frameOf(state);
    assert.ok(frame);
    assert.deepEqual(frame.physicsBody, orchardFrameBodySpec(), 'inspection must leave the valid raw authoring untouched');
    assert.deepEqual(frame.physicsBody.attachmentPoints, {});
    const saves = runtime.getSystem('save');
    const envelope = JSON.parse(JSON.stringify(saves.serialize('dormant-frame')));
    return { runtime, state, physics, saves, envelope, frame, close: () => runtime.dispose() };
  } catch (error) { runtime.dispose(); throw error; }
}

for (const native of [true, false]) {
  test(`ordinary never-native Orchard frame survives ${native ? 'ordinary snapshot' : 'legacy scalar'} Continue from raw authoring`, async () => {
    const h = await ordinaryProducer(native ? 663 : 2);
    try {
      const expectedRow = structuredClone(h.state.sites.anvilOrchard);
      const expectedCollars = structuredClone(h.frame.data.orchardCollars);
      const expectedRoot = structuredClone(h.frame.pos), tick = h.state.tick;
      if (!native) { h.envelope.data.physics = null; delete h.envelope.checksum; }
      assert.equal(h.saves.loadEnvelope(h.envelope), true);
      assert.equal(h.physics._nativeRestorePending, false);
      assert.equal(!!h.envelope.data.physics, native);
      if (!native) assert.equal(h.state.physicsRuntime.nativeRestore.mode, 'scalar');
      const restored = frameOf(h.state);
      assert.notEqual(restored, h.frame);
      assert.deepEqual(restored.physicsBody, canonical, 'only committed adoption publishes canonical normalization');
      assert.deepEqual(restored.data.orchardCollars, expectedCollars);
      assert.deepEqual({ ...restored.pos }, expectedRoot);
      assert.deepEqual(h.state.sites.anvilOrchard, expectedRow);
      assert.equal(h.physics._sg02.records.has(restored.id), false);
      assert.equal(h.physics.readOrchardFramePose(restored), null, 'dormancy does not grant native motor authority');
      assert.equal(restored.data.orchardFiniteCustody, 1);
      const player = h.physics._sg02.records.get(h.state.playerId);
      assert.ok(player?.body.isDynamic(), 'unrelated player keeps a native dynamic body');
      const nativeTick = h.physics._sg02.tick;
      h.runtime.step();
      assert.equal(h.state.tick, tick + 1);
      assert.equal(h.physics._sg02.tick, nativeTick + 1, 'ordinary production step advances the actual native owner');
      assert.equal(h.physics._sg02.records.get(h.state.playerId), player);
      assert.ok(Object.values(player.body.translation()).every(Number.isFinite));
      assert.deepEqual(h.state.sites.anvilOrchard, expectedRow);
      assert.deepEqual(restored.data.orchardCollars, expectedCollars);
      assert.equal(h.physics._sg02.records.has(restored.id), false);
      // Subsequent normalized dormant saves must retain their custody too.
      const again = JSON.parse(JSON.stringify(h.saves.serialize('dormant-again')));
      assert.equal(h.saves.loadEnvelope(again), true);
      assert.deepEqual(h.state.sites.anvilOrchard, expectedRow);
      assert.deepEqual(frameOf(h.state).data.orchardCollars, expectedCollars);
      assert.equal(h.physics._sg02.records.has(frameOf(h.state).id), false);
    } finally { h.close(); }
  });
}

for (const change of ['geometry', 'collars', 'lifetime', 'census', 'raw-spec']) {
  test(`changed dormant ${change} refuses cold adoption without publishing normalization`, async () => {
    const h = await ordinaryProducer();
    const proto = Object.getPrototypeOf(h.physics._sg02), commit = proto._commitNativeOwner;
    let attempts = 0;
    const failures = [];
    try {
      proto._commitNativeOwner = function (candidate, mirrors, options) {
        try {
          if (!options?.orchardColdRestore) return commit.call(this, candidate, mirrors, options);
          const frame = frameOf(h.state), spec = frame.physicsBody, data = frame.data;
          const bodyCell = Object.getOwnPropertyDescriptor(frame, 'physicsBody');
          const dataCell = Object.getOwnPropertyDescriptor(frame, 'data');
          const world = this.world, records = this.records;
          assert.deepEqual(spec.attachmentPoints, {}, 'staging has not normalized the restored dormant source');
          attempts++;
          if (change === 'geometry') spec.collisionProxyManifest.convexParts[0].points[0].x += 1;
          if (change === 'collars') data.orchardCollars.progress[0] = 1;
          if (change === 'lifetime') frame.occupantGeneration++;
          if (change === 'census') h.state.entities.delete(frame.id);
          if (change === 'raw-spec') frame.physicsBody = structuredClone(spec);
          const changedCell = Object.getOwnPropertyDescriptor(frame, 'physicsBody');
          assert.throws(() => commit.call(this, candidate, mirrors, options), /orchard_restore_inputs_changed/);
          assert.equal(this.world, world);
          assert.equal(this.records, records);
          assert.equal(frame.physicsBody, changedCell.value);
          assert.equal(frame.data, dataCell.value);
          assert.deepEqual(Object.getOwnPropertyDescriptor(frame, 'physicsBody'), changedCell);
          assert.deepEqual(Object.getOwnPropertyDescriptor(frame, 'data'), dataCell);
          assert.equal(data.orchardFiniteCustody, undefined);
          assert.deepEqual(spec.attachmentPoints, {});
          assert.equal(bodyCell.value, spec);
          throw Error('test_dormant_source_changed');
        } catch (error) { if (error.code === 'ERR_ASSERTION') failures.push(error); throw error; }
      };
      assert.equal(h.saves.loadEnvelope(h.envelope), false);
      assert.ok(attempts > 0, 'test reached the actual cold owner publication seam');
      assert.deepEqual(failures, [], 'save failure must not swallow test assertions');
    } finally { proto._commitNativeOwner = commit; h.close(); }
  });
}

test('late dormant source mutation rolls normalized mirrors back atomically', async () => {
  const h = await ordinaryProducer();
  const proto = Object.getPrototypeOf(h.physics._sg02), commit = proto._commitNativeOwner;
  const define = Object.defineProperty;
  let mutations = 0;
  const failures = [];
  try {
    proto._commitNativeOwner = function (candidate, mirrors, options) {
      try {
        if (!options?.orchardColdRestore) return commit.call(this, candidate, mirrors, options);
        const frame = frameOf(h.state), bodyCell = Object.getOwnPropertyDescriptor(frame, 'physicsBody');
        const dataCell = Object.getOwnPropertyDescriptor(frame, 'data');
        const world = this.world, records = this.records;
        let fired = false;
        Object.defineProperty = function (object, key, descriptor) {
          const result = define(object, key, descriptor);
          if (!fired && object === frame && key === 'physicsBody' && descriptor.value !== bodyCell.value) {
            fired = true; mutations++;
            frame.occupantGeneration++;
          }
          return result;
        };
        try {
          assert.throws(() => commit.call(this, candidate, mirrors, options), /orchard_source_changed_during_publication/);
          assert.equal(fired, true);
          assert.equal(this.world, world);
          assert.equal(this.records, records);
          assert.equal(frame.physicsBody, bodyCell.value);
          assert.equal(frame.data, dataCell.value);
          assert.deepEqual(Object.getOwnPropertyDescriptor(frame, 'physicsBody'), bodyCell);
          assert.deepEqual(Object.getOwnPropertyDescriptor(frame, 'data'), dataCell);
          assert.deepEqual(frame.physicsBody.attachmentPoints, {});
          assert.equal(frame.data.orchardFiniteCustody, undefined);
        } finally { Object.defineProperty = define; }
        throw Error('test_dormant_publication_changed');
      } catch (error) { if (error.code === 'ERR_ASSERTION') failures.push(error); throw error; }
    };
    assert.equal(h.saves.loadEnvelope(h.envelope), false);
    assert.ok(mutations > 0);
    assert.deepEqual(failures, [], 'save failure must not swallow rollback assertions');
  } finally { Object.defineProperty = define; proto._commitNativeOwner = commit; h.close(); }
});

for (const corrupt of ['geometry', 'collars']) {
  test(`raw-authoring saved ${corrupt} corruption remains rejected`, async () => {
    const h = await ordinaryProducer();
    const proto = Object.getPrototypeOf(h.physics._sg02), commit = proto._commitNativeOwner;
    const rejected = [], expectedRow = structuredClone(h.state.sites.anvilOrchard);
    const expectedCollars = structuredClone(h.frame.data.orchardCollars);
    try {
      const saved = h.envelope.data.entities.persistent.find(e => e.data?.orchardKind === 'frame');
      assert.ok(saved);
      if (corrupt === 'geometry') saved.physicsBody.collisionProxyManifest.convexParts[0].points[0].x += 1;
      else saved.data.orchardCollars.sourceSha = 'invalid-source';
      delete h.envelope.checksum;
      proto._commitNativeOwner = function (candidate, mirrors, options) {
        const frame = frameOf(h.state), world = this.world, records = this.records;
        const bodyCell = Object.getOwnPropertyDescriptor(frame, 'physicsBody');
        const dataCell = Object.getOwnPropertyDescriptor(frame, 'data');
        try { return commit.call(this, candidate, mirrors, options); }
        catch (error) {
          rejected.push({ error, frame, bodyCell, dataCell,
            unchangedOwner: this.world === world && this.records === records });
          throw error;
        }
      };
      assert.equal(h.saves.loadEnvelope(h.envelope), false);
      assert.ok(rejected.length > 0);
      for (const r of rejected) {
        assert.match(r.error.message, /invalid_orchard_frame_source/);
        assert.equal(r.unchangedOwner, true);
        assert.equal(r.frame.physicsBody, r.bodyCell.value);
        assert.equal(r.frame.data, r.dataCell.value);
        assert.deepEqual(Object.getOwnPropertyDescriptor(r.frame, 'physicsBody'), r.bodyCell);
        assert.deepEqual(Object.getOwnPropertyDescriptor(r.frame, 'data'), r.dataCell);
        assert.deepEqual(r.frame.physicsBody.attachmentPoints, {}, 'rejected source never acquires normalized storage');
        assert.equal(r.frame.data.orchardFiniteCustody, undefined);
      }
      // Save's ordinary rollback may successfully adopt a distinct clean source.
      // That must not be mistaken for publication of the rejected corrupt input.
      const recovered = frameOf(h.state);
      assert.ok(recovered);
      assert.equal(rejected.some(r => r.frame === recovered), false);
      assert.deepEqual(h.state.sites.anvilOrchard, expectedRow);
      assert.deepEqual(recovered.data.orchardCollars, expectedCollars);
      assert.deepEqual(recovered.physicsBody, canonical);
      assert.equal(h.physics._sg02.records.has(recovered.id), false);
      assert.equal(h.physics.readOrchardFramePose(recovered), null);
    } finally { proto._commitNativeOwner = commit; h.close(); }
  });
}
