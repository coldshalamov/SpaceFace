// TOWJAW source candidate: fixed-seed behavior and production-owner seam checks.
// Run in a complete checkout: node --test test/pro-five-towjaw.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  armorIntercept, attackGeometry, encounterLayout, grappleSweepShape,
  isMechanismCovered, localToWorld, mechanismPosition, pointInAttack,
  slotPosition, sweptInAttack,
} from '../src/features/towjaw/geometry.js';
import { TOWJAW, TOWJAW_ATTACKS } from '../src/features/towjaw/catalog.js';
import { createTowjawController } from '../src/features/towjaw/controller.js';
import { createTowjawRuntime, createTowjawSystem, getActiveTowjawRuntime, isTowjawClockInstalled } from '../src/features/towjaw/runtime.js';
import { interceptTowjawDamage } from '../src/features/towjaw/damageBridge.js';
import { TOWJAW_ENCOUNTER_RUNTIME } from '../src/features/towjaw/encounter.js';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { combat } from '../src/systems/combat.js';
import { consumePhysicsCommand, queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { ensureCombatant } from '../src/combat/runtime.js';
import { PINNED_STATUS_ID } from '../src/data/combatDefs.js';
import { buildTowjawPresentationFrame, createTowjawPresentation } from '../src/features/towjaw/presentation.js';

const DT = 1 / 60;
const SEEDS = [4242, 7331];
const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const pointNear = (a, b) => { near(a.x, b.x); near(a.z, b.z); };
const clone = value => JSON.parse(JSON.stringify(value));
const listenerCount = bus => [...bus._listeners.values()].reduce((count, rows) => count + rows.size, 0);

// Arranged body poses isolate the damage/status/save seams; the separate Rapier
// cases below prove that production springs can actually reach these poses.
function seatRuntimeUntilCommit(h) {
  const boss = h.state.entities.get(h.runtime.snapshot().bindings.find(row => row.role === 'boss').id);
  h.player.pos.set(boss.pos.x + 90, 0, boss.pos.z);
  for (let tick = 0; tick < 60 * 35; tick++) {
    for (const plate of h.runtime.getView().armor) {
      const body = h.state.entities.get(plate.id), point = slotPosition(boss, plate.slot);
      if (body?.alive) { body.pos.set(point.x, 0, point.z); body.vel.set(0, 0, 0); }
    }
    h.advance();
    for (const body of h.state.entityList) consumePhysicsCommand(body);
    if (h.runtime.getView().phase === 'commit') return h.runtime.getView();
  }
  assert.fail(`Runtime failed to commit: ${JSON.stringify(h.runtime.getView())}`);
}

function observedBody(id, pos, extra = {}) {
  return { id, pos: { ...pos }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    mass: 12, radius: 7, hull: 60, hullMax: 60, alive: true, ...extra };
}

function controllerFixture(seed = 4242) {
  const boss = observedBody(2, { x: 1200, z: -600 }, { mass: 420, radius: 24, hull: 420, hullMax: 420 });
  const player = observedBody(1, { x: 1380, z: -600 }, { mass: 24, radius: 8, hull: 200, hullMax: 200 });
  const mechanisms = Object.fromEntries(['jaw', 'winch', 'drive'].map((key, i) =>
    [key, observedBody(3 + i, mechanismPosition(boss, key), { radius: 3.5, mass: 10 })]));
  const debris = Array.from({ length: 9 }, (_, i) => observedBody(20 + i,
    { x: 1280 + (i % 3) * 15, z: -680 + Math.floor(i / 3) * 25 }, { eligible: true }));
  const options = { seed, encounterId: `towjaw-controller-${seed}`, bossId: boss.id,
    sectorId: TOWJAW.sectorId, origin: boss.pos,
    mechanismIds: Object.fromEntries(Object.entries(mechanisms).map(([key, body]) => [key, body.id])),
    eligibleIds: debris.map(body => body.id) };
  const controller = createTowjawController(options);
  const world = { simTime: 9000, sectorId: TOWJAW.sectorId, boss, player, mechanisms, debris };
  const events = [];
  function advance({ seat = false } = {}) {
    if (seat) for (const plate of controller.getView().armor) {
      const body = debris.find(item => item.id === plate.id);
      if (body?.alive) { body.pos = slotPosition(boss, plate.slot); body.vel = { x: 0, z: 0 }; }
    }
    world.simTime += DT;
    const result = controller.step(DT, world); events.push(...result.events); return result;
  }
  function reach(phase, maxTicks = 60 * 30) {
    for (let i = 0; i < maxTicks; i++) { advance({ seat: true }); if (controller.getView().phase === phase) return controller.getView(); }
    assert.fail(`Did not reach ${phase}: ${JSON.stringify(controller.getView())}`);
  }
  return { controller, options, world, events, advance, reach };
}

function runtimeFixture(seed = 4242, start = true) {
  const sim = createSimulation({ seed, systems: [combat], updateOrder: [] });
  const { state, bus, helpers, registry } = sim;
  state.mode = 'flight'; state.simTime = 9000; state.world.currentSectorId = TOWJAW.sectorId;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 10000, hullMax: 10000, radius: 8, mass: 24 });
  state.playerId = player.id;
  const runtime = createTowjawRuntime({ state, bus, helpers, registry });
  const options = { encounterId: `towjaw-runtime-${seed}`, sectorId: TOWJAW.sectorId, origin: { x: 300, z: 0 }, seed };
  if (start) assert.equal(runtime.start(options).ok, true);
  function advance(physics = null) {
    state.tick++; state.simTime += DT;
    const result = runtime.step(DT);
    if (physics) { physics.syncFromEntities(state.entityList); physics.step(DT, state.tick); }
    return result;
  }
  function dispose() { runtime.dispose(); sim.dispose(); }
  return { sim, state, bus, helpers, registry, player, runtime, options, advance, dispose };
}

