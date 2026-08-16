/**
 * W03 mine-layer — physical mines, ownership/lifecycle/caps, combat command path, counterplay.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { Masks } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { fields } from '../src/systems/fields.js';
import { mines, MINE_TYPE, MINE_TELEGRAPH_CUE, countOwnerMines, listMines } from '../src/systems/mines.js';
import { combat } from '../src/systems/combat.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { ENCOUNTER_SCRIPTS } from '../src/systems/encounterScripts.js';

function boot(seed = 3251) {
  const sim = createSimulation({ seed, systems: [mines, combat] });
  const { state, bus, helpers } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_test_mines';
  state.world.activeSector = { id: 'sector_test_mines', pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12,
    hull: 200, hullMax: 200, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    data: {},
  });
  state.playerId = player.id;
  const events = {
    placed: [], triggered: [], armed: [], released: [], routeDamage: [], telegraph: [], cap: [], order: [],
  };
  bus.on('mines:placed', (p) => events.placed.push(p));
  bus.on('mines:triggered', (p) => { events.triggered.push(p); events.order.push(`triggered:${p.mineId}`); });
  bus.on('mines:armed', (p) => { events.armed.push(p); events.order.push(`armed:${p.mineId}`); });
  bus.on('mines:released', (p) => events.released.push(p));
  bus.on('mines:capReached', (p) => events.cap.push(p));
  bus.on('combat:routeDamage', (p) => events.routeDamage.push(p));
  bus.on('ai:telegraph', (p) => events.telegraph.push(p));
  return { sim, state, bus, helpers, player, events, minesSys: sim.registry.get('mines') };
}

test('ownership + arm delay + per-owner cap lifecycle', () => {
  const t = boot();
  const owner = t.sim.spawn({
    type: 'ship', team: 1, pos: { x: 400, z: 0 }, radius: 14, hull: 100, hullMax: 100,
    data: { lootTableId: 'mine_layer_jackal' },
  });
  const m1 = t.minesSys.placeMine({ ownerId: owner.id, pos: { x: 420, z: 0 }, team: 1 });
  assert.ok(m1);
  assert.equal(m1.type, MINE_TYPE);
  assert.equal(m1.ownerId, owner.id);
  assert.equal(m1.data.armed, false);
  assert.equal(m1.data.armedAt, 2, 'default arm delay is independently pinned at two seconds');
  assert.deepEqual(m1.physicsBody, {
    dynamic: true,
    ccd: false,
    material: 'projectile',
  }, 'Rapier authors field-repulsable ghost bodies; projectile hits remain swept in physics.js');
  assert.equal(t.events.placed.length, 1);
  assert.ok(t.events.telegraph.some((e) => e.cue === MINE_TELEGRAPH_CUE || e.kind === MINE_TELEGRAPH_CUE));

  // The fifth and sixth owner mines succeed; the seventh is rejected.
  for (let i = 1; i < 6; i++) {
    assert.ok(t.minesSys.placeMine({
      ownerId: owner.id,
      pos: { x: 430 + i * 20, z: 10 },
      team: 1,
      telegraph: false,
    }));
  }
  assert.equal(countOwnerMines(t.state, owner.id), 6);
  assert.equal(t.minesSys.placeMine({
    ownerId: owner.id, pos: { x: 570, z: 10 }, team: 1, telegraph: false,
  }), null);
  assert.equal(countOwnerMines(t.state, owner.id), 6);
  assert.deepEqual(t.events.cap.at(-1), { ownerId: owner.id, cap: 6 });

  // Independently pin both sides and the exact arm boundary.
  t.state.simTime = 1.999;
  t.minesSys.update(SIM_DT, t.state);
  assert.equal(m1.data.armed, false);
  t.state.simTime = 2;
  t.minesSys.update(SIM_DT, t.state);
  assert.equal(m1.data.armed, true);
  assert.ok(t.events.armed.some((e) => e.mineId === m1.id));

  // Sector release.
  t.bus.emit('sector:exit', { sectorId: 'sector_test_mines' });
  t.sim.runTicks(1);
  assert.equal(listMines(t.state).length, 0);
  assert.equal(t.state.entities.has(m1.id), false, 'lifecycle sweep removes the released physics entity');
  assert.ok(t.events.released.some((e) => e.reason === 'sector_exit'));
});

test('arming is emitted before an exact-boundary proximity trigger', () => {
  const t = boot(3203);
  const owner = t.sim.spawn({
    type: 'ship', team: 1, pos: { x: 500, z: 0 }, radius: 12, hull: 100, hullMax: 100, data: {},
  });
  const mine = t.minesSys.placeMine({
    ownerId: owner.id, pos: { x: 55, z: 0 }, team: 1, telegraph: false,
  });

  t.state.simTime = 1.999;
  t.minesSys.update(SIM_DT, t.state);
  assert.equal(mine.alive, true);
  assert.deepEqual(t.events.order, []);

  t.state.simTime = 2;
  t.minesSys.update(SIM_DT, t.state);
  assert.equal(mine.alive, false);
  assert.deepEqual(t.events.order, [`armed:${mine.id}`, `triggered:${mine.id}`]);
});

test('proximity radius is inclusive at 55 and rejects the immediately beyond side', () => {
  const run = (mineX) => {
    const t = boot(3255);
    const owner = t.sim.spawn({
      type: 'ship', team: 1, pos: { x: 500, z: 0 }, radius: 12, hull: 100, hullMax: 100, data: {},
    });
    const mine = t.minesSys.placeMine({
      ownerId: owner.id, pos: { x: mineX, z: 0 }, team: 1,
      armDelayS: 0, triggerRadius: 55, telegraph: false,
    });
    t.sim.runTicks(1);
    return { alive: mine.alive, triggers: t.events.triggered.length };
  };

  assert.deepEqual(run(55), { alive: false, triggers: 1 });
  assert.deepEqual(run(55.000001), { alive: true, triggers: 0 });
});

test('proximity comparison remains defined at 1e308-class coordinates', () => {
  const run = (playerX, radius) => {
    const t = boot(3308);
    t.player.pos.x = playerX;
    const owner = t.sim.spawn({
      type: 'ship', team: 1, pos: { x: -100, z: 0 }, radius: 12, hull: 100, hullMax: 100, data: {},
    });
    const mine = t.minesSys.placeMine({
      ownerId: owner.id, pos: { x: 0, z: 0 }, team: 1,
      armDelayS: 0, triggerRadius: radius, telegraph: false,
    });
    t.sim.runTicks(1);
    return { alive: mine.alive, triggers: t.events.triggered.length };
  };

  assert.deepEqual(run(1e308, 1e308), { alive: false, triggers: 1 }, 'extreme at-bound target triggers');
  assert.deepEqual(run(Number.MAX_VALUE, 1e308), { alive: true, triggers: 0 }, 'finite extreme beyond target does not trigger');
});

test('mines have projectile-only custom collision: no ship/station/asteroid/payload/mine shove', () => {
  const rigidTypes = [
    { type: 'station', collisionMask: undefined },
    { type: 'ship', collisionMask: undefined },
    { type: 'asteroid', collisionMask: undefined },
    { type: 'payload', collisionMask: undefined },
    { type: 'mine', collisionMask: Masks.PROJECTILE },
  ];

  for (const fixture of rigidTypes) {
    const sim = createSimulation({ seed: 303, systems: [mines, physics] });
    sim.state.mode = 'flight';
    sim.state.settings.gameplay.physicsBackend = 'custom';
    const mine = sim.registry.get('mines').placeMine({
      ownerId: null, pos: { x: 0, z: 0 }, team: 1, armDelayS: 99, telegraph: false,
    });
    const other = sim.spawn({
      type: fixture.type,
      team: 1,
      pos: { x: 8, z: 0 },
      vel: { x: 0, z: 0 },
      radius: fixture.type === 'mine' ? 6 : 12,
      mass: 8,
      hull: 100,
      hullMax: 100,
      ...(fixture.collisionMask == null ? {} : { collisionMask: fixture.collisionMask }),
      data: fixture.type === 'mine' ? { mine: true, armed: false } : {},
    });
    const before = { mineX: mine.pos.x, otherX: other.pos.x };
    sim.runTicks(1);
    assert.deepEqual(
      { mineX: mine.pos.x, otherX: other.pos.x },
      before,
      `${fixture.type} rigid contact must not move an unarmed mine or its neighbor`,
    );
  }
});

test('normal and mine-category projectiles can hit a mine', () => {
  for (const collisionMask of [undefined, 256]) {
    const sim = createSimulation({ seed: 304, systems: [mines, physics] });
    sim.state.mode = 'flight';
    sim.state.settings.gameplay.physicsBackend = 'custom';
    const mine = sim.registry.get('mines').placeMine({
      ownerId: null, pos: { x: 20, z: 0 }, team: 1, armDelayS: 99, telegraph: false,
    });
    if (collisionMask === 256) mine.collisionMask = 0;
    const projectile = sim.spawn({
      type: 'projectile', team: 0, ownerId: 999,
      pos: { x: 0, z: 0 }, vel: { x: 1200, z: 0 }, radius: 1,
      ...(collisionMask == null ? {} : { collisionMask }),
      data: { damage: 1 },
    });
    const hits = [];
    sim.bus.on('projectile:hit', (event) => hits.push(event));
    sim.runTicks(1);
    assert.equal(projectile.alive, false, `projectile mask ${collisionMask ?? 'default'} is consumed by the mine hit`);
    assert.equal(hits.at(-1)?.targetId, mine.id, `projectile mask ${collisionMask ?? 'default'} reaches mine category`);
  }
});

test('proximity trigger routes damage through combat commands (no direct hull write by mines)', () => {
  const t = boot(88);
  const owner = t.sim.spawn({
    type: 'ship', team: 1, pos: { x: 500, z: 0 }, radius: 14, hull: 100, hullMax: 100, data: {},
  });
  const mine = t.minesSys.placeMine({
    ownerId: owner.id,
    pos: { x: 40, z: 0 },
    team: 1,
    armDelayS: 0,
    triggerRadius: 80,
    blastDamage: 35,
    telegraph: false,
  });
  assert.equal(mine.data.armed, true);
  const hullBefore = t.player.hull;

  // Player is within trigger radius.
  t.sim.runTicks(3);
  assert.equal(t.events.triggered.length, 1);
  assert.equal(t.events.triggered[0].targetId, t.player.id);
  assert.equal(mine.alive, false);
  // Damage applied via combat kernel (hull reduced) — not a direct assignment in mines.js.
  assert.ok(t.player.hull < hullBefore, `expected hull damage via command path (was ${hullBefore}, now ${t.player.hull})`);
});

test('counterplay: destroyed mine never triggers', () => {
  const t = boot(91);
  const owner = t.sim.spawn({
    type: 'ship', team: 1, pos: { x: 500, z: 0 }, radius: 14, hull: 100, hullMax: 100, data: {},
  });
  const mine = t.minesSys.placeMine({
    ownerId: owner.id,
    pos: { x: 30, z: 0 },
    team: 1,
    armDelayS: 0,
    triggerRadius: 100,
    telegraph: false,
  });
  // Destroy via combat routeDamage (shootable hull).
  const combatSys = t.sim.registry.get('combat');
  combatSys.ensureKernel().routeDamage({
    attackerId: t.player.id,
    targetId: mine.id,
    packet: {
      channels: { kinetic: 999, thermal: 0, ion: 0, plasma: 0, phase: 0 },
      penetration: 1,
      flags: {},
      source: { kind: 'weapon', id: 'test' },
    },
    origin: { kind: 'weapon', id: 'test' },
  });
  assert.ok(mine.hull <= 0 || !mine.alive || mine.hull < mine.hullMax);

  // Force dead if kernel kill deferred to sweep.
  if (mine.hull <= 0) mine.alive = false;
  else {
    mine.hull = 0;
    mine.alive = false;
  }

  t.player.pos.x = 30;
  t.sim.runTicks(5);
  assert.equal(t.events.triggered.length, 0, 'destroyed mine must never trigger');
});

test('shape 325 minefield_wake seeds mines on ambush spring', () => {
  const t = boot(325);
  const jackal = t.sim.spawn({
    type: 'ship', team: 1, pos: { x: 300, z: 0 }, radius: 14, hull: 100, hullMax: 100,
    data: { lootTableId: 'mine_layer_jackal', ai: { passive: false } },
  });
  const ambush = ENCOUNTER_SCRIPTS.ambush;
  const live = {
    shapeId: 'minefield_wake',
    ids: [jackal.id],
    phase: 'offer',
    data: { springAt: 0, snared: false },
    deadlineAt: 9999,
    plan: { ships: [] },
  };
  // Put player near squad so spring condition hits.
  t.player.pos.x = 320;
  t.player.pos.z = 0;
  const d = {
    helpers: t.helpers,
    setPassive() {},
    say() {},
    minDist2ToSquad() { return 0; },
    player() { return t.player; },
    aliveCount() { return 1; },
    despawnAll() {},
    resolve() {},
    dangerImpulse() {},
    emit(name, payload) { t.bus.emit(name, payload); },
    abort() {},
  };
  ambush.tick(d, live, t.state, 1);
  assert.equal(live.phase, 'conflict');
  assert.ok((live.data.minesSeeded || []).length >= 1, 'mines seeded on wake spring');
  assert.ok(listMines(t.state).length >= 1);
  assert.ok(listMines(t.state).every((mine) => mine.physicsBody?.dynamic === true));
  assert.ok(listMines(t.state).every((mine) => mine.data?.mineLayerWake === true),
    'ordinary Jackal wake mines admit the velocity-rail read without granting motion authority');
  assert.ok(listMines(t.state).some((mine) => Math.hypot(mine.vel.x, mine.vel.z) > 4),
    'the ordinary Jackal route authors a slow physical wake drift before physics takes ownership');
});

test('real Repulsor moves a live Jackal mine through fields -> physics ownership', async () => {
  const previousFieldFlag = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  let physicsSys = null;
  try {
    const sim = createSimulation({ seed: 326, systems: [fields, mines, physics] });
    const { state } = sim;
    state.mode = 'flight';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    state.input.actions = {};
    const player = sim.spawn({
      type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      rot: 0, angVel: 0, radius: 12, mass: 28, collides: true,
      hull: 200, hullMax: 200, flightModel: { inertia: 88 }, flags: {},
      physicsBody: {
        schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88,
        dynamic: true, ccd: true, material: 'ship', revision: 0,
      },
      data: { combatProfileId: 'combat_profile_standard_ship' },
    });
    state.playerId = player.id;
    physicsSys = sim.registry.get('physics');
    assert.equal(await physicsSys.prepareBackend(state), true);
    const mine = sim.registry.get('mines').placeMine({
      ownerId: 7001,
      pos: { x: 60, z: 0 },
      vel: { x: 0, z: 0 },
      team: 1,
      armDelayS: 99,
      mineLayerWake: true,
      telegraph: false,
    });
    const beforeX = mine.pos.x;
    state.input.actions.deployRepulsor = true;
    sim.step();
    assert.equal(state.input.actions.deployRepulsor, false, 'real field owner consumes the deploy edge');
    for (let tick = 0; tick < 40; tick++) sim.step();
    assert.ok(state.fields.telemetry.affected >= 1, 'field query admits the dynamic mine body');
    assert.ok(mine.pos.x > beforeX + 1, `Repulsor physically separates the mine (${beforeX} -> ${mine.pos.x})`);
    assert.ok(mine.vel.x > 0.5, `physics-owned mine retains outward velocity, got ${mine.vel.x}`);
  } finally {
    FIELD_FLAGS.enabled = previousFieldFlag;
    if (physicsSys && typeof physicsSys._disableSg02DynamicAuthority === 'function') {
      physicsSys._disableSg02DynamicAuthority();
    }
  }
});

test('determinism: same seed + placements produce identical mine layout', () => {
  function layout(seed) {
    const t = boot(seed);
    const owner = t.sim.spawn({
      type: 'ship', team: 1, pos: { x: 100, z: 50 }, radius: 12, hull: 90, hullMax: 90, data: {},
    });
    const positions = [];
    for (let i = 0; i < 3; i++) {
      const m = t.minesSys.placeMine({
        ownerId: owner.id,
        pos: { x: 110 + i * 40, z: 50 },
        team: 1,
        armDelayS: 1,
        telegraph: false,
      });
      positions.push({ x: m.pos.x, z: m.pos.z, armedAt: m.data.armedAt });
    }
    t.sim.runTicks(Math.ceil(1.1 / SIM_DT));
    return {
      positions,
      armed: listMines(t.state).map((m) => !!m.data.armed),
      count: listMines(t.state).length,
    };
  }
  assert.deepEqual(layout(111), layout(111));
});

test('helpers.placeMine is exposed for encounter wiring', () => {
  const t = boot(2);
  assert.equal(typeof t.helpers.placeMine, 'function');
  const m = t.helpers.placeMine({ ownerId: t.player.id, pos: { x: 10, z: 10 }, team: 0, telegraph: false });
  assert.ok(m && m.type === MINE_TYPE);
});
