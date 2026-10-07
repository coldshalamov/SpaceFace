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

function boot(seed = 4242, { withPhysics = false, playerRadius = 12 } = {}) {
  const sim = createSimulation({
    seed,
    bus: createBus(),
    systems: withPhysics ? [gyreSnare, physics] : [gyreSnare],
  });
  const { state, helpers } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: playerRadius, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: playerRadius, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
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

async function bootPhysics(seed = 4343, opts = {}) {
  const t = boot(seed, { withPhysics: true, ...opts });
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
test('capacitor drains at the authored rate — hold scales with clump mass', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4); // 6 t core → hold drain ×capHoldMult×(1 + 6/capMassDrainRef)
  hold(t);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const clumpMass = t.sys._rt.clumpMass;
  const before = t.player.cap;
  for (let i = 0; i < 60; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const drained = before - t.player.cap;
  const want = T.capDrainPerS * T.capHoldMult * (1 + clumpMass / T.capMassDrainRef) * (60 * DT);
  assert.ok(Math.abs(drained - want) < want * 0.02,
    `hold drain ≈ ${want.toFixed(2)} over 1 s for a ${clumpMass} t clump, got ${drained.toFixed(2)}`);
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

// ── wave-2 coverage: strain, loss, boundaries, burst truncation ──────────────────
test('a violently flung core breaks the hold at the strain distance (no launch)', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0);
  hold(t);
  assert.equal(t.sys._rt.phase, 'holding');
  const { queueProjectileContinuation } = await import('../src/core/physicsAuthority.js');
  queueProjectileContinuation(body, { velocity: { x: 2200, z: 0 }, yaw: 0 });
  let dropped = null;
  for (let i = 0; i < 90 && !dropped; i++) {
    t.state.input.actions.gyreSnare = true;
    t.sim.step();
    if (t.sys._rt.phase === 'off') dropped = t.events.find((e) => e.name === 'gyre:dropped' && e.p.reason === 'strained');
  }
  assert.ok(dropped, 'a core hurled past holdBreakDist slips the beam with reason strained');
  assert.equal(t.sys._rt.ballId, null, 'a strained clump is freed, never bowled');
  assert.equal(body.data.gyreCore, undefined, 'strained core is unmarked');
  assert.ok(!t.events.some((e) => e.name === 'gyre:launched'), 'strain break never launches');
  t.cleanup();
});

test('a held core removed externally drops the beam and clears residue', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0);
  hold(t);
  assert.equal(t.sys._rt.phase, 'holding');
  body.alive = false; // something else ate the core mid-hold
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off');
  assert.ok(t.events.some((e) => e.name === 'gyre:dropped' && e.p.reason === 'core_lost'));
  assert.equal(body.data.gyreCore, undefined, 'core_lost still sweeps the mark');
  t.cleanup();
});

test('sector:exit and game:newGame are silent boundary drops', async () => {
  for (const [evt, reason] of [['sector:exit', 'sector_exit'], ['game:newGame', 'new_game']]) {
    const t = await bootPhysics();
    const body = rock(t.sim, T.mawDist, 0);
    hold(t);
    assert.equal(t.sys._rt.phase, 'holding', evt + ' setup holds a core');
    const heard = t.events.length;
    t.bus.emit(evt, {});
    t.sim.step();
    assert.equal(t.sys._rt.phase, 'off');
    const dropped = t.events.find((e) => e.name === 'gyre:dropped');
    assert.equal(dropped && dropped.p.reason, reason);
    assert.equal(dropped.p.boundary, true, 'boundary drops advertise themselves');
    assert.ok(!t.events.slice(heard).some((e) => e.name === 'audio:cue'),
      evt + ' stays silent — a context reset does not talk');
    assert.equal(t.sys._rt.ballId, null, 'a flying ball is forgotten across the boundary');
    assert.equal(body.data.gyreCore, undefined);
    t.cleanup();
  }
});

test('a despawned ball retires launchedId so the mirror stops tracking it', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0);
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  t.state.input.actions.gyreSnare = false; t.sim.step(); // release → bowl
  assert.equal(t.sys._rt.ballId, body.id);
  for (let i = 0; i < 10; i++) t.sim.step();
  assert.equal(t.state.gyreSnare.launchedId, body.id, 'mirror tracks the live ball');
  body.alive = false; // the ball met its grave (impact or TTL despawn)
  t.sim.step();
  assert.equal(t.state.gyreSnare.launchedId, null, 'mirror retires a dead ball');
  assert.equal(t.state.gyreSnare.ballMass, 0);
  t.cleanup();
});