function applyHit(h, targetId, damage = 20, from = null) {
  const target = h.state.entities.get(targetId);
  if (from) h.player.pos.set(from.x, 0, from.z);
  return h.runtime.routeDamage({ attackerId: h.player.id, targetId,
    packet: scalarHitToDamagePacket({ damage, damageType: 'kinetic', pos: target.pos }),
    origin: { kind: 'weapon', weaponId: 'wpn_pulse_laser_s' } });
}

for (const seed of SEEDS) {
  test(`seed ${seed}: field placement rotates/translates with its sector and preserves physical scrap`, () => {
    const first = encounterLayout({ x: 0, z: 0 }, 0, 9, seed);
    assert.deepEqual(first, encounterLayout({ x: 0, z: 0 }, 0, 9, seed));
    assert.notDeepEqual(first.scrap, encounterLayout({ x: 0, z: 0 }, 0, 9, seed + 1).scrap);
    const pose = { pos: { x: 3700, z: -2150 }, rot: Math.PI / 3 };
    const placed = encounterLayout(pose.pos, pose.rot, 9, seed);
    for (let i = 0; i < first.scrap.length; i++) {
      pointNear(placed.scrap[i], localToWorld(pose, first.scrap[i]));
      assert.equal(placed.scrap[i].mass, first.scrap[i].mass);
      assert.ok(placed.scrap[i].mass > 0);
      assert.ok(Math.hypot(placed.scrap[i].x - pose.pos.x, placed.scrap[i].z - pose.pos.z) > 70);
    }
  });
}

test('armor shielding uses the first live physical plate along the incoming direction', () => {
  const plates = [
    { id: 8, alive: true, pos: { x: 30, z: 0 }, radius: 7 },
    { id: 4, alive: true, pos: { x: 60, z: 0 }, radius: 7 },
    { id: 3, alive: false, pos: { x: 80, z: 0 }, radius: 9 },
  ];
  const args = { from: { x: 120, z: 0 }, to: { x: 0, z: 0 }, armor: plates };
  const front = armorIntercept(args);
  assert.equal(front.id, 4);
  near(front.point.x, 67);
  assert.equal(armorIntercept({ ...args, armor: [...plates].reverse() }).id, 4);
  assert.equal(armorIntercept({ from: { x: 0, z: -120 }, to: args.to, armor: plates }), null);
  plates[1].pos.z = 40;
  assert.equal(armorIntercept(args).id, 8, 'displacement opens a real hole without a cosmetic flag');
  plates[0].alive = false;
  assert.equal(armorIntercept(args), null, 'lost pieces no longer shield');
  assert.equal(armorIntercept({ to: args.to, armor: plates }), null, 'no invented direction for unlocated damage');
});

