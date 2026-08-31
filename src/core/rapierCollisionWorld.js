// Optional Rapier collision observer backend.
//
// This adapter builds simple 2.5D sphere bodies for live collidable entities so Rapier can be
// toggled on for contact/CCD experiments. It uses dynamic/fixed rigid bodies only; SG-02 production
// authority is hosted by physics.js through sg02DynamicBodyOwner. Entities declaring a
// collisionProxyManifest (PQ-008) get the same bounded compound static collider set as the SG-02
// authority so observer contact experiments see the truthful silhouette.

export const PHYSICS_RUNTIME_SCHEMA_VERSION = 1;

import {
  expandProxyPrimitives,
  proxyObbHalfExtents,
  proxyScaleFor,
  resolveCollisionProxyManifest,
} from '../data/collisionProxyManifests.js';
import { resolveCraftProportions } from './sg02DynamicBodyOwner.js';
import { loadRapierCompatRuntime } from './rapierCompatRuntime.js';

export async function createRapierDynamicsWorld() {
  return createRapierCollisionWorld();
}

export async function createRapierCollisionWorld() {
  const RAPIER = await loadRapierCompatRuntime();

  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const eventQueue = new RAPIER.EventQueue(false);
  const bodies = new Map();
  const fixedDt = 1 / 60;
  let accumulator = 0;
  let collisionEvents = 0;
  let activeContacts = 0;

  function syncFromEntities(entities) {
    const live = new Set();
    for (const e of entities) {
      if (!e.alive || !e.collides || !(e.radius > 0)) continue;
      live.add(e.id);
      let rec = bodies.get(e.id);
      const ccdEnabled = wantsCcd(e);
      const dynamic = wantsDynamic(e);
      if (!rec || rec.dynamic !== dynamic) {
        if (rec) removeRecord(rec);
        rec = createRecord(e, dynamic, ccdEnabled);
        bodies.set(e.id, rec);
      } else if (Math.abs(rec.radius - e.radius) > 0.001) {
        if (Array.isArray(rec.colliders) && rec.colliders.length > 1) {
          // Compound proxy records cannot retune a single radius — rebuild the static set.
          removeRecord(rec);
          rec = createRecord(e, dynamic, ccdEnabled);
          bodies.set(e.id, rec);
        } else if (typeof rec.collider.setRadius === 'function') rec.collider.setRadius(e.radius);
        else if (typeof rec.collider.setShape === 'function') rec.collider.setShape(new RAPIER.Ball(e.radius));
        rec.radius = e.radius;
        rec.queryShape = new RAPIER.Ball(e.radius);
      }
      if (rec.ccdEnabled !== ccdEnabled) {
        if (typeof rec.body.enableCcd === 'function') rec.body.enableCcd(ccdEnabled);
        rec.ccdEnabled = ccdEnabled;
      }
      rec.body.setTranslation({ x: finite(e.pos && e.pos.x), y: 0, z: finite(e.pos && e.pos.z) }, true);
      rec.body.setRotation({ x: 0, y: Math.sin(finite(e.rot) * 0.5), z: 0, w: Math.cos(finite(e.rot) * 0.5) }, true);
      if (rec.dynamic) {
        rec.body.setLinvel({ x: finite(e.vel && e.vel.x), y: 0, z: finite(e.vel && e.vel.z) }, true);
        rec.body.setAngvel({ x: 0, y: finite(e.angVel), z: 0 }, true);
      }
    }

    for (const [id, rec] of bodies) {
      if (live.has(id)) continue;
      removeRecord(rec);
      bodies.delete(id);
    }
  }

  function step(dt) {
    accumulator += Math.min(Math.max(0, dt || 0), 0.1);
    while (accumulator >= fixedDt) {
      world.timestep = fixedDt;
      world.step(eventQueue);
      eventQueue.drainCollisionEvents(() => { collisionEvents++; });
      activeContacts = countContacts();
      accumulator -= fixedDt;
    }
  }

  function diagnostics() {
    let colliders = 0;
    for (const rec of bodies.values()) {
      colliders += Array.isArray(rec.colliders) && rec.colliders.length ? rec.colliders.length : 1;
    }
    return {
      bodies: bodies.size,
      colliders,
      timestep: fixedDt,
      ccd: true,
      ccdBodies: countCcdBodies(),
      contacts: activeContacts,
      collisionEvents,
    };
  }

  function dispose() {
    for (const rec of bodies.values()) {
      removeRecord(rec);
    }
    bodies.clear();
    if (eventQueue && typeof eventQueue.free === 'function') eventQueue.free();
    world.free();
  }

  return { syncFromEntities, step, diagnostics, dispose };

  function createRecord(e, dynamic, ccdEnabled) {
    const desc = (dynamic ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.fixed())
      .setTranslation(finite(e.pos && e.pos.x), 0, finite(e.pos && e.pos.z))
      .setRotation({ x: 0, y: Math.sin(finite(e.rot) * 0.5), z: 0, w: Math.cos(finite(e.rot) * 0.5) })
      .setCcdEnabled(ccdEnabled);
    if (dynamic) {
      desc
        .setLinvel(finite(e.vel && e.vel.x), 0, finite(e.vel && e.vel.z))
        .setAngvel({ x: 0, y: finite(e.angVel), z: 0 });
    }
    const body = world.createRigidBody(desc);
    const proxyManifest = resolveCollisionProxyManifest(e);
    const isCraft = e.type === 'ship' || e.type === 'drone';
    const colliderDescs = proxyManifest
      ? buildObserverProxyColliderDescs(e, proxyManifest)
      : (isCraft
        ? [buildObserverCraftCapsuleColliderDesc(e)]
        : [buildObserverBallColliderDesc(e.radius)]);
    const colliders = colliderDescs.map((colliderDesc) => world.createCollider(colliderDesc, body));
    const collider = colliders[0];
    return { body, collider, colliders, radius: e.radius, queryShape: new RAPIER.Ball(e.radius), ccdEnabled, dynamic };
  }

  function buildObserverCraftCapsuleColliderDesc(entity) {
    const proportions = resolveCraftProportions(entity);
    const R_ref = Number.isFinite(entity && entity.radius) && entity.radius > 0 ? entity.radius : 14;
    const length = Math.max(0.1, (proportions && proportions.length || 1.35) * R_ref);
    const halfWidth = Math.max(0.1, (proportions && proportions.halfWidth || 0.42) * R_ref);
    const capRadius = halfWidth;
    const halfHeight = Math.max(0, (length * 0.5) - capRadius);

    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, capRadius)
      .setRotation({ x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 })
      .setSensor(false)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    if (RAPIER.ActiveCollisionTypes && RAPIER.ActiveCollisionTypes.ALL != null) {
      colliderDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
    }
    return colliderDesc;
  }

  function buildObserverBallColliderDesc(radius) {
    const colliderDesc = RAPIER.ColliderDesc.ball(radius)
      .setSensor(false)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    if (RAPIER.ActiveCollisionTypes && RAPIER.ActiveCollisionTypes.ALL != null) {
      colliderDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
    }
    return colliderDesc;
  }

  // PQ-008 compound proxies for the observer backend: identical expansion/scale as the SG-02
  // authority so contact experiments see the same silhouette the production authority registers.
  function buildObserverProxyColliderDescs(entity, manifest) {
    const scale = proxyScaleFor(entity, manifest);
    const primitives = expandProxyPrimitives(manifest, { entity });
    const descs = [];
    for (const primitive of primitives) {
      let desc = null;
      if (primitive.kind === 'circle') {
        desc = RAPIER.ColliderDesc.ball(Math.max(0.01, primitive.r * scale))
          .setTranslation(primitive.x * scale, 0, primitive.z * scale);
      } else if (primitive.kind === 'capsule') {
        const ax = primitive.ax * scale;
        const az = primitive.az * scale;
        const dx = (primitive.bx - primitive.ax) * scale;
        const dz = (primitive.bz - primitive.az) * scale;
        const len = Math.hypot(dx, dz);
        const ux = len > 1e-9 ? dx / len : 1;
        const uz = len > 1e-9 ? dz / len : 0;
        desc = RAPIER.ColliderDesc.capsule(Math.max(0, len * 0.5), Math.max(0.01, primitive.r * scale))
          .setTranslation(ax + dx * 0.5, 0, az + dz * 0.5)
          .setRotation({ x: uz * Math.SQRT1_2, y: 0, z: -ux * Math.SQRT1_2, w: Math.SQRT1_2 });
      } else if (primitive.kind === 'obb') {
        const angle = (Number.isFinite(primitive.angleDeg) ? primitive.angleDeg : 0) * (Math.PI / 180);
        const halfExtents = proxyObbHalfExtents(entity, manifest, primitive, scale);
        desc = RAPIER.ColliderDesc.cuboid(
          Math.max(0.01, halfExtents.hx),
          Math.max(0.01, halfExtents.hy),
          Math.max(0.01, halfExtents.hz),
        )
          .setTranslation(primitive.x * scale, 0, primitive.z * scale)
          .setRotation({ x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) });
      }
      if (!desc) continue;
      desc.setSensor(false).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      if (RAPIER.ActiveCollisionTypes && RAPIER.ActiveCollisionTypes.ALL != null) {
        desc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
      }
      descs.push(desc);
    }
    if (!descs.length) return [buildObserverBallColliderDesc(entity.radius)];
    return descs;
  }

  function removeRecord(rec) {
    const colliders = Array.isArray(rec.colliders) && rec.colliders.length ? rec.colliders : [rec.collider];
    for (const collider of colliders) world.removeCollider(collider, false);
    world.removeRigidBody(rec.body);
  }

  function countContacts() {
    const pairs = new Set();
    const identity = { x: 0, y: 0, z: 0, w: 1 };
    for (const rec of bodies.values()) {
      const pos = rec.body.translation();
      world.intersectionsWithShape(
        pos,
        identity,
        rec.queryShape,
        (collider) => {
          const a = rec.collider.handle;
          const b = collider.handle;
          if (a === b) return true;
          // Sibling colliders of one compound body permanently overlap by construction — they are
          // not contacts. (Compare parent body handles, not collider handles.)
          if (typeof collider.parent === 'function' && collider.parent() === rec.body) return true;
          pairs.add(a < b ? `${a}:${b}` : `${b}:${a}`);
          return true;
        },
        undefined,
        undefined,
        rec.collider,
      );
    }
    return pairs.size;
  }

  function countCcdBodies() {
    let count = 0;
    for (const rec of bodies.values()) {
      if (typeof rec.body.isCcdEnabled === 'function') {
        if (rec.body.isCcdEnabled()) count++;
      } else if (rec.ccdEnabled) {
        count++;
      }
    }
    return count;
  }
}

function wantsCcd(e) {
  return e.type === 'projectile' || !!(e.flags && e.flags.boosting);
}

function wantsDynamic(e) {
  return e.type !== 'asteroid' && e.type !== 'station';
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
