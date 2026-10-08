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
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { readRecentImpulseProvenance, clearImpulseProvenance } from '../src/combat/impulseKernel.js';
import { GYRE_SNARE } from '../src/data/gyreSnare.js';
import { gyreHud } from '../src/ui/gyreHud.js';

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
  for (const name of ['gyre:beamOn', 'gyre:beamOff', 'gyre:snagged', 'gyre:absorbed', 'gyre:absorbTick', 'gyre:windup', 'gyre:launched', 'gyre:thrown', 'gyre:dropped', 'gyre:fuseLow', 'gyre:ballGrave', 'audio:cue', 'toast']) {
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

test('oversized cores stay whole and report TOO HEAVY instead of IN NET', () => {
  const t = boot();
  const massive = rock(t.sim, T.mawDist, 0, T.maxClumpMass + 1, 4);
  const wide = rock(t.sim, T.mawDist + 8, 0, 10, T.maxClumpRadius + 1);
  hold(t);
  assert.equal(t.sys._rt.phase, 'beaming');
  assert.equal(t.sys._rt.coreId, null);
  assert.equal(massive.physicsBody.mass, T.maxClumpMass + 1);
  assert.equal(wide.physicsBody.radius, T.maxClumpRadius + 1);
  assert.equal(t.state.gyreSnare.basinCount, 0);
  assert.equal(t.state.gyreSnare.tooHeavyCount, 2);
  const hud = Object.create(gyreHud);
  hud.init({ state: t.state });
  assert.match(hud._resolve(t.state.gyreSnare, t.state.simTime).text, /TOO HEAVY ×2/);
});

test('quest and recoverable cargo wrecks remain tug-only at snag and absorb boundaries', () => {
  for (const data of [
    { wreckMissionId: 'rescue', isCommunicator: true },
    { salvagePool: { cmdty_salvage_electronics: 2 } },
    { loot: [{ id: 'cmdty_ore_iron', qty: 2 }] },
    { cargoManifest: { lines: [{ commodityId: 'cmdty_ore_iron', qty: 3 }] } },
    { freightCustodyPod: { custodyId: 'freight', qty: 4, status: 'live' } },
    { missionPinned: true },
    { persistenceOwner: 'mission:rescue' },
  ]) {
    const t = boot();
    const wreck = rock(t.sim, T.mawDist + 8, 0, 12, 4, 'wreck');
    wreck.data = structuredClone(data);
    hold(t);
    assert.equal(t.sys._rt.phase, 'beaming');
    assert.equal(t.state.gyreSnare.basinCount, 0);
    assert.equal(t.state.gyreSnare.towCount, 1);
    assert.ok(consumePhysicsCommand(wreck).impulses.length > 0, 'protected cargo still feels the tug');
    assert.equal(t.sys._absorb(t.state, t.sys._rt, wreck, wreck, 0, 0, 0), false);
    assert.equal(wreck.alive, true);
    assert.deepEqual(wreck.data, data);
  }
});

test('late cargo and mission owners release held cores before a hold or launch without losing lifetime', () => {
  for (const ownership of [
    { salvagePool: { cmdty_ore_iron: 3 } },
    { missionPinned: true },
    { persistenceOwner: 'mission:rescue' },
  ]) {
    for (const boundary of ['hold', 'release']) {
      const t = boot();
      const core = rock(t.sim, T.mawDist, 0, 12, 4, 'wreck');
      core.data.despawnAt = 30;
      hold(t);
      assert.equal(t.sys._rt.coreId, core.id);
      Object.assign(core.data, structuredClone(ownership));
      core.data.despawnAt = 45; // current owner replaces the pre-snag deadline
      if (boundary === 'release') release(t);
      else t.sim.step();
      assert.equal(t.sys._rt.phase, 'off');
      assert.equal(core.alive, true);
      assert.equal(core.data.gyreCore, undefined);
      assert.equal(core.data.gyreLaunched, undefined);
      assert.equal(core.data.despawnAt, 45);
      assert.equal(core.physicsBody.impactDamageScale, undefined);
      assert.equal(t.events.some((event) => event.name === 'gyre:launched'), false);
    }
  }
});

test('empty scrap with a historic settled claim is still legal material', () => {
  const t = boot();
  const core = rock(t.sim, T.mawDist, 0, 12, 4, 'wreck');
  core.data = { salvagePool: { cmdty_ore_iron: 0 }, loot: [], salvorClaimedBy: 'former-crew',
    wreckMissionId: null, freightCustodyPod: { qty: 4, status: 'player_collected' } };
  hold(t);
  assert.equal(t.sys._rt.coreId, core.id);
  const meal = rock(t.sim, core.pos.x + 8, core.pos.z, 6, 4);
  t.sim.step();
  assert.equal(meal.alive, false);
  assert.equal(t.sys._rt.clumpMass, 18);
});

test('net feedback distinguishes legal meals, towed cargo and bodies that cannot fit', () => {
  const t = boot();
  rock(t.sim, T.mawDist + 45, 0, 12, 4);
  const freight = rock(t.sim, T.mawDist + 55, 0, 12, 4, 'wreck');
  freight.data.salvagePool = { cmdty_ore_iron: 2 };
  rock(t.sim, T.mawDist + 60, 0, T.maxClumpMass + 1, 4);
  hold(t);
  assert.equal(t.state.gyreSnare.basinCount, 1);
  assert.equal(t.state.gyreSnare.towCount, 1);
  assert.equal(t.state.gyreSnare.tooHeavyCount, 1);
  const hud = Object.create(gyreHud);
  hud.init({ state: t.state });
  const text = hud._resolve(t.state.gyreSnare, t.state.simTime).text;
  assert.match(text, /×1 IN NET/);
  assert.match(text, /TOWING ×1/);
  assert.match(text, /TOO HEAVY ×1/);
  const holdingText = hud._resolve({ phase: 'holding', clumpMass: 2300, maxClumpMass: 2400,
    basinCount: 0, tooHeavyCount: 1, towCount: 1 }, t.state.simTime).text;
  assert.doesNotMatch(holdingText, /\+1/);
  assert.match(holdingText, /TOWING ×1.*TOO HEAVY ×1/);
});

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
  // Burn through the coil + the launch ticks.
  for (let i = 0; i < T.launchTicks + T.launchWindupTicks + 2; i++) t.sim.step();

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

test('a tap wholly inside the launch window is swallowed — the throw is committed', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  release(t);
  assert.equal(t.sys._rt.phase, 'launching');
  // A press+release inside the ~11-tick coil+burst can never abort or re-fire:
  // the slingshot is committed the instant the release edge lands.
  t.state.input.actions.gyreSnare = true; t.sim.step(); // phantom second press
  t.state.input.actions.gyreSnare = false; t.sim.step(); // release mid-coil
  for (let i = 0; i < T.launchTicks + T.launchWindupTicks + 2; i++) t.sim.step();
  assert.equal(t.events.filter((e) => e.name === 'gyre:launched').length, 1, 'exactly one launch');
  assert.equal(t.events.filter((e) => e.name === 'gyre:thrown').length, 1, 'the ball still throws');
  assert.equal(t.sys._rt.phase, 'off', 'launch completes to OFF');
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
  for (let i = 0; i < T.launchTicks + T.launchWindupTicks + 3; i++) t.sim.step();
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
  // Re-press and release inside the coil/burst — the launch must finish its impulse.
  hold(t); release(t);
  for (let i = 0; i < T.launchTicks + T.launchWindupTicks + 2; i++) t.sim.step();
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
  for (let i = 0; i < T.launchTicks + T.launchWindupTicks + 2; i++) t.sim.step(); // coil + burst done → OFF
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

test('the fuse freezes while a screen holds the flight input neutral', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  // Modal-open parity with input.js shouldNeutralizeFlightInput: the verb stays
  // held through the overlay but the fuse can't burn blind toward an invisible
  // forced bowl — cap untouched while a screen is up, draining resumes on close.
  t.state.ui = { screenStack: ['map'] };
  const held = t.player.cap;
  for (let i = 0; i < 60; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.player.cap, held, 'capacitor frozen while the modal holds the screen');
  t.state.ui.screenStack.length = 0;
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.ok(t.player.cap < held, 'fuse resumes the moment the screen closes');
  // The other two neutralize paths hold too — input.blocked (drill approach) and
  // fulfillmentBlackoutActive (the class-driven blackout with no stack entry).
  t.state.input.blocked = true;
  const held2 = t.player.cap;
  for (let i = 0; i < 60; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.player.cap, held2, 'capacitor frozen under input.blocked');
  t.state.input.blocked = false;
  t.state.ui.fulfillmentBlackoutActive = true;
  for (let i = 0; i < 60; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.player.cap, held2, 'capacitor frozen under fulfillment blackout');
  t.state.ui.fulfillmentBlackoutActive = false;
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
  assert.equal(t.state.gyreSnare.dropReason, 'strained',
    'the mirror publishes the tear so the close can read it');
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
  t.state.input.actions.gyreSnare = false; t.sim.step(); // release → the coil begins
  assert.equal(t.sys._rt.launchWindup, T.launchWindupTicks - 1, 'the wind-up coils before the burst');
  assert.equal(t.sys._rt.launchLeft, T.launchTicks, 'no impulse lands during the coil');
  for (let i = 0; i < T.launchWindupTicks - 1; i++) t.sim.step();
  assert.equal(t.sys._rt.launchWindup, 0, 'coil spent — the burst starts');
  t.sim.step();
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
test('a whole meal can fill maxClumpMass and a capped clump stops eating AND pulling', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  assert.equal(t.sys._rt.phase, 'holding');
  const rt = t.sys._rt;
  rt.clumpMass = T.maxClumpMass - 3;
  const meal = rock(t.sim, T.mawDist + 14, 4, 3, 4); // fits the remaining mass exactly
  for (let i = 0; i < 30 && meal.alive !== false; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  assert.equal(meal.alive, false, 'the whole meal merged');
  assert.equal(rt.clumpMass, T.maxClumpMass, 'the full meal reaches the authored ceiling');
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
  // The haptic tick rides the same gate — the pad gets discrete thumps, not a buzz,
  // while gyre:absorbed still fires per-meal for HUD honesty.
  const padTicks = t.events.filter((e) => e.name === 'gyre:absorbTick').length;
  assert.equal(padTicks, ticks, `haptic tick shares the audio gate (${padTicks} vs ${ticks})`);
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
  const deaths = t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_ball_death');
  assert.equal(deaths.length, 1, `the primary ball graves exactly once (got ${deaths.length})`);
  const graves = t.events.filter((e) => e.name === 'gyre:ballGrave');
  assert.equal(graves.length, 1, 'the pad taps the authored grave once (the arc closes in the hands)');
  assert.ok(!t.sys._rt.ballIds.includes(ball.id),
    'a retired primary unwatches — a lingering id re-fired its own grave the next tick');
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
  assert.ok(!t2.events.some((e) => e.name === 'gyre:ballGrave'),
    'no pad grave tap on an impact death — collision rumble owns that beat');
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
  assert.equal(t.state.gyreSnare.towCount, 0, 'a streaking bullet never counts as towed loot');
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
  assert.ok(t.sys._rt.orbitDir === 1 || t.sys._rt.orbitDir === -1,
    'orbit direction stays a ±1 sign for any id shape');
  // Determinism: the same id must always revolve the same way (and a different id
  // may flip it — that's the point of the second hash bit).
  const dirA = t.sys._rt.orbitDir;
  const e2 = rock(t.sim, T.mawDist, 0, 6, 4, 'wreck');
  e2.id = 'wreck_site_cathedral'; // same id → same hash → same dir
  const h = (function (s) { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x; })(String(e2.id));
  assert.equal((h & 0x10000) !== 0 ? 1 : -1, dirA, 'orbitDir comes off the same stable id hash as orbitSeed');
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
test('the absorb that fills the mass cap fires exactly one FULL cue', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id, 'core held before feeding the cap');
  // The meals fit the ceiling exactly; a further meal must not re-fire FULL.
  rock(t.sim, core.pos.x + 8, core.pos.z, 1500, 6);
  rock(t.sim, core.pos.x - 8, core.pos.z, T.maxClumpMass - 1506, 6);
  rock(t.sim, core.pos.x, core.pos.z + 8, 10, 2);
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
  // The kick lands when the coil RELEASES — the first burst tick, not the release edge.
  for (let i = 0; i < T.launchWindupTicks; i++) t.sim.step();
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
  // Saturate with two whole meals that fit the 2400t cap exactly.
  rock(t.sim, core.pos.x + 8, core.pos.z, 1500, 6);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  rock(t.sim, core.pos.x + 4, core.pos.z, T.maxClumpMass - 1506, 6);
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
  // ship: pin the core at mawDist+560 so strain = (560-480)/160 = 0.5 > 0.4 while
  // staying under the 640 wu break — a held excursion across the +30-tick sustain.
  for (let i = 0; i < 40; i++) {
    core.pos.x = t.player.pos.x + T.mawDist + 560; core.pos.z = t.player.pos.z;
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  const strains = t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_strain');
  assert.equal(strains.length, 2, `latch + one sustain shimmer in a held excursion (got ${strains.length})`);
  assert.equal(strains[0].p.gain, 0.7, 'the latch edge keeps its full rise');
  assert.ok(Math.abs(strains[1].p.gain - 0.45) < 1e-6 && strains[1].p.rate === 0.9,
    'the sustain rides the softer strain-scaled shimmer');
  // Dip under 0.25 — the latch re-arms and a re-excursion re-speaks at full gain.
  for (let i = 0; i < 5; i++) {
    core.pos.x = t.player.pos.x + T.mawDist + 100; core.pos.z = t.player.pos.z;
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  for (let i = 0; i < 5; i++) {
    core.pos.x = t.player.pos.x + T.mawDist + 560; core.pos.z = t.player.pos.z;
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  const strains2 = t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_strain');
  assert.equal(strains2.length, 3, 'the re-armed excursion speaks its own latch edge');
  assert.equal(strains2[2].p.gain, 0.7);
  t.cleanup();
});

// -- coverage: the absorb knock floors at 0.15 wu/s so capped clumps still rock --
test('a small meal into a heavy clump still knocks at the Δv floor', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 800, 8); // a heavy snag — near-cap ball
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id);
  // Mass-proportional knock would give Δv = 6·3/800 ≈ 0.02 wu/s — dead at the
  // fantasy's climax. The floor must rescue it to coreMass·0.15 = 120 impulse.
  const meal = rock(t.sim, core.pos.x - 30, core.pos.z, 6, 4);
  const dx = core.pos.x - meal.pos.x, dz = core.pos.z - meal.pos.z;
  const dist = Math.hypot(dx, dz);
  consumePhysicsCommand(core); // drain pending lane impulses so only the knock remains
  t.sys._absorb(t.state, t.sys._rt, core, meal, dx, dz, dist);
  const cmd = consumePhysicsCommand(core);
  assert.ok(cmd && cmd.impulses.length >= 1, 'the knock crossed the membrane');
  const j = Math.hypot(
    cmd.impulses.reduce((s, i) => s + i.x, 0),
    cmd.impulses.reduce((s, i) => s + i.z, 0),
  );
  assert.ok(Math.abs(j - 800 * 0.15) < 1e-6,
    `floor impulse = coreMass·0.15 (got ${j}, want 120)`);
  assert.ok(cmd.impulses[0].x > 0, 'the flinch points away from the meal');
  t.cleanup();
});

test('a light clump keeps the mass-proportional knock (floor never fires)', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id);
  // 6·3 = 18 impulse ≫ 6·0.15 = 0.9 — the pebble branch is untouched.
  const meal = rock(t.sim, core.pos.x - 30, core.pos.z, 6, 4);
  const dx = core.pos.x - meal.pos.x, dz = core.pos.z - meal.pos.z;
  const dist = Math.hypot(dx, dz);
  consumePhysicsCommand(core);
  t.sys._absorb(t.state, t.sys._rt, core, meal, dx, dz, dist);
  const cmd = consumePhysicsCommand(core);
  const j = Math.hypot(
    cmd.impulses.reduce((s, i) => s + i.x, 0),
    cmd.impulses.reduce((s, i) => s + i.z, 0),
  );
  assert.ok(Math.abs(j - 6 * 3) < 1e-6, `meal-mass knock (got ${j}, want 18)`);
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
  for (let i = 0; i < T.launchWindupTicks + T.launchTicks + 2; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
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
  assert.equal(a.data.despawnAt, 9999, 'a still-future authored data deadline comes back too');
  // The countdown channel is RELATIVE — it can't go stale like an absolute despawnAt,
  // so hand-back resumes it symmetrically: an adopted body released into the world
  // decays on its authored schedule instead of living forever as residue.
  assert.ok(Number.isFinite(a.ttl) && a.ttl > 0 && a.ttl <= 8888,
    `the handed-back ball resumes its authored countdown (got ${a.ttl})`);
  assert.equal(a.data.gyrePrevTtl, undefined, 'the ttl stash is consumed on restore');
  t.cleanup();
});

test('a hand-back honors an owner-set ttl — the pre-snag stash never clobbers', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 40, 6);
  a.ttl = 8888;
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
  assert.equal(t.sys._rt.ballId, a.id, 'A is the flying ball');
  // The new owner keeps the body: strips the data deadline AND assigns its own finite
  // ttl — restoring the pre-snag stash over it would clobber the owner's deadline.
  delete a.data.despawnAt;
  a.ttl = 500;
  t.sim.step();
  assert.equal(a.data.gyreLaunched, undefined, 'the adopted ball is unmarked');
  assert.ok(a.ttl > 499 && a.ttl <= 500,
    `owner-set ttl wins over the stash — ~500 ticks on, never the ~8888 stash (got ${a.ttl})`);
  assert.equal(a.data.gyrePrevTtl, undefined, 'the stash is still consumed');
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

test('a physicsBody:false body parked in the basin never accrues dead-letter impulses', async () => {
  const t = await bootPhysics();
  const ghost = t.sim.spawn({
    type: 'asteroid', team: 9, pos: { x: T.mawDist + 4, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, angVel: 0, radius: 4, collides: true, hull: 40, hullMax: 40,
    physicsBody: false, data: {},
  });
  hold(t);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  // physics skips opted-out bodies entirely — any queued impulse record here would
  // accumulate unconsumed for the entity's lifetime.
  assert.equal(consumePhysicsCommand(ghost), null, 'no impulse record ever formed');
  assert.equal(ghost.physicsBody, false, 'no body materialized');
  release(t);
  t.cleanup();
});

test('a boundary-less destroy+init restores the held core\'s authored deadlines', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  core.data.despawnAt = 9999;
  core.ttl = 8888;
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id, 'timed body cored');
  assert.equal(core.data.despawnAt, undefined, 'snag cleared the data deadline');
  t.sys.destroy();
  // The tracked core is current-timeline — its authored stashes restore via the
  // normal clear path, not the residue sweep's drop.
  assert.equal(core.data.gyreCore, undefined, 'the core mark is stripped');
  assert.equal(core.data.despawnAt, 9999, 'the authored deadline is restored');
  assert.ok(core.ttl > 8887 && core.ttl <= 8888, `authored ttl restored (got ${core.ttl})`);
  t.sys.init({ state: t.state, bus: t.bus, helpers: t.helpers, registry: t.sim.registry });
  t.cleanup();
});

test('docking mid-hold drops the beam as player_docked — never a phantom launch', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  t.player.flags.docked = true; // dock with the key still physically down
  t.state.input.actions.gyreSnare = true;
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off');
  const off = [...t.events].reverse().find((e) => e.name === 'gyre:beamOff');
  assert.equal(off.p.reason, 'player_docked');
  assert.equal(t.sys._rt.launchedId, null, 'dock never bowls the clump');
  t.cleanup();
});

