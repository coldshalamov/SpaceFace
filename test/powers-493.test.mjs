// Row 493 (CRAFT-POWERS): holding a power's key outlines every body letting go will move, with its
// predicted path, in that power's colour. These tests hold the preview to the owners' truth — the
// prediction against the real release — and to being read-only.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { fields, radialFieldDeployCenter } from '../src/systems/fields.js';
import { physics } from '../src/core/physics.js';
import { bombs } from '../src/systems/bombs.js';
import { FIELD_DEFS, FIELD_FLAGS } from '../src/data/fields.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { massSeedLaunchPlan } from '../src/systems/massSeed.js';
import {
  BOMB_PROPULSION_DIALS as systemChargeDials,
  chargeThrowPlan as systemChargeThrowPlan,
} from '../src/systems/impulseCharges.js';
import {
  BOMB_PROPULSION_DIALS as previewChargeDials,
  chargeThrowPlan as previewChargeThrowPlan,
} from '../src/data/impulseChargeReadModel.js';
import { getAsteroidFieldRock, insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { POWER_VERBS, setHeldPower } from '../src/systems/powerVerbs.js';
import {
  POWER_PREVIEW_RANGE, POWER_PREVIEW_TINT, powerHeld, powerPreviewPlan,
} from '../src/data/powerPreview.js';

function withFields(fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const done = () => { FIELD_FLAGS.enabled = prev; };
  try {
    const out = fn();
    if (out && typeof out.then === 'function') return out.finally(done);
    done();
    return out;
  } catch (err) {
    done();
    throw err;
  }
}

function boot({ withPhysics = false } = {}) {
  const sim = createSimulation({ seed: 4930, bus: createBus(), systems: withPhysics ? [fields, physics] : [fields] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  return { sim, state, player };
}

function body(sim, x, z, { mass = 2, type = 'wreck', radius = 4, team = 9 } = {}) {
  return sim.spawn({
    type, team, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius, collides: true,
    hull: 40, hullMax: 40,
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: 4, dynamic: true, ccd: false, material: 'debris', revision: 0 },
    data: { majorDebris: true },
  });
}

test('charge deployment and preview keep one canonical read-only plan binding', () => {
  assert.strictEqual(previewChargeThrowPlan, systemChargeThrowPlan);
  assert.strictEqual(previewChargeDials, systemChargeDials);

  const state = {
    input: { actions: {}, aimAngle: Math.PI / 3 },
    player: { activeShipIndex: 0, ownedShips: [{ fittings: [] }], researchedNodes: [] },
    entities: new Map(),
  };
  const player = { pos: { x: 4, z: -3 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12 };
  assert.deepEqual(previewChargeThrowPlan(state, player), systemChargeThrowPlan(state, player));
});

const ids = (plan) => plan.moves.map((m) => m.id);

test('every power has its own tint and a reach; powerHeld reads the input grip, then a held flag', () => {
  for (const p of POWER_VERBS) {
    assert.ok(POWER_PREVIEW_TINT[p], `tint for ${p}`);
    assert.ok(POWER_PREVIEW_RANGE[p] > 0, `reach for ${p}`);
  }
  assert.equal(new Set(Object.values(POWER_PREVIEW_TINT)).size, 5, 'one colour each');
  const state = { input: { actions: {} } };
  assert.equal(powerHeld(state), null);
  setHeldPower(state, 'pin');
  assert.equal(powerHeld(state), 'pin', 'input.js publishes the newest grip');
  setHeldPower(state, null);
  state.input.actions.pull = { held: true };
  assert.equal(powerHeld(state), 'pull', 'a merged held flag still reads');
  assert.equal(powerPreviewPlan(state, 'pull'), null, 'no ship, no plan');
});

test('a Pull predicts where each body its well moves will be, and the release puts them there', async () => {
  await withFields(async () => {
    const t = boot({ withPhysics: true });
    t.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const physicsSys = t.sim.registry.get('physics');
    assert.equal(await physicsSys.prepareBackend(t.state), true, 'rapier-dynamic headless');
    try {
      // Two loose bodies far apart in the ring (no collision inside the window), one outside it.
      const a = body(t.sim, 230, -60, { mass: 2 });
      const b = body(t.sim, 150, 90, { mass: 6 });
      const outside = body(t.sim, 460, 0, { mass: 2 });
      for (let i = 0; i < 3; i++) t.sim.step();
      t.state.input.aimWorld = { x: 210, z: 0 };
      const plan = powerPreviewPlan(t.state, 'pull', { registry: t.sim.registry });
      assert.equal(plan.power, 'pull');
      assert.equal(plan.tint, 'amber');
      assert.equal(plan.blocked, null);
      const centre = radialFieldDeployCenter('well', t.player, t.state);
      assert.deepEqual(plan.center, centre, 'the preview places the well where the press will');
      assert.deepEqual(plan.areas[0], { kind: 'ring', role: 'field', x: centre.x, z: centre.z, r: FIELD_DEFS.well.radius });
      assert.ok(ids(plan).includes(a.id) && ids(plan).includes(b.id));
      assert.ok(!ids(plan).includes(outside.id), 'a body outside the ring is not outlined');
      assert.ok(!ids(plan).includes(t.player.id), 'the pilot flies their own ship');

      t.state.input.actions.deployWell = true;
      const steps = 48; // 0.8 s: path point 8 (one per 0.1 s)
      for (let i = 0; i < steps; i++) { t.sim.step(); t.state.input.actions.deployWell = false; }
      const deployed = (t.state.fields.snapshot || []).find((f) => f.kind === 'well');
      assert.ok(deployed, 'the release deployed the well');
      assert.ok(Math.hypot(deployed.center.x - centre.x, deployed.center.z - centre.z) < 1e-9);
      for (const e of [a, b]) {
        const m = plan.moves.find((row) => row.id === e.id);
        const px = m.path[16], pz = m.path[17];
        const moved = Math.hypot(e.pos.x - m.x, e.pos.z - m.z);
        const err = Math.hypot(e.pos.x - px, e.pos.z - pz);
        assert.ok(moved > 10, `body ${e.id} really moved (${moved.toFixed(1)} WU)`);
        assert.ok(err < 1.5, `body ${e.id}: predicted within 1.5 WU of the real release (off by ${err.toFixed(2)})`);
      }
    } finally {
      if (typeof physicsSys._disableSg02DynamicAuthority === 'function') physicsSys._disableSg02DynamicAuthority();
    }
  });
});

test('a dropped drift bomb previews the craft that sets it off, where it goes off, and every shove', () => {
  const state = createGameState(47);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  const player = { id: 1, type: 'ship', alive: true, team: 0, mass: 32, radius: 6, rot: 0, pos: { x: 0, z: 0 }, vel: { x: 60, z: 0 } };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const impulses = [];
  const detonated = [];
  bus.on('bombs:detonated', (p) => detonated.push({ ...p, t: state.simTime }));
  let nextId = 50;
  const system = Object.create(bombs);
  system.init({
    state, bus,
    helpers: {
      spawnEntity(spec) {
        const e = { id: nextId++, alive: true, hull: 1, hullMax: 1, ...spec };
        state.entities.set(e.id, e); state.entityList.push(e); return e;
      },
      routeCombatDamage() { return { ok: true }; },
      combatPhysics: { applyImpulse(req) { impulses.push(req); return true; } },
    },
  });
  const rack = state.bombs.rack.cells;
  const free = rack.findIndex((c) => !c || !c.count);
  rack[free >= 0 ? free : 0] = { id: 'bomb_frag', count: BOMB_DEFS.bomb_frag.magazine };
  state.bombs.selectedId = 'bomb_frag';
  const add = (e) => { state.entities.set(e.id, e); state.entityList.push(e); return e; };
  const hostile = add({ id: 2, type: 'ship', alive: true, team: 1, mass: 32, radius: 8, rot: 0, pos: { x: 120, z: 10 }, vel: { x: 0, z: 0 } });
  const wreck = add({ id: 3, type: 'wreck', alive: true, team: 9, mass: 4, radius: 4, rot: 0, pos: { x: 95, z: -35 }, vel: { x: 0, z: 0 } });

  const plan = powerPreviewPlan(state, 'bomb');
  assert.equal(plan.tint, 'orange');
  assert.equal(plan.blocked, null);
  assert.ok(plan.moves.some((m) => m.id === hostile.id && m.trigger === true), 'the hostile sets it off');
  state.input.actions = { dropBomb: true };
  for (let i = 0; i < 600 && !detonated.length; i++) { state.simTime += 1 / 60; state.tick += 1; system.update(1 / 60, state); }
  const det = detonated[0];
  assert.equal(det.trigger, 'proximity');
  assert.ok(Math.hypot(det.pos.x - plan.center.x, det.pos.z - plan.center.z) < 1e-6, 'it goes off where the preview said');
  assert.ok(Math.abs(det.t - plan.etaS) < 1 / 30, 'and when');
  for (const e of [hostile, wreck]) {
    const m = plan.moves.find((row) => row.id === e.id);
    const req = impulses.find((r) => r.entityId === e.id);
    assert.ok(m && req, `body ${e.id} is outlined and shoved`);
    const n = m.path.length;
    const dvx = (m.path[n - 2] - m.path[n - 4]) / 0.6, dvz = (m.path[n - 1] - m.path[n - 3]) / 0.6;
    const mass = (e.physicsBody && e.physicsBody.mass) || e.mass;
    assert.ok(Math.abs(dvx - req.impulse.x / mass) < 1e-6 && Math.abs(dvz - req.impulse.z / mass) < 1e-6,
      `body ${e.id}: the arrow is the shove the blast delivers`);
  }
  assert.ok(plan.moves.some((m) => m.id === player.id), 'your own blast shoves you too, and the preview says so');
});

test('the preview is read-only: holding a key changes nothing the simulation reads', () => withFields(() => {
  const t = boot();
  const near = body(t.sim, 200, 30, { mass: 2 });
  body(t.sim, 60, 0, { type: 'ship', team: 1, radius: 8, mass: 30 });
  t.sim.step();
  // A dormant field rock inside the well: a resolved body spec would give it a `physicsBody`,
  // and the massline obstruction test reads that radius over the collider rule.
  const rec = insertAsteroidFieldRock(t.state, { pos: { x: 210, z: -20 }, radius: 9, data: { typeId: 'rock_common' } });
  assert.equal('physicsBody' in rec, false);
  t.state.input.aimWorld = { x: 210, z: 0 };
  t.state.player.cargo = { items: { cmdty_impulse_charge: 2 } };
  const fingerprint = () => JSON.stringify({
    tick: t.state.tick,
    next: t.state.nextEntityId,
    count: t.state.entities.size,
    bodies: [...t.state.entities.values()].map((e) => [e.id, e.pos, e.vel, e.physicsBody, e.alive]),
    rock: Object.keys(getAsteroidFieldRock(t.state, rec.id)).sort(),
    fields: (t.state.fields.snapshot || []).length,
    actions: t.state.input.actions,
  });
  const before = fingerprint();
  for (const p of POWER_VERBS) powerPreviewPlan(t.state, p);
  assert.equal(fingerprint(), before);
  assert.equal('physicsBody' in getAsteroidFieldRock(t.state, rec.id), false, 'the dormant rock is untouched');
  assert.ok(near.alive);
}));

test('Shove: the repulsor ring and every armed charge; a recharging repulsor keeps the blasts', () => withFields(() => {
  const t = boot();
  const rock = body(t.sim, 300, 10, { mass: 3 });
  const charge = t.sim.spawn({
    type: 'charge', team: 0, pos: { x: 280, z: 0 }, vel: { x: 0, z: 0 }, radius: 1.2, mass: 0.5,
    data: { armed: true, chargeId: 'charge_standard', ownerId: t.player.id, hostId: null },
  });
  const inRepulsor = body(t.sim, 60, 0, { mass: 2 });
  t.sim.step();
  const plan = powerPreviewPlan(t.state, 'shove');
  assert.equal(plan.tint, 'red');
  const field = plan.areas.find((a) => a.role === 'field');
  assert.deepEqual([field.x, field.z, field.r], [t.player.pos.x, t.player.pos.z, FIELD_DEFS.repulsor.radius]);
  const blast = plan.areas.find((a) => a.role === 'blast');
  assert.deepEqual([blast.x, blast.z, blast.r], [280, 0, 84]);
  const pushed = plan.moves.find((m) => m.id === rock.id);
  assert.ok(pushed && pushed.toX > pushed.x, 'the charge throws the rock away from itself');
  const shoved = plan.moves.find((m) => m.id === inRepulsor.id);
  assert.ok(shoved && shoved.toX > shoved.x, 'the repulsor pushes outward from the ship');

  t.state.fields.cooldowns.repulsor = t.state.simTime + 4;
  const cooling = powerPreviewPlan(t.state, 'shove');
  assert.equal(cooling.areas.some((a) => a.role === 'field'), false, 'no repulsor while it recharges');
  assert.ok(cooling.areas.some((a) => a.role === 'blast'), 'the charge still goes off');
  assert.equal(cooling.blocked, null);
  assert.ok(ids(cooling).includes(rock.id) && !ids(cooling).includes(inRepulsor.id));

  charge.alive = false;
  t.sim.step();
  const nothing = powerPreviewPlan(t.state, 'shove');
  assert.ok(nothing.blocked, 'nothing armed and the repulsor recharging: the release does nothing');
  assert.equal(nothing.moves.length, 0);
  assert.deepEqual(nothing.areas.map((a) => a.role), ['field'], 'the ring still shows, drawn dim');
}));

test('Pin draws its flight and lock ring and outlines nothing; a recharging seed is blocked', () => withFields(() => {
  const t = boot();
  body(t.sim, 200, 0, { mass: 2 });
  t.sim.step();
  t.state.input.aimWorld = { x: 400, z: 0 };
  const plan = powerPreviewPlan(t.state, 'pin');
  const launch = massSeedLaunchPlan(t.player, t.state);
  assert.equal(plan.tint, 'blue');
  assert.deepEqual(plan.areas[0].points, [launch.spawnPos.x, launch.spawnPos.z, launch.lockPos.x, launch.lockPos.z]);
  assert.deepEqual(plan.areas[1], { kind: 'ring', role: 'lock', x: launch.lockPos.x, z: launch.lockPos.z, r: FIELD_DEFS.seed.radius });
  assert.equal(plan.moves.length, 0, 'the anchor moves nothing; the Line latches to it');
  t.state.player.massSeed = { cooldownUntil: t.state.simTime + 5 };
  assert.match(powerPreviewPlan(t.state, 'pin').blocked, /Recharging/);
}));

test('Bomb with a charge aboard draws the throw to the hull it will stick to; Shove sets it off', () => withFields(() => {
  const t = boot();
  const target = body(t.sim, 90, 0, { type: 'ship', team: 1, radius: 8, mass: 30 });
  t.sim.step();
  t.state.player.cargo = { items: { cmdty_impulse_charge: 2 } };
  t.state.input.aimWorld = { x: 300, z: 0 };
  const plan = powerPreviewPlan(t.state, 'bomb');
  assert.equal(plan.blocked, null);
  assert.equal(plan.host && plan.host.id, target.id, 'the plate sticks to the hull on its line');
  assert.equal(plan.moves.length, 0, 'a throw moves nothing until Shove');
  const armed = plan.areas.find((a) => a.role === 'armed');
  assert.equal(armed.r, 84);
  assert.ok(Math.hypot(armed.x - target.pos.x, armed.z - target.pos.z) <= 8 + 1.2 + 6 + 2.1, 'the blast ring sits at the stick point');
  t.state.player.cargo.items.cmdty_impulse_charge = 0;
  t.state.bombs = { selectedId: null, rack: { cells: [] } };
  assert.ok(powerPreviewPlan(t.state, 'bomb').blocked, 'an empty bay and no charge: nothing to release');
}));

test('Rig outlines what the cone will push; a cone that is on folds and moves nothing', () => withFields(() => {
  const t = boot();
  const ahead = body(t.sim, 120, 0, { mass: 2 });
  const behind = body(t.sim, -120, 0, { mass: 2 });
  t.sim.step();
  const plan = powerPreviewPlan(t.state, 'rig');
  assert.equal(plan.tint, 'white');
  assert.equal(plan.areas[0].kind, 'wedge');
  assert.ok(ids(plan).includes(ahead.id) && !ids(plan).includes(behind.id));
  const m = plan.moves.find((row) => row.id === ahead.id);
  assert.ok(m.toX > m.x, 'the cone pushes along the nose');
  t.state.fields.coneActive = true;
  const fold = powerPreviewPlan(t.state, 'rig');
  assert.equal(fold.moves.length, 0);
  assert.equal(fold.areas[0].role, 'fold');
  assert.match(fold.note, /fold/);
}));

test('a Pull grips the locked target three times as hard, and a heavy hull reads as shrugging', () => withFields(() => {
  const t = boot();
  const marked = body(t.sim, 210, 120, { mass: 6 });
  const twin = body(t.sim, 210, -120, { mass: 6 });
  // Heavy HULLS shrug by mass; loose rocks and wrecks couple by size (couplingScale).
  const heavy = body(t.sim, 300, 0, { type: 'ship', mass: 4000, radius: 14 });
  t.sim.step();
  t.state.player.targetId = marked.id;
  t.state.input.aimWorld = { x: 210, z: 0 };
  const plan = powerPreviewPlan(t.state, 'pull');
  const rowOf = (e) => plan.moves.find((m) => m.id === e.id);
  const travel = (m) => Math.hypot(m.toX - m.x, m.toZ - m.z);
  assert.equal(rowOf(marked).marked, true);
  assert.equal(rowOf(twin).marked, false);
  assert.ok(travel(rowOf(marked)) > travel(rowOf(twin)) * 1.5, 'the gravity mark grips harder');
  assert.equal(rowOf(heavy).shrug, true);
  assert.equal(rowOf(twin).shrug, false);
}));

test('a recharging Pull is drawn dim and outlines nothing; the plan is deterministic and capped', () => withFields(() => {
  const t = boot();
  for (let i = 0; i < 40; i++) body(t.sim, 120 + (i % 8) * 18, -70 + Math.floor(i / 8) * 35, { mass: 2 });
  t.sim.step();
  t.state.input.aimWorld = { x: 190, z: 0 };
  const a = powerPreviewPlan(t.state, 'pull');
  const b = powerPreviewPlan(t.state, 'pull');
  assert.equal(a.moves.length, 24, 'the 24 bodies nearest the well');
  assert.deepEqual(ids(a), ids(b));
  const d = (m) => Math.hypot(m.x - a.center.x, m.z - a.center.z);
  for (let i = 1; i < a.moves.length; i++) assert.ok(d(a.moves[i]) >= d(a.moves[i - 1]) - 1e-9, 'nearest first');
  t.state.fields.cooldowns.well = t.state.simTime + 2.5;
  const cooling = powerPreviewPlan(t.state, 'pull');
  assert.equal(cooling.blocked, 'Recharging — 3s');
  assert.equal(cooling.moves.length, 0);
  assert.equal(cooling.areas.length, 1, 'the ring still shows where it would land');
  FIELD_FLAGS.enabled = false;
  assert.equal(powerPreviewPlan(t.state, 'pull'), null, 'a profile without fields draws no well');
  FIELD_FLAGS.enabled = true;
  assert.ok(SIM_DT > 0);
}));