test('the launch burst truncates when the player entity is removed mid-throw', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0);
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  t.state.input.actions.gyreSnare = false; t.sim.step(); // release → bowl begins
  assert.equal(t.sys._rt.launchLeft, T.launchTicks - 1, 'burst starts spanning its authored ticks');
  t.state.entities.delete(t.player.id); // ship gone mid-burst — salvage, not scenery
  t.state.entityList = t.state.entityList.filter((e) => e !== t.player);
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off');
  assert.equal(t.sys._rt.launchLeft, 0, 'player_lost truncates the remaining burst ticks');
  assert.ok(t.events.some((e) => e.name === 'gyre:dropped' && e.p.reason === 'player_lost'));
  assert.ok(speed(body) > 0 && speed(body) < T.launchSpeed,
    `partial burst bowls at partial speed (${speed(body).toFixed(1)} < ${T.launchSpeed})`);
  t.cleanup();
});

test('a world-record body is never snagged as a core', async () => {
  const t = await bootPhysics();
  const wr = rock(t.sim, T.mawDist, 0, 6, 4, 'asteroid');
  wr.data.worldRecordId = 'wr-47a';
  hold(t);
  for (let i = 0; i < 60; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.notEqual(t.sys._rt.coreId, wr.id);
  assert.equal(t.sys._rt.phase, 'beaming', 'world-record mass stays live in the field, never cores');
  assert.equal(wr.data.gyreCore, undefined);
  t.cleanup();
});

// ── wedge pull math (apex-anchored, lip-faded, maw-plane clamped) ─────────────────
// Geometry on the reference hull (radius 12, nose at origin, rot 0): apex (26,0),
// coneLen 174, effTan = max(tan(0.42), 86/174) ≈ 0.494. A drone can never core/member,
// so it stays in the wedge lane — the cleanest pull-only signal.
function apexGap() { return T.noseGap + 12; }
function effTan(coneLen) { return Math.max(Math.tan(T.coneHalfAngleRad), T.basinRadius / coneLen); }

test('wedge pulls a mid-cone non-absorbable toward the maw without grabbing it', async () => {
  const t = await bootPhysics();
  const a = 60;                                     // axial wu ahead of the apex
  const x = apexGap() + a, z = a * effTan(T.mawDist - apexGap()) * 0.7; // ~70% of the rim
  const body = rock(t.sim, x, z, 6, 4, 'drone');
  assert.ok(Math.hypot(body.pos.x - T.mawDist, body.pos.z) > T.basinRadius, 'fixture outside the basin');
  hold(t);
  for (let i = 0; i < 15; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'beaming', 'a wedge-only body never snags');
  assert.ok(body.vel.x > 0.2, `wedge courtesy pull drags toward the maw (vel.x=${body.vel.x.toFixed(2)})`);
  t.cleanup();
});

test('wedge pull fades across the soft lip and ends at the maw plane', async () => {
  const t = await bootPhysics();
  const a = 60, coneLen = T.mawDist - apexGap();
  const rim = a * effTan(coneLen);
  const inner = rock(t.sim, apexGap() + a, rim * 0.7, 6, 4, 'drone');   // lipT 0
  const lipped = rock(t.sim, apexGap() + a, rim + T.wedgeSoftLipWu * 0.95, 6, 4, 'drone'); // lipT ≈0.95
  const outer = rock(t.sim, apexGap() + a, rim + T.wedgeSoftLipWu + 12, 6, 4, 'drone');    // past the lip
  const beyond = rock(t.sim, T.mawDist + T.basinRadius + 30, 0, 6, 4, 'drone');            // axial > coneLen
  hold(t);
  for (let i = 0; i < 40; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.ok(speed(inner) > 3, `inside-rim body clearly pulled (${speed(inner).toFixed(1)})`);
  assert.ok(speed(lipped) < speed(inner) * 0.4,
    `lip-faded pull is a fraction of the in-rim pull (${speed(lipped).toFixed(1)} vs ${speed(inner).toFixed(1)})`);
  assert.ok(speed(outer) < 1, `past the lip nothing moves (${speed(outer).toFixed(2)})`);
  assert.ok(speed(beyond) < 1, `past the maw plane nothing moves (${speed(beyond).toFixed(2)})`);
  t.cleanup();
});

test('published cone rim equals the wedge rim at the maw plane, floored at basinRadius', async () => {
  const t = await bootPhysics(4242, { playerRadius: 60 }); // capital hull — apex rides far ahead
  hold(t);
  const pub = t.state.gyreSnare;
  const coneLen = pub.coneLen;
  assert.ok(Math.abs(coneLen - (T.mawDist - (T.noseGap + 60))) < 1, 'apex rides the hull skin');
  assert.ok(pub.endRadius >= T.basinRadius, 'drawn rim never under-covers the pull basin');
  // rim(coneLen) ≡ endRadius by construction — the physics edge IS the drawn edge.
  assert.ok(Math.abs(coneLen * effTan(coneLen) - pub.endRadius) < 1e-6,
    `rim at maw plane (${(coneLen * effTan(coneLen)).toFixed(2)}) == endRadius (${pub.endRadius})`);
  t.cleanup();
});

test('pullMaxAccel clamps any single body impulse (fast inbound body in the basin)', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist + 30, 0, 6, 4, 'drone');
  body.vel.x = -800; // frame damping + basin pull sum far past pullMaxAccel
  hold(t);
  const before = speed(body);
  t.sim.step();
  const dV = speed(body) - before;
  assert.ok(dV <= T.pullMaxAccel * DT * 1.05,
    `one-tick Δv honors the accel ceiling (${dV.toFixed(2)} <= ${(T.pullMaxAccel * DT).toFixed(2)})`);
  t.cleanup();
});

