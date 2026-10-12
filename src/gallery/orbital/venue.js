// Shared live venue membrane: the existing entity store, Rapier, fields and Massline remain owners.
// Local views are scoring observations, never another integrator or a second simulation clock.
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';
import { getCombatKernel } from '../../combat/kernel.js';
import { FIELD_DEFS } from '../../data/fields.js';

export function createPhysicalVenue(ctx, { id, bodies, solids = [], fields = [], markers = [], shipAt, center }) {
  const { state, helpers = {}, registry } = ctx;
  const player = state.entities?.get(state.playerId);
  if (!player?.alive || !helpers.spawnEntity || !helpers.removeEntity) {
    return { ok: false, reason: 'venue-needs-live-player-and-entity-owner' };
  }
  const world = registry?.get('world');
  const returnPosition = { ...player.pos };
  const returnSector = state.world?.currentSectorId;
  const placement = world?.relocatePlayerInSector && !center
    ? chooseClearVenueCenter(state, player, bodies, solids, markers, fields) : null;
  if (world?.relocatePlayerInSector && !center && !placement) return { ok: false, reason: 'no-clear-court' };
  const anchor = center || placement || { x: player.pos.x - shipAt.x, z: player.pos.z - shipAt.z };
  if (placement && !world.relocatePlayerInSector({ x: anchor.x + shipAt.x, z: anchor.z + shipAt.z },
    { reason: `venue:${id}` })) return { ok: false, reason: 'court-relocation-rejected' };
  const ids = new Map();
  const owned = new Set();
  const spawned = new Map();
  const fieldIds = [];
  const fieldsOwner = registry?.get('fields');
  const kernel = getCombatKernel(ctx);
  let closed = false;
  const venue = {
    ok: true, id, center: anchor, ids, owned, kernel, returnPosition,
    entity(key) { return state.entities.get(ids.get(key)); },
    key(entityId) {
      if (entityId === state.playerId) return 'ship';
      for (const [key, value] of ids) if (value === entityId) return key;
      return null;
    },
    reconcile(views) {
      if (closed) return;
      for (const view of views) {
        const key = view.id || view.role;
        if (view.role === 'ship' || view.role === 'pilot') {
          ids.set(key, state.playerId);
          continue;
        }
        if (view.alive === false) {
          remove(key);
          continue;
        }
        if (!ids.has(key)) spawn(view, key);
      }
    },
    read(views) {
      for (const view of views) {
        const entity = venue.entity(view.id || view.role);
        if (!entity || entity.alive === false) { view.alive = false; continue; }
        view.x = entity.pos.x - anchor.x;
        view.z = entity.pos.z - anchor.z;
        view.vx = entity.vel.x;
        view.vz = entity.vel.z;
      }
    },
    drive(views, dt, rivalForce = null, session = null) {
      if (!(dt > 0) || closed) return;
      for (const view of views) {
        if (!view.alive || view.role === 'ship' || view.role === 'pilot') continue;
        const entity = venue.entity(view.id || view.role);
        if (!entity?.alive) continue;
        let ax = 0, az = 0;
        if (view.drag > 0) {
          const speed = Math.hypot(entity.vel.x, entity.vel.z);
          const k = speed > 0 ? Math.min(view.drag, speed / dt) / speed : 0;
          ax -= entity.vel.x * k; az -= entity.vel.z * k;
        }
        if (rivalForce && (view.role === 'keeper' || view.role === 'charge')) {
          const force = rivalForce(view, session);
          ax += (force?.fx || 0) / entity.mass;
          az += (force?.fz || 0) / entity.mass;
        }
        if (view.motor) {
          const motor = view.motor;
          const phase = state.simTime + (motor.phaseS || 0);
          const sign = motor.periodS > 0 && Math.floor(phase / (motor.periodS * 0.5)) % 2 ? -1 : 1;
          const hx = Math.cos(motor.heading || 0) * sign, hz = Math.sin(motor.heading || 0) * sign;
          const along = entity.vel.x * hx + entity.vel.z * hz;
          const accel = Math.max(-(motor.accel || 60), Math.min(motor.accel || 60,
            ((motor.cruise || 0) - along) / dt));
          ax += hx * accel; az += hz * accel;
        }
        if (ax || az) queuePhysicsImpulse(entity, { x: ax * entity.mass * dt, y: 0, z: az * entity.mass * dt });
      }
    },
    snapshot(views) {
      return views.map(view => {
        const entity = venue.entity(view.id || view.role);
        return entity ? { id: view.id, role: view.role, x: entity.pos.x - anchor.x,
          z: entity.pos.z - anchor.z, vx: entity.vel.x, vz: entity.vel.z, alive: entity.alive !== false }
          : { id: view.id, role: view.role, alive: false };
      });
    },
    close() {
      if (closed) return;
      closed = true;
      for (const entityId of [...owned]) removeEntity(entityId);
      for (const fieldId of fieldIds) fieldsOwner?.unregisterExternal?.(fieldId);
      ids.clear(); owned.clear(); fieldIds.length = 0;
      if (state.physicsVenue?.id === id) delete state.physicsVenue;
      if (placement && player.alive !== false && state.world?.currentSectorId === returnSector
          && pointClear(state, player, returnPosition, player.radius + 6)) {
        world.relocatePlayerInSector(returnPosition, { reason: `venue-return:${id}` });
      }
    },
  };
  function removeEntity(entityId) {
    if (state.entities.get(entityId) !== spawned.get(entityId)) { owned.delete(entityId); return; }
    for (const line of kernel.attachments.listForEntity(entityId, true) || []) {
      if (line.state === 'active') kernel.attachments.cut(line.id, state.playerId, 'venue-exit');
    }
    helpers.removeEntity(entityId, { immediate: true, reason: 'venue-exit' });
    owned.delete(entityId);
    spawned.delete(entityId);
  }
  function remove(key) {
    const entityId = ids.get(key);
    if (owned.has(entityId)) removeEntity(entityId);
    ids.delete(key);
  }
  function spawn(view, key) {
    const entity = helpers.spawnEntity(venueEntitySpec(id, key, view, anchor));
    if (!entity) throw new Error(`${id}: physical body ${key} could not spawn`);
    ids.set(key, entity.id); owned.add(entity.id);
    spawned.set(entity.id, entity);
    return entity;
  }
  try {
    venue.reconcile(bodies);
    for (const solid of solids) spawn(solidView(solid), solid.id);
    for (const marker of markers) spawn({ ...marker, role: 'goal', marker: true,
      radius: marker.r || marker.radius || 8, alive: true }, `goal:${marker.id}`);
    for (const field of fields) {
      const def = FIELD_DEFS[field.defKey || field.kind] || {};
      const record = fieldsOwner?.registerEnvironmental?.({ ...def, ...field,
        id: `${id}:${field.id}`, createdAt: state.simTime,
        center: { x: anchor.x + (field.center?.x ?? field.x ?? 0),
          z: anchor.z + (field.center?.z ?? field.z ?? 0) },
      });
      if (!record) throw new Error(`${id}: physical field ${field.id} could not register`);
      fieldIds.push(record.id);
    }
  } catch (error) {
    venue.close();
    return { ok: false, reason: error.message };
  }
  state.physicsVenue = { id, active: true, returnPosition, sectorId: returnSector };
  return venue;
}

