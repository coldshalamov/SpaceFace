import test from 'node:test';
import assert from 'node:assert/strict';

// PQ-195.01 residual (PQ-195.01-REPORT.md): on the legacy custom backend `maskOf(fx)=0`
// made authored-mask steel broadphase-invisible — ghost-solid, rounds through, pairs never
// formed. The fix: maskOf's default branch honors an AUTHORED collisionMask on the legacy
// pair paths only. The default `rapier-dynamic` route must stay byte-identical: the shared
// projectile sweep keeps reading the shipped values there (the live solver owns the bodies).
import { core } from '../src/core/coreSystem.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { Masks } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';

const DT = 1 / 60;
let staticVersion = 710; // per-test salt: the physics singleton's projectile broadphase folds its static layer on version equality

function bootCore(seed, backend) {
  const state = createGameState(seed);
  state.settings.gameplay.physicsBackend = backend;
  const bus = createBus();
  core.init({ state, bus, helpers: {} });
  physics.init({ state, bus, helpers: {} });
  return {
    state,
    bus,
    cleanup() {
      core.destroy();
      bus.clear();
    },
  };
}

// The exact authored shape of world/heist steel: an unlisted custom type carrying an
// explicit collisionMask over a fixed prop body (src/systems/world.js POIs,
// src/systems/heistFacilities.js custody/wall steel).
function spawnSteel(state, { x = 0, mask = Masks.STATION } = {}) {
  const steel = {
    id: 975001, type: 'fx', alive: true, collides: true,
    ...(mask != null ? { collisionMask: mask } : {}),
    pos: { x, z: 0 }, prevPos: { x, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, radius: 40, mass: 1e6, hull: 1e9, hullMax: 1e9,
    ownerId: null, team: 2, ttl: Infinity,
    physicsBody: { dynamic: false, material: 'prop' },
    data: {},
  };
  state.entityList.push(steel);
  return steel;
}

// DEFAULT_MASK.projectile (SHIP|ASTEROID|STATION) — a real round's mask.
function spawnProjectile(state) {
  const proj = {
    id: 975002, type: 'projectile', alive: true, collides: true,
    collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.STATION,
    pos: { x: -400, z: 0 }, prevPos: { x: -400, z: 0 },
    vel: { x: 300, z: 0 }, rot: Math.PI / 2, radius: 1,
    ownerId: 975100, team: 1, ttl: Infinity,
    data: { damage: 5, weaponId: 'test' },
  };
  state.entityList.push(proj);
  return proj;
}

function driveProjectileSweep(state, ticks) {
  const proj = state.entityList.find((e) => e.type === 'projectile');
  for (let tick = 0; tick < ticks && proj.alive; tick++) {
    proj.prevPos.x = proj.pos.x;
    proj.prevPos.z = proj.pos.z;
    proj.pos.x += proj.vel.x * DT;
    proj.pos.z += proj.vel.z * DT;
    physics.sweepProjectiles(DT, state);
  }
  return proj;
}

test('custom backend: a round stops on custom-typed steel whose authored mask admits it', () => {
  staticVersion += 10;
  const t = bootCore(97501, 'custom');
  try {
    const steel = spawnSteel(t.state, { mask: Masks.STATION });
    const proj = spawnProjectile(t.state);
    t.state.entityIndex = {
      __spacefaceEntityIndexV1: true,
      ready: true,
      spatialStatics: [steel],
      spatialDynamics: [proj],
      spatialStaticVersion: staticVersion,
      spatialDynamicsVersion: 3,
      projectiles: [proj],
      collidables: [steel, proj],
    };
    t.state.spatialHash.rebuild([steel, proj]);
    const hits = [];
    t.bus.on('projectile:hit', (payload) => hits.push(payload));
    driveProjectileSweep(t.state, 120);
    assert.equal(proj.alive, false, 'the round dies on the authored-mask steel');
    assert.equal(hits.length, 1, 'projectile:hit emitted exactly once');
    assert.equal(hits[0].targetId, steel.id, 'the hit target is the steel');
    assert.ok(proj.pos.x < 0 && proj.pos.x > -80, `round stopped at the hull face (x=${proj.pos.x.toFixed(2)})`);
  } finally {
    t.cleanup();
  }
});

test('custom backend: a ship pairs against custom-typed steel instead of floating through', () => {
  staticVersion += 10;
  const t = bootCore(97502, 'custom');
  try {
    const steel = spawnSteel(t.state, { mask: Masks.STATION });
    // DEFAULT_MASK.ship
    const ship = {
      id: 975003, type: 'ship', alive: true, collides: true,
      collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE | Masks.PICKUP,
      pos: { x: -300, z: 0 }, prevPos: { x: -300, z: 0 }, vel: { x: 60, z: 0 },
      rot: Math.PI / 2, radius: 14, mass: 120, hull: 100, hullMax: 100,
      team: 1, ttl: Infinity,
      data: { defId: 'ship_kestrel' },
    };
    t.state.entityList.push(ship);
    t.state.entityIndex = {
      __spacefaceEntityIndexV1: true,
      ready: true,
      spatialStatics: [steel],
      spatialDynamics: [ship],
      spatialStaticVersion: staticVersion,
      spatialDynamicsVersion: 3,
      collidables: [steel, ship],
    };
    t.state.spatialHash.rebuild([steel, ship]);
    // Integrate is the other half of the legacy update step; collide is the changed gate.
    for (let tick = 0; tick < 600; tick++) {
      ship.prevPos.x = ship.pos.x;
      ship.prevPos.z = ship.pos.z;
      ship.pos.x += ship.vel.x * DT;
      ship.pos.z += ship.vel.z * DT;
      physics.collide(DT, t.state);
    }
    // Contact surface sits at x = -(40 + 14) = -54; the pair gate must stop the hull there.
    assert.ok(ship.pos.x < -30, `ship never crossed the steel center (x=${ship.pos.x.toFixed(2)})`);
    assert.ok(ship.pos.x > -150, `ship actually reached the steel (x=${ship.pos.x.toFixed(2)})`);
  } finally {
    t.cleanup();
  }
});

test('custom backend: an unlisted type with NO authored mask keeps the legacy 0 (ghost)', () => {
  staticVersion += 10;
  const t = bootCore(97503, 'custom');
  try {
    spawnSteel(t.state, { mask: null }); // no collisionMask authored at all
    const proj = spawnProjectile(t.state);
    t.state.entityIndex = {
      __spacefaceEntityIndexV1: true,
      ready: true,
      spatialStatics: [t.state.entityList[0]],
      spatialDynamics: [proj],
      spatialStaticVersion: staticVersion,
      spatialDynamicsVersion: 3,
      projectiles: [proj],
      collidables: [t.state.entityList[0], proj],
    };
    t.state.spatialHash.rebuild([t.state.entityList[0], proj]);
    const hits = [];
    t.bus.on('projectile:hit', (payload) => hits.push(payload));
    driveProjectileSweep(t.state, 120);
    assert.equal(hits.length, 0, 'no pair forms against an unauthored custom type');
    assert.equal(proj.alive, true, 'the round passes straight through');
    assert.ok(proj.pos.x > 80, `round cleared the ghost steel (x=${proj.pos.x.toFixed(2)})`);
  } finally {
    t.cleanup();
  }
});

test('rapier-dynamic route: the shared projectile sweep reads the shipped values (no authored honoring)', () => {
  staticVersion += 10;
  const t = bootCore(97504, 'rapier-dynamic');
  try {
    spawnSteel(t.state, { mask: Masks.STATION });
    const proj = spawnProjectile(t.state);
    t.state.entityIndex = {
      __spacefaceEntityIndexV1: true,
      ready: true,
      spatialStatics: [t.state.entityList[0]],
      spatialDynamics: [proj],
      spatialStaticVersion: staticVersion,
      spatialDynamicsVersion: 3,
      projectiles: [proj],
      collidables: [t.state.entityList[0], proj],
    };
    t.state.spatialHash.rebuild([t.state.entityList[0], proj]);
    const hits = [];
    t.bus.on('projectile:hit', (payload) => hits.push(payload));
    driveProjectileSweep(t.state, 120);
    assert.equal(hits.length, 0, 'no authored-mask honoring on the default route');
    assert.equal(proj.alive, true, 'the round is not eaten by the sweep on the default route');
    assert.ok(proj.pos.x > 80, `round cleared the steel (x=${proj.pos.x.toFixed(2)})`);
  } finally {
    t.cleanup();
  }
});