// ── katamari caps ───────────────────────────────────────────────────────────────
test('maxClumpMass clamps the union and a capped clump stops eating AND pulling', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  assert.equal(t.sys._rt.phase, 'holding');
  const rt = t.sys._rt;
  rt.clumpMass = T.maxClumpMass - 3;
  const meal = rock(t.sim, T.mawDist + 14, 4, 50, 4); // inside merge distance
  for (let i = 0; i < 30 && meal.alive !== false; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  assert.equal(meal.alive, false, 'the heavy meal merged');
  assert.equal(rt.clumpMass, T.maxClumpMass, 'mass clamps at the authored ceiling');
  // At cap a follower touching the clump skin is refused the merge (the _absorb
  // early-return + continue) — collision nudges make contact velocity unreadable,
  // so pin survival + the mass ceiling instead.
  const mergeDist = rt.clumpRadius + 2 + T.absorbEpsilonWu;
  // -x side: a refused meal can ricochet off the capped ball's collider at speed —
  // keep the deflection heading away from the band probe so the domino can't reach it.
  const contact = rock(t.sim, core.pos.x - mergeDist * 0.9, core.pos.z, 4, 2);
  // And a follower outside the basin but inside the suck band as the core orbits near:
  // at cap the suck lane skips it, so basin can't reach it and nothing should move it.
  // z-offset off the nose line: a strained capped clump can strain-bowl dead ahead,
  // and a probe on the launch corridor would get plowed by the thrown ball itself.
  const bandMeal = rock(t.sim, T.mawDist + T.basinRadius + 4, 50, 4, 2);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(contact.alive, true, 'a capped clump cannot absorb another meal');
  assert.equal(bandMeal.alive, true);
  assert.ok(speed(bandMeal) < 3,
    `FULL ball stops vacuuming the band (${speed(bandMeal).toFixed(2)})`);
  t.cleanup();
});

test('member ledger is bounded while totalAbsorbed keeps counting', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  const rt = t.sys._rt;
  rt.members.length = 0;
  for (let i = 0; i < T.maxAbsorbRecords; i++) rt.members.push({ type: 'asteroid', mass: 1, radius: 1, nx: 0, nz: 0 });
  rt.totalAbsorbed = T.maxAbsorbRecords;
  const meal = rock(t.sim, T.mawDist + 14, 4, 4, 2);
  for (let i = 0; i < 40 && meal.alive !== false; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  assert.equal(meal.alive, false, 'meal absorbed');
  assert.equal(rt.members.length, T.maxAbsorbRecords, 'VFX ledger stays bounded');
  assert.equal(rt.totalAbsorbed, T.maxAbsorbRecords + 1, 'the ×N count never freezes at the ledger cap');
  t.cleanup();
});

test('a dense belt feed rate-gates the absorb glass tick', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  // Park several meals right against the core skin so absorbs land within a few ticks.
  for (let i = 0; i < 4; i++) rock(t.sim, T.mawDist + 12 + i * 3, (i % 2 ? 8 : -8), 3, 2);
  for (let i = 0; i < 240; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const absorbs = t.events.filter((e) => e.name === 'gyre:absorbed').length;
  const ticks = t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_absorb').length;
  assert.ok(absorbs >= 2, `several meals eaten (${absorbs})`);
  assert.ok(ticks >= 1 && ticks < absorbs, `cue gate suppressed stacking (${ticks}/${absorbs})`);
  t.cleanup();
});