test('the launch burst still drains cap at the 1x rate', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const capBefore = t.player.cap;
  t.state.input.actions.gyreSnare = false;
  t.sim.step(); // release → LAUNCH
  assert.equal(t.sys._rt.phase, 'launching');
  const spent = capBefore - t.player.cap;
  const expected = T.capDrainPerS * DT;
  assert.ok(Math.abs(spent - expected) < 1e-9, `burst drains at 1x (got ${spent})`);
  t.cleanup();
});

test('the ball watch list drops its oldest watch without stripping a live ball\'s marks', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 40, 6);
  a.physicsBody.impactDamageScale = 0.2;
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
  assert.equal(t.sys._rt.ballId, a.id, 'A is the flying ball');
  // More launches than the 8-deep watch list — A, the oldest watch, retires live.
  for (let i = 0; i < 9; i++) {
    t.player.cap = 100;
    rock(t.sim, T.mawDist, 0, 40, 6);
    hold(t);
    for (let j = 0; j < 20; j++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
    release(t);
    for (let j = 0; j < 8; j++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
  }
  // Every slot is a live marked ball: the oldest drops its WATCH and sheds the weapon
  // payload, but keeps the mark — handing back mid-flight would strip pull/snag
  // immunity + launch kill-credit while it still flies. If a foreign owner later
  // strips its deadline while unwatched, the orphan is a benign immune body, not a
  // permanently-armed sleeper collider. Its own despawnAt still retires it; the
  // residue sweep re-watches the mark on any future load.
  assert.equal(a.data.gyreLaunched, true,
    'the evicted ball keeps its mark — immunity + kill credit ride the flight');
  assert.equal(a.physicsBody.impactDamageScale, 0.2,
    'the authored scale is restored — an unwatched orphan is benign, not a sleeper');
  assert.equal(a.data.gyrePrevImpactScale, undefined,
    'the scale stash is consumed by the disarm');
  // The serialized launch shadow RIDES THE MARK: the ball still carries gyreLaunched,
  // so a save:loaded boundary re-watches it and re-stamps kill credit from this meta.
  // Only adoption (_handBack) deletes it — that's the only path where "no lash
  // credit rides it" is true. Shedding meta here would silently un-credit the
  // evicted ball's post-load kills and collapse its re-adopted HUD mirror.
  assert.equal(a.data.gyreLaunchMeta && a.data.gyreLaunchMeta.tag, 'gyre_launch',
    'the launch meta rides the mark — post-load provenance re-stamps from it');
  assert.ok(Number.isFinite(a.data.despawnAt) && a.data.despawnAt > t.state.simTime,
    'its own deadline still retires it — no orphan');
  t.cleanup();
});

