// Optional Rapier collision observer backend.
//
// The production ship controller remains custom/deterministic. This adapter builds simple 2.5D
// sphere proxies for live collidable entities so Rapier can be toggled on for contact/CCD
// experiments without taking ownership of starship handling or transforms.

const RAPIER_COMPAT_INIT_WARNING = 'using deprecated parameters for the initialization function';
let rapierInitPromise = null;

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
      if (!rec) {
        const desc = RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(e.pos.x, 0, e.pos.z)
          .setCcdEnabled(ccdEnabled);
        const colliderDesc = RAPIER.ColliderDesc.ball(e.radius)
          .setSensor(false)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
        if (RAPIER.ActiveCollisionTypes && RAPIER.ActiveCollisionTypes.ALL != null) {
          colliderDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
        }
        const body = world.createRigidBody(desc);
        const collider = world.createCollider(colliderDesc, body);
        rec = { body, collider, radius: e.radius, queryShape: new RAPIER.Ball(e.radius), ccdEnabled };
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
      rec.body.setNextKinematicTranslation({ x: e.pos.x, y: 0, z: e.pos.z });
    }

    for (const [id, rec] of bodies) {
      if (live.has(id)) continue;
      world.removeCollider(rec.collider, false);
      world.removeRigidBody(rec.body);
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
      world.removeCollider(rec.collider, false);
      world.removeRigidBody(rec.body);
    }
    bodies.clear();
    if (eventQueue && typeof eventQueue.free === 'function') eventQueue.free();
    world.free();
  }

  return { syncFromEntities, step, diagnostics, dispose };

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