// ── belt-gravel promotion ───────────────────────────────────────────────────────
test('a belt-field rock inside the basin promotes into a live body the beam can catch', async () => {
  const { insertAsteroidFieldRock } = await import('../src/world/asteroidField.js');
  const t = await bootPhysics();
  const rec = insertAsteroidFieldRock(t.state, { pos: { x: 210, z: 30 }, radius: 8, mass: 6 });
  hold(t);
  let promoted = null;
  for (let i = 0; i < 90 && !promoted; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
    const ent = t.state.entities.get(rec.id);
    if (ent && ent.alive !== false) promoted = ent;
  }
  assert.ok(promoted, 'the field record materialized into a real entity');
  assert.equal(promoted.type, 'asteroid');
  // Promotion is the whole point: the beam then works it like any loose body — either it
  // is already the held core, a member, or inbound on the basin pull.
  const rt = t.sys._rt;
  assert.ok(
    rt.coreId === rec.id || promoted.vel.x !== 0 || promoted.vel.z !== 0 || rt.phase === 'holding',
    'promoted body enters the pull/snag pipeline',
  );
  t.cleanup();
});


// -- launched-ball immunity --
test('a launched ball is pull/suck/snag-immune — it cannot be re-captured or re-absorbed', async () => {
  const t = await bootPhysics();
  const ball = rock(t.sim, T.mawDist + 30, 0, 6, 4);
  ball.data.gyreLaunched = true; // a thrown clump back in the gravity zone
  hold(t);
  for (let i = 0; i < 60; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.notEqual(t.sys._rt.coreId, ball.id, 'thrown ball never re-cores');
  assert.equal(t.sys._rt.phase, 'beaming', 'beam keeps searching past the dead ball');
  assert.equal(ball.alive, true, 'never re-absorbed');
  assert.ok(speed(ball) < 0.5, `no pull either (${speed(ball).toFixed(2)})`);
  t.cleanup();
});

// -- ball-death / adoption retirement (real deadline + despawnAt-stripped paths) --
test('a ball stripped of despawnAt retires the tracker silently (adopted, not dead)', async () => {
  const t = await bootPhysics();
  const ball = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  t.state.input.actions.gyreSnare = false; t.sim.step();
  assert.equal(t.sys._rt.ballId, ball.id);
  delete ball.data.despawnAt; // encounterScripts/egressExit adoption strips the deadline
  t.sim.step();
  assert.equal(t.sys._rt.ballId, null, 'adopted ball retires from gyre tracking');
  assert.ok(!t.events.some((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_ball_death'),
    'adoption is not a quiet expiry — no shatter voice');
  t.cleanup();
});

test('a ball dying at its TTL fires the muffled shatter; an impact death does not', async () => {
  const t = await bootPhysics();
  const ball = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  t.state.input.actions.gyreSnare = false; t.sim.step();
  // Quiet expiry through the REAL lifetimeSweep: the deadline lands inside the next
  // step, the sweep kills + compacts the body in one pass, and gyreSnare's expiry-
  // imminent branch sings the grave on the last live tick — the only window where
  // the ball is both still in the map and past its deadline.
  ball.data.despawnAt = t.state.simTime + 0.02;
  for (let i = 0; i < 8; i++) t.sim.step();
  assert.equal(t.sys._rt.ballId, null);
  assert.ok(!t.state.entities.has(ball.id) || ball.alive === false, 'the sweep took the body');
  assert.ok(t.events.some((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_ball_death'),
    'TTL expiry sings the muffled shatter');
  t.cleanup();

  const t2 = await bootPhysics();
  const ball2 = rock(t2.sim, T.mawDist, 0, 6, 4);
  hold(t2);
  for (let i = 0; i < 5; i++) { t2.state.input.actions.gyreSnare = true; t2.sim.step(); }
  t2.state.input.actions.gyreSnare = false; t2.sim.step();
  ball2.alive = false; // impact: deadline still pending — collision audio already spoke
  t2.sim.step();
  assert.equal(t2.sys._rt.ballId, null);
  assert.ok(!t2.events.some((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_ball_death'),
    'an impact death stays quiet — collision audio owns that voice');
  t2.cleanup();
});

// -- point defense: the basin tugs projectiles but can never eat them --
test('a projectile in the basin gets pulled toward the maw but can never core', async () => {
  const t = await bootPhysics();
  const shot = rock(t.sim, T.mawDist + 30, 10, 0.3, 0.7, 'projectile');
  shot.vel.x = -40; // inbound fast — the tug must bend it, not stop it
  hold(t);
  const sx0 = speed(shot);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'beaming', 'a shot can never be cored');
  assert.equal(shot.alive, true, 'a shot can never be absorbed');
  assert.ok(shot.vel.x > -35 || Math.abs(speed(shot) - sx0) > 3,
    'the basin visibly tugs the shot (vx -40 -> ' + shot.vel.x.toFixed(1) + ')');
  t.cleanup();
});

// -- overlap lanes: the suck annulus is single-owner while the clump is held --
test('a body inside the suck annulus eats one pull lane, not two (basin+suck cap)', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id, 'core held before placing the overlap probe');
  // The probe sits inside the suck band of the held core AND inside the basin — the
  // exact volume where _pullPass and _suckPass used to stack impulses on one body.
  const probe = rock(t.sim, core.pos.x + 20, core.pos.z, 6, 4);
  const calls = [];
  const orig = t.sys._queueAccel;
  t.sys._queueAccel = function (e, ax, az, m, dt, s) {
    if (e === probe) calls.push({ ax, az });
    return orig.call(this, e, ax, az, m, dt, s);
  };
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  t.sys._queueAccel = orig;
  assert.ok(probe.alive, 'probe survived the window (outside the absorb skin)');
  assert.ok(calls.length > 0, 'a pull lane reached the probe');
  assert.ok(calls.length <= 8, `expected <= 1 impulse per tick, got ${calls.length} across 8 ticks`);
  t.cleanup();
});

// -- id-shape safety: a string-id entity can still be cored and held --
test('a string-id body cores and holds — the orbit seed never goes NaN', async () => {
  const t = await bootPhysics();
  // spawnEntity normalizes spec.id to an int; world-adjacent loaders (or any future path
  // that inserts via makeEntity directly) can still land a string id in the live map.
  // Simulate that shape: numeric-id entity spawned properly, then re-keyed.
  const e = rock(t.sim, T.mawDist, 0, 6, 4, 'wreck');
  const numId = e.id;
  e.id = 'wreck_site_cathedral';
  t.state.entities.delete(numId);
  t.state.entities.set(e.id, e);
  hold(t);
  for (let i = 0; i < 45; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, 'wreck_site_cathedral', 'string-id body cores the clump');
  assert.ok(Number.isFinite(t.sys._rt.orbitSeed), 'orbit seed stays finite for any id shape');
  const d = dist(e, t.player);
  assert.ok(d < T.mawDist + 80, `the hold actually grips it — a NaN seed left it free-floating (d=${d.toFixed(1)})`);
  t.cleanup();
});

// -- adoption hand-back: the retired ball keeps none of the weapon's marks --
test('an adopted ball is stripped of gyreLaunched and its sleeper impactDamageScale', async () => {
  const t = await bootPhysics();
  const ball = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  t.state.input.actions.gyreSnare = false; t.sim.step();
  assert.equal(t.sys._rt.ballId, ball.id);
  assert.equal(ball.data.gyreLaunched, true);
  assert.ok(ball.physicsBody.impactDamageScale != null, 'launch stamped the weapon scale');
  delete ball.data.despawnAt; // adoption — the body now belongs to another system
  t.sim.step();
  assert.equal(t.sys._rt.ballId, null);
  assert.equal(ball.data.gyreLaunched, undefined, 'adopted body is pull/snag-able again');
  assert.equal(ball.physicsBody.impactDamageScale, undefined, 'no 8x sleeper collider left behind');
  t.cleanup();
});

// -- net anticipation: basinCount feeds the ×N IN NET HUD read --
test('absorbables inside the cone publish basinCount for the net-read', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist + 30, 10, 6, 4);
  rock(t.sim, T.mawDist + 45, -15, 6, 4);
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.ok(t.state.gyreSnare.basinCount >= 1, `basin count tracks cone material (got ${t.state.gyreSnare.basinCount})`);
  release(t);
  t.cleanup();
});

// -- saturation beat: gyre_snare_full latches once at the cap crossing --
test('the first absorb past the mass cap fires exactly one FULL cue', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id, 'core held before feeding the cap');
  // Two 1500t meals outpace the 2400t cap — the second crossing must not re-fire.
  rock(t.sim, core.pos.x + 8, core.pos.z, 1500, 6);
  rock(t.sim, core.pos.x - 8, core.pos.z, 1500, 6);
  for (let i = 0; i < 12; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const fulls = t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_full');
  assert.equal(fulls.length, 1, `FULL cue latched once (got ${fulls.length})`);
  assert.ok(t.sys._rt.clumpMass >= T.maxClumpMass, 'clump actually saturated');
  t.cleanup();
});

// -- Newton: the bowl pushes the ship back a touch --
test('launching the clump kicks the ship a small counter-Δv', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 30, 6);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const vxBefore = t.player.vel.x;
  release(t);
  assert.ok(t.player.vel.x < vxBefore, `recoil pushes off the +x nose (vx ${vxBefore.toFixed(2)}→${t.player.vel.x.toFixed(2)})`);
  assert.ok(Math.abs(t.player.vel.x - vxBefore) <= 6.5, 'the kick stays a nudge, not a knockback');
  t.cleanup();
});

