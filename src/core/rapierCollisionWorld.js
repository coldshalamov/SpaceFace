// Optional Rapier collision observer backend.
//
// This adapter builds simple 2.5D sphere bodies for live collidable entities so Rapier can be
// toggled on for contact/CCD experiments. It uses dynamic/fixed rigid bodies only; SG-02 production
// authority is hosted by physics.js through sg02DynamicBodyOwner.

export const PHYSICS_RUNTIME_SCHEMA_VERSION = 1;

const RAPIER_COMPAT_INIT_WARNING = 'using deprecated parameters for the initialization function';
let rapierInitPromise = null;

export async function createRapierDynamicsWorld() {
  return createRapierCollisionWorld();
}

export async function createRapierCollisionWorld() {
  const mod = await import('@dimforge/rapier3d-compat');
  const RAPIER = mod.default || mod;
  await initRapierCompat(RAPIER);

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
        if (typeof rec.collider.setRadius === 'function') rec.collider.setRadius(e.radius);
        else if (typeof rec.collider.setShape === 'function') rec.collider.setShape(new RAPIER.Ball(e.radius));
        rec.radius = e.radius;
        rec.queryShape = new RAPIER.Ball(e.radius);
      }
      if (rec.ccdEnabled !== ccdEnabled) {
        if (typeof rec.body.enableCcd === 'function') rec.body.enableCcd(ccdEnabled);
        rec.ccdEnabled = ccdEnabled;
      }
      rec.body.setTranslation({ x: finite(e.pos && e.pos.x), y: 0, z: finite(e.pos && e.pos.z) }, true);
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
    return {
      bodies: bodies.size,
      colliders: bodies.size,
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
      .setCcdEnabled(ccdEnabled);
    if (dynamic) {
      desc
        .setLinvel(finite(e.vel && e.vel.x), 0, finite(e.vel && e.vel.z))
        .setAngvel({ x: 0, y: finite(e.angVel), z: 0 });
    }
    const colliderDesc = RAPIER.ColliderDesc.ball(e.radius)
      .setSensor(false)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    if (RAPIER.ActiveCollisionTypes && RAPIER.ActiveCollisionTypes.ALL != null) {
      colliderDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
    }
    const body = world.createRigidBody(desc);
    const collider = world.createCollider(colliderDesc, body);
    return { body, collider, radius: e.radius, queryShape: new RAPIER.Ball(e.radius), ccdEnabled, dynamic };
  }

  function removeRecord(rec) {
    world.removeCollider(rec.collider, false);
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

async function initRapierCompat(RAPIER) {
  if (!RAPIER || typeof RAPIER.init !== 'function') return;
  if (!rapierInitPromise) {
    rapierInitPromise = runRapierInitWithFilteredWarning(RAPIER).catch((err) => {
      rapierInitPromise = null;
      throw err;
    });
  }
  await rapierInitPromise;
}

async function runRapierInitWithFilteredWarning(RAPIER) {
  if (typeof console === 'undefined' || typeof console.warn !== 'function') {
    await RAPIER.init();
    return;
  }

  const originalWarn = console.warn;
  console.warn = (...args) => {
    const text = args.map(String).join(' ');
    if (text.includes(RAPIER_COMPAT_INIT_WARNING)) return;
    originalWarn.apply(console, args);
  };

  try {
    await RAPIER.init();
  } finally {
    console.warn = originalWarn;
  }
}