test('the tumble servo parks the held core near tumbleTargetRadS', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 240; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id);
  // 4 s of hold is plenty for the gain to settle: assert proximity, not exact equality —
  // basin noise and the spring keep it a lazy drift, not a locked rate.
  assert.ok(Math.abs(core.angVel - T.tumbleTargetRadS) < 0.25,
    `held core settles into lazy rubble drift ~${T.tumbleTargetRadS} rad/s, got ${core.angVel}`);
  t.cleanup();
});

test('a mode flip out of flight mid-hold drops with not_flight', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  t.state.mode = 'dock';
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off');
  assert.ok(t.events.some((e) => e.name === 'gyre:dropped' && e.p.reason === 'not_flight'));
  t.cleanup();
});

test('save:loaded mid-launch retires the beam but the ball keeps its deadline and watch', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0, 8, 4);
  hold(t);
  for (let i = 0; i < 15; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < 2; i++) t.sim.step(); // coil underway — still mid-throw
  t.bus.emit('save:loaded', {});
  assert.equal(t.sys._rt.phase, 'off', 'boundary still drops the lash cold');
  assert.equal(body.data.gyreLaunched, true, 'the flying ball keeps its mark post-load');
  assert.ok(Number.isFinite(body.data.despawnAt), 'the ball deadline survives the load');
  assert.ok(t.sys._rt.ballIds.includes(body.id), 'the sweep re-seeds the watch list from live marks');
  t.cleanup();
});

test('releasing while HOLD with a vanished core drops launch_without_core, never a ghost bowl', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 15; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id);
  t.state.entities.delete(core.id); // the clump vanished between ticks — release must not bowl air
  t.state.entityList = t.state.entityList.filter((e) => e !== core);
  release(t);
  assert.equal(t.sys._rt.phase, 'off');
  assert.ok(t.events.some((e) => e.name === 'gyre:dropped' && e.p.reason === 'launch_without_core'));
  assert.equal(t.events.some((e) => e.name === 'gyre:launched'), false);
  t.cleanup();
});

// ── wave-17 coverage ────────────────────────────────────────────────────────────
test('a deliberate bowl never rings the strain bell — strain reads zero through LAUNCH', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 15; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  // Strain excursion under HOLD: pin past the 320 strain floor (under the 640 break).
  for (let i = 0; i < 5; i++) {
    core.pos.x = t.player.pos.x + T.mawDist + 560; core.pos.z = t.player.pos.z;
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  assert.equal(t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_strain').length, 1,
    'the HOLD excursion latched its strain voice once');
  // Bowl while still strained — the coil/burst must not fire a second strain beat.
  release(t);
  assert.equal(t.sys._rt.phase, 'launching');
  const strainsBefore = t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_strain').length;
  for (let i = 0; i < T.launchWindupTicks + T.launchTicks + 2; i++) {
    core.pos.x = t.player.pos.x + T.mawDist + 560; core.pos.z = t.player.pos.z;
    t.sim.step();
    assert.equal(t.state.gyreSnare.strain01, 0, 'LAUNCH never publishes strain');
  }
  assert.equal(
    t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_strain').length,
    strainsBefore, 'no phantom strain beat on a deliberate bowl',
  );
  t.cleanup();
});

test('a reloaded ball keeps kill credit and re-adopts the HUD ball mirror', async () => {
  const t = await bootPhysics();
  const ball = rock(t.sim, T.mawDist, 0, 8, 4);
  hold(t);
  for (let i = 0; i < 15; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  assert.equal(t.sys._rt.ballId, ball.id);
  assert.equal(ball.data.gyreLaunched, true);
  // A real save:load rebuilds entities — the WeakMap record keyed on the OLD object is
  // gone. Simulate that here: same entity, provenance slot cleared (what a true
  // deserialization would look like to the kernel).
  clearImpulseProvenance(ball);
  t.sys.destroy();
  t.sys.init({ state: t.state, bus: t.bus, helpers: t.helpers, registry: t.sim.registry });
  assert.ok(ball.data.gyreLaunchMeta, 'launch serialized its credit meta');
  const rec = readRecentImpulseProvenance(ball, t.state.tick);
  assert.ok(rec && rec.tag === 'gyre_launch' && rec.actorId === t.state.playerId,
    'boundary sweep re-stamps kill credit from the serialized meta');
  assert.equal(t.sys._rt.ballId, ball.id, 'the sweep re-adopts the flying ball into the HUD mirror');
  assert.ok(t.sys._rt.ballMass > 0 && t.sys._rt.ballClumpRadius > 0, 'mirror mass/radius restored');
  t.sim.step();
  assert.equal(t.state.gyreSnare.launchedId, ball.id, 'HUD sees the ball live again');
  t.cleanup();
});

test('a meal that cannot wholly fit keeps all of its mass and volume', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 8, 4);
  hold(t);
  for (let i = 0; i < 15; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const rt = t.sys._rt;
  rt.clumpMass = T.maxClumpMass - 5;
  const meal = rock(t.sim, T.mawDist + 2, 0, 50, 30);
  const rBefore = rt.clumpRadius;
  t.state.input.actions.gyreSnare = true; t.sim.step(); t.sim.step(); t.sim.step();
  assert.equal(rt.clumpRadius, rBefore);
  assert.equal(rt.clumpMass, T.maxClumpMass - 5);
  assert.equal(meal.alive, true);
  assert.equal(meal.physicsBody.mass, 50);
  assert.equal(meal.physicsBody.radius, 30);
  assert.equal(t.state.gyreSnare.basinCount, 0, 'no impossible meal is promised');
  assert.equal(t.state.gyreSnare.tooHeavyCount, 1);
  t.cleanup();
});

// ── wave-18 coverage ────────────────────────────────────────────────────────────
test('an absorbable in the cone∩annulus overlap counts once for the +N net read', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id, 'core held before the overlap meal');
  // The meal sits 60 wu nose-ward of the core: inside the suck annulus
  // (clumpRadius + 88 ≈ 92) and inside the drawn basin (distMaw ≈ 51 ≤ 86), but
  // outside the absorb skin — pre-fix it fed BOTH basinCount and suckCount →
  // the HUD read 2 for one body.
  const meal = rock(t.sim, core.pos.x - 60, core.pos.z, 6, 4);
  for (let i = 0; i < 3; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const dCore = Math.hypot(meal.pos.x - core.pos.x, meal.pos.z - core.pos.z);
  const dMaw = Math.hypot(meal.pos.x - (t.player.pos.x + T.mawDist), meal.pos.z - t.player.pos.z);
  assert.ok(dCore < t.sys._rt.clumpRadius + T.suckBandWidth, `meal in the annulus (dCore=${dCore.toFixed(1)})`);
  assert.ok(dMaw <= T.basinRadius, `meal in the basin (dMaw=${dMaw.toFixed(1)})`);
  assert.equal(t.state.gyreSnare.basinCount, 1,
    `cone∩annulus overlap counts once (got ${t.state.gyreSnare.basinCount})`);
  release(t);
  t.cleanup();
});

test('destroy() before init() is a no-op, not a crash', async () => {
  // The registry runs destroy hooks across the manifest even when init never ran —
  // _rt may simply not exist yet. Nothing tracked means nothing to clean.
  const fresh = Object.create(gyreSnare);
  assert.doesNotThrow(() => fresh.destroy());
  assert.equal(fresh._rt.phase, 'off', 'destroy mints a fresh runtime');
});

test('an adopted ball with a stale authored deadline is not assassinated', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  core.data.despawnAt = t.state.simTime + 0.5; // authored deadline ~0.5s out — stashed at snag
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, core.id, 'timed core snagged');
  release(t);
  for (let i = 0; i < 10; i++) t.sim.step(); // burst finishes → ball flying on its 9s deadline
  assert.equal(t.sys._rt.ballId, core.id, 'ball flying');
  assert.ok(Number.isFinite(core.data.despawnAt) && core.data.despawnAt > 2,
    'the launch deadline replaced the authored one');
  for (let i = 0; i < 90; i++) t.sim.step(); // ~1.5s — the authored stash is now in the past
  // The adopter strips despawnAt to keep the body — restoring the stale stash here
  // would kill it on the next lifetime sweep and silently defeat the adoption.
  delete core.data.despawnAt;
  t.sim.step();
  assert.equal(core.data.gyreLaunched, undefined, 'adoption unmarks the ball');
  assert.equal(core.data.despawnAt, undefined,
    'a stale authored deadline is NOT resurrected under an adopter');
  assert.equal(core.data.gyrePrevDespawnAt, undefined, 'the stale stash is consumed');
  assert.equal(core.data.gyrePrevTtl, undefined,
    'the countdown stash is consumed too — a nearly-exhausted authored ttl would ' +
    'assassinate the adopter\'s body the same way');
  t.cleanup();
});

test('save:loaded with >8 live balls bounds the watch and adopts the freshest', async () => {
  const t = await bootPhysics();
  const balls = [];
  for (let i = 0; i < 10; i++) {
    const b = rock(t.sim, 400 + i * 50, 0, 6, 4);
    b.data.gyreLaunched = true;
    b.data.despawnAt = t.state.simTime + 4 + i; // balls[9] has the freshest deadline
    b.data.gyreLaunchMeta = {
      actorId: t.state.playerId, weaponId: 'wpn_gyre_snare', tag: 'gyre_launch',
      magnitude: 120, holdUntilSim: t.state.simTime + 4 + i, clumpRadius: 6,
    };
    balls.push(b);
  }
  // A serialized ball can carry pre-snag lifetime stashes — the overflow eviction
  // keeps marks, so the stashes ride inert rather than clobbering anything.
  balls[0].data.gyrePrevDespawnAt = t.state.simTime + 999;
  balls[0].data.gyrePrevTtl = 5;
  const keptDeadline = balls[0].data.despawnAt;
  const keptStash = balls[0].data.gyrePrevDespawnAt;
  t.bus.emit('save:loaded', {});
  t.sim.step();
  assert.equal(t.sys._rt.ballIds.length, 8, 'the watch list stays bounded at 8');
  // Overflow retires the earliest-tracked WATCHES and DISARMS the weapon payloads —
  // every slot is live+marked so no hand-back runs: immunity stays, the credit
  // shadow RIDES THE MARK (a later load re-stamps provenance from it), and only the
  // sleeper scale sheds with the watch (an unwatched orphan is benign, not armed).
  assert.equal(balls[0].data.gyreLaunched, true, 'overflow ball keeps its mark');
  assert.equal(balls[0].data.gyreLaunchMeta && balls[0].data.gyreLaunchMeta.tag, 'gyre_launch',
    'the credit shadow rides the mark — the next load re-stamps provenance from it');
  assert.equal(balls[0].data.despawnAt, keptDeadline,
    'the live launch deadline stands — the overflow retires the watch only');
  assert.equal(balls[0].data.gyrePrevDespawnAt, keptStash,
    'the despawnAt stash rides inert — disarm never touches live deadlines');
  assert.equal(balls[0].data.gyrePrevTtl, 5, 'the ttl stash rides along too');
  assert.equal(balls[1].data.gyreLaunched, true, 'second overflow keeps its mark too');
  assert.equal(balls[9].data.gyreLaunched, true, 'the youngest ball keeps its mark');
  assert.equal(t.sys._rt.ballId, balls[9].id,
    'the HUD mirror adopts the freshest deadline, not iteration order');
  assert.equal(t.state.gyreSnare.launchedId, balls[9].id,
    'the mirror survives the load — the sweep re-adopts after the boundary reset');
  t.cleanup();
});

