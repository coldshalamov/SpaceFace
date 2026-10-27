/**
 * Packet 05 baseline: place Pull beside loose matter -> collect it with Gyre -> release as a throw.
 * Every claim in the packet's "find the real breaks" list is a test here: refuted ones stay as
 * regression guards, confirmed ones were fixed in the same commit.
 *
 *   • the aggregate never teleports into the ship, and the throw leaves from where the ball is
 *   • a swallowed body pays nothing twice: no loot, no kill, no second absorb
 *   • every refusal has its own stable code (protected / anchored / collectible / claimed /
 *     too-heavy / saturated / dry-charge), published on the mirror and as a matter:refused event
 *   • capture is a reserved transaction: a reentrant absorb cannot double-count mass
 *   • a saturated net stops swallowing AND stops pulling
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { fields } from '../src/systems/fields.js';
import { gyreSnare } from '../src/systems/gyreSnare.js';
import { physics } from '../src/core/physics.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { GYRE_SNARE as T } from '../src/data/gyreSnare.js';
import { MATTER_REFUSAL } from '../src/matter/aggregateMass.js';

function boot(seed, { fieldsOn = false, withPhysics = false } = {}) {
  const systems = [];
  if (fieldsOn) systems.push(fields);
  systems.push(gyreSnare);
  if (withPhysics) systems.push(physics);
  const sim = createSimulation({ seed, bus: createBus(), systems });
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
  player.cap = 100;
  const events = [];
  for (const name of ['entity:destroyed', 'entity:killed', 'matter:refused', 'gyre:absorbed', 'gyre:snagged',
    'gyre:launched', 'gyre:thrown', 'toast', 'pickup:spawned', 'loot:dropped']) {
    sim.bus.on(name, (p) => events.push({ name, p, tick: state.tick }));
  }
  return { sim, state, player, events, sys: sim.registry.get('gyreSnare'), physicsSys: sim.registry.get('physics') };
}

async function bootPhysics(seed) {
  const t = boot(seed, { fieldsOn: true, withPhysics: true });
  t.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await t.physicsSys.prepareBackend(t.state), true, 'rapier-dynamic backend initializes headless');
  t.cleanup = () => { if (typeof t.physicsSys._disableSg02DynamicAuthority === 'function') t.physicsSys._disableSg02DynamicAuthority(); };
  return t;
}

function matter(sim, x, z, mass = 12, radius = 6, type = 'asteroid') {
  return sim.spawn({
    type, team: 9, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius, collides: true,
    hull: 40, hullMax: 40,
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: mass * radius, dynamic: true, ccd: false, material: 'debris', revision: 0 },
    data: {},
  });
}

function hold(t) {
  t.state.input.actions.gyreSnare = true; t.sim.step();
  for (let i = 0; i < 13 && t.sys._rt.phase === 'beaming'; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
}

// ── the loop ────────────────────────────────────────────────────────────────────────────────────

test('Pull -> Gyre -> throw: nothing teleports, the ball leaves from where it is, mass is counted once', async () => {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const t = await bootPhysics(9001);
  try {
    const rocks = [matter(t.sim, 330, 60), matter(t.sim, 380, -50), matter(t.sim, 310, -80, 20, 8, 'wreck'),
      matter(t.sim, 420, 40, 8, 5), matter(t.sim, 360, 100, 15, 7, 'wreck')];
    const totalMass = rocks.reduce((s, r) => s + r.physicsBody.mass, 0);
    const r3 = rocks.reduce((s, r) => s + r.physicsBody.radius ** 3, 0); // before the core grows
    t.state.input.aimWorld = { x: 350, z: 0 };
    t.state.input.actions.deployWell = true;
    t.sim.step();
    assert.equal(Object.keys(t.state.fields.deployed).length, 1, 'Pull placed a well');
    for (let i = 0; i < 360; i++) t.sim.step();
    // The pile gathered at the well: every rock is inside the well's footprint, none was captured.
    for (const r of rocks) assert.ok(Math.hypot(r.pos.x - 350, r.pos.z) < 60, 'the well piled the matter');
    assert.equal(t.sys._rt.phase, 'off');

    // Collect with Gyre: the ship moves so the maw sits on the pile. Track the core every tick.
    t.player.pos.x = 150;
    const startedAt = new Map(rocks.map((r) => [r.id, { x: r.pos.x, z: r.pos.z }]));
    let core = null, prev2 = null, maxStep = 0, snagTick = -1;
    for (let i = 0; i < 60; i++) {
      t.state.input.actions.gyreSnare = true; t.sim.step();
      if (!core && t.sys._rt.coreId != null) { core = t.state.entities.get(t.sys._rt.coreId); snagTick = t.state.tick; }
      if (core) {
        if (prev2) maxStep = Math.max(maxStep, Math.hypot(core.pos.x - prev2.x, core.pos.z - prev2.z));
        prev2 = { x: core.pos.x, z: core.pos.z };
      }
    }
    assert.ok(core, 'the pile was snagged');
    assert.ok(maxStep < 12, `the core moves continuously (max ${maxStep.toFixed(2)} wu/tick, never a teleport)`);
    assert.ok(Math.hypot(core.pos.x - t.player.pos.x, core.pos.z - t.player.pos.z) > 100, 'the ball is held at the maw, not inside the ship');

    // Mass: the core is the one authoritative body; every member was removed exactly once.
    const merged = t.events.filter((e) => e.name === 'gyre:absorbed');
    assert.equal(merged.length, rocks.length - 1, 'every other body merged into the core');
    // MEASURED before the fix: all four pile members merged on ONE tick (one pop). Now the mass
    // visibly climbs — one meal per gap, nearest first — and the whole pile is still in within a beat.
    for (let i = 1; i < merged.length; i++) {
      assert.ok(merged[i].tick - merged[i - 1].tick >= T.absorbGapTicks, `meals are staggered (tick ${merged[i - 1].tick} -> ${merged[i].tick})`);
    }
    assert.ok(merged[merged.length - 1].tick - merged[0].tick <= T.absorbGapTicks * merged.length + 4, 'the pile folds in within a beat');
    assert.equal(core.physicsBody.mass, totalMass, 'collision mass equals the sum of what was gathered');
    assert.ok(Math.abs(core.physicsBody.radius - Math.cbrt(r3)) < 1e-6 || core.physicsBody.radius === T.maxClumpRadius, `radius ${core.physicsBody.radius} vs ${Math.cbrt(r3)}`);
    assert.equal(rocks.filter((r) => r !== core && r.alive !== false).length, 0, 'consumed members no longer exist');

    // Double reward: the consumed bodies paid nothing — no kill, no loot, no pickup.
    assert.equal(t.events.filter((e) => e.name === 'entity:killed').length, 0);
    assert.equal(t.events.filter((e) => e.name === 'pickup:spawned' || e.name === 'loot:dropped').length, 0);
    assert.equal(t.state.entityList.filter((e) => e.type === 'pickup').length, 0);

    // Release: the throw leaves from the ball's own position along the frozen nose, at the plan speed.
    const beforeRelease = { x: core.pos.x, z: core.pos.z };
    t.state.input.actions.gyreSnare = false;
    let firstBurst = null;
    for (let i = 0; i < 40; i++) {
      t.sim.step();
      if (!firstBurst && t.events.some((e) => e.name === 'gyre:thrown')) firstBurst = { x: core.pos.x, z: core.pos.z, tick: t.state.tick };
    }
    assert.ok(firstBurst, 'the ball was thrown');
    assert.ok(Math.hypot(firstBurst.x - beforeRelease.x, firstBurst.z - beforeRelease.z) < D_COIL_REACH(core),
      'the throw starts within the coil reach of the held position — no jump to the ship');
    assert.ok(core.vel.x > T.launchSpeed * 0.7, `thrown along +x at speed (${core.vel.x.toFixed(0)})`);
    assert.equal(core.data.gyreLaunched, true);
    assert.equal(core.data.gyreLaunchMeta.weaponId, 'wpn_gyre_snare');
    void startedAt; void snagTick;
  } finally {
    FIELD_FLAGS.enabled = prev;
    t.cleanup();
  }
});

// The coil drags the ball to a point on the frozen aim axis; the throw may start anywhere inside the
// orbit slot's reach of it. This is the honest bound of "from where it is".
function D_COIL_REACH(core) {
  const r = core.physicsBody.radius;
  return Math.max(T.orbitRadiusMin, r * T.orbitRadiusScale) + T.orbitLiftWu * 2 + T.launchWindupPullWu + r * 0.4 + 30;
}

// ── refusal codes ───────────────────────────────────────────────────────────────────────────────

function refusals(t) { return t.state.gyreSnare.refusals; }
function refusedEvents(t, code) { return t.events.filter((e) => e.name === 'matter:refused' && e.p.code === code); }

test('protected cargo is refused with its own code, still tugged, never swallowed', () => {
  const t = boot(1);
  const wreck = matter(t.sim, T.mawDist + 8, 0, 12, 4, 'wreck');
  wreck.data.salvagePool = { cmdty_ore_iron: 2 };
  hold(t);
  assert.equal(t.sys._rt.phase, 'beaming', 'protected cargo never cores');
  assert.equal(refusals(t).protected, 1);
  assert.equal(t.state.gyreSnare.refusal, MATTER_REFUSAL.PROTECTED);
  assert.equal(refusedEvents(t, 'protected').length, 1, 'the refusal is announced once, on the edge');
  assert.equal(refusedEvents(t, 'protected')[0].p.tool, 'gyre');
  assert.equal(wreck.alive, true);
  assert.deepEqual(wreck.data.salvagePool, { cmdty_ore_iron: 2 });
});

test('an anchored landmark under the glass says anchored, not nothing', () => {
  const t = boot(2);
  const rock = matter(t.sim, T.mawDist, 20, 900, 20);
  rock.data.isLandmarkRock = true;
  rock.physicsBody = { schemaVersion: 1, radius: 20, mass: 900, dynamic: false, material: 'rock', revision: 0 };
  hold(t);
  assert.equal(t.sys._rt.phase, 'beaming');
  assert.equal(refusals(t).anchored, 1);
  assert.equal(t.state.gyreSnare.refusal, MATTER_REFUSAL.ANCHORED);
  assert.equal(rock.alive, true);
});

test('loot is collectible, not matter: tugged and named, never swallowed', () => {
  const t = boot(3);
  const pod = matter(t.sim, T.mawDist + 4, 0, 3, 3, 'pickup');
  hold(t);
  assert.equal(t.sys._rt.phase, 'beaming');
  assert.equal(refusals(t).collectible, 1);
  assert.equal(t.state.gyreSnare.towCount, 1, 'the tow read is unchanged');
  assert.equal(pod.alive, true);
});

test('a body another tool already holds is claimed: Gyre cannot snag, tug-absorb or steal it', () => {
  const t = boot(4);
  const knot = matter(t.sim, T.mawDist + 2, 0, 60, 14);
  knot.data.collectorCore = 'field_x';
  hold(t);
  assert.equal(t.sys._rt.phase, 'beaming', 'a collector knot is not a snag candidate');
  assert.equal(refusals(t).claimed, 1);
  assert.equal(t.sys._absorb(t.state, t.sys._rt, knot, knot, 0, 0, 0), false);
  assert.equal(knot.alive, true);
});

test('too-heavy keeps its historical code and now rides the refusal mirror', () => {
  const t = boot(5);
  matter(t.sim, T.mawDist, 0, 50, T.maxClumpRadius + 4);
  hold(t);
  assert.equal(refusals(t)['too-heavy'], 1);
  assert.equal(t.state.gyreSnare.tooHeavyCount, 1);
  assert.equal(t.state.gyreSnare.refusal, MATTER_REFUSAL.TOO_HEAVY);
});

test('a dry capacitor is its own refusal, announced with what was needed and what is held', () => {
  const t = boot(6);
  t.player.cap = 3;
  t.state.input.actions.gyreSnare = true;
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off');
  const dry = refusedEvents(t, 'dry-charge');
  assert.equal(dry.length, 1);
  assert.equal(dry[0].p.need, T.capActivateMin);
  assert.equal(dry[0].p.have, 3);
  assert.ok(t.events.some((e) => e.name === 'toast' && /needs charge/.test(e.p.text)), 'the existing toast text is unchanged');
});

test('a saturated net stops swallowing AND stops pulling, and says why', () => {
  const t = boot(7);
  const core = matter(t.sim, T.mawDist, 0, 30, 8);
  hold(t);
  assert.equal(t.sys._rt.coreId, core.id);
  // Fill the ledger to capacity (the cap is the member ledger, not tonnage).
  while (t.sys._rt.members.length < T.maxAbsorbRecords) {
    t.sys._rt.members.push({ type: 'asteroid', material: 'rock', typeId: null, mass: 1, radius: 1, nx: 0, nz: 0 });
  }
  const meal = matter(t.sim, core.pos.x + core.physicsBody.radius + 6, core.pos.z + 20, 6, 4);
  const massBefore = t.sys._rt.clumpMass;
  t.state.input.actions.gyreSnare = true;
  for (let i = 0; i < 6; i++) t.sim.step();
  assert.equal(meal.alive, true, 'a full net eats nothing more');
  assert.equal(t.sys._rt.clumpMass, massBefore);
  assert.equal(t.state.gyreSnare.full, true);
  assert.ok(refusals(t).saturated >= 1, 'FULL is a counted, named refusal');
  assert.equal(t.state.gyreSnare.refusal, MATTER_REFUSAL.SATURATED);
  assert.equal(refusedEvents(t, 'saturated').length, 1);
});

// ── the reserved capture transaction ────────────────────────────────────────────────────────────

test('capture reserves before it mutates: a reentrant absorb of the same body cannot double-count', () => {
  const t = boot(8);
  const core = matter(t.sim, T.mawDist, 0, 30, 8);
  hold(t);
  assert.equal(t.sys._rt.coreId, core.id);
  const meal = matter(t.sim, core.pos.x + 10, core.pos.z, 10, 4);
  let reentered = 0;
  t.sim.bus.on('gyre:absorbed', (p) => {
    // A subscriber (or a save callback) that tries to capture the same body again mid-transaction.
    if (p.victimId === meal.id) { reentered += 1; t.sys._absorb(t.state, t.sys._rt, core, meal, 5, 0, 5); }
  });
  const before = t.sys._rt.clumpMass;
  assert.equal(t.sys._absorb(t.state, t.sys._rt, core, meal, 5, 0, 5), true);
  assert.equal(reentered, 1);
  assert.equal(t.sys._rt.clumpMass, before + 10, 'the body counted exactly once');
  assert.equal(t.sys._rt.members.length, 1);
  assert.equal(t.sys._rt.capture.size, 1);
  // A repeated contact on the now-dead body is a no-op too.
  assert.equal(t.sys._absorb(t.state, t.sys._rt, core, meal, 5, 0, 5), false);
  assert.equal(t.sys._rt.clumpMass, before + 10);
});

test('a failure inside the merge gives the reservation back and leaves the ledger as it was', () => {
  const t = boot(9);
  const core = matter(t.sim, T.mawDist, 0, 30, 8);
  hold(t);
  const meal = matter(t.sim, core.pos.x + 10, core.pos.z, 10, 4);
  const rt = t.sys._rt;
  const mass = rt.clumpMass, radius = rt.clumpRadius;
  const orig = t.sys._mergeMeal;
  t.sys._mergeMeal = () => { throw new Error('boom'); };
  assert.throws(() => t.sys._absorb(t.state, rt, core, meal, 5, 0, 5), /boom/);
  t.sys._mergeMeal = orig;
  assert.equal(rt.clumpMass, mass);
  assert.equal(rt.clumpRadius, radius);
  assert.equal(rt.capture.pending, 0, 'the ticket was returned');
  assert.equal(meal.alive, true);
  assert.equal(t.sys._absorb(t.state, rt, core, meal, 5, 0, 5), true, 'the body can still be taken afterwards');
});