test('mechanism cover depends on current debris geometry, not claimed armor slots', () => {
  const boss = { id: 1, pos: { x: -540, z: 810 }, rot: -0.4 };
  const mechanisms = Object.fromEntries(['jaw', 'winch', 'drive'].map(key => [key, { pos: mechanismPosition(boss, key) }]));
  const debris = [0, 1, 2].map((slot, i) => ({ id: 20 + i, alive: true, radius: 8, pos: slotPosition(boss, slot) }));
  const model = { armor: debris.map((body, i) => ({ id: body.id, slot: i, status: 'latched' })) };
  const world = { boss, mechanisms, debris };
  for (const key of ['jaw', 'winch', 'drive']) assert.equal(isMechanismCovered(key, model, world), true);
  debris[1].pos = { x: -300, z: 1100 };
  assert.equal(isMechanismCovered('winch', model, world), false, 'the exposed feed winch is an actual geometric gap');
  assert.equal(isMechanismCovered('jaw', model, world), true);
  debris[0].alive = false;
  assert.equal(isMechanismCovered('jaw', model, world), false);
});

test('committed attacks expose finite dodge routes and share their warned/hit geometry', () => {
  const boss = { pos: { x: 400, z: -500 }, rot: 0 };
  const player = { pos: { x: 540, z: -500 } };
  const ram = attackGeometry('ram', boss, player);
  assert.equal(pointInAttack(ram.shapes[0], player.pos, 4), true);
  assert.equal(pointInAttack(ram.shapes[0], { x: 540, z: -440 }, 4), false);
  assert.equal(sweptInAttack(ram.shapes[0], { x: 500, z: -600 }, { x: 500, z: -400 }, 4), true,
    'a high-speed crossing cannot tunnel through a committed lane');
  const fixed = clone(ram);
  player.pos = { x: 300, z: -200 };
  assert.deepEqual(ram, fixed, 'the warning freezes world-space commitment rather than following the dodge');
  const grapple = attackGeometry('grapple', boss, { pos: { x: 540, z: -500 } });
  const interval = grappleSweepShape(grapple, 0.55, 0.45);
  const envelope = grapple.shapes[0];
  const inSweep = { x: envelope.x + Math.cos(envelope.heading) * 70, z: envelope.z + Math.sin(envelope.heading) * 70 };
  assert.equal(pointInAttack(interval, inSweep, 4), true);
  assert.equal(pointInAttack(envelope, inSweep, 4), true);
  assert.equal(pointInAttack(interval, { x: envelope.x, z: envelope.z }, 0), false, 'inside jaw ring is a dodge space');
  assert.ok(TOWJAW_ATTACKS.ram.telegraphS >= 2, 'the heavy ram gives a full two-second warning');
  assert.ok(TOWJAW_ATTACKS.ram.activeS >= 2, 'the ram commits long enough to be punishable');
});

for (const seed of SEEDS) {
  test(`seed ${seed}: stealing real armor cancels the covered mechanism's telegraph`, () => {
    const h = controllerFixture(seed);
    const committed = h.reach('commit');
    assert.ok(committed.armorCount >= 3 && committed.armorCount <= 6);
    assert.ok(committed.attack.fireAt > h.world.simTime + 1, 'warning is a real response window');
    const before = clone(h.world);
    const noChange = h.advance();
    const after = clone(h.world); before.simTime = after.simTime;
    assert.deepEqual(after, before, 'controller must not write observed bodies');
    assert.equal(noChange.commands.some(command => command.type === 'damage'), false);
    const mechanism = committed.attack.mechanism;
    const victim = committed.armor.find(plate =>
      isMechanismCovered(mechanism, { armor: [plate] }, h.world));
    assert.ok(victim, `committed ${mechanism} had real cover`);
    const body = h.world.debris.find(item => item.id === victim.id);
    const mass = body.mass;
    body.playerHeld = true; body.pos = { x: body.pos.x + 70, z: body.pos.z + 70 };
    const outcomes = [];
    for (let i = 0; i < 15; i++) outcomes.push(h.advance());
    assert.ok(outcomes.some(result => result.events.some(event => event.type === 'telegraph-cancel')));
    assert.ok(outcomes.some(result => result.commands.some(command => command.type === 'release' && command.entityId === body.id)));
    assert.equal(h.controller.getView().armor.some(plate => plate.id === body.id), false);
    assert.equal(h.controller.getView().mechanisms[mechanism].exposed, true);
    assert.equal(body.mass, mass);
    assert.equal(body.alive, true, 'stealing detaches the original piece rather than consuming it');
    assert.equal(outcomes.some(result => result.commands.some(command => command.type === 'damage')), false);
  });
}

