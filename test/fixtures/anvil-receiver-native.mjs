import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../../src/runtime/createAuthoritativeRuntime.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../../src/systems/ships.js';
import { anvilWorkerRecordId } from '../../src/systems/anvilWork.js';
import { PLANET_SITE } from '../../src/data/planets.js';

export async function anvilReceiverFixture({ envelope = null } = {}) {
  const flags = snapshotFeatureMaps();
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 47 });
  applyFeatureConfigToMaps(runtime.config.features);
  const state = runtime.state;
  state.mode = 'flight'; state.ui.screenStack = [];
  const world = runtime.getSystem('world'), physics = runtime.getSystem('physics');
  const observerPlacements = [];
  const actor = role => state.entityList.find(e => e.alive !== false
    && e.data?.worldRecordId === anvilWorkerRecordId(state, role));
  if (envelope) {
    assert.equal(runtime.getSystem('save').loadEnvelope(envelope), true);
    state.mode = 'flight';
  } else {
    const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
      isPlayer: true, player: state.player, team: 0, pos: { x: 0, z: 0 }
    }));
    state.playerId = player.id;
    world.enterSector(PLANET_SITE.sectorId);
    runtime.step(1 / 60);
    const source = actor('collector') || state.world.records.byId[anvilWorkerRecordId(state, 'collector')];
    assert.ok(source, 'original worker exists live or legitimately shelved');
    assert.equal(await physics.prepareBackend(state), true);
    runtime.step(1 / 60);
    relocateAnvilObserver({ physics, state, world, actor, observerPlacements }, source);
    for (let i = 0; i < 120 && !actor('collector'); i++) runtime.step(1 / 60);
    assert.ok(actor('collector'), 'ordinary observer proximity promotes original worker');
  }
  assert.ok(runtime.getSystem('environmentalMachinery') && runtime.getSystem('terrainAnchors'));
  assert.equal(await physics.prepareBackend(state), true);
  return { runtime, state, actor, physics, world, observerPlacements, owner: runtime.getSystem('traffic'),
    step(n = 1) { for (let i = 0; i < n; i++) runtime.step(1 / 60); },
    close() { runtime.dispose(); restoreFeatureMaps(flags); } };
}

// Observe actual compiled native contacts without changing bodies or filtering obstacles.
export function receiverContactDepth(physics, receiver) {
  const native = physics._sg02, record = native?.records.get(receiver.id);
  if (!record) return { admitted: false, distance: null, targetId: null };
  let minimum = Infinity, targetId = null, normal = null, targetEntity = null;
  const observed = new Map();
  for (const collider of record.colliders) native.world.contactPairsWith(collider, other => {
    if (other.isSensor()) return;
    const target = native._colliderOwners.get(other.handle)?.rec;
    assert.ok(target, `unknown native contact owner for collider ${other.handle}`);
    if (target === record) return;
    native.world.contactPair(collider, other, manifold => {
      for (let i = 0; i < manifold.numContacts(); i++) {
        const d = manifold.contactDist(i), id = target.entity.id;
        let row = observed.get(id);
        if (!row) {
          row = { targetId: id, targetEntity: target.entity, dynamic: target.body.isDynamic(),
            distance: Infinity, impulse: 0, normal: null };
          observed.set(id, row);
        }
        row.impulse += manifold.contactImpulse(i);
        if (d < row.distance) { row.distance = d; row.normal = manifold.normal(); }
        if (d < minimum) { minimum = d; targetId = id; normal = manifold.normal(); targetEntity = target.entity; }
      }
    });
  });
  return { admitted: true, distance: Number.isFinite(minimum) ? minimum : null, targetId, normal,
    targetEntity, contacts: [...observed.values()] };
}