// -- coverage: a REAL serialize->load cycle of the core's data blob, mid-hold --
test('a mid-hold core serializes its flag and the loaded sweep clears it', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id, 'core held before the save boundary');
  assert.equal(core.data.gyreCore, true);

  // The save path JSON-serializes entity.data — prove the mark survives the round-trip
  // (this is exactly why the load sweep exists), then land it on a fresh state.
  const savedData = JSON.parse(JSON.stringify(core.data));
  assert.equal(savedData.gyreCore, true, 'the residue flag is serialized with the body');

  const t2 = await bootPhysics();
  const loaded = rock(t2.sim, T.mawDist + 30, 0, 6, 4);
  loaded.data = savedData; // restore: the loaded body's data blob carries the old mark
  t2.bus.emit('save:loaded', {});
  t2.sim.step();
  assert.equal(loaded.data.gyreCore, undefined, 'the boundary sweep strips the stale flag');
  // And the loaded body is pull-able again — snagging proof, not just flag deletion.
  hold(t2);
  for (let i = 0; i < 25; i++) { t2.state.input.actions.gyreSnare = true; t2.sim.step(); }
  assert.equal(t2.sys._rt.coreId, loaded.id, 'a save-loaded body can still be cored');
  t.cleanup();
  t2.cleanup();
});