test('pinning the jaw interrupts a grapple before any grab or damage', () => {
  const h = controllerFixture(4242);
  h.world.player.pos = { x: 1300, z: -600 };
  const committed = h.reach('commit');
  assert.equal(committed.attack.kind, 'grapple');
  h.world.mechanisms.jaw.pinned = true;
  const cancelled = h.advance();
  assert.ok(cancelled.events.some(event => event.type === 'telegraph-cancel'));
  assert.equal(h.controller.getView().phase, 'exposed');
  while (h.world.simTime < committed.attack.endAt + 0.05) {
    const result = h.advance();
    assert.equal(result.commands.some(command => command.targetId === h.world.player.id && command.type === 'damage'), false);
    assert.equal(result.commands.some(command => command.entityId === h.world.player.id && command.type === 'impulse'), false);
  }
});

test('pulling a live jaw off its mount cancels its attack without needing an HP kill', () => {
  const h = controllerFixture(4242);
  h.world.player.pos = { x: 1300, z: -600 };
  h.reach('commit');
  h.world.mechanisms.jaw.pos.z += 60;
  const result = h.advance();
  assert.ok(result.events.some(event => event.type === 'telegraph-cancel'));
  assert.equal(h.world.mechanisms.jaw.hull, 60);
  assert.equal(h.controller.getView().mechanisms.jaw.exposed, true);
});

test('denying feedstock produces bounded withdrawal, with no forced weapon puzzle or repeat reward', () => {
  const h = controllerFixture();
  for (const body of h.world.debris) body.pos.x += 900;
  const commands = [];
  for (let i = 0; i < 60 * 65 && h.controller.getView().phase !== 'done'; i++) commands.push(...h.advance().commands);
  assert.equal(h.controller.getView().phase, 'done');
  assert.equal(h.controller.getView().outcome, 'retreat');
  assert.equal(commands.filter(command => command.type === 'outcome').length, 1);
  assert.equal(commands.find(command => command.type === 'outcome').rewardEligible, false);
  assert.equal(commands.some(command => command.type === 'damage'), false);
  assert.deepEqual(h.advance().commands, [], 'terminal stepping cannot award again');
});

test('slung scrap damages an exposed mechanism once and attributes the physical strike to the player', () => {
  const h = controllerFixture();
  const scrap = h.world.debris[0];
  h.world.hits = [{ mechanism: 'winch', bodyId: scrap.id, relativeSpeed: 80 }];
  const first = h.advance();
  const hit = first.commands.find(command => command.type === 'damage' && command.targetId === h.world.mechanisms.winch.id);
  assert.ok(hit, 'physical impact creates an actual damage intent');
  assert.equal(hit.sourceId, h.world.player.id, 'same-team debris must not trip friendly-fire rejection');
  assert.ok(hit.amount >= h.world.mechanisms.winch.hull);
  assert.equal(h.advance().commands.some(command => command.type === 'damage'), false, 'persistent contact is not another hit');
  const saved = clone(h.controller.snapshot());
  const restored = createTowjawController(h.options);
  assert.equal(restored.restore(saved, h.world), true);
  h.world.simTime += DT;
  assert.equal(restored.step(DT, h.world).commands.some(command => command.type === 'damage'), false, 'replayed contact after load is spent');
});

test('restoring a committed fight cancels the old warning and tombstones lost bodies', () => {
  const h = controllerFixture();
  const committed = h.reach('commit');
  const gone = committed.armor[0].id;
  h.world.debris.splice(h.world.debris.findIndex(body => body.id === gone), 1);
  const restored = createTowjawController(h.options);
  assert.equal(restored.restore(clone(h.controller.snapshot()), h.world), true);
  const view = restored.getView();
  assert.equal(view.attack, null);
  assert.equal(view.phase, 'recover');
  assert.equal(view.armor.some(plate => plate.id === gone), false);
  assert.ok(view.lostIds.includes(gone));
  const count = h.world.debris.length;
  h.world.simTime += DT;
  const result = restored.step(DT, h.world);
  assert.equal(h.world.debris.length, count);
  assert.equal(result.commands.some(command => ['launchScrap', 'damage', 'outcome'].includes(command.type)), false);
});