test('the launch windup coils the clump aft of the maw before the burst', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  release(t);
  // Release edge: LAUNCH begins with the coil owed first (launchLeft is stamped
  // alongside — the burst only fires once launchWindup drains to 0).
  assert.ok(t.sys._rt.launchWindup > 0, 'the coil is owed before the burst');
  const dir = t.sys._rt.launchDir;
  const maw = t.sys._maw(t.player, { x: 0, z: 0 });
  // A few coil ticks: the spring drags the clump toward the coil point — maw minus
  // launchWindupPullWu along the launch axis — the slingshot anticipation a
  // truncated windup would silently skip. (The orbit can seat the clump anywhere
  // on its ring, so the honest check is convergence, not raw aftness.)
  const coil = { x: maw.x - dir.x * T.launchWindupPullWu, z: maw.z - dir.z * T.launchWindupPullWu };
  const d0 = Math.hypot(core.pos.x - coil.x, core.pos.z - coil.z);
  for (let i = 0; i < 3; i++) t.sim.step();
  assert.equal(t.sys._rt.phase, 'launching');
  const d1 = Math.hypot(core.pos.x - coil.x, core.pos.z - coil.z);
  assert.ok(d1 < d0 - 1,
    `the coil spring pulled the clump toward the windup point (d0=${d0.toFixed(2)} → d1=${d1.toFixed(2)})`);
  assert.ok(t.state.gyreSnare.launchWindup01 > 0 && t.state.gyreSnare.launchWindup01 < 1,
    'the mirror publishes the coil ramp while it winds');
  // The burst then bowls it FORWARD — aft of the coil becomes ahead of the maw.
  for (let i = 0; i < 14; i++) t.sim.step();
  const ahead = (core.pos.x - maw.x) * dir.x + (core.pos.z - maw.z) * dir.z;
  assert.ok(ahead > 30, `post-burst the ball flies downrange (ahead=${ahead.toFixed(2)})`);
  t.cleanup();
});

test('losing the player mid-hold drops the clump as player_lost, not a launch', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  // The player body is simply GONE — destroyed mid-hold (not docked, not a release).
  t.state.entities.delete(t.player.id);
  t.state.playerId = null;
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off');
  assert.ok(t.events.some((e) => e.name === 'gyre:dropped' && e.p.reason === 'player_lost'),
    'the drop reads player_lost, not released/player_docked');
  assert.equal(t.sys._rt.launchedId, null, 'a dead player never bowls the clump');
  t.cleanup();
});

test('a second bowl mid-flight keeps both balls marked and they retire independently', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, a.id, 'A cored');
  release(t);
  for (let i = 0; i < 10; i++) t.sim.step(); // burst done — A is flying
  assert.equal(t.sys._rt.ballId, a.id, 'A is the flying ball');
  const aScale = a.physicsBody.impactDamageScale;

  // Re-beam + snag + bowl a SECOND clump while A is still mid-flight.
  const b = rock(t.sim, T.mawDist + 2, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, b.id, 'B cored on the re-beam');
  release(t);
  for (let i = 0; i < 10; i++) t.sim.step();

  assert.equal(b.data.gyreLaunched, true, 'B launched full-strength');
  assert.ok(Number.isFinite(b.physicsBody.impactDamageScale) && b.physicsBody.impactDamageScale >= 1,
    'B carries the weapon scale');
  assert.equal(a.data.gyreLaunched, true, 'A keeps its mark mid-flight');
  assert.equal(a.physicsBody.impactDamageScale, aScale, 'A keeps the weapon scale');
  assert.ok(t.sys._rt.ballIds.includes(a.id) && t.sys._rt.ballIds.includes(b.id),
    'the watch list holds both live balls');
  assert.equal(t.sys._rt.ballId, b.id, 'the mirror tracks the freshest launch');

  // A expires on its own deadline while B keeps flying — independent retire.
  // (The lifetime sweep kills the body; the gyre mark dies with it — what the
  // lash's book keeps is the watch-list slot and the HUD mirror.)
  a.data.despawnAt = t.state.simTime + 0.02;
  for (let i = 0; i < 6; i++) t.sim.step();
  assert.equal(a.alive, false, 'A retired on its own deadline');
  assert.ok(!t.sys._rt.ballIds.includes(a.id), 'A left the watch list');
  assert.equal(b.data.gyreLaunched, true, 'B still marked and flying');
  assert.ok(t.sys._rt.ballIds.includes(b.id), 'B still watched');
  t.cleanup();
});


// ── wave-21 coverage ────────────────────────────────────────────────────────────
test('thrownBeat fires on exactly one tick — the first burst tick, with gyre:thrown', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 8, 4);
  hold(t);
  for (let i = 0; i < 15; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  let beats = 0;
  for (let i = 0; i < T.launchWindupTicks + T.launchTicks + 4; i++) {
    t.sim.step();
    if (t.state.gyreSnare.thrownBeat) {
      beats += 1;
      assert.equal(t.sys._rt.launchLeft, T.launchTicks - 1,
        'the flag marks the first consumed burst tick — same condition as gyre:thrown');
    }
  }
  assert.equal(beats, 1, `exactly one thrownBeat per launch (got ${beats})`);
  assert.equal(t.events.filter((e) => e.name === 'gyre:thrown').length, 1);
  t.cleanup();
});

test('basinSpots publishes the pulled bodies so the victim glow has a target', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist + 60, 20, 6, 4);
  const b = rock(t.sim, T.mawDist - 90, 5, 6, 4); // wedge pull
  hold(t);
  t.sim.step();
  const spots = t.state.gyreSnare.basinSpots;
  assert.ok(Array.isArray(spots) && spots.length >= 2, `spots for pulled bodies (got ${spots && spots.length})`);
  const ids = [a.id, b.id];
  for (const s of spots) {
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z) && s.r > 0, 'spot carries x/z/r');
    // k = the lane's accel share — the glow's pull-strength honesty. Deep-in-wedge
    // bodies read ~1; the gate keeps a dead-lip ghost out of the ledger entirely.
    assert.ok(Number.isFinite(s.k) && s.k > 0.05 && s.k <= 1, `spot carries pull strength (got ${s.k})`);
  }
  // Off-phase publishes an empty ledger, never stale positions.
  release(t);
  for (let i = 0; i < 8; i++) t.sim.step();
  assert.equal(t.state.gyreSnare.basinSpots.length, 0, 'spots die with the beam');
  assert.ok(ids.length === 2);
  t.cleanup();
});

// ── wave-24 coverage ────────────────────────────────────────────────────────────
test('basinSpots stay bounded at basinSpotMax — and the strongest grips win the slots', async () => {
  const t = await bootPhysics();
  // Nine rocks on a ring just past snagRadius — deep basin (k = 1 each), but nothing
  // cores, so the beam stays in BEAM and every body is a spot candidate.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    rock(t.sim, T.mawDist + Math.cos(a) * 65, Math.sin(a) * 65, 6, 4);
  }
  // …plus one wedge-lip body with a weak pull (radial past the drawn rim).
  // Apex sits noseGap+playerRadius ahead of the hull: axial ~60, radial ~40 puts the
  // rock inside the soft lip where pullK ≈ 0.42 — a real spot candidate that must lose.
  const lip = rock(t.sim, 86, 40, 6, 4);
  hold(t);
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'beaming', 'nothing in snag range — the pass stays a basin scan');
  const spots = t.state.gyreSnare.basinSpots;
  assert.equal(spots.length, T.basinSpotMax, `ledger capped (got ${spots.length})`);
  for (const s of spots) {
    assert.ok(s.k > 0.9, `a deep-basin grip outranks the lip body (k=${s.k})`);
  }
  assert.ok(!spots.some((s) => Math.abs(s.x - lip.pos.x) < 1 && Math.abs(s.z - lip.pos.z) < 1),
    'the lip body never takes a slot from a basin grip');
  t.cleanup();
});

test('snag cores the CLOSEST absorbable at the maw, not the first the query walks', async () => {
  const t = await bootPhysics();
  const near = rock(t.sim, T.mawDist + 6, 0, 6, 4);
  const far = rock(t.sim, T.mawDist + 16, 5, 6, 4); // still inside snagRadius
  hold(t);
  assert.equal(t.sys._rt.coreId, near.id, 'the nearer body cores');
  assert.equal(t.sys._rt.phase, 'holding');
  t.cleanup();
});

test('absorb still retires the meal when helpers.removeEntity is absent (alive-flag fallback)', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const core = t.state.entities.get(t.sys._rt.coreId);
  const meal = rock(t.sim, core.pos.x + 4, core.pos.z, 2, 2);
  const removeEntity = t.helpers.removeEntity;
  t.helpers.removeEntity = null;
  const absorbed0 = t.sys._rt.totalAbsorbed;
  try {
    for (let i = 0; i < 60 && meal.alive !== false; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  } finally {
    t.helpers.removeEntity = removeEntity;
  }
  assert.equal(meal.alive, false, 'the meal retires through the alive-flag fallback');
  assert.ok(t.sys._rt.totalAbsorbed > absorbed0, 'the absorb still ledgered');
  t.cleanup();
});

test('a drop during LAUNCH emits coreId null — the ball already flew, nothing was torn', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  release(t); // release edge → _launch → phase 'launching', coil running
  assert.equal(t.sys._rt.phase, 'launching');
  t.state.playerId = 'gone'; // player_lost mid-windup
  t.sim.step();
  const drops = t.events.filter((e) => e.name === 'gyre:dropped');
  const last = drops[drops.length - 1];
  assert.ok(last, 'the drop emitted');
  assert.equal(last.p.reason, 'player_lost');
  assert.equal(last.p.coreId, null, 'launch-phase drop emits no clump id');
  t.cleanup();
});

test('a capped clump stops promising a next meal (basinCount gates on full)', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  t.sys._rt.clumpMass = T.maxClumpMass; // simulate a saturated ball
  const inNet = rock(t.sim, T.mawDist + 10, 8, 6, 4); // absorbable parked in the basin
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.state.gyreSnare.basinCount, 0,
    'a capped ball has no next meal — the +N tail stays silent');
  assert.ok(inNet.alive !== false);
  t.cleanup();
});

