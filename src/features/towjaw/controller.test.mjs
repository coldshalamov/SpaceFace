// Focused observation-contract regressions. Native Rapier motion, attacks and
// tool integration are exercised separately in test/pro-five-towjaw.test.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTowjawController } from './controller.js';
import { TOWJAW, TOWJAW_ATTACKS } from './catalog.js';
import { isMechanismCovered, mechanismPosition, slotPosition } from './geometry.js';
import { buildTowjawPresentationFrame } from './presentation.js';

const DT = 1 / 60;
const clone = value => JSON.parse(JSON.stringify(value));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

function body(id, pos, extra = {}) {
  return { id, pos: { ...pos }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    mass: 12, radius: 7, hull: 60, hullMax: 60, alive: true, ...extra };
}

function fixture(seed = 4242) {
  const boss = body(2, { x: 1200, z: -600 }, { mass: 420, inertiaY: 200,
    radius: 24, hull: 420, hullMax: 420 });
  const player = body(1, { x: 1290, z: -600 }, { mass: 24, radius: 8 });
  const mechanisms = Object.fromEntries(['jaw', 'winch', 'drive'].map((key, index) =>
    [key, body(3 + index, mechanismPosition(boss, key), { radius: 3.5, mass: 10 })]));
  const debris = [0, 1, 2].map(slot => body(20 + slot, slotPosition(boss, slot), { eligible: true }));
  const options = { seed, encounterId: `towjaw-contract-${seed}`, sectorId: TOWJAW.sectorId,
    origin: { ...boss.pos }, bossId: boss.id,
    mechanismIds: Object.fromEntries(Object.entries(mechanisms).map(([key, value]) => [key, value.id])),
    eligibleIds: debris.map(value => value.id) };
  const world = { simTime: 9000, sectorId: TOWJAW.sectorId, boss, player, debris, mechanisms };
  const controller = createTowjawController(options);
  const snapshot = controller.snapshot();
  snapshot.phase = 'scavenge'; snapshot.phaseTime = 6; snapshot.elapsed = 8; snapshot.targetArmor = 3;
  snapshot.armor = debris.map((value, slot) => ({ id: value.id, slot, status: 'latched',
    age: 1, settleS: 0, strainS: 0 }));
  assert.equal(controller.restore(snapshot, world), true);
  function advance() { world.simTime += DT; return controller.step(DT, world); }
  function until(predicate, ticks = 60 * 20) {
    for (let i = 0; i < ticks; i++) { const result = advance(); if (predicate(result)) return result; }
    assert.fail(`TOWJAW observation fixture did not reach target: ${JSON.stringify(controller.getView())}`);
  }
  return { options, world, controller, advance, until };
}

for (const [seed, kind, key, slot] of [[4242, 'grapple', 'jaw', 0], [7331, 'ram', 'drive', 2]]) {
  test(`TOWJAW ${kind} vent releases a real plate; only observed motion opens the mechanism`, () => {
    const h = fixture(seed), plate = h.world.debris[slot], before = clone(plate);
    const committed = h.until(result => result.state.phase === 'commit');
    assert.equal(committed.state.attack.kind, kind);
    const result = h.until(value => value.events.some(event => event.type === 'armor-vented'));
    const vent = result.events.find(event => event.type === 'armor-vented');
    assert.equal(vent.entityId, plate.id); assert.equal(vent.mechanism, key);
    assert.equal(result.state.phase, 'exposed');
    assert.equal(result.state.armor.find(row => row.id === plate.id).status, 'venting');
    assert.equal(result.commands.some(row => row.type === 'release' && row.entityId === plate.id), true);
    assert.deepEqual(plate, before, 'a command cannot directly change the observed body, HP, mass or identity');
    assert.strictEqual(h.world.debris[slot], plate);
    assert.equal(isMechanismCovered(key, result.state, h.world), true,
      'opening a clamp does not instantly erase a plate which still occupies the incoming ray');

    const kick = result.commands.find(row => row.type === 'impulse' && row.entityId === plate.id);
    const reaction = result.commands.find(row => row.type === 'impulse' && row.reason === 'vent-reaction');
    assert.ok(kick && reaction);
    near(kick.x + reaction.x, 0); near(kick.z + reaction.z, 0);
    near(Math.hypot(kick.x, kick.z) / plate.mass, 14);
    assert.ok(Math.hypot(kick.x, kick.z) <= TOWJAW.maxImpulse);
    assert.equal(result.commands.some(row => row.type === 'launchScrap'
      || row.type === 'damage' && row.targetId === plate.id), false);
    const still = h.advance();
    assert.equal(still.commands.some(row => row.type === 'force' && row.entityId === plate.id), false,
      'released clamps must not secretly pull the physical plate back into coverage');
    assert.equal(isMechanismCovered(key, still.state, h.world), true);

    // Apply the requested momentum at this fixture's explicit observation
    // boundary. The controller neither executes this motion nor owns it.
    plate.vel.x += kick.x / plate.mass; plate.vel.z += kick.z / plate.mass;
    let observed = still;
    for (let tick = 0; tick < 60; tick++) {
      plate.pos.x += plate.vel.x * DT; plate.pos.z += plate.vel.z * DT;
      observed = h.advance();
    }
    assert.equal(isMechanismCovered(key, observed.state, h.world), false);
    assert.equal(observed.state.mechanisms[key].exposed, true);
    assert.equal(observed.state.armor.find(row => row.id === plate.id)?.status, 'venting',
      'ray exposure follows actual geometry even before the release-distance cleanup');
    for (let tick = 0; tick < 60; tick++) {
      plate.pos.x += plate.vel.x * DT; plate.pos.z += plate.vel.z * DT;
      observed = h.advance();
    }
    assert.equal(observed.state.armor.some(row => row.id === plate.id), false);
    assert.equal(plate.id, before.id); assert.equal(plate.mass, before.mass);
    assert.equal(plate.hull, before.hull); assert.equal(plate.alive, true);
    const recovered = h.until(value => value.state.phase === 'recover');
    assert.equal(recovered.state.outcome, null, 'a real exposed window returns to recovery');
    assert.equal(recovered.state.attack, null);
  });
}