for (const seed of SEEDS) {
  test(`seed ${seed}: native Rapier bodies assemble at least three armor pieces and commit an attack`, async () => {
    const h = runtimeFixture(seed);
    const physics = await createSg02DynamicBodyOwner({ fixedDt: DT, mode: 'rapier-dynamic' });
    let maxArmor = 0, committed = false;
    try {
      for (let i = 0; i < 60 * 40; i++) {
        const result = h.advance(physics);
        const view = h.runtime.getView();
        maxArmor = Math.max(maxArmor, view.armorCount || 0);
        assert.ok(result.commands.length <= TOWJAW.maxCommands);
        for (const command of result.commands) if (command.type === 'force')
          assert.ok(Math.hypot(command.x, command.z) <= TOWJAW.maxForce + 1e-6);
        for (const body of h.state.entityList) {
          assert.ok(Number.isFinite(body.pos.x) && Number.isFinite(body.pos.z));
          assert.ok(Number.isFinite(body.vel.x) && Number.isFinite(body.vel.z));
        }
        if (view.phase === 'commit') { committed = true; break; }
      }
      assert.ok(maxArmor >= 3, `physical springs failed to retain the required cage; max armor ${maxArmor}`);
      assert.ok(committed, 'the real bodies must reach an attack, not scavenge forever');
      const frame = buildTowjawPresentationFrame(h.runtime.getView(), undefined, h.state.settings);
      assert.ok(frame.attack, 'a late-sector global clock must show the committed warning');
      assert.ok(frame.attack.secondsUntil > 1);
    } finally { h.runtime.dispose(); physics.dispose(); h.sim.dispose(); }
  });
}

test('real combat routing spends directional plate HP, leaves a geometric flank, and ignores unrelated bodies', () => {
  const h = runtimeFixture();
  try {
    const view = seatRuntimeUntilCommit(h), boss = h.state.entities.get(view.world.boss.id);
    const plateRow = view.armor.find(row => row.status === 'latched' && row.slot === 0);
    assert.ok(plateRow);
    const plate = h.state.entities.get(plateRow.id), before = { boss: boss.hull, plate: plate.hull };
    const vx = plate.pos.x - boss.pos.x, vz = plate.pos.z - boss.pos.z;
    const result = applyHit(h, boss.id, 12, { x: boss.pos.x + vx * 4, z: boss.pos.z + vz * 4 });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(plate.hull < before.plate, 'the intercepted packet spends the real wreck HP');
    assert.equal(boss.hull, before.boss, 'a first physical intersection shields the hull');
    const flank = applyHit(h, boss.id, 12, { x: boss.pos.x, z: boss.pos.z + 180 });
    assert.equal(flank.ok, true);
    assert.ok(boss.hull < before.boss, 'there is no global armor invulnerability');
    const outsider = h.sim.spawn({ type: 'ship', team: 2, pos: { x: 900, z: 900 }, hull: 100 });
    const foreign = { attackerId: h.player.id, targetId: outsider.id, packet: scalarHitToDamagePacket({ damage: 1 }) };
    assert.strictEqual(interceptTowjawDamage(h.state, foreign), foreign);
  } finally { h.dispose(); }
});

test('production Pin status cancels the actual grapple and releases its clamp without damaging the player', () => {
  const h = runtimeFixture();
  try {
    const view = seatRuntimeUntilCommit(h);
    assert.equal(view.attack.kind, 'grapple');
    const jaw = h.state.entities.get(view.world.mechanisms.jaw.id);
    const kernel = getCombatKernel(h.sim.registry.ctx);
    const combatant = ensureCombatant(h.state, jaw, kernel.catalog);
    assert.equal(kernel.statuses.schedule(jaw, combatant,
      { id: PINNED_STATUS_ID, durationTicks: 180, applyTick: h.state.tick }, { attackerId: h.player.id }).ok, true);
    kernel.prePhysics(DT);
    assert.ok(combatant.statuses[PINNED_STATUS_ID]);
    const before = h.player.hull;
    const result = h.advance();
    assert.ok(result.events.some(event => event.type === 'telegraph-cancel'));
    assert.equal(h.runtime.getView().world.mechanisms.jaw.pinned, true);
    assert.equal(h.runtime.getView().phase, 'exposed');
    assert.equal(h.player.hull, before);
  } finally { h.dispose(); }
});