test('a lagging clump shades strain01 via the spring residual — never the tear band', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  // Drag the ball far off its orbit slot but inside the strain band: lag ≈ 80 wu,
  // maw distance stays << holdStrainDist → dist-strain is 0, lag-strain shades in.
  core.pos.x = T.mawDist + 80;
  core.pos.z = 0;
  t.state.input.actions.gyreSnare = true; t.sim.step();
  const s = t.state.gyreSnare.strain01;
  assert.ok(s > 0.05 && s < 0.4, `lag reads as mild tension, never alarm (got ${s})`);
  t.cleanup();
});

test('non-absorbable loot under tow publishes towCount — TOWING answers "why no snag"', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist + 30, 10, 6, 4, 'pickup');   // absorbable? no — dragged only
  rock(t.sim, T.mawDist + 55, -18, 8, 5, 'mine');
  rock(t.sim, T.mawDist + 45, 14, 1, 2, 'projectile'); // point-defense tug: not "loot"
  hold(t);
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'beaming', 'nothing absorbable to core');
  assert.equal(t.state.gyreSnare.basinCount, 0, 'loot never counts as the next meal');
  assert.equal(t.state.gyreSnare.towCount, 2,
    `tugged bullets don't inflate the retrievable read (got ${t.state.gyreSnare.towCount})`);
  t.cleanup();
});

test('a heavy clump drags the helm — the lash is not massless to the ship', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 200, 14);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  // Park the ball well off its slot so the spring pulls hard; the helm eats the
  // small counter-force in opposition (forward — the ball ahead tugs the ship on).
  core.pos.x = T.mawDist + 90;
  core.pos.z = 0;
  const vx0 = t.player.vel.x;
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const dv = t.player.vel.x - vx0;
  assert.ok(dv > 1, `the ship is tugged under a heavy clump (Δvx ${dv.toFixed(2)})`);
  t.cleanup();
});

test('a gyreCore residue body cannot be re-snagged (defense-in-depth lane parity)', async () => {
  const t = await bootPhysics();
  const marked = rock(t.sim, T.mawDist + 8, 0, 6, 4);
  marked.data.gyreCore = true; // residue no sweep path reached
  rock(t.sim, T.mawDist + 30, 10, 6, 4); // a clean absorbable further out of range
  hold(t);
  t.sim.step();
  assert.notEqual(t.sys._rt.coreId, marked.id, 'residue flag wins — the marked body is never cored');
  assert.equal(marked.data.gyreCore, true, 'flag left alone by the pass');
  t.cleanup();
});

// ── wave-22 coverage ────────────────────────────────────────────────────────────
test('the lash never eats pickups — tugged, never merged (loot is not katamari fuel)', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4); // the core
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const core = t.state.entities.get(t.sys._rt.coreId);
  // Loot right on the clump's skin — inside the suck band where an absorbable would merge.
  const loot = rock(t.sim, core.pos.x + 6, core.pos.z, 2, 2, 'pickup');
  const members0 = t.sys._rt.members.length;
  for (let i = 0; i < 90; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  const alive = t.state.entities.get(loot.id);
  assert.ok(alive && alive.alive !== false, 'the pickup survives pressed against the clump');
  assert.equal(t.sys._rt.members.length, members0, 'never merged into the clump ledger');
  t.cleanup();
});

test('fuseS publishes the burn countdown during hold and dies with the beam', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  assert.ok(t.state.gyreSnare.fuseS > 0 && Number.isFinite(t.state.gyreSnare.fuseS),
    `fuse reads positive while holding (got ${t.state.gyreSnare.fuseS})`);
  release(t);
  for (let i = 0; i < T.launchWindupTicks + T.launchTicks + 4; i++) t.sim.step();
  assert.equal(t.state.gyreSnare.fuseS, 0, 'no fuse once the beam is gone');
  t.cleanup();
});

// ── wave-26 coverage ────────────────────────────────────────────────────────────
test('two balls expiring on the same tick each get a grave — primary ring + watched ring', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < 10; i++) t.sim.step(); // A flying
  const b = rock(t.sim, T.mawDist + 2, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < 10; i++) t.sim.step(); // B flying, the HUD's primary
  assert.equal(t.sys._rt.ballId, b.id);
  assert.ok(t.sys._rt.ballIds.includes(a.id) && t.sys._rt.ballIds.includes(b.id));

  const deaths0 = t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_ball_death').length;
  // Both deadlines on the same tick: the non-primary walks the watch-list retire, the
  // primary walks the ballGrave branch — same step, no starved beat.
  a.data.despawnAt = t.state.simTime + 0.02;
  b.data.despawnAt = t.state.simTime + 0.02;
  t.sim.step(); // simTime advances past both deadlines on the second tick
  t.sim.step();
  assert.equal(t.state.gyreSnare.ballGrave, true, 'the primary ball bloomed its ring');
  assert.equal(t.state.gyreSnare.graves.length, 1, 'the watched ball published its grave spot');
  assert.equal(
    t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_ball_death').length - deaths0,
    2, 'each ball sang its own shatter',
  );
  t.sim.step();
  assert.equal(a.data.gyreLaunchMeta, undefined, 'A disarmed on the way out');
  assert.equal(b.data.gyreLaunchMeta, undefined, 'B disarmed on the way out');
  assert.equal(t.sys._rt.ballIds.length, 0, 'watch list empty');
  t.cleanup();
});

test('the strain voice re-arms after a drop — a second clump strains with its own cue', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  a.pos.x = t.player.pos.x + T.mawDist + 560; a.pos.z = t.player.pos.z;
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(
    t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_strain').length, 1,
    'first excursion latched its cue',
  );
  // Strain break — the drop clears the latch, the beam is off, a fresh lash starts cold.
  a.pos.x = t.player.pos.x + T.mawDist + 700; a.pos.z = t.player.pos.z;
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.sys._rt.phase, 'off', 'the tear dropped the beam');
  t.state.input.actions.gyreSnare = false; t.sim.step();
  const b = rock(t.sim, T.mawDist + 2, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.coreId, b.id, 'new clump cored');
  b.pos.x = t.player.pos.x + T.mawDist + 560; b.pos.z = t.player.pos.z;
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(
    t.events.filter((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_strain').length, 2,
    'the second clump strained with its own cue, not a stale latch',
  );
  t.cleanup();
});

test('a dying capacitor warns once per hold — fuseLow latches under 3 s of burn', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 6; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  t.player.cap = 5; // ~0.5 s of burn at any drainMult — well under fuseLowWarnS
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.ok(t.state.gyreSnare.fuseS > 0 && t.state.gyreSnare.fuseS < T.fuseLowWarnS,
    `fuse reads under the warn floor (got ${t.state.gyreSnare.fuseS})`);
  assert.equal(t.sys._rt.fuseCueLatched, true, 'the warning latched');
  assert.ok(t.events.some((e) => e.name === 'audio:cue' && e.p.id === 'gyre_snare_fuse_low'),
    'the low thrum fired');
  assert.ok(t.events.some((e) => e.name === 'gyre:fuseLow'), 'the pad pulse fired');
  const before = t.events.filter((e) => e.name === 'gyre:fuseLow').length;
  for (let i = 0; i < 3 && t.sys._rt.phase === 'holding'; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  assert.equal(t.events.filter((e) => e.name === 'gyre:fuseLow').length, before,
    'latched — no thrum-per-tick buzz while the tank dies');
  t.cleanup();
});

test('a body spiraling into the clump glows like a basin victim (suck-lane spots)', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const core = t.state.entities.get(t.sys._rt.coreId);
  // Victim inside the suck annulus but off the skin: the pull lane owns it nowhere,
  // yet it must still glow on the way in.
  const victim = rock(t.sim, core.pos.x + 40, core.pos.z, 6, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step(); // spatial index registers the spawn
  t.state.input.actions.gyreSnare = true; t.sim.step();
  const spot = (t.state.gyreSnare.basinSpots || []).find(
    (s) => Math.hypot(s.x - victim.pos.x, s.z - victim.pos.z) < 20,
  );
  assert.ok(spot, `the in-flight meal publishes a pull glow (spots=${JSON.stringify(t.state.gyreSnare.basinSpots)})`);
  assert.ok(spot.k > 0.05, 'glow rides a real grip share');
  assert.equal(spot.abs, true, 'a meal spiraling in is absorbable — eligible for the hot seat');
  t.cleanup();
});

test('a courtesy-tugged pickup in the annulus publishes abs:false', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const core = t.state.entities.get(t.sys._rt.coreId);
  const loot = rock(t.sim, core.pos.x + 40, core.pos.z, 2, 2, 'pickup');
  t.state.input.actions.gyreSnare = true; t.sim.step(); // spatial index registers the spawn
  t.state.input.actions.gyreSnare = true; t.sim.step();
  const spot = (t.state.gyreSnare.basinSpots || []).find(
    (s) => Math.hypot(s.x - loot.pos.x, s.z - loot.pos.z) < 20,
  );
  assert.ok(spot, `the tugged loot publishes a pull glow (spots=${JSON.stringify(t.state.gyreSnare.basinSpots)})`);
  assert.equal(spot.abs, false, 'loot under tow can never be caught — no hot seat');
  t.cleanup();
});

test('the suck lane corkscrews — tangential share rides the eased stir', () => {
  // boot() not bootPhysics(): with no physics system draining the queue the
  // queued impulses survive the step for consumption — and the body never moves,
  // so the radial/tangential decomposition stays clean.
  const t = boot();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const core = t.state.entities.get(t.sys._rt.coreId);
  // Absorbable inside the band but well past skin contact (fresh-snag reach ~55 wu).
  const meal = rock(t.sim, core.pos.x + 30, core.pos.z, 2, 2);
  t.state.input.actions.gyreSnare = true; t.sim.step(); // spatial index registers the spawn
  t.state.input.actions.gyreSnare = true; t.sim.step();
  const cmd = consumePhysicsCommand(meal);
  assert.ok(cmd && cmd.impulses && cmd.impulses.length >= 1, 'the annulus pulls its meal');
  let ix = 0, iz = 0;
  for (const imp of cmd.impulses) { ix += imp.x; iz += imp.z; }
  const dx = core.pos.x - meal.pos.x, dz = core.pos.z - meal.pos.z;
  const dist = Math.hypot(dx, dz);
  const rx = dx / dist, rz = dz / dist;
  const radial = ix * rx + iz * rz;   // radial share (∝ pull)
  const perp = ix * -rz + iz * rx;    // tangential share (∝ pull·suckSwirlFrac·swirlBlend)
  const swirl = t.sys._rt.swirlBlend;
  assert.ok(radial > 0, `the meal is dragged inward (radial=${radial.toFixed(1)})`);
  assert.ok(Math.sign(perp) === Math.sign(swirl),
    `the corkscrew rides the stir sign (perp=${perp.toFixed(1)}, swirl=${swirl.toFixed(2)})`);
  // Ratio ≈ frac·swirl (damping is ~zero on a fresh, still meal) — a ray-shooting
  // lane (frac=0) is what this regressed against.
  const ratio = perp / radial;
  assert.ok(Math.abs(ratio - T.suckSwirlFrac * swirl) < 0.12,
    `tangential/radial ≈ suckSwirlFrac·swirlBlend (got ${ratio.toFixed(3)} vs ${(T.suckSwirlFrac * swirl).toFixed(3)})`);
  // Flip the eased stir: the corkscrew re-stirs, same convention as the basin.
  t.sys._rt.swirlBlend = -swirl;
  t.state.input.actions.gyreSnare = true; t.sim.step();
  const cmd2 = consumePhysicsCommand(meal);
  const imp2 = cmd2 && cmd2.impulses && cmd2.impulses[cmd2.impulses.length - 1];
  if (imp2) {
    const dx2 = core.pos.x - meal.pos.x, dz2 = core.pos.z - meal.pos.z;
    const d2 = Math.hypot(dx2, dz2);
    const perp2 = imp2.x * -(dz2 / d2) + imp2.z * (dx2 / d2);
    assert.ok(Math.sign(perp2) === -Math.sign(swirl),
      `flipping the stir flips the corkscrew (perp=${perp2.toFixed(1)})`);
  }
});