for (const heldBy of ['playerHeld', 'pinned']) {
  test(`TOWJAW vent preserves a ${heldBy} plate without forcing the player's constraint`, () => {
    const h = fixture(), plate = h.world.debris[0];
    plate[heldBy] = true;
    const before = clone(plate);
    const result = h.until(value => value.events.some(event => event.type === 'armor-vented'));
    assert.equal(result.commands.some(row => row.type === 'release' && row.entityId === plate.id), true);
    assert.equal(result.commands.some(row => row.type === 'impulse'
      && (row.entityId === plate.id || row.reason === 'vent-reaction')), false);
    assert.deepEqual(plate, before);
    assert.equal(isMechanismCovered('jaw', result.state, h.world), true);
  });
}

test('TOWJAW restore cancels a ram hit while preserving the moving hull warning and bounded hard braking', () => {
  const h = fixture(7331);
  h.until(result => result.state.phase === 'attack');
  const snapshot = h.controller.snapshot();
  assert.equal(snapshot.attack.kind, 'ram');
  assert.equal(snapshot.attack.fired, true);
  h.world.boss.vel = { x: 80, z: 0 };
  const before = clone(h.world);
  const loaded = createTowjawController(h.options);
  assert.equal(loaded.restore(snapshot, h.world), true);
  let view = loaded.getView();
  assert.equal(view.phase, 'recover'); assert.equal(view.attack, null);
  assert.equal(view.coast.cancelled, true); assert.equal(view.coast.coasting, true);
  assert.deepEqual(view.coast.shapes, snapshot.attack.shapes);
  assert.equal(buildTowjawPresentationFrame(view, h.world).attack.coasting, true);
  h.world.simTime += DT;
  const result = loaded.step(DT, h.world);
  assert.equal(result.commands.some(row => ['damage', 'launchScrap', 'outcome'].includes(row.type)), false);
  const brake = result.commands.find(row => row.type === 'force' && row.reason === 'brake');
  assert.ok(brake && brake.x < 0);
  assert.ok(Math.hypot(brake.x, brake.z) > TOWJAW.bossAcceleration * h.world.boss.mass);
  assert.ok(Math.hypot(brake.x, brake.z) <= TOWJAW.maxForce);
  assert.deepEqual(h.world, { ...before, simTime: h.world.simTime });
  assert.deepEqual(loaded.step(DT, h.world).commands, [], 'the same simulation instant cannot repeat a braking impulse');

  // A delayed next owner update must keep the coast visible while velocity is
  // still observed; no saved scripted hit becomes active in that interval.
  h.world.simTime += 5;
  const later = loaded.step(DT, h.world);
  assert.ok(later.state.coast.endAt > h.world.simTime);
  assert.ok(buildTowjawPresentationFrame(later.state, h.world).attack);
  assert.equal(later.commands.some(row => row.type === 'damage' || row.type === 'launchScrap'), false);
  const reloaded = createTowjawController(h.options);
  assert.equal(reloaded.restore(loaded.snapshot(), h.world), true);
  assert.equal(reloaded.getView().coast.reason, 'load-braking', 'a second load preserves only the physical coast');
  h.world.boss.vel = { x: 0, z: 0 }; h.world.simTime += DT;
  view = reloaded.step(DT, h.world).state;
  assert.equal(view.coast, null);
  assert.equal(buildTowjawPresentationFrame(view, h.world).attack, null);
});