function pointClear(state, player, center, radius) {
  const clear = entity => {
    if (!entity || entity === player || entity.alive === false || entity.collides === false
        || !entity.pos || entity.data?.physicsVenueId) return true;
    const reach = radius + (entity.radius || 0);
    return (entity.pos.x - center.x) ** 2 + (entity.pos.z - center.z) ** 2 > reach * reach;
  };
  return (state.entityList || [...state.entities.values()]).every(clear)
    && (state.world?.asteroidField?.rocks || []).every(clear)
    && (state.world?.dressing?.rows || []).every(clear);
}

export function chooseClearVenueCenter(state, player, bodies, solids = [], markers = [], fields = []) {
  let radius = 100;
  for (const body of [...bodies, ...markers]) radius = Math.max(radius,
    Math.hypot(body.x || 0, body.z || 0) + (body.radius || body.r || 0) + 30);
  for (const solid of solids) radius = Math.max(radius,
    Math.hypot(solid.x ?? solid.x1 ?? 0, solid.z ?? solid.z1 ?? 0) + (solid.radius || 0) + 30,
    Math.hypot(solid.x ?? solid.x2 ?? 0, solid.z ?? solid.z2 ?? 0) + (solid.radius || 0) + 30);
  for (const field of fields) radius = Math.max(radius,
    Math.hypot(field.center?.x ?? field.x ?? 0, field.center?.z ?? field.z ?? 0) + (field.radius || 0) + 30);
  const bounds = state.world?.bounds;
  for (const distance of [0, 350, 650, 1000, 1400, 1900, 2600]) {
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8;
      const center = { x: player.pos.x + Math.cos(angle) * distance,
        z: player.pos.z + Math.sin(angle) * distance };
      if (bounds?.radius && Math.hypot(center.x - (bounds.center?.x || 0),
        center.z - (bounds.center?.z || 0)) + radius > bounds.radius) continue;
      if (pointClear(state, player, center, radius)) return center;
    }
  }
  return null;
}