test('a native Massline attachment steals the existing plate without cutting or recreating the line', async () => {
  const h = runtimeFixture();
  const physics = await createSg02DynamicBodyOwner({ fixedDt: DT, mode: 'rapier-dynamic' });
  try {
    const view = seatRuntimeUntilCommit(h), attack = view.attack;
    const plate = view.armor.find(row => isMechanismCovered(attack.mechanism, { armor: [row] }, view.world));
    const body = h.state.entities.get(plate.id), mass = body.mass;
    const kernel = getCombatKernel(h.sim.registry.ctx);
    h.helpers.combatPhysics = createSg02CombatPhysicsPort(physics);
    physics.syncFromEntities(h.state.entityList);
    const attached = kernel.attachments.create({ defId: 'tether_standard', ownerId: h.player.id,
      targetId: body.id, sourceWorld: h.player.pos, targetWorld: body.pos });
    assert.equal(attached.ok, true, attached.reason);
    const id = attached.attachment.id;
    const boss = view.world.boss;
    const dx = body.pos.x - boss.pos.x, dz = body.pos.z - boss.pos.z, distance = Math.hypot(dx, dz);
    queuePhysicsImpulse(body, { x: dx / distance * mass * 90, y: 0, z: dz / distance * mass * 90 },
      { actorId: h.player.id, tag: 'towjaw_test_physical_theft' });
    const events = [];
    for (let i = 0; i < 24; i++) events.push(...h.advance(physics).events);
    assert.ok(events.some(event => event.type === 'telegraph-cancel'));
    assert.equal(h.runtime.getView().armor.some(row => row.id === body.id), false);
    assert.equal(kernel.attachments.get(id).state, 'active');
    assert.ok(physics.attachments.has(id), 'native line remains owned by the attachment service');
    assert.strictEqual(h.state.entities.get(body.id), body);
    assert.equal(body.mass, mass);
    assert.ok(Number.isFinite(body.vel.x) && Number.isFinite(body.vel.z));
  } finally { h.runtime.dispose(); physics.dispose(); h.sim.dispose(); }
});

test('shooting the real exposed jaw disables its attack through the production damage owner', () => {
  const h = runtimeFixture();
  try {
    const view = seatRuntimeUntilCommit(h), jaw = h.state.entities.get(view.world.mechanisms.jaw.id);
    const before = h.player.hull;
    // Fire from the gap inside the cage; the outer plate remains a real obstacle
    // to a shot from the opposite direction, not a scripted vulnerability flag.
    const routed = applyHit(h, jaw.id, 100, { x: jaw.pos.x, z: jaw.pos.z + 15 });
    assert.equal(routed.ok, true);
    assert.ok(jaw.hull <= 0 || jaw.alive === false);
    const result = h.advance();
    assert.equal(h.runtime.getView().mechanisms.jaw.disabled, true);
    assert.ok(result.events.some(event => event.type === 'telegraph-cancel'));
    assert.equal(h.player.hull, before);
  } finally { h.dispose(); }
});

test('a swept stolen-scrap crossing really disables the winch once, including friendly-fire attribution', () => {
  const h = runtimeFixture();
  try {
    const view = h.runtime.getView(), winch = h.state.entities.get(view.world.mechanisms.winch.id);
    const scrap = h.state.entities.get(view.world.debris[0].id);
    scrap.pos.set(winch.pos.x - 40, 0, winch.pos.z); scrap.vel.set(80, 0, 0);
    h.advance();
    scrap.pos.set(winch.pos.x + 40, 0, winch.pos.z);
    const hit = h.advance();
    assert.ok(hit.commands.some(command => command.type === 'damage' && command.reason === 'stolen-scrap'));
    assert.ok(winch.hull <= 0 || winch.alive === false, 'real damage must pass the friendly-fire and target-type gates');
    assert.equal(h.advance().commands.some(command => command.type === 'damage' && command.reason === 'stolen-scrap'), false);
  } finally { h.dispose(); }
});

