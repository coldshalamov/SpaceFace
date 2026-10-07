/**
 * Gyre Snare — held-verb telekinetic katamari lash (input.js 'gyreSnare' verb, Quote).
 *
 * Harness: curated sim host with production systems in production relative order
 * (gyreSnare → physics). Movement proofs boot the real SG-02 rapier-dynamic authority so
 * impulses actually cross the membrane — no mocks (same pattern as fields-integration).
 *
 * Coverage:
 *   • input-gated inertness: no key → strict no-op (golden-safe by construction)
 *   • basin pull: absorbables inside the maw basin gain Δv toward the maw (coupling-scaled)
 *   • snag → HOLD: first absorbable at the maw's heart becomes the clump core
 *   • hold: the core is spring-bound to a revolving orbit slot tracking the ship's nose
 *   • absorb: a second absorbable inside the suck band merges — mass union, entity gone
 *   • launch: release bowls the clump at launchSpeed along the nose, provenance stamped
 *   • cap drain gates activation and auto-bowls on dry
 *   • save:loaded drops the beam and unmarks the core
 *   • deterministic replay
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { gyreSnare } from '../src/systems/gyreSnare.js';
import { physics } from '../src/core/physics.js';
import { readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
import { GYRE_SNARE } from '../src/data/gyreSnare.js';

const DT = SIM_DT;
const T = GYRE_SNARE;

function boot(seed = 4242, { withPhysics = false } = {}) {
  const sim = createSimulation({
    seed,
    bus: createBus(),
    systems: withPhysics ? [gyreSnare, physics] : [gyreSnare],
  });
  const { state, helpers } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  player.cap = 100; // full capacitor — the verb drains it
  const events = [];
  for (const name of ['gyre:beamOn', 'gyre:beamOff', 'gyre:snagged', 'gyre:absorbed', 'gyre:launched', 'gyre:dropped', 'audio:cue', 'toast']) {
    sim.bus.on(name, (p) => events.push({ name, p, tick: state.tick }));
  }
  return { sim, state, bus: sim.bus, helpers, player, events, sys: sim.registry.get('gyreSnare'), physicsSys: sim.registry.get('physics') };
}

async function bootPhysics(seed = 4343) {
  const t = boot(seed, { withPhysics: true });
  t.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const ready = await t.physicsSys.prepareBackend(t.state);
  assert.equal(ready, true, 'SG-02 rapier-dynamic backend should initialize headless');
  t.cleanup = () => { if (typeof t.physicsSys._disableSg02DynamicAuthority === 'function') t.physicsSys._disableSg02DynamicAuthority(); };
  return t;
}

function rock(sim, x, z, mass = 6, radius = 4, type = 'asteroid') {
  return sim.spawn({
    type, team: 9, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius, collides: true,
    hull: 40, hullMax: 40,
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: mass * radius, dynamic: true, ccd: false, material: 'debris', revision: 0 },
    data: {},
  });
}

function speed(e) { return Math.hypot(e.vel.x, e.vel.z); }
function dist(a, b) { return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z); }

function hold(t) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
function release(t) { t.state.input.actions.gyreSnare = false; t.sim.step(); }

// ── golden inertness ─────────────────────────────────────────────────────────────
test('verb untouched → strict no-op (mirror off, no pull, no events)', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist + 10, 0); // dead center of where the basin would be
  for (let i = 0; i < 30; i++) t.sim.step();
  assert.equal(t.state.gyreSnare.phase, 'off');
  assert.equal(speed(body), 0, 'untouched verb moves nothing');
  assert.equal(t.events.length, 0);
  assert.equal(t.player.cap, 100, 'capacitor untouched');
  t.cleanup();
});

// ── basin pull ────────────────────────────────────────────────────────────────────
test('held verb pulls an absorbable in the basin toward the maw', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist + 40, 20); // inside basinRadius of the maw (maw at +x*200)
  hold(t);
  assert.equal(t.sys._rt.phase, 'beaming');
  for (let i = 0; i < 25; i++) t.sim.step();
  // It either reached the maw and snagged (HOLD) or is clearly inbound (-x velocity).
  const snagged = t.sys._rt.phase === 'holding' && t.sys._rt.coreId === body.id;
  assert.ok(snagged || body.vel.x < -0.5, `body pulled toward maw (vel.x=${body.vel.x}, phase=${t.sys._rt.phase})`);
  assert.ok(t.events.some((e) => e.name === 'gyre:beamOn'), 'beamOn emitted');
  assert.ok(t.player.cap < 100, 'capacitor drained while held');
  t.cleanup();
});

test('beam never touches the ship itself or non-absorbable skip types', async () => {
  const t = await bootPhysics();
  const station = rock(t.sim, T.mawDist + 20, 0, 400, 20, 'station');
  hold(t);
  for (let i = 0; i < 30; i++) t.sim.step();
  assert.equal(speed(t.player), 0, 'the pilot is never pulled by their own lash');
  assert.ok(speed(station) < 0.05, `skip type untouched, got ${speed(station)}`);
  t.cleanup();
});

// ── snag → hold → orbit tracking ──────────────────────────────────────────────────
test('an absorbable at the maw snags into the clump core and orbits ahead of the nose', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0); // parked on the maw heart
  hold(t);
  assert.equal(t.sys._rt.phase, 'holding', 'first absorbable at the maw snags');
  assert.equal(t.sys._rt.coreId, body.id);
  assert.equal(body.data.gyreCore, true);
  assert.ok(t.events.some((e) => e.name === 'gyre:snagged' && e.p.coreId === body.id));
  assert.ok(t.events.some((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_snag'), 'snag voice fired');

  // The clump stays tethered near the nose line: after settle, its distance from the maw
  // must stay within the orbit slot's envelope (orbit radius + lift breathing + slack).
  for (let i = 0; i < 60; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const mawX = t.player.pos.x + T.mawDist; // rot 0, player at origin
  const dMaw = Math.hypot(body.pos.x - mawX, body.pos.z - t.player.pos.z);
  const envelope = Math.max(T.orbitRadiusMin, T.maxClumpRadius * T.orbitRadiusScale)
    + T.orbitLiftRad + 30;
  assert.ok(dMaw <= envelope, `core rides the orbit slot (${dMaw.toFixed(1)} <= ${envelope.toFixed(1)})`);
  t.cleanup();
});

test('held clump tracks the ship when the nose rotates', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0);
  hold(t);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  // Rotate the ship 90° through the physics membrane (a raw rot write is read back from the
  // rapier body next tick — the continuation is the authoritative yaw rewrite).
  const { queueProjectileContinuation } = await import('../src/core/physicsAuthority.js');
  queueProjectileContinuation(t.player, { velocity: { x: 0, z: 0 }, yaw: Math.PI / 2 });
  for (let i = 0; i < 180; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const mawX = t.player.pos.x;                       // rot π/2 → maw at (0, +200)
  const mawZ = t.player.pos.z + T.mawDist;
  const dMaw = Math.hypot(body.pos.x - mawX, body.pos.z - mawZ);
  const envelope = Math.max(T.orbitRadiusMin, T.maxClumpRadius * T.orbitRadiusScale)
    + T.orbitLiftRad + 40;
  assert.ok(dMaw <= envelope, `clump followed the nose around (dMaw=${dMaw.toFixed(1)} <= ${envelope.toFixed(1)})`);
  t.cleanup();
});

// ── absorb (katamari growth) ──────────────────────────────────────────────────────
test('a second absorbable inside the suck band merges: mass union, member ledger, entity gone', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  const meal = rock(t.sim, T.mawDist + 30, 10, 6, 4); // inside basin AND suck band
  hold(t);
  for (let i = 0; i < 240 && t.sys._rt.members.length === 0; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  assert.equal(t.sys._rt.phase, 'holding');
  assert.equal(t.sys._rt.members.length, 1, 'one absorb record logged');
  assert.equal(meal.alive, false, 'the absorbed body is consumed');
  assert.ok(Math.abs(t.sys._rt.clumpMass - (6 + 6)) < 1e-6, `mass union 12, got ${t.sys._rt.clumpMass}`);
  assert.ok(t.sys._rt.clumpRadius > 4, 'volumetric radius grew');
  assert.ok(t.events.some((e) => e.name === 'gyre:absorbed' && e.p.victimId === meal.id), 'absorbed event fired');
  t.cleanup();
});

// ── launch ────────────────────────────────────────────────────────────────────────
test('release bowls the clump along the nose at launch speed with kill-credit provenance', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0, 8, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const preMass = t.sys._rt.clumpMass;

  release(t);
  // Burn through the launch ticks.
  for (let i = 0; i < T.launchTicks + 2; i++) t.sim.step();

  assert.equal(t.sys._rt.phase, 'off', 'launch burst finished → back to off');
  assert.equal(body.data.gyreLaunched, true, 'ball marked thrown');
  assert.equal(body.data.gyreCore, undefined, 'core mark cleared');
  assert.ok(body.data.despawnAt > t.state.simTime, 'bounded flight TTL set');
  const wantScale = Math.min(T.launchImpactScaleMax, T.launchImpactScaleBase + preMass / T.launchImpactScalePerMass);
  assert.ok(Math.abs(body.physicsBody.impactDamageScale - wantScale) < 1e-9, 'impact damage scaled by clump mass');
  const v = speed(body);
  assert.ok(v > T.launchSpeed * 0.7 && v < T.launchSpeed * 1.3, `ball speed ≈ ${T.launchSpeed} wu/s, got ${v.toFixed(1)}`);
  // Direction: mostly along the +x nose.
  const dot = (body.vel.x * 1 + body.vel.z * 0) / v;
  assert.ok(dot > 0.9, `bowled straight ahead (dot=${dot.toFixed(2)})`);
  const prov = readRecentImpulseProvenance(body, t.state.tick);
  assert.ok(prov, 'impulse provenance stamped');
  assert.equal(prov.actorId, t.player.id, 'the pilot owns the kill');
  assert.equal(prov.tag, 'gyre_launch');
  assert.ok(prov.holdUntilTick > t.state.tick, 'credit held through the whole flight');
  assert.ok(t.events.some((e) => e.name === 'gyre:launched'), 'launched event fired');
  assert.ok(t.events.some((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_launch'), 'launch voice fired');
  t.cleanup();
});

test('releasing an empty beam just closes it (no launch, no ghost ball)', async () => {
  const t = await bootPhysics();
  hold(t);
  release(t);
  assert.equal(t.sys._rt.phase, 'off');
  assert.ok(t.events.some((e) => e.name === 'gyre:dropped' && e.p.reason === 'released'));
  assert.equal(t.events.some((e) => e.name === 'gyre:launched'), false);
  t.cleanup();
});

// ── capacitor gates ───────────────────────────────────────────────────────────────
test('low capacitor refuses to wake the beam (warn toast, stays off)', async () => {
  const t = await bootPhysics();
  t.player.cap = T.capActivateMin - 1;
  hold(t);
  assert.equal(t.sys._rt.phase, 'off');
  assert.ok(t.events.some((e) => e.name === 'toast'), 'warn toast fired');
  t.cleanup();
});

test('a dry capacitor mid-hold auto-bowls the clump', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  t.player.cap = 0.02; // nearly dry — next tick's hold drain empties it
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.ok(t.events.some((e) => e.name === 'gyre:launched'), 'dry tank bowls the ball');
  assert.equal(body.data.gyreLaunched, true);
  t.cleanup();
});

// ── boundaries ────────────────────────────────────────────────────────────────────
test('save:loaded drops the beam cold and unmarks the core', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0);
  hold(t);
  assert.equal(t.sys._rt.phase, 'holding');
  t.bus.emit('save:loaded', {});
  assert.equal(t.sys._rt.phase, 'off');
  assert.equal(body.data.gyreCore, undefined, 'core mark stripped');
  t.cleanup();
});

test('docked / non-flight contexts never activate', async () => {
  const t = await bootPhysics();
  t.state.mode = 'dock';
  rock(t.sim, T.mawDist, 0);
  hold(t);
  assert.equal(t.sys._rt.phase, 'off');
  t.cleanup();
});

// ── deterministic replay ──────────────────────────────────────────────────────────
test('two identical runs produce identical clump trajectories', async () => {
  async function run() {
    const t = await bootPhysics(7777);
    const body = rock(t.sim, T.mawDist + 20, 12, 5, 4);
    for (let i = 0; i < 90; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
    const snap = { x: body.pos.x, z: body.pos.z, phase: t.sys._rt.phase, mass: t.sys._rt.clumpMass };
    t.cleanup();
    return snap;
  }
  const a = await run();
  const b = await run();
  assert.deepEqual(a, b, 'identical seed/inputs → identical lash');
});

// ── katamari mass is real physics ────────────────────────────────────────────────
test('absorbed mass lands on the authored body — launch speed stays authored regardless of clump mass', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  const meal = rock(t.sim, T.mawDist + 30, 10, 48, 8); // a heavy meal — clump ends 54 t
  hold(t);
  for (let i = 0; i < 400 && t.sys._rt.members.length === 0; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  assert.equal(t.sys._rt.members.length, 1, 'the meal was absorbed');
  assert.ok(Math.abs(t.sys._rt.clumpMass - 54) < 1e-6, `clump mass 54, got ${t.sys._rt.clumpMass}`);
  // The rapier-side mass genuinely grew — this is what keeps the spring/launch honest.
  assert.ok(Math.abs(core.physicsBody.mass - 54) < 1e-6,
    `authored body mass tracks the clump (got ${core.physicsBody.mass})`);
  assert.ok(core.physicsBody.radius > 4, 'authored collider radius grew with the clump');

  release(t);
  for (let i = 0; i < T.launchTicks + 3; i++) t.sim.step();
  const v = speed(core);
  assert.ok(v > T.launchSpeed * 0.7 && v < T.launchSpeed * 1.3,
    `grown ball bowls at authored speed ${T.launchSpeed}, got ${v.toFixed(1)}`);
  t.cleanup();
});

test('multiple absorbs feed the ledger and the volumetric radius', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  const mealA = rock(t.sim, T.mawDist + 24, 8, 6, 4);
  const mealB = rock(t.sim, T.mawDist - 22, -9, 6, 4);
  hold(t);
  for (let i = 0; i < 500 && t.sys._rt.members.length < 2; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  assert.equal(t.sys._rt.members.length, 2, 'two absorb records');
  assert.equal(mealA.alive, false);
  assert.equal(mealB.alive, false);
  assert.ok(Math.abs(t.sys._rt.clumpMass - 18) < 1e-6, `mass union 18, got ${t.sys._rt.clumpMass}`);
  assert.ok(Math.abs(core.physicsBody.mass - 18) < 1e-6);
  t.cleanup();
});

// ── boundary residue ─────────────────────────────────────────────────────────────
test('save:loaded sweeps a serialized gyreCore flag off a rock the ledger never knew', async () => {
  const t = await bootPhysics();
  const stale = rock(t.sim, 500, 500);
  stale.data.gyreCore = true; // as if a mid-hold save serialized the mark
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  t.bus.emit('save:loaded', {});
  assert.equal(stale.data.gyreCore, undefined, 'boundary drop sweeps serialized residue');
  t.cleanup();
});

// ── launch edge cases ─────────────────────────────────────────────────────────────
test('re-tapping during the launch burst does not truncate the bowl', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0, 10, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  assert.equal(t.sys._rt.phase, 'launching');
  // Re-press and release inside the 5-tick burst — the launch must finish its impulse.
  hold(t); release(t);
  for (let i = 0; i < T.launchTicks + 2; i++) t.sim.step();
  const v = speed(body);
  assert.ok(v > T.launchSpeed * 0.7,
    `a release inside the burst still bowls at ${T.launchSpeed}, got ${v.toFixed(1)}`);
  t.cleanup();
});

test('re-beaming while the ball still flies keeps the mirror on the ball', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0, 8, 4);
  hold(t);
  for (let i = 0; i < 15; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < T.launchTicks + 2; i++) t.sim.step(); // burst done → OFF
  assert.equal(t.sys._rt.phase, 'off');
  assert.equal(t.state.gyreSnare.launchedId, body.id, 'mirror still tracks the flying ball');
  // A fresh grip opens a new beam without losing the ball's mirror track.
  hold(t);
  assert.equal(t.sys._rt.phase, 'beaming');
  assert.equal(t.state.gyreSnare.launchedId, body.id, 'ball overlay survives the new beam');
  assert.ok(Math.hypot(t.state.gyreSnare.ballPos.x - body.pos.x,
    t.state.gyreSnare.ballPos.z - body.pos.z) < T.launchSpeed * DT + 1,
    'ballPos mirrors the live ball (one publish tick of lag at most)');
  t.cleanup();
});

// ── cap drain rate ────────────────────────────────────────────────────────────────
test('capacitor drains at the authored rate — ×1.35 while a clump is held', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0);
  hold(t);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const before = t.player.cap;
  for (let i = 0; i < 60; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const drained = before - t.player.cap;
  const want = T.capDrainPerS * T.capHoldMult * (60 * DT);
  assert.ok(Math.abs(drained - want) < want * 0.02,
    `hold drain ≈ ${want.toFixed(2)} over 1 s, got ${drained.toFixed(2)}`);
  t.cleanup();
});

// ── snag eligibility ──────────────────────────────────────────────────────────────
test('a pickup or persistent body never becomes the core', async () => {
  const t = await bootPhysics();
  const pickup = rock(t.sim, T.mawDist, 0, 2, 2, 'pickup');
  const persistent = rock(t.sim, T.mawDist + 8, 4, 6, 4, 'wreck');
  persistent.flags = { persistent: true };
  hold(t);
  for (let i = 0; i < 120; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.notEqual(t.sys._rt.coreId, pickup.id, 'sensor-bodied pickup never cores');
  assert.notEqual(t.sys._rt.coreId, persistent.id, 'persistent mass never cores');
  t.cleanup();
});