test('a strain break publishes the torn core\'s last ~0.5 s — the close flies the rubble with it', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  t.sys._drop('strained');
  t.state.input.actions.gyreSnare = false;
  t.sim.step();
  assert.equal(t.state.gyreSnare.tornId, body.id, 'the freed core publishes its track');
  assert.equal(t.state.gyreSnare.dropReason, 'strained');
  // tornPos is captured in the system's own update — one tick behind physics —
  // so it lags the live body by up to a step of the snap's flight (~4 wu bound).
  assert.ok(Math.hypot(t.state.gyreSnare.tornPos.x - body.pos.x, t.state.gyreSnare.tornPos.z - body.pos.z) < 4,
    `tornPos tracks the freed body's live pos (lag=${Math.hypot(t.state.gyreSnare.tornPos.x - body.pos.x, t.state.gyreSnare.tornPos.z - body.pos.z).toFixed(2)} wu)`);
  for (let i = 0; i < 40; i++) t.sim.step(); // ~0.67 s — past the ~0.5 s window
  assert.equal(t.state.gyreSnare.tornId, null, 'the follow releases after ~0.5 s');
  // A polite release never publishes a track.
  const t2 = await bootPhysics();
  const body2 = rock(t2.sim, T.mawDist, 0, 6, 4);
  hold(t2);
  for (let i = 0; i < 8; i++) { t2.state.input.actions.gyreSnare = true; t2.sim.step(); }
  t2.sys._drop('released');
  t2.state.input.actions.gyreSnare = false; t2.sim.step();
  assert.equal(t2.state.gyreSnare.tornId, null, 'a polite release publishes no torn track');
  t.cleanup(); t2.cleanup();
});

test('a fieldResponseMult-0 body shrugs the basin coupling off entirely', () => {
  const t = boot();
  // A dedicated core first — the mult-0 twin spawns after the hold so it can't
  // be the snag itself (a held core's orbit-spring impulses are the lash's own).
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  // Same rock, two response profiles — parked just inside the basin wedge.
  const ghost = rock(t.sim, T.mawDist + 30, 0, 6, 4);
  ghost.physicsBody.fieldResponseMult = 0;
  const live = rock(t.sim, T.mawDist + 30, 40, 6, 4);
  t.state.input.actions.gyreSnare = true; t.sim.step(); // spatial index registers the spawns
  t.state.input.actions.gyreSnare = true; t.sim.step();
  const gcmd = consumePhysicsCommand(ghost);
  assert.ok(!gcmd || !gcmd.impulses || gcmd.impulses.length === 0,
    'a zero-response body gets no basin pull');
  const lcmd = consumePhysicsCommand(live);
  assert.ok(lcmd && lcmd.impulses && lcmd.impulses.length >= 1, 'its twin still eats the pull');
});

test('the strain edge is strict: exactly holdBreakDist holds, a hair past it tears', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const maw = { x: 0, z: 0 };
  t.sys._maw(t.player, maw);
  // Park the core exactly ON the break line: the spring drags it back — no tear.
  core.pos.x = maw.x + T.holdBreakDist; core.pos.z = maw.z;
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.sys._rt.phase, 'holding', 'dist == holdBreakDist is not a tear (strict >)');
  // A hair past it slips.
  t.sys._maw(t.player, maw);
  core.pos.x = maw.x + T.holdBreakDist + 1.5; core.pos.z = maw.z;
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.equal(t.sys._rt.phase, 'off', 'dist > holdBreakDist tears');
  assert.equal(t.state.gyreSnare.dropReason, 'strained');
  assert.equal(t.state.gyreSnare.tornId, core.id, 'the freed core publishes its track');
  t.cleanup();
});

test('suck-band floor: a fresh snag\'s reach stays inside the basin, mass re-widens it', () => {
  const t = boot(9401);
  const rt = t.sys._rt;
  rt.clumpRadius = 6;
  const fresh = t.sys._suckRadius(rt);
  assert.ok(fresh < T.basinRadius,
    `fresh snag reach ${fresh.toFixed(1)} wu must sit under the basin's ${T.basinRadius} wu`);
  assert.ok(Math.abs(fresh - (6 * (1 + T.suckBandMassGain) + Math.min(T.suckBandWidth, T.suckBandFloor + 6))) < 1e-6,
    'the floor band is min(suckBandWidth, suckBandFloor + clumpRadius)');
  rt.clumpRadius = 30;
  assert.ok(t.sys._suckRadius(rt) > T.basinRadius,
    'the annulus out-reaches the basin once the ball has mass — the appetite arc');
  rt.clumpRadius = 60;
  assert.equal(t.sys._suckRadius(rt), T.basinRadius * 1.5, 'the top-end reach cap is unchanged');
});

test('orbit rate floors at 0.3 — a capped moon still circles', () => {
  const t = boot(9407);
  const rt = t.sys._rt;
  rt.clumpRadius = 60;
  assert.ok(Math.abs(t.sys._orbitRate(rt) - T.orbitRate * 0.3) < 1e-9,
    `capped moon rate ${t.sys._orbitRate(rt)} vs floor ${(T.orbitRate * 0.3).toFixed(3)}`);
  rt.clumpRadius = 6;
  assert.equal(t.sys._orbitRate(rt), T.orbitRate, 'a pebble revolves at full rate');
  rt.clumpRadius = T.orbitRatePonderR;
  assert.equal(t.sys._orbitRate(rt), T.orbitRate, 'the ponderous knee is exactly orbitRatePonderR');
});

test('a too-heavy rock parked inside the suck annulus still eats the courtesy tug', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 10; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const core = t.state.entities.get(t.sys._rt.coreId);
  // Oversized for the clump's REMAINING mass (grown to cap-5, so a modest rock is
  // too-heavy while still light enough for tugK > 0.05) — the wave-39 dead spot:
  // 'too-heavy' used to `continue` before the courtesy tug, so the strongest gravity
  // zone (inside owned.r, basin lane suppressed) felt nothing.
  t.sys._rt.clumpMass = T.maxClumpMass - 5;
  const heavy = rock(t.sim, core.pos.x + 40, core.pos.z, 50, 6);
  t.state.input.actions.gyreSnare = true; t.sim.step(); // spatial index registers the spawn
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.ok(heavy.alive !== false, 'a too-heavy body is never absorbed');
  assert.ok(heavy.vel.x < -0.001,
    `the annulus tugs the too-heavy body toward the clump (vx=${heavy.vel.x.toFixed(4)})`);
  assert.ok((t.state.gyreSnare.towCount || 0) >= 1,
    `a heavy body under tow counts TOWING (got ${t.state.gyreSnare.towCount})`);
  assert.ok((t.state.gyreSnare.basinSpots || []).some(
    (s) => Math.hypot(s.x - heavy.pos.x, s.z - heavy.pos.z) < 30),
    'the tugged heavy publishes a pull glow like a basin victim');
  t.cleanup();
});

test('the funnel swirl eases to the clump\'s real orbitDir — no mid-feed flip', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  // Whatever sign the hash rolled, ~0.33 s of hold has the eased stir on it —
  // wave-41: swirlBlend was declared/read but never updated, so a -1 core ran a
  // permanently counter-rotating funnel for the whole hold.
  const dir = t.sys._rt.orbitDir;
  assert.ok(Math.sign(t.sys._rt.swirlBlend) === dir,
    `swirlBlend (${t.sys._rt.swirlBlend.toFixed(2)}) stirs the way the ball revolves (${dir})`);
  // Flip the roll: the vortex re-stirs over ~0.25 s — one tick may not flip it.
  const before = t.sys._rt.swirlBlend;
  t.sys._rt.orbitDir = -dir; // as if the next snag rolled the other sign
  t.state.input.actions.gyreSnare = true; t.sim.step();
  assert.ok(Math.abs(t.sys._rt.swirlBlend - before) <= DT * 4 + 1e-6,
    `one tick moves the stir by at most dt*4 (moved ${(t.sys._rt.swirlBlend - before).toFixed(3)})`);
  for (let i = 0; i < 45; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.ok(t.sys._rt.swirlBlend * (-dir) > 0.9,
    `swirlBlend converged to the new sign (got ${t.sys._rt.swirlBlend.toFixed(2)})`);
  t.cleanup();
});

test('a strain break whips the freed clump along its last orbit tangent', async () => {
  const t = await bootPhysics();
  const body = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 15; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const dir = t.sys._rt.orbitDir;
  // Isolated call — the ONLY impulse queued on the body is the parting snap.
  t.sys._drop('strained');
  const cmd = consumePhysicsCommand(body);
  assert.ok(cmd && cmd.impulses && cmd.impulses.length >= 1, 'the snap crosses the membrane');
  const imp = cmd.impulses[cmd.impulses.length - 1];
  const maw = t.sys._maw(t.player, {});
  let rx = body.pos.x - maw.x, rz = body.pos.z - maw.z;
  const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  const tanx = -rz * dir, tanz = rx * dir; // the last revolution's tangent
  const hyp = Math.hypot(imp.x, imp.z) || 1;
  assert.ok((imp.x * tanx + imp.z * tanz) / hyp > 0.85,
    `the snap rides the last orbit tangent (share=${((imp.x * tanx + imp.z * tanz) / hyp).toFixed(2)})`);
  const radial = (imp.x * rx + imp.z * rz) / hyp;
  assert.ok(radial > 0.25 && radial < 0.6, `...biased outward (share=${radial.toFixed(2)})`);
  const snapV = Math.max(T.tearSnapWuS,
    T.orbitRate * Math.max(T.orbitRadiusMin, 4 * T.orbitRadiusScale) * T.tearSnapOrbitFrac);
  assert.ok(Math.abs(hyp - 6 * snapV) < 1e-6,
    `impulse = mass × snapV (got ${hyp.toFixed(3)} vs ${(6 * snapV).toFixed(3)})`);
  t.cleanup();
  // And the whip belongs to the tear alone — a polite release never snaps.
  const t2 = await bootPhysics();
  const calm = rock(t2.sim, T.mawDist, 0, 6, 4);
  hold(t2);
  for (let i = 0; i < 10; i++) { t2.state.input.actions.gyreSnare = true; t2.sim.step(); }
  t2.sys._drop('released');
  assert.equal(consumePhysicsCommand(calm), null, 'a polite release never snaps its clump');
  t2.cleanup();
  // The ponderous branch: a grown clump snaps at the FLOORED revolve rate —
  // wave-52 caught the ledger reset zeroing clumpRadius before the snap read
  // the rate, unflooring every heavy tear (~73 wu/s instead of the authored ~22).
  const t3 = await bootPhysics();
  const heavy = rock(t3.sim, T.mawDist, 0, 6, 4);
  hold(t3);
  for (let i = 0; i < 15; i++) { t3.state.input.actions.gyreSnare = true; t3.sim.step(); }
  t3.sys._rt.clumpRadius = 60; // as grown — past the ponderous knee (14 wu)
  t3.sys._drop('strained');
  const hcmd = consumePhysicsCommand(heavy);
  const himp = hcmd.impulses[hcmd.impulses.length - 1];
  const hhyp = Math.hypot(himp.x, himp.z);
  const heavyRate = T.orbitRate * Math.max(0.3, Math.min(1, T.orbitRatePonderR / 60));
  const snapHeavy = Math.max(T.tearSnapWuS,
    heavyRate * Math.max(T.orbitRadiusMin, 60 * T.orbitRadiusScale) * T.tearSnapOrbitFrac);
  assert.ok(Math.abs(hhyp - 6 * snapHeavy) < 1e-6,
    `ponderous snap = mass × floored rate × orbitR × frac (got ${hhyp.toFixed(3)} vs ${(6 * snapHeavy).toFixed(3)})`);
  t3.cleanup();
});