// Observer moves are test scaffolding, never permission to strike a worker. Keep
// the original offset when clear; otherwise choose another nearby clear view.
export function relocateAnvilObserver(f, watched, reason = 'anvil-receiver-observation') {
  const native = f.physics._sg02, player = f.state.entities.get(f.state.playerId);
  assert.ok(native && player, 'observer needs actual native geometry');
  const playerRecord = native.records.get(player.id);
  assert.ok(playerRecord, 'observer hull must be admitted before relocation');
  const bodyPos = playerRecord.body.translation(); let hull = 0;
  for (const co of playerRecord.colliders) {
    const shape = co.shape, at = co.translation(); let bound = 0;
    if (shape.vertices?.length) {
      for (let i = 0; i < shape.vertices.length; i += 3)
        bound = Math.max(bound, Math.hypot(shape.vertices[i], shape.vertices[i + 1], shape.vertices[i + 2]));
    } else if (shape.halfExtents) bound = Math.hypot(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z);
    else if (Number.isFinite(shape.radius)) bound = shape.radius + (shape.halfHeight || 0);
    else assert.fail('unresolved observer collider envelope');
    hull = Math.max(hull, bound + Math.hypot(at.x - bodyPos.x, at.y - bodyPos.y, at.z - bodyPos.z));
  }
  assert.ok(hull > 0 && Number.isFinite(hull));
  const origin = native._frameOrigin, observerShape = new native.RAPIER.Ball(hull);
  const observerVelocity = { x: player.vel.x, y: 0, z: player.vel.z };
  const playerTravel = Math.hypot(player.vel.x, player.vel.z) * 2;
  const workers = ['collector', 'receiver'].map(role => f.actor(role)
    || f.state.world.records.byId[anvilWorkerRecordId(f.state, role)]).filter(Boolean);
  const rejected = [];
  for (const radius of [180, 300, 450]) for (let i = 0; i < 16; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 8;
    const pos = { x: watched.pos.x + Math.cos(angle) * radius, z: watched.pos.z + Math.sin(angle) * radius };
    const point = { x: pos.x - origin.x, y: 0, z: pos.z - origin.z }; let clearance = Infinity, blocker = null;
    for (const rec of native.records.values()) {
      if (rec.entity.id === player.id) continue;
      const v = rec.body.isDynamic() ? rec.body.linvel() : { x: 0, y: 0, z: 0 };
      for (const co of rec.colliders) {
        if (co.isSensor()) continue;
        const projection = co.projectPoint(point, true);
        const gap = projection.isInside ? 0 : Math.hypot(projection.point.x - point.x, projection.point.y - point.y, projection.point.z - point.z);
        if (gap - hull < clearance) { clearance = gap - hull; blocker = { id: rec.entity.id, gap, reason: 'current-native-surface' }; }
        // Exact translational sweep, rather than treating a fast passing ship as
        // occupying its entire speed-radius disk around every possible viewpoint.
        if (co.castShape(v, observerShape, point, { x: 0, y: 0, z: 0, w: 1 },
          observerVelocity, 32, 2, true)) { clearance = -Infinity; blocker = { id: rec.entity.id, velocity: { ...v }, reason: 'native-two-second-sweep' }; }
      }
    }
    for (const worker of workers) clearance = Math.min(clearance,
      Math.hypot(pos.x - worker.pos.x, pos.z - worker.pos.z) - hull - 64 - playerTravel
      - Math.hypot(worker.vel?.x || 0, worker.vel?.z || 0) * 2);
    if (clearance < 32) { rejected.push({ pos, clearance: Number.isFinite(clearance) ? clearance : null, blocker }); continue; }
    const record = { time: f.state.simTime, pos, hull, clearance, sweepSeconds: 2, rejected, reason };
    (f.observerPlacements ||= []).push(record);
    f.world.relocatePlayerInSector({ ...pos, heading: 0 }, { reason });
    return record;
  }
  (f.observerPlacements ||= []).push({ time: f.state.simTime, failed: true, rejected, reason });
  assert.fail('no collision-clear observer position; do not relocate into the route');
}
export function assertNoObserverContact(state, contact) {
  assert.ok(contact.targetId !== state.playerId || (contact.distance >= 0 && contact.impulse === 0),
    'observer fixture contacted a participant; route evidence contaminated');
}