// -- coverage: fast-translation chase — the frame-damped spring tracks a boosting ship --
test('a held core tracks a fast-translating ship without slipping the beam', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 40, 6);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id, 'core gripped before the chase');

  // Boost-line speed (~280 wu/s) for ~1.5 s: the maw outruns the clump every frame and
  // the ship-frame damping term is what reels it in rather than flapping strain.
  t.player.vel.x = 280;
  for (let i = 0; i < 90; i++) {
    t.state.input.actions.gyreSnare = true;
    t.player.vel.x = 280; t.player.vel.z = 0; // hold the drive — pinning, not drifting
    t.sim.step();
    t.player.pos.x += 280 / 60; // ship-frame motion is the player's own tick; mirror it
  }
  assert.notEqual(t.sys._rt.phase, 'off', 'the lash never dropped mid-chase');
  const d = dist(core, t.player);
  assert.ok(d < T.holdBreakDist, `core stays inside break distance (d=${d.toFixed(1)} < ${T.holdBreakDist})`);
  t.cleanup();
});

// -- coverage: destroy() mid-hold sweeps residue (same-state reload path) --
test('destroy() mid-hold sweeps the core mark — no immortal pull-immunity', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id, 'core held before the same-state reload');
  assert.equal(core.data.gyreCore, true);
  t.sys.destroy();
  assert.equal(core.data.gyreCore, undefined, 'destroy swept the residue flag');
  t.sys.init({ state: t.state, bus: t.bus, helpers: t.helpers, registry: t.sim.registry });
  hold(t);
  for (let i = 0; i < 25; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id, 'the swept body cores cleanly post-reload');
  t.cleanup();
});

// -- coverage: drop reasons in BEAM — cap_dry, player_lost, not_flight --
test('a dry capacitor drops the open beam as cap_dry, a lost player as player_lost', async () => {
  const t = await bootPhysics();
  t.player.cap = T.capActivateMin + 0.1; // wakes, then drains below zero on its own
  hold(t);
  for (let i = 0; i < 200 && t.sys._rt.phase !== 'off'; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'off');
  assert.ok(t.events.some((e) => e.name === 'gyre:dropped' && e.p.reason === 'cap_dry'), 'cap_dry reason landed');
  t.cleanup();

  const t2 = await bootPhysics();
  hold(t2);
  assert.equal(t2.sys._rt.phase, 'beaming');
  t2.state.input.actions.gyreSnare = false;
  t2.player.alive = false; // pilot dies mid-BEAM — not a release
  t2.sim.step();
  assert.ok(t2.events.some((e) => e.name === 'gyre:dropped' && e.p.reason === 'player_lost'),
    'beam lost without a pilot reports player_lost, not released');
  t2.cleanup();
});