test('defeat leaves only finite original salvage, pays no credits, and cannot issue another boss', () => {
  const h = runtimeFixture();
  try {
    const saved = h.runtime.snapshot(), beforeCredits = h.state.player.credits;
    const scrapIds = saved.bindings.filter(row => row.role === 'scrap').map(row => row.id);
    const boss = saved.bindings.find(row => row.role === 'boss');
    const killed = applyHit(h, boss.id, 2000, { x: 300, z: 200 });
    assert.equal(killed.ok, true);
    h.advance();
    assert.equal(h.runtime.getView().outcome, 'defeat');
    assert.equal(getActiveTowjawRuntime(h.state), null);
    for (const id of scrapIds) {
      const body = h.state.entities.get(id);
      assert.ok(body?.alive, 'surviving scrap is released, not replaced');
      assert.equal(body.flags.persistent, true, 'director resolution cannot silently TTL the salvage');
    }
    assert.equal(h.state.player.credits, beforeCredits);
    const ids = h.state.entityList.map(body => body.id);
    assert.deepEqual(h.advance().commands, []);
    assert.equal(h.runtime.dispose(), false);
    assert.deepEqual(h.state.entityList.map(body => body.id), ids);
    const next = createTowjawRuntime(h.sim.registry.ctx);
    assert.equal(next.start({ ...h.options, encounterId: 'attempted-reroll' }).reason, 'already_issued');
    next.dispose();
  } finally { h.dispose(); }
});

test('runtime rebind tombstones lost slots, preserves stolen velocity, and cannot duplicate bodies or old warnings', () => {
  const h = runtimeFixture();
  let restored = null;
  try {
    const committed = seatRuntimeUntilCommit(h), missingId = committed.armor[0].id;
    const saved = clone(h.runtime.snapshot());
    h.runtime.dispose('save_rebind', { retireBodies: false });
    h.helpers.removeEntity(missingId, { immediate: true });
    const survivor = h.state.entities.get(saved.bindings.find(row => row.role === 'scrap' && row.id !== missingId).id);
    survivor.vel.set(17, 0, -23);
    const count = h.state.entityList.length, listeners = listenerCount(h.bus);
    for (let pass = 0; pass < 3; pass++) {
      restored = createTowjawRuntime(h.sim.registry.ctx);
      assert.equal(restored.restore(saved).ok, true);
      const view = restored.getView();
      assert.equal(view.attack, null);
      const missingKey = saved.bindings.find(row => row.id === missingId).key;
      const tombstone = restored.snapshot().bindings.find(row => row.key === missingKey);
      assert.equal(tombstone.tombstone, true);
      assert.equal(tombstone.id, null);
      assert.equal(view.armor.some(row => row.id === missingId), false);
      assert.equal(h.state.entityList.length, count);
      assert.equal(survivor.vel.x, 17); assert.equal(survivor.vel.z, -23);
      restored.dispose('save_rebind', { retireBodies: false });
      assert.equal(listenerCount(h.bus), listeners, 'restore/dispose does not accumulate cue or lifecycle listeners');
    }
  } finally { restored?.dispose(); h.dispose(); }
});

test('recycled entity IDs and foreign civilians never inherit TOWJAW forces, damage routing, or cleanup', () => {
  const h = runtimeFixture();
  try {
    const binding = h.runtime.snapshot().bindings.find(row => row.role === 'scrap');
    h.helpers.removeEntity(binding.id, { immediate: true });
    const foreign = h.sim.spawn({ id: binding.id, type: 'ship', team: 0,
      pos: { x: 330, z: 40 }, hull: 150, hullMax: 150, mass: 19 });
    assert.equal(foreign.id, binding.id);
    const result = h.advance();
    assert.equal(result.commands.some(command => command.entityId === foreign.id), false);
    const request = { targetId: foreign.id, attackerId: h.player.id, packet: scalarHitToDamagePacket({ damage: 1 }) };
    assert.strictEqual(interceptTowjawDamage(h.state, request), request);
    h.runtime.dispose('sector_exit', { preserveSalvage: true });
    assert.strictEqual(h.state.entities.get(foreign.id), foreign);
    assert.equal(foreign.hull, 150);
  } finally { h.dispose(); }
});

