// Stormshift's first normal shift, mixed into the existing traffic owner. The itinerary and
// cargoManifest are existing world-record fields. No private inventory or offscreen production.
// Mule gameplay stats remain canonical; the collector role selects its authored body.
// The receiving Mule is interim service hardware until the separate cradle integration.
import { ensurePhysicsBodySpec } from '../core/physicsAuthority.js';
import { STORMSHIFT_COLLECTOR_COLLISION } from '../data/stormshiftCollectorCollision.js';
import { PLANET_SITE } from '../data/planets.js';
import { makeShipEntitySpec } from './ships.js';
import { stableRecordId, RECORD_KIND } from '../world/worldRecords.js';
import { indexedWorldRecordEntity } from '../world/livingWorldViews.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';

export const ANVIL_WORK = Object.freeze({ kind: 'anvil_work', capacity: 12, receiverCapacity: 48,
  radius: 980, berthRadius: 2800, speed: 70, transferRange: 72, transferSpeed: 8 });
const KIND = ANVIL_WORK.kind;
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const live = (state, e) => !!e && e.alive !== false && e.hull > 0 && state.entities.get(e.id) === e;
const itinerary = (e) => e?.data?.itinerary;
const used = (e) => Math.max(0, finite(e?.data?.cargoManifest?.totalQty));

export function anvilWorkerRecordId(state, role = 'collector') {
  return stableRecordId(state.meta?.seed || 1, PLANET_SITE.sectorId, RECORD_KIND.CONVOY, `anvil:shift:${role}`);
}
function validManifest(e, capacity) {
  const m = e?.data?.cargoManifest;
  if (!m || !Number.isSafeInteger(m.totalQty) || m.totalQty < 0 || m.totalQty > capacity
    || !Array.isArray(m.lines)) return false;
  let total = 0;
  for (const line of m.lines) {
    if (line.commodityId !== PLANET_SITE.harvest.commodityShallow
      || !Number.isSafeInteger(line.qty) || line.qty <= 0) return false;
    total += line.qty;
  }
  return total === m.totalQty;
}
function actor(owner, role) {
  const id = anvilWorkerRecordId(owner.state, role);
  const e = indexedWorldRecordEntity(owner.state, id)
    || owner.state.entityList?.find(e => e?.data?.worldRecordId === id && e.alive !== false);
  if (!live(owner.state, e) || itinerary(e)?.kind !== KIND || itinerary(e)?.role !== role) return null;
  // Reject superseded objects and ambiguous same-record incarnations, rather than harvesting
  // into whichever duplicate happened to win the entity index.
  if (owner.state.entityList?.some(other => other !== e && other?.alive !== false
    && other?.data?.worldRecordId === id)) return null;
  return e;
}
function bindCollectorCollision(e) {
  if (e.physicsBody?.collisionProxyManifest?.id === STORMSHIFT_COLLECTOR_COLLISION.id) return;
  const body = ensurePhysicsBodySpec(e);
  e.physicsBody = { ...body, collisionProxyManifest: STORMSHIFT_COLLECTOR_COLLISION,
    revision: Math.max(0, finite(e.physicsBody?.revision)) + 1 };
}
function persist(owner, e) { owner._registry?.get?.('world')?.upsertWorldRecord?.(e); }
function recFor(owner, e) { return owner.state.traffic?.freighters?.find(r => r.id === e.id) || null; }
function hold(e) {
  e.data.intent = { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null,
    aimAngle: finite(e.rot), brake: true };
}
// Uses Flight V3's civilian intent, never writes velocity/position. Arrive is speed-limited
// with the same braking-distance contract as the existing Helios ore-carrier approach.
function steer(owner, e, target, reach = 24, speed = ANVIL_WORK.speed) {
  const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
  const distance = Math.hypot(dx, dz), aim = Math.atan2(dz, dx);
  const p = resolvePropulsionProfile(e, owner.state);
  const accel = Math.max(1, p.reverseAccel || 0, (p.mainAccel || 0) * 0.72);
  const closing = Math.max(0, (finite(e.vel?.x) * dx + finite(e.vel?.z) * dz) / Math.max(1, distance));
  const desired = Math.min(speed, Math.max(0, distance - reach) * 0.4,
    Math.sqrt(2 * accel * Math.max(0, distance - reach)));
  const brake = distance <= reach || Math.cos(aim - finite(e.rot)) < 0.85
    || Math.hypot(finite(e.vel?.x), finite(e.vel?.z)) > desired + 3
    || closing * closing / (2 * accel) >= distance - reach;
  e.data.intent = { moveX: 0, moveZ: brake ? 0 : Math.min(1,
    Math.max((p.assist?.deadInput || 0.025) + 0.001, desired / Math.max(1, p.combatSpeed || e.maxSpeed || 100))),
  boost: false, fire: false, fireGroup: null, aimAngle: aim, brake };
  return distance <= reach;
}
function manifest(owner, e, qty, prior = null) {
  const next = owner._buildMinerManifest(e, itinerary(e).sequence, PLANET_SITE.harvest.commodityShallow, qty);
  next.lotId = prior?.lotId || `lot:${e.data.worldRecordId}:${itinerary(e).sequence}`;
  next.custody = { holderKind: 'traffic', holderId: e.data.worldRecordId, acquiredBy: 'planet:npcHarvest' };
  return next;
}