test('the 9th live ball evicts the oldest watch — disarmed but still marked', async () => {
  const t = await bootPhysics();
  const balls = [];
  for (let n = 0; n < 9; n++) {
    const b = rock(t.sim, T.mawDist + n * 4, 0, 40, 6);
    hold(t);
    for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
    assert.equal(t.sys._rt.coreId, b.id, `ball ${n} cored`);
    release(t);
    for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
    assert.equal(t.sys._rt.ballId, b.id, `ball ${n} launched`);
    balls.push(b);
  }
  // _trackBall overflow: cap is 8 — the oldest LIVE marked ball is evicted, keeps its
  // mark + pull immunity (a mid-flight _handBack would drop those mid-flight), but
  // sheds the weapon payload so an unwatched orphan isn't a sleeper collider.
  assert.equal(t.sys._rt.ballIds.length, T.ballWatchMax, 'the watch list caps at 8');
  assert.ok(!t.sys._rt.ballIds.includes(balls[0].id), 'the oldest ball is the evictee');
  assert.equal(balls[0].data.gyreLaunched, true, 'the evictee keeps its launch mark');
  assert.equal(balls[0].data.gyreLaunchMeta && balls[0].data.gyreLaunchMeta.tag, 'gyre_launch',
    'the evictee keeps the serialized meta — post-load provenance re-stamps from it');
  assert.equal(balls[0].physicsBody.impactDamageScale, undefined,
    'the 8x sleeper scale is disarmed (no authored value to restore)');
  for (let n = 1; n < 9; n++) {
    assert.ok(t.sys._rt.ballIds.includes(balls[n].id), `ball ${n} stays watched`);
    assert.equal(balls[n].data.gyreLaunched, true, `ball ${n} stays marked`);
  }
  t.cleanup();
});

test('liveBalls republishes while the lash is OFF — a retired ball clears the +N', async () => {
  const t = await bootPhysics();
  const ball = rock(t.sim, T.mawDist, 0, 6, 4);
  hold(t);
  for (let i = 0; i < 5; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  t.state.input.actions.gyreSnare = false; t.sim.step();
  for (let i = 0; i < 12 && t.sys._rt.phase !== 'off'; i++) t.sim.step();
  assert.equal(t.sys._rt.phase, 'off');
  assert.equal(t.state.gyreSnare.liveBalls, 1, 'the flying ball publishes while OFF');
  // Quiet expiry through the real sweep — the count must follow the retirement even
  // though the mirror's live path never runs again while the beam is closed.
  ball.data.despawnAt = t.state.simTime + 0.02;
  for (let i = 0; i < 8; i++) t.sim.step();
  assert.equal(t.sys._rt.ballId, null, 'the sweep retired the ball');
  assert.equal(t.state.gyreSnare.liveBalls, 0,
    `a dead ball can't pin a phantom +N on the HUD (got ${t.state.gyreSnare.liveBalls})`);
  t.cleanup();
});

test('a core parked in the strain band publishes strain01 without dropping', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  // Park inside (holdStrainDist, holdBreakDist): the lash groans but never tears —
  // the band itself was previously only covered by its break-side edge.
  core.pos.x = T.mawDist + T.holdStrainDist + 80; // 560 wu off the maw → strain 0.5
  core.pos.z = 0;
  core.vel.x = 0; core.vel.z = 0;
  t.state.input.actions.gyreSnare = true; t.sim.step();
  const s = t.state.gyreSnare.strain01;
  assert.ok(s > 0.3 && s < 0.7, `in-band strain reads ~0.5 (got ${s.toFixed(2)})`);
  assert.equal(t.sys._rt.phase, 'holding', 'the band strains without tearing');
  assert.ok(!t.events.some((e) => e.name === 'gyre:dropped'), 'no drop inside the band');
  assert.equal(t.sys._rt.coreId, core.id, 'the clump is still tethered');
  t.cleanup();
});

test('save:loaded mid-hold dies the member ledger — a re-beam inherits nothing', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const meal = rock(t.sim, core.pos.x + 20, core.pos.z, 4, 3);
  t.sim.step(); // spatial index registers the meal
  for (let i = 0; i < 40 && t.sys._rt.members.length === 0; i++) {
    t.state.input.actions.gyreSnare = true; t.sim.step();
  }
  assert.ok(t.sys._rt.members.length > 0 || !meal.alive,
    'the meal merged before the boundary');
  t.bus.emit('save:loaded', {});
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off', 'the boundary drops the beam');
  assert.equal(t.sys._rt.members.length, 0, 'the member ledger is runtime-only — never serialized');
  assert.equal(t.state.gyreSnare.absorbs, 0, 'a fresh beam inherits no dead clump count');
  assert.equal(t.state.gyreSnare.clumpMass, 0, 'nor its mass');
  t.cleanup();
});

test('a sensor-collider absorbable never cores — a ghost ball would hit nothing', async () => {
  const t = await bootPhysics();
  const ghost = rock(t.sim, T.mawDist, 0, 6, 4);
  ghost.physicsBody.material = 'sensor'; // authored sensor collider — a thrown ball needs a real one
  hold(t);
  for (let i = 0; i < 30; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.notEqual(t.sys._rt.coreId, ghost.id, 'a sensor body is never the held core');
  assert.equal(ghost.data.gyreCore, undefined, 'no core mark either');
  release(t);
  t.cleanup();
});

test('loot inside the suck annulus counts towCount — the courtesy lane is still a tow', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 30, 8);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
  const clump = t.state.entities.get(t.sys._rt.coreId);
  // Parked inside the clump's annulus: the pull pass's owned-annulus guard skips it,
  // so the suck lane's courtesy tug is the only pull — and the only counter.
  rock(t.sim, clump.pos.x + 20, clump.pos.z + 5, 4, 3, 'pickup');
  for (let i = 0; i < 3; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.ok(t.state.gyreSnare.towCount >= 1,
    `annulus-towed loot counts (got ${t.state.gyreSnare.towCount})`);
  release(t);
  t.cleanup();
});

test('a second live ball publishes balls[] — trail, rumble, and countdown get their slots', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 40, 6);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
  assert.equal(t.sys._rt.ballId, a.id, 'A is the flying ball');
  t.player.cap = 100;
  const b = rock(t.sim, T.mawDist, 0, 40, 6);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < 8; i++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
  assert.equal(t.sys._rt.ballId, b.id, 'B is the newest primary');
  const pub = t.state.gyreSnare;
  assert.equal(pub.liveBalls, 2, 'both bowls are watched');
  const extra = pub.balls.find((x) => x.id === a.id);
  assert.ok(extra, 'the secondary ball publishes into balls[]');
  assert.ok(extra.ttlS > 0 && extra.ttlS <= T.ballTtlS, `secondary carries its countdown (got ${extra.ttlS})`);
  assert.ok(Number.isFinite(extra.x) && Number.isFinite(extra.ttl01), 'pos + ttl01 for the streak slot');
  t.cleanup();
});

test('a forward-moving ship bowls hotter — launchSpeed is a floor, not a cap', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 40, 6);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t); // stamps launch; the coil begins next tick
  // Drive the ship forward through the whole ~6-tick coil: the windup damps toward
  // the ship's moving frame, so the core carries forward residual into the burst —
  // the burst's Δv floor stacks on top instead of clamping it away.
  for (let i = 0; i < 7; i++) {
    t.player.vel.x = 300; t.player.vel.z = 0; // hold the drive — pinning, not drifting
    t.player.pos.x += 300 / 60; // ship-frame motion is the player's own tick; mirror it
    t.state.input.actions.gyreSnare = false; t.sim.step();
  }
  for (let i = 0; i < 6; i++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'off', 'burst finished');
  assert.ok(core.vel.x > T.launchSpeed + 40,
    `forward residual rides the throw — Δv beyond the authored floor (vx=${core.vel.x})`);
  t.cleanup();
});

test('an aft-moving ship still bowls exactly launchSpeed — the burst repays coil carry', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 40, 6);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t); // stamps launch; the coil begins next tick
  // Back the ship away through the whole coil — the ball chases a receding maw and
  // arrives at the burst with strong AFT residual. The burst repays it so the throw
  // lands at authored speed, not ~300 wu/s short.
  for (let i = 0; i < 7; i++) {
    t.player.vel.x = -300; t.player.vel.z = 0;
    t.player.pos.x -= 300 / 60;
    t.state.input.actions.gyreSnare = false; t.sim.step();
  }
  for (let i = 0; i < 6; i++) { t.state.input.actions.gyreSnare = false; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'off', 'burst finished');
  assert.ok(core.vel.x > T.launchSpeed - 80 && core.vel.x < T.launchSpeed + 80,
    `aft residual repaid — ball lands at authored pace (vx=${core.vel.x})`);
  t.cleanup();
});

test('the coil sings — gyre_snare_windup cues on the first windup tick', async () => {
  const t = await bootPhysics();
  rock(t.sim, T.mawDist, 0, 40, 6);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t); // stamps launch; the coil begins next tick
  t.state.input.actions.gyreSnare = false; t.sim.step(); // first coil tick
  assert.ok(t.events.some((e) => e.name === 'audio:cue' && e.p && e.p.id === 'gyre_snare_windup'),
    'the draw has a voice — shimmer emitted with the coil');
  t.cleanup();
});

test('launch speed sags with throw mass — a heavy katamari bowls slower', async () => {
  const t = await bootPhysics();
  const core = rock(t.sim, T.mawDist, 0, 1800, 20); // 75% of cap — the floor sags ~16.5%
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < T.launchTicks + T.launchWindupTicks + 4; i++) t.sim.step();
  const expected = T.launchSpeed * (1 - T.launchMassPenalty * Math.min(1, 1800 / T.maxClumpMass));
  const v = speed(core);
  assert.ok(Math.abs(v - expected) < 30,
    `heavy ball bowls at ~${expected.toFixed(0)} wu/s, got ${v.toFixed(1)}`);
  assert.ok(v < T.launchSpeed - 30, 'the mass penalty is real — below authored speed');
  t.cleanup();
});