function solidView(solid) {
  if (solid.kind !== 'segment') return { ...solid, role: solid.tag || 'bumper', mass: 1e8,
    hardware: true, alive: true, restitution: solid.restitution ?? 0.6 };
  const dx = solid.x2 - solid.x1, dz = solid.z2 - solid.z1;
  const half = Math.hypot(dx, dz) * 0.5;
  return { ...solid, x: (solid.x1 + solid.x2) * 0.5, z: (solid.z1 + solid.z2) * 0.5,
    radius: Math.hypot(half, 1), role: 'rail', mass: 1e8, hardware: true, alive: true,
    rot: Math.atan2(dz, dx), proxy: { schemaVersion: 1, id: `venue:${solid.id}`,
      referenceRadius: 'radius', primitives: [{ id: 'rail', kind: 'obb', x: 0, z: 0,
        hx: half / Math.hypot(half, 1), hz: 1 / Math.hypot(half, 1), angleDeg: 0 }] } };
}

export function venueEntitySpec(venueId, key, view, anchor) {
  const radius = Math.max(0.1, view.radius || 3);
  const mass = Math.max(0.1, view.mass || 10);
  return {
    type: view.marker ? 'beacon' : 'payload', name: `${view.marker ? 'GOAL' : view.role || key} · physical venue`, team: 2,
    factionId: 'faction_free', pos: { x: anchor.x + view.x, z: anchor.z + view.z },
    vel: { x: view.vx || 0, z: view.vz || 0 }, rot: view.rot || 0,
    radius, mass, hull: 100000, hullMax: 100000, collides: !view.marker,
    flags: { invuln: true }, collisionMask: 1 | 2 | 4 | 8 | 32 | 64 | 128,
    physicsBody: { schemaVersion: 1, dynamic: !view.marker, shape: 'ball', radius, mass,
      inertiaY: mass * radius * radius * 0.4, ccd: true,
      material: view.marker ? 'massline_sensor' : 'debris',
      useMeasuredSkin: false, impactDamageScale: 0,
      ...(view.proxy ? { collisionProxyManifest: view.proxy } : {}),
      contact: { restitution: view.restitution ?? 0.65, friction: 0.02, angularDamping: 0.6 } },
    data: { physicsVenueId: venueId, physicsVenueKey: key,
      venueAsset: view.hardware ? 'hardware' : 'mass',
      physicsVenueMarker: !!view.marker,
      galleryRole: view.role, gallerySpawnX: anchor.x + view.x, gallerySpawnZ: anchor.z + view.z,
      ai: { passive: true }, scannerSignalKind: 'anomaly',
      scanLabel: view.role === 'rail' ? 'BANK RAIL · rebound a payload' : `${view.role || key} · push or Massline` },
  };
}