test('TOWJAW restore bounds malformed state and never adopts unknown or foreign body identities', () => {
  const h = fixture(), snapshot = h.controller.snapshot();
  const foreign = body(91, slotPosition(h.world.boss, 4), { eligible: false });
  h.world.debris.push(foreign);
  snapshot.phase = 'unknown'; snapshot.elapsed = 1e50; snapshot.phaseTime = 1e50;
  snapshot.targetArmor = 1e50; snapshot.cycles = 1e50; snapshot.castSequence = 1e50;
  snapshot.starvations = 1e50;
  snapshot.spentIds = Array.from({ length: 100 }, (_, index) => index + 1000);
  snapshot.lostIds = [null, {}, -2, 'x'.repeat(161)];
  snapshot.released = Array.from({ length: 100 }, (_, index) => ({ id: index, until: 1e50, ignored: foreign }));
  snapshot.armor = [
    { id: 999, slot: 3, status: 'latched' }, { id: 91, slot: 4, status: 'latched' },
    { id: 20, slot: 0, status: 'venting', age: 1e50 }, { id: 20, slot: 1, status: 'latched' },
    { id: 21, slot: 0, status: 'latched' }, { id: 22, slot: 99, status: 'latched' },
  ];
  snapshot.attack = { kind: 'shotgun', fired: true, ammo: [{ id: 91 }] };
  snapshot.coast = { kind: 'ram', shapes: [{ kind: 'lane', a: { x: NaN, z: 0 }, b: { x: 1, z: 0 } }] };
  h.world.boss.vel.x = 80;
  const before = clone(h.world), loaded = createTowjawController(h.options);
  assert.equal(loaded.restore(snapshot, h.world), true);
  const view = loaded.getView();
  assert.equal(view.phase, 'recover'); assert.equal(view.elapsed, TOWJAW.maxDurationS);
  assert.equal(view.phaseTime, TOWJAW.maxDurationS); assert.equal(view.targetArmor, TOWJAW.maxArmor);
  assert.equal(view.cycles, 10000); assert.equal(view.castSequence, 1000000);
  assert.equal(view.starvations, TOWJAW.starvationLimit);
  assert.equal(view.spentIds.length, TOWJAW.maxTracked);
  assert.equal(view.released.length, TOWJAW.maxTracked);
  assert.ok(view.released.every(row => row.until <= view.elapsed + 60 && Object.keys(row).length === 2));
  assert.deepEqual(view.armor.map(row => row.id), [20]);
  assert.equal(view.armor[0].status, 'venting'); assert.equal(view.armor[0].age, TOWJAW.reelS);
  assert.ok(view.lostIds.includes(999) && view.lostIds.includes(91));
  assert.equal(view.attack, null); assert.equal(view.coast, null);
  assert.deepEqual(h.world, before);
  assert.doesNotThrow(() => JSON.stringify(loaded.snapshot()));
  assert.equal(loaded.restore({ ...snapshot, encounterId: 'another-encounter' }, h.world), false);
  assert.deepEqual(loaded.getView(), view, 'identity mismatch is rejected without partially restoring');
});

test('TOWJAW coast restore reconstructs a bounded visible lane from scalars only', () => {
  const h = fixture(7331);
  h.until(result => result.state.phase === 'commit');
  const snapshot = h.controller.snapshot(), lane = snapshot.attack.shapes[0];
  snapshot.attack.startedAt = h.world.simTime + 1e9;
  snapshot.attack.castId = 'x'.repeat(1000);
  lane.radius = Infinity;
  lane.a.unrelated = { deeply: { nested: 'not a saved pose' } };
  lane.b.velocity = { x: 1e80, z: 1e80 };
  snapshot.attack.shapes.push(...Array.from({ length: 100 }, () => ({ kind: 'arc' })));
  h.world.boss.vel.x = 80;
  const loaded = createTowjawController(h.options);
  assert.equal(loaded.restore(snapshot, h.world), true);
  const view = loaded.getView(), coast = view.coast;
  assert.equal(view.attack, null); assert.equal(coast.shapes.length, 1);
  assert.equal(coast.castId.length, 180);
  assert.deepEqual(Object.keys(coast.shapes[0].a).sort(), ['x', 'z']);
  assert.deepEqual(Object.keys(coast.shapes[0].b).sort(), ['x', 'z']);
  assert.equal(coast.shapes[0].radius, TOWJAW_ATTACKS.ram.radius);
  assert.ok(coast.startedAt <= coast.fireAt && coast.fireAt < h.world.simTime && coast.endAt > h.world.simTime);
  assert.ok(buildTowjawPresentationFrame(view, h.world).attack, 'sanitized timestamps still show physical danger');
  snapshot.attack.shapes[0].b.x = snapshot.attack.shapes[0].a.x + 10000;
  assert.equal(loaded.restore(snapshot, h.world), true);
  assert.equal(loaded.getView().coast, null, 'a foreign giant corridor is not a valid saved ram warning');
});