export const anvilTrafficMethods = {
  ensureAnvilWorker(state, spawnEntity, center) {
    if (state !== this.state || state.world?.currentSectorId !== PLANET_SITE.sectorId) return null;
    this._ensureState();
    for (const role of ['collector', 'receiver']) {
      let e = actor(this, role);
      const recordId = anvilWorkerRecordId(state, role);
      if (!e) {
        // A stored body, including a dead one, belongs to world residency. Never replace it.
        if (state.world?.records?.byId?.[recordId]) continue;
        if (state.entityList?.some(row => row?.data?.worldRecordId === recordId)) continue;
        const pos = { x: center.x + ANVIL_WORK.berthRadius - (role === 'collector' ? 100 : 0), z: center.z };
        // Adopt the old witness if a live route already registered one before this owner loaded.
        e = role === 'collector' ? state.entityList?.find(row => live(state, row)
          && row.data?.anvilSlingWitness === true && !row.data.worldRecordId) : null;
        if (!e) {
          const spec = makeShipEntitySpec('ship_mule', { team: 2, factionId: 'faction_mts', pos,
            rot: role === 'collector' ? Math.PI : 0, ai: { passive: true, archetype: 'passive' } });
          spec.vel = { x: 0, z: 0 };
          e = spawnEntity(spec);
        }
        if (!e) continue;
        Object.assign(e.data, { worldRecordId: recordId, named: true,
          name: role === 'collector' ? 'Stormshift Collector' : 'Stormshift Receiving Tender',
          itinerary: { kind: KIND, role, phase: role === 'collector' ? 'outbound' : 'receiving',
            sequence: 0, center: { ...center }, deliveredQty: 0 }, durable: true });
        this._stampTrafficDurableIdentity(e, PLANET_SITE.sectorId, role === 'collector' ? 'stormshift_collector' : 'hauler', { label: e.data.name }, 0);
        this._setTrafficManifest(e, null, manifest(this, e, 0));
        persist(this, e);
      }
      e.data.anvilSlingWitness = role === 'collector';
      if (role === 'collector') bindCollectorCollision(e);
      if (!recFor(this, e)) {
        state.traffic.freighters.push({ id: e.id, role: e.data.trafficRole, manifest: e.data.cargoManifest, dockSeq: 0 });
        this._active.push(e.id);
      }
    }
    return actor(this, 'collector');
  },

  acceptAnvilHarvest(e, { siteId, commodityId, qty } = {}) {
    if (actor(this, 'collector') !== e || itinerary(e).phase !== 'collect'
      || siteId !== PLANET_SITE.id || commodityId !== PLANET_SITE.harvest.commodityShallow
      || !Number.isSafeInteger(qty) || qty <= 0
      || !validManifest(e, ANVIL_WORK.capacity)) return 0;
    const amount = Math.min(qty, Math.max(0, ANVIL_WORK.capacity - used(e)));
    if (!amount) return 0;
    this._setTrafficManifest(e, recFor(this, e), manifest(this, e, used(e) + amount, used(e) > 0 ? e.data.cargoManifest : null));
    persist(this, e);
    return amount;
  },

  _transferAnvilLoad(e, receiver) {
    if (actor(this, 'collector') !== e || actor(this, 'receiver') !== receiver
      || itinerary(e).phase !== 'return' || e.data.jobId || receiver.data.jobId
      || !validManifest(e, ANVIL_WORK.capacity)
      || !validManifest(receiver, ANVIL_WORK.receiverCapacity)) return 0;
    const distance = Math.hypot(e.pos.x - receiver.pos.x, e.pos.z - receiver.pos.z);
    const relativeSpeed = Math.hypot(finite(e.vel?.x) - finite(receiver.vel?.x), finite(e.vel?.z) - finite(receiver.vel?.z));
    if (distance > ANVIL_WORK.transferRange || relativeSpeed > ANVIL_WORK.transferSpeed) return 0;
    const source = e.data.cargoManifest, target = receiver.data.cargoManifest;
    const amount = Math.min(used(e), Math.max(0, ANVIL_WORK.receiverCapacity - used(receiver)));
    if (!(amount > 0)) return 0;
    // Synchronous manifest writes commit custody before any event can re-enter this transfer.
    this._setTrafficManifest(e, recFor(this, e), manifest(this, e, used(e) - amount, source));
    const received = manifest(this, receiver, used(receiver) + amount, target);
    received.custody.acquiredBy = 'traffic:anvilTransfer';
    this._setTrafficManifest(receiver, recFor(this, receiver), received);
    itinerary(e).deliveredQty += amount;
    if (!used(e)) { itinerary(e).phase = 'berthed'; itinerary(e).sequence++; }
    persist(this, e); persist(this, receiver);
    this.bus.emit('traffic:anvilTransfer', { sourceId: e.id, receiverId: receiver.id,
      commodityId: PLANET_SITE.harvest.commodityShallow, qty: amount, lotId: source.lotId });
    return amount;
  },

  _stepAnvilWork(dt, state) {
    if (!(dt > 0) || state.world?.currentSectorId !== PLANET_SITE.sectorId) return;
    const e = actor(this, 'collector'), receiver = actor(this, 'receiver');
    if (receiver && !receiver.data.jobId) hold(receiver);
    if (!e || e.data.jobId) return; // another existing movement owner wins
    e.data.anvilSlingWitness = true;
    bindCollectorCollision(e);
    if (state.planet?.active) state.planet.witnessId = e.id;
    const route = itinerary(e), center = route.center;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) { hold(e); return; }
    if (!receiver) { hold(e); return; } // retain finite cargo if berth was destroyed or removed
    const heat = state.planet?.ships?.[e.id]?.heat || 0;
    if (route.phase === 'berthed') {
      if (used(receiver) >= ANVIL_WORK.receiverCapacity || heat > 0.1) { hold(e); return; }
      route.phase = 'outbound';
    }
    if (route.phase === 'outbound') {
      if (steer(this, e, { x: center.x + ANVIL_WORK.radius, z: center.z }, 25, 55)) {
        route.phase = 'collect'; persist(this, e);
      }
      return;
    }
    if (route.phase === 'collect') {
      if (used(e) >= ANVIL_WORK.capacity || heat >= 0.58 || e.hull < e.hullMax * 0.5) {
        route.phase = 'clear_band'; persist(this, e);
      } else {
        const angle = Math.atan2(e.pos.z - center.z, e.pos.x - center.x) + 0.22;
        steer(this, e, { x: center.x + Math.cos(angle) * ANVIL_WORK.radius,
          z: center.z + Math.sin(angle) * ANVIL_WORK.radius }, 0);
        return;
      }
    }
    if (route.phase === 'clear_band') {
      const angle = Math.atan2(e.pos.z - center.z, e.pos.x - center.x);
      if (steer(this, e, { x: center.x + Math.cos(angle) * ANVIL_WORK.berthRadius,
        z: center.z + Math.sin(angle) * ANVIL_WORK.berthRadius }, 40)) {
        route.phase = 'return'; persist(this, e);
      }
      return;
    }
    if (route.phase === 'return') {
      // Follow the outer arc until the receiver's radial approach is safe. A direct chord
      // across the opposite limb would cut through the planet rather than return a load.
      const angle = Math.atan2(e.pos.z - center.z, e.pos.x - center.x);
      const targetAngle = Math.atan2(receiver.pos.z - center.z, receiver.pos.x - center.x);
      const delta = Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle));
      if (Math.abs(delta) > 0.35) {
        const next = angle + Math.sign(delta) * 0.22;
        steer(this, e, { x: center.x + Math.cos(next) * ANVIL_WORK.berthRadius,
          z: center.z + Math.sin(next) * ANVIL_WORK.berthRadius }, 0);
      } else {
        steer(this, e, receiver.pos, ANVIL_WORK.transferRange * 0.65, 40);
        this._transferAnvilLoad(e, receiver);
        if (!used(e) && route.phase === 'return') { route.phase = 'berthed'; persist(this, e); }
      }
    }
  },
};