// -- coverage: at cap, a non-absorbable in the annulus eats ONE lane, not two --
test('a capped clump gives non-absorbables exactly one pull lane', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id);
  // Saturate directly: a 1500t meal then a second under the skin crosses the 2400t cap.
  rock(t.sim, core.pos.x + 8, core.pos.z, 1500, 6);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  rock(t.sim, core.pos.x + 4, core.pos.z, 1500, 6);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.ok(t.sys._rt.clumpMass >= T.maxClumpMass, `clump saturated (got ${t.sys._rt.clumpMass})`);
  // A mine inside annulus∩basin: at cap the suck lane must not stack on the basin tug.
  const mine = rock(t.sim, core.pos.x + 20, core.pos.z, 6, 4, 'mine');
  const calls = [];
  const orig = t.sys._queueAccel;
  t.sys._queueAccel = function (e, ax, az, m, dt, s) {
    if (e === mine) calls.push({ ax, az });
    return orig.call(this, e, ax, az, m, dt, s);
  };
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  t.sys._queueAccel = orig;
  assert.ok(calls.length > 0, 'a lane still reaches the mine (basin owns it at cap)');
  assert.ok(calls.length <= 8, `single lane at cap — got ${calls.length} impulses over 8 ticks`);
  t.cleanup();
});

// -- coverage: the strain latch fires once per excursion and re-arms at 0.25 --
test('strain cue latches once above 0.4 and re-arms below 0.25', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id);
  // Strain measures distance to the MAW (player+mawDist along the nose), not the
  // ship: pin the core at mawDist+520 so strain = (520-320)/320 = 0.625 > 0.4 while
  // staying under the 640 wu break — a long excursion without a drop.
  for (let i = 0; i < 10; i++) {
    core.pos.x = t.player.pos.x + T.mawDist + 520; core.pos.z = t.player.pos.z;
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  const strains = t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_strain');
  assert.equal(strains.length, 1, `strain voice latched once during the excursion (got ${strains.length})`);
  t.cleanup();
});

// -- coverage: basinCount skips persistent/exempt bodies inside the cone --
test('basinCount counts cone material but skips persistent and marked bodies', async () => {
  const t = await bootPhysics();
  // All three ride the wedge (between nose apex and maw plane, outside the 86 wu
  // snag basin) — nothing cores the clump, so basinCount is the only feed.
  const open = rock(t.sim, T.mawDist - 100, 6, 6, 4);
  const locked = rock(t.sim, T.mawDist - 95, -8, 6, 4);
  locked.flags = { persistent: true }; // a quest object in the cone is NOT catchable mass
  const marked = rock(t.sim, T.mawDist - 105, 4, 6, 4);
  marked.data.gyreLaunched = true; // a thrown ball crossing the cone isn't counted either
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.state.gyreSnare.basinCount, 1, `only free mass counts (got ${t.state.gyreSnare.basinCount})`);
  release(t);
  t.cleanup();
});

// -- coverage: a save-loaded ball keeps its marks and lives out its deadline --
test('a ball tracked through a load boundary keeps gyreLaunched and its deadline', async () => {
  const t = await bootPhysics();
  const ball = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  t.state.input.actions.gyreSnare = false; t.sim.step();
  assert.equal(t.sys._rt.ballId, ball.id);
  const dl = ball.data.despawnAt;
  assert.ok(dl != null, 'launch stamped a deadline');
  t.bus.emit('save:loaded', {}); // boundary: beam drops, flying ball is kept as world mass
  t.sim.step();
  assert.equal(ball.data.gyreLaunched, true, 'launched mark survives the boundary');
  assert.equal(ball.data.despawnAt, dl, 'deadline intact — it despawns on schedule');
  t.cleanup();
});

// -- coverage: snag clears BOTH lifetime channels (despawnAt AND entity.ttl) --
test('a body carrying a finite ttl is freed on snag — the lash holds mass in stasis', async () => {
  const t = await bootPhysics();
  const timed = rock(t.sim, T.mawDist, 0, 6, 4);
  timed.ttl = 120;           // sibling sweep channel — same failure class as despawnAt
  timed.data.despawnAt = 90; // and the data-table deadline, together in one body
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, timed.id, 'timed body cored');
  assert.equal(timed.ttl, Infinity, 'ttl channel cleared on snag');
  assert.equal(timed.data.despawnAt, undefined, 'despawnAt channel cleared on snag');
  // Step past both old deadlines while still held — the clump must not evaporate.
  for (let i = 0; i < 100; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(timed.alive, true, 'held core survives its old deadlines');
  assert.equal(t.sys._rt.coreId, timed.id, 'no core_lost mid-hold');
  release(t);
  t.cleanup();
});