test('partial spawn failure rolls back only its own bodies and retires listeners', () => {
  const h = runtimeFixture(4242, false);
  let runtime = null;
  try {
    h.runtime.dispose();
    const listeners = listenerCount(h.bus), existing = h.state.entityList.map(body => body.id);
    let count = 0;
    runtime = createTowjawRuntime({ ...h.sim.registry.ctx, helpers: { ...h.helpers,
      spawnEntity(spec) { if (++count === 6) throw new Error('focused spawn failure'); return h.helpers.spawnEntity(spec); } } });
    assert.equal(runtime.start(h.options).reason, 'spawn_failed');
    assert.deepEqual(h.state.entityList.filter(body => body.alive).map(body => body.id), existing);
    h.registry.get('core').lifetimeSweep(DT, h.state);
    assert.deepEqual(h.state.entityList.map(body => body.id), existing);
    assert.equal(listenerCount(h.bus), listeners);
    assert.equal(getActiveTowjawRuntime(h.state), null);
  } finally { runtime?.dispose(); h.dispose(); }
});

test('fixed-clock save rebind waits for restored entities, ticks once, and frees all hooks on teardown', () => {
  const h = runtimeFixture();
  const system = createTowjawSystem();
  try {
    system.init(h.sim.registry.ctx);
    assert.equal(isTowjawClockInstalled(h.state), true);
    const saved = system.serialize(), ids = h.state.entityList.map(body => body.id);
    system.deserialize(clone(saved));
    assert.equal(getActiveTowjawRuntime(h.state), null);
    h.state.mode = 'menu'; system.update(DT, h.state);
    assert.equal(getActiveTowjawRuntime(h.state), null, 'rehydration cannot run ahead of the save owner');
    h.state.mode = 'flight'; h.state.tick++; h.state.simTime += DT;
    system.update(DT, h.state);
    const active = getActiveTowjawRuntime(h.state);
    assert.ok(active);
    assert.deepEqual(h.state.entityList.map(body => body.id), ids);
    assert.deepEqual(system.update(DT, h.state).commands, [], 'calendar and render callbacks cannot double-step');
    system.destroy();
    assert.equal(isTowjawClockInstalled(h.state), false);
    assert.equal(getActiveTowjawRuntime(h.state), null);
  } finally { system.destroy(); h.dispose(); }
});

test('optional director offer/decline is inert and acceptance requires a safe Vesta fixed-clock route', () => {
  const h = runtimeFixture(4242, false), system = createTowjawSystem(), calls = [];
  const d = { bus: h.bus, helpers: h.helpers, registry: h.registry, player: () => h.player,
    now: () => h.state.simTime, stream: () => () => 0.5,
    say: (...args) => calls.push(['say', ...args]), offerChoices: (...args) => calls.push(['offer', ...args]),
    resolve: (live, outcome) => calls.push(['resolve', outcome]), abort: (live, reason) => calls.push(['abort', reason]) };
  const live = { id: 'director-towjaw', sectorId: TOWJAW.sectorId, anchor: { x: 400, z: 0 },
    zoneRadius: 400, shape: { primaryLine: 'A tug is collecting the field.' }, ids: [], roles: {}, vars: {} };
  try {
    h.runtime.dispose();
    TOWJAW_ENCOUNTER_RUNTIME.fire(d, live, h.state);
    assert.equal(live.phase, 'offer'); assert.equal(h.state.entityList.length, 1);
    TOWJAW_ENCOUNTER_RUNTIME.choose(d, live, h.state, 'decline');
    assert.ok(calls.some(row => row[0] === 'resolve' && row[1] === 'declined'));
    assert.equal(h.state.entityList.length, 1);
    TOWJAW_ENCOUNTER_RUNTIME.choose(d, live, h.state, 'investigate');
    assert.ok(calls.some(row => row[0] === 'abort' && row[1] === 'towjaw_fixed_clock_missing'));
    assert.equal(h.state.entityList.length, 1);
    system.init(h.sim.registry.ctx);
    TOWJAW_ENCOUNTER_RUNTIME.choose(d, live, h.state, 'investigate');
    assert.equal(live.phase, 'towjaw');
    assert.equal(live.ids.length, 13);
    assert.equal(h.state.entityList.length, 14);
    assert.ok(getActiveTowjawRuntime(h.state));
  } finally { system.destroy(); h.dispose(); }
});