test('soak: two live balls + a dry capacitor mid-second-launch retires cleanly', async () => {
  const t = await bootPhysics();
  const a = rock(t.sim, T.mawDist, 0, 40, 6);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  release(t);
  for (let i = 0; i < T.launchTicks + T.launchWindupTicks + 2; i++) {
    t.state.input.actions.gyreSnare = false; t.sim.step();
  }
  assert.equal(t.sys._rt.ballId, a.id, 'A is away');
  // Second hold on a fresh rock while A flies — then starve the capacitor and bowl B.
  t.player.cap = 100;
  const b = rock(t.sim, T.mawDist, 0, 40, 6);
  hold(t);
  for (let i = 0; i < 20; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding', 'B is the held clump');
  t.player.cap = 0; // dry BEFORE the launch begins — the burst ticks on an empty tank
  release(t);
  for (let i = 0; i < T.launchTicks + T.launchWindupTicks + 4; i++) {
    t.state.input.actions.gyreSnare = false; t.sim.step();
  }
  // The dry check is HOLD/BEAM-gated — a launch in progress always completes its bowl.
  // Both balls stay watched free bodies; the beam is off with nothing wedged behind.
  assert.equal(t.sys._rt.phase, 'off');
  assert.equal(t.state.gyreSnare.liveBalls, 2, 'both bowls stay watched');
  assert.ok(a.data.gyreLaunched && b.data.gyreLaunched, 'both carry the mark');
  assert.ok(t.sys._rt.ballIds.includes(a.id) && t.sys._rt.ballIds.includes(b.id),
    'watch list holds both ids through the dry launch');
  t.cleanup();
});

// ── wave-47 coverage ────────────────────────────────────────────────────────────
test('bus-less host: the tear snap and quiet-TTL retire are sim mutations, not cues', () => {
  // The sim factory defaults a bus for its own lifecycle, so the "bus-less host"
  // is the SYSTEM running with this.bus = null — exactly what the wave-46
  // `if (this.bus)` guards read.
  const sim = createSimulation({ seed: 5151, systems: [gyreSnare] });
  const { state } = sim;
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
  player.cap = 100;
  const sys = sim.registry.get('gyreSnare');
  sys.bus = null;
  assert.equal(sys.bus, null, 'the system runs with no bus at all');

  // Tear snap: the freed core eats its parting whip — wave-46 hoisted the
  // impulse out of the bus guard; this proves it actually runs bus-less.
  const body = rock(sim, T.mawDist, 0, 6, 4);
  state.input.actions.gyreSnare = true;
  for (let i = 0; i < 15; i++) sim.step();
  assert.equal(sys._rt.phase, 'holding');
  sys._drop('strained');
  const cmd = consumePhysicsCommand(body);
  assert.ok(cmd && cmd.impulses && cmd.impulses.length >= 1,
    'the tear snap crosses the membrane with no bus to sing through');

  // Quiet-TTL retire: a deadline-passed primary ball disarms + sheds its credit
  // shadow the same tick — on the bus-gated path it deferred a tick to the
  // !ball lane instead.
  const t2sim = sim;
  const ball = rock(t2sim, T.mawDist + 6, 0, 6, 4);
  ball.data.gyreLaunched = true;
  ball.data.gyreLaunchMeta = { mass: 6, members: [{ type: 'asteroid', radius: 4 }], clumpRadius: 6 };
  ball.physicsBody.impactDamageScale = 8;  // the launch payload rides physicsBody
  ball.data.gyrePrevImpactScale = 1.5;     // the authored value it stashed
  ball.data.despawnAt = state.simTime - 0.001; // already past — the quiet-TTL lane fires this step
  sys._rt.ballId = ball.id;
  sys._rt.launchedId = ball.id;
  sys._rt.ballIds.push(ball.id);
  sys._rt.ballMass = 6; sys._rt.ballClumpRadius = 6;
  sim.step(); // simTime advances past the deadline — the quiet-TTL lane fires
  assert.equal(sys._rt.ballId, null, 'the deadline-passed primary retired this tick');
  assert.equal(ball.data.gyreLaunchMeta, undefined, 'the credit shadow shed with the corpse');
  assert.equal(ball.physicsBody.impactDamageScale, 1.5, 'the authored scale restored on the way out');
  assert.equal(ball.data.gyrePrevImpactScale, undefined, 'the stash consumed');
  assert.equal(sys._rt.ballIds.length, 0, 'watch list emptied');
});

test('mid-hold protected adoption: a mission-pinned core is handed back, not held', () => {
  const t = boot(9091);
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  core.data.despawnAt = t.state.simTime + 20; // authored deadline
  core.ttl = 30;                            // authored countdown (entity channel)
  t.state.input.actions.gyreSnare = true;
  for (let i = 0; i < 15; i++) t.sim.step();
  assert.equal(t.sys._rt.phase, 'holding');
  assert.equal(t.sys._rt.coreId, core.id);
  assert.equal(core.data.despawnAt, undefined, 'snag stashed + cleared the authored deadline');
  assert.equal(core.ttl, Infinity, 'stasis froze the countdown');
  // A mission/loot system adopts the held wreck mid-HOLD.
  core.data.missionPinned = true;
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off', 'adoption frees the beam');
  assert.equal(t.sys._rt.coreId, null);
  assert.equal(core.data.gyreCore, undefined, 'the mark sheds');
  assert.ok(core.data.despawnAt > t.state.simTime, 'authored despawnAt restored (still in the future)');
  assert.equal(core.data.gyrePrevDespawnAt, undefined, 'despawnAt stash consumed');
  assert.ok(Math.abs(core.ttl - 30) < 0.2, `authored ttl restored under the future-only contract (got ${core.ttl})`);
  assert.equal(core.data.gyrePrevTtl, undefined, 'ttl stash consumed');
  assert.ok(t.events.some((e) => e.name === 'gyre:dropped' && e.p.reason === 'core_adopted'),
    'drop reason is core_adopted');
});

test('protected adoption at the release edge bowls nothing', () => {
  const t = boot(9191);
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  t.state.input.actions.gyreSnare = true;
  for (let i = 0; i < 15; i++) t.sim.step();
  assert.equal(t.sys._rt.phase, 'holding');
  // The adoption lands between the last HOLD tick and the release — the
  // launch-edge guard must hand back instead of bowling protected cargo.
  core.data.missionPinned = true;
  release(t);
  assert.equal(t.sys._rt.phase, 'off', 'the beam releases, nothing launches');
  assert.equal(core.data.gyreCore, undefined, 'the mark sheds');
  assert.ok(!t.events.some((e) => e.name === 'gyre:launched'), 'no launch fired');
  assert.ok(t.events.some((e) => e.name === 'gyre:dropped' && e.p.reason === 'core_adopted'),
    'drop reason is core_adopted, not released');
});

test('mid-launch protected adoption hands the half-thrown ball back', () => {
  const t = boot(9292);
  const core = rock(t.sim, T.mawDist, 0, 6, 4);
  const authoredDespawn = t.state.simTime + 500;
  core.data.despawnAt = authoredDespawn; // authored deadline — long past any flight TTL
  t.state.input.actions.gyreSnare = true;
  for (let i = 0; i < 15; i++) t.sim.step();
  assert.equal(t.sys._rt.phase, 'holding');
  release(t);
  assert.equal(t.sys._rt.phase, 'launching');
  assert.ok(t.sys._rt.launchWindup > 0 || t.sys._rt.launchLeft > 0, 'the throw is mid-flight');
  assert.equal(core.data.gyreLaunched, true, 'the ball is armed for the burst');
  assert.ok(core.physicsBody.impactDamageScale >= T.launchImpactScaleBase, 'weapon scale is live');
  // A mission owner pins the ball while the sling is still winding — the throw
  // must abort, not bowl protected cargo.
  core.data.missionPinned = true;
  t.sim.step();
  assert.equal(t.sys._rt.phase, 'off', 'the launch aborted');
  assert.equal(core.data.gyreLaunched, undefined, 'the mark sheds on hand-back');
  assert.equal(core.data.gyreLaunchMeta, undefined, 'the credit shadow sheds');
  assert.equal(core.physicsBody.impactDamageScale, undefined, 'the weapon payload disarmed');
  // The lash's own ~9 s flight stamp is NOT a foreign-owner deadline — the
  // future-only restore must see past it and resurrect the authored stash
  // instead of letting the aborted throw's TTL kill the handed-back body.
  assert.equal(core.data.despawnAt, authoredDespawn,
    `authored despawnAt restored, not the aborted flight's TTL (got ${core.data.despawnAt})`);
  assert.equal(core.data.gyrePrevDespawnAt, undefined, 'the stash consumed on restore');
  assert.ok(!t.events.some((e) => e.name === 'gyre:thrown'), 'the throw never completed');
  assert.ok(t.events.some((e) => e.name === 'gyre:dropped' && e.p.reason === 'core_adopted'),
    'drop reason is core_adopted');
});

test('an adopter that keeps despawnAt still retires the marked ball on its own TTL', () => {
  const t = boot(9393);
  const primary = rock(t.sim, T.mawDist, 0, 6, 4);
  const kept = rock(t.sim, T.mawDist + 40, 0, 6, 4);
  // A foreign owner adopts the second ball but LEAVES its deadline — the lash's
  // marks ride it to that TTL, then the quiet lane disarms + sheds the shadow.
  kept.data.gyreLaunched = true;
  kept.data.gyreLaunchMeta = { mass: 6, members: [{ type: 'asteroid', radius: 4 }], clumpRadius: 6 };
  kept.physicsBody.impactDamageScale = 8;
  kept.data.gyrePrevImpactScale = 1.5;
  primary.data.gyreLaunched = true;
  primary.data.despawnAt = t.state.simTime + 9;
  t.sys._rt.ballId = primary.id;
  t.sys._rt.launchedId = primary.id;
  t.sys._rt.ballIds.push(primary.id, kept.id);
  t.sys._rt.ballMass = 6; t.sys._rt.ballClumpRadius = 6;
  // ~1.2 ticks of deadline: survives step 1 (pub doesn't exist yet — the sweep
  // early-returns on the literal first update), expires by step 2's sweep while
  // the ball is still alive, so the quiet-TTL lane fires with a live body.
  kept.data.despawnAt = t.state.simTime + 0.02;
  t.sim.step();
  t.sim.step();
  assert.ok(kept.data.gyreLaunched, 'the mark rides to its own TTL (adopter contract)');
  assert.equal(kept.data.gyreLaunchMeta, undefined, 'the credit shadow shed on retire');
  assert.equal(kept.physicsBody.impactDamageScale, 1.5, 'the authored scale restored');
  assert.equal(kept.data.gyrePrevImpactScale, undefined, 'the stash consumed');
  assert.ok(!t.sys._rt.ballIds.includes(kept.id), 'the retired ball left the watch list');
});