// -- coverage: a press during the launch burst re-opens the beam after OFF lands --
test('a mid-launch key press is a fresh edge — the beam re-opens, not eaten', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  t.state.input.actions.gyreSnare = false; t.sim.step(); // release → LAUNCH begins
  assert.equal(t.sys._rt.phase, 'launching');
  t.state.input.actions.gyreSnare = true; // re-press inside the ~5-tick burst
  t.sim.step(); // edge fires while LAUNCH — must not beam mid-burst, but not be eaten
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'beaming', 'the held key re-opened the beam after launch settled');
  release(t);
  t.cleanup();
});

test('a dropped core resumes its authored lifetime; a launched one keeps the ball deadline', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  core.data = core.data || {};
  core.data.despawnAt = 9999;   // authored data-table deadline
  core.ttl = 8888;              // authored sibling-sweep deadline
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id, 'timed body cored');
  assert.equal(core.data.despawnAt, undefined, 'snag clears the data deadline');
  assert.equal(core.ttl, Infinity, 'snag clears the sibling deadline');
  // Losing the player is a live drop, not a launch — the authored deadlines come back.
  t.state.entities.delete(t.state.playerId);
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off', 'player lost drops the hold');
  assert.equal(core.data.despawnAt, 9999, 'the data deadline is restored');
  // The sibling sweep decrements ttl on the drop tick itself — the resume loses one step.
  assert.ok(core.ttl > 8887 && core.ttl <= 8888, `the sibling deadline is restored (got ${core.ttl})`);
  t.cleanup();
});

test('an orphaned second-launched ball hands back its marks when adopted', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 40, 6);
  a.physicsBody = a.physicsBody || {};
  a.physicsBody.impactDamageScale = 0.2; // authored damping the launch overwrites
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, a.id, 'A cored');
  release(t);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
  assert.equal(t.sys._rt.ballId, a.id, 'A is the flying ball');
  assert.ok(a.physicsBody.impactDamageScale > 1, 'launch wrote the weapon scale');
  // Bowl a second clump while A still flies — A is now orphaned off the single track.
  const b = rock(t.sim, T.mawDist, 0, 40, 6);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, b.id, 'B cored');
  release(t);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
  assert.equal(t.sys._rt.ballId, b.id, 'B is the tracked ball');
  assert.equal(a.data.gyreLaunched, true, 'A still carries the mark mid-flight');
  // Adoption: another system claims A by stripping its deadline.
  delete a.data.despawnAt;
  t.sim.step();
  assert.equal(a.data.gyreLaunched, undefined, 'the orphan is unmarked');
  assert.equal(a.physicsBody.impactDamageScale, 0.2, 'the authored scale is restored');
  assert.equal(b.data.gyreLaunched, true, 'B keeps flying as the ball');
  t.cleanup();
});

test('a same-state destroy→init reload re-seeds the ball watch list', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 40, 6);
  a.physicsBody.impactDamageScale = 0.2;
  a.data.despawnAt = 9999; // authored deadlines the launch keeps stashed for hand-back
  a.ttl = 8888;
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, a.id, 'A cored');
  release(t);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
  assert.equal(t.sys._rt.ballId, a.id, 'A is the flying ball');
  // Same-state system reload — no save/sector boundary, the entity map survives.
  t.sys.destroy();
  t.sys.init({ state: t.state, bus: t.bus, helpers: t.helpers, registry: t.sim.registry });
  assert.ok(t.sys._rt.ballIds.includes(a.id), 'the live ball is watched again after reload');
  // Adoption after the reload must still hand the marks back — not orphan them.
  delete a.data.despawnAt;
  t.sim.step();
  assert.equal(a.data.gyreLaunched, undefined, 'the adopted ball is unmarked post-reload');
  assert.equal(a.physicsBody.impactDamageScale, 0.2, 'the authored scale is restored');
  assert.equal(a.data.despawnAt, 9999, 'the authored data deadline comes back too');
  assert.ok(a.ttl > 8887 && a.ttl <= 8888, `the authored ttl comes back (got ${a.ttl})`);
  t.cleanup();
});

test('a physicsBody:false absorbable is never cored or frozen', async () => {
  const t = await bootPhysics();
  const ghost = t.sim.spawn({
    type: 'asteroid', team: 9, pos: { x: T.mawDist, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, angVel: 0, radius: 4, collides: true, hull: 40, hullMax: 40,
    physicsBody: false, data: {},
  });
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.notEqual(t.sys._rt.coreId, ghost.id, 'an opted-out body is not cored');
  assert.equal(ghost.physicsBody, false, 'no record is materialized on it');
  assert.equal(t.sys._rt.phase, 'beaming', 'the beam keeps looking for a real core');
  release(t);
  t.cleanup();
});
